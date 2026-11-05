// ============================================================
// spellcheck.js — Kiểm tra chính tả tiếng Việt "nhẹ" dựa trên
// danh sách ÂM TIẾT hợp lệ (không phải từ điển đầy đủ).
//
// Vì tiếng Việt là ngôn ngữ đơn lập, số âm tiết có thể phát âm
// hợp lệ chỉ khoảng 6.500–7.200 (xem
// https://github.com/vietnameselanguage/syllable). Một chuỗi
// ký tự KHÔNG khớp âm tiết nào trong danh sách này gần như chắc
// chắn là gõ sai chính tả/dính lỗi gõ dấu — nên chỉ cần 1 file
// vài chục KB là đủ, thay vì tải cả từ điển từ-ghép nặng hàng MB.
//
// Cơ chế cache:
//   1. Lần đầu: fetch() file .txt tĩnh -> lưu vào IndexedDB.
//   2. Các lần sau (kể cả tắt trình duyệt, mở lại máy): đọc thẳng
//      từ IndexedDB, KHÔNG gọi mạng nữa.
//   3. Muốn cập nhật từ điển mới: đổi DICT_VERSION -> code tự
//      nhận ra cache cũ không khớp version -> tải lại đúng 1 lần.
// ============================================================

const DB_NAME    = 'charmem-spellcheck';
const STORE_NAME = 'dict';
const DICT_VERSION = 'vi-syllables-v1'; // đổi hậu tố khi thay file từ điển
const DICT_URL      = '/dict/vi-syllables.txt'; // file tĩnh, mỗi dòng 1 âm tiết, chữ thường

let dictSet = null;      // Set<string> giữ trong RAM sau khi load lần đầu trong phiên
let loadingPromise = null; // tránh việc gọi loadDict() nhiều lần cùng lúc -> chỉ chạy 1 luồng tải

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const r = tx.objectStore(STORE_NAME).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}

function idbSet(db, key, val) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** Tải từ điển: ưu tiên cache máy người dùng, chỉ fetch mạng nếu chưa từng có. */
export async function loadDict() {
  if (dictSet) return dictSet;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const db = await openDb();
    const cached = await idbGet(db, DICT_VERSION);

    if (cached && Array.isArray(cached) && cached.length) {
      dictSet = new Set(cached);
      console.log(`[spellcheck] Đã nạp ${dictSet.size} âm tiết từ cache (không gọi mạng).`);
      return dictSet;
    }

    console.log('[spellcheck] Chưa có cache — tải từ điển lần đầu...');
    const res = await fetch(DICT_URL);
    if (!res.ok) throw new Error(`Không tải được từ điển: ${res.status}`);
    const text = await res.text();
    const words = text.split('\n').map(w => w.trim().toLowerCase()).filter(Boolean);

    dictSet = new Set(words);
    await idbSet(db, DICT_VERSION, words); // lưu mảng (an toàn hơn Set khi structured clone)
    console.log(`[spellcheck] Đã tải & lưu cache ${words.length} âm tiết. Từ giờ dùng cache.`);
    return dictSet;
  })();

  return loadingPromise;
}

/** Tách chuỗi thành các âm tiết tiếng Việt (bỏ số, dấu câu, ký tự latin thường không dấu vẫn giữ). */
function tokenize(str) {
  return (str.toLowerCase().match(
    /[a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+/gi
  ) || []);
}

/** Trả về danh sách âm tiết KHÔNG có trong từ điển (nghi ngờ sai chính tả). */
export async function checkText(str) {
  const dict = await loadDict();
  const tokens = tokenize(str);
  const seen = new Set();
  const misspelled = [];
  for (const w of tokens) {
    if (!dict.has(w) && !seen.has(w)) { seen.add(w); misspelled.push(w); }
  }
  return misspelled;
}

// ------------------------------------------------------------
// Gắn spellcheck cho 1 <textarea>: debounce khi gõ, hiện số từ
// nghi sai ngay dưới ô nhập (nhẹ, không cần overlay tô màu phức
// tạp trong textarea thường).
// ------------------------------------------------------------
export function attachSpellcheck(textareaEl, hintEl, { debounceMs = 500 } = {}) {
  let t = null;
  const run = async () => {
    const bad = await checkText(textareaEl.value);
    if (!hintEl) return;
    if (!bad.length) { hintEl.textContent = ''; hintEl.style.display = 'none'; return; }
    hintEl.style.display = '';
    hintEl.textContent = `Có thể sai chính tả: ${bad.slice(0, 12).join(', ')}${bad.length > 12 ? '…' : ''}`;
  };
  textareaEl.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(run, debounceMs);
  });
  // chạy 1 lần khi gắn, phòng trường hợp textarea đã có sẵn nội dung
  run();
}
