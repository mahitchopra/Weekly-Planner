// Browser persistence backed by localStorage.
// Kept async + { value } shaped so the app code reads/writes uniformly.
export const store = {
  async get(key) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? null : { value: v };
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { value };
    } catch (e) {
      return null;
    }
  },
};
