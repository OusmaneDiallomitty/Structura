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
// v8 : Network First pour les pages HTML (évite de servir du HTML obsolète après
//      un déploiement), Cache First pour les assets statiques hashés.
const CACHE_VERSION = 'structura-v9';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const PAGES_CACHE   = `${CACHE_VERSION}-pages`;

/**
 * App Shell — toutes les pages critiques précachées à l'installation du SW.
 * Garantit qu'un refresh hors ligne sur n'importe quelle page fonctionne,
 * même sur première visite ou après longue absence.
 */
const APP_SHELL = [
  '/offline.html',
  '/logo.png',
  '/login',
  '/dashboard',
  '/dashboard/students',
  '/dashboard/students/add',
  '/dashboard/classes',
  '/dashboard/attendance',
  '/dashboard/payments',
  '/dashboard/grades',
  '/dashboard/team',
  '/dashboard/settings',
  '/dashboard/profile',
  '/dashboard/billing',
];

// ── Install : pré-cacher l'app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())   // activer immédiatement sans attendre reload
      .catch(() => self.skipWaiting())  // ne pas bloquer si une URL échoue (auth redirect)
  );
});

// ── Activate : purger les anciens caches (versions précédentes) ───────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k)  => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() =>
        // Notifier tous les onglets ouverts qu'une nouvelle version est active
        // → l'app se recharge silencieusement pour charger les nouveaux assets
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) =>
          clientList.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }))
        )
      )
  );
});

// ── Stratégies de cache ───────────────────────────────────────────────────────

/**
 * Cache First — pour les assets statiques hashés (_next/static/*).
 * Ces fichiers ont des noms uniques (ex: main.abc123.js) → jamais modifiés.
 * Stratégie : cache toujours prioritaire, réseau seulement si absent.
 */
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

/**
 * Network First — pour les pages HTML et RSC payloads Next.js.
 *
 * Comportement :
 *   Online  → réseau toujours prioritaire → HTML frais à chaque déploiement
 *   Offline → cache servi si disponible, sinon offline.html
 *
 * Pourquoi pas staleWhileRevalidate ?
 *   SWR servait l'ancien HTML en cache immédiatement, avec les anciens noms de
 *   chunks JS. Après un déploiement Vercel, les utilisateurs voyaient l'ancienne
 *   version jusqu'au prochain refresh manuel.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Hors ligne : servir depuis le cache
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const fallback = await caches.match('/offline.html');
      if (fallback) return fallback;
    }

    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

// ── Fetch : intercepter toutes les requêtes same-origin ──────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Non-HTTP (chrome-extension://, etc.) → ignorer
  if (!url.protocol.startsWith('http')) return;

  // Cross-origin (API Render, Sentry, Vercel analytics, etc.) → laisser passer
  // Les appels API sont gérés par IndexedDB/sync-queue, pas par le SW
  if (url.hostname !== self.location.hostname) return;

  // Routes API Next.js et monitoring → laisser passer (jamais mettre en cache)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/monitoring')) return;

  // Assets statiques Next.js (/_next/static/*) — noms hashés, immuables → Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Images, fonts, fichiers publics → Cache First
  if (/\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf|css)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Pages HTML, RSC payloads (_next/data/*, ?_rsc=*) → Network First
  event.respondWith(networkFirst(request, PAGES_CACHE));
});
