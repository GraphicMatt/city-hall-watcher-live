import type { BlueskyPost, BlueskyImage } from './bluesky';

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

export function expandTcoUrls(text: string, urls?: { url: string; expanded_url: string }[]): string {
  if (!urls || urls.length === 0) return text;
  let result = text;
  for (const { url, expanded_url } of urls) {
    result = result.replaceAll(url, expanded_url);
  }
  return result;
}

export function normalizeTwitterPost(tweet: ProcessedTweet): BlueskyPost {
  const images: BlueskyImage[] = (tweet.media_urls ?? []).map(url => ({
    thumb: `${url}?format=jpg&name=small`,
    fullsize: `${url}?format=jpg&name=large`,
    alt: '',
  }));

  return {
    uri: `twitter://${tweet.id_str}`,
    cid: tweet.id_str,
    author: {
      did: 'twitter',
      handle: 'graphicmatt.com',
      displayName: 'Matt Elliott',
    },
    record: {
      text: expandTcoUrls(tweet.full_text, tweet.urls),
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
