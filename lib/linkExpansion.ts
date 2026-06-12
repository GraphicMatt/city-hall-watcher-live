import type { ArchiveEntry } from './kv';
import { getArchivePosts } from './kv';
import type { BlueskyPost, BlueskyFacetLink } from './bluesky';

const BITLY_RE = /^https?:\/\/bit\.ly\/\S+/i;

export function isBitlyUrl(url: string): boolean {
  return BITLY_RE.test(url);
}

// Resolves a shortened URL to its final destination by following redirects.
// bit.ly responds with a redirect chain; fetch's `redirect: 'follow'` follows
// it automatically and `response.url` reflects the final destination. Falls
// back to GET for links that don't resolve via HEAD. Returns null on any
// failure (dead/expired link, timeout) — callers should leave the original
// URL untouched in that case.
export async function resolveShortUrl(url: string): Promise<string | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(8000) });
      if (r.url && r.url !== url) return r.url;
    } catch {
      // try the next method
    }
  }
  return null;
}

// Replaces every link facet pointing at `oldUrl` with `newUrl`, rewriting the
// underlying text and recalculating UTF-8 byte offsets for all facets so
// links positioned after the replaced span keep pointing at the right text.
// Returns the post unchanged if no facet matches oldUrl.
export function replaceUrlInPost(post: BlueskyPost, oldUrl: string, newUrl: string): BlueskyPost {
  const facets = (post.record?.facets ?? []).map(f => ({
    index: { ...f.index },
    features: f.features.map(ft => ({ ...ft })),
  }));

  const matches = facets.filter(f =>
    f.features.some(ft => ft.$type === 'app.bsky.richtext.facet#link' && (ft as BlueskyFacetLink).uri === oldUrl)
  );
  if (matches.length === 0) return post;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let bytes = encoder.encode(post.record?.text ?? '');
  const newUrlBytes = encoder.encode(newUrl);

  for (const facet of matches) {
    const { byteStart, byteEnd } = facet.index;
    const spliced = new Uint8Array(bytes.length - (byteEnd - byteStart) + newUrlBytes.length);
    spliced.set(bytes.subarray(0, byteStart), 0);
    spliced.set(newUrlBytes, byteStart);
    spliced.set(bytes.subarray(byteEnd), byteStart + newUrlBytes.length);
    bytes = spliced;

    const delta = newUrlBytes.length - (byteEnd - byteStart);
    facet.index.byteEnd = byteStart + newUrlBytes.length;
    for (const feature of facet.features) {
      if (feature.$type === 'app.bsky.richtext.facet#link' && (feature as BlueskyFacetLink).uri === oldUrl) {
        (feature as BlueskyFacetLink).uri = newUrl;
      }
    }
    for (const other of facets) {
      if (other === facet) continue;
      if (other.index.byteStart >= byteEnd) {
        other.index.byteStart += delta;
        other.index.byteEnd += delta;
      }
    }
  }

  return {
    ...post,
    record: { ...post.record, text: decoder.decode(bytes), facets },
  };
}

export interface BitlyLinkInfo {
  shortUrl: string;
  expandedUrl: string | null;
  occurrences: { slug: string; postId: string }[];
}

// Scans every archived session for link facets pointing at bit.ly, groups
// occurrences by short URL, and resolves each unique URL to its destination.
export async function scanBitlyLinks(index: ArchiveEntry[]): Promise<BitlyLinkInfo[]> {
  const occurrencesByUrl = new Map<string, { slug: string; postId: string }[]>();

  for (const entry of index) {
    const posts = await getArchivePosts(entry.slug);
    if (!posts) continue;
    for (const post of posts) {
      for (const facet of post.record?.facets ?? []) {
        for (const feature of facet.features) {
          if (feature.$type !== 'app.bsky.richtext.facet#link') continue;
          const uri = (feature as BlueskyFacetLink).uri;
          if (!isBitlyUrl(uri)) continue;
          const list = occurrencesByUrl.get(uri) ?? [];
          list.push({ slug: entry.slug, postId: post.uri.split('/').pop()! });
          occurrencesByUrl.set(uri, list);
        }
      }
    }
  }

  return Promise.all(
    Array.from(occurrencesByUrl.entries()).map(async ([shortUrl, occurrences]) => ({
      shortUrl,
      expandedUrl: await resolveShortUrl(shortUrl),
      occurrences,
    }))
  );
}
