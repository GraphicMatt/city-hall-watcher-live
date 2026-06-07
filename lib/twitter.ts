import type { BlueskyPost, BlueskyImage, BlueskyFacet, BlueskyFacetLink, QuotedPost } from './bluesky';

export interface ProcessedTweet {
  id_str: string;
  created_at: string;
  full_text: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  favorite_count: string;
  retweet_count: string;
  urls?: { url: string; expanded_url: string }[];
  media_urls?: string[];
}

// Parse Twitter's non-standard date format: "Wed Apr 08 15:38:00 +0000 2026"
export function parseTwitterDate(created_at: string): Date {
  return new Date(created_at);
}

// Twitter's archive HTML-encodes certain characters in tweet text.
// Decode the common ones so they render correctly in the UI.
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function expandTcoUrls(text: string, urls?: { url: string; expanded_url: string }[]): string {
  if (!urls || urls.length === 0) return text;
  let result = text;
  for (const { url, expanded_url } of urls) {
    result = result.replaceAll(url, expanded_url);
  }
  return result;
}

// Build Bluesky-style facets from a tweet's URL entities so linkifyText can
// render them as clickable links (same path as native Bluesky posts).
function buildFacetsFromUrls(text: string, urls: { url: string; expanded_url: string }[]): BlueskyFacet[] {
  const encoder = new TextEncoder();
  const facets: BlueskyFacet[] = [];

  for (const { expanded_url } of urls) {
    const idx = text.indexOf(expanded_url);
    if (idx === -1) continue;
    const byteStart = encoder.encode(text.slice(0, idx)).length;
    const byteEnd = byteStart + encoder.encode(expanded_url).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: expanded_url }],
    });
  }

  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

export function normalizeTwitterPost(tweet: ProcessedTweet): BlueskyPost {
  const images: BlueskyImage[] = (tweet.media_urls ?? []).map(url => ({
    thumb: `${url}?format=jpg&name=small`,
    fullsize: `${url}?format=jpg&name=large`,
    alt: '',
  }));

  // Expand known t.co links, strip remaining media t.co links, then decode
  // HTML entities that Twitter stores in raw tweet text (&amp; → &, etc.).
  const expandedText = expandTcoUrls(tweet.full_text, tweet.urls);
  const strippedText = expandedText.replace(/\s*https:\/\/t\.co\/\S+/g, '').trim();
  const text = decodeHtmlEntities(strippedText);

  const facets = buildFacetsFromUrls(text, tweet.urls ?? []);

  return {
    uri: `twitter://${tweet.id_str}`,
    cid: tweet.id_str,
    author: {
      did: 'twitter',
      handle: 'graphicmatt.com',
      displayName: 'Matt Elliott',
    },
    record: {
      text,
      ...(facets.length > 0 ? { facets } : {}),
    },
    embed: images.length > 0 ? {
      $type: 'app.bsky.embed.images#view',
      images,
    } : undefined,
    indexedAt: parseTwitterDate(tweet.created_at).toISOString(),
    likeCount: parseInt(tweet.favorite_count, 10) || 0,
    repostCount: parseInt(tweet.retweet_count, 10) || 0,
    platform: 'twitter',
    twitterId: tweet.id_str,
  };
}

// ── Quote tweets ───────────────────────────────────────────────────────────
//
// Twitter's archive export doesn't include the content of quote-tweeted posts —
// only a t.co/expanded URL pointing at the quoted tweet. To display them inline
// (similar to how they'd have appeared on Twitter), we fetch the quoted tweet's
// author + text via Twitter's public oEmbed endpoint at import time and store
// the result inline (`BlueskyPost.quotedPost`). No auth required; fails
// gracefully (returns null) for deleted/suspended tweets.

const TWITTER_STATUS_URL_RE = /^https:\/\/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/i;

// Returns the URL of a quote-tweeted post, if this tweet appears to quote one.
// Twitter places the quoted tweet's URL among the tweet's URL entities — we
// look for any expanded URL that points at a tweet status page.
export function detectQuoteTweetUrl(tweet: ProcessedTweet): string | null {
  for (const { expanded_url } of tweet.urls ?? []) {
    if (TWITTER_STATUS_URL_RE.test(expanded_url)) return expanded_url.replace(/^https:\/\/x\.com\//i, 'https://twitter.com/');
  }
  return null;
}

// Same detection, but operating on an already-normalized BlueskyPost (used by
// the patch route, which only has access to stored posts, not raw tweet data).
export function findQuoteTweetUrlInPost(post: BlueskyPost): string | null {
  for (const facet of post.record?.facets ?? []) {
    for (const feature of facet.features) {
      if (feature.$type === 'app.bsky.richtext.facet#link') {
        const uri = (feature as BlueskyFacetLink).uri;
        if (TWITTER_STATUS_URL_RE.test(uri)) return uri.replace(/^https:\/\/x\.com\//i, 'https://twitter.com/');
      }
    }
  }
  const text = post.record?.text ?? '';
  const match = text.match(TWITTER_STATUS_URL_RE);
  return match ? match[0].replace(/^https:\/\/x\.com\//i, 'https://twitter.com/') : null;
}

function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<a[^>]*>\s*pic\.twitter\.com\/\S+\s*<\/a>/gi, '') // drop media-attachment links — no image to show in the card
      .replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1') // keep remaining link text, drop the tag
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/[ \t]+/g, ' ').trim();
}

// Fetches author + text for a quoted tweet via Twitter's public oEmbed endpoint.
// Returns null on any failure (deleted tweet, network error, unexpected shape) —
// callers should treat that as "no card available" and leave the link as-is.
export async function fetchQuotedPost(url: string): Promise<QuotedPost | null> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=1&dnt=true`;
    const r = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = await r.json() as { author_name?: string; author_url?: string; html?: string };
    if (!data.html || !data.author_name || !data.author_url) return null;

    const handle = data.author_url.split('/').filter(Boolean).pop() ?? '';
    const pMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!pMatch) return null;
    const text = stripHtmlToText(pMatch[1]!);
    if (!text) return null;

    return { url, authorHandle: handle, authorName: data.author_name, text };
  } catch {
    return null;
  }
}

export function buildTwitterThreads(tweets: ProcessedTweet[]): Map<string, ProcessedTweet[]> {
  if (tweets.length === 0) return new Map();

  // Build lookup by id_str
  const byId = new Map<string, ProcessedTweet>();
  for (const t of tweets) {
    byId.set(t.id_str, t);
  }

  // Identify roots: tweets whose in_reply_to_status_id_str is absent or points outside this set
  const roots: ProcessedTweet[] = [];
  for (const t of tweets) {
    const parentId = t.in_reply_to_status_id_str;
    if (!parentId || !byId.has(parentId)) {
      roots.push(t);
    }
  }

  // For each root, walk the reply chain forward
  const result = new Map<string, ProcessedTweet[]>();
  for (const root of roots) {
    const chain: ProcessedTweet[] = [];
    const visited = new Set<string>();
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id_str)) continue;
      visited.add(current.id_str);
      chain.push(current);
      // Find direct replies to current in this tweet set
      for (const t of tweets) {
        if (t.in_reply_to_status_id_str === current.id_str && !visited.has(t.id_str)) {
          queue.push(t);
        }
      }
    }
    // Sort chronologically
    chain.sort((a, b) => parseTwitterDate(a.created_at).getTime() - parseTwitterDate(b.created_at).getTime());
    result.set(root.id_str, chain);
  }

  return result;
}
