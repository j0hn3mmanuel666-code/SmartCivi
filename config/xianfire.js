// config/xianfire.js

// TEMP MOCK DATABASE (so app won't crash)
export default {
  collection: () => ({
    get: async () => ({ docs: [] }) // return empty array for now
  })
};
