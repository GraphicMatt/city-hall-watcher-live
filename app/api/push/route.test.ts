import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { generateVAPIDKeys } from 'web-push';
import { GET, POST, DELETE, PATCH } from './route';
import { getActiveSession, incrementCounter } from '@/lib/kv';
import { getSubscription, saveSubscription, removeSubscription, updatePresence } from '@/lib/push/store';

vi.mock('@/lib/kv', () => ({ getActiveSession: vi.fn(), incrementCounter: vi.fn() }));
vi.mock('@/lib/push/store', () => ({
  deviceId: (token: string) => `hash-${token}`,
  getSubscription: vi.fn(), saveSubscription: vi.fn(), removeSubscription: vi.fn(), updatePresence: vi.fn(),
}));

const rootUri = 'at://did:plc:author/app.bsky.feed.post/root';
const token = 'a-device-capability-token-at-least-32-characters';
const subscription = {
  endpoint: 'https://fcm.googleapis.com/push/token',
  keys: { p256dh: generateVAPIDKeys().publicKey, auth: Buffer.alloc(16, 1).toString('base64url') },
};

function request(method: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('https://example.com/api/push', {
    method,
    headers: { Origin: 'https://example.com', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'A'.repeat(87));
  vi.stubEnv('VAPID_PRIVATE_KEY', 'A'.repeat(43));
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');
  vi.mocked(incrementCounter).mockResolvedValue(1);
  vi.mocked(getSubscription).mockResolvedValue(null);
  vi.mocked(getActiveSession).mockResolvedValue({
    rootUri, rootUrl: 'https://bsky.app/profile/author/post/root', authorDid: 'did:plc:author',
    status: 'live', startedAt: new Date().toISOString(),
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('anonymous device subscription API', () => {
  it('exposes only the public key to unauthenticated configuration reads', async () => {
    const response = await GET(request('GET', null));
    expect(await response.json()).toEqual({ publicKey: 'A'.repeat(87) });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects cross-origin mutations and missing device capabilities', async () => {
    expect((await POST(request('POST', { rootUri, subscription }, { Origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(request('POST', { rootUri, subscription }, { Authorization: '' }))).status).toBe(401);
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it('rejects arbitrary push destinations without saving them', async () => {
    const response = await POST(request('POST', { rootUri, subscription: { ...subscription, endpoint: 'https://127.0.0.1/secret' } }));
    expect(response.status).toBe(400);
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it('requires explicit subscription to the currently live thread', async () => {
    const response = await POST(request('POST', { rootUri: rootUri.replace('/root', '/different'), subscription }));
    expect(response.status).toBe(409);
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it('records server time for a new opt-in', async () => {
    const before = Date.now();
    const response = await POST(request('POST', { rootUri, subscription }));
    expect(response.status).toBe(200);
    const saved = vi.mocked(saveSubscription).mock.calls[0][0];
    expect(saved).toMatchObject({ deviceId: `hash-${token}`, rootUri, subscription });
    expect(saved.subscribedAt).toBeGreaterThanOrEqual(before);
  });

  it('keeps the cutoff on idempotent retries of an existing opt-in', async () => {
    vi.mocked(getSubscription).mockResolvedValue({ deviceId: `hash-${token}`, rootUri, subscription, subscribedAt: 123 });
    await POST(request('POST', { rootUri, subscription }));
    expect(vi.mocked(saveSubscription).mock.calls[0][0].subscribedAt).toBe(123);
  });

  it('removes only the requesting device’s subscription to the specified thread', async () => {
    expect((await DELETE(request('DELETE', { rootUri }))).status).toBe(200);
    expect(removeSubscription).toHaveBeenCalledExactlyOnceWith(rootUri, `hash-${token}`);
  });

  it('does not create presence records for unsubscribed devices', async () => {
    const presence = { rootUri, tabId: 'bdb1664d-c9aa-41c5-b5b1-49a7cbdaf81a', visible: true };
    await PATCH(request('PATCH', presence));
    expect(updatePresence).not.toHaveBeenCalled();
    vi.mocked(getSubscription).mockResolvedValue({ deviceId: `hash-${token}`, rootUri, subscription, subscribedAt: 123 });
    await PATCH(request('PATCH', presence));
    expect(updatePresence).toHaveBeenCalledWith(rootUri, `hash-${token}`, presence.tabId, true);
  });

  it('rate limits anonymous mutations', async () => {
    vi.mocked(incrementCounter).mockResolvedValue(61);
    expect((await POST(request('POST', { rootUri, subscription }))).status).toBe(429);
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it('fails closed when VAPID credentials or production storage are missing', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    expect((await POST(request('POST', { rootUri, subscription }))).status).toBe(503);
    vi.stubEnv('VAPID_PRIVATE_KEY', 'A'.repeat(43));
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('KV_REST_API_URL', ''); vi.stubEnv('KV_REST_API_TOKEN', '');
    expect((await POST(request('POST', { rootUri, subscription }))).status).toBe(503);
  });
});
