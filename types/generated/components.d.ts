import type { Attribute, Schema } from '@strapi/strapi';

export interface CoursecontentExternalVideo extends Schema.Component {
  collectionName: 'components_coursecontent_external_videos';
  info: {
    description: '';
    displayName: 'external_video';
    icon: 'monitor';
  };
  attributes: {
    caption: Attribute.String;
    external_url: Attribute.String;
  };
}

export interface CoursecontentImage extends Schema.Component {
  collectionName: 'components_coursecontent_images';
  info: {
    displayName: 'image';
    icon: 'picture';
  };
  attributes: {
    image_file: Attribute.Media<'images'>;
  };
}

export interface CoursecontentPagebreaker extends Schema.Component {
  collectionName: 'components_coursecontent_pagebreakers';
  info: {
    displayName: 'pagebreaker';
    icon: 'file';
  };
  attributes: {
    backbutton: Attribute.Boolean & Attribute.DefaultTo<true>;
    nextbutton: Attribute.Boolean & Attribute.DefaultTo<true>;
  };
}

export interface CoursecontentQuiz extends Schema.Component {
  collectionName: 'components_coursecontent_quizzes';
  info: {
    displayName: 'quiz';
    icon: 'feather';
  };
  attributes: {
    correctAnswer: Attribute.String;
    options: Attribute.JSON;
    question: Attribute.Text;
  };
}

export interface CoursecontentText extends Schema.Component {
  collectionName: 'components_coursecontent_texts';
  info: {
    description: '';
    displayName: 'text';
  };
  attributes: {
    data: Attribute.Text & Attribute.Required;
    style: Attribute.JSON;
  };
}

export interface CoursecontentVideo extends Schema.Component {
  collectionName: 'components_coursecontent_videos';
  info: {
    description: '';
    displayName: 'video';
    icon: 'medium';
  };
  attributes: {
    thumbnail: Attribute.Media<'images'>;
    video_file: Attribute.Media<'videos'>;
  };
}

export interface DailylessonDailyLessonSelection extends Schema.Component {
  collectionName: 'components_dailylesson_daily_lesson_selections';
  info: {
    description: '';
    displayName: 'DailyLessonSelection';
    icon: 'dashboard';
  };
  attributes: {
    courses: Attribute.Relation<
      'dailylesson.daily-lesson-selection',
      'oneToMany',
      'api::course.course'
    >;
    day: Attribute.Enumeration<
      [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday'
      ]
    >;
  };
}

export interface ProfileChild extends Schema.Component {
  collectionName: 'components_profile_children';
  info: {
    displayName: 'child';
    icon: 'user';
  };
  attributes: {
    age: Attribute.Integer;
    gender: Attribute.Enumeration<['male', 'female']>;
    name: Attribute.String;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'coursecontent.external-video': CoursecontentExternalVideo;
      'coursecontent.image': CoursecontentImage;
      'coursecontent.pagebreaker': CoursecontentPagebreaker;
      'coursecontent.quiz': CoursecontentQuiz;
      'coursecontent.text': CoursecontentText;
      'coursecontent.video': CoursecontentVideo;
      'dailylesson.daily-lesson-selection': DailylessonDailyLessonSelection;
      'profile.child': ProfileChild;
    }
  }
}
