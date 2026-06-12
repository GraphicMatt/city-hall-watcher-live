import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArchivePosts, getArchiveIndex } from '@/lib/kv';
import { getImages, getYoutubeTimestampUrl, formatYoutubeOffset } from '@/lib/bluesky';
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
      type: 'article',
      title,
      description,
      url: `https://live.cityhallwatcher.com/${slug}/${postId}`,
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

const EMPTY_URIS = new Set<string>();

export default async function PostPage({ params }: Props) {
  const { slug, postId } = await params;

  const [posts, index] = await Promise.all([getArchivePosts(slug), getArchiveIndex()]);
  if (!posts) notFound();

  const post = posts.find(p => p.uri.endsWith(`/${postId}`));
  if (!post) notFound();

  const entry = index.find(e => e.slug === slug);
  const label = entry?.label ?? slug;

  const isTwitter = post.platform === 'twitter';
  const externalUrl = isTwitter && post.twitterId
    ? `https://twitter.com/GraphicMatt/status/${post.twitterId}`
    : `https://bsky.app/profile/${post.author.handle}/post/${postId}`;
  const externalLabel = isTwitter ? 'View on X →' : 'View on Bluesky →';
  const videoSegments = entry?.metadata?.videoSegments;
  const ytResult = videoSegments?.length ? getYoutubeTimestampUrl(post, videoSegments) : null;

  return (
    <>
      <SiteHeader subtitle={label} />

      <main className="max-w-[640px] mx-auto px-4 py-6 pb-12">
        {/* Context bar */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <a
            href={`/${slug}#post-${postId}`}
            className="hover:underline truncate"
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--pale-blue-text)' }}
          >
            ← {label}
          </a>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            {formatPostDate(post.indexedAt)}
          </span>
        </div>

        <PostCard post={post} isNew={false} />

        {/* Footer links */}
        <div
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-4"
          style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}
        >
          <a
            href={`/${slug}#post-${postId}`}
            className="hover:text-brand-blue hover:underline transition-colors"
          >
            ← Back to {label}
          </a>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {ytResult && (
              <a
                href={ytResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-live-red hover:underline transition-colors"
              >
                ▶ Watch — {ytResult.segment.label} at {formatYoutubeOffset(ytResult.offsetSeconds)}
              </a>
            )}
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-blue hover:underline transition-colors"
            >
              {externalLabel}
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
