import type { ArchiveEntry } from './kv';
import { getArchivePosts } from './kv';
import type { BlueskyFacetLink, BlueskyPost } from './bluesky';

const TWITPIC_RE = /^https?:\/\/twitpic\.com\/\S+/i;
const YFROG_RE = /^https?:\/\/(?:www\.)?yfrog\.com\/\S+/i;
const URL_RE = /https?:\/\/\S+/g;

export function isTwitpicUrl(url: string): boolean {
  return TWITPIC_RE.test(url);
}

export function isYfrogUrl(url: string): boolean {
  return YFROG_RE.test(url);
}

// Returns twitpic/yfrog URLs referenced by a post, whether via a resolved
// link facet (modern imports) or as plain text — early Twitter imports were
// stored before facet generation, so their links only exist as raw URLs in
// `record.text`.
export function extractOldImageUrls(post: BlueskyPost): { url: string; platform: 'twitpic' | 'yfrog' }[] {
  const urls = new Set<string>();

  for (const facet of post.record?.facets ?? []) {
    for (const feature of facet.features) {
      if (feature.$type === 'app.bsky.richtext.facet#link') {
        urls.add((feature as BlueskyFacetLink).uri);
      }
    }
  }

  for (const match of post.record?.text?.matchAll(URL_RE) ?? []) {
    urls.add(match[0]);
  }

  const results: { url: string; platform: 'twitpic' | 'yfrog' }[] = [];
  for (const url of urls) {
    if (isTwitpicUrl(url)) results.push({ url, platform: 'twitpic' });
    else if (isYfrogUrl(url)) results.push({ url, platform: 'yfrog' });
  }
  return results;
}

// Twitpic pages expose the underlying image via a `twitter:image` meta tag —
// a CloudFront URL signed with a ~30-day expiry, so it can't be stored
// directly and must be downloaded promptly. Returns null for dead/removed
// posts (no such tag).
export async function resolveTwitpicImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const html = await r.text();
    const match = html.match(/<meta\s+name="twitter:image"\s+value="([^"]+)"/i);
    if (!match) return null;
    return match[1]!.replace(/&amp;/g, '&');
  } catch {
    return null;
  }
}

export interface OldImageLinkInfo {
  url: string;
  platform: 'twitpic' | 'yfrog';
  occurrences: { slug: string; postId: string }[];
}

// Scans every archived session for links pointing at twitpic or yfrog — the
// two early Twitter-era image hosts. Looks at both link facets (modern
// imports) and plain-text URLs (early Twitter imports stored before facet
// generation). yfrog has been offline for years (its images are
// unrecoverable); twitpic links still resolve, for now.
export async function scanOldImageLinks(index: ArchiveEntry[]): Promise<OldImageLinkInfo[]> {
  const seen = new Map<string, OldImageLinkInfo>();

  for (const entry of index) {
    const posts = await getArchivePosts(entry.slug);
    if (!posts) continue;
    for (const post of posts) {
      for (const { url, platform } of extractOldImageUrls(post)) {
        const info = seen.get(url) ?? { url, platform, occurrences: [] };
        info.occurrences.push({ slug: entry.slug, postId: post.uri.split('/').pop()! });
        seen.set(url, info);
      }
    }
  }

  return Array.from(seen.values());
}
