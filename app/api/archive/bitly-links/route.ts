import { NextResponse } from 'next/server';
import { getArchiveIndex } from '@/lib/kv';
import { scanBitlyLinks } from '@/lib/linkExpansion';

export const maxDuration = 60;

// POST: scan the archive for bit.ly links (via link facets), resolve each
// unique short URL to its destination, and return a report — no writes.
// Review the report before running .../apply.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST() {
  const index = await getArchiveIndex();
  const links = await scanBitlyLinks(index);
  return NextResponse.json({ ok: true, links });
}
