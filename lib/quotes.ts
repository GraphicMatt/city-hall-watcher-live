import type { BlueskyPost } from './bluesky';
import { decodeHtmlEntities } from './twitter';

// A candidate "quote" extracted from an archived post — text containing a
// quotation mark span long enough to carry real context. Precomputed at
// import time (and via a one-time backfill for older sessions) so the home
// page's random-quote feature can do an O(1) lookup instead of fetching and
// regex-scanning the full archive on every page load.
export interface QuoteCandidate {
  text: string;      // full decoded post text — gives attribution context
  slug: string;
  postId: string;
  indexedAt: string;
}

const QUOTE_RE = /"([^"]{25,250})"/g;

// Scans a session's posts for quote-shaped text and returns one candidate per
// matching post (first match only — avoids duplicates from multi-quote posts).
export function extractQuoteCandidates(posts: BlueskyPost[], slug: string): QuoteCandidate[] {
  const candidates: QuoteCandidate[] = [];
  for (const post of posts) {
    const text = decodeHtmlEntities(post.record?.text || '');
    QUOTE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = QUOTE_RE.exec(text)) !== null) {
      const q = match[1]!.trim();
      if (q.split(/\s+/).length >= 6) {
        candidates.push({
          text,
          slug,
          postId: post.uri.split('/').pop()!,
          indexedAt: post.indexedAt,
        });
        break;
      }
    }
  }
  return candidates;
}
