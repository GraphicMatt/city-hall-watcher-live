'use client';

import { useState } from 'react';
import type { BlueskyImage } from '@/lib/bluesky';

interface ImageGalleryProps {
  images: BlueskyImage[];
}

export default function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');

  if (!images.length) return null;

  const count = Math.min(images.length, 4);
  const visible = images.slice(0, count);

  const gridClass =
    count === 1 ? 'grid-cols-1' :
    count === 2 ? 'grid-cols-2' :
    'grid-cols-2';

  return (
    <>
      <div className={`mt-2 grid gap-1 ${gridClass}`}>
        {visible.map((img, i) => (
          <div
            key={i}
            className={`cursor-zoom-in overflow-hidden rounded-md border border-[#e0e0d8] dark:border-[#2a2a2a] bg-[#f0f0eb] dark:bg-[#111] ${count === 1 ? 'flex items-center justify-center' : `aspect-[16/10] ${count === 3 && i === 0 ? 'col-span-2' : ''}`}`}
            onClick={() => { setLightboxSrc(img.fullsize || img.thumb); setLightboxAlt(img.alt || ''); }}
          >
            <img
              src={img.thumb || img.fullsize}
              alt={img.alt || ''}
              loading="lazy"
              className={`block hover:opacity-90 transition-opacity duration-150 ${count === 1 ? 'w-full max-h-[480px] object-contain' : 'w-full h-full object-contain'}`}
            />
          </div>
        ))}
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/88 z-50 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="fixed top-4 right-5 text-white text-3xl leading-none opacity-70 hover:opacity-100 bg-transparent border-none px-2 py-1 cursor-pointer"
            onClick={() => setLightboxSrc(null)}
          >
            ✕
          </button>
          <img
            src={lightboxSrc}
            alt={lightboxAlt}
            className="max-w-[92vw] max-h-[92vh] object-contain rounded"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
