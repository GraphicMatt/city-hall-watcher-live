import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getArchivePosts, setArchivePosts } from '@/lib/kv';
import { findQuoteTweetUrlInPost, fetchQuotedPost } from '@/lib/twitter';

// POST: scan an already-imported Twitter session for posts that link to a
// quote-tweeted post, fetch that post's content via oEmbed, and patch it in
// place — no full re-import required. Skips posts that already have a
// `quotedPost` or aren't Twitter posts. Protected by proxy (POST on /api/archive/:path*).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const posts = await getArchivePosts(slug);
  if (!posts) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let patched = 0;
  let checked = 0;
  const updated = await Promise.all(
    posts.map(async post => {
      if (post.platform !== 'twitter' || post.quotedPost) return post;
      const quotedUrl = findQuoteTweetUrlInPost(post);
      if (!quotedUrl) return post;
      checked++;
      const quotedPost = await fetchQuotedPost(quotedUrl);
      if (!quotedPost) return post;
      patched++;
      return { ...post, quotedPost };
    })
  );

  if (patched > 0) {
    await setArchivePosts(slug, updated);
  }

  return NextResponse.json({ ok: true, patched, checked });
}
