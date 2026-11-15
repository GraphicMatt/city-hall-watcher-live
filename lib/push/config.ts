import { z } from 'zod';

const configurationSchema = z.object({
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
  privateKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  subject: z.string().refine(value => /^(mailto:|https:\/\/)/.test(value)),
});

export function getPushConfiguration() {
  // A serverless deployment cannot persist subscriptions in the local file.
  if (process.env.VERCEL && !(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)) return null;
  const result = configurationSchema.safeParse({
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  });
  return result.success ? result.data : null;
}
