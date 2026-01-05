import type { Schema, Attribute } from '@strapi/strapi';

export interface AAnswer extends Schema.Component {
  collectionName: 'components_a_answers';
  info: {
    displayName: 'answer';
    icon: 'bulletList';
  };
  attributes: {
    ans_id: Attribute.String & Attribute.Required;
    ans_text: Attribute.String & Attribute.Required;
  };
}

export interface AAvailabilityslot extends Schema.Component {
  collectionName: 'components_a_availabilityslots';
  info: {
    displayName: 'availabilityslot';
    icon: 'calendar';
  };
  attributes: {
    dayofweek: Attribute.Enumeration<
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
    starttime: Attribute.Time;
    endtime: Attribute.Time;
    notes: Attribute.String;
  };
}

export interface ACoursePick extends Schema.Component {
  collectionName: 'components_a_course_picks';
  info: {
    displayName: 'course-pick';
    icon: 'database';
  };
  attributes: {
    course: Attribute.Relation<
      'a.course-pick',
      'oneToOne',
      'api::course.course'
    >;
    rank: Attribute.Integer;
  };
}

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

export interface AKidInfo extends Schema.Component {
  collectionName: 'components_a_kid_infos';
  info: {
    displayName: 'kid-info';
  };
  attributes: {
    lastname: Attribute.String;
    firstname: Attribute.String;
    birthday: Attribute.Date;
    hobbytags: Attribute.String;
  };
}

export interface AParentInfo extends Schema.Component {
  collectionName: 'components_a_parent_infos';
  info: {
    displayName: 'parent-info';
    icon: 'bulletList';
  };
  attributes: {
    lastname: Attribute.String;
    firstname: Attribute.String;
    birthday: Attribute.Date;
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
    description: '';
  };
  attributes: {
    backbutton: Attribute.Boolean & Attribute.DefaultTo<true>;
    nextbutton: Attribute.Boolean & Attribute.DefaultTo<true>;
    unit_uuid: Attribute.String;
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
      'a.answer': AAnswer;
      'a.availabilityslot': AAvailabilityslot;
      'a.course-pick': ACoursePick;
      'a.features': AFeatures;
      'a.kid-info': AKidInfo;
      'a.parent-info': AParentInfo;
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
