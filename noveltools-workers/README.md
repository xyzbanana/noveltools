# NovelTools — bộ Cloudflare Worker cho frontend

Frontend gọi 3 loại Worker. Bộ này thay thế cả ba, mỗi Worker là **một file duy nhất**, dán thẳng vào trình soạn thảo của Cloudflare Dashboard (làm được hoàn toàn trên iPhone, không cần wrangler hay build).

| File | Thay cho | Frontend gọi từ | Cần KV? |
|---|---|---|---|
| `edge-tts.worker.js` | 18 Worker `edge-tts1…18` | `js/tts.js` | Không |
| `drive-auth.worker.js` | `noveltools-drive-auth` | `js/backup.js` | **Có** |
| `reviewer.worker.js` | `noveltools-reviewer` | `js/reviewer-chatbot.js`, `js/blog-link.js` | Có (chứa danh mục review) |

Dịch truyện **không** cần Worker: trình duyệt gọi thẳng Gemini/DeepSeek bằng API key của người dùng.

## 1. Tạo từng Worker (làm 3 lần)

1. Dashboard → **Workers & Pages** → **Create** → **Hello World** → đặt tên (vd `noveltools-tts`) → **Deploy**.
2. **Edit code** → xoá hết → dán nội dung file `.worker.js` tương ứng → **Deploy**.
3. Ghi lại URL dạng `https://noveltools-tts.<subdomain>.workers.dev`.
4. Cấu hình ở **Settings → Variables and Secrets** (xem từng mục dưới).
5. Nếu Worker cần KV: **Storage & Databases → KV → Create namespace**, rồi trong Worker vào **Settings → Bindings → Add → KV namespace**, đặt tên biến đúng là `KV`.

Mỗi Worker mở URL gốc `/` sẽ trả một dòng "… worker OK" để kiểm tra đã chạy.

## 2. Edge TTS (`edge-tts.worker.js`)

Biến (tuỳ chọn): `ALLOWED_ORIGINS` (vd `https://ten-ban.pages.dev`), `LOCAL_KEY`, `CHROMIUM_FULL_VERSION`.

- Một Worker thay cho cả pool 18 cái. Nếu sau này vượt quota (free: 100k request/ngày/tài khoản), tạo thêm Worker trên tài khoản khác và thêm URL vào mảng `SERVERS` trong `tts.js`.
- Giao thức Microsoft (token `Sec-MS-GEC` v2, version `2-143.0.3650.75`) lấy từ `edge-tts 7.3.1` và đã được đối chiếu với bản gốc. Đây là dịch vụ không công khai: nếu một ngày TTS báo lỗi `handshake`/403, hãy cập nhật `CHROMIUM_FULL_VERSION` hoặc thay bộ token theo bản `edge-tts` mới.
- Cache API chỉ hoạt động khi Worker gắn **tên miền riêng**; trên `*.workers.dev` nó không có tác dụng (vô hại).
- Giọng **TikTok** không đi qua Worker, nó nối thẳng tới CapCut bằng token cứng trong `tts.js`, nằm ngoài phạm vi bộ này.

## 3. Drive auth (`drive-auth.worker.js`)

**Bước A — tạo OAuth client của riêng bạn** (client id cũ trong `backup.js` thuộc chủ cũ, dùng không được):

1. console.cloud.google.com → tạo project → **APIs & Services → Library** → bật **Google Drive API**.
2. **OAuth consent screen**: điền thông tin cơ bản, thêm scope `.../auth/drive.appdata` và `.../auth/userinfo.email`. Để ở chế độ *Testing* thì phải thêm email của bạn vào **Test users**; muốn mọi người dùng thì bấm **Publish app**.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorized redirect URIs**, thêm đúng 2 dòng:
   - `https://<worker-drive-auth>.workers.dev/oauth/callback`
   - `https://<worker-drive-auth>.workers.dev/app/callback`
5. Lấy **Client ID** và **Client secret**.

**Bước B — cấu hình Worker:**

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `GOOGLE_CLIENT_ID` | Client ID |
| Secret | `GOOGLE_CLIENT_SECRET` | Client secret |
| Variable | `ALLOWED_ORIGINS` | **Bắt buộc**, vd `https://ten-ban.pages.dev` (nhiều origin thì cách nhau dấu phẩy) |
| Variable | `ADMIN_EMAILS` | Email được bấm "Thông báo update" |
| KV binding | `KV` | namespace bất kỳ |

`ALLOWED_ORIGINS` quyết định origin nào nhận được token qua `postMessage` và được gọi CORS, nên phải đúng domain Pages của bạn.

## 4. Reviewer (`reviewer.worker.js`)

Chatbot gợi ý truyện **chỉ gợi ý từ danh mục review của bạn** và không bịa ID. Danh mục gốc nằm ở một site review riêng của chủ cũ, không có trong zip, nên bạn tự cung cấp.

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `GEMINI_API_KEYS` | 1–5 key Gemini, cách nhau dấu phẩy (Worker tự xoay khi 429) |
| Secret | `ADMIN_TOKEN` | chuỗi bí mật dài, dùng để nạp danh mục |
| Variable | `GEMINI_MODEL` | tuỳ chọn, mặc định `gemini-flash-latest` |
| Variable | `ALLOWED_ORIGINS` | tuỳ chọn |
| Variable | `CHAT_GAP_SEC` / `CHAT_PER_HOUR` / `CHAT_PER_DAY` / `MATCH_PER_DAY` | tuỳ chọn, mặc định 2 / 30 / 100 / 15 |
| KV binding | `KV` | namespace bất kỳ |

**Nạp danh mục** (sửa `reviews.sample.json` theo mẫu rồi chạy trong Termius/Codespaces):

```bash
curl -X PUT "https://<worker-reviewer>.workers.dev/admin/reviews" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  --data-binary @reviews.json
```

Trường của mỗi review: `id` (chữ/số/`-`/`_`), `title`, `titleEn`, `titleOrig` + `authorOrig` (tên gốc dùng để khớp với truyện đang đọc), `author`, `genres[]`, `rating` (0–10), `cover` (https), `summary`, `status`.

Link trong thẻ gợi ý và toast vẫn trỏ tới site review mặc định `https://noveltools.pages.dev` (site của chủ cũ). Muốn trỏ sang site review của bạn:
- Trong `index.html`, thêm `<script>window.NT_REVIEWER_URL = 'https://site-review-cua-ban/';</script>` **trước** thẻ nạp `reviewer-chatbot.js`.
- Trong `js/blog-link.js`, đổi chuỗi `https://noveltools.pages.dev` ở dòng `var SITE = ...`.

Nếu bạn chưa có site review, chatbot vẫn hỏi đáp bình thường nhưng bấm vào thẻ truyện sẽ không mở được trang nào.

Lưu ý: giới hạn tần suất của Worker này nằm **trong bộ nhớ isolate**, đủ chặn bấm dồn và spam thông thường nhưng không chính xác tuyệt đối. Trần thật sự là quota của các key Gemini.

## 5. Đổi URL ở frontend

Chạy trong thư mục gốc frontend (nơi có `js/`), vd GitHub Codespaces:

```bash
bash patch-frontend.sh \
  https://<worker-tts>.workers.dev \
  https://<worker-drive-auth>.workers.dev \
  https://<worker-reviewer>.workers.dev \
  <GOOGLE_CLIENT_ID> \
  <email-admin@gmail.com>
```

Script thay: danh sách `SERVERS` trong `tts.js`; `AUTH_WORKER_URL`, `DRIVE_CLIENT_ID`, `UPDATE_ADMIN_EMAILS` trong `backup.js`; URL Reviewer trong `reviewer-chatbot.js` và `blog-link.js`; và **tắt** `CHATBOT_FEEDBACK_ENDPOINT` trong `index.html` (mặc định nó gửi phản hồi 👎 của chatbot tới Google Apps Script của chủ cũ). Sau đó commit và deploy lại Pages.

## 6. Kiểm tra nhanh

- TTS: mở màn nghe truyện, phát một đoạn. Lỗi `502 handshake` nghĩa là Microsoft từ chối (xem mục 2).
- Drive: đăng nhập Google ở mục Sao lưu. Lỗi `redirect_uri_mismatch` nghĩa là chưa thêm đủ 2 redirect URI ở bước A.
- Thông báo update: đăng nhập bằng email trong `ADMIN_EMAILS`, bấm "Thông báo update".
- Reviewer: mở chat Review truyện, hỏi thử; chat trả "chưa có review" nếu KV chưa có danh mục.
