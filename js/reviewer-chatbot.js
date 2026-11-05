/* =====================================================================
 * reviewer-chatbot.js — Trợ lý AI cho NovelTools - Reviewer
 * Giao diện theo chatbot.js bên index (nút tròn góc dưới-phải → panel nổi, chip gợi ý, bong bóng, đang gõ, mở rộng, bottom sheet mobile).
 * KHÁC index: không có API key nào ở trình duyệt. Chỉ gửi các tin nhắn tới Worker (POST /chat); Worker giữ khoá Gemini, khoá model,
 * xoay key, tự dựng dữ liệu review. Câu trả lời có thể kèm thẻ truyện (server đã kiểm tra id có thật).
 * Nạp SAU cùng (defer) — không phụ thuộc bundle React của trang, chỉ đọc html[lang], class "dark" và hash "#review-<id>".
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__rvChatLoaded) return;
  window.__rvChatLoaded = true;

  // Chế độ NHÚNG (dùng trong công cụ dịch, xem chatbot.js): đặt window.NT_REVIEWER_EMBED = true TRƯỚC khi nạp
  // file này. Khi bật: không tự tạo nút tròn #rvChatBtn riêng (được mở từ chip "Review truyện" bên chatbot.js),
  // panel có thêm thanh "‹ Quay lại NovelTools", và nút "Cuộc trò chuyện mới" quay về giao diện chatbot dịch
  // thay vì chỉ xoá hội thoại. Hàm mở/đóng được lộ ra window.openReviewerChat/closeReviewerChat để bên
  // chatbot.js gọi; chatbot.js cũng cần lộ window.openChatbotPanel để backToHost() gọi ngược lại được.
  const EMBED = !!window.NT_REVIEWER_EMBED;

  // Địa chỉ Worker: mặc định cùng Worker với lượt thích/bình luận. Đổi bằng: <script>window.NT_CHAT_API = 'https://...'</script> đặt TRƯỚC file này.
  const API = String(window.NT_CHAT_API || 'https://noveltools-reviewer.thienco-tcc.workers.dev').replace(/\/+$/, '');
  // Gốc URL để dựng link "Đọc review" trong thẻ truyện. Khi KHÔNG nhúng, trang review đang mở sẵn nên dùng
  // đúng location.href hiện tại (đã có /reviewer/ nếu blog nằm ở đó). Khi NHÚNG vào công cụ dịch, location.href
  // lại là trang công cụ dịch (vd noveltools.pages.dev/) chứ không phải trang blog, nên phải trỏ cứng sang
  // đúng gốc blog — đổi bằng: <script>window.NT_REVIEWER_URL = 'https://...'</script> đặt TRƯỚC file này.
  const REVIEW_BASE = EMBED
    ? String(window.NT_REVIEWER_URL || 'https://noveltools.pages.dev/reviewer/').replace(/\/*$/, '/')
    : location.href.split('#')[0];
  const MAX_TURNS = 8;          // chỉ gửi tối đa từng này lượt hỏi gần nhất (Worker cũng tự cắt)
  const MAX_INPUT = 800;        // khớp giới hạn ở Worker

  const ICON = '<svg viewBox="17 18 66 64" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="m43.16 65.512c-1.4297-0.16016-5.5-0.92188-7.1289-2.5391-1.6211-1.6211-2.3789-5.6992-2.5391-7.1289-0.078126-0.76172-0.73047-1.3398-1.4883-1.3398-0.76953 0-1.4102 0.57812-1.4883 1.3398-0.14844 1.4297-0.91016 5.5-2.5391 7.1289-1.6211 1.6211-5.6992 2.3789-7.1289 2.5391-0.76172 0.078125-1.3398 0.73047-1.3398 1.4883 0 0.76172 0.57813 1.4102 1.3398 1.4883 1.4297 0.14844 5.5 0.91016 7.1289 2.5391 1.6289 1.6289 2.3789 5.6992 2.5391 7.1289 0.078125 0.76172 0.73047 1.3398 1.4883 1.3398 0.76172 0 1.4102-0.57812 1.4883-1.3398 0.16016-1.4297 0.92187-5.5 2.5391-7.1289 1.6211-1.6289 5.6992-2.3789 7.1289-2.5391 0.76172-0.078125 1.3398-0.73047 1.3398-1.4883 0-0.76172-0.57812-1.4102-1.3398-1.4883z"/><path d="m79.512 43.012c-0.10938-0.011719-11.121-1.25-15.52-5.6484-4.3984-4.3984-5.6289-15.41-5.6484-15.52-0.078125-0.76172-0.71875-1.3398-1.4883-1.3398s-1.4102 0.57812-1.4883 1.3398c-0.011719 0.10938-1.25 11.121-5.6484 15.52-4.3984 4.3984-15.41 5.6289-15.52 5.6484-0.76172 0.078125-1.3398 0.73047-1.3398 1.4883 0 0.76172 0.57812 1.4102 1.3398 1.4883 0.10938 0.011719 11.121 1.25 15.52 5.6484 4.3984 4.3984 5.6289 15.41 5.6484 15.52 0.078124 0.76172 0.71875 1.3398 1.4883 1.3398s1.4102-0.57812 1.4883-1.3398c0.011719-0.10938 1.25-11.121 5.6484-15.52 4.3984-4.3984 15.41-5.6289 15.52-5.6484 0.76172-0.078125 1.3398-0.73047 1.3398-1.4883 0-0.76172-0.57812-1.4102-1.3398-1.4883z"/><path d="m34.5 30.5c0 5.332-8 5.332-8 0s8-5.332 8 0"/></svg>';
  const T = {
    vi: {
      title: 'Trợ lý AI', beta: '(beta)', sub: 'Gợi ý & review truyện',
      hello: 'Chào bạn! Mình là trợ lý của NovelTools - Reviewer. Bạn muốn tìm truyện kiểu nào, hay cần hỏi gì về các review?',
      chips: ['Gợi ý truyện nhẹ nhàng, dễ đọc', 'Có truyện tiên hiệp nào hay không?', 'Truyện nào có nữ chính mạnh?', 'Truyện nào đã hoàn thành, đáng đọc?'],
      placeholder: 'Nhập câu hỏi...', send: 'Gửi', close: 'Đóng', open: 'Trợ lý AI', expand: 'Mở rộng', shrink: 'Thu nhỏ', fresh: 'Cuộc trò chuyện mới',
      read: 'Đọc review', back: 'Quay lại NovelTools',
      copy: 'Sao chép', copied: 'Đã sao chép', retry: 'Gửi lại câu hỏi này',
      fbUp: 'Trả lời hữu ích', fbDown: 'Trả lời chưa tốt', fbThanksUp: 'Cảm ơn bạn!', fbThanksDown: 'Cảm ơn góp ý — mình sẽ cải thiện.',
      e_net: 'Không kết nối được. Bạn kiểm tra mạng rồi thử lại nhé.', e_time: 'Trợ lý trả lời quá lâu. Bạn thử hỏi lại nhé.',
      e_fast: (s) => 'Bạn hỏi nhanh quá, đợi ' + s + ' giây rồi thử lại nhé.',
      e_hourly: (m) => 'Bạn đã hỏi khá nhiều trong 1 giờ qua. Thử lại sau khoảng ' + m + ' phút nhé.',
      e_daily: 'Hôm nay bạn đã dùng hết lượt hỏi trợ lý, mai quay lại nhé.',
      e_busy: 'Trợ lý đang quá tải hoặc hết lượt hôm nay. Bạn thử lại sau ít phút nhé.',
      e_blocked: 'Trợ lý không trả lời được câu này. Bạn thử diễn đạt khác nhé.',
      e_off: 'Trợ lý đang tạm dừng để bảo trì. Bạn quay lại sau nhé.', e_gen: 'Có lỗi xảy ra, bạn thử lại sau nhé.',
    },
    en: {
      title: 'AI Assistant', beta: '(beta)', sub: 'Story picks & reviews',
      hello: "Hi! I'm the NovelTools - Reviewer assistant. Tell me what kind of story you're after, or ask anything about the reviews.",
      chips: ['Suggest a light, easy read', 'Any good xianxia stories?', 'Which stories have a strong female lead?', 'Which completed stories are worth reading?'],
      placeholder: 'Type your question...', send: 'Send', close: 'Close', open: 'AI Assistant', expand: 'Expand', shrink: 'Collapse', fresh: 'New conversation',
      read: 'Read review', back: 'Back to NovelTools',
      copy: 'Copy', copied: 'Copied', retry: 'Resend this question',
      fbUp: 'Helpful answer', fbDown: 'Not helpful', fbThanksUp: 'Thanks!', fbThanksDown: "Thanks for the feedback — we'll improve.",
      e_net: "Couldn't connect. Check your network and try again.", e_time: 'The assistant took too long. Please try again.',
      e_fast: (s) => "You're asking too fast. Wait " + s + ' seconds and try again.',
      e_hourly: (m) => "You've asked quite a lot in the past hour. Try again in about " + m + ' minutes.',
      e_daily: "You've used up today's questions. Come back tomorrow!",
      e_busy: 'The assistant is overloaded or out of quota for today. Please try again in a few minutes.',
      e_blocked: "The assistant couldn't answer that. Try rephrasing.",
      e_off: 'The assistant is paused for maintenance. Please come back later.', e_gen: 'Something went wrong. Please try again later.',
    },
  };
  const lang = () => (String(document.documentElement.lang || 'vi').toLowerCase().indexOf('en') === 0 ? 'en' : 'vi');
  const tr = () => T[lang()];

  // ---------- BỘ LỌC THỂ LOẠI (nút phễu ở header) ----------
  // Bảng thể loại giống trang "Tất cả review" (nhóm + chip). Mặc định BỎ CHỌN Đam Mỹ và Bách Hợp; người dùng bật/tắt
  // từng thể loại, lựa chọn nhớ trên máy (khoá riêng rvc_ex_genres_v1, không đụng bộ lọc của trang review).
  // Danh sách bỏ chọn được gửi lên Worker qua ctx.exGenres; thẻ truyện trả về có kèm mảng genres cũng bị ẩn ở phía trình duyệt.
  const GROUPS = [{"name": "Kỳ ảo & Tu luyện", "list": ["Tiên Hiệp", "Huyền Huyễn", "Võ Hiệp", "Dị Giới", "Fantasy Phương Tây", "Dị Năng"]}, {"name": "Game & Hệ thống", "list": ["Hệ Thống", "Game Võng Du", "LitRPG", "Hunter & Dungeon"]}, {"name": "Xuyên không & Tái sinh", "list": ["Xuyên Không", "Trọng Sinh", "Hồi Quy", "Chuyển Sinh", "Vô Hạn Lưu"]}, {"name": "Hiện đại & Đời sống", "list": ["Đô Thị", "Học Đường", "Đời Thường", "Điền Văn", "Thương Trường", "Nghề Nghiệp", "Giải Trí", "Thể Thao", "Âm Nhạc", "Ẩm Thực"]}, {"name": "Tình cảm", "list": ["Ngôn Tình", "Tình Cảm Hài", "Harem", "Đam Mỹ", "Bách Hợp", "Romance Fantasy", "Nữ Phản Diện"]}, {"name": "Hành động & Phiêu lưu", "list": ["Hành Động", "Phiêu Lưu", "Sinh Tồn", "Mạt Thế", "Quân Sự", "Siêu Anh Hùng", "Mecha"]}, {"name": "Lịch sử & Cổ trang", "list": ["Lịch Sử", "Cổ Đại", "Cung Đấu", "Đồng Nhân"]}, {"name": "Khoa học & Tương lai", "list": ["Khoa Huyễn", "Cyberpunk", "Không Gian"]}, {"name": "Bí ẩn & Kinh dị", "list": ["Trinh Thám", "Linh Dị", "Kinh Dị", "Tâm Lý"]}, {"name": "Sắc thái", "list": ["Hài Hước", "Drama"]}, {"name": "Loại truyện", "list": ["Light Novel", "Web Novel Hàn"]}];
  const GROUP_EN = {"Kỳ ảo & Tu luyện": "Fantasy & Cultivation", "Game & Hệ thống": "Game & System", "Xuyên không & Tái sinh": "Transmigration & Rebirth", "Hiện đại & Đời sống": "Modern & Daily Life", "Tình cảm": "Love & Romance", "Hành động & Phiêu lưu": "Action & Adventure", "Lịch sử & Cổ trang": "History & Costume Drama", "Khoa học & Tương lai": "Sci-Fi & Future", "Bí ẩn & Kinh dị": "Mystery & Horror", "Sắc thái": "Tone", "Loại truyện": "Format"};
  const GENRE_EN = {"Tiên Hiệp": "Xianxia", "Huyền Huyễn": "Xuanhuan", "Võ Hiệp": "Wuxia", "Dị Giới": "Isekai", "Fantasy Phương Tây": "Western Fantasy", "Dị Năng": "Supernatural Powers", "Hệ Thống": "System", "Game Võng Du": "VRMMO", "LitRPG": "LitRPG", "Hunter & Dungeon": "Hunter & Dungeon", "Xuyên Không": "Transmigration", "Trọng Sinh": "Rebirth", "Hồi Quy": "Regression", "Chuyển Sinh": "Reincarnation", "Vô Hạn Lưu": "Infinite Flow", "Đô Thị": "Urban", "Học Đường": "School Life", "Đời Thường": "Slice of Life", "Điền Văn": "Pastoral Life", "Thương Trường": "Business", "Nghề Nghiệp": "Workplace", "Giải Trí": "Entertainment Industry", "Thể Thao": "Sports", "Âm Nhạc": "Music", "Ẩm Thực": "Culinary", "Ngôn Tình": "Romance", "Tình Cảm Hài": "Romantic Comedy", "Harem": "Harem", "Đam Mỹ": "Boys' Love", "Bách Hợp": "Girls' Love", "Romance Fantasy": "Romance Fantasy", "Nữ Phản Diện": "Villainess", "Hành Động": "Action", "Phiêu Lưu": "Adventure", "Sinh Tồn": "Survival", "Mạt Thế": "Apocalypse", "Quân Sự": "Military", "Siêu Anh Hùng": "Superhero", "Mecha": "Mecha", "Lịch Sử": "Historical", "Cổ Đại": "Ancient Era", "Cung Đấu": "Palace Intrigue", "Đồng Nhân": "Fan Fiction", "Khoa Huyễn": "Sci-Fi", "Cyberpunk": "Cyberpunk", "Không Gian": "Space Opera", "Trinh Thám": "Mystery", "Linh Dị": "Supernatural Horror", "Kinh Dị": "Horror", "Tâm Lý": "Psychological", "Hài Hước": "Comedy", "Drama": "Drama", "Light Novel": "Light Novel", "Web Novel Hàn": "Korean Web Novel"};
  const F = {
    vi: { title: 'Bộ lọc thể loại', all: 'Chọn tất cả', search: 'Tìm thể loại…', none: 'Không có thể loại phù hợp.',
      hint: 'Chạm vào thể loại để bật/tắt. Thể loại bị bỏ chọn sẽ không được gợi ý.', off: 'Đang bỏ chọn: ', reset: 'Đặt lại', done: 'Xong', close: 'Đóng' },
    en: { title: 'Genre filter', all: 'Select all', search: 'Search genres…', none: 'No matching genres.',
      hint: "Tap a genre to toggle it. Deselected genres won't be suggested.", off: 'Deselected: ', reset: 'Reset', done: 'Done', close: 'Close' },
  };
  const fr = () => F[lang()];
  const EX_KEY = 'rvc_ex_genres_v1', EX_DEFAULT = ['Đam Mỹ', 'Bách Hợp'], EX_LOOSE = ['Đam Mỹ', 'Bách Hợp'];
  function exLoad() {
    try { const r = localStorage.getItem(EX_KEY); if (r != null) { const a = JSON.parse(r); if (Array.isArray(a)) return a.filter((x) => typeof x === 'string').slice(0, 60); } } catch (e) {}
    return EX_DEFAULT.slice();
  }
  let exGenres = exLoad();
  function exSave() { try { localStorage.setItem(EX_KEY, JSON.stringify(exGenres)); } catch (e) {} }
  // Cùng quy tắc với trang review: Đam Mỹ / Bách Hợp khớp cả tên cũ có chứa cụm đó; thể loại khác chỉ khớp đúng tên.
  const exHit = (genres) => exGenres.length > 0 && (genres || []).some((g) => exGenres.some((x) => g === x || (EX_LOOSE.indexOf(x) >= 0 && String(g).indexOf(x) >= 0)));
  const gname = (x) => (lang() === 'en' ? (GENRE_EN[x] || x) : x);
  const gpname = (x) => (lang() === 'en' ? (GROUP_EN[x] || x) : x);

  let bubbles = [];   // [{role:'user'|'model', text}] — chỉ giữ trong phiên (mất khi tải lại trang, giống index)
  let sending = false, built = false;

  // ---------- tiện ích ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const MARK = /\[\[review:([A-Za-z0-9_-]{1,64})\]\]/g;

  // Mã thiết bị: dùng chung khoá với lượt thích/bình luận của trang (nt-rv-dev) để Worker đếm giới hạn theo thiết bị.
  function dev() {
    try {
      let d = localStorage.getItem('nt-rv-dev');
      if (!d || d.length < 16) {
        d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
        localStorage.setItem('nt-rv-dev', d);
      }
      return d;
    } catch (e) { return ''; }
  }
  // Bài đang xem (trang dùng history.replaceState nên location.hash luôn đúng): gửi id để Worker đưa mở đầu bài vào ngữ cảnh.
  function currentReview() {
    const m = /^#review-(.+)$/.exec(location.hash || '');
    if (!m) return '';
    try { const id = decodeURIComponent(m[1]); return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : ''; } catch (e) { return ''; }
  }
  const pic = (u, w) => /^https?:\/\//i.test(u || '') ? 'https://wsrv.nl/?url=' + encodeURIComponent(u) + '&w=' + w + '&output=webp' : '';

  // ---------- icon nút phụ (copy/retry/like-dislike) ----------
  const ICON_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const ICON_FILTER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
  const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const ICON_RETRY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
  const FB_ICON_UP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>';
  const FB_ICON_DOWN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>';

  // Sao chép vào clipboard: ưu tiên Clipboard API, textarea ẩn + execCommand làm dự phòng cho trình duyệt
  // cũ/không cấp quyền. copiedTitle (tuỳ chọn) đổi tooltip tạm thời để xác nhận đã sao chép.
  function copyToClipboard(text, btn, copiedTitle) {
    const showCopied = () => {
      const prevHtml = btn.innerHTML, prevTitle = btn.title;
      btn.innerHTML = ICON_CHECK;
      btn.classList.add('copied');
      if (copiedTitle) { btn.title = copiedTitle; btn.setAttribute('aria-label', copiedTitle); }
      setTimeout(() => {
        btn.innerHTML = prevHtml; btn.classList.remove('copied');
        btn.title = prevTitle; btn.setAttribute('aria-label', prevTitle);
      }, 1400);
    };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.pointerEvents = 'none';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showCopied();
      } catch (e) {}
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(showCopied).catch(fallback);
    else fallback();
  }
  // Nội dung sao chép: câu hỏi của người dùng giữ nguyên; câu trả lời của bot bỏ dòng đánh dấu thẻ truyện [[review:id]].
  function copyableText(role, text) { return role === 'user' ? String(text) : String(text).replace(MARK, '').trim(); }

  // ===== ĐÁNH GIÁ 👍/👎 dưới câu trả lời của bot — giống chatbot công cụ dịch (chatbot.js), bản rút gọn:
  // log lưu localStorage (rv_chat_feedback_log, tối đa 200 mục, xem qua console: reviewerChatFeedbackLog()/
  // reviewerChatFeedbackExport()). Muốn thu thập từ người dùng khác thì đặt window.NT_REVIEWER_FEEDBACK_ENDPOINT
  // = URL nhận POST (để trống = không gửi đi đâu) — chỉ bản ghi 👎 mới được gửi, đã che API key/email.
  const RVFB_KEY = 'rv_chat_feedback_log';
  const RVFB_MAX = 200;
  function rvfbRedact(t) {
    return String(t == null ? '' : t)
      .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[đã ẩn API key]')
      .replace(/\bsk-[A-Za-z0-9_\-]{16,}/g, '[đã ẩn API key]')
      .replace(/[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/g, '[đã ẩn email]');
  }
  function rvfbLoad() { try { const a = JSON.parse(localStorage.getItem(RVFB_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function rvfbSave(list) { try { localStorage.setItem(RVFB_KEY, JSON.stringify(list.slice(-RVFB_MAX))); } catch (e) {} }
  function rvfbUpsert(entry) {
    const list = rvfbLoad();
    const i = list.findIndex((e) => e.id === entry.id);
    if (i >= 0) list[i] = Object.assign(list[i], entry); else list.push(entry);
    rvfbSave(list);
    const full = i >= 0 ? list[i] : entry;
    try { if (typeof gtag === 'function') gtag('event', 'reviewer_chatbot_feedback', { rating: full.rating }); } catch (e) {}
    try {
      const url = window.NT_REVIEWER_FEEDBACK_ENDPOINT;
      if (url && typeof url === 'string' && full.rating === 'down' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(full)], { type: 'text/plain;charset=UTF-8' }));
      }
    } catch (e) {}
  }
  window.reviewerChatFeedbackLog = function (rating) { const l = rvfbLoad(); return rating ? l.filter((e) => e.rating === rating) : l; };
  window.reviewerChatFeedbackExport = function () {
    const blob = new Blob([JSON.stringify(rvfbLoad(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'reviewer-chatbot-feedback.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  // Dựng cặp nút 👍/👎 (idx: vị trí của câu trả lời này trong mảng bubbles, dùng để lấy lại câu hỏi tương
  // ứng cho vào log) — trả về phần tử để attachTools() gắn vào CHUNG 1 hàng với nút copy (copy đứng trước).
  function buildFeedback(row, idx, text) {
    const t = tr();
    const q = (idx > 0 && bubbles[idx - 1] && bubbles[idx - 1].role === 'user') ? bubbles[idx - 1].text : '';
    const id = 'rvfb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const base = { id, t: new Date().toISOString(), q: rvfbRedact(q).slice(0, 300), a: rvfbRedact(text).slice(0, 600) };
    let current = '';
    const bar = document.createElement('div'); bar.className = 'rvc-fb';
    const note = document.createElement('span'); note.className = 'rvc-fb-note';
    const mk = (kind, title, svg) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'rvc-fb-btn'; btn.title = title; btn.setAttribute('aria-label', title);
      btn.innerHTML = svg;
      btn.addEventListener('click', () => {
        if (current === kind) return; // đã chọn rồi
        current = kind;
        up.classList.toggle('active', kind === 'up');
        down.classList.toggle('active', kind === 'down');
        rvfbUpsert(Object.assign({}, base, { rating: kind }));
        note.textContent = kind === 'up' ? t.fbThanksUp : t.fbThanksDown;
      });
      return btn;
    };
    const up = mk('up', t.fbUp, FB_ICON_UP);
    const down = mk('down', t.fbDown, FB_ICON_DOWN);
    bar.appendChild(up); bar.appendChild(down); bar.appendChild(note);
    return bar;
  }
  // Xoá câu hỏi cũ (bubble này) + mọi bubble sau nó (cả DOM lẫn mảng bubbles), rồi gửi lại đúng câu hỏi đó.
  function retryQuestion(row, idx, text) {
    if (sending) return;
    if (typeof idx === 'number') bubbles = bubbles.slice(0, idx);
    const wrap = $('rvcMsgs');
    if (wrap && row && wrap.contains(row)) {
      let cur = row;
      while (cur) { const nxt = cur.nextSibling; wrap.removeChild(cur); cur = nxt; }
    }
    send(text);
  }
  // Gắn thanh nút phụ dưới nội dung bubble: copy (mọi bubble) — xoay retry (chỉ bubble người dùng) —
  // 👍/👎 (chỉ bubble model, đặt sau nút copy trong CÙNG 1 hàng thay vì 1 hàng riêng bên dưới).
  // idx: vị trí của bubble này trong mảng bubbles (dùng cho retry cắt bớt lịch sử + feedback lấy lại câu hỏi).
  function attachTools(row, bubbleEl, role, text, idx) {
    const t = tr();
    const bar = document.createElement('div'); bar.className = 'rvc-tools';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button'; copyBtn.className = 'rvc-tool-btn'; copyBtn.title = t.copy; copyBtn.setAttribute('aria-label', t.copy);
    copyBtn.innerHTML = ICON_COPY;
    copyBtn.addEventListener('click', () => copyToClipboard(copyableText(role, text), copyBtn, t.copied));
    bar.appendChild(copyBtn);
    if (role === 'user') {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button'; retryBtn.className = 'rvc-tool-btn'; retryBtn.title = t.retry; retryBtn.setAttribute('aria-label', t.retry);
      retryBtn.innerHTML = ICON_RETRY;
      retryBtn.addEventListener('click', () => retryQuestion(row, idx, text));
      bar.appendChild(retryBtn);
    }
    if (role === 'model') bar.appendChild(buildFeedback(row, idx, text));
    // Đặt NGOÀI bubble (bên dưới hẳn khung chat), làm anh em với bubbleEl trong row — không nhét vào trong nữa.
    row.appendChild(bar);
  }

  // ---------- hiển thị ----------
  function cardHtml(c) {
    const t = lang() === 'en' && c.titleEn ? c.titleEn : c.title;
    const href = REVIEW_BASE + '#review-' + encodeURIComponent(c.id);
    const src = pic(c.cover, 96);
    const img = src
      ? '<img class="rvc-cov" src="' + esc(src) + '" data-orig="' + esc(c.cover) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      : '<span class="rvc-cov"></span>';
    return '<a class="rvc-card" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(tr().read) + '">' + img +
      '<span class="rvc-ct"><b>' + esc(t) + '</b><small>' + esc(c.author || '') + (c.rating ? ' · ★ ' + esc(c.rating) : '') + '</small></span>' +
      '<svg class="rvc-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg></a>';
  }
  // Tối giản như index: escape HTML trước, rồi mới thay **đậm** và "- " → "•"; dòng [[review:id]] thành thẻ truyện (chỉ id có trong cards do server xác nhận).
  function fmt(text, cards) {
    const parts = String(text).split(MARK); // [text, id, text, id, ...]
    let out = '', run = [];
    const flush = () => { if (run.length) { out += '<div class="rvc-cards">' + run.join('') + '</div>'; run = []; } };
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        const seg = parts[i].replace(/^\s+|\s+$/g, ''); // cắt cả khoảng trắng/dòng trống thừa hai đầu để không sinh <br> dư sát thẻ
        if (!seg.trim()) continue;
        flush();
        out += esc(seg)
          .replace(/\[([^\[\]]{1,80})\]\((https?:\/\/[^\s()<>]+)\)/g, function (_, label, url) {
            const clean = label.replace(/\s*(?:&gt;|>|→|›)+\s*$/i, '').trim();
            return '<a class="rvc-act-btn" href="' + url + '" target="_blank" rel="noopener">' + clean +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></a>';
          })
          .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
          .replace(/^([ \t]*)[*\-][ \t]+/gm, '$1• ')
          .replace(/\n+/g, '<br><br>')
          .replace(/^(?:\s*<br>)+|(?:<br>\s*)+$/g, '');
      } else if (cards && cards[parts[i]] && !(Array.isArray(cards[parts[i]].genres) && exHit(cards[parts[i]].genres))) run.push(cardHtml(cards[parts[i]]));
    }
    flush();
    return out;
  }
  function scrollDown() { const el = $('rvcMsgs'); if (el) el.scrollTop = el.scrollHeight; }
  function addBubble(role, text, opts) {
    const wrap = $('rvcMsgs'); if (!wrap) return null;
    const row = document.createElement('div');
    row.className = 'rvc-row ' + role;
    const b = document.createElement('div');
    b.className = 'rvc-bubble ' + role + (opts && opts.err ? ' err' : '');
    if (role === 'user') b.textContent = text; else b.innerHTML = fmt(text, opts && opts.cards);
    row.appendChild(b); wrap.appendChild(row);
    // Chỉ gắn nút phụ (copy/retry/feedback) cho bubble THẬT SỰ nằm trong lịch sử hội thoại (có idx hợp lệ) —
    // bubble lỗi (opts.err, không được đẩy vào mảng bubbles) không có nút này.
    if (opts && typeof opts.idx === 'number') attachTools(row, b, role, text, opts.idx);
    scrollDown();
    return row;
  }
  // Ảnh bìa qua wsrv.nl lỗi thì quay về link gốc (giống ntFb của trang), lỗi nữa thì ẩn.
  document.addEventListener('error', function (e) {
    const im = e.target;
    if (!im || im.tagName !== 'IMG' || !im.classList.contains('rvc-cov')) return;
    if (im.dataset.fb) { im.style.visibility = 'hidden'; return; }
    im.dataset.fb = '1'; im.src = im.dataset.orig;
  }, true);
  function typing(on) {
    const old = $('rvcTyping'); if (old) old.remove();
    if (!on) return;
    const wrap = $('rvcMsgs'); if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'rvc-row model'; row.id = 'rvcTyping';
    row.innerHTML = '<div class="rvc-bubble model rvc-typing"><span></span><span></span><span></span></div>';
    wrap.appendChild(row); scrollDown();
  }

  function welcome() {
    const wrap = $('rvcMsgs'); if (!wrap) return;
    const t = tr();
    wrap.innerHTML = '<div class="rvc-row model"><div class="rvc-bubble model">' + esc(t.hello) + '</div></div>' +
      '<div class="rvc-suggest" id="rvcSuggest">' + t.chips.map((c) => '<button type="button" class="rvc-chip">' + esc(c) + '</button>').join('') + '</div>';
    $('rvcSuggest').addEventListener('click', function (e) {
      const b = e.target.closest('.rvc-chip'); if (b) send(b.textContent.trim());
    });
  }
  // Bot HỎI LẠI (chưa hiểu ý) → Worker trả kèm choices: vẽ thành các nút bấm nhanh dưới bubble, dùng lại đúng class/id của chip gợi ý
  // ở màn chào (#rvcSuggest) nên send() tự xoá chúng khi người dùng bấm hoặc gõ câu khác, và retryQuestion() xoá luôn cùng các bubble sau nó.
  function showChoices(list) {
    const wrap = $('rvcMsgs');
    if (!wrap || !Array.isArray(list) || list.length < 2) return;
    const old = $('rvcSuggest'); if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'rvc-suggest'; box.id = 'rvcSuggest';
    list.slice(0, 4).forEach(function (c) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rvc-chip'; b.textContent = String(c).slice(0, 80);
      box.appendChild(b);
    });
    box.addEventListener('click', function (e) {
      const b = e.target.closest('.rvc-chip'); if (b) send(b.textContent.trim());
    });
    wrap.appendChild(box); scrollDown();
  }
  // Đổi ngôn ngữ trang (menu avatar) → đổi chữ của khung chat; cuộc trò chuyện đang có thì giữ nguyên.
  function applyLang() {
    const t = tr();
    const btn = $('rvChatBtn'); if (btn) { btn.title = t.open; btn.setAttribute('aria-label', t.open); }
    if (!built) return;
    const set = (id, k) => { const el = $(id); if (el) { el.title = t[k]; el.setAttribute('aria-label', t[k]); } };
    $('rvcTitle').innerHTML = esc(t.title) + ' <span class="rvc-beta">' + esc(t.beta) + '</span>';
    $('rvcSub').textContent = t.sub;
    $('rvcInput').placeholder = t.placeholder;
    set('rvcNew', 'fresh'); set('rvcClose', 'close'); set('rvcSend', 'send'); expandIcon();
    { const fb = $('rvcFilter'); if (fb) { fb.title = fr().title; fb.setAttribute('aria-label', fr().title); } fpTexts(); fpList(); fpNote(); }
    if (EMBED) { const bt = $('rvcBackTx'); if (bt) bt.textContent = t.back; }
    $('rvChatPanel').setAttribute('aria-label', t.title);
    if (!bubbles.length) welcome();
  }

  // ---------- gửi / nhận ----------
  function history() {
    let turns = 0, from = 0;
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].role === 'user' && ++turns === MAX_TURNS) { from = i; break; }
    return bubbles.slice(from).map((b) => ({ role: b.role, text: b.text }));
  }
  function errText(er) {
    const t = tr();
    switch (er.code) {
      case 'too_fast': return t.e_fast(Math.max(1, er.retry || 3));
      case 'hourly': return t.e_hourly(Math.max(1, Math.ceil((er.retry || 600) / 60)));
      case 'daily': return t.e_daily;
      case 'busy': case 'upstream': return t.e_busy;
      case 'blocked': case 'empty': return t.e_blocked;
      case 'not_configured': case 'model_unavailable': case 'forbidden': return t.e_off;
      case 'net': return t.e_net;
      case 'timeout': return t.e_time;
      default: return t.e_gen + ' (' + (er.code || 'error') + ')';
    }
  }
  // Các mã lỗi TẠM THỜI, thử lại có cơ may thành công: mạng chập chờn, Worker/Gemini quá tải, hoặc chính Worker
  // báo hết key khả dụng lúc đó (busy/upstream — worker.js đã tự xoay tối đa 5 key trước khi trả lỗi này).
  // KHÔNG thử lại: too_fast/hourly/daily (giới hạn tần suất — thử lại chỉ tính thêm 1 lượt, có thể bị chặn nặng
  // hơn), blocked/empty (nội dung/câu hỏi, thử lại y hệt vẫn vậy), not_configured/model_unavailable/forbidden
  // (lỗi cấu hình, không tự hết được).
  const RETRYABLE = new Set(['net', 'timeout', 'busy', 'upstream']);
  const MAX_ASK_TRIES = 10;
  // worker.js tính MỌI lượt gọi /chat (kể cả lần thử lại, kể cả khi kết quả là lỗi) vào chat_log NGAY TRƯỚC khi
  // gọi Gemini, và chặn 2 lượt cách nhau dưới CHAT_LIM.dev.gap giây (hiện 2s) bằng lỗi "too_fast" — lỗi này
  // KHÔNG nằm trong RETRYABLE nên sẽ dừng vòng lặp ngay. Vì vậy khoảng nghỉ giữa các lần thử lại ở đây PHẢI
  // lớn hơn gap đó, nếu không lần thử lại tự dính "too_fast" ngay từ lần 2, vô hiệu hoá MAX_ASK_TRIES.
  const RETRY_GAP_MS = 2200; // > CHAT_LIM.dev.gap (2s) bên worker.js — đổi cả 2 nếu chỉnh gap
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  async function askOnce() {
    const c = new AbortController(), timer = setTimeout(() => c.abort(), 60000), d = dev();
    try {
      const r = await fetch(API + '/chat' + (d ? '?dev=' + encodeURIComponent(d) : ''), {
        method: 'POST', signal: c.signal, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        // embed: true khi khung chat này đang mở BÊN TRONG công cụ dịch (xem EMBED) — Worker sẽ bỏ dòng nút
        // "Dịch ngay" quảng cáo công cụ dịch, vì người dùng đang ở sẵn trong đó rồi, nhắc lại là thừa.
        body: JSON.stringify({ messages: history(), ctx: { review: currentReview(), lang: lang(), embed: EMBED, exGenres: exGenres.slice() } }),
      });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (!r.ok || !j || !j.ok) { const er = new Error('chat'); er.code = (j && j.error) || 'http'; er.retry = (j && j.retry) || 0; throw er; }
      return j;
    } catch (e) {
      if (e.code) throw e;
      const er = new Error('chat'); er.code = e.name === 'AbortError' ? 'timeout' : 'net'; throw er;
    } finally { clearTimeout(timer); }
  }
  // Bọc askOnce(): lỗi thuộc RETRYABLE thì tự thử lại (tối đa MAX_ASK_TRIES lần TỔNG CỘNG, nghỉ RETRY_GAP_MS
  // rồi tăng dần nhẹ giữa các lần, luôn giữ trên gap của Worker — xem giải thích ở RETRY_GAP_MS phía trên),
  // lỗi khác hoặc hết lượt thử thì ném ra như cũ (send() sẽ hiện đúng lỗi cuối cùng qua errText()). Toàn bộ
  // diễn ra trong lúc "đang gõ" nên người dùng chỉ thấy chờ lâu hơn 1 chút, không thấy lỗi trung gian nào.
  async function ask() {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ASK_TRIES; attempt++) {
      try {
        return await askOnce();
      } catch (e) {
        lastErr = e;
        if (attempt >= MAX_ASK_TRIES || !RETRYABLE.has(e.code)) throw e;
        console.warn('[reviewer-chat] lỗi tạm thời (' + e.code + '), thử lại lần ' + (attempt + 1) + '/' + MAX_ASK_TRIES);
        await sleep(Math.min(4000, RETRY_GAP_MS + 400 * (attempt - 1)));
      }
    }
    throw lastErr;
  }
  const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  /* Thống kê Google Analytics 4 (chỉ chạy khi trang đã nạp gtag; không gửi nội dung câu hỏi, chỉ gửi độ dài/nguồn để không lộ thông tin riêng tư):
     chat_open (mở chat), chat_question (mỗi câu hỏi), chat_answer (bot trả lời, kèm số thẻ truyện), chat_card_click (bấm thẻ truyện), chat_filter_open. */
  function track(name, params) { try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {} }
  async function send(preset) {
    if (sending) return;
    const input = $('rvcInput');
    const text = String(preset != null ? preset : input.value).trim().slice(0, MAX_INPUT);
    if (!text) return;
    input.value = ''; input.style.height = ''; input.blur && matchMedia('(max-width:680px)').matches && input.blur();
    const sg = $('rvcSuggest'); if (sg) sg.remove();
    bubbles.push({ role: 'user', text });
    track('chat_question', { source: preset != null ? 'suggestion' : 'typed', question_length: text.length, chat_lang: lang(), embed: EMBED ? 1 : 0 });
    addBubble('user', text, { idx: bubbles.length - 1 });
    sending = true; $('rvcSend').disabled = true; typing(true);
    try {
      const j = await ask();
      typing(false);
      bubbles.push({ role: 'model', text: String(j.reply || '').replace(MARK, '').replace(/\n{3,}/g, '\n\n').trim() }); // lịch sử gửi lên không kèm dòng thẻ
      track('chat_answer', { cards: Object.keys(j.cards || {}).length });
      addBubble('model', j.reply, { cards: j.cards || {}, idx: bubbles.length - 1 });
      showChoices(j.choices);
    } catch (er) {
      typing(false);
      console.warn('[reviewer-chat] lỗi:', er.code, er.retry || '');
      bubbles.pop();  // câu hỏi lỗi không tính vào lịch sử để bấm gửi lại được
      addBubble('model', errText(er), { err: true });
    } finally {
      sending = false; const b = $('rvcSend'); if (b) b.disabled = false;
      if (!matchMedia('(max-width:680px)').matches) { const i = $('rvcInput'); i && i.focus(); }
    }
  }
  function reset() {
    if (sending) return;
    bubbles = []; welcome(); scrollDown();
    const i = $('rvcInput'); if (i) { i.value = ''; i.style.height = ''; i.focus(); }
  }
  // Nhúng: đóng panel reviewer rồi mở lại panel chatbot công cụ dịch (chatbot.js lộ hàm này ra window).
  // Hội thoại dịch phía đó không bị đụng tới vì suốt lúc này panel dịch chỉ bị ẩn, không bị phá.
  function backToHost() {
    closePanel();
    if (typeof window.openChatbotPanel === 'function') window.openChatbotPanel();
  }

  // ---------- panel ----------
  const EXP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  const COL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>';
  function expandIcon() {
    const b = $('rvcExpand'); if (!b) return;
    const on = document.body.classList.contains('rvc-expanded');
    b.innerHTML = on ? COL : EXP; b.title = on ? tr().shrink : tr().expand; b.setAttribute('aria-label', b.title);
  }
  // ---------- bảng bộ lọc: dựng + sự kiện ----------
  let fpQuery = '';
  function fpTexts() {
    const f = fr(), set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    set('rvcFpT', f.title); set('rvcFpHint', f.hint); set('rvcFpAll', f.all); set('rvcFpReset', f.reset); set('rvcFpDone', f.done);
    const q = $('rvcFpQ'); if (q) { q.placeholder = f.search; q.setAttribute('aria-label', f.search); }
    const x = $('rvcFpX'); if (x) { x.title = f.close; x.setAttribute('aria-label', f.close); }
  }
  function fpNote() {
    const n = $('rvcFpNote'), all = $('rvcFpAll'), fb = $('rvcFilter');
    if (n) { n.textContent = exGenres.length ? fr().off + exGenres.map(gname).join(', ') : ''; n.style.display = exGenres.length ? '' : 'none'; }
    if (all) { all.classList.toggle('on', !exGenres.length); all.setAttribute('aria-pressed', String(!exGenres.length)); }
    if (fb) fb.classList.toggle('rvc-on', exGenres.length > 0);
  }
  function fpList() {
    const box = $('rvcFpList'); if (!box) return;
    const q = plain(fpQuery.trim());
    const gs = GROUPS.map((g) => ({ name: g.name, list: g.list.filter((x) => !q || plain(x).indexOf(q) >= 0 || plain(gname(x)).indexOf(q) >= 0) })).filter((g) => g.list.length);
    box.innerHTML = gs.length ? gs.map((g) =>
      '<section class="rvc-gcard"><div class="rvc-gh">' + esc(gpname(g.name)) + '</div><div class="rvc-gchips">' +
      g.list.map((x) => { const ex = exGenres.indexOf(x) >= 0; return '<button type="button" class="rvc-gchip' + (ex ? ' ex' : '') + '" data-g="' + esc(x) + '" aria-pressed="' + (!ex) + '">' + esc(gname(x)) + '</button>'; }).join('') +
      '</div></section>').join('') : '<p class="rvc-gempty">' + esc(fr().none) + '</p>';
  }
  function openFilter() { const fp = $('rvcFp'); if (!fp) return; track('chat_filter_open'); fpTexts(); fpList(); fpNote(); fp.classList.add('open'); const b = $('rvcFilter'); if (b) b.setAttribute('aria-expanded', 'true'); }
  function closeFilter() { const fp = $('rvcFp'); if (!fp) return; fp.classList.remove('open'); const b = $('rvcFilter'); if (b) b.setAttribute('aria-expanded', 'false'); }
  const filterOpen = () => { const fp = $('rvcFp'); return !!(fp && fp.classList.contains('open')); };
  function wireFilter() {
    $('rvcFilter').addEventListener('click', function () { filterOpen() ? closeFilter() : openFilter(); });
    $('rvcFpX').addEventListener('click', closeFilter);
    $('rvcFpDone').addEventListener('click', closeFilter);
    $('rvcFpReset').addEventListener('click', function () { exGenres = EX_DEFAULT.slice(); exSave(); fpQuery = ''; $('rvcFpQ').value = ''; fpList(); fpNote(); });
    $('rvcFpAll').addEventListener('click', function () { exGenres = []; exSave(); fpList(); fpNote(); });
    $('rvcFpQ').addEventListener('input', function () { fpQuery = this.value; fpList(); });
    $('rvcFpList').addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('.rvc-gchip[data-g]'); if (!b) return;
      const g = b.getAttribute('data-g'), i = exGenres.indexOf(g);
      if (i >= 0) exGenres.splice(i, 1); else exGenres.push(g);
      exSave(); b.classList.toggle('ex', i < 0); b.setAttribute('aria-pressed', String(i >= 0)); fpNote();
    });
    fpTexts(); fpNote();
  }

  function build() {
    if (built) return; built = true;
    const p = document.createElement('div');
    p.id = 'rvChatPanel'; p.setAttribute('role', 'dialog');
    p.innerHTML =
      (EMBED ? '<div class="rvc-back-bar"><button type="button" class="rvc-back-btn" id="rvcBack">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' +
        '<span id="rvcBackTx"></span></button></div>' : '') +
      '<div class="rvc-head"><div class="rvc-head-ic" style="color:var(--rvc-acc)">' + ICON + '</div>' +
      '<div class="rvc-head-tx"><div class="rvc-title" id="rvcTitle"></div><div class="rvc-sub" id="rvcSub"></div></div>' +
      '<button type="button" class="rvc-hbtn" id="rvcExpand"></button>' +
      '<button type="button" class="rvc-hbtn" id="rvcFilter" aria-haspopup="dialog">' + ICON_FILTER + '</button>' +
      '<button type="button" class="rvc-hbtn" id="rvcNew"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>' +
      '<button type="button" class="rvc-hbtn" id="rvcClose"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
      '<div class="rvc-msgs" id="rvcMsgs" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="rvc-input-row"><textarea id="rvcInput" rows="1" maxlength="' + MAX_INPUT + '"></textarea>' +
      '<button type="button" id="rvcSend"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>' +
      '<div class="rvc-fp" id="rvcFp" role="dialog">' +
        '<div class="rvc-fp-head"><span class="rvc-fp-t">' + ICON_FILTER + '<b id="rvcFpT"></b></span>' +
        '<button type="button" class="rvc-hbtn" id="rvcFpX"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>' +
        '<div class="rvc-fp-body"><p class="rvc-fp-hint" id="rvcFpHint"></p><p class="rvc-fp-note" id="rvcFpNote"></p>' +
        '<div class="rvc-fp-tools"><button type="button" class="rvc-gchip rvc-gall" id="rvcFpAll"></button>' +
        '<label class="rvc-fp-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="rvcFpQ" autocomplete="off"></label></div>' +
        '<div id="rvcFpList"></div></div>' +
        '<div class="rvc-fp-foot"><button type="button" class="rvc-fp-reset" id="rvcFpReset"></button><button type="button" class="rvc-fp-apply" id="rvcFpDone"></button></div>' +
      '</div>';
    document.body.appendChild(p);
    welcome(); applyLang();
    // "Cuộc trò chuyện mới": chỉ xoá hội thoại reviewer hiện tại và hiện lại tin chào, dù đang nhúng hay
    // không — việc quay về chatbot công cụ dịch đã có nút riêng "‹ Quay lại NovelTools" (#rvcBack) ở
    // thanh trên cùng khi nhúng, không gộp 2 việc vào 1 nút nữa.
    $('rvcNew').addEventListener('click', reset);
    $('rvcClose').addEventListener('click', closePanel);
    if (EMBED) { const bb = $('rvcBack'); if (bb) bb.addEventListener('click', backToHost); }
    $('rvcExpand').addEventListener('click', function () { document.body.classList.toggle('rvc-expanded'); expandIcon(); syncViewport(); scrollDown(); });
    wireFilter();
    $('rvcMsgs').addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a.rvc-card'); if (!a) return;
      const m = /#review-([^&?#]+)/.exec(a.getAttribute('href') || '');
      track('chat_card_click', { review_id: m ? decodeURIComponent(m[1]) : '' });
    });
    $('rvcSend').addEventListener('click', function () { send(); });
    const input = $('rvcInput');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 110) + 'px'; });
    if (window.visualViewport) { visualViewport.addEventListener('resize', syncViewport); visualViewport.addEventListener('scroll', syncViewport); }
  }
  // Bàn phím ảo (mobile) che ô nhập: nâng panel lên đúng phần bị che (như syncChatViewport bên index).
  function syncViewport() {
    const p = $('rvChatPanel'), vv = window.visualViewport; if (!p || !vv) return;
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (matchMedia('(max-width:680px)').matches && p.classList.contains('open') && covered > 80) {
      p.style.bottom = covered + 'px'; p.style.maxHeight = Math.floor(vv.height * 0.92) + 'px'; scrollDown();
    } else { p.style.removeProperty('bottom'); p.style.removeProperty('max-height'); }
  }
  // Cờ tạm: bật lúc openPanel() chạy, tắt ngay ở "tick" kế tiếp (setTimeout 0ms) — dùng để listener "bấm ra ngoài"
  // bên dưới bỏ qua ĐÚNG cú click vừa mở panel. Không có cờ này: khi mở panel bằng chip "Review truyện" (nằm
  // trong panel chatbot dịch cũ, đã bị đóng/xoá ngay khi mở panel này), sự kiện click đó vẫn tiếp tục nổi bọt
  // lên document sau khi panel đã mở — listener thấy click không nằm trong panel Reviewer (vì click gốc nằm
  // trong panel dịch cũ) nên tưởng nhầm là "bấm ra ngoài" và tự đóng ngay panel vừa mở, tạo cảm giác "biến mất".
  let justOpened = false;
  function openPanel() {
    build();
    track('chat_open', { embed: EMBED ? 1 : 0 });
    document.body.classList.add('rvc-open');
    $('rvChatPanel').classList.add('open');
    expandIcon();
    setTimeout(function () { if (!matchMedia('(max-width:680px)').matches) { const i = $('rvcInput'); i && i.focus(); } }, 150);
    syncViewport();
    justOpened = true;
    setTimeout(function () { justOpened = false; }, 0);
  }
  function closePanel() {
    closeFilter();
    document.body.classList.remove('rvc-open', 'rvc-expanded');
    const p = $('rvChatPanel');
    if (p) { p.classList.remove('open'); p.style.removeProperty('bottom'); p.style.removeProperty('max-height'); }
  }
  function toggle() { document.body.classList.contains('rvc-open') ? closePanel() : openPanel(); }

  // Esc đóng; bấm ra ngoài panel (và ngoài nút mở) cũng đóng — giống index. Bấm vào thẻ truyện mở tab mới nên không mất cuộc trò chuyện.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || !document.body.classList.contains('rvc-open')) return;
    const p = $('rvChatPanel'), ae = document.activeElement;
    if (ae && ae !== document.body && !p.contains(ae)) return;
    e.preventDefault();
    if (filterOpen()) { closeFilter(); const fb = $('rvcFilter'); if (fb) fb.focus(); return; }
    closePanel();
    const b = $('rvChatBtn'); if (b) b.focus();
  });
  document.addEventListener('click', function (e) {
    if (justOpened) return; // đúng cú click vừa mở panel (vd bấm chip "Review truyện" bên chatbot dịch) — không tính là "bấm ra ngoài"
    if (!document.body.classList.contains('rvc-open') || !e.isTrusted) return;
    const p = $('rvChatPanel'), b = $('rvChatBtn'), path = e.composedPath ? e.composedPath() : [];
    if ((p && (path.includes(p) || p.contains(e.target))) || (b && b.contains(e.target))) return;
    closePanel();
  });

  function init() {
    // Nhúng: không có nút tròn riêng — panel được mở từ chip "Review truyện" bên chatbot.js.
    if (EMBED) {
      applyLang();
      new MutationObserver(applyLang).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      return;
    }
    if ($('rvChatBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'rvChatBtn'; btn.type = 'button'; btn.innerHTML = ICON;
    btn.addEventListener('click', toggle);
    document.body.appendChild(btn);
    applyLang();
    // Trang đổi ngôn ngữ (ntApplyLang gán html[lang]) → cập nhật chữ.
    new MutationObserver(applyLang).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
  window.toggleReviewerChat = toggle;
  // Nhúng: chatbot.js gọi 2 hàm này để mở/đóng panel reviewer từ chip "Review truyện" / nút quay lại.
  window.openReviewerChat = openPanel;
  window.closeReviewerChat = closePanel;
  // Nhúng: chatbot.js gọi hàm này khi câu hỏi của người dùng rõ ràng là hỏi về review/gợi ý truyện — mở
  // thẳng panel Reviewer VÀ gửi luôn đúng câu hỏi đó sang (không bắt gõ lại), xem chatbot.js chỗ gọi.
  window.askReviewerChat = function (text) {
    openPanel();
    send(text);
  };
})();