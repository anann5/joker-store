/* eslint-disable no-undef */
const CACHE_NAME = 'joker-store-v13';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/theme.js',
    '/shared.js',
    '/script.js',
    '/i18n.js',
    '/push.js',
    '/image/logo.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(()=>{})))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok && event.request.method === 'GET') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request).then(cached => cached || new Response(
                        JSON.stringify({ success: false, error: 'Offline' }),
                        { status: 503, headers: { 'Content-Type': 'application/json' } }
                    ));
                })
        );
        return;
    }
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response.ok && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                if (event.request.destination === 'image') {
                    return caches.match('/image/logo.png');
                }
                return new Response('Offline', { status: 503 });
            });
        })
    );
});

// ==================== Web Push ====================

self.addEventListener('push', event => {
    let data = {};
    if (event.data) {
        try { data = event.data.json(); } catch (_) { data = { body: event.data.text() }; }
    }
    const title = data.title || 'Joker Store';
    const options = {
        body: data.body || '',
        icon: data.icon || '/image/logo.png',
        badge: '/image/logo.png',
        tag: data.tag || 'general',
        renotify: true,
        data: { url: data.url || '/' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            const url = new URL(target, self.location.origin);
            for (const client of clientList) {
                if ('focus' in client && new URL(client.url).pathname === url.pathname) {
                    return client.focus();
                }
            }
            return clients.openWindow(url.href);
        })
    );
});
