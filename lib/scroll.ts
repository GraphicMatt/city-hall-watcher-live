// Scrolls to the post with the given URI, then re-corrects the scroll
// position as any not-yet-loaded images above it finish loading and shift
// the layout. Without this, clicking "X new posts" while images are still
// loading can leave the target post scrolled out of view once those images
// pop in and push everything below them down the page.
export function scrollToPost(uri: string): void {
  const els = document.querySelectorAll<HTMLElement>('[data-post-uri]');
  let target: HTMLElement | null = null;
  for (const el of els) {
    if (el.getAttribute('data-post-uri') === uri) {
      target = el;
      break;
    }
  }
  if (!target) return;

  // If this post has a "New" divider above it, center on the divider itself
  // rather than the whole post container — otherwise a tall image attachment
  // pushes the divider (and the post text) below the fold even though the
  // container is "centered".
  const targetEl: HTMLElement = target.querySelector<HTMLElement>('[data-unread-marker]') ?? target;

  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Re-correct for images above the target that load after the initial
  // scroll. Use an instant (non-smooth) re-scroll so corrections don't fight
  // the in-flight smooth scroll or cause visible jank.
  // An <img> is "above" the target if the target follows it in document order.
  const isAbove = (img: Element) =>
    Boolean(img.compareDocumentPosition(targetEl) & Node.DOCUMENT_POSITION_FOLLOWING);

  const imagesAbove = Array.from(document.querySelectorAll('img'))
    .filter(img => !img.complete && isAbove(img));

  if (!imagesAbove.length) return;

  let pending = imagesAbove.length;
  const correct = () => {
    pending -= 1;
    targetEl.scrollIntoView({ behavior: 'auto', block: 'center' });
    if (pending <= 0) cleanup();
  };

  const cleanup = () => {
    imagesAbove.forEach(img => {
      img.removeEventListener('load', correct);
      img.removeEventListener('error', correct);
    });
    clearTimeout(timeout);
  };

  imagesAbove.forEach(img => {
    img.addEventListener('load', correct, { once: true });
    img.addEventListener('error', correct, { once: true });
  });

  // Safety net in case some images never fire load/error.
  const timeout = setTimeout(cleanup, 4000);
}
