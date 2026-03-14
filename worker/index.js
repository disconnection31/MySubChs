// Service Worker custom logic for Web Push notifications
// Bundled by next-pwa into the generated Service Worker via importScripts()

// §2 push event handler
self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      data: payload.data,
    }),
  )
})

// §3 notificationclick event handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'navigate' in client) {
          return client.navigate(url).then(() => client.focus())
        }
      }
      return clients.openWindow(url)
    }),
  )
})

// §4 pushsubscriptionchange event handler
function toBase64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    Promise.resolve(event.newSubscription || self.registration.pushManager.getSubscription())
      .then((newSub) => {
        if (!newSub) return

        const key = newSub.getKey('p256dh')
        const auth = newSub.getKey('auth')
        if (!key || !auth) return

        return fetch('/api/notifications/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: newSub.endpoint,
            p256dh: toBase64url(key),
            auth: toBase64url(auth),
          }),
        })
      })
      .catch((err) => {
        console.error('Failed to re-register push subscription:', err)
      }),
  )
})
