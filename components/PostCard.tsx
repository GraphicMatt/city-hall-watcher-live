import type { BlueskyPost, BlueskyFacetLink, VideoSegment } from '@/lib/bluesky';
import { getImages, formatTime, getYoutubeTimestampUrl, formatYoutubeOffset } from '@/lib/bluesky';
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
         className="text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline">
        {url}
      </a>
    );
    last = match.index + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

function linkifyText(post: BlueskyPost): React.ReactNode[] {
  const text = post.record?.text || '';
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
          className="text-[#1a6bbf] dark:text-[#5a9fd4] hover:underline"
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
    <div className={`post-card border border-[#e0e0d8] dark:border-[#2a2a2a] rounded-[10px] px-[15px] py-[13px] ${isNew ? 'post-card-flash' : 'bg-white dark:bg-[#1a1a1a]'}`}>
      <p className="text-sm leading-[1.65] text-[#1a1a1a] dark:text-[#e8e8e0] whitespace-pre-wrap break-words">
        {linkifyText(post)}
      </p>
      {images.length > 0 && <ImageGallery images={images} />}
      <div className="flex items-center justify-between mt-[7px]">
        <a
          href={permalinkUrl ?? bskyUrl}
          {...(permalinkUrl ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          className="text-xs text-[#aaa] dark:text-[#555] hover:text-[#1a6bbf] dark:hover:text-[#5a9fd4] hover:underline transition-colors"
          title={permalinkUrl ? 'Permalink' : externalLabel}
        >
          {formatTime(post.indexedAt)}
        </a>
        <span className="flex items-center gap-2.5 text-xs text-[#ccc] dark:text-[#3a3a3a]">
          {ytResult && (
            <a
              href={ytResult.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Watch on YouTube — ${ytResult.segment.label}`}
              className="hover:text-[#c0392b] dark:hover:text-[#f08080] transition-colors"
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
