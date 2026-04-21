import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { comparePassword, signToken, verifyToken, COOKIE_NAME } from '@/lib/auth';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: '/',
};

// GET: check if current cookie is valid
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}

// POST: login
export async function POST(request: NextRequest) {
  const { password } = await request.json();
  if (!password || !comparePassword(password)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const token = await signToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS);
  return res;
}

// DELETE: logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
