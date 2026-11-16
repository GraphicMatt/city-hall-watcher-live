import { beforeEach, expect, it, vi } from 'vitest';
import { prepareReturnScroll } from './returnScroll';

const posts = [
  { uri: 'at://did:plc:author/app.bsky.feed.post/old', indexedAt: '2026-11-15T10:00:00.000Z' },
  { uri: 'at://did:plc:author/app.bsky.feed.post/new', indexedAt: '2026-11-15T10:05:00.000Z' },
];

beforeEach(() => {
  vi.useFakeTimers();
  posts.forEach(post => {
    const target = document.createElement('div');
    target.dataset.postUri = post.uri;
    target.id = `post-${post.uri.split('/').pop()}`;
    document.body.append(target);
  });
});

it('scrolls once to the beginning of the newest post on a return visit', () => {
  const scroll = prepareReturnScroll();
  scroll.restore(posts, true);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'auto' });
  expect(vi.mocked(Element.prototype.scrollIntoView).mock.instances[0]).toBe(document.getElementById('post-new'));
  scroll.restore([...posts, { uri: 'later', indexedAt: '2026-11-15T10:10:00.000Z' }], true);
  window.dispatchEvent(new Event('focus'));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  scroll.dispose();
});

it('does not jump on the first visit', () => {
  const scroll = prepareReturnScroll();
  scroll.restore(posts, false);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  scroll.dispose();
});

it('waits for the first populated result', () => {
  const scroll = prepareReturnScroll();
  scroll.restore([], true);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  scroll.restore(posts, true);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  scroll.dispose();
});

it.each(['wheel', 'touchmove', 'scroll', 'pointerdown'])('cancels an initial jump after %s input', event => {
  const scroll = prepareReturnScroll();
  window.dispatchEvent(new Event(event));
  scroll.restore(posts, true);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  scroll.dispose();
});

it('cancels the jump for keyboard scrolling', () => {
  const scroll = prepareReturnScroll();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
  scroll.restore(posts, true);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  scroll.dispose();
});

it('opens an explicit post link instead of the latest post, including on a first visit', () => {
  history.replaceState(null, '', '/#post-old');
  const scroll = prepareReturnScroll();
  scroll.restore(posts, false);
  expect(vi.mocked(Element.prototype.scrollIntoView).mock.instances[0]).toBe(document.getElementById('post-old'));
  scroll.dispose();
});

it('does not replace an unknown fragment with a different destination', () => {
  history.replaceState(null, '', '/#post-missing');
  const scroll = prepareReturnScroll();
  scroll.restore(posts, true);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  scroll.dispose();
});

it('does not move a page that finishes loading in the background', () => {
  vi.mocked(document.hasFocus).mockReturnValue(false);
  const scroll = prepareReturnScroll();
  scroll.restore(posts, true);
  vi.mocked(document.hasFocus).mockReturnValue(true);
  window.dispatchEvent(new Event('focus'));
  scroll.restore(posts, true);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  scroll.dispose();
});

it('stops image-layout corrections after the reader starts scrolling', () => {
  const image = document.createElement('img');
  Object.defineProperty(image, 'complete', { value: false });
  document.body.prepend(image);
  const scroll = prepareReturnScroll();
  scroll.restore(posts, true);
  window.dispatchEvent(new Event('wheel'));
  image.dispatchEvent(new Event('load'));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  scroll.dispose();
});
