import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      location: { origin: 'https://example.com' },
      registration: { showNotification }, clients: { matchAll, openWindow },
    },
  });
  return {
    showNotification, openWindow, matchAll,
    async dispatch(name: string, fields: Record<string, unknown>) {
      let work = Promise.resolve();
      handlers.get(name)?.({ ...fields, waitUntil: (promise: Promise<void>) => { work = promise; } });
      await work;
    },
  };
}

it('always displays received pushes, with replacement requested for the thread', async () => {
  const sw = worker();
  await sw.dispatch('push', { data: { json: () => ({ title: 'Council', body: 'Update', tag: 'thread', url: '/thread/abc?post=123' }) } });
  expect(sw.showNotification).toHaveBeenCalledWith('Council', expect.objectContaining({
    body: 'Update', tag: 'thread', renotify: true, data: { url: '/thread/abc?post=123' },
  }));
});

it('shows a fallback instead of silently dropping malformed pushes', async () => {
  const sw = worker();
  await sw.dispatch('push', { data: { json: () => { throw new Error('bad data'); } } });
  expect(sw.showNotification).toHaveBeenCalledOnce();
});

it('opens the stable website URL when a notification is tapped', async () => {
  const sw = worker();
  const close = vi.fn();
  await sw.dispatch('notificationclick', { notification: { close, data: { url: '/thread/abc?post=123' } } });
  expect(close).toHaveBeenCalledOnce();
  expect(sw.openWindow).toHaveBeenCalledWith('https://example.com/thread/abc?post=123');
});

it('cannot navigate to a different origin from a notification payload', async () => {
  const sw = worker();
  await sw.dispatch('notificationclick', { notification: { close: vi.fn(), data: { url: 'https://evil.example/' } } });
  expect(sw.openWindow).toHaveBeenCalledWith('https://example.com/');
});
