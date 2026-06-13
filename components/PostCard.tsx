import type { BlueskyPost, BlueskyFacetLink, BlueskyFacetMention, BlueskyFacetTag, VideoSegment } from '@/lib/bluesky';
import { getImages, formatTime, getYoutubeTimestampUrl, formatYoutubeOffset } from '@/lib/bluesky';
import { decodeHtmlEntities } from '@/lib/twitter';
import ImageGallery from './ImageGallery';

interface PostCardProps {
  post: BlueskyPost;
  isNew: boolean;
  slug?: string;
  videoSegments?: VideoSegment[];
}

// Visual treatment for hashtags — set apart from surrounding text without
// implying it's a (potentially long-dead) link to the original platform.
const HASHTAG_CLASSNAME = 'font-medium text-chw-secondary';

// Matches URLs, @mentions, and #hashtags in Twitter-era plain text (no
// facets). Twitter handles are 1-15 word characters; the negative lookbehind
// keeps these from matching mid-string, e.g. the "domain" part of
// "name@example.com" or a Bluesky-style "@handle.bsky.social" (those come
// through with real facets). Hashtags must start with a letter so things like
// "item #15" aren't mistaken for tags.
const TWITTER_TOKEN_RE = /(https?:\/\/\S+)|((?<![\w@.])@\w{1,15})|((?<![\w#])#[a-zA-Z]\w*)/g;

// Regex linkifier used as a fallback for Twitter posts that pre-date facet
// generation: linkifies plain URLs and @mentions (to twitter.com profiles),
// and visually sets off #hashtags.
function linkifyPlainText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = TWITTER_TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0]!;
    if (token.startsWith('#')) {
      nodes.push(<span key={match.index} className={HASHTAG_CLASSNAME}>{token}</span>);
    } else {
      const href = token.startsWith('@') ? `https://twitter.com/${token.slice(1)}` : token;
      nodes.push(
        <a key={match.index} href={href} target="_blank" rel="noopener noreferrer"
           className="text-brand-blue dark:text-blue-400 hover:underline">
          {token}
        </a>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : [text];
}

// Old-style manual retweets/modified tweets, from before Twitter had a native
// retweet button: "<your comment> RT @handle: <their tweet>" or "MT" for a
// modified/abridged quote. \b before RT/MT keeps this from matching mid-word
// (e.g. "PORT @x"); the lead is non-greedy so it stops at the first such marker.
const OLD_RT_RE = /^([\s\S]*?)\b(RT|MT)\s+@(\w{1,15}):\s*([\s\S]+)$/i;

interface OldRetweet {
  lead: string;
  label: string;
  handle: string;
  quoted: string;
}

function parseOldStyleRetweet(post: BlueskyPost): OldRetweet | null {
  if (post.platform !== 'twitter' || post.quotedPost) return null;
  if ((post.record?.facets ?? []).length) return null;

  const text = decodeHtmlEntities(post.record?.text || '');
  const hasImages = getImages(post).length > 0;
  const cleaned = hasImages ? text.replace(/\s*https:\/\/t\.co\/\S+/g, '').trim() : text;

  const match = OLD_RT_RE.exec(cleaned);
  if (!match) return null;
  const [, lead, label, handle, quoted] = match;
  return { lead: lead!.trim(), label: label!.toUpperCase(), handle: handle!, quoted: quoted!.trim() };
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
    return linkifyPlainText(cleaned);
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
    const mentionFeature = facet.features?.find((f): f is BlueskyFacetMention => f.$type === 'app.bsky.richtext.facet#mention');
    const tagFeature = facet.features?.find((f): f is BlueskyFacetTag => f.$type === 'app.bsky.richtext.facet#tag');
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
    } else if (mentionFeature?.did) {
      nodes.push(
        <a
          key={byteStart}
          href={`https://bsky.app/profile/${mentionFeature.did}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-blue dark:text-blue-400 hover:underline"
        >
          {segText}
        </a>
      );
    } else if (tagFeature) {
      nodes.push(<span key={byteStart} className={HASHTAG_CLASSNAME}>{segText}</span>);
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
  const retweet = parseOldStyleRetweet(post);

  return (
    <div
      className={`post-card ${isNew ? 'post-card-flash' : ''}`}
      style={{
        background: isNew ? undefined : 'var(--card)',
        borderRadius: '12px',
        padding: '18px 20px 14px 20px',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {retweet ? (
        <>
          {retweet.lead.length > 0 && (
            <p
              className="text-chw-text whitespace-pre-wrap break-words"
              style={{ fontSize: '16px', lineHeight: '24.8px', fontWeight: 400 }}
            >
              {linkifyPlainText(retweet.lead)}
            </p>
          )}
          <a
            href={`https://twitter.com/${retweet.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`block border border-border rounded-lg px-3.5 py-3 hover:border-chw-secondary transition-colors bg-bg-secondary ${retweet.lead.length > 0 ? 'mt-3' : ''}`}
          >
            <p className="text-xs font-medium text-chw-text">
              {retweet.label} <span className="font-normal text-chw-tertiary">@{retweet.handle}</span>
            </p>
            <p className="text-xs leading-[1.6] text-chw-secondary whitespace-pre-wrap break-words mt-1">
              {linkifyPlainText(retweet.quoted)}
            </p>
          </a>
        </>
      ) : (
        <p
          className="text-chw-text whitespace-pre-wrap break-words"
          style={{ fontSize: '16px', lineHeight: '24.8px', fontWeight: 400 }}
        >
          {linkifyText(post)}
        </p>
      )}
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
          style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}
          title={permalinkUrl ? 'Permalink' : externalLabel}
        >
          {formatTime(post.indexedAt)}
        </a>
        <span
          className="flex items-center gap-2.5"
          style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}
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
