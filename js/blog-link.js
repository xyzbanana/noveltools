/* ===================================================================
   blog-link.js — Gợi ý "Đánh giá từ NovelTools Reviewer" cho truyện trong Tủ truyện
   -------------------------------------------------------------------
   Truyện có TÊN GỐC (ô "Tên truyện gốc" / "Tên tác giả gốc") thì hỏi blog Reviewer đúng MỘT request:
     GET <Worker>/reviews/match?oa=<tác giả gốc>&ot=<tên truyện gốc>
   Kết quả dùng ở 2 nơi:
     1. Toast nhỏ góc trên bên phải khi blog có bài đánh giá CỦA CHÍNH TRUYỆN ĐÓ (thẻ "Xem đánh giá chi tiết về truyện").
        Mỗi truyện chỉ báo MỘT lần, nhớ vĩnh viễn; tự ẩn sau 10 giây, hoặc khi chạm/click ra ngoài, hoặc nhấn Esc.
     2. Mục "Đánh giá từ NovelTools Reviewer" ở cuối popup "Thông tin truyện" (bài của truyện + truyện khác của tác giả).

   KHI NÀO GỌI WORKER (NtBlogLink.check chạy nền, không cần mở popup):
     - ngay sau khi "Phát hiện thông tin truyện" được áp dụng (có tên gốc),
     - ngay sau khi lưu popup "Thông tin truyện" (người dùng vừa nhập/sửa tên gốc),
     - khi mở truyện để đọc mà truyện đã có tên gốc nhưng chưa có kết quả trong cache (chờ vài giây, đổi truyện thì bỏ).
     Mở popup "Thông tin truyện" cũng dùng chung cache; chưa có kết quả thì hỏi (NtBlogLink.show).

   TIẾT KIỆM REQUEST WORKER (thứ tự từ rẻ nhất):
     1. Không có tên gốc -> KHÔNG gọi gì cả. Truyện đã báo toast rồi -> không hỏi lại.
     2. Kết quả (có / không có) lưu localStorage: có = 7 ngày, không = 7 ngày, lỗi = 15 phút (không dồn lỗi).
        Khoá theo tên gốc đã chuẩn hoá nên nhiều bản của cùng một truyện dùng chung.
     3. Chờ DELAY ms (mở truyện để đọc: chờ lâu hơn) và chỉ gọi nếu vẫn đang ở đúng truyện/popup đó; tab đang ẩn thì chờ tab hiện;
        bật "Tiết kiệm dữ liệu" thì không gọi. Lướt nhanh qua nhiều truyện = chỉ truyện cuối cùng được hỏi.
     4. Hạn mức phía Worker: 15 lượt/IP/ngày (biến MATCH_DAILY_IP). Vượt thì Worker trả 429 + giờ hẹn; blog-link.js lưu giờ đó
        (nt-blog-block) và không gọi nữa cho tới khi hết hạn — kết quả đã cache vẫn dùng bình thường.
     5. URL chuẩn hoá (đã bỏ dấu, tham số xếp theo thứ tự) nên mọi người dùng chung cache ở biên + cache trình duyệt 1 giờ.
     6. Chỉ có chữ, không tải ảnh bìa (ảnh bìa của blog đi qua route /img/ của Worker, mỗi ảnh = 1 request).
   Tắt hẳn bằng code: localStorage.setItem('nt-blog-off','1'); bật lại: NtBlogLink.enable()

   API công khai:  NtBlogLink.check(bk, {delay, alive})  |  NtBlogLink.show(bk)  |  NtBlogLink.hide()  |  NtBlogLink.enable()  |  NtBlogLink.clearCache()
     bk là một truyện hoặc object giả {name, author, names:{title:{orig}, author:{orig}}} (xem biBlog() trong index.html).
   Phụ thuộc (mục trong popup): #bookInfoOverlay .bi-scroll và các class .bi-sec/.bi-sec-h (index.html), biến CSS --bg2, --bg3, --border,
   --pnl-*, --text*, --accent. Không phụ thuộc file nào khác.
   =================================================================== */
(function () {
  'use strict';

  var API = 'https://noveltools-reviewer.thienco-tcc.workers.dev';
  // Cùng domain với blog thì dùng đường dẫn tương đối; chạy ở domain khác (localhost, domain riêng) thì trỏ về domain blog.
  var SITE = location.hostname === 'noveltools.pages.dev' ? '' : 'https://noveltools.pages.dev';
  var AUTHOR_ONLY = true;           // true: không có bài của truyện nhưng có bài của tác giả vẫn hiện mục (gọn hơn)
  var DELAY = 400;                  // ms chờ sau khi mở popup / rời ô tên gốc rồi mới gọi mạng
  var TTL_HIT = 7 * 864e5, TTL_MISS = 7 * 864e5, TTL_ERR = 15 * 6e4;
  var MAX_ENTRIES = 150, MAX_TOAST = 400;
  var LS_CACHE = 'nt-blog-m1', LS_OFF = 'nt-blog-off', LS_TOAST = 'nt-blog-toast', LS_BLOCK = 'nt-blog-block';

  var S = {
    vi: {
      sec: 'Đánh giá từ NovelTools Reviewer',
      cta: 'Xem đánh giá chi tiết về truyện', headAuthor: 'Đánh giá truyện cùng tác giả',
      more: 'Truyện khác của ', chap: 'Mở trong tab mới'
    },
    en: {
      sec: 'Reviews from NovelTools Reviewer',
      cta: 'Read the detailed review', headAuthor: 'Reviews of this author',
      more: 'More by ', chap: 'Opens in a new tab'
    }
  };
  function isEn() { try { return !!(window.I18N && I18N.lang && I18N.lang() === 'en'); } catch (e) { return false; } }
  function T(k) { return (isEn() ? S.en : S.vi)[k]; }

  /* ---------- tiện ích ---------- */
  var CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
  // Giống ftFold ở Worker: bỏ dấu, đ -> d, chữ thường, ký hiệu -> khoảng trắng. Chuẩn hoá ở máy khách để URL ổn định (trúng cache).
  function fold(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* đầy bộ nhớ: bỏ qua, chỉ mất cache */ } }
  function track(action) { try { if (typeof gtag === 'function') gtag('event', 'reviewer_card', { action: action }); } catch (e) { } }
  function isOff() { try { return localStorage.getItem(LS_OFF) === '1'; } catch (e) { return false; } }

  /* ---------- cache localStorage ---------- */
  function cacheGet(key) {
    var all = lsGet(LS_CACHE) || {}, e = all[key];
    if (!e || !(e.x > Date.now())) return undefined;
    return e;                       // { x: hết hạn, t: lúc lưu, r: kết quả | null, err?: 1 }
  }
  function cacheSet(key, r, err) {
    var all = lsGet(LS_CACHE) || {}, now = Date.now();
    all[key] = { t: now, x: now + (err ? TTL_ERR : r ? TTL_HIT : TTL_MISS), r: r || null };
    if (err) all[key].err = 1;
    var ks = Object.keys(all);
    ks.forEach(function (k) { if (!(all[k].x > now)) delete all[k]; });
    ks = Object.keys(all);
    if (ks.length > MAX_ENTRIES) {
      ks.sort(function (a, b) { return all[a].t - all[b].t; });
      ks.slice(0, ks.length - MAX_ENTRIES).forEach(function (k) { delete all[k]; });
    }
    lsSet(LS_CACHE, all);
  }

  /* ---------- tên gốc của truyện ---------- */
  function namesOf(bk) {
    var n = (bk && bk.names) || {}, t = n.title || {}, a = n.author || {};
    var ot = t.orig || (CJK.test((bk && bk.name) || '') ? bk.name : '');
    var oa = a.orig || (CJK.test((bk && bk.author) || '') ? bk.author : '');
    ot = fold(ot); oa = fold(oa);
    var need = function (s) { return s.replace(/ /g, '').length >= (CJK.test(s) ? 2 : 4); };
    return { ot: need(ot) ? ot : '', oa: need(oa) ? oa : '' };
  }

  /* ---------- trạng thái ---------- */
  var seq = 0, timer = 0, card = null, curKey = '', inflight = {};   // seq/timer/curKey: mục trong popup
  var chkSeq = 0, chkTimer = 0;                                       // chkSeq/chkTimer: lượt tra cứu nền (không cần popup)
  var toastEl = null, toastTimer = 0;
  var TOAST_MS = 10000;                                               // toast tự ẩn sau 10 giây nếu người dùng không làm gì

  // Toast chỉ báo MỘT lần cho mỗi truyện, nhớ vĩnh viễn trong localStorage (không nhắc lại, kể cả sau khi tải lại trang).
  function wasToasted(key) { var a = lsGet(LS_TOAST); return !!(a && a.indexOf(key) >= 0); }
  function markToasted(key) {
    var a = lsGet(LS_TOAST) || [];
    if (a.indexOf(key) < 0) a.push(key);
    if (a.length > MAX_TOAST) a = a.slice(a.length - MAX_TOAST);
    lsSet(LS_TOAST, a);
  }
  // Worker báo hết lượt trong ngày (429): nghỉ tới giờ Worker hẹn, không gọi nữa (kết quả đã cache vẫn dùng được).
  function blocked() { var t = lsGet(LS_BLOCK); return typeof t === 'number' && t > Date.now(); }
  function canFetch() {
    if (blocked()) return false;
    try { if (navigator.onLine === false || (navigator.connection && navigator.connection.saveData)) return false; } catch (e) { }
    return true;
  }
  function maybeToast(res, key) { if (res && res.r && !isOff() && !wasToasted(key)) showToast(res.r, key); }

  function whenVisible(fn) {
    if (!document.hidden) return fn();
    var on = function () { if (document.hidden) return; document.removeEventListener('visibilitychange', on); fn(); };
    document.addEventListener('visibilitychange', on);
  }
  // Chờ delay ms; chỉ chạy fn nếu alive() còn đúng (đã đổi truyện / đóng popup thì bỏ) và tab đang hiện.
  function later(delay, alive, fn) {
    return setTimeout(function () {
      if (!alive()) return;
      whenVisible(function () { if (alive()) fn(); });
    }, delay);
  }

  // Hỏi Worker đúng MỘT request cho cặp tên gốc; cb(res) chỉ được gọi khi blog có bài của truyện hoặc của tác giả.
  function request(nm, key, cb) {
    var q = [];                                          // thứ tự cố định (oa, ot) để URL luôn giống nhau giữa mọi người dùng
    if (nm.oa) q.push('oa=' + encodeURIComponent(nm.oa));
    if (nm.ot) q.push('ot=' + encodeURIComponent(nm.ot));
    var url = API.replace(/\/+$/, '') + '/reviews/match?' + q.join('&');
    var p = inflight[url];
    if (!p) {
      p = inflight[url] = fetch(url).then(function (r) {
        if (r.status === 429) {                          // hết 15 lượt/IP/ngày: đọc giờ hẹn rồi dừng
          return r.json().catch(function () { return {}; }).then(function (d) {
            var e = new Error('http_429');
            e.wait = Number(d && d.retry_after) || Number(r.headers.get('Retry-After')) || 0;
            throw e;
          });
        }
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      });
      var clear = function () { delete inflight[url]; };
      p.then(clear, clear);
    }
    p.then(function (d) {
      var has = d && (d.r || (AUTHOR_ONLY && d.m && d.m.length));
      var res = has ? { r: d.r || null, m: d.m || [], n: d.n || 0, au: d.au || '' } : null;
      cacheSet(key, res);
      if (res) { try { cb(res); } catch (e) { console.warn('[blog-link]', e); } }
    }).catch(function (e) {
      if (e && e.message === 'http_429') {               // không lưu kết quả (chưa biết có bài hay không) để mai hỏi lại
        lsSet(LS_BLOCK, Date.now() + Math.max(60, e.wait || 21600) * 1000);
        return;
      }
      cacheSet(key, null, true);                         // lỗi mạng/Worker: nghỉ 15 phút, không thử lại dồn dập
    });
  }

  function hide() {
    seq++; clearTimeout(timer); timer = 0;
    if (card) { card.classList.remove('in'); card.hidden = true; }
    curKey = '';
  }

  // Mục trong popup "Thông tin truyện": hiện khi popup mở (hoặc khi tên gốc trong popup đổi).
  function show(bk) {
    if (!bk || isOff()) { hide(); return; }
    var nm = namesOf(bk);
    if (!nm.ot && !nm.oa) { hide(); return; }           // không có tên gốc -> 0 request, không hiện mục
    var key = nm.ot + '|' + nm.oa;
    if (key === curKey) return;                          // tên gốc không đổi (vd. đổi tên hiển thị) -> giữ nguyên, 0 request
    hide();
    curKey = key;
    var token = seq, hit = cacheGet(key);
    if (hit) { if (hit.r) { render(hit.r, key); maybeToast(hit.r, key); } return; }   // trúng cache (kể cả "không có") -> 0 request
    if (!canFetch()) return;
    timer = later(DELAY, function () { return token === seq; }, function () {
      timer = 0;
      request(nm, key, function (res) { if (token === seq) render(res, key); maybeToast(res, key); });
    });
  }

  // Tra cứu NỀN ngay khi truyện có tên gốc (vừa phát hiện / vừa lưu / mở truyện để đọc), không cần mở popup.
  // Có bài của truyện thì hiện toast (1 lần cho mỗi truyện). opts.delay: chờ bao lâu; opts.alive(): trả false thì bỏ (vd. đã chuyển truyện khác).
  function check(bk, opts) {
    opts = opts || {};
    if (!bk || isOff()) return;
    var nm = namesOf(bk);
    if (!nm.ot && !nm.oa) return;                        // chưa có tên gốc -> 0 request
    var key = nm.ot + '|' + nm.oa;
    if (wasToasted(key)) return;                         // đã báo rồi -> không cần hỏi nữa
    var hit = cacheGet(key);
    if (hit) { if (hit.r) maybeToast(hit.r, key); return; }
    if (!canFetch()) return;
    clearTimeout(chkTimer);
    var tk = ++chkSeq;                                   // lượt mới thay lượt cũ chưa kịp gọi (lướt nhanh qua nhiều truyện = chỉ truyện cuối được hỏi)
    chkTimer = later(opts.delay == null ? DELAY : opts.delay,
      function () { return tk === chkSeq && (!opts.alive || opts.alive()); },
      function () { request(nm, key, function (res) { maybeToast(res, key); }); });
  }

  /* ---------- giao diện ---------- */
  function ensureStyle() {
    if (document.getElementById('nblStyle')) return;
    var st = document.createElement('style'); st.id = 'nblStyle';
    st.textContent =
      '.bi-sec.nbl{opacity:0;transform:translateY(4px);transition:opacity .3s ease,transform .3s ease}' +
      '.bi-sec.nbl.in{opacity:1;transform:none}' +
      '.bi-sec.nbl .bi-sec-h{margin:0 0 12px}' +
      '.nbl-feat{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;background:var(--bg3);box-shadow:0 0 0 1px var(--pnl-ring);color:inherit;text-decoration:none;transition:background .15s}' +
      '.nbl-ic{flex:none;width:36px;height:36px;border-radius:11px;background:var(--pnl-soft);color:var(--text2);display:grid;place-items:center}' +
      '.nbl-ic-s{width:28px;height:28px;border-radius:9px}' +
      '.nbl-ft{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
      '.nbl-t{font-size:13.5px;font-weight:650;color:var(--text);line-height:1.35}' +
      '.nbl-m{font-size:12.5px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.nbl-go{flex:none;color:var(--text3);transition:color .15s,transform .15s}' +
      '.nbl-lb{margin:16px 0 8px;font-size:13px;font-weight:650;color:var(--text2)}' +
      '.nbl-hd+.nbl-lb{margin-top:0}' +
      '.nbl-list{display:flex;flex-direction:column;gap:8px}' +
      '.nbl-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--bg3);box-shadow:0 0 0 1px var(--pnl-ring);color:inherit;text-decoration:none;transition:background .15s}' +
      '.nbl-ct{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:600;color:var(--text);line-height:1.35}' +
      '.nbl-rt{flex:none;font-size:12.5px;color:var(--text3)}' +
      '.nbl-toast{position:fixed;z-index:1400;top:max(14px,env(safe-area-inset-top));right:14px;width:min(384px,calc(100vw - 28px));opacity:0;transform:translateY(-8px);transition:opacity .25s ease,transform .25s ease;pointer-events:none}' +
      '.nbl-toast.in{opacity:1;transform:none;pointer-events:auto}' +
      '.nbl-toast-in{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:14px;background:var(--bg2);box-shadow:var(--pnl-shadow),0 0 0 1px var(--pnl-ring);color:inherit;text-decoration:none}' +
      '@media (max-width:560px){.nbl-toast{left:14px;right:14px;width:auto}}' +
      '@media (hover:hover){' +
      '.nbl-feat:hover,.nbl-card:hover{background:var(--pnl-hover)}.nbl-feat:hover .nbl-go,.nbl-card:hover .nbl-go{color:var(--text);transform:translate(1px,-1px)}}' +
      '.bi-sec.nbl a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
      '@media (prefers-reduced-motion:reduce){.bi-sec.nbl,.nbl-go,.nbl-toast{transition:none}}';
    document.head.appendChild(st);
  }

  function el(tag, cls, text, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;            // textContent: dữ liệu từ blog không bao giờ chạy như HTML
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function svg(d, w) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', w || 15); s.setAttribute('height', w || 15); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  var ICON_BOOK = 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z';
  var ICON_OUT = 'M7 17L17 7M8 7h9v9';

  function reviewUrl(r) { return SITE + '/reviewer/' + (isEn() && r.en ? 'en/' : '') + 'review/' + encodeURIComponent(r.id); }
  function link(cls, href, action) {
    var a = el('a', cls, null, { href: href, target: '_blank', rel: 'noopener', title: T('chap') });
    a.addEventListener('click', function () { track(action); });
    return a;
  }
  function stars(rt) { return rt > 0 ? '★ ' + (Math.round(rt * 10) / 10) : ''; }

  function render(res, key) {
    if (key !== curKey) return;
    var host = document.querySelector('#bookInfoOverlay .bi-scroll');
    if (!host) return;
    ensureStyle();
    if (!card) { card = el('section', 'bi-sec nbl', null, { id: 'ntBlogCard', 'data-i18n-skip': '' }); card.hidden = true; }
    if (card.parentNode !== host || host.lastElementChild !== card) host.appendChild(card);   // luôn là mục cuối của popup
    card.textContent = ''; card.classList.remove('in');

    var hasReview = !!res.r, au = res.au || (res.r && res.r.a) || '';

    var hd = el('div', 'nbl-hd');
    hd.appendChild(el('h4', 'bi-sec-h', T('sec')));
    card.appendChild(hd);

    if (hasReview) {
      var feat = link('nbl-feat', reviewUrl(res.r), 'open_review');
      var ic = el('span', 'nbl-ic'); ic.appendChild(svg(ICON_BOOK, 17));
      var ft = el('span', 'nbl-ft');
      ft.appendChild(el('span', 'nbl-t', T('cta')));
      var meta = [res.r.t, stars(res.r.rt)].filter(Boolean).join(' · ');
      if (meta) ft.appendChild(el('span', 'nbl-m', meta));
      var go = svg(ICON_OUT, 16); go.setAttribute('class', 'nbl-go');
      feat.appendChild(ic); feat.appendChild(ft); feat.appendChild(go);
      card.appendChild(feat);
    }
    if (res.m && res.m.length) {
      card.appendChild(el('div', 'nbl-lb', hasReview ? T('more') + (au || '…') : T('headAuthor') + (au ? ' · ' + au : '')));
      var list = el('div', 'nbl-list');
      res.m.slice(0, 3).forEach(function (m) {
        var c = link('nbl-card', reviewUrl(m), 'open_other');
        var ic2 = el('span', 'nbl-ic nbl-ic-s'); ic2.appendChild(svg(ICON_BOOK, 14)); c.appendChild(ic2);
        c.appendChild(el('span', 'nbl-ct', m.t));
        var rt = stars(m.rt); if (rt) c.appendChild(el('span', 'nbl-rt', rt));
        var go = svg(ICON_OUT, 15); go.setAttribute('class', 'nbl-go'); c.appendChild(go);
        list.appendChild(c);
      });
      card.appendChild(list);
    }

    card.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (key === curKey) card.classList.add('in'); }); });
    track('view');
  }

  /* ---------- toast gợi ý (góc trên bên phải màn hình) ---------- */
  function closeToast() {
    clearTimeout(toastTimer); toastTimer = 0;
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onToastKey, true);
    window.removeEventListener('resize', placeToast);
    if (!toastEl) return;
    var t = toastEl; toastEl = null;
    t.classList.remove('in');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
  }
  // Toast nằm NGAY DƯỚI thanh công cụ (#toolbar) thay vì đè lên thanh đó. Không thấy toolbar (trang chủ, toolbar bị ẩn) -> dùng vị trí mặc định trong CSS.
  function placeToast() {
    if (!toastEl) return;
    var top = '';
    try {
      var tb = document.getElementById('toolbar');
      if (tb) { var r = tb.getBoundingClientRect(); if (r.height > 0 && r.bottom > 0) top = Math.round(r.bottom + 10) + 'px'; }
    } catch (e) { }
    toastEl.style.top = top;
  }
  function onDocDown(e) { if (toastEl && toastEl.contains(e.target)) return; closeToast(); }   // chạm/click bất kỳ chỗ nào ngoài toast = ẩn
  function onToastKey(e) { if (e.key === 'Escape') closeToast(); }
  function showToast(r, key) {
    markToasted(key);                                    // ghi nhớ ngay: mỗi truyện chỉ báo 1 lần, không nhắc lại
    ensureStyle(); closeToast();
    var t = el('div', 'nbl-toast', null, { role: 'status', 'aria-live': 'polite', 'data-i18n-skip': '' });
    var a = link('nbl-toast-in', reviewUrl(r), 'open_review_toast');
    var ic = el('span', 'nbl-ic'); ic.appendChild(svg(ICON_BOOK, 17));
    var ft = el('span', 'nbl-ft');
    ft.appendChild(el('span', 'nbl-t', T('cta')));
    var meta = [r.t, stars(r.rt)].filter(Boolean).join(' · ');
    if (meta) ft.appendChild(el('span', 'nbl-m', meta));
    var go = svg(ICON_OUT, 16); go.setAttribute('class', 'nbl-go');
    a.appendChild(ic); a.appendChild(ft); a.appendChild(go);
    a.addEventListener('click', closeToast);
    t.appendChild(a);
    t.addEventListener('mouseenter', function () { clearTimeout(toastTimer); toastTimer = 0; });          // rê chuột vào thì giữ lại để bấm
    t.addEventListener('mouseleave', function () { if (toastEl === t) toastTimer = setTimeout(closeToast, 3000); });
    document.body.appendChild(t);
    toastEl = t;
    placeToast();
    window.addEventListener('resize', placeToast);       // toolbar đổi chiều cao (xoay màn hình, thu hẹp cửa sổ) -> đặt lại
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (toastEl === t) t.classList.add('in'); }); });
    toastTimer = setTimeout(closeToast, TOAST_MS);
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onToastKey, true);
    track('toast');
  }

  window.NtBlogLink = {
    show: show, hide: hide, check: check,
    enable: function () { try { localStorage.removeItem(LS_OFF); } catch (e) { } },
    clearCache: function () { try { localStorage.removeItem(LS_CACHE); localStorage.removeItem(LS_TOAST); localStorage.removeItem(LS_BLOCK); } catch (e) { } }
  };
})();
