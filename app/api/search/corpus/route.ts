import { NextResponse } from 'next/server';
import { getArchiveIndex, getArchivePosts } from '@/lib/kv';
import { decodeHtmlEntities } from '@/lib/twitter';
import type { CorpusPost } from '@/lib/search';

// Build the search corpus by fetching all archived sessions in parallel.
// Each post becomes a lightweight, searchable record — text only, no embeds.
// Cached by the CDN for 5 minutes; stale-while-revalidate extends to 1 hour.
export async function GET() {
  const index = await getArchiveIndex();

  const sessionResults = await Promise.all(
    index.map(async entry => {
      const posts = await getArchivePosts(entry.slug);
      if (!posts) return [] as CorpusPost[];
      const label = entry.metadata?.meetingTitle || entry.label;
      return posts
        .filter(p => p.record?.text?.trim())
        .map((post): CorpusPost => ({
          slug: entry.slug,
          postId: post.uri.split('/').pop()!,
          sessionLabel: label,
          sessionDate: entry.startedAt,
          indexedAt: post.indexedAt,
          // Decode HTML entities so Twitter posts with &amp; etc. search correctly
          text: decodeHtmlEntities(post.record.text),
        }));
    })
  );

  const corpus = sessionResults.flat();

  return NextResponse.json(corpus, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
