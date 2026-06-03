import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveHandle } from '@/lib/bluesky';
import type { BlueskyPost } from '@/lib/bluesky';
import { councilDateSet, getMeetingForDate } from '@/lib/councilDates';
import { getArchiveIndex } from '@/lib/kv';

const MATT_HANDLE = 'graphicmatt.com';
const MAX_PAGES = 50;

export interface CandidateThread {
  rootUri: string;
  rootUrl: string;
  meetingKey: string;
  meetingLabel: string;
  date: string;
  indexedAt: string;
  previewText: string;
  alreadyArchived: boolean;
}

// POST: scan Matt's Bluesky feed for root posts that land on council meeting dates.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST(request: NextRequest) {
  let since = '2023-01-01';
  let until = new Date().toISOString().substring(0, 10);
  try {
    const body = await request.json().catch(() => ({}));
    if (body.since) since = body.since;
    if (body.until) until = body.until;
  } catch { /* ignore */ }

  const sinceMs = new Date(since + 'T00:00:00Z').getTime();
  const untilMs = new Date(until + 'T23:59:59Z').getTime();

  const authorDid = await resolveHandle(MATT_HANDLE);
  const meetingDates = councilDateSet();
  const archiveIndex = await getArchiveIndex();

  // Build set of already-archived dates
  const archivedDates = new Set(archiveIndex.map(e => e.startedAt.substring(0, 10)));

  const candidates: CandidateThread[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let truncated = false;

  while (pages < MAX_PAGES) {
    const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
    url.searchParams.set('actor', authorDid);
    url.searchParams.set('limit', '100');
    url.searchParams.set('filter', 'posts_no_replies');
    if (cursor) url.searchParams.set('cursor', cursor);

    const r = await fetch(url.toString());
    if (!r.ok) {
      return NextResponse.json({ error: `Bluesky API error: ${r.status}` }, { status: 502 });
    }
    const data = await r.json();

    let reachedSince = false;

    for (const item of (data.feed ?? []) as { post: BlueskyPost }[]) {
      const post = item.post;
      if (!post?.indexedAt) continue;

      const postMs = new Date(post.indexedAt).getTime();

      // Stop scanning when we've passed the 'since' date
      if (postMs < sinceMs) {
        reachedSince = true;
        break;
      }

      // Skip posts outside the until range
      if (postMs > untilMs) continue;

      // Only Matt's own root posts — skip reposts of other authors and replies
      if (post.author?.did !== authorDid) continue;
      if (post.record?.reply) continue;

      const torontoDate = toTorontoDate(new Date(post.indexedAt));
      if (!meetingDates.has(torontoDate)) continue;

      const meeting = getMeetingForDate(torontoDate);
      if (!meeting) continue;

      const rkey = post.uri.split('/').pop()!;
      const rootUrl = `https://bsky.app/profile/${MATT_HANDLE}/post/${rkey}`;
      const meetingKey = `${meeting.term}||${meeting.mtgNum}`;

      const newCandidate: CandidateThread = {
        rootUri: post.uri,
        rootUrl,
        meetingKey,
        meetingLabel: meeting.meetingLabel,
        date: torontoDate,
        indexedAt: post.indexedAt,
        previewText: post.record.text.substring(0, 100),
        alreadyArchived: meeting.dates.some(d => archivedDates.has(d)),
      };

      // Coverage threads always start on day 1 of a meeting. If we already have a
      // candidate for this meeting (found earlier in the newest-first scan), keep
      // whichever post is older — that's more likely to be the actual thread start.
      const existingIdx = candidates.findIndex(c => c.meetingKey === meetingKey);
      if (existingIdx >= 0) {
        if (new Date(post.indexedAt).getTime() < new Date(candidates[existingIdx]!.indexedAt).getTime()) {
          candidates[existingIdx] = newCandidate;
        }
      } else {
        candidates.push(newCandidate);
      }
    }

    if (reachedSince || !data.cursor) break;

    cursor = data.cursor;
    pages++;

    if (pages >= MAX_PAGES) {
      truncated = true;
    }
  }

  // Sort by date ascending
  candidates.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ candidates, truncated });
}

function toTorontoDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}
