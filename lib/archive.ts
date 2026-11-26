import { fetchThreadPosts } from './bluesky';
import {
  getArchiveIndex,
  appendArchiveEntry,
  setArchivePosts,
  appendQuoteCandidates,
  type ActiveSession,
} from './kv';
import { extractQuoteCandidates } from './quotes';
import type { BlueskyPost } from './bluesky';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function generateSlug(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()]!.toLowerCase();
  return `${month}-${date.getDate()}-${date.getFullYear()}`;
}

export function generateLabel(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  return `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

// Earliest and latest post timestamps in a thread — the source of truth for an
// archive entry's startedAt/endedAt (which drive the date shown on /archive and
// the sort order). Returns null for an empty thread.
export function postTimeRange(posts: BlueskyPost[]): { first: string; last: string } | null {
  const times = posts.map(p => p.indexedAt).filter(Boolean).sort();
  return times.length ? { first: times[0]!, last: times[times.length - 1]! } : null;
}

export async function snapshotSession(session: ActiveSession): Promise<string> {
  const posts = await fetchThreadPosts(session.rootUri, session.authorDid);

  // Use the root post's own date, not session.startedAt (which is "when Go live was clicked").
  // This means re-importing an old thread always generates the correct historical slug.
  const rootPostDate = posts[0] ? new Date(posts[0].indexedAt) : new Date(session.startedAt);
  const baseSlug = generateSlug(rootPostDate);

  // Ensure unique slug if multiple meetings on the same date
  const index = await getArchiveIndex();
  let slug = baseSlug;
  let counter = 2;
  while (index.some(e => e.slug === slug)) {
    slug = `${baseSlug}-${counter++}`;
  }

  // Dates come from the posts, not from when Go live / archive was clicked —
  // otherwise archiving an old thread via the live flow stamps it with today's date.
  const range = postTimeRange(posts);
  const now = new Date().toISOString();

  await setArchivePosts(slug, posts);
  await appendArchiveEntry({
    slug,
    label: generateLabel(rootPostDate),
    startedAt: range?.first ?? session.startedAt,
    endedAt: range?.last ?? now,
    postCount: posts.length,
    metadata: session.metadata,
  });

  // Keep the home page's random-quote index current for live-archived sessions
  // (mirrors importToArchive), so a manual rebuild isn't needed after each meeting.
  await appendQuoteCandidates(extractQuoteCandidates(posts, slug));

  return slug;
}
