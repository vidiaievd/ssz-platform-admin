/**
 * localStorage that never throws: private windows and blocked site data make the accessor
 * fail, and a lost preference must not break the panel.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Preference is kept for this tab only.
    }
  },
};
