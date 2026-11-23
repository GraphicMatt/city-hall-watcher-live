import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpecialEntry, getSpecialPosts } from '@/lib/kv';
import { getImages } from '@/lib/bluesky';
import ArchiveViewer from '@/components/ArchiveViewer';

// Special (non-council) threads. Not listed anywhere on the site — reachable
// only by direct URL. Managed from the "Special threads" panel on /admin.

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [entry, posts] = await Promise.all([getSpecialEntry(slug), getSpecialPosts(slug)]);
  if (!entry || !posts) return {};

  const title = `${entry.title} — CHW Live`;
  const description = entry.description || `A thread by Matt Elliott. ${entry.postCount} posts.`;
  const ogImage = posts.map(getImages).find(imgs => imgs.length > 0)?.[0]?.fullsize;

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `https://live.cityhallwatcher.com/special/${slug}`,
      siteName: 'CHW Live',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function SpecialPage({ params }: Props) {
  const { slug } = await params;
  const [entry, posts] = await Promise.all([getSpecialEntry(slug), getSpecialPosts(slug)]);
  if (!entry || !posts) notFound();

  const indexedAts = posts.map(p => p.indexedAt).sort();

  return (
    <ArchiveViewer
      posts={posts}
      label={entry.title}
      description={entry.description}
      postCount={posts.length}
      startedAt={indexedAts[0]}
      endedAt={indexedAts[indexedAts.length - 1]}
      // Namespaced so post permalinks resolve to /special/<slug>/<postId> and
      // last-read tracking can't collide with a council meeting slug.
      slug={`special/${slug}`}
    />
  );
}
