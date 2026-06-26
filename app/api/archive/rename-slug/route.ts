import { NextResponse } from 'next/server';
import { getArchiveIndex, getArchivePosts, renameArchiveEntry } from '@/lib/kv';

// POST: renames an archive entry's slug — moves its posts to the new KV key
// and updates the index entry in place. Used for one-off fixes (e.g. a
// session re-captured under a "-2" slug after a bug forced a delete/redo).
// Protected by proxy (POST on /api/archive/:path*).
export async function POST(request: Request) {
  const { oldSlug, newSlug } = await request.json();

  if (!oldSlug || !newSlug || typeof oldSlug !== 'string' || typeof newSlug !== 'string') {
    return NextResponse.json({ ok: false, error: 'oldSlug and newSlug are required.' }, { status: 400 });
  }

  const index = await getArchiveIndex();
  const entry = index.find(e => e.slug === oldSlug);
  if (!entry) {
    return NextResponse.json({ ok: false, error: `No archive entry found with slug "${oldSlug}".` }, { status: 404 });
  }
  if (index.some(e => e.slug === newSlug)) {
    return NextResponse.json({ ok: false, error: `Slug "${newSlug}" already exists.` }, { status: 409 });
  }

  const posts = await getArchivePosts(oldSlug);
  await renameArchiveEntry(oldSlug, newSlug);

  return NextResponse.json({ ok: true, oldSlug, newSlug, postCount: posts?.length ?? 0 });
}
