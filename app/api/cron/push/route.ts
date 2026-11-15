import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession, acquireLease, releaseLease } from '@/lib/kv';
import { fetchThreadPosts } from '@/lib/bluesky';
import { getPushConfiguration } from '@/lib/push/config';
import { deliverThreadUpdates } from '@/lib/push/delivery';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!getPushConfiguration()) return NextResponse.json({ action: 'disabled' });
  const token = randomUUID();
  const key = 'push:poll-lock';
  if (!await acquireLease(key, token, 90)) return NextResponse.json({ action: 'already-running' });
  try {
    const session = await getActiveSession();
    if (session?.status !== 'live') return NextResponse.json({ action: 'not-live' });
    const deadline = Date.now() + 45_000;
    const posts = await fetchThreadPosts(session.rootUri, session.authorDid, { signal: AbortSignal.timeout(20_000) });
    const result = await deliverThreadUpdates(session, posts, deadline);
    return NextResponse.json(result, { status: result.failed || !result.complete ? 503 : 200 });
  } catch {
    console.error('Push poll failed');
    return NextResponse.json({ error: 'Push poll failed; retry on the next scheduled run' }, { status: 503 });
  } finally {
    await releaseLease(key, token);
  }
}
