import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getActiveSession, setActiveSession } from '@/lib/kv';
import { parsePostUrl, resolveHandle } from '@/lib/bluesky';
import { snapshotSession } from '@/lib/archive';

// GET: public — return current session (or null)
export async function GET() {
  const session = await getActiveSession();
  return NextResponse.json(session);
}

// POST: start a new session (admin only, protected by proxy)
export async function POST(request: NextRequest) {
  const { rootUrl } = await request.json();

  const parsed = parsePostUrl(rootUrl);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid Bluesky URL' }, { status: 400 });
  }

  let authorDid: string;
  try {
    authorDid = await resolveHandle(parsed.handle);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const rootUri = `at://${authorDid}/app.bsky.feed.post/${parsed.rkey}`;

  await setActiveSession({
    rootUrl,
    rootUri,
    authorDid,
    startedAt: new Date().toISOString(),
    status: 'live',
  });

  return NextResponse.json({ ok: true, rootUri, authorDid });
}

// DELETE: snapshot posts, then end the session (admin only, protected by proxy)
export async function DELETE() {
  const session = await getActiveSession();
  if (!session) return NextResponse.json({ ok: true });

  // Already ended or archiving in progress — bail immediately to prevent double-snapshot
  if (session.status === 'ended' || session.archivedSlug) {
    return NextResponse.json({ ok: true, archivedSlug: session.archivedSlug ?? null });
  }

  // Write sentinel *before* the slow Bluesky fetch so concurrent requests see it and bail
  await setActiveSession({ ...session, status: 'ended', archivedSlug: '__archiving__' });

  try {
    const slug = await snapshotSession(session);
    await setActiveSession({ ...session, status: 'ended', archivedSlug: slug });
    return NextResponse.json({ ok: true, archivedSlug: slug });
  } catch (e) {
    // Clear sentinel so admin can retry
    await setActiveSession({ ...session, status: 'ended', archivedSlug: undefined });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
