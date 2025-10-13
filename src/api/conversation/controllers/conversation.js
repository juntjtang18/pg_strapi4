'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const axios = require('axios');

// --- Simple, tunable bits ---
const MAX_HISTORY = 10;                // how many messages we keep in DB
const CONTEXT_TAKE = 4;                // how many recent messages to send
const MAX_REPLY_TOKENS = 220;          // smaller cap -> shorter responses
const DEFAULT_MODEL = 'gpt-3.5-turbo'; // safe default
const REPLY_WORD_CAP = 120;            // hard word cap after model responds
const SESSION_IDLE_MIN = 45;           // create a new session if last_at is older than this (minutes)

function truncateToWords(text, maxWords) {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ') + '…';
}

// Optional: a light model allowlist to avoid random model names
const MODEL_ALLOW = new Set(['gpt-3.5-turbo', 'gpt-4o-mini']);

// --- (Optional helper, currently unused in chat) ---
const MAX_SUMMARY_TOKENS = 180;       // compact summary budget
const SUMMARY_WORD_CAP = 120;         // hard cap for notes paragraph

function flattenTurnsToText(turns) {
  return (turns || [])
    .map(t => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n')
    .slice(0, 8000); // safety guard
}

// Summarize overflow into summary.notes (returns { notes, usage } or null on failure)
async function rollupOverflowToNotes({ session, overflowTurns, modelToUse, axiosInstance, headers }) {
  if (!overflowTurns?.length) return null;

  const overflowText = flattenTurnsToText(overflowTurns);
  const existingNotes = session.summary?.notes || '';

  const SYSTEM = [
    'You summarize prior conversation turns for a parenting assistant.',
    'Capture durable facts about the family/kids, preferences/constraints, key decisions, and next steps.',
    `Return a single compact paragraph ≤ ${SUMMARY_WORD_CAP} words. Plain text. No bullets.`,
  ].join(' ');

  const USER = [
    'Summarize these prior turns and subsume the existing notes without duplications.',
    'If there is nothing durable, return the existing notes unchanged.',
    '',
    'TURNS:',
    overflowText,
    '',
    'Existing notes:',
    existingNotes || '(none)',
  ].join('\n');

  try {
    const resp = await axiosInstance.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: modelToUse,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: USER },
        ],
        temperature: 0.2,
        max_tokens: MAX_SUMMARY_TOKENS,
      },
      { headers }
    );

    const content = resp.data?.choices?.[0]?.message?.content?.trim();
    const usage = resp.data?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    if (!content) return null;
    return { notes: content, usage };
  } catch (err) {
    // Don’t break chat if summarization fails
    strapi.log.warn('Summary rollup failed', {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });
    return null;
  }
}

module.exports = createCoreController('api::conversation.conversation', ({ strapi }) => ({

  // POST /ai/sessions
  async createSession(ctx) {
    try {
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];
      const { id: userId } = await strapi
        .plugin('users-permissions')
        .service('jwt')
        .verify(token);
      if (!userId) return ctx.unauthorized('Invalid token.');

      const { v4: uuidv4 } = require('uuid');
      const { model } = ctx.request.body || {};
      const now = new Date();

      const convo = await strapi.entityService.create('api::conversation.conversation', {
        data: {
          session_id: uuidv4(), // uid
          user: userId,
          started_at: now,
          last_at: now,
          model: model || DEFAULT_MODEL,
          summary: { facts: [], goals: [], prefs: [], open_items: [], notes: '' },
          last_msgs: [],
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          status: 'open',
        },
      });

      ctx.body = this.transformResponse(convo, { meta: {} });
    } catch (err) {
      strapi.log.error('Error creating AI session:', err);
      return ctx.internalServerError('Unable to create session');
    }
  },

  // GET /ai/sessions
  async listSessions(ctx) {
    try {
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];
      const { id: userId } = await strapi
        .plugin('users-permissions')
        .service('jwt')
        .verify(token);
      if (!userId) return ctx.unauthorized('Invalid token.');

      const q = ctx.query || {};
      const p = q.pagination || {};
      const page = Math.max(1, Number(p.page ?? 1));
      const pageSizeRaw = Number(p.pageSize ?? 10);
      const pageSize = Math.min(Math.max(1, pageSizeRaw), 100);
      const start = (page - 1) * pageSize;
      const limit = pageSize;

      const filters = { user: userId };
      const sort = { last_at: 'desc' };

      const [sessions, total] = await Promise.all([
        strapi.entityService.findMany('api::conversation.conversation', { filters, sort, start, limit }),
        strapi.entityService.count('api::conversation.conversation', { filters }),
      ]);

      const pageCount = Math.max(1, Math.ceil(total / pageSize));

      ctx.body = this.transformResponse(sessions, {
        pagination: { page, pageSize, pageCount, total },
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      strapi.log.error('Error listing AI sessions:', err);
      return ctx.internalServerError('Unable to list sessions');
    }
  },

  // GET /ai/sessions/:session_id
  async getSession(ctx) {
    try {
      const authHeader = ctx.request.header.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.unauthorized('Missing or invalid authorization header.');
      }
      const token = authHeader.split(' ')[1];
      const { id: userId } = await strapi
        .plugin('users-permissions')
        .service('jwt')
        .verify(token);
      if (!userId) return ctx.unauthorized('Invalid token.');

      const { session_id } = ctx.params;
      if (!session_id) return ctx.badRequest('session_id is required.');

      const sessions = await strapi.entityService.findMany('api::conversation.conversation', {
        filters: { user: userId, session_id },
        limit: 1,
      });

      if (!sessions || sessions.length === 0) {
        return ctx.notFound('Session not found.');
      }

      ctx.body = this.transformResponse(sessions[0], { meta: {} });
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return ctx.unauthorized('Invalid or expired token.');
      }
      strapi.log.error('Error fetching AI session:', err);
      return ctx.internalServerError('Unable to fetch session');
    }
  },

  /**
   * POST /ai/sessions/:session_id/chat
   * Body: { message: string, temperature?: number, word_cap?: number, bullets?: number, language?: string, model?: string, return_history?: boolean }
   * Behavior: includes small recent history in prompt, calls OpenAI, saves reply & usage.
   * Also auto-creates a new session if the current/latest is idle for >= SESSION_IDLE_MIN.
   */
    // POST /ai/chat  and  /ai/sessions/:session_id/chat
    async chat(ctx) {
        // --- Auth ---
        const authHeader = ctx.request.header.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return ctx.unauthorized('Missing or invalid authorization header.');
        }
        if (!process.env.OPENAI_API_KEY) {
            strapi.log.error('OPENAI_API_KEY is not set.');
            return ctx.internalServerError('Server misconfiguration: OPENAI_API_KEY missing.');
        }

        let userId;
        try {
            const payload = await strapi.plugin('users-permissions').service('jwt').verify(authHeader.split(' ')[1]);
            userId = payload?.id;
        } catch {
            return ctx.unauthorized('Invalid or expired token.');
        }
        if (!userId) return ctx.unauthorized('Invalid token.');

        // --- Params & body ---
        const { session_id } = ctx.params || {};
        const { message, temperature, word_cap, language, model } = ctx.request.body || {};
        if (!message || typeof message !== 'string') {
            return ctx.badRequest('Missing user "message".');
        }

        // Optional: include history flag (for debugging/clients that want it)
        const includeHistory =
            String(ctx.query?.include_history).toLowerCase() === 'true' ||
            ctx.request.body?.return_history === true;

        // --- Load or auto-create session (idle switch) ---
        const { v4: uuidv4 } = require('uuid');
        const now = new Date();
        const SESSION_IDLE_MIN = 45;

        const findLatestOpen = async () => {
            const [last] = await strapi.entityService.findMany('api::conversation.conversation', {
            filters: { user: userId, status: 'open' },
            sort: { last_at: 'desc' },
            limit: 1,
            });
            return last || null;
        };

        let [session] = await strapi.entityService.findMany('api::conversation.conversation', {
            filters: session_id ? { user: userId, session_id } : { id: -1 }, // harmless miss if none
            limit: 1,
        });
        if (!session) session = await findLatestOpen();

        const needNewSession = () => {
            if (!session) return true;
            const lastAt = new Date(session.last_at || session.started_at || 0);
            const diffMin = (now - lastAt) / 60000;
            return diffMin >= SESSION_IDLE_MIN;
        };

        if (needNewSession()) {
            session = await strapi.entityService.create('api::conversation.conversation', {
            data: {
                session_id: uuidv4(),
                user: userId,
                started_at: now,
                last_at: now,
                model: session?.model || 'gpt-3.5-turbo',
                summary: { facts: [], goals: [], prefs: [], open_items: [], notes: '' },
                last_msgs: [],
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                status: 'open',
            },
            });
        }

        // ---- Effective settings ----
        const DEFAULT_MODEL = 'gpt-3.5-turbo';
        const MODEL_ALLOW = new Set(['gpt-3.5-turbo', 'gpt-4o-mini']);
        const MAX_REPLY_TOKENS = 220;
        const MAX_HISTORY = 10;
        const CONTEXT_TAKE = 4;
        const REPLY_WORD_CAP_DEFAULT = 120;

        const effWordCap = Math.max(60, Math.min(Number(word_cap ?? REPLY_WORD_CAP_DEFAULT), 200)); // 60–200
        const langHint = typeof language === 'string' && language.trim().length <= 10 ? language.trim() : null;

        const dynamicMaxTokens = Math.min(
            MAX_REPLY_TOKENS,
            Math.max(80, Math.ceil(effWordCap * 1.6) + 20)
        );

        const candidateModel = (typeof model === 'string' && MODEL_ALLOW.has(model)) ? model : session.model;
        const modelToUse = MODEL_ALLOW.has(candidateModel) ? candidateModel : DEFAULT_MODEL;

        // ---- Build prompt (small history) ----
        const recent = Array.isArray(session.last_msgs) ? session.last_msgs.slice(-CONTEXT_TAKE) : [];

        // Natural, warm style. No bullets unless user explicitly asks.
        const SYSTEM_STYLE_LINES = [
            'You are a warm, concise parenting assistant.',
            `Write in short, natural sentences and compact paragraphs (max ${effWordCap} words).`,
            'Do not use markdown formatting (no **bold**, lists, or headings) unless the user explicitly asks for a list.',
            'Offer 2–4 specific steps only when the user asks for ideas/steps; otherwise prefer a single compact paragraph.',
            'Avoid long intros/outros and generic disclaimers.',
        ];
        if (langHint) SYSTEM_STYLE_LINES.push(`Respond in language code: ${langHint}.`);
        const SYSTEM_STYLE = SYSTEM_STYLE_LINES.join(' ');

        const messages = [
            { role: 'system', content: SYSTEM_STYLE },
            ...recent,
            { role: 'user', content: message },
        ];

        // --- helper: truncate by words ---
        function truncateToWords(text, maxWords) {
            if (!text) return '';
            const words = text.trim().split(/\s+/);
            if (words.length <= maxWords) return text.trim();
            return words.slice(0, maxWords).join(' ') + '…';
        }

        try {
            const aiResp = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: modelToUse,
                messages,
                temperature: typeof temperature === 'number' ? temperature : 0.4,
                max_tokens: dynamicMaxTokens,
            },
            {
                headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                },
            }
            );

            const choice = aiResp.data?.choices?.[0];
            let assistantText = choice?.message?.content || '';
            // lightweight cleanup if the model still sneaks in list markers/markdown
            assistantText = assistantText
            .replace(/^[\s*-]\s*/gm, '')     // strip leading "-" or "*" list markers
            .replace(/^\d+\.\s+/gm, '')      // strip "1. ", "2. " etc.
            .replace(/\*\*(.*?)\*\*/g, '$1') // strip bold
            .replace(/#{1,6}\s+/g, '');      // strip markdown headings

            assistantText = truncateToWords(assistantText, effWordCap);

            const usage = aiResp.data?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

            // ---- Persist history & usage ----
            const newMsgs = [
            ...(Array.isArray(session.last_msgs) ? session.last_msgs : []),
            { role: 'user', content: message },
            { role: 'assistant', content: assistantText },
            ];

            session = await strapi.entityService.update('api::conversation.conversation', session.id, {
            data: {
                last_msgs: newMsgs.slice(-MAX_HISTORY),
                last_at: new Date(),
                prompt_tokens: (session.prompt_tokens || 0) + (usage.prompt_tokens || 0),
                completion_tokens: (session.completion_tokens || 0) + (usage.completion_tokens || 0),
                total_tokens: (session.total_tokens || 0) + (usage.total_tokens || 0),
            },
            });

            // ---- Response (no meta) ----
            const attributes = {
            session_id: session.session_id,
            last_at: session.last_at,
            ...(includeHistory ? { last_msgs: session.last_msgs } : {}),
            prompt_tokens: session.prompt_tokens,
            completion_tokens: session.completion_tokens,
            total_tokens: session.total_tokens,
            reply: assistantText,
            model: modelToUse,
            // leave usage if your client needs it; safe to keep/remove
            usage,
            language: langHint || 'default',
            };

            ctx.body = { data: { id: session.id, attributes } };
        } catch (err) {
            const status = err.response?.status;
            const data = err.response?.data;
            strapi.log.error('OpenAI chat error (natural style)', { status, data, message: err.message });

            if (!status) return ctx.internalServerError('Network error reaching OpenAI.');
            if (status === 401 || status === 403) return ctx.internalServerError('OpenAI auth/permissions error.');
            if (status === 404) return ctx.internalServerError('Model not found/accessible for this key.');
            if (status === 429) return ctx.internalServerError('OpenAI rate limit or quota exceeded.');
            return ctx.internalServerError('Error during AI chat.');
        }
    }

}));
