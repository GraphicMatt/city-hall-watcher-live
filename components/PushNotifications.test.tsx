// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PushNotifications from './PushNotifications';

const rootUri = 'at://did:plc:author/app.bsky.feed.post/root';
const publicKey = 'A'.repeat(87);
const permission = vi.fn();
const nativeUnsubscribe = vi.fn();
const nativeSubscribe = vi.fn();
const browserSubscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/push/token', keys: { auth: 'auth', p256dh: 'key' } }), unsubscribe: nativeUnsubscribe };
const requests = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  // Node 26 exposes an unconfigured global localStorage which can shadow
  // jsdom's implementation. Use the actual DOM storage in this test.
  vi.stubGlobal('localStorage', Reflect.get(globalThis, 'jsdom').window.localStorage);
  localStorage.clear();
  permission.mockResolvedValue('granted');
  nativeSubscribe.mockResolvedValue(browserSubscription);
  vi.stubGlobal('Notification', { requestPermission: permission });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: vi.fn().mockResolvedValue({}),
    ready: Promise.resolve({ pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null), subscribe: nativeSubscribe,
    } }),
  } });
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  requests.mockImplementation(async (_url, init) => new Response(JSON.stringify(
    init?.method === 'POST' ? { subscribed: true } :
    init?.method === 'DELETE' ? { subscribed: false } :
    init?.method === 'PATCH' ? { ok: true } : { publicKey, subscribed: false }
  ), { status: 200 }));
  vi.stubGlobal('fetch', requests);
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('notification controls', () => {
  it('requests permission only on opt-in and unsubscribes only the thread', async () => {
    render(<PushNotifications rootUri={rootUri} />);
    const toggle = await screen.findByRole('button', { name: 'Notify me' });
    expect(permission).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    await screen.findByRole('button', { name: 'Notifications on — turn off' });
    expect(permission).toHaveBeenCalledOnce();
    expect(nativeSubscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: publicKey });
    const optIn = requests.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(optIn?.[1]?.body))).toMatchObject({ rootUri, subscription: browserSubscription.toJSON() });
    fireEvent.click(screen.getByRole('button', { name: 'Notifications on — turn off' }));
    await screen.findByRole('button', { name: 'Notify me' });
    const optOut = requests.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(JSON.parse(String(optOut?.[1]?.body))).toEqual({ rootUri });
    expect(nativeUnsubscribe).not.toHaveBeenCalled();
  });

  it('explains Home Screen installation on an uninstalled iPhone', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    render(<PushNotifications rootUri={rootUri} />);
    const toggle = await screen.findByRole('button', { name: 'Notify me' });
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Share → Add to Home Screen/)).toBeTruthy();
    expect(permission).not.toHaveBeenCalled();
  });

  it('does not enable a server subscription after permission is declined', async () => {
    permission.mockResolvedValue('denied');
    render(<PushNotifications rootUri={rootUri} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notify me' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Notifications are blocked'));
    expect(requests.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('reports focused reading and background transitions separately', async () => {
    let focused = false;
    vi.mocked(document.hasFocus).mockImplementation(() => focused);
    render(<PushNotifications rootUri={rootUri} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notify me' }));
    await screen.findByRole('button', { name: 'Notifications on — turn off' });
    focused = true;
    fireEvent.focus(window);
    const presenceBodies = () => requests.mock.calls.filter(([, init]) => init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body)));
    await waitFor(() => expect(presenceBodies().some(body => body.visible === true)).toBe(true));
    focused = false;
    fireEvent.blur(window);
    await waitFor(() => expect(presenceBodies().at(-1)?.visible).toBe(false));
    expect(presenceBodies().every(body => body.rootUri === rootUri)).toBe(true);
  });

  it('leaves the opt-in off when the server rejects the request', async () => {
    requests.mockImplementation(async (_url, init) => new Response(JSON.stringify(
      init?.method === 'POST' ? { error: 'This thread is not currently live' } : { publicKey, subscribed: false }
    ), { status: init?.method === 'POST' ? 409 : 200 }));
    render(<PushNotifications rootUri={rootUri} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notify me' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This thread is not currently live');
    expect(screen.getByRole('button', { name: 'Notify me' }).getAttribute('aria-pressed')).toBe('false');
  });
});
