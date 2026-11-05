// ===================================================================
// chatbot-docs-2.js — Nguồn kiến thức BỔ SUNG đợt 2 cho Trợ lý AI (soạn từ câu trả lời của admin).
// Nạp TRƯỚC chatbot.js, cùng kiểu với chatbot-docs.js (chỉ push vào window.chatbotHelpSources).
//
// QUY ƯỚC "mỗi chủ đề chỉ có MỘT nguồn":
//  - Các mục [MỚI] bên dưới chưa có trong chatbot-docs.js → thêm nguyên xi.
//  - Các chủ đề trùng (AI từ chối dịch, chia chương, chọn model, quota, Drive, TTS, Bộ nhớ nhân vật) đã được SỬA TRỰC TIẾP trong
//    chatbot-docs.js / chatbot.js — file này chỉ chứa các mục MỚI, không trùng chủ đề.
// keywords: không dấu, cách nhau dấu phẩy; "a+b" = cần cả a lẫn b; "~từ" = từ khoá yếu.
// ===================================================================
(function () {
  'use strict';
  window.chatbotHelpSources = window.chatbotHelpSources || [];
  const push = (o) => window.chatbotHelpSources.push(o);

  // ---------- [MỚI] Giao diện chính: header, menu người dùng, toolbar ----------
  push({
    title: 'Giao diện chính — header, menu người dùng, toolbar và điều kiện hiện nút',
    summary: 'Header (logo, sáng/tối, avatar → Đăng nhập / Review truyện; Sao lưu-Khôi phục nằm trong Cài đặt → Dữ liệu), các nút trên toolbar, nút nào chỉ hiện khi đăng nhập/có mạng/đã đánh dấu, khác biệt mobile.',
    keywords: 'header, thanh tren cung, avatar, icon nguoi, o nguoi dung, menu nguoi dung, toolbar, thanh cong cu, ' +
      'nut o dau, nut dau, khong thay nut, mat nut, an nut, sao khong co nut, nut nam o dau, tim nut, ' +
      'nut doc tiep, doc tu day, danh dau doan, tu dong chon anh bia, anh bia, ' +
      'tu dong sao luu+khong thay, khoi phuc tu thiet bi, review truyen, kho review, ' +
      'man hinh chinh, giao dien chinh, cac nut, nut them, mobile+nut, dien thoai+nut',
    text: `
HEADER: bên trái là logo NovelTools; bên phải là nút đổi giao diện sáng/tối và ô người dùng (avatar).
Bấm ô người dùng sẽ hiện: Đăng nhập (đăng nhập xong hiện thông tin Gmail + nút Đăng xuất) và Review truyện.
- Tự động sao lưu, Chu kỳ sao lưu, danh sách Thiết bị (kèm thời điểm sao lưu gần nhất dưới mỗi máy) và Sao lưu/Khôi phục thủ công KHÔNG nằm ở menu này:
  chúng nằm trong khung Cài đặt (icon bánh răng) → nhóm "Dữ liệu".
- Review truyện: mở kho review truyện của NovelTools, giúp gợi ý và tư vấn truyện theo sở thích người dùng.

TOOLBAR (từ trái sang phải): Tủ truyện, Dịch / Dịch lại, Tự động dịch, Sửa văn bản, Đánh dấu, Đọc tiếp, Thêm, Bộ nhớ nhân vật (icon hai người, rê chuột hiện "Quan hệ nhân vật"), Cài đặt. Nút "Aa" (Cấu hình đọc: Cuộn/Lật, font, cỡ chữ) nằm ở khu vực đọc.
- Nút "Thêm" mở ra: Xem bản gốc, Xóa bản dịch, Tải xuống.
- Trên điện thoại (mobile): "Sửa văn bản" được đưa vào mục ĐẦU TIÊN của "Thêm" (trước "Xem bản gốc") để tiết kiệm chỗ trên toolbar.

NÚT CHỈ HIỆN / BẤM ĐƯỢC KHI ĐỦ ĐIỀU KIỆN (người dùng hay hỏi "sao không thấy nút X"):
- Tự động sao lưu, Chu kỳ sao lưu và danh sách Thiết bị (Cài đặt → Dữ liệu): bị mờ/chưa dùng được cho tới khi đã đăng nhập Drive.
- Tự động chọn ảnh bìa truyện / ảnh bìa nhân vật: chỉ hiện khi thiết bị có kết nối mạng.
- Đọc tiếp: chỉ bấm được khi đã có truyện/đoạn văn được đánh dấu.
- "Đọc từ đây" và đánh dấu đoạn văn: trên máy tính chỉ hiện khi người dùng BÔI ĐEN văn bản; trên điện thoại/máy tính bảng chỉ hiện khi
  người dùng CHẠM vào đoạn văn cụ thể.`.trim(),
  });

  // ---------- [MỚI] Bắt đầu dùng từ đầu ----------
  push({
    title: 'Bắt đầu dùng NovelTools từ đầu (người mới) — từ mở app đến đọc chương đã dịch',
    summary: 'Các bước cho người mới: nhập file TXT/EPUB, chọn model + ngôn ngữ đích trong Cài đặt, lấy và dán API key, chọn số chương dịch trước, bấm Dịch.',
    keywords: 'bat dau, moi dung, nguoi moi, lan dau, huong dan dung, cach dung, dung nhu the nao, dung the nao, ' +
      'tu dau, bat dau tu dau, cac buoc, lam sao de dich, lam sao dich, cach dich truyen, dich truyen nhu the nao, ' +
      'chua biet dung, huong dan co ban, quy trinh',
    text: `
Từ lúc mở app đến lúc đọc được chương đầu đã dịch:
1) Nhập file truyện .txt hoặc .epub (tải trên mạng hoặc mua từ nhà cung cấp nào đó).
2) Vào Cài đặt (icon bánh răng): chọn model AI (mặc định là Gemini 3.8 Flash, 5 sao) và NGÔN NGỮ ĐÍCH muốn dịch sang.
3) Lấy API key (có popup hướng dẫn chi tiết lấy Gemini API Key; DeepSeek có mục riêng) rồi dán vào Cài đặt.
4) Ở mục "Số chương dịch trước" trong Cài đặt: chọn số chương dịch trước (5/10/20/50/100); muốn dịch hàng loạt thì chọn 100 rồi bật "Tự động dịch".
5) Bấm nút Dịch và theo dõi tiến độ dịch ở Mục lục.
Nếu truyện chưa được chia chương đúng (cả truyện thành 1 chương) thì xem mục "Chia chương" — đây là lỗi mới dùng rất hay gặp.`.trim(),
  });

  // ---------- [MỚI] Mất truyện / mất bản dịch ----------
  // (Xoá bullet "Mất truyện/tiến trình đọc..." trong mục "Xử lý sự cố thường gặp" để khỏi trùng.)
  push({
    title: 'Mất truyện / mất bản dịch — nguyên nhân và cách phòng',
    summary: 'Các lý do mất dữ liệu: xoá nhầm, xoá cache trình duyệt, ghi đè truyện cùng tên khác cách chia chương, lỗi sau cập nhật app; hầu hết không khôi phục được — nên bật sao lưu Drive.',
    keywords: 'mat truyen, mat ban dich, mat het, mat du lieu, mat het ban dich, bien mat, truyen mat, ban dich mat, ' +
      'khong con truyen, khong thay truyen, truyen da bien mat, khoi phuc truyen, lay lai ban dich, lay lai truyen, ' +
      'mat+truyen, mat+ban dich, xoa nham, lam mat, khong con ban dich',
    text: `
Các trường hợp thật sự làm mất truyện / bản dịch:
1) Người dùng bấm nhầm (và đã xác nhận) "Xóa truyện" hoặc "Xóa bản dịch / xóa tất cả bản dịch".
2) Người dùng chủ động xoá cache / dữ liệu duyệt web của trình duyệt (dữ liệu chỉ lưu trên trình duyệt đang dùng).
3) Mở 1 truyện CÙNG TÊN nhưng cách chia chương (tiêu đề) khác rồi ghi đè lên truyện hiện tại → bản dịch của các chương bị đổi/xoá sẽ mất.
4) Admin cập nhật phiên bản mới nhưng có lỗi khiến bản dịch/truyện bị xoá → cần báo admin.
(Đổi máy, dùng trình duyệt khác hoặc chế độ ẩn danh thì không thấy dữ liệu cũ vì dữ liệu nằm trên trình duyệt cũ.)
KHẢ NĂNG KHÔI PHỤC: hầu hết các trường hợp trên KHÔNG khôi phục được nếu trước đó chưa sao lưu.
CÁCH PHÒNG: đăng nhập Drive. Nếu để chế độ Tự động sao lưu thì app tự sao lưu; nếu tắt Tự động sao lưu thì bấm vào TÊN THIẾT BỊ HIỆN TẠI
để sao lưu thủ công, làm định kỳ — khi cần có thể khôi phục.
Nếu Tự động sao lưu đang bật và bạn chỉ xoá nhầm 1 truyện: truyện đã xoá ở máy này vẫn khôi phục được từ chính máy này (bấm dòng máy hiện tại
trong "Thiết bị" để khôi phục) trong vòng 30 ngày.`.trim(),
  });

  // ---------- [MỚI] Dịch chậm / dịch mãi không xong ----------
  push({
    title: 'Dịch chậm / dịch mãi không xong / treo',
    summary: 'Nguyên nhân dịch chậm: lỗi server (503) → đổi model yếu hơn hoặc chế độ dịch linh hoạt; chưa chia chương nên cả truyện thành 1 chương gây lag; chương quá dài.',
    keywords: 'dich cham, cham qua, dich mai khong xong, mai khong xong, lau qua, dich lau, treo may, lag, bi lag, dung hinh, ' +
      'dich bi treo, khong xong, qua lau, dich dung, ' +
      'cham+dich, lau+dich, lag+dich, treo+dich',
    text: `
Dịch chậm / mãi không xong — kiểm tra theo thứ tự:
1) Phần lớn là do LỖI SERVER của model (503…): đổi sang model yếu hơn (vd Flash Lite) hoặc chọn chế độ dịch linh hoạt. Nếu dùng máy tính,
   xem thông báo lỗi để biết mã lỗi cụ thể.
2) Truyện chưa có "mẫu tiêu đề" → TOÀN BỘ truyện bị gom vào 1 chương → gây lag máy và không dịch được. Người dùng cần tự thêm mẫu tiêu đề
   hoặc chọn chia chương theo SỐ KÝ TỰ (xem mục "Chia chương").
3) Chương quá dài: số ký tự lý tưởng mỗi chương là dưới 2500 ký tự Hán/Nhật, dưới 4500 ký tự Hàn, dưới 10000 ký tự Latin. Vượt mức đó thì
   dễ dịch lỗi / không dịch được → chia lại chương cho phù hợp.`.trim(),
  });

  // ---------- [MỚI] Bản dịch dở / sai tên / sai xưng hô ----------
  push({
    title: 'Bản dịch dở / đọc không mượt / sai tên / sai xưng hô — cách cải thiện',
    summary: 'Thứ tự: chọn đúng preset và Xưng hô thường gặp theo thể loại; dùng model mới nhất + chế độ dịch Nghĩ Kỹ; lỗi nặng/thường xuyên thì báo admin.',
    keywords: 'dich dop, dich do, dich te, dich khong muot, doc khong muot, khong muot, sai ten, sai xung ho, xung ho sai, ' +
      'dich sai, ban dich kem, chat luong dich, dich chua hay, van phong kem, cai thien ban dich, dich cho hay hon, ' +
      'nghi ky, dich hay hon, dich chuan hon',
    text: `
Muốn bản dịch hay hơn / bớt sai tên, sai xưng hô — làm theo thứ tự:
1) Chọn ĐÚNG preset (prompt) và "Xưng hô thường gặp" phù hợp với thể loại truyện.
2) Chọn model mới nhất trong danh sách model ở Cài đặt và chế độ dịch "Nghĩ Kỹ".
3) Nếu vấn đề xảy ra quá thường xuyên hoặc lỗi quá nặng: báo admin.
(Bộ nhớ nhân vật cũng giúp xưng hô chuẩn hơn — xem mục Bộ nhớ nhân vật.)`.trim(),
  });

  // ---------- [MỚI] Công tắc Bộ nhớ nhân vật ----------
  push({
    title: 'Bộ nhớ nhân vật — 3 công tắc ở bánh răng (Phân tích nhân vật, Soát xưng hô, Kiểm tra chính tả)',
    summary: 'Menu bánh răng trong ngăn Bộ nhớ nhân vật có 3 công tắc; tắt bớt để giảm chi phí/lượt gọi API khi dịch.',
    keywords: 'phan tich nhan vat, soat xung ho, kiem tra chinh ta, chinh ta, cong tac, tat phan tich, tat soat, giam chi phi, tiet kiem api, ' +
      'banh rang+nhan vat, cai dat+bo nho nhan vat, nhan vat moi khong them, khong them nhan vat',
    text: `
Trong ngăn "Bộ nhớ nhân vật", icon bánh răng có 3 công tắc:
- Phân tích nhân vật: AI đọc chương để thêm/cập nhật nhân vật. Tắt thì dịch sẽ không cập nhật nhân vật mới (ngăn có dòng nhắc).
- Soát xưng hô bản dịch: bước soát lại xưng hô trong bản dịch cho đúng sắc thái thể loại.
- Kiểm tra chính tả: gợi ý từ nghi sai chính tả (vd ô Ghi chú nhân vật).
Dưới menu có lưu ý: tắt các mục này nếu muốn giảm chi phí dịch truyện. Có thể nhờ Trợ lý bật/tắt hộ.`.trim(),
  });
})();
