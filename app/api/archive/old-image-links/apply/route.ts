import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getArchiveIndex, getArchivePosts, setArchivePosts } from '@/lib/kv';
import { scanOldImageLinks, resolveTwitpicImage, isTwitpicUrl } from '@/lib/twitpic';
import type { BlueskyImage, BlueskyFacetLink } from '@/lib/bluesky';

export const maxDuration = 60;

// POST: re-scans for twitpic links, resolves each to its underlying image,
// downloads the bytes, and uploads them to Vercel Blob (twitpic's signed
// CloudFront URLs expire after ~30 days, so we need our own copy). Patches
// each occurrence's post.embed.images with the new permanent URL so it
// renders as an inline image like modern posts. Links that fail to resolve
// or download are left untouched and reported in `failed`.
// Safe to re-run — `addRandomSuffix: false` gives each image a stable Blob
// URL, and posts that already have it in embed.images are skipped.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({
      ok: false,
      error: 'BLOB_READ_WRITE_TOKEN is not set — enable Vercel Blob storage for this project and redeploy.',
    }, { status: 500 });
  }

  const index = await getArchiveIndex();
  const links = await scanOldImageLinks(index);
  const twitpicLinks = links.filter(l => l.platform === 'twitpic');

  const imageByUrl = new Map<string, BlueskyImage>();
  const failed: { url: string; reason: string }[] = [];

  for (const link of twitpicLinks) {
    const resolvedUrl = await resolveTwitpicImage(link.url);
    if (!resolvedUrl) {
      failed.push({ url: link.url, reason: 'Could not resolve twitpic page to an image URL' });
      continue;
    }
    try {
      const imgRes = await fetch(resolvedUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgRes.ok) {
        failed.push({ url: link.url, reason: `Image download failed: HTTP ${imgRes.status}` });
        continue;
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg';
      const id = link.url.split('/').pop();
      const blob = await put(`twitpic/${id}.${ext}`, buffer, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
      });
      imageByUrl.set(link.url, { thumb: blob.url, fullsize: blob.url, alt: '' });
    } catch (err) {
      failed.push({ url: link.url, reason: `Upload to Blob failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  let patched = 0;
  let sessionsTouched = 0;

  for (const entry of index) {
    const posts = await getArchivePosts(entry.slug);
    if (!posts) continue;

    let sessionChanged = false;
    const updated = posts.map(post => {
      const newImages: BlueskyImage[] = [];
      const existing = post.embed?.images ?? [];

      for (const facet of post.record?.facets ?? []) {
        for (const feature of facet.features) {
          if (feature.$type !== 'app.bsky.richtext.facet#link') continue;
          const uri = (feature as BlueskyFacetLink).uri;
          if (!isTwitpicUrl(uri)) continue;
          const image = imageByUrl.get(uri);
          if (!image) continue;
          if (existing.some(img => img.fullsize === image.fullsize)) continue;
          newImages.push(image);
        }
      }

      if (newImages.length === 0) return post;
      patched += newImages.length;
      sessionChanged = true;
      return {
        ...post,
        embed: { $type: 'app.bsky.embed.images#view', images: [...existing, ...newImages] },
      };
    });

    if (sessionChanged) {
      await setArchivePosts(entry.slug, updated);
      sessionsTouched++;
    }
  }

  return NextResponse.json({ ok: true, patched, sessionsTouched, failed });
}
