// ===================================================================
// book-meta.js — Nhận diện TÊN TRUYỆN / TÁC GIẢ ở đầu truyện, dịch + phiên âm, rồi hỏi người dùng
// có cập nhật vào "Thông tin truyện" không (popup ntBookMetaPopup nằm sẵn trong index.html).
//
// File này là classic script (không type=module), nạp SAU character-memory.js:
//   <script src="book-meta.js"></script>
// Dùng chung scope global với index.html/translate.js: S, libGet, callAPI, acquireApiLock/releaseApiLock,
// rlDayBlocked/rlDayBlock, ntBookMetaPopup.
//
// QUY TẮC CHẠY
//  - CHỈ chạy khi truyện CHƯA có tên tác giả trong thông tin truyện (bk.author và bk.names.author đều trống).
//  - CHỈ nhìn 3 chương đầu của truyện (tính cả bản "Mở đầu"/chương 0 nếu có), lần lượt từng chương.
//    Thấy tên truyện và/hoặc tác giả ở chương nào thì DỪNG ngay. Hết 3 chương mà không thấy thì dừng hẳn
//    (đánh dấu đã quét, không quét lại truyện này).
//  - Chưa có khoá Gemini -> im lặng; vừa nhập khoá xong (ô #apiKeys) thì tự quét truyện đang mở, không cần mở lại truyện.
//  - CHỈ dùng model gemini-3.5-flash-lite (khoá API Gemini), không đổi sang model khác, không dùng DeepSeek.
//    Không có khoá Gemini -> không chạy. Lỗi API tạm thời (429/mạng...) -> dừng, KHÔNG đánh dấu, lần mở sau thử lại.
//  - Mỗi chương 1 lượt gọi: AI vừa nhận diện (đa ngôn ngữ, mọi chữ viết) vừa dịch + phiên âm.
//    Chống bịa: chuỗi "orig" AI trả về phải xuất hiện NGUYÊN VĂN trong đoạn đầu chương, không thì bị bỏ.
//
// Hợp đồng với popup (index.html):
//   info = { title:{orig,vi,latin}|null, author:{orig,vi,latin}|null, source:'<tiêu đề chương tìm thấy>' }
//   "vi" = dạng DỊCH sang ngôn ngữ đích hiện hành (giữ khoá "vi" vì bk.names đã dùng khoá này),
//   "latin" = phiên âm Latinh, "orig" = nguyên văn.
//   Popup gọi ntMetaMarkDone(bookId) mỗi khi đóng (đồng ý / từ chối / đóng) -> không hỏi lại truyện đó.
// ===================================================================
(function (root) {
  'use strict';

  const META_MODEL = 'gemini-3.5-flash-lite'; // CỐ ĐỊNH theo yêu cầu — không đọc từ cài đặt model
  const MAX_CHAPTERS = 3;                      // gồm cả bản Mở đầu (S.chapters[0] khi có)
  const HEAD_CHARS = 2500;                     // chỉ gửi phần đầu mỗi chương
  const MAX_KEYS_TRIED = 2;
  const CALL_TIMEOUT_MS = 30000;

  // ---------- Chữ viết (để biết bản gốc đã là chữ Latinh chưa) ----------
  function scriptOf(s) {
    s = String(s || '');
    if (/[\u3040-\u30ff]/.test(s)) return 'ja';
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(s)) return 'ko';
    if (/[\u3400-\u9fff\uf900-\ufaff]/.test(s)) return 'han';
    if (/[\u0400-\u04ff]/.test(s)) return 'cyrl';
    if (/[\u0e00-\u0e7f]/.test(s)) return 'thai';
    if (/[\u0600-\u06ff\u0750-\u077f]/.test(s)) return 'arab';
    if (/[\u0900-\u097f]/.test(s)) return 'deva';
    if (/[\u0370-\u03ff]/.test(s)) return 'grek';
    if (/[\u0590-\u05ff]/.test(s)) return 'hebr';
    return 'latn';
  }

  // ---------- Ngôn ngữ đích ----------
  function targetLang() {
    try { return (localStorage.getItem('dich-tgtlang') || 'vi').trim() || 'vi'; } catch (e) { return 'vi'; }
  }
  function langName(code) {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch (e) { return code; }
  }

  // ---------- Khoá Gemini (KHÔNG dùng getKeys(): hàm đó trả khoá DeepSeek khi người dùng đang chọn DeepSeek) ----------
  function geminiKeys() {
    try {
      const ta = document.getElementById('apiKeys');
      return ((ta && ta.value) || '').split('\n').map(k => k.trim()).filter(k => k.length > 10);
    } catch (e) { return []; }
  }

  // ---------- Prompt ----------
  function buildPrompt(head, tgt) {
    const T = langName(tgt);
    const sino = tgt === 'vi'
      ? ' For Chinese names use the Sino-Vietnamese (Hán-Việt) reading, capitalized per syllable (e.g. 大力宝 -> Đại Lực Bảo); for Japanese/Korean/other names use the standard Vietnamese transliteration.'
      : '';
    return (
      'You are given the BEGINNING of one chapter (or prelude) of a web novel, in any language. Decide whether it contains explicit BOOK METADATA: ' +
      'the novel\'s own TITLE and/or its AUTHOR name, written as a header, byline or info block ' +
      '(e.g. "Title/Author: ...", "书名 / 作者：...", "タイトル / 著者", "제목 / 저자", "Tác giả: ...", "by ...", usually in the first lines, often next to fields such as status, genre, word count, update notes).\n\n' +
      'RULES\n' +
      '- Extract ONLY what the text explicitly states as the book\'s own title / author. NEVER infer from the story, character names or chapter headings. A chapter heading is NOT the book title. If a field is not stated, use null for it.\n' +
      '- "orig": copy EXACTLY as written in the text (same script and characters; no translation, no labels, no surrounding brackets/quotes).\n' +
      '- "tr": the ' + T + ' form. For a title: translate the MEANING naturally, in a fiction-title style. For an author (a personal/pen name): never translate its meaning; give the conventional ' + T + ' rendering of the name.' + sino + ' If "orig" is already in ' + T + ', copy it.\n' +
      '- "rom": Latin-script romanization of "orig" (pinyin without tone marks for Chinese, Hepburn for Japanese, Revised Romanization for Korean, BGN/PCGN for Cyrillic, RTGS for Thai, etc.), Title Case. If "orig" is already Latin script, copy it.\n' +
      '- Return ONLY valid JSON, no notes, no markdown: {"found":true|false,"title":{"orig":"","tr":"","rom":""}|null,"author":{"orig":"","tr":"","rom":""}|null}\n' +
      '- If neither is stated: {"found":false,"title":null,"author":null}\n\n' +
      'TEXT:\n"""\n' + head + '\n"""'
    );
  }

  // ---------- Đọc + kiểm tra kết quả AI ----------
  function parseJsonLoose(t) {
    t = String(t || '').replace(/```(?:json)?/gi, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  }
  const normKey = s => String(s || '').normalize('NFC').replace(/[\s\u3000\u00a0]+/g, '').toLowerCase();
  const str = v => (typeof v === 'string' ? v.trim() : '');

  // Trả {title,author} (mỗi cái {orig,vi,latin}|null) hoặc null nếu không có gì hợp lệ.
  function parseResult(raw, head) {
    const j = typeof raw === 'string' ? parseJsonLoose(raw) : raw;
    if (!j || j.found === false) return null;
    const hk = normKey(head);
    const one = (o, max) => {
      if (!o || typeof o !== 'object') return null;
      const orig = str(o.orig);
      if (!orig || orig.length > max || /[\r\n]/.test(orig)) return null;
      if (!/[\p{L}\p{N}]/u.test(orig) || /^\d+$/.test(orig)) return null;
      if (!hk.includes(normKey(orig))) return null;                 // chống bịa: phải có nguyên văn trong đoạn đầu chương
      const r = { orig };
      const tr = str(o.tr).slice(0, 200), rom = str(o.rom).slice(0, 200);
      if (scriptOf(orig) === 'latn') {                              // gốc đã là chữ Latinh
        r.latin = orig;
        r.vi = (tr && !/[\r\n]/.test(tr)) ? tr : orig;
      } else {
        if (rom && scriptOf(rom) === 'latn' && !/[\r\n]/.test(rom)) r.latin = rom;
        if (tr && tr !== orig && !/[\r\n]/.test(tr)) r.vi = tr;
      }
      return r;
    };
    const title = one(j.title, 160), author = one(j.author, 80);
    if (!title && !author) return null;
    return { title, author };
  }

  // ---------- 1 lượt gọi AI cho 1 chương ----------
  // Trả {ok:true,result:<parseResult>|null} hoặc {ok:false,err}. Chỉ model gemini-3.5-flash-lite.
  async function askAI(head, keys, tgt, alive) {
    if (typeof callAPI !== 'function') return { ok: false, err: 'callAPI missing' };
    const messages = [{ role: 'user', parts: [{ text: buildPrompt(head, tgt) }] }];
    let tried = 0, lastErr = null;
    for (const key of keys) {
      if (tried >= MAX_KEYS_TRIED) break;
      if (typeof rlDayBlocked === 'function' && rlDayBlocked(META_MODEL, key)) continue;
      tried++;
      try {
        if (typeof acquireApiLock === 'function') await acquireApiLock();
        // Chờ slot có thể rất lâu (vd. đang dịch tiêu đề hàng loạt); nếu truyện đã đổi trong lúc chờ thì bỏ, đỡ tốn 1 lượt gọi vô ích.
        if (alive && !alive()) { if (typeof releaseApiLock === 'function') releaseApiLock(); return { ok: false, aborted: true }; }
        let r;
        try {
          r = await Promise.race([
            callAPI(key, META_MODEL, messages, 1500, 'fast', undefined, 'title', { json: true }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), CALL_TIMEOUT_MS))
          ]);
        } finally { if (typeof releaseApiLock === 'function') releaseApiLock(); }
        const j = parseJsonLoose(r && r.text);
        if (!j) { lastErr = new Error('JSON không hợp lệ'); continue; }
        return { ok: true, result: parseResult(j, head) };
      } catch (e) {
        lastErr = e;
        const msg = String((e && e.message) || e);
        if (/429/.test(msg) && /QUOTA_PER_DAY/.test(msg) && typeof rlDayBlock === 'function') rlDayBlock(META_MODEL, key);
        if (/429/.test(msg)) break;                                   // hết hạn mức: dừng, không đổi model
      }
    }
    return { ok: false, err: lastErr };
  }

  // ---------- Trạng thái "đã hỏi/đã quét" (popup gọi ntMetaMarkDone khi đóng) ----------
  const DONE_KEY = 'nt-meta-done';
  function readDone() { try { const a = JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function ntMetaIsDone(id) { return readDone().includes(id); }
  function ntMetaMarkDone(id) {
    if (!id) return;
    try {
      const a = readDone();
      if (!a.includes(id)) a.push(id);
      localStorage.setItem(DONE_KEY, JSON.stringify(a.slice(-800)));
    } catch (e) { /* localStorage đầy: chấp nhận hỏi lại lần sau */ }
  }

  // ---------- Quét truyện đang mở ----------
  // Lỗi cũ: import nhiều truyện liền nhau (hoặc import khi đang chờ slot API) -> lượt quét của truyện đầu bị huỷ vì S.gen đổi,
  // còn lượt quét của truyện sau bị cờ _running chặn ngay ("return") -> KHÔNG truyện nào được quét cho tới khi mở lại truyện.
  // Nay: yêu cầu đến lúc đang bận thì nhớ lại (_again), quét xong sẽ chạy lại cho truyện đang mở.
  let _running = false, _again = false;
  async function ntBookMetaScan(bookId) {
    if (_running) { _again = true; return; }
    _running = true;
    try {
      await scanOnce(bookId);
    } finally {
      _running = false;
      if (_again) { _again = false; setTimeout(() => { ntBookMetaScan(); }, 300); }
    }
  }
  async function scanOnce(bookId) {
    try {
      if (typeof S === 'undefined' || typeof libGet !== 'function' || typeof ntBookMetaPopup !== 'function') return;
      bookId = bookId || S.loadedBookId;
      if (!bookId || ntMetaIsDone(bookId)) return;
      const bk = await libGet(bookId);
      if (!bk) return;
      // CHỈ chạy khi truyện chưa có tên tác giả trong thông tin truyện.
      if ((bk.author && String(bk.author).trim()) || (bk.names && bk.names.author && Object.keys(bk.names.author).length)) return;
      const keys = geminiKeys();
      if (!keys.length) return;                                       // không có khoá Gemini -> không chạy (không đánh dấu)
      const gen = S.gen;
      const chapters = (S.chapters || []).slice(0, MAX_CHAPTERS).map(c => ({
        title: String((c && c.title) || ''),
        head: String((c && c.content) || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().slice(0, HEAD_CHARS)
      }));
      if (!chapters.length) return;
      const tgt = targetLang();
      let allChecked = true;
      for (const ch of chapters) {
        if (S.gen !== gen || S.loadedBookId !== bookId) return;       // người dùng đã chuyển truyện
        if (ch.head.length < 8) continue;                             // chương rỗng: coi như đã xem
        const r = await askAI(ch.head, keys, tgt, () => S.gen === gen && S.loadedBookId === bookId);
        if (r.aborted || S.gen !== gen || S.loadedBookId !== bookId) return;
        if (!r.ok) { console.warn('[BookMeta] lỗi gọi AI, thử lại lần mở sau:', r.err && r.err.message || r.err); allChecked = false; break; }
        if (r.result) {                                               // THẤY -> dừng ngay, hỏi người dùng
          const info = { title: r.result.title, author: r.result.author, source: ch.title };
          await ntBookMetaPopup(bookId, info);
          return;
        }
      }
      if (allChecked) ntMetaMarkDone(bookId);                         // hết 3 chương không thấy -> ngừng hẳn
    } catch (e) {
      console.warn('[BookMeta] quét tên truyện/tác giả lỗi:', e);
    }
  }

  // ---------- Móc vào loadTxt: mỗi lần mở/nhập truyện đều kiểm tra (điều kiện ở trên tự loại phần lớn) ----------
  function hook() {
    if (typeof root.loadTxt !== 'function' || root.loadTxt._ntMeta) return;
    const orig = root.loadTxt;
    const wrapped = function () {
      const r = orig.apply(this, arguments);
      try { setTimeout(() => { ntBookMetaScan(); }, 1500); } catch (e) { /* bỏ qua */ }
      return r;
    };
    wrapped._ntMeta = true;
    root.loadTxt = wrapped;
  }

  // ---------- Nhập khoá Gemini xong -> tự quét truyện đang mở ----------
  // Dùng event delegation (ô #apiKeys có thể bị di chuyển trong DOM). Debounce để không gọi khi đang gõ/dán dở khoá;
  // chỉ quét khi tập khoá hợp lệ có thêm khoá MỚI (tránh quét lại mỗi lần sửa chữ trong ô).
  let _keySig = geminiKeys().join('|'), _keyTimer = null;
  function onKeysInput(e) {
    const t = e && e.target;
    if (!t || t.id !== 'apiKeys') return;
    clearTimeout(_keyTimer);
    _keyTimer = setTimeout(() => {
      const cur = geminiKeys();
      const old = _keySig ? _keySig.split('|') : [];
      const hasNew = cur.some(k => !old.includes(k));
      _keySig = cur.join('|');
      if (cur.length && hasNew) ntBookMetaScan();                  // có khoá -> quét truyện đang mở (điều kiện khác vẫn do ntBookMetaScan kiểm tra)
    }, 1500);
  }
  try {
    document.addEventListener('input', onKeysInput, true);
    document.addEventListener('change', onKeysInput, true);
  } catch (e) { /* bỏ qua */ }

  root.ntBookMetaScan = ntBookMetaScan;
  root.ntMetaMarkDone = ntMetaMarkDone;
  root.ntMetaIsDone = ntMetaIsDone;
  root.NtBookMeta = { scriptOf, buildPrompt, parseResult, META_MODEL };
  hook();
})(typeof window !== 'undefined' ? window : globalThis);
