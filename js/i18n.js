/* ============================================================================
   i18n.js — LÕI ĐA NGÔN NGỮ GIAO DIỆN (GĐ1 trong I18N_PLAN.md)
   ----------------------------------------------------------------------------
   Nạp SỚM trong <head>, trước mọi script khác. Là "động cơ" cho khung công tắc ngôn ngữ đã có
   (#syncLangWrap: lưu localStorage 'dich-uilang', phát sự kiện 'dich-uilang-change').

   NGUYÊN TẮC "KHÔNG PHÁ BẢN VIỆT":
   - UI = vi (mặc định): file này KHÔNG nạp từ điển, KHÔNG gắn observer, KHÔNG đụng DOM. Chỉ đặt vài hàm trả nguyên chữ Việt.
   - UI = en: nạp lười i18n-en.js (window.__I18N_EN, key = chuỗi tiếng Việt gốc → chuỗi Anh), rồi dịch
       · text node, thuộc tính title / placeholder / aria-label / alt trong DOM
       · DOM sinh động về sau (MutationObserver)
       · alert / confirm / prompt (khớp nguyên chuỗi)
     Chữ Việt gốc được ghi nhớ lại (WeakMap) nên đổi EN→VI không cần tải lại trang.
   - Thiếu bản dịch ⇒ giữ nguyên chữ Việt, không bao giờ hiện chuỗi rỗng.
   - Không đụng: nội dung truyện (#chContent) và tên chương đang đọc (#chTitle, #pgTopTitle), textarea, code/pre, contenteditable,
     [translate="no"], [data-i18n-skip] (thêm thuộc tính này cho nơi chứa dữ liệu người dùng).

   API:
     I18N.lang()                       'vi' | 'en'
     I18N.setLang('en'|'vi')           đổi ngay (không lưu; việc lưu do menu ngôn ngữ làm)
     I18N.t('Chữ Việt', [ctx], [{n}])  dùng trong JS: t('Đã lưu') ; t('Dịch','name') tra khoá 'name|Dịch' trước ;
                                       t('Đã dịch {n} chương',{n:3}) (nếu từ điển có khoá đó)
     I18N.tn(n,'Chữ Việt','1 chapter','{n} chapters')   số nhiều (vi: trả chữ Việt, thay {n})
     I18N.apply(root)                  quét lại một vùng DOM (thường không cần: có observer)
     I18N.audit()                      (EN) liệt kê chữ Việt CÒN SÓT trong DOM → dùng cho Gate 1(b) trong Console
     I18N.CFG.SKIP                     selector vùng bỏ qua
   Cờ ép ngôn ngữ (dành cho bản /en/ về sau): window.__FORCE_UILANG='en'.
   ============================================================================ */
(function (g) {
  'use strict';
  if (g.I18N) return;

  var KEY = 'dich-uilang';
  var CFG = {
    SKIP: 'script,style,noscript,textarea,code,pre,#chContent,#chTitle,#pgTopTitle,' +
          '[contenteditable=""],[contenteditable="true"],[translate="no"],[data-i18n-skip]',
    ATTRS: ['title', 'placeholder', 'aria-label', 'alt'],
    PENDING_MAX_MS: 2000 // chống nhấp nháy: ẩn trang tối đa chừng này ms trong lúc chờ từ điển EN
  };
  var VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

  var lang = 'vi', dict = null, dictN = null, loading = false, waiters = [], obs = null, domReady = false;
  var origText = new WeakMap(), origAttr = new WeakMap();

  function readLang() {
    if (g.__FORCE_UILANG === 'en' || g.__FORCE_UILANG === 'vi') return g.__FORCE_UILANG;
    try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'vi'; } catch (e) { return 'vi'; }
  }
  var norm = function (s) { return String(s).replace(/\s+/g, ' ').trim(); };

  var pats = [];
  // Giá trị placeholder dạng tên chương ("Chương 1: Cổng núi") được tra thêm 1 bậc bằng chính các khoá mẫu "Chương {n}: {x}"…
  // để toast/trạng thái chứa tên chương hiện "Chapter 1: …". Chỉ áp cho giá trị bắt đầu bằng "Chương <số>" nên không đụng chuỗi khác.
  var CH_RE = /^Chương\s+\d/;
  var NUM_RE = /^[nabm]\d*$/; // {n} {a} {b} {m}: chỉ khớp số (có . , ở giữa); tên khác ({x}...) khớp mọi chuỗi
  function buildMaps() {
    dictN = Object.create(null); pats = [];
    for (var k in dict) if (Object.prototype.hasOwnProperty.call(dict, k)) {
      var nk = norm(k);
      dictN[nk] = dict[k];
      if (/\{\w+\}/.test(nk)) {
        var names = [], src = nk.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, function (m, nm) {
          names.push(nm); return NUM_RE.test(nm) ? '([\\d.,]+)' : '(.+?)';
        });
        try { pats.push({ re: new RegExp('^' + src + '$'), names: names, out: dict[k], len: nk.length }); } catch (e) {}
      }
    }
    pats.sort(function (a, b) { return b.len - a.len; }); // mẫu dài (cụ thể) thử trước
  }
  function lookup(s, ctx, depth) {
    if (!dictN) return null;
    var k = norm(s);
    if (!k) return null;
    var v;
    if (ctx) { v = dictN[ctx + '|' + k]; if (v != null) return v; }
    v = dictN[k];
    if (v != null) return v;
    // khoá có placeholder: "703 chương" ↔ "{n} chương"; giá trị chữ (vd "Vừa") được tra thêm 1 bậc
    for (var i = 0; i < pats.length; i++) {
      var m = pats[i].re.exec(k);
      if (!m) continue;
      var vals = {};
      for (var j = 0; j < pats[i].names.length; j++) {
        var raw = m[j + 1], tv = dictN[raw];
        if (tv == null && !depth && CH_RE.test(raw)) tv = lookup(raw, '', 1);
        vals[pats[i].names[j]] = tv != null ? tv : raw;
      }
      return String(pats[i].out).replace(/\{(\w+)\}/g, function (mm, nm) { return vals[nm] != null ? vals[nm] : mm; });
    }
    return null;
  }

  // ---------- nạp lười từ điển EN (file .js để service worker network-first) ----------
  function dictUrl() {
    var cs = document.currentScript, src = cs && cs.src;
    if (!src) { var all = document.getElementsByTagName('script'); for (var i = 0; i < all.length; i++) { if (/i18n\.js(\?|$)/.test(all[i].src || '')) { src = all[i].src; break; } } }
    return src ? src.replace(/i18n\.js(\?.*)?$/, 'i18n-en.js$1') : 'i18n-en.js';
  }
  var DICT_URL = dictUrl();
  function ensureDict(cb) {
    if (dict) { cb(); return; }
    waiters.push(cb);
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = DICT_URL;
    s.onload = function () {
      loading = false; dict = g.__I18N_EN || {}; buildMaps();
      var w = waiters; waiters = []; w.forEach(function (f) { try { f(); } catch (e) { console.warn('[i18n]', e); } });
    };
    s.onerror = function () { loading = false; waiters = []; console.warn('[i18n] không nạp được ' + DICT_URL + ' — giữ nguyên tiếng Việt'); endPending(); };
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- chống nhấp nháy (chỉ khi EN) ----------
  var pendTimer = 0;
  function beginPending() {
    if (document.getElementById('i18n-pend')) return;
    var st = document.createElement('style'); st.id = 'i18n-pend';
    st.textContent = 'html.i18n-pending body{visibility:hidden}';
    (document.head || document.documentElement).appendChild(st);
    document.documentElement.classList.add('i18n-pending');
    pendTimer = setTimeout(endPending, CFG.PENDING_MAX_MS);
  }
  function endPending() {
    clearTimeout(pendTimer);
    document.documentElement.classList.remove('i18n-pending');
    var st = document.getElementById('i18n-pend'); if (st && st.parentNode) st.parentNode.removeChild(st);
  }

  // ---------- dịch DOM ----------
  function skipped(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest && el.closest(CFG.SKIP));
  }
  // Thuộc tính (placeholder/title/aria-label) của <textarea> vẫn được dịch; chỉ NỘI DUNG textarea là dữ liệu người dùng
  function skippedAttrs(el) {
    var s = el && el.closest && el.closest(CFG.SKIP);
    if (!s) return false;
    return !(s === el && el.tagName === 'TEXTAREA');
  }
  function skipBranch(n) { return n.nodeType === 1 && n.tagName !== 'TEXTAREA' && n.matches(CFG.SKIP); }
  function doText(n) {
    var rec = origText.get(n), cur = n.nodeValue;
    if (rec && cur === rec.t) return;            // đang là bản dịch do mình đặt
    if (!cur || !cur.trim()) return;
    if (skipped(n)) return;
    var tr = lookup(cur);
    if (tr == null) return;
    var m = cur.match(/^(\s*)[\s\S]*?(\s*)$/), out = m[1] + tr + m[2];
    origText.set(n, { o: cur, t: out });
    n.nodeValue = out;
  }
  function doAttrs(el) {
    if (skippedAttrs(el)) return;
    var rec = origAttr.get(el) || null;
    for (var i = 0; i < CFG.ATTRS.length; i++) {
      var a = CFG.ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var cur = el.getAttribute(a);
      if (rec && rec[a] && rec[a].t === cur) continue;
      var tr = lookup(cur);
      if (tr == null) continue;
      rec = rec || {};
      rec[a] = { o: cur, t: tr };
      origAttr.set(el, rec);
      el.setAttribute(a, tr);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType === 1) { if (skippedAttrs(root)) return; doAttrs(root); }
    else if (root.nodeType !== 9 && root.nodeType !== 11) return;
    var tw = document.createTreeWalker(root, 5, {
      acceptNode: function (n) { return skipBranch(n) ? 2 : 1; } // 2 = REJECT cả nhánh (textarea: vẫn duyệt để dịch thuộc tính)
    });
    var n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function restoreAll() {
    var root = document.documentElement;
    var tw = document.createTreeWalker(root, 5, null), n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) {
        var r = origText.get(n);
        if (r && n.nodeValue === r.t) n.nodeValue = r.o;
        origText.delete(n);
      } else {
        var ra = origAttr.get(n);
        if (ra) {
          for (var a in ra) if (n.getAttribute(a) === ra[a].t) n.setAttribute(a, ra[a].o);
          origAttr.delete(n);
        }
      }
    }
  }

  function startObserver() {
    if (obs || !window.MutationObserver || !domReady) return;
    obs = new MutationObserver(function (recs) {
      if (lang !== 'en') return;
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'childList') { for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]); }
        else if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttrs(r.target);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: CFG.ATTRS });
  }
  function stopObserver() { if (obs) { obs.disconnect(); obs = null; } }

  function syncCharmem() { try { if (typeof g.charmemSetUiLang === 'function') g.charmemSetUiLang(lang); } catch (e) {} }

  function activateEn() {
    if (!domReady) return;                 // chờ DOMContentLoaded rồi mới quét (xem boot)
    walk(document.documentElement);
    startObserver();
    endPending();
  }

  function setLang(l) {
    l = (l === 'en') ? 'en' : 'vi';
    if (l === lang && (l === 'vi' || obs)) return;
    lang = l;
    try { document.documentElement.lang = l; } catch (e) {}
    if (l === 'en') {
      ensureDict(function () { if (lang === 'en') { activateEn(); syncCharmem(); } });
    } else {
      stopObserver(); restoreAll(); endPending(); syncCharmem();
    }
  }

  // ---------- API dùng trong JS ----------
  function t(vi, a, b) {
    var ctx = typeof a === 'string' ? a : '', p = (a && typeof a === 'object') ? a : b, out = vi;
    if (lang === 'en') { var v = lookup(vi, ctx); if (v != null) out = v; }
    if (p) out = String(out).replace(/\{(\w+)\}/g, function (m, k) { return p[k] != null ? p[k] : m; });
    return out;
  }
  function tn(n, vi, one, many) {
    var s = (lang === 'en') ? (n === 1 ? one : (many != null ? many : one)) : vi;
    return String(s).replace(/\{n\}/g, n);
  }

  // alert / confirm / prompt: dịch khi khớp nguyên chuỗi (EN); VI thì gọi thẳng hàm gốc
  ['alert', 'confirm', 'prompt'].forEach(function (f) {
    var orig = g[f]; if (typeof orig !== 'function') return;
    g[f] = function () {
      var args = Array.prototype.slice.call(arguments);
      if (lang === 'en' && args[0] != null) args[0] = t(String(args[0]));
      return orig.apply(g, args);
    };
  });

  // ---------- kiểm tra chữ Việt còn sót (Gate 1b) ----------
  function audit() {
    var out = [], seen = Object.create(null);
    function add(where, text) { var k = where + '|' + norm(text); if (!seen[k]) { seen[k] = 1; out.push({ where: where, text: norm(text).slice(0, 140) }); } }
    var tw = document.createTreeWalker(document.documentElement, 5, {
      acceptNode: function (n) { return skipBranch(n) ? 2 : 1; }
    }), n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) { if (!skipped(n) && VI_RE.test(n.nodeValue) && n.nodeValue.trim()) { var p = n.parentElement; add((p ? p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') : '?') + ' text', n.nodeValue); } }
      else CFG.ATTRS.forEach(function (a) { var v = n.getAttribute && n.getAttribute(a); if (v && VI_RE.test(v)) add(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + '[' + a + ']', v); });
    }
    if (lang !== 'en') console.log('[i18n] audit chỉ có ý nghĩa khi UI = en (đang là ' + lang + ').');
    if (out.length) console.table(out); else console.log('[i18n] Không còn chữ Việt hiển thị (ngoài vùng được bỏ qua).');
    return out;
  }

  g.I18N = { CFG: CFG, lang: function () { return lang; }, setLang: setLang, t: t, tn: tn, apply: function (root) { if (lang === 'en' && dict) walk(root || document.documentElement); }, audit: audit, ready: function () { return lang !== 'en' || !!obs; } };
  g.t = g.t || t; // lối tắt cho code app: t('Chữ Việt')

  // ---------- khởi động ----------
  lang = readLang();
  try { document.documentElement.lang = lang; } catch (e) {}
  if (lang === 'en') beginPending();

  function boot() {
    domReady = true;
    syncCharmem();
    if (lang === 'en') ensureDict(function () { if (lang === 'en') activateEn(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  // Khung công tắc có sẵn trong index.html phát sự kiện này khi người dùng đổi ngôn ngữ
  document.addEventListener('dich-uilang-change', function (e) { setLang(e && e.detail); });
})(window);
