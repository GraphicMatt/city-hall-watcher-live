import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { getActiveSession } from '@/lib/kv';
import { fetchThreadPosts, detectVideoSegments } from '@/lib/bluesky';

// POST: fetch the live thread from Bluesky and return detected video segments.
// Not covered by the proxy matcher path, so auth is checked inline.
export async function POST(_request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const authenticated = token ? await verifyToken(token) : false;
  if (!authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await getActiveSession();
  if (!session) return NextResponse.json({ error: 'No active session' }, { status: 404 });

  const posts = await fetchThreadPosts(session.rootUri, session.authorDid);
  const segments = detectVideoSegments(posts);
  return NextResponse.json({ segments });
}
