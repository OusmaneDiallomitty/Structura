// Structura Service Worker — offline support + Web Push notifications

// ── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Structura', body: event.data.text() };
  }

  const { title, body, url, icon, badge } = data;

  event.waitUntil(
    self.registration.showNotification(title || 'Structura', {
      body: body || '',
      icon: icon || '/logo.png',
      badge: badge || '/logo.png',
      data: { url: url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});

// ── Offline Cache ─────────────────────────────────────────────────────────────
const CACHE_VERSION = 'structura-v4';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const PAGES_CACHE   = `${CACHE_VERSION}-pages`;

// Pages à précacher lors de l'installation (garantissent un fallback offline)
const APP_SHELL = [
  '/offline.html',
  '/dashboard',
  '/login',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate : purger les vieux caches ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Essayer le cache exact
    const cached = await caches.match(request);
    if (cached) return cached;

    // Pour les navigations : fallback dashboard ou offline.html
    if (request.mode === 'navigate') {
      const dashboard = await caches.match('/dashboard');
      if (dashboard) return dashboard;
      return caches.match('/offline.html');
    }

    // Pour les requêtes RSC / données Next.js : réponse vide acceptable
    // Next.js gardera la page actuelle en mémoire
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-HTTP
  if (!url.protocol.startsWith('http')) return;

  // Laisser passer les requêtes cross-origin (API backend Render, Sentry, etc.)
  if (url.hostname !== self.location.hostname) return;

  // Laisser passer les routes API Next.js et monitoring
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/monitoring')) return;

  // Assets statiques Next.js (noms hashés, immuables) → Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Images, fonts, fichiers publics → Cache First
  if (/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Tout le reste (pages HTML, RSC payloads Next.js, chunks dynamiques)
  // → Network First avec fallback cache
  // Couvre : navigate, RSC (Accept: text/x-component), prefetch, etc.
  event.respondWith(networkFirst(request));
});
