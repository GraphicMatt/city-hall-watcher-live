import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArchivePosts, getArchiveIndex } from '@/lib/kv';
import { getImages } from '@/lib/bluesky';
import ArchiveViewer from '@/components/ArchiveViewer';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [posts, index] = await Promise.all([getArchivePosts(slug), getArchiveIndex()]);
  const entry = index.find(e => e.slug === slug);
  const label = entry?.label ?? slug;
  const title = `${label} — CHW Live`;
  const description = `Toronto City Council live coverage from ${label} by Matt Elliott. ${entry?.postCount ?? ''} posts.`;

  // Use the first image found in the thread as the share preview, if any.
  const ogImage = posts?.map(getImages).find(imgs => imgs.length > 0)?.[0]?.fullsize;

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `https://live.cityhallwatcher.com/${slug}`,
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

export default async function ArchivePage({ params }: Props) {
  const { slug } = await params;

  const [posts, index] = await Promise.all([
    getArchivePosts(slug),
    getArchiveIndex(),
  ]);

  if (!posts) notFound();

  const entry = index.find(e => e.slug === slug);

  return (
    <ArchiveViewer
      posts={posts}
      label={entry?.label ?? slug}
      postCount={posts.length}
      startedAt={entry?.startedAt}
      slug={slug}
      metadata={entry?.metadata}
    />
  );
}
