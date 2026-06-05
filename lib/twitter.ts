import type { BlueskyPost, BlueskyImage, BlueskyFacet } from './bluesky';

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
