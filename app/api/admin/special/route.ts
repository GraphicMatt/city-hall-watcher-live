import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parsePostUrl, resolveHandle, fetchHistoricalThread } from '@/lib/bluesky';
import { getSpecialIndex, saveSpecialThread } from '@/lib/kv';

// Special (non-council) threads, served only at /special/<slug>.
// Admin-only for every method via the /api/admin/:path* proxy matcher.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ImportBody {
  rootUrl?: string;
  slug?: string;
  title?: string;
  description?: string;
}

// GET: list special threads
export async function GET() {
  return NextResponse.json({ specials: await getSpecialIndex() });
}

// POST: import a Bluesky thread as a special thread. Posting an existing slug
// re-fetches the thread and replaces it (used by the admin "Refresh" button).
export async function POST(request: NextRequest) {
  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rootUrl = body.rootUrl?.trim();
  const slug = body.slug?.trim().toLowerCase();
  const title = body.title?.trim();
  const description = body.description?.trim() || undefined;

  if (!rootUrl || !slug || !title) {
    return NextResponse.json({ error: 'rootUrl, slug and title are required' }, { status: 400 });
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Slug must be lowercase letters, numbers and single hyphens' }, { status: 400 });
  }

  const parsed = parsePostUrl(rootUrl);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid Bluesky post URL' }, { status: 400 });
  }

  let posts;
  try {
    const authorDid = await resolveHandle(parsed.handle);
    const rootUri = `at://${authorDid}/app.bsky.feed.post/${parsed.rkey}`;
    posts = await fetchHistoricalThread(rootUri, authorDid);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fetch failed' }, { status: 502 });
  }
  if (posts.length === 0) {
    return NextResponse.json({ error: 'No posts found in thread' }, { status: 404 });
  }

  await saveSpecialThread(
    { slug, title, description, rootUrl, importedAt: new Date().toISOString(), postCount: posts.length },
    posts,
  );
  return NextResponse.json({ ok: true, slug, postCount: posts.length });
}
