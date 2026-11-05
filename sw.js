// sw.js — Service Worker tối thiểu cho NovelTools
// Mục đích chính: (1) cho phép Chrome/Edge Android hiện nút "Cài đặt app" (PWA installability
// yêu cầu phải có SW đăng ký fetch handler), (2) cache app-shell để load nhanh hơn ở các lần sau
// và có thể mở lại (không có mạng) tối thiểu là trang chính.
//
// CHIẾN LƯỢC:
// - HTML (navigate) và file code hay đổi (tts.js, tts.css, character-memory.js): NETWORK-FIRST —
//   luôn cố lấy bản mới nhất ngay lần load/reload đầu tiên khi có mạng, chỉ fallback về cache
//   lúc mất mạng. Nhờ vậy deploy bản mới xong, người dùng thấy ngay chỉ sau 1 lần reload.
// - File tĩnh còn lại (icon, manifest...) hầu như không đổi: stale-while-revalidate — trả cache
//   ngay lập tức (nhanh), đồng thời âm thầm tải bản mới ở nền và ghi đè cache cho lần mở sau.
// Nhờ chiến lược trên, KHÔNG cần đổi CACHE_NAME thủ công mỗi lần deploy. (CACHE_NAME vẫn giữ để
// dọn dẹp cache rác nếu sau này bạn đổi kiến trúc file.)
//
// LƯU Ý: cache này chỉ chứa các file code (html/js/css/icon), KHÔNG đụng tới localStorage —
// bản dịch, tiến độ đọc, cài đặt của người dùng lưu ở localStorage nên không bị ảnh hưởng
// dù cache có bị xoá/đổi tên.

const CACHE_NAME = 'nt-shell-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/tts.css',
  '/tts.js',
  '/character-memory.css',
  '/character-memory.js',
  '/lang-registry.js', // bảng ngôn ngữ (tên EN, bảng chữ, hướng chữ)
  '/target-lang.js', // cổng ngôn ngữ đích
  '/presets-en.js', // prompt dịch tiếng Anh (đích ≠ vi)
  '/i18n.js', // lõi đa ngôn ngữ (i18n-en.js nạp lười khi chọn English, không precache)
  '/en/', // GĐ4B: bản tiếng Anh (do tools/build-en.js sinh). Chưa deploy /en/ thì cache.add lỗi 404 và bị bỏ qua (có catch bên dưới)
  '/en/index.html',
  '/en/manifest.json',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-48.png',
  '/favicon-512.png',
  '/icon-192.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll sẽ fail toàn bộ nếu 1 file 404 — dùng allSettled để an toàn hơn
      return Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Chỉ xử lý http(s): request của tiện ích trình duyệt (chrome-extension://…) không cache được → trước đây gây lỗi "Request scheme 'chrome-extension' is unsupported"
  if (!/^https?:/i.test(req.url)) return;

  // Trang HTML (navigation): network-first — luôn cố lấy bản mới nhất khi có mạng,
  // chỉ fallback về cache khi mất mạng.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        // Mất mạng: trang /en/… rơi về /en/index.html, còn lại như cũ (/index.html bản Việt)
        .catch(() => caches.match(req).then((res) => res || caches.match(/^\/en(\/|$)/.test(new URL(req.url).pathname) ? '/en/index.html' : '/index.html')))
    );
    return;
  }

  // File CODE hay được cập nhật (tts.js, tts.css, character-memory.js): dùng
  // NETWORK-FIRST thay vì stale-while-revalidate — nếu không thì mỗi lần
  // deploy bản mới, người dùng phải reload TỚI 2 LẦN mới thấy thay đổi (lần 1
  // vẫn nhận cache cũ, chỉ âm thầm tải bản mới ở nền cho lần sau). Với
  // network-first: có mạng thì luôn lấy bản mới nhất ngay từ lần reload đầu
  // tiên; chỉ khi mất mạng mới fallback về cache (vẫn giữ được khả năng mở
  // lại offline như mục tiêu ban đầu của app-shell).
  // MỌI file .js/.css cùng nguồn (backup.js, translate.js, export.js, index...): NETWORK-FIRST.
  // Trước đây chỉ vài file nằm trong danh sách cố định nên backup.js bị trả bản cache CŨ sau
  // mỗi lần deploy → máy không có syncNoteChaptersDeleted / tombstone xoá chương, đồng bộ sai.
  // cache:'no-cache' buộc xác thực lại với server, tránh cả HTTP cache của trình duyệt.
  const url = new URL(req.url);
  if (url.origin === self.location.origin && /\.(js|css)$/.test(url.pathname) && url.pathname !== '/sw.js') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // File tĩnh khác (icon, manifest...): stale-while-revalidate — trả cache ngay cho nhanh,
  // đồng thời fetch bản mới ở nền và ghi đè cache cho lần sau. Không cần bump CACHE_NAME.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});

