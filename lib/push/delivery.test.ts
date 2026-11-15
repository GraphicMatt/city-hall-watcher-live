import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendNotification } from 'web-push';
import type { ActiveSession } from '../kv';
import type { BlueskyPost } from '../bluesky';
import { deliverThreadUpdates } from './delivery';
import { saveSubscription, getSubscription, removeSubscription, updatePresence, threadId } from './store';

// Only external boundaries are faked: delivery policy and presence persistence
// run together, with the same storage interface used by Redis in production.
const memory = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  hashes: new Map<string, Record<string, unknown>>(),
  leases: new Map<string, { token: string; expiresAt: number }>(),
  session: null as ActiveSession | null,
}));

vi.mock('../kv', () => ({
  getActiveSession: vi.fn(async () => memory.session),
  getStoredValue: async (key: string) => structuredClone(memory.values.get(key) ?? null),
  setStoredValue: async (key: string, value: unknown) => { memory.values.set(key, structuredClone(value)); },
  getStoredHash: async (key: string) => structuredClone(memory.hashes.get(key) ?? {}),
  getStoredHashField: async (key: string, field: string) => structuredClone(memory.hashes.get(key)?.[field] ?? null),
  setStoredHashField: async (key: string, field: string, value: unknown) => {
    memory.hashes.set(key, { ...memory.hashes.get(key), [field]: structuredClone(value) });
  },
  deleteStoredHashField: async (key: string, field: string) => { delete memory.hashes.get(key)?.[field]; },
  acquireLease: async (key: string, token: string, ttl: number) => {
    const previous = memory.leases.get(key);
    if (previous && previous.expiresAt > Date.now()) return false;
    memory.leases.set(key, { token, expiresAt: Date.now() + ttl * 1000 });
    return true;
  },
  releaseLease: async (key: string, token: string) => {
    if (memory.leases.get(key)?.token === token) memory.leases.delete(key);
  },
}));

vi.mock('web-push', () => ({ sendNotification: vi.fn() }));

const base = Date.parse('2026-11-15T15:00:00Z');
const rootUri = 'at://did:plc:author/app.bsky.feed.post/root';
const otherRoot = 'at://did:plc:author/app.bsky.feed.post/other';
const tabId = 'bdb1664d-c9aa-41c5-b5b1-49a7cbdaf81a';
const session: ActiveSession = {
  rootUri, rootUrl: 'https://bsky.app/profile/author/post/root', authorDid: 'did:plc:author',
  status: 'live', startedAt: new Date(base - 60_000).toISOString(), metadata: { meetingTitle: 'Council meeting' },
};

function post(id: string, seconds: number, root = rootUri): BlueskyPost {
  return {
    uri: `at://did:plc:author/app.bsky.feed.post/${id}`, cid: id,
    author: { did: 'did:plc:author', handle: 'author' },
    record: { text: `Update ${id}`, reply: { root: { uri: root }, parent: { uri: root } } },
    indexedAt: new Date(base + seconds * 1000).toISOString(),
  };
}

async function subscribe(device = 'phone', root = rootUri, subscribedAt = base) {
  await saveSubscription({
    deviceId: device, rootUri: root, subscribedAt,
    subscription: { endpoint: `https://fcm.googleapis.com/push/${device}`, keys: { auth: 'test', p256dh: 'test' } },
  });
}

const poll = (posts: BlueskyPost[], coverage = session) => deliverThreadUpdates(coverage, posts, Date.now() + 45_000);
const at = (seconds: number) => vi.setSystemTime(base + seconds * 1000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(30);
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'A'.repeat(87));
  vi.stubEnv('VAPID_PRIVATE_KEY', 'A'.repeat(43));
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');
  memory.values.clear(); memory.hashes.clear(); memory.leases.clear();
  memory.session = session;
  vi.mocked(sendNotification).mockReset().mockResolvedValue({ statusCode: 201, body: '', headers: {} });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('thread notification delivery', () => {
  it('sends only to explicit subscribers of this thread, with a stable website deep link', async () => {
    await subscribe();
    await subscribe('other-phone', otherRoot);
    const result = await poll([post('new', 10), post('unrelated', 15, otherRoot)]);
    expect(result.sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [target, payload, options] = vi.mocked(sendNotification).mock.calls[0];
    expect(target.endpoint).toContain('/phone');
    expect(JSON.parse(String(payload))).toEqual({
      title: 'Council meeting', body: 'Update new', tag: threadId(rootUri),
      url: `/thread/${threadId(rootUri)}?post=new`,
    });
    expect(options).toMatchObject({ TTL: 280, topic: threadId(rootUri).slice(0, 32), timeout: 5000 });
  });

  it('never alerts for posts published before opting in', async () => {
    await subscribe();
    await poll([post('old', -10), post('at-opt-in', 0)]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('does not turn reindexing an old post into a new alert', async () => {
    await subscribe();
    const reindexed = post('old-reindexed', 10);
    reindexed.record.createdAt = new Date(base - 3_600_000).toISOString();
    await poll([reindexed]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('consumes cooldown-suppressed posts without a delayed catch-up', async () => {
    await subscribe();
    await poll([post('first', 10)]);
    at(90);
    await poll([post('first', 10), post('suppressed', 80)]);
    at(340);
    await poll([post('first', 10), post('suppressed', 80)]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    await poll([post('next', 335)]);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a handled post on duplicate cron calls', async () => {
    await subscribe();
    const update = post('once', 10);
    await poll([update]);
    await poll([update]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('remembers reading intervals even when the reader leaves before polling', async () => {
    await subscribe();
    await updatePresence(rootUri, 'phone', tabId, true, base);
    await updatePresence(rootUri, 'phone', tabId, false, base + 20_000);
    await poll([post('read', 10)]);
    expect(sendNotification).not.toHaveBeenCalled();
    // Reading has not consumed the notification cooldown.
    at(40);
    await poll([post('read', 10), post('away', 35)]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('suppresses only the focused device and preserves another device’s cooldown', async () => {
    await subscribe('phone'); await subscribe('laptop');
    await updatePresence(rootUri, 'laptop', tabId, true);
    await poll([post('new', 10)]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendNotification).mock.calls[0][0].endpoint).toContain('/phone');
    at(60);
    await updatePresence(rootUri, 'laptop', tabId, false);
    await poll([post('second', 55)]);
    expect(sendNotification).toHaveBeenCalledTimes(1); // laptop saw it before blur; phone cooling down
    at(70);
    await poll([post('third', 65)]);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendNotification).mock.calls[1][0].endpoint).toContain('/laptop');
  });

  it('expires stale foreground presence so a closed tab cannot silence future alerts', async () => {
    await subscribe();
    await updatePresence(rootUri, 'phone', tabId, true, base - 60_000);
    await poll([post('new', 10)]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('keeps subscriptions across restarts but skips posts during the break', async () => {
    await subscribe();
    const resumed = { ...session, startedAt: new Date(base + 15_000).toISOString() };
    memory.session = resumed;
    await poll([post('during-break', 10)], resumed);
    expect(sendNotification).not.toHaveBeenCalled();
    await poll([post('during-break', 10), post('after-resume', 20)], resumed);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(await getSubscription(rootUri, 'phone')).not.toBeNull();
  });

  it('stops delivery when coverage has ended or another thread has gone live', async () => {
    await subscribe();
    memory.session = { ...session, status: 'ended' };
    expect((await poll([post('new', 10)])).complete).toBe(false);
    memory.session = { ...session, rootUri: otherRoot };
    await poll([post('new', 10)]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('does not deliver updates already five minutes old', async () => {
    await subscribe();
    at(400);
    await poll([post('stale', 100)]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it.each([404, 410])('removes expired endpoints on HTTP %s', async statusCode => {
    await subscribe();
    vi.mocked(sendNotification).mockRejectedValueOnce({ statusCode });
    expect((await poll([post('new', 10)])).removed).toBe(1);
    expect(await getSubscription(rootUri, 'phone')).toBeNull();
  });

  it('retries an explicit transient rejection without repeating successful deliveries', async () => {
    await subscribe('phone'); await subscribe('laptop');
    vi.mocked(sendNotification).mockRejectedValueOnce({ statusCode: 503 });
    expect((await poll([post('new', 10)])).failed).toBe(1);
    at(90);
    expect((await poll([post('new', 10)])).sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(3);
  });

  it('keeps the cooldown after an ambiguous timeout', async () => {
    await subscribe();
    vi.mocked(sendNotification).mockRejectedValueOnce(new Error('timeout'));
    await poll([post('new', 10)]);
    at(90);
    await poll([post('new', 10)]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('does not replay one device’s suppressed posts when another endpoint keeps failing', async () => {
    await subscribe('phone'); await subscribe('broken');
    vi.mocked(sendNotification).mockImplementation(async target => {
      if (target.endpoint.endsWith('/broken')) throw { statusCode: 503 };
      return { statusCode: 201, body: '', headers: {} };
    });
    await poll([post('first', 10)]);
    at(180);
    await poll([post('first', 10), post('suppressed', 170)]);
    at(340);
    await poll([post('first', 10), post('suppressed', 170)]);
    const phoneCalls = vi.mocked(sendNotification).mock.calls.filter(([target]) => target.endpoint.endsWith('/phone'));
    expect(phoneCalls).toHaveLength(1);
  });

  it('does not unsubscribe other threads or devices', async () => {
    await subscribe('phone'); await subscribe('laptop'); await subscribe('phone', otherRoot);
    await removeSubscription(rootUri, 'phone');
    await poll([post('new', 10)]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(await getSubscription(otherRoot, 'phone')).not.toBeNull();
  });

  it('retains pending work if the execution budget runs out', async () => {
    await subscribe();
    const result = await deliverThreadUpdates(session, [post('new', 10)], Date.now() - 1);
    expect(result.complete).toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
    await poll([post('new', 10)]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
