import { z } from 'zod';

export const threadUriSchema = z.string().max(512).regex(/^at:\/\/did:[a-z0-9]+:[A-Za-z0-9._:%-]+\/app\.bsky\.feed\.post\/[A-Za-z0-9]+$/);
export const deviceTokenSchema = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);

// Endpoints are supplied by an anonymous browser, so don't let the delivery
// worker make requests to arbitrary hosts or internal network addresses.
const endpointSchema = z.url().max(2048).refine(value => {
  const url = new URL(value);
  const host = url.hostname;
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
    host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.apple.com') ||
    host.endsWith('.notify.windows.com')
  );
}, 'Unsupported push service');

const key = (bytes: number) => z.string().max(100).regex(/^[A-Za-z0-9_-]+={0,2}$/)
  .refine(value => Buffer.from(value, 'base64url').length === bytes, 'Invalid push key');

export const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: key(65), auth: key(16) }),
});

export const subscribeSchema = z.object({ rootUri: threadUriSchema, subscription: subscriptionSchema });
export const unsubscribeSchema = z.object({ rootUri: threadUriSchema });
export const presenceSchema = z.object({
  rootUri: threadUriSchema,
  tabId: z.uuid(),
  visible: z.boolean(),
});

export type BrowserSubscription = z.infer<typeof subscriptionSchema>;
