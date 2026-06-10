'use client';

import { useState, useEffect, useCallback } from 'react';
import type { BlueskyImage } from '@/lib/bluesky';

interface ImageGalleryProps {
  images: BlueskyImage[];
}

export default function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isOpen = lightboxIndex !== null;
  const total = images.length;

  const prev = useCallback(() => {
    setLightboxIndex(i => i !== null ? (i - 1 + total) % total : null);
  }, [total]);

  const next = useCallback(() => {
    setLightboxIndex(i => i !== null ? (i + 1) % total : null);
  }, [total]);

  const close = useCallback(() => setLightboxIndex(null), []);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, prev, next, close]);

  if (!images.length) return null;

  const count = Math.min(images.length, 4);
  const visible = images.slice(0, count);
  const gridClass = count === 1 ? 'grid-cols-1' : 'grid-cols-2';
  const current = lightboxIndex !== null ? images[lightboxIndex] : null;

  return (
    <>
      <div className={`mt-2 grid gap-1 ${gridClass}`}>
        {visible.map((img, i) => (
          <div
            key={i}
            // Reserve a fixed aspect ratio for every tile (including single-image
            // posts) so the layout doesn't shift as images load — a collapsed
            // 0-height container before load was throwing off scroll-to-unread.
            className={`cursor-zoom-in overflow-hidden rounded-md border border-[#e0e0d8] dark:border-[#2a2a2a] bg-[#f0f0eb] dark:bg-[#111] flex items-center justify-center aspect-[16/10] ${count === 3 && i === 0 ? 'col-span-2' : ''}`}
            onClick={() => setLightboxIndex(i)}
          >
            <img
              src={img.thumb || img.fullsize}
              alt={img.alt || ''}
              loading="lazy"
              className="block w-full h-full object-contain hover:opacity-90 transition-opacity duration-150"
            />
          </div>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 bg-black/88 z-50 flex items-center justify-center"
          onClick={close}
        >
          {/* Close */}
          <button
            className="fixed top-4 right-5 text-white text-3xl leading-none opacity-70 hover:opacity-100 bg-transparent border-none px-2 py-1 cursor-pointer"
            onClick={close}
            aria-label="Close"
          >
            ✕
          </button>

          {/* Prev */}
          {total > 1 && (
            <button
              className="fixed left-3 top-1/2 -translate-y-1/2 text-white text-5xl leading-none opacity-60 hover:opacity-100 bg-transparent border-none px-3 py-2 cursor-pointer select-none"
              onClick={e => { e.stopPropagation(); prev(); }}
              aria-label="Previous image"
            >
              ‹
            </button>
          )}

          {/* Image */}
          <img
            src={current.fullsize || current.thumb}
            alt={current.alt || ''}
            className="max-w-[88vw] max-h-[88vh] object-contain rounded cursor-default"
            onClick={e => e.stopPropagation()}
          />

          {/* Next */}
          {total > 1 && (
            <button
              className="fixed right-3 top-1/2 -translate-y-1/2 text-white text-5xl leading-none opacity-60 hover:opacity-100 bg-transparent border-none px-3 py-2 cursor-pointer select-none"
              onClick={e => { e.stopPropagation(); next(); }}
              aria-label="Next image"
            >
              ›
            </button>
          )}

          {/* Counter */}
          {total > 1 && (
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 text-white/60 text-xs tabular-nums">
              {lightboxIndex! + 1} / {total}
            </div>
          )}
        </div>
      )}
    </>
  );
}
