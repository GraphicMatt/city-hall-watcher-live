import { NextResponse } from 'next/server';
import { getArchiveIndex, getArchivePosts, setArchiveIndex } from '@/lib/kv';
import { postTimeRange } from '@/lib/archive';

// POST: reset every archive entry's startedAt/endedAt to its first/last post
// timestamp. Fixes entries archived through the live "Go live" flow before
// snapshotSession derived dates from posts — those got the click/archive time
// instead (e.g. the March 2026 meeting showing April 24). Idempotent: entries
// that already match are left alone. Pass ?dryRun=1 to preview without writing.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST(req: Request) {
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const index = await getArchiveIndex();

  const fixes = new Map<string, { startedAt: string; endedAt: string }>();
  const startChanges: { slug: string; from: string; to: string }[] = [];
  for (const entry of index) {
    const posts = await getArchivePosts(entry.slug);
    const range = posts ? postTimeRange(posts) : null;
    if (!range || (entry.startedAt === range.first && entry.endedAt === range.last)) continue;
    fixes.set(entry.slug, { startedAt: range.first, endedAt: range.last });
    if (entry.startedAt !== range.first) startChanges.push({ slug: entry.slug, from: entry.startedAt, to: range.first });
  }

  if (!dryRun && fixes.size > 0) {
    // Re-read so an archive written while we were scanning posts isn't clobbered.
    const latest = await getArchiveIndex();
    await setArchiveIndex(latest.map(e => (fixes.has(e.slug) ? { ...e, ...fixes.get(e.slug) } : e)));
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    scanned: index.length,
    updated: fixes.size,
    endedAtOnly: fixes.size - startChanges.length,
    startChanges,
  });
}
