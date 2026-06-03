'use client';

import type { SortOrder } from './PostList';

interface UnreadBannerProps {
  count: number;
  order: SortOrder;
  onJump: () => void;
  onMarkRead: () => void;
}

export default function UnreadBanner({ count, order, onJump, onMarkRead }: UnreadBannerProps) {
  if (count === 0) return null;

  const arrow = order === 'newest' ? '↑' : order === 'oldest' ? '↓' : '';

  return (
    <div className="fixed top-[52px] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div className="flex items-center gap-2 bg-[#1a6bbf] dark:bg-[#1a5aa0] text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg pointer-events-auto">
        <button
          onClick={onJump}
          className="hover:underline whitespace-nowrap"
        >
          {arrow && `${arrow} `}{count} new {count === 1 ? 'post' : 'posts'}
        </button>
        <span className="opacity-40">·</span>
        <button
          onClick={onMarkRead}
          className="opacity-70 hover:opacity-100 transition-opacity whitespace-nowrap"
        >
          Mark read
        </button>
      </div>
    </div>
  );
}
