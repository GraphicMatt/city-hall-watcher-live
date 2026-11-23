import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSpecialEntry, getSpecialPosts } from '@/lib/kv';
import { getImages } from '@/lib/bluesky';
import PostCard from '@/components/PostCard';
import SiteHeader from '@/components/SiteHeader';

function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Toronto',
  });
}

interface Props {
  params: Promise<{ slug: string; postId: string }>;
}

async function load(slug: string, postId: string) {
  const [entry, posts] = await Promise.all([getSpecialEntry(slug), getSpecialPosts(slug)]);
  const post = posts?.find(p => p.uri.endsWith(`/${postId}`));
  return entry && post ? { entry, post } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postId } = await params;
  const data = await load(slug, postId);
  if (!data) return {};

  const text = data.post.record?.text || '';
  const title = `${data.entry.title} — CHW Live`;
  const description = text.length > 200 ? text.slice(0, 197) + '…' : text;
  const ogImage = getImages(data.post)[0]?.fullsize;

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title,
      description,
      url: `https://live.cityhallwatcher.com/special/${slug}/${postId}`,
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

export default async function SpecialPostPage({ params }: Props) {
  const { slug, postId } = await params;
  const data = await load(slug, postId);
  if (!data) notFound();
  const { entry, post } = data;

  const backHref = `/special/${slug}#post-${postId}`;

  return (
    <>
      <SiteHeader subtitle={entry.title} />

      <main className="max-w-[640px] mx-auto px-4 py-6 pb-12">
        <div className="flex items-center justify-between mb-4 gap-3">
          <a
            href={backHref}
            className="hover:underline truncate"
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pale-blue-text)' }}
          >
            ← {entry.title}
          </a>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            {formatPostDate(post.indexedAt)}
          </span>
        </div>

        <PostCard post={post} isNew={false} />

        <div
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-4"
          style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}
        >
          <a href={backHref} className="hover:text-brand-blue hover:underline transition-colors">
            ← Back to {entry.title}
          </a>
          <a
            href={`https://bsky.app/profile/${post.author.handle}/post/${postId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-blue hover:underline transition-colors"
          >
            View on Bluesky →
          </a>
        </div>
      </main>
    </>
  );
}
