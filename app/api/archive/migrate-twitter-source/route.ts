import { NextResponse } from 'next/server';
import { getArchiveIndex, getArchivePosts, updateArchiveEntry } from '@/lib/kv';

// POST: one-time migration — backfill `importSource: 'twitter'` onto archive
// entries that contain Twitter-imported posts but predate the importSource
// field (added alongside quote-tweet card support). This lets the admin UI
// surface the "Patch quote tweets" action for older Twitter imports.
// Idempotent — already-tagged entries are skipped, safe to run repeatedly
// (e.g. once per deploy environment, since live/prod KV stores can diverge).
// Protected by proxy (POST on /api/archive/:path*).
export async function POST() {
  const index = await getArchiveIndex();
  let tagged = 0;
  let checked = 0;

  for (const entry of index) {
    if (entry.metadata?.importSource) continue; // already tagged — skip

    const posts = await getArchivePosts(entry.slug);
    if (!posts?.some(p => p.platform === 'twitter')) continue;

    checked++;
    await updateArchiveEntry(entry.slug, {
      metadata: { ...entry.metadata, importSource: 'twitter' },
    });
    tagged++;
  }

  return NextResponse.json({ ok: true, tagged, checked });
}
