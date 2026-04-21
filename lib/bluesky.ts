export interface BlueskyImage {
  thumb: string;
  fullsize: string;
  alt: string;
}

export interface BlueskyFacetLink {
  $type: 'app.bsky.richtext.facet#link';
  uri: string;
}

export interface BlueskyFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<BlueskyFacetLink | { $type: string }>;
}

export interface BlueskyPostRecord {
  text: string;
  facets?: BlueskyFacet[];
  reply?: {
    root: { uri: string };
    parent: { uri: string };
  };
}

export interface BlueskyPost {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string };
  record: BlueskyPostRecord;
  embed?: {
    $type: string;
    images?: BlueskyImage[];
  };
  indexedAt: string;
}

export function parsePostUrl(url: string): { handle: string; rkey: string } | null {
  const m = url.trim().match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  return { handle: m[1], rkey: m[2] };
}

export async function resolveHandle(handle: string): Promise<string> {
  const r = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!r.ok) throw new Error(`Handle resolve failed (${r.status}): ${await r.text()}`);
  return (await r.json()).did as string;
}

export async function fetchThreadPosts(rootUri: string, authorDid: string): Promise<BlueskyPost[]> {
  const posts: BlueskyPost[] = [];

  const rootRkey = rootUri.split('/').pop()!;
  const rootUriParam = `at://${authorDid}/app.bsky.feed.post/${rootRkey}`;
  const rootR = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(rootUriParam)}&depth=0&parentHeight=0`
  );
  if (!rootR.ok) throw new Error(`Could not load root post (${rootR.status}): ${await rootR.text()}`);
  const rootData = await rootR.json();
  const rootPost = rootData.thread?.post as BlueskyPost;
  if (!rootPost) throw new Error('Root post not found');
  posts.push(rootPost);
  const rootTimestamp = new Date(rootPost.indexedAt).getTime();

  let cursor: string | undefined;
  let pages = 0;
  const maxPages = 20;

  while (pages < maxPages) {
    const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
    url.searchParams.set('actor', authorDid);
    url.searchParams.set('limit', '100');
    url.searchParams.set('filter', 'posts_with_replies');
    if (cursor) url.searchParams.set('cursor', cursor);

    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`Feed fetch failed (${r.status}): ${await r.text()}`);
    const data = await r.json();

    let reachedRoot = false;

    for (const item of (data.feed || []) as { post: BlueskyPost }[]) {
      const post = item.post;
      if (!post) continue;
      const postTime = new Date(post.indexedAt).getTime();

      // 2-second buffer for timestamp skew
      if (postTime < rootTimestamp - 2000) {
        reachedRoot = true;
        break;
      }

      const replyRoot = post.record?.reply?.root?.uri;
      if (replyRoot === rootUri && post.author?.did === authorDid) {
        if (!posts.find(p => p.uri === post.uri)) posts.push(post);
      }
    }

    if (reachedRoot || !data.cursor) break;
    cursor = data.cursor;
    pages++;
  }

  return posts;
}

export function getImages(post: BlueskyPost): BlueskyImage[] {
  if (post.embed?.$type === 'app.bsky.embed.images#view') {
    return post.embed.images || [];
  }
  return [];
}

export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
