module.exports = {
  async beforeCreate(event) {
    const { params, state } = event;
    if (state.auth) {
      params.data.user = state.auth.credentials.id; // Assign logged-in user ID
    }
  },
};


