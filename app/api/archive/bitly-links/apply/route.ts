import { NextResponse } from 'next/server';
import { getArchiveIndex, getArchivePosts, setArchivePosts } from '@/lib/kv';
import { scanBitlyLinks, replaceUrlInPost, isBitlyUrl } from '@/lib/linkExpansion';
import type { BlueskyFacetLink } from '@/lib/bluesky';

export const maxDuration = 60;

// POST: re-scans for bit.ly links, resolves each, and rewrites matching link
// facets (text + byte offsets) in place via replaceUrlInPost. Links that fail
// to resolve (dead/expired) are left untouched and reported in `unresolved`.
// Safe to re-run — already-expanded links no longer match isBitlyUrl, so a
// second pass finds nothing left to do.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST() {
  const index = await getArchiveIndex();
  const links = await scanBitlyLinks(index);

  const resolved = new Map(
    links.filter(l => l.expandedUrl).map(l => [l.shortUrl, l.expandedUrl!])
  );
  const unresolved = links.filter(l => !l.expandedUrl).map(l => l.shortUrl);

  let patched = 0;
  let sessionsTouched = 0;

  for (const entry of index) {
    const posts = await getArchivePosts(entry.slug);
    if (!posts) continue;

    let sessionChanged = false;
    const updated = posts.map(post => {
      const bitlyUris = new Set<string>();
      for (const facet of post.record?.facets ?? []) {
        for (const feature of facet.features) {
          if (feature.$type !== 'app.bsky.richtext.facet#link') continue;
          const uri = (feature as BlueskyFacetLink).uri;
          if (isBitlyUrl(uri) && resolved.has(uri)) bitlyUris.add(uri);
        }
      }

      let current = post;
      for (const uri of bitlyUris) {
        current = replaceUrlInPost(current, uri, resolved.get(uri)!);
        patched++;
        sessionChanged = true;
      }
      return current;
    });

    if (sessionChanged) {
      await setArchivePosts(entry.slug, updated);
      sessionsTouched++;
    }
  }

  return NextResponse.json({ ok: true, patched, sessionsTouched, unresolved });
}
