const PREFIX = 'chw-lastread-';

export function getLastRead(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

// Only updates if the new timestamp is strictly newer than what's stored.
export function setLastRead(key: string, indexedAt: string): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(Date.parse(indexedAt))) return;
  try {
    const current = getLastRead(key);
    if (!current || Date.parse(indexedAt) > Date.parse(current)) {
      localStorage.setItem(PREFIX + key, indexedAt);
    }
  } catch {
    // Reading coverage must still work when browser storage is unavailable.
  }
}

export function markAllRead(key: string, posts: { indexedAt: string }[]): void {
  if (!posts.length) return;
  const newest = posts.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b));
  setLastRead(key, newest.indexedAt);
}
