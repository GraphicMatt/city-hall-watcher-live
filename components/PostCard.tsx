import type { BlueskyPost, BlueskyFacetLink, VideoSegment } from '@/lib/bluesky';
import { getImages, formatTime, getYoutubeTimestampUrl, formatYoutubeOffset } from '@/lib/bluesky';
import { decodeHtmlEntities } from '@/lib/twitter';
import ImageGallery from './ImageGallery';

interface PostCardProps {
  post: BlueskyPost;
  isNew: boolean;
  slug?: string;
  videoSegments?: VideoSegment[];
}

// Regex URL linkifier used as a fallback for Twitter posts that pre-date
// facet generation, and to strip residual t.co media links.
function linkifyPlainUrls(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/\S+/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const url = match[0]!;
    nodes.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer"
         className="text-brand-blue dark:text-blue-400 hover:underline">
        {url}
      </a>
    );
    last = match.index + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

function linkifyText(post: BlueskyPost): React.ReactNode[] {
  // Decode HTML entities for Twitter posts — the archive stores &amp; etc. in raw
  // tweet text. Already-imported posts in KV may still have encoded entities, so
  // we decode at render time as well as at import time.
  const rawText = post.record?.text || '';
  const text = post.platform === 'twitter' ? decodeHtmlEntities(rawText) : rawText;
  const facets = post.record?.facets || [];

  // Twitter posts stored before facet generation: linkify via regex and strip
  // any residual t.co media links (image is already shown in the embed).
  if (post.platform === 'twitter' && !facets.length) {
    const hasImages = getImages(post).length > 0;
    const cleaned = hasImages ? text.replace(/\s*https:\/\/t\.co\/\S+/g, '').trim() : text;
    return linkifyPlainUrls(cleaned);
  }

  if (!facets.length) return [text];

  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const nodes: React.ReactNode[] = [];
  let pos = 0;

  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index;
    if (byteStart > pos) {
      nodes.push(new TextDecoder().decode(bytes.slice(pos, byteStart)));
    }
    const segText = new TextDecoder().decode(bytes.slice(byteStart, byteEnd));
    const linkFeature = facet.features?.find((f): f is BlueskyFacetLink => f.$type === 'app.bsky.richtext.facet#link');
    if (linkFeature?.uri) {
      nodes.push(
        <a
          key={byteStart}
          href={linkFeature.uri}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-blue dark:text-blue-400 hover:underline"
        >
          {segText}
        </a>
      );
    } else {
      nodes.push(segText);
    }
    pos = byteEnd;
  }

  if (pos < bytes.length) {
    nodes.push(new TextDecoder().decode(bytes.slice(pos)));
  }

  return nodes;
}

export default function PostCard({ post, isNew, slug, videoSegments }: PostCardProps) {
  const images = getImages(post);
  const postId = post.uri.split('/').pop();
  const isTwitter = post.platform === 'twitter';
  const externalUrl = isTwitter
    ? `https://twitter.com/GraphicMatt/status/${post.twitterId}`
    : `https://bsky.app/profile/${post.author.handle}/post/${postId}`;
  const externalLabel = isTwitter ? 'View on Twitter/X' : 'View on Bluesky';
  const bskyUrl = externalUrl;
  const permalinkUrl = slug ? `/${slug}/${postId}` : null;
  const ytResult = videoSegments?.length ? getYoutubeTimestampUrl(post, videoSegments) : null;

  return (
    <div
      className={`post-card ${isNew ? 'post-card-flash' : 'bg-white'}`}
      style={{
        borderRadius: '12px',
        padding: '18px 20px 14px 20px',
        boxShadow: 'rgba(20, 20, 15, 0.04) 0px 1px 2px 0px',
      }}
    >
      <p
        className="text-chw-text whitespace-pre-wrap break-words"
        style={{ fontSize: '16px', lineHeight: '24.8px', fontWeight: 400 }}
      >
        {linkifyText(post)}
      </p>
      {images.length > 0 && <ImageGallery images={images} />}
      {post.quotedPost && (
        <a
          href={post.quotedPost.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block border border-border rounded-lg px-3.5 py-3 hover:border-chw-secondary transition-colors bg-bg-secondary"
        >
          <p className="text-xs font-medium text-chw-text">
            {post.quotedPost.authorName}
            <span className="font-normal text-chw-tertiary ml-1.5">@{post.quotedPost.authorHandle}</span>
          </p>
          <p className="text-xs leading-[1.6] text-chw-secondary whitespace-pre-wrap break-words mt-1">
            {post.quotedPost.text}
          </p>
        </a>
      )}
      <div className="flex items-center justify-between" style={{ marginTop: '12px' }}>
        <a
          href={permalinkUrl ?? bskyUrl}
          {...(permalinkUrl ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="hover:text-brand-blue transition-colors hover:underline"
          style={{ fontSize: '12.5px', color: 'rgb(154, 152, 142)' }}
          title={permalinkUrl ? 'Permalink' : externalLabel}
        >
          {formatTime(post.indexedAt)}
        </a>
        <span
          className="flex items-center gap-2.5"
          style={{ fontSize: '12px', color: 'rgb(154, 152, 142)' }}
        >
          {ytResult && (
            <a
              href={ytResult.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Watch on YouTube — ${ytResult.segment.label}`}
              className="hover:text-live-red transition-colors"
            >
              ▶ {formatYoutubeOffset(ytResult.offsetSeconds)}
            </a>
          )}
          {post.likeCount ? <span>♡ {post.likeCount}</span> : null}
          {post.repostCount ? <span>↺ {post.repostCount}</span> : null}
          {post.replyCount ? <span>↩ {post.replyCount}</span> : null}
        </span>
      </div>
    </div>
  );
}
