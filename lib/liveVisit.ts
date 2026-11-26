import { getLastRead } from './lastRead';

// The full AT URI includes the author, unlike the old live rkey-only key.
// Keep legacy and archive records intact; new live visits use this identity.
export function beginLiveVisit(rootUri: string): { readAt: string | null; returning: boolean } {
  const readAt = getLastRead(rootUri);
  if (typeof window === 'undefined') return { readAt, returning: false };
  try {
    const key = `chw-visited-${rootUri}`;
    const returning = localStorage.getItem(key) === '1' || readAt !== null;
    localStorage.setItem(key, '1');
    return { readAt, returning };
  } catch {
    return { readAt, returning: readAt !== null };
  }
}
