const axios = require('axios');
const cheerio = require('cheerio');

// Configuration
const STRAPI_URL = 'http://localhost:8080';
const API_TOKEN = '4ce79caf486d02a1f1d56690e10edb120172038193626d7e7eec0ba7679e219dd616c1a9a6908f079576f0d73d55ffda5fe6b057c2fdf9c19017f802f735d72ca2434a62b3398b4bdea42d84a2a4aab1657a2a3616e6f70c9ac12f80428259fd86dea64d7192e05eafcd90bfc6bbce606453e2e07048d608d52840f242524e41';

// Fetch all articles from Strapi
async function fetchArticles() {
  try {
    const response = await axios.get(`${STRAPI_URL}/api/articles`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    return response.data.data;
  } catch (error) {
    console.error('Error fetching articles:', error.response?.data || error);
    throw error;
  }
}

// Extract title from content
function extractTitleFromContent(content) {
  const $ = cheerio.load(content);

  // Look for the first heading tag (h1, h2, h3, etc.)
  const heading = $('h1, h2, h3, h4, h5, h6').first();
  if (heading.length > 0) {
    return heading.text().trim();
  }

  // Fallback: Use the first <p> tag if no heading is found
  const firstParagraph = $('p').first();
  if (firstParagraph.length > 0) {
    return firstParagraph.text().trim();
  }

  // Fallback: Use the first line of raw content, stripped of HTML
  const firstLine = content.split('\n')[0].replace(/<[^>]+>/g, '').trim();
  return firstLine || 'Untitled';
}

// Update article with extracted title
async function updateArticle(articleId, title) {
  try {
    const response = await axios.put(
      `${STRAPI_URL}/api/articles/${articleId}`,
      {
        data: { title },
      },
      {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      }
    );
    console.log(`Updated article ${articleId} with title: "${title}"`);
    return response.data;
  } catch (error) {
    console.error(`Error updating article ${articleId}:`, error.response?.data || error);
  }
}

// Main migration function
async function migrateTitles() {
  try {
    console.log('Fetching articles from Strapi...');
    const articles = await fetchArticles();
    console.log(`Found ${articles.length} articles.`);

    for (const article of articles) {
      const { id, attributes } = article;
      const { content } = attributes;

      // Extract title from content (no skipping, even if title exists)
      const extractedTitle = extractTitleFromContent(content);

      // Update the article with the extracted title
      await updateArticle(id, extractedTitle);
    }

    console.log('Title migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the script
migrateTitles();