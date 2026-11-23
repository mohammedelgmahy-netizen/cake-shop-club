// Network-First: أي تحديث في الموقع بيوصل فوراً من غير مسح كاش يدوي.
// النسخة المحفوظة بتستخدم بس لو مفيش نت، عشان الصفحة تفتح وتقول للعميل إن النت قاطع.
var CACHE = 'cs-v2';
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', 'index.html', 'icon-192.png']).catch(function () {}); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                                  // طلبات السيرفر (POST) بتروح مباشرة
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                   // خطوط جوجل وغيرها: زي ما هي
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(function () {
      return caches.match('index.html').then(function (r) { return r || new Response('<meta charset="utf-8"><p dir="rtl" style="font-family:Tahoma;text-align:center;margin-top:40vh">مفيش اتصال بالإنترنت. اتأكد من النت وجرّب تاني.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req).then(function (r) { return r || Response.error(); }); }));
});
