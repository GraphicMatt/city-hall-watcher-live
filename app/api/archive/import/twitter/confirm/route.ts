import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getMeetingByKey } from '@/lib/councilDates';
import { normalizeTwitterPost, parseTwitterDate, detectQuoteTweetUrl, fetchQuotedPost } from '@/lib/twitter';
import type { ProcessedTweet } from '@/lib/twitter';
import { importToArchive } from '@/lib/importArchive';
import type { SessionMetadata } from '@/lib/kv';

interface ConfirmBody {
  meetingKey: string;
  tweets: ProcessedTweet[];
  metadata?: Partial<SessionMetadata>;
}

// POST: normalize and save a confirmed Twitter thread to the archive.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST(request: NextRequest) {
  let body: ConfirmBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { meetingKey, tweets, metadata } = body;
  if (!meetingKey || !tweets?.length) {
    return NextResponse.json({ error: 'meetingKey and tweets are required' }, { status: 400 });
  }

  const meeting = getMeetingByKey(meetingKey);
  const meetingTitle = meeting?.meetingLabel;

  const posts = tweets
    .map(t => normalizeTwitterPost(t))
    .sort((a, b) => a.indexedAt.localeCompare(b.indexedAt));

  // Quote tweets: the archive only stores a link to the quoted tweet, not its
  // content. Fetch the author + text via Twitter's public oEmbed endpoint and
  // store it inline so it renders as a card, similar to the original Twitter UI.
  // Keyed by tweet id since `posts` gets re-sorted above.
  const tweetById = new Map(tweets.map(t => [t.id_str, t]));
  await Promise.all(
    posts.map(async post => {
      const tweet = post.twitterId ? tweetById.get(post.twitterId) : undefined;
      if (!tweet) return;
      const quotedUrl = detectQuoteTweetUrl(tweet);
      if (!quotedUrl) return;
      const quotedPost = await fetchQuotedPost(quotedUrl);
      if (quotedPost) post.quotedPost = quotedPost;
    })
  );

  const date = parseTwitterDate(tweets[0]!.created_at);

  const slug = await importToArchive({
    posts,
    date,
    meetingTitle,
    metadata: { ...metadata, importSource: 'twitter' },
  });
  return NextResponse.json({ ok: true, slug });
}
