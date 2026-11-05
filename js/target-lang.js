/* ============================================================================
   target-lang.js — CỔNG NGÔN NGỮ ĐÍCH (độc lập với ngôn ngữ giao diện)
   ----------------------------------------------------------------------------
   Nguồn sự thật: localStorage['dich-tgtlang'] (ô "Dịch sang" trong Cài đặt). Rỗng/không có = 'vi'.
   Nạp SỚM (sau i18n.js, trước translate.js / character-memory.js).

   QUY TẮC:
   - Đích = vi  → toàn bộ đường tiếng Việt như cũ (presets.js, xưng hô, soát xưng hô). KHÔNG đổi byte nào.
   - Đích ≠ vi  → dùng presets-en.js (prompt tiếng Anh + {{TARGET_LANG}}); preset TỰ TẠO được gói trong khung tiếng Anh (2.6); các tính năng riêng tiếng Việt bị ẨN.
   - Muốn mở tính năng cho 1 ngôn ngữ: thêm 1 dòng vào FEATURES bên dưới, ví dụ  en:{ addr:true }.

   API:  TargetLang.code()          'vi' | 'en' | 'zh-CN' ...
         TargetLang.isVi()
         TargetLang.name()          tên tiếng Anh của ngôn ngữ đích ("English", "Japanese"...) để điền vào prompt
         TargetLang.supports('addr'|'honorific')   tính năng này có dùng được với đích hiện tại không
         TargetLang.srcName()       tên tiếng Anh ngôn ngữ nguồn ('the source language' nếu để Tự nhận diện)
         TargetLang.script()/dir()/notes()   bảng chữ, hướng chữ (ltr|rtl), ghi chú ngắn — từ lang-registry.js
         TargetLang.nameNative()    tên bản ngữ của ngôn ngữ đích ("Español"...)
         TargetLang.status()/isTested()   'tested' | 'experimental' của ngôn ngữ đích (2.10; dữ liệu ở lang-registry.js — chỉ để HIỂN THỊ nhãn, không chặn gì)
         TargetLang.fill(prompt)    thay {{TARGET_LANG}}, {{SOURCE_LANG}}, {{TARGET_NOTES}} trong prompt tiếng Anh
   ============================================================================ */
(function (g) {
  'use strict';
  if (g.TargetLang) return;
  var KEY = 'dich-tgtlang';
  var SRC_KEY = 'dich-srclang'; // ô "Ngôn ngữ nguồn" ('auto' hoặc rỗng = tự nhận diện)

  // Tính năng chỉ có nghĩa với 1 số ngôn ngữ đích. Thiếu mục = KHÔNG hỗ trợ.
  //   addr      = "Xưng hô thường gặp" (addr-presets.js)
  //   honorific = soát xưng hô bản dịch (character-memory.js)
  //   spell     = kiểm tra chính tả (từ điển âm tiết tiếng Việt)
  var FEATURES = {
    vi: { addr: true, honorific: true, spell: true }
    // sau này: ja: { honorific: true }, ...
  };

  function code() {
    try { return localStorage.getItem(KEY) || 'vi'; } catch (e) { return 'vi'; }
  }
  function isVi() { return code() === 'vi'; }
  function base(c) { return String(c).split('-')[0]; }
  function reg(c) { try { return (g.LangRegistry && g.LangRegistry.get(c)) || null; } catch (e) { return null; } }
  function name() {
    var c = code(), r = reg(c);
    if (r) return r.nameEn; // lang-registry.js (2.4)
    try {
      if (g.Intl && Intl.DisplayNames) { var n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c); if (n) return n; }
    } catch (e) {}
    return c;
  }
  function supports(feature) {
    var c = code(), f = FEATURES[c] || FEATURES[base(c)];
    if (f && f[feature]) return true;
    // 2.12: 'addr' tự mở cho ngôn ngữ nào CÓ gói dữ liệu trong addr-presets.js (hiện chỉ vi; ngôn ngữ khác để trống ⇒ vẫn ẩn)
    if (feature === 'addr') { try { return !!(g.AddrPresets && g.AddrPresets.hasPack && g.AddrPresets.hasPack(c)); } catch (e) {} }
    return false;
  }
  // Tên tiếng Anh của ngôn ngữ NGUỒN. 'auto'/rỗng/không nhận ra → "the source language" (câu "Translate from the source language into English" vẫn đúng ngữ pháp).
  function srcName() {
    var c = '';
    try { c = localStorage.getItem(SRC_KEY) || ''; } catch (e) {}
    if (!c || c === 'auto') return 'the source language';
    var rs = reg(c); if (rs) return rs.nameEn;
    try {
      if (g.Intl && Intl.DisplayNames) { var n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c); if (n && n !== c) return n; }
    } catch (e) {}
    return 'the source language';
  }
  // Bảng chữ / hướng chữ / ghi chú ngắn của ngôn ngữ đích (mặc định Latn / ltr / rỗng nếu mã chưa có trong registry)
  function script() { var r = reg(code()); return r ? r.script : 'Latn'; }
  function dir() { var r = reg(code()); return r ? r.dir : 'ltr'; }
  function notes() { var r = reg(code()); return r ? r.notes : ''; }
  // 2.10: tên bản ngữ + trạng thái chất lượng (mã chưa có trong registry = 'experimental')
  function nameNative() { var r = reg(code()); return r ? r.nameNative : name(); }
  function status() { try { return g.LangRegistry ? g.LangRegistry.status(code()) : 'experimental'; } catch (e) { return 'experimental'; } }
  function isTested() { return status() === 'tested'; }
  function fill(prompt) { return String(prompt).replace(/\{\{TARGET_LANG\}\}/g, name()).replace(/\{\{SOURCE_LANG\}\}/g, srcName()).replace(/\{\{TARGET_NOTES\}\}/g, notes()); }

  // ---------- Preset TỰ TẠO của người dùng (2.6) ----------
  // Preset tự tạo = id không nằm trong DEFAULT_PRESETS_EN (cùng danh sách id với presets.js). Thường viết bằng tiếng Việt.
  // Đích ≠ vi: KHÔNG tự xoá/sửa văn bản của người dùng; gói nó trong khung tiếng Anh ngắn, nói rõ đây là chỉ dẫn của người dùng
  // và ngôn ngữ ra là {{TARGET_LANG}}, bỏ qua quy tắc chỉ có nghĩa với tiếng Việt. Văn bản người dùng giữ NGUYÊN (không qua fill()).
  var CUSTOM_HEAD = 'You are translating web-novel text from {{SOURCE_LANG}} into {{TARGET_LANG}}.\n' +
    'Below are the user\'s own translation instructions (they may be written in another language). Follow them for style, tone, terminology and formatting. ' +
    'The OUTPUT language is {{TARGET_LANG}}: ignore any rule that only makes sense for Vietnamese output ' +
    '(for example Sino-Vietnamese / Han-Viet vocabulary, Vietnamese pronouns and forms of address such as ta/ngươi, huynh/muội), and never write the translation in Vietnamese.\n' +
    '--- USER INSTRUCTIONS ---\n';
  var CUSTOM_TAIL = '\n--- END USER INSTRUCTIONS ---';
  function isCustomPreset(presetId) {
    try {
      if (typeof DEFAULT_PRESETS_EN === 'undefined' || !presetId) return false;
      for (var i = 0; i < DEFAULT_PRESETS_EN.length; i++) if (DEFAULT_PRESETS_EN[i].id === presetId) return false;
      return true;
    } catch (e) { return false; }
  }
  // Văn bản có chứa quy tắc đặc thù tiếng Việt không (chỉ để HIỆN cảnh báo nhỏ; không dùng để sửa/xoá gì)
  var VI_RULE_RE = /h[áa]n[\s-]*vi[eệ]t|x[ưu]ng h[ôo]|ta\s*\/\s*ng[ưu][ơo]i|huynh\s*\/\s*mu[ộo]i|đại từ|việt hoá|việt hóa|tiếng việt|vietnamese/i;
  function viRuleWarn(text) { return VI_RULE_RE.test(String(text || '')); }

  // Chọn prompt gửi AI. Từ khi có 2 bộ preset tách biệt (index.html: '' = vi, 'en' = đích khác), ô soạn đã CHỨA đúng prompt của bộ đang dùng:
  //   Đích = vi  → trả NGUYÊN viPrompt (không đổi byte).
  //   Đích ≠ vi  → fill() các {{...}} trong chính văn bản đó (kể cả chỗ người dùng đã sửa); preset TỰ TẠO (id không nằm trong DEFAULT_PRESETS_EN) được gói thêm trong khung CUSTOM_HEAD/TAIL.
  // Nếu ô soạn đang thuộc bộ khác với đích hiện tại (đổi đích tạm không phát sự kiện: LangQA, phép thử Console) → lấy prompt của preset đang chọn trong đúng bộ từ kho lưu (presetPromptFor, index.html).
  function pickPrompt(viPrompt, presetId) {
    try {
      if (typeof presetPromptFor === 'function') {
        var alt = presetPromptFor(isVi() ? '' : 'en');
        if (alt) { viPrompt = alt.prompt; presetId = alt.id; }
      }
    } catch (e) {}
    if (isVi()) return viPrompt;
    if (!viPrompt || !String(viPrompt).trim()) return viPrompt;
    if (isCustomPreset(presetId)) return fill(CUSTOM_HEAD) + fill(viPrompt) + CUSTOM_TAIL;
    return fill(viPrompt);
  }

  // Đặt class trên <html> để CSS ẩn tính năng không hỗ trợ (đích = vi: KHÔNG có class nào → không đổi gì).
  var FEATS = ['addr', 'honorific', 'spell'];
  function refresh() {
    var el = document.documentElement; if (!el) return;
    FEATS.forEach(function (f) { el.classList.toggle('tl-no-' + f, !supports(f)); });
    try { document.dispatchEvent(new CustomEvent('dich-tgtlang-change', { detail: code() })); } catch (e) {}
  }
  document.addEventListener('dich-uilang-change', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh); else refresh();

  // ---------- Mẫu tiêu đề chương mặc định theo ngôn ngữ GIAO DIỆN ----------
  // VI = đúng chuỗi cứng trong index.html (không đổi). EN = bỏ mẫu tiếng Việt, dùng "Chapter [number]"; mẫu Trung giữ nguyên.
  // Khi UI chuyển sang en (và lúc nạp trang với UI = en): mẫu mặc định VI → EN; mẫu người dùng đã sửa → chỉ bỏ các mục tiếng Việt (xem syncPat).
  // Không đụng khi đang mở truyện, vì mẫu chia chương nằm trong khoá của các bản chia đã lưu (splitConfigKey).
  var PAT_VI = 'Chương [number],Thứ [number] chương,**Chương [number],第[number]章,第[text]章,正文 第[number]章';
  var PAT_EN = 'Chapter [number],Chapter [text],**Chapter [number],第[number]章,第[text]章,正文 第[number]章';
  // Mẫu tiêu đề chương theo ngôn ngữ GIAO DIỆN.
  //   UI = en: mẫu mặc định tiếng Việt → thay bằng PAT_EN; mẫu người dùng đã sửa → chỉ BỎ các mục tiếng Việt (có "Chương"/"Thứ [..]"), thiếu mục "Chapter" thì thêm vào đầu.
  //   UI = vi: chỉ đổi lại khi ô đang đúng mẫu mặc định tiếng Anh (người dùng đã sửa thì giữ nguyên).
  // Bỏ qua khi đang mở truyện (đổi mẫu = đổi khoá chia chương của truyện đó). persist=true (người dùng vừa bấm đổi ngôn ngữ): lưu luôn cài đặt.
  // Lưu ý: đổi mẫu làm khoá chia chương (splitConfigKey) đổi → truyện đã chia bằng mẫu cũ sẽ được chia lại với mẫu mới khi mở.
  var VI_PAT_RE = /ch[uư][oơ]ng|th[ứu]\s*\[/i;
  var EN_PAT_HEAD = 'Chapter [number],Chapter [text],**Chapter [number]';
  function viPatEntry(p) { return VI_PAT_RE.test(p); }
  function syncPat(persist) {
    // ĐÃ TẮT: KHÔNG đổi mẫu tiêu đề chương theo ngôn ngữ giao diện nữa.
    // Lý do: mẫu nằm trong khoá bản chia/bản dịch đã lưu (splitConfigKey) và truyện thường vẫn có tiêu đề "Chương N" dù UI = en.
    // Đổi mẫu khi đổi UI làm mất mẫu "Chương [number]" → truyện chia ra 1 chương → app tự dò, tự thêm mẫu lạ
    // (VD "Chương [number]: Chap [number]: ") và lưu luôn vào cài đặt; đổi lại UI = vi không khôi phục được vì ô không còn đúng mẫu mặc định.
    // Truyện tiếng Anh ("Chapter N") đã có sẵn cơ chế tự dò mẫu khi mở truyện.
    return;
    try {
      if (!g.I18N) return;
      var el = document.getElementById('chapterPattern'); if (!el) return;
      if (typeof S !== 'undefined' && S && S.chapters && S.chapters.length) return; // đã mở truyện → không đụng
      var cur = el.value, nv = cur;
      if (g.I18N.lang() === 'en') {
        if (cur === PAT_VI) nv = PAT_EN;
        else if (cur.trim()) {
          var parts = cur.split(','), keep = parts.filter(function (p) { return !viPatEntry(p); });
          if (keep.length !== parts.length) {
            var joined = keep.join(',');
            if (!/chapter/i.test(joined)) joined = EN_PAT_HEAD + (joined.trim() ? ',' + joined : '');
            nv = joined;
          }
        } // cur rỗng: người dùng cố tình xoá hết → giữ nguyên
      } else if (cur === PAT_EN) nv = PAT_VI;
      if (nv === cur) return;
      el.value = nv;
      if (typeof patternTagsRenderFromInput === 'function') patternTagsRenderFromInput();
      if (persist && typeof persistDsQuiet === 'function') { try { persistDsQuiet(); } catch (e) {} }
    } catch (e) {}
  }
  document.addEventListener('dich-uilang-change', function () { setTimeout(function () { syncPat(true); }, 0); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(syncPat, 0); }); else setTimeout(syncPat, 0);

  // Từ đứng đầu dòng tiêu đề mà bộ nhập EPUB tự chèn: 'Chương' (như cũ) trừ khi mẫu hiện tại chỉ có dạng 'Chapter [number]'.
  function autoHeadingWord(pat) {
    pat = String(pat || '');
    var hasVi = /(^|,)\s*\*{0,2}Chương \[number\]/.test(pat), hasEn = /(^|,)\s*\*{0,2}Chapter \[number\]/i.test(pat);
    return (!hasVi && hasEn) ? 'Chapter' : 'Chương';
  }

  g.TargetLang = { autoHeadingWord: autoHeadingWord, syncPat: syncPat, PAT_VI: PAT_VI, PAT_EN: PAT_EN, pickPrompt: pickPrompt, isCustomPreset: isCustomPreset, viRuleWarn: viRuleWarn, refresh: refresh, code: code, isVi: isVi, name: name, srcName: srcName, script: script, dir: dir, notes: notes, nameNative: nameNative, status: status, isTested: isTested, supports: supports, fill: fill, FEATURES: FEATURES };
})(window);
