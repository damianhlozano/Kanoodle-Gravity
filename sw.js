// Service worker: guarda todo el juego en el teléfono para que funcione sin internet.
// Al cambiar cualquier archivo, subir la versión para que los teléfonos se actualicen.
const VERSION = 'kanoodle-gravity-v1';
const SONIDOS = ['agarrar', 'alerta', 'caer', 'click', 'deshacer', 'entrar', 'error', 'ganar', 'girar',
  'pista', 'reiniciar', 'voltear'];
const ARCHIVOS = [
  './', 'index.html', 'juego.js', 'niveles.js', 'manifest.webmanifest',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/icono-maskable-512.png',
  'iconos/apple-touch-icon.png', 'iconos/favicon-64.png',
  ...SONIDOS.flatMap(s => [`sonidos/${s}.ogg`, `sonidos/${s}.mp3`]),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Responde desde la copia guardada (funciona sin internet) y, si hay conexión, la actualiza de fondo:
// los cambios publicados aparecen la próxima vez que se abre el juego.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => {
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    }).catch(() => cached);
    if (cached) { e.waitUntil(net); return cached; }
    return net;
  }));
});
