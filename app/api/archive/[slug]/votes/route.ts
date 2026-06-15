import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getArchivePosts, getMinutesVotes, setArchivePosts, setMinutesVotes } from '@/lib/kv';
import { matchVotesToPosts } from '@/lib/voteMatching';
import type { MinutesVote, VoteCard } from '@/lib/bluesky';

// GET: previously-uploaded Minutes votes for this session, plus the current
// match candidates against the session's posts.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const [votes, posts] = await Promise.all([getMinutesVotes(slug), getArchivePosts(slug)]);
  const candidates = votes && posts ? matchVotesToPosts(posts, votes) : [];

  return NextResponse.json({ votes: votes ?? [], candidates });
}

// POST: store scraped Minutes votes (from chw_minutes_scraper.py) and return
// match candidates against the session's posts. Protected by proxy.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { votes } = (await request.json()) as { votes: MinutesVote[] };

  if (!Array.isArray(votes)) {
    return NextResponse.json({ error: 'Expected { votes: MinutesVote[] }' }, { status: 400 });
  }

  await setMinutesVotes(slug, votes);

  const posts = await getArchivePosts(slug);
  const candidates = posts ? matchVotesToPosts(posts, votes) : [];

  return NextResponse.json({ ok: true, candidates });
}

// PATCH: attach (or clear) voteCard on specific posts, replacing their
// screenshot image with the rendered VoteCard. Mirrors patch-quotes — reads
// the whole post array, patches matching URIs, writes it back. Protected by proxy.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { updates } = (await request.json()) as {
    updates: { postUri: string; voteCard: VoteCard | null }[];
  };

  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: 'Expected { updates: [...] }' }, { status: 400 });
  }

  const posts = await getArchivePosts(slug);
  if (!posts) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const byUri = new Map(updates.map(u => [u.postUri, u.voteCard]));
  let patched = 0;
  const updated = posts.map(post => {
    if (!byUri.has(post.uri)) return post;
    patched++;
    const voteCard = byUri.get(post.uri);
    if (voteCard === null) {
      const rest = { ...post };
      delete rest.voteCard;
      return rest;
    }
    return { ...post, voteCard: voteCard! };
  });

  await setArchivePosts(slug, updated);

  return NextResponse.json({ ok: true, patched });
}
