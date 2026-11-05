const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SHA_INIT = [0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19];
const SHA_STATE = [0xFD9FBEA2,0x91243CE7,0xBE499094,0xCD2E1E0A,0x6C006F49,0x04BD35AB,0xFEB0A7E4,0x03EFFBD2];
const SHA_SCHED = [0xEB24BF9E,0x1558691F,0xA0C09EE2,0x0CFA32BA,0xA622EE8C,0xD1DD9491,0xC0DD25A0,0xF9E70AB6,0xF0C31573,0x7058CE4E,0x7188E606,0x00E5AB33,0xD258B060,0x72766564];
const SHA_K = [0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0x0FC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x06CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2];
const CS_COEF = [[0xE82E91B1,0xB32700D0],[0x44DE24C6,0x88DFF51D],[0x3BEB65BC,0x29514038],[0xC89C5933,0xB328CBDF],[0x8D1EC211,0xD405B4D5],[0x314EF5D5,0x26E55F3C],[0xE92491B1,0x607801C6],[0xF0A5B9D5,0x82B2C1FB],[0x06064CF3,0xFA51A3DA],[0xDA79FA60,0x207CC464],[0xBED20560,0x3C3C74F3],[0x89F9C9F8,0xD2D14B61],[0x35FA38C6,0xBB04A2C1],[0xCB49E3C6,0xC5626167]];
// ---- Sec-MS-GEC v2 (port từ edge-tts 7.3.1, drm.py). Hằng số bên dưới là bảng của thuật toán, KHÔNG phải SHA-256 chuẩn. ----
const U = (x) => x >>> 0;
const mul = (a, b) => Math.imul(a, b) >>> 0;
const rol16 = (v) => (((v << 16) | (v >>> 16)) >>> 0);
const ror = (v, n) => (((v >>> n) | (v << (32 - n))) >>> 0);
const sg0 = (v) => (ror(v, 7) ^ ror(v, 18) ^ (v >>> 3)) >>> 0;
const sg1 = (v) => (ror(v, 17) ^ ror(v, 19) ^ (v >>> 10)) >>> 0;
const SIG0_ADJ = 0x059C0B80, SIG1_ADJ = 0x000B92C0, SHA_ADJ = 0xC9DC06A7;
const CS_FACTOR = 0x82893933, CS_ADJ0 = 0xF2F90B1A, CS_ADJ1 = 0x0B1A0000;
function shaExpand(w, from) {
  for (let i = from; i < 64; i++) w.push(U(sg1(w[i - 2]) + w[i - 7] + sg0(w[i - 15]) + w[i - 16]));
}
function shaRounds(state, w, first) {
  const K = first === 14 ? SHA_K.map((k, i) => (i === 14 ? SHA_ADJ : k)) : SHA_K;
  let [a, b, c, d, e, f, g, h] = state;
  for (let i = first; i < 64; i++) {
    const t1 = U(h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + (g ^ (e & (f ^ g))) + K[i] + w[i]);
    const t2 = U((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) | (c & (a | b))));
    h = g; g = f; f = e; e = U(d + t1); d = c; c = b; b = a; a = U(t1 + t2);
  }
  return [a, b, c, d, e, f, g, h];
}
function shaInit(p) { // p: 7 byte đầu
  const w = new Array(14).fill(0);
  w.push((p[0] << 16 | p[1] << 8 | p[2]) >>> 0);
  w.push(((p[3] << 24) | (p[4] << 16) | (p[5] << 8) | p[6]) >>> 0);
  for (let i = 16; i < 30; i++) {
    let v = SHA_SCHED[i - 16];
    if (i - 2 >= 14) v += i === 16 ? (sg1(w[i - 2]) ^ SIG1_ADJ) >>> 0 : sg1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? (sg0(w[i - 15]) ^ SIG0_ADJ) >>> 0 : sg0(w[i - 15]);
    w.push(U(v));
  }
  w.push(U(sg1(w[28]) + w[23] + sg0(w[15]) + w[14] + SHA_ADJ - SHA_K[14]));
  shaExpand(w, 31);
  const x = shaRounds(SHA_STATE, w, 14);
  return SHA_INIT.map((v, i) => U(v + x[i]));
}
function shaDigest(data) {
  const length = 57 + data.length;
  const pad = (((55 - length) % 64) + 64) % 64;
  const rest = data.length - 7;
  const padded = new Uint8Array(rest + 1 + pad + 8);
  padded.set(data.subarray(7), 0);
  padded[rest] = 0x80;
  new DataView(padded.buffer).setBigUint64(padded.length - 8, BigInt(length) * 8n);
  let st = shaInit(data.subarray(0, 7));
  const dv = new DataView(padded.buffer);
  for (let off = 0; off < padded.length; off += 64) {
    const w = [];
    for (let i = 0; i < 16; i++) w.push(dv.getUint32(off + i * 4));
    shaExpand(w, 16);
    const x = shaRounds(st, w, 0);
    st = st.map((v, i) => U(v + x[i]));
  }
  const out = new Uint8Array(32), o = new DataView(out.buffer);
  st.forEach((v, i) => o.setUint32(i * 4, v));
  return out;
}
function cs64(data, digest) {
  const dv = new DataView(digest.buffer, digest.byteOffset, 32);
  const ka = (dv.getUint32(0, true) | 1) >>> 0, kb = (dv.getUint32(4, true) | 1) >>> 0;
  const fac = [mul(ka, CS_FACTOR), mul(kb, CS_FACTOR)];
  const terms = CS_COEF.map((c, i) => mul(c[0], fac[i % 2]));
  const offs = CS_COEF.map((c) => c[1]);
  const buf = new Uint8Array(1 + data.length + ((4 - ((1 + data.length) % 4)) % 4));
  buf.set(data, 1);
  const bv = new DataView(buf.buffer);
  const ws = [];
  for (let i = 0; i < buf.length; i += 4) ws.push(bv.getUint32(i, true));
  if (ws.length % 2) ws.push(0);
  ws.forEach((word, i) => {
    let term = mul(word, i % 2 === 0 ? ka : kb);
    let off = mul(rol16(word), i % 2 === 0 ? 0xEF0569FB : 0xC31713DB);
    if (i === 0) { term = U(term + mul(CS_ADJ0, fac[0])); off = U(off + CS_ADJ1); }
    terms.push(term); offs.push(off);
  });
  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16(U(offs[i] + x));
    let q = mul(t, 0x76F50F34);
    swapAcc = U(swapAcc + U(mul(rol16(q), 0xC3EFEA97) + q));
    t = rol16(U(offs[i + 1] + y));
    q = mul(t, 0x1881CE3C);
    swapLast = U(mul(rol16(q), 0x35BD1EC9) + q);
    swapAcc = U(swapAcc + swapLast);
    state = U(mul(state, ka) + x);
    state = mul(rol16(state), 0xCF98B111);
    state = mul(rol16(state), 0x87085B9F);
    state = mul(rol16(state), 0x12CEB96D);
    state = mul(rol16(state), 0x257E1D83);
    acc = U(acc + state);
    t = U(mul(state, kb) + y);
    t = mul(rol16(t), 0xA27416F5);
    t = mul(rol16(t), 0xD38396FF);
    state = mul(rol16(mul(rol16(t), 0x7C932B89)), 0xBFA49F69);
    acc = U(acc + state);
  }
  return [U(swapLast ^ state), U(swapAcc ^ acc)];
}
const HEX = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
function genSecMsGec(unixSeconds) {
  let t = BigInt(Math.floor(unixSeconds)) + 11644473600n;
  t -= t % 300n;
  t *= 10000000n;
  const data = new TextEncoder().encode(t.toString() + TRUSTED_CLIENT_TOKEN);
  const dg = shaDigest(data);
  const [w0, w1] = cs64(data, dg);
  const c = new Uint8Array(8), cv = new DataView(c.buffer);
  cv.setUint32(0, w0, true); cv.setUint32(4, w1, true);
  return HEX(c) + '-' + HEX(dg);
}

// =====================================================================
// NovelTools — Worker Edge TTS (POST /tts → MP3)
// Dán nguyên file này vào Cloudflare Dashboard → Workers → Edit code.
// Biến môi trường (đều TÙY CHỌN):
//   ALLOWED_ORIGINS  vd "https://ten-ban.pages.dev" — chỉ cho trình duyệt từ các origin này gọi (bỏ trống = cho tất cả)
//   LOCAL_KEY        nếu đặt, client phải gửi header X-Local-Key đúng giá trị (đặt window.TTS_LOCAL_KEY ở frontend)
//   CHROMIUM_FULL_VERSION  mặc định 143.0.3650.75 — chỉ đổi khi Microsoft từ chối phiên bản cũ
// =====================================================================
const WSS_BASE = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const ORIGIN_HDR = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const MAX_CHARS = 3000;
const TIMEOUT_MS = 20000;

const jsonRes = (obj, status, extra) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
});

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Local-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (!list.length) h['Access-Control-Allow-Origin'] = '*';
  else if (list.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// Dịch vụ không nhận một số ký tự điều khiển (vd. tab dọc) → đổi thành khoảng trắng
const cleanText = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');

const jsDate = () => new Date().toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) ([\d:]+) GMT$/, '$1 $3 $2 $4 $5') + ' GMT+0000 (Coordinated Universal Time)';

let gecCache = { win: 0, v: '' };
function gec(skewSec) {
  const now = Date.now() / 1000 + (skewSec || 0);
  const win = Math.floor(now / 300);
  if (gecCache.win !== win) gecCache = { win, v: genSecMsGec(now) };
  return gecCache.v;
}

async function openSocket(env, skewSec) {
  const ver = env.CHROMIUM_FULL_VERSION || '143.0.3650.75';
  const major = ver.split('.')[0];
  const connId = crypto.randomUUID().replace(/-/g, '');
  const url = `${WSS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connId}` +
    `&Sec-MS-GEC=${gec(skewSec)}&Sec-MS-GEC-Version=2-${ver}`;
  const muid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return fetch(url, {
    headers: {
      Upgrade: 'websocket',
      Origin: ORIGIN_HDR,
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
      Cookie: `muid=${muid};`,
    },
  });
}

async function synth(env, { text, voice, rate, pitch, volume }) {
  let resp = await openSocket(env, 0);
  // Đồng hồ lệch → Microsoft trả 403 kèm header Date: hiệu chỉnh rồi thử lại 1 lần (giống edge-tts)
  if (resp.status === 403 && resp.headers.get('Date')) {
    const server = Date.parse(resp.headers.get('Date'));
    if (server) resp = await openSocket(env, server / 1000 - Date.now() / 1000);
  }
  const ws = resp.webSocket;
  if (!ws) throw Object.assign(new Error('handshake ' + resp.status), { code: 'handshake' });
  ws.accept();

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0, done = false;
    const finish = (err) => {
      if (done) return; done = true; clearTimeout(timer);
      try { ws.close(1000, 'done'); } catch (e) {}
      if (err) return reject(err);
      if (!total) return reject(Object.assign(new Error('no audio'), { code: 'empty' }));
      const out = new Uint8Array(total); let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      resolve(out);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error('timeout'), { code: 'timeout' })), TIMEOUT_MS);

    ws.addEventListener('message', (ev) => {
      const d = ev.data;
      if (typeof d === 'string') {
        if (d.includes('Path:turn.end')) finish();
        return;
      }
      const buf = new Uint8Array(d instanceof ArrayBuffer ? d : await_buf(d));
      if (buf.length < 2) return;
      const hl = (buf[0] << 8) | buf[1];
      if (hl > buf.length) return;
      const head = new TextDecoder().decode(buf.subarray(2, 2 + hl));
      if (!head.includes('Path:audio')) return;
      const body = buf.subarray(2 + hl);
      if (body.length) { chunks.push(body.slice()); total += body.length; }
    });
    ws.addEventListener('error', () => finish(Object.assign(new Error('ws error'), { code: 'ws' })));
    ws.addEventListener('close', () => finish());

    const ts = jsDate();
    ws.send(
      `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},' +
      '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
    );
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
      `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${xmlEscape(cleanText(text))}</prosody></voice></speak>`;
    ws.send(
      `X-RequestId:${crypto.randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\n` +
      `X-Timestamp:${jsDate()}Z\r\nPath:ssml\r\n\r\n${ssml}`
    );
  });
}
// (Workers luôn trả binary là ArrayBuffer; hàm này chỉ là lưới an toàn cho kiểu khác)
function await_buf(d) { return d && d.buffer ? d.buffer : new ArrayBuffer(0); }

const RE_RATE = /^[+-]\d{1,3}%$/, RE_PITCH = /^[+-]\d{1,3}Hz$/, RE_VOICE = /^[A-Za-z0-9-]{3,80}$/;

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return new Response('NovelTools Edge TTS worker OK — POST /tts', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors } });
    }
    if (url.pathname !== '/tts' || req.method !== 'POST') return jsonRes({ error: 'not_found' }, 404, cors);

    const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin');
    if (list.length && origin && !list.includes(origin)) return jsonRes({ error: 'forbidden' }, 403, cors);
    if (env.LOCAL_KEY && req.headers.get('X-Local-Key') !== env.LOCAL_KEY) return jsonRes({ error: 'forbidden' }, 403, cors);

    let b;
    try { b = await req.json(); } catch (e) { return jsonRes({ error: 'bad_json' }, 400, cors); }
    const text = String(b && b.text || '').trim();
    if (!text) return jsonRes({ error: 'empty_text' }, 400, cors);
    if (text.length > MAX_CHARS) return jsonRes({ error: 'text_too_long', max: MAX_CHARS }, 413, cors);
    const voice = RE_VOICE.test(b.voice || '') ? b.voice : 'vi-VN-HoaiMyNeural';
    const rate = RE_RATE.test(b.rate || '') ? b.rate : '+0%';
    const pitch = RE_PITCH.test(b.pitch || '') ? b.pitch : '+0Hz';
    const volume = RE_RATE.test(b.volume || '') ? b.volume : '+0%';

    // Cache API (chỉ có tác dụng khi Worker gắn tên miền riêng; trên *.workers.dev nó là no-op nhưng vô hại)
    const cache = caches.default;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([voice, rate, pitch, volume, text].join('\u0001')));
    const key = new Request('https://tts-cache.invalid/' + Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join(''));
    try { const hit = await cache.match(key); if (hit) return new Response(hit.body, { headers: { 'Content-Type': 'audio/mpeg', 'X-Cache': 'HIT', ...cors } }); } catch (e) {}

    try {
      const audio = await synth(env, { text, voice, rate, pitch, volume });
      const headers = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=604800', ...cors };
      try { ctx.waitUntil(cache.put(key, new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=604800' } }))); } catch (e) {}
      return new Response(audio, { headers });
    } catch (e) {
      return jsonRes({ error: e.code || 'upstream', message: String(e.message || e).slice(0, 120) }, 502, cors);
    }
  },
};
