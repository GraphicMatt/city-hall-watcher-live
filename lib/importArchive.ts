import type { BlueskyPost, SessionMetadata } from './bluesky';
import { generateSlug, generateLabel } from './archive';
import { getArchiveIndex, appendArchiveEntry, setArchivePosts, appendQuoteCandidates } from './kv';
import { extractQuoteCandidates } from './quotes';

export async function importToArchive(opts: {
  posts: BlueskyPost[];
  date: Date;
  meetingTitle?: string;
  metadata?: Partial<SessionMetadata>;
}): Promise<string> {
  const { posts, date, meetingTitle, metadata } = opts;

  const baseSlug = generateSlug(date);
  const index = await getArchiveIndex();

  let slug = baseSlug;
  let counter = 2;
  while (index.some(e => e.slug === slug)) {
    slug = `${baseSlug}-${counter++}`;
  }

  const now = new Date().toISOString();
  const firstPostTime = posts[0]?.indexedAt ?? now;
  const lastPostTime = posts[posts.length - 1]?.indexedAt ?? now;

  await setArchivePosts(slug, posts);
  await appendArchiveEntry({
    slug,
    label: generateLabel(date),
    startedAt: firstPostTime,
    endedAt: lastPostTime,
    postCount: posts.length,
    metadata: {
      ...metadata,
      ...(meetingTitle ? { meetingTitle } : {}),
    },
  });

  // Append this session's quote-shaped posts to the precomputed quotes index
  // (powers the home page's random-quote feature without a live archive scan).
  await appendQuoteCandidates(extractQuoteCandidates(posts, slug));

  return slug;
}
