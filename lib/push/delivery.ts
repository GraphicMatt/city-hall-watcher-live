import { randomUUID } from 'node:crypto';
import * as webpush from 'web-push';
import type { BlueskyPost } from '../bluesky';
import { acquireLease, releaseLease, getActiveSession } from '../kv';
import type { ActiveSession } from '../kv';
import { getPushConfiguration } from './config';
import {
  COOLDOWN_SECONDS, cooldownKey, threadId, subscriptionsFor,
  getSubscription, removeSubscription, presenceFor, isReading,
  getSeenPosts, saveSeenPosts,
} from './store';

export const PUSH_TTL_SECONDS = 300;

function publishedAt(post: BlueskyPost): number {
  // Bluesky's indexing time can change when an old post is reindexed. Prefer
  // its publication timestamp so reindexing cannot create a backlog alert.
  const created = Date.parse(post.record.createdAt ?? '');
  return Number.isFinite(created) ? created : Date.parse(post.indexedAt);
}

export function notificationPayload(session: ActiveSession, post: BlueskyPost) {
  const id = threadId(session.rootUri);
  return {
    title: session.metadata?.meetingTitle || 'City Hall Watcher — live coverage',
    body: Array.from(post.record.text).slice(0, 180).join(''),
    tag: id,
    url: `/thread/${id}?post=${encodeURIComponent(post.uri.split('/').pop()!)}`,
  };
}

function statusCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
}

export async function deliverThreadUpdates(session: ActiveSession, posts: BlueskyPost[], deadline: number) {
  const configuration = getPushConfiguration();
  if (!configuration) throw new Error('Push delivery is not configured');
  const startedAt = Date.parse(session.startedAt);
  const newPosts = posts.filter(post =>
    publishedAt(post) > startedAt &&
    post.author.did === session.authorDid &&
    (post.uri === session.rootUri || post.record.reply?.root.uri === session.rootUri)
  ).sort((a, b) => publishedAt(b) - publishedAt(a));
  const subscribers = await subscriptionsFor(session.rootUri);
  const result = { sent: 0, removed: 0, failed: 0, complete: true };

  // Bounded batches keep SDK requests within the cron's execution budget.
  for (let offset = 0; offset < subscribers.length; offset += 10) {
    if (Date.now() > deadline) { result.complete = false; break; }
    const current = await getActiveSession();
    if (current?.status !== 'live' || current.rootUri !== session.rootUri || current.startedAt !== session.startedAt) {
      result.complete = false;
      break;
    }
    await Promise.all(subscribers.slice(offset, offset + 10).map(async subscriber => {
      const now = Date.now();
      const seen = new Set(await getSeenPosts(session.rootUri, session.startedAt, subscriber.deviceId));
      const consume = async (retryUri?: string) => {
        const handled = [...new Set([...seen, ...posts.filter(post => post.uri !== retryUri).map(post => post.uri)])];
        if (handled.length !== seen.size) await saveSeenPosts(session.rootUri, session.startedAt, subscriber.deviceId, handled);
      };
      const presence = await presenceFor(session.rootUri, subscriber.deviceId);
      const post = newPosts.find(candidate => {
        const timestamp = publishedAt(candidate);
        return !seen.has(candidate.uri) && timestamp > subscriber.subscribedAt && timestamp <= now &&
          now - timestamp < PUSH_TTL_SECONDS * 1000 && !isReading(presence, timestamp, now);
      });
      if (!post) { await consume(); return; }

      // Recheck opt-out after fetching the feed and presence. Never write a
      // subscriber snapshot back from a poll and accidentally undo an opt-out.
      const latest = await getSubscription(session.rootUri, subscriber.deviceId);
      if (!latest || latest.subscribedAt !== subscriber.subscribedAt || latest.subscription.endpoint !== subscriber.subscription.endpoint) return;
      const key = cooldownKey(session.rootUri, subscriber.deviceId);
      const lease = randomUUID();
      if (!await acquireLease(key, lease, COOLDOWN_SECONDS)) { await consume(); return; }
      try {
        const remaining = Math.floor((publishedAt(post) + PUSH_TTL_SECONDS * 1000 - Date.now()) / 1000);
        if (remaining <= 0) {
          await releaseLease(key, lease);
          await consume();
          return;
        }
        await webpush.sendNotification(subscriber.subscription, JSON.stringify(notificationPayload(session, post)), {
          vapidDetails: configuration,
          TTL: remaining,
          urgency: 'high',
          // A push-service topic replaces queued updates; the service-worker
          // tag separately replaces displayed cards where the OS supports it.
          topic: threadId(session.rootUri).slice(0, 32),
          timeout: 5_000,
        });
        result.sent++;
        await consume();
      } catch (error) {
        const status = statusCode(error);
        if (status === 404 || status === 410) {
          await removeSubscription(session.rootUri, subscriber.deviceId);
          result.removed++;
        } else {
          result.failed++;
          // An explicit rejection can be retried next minute. A timeout has an
          // ambiguous outcome, so retain its cooldown to avoid duplicate alerts.
          if (status) await releaseLease(key, lease);
          // Per-device checkpoints ensure a failed endpoint cannot turn
          // another reader's suppressed posts into delayed catch-up alerts.
          await consume(status ? post.uri : undefined);
          console.error('Push delivery failed', { status: status ?? 'network-error' });
        }
      }
    }));
  }

  return result;
}
