// =====================================================================
// edit-text.js — popup "Sửa văn bản" (find & replace) gắn với truyện đang
// =====================================================================

// ===== XOÁ KÝ TỰ/DÒNG TRANG TRÍ RÁC (***, =====, -----, _____, ———) =====
// Tự động dọn, không cấu hình được (khác etRules do người dùng tự thêm). Chạy trong loadTxt()
// và renderCh() ở index.html (script src="edit-text.js" nạp trước nên hàm luôn có sẵn).
// - "*": xoá toàn bộ, không cần ngưỡng — chỉ dùng để che/trang trí, không có nghĩa gì khác.
// - "=", "_": xoá khi lặp liên tục >5 lần, ở bất kỳ đâu (kể cả dính liền chữ, vì nguồn hay mất
//   xuống dòng gốc).
// - "-", "—", "–": xoá khi lặp >5 lần NHƯNG chỉ khi đứng riêng NGUYÊN 1 DÒNG — vì dấu gạch còn
//   dùng làm ký hiệu lời thoại bị ngắt/bỏ lửng trong câu (VD 「Tại sao ngươi lại——————」), nếu
//   xoá tự do sẽ mất dụng ý này.
// Không dùng blacklist kiểu [^\p{L}\p{N}\s] vì sẽ xoá nhầm !!!!/?????/……/~~~~ có chủ ý của tác giả.
// Lưu ý: "-" trong character class phải escape "\\-" (không đặt giữa 2 ký tự khác), nếu không
// JS hiểu nhầm thành dải Unicode, có thể nuốt luôn cả A-Z.
const CENSOR_ANY_CHARS='=_';
const CENSOR_LINE_CHARS='—–\\-';
const CENSOR_STAR_RE=/\*/g;
const CENSOR_ANY_RE=new RegExp('(['+CENSOR_ANY_CHARS+'])\\1{5,}','g');
const CENSOR_LINE_RE=new RegExp('^[ \\t]*(['+CENSOR_LINE_CHARS+'])\\1{5,}[ \\t]*\\r?$','gm');
function cleanDecorChars(text){
  if(!text||typeof text!=='string')return text;
  let out=text.replace(CENSOR_STAR_RE,'').replace(CENSOR_ANY_RE,'').replace(CENSOR_LINE_RE,'');
  // Dọn khoảng trắng/dòng trống thừa để lại sau khi xoá.
  out=out.replace(/[ \t]{2,}/g,' ').replace(/^[ \t]+/gm,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n');
  return out;
}

const ET_RULES_KEY = 'dich-et-rules';
const ET_SORT_KEY = 'dich-et-sort'; // {[scopeKey]: true/false} — công tắc "Ưu tiên cụm dài trước"
const ET_AINOTE_KEY = 'dich-et-ainote'; // {[S.fname của truyện]: "ghi chú cho AI"} — gửi kèm bản gốc mỗi lần dịch (xem etGetAiNote)
const ET_AINOTE_MAX = 4000; // giới hạn độ dài ghi chú, tránh phình token mỗi chương

let etRules = [];
let etNextId = 1;
let etSortPrefs = {};
let etAiNotes = {};
let etScopes = []; // trạng thái UI (accordion) của popup đang mở, xem etBuildScopes()

// Icon "layers" (lớp chồng) — biểu tượng quen thuộc cho "áp dụng cho tất cả",
// tránh trùng icon tủ sách đã dùng cho "Tủ truyện" ở header của app.
const ET_ICON_ALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';
const ET_ICON_READING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 18.5v-14Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>';
const ET_ICON_SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';
const ET_ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ET_ICON_CHEVRON = '<svg class="et-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const ET_ICON_ARROW = '<svg class="et-row-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
const ET_ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ET_ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ET_ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
const ET_ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
const ET_ICON_PASTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
const ET_ICON_DETAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>';

// Ghi chú giải nghĩa các mã — đặt luôn trong ô nhập ở dạng dòng "#" (bị bỏ
// qua khi Lưu/Nhập), sắp xếp theo số từ thấp tới cao.
const ET_CODE_HELP_LINES = [
  '# --------------------------------------------',
  '# Mỗi dòng 1 quy tắc: [từ_khoá]=[thay_bằng]=[mã]',
  '# Mã = 512 (mặc định)',
  '# Mã = 513 = khớp đúng từ',
  '# Mã = 514 = phân biệt hoa/thường',
  '# Mã = 515 = khớp đúng từ + phân biệt hoa/thường',
  '# Mã = 522 (bật regex .*)',
  '# Mã = 523 = regex + khớp đúng từ',
  '# Mã = 524 = regex + phân biệt hoa/thường',
  '# Mã = 525 = regex + khớp đúng từ + phân biệt hoa/thường',
  '# --------------------------------------------'
];
// Dịch theo ngôn ngữ giao diện LÚC MỞ (không dùng hằng cố định vì người dùng có thể đổi ngôn ngữ sau khi nạp trang).
// Dòng "#" luôn bị bỏ qua khi Lưu/Nhập nên đổi chữ không ảnh hưởng quy tắc.
function etCodeHelp(){
  const tr = (window.I18N && typeof window.I18N.t === 'function') ? (x => window.I18N.t(x)) : (x => x);
  return ET_CODE_HELP_LINES.map(tr).join('\n') + '\n';
}

function etEsc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function etEscAttr(s){ return etEsc(s).replace(/"/g,'&quot;'); }

// Chuẩn hoá chuỗi trước khi so khớp: NFC (bản dịch AI có thể trả chữ có dấu dạng tổ hợp rời NFD),
// đổi các dấu cách đặc biệt (NBSP, narrow NBSP, figure space) về dấu cách thường và bỏ ký tự rộng 0
// (ZWSP, word-joiner, BOM). keepSpaces=true: chỉ NFC (dùng cho phần "Thay bằng" để không phá chủ ý của người dùng).
function etNorm(s, keepSpaces){
  if(typeof s !== 'string') return s;
  try{ s = s.normalize('NFC'); }catch(e){}
  if(keepSpaces) return s;
  return s.replace(/[\u00A0\u202F\u2007]/g, ' ').replace(/[\u200B\u2060\uFEFF]/g, '');
}

// Cảnh báo nhỏ (toast) tự dựng — file này không phụ thuộc hàm toast của khối script khác.
function etWarn(msg){
  try{
    let el = document.getElementById('etWarnToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'etWarnToast';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;'
        + 'background:#b3261e;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;line-height:1.4;'
        + 'z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,.3);display:none;text-align:center';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(etWarn._t);
    etWarn._t = setTimeout(() => { el.style.display = 'none'; }, 7000);
  }catch(e){ console.warn('[ET]', msg); }
}

// etSaveFailed = true khi lần ghi gần nhất thất bại (localStorage đầy/bị chặn): quy tắc mới chỉ nằm trong RAM.
// Khi đó TUYỆT ĐỐI không nạp lại từ localStorage (etLoadRules) vì sẽ xoá mất quy tắc vừa thêm.
let etSaveFailed = false;
function etLoadRules(){
  if(etSaveFailed) return;
  try{
    const raw = localStorage.getItem(ET_RULES_KEY);
    if(raw === null) return; // chưa từng lưu / bị xoá ngoài ý muốn: giữ nguyên bản trong RAM
    const saved = JSON.parse(raw);
    if(Array.isArray(saved)){
      etRules = saved.filter(r => r && typeof r.find === 'string').map(r => ({
        id: r.id, scope: r.scope, find: r.find, replace: (typeof r.replace === 'string' ? r.replace : ''),
        regex: !!r.regex, matchCase: !!r.matchCase, wholeWord: !!r.wholeWord
      }));
    }
    etNextId = etRules.reduce((m,r)=>Math.max(m, r.id||0), 0) + 1;
  }catch(e){
    // JSON hỏng: giữ nguyên quy tắc đang có trong RAM thay vì xoá sạch.
    console.warn('[ET] Không đọc được quy tắc từ localStorage:', e);
  }
}
function etSaveRules(){
  try{
    localStorage.setItem(ET_RULES_KEY, JSON.stringify(etRules));
    etSaveFailed = false;
  }catch(e){
    etSaveFailed = true;
    console.warn('[ET] Lưu quy tắc thất bại:', e);
    etWarn('Không lưu được quy tắc Sửa văn bản (bộ nhớ trình duyệt đầy hoặc bị chặn). Quy tắc chỉ có hiệu lực tới khi tải lại trang — hãy dọn dung lượng hoặc xuất quy tắc ra file.');
  }
  etBroadcastRulesUpdated();
}
function etLoadSortPrefs(){
  try{ etSortPrefs = JSON.parse(localStorage.getItem(ET_SORT_KEY) || '{}') || {}; }
  catch(e){ etSortPrefs = {}; }
}
function etSaveSortPrefs(){
  try{ localStorage.setItem(ET_SORT_KEY, JSON.stringify(etSortPrefs)); }catch(e){}
}
// ===== GHI CHÚ CHO AI (riêng từng truyện) =====
let etAiSaveFailed = false;
function etLoadAiNotes(){
  if(etAiSaveFailed) return; // lần ghi gần nhất thất bại: ghi chú mới chỉ nằm trong RAM, đừng nạp đè
  try{
    const raw = localStorage.getItem(ET_AINOTE_KEY);
    if(raw === null) return; // chưa từng lưu: giữ nguyên bản trong RAM
    const o = JSON.parse(raw);
    if(o && typeof o === 'object' && !Array.isArray(o)) etAiNotes = o;
  }catch(e){
    // JSON hỏng: giữ nguyên ghi chú đang có trong RAM, KHÔNG đặt về {} (lần lưu kế tiếp sẽ xoá hết ghi chú mọi truyện).
    console.warn('[ET] Không đọc được ghi chú AI từ localStorage:', e);
  }
}
function etSaveAiNotes(broadcast){
  try{
    localStorage.setItem(ET_AINOTE_KEY, JSON.stringify(etAiNotes));
    etAiSaveFailed = false;
  }catch(e){
    etAiSaveFailed = true;
    console.warn('[ET] Lưu ghi chú AI thất bại:', e);
    etWarn('Không lưu được ghi chú cho AI (bộ nhớ trình duyệt đầy hoặc bị chặn). Ghi chú chỉ có hiệu lực tới khi tải lại trang — hãy dọn dung lượng.');
  }
  if(broadcast) etBroadcastRulesUpdated();
}
function etSetAiNote(key, text, broadcast){
  if(!key) return;
  const v = String(text || '').slice(0, ET_AINOTE_MAX).replace(/\s+$/, '');
  if(v.trim()) etAiNotes[key] = v; else delete etAiNotes[key];
  etSaveAiNotes(broadcast);
}
// Ghi chú của truyện đang mở (rỗng nếu chưa có / chưa mở truyện). translate.js → callAPIFull()
// gọi hàm này để đính kèm vào yêu cầu dịch cùng bản gốc.
function etGetAiNote(){
  const key = etCurrentStoryKey();
  const v = key ? etAiNotes[key] : '';
  return (typeof v === 'string') ? v.trim() : '';
}
etLoadRules();
etLoadSortPrefs();
etLoadAiNotes();

// ===== ĐỒNG BỘ GIỮA CÁC TAB =====
// Quy tắc "Sửa văn bản" lưu ở localStorage nên tự share giữa các tab cùng
// gốc, nhưng KHÔNG có sự kiện nào báo cho tab khác biết để nạp lại — khác
// với bản dịch (lưu IndexedDB + BroadcastChannel 'nt-lib-sync' ở khối
// script chính). Dùng lại đúng tên channel đó (1 tên channel có thể có
// nhiều BroadcastChannel object lắng nghe độc lập, kể cả trong cùng tab,
// và không tự nhận lại message do chính mình gửi) để tab khác tự
// etLoadRules() lại ngay khi có tab lưu quy tắc mới — không cần F5, giống
// hệt cơ chế đồng bộ bản dịch. Tạo channel riêng tại đây (không dùng biến
// libSyncChannel của khối script chính) vì file này nạp TRƯỚC khối đó nên
// biến libSyncChannel chưa tồn tại lúc top-level code này chạy.
let etSyncChannel = null;
try{
  if('BroadcastChannel' in window){
    etSyncChannel = new BroadcastChannel('nt-lib-sync');
    etSyncChannel.addEventListener('message', function(ev){
      const msg = ev.data || {};
      if(msg.type !== 'et-rules-updated') return;
      etLoadRules();
      etLoadAiNotes();
      const overlay = document.getElementById('etOverlay');
      const popupOpen = overlay && overlay.classList.contains('show');
      if(popupOpen){
        // Chỉ nạp lại danh sách nếu KHÔNG có khối nào đang mở (đang gõ dở) ở
        // tab này — tránh xoá mất input đang nhập giữa chừng. Nếu có khối
        // đang mở, dữ liệu mới vẫn đã nằm trong etRules và sẽ hiện đúng ở
        // lần mở khối/mở popup kế tiếp.
        const anySelected = etScopes.some(s => s.selected);
        if(!anySelected){
          etScopes = etBuildScopes();
          etRenderScopeList();
        }
      }
      // Áp dụng ngay cho chương đang xem (nếu có truyện đang mở) — giống
      // etCleanupAndSaveScope() ở tab vừa lưu.
      try{
        if(typeof S !== 'undefined' && S.cur >= 0 && typeof renderCh === 'function') renderCh(S.cur);
      }catch(e){}
    });
  }
}catch(e){ console.warn('[ET Sync] BroadcastChannel không khả dụng ở trình duyệt này:', e); }

function etBroadcastRulesUpdated(){
  if(!etSyncChannel) return;
  try{ etSyncChannel.postMessage({type:'et-rules-updated', ts:Date.now()}); }catch(e){}
}

// Di chuyển quy tắc "Sửa text" bản CŨ (1 ô textarea chung, mỗi dòng dạng
// "A=B") sang etRules dạng mới, scope 'all' (bản cũ không phân biệt theo
// từng truyện). Có dedupe theo scope+find+replace để loadSettings() gọi lại
// nhiều lần (VD sau khi khôi phục file backup cũ) không bị tạo trùng.
function etMigrateLegacyTextReplace(raw){
  if(!raw || typeof raw !== 'string') return;
  const lines = raw.split('\n');
  let changed = false;
  for(const line of lines){
    const eq = line.indexOf('=');
    if(eq < 0) continue;
    const rawFind = line.slice(0, eq);
    const find = rawFind.trim();
    const replace = etMirrorTrim(rawFind, line.slice(eq+1), true);
    if(!find) continue;
    const dup = etRules.some(r => r.scope==='all' && r.find===find && r.replace===replace);
    if(dup) continue;
    etRules.push({id: etNextId++, scope:'all', find, replace, regex:false, matchCase:false, wholeWord:false});
    changed = true;
  }
  if(changed) etSaveRules();
}

// Truyện đang mở trên trang — dùng thẳng S.fname thật của app.
function etCurrentStoryKey(){
  return (typeof S !== 'undefined' && S.fname) ? S.fname : '';
}
// Tên hiển thị cho khoá scope (bỏ đuôi .txt/.epub cho gọn) — dùng làm
// fallback khi không tra được tên thật từ tủ truyện (VD truyện đang mở
// chưa được lưu vào tủ, libCurrentId null).
function etDisplayName(key){
  return key === 'all' ? 'Tất cả truyện' : key.replace(/\.(txt|epub)$/i,'');
}

// Tên hiển thị cho "Truyện đang đọc": LUÔN lấy tên thật đang lưu trong tủ
// truyện (bk.name — cái người dùng đổi bằng nút "Đổi tên") thay vì tự suy
// ra từ S.fname (tên file gốc, không đổi theo khi đổi tên trong tủ). key
// (S.fname) chỉ dùng làm khoá scope ổn định của quy tắc, không dùng để
// hiển thị. libBooks/libCurrentId là biến của khối script chính; hàm này
// chỉ được gọi lúc người dùng mở popup (lúc đó khối chính đã chạy xong).
function etCurrentStoryDisplayName(key){
  try{
    if(typeof libCurrentId !== 'undefined' && libCurrentId && typeof libBooks !== 'undefined'){
      const bk = libBooks.find(b => b.id === libCurrentId);
      if(bk && bk.name) return bk.name;
    }
  }catch(e){}
  return etDisplayName(key);
}

/* ---------- Định dạng dòng "từ khoá=thay bằng=mã" có escape dấu "=" ----------
   Xuất: "=" trong từ khoá/thay bằng ghi thành "\=" ; dãy dấu "\" đứng ngay trước "=" (hoặc cuối trường)
   được nhân đôi để không nhầm với escape. Nhập: tách tại "=" KHÔNG bị escape. Dòng cũ (xuất từ bản trước,
   không escape) vẫn đọc được: nếu trường cuối là mã 512–525 thì là mã, phần còn lại sau "=" đầu tiên là "thay bằng". */
function etEncField(s){
  return String(s == null ? '' : s).replace(/(\\+)(?==|$)/g, m => m + m).replace(/=/g, '\\=');
}
function etSplitUnescaped(line){
  const fields = []; let cur = '', i = 0;
  while(i < line.length){
    const ch = line[i];
    if(ch === '\\'){
      let j = i; while(j < line.length && line[j] === '\\') j++;
      const n = j - i;
      if(j < line.length && line[j] === '='){
        cur += '\\'.repeat(Math.floor(n/2));
        if(n % 2 === 1) cur += '='; else { fields.push(cur); cur = ''; }
        i = j + 1; continue;
      }
      if(j >= line.length){ cur += '\\'.repeat(Math.floor(n/2)); i = j; continue; }
      cur += '\\'.repeat(n); i = j; continue;
    }
    if(ch === '='){ fields.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  fields.push(cur);
  return fields;
}
// Từ khoá luôn bị cắt dấu cách đầu/cuối (hay dính khi gõ/dán). Để "Thay bằng" không còn lệch
// với từ khoá, những dấu cách đầu/cuối mà từ khoá có (và đã bị cắt) cũng được cắt ở đúng phía
// tương ứng của "Thay bằng": " ông " -> " Ông " lưu thành "ông" -> "Ông" (không còn dư dấu cách).
// Từ khoá không có dấu cách thì "Thay bằng" giữ nguyên: "," -> ", " vẫn thêm dấu cách sau dấu phẩy.
// fromLine=true (dòng nhập dạng text "từ khoá = thay bằng"): dấu cách ngay trước "=" là đệm quanh dấu "=",
// nên dấu cách ngay sau "=" cũng bị coi là đệm và được cắt.
function etMirrorTrim(rawFind, replace, fromLine){
  rawFind = rawFind || ''; replace = replace || '';
  if(fromLine && /\s$/.test(rawFind)) replace = replace.replace(/^\s+/, '');
  if(/^\s/.test(rawFind)) replace = replace.replace(/^\s+/, '');
  if(/\s$/.test(rawFind)) replace = replace.replace(/\s+$/, '');
  return replace;
}
const ET_CODE_RE = /^\s*5[12]\d\s*$/;
// Trả về {find, replace, flags|null} hoặc null nếu dòng trống/ghi chú/không hợp lệ.
function etParseRuleLine(line){
  const t = line.replace(/\r$/, '');
  const tr = t.trim();
  if(!tr || tr.startsWith('#')) return null;
  const f = etSplitUnescaped(t);
  let flags = null;
  if(f.length >= 3 && ET_CODE_RE.test(f[f.length-1])){
    flags = etCodeToFlags(f.pop());
  }
  const rawFind = f[0] || '';
  const find = rawFind.trim();
  if(!find) return null;
  const replace = f.length >= 2 ? etMirrorTrim(rawFind, f.slice(1).join('='), true) : '';
  return {find, replace, flags, hasEq: f.length >= 2};
}

/* ---------- Mã tuỳ chọn (regex/wholeWord/matchCase) <-> số, dùng khi
   Xuất/Nhập quy tắc dạng text (xem etOpenDetail). ---------- */
function etOptCode(r){ return (r.regex?522:512) + (r.wholeWord?1:0) + (r.matchCase?2:0); }
function etCodeToFlags(code){
  code = parseInt(code,10);
  if(isNaN(code)) return {regex:false, wholeWord:false, matchCase:false};
  const regex = code >= 520;
  const base = regex ? 522 : 512;
  const r = code - base;
  return { regex, wholeWord: (r===1||r===3), matchCase: (r===2||r===3) };
}

/* ---------- Chuẩn hoá TỪ KHOÁ giống hệt cách văn bản được chuẩn hoá trong applyReplace()
   (NFC + dấu cách đặc biệt + dấu câu Trung/Nhật/nháy cong -> dấu thường). Trước đây chỉ văn bản
   được đổi nên từ khoá như "don’t" hay "「" không bao giờ khớp. Chế độ regex: dấu sau khi đổi
   mà là ký tự đặc biệt của regex (。->. ？->? 【->[ ...) được escape để vẫn khớp đúng ký tự đó. ---------- */
function etNormFind(s, isRegex){
  s = etNorm(s);
  if(typeof s !== 'string' || typeof etNormalizeCjkPunct !== 'function') return s;
  if(!isRegex) return etNormalizeCjkPunct(s);
  return s.replace(/……|。。|——|[，。！？：；、“”‘’「」『』【】《》]/g, function(m, off){
    const out = etNormalizeCjkPunct(m);
    let bs = 0; for(let i = off - 1; i >= 0 && s[i] === '\\'; i--) bs++;
    return (bs % 2 === 1) ? out : out.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
}

/* ---------- Ký tự "thuộc từ" cho chế độ Khớp đúng từ: chữ cái + chữ số + "_", NHƯNG chữ Hán/Kana
   không tính (tiếng Trung/Nhật không có dấu cách giữa các từ nên "林动" phải khớp được trong "林动说").
   Dùng cho kiểm tra ký tự đứng TRƯỚC (trong etReplaceWithRule) — không dùng lookbehind vì Safari <16.4. ---------- */
const ET_CJK_RANGE = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff';
const ET_WORD_CH = (function(){
  try{ return new RegExp('^(?![' + ET_CJK_RANGE + '])[\\p{L}\\p{N}_]$', 'u'); }
  catch(e){ return /^[A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF]$/; }
})();

/* ---------- Xây RegExp từ 1 rule — dùng khi thực sự áp dụng quy tắc lên
   văn bản chương (regex tuỳ biến, khớp đúng từ, phân biệt hoa/thường).
   KHÔNG dùng lookbehind (?<!...): Safari <16.4 trên iPad cũ (iPad mini 4/Air
   2) ném lỗi "Invalid regular expression" ngay khi tạo RegExp có lookbehind.
   Biên phía SAU dùng lookahead (an toàn); biên phía TRƯỚC được kiểm tra trong
   etReplaceWithRule() bằng ký tự liền trước match (không còn capture group phụ nên
   $1/\1 trong regex của người dùng đúng số thứ tự nhóm của chính họ). */
function etBuildRegex(rule){
  const findN = etNormFind(rule.find, !!rule.regex);
  const base = rule.regex ? findN : findN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ci = rule.matchCase ? '' : 'i';
  // Thử chế độ Unicode (cờ u) trước: hỗ trợ \p{L}, \u{...}. Nhưng cờ u ném lỗi với các escape "thừa"
  // người dùng hay gõ như \-, \_, \!, \:, \#, \', [\w-.] -> thử lại KHÔNG cờ u (kiểu JS cũ, dễ tính hơn).
  try{
    const pattern = rule.wholeWord
      ? '(?:' + base + ')(?!(?![' + ET_CJK_RANGE + '])[\\p{L}\\p{N}_])'
      : base;
    return new RegExp(pattern, 'gu' + ci);
  }catch(e1){
    if(!rule.regex) throw e1; // chuỗi thường đã được escape: lỗi ở đây không phải do người dùng
    // Không có \p{L} khi bỏ cờ u -> dùng lớp ký tự chữ/số tương đương (gồm chữ Việt có dấu, không gồm chữ Hán).
    const W = 'A-Za-z0-9_\\u00C0-\\u024F\\u1E00-\\u1EFF';
    const pattern = rule.wholeWord ? '(?:' + base + ')(?![' + W + '])' : base;
    return new RegExp(pattern, 'g' + ci);
  }
}

// Kiểm tra 1 quy tắc có biên dịch được không. Trả về null nếu ổn, hoặc thông báo lỗi.
function etRuleError(rule){
  try{
    if(!rule || !(rule.regex || rule.matchCase || rule.wholeWord)) return null;
    if(!etNorm(rule.find || '').trim()) return null;
    etBuildRegex(rule);
    return null;
  }catch(e){ return String(e && e.message || e); }
}

// Mở rộng "Thay bằng" của quy tắc REGEX: $1..$99 = nhóm bắt, $<tên> = nhóm có tên, $& = cả đoạn khớp,
// $$ = dấu $. $n không có nhóm tương ứng thì giữ nguyên chữ "$n". Chế độ thường KHÔNG qua hàm này
// (vẫn chèn nguyên văn). `a` là mảng kết quả exec() hoặc `arguments` của callback replace().
function etExpandReplacement(rep, a){
  let match, caps, groups = null;
  if(Array.isArray(a)){ match = a[0]; caps = a.slice(1); groups = a.groups || null; }
  else{
    const args = Array.prototype.slice.call(a);
    const lastArg = args[args.length - 1];
    if(lastArg && typeof lastArg === 'object') groups = args.pop();
    args.pop(); args.pop(); // offset, string
    match = args[0]; caps = args.slice(1);
  }
  const grp = i => (caps[i-1] === undefined ? '' : caps[i-1]);
  return rep.replace(/\$(\$|&|\d{1,2}|<([^>]*)>)/g, function(tok, k, name){
    if(k === '$') return '$';
    if(k === '&') return match;
    if(k.charAt(0) === '<'){ return groups ? (groups[name] === undefined ? '' : groups[name]) : tok; }
    if(k.length === 2){ const two = parseInt(k, 10); if(two >= 1 && two <= caps.length) return grp(two); }
    const one = parseInt(k.charAt(0), 10);
    if(one >= 1 && one <= caps.length) return grp(one) + k.slice(1);
    return tok;
  });
}

// Áp 1 rule (đã có regex/matchCase/wholeWord) lên text — dùng bởi applyReplace()
// trong khối script chính cho các quy tắc có bật ít nhất 1 trong 3 tuỳ chọn.
// Chế độ thường (không regex): "Thay bằng" chèn NGUYÊN VĂN. Chế độ regex: hiểu $1, $&, $<tên>, $$.
function etReplaceWithRule(text, rule){
  const rx = etBuildRegex(rule);
  const rep = rule.replace;
  const expand = !!rule.regex;
  if(!rule.wholeWord){
    return text.replace(rx, expand ? function(){ return etExpandReplacement(rep, arguments); } : () => rep);
  }
  // Khớp đúng từ: duyệt bằng exec() để loại các lượt khớp dính liền ký tự "thuộc từ" đứng trước;
  // lượt bị loại thì thử lại từ vị trí kế tiếp (không nuốt mất các lượt khớp chồng lên nó).
  let out = '', last = 0, m;
  rx.lastIndex = 0;
  while((m = rx.exec(text)) !== null){
    const start = m.index, end = start + m[0].length;
    if(start > 0 && ET_WORD_CH.test(text.charAt(start - 1))){ rx.lastIndex = start + 1; continue; }
    out += text.slice(last, start) + (expand ? etExpandReplacement(rep, m) : rep);
    last = end;
    rx.lastIndex = end > start ? end : end + 1;
  }
  return out + text.slice(last);
}

// Danh sách quy tắc áp dụng cho chương đang xem: "Tất cả truyện" + quy tắc
// riêng của truyện đang mở. Được applyReplace() trong khối script chính gọi
// (mỗi rule nay có thêm .regex/.matchCase/.wholeWord — script chính nên
// dùng etBuildRegex(rule) thay cho so khớp chuỗi thường để tôn trọng đủ 3
// tuỳ chọn mới).
function etGetActiveRules(){
  const key = etCurrentStoryKey();
  return etRules.filter(r => r.scope === 'all' || (key && r.scope === key));
}

// Bản đầy đủ: gộp + sắp theo "Ưu tiên cụm dài trước" (mỗi phạm vi tôn trọng
// công tắc riêng của nó), theo đúng thứ tự áp dụng thực tế. Dùng hàm này
// thay etGetActiveRules() nếu script chính muốn áp dụng đúng thứ tự.
function etGetOrderedActiveRules(){
  const key = etCurrentStoryKey();
  const groups = [
    {scopeKey:'all', rules: etRules.filter(r => r.scope === 'all')},
  ];
  if(key) groups.push({scopeKey:key, rules: etRules.filter(r => r.scope === key)});

  const ordered = [];
  groups.forEach(g => {
    const list = g.rules.slice();
    if(etSortPrefs[g.scopeKey]){
      list.sort((a,b) => {
        const dl = b.find.length - a.find.length;
        if(dl !== 0) return dl;
        return a.find.localeCompare(b.find, 'vi');
      });
    }
    ordered.push(...list);
  });
  return ordered;
}

/* ---------- Data <-> draft rows ---------- */
const ET_MIN_ROWS = 3;
function etEmptyRow(){ return {id:null, find:'', replace:'', regex:false, matchCase:false, wholeWord:false}; }
// Tập id quy tắc của 1 phạm vi tại thời điểm dựng bảng — dùng để khi lưu chỉ thay đúng những quy tắc
// mà bản nháp này đã "nhìn thấy", giữ lại quy tắc do tab khác/khôi phục backup thêm vào giữa chừng.
function etIdsForScope(key){
  return new Set(etRules.filter(r => r.scope === key).map(r => r.id));
}
function etRowsForScope(key){
  const rows = etRules.filter(r => r.scope === key).map(r => ({
    id:r.id, find:r.find, replace:r.replace, regex:!!r.regex, matchCase:!!r.matchCase, wholeWord:!!r.wholeWord
  }));
  while(rows.length < ET_MIN_ROWS) rows.push(etEmptyRow());
  const last = rows[rows.length-1];
  if(last.find.trim() !== '' || (last.replace||'').trim() !== '') rows.push(etEmptyRow());
  return rows;
}

function etBuildScopes(){
  const currentKey = etCurrentStoryKey();
  const scopes = [];
  scopes.push({
    id:'all', key:'all', name:'Tất cả truyện', meta:'', icon: ET_ICON_ALL,
    disabled:false, selected:false,
    sortByLength: !!etSortPrefs['all'],
    rows: etRowsForScope('all'), baseIds: etIdsForScope('all')
  });
  if(currentKey){
    scopes.push({
      id:'current', key:currentKey, name:'Truyện đang đọc', meta: etCurrentStoryDisplayName(currentKey), icon: ET_ICON_READING,
      disabled:false, selected:false,
      sortByLength: !!etSortPrefs[currentKey],
      rows: etRowsForScope(currentKey), baseIds: etIdsForScope(currentKey)
    });
  } else {
    scopes.push({
      id:'current', key:'', name:'Truyện đang đọc', meta:'Chưa mở truyện nào', icon: ET_ICON_READING,
      disabled:true, selected:false, sortByLength:false, rows:[]
    });
  }
  // Khối "Ghi chú cho AI": văn bản tự do (không phải bảng quy tắc), lưu theo truyện đang mở.
  scopes.push({
    id:'ainote', kind:'note', key:currentKey, name:'Ghi chú cho AI',
    meta: currentKey ? 'Gửi kèm khi dịch truyện đang đọc' : 'Chưa mở truyện nào', icon: ET_ICON_SPARK,
    disabled: !currentKey, selected:false, sortByLength:false, rows:[],
    note: currentKey ? (etAiNotes[currentKey] || '') : ''
  });
  return scopes;
}

/* ---------- Open / close popup ---------- */
function openEditText(){
  etScopes = etBuildScopes();
  // Mặc định mở sẵn khối "Truyện đang đọc" (nếu có truyện đang mở); chưa mở truyện nào thì khối đó bị khoá nên không chọn.
  const curScope = etScopes.find(s => s.id === 'current' && !s.disabled);
  // Khối "Truyện đang đọc" mở sẵn NGAY khi popup hiện (vẽ luôn ở trạng thái .selected, không chạy hiệu ứng expand).
  // Hiệu ứng expand chỉ dùng khi người dùng tự bấm mở/đóng khối (xem etSelectScope).
  if(curScope) curScope.selected = true;
  document.getElementById('etOverlay').classList.add('show');
  etShowList();
}
function closeEditText(){
  etHideTip();
  etFlushDetail();
  // Đóng khối đang mở (nếu có) trước — tự dọn dòng trống + lưu ngay.
  etScopes.forEach(s => { if(s.selected) etCleanupAndSaveScope(s); });
  document.getElementById('etOverlay').classList.remove('show');
}

/* ---------- Chuyển đổi giữa danh sách phạm vi và panel "Chi tiết" ---------- */
function etShowList(){
  const listEl = document.getElementById('etScopeList');
  const ioEl = document.getElementById('etIOPanel');
  listEl.style.display = '';
  if(ioEl) ioEl.style.display = 'none';
  const etBoxEl = document.getElementById('etBox'); if(etBoxEl) delete etBoxEl.dataset.view;
  etRenderScopeList();
}
function etShowIO(){
  const listEl = document.getElementById('etScopeList');
  const ioEl = document.getElementById('etIOPanel');
  listEl.style.display = 'none';
  if(ioEl) ioEl.style.display = '';
  const etBoxEl = document.getElementById('etBox'); if(etBoxEl) etBoxEl.dataset.view = 'detail';
}

/* ---------- Save / cleanup ---------- */
function etCleanupAndSaveScope(scope){
  if(scope.kind === 'note'){ etSetAiNote(scope.key, scope.note, true); return true; }
  const cleaned = scope.rows.filter(r => r.find.trim() !== '' || (r.replace||'').trim() !== '');
  // Chỉ gỡ những quy tắc bản nháp này đã thấy lúc mở (baseIds); quy tắc có id mới do nơi khác thêm vào
  // trong lúc popup đang mở được GIỮ LẠI thay vì bị ghi đè bằng bản chụp cũ.
  const base = scope.baseIds;
  etRules = etRules.filter(r => r.scope !== scope.key || (base && !base.has(r.id)));
  cleaned.forEach(r => {
    etRules.push({
      id: r.id || etNextId++, scope: scope.key, find: r.find.trim(), replace: etMirrorTrim(r.find, r.replace),
      regex: !!r.regex, matchCase: !!r.matchCase, wholeWord: !!r.wholeWord
    });
  });
  etSaveRules();
  const bad = cleaned.filter(r => etRuleError(r)).length;
  if(bad) etWarn(bad + ' quy tắc sai cú pháp regex nên sẽ bị bỏ qua (ô từ khoá viền đỏ). Hãy sửa lại.');
  scope.rows = etRowsForScope(scope.key);
  scope.baseIds = etIdsForScope(scope.key);
  // Áp dụng ngay cho chương đang xem (nếu có truyện đang mở), khỏi phải đóng
  // rồi mở lại chương mới thấy quy tắc mới có hiệu lực.
  try{
    if(typeof S !== 'undefined' && S.cur >= 0 && typeof renderCh === 'function') renderCh(S.cur);
  }catch(e){}
}

/* ---------- Accordion select ---------- */
function etSelectScope(id){
  const target = etScopes.find(s => s.id === id);
  if(!target || target.disabled) return;
  const wasSelected = target.selected;

  // Đóng khối khác đang mở -> dọn dòng trống + lưu.
  etScopes.forEach(s => {
    if(s.id !== id && s.selected){
      etCleanupAndSaveScope(s);
      s.selected = false;
    }
  });

  if(wasSelected){
    etCleanupAndSaveScope(target);
    target.selected = false;
  } else {
    target.selected = true;
  }
  // KHÔNG vẽ lại cả danh sách (innerHTML mới -> CSS transition không chạy, khối bật/tắt tức thì).
  // Chỉ đổi class .selected trên khối có sẵn trong DOM để expand/collapse + xoay chevron mượt.
  const wrap = document.getElementById('etScopeList');
  if(wrap && wrap.querySelectorAll('.et-scope-block').length === etScopes.length){
    etSyncSelectedClasses();
    // Khối vừa đóng đã được dọn dòng trống (scope.rows đổi) -> vẽ lại bảng của nó SAU khi thu gọn xong
    // (tránh giật nội dung lúc đang thu), để chỉ số dòng trong DOM luôn khớp scope.rows.
    etScopes.forEach(s => {
      if(!s.selected && s.kind !== 'note' && !s.disabled){
        setTimeout(() => { if(!s.selected) etRenderRulesTable(s); }, 300);
      }
    });
  } else {
    etRenderScopeList();
  }
}

// Đồng bộ class .selected của các khối trong DOM theo etScopes (không vẽ lại -> giữ transition).
function etSyncSelectedClasses(){
  document.querySelectorAll('#etScopeList .et-scope-block').forEach(b => {
    const s = etScopes.find(x => x.id === b.dataset.scope);
    if(s) b.classList.toggle('selected', !!s.selected);
  });
}

/* ---------- Row editing ---------- */
function etUpdateCell(scopeId, rowIndex, field, value){
  const scope = etScopes.find(s => s.id === scopeId);
  if(!scope) return;
  scope.rows[rowIndex][field] = value;
  etMarkRowInvalid(scope, rowIndex);
}

// Viền đỏ + tooltip ở ô "Từ khoá" khi quy tắc (regex) sai cú pháp -> không còn "im lặng không ăn".
function etMarkRowInvalid(scope, rowIndex){
  try{
    const block = document.querySelector('.et-scope-block[data-scope="'+scope.id+'"]');
    if(!block) return;
    const inp = block.querySelector('.et-row-input[data-row="'+rowIndex+'"][data-field="find"]');
    if(!inp) return;
    const err = etRuleError(scope.rows[rowIndex]);
    inp.classList.toggle('et-invalid', !!err);
    if(err) inp.title = 'Quy tắc sai cú pháp regex, sẽ bị bỏ qua: ' + err; else inp.removeAttribute('title');
  }catch(e){}
}

// Được gọi khi người dùng focus vào 1 ô input. Nếu đó là dòng cuối cùng —
// tức dòng trống "dự phòng" để nhập — thì nối thêm 1 dòng trống mới ngay
// sau nó, để luôn có sẵn 1 dòng trống chờ nhập.
function etGrowIfLastRow(scopeId, rowIndex, field){
  const scope = etScopes.find(s => s.id === scopeId);
  if(!scope) return;
  if(rowIndex === scope.rows.length - 1){
    scope.rows.push(etEmptyRow());
    etRenderRulesTable(scope, {rowIndex, field: field || 'find'});
  }
}

// Bấm 1 trong 3 nút tuỳ chọn Aa / [W] / .* trên 1 dòng quy tắc.
function etToggleOpt(scopeId, rowIndex, field){
  const scope = etScopes.find(s => s.id === scopeId);
  if(!scope) return;
  scope.rows[rowIndex][field] = !scope.rows[rowIndex][field];
  etRenderRulesTable(scope);
}

function etRemoveRow(scopeId, rowIndex){
  const scope = etScopes.find(s => s.id === scopeId);
  if(!scope) return;
  if(scope.rows.length <= 1) return;
  scope.rows.splice(rowIndex, 1);
  etRenderRulesTable(scope);
}

// Công tắc "Ưu tiên cụm dài trước" — riêng theo từng phạm vi, lưu lại để
// nhớ giữa các lần mở popup.
function etToggleSort(scopeId){
  const scope = etScopes.find(s => s.id === scopeId);
  if(!scope) return;
  scope.sortByLength = !scope.sortByLength;
  etSortPrefs[scope.key] = scope.sortByLength;
  etSaveSortPrefs();
  etRenderScopeList();
}

// Dòng "trống" = cả 2 ô Từ khoá/Thay bằng đều rỗng.
function etIsRowEmpty(row){
  return row.find.trim() === '' && (row.replace||'').trim() === '';
}

// Tìm dòng trống GẦN NHẤT tính từ fromIndex (dòng người dùng vừa dán vào),
// quét ra 2 phía, ưu tiên phía sau khi khoảng cách bằng nhau — để khi người
// dùng lỡ dán vào 1 dòng ĐÃ có dữ liệu, dữ liệu cũ không bị ghi đè: nội dung
// dán sẽ tự nhảy tới dòng trống gần đó (thường là dòng "dự phòng" ở cuối)
// thay vì đè lên dòng đang chọn. Nếu không còn dòng trống nào, trả về
// scope.rows.length để etApplyPastedLines tự thêm dòng mới ở cuối.
function etNearestEmptyRowIndex(scope, fromIndex){
  if(scope.rows[fromIndex] && etIsRowEmpty(scope.rows[fromIndex])) return fromIndex;
  for(let d = 1; d < scope.rows.length; d++){
    const after = fromIndex + d;
    if(after < scope.rows.length && etIsRowEmpty(scope.rows[after])) return after;
    const before = fromIndex - d;
    if(before >= 0 && etIsRowEmpty(scope.rows[before])) return before;
  }
  return scope.rows.length;
}

// Dán nhiều dòng dạng "A=B" (mỗi dòng 1 cặp Từ khoá=Thay bằng) — tự tách và
// đổ vào lần lượt từng dòng input bắt đầu từ startRowIndex (do caller quyết
// định — xem etNearestEmptyRowIndex(), thường là dòng trống gần nhất chứ
// KHÔNG phải dòng đang dán, để tránh đè dữ liệu cũ), tự thêm dòng mới nếu
// không đủ chỗ. Dòng nào không có dấu "=" thì coi cả dòng đó là "Từ khoá",
// để trống "Thay bằng" (thay vì bỏ qua dòng, vì người dùng có thể chỉ định
// thay bằng chuỗi rỗng — tức xoá từ khoá đó khi áp dụng).
// find luôn được trim (đồng bộ với etCleanupAndSaveScope), replace giữ
// nguyên (không trim) để không mất khoảng trắng cố ý ở đầu/cuối.
function etApplyPastedLines(scope, startRowIndex, rawText){
  const lines = rawText.split(/\r\n|\r|\n/).filter(l => l.trim() !== '');
  if(!lines.length) return false;
  lines.forEach((line, i) => {
    const idx = startRowIndex + i;
    while(scope.rows.length <= idx) scope.rows.push(etEmptyRow());
    const pr = etParseRuleLine(line);
    if(pr && pr.hasEq){
      scope.rows[idx].find = pr.find;
      scope.rows[idx].replace = pr.replace;
      if(pr.flags){ scope.rows[idx].regex = pr.flags.regex; scope.rows[idx].wholeWord = pr.flags.wholeWord; scope.rows[idx].matchCase = pr.flags.matchCase; }
    } else {
      scope.rows[idx].find = line.trim();
      scope.rows[idx].replace = '';
    }
  });
  // Luôn chừa sẵn 1 dòng trống ở cuối để nhập tiếp, giống etRowsForScope().
  const last = scope.rows[scope.rows.length-1];
  if(!etIsRowEmpty(last)) scope.rows.push(etEmptyRow());
  return true;
}

const ET_AINOTE_PLACEHOLDER =
  '- Tên tổ chức "Dark Shadows" để tiếng Anh\n'
  + '- Dịch tên "Sinh mệnh chi tuyền" thay vì "Suối sinh mệnh"\n'
  + '- Dịch tên "Thần Sinh Mệnh" thay vì "Thần sự sống"';

/* ---------- Tooltip cho nút Aa / [W] / .* ----------
   Cùng kiểu .tipbox của khung Cài đặt nhưng chỉ hiện khi CLICK (không hiện khi hover): bấm nút -> bật/tắt tuỳ chọn
   + hiện giải thích ngay phía trên nút. Tự ẩn khi bấm chỗ khác, cuộn, đóng popup hoặc sau ~3.5s. */
const ET_OPT_TIPS = {
  matchCase: 'Khớp khi đúng chữ hoa/thường',
  wholeWord: 'Khớp khi từ khoá đứng riêng',
  regex:     'Regex — dùng $1, $2 để chèn nhóm bắt (viết $$ cho dấu $)'
};
let etTipEl = null, etTipTimer = null;
function etHideTip(){
  clearTimeout(etTipTimer);
  if(etTipEl) etTipEl.classList.remove('show');
}
function etShowOptTip(btn){
  const ov = document.getElementById('etOverlay');
  if(!ov || !btn) return;
  if(!etTipEl){
    etTipEl = document.createElement('div');
    etTipEl.className = 'et-tip';
    etTipEl.setAttribute('role', 'tooltip');
    ov.appendChild(etTipEl);
  }
  const tip = etTipEl;
  tip.innerHTML = ET_OPT_TIPS[btn.dataset.opt] || '';
  tip.style.left = '0px'; tip.style.top = '0px';
  tip.classList.add('show');
  const er = btn.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let left = er.left + er.width/2 - w/2;
  left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
  let top = er.top - h - 8;                 // ưu tiên hiện phía trên nút
  if(top < 8) top = er.bottom + 8;          // không đủ chỗ mới hiện phía dưới
  tip.style.left = left + 'px';
  tip.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
  clearTimeout(etTipTimer);
  etTipTimer = setTimeout(etHideTip, 3500);
}
document.addEventListener('click', e => { if(!e.target.closest || !e.target.closest('.et-opt-btn')) etHideTip(); });
document.addEventListener('scroll', etHideTip, true);

/* ---------- Render bảng quy tắc trong 1 khối phạm vi ---------- */
function etRenderRulesTable(scope, focusTarget){
  etHideTip();
  const block = document.querySelector('.et-scope-block[data-scope="'+scope.id+'"]');
  if(!block) return;
  const table = block.querySelector('.et-rules-table');

  const rowsHtml = '<div class="et-rows">' + scope.rows.map((row, i) => (
      '<div class="et-rule-row" data-row="'+i+'">'
        + '<div class="et-rule-inputs">'
          + '<input class="et-row-input" type="text" placeholder="Từ khoá..." value="'+etEscAttr(row.find)+'" data-field="find" data-row="'+i+'">'
          + ET_ICON_ARROW
          + '<input class="et-row-input" type="text" placeholder="Thay bằng..." value="'+etEscAttr(row.replace)+'" data-field="replace" data-row="'+i+'">'
        + '</div>'
        + '<div class="et-rule-actions">'
          + '<div class="et-opt-group">'
            + '<button type="button" class="et-opt-btn'+(row.matchCase?' active':'')+'" data-opt="matchCase" data-row="'+i+'" aria-label="Phân biệt hoa/thường">Aa</button>'
            + '<button type="button" class="et-opt-btn'+(row.wholeWord?' active':'')+'" data-opt="wholeWord" data-row="'+i+'" aria-label="Khớp đúng từ (Whole word)">[W]</button>'
            + '<button type="button" class="et-opt-btn'+(row.regex?' active':'')+'" data-opt="regex" data-row="'+i+'" aria-label="Regex — biểu thức chính quy">.*</button>'
          + '</div>'
          + '<button class="et-row-del" type="button" data-row="'+i+'" title="Xoá dòng">'+ET_ICON_DEL+'</button>'
        + '</div>'
      + '</div>'
    )).join('') + '</div>';

  const sortRowHtml =
    '<div class="et-sort-row">'
      + '<label class="et-switch">'
        + '<input type="checkbox" '+(scope.sortByLength?'checked':'')+' data-sort-toggle="'+scope.id+'">'
        + '<span class="et-switch-track"></span>'
      + '</label>'
      + '<div class="et-sort-text">'
        + '<div class="et-sort-title">Ưu tiên cụm dài trước</div>'
      + '</div>'
      + '<div class="et-header-io">'
        + '<button type="button" class="et-detail-btn" data-io-detail="'+scope.id+'" title="Xem chi tiết quy tắc">'+ET_ICON_DETAIL+'</button>'
      + '</div>'
    + '</div>';

  table.innerHTML = rowsHtml + sortRowHtml;

  table.querySelectorAll('.et-row-input').forEach(inp => {
    const rowIndex = Number(inp.dataset.row);
    const field = inp.dataset.field;
    inp.addEventListener('input', () => etUpdateCell(scope.id, rowIndex, field, inp.value));
    inp.addEventListener('focus', () => etGrowIfLastRow(scope.id, rowIndex, field));
    // Dán dạng "A=B" (1 dòng hoặc nhiều dòng, mỗi dòng 1 cặp) — chỉ can thiệp
    // khi nội dung dán CÓ dấu "=" (ít nhất 1 dòng); dán văn bản thường (không
    // "=") thì để trình duyệt tự dán như bình thường vào đúng ô đang gõ.
    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if(!text || text.indexOf('=') < 0) return;
      e.preventDefault();
      const startRow = etNearestEmptyRowIndex(scope, rowIndex);
      const applied = etApplyPastedLines(scope, startRow, text);
      if(applied) etRenderRulesTable(scope);
    });
  });
  table.querySelectorAll('.et-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const rowIndex = Number(btn.dataset.row), opt = btn.dataset.opt;
      etToggleOpt(scope.id, rowIndex, opt); // vẽ lại bảng -> nút cũ bị thay, phải tìm nút mới để gắn tooltip
      const nb = document.querySelector('.et-scope-block[data-scope="'+scope.id+'"] .et-opt-btn[data-row="'+rowIndex+'"][data-opt="'+opt+'"]');
      if(nb) etShowOptTip(nb);
    });
  });
  table.querySelectorAll('.et-row-del').forEach(btn => {
    btn.addEventListener('click', () => etRemoveRow(scope.id, Number(btn.dataset.row)));
  });
  const sortToggle = table.querySelector('[data-sort-toggle]');
  if(sortToggle) sortToggle.addEventListener('change', () => etToggleSort(scope.id));
  const detailBtn = table.querySelector('[data-io-detail]');
  if(detailBtn) detailBtn.addEventListener('click', () => etOpenDetail(scope.id));

  scope.rows.forEach((_, i) => etMarkRowInvalid(scope, i));

  if(focusTarget && focusTarget.rowIndex !== undefined){
    const el = table.querySelector('.et-row-input[data-row="'+focusTarget.rowIndex+'"][data-field="'+(focusTarget.field || 'find')+'"]');
    if(el){ el.focus(); try{ const n = el.value.length; el.setSelectionRange(n, n); }catch(e){} }
  }
}

function etRenderScopeList(){
  const wrap = document.getElementById('etScopeList');
  wrap.innerHTML = etScopes.map(scope => {
    const metaCls = 'et-scope-meta' + (scope.id === 'current' && !scope.disabled ? ' accent' : '');
    return '<div class="et-scope-block'+(scope.selected?' selected':'')+(scope.disabled?' disabled':'')+'" data-scope="'+scope.id+'">'
      + '<button class="et-scope-header" type="button" data-toggle="'+scope.id+'">'
        + '<div class="et-scope-glyph">'+scope.icon+'</div>'
        + '<div class="et-scope-text">'
          + '<div class="et-scope-name">'+etEsc(scope.name)+'</div>'
          + (scope.meta ? '<div class="'+metaCls+'">'+etEsc(scope.meta)+'</div>' : '')
        + '</div>'
        + (scope.disabled ? '' : ET_ICON_CHEVRON)
      + '</button>'
      + '<div class="et-scope-rules"><div class="et-scope-rules-inner">'
        + (scope.kind === 'note'
            ? '<div class="et-rules-table et-note-body">'
                + '<textarea class="et-ainote" data-ainote rows="5" maxlength="'+ET_AINOTE_MAX+'" spellcheck="false" placeholder="'
                + etEscAttr(ET_AINOTE_PLACEHOLDER).replace(/\n/g,'&#10;') + '">'+etEsc(scope.note || '')+'</textarea>'
              + '</div>'
            : '<div class="et-rules-table"></div>')
      + '</div></div>'
    + '</div>';
  }).join('');

  wrap.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => etSelectScope(btn.dataset.toggle));
  });

  etScopes.forEach(scope => { if(!scope.disabled && scope.kind !== 'note') etRenderRulesTable(scope); });

  // Ô ghi chú cho AI: gõ tới đâu lưu tới đó (localStorage); thu gọn/đóng popup mới đồng bộ sang tab khác.
  wrap.querySelectorAll('[data-ainote]').forEach(ta => {
    const sc = etScopes.find(s => s.id === 'ainote');
    ta.addEventListener('input', () => { if(sc){ sc.note = ta.value; etSetAiNote(sc.key, ta.value, false); } });
  });
}

/* =====================================================================
   XUẤT / NHẬP quy tắc — riêng cho từng phạm vi (từng truyện)
   Định dạng dòng: <từ khoá>=<thay bằng>=<mã>
   ===================================================================== */
function etExportText(scope){
  const rows = scope.rows.filter(r => !etIsRowEmpty(r));
  return rows.map(r => etEncField(r.find) + '=' + etEncField(r.replace) + '=' + etOptCode(r)).join('\n');
}

/* ---------- Panel "Chi tiết" — gộp chung Xuất + Nhập vào 1 ô nhập liệu ----------
   Mở ra sẵn có nội dung quy tắc hiện tại (dạng text), người dùng có thể:
   - Sao chép / Tải xuống nội dung đang có trong ô.
   - Dán nội dung khác vào ô (nếu ô đã có sẵn nội dung thì nối tiếp xuống
     dưới, không đè lên; ô đang trống thì dán trực tiếp).
   - Sửa trực tiếp trong ô rồi bấm Lưu để ghi đè danh sách quy tắc của phạm vi này. */
function etOpenDetail(scopeId){
  const scope = etScopes.find(s => s.id === scopeId);
  if(!scope) return;
  const panel = document.getElementById('etIOPanel');
  if(!panel) return;
  const rulesText = etExportText(scope);
  const text = etCodeHelp() + '\n' + rulesText;
  panel.innerHTML =
    '<button type="button" class="et-io-back" data-io-back="1">'+ET_ICON_BACK+' Quay lại danh sách</button>'
    + '<div class="et-io-title">Chi tiết quy tắc — '+etEsc(scope.name)+'</div>'
    + '<textarea class="et-io-textarea" id="etDetailArea" placeholder="Mỗi dòng 1 quy tắc — dạng: từ khoá=thay bằng=mã">'+etEsc(text)+'</textarea>'
    + '<div class="et-io-actions">'
      + '<button type="button" class="et-io-btn" data-io-copy="1">'+ET_ICON_COPY+' Sao chép</button>'
      + '<button type="button" class="et-io-btn" data-io-paste="1">'+ET_ICON_PASTE+' Dán</button>'
      + '<button type="button" class="et-io-btn" data-io-download="1">'+ET_ICON_DOWNLOAD+' Tải xuống</button>'
      + '<button type="button" class="et-io-btn primary" data-io-save="1">'+ET_ICON_CHECK+' Lưu</button>'
    + '</div>'
    + '<div class="et-io-msg-slot"></div>';

  etDetailScopeId = scopeId;
  etDetailInitial = text;
  panel.querySelector('[data-io-back]').addEventListener('click', () => { etFlushDetail(); etShowList(); });
  panel.querySelector('[data-io-copy]').addEventListener('click', etCopyDetail);
  panel.querySelector('[data-io-paste]').addEventListener('click', etPasteDetail);
  panel.querySelector('[data-io-download]').addEventListener('click', () => etDownloadExport(document.getElementById('etDetailArea').value, scope));
  panel.querySelector('[data-io-save]').addEventListener('click', () => etSaveDetail(scopeId));
  etShowIO();
}

// Panel "Chi tiết" tự lưu: nếu người dùng đã sửa nội dung ô nhập mà thoát (Quay lại / đóng popup /
// đóng khối) không bấm "Lưu" thì vẫn ghi lại, thay vì mất sạch.
let etDetailScopeId = null, etDetailInitial = null;
function etFlushDetail(){
  const ta = document.getElementById('etDetailArea');
  const panel = document.getElementById('etIOPanel');
  const scopeId = etDetailScopeId;
  etDetailScopeId = null;
  if(!ta || !panel || !scopeId || panel.style.display === 'none') return false;
  if(ta.value === etDetailInitial) return false;
  etSaveDetail(scopeId, true);
  return true;
}
function etCopyDetail(){
  const ta = document.getElementById('etDetailArea');
  const msgSlot = document.querySelector('.et-io-msg-slot');
  const show = (ok, msg) => { msgSlot.innerHTML = '<div class="et-io-msg '+(ok?'ok':'err')+'">'+msg+'</div>'; };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(ta.value).then(
      () => show(true, 'Đã sao chép vào bộ nhớ tạm.'),
      () => show(false, 'Không sao chép được — hãy bôi đen và Ctrl+C thủ công.')
    );
  } else {
    ta.select();
    try{ document.execCommand('copy'); show(true, 'Đã sao chép vào bộ nhớ tạm.'); }
    catch(e){ show(false, 'Không sao chép được — hãy bôi đen và Ctrl+C thủ công.'); }
  }
}
// Bỏ các KHỐI bị TRÙNG LẶP, chỉ giữ lại lần xuất hiện ĐẦU TIÊN — dùng khi
// nối nội dung dán vào ô đã có sẵn dữ liệu, để không bị lặp lại cả khối
// ghi chú "#..." hay từng dòng quy tắc (từ khoá=thay bằng=mã) khi dán
// trùng nội dung cũ. Các dòng "#" liên tiếp được gộp thành 1 khối rồi mới
// so trùng — KHÔNG so từng dòng lẻ — để không xoá nhầm dòng phân cách
// "# ----" lặp lại NGAY TRONG một khối ghi chú hợp lệ (đầu và cuối khối).
// Dòng trống không bị coi là trùng (giữ nguyên để tách đoạn cho dễ đọc).
function etDedupeLines(text){
  const lines = text.split(/\r\n|\r|\n/);
  const blocks = [];
  let i = 0;
  while(i < lines.length){
    const trimmed = lines[i].trim();
    if(!trimmed){
      blocks.push([lines[i]]);
      i++;
      continue;
    }
    if(trimmed.startsWith('#')){
      const block = [lines[i]];
      i++;
      while(i < lines.length && lines[i].trim().startsWith('#')){
        block.push(lines[i]);
        i++;
      }
      blocks.push(block);
      continue;
    }
    blocks.push([lines[i]]);
    i++;
  }

  const seen = new Set();
  const out = [];
  blocks.forEach(block => {
    const isBlank = block.length === 1 && !block[0].trim();
    if(isBlank){ out.push(...block); return; }
    const key = block.map(l => l.trim()).join('\n');
    if(seen.has(key)) return;
    seen.add(key);
    out.push(...block);
  });
  return out.join('\n');
}
function etPasteDetail(){
  const ta = document.getElementById('etDetailArea');
  const msgSlot = document.querySelector('.et-io-msg-slot');
  if(navigator.clipboard && navigator.clipboard.readText){
    navigator.clipboard.readText().then(
      text => {
        // Nếu ô đã có nội dung sẵn thì nối thêm xuống dòng dưới (không đè lên);
        // chỉ gán trực tiếp khi ô đang trống. Sau khi nối, dọn trùng lặp —
        // dòng quy tắc hay dòng ghi chú nào đã có rồi thì chỉ giữ 1 bản.
        const old = ta.value;
        const merged = old.trim() ? old.replace(/\n+$/, '') + '\n' + text : text;
        ta.value = etDedupeLines(merged);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.scrollTop = ta.scrollHeight;
      },
      () => { msgSlot.innerHTML = '<div class="et-io-msg err">Không đọc được bộ nhớ tạm — hãy dán thủ công bằng Ctrl+V.</div>'; }
    );
  } else {
    msgSlot.innerHTML = '<div class="et-io-msg err">Trình duyệt không hỗ trợ dán tự động — hãy dán thủ công bằng Ctrl+V.</div>';
  }
}
function etSaveDetail(scopeId, silent){
  const scope = etScopes.find(s => s.id === scopeId);
  if(!scope) return;
  const raw = document.getElementById('etDetailArea').value;
  const msgSlot = document.querySelector('.et-io-msg-slot');
  const lines = raw.split(/\r\n|\r|\n/);
  const newRows = [];

  lines.forEach(line => {
    const pr = etParseRuleLine(line);
    if(!pr || !pr.hasEq) return;
    const flags = pr.flags || {regex:false, wholeWord:false, matchCase:false};
    newRows.push({id:null, find: pr.find, replace: pr.replace, ...flags});
  });

  newRows.push(etEmptyRow());
  scope.rows = newRows;
  etCleanupAndSaveScope(scope);

  etDetailInitial = raw;
  if(silent) return;
  msgSlot.innerHTML = '<div class="et-io-msg ok">Đã lưu '+(newRows.length-1)+' quy tắc vào "'+etEsc(scope.name)+'".</div>';
  setTimeout(etShowList, 900);
}
function etDownloadExport(text, scope){
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quy-tac-' + (scope.key||'truyen').replace(/[\\/:*?"<>|]/g,'_') + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
