import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { getActiveSession, incrementCounter } from '@/lib/kv';
import { getPushConfiguration } from '@/lib/push/config';
import { deviceTokenSchema, threadUriSchema, subscribeSchema, unsubscribeSchema, presenceSchema } from '@/lib/push/schema';
import { deviceId, getSubscription, saveSubscription, removeSubscription, updatePresence } from '@/lib/push/store';

export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function identify(request: NextRequest): string | null {
  const result = deviceTokenSchema.safeParse(request.headers.get('authorization')?.replace(/^Bearer /, ''));
  return result.success ? deviceId(result.data) : null;
}

export async function GET(request: NextRequest) {
  const configuration = getPushConfiguration();
  const rootUri = request.nextUrl.searchParams.get('rootUri');
  if (!rootUri) return json({ publicKey: configuration?.publicKey ?? null });
  const root = threadUriSchema.safeParse(rootUri);
  const device = identify(request);
  if (!root.success || !device) return json({ error: 'Invalid subscription request' }, 400);
  return json({ publicKey: configuration?.publicKey ?? null, subscribed: !!await getSubscription(root.data, device) });
}

async function mutation<T>(request: NextRequest, schema: z.ZodType<T>): Promise<{ device: string; data: T } | NextResponse> {
  if (request.headers.get('origin') !== request.nextUrl.origin) return json({ error: 'Invalid origin' }, 403);
  const device = identify(request);
  if (!device) return json({ error: 'Invalid device token' }, 401);
  const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = createHash('sha256').update(address).digest('hex');
  // Presence heartbeats are frequent; opt-in mutations have a separate budget.
  const presence = request.method === 'PATCH';
  if (await incrementCounter(`push:rate:${presence ? 'presence' : 'subscription'}:${key}`, 60) > (presence ? 240 : 60)) {
    return json({ error: 'Too many requests. Try again in a minute.' }, 429);
  }
  if (Number(request.headers.get('content-length') ?? 0) > 12_000) return json({ error: 'Request too large' }, 413);
  try {
    const text = await request.text();
    if (text.length > 12_000) return json({ error: 'Request too large' }, 413);
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) return json({ error: 'Invalid subscription request' }, 400);
    return { device, data: parsed.data };
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
}

export async function POST(request: NextRequest) {
  const input = await mutation(request, subscribeSchema);
  if (input instanceof NextResponse) return input;
  if (!getPushConfiguration()) return json({ error: 'Notifications are not configured yet' }, 503);
  const session = await getActiveSession();
  if (session?.status !== 'live' || session.rootUri !== input.data.rootUri) {
    return json({ error: 'This thread is not currently live' }, 409);
  }
  const existing = await getSubscription(input.data.rootUri, input.device);
  await saveSubscription({
    deviceId: input.device,
    rootUri: input.data.rootUri,
    subscription: input.data.subscription,
    subscribedAt: existing?.subscription.endpoint === input.data.subscription.endpoint ? existing.subscribedAt : Date.now(),
  });
  return json({ subscribed: true });
}

export async function DELETE(request: NextRequest) {
  const input = await mutation(request, unsubscribeSchema);
  if (input instanceof NextResponse) return input;
  await removeSubscription(input.data.rootUri, input.device);
  return json({ subscribed: false });
}

export async function PATCH(request: NextRequest) {
  const input = await mutation(request, presenceSchema);
  if (input instanceof NextResponse) return input;
  if (await getSubscription(input.data.rootUri, input.device)) {
    await updatePresence(input.data.rootUri, input.device, input.data.tabId, input.data.visible);
  }
  return json({ ok: true });
}
