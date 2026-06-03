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
  replyCount: number;
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

  // Phase 1: collect ALL root posts that fall on meeting dates, grouped by meeting key.
  // We defer selection so we can use a smarter signal when there are multiple candidates.
  const buckets = new Map<string, CandidateThread[]>();
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

      if (postMs < sinceMs) { reachedSince = true; break; }
      if (postMs > untilMs) continue;
      if (post.author?.did !== authorDid) continue;
      if (post.record?.reply) continue;

      const torontoDate = toTorontoDate(new Date(post.indexedAt));
      if (!meetingDates.has(torontoDate)) continue;

      const meeting = getMeetingForDate(torontoDate);
      if (!meeting) continue;

      const rkey = post.uri.split('/').pop()!;
      const rootUrl = `https://bsky.app/profile/${MATT_HANDLE}/post/${rkey}`;
      const meetingKey = `${meeting.term}||${meeting.mtgNum}`;

      const candidate: CandidateThread = {
        rootUri: post.uri,
        rootUrl,
        meetingKey,
        meetingLabel: meeting.meetingLabel,
        date: torontoDate,
        indexedAt: post.indexedAt,
        previewText: post.record.text.substring(0, 100),
        alreadyArchived: meeting.dates.some(d => archivedDates.has(d)),
        replyCount: post.replyCount ?? 0,
      };

      const bucket = buckets.get(meetingKey) ?? [];
      bucket.push(candidate);
      buckets.set(meetingKey, bucket);
    }

    if (reachedSince || !data.cursor) break;
    cursor = data.cursor;
    pages++;
    if (pages >= MAX_PAGES) truncated = true;
  }

  // Phase 2: pick the best candidate per meeting.
  // When only one post exists for a meeting, use it directly. When multiple exist
  // (e.g. a column link posted before the meeting starts), check which one Matt
  // threaded from by fetching its immediate replies — coverage threads always start
  // with Matt replying to himself, standalone posts never do.
  const candidates: CandidateThread[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      candidates.push(bucket[0]!);
      continue;
    }

    // Check each candidate: does Matt have a direct self-reply to it?
    const checks = await Promise.all(
      bucket.map(async c => ({
        candidate: c,
        isThread: await hasAuthorSelfReply(c.rootUri, authorDid),
      }))
    );

    const threads = checks.filter(x => x.isThread).map(x => x.candidate);

    if (threads.length > 0) {
      // One or more confirmed threads — pick the oldest (= Day 1 for multi-day meetings)
      candidates.push(threads.sort((a, b) => a.indexedAt.localeCompare(b.indexedAt))[0]!);
    } else {
      // No self-reply found (e.g. very short or empty thread) — fall back to oldest
      candidates.push(bucket.sort((a, b) => a.indexedAt.localeCompare(b.indexedAt))[0]!);
    }
  }

  // Sort final list by date ascending
  candidates.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ candidates, truncated });
}

// Fetch the immediate replies to a post and check if any come from the same author.
// Matt always begins a coverage thread by replying to himself; standalone posts he
// never threads from, so a self-reply is a reliable coverage-thread signal.
async function hasAuthorSelfReply(postUri: string, authorDid: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=1&parentHeight=0`
    );
    if (!r.ok) return false;
    const data = await r.json();
    const replies: Array<{ post?: { author?: { did?: string } } }> = data.thread?.replies ?? [];
    return replies.some(reply => reply.post?.author?.did === authorDid);
  } catch {
    return false;
  }
}

function toTorontoDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}
