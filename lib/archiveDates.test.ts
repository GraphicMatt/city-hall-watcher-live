import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { BlueskyPost } from './bluesky';

// NOTE: app modules are imported dynamically *after* chdir — kv.ts resolves its
// .kv-store.json path from cwd at import time, and a static import here would
// point it at the developer's real local store.

const post = (indexedAt: string) => ({ indexedAt }) as BlueskyPost;

describe('postTimeRange', () => {
  it('returns earliest and latest post time regardless of order', async () => {
    const { postTimeRange } = await import('./archive');
    expect(postTimeRange([post('2026-03-26T01:00:00.000Z'), post('2026-03-25T13:00:00.000Z')])).toEqual({
      first: '2026-03-25T13:00:00.000Z',
      last: '2026-03-26T01:00:00.000Z',
    });
  });
  it('returns null for an empty thread', async () => {
    const { postTimeRange } = await import('./archive');
    expect(postTimeRange([])).toBeNull();
  });
});

describe('POST /api/archive/repair-dates', () => {
  // Runs against the local file store in a temp dir (kv.ts reads ./.kv-store.json from cwd).
  const origCwd = process.cwd();
  const env = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  let dir: string;

  beforeAll(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    dir = mkdtempSync(join(tmpdir(), 'repair-dates-'));
    const store = {
      'archive:index': JSON.stringify([
        // Archived via Go live a month later — wrong dates
        { slug: 'march-25-2026', label: 'March 25, 2026', startedAt: '2026-04-24T15:30:27.154Z', endedAt: '2026-04-24T15:30:47.188Z', postCount: 2 },
        // Already correct
        { slug: 'may-20-2026', label: 'May 20, 2026', startedAt: '2026-05-20T13:00:00.000Z', endedAt: '2026-05-21T02:00:00.000Z', postCount: 2 },
      ]),
      'archive:posts:march-25-2026': JSON.stringify([post('2026-03-25T13:29:50.553Z'), post('2026-03-27T01:47:42.755Z')]),
      'archive:posts:may-20-2026': JSON.stringify([post('2026-05-20T13:00:00.000Z'), post('2026-05-21T02:00:00.000Z')]),
    };
    writeFileSync(join(dir, '.kv-store.json'), JSON.stringify(store));
    process.chdir(dir);
    vi.resetModules();
  });

  afterAll(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
    if (env.url) process.env.KV_REST_API_URL = env.url;
    if (env.token) process.env.KV_REST_API_TOKEN = env.token;
  });

  const call = async (q = '') => {
    const { POST } = await import('@/app/api/archive/repair-dates/route');
    return (await POST(new Request(`http://localhost/api/archive/repair-dates${q}`, { method: 'POST' }))).json();
  };
  const index = () => JSON.parse(JSON.parse(readFileSync(join(dir, '.kv-store.json'), 'utf-8'))['archive:index']);

  it('dry run reports the fix without writing', async () => {
    const res = await call('?dryRun=1');
    expect(res.updated).toBe(1);
    expect(res.startChanges).toEqual([{ slug: 'march-25-2026', from: '2026-04-24T15:30:27.154Z', to: '2026-03-25T13:29:50.553Z' }]);
    expect(index()[0].startedAt).toBe('2026-04-24T15:30:27.154Z');
  });

  it('applies the fix, leaves correct entries alone, and is idempotent', async () => {
    expect((await call()).updated).toBe(1);
    expect(index()[0]).toMatchObject({ startedAt: '2026-03-25T13:29:50.553Z', endedAt: '2026-03-27T01:47:42.755Z' });
    expect(index()[1].startedAt).toBe('2026-05-20T13:00:00.000Z');
    expect((await call()).updated).toBe(0);
  });
});
