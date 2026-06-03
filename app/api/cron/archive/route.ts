import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getActiveSession, setActiveSession } from '@/lib/kv';
import { fetchThreadPosts } from '@/lib/bluesky';
import { snapshotSession } from '@/lib/archive';

// Hard ceiling: archive any session that has been running this long regardless of activity.
// No Toronto City Council meeting has ever run 3 days.
const HARD_CEILING = 72 * 60 * 60 * 1000;

// Inactivity threshold: if the most recent post in the thread is older than this,
// the meeting has almost certainly ended (Matt posts continuously during active coverage).
const INACTIVITY_THRESHOLD = 4 * 60 * 60 * 1000;

// Minimum session age before inactivity-based archiving can kick in.
// Prevents archiving a session that just started and hasn't had many posts yet.
const MIN_AGE_FOR_INACTIVITY_CHECK = 12 * 60 * 60 * 1000;

// GET: called on a schedule — snapshots ended/stale sessions
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getActiveSession();
  if (!session) return NextResponse.json({ ok: true, action: 'none' });
  if (session.archivedSlug) return NextResponse.json({ ok: true, action: 'already-archived' });

  // Ended but snapshot was missed — archive now
  if (session.status === 'ended') {
    const slug = await snapshotSession(session);
    await setActiveSession({ ...session, archivedSlug: slug });
    return NextResponse.json({ ok: true, action: 'archived', slug });
  }

  if (session.status === 'live') {
    const sessionAge = Date.now() - new Date(session.startedAt).getTime();

    // Hard ceiling — always archive beyond this point
    if (sessionAge > HARD_CEILING) {
      const slug = await snapshotSession(session);
      await setActiveSession({ ...session, status: 'ended', archivedSlug: slug });
      return NextResponse.json({ ok: true, action: 'auto-archived-ceiling', slug });
    }

    // Inactivity check — only kicks in after the session has been running a while.
    // Fetch the thread to find the most recent post; if it's stale, the meeting is over.
    if (sessionAge > MIN_AGE_FOR_INACTIVITY_CHECK) {
      const posts = await fetchThreadPosts(session.rootUri, session.authorDid);
      if (posts.length > 0) {
        const newest = posts.reduce((a, b) => (a.indexedAt > b.indexedAt ? a : b));
        const inactivity = Date.now() - new Date(newest.indexedAt).getTime();
        if (inactivity > INACTIVITY_THRESHOLD) {
          const slug = await snapshotSession(session);
          await setActiveSession({ ...session, status: 'ended', archivedSlug: slug });
          return NextResponse.json({
            ok: true,
            action: 'auto-archived-inactive',
            slug,
            inactiveHours: Math.round(inactivity / 3_600_000 * 10) / 10,
          });
        }
        // Still active — report how long ago the last post was
        return NextResponse.json({
          ok: true,
          action: 'none',
          lastPostMinutesAgo: Math.round(inactivity / 60_000),
        });
      }
    }
  }

  return NextResponse.json({ ok: true, action: 'none' });
}
