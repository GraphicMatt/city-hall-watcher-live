import { NextResponse } from 'next/server';
import { getArchiveIndex, getArchivePosts, setQuotesIndex } from '@/lib/kv';
import { extractQuoteCandidates, type QuoteCandidate } from '@/lib/quotes';

// POST: (re)build the precomputed quote-candidates index from scratch by
// scanning every archived session. One-time backfill for the ~12k posts that
// predate the index — new imports append incrementally via importToArchive.
// Does a full rebuild rather than an incremental append, so it's safe (and
// idempotent) to re-run later, e.g. if the quote-detection heuristic changes.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST() {
  const index = await getArchiveIndex();
  const allCandidates: QuoteCandidate[] = [];

  for (const entry of index) {
    const posts = await getArchivePosts(entry.slug);
    if (!posts) continue;
    allCandidates.push(...extractQuoteCandidates(posts, entry.slug));
  }

  await setQuotesIndex(allCandidates);
  return NextResponse.json({ ok: true, sessionsScanned: index.length, candidatesFound: allCandidates.length });
}
