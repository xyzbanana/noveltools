/*
 * tts-local-key.js — CHỈ DÙNG TRÊN MÁY LOCAL
 *
 * KHÔNG commit và KHÔNG deploy file này lên Cloudflare Pages.
 * Thêm tên file vào .gitignore. Nếu lỡ deploy, khoá bị lộ công khai:
 * hãy đổi LOCAL_KEY trên các Worker ngay (Settings → Variables and Secrets).
 *
 * Tạo khoá ngẫu nhiên (chạy một trong hai):
 *   openssl rand -hex 32
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Dán cùng một khoá này vào secret LOCAL_KEY của từng Worker.
 */
window.TTS_LOCAL_KEY = 'DAYLAADMINTTSKEY';
