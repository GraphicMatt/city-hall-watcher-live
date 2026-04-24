import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  // GET /api/session is public — only protect mutations
  if (request.method === 'GET') return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const authenticated = token ? await verifyToken(token) : false;

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/session', '/api/archive/:path*'],
};
