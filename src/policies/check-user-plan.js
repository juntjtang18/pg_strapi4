// ./src/policies/check-user-plan.js

'use strict';

const { ForbiddenError } = require('@strapi/utils').errors;

/**
 * `check-user-plan` policy
 */
module.exports = (policyContext, config, { strapi }) => {
  // Start of the policy check
  console.log('--- Running check-user-plan policy ---');

  const user = policyContext.state.user;

  // 1. Log the entire user object from the policy context.
  // This is the most important log. It shows us everything Strapi knows about the user.
  console.log('User object from context:', JSON.stringify(user, null, 2));

  if (!user) {
    console.log('POLICY FAILED: No user found in context.');
    return false;
  }

  // 2. Define the allowed roles.
  const allowedRoles = ['basicplan', 'proplan', 'editor', 'Authenticated', 'admin'];
  //console.log('Allowed roles:', allowedRoles);

  // 3. Log the user's role name directly for an easy comparison.
  // We use optional chaining (?.) in case `user.role` doesn't exist.
  const userRoleName = user.role?.name;
  //console.log(`User's role name: "${userRoleName}"`);

  // 4. Check if the user's role is in the allowed list and log the result.
  const hasPermission = user.role && allowedRoles.includes(user.role.name);
  //console.log(`Permission check (does user have an allowed role?): ${hasPermission}`);

  if (hasPermission) {
    // If the user's role is in the allowed list, grant access.
    //console.log('POLICY PASSED: Access granted.');
    //console.log('--------------------------------------\n');
    return true;
  } else {
    // If the user does not have the required role, block access.
    //console.log('POLICY FAILED: User role is not in the allowed list.');
    //console.log('--------------------------------------\n');
    throw new ForbiddenError('You do not have the required plan to perform this action.');
  }
};