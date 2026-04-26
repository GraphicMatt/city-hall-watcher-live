import type { BlueskyPost, BlueskyFacetLink } from '@/lib/bluesky';
import { getImages, formatTime } from '@/lib/bluesky';
import ImageGallery from './ImageGallery';

interface PostCardProps {
  post: BlueskyPost;
  isNew: boolean;
  slug?: string;
}

function linkifyText(post: BlueskyPost): React.ReactNode[] {
  const text = post.record?.text || '';
  const facets = post.record?.facets || [];
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

export default function PostCard({ post, isNew, slug }: PostCardProps) {
  const images = getImages(post);
  const postId = post.uri.split('/').pop();
  const bskyUrl = `https://bsky.app/profile/${post.author.handle}/post/${postId}`;
  const permalinkUrl = slug ? `/${slug}/${postId}` : null;
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
          title={permalinkUrl ? 'Permalink' : 'View on Bluesky'}
        >
          {formatTime(post.indexedAt)}
        </a>
        {(post.likeCount || post.repostCount || post.replyCount) ? (
          <span className="flex items-center gap-2.5 text-xs text-[#ccc] dark:text-[#3a3a3a]">
            {post.likeCount ? <span>♡ {post.likeCount}</span> : null}
            {post.repostCount ? <span>↺ {post.repostCount}</span> : null}
            {post.replyCount ? <span>↩ {post.replyCount}</span> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
