import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadCouncilMeetings, getMeetingByKey } from '@/lib/councilDates';
import { buildTwitterThreads, parseTwitterDate } from '@/lib/twitter';
import type { ProcessedTweet } from '@/lib/twitter';
import { getArchiveIndex } from '@/lib/kv';

// POST: parse council-tweets.json, match to council meeting dates, return proposed threads.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST(request: NextRequest) {
  let term: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    term = body.term;
  } catch { /* ignore */ }

  // Load preprocessed tweets
  const tweetsPath = join(process.cwd(), 'data', 'council-tweets.json');
  let allTweets: ProcessedTweet[];
  try {
    allTweets = JSON.parse(readFileSync(tweetsPath, 'utf-8')) as ProcessedTweet[];
  } catch {
    return NextResponse.json(
      { error: 'council-tweets.json not found. Run scripts/preprocess-tweets.ts first.' },
      { status: 500 }
    );
  }

  const meetings = loadCouncilMeetings();
  const archiveIndex = await getArchiveIndex();

  // Build a lookup of dates already in the archive (by matching first day)
  const archivedDates = new Set(
    archiveIndex.map(e => e.startedAt.substring(0, 10))
  );

  // Filter meetings by term if provided
  const targetMeetings = term ? meetings.filter(m => m.term === term) : meetings;

  // Build a date → meeting map for quick tweet lookup
  const dateToMeetingKey = new Map<string, string>();
  for (const m of targetMeetings) {
    for (const d of m.dates) {
      dateToMeetingKey.set(d, `${m.term}||${m.mtgNum}`);
    }
  }

  // Group tweets by meeting key using Eastern time for date comparison
  const tweetsByMeeting = new Map<string, ProcessedTweet[]>();
  for (const tweet of allTweets) {
    const easternDate = toEasternDate(parseTwitterDate(tweet.created_at));
    const meetingKey = dateToMeetingKey.get(easternDate);
    if (!meetingKey) continue;
    if (!tweetsByMeeting.has(meetingKey)) {
      tweetsByMeeting.set(meetingKey, []);
    }
    tweetsByMeeting.get(meetingKey)!.push(tweet);
  }

  const proposals = [];
  for (const [meetingKey, meetingTweets] of tweetsByMeeting) {
    const meeting = getMeetingByKey(meetingKey);
    if (!meeting) continue;

    // Sort chronologically before building threads
    meetingTweets.sort(
      (a, b) => parseTwitterDate(a.created_at).getTime() - parseTwitterDate(b.created_at).getTime()
    );

    const threadMap = buildTwitterThreads(meetingTweets);
    const threadEntries = Array.from(threadMap.entries());

    // Pre-thread era (pre-2017): if every "thread" is a single standalone tweet with
    // no reply chains, merge them all into one chronological thread. In the thread era,
    // at least one chain will have multiple tweets, so the merge is skipped.
    const hasChain = threadEntries.some(([, chain]) => chain.length > 1);
    let threads;
    if (!hasChain && threadEntries.length > 1) {
      const allTweets = threadEntries
        .flatMap(([, chain]) => chain)
        .sort((a, b) => parseTwitterDate(a.created_at).getTime() - parseTwitterDate(b.created_at).getTime());
      threads = [{
        rootTweetId: allTweets[0]!.id_str,
        rootText: allTweets[0]!.full_text.substring(0, 100),
        rootDate: parseTwitterDate(allTweets[0]!.created_at).toISOString(),
        tweetCount: allTweets.length,
        tweets: allTweets,
      }];
    } else {
      threads = threadEntries.map(([rootId, chain]) => ({
        rootTweetId: rootId,
        rootText: chain[0]?.full_text.substring(0, 100) ?? '',
        rootDate: parseTwitterDate(chain[0]!.created_at).toISOString(),
        tweetCount: chain.length,
        tweets: chain,
      }));
      threads.sort((a, b) => a.rootDate.localeCompare(b.rootDate));
    }

    const alreadyArchived = meeting.dates.some(d => archivedDates.has(d));

    proposals.push({
      meetingKey,
      meetingLabel: meeting.meetingLabel,
      dates: meeting.dates,
      alreadyArchived,
      threads,
    });
  }

  // Sort by earliest date
  proposals.sort((a, b) => (a.dates[0] ?? '') < (b.dates[0] ?? '') ? -1 : 1);

  return NextResponse.json({ proposals });
}

// Convert UTC Date to YYYY-MM-DD string in Eastern time (handles EST/EDT)
function toEasternDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}
