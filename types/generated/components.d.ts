import type { Schema, Attribute } from '@strapi/strapi';

export interface AFeatures extends Schema.Component {
  collectionName: 'components_a_features';
  info: {
    displayName: 'features';
    icon: 'check';
  };
  attributes: {
    feature: Attribute.String & Attribute.Required;
  };
}

export interface CoursecontentExternalVideo extends Schema.Component {
  collectionName: 'components_coursecontent_external_videos';
  info: {
    displayName: 'external_video';
    icon: 'monitor';
    description: '';
  };
  attributes: {
    external_url: Attribute.String;
    caption: Attribute.String;
  };
}

export interface CoursecontentImage extends Schema.Component {
  collectionName: 'components_coursecontent_images';
  info: {
    displayName: 'image';
    icon: 'picture';
  };
  attributes: {
    image_file: Attribute.Media;
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
    question: Attribute.Text;
    options: Attribute.JSON;
    correctAnswer: Attribute.String;
  };
}

export interface CoursecontentText extends Schema.Component {
  collectionName: 'components_coursecontent_texts';
  info: {
    displayName: 'text';
    description: '';
  };
  attributes: {
    data: Attribute.Text & Attribute.Required;
    style: Attribute.JSON;
  };
}

export interface CoursecontentVideo extends Schema.Component {
  collectionName: 'components_coursecontent_videos';
  info: {
    displayName: 'video';
    icon: 'medium';
    description: '';
  };
  attributes: {
    video_file: Attribute.Media;
    thumbnail: Attribute.Media;
  };
}

export interface DailylessonDailyLessonSelection extends Schema.Component {
  collectionName: 'components_dailylesson_daily_lesson_selections';
  info: {
    displayName: 'DailyLessonSelection';
    icon: 'dashboard';
    description: '';
  };
  attributes: {
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
    courses: Attribute.Relation<
      'dailylesson.daily-lesson-selection',
      'oneToMany',
      'api::course.course'
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
    name: Attribute.String;
    age: Attribute.Integer;
    gender: Attribute.Enumeration<['male', 'female']>;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'a.features': AFeatures;
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
