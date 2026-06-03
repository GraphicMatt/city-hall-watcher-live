import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parsePostUrl, resolveHandle, fetchHistoricalThread } from '@/lib/bluesky';
import { getMeetingForDate } from '@/lib/councilDates';
import { importToArchive } from '@/lib/importArchive';
import type { SessionMetadata } from '@/lib/kv';

interface ImportBody {
  rootUrl: string;
  meetingKey?: string;
  metadata?: Partial<SessionMetadata>;
}

// POST: fetch a Bluesky thread by URL and save it directly to the archive.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST(request: NextRequest) {
  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { rootUrl, metadata } = body;
  if (!rootUrl) {
    return NextResponse.json({ error: 'rootUrl is required' }, { status: 400 });
  }

  const parsed = parsePostUrl(rootUrl);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid Bluesky post URL' }, { status: 400 });
  }

  const authorDid = await resolveHandle(parsed.handle);
  const rootUri = `at://${authorDid}/app.bsky.feed.post/${parsed.rkey}`;

  const posts = await fetchHistoricalThread(rootUri, authorDid);
  if (posts.length === 0) {
    return NextResponse.json({ error: 'No posts found in thread' }, { status: 404 });
  }

  const rootPost = posts[0]!;
  const date = new Date(rootPost.indexedAt);
  const torontoDate = date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

  const meeting = getMeetingForDate(torontoDate);
  const meetingTitle = meeting?.meetingLabel;

  const slug = await importToArchive({ posts, date, meetingTitle, metadata });
  return NextResponse.json({ ok: true, slug });
}
