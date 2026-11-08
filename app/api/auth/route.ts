import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { comparePassword, signToken, verifyToken, COOKIE_NAME } from '@/lib/auth';
import { getCounter, incrementCounter } from '@/lib/kv';

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

// Login throttling: after MAX_FAILURES wrong passwords from one IP, further
// attempts from it are refused until the window (started by the first failure) expires.
const MAX_FAILURES = 10;
const WINDOW_SECONDS = 15 * 60;

function clientIp(request: NextRequest): string {
  // On Vercel, x-forwarded-for is set by the platform edge, and its first entry is the client.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

// POST: login
export async function POST(request: NextRequest) {
  const limitKey = `ratelimit:login:${clientIp(request)}`;
  if ((await getCounter(limitKey)) >= MAX_FAILURES) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(WINDOW_SECONDS) } }
    );
  }

  const { password } = await request.json().catch(() => ({ password: undefined }));
  if (typeof password !== 'string' || !password || !comparePassword(password)) {
    await incrementCounter(limitKey, WINDOW_SECONDS);
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
