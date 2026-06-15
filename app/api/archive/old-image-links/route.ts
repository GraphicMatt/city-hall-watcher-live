import { NextResponse } from 'next/server';
import { getArchiveIndex } from '@/lib/kv';
import { scanOldImageLinks, resolveTwitpicImage } from '@/lib/twitpic';

export const maxDuration = 60;

// POST: scan the archive for twitpic/yfrog links (via link facets), resolve
// each twitpic link to its underlying image, and return a report — no writes.
// yfrog is long offline, so those links are reported but never resolved.
// Review the report before running .../apply.
// Protected by proxy (POST on /api/archive/:path*).
export async function POST() {
  const index = await getArchiveIndex();
  const links = await scanOldImageLinks(index);

  const results = await Promise.all(links.map(async link => ({
    ...link,
    resolvedImageUrl: link.platform === 'twitpic' ? await resolveTwitpicImage(link.url) : null,
  })));

  return NextResponse.json({
    ok: true,
    links: results,
    blobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}
