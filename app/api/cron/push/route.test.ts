import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getActiveSession, acquireLease, releaseLease } from '@/lib/kv';
import { fetchThreadPosts } from '@/lib/bluesky';
import { deliverThreadUpdates } from '@/lib/push/delivery';

vi.mock('@/lib/kv', () => ({ getActiveSession: vi.fn(), acquireLease: vi.fn(), releaseLease: vi.fn() }));
vi.mock('@/lib/bluesky', () => ({ fetchThreadPosts: vi.fn() }));
vi.mock('@/lib/push/delivery', () => ({ deliverThreadUpdates: vi.fn() }));

const request = (auth = 'Bearer cron-secret') => new NextRequest('https://example.com/api/cron/push', { headers: { authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'A'.repeat(87));
  vi.stubEnv('VAPID_PRIVATE_KEY', 'A'.repeat(43));
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');
  vi.mocked(acquireLease).mockResolvedValue(true);
  vi.mocked(getActiveSession).mockResolvedValue({
    rootUri: 'at://did:plc:author/app.bsky.feed.post/root', authorDid: 'did:plc:author',
    rootUrl: 'https://bsky.app/profile/author/post/root', status: 'live', startedAt: new Date().toISOString(),
  });
  vi.mocked(fetchThreadPosts).mockResolvedValue([]);
  vi.mocked(deliverThreadUpdates).mockResolvedValue({ sent: 0, removed: 0, failed: 0, complete: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('requires the cron secret', async () => {
  expect((await GET(request('Bearer wrong'))).status).toBe(401);
  expect(acquireLease).not.toHaveBeenCalled();
});

it('does not overlap an existing poll', async () => {
  vi.mocked(acquireLease).mockResolvedValue(false);
  expect(await (await GET(request())).json()).toEqual({ action: 'already-running' });
  expect(fetchThreadPosts).not.toHaveBeenCalled();
  expect(releaseLease).not.toHaveBeenCalled();
});

it('does not poll ended coverage', async () => {
  vi.mocked(getActiveSession).mockResolvedValue(null);
  expect(await (await GET(request())).json()).toEqual({ action: 'not-live' });
  expect(fetchThreadPosts).not.toHaveBeenCalled();
  expect(releaseLease).toHaveBeenCalledTimes(1);
});

it('releases its lease after a successful poll', async () => {
  expect((await GET(request())).status).toBe(200);
  expect(deliverThreadUpdates).toHaveBeenCalledTimes(1);
  expect(releaseLease).toHaveBeenCalledWith('push:poll-lock', vi.mocked(acquireLease).mock.calls[0][1]);
});

it('releases its lease after feed failures', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(fetchThreadPosts).mockRejectedValueOnce(new Error('feed unavailable'));
  expect((await GET(request())).status).toBe(503);
  expect(releaseLease).toHaveBeenCalledTimes(1);
});
