import type { ArchiveEntry } from './kv';
import { getArchivePosts } from './kv';
import type { BlueskyFacetLink } from './bluesky';

const TWITPIC_RE = /^https?:\/\/twitpic\.com\/\S+/i;
const YFROG_RE = /^https?:\/\/(?:www\.)?yfrog\.com\/\S+/i;

export function isTwitpicUrl(url: string): boolean {
  return TWITPIC_RE.test(url);
}

export function isYfrogUrl(url: string): boolean {
  return YFROG_RE.test(url);
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

// Scans every archived session for link facets pointing at twitpic or yfrog —
// the two early Twitter-era image hosts. yfrog has been offline for years
// (its images are unrecoverable); twitpic links still resolve, for now.
export async function scanOldImageLinks(index: ArchiveEntry[]): Promise<OldImageLinkInfo[]> {
  const seen = new Map<string, OldImageLinkInfo>();

  for (const entry of index) {
    const posts = await getArchivePosts(entry.slug);
    if (!posts) continue;
    for (const post of posts) {
      for (const facet of post.record?.facets ?? []) {
        for (const feature of facet.features) {
          if (feature.$type !== 'app.bsky.richtext.facet#link') continue;
          const uri = (feature as BlueskyFacetLink).uri;
          const platform = isTwitpicUrl(uri) ? 'twitpic' : isYfrogUrl(uri) ? 'yfrog' : null;
          if (!platform) continue;
          const info = seen.get(uri) ?? { url: uri, platform, occurrences: [] };
          info.occurrences.push({ slug: entry.slug, postId: post.uri.split('/').pop()! });
          seen.set(uri, info);
        }
      }
    }
  }

  return Array.from(seen.values());
}
