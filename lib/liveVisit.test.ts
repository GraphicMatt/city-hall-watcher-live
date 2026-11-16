import { expect, it, vi } from 'vitest';
import { beginLiveVisit } from './liveVisit';
import { getLastRead, setLastRead, markAllRead } from './lastRead';

const root = 'at://did:plc:author/app.bsky.feed.post/meeting';
const older = '2026-11-15T10:00:00.000Z';
const newer = '2026-11-15T10:05:00.000Z';

it('distinguishes a return visit without marking a loaded post as read', () => {
  expect(beginLiveVisit(root)).toEqual({ readAt: null, returning: false });
  expect(beginLiveVisit(root)).toEqual({ readAt: null, returning: true });
  expect(getLastRead(root)).toBeNull();
});

it('uses a chronological high-water mark for the same thread across days', () => {
  beginLiveVisit(root);
  setLastRead(root, newer);
  setLastRead(root, older);
  expect(beginLiveVisit(root)).toEqual({ readAt: newer, returning: true });
});

it('does not transfer progress to another thread or another author’s matching rkey', () => {
  beginLiveVisit(root);
  setLastRead(root, newer);
  expect(beginLiveVisit(root.replace('/meeting', '/next'))).toEqual({ readAt: null, returning: false });
  expect(beginLiveVisit(root.replace('did:plc:author', 'did:plc:other'))).toEqual({ readAt: null, returning: false });
});

it('leaves archive and legacy rkey records separate from live progress', () => {
  setLastRead('november-15-2026', older);
  setLastRead('meeting', newer);
  expect(beginLiveVisit(root)).toEqual({ readAt: null, returning: false });
  expect(getLastRead('november-15-2026')).toBe(older);
  expect(getLastRead('meeting')).toBe(newer);
});

it('marks all loaded posts without moving backwards', () => {
  markAllRead(root, [{ indexedAt: newer }, { indexedAt: older }]);
  markAllRead(root, []);
  expect(getLastRead(root)).toBe(newer);
});

it('ignores corrupt timestamps', () => {
  localStorage.setItem(`chw-lastread-${root}`, 'invalid');
  expect(getLastRead(root)).toBeNull();
  setLastRead(root, 'still-invalid');
  expect(getLastRead(root)).toBeNull();
  setLastRead(root, older);
  expect(getLastRead(root)).toBe(older);
});

it('continues when browser storage denies reads or writes', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full'); });
  expect(beginLiveVisit(root)).toEqual({ readAt: null, returning: false });
  expect(() => setLastRead(root, newer)).not.toThrow();
});
