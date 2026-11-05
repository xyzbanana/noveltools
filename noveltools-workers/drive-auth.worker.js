// =====================================================================
// NovelTools — Worker Drive Auth
//   POST /oauth/refresh     {refresh_token} → {access_token, expires_in}
//   GET  /oauth/callback    redirect URI của luồng popup (web) → postMessage về trang gốc
//   GET  /app/callback      redirect URI của luồng "đăng nhập ngoài" (app/PWA) → lưu token tạm vào KV
//   GET  /app/poll?state=   app hỏi kết quả đăng nhập (đọc xong là xoá)
//   GET  /notify/update     → {id}  (id bản cập nhật mới nhất, người dùng sẽ thấy thông báo)
//   POST /notify/update     Authorization: Bearer <Google access token của admin> → tạo id mới
//
// CẦN CẤU HÌNH (Dashboard → Worker → Settings):
//   Secrets : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   Variable: ALLOWED_ORIGINS  vd "https://ten-ban.pages.dev"  (BẮT BUỘC, phân tách bằng dấu phẩy)
//   Variable: ADMIN_EMAILS     vd "ban@gmail.com"  (email được phép phát thông báo cập nhật)
//   KV binding: tên biến  KV  → trỏ tới 1 KV namespace
// =====================================================================
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
  if (list(env.ALLOWED_ORIGINS).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (obj, status, extra) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

async function exchange(env, params) {
  const body = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params });
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { ok: r.ok && !!j.access_token, status: r.status, data: j };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function page(title, msg, script) {
  return new Response(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#111;color:#eee;text-align:center;padding:24px}</style></head>` +
    `<body><div><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>${script ? `<script>${script}</script>` : ''}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } }
  );
}
// Nhúng JSON vào <script> an toàn (chặn </script> và ký tự xuống dòng đặc biệt)
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const RE_STATE = /^[A-Za-z0-9_-]{16,128}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const c = cors(req, env);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });
    if (path === '/') return new Response('NovelTools Drive Auth worker OK', { headers: { 'Content-Type': 'text/plain' } });
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: 'not_configured' }, 500, c);

    // ---------- Làm mới access token ----------
    if (path === '/oauth/refresh' && req.method === 'POST') {
      const origin = req.headers.get('Origin');
      if (origin && !list(env.ALLOWED_ORIGINS).includes(origin)) return json({ error: 'forbidden' }, 403, c);
      let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad_json' }, 400, c); }
      const rt = String(b && b.refresh_token || '');
      if (!rt || rt.length > 2048) return json({ error: 'missing_refresh_token' }, 400, c);
      const r = await exchange(env, { grant_type: 'refresh_token', refresh_token: rt });
      if (!r.ok) return json({ error: r.data.error || 'refresh_failed', error_description: r.data.error_description }, r.status >= 400 && r.status < 500 ? 400 : 502, c);
      return json({ access_token: r.data.access_token, expires_in: r.data.expires_in || 3600 }, 200, c);
    }

    // ---------- Luồng popup (web) ----------
    if (path === '/oauth/callback' && req.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      let msg;
      if (err || !code) msg = { type: 'drive_auth_error', state, error: err || 'no_code' };
      else {
        const r = await exchange(env, { grant_type: 'authorization_code', code, redirect_uri: url.origin + '/oauth/callback' });
        msg = r.ok
          ? { type: 'drive_auth_success', state, access_token: r.data.access_token, expires_in: r.data.expires_in || 3600, refresh_token: r.data.refresh_token || '' }
          : { type: 'drive_auth_error', state, error: r.data.error || 'exchange_failed' };
      }
      const origins = list(env.ALLOWED_ORIGINS);
      const script = `(function(){var m=${safeJson(msg)},o=${safeJson(origins)};try{if(window.opener){for(var i=0;i<o.length;i++){window.opener.postMessage(m,o[i]);}}}catch(e){}setTimeout(function(){window.close()},400)})();`;
      return page(msg.type === 'drive_auth_success' ? 'Đăng nhập thành công' : 'Đăng nhập thất bại', 'Bạn có thể đóng cửa sổ này và quay lại ứng dụng.', script);
    }

    // ---------- Luồng ngoài (app/PWA): callback ghi KV, app poll ----------
    if (path === '/app/callback' && req.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      if (!RE_STATE.test(state)) return page('Yêu cầu không hợp lệ', 'Thiếu mã phiên đăng nhập.');
      const code = url.searchParams.get('code'), err = url.searchParams.get('error');
      let rec;
      if (err || !code) rec = { status: 'error', error: err || 'no_code' };
      else {
        const r = await exchange(env, { grant_type: 'authorization_code', code, redirect_uri: url.origin + '/app/callback' });
        rec = r.ok
          ? { status: 'ok', access_token: r.data.access_token, expires_in: r.data.expires_in || 3600, refresh_token: r.data.refresh_token || '' }
          : { status: 'error', error: r.data.error || 'exchange_failed' };
      }
      await env.KV.put('app:' + state, JSON.stringify(rec), { expirationTtl: 300 });
      return page(rec.status === 'ok' ? 'Đăng nhập thành công' : 'Đăng nhập thất bại', 'Quay lại ứng dụng để tiếp tục.');
    }
    if (path === '/app/poll' && req.method === 'GET') {
      const state = url.searchParams.get('state') || '';
      if (!RE_STATE.test(state)) return json({ status: 'error', error: 'bad_state' }, 400, c);
      const raw = await env.KV.get('app:' + state);
      if (!raw) return json({ status: 'pending' }, 200, c);
      await env.KV.delete('app:' + state); // đọc một lần
      return new Response(raw, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...c } });
    }

    // ---------- Thông báo cập nhật ----------
    if (path === '/notify/update') {
      if (req.method === 'GET') {
        const id = (await env.KV.get('notify:update-id')) || '';
        return json({ id }, 200, { ...c, 'Cache-Control': 'public, max-age=30' });
      }
      if (req.method === 'POST') {
        const auth = req.headers.get('Authorization') || '';
        const m = /^Bearer\s+(\S{10,4096})$/.exec(auth);
        if (!m) return json({ error: 'unauthorized' }, 401, c);
        const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + m[1] } });
        if (!u.ok) return json({ error: 'unauthorized' }, 401, c);
        const info = await u.json().catch(() => ({}));
        const email = String(info.email || '').toLowerCase();
        const admins = list(env.ADMIN_EMAILS).map((s) => s.toLowerCase());
        if (!email || info.email_verified === false || !admins.includes(email)) return json({ error: 'forbidden' }, 403, c);
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await env.KV.put('notify:update-id', id);
        return json({ id }, 200, c);
      }
    }

    return json({ error: 'not_found' }, 404, c);
  },
};
