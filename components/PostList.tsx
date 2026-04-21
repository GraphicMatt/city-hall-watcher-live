import type { BlueskyPost } from '@/lib/bluesky';
import PostCard from './PostCard';

interface PostListProps {
  posts: BlueskyPost[];
  newUris: Set<string>;
  order: 'newest' | 'oldest';
}

export default function PostList({ posts, newUris, order }: PostListProps) {
  if (!posts.length) {
    return (
      <div className="text-center py-12 text-sm text-[#999] dark:text-[#555]">
        No posts yet — replies will appear here as you add them.
      </div>
    );
  }

  const sorted = [...posts].sort((a, b) => {
    const diff = new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime();
    return order === 'newest' ? diff : -diff;
  });

  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map(post => (
        <PostCard key={post.uri} post={post} isNew={newUris.has(post.uri)} />
      ))}
    </div>
  );
}
