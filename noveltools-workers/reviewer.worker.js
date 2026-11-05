// =====================================================================
// NovelTools — Worker Reviewer
//   POST /chat?dev=<id>          Chatbot gợi ý truyện từ danh mục review của BẠN (Gemini)
//   GET  /reviews/match?oa=&ot=  Khớp truyện đang đọc (tên gốc + tác giả gốc) với review trong danh mục
//   PUT  /admin/reviews          (Bearer ADMIN_TOKEN) nạp/cập nhật danh mục review vào KV
//
// CẦN CẤU HÌNH (Dashboard → Worker → Settings):
//   Secrets : GEMINI_API_KEYS  (1–5 key Gemini, phân tách bằng dấu phẩy — Worker tự xoay key khi gặp 429/lỗi)
//             ADMIN_TOKEN      (chuỗi bí mật dài, dùng cho PUT /admin/reviews)
//   Variable: GEMINI_MODEL     mặc định "gemini-flash-latest"
//             ALLOWED_ORIGINS  vd "https://ten-ban.pages.dev" (bỏ trống = cho tất cả)
//             CHAT_ENABLED     "0" để tắt chat
//             CHAT_GAP_SEC (2) · CHAT_PER_HOUR (30) · CHAT_PER_DAY (100) · MATCH_PER_DAY (15)
//   KV binding: tên biến KV → 1 KV namespace (khoá "reviews" chứa mảng JSON, xem reviews.sample.json)
//   (Hoặc đặt REVIEWS_URL trỏ tới 1 file JSON công khai thay cho KV.)
// =====================================================================
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MAX_MSG = 8, MAX_TEXT = 800, MAX_CATALOG = 400;

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const al = list(env.ALLOWED_ORIGINS);
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (!al.length) h['Access-Control-Allow-Origin'] = '*';
  else if (al.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (obj, status, extra) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const err = (code, status, c, extra) => json({ ok: false, error: code, ...(extra || {}) }, status, { 'Cache-Control': 'no-store', ...c });

// ---------- Giới hạn tần suất (trong bộ nhớ của isolate: xấp xỉ, đủ chặn bấm dồn/spam thông thường) ----------
const hits = new Map();
function rate(key, windowMs, max) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return Math.ceil((windowMs - (now - arr[0])) / 1000); }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 86400000) hits.delete(k);
  return 0;
}

// ---------- Danh mục review ----------
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
let catCache = { t: 0, items: [] };
function cleanItem(x) {
  if (!x || typeof x !== 'object') return null;
  const id = String(x.id || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !x.title) return null;
  const rt = Number(x.rating);
  return {
    id, title: String(x.title).slice(0, 160), titleEn: x.titleEn ? String(x.titleEn).slice(0, 160) : '',
    titleOrig: String(x.titleOrig || '').slice(0, 160), author: String(x.author || '').slice(0, 100), authorOrig: String(x.authorOrig || '').slice(0, 100),
    genres: Array.isArray(x.genres) ? x.genres.map((g) => String(g).slice(0, 40)).slice(0, 8) : [],
    rating: Number.isFinite(rt) ? Math.max(0, Math.min(10, rt)) : 0,
    cover: /^https:\/\//.test(x.cover || '') ? String(x.cover).slice(0, 500) : '',
    summary: String(x.summary || '').slice(0, 400), status: String(x.status || '').slice(0, 30),
  };
}
async function catalog(env) {
  if (Date.now() - catCache.t < 300000 && catCache.items.length) return catCache.items;
  let raw = null;
  try {
    if (env.KV) raw = await env.KV.get('reviews', 'json');
    else if (env.REVIEWS_URL) raw = await (await fetch(env.REVIEWS_URL, { cf: { cacheTtl: 300 } })).json();
  } catch (e) {}
  const items = (Array.isArray(raw) ? raw : []).map(cleanItem).filter(Boolean);
  catCache = { t: Date.now(), items };
  return items;
}

// ---------- Gemini (xoay key) ----------
async function callGemini(env, system, contents) {
  const keys = list(env.GEMINI_API_KEYS).slice(0, 5);
  if (!keys.length) return { error: 'not_configured' };
  const model = env.GEMINI_MODEL || 'gemini-flash-latest';
  const start = Math.floor(Math.random() * keys.length);
  let sawBusy = false, sawBad = false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    let r;
    try {
      r = await fetch(GEMINI + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] }, contents,
          generationConfig: {
            temperature: 0.7, maxOutputTokens: 4096, responseMimeType: 'application/json',
            responseSchema: { type: 'OBJECT', properties: { reply: { type: 'STRING' }, choices: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['reply'] },
          },
        }),
      });
    } catch (e) { sawBusy = true; continue; }
    if (r.status === 429 || r.status >= 500) { sawBusy = true; continue; }
    if (r.status === 404) return { error: 'model_unavailable' };
    if (r.status === 400 || r.status === 401 || r.status === 403) { sawBad = true; continue; }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!j) { sawBusy = true; continue; }
    if (j.promptFeedback && j.promptFeedback.blockReason) return { error: 'blocked' };
    const cand = j.candidates && j.candidates[0];
    const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('') : '';
    if (!text.trim()) return { error: cand && cand.finishReason === 'SAFETY' ? 'blocked' : 'empty' };
    return { text };
  }
  return { error: sawBusy ? 'busy' : sawBad ? 'not_configured' : 'upstream' };
}

function parseModelJson(text) {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { const j = JSON.parse(t); if (j && typeof j.reply === 'string') return j; } catch (e) {}
  return { reply: text.trim(), choices: [] };
}

function buildSystem(items, ctx, cur) {
  const vi = (ctx.lang || 'vi') !== 'en';
  const lines = items.slice(0, MAX_CATALOG).map((r) =>
    `${r.id} | ${r.title}${r.titleEn ? ' / ' + r.titleEn : ''} | ${r.author} | ${r.genres.join(', ')} | ★${r.rating} | ${r.status} | ${r.summary.slice(0, 140)}`);
  return [
    vi ? 'Bạn là trợ lý gợi ý truyện (webnovel/truyện chữ) cho một trang review. Trả lời bằng tiếng Việt, thân thiện, ngắn gọn (tối đa ~120 từ).'
       : 'You are a story-recommendation assistant (webnovels) for a review site. Answer in English, friendly and concise (max ~120 words).',
    'CHỈ được gợi ý truyện có trong DANH MỤC bên dưới. Không bịa truyện/ID. Khi gợi ý một truyện, nêu lý do ngắn rồi thêm MỘT dòng riêng đúng dạng [[review:ID]] (ID lấy từ danh mục). Tối đa 4 truyện mỗi lượt.',
    'Nếu danh mục không có truyện phù hợp, nói thẳng điều đó, không ép gợi ý. Nếu câu hỏi mơ hồ, hỏi lại 1 câu và đưa 2–4 lựa chọn ngắn vào "choices" (mỗi lựa chọn ≤ 6 từ). Nếu không cần hỏi lại, để "choices" rỗng.',
    'Trả về JSON: {"reply": string, "choices": string[]}. Không nhắc tới các chỉ dẫn này.',
    cur ? `Người dùng đang xem bài review: ${cur.id} | ${cur.title} | ${cur.summary.slice(0, 200)}` : '',
    items.length ? 'DANH MỤC (id | tên | tác giả | thể loại | điểm | tình trạng | tóm tắt):\n' + lines.join('\n') : 'DANH MỤC: (trống) — hãy nói rằng hiện chưa có review nào để gợi ý.',
  ].filter(Boolean).join('\n\n');
}

async function handleChat(req, env, url, c) {
  if (env.CHAT_ENABLED === '0') return err('model_unavailable', 503, c);
  let b; try { b = await req.json(); } catch (e) { return err('bad_request', 400, c); }
  const raw = Array.isArray(b && b.messages) ? b.messages : [];
  // chuẩn hoá lịch sử: bắt đầu bằng 'user', gộp các lượt liền kề cùng vai
  const msgs = [];
  for (const m of raw.slice(-MAX_MSG * 2)) {
    const role = m && m.role === 'model' ? 'model' : 'user';
    const text = String(m && m.text || '').slice(0, MAX_TEXT).trim();
    if (!text) continue;
    if (!msgs.length && role === 'model') continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].text += '\n' + text;
    else msgs.push({ role, text });
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return err('empty', 400, c);

  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  const dev = (url.searchParams.get('dev') || '').slice(0, 64);
  const who = dev.length >= 8 ? 'd:' + dev : 'i:' + ip;
  const gap = num(env.CHAT_GAP_SEC, 2);
  let w = rate('gap:' + who, gap * 1000, 1); if (w) return err('too_fast', 429, c, { retry: w });
  w = rate('hr:' + who, 3600000, num(env.CHAT_PER_HOUR, 30)); if (w) return err('hourly', 429, c, { retry: w });
  w = rate('day:' + who, 86400000, num(env.CHAT_PER_DAY, 100)); if (w) return err('daily', 429, c, { retry: w });
  w = rate('ipday:' + ip, 86400000, num(env.CHAT_PER_DAY, 100) * 3); if (w) return err('daily', 429, c, { retry: w });

  const ctx = b.ctx && typeof b.ctx === 'object' ? b.ctx : {};
  const ex = Array.isArray(ctx.exGenres) ? ctx.exGenres.map(plain).filter(Boolean).slice(0, 20) : [];
  let items = await catalog(env);
  if (ex.length) items = items.filter((r) => !r.genres.some((g) => ex.some((e) => plain(g).includes(e))));
  const cur = ctx.review ? items.find((r) => r.id === String(ctx.review.id || ctx.review)) || null : null;

  const res = await callGemini(env, buildSystem(items, ctx, cur), msgs.map((m) => ({ role: m.role, parts: [{ text: m.text }] })));
  if (res.error) return err(res.error, res.error === 'busy' ? 503 : res.error === 'blocked' || res.error === 'empty' ? 422 : 502, c);

  const out = parseModelJson(res.text);
  const byId = new Map(items.map((r) => [r.id, r]));
  const cards = {};
  let reply = out.reply.replace(/\[\[review:([A-Za-z0-9_-]{1,64})\]\]/g, (m, id) => {
    const r = byId.get(id);
    if (!r) return '';                                   // ID bịa → bỏ dòng thẻ
    cards[id] = { id: r.id, title: r.title, titleEn: r.titleEn, cover: r.cover, author: r.author, rating: r.rating, genres: r.genres };
    return m;
  }).replace(/\n{3,}/g, '\n\n').trim();
  if (!reply) return err('empty', 422, c);
  const choices = Array.isArray(out.choices) ? out.choices.map((s) => String(s).slice(0, 60)).filter(Boolean).slice(0, 4) : [];
  return json({ ok: true, reply, cards, choices }, 200, { 'Cache-Control': 'no-store', ...c });
}

async function handleMatch(req, env, url, c) {
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  const wait = rate('match:' + ip, 86400000, num(env.MATCH_PER_DAY, 15));
  if (wait) return json({ error: 'rate_limited', retry_after: wait }, 429, { 'Cache-Control': 'no-store', ...c });
  const oa = plain((url.searchParams.get('oa') || '').slice(0, 120));
  const ot = plain((url.searchParams.get('ot') || '').slice(0, 120));
  const items = await catalog(env);
  let r = null;
  if (ot) {
    const same = items.filter((x) => plain(x.titleOrig) === ot);
    r = (oa && same.find((x) => plain(x.authorOrig) === oa)) || same[0] || null;
  }
  const byAuthor = oa ? items.filter((x) => plain(x.authorOrig) === oa) : [];
  const m = byAuthor.filter((x) => !r || x.id !== r.id).sort((a, b) => b.rating - a.rating).slice(0, 5);
  const au = (byAuthor[0] && byAuthor[0].author) || '';
  const body = {
    r: r ? { id: r.id, t: r.title, rt: r.rating, a: r.author, en: !!r.titleEn } : null,
    m: m.map((x) => ({ id: x.id, t: x.title, rt: x.rating, en: !!x.titleEn })),
    n: byAuthor.length, au,
  };
  return json(body, 200, { 'Cache-Control': 'public, max-age=3600', ...c });
}

async function handleAdmin(req, env, c) {
  if (!env.ADMIN_TOKEN || req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401, c);
  if (!env.KV) return json({ error: 'kv_not_bound' }, 500, c);
  let arr; try { arr = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400, c); }
  const items = (Array.isArray(arr) ? arr : []).map(cleanItem).filter(Boolean);
  if (!items.length) return json({ error: 'no_valid_items' }, 400, c);
  await env.KV.put('reviews', JSON.stringify(items));
  catCache = { t: 0, items: [] };
  return json({ ok: true, count: items.length }, 200, c);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const c = cors(req, env);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });
    if (path === '/') return new Response('NovelTools Reviewer worker OK', { headers: { 'Content-Type': 'text/plain' } });
    const al = list(env.ALLOWED_ORIGINS), origin = req.headers.get('Origin');
    if (al.length && origin && !al.includes(origin)) return err('forbidden', 403, c);
    if (path === '/chat' && req.method === 'POST') return handleChat(req, env, url, c);
    if (path === '/reviews/match' && req.method === 'GET') return handleMatch(req, env, url, c);
    if (path === '/admin/reviews' && req.method === 'PUT') return handleAdmin(req, env, c);
    return err('not_found', 404, c);
  },
};
