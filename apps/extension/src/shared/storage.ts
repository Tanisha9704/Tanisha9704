/** Tiny promise-based wrapper around chrome.storage.local. */
export const storage = {
  async get(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (items) => resolve((items[key] as string) ?? null));
    });
  },
  async set(key: string, value: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  },
  async remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], () => resolve());
    });
  },
};
