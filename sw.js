const CACHE_NAME = 'shonen-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/watch.html',
  '/style.css',
  '/script.js',
  '/watch.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // Pass-through fetch (No caching as requested)
  event.respondWith(fetch(event.request));
});
