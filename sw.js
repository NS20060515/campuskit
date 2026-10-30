/* 校园通 Service Worker —— 让手机/电脑在断网时也能打开
 * 策略：全部「网络优先，失败回退缓存」。
 *   · 本地/LAN 环境网络本来就快，优先拿最新的，避免改动后仍跑旧文件
 *   · 断网时回退到缓存，离线照常可用
 * 注意：改了网页文件后把 VERSION 加一，可让旧缓存被清理。
 */
var VERSION = 'campushub-v7';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './img/base-amap.jpg',
  './js/util.js',
  './js/campus-map.js',
  './js/data.js',
  './js/store.js',
  './js/ui.js',
  './js/occupancy.js',
  './js/qr.js',
  './js/install.js',
  './js/timetable.js',
  './js/lost.js',
  './js/qa.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // 逐个加入：某个文件缺失不至于让整个安装失败
      return Promise.all(SHELL.map(function (u) {
        return cache.add(u)['catch'](function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  // 统一网络优先：保证改动即时生效；断网时回退缓存
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    })['catch'](function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
