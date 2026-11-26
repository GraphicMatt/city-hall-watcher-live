export const READ_DELAY_MS = 3_000;
// Keep the observed start of a post below the sticky header and unread banner.
export const LIVE_SCROLL_OFFSET = 96;

export function observeLivePostStarts(container: HTMLElement, onSeen: (indexedAt: string) => void): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const pending = new Map<Element, ReturnType<typeof setTimeout>>();
  const qualified = new Set<Element>();
  const visible = new Set<Element>();
  const isActive = () => document.visibilityState === 'visible' && document.hasFocus();
  let active = isActive();

  function reset() {
    pending.forEach(timer => clearTimeout(timer));
    pending.clear();
    visible.clear();
    observer.disconnect();
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const target = entry.target;
      if (!entry.isIntersecting || entry.intersectionRatio < 1) {
        visible.delete(target);
        const timer = pending.get(target);
        if (timer) clearTimeout(timer);
        pending.delete(target);
        return;
      }
      visible.add(target);
      if (!active || qualified.has(target) || pending.has(target)) return;
      pending.set(target, setTimeout(() => {
        pending.delete(target);
        if (!isActive() || !visible.has(target)) return;
        const timestamp = (target as HTMLElement).dataset.postStart;
        if (timestamp) {
          qualified.add(target);
          onSeen(timestamp);
        }
      }, READ_DELAY_MS));
    });
  }, { threshold: 1, rootMargin: `-${LIVE_SCROLL_OFFSET}px 0px 0px 0px` });

  function observe() {
    container.querySelectorAll('[data-post-start]').forEach(target => observer.observe(target));
  }

  function activityChanged() {
    const next = isActive();
    if (next === active) return;
    active = next;
    reset();
    // Re-observe on resume so timers start from fresh intersections, not
    // geometry retained while a tab was hidden or another app had focus.
    if (active) observe();
  }

  function pageHidden() { active = false; reset(); }
  function pageShown() { activityChanged(); }

  if (active) observe();
  document.addEventListener('visibilitychange', activityChanged);
  window.addEventListener('focus', activityChanged);
  window.addEventListener('blur', activityChanged);
  window.addEventListener('pagehide', pageHidden);
  window.addEventListener('pageshow', pageShown);
  return () => {
    reset();
    document.removeEventListener('visibilitychange', activityChanged);
    window.removeEventListener('focus', activityChanged);
    window.removeEventListener('blur', activityChanged);
    window.removeEventListener('pagehide', pageHidden);
    window.removeEventListener('pageshow', pageShown);
  };
}
