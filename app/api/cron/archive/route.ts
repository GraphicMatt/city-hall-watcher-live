import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getActiveSession, setActiveSession } from '@/lib/kv';
import { snapshotSession } from '@/lib/archive';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// GET: called on a schedule — snapshots ended/stale sessions
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await getActiveSession();
  if (!session) return NextResponse.json({ ok: true, action: 'none' });
  if (session.archivedSlug) return NextResponse.json({ ok: true, action: 'already-archived' });

  const sessionAge = Date.now() - new Date(session.startedAt).getTime();

  // Ended but snapshot was missed
  if (session.status === 'ended') {
    const slug = await snapshotSession(session);
    await setActiveSession({ ...session, archivedSlug: slug });
    return NextResponse.json({ ok: true, action: 'archived', slug });
  }

  // Still live but >24h old — auto-archive
  if (session.status === 'live' && sessionAge > TWENTY_FOUR_HOURS) {
    const slug = await snapshotSession(session);
    await setActiveSession({ ...session, status: 'ended', archivedSlug: slug });
    return NextResponse.json({ ok: true, action: 'auto-archived', slug });
  }

  return NextResponse.json({ ok: true, action: 'none' });
}
