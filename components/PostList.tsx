import type { BlueskyPost } from '@/lib/bluesky';
import PostCard from './PostCard';

export type SortOrder = 'newest' | 'oldest' | 'most-liked' | 'most-reposted';

interface PostListProps {
  posts: BlueskyPost[];
  newUris: Set<string>;
  order: SortOrder;
  slug?: string;
}

export default function PostList({ posts, newUris, order, slug }: PostListProps) {
  if (!posts.length) {
    return (
      <div className="text-center py-12 text-sm text-[#999] dark:text-[#555]">
        No posts yet — replies will appear here as you add them.
      </div>
    );
  }

  const sorted = [...posts].sort((a, b) => {
    if (order === 'oldest') return new Date(a.indexedAt).getTime() - new Date(b.indexedAt).getTime();
    if (order === 'most-liked') return (b.likeCount ?? 0) - (a.likeCount ?? 0);
    if (order === 'most-reposted') return (b.repostCount ?? 0) - (a.repostCount ?? 0);
    return new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime(); // newest
  });

  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map(post => (
        <PostCard key={post.uri} post={post} isNew={newUris.has(post.uri)} slug={slug} />
      ))}
    </div>
  );
}
