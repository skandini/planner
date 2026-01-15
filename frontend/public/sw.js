/**
 * Service Worker for Web Push Notifications
 * Handles push events and notification clicks
 */

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(clients.claim());
});

// Push event - receive push notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: 'Новое уведомление',
    body: 'У вас новое уведомление',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    url: '/',
  };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    data: {
      url: data.url || '/',
      timestamp: data.timestamp || new Date().toISOString(),
    },
    vibrate: [200, 100, 200],
    tag: data.tag || 'calendar-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'Открыть',
      },
      {
        action: 'close',
        title: 'Закрыть',
      },
    ],
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => {
              // Navigate to the URL
              return client.navigate(url);
            });
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Background sync (optional - for future offline support)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
});

