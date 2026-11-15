import type { BlueskyPost, SessionMetadata, MinutesVote } from './bluesky';
export type { SessionMetadata } from './bluesky';
export type { VideoSegment } from './bluesky';
import type { QuoteCandidate } from './quotes';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ActiveSession {
  rootUrl: string;
  rootUri: string;
  authorDid: string;
  startedAt: string;
  status: 'live' | 'ended';
  archivedSlug?: string;
  metadata?: SessionMetadata;
}

export interface ArchiveEntry {
  rootUri?: string;
  slug: string;
  label: string;
  startedAt: string;
  endedAt: string;
  postCount: number;
  metadata?: SessionMetadata;
}

// Small persistent values used by push delivery. Redis hashes avoid replacing
// other devices' subscriptions when two readers opt in at the same time.
interface ExpiringValue<T> { value: T; expiresAt: number | null }

export async function getStoredValue<T>(key: string): Promise<T | null> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return kv.get<T>(key);
  }
  const raw = storeGet(key);
  if (!raw) return null;
  const entry = JSON.parse(raw) as ExpiringValue<T>;
  return entry.expiresAt !== null && entry.expiresAt <= Date.now() ? null : entry.value;
}

export async function setStoredValue<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    if (ttlSeconds) await kv.set(key, value, { ex: ttlSeconds });
    else await kv.set(key, value);
    return;
  }
  storeSet(key, JSON.stringify({ value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null }));
}

export async function getStoredHash<T>(key: string): Promise<Record<string, T>> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return (await kv.hgetall<Record<string, T>>(key)) ?? {};
  }
  return (await getStoredValue<Record<string, T>>(key)) ?? {};
}

export async function getStoredHashField<T>(key: string, field: string): Promise<T | null> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return kv.hget<T>(key, field);
  }
  return (await getStoredHash<T>(key))[field] ?? null;
}

export async function setStoredHashField<T>(key: string, field: string, value: T, ttlSeconds?: number): Promise<void> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.hset(key, { [field]: value });
    if (ttlSeconds) await kv.expire(key, ttlSeconds);
    return;
  }
  // Keep the local read/modify/write synchronous, like the existing file store.
  const raw = storeGet(key);
  const entry = raw ? JSON.parse(raw) as ExpiringValue<Record<string, T>> : null;
  const fields = entry && (entry.expiresAt === null || entry.expiresAt > Date.now()) ? entry.value : {};
  fields[field] = value;
  storeSet(key, JSON.stringify({ value: fields, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null }));
}

export async function deleteStoredHashField(key: string, field: string): Promise<void> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.hdel(key, field);
    return;
  }
  const raw = storeGet(key);
  if (!raw) return;
  const entry = JSON.parse(raw) as ExpiringValue<Record<string, unknown>>;
  delete entry.value[field];
  storeSet(key, JSON.stringify(entry));
}

// Token-owned leases prevent overlapping cron runs and duplicate sends. A
// compare-and-delete must be atomic so an expired owner's cleanup is harmless.
export async function acquireLease(key: string, token: string, ttlSeconds: number): Promise<boolean> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return (await kv.set(key, token, { nx: true, ex: ttlSeconds })) === 'OK';
  }
  const raw = storeGet(key);
  if (raw) {
    const entry = JSON.parse(raw) as ExpiringValue<string>;
    if (entry.expiresAt === null || entry.expiresAt > Date.now()) return false;
  }
  storeSet(key, JSON.stringify({ value: token, expiresAt: Date.now() + ttlSeconds * 1000 }));
  return true;
}

export async function releaseLease(key: string, token: string): Promise<void> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.eval('if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end', [key], [token]);
    return;
  }
  const raw = storeGet(key);
  if (raw && (JSON.parse(raw) as ExpiringValue<string>).value === token) storeDel(key);
}

const SESSION_KEY = 'session:active';
const ARCHIVE_INDEX_KEY = 'archive:index';
const QUOTES_INDEX_KEY = 'quotes:index';

// --- Local file store (used when Vercel KV env vars are not set) ---

const STORE_PATH = join(process.cwd(), '.kv-store.json');

function readStore(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function storeGet(key: string): string | undefined {
  return readStore()[key];
}

function storeSet(key: string, value: string): void {
  const store = readStore();
  store[key] = value;
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function storeDel(key: string): void {
  const store = readStore();
  delete store[key];
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function isKvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// --- Session ---

export async function getActiveSession(): Promise<ActiveSession | null> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return kv.get<ActiveSession>(SESSION_KEY);
  }
  const raw = storeGet(SESSION_KEY);
  return raw ? (JSON.parse(raw) as ActiveSession) : null;
}

export async function setActiveSession(session: ActiveSession): Promise<void> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.set(SESSION_KEY, JSON.stringify(session));
    return;
  }
  storeSet(SESSION_KEY, JSON.stringify(session));
}

export async function endSession(): Promise<void> {
  const session = await getActiveSession();
  if (!session) return;
  await setActiveSession({ ...session, status: 'ended' });
}

export async function clearSession(): Promise<void> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.del(SESSION_KEY);
    return;
  }
  storeDel(SESSION_KEY);
}

// --- Archive index ---

export async function getArchiveIndex(): Promise<ArchiveEntry[]> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return (await kv.get<ArchiveEntry[]>(ARCHIVE_INDEX_KEY)) ?? [];
  }
  const raw = storeGet(ARCHIVE_INDEX_KEY);
  return raw ? (JSON.parse(raw) as ArchiveEntry[]) : [];
}

export async function appendArchiveEntry(entry: ArchiveEntry): Promise<void> {
  const index = await getArchiveIndex();
  // Deduplicate by slug — if a concurrent write already added this slug, replace it rather than appending
  const updated = [entry, ...index.filter(e => e.slug !== entry.slug)]; // newest first
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.set(ARCHIVE_INDEX_KEY, JSON.stringify(updated));
    return;
  }
  storeSet(ARCHIVE_INDEX_KEY, JSON.stringify(updated));
}

// --- Archive posts ---

export async function getArchivePosts(slug: string): Promise<BlueskyPost[] | null> {
  const key = `archive:posts:${slug}`;
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return kv.get<BlueskyPost[]>(key);
  }
  const raw = storeGet(key);
  return raw ? (JSON.parse(raw) as BlueskyPost[]) : null;
}

export async function setArchivePosts(slug: string, posts: BlueskyPost[]): Promise<void> {
  const key = `archive:posts:${slug}`;
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, JSON.stringify(posts));
    return;
  }
  storeSet(key, JSON.stringify(posts));
}

// --- Minutes votes (scraped from the official Council Minutes) ---
//
// Uploaded via the /admin/[slug]/votes "Match votes" tool — stored so the
// matcher can be re-run without re-uploading the scraper's JSON output.

export async function getMinutesVotes(slug: string): Promise<MinutesVote[] | null> {
  const key = `archive:votes:${slug}`;
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return kv.get<MinutesVote[]>(key);
  }
  const raw = storeGet(key);
  return raw ? (JSON.parse(raw) as MinutesVote[]) : null;
}

export async function setMinutesVotes(slug: string, votes: MinutesVote[]): Promise<void> {
  const key = `archive:votes:${slug}`;
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, JSON.stringify(votes));
    return;
  }
  storeSet(key, JSON.stringify(votes));
}

export async function updateArchiveEntry(slug: string, updates: Partial<ArchiveEntry>): Promise<void> {
  const index = await getArchiveIndex();
  const updated = index.map(e => (e.slug === slug ? { ...e, ...updates } : e));
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.set(ARCHIVE_INDEX_KEY, JSON.stringify(updated));
    return;
  }
  storeSet(ARCHIVE_INDEX_KEY, JSON.stringify(updated));
}

// --- Quotes index ---
//
// Precomputed lookup of "quote-shaped" post excerpts, used by the home page's
// random-quote feature. Built incrementally at import time (see
// importToArchive) plus a one-time backfill migration for older sessions —
// this avoids fetching and regex-scanning full session post arrays on every
// `force-dynamic` page load (previously the dominant cost on the home page).

export async function getQuotesIndex(): Promise<QuoteCandidate[]> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return (await kv.get<QuoteCandidate[]>(QUOTES_INDEX_KEY)) ?? [];
  }
  const raw = storeGet(QUOTES_INDEX_KEY);
  return raw ? (JSON.parse(raw) as QuoteCandidate[]) : [];
}

export async function setQuotesIndex(candidates: QuoteCandidate[]): Promise<void> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await kv.set(QUOTES_INDEX_KEY, JSON.stringify(candidates));
    return;
  }
  storeSet(QUOTES_INDEX_KEY, JSON.stringify(candidates));
}

// Appends newly-found candidates to the index, deduplicating by slug+postId so
// re-imports (e.g. a Twitter thread merge that replaces an existing archive)
// don't pile up duplicate entries over time.
export async function appendQuoteCandidates(newCandidates: QuoteCandidate[]): Promise<void> {
  if (newCandidates.length === 0) return;
  const existing = await getQuotesIndex();
  const seen = new Set(existing.map(c => `${c.slug}::${c.postId}`));
  const toAdd = newCandidates.filter(c => !seen.has(`${c.slug}::${c.postId}`));
  if (toAdd.length === 0) return;
  await setQuotesIndex([...existing, ...toAdd]);
}

// Renames an archive entry's slug — moves its posts to the new key and
// updates the index entry in place. Caller is responsible for checking that
// `newSlug` doesn't already exist.
export async function renameArchiveEntry(oldSlug: string, newSlug: string): Promise<void> {
  const posts = await getArchivePosts(oldSlug);
  await setArchivePosts(newSlug, posts ?? []);

  const index = await getArchiveIndex();
  const updated = index.map(e => (e.slug === oldSlug ? { ...e, slug: newSlug } : e));
  const oldPostsKey = `archive:posts:${oldSlug}`;

  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await Promise.all([
      kv.set(ARCHIVE_INDEX_KEY, JSON.stringify(updated)),
      kv.del(oldPostsKey),
    ]);
    return;
  }
  storeSet(ARCHIVE_INDEX_KEY, JSON.stringify(updated));
  storeDel(oldPostsKey);
}

export async function deleteArchiveEntry(slug: string): Promise<void> {
  // Remove from index
  const index = await getArchiveIndex();
  const updated = index.filter(e => e.slug !== slug);
  // Delete posts snapshot
  const postsKey = `archive:posts:${slug}`;
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    await Promise.all([
      kv.set(ARCHIVE_INDEX_KEY, JSON.stringify(updated)),
      kv.del(postsKey),
    ]);
    return;
  }
  storeSet(ARCHIVE_INDEX_KEY, JSON.stringify(updated));
  storeDel(postsKey);
}

// --- Expiring counters (used for login rate limiting) ---

interface LocalCounter {
  count: number;
  resetAt: number;
}

export async function getCounter(key: string): Promise<number> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    return (await kv.get<number>(key)) ?? 0;
  }
  const raw = storeGet(key);
  if (!raw) return 0;
  const c = JSON.parse(raw) as LocalCounter;
  return Date.now() < c.resetAt ? c.count : 0;
}

// Increments the counter. The window starts at the first increment and is not
// extended by later ones, so a counter always clears ttlSeconds after it began.
export async function incrementCounter(key: string, ttlSeconds: number): Promise<number> {
  if (isKvConfigured()) {
    const { kv } = await import('@vercel/kv');
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, ttlSeconds);
    return count;
  }
  const raw = storeGet(key);
  const now = Date.now();
  let c: LocalCounter = raw ? JSON.parse(raw) : { count: 0, resetAt: 0 };
  if (now >= c.resetAt) c = { count: 0, resetAt: now + ttlSeconds * 1000 };
  c.count += 1;
  storeSet(key, JSON.stringify(c));
  return c.count;
}
