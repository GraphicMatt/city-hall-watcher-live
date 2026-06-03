import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getMeetingByKey } from '@/lib/councilDates';
import { normalizeTwitterPost, parseTwitterDate } from '@/lib/twitter';
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

  const date = parseTwitterDate(tweets[0]!.created_at);

  const slug = await importToArchive({ posts, date, meetingTitle, metadata });
  return NextResponse.json({ ok: true, slug });
}
