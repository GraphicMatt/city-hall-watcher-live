import { fetchThreadPosts } from './bluesky';
import {
  getArchiveIndex,
  appendArchiveEntry,
  setArchivePosts,
  type ActiveSession,
} from './kv';

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

export async function snapshotSession(session: ActiveSession): Promise<string> {
  const posts = await fetchThreadPosts(session.rootUri, session.authorDid);

  const startDate = new Date(session.startedAt);
  const baseSlug = generateSlug(startDate);

  // Ensure unique slug if multiple meetings on the same date
  const index = await getArchiveIndex();
  let slug = baseSlug;
  let counter = 2;
  while (index.some(e => e.slug === slug)) {
    slug = `${baseSlug}-${counter++}`;
  }

  await setArchivePosts(slug, posts);
  await appendArchiveEntry({
    slug,
    label: generateLabel(startDate),
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    postCount: posts.length,
  });

  return slug;
}
