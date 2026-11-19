'use strict';
// Guarda o jogo inteiro no aparelho para funcionar sem internet.
// FILES e CACHE são atualizados por tools/build_web.py.
const CACHE = 'rkz-fddefade34';
const FILES = [
  './',
  'decks/backs.webp',
  'decks/buraco_moderno.webp',
  'decks/decks.json',
  'decks/thumbs.webp',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'js/analyzer.js',
  'js/app.js',
  'js/cardart.js',
  'js/game.js',
  'js/sounds.js',
  'js/userdecks.js',
  'js/view.js',
  'js/worker.js',
  'manifest.webmanifest',
  'sounds/draw.wav',
  'sounds/place.wav',
  'sounds/win.wav',
  'style.css',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    // Só apaga versões antigas do próprio site; os baralhos importados ('user-decks') ficam.
    .then(keys => Promise.all(keys.filter(k => k.startsWith('rkz-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primeiro o que está guardado; sem cópia, busca na rede (e guarda).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(cache =>
    cache.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(resp => {
      if (resp.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, resp.clone());
      return resp;
    }))));
});
