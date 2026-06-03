const PREFIX = 'chw-lastread-';

export function getLastRead(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PREFIX + key);
}

// Only updates if the new timestamp is strictly newer than what's stored.
export function setLastRead(key: string, indexedAt: string): void {
  if (typeof window === 'undefined') return;
  const current = localStorage.getItem(PREFIX + key);
  if (!current || indexedAt > current) {
    localStorage.setItem(PREFIX + key, indexedAt);
  }
}

export function markAllRead(key: string, posts: { indexedAt: string }[]): void {
  if (!posts.length) return;
  const newest = posts.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b));
  setLastRead(key, newest.indexedAt);
}
