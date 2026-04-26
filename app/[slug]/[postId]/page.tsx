import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArchivePosts, getArchiveIndex } from '@/lib/kv';
import { getImages, formatTime } from '@/lib/bluesky';
import PostCard from '@/components/PostCard';

interface Props {
  params: Promise<{ slug: string; postId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postId } = await params;

  const [posts, index] = await Promise.all([getArchivePosts(slug), getArchiveIndex()]);
  if (!posts) return {};

  const post = posts.find(p => p.uri.endsWith(`/${postId}`));
  if (!post) return {};

  const entry = index.find(e => e.slug === slug);
  const label = entry?.label ?? slug;

  const text = post.record?.text || '';
  const title = `${label} — CHW Live`;
  const description = text.length > 200 ? text.slice(0, 197) + '…' : text;
  const images = getImages(post);
  const ogImage = images[0]?.fullsize;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://live.cityhallwatcher.com/${slug}/${postId}`,
      siteName: 'CHW Live',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}

const EMPTY_URIS = new Set<string>();

export default async function PostPage({ params }: Props) {
  const { slug, postId } = await params;

  const [posts, index] = await Promise.all([getArchivePosts(slug), getArchiveIndex()]);
  if (!posts) notFound();

  const post = posts.find(p => p.uri.endsWith(`/${postId}`));
  if (!post) notFound();

  const entry = index.find(e => e.slug === slug);
  const label = entry?.label ?? slug;

  const bskyUrl = `https://bsky.app/profile/${post.author.handle}/post/${postId}`;

  return (
    <>
      <header className="bg-white dark:bg-[#1a1a1a] border-b border-[#e0e0d8] dark:border-[#2a2a2a] px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-sm font-semibold tracking-tight text-[#1a1a1a] dark:text-[#e8e8e0]">
          CHW Live{' '}
          <span className="text-[#888] font-normal">
            /{' '}
            <a href={`/${slug}`} className="hover:underline">
              {label}
            </a>
            {' '}/ {formatTime(post.indexedAt)}
          </span>
        </h1>
        <a
          href={`/${slug}`}
          className="text-xs text-[#888] hover:text-[#333] dark:hover:text-[#ccc] underline flex-shrink-0"
        >
          ← Full thread
        </a>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-8 pb-12">
        <PostCard post={post} isNew={false} />
        <div className="mt-4 flex items-center gap-4 text-xs text-[#aaa] dark:text-[#555]">
          <a
            href={bskyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#1a6bbf] dark:hover:text-[#5a9fd4] hover:underline transition-colors"
          >
            View on Bluesky →
          </a>
          <a
            href={`/${slug}`}
            className="hover:text-[#333] dark:hover:text-[#aaa] hover:underline transition-colors"
          >
            ← Back to {label}
          </a>
        </div>
      </main>
    </>
  );
}
