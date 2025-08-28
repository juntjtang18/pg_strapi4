'use strict';

const crypto = require('crypto');
const uuidv4 = crypto.randomUUID ? () => crypto.randomUUID() : require('uuid').v4;

/**
 * Script to add a unique 'unit_uuid' to all 'coursecontent.pagebreaker' components.
 * * To run:
 * yarn strapi console -- --run scripts/add-uuids-to-courses.js
 * or
 * npm run strapi console -- --run scripts/add-uuids-to-courses.js
 */
const PAGEBREAKER_COMPONENT = 'coursecontent.pagebreaker';

async function main() {
  console.log('Starting script to add UUIDs to course pagebreakers...');

  try {
    // Fetch all courses, only populating the content dynamic zone
    const courses = await strapi.entityService.findMany('api::course.course', {
      populate: ['content'],
    });

    if (!courses || courses.length === 0) {
      console.log('No courses found.');
      return;
    }

    console.log(`Found ${courses.length} courses to process.`);

    for (const course of courses) {
      let changesMade = false;
      const originalContent = course.content || [];
      const newContent = [...originalContent];

      for (const item of newContent) {
        if (item.__component === PAGEBREAKER_COMPONENT) {
          if (!item.unit_uuid) {
            item.unit_uuid = uuidv4();
            changesMade = true;
            console.log(`  > Added new UUID for pagebreaker in course ID ${course.id}`);
          }
        }
      }

      if (changesMade) {
        // Use entityService.update to persist the changes
        await strapi.entityService.update('api::course.course', course.id, {
          data: { content: newContent },
        });
        console.log(`  ✅ Successfully updated course ID ${course.id}`);
      } else {
        console.log(`  > No changes needed for course ID ${course.id}`);
      }
    }

    console.log('\nScript finished successfully.');
  } catch (error) {
    console.error('An error occurred during the script execution:', error);
  }
}

module.exports = main;