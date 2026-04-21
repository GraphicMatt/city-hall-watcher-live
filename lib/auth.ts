import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'chw-admin';
const TOKEN_TTL = '7d';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is not set');
  return new TextEncoder().encode(secret);
}

// Constant-time string comparison without Node's crypto module (Edge-compatible)
function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) {
    // Dummy loop to avoid timing leak on length mismatch
    let dummy = 0;
    for (let i = 0; i < bBytes.length; i++) dummy |= bBytes[i]! ^ bBytes[i]!;
    return false;
  }
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i]! ^ bBytes[i]!;
  return result === 0;
}

export function comparePassword(input: string): boolean {
  const stored = process.env.ADMIN_PASSWORD ?? '';
  return constantTimeEqual(input, stored);
}

export async function signToken(): Promise<string> {
  return new SignJWT({ authed: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getJwtSecret());
    return true;
  } catch {
    return false;
  }
}
