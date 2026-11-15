'use client';

import { useEffect, useState } from 'react';

interface Settings {
  token: string;
  tabId: string;
  publicKey: string | null;
  subscribed: boolean;
  supported: boolean;
  needsInstall: boolean;
}

const TOKEN_KEY = 'chw:push:device';
const CHANGE_KEY = 'chw:push:changed';

export default function PushNotifications({ rootUri, live = true }: { rootUri: string; live?: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let tabId = '';
    async function load() {
      try {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const standalone = window.matchMedia('(display-mode: standalone)').matches;
        const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        if (!window.isSecureContext) {
          if (!disposed) setSettings({ token: '', tabId: '', publicKey: null, subscribed: false, supported: false, needsInstall: ios && !standalone });
          return;
        }
        tabId ||= crypto.randomUUID();
        let token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
          token = crypto.randomUUID();
          localStorage.setItem(TOKEN_KEY, token);
        }
        const response = await fetch(`/api/push?rootUri=${encodeURIComponent(rootUri)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not check notification settings.');
        const data = await response.json();
        if (supported) await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
        if (!disposed) setSettings({
          token, tabId, publicKey: data.publicKey, subscribed: data.subscribed,
          supported, needsInstall: ios && !standalone,
        });
      } catch {
        if (!disposed) setError('Could not load notification settings. Please try again.');
      }
    }
    void load();
    const changed = (event: StorageEvent) => { if (event.key === CHANGE_KEY) void load(); };
    window.addEventListener('storage', changed);
    return () => { disposed = true; window.removeEventListener('storage', changed); };
  }, [rootUri, attempt]);

  useEffect(() => {
    if (!settings?.subscribed || !live) return;
    let queue = Promise.resolve();
    function report(visible = document.visibilityState === 'visible' && document.hasFocus()) {
      // Serialize this tab's transitions so a slow heartbeat cannot overwrite
      // a later blur. Keepalive lets the final transition survive navigation.
      queue = queue.then(async () => {
        try {
          await fetch('/api/push', {
            method: 'PATCH', keepalive: true,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings!.token}` },
            body: JSON.stringify({ rootUri, tabId: settings!.tabId, visible }),
          });
        } catch { /* The presence lease expires if the device goes offline. */ }
      });
    }
    const changed = () => report();
    const hidden = () => report(false);
    report();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) report(true);
    }, 15_000);
    window.addEventListener('focus', changed);
    window.addEventListener('blur', hidden);
    window.addEventListener('pagehide', hidden);
    document.addEventListener('visibilitychange', changed);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', changed);
      window.removeEventListener('blur', hidden);
      window.removeEventListener('pagehide', hidden);
      document.removeEventListener('visibilitychange', changed);
      report(false);
    };
  }, [settings, live, rootUri]);

  async function toggle() {
    if (!settings) return;
    setBusy(true);
    setError('');
    try {
      let subscription: PushSubscriptionJSON | undefined;
      if (!settings.subscribed) {
        // Request permission directly from the click, before any network or
        // service-worker awaits; iOS requires an explicit user gesture.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notifications are blocked. Enable them in your browser or device settings.');
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const native = existing ?? await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: settings.publicKey!,
        });
        subscription = native.toJSON();
      }
      const response = await fetch('/api/push', {
        method: settings.subscribed ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` },
        body: JSON.stringify({ rootUri, ...(subscription ? { subscription } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update notifications.');
      setSettings({ ...settings, subscribed: data.subscribed });
      // Opting out of one thread leaves other thread subscriptions intact.
      localStorage.setItem(CHANGE_KEY, crypto.randomUUID());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update notifications.');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return error ? (
    <div className="text-sm text-chw-secondary" role="status">
      {error}{' '}
      <button className="underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button>
    </div>
  ) : null;

  const canEnable = settings.publicKey && settings.supported && !settings.needsInstall && live;
  const explanation = settings.subscribed
    ? live ? 'This thread only. At most one alert every five minutes, while you’re away.' : 'Paused. Alerts resume if coverage of this thread restarts.'
    : settings.needsInstall ? 'On iPhone or iPad: use Share → Add to Home Screen, then open the app to enable notifications.'
    : !settings.supported ? 'Push notifications need a supported browser over HTTPS.'
    : !settings.publicKey ? 'Notifications aren’t available yet.'
    : !live ? 'Coverage has ended. Notifications can be enabled when this thread is live.'
    : 'New posts in this thread only. At most one alert every five minutes.';

  return (
    <div className="border border-border rounded-xl bg-card px-4 py-3 mb-4">
      <button
        type="button" aria-pressed={settings.subscribed}
        disabled={busy || (!settings.subscribed && !canEnable)}
        onClick={toggle}
        className="text-sm font-semibold text-chw-text disabled:opacity-50 enabled:cursor-pointer hover:underline"
      >
        {busy ? 'Updating…' : settings.subscribed ? 'Notifications on — turn off' : 'Notify me'}
      </button>
      <p className="text-xs text-chw-secondary mt-1">{explanation}</p>
      {error && <p className="text-xs text-chw-secondary mt-2" role="alert">{error}</p>}
    </div>
  );
}
