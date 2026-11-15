import { createHash } from 'node:crypto';
import { getStoredHash, getStoredHashField, getStoredValue, setStoredHashField, deleteStoredHashField, setStoredValue } from '../kv';
import type { BrowserSubscription } from './schema';

export const COOLDOWN_SECONDS = 300;
export const PRESENCE_LEASE_MS = 40_000;
const HISTORY_MS = 10 * 60_000;

export interface ThreadSubscription {
  deviceId: string;
  rootUri: string;
  subscribedAt: number;
  subscription: BrowserSubscription;
}

export interface PresenceInterval { from: number; until: number }
export interface TabPresence {
  visible: boolean;
  updatedAt: number;
  intervals: PresenceInterval[];
}

export function threadId(rootUri: string): string {
  return createHash('sha256').update(rootUri).digest('base64url');
}

export function deviceId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const subscriptionKey = (rootUri: string) => `push:subscriptions:${threadId(rootUri)}`;
const presenceKey = (rootUri: string, device: string) => `push:presence:${threadId(rootUri)}:${device}`;
export const cooldownKey = (rootUri: string, device: string) => `push:cooldown:${threadId(rootUri)}:${device}`;

export async function subscriptionsFor(rootUri: string): Promise<ThreadSubscription[]> {
  return Object.values(await getStoredHash<ThreadSubscription>(subscriptionKey(rootUri)));
}

export async function getSubscription(rootUri: string, device: string): Promise<ThreadSubscription | null> {
  return getStoredHashField<ThreadSubscription>(subscriptionKey(rootUri), device);
}

export async function saveSubscription(value: ThreadSubscription): Promise<void> {
  await setStoredHashField(subscriptionKey(value.rootUri), value.deviceId, value);
}

export async function removeSubscription(rootUri: string, device: string): Promise<void> {
  await deleteStoredHashField(subscriptionKey(rootUri), device);
}

// Keep short, server-timestamped visibility intervals so leaving before the
// next poll cannot turn posts published while reading into catch-up alerts.
export async function updatePresence(rootUri: string, device: string, tabId: string, visible: boolean, now = Date.now()): Promise<void> {
  const key = presenceKey(rootUri, device);
  const previous = await getStoredHashField<TabPresence>(key, tabId);
  const intervals = (previous?.intervals ?? []).filter(interval => interval.until > now - HISTORY_MS);
  const last = intervals.at(-1);
  if (previous?.visible && now - previous.updatedAt <= PRESENCE_LEASE_MS && last) {
    last.until = now;
  } else if (visible) {
    intervals.push({ from: now, until: now });
  }
  await setStoredHashField(key, tabId, { visible, updatedAt: now, intervals }, HISTORY_MS / 1000);
}

export async function presenceFor(rootUri: string, device: string): Promise<TabPresence[]> {
  return Object.values(await getStoredHash<TabPresence>(presenceKey(rootUri, device)));
}

export function isReading(presence: TabPresence[], postAt: number, now: number): boolean {
  return presence.some(tab =>
    (tab.visible && now - tab.updatedAt <= PRESENCE_LEASE_MS) ||
    tab.intervals.some(interval => postAt >= interval.from && postAt <= interval.until)
  );
}

const checkpointKey = (rootUri: string, startedAt: string, device: string) => `push:seen:${threadId(rootUri)}:${startedAt}:${device}`;

export async function getSeenPosts(rootUri: string, startedAt: string, device: string): Promise<string[]> {
  return (await getStoredValue<string[]>(checkpointKey(rootUri, startedAt, device))) ?? [];
}

export async function saveSeenPosts(rootUri: string, startedAt: string, device: string, uris: string[]): Promise<void> {
  await setStoredValue(checkpointKey(rootUri, startedAt, device), uris, 7 * 24 * 60 * 60);
}
