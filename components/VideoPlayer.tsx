'use client';

import { useEffect, useRef, useState } from 'react';
import type { BlueskyVideo } from '@/lib/bluesky';

interface VideoPlayerProps {
  video: BlueskyVideo;
  postUrl: string;
}

export default function VideoPlayer({ video, postUrl }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    // Safari plays HLS natively; everywhere else needs hls.js.
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = video.playlist;
      return;
    }

    let hls: import('hls.js').default | undefined;
    let cancelled = false;
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        setError(true);
        return;
      }
      hls = new Hls();
      hls.loadSource(video.playlist);
      hls.attachMedia(el);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(true);
      });
    });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [video.playlist]);

  const aspectRatio = video.aspectRatio ? video.aspectRatio.width / video.aspectRatio.height : 16 / 9;

  if (error) {
    // Playback unsupported in this browser — fall back to a thumbnail that
    // links out to the original post.
    return (
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 relative block overflow-hidden rounded-md border border-[#e0e0d8] dark:border-[#2a2a2a] bg-black"
        style={{ aspectRatio, maxHeight: '70vh' }}
      >
        {video.thumbnail && (
          <img src={video.thumbnail} alt="" className="w-full h-full object-contain opacity-80" />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs font-medium">
            ▶ View video on Bluesky
          </span>
        </span>
      </a>
    );
  }

  return (
    <div
      className="mt-2 overflow-hidden rounded-md border border-[#e0e0d8] dark:border-[#2a2a2a] bg-black"
      style={{ aspectRatio, maxHeight: '70vh' }}
    >
      <video
        ref={videoRef}
        poster={video.thumbnail || undefined}
        controls
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  );
}
