import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import LivePoller from './LivePoller';
import PostList from './PostList';
import { fetchThreadPosts } from '@/lib/bluesky';
import type { BlueskyPost } from '@/lib/bluesky';
import { getLastRead, setLastRead } from '@/lib/lastRead';
import { beginLiveVisit } from '@/lib/liveVisit';
import { intersect, TestIntersectionObserver } from '../tests/browser';

vi.mock('@/lib/bluesky', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/bluesky')>(), fetchThreadPosts: vi.fn(),
}));
vi.mock('./SiteHeader', () => ({ default: () => <header>City Hall Watcher</header> }));

const rootUri = 'at://did:plc:author/app.bsky.feed.post/meeting';
function post(id: number): BlueskyPost {
  return {
    uri: `at://did:plc:author/app.bsky.feed.post/post${id}`, cid: `cid${id}`,
    author: { did: 'did:plc:author', handle: 'author' },
    record: { text: `Coverage update ${id}` }, indexedAt: `2026-11-15T10:0${id}:00.000Z`,
  };
}
const posts = [post(1), post(2), post(3)];
const card = (id: number) => screen.getByText(`Coverage update ${id}`).closest('.post-card')!;
const marker = (id: number) => card(id).querySelector<HTMLElement>('[data-post-start]')!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchThreadPosts).mockReset().mockResolvedValue(posts);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'live', rootUri }))));
});

async function open(root = rootUri, strict = false) {
  const element = <LivePoller key={root} rootUri={root} authorDid="did:plc:author" />;
  const view = render(strict ? <StrictMode>{element}</StrictMode> : element);
  await act(async () => {});
  return view;
}

it('does not fade, auto-scroll or mark fetched posts read on a first visit', async () => {
  await open();
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(0);
  expect(getLastRead(rootUri)).toBeNull();
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it('saves a post only after three seconds and freezes the current visit’s appearance', async () => {
  await open();
  act(() => { intersect(marker(2)); vi.advanceTimersByTime(2999); });
  expect(getLastRead(rootUri)).toBeNull();
  act(() => { vi.advanceTimersByTime(1); });
  expect(getLastRead(rootUri)).toBe(post(2).indexedAt);
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(0);
  act(() => { intersect(marker(1)); vi.advanceTimersByTime(3000); });
  expect(getLastRead(rootUri)).toBe(post(2).indexedAt);
});

it('fades through the saved cutoff and scrolls to the newest post on return', async () => {
  const first = await open();
  act(() => { intersect(marker(2)); vi.advanceTimersByTime(3000); });
  first.unmount();
  await open();
  expect(card(1).classList.contains('post-card-read')).toBe(true);
  expect(card(2).classList.contains('post-card-read')).toBe(true);
  expect(card(3).classList.contains('post-card-read')).toBe(false);
  expect(vi.mocked(Element.prototype.scrollIntoView).mock.instances[0]).toBe(document.getElementById('post-post3'));
  expect(screen.getByRole('button', { name: /1 new post/ })).toBeTruthy();
});

it('returns to the latest post even if no post qualified during the previous visit', async () => {
  const first = await open();
  first.unmount();
  await open();
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(0);
});

it('marks every currently loaded post read immediately on explicit Mark read', async () => {
  setLastRead(rootUri, post(1).indexedAt);
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
  expect(getLastRead(rootUri)).toBe(post(3).indexedAt);
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Mark read' })).toBeNull();
});

it('does not move the reader or fade new posts when later polls add posts', async () => {
  setLastRead(rootUri, post(1).indexedAt);
  await open();
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
  vi.mocked(fetchThreadPosts).mockResolvedValue([...posts, post(4)]);
  await act(async () => { vi.advanceTimersByTime(45_000); });
  expect(card(4).classList.contains('post-card-read')).toBe(false);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  expect(card(1).classList.contains('post-card-read')).toBe(true);
});

it('preserves manual scrolling that starts before the first fetch finishes', async () => {
  setLastRead(rootUri, post(1).indexedAt);
  let finish!: (value: BlueskyPost[]) => void;
  vi.mocked(fetchThreadPosts).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<LivePoller rootUri={rootUri} authorDid="did:plc:author" />);
  fireEvent.wheel(window);
  await act(async () => { finish(posts); });
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it('gives a direct post link priority over the newest post', async () => {
  setLastRead(rootUri, post(1).indexedAt);
  history.replaceState(null, '', '/#post-post2');
  await open();
  expect(vi.mocked(Element.prototype.scrollIntoView).mock.instances[0]).toBe(document.getElementById('post-post2'));
});

it('does not scroll again or change fading when returning to an open tab', async () => {
  setLastRead(rootUri, post(1).indexedAt);
  await open();
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
  vi.mocked(document.hasFocus).mockReturnValue(false);
  fireEvent.blur(window);
  vi.mocked(document.hasFocus).mockReturnValue(true);
  fireEvent.focus(window);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(1);
});

it('takes a fresh visit snapshot on browser Back from the page cache', async () => {
  await open();
  act(() => { intersect(marker(2)); vi.advanceTimersByTime(3000); });
  await act(async () => {
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
  });
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(2);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
});

it('does not mistake React Strict Mode effect replay for a return visit', async () => {
  await open(rootUri, true);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  expect(getLastRead(rootUri)).toBeNull();
});

it('does not apply another thread’s progress or late fetch result', async () => {
  beginLiveVisit(rootUri);
  setLastRead(rootUri, post(3).indexedAt);
  let finishOld!: (value: BlueskyPost[]) => void;
  vi.mocked(fetchThreadPosts).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
  const view = render(<LivePoller key={rootUri} rootUri={rootUri} authorDid="did:plc:author" />);
  const other = rootUri.replace('/meeting', '/other');
  view.rerender(<LivePoller key={other} rootUri={other} authorDid="did:plc:author" />);
  await act(async () => {});
  await act(async () => { finishOld([post(4)]); });
  expect(screen.queryByText('Coverage update 4')).toBeNull();
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(0);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
});

it('keeps archive visibility tracking immediate and unfaded', () => {
  const seen = vi.fn();
  render(<PostList posts={posts} newUris={new Set()} order="oldest" slug="archive" onPostSeen={seen} />);
  const wrapper = document.getElementById('post-post1')!;
  act(() => { intersect(wrapper, 0.5); });
  expect(seen).toHaveBeenCalledExactlyOnceWith(post(1).indexedAt);
  expect(document.querySelectorAll('.post-card-read')).toHaveLength(0);
  expect(TestIntersectionObserver.instances[0].thresholds).toEqual([0.5]);
});
