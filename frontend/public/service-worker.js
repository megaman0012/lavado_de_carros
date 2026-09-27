/* Service worker mínimo (sin Workbox) para instalar la app como PWA.
 *
 * - Navegación (index.html): RED PRIMERO, caché solo sin conexión. Antes era
 *   caché primero con un nombre de caché fijo: quien instaló la app se quedaba
 *   para siempre con el index.html viejo, que apunta a los bundles viejos, y no
 *   veía ninguna actualización.
 * - Bundles de /static/: caché primero. Llevan hash en el nombre, así que un
 *   archivo nuevo nunca pisa uno viejo.
 * - API y uploads: siempre red, nunca caché (datos dinámicos, evidencia).
 *
 * Subir CACHE_NAME en cada cambio de este archivo borra las cachés anteriores.
 */
const CACHE_NAME = 'total-clean-car-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/brand/logo-mark.png', '/brand/logo-mark-white.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

const guardar = (request, response) => {
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const copia = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fuentes, etc.: las maneja el navegador
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    return; // siempre red, nunca cache (datos dinámicos / evidencia fotográfica)
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => guardar(new Request('/index.html'), response))
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => guardar(request, response)))
  );
});
