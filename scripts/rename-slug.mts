// One-time utility: rename an archive entry's slug (updates index + moves posts key).
// Usage:
//   npx tsx --env-file=.env.local scripts/rename-slug.mts <old-slug> <new-slug>
//   npx tsx --env-file=.env.local scripts/rename-slug.mts <old-slug> <new-slug> --write

import { getArchiveIndex, getArchivePosts, setArchivePosts } from '../lib/kv.js';

const [oldSlug, newSlug] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const WRITE = process.argv.includes('--write');

if (!oldSlug || !newSlug) {
  console.error('Usage: rename-slug.mts <old-slug> <new-slug> [--write]');
  process.exit(1);
}

const index = await getArchiveIndex();
const entry = index.find(e => e.slug === oldSlug);
if (!entry) {
  console.error(`No archive entry found with slug "${oldSlug}".`);
  process.exit(1);
}
if (index.some(e => e.slug === newSlug)) {
  console.error(`Slug "${newSlug}" already exists — aborting to avoid collision.`);
  process.exit(1);
}

const posts = await getArchivePosts(oldSlug);
console.log(`Old slug : ${oldSlug}`);
console.log(`New slug : ${newSlug}`);
console.log(`Posts    : ${posts?.length ?? 0}`);
console.log(`Label    : ${entry.label}`);
console.log(`Title    : ${entry.metadata?.meetingTitle ?? '(none)'}`);

if (!WRITE) {
  console.log('\n(Dry run — pass --write to apply.)');
  process.exit(0);
}

const { kv } = await import('@vercel/kv');

// 1. Write posts under the new key
await setArchivePosts(newSlug, posts ?? []);

// 2. Update the index entry's slug (and any metadata urls that reference the slug, if any)
const updatedIndex = index.map(e => e.slug === oldSlug ? { ...e, slug: newSlug } : e);
await kv.set('archive:index', JSON.stringify(updatedIndex));

// 3. Delete the old posts key
await kv.del(`archive:posts:${oldSlug}`);

console.log('\nDone. Verify at /' + newSlug);
