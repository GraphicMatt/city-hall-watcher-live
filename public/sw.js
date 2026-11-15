/* Push only: deliberately no fetch handler or offline page cache. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Always display a received push. */ }
  event.waitUntil(self.registration.showNotification(data.title || 'City Hall Watcher', {
    body: data.body || 'There is an update to your subscribed coverage.',
    icon: '/icon-192.png',
    tag: data.tag,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    let target = new URL('/', self.location.origin);
    try {
      const candidate = new URL(event.notification.data?.url || '/', self.location.origin);
      if (candidate.origin === self.location.origin) target = candidate;
    } catch { /* Fall back to this website. */ }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const exact = windows.find(client => client.url === target.href);
    if (exact) return exact.focus();
    for (const client of windows) {
      if (new URL(client.url).origin !== target.origin) continue;
      try {
        const navigated = await client.navigate(target.href);
        if (navigated) return navigated.focus();
      } catch { /* Open a new window if this client cannot navigate. */ }
    }
    return self.clients.openWindow(target.href);
  })());
});
