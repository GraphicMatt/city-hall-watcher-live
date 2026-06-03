import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getArchivePosts } from '@/lib/kv';
import { detectVideoSegments } from '@/lib/bluesky';

// POST: scan archived posts for YouTube URLs and return detected video segments.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const posts = await getArchivePosts(slug);
  if (!posts) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const segments = detectVideoSegments(posts);
  return NextResponse.json({ segments });
}
