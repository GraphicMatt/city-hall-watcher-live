import { scrollToPost } from './scroll';

interface PostPosition { uri: string; indexedAt: string }

// Install before the first fetch so an early manual scroll cancels the jump.
// Keep cancellation active during the helper's image-layout corrections too.
export function prepareReturnScroll() {
  let cancelled = false;
  let decided = false;
  let stopCorrections = () => {};
  const cancel = () => { cancelled = true; stopCorrections(); };
  const scrolled = () => { if (!decided) cancel(); };
  const navigationKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  const keydown = (event: KeyboardEvent) => { if (navigationKeys.has(event.key)) cancel(); };
  window.addEventListener('scroll', scrolled, { passive: true });
  window.addEventListener('wheel', cancel, { passive: true });
  window.addEventListener('touchmove', cancel, { passive: true });
  window.addEventListener('pointerdown', cancel, { passive: true });
  window.addEventListener('keydown', keydown);

  return {
    restore(posts: PostPosition[], returning: boolean) {
      if (decided || cancelled || !posts.length) return;
      decided = true;
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const hash = window.location.hash;
      let target: PostPosition | undefined;
      if (hash) {
        // Any explicit fragment takes priority, including an invalid post ID.
        // Never replace an explicit destination with a jump to another post.
        try { target = posts.find(post => `#post-${post.uri.split('/').pop()}` === decodeURIComponent(hash)); }
        catch { return; }
      } else if (returning) {
        target = posts.reduce((latest, post) => post.indexedAt > latest.indexedAt ? post : latest);
      }
      if (target) stopCorrections = scrollToPost(target.uri, { block: 'start', behavior: 'auto', preferUnreadMarker: false });
    },
    dispose() {
      cancel();
      window.removeEventListener('scroll', scrolled);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchmove', cancel);
      window.removeEventListener('pointerdown', cancel);
      window.removeEventListener('keydown', keydown);
    },
  };
}
