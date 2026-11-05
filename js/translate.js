// ===================================================================
// translate.js — Logic dịch & gọi API (tách từ index.html)
// 
// File này KHÔNG dùng type="module" — chạy như 1 classic script bình
// thường, dùng chung scope global với khối <script> chính trong index.html
// (giống cách tts.js đã tách trước đó). Vì vậy:
//  - Mọi hàm/biến top-level trong file này (S, setStatus, renderCh, updChItem,
//    updCtrl, saveSession, renderList, getKeys, getModel, getProvider, chNum,
//    applyReplace, checkNearestFailedPreload, closePopup, toggleSettings,
//    ensurePreload, ensureAuditPipeline, getParallelCount, auditChapterAddressing,
//    getCharMemOn, shouldDisableThinking, getPrompt, v.v.) vẫn được đọc/gọi bình
//    thường từ index.html vì cùng chia sẻ global scope giữa các thẻ <script> classic.
//  - S.xlatingSet (Set các chỉ số chương đang dịch, thay cho cờ boolean S.isXlating cũ) và
//    S.chapterCharSnapshot (snapshot thông tin nhân vật CHỐT SẴN cho từng chương, do pipeline
//    phân tích tuần tự ở index.html chuẩn bị trước — xem ensureAnalyzePipeline()) cho phép
//    xlate() bên dưới chạy THẬT SỰ song song nhiều chương cùng lúc mà không lẫn lộn ngữ cảnh
//    nhân vật giữa các chương (Luồng 1+2 trong tính năng "Dịch song song").
//  - QUAN TRỌNG: file này PHẢI được nạp SAU khối <script> chính (nơi khai báo
//    S = {...} và các hàm trên) vì phần Rate-Limit bên dưới có đoạn tự chạy ngay
//    khi nạp (resetOnPageLoad, clearExpiredQuotaBlocks(), setInterval) và có đọc
//    biến S. Xem thẻ <script src="translate.js"> được đặt ngay sau khối <script>
//    chính trong index.html.
// ===================================================================

// Giới hạn RPM (Flash 5/phút, Lite 15/phút theo từng cặp key+model) do api-sched.js (Sched) quản lý; callAPI() tự chờ chỗ trống.
// Semaphore đếm số request API dịch nội dung chương đang chạy CÙNG LÚC — trước đây là 1 khoá
// boolean (chỉ 1 request tại 1 thời điểm), nhưng giờ đã hỗ trợ dịch SONG SONG nhiều chương (xem
// "Số chương dịch song song" trong Cài đặt / getParallelCount() trong index.html), nên khoá cứng
// 1-request-1-lúc sẽ vô tình xếp hàng tuần tự MỌI request thật dù người dùng đã chọn song song
// nhiều chương — mất hết tác dụng của tính năng. Giờ cho phép tối đa getParallelCount() request
// đồng thời (đúng bằng số chương được phép dịch song song), vẫn giữ vai trò 1 lớp an toàn cuối
// cùng để không bao giờ bắn vượt quá số lượng request đã cấu hình (kể cả khi có request phụ khác
// như dịch tiêu đề/soát chất lượng/phân tích nhân vật chen vào cùng lúc).
let _apiLockCount = 0;
async function acquireApiLock(){
  let waited=false;
  while(_apiLockCount>=getParallelCount()){
    if(!waited){flowLog('api',`Đầy slot (${_apiLockCount}/${getParallelCount()}) — chờ tới lượt gọi API...`);waited=true;}
    await new Promise(r=>setTimeout(r,200));
  }
  _apiLockCount++;
  flowLog('api',`Chiếm slot gọi API: ${_apiLockCount}/${getParallelCount()} đang chạy.`);
}
function releaseApiLock(){
  _apiLockCount=Math.max(0,_apiLockCount-1);
  flowLog('api',`Trả slot gọi API: ${_apiLockCount}/${getParallelCount()} đang chạy.`);
}
// Tương thích code cũ (character-memory.js còn gọi): rlCheck = slot còn chỗ ngay không; rlRecord = no-op (callAPI/Sched đã ghi lượt, ghi nữa là đếm đôi).
function rlCheck(model,key){return (typeof Sched!=='undefined')?Sched.waitMs(key,model)===0:true;}
function rlRecord(){}


// ===== DAILY RATE LIMIT (429 quota exhausted → skip đến ngày mai) =====
// key: 'dich-rl:<model>:<keyHash>'  value: timestamp khi bị block
function _rlDayKey(model,apiKey){
  // dùng 8 ký tự cuối của key để tránh lưu key thật
  const h=apiKey.slice(-8);
  return 'dich-rl:'+model+':'+h;
}
function rlDayBlocked(model,apiKey){
  try{
    const k=_rlDayKey(model,apiKey);
    const v=localStorage.getItem(k);
    if(!v)return false;
    const ts=parseInt(v);
    // Reset lúc 00:00 giờ Thái Bình Dương (America/Los_Angeles) — cùng lúc Gemini refresh quota
    if(ts<getLastPTMidnight()){localStorage.removeItem(k);return false;}
    return true;
  }catch(e){return false;}
}
function rlDayBlock(model,apiKey){
  try{localStorage.setItem(_rlDayKey(model,apiKey),Date.now().toString());}catch(e){}
}

// ===== AUTO RESET QUOTA LÚC 00:00 GIỜ THÁI BÌNH DƯƠNG =====
// Trả về timestamp của lần 00:00 PT (America/Los_Angeles) gần nhất đã qua
function getLastPTMidnight(){
  // Reset lúc 15:00 giờ Việt Nam (Asia/Ho_Chi_Minh = UTC+7)
  try{
    const now=new Date();
    const vnDateStr=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    // 15:00:00 VN = vnDateStr 08:00:00 UTC (UTC+7 → trừ 7h)
    const reset=new Date(vnDateStr+'T08:00:00Z').getTime();
    // Nếu mốc reset hôm nay chưa tới → lấy hôm qua
    return reset>now.getTime()?reset-86400000:reset;
  }catch(e){
    // Fallback: UTC+7 cố định
    const now=Date.now();
    const reset=Math.floor((now+7*3600000)/86400000)*86400000-7*3600000+8*3600000;
    return reset>now?reset-86400000:reset;
  }
}

// Xóa tất cả các block quota nếu chúng được đánh dấu TRƯỚC lần reset gần nhất
function clearExpiredQuotaBlocks(){
  try{
    const resetTime=getLastPTMidnight();
    const toDelete=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k||!k.startsWith('dich-rl:'))continue;
      const ts=parseInt(localStorage.getItem(k));
      if(ts&&ts<resetTime)toDelete.push(k);
    }
    if(toDelete.length){
      toDelete.forEach(k=>localStorage.removeItem(k));
      console.log('[AutoReset] Đã reset '+toDelete.length+' quota block(s) sau 00:00 PT.');
      S.keyIdx=0; // quay về key 1 sau khi reset quota
      S.activeModelIdx=0; // quay về model chính ban đầu sau khi reset quota
      if(typeof setStatus==='function')setStatus('🔄 Đã tự động reset quota — tiếp tục dịch từ key 1, model 1',4000);
    }
  }catch(e){}
}

// ===== RESET TOÀN BỘ RATE-LIMIT/QUOTA — dùng chung cho reload trang & retry sau lỗi =====
// Xóa TOÀN BỘ đánh dấu lỗi 429/503/quota, quay về key 1 / model 1,
// y hệt như khi reload lại file.
function resetAllRateLimitsAndQuota(){
  try{
    const toDelete=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('dich-rl:'))toDelete.push(k);
    }
    if(toDelete.length){
      toDelete.forEach(k=>localStorage.removeItem(k));
      console.log('[ResetRateLimit] Đã xóa '+toDelete.length+' quota block(s).');
    }
    S.keyIdx=0;
    S.activeModelIdx=0;
  }catch(e){}
}

// ===== RESET LỖI KHI RELOAD TRANG =====
// Mỗi lần trang được load (reload file), xóa TOÀN BỘ đánh dấu lỗi 429/503/quota
// để bắt đầu dịch lại từ key 1 như mới hoàn toàn.
(function resetOnPageLoad(){
  resetAllRateLimitsAndQuota();
})();

// Chạy kiểm tra ngay lập tức và mỗi 15 phút (reset lúc 15:00 VN nếu không reload)
clearExpiredQuotaBlocks();
setInterval(clearExpiredQuotaBlocks,15*60*1000);


// Thứ tự trong mảng này = thứ tự "cấp bậc" từ cao xuống thấp (KHÔNG phải thứ tự
// hiển thị trong dropdown). Dùng để tính chuỗi fallback CHỈ ĐI XUỐNG cấp thấp hơn
// (xem mOrder bên dưới) — model mới/mạnh hơn hết quota thì rơi xuống model kế tiếp
// trong danh sách này, KHÔNG BAO GIỜ quay lại model cấp cao hơn model người dùng
// đã chọn ban đầu.
// Model NHẸ (Lite) — khai báo 1 chỗ duy nhất; chatbot.js cũng đọc 2 hằng này (CHAT_LITE_MODEL/heavyModelCandidates).
// Đổi model nhẹ thì sửa ở đây (và <option> tương ứng trong index.html).
const GEMINI_LITE_MODEL="gemini-3.5-flash-lite";
// Model RIÊNG cho bước dịch tiêu đề chương (Gemini): 3.1 Flash Lite — chỉ dùng cho tiêu đề, KHÔNG nằm trong
// MODELS/fallback dịch nội dung và không có trong <select> chọn model.
const GEMINI_TITLE_MODEL="gemini-3.1-flash-lite";
// [Cập nhật 19/9/2026] DeepSeek đã khai tử model "deepseek-v4-flash" từ 10/9/2026, chuyển hẳn
// sang "deepseek-flash" (phục vụ model mới DeepSeek-V4.1-Flash) — tên cũ tạm thời vẫn được chấp
// nhận (tự route sang model mới, tính đúng giá Flash) nhưng có thể bị gỡ bất kỳ lúc nào. Dùng
// thẳng tên mới ở đây để không phụ thuộc vào lớp tương thích tạm thời đó.
const DEEPSEEK_LITE_MODEL="deepseek-flash";
const MODELS=["gemini-3.8-flash","gemini-3.6-flash","gemini-3-flash-preview",GEMINI_LITE_MODEL];
// ===== DEEPSEEK =====
// DeepSeek thực ra chỉ có 1 model API thật (V4 Flash). Trước đây app tách 2 "model ảo"
// (T/NT) chỉ để BẬT/TẮT thinking — giờ đã gộp lại còn ĐÚNG 1 model, việc BẬT/TẮT/tăng mức
// thinking chuyển hẳn sang lựa chọn "Chế độ dịch" dùng chung với Gemini (xem getTranslateMode()
// trong index.html, và callDeepseekAPI() bên dưới đọc tham số thinkMode để quyết định gửi
// {"thinking":{"type":"disabled"}} (Nhanh, linh hoạt), không gửi gì — mặc định BẬT thinking
// mức "high" của DeepSeek (Bình thường), hay "reasoning_effort":"max" (Nghĩ kỹ).
// "deepseek-v4-flash-quality" vẫn giữ làm "model ảo" (khác tên thật gửi lên API — xem
// DEEPSEEK_REAL_MODEL) chỉ vì lý do lịch sử (tách rate-limit/quota tracking riêng với tên
// "deepseek-flash" thật, dùng làm LITE_MODEL/phao cứu sinh khi hết quota ngày — xem bên dưới).
const DEEPSEEK_MODELS=["deepseek-v4-flash-quality"];
// Model ảo -> tên model thật gửi lên API DeepSeek. Không có trong bảng này thì coi model ảo
// CHÍNH LÀ tên thật luôn (áp dụng cho "deepseek-flash").
const DEEPSEEK_REAL_MODEL={"deepseek-v4-flash-quality":"deepseek-flash"};
const ALL_MODELS=MODELS.concat(DEEPSEEK_MODELS);
const MLBL={"gemini-3.8-flash":"3.8 Flash","gemini-3.6-flash":"3.6 Flash","gemini-3-flash-preview":"3 Flash","gemini-3.5-flash-lite":"3.5 Flash Lite","gemini-3.1-flash-lite":"3.1 Flash Lite","deepseek-flash":"DeepSeek V4 Flash","deepseek-v4-flash":"DeepSeek V4 Flash","deepseek-v4-flash-quality":"DeepSeek V4 Flash"};

// ===================================================================
// ===== DỊCH TIÊU ĐỀ CHƯƠNG (riêng, gọi API nhẹ — không gộp vào lượt dịch nội dung) =====
// ===================================================================
// Model nhẹ dùng để dịch tiêu đề (cùng model dùng cho phân tích nhân vật trong
// character-memory.js — 'gemini-3.5-flash-lite', rẻ và đủ cho việc dịch câu ngắn).
// Không tham chiếu trực tiếp CHAR_ANALYSIS_MODEL vì character-memory.js được nạp
// SAU khối script này nên biến đó chưa tồn tại tại thời điểm khai báo ở đây.
// DeepSeek chỉ có 1 model — không có model nhẹ riêng như Gemini để dịch tiêu đề, dùng luôn
// hàm getTitleXlateModel() bên dưới thay vì hằng số cố định.
const TITLE_XLATE_MODEL=GEMINI_TITLE_MODEL; // gemini-3.1-flash-lite
function getTitleXlateModel(){return (typeof getProvider==='function'&&getProvider()==='deepseek')?getModel():TITLE_XLATE_MODEL;}
// Vì tiêu đề rất ngắn, có thể gộp nhiều tiêu đề vào 1 lần gọi API mà vẫn an toàn về
// giới hạn token đầu ra — 300 tiêu đề/lần là mức cân bằng giữa hiệu quả (ít lượt gọi)
// và độ tin cậy (JSON trả về không quá dài, tránh bị cắt giữa chừng).
const TITLE_BATCH_SIZE=300;
// Số lần tối đa dịch LẠI 1 tiêu đề nếu kết quả trả về vẫn còn sót ký tự Hán (model có
// thể không dịch được tên riêng/thuật ngữ đặc thù) — tránh vòng lặp gọi API vô hạn.
const MAX_TITLE_RETRY=9;
let _titleXlating=false;
// Đếm số lần đã thử dịch lại cho từng chỉ số chương (chỉ tồn tại trong phiên làm việc
// hiện tại, không cần lưu persist — reload trang thì thử lại từ đầu cũng không sao).
const _titleRetryCount={};
// Độ trễ hiện tại giữa 2 lượt tự retry của ensureTitlesTranslated() khi CẢ LƯỢT vừa rồi
// không key nào dịch được (xem finally bên dưới) — tăng dần (backoff) thay vì cố định 500ms,
// để tránh vòng lặp gọi API dồn dập vô ích khi mọi key/model đều đang bị chặn (rate limit
// phút hoặc hết quota ngày): 500ms → 1s → 2s → 4s ... tối đa 20s; reset về 500ms ngay khi
// có 1 lượt dịch thành công.
let _titleRetryDelay=500;
const TITLE_RETRY_DELAY_MAX=20000;
// Phát hiện ký tự Hán còn sót lại trong bản dịch (CJK Unified Ideographs + Extension A +
// Compatibility) — dùng để quyết định có cần gọi API dịch lại tiêu đề đó hay không.
const CJK_CHAR_RE=/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
function hasCJK(s){return CJK_CHAR_RE.test(s||'');}
// Đích dùng chữ Hán (zh / zh-TW / ja): chữ Hán trong bản dịch là HỢP LỆ, không phải "sót" → bỏ qua các kiểm tra sót chữ Hán bên dưới
// (nếu không, mỗi chương sẽ bị tự dịch lại tối đa MAX_CHAPTER_CJK_RETRY lần và tiêu đề bị dịch lại oan). Đích vi/en/ko/...: như cũ.
function tlHanOk(){try{const sc=(window.TargetLang&&!TargetLang.isVi())?TargetLang.script():'';return sc==='Hans'||sc==='Hant'||sc==='Jpan';}catch(e){return false;}}
function hasCJKLeak(s){return !tlHanOk()&&hasCJK(s);}
// Kiểm tra sót chữ NGUỒN khái quát (chỉ dùng khi đích ≠ vi; đích vi vẫn dùng cjkRatio như cũ).
// Một bảng chữ coi là "của nguồn" nếu chiếm ≥20% ký tự chữ trong văn bản gốc; nếu đích KHÔNG dùng bảng chữ đó thì số ký tự
// thuộc bảng chữ đó còn trong bản dịch được tính là sót. Trả về tỷ lệ sót / tổng ký tự chữ của bản dịch (cùng thang với cjkRatio).
const LEAK_SCRIPT={Cyrl:'Cyrillic',Arab:'Arabic',Hebr:'Hebrew',Thai:'Thai',Deva:'Devanagari',Grek:'Greek',Armn:'Armenian',Geor:'Georgian',Beng:'Bengali',Gujr:'Gujarati',Knda:'Kannada',Khmr:'Khmer',Laoo:'Lao',Mlym:'Malayalam',Mymr:'Myanmar',Sinh:'Sinhala',Taml:'Tamil',Telu:'Telugu',Guru:'Gurmukhi',Ethi:'Ethiopic'};
const LEAK_RES=(()=>{const o={};['Han','Hiragana','Katakana','Hangul'].concat(Object.values(LEAK_SCRIPT)).forEach(n=>{try{o[n]=new RegExp('\\p{Script='+n+'}','gu');}catch(e){}});return o;})();
function tlAllowedScripts(){
  const sc=TargetLang.script();
  if(sc==='Hans'||sc==='Hant')return['Han'];
  if(sc==='Jpan')return['Han','Hiragana','Katakana'];
  if(sc==='Kore')return['Hangul'];
  return LEAK_SCRIPT[sc]?[LEAK_SCRIPT[sc]]:[];
}
function tlLeakRatio(src,res){
  try{
    if(!src||!res)return 0;
    const allowed=tlAllowedScripts(),cnt=(t,n)=>(t.match(LEAK_RES[n])||[]).length;
    const srcLetters=(src.match(/\p{L}/gu)||[]).length;
    if(!srcLetters)return 0;
    let leak=0;
    for(const n in LEAK_RES){if(allowed.includes(n))continue;if(cnt(src,n)/srcLetters>=0.2)leak+=cnt(res,n);}
    const resLetters=(res.match(/\p{L}/gu)||[]).length;
    return resLetters?leak/resLetters:0;
  }catch(e){return 0;}
}
// Tính tỷ lệ ký tự Hán (CJK) trên tổng số ký tự CHỮ (không tính khoảng trắng/số/dấu câu) trong
// văn bản — dùng để phát hiện bản dịch CẢ CHƯƠNG còn sót QUÁ NHIỀU tiếng Trung chưa được dịch.
// Khác hasCJK() ở trên (chỉ trả về CÓ/KHÔNG, dùng cho tiêu đề ngắn) — với nội dung cả chương cần
// biết MỨC ĐỘ sót nhiều hay ít để quyết định có đáng tự động dịch lại cả chương hay không, vì vài
// tên riêng/thuật ngữ còn sót rải rác là bình thường, không nên coi là lỗi và dịch lại tốn quota oan.
function cjkRatio(text){
  if(!text)return 0;
  const cjkCount=(text.match(new RegExp(CJK_CHAR_RE.source,'g'))||[]).length;
  if(!cjkCount)return 0;
  const letterCount=(text.match(/[\p{L}]/gu)||[]).length;
  return letterCount?cjkCount/letterCount:0;
}
// Ngưỡng % ký tự Hán còn sót (tính trên tổng ký tự chữ) để coi bản dịch chương là THIẾU NGHIÊM
// TRỌNG, cần tự động gọi API dịch lại cả chương — theo yêu cầu: trên 20% vẫn còn tiếng Trung.
const CHAPTER_CJK_RATIO_THRESHOLD=0.10;
// Số lần tối đa tự động dịch lại 1 chương chỉ vì lý do "còn sót tiếng Trung quá ngưỡng" (tránh
// vòng lặp gọi API vô hạn/tốn quota oan nếu bản chất chương đó không thể dịch sạch hết được, VD
// văn bản gốc lỗi/thiếu, hoặc model liên tục lặp lại đúng lỗi cũ).
const MAX_CHAPTER_CJK_RETRY=2;

// Khoá tên nhân vật (origName -> tên Việt) lên 1 chuỗi bất kỳ; trả về chuỗi gốc nếu chưa nạp character-memory.js
// hoặc đang tắt Character Memory. Hàm thuần: không sửa dữ liệu đã lưu, chỉ trả chuỗi mới.
function lockCharNames(t){
  return (typeof applyCharNameSubstitution==='function'&&typeof t==='string')?applyCharNameSubstitution(t):t;
}
// ===================================================================
// ===== CHƯƠNG KHÔNG CÓ TIÊU ĐỀ =====
// ===================================================================
// Chương "không có tiêu đề" = tiêu đề tool chỉ còn "Chương N:" (hoặc "Chương N: - Phần X" khi chương bị tự tách
// nhỏ). Tính năng AI tự đặt tên cho các chương này đã được GỠ BỎ: giữ nguyên "Chương N:" / "Chương N: - Phần X".
// Các hàm dưới đây chỉ để ensureTitlesTranslated() KHÔNG đưa những tiêu đề này cho AI dịch.
function parseUntitled(title){
  const m=(title||'').match(/^(Chương\s+\d+:)\s*(?:-\s*)?(?:Phần\s+(\d+))?\s*$/);
  if(!m)return null;
  if(m[2]&&m[2]!=='1')return null;
  return {prefix:m[1],suffix:m[2]?' - Phần '+m[2]:''};
}
// Phần ≥2 của chương KHÔNG tên bị tự tách: "Chương 6: - Phần 2" / "Chương 6: Phần 2". Không có tên thật để dịch.
function isUntitledLaterPart(title){
  const m=(title||'').match(/^Chương\s+\d+:\s*(?:-\s*)?Phần\s+(\d+)\s*$/);
  return !!m&&m[1]!=='1';
}
// Tách "Chương N:" (giữ nguyên) và " - Phần X" (giữ nguyên, nếu có) ra khỏi phần tên
// chương cần dịch. Trả về null nếu tiêu đề không theo format chuẩn (Mở đầu, Toàn bộ
// truyện, Phần N do fallback chia theo ký tự...) hoặc không có phần tên riêng để dịch.
function extractTitleParts(title){
  if(parseUntitled(title)||isUntitledLaterPart(title))return null; // chương không tiêu đề: không có tên để dịch
  const m=(title||'').match(/^(Chương\s+\d+:)\s*(.*?)(\s-\sPhần\s\d+)?$/);
  if(!m)return null;
  const body=(m[2]||'').trim();
  if(!body)return null;
  return {prefix:m[1],body,suffix:m[3]||''};
}

// Gom tất cả tiêu đề chưa dịch (tối đa TITLE_BATCH_SIZE/lượt) và gọi API dịch 1 lần.
// Chạy song song với việc dịch nội dung chương (không await ở nơi gọi) — lỗi ở đây
// không ảnh hưởng tới luồng dịch chính, chỉ log cảnh báo và bỏ qua.
async function ensureTitlesTranslated(){
  if(_titleXlating||!S.chapters||!S.chapters.length)return;
  // Dọn tiêu đề do AI tự đặt/bịa đã lưu từ phiên cũ: chương không tên (kể cả phần ≥2 từng bị đưa nhầm "- Phần 2"
  // cho AI dịch) không thể có tiêu đề dịch hợp lệ → xoá để trở về đúng "Chương N:" / "Chương N: - Phần X".
  {
    let healed=false;
    S.chapters.forEach((ch,i)=>{
      if(S.translatedTitles[i]&&(parseUntitled(ch.title)||isUntitledLaterPart(ch.title))){delete S.translatedTitles[i];healed=true;}
    });
    if(healed){saveSession();renderList();if(S.cur>=0)renderCh(S.cur);}
  }
  const myGen=S.gen; // phát hiện chuyển truyện giữa lúc đang dịch tiêu đề
  const keys=getKeys();
  if(!keys.length)return;
  const pending=[];
  for(let i=0;i<S.chapters.length&&pending.length<TITLE_BATCH_SIZE;i++){
    const parts=extractTitleParts(S.chapters[i].title);
    if(!parts)continue;
    if(S.translatedTitles[i]){
      // Đã có bản dịch — chỉ dịch LẠI nếu kết quả cũ vẫn còn ký tự Hán và chưa vượt
      // số lần thử lại cho phép. Luôn dịch lại từ tiêu đề GỐC (parts.body lấy từ
      // S.chapters[i].title, không đổi qua các lần dịch) để model có đủ ngữ cảnh gốc.
      if(!hasCJKLeak(S.translatedTitles[i]))continue;
      const retries=_titleRetryCount[i]||0;
      if(retries>=MAX_TITLE_RETRY)continue;
      _titleRetryCount[i]=retries+1;
      markRetranslated(i,'title',`lần ${retries+1}/${MAX_TITLE_RETRY}, còn sót chữ nguồn`);
    }
    // Khoá tên trong tiêu đề giống như nội dung chương: AI thấy sẵn tên Việt đã chốt thay vì tự phiên âm lại.
    pending.push({id:i,text:lockCharNames(parts.body)});
  }
  if(!pending.length)return;
  console.log(`[Title Xlate] Phát hiện ${pending.length} tiêu đề chưa dịch, đang gọi API...`);
  _titleXlating=true;
  try{
    const reqText=tlEn()
      ?tlFill('Translate the following novel chapter titles from {{SOURCE_LANG}} into {{TARGET_LANG}} — natural, concise, in a style suited to fiction (no explanations, no notes, no added numbering). Return ONLY one valid JSON array, each element of the form {"id":<number>,"t":"<translation>"}, keeping each "id" exactly as given for its title, without adding, removing or reordering elements. If a title is already in {{TARGET_LANG}} or its meaning is unclear, keep the original text in "t".\n\nList:\n')+JSON.stringify(pending)
      :'Dịch các tiêu đề chương truyện sau sang tiếng Việt tự nhiên, ngắn gọn, đúng văn phong tiểu thuyết (không giải thích, không thêm ghi chú, không thêm số thứ tự). '+
      'Trả về DUY NHẤT 1 mảng JSON hợp lệ, mỗi phần tử dạng {"id":<số>,"vi":"<bản dịch>"}, giữ nguyên đúng "id" đã cho cho từng tiêu đề tương ứng, không thêm/bớt/đổi thứ tự phần tử. '+
      'Nếu 1 tiêu đề đã là tiếng Việt hoặc không rõ nghĩa để dịch, giữ nguyên nội dung gốc trong "vi".\n\nDanh sách:\n'+
      JSON.stringify(pending);
    const messages=[{role:'user',parts:[{text:reqText}]}];
    // Ngân sách token riêng cho lượt dịch tiêu đề — KHÔNG dùng ô "Max tokens" của người
    // dùng (ô đó dành cho dịch nội dung chương, có thể bị chỉnh thấp ~16-20k). Ước lượng
    // ~50 token/tiêu đề (kể cả overhead JSON) + biên an toàn, tối thiểu 4096, tối đa 32768.
    const titleMaxTok=Math.min(32768,Math.max(4096,pending.length*50+1000));
    const titleModel=getTitleXlateModel();
    // Model dự phòng cho dịch tiêu đề (chỉ Gemini): 3.1 Flash Lite lỗi (503...) → 3.5 Flash Lite và ngược lại.
    // DeepSeek: không có model dự phòng, giữ nguyên hành vi cũ.
    const titleAlt=titleModel===GEMINI_TITLE_MODEL?GEMINI_LITE_MODEL:(titleModel===GEMINI_LITE_MODEL?GEMINI_TITLE_MODEL:null);
    const titleModels=titleAlt?[titleModel,titleAlt]:[titleModel];
    const titleModelsLabel=titleModels.map((m)=>MLBL[m]||m).join(' / ');
    // Tính TRƯỚC khi thử: nếu MỌI key đều đã hết quota ngày cho đúng model tiêu đề thì khỏi
    // cần vào vòng lặp tốn công (chắc chắn lỗi) — tách riêng khỏi lý do "đang throttle theo
    // phút" (chỉ là tạm thời, sẽ tự hết sau vài giây) để không báo nhầm "hết quota ngày".
    const allDayBlocked=titleModels.every((m)=>keys.every((k)=>rlDayBlocked(m,k)));
    let resultText=null,lastErr=null;
    for(const tm of titleModels){
    if(resultText||allDayBlocked)break;
    let skipModel=false; // model này đang quá tải/lỗi server → bỏ qua các key còn lại, chuyển sang model dự phòng
    for(let ki=0;ki<keys.length&&!skipModel;ki++){
      const key=keys[ki];
      // QUAN TRỌNG: trước đây vòng lặp này gọi thẳng callAPI() mà KHÔNG hề kiểm tra/ghi vào
      // 2 lớp chặn dùng chung với luồng dịch nội dung chính (rlDayBlocked/rlCheck+rlRecord ở
      // đầu file) và cũng không qua acquireApiLock() (giới hạn "Tốc độ dịch"). Hậu quả: khi
      // model dịch tiêu đề (mặc định Gemini 3.5 Flash Lite, KHÔNG đổi theo model người dùng
      // chọn) trùng với model đang dịch NỘI DUNG (vd người dùng cũng chọn 3.5 Flash Lite) và
      // "Tốc độ dịch" đang ở 2x/3x (nhiều chương gọi song song), lượt gọi tiêu đề trở thành 1
      // request "lạ" chen ngang, không được đếm vào bộ đếm rlCheck/rlRecord nên luồng chính
      // tưởng còn hạn mức mà bắn tiếp — dễ khiến CẢ HAI phía cùng dính 429/phút, mà lượt dịch
      // tiêu đề thì không có cơ chế chờ/backoff nào nên cứ bắn lại ngay (chỉ lỗi console, im
      // lặng với người dùng) — đúng triệu chứng "chương dịch xong nhưng tiêu đề báo lỗi mãi".
      // Sửa: dùng lại NGUYÊN 2 lớp chặn đó, y hệt luồng dịch nội dung.
      if(rlDayBlocked(tm,key))continue; // key này đã hết quota ngày cho đúng model tiêu đề → bỏ qua, thử key khác
      try{
        await acquireApiLock(); // xếp đúng vào chung hàng đợi "Tốc độ dịch" với dịch nội dung, không chen ngang vô hạn
        let r;
        try{
          // Dịch tiêu đề chương là tác vụ ngắn/đơn giản — luôn ép "fast" (tắt/giảm thinking tối đa)
          // BẤT KỂ người dùng đang chọn "Chế độ dịch" nào cho lượt dịch nội dung chính, để tiết
          // kiệm token/thời gian — an toàn cho cả 2 AI (Gemini 3.5 Flash Lite mặc định vốn đã ở
          // mức "minimal" nên không đổi gì; DeepSeek thì tắt hẳn thinking).
          r=await callAPI(key,tm,messages,titleMaxTok,'fast',undefined,'title');
        }finally{ releaseApiLock(); }
        resultText=r.text;
        if(tm!==titleModel)console.log('[Title Xlate] Dịch bằng model dự phòng: '+(MLBL[tm]||tm));
        break;
      }catch(e){
        lastErr=e;
        // Phân loại 429 giống hệt luồng dịch nội dung (xem attemptOnKeyWithModelFallback):
        // chỉ đánh dấu "hết quota NGÀY" khi có cờ QUOTA_PER_DAY rõ ràng trong lỗi, để tránh
        // khoá nhầm 1 key chỉ đang bị giới hạn theo PHÚT.
        if(e.message&&e.message.includes('429')&&e.message.includes('QUOTA_PER_DAY')){
          rlDayBlock(tm,key);
        }else if(e.message&&e.message.includes('429')){
          // 429 phút: chờ 15s rồi mới thử key kế (giống dịch nội dung)
          console.warn('[Title Xlate] 429 (phút) → chờ 15s rồi thử tiếp');
          await new Promise(r=>setTimeout(r,15000));
          if(myGen!==S.gen)return;
        }else if(e.message&&/\b(500|502|503|504)\b|UNAVAILABLE|overloaded|high demand/i.test(e.message)){
          console.warn('[Title Xlate] '+(MLBL[tm]||tm)+' lỗi server/quá tải → chuyển model dự phòng (nếu có)');
          skipModel=true;
        }
      }
    }
    }
    if(!resultText){
      if(allDayBlocked&&keys.length){
        // Mọi key đều đã hết quota NGÀY cho đúng model dịch tiêu đề → còn thử lại (backoff)
        // cũng vô ích cho tới khi quota reset, nhưng vẫn cứ để vòng retry tự nhiên phát hiện
        // lại (quota có thể được reset/thêm key mới) — chỉ báo 1 lần lên status cho người dùng
        // biết tiêu đề đang tạm dừng, tránh tưởng app bị treo.
        console.warn('[Title Xlate] Mọi key đều hết quota ngày cho model '+titleModelsLabel+', tạm dừng dịch tiêu đề.');
        if(typeof setStatus==='function')setStatus(`⏸️ Tạm dừng dịch tiêu đề: hết quota ngày (${titleModelsLabel}) ở mọi key`,5000);
      } else {
        console.warn('[Title Xlate] Lỗi dịch tiêu đề, sẽ thử lại ở lượt sau:',lastErr?.message);
      }
      return;
    }
    _titleRetryDelay=500; // thành công → reset backoff cho lượt tiếp theo
    let arr=null;
    try{
      const jm=resultText.match(/\[[\s\S]*\]/);
      arr=JSON.parse(jm?jm[0]:resultText);
    }catch(e){console.warn('[Title Xlate] JSON trả về không hợp lệ:',resultText.slice(0,300));return;}
    if(!Array.isArray(arr))return;
    if(myGen!==S.gen)return; // đã chuyển sang truyện khác trong lúc chờ API → bỏ kết quả cũ
    let changed=false;
    for(const item of arr){
      const idx=item?.id;
      if(typeof idx!=='number'||!S.chapters[idx])continue;
      const parts=extractTitleParts(S.chapters[idx].title);
      if(!parts)continue;
      const vi=lockCharNames((item.vi||item.t||'').trim());
      if(!vi)continue;
      S.translatedTitles[idx]=`${parts.prefix} ${vi}${parts.suffix}`;
      changed=true;
    }
    if(changed){
      console.log(`[Title Xlate] Hoàn tất lượt dịch tiêu đề: ${arr.length} tiêu đề.`);
      saveSession();
      renderList();
      if(S.cur>=0)renderCh(S.cur);
    }
  }catch(e){
    console.warn('[Title Xlate] Lỗi:',e);
  }finally{
    _titleXlating=false;
    // Nếu còn tiêu đề chưa dịch (do bị giới hạn TITLE_BATCH_SIZE), HOẶC còn tiêu đề đã
    // dịch nhưng vẫn sót ký tự Hán và chưa hết lượt thử lại → tự chạy tiếp lượt sau
    const stillPending=S.chapters.some((ch,i)=>{
      if(!extractTitleParts(ch.title))return false;
      if(!S.translatedTitles[i])return true;
      return hasCJKLeak(S.translatedTitles[i])&&(_titleRetryCount[i]||0)<MAX_TITLE_RETRY;
    });
    if(stillPending){
      setTimeout(()=>ensureTitlesTranslated(),_titleRetryDelay);
      // Tăng dần độ trễ cho lượt SAU NỮA nếu lượt này tiếp tục không có key nào dịch được
      // (xem đoạn reset về 500ms ngay khi có resultText ở trên) — tránh bắn lại y hệt lượt
      // vừa thất bại trong khi mọi key vẫn đang throttle/hết quota ngày.
      _titleRetryDelay=Math.min(TITLE_RETRY_DELAY_MAX,_titleRetryDelay*2);
    }
  }
}

function doTranslate(){
  S.everStarted=true;
  // Người dùng chủ động bấm nút "Dịch" → coi như đã "mở khoá" lại luồng tự động, kể cả khi
  // trước đó đã bấm "Dừng" (doStop() từng set S.autoHalted=true để chặn MỌI lượt tự-bắt-đầu
  // dịch mới của preload/ensurePreload...). Nếu không reset ở đây, dù nút "Tự động dịch"
  // (S.auto) đang bật, mọi hàm kiểm tra !S.autoHalted (ensurePreload, checkNearestFailedPreload,
  // v.v.) vẫn bị chặn vĩnh viễn cho tới khi tải lại file → hệ quả đúng như lỗi báo cáo: bấm Dịch
  // sau khi Dừng thì chỉ dịch được đúng 1 chương rồi auto không tự tiếp tục nữa.
  S.autoHalted=false;
  // Không còn tự ép bật "Tự động dịch" ở đây nữa — trạng thái bật/tắt giờ hoàn toàn do người
  // dùng tự quyết định qua nút #autoBtn (toggleAuto()). Mặc định ban đầu (lần đầu dùng tool,
  // chưa từng lưu lựa chọn) vẫn là BẬT — xem loadSettings() trong index.html.
  // không dịch lại nếu đã có bản dịch rồi
  if(S.translations[S.cur]){ensurePreload();return;}
  // Người dùng chủ động bấm Dịch cho đúng chương đang hiện popup "chương lỗi" → đóng popup
  if(_failedPopupChIdx===S.cur)closePopup();
  // Xóa flag lỗi — người dùng chủ động nhấn Dịch nên được thử lại
  delete S.failed[S.cur];
  if(S.autoFailed)delete S.autoFailed[S.cur];
  if(S.dismissedAutoFailedPreload)S.dismissedAutoFailedPreload.delete(S.cur);
  S.preloading.delete(S.cur);
  // Đánh dấu chương này đang được dịch thủ công để preload không chen vào
  if(!S.manualChapters)S.manualChapters=new Set();
  S.manualChapters.add(S.cur);
  // nếu chương này bị kẹt ở trạng thái "đang dịch" từ trước (VD lỗi dở dang), reset lại
  if(S.xlatingSet.has(S.cur)){S.xlatingSet.delete(S.cur);S.stopReq=false;}
  updCtrl();
  const targetCh=S.cur;
  xlate(targetCh).then(()=>{
    if(S.manualChapters)S.manualChapters.delete(targetCh);
    ensurePreload();
  });
  // QUAN TRỌNG: cũng gọi ensurePreload() ngay ở đây (không đợi xlate(targetCh) xong) — nếu không,
  // với LƯỢT DỊCH THỦ CÔNG ĐẦU TIÊN của cả truyện (trước đó chưa có lượt preload/ensurePreload nào
  // từng chạy), pipeline phân tích nhân vật (ensureAnalyzePipeline — xem index.html) chỉ được đánh
  // thức lần đầu SAU KHI xlate(targetCh) resolve — tức toàn bộ việc phân tích/cập nhật thông tin
  // nhân vật cho các chương dự bị phía sau phải ĐỨNG YÊN chờ đúng 1 chương đầu tiên dịch xong, thay
  // vì chạy song song ngay từ đầu như mọi chương sau đó (khi ensurePreload() đã được "mồi" 1 lần,
  // nó tự dây chuyền gọi lại chính nó liên tục nên không còn gặp lại vấn đề này nữa).
  ensurePreload();
}
function doRetranslate(){
  if(S.cur<0)return;
  // Cùng lý do như doTranslate(): bấm "Dịch lại" cũng là hành động chủ động của người dùng để
  // tiếp tục dịch, nên phải mở khoá lại auto nếu trước đó đã bị S.autoHalted (do bấm Dừng).
  S.autoHalted=false;
  if(_failedPopupChIdx===S.cur)closePopup();
  // GIỮ bản dịch cũ cho tới khi có bản mới: nếu API lỗi / người dùng bấm Dừng / đổi truyện thì khôi phục lại bản cũ,
  // không để "Dịch lại" biến thành mất bản dịch. (Trong tủ truyện, cổng chặn libPut cũng không cho xoá chương này.)
  const _oldTr=S.translations[S.cur],_oldTt=S.translatedTitles?S.translatedTitles[S.cur]:undefined,_oldGen=S.gen;
  delete S.translations[S.cur];delete S.failed[S.cur];if(S.autoFailed)delete S.autoFailed[S.cur];
  if(S.dismissedAutoFailedPreload)S.dismissedAutoFailedPreload.delete(S.cur);
  S.preloading.delete(S.cur);
  // Đánh dấu "đang dịch thủ công" giống doTranslate() — tránh preload nền chen ngang dịch
  // trùng cho đúng chương này khi đang dịch song song nhiều chương.
  if(!S.manualChapters)S.manualChapters=new Set();
  S.manualChapters.add(S.cur);
  const targetCh=S.cur;
  markRetranslated(targetCh,'manual');
  updChItem(targetCh);
  xlate(targetCh).then(()=>{
    if(S.manualChapters)S.manualChapters.delete(targetCh);
    if(_oldTr&&S.gen===_oldGen&&!S.translations[targetCh]){ // không có bản mới → trả lại bản cũ
      S.translations[targetCh]=_oldTr;
      if(_oldTt!==undefined&&S.translatedTitles&&S.translatedTitles[targetCh]===undefined)S.translatedTitles[targetCh]=_oldTt;
      delete S.failed[targetCh];if(S.autoFailed)delete S.autoFailed[targetCh];
      try{updChItem(targetCh);if(S.cur===targetCh){S.showOrig=false;renderCh(targetCh);updCtrl();}}catch(_){}
      try{setStatus('Dịch lại không thành công — đã giữ nguyên bản dịch cũ của chương này.',5000);}catch(_){}
      try{saveSessionSoon();}catch(_){}
    }
    ensurePreload();
  });
  // Xem giải thích trong doTranslate(): mồi ensurePreload() ngay, không đợi xlate() xong.
  ensurePreload();
}

async function xlate(i,isPre=false){
  const keys=getKeys();
  if(!keys.length){
    // Tắt luôn chế độ tự động dịch để ensurePreload()/vòng preload không tiếp tục
    // kích hoạt thêm các lượt xlate() khác (mỗi lượt lại thiếu key) → tránh thông báo lặp lại.
    if(S.auto){S.auto=false;localStorage.setItem('dich-auto','0');updAutoBtn();}
    S.xlatingSet.delete(i);
    alert(`Vui lòng nhập ít nhất 1 ${getProvider()==='deepseek'?'DeepSeek':'Gemini'} API key trong Cài đặt!`);
    toggleSettings();
    updCtrl();
    return;
  }
  S.xlatingSet.add(i);S.stopReq=false;
  flowLog(2,`xlate() chương ${chNum(i)} — ${isPre?'nền/preload':'thủ công (nút Dịch)'} — model ưu tiên: ${getModel()} (${getProvider()}) — đang dịch song song: [${[...S.xlatingSet].map(chNum).join(', ')}]`);
  // Ghi lại "phiên" của truyện đang dịch tại thời điểm bắt đầu. Nếu người dùng chuyển
  // sang truyện khác trước khi lượt dịch này xong, S.gen sẽ đổi → dùng để phát hiện
  // kết quả đã lỗi thời ở cuối hàm, tránh ghi nhầm vào bản dịch của truyện mới.
  const myGen=S.gen;
  // Chỉ render khung đọc nếu chương i ĐANG được đọc (i===S.cur). Trước đây điều
  // kiện chỉ dựa vào !isPre nên khi bấm "Dịch lại" ở popup cho 1 chương preload
  // KHÔNG phải chương đang đọc, renderCh(i) vẫn chạy → màn hình bị "nhảy" sang
  // chương đó dù S.cur không đổi. Giờ dịch lại chương lỗi hoàn toàn ở nền, không
  // làm thay đổi chương đang hiển thị.
  if(!isPre&&i===S.cur)renderCh(i);
  updChItem(i);
  // Chương i vừa được thêm vào S.xlatingSet (dù là dịch nền/preload cho 1 chương KHÁC
  // chương đang xem) → cập nhật ngay nút Dịch/Dừng/Dịch lại của chương đang xem — updCtrl()
  // chỉ đọc S.xlatingSet.has(S.cur) nên các chương KHÁC đang dịch song song không còn ảnh
  // hưởng tới nút của chương đang xem như cờ S.isXlating toàn cục trước đây.
  updCtrl();
  const ch=S.chapters[i];
  const pref=getModel();
  const provider=getProvider();
  // ===== DANH SÁCH MODEL CHÍNH (3.8 / 3.6 / 3 Flash) — fallback CHỈ HẠ CẤP =====
  // Model 3.5 Flash Lite KHÔNG nằm trong danh sách fallback "chính" (mOrderMain/MAIN_MODELS)
  // — nó được dùng làm phao cứu sinh cuối cùng trong 2 trường hợp:
  //  - Hết quota NGÀY (429 RPD) ở TẤT CẢ key cho CẢ 3 model chính: escalate "model chính"
  //    CHỈ ĐI XUỐNG cấp thấp hơn theo thứ tự cố định, không quay lại cấp cao hơn model đã
  //    chọn (persistent trong toàn phiên). VD: chọn 3.6 → 3.5 → 3 Flash → (hết quota mới
  //    tới Lite). Xem escalate ở vòng lặp chính bên dưới.
  //  - Lỗi 503/502/500: hạ dần từ model đang dùng xuống các model THẤP hơn trên CÙNG 1 key
  //    (không bao giờ vòng lên model cao hơn), nếu vẫn 503 hết → thử thêm Lite ngay trên key đó trước khi mới
  //    thật sự bỏ key này — xem attemptOnKeyWithModelFallback/triedLiteOn503 bên dưới.
  // DeepSeek chỉ có 1 model (V4 Flash) nên không có gì để fallback/escalate lên/xuống —
  // LITE_MODEL trùng với chính model đó, MAIN_MODELS rỗng → mọi lượt thử luôn dùng đúng
  // 1 model này trên mỗi key, hết key thì chờ rồi thử lại (10s cho DeepSeek, 30s cho
  // Gemini — xem RETRY_WAIT_MS/vòng lặp bên dưới).
  const LITE_MODEL=provider==='deepseek'?DEEPSEEK_LITE_MODEL:GEMINI_LITE_MODEL;
  const MAIN_MODELS=(provider==='deepseek'?DEEPSEEK_MODELS:MODELS).filter(m=>m!==LITE_MODEL); // [3.8,3.6,3-flash] (rỗng nếu DeepSeek)
  const mainPrefIdx=MAIN_MODELS.indexOf(pref);
  // Nếu người dùng chọn thẳng Lite làm model mặc định → không còn model chính nào phía
  // trên để thử trước, coi như đã ở chế độ Lite ngay từ đầu.
  const mOrderMain=mainPrefIdx===-1?[]:MAIN_MODELS.slice(mainPrefIdx);
  // S.activeModelIdx: 0..mOrderMain.length-1 = đang dùng model chính tương ứng trong
  // mOrderMain; === mOrderMain.length nghĩa là đã hết quota ngày ở mọi model chính
  // (mọi key) → giờ dùng Lite làm "model chính" thay thế.
  // Tăng dần khi tất cả key hết quota ngày cho model chính hiện tại, reset về 0 khi
  // quota được reset (xem resetAllRateLimitsAndQuota / AutoReset).
  if(S.activeModelIdx===undefined)S.activeModelIdx=0;
  // Đảm bảo không vượt quá số model (kể cả vị trí "Lite" ở cuối)
  if(S.activeModelIdx>mOrderMain.length)S.activeModelIdx=0;
  let result=null,lastErr='';
  // Đếm số lỗi 503/502/500 LIÊN TIẾP (bất kể key/model nào), reset về 0 ngay khi có
  // 1 lượt gọi thành công. Dùng để tăng dần thời gian chờ (backoff) thay vì bắn
  // request dồn dập sang key/model kế tiếp ngay lập tức — tránh làm tình trạng
  // quá tải server (nguyên nhân gây 503) thêm trầm trọng.
  let consec503=0;
  // Số lần đã tự động dịch lại NGUYÊN CHƯƠNG này (trong lượt xlate() hiện tại) chỉ vì bản dịch
  // trả về còn sót quá CHAPTER_CJK_RATIO_THRESHOLD tiếng Trung — xem chỗ dùng ở vòng lặp chính
  // bên dưới. Cục bộ theo từng lượt gọi xlate() (không cần lưu persist) — mỗi lần người dùng
  // chủ động bấm "Dịch"/"Dịch lại" là 1 lượt xlate() mới, tự nhiên được thử lại từ đầu.
  let cjkRetryCount=0;

  // Giới hạn thời gian CHÍNH XÁC cho cả chương: quá CHAPTER_TIMEOUT_MS kể từ lúc bắt
  // đầu (kể cả đang chờ giữa chừng một lượt thử key/model) → dừng NGAY và đánh dấu
  // chương lỗi, không đợi cho lượt thử hiện tại chạy xong.
  // DeepSeek dịch chậm hơn Gemini khá nhiều, và người dùng DeepSeek thường chỉ nhập
  // đúng 1 key (không có nhiều key để xoay vòng) — nên áp mốc 6 phút của Gemini vào
  // đây là vô nghĩa, chỉ khiến chương bị bỏ cuộc oan trong khi vẫn có thể dịch được
  // nếu kiên nhẫn thử lại. Vì vậy KHÔNG giới hạn thời gian với DeepSeek: cứ liên tục
  // thử lại (mỗi vòng cách nhau 10s — xem RETRY_WAIT_MS bên dưới) tới khi thành công
  // hoặc người dùng chủ động bấm Dừng.
  const CHAPTER_TIMEOUT_MS=provider==='deepseek'?Infinity:10*60*1000; // 10 phút (chỉ Gemini)
  // Thời gian chờ khi lỗi (RPM/429, hoặc "hết mọi cách" ở vòng lặp ngoài) — DeepSeek chờ
  // NGẮN HƠN Gemini (10s thay vì 30s): DeepSeek chỉ có 1 model/thường 1 key nên không có
  // gì để xoay vòng thử trong lúc chờ, chờ lâu chỉ làm mất thời gian vô ích; còn Gemini có
  // nhiều model/key để thử nên vẫn giữ 30s như cũ (đủ để qua cơn giới hạn tần suất theo phút).
  const RETRY_WAIT_MS=provider==='deepseek'?10000:30000;
  const RETRY_WAIT_SEC=RETRY_WAIT_MS/1000;
  // Mỗi khi gặp 429 theo PHÚT (RPM): chờ đúng 15s rồi mới thử tiếp (model kế / key kế). 429 quota NGÀY thì không chờ, đổi key ngay.
  const RATE429_WAIT_MS=15000;
  const RATE429_WAIT_SEC=RATE429_WAIT_MS/1000;
  const xlateStartTs=Date.now();
  const msLeft=()=>CHAPTER_TIMEOUT_MS-(Date.now()-xlateStartTs);
  const isTimedOut=()=>msLeft()<=0;
  // Chờ tối đa `ms`, nhưng không bao giờ vượt quá thời gian còn lại trước deadline.
  // Trả về true nếu đã hết giờ (deadline đã tới) sau khi chờ xong.
  async function timedWait(ms){
    const w=Math.max(0,Math.min(ms,msLeft()));
    if(w>0)await new Promise(r=>setTimeout(r,w));
    return isTimedOut();
  }
  // Nhãn hiển thị mốc thời gian trong setStatus — tránh in ra "Infinitys" khi
  // CHAPTER_TIMEOUT_MS=Infinity (trường hợp DeepSeek không giới hạn thời gian).
  const timeoutLabel=CHAPTER_TIMEOUT_MS===Infinity?'không giới hạn':(CHAPTER_TIMEOUT_MS/1000)+'s';

  // ===== DỊCH TIÊU ĐỀ: luôn quét toàn bộ chương để dịch hết các tiêu đề còn thiếu
  // (không chỉ chương đang mở) — chạy song song, không await, không chặn dịch nội dung =====
  ensureTitlesTranslated();

  // ===== CHARACTER MEMORY (Luồng 1+2): dùng ĐÚNG snapshot đã được pipeline phân tích tuần tự
  // ở index.html chốt sẵn cho chương i (xem ensureAnalyzePipeline()/S.chapterCharSnapshot) —
  // KHÔNG tự phân tích lại ở đây nữa, để nhiều chương dịch song song không bao giờ ghi chồng
  // lên bộ nhớ nhân vật DÙNG CHUNG lộn xộn thứ tự. _startPreload() đã đảm bảo chỉ gọi xlate()
  // khi snapshot của chương i đã sẵn sàng.
  // Fallback: xlate() cũng được gọi TRỰC TIẾP (không qua gate của _startPreload) khi người dùng
  // chủ động bấm "Dịch"/"Dịch lại" — trường hợp này chưa chắc đã có snapshot, nên vẫn tự phân
  // tích tại chỗ như 1 lớp an toàn (lỗi ở bước này không bao giờ chặn dịch — tự nuốt mọi lỗi).
  // Dùng getChapterCharSnapshot(i) (index.html) thay vì gọi thẳng analyzeChapterCharacters(i) —
  // vì ensurePreload() giờ được gọi NGAY khi bắt đầu dịch thủ công (xem doTranslate()/doRetranslate()),
  // pipeline tuần tự (ensureAnalyzePipeline) có thể ĐANG CÙNG LÚC tự nhận đúng chương i này làm
  // target và cũng bắt đầu phân tích nó. getChapterCharSnapshot() đảm bảo dù bên nào khởi động
  // trước, chương i chỉ thực sự bị phân tích (gọi API) ĐÚNG 1 LẦN — bên gọi sau chỉ "đón" lại kết
  // quả của bên gọi trước, tránh tốn gấp đôi API cho cùng 1 chương.
  let characterContextText='';
  let appearedChars=[];
  if(getCharMemOn()){
    let snap=S.chapterCharSnapshot&&S.chapterCharSnapshot[i];
    if(!snap&&isPre&&typeof _analyzeGaveUp!=='undefined'&&_analyzeGaveUp.has(i)){
      // [Bước 1] Dịch nền chương mà pipeline đã bỏ cuộc phân tích -> không bắn thêm lượt phân tích nữa (bấm tay vẫn thử lại).
      flowLog(1,`Chương ${chNum(i)}: pipeline đã bỏ cuộc phân tích — dịch không có bộ nhớ nhân vật mới.`);
      snap={appearedChars:[],characterContextText:''};
      appearedChars=snap.appearedChars;characterContextText=snap.characterContextText;
    }else if(!snap){
      flowLog(1,`Chương ${chNum(i)}: chưa có snapshot (dịch thủ công, bỏ qua gate của Luồng 1) — tự phân tích nhân vật tại chỗ.`);
      snap=await getChapterCharSnapshot(i);
      appearedChars=snap.appearedChars;
      characterContextText=snap.characterContextText;
      if(myGen===S.gen){
        // Chương này vừa được phân tích "tay" (ngoài pipeline tuần tự) — nếu nó đang nằm
        // TRƯỚC vị trí con trỏ phân tích tuần tự, đẩy con trỏ qua khỏi nó để pipeline không
        // tự phân tích lại chương đã có snapshot này.
        if(typeof _analyzeCursor!=='undefined'&&_analyzeCursor<=i)_analyzeCursor=i+1;
      }
    }else{
      flowLog(2,`Chương ${chNum(i)}: dùng snapshot nhân vật có sẵn từ Luồng 1 (${snap.appearedChars.length} nhân vật).`);
      appearedChars=snap.appearedChars;
      characterContextText=snap.characterContextText;
    }
    if(document.getElementById('charmemDrawer')?.classList.contains('open'))renderCharList();
  }else if(isAuditEnabled()){
    // TẮT "Phân tích nhân vật" nhưng vẫn BẬT "Soát xưng hô bản dịch"/"Kiểm tra chính tả":
    // không phân tích nhân vật (không tốn API) nhưng vẫn phải đánh dấu chương này là "dịch mới, cần
    // soát" — ensureAuditPipeline() chỉ soát chương CÓ snapshot (chương không có snapshot = dịch từ
    // trước, coi như đã soát để khỏi soát ồ ạt truyện cũ). Gắn 1 snapshot RỖNG (không nhân vật, không
    // ngữ cảnh) để làm dấu; nó tự bị xoá sau khi soát xong. Đặt ở xlate() (không phải _startPreload)
    // để phủ cả 2 đường: dịch nền/preload lẫn bấm tay "Dịch"/"Dịch lại".
    if(myGen===S.gen){
      if(!S.chapterCharSnapshot)S.chapterCharSnapshot={};
      if(!S.chapterCharSnapshot[i])S.chapterCharSnapshot[i]={appearedChars:[],characterContextText:''};
    }
  }
  // Khối THỂ LOẠI của preset xưng hô (addr-presets.js) vẫn được gửi cho Luồng 2 kể cả khi TẮT "Phân tích nhân vật":
  // sắc thái thể loại không phụ thuộc bộ nhớ nhân vật. Khi không có nhân vật, buildCharacterContextText chỉ trả
  // đúng khối thể loại ('' nếu chưa chốt được preset -> hành vi cũ). getMainPromptGuidance() có cache theo hash
  // prompt, không bao giờ throw; lỗi nào ở đây cũng bị nuốt để không chặn dịch.
  if(!getCharMemOn()&&typeof buildCharacterContextText==='function'){
    try{
      const _pg=(typeof getMainPromptGuidance==='function')?await getMainPromptGuidance():undefined;
      characterContextText=buildCharacterContextText([],_pg)||'';
    }catch(e){characterContextText='';}
  }

  // Thử 1 (key, model chính) cụ thể. Nếu gặp lỗi 503/502/500, KHÔNG đổi key — thử các
  // model khác trong CẢ 3 model chính (kể cả model CAO hơn model chính hiện tại, ưu
  // tiên thử cao hơn trước — xem cycle ở trên) NGAY TRÊN CÙNG KEY NÀY, cho tới khi
  // thành công hoặc hết sạch model để thử (lúc đó mới báo cho vòng lặp ngoài chuyển
  // sang key khác).
  // Nếu gặp lỗi 429 hết quota ngày (RPD) ở BẤT KỲ model nào trong lúc thử → đổi KEY
  // KHÁC NGAY LẬP TỨC (không cố các model khác trên cùng key), vì quota ngày là hạn mức
  // riêng theo từng cặp (model, key) — không phải model đó "tệ" mà là chính key đó đã
  // dùng hết phần của model này, không liên quan gì tới model khác.
  // Trả về { success, timedOut, mainModelDayBlocked, invalidKey }
  // mainModelDayBlocked=true nghĩa là chính MODEL CHÍNH (không phải model fallback) đã
  // hết quota ngày trên key này — dùng để vòng lặp ngoài biết khi nào TẤT CẢ key đều đã
  // hết quota ngày cho model chính, từ đó mới escalate lên model chính kế tiếp.
  async function attemptOnKeyWithModelFallback(ki2,mainIdx){
    const key=keys[ki2];
    const isLiteMain=mainIdx>=mOrderMain.length;
    const mainModel=isLiteMain?LITE_MODEL:mOrderMain[mainIdx];
    // 503/502/500/RPM → thử lần lượt mainModel rồi CÁC MODEL THẤP HƠN theo thứ tự cố định trong
    // MAIN_MODELS (3.8→3.6→3 Flash), KHÔNG BAO GIỜ vòng lên model cao hơn.
    // VD: mainModel=3.6 Flash lỗi 503 → thử 3 Flash → (cuối cùng) Lite.
    // CHỈ HẠ CẤP: model hiện tại + các model THẤP hơn nó trong MAIN_MODELS (không bao giờ thử model cao hơn).
    const cycle=isLiteMain?[LITE_MODEL]:MAIN_MODELS.slice(Math.max(0,MAIN_MODELS.indexOf(mainModel)));
    let ci=0;
    // Đã thêm Lite vào cuối `cycle` để fallback lần 503 hay chưa (chỉ thêm ĐÚNG 1 LẦN
    // cho mỗi lượt gọi attemptOnKeyWithModelFallback/mỗi key) — xem nhánh isServerErr
    // bên dưới: khi các model chính đều lỗi 503/502/500 trên key này, thử thêm
    // 3.5 Flash Lite như phao cứu sinh cuối cùng trước khi mới thật sự bỏ key này.
    let triedLiteOn503=false;
    let rpmRetry=0; // số lần đã chờ-rồi-thử-lại vì 429 RPM trên key này
    while(true){
      if(S.stopReq)return{success:false};
      if(isTimedOut())return{success:false,timedOut:true};
      const model=cycle[ci];
      if(rlDayBlocked(model,key)){
        setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: hết lượt hôm nay → thử key khác`);
        return{success:false,mainModelDayBlocked:model===mainModel};
      }
      // RPM: callAPI() → Sched.acquire() tự CHỜ tới khi slot (key, model) còn chỗ — không cần kiểm tra/chờ ở đây.
      try{
        setStatus(`Dịch ch.${chNum(i)} · Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}`);
        await acquireApiLock();
        let r;
        try{ // Thay mọi tên gốc (c.origName) -> tên Việt (c.name) NGAY TRÊN BẢN SAO gửi đi dịch, ngay trước khi gọi AI.
        // ch.content / bản gốc đã lưu và hiển thị KHÔNG bị sửa (applyCharNameSubstitution chỉ trả chuỗi mới).
        const _srcForAI=(typeof applyCharNameSubstitution==='function')?applyCharNameSubstitution(applyReplace(ch.content)):applyReplace(ch.content);
        r=await callAPIFull(key,model,_srcForAI,i,ki2,keys.length,characterContextText,appearedChars); }
        finally{ releaseApiLock(); }
        if(r){
          result=r;
          consec503=0; // thành công → xoá luôn chuỗi lỗi 503 liên tiếp
          // Ghi nhớ key thành công để chương sau bắt đầu từ đây.
          S.keyIdx=ki2;
          return{success:true};
        }
      }catch(err){
        lastErr=err.message;
        // Log ra console MỌI lỗi (không chỉ 429 như trước) — status trên UI chỉ hiện
        // thoáng qua rồi bị đè ngay bởi status "chờ Xs..." ở vòng lặp ngoài, không đủ
        // thời gian để đọc; console thì luôn xem lại được (F12 → Console) để biết chính
        // xác model/key nào, lỗi gì, giúp chẩn đoán khi lỗi lặp lại liên tục.
        console.error(`[Dịch lỗi] ch.${chNum(i)} · key ...${key.slice(-6)} · ${MLBL[model]||model}:`,err.message);
        const is429=err.message.includes('429');
        const hasQuotaDayTag=err.message.includes('QUOTA_PER_DAY');
        const hasQuotaMinTag=err.message.includes('QUOTA_PER_MINUTE');
        // QUAN TRỌNG: chỉ coi là "hết quota NGÀY" khi có bằng chứng RÕ RÀNG (quotaId
        // chứa "PerDay"). Mặc định coi 429 là RPM (an toàn, có delay) trừ khi có cờ
        // PerDay rõ ràng.
        const isDailyQuota=is429&&hasQuotaDayTag;
        const isPerMin=is429&&!isDailyQuota;
        if(isDailyQuota){
          rlDayBlock(model,key);
          setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: hết lượt hôm nay → thử key khác`);
          return{success:false,mainModelDayBlocked:model===mainModel};
        }
        if(isPerMin){
          // Quy tắc: chạm RPM thì CHỜ, KHÔNG hạ model (chỉ lỗi 5xx mới hạ model — xem nhánh isServerErr bên dưới).
          // Sched.end() đã đánh dấu slot (key, model) này đầy nên mọi luồng/tab cũng sẽ chờ theo.
          // - Hết thời gian chờ slot nội bộ (CHAN_SCHED): không chờ thêm, thử key khác ngay (key khác có thể còn chỗ).
          // - 429 thật từ Google: chờ RATE429_WAIT_SEC rồi thử lại ĐÚNG model này (tối đa 1 lần/key), sau đó mới sang key khác.
          if(err.message.includes('CHAN_SCHED')){
            setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: đang bận → thử key khác`);
            return{success:false};
          }
          rpmRetry++;
          if(rpmRetry>1){
            setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: vẫn bận → thử key khác`);
            return{success:false};
          }
          setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: quá nhiều yêu cầu → thử lại sau ${RATE429_WAIT_SEC}s`);
          if(await timedWait(RATE429_WAIT_MS))return{success:false,timedOut:true};
          if(S.stopReq)return{success:false};
          continue;
        }
        const is400=err.message.includes('400');
        const isInvalidKey=is400&&(
          err.message.includes('API_KEY_INVALID')||err.message.includes('API key not valid')||
          err.message.includes('permission')
        );
        if(isInvalidKey){
          setStatus(`Key ${ki2+1}/${keys.length} · key không hợp lệ → thử key khác...`);
          return{success:false,invalidKey:true};
        }
        const isKeyBlock=is400&&(
          err.message.includes('location')||err.message.includes('USER_LOCATION')
        );
        if(isKeyBlock){
          // Dừng dịch ngay, chờ user đổi IP rồi mới tiếp tục
          setStatus('🚫 Bị chặn location — đang chờ bạn đổi IP...');
          flowLog(2,`Chương ${chNum(i)}: BỊ CHẶN LOCATION — tạm rời khỏi danh sách đang dịch, chờ người dùng đổi IP...`);
          S.xlatingSet.delete(i);updCtrl();renderCh(i);
          if(!S._shownLocationErr){
            S._shownLocationErr=true;
            await new Promise(res=>{
              _locationResumeResolve=res;
              showLocationErrPopup();
            });
          }
          // Sau khi user nhấn "Đã đổi IP": resume, retry cùng model/key
          S.xlatingSet.add(i);S.stopReq=false;
          flowLog(2,`Chương ${chNum(i)}: đã đổi IP, TIẾP TỤC dịch lại từ key ${ki2+1}/${keys.length}, model ${MLBL[model]||model}.`);
          setStatus(`Tiếp tục dịch ch.${chNum(i)} · Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}`);
          updCtrl();renderCh(i);
          continue;
        }
        // Lỗi server tạm thời (503/502/500): ĐỔI MODEL, GIỮ NGUYÊN key — ưu tiên model
        // CAO hơn trước (xem cycle ở đầu hàm; chỉ Lite nếu đang ở chế độ Lite). Nếu đã
        // xoay hết các model chính trên key này mà vẫn lỗi → báo hết cách, để vòng lặp
        // ngoài chuyển sang key khác.
        const isServerErr=err.message.includes('503')||err.message.includes('502')||
          err.message.includes('500')||err.message.toLowerCase().includes('service unavailable')||
          err.message.toLowerCase().includes('internal server');
        if(isServerErr){
          consec503++;
          // Delay CỐ ĐỊNH khi gặp 503 LIÊN TIẾP (không tăng dần theo số lần):
          // 2 lần đầu thử ngay (0s) cho nhanh, từ lần 3 trở đi luôn chờ đúng
          // SERVER_ERR_DELAY_SEC giây — đơn giản, dễ đoán, vẫn đủ giãn request.
          const SERVER_ERR_DELAY_SEC=3;
          const waitSec=consec503<=2?0:SERVER_ERR_DELAY_SEC;
          const code=err.message.match(/\d{3}/)?.[0]||'5xx';
          ci++;
          if(ci>=cycle.length){
            // Đã xoay hết các model chính trên key này mà vẫn 503/502/500 — nếu chưa
            // thử Lite (và mainIdx hiện tại chưa phải là Lite), đẩy thêm 3.5 Flash Lite
            // vào cuối cycle và thử NGAY trên CÙNG key này trước khi bỏ cuộc hẳn.
            if(!isLiteMain&&!triedLiteOn503){
              triedLiteOn503=true;
              cycle.push(LITE_MODEL);
              if(waitSec>0){
                setStatus(`Key ${ki2+1}/${keys.length} · server quá tải → thử ${MLBL[LITE_MODEL]} sau ${waitSec}s`);
                if(await timedWait(waitSec*1000))return{success:false,timedOut:true};
              }else{
                setStatus(`Key ${ki2+1}/${keys.length} · server quá tải → thử ${MLBL[LITE_MODEL]}`);
              }
              continue;
            }
            if(waitSec>0){
              setStatus(`Key ${ki2+1}/${keys.length} · server quá tải → thử key khác sau ${waitSec}s`);
              if(await timedWait(waitSec*1000))return{success:false,timedOut:true};
            }else{
              setStatus(`Key ${ki2+1}/${keys.length} · server quá tải → thử key khác`);
            }
            return{success:false};
          }
          if(waitSec>0){
            setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: server quá tải → đổi model sau ${waitSec}s`);
            if(await timedWait(waitSec*1000))return{success:false,timedOut:true};
          }else{
            setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: server quá tải → đổi model`);
          }
          continue;
        }
        setStatus(`Key ${ki2+1}/${keys.length} · ${MLBL[model]||model}: lỗi → thử key khác`);
        return{success:false};
      }
    }
  }

  // Thử 1 "model chính" (mainIdx) trên TẤT CẢ key. Mỗi key sẽ tự xoay vòng qua các
  // model fallback khi gặp 503 (xem attemptOnKeyWithModelFallback), nhưng đổi key ngay
  // khi gặp hết quota ngày.
  // Trả về { success, allDayBlocked } — allDayBlocked = true nếu MỌI key đều hết quota
  // ngày CHO CHÍNH MODEL CHÍNH này (dùng để quyết định có escalate lên model chính kế
  // tiếp hay không).
  async function tryMainModelAllKeys(mainIdx){
    const mainModel=mainIdx>=mOrderMain.length?LITE_MODEL:mOrderMain[mainIdx];
    let allDayBlocked=true;
    for(let ki=0;ki<keys.length;ki++){
      if(S.stopReq)return{success:false,allDayBlocked:false};
      if(isTimedOut())return{success:false,allDayBlocked:false,timedOut:true};
      const ki2=(S.keyIdx+ki)%keys.length;
      const r=await attemptOnKeyWithModelFallback(ki2,mainIdx);
      if(r.success)return{success:true,allDayBlocked:false};
      if(r.timedOut)return{success:false,allDayBlocked:false,timedOut:true};
      if(!r.mainModelDayBlocked)allDayBlocked=false;
    }
    if(allDayBlocked)setStatus(`${MLBL[mainModel]||mainModel}: các key đều hết lượt hôm nay → đổi model`);
    return{success:false,allDayBlocked};
  }

  // ===== VÒNG LẶP CHÍNH =====
  // - Model chính = mOrderMain[S.activeModelIdx] (hoặc Lite nếu S.activeModelIdx đã
  //   vượt quá mOrderMain, tức đã hết quota ngày ở mọi model chính trên mọi key).
  // - Hết quota ngày ở TẤT CẢ key cho model chính hiện tại → escalate model chính lên
  //   model tiếp theo (persistent, không quay lại model cấp cao hơn).
  // - Lỗi 503/502/500: xử lý NGAY BÊN TRONG mỗi key (đổi model, giữ nguyên key) — xem
  //   attemptOnKeyWithModelFallback — nên ở tầng này không cần xử lý thêm.
  // - Hết mọi cách (kể cả Lite đã hết quota ngày ở mọi key, hoặc lỗi khác xảy ra ở mọi
  //   key) → chờ 30s, reset toàn bộ đánh dấu rate-limit/quota (y như reload file) rồi
  //   thử lại từ đầu (key 1 / model 1), lặp lại cho tới khi dịch được hoặc hết
  //   CHAPTER_TIMEOUT_MS / người dùng bấm Dừng.
  let giveUp=false;
  while(!result&&!S.stopReq){
    if(isTimedOut()){giveUp=true;break;}
    const mainRes=await tryMainModelAllKeys(S.activeModelIdx);
    if(S.stopReq)break;
    if(result){
      // Vừa dịch thành công — kiểm tra bản dịch có còn sót quá nhiều tiếng Trung không
      // TRƯỚC KHI chấp nhận kết quả này (xem cjkRatio/CHAPTER_CJK_RATIO_THRESHOLD ở trên).
      const ratio=tlEn()?tlLeakRatio(ch.content,result):cjkRatio(result); // đích vi: như cũ; đích khác: sót chữ nguồn khái quát (zh/ja không bị báo oan vì Hán/Kana hợp lệ)
      if(ratio>CHAPTER_CJK_RATIO_THRESHOLD&&cjkRetryCount<MAX_CHAPTER_CJK_RETRY){
        cjkRetryCount++;
        const pct=(ratio*100).toFixed(1);
        markRetranslated(i,'cjk',`còn sót ~${pct}% (>${(CHAPTER_CJK_RATIO_THRESHOLD*100)|0}%), lần ${cjkRetryCount}/${MAX_CHAPTER_CJK_RETRY}`);
        setStatus(`⚠️ Ch.${chNum(i)} còn sót ~${pct}% ${tlEn()?'chữ nguồn':'tiếng Trung'} → dịch lại (lần ${cjkRetryCount}/${MAX_CHAPTER_CJK_RETRY})`);
        result=null; // bỏ kết quả này, quay lại vòng lặp để gọi API dịch lại nguyên chương
        continue;
      }
      // (Đã bỏ kiểm tra độ dài + popup nghi ngờ dịch sót: việc phát hiện dịch sót do dấu hiệu END_MARK trong
      // callAPIFull() đảm nhiệm, tự cắt 2 câu cuối rồi nối tiếp phần thiếu.)
      if(ratio>CHAPTER_CJK_RATIO_THRESHOLD){
        // Đã hết lượt tự động dịch lại nhưng vẫn còn sót nhiều — chấp nhận kết quả hiện tại
        // (còn hơn không có bản dịch nào) để không tốn quota vô hạn, chỉ log cảnh báo.
        const pct=(ratio*100).toFixed(1);
        console.warn(`[Xlate] Ch.${chNum(i)}: vẫn còn ~${pct}% ${tlEn()?'chữ nguồn':'ký tự Hán'} sau ${MAX_CHAPTER_CJK_RETRY} lần tự động dịch lại — chấp nhận kết quả hiện tại.`);
        flowLog(2,`Chương ${chNum(i)}: vẫn còn ~${pct}% ${tlEn()?'chữ nguồn':'ký tự Hán'} sau ${MAX_CHAPTER_CJK_RETRY} lần tự động dịch lại — chấp nhận kết quả hiện tại, không thử thêm.`);
      }
      break;
    }
    if(mainRes.timedOut){giveUp=true;break;}

    if(mainRes.allDayBlocked&&S.activeModelIdx<mOrderMain.length){
      // Còn model chính khác (hoặc Lite) để escalate lên, thử ngay trong chương này.
      S.activeModelIdx++;
      const nextLabel=S.activeModelIdx>=mOrderMain.length?MLBL[LITE_MODEL]:MLBL[mOrderMain[S.activeModelIdx]];
      setStatus(`🔄 Chuyển model chính sang ${nextLabel}...`);
      continue;
    }

    // Không escalate được nữa (đã ở Lite mà vẫn hết quota ngày mọi key, hoặc lỗi khác
    // như 503/RPM xảy ra ở mọi key) → chờ 30s, reset, thử lại từ đầu.
    const elapsedSec=Math.round((Date.now()-xlateStartTs)/1000);
    setStatus(`⏳ Ch.${chNum(i)} lỗi hết key/model → thử lại sau ${RETRY_WAIT_SEC}s`);
    if(await timedWait(RETRY_WAIT_MS)){giveUp=true;break;} // hết giờ ngay trong lúc chờ → bỏ cuộc luôn
    if(S.stopReq)break;
    resetAllRateLimitsAndQuota();
    consec503=0; // sang vòng mới → xoá luôn chuỗi 503 liên tiếp, tránh cộng dồn qua nhiều vòng
    S.activeModelIdx=0;
    markRetranslated(i,'reset',`đã chờ ${RETRY_WAIT_SEC}s, thử lại từ key 1/model 1`);
    setStatus(`🔄 Đang dịch lại ch.${chNum(i)} từ đầu`);
    // Vòng lặp ngoài sẽ tự chạy lại từ đầu (key 1) vì S.keyIdx=0
  }

  S.xlatingSet.delete(i);
  flowLog(2,`xlate() chương ${chNum(i)} kết thúc lượt gọi này sau ${Math.round((Date.now()-xlateStartTs)/1000)}s — kết quả: ${result?'THÀNH CÔNG':(giveUp?'BỎ CUỘC (hết thời gian)':'DỪNG (người dùng bấm Dừng)')}. Còn đang dịch song song: [${[...S.xlatingSet].map(chNum).join(', ')||'không có'}]`);
  // Truyện đang mở đã đổi (người dùng chuyển bộ khác) trong lúc lượt dịch này đang chờ
  // API trả về → kết quả này thuộc về truyện CŨ, không được ghi vào S.chapters/S.translations
  // của truyện hiện tại (khác chương, khác nội dung) vì sẽ gây xáo trộn dữ liệu 2 bộ.
  if(myGen!==S.gen){
    flowLog(2,`Bỏ kết quả dịch chương ${chNum(i)} — truyện đã đổi trong lúc chờ API (gen ${myGen}→${S.gen}).`);
    return;
  }
  if(result){
    // Model đôi khi vẫn chép lại tên gốc (chữ Hán) trong bản dịch dù đã được thay sẵn ở bản gửi đi -> thay nốt
    // bằng tên Việt đã chốt (chỉ origName hợp lệ, xem applyCharNameSubstitution), trước khi bước soát sót chữ Hán chạy.
    // Gán token tên nhân vật SAU khi dịch xong (AI chỉ thấy tên Việt thật) để về sau đổi tên là cả bản dịch đổi theo.
    // [TOKEN TÊN] Lưu bản dịch với tên nhân vật dạng token ⟦c:id:Tên⟧ (AI không thấy token, gán SAU khi dịch xong). Xem khối chú thích trong character-memory.js.
    S.translations[i]=tokenizeCharNames(cleanCensorChars(lockCharNames(result)));
    delete S.failed[i];
    callStatChapterDone();
    if(i===S.cur)S.showOrig=false;
    // ===== SOÁT CHẤT LƯỢNG SAU DỊCH (Luồng 3 — tách RIÊNG khỏi lượt dịch này) =====
    // Trước đây auditChapterAddressing() chạy NGAY TẠI ĐÂY (await), nghĩa là chính chương vừa
    // dịch xong phải "đứng lại" chờ thêm 1 lượt gọi API nữa mới coi là xong hẳn, dù bản dịch đã
    // có sẵn để dùng — và với dịch SONG SONG nhiều chương, nhiều lượt audit dễ bắn cùng lúc gây
    // rate limit. Giờ chỉ cần đảm bảo snapshot nhân vật đã chốt (đã có sẵn ở appearedChars nếu
    // bật Character Memory) rồi GIAO LẠI cho pipeline soát chất lượng tuần tự ở index.html xử lý
    // (không await) — xem ensureAuditPipeline(), nó tự đọc lại đúng S.chapterCharSnapshot[i] và
    // tự xoá snapshot đó sau khi soát xong để nhẹ bộ nhớ.
    // Luồng 3 giờ chạy theo 2 mục "Soát xưng hô bản dịch"/"Kiểm tra chính tả" (isAuditEnabled), KHÔNG
    // còn phụ thuộc "Phân tích nhân vật" (getCharMemOn). Vẫn gọi ensureAuditPipeline() cả khi
    // tắt soát: nó tự thoát sớm và tiện thể dọn snapshot của các chương đã dịch xong.
    if(typeof ensureAuditPipeline==='function'){
      if(isAuditEnabled())flowLog(2,`Chương ${chNum(i)}: đã dịch xong, giao cho Luồng 3 (soát chất lượng) xử lý tiếp — không chờ ở đây.`);
      ensureAuditPipeline();
    }
    setStatus(`💠 Đã dịch xong ${chTitleDisp(i)}`); // ưu tiên tiêu đề ĐÃ DỊCH (chưa có mới rơi về tiêu đề gốc)
    (typeof saveSessionSoon==='function'?saveSessionSoon:saveSession)(); // gom lưu (xem saveSessionSoon trong index.html) — tránh libGet/libPut cả cuốn sau MỖI chương
  } else {
    // Tới đây khi: (a) người dùng chủ động bấm Dừng giữa lúc đang retry, hoặc
    // (b) tự động bỏ cuộc sau ~10 phút lỗi liên tục dù đã thử hết key/model.
    // Chỉ đánh dấu "lỗi" khi tự bỏ cuộc (hết thời gian). Người dùng bấm Dừng thì KHÔNG đánh dấu:
    // trước đây S.failed[i]=true cũng được set ở nhánh Dừng nên chương bị coi là chương lỗi và
    // không còn tự động dịch lại khi mở/đọc tới cho tới khi tải lại trang.
    if(giveUp)S.failed[i]=true;
    else{delete S.failed[i];if(S.autoFailed)delete S.autoFailed[i];S.preloading.delete(i);}
    if(giveUp){
      // Đánh dấu riêng: chương này KHÔNG được tự động dịch lại khi người dùng
      // đọc tới (nav()) — chỉ dịch lại khi họ chủ động bấm Dịch/Dịch lại.
      if(!S.autoFailed)S.autoFailed={};
      S.autoFailed[i]=true;
      setStatus(`⚠️ Ch.${chNum(i)}: lỗi liên tục → tạm bỏ qua. Bấm 'Dịch' để thử lại.`);
      // Báo popup ngay cả khi đây là 1 chương preload ở phía trước (chưa đọc tới),
      // miễn là nó là chương lỗi GẦN NHẤT tính từ chương đang đọc trở đi — xem
      // checkNearestFailedPreload(). Nếu đang có 1 popup lỗi khác gần hơn đang hiện,
      // hàm này sẽ không đè lên; chương này sẽ tự được báo sau khi chương gần hơn
      // được đóng/dịch xong/hoặc bị vượt qua.
      checkNearestFailedPreload();
    } else {
      setStatus(`⏹️ Đã dừng dịch ch.${chNum(i)}: ${lastErr.slice(0,120)}`);
    }
    // tự hiển thị bản gốc khi dừng/bỏ cuộc
    if(i===S.cur){S.showOrig=true;}
  }
  updChItem(i);
  if(i===S.cur)renderCh(i);
  // updCtrl() đọc S.xlatingSet.has(S.cur) — chỉ ảnh hưởng nút Dịch/Dừng/Dịch lại nếu ĐÚNG
  // chương đang xem vừa kết thúc lượt dịch này; gọi lại vô hại (no-op về mặt hiển thị) khi
  // đây là 1 chương KHÁC đang dịch song song ở nền, nên cứ gọi đều sau mỗi lượt cho chắc.
  updCtrl();
  // Sau mỗi lượt dịch/preload (dù thành công hay thất bại): kiểm tra lại xem popup
  // "chương lỗi" đang hiện (nếu có) còn hợp lệ không, và có chương lỗi nào gần chương
  // đang đọc hơn cần báo tiếp không (VD: chương i vừa dịch xong/hết lỗi → tự đóng
  // popup của nó và chuyển sang báo chương lỗi kế tiếp).
  checkNearestFailedPreload();
  return !!result;
}

// system (tuỳ chọn, tham số thứ 6): chỉ dẫn hệ thống tách khỏi lượt của người dùng — Gemini: systemInstruction,
// DeepSeek: message role "system". Hiện chỉ chatbot.js dùng (để luật/ngữ cảnh không nằm chung với câu hỏi người dùng).
// ===== [PROGRESS Phase 0+1] Che key + đo số lượt gọi API theo loại =====
// Che mọi chuỗi giống API key trong text sắp log/hiển thị (Gemini "AIza...", tham số ?key=..., Bearer ...).
function scrubSecrets(t){
  return String(t==null?'':t)
    .replace(/([?&]key=)[^&\s"']+/gi,'$1***')
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g,'AIza***')
    .replace(/(Bearer\s+)[^\s"']+/gi,'$1***');
}
function maskKey(k){k=String(k||'');return k.length>4?'***'+k.slice(-4):'***';}
// Đếm lượt gọi THẬT tới API (mỗi lần thử 1 key = 1 lượt), gom theo nhãn loại + model thực sự trả kết quả.
// Nhãn: translate, translate-cont, title (Luồng 2); extract, extract-fb, extract-retry, judge, judge-fb, verify,
// verify-fb, distill, stubborn (Luồng 1); audit (Luồng 3). Gọi charmemQuota* cũ vẫn hoạt động song song.
const CALL_STATS={by:{},chapters:0,since:Date.now()};
function callStatErrKind(m){m=String(m||'');return m.includes('QUOTA_PER_DAY')?'429-ngay':/^429|\b429\b/.test(m)?'429-phut':m.includes('TIMEOUT')?'timeout':'loi';}
function callStatCount(purpose,model,status,ms){
  try{
    const k=(purpose||'khac')+'|'+model+'|'+status;
    const o=CALL_STATS.by[k]||(CALL_STATS.by[k]={n:0,ms:0});
    o.n++;o.ms+=ms||0;
  }catch(_){}
}
function callStatChapterDone(){CALL_STATS.chapters++;}
function callStatTotals(st){
  st=st||CALL_STATS;const per={};let total=0;
  Object.keys(st.by).forEach(k=>{const [pu,,status]=k.split('|');const n=st.by[k].n;total+=n;(per[pu]=per[pu]||{ok:0,err:0})[status==='ok'?'ok':'err']+=n;});
  return {per,total,chapters:st.chapters};
}
function callStatReport(){
  const t=callStatTotals();
  const rows=Object.keys(t.per).sort().map(pu=>({loai:pu,ok:t.per[pu].ok,loi:t.per[pu].err}));
  console.table(rows);
  const avg=t.chapters?(t.total/t.chapters).toFixed(2):'n/a';
  console.log(`[CallStat] Tổng ${t.total} lượt / ${t.chapters} chương xong → TB ${avg} lượt/chương (từ khi nạp trang ${Math.round((Date.now()-CALL_STATS.since)/60000)} phút)`);
  return {total:t.total,chapters:t.chapters,perChapter:avg,per:t.per};
}
// Ghi mốc baseline (lưu localStorage để so sánh sau khi tối ưu): chạy callStatSaveBaseline() sau khi dịch ~10-20 chương.
function callStatSaveBaseline(){
  const t=callStatTotals();
  try{localStorage.setItem('callStatBaseline',JSON.stringify({at:new Date().toISOString(),total:t.total,chapters:t.chapters,per:t.per}));}catch(_){}
  console.log('[CallStat] Đã lưu baseline:',t);return t;
}
function callStatCompare(){
  let b=null;try{b=JSON.parse(localStorage.getItem('callStatBaseline')||'null');}catch(_){}
  const now=callStatReport();
  if(!b){console.log('[CallStat] Chưa có baseline — chạy callStatSaveBaseline() trước khi tối ưu.');return now;}
  const bAvg=b.chapters?(b.total/b.chapters).toFixed(2):'n/a';
  console.log(`[CallStat] Baseline ${bAvg} lượt/chương (${b.total}/${b.chapters}) → Hiện tại ${now.perChapter} lượt/chương`);
  return {baseline:b,now};
}
if(typeof window!=='undefined'){window.callStatReport=callStatReport;window.callStatSaveBaseline=callStatSaveBaseline;window.callStatCompare=callStatCompare;}

// purpose (tham số thứ 7, tuỳ chọn): nhãn loại lượt gọi để thống kê — không ảnh hưởng hành vi.
// Vòng đệm ~20 lỗi API gần nhất cho Trợ lý AI (lệnh tra cứu get_recent_errors trong chatbot.js đọc window.__ntErrorLog).
// CHỈ lưu dữ liệu có cấu trúc (mã lỗi, loại, model, nhãn, số thứ tự key, thời điểm) — KHÔNG lưu message thô và KHÔNG lưu giá trị key.
const NT_ERR_LOG_MAX=20;
function ntLogApiError(key,model,purpose,e){
  try{
    const m=String((e&&e.message)||'');
    const codeM=m.match(/\b([45]\d\d)\b/);
    const stM=m.match(/\b(RESOURCE_EXHAUSTED|UNAVAILABLE|INVALID_ARGUMENT|PERMISSION_DENIED|DEADLINE_EXCEEDED|INTERNAL|API_KEY_INVALID|QUOTA_PER_DAY|TIMEOUT)\b/);
    let keyNo=0;
    try{if(typeof getKeys==='function')keyNo=getKeys().indexOf(key)+1;}catch(_){}
    const log=window.__ntErrorLog||(window.__ntErrorLog=[]);
    log.push({t:Date.now(),code:codeM?codeM[1]:'',kind:callStatErrKind(m),st:stM?stM[1]:'',model:String(model||''),purpose:String(purpose||''),keyNo});
    if(log.length>NT_ERR_LOG_MAX)log.splice(0,log.length-NT_ERR_LOG_MAX);
  }catch(_){}
}
async function callAPI(key,model,messages,maxTokOverride,thinkMode,system,purpose,opts){
  const t0=Date.now();
  // [Sched] Mọi request Gemini đều đi qua đây. Caller đã Sched.acquire() thì truyền opts.schedTok (không đếm đôi);
  // chưa thì ở đây tự acquire: CHỜ tới khi slot (key, model) còn chỗ (Flash 5, Lite 15 / 60s), rồi mới gửi. DeepSeek không áp dụng.
  let _st=(opts&&opts.schedTok)||null;
  try{
    if(!_st&&typeof Sched!=='undefined')_st=await Sched.acquire(key,model,purpose);
    const r=await _callAPIRaw(key,model,messages,maxTokOverride,thinkMode,system,opts);
    callStatCount(purpose,model,'ok',Date.now()-t0);
    if(_st)Sched.end(_st,null);
    return r;
  }catch(e){
    if(_st)Sched.end(_st,e);
    if(e&&e.name==='AbortError')throw e; // người dùng bấm Dừng: không phải lỗi API → không thống kê/ghi log lỗi
    callStatCount(purpose,model,callStatErrKind(e&&e.message),Date.now()-t0);
    ntLogApiError(key,model,purpose,e);
    if(e&&e.message)e.message=scrubSecrets(e.message);
    throw e;
  }
}

// opts (tuỳ chọn, chỉ Gemini): {json:true} -> responseMimeType:'application/json' (giảm xác suất JSON hỏng; DeepSeek bỏ qua).
// ===== STREAMING (giai đoạn 3 nâng cấp chatbot) =====
// Chỉ bật khi nơi gọi truyền opts.onChunk(fullTextSoFar, piece) — các chỗ gọi cũ (dịch, character-memory...) KHÔNG truyền nên chạy y như trước.
// opts.signal (AbortSignal, tuỳ chọn) để người dùng bấm "Dừng". Lỗi TRƯỚC khi nhận chữ đầu tiên đi qua đúng đường xử lý lỗi cũ (xoay key/retry).
// Đọc luồng SSE (Server-Sent Events): gọi onEvent(obj) cho từng dòng "data: {...}" (JSON 1 dòng). Bỏ qua chú thích/keep-alive và "[DONE]".
async function ntReadSSE(res,onEvent){
  const handleLine=(line)=>{
    line=line.trim();
    if(!line.startsWith('data:'))return;
    const p=line.slice(5).trim();
    if(!p||p==='[DONE]')return;
    let o;try{o=JSON.parse(p);}catch(_){return;}
    onEvent(o);
  };
  // Trình duyệt không cho đọc từng phần (res.body.getReader không có) → đọc trọn rồi phân tích 1 lần: vẫn đúng, chỉ không "chạy chữ".
  if(!res.body||typeof res.body.getReader!=='function'){
    (await res.text()).split(/\r?\n/).forEach(handleLine);
    return;
  }
  const reader=res.body.getReader();const dec=new TextDecoder();let buf='';
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      buf+=dec.decode(value,{stream:true});
      let i;
      while((i=buf.indexOf('\n'))>=0){handleLine(buf.slice(0,i));buf=buf.slice(i+1);}
    }
    buf+=dec.decode();
    if(buf)handleLine(buf);
  }catch(e){try{reader.cancel();}catch(_){}throw e;}
}
async function ntStreamGemini(res,opts){
  let full='',finishReason='STOP';
  await ntReadSSE(res,(d)=>{
    if(d&&d.error)throw new Error(`${d.error.code||500}: ${String(d.error.message||'stream error').slice(0,300)}`);
    const cand=d&&d.candidates&&d.candidates[0];
    if(!cand)return;
    const parts=(cand.content&&cand.content.parts)||[];
    const piece=parts.filter(p=>p&&typeof p.text==='string'&&!p.thought).map(p=>p.text).join('');
    if(piece){full+=piece;try{opts.onChunk(full,piece);}catch(_){}}
    if(cand.finishReason)finishReason=cand.finishReason;
  });
  if(!full)throw new Error('API không trả về nội dung');
  return {text:full,finishReason};
}
async function ntStreamDeepseek(res,opts){
  let full='',fr='';
  await ntReadSSE(res,(d)=>{
    if(d&&d.error)throw new Error(`${d.error.code||500}: ${String(d.error.message||'stream error').slice(0,300)}`);
    const ch=d&&d.choices&&d.choices[0];
    if(!ch)return;
    const piece=ch.delta&&typeof ch.delta.content==='string'?ch.delta.content:''; // bỏ qua delta.reasoning_content (suy luận nội bộ)
    if(piece){full+=piece;try{opts.onChunk(full,piece);}catch(_){}}
    if(ch.finish_reason)fr=ch.finish_reason;
  });
  if(!full)throw new Error('API không trả về nội dung');
  return {text:full,finishReason:fr==='length'?'MAX_TOKENS':'STOP'};
}
async function _callAPIRaw(key,model,messages,maxTokOverride,thinkMode,system,opts){
  // DeepSeek dùng API khác hẳn Gemini (OpenAI-compatible: messages{role,content} thay vì
  // contents{role,parts:[{text}]}, header Authorization Bearer thay vì ?key=) — tách riêng hàm,
  // TỰ CHUYỂN ĐỔI định dạng messages ở đây để mọi nơi gọi callAPI() (callAPIFull, character-memory.js)
  // không cần biết/quan tâm đang dùng AI nào, cứ luôn dựng messages theo định dạng Gemini như cũ.
  // thinkMode: 'fast' | 'normal' | 'deep' (mặc định 'normal' nếu bỏ trống) — đọc từ lựa chọn
  // "Chế độ dịch" của người dùng (xem getTranslateMode() trong index.html), áp dụng cho CẢ 2 AI
  // (trước đây tham số này chỉ có tác dụng với DeepSeek, Gemini luôn tự quyết qua
  // shouldDisableThinking() — giờ Gemini cũng đọc thinkMode, xem bên dưới).
  if(model.startsWith('deepseek'))return callDeepseekAPI(key,model,messages,maxTokOverride,thinkMode,system,opts);
  const maxTok=maxTokOverride||parseInt(document.getElementById('maxTokens').value)||65536;
  // Không gửi temperature/top_p/top_k: các tham số này đã bị Google deprecated
  // cho toàn bộ dòng Gemini 3.x, và với các model đời mới (như gemini-3.5-flash-lite)
  // gửi kèm sẽ bị API trả về lỗi 400 (INVALID_ARGUMENT) thay vì chỉ bị bỏ qua như trước.
  const genCfg={maxOutputTokens:maxTok};
  // CHỈ áp dụng thinkingConfig cho 3 model đã xác nhận hỗ trợ tham số thinkingLevel ổn định.
  // "gemini-3-flash-preview" KHÔNG nằm trong nhánh if này (như từ trước tới giờ) — model
  // preview có thể không nhận thinkingLevel đúng cách ở "Bình thường"/"Nghĩ kỹ", nên 2 mức đó
  // vẫn KHÔNG áp gì cho model này (giữ nguyên hành vi cũ, model tự chạy mặc định HIGH). Riêng
  // "Nhanh, linh hoạt" (fast) VẪN áp thinkingLevel:minimal cho model này ở nhánh else if ngay
  // dưới — minimal đã được Google xác nhận hỗ trợ ổn định ngay từ khi ra mắt model (không nằm
  // trong diện nghi ngờ như 2 mức kia), và đây cũng là model mặc định của tool nên nếu không
  // áp thì chọn "Nhanh, linh hoạt" trên model mặc định sẽ hoàn toàn không có tác dụng gì.
  if(model==='gemini-3.8-flash'||model==='gemini-3.6-flash'||model==='gemini-3.5-flash-lite'||model==='gemini-3.1-flash-lite'){
    // Tự động ép "fast" nếu tên prompt đang active khớp từ khoá trong prompt-thinking-override.js
    // (file tuỳ chọn — nếu không có file đó, typeof check bên dưới sẽ bỏ qua an toàn, không lỗi).
    // Override này có độ ưu tiên CAO HƠN "Chế độ dịch" người dùng chọn thủ công — mục đích ban
    // đầu là tự động tránh bị AI từ chối nhầm với 1 số prompt/thể loại truyện nhạy cảm cụ thể.
    let effMode=(typeof shouldDisableThinking==='function'&&shouldDisableThinking())?'fast':(thinkMode||'normal');
    // Dùng thinkingLevel (chuẩn mới của Google cho dòng Gemini 3.x) thay vì thinkingBudget (kiểu cũ).
    // Lưu ý: KHÔNG được gửi cả thinkingLevel lẫn thinkingBudget cùng lúc (sẽ bị lỗi 400).
    if(effMode==='fast')genCfg.thinkingConfig={thinkingLevel:'minimal'};
    else if(effMode==='deep')genCfg.thinkingConfig={thinkingLevel:'high'};
    // 'normal': không set thinkingConfig, để model tự dùng mức mặc định
    // (medium cho 3.6/3.5 Flash, minimal cho 3.5 Flash Lite — tương đương "dynamic" cũ)
  }else if(model==='gemini-3-flash-preview'){
    // Nhánh riêng cho model preview — chỉ xử lý "fast", cố tình KHÔNG có else if 'deep' (xem
    // giải thích ở trên): "Bình thường" và "Nghĩ kỹ" đều rơi qua nhánh này mà không set gì cả.
    const effMode=(typeof shouldDisableThinking==='function'&&shouldDisableThinking())?'fast':(thinkMode||'normal');
    if(effMode==='fast')genCfg.thinkingConfig={thinkingLevel:'minimal'};
  }
  if(opts&&opts.json)genCfg.responseMimeType='application/json';
  const reqBody={contents:messages,generationConfig:genCfg};
  if(system)reqBody.systemInstruction={parts:[{text:String(system)}]};
  // Công cụ Gemini tuỳ chọn (vd [{google_search:{}}] cho Trợ lý AI tra cứu trên mạng). Không truyền → y như cũ.
  if(opts&&Array.isArray(opts.tools))reqBody.tools=opts.tools;
  // [Phase 0] Key đặt trong header x-goog-api-key thay vì ?key=... để KHÔNG lộ trong URL (log console/Network/lỗi trình duyệt).
  const streaming=!!(opts&&typeof opts.onChunk==='function');
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${streaming?'streamGenerateContent?alt=sse':'generateContent'}`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(reqBody),signal:opts&&opts.signal});
  if(!res.ok){
    const e=await res.text();
    // Phân biệt chính xác 429 do hết quota/NGÀY (RPD) hay do gọi dồn dập/PHÚT (RPM)
    // bằng cách đọc field "quotaId" trong JSON lỗi gốc (không bị cắt bớt), vì Google
    // trả về rõ ràng dạng "...PerDay..." hoặc "...PerMinute..." trong đó.
    // Cắt message ở 300 ký tự (như cũ) thường làm mất field này → nhận nhầm mọi 429
    // thành "hết quota ngày". Gắn cờ QUOTA_PER_DAY/QUOTA_PER_MINUTE để xử lý ở nơi gọi.
    let quotaTag='';
    try{
      const ej=JSON.parse(e);
      const details=ej?.error?.details||[];
      const violations=details.flatMap(d=>Array.isArray(d.violations)?d.violations:[]);
      const qid=violations.map(v=>v.quotaId||'').join('|');
      if(/PerDay/i.test(qid))quotaTag='QUOTA_PER_DAY';
      else if(/PerMinute/i.test(qid))quotaTag='QUOTA_PER_MINUTE';
    }catch(_){/* không phải JSON hoặc thiếu field → bỏ qua, dùng fallback heuristic cũ */}
    if(res.status===429){
      // Log đầy đủ (không cắt) toàn bộ body lỗi gốc, kèm nhãn đã phân loại được,
      // để tiện so sánh trực tiếp 429-RPD khác gì 429-RPM/không rõ loại.
      // Log 1 dòng tóm tắt loại 429; body đầy đủ vẫn lấy được bằng window.__last429Full (status, details, quota_limit_value...).
      window.__last429Full=scrubSecrets(e);
      let _kind='rate limit (không rõ loại)',_extra='';
      try{
        const er=JSON.parse(e)?.error;
        const md=(er?.details||[]).find(d=>d&&d.metadata)?.metadata||{};
        const unit=String(md.quota_unit||''),lim=String(md.quota_limit||'');
        if(quotaTag==='QUOTA_PER_DAY'||/day/i.test(unit)||/PerDay/i.test(lim))_kind='hết quota NGÀY';
        else if(quotaTag==='QUOTA_PER_MINUTE'||/min/i.test(unit)||/PerMinute/i.test(lim))_kind='rate limit mỗi PHÚT';
        if(String(md.quota_limit_value)==='0')_extra=' | limit=0 (key/project này không có quota cho model)';
      }catch(_){/* không phải JSON -> giữ nhãn mặc định */}
      console.warn(`[429] ${_kind} | model=${model} key=${maskKey(key)}${_extra}`);
    }
    throw new Error(`${res.status}${quotaTag?' '+quotaTag:''}: ${e.slice(0,300)}`);
  }
  if(streaming)return await ntStreamGemini(res,opts);
  const d=await res.json();
  const grounded=!!(opts&&Array.isArray(opts.tools));
  const cand=d?.candidates?.[0];
  // Có công cụ (tìm kiếm) → câu trả lời có thể gồm nhiều part: nối hết các part chữ; còn lại giữ cách cũ (part đầu tiên).
  const text=grounded?(cand?.content?.parts||[]).map(p=>(p&&typeof p.text==='string'&&!p.thought)?p.text:'').join(''):cand?.content?.parts?.[0]?.text;
  const finishReason=cand?.finishReason||'STOP';
  if(!text)throw new Error('API không trả về nội dung');
  if(grounded){
    const gm=cand?.groundingMetadata||{};
    const sources=(gm.groundingChunks||[]).map(c=>({title:String(c?.web?.title||''),uri:String(c?.web?.uri||'')})).filter(s=>s.uri||s.title);
    return {text,finishReason,sources,queries:Array.isArray(gm.webSearchQueries)?gm.webSearchQueries:[]};
  }
  return {text,finishReason};
}

// Gọi DeepSeek (OpenAI-compatible: POST /chat/completions, key trong header Authorization).
// messages đầu vào vẫn ở định dạng Gemini {role,parts:[{text}]} (do callAPIFull/character-memory.js
// dựng chung 1 kiểu cho cả 2 AI) — tự chuyển sang {role,content} của OpenAI ở đây.
async function callDeepseekAPI(key,model,messages,maxTokOverride,thinkMode,system,opts){
  const maxTok=maxTokOverride||parseInt(document.getElementById('maxTokens').value)||65536;
  const oaMessages=messages.map(m=>({
    role:m.role==='model'?'assistant':m.role,
    content:(m.parts||[]).map(p=>p.text||'').join(''),
  }));
  if(system)oaMessages.unshift({role:'system',content:String(system)});
  // "model" ở đây có thể là model ẢO "deepseek-v4-flash-quality" (xem DEEPSEEK_MODELS) — khác
  // tên với model THẬT gửi lên API DeepSeek (giữ tách riêng chỉ vì lý do rate-limit/quota
  // tracking — xem comment ở DEEPSEEK_MODELS phía trên). Map lại đúng tên thật trước khi gửi
  // đi, giữ nguyên "model" gốc cho mọi chỗ khác (status hiển thị, rate-limit tracking...).
  const realModel=DEEPSEEK_REAL_MODEL[model]||model;
  const body={model:realModel,messages:oaMessages,max_tokens:maxTok};
  // DeepSeek V4 (Flash/Pro) mặc định BẬT thinking ở mức "high" — kể cả câu hỏi 1 dòng cũng tốn
  // hàng trăm token suy luận trước khi trả lời (xem api-docs.deepseek.com/guides/thinking_mode).
  // Map "Chế độ dịch" (thinkMode) sang tham số thinking thật của DeepSeek:
  //  - 'fast'   → "thinking":{"type":"disabled"} — tắt hẳn, dùng cho lượt gọi nhẹ (dịch tiêu
  //               đề, phân tích nhân vật...) hoặc khi người dùng chủ động chọn ưu tiên tốc độ.
  //  - 'normal' → không gửi gì, để mặc định "high" của DeepSeek tự áp dụng.
  //  - 'deep'   → "reasoning_effort":"max" — mức suy luận sâu nhất DeepSeek hỗ trợ (cao hơn cả
  //               "high" mặc định), dùng khi người dùng chọn "Nghĩ kỹ".
  if(thinkMode==='fast')body.thinking={type:'disabled'};
  else if(thinkMode==='deep')body.reasoning_effort='max';
  const streaming=!!(opts&&typeof opts.onChunk==='function');
  if(streaming)body.stream=true;
  const res=await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify(body),
    signal:opts&&opts.signal,
  });
  if(!res.ok){
    const e=await res.text();
    throw new Error(`${res.status}: ${e.slice(0,300)}`);
  }
  if(streaming)return await ntStreamDeepseek(res,opts);
  const d=await res.json();
  const choice=d?.choices?.[0];
  const text=choice?.message?.content;
  // OpenAI dùng finish_reason:'length' khi bị cắt do hết token — quy về 'MAX_TOKENS' để tái
  // dùng nguyên logic "bù đoạn" đã có trong callAPIFull (vốn viết theo quy ước của Gemini).
  const finishReason=choice?.finish_reason==='length'?'MAX_TOKENS':'STOP';
  if(!text)throw new Error('API không trả về nội dung');
  return {text,finishReason};
}

// Loại bỏ ký tự kiểm duyệt: · chèn giữa từ (g·iết) và ~ ở cuối âm tiết (a~ ưm~)
function cleanCensorChars(t){
  // Xóa · chèn giữa các ký tự chữ cái (kể cả tiếng Việt có dấu)
  t=t.replace(/([a-zA-ZÀ-ỹ\u0300-\u036f])·([a-zA-ZÀ-ỹ\u0300-\u036f])/g,'$1$2');
  // Lặp lại để xử lý chuỗi nhiều · liên tiếp (g·i·ế·t)
  let prev='';
  while(prev!==t){prev=t;t=t.replace(/([a-zA-ZÀ-ỹ\u0300-\u036f])·([a-zA-ZÀ-ỹ\u0300-\u036f])/g,'$1$2');}
  // Xóa · còn sót lại đứng riêng lẻ bên cạnh chữ (trường hợp ở đầu/cuối từ)
  t=t.replace(/·([a-zA-ZÀ-ỹ\u0300-\u036f])/g,'$1');
  t=t.replace(/([a-zA-ZÀ-ỹ\u0300-\u036f])·/g,'$1');
  // Xóa ~ theo sau âm tiết (a~ ưm~ kiểu đó) — giữ ~ đứng độc lập
  t=t.replace(/([a-zA-ZÀ-ỹ\u0300-\u036f])~(\s|$)/g,'$1$2');
  // Xóa ~ đứng trước dấu cách hoặc cuối chuỗi, sau chữ số
  t=t.replace(/([0-9])~(\s|$)/g,'$1$2');
  return t;
}

// Gắn tag giới tính ⟦Nam⟧/⟦Nữ⟧ ngay sau tên/alias của nhân vật ĐÃ BIẾT giới tính, ngay trong văn bản
// gốc trước khi gửi AI dịch chính — giúp model "nhớ" đúng đại từ/xưng hô NGAY TẠI ĐIỂM cần dùng, thay
// vì soát/sửa lại sau (job "gender_pronoun" ở Luồng 3 đã bỏ, xem character-memory.js). Dùng ký hiệu
// ⟦⟧ (ngoặc vuông kép toán học U+27E6/27E7) thay vì 《》 vì 《》 là dấu ngoặc kép sách/tên riêng THẬT
// trong văn bản Trung — AI dễ hiểu nhầm là cụm cần giữ/dịch, còn ⟦⟧ gần như không xuất hiện tự nhiên
// trong truyện và không nằm trong bảng etNormalizeCjkPunct (index.html) nên không bị biến đổi.
// Dùng lại findMatchPositions/normalizeGenderValue của character-memory.js (cùng global scope trang
// web — thứ tự nạp script không ảnh hưởng vì hàm chỉ thực sự được GỌI lúc runtime, sau khi mọi script
// đã nạp xong; khác với lỗi TRÙNG TÊN cleanCensorChars/cleanDecorChars đã sửa ở edit-text.js, đó là
// vấn đề 2 hàm cùng tên đè nhau chứ không phải thứ tự nạp).
function insertGenderTags(text,appearedChars){
  if(!text||!appearedChars||!appearedChars.length)return text;
  const targets=[];
  appearedChars.forEach(c=>{
    if(typeof normalizeGenderValue!=='function')return;
    const g=normalizeGenderValue(c.gender);
    if(g!=='Nam'&&g!=='Nữ')return;
    const tag=g==='Nam'?'⟦Nam⟧':'⟦Nữ⟧';
    [c.name,...(c.aliases||[])].forEach(n=>{
      if(n&&n.trim().length>=2)targets.push({name:n.trim(),tag});
    });
  });
  if(!targets.length||typeof findMatchPositions!=='function')return text;
  // Tên dài xử lý trước để tránh chèn lồng (VD "Ngô Thừa Ân" trước "Ân").
  targets.sort((a,b)=>b.name.length-a.name.length);
  let out=text;
  targets.forEach(({name,tag})=>{
    const wordBoundaryOnly=!/\s/.test(name);
    const positions=findMatchPositions(out,name,wordBoundaryOnly);
    // Chèn từ vị trí CUỐI lên đầu để không làm lệch index của các vị trí chèn trước đó.
    for(let i=positions.length-1;i>=0;i--){
      const idx=positions[i];
      const afterIdx=idx+name.length;
      // Vị trí này đã có tag ngay sau rồi (do 1 tên/alias DÀI HƠN xử lý trước đó đã chèn) — trường
      // hợp điển hình: alias "Ân" trùng đúng vào đuôi tên đầy đủ "Ngô Thừa Ân" đã được gắn tag. Bỏ
      // qua để tránh gắn tag chồng 2 lần lên CÙNG 1 lần xuất hiện.
      if(/^⟦(Nam|Nữ)⟧/.test(out.slice(afterIdx)))continue;
      out=out.slice(0,afterIdx)+tag+out.slice(afterIdx);
    }
  });
  return out;
}
// Lưới an toàn cơ học: dù đã dặn prompt, vẫn xoá cứng mọi tag ⟦Nam⟧/⟦Nữ⟧ lỡ bị model chép lại vào
// bản dịch trả về — phòng khi model không tuân đúng chỉ dẫn.
// Dấu hiệu "đã dịch hết chương": prompt dặn model ghi dòng này sau câu dịch cuối. Thiếu dấu hiệu
// (dù finishReason=STOP) nghĩa là model bỏ dở giữa chừng → callAPIFull() xin nối tiếp phần còn thiếu.
// ===== Đích ≠ vi: các prompt PHỤ có nhánh tiếng Anh (nhánh vi giữ NGUYÊN VĂN, không đổi byte) =====
// Token kỹ thuật ⟦Nam⟧/⟦Nữ⟧/⟦END⟧ giữ nguyên vì regex phía dưới phụ thuộc vào chúng; chỉ câu giải thích đổi sang tiếng Anh.
function tlEn(){try{return !!(window.TargetLang&&!TargetLang.isVi());}catch(e){return false;}}
function tlFill(x){try{return TargetLang.fill(x);}catch(e){return x;}}
// Dấu hiệu hết chương: MỘT hằng duy nhất ⟦END⟧ cho mọi ngôn ngữ đích (đây là giao thức app↔model, không phải chữ người đọc thấy).
// Nhận diện kiểu "khoan dung": [[END]], [END], 【END】, **⟦END⟧**, ⟦ end ⟧, ngoặc cụt ("⟦END"), END trơ trọi ở dòng cuối.
// VẪN nhận cả dạng cũ HẾT (⟦HẾT⟧, [HẾT]...) để bản dịch dở/cache/backup tạo bằng bản trước không bị coi là thiếu dấu hiệu.
const END_MARK='⟦END⟧';
const END_BR_SRC='[*_`~]*[\\[\\u27E6\\u3010\\u3016\\u3014\\u300A]{1,3}\\s*[*_`~]*(?:END|H[\\u1EBE\\u1EBF]T)[*_`~]*\\s*[\\]\\u27E7\\u3011\\u3017\\u3015\\u300B]{1,3}[*_`~]*';
const END_OPEN_SRC='[*_`~]*[\\[\\u27E6\\u3010\\u3016\\u3014\\u300A]{1,3}\\s*[*_`~]*(?:END|H[\\u1EBE\\u1EBF]T)[*_`~]*\\s*$';
const END_BARE_SRC='(?:^|\\n)[ \\t]*[*_`~]*(?:END|H[\\u1EBE\\u1EBF]T)[*_`~]*[ \\t]*\\s*$';
const END_RE=new RegExp(END_BR_SRC+'|'+END_OPEN_SRC+'|'+END_BARE_SRC,'i');
const END_STRIP_BR_RE=new RegExp('[ \\t]*'+END_BR_SRC+'[ \\t]*','gi');
const END_STRIP_OPEN_RE=new RegExp(END_OPEN_SRC,'i');
const END_STRIP_BARE_RE=new RegExp(END_BARE_SRC,'i');
function endMk(){return END_MARK;}
function endHas(t){return END_RE.test(t);}
const END_MARK_NOTE='\n\nLƯU Ý KỸ THUẬT (ngoại lệ duy nhất cho ký hiệu ⟦…⟧): sau câu dịch cuối cùng của chương, xuống dòng và ghi đúng một dòng '+END_MARK+' — chỉ để báo đã dịch đến hết câu cuối của văn bản gốc; chỉ ghi khi thật sự đã dịch hết, không thêm gì sau nó.';
function endMarkNote(){
  return tlEn()
    ?'\n\nTECHNICAL NOTE (the only exception to the rule about ⟦…⟧ markers): after the final sentence of the translation, start a new line and write exactly one line '+endMk()+' — only to signal that you have translated up to the very last sentence of the source text; write it only when you have truly finished, and add nothing after it.'
    :END_MARK_NOTE;
}
const MAX_TAIL_CONT=2; // tối đa 2 lượt xin nối tiếp khi thiếu dấu hiệu hết chương
function stripGenderTags(t){
  if(typeof t!=='string')return t;
  t=t.normalize('NFC'); // gộp dạng tổ hợp (NFD) về dựng sẵn để regex "HẾT" khớp chắc chắn
  const hadEnd=endHas(t);
  t=t.replace(/⟦(Nam|Nữ)⟧/g,'').replace(END_STRIP_BR_RE,'').replace(END_STRIP_OPEN_RE,'').replace(END_STRIP_BARE_RE,'');
  return hadEnd?t.replace(/\s+$/,''):t;
}
// Nối phần tiếp vào bản dịch dở: nếu bản dở đã kết thúc ở cuối câu mà phần tiếp không bắt đầu bằng
// khoảng trắng thì xuống dòng, tránh dính 2 câu/2 đoạn vào nhau.
// Chống lặp khi nối phần tiếp: model hay "viết lại" câu/đoạn cuối của bản dịch dở ở đầu phần tiếp
// (VD bản dở dừng ở "...nhìn từ trên", phần tiếp lại mở đầu bằng "Nếu có người nhìn từ trên cao xuống...").
// Trả về chuỗi đã nối và đã cắt phần lặp; trả về null nếu không phát hiện lặp.
//  (1) Phần tiếp bắt đầu lại từ 1 đoạn nằm trong phần cuối bản dở (lặp cả câu/đoạn trước đó) → cắt bản dở
//      từ chỗ đó rồi thay bằng phần tiếp.
//  (2) Phần đầu phần tiếp trùng khít với phần ĐUÔI bản dở (chồng lấn) → bỏ phần trùng.
// ===== LOG CHƯƠNG BỊ DỊCH LẠI =====
// Mọi lý do khiến 1 chương phải gọi API dịch lại đều đi qua markRetranslated(): in 1 dòng nổi bật ở Console (F12)
// + lưu vào window.RetransLog để xem lại. Xem nhanh:  RetransLog.list()  |  RetransLog.table()  |  RetransLog.clear()
// Lý do: 'manual' (bấm Dịch lại), 'cjk' (còn sót chữ nguồn), 'repeat' (câu bị lặp), 'reset' (hết key/model → reset thử lại), 'title' (dịch lại tiêu đề).
window.RetransLog=window.RetransLog||(function(){
  const arr=[];
  return {
    add(e){arr.push(e);if(arr.length>500)arr.shift();},
    list(){return arr.slice();},
    table(){try{console.table(arr.map(e=>({time:e.time,chương:e.chNum,lý_do:e.reason,chi_tiết:e.detail})));}catch(x){}return arr.length;},
    clear(){arr.length=0;},
    chapters(){return [...new Set(arr.map(e=>e.chNum))];}
  };
})();
const RETRANS_REASON_LABEL={manual:'người dùng bấm Dịch lại',cjk:'còn sót chữ nguồn',repeat:'sửa riêng câu bị lặp (không dịch lại cả chương)',reset:'lỗi mọi key/model → reset & thử lại',title:'dịch lại tiêu đề'};
function markRetranslated(i,reason,detail){
  try{
    const n=(typeof chNum==='function')?chNum(i):(i+1);
    const time=new Date().toLocaleTimeString('vi-VN',{hour12:false});
    window.RetransLog.add({time,idx:i,chNum:n,reason,detail:detail||''});
    const msg=reason==='repeat'
      ?`🩹 CHƯƠNG ${n}: sửa riêng câu bị lặp (KHÔNG dịch lại cả chương)${detail?' — '+detail:''}`
      :`🔁 CHƯƠNG ${n} BỊ DỊCH LẠI — ${RETRANS_REASON_LABEL[reason]||reason}${detail?' ('+detail+')':''}`;
    if(typeof flowLog==='function')flowLog(2,msg);
    console.warn('%c[DỊCH LẠI]%c '+msg,'background:#ef4444;color:#fff;font-weight:bold;padding:1px 4px;border-radius:3px','color:inherit');
  }catch(e){}
}

// ===== CHỐNG LẶP CÂU (lưới an toàn cơ học, chạy trên bản dịch cuối) =====
// Dạng lỗi gặp: «... phát ra tiếng "âm thanh kinh ngạc phát ra tiếng "Hử?" ...» — 1 cụm từ (>=3 từ) bị chép 2 lần liền nhau,
// giữa 2 lần chỉ có khoảng trắng/dấu ngoặc. Nguyên nhân: (a) model "nói lắp" ngay trong 1 lượt sinh; (b) chỗ nối phần dịch tiếp
// (MAX_TOKENS / thiếu ⟦END⟧) model viết lại vài từ cuối của phần trước mà khử trùng không bắt được.
// Chỉ áp cho ngôn ngữ phân tách bằng khoảng trắng (cụm >=3 từ, >=14 ký tự) nên không đụng chữ Hán/Kana. Mọi lần sửa đều được log.
const REPEAT_PHRASE_RE=/([\p{L}\p{N}][\p{L}\p{N}]*(?:[ \t]+[\p{L}\p{N}]+){2,11}?)([ \t]*["“”'‘’«»(\[]{0,2}[ \t]*)\1(?![\p{L}\p{N}])/gu;
function collapseRepeats(text){
  if(typeof text!=='string'||text.length<30)return{text,count:0,samples:[]};
  let count=0;const samples=[];
  // (1) cụm từ lặp liền kề: «P "P rest» → «P rest» (giữ lần xuất hiện SAU, vì phần đi kèm dấu ngoặc nằm sau nó)
  let out=text,guard=0,changed=true;
  while(changed&&guard++<6){
    changed=false;
    out=out.replace(REPEAT_PHRASE_RE,(m,p1,sep)=>{
      if(p1.length<14)return m;
      count++;changed=true;
      if(samples.length<5)samples.push(m.length>90?m.slice(0,90)+'…':m);
      return p1;
    });
  }
  // (2) dòng/đoạn giống hệt dòng ngay trước (>=20 ký tự) → bỏ bản lặp
  const lines=out.split('\n'),kept=[];
  for(const ln of lines){
    const t=ln.trim();
    if(t.length>=20&&kept.length&&kept[kept.length-1].trim()===t){count++;if(samples.length<5)samples.push('[đoạn lặp] '+(t.length>70?t.slice(0,70)+'…':t));continue;}
    kept.push(ln);
  }
  return{text:kept.join('\n'),count,samples};
}
// Tác giả CỐ Ý lặp câu (VD «你给我滚！你给我滚！», «Chạy đi! Chạy đi!») thì bản dịch lặp theo là ĐÚNG. Nên đối chiếu với BẢN GỐC:
// nếu văn bản gốc tự nó có đoạn (>=4 ký tự) lặp liền kề, coi chương này có lặp chủ ý → KHÔNG tự sửa và KHÔNG tự dịch lại vì lặp.
// (Ngôn ngữ-trung lập: so theo ký tự, cho phép khoảng trắng/dấu câu/ngoặc giữa 2 lần lặp.)
const SRC_REPEAT_RE=/(\p{L}[^\n]{3,59}?)[\s"“”'‘’「」『』«»()\[\]，,。.！!？?、…:：;；\-—]{0,4}\1/gu;
function countSourceRepeats(src){
  if(typeof src!=='string')return 0;
  src=src.replace(/⟦(?:Nam|Nữ)⟧/g,'');
  const m=src.match(SRC_REPEAT_RE);
  return m?m.length:0;
}
// ===== SỬA CÂU LẶP BẰNG MODEL LITE (chỉ gửi câu nghi lặp + câu trước/sau, KHÔNG dịch lại cả chương) =====
// 1) Quét bản dịch tìm chỗ lặp (cụm >=3 từ chép 2 lần liền nhau / dòng giống hệt dòng trước).
// 2) Với mỗi chỗ: lấy CÂU chứa chỗ lặp + 1 câu trước + 1 câu sau, gửi 1 lượt duy nhất (gộp mọi chỗ của chương) cho 3.5 Flash Lite
//    (DeepSeek: deepseek-flash). AI quyết định: lặp HỢP Ý (điệp ngữ/nhấn mạnh của tác giả) → giữ; LỖI → trả lại câu đã sửa.
// 3) Thay đúng câu đó vào bản dịch (chỉ khi câu gửi đi còn khớp nguyên văn + bản sửa qua kiểm tra an toàn).
// AI lỗi/hết quota → lùi về cách cơ học (collapseRepeats) nhưng CHỈ khi bản gốc không lặp chủ ý.
const REPEAT_REVIEW_MAX=12;
function _sentenceBounds(text){
  const B=[0],re=/[.!?…。！？]+["”’'»)\]」』]*(?:[ \t]+|$)|\n+/g;let m;
  while((m=re.exec(text))){
    const end=m.index+m[0].length;
    if(m[0][0]!=='\n'&&end<text.length&&/\p{Ll}/u.test(text[end]))continue; // «"Hử?" vô cùng...» — chữ thường theo sau: chưa hết câu
    if(end>B[B.length-1])B.push(end);
  }
  if(B[B.length-1]<text.length)B.push(text.length);
  return B;
}
function _repeatCandidates(text){
  const spans=[],B=_sentenceBounds(text);
  const sentAt=(pos)=>{let i=0;while(i<B.length-2&&B[i+1]<=pos)i++;return i;};
  const clip=(a,b,pos,len)=>{ // câu quá dài → chỉ lấy cửa sổ quanh chỗ lặp, cắt ở khoảng trắng
    if(b-a<=700)return [a,b];
    let x=Math.max(a,pos-250),y=Math.min(b,pos+len+250);
    const sx=text.lastIndexOf(' ',x+1);if(sx>=a&&x-sx<40)x=sx+1;
    const sy=text.indexOf(' ',y);if(sy!==-1&&sy<b&&sy-y<40)y=sy;
    return [x,y];
  };
  const seen=new Set();
  const push=(kind,pos,len,dup)=>{
    const i=sentAt(pos);let a=B[i],b=B[i+1];
    [a,b]=clip(a,b,pos,len);
    const lead=text.slice(a,b).match(/^\s*/)[0].length;a+=lead;
    const t=text.slice(a,b).replace(/\s+$/,'');b=a+t.length;
    if(!t||seen.has(a+':'+b))return;seen.add(a+':'+b);
    const pa=i>0?text.slice(B[i-1],B[i]).trim():'',na=B[i+2]!==undefined?text.slice(B[i+1],B[i+2]).trim():'';
    spans.push({kind,start:a,end:b,text:t,dup,before:pa.slice(-300),after:na.slice(0,300)});
  };
  const re=new RegExp(REPEAT_PHRASE_RE.source,'gu');let m;
  while((m=re.exec(text))){if(m[1].length>=14)push('phrase',m.index,m[0].length,m[1]);}
  let off=0;const lines=text.split('\n'),prevT=[];
  lines.forEach((ln,li)=>{const t=ln.trim();
    if(t.length>=20&&li>0&&lines[li-1].trim()===t)spans.push({kind:'line',start:off,end:off+ln.length,text:ln,dup:t.slice(0,60),before:lines[li-1].trim().slice(-300),after:(lines[li+1]||'').trim().slice(0,300)});
    off+=ln.length+1;});
  return spans.sort((x,y)=>x.start-y.start);
}
function _fixSafe(orig,fixed,kind){
  if(typeof fixed!=='string')return false;
  fixed=fixed.trim();
  if(!fixed)return kind==='line'; // chỉ dòng lặp nguyên dòng mới được xoá hẳn
  if(fixed.length<orig.length*0.4||fixed.length>orig.length*1.15)return false;
  if(!hasCJKLeak(orig)&&hasCJKLeak(fixed))return false;
  const re=new RegExp(REPEAT_PHRASE_RE.source,'gu');let m;
  while((m=re.exec(fixed)))if(m[1].length>=14)return false; // bản sửa vẫn còn lặp
  const w=x=>x.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const ow=new Set(w(orig));const fw=w(fixed);
  if(fw.length&&fw.filter(x=>ow.has(x)).length/fw.length<0.8)return false; // AI viết lại/dịch lại thay vì chỉ bỏ phần lặp
  return true;
}
async function reviewRepeatsLite(text,ctx){
  const chIdx=ctx.chIdx,res={text,found:0,fixed:0,kept:0,ai:true};
  let spans=_repeatCandidates(text);
  // Chỉ coi là BẤT THƯỜNG (đáng gửi AI) chỗ lặp của bản dịch mà bản gốc KHÔNG lặp ở cùng PHẦN chương (1/5, 2/5...).
  // Bản gốc cũng lặp ở đó (cả câu hoặc 1 phần) → tác giả cố ý, bản dịch lặp theo là đúng → bỏ qua.
  if(ctx.srcInfo&&ctx.srcInfo.set.size){
    const before=spans.length;
    spans=spans.filter(sp=>!ctx.srcInfo.set.has(_zoneOf(sp.start,text.length)));
    res.skippedIntentional=before-spans.length;
  }
  res.found=spans.length;
  if(!spans.length)return res;
  const mech=()=>{ // dự phòng cơ học
    if(ctx.srcRep>0)return res; // gốc có lặp chủ ý, AI không xem được → để nguyên
    const c=collapseRepeats(text);res.text=c.text;res.fixed=c.count;res.ai=false;return res;
  };
  const batch=spans.slice(0,REPEAT_REVIEW_MAX);
  const en=tlEn();
  const items=batch.map((x,i)=>({id:i,before:x.before,text:x.text,after:x.after,repeated:x.dup}));
  const prompt=en
    ?'You are a copy editor for a machine-translated web novel. Each item has the sentence "text" (with a suspicious repetition of the phrase in "repeated"), plus the sentence before and after it for context. For each item decide: (a) the repetition is INTENTIONAL and reads naturally (rhetorical repetition, emphasis, echo, stutter of a character) → keep; or (b) it is a TRANSLATION ERROR (accidental duplicate wording) → fix it. If fixing: return the full "text" sentence with ONLY the redundant repeated part removed/merged; keep every meaning, name, punctuation and quotation mark; do not re-translate, paraphrase or add anything. '+'Return ONLY a JSON array: [{"id":0,"keep":true}] or [{"id":0,"keep":false,"fixed":"<corrected sentence>"}], one element per item.\n\nItems:\n'+JSON.stringify(items)
    :'Bạn là biên tập viên chỉnh bản dịch truyện (dịch máy). Mỗi mục gồm câu "text" (có nghi ngờ lặp cụm từ ghi ở "repeated") kèm câu TRƯỚC ("before") và câu SAU ("after") để hiểu ngữ cảnh. Với mỗi mục hãy quyết định: (a) chỗ lặp là CỐ Ý và đọc tự nhiên (điệp ngữ, nhấn mạnh, tiếng vọng, nhân vật nói lắp có chủ đích) → giữ nguyên; hay (b) là LỖI DỊCH (chép thừa/lặp ngoài ý muốn) → sửa. Nếu sửa: trả về ĐẦY ĐỦ câu "text" đã sửa, CHỈ bỏ/gộp phần lặp thừa; giữ nguyên mọi ý, tên riêng, dấu câu, ngoặc kép; không dịch lại, không diễn đạt lại, không thêm ý. '+'CHỈ trả về 1 mảng JSON: [{"id":0,"keep":true}] hoặc [{"id":0,"keep":false,"fixed":"<câu đã sửa>"}], mỗi mục đúng 1 phần tử.\n\nCác mục:\n'+JSON.stringify(items);
  const prov=(typeof getProvider==='function')?getProvider():'gemini';
  const model=prov==='deepseek'?DEEPSEEK_LITE_MODEL:GEMINI_LITE_MODEL;
  const keys=[ctx.key,...getKeys().filter(k=>k!==ctx.key)].filter(Boolean);
  let out=null;
  for(const k of keys.slice(0,3)){
    if(rlDayBlocked(model,k))continue;
    try{
      await acquireApiLock();
      let r;
      try{r=await callAPI(k,model,[{role:'user',parts:[{text:prompt}]}],Math.min(8192,1024+batch.length*500),'fast',undefined,'repeatfix',{json:true});}
      finally{releaseApiLock();}
      const jm=String(r.text||'').match(/\[[\s\S]*\]/);
      if(jm){out=JSON.parse(jm[0]);break;}
    }catch(e){
      if(e&&e.message&&e.message.includes('429')&&e.message.includes('QUOTA_PER_DAY'))rlDayBlock(model,k);
      console.warn('[Repeat-fix] '+(MLBL[model]||model)+' lỗi:',e&&e.message);
    }
  }
  if(!Array.isArray(out))return mech();
  // Áp dụng từ CUỐI lên ĐẦU để chỉ số start/end của các câu phía trước không bị lệch.
  const decided=new Map(out.filter(o=>o&&Number.isInteger(o.id)).map(o=>[o.id,o]));
  let t=text;const logs=[];
  for(let i=batch.length-1;i>=0;i--){
    const sp=batch[i],d=decided.get(i);
    if(!d||d.keep!==false){res.kept++;continue;}
    if(t.slice(sp.start,sp.end)!==sp.text||!_fixSafe(sp.text,d.fixed,sp.kind)){res.kept++;continue;}
    const fx=String(d.fixed).trim();
    t=t.slice(0,sp.start)+fx+t.slice(sp.end);
    res.fixed++;logs.push(`«${sp.text.length>70?sp.text.slice(0,70)+'…':sp.text}» → «${fx.length>70?fx.slice(0,70)+'…':fx}»`);
  }
  res.text=t;res.samples=logs.reverse().slice(0,4);
  return res;
}
// Chia chương thành REPEAT_ZONES PHẦN bằng nhau theo tổng KÝ TỰ (bản gốc và bản dịch đều chia theo tỉ lệ vị trí 0–100%).
// Bản gốc lặp ở phần k và bản dịch cũng lặp ở phần k → coi là tương ứng (tác giả cố ý). Không phụ thuộc số đoạn/số dòng của 2 bản.
const REPEAT_ZONES=5;
function _zoneOf(pos,len){return len>0?Math.min(REPEAT_ZONES-1,Math.max(0,Math.floor(pos/len*REPEAT_ZONES))):0;}
// Tập các PHẦN (0..4) của bản gốc có chỗ lặp (lặp trọn câu hay 1 phần, kể cả 2 câu cạnh nhau; lặp vắt qua ranh giới phần tính cho cả 2 phần).
function sourceRepeatZones(src){
  const set=new Set();
  if(typeof src!=='string'||!src)return{set};
  src=src.replace(/⟦(?:Nam|Nữ)⟧/g,'');
  const re=new RegExp(SRC_REPEAT_RE.source,'gu');let m;
  while((m=re.exec(src))){
    const z0=_zoneOf(m.index,src.length),z1=_zoneOf(m.index+m[0].length-1,src.length);
    for(let z=z0;z<=z1;z++)set.add(z);
    if(m[0].length===0)re.lastIndex++;
  }
  return{set};
}
// Kết quả chống lặp của lượt callAPIFull() gần nhất cho từng chương (xlate() đọc để log / quyết định dịch lại).
const _repeatFixes={};
// Chỉ dẫn chống lặp gắn vào prompt dịch (mọi preset, mọi ngôn ngữ đích) — cả ở lượt đầu lẫn lượt nối tiếp.
// ===== Tách phần "Xưng hô" trong prompt người dùng (CHỈ đích tiếng Việt) =====
// Nếu prompt có mục tiêu đề "Xưng hô" (các dạng: "* Xưng hô", "1. Xưng hô", "III. Xưng hô", "## Xưng hô", "**Xưng hô**", "XƯNG HÔ:",
// "2. XƯNG HÔ VÀ DANH XƯNG"...) thì toàn bộ mục đó (từ tiêu đề tới tiêu đề cùng cấp kế tiếp) được chép lặp ở CUỐI yêu cầu dịch,
// thay cho khối câu hỏi tự kiểm tra. Không có mục này → dùng lại khối câu hỏi cũ.
const _ADDR_TITLE_RE=/^(?:(?:quy tắc|quy định|cách|nguyên tắc|các quy tắc|hướng dẫn|yêu cầu|về|phần|mục)\s+)*xưng hô(?:\s*(?:,|và|&|\/|-|–|—)\s*(?:danh xưng|đại từ(?: nhân xưng)?|cách gọi|ngôi kể|thân phận|quan hệ|vai vế|nhân vật|chức danh))*\s*(?:\([^)]*\))?\s*:?$/;
function _hdrStripBold(s){return s.replace(/^\s*(\*{1,3}|_{2,3})(.*?)\1\s*:?\s*$/,'$2').trim();}
function _hdrParse(line){
  let s=String(line).replace(/\r/g,''),t=_hdrStripBold(s.trim()),kind='none',lvl=0,m;
  if((m=/^(#{1,6})\s*(.*)$/.exec(t))){kind='#';lvl=m[1].length;t=m[2];}
  else if((m=/^([*\-•+])\s+(.*)$/.exec(t))){kind='b'+m[1];t=m[2];}
  t=_hdrStripBold(t);
  if((m=/^(?:(?:mục|phần|bước|chương)\s+)?(\d+(?:\.\d+)*|[IVXLCDM]{1,7}|[A-Za-z])\s*[.):]\s+(.*)$/i.exec(t))){
    const n=m[1],nk=/^\d/.test(n)?'num':(/^[IVXLCDM]{2,7}$/i.test(n)||/^[IVX]$/.test(n))?'rom':'let';
    if(kind!=='#')kind=nk; // "## 1. Xưng hô" vẫn tính là tiêu đề markdown
    t=_hdrStripBold(m[2]);
  }
  t=t.replace(/\s*:\s*$/,'').trim();
  return {kind:kind,lvl:lvl,text:t};
}
function _hdrIsUpper(s){return s===s.toUpperCase()&&s!==s.toLowerCase();}
function _hdrTitleLike(s){return s.length>0&&s.length<=70&&!/[.!?;,]$/.test(s)&&s.split(/\s+/).length<=10;}
function extractAddressSections(promptText){
  const lines=String(promptText||'').split('\n'),n=lines.length,out=[];
  let i=0;
  while(i<n){
    const p=_hdrParse(lines[i]);
    const prevBlank=i===0||!lines[i-1].trim();
    if(lines[i].trim()&&_ADDR_TITLE_RE.test(p.text.toLowerCase())&&(p.kind!=='none'||prevBlank||_hdrIsUpper(p.text))){
      let j=i+1;
      for(;j<n;j++){
        if(!lines[j].trim())continue;
        const q=_hdrParse(lines[j]),pb=!lines[j-1].trim();
        if(!_hdrTitleLike(q.text)||q.kind==='none'&&!(_hdrIsUpper(q.text)||pb))continue;
        const lev=(k)=>k==='#'?1:(k==='num'||k==='rom'||k==='let')?2:3; // # > đánh số > gạch đầu dòng/thường
        let ends=false;
        if(p.kind==='#')ends=q.kind==='#'&&q.lvl<=p.lvl;
        else if(p.kind==='num'||p.kind==='rom'||p.kind==='let')ends=q.kind===p.kind||q.kind==='#'||(lev(q.kind)<lev(p.kind));
        else ends=q.kind===p.kind&&(pb||_hdrIsUpper(q.text))||q.kind==='#'||q.kind==='num'||q.kind==='rom'&&(pb||_hdrIsUpper(q.text));
        if(ends&&(pb||_hdrIsUpper(q.text)||q.kind==='#'))break;
      }
      const txt=lines.slice(i,j).join('\n').replace(/\s+$/,'');
      if(txt.split('\n').length>1)out.push(txt);
      i=j;continue;
    }
    i++;
  }
  return out;
}
function addressRulesNote(promptText){
  if(tlEn())return ''; // chỉ áp dụng cho đích tiếng Việt
  let secs=[];try{secs=extractAddressSections(promptText);}catch(e){secs=[];}
  if(!secs.length)return '';
  return '\n\n---\nQUY TẮC XƯNG HÔ (chép lại nguyên văn từ yêu cầu ở đầu — áp dụng nghiêm ngặt khi dịch chương trên; bộ nhớ nhân vật và bảng xưng hô ở trên vẫn được ưu tiên hơn; TUYỆT ĐỐI KHÔNG chép lại phần quy tắc này vào bản dịch):\n'+secs.join('\n\n');
}
// [Dự phòng] Câu hỏi tự kiểm tra: CHỈ dùng khi đích không phải tiếng Việt, hoặc prompt tiếng Việt không có mục "Xưng hô" để chép lặp (xem addressRulesNote).
// Gắn dưới nội dung chương (sau bảng nhân vật, trước ghi chú kỹ thuật): giúp AI nhớ lại các điều kiện khi dịch
// (xưng hô, danh xưng, tên riêng, đại từ ngôi thứ ba) ngay lúc sắp sinh bản dịch. Luôn gắn, không phụ thuộc preset prompt.
// Dặn rõ "trả lời thầm" để KHÔNG xuất câu hỏi/câu trả lời ra bản dịch (đầu ra vẫn chỉ là bản dịch + dấu hiệu hết chương).
function recallQuestionsNote(){
  return tlEn()
    ?'\n\n---\nSELF-CHECK QUESTIONS BEFORE TRANSLATING (answer them silently in your head — NEVER write the questions or your answers in the output; the output stays the translation only):\n'
      +'1. For every line of dialogue or inner thought: who is speaking to whom, and what is their relationship (age, rank, status, close or distant, friendly or hostile)?\n'
      +'2. How does each speaker refer to THEMSELVES and address the OTHER person — per the character list, the instructions at the top, and earlier chapters? Is my wording exactly that, and not a stronger, more formal, more archaic or more arrogant form than the source text actually uses? (If the source uses only a plain pronoun, translate it with the matching plain form — do not upgrade it on your own.)\n'
      +'3. Am I keeping each pair\'s form of address unchanged throughout the chapter, changing it only if the plot of this chapter truly changes their relationship or attitude?\n'
      +'4. Are all titles, ranks and ways of calling people consistent with the character list from the start to the end of the chapter?\n'
      +'5. Are names of people, places, organizations and other proper nouns rendered exactly as already established?\n'
      +'6. Does every third-person pronoun match the gender and role of the character it refers to?'
    :'\n\n---\nCÂU HỎI TỰ KIỂM TRA TRƯỚC KHI DỊCH (hãy tự trả lời thầm trong đầu, TUYỆT ĐỐI KHÔNG viết câu hỏi hay câu trả lời ra — kết quả vẫn chỉ gồm bản dịch):\n'
      +'1. Ở mỗi lời thoại / đoạn nội tâm: ai đang nói với ai, quan hệ giữa họ là gì (tuổi tác, vai vế, địa vị, thân hay sơ, thân thiện hay đối địch)?\n'
      +'2. Mỗi người tự xưng và gọi đối phương thế nào theo bảng nhân vật, yêu cầu ở đầu và các chương trước? Từ ngữ mình dùng đã ĐÚNG như vậy chưa, và có đang mạnh hơn, trang trọng hơn, cổ hơn hay kiêu ngạo hơn so với cách xưng hô thực sự có trong bản gốc không? (Bản gốc chỉ dùng đại từ thường thì dịch bằng cách xưng hô thường tương ứng, không tự nâng cấp.)\n'
      +'3. Cách xưng hô của từng cặp nhân vật có được giữ nguyên suốt chương không? Chỉ đổi khi cốt truyện trong chương thực sự đổi quan hệ hoặc thái độ của họ.\n'
      +'4. Mọi danh xưng, chức danh, cách gọi người khác đã khớp bảng nhân vật và nhất quán từ đầu đến cuối chương chưa?\n'
      +'5. Tên người, địa danh, tổ chức và các danh từ riêng khác đã dùng đúng cách dịch/phiên âm đã chốt chưa?\n'
      +'6. Mọi đại từ ngôi thứ ba có khớp giới tính và vai của nhân vật được nhắc tới không?';
}
function antiRepeatNote(){
  return tlEn()
    ?'\n\nANTI-REPETITION RULES (apply to every sentence you write): translate each source sentence exactly ONCE. Never write the same word, phrase, clause or sentence twice in a row, and never restate a phrase just before quoting it (wrong: «he let out a gasp of surprise, he let out a gasp "Huh?"» — right: «he let out a gasp of surprise, "Huh?"»). For sound words, exclamations and quoted speech, write the quote once, in place, right after the verb that introduces it. Do not re-translate or paraphrase the sentence you have just finished. Before finishing, silently re-read your output and delete any duplicated wording.'
    :'\n\nQUY TẮC CHỐNG LẶP (áp dụng cho MỌI câu bạn viết): mỗi câu của văn bản gốc chỉ dịch ĐÚNG MỘT LẦN. Tuyệt đối không viết cùng một từ, cụm từ, mệnh đề hay câu hai lần liền nhau; không nhắc lại cụm từ ngay trước khi mở ngoặc kép trích lời (SAI: «âm thanh kinh ngạc phát ra tiếng "âm thanh kinh ngạc phát ra tiếng "Hử?"» — ĐÚNG: «âm thanh kinh ngạc phát ra tiếng "Hử?"»). Với từ tượng thanh, tiếng thốt, lời thoại: chỉ viết lời trích MỘT lần, đặt ngay sau động từ dẫn. Không dịch lại hay diễn đạt lại câu vừa viết xong. Trước khi kết thúc, hãy âm thầm đọc lại bản dịch và xoá mọi chỗ bị lặp từ/lặp câu.';
}
// Nhắc thêm ở lượt xin nối tiếp: phần trả về sẽ được NỐI THẲNG vào sau đoạn đã có.
function contNoNoRepeatNote(){
  return tlEn()
    ?'\n\nIMPORTANT: your reply is pasted directly after that passage. Begin with the very next NEW word of the translation — never repeat, quote or re-translate any word of the passage above, not even its last few words.'
    :'\n\nQUAN TRỌNG: phần bạn trả về sẽ được NỐI THẲNG vào sau đoạn trên. Hãy bắt đầu bằng từ MỚI kế tiếp của bản dịch — tuyệt đối không lặp lại, không trích lại, không dịch lại bất kỳ từ nào của đoạn trên, kể cả vài từ cuối.';
}
function dedupeOverlap(a,b){
  if(!a||!b)return null;
  const bt=b.replace(/^\s+/,'');
  if(bt.length<8)return null;
  const isW=ch=>!!ch&&/[\p{L}\p{N}]/u.test(ch);
  // (1) đầu phần tiếp xuất hiện lại trong ~1500 ký tự cuối của bản dở
  const WIN=1500,win=a.length>WIN?a.slice(-WIN):a,base=a.length-win.length;
  let probe=bt.slice(0,40);
  const sp=probe.lastIndexOf(' ');
  if(probe.length===40&&sp>=15)probe=probe.slice(0,sp); // không cắt giữa từ
  if(probe.length>=15){
    const idx=win.replace(/[“”„«»]/g,'"').replace(/[‘’‚]/g,"'").lastIndexOf(probe.replace(/[“”„«»]/g,'"').replace(/[‘’‚]/g,"'"));
    if(idx>=0&&(!isW(win[idx-1])||probe.length>=20))return a.slice(0,base+idx)+bt; // đoạn trùng >=20 ký tự thì khớp cả khi bắt đầu giữa 1 từ (VD model chép lại "i tính mạng..." từ giữa chữ "nổi")
  }
  // (2) hậu tố của bản dở == tiền tố của phần tiếp (ít nhất 8 ký tự, khớp ở ranh giới từ)
  // Sửa: bỏ khoảng trắng CUỐI bản dở trước khi so (trước đây bản dở kết thúc bằng "\n"/" " làm phép so endsWith hụt → câu bị lặp),
  // và coi “ ” ‘ ’ « » ngang với " ' (cùng độ dài nên giữ nguyên chỉ số).
  const aTrim=a.replace(/\s+$/,'');
  const nq=x=>x.replace(/[“”„«»]/g,'"').replace(/[‘’‚]/g,"'");
  const aN=nq(aTrim),btN=nq(bt);
  const maxK=Math.min(aTrim.length,bt.length,600);
  for(let k=maxK;k>=8;k--){
    if(k<14){ // đoạn chồng lấn ngắn mới cần khớp ở ranh giới từ; đủ dài (>=14 ký tự) thì khớp nguyên văn là đủ tin cậy
      if(isW(bt[k-1])&&isW(bt[k]))continue;      // k cắt giữa 1 từ của phần tiếp
      if(isW(aTrim[aTrim.length-k-1])&&isW(aTrim[aTrim.length-k]))continue; // đầu đoạn chồng lấn nằm giữa 1 từ của bản dở
    }
    if(aN.endsWith(btN.slice(0,k)))return aTrim+bt.slice(k);
  }
  return null;
}
function joinTail(a,b){
  if(!b)return a;
  const dd=dedupeOverlap(a,b);
  if(dd!==null)return dd;
  if(/\s$/.test(a)||/^\s/.test(b))return a+b;
  return /[.!?…"”'’)»」』。！？]$/.test(a)?a+'\n'+b:a+b;
}

// Cắt bỏ n câu cuối của bản dịch dở (tới dấu kết câu hoặc xuống dòng) để AI dịch lại từ đó cho chắc — tránh nối vào giữa câu
// đang dở rồi sinh câu lặp. Câu đang dở (chưa có dấu kết câu) tính là 1 câu. Trả về phần giữ lại (kèm khoảng trắng ngay sau điểm cắt)
// hoặc null nếu không nên cắt (quá ngắn / không tìm được ranh giới / phải xoá quá nhiều).
function trimLastSentences(t,n=2){
  if(typeof t!=='string')return null;
  const s=t.replace(/\s+$/,'');
  const B=[];let prev=0;
  for(const m of s.matchAll(/[.!?…。！？]+["'”’)»」』\]]*(?=\s|$)|(?=\n)/g)){
    const e=m.index+m[0].length;
    if(e<=prev||!s.slice(prev,e).trim())continue;
    B.push(e);prev=e;
  }
  if(!B.length)return null;
  const complete=B[B.length-1]===s.length;
  const idx=complete?B.length-1-n:B.length-n;
  if(idx<0)return null;
  const keepEnd=B[idx];
  if(keepEnd<80||s.length-keepEnd>1500)return null;
  return s.slice(0,keepEnd)+(s.slice(keepEnd).match(/^\s*/)||[''])[0];
}

// Dịch đầy đủ 1 chương, tự động bù nếu bị MAX_TOKENS
// Khối nhân vật gửi 1 LẦN, đặt sau bản gốc; phía trước chỉ có dòng nhắc ngắn dưới đây.
function charBlockHeadHint(){return tlEn()?'\n\n---\nThe character list and addressing notes are placed AFTER the source text, right before the translation request. Read them before translating.':'\n\n---\nBảng nhân vật và xưng hô nằm Ở CUỐI, sau bản gốc, ngay trước yêu cầu dịch. Hãy đọc kỹ trước khi dịch.';}
async function callAPIFull(key,model,origContent,chIdx,ki,kTotal,characterContextText,appearedChars){
  const prompt=(window.TargetLang&&typeof getActivePresetId==='function')?TargetLang.pickPrompt(getPrompt(),getActivePresetId()):getPrompt(); // đích vi: = getPrompt() nguyên văn
  const MAX_CONT=8; // tối đa 8 lần tiếp nối để tránh vòng lặp vô tận
  // Làm sạch ký tự kiểm duyệt trong bản gốc trước khi gửi AI
  origContent=cleanCensorChars(origContent);
  // Gắn tag giới tính ⟦Nam⟧/⟦Nữ⟧ ngay sau tên nhân vật (xem insertGenderTags phía trên) — thay cho
  // job "gender_pronoun" đã bỏ khỏi Luồng 3.
  const origBeforeGenderTags=origContent;
  origContent=insertGenderTags(origContent,appearedChars);
  const hasGenderTags=origContent!==origBeforeGenderTags;
  const genderTagNote=hasGenderTags
    ?(tlEn()?'\n\n---\nTECHNICAL NOTE: The markers ⟦Nam⟧/⟦Nữ⟧ that appear right after some character names in the source text are ONLY gender annotations (⟦Nam⟧ = male, ⟦Nữ⟧ = female) to help you choose the correct pronouns and forms of address. NEVER translate them, and NEVER keep them (or any variant of them) in the translation in any form.':'\n\n---\nLƯU Ý KỸ THUẬT: Các ký hiệu ⟦Nam⟧/⟦Nữ⟧ xuất hiện ngay sau một số tên nhân vật trong văn bản gốc CHỈ là chú thích giới tính để bạn dịch đúng đại từ/xưng hô — TUYỆT ĐỐI KHÔNG dịch, không giữ lại các ký hiệu này (hay bất kỳ biến thể nào của chúng) dưới bất kỳ hình thức nào trong bản dịch.')
    :'';
  // Character Memory: đính kèm thông tin nhân vật liên quan SAU bản gốc, ngay trước câu "Hãy dịch..." —
  // nhắc đúng lúc model chuẩn bị sinh bản dịch (tận dụng hiệu ứng recency). Trước bản gốc chỉ thêm
  // charBlockHeadHint(): 1 dòng báo bảng nhân vật nằm ở cuối.
  // Ghi chú cho AI / quy tắc sửa văn bản do người dùng nhập ở popup "Sửa văn bản" (riêng từng truyện, xem
  // etGetAiNote() trong edit-text.js) — đi CHUNG khối với thông tin nhân vật (charBlock) nên cũng đặt ở CUỐI,
  // sau bản gốc, ngay trước câu "Hãy dịch…", và giữ nguyên ở các lượt xin nối tiếp bên dưới.
  // Không có ghi chú thì chuỗi rỗng, prompt y như cũ.
  let aiNoteText='';
  try{aiNoteText=(typeof etGetAiNote==='function')?etGetAiNote():'';}catch(e){}
  const aiNoteBlock=aiNoteText
    ?(tlEn()?'\n\n---\nUSER NOTES FOR THIS NOVEL — follow the text-editing rules below when translating (unless they conflict with the instructions at the top):\n':'\n\n---\nGHI CHÚ CỦA NGƯỜI DÙNG CHO TRUYỆN NÀY — hãy tuân thủ các quy tắc sửa văn bản dưới đây khi dịch (nếu không mâu thuẫn với yêu cầu ở đầu):\n')+aiNoteText
    :'';
  // Khối nhân vật (charBlock) chỉ gửi 1 LẦN, đặt SAU bản gốc, ngay trước câu "Hãy dịch..." (tận dụng hiệu ứng
  // recency: model vừa đọc xong bảng nhân vật/xưng hô thì bắt đầu sinh bản dịch). Phía trước bản gốc chỉ có
  // 1 dòng nhắc ngắn (charBlockHeadHint) để model biết bảng nằm ở cuối.
  // Cấm model tự viết chú thích/bản dịch phụ trong ngoặc (VD "(Translated: ...)") — luôn gắn, không phụ thuộc preset prompt.
  const noAnnotNote=tlEn()
    ?'\n\n---\nTECHNICAL NOTE: Output ONLY the translation itself. NEVER add notes, explanations, alternative translations or annotations in parentheses (such as "(Translated: ...)", "(Translation: ...)", "(Note: ...)"), and NEVER leave the original source-language text beside the translation — every sentence must appear exactly once, in the target language.'
    :'\n\n---\nLƯU Ý KỸ THUẬT: CHỈ xuất bản dịch. TUYỆT ĐỐI KHÔNG thêm ghi chú, giải thích, bản dịch phụ hay chú thích trong ngoặc (như "(Translated: ...)", "(Dịch: ...)", "(Ghi chú: ...)"), và KHÔNG để nguyên chữ gốc bên cạnh bản dịch — mỗi câu chỉ xuất hiện đúng một lần, bằng ngôn ngữ đích.';
  const charBlock=(characterContextText?('\n\n---\n'+characterContextText):'')+aiNoteBlock+genderTagNote+noAnnotNote;
  // Mức thinking cho lượt dịch chính: đọc từ "Chế độ dịch" người dùng chọn trong Cài đặt
  // (fast/normal/deep — xem getTranslateMode() trong index.html), áp dụng chung cho CẢ Gemini
  // lẫn DeepSeek (xem callAPI()/callDeepseekAPI() bên dưới đọc và map sang tham số thinking
  // thật của từng AI). NGOẠI LỆ: nếu model đang thử ĐÚNG BẰNG tên thật "deepseek-flash"
  // (không phải "deepseek-v4-flash-quality") — nghĩa là đang ở model LITE/phao cứu sinh do hết
  // quota ngày ở model chính (xem LITE_MODEL phía trên) — luôn ép "fast" bất kể chế độ đã chọn,
  // vì đây vốn là nhánh dự phòng ưu tiên tốc độ/tiết kiệm quota hơn chất lượng.
  const thinkMode=(model==='deepseek-flash')?'fast':(typeof getTranslateMode==='function'?getTranslateMode():'normal');
  // Bảng nhân vật/xưng hô gửi 2 LẦN: đầy đủ TRƯỚC bản gốc (model đọc bản gốc với bảng đã trong đầu) và nhắc lại SAU bản gốc
  // (charBlock, ngay trước câu "Hãy dịch..."). Không có bảng nhân vật mà chỉ có ghi chú/tag giới tính thì giữ dòng nhắc cũ.
  const _headBlock=characterContextText
    ?((tlEn()?'\n\n---\nCHARACTER LIST AND ADDRESSING NOTES (repeated again after the source text — follow them):\n':'\n\n---\nBẢNG NHÂN VẬT VÀ XƯNG HÔ (sẽ được nhắc lại ở cuối, sau bản gốc — hãy tuân thủ):\n')+characterContextText)
    :((aiNoteBlock||genderTagNote)?charBlockHeadHint():'');
  const _firstUserText=prompt+_headBlock+'\n\n---\n'+origContent+(tlEn()?tlFill('\n\n---\nTranslate the chapter above from {{SOURCE_LANG}} into {{TARGET_LANG}}, following the requirements stated at the beginning. The OUTPUT language is {{TARGET_LANG}}: write every sentence of the translation in {{TARGET_LANG}} (not in English or any other language, unless {{TARGET_LANG}} is English).'):'\n\n---\nHãy dịch chương truyện phía trên theo đúng các yêu cầu đã nêu ở đầu.')+charBlock+(addressRulesNote(prompt)||recallQuestionsNote())+endMarkNote()+antiRepeatNote();
  let messages=[{role:'user',parts:[{text:_firstUserText}]}];
  let {text:translated,finishReason}=await callAPI(key,model,messages,undefined,thinkMode,undefined,'translate');
  // Vòng nối tiếp chung cho 2 trường hợp:
  //  (a) MAX_TOKENS: bị cắt do hết token → xin phần còn lại (như cũ);
  //  (b) STOP nhưng THIẾU dấu hiệu END_MARK: model tự bỏ dở giữa chừng (Gemini hay gặp) → xin nối tiếp
  //      thay vì dịch lại cả chương. Nếu thực ra đã dịch đủ (chỉ quên ghi dấu hiệu) thì model chỉ cần trả
  //      lại đúng dòng dấu hiệu — rất rẻ. Không tốn request nào khi dấu hiệu có sẵn ngay lượt đầu.
  let cont=0,tail=0;
  while(!S.stopReq){
    const hasEnd=endHas(translated.normalize('NFC'));
    let kind;
    if(finishReason==='MAX_TOKENS'&&cont<MAX_CONT){cont++;kind='max';}
    else if(finishReason==='STOP'&&!hasEnd&&tail<MAX_TAIL_CONT){tail++;kind='tail';}
    else break;
    if(kind==='max')setStatus(`Dịch ch.${chNum(chIdx)} · bù đoạn ${cont} · Key ${ki+1}/${kTotal} · ${MLBL[model]||model}`);
    else{
      setStatus(`Dịch ch.${chNum(chIdx)} · kiểm tra phần cuối (${tail}/${MAX_TAIL_CONT}) · Key ${ki+1}/${kTotal} · ${MLBL[model]||model}`);
      if(typeof flowLog==='function')flowLog(2,`Chương ${chNum(chIdx)}: bản dịch thiếu dấu hiệu hết chương — nghi bị bỏ dở, xin nối tiếp (lần ${tail}/${MAX_TAIL_CONT}).`);
    }
    const ask=tlEn()
      ?(kind==='max'
        ?'The translation was cut off midway. Continue translating the remaining part of the source text (return only the continuation, do not repeat what has already been translated), then finish with the line '+endMk()+'.'
        :'The translation does not yet contain the line '+endMk()+'. Compare it with the source text: if part of the source is still untranslated, return only the remaining part (starting right after where the translation stopped, without repeating anything already translated) and finish with the line '+endMk()+'; if the source has been translated COMPLETELY up to its last sentence, return only the line '+endMk()+' and nothing else.')
      :kind==='max'
      ?'Bản dịch bị dừng giữa chừng. Hãy tiếp tục dịch phần còn lại của văn bản gốc (chỉ trả về phần tiếp theo, không lặp lại phần đã dịch), rồi kết thúc bằng dòng '+endMk()+'.'
      :'Bản dịch chưa có dòng '+endMk()+'. Hãy đối chiếu với văn bản gốc: nếu CÒN phần chưa dịch thì chỉ trả về phần còn lại (bắt đầu từ ngay sau chỗ đã dịch, không lặp lại phần đã dịch) rồi kết thúc bằng dòng '+endMk()+'; nếu đã dịch ĐỦ đến câu cuối của bản gốc thì chỉ trả về đúng dòng '+endMk()+', không thêm gì khác.';
    // Nêu rõ đoạn cuối đã dịch để model viết tiếp NGAY SAU đó, không viết lại câu cuối
    // Cắt 2 câu cuối của bản dịch dở rồi bắt AI dịch lại từ điểm cắt (yêu cầu: tránh câu bị ngắt giữa chừng rồi lặp lại)
    const _cut=trimLastSentences(stripGenderTags(translated),2);
    const trimmed=_cut!==null;
    const base=trimmed?_cut:translated;
    let _tailSnip=base.replace(/\s+$/,'');
    if(_tailSnip.length>160){_tailSnip=_tailSnip.slice(-160);const _sp=_tailSnip.search(/\s/);if(_sp>0&&_sp<40)_tailSnip=_tailSnip.slice(_sp+1);} // đoạn nhắc bắt đầu ở ranh giới từ, không từ giữa chữ
    const ask2=tlEn()
      ?ask+'\n\nThe translation so far ends with the following passage (ALREADY DONE — do NOT rewrite it): «'+_tailSnip+'». If that last sentence is unfinished, write only the rest of it (starting exactly with the next word); if it is complete, begin with the next sentence of the source text.'
      :ask+'\n\nBản dịch hiện kết thúc bằng đoạn sau (ĐÃ CÓ, TUYỆT ĐỐI KHÔNG viết lại): «'+_tailSnip+'». Nếu câu cuối này đang dở thì chỉ viết nốt phần còn lại của câu đó (bắt đầu đúng từ kế tiếp), nếu đã trọn câu thì bắt đầu từ câu kế tiếp trong văn bản gốc.';
    const askF=trimmed
      ?(tlEn()
        ?'The last two sentences of the previous translation were removed so they can be redone. Continue translating the rest of the source text, starting from the sentence right after the passage below (do not repeat what is already there), through the end of the chapter, then finish with the line '+endMk()+'.\n\nThe translation so far ends with the following passage (ALREADY DONE — do NOT rewrite it): «'+_tailSnip+'».'
        :'Hai câu cuối của bản dịch trước đã bị cắt bỏ để dịch lại cho chắc. Hãy dịch tiếp phần còn lại của văn bản gốc, bắt đầu từ câu ngay sau đoạn dưới đây (không lặp lại phần đã có), cho tới hết chương, rồi kết thúc bằng dòng '+endMk()+'.\n\nBản dịch hiện kết thúc bằng đoạn sau (ĐÃ CÓ, TUYỆT ĐỐI KHÔNG viết lại): «'+_tailSnip+'».')
      :ask2;
    const askFinal=askF+contNoNoRepeatNote();
    // Gửi lại: nội dung gốc + bản dịch dở, yêu cầu dịch tiếp
    messages=[
      {role:'user',parts:[{text:_firstUserText}]},   // dùng lại đúng tin nhắn đầu: có bảng nhân vật trước + sau bản gốc
      {role:'model',parts:[{text:base}]},
      {role:'user',parts:[{text:askFinal}]},
    ];
    const res=await callAPI(key,model,messages,undefined,thinkMode,undefined,'translate-cont');
    if(trimmed){
      // AI chỉ trả lại dòng ⟦END⟧/rỗng (coi như đã xong) -> KHÔNG làm mất 2 câu vừa cắt: giữ bản gốc chưa cắt.
      if(stripGenderTags(res.text||'').trim().length<10)translated=joinTail(translated,res.text);
      else translated=dedupeOverlap(base,res.text)??(base+String(res.text).replace(/^[ \t]+/,''));
    }else translated=kind==='max'?(dedupeOverlap(translated,res.text)??(translated+res.text)):joinTail(translated,res.text);
    finishReason=res.finishReason;
  }
  if(finishReason==='STOP'&&!endHas(translated)&&typeof flowLog==='function')flowLog(2,`Chương ${chNum(chIdx)}: vẫn thiếu dấu hiệu hết chương sau ${tail} lượt nối tiếp — chấp nhận bản dịch hiện tại.`);
  const _clean=stripGenderTags(translated);
  const _srcRep=countSourceRepeats(origContent);
  let _rv;
  const _srcInfo=sourceRepeatZones(origContent);
  try{_rv=await reviewRepeatsLite(_clean,{key,chIdx,srcRep:_srcRep,srcInfo:_srcInfo});}
  catch(e){console.warn('[Repeat-fix] lỗi bất ngờ, giữ nguyên bản dịch:',e);_rv={text:_clean,found:0,fixed:0,kept:0,ai:true};}
  _repeatFixes[chIdx]={found:_rv.found,fixed:_rv.fixed,kept:_rv.kept,srcRep:_srcRep,skipped:_rv.skippedIntentional||0};
  if(_rv.skippedIntentional&&typeof flowLog==='function')flowLog(2,`Chương ${chNum(chIdx)}: bỏ qua ${_rv.skippedIntentional} chỗ lặp vì bản gốc cũng lặp ở cùng phần chương (chia ${REPEAT_ZONES} phần theo ký tự) — tác giả cố ý.`);
  if(_rv.found>0){
    const how=_rv.ai?`${MLBL[(typeof getProvider==='function'&&getProvider()==='deepseek')?DEEPSEEK_LITE_MODEL:GEMINI_LITE_MODEL]||'Lite'} xem xét`:'AI lỗi → sửa cơ học';
    if(_rv.fixed>0)markRetranslated(chIdx,'repeat',`${how}: sửa ${_rv.fixed}/${_rv.found} câu lặp${_rv.kept?`, giữ ${_rv.kept} chỗ hợp ý`:''}${_srcRep?' · gốc có lặp chủ ý':''}`);
    if(typeof flowLog==='function')flowLog(2,`Chương ${chNum(chIdx)}: ${_rv.found} chỗ nghi lặp — ${how}: sửa ${_rv.fixed}, giữ ${_rv.kept}.${_rv.samples&&_rv.samples.length?' '+_rv.samples.join(' | '):''}`);
  }
  return _rv.text;
}