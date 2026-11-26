import { beforeEach, expect, it, vi } from 'vitest';
import { observeLivePostStarts, READ_DELAY_MS } from './postVisibility';
import { TestIntersectionObserver, intersect } from '../tests/browser';

const timestamp = '2026-11-15T10:00:00.000Z';
let container: HTMLDivElement;
let marker: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  marker = document.createElement('span');
  marker.dataset.postStart = timestamp;
  container.append(marker);
});

it('requires three continuous seconds with the full post beginning visible', () => {
  const seen = vi.fn();
  const stop = observeLivePostStarts(container, seen);
  intersect(marker, 0.5);
  vi.advanceTimersByTime(READ_DELAY_MS);
  expect(seen).not.toHaveBeenCalled();
  intersect(marker);
  vi.advanceTimersByTime(READ_DELAY_MS - 1);
  expect(seen).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(seen).toHaveBeenCalledExactlyOnceWith(timestamp);
  stop();
});

it('resets the timer when the beginning scrolls out of view', () => {
  const seen = vi.fn();
  const stop = observeLivePostStarts(container, seen);
  intersect(marker);
  vi.advanceTimersByTime(2000);
  intersect(marker, 0);
  vi.advanceTimersByTime(2000);
  expect(seen).not.toHaveBeenCalled();
  intersect(marker);
  vi.advanceTimersByTime(2999);
  expect(seen).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(seen).toHaveBeenCalledOnce();
  stop();
});

it.each(['blur', 'visibilitychange'])('resets timers when the page becomes inactive through %s', event => {
  const seen = vi.fn();
  const stop = observeLivePostStarts(container, seen);
  intersect(marker);
  vi.advanceTimersByTime(2000);
  vi.mocked(document.hasFocus).mockReturnValue(false);
  (event === 'blur' ? window : document).dispatchEvent(new Event(event));
  vi.advanceTimersByTime(10_000);
  expect(seen).not.toHaveBeenCalled();
  vi.mocked(document.hasFocus).mockReturnValue(true);
  window.dispatchEvent(new Event('focus'));
  intersect(marker);
  vi.advanceTimersByTime(2999);
  expect(seen).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(seen).toHaveBeenCalledOnce();
  stop();
});

it('does not record a post in a hidden tab even if an old observer callback arrives', () => {
  const seen = vi.fn();
  const stop = observeLivePostStarts(container, seen);
  intersect(marker);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(READ_DELAY_MS);
  expect(seen).not.toHaveBeenCalled();
  stop();
});

it('does not count the time spent in browser history', () => {
  const seen = vi.fn();
  const stop = observeLivePostStarts(container, seen);
  intersect(marker);
  vi.advanceTimersByTime(2000);
  window.dispatchEvent(new Event('pagehide'));
  vi.advanceTimersByTime(60_000);
  window.dispatchEvent(new Event('pageshow'));
  intersect(marker);
  vi.advanceTimersByTime(2999);
  expect(seen).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(seen).toHaveBeenCalledOnce();
  stop();
});

it('qualifies multiple visible post beginnings without depending on full card height', () => {
  const second = document.createElement('span');
  second.dataset.postStart = '2026-11-15T10:05:00.000Z';
  container.append(second);
  const seen = vi.fn();
  const stop = observeLivePostStarts(container, seen);
  intersect(marker); intersect(second);
  vi.advanceTimersByTime(READ_DELAY_MS);
  expect(seen.mock.calls.map(([value]) => value)).toEqual([timestamp, second.dataset.postStart]);
  expect(TestIntersectionObserver.instances[0].rootMargin).toBe('-96px 0px 0px 0px');
  stop();
});

it('cleans up timers and event listeners when the list unmounts', () => {
  const seen = vi.fn();
  const stop = observeLivePostStarts(container, seen);
  intersect(marker);
  stop();
  window.dispatchEvent(new Event('focus'));
  vi.advanceTimersByTime(READ_DELAY_MS);
  expect(seen).not.toHaveBeenCalled();
  expect(TestIntersectionObserver.instances[0].observed.size).toBe(0);
});
