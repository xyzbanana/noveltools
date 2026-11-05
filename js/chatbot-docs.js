// ===================================================================
// chatbot-docs.js — Nguồn kiến thức BỔ SUNG cho Trợ lý AI (chatbot.js), cho các tính năng
// hiện CHƯA có data-chatbot-help riêng trong index.html: Tủ truyện, Mục lục, nút "Thêm", Xóa bản dịch,
// Preset dịch, Tải xuống TXT/EPUB, Chế độ/Tốc độ dịch, Chia chương, Đánh dấu, Phím tắt, và các trang "Xử lý sự cố",
// "Chương dịch bị lỗi / AI từ chối dịch", "Bản dịch còn sót chữ Hán".
//
// QUY ƯỚC: mỗi chủ đề chỉ có MỘT nguồn. Các chủ đề Sao lưu/Đồng bộ Drive, Sửa văn bản, Nghe
// truyện (TTS), Bộ nhớ nhân vật được mô tả DUY NHẤT trong chatbot.js (cùng khớp 1 câu hỏi thì
// 2 nguồn chiếm chỗ trong .slice(0, 5) và có thể mâu thuẫn nhau) — đừng thêm lại ở đây.
//
// CÁCH VIẾT 1 NGUỒN MỚI:
//  - keywords: các cụm cách nhau dấu phẩy, viết KHÔNG DẤU. Cụm thường phải xuất hiện LIỀN MẠCH trong câu
//    hỏi ("xoa ban dich" không khớp "xoá hết bản dịch"). Cụm dạng "a+b" khớp khi câu hỏi có CẢ a lẫn b ở bất
//    kỳ vị trí nào ("xoa+ban dich" khớp cả 2 câu trên) — dùng khi người dùng hay chen thêm chữ ở giữa. Khớp
//    theo ĐẦU TỪ nên tránh a/b quá ngắn ("go" khớp cả "google", "chu" khớp cả "chuong").
//  - summary: 1 câu tóm tắt chủ đề. Chỉ dùng khi câu hỏi KHÔNG khớp từ khoá nào: khi đó Trợ lý nhận danh sách
//    tóm tắt của MỌI chủ đề (thay vì cả tài liệu) để biết app có tài liệu nào và không bịa ngoài phạm vi đó.
//    Nguồn thiếu summary thì tự lấy ~150 ký tự đầu của tài liệu.
//
// Nạp file này TRƯỚC chatbot.js (script thường, không type="module") — chỉ push vào
// window.chatbotHelpSources, không tự chạy gì khác nên thứ tự với các file khác không quan
// trọng, miễn là trước chatbot.js.
//
// Nội dung dưới đây được viết lại từ đúng những gì code đang làm (xem chú thích [nguồn: ...]
// ở mỗi mục để tiện đối chiếu khi cập nhật tính năng sau này) — KHÔNG suy đoán thêm.
// ===================================================================
(function () {
  'use strict';
  window.chatbotHelpSources = window.chatbotHelpSources || [];
  const push = (o) => window.chatbotHelpSources.push(o);

  // ---------- Tủ truyện ----------
  push({
    title: 'Tủ truyện — lưu và quản lý nhiều truyện',
    summary: 'Nút "Tủ truyện": lưu nhiều truyện, đổi tên/xoá/mở lại đúng vị trí đang đọc, cập nhật truyện cũ khi có thêm chương mới, file quá lớn; dữ liệu chỉ nằm trong trình duyệt này.',
    keywords: 'tu truyen, thu vien, nhieu truyen, luu truyen, mo truyen khac, xoa truyen, doi truyen, ' +
      'xoa+truyen+ban dich, xoa khoi tu, doi ten truyen, doi ten+truyen, sua ten truyen, ten truyen, cap nhat truyen, truyen cu, truyen da co, da co trong tu, ' +
      'them chuong moi, up file moi, truyen dang ra, trung ten, them moi, file qua lon, dung luong, qua lon, 10mb, ' +
      'up khong duoc, khong tai len duoc, khong luu duoc, xoa cache, xoa du lieu duyet, ' +
      'doi anh bia, anh bia, tac gia, sua tac gia, doi tac gia, tim truyen, tim ten truyen, sap xep truyen, moi nhat, a-z, menu ba cham, 3 cham',
    text: `
Tủ truyện là nơi lưu TẤT CẢ các truyện đã mở trên trình duyệt này, để chuyển qua lại mà không
phải tải file lại từ đầu.
- Mở: nút "Tủ truyện" trên thanh công cụ (icon 2-3 cột sách), hoặc icon cùng tên ở màn hình
  chính khi chưa mở truyện nào.
- Thêm truyện mới vào tủ: nút "+" trong Tủ truyện (chỉ hiện khi đã mở ít nhất 1 truyện) —
  chọn thêm file .txt/.epub khác, không mất truyện đang đọc.
- Mỗi mục trong tủ hiện tên file, số chương đã dịch, và cho phép mở lại đúng vị trí đang đọc
  dở lần trước.
- Menu 3 chấm (⋮) ở cuối mỗi truyện có 5 mục: "Tên truyện" (đổi tên), "Tác giả" (đặt hoặc xoá tên tác giả), "Đổi ảnh bìa",
  "Tải xuống" (tải TXT/EPUB của CHÍNH truyện đó mà KHÔNG cần mở nó ra — xem mục "Tải xuống") và "Xóa khỏi tủ".
  Đổi tên/tác giả: gõ rồi bấm dấu ✓ để lưu (✕ để huỷ).
- Đổi ảnh bìa: hộp có ô dán link ảnh (http/https), nút tải ảnh từ máy (app tự cắt theo tỉ lệ bìa và lưu cùng truyện, offline vẫn hiện),
  và nút đổi ảnh ngẫu nhiên từ kho ảnh có sẵn (cần mạng); bấm "Lưu" để áp dụng.
- Tìm và sắp xếp: ô "Tìm tên truyện, tác giả..." ở đầu Tủ truyện; nút sắp xếp bên cạnh bấm để đổi qua lại giữa "Mới nhất" và "A → Z".
- Nút "Mở file truyện TXT / EPUB" ở cuối Tủ truyện để thêm truyện mới.
- Xoá 1 truyện khỏi tủ ("Xóa khỏi tủ"): có hộp xác nhận, và BẢN DỊCH đã lưu của truyện đó cũng bị xoá theo;
  chỉ xoá trên trình duyệt này — nếu đã sao lưu lên Google Drive thì bản trên Drive không tự mất theo, phải xoá riêng.
- Truyện có thêm chương mới (tải lại file đầy đủ hơn): mở file đó như bình thường. Nếu tên file giống 1 truyện
  đã có trong tủ, app hiện hộp "Truyện đã có trong tủ" với 2 lựa chọn: "Cập nhật truyện cũ" (thay nội dung gốc
  bằng file mới, giữ nguyên cách chia chương cũ; chương nào giữ nguyên tiêu đề thì giữ được bản dịch, chương nào
  bị đổi/xoá trong file mới thì mất bản dịch) hoặc "Thêm mới" (thêm thành 1 truyện riêng, truyện cũ không bị đụng tới).
  Muốn nối thêm chương vào truyện đang dịch dở mà không mất bản dịch thì chọn "Cập nhật truyện cũ".
- File quá lớn: nếu file vượt dung lượng trình duyệt cho phép lưu, app báo "File quá lớn" và gợi ý chia nhỏ
  thành nhiều phần (mỗi phần dưới 10MB); truyện cũ trong tủ vẫn còn nguyên (trường hợp thêm mới, file vẫn mở
  để đọc trong phiên hiện tại nhưng không được lưu vào tủ).
- Dữ liệu Tủ truyện lưu trong trình duyệt (không có máy chủ riêng của NovelTools) — xoá dữ liệu
  duyệt web (site data) của trang, dùng máy khác, hoặc trình duyệt ẩn danh sẽ KHÔNG thấy tủ
  truyện cũ; cần Sao lưu Google Drive nếu muốn giữ khi đổi thiết bị.`.trim(),
  });

  // ---------- Giao diện sáng / tối ----------
  // [nguồn: index.html — nút #btnTheme ở header (onclick="toggleTheme()"), toggleTheme()/applyTheme()
  //  (lưu vào localStorage khoá 'dt'). Trước đây KHÔNG có data-chatbot-help nào trỏ tới nút này (chỉ được
  //  nhắc lướt qua trong mục "Đồng bộ & Sao lưu" ở chatbot.js — "icon hình người ở header, ngay cạnh nút
  //  đổi giao diện sáng/tối" — nên câu hỏi kiểu "đổi giao diện sáng tối" không khớp từ khoá nào và có thể
  //  bị lệch sang mục "Bảng Cài đặt" do trùng từ "cài đặt"/"dark mode"; thêm hẳn 1 nguồn riêng ở đây.]
  push({
    title: 'Giao diện sáng / tối (Dark mode)',
    summary: 'Icon mặt trời/mặt trăng ở header (cạnh icon Đồng bộ & Sao lưu) đổi giao diện sáng/tối; lựa chọn được nhớ cho lần mở sau.',
    keywords: 'giao dien, sang toi, che do toi, che do sang, dark mode, light mode, doi giao dien, doi theme, ' +
      'theme, nen den, nen toi, nen sang, nen trang, mat troi+mat trang, doi mau nen, doi mau giao dien, ' +
      'giao dien+toi, giao dien+sang, giao dien+den, giao dien+trang',
    text: `
Đổi giao diện sáng/tối bằng icon hình mặt trời/mặt trăng ở header, nằm cạnh icon hình người (icon
"Đồng bộ & Sao lưu") — KHÔNG nằm trong bảng Cài đặt (icon bánh răng).
- Bấm vào icon đó để chuyển qua lại giữa 2 giao diện ngay lập tức, không cần lưu hay tải lại trang.
- Lựa chọn được ghi nhớ cho lần mở app sau (kể cả sau khi tắt trình duyệt), lưu riêng trên trình
  duyệt đang dùng — đổi máy/trình duyệt khác hoặc dùng chế độ ẩn danh sẽ không giữ lựa chọn này.
- Người dùng hoàn toàn mới (chưa từng bấm đổi) mặc định vào app ở giao diện TỐI.`.trim(),
  });

  // ---------- Preset / prompt dịch (thao tác) ----------
  // [nguồn: index.html — renderPresetBar, confirmAddPreset, restoreCurrentPresetPrompt, saveSettings;
  //  presets.js — DEFAULT_PRESETS]. Nội dung/cách VIẾT prompt nằm ở mục riêng ngay bên dưới.
  push({
    title: 'Preset (mẫu prompt dịch)',
    summary: 'Preset = mẫu prompt quyết định văn phong dịch; cách chọn, sửa, tạo bản sao, khôi phục mặc định, xoá preset trong Cài đặt.',
    keywords: 'preset, mau prompt, prompt dich, doi van phong, tao preset moi, luu preset, prompt tuy chinh, ' +
      'them preset, xoa preset, khoi phuc prompt, khoi phuc mac dinh+prompt, nut mui ten+prompt, nhan doi+preset, ' +
      'sao chep preset, nhan ban preset, copy preset, ban sao+preset, preset+mat, preset+bi xoa, o prompt, ' +
      'van phong, giong van, hai huoc, van phong+dich',
    max: 4500,
    text: `
Preset là 1 bộ hướng dẫn (prompt) gửi kèm cho AI mỗi khi dịch 1 chương, quyết định văn phong/quy tắc
dịch (vd giữ Hán Việt cho tên riêng, xưng hô theo bối cảnh cổ trang...). Trong Cài đặt, mục "Prompt" có
hàng nút tên preset (preset đang dùng được tô màu) và bên dưới là ô văn bản chứa nội dung prompt đang dùng —
sửa trực tiếp trong ô đó.
- Chọn preset: bấm vào tên preset. Nội dung đang sửa trong ô được tự cất vào preset cũ trước khi chuyển.
- Sửa prompt: gõ thẳng vào ô rồi bấm "Lưu" ở cuối Cài đặt. Sửa chỉ ảnh hưởng các chương dịch SAU đó — không
  tự dịch lại chương đã dịch (muốn áp dụng cho chương cũ thì dùng "Dịch lại chương này").
- Tạo preset mới: bấm nút "＋" cạnh các tên preset. LƯU Ý: ô prompt sẽ được làm TRỐNG (không tự chép prompt
  cũ) để soạn preset mới; gõ tên (tối đa 30 ký tự) rồi bấm "Lưu" cạnh ô tên (hoặc Enter). Bấm "Huỷ" hoặc
  bấm lại "＋" (hoặc Esc) để bỏ — prompt cũ hiện lại. Nếu đang sửa dở prompt của preset đang chọn, phần sửa
  đó được cất vào preset đó trước khi ô bị làm trống.
- Muốn tạo BẢN SAO có chỉnh sửa từ 1 preset (giữ nguyên preset gốc): chọn preset gốc → bấm vào ô prompt,
  Ctrl+A rồi Ctrl+C để copy → bấm "＋" → dán (Ctrl+V) vào ô trống, sửa, đặt tên, "Lưu".
- Khôi phục mặc định: icon mũi tên quay lại (↺) ở góc ô prompt đưa prompt của preset CÓ SẴN về bản gốc của
  app (có hộp xác nhận, nội dung đang sửa sẽ mất). Preset do bạn tự tạo không có bản mặc định nên không
  khôi phục được — app sẽ báo như vậy.
- Xoá preset: bấm 2 lần liên tiếp vào tên preset (nhấp đúp / chạm đúp trên điện thoại), có hộp xác nhận.
  Phải giữ lại ít nhất 1 preset. Preset có sẵn đã xoá KHÔNG tự hiện lại, nên nếu chỉ muốn thử nội dung
  khác thì hãy tạo bản sao thay vì sửa/xoá preset gốc.
- Trợ lý AI có thể đổi giúp preset đang dùng theo tên; Trợ lý KHÔNG tự sửa nội dung các preset có sẵn và
  bình thường không nhìn thấy nội dung prompt của bạn (chỉ biết tên preset). Riêng khi bạn nhờ \"soạn đoạn bổ
  sung cho prompt dịch\" và bấm \"Cho phép\": một phần prompt của preset đang dùng, trích đoạn chương đang mở
  và tên/quan hệ/giới tính các nhân vật được gửi cho AI để soạn 1 đoạn ngắn; nếu bạn đồng ý, Trợ lý lưu nó
  thành 1 preset MỚI (preset gốc giữ nguyên). Muốn được góp ý về prompt của bạn, có thể dán đúng đoạn cần góp
  ý vào khung chat (đừng dán API key hay thông tin nhạy cảm).
- Preset đang chọn và nội dung các preset lưu theo trình duyệt/Cài đặt, có thể sao lưu qua Google Drive
  cùng với các Cài đặt khác.`.trim(),
  });

  // ---------- Viết & sửa nội dung prompt ----------
  // [nguồn: presets.js — cấu trúc các mục của DEFAULT_PRESETS; translate.js — callAPIFull (prompt được gửi kèm
  //  mỗi chương, kèm thông tin nhân vật); character-memory.js — getMainPromptGuidance (đọc phần đầu prompt để
  //  hiểu xưng hô/thể loại); edit-text.js/character-memory.js cho các lựa chọn thay thế]. Cố ý KHÔNG nêu chi
  //  tiết vận hành (giữ ranh giới CHATBOT_RULES), chỉ nêu lời khuyên mà người dùng cần để tự sửa an toàn.
  push({
    title: 'Viết và sửa nội dung prompt dịch',
    summary: 'Cấu trúc các mục trong preset có sẵn, cách thêm/sửa prompt an toàn, và khi nào nên dùng Sửa văn bản hoặc Bộ nhớ nhân vật thay vì sửa prompt.',
    keywords: 'sua prompt, chinh sua prompt, viet prompt, viet lai prompt, prompt cua toi, xem giup prompt, gop y prompt, ' +
      'them vao prompt, them quy tac, sua+prompt, viet+prompt, chinh+prompt, them+prompt, thay doi+prompt, toi uu+prompt, ' +
      'prompt+dai, prompt+xung ho, prompt+ten rieng, cau truc prompt, cau truc preset, thu tu uu tien, nguyen tac cot loi, ' +
      'muc dau ra, prompt+nen sua, sua+preset, chinh+preset',
    max: 4500,
    text: `
Prompt dịch là văn bản thường (không có biến hay cú pháp đặc biệt) nên có thể sửa tự do bằng tiếng Việt, và
được gửi kèm cho AI ở MỖI chương. Thao tác sửa/tạo/khôi phục xem mục "Preset (mẫu prompt dịch)".

CẤU TRÚC CÁC PRESET CÓ SẴN (chia mục đánh số La Mã, mỗi preset dài khoảng 8.500–15.000 ký tự):
- Đoạn mở đầu nêu vai trò và nhiệm vụ: biên tập bản dịch máy thành tiếng Việt tự nhiên, giữ nguyên nội dung,
  diễn biến, ý nghĩa của nguyên tác.
- "Huyền huyễn" mở đầu bằng "Thứ tự ưu tiên" (khi các yêu cầu xung đột thì theo thứ tự nào), rồi "Nguyên
  tắc dịch", "Nhân vật và xưng hô", "Tên riêng và thuật ngữ", thành ngữ/điển cố, văn phong, thơ và câu đối.
- "Khoa huyễn", "Đô thị", "Fantasy", "Light Novel", "Ngôn tình" mở đầu bằng "Nguyên tắc cốt lõi", tiếp theo
  là "Xưng hô" (đều nhấn mạnh là mục rất quan trọng), văn phong theo thể loại, các mục riêng của thể loại
  (vd Khoa huyễn: thuật ngữ khoa học, cơ giáp, quân hàm; Ngôn tình: chemistry, cảnh lãng mạn), tên riêng...
- Phần cuối (tuỳ preset) thường có: biên tập bản dịch máy, nhất quán, tối ưu để nghe bằng giọng đọc (TTS),
  danh sách tự kiểm tra trước khi xuất, và mục "Đầu ra" (chỉ trả về bản truyện, không giải thích/chú thích).

SỬA AN TOÀN:
- Thêm quy ước riêng cho bộ truyện (cách xưng hô cụ thể, thể loại/bối cảnh, vài tên riêng bắt buộc dịch 1
  kiểu) bằng vài gạch đầu dòng ngắn, đặt ở ĐẦU prompt hoặc ngay đầu mục Xưng hô/Tên riêng — đừng dán xuống
  cuối; phần đầu prompt cũng được các tính năng khác (như Bộ nhớ nhân vật) đọc để hiểu thể loại/xưng hô.
- Viết cụ thể, có ví dụ ngắn đúng/sai như các preset đang làm (vd "✔ đại lộ ❌ con lộ").
- Quy tắc mới trái với quy tắc có sẵn thì nên sửa/xoá quy tắc cũ, hoặc ghi rõ "quy tắc này ưu tiên hơn
  mục ...", để 2 quy tắc không mâu thuẫn nhau.
- Nên giữ nguyên mục "Đầu ra" và phần nguyên tắc đầu tiên (giữ nguyên nội dung, không thêm bớt): app tự lo
  tiêu đề chương, lời bình/chú thích do AI thêm vào sẽ lẫn vào chương khi đọc, nghe và tải xuống.
- Đừng để prompt quá dài vì nó tính vào mỗi chương (tốn quota và chậm hơn). Nên BỎ mục không hợp với truyện
  (vd truyện hiện đại thì bỏ phần thơ/câu đối cổ phong) thay vì chỉ thêm vào.
- Sửa trên BẢN SAO của preset để còn bản gốc; sau khi sửa hãy dịch thử 1–2 chương rồi mới dịch hàng loạt.
  Đổi prompt giữa chừng có thể làm văn phong các chương trước/sau hơi lệch nhau — cần thì "Dịch lại".

KHI NÀO KHÔNG NÊN NHÉT VÀO PROMPT:
- Vài từ/tên/cụm dịch sai lặp lại: dùng "Sửa văn bản" — thay ngay không cần dịch lại, không tốn quota, có hiệu
  lực cả khi tải TXT/EPUB và khi nghe.
- Giới tính, quan hệ, xưng hô, tên các nhân vật: dùng "Bộ nhớ nhân vật" — app đính kèm thông tin nhân vật liên
  quan vào mỗi lần dịch và bạn có thể tự chỉnh từng nhân vật; preset "Huyền huyễn" còn dặn AI ưu tiên tuyệt đối
  thông tin này hơn quy tắc xưng hô mặc định. Chỉ dặn cách xưng hô chung của cả bộ truyện thì mới cần ghi
  vào prompt. Còn các cặp xưng hô hay dùng theo THỂ LOẠI (ta/ngươi, tôi/cậu...) thì chỉnh bằng nút "Xưng hô
  thường gặp" trong Bộ nhớ nhân vật, không cần viết vào prompt.`.trim(),
  });

  // ---------- Xưng hô thường gặp ----------
  // [nguồn: index.html — popup #charmemAddrOverlay (nút #charmemAddrBtn ở đầu khung Bộ nhớ nhân vật);
  //  character-memory.js — renderCharMemAddrModal/cmAddr*; addr-presets.js — DEFAULT_GROUPS, avoidTerms, addPairs...;
  //  chatbot.js — lệnh set_addr_genre / edit_addr_presets / open_addr_presets]. Chỉ nêu cách DÙNG và phạm vi ảnh hưởng
  //  (giữ ranh giới CHATBOT_RULES), không mô tả cách app dựng prompt bên trong.
  push({
    title: 'Xưng hô thường gặp — chọn thể loại, thêm/bớt cặp xưng hô',
    summary: 'Popup trong Bộ nhớ nhân vật: chọn thể loại của truyện (tự nhận diện/chọn tay/không dùng), thêm hoặc xoá cặp xưng hô và từ cần tránh của thể loại, đặt lại mặc định; Trợ lý AI có thể tư vấn và thêm/bớt giúp.',
    keywords: 'xung ho thuong gap, cap xung ho, them cap xung ho, bot cap xung ho, xoa cap xung ho, cap tu, tu can tranh, ' +
      'xung ho+the loai, xung ho+them, xung ho+bot, xung ho+xoa, xung ho+goi y, xung ho+tu van, xung ho+nen dung, ' +
      'bo xung ho, don xung ho, nut xung ho, popup xung ho, xung ho+bo nho nhan vat, the loai+tu nhan dien, khong dung preset, ~xung ho',
    max: 4500,
    text: `
"Xưng hô thường gặp" là bảng các cặp xưng hô hay dùng theo THỂ LOẠI truyện (cổ đại, hiện đại, fantasy...) để
app dịch bám đúng bối cảnh. Mỗi cặp viết dạng "tự xưng/gọi đối phương", ví dụ "ta/ngươi" = người nói xưng "ta" và
gọi người kia là "ngươi".
Cách mở: mở "Bộ nhớ nhân vật" (nút trên toolbar khi đang mở truyện) → nút "Xưng hô thường gặp" ở đầu khung, bên trái
icon Cài đặt. Trợ lý AI cũng có thể mở popup này giúp bạn.
Trong popup:
- Thể loại: chọn cách áp cho truyện đang mở. "Tự nhận diện" = app tự đoán thể loại từ phần chỉ dẫn ở đầu prompt dịch
  (ô đang được tự nhận diện viền nét đứt; nếu chưa đoán được sẽ ghi "Chưa nhận diện được" — khi đó hãy chọn tay, hoặc
  nêu rõ thể loại, vd "tu tiên", "ngôn tình hiện đại", ở đầu prompt dịch). Hoặc chọn tay 1 nhóm — Cổ đại, Hiện đại, Khoa huyễn,
  Fantasy, Cổ điển phương Tây, Light novel, Trung cổ — và thể loại con của nhóm (Cổ đại: Huyền huyễn, Võ hiệp, Lịch sử,
  Ngôn tình, Cung đấu / Trạch đấu, Dân quốc; Hiện đại: Đô thị, Ngôn tình, Công sở, Học đường, Giới giải trí, Kinh doanh).
  "Không dùng preset" = truyện này không áp bộ xưng hô nào. Lựa chọn thể loại được lưu RIÊNG cho từng truyện.
- Thêm cặp mới: gõ các cặp dạng A/B, cách nhau dấu phẩy (vd ta/ngươi, tôi/cậu) rồi bấm "Thêm". Cặp mới lên đầu danh
  sách; cặp đã có thì bị bỏ qua; mục sai định dạng (phải có đúng 1 dấu "/", cả 2 vế không trống) sẽ được báo.
- Cặp đang dùng: danh sách cặp của thể loại đang chọn (có số lượng); bấm dấu ✕ cạnh cặp để xoá.
- Từ cần tránh: các từ lệch thể loại (vd truyện cổ trang nên tránh "tôi", "cậu"; truyện hiện đại/phương Tây nên tránh
  "huynh", "muội", "tại hạ"...). Thêm bằng ô nhập (từ hoặc cụm, cách nhau dấu phẩy, không nhập dạng A/B); bấm vào từ
  để xoá; nút "Đặt lại từ cần tránh về mặc định". Từ nào đã nằm trong bộ cặp của thể loại thì tự được miễn khỏi danh
  sách này (trừ từ bạn tự thêm vào).
- "Đặt lại thể loại này về mặc định" (cuối popup): đưa cả bộ cặp và từ cần tránh của thể loại về bản gốc — có hộp xác
  nhận, cặp/từ bạn đã thêm hoặc xoá sẽ mất.
- "Dọn xưng hô lệch thể loại": chỉ hiện khi có nhân vật đã lưu xưng hô lệch thể loại (do AI ghi). Bấm để xoá phần lệch
  (không đụng xưng hô bạn đã tự sửa); các chương dịch sau sẽ tự điền lại.
Lưu ý:
- Bộ cặp và từ cần tránh dùng CHUNG cho mọi truyện cùng thể loại (thêm/xoá ở đây ảnh hưởng cả các truyện khác cùng thể
  loại); chỉ việc chọn thể loại là riêng từng truyện. Thay đổi chỉ áp dụng cho các lần dịch sau — chương đã dịch giữ
  nguyên, muốn áp lại thì "Dịch lại chương này".
- Đây là gợi ý từ vựng theo thể loại, không ép nhân vật nào phải dùng cặp nào. Xưng hô cụ thể đã lưu trong hồ sơ từng
  nhân vật (Bộ nhớ nhân vật) được ưu tiên hơn bộ chung — nếu chỉ 1 nhân vật cần cách xưng hô riêng thì sửa ở hồ sơ nhân
  vật thay vì sửa bộ chung.
- Trợ lý AI có thể tư vấn nên thêm/bớt cặp nào, chọn thể loại cho truyện đang mở và thêm/bớt cặp, từ cần tránh giúp bạn
  (thay đổi bộ chung cần bấm "Cho phép"). Trợ lý không làm thay 2 việc "Đặt lại về mặc định" và "Dọn xưng hô lệch thể
  loại" — hai nút đó bạn tự bấm trong popup.`.trim(),
  });

  // ---------- Tải xuống TXT/EPUB ----------
  push({
    title: 'Tải xuống truyện đã dịch (TXT / EPUB)',
    summary: 'Tải TXT/EPUB theo khoảng chương; chương đã dịch gắn hậu tố "[ Dịch ]"; tên file ghi số chương đã dịch.',
    keywords: 'tai xuong, download, xuat file, epub, txt, khoang chuong, chon chuong tai, tai ve, xuat truyen, xuat ra, ebook, tai file, ' +
      'tai+tu chuong, tai+den chuong, tai+chuong, chi tai, tai mot phan, kindle, kobo, may doc sach, doc sach dien tu, ereader, luu thanh file, luu ra file, ' +
      'gop chuong, trung tieu de, gop phan, phan 1, phan 2, tai truyen trong tu, tai+khong can mo, tai+truyen khac',
    text: `
Nút "Tải xuống" (hoặc trong mục "Thêm") mở hộp chọn định dạng TXT hoặc EPUB và khoảng chương
muốn tải (để trống "Tới chương" hoặc gõ "cuối cùng" để lấy tới chương cuối).
- File gộp TẤT CẢ chương trong khoảng đã chọn thành 1 file; chương nào đã dịch thì lấy bản
  dịch, chương nào chưa dịch thì lấy nguyên bản gốc.
- Tên chương đã dịch được tự gắn thêm hậu tố "[ Dịch ]" ở cuối tiêu đề trong file xuất ra — để
  người đọc biết chương nào đã dịch, đồng thời nếu import lại đúng file này (hoặc file có gắn
  hậu tố tương tự) app sẽ TỰ nhận ra chương đó đã dịch rồi, không dịch lại từ đầu.
- Tên file tải về có ghi kèm số chương đã dịch/tổng số chương trong khoảng đã chọn, tiện để
  biết còn thiếu chương nào chưa dịch mà không cần mở lại app.
- EPUB có mục lục điều hướng theo từng chương, mở được bằng hầu hết ứng dụng đọc ebook.
- Tuỳ chọn "Gộp các chương trùng tiêu đề": gộp các chương LIỀN KỀ bị tách ra từ cùng 1 chương (cùng tên, hậu tố "Phần 1", "Phần 2"... hoặc "(1)", "(2)")
  thành 1 chương, rồi đánh số lại "Chương N" liên tục. Mặc định tắt mỗi lần mở hộp.
- Tải truyện KHÁC không cần mở: trong Tủ truyện bấm ⋮ của truyện đó → "Tải xuống" (hộp giống hệt, truyện đang đọc không bị ảnh hưởng).`.trim(),
  });

  // ---------- Mục lục ----------
  push({
    title: 'Mục lục — danh sách chương và nhảy tới chương bất kỳ',
    summary: 'Nút "Mục lục": danh sách chương, chấm trạng thái đã dịch/đang dịch, nhảy tới chương bất kỳ.',
    keywords: 'muc luc, danh sach chuong, nhay toi chuong, mo muc luc, dong muc luc, chuong nao da dich, cham trang thai chuong, tim chuong, loc chuong, chua dich, da dich, tim so chuong, tim ten chuong',
    text: `
Mục lục là danh sách tất cả chương của truyện đang mở, dùng để nhảy thẳng tới 1 chương bất kỳ.
- Mở/đóng: bấm nút "☰ Mục lục" ở thanh điều hướng chương (nằm giữa "Chương trước" và "Chương sau",
  có ở cả đầu và cuối trang đọc). Chỉ dùng được khi đã mở 1 truyện. Muốn đóng có thể bấm lại nút đó,
  hoặc bấm vào vùng nội dung đọc (trên điện thoại: bấm vào phần nền tối bên ngoài).
- Mục lục và Tủ truyện chỉ mở được 1 trong 2 cùng lúc — mở cái này thì cái kia tự đóng lại.
- Đầu bảng hiện tổng số chương ("N chương"). Mỗi dòng là 1 chương (hiện tên đã dịch nếu chương đã có
  tên dịch, chưa thì tên gốc) kèm 1 chấm trạng thái: chấm đổi màu = chương ĐÃ DỊCH, chấm nhấp nháy =
  chương ĐANG DỊCH, chương đang đọc được tô nổi lên. Nhìn chấm là biết chương nào còn chưa dịch.
- Bấm vào 1 chương để mở chương đó: chương đã dịch hiện bản dịch, chương chưa dịch hiện bản gốc.
  Nếu "Tự động dịch" đang bật (và bạn đã bắt đầu dịch truyện này), chương chưa dịch vừa mở sẽ được
  tự dịch luôn.
- Trên máy tính, mở Mục lục sẽ tự cuộn tới chương đang đọc; trên điện thoại thì không tự cuộn.
- Ô "Tìm chương hoặc nhập số..." ở đầu Mục lục: gõ tên chương hoặc số chương để lọc danh sách. Ba nút lọc "Tất cả / Đã dịch / Chưa dịch" giúp thấy
  ngay chương nào còn chưa dịch. Nút mũi tên ở đầu bảng đưa về chương đang đọc.`.trim(),
  });

  // ---------- Menu "Thêm" (Xem bản gốc / Xóa bản dịch / Tải xuống) ----------
  push({
    title: 'Nút "Thêm" trên toolbar — Xem bản gốc, Xóa bản dịch, Tải xuống',
    summary: 'Nút "Thêm" trên toolbar gom: Xem bản gốc/bản dịch, Xóa bản dịch, Tải xuống (và Sửa văn bản trên màn hình hẹp).',
    keywords: 'nut them, menu them, xem ban goc, xem ban dich, ban goc, doi qua lai ban goc, nut ba cham, tim nut xoa ban dich, tim nut tai xuong',
    text: `
Nút "Thêm" nằm trên toolbar phía trên khu vực đọc (bên phải nhóm nút Đánh dấu/Nghe); các nút chỉ bấm
được sau khi đã mở truyện. Bấm vào sẽ mở 1 menu gom các nút ít dùng:
- "Xem bản gốc" / "Xem bản dịch": chuyển qua lại giữa văn bản gốc và bản dịch của chương đang đọc (nhãn
  tự đổi theo chế độ đang xem). Chương chưa dịch thì chỉ có bản gốc.
- "Xóa bản dịch": mở menu con để xoá bản dịch (chi tiết ở mục "Xóa bản dịch").
- "Tải xuống": chọn TXT hoặc EPUB rồi chọn khoảng chương (chi tiết ở mục "Tải xuống truyện đã dịch").
- Trên điện thoại/màn hình hẹp, menu này còn có thêm "Sửa văn bản" (vì nút riêng của nó trên toolbar bị
  ẩn đi cho gọn); trên màn hình rộng thì "Sửa văn bản" là 1 icon đứng riêng cạnh nút Đánh dấu.
- Các nút "Bộ nhớ nhân vật" (icon hai người, rê chuột hiện "Quan hệ nhân vật") và "Cài đặt" (icon bánh răng) nằm ngoài menu này, ở góc phải toolbar.`.trim(),
  });

  // ---------- Xóa bản dịch ----------
  push({
    title: 'Xóa bản dịch (chương này / các chương đã đọc / tất cả)',
    summary: 'Thêm → Xóa bản dịch: xoá bản dịch chương này / các chương đã đọc / tất cả, luôn có hộp xác nhận; nút "Dịch lại chương này".',
    // "a+b" = khớp khi câu hỏi có CẢ a lẫn b, không cần đứng liền nhau (xem kwMatch trong chatbot.js).
    keywords: 'xoa ban dich, xoa dich, xoa chuong da dich, xoa ban dich da doc, xoa tat ca ban dich, xoa lai tu dau, dich lai tu dau, khong hoan tac, thung rac, ' +
      'xoa+ban dich, xoa+dich, xoa+chuong da, huy+ban dich, lam lai+ban dich, lam lai+chuong, dich lai, ghi de+ban dich',
    text: `
Vào nút "Thêm" → "Xóa bản dịch" (icon thùng rác), có 3 lựa chọn. Cả 3 đều chỉ tác động lên TRUYỆN ĐANG MỞ,
đều hiện hộp xác nhận trước ("Xóa"/"Hủy") nên không bị xoá nhầm ngay:
- "Xóa bản dịch chương": xoá bản dịch của chương đang mở. Chương đó quay về hiện bản gốc; tên chương đã dịch
  vẫn được giữ lại (dịch lại thì không tốn thêm lượt dịch tên). Nếu chương chưa có bản dịch, app báo
  "Chương này chưa có bản dịch".
- "Xóa bản dịch đã đọc": xoá bản dịch của TẤT CẢ các chương đứng TRƯỚC chương đang mở. Bản dịch của chương
  đang mở và các chương phía sau được giữ nguyên. Hộp xác nhận cho biết sẽ xoá bao nhiêu chương. Không có
  chương nào phía trước, hoặc các chương phía trước chưa dịch, thì app báo và không làm gì.
- "Xóa tất cả bản dịch": xoá TOÀN BỘ bản dịch (và tên chương đã dịch) của truyện đang mở — hộp xác nhận ghi
  rõ "Không thể hoàn tác".
Xoá bản dịch KHÔNG xoá chính truyện khỏi Tủ truyện (muốn xoá truyện thì dùng nút xoá trong Tủ truyện). Xoá xong
muốn có bản dịch lại thì dịch lại từ đầu (tốn lượt gọi API mới). Nếu chỉ muốn dịch lại 1 chương và ghi đè
lên bản cũ thì dùng nút "Dịch lại chương này" thay vì xoá. Nếu đã Sao lưu qua Google Drive trước đó thì có
thể Khôi phục lại bản dịch từ bản sao lưu.`.trim(),
  });

  // ---------- Xử lý sự cố / liên hệ ----------
  push({
    title: 'Xử lý sự cố thường gặp',
    summary: 'Chưa nhập API key, lỗi 429/hết quota, mạng lag/timeout, đọc offline, mất dữ liệu, nút "Mặc định", cách liên hệ admin.',
    keywords: 'bi loi, gap loi, co loi, hien loi, khong dich duoc, khong hoat dong, bao loi, gop y, yeu cau tinh nang, quota het, key sai, 429, mat du lieu, khong luu, ' +
      'het quota, het luot, 503, loi server, sao dich loi, tai sao dich loi, dich hay loi, hay bi loi, model canh bao, key khong hop le, api key+sai, api key+loi, bi treo, dich bi treo, dung im, khong phan hoi, bao cao loi, lien he admin, ' +
      'lien he, ~admin, facebook, ~gmail, ~email, mat truyen, bien mat, offline, khong co mang, ' +
      'mat+truyen, dung hoai, dung mai, ket hoai, ket mai, dung+hoai, dung+mai, ket+hoai, ket+mai, ket+chuong do, bi ket, khong chay, nut mac dinh, mac dinh+cai dat, reset, dat lai, xoa sach, ' +
      'ai lam ra, ai tao ra, ai phat trien, nguoi lam ra, tac gia app, admin la ai, ai la admin, xoa cache, cache, xoa du lieu, che do an danh',
    text: `
- "Chưa nhập API key" khi dịch/hỏi Trợ lý: vào Cài đặt (icon bánh răng) → nhập API key Gemini
  hoặc DeepSeek. Xem popup "Hướng dẫn lấy Gemini API Keys" nếu chưa có key.
- Báo lỗi 429/hết quota: app tự thử các key khác đã nhập cho tới khi hết key hoặc thành công;
  quota theo NGÀY của Google thường tự reset khoảng 14–15h giờ Việt Nam. Có thể nhập thêm key
  từ project Google khác trong Cài đặt để dùng tiếp ngay, không cần đợi. Tier miễn phí của
  Gemini giới hạn khoảng 5 request/phút cho mỗi key — nếu hay bị lỗi 429 theo PHÚT (khác lỗi hết
  quota NGÀY), nên hạ "Tốc độ dịch" (số chương dịch song song) xuống thấp hơn.
- Mạng lag, dịch bị đơ/treo, timeout: thử đổi/cài thêm 1 extension VPN miễn phí trên trình
  duyệt để tránh bị giới hạn theo IP.
- Đã mở truyện 1 lần rồi thì lần sau có thể MỞ LẠI VÀ ĐỌC được kể cả khi không có mạng (không
  cần mạng để đọc truyện đã tải sẵn); các việc cần mạng (dịch mới, nghe giọng đọc, sao lưu
  Drive...) vẫn cần kết nối internet như bình thường.
- Mất truyện / mất bản dịch: xem mục "Mất truyện / mất bản dịch — nguyên nhân và cách phòng".
- Nút "Mặc định" trong Cài đặt sẽ XOÁ TOÀN BỘ truyện, bản dịch, API key, preset và bookmark
  đang lưu trên trình duyệt này, KHÔNG hoàn tác được — chỉ nên dùng khi chắc chắn, và tốt nhất
  nên Sao lưu Google Drive trước nếu còn dữ liệu muốn giữ.
- Báo lỗi ứng dụng / góp ý / xin thêm tính năng / xin thêm nhạc nền: nhắn qua page Facebook
  chính thức (xem mục Liên hệ trong ngữ cảnh cuộc trò chuyện), hoặc gửi email tới
  noveltools.ai@gmail.com.`.trim(),
  });

  // ---------- Lấy API key DeepSeek ----------
  // [nguồn: popup "Hướng dẫn lấy API Keys" trong index.html CHỈ nói về Gemini nên câu hỏi "lấy key deepseek" trước đây bị trả nhầm
  //  các bước Gemini. Các bước dưới là quy trình chung của trang nền tảng DeepSeek (đối chiếu nhiều nguồn ngày 19/9/2026) — giao diện/giá
  //  của DeepSeek có thể đổi, nên đã dặn Trợ lý nhắc người dùng đối chiếu trang chính thức.]
  push({
    title: 'Lấy API key DeepSeek',
    summary: 'Các bước tạo API key DeepSeek trên platform.deepseek.com, cần nạp tiền trước khi key dùng được, dán vào ô "DeepSeek API Keys" trong Cài đặt.',
    keywords: 'key deepseek, deepseek+key, api key deepseek, deepseek+api, lay key deepseek, tao key deepseek, nap tien deepseek, deepseek+nap tien, ' +
      'deepseek+tao tai khoan, deepseek+dang ky, platform deepseek, deepseek+het tien, deepseek+het so du, deepseek+insufficient',
    text: `
Key DeepSeek khác key Gemini — không dùng lẫn cho nhau, và popup "Hướng dẫn lấy API Keys" trong app chỉ dành cho Gemini.
- Vào trang nền tảng của DeepSeek: platform.deepseek.com, đăng ký/đăng nhập bằng email hoặc số điện thoại.
- Vào mục "API keys" ở thanh bên trái → bấm "Create new API key" → đặt tên bất kỳ → sao chép key NGAY (key chỉ hiện đúng 1 lần;
  mất thì phải tạo key mới).
- DeepSeek tính phí theo lượng dùng: cần nạp tiền (mục "Top up" trên trang nền tảng) thì key mới gọi được; hết số dư thì
  dịch sẽ báo lỗi cho tới khi nạp thêm. Xem giá và cách thanh toán mới nhất trên trang chính thức của DeepSeek vì có thể thay đổi.
- Trong NovelTools: mở Cài đặt (icon bánh răng) → chọn model "DeepSeek V4 Flash" → dán key vào ô "DeepSeek API Keys" → Lưu.
- Đừng chia sẻ key cho người khác; file sao lưu loại "Cài đặt"/"Toàn bộ" cũng chứa key này.`.trim(),
  });

  // ---------- File & ngôn ngữ được hỗ trợ ----------
  // [nguồn: index.html — <input id="fileInput" accept=".txt,.epub">; Cài đặt không có tuỳ chọn ngôn ngữ đích; presets.js viết cho
  //  truyện tiếng Trung (và Fantasy/Light Novel). Cố ý KHÔNG khẳng định app hỗ trợ tiếng Anh/Hàn/Nhật vì chưa có tài liệu nói vậy —
  //  nếu đã kiểm chứng được thì sửa lại đoạn "Ngôn ngữ gốc" bên dưới.]
  push({
    title: 'File và ngôn ngữ truyện được hỗ trợ',
    summary: 'Chỉ mở file .txt và .epub (docx/pdf phải đổi định dạng trước); dịch sang tiếng Việt; chưa có tài liệu nêu rõ các ngôn ngữ nguồn khác ngoài tiếng Trung.',
    keywords: 'docx, pdf, word, mobi, azw, dinh dang, loai file, file gi, file nao, epub duoc khong, txt duoc khong, ' +
      'tieng anh, tieng han, tieng nhat, tieng phap, tieng thai, tieng indo, ngon ngu nguon, ngon ngu goc, ngon ngu nao, ho tro ngon ngu, ' +
      'sang tieng anh, sang tieng trung, sang tieng nhat, sang tieng han, truyen han quoc, truyen nhat ban, truyen tieng anh, truyen convert, ban convert',
    text: `
- File mở được: chỉ .txt và .epub (khung "Mở file truyện TXT / EPUB" — bấm chọn file hoặc kéo thả vào). File .docx, .pdf, .mobi/.azw... không
  mở trực tiếp được: cần đổi sang TXT hoặc EPUB bằng phần mềm khác trước, rồi mở lại.
- Ngôn ngữ đích luôn là tiếng Việt; Cài đặt không có ô chọn dịch sang ngôn ngữ khác.
- Ngôn ngữ gốc của truyện: các preset có sẵn chủ yếu viết cho truyện tiếng Trung (kể cả bản dịch máy/convert); riêng "Fantasy" nhắm tới
  Fantasy phương Tây và "Light Novel" nhắm tới light novel Nhật/Trung/Hàn. Hướng dẫn trong app CHƯA nêu rõ danh sách ngôn ngữ nguồn
  được hỗ trợ và chưa cam kết chất lượng với tiếng Anh/Hàn/Nhật. Muốn biết chắc với 1 file cụ thể: thử dịch 1 chương và xem kết quả, hoặc
  hỏi admin.`.trim(),
  });

  // ---------- Tính năng hiện CHƯA có ----------
  // [nguồn kiểm tra 19/9/2026: index.html (Cài đặt chỉ có API key/AI model/Chế độ dịch/Tốc độ dịch/Số chương dịch trước/Chia chương/Prompt;
  //  ô tìm duy nhất là "Tìm tên nhân vật..." trong Bộ nhớ nhân vật), tts.js (không có hẹn giờ tắt, không có nút tải audio).
  //  KHI THÊM TÍNH NĂNG NÀO TRONG DANH SÁCH NÀY → XOÁ DÒNG TƯƠNG ỨNG Ở ĐÂY.]
  push({
    title: 'Tính năng hiện CHƯA có trong app',
    summary: 'Chưa có: hẹn giờ tắt khi nghe, tải audio về, tìm chữ trong nội dung truyện, đổi màu nền vùng đọc. (Đổi font/cỡ chữ đã CÓ — xem mục Cấu hình đọc.)',
    keywords: 'mau nen doc, nen doc, sepia, doi mau nen, ' +
      'hen gio, tat sau, sleep timer, tai audio, tai mp3, mp3, luu audio, xuat audio, tai giong doc, ' +
      'tim trong truyen, tim kiem trong truyen, tim noi dung, tim+trong truyen, tim+trong chuong, tim kiem+tu, tim kiem+cau, ctrl f',
    text: `
Theo hướng dẫn hiện có, những tính năng sau CHƯA có trong NovelTools:
- Đổi MÀU NỀN vùng đọc: chưa có (chỉ có giao diện sáng/tối ở icon mặt trời/mặt trăng). Đổi font, cỡ chữ, độ rộng, khoảng cách dòng, căn chữ thì ĐÃ có trong "Cấu hình đọc" (nút Aa).
- Nghe truyện: chưa có hẹn giờ tự tắt và chưa có nút tải audio về máy (thanh Nghe chỉ phát trực tiếp).
- Tìm 1 từ/câu trong NỘI DUNG truyện: chưa có. Các ô tìm hiện có: tìm truyện/tác giả trong Tủ truyện, tìm chương trong Mục lục, tìm nhân vật trong Bộ nhớ nhân vật. Có thể dùng Ctrl+F của trình duyệt cho phần chữ đang hiển thị.
Muốn đề xuất thêm tính năng: nhắn admin (xin thêm tính năng) qua Facebook hoặc email trong mục Liên hệ.`.trim(),
  });


  // ---------- Cấu hình đọc (nút Aa) ----------
  push({
    title: 'Cấu hình đọc — chế độ Cuộn/Lật, font, cỡ chữ, độ rộng, khoảng cách dòng, căn chữ',
    summary: 'Nút Aa mở popup Cấu hình đọc: chế độ Cuộn hoặc Lật trang, 11 font, cỡ chữ 14–44, độ rộng, khoảng cách dòng, căn chữ, Đặt lại mặc định.',
    keywords: 'cau hinh doc, nut aa, aa, co chu, chu to, chu nho, phong to chu, thu nho chu, font, phong chu, doi font, kieu chu, ' +
      'khoang cach dong, gian dong, do rong, can chu, can deu, lat trang, che do lat, che do cuon, cuon, doc kieu sach, vuot, ' +
      'chinh chu, chinh co chu, doi che do doc, che do doc, dat lai mac dinh',
    text: `
"Cấu hình đọc" chỉnh cách chữ hiện trên màn hình đọc. Mở bằng nút "Aa" (nút nổi ở chế độ Cuộn; ở chế độ Lật là nút Cấu hình ở thanh dưới/tiêu đề; trên điện thoại hiện dạng bảng trượt từ dưới lên).
Các mục:
- Chế độ đọc: "Cuộn" (kéo dọc như trước) hoặc "Lật" (lật từng trang như sách; chạm 2 mép / vuốt ngang trên cảm ứng; mũi tên, lăn chuột, Space/PageUp/PageDown/Home/End trên máy tính; lật quá trang cuối thì sang chương sau).
- Font chữ: Segoe UI (mặc định), Hệ thống, Arial, Tahoma, Georgia, Palatino, Times New Roman, Be Vietnam Pro, Noto Serif, Lora, Merriweather (một số font cần mạng để tải lần đầu).
- Cỡ chữ: 14–44 px (mặc định 25 trên máy tính, 19 trên điện thoại), bấm − / + từng bước 1.
- Độ rộng: độ rộng cột chữ 400–1400 px, mặc định "Tự động".
- Khoảng cách dòng: 1.2–3.2 (mặc định khoảng 2).
- Căn chữ: trái hoặc đều hai bên.
- "Đặt lại mặc định": trả TẤT CẢ mục (trừ chế độ đọc) về mặc định.
Cài đặt được nhớ trong trình duyệt. Có thể nhờ Trợ lý chỉnh hộ (chế độ đọc, font, cỡ chữ...).`.trim(),
  });

  // ---------- Chế độ dịch & tốc độ dịch ----------
  // [đã thêm đoạn mở đầu + cụm từ khoá "dich tat ca/dich toan bo/tung chuong..." sau khi thấy Trợ lý
  // trả lời lệch (bịa "Chế độ dịch phù hợp" + gợi ý VPN không liên quan) cho câu hỏi kiểu "dịch tất cả
  // chương một lượt" — do câu đó không khớp từ khoá nào nên rơi vào nhánh tóm tắt 1 dòng, thiếu chi tiết.]
  push({
    title: 'Chế độ dịch, Tốc độ dịch, Số chương dịch trước',
    summary: 'Trong Cài đặt: Chế độ dịch (Nhanh/Bình thường/Nghĩ kỹ), Tốc độ dịch (số chương dịch song song), Số chương dịch trước — gồm cả cách dịch hàng loạt bằng "Tự động dịch" + "Số chương dịch trước" = 100.',
    keywords: 'che do dich, ~nhanh, ~binh thuong, nghi ky, toc do dich, song song, so chuong dich truoc, preload, dich cham, dich nhanh hon, ' +
      'dich tat ca, dich toan bo, dich het truyen, dich ca truyen, dich hang loat, dich lien tuc, dich san+chuong, dich san+truoc, tu dong dich, khong can+tung chuong, tung chuong 1, an+tung chuong, ' +
      'dich+het truyen, dich+ca truyen, dich+toan bo truyen, dich+tat ca chuong, dich+het chuong, dich+1 luot, dich+mot luot, dich+1 lan, dich+mot lan, ' +
      'khoi bam, bam+tung chuong, tu dich, khong tu dich, khong tu dong, dich tiep, thoi gian dich, dich+bao lau',
    text: `
Muốn dịch MỘT LƯỢT hết các chương chưa dịch (khỏi phải bấm "Dịch" từng chương): mở chương muốn
bắt đầu (vd chương 1 hoặc chương đầu tiên chưa dịch), vào Cài đặt đặt "Số chương dịch trước" =
100 (mức cao nhất), rồi bấm nút "Tự động dịch" trên thanh công cụ để BẬT — app sẽ tự dịch trước tối đa
100 chương phía sau chương đang đọc, không cần bấm dịch từng chương; truyện dài hơn 100 chương thì khi bạn đọc/nhảy tới chương xa hơn, app dịch tiếp
phần phía sau (xem mục "Số chương dịch trước" bên dưới). Có thể tắt "Tự động dịch" bất cứ lúc nào để dừng lại.

Trong Cài đặt có 3 tuỳ chọn ảnh hưởng tốc độ/chất lượng dịch, độc lập với preset (preset quyết
định văn phong, còn đây quyết định CÁCH GỌI AI):
- "Chế độ dịch": 3 mức —
  "Nhanh, linh hoạt, tiết kiệm" (có thể xử lý được một số nội dung AI hay từ chối nhầm, nhưng
  chất lượng dịch có thể giảm); "Bình thường" (cân bằng, khuyến nghị cho hầu hết trường hợp);
  "Nghĩ kỹ" (AI suy luận kỹ hơn để xử lý câu khó và giữ ngữ cảnh tốt hơn, có thể chậm hơn). Cả
  3 mức dùng CHUNG 1 model đang chọn, chỉ khác cách nhắc AI suy nghĩ kỹ tới đâu — không tự đổi
  sang model khác (việc đổi model chỉ xảy ra riêng khi 1 model/key bị lỗi/hết quota).
- "Tốc độ dịch" (các mức 1x, 2x, 3x ⭐ khuyến nghị, 6x, 10x, 15x): số chương được gửi dịch CÙNG LÚC (song song) thay vì lần lượt.
  LƯU Ý: chọn 2x/3x sẽ tốn quota nhanh gấp 2/3 lần so với 1x trong cùng khoảng thời gian (vì
  gọi API nhiều lần cùng lúc), không phải chỉ nhanh hơn mà tổng lượt gọi vẫn như cũ. Tài khoản
  Gemini miễn phí chỉ nên chọn tối đa "3x" để giảm lỗi Rate Limit (429) — giới hạn thực tế phổ
  biến của tier miễn phí Gemini là khoảng 5 request/phút cho mỗi key.
- "Số chương dịch trước": khi bật Tự động dịch hoặc nghe truyện, app tự dịch trước bao nhiêu
  chương kế tiếp (các mức 5/10/20/50/100; mức "Tất cả chương chưa đọc" đã bỏ) để đọc/nghe liên tục không phải chờ.
Muốn đổi model AI cụ thể (Gemini 3.8/3.6/3 Flash, Gemini 3.5 Flash Lite, DeepSeek...) thì vào mục chọn model bên cạnh, không
phải "Chế độ dịch" — 2 mục này khác nhau.`.trim(),
  });

  // ---------- Chọn model AI (Gemini / DeepSeek) ----------
  // [nguồn: index.html — <select id="modelSelect"> (nhãn + số sao); translate.js — MODELS/DEEPSEEK_MODELS,
  //  quy tắc tự hạ model khi hết quota ngày, DeepSeek không giới hạn thời gian/chương; chatbot.js — mục
  //  "Số chương dịch được với 1 API key" (số ước tính lấy từ FACTS.quota) và action set_model].
  //
  // ▶ ĐIỀN SỐ LIỆU THẬT VÀO BẢNG DƯỚI ĐÂY. Ô để null = dòng đó KHÔNG xuất hiện trong tài liệu gửi cho
  //   Trợ lý (không có chỗ trống "[điền]" nào lọt ra câu trả lời), và cuối tài liệu tự ghi rõ những phần
  //   còn thiếu để Trợ lý nói thật "hướng dẫn chưa đề cập" thay vì đoán. Điền chuỗi ngắn, viết như câu
  //   nói với người dùng, vd  speed: 'nhanh nhất trong 4 model Gemini'  hoặc  quota: 'khoảng N chương/key/ngày'.
  //   - quality: khác biệt chất lượng THỰC TẾ ngoài số sao (vd giữ xưng hô tốt hơn, ít sót chữ Hán hơn...)
  //   - speed:   tốc độ dịch 1 chương so với các model khác
  //   - quota:   số chương/ngày ước tính RIÊNG cho model này (nếu số ở mục quota chung không đủ)
  //   - note:    lưu ý khác (hay bị 429/503, hợp thể loại nào, có nên dùng cho truyện dài...)
  //   Số ước tính chương/key KHÔNG khai báo ở đây: đọc lúc có câu hỏi từ window.CHATBOT_FACTS.quota (chatbot.js) — đổi
  //   số ở đó là mọi nơi (FAQ, mục quota, dòng "tiết kiệm quota" bên dưới) tự cập nhật.
  // ▶ SỐ LIỆU THẬT (cập nhật 19/9/2026, tự tra cứu — giá/băng thông đổi khá thường xuyên nên coi đây
  //   là ước tính tương đối, không phải giá niêm yết chính xác tại mọi thời điểm):
  //   - Gemini 3.8 Flash: ĐÃ ỔN ĐỊNH (admin xác nhận 12/10/2026), khoảng 20 chương/ngày/key giống các Flash thường khác.
  //   - Gemini 3.7 Flash: ĐÃ BỊ GỠ khỏi app (không còn trong danh sách model).
  //   - Gemini 3.5 Flash: ĐÃ BỊ GỠ khỏi app (Google ngừng cung cấp). Gemini 3.5 Flash LITE vẫn còn.
  //   - Gemini 3.5 Flash Lite: rẻ và nhanh nhất nhóm Gemini, được chính Google định vị cho các tác vụ
  //     khối lượng lớn như dịch thuật/trích xuất dữ liệu — đúng vai trò model tiết kiệm quota của app.
  //   - Gemini 3 Flash: vẫn mang hậu tố "preview" (thử nghiệm) phía Google — có thể bị đổi tên hoặc
  //     ngừng hỗ trợ bất ngờ hơn các model còn lại.
  //   - DeepSeek: tên model thật đã đổi (xem ghi chú DEEPSEEK_LITE_MODEL trong translate.js); model
  //     đang phục vụ hiện nay (DeepSeek-V4.1-Flash) được nhiều bên đánh giá độc lập xếp ngang hoặc
  //     vượt cả bản DeepSeek V4 Pro (cao cấp hơn) ở nhiều bài kiểm tra. DeepSeek tính phí theo token
  //     thực dùng (không có gói miễn phí theo ngày như Gemini) và có khung giờ cao điểm/thấp điểm
  //     riêng — giá cụ thể đổi khá thường xuyên nên không nêu số $ chính xác ở đây, tránh lỗi thời.
  const MODEL_INFO = [
    { name: 'Gemini 3.8 Flash', stars: 5, quality: null, speed: null, quota: 'khoảng 20 chương/ngày với mỗi API key', note: 'mới nhất, ổn định và là model mặc định của app — nên chọn đầu tiên nếu chưa biết chọn model nào' },
    { name: 'Gemini 3.6 Flash', stars: 4, quality: null, speed: null, quota: null, note: null },
    { name: 'Gemini 3 Flash', stars: 2, quality: null, speed: null, quota: null, note: 'vẫn là bản "preview" (thử nghiệm) của Google nên dễ bị đổi tên/ngừng hỗ trợ đột ngột hơn các model khác — hay gặp lỗi thì đổi qua 3.6 Flash' },
    { name: 'Gemini 3.5 Flash Lite', stars: 1, quality: 'chất lượng thấp hơn nhóm Flash thường nhưng vẫn ổn cho nhu cầu dịch số lượng lớn', speed: 'nhanh và rẻ nhất trong các model Gemini', quota: null, note: null },
    { name: 'DeepSeek V4 Flash', stars: 4, quality: 'phiên bản DeepSeek đang phục vụ hiện nay được nhiều đánh giá độc lập xếp ngang hoặc vượt cả bản DeepSeek Pro cao cấp hơn ở nhiều bài kiểm tra', speed: null, quota: null, note: 'không có gói miễn phí theo ngày như Gemini — tính phí theo đúng số token đã dùng' },
  ];
  // Riêng DeepSeek (chi phí/giới hạn — tài liệu quota chung chỉ nói về Gemini):
  //   cost: chi phí dùng API DeepSeek;  limits: giới hạn (rate limit, độ dài...);  whenToUse: khi nào nên chọn.
  const DEEPSEEK_INFO = {
    cost: 'tính phí theo token thực tế bạn dùng (không có gói miễn phí cố định theo ngày như Gemini); nhìn chung rẻ hơn nhiều AI trả phí khác, có khung giờ cao điểm/thấp điểm riêng và giá có thể đổi — nên xem giá mới nhất trên trang chính thức DeepSeek (api-docs.deepseek.com) trước khi dùng nhiều',
    limits: 'cửa sổ ngữ cảnh khoảng 1 triệu token (dư sức cho 1 chương truyện dài); không bị giới hạn số chương/ngày kiểu quota miễn phí như Gemini — giới hạn thực tế là số tiền còn lại trong tài khoản DeepSeek của bạn',
    whenToUse: 'khi đã hết quota Gemini trong ngày, khi Gemini hay từ chối dịch nhầm một số nội dung, hoặc khi chấp nhận trả phí (khá rẻ) để dịch liên tục mà không phải chờ quota Gemini reset',
  };
  // Quy tắc chọn theo mục tiêu — thêm chi tiết riêng nếu muốn (null = bỏ qua):
  const GOAL_NOTES = { quality: null, speed: null, quota: null };

  const buildModelDoc = () => {
    const lines = [];
    lines.push('Trong Cài đặt, ô "AI model" liệt kê các model dịch kèm số sao (số sao = đánh giá chất lượng dịch do app gắn sẵn, nhiều sao = chất lượng cao hơn; một số model mới chưa có số sao):');
    MODEL_INFO.forEach((m) => {
      const extra = [
        m.quality && 'chất lượng: ' + m.quality,
        m.speed && 'tốc độ: ' + m.speed,
        m.quota && 'quota: ' + m.quota,
        m.note && m.note,
      ].filter(Boolean).join('; ');
      lines.push('- ' + m.name + ' (' + (m.warn ? '⚠️, chưa ổn định' : (m.stars != null ? m.stars + ' sao' : 'chưa có số sao')) + ')' + (extra ? ' — ' + extra : ''));
    });
    lines.push('Model MẶC ĐỊNH khi mở app lần đầu là Gemini 3.8 Flash (5 sao). Gemini 3.8 Flash 5 sao, không còn biểu tượng ⚠️ cảnh báo. Người đã tự chọn model khác trước đó thì giữ nguyên lựa chọn của họ.');
    lines.push('Gemini 3.5 Flash đã BỊ GỠ khỏi app vì Google ngừng cung cấp model này (Gemini 3.5 Flash Lite thì vẫn dùng bình thường). Gemini 3.7 Flash cũng đã BỊ GỠ khỏi danh sách model. Nếu người dùng hỏi về 3.5 Flash hoặc 3.7 Flash thì nói rõ điều này và gợi ý chọn Gemini 3.8 Flash (hoặc 3.6 Flash).');
    lines.push('');
    lines.push('CHỌN THEO MỤC TIÊU:');
    lines.push('- Ưu tiên CHẤT LƯỢNG: Gemini 3.8 Flash (mới nhất, 5 sao) hoặc DeepSeek V4 Flash. Cần xử lý câu khó, giữ ngữ cảnh tốt thì bật thêm "Chế độ dịch" → "Nghĩ kỹ" (có thể chậm hơn).' + (GOAL_NOTES.quality ? ' ' + GOAL_NOTES.quality : ''));
    const q = window.CHATBOT_FACTS && window.CHATBOT_FACTS.quota;
    lines.push('- Ưu tiên TIẾT KIỆM QUOTA / dịch được nhiều chương: Gemini 3.5 Flash Lite (1 sao).' + (q
      ? ' Ước tính 1 key dịch được khoảng ' + q.perKeyLite + ' chương, so với khoảng ' + q.perKeyFlash + ' chương của nhóm model Flash thường (3.8/3.6/3 Flash) — số ước tính do admin cung cấp; đổi lại chất lượng thấp hơn.'
      : ' Đổi lại chất lượng thấp hơn các model Flash thường.') + (GOAL_NOTES.quota ? ' ' + GOAL_NOTES.quota : ''));
    lines.push('- Ưu tiên TỐC ĐỘ: muốn nhanh hơn thì chỉnh "Chế độ dịch" → "Nhanh", tăng "Tốc độ dịch" (2x/3x, tốn quota nhanh gấp 2/3 lần) và "Số chương dịch trước". DeepSeek thường dịch chậm hơn Gemini.' + (GOAL_NOTES.speed ? ' ' + GOAL_NOTES.speed : ''));
    lines.push('- Muốn vừa dịch nhiều vừa giữ chất lượng: nhập thêm API key từ các project Google khác nhau (mỗi tài khoản Gemini miễn phí tạo được tối đa 10 project), quota sẽ dồi dào hơn.');
    lines.push('- Model mới nhất liên tục báo lỗi: chọn model phiên bản cũ hơn.');
    lines.push('- Một vài chương cứ bị AI từ chối dịch: thử chuyển qua lại Gemini ↔ DeepSeek (cần đã nhập key của AI đó).');
    lines.push('');
    lines.push('KHI HẾT QUOTA NGÀY: nếu mọi key đều hết quota ngày của model đang chọn, app tự hạ dần xuống model thấp hơn trong danh sách Gemini (cuối cùng là Gemini 3.5 Flash Lite) để dịch tiếp. Khi model đang chọn bị lỗi server (503...) app cũng chỉ hạ xuống model thấp hơn, không thử model cao hơn — thanh trạng thái sẽ báo "Chuyển model chính sang ...". App không tự nhảy lên model cao hơn model bạn đã chọn, nên chất lượng có thể giảm dần trong ngày; quota ngày reset khoảng 14–15h giờ Việt Nam.');
    lines.push('');
    lines.push('DEEPSEEK: chỉ có 1 lựa chọn (V4 Flash), dùng API key DeepSeek riêng (nhập ở ô key DeepSeek sau khi chọn model này; key Gemini và key DeepSeek không dùng lẫn cho nhau). Khi lỗi/chậm, app cứ thử lại tới khi dịch được (không bỏ qua chương sau ~10 phút như Gemini) — bấm "Dừng" nếu muốn thôi.');
    if (DEEPSEEK_INFO.cost) lines.push('- Chi phí DeepSeek: ' + DEEPSEEK_INFO.cost);
    if (DEEPSEEK_INFO.limits) lines.push('- Giới hạn DeepSeek: ' + DEEPSEEK_INFO.limits);
    if (DEEPSEEK_INFO.whenToUse) lines.push('- Nên chọn DeepSeek khi: ' + DEEPSEEK_INFO.whenToUse);
    lines.push('');
    lines.push('ĐỔI MODEL: chọn trong ô "AI model" ở Cài đặt (hoặc nhờ Trợ lý đổi giúp). Chỉ áp dụng cho các lượt dịch SAU đó, không tự dịch lại chương cũ.');
    // Những phần chưa có dữ liệu → nói rõ để Trợ lý không đoán.
    const missing = [];
    if (!MODEL_INFO.some((m) => m.quality)) missing.push('khác biệt chất lượng thực tế giữa các model (ngoài số sao)');
    if (!MODEL_INFO.some((m) => m.speed)) missing.push('tốc độ dịch của từng model');
    if (!DEEPSEEK_INFO.cost) missing.push('chi phí dùng DeepSeek');
    if (!DEEPSEEK_INFO.limits) missing.push('giới hạn của DeepSeek');
    if (missing.length) {
      lines.push('');
      lines.push('CHƯA CÓ THÔNG TIN CHÍNH THỨC VỀ: ' + missing.join('; ') + '. Nếu người dùng hỏi những điều này thì nói thẳng là hướng dẫn trong app chưa đề cập (chỉ dựa vào số sao và các mục trên), TUYỆT ĐỐI không tự đoán số liệu.');
    }
    return lines.join('\n');
  };

  push({
    title: 'Chọn model AI (Gemini / DeepSeek) theo mục tiêu',
    summary: 'Các model trong Cài đặt (Gemini 3.8/3.6/3 Flash, 3.5 Flash Lite, DeepSeek V4 Flash) và cách chọn theo chất lượng, tốc độ, tiết kiệm quota.',
    keywords: 'chon model, model nao, nen dung model, nen chon model, doi model, so sanh model, model+tot, model+nhanh, model+re, ' +
      'model+tiet kiem, model+chat luong, gemini 3.8, 3.8 flash, gemini 3.6, 3.6 flash, 3.5 flash, canh bao, bieu tuong canh bao, gemini 3 flash, flash lite, deepseek, deep seek, ' +
      'uu tien chat luong, tiet kiem quota, ngoi sao, may sao, nhieu sao, ai model, chon ai, gemini hay deepseek, deepseek hay gemini',
    max: 4500,
    text: buildModelDoc, // hàm: dựng lúc có câu hỏi để đọc được window.CHATBOT_FACTS (chatbot.js nạp SAU file này)
  });

  // ---------- Chia chương ----------
  push({
    title: 'Chia chương theo Tiêu đề hay Số ký tự',
    summary: 'Cài đặt → Chia chương theo Tiêu đề (mẫu tiêu đề) hoặc Số ký tự; đổi sau khi đã dịch sẽ chia lại chương.',
    keywords: 'chia chuong, mau tieu de, chapter pattern, so ky tu, khong chia dung, sai chuong, gop chuong, tach chuong, gom 1 chuong, ca truyen 1 chuong, 1 chuong duy nhat, chuong qua dai, chuong dai',
    text: `
Trong Cài đặt, mục "Chia chương theo" có 2 cách:
- "Tiêu đề" (mặc định, khuyến nghị khi file có tiêu đề chương rõ ràng): app tự nhận diện các
  mẫu tiêu đề như "Chương [number]", "第[number]章", "第[text]章"... ("[number]" = số 1,2,3...,
  "[text]" = chữ số Việt/Hán-Việt/Hán tự). Có thể thêm/sửa mẫu tiêu đề thủ công trong ô "Mẫu
  tiêu đề" nếu truyện dùng cách đặt tên chương lạ mà app chưa nhận ra. App cũng tự dò và tự
  thêm mẫu phù hợp ngay khi mở 1 truyện mà các mẫu hiện có chưa chia được chương, không cần
  bấm nút gì thêm.
- "Số ký tự": chia đều theo độ dài văn bản (dùng khi file không có tiêu đề chương rõ ràng,
  hoặc muốn chia lại thành các phần đều nhau) — cấu hình số ký tự mỗi phần trong ô bên cạnh.
LƯU Ý: đổi cách chia chương SAU khi đã dịch dở sẽ chia lại toàn bộ chương của truyện đang mở
(vị trí đã đánh dấu/đọc tiếp vẫn được app cố tìm lại đúng đoạn dựa vào nội dung, nhưng số
chương/tiêu đề hiển thị sẽ đổi khác) — chỉ đổi khi thực sự cần.
Chưa có mẫu tiêu đề phù hợp → TOÀN BỘ truyện bị gom vào 1 chương → lag máy và không dịch được. Cách sửa: tự thêm mẫu tiêu đề, hoặc chọn chia theo "Số ký tự".
Số ký tự mỗi chương lý tưởng: dưới 2500 ký tự Hán/Nhật; dưới 4500 ký tự Hàn; dưới 10000 ký tự Latin. Chương vượt mức này thì dễ dịch lỗi / không dịch được → chia lại cho phù hợp.`.trim(),
  });

  // ---------- Đánh dấu / Đọc tiếp ----------
  push({
    title: 'Đánh dấu vị trí đọc & Đọc tiếp',
    summary: 'Nút "Đánh dấu" lưu đúng đoạn đang đọc, "Đọc tiếp" nhảy lại chỗ đó; lưu theo từng truyện.',
    keywords: 'danh dau, doc tiep, bookmark, vi tri dang doc, bo danh dau, luu vi tri',
    text: `
Nút "Đánh dấu" trên thanh công cụ lưu lại đúng đoạn văn đang đọc trong chương hiện tại, để lần
sau mở lại truyện này có thể nhảy thẳng tới đó bằng nút "Đọc tiếp" thay vì phải tìm lại bằng tay.
- Bấm "Đánh dấu" lần nữa ở đúng vị trí đã đánh dấu sẽ đổi thành "Bỏ đánh dấu".
- Trên điện thoại (màn hình hẹp), nút "Đánh dấu" mở ra 2 lựa chọn "Đánh dấu"/"Đọc tiếp" thay vì
  bấm 1 phát đánh dấu ngay như trên máy tính.
- "Đọc tiếp" chỉ hiện/dùng được khi truyện đó đã có vị trí đánh dấu từ trước.
- Vị trí đánh dấu lưu theo từng truyện trên trình duyệt, dựa vào chính nội dung đoạn văn nên
  vẫn tìm lại đúng chỗ được kể cả khi đổi cách chia chương (Tiêu đề ↔ Số ký tự) sau đó.`.trim(),
  });

  // ---------- Phím tắt ----------
  push({
    title: 'Phím tắt điều hướng',
    summary: 'Phím mũi tên trái/phải để chuyển chương (không hoạt động khi đang gõ vào ô nhập).',
    keywords: 'phim tat, keyboard, mui ten, chuyen chuong bang phim, next chapter phim',
    text: `
Khi không đang gõ vào 1 ô nhập nào (ô tìm kiếm, ô Sửa văn bản...), có thể dùng phím mũi tên:
- Mũi tên phải (→): sang chương kế tiếp.
- Mũi tên trái (←): quay lại chương trước.
Nếu con trỏ đang ở trong 1 ô nhập thì phím mũi tên chỉ di chuyển con trỏ chữ như bình thường,
không chuyển chương.`.trim(),
  });
  // ---------- Danh sách preset mặc định ----------
  push({
    title: 'Preset dịch mặc định có sẵn (theo thể loại)',
    summary: '6 preset có sẵn theo thể loại: Huyền huyễn, Khoa huyễn, Đô thị, Fantasy, Light Novel, Ngôn tình; người mới phải tự chọn 1 preset.',
    keywords: 'preset co san, preset mac dinh, huyen huyen, khoa huyen, do thi, fantasy, light novel, ngon tinh, the loai truyen nao, ' +
      'chon the loai, the loai+nao, the loai+preset, tien hiep, kiem hiep, xuyen khong, trong sinh, cung dau, tu chan',
    text: `
App có sẵn các preset (mẫu prompt dịch) theo thể loại để chọn nhanh trong Cài đặt, mỗi preset
là 1 bộ hướng dẫn văn phong/quy tắc dịch riêng phù hợp thể loại đó:
- "Huyền huyễn" — tiên hiệp, huyền huyễn, kiếm hiệp, cổ phong Trung Quốc.
- "Khoa huyễn" — khoa học viễn tưởng, tương lai, vũ trụ, cyberpunk, hậu tận thế, cơ giáp, AI.
- "Đô thị" — truyện Trung Quốc bối cảnh đô thị/hiện đại: hào môn, thương chiến, công sở, đời thường.
- "Fantasy" — Fantasy phương Tây (High/Dark/Epic Fantasy, Sword & Sorcery...).
- "Light Novel" — light novel Nhật/Trung/Hàn: isekai, school life, slice of life, fantasy...
- "Ngôn tình" — ngôn tình Trung Quốc: hiện đại, cổ đại, xuyên không, cung đấu, trọng sinh...
Chọn preset gần nhất với thể loại truyện đang dịch để có văn phong/xưng hô phù hợp nhất; vẫn có
thể tự sửa nội dung prompt của preset hoặc tạo preset riêng nếu cần khác đi.
Người dùng HOÀN TOÀN MỚI (chưa từng vào Cài đặt chọn preset lần nào) thì CHƯA có preset nào
được chọn sẵn — cần tự vào Cài đặt chọn 1 preset phù hợp thể loại trước khi dịch.`.trim(),
  });

  // ---------- FAQ chất lượng bản dịch ----------
  push({
    title: 'Vì sao bản dịch có ký tự lạ / vì sao chương dài không bị cụt giữa chừng',
    summary: 'Ký tự lạ như dấu chấm giữa chữ (g·iết) do nguồn chèn nên app tự làm sạch; chương dài bị cụt được app tự dịch nối tiếp.',
    keywords: 'ky tu la, dau cham giua chu, dau nga la, ban dich loi, chuong dai bi cut, dich dang do, mat cau cuoi chuong, bi ngat giua chung',
    text: `
- Ký tự lạ kiểu dấu chấm giữa chữ (vd "g·iết") hoặc dấu ngã ở cuối âm tiết: đây là chữ nguyên
  bản tiếng Trung/nguồn thường tự chèn thêm ký tự lạ (né bộ lọc kiểm duyệt của nền tảng gốc).
  App đã tự làm sạch các ký tự này trước và trong lúc dịch; nếu người dùng vẫn thấy sót lại, có
  thể báo cho admin qua Facebook kèm ảnh chụp để admin xem thêm trường hợp đó.
- Chương rất dài bị "cụt" giữa chừng khi AI trả lời hết giới hạn token 1 lượt gọi: app TỰ ĐỘNG
  gọi tiếp để bù phần còn thiếu cho tới khi xong cả chương (không cần người dùng tự bấm dịch
  lại), tối đa vài lần bù cho 1 chương. Nếu vẫn thấy bản dịch bị cụt hẳn ở cuối chương, đó là
  trường hợp hiếm, hãy dùng "Dịch lại" cho chương đó.`.trim(),
  });

  // ---------- Chương dịch lỗi / AI từ chối ----------
  // [nguồn: translate.js — xlate()/attemptOnKeyWithModelFallback/callAPIFull (lỗi, thử lại, hết giờ);
  //  index.html — showChapterFailedPopup, showLocationErrPopup]. Cố ý KHÔNG mô tả thứ tự thử key/model
  //  hay tên hàm (giữ ranh giới "không tiết lộ chi tiết kỹ thuật nội bộ" ở CHATBOT_RULES); thời gian chờ
  //  tối đa được nêu vì chính thanh trạng thái của app hiển thị nó cho người dùng.
  push({
    title: 'Chương dịch bị lỗi / AI từ chối dịch / chương bị bỏ qua',
    summary: 'Chương không dịch được (AI từ chối, không trả nội dung, bị chặn vị trí...): app tự thử lại, hết giờ thì bỏ qua và hỏi "Dịch lại"; cách xử lý.',
    keywords: 'tu choi+dich, tu choi+chuong, ai tu choi, ai khong chiu, khong chiu dich, bi chan+dich, bi chan+chuong, ' +
      'bi chan+noi dung, noi dung nhay cam, nhay cam, vi pham+chinh sach, chinh sach noi dung, safety, bi block, ' +
      'dich khong ra, dich mai, dich hoai, dich that bai, dich loi, chuong loi, chuong bi loi, bi bo qua, tam bo qua, ' +
      'sao dich loi, tai sao dich loi, dich hay loi, 503, loi server, bo qua chuong, khong tra ve noi dung, tra ve rong, dich ra rong, chan vi tri, chan location, chan ip, location',
    text: `
Khi 1 chương không dịch được (AI từ chối hoặc không trả về nội dung, bị chặn, hết quota, lỗi mạng...),
app coi đó là dịch lỗi và xử lý như sau:
- Các nguyên nhân thường gặp khi "không dịch được": (1) CHƯA NHẬP API KEY (vào Cài đặt nhập key); (2) API KEY HẾT QUOTA — xem https://aistudio.google.com/rate-limit?timeRange=last-1-day; tài khoản miễn phí thì model Flash thường khoảng 20 request/ngày (RPD), Flash Lite khoảng 500 RPD; hết RPD của key này thì tạo project mới rồi tạo API key khác; (3) FILE LỖI — mở chương xem có đọc được văn bản không; nếu hiện 1 chuỗi ký tự mã hoá thì file gốc bị lỗi ký tự hoặc NovelTools không đọc được file đó → liên hệ admin; (4) LỖI SERVER của model (503) hoặc AI từ chối nhầm — xem các bước bên dưới. Khi lỗi, app chỉ tự hạ xuống model thấp hơn, không thử model cao hơn.
- Tự thử lại: app đổi key/model khác, chờ rồi thử lại, liên tục cho tới khi dịch được hoặc hết thời gian
  chờ của chương (Gemini: khoảng 10 phút cho 1 chương; DeepSeek: không giới hạn thời gian nên có thể chờ
  lâu — bấm "Dừng" nếu muốn thôi). Thanh trạng thái báo app đang thử tới đâu.
- Hết thời gian mà vẫn lỗi: chương đó tạm bị BỎ QUA, hiện bản gốc, và app hiện hộp thoại "Chương N dịch
  lỗi nên tạm bị bỏ qua. Bạn có muốn dịch lại chương này không?" (nút "Dịch lại" / "Huỷ"). Các chương
  khác vẫn tiếp tục dịch bình thường. Muốn thử lại sau: mở chương đó rồi bấm "Dịch".
- Nếu app báo "Bị chặn do vị trí (Location)": Gemini đang chặn IP hiện tại của bạn — đổi VPN/proxy sang
  server khác rồi bấm "Đã đổi IP" để dịch tiếp.
- Nếu lỗi kèm 429/hết quota thì xem mục "Xử lý sự cố thường gặp".
Nếu chỉ MỘT VÀI chương cứ lỗi mãi trong khi các chương khác dịch bình thường, hoặc bản dịch trả về nói rõ AI từ chối dịch / chỉ TÓM TẮT chứ không dịch,
thì có thể do server model quá tải (503) hoặc AI chặn nhầm nội dung. Thử theo THỨ TỰ:
- Trước hết ĐỔI SANG MODEL YẾU HƠN (vd Gemini 3.5 Flash Lite) rồi dịch lại chương đó.
- Nếu bản dịch trả về nói rõ AI từ chối dịch hoặc chỉ tóm tắt chứ không dịch: chọn NGAY Cài đặt → "Chế độ dịch" → "Nhanh, linh hoạt, tiết kiệm"
  (có thể xử lý được một số nội dung AI hay từ chối nhầm, nhưng chất lượng dịch có thể giảm) rồi dịch lại chương đó.
- Đổi sang AI còn lại (Gemini ↔ DeepSeek) trong Cài đặt nếu đã có API key của AI đó.
- Không được thì đọc bản gốc của chương đó và tiếp tục các chương sau.
Về nội dung nhạy cảm: nội dung dịch/tải lên do người dùng tự chịu trách nhiệm (theo Điều khoản dịch vụ);
việc AI từ chối dịch là quyết định của nhà cung cấp AI (Google/DeepSeek) theo chính sách của họ, không
phải của NovelTools.`.trim(),
  });

  // ---------- Bản dịch còn sót chữ Hán / lẫn tiếng Trung ----------
  // [nguồn: translate.js — cjkRatio/CHAPTER_CJK_RATIO_THRESHOLD/MAX_CHAPTER_CJK_RETRY (dịch lại cả chương),
  //  MAX_TITLE_RETRY (dịch lại tên chương); character-memory.js — nhãn "Tên chưa dịch" (xem chatbot.js).]
  push({
    title: 'Bản dịch còn sót chữ Hán / lẫn tiếng Trung',
    summary: 'Bản dịch còn chữ Hán hoặc lẫn tiếng Trung: app tự dịch lại chương/tên chương vài lần; cách tự sửa (Dịch lại, Sửa văn bản, tên nhân vật).',
    keywords: 'chu han, chu trung, ky tu han, han tu, con+tieng trung, con+tieng han, con+han tu, sot+chu, sot+tieng, sot+han, ' +
      'lan+tieng trung, lan+chu han, lan+chu trung, lan ngon ngu, lan lon+ngon ngu, dich khong het, khong dich het, ' +
      'chua dich het, dich thieu, tieu de+han, ten chuong+han, ten chuong+chua dich, chuong+tieng trung, ban goc+tieng trung',
    text: `
Đôi khi AI để sót tên riêng, thuật ngữ hoặc cả câu tiếng Trung nguyên bản trong bản dịch. App tự xử lý 1 phần:
- Bản dịch cả chương còn sót NHIỀU chữ Hán: app tự dịch lại nguyên chương (tối đa 2 lần). Nếu sau đó vẫn
  còn thì giữ kết quả cuối cùng — nên đôi khi vẫn thấy vài chữ Hán.
- Tên chương còn chữ Hán: app tự dịch lại tên chương vài lần (tối đa 3 lần cho mỗi tên); vẫn còn thì thôi.
Bạn có thể tự sửa:
- Chương đã dịch nhưng còn nhiều chữ Hán: bấm "Dịch lại chương này" (nút hiện khi chương đã có bản dịch).
  Có thể thử thêm "Chế độ dịch" → "Nghĩ kỹ" trong Cài đặt (AI suy luận kỹ hơn, có thể chậm hơn).
- Chỉ sót vài từ/tên: dùng "Sửa văn bản" — dán đúng cụm chữ Hán vào ô "Từ khoá", gõ tiếng Việt vào ô
  "Thay bằng". Áp dụng ngay, không cần dịch lại (cũng có hiệu lực khi tải TXT/EPUB và khi nghe).
- Sót ở tên nhân vật: trong "Bộ nhớ nhân vật", nhân vật có nhãn "Tên chưa dịch" thì bấm "Chỉnh sửa" để tự
  gõ tên tiếng Việt.
- Nếu bạn đang xem BẢN GỐC của chương chưa dịch thì tất nhiên là tiếng Trung: bấm "Dịch" (hoặc bật "Tự động
  dịch"); nút "Xem bản gốc"/"Xem bản dịch" trong menu "Thêm" dùng để chuyển qua lại.
- Ký tự lạ kiểu dấu chấm giữa chữ (g·iết) là chuyện khác — xem mục "Vì sao bản dịch có ký tự lạ".`.trim(),
  });
})();
