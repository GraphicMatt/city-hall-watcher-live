import { describe, expect, it } from 'vitest';
import { generateVAPIDKeys } from 'web-push';
import { deviceTokenSchema, subscriptionSchema, threadUriSchema } from './schema';

const keys = { p256dh: generateVAPIDKeys().publicKey, auth: Buffer.alloc(16, 1).toString('base64url') };

describe('browser-supplied subscriptions', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/token',
  ])('accepts a valid endpoint from %s', endpoint => {
    expect(subscriptionSchema.safeParse({ endpoint, keys, expirationTime: null }).success).toBe(true);
  });

  it.each([
    'http://fcm.googleapis.com/push',
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://fcm.googleapis.com.evil.example/push',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com:8443/push',
    'https://user:password@fcm.googleapis.com/push',
  ])('rejects arbitrary outgoing request destination %s', endpoint => {
    expect(subscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
  });

  it('rejects malformed encryption keys', () => {
    expect(subscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/push', keys: { auth: 'x', p256dh: 'x' } }).success).toBe(false);
  });

  it('uses canonical thread URIs rather than display handles or archive slugs', () => {
    expect(threadUriSchema.safeParse('at://did:plc:author/app.bsky.feed.post/abc123').success).toBe(true);
    expect(threadUriSchema.safeParse('https://bsky.app/profile/author/post/abc123').success).toBe(false);
    expect(deviceTokenSchema.safeParse('short').success).toBe(false);
  });
});
