import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/admin/* is admin tooling end to end, so GET needs a session too.
  // Everything it returns is already public, but the routes exist to drive the
  // admin pages and shouldn't answer anonymous callers.
  const adminOnly = pathname.startsWith('/api/admin');

  // Elsewhere GET is public: the live page polls GET /api/session, and the
  // archive pages read GET /api/archive/*. Only mutations need a session.
  if (!adminOnly && request.method === 'GET') return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const authenticated = token ? await verifyToken(token) : false;

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

// Note that a bare '/api/session' matches that path only, so the nested
// ':path*' entry is what covers /api/session/detect.
export const config = {
  matcher: [
    '/api/session',
    '/api/session/:path*',
    '/api/archive/:path*',
    '/api/admin/:path*',
  ],
};
