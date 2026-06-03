import type { BlueskyPost, SessionMetadata } from './bluesky';
import { generateSlug, generateLabel } from './archive';
import { getArchiveIndex, appendArchiveEntry, setArchivePosts } from './kv';

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

  return slug;
}
