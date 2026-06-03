import type { BlueskyPost, SessionMetadata } from './bluesky';
export type { SessionMetadata } from './bluesky';
export type { VideoSegment } from './bluesky';
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
  slug: string;
  label: string;
  startedAt: string;
  endedAt: string;
  postCount: number;
  metadata?: SessionMetadata;
}

const SESSION_KEY = 'session:active';
const ARCHIVE_INDEX_KEY = 'archive:index';

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
