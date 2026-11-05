// ===================================================================
// ===== CHARACTER MEMORY (Ghi nhớ quan hệ nhân vật) =====
// ===================================================================
// KIẾN TRÚC: gọi ĐÚNG 1 LẦN model CHAR_MODEL_A để trích xuất toàn bộ chương, rồi 1 lượt "Kiểm tra lại thông tin"
// (recheckExtractedCharacters, cũng model A, chỉ đọc kết quả trích xuất, không gửi lại văn bản chương).
// Bước "giám khảo tên" (judgeNamingBatch) và "xác minh xưng hô" (verifyFlaggedCharacters) ĐÃ BỎ khỏi luồng —
// 2 hàm vẫn còn trong file nhưng không còn nơi nào gọi (judge bị chặn bởi getNameJudgeOn()=false).
// CHAR_MODEL_B là MODEL DỰ PHÒNG của Luồng 1 khi A lỗi/timeout (và còn chỗ), đồng thời là model chính của Luồng 3
// (sót dịch / âm tiết nghi lỗi / chính tả / xưng hô).
const CHAR_MODEL_A='gemini-3.1-flash-lite';
const CHAR_MODEL_B='gemini-3.5-flash-lite';
const CHAR_ANALYSIS_TIMEOUT_MS=30000;
const CHARMEM_MAX_VERIFY_PER_CALL=8; // trần số nhân vật gửi verify mỗi chương (xem analyzeChapterCharacters)
// Nhóm sắc thái thân mật/kính trọng của 1 cặp xưng hô — dùng để so sánh addrTone mới trích xuất với
// addrTone ĐÃ LƯU của nhân vật có THỰC SỰ lệch hẳn nhóm hay không (VD "muội"/"em" cùng nhóm "Thân
// mật" -> không phải lệch, không cần flag nghi vấn; "muội" vs "ngươi" -> khác nhóm rõ ràng -> mới
// đáng nghi, xem detectAddrSuspicion).
const CHARMEM_ADDR_TONES=['Suồng sã','Thân mật','Trung tính','Kính trọng','Xa cách/Thù địch'];
// Bảng GỢI Ý (không phải bắt buộc) các cặp "tự xưng/gọi đối phương", tiêu biểu cho từng nhóm sắc thái
// ở trên — dùng làm "đường thoát" cho model dịch chính khi: (1) xưng hô cụ thể đã lưu của 1 nhân vật
// không khớp giọng văn của đúng câu đang dịch (VD câu bộc phát/mỉa mai khác hẳn giọng thường ngày),
// hoặc (2) 2 nhân vật PHỤ (không ai là MC) thoại trực tiếp với nhau mà bộ nhớ chưa có xưng hô cụ thể
// cho cặp này (kiến trúc hiện tại chỉ lưu addrThemToMc/addrMcToThem theo trục MC — xem
// hasPeerAddrContext). MỖI nhóm sắc thái tách RIÊNG 2 hệ — "co_trang" (cổ trang/tu tiên/kiếm hiệp,
// huyết thống-môn phái) và "hien_dai" (đô thị/hiện đại) — thay vì gộp chung 1 mảng như trước: gộp
// chung khiến model dịch/trích xuất coi 2 hệ là lựa chọn NGANG NHAU không ràng buộc gì, nên dù truyện
// đã xác định rõ là huyền huyễn/tu tiên vẫn có thể tự "câu" nhầm sang xưng hô hiện đại (VD "tôi/cô")
// chỉ vì nó cũng nằm trong bảng gợi ý. Dùng addrToneExamplesForSystem() để lấy đúng hệ khớp với thể
// loại đã xác định (qua detectAddrGenreSystem), KHÔNG truy cập object này trực tiếp ở nơi khác.
const CHARMEM_ADDR_TONE_EXAMPLES={
  'Suồng sã':{co_trang:['ta/mi','ngươi/ta (mỉa mai)'],hien_dai:['tao/mày','tôi/ông (mỉa mai)'],tay_au:['tao/mày','tôi/ông (mỉa mai)']},
  'Thân mật':{co_trang:['huynh/muội','huynh/đệ','ca/muội','tỷ/muội'],hien_dai:['anh/em','cậu/tớ'],tay_au:['anh/em','chị/em','cậu/tớ']},
  'Trung tính':{co_trang:['ta/ngươi','ta/huynh'],hien_dai:['tôi/cậu','tôi/anh','tôi/chị'],tay_au:['tôi/cậu','tôi/anh','tôi/cô']},
  'Kính trọng':{co_trang:['ta/ngài','tại hạ/các hạ','vãn bối/tiền bối'],hien_dai:['tôi/ngài'],tay_au:['tôi/ngài','thần/bệ hạ']},
  'Xa cách/Thù địch':{co_trang:['ta/ngươi','bổn tọa/ngươi','ta/tên đó'],hien_dai:['tôi/anh ta','tôi/cô ta'],tay_au:['ta/ngươi','tôi/hắn','ta/tên đó']}
};
// Từ khoá nhận diện HỆ xưng hô từ promptGuidance đã "chưng cất" (getMainPromptGuidance) — CHỈ dùng
// để LỌC ví dụ minh hoạ ở CHARMEM_ADDR_TONE_EXAMPLES cho gọn/đúng trọng tâm, KHÔNG dùng để ép buộc
// quyết định xưng hô thật của model (việc đó model vẫn tự đọc văn bản/promptGuidance như cũ). So sánh
// không dấu (stripVnDiacritics) để bắt cả biến thể gõ thiếu dấu.
const CHARMEM_GENRE_COTRANG_KEYWORDS=['tu tien','huyen huyen','co trang','kiem hiep','tien hiep','cung dau','giang ho','tong mon','mon phai'];
const CHARMEM_GENRE_HIENDAI_KEYWORDS=['do thi','hien dai','khoa huyen','cong so','hoc duong'];
// Preset thể loại của truyện đang dịch (addr-presets.js): người dùng chọn tay trong popup "Xưng hô thường gặp"
// > tự nhận diện từ chỉ dẫn đã chưng cất > null. Không có addr-presets.js thì luôn trả null (hành vi cũ).
function getAddrPreset(promptGuidance){
  try{
    if(typeof AddrPresets==='undefined')return null;
    return AddrPresets.resolve(promptGuidance,(typeof S!=='undefined'&&S&&S.fname)||'__noname__');
  }catch(e){return null;}
}
function detectAddrGenreSystem(promptGuidance){
  // Có preset -> hệ của preset ('co_trang'|'hien_dai'|'tay_au'; preset lai như Dân quốc -> null = không ép hệ).
  // Nhờ vậy Fantasy/Trung cổ/Cổ điển phương Tây/Light novel không còn bị coi là "chưa xác định".
  const _preset=getAddrPreset(promptGuidance);
  if(_preset)return AddrPresets.systemOf(_preset);
  const t=stripVnDiacritics((promptGuidance||'').toLowerCase());
  if(!t)return null;
  const hasCoTrang=CHARMEM_GENRE_COTRANG_KEYWORDS.some(k=>t.includes(k));
  const hasHienDai=CHARMEM_GENRE_HIENDAI_KEYWORDS.some(k=>t.includes(k));
  // Chỉ kết luận khi CHỈ 1 hệ được nhắc tới — nếu cả 2 cùng xuất hiện (VD truyện xuyên không 2 thế
  // giới) hoặc không nhắc hệ nào rõ ràng, trả về null để addrToneExamplesForSystem gộp cả 2 hệ như cũ,
  // để ngỏ cho model tự chọn đúng theo TỪNG bối cảnh cụ thể trong chương.
  if(hasCoTrang&&!hasHienDai)return'co_trang';
  if(hasHienDai&&!hasCoTrang)return'hien_dai';
  return null;
}
// Lấy danh sách ví dụ minh hoạ đúng HỆ (system: 'co_trang'|'hien_dai'|null) cho 1 nhóm sắc thái —
// system=null (chưa xác định được thể loại) sẽ gộp CẢ 2 hệ như hành vi cũ, còn có system cụ thể thì
// CHỈ trả về đúng hệ đó, tránh đưa ví dụ trái thể loại vào prompt làm model bị "câu" nhầm hệ.
function addrToneExamplesForSystem(tone,system){
  const g=CHARMEM_ADDR_TONE_EXAMPLES[tone];
  if(!g)return [];
  if(system==='co_trang')return g.co_trang||[];
  if(system==='hien_dai')return g.hien_dai||[];
  if(system==='tay_au')return g.tay_au||[];
  return [...(g.co_trang||[]),...(g.hien_dai||[])];
}
// Bỏ dấu tiếng Việt (Tống -> Tong) để ô tìm kiếm nhân vật chấp nhận gõ không dấu — chỉ dùng cho SO
// SÁNH khi lọc danh sách, KHÔNG đụng tới giá trị "name" thật lưu trong dữ liệu.
function stripVnDiacritics(s){
  return (s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D');
}

// ===================================================================
// ===== CHUẨN HOÁ "ĐỘ TUỔI" (statusCue) + "MỐI QUAN HỆ" (relationship) — BEGIN =====
// ===================================================================
// MỤC ĐÍCH: AI không được tự điền tự do 2 field này nữa mà phải CHỌN trong danh sách chuẩn bên dưới. Danh sách phục vụ
// XƯNG HÔ/DỊCH nên chỉ phân loại theo VAI VẾ (trên/ngang/dưới) + THÂN SƠ + LOẠI QUAN HỆ, KHÔNG ghi chức vị (lão tổ, trưởng
// lão, bang chủ... đều quy về nhóm vai vế). Danh sách trung tính với thể loại/ngôn ngữ: từ xưng hô cụ thể do preset thể
// loại (AddrPresets) quyết định, không nằm ở đây.
// - relationship = vai của CHÍNH nhân vật so với nhân vật chính (người này là "Học trò" của MC...).
// - statusCue    = CHỈ 1 nhóm tuổi chuẩn (AI KHÔNG ghi số tuổi cụ thể; nếu AI vẫn trả số/dải tuổi thì normalizeAgeValue quy về nhóm theo CHARMEM_AGE_BANDS).
// 3 lớp bảo vệ: (1) prompt bắt chọn trong danh sách; (2) normalize*Value() ép giá trị AI trả về về đúng danh sách (từ cũ/biến thể
// được ánh xạ qua bảng bên dưới, không ánh xạ được thì coi là "Chưa rõ" -> không ghi đè dữ liệu đang có); (3) dữ liệu CŨ được
// chuyển sang danh sách chuẩn khi tải (migrateStandardRelAge) — chỉ với field AI tự quản lý, KHÔNG đụng giá trị người dùng đã tự gõ,
// và giá trị cũ không ánh xạ được thì để nguyên (không mất dữ liệu).
// Mỗi giá trị chuẩn có 1 MÃ trung tính (code, ổn định, không phụ thuộc ngôn ngữ) + nhãn theo ngôn ngữ giao diện (vi/en).
// Giá trị LƯU trong dữ liệu vẫn là nhãn tiếng Việt chuẩn (để mọi chỗ khác trong file không đổi); nhãn hiển thị tra qua charmemStdLabel().
// Thêm ngôn ngữ giao diện mới = thêm 1 cột nhãn ở 2 bảng dưới + 1 dòng trong charmemSetUiLang; không đụng logic.
const CHARMEM_STD_UNKNOWN={vi:'Chưa rõ',en:'Unknown'};
const CHARMEM_STD_PROTAG={vi:'Nhân vật chính',en:'Protagonist'};
const CHARMEM_REL_GROUP_LABELS={
  family:{vi:'Gia đình',en:'Family'},romance:{vi:'Tình cảm',en:'Romantic'},teaching:{vi:'Truyền dạy',en:'Teaching'},
  generation:{vi:'Thế hệ ngoài gia đình',en:'Generations (non-family)'},rank:{vi:'Địa vị',en:'Rank / status'},
  peers:{vi:'Ngang hàng',en:'Peers'},opposed:{vi:'Đối lập',en:'Opposed'},other:{vi:'Khác',en:'Other'}
};
const CHARMEM_REL_ITEMS=[   // [mã, nhóm, nhãn vi (= giá trị lưu), nhãn en]
  ['father','family','Cha','Father'],['mother','family','Mẹ','Mother'],['grandfather','family','Ông','Grandfather'],['grandmother','family','Bà','Grandmother'],
  ['child','family','Con','Child'],['grandchild','family','Cháu','Grandchild / Nephew / Niece'],
  ['brother_elder','family','Anh','Older brother'],['sister_elder','family','Chị','Older sister'],['sibling_younger','family','Em','Younger sibling'],
  ['uncle_bac','family','Bác','Bác (parent\'s elder sibling)'],['uncle_chu','family','Chú','Chú (father\'s younger brother)'],['aunt_co','family','Cô','Cô (father\'s sister)'],
  ['aunt_di','family','Dì','Dì (mother\'s sister)'],['uncle_cau','family','Cậu','Cậu (mother\'s brother)'],['aunt_mo','family','Mợ','Mợ (wife of mother\'s brother)'],
  ['wife','romance','Vợ','Wife'],['husband','romance','Chồng','Husband'],['lover','romance','Người yêu','Lover'],
  ['teacher','teaching','Thầy giáo','Teacher / Mentor'],['student','teaching','Học trò','Student / Disciple'],
  ['senior_figure','generation','Tiền bối','Elder / Senior figure'],['senior_peer_m','generation','Đàn anh','Senior brother (same school/group)'],
  ['senior_peer_f','generation','Đàn chị','Senior sister (same school/group)'],['junior_peer','generation','Đàn em','Junior (same school/group)'],
  ['junior_gen','generation','Hậu bối','Younger generation'],
  ['superior','rank','Cấp trên','Superior'],['subordinate','rank','Cấp dưới','Subordinate'],
  ['master','rank','Chủ nhân','Master / Lord'],['servant','rank','Người hầu','Servant / Attendant'],
  ['friend','peers','Bạn bè','Friend'],['acquaintance','peers','Người quen','Acquaintance'],
  ['enemy','opposed','Kẻ thù','Enemy'],['rival','opposed','Đối thủ','Rival'],
  ['stranger','other','Người lạ','Stranger']
];
// Dạng [tên nhóm vi, [nhãn vi...]] như cũ — các chỗ khác (prompt, bộ chọn) dùng nguyên.
const CHARMEM_REL_GROUPS=(()=>{const order=[],m={};CHARMEM_REL_ITEMS.forEach(it=>{if(!m[it[1]]){m[it[1]]=[CHARMEM_REL_GROUP_LABELS[it[1]].vi,[]];order.push(it[1]);}m[it[1]][1].push(it[2]);});return order.map(k=>m[k]);})();
const CHARMEM_REL_STANDARD=[].concat(...CHARMEM_REL_GROUPS.map(g=>g[1]));
// ĐỘ THIỆN CẢM (affinity) giữa nhân vật và NHÂN VẬT CHÍNH: tình cảm thật, ĐỘC LẬP với loại quan hệ (cha con vẫn có thể "Xa cách") và khác addrTone
// (addrTone = nhóm sắc thái của cặp từ xưng hô). Dùng để chọn cặp xưng hô tự nhiên (bạn bè xa cách "tôi/anh" vs bạn bè gần gũi "tớ/cậu").
const CHARMEM_AFFINITY_ITEMS=[   // [mã, nhóm, nhãn vi (= giá trị lưu), nhãn en]
  ['close','affinity','Thân thiết','Close'],['friendly','affinity','Thân thiện','Friendly'],['neutral','affinity','Bình thường','Neutral'],
  ['distant','affinity','Xa cách','Distant'],['hostile','affinity','Thù địch','Hostile']
];
const CHARMEM_AFFINITY_GROUPS=[['',CHARMEM_AFFINITY_ITEMS.map(x=>x[2])]];
// Nhóm tuổi chuẩn: thứ tự từ nhỏ đến lớn (chỉ số trong mảng = "bậc" tuổi, dùng chung cho mọi hàm so sánh tuổi).
const CHARMEM_AGE_BANDS=[
  {code:'infant',label:'Trẻ sơ sinh',en:'Infant',min:0,max:3},
  {code:'young_child',label:'Trẻ nhỏ',en:'Young child',min:4,max:10},
  {code:'early_teen',label:'Thiếu niên',en:'Early teen',min:11,max:15},
  {code:'late_teen',label:'Thiếu niên lớn',en:'Late teen',min:16,max:18},
  {code:'young_adult',label:'Thanh niên',en:'Young adult',min:19,max:30},
  {code:'adult',label:'Trưởng thành',en:'Adult',min:31,max:45},
  {code:'middle_aged',label:'Trung niên',en:'Middle-aged',min:46,max:59},
  {code:'elder',label:'Cao niên',en:'Elderly',min:60,max:130}
];

// Nhãn quan hệ -> kiểu cạnh (CHARMEM_REL_TYPES) + vai của NGƯỜI MANG NHÃN. Giá trị không có ở đây ("Cháu") = không tạo cạnh.
const CHARMEM_REL_STD_EDGE={
  'Cha':['parent_child','a'],'Mẹ':['parent_child','a'],'Con':['parent_child','b'],
  'Ông':['grandparent','a'],'Bà':['grandparent','a'],
  // 'Cháu' KHÔNG tạo cạnh: nhãn này gộp cháu nội/ngoại với cháu họ/cháu ruột (cô-dì-chú-bác -> cháu); cạnh "Ông bà – cháu" sẽ làm xưng hô ông/cháu sai cho cháu họ.
  'Anh':['sibling','a'],'Chị':['sibling','a'],'Em':['sibling','b'],
  'Vợ':['spouse','a'],'Chồng':['spouse','a'],'Người yêu':['lover','a'],
  'Thầy giáo':['master_disciple','a'],'Học trò':['master_disciple','b'],
  'Tiền bối':['senior_junior','a'],'Đàn anh':['senior_junior','a'],'Đàn chị':['senior_junior','a'],
  'Đàn em':['senior_junior','b'],'Hậu bối':['senior_junior','b'],
  'Cấp trên':['superior_subordinate','a'],'Cấp dưới':['superior_subordinate','b'],
  'Chủ nhân':['lord_servant','a'],'Người hầu':['lord_servant','b'],
  'Bạn bè':['friend','a'],
  'Người quen':['acquaintance','a'],'Người lạ':['acquaintance','a'],
  'Kẻ thù':['enemy','a'],'Đối thủ':['enemy','a']
};
// Từ/cụm CŨ (AI hay ghi, hoặc dữ liệu đã lưu) -> giá trị chuẩn. Khớp NGUYÊN CỤM (không phân biệt hoa/thường).
const CHARMEM_REL_LEGACY={
  'Cha':'cha|bố|ba|cha ruột|bố ruột|phụ thân|thân phụ|cha nuôi|bố nuôi|cha dượng|cha đẻ|nghĩa phụ|phụ vương|phụ hoàng|nhạc phụ|bố vợ|cha vợ|ba vợ|bố chồng|cha chồng|ba chồng',
  'Mẹ':'mẹ|má|mẹ ruột|mẫu thân|thân mẫu|mẹ nuôi|mẹ kế|mẹ đẻ|nghĩa mẫu|mẫu hậu|mẫu phi|nhạc mẫu|mẹ vợ|má vợ|mẹ chồng|má chồng',
  'Ông':'ông nội|ông ngoại|gia gia|tổ phụ|ông cố|cụ ông|ngoại tổ phụ',
  'Bà':'bà nội|bà ngoại|nãi nãi|tổ mẫu|bà cố|cụ bà|ngoại tổ mẫu',
  'Con':'con|con trai|con gái|con ruột|con trai ruột|con gái ruột|nhi tử|nữ nhi|con nuôi|con riêng|nghĩa tử|nghĩa nữ|con đẻ|con trai nuôi|con gái nuôi|ái nữ|ái tử|con dâu|con rể',
  'Cháu':'cháu|cháu nội|cháu ngoại|cháu đích tôn|tôn tử|tôn nhi|tôn nữ|cháu nội trai|cháu nội gái|cháu ngoại trai|cháu ngoại gái|ngoại tôn|đích tôn|cháu trai|cháu gái|cháu ruột|điệt nhi|điệt nữ|điệt tử|điệt|cháu họ|cháu dâu|cháu rể',
  'Anh':'anh trai|anh ruột|anh cả|ca ca|huynh trưởng|anh|anh hai|anh trai ruột|anh trai cả|a ca|anh họ|biểu ca|đường huynh|anh rể|anh vợ|anh chồng',
  'Chị':'chị gái|chị ruột|chị cả|tỷ tỷ|chị|chị hai|chị gái ruột|a tỷ|chị họ|biểu tỷ|đường tỷ|chị dâu|chị vợ|chị chồng',
  'Bác':'bác|bác ruột|bá phụ|bá bá|bá mẫu|bác trai|bác gái',
  'Chú':'chú|chú ruột|thúc thúc|thúc phụ|chú ba|chú hai|chú út',
  'Cô':'cô|cô ruột|cô cô|cô mẫu|cô út',
  'Dì':'dì|dì ruột|di di|dì dì|dì út|di mẫu',
  'Cậu':'cậu|cậu ruột|cữu cữu|cậu út|cữu phụ',
  'Mợ':'mợ|cữu mẫu|mợ ba|mợ hai',
  'Em':'em trai|em gái|em ruột|em út|em trai ruột|em gái ruột|đệ đệ|muội muội|em|em trai út|em gái út|tiểu muội|em họ|biểu muội|biểu đệ|đường đệ|đường muội|em rể|em dâu|em vợ|em chồng',
  'Vợ':'vợ|hôn thê|vợ chưa cưới|thê tử|vợ lẽ|phu nhân|vợ cả|tiểu thiếp|nương tử|lão bà|vị hôn thê|thiếp',
  'Chồng':'chồng|hôn phu|chồng chưa cưới|phu quân|lão công|vị hôn phu',
  'Người yêu':'người yêu|bạn gái|bạn trai|tình nhân|người thương|người trong lòng|người tình|crush|người mình thích|tình lang|ý trung nhân',
  'Thầy giáo':'sư phụ|sư tôn|thầy|thầy giáo|cô giáo|giáo viên|giáo viên chủ nhiệm|giáo sư|người thầy|thầy dạy|sư phó|người dạy|giảng viên|huấn luyện viên|lão sư|thầy cô|gia sư',
  'Học trò':'đệ tử|đồ đệ|học trò|học sinh|sinh viên|môn đồ|đồ nhi|đệ tử ruột|đệ tử nội môn|đệ tử ngoại môn|đệ tử chân truyền|đệ tử thân truyền|đệ tử đích truyền|học viên|học trò cưng|học trò ruột',
  'Tiền bối':'tiền bối|trưởng bối|trưởng lão|sư bá|sư thúc|sư tổ|lão tổ|tổ sư|lão tổ tông|cao nhân|sư bá tổ|sư nương|bô lão|lão giả|lão nhân|sư thúc tổ|thái thượng trưởng lão|tộc lão|lão thái quân|lão phu nhân|lão thái thái|bề trên|người bề trên|bậc trên',
  'Đàn anh':'sư huynh|sư ca|đàn anh|đại sư huynh|nhị sư huynh|tam sư huynh|sư huynh đồng môn|học trưởng|anh khóa trên|anh khoá trên',
  'Đàn chị':'sư tỷ|đàn chị|đại sư tỷ|nhị sư tỷ|sư tỷ đồng môn|học tỷ|chị khóa trên|chị khoá trên',
  'Đàn em':'sư đệ|sư muội|đàn em|tiểu sư đệ|tiểu sư muội|sư đệ đồng môn|sư muội đồng môn|học đệ|học muội|khóa dưới|khoá dưới|em khóa dưới',
  'Hậu bối':'hậu bối|vãn bối|tiểu bối|hậu sinh|người trẻ tuổi hơn|thế hệ sau',
  'Cấp trên':'cấp trên|sếp|giám đốc|tổng giám đốc|chủ tịch|trưởng phòng|quản lý|lãnh đạo|thượng cấp|thủ lĩnh|đội trưởng|hội trưởng|minh chủ|bang chủ|giáo chủ|chưởng môn|tộc trưởng|hoàng đế|vua|quốc vương|bệ hạ|hoàng thượng|nữ hoàng|nữ vương|đức vua|đế vương|tông chủ|môn chủ|trại chủ|thành chủ|chỉ huy|thủ trưởng|cấp trên trực tiếp|quân vương|hoàng hậu|tướng quân|nguyên soái|chủ soái',
  'Cấp dưới':'cấp dưới|thuộc hạ|nhân viên|thủ hạ|thuộc cấp|thư ký|trợ lý|binh sĩ|hộ vệ|thị vệ|bề tôi|thần tử|thần dân|đại thần|quần thần|tướng sĩ|binh lính|lính|tâm phúc|cận vệ|ám vệ|tùy viên|phó tướng|vệ binh|quan viên|quan lại|thần',
  'Chủ nhân':'chủ nhân|chủ|ông chủ|bà chủ|chủ tử|chủ nhân cũ|chủ nhân mới',
  'Người hầu':'người hầu|hầu gái|quản gia|nô bộc|nô tài|nô tỳ|nô tì|nha hoàn|thị nữ|hạ nhân|tùy tùng|nô lệ|thị đồng|tiểu đồng|tớ|người giúp việc|hầu cận|gia nô|tỳ nữ|thị tỳ|gia đinh|người làm|bảo mẫu|vú nuôi|nữ hầu|nam hầu|người ở|tôi tớ|đầy tớ',
  'Bạn bè':'bạn bè|bạn thân|tri kỷ|bạn tốt|thanh mai trúc mã|bạn từ nhỏ|bạn thuở nhỏ|bạn thời thơ ấu|anh em kết nghĩa|kết nghĩa|kết nghĩa huynh đệ|bạn thân thiết|bạn chí cốt|chí hữu|bạn nối khố|huynh đệ|anh em tốt|bạn thân nhất|tri âm|bạn|bạn cũ|đồng đội|chiến hữu|bằng hữu|đạo hữu|bạn đồng hành|đồng hành|đồng minh|người đồng hành|cộng sự|bạn đồng minh|đồng chí|bạn mới|bạn hữu|bạn đồng môn|bạn học|bạn cùng lớp|bạn cùng phòng|bạn cùng bàn|bạn đồng học|đồng học|bạn cùng trường|bạn cùng khóa|bạn cùng khoá|đồng bối|đồng môn|đồng lứa|cùng lứa|ngang hàng|đồng hàng|ngang vai|cùng thế hệ|sư huynh đệ|sư huynh muội|sư tỷ muội|huynh đệ đồng môn|đồng môn huynh đệ',
  'Người quen':'người quen|hàng xóm|đối tác|khách hàng|khách|bạn gái cũ|bạn trai cũ|người yêu cũ|vợ cũ|chồng cũ|người quen cũ|chủ quán|chủ tiệm|chủ cửa hàng|bạn của gia đình|người quen của gia đình|quen biết|chủ nhà|chủ trọ|thương nhân|đồng nghiệp|đồng liêu|bạn cùng công ty|đồng sự',
  'Kẻ thù':'kẻ thù|kẻ địch|tử thù|cừu nhân|địch nhân|đối địch|kẻ đối đầu|kẻ thù không đội trời chung|phản diện|thù địch|kẻ thù truyền kiếp|cừu địch|kẻ thù chính|đại địch|địch thủ',
  'Đối thủ':'đối thủ|đối thủ cạnh tranh|tình địch|kình địch|đối thủ một mất một còn|người cạnh tranh|đối thủ truyền kiếp',
  'Người lạ':'người lạ|người xa lạ|người qua đường|người dưng|khách qua đường|kẻ lạ mặt|người không quen|người xa lạ mặt|người mới gặp|lạ mặt|người lạ mặt'
};
// Dự phòng cho biến thể có tiền tố/hậu tố ("đại sư huynh", "sư huynh đồng môn", "mẹ nuôi"...). CHỈ neo ở đầu chuỗi + tối đa vài từ phụ,
// để KHÔNG bắt nhầm chức nghiệp ("thầy thuốc", "con buôn"...).
const CHARMEM_REL_FALLBACK=[
  [/^(?:(?:đại|nhị|tam|tứ|ngũ|lục|thất|bát|cửu|thập|tiểu)\s+)?(?:sư huynh|sư ca)(?:\s+\S+){0,3}$/,'Đàn anh'],
  [/^(?:(?:đại|nhị|tam|tứ|ngũ|lục|thất|bát|cửu|thập|tiểu)\s+)?sư tỷ(?:\s+\S+){0,3}$/,'Đàn chị'],
  [/^(?:(?:đại|nhị|tam|tứ|ngũ|lục|thất|bát|cửu|thập|tiểu)\s+)?(?:sư đệ|sư muội)(?:\s+\S+){0,3}$/,'Đàn em'],
  [/^(?:sư phụ|sư tôn|sư phó)(?:\s+\S+){0,3}$/,'Thầy giáo'],
  [/^(?:đệ tử|đồ đệ|học trò|đồ nhi)(?:\s+\S+){0,3}$/,'Học trò'],
  [/^(?:cha|bố|ba)\s+(?:ruột|nuôi|kế|đẻ|ghẻ)$/,'Cha'],
  [/^(?:mẹ|má)\s+(?:ruột|nuôi|kế|đẻ|ghẻ)$/,'Mẹ'],
  [/^con\s+(?:trai|gái|ruột|nuôi|đẻ|riêng)(?:\s+(?:ruột|nuôi|út|cả))?$/,'Con'],
  [/^anh\s+(?:trai|ruột|cả|hai|ba)(?:\s+\S+)?$/,'Anh'],
  [/^chị\s+(?:gái|ruột|cả|hai|ba)(?:\s+\S+)?$/,'Chị'],
  [/^em\s+(?:trai|gái|ruột|út)(?:\s+\S+)?$/,'Em']
];
// Từ chỉ nhóm tuổi (so khớp trên chuỗi đã BỎ DẤU, chữ thường) -> nhóm chuẩn. Thứ tự = thứ tự ưu tiên khi chuỗi có nhiều nhóm.
const CHARMEM_AGE_WORD_RULES=[
  ['Trẻ sơ sinh',/so sinh|moi sinh|\bbaby\b|em be\b/],
  ['Trẻ nhỏ',/tre em|tre con|tre nho|nhi dong|thieu nhi|au nhi|hai tu|dua tre|dua be|be gai|be trai|tieu hai|mau giao|tieu hoc|nhi nu/],
  ['Thiếu niên lớn',/cap 3|cap ba|trung hoc pho thong|thpt|lop 1[0-2]\b|thieu nien lon/],
  ['Thiếu niên',/thieu nien|thieu nu|thanh thieu|vi thanh nien|day thi|tuoi teen|\bteen|cap 2|cap hai|trung hoc co so|hoc sinh/],
  ['Cao niên',/cao nien|lao nien|nguoi gia|cao tuoi|tuoi gia|\blao (?:nhan|ong|ba|gia)\b|\b(?:ong|ba|bo) lao\b|bac dau|gia ca|^lao$|^gia$/],
  ['Trung niên',/trung nien|trung tuoi|trang nien/],
  ['Trưởng thành',/truong thanh|thieu phu|nguoi lon/],
  ['Thanh niên',/thanh nien|thanh nu|thanh xuan|tre tuoi|doi muoi|thieu hiep|sinh vien|co gai tre|chang trai tre|con gai tre|nien thieu|thanh tu/]
];
let CHARMEM_UI_LANG='vi';
function charmemSetUiLang(l){CHARMEM_UI_LANG=(l==='en')?'en':'vi';_stdLblMaps=null;}
function charmemUiLang(){return CHARMEM_UI_LANG;}
// Chuỗi giao diện song ngữ dựng trong code (banner/thẻ). Chuỗi tĩnh khác vẫn do bộ dịch DOM của app lo; chuỗi có chèn dữ liệu thì phải chọn tại đây.
function _cmL(vi,en){return CHARMEM_UI_LANG==='en'?en:vi;}
// Đích dịch ≠ tiếng Việt: phân tích nhân vật theo kiểu CHUNG (prompt tiếng Anh gọn, không Hán Việt/xưng hô/chưa dịch chữ Hán).
// Đích = vi: luôn false → mọi đường tiếng Việt chạy y như cũ.
function charmemGeneric(){try{return !!(window.TargetLang&&!TargetLang.isVi());}catch(e){return false;}}
let _stdLblMaps=null;
// Tra 1 giá trị (mã / nhãn vi / nhãn en, không phân biệt hoa thường) -> {code,vi,en}. kind: 'rel' | 'age'.
function _stdLblMap(kind){
  if(!_stdLblMaps){
    const rel=new Map(),age=new Map(),aff=new Map();
    CHARMEM_AFFINITY_ITEMS.forEach(([code,g,vi,en])=>{const it={code,vi,en};[code,vi,en].forEach(x=>{const k=_stdKey(x);if(!aff.has(k))aff.set(k,it);});});
    CHARMEM_REL_ITEMS.forEach(([code,g,vi,en])=>{const it={code,vi,en};[code,vi,en].forEach(x=>{const k=_stdKey(x);if(!rel.has(k))rel.set(k,it);});});
    CHARMEM_AGE_BANDS.forEach(b=>{const it={code:b.code,vi:b.label,en:b.en};[b.code,b.label,b.en].forEach(x=>{const k=_stdKey(x);if(!age.has(k))age.set(k,it);});});
    _stdLblMaps={rel,age,aff};
  }
  return _stdLblMaps[kind];
}
// Mã trung tính của 1 giá trị chuẩn ('' nếu không phải giá trị chuẩn).
function charmemStdCode(kind,v){const it=_stdLblMap(kind).get(_stdKey(v));return it?it.code:'';}
// Nhãn HIỂN THỊ theo ngôn ngữ giao diện. Giá trị tự gõ (không thuộc danh sách chuẩn) trả nguyên.
function charmemStdLabel(kind,v,lang){
  const L=lang||CHARMEM_UI_LANG;
  const raw=String(v==null?'':v).normalize('NFC').trim();
  if(!raw)return raw;
  const it=_stdLblMap(kind).get(_stdKey(raw));
  if(it)return it[L]||it.vi;
  if(raw===CHARMEM_STD_UNKNOWN.vi)return CHARMEM_STD_UNKNOWN[L]||raw;
  if(raw===CHARMEM_STD_PROTAG.vi)return CHARMEM_STD_PROTAG[L]||raw;
  return raw;
}
// Ngược lại: giá trị người dùng nhập/chọn (bất kỳ ngôn ngữ nào) -> giá trị LƯU (nhãn vi chuẩn). Không thuộc danh sách thì trả nguyên.
function charmemStdCanon(kind,raw){
  const s=String(raw==null?'':raw).normalize('NFC').trim();
  if(!s)return s;
  const k=_stdKey(s),it=_stdLblMap(kind).get(k);
  if(it)return it.vi;
  if(k===_stdKey(CHARMEM_STD_UNKNOWN.vi)||k===_stdKey(CHARMEM_STD_UNKNOWN.en))return CHARMEM_STD_UNKNOWN.vi;
  if(k===_stdKey(CHARMEM_STD_PROTAG.vi)||k===_stdKey(CHARMEM_STD_PROTAG.en))return CHARMEM_STD_PROTAG.vi;
  return s;
}
function _stdKey(s){return String(s==null?'':s).normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();}
function _stdStrip(s){return _stdKey(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');}
let _relStdMap=null;
function _relStdLookupMap(){
  if(_relStdMap)return _relStdMap;
  const m=new Map();
  CHARMEM_REL_STANDARD.forEach(v=>m.set(_stdKey(v),v));
  Object.keys(CHARMEM_REL_LEGACY).forEach(std=>CHARMEM_REL_LEGACY[std].split('|').forEach(w=>{
    const k=_stdKey(w);
    if(k&&!m.has(k))m.set(k,std);          // trùng 2 nhóm -> nhóm khai báo TRƯỚC thắng
  }));
  _relStdMap=m;return m;
}
// Trả về giá trị chuẩn nếu chuỗi ĐÚNG LÀ 1 giá trị trong danh sách chuẩn (không phân biệt hoa/thường), ngược lại null.
function _relStdCanon(s){
  const it=_stdLblMap('rel').get(_stdKey(s));   // khớp nhãn vi, nhãn en hoặc mã
  return it?it.vi:null;
}
// Ép 1 giá trị "mối quan hệ" về danh sách chuẩn. Rỗng/"Chưa rõ"/nhãn nhân vật chính -> trả nguyên (người gọi tự xử lý).
// Không ánh xạ được (hoặc là quan hệ với NGƯỜI KHÁC, VD "con gái của chủ quán") -> "Chưa rõ".
function normalizeRelationshipValue(raw){
  const orig=String(raw==null?'':raw).normalize('NFC').trim();
  if(isUnknownVal(orig)||isProtagonistLabel(orig))return orig;
  const direct=_relStdCanon(orig);
  if(direct)return direct;
  // Nhãn CŨ gộp giới tính (Cha/Mẹ, Ông bà, Anh/Chị ruột, Vợ/Chồng, Đàn anh/Đàn chị, Họ hàng ngang bậc) KHÔNG đoán được giới tính ở đây -> "Chưa rõ"
  // (nơi gọi sẽ giữ giá trị cũ qua _keepIfStdUnknown; migrateStandardRelAge mới là nơi đổi, dựa vào giới tính nhân vật).
  if((typeof CHARMEM_REL_OLD_BY_GENDER!=='undefined'&&CHARMEM_REL_OLD_BY_GENDER[orig])||orig==='Họ hàng ngang bậc')return 'Chưa rõ';
  let t=_stdKey(orig).replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g,' ').replace(/\s+/g,' ').trim();
  t=t.replace(/^(?:là|thành)\s+/,'').replace(/[.!?:;。]+$/,'').trim();
  try{
    if(typeof _relStripMcSuffix==='function'){
      const mcNames=(typeof S!=='undefined'&&S&&Array.isArray(S.characters))?S.characters.filter(c=>isCharProtagonist(c)).map(c=>c.name).filter(Boolean):[];
      t=_relStripMcSuffix(t,mcNames);
    }
  }catch(e){}
  t=t.replace(/\s+(?:của|với|đối với)\s+(?:nhân vật chính|mc|nvc|nam chính|nữ chính)\s*$/,'').trim();
  if(!t)return 'Chưa rõ';
  if(/(^|\s)của(\s|$)/.test(t))return 'Chưa rõ';      // quan hệ với người khác, không phải với MC
  const map=_relStdLookupMap();
  const hit=p=>{
    const k=_stdKey(p);
    if(map.has(k))return map.get(k);
    for(const [re,std] of CHARMEM_REL_FALLBACK){if(re.test(k))return std;}
    return null;
  };
  const whole=hit(t);
  if(whole)return whole;
  const parts=t.split(/\s*(?:[\/,;]|\s+và\s+|\s+hoặc\s+|\s+kiêm\s+)\s*/).map(x=>x.trim()).filter(Boolean);
  for(const p of parts){const h=hit(p);if(h)return h;}
  return 'Chưa rõ';
}
// Ép 1 giá trị "độ tuổi" về 1 NHÓM chuẩn (CHARMEM_AGE_BANDS). Số tuổi / dải tuổi ("17 tuổi", "khoảng 40 tuổi", "30-40 tuổi") được quy về nhóm
// theo số (dải lấy trung điểm); số > 110 (tu tiên/trường sinh) không đáng tin -> "Chưa rõ". Rỗng/"Chưa rõ" -> trả nguyên. Không hiểu -> "Chưa rõ".
function normalizeAgeValue(raw){
  const orig=String(raw==null?'':raw).normalize('NFC').trim();
  if(isUnknownVal(orig))return orig;
  const k=_stdKey(orig);
  const canon=_stdLblMap('age').get(k);   // nhãn vi, nhãn en hoặc mã
  if(canon)return canon.vi;
  let n=null;
  let m=k.match(/(\d{1,3})\s*(?:-|–|~|đến|tới)\s*(\d{1,3})\s*tuổi/);
  if(m&&+m[1]>0&&+m[2]>=+m[1])n=Math.round((+m[1]+ +m[2])/2);
  else{
    m=k.match(/(\d{1,3})\s*tuổi/)||k.match(/tuổi\s*(?:là\s*)?(\d{1,3})/)||k.match(/^(\d{1,3})$/);
    if(m&&+m[1]>0)n=+m[1];
  }
  if(n!==null){
    if(n>110)return 'Chưa rõ';
    const band=CHARMEM_AGE_BANDS.find(x=>n>=x.min&&n<=x.max);
    return band?band.label:'Chưa rõ';
  }
  const sx=_stdStrip(orig);
  for(const [label,re] of CHARMEM_AGE_WORD_RULES){if(re.test(sx))return label;}
  return 'Chưa rõ';
}
// Ép 1 giá trị "độ thiện cảm" về danh sách chuẩn. Rỗng/"Chưa rõ" -> trả nguyên. Không hiểu -> "Chưa rõ" (không ghi đè dữ liệu đang có).
function normalizeAffinityValue(raw){
  const orig=String(raw==null?'':raw).normalize('NFC').trim();
  if(isUnknownVal(orig))return orig;
  const it=_stdLblMap('aff').get(_stdKey(orig));
  if(it)return it.vi;
  const x=_stdStrip(orig);
  if(/thu dich|ghet|cam thu|thu han|dich y|doi dau|khinh/.test(x))return 'Thù địch';
  if(/xa cach|lanh nhat|lanh lung|ho hung|khach sao|e ngai|giu khoang cach/.test(x))return 'Xa cách';
  if(/than thien|de chiu|hoa nha|thien cam|thien chi|tot bung/.test(x))return 'Thân thiện';
  if(/than thiet|than mat|gan gui|yeu thuong|tri ky|keo son|quan quyt/.test(x))return 'Thân thiết';
  if(/binh thuong|trung tinh|lich su|xa gia|khach khi/.test(x))return 'Bình thường';
  return 'Chưa rõ';
}
// Chỉ số nhóm tuổi (0..7 theo CHARMEM_AGE_BANDS) của 1 giá trị độ tuổi, null nếu chưa rõ / số tuổi không đáng tin (vượt xa tuổi người).
function charmemAgeBandIndex(cue){
  const v=normalizeAgeValue(cue);
  if(!v||isUnknownVal(v))return null;
  const i=CHARMEM_AGE_BANDS.findIndex(x=>x.label===v);
  return i<0?null:i;
}
function charmemRelPromptList(){
  return CHARMEM_REL_GROUPS.map(g=>g[0]+': '+g[1].map(v=>'"'+v+'"').join(', ')).join(' | ');
}
function charmemAgePromptList(){
  return CHARMEM_AGE_BANDS.map(b=>'"'+b.label+'" ('+(b.max>=120?b.min+'+':b.min+'-'+b.max)+' tuổi)').join(', ');
}
function charmemAgeLabelList(){return CHARMEM_AGE_BANDS.map(b=>'"'+b.label+'"').join(', ');}
// Chuẩn hoá 2 field của 1 entry AI trả về (chỉ chạm field nào CÓ trong entry, để kết quả xác minh không có field này không bị thêm rỗng).
function normalizeExtractedStandards(f){
  if(!f||typeof f!=='object')return f;
  if(f.relationship!=null&&String(f.relationship).trim()!=='')f.relationship=normalizeRelationshipValue(f.relationship);
  if(f.statusCue!=null&&String(f.statusCue).trim()!=='')f.statusCue=normalizeAgeValue(f.statusCue);
  if(f.affinity!=null&&String(f.affinity).trim()!=='')f.affinity=normalizeAffinityValue(f.affinity);
  return f;
}
// Sau khi chuẩn hoá mà thành "Chưa rõ" (không ánh xạ được) thì giữ giá trị cũ nếu cũ còn dùng được (tránh bước kiểm tra lại làm mất dữ liệu).
function _keepIfStdUnknown(n,old){return(isUnknownVal(n)&&!isUnknownVal(old))?old:n;}
// ===== ĐẾM CHẤT LƯỢNG ĐẦU RA CỦA AI cho độ tuổi/mối quan hệ — CHỈ ghi số liệu, KHÔNG đổi hành vi =====
// Mỗi lần AI trả 1 giá trị (ở bước trích xuất và bước kiểm tra lại) được xếp vào 1 trong 3 loại:
//   exact    = đã đúng NGUYÊN VĂN 1 giá trị chuẩn; fixed = biến thể được code quy về giá trị chuẩn; unmapped = không ánh xạ được -> "Chưa rõ".
// Số liệu lưu theo (nguồn|model|trường) trong localStorage (giữ qua lần tải lại trang). Xem: charmemStdReport() trong console; xoá: charmemStdReset().
// Dùng để quyết định có cần bật responseSchema enum không (xem tỷ lệ unmapped/fixed theo model). "model" là ước lượng: lấy từ lượt gọi gần nhất.
let CHARMEM_STD_LAST_MODEL='';
const CHARMEM_STD_STATS_KEY='charmemStdStats_v1';
let _stdStats=null;
function _stdStatsLoad(){
  if(_stdStats)return _stdStats;
  let o=null;
  try{if(typeof localStorage!=='undefined')o=JSON.parse(localStorage.getItem(CHARMEM_STD_STATS_KEY)||'null');}catch(e){}
  _stdStats=(o&&typeof o==='object'&&o.by)?o:{since:Date.now(),by:{}};
  return _stdStats;
}
function _stdStatsSave(){try{if(typeof localStorage!=='undefined')localStorage.setItem(CHARMEM_STD_STATS_KEY,JSON.stringify(_stdStats));}catch(e){}}
function charmemStdTrack(kind,raw,norm,where){
  try{
    const r=String(raw==null?'':raw).normalize('NFC').trim();
    if(!r||isUnknownVal(r)||isProtagonistLabel(r))return norm;   // rỗng / "Chưa rõ" / nhãn nhân vật chính: không phải giá trị cần chuẩn hoá
    const st=_stdStatsLoad();
    const key=(where||'?')+'|'+(CHARMEM_STD_LAST_MODEL||'?')+'|'+kind;
    const b=st.by[key]||(st.by[key]={exact:0,fixed:0,unmapped:0,fixedMap:{},unmappedMap:{}});
    const n=String(norm==null?'':norm).trim();
    const bump=(map,k)=>{if(map[k]!==undefined||Object.keys(map).length<150)map[k]=(map[k]||0)+1;};   // chặn kích thước
    if(n===r)b.exact++;
    else if(isUnknownVal(n)){b.unmapped++;bump(b.unmappedMap,r.slice(0,60));}
    else{b.fixed++;bump(b.fixedMap,r.slice(0,60)+' → '+n);}
    _stdStatsSave();
    if(isUnknownVal(n)&&!(typeof CHARMEM_STD_QUIET!=='undefined'&&CHARMEM_STD_QUIET))
      console.log(`[Chuẩn hoá][Không ánh xạ] ${kind==='rel'?'quan hệ':'độ tuổi'} "${r.slice(0,60)}" -> Chưa rõ (${where||'?'}, model ${CHARMEM_STD_LAST_MODEL||'?'})`);
  }catch(e){}
  return norm;
}
function charmemStdNormTracked(kind,raw,where){
  const n=kind==='rel'?normalizeRelationshipValue(raw):normalizeAgeValue(raw);
  return charmemStdTrack(kind,raw,n,where);
}
function charmemStdReport(opt){
  const st=_stdStatsLoad(),rows=[],top=[];
  const pct=(a,t)=>t?Math.round(a*1000/t)/10+'%':'-';
  Object.keys(st.by).sort().forEach(k=>{
    const [where,model,kind]=k.split('|'),b=st.by[k],t=b.exact+b.fixed+b.unmapped;
    rows.push({nguon:where,model,truong:kind==='rel'?'quan hệ':'độ tuổi',tong:t,'đúng nguyên văn':pct(b.exact,t),'sửa được':pct(b.fixed,t),'thành Chưa rõ':pct(b.unmapped,t),_sl:{exact:b.exact,fixed:b.fixed,unmapped:b.unmapped}});
    const sortTop=m=>Object.entries(m).sort((x,y)=>y[1]-x[1]).slice(0,10).map(([v,c])=>c+'× '+v);
    top.push({nhom:k,'hay bị sửa':sortTop(b.fixedMap),'không ánh xạ được':sortTop(b.unmappedMap)});
  });
  if(!(opt&&opt.quiet)&&typeof console!=='undefined'){
    console.log('[Chuẩn hoá] Thống kê đầu ra AI (từ '+new Date(st.since).toLocaleString()+'):');
    if(!rows.length)console.log('(chưa có số liệu — chạy phân tích vài chương rồi gọi lại)');
    else{(console.table||console.log)(rows.map(r=>{const o=Object.assign({},r);delete o._sl;return o;}));top.forEach(x=>console.log(x.nhom,x));}
  }
  return {since:st.since,rows,top};
}
function charmemStdReset(){_stdStats={since:Date.now(),by:{}};_stdStatsSave();}
// Chuyển dữ liệu CŨ sang danh sách chuẩn. CHỈ field AI tự quản lý (source !== 'user'); không ánh xạ được thì để NGUYÊN (không mất dữ liệu).
// Idempotent: chạy lại không đổi gì. Trả true nếu có thay đổi (để lưu lại).
// Nhãn CŨ (trước khi tách theo giới tính / bỏ Họ hàng, Đồng bối) -> nhãn mới. Nhãn gộp giới tính cần giới tính của chính nhân vật;
// chưa rõ giới tính thì GIỮ NGUYÊN nhãn cũ (không đoán), lần tải sau có giới tính sẽ tự chuyển.
const CHARMEM_REL_OLD_BY_GENDER={
  'Cha/Mẹ':{Nam:'Cha',Nữ:'Mẹ'},'Ông bà':{Nam:'Ông',Nữ:'Bà'},'Anh/Chị ruột':{Nam:'Anh',Nữ:'Chị'},
  'Vợ/Chồng':{Nam:'Chồng',Nữ:'Vợ'},'Đàn anh/Đàn chị':{Nam:'Đàn anh',Nữ:'Đàn chị'}
};
const CHARMEM_REL_OLD_STATIC={
  'Cháu nội/ngoại':'Cháu','Em ruột':'Em','Thầy/Người dạy':'Thầy giáo','Trưởng bối/Tiền bối':'Tiền bối',
  'Cấp dưới/Thuộc hạ':'Cấp dưới','Người hầu/Tùy tùng':'Người hầu','Bạn thân':'Bạn bè','Bạn/Đồng đội':'Bạn bè',
  'Đồng nghiệp/Bạn học':'Người quen','Đồng bối':'Bạn bè','Họ hàng bậc dưới':'Cháu'
};
// Trả về: nhãn mới | null (không phải nhãn cũ cần đổi) | '' (là nhãn cũ nhưng chưa đủ dữ kiện để đổi -> giữ nguyên, KHÔNG chạy normalize).
function _relMigrateOldLabel(c,mc){
  const v=String(c.relationship||'').normalize('NFC').trim();
  if(CHARMEM_REL_OLD_STATIC[v])return CHARMEM_REL_OLD_STATIC[v];
  if(CHARMEM_REL_OLD_BY_GENDER[v]){
    const g=_relGender(c.gender);
    return g?CHARMEM_REL_OLD_BY_GENDER[v][g]:'';
  }
  if(v==='Họ hàng bậc trên'){   // cô/dì/chú/bác/cậu/mợ: nhãn cũ không nói rõ -> tìm đúng 1 từ trong xưng hô/cách gọi/ghi chú/tên gọi khác; không chắc thì giữ nguyên
    const hay=[c.addrThemToMc,c.addrMcToThem,c.narrRef,c.note,(c.aliases||[]).join(' '),c.name].map(x=>String(x||'').toLowerCase()).join(' | ');
    const found=['bác','chú','cô','dì','cậu','mợ'].filter(w=>new RegExp('(^|[^\\p{L}])'+w+'([^\\p{L}]|$)','u').test(hay));
    const m={'bác':'Bác','chú':'Chú','cô':'Cô','dì':'Dì','cậu':'Cậu','mợ':'Mợ'};
    return found.length===1?m[found[0]]:'';
  }
  if(v==='Họ hàng ngang bậc'){   // anh/chị/em họ, anh rể, chị dâu...: theo giới + so tuổi với MC (không cần ruột hay nuôi)
    const g=_relGender(c.gender),a=charmemAgeBandIndex(c.statusCue),b=mc?charmemAgeBandIndex(mc.statusCue):null;
    if(!g||a==null||b==null||a===b)return '';
    return a>b?(g==='Nam'?'Anh':'Chị'):'Em';
  }
  return null;
}
function migrateStandardRelAge(list){
  if(!Array.isArray(list))return false;
  let changed=false,nRel=0,nAge=0;
  const _mc=list.find(x=>x&&isCharProtagonist(x))||null;
  list.forEach(c=>{
    if(!c)return;
    if(c.relationshipSource!=='user'&&c.relationship&&!isUnknownVal(c.relationship)&&!isProtagonistLabel(c.relationship)){
      const old=_relMigrateOldLabel(c,_mc);
      if(old){c.relationship=old;changed=true;nRel++;}
      else if(old===null){
      const n=normalizeRelationshipValue(c.relationship);
      if(n&&!isUnknownVal(n)&&n!==c.relationship){c.relationship=n;changed=true;nRel++;}
      }
    }
    if(c.statusCueSource!=='user'&&c.statusCue&&!isUnknownVal(c.statusCue)){
      const n=normalizeAgeValue(c.statusCue);
      if(n&&!isUnknownVal(n)&&n!==c.statusCue){c.statusCue=n;changed=true;nAge++;}
    }
  });
  if(changed)console.log(`[Luồng 1][Chuẩn hoá] Đã chuyển dữ liệu cũ sang danh sách chuẩn: ${nRel} mối quan hệ, ${nAge} độ tuổi (chỉ field AI tự quản lý; giá trị không ánh xạ được giữ nguyên).`);
  return changed;
}
// ---- Bộ chọn trong modal sửa nhân vật: ô nhập vẫn gõ tự do được (lối thoát), kèm danh sách chuẩn bấm 1 chạm (iPad dùng được, không phụ thuộc datalist). ----
function charmemEnsureStdStyle(){
  if(typeof document==='undefined'||document.getElementById('charmemStdStyle'))return;
  const st=document.createElement('style');st.id='charmemStdStyle';
  st.textContent='.cm-std{margin:6px 0 2px;font-size:12px;flex:0 0 100%;width:100%;box-sizing:border-box}'
    +'.cm-std>summary{cursor:pointer;opacity:.7;user-select:none;list-style:none}'
    +'.cm-std>summary::-webkit-details-marker{display:none}'
    +'.cm-std>summary::before{content:"▸ "}.cm-std[open]>summary::before{content:"▾ "}'
    +'.cm-std-grp{margin-top:6px}.cm-std-grp>b{display:block;font-weight:600;opacity:.65;margin-bottom:3px}'
    +'.cm-std-chip{display:inline-block;margin:0 5px 5px 0;padding:3px 10px;border-radius:999px;border:0;background:rgba(127,127,127,.16);color:inherit;font:inherit;cursor:pointer}'
    +'.cm-std-chip.on{background:var(--accent,#4a7cff);color:#fff}';
  document.head.appendChild(st);
}
function charmemAttachStdPicker(input,groups,key){
  if(!input||typeof document==='undefined')return;
  charmemEnsureStdStyle();
  const host=input.parentNode,L=charmemUiLang();
  let box=host.querySelector('details.cm-std[data-k="'+key+'"]');
  if(box&&box.dataset.lang!==L){box.remove();box=null;}   // đổi ngôn ngữ giao diện -> dựng lại chip
  const sync=()=>{
    const cur=(input.value||'').trim().toLowerCase();
    box.querySelectorAll('.cm-std-chip').forEach(b=>b.classList.toggle('on',b.dataset.v.toLowerCase()===cur));
  };
  if(!box){
    box=document.createElement('details');box.className='cm-std';box.dataset.k=key;box.dataset.lang=L;
    const sm=document.createElement('summary');sm.textContent='Chọn từ danh sách chuẩn';box.appendChild(sm);
    groups.forEach(([title,vals])=>{
      const g=document.createElement('div');g.className='cm-std-grp';
      if(title){
        const gl=Object.values(CHARMEM_REL_GROUP_LABELS).find(x=>x.vi===title);
        const b=document.createElement('b');b.textContent=gl?(gl[L]||title):title;g.appendChild(b);
      }
      vals.forEach(v=>{
        const shown=charmemStdLabel(key,v,L);   // chip hiện nhãn theo ngôn ngữ giao diện; lưu lại sẽ đổi về nhãn chuẩn (charmemStdCanon)
        const bt=document.createElement('button');bt.type='button';bt.className='cm-std-chip';bt.textContent=shown;bt.dataset.v=shown;
        bt.addEventListener('click',()=>{input.value=shown;input.dispatchEvent(new Event('input',{bubbles:true}));sync();});
        g.appendChild(bt);
      });
      box.appendChild(g);
    });
    input.insertAdjacentElement('afterend',box);
    input.addEventListener('input',sync);
  }
  sync();
}
// ===================================================================
// ===== CHUẨN HOÁ "ĐỘ TUỔI" + "MỐI QUAN HỆ" — END =====
// ===================================================================

// ===== 4 CÔNG TẮC trong menu Cài đặt (nút Cài đặt ở header drawer "Bộ nhớ nhân vật") =====
// Cả 4 mặc định BẬT, lưu localStorage, độc lập với nhau:
//  1) "Phân tích nhân vật" — getCharMemOn(): Luồng 1 (phân tích nhân vật từng chương). Giữ
//     nguyên key 'dich-charmem-on' của công tắc cũ để không mất lựa chọn đã lưu của người dùng.
//  2) "Soát xưng hô bản dịch"     — getAuditAddrOn(): Luồng 3, job xưng hô lời thoại (genre_tone).
//     (Job "đại từ ngôi 3 LẪN TÔNG khi tường thuật" — narration_pronoun — đã BỎ khỏi Luồng 3, và job
//     "giới tính đại từ ngôi 3 sai so với gender đã lưu" — gender_pronoun — cũng đã BỎ khỏi Luồng 3:
//     cả 2 việc này để AI tự làm đúng ngay từ bước dịch chính (xem gắn tag giới tính ⟦Nam⟧/⟦Nữ⟧ trong
//     callAPIFull ở translate.js), không soát lại nữa.)
//  3) "Kiểm tra chính tả"         — getAuditSpellOn(): Luồng 3, job chính tả.
//  4) "Kiểm tra lại thông tin"    — getNameCheckOn(): Luồng 1, bước recheckExtractedCharacters (gồm cả đối chiếu tên đã dịch với tên gốc và DỊCH LẠI nếu sai — nameTransCheck) (giám khảo tên đã BỎ, xem getNameJudgeOn). [CŨ, không còn áp dụng] BẬT: chỉ thay
//     chuỗi tên gốc đã được model phân loại là tên riêng (aiKind==='proper'); biệt danh/chức danh/danh xưng thân tộc
//     không bị thay mà chỉ làm gợi ý; chức danh dùng chung (tiểu nhị...) được tách theo ngữ cảnh. TẮT: về đúng hành vi cũ
//     (isReplaceForm cũ), không tốn thêm lượt gọi API. Nằm ngay dưới "Phân tích nhân vật" vì chạy trong lượt phân tích chương.
// Luồng 3 (auditChapterAddressing/ensureAuditPipeline) chạy khi isAuditEnabled() — tức bật ít nhất
// 1 trong mục 2/3. Job "sót dịch" (dịch nốt chữ Hán/Anh còn sót, do code quét cơ học — chỉ tốn API
// khi thực sự phát hiện câu sót) không có công tắc riêng, đi kèm mỗi lượt soát.
const CHARMEM_AUDIT_ADDR_KEY='dich-audit-addr-on';
const CHARMEM_AUDIT_SPELL_KEY='dich-audit-spell-on';
// Trước đây Luồng 3 dùng CHUNG công tắc 'dich-charmem-on' (tắt bộ nhớ = tắt luôn soát). Ai đã tắt
// công tắc đó để tiết kiệm chi phí thì giữ nguyên hành vi: chép trạng thái TẮT sang 2 công tắc mới
// (chỉ 1 lần — khi 2 key mới chưa tồn tại), tránh việc bản cập nhật tự bật lại soát ngoài ý muốn.
(function migrateLegacyAuditToggles(){
  try{
    if(localStorage.getItem('dich-charmem-on')!=='0')return;
    if(localStorage.getItem(CHARMEM_AUDIT_ADDR_KEY)===null)localStorage.setItem(CHARMEM_AUDIT_ADDR_KEY,'0');
    if(localStorage.getItem(CHARMEM_AUDIT_SPELL_KEY)===null)localStorage.setItem(CHARMEM_AUDIT_SPELL_KEY,'0');
  }catch(e){}
})();
// Trần ký tự văn bản chương gửi đi phân tích/xác minh/kiểm tra tên. Bước dịch gửi CẢ chương nên trần quá thấp (20000) làm
// phần đuôi chương dài không được phân tích (nhân vật/xưng hô ở đó không vào "appeared").
const CHARMEM_ANALYSIS_MAX_CHARS=60000;
// Văn bản gốc của chương ĐÚNG như bước dịch sẽ thấy (translate.js: applyReplace -> thay tên -> cleanCensorChars).
function charmemRawSource(ch){
  let t=ch&&ch.content;
  try{if(typeof applyReplace==='function'){const r=applyReplace(t);if(typeof r==='string')t=r;}}catch(e){}
  return cleanCensorChars(t);
}
function getCharMemOn(){
  const v=localStorage.getItem('dich-charmem-on');
  return v===null?true:v==='1';
}
function setCharMemOn(v){
  localStorage.setItem('dich-charmem-on',v?'1':'0');
}
function getAuditAddrOn(){
  if(window.TargetLang&&!TargetLang.supports('honorific'))return false; // đích ≠ vi: không soát xưng hô
  const v=localStorage.getItem(CHARMEM_AUDIT_ADDR_KEY);
  return v===null?true:v==='1';
}
function setAuditAddrOn(v){
  localStorage.setItem(CHARMEM_AUDIT_ADDR_KEY,v?'1':'0');
}
function getAuditSpellOn(){
  if(window.TargetLang&&!TargetLang.supports('spell'))return false; // đích ≠ vi: không kiểm tra chính tả
  const v=localStorage.getItem(CHARMEM_AUDIT_SPELL_KEY);
  return v===null?true:v==='1';
}
function setAuditSpellOn(v){
  localStorage.setItem(CHARMEM_AUDIT_SPELL_KEY,v?'1':'0');
}
// "Kiểm tra tên" (Luồng 1, giám khảo tên). Có cache vì isReplaceForm được gọi rất nhiều lần mỗi chương.
const CHARMEM_NAMECHECK_KEY='dich-namecheck-on';
let _nameCheckOnCache=null;
function getNameCheckOn(){
  if(_nameCheckOnCache!==null)return _nameCheckOnCache;
  let v=null;
  try{v=localStorage.getItem(CHARMEM_NAMECHECK_KEY);}catch(e){}
  _nameCheckOnCache=v===null?true:v==='1';
  return _nameCheckOnCache;
}
// GIÁM KHẢO TÊN (judgeNamingBatch) ĐÃ BỎ: bước "Kiểm tra lại thông tin" (recheckExtractedCharacters) đã làm lại việc đó.
// Mọi chỗ trước đây phụ thuộc phán quyết của giám khảo (aiKind/_judge/sameAs/identity) giờ hỏi hàm này thay vì
// getNameCheckOn() -> luôn false = đúng hành vi "TẮT" cũ (thay mọi form trong origName trừ role_label, gộp theo tên như cũ).
// getNameCheckOn() chỉ còn điều khiển công tắc "Kiểm tra lại thông tin".
function getNameJudgeOn(){return false;}
function setNameCheckOn(v){
  _nameCheckOnCache=!!v;
  try{localStorage.setItem(CHARMEM_NAMECHECK_KEY,v?'1':'0');}catch(e){}
}
// Luồng 3 có việc để làm hay không (xem ensureAuditPipeline ở index.html + auditChapterAddressing).
function isAuditEnabled(){
  return getAuditAddrOn()||getAuditSpellOn();
}
let _charDrawerOpen=false;
// Chế độ sắp xếp danh sách nhân vật trong drawer. Lưu localStorage giống pattern libSort ở index.html (key riêng, vì đây là
// sắp xếp nhân vật chứ không phải Tủ truyện).
// Chế độ: 'newest' (mặc định, nhân vật mới tạo xếp trước) | 'az'. Giá trị cũ 'mention' đã bỏ → tự về 'newest'.
let charMemSort=localStorage.getItem('dich-charmem-sort')==='az'?'az':'newest';
function setCharMemSort(mode){
  charMemSort=mode;
  localStorage.setItem('dich-charmem-sort',mode);
  renderCharList();
}
function toggleCharMemSort(){setCharMemSort(charMemSort==='az'?'newest':'az');}
let _charEditingId=null;
let _charModalGender='Chưa rõ';
let _charModalGenderTouched=false;   // người dùng đã bấm chip giới tính trong lần mở modal này
let _charMemSaveWarned=false;
// Chiều gộp đang chọn trong modal: 'into' = gộp nhân vật KHÁC vào nhân vật đang mở (mặc định,
// hành vi cũ) | 'out' = gộp CHÍNH nhân vật đang mở vào 1 nhân vật khác. Reset về 'into' mỗi khi
// mở/đóng modal (xem openCharModal/closeCharModal) để không giữ lựa chọn của lần sửa trước.
let _charMergeDir='into';
// Snapshot giá trị các field "có thể bị khoá user" (relationship/gender/addr.../statusCue) TẠI THỜI
// ĐIỂM MỞ MODAL (openCharModal) — để saveCharModal so sánh, chỉ đánh dấu source='user' cho field nào
// người dùng THỰC SỰ gõ sửa so với lúc mở lên, không phải cứ "ô có giá trị lúc bấm Lưu" là khoá (bug
// cũ: field do AI điền sẵn, user chỉ mở modal xem rồi bấm Lưu mà không đụng gì cũng bị khoá oan).
let _charModalInitial={};
let _charModalImgSrc='';   // link gốc của ảnh đang chọn (để chống trùng ảnh giữa các nhân vật)
let _charModalImg='';   // ảnh đang chọn trong modal (data URL đã cắt 3:4 hoặc link http); chỉ ghi vào nhân vật khi bấm Lưu và có đổi

function toggleCharMemDrawer(){
  _charDrawerOpen=!_charDrawerOpen;
  document.getElementById('charmemDrawer').classList.toggle('open',_charDrawerOpen);
  document.getElementById('charmemOverlay').classList.toggle('show',_charDrawerOpen);
  document.getElementById('btnCharMemOpen').classList.toggle('btn-on',_charDrawerOpen);
  document.body.classList.toggle('charmem-open',_charDrawerOpen);
  if(_charDrawerOpen){
    // Dựng danh sách SAU khung hình đầu tiên: để drawer bắt đầu trượt ra ngay khi bấm, không phải chờ
    // renderCharList() (đồng bộ: sort + innerHTML) chạy xong mới được vẽ. Dòng console.log dùng để đo —
    // xoá đi khi không cần nữa.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!_charDrawerOpen)return;
      const t0=performance.now();
      renderCharList();
      console.log('[charmem] renderCharList: '+(performance.now()-t0).toFixed(1)+'ms, '+(S.characters||[]).length+' nhân vật');
    }));
  } else {
    // Đóng panel: xoá từ khoá tìm kiếm, hiện lại toàn bộ danh sách
    const inp=document.getElementById('charmemSearchInput');
    if(inp)inp.value='';
    setCharMemSettingsOpen(false); // đừng để menu Cài đặt còn "mở" sẵn khi mở lại drawer lần sau
  }
}
function toggleCharMemOn(){
  const on=!getCharMemOn();
  setCharMemOn(on);
  updCharMemToggleBtn();
}
// Bấm 1 dòng trong menu Cài đặt: kind = 'rel' (Phân tích nhân vật) | 'name' (Kiểm tra tên) | 'addr' (Soát xưng hô
// bản dịch) | 'spell' (Kiểm tra chính tả). Có hiệu lực từ lượt phân tích/soát KẾ TIẾP (lượt đang
// chạy dở vẫn chạy nốt), không ảnh hưởng bản dịch đã có.
function toggleCharMemSetting(kind){
  if(kind==='rel')toggleCharMemOn();
  else if(kind==='addr')setAuditAddrOn(!getAuditAddrOn());
  else if(kind==='spell')setAuditSpellOn(!getAuditSpellOn());
  else if(kind==='name')setNameCheckOn(!getNameCheckOn());
  updCharMemToggleBtn();
}
// Tên hàm giữ nguyên từ công tắc cũ (index.html + renderCharList vẫn gọi) — giờ đồng bộ trạng thái
// cả 3 dòng trong menu Cài đặt.
function updCharMemToggleBtn(){
  const states={rel:getCharMemOn(),name:getNameCheckOn(),addr:getAuditAddrOn(),spell:getAuditSpellOn()};
  document.querySelectorAll('#charmemSettingsMenu .cmset-item[data-cmset]').forEach(el=>{
    el.setAttribute('aria-checked',states[el.dataset.cmset]?'true':'false');
  });
  const offNote=document.getElementById('charmemOffNote');
  if(offNote)offNote.classList.toggle('show',!states.rel); // "Phân tích nhân vật" tắt → nhắc là nhân vật mới sẽ không được thêm
}
// Mở/đóng menu Cài đặt chỉ bằng click (class .open) — không còn mở khi rê chuột. Bấm ra ngoài / Esc / Tab ra khỏi menu thì đóng
// (xem initCharMemSettingsMenu).
function setCharMemSettingsOpen(open){
  const w=document.getElementById('charmemSettingsWrap');
  if(!w)return;
  w.classList.toggle('open',!!open);
  const b=document.getElementById('charmemSettingsBtn');
  if(b)b.setAttribute('aria-expanded',open?'true':'false');
}
function toggleCharMemSettings(ev){
  if(ev)ev.stopPropagation();
  const w=document.getElementById('charmemSettingsWrap');
  if(!w)return;
  setCharMemSettingsOpen(!w.classList.contains('open'));
}
// Thêm dòng "Kiểm tra tên" NGAY DƯỚI "Phân tích nhân vật" trong menu Cài đặt: nhân bản đúng dòng 'rel' (giữ nguyên
// class/role/onclick của nó, chỉ đổi data-cmset + nhãn) nên không phụ thuộc cấu trúc HTML trong index.html. Nếu
// index.html đã có sẵn dòng data-cmset="name" thì không làm gì.
const CHARMEM_NAMECHECK_LABEL='Kiểm tra lại thông tin';
const CHARMEM_NAMECHECK_DESC='Đọc lại kết quả phân tích: xếp lại tên/biệt danh, dịch nốt chữ Hán sót, chỉnh xưng hô đúng hệ thể loại (giữ cùng vai vế) rồi điền đủ các trường';
function ensureNameCheckMenuItem(){
  const menu=document.getElementById('charmemSettingsMenu');
  if(!menu||menu.querySelector('.cmset-item[data-cmset="name"]'))return;
  const rel=menu.querySelector('.cmset-item[data-cmset="rel"]');
  if(!rel)return;
  const it=rel.cloneNode(true);
  it.setAttribute('data-cmset','name');
  it.removeAttribute('id');
  const oc=it.getAttribute('onclick');
  if(oc)it.setAttribute('onclick',oc.replace(/(['"])rel\1/g,"$1name$1"));
  else it.addEventListener('click',()=>toggleCharMemSetting('name'));
  const texts=[];
  const w=document.createTreeWalker(it,NodeFilter.SHOW_TEXT);
  while(w.nextNode()){if(w.currentNode.nodeValue.trim())texts.push(w.currentNode);}
  if(texts.length){
    texts[0].nodeValue=CHARMEM_NAMECHECK_LABEL;
    if(texts.length>1)texts[1].nodeValue=CHARMEM_NAMECHECK_DESC;
    for(let i=2;i<texts.length;i++)texts[i].nodeValue='';
  }else it.textContent=CHARMEM_NAMECHECK_LABEL;
  rel.after(it);
}
function initCharMemSettingsMenu(){
  const w=document.getElementById('charmemSettingsWrap');
  if(!w)return;
  // Bấm/chạm ra ngoài => đóng. Dùng pointerdown (không đợi click) cho phản hồi tức thì trên cảm ứng.
  document.addEventListener('pointerdown',e=>{
    if(w.classList.contains('open')&&!w.contains(e.target))setCharMemSettingsOpen(false);
  });
  // Bàn phím: Esc đóng (trả focus về nút), Tab ra khỏi menu cũng đóng.
  w.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&w.classList.contains('open')){
      e.stopPropagation();
      setCharMemSettingsOpen(false);
      document.getElementById('charmemSettingsBtn')?.focus();
    }
  });
  w.addEventListener('focusout',e=>{
    if(e.relatedTarget&&!w.contains(e.relatedTarget))setCharMemSettingsOpen(false);
  });
  ensureNameCheckMenuItem();
  updCharMemToggleBtn();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initCharMemSettingsMenu);
else initCharMemSettingsMenu();

// ===== POPUP "XƯNG HÔ THƯỜNG GẶP" (nút charmemAddrBtn, bên trái nút Cài đặt) =====
// Đọc/ghi qua AddrPresets (addr-presets.js):
//  - Thể loại THEO TRUYỆN (S.fname): setStoryChoice — chọn tay | "Tự nhận diện" (xoá lựa chọn) | "Không dùng".
//  - Bộ cặp xưng hô của từng thể loại là state CHUNG mọi truyện (key addrPairPresetsGlobalV5): thêm/xoá/đặt lại.
// Popup chỉ là giao diện; 3 luồng đọc kết quả qua getAddrPreset() nên không cần báo gì thêm sau khi đổi.
function _cmaEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _cmaStoryKey(){return (typeof S!=='undefined'&&S&&S.fname)||'__noname__';}
function _cmaState(){
  const AP=window.AddrPresets;
  if(!AP)return null;
  const choice=AP.getStoryChoice(_cmaStoryKey());
  let mode='auto',selId=null;
  if(choice&&choice.off)mode='off';
  else if(choice&&choice.id&&AP.findNode(choice.id)){mode='manual';selId=choice.id;}
  const guidance=getCachedPromptGuidanceSync();
  const detected=(mode==='auto')?AP.detect(guidance):null;
  const viewId=mode==='manual'?selId:(detected?detected.node.id:null);
  const view=viewId?AP.findNode(viewId):null;   // {node, group} | null
  return{AP,mode,selId,detected,viewId,view,guidance};
}
function openCharMemAddrModal(){
  renderCharMemAddrModal();
  document.getElementById('charmemAddrOverlay')?.classList.add('show');
}
function closeCharMemAddrModal(){
  document.getElementById('charmemAddrOverlay')?.classList.remove('show');
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.getElementById('charmemAddrOverlay')?.classList.contains('show'))closeCharMemAddrModal();
});
function renderCharMemAddrModal(){
  const st=_cmaState();
  const $=id=>document.getElementById(id);
  if(!st||!$('charmemAddrOverlay'))return;
  const {AP,mode,view,detected}=st;
  const groups=AP.getState().groups;
  const chip=(label,attrs,cls)=>`<button type="button" class="charmem-addr-chip ${cls||''}" ${attrs}>${_cmaEsc(label)}</button>`;

  // hàng chế độ
  $('charmemAddrModeChips').innerHTML=
    chip('Tự nhận diện','data-mode="auto"','sub mode'+(mode==='auto'?' active':''))+
    chip('Không dùng preset','data-mode="off"','sub mode'+(mode==='off'?' active':''));

  // chip nhóm: manual -> nhóm đang chọn active; auto có nhận diện -> viền nét đứt
  const curGroupId=view?view.group.id:null;
  $('charmemAddrGroupChips').innerHTML=groups.map(g=>{
    const cls=(g.id===curGroupId)?(mode==='manual'?'active':(mode==='auto'?'detected':'')):'';
    return chip(g.label,`data-group="${_cmaEsc(g.id)}"`,cls);
  }).join('');

  // chip thể loại con
  const grp=view?view.group:null;
  const subWrap=$('charmemAddrSubWrap');
  if(grp&&grp.children&&grp.children.length){
    subWrap.style.display='';
    $('charmemAddrSubLbl').textContent='Thể loại con của "'+grp.label+'"';
    $('charmemAddrSubChips').innerHTML=[{id:grp.id,label:'Chung — '+grp.label}].concat(grp.children).map(n=>{
      const cls='sub'+(n.id===view.node.id?(mode==='manual'?' active':' detected'):'');
      return chip(n.label,`data-node="${_cmaEsc(n.id)}"`,cls);
    }).join('');
  } else {subWrap.style.display='none';$('charmemAddrSubChips').innerHTML='';}

  // dòng crumb + ghi chú
  const crumb=$('charmemAddrCrumb'),note=$('charmemAddrNote');
  const pathOf=v=>v.node.id===v.group.id?v.group.label:(v.group.label+' › '+v.node.label);
  note.textContent='';   // không hiện ghi chú phụ dưới ô thể loại (chỉ giữ dòng crumb bên phải tiêu đề)
  if(mode==='off')crumb.textContent='Không dùng preset';
  else if(mode==='manual')crumb.textContent=pathOf(view);
  else if(detected)crumb.textContent='Tự nhận diện: '+pathOf(view);
  else crumb.textContent='Chưa nhận diện được';

  // panel cặp: chỉ hiện khi có thể loại để chỉnh
  const has=!!view;
  $('charmemAddrAvoidPanel').style.display=has?'':'none';
  $('charmemAddrAddPanel').style.display=has?'':'none';
  $('charmemAddrListPanel').style.display=has?'':'none';
  const resetBtn=$('charmemAddrResetBtn');
  if(resetBtn){resetBtn.disabled=!has;resetBtn.style.opacity=has?'':'.45';}
  if(has){
    const pairs=view.node.pairs||[];
    $('charmemAddrCnt').textContent='('+pairs.length+')';
    $('charmemAddrPairList').innerHTML=pairs.length
      ?pairs.map((p,i)=>`<div class="charmem-addr-pair"><span data-i18n-skip>${_cmaEsc(p)}</span><button type="button" aria-label="Xoá" data-del="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`).join('')
      :'<div class="charmem-addr-empty">Chưa có cặp nào.</div>';
    _cmaSetHint('');
    const avoid=AP.avoidListOf(view.node.id);
    $('charmemAddrAvoidCnt').textContent='('+avoid.length+')';
    $('charmemAddrAvoidList').innerHTML=avoid.length
      ?avoid.map((w,i)=>`<button type="button" class="charmem-addr-chip sub" data-avoid-del="${i}" title="Bấm để xoá khỏi danh sách"><span data-i18n-skip>${_cmaEsc(w)}</span> ✕</button>`).join('')
      :'<div class="charmem-addr-empty">Chưa có từ nào — thể loại này không cấm từ nào.</div>';
    const ar=$('charmemAddrAvoidResetBtn');
    if(ar){const c=AP.avoidIsCustomized(view.node.id);ar.disabled=!c;ar.style.opacity=c?'':'.45';}
    _cmaSetAvoidHint('');
  }

  // dữ liệu nhân vật cũ lệch thể loại (chỉ tính khi preset có hệ xưng hô)
  const stalePanel=$('charmemAddrStalePanel');
  const r=AP.resolve(st.guidance,_cmaStoryKey());
  const stale=(r&&Array.isArray(S.characters))?AP.staleAddrChars(S.characters,r):[];
  if(stale.length){
    stalePanel.style.display='';
    const names=stale.slice(0,4).map(x=>x.char.name).join(', ')+(stale.length>4?'…':'');
    $('charmemAddrStaleText').textContent=stale.length+' nhân vật có xưng hô do AI lưu lệch thể loại ('+names+'). Chúng chỉ bị lọc khi dựng prompt; bấm dọn để xoá hẳn phần lệch (không đụng xưng hô bạn đã tự sửa), các chương sau sẽ tự điền lại đúng thể loại.';
  } else stalePanel.style.display='none';
}
function _cmaSetHint(text,kind){
  const h=document.getElementById('charmemAddrHint');
  if(!h)return;
  h.textContent=text;h.className='charmem-addr-hint'+(kind?' '+kind:'');
}
function cmAddrAddPair(){
  const st=_cmaState();
  const inp=document.getElementById('charmemAddrInput');
  if(!st||!st.viewId||!inp)return;
  const v=inp.value.trim();
  if(!v){_cmaSetHint('Chưa nhập gì — gõ dạng "A/B", VD: ta/ngươi.','err');return;}
  const res=st.AP.addPairs(st.viewId,v);
  if(!res.added.length&&!res.dup.length){_cmaSetHint('Sai định dạng — mỗi cặp phải là "A/B" (đúng 1 dấu gạch chéo, cả 2 vế không rỗng).','err');return;}
  inp.value='';
  renderCharMemAddrModal();
  if(res.bad.length)_cmaSetHint('Đã bỏ qua '+res.bad.length+' mục sai định dạng: '+res.bad.join(', ')+'.','err');
}
function _cmaSetAvoidHint(text,kind){
  const h=document.getElementById('charmemAddrAvoidHint');
  if(!h)return;
  h.textContent=text;h.className='charmem-addr-hint'+(kind?' '+kind:'');
}
function cmAddrAddAvoid(){
  const st=_cmaState();
  const inp=document.getElementById('charmemAddrAvoidInput');
  if(!st||!st.viewId||!inp)return;
  const v=inp.value.trim();
  if(!v){_cmaSetAvoidHint('Chưa nhập gì — gõ xưng hô cần tránh, VD: huynh.','err');return;}
  const res=st.AP.addAvoid(st.viewId,v);
  if(!res.added.length&&!res.dup.length){_cmaSetAvoidHint('Đây là ô cho TỪ đơn/cụm, không nhận dạng "A/B" — cặp hãy thêm ở ô "Thêm cặp mới".','err');return;}
  inp.value='';
  renderCharMemAddrModal();
  if(res.bad.length)_cmaSetAvoidHint('Đã bỏ qua '+res.bad.length+' mục dạng "A/B": '+res.bad.join(', ')+'.','err');
}
function cmAddrDeleteAvoid(idx){
  const st=_cmaState();
  if(!st||!st.viewId)return;
  const w=st.AP.avoidListOf(st.viewId)[idx];
  if(w==null)return;
  st.AP.removeAvoid(st.viewId,w);
  renderCharMemAddrModal();
}
function cmAddrResetAvoid(){
  const st=_cmaState();
  if(!st||!st.viewId)return;
  st.AP.resetAvoid(st.viewId);
  renderCharMemAddrModal();
}
function cmAddrDeletePair(idx){
  const st=_cmaState();
  if(!st||!st.view)return;
  const pair=(st.view.node.pairs||[])[idx];
  if(pair==null)return;
  st.AP.removePair(st.viewId,pair);
  renderCharMemAddrModal();
}
function cmAddrResetNode(){
  const st=_cmaState();
  if(!st||!st.viewId)return;
  showPopup({
    title:'Đặt lại thể loại này về mặc định?',
    msg:`Bộ cặp xưng hô và danh sách xưng hô cần tránh của <strong>${_cmaEsc(st.view.node.label)}</strong> sẽ về mặc định (cặp/từ bạn đã thêm hoặc xoá sẽ mất). Áp dụng cho mọi truyện dùng thể loại này.`,
    btns:[
      {label:'Huỷ'},
      {label:'Đặt lại',cls:'btn-p',cb:()=>{st.AP.resetNode(st.viewId);renderCharMemAddrModal();}}
    ]
  });
}
function cmAddrCleanStale(){
  const st=_cmaState();
  if(!st)return;
  const r=st.AP.resolve(st.guidance,_cmaStoryKey());
  const stale=r?st.AP.staleAddrChars(S.characters,r):[];
  if(!stale.length){renderCharMemAddrModal();return;}
  showPopup({
    title:'Dọn xưng hô lệch thể loại?',
    msg:`Sẽ xoá phần xưng hô lệch thể loại (theo <strong>${_cmaEsc(r.path)}</strong>) ở <strong>${stale.length}</strong> nhân vật. Chỉ động vào xưng hô do AI ghi, giữ nguyên cặp còn hợp thể loại và mọi xưng hô bạn đã tự sửa. Các chương sau sẽ tự điền lại.`,
    btns:[
      {label:'Huỷ'},
      {label:'Dọn',cls:'btn-p',cb:async()=>{
        stale.forEach(({char,changes})=>{
          Object.keys(changes).forEach(k=>{char[k]=changes[k].after||'';});
          if(!char.addrThemToMc&&!char.addrMcToThem&&char.addrTone&&char.addrTone!=='Chưa rõ')char.addrTone='Chưa rõ';
        });
        await saveCharacterMemory();
        renderCharList();
        renderCharMemAddrModal();
      }}
    ]
  });
}
(function initCharMemAddrModal(){
  const wire=()=>{
    const ov=document.getElementById('charmemAddrOverlay');
    if(!ov||ov.dataset.wired)return;
    ov.dataset.wired='1';
    ov.addEventListener('click',e=>{
      const t=e.target.closest('button');
      if(!t||!ov.contains(t))return;
      const AP=window.AddrPresets;
      if(!AP)return;
      const key=_cmaStoryKey();
      if(t.dataset.mode==='auto'){AP.setStoryChoice(key,null);renderCharMemAddrModal();try{charImgAutoSoon(300);}catch(e){}}
      else if(t.dataset.mode==='off'){AP.setStoryChoice(key,'off');renderCharMemAddrModal();try{charImgAutoSoon(300);}catch(e){}}
      else if(t.dataset.group){AP.setStoryChoice(key,t.dataset.group);renderCharMemAddrModal();try{charImgAutoSoon(300);}catch(e){}}
      else if(t.dataset.node){AP.setStoryChoice(key,t.dataset.node);renderCharMemAddrModal();try{charImgAutoSoon(300);}catch(e){}}
      else if(t.dataset.del!==undefined){cmAddrDeletePair(parseInt(t.dataset.del,10));}
      else if(t.dataset.avoidDel!==undefined){cmAddrDeleteAvoid(parseInt(t.dataset.avoidDel,10));}
      else if(t.id==='charmemAddrAvoidAddBtn')cmAddrAddAvoid();
      else if(t.id==='charmemAddrAvoidResetBtn'&&!t.disabled)cmAddrResetAvoid();
      else if(t.id==='charmemAddrAddBtn')cmAddrAddPair();
      else if(t.id==='charmemAddrResetBtn'&&!t.disabled)cmAddrResetNode();
      else if(t.id==='charmemAddrCleanBtn')cmAddrCleanStale();
    });
    document.getElementById('charmemAddrInput')?.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();cmAddrAddPair();}
    });
    document.getElementById('charmemAddrAvoidInput')?.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();cmAddrAddAvoid();}
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();

// ===== LƯU TRỮ (theo từng bộ truyện, VÀ theo ngôn ngữ ĐÍCH) =====
// Đích = vi: khoá/trường CŨ, không đổi byte nào (bk.characters, 'dich-charm:<fname>').
// Đích ≠ vi: thêm hậu tố '@<mã đích>' (bk['characters@th'], 'dich-charm:<fname>@th'...), để một truyện dịch sang nhiều đích
// không lẫn tên nhân vật. Mã đích được GHIM vào S._charTgt lúc nạp (xem _loadCharacterMemoryRaw) — nên việc đổi đích tạm
// không phát sự kiện (LangQA, phép thử Console) hay lượt lưu chạy sau khi đổi đích không ghi nhầm sang bộ của đích khác.
function _charTgtNow(){try{return (window.TargetLang&&window.TargetLang.code())||'vi';}catch(e){return 'vi';}}
function charmemTgt(){return (typeof S!=='undefined'&&S&&S._charTgt)||_charTgtNow();}
function charmemField(base,code){const c=code||charmemTgt();return c==='vi'?base:base+'@'+c;}
function charMemStorageKey(){return 'dich-charm:'+(S.fname||'__noname__')+(charmemTgt()==='vi'?'':'@'+charmemTgt());}
// ===================================================================
// ===== NHẬN DIỆN "TÊN" CHỈ LÀ NHÃN MÔ TẢ TẠM =====
// ===================================================================
// Khi 1 nhân vật xuất hiện lần đầu mà chương chưa nêu tên/biệt danh nào, buildCharExtractPrompt bắt
// model tự đặt 1 "name" mô tả để còn có khoá lưu trữ (VD "Nữ sinh tóc đen", "Tài xế xe buýt"). Đây
// vốn chỉ là nhãn TẠM, nhưng trước bản sửa này mergeAnalysisResults KHÔNG BAO GIỜ đổi lại c.name
// (ngoại lệ duy nhất là tên còn sót chữ Hán) -> khi chương sau lộ tên thật, tên thật chỉ được nhét
// vào aliases còn nhãn mô tả thì đóng băng vĩnh viễn làm tên chính. Cờ c.namePlaceholder (do model
// tự khai qua "isPlaceholderName") mở đúng 1 cửa hẹp để nâng cấp nhãn tạm -> tên thật.
//
// Hàm dưới đây là lưới kiểm tra CƠ HỌC đi kèm, theo đúng nguyên tắc "không tin AI tự khai, chỉ tin
// những gì đo/đếm được" dùng nhất quán trong file này. Dùng ở 2 chỗ:
// (1) backfill cho dữ liệu CŨ lưu từ trước bản sửa này (hoàn toàn không có cờ namePlaceholder, nếu
//     không backfill thì mọi nhãn mô tả đã lỡ lưu sẽ đóng băng mãi mãi);
// (2) chặn chiều ngược lại ở mergeAnalysisResults: dù model khai "isPlaceholderName":false, nếu tên
//     mới trả về NHÌN vẫn y như 1 nhãn mô tả thì KHÔNG cho ghi đè (tránh thay nhãn tạm này bằng
//     nhãn tạm khác, vừa vô nghĩa vừa làm mất khoá nhận diện đã ổn định qua nhiều chương).
// Cố tình chỉ liệt kê các từ CHUNG CHUNG không bao giờ là tên riêng Hán Việt/phương Tây thật, để
// giảm tối đa false positive — và kể cả có dính false positive thì hậu quả cũng chỉ là nhân vật đó
// ĐƯỢC PHÉP đổi tên 1 lần khi model tìm thấy tên thật khớp qua alias/originalName, chứ không tự đổi.
const CHARMEM_PLACEHOLDER_NAME_TOKENS=[
  // giới tính/nhóm tuổi chung chung
  'gã','kẻ','tên','thanh niên','trung niên','thiếu niên','thiếu nữ','lão giả','nam nhân','nữ nhân',
  'nam sinh','nữ sinh','cô gái','cô nương','chàng trai','đứa trẻ','đàn ông','phụ nữ','ông lão','bà lão','người',
  // nghề nghiệp/chức danh chung chung
  'tài xế','quản gia','lính gác','vệ sĩ','bảo vệ','cảnh sát','bác sĩ','y tá','phục vụ','tiếp viên',
  'hành khách','chủ quán','ăn mày','học sinh','sinh viên','giáo viên','nhân viên','công nhân',
  // đặc điểm ngoại hình hay bị dùng làm nhãn
  'tóc','mắt','râu','sẹo','xăm','áo','mập','gầy','béo'
];
const CHARMEM_PLACEHOLDER_NAME_PHRASES=['của ','người qua đường','không rõ tên','chưa rõ tên'];
function looksLikePlaceholderCharName(name){
  const t=(name||'').trim();
  if(!t)return false;
  // Tên còn sót chữ Hán thuộc luồng needsTranslation riêng — không đụng tới ở đây để 2 cơ chế sửa
  // tên không giẫm chân nhau.
  if(containsCJK(t))return false;
  const low=t.toLowerCase();
  if(CHARMEM_PLACEHOLDER_NAME_PHRASES.some(p=>low.includes(p)))return true;
  const tokens=low.split(/[\s,]+/).filter(Boolean);
  return CHARMEM_PLACEHOLDER_NAME_TOKENS.some(kw=>
    kw.includes(' ')?low.includes(kw):tokens.includes(kw));
}
// Lưới đỡ riêng cho ca "tên thật bị chôn trong note": ngay cả sau khi sửa prompt và mechanics ở
// trên, model vẫn có thể thỉnh thoảng đoán sai isPlaceholderName. Chính prompt (xem mẫu câu hợp lệ
// "tên thật là Lâm Mộ" ở buildCharExtractPrompt) đã dạy model ghi đúng mẫu này vào "note" khi phát
// hiện tên thật của 1 nhân vật đang mang nhãn mô tả tạm — chỉ là trước đây không ai đọc lại note để
// hành động. Hàm này quét note để bắt lại ca đó. Không tự động đổi tên (rủi ro parse sai tên từ câu
// văn tự do) — chỉ trả về ứng viên để nơi gọi đẩy vào diện nghi vấn (nameConflict) cho người dùng
// duyệt qua đúng cơ chế banner conflict đã có sẵn (xem CHARMEM_CONFLICT_CONFIG/applyCharConflict).
const CHARMEM_REAL_NAME_IN_NOTE_RE=/tên thật (?:là|:)\s*([^;,.\n]{1,20})/i;
function detectRealNameStuckInNote(c){
  if(!c||!c.namePlaceholder||!c.note)return null;
  const m=c.note.match(CHARMEM_REAL_NAME_IN_NOTE_RE);
  return m?m[1].trim():null;
}
// Gắn cờ namePlaceholder cho dữ liệu CŨ chưa từng có field này (xem giải thích ở trên). Chỉ chạy 1
// lần cho mỗi record: sau khi đã gắn (dù true hay false) thì field tồn tại, lần tải sau bỏ qua ngay
// — nghĩa là heuristic KHÔNG bao giờ ghi đè lại kết quả do model tự khai ở các chương sau. Không
// đụng tới record user đã tự sửa tên (nameSource==='user'), đúng nguyên tắc "user luôn ưu tiên hơn".
function backfillPlaceholderNameFlags(list){
  let changed=false;
  (list||[]).forEach(c=>{
    if(!c||typeof c.namePlaceholder!=='undefined')return;
    if(c.nameSource==='user'){c.namePlaceholder=false;changed=true;return;}
    c.namePlaceholder=looksLikePlaceholderCharName(c.name);
    changed=true;
    if(c.namePlaceholder)console.log(`[Luồng 1][Tên tạm] Đánh dấu "${c.name}" là NHÃN MÔ TẢ TẠM (dữ liệu cũ) — sẽ được phép đổi sang tên thật khi chương nào đó lộ tên.`);
  });
  return changed;
}
// VÁ RIÊNG cho dữ liệu CŨ dịch trước bản sửa nhánh "vá tên còn sót chữ Hán" ở mergeAnalysisResults
// (nhánh đó từng ép cứng namePlaceholder=false ngay khi tên hết chữ Hán, không kiểm tra xem bản dịch
// có vẫn chỉ là NHÃN MÔ TẢ hay không — VD "假警察" dịch thành "Giả Cảnh Sát" vẫn là nhãn mô tả, không
// phải tên riêng). Hậu quả: những record này có namePlaceholder=false SẴN (không phải undefined) nên
// backfillPlaceholderNameFlags ở trên bỏ qua, khiến tên thật lộ ra ở chương sau (VD "Trần Minh Dũng")
// mãi mãi chỉ nằm trong aliases mà không bao giờ thay được tên chính.
// Hàm này quét lại TOÀN BỘ record do AI tự quản lý (nameSource!=='user'), bất kể namePlaceholder hiện
// đang là gì: nếu c.name NHÌN vẫn giống 1 nhãn mô tả theo đúng lưới looksLikePlaceholderCharName mà cờ
// lại đang false, thì mở lại thành true — để nhánh nâng cấp nhãn tạm -> tên thật (mergeAnalysisResults)
// có cơ hội chạy đúng ở chương phân tích kế tiếp, thay vì tên mô tả cứ đóng băng vĩnh viễn. Không tự ý
// đổi c.name ở đây (không đủ căn cứ để chọn tên thật nào trong alias) — chỉ mở lại cờ, việc đổi tên
// thật sự vẫn để đúng luồng sẵn có (mergeAnalysisResults ở chương sau, hoặc banner nameConflict) lo.
function repairMisidentifiedPlaceholderNames(list){
  let changed=false;
  (list||[]).forEach(c=>{
    if(!c)return;
    if(c.nameSource==='user')return;
    if(c.namePlaceholder===true)return; // đã đúng là nhãn tạm rồi, không cần vá
    if(looksLikePlaceholderCharName(c.name)){
      c.namePlaceholder=true;
      changed=true;
      console.log(`[Luồng 1][Tên tạm] Vá dữ liệu cũ: mở lại cờ NHÃN MÔ TẢ TẠM cho "${c.name}" (trước đây bị nhánh vá tên Hán ép sai thành tên thật) — sẽ được phép đổi sang tên thật khi chương nào đó lộ tên.`);
    }
  });
  return changed;
}
// Cứu dữ liệu CŨ dịch từ trước bản sửa này: vì prompt cấm ghi nhãn "chính" vào relationship mà lại
// chưa có field "isProtagonist", model thường dồn thông tin đó vào "note" (VD "...; nhân vật chính")
// — nơi không có đoạn code nào đọc tới, nên ngôi sao không bao giờ được gắn. Ở đây tách note thành
// từng mệnh đề (ngăn bởi ; , xuống dòng) rồi so bằng CHÍNH isProtagonistLabel đang dùng ở mọi nơi
// khác. Nhờ so khớp TRỌN MỆNH ĐỀ nên "em trai của nhân vật chính" hay "kẻ thù của nhân vật chính"
// KHÔNG dính (chúng không bằng nhãn, chỉ chứa nhãn) — đúng thứ ta cần tránh.
// Chỉ chạy đúng 1 lần cho mỗi record (đánh dấu qua protagonistNoteScanned) và tuyệt đối không lật
// ngược quyết định của người dùng (protagonistDenied).
function backfillProtagonistFromNote(list){
  let changed=false;
  (list||[]).forEach(c=>{
    if(!c||c.protagonistNoteScanned)return;
    c.protagonistNoteScanned=true;
    changed=true;
    if(c.protagonistDenied||isCharProtagonist(c))return;
    const claimsProtagonist=(c.note||'').split(/[;\n]+/).some(seg=>isProtagonistLabel(seg));
    if(!claimsProtagonist)return;
    c.isProtagonist=true;
    console.log(`[Luồng 1][Nhân vật chính] Khôi phục đánh dấu cho "${c.name}" từ ghi chú cũ (dữ liệu dịch trước khi có field "isProtagonist").`);
  });
  return changed;
}
async function _loadCharacterMemoryRaw(){
  S._charTgt=_charTgtNow();   // ghim đích của bộ nhân vật đang nạp (lưu sẽ dùng đúng đích này)
  // [Fix gộp nhầm nhân vật giữa 2 truyện] Đang nạp: S.characters chưa phải dữ liệu của truyện này (loadTxt vừa đặt []),
  // nên _saveCharacterMemoryRaw không được ghi gì xuống tủ cho tới khi nạp xong (tránh ghi bộ rỗng/bộ truyện cũ đè lên).
  S._charReady=false;
  let list=[];
  let rejected=[];
  let mhist=[];
  if(libCurrentId){
    try{
      const bk=await libGet(libCurrentId);
      const fC=charmemField('characters'),fR=charmemField('charMergeRejected'),fH=charmemField('mergeHistory');
      list=(bk&&Array.isArray(bk[fC]))?bk[fC]:[];
      rejected=(bk&&Array.isArray(bk[fR]))?bk[fR]:[];
      mhist=(bk&&Array.isArray(bk[fH]))?bk[fH]:[];
    }catch(e){list=[];rejected=[];}
  } else {
    try{
      const v=localStorage.getItem(charMemStorageKey());
      list=v?JSON.parse(v):[];
    }catch(e){list=[];}
    try{
      const r=localStorage.getItem(charMemStorageKey()+':rejected');
      rejected=r?JSON.parse(r):[];
    }catch(e){rejected=[];}
  }
  S.characters=Array.isArray(list)?list:[];
  S.charMergeRejected=Array.isArray(rejected)?rejected:[];
  if(!libCurrentId){try{const m=localStorage.getItem(charMemStorageKey()+':mergehist');mhist=m?JSON.parse(m):[];}catch(e){mhist=[];}}
  S.mergeHistory=Array.isArray(mhist)?mhist:[];
  S._charReady=true;   // S.characters đã đúng là bộ của truyện đang mở -> cho phép lưu lại
  const cleaned=cleanupUnknownAddrValues(S.characters);
  const stdMigrated=migrateStandardRelAge(S.characters);   // chuyển độ tuổi/mối quan hệ cũ sang danh sách chuẩn
  const backfilled=backfillPlaceholderNameFlags(S.characters);
  const placeholderRepaired=repairMisidentifiedPlaceholderNames(S.characters);
  const starRescued=backfillProtagonistFromNote(S.characters);
  const origFilled=backfillOrigNames(S.characters);
  const genericCleaned=cleanupGenericOrigNames(S.characters);
  const origSingled=enforceSingleOrigNames(S.characters);   // Tên gốc chỉ 1 tên, tên thừa sang Tên gọi khác
  const formsFilled=ensureAllForms(S.characters);
  const sameAsFixed=ensureAllSameAs(S.characters,S.charMergeRejected);
  const edgesFixed=ensureAllEdges(S.characters);
  let origMerged=0;   // [Fix gộp nhầm] autoMergeSameOrigName không còn chạy lúc tải dữ liệu, chỉ chạy khi phân tích chương
  const dupSuffixFixed=normalizeDupSuffixes();
  try{const sa=scanSuspectAliases();if(sa.length)console.log(`[Luồng 1][Alias] ${sa.length} nhân vật còn alias là họ đơn lẻ / họ + chức danh (chờ người dùng Gỡ/Giữ): `+sa.map(x=>`${x.char.name}: ${x.aliases.join('|')}`).join('; '));}catch(e){}
  if(origMerged||dupSuffixFixed||cleaned||stdMigrated||backfilled||placeholderRepaired||starRescued||origFilled||genericCleaned||origSingled||formsFilled||sameAsFixed||edgesFixed)await saveCharacterMemory();
  if(document.getElementById('charmemDrawer'))renderCharList();
}
async function _saveCharacterMemoryRaw(){
  if(S._charReady===false)return;   // đang nạp bộ nhân vật của truyện vừa mở: chưa có gì đúng để ghi
  // [Fix gộp nhầm nhân vật giữa 2 truyện] KHÔNG dùng libCurrentId: libOpen() gán libCurrentId = truyện MỚI ngay từ đầu, còn S.characters
  // vẫn là bộ của truyện CŨ cho tới khi loadTxt() chạy (sau vài lần await). Nếu lúc đó có lượt lưu nào chạy (phân tích chương nền vừa xong,
  // tự gán token tên, tự gán ảnh...) thì bộ nhân vật truyện cũ bị ghi vào truyện mới. Dùng S.loadedBookId (truyện mà S thực sự chứa — cùng
  // cách saveSession làm) và chụp đồng bộ dữ liệu cần ghi ngay đây, trước mọi await.
  const saveId=(S.loadedBookId!==undefined)?S.loadedBookId:libCurrentId;
  const _chars=S.characters,_rej=S.charMergeRejected||[],_hist=S.mergeHistory||[];
  const _fC=charmemField('characters'),_fR=charmemField('charMergeRejected'),_fH=charmemField('mergeHistory');
  if(saveId){
    let bk=null;
    try{
      bk=await libGet(saveId);
      if(bk){bk[_fC]=_chars;bk[_fR]=_rej;bk[_fH]=_hist;await libPut(bk);return;}
    }catch(e){
      // Truyện đã nằm trong tủ mà IndexedDB lỗi: báo ĐÚNG nguyên nhân (thường là hết quota IndexedDB)
      // và KHÔNG ghi sang localStorage — dữ liệu nhân vật trong tủ chỉ có 1 nguồn thật là IndexedDB, ghi
      // thêm bản lệch sang localStorage chỉ làm nó đầy và che mất lỗi thật.
      console.warn('[Luồng 1][Lưu trữ] Lỗi lưu vào IndexedDB',e);
      if(typeof reportLibStorageError==='function')reportLibStorageError(e,'dữ liệu nhân vật');
      return;
    }
    // bk rỗng = không tìm thấy truyện trong tủ → rơi xuống localStorage như cũ.
  }
  try{
    localStorage.setItem(charMemStorageKey(),JSON.stringify(S.characters));
    localStorage.setItem(charMemStorageKey()+':rejected',JSON.stringify(S.charMergeRejected||[]));
    // [Fix] Nhật ký gộp là cơ sở của nút tách nên không được mất im lặng: đầy bộ nhớ thì thử ghi bản NGẮN HƠN (bỏ dần các lần gộp CŨ NHẤT,
    // giữ lần mới) thay vì bỏ cả nhật ký như trước. Bản trong bộ nhớ (S.mergeHistory) vẫn đầy đủ cho tới khi tải lại.
    {
      const hk=charMemStorageKey()+':mergehist',H=S.mergeHistory||[];
      try{localStorage.setItem(hk,JSON.stringify(H));}
      catch(e){
        let saved=false;
        for(let n=Math.floor(H.length/2);n>=1&&!saved;n=Math.floor(n/2)){
          try{localStorage.setItem(hk,JSON.stringify(H.slice(-n)));saved=true;console.warn(`[Luồng 1][Nhật ký gộp] Bộ nhớ trình duyệt đầy: chỉ lưu được ${n}/${H.length} lần gộp mới nhất.`);}catch(e2){}
        }
        if(!saved)console.warn('[Luồng 1][Nhật ký gộp] Bộ nhớ trình duyệt đầy: không lưu được nhật ký gộp — nút tách sẽ mất sau khi tải lại.');
      }
    }
  }catch(e){
    console.warn('[Luồng 1][Lưu trữ] Lỗi lưu vào localStorage (có thể do đầy dung lượng trình duyệt)',e);
    if(!_charMemSaveWarned&&typeof showInfoPopup==='function'){
      _charMemSaveWarned=true;
      showInfoPopup('Không lưu được dữ liệu nhân vật','Truyện này chưa nằm trong Thư viện nên dữ liệu nhân vật đang được lưu tạm bằng bộ nhớ nhỏ của trình duyệt (localStorage) và bộ nhớ này đã đầy, nên các thay đổi về nhân vật chưa được lưu lại. Hãy <strong>thêm bộ truyện này vào Thư viện</strong> để lưu ổn định hơn (Thư viện dùng IndexedDB, dung lượng lớn hơn nhiều), hoặc xoá bớt dữ liệu cũ.');
    }
  }
}

function newCharId(){return 'c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}

// Nhận diện các cách AI/người dùng có thể ghi để chỉ "nhân vật chính"
function isProtagonistLabel(text){
  // Bỏ phần chú thích trong ngoặc (VD "Bản thân(Nhân vật chính)", "Bản thân (MC)") trước khi so khớp
  // — AI hoặc dữ liệu cũ đôi khi ghi kèm chú thích thay vì đúng 1 trong các nhãn liệt kê bên dưới,
  // khiến so sánh === trực tiếp bị trượt và nhân vật chính không được nhận diện/ghim sao (bug cũ).
  const t=(text||'').trim().toLowerCase().replace(/\([^)]*\)/g,'').trim();
  return t==='chính'||t==='nhân vật chính'||t==='bản thân'||t==='chính mình'||t==='chính chủ';
}
// Nguồn sự thật DUY NHẤT để biết 1 nhân vật có đang được coi là "nhân vật chính" hay không — MỌI
// nơi khác trong file (sắp xếp, hiện ngôi sao, prompt gửi AI...) đều phải gọi qua hàm này thay vì
// tự viết lại điều kiện `c.isProtagonist||isProtagonistLabel(c.relationship)`, để đảm bảo cờ
// `protagonistDenied` (người dùng bấm huỷ ngôi sao — xem toggleProtagonistStar) LUÔN được tôn trọng
// ở khắp nơi, kể cả khi field "relationship" vẫn còn giá trị kiểu "Nhân vật chính" (do AI ghi hoặc
// còn sót lại từ trước khi bị bấm huỷ).
function isCharProtagonist(c){
  if(!c)return false;
  if(c.protagonistDenied)return false;
  return !!(c.isProtagonist||isProtagonistLabel(c.relationship));
}
// Người dùng bấm vào ngôi sao trên 1 nhân vật ĐANG được coi là nhân vật chính — dùng khi AI nhận
// định sai (VD 1 chương kể nhiều về 1 nhân vật phụ khiến AI tưởng đó là nhân vật chính). Khác với
// việc chỉ xoá "isProtagonist" (không đủ, vì relationship vẫn có thể còn giữ nhãn "Nhân vật chính"
// khiến isCharProtagonist() vẫn trả về true ở chương sau) — set thêm cờ "protagonistDenied" để tạm
// thời CHẶN, kể cả khi AI tiếp tục tự gán lại nhãn này cho nhân vật ở các chương sau.
// Cờ này gỡ theo 2 cách: (1) NGAY LẬP TỨC khi CHÍNH người dùng tự tay xác nhận lại (sửa modal, hoặc
// bấm "Áp dụng" gợi ý); (2) TỰ ĐỘNG nếu AI vẫn tiếp tục đề xuất "Nhân vật chính" cho người này ở đủ
// CHARMEM_PROTAGONIST_RECONFIRM_THRESHOLD chương KHÁC NHAU sau đó (xem noteProtagonistSignal) — vì
// người dùng xác nhận việc AI đoán sai nhân vật chính là RẤT HIẾM, nên bằng chứng lặp lại nhiều lần
// độc lập nhiều khả năng là chính lần bấm huỷ mới là nhầm, không phải AI.
const CHARMEM_PROTAGONIST_RECONFIRM_THRESHOLD=3;
// Ngưỡng đối xứng cho LẦN GÁN ĐẦU TIÊN (chưa từng bị huỷ, chưa từng được xác nhận) — tránh việc 1-2
// chương viết theo góc nhìn nhân vật phụ (ngoại truyện, chương xen kẽ...) khiến AI vội vàng gán nhãn
// "nhân vật chính" ngay từ 1 chương duy nhất. Thấp hơn ngưỡng reconfirm ở trên vì đây là lúc CHƯA ai
// từng xác nhận gì cả (không phải đang "lật ngược" 1 quyết định huỷ của người dùng), nên không cần
// bằng chứng nặng bằng — xem noteProtagonistSignal.
const CHARMEM_PROTAGONIST_FIRST_THRESHOLD=2;
// Ngưỡng CAO HƠN dành riêng cho trường hợp truyện ĐÃ CÓ SẴN 1 nhân vật chính khác — không tự động
// thay thế nhân vật chính cũ (người dùng có thể tự bấm huỷ ngôi sao nếu muốn), mà chỉ tự động đánh
// dấu THÊM (cùng lúc có thể có nhiều nhân vật chính, VD truyện đa tuyến/song nam song nữ chính) khi
// đủ bằng chứng lặp lại nhiều lần độc lập — cao hơn hẳn ngưỡng "chưa có ai" ở trên vì rủi ro sai lệch
// khi đã có 1 người ổn định rồi lớn hơn nhiều so với lúc chưa xác định ai cả.
const CHARMEM_PROTAGONIST_ADDITIONAL_THRESHOLD=5;
function toggleProtagonistStar(id,event){
  if(event){event.stopPropagation();event.preventDefault();}
  const c=S.characters.find(x=>x.id===id);
  if(!c)return;
  if(!isCharProtagonist(c)){
    // Chiều ngược lại (ngôi sao rỗng trên thẻ nhân vật): NGƯỜI DÙNG tự đặt làm nhân vật chính → coi như xác nhận,
    // gỡ cờ huỷ + xoá phiếu bầu. Không bỏ nhân vật chính khác (truyện đa tuyến có thể có nhiều NV chính).
    c.isProtagonist=true;
    c.protagonistDenied=false;
    c.protagonistReconfirmVotes=[];
    c.protagonistPendingVotes=[];
    saveCharacterMemory();
    renderCharList();
    return;
  }
  c.isProtagonist=false;
  c.protagonistDenied=true;
  c.protagonistReconfirmVotes=[]; // reset đếm phiếu bầu mỗi lần huỷ mới, không cộng dồn từ lần huỷ trước
  saveCharacterMemory();
  renderCharList();
}
// AI (trong applyCharField) đề xuất "relationship" mang nhãn nhân vật chính cho 1 nhân vật —
// gọi hàm này thay vì tự set c.isProtagonist=true trực tiếp, để xử lý đúng cả 2 trường hợp:
//  - Chưa bị huỷ (protagonistDenied=false, mặc định): áp dụng ngay như hành vi gốc.
//  - Đang bị huỷ: KHÔNG áp dụng ngay, chỉ "ghi phiếu" cho chapterIdx hiện tại (Set, không đếm trùng
//    2 lần cùng 1 chương dù applyCharField gọi hàm này nhiều lượt khác nhau trong 1 lần phân tích).
//    Đủ CHARMEM_PROTAGONIST_RECONFIRM_THRESHOLD chương KHÁC NHAU cùng đề xuất -> tự động gỡ huỷ.
function noteProtagonistSignal(c,isRelationship,newVal,chapterIdx){
  if(!isRelationship||!isProtagonistLabel(newVal))return;
  castProtagonistVote(c,chapterIdx);
}
// Lõi bỏ phiếu, tách riêng khỏi noteProtagonistSignal ở trên vì hiện có 2 NGUỒN tín hiệu khác nhau:
//  (1) relationship mang nhãn "Nhân vật chính" (chủ yếu do NGƯỜI DÙNG tự gõ qua modal, hoặc dữ liệu
//      cũ) — đi qua noteProtagonistSignal;
//  (2) field "isProtagonist" model trả về mỗi chương (xem buildCharExtractPrompt) — đi thẳng vào đây.
// Trước bản sửa này chỉ có nguồn (1), mà prompt lại CẤM model ghi nhãn "chính" vào relationship ->
// toàn bộ cơ chế bỏ phiếu bên dưới không bao giờ được kích hoạt bởi AI, nhân vật chính không bao giờ
// tự được đánh dấu dù đã dịch hàng chục chương (model dồn thông tin đó vào "note", nơi không ai đọc).
function castProtagonistVote(c,chapterIdx){
  if(!c)return;
  // Nhánh 1: nhân vật ĐANG bị huỷ ngôi sao -> hành vi cũ, không đổi (phiếu bầu khôi phục).
  if(c.protagonistDenied){
    if(typeof chapterIdx!=='number')return; // không có chapterIdx -> không đủ tin cậy để tính phiếu
    const votes=new Set(c.protagonistReconfirmVotes||[]);
    votes.add(chapterIdx);
    c.protagonistReconfirmVotes=[...votes];
    if(c.protagonistReconfirmVotes.length>=CHARMEM_PROTAGONIST_RECONFIRM_THRESHOLD){
      c.protagonistDenied=false;c.isProtagonist=true;c.protagonistReconfirmVotes=[];
      c.protagonistPendingVotes=[];
      console.log(`[Luồng 1][Nhân vật chính] Tự động khôi phục "Nhân vật chính" cho ${c.name} sau ${CHARMEM_PROTAGONIST_RECONFIRM_THRESHOLD} chương khác nhau AI đều xác nhận lại (dù trước đó đã bị huỷ ngôi sao).`);
    }
    return;
  }
  // Nhánh 2: đã được xác nhận là nhân vật chính từ trước -> AI tái xác nhận, không cần làm gì thêm.
  if(c.isProtagonist)return;
  // Nhánh 3: ứng viên MỚI, chưa từng được xác nhận và cũng chưa từng bị huỷ. Nếu không có chapterIdx
  // thì không đủ tin cậy để tính phiếu theo chương -> giữ hành vi cũ, gán ngay.
  if(typeof chapterIdx!=='number'){c.isProtagonist=true;return;}
  // Ngưỡng khác nhau tuỳ truyện đã có sẵn nhân vật chính khác hay chưa: chưa có ai thì cần ít bằng
  // chứng hơn (CHARMEM_PROTAGONIST_FIRST_THRESHOLD chương) để tránh 1-2 chương ngoại truyện/góc nhìn
  // phụ vội vàng cướp ngôi; đã có 1 người ổn định rồi thì cần NHIỀU hơn hẳn (CHARMEM_PROTAGONIST_
  // ADDITIONAL_THRESHOLD chương) mới tự động đánh dấu THÊM 1 nhân vật chính nữa — không bao giờ tự
  // động THAY THẾ nhân vật chính cũ, người dùng vẫn có thể tự bấm huỷ ngôi sao nếu AI đánh dấu sai.
  const hasExisting=S.characters.some(x=>x.id!==c.id&&isCharProtagonist(x));
  const threshold=hasExisting?CHARMEM_PROTAGONIST_ADDITIONAL_THRESHOLD:CHARMEM_PROTAGONIST_FIRST_THRESHOLD;
  const votes=new Set(c.protagonistPendingVotes||[]);
  votes.add(chapterIdx);
  c.protagonistPendingVotes=[...votes];
  if(c.protagonistPendingVotes.length>=threshold){
    c.isProtagonist=true;c.protagonistPendingVotes=[];
    console.log(`[Luồng 1][Nhân vật chính] Xác nhận "${c.name}" là nhân vật chính sau ${threshold} chương khác nhau AI đều đề xuất${hasExisting?' (đánh dấu THÊM, không thay thế nhân vật chính hiện có)':''}.`);
  }
}
// AI thỉnh thoảng không ghi đúng literal "Chưa rõ" như prompt yêu cầu mà lại ghi bừa 1 ký hiệu
// "rỗng" quen thuộc kiểu bảng biểu (VD "-", "n/a", "none", "không có"...) khi không xác định được
// giá trị. Nếu không bắt các trường hợp này, chuỗi đó sẽ bị coi là 1 giá trị "thật" (xem isUnknownVal/
// isAddrUnknown bên dưới) -> tự động lưu vào nhân vật, tự hiện trong modal, và (với field xưng hô)
// bị gửi kèm vào prompt dịch (buildCharacterContextText) như 1 chỉ định xưng hô có thật dù chẳng có ý nghĩa gì.
// Dùng so khớp theo pattern thay vì so đúng nguyên văn "-" để bắt luôn các biến thể dài hơn (--, —, ...).
function isPlaceholderJunk(w){
  // Bỏ dấu chấm/ngoặc/khoảng trắng thừa ở 2 đầu (VD "Chưa rõ.", "(chưa rõ)") rồi so KHÔNG phân biệt hoa/thường:
  // "Chưa rõ" / "chưa rõ" / "CHƯA RÕ" / "chưa rõ tuổi" đều là "chưa có dữ liệu" (bug cũ: chỉ bắt đúng "Chưa rõ" viết hoa
  // nên "chưa rõ" viết thường lọt qua và ghi đè mất độ tuổi đã lưu).
  const t=(w||'').normalize('NFC').trim().toLowerCase().replace(/^[\s(\[{"“'‘]+|[\s)\]}"”'’.。!,;:]+$/g,'');
  if(!t)return true;
  if(/^[-–—_.…]+$/.test(t))return true; // chỉ gồm dấu gạch/chấm, không chữ nào khác
  if(/^(chưa|không|ko|khong|chua)\s+(rõ|ro|xác định|xac dinh|biết|biet|có|co)(\s+(thông tin|thong tin|tuổi|tuoi|độ tuổi|do tuoi|giới tính|gioi tinh|quan hệ|quan he|mối quan hệ|xưng hô))?$/.test(t))return true;
  return ['n/a','na','none','null','unknown','?','...','chưa rõ','chua ro','không rõ','chưa xác định','không xác định'].includes(t);
}
// Coi 1 field dạng "1 giá trị duy nhất" (gender/relationship/statusCue/addrTone — khác field xưng hô
// nhiều-lựa-chọn, xem isAddrUnknown) là "chưa có dữ liệu" nếu rỗng, bằng "Chưa rõ", hoặc là 1 trong
// các ký hiệu "rỗng" mà AI hay lỡ ghi (xem isPlaceholderJunk) — có chuẩn hoá NFC trước khi so sánh
// để không bị lệch bởi encoding Unicode khác nhau (xem giải thích ở isAddrUnknown/cleanupUnknownAddrValues).
function isUnknownVal(v){
  const t=(v||'').normalize('NFC').trim();
  return !t||isPlaceholderJunk(t);   // isPlaceholderJunk đã gồm "Chưa rõ" (mọi kiểu hoa/thường)
}

// ===== SẮP XẾP DANH SÁCH =====
// Bậc quan hệ: 0 = nhân vật chính, 1 = người thân/bạn bè thân thiết, 2 = quan hệ khác đã rõ, 3 = chưa rõ quan hệ
const CHARMEM_FAMILY_KW=['cha','mẹ','ba','má','bố','con','anh','em','chị','vợ','chồng','ông','bà','cô','dì','chú','bác','cậu','mợ','cháu','gia đình','họ hàng','người thân','huyết thống','ruột thịt','thúc','di nương','sư nương','nương tử','phu quân','thê tử'];
const CHARMEM_FRIEND_KW=['bạn','bằng hữu','huynh đệ','tỷ muội','huynh muội','tri kỷ','đồng đội','chiến hữu','bạn thân','thanh mai trúc mã','đạo hữu','sư huynh','sư tỷ','sư đệ','sư muội'];
function relCloseness(c){
  if(isCharProtagonist(c))return 0;
  const r=(c.relationship||'').trim().toLowerCase();
  if(isUnknownVal(r))return 3;
  if(CHARMEM_FAMILY_KW.some(k=>r.includes(k))||CHARMEM_FRIEND_KW.some(k=>r.includes(k)))return 1;
  return 2;
}
// Điểm đầy đủ thông tin: càng nhiều field đã biết thì điểm càng cao, xếp trước
function charInfoScore(c){
  let s=0;
  if(!isUnknownVal(c.gender))s++;
  if(!isUnknownVal(c.relationship))s++;
  if(c.note&&c.note.trim())s++;
  if(c.aliases&&c.aliases.length)s++;
  return s;
}
// Số lần nhân vật được nhắc tới (số chương đã xuất hiện) — càng nhiều càng quen thuộc, xếp trước.
// Từ bản này, số chương xuất hiện được lưu vào c.mentionChapters (mảng index chương, không trùng
// lặp) thay vì 1 con số cộng dồn đơn thuần — nhờ vậy dịch lại 1 chương (doRetranslate) không làm
// tăng ảo số lần xuất hiện. c.mentionCount (bản cũ) vẫn được đọc lại để tương thích ngược với dữ
// liệu đã lưu trước đây, cho tới khi nhân vật đó được phân tích lại lần đầu theo cơ chế mới.
function charMentionCount(c){
  if(Array.isArray(c.mentionChapters))return c.mentionChapters.length;
  return c.mentionCount||0;
}
// Giới hạn số nhân vật gửi kèm lên AI mỗi lần phân tích chương, để tránh payload phình to (tốn
// token/chi phí) khi truyện có rất nhiều nhân vật qua hàng trăm chương. Ưu tiên: nhân vật chính,
// rồi nhân vật vừa xuất hiện gần đây nhất, rồi nhân vật xuất hiện nhiều nhất — đây là nhóm nhân
// vật AI cần "nhớ đúng" nhất để dịch nhất quán chương hiện tại; nhân vật rất phụ, lâu không xuất
// hiện, ít thông tin thì bỏ bớt khỏi ngữ cảnh gửi đi (vẫn được LƯU đầy đủ, chỉ không gửi lên AI).
// ===================================================================
// ===== TÊN GỐC CỦA NHÂN VẬT (c.origName) =====
// ===================================================================
// c.origName = cách viết của nhân vật TRONG BẢN GỐC (chữ Hán nếu truyện gốc là tiếng Trung). CHỈ CHO PHÉP 1 TÊN:
// các cách viết khác (tên gộp thêm sau, tên AI trả thêm...) KHÔNG vào origName mà vào "Tên gọi khác" (c.aliases) —
// xem setOrigNameSingle / enforceSingleOrigNames. (Dữ liệu cũ có nhiều tên được tự chuyển khi tải.) Mọi chỗ origName xuất hiện trong văn bản (bản gốc hiển thị,
// bản gốc gửi đi dịch, bản gốc gửi đi phân tích nhân vật) đều được THAY bằng c.name (tên đã dịch) —
// xem applyCharNameSubstitution — nên người dùng chỉ cần sửa c.name là toàn bộ tên trong bản gốc đổi
// theo, và AI dịch luôn gặp 1 tên duy nhất cho 1 nhân vật thay vì tự phiên âm nhiều kiểu khác nhau.
// Việc thay chỉ diễn ra trên văn bản lúc dùng, KHÔNG sửa nội dung chương đã lưu.
// BẤT BIẾN: mọi origName luôn có mặt cả trong c.aliases để toàn bộ code tra cứu theo tên/alias sẵn có
// (findCharByNameOrAlias, scanMentionedCharIds, merge...) tiếp tục hoạt động y như cũ; riêng ô "Tên gọi
// khác" trong modal ẩn các origName đi (xem charAliasesWithoutOrig) để không hiện trùng 2 nơi.
function parseOrigNames(v){
  const arr=Array.isArray(v)?v:String(v||'').split(',');
  const out=[];
  arr.forEach(x=>{
    const t=String(x||'').trim();
    if(t&&!out.some(o=>o.toLowerCase()===t.toLowerCase()))out.push(t);
  });
  return out;
}
function charOrigNameList(c){return parseOrigNames(c&&c.origName);}
function charAliasesWithoutOrig(c){
  const orig=new Set(charOrigNameList(c).map(n=>n.toLowerCase()));
  return (c.aliases||[]).filter(a=>!orig.has(String(a||'').trim().toLowerCase()));
}
function ensureOrigInAliases(c){
  const have=new Set((c.aliases||[]).map(a=>String(a||'').trim().toLowerCase()));
  const nameKey=String(c.name||'').trim().toLowerCase();
  const add=charOrigNameList(c).filter(n=>!have.has(n.toLowerCase())&&n.toLowerCase()!==nameKey);
  if(add.length)c.aliases=[...(c.aliases||[]),...add];
}
// Kiểm tra tên gốc do model/alias đề xuất TRƯỚC khi lưu vào c.origName. Lý do: origName bị thay TOÀN BỘ
// trong bản gốc (applyCharNameSubstitution) nên 1 giá trị sai (model bịa, nhầm tên người khác, dùng
// cách gọi chung như "师兄") sẽ làm hỏng văn bản gửi đi dịch ở mọi chương, và chỉ sửa được khi người
// dùng tự phát hiện. Mỗi cách viết (cách nhau bởi dấu phẩy) được kiểm RIÊNG, cái nào đạt mới giữ:
//  (1) tối thiểu 2 ký tự (tên Hán 2 ký tự là bình thường, chỉ loại tên 1 ký tự);
//  (2) KHÔNG thuộc nhân vật KHÁC (trùng name/aliases/origName của người khác — trừ selfChar và excludeChars,
//      vd các record cùng tên khác giới tính vừa được xét ở mergeAnalysisResults);
//  (3) srcText là chuỗi (có truyền văn bản chương): phải xuất hiện NGUYÊN VĂN trong văn bản đó (không phân
//      biệt hoa/thường; tên Latin phải đứng riêng thành 1 từ, đúng như lúc thay thế) — HOẶC đã nằm sẵn
//      trong aliases của chính nhân vật này (đã ghi nhận từ chương trước, vd nhân vật còn sót chữ Hán
//      được dịch lại thì tên Hán cũ không còn trong văn bản chương này). srcText=null: bỏ qua bước (3).
// Trả về chuỗi các cách viết đạt, cách nhau bởi ", " (rỗng nếu không cái nào đạt).
function sanitizeOrigNameCandidate(cand,selfChar,srcText,excludeChars,opts){
  const allowLabel=!!(opts&&opts.allowLabel);
  const list=parseOrigNames(cand);
  if(!list.length)return '';
  const nk=v=>String(v||'').normalize('NFC').trim().toLowerCase();
  const skip=new Set([selfChar,...(excludeChars||[])].filter(Boolean));
  const others=new Set();
  (S.characters||[]).forEach(x=>{
    if(skip.has(x))return;
    [x.name,...(x.aliases||[]),...charOrigNameList(x)].forEach(v=>{const k=nk(v);if(k)others.add(k);});
  });
  const own=new Set(selfChar?[selfChar.name,...(selfChar.aliases||[])].map(nk).filter(Boolean):[]);
  const text=typeof srcText==='string'?srcText.normalize('NFC').toLowerCase():null;
  const wordCh=/[a-zA-ZÀ-ỹ\u0300-\u036f0-9_]/;
  const inText=k=>{
    if(text===null)return true;
    let i=0,guard=0;
    while(guard++<500&&(i=text.indexOf(k,i))!==-1){
      if(containsCJK(k))return true;
      const prev=i>0?text[i-1]:'',next=i+k.length<text.length?text[i+k.length]:'';
      if(!(prev&&wordCh.test(prev))&&!(next&&wordCh.test(next)))return true;
      i+=k.length;
    }
    return false;
  };
  const ok=[];
  list.forEach(n=>{
    const k=nk(n);
    let why='';
    if(k.length<2)why='dưới 2 ký tự';
    else if(isGenericAddressTerm(n))why='danh xưng chung nhiều người dùng (sẽ thay nhầm cả 大师兄/二师兄...)';
    else if(!allowLabel&&isDescriptiveLabel(n))why='nhãn mô tả, không phải tên riêng (nhân vật này đã có tên thật)';
    else if(!allowLabel&&isRoleWordForm(n))why='tên + vai vế/biệt danh (bản gốc gọi thế nào thì giữ thế đó, không thay bằng tên thật)';
    else if(others.has(k))why='trùng tên/alias của nhân vật khác';
    else if(!own.has(k)&&!inText(k))why='không xuất hiện nguyên văn trong văn bản chương';
    if(why)console.log(`[Luồng 1][Tên gốc] Bỏ qua tên gốc đề xuất \"${n}\"${selfChar?` cho \"${selfChar.name}\"`:''}: ${why}.`);
    else ok.push(n);
  });
  return ok.join(', ');
}
// ===== DANH XƯNG CHUNG / NHÃN MÔ TẢ — KHÔNG được làm tên gốc =====
// origName bị THAY TOÀN CỤC trong văn bản gửi đi, nên 1 danh xưng dùng cho nhiều người (师兄, 少爷, 老板...)
// làm origName sẽ biến mọi người mang danh xưng đó thành cùng 1 nhân vật, và vì chữ Hán không có ranh giới từ
// nên 师兄 còn nằm trong 大师兄/二师兄 -> "大Lý Minh". Hai lớp chặn:
//  (1) isGenericAddressTerm: danh xưng/chức danh/quan hệ thuần túy (kể cả có tiền tố thứ bậc 大/二/三/小/老)
//      -> luôn bị loại khỏi origName (người dùng vẫn tự điền được, khi đó code tôn trọng ý bạn).
//  (2) isDescriptiveLabel: nhãn mô tả "<đặc điểm> + <loại người>" (金发青年, 黑衣男子) -> chỉ nhận làm origName khi
//      nhân vật đang là NHÃN TẠM (đó chính là nhãn của họ); nhân vật đã có tên thật thì loại.
const CHARMEM_GENERIC_CJK_TERMS=new Set([
  '师兄','师弟','师姐','师妹','师父','师傅','师尊','师叔','师伯','师祖','师哥','师娘','师兄弟','师姐妹',
  '少爷','小姐','公子','老爷','夫人','太太','娘子','相公','姑娘','先生','老师','教授','医生','大夫','护士','警察','警官',
  '掌柜','老板','店主','东家','管家','伙计','小二','前辈','晚辈','道友','道长','大人','陛下','殿下','娘娘','皇上','太子',
  '队长','团长','老大','头儿','首领','长老','掌门','宗主','门主','教主','盟主','帮主','城主','家主','族长',
  '哥','哥哥','姐','姐姐','弟','弟弟','妹','妹妹','爸','爸爸','妈','妈妈','父亲','母亲','爹','娘','爷爷','奶奶','叔叔','阿姨','舅舅','叔','伯','舅','姨','嫂','婶','姑姑','伯父','叔父','舅父','伯母','婶婶',
  '父皇','母后','儿子','女儿','孩子','丈夫','妻子','老公','老婆','朋友','同学','同事','邻居','客人','主人','仆人','下人',
  '男人','女人','男子','女子','少年','少女','青年','老者','老头','老人','小孩','大汉','汉子','壮汉','妇人','女孩','男孩','美女','帅哥',
  '那人','此人','对方','来人','众人','他','她','它','你','我','自己'
]);
const CHARMEM_GENERIC_CJK_MODIFIERS='大二三四五六七八九十小老';
const CHARMEM_KIN_ADDRESS_CHARS='哥姐弟妹爸妈爹娘';
const CHARMEM_LABEL_SUFFIXES=['中年人','年轻人','青年','少年','少女','男子','女子','男人','女人','老者','老头','老人','大汉','汉子','壮汉','妇人','女孩','男孩','小孩','师兄','师弟','师姐','师妹','公子','姑娘','老板','警察','医生','护士'];
// Phiên âm/Hán Việt của danh xưng chung — dùng cho kiểm alias (sinoAlias là chữ Việt).
const CHARMEM_GENERIC_VI_TERMS=new Set(['sư huynh','sư đệ','sư tỷ','sư muội','sư phụ','sư tôn','sư thúc','sư bá','công tử','tiểu thư','lão gia','phu nhân','cô nương','chưởng quỹ','đạo hữu','tiền bối','đại nhân','bệ hạ','điện hạ','lão đại','đội trưởng','sư huynh đệ','đại ca','nhị ca','tam ca','tứ ca','đại tỷ','nhị tỷ','tam tỷ','đại huynh','nhị huynh','đại ca ca','ca ca','tỷ tỷ','muội muội','đệ đệ','tiểu đệ','tiểu muội','huynh trưởng','huynh đệ','thúc','bá','chú','bác','cậu','dì','thím','mợ','dượng','thúc thúc','bá phụ','thúc phụ']);
// "Tên + vai vế / biệt danh" của ĐÚNG 1 người (Lưu thúc, 刘叔, 老刘, Vương sát thủ, Uncle Wang, chú Ba...): đây là CÁCH GỌI mà bản gốc
// dùng, KHÔNG phải tên riêng -> không bao giờ được thay bằng tên thật (applyCharNameSubstitution). Hàm thuần.
const CHARMEM_ROLE_SUFFIX_CJK='叔伯舅姨哥姐弟妹爷婆嫂婶姑';
const CHARMEM_ROLE_SUFFIX_VI=new Set(['thúc','bá','chú','bác','cậu','dì','thím','mợ','dượng','ca','huynh','đệ','tỷ','muội','cô','ông','bà','lão']);
const CHARMEM_ROLE_SUFFIX_VI_STRONG=new Set(['ca','huynh','đệ','tỷ','muội']);   // viết hoa cuối vẫn là vai vế
const CHARMEM_ROLE_PREFIX_VI=new Set(['lão','tiểu','a','chú','bác','cậu','dì','thím','mợ','cô','ông','bà','sư','tiền']);
const CHARMEM_ROLE_PREFIX_EN=/^(uncle|aunt|auntie|brother|sister|master|elder|old|little|big|senior|junior|grandpa|grandma|mr\.?|mrs\.?|ms\.?|miss|sir|lord|lady|boss)\s+\S/i;
function isRoleWordForm(v){
  const t=String(v||'').normalize('NFC').trim();
  if(t.length<2)return false;
  if(containsCJK(t)){
    if(t.length<=4&&CHARMEM_ROLE_SUFFIX_CJK.includes(t[t.length-1]))return true;   // 刘叔, 李哥, 王姐, 张大哥
    if(/^[小阿老][\u3400-\u9fff]{1,2}$/.test(t))return true;                        // 老刘, 小明, 阿强
    return false;
  }
  if(CHARMEM_ROLE_PREFIX_EN.test(t))return true;
  if(charmemGeneric())return false;
  const toks=t.split(/\s+/);
  if(toks.length<2)return false;
  const first=toks[0],last=toks[toks.length-1];
  if(CHARMEM_ROLE_PREFIX_VI.has(first.toLowerCase()))return true;
  const ll=last.toLowerCase();
  if(CHARMEM_ROLE_SUFFIX_VI.has(ll)&&(last===ll||CHARMEM_ROLE_SUFFIX_VI_STRONG.has(ll)))return true;   // "Lưu thúc", "Minh ca"
  return false;
}
function isGenericAddressTerm(v){
  const t=String(v||'').normalize('NFC').trim();
  if(!t)return false;
  if(CHARMEM_GENERIC_VI_TERMS.has(t.toLowerCase()))return true;
  if(!containsCJK(t))return false;
  if(CHARMEM_GENERIC_CJK_TERMS.has(t))return true;
  // Tiền tố thứ bậc/tuổi: 大师兄, 二师兄, 小少爷, 老板 (đã có trong tập)...
  if(t.length>=3&&CHARMEM_GENERIC_CJK_MODIFIERS.includes(t[0])&&CHARMEM_GENERIC_CJK_TERMS.has(t.slice(1)))return true;
  // Xưng hô 2 ký tự = tiền tố thứ bậc + 1 chữ vai vế (大哥, 二哥, 大姐, 小弟, 老爹, 大娘...): trước đây lọt vì điều kiện length>=3 ở trên.
  if(t.length===2&&CHARMEM_GENERIC_CJK_MODIFIERS.includes(t[0])&&CHARMEM_KIN_ADDRESS_CHARS.includes(t[1]))return true;
  return false;
}
// ALIAS LÀ XƯNG HÔ/VAI VẾ THUẦN (sư huynh, đại sư huynh, đệ tử, quán chủ, thiếu niên, 大弟子, 观主...): dùng chung cho nhiều người nên KHÔNG
// được làm alias nhận diện (gây khớp/gộp nhầm). Khác isGenericAddressTerm: bắt thêm tiền tố thứ bậc tiếng Việt (đại/nhị/tiểu/lão + từ vai vế)
// và nhóm chức danh/độ tuổi. Chuỗi có TÊN + vai vế (Thanh Phong sư huynh, 冲云道长, Trần Tiến Sĩ) KHÔNG bị bắt — đó là biệt danh của đúng 1 người.
const CHARMEM_ROLE_ALIAS_VI=new Set([...CHARMEM_GENERIC_VI_TERMS,'đệ tử','đồ đệ','học trò','môn đồ','quán chủ','quan chủ','đạo nhân','đạo sĩ','đạo đồng','đạo trưởng','chưởng môn','trưởng lão','hậu bối','vãn bối','huynh','đệ','tỷ','muội','ca','tiên sinh','phụ thân','mẫu thân','cha','mẹ','nương','ngoại công','ông ngoại','ông nội','bà nội','bà ngoại','thiếu niên','thiếu nữ','thanh niên','trung niên','lão giả','lão nhân','sư tổ','sư bá','tiểu sư thúc',
  // [Fix gộp nhầm] "bạn"/"bằng hữu"... là quan hệ chung của nhiều người, không được làm alias nhận diện.
  'bạn','bạn thân','bạn bè','bạn cũ','bằng hữu','đồng môn']);
const CHARMEM_ROLE_ALIAS_CJK=new Set(['弟子','观主','道人','道童','道士','师叔','师伯','师祖','掌教','真人','上人','前辈','后辈','晚辈','大师','少年','少女','青年','中年','老者','师兄','师弟','师姐','师妹','师父','外公','外婆','祖父','祖母','徒弟','门徒','朋友','好友','同门']);
// [Fix gộp nhầm] HỌ ĐƠN LẺ / HỌ + CHỨC DANH làm alias ("Lý", "杨", "杨公", "Lão Lý", "老李"): nhiều người cùng họ, nên KHÔNG được làm alias
// nhận diện (khoá khớp record) — alias kiểu này là nguồn gộp nhầm "hai người xa lạ / chỉ trùng họ". Chỉ chặn ALIAS; tên chính và tên gốc
// của chính nhân vật vẫn được giữ (purgeRoleAliases luôn giữ c.name + origName).
const CHARMEM_VI_SURNAMES=new Set(['lý','dương','trương','lưu','trần','vương','hoàng','triệu','ngô','chu','từ','tôn','mã','hồ','quách','hà','cao','lâm','la','trịnh','lương','tạ','tống','đường','hứa','hàn','phùng','đặng','tào','bành','tăng','tiêu','điền','đổng','viên','phan','vu','tưởng','thái','dư','đỗ','diệp','trình','tô','ngụy','lữ','đinh','nhậm','thẩm','diêu','lô','khương','thôi','chung','đàm','lục','uông','phạm','kim','thạch','liêu','giả','hạ','vi','phó','phương','bạch','trâu','mạnh','hùng','tần','khâu','giang','doãn','tiết','diêm','đoàn','lôi','hầu','long','sử','đào','lê','cố','mao','hác','cung','thiệu','vạn','tiền','nghiêm','vũ','đới','mạc','khổng','hướng','thang','nguyễn']);
// Họ tiếng Việt trùng từ/tên riêng thông dụng: chỉ dùng cho quét banner (suspectAliasesOf); khóa khớp record vẫn chặn (an toàn hơn).
const CHARMEM_VI_SURNAMES_AMBIG=new Set(['hà','kim','long','phương','lâm','cao','la','hùng','mạnh','đào','thái','tô','hạ','vi','tiền','giang','thạch','chung','tiêu','tăng','bạch','lục','hầu','cố','viên','phó','vạn','đường','hướng','thang','mạc']);
function isBareSurnameAlias(v){
  const t=String(v||'').normalize('NFC').trim();
  if(!t)return false;
  if(containsCJK(t)){
    if(t.length===1)return true;   // 1 chữ Hán: họ hoặc 1 chữ của tên, không đủ định danh 1 người
    if(t.length<=3&&CHARMEM_COMMON_SURNAMES.includes(t[0])&&CHARMEM_GENERIC_CJK_TERMS.has(t.slice(1)))return true;   // 杨公, 李师兄
    if(t.length===2&&/^[小阿老]/.test(t)&&CHARMEM_COMMON_SURNAMES.includes(t[1]))return true;                       // 老李, 小杨
    return false;
  }
  if(charmemGeneric())return false;   // đích ≠ vi: không áp bảng họ tiếng Việt
  const toks=t.toLowerCase().split(/\s+/).filter(Boolean);
  if(toks.length===1)return CHARMEM_VI_SURNAMES.has(toks[0]);                                                      // Lý, Dương
  if(toks.length===2){
    if(CHARMEM_VI_SURNAMES.has(toks[0])&&(CHARMEM_ROLE_ALIAS_VI.has(toks[1])||CHARMEM_GENERIC_VI_TERMS.has(toks[1])))return true;   // Dương công, Lý sư huynh (1 từ vai vế)
    if(['lão','tiểu','a'].includes(toks[0])&&CHARMEM_VI_SURNAMES.has(toks[1]))return true;                          // Lão Lý, Tiểu Dương
  }
  if(toks.length===3&&CHARMEM_VI_SURNAMES.has(toks[0])&&CHARMEM_ROLE_ALIAS_VI.has(toks[1]+' '+toks[2]))return true;  // Lý sư huynh (2 từ)
  return false;
}
function isRoleAddressAlias(v){
  const t=String(v||'').normalize('NFC').trim();
  if(!t)return false;
  if(isGenericAddressTerm(t))return true;
  if(isBareSurnameAlias(t))return true;
  if(containsCJK(t)){
    if(CHARMEM_ROLE_ALIAS_CJK.has(t))return true;
    return t.length>=3&&CHARMEM_GENERIC_CJK_MODIFIERS.includes(t[0])&&CHARMEM_ROLE_ALIAS_CJK.has(t.slice(1));
  }
  if(charmemGeneric())return false;   // đích ≠ vi: 'cha','ca','huynh'... có thể là biệt danh thật, không coi là xưng hô chung
  const low=t.toLowerCase().replace(/\s+/g,' ');
  return CHARMEM_ROLE_ALIAS_VI.has(low)||CHARMEM_ROLE_ALIAS_VI.has(_stripViModifier(low));
}
// Gỡ alias xưng hô/vai vế thuần khỏi 1 nhân vật. Giữ: tên chính, mọi tên gốc, và toàn bộ alias nếu người dùng đã tự sửa ô "Tên gọi khác".
function purgeRoleAliases(c){
  if(!c||!Array.isArray(c.aliases)||c.aliasesSource==='user')return false;
  const keep=new Set([c.name,...charOrigNameList(c)].map(x=>normKey(String(x||'').normalize('NFC'))).filter(Boolean));
  const drop=c.aliases.filter(a=>!keep.has(normKey(String(a||'').normalize('NFC')))&&isRoleAddressAlias(a));
  if(!drop.length)return false;
  c.aliases=c.aliases.filter(a=>!drop.includes(a));
  console.log(`[Luồng 1][Alias] Gỡ alias là xưng hô/vai vế khỏi "${c.name}": ${drop.join(', ')}`);
  return true;
}
// [P3] Quét alias CŨ (dữ liệu lưu trước bản vá): alias là họ đơn lẻ / họ + chức danh (杨, 杨公, Lão Lý, Lý sư huynh...) của 1 record.
// KHÔNG tự gỡ (có thể là tên riêng thật như Hà, Kim, Long): chỉ liệt kê để banner hỏi người dùng Gỡ / Giữ.
// Bỏ qua: tên chính, tên gốc, alias người dùng đã tự sửa (aliasesSource==='user'), alias người dùng đã bấm Giữ (c.aliasKeep),
// alias đã được bước Kiểm tra lại phân loại 'proper'/'nickname' (c.forms[].aiKind) hoặc người dùng đã khoá loại name/nickname.
function suspectAliasesOf(c){
  if(!c||!Array.isArray(c.aliases)||c.aliasesSource==='user')return [];
  const nk=x=>normKey(String(x||'').normalize('NFC'));
  const keep=new Set([c.name,...charOrigNameList(c)].map(nk).filter(Boolean));
  const kept=new Set((c.aliasKeep||[]).map(nk));
  // Bước "Kiểm tra lại" (applyRecheckKinds) đã phân loại từng cách gọi theo NGHĨA và ghi vào c.forms[].aiKind. 'proper'/'nickname' =
  // model đã xác nhận chuỗi này chỉ đúng 1 người (VD 陈老师 là biệt danh của 陈冬锡) -> KHÔNG hỏi lại. Người dùng đã tự khoá loại
  // (kindLocked) là 'name'/'nickname' cũng vậy. Chỉ còn nghi vấn khi chưa có phán quyết, hoặc phán quyết là 'title_or_relation'.
  (Array.isArray(c.forms)?c.forms:[]).forEach(fm=>{
    if(!fm||!fm.text)return;
    if(fm.aiKind==='proper'||fm.aiKind==='nickname'||(fm.kindLocked&&(fm.kind==='name'||fm.kind==='nickname')))kept.add(nk(fm.text));
  });
  // Họ tiếng Việt trùng tên riêng (Hà, Kim, Long...): chỉ nghi vấn nếu chính record này có tên nhiều từ bắt đầu bằng từ đó (tức nó là HỌ của người này).
  const fullNames=[c.name,...c.aliases].map(x=>String(x||'').normalize('NFC').toLowerCase().trim().split(/\s+/)).filter(t=>t.length>=2&&!containsCJK(t.join('')));
  return c.aliases.filter(a=>{
    const k=nk(a);
    if(!k||keep.has(k)||kept.has(k)||!isBareSurnameAlias(a))return false;
    if(CHARMEM_VI_SURNAMES_AMBIG.has(k)&&!containsCJK(k))return fullNames.some(t=>t[0]===k);
    return true;
  });
}
// Quét toàn bộ (chỉ đọc, không sửa dữ liệu): [{char,aliases}]. Dùng để log lúc tải và để kiểm tra ở bước P4.
function scanSuspectAliases(){
  return (S.characters||[]).map(c=>({char:c,aliases:suspectAliasesOf(c)})).filter(x=>x.aliases.length);
}
async function removeSuspectAliases(id){
  const c=S.characters.find(x=>x.id===id);
  if(!c)return;
  const drop=suspectAliasesOf(c);
  if(!drop.length)return;
  c.aliases=c.aliases.filter(a=>!drop.includes(a));
  console.log(`[Luồng 1][Alias] Người dùng gỡ alias nghi vấn (họ đơn lẻ / họ + chức danh) khỏi "${c.name}": ${drop.join(', ')}`);
  try{ensureAllForms(S.characters);}catch(e){}
  await saveCharacterMemory();
  if(_charEditingId===id)openCharModal(id); else renderCharList();
}
async function keepSuspectAliases(id){
  const c=S.characters.find(x=>x.id===id);
  if(!c)return;
  const cur=suspectAliasesOf(c);
  if(!cur.length)return;
  c.aliasKeep=[...new Set([...(c.aliasKeep||[]),...cur])];
  await saveCharacterMemory();
  if(_charEditingId===id)openCharModal(id); else renderCharList();
}
function isDescriptiveLabel(v){
  const t=String(v||'').normalize('NFC').trim();
  if(!containsCJK(t)||t.length<3||t.length>7)return false;
  return CHARMEM_LABEL_SUFFIXES.some(sfx=>t.length>sfx.length&&t.endsWith(sfx));
}
// ===== DẠNG TÊN CỦA NHÂN VẬT (c.forms) — giai đoạn 1 =====
// Mỗi cách gọi của nhân vật (origName + aliases) thuộc 1 trong 3 loại:
//   'name'       tên riêng (李明, Lý Minh)                      -> được thay bằng c.name nếu nằm trong origName
//   'nickname'   biệt danh / nhãn tạm của ĐÚNG 1 người (小明, A Cường, 金发青年 của nhân vật còn là nhãn tạm,
//                chức danh + tên như 王掌柜)                      -> thay như 'name' nếu nằm trong origName
//   'role_label' chức danh/quan hệ chung nhiều người dùng (掌柜, tiểu nhị, sư huynh, "tiểu nhị tiệm gạo")
//                -> KHÔNG BAO GIỜ bị thay chuỗi; chỉ được nhắc 1 dòng trong prompt dịch (buildCharacterContextText)
// c.forms[] = [{text,kind,src:'orig'|'alias',kindLocked?}] là bản LƯU của charForms(c). Nguồn sự thật vẫn là
// origName/aliases (forms luôn tính lại từ đó nên không bao giờ lệch); chỉ có kindLocked (người dùng tự đặt loại,
// chưa có UI) là thông tin riêng của forms và được giữ lại khi tính lại.
const CHARMEM_FORM_KINDS=['name','nickname','role_label'];
// Phân loại do MODEL (giám khảo tên, judgeNamingBatch) — KHÔNG phụ thuộc ngôn ngữ, lưu ở c.forms[].aiKind:
//   'proper' tên riêng đúng 1 người | 'nickname' biệt danh cố định | 'title_or_relation' chức danh/nghề/danh xưng thân tộc/cụm mô tả
// Khác với f.kind (suy bằng bảng từ, chỉ còn là lớp phụ bắt miễn phí ca rõ ràng).
const CHARMEM_AI_KINDS=['proper','nickname','title_or_relation'];
const CHARMEM_COMMON_SURNAMES='王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤';
// Chức danh tiếng Việt (Hán Việt) hay gặp. Không đưa vào CHARMEM_GENERIC_VI_TERMS vì tập đó còn chặn alias mới
// (sanitizeAliasCandidate) — ở đây chỉ dùng để PHÂN LOẠI, không đổi hành vi lọc cũ.
const CHARMEM_ROLE_VI_HEADS=['tiểu nhị','chưởng quầy','chưởng quỹ','lão bản','ông chủ','bà chủ','chủ quán','chủ tiệm','quản gia','thị vệ','hộ vệ','nha hoàn','thị nữ','tiểu đồng','thư đồng','khách quan','thiếu gia','thiếu chủ','tướng quân','trưởng lão','chưởng môn','tông chủ','bang chủ','minh chủ','thành chủ','gia chủ','tộc trưởng','sư huynh','sư đệ','sư tỷ','sư muội','sư phụ','sư tôn','sư thúc','sư bá','công tử','tiểu thư','lão gia','phu nhân','cô nương','đạo hữu','tiền bối','đại nhân','bệ hạ','điện hạ','lão đại','đội trưởng','đại ca','nhị ca','tam ca','đại tỷ','nhị tỷ',
  // [Fix gộp nhầm] quan hệ bạn bè: phân loại role_label để skipRoleAlias không dùng làm khoá khớp record.
  'bạn thân','bạn bè','bạn cũ','bằng hữu','đồng môn','bạn'].sort((a,b)=>b.length-a.length);
const CHARMEM_VI_MODIFIERS=['đại','nhị','tam','tứ','ngũ','lục','thất','bát','cửu','thập','tiểu','lão'];
function _stripViModifier(low){
  for(const m of CHARMEM_VI_MODIFIERS){if(low.startsWith(m+' '))return low.slice(m.length+1);}
  return low;
}
// 1.1 — Phân loại 1 cách gọi. HÀM THUẦN (chỉ đọc isGenericAddressTerm/isDescriptiveLabel/containsCJK).
// opts.allowLabel: cách gọi này là nhãn tạm CỦA CHÍNH nhân vật đang là nhãn tạm (cùng ý nghĩa với
// sanitizeOrigNameCandidate) -> nhãn mô tả (金发青年) là 'nickname' thay vì 'role_label'.
// Chức danh/nhãn chung tiếng Trung chưa nằm trong CHARMEM_GENERIC_CJK_TERMS. Chỉ dùng để PHÂN LOẠI (không đổi bộ lọc alias cũ).
const CHARMEM_ROLE_CJK_EXTRA=new Set(['老爷子','老和尚','小和尚','老道','小道士','小丫头','小厮','老太婆','老妇人','小贼','小子','老家伙','护卫','侍卫','丫鬟','书童','村长','里正','少主','黑衣人','白衣人','大哥','二哥','三哥','大姐','二姐','三姐','老板娘','朋友','好友','同门']);
function inferFormKind(text,opts){
  const allowLabel=!!(opts&&opts.allowLabel);
  const t=String(text||'').normalize('NFC').trim();
  if(!t)return 'name';
  if(isGenericAddressTerm(t)||CHARMEM_ROLE_CJK_EXTRA.has(t))return 'role_label';
  if(isRoleWordForm(t))return 'nickname';   // Lưu thúc / 刘叔: cách gọi của đúng 1 người, KHÔNG phải tên riêng
  if(containsCJK(t)){
    // họ phổ biến + chức danh (李师兄, 王掌柜): chỉ ĐÚNG 1 người. Phải xét TRƯỚC isDescriptiveLabel, vì 李师兄 cũng
    // khớp đuôi "师兄" của nhãn mô tả; có danh sách họ để không nhầm 瘦老者 ("ông lão gầy") thành tên người.
    for(const n of [3,2]){
      if(t.length===n+1&&CHARMEM_COMMON_SURNAMES.includes(t[0])&&CHARMEM_GENERIC_CJK_TERMS.has(t.slice(1)))return 'nickname';
    }
    if(isDescriptiveLabel(t))return allowLabel?'nickname':'role_label';
    if(/^[小阿老][\u3400-\u9fff]{1,2}$/.test(t))return 'nickname';          // 小明, 阿强, 老李
    if(/^[\u3400-\u9fff][哥姐]$/.test(t))return 'nickname';                  // 李哥, 王姐
    // họ/tên + chức danh (王掌柜, 李师兄): chỉ ĐÚNG 1 người, không phải chức danh chung
    for(const n of [3,2]){
      if(t.length>n&&t.length-n<=2&&CHARMEM_GENERIC_CJK_TERMS.has(t.slice(-n)))return CHARMEM_COMMON_SURNAMES.includes(t[0])?'nickname':'role_label';
    }
    return 'name';
  }
  const low=t.toLowerCase();
  const stripped=_stripViModifier(low);
  for(const head of CHARMEM_ROLE_VI_HEADS){
    for(const cand of (stripped===low?[low]:[low,stripped])){
      if(cand===head)return 'role_label';
      if(cand.startsWith(head+' ')){
        // "tiểu nhị tiệm gạo": phần sau toàn chữ thường = mô tả -> vẫn là chức danh chung.
        // "Chưởng quầy Vương": phần sau viết hoa = tên người -> chức danh + tên của đúng 1 người.
        const rest=t.slice(t.length-(cand.length-head.length-1));
        return /\p{Lu}/u.test(rest)?'nickname':'role_label';
      }
    }
  }
  if(/^(tiểu|a|lão|bé)\s+\p{Lu}\p{L}*$/iu.test(t)&&/^\S+\s+\p{Lu}/u.test(t))return 'nickname';  // Tiểu Minh, A Cường
  if(/^\p{Lu}[\p{L}\s]*\s(ca|ca ca|tỷ|tỷ tỷ|huynh|muội)$/u.test(t))return 'nickname';               // Minh ca
  return 'name';
}
// 1.2 — Danh sách form của 1 nhân vật, suy ra từ origName (src 'orig') và aliases (src 'alias'; origName luôn
// được ưu tiên khi trùng). Không ghi gì vào c. Tên chính c.name là form ngầm định nên không nằm trong danh sách.
function charForms(c){
  if(!c)return [];
  const nk=v=>String(v||'').normalize('NFC').trim().toLowerCase();
  const nameKey=nk(c.name);
  const locked=new Map(),aiKinds=new Map();
  (Array.isArray(c.forms)?c.forms:[]).forEach(f=>{
    if(f&&f.text&&f.kindLocked&&CHARMEM_FORM_KINDS.includes(f.kind))locked.set(nk(f.text),f.kind);
    if(f&&f.text&&CHARMEM_AI_KINDS.includes(f.aiKind))aiKinds.set(nk(f.text),f.aiKind);   // giữ phán quyết của giám khảo khi tính lại
  });
  const out=[],seen=new Map();
  const add=(text,src)=>{
    const t=String(text||'').trim(),k=nk(t);
    if(!k||k===nameKey)return;
    const prev=seen.get(k);
    if(prev){if(src==='orig')prev.src='orig';return;}
    const kl=locked.get(k);
    const f={text:t,kind:kl||inferFormKind(t,{allowLabel:!!c.namePlaceholder&&src==='orig'}),src};
    if(kl)f.kindLocked=true;
    const ak=aiKinds.get(k);
    if(ak)f.aiKind=ak;
    seen.set(k,f);out.push(f);
  };
  charOrigNameList(c).forEach(v=>add(v,'orig'));
  (c.aliases||[]).forEach(v=>add(v,'alias'));
  return out;
}
// Ghi c.forms = charForms(c). Trả về true nếu có thay đổi (để nơi gọi lưu lại), giống backfillOrigNames.
function ensureForms(c){
  if(!c)return false;
  const next=charForms(c);
  if(JSON.stringify(next)===JSON.stringify(Array.isArray(c.forms)?c.forms:null))return false;
  c.forms=next;
  return true;
}
function ensureAllForms(list){
  let changed=false;
  (list||[]).forEach(c=>{if(ensureForms(c))changed=true;});
  return changed;
}
// Form có bị thay bằng c.name trong văn bản gửi đi không? Chỉ form nằm trong origName, loại name/nickname.
// role_label KHÔNG bao giờ bị thay — trừ khi chính người dùng tự điền origName (origNameSource==='user') và chưa
// khoá loại: giữ đúng nguyên tắc cũ "người dùng tự điền thì tôn trọng ý bạn".
//
// CHÍNH SÁCH khi "Kiểm tra tên" BẬT (getNameCheckOn): MẶC ĐỊNH KHÔNG THAY. Thay chuỗi là phá huỷ dữ liệu và không nhìn ngữ
// cảnh, nên chỉ thay form mà model đã xác nhận là tên riêng (aiKind==='proper'), hoặc do người dùng tự điền/tự khoá.
// Chưa phân loại, nickname, title_or_relation, lỗi API/timeout đều = không thay (chương sau thử lại). Danh sách từ
// (kind==='role_label') vẫn là lớp chặn phụ: bắt miễn phí ca rõ ràng kể cả khi model lỡ nhầm.
// Khi TẮT: đúng hành vi cũ (thay mọi form trong origName trừ role_label).
function isReplaceForm(c,f){
  if(!f||f.src!=='orig')return false;
  // Chưa có tên gốc (record chỉ là biệt danh/nhãn): origName chỉ để nhận diện, KHÔNG thay cứng (trừ khi người dùng tự điền/khoá).
  if(c.namePlaceholder&&c.nameSource!=='user'&&c.origNameSource!=='user'&&!f.kindLocked)return false;
  // QUY TẮC CỨNG: bản gốc gọi biệt danh/chức vụ/vai vế (Lưu thúc, 老刘, sư huynh, Vương sát thủ...) thì bản dịch giữ đúng nghĩa đó —
  // KHÔNG BAO GIỜ thay bằng tên thật. Chỉ form là TÊN RIÊNG (kind==='name') mới bị thay. Việc đổi xưng hô chỉ dành cho đại từ
  // trung tính (ta/ngươi, I/you...) và do prompt dịch lo, không phải thay chuỗi ở đây.
  if(f.kindLocked)return f.kind==='name';                // người dùng đã khoá loại: chỉ thay khi khoá là 'name'
  if(f.kind!=='name')return false;                       // nickname / role_label: giữ nguyên
  if(isRoleWordForm(f.text))return false;                // lớp chặn cuối: tên + vai vế
  if(!getNameJudgeOn())return true;
  if(c.origNameSource==='user')return true;
  return f.aiKind==='proper';
}
// Form là chức danh/nhãn chung (không bao giờ là khoá khớp nhân vật, được nhắc trong prompt dịch như "chức danh chung").
function formIsLabel(f){
  if(!f)return false;
  if(f.kindLocked)return f.kind==='role_label';
  return f.kind==='role_label'||(getNameJudgeOn()&&f.aiKind==='title_or_relation');
}
// Các chức danh chung của c cần nhắc trong prompt dịch (những cái không bị thay chuỗi).
function charRoleLabelList(c){
  return charForms(c).filter(f=>formIsLabel(f)&&!isReplaceForm(c,f)).map(f=>f.text);
}
// Các cách viết gốc của c THỰC SỰ bị thay bằng c.name trong văn bản gửi đi (dùng cho dòng "Tên gốc" trong prompt dịch).
function charReplacedOrigList(c){
  return charForms(c).filter(f=>f.src==='orig'&&isReplaceForm(c,f)).map(f=>f.text);
}
// Dọn origName ĐÃ LƯU (dữ liệu cũ có thể đã lỡ nhận danh xưng chung): chỉ đụng record do AI tự quản
// (origNameSource!=='user'). Cách viết bị gỡ vẫn nằm trong aliases (nhận diện không mất) nhưng không còn bị thay
// cứng, và được ghi vào demotedOrig để chương sau không điền ngược lại. Trả về true nếu có thay đổi.
function cleanupGenericOrigNames(list){
  let changed=false;
  (list||[]).forEach(c=>{
    if(!c||c.origNameSource==='user')return;
    const cur=charOrigNameList(c);
    if(!cur.length)return;
    const keep=[],drop=[];
    cur.forEach(v=>{(isGenericAddressTerm(v)||(!c.namePlaceholder&&isDescriptiveLabel(v)))?drop.push(v):keep.push(v);});
    if(!drop.length)return;
    c.origName=keep.join(', ');
    c.demotedOrig=parseOrigNames([...(c.demotedOrig||[]),...drop]);
    ensureOrigInAliasesAny(c,drop);
    console.log(`[Luồng 1][Tên gốc] Gỡ danh xưng chung/nhãn mô tả khỏi tên gốc của "${c.name}": ${drop.join(', ')} (vẫn giữ làm alias).`);
    changed=true;
  });
  return changed;
}
// Kiểm tra 1 ALIAS ứng viên (originalName/sinoAlias model trả về) TRƯỚC khi thêm vào c.aliases. Trước đây
// chỉ origName được lọc (sanitizeOrigNameCandidate) còn aliases nhận chuỗi thô, nên giá trị bị loại khỏi ô
// "Tên gốc" (bịa, trùng người khác...) vẫn lọt vào aliases — mà aliases mới là thứ quyết định nhận diện
// (findAllCharsByNameOrAlias, scanMentionedCharIds, tập "others" của chính hàm kiểm). Điều kiện: không
// trùng name/alias/origName của nhân vật KHÁC (trừ selfChar và excludeChars). Trả về chuỗi đã trim hoặc ''.
function sanitizeAliasCandidate(cand,selfChar,excludeChars){
  const v=String(cand||'').trim();
  const k=normKey(String(v).normalize('NFC'));
  if(!k)return '';
  if(isRoleAddressAlias(v)){
    console.log(`[Luồng 1][Tên gốc] Bỏ qua alias đề xuất "${v}"${selfChar?` cho "${selfChar.name}"`:''}: danh xưng chung nhiều người dùng.`);
    return '';
  }
  const skip=new Set([selfChar,...(excludeChars||[])].filter(Boolean));
  const clashRecs=(S.characters||[]).filter(x=>!skip.has(x)&&
    [x.name,...(x.aliases||[]),...charOrigNameList(x)].some(n=>normKey(String(n||'').normalize('NFC'))===k));
  if(clashRecs.length){
    console.log(`[Luồng 1][Tên gốc] Bỏ qua alias đề xuất "${v}"${selfChar?` cho "${selfChar.name}"`:''}: trùng tên/alias của nhân vật khác.`);
    // Alias AI đề xuất cho A lại chính là tên/alias của B: AI đang cho rằng A và B là cùng 1 người. Alias vẫn bị loại (đúng),
    // nhưng thông tin này không được vứt đi: ghi đề xuất nối 'suggested' (người dùng duyệt ở banner, KHÔNG tự gộp).
    if(selfChar&&!isDescriptiveLabel(v)){
      clashRecs.forEach(x=>{try{proposeSameAsFromAliasClash(selfChar,x,v);}catch(e){}});
    }
    return '';
  }
  return v;
}
// Ghi đề xuất nối a ~ b khi alias AI đề xuất cho a trùng tên/alias của b. Lưới an toàn: cặp đã bị từ chối thì bỏ; giới tính/độ tuổi/quan hệ
// lệch thì bỏ (xem sameAsSafetyBlock). Nếu 1 bên là nhân vật chính thì không xét 'relationship' (nhãn MC cố định), 'origname' (tên gốc
// khác nhau chính là lý do record bị tách) và 'age' (xuyên không vào thân xác khác tuổi) — vẫn xét giới tính.
function proposeSameAsFromAliasClash(a,b,alias){
  if(!a||!b||!a.id||!b.id||a.id===b.id)return;
  if(isMergePairRejected(a.id,b.id))return;
  if(distinctByOrigName(a,b)){resolveDistinctOrigPair(a,b,'aliasClash',alias);return;}   // khác tên gốc -> không nối
  const mcInvolved=isCharProtagonist(a)||isCharProtagonist(b);
  const why=sameAsSafetyBlock(a,b);
  if(why&&!(mcInvolved&&(why==='relationship'||why==='origname'||why==='age')))return;
  const res=recordSameAsProposal(S.characters,a,b,{direct:false,
    evidence:`AI đề xuất "${alias}" là tên khác của "${a.name}" nhưng đó đã là tên/alias của "${b.name}"`});
  if(res==='added')console.log(`[Luồng 1][Nối nhân vật] Đề xuất gộp "${a.name}" ~ "${b.name}" (alias "${alias}" trùng): ${res}`);
}
// c.demotedOrig = các cách viết gốc của NHÃN MÔ TẢ TẠM đã bị hạ khỏi origName sau khi biết tên thật (vd 金发青年).
// Chúng chỉ còn là alias để nhận diện chương cũ, KHÔNG được tự điền ngược lại vào origName (nếu không, chương
// sau model vẫn trả originalName=金发青年 cho người đó thì nhãn chung lại bị thay cứng toàn cục).
function isDemotedOrig(c,v){
  const k=normKey(v);
  return !!k&&(c.demotedOrig||[]).some(x=>normKey(x)===k);
}
// Hạ MỌI origName hiện có của c xuống chỉ-còn-alias (dùng khi c vừa từ nhãn tạm thành tên thật: các cách
// viết đó là cách viết của NHÃN, không phải của tên thật). Không đụng nếu người dùng đã tự khoá origName.
// Trả về danh sách đã hạ.
function demoteOrigNames(c){
  if(c.origNameSource==='user')return [];
  const cur=charOrigNameList(c);
  if(!cur.length)return [];
  c.demotedOrig=parseOrigNames([...(c.demotedOrig||[]),...cur]);
  c.origName='';
  ensureOrigInAliasesAny(c,cur);
  return cur;
}
// Biệt danh/chức danh bị giám khảo xếp KHÔNG phải tên định danh thì rời khỏi ô "Tên gốc" sang "Tên gọi khác" (vẫn là alias để
// nhận diện), để sửa biệt danh không đụng tới tên thật. Không đụng ô do người dùng tự điền hoặc form người dùng đã khoá loại.
function demoteFormFromOrig(c,text){
  if(!c||c.origNameSource==='user')return false;
  const k=normKey(String(text||'').normalize('NFC'));
  if(!k)return false;
  if((c.forms||[]).some(fm=>fm&&fm.kindLocked&&normKey(String(fm.text||'').normalize('NFC'))===k))return false;
  const cur=charOrigNameList(c);
  const keep=cur.filter(v=>normKey(String(v).normalize('NFC'))!==k);
  if(keep.length===cur.length)return false;
  c.origName=keep.join(', ');
  c.demotedOrig=parseOrigNames([...(c.demotedOrig||[]),text]);
  ensureOrigInAliasesAny(c,[text]);
  console.log(`[Luồng 1][Kiểm tra tên] Chuyển "${text}" khỏi Tên gốc của "${c.name}" sang Tên gọi khác (không phải tên định danh).`);
  return true;
}
function ensureOrigInAliasesAny(c,list){
  const have=new Set((c.aliases||[]).map(normKey));
  const nameKey=normKey(c.name);
  const add=(list||[]).filter(n=>{const k=normKey(n);return k&&!have.has(k)&&k!==nameKey;});
  if(add.length)c.aliases=[...(c.aliases||[]),...add];
}
// TÊN GỐC CHỈ 1 TÊN: gộp tên đang có (c.origName) với `list`, giữ tên ĐẦU TIÊN (ưu tiên tên đang có, rồi tới thứ tự trong list)
// làm origName; mọi tên còn lại chuyển sang Tên gọi khác (aliases, vẫn nhận diện được) và ghi vào demotedOrig để các chương sau
// không điền ngược vào ô Tên gốc. Trả về danh sách tên bị đẩy sang alias.
function setOrigNameSingle(c,list){
  if(!c)return [];
  const pool=parseOrigNames([...charOrigNameList(c),...parseOrigNames(list)]);
  if(!pool.length){c.origName='';return [];}
  const keep=pool[0],extras=pool.slice(1);
  c.origName=keep;
  ensureOrigInAliasesAny(c,[keep]);
  if(extras.length){
    ensureOrigInAliasesAny(c,extras);
    c.demotedOrig=parseOrigNames([...(c.demotedOrig||[]),...extras]);
  }
  return extras;
}
// Dọn dữ liệu cũ: record nào có >1 tên gốc thì giữ tên đầu, còn lại sang Tên gọi khác. Trả về true nếu có thay đổi.
function enforceSingleOrigNames(list){
  let changed=false;
  (list||[]).forEach(c=>{
    if(!c)return;
    const cur=charOrigNameList(c);
    if(cur.length<=1)return;
    const moved=setOrigNameSingle(c,[]);
    console.log(`[Luồng 1][Tên gốc] \"${c.name}\": Tên gốc chỉ cho 1 tên -> giữ \"${c.origName}\", chuyển [${moved.join(', ')}] sang Tên gọi khác.`);
    changed=true;
  });
  return changed;
}
// HÀM CHUNG cho mọi lần NHÃN TẠM -> TÊN THẬT (nhánh nâng cấp ở mergeAnalysisResults, applyRealNameReveals
// "trực tiếp", applyCharConflict ca "name"). Trước đây 3 đường này đổi c.name khác nhau và đều không đụng
// origName: nhãn cũ (vd 金发青年) vẫn là origName nên bị thay thành tên thật ở MỌI chỗ (kể cả nơi nó chỉ là
// mô tả chung), còn chữ gốc của tên thật (vd 陈明勇) không vào origName nên không được thay.
// Việc làm: (1) đổi tên + tắt namePlaceholder; (2) nhãn cũ và origName cũ của nhãn chỉ còn là alias
// (không thay cứng nữa); (3) realOrigs (đã được nơi gọi kiểm bằng sanitizeOrigNameCandidate) vào origName —
// riêng origNameSource==='user' thì chỉ thêm alias và (nếu ô tên gốc đang có chữ) đẩy gợi ý qua banner.
// Trả về {oldName,demoted,addedOrig}.
function promoteToRealName(c,realName,realOrigs,why){
  const oldName=c.name;
  const demoted=demoteOrigNames(c);
  c.name=realName;
  onCharRenamed(c,oldName,false,true);   // nhãn tạm ("Lưu thúc"...) là cách bản gốc gọi -> giữ nguyên trong bản dịch cũ
  c.namePlaceholder=false;
  c.nameLabelByJudge=false;
  c.nameConflict=null;
  const have=new Set((c.aliases||[]).map(normKey));
  if(normKey(oldName)&&!have.has(normKey(oldName)))c.aliases=[...(c.aliases||[]),oldName];
  const demotedKeys=new Set([...demoted,...(c.demotedOrig||[])].map(normKey));
  const cand=parseOrigNames(realOrigs).filter(v=>!demotedKeys.has(normKey(v))&&normKey(v)!==normKey(realName)&&!isGenericAddressTerm(v)&&!isDescriptiveLabel(v));
  let addedOrig=[];
  if(cand.length){
    ensureOrigInAliasesAny(c,cand);
    if(c.origNameSource==='user'){
      if(charOrigNameList(c).length){
        c.origNameConflict={value:cand[0],
          reason:`Biết tên thật "${realName}" nhưng ô Tên gốc do bạn tự đặt nên không tự sửa`};
      }
    }else{
      setOrigNameSingle(c,cand);   // chỉ 1 tên gốc; tên còn lại thành alias
      c.origNameSource='ai';
      addedOrig=cand;
    }
  }
  // alias không được trùng chính tên chính mới
  c.aliases=(c.aliases||[]).filter(a=>normKey(a)!==normKey(realName));
  console.log(`[Luồng 1][Tên tạm] Nhãn tạm -> tên thật${why?` (${why})`:''}: "${oldName}" -> "${realName}"; hạ xuống alias: [${demoted.join(', ')}]; tên gốc mới: [${addedOrig.join(', ')}]`);
  return {oldName,demoted,addedOrig};
}
// Đổi tên chính của 1 record CHƯA ĐƯỢC XÁC NHẬN tên (nameVerified!==true) sang tên đúng do bước "Kiểm tra lại" chọn.
// Khác promoteToRealName (nhãn tạm -> tên thật): ở đây tên cũ là tên "trông như thật" nhưng sai (biệt danh, phiên âm...), nên
// KHÔNG đụng tới origName. Tên cũ vẫn giữ làm alias vì bản dịch các chương trước đã dùng nó.
function renameCharKeepAlias(c,newName,why){
  const oldName=c.name;
  c.name=uniqueCharNameFor(newName,c);
  onCharRenamed(c,oldName);
  const have=new Set((c.aliases||[]).map(normKey));
  if(normKey(oldName)&&!have.has(normKey(oldName)))c.aliases=[...(c.aliases||[]),oldName];
  c.aliases=(c.aliases||[]).filter(a=>normKey(a)!==normKey(c.name));
  c.nameConflict=null;
  console.log(`[Luồng 1][Kiểm tra lại] Đổi tên chưa xác nhận${why?` (${why})`:''}: "${oldName}" -> "${c.name}" (tên cũ giữ làm alias).`);
}
// Nhân vật lưu từ trước khi có field này: KHÔNG tự đoán origName từ alias chữ Hán đầu tiên nữa (alias có thể là
// nhãn chung, phiên âm hay tên người khác -> origName sai sẽ làm thay nhầm tên trong văn bản gửi đi dịch). Chỉ
// đặt origName='' để đánh dấu đã xét, không xét lại ở lần tải sau. Ô trống + origNameSource!=='user' nên ở
// các chương sau AI tự nhận diện lại và điền qua "originalName" (xem mergeAnalysisResults, đã kiểm nguyên văn
// trong chương + không trùng nhân vật khác). Trả về true nếu có thay đổi để nơi gọi lưu lại.
function backfillOrigNames(list){
  let changed=false;
  (list||[]).forEach(c=>{
    if(c.origName!==undefined)return;
    c.origName='';
    c.origNameSource='ai';
    changed=true;
  });
  return changed;
}
// Tên HIỂN THỊ của nhân vật: bỏ hậu tố " (2)", " (3)"... do uniqueCharName() thêm để phân biệt 2 record trùng tên.
// Hậu tố đó chỉ là khoá nội bộ — KHÔNG được đi vào văn bản gửi dịch (applyCharNameSubstitution) hay prompt dịch.
function displayCharName(c){
  const n=String(c&&c.name||'').trim();
  return n.replace(/\s*\(\d+\)\s*$/,'').trim()||n;
}
// Cách viết gốc của tên chính mà giám khảo CHƯA phân loại (lỗi/timeout/chưa tới lượt) nên chưa bị thay chuỗi: nếu không dặn,
// prompt dịch coi chúng là "biệt danh, dịch theo ngữ cảnh" và model tự phiên âm lệch khỏi tên chính ngay chương này.
function pendingOrigForms(c){
  if(!c||!getNameJudgeOn()||c.namePlaceholder||containsCJK(c.name))return [];
  return charForms(c).filter(f=>f.src==='orig'&&f.kind==='name'&&!f.aiKind&&!f.kindLocked&&!formIsLabel(f)&&!isReplaceForm(c,f)).map(f=>f.text);
}

// ===== ĐỔI TÊN NHÂN VẬT TRONG BẢN DỊCH ĐÃ LƯU =====
// Sửa c.name chỉ đổi dữ liệu nhân vật; bản dịch đã lưu (S.translations, S.translatedTitles) giữ tên cũ. Các hàm dưới
// đây cho phép đổi luôn tên cũ -> tên mới trong các chương ĐÃ dịch (bản gốc ch.content KHÔNG bao giờ bị đụng tới).
//  - Sửa tay trong modal / AI đặt tên thật thay nhãn tạm: hỏi xác nhận (hiện số chỗ sẽ đổi).
//  - AI sửa tên còn sót chữ Hán: đổi luôn không hỏi (chữ Hán trong bản dịch chắc chắn là tên chưa dịch, không trùng từ thường).
function _renNameKey(v){return displayCharName({name:v}).normalize('NFC').trim();}
// Thay `from` -> `to` trong 1 chuỗi. Tên Latin chỉ thay khi đứng riêng thành 1 từ (không đụng "An" trong "Lan");
// nếu `to` chứa `from` (Minh -> Lý Minh) thì bỏ qua chỗ `from` đã nằm sẵn trong `to` để không thành "Lý Lý Minh".
function _renReplaceInString(t,from,to,dry){
  if(typeof t!=='string'||!t)return {text:t,count:0};
  // Không đụng vào bên trong token ⟦c:id:Tên⟧ — token tự đổi theo nhân vật (xem resolveCharTokens).
  const parts=t.indexOf('\u27e6c:')>=0?t.split(/(\u27e6c:[^\u27e6\u27e7]*\u27e7)/):[t];
  let count=0;
  const out=parts.map((p,idx)=>{
    if(idx%2===1&&parts.length>1)return p;
    const r=_renReplacePart(p,from,to);
    count+=r.count;
    return r.text;
  }).join('');
  return {text:dry?t:out,count};
}
function _renReplacePart(t,from,to){
  if(!t)return {text:t,count:0};
  const rx=new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g');
  const wordCh=/[a-zA-ZÀ-ỹ\u0300-\u036f0-9_]/;
  const cjk=containsCJK(from);
  const inTo=[];
  if(to.indexOf(from)>=0){let k=to.indexOf(from);while(k>=0){inTo.push(k);k=to.indexOf(from,k+1);}}
  let count=0;
  const out=t.replace(rx,(m,off,full)=>{
    if(!cjk){
      const prev=off>0?full[off-1]:'',next=off+m.length<full.length?full[off+m.length]:'';
      if((prev&&wordCh.test(prev))||(next&&wordCh.test(next)))return m;
    }
    for(const k of inTo){if(off-k>=0&&full.substr(off-k,to.length)===to)return m;}
    count++;
    return to;
  });
  return {text:out,count};
}
// Đếm (dry) hoặc thực hiện đổi trên toàn bộ bản dịch + tiêu đề đã dịch. Trả về {chapters,count}.
function renameCharInTranslations(from,to,dry){
  from=_renNameKey(from);to=_renNameKey(to);
  if(!from||!to||from===to||!S||!S.translations)return {chapters:0,count:0};
  let chapters=0,count=0;
  Object.keys(S.translations).forEach(k=>{
    const r=_renReplaceInString(S.translations[k],from,to,dry);
    if(r.count){chapters++;count+=r.count;if(!dry)S.translations[k]=r.text;}
  });
  if(S.translatedTitles)Object.keys(S.translatedTitles).forEach(k=>{
    const r=_renReplaceInString(S.translatedTitles[k],from,to,dry);
    if(r.count){count+=r.count;if(!dry)S.translatedTitles[k]=r.text;}
  });
  return {chapters,count};
}
// Thực hiện đổi thật + lưu + vẽ lại + báo trạng thái.
function _applyRenameInTranslations(from,to){
  const r=renameCharInTranslations(from,to,false);
  if(r.count){
    try{if(typeof saveSession==='function')saveSession();}catch(e){}
    try{if(typeof renderCh==='function'&&S.cur>=0)renderCh(S.cur);}catch(e){}
    try{if(typeof setStatus==='function')setStatus(`Đã đổi "${from}" → "${to}" ở ${r.count} chỗ trong ${r.chapters} chương đã dịch.`);}catch(e){}
  }
}
// manual=true: người dùng tự tay đổi tên -> hiện popup xác nhận (showPopup của app, không chặn luồng).
// manual falsy (AI tự đổi) -> tự động đổi luôn, không hỏi.
function offerRenameInTranslations(oldName,newName,manual){
  const from=_renNameKey(oldName),to=_renNameKey(newName);
  if(!from||!to||from===to)return;
  const prev=renameCharInTranslations(from,to,true);
  if(!prev.count)return;
  if(manual&&!containsCJK(from)&&typeof showPopup==='function'){
    showPopup({
      title:'Đổi tên trong bản dịch đã lưu?',
      msg:`Đổi tên nhân vật <strong>${_cmaEsc(from)}</strong> → <strong>${_cmaEsc(to)}</strong> trong bản dịch đã lưu?<br><br><strong>${prev.count}</strong> chỗ ở <strong>${prev.chapters}</strong> chương sẽ được sửa. Bản gốc không bị thay đổi.`,
      btns:[
        {label:'Huỷ'},
        {label:'Đổi',cls:'btn-p',cb:()=>{_applyRenameInTranslations(from,to);}}
      ]
    });
    return;
  }
  _applyRenameInTranslations(from,to);
}
// Xếp hàng để các hộp xác nhận hiện lần lượt, không chặn luồng AI đang chạy nền.
let _renameOfferChain=Promise.resolve();
function queueRenameOffer(oldName,newName,manual){
  if(!oldName||!newName)return;
  _renameOfferChain=_renameOfferChain.then(()=>new Promise(res=>setTimeout(()=>{try{offerRenameInTranslations(oldName,newName,manual);}catch(e){console.warn('[rename]',e);}res();},0)));
}

// ===== TOKEN TÊN NHÂN VẬT TRONG BẢN DỊCH ĐÃ LƯU =====
// MỤC ĐÍCH: đổi c.name (sửa tay, AI nâng nhãn tạm thành tên thật, gộp nhân vật) thì TOÀN BỘ bản dịch đã lưu đổi theo, mà bản gốc
// (ch.content) không đổi. Không có công tắc: luôn bật (đã bỏ công tắc/nút gán/bỏ gán vì không có tác dụng phụ đáng kể).
//
// DẠNG LƯU: S.translations[i] chứa tên nhân vật dạng ⟦c:ID:Tên lúc lưu⟧ (⟦ ⟧ = U+27E6/U+27E7; ID = c.id; tên nhúng chỉ là dự phòng).
// LUỒNG:
//   GHI  translate.js (sau lockCharNames+cleanCensorChars) -> tokenizeCharNames(); index.html (kết quả soát xưng hô) -> tokenizeCharNames();
//        runAutoTokenize() (dưới) gán nốt cho chương cũ/chương có nhân vật mới, chạy nền sau loadCharacterMemory/saveCharacterMemory.
//   ĐỌC  resolveCharTokens(text) -> tên HIỆN TẠI của nhân vật. Đang gọi ở: index.html renderCh + gửi soát xưng hô, export.js (TXT/EPUB),
//        tts.js (2 chỗ), chatbot.js (2 chỗ). AI khi dịch KHÔNG bao giờ thấy token (token gán SAU khi dịch xong); soát xưng hô nhận
//        bản đã giải token.
//   ĐỔI TÊN onCharRenamed(c,old) (4 chỗ gán c.name) -> refreshNameTokens (cập nhật tên nhúng) + vẽ lại chương đang xem nếu có token của c;
//        chỗ chưa thành token vẫn đi đường xác nhận cũ (queueRenameOffer -> offerRenameInTranslations). Gộp nhân vật:
//        mergeCharacterInto -> remapNameTokens (token nguồn trỏ sang đích).
// QUY TẮC KHI THÊM CODE MỚI: nơi nào ĐỌC nội dung S.translations[...] để hiển thị/xuất/gửi AI/đếm chữ thì PHẢI bọc resolveCharTokens(),
//   nếu không sẽ hiện chuỗi ⟦c:...⟧ ra truyện. Nơi GHI bản dịch mới thì bọc tokenizeCharNames(). Chỉ kiểm tra tồn tại (if(S.translations[i])) thì không cần.
//   Không dùng tokenizeCharNames cho S.translatedTitles (tiêu đề nhiều nơi đọc trực tiếp) — tiêu đề đổi tên bằng đường xác nhận cũ.
// QUY TẮC GÁN (_nameTokUsable/makeNameTokenizer): chỉ tên >=3 ký tự, >=2 âm tiết, không chữ Hán, không nhãn tạm (namePlaceholder /
//   looksLikePlaceholderCharName), không xưng hô chung, không trùng tên nhân vật khác (hậu tố " (2)"). Khớp theo ranh giới từ, phân biệt
//   hoa/thường; tên đứng liền sau là 1 từ viết hoa ("Lý Minh Hạo") thì bỏ qua vì có thể là tên dài hơn. Tên 1 âm tiết ("Lan", "Mai") bỏ qua vì
//   dễ trùng từ thường. Muốn nới/siết quy tắc: sửa ở 2 hàm đó.
// KHI NGHI NGỜ LỖI:
//   * Thấy ⟦c:...⟧ trong truyện  -> có chỗ đọc bản dịch quên resolveCharTokens (tìm S.translations[ trong code, so với danh sách ĐỌC ở trên).
//   * Tên bị đổi nhầm 1 từ thường -> tên đó đang được gán token; thêm điều kiện loại ở _nameTokUsable.
//   * Muốn trả bản dịch về chữ thường (gỡ lỗi / mở bằng app cũ): chạy trong console  untokenizeAllTranslations();saveSession();
//     rồi tạm thời gỡ lời gọi scheduleAutoTokenize() ở loadCharacterMemory/saveCharacterMemory để nó không gán lại.
//   * Log: console '[nametok] tự gán token ở N chương'.
// TÁC DỤNG PHỤ ĐÃ BIẾT: dữ liệu lưu/backup có ⟦c:...⟧ (app cũ chưa có bản vá sẽ thấy token thô); tên bị gán nhầm thì đổi âm thầm.
function _nameTokUsable(c){
  if(!c||!c.id)return false;
  const nm=displayCharName(c).normalize('NFC').trim();
  if(nm.length<3||/[\u27e6\u27e7]/.test(nm))return false;
  if(containsCJK(nm))return false;
  if(c.namePlaceholder||looksLikePlaceholderCharName(nm)||isGenericAddressTerm(nm))return false;
  if(nm.split(/\s+/).filter(Boolean).length<2)return false;
  return true;
}
function makeNameTokenizer(){
  const none=t=>({text:t,count:0});
  const chars=(typeof S!=='undefined'&&Array.isArray(S.characters))?S.characters:[];
  const by=new Map();
  for(const c of chars){
    if(!_nameTokUsable(c))continue;
    const k=displayCharName(c).normalize('NFC').trim();
    if(!by.has(k))by.set(k,[c]);else by.get(k).push(c);
  }
  // 2 nhân vật cùng hiển thị 1 tên (hậu tố " (2)") -> mơ hồ, không gán token
  const keys=[...by.keys()].filter(k=>by.get(k).length===1).sort((a,b)=>b.length-a.length);
  if(!keys.length)return none;
  const rx=new RegExp('\u27e6c:[^\u27e6\u27e7]*\u27e7|'+keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  const wordCh=/[a-zA-ZÀ-ỹ\u0300-\u036f0-9_]/;
  const isUpper=ch=>!!ch&&ch!==ch.toLowerCase()&&ch===ch.toUpperCase();
  const f=t=>{
    if(typeof t!=='string'||!t)return none(t);
    let count=0;
    const out=t.replace(rx,(m,off,full)=>{
      if(m.charAt(0)==='\u27e6')return m;
      const prev=off>0?full[off-1]:'',next=off+m.length<full.length?full[off+m.length]:'';
      if((prev&&wordCh.test(prev))||(next&&wordCh.test(next)))return m;
      if(next===' '&&isUpper(full[off+m.length+1]))return m;
      const c=by.get(m)[0];
      count++;
      return '\u27e6c:'+c.id+':'+m+'\u27e7';
    });
    return {text:out,count};
  };
  f.sig=keys.map(k=>k+'='+by.get(k)[0].id).join('|');
  return f;
}
function tokenizeCharNames(text){
  if(typeof text!=='string'||!text)return text;
  try{return makeNameTokenizer()(text).text;}catch(e){console.warn('[nametok]',e);return text;}
}
// Giải token -> tên hiện tại. Nhân vật không còn (hoặc tên hiện tại còn chữ Hán) -> dùng tên nhúng sẵn.
function resolveCharTokens(text){
  if(typeof text!=='string'||text.indexOf('\u27e6c:')<0)return text;
  const byId=new Map(((typeof S!=='undefined'&&Array.isArray(S.characters))?S.characters:[]).map(c=>[c.id,c]));
  return text.replace(/\u27e6c:([^:\u27e6\u27e7]+):([^\u27e6\u27e7]*)\u27e7/g,(m,id,nm)=>{
    const c=byId.get(id);
    const cur=c?displayCharName(c).trim():'';
    return (cur&&!containsCJK(cur))?cur:nm;
  });
}
// Cập nhật tên nhúng trong token của nhân vật c (sau khi đổi tên) để dự phòng luôn đúng.
function refreshNameTokens(c){
  if(!c||!c.id||typeof S==='undefined'||!S.translations)return 0;
  const nm=displayCharName(c).trim();
  if(!nm||containsCJK(nm)||/[\u27e6\u27e7]/.test(nm))return 0;
  const prefix='\u27e6c:'+c.id+':';
  let n=0;
  Object.keys(S.translations).forEach(k=>{
    const t=S.translations[k];
    if(typeof t!=='string'||t.indexOf(prefix)<0)return;
    const out=t.replace(/\u27e6c:([^:\u27e6\u27e7]+):([^\u27e6\u27e7]*)\u27e7/g,(m,id,old)=>{
      if(id!==c.id||old===nm)return m;
      n++;return '\u27e6c:'+id+':'+nm+'\u27e7';
    });
    if(out!==t)S.translations[k]=out;
  });
  return n;
}
// Gộp nhân vật: token của source trỏ sang target.
function remapNameTokens(srcId,target){
  if(!srcId||!target||!target.id||typeof S==='undefined'||!S.translations)return 0;
  const prefix='\u27e6c:'+srcId+':';
  const nm=displayCharName(target).trim();
  if(!nm||/[\u27e6\u27e7]/.test(nm))return 0;
  let n=0;
  Object.keys(S.translations).forEach(k=>{
    const t=S.translations[k];
    if(typeof t!=='string'||t.indexOf(prefix)<0)return;
    const out=t.replace(/\u27e6c:([^:\u27e6\u27e7]+):([^\u27e6\u27e7]*)\u27e7/g,(m,id)=>{
      if(id!==srcId)return m;
      n++;return '\u27e6c:'+target.id+':'+nm+'\u27e7';
    });
    if(out!==t)S.translations[k]=out;
  });
  if(n){try{if(typeof saveSession==='function')saveSession();}catch(e){}}
  return n;
}
// Gán token cho TOÀN BỘ chương đã dịch (runAutoTokenize là bản chạy nền, cùng ý nghĩa). Trả {chapters,count}.
function tokenizeAllTranslations(){
  const tk=makeNameTokenizer();
  let chapters=0,count=0;
  Object.keys(S.translations||{}).forEach(k=>{
    const t=S.translations[k];
    if(typeof t!=='string'||!t)return;
    const r=tk(t);
    if(r.count){S.translations[k]=r.text;chapters++;count+=r.count;}
  });
  return {chapters,count};
}
// Trả toàn bộ bản dịch về chữ thường — KHÔNG còn gọi từ UI, chỉ để gỡ lỗi qua console (xem 'KHI NGHI NGỜ LỖI' phía trên).
function untokenizeAllTranslations(){
  let chapters=0,count=0;
  Object.keys(S.translations||{}).forEach(k=>{
    const t=S.translations[k];
    if(typeof t!=='string'||t.indexOf('\u27e6c:')<0)return;
    const n=(t.match(/\u27e6c:[^\u27e6\u27e7]*\u27e7/g)||[]).length;
    S.translations[k]=resolveCharTokens(t);
    chapters++;count+=n;
  });
  return {chapters,count};
}
// Tự gán token cho các chương đã dịch (chương dịch mới đã được gán ngay lúc lưu). Chạy nền theo từng cụm 25 chương, bỏ qua
// chương đã xử lý với đúng bộ tên hiện tại (tên nhân vật đổi/được thêm thì bộ tên đổi -> quét lại). Chữ hiển thị không đổi.
let _autoTokTimer=null,_autoTokRun=0,_autoTokBook=null;const _autoTokSeen=new Map();
function scheduleAutoTokenize(delay){
  clearTimeout(_autoTokTimer);
  _autoTokTimer=setTimeout(runAutoTokenize,delay==null?1500:delay);
}
function runAutoTokenize(){
  if(typeof S==='undefined'||!S.translations||!Array.isArray(S.characters))return;
  const run=++_autoTokRun;
  const bookKey=(typeof libCurrentId!=='undefined'&&libCurrentId)||S.fname||'';
  if(_autoTokBook!==bookKey){_autoTokSeen.clear();_autoTokBook=bookKey;}
  const tk=makeNameTokenizer();
  const sig=tk.sig||'';
  const keys=Object.keys(S.translations);
  let i=0,changed=0;
  const step=()=>{
    if(run!==_autoTokRun)return;
    const end=Math.min(keys.length,i+25);
    for(;i<end;i++){
      const k=keys[i],t=S.translations[k];
      if(typeof t!=='string'||!t||(S.xlatingSet&&S.xlatingSet.has(+k)))continue;
      const sk=bookKey+'#'+k,seen=_autoTokSeen.get(sk);
      if(seen&&seen.sig===sig&&seen.text===t)continue;
      const r=tk(t);
      if(r.count){S.translations[k]=r.text;changed++;}
      _autoTokSeen.set(sk,{sig,text:r.count?r.text:t});
    }
    if(i<keys.length){setTimeout(step,0);return;}
    if(changed){try{if(typeof saveSession==='function')saveSession();}catch(e){}console.log('[nametok] tự gán token ở '+changed+' chương');}
  };
  step();
}
// Gọi MỖI KHI c.name đổi: cập nhật tên nhúng + vẽ lại chương đang xem nếu có token của c, rồi mở đường xác nhận cho
// các chỗ còn là chữ thường (tên chưa gán token) như trước.
// manual=true CHỈ khi người dùng tự sửa tên trong modal; mọi nơi AI đổi tên gọi không truyền -> đổi bản dịch tự động, không popup.
function onCharRenamed(c,oldName,manual,skipText){
  try{
    refreshNameTokens(c);
    const cur=(typeof S!=='undefined'&&S.cur>=0)?S.translations[S.cur]:null;
    if(typeof cur==='string'&&cur.indexOf('\u27e6c:'+c.id+':')>=0){
      try{if(typeof saveSession==='function')saveSession();}catch(e){}
      if(typeof renderCh==='function')renderCh(S.cur);
    }
  }catch(e){console.warn('[nametok]',e);}
  // skipText: tên cũ là NHÃN/BIỆT DANH mà bản gốc thật sự gọi (VD "Lưu thúc") -> KHÔNG viết đè thành tên thật trong các chương đã dịch.
  if(!skipText)queueRenameOffer(oldName,c.name,!!manual);
}
let _origSubCache={key:null,re:null,map:null};
// Thay tên theo FORM (xem charForms): chỉ form name/nickname nằm trong origName bị thay bằng c.name. Các chức danh
// chung (role_label, của mọi nhân vật, kể cả trong aliases) được đưa vào CÙNG 1 regex như "span được bảo vệ":
// regex chọn cách viết dài nhất tại mỗi vị trí, nên khi 1 chức danh dài (tiểu nhị tiệm gạo, 大师兄) khớp trước thì
// span đó được giữ nguyên, tên/nickname ngắn nằm bên trong không bị thay lồng.
function applyCharNameSubstitution(t){
  if(!t||!S.characters||!S.characters.length)return t;
  if(typeof getCharMemOn==='function'&&!getCharMemOn())return t;
  const key=S.characters.map(c=>(c.name||'')+'\u0001'+(c.origName||'')+'\u0001'+(c.origNameSource==='user'?'u':'a')+'\u0001'+(c.namePlaceholder?'p':'')+'\u0001'+(c.aliases||[]).join('\u0003')+'\u0001'+(Array.isArray(c.forms)?c.forms.filter(f=>f&&(f.kindLocked||f.aiKind)).map(f=>f.text+':'+f.kind+(f.kindLocked?'!':'')+':'+(f.aiKind||'')).join('\u0003'):'')).join('\u0002')+'\u0004'+(getNameCheckOn()?'1':'0');
  if(key!==_origSubCache.key){
    const map=new Map(),protect=new Set();
    S.characters.forEach(c=>{
      const to=displayCharName(c);
      charForms(c).forEach(f=>{
        const from=f.text;
        if(from.length<2||from.toLowerCase()===to.toLowerCase())return;
        if(isReplaceForm(c,f)){
          if(to&&!map.has(from.toLowerCase()))map.set(from.toLowerCase(),to);
        }else if(formIsLabel(f)||f.src==='orig'){
          // Span được bảo vệ: chức danh chung (mọi nguồn) + cách viết gốc KHÔNG bị thay (nickname/chưa phân loại) — để tên
          // ngắn bị thay nằm bên trong chúng không bị thay lồng ("phụ thân Nhị Cẩu" không thành "phụ thân Lý Nhị Cẩu...").
          protect.add(from.toLowerCase());
        }
      });
    });
    protect.forEach(k=>{if(map.has(k))protect.delete(k);});
    let re=null;
    if(map.size){
      // 1 regex duy nhất, cách viết dài xếp trước (VD 李子明 trước 李子) và thay 1 lượt — tên vừa
      // thay vào không bị quy tắc khác thay tiếp. Chức danh được bảo vệ chỉ cần có mặt để "ăn" span của mình.
      const alts=[...new Set([...map.keys(),...protect])].sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
      re=new RegExp(alts.join('|'),'gi');
    }
    _origSubCache={key,re,map};
  }
  if(!_origSubCache.re)return t;
  const wordCh=/[a-zA-ZÀ-ỹ\u0300-\u036f0-9_]/;
  return t.replace(_origSubCache.re,(m,offset,full)=>{
    // Tên viết bằng chữ Latin chỉ thay khi đứng riêng thành 1 từ (không nằm trong "Bryan" khi tên gốc là "Ryan").
    if(!containsCJK(m)){
      const prev=offset>0?full[offset-1]:'';
      const next=offset+m.length<full.length?full[offset+m.length]:'';
      if((prev&&wordCh.test(prev))||(next&&wordCh.test(next)))return m;
    }
    // Chữ Hán không có ranh giới từ: tên/danh xưng NGẮN (2 ký tự) đứng ngay sau tiền tố thứ bậc/tuổi (大/二/小/老...)
    // là 1 từ KHÁC dài hơn (大师兄, 老板...) chứ không phải tên này -> không thay, tránh ra "大Lý Minh".
    if(containsCJK(m)&&m.length<=2&&offset>0&&CHARMEM_GENERIC_CJK_MODIFIERS.includes(full[offset-1]))return m;
    return _origSubCache.map.get(m.toLowerCase())||m;   // chức danh được bảo vệ không có trong map -> giữ nguyên
  });
}

// Quét xem những nhân vật NÀO trong S.characters có tên chính hoặc alias xuất hiện literal (dạng
// chuỗi con) trong nội dung chương đang phân tích. Dùng để đảm bảo các nhân vật này LUÔN được đưa
// vào known-list gửi AI, kể cả khi họ bị rớt khỏi top 40 theo thứ hạng "gần đây/nổi bật" — tránh
// trường hợp 1 nhân vật phụ lâu không xuất hiện, ít thông tin, bị loại khỏi known-list, rồi bất ngờ
// tái xuất hiện ở chương sau: AI không có gì để đối chiếu nên rất dễ tạo ra 1 entry MỚI trùng lặp
// cho cùng 1 người thay vì nhận diện đúng.
function scanMentionedCharIds(chapterText){
  const ids=new Set();
  if(!chapterText)return ids;
  for(const c of S.characters){
    const names=[c.name,...(c.aliases||[]).filter(a=>!isBareSurnameAlias(a))].filter(n=>n&&n.trim().length>=2);   // alias họ đơn lẻ / họ+chức danh không được kéo nhầm người vào danh sách
    if(names.some(n=>chapterText.includes(n)))ids.add(c.id);
  }
  return ids;
}
// Danh sách "đã biết" gửi kèm lượt TRÍCH XUẤT (Luồng 1.1) gồm:
//  (1) nhân vật thực sự có mặt trong chương: tên chính hoặc alias (alias đã gồm cả cách viết gốc, xem ensureOrigInAliases)
//      xuất hiện literal trong văn bản chương;
//  (2) nhân vật chính — LUÔN đính kèm (làm mốc cho "relationship" của người khác), kể cả khi vắng mặt;
//  (3) nhân vật mà "name" VẪN CÒN SÓT chữ Hán sau lượt phân tích + kiểm tra lại trước đó (cờ needsTranslation, xem
//      buildCharExtractPrompt) — ép vào để model có thêm cơ hội dịch lại tên, kể cả khi vắng mặt.
// KHÔNG đính kèm nhân vật vắng mặt nào khác (kể cả nhãn mô tả tạm): việc đính kèm "một số nhân vật khác" thuộc Luồng 2
// (buildCharacterContextText, prompt dịch).
function selectKnownCharsForPrompt(chapterText){
  const mentionedIds=scanMentionedCharIds(chapterText);
  const list=S.characters.filter(c=>mentionedIds.has(c.id)||containsCJK(c.name)||isCharProtagonist(c));
  list.sort((a,b)=>{
    const pa=isCharProtagonist(a)?0:1;
    const pb=isCharProtagonist(b)?0:1;
    if(pa!==pb)return pa-pb;
    return charMentionCount(b)-charMentionCount(a);
  });
  // _charmemForced=true (gửi đủ field xưng hô/statusCue/narrRef/note) cho nhân vật có mặt hoặc còn sót chữ Hán;
  // nhân vật chính vắng mặt chỉ gửi field cơ bản (không có bằng chứng trong chương để dùng tới các field kia).
  // ref id theo từng lượt gọi (c1, c2...): AI nhận diện người theo MÃ này thay vì theo tên/alias (xem resolveEntryRefs).
  return list.map((c,i)=>({...c,_ref:'c'+(i+1),_charmemForced:mentionedIds.has(c.id)||containsCJK(c.name)}));
}
// Alias gửi cho AI: bỏ họ đơn lẻ / họ+chức danh (杨, 杨公, Lý sư huynh...) — loại alias này là nguồn nhận nhầm người.
function promptAliasesOf(c){
  const a=(c.aliases||[]).filter(x=>x&&!isBareSurnameAlias(x));
  return a.length?a:undefined;
}
// Đối chiếu trường "ref" trong các entry AI trả về với bảng mã của lượt gọi (refMap: {c1:id,...}).
// Gắn lên entry: _refId (khớp đúng 1 record), _refNew (AI báo người mới), _refBad (mã không tồn tại).
// Không có "ref" (model bỏ qua) -> không gắn gì, mergeAnalysisResults chạy như cũ. Một mã bị 2 entry cùng nhận -> cả 2 không tin (mơ hồ).
function resolveEntryRefs(found,refMap){
  if(!Array.isArray(found))return;
  const used={};
  let pinned=0,nw=0,bad=0,none=0,dup=0;
  found.forEach(f=>{
    if(!f||typeof f!=='object')return;
    delete f._refId;delete f._refNew;delete f._refBad;
    const r=String(f.ref==null?'':f.ref).normalize('NFC').trim().toLowerCase();
    if(!r&&f.isNew===true){f._refNew=true;nw++;return;}
    if(!r){none++;return;}
    if(r==='new'||r==='mới'||f.isNew===true){f._refNew=true;nw++;return;}
    const id=refMap&&refMap[r];
    if(id&&(S.characters||[]).some(x=>x.id===id)){f._refId=id;(used[id]=used[id]||[]).push(f);}
    else{f._refBad=true;bad++;}
  });
  Object.keys(used).forEach(id=>{
    if(used[id].length>1){
      used[id].forEach(f=>{delete f._refId;f._refBad=true;});
      dup+=used[id].length;
      console.log(`[Luồng 1][Ref] ${used[id].length} entry cùng nhận 1 mã (${used[id].map(f=>`"${f.name}"`).join(', ')}) -> không tin mã, khớp như cũ.`);
    }
  });
  pinned=found.filter(f=>f&&f._refId).length;
  console.log(`[Luồng 1][Ref] ${found.length} entry: ${pinned} khớp theo mã, ${nw} người mới, ${bad+dup} mã lỗi/trùng, ${none} không có ref.`);
}
function charCreatedKey(c){
  const t=parseInt(String(c.id||'').split('-')[1],36);
  if(Number.isFinite(t)&&t>1e11)return t;
  return S.characters.indexOf(c); // dự phòng: thứ tự thêm vào mảng (nhỏ hơn mọi timestamp thật → xếp sau)
}
function sortCharList(list){
  return list.sort((a,b)=>{
    // Nhân vật chính luôn ghim ở đầu danh sách, không phụ thuộc số lần xuất hiện hay chế độ sort.
    const pa=isCharProtagonist(a)?0:1;
    const pb=isCharProtagonist(b)?0:1;
    if(pa!==pb)return pa-pb;
    // Chế độ A→Z: chỉ so tên, bỏ qua hẳn tiêu chí lượt nhắc tới/độ đầy đủ thông tin bên dưới.
    if(charMemSort==='az')return a.name.localeCompare(b.name,'vi');
    // Chế độ "mới nhất": nhân vật tạo sau xếp trước. Thời điểm tạo lấy từ id ('c-<timestamp base36>-xxxx', xem newCharId);
    // id không đúng dạng (dữ liệu cũ/nhập từ nơi khác) thì dùng vị trí trong S.characters (thứ tự thêm vào).
    return charCreatedKey(b)-charCreatedKey(a);
  });
}

// ===== RENDER DANH SÁCH =====
function charNotePreview(c){
  const t=(c.note||'').trim();
  if(!t)return '';
  return t.length>90?t.slice(0,90).trim()+'…':t;
}
function charMetaParts(c){
  // Chỉ hiện những mục đã có dữ liệu (giới tính • quan hệ • vai vế/độ tuổi); mục "chưa rõ" thì bỏ hẳn, không in "Chưa rõ ..." ra thẻ.
  // fit=true: mục này được phép co lại + "…" khi dòng quá dài (quan hệ); giới tính/tuổi luôn hiện đủ.
  const parts=[];
  {const _eg=charEffGender(c);if(_eg!=='Chưa rõ')parts.push({t:_eg});}   // đã khoá hay suy đoán đều hiện như nhau; độ chắc chắn chỉ nằm ở code
  if(isCharProtagonist(c))parts.push({t:charmemStdLabel('rel','Nhân vật chính')});
  else if(!isUnknownVal(c.relationship))parts.push({t:charmemStdLabel('rel',c.relationship),fit:true});
  if(!isUnknownVal(c.statusCue))parts.push({t:charmemStdLabel('age',c.statusCue)});
  return parts;
}
function charMetaLine(c){return charMetaParts(c).map(p=>p.t).join(' • ');}
function charMetaHtml(c){
  const p=charMetaParts(c);
  if(!p.length)return '';
  return `<div class="char-item-meta" title="${esc(p.map(x=>x.t).join(' • '))}"><div class="char-item-meta-in">${p.map(x=>`<span class="m">${esc(x.t)}</span>`).join('')}</div></div>`;
}
// Ảnh bìa trên thẻ bị lỗi lúc hiển thị (link chết / mất mạng): đổi ngay sang avatar SVG.
// Ảnh TỰ GÁN thì bỏ khỏi nhân vật + đánh dấu link lỗi để tự gán ảnh khác (ngay nếu có mạng, hoặc khi có mạng lại).
// Ảnh người dùng tự chọn thì KHÔNG xoá khỏi dữ liệu, chỉ hiện avatar tạm.
function charCoverImgErr(el){
  try{
    const cover=el&&el.closest&&el.closest('.char-item-cover');
    const card=el&&el.closest&&el.closest('.char-item');
    if(!cover||!card)return;
    const c=(S.characters||[]).find(x=>String(x.id)===card.dataset.id);
    if(!c)return;
    cover.innerHTML=charCoverHtml({...c,img:''});
    if(c.imgAuto&&c.img){
      if(c.imgSrc)_charImgBad.add(c.imgSrc);
      delete c.img;delete c.imgSrc;delete c.imgAuto;delete c.imgKey;
      _charImgTried.forEach(k=>{if(k.indexOf(c.id+'|')===0)_charImgTried.delete(k);});
      Promise.resolve().then(()=>saveCharacterMemory()).catch(()=>{});
      if(!(typeof navigator!=='undefined'&&navigator.onLine===false))charImgAutoSoon(800);
    }
  }catch(e){}
}
// Ảnh bìa trên thẻ: ảnh người dùng chọn, hoặc (chưa có) ô màu theo id + chữ cái đầu của tên.
function charCoverHtml(c){
  // Ảnh phủ trọn chiều cao thẻ, không nhoè/gradient; kiểu hiển thị nằm trong character-memory.css (.char-item-cover img.fg).
  if(c.img)return `<img class="fg" src="${esc(c.img)}" alt="" draggable="false" referrerpolicy="no-referrer" onerror="charCoverImgErr(this)">`;
  return `<div class="ph" style="${charPhStyle()}">${charAvatarSvg()}</div>`;
}
const _CM_STAR='<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';
const _CM_ICON_DEL='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
// Tô sáng thẻ đang mở trong modal (gọi từ openCharModal/closeCharModal — chỉ đổi class, không vẽ lại danh sách nên không mất vị trí cuộn).
function markCharCardActive(){
  document.querySelectorAll('#charmemList .char-item').forEach(el=>el.classList.toggle('act',!!_charEditingId&&el.dataset.id===_charEditingId));
}
// Nhân vật "cần xem lại": có gợi ý sửa của AI, tên còn chữ Hán, hoặc có đề xuất nối đang chờ duyệt (nhân vật chính không tính).
function charNeedsReview(c){
  return !isCharProtagonist(c)&&!!(c.genderConflict||c.relationshipConflict||containsCJK(c.name)||sameAsPendingFor(S.characters,c.id).length>0||charNameTwins(c).length>0||suspectAliasesOf(c).length>0);
}
// Các record KHÁC có cùng TÊN HIỂN THỊ (bỏ hậu tố " (2)", " (3)"... — xem displayCharName) với c: bản dịch sẽ dùng chung 1 tên cho cả 2
// người nên dễ lẫn. Bỏ qua cặp đã được người dùng xác nhận là cùng người (đã nối) hoặc khác người (đã bấm "Không phải").
// Hậu tố " (2)", " (3)" chỉ để phân biệt khi có >=2 record cùng tên. Khi record kia đã bị gộp/xoá/đổi tên thì bỏ hậu tố (hoặc dồn về số nhỏ nhất
// còn trống). Chỉ bỏ khi không còn record KHÁC nào dùng tên đó làm tên chính hoặc alias (uniqueCharNameFor kiểm cả alias) — nếu còn thì
// 2 record cùng khớp 1 tên, lần phân tích sau sẽ ghép nhầm. Tên hiển thị không đổi nên bản dịch đã lưu không bị ảnh hưởng.
function normalizeDupSuffixes(){
  let n=0;
  (S.characters||[]).forEach(c=>{
    if(!c||!/\s*\(\d+\)\s*$/.test(String(c.name||'')))return;
    const base=displayCharName(c);
    if(!base||base===c.name)return;
    const want=uniqueCharNameFor(base,c);
    if(want===c.name)return;
    console.log(`[Luồng 1][Tên] Đổi "${c.name}" -> "${want}" (không còn record trùng tên cần phân biệt bằng hậu tố).`);
    c.name=want;n++;
  });
  return n;
}
function charNameTwins(c){
  if(!c)return [];
  const key=displayCharName(c).trim().toLowerCase();
  if(!key)return [];
  return (S.characters||[]).filter(x=>x&&x.id!==c.id&&displayCharName(x).trim().toLowerCase()===key
    &&!isMergePairRejected(c.id,x.id)&&sameAsStatus(S.characters,c.id,x.id)!=='confirmed');
}
// Mỗi thẻ: tên + sao + nhãn trạng thái; dòng giới tính • quan hệ; ghi chú tối đa 2 dòng. Cả thẻ bấm được (data-edit).
function charCardHtml(c,opts){
  const ro=!!(opts&&opts.readonly);   // readonly = thẻ chụp lúc gộp (popup "đã gộp"): không mở sửa, không xoá, không cờ trạng thái hiện tại
    const protagonist=isCharProtagonist(c);
    const hasConflict=!ro&&!!(c.genderConflict||c.relationshipConflict);
    // Tên còn sót chữ Hán/Trung Quốc chưa dịch (xem needsTranslation trong buildCharExtractPrompt) — hiện ngay trong danh sách để
    // người dùng tự sửa qua modal, khỏi chờ 1 chương sau đó tình cờ kích hoạt cơ chế tự sửa của AI.
    const untranslated=containsCJK(c.name);
    // TÊN TẠM: nhãn mô tả do AI tự đặt khi chương đầu chưa lộ tên (xem looksLikePlaceholderCharName); tự đổi khi truyện lộ tên.
    const placeholderName=!!c.namePlaceholder&&!untranslated;
    // Đề xuất nối "có thể là cùng 1 người" đang chờ duyệt (kể cả khi đã bấm "Để sau") — mở thẻ để xem banner trong modal.
    const pendingLinks=ro?[]:sameAsPendingFor(S.characters,c.id);
    const tags=[];
    if(hasConflict)tags.push('<span class="char-tag w" title="AI gợi ý sửa dữ liệu — mở để duyệt">Cần duyệt</span>');
    if(untranslated)tags.push('<span class="char-tag b" title="Tên nhân vật vẫn còn sót chữ Hán/Trung Quốc chưa được dịch — mở để sửa lại thủ công">Chưa dịch tên</span>');
    else if(placeholderName)tags.push('<span class="char-tag" title="Đây mới là tên TẠM do AI tự đặt khi chương đầu chưa nêu tên thật — sẽ tự đổi khi truyện lộ tên, hoặc mở để tự đặt ngay">Tên tạm</span>');
    if(pendingLinks.length)tags.push(`<span class="char-tag a" title="Có thể là cùng 1 người với: ${esc(pendingLinks.map(x=>x.other.name).join(', '))} — mở để duyệt">Có thể trùng</span>`);
    {
      const twins=(ro?[]:charNameTwins(c)).filter(x=>!pendingLinks.some(p=>p.other.id===x.id));
      if(twins.length)tags.push(`<span class="char-tag w" title="${_cmL('Trùng tên hiển thị với','Same display name as')}: ${esc(twins.map(x=>x.name).join(', '))} — ${_cmL('mở để gộp (cùng 1 người) hoặc đổi tên','open to merge (same person) or rename')}">${_cmL('Trùng tên','Duplicate name')}</span>`);
    }
    const note=(c.note||'').trim().slice(0,240);
    const id=esc(c.id);
    // Hiện đủ mọi nhãn trạng thái, tự xuống dòng khi hết chỗ (không còn gộp "+N").
    return `<div class="char-item${protagonist?' main':''}${!ro&&charNeedsReview(c)?' review':''}${!ro&&c.id===_charEditingId?' act':''}" data-id="${id}"${ro?'':` data-edit="${id}"`}>
      <div class="char-item-cover">${charCoverHtml(c)}</div>
      ${ro?'':`<button type="button" class="char-cover-shuffle" data-shuffle="${id}" title="Đổi ảnh ngẫu nhiên" aria-label="Đổi ảnh ngẫu nhiên">${_CM_ICON_SHUFFLE}</button>`}
      <div class="char-item-body">
        <div class="char-item-top">
          <div class="char-item-name"><span class="nm" data-i18n-skip title="${esc(c.name)}">${esc(c.name)}</span>${protagonist&&!ro?`<button type="button" class="char-protagonist-star${protagonist?' on':''}" data-star="${id}" aria-pressed="${protagonist}" title="${protagonist?'Nhân vật chính — bấm để bỏ đánh dấu':'Đặt làm nhân vật chính'}">${_CM_STAR}</button>`:''}</div>
        </div>
        ${tags.length?`<div class="char-item-tags">${tags.join('')}</div>`:''}
        ${charMetaHtml(c)}
        ${note?`<div class="char-item-note" data-i18n-skip>${esc(note)}</div>`:''}
      </div>
      ${ro?'':`<div class="char-item-actions">
        <button type="button" class="char-act-btn delete" data-del="${id}" title="Xóa" aria-label="Xóa">${_CM_ICON_DEL}</button>
      </div>`}
    </div>`;
  }
function renderCharList(){
  const box=document.getElementById('charmemList');
  if(!box)return;
  updCharMemToggleBtn();
  const sortBtn=document.getElementById('charmemSortToggle');
  if(sortBtn){
    const az=charMemSort==='az';
    sortBtn.dataset.mode=az?'az':'newest';
    sortBtn.title=az?'Đang xếp: A → Z — bấm để chuyển sang Mới nhất':'Đang xếp: Mới nhất — bấm để chuyển sang A → Z';
  }
  const cnt=document.getElementById('charmemCount');
  if(cnt)cnt.textContent=S.characters.length?String(S.characters.length):'';
  const q=(document.getElementById('charmemSearchInput')?.value||'').trim().toLowerCase();
  try{charmemSyncNoOrigLabels();}catch(e){}
  let list=S.characters.slice();
  if(q){
    // So khớp cả bản CÓ dấu (ưu tiên, chính xác hơn) lẫn bản ĐÃ BỎ DẤU, để gõ không dấu (VD "Tong")
    // vẫn tìm ra tên có dấu (VD "Tống") mà không làm lỏng lẻo tìm kiếm có dấu vốn đã hoạt động đúng.
    const qNoDiac=stripVnDiacritics(q);
    list=list.filter(c=>{
      const nameLower=c.name.toLowerCase();
      return nameLower.includes(q)||stripVnDiacritics(nameLower).includes(qNoDiac);
    });
  }
  // Nhân vật chính ghim đầu; trong mỗi nhóm theo chế độ sắp xếp đang chọn (mới nhất / A→Z).
  sortCharList(list);
  if(!list.length){
    box.innerHTML=`<div class="charmem-empty">${q?'Không tìm thấy nhân vật nào khớp.<br>Thử gõ tên khác hoặc xoá ô tìm kiếm.':'Chưa có nhân vật nào.<br>Nhân vật sẽ được thêm khi bạn dịch chương.'}</div>`;
    return;
  }
  const card=c=>charCardHtml(c);
  const main=list.filter(c=>isCharProtagonist(c));
  const review=list.filter(charNeedsReview);
  const rest=list.filter(c=>!isCharProtagonist(c)&&!charNeedsReview(c));
  box.innerHTML=[['Nhân vật chính',main],['Cần xem lại',review],['Nhân vật khác',rest]]
    .filter(g=>g[1].length)
    .map(g=>`<div class="charmem-grp">${g[0]}<i>${g[1].length}</i></div>${g[1].map(card).join('')}`).join('');
}
// Gắn 1 lần: bấm thẻ = mở modal sửa; bấm sao / nút xóa xử lý riêng (không mở modal). Thanh cuộn tự vẽ cho danh sách.
function initCharMemDrawerUI(){
  const list=document.getElementById('charmemList');
  if(!list||list._cmUI)return;
  list._cmUI=true;
  // Ảnh bìa lỗi (VD link ảnh đã chết): quay về ô màu + chữ cái đầu thay vì để icon ảnh vỡ.
  list.addEventListener('error',e=>{
    const im=e.target;
    if(!im||im.tagName!=='IMG')return;
    const cover=im.closest('.char-item-cover'),item=im.closest('.char-item');
    if(!cover||!item)return;
    const c=S.characters.find(x=>x.id===item.dataset.id);
    if(c)cover.innerHTML=charCoverHtml({...c,img:''});
  },true);
  list.addEventListener('click',e=>{
    const star=e.target.closest('[data-star]'),del=e.target.closest('[data-del]'),ed=e.target.closest('[data-edit]'),shf=e.target.closest('[data-shuffle]');
    if(shf){e.stopPropagation();charCardShuffle(shf.dataset.shuffle,shf);return;}
    if(star){toggleProtagonistStar(star.dataset.star,e);return;}
    if(del){e.stopPropagation();confirmDeleteChar(del.dataset.del);return;}
    if(ed)switchCharModal(ed.dataset.edit);
  });
  charMemScroll(list);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initCharMemDrawerUI);
else initCharMemDrawerUI();
// Modal sửa nhân vật có lớp phủ toàn màn hình (z-index cao hơn drawer) nên bấm vào thẻ ở drawer lúc modal đang mở
// chỉ rơi vào lớp phủ => đóng modal, phải bấm lần 2 mới mở nhân vật mới. Chặn sự kiện đóng ở pha capture, tìm thẻ nằm
// dưới con trỏ và mở thẳng nhân vật đó (bấm lại đúng thẻ đang sửa thì đóng modal).
document.addEventListener('mousedown',e=>{
  const ov=document.getElementById('charModalOverlay');
  if(!ov||e.target!==ov||!ov.classList.contains('show')||e.button!==0)return;
  const hit=document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.closest&&el.closest('#charmemList'));
  if(!hit||hit.closest('[data-star],[data-del],[data-shuffle]'))return;
  const card=hit.closest('[data-edit]');
  if(!card)return;
  e.stopPropagation();
  if(card.dataset.edit===_charEditingId)closeCharModal();else switchCharModal(card.dataset.edit);
},true);
// ===== MODAL CHỈNH SỬA =====
// Modal gốc (index.html) đặt .charmodal-btns làm CON của .charmodal-inner (vùng overflow-y:auto),
// dùng margin âm để tràn ra sát mép — hệ quả: thanh cuộn của trình duyệt chạy suốt cả vùng đó,
// đè lên luôn dải nút, và nút bị cuộn trôi theo nội dung. Hàm này chạy 1 lần (idempotent, kiểm tra
// parentElement trước khi move) để kéo .charmodal-btns ra làm anh em SAU .charmodal-inner, tức con
// trực tiếp của .charmodal-box — nhờ vậy thanh cuộn chỉ còn nằm trong phần thông tin, nút luôn cố
// định hiển thị ở đáy modal. Phần CSS tương ứng xem .charmodal-inner{flex:1;min-height:0} và
// .charmodal-btns (margin:0) trong character-memory.css.
function ensureCharModalBtnsFixed(){
  const overlay=document.getElementById('charModalOverlay');
  if(!overlay)return;
  const box=overlay.querySelector('.charmodal-box');
  const btns=overlay.querySelector('.charmodal-btns');
  if(box&&btns&&btns.parentElement!==box)box.appendChild(btns);
}
// Tạo ô "Độ thiện cảm" nếu HTML modal chưa có: nhân bản khối chứa ô Mối quan hệ (giữ nguyên kiểu dáng), đổi id/nhãn. Không chắc cấu trúc HTML -> mọi lỗi đều bỏ qua.
function charmemEnsureAffinityInput(){
  let el=document.getElementById('charFieldAffinity');
  if(el)return el;
  const rel=document.getElementById('charFieldRel');
  if(!rel||!rel.parentNode||!rel.parentNode.parentNode)return null;
  const host=rel.parentNode,clone=host.cloneNode(true);
  clone.querySelectorAll('details.cm-std').forEach(d=>d.remove());
  clone.querySelectorAll('[id]').forEach(n=>{if(n.id==='charFieldRel')return;n.removeAttribute('id');});
  const inp=clone.querySelector('#charFieldRel');
  if(!inp)return null;
  inp.id='charFieldAffinity';inp.value='';inp.setAttribute('placeholder',_cmL('Thân thiết / Thân thiện / Bình thường / Xa cách / Thù địch','Close / Friendly / Neutral / Distant / Hostile'));
  clone.querySelectorAll('label').forEach(l=>{if(l.hasAttribute('for'))l.setAttribute('for','charFieldAffinity');l.textContent=_cmL('Độ thiện cảm','Affinity');});
  host.parentNode.insertBefore(clone,host.nextSibling);
  return inp;
}
// Cảnh báo (KHÔNG chặn) khi người dùng gõ tên riêng vào ô xưng hô: viền đỏ + 1 dòng nhắc dưới ô.
function charmemBindAddrNameWarn(inp){
  if(!inp)return;
  const run=()=>{
    let note=inp.parentNode.querySelector('.cm-addr-warn[data-for="'+inp.id+'"]');
    const w=charmemAddrNameWarnings(inp.value);
    if(!w.length){inp.style.outline='';if(note)note.remove();return;}
    inp.style.outline='1px solid #e5484d';
    if(!note){note=document.createElement('div');note.className='cm-addr-warn';note.setAttribute('data-for',inp.id);note.style.cssText='font-size:12px;color:#e5484d;margin-top:3px';inp.parentNode.appendChild(note);}
    note.textContent=_cmL('Xưng hô chỉ nên là đại từ (tôi/anh, tớ/cậu...), không dùng tên riêng — ','Address pairs should be pronouns, not names — ')+w.join('; ');
  };
  if(!inp.dataset.cmWarnBound){inp.addEventListener('input',run);inp.dataset.cmWarnBound='1';}
  run();
}
function openCharModal(id){
  ensureCharModalBtnsFixed();
  initCharModalWidgets();
  const _wasOpen=document.getElementById('charModalOverlay').classList.contains('show');
  const c=S.characters.find(x=>x.id===id);
  if(!c)return;
  _charEditingId=id;
  markCharCardActive();
  document.getElementById('charFieldName').value=c.name||'';
  const relVal=isUnknownVal(c.relationship)?'':charmemStdLabel('rel',c.relationship);
  document.getElementById('charFieldRel').value=relVal;
  const aliasShown=charAliasesWithoutOrig(c).join(', ');
  document.getElementById('charFieldAlias').value=aliasShown;
  try{renderLinkedNamesLine(c);}catch(e){console.log('[Luồng 1][Nối] Không hiện được dòng tên đã nối:',e&&e.message||e);}
  try{renderMergedBtn(c);}catch(e){console.log('[Luồng 1][Gộp] Không hiện được nút lịch sử gộp:',e&&e.message||e);}
  const inOrigName=document.getElementById('charFieldOrigName');
  const origShown=charOrigNameList(c).join(', ');
  if(inOrigName)inOrigName.value=origShown;
  document.getElementById('charFieldNote').value=c.note||'';
  // Bắn sự kiện 'input' để spellcheck.js (gắn qua attachSpellcheck) chấm lại
  // ngay ghi chú có sẵn của nhân vật này, thay vì chỉ chấm khi user gõ mới.
  document.getElementById('charFieldNote').dispatchEvent(new Event('input'));
  // 2 field xưng hô — optional chaining vì input này cần được thêm thủ công vào modal HTML
  // (id gợi ý: charFieldAddrThemToMc / charFieldAddrMcToThem), không có thì bỏ qua an toàn.
  const inThem=document.getElementById('charFieldAddrThemToMc');
  const inMc=document.getElementById('charFieldAddrMcToThem');
  const addrThemVal=isAddrUnknown(c.addrThemToMc)?'':c.addrThemToMc;
  const addrMcVal=isAddrUnknown(c.addrMcToThem)?'':c.addrMcToThem;
  if(inThem)inThem.value=addrThemVal;
  if(inMc)inMc.value=addrMcVal;
  // Vai vế/địa vị (statusCue) — optional chaining vì input này cần được thêm thủ công vào modal HTML
  // (id gợi ý: charFieldStatusCue), không có thì bỏ qua an toàn.
  const inStatus=document.getElementById('charFieldStatusCue');
  const statusVal=isUnknownVal(c.statusCue)?'':charmemStdLabel('age',c.statusCue);
  if(inStatus)inStatus.value=statusVal;
  // Danh sách chuẩn bấm 1 chạm cho Mối quan hệ + Độ tuổi (ô nhập vẫn gõ tự do được).
  try{
    charmemAttachStdPicker(document.getElementById('charFieldRel'),CHARMEM_REL_GROUPS,'rel');   // key = kind của charmemStdLabel
    charmemAttachStdPicker(inStatus,[['',CHARMEM_AGE_BANDS.map(b=>b.label)]],'age');
  }catch(e){console.log('[Chuẩn hoá] Không gắn được bộ chọn danh sách chuẩn:',e);}
  // Cách gọi ngôi thứ 3 khi tường thuật (narrRef) — optional chaining vì input này cần được thêm
  // thủ công vào modal HTML (id gợi ý: charFieldNarrRef), không có thì bỏ qua an toàn.
  const inNarrRef=document.getElementById('charFieldNarrRef');
  const narrRefVal=isNarrRefUnknown(c.narrRef)?'':c.narrRef;
  if(inNarrRef)inNarrRef.value=narrRefVal;
  // Độ thiện cảm + cảnh báo tên riêng trong ô xưng hô. Ô charFieldAffinity chưa có trong HTML thì tự tạo (nhân bản ô Mối quan hệ); lỗi gì cũng bỏ qua an toàn.
  let affVal='';
  try{
    const inAff=charmemEnsureAffinityInput();
    affVal=isUnknownVal(c.affinity)?'':charmemStdLabel('aff',c.affinity);
    if(inAff){inAff.value=affVal;charmemAttachStdPicker(inAff,CHARMEM_AFFINITY_GROUPS,'aff');}
    charmemBindAddrNameWarn(inThem);charmemBindAddrNameWarn(inMc);
  }catch(e){console.log('[Độ thiện cảm] Không gắn được ô độ thiện cảm/cảnh báo xưng hô:',e&&e.message||e);}
  autoResizeCharNote(document.getElementById('charFieldNote'));
  const _gEff=charEffGender(c);   // đã khoá -> gender; chưa -> genderHint (suy đoán) để ô giới tính được chọn sẵn
  initCharGender(_gEff);
  _charModalGenderTouched=false;
  _charModalInitial={name:c.name||'',relationship:relVal,gender:_gEff,note:c.note||'',aliases:aliasShown,origName:origShown,addrThemToMc:addrThemVal,addrMcToThem:addrMcVal,statusCue:statusVal,narrRef:narrRefVal,affinity:affVal,img:c.img||''};
  _charModalImg=c.img||'';_charModalImgSrc=c.imgSrc||'';
  try{charPhReset();}catch(e){console.log('[Ảnh nhân vật] Không khởi tạo được khung ảnh:',e&&e.message||e);}
  populateMergeTargetSelect(id);
  setCharMergeDir('into');
  document.getElementById('charAdvToggle').classList.remove('open');
  document.getElementById('charMergeRow').classList.remove('open');
  document.getElementById('charAdvToggle').setAttribute('aria-expanded','false');
  renderCharConflictBanner(c);
  document.getElementById('charModalOverlay').classList.add('show');
  const _inner=document.querySelector('#charModalOverlay .charmodal-inner');
  if(_inner){if(!_wasOpen)_inner.scrollTop=0;if(_inner._cmScroll)_inner._cmScroll.upd();}
}
// Hiển thị (hoặc ẩn nếu không còn) banner cảnh báo mâu thuẫn dữ liệu ở đầu modal sửa nhân vật —
// chỉ xuất hiện khi c.genderConflict/relationshipConflict có gợi ý đang chờ người dùng duyệt
// (trường hợp dữ liệu cũ đã được chính người dùng xác nhận trước đó nên hệ thống không tự sửa).
// Danh sách field có cơ chế "gợi ý sửa chờ duyệt" (conflict) — field:tên trong object nhân vật,
// conflictField:tên field lưu gợi ý, label:tên hiển thị. Thêm field mới chỉ cần thêm 1 dòng ở đây,
// không phải sửa lại applyCharConflict/dismissCharConflict/renderCharConflictBanner.
const CHARMEM_CONFLICT_CONFIG=[
  {field:'name',conflictField:'nameConflict',label:'Tên nhân vật'},
  {field:'origName',conflictField:'origNameConflict',label:'Tên gốc'},
  {field:'gender',conflictField:'genderConflict',label:'Giới tính'},
  {field:'relationship',conflictField:'relationshipConflict',label:'Mối quan hệ'},
  {field:'affinity',conflictField:'affinityConflict',label:'Độ thiện cảm'},
  {field:'addrThemToMc',conflictField:'addrThemToMcConflict',label:'Họ → Nhân vật chính'},
  {field:'addrMcToThem',conflictField:'addrMcToThemConflict',label:'Nhân vật chính → Họ'},
  {field:'narrRef',conflictField:'narrRefConflict',label:'Cách gọi khi tường thuật'},
];
function renderCharConflictBanner(c){
  const host=document.querySelector('#charModalOverlay .charmodal-inner');
  if(!host)return;
  let banner=document.getElementById('charConflictBanner');
  const items=[];
  CHARMEM_CONFLICT_CONFIG.forEach(cfg=>{
    if(c[cfg.conflictField]){const _d=v=>cfg.field==='relationship'?charmemStdLabel('rel',v):cfg.field==='affinity'?charmemStdLabel('aff',v):v;items.push({field:cfg.field,label:cfg.label,cur:_d(c[cfg.field]||'Chưa rõ'),sug:_d(c[cfg.conflictField].value),reason:c[cfg.conflictField].reason});}
  });
  // Gợi ý "có thể là nhân vật chính khác" — khác cấu trúc với items ở trên (2 nhân vật, không phải
  // 1 field cũ/mới trên cùng 1 nhân vật) nên render riêng bằng 1 mẩu HTML khác, không gộp vào items.
  // 2.4: đề xuất nối với nhân vật khác (chờ duyệt) và các liên kết đã nối (để gỡ nếu nối nhầm).
  const linkHtml=renderSameAsBannerHtml(c);
  if(!items.length&&!linkHtml){
    if(banner)banner.remove();
    return;
  }
  if(!banner){
    banner=document.createElement('div');
    banner.id='charConflictBanner';
    banner.className='charmem-conflict-banner';
    host.insertBefore(banner,host.firstChild);
  }
  banner.innerHTML=items.map(it=>`
    <div class="charmem-conflict-item">
      <div class="charmem-conflict-text"><strong>⚠ AI phát hiện mâu thuẫn — ${esc(it.label)}:</strong> hiện đang là "${esc(it.cur)}", chương mới nhất gợi ý sửa thành "${esc(it.sug)}"${it.reason?` <span class="charmem-conflict-reason">(${esc(it.reason)})</span>`:''}</div>
      <div class="charmem-conflict-btns">
        <button type="button" class="btn btn-p" onclick="applyCharConflict('${c.id}','${it.field}')">Áp dụng gợi ý</button>
        <button type="button" class="btn" onclick="dismissCharConflict('${c.id}','${it.field}')">Bỏ qua</button>
      </div>
    </div>`).join('')+linkHtml;
}
// ===== 2.4 — BANNER "CÓ THỂ NỐI 2 NHÂN VẬT NÀY?" =====
// Nối = xác nhận cùng 1 người (2 record vẫn tách, chỉ bắt đầu dùng chung dữ liệu xưng hô — xem resolveSharedAddr).
// Không phải = ghi cặp bị từ chối vĩnh viễn (AI không đề xuất lại). Để sau = ẩn khỏi banner trong phiên này, đề xuất vẫn giữ nguyên.
const _sameAsSnoozed=new Set();
function _sameAsWho(x){
  const g=normalizeGenderValue(x.gender);
  const bits=[g!=='Chưa rõ'?g:'',!isUnknownVal(x.relationship)?charmemStdLabel('rel',x.relationship):''].filter(Boolean);
  return esc(x.name)+(bits.length?` <span class="charmem-conflict-reason">(${esc(bits.join(' · '))})</span>`:'');
}
function _sameAsEvidenceHtml(link){
  const ch=(link.chapter!=null&&typeof chNum==='function')?`${_cmL('chương','chapter')} ${chNum(link.chapter)}`:'';
  const bits=[ch,link.evidence].filter(Boolean).join(': ');
  return bits?` <span class="charmem-conflict-reason">(${esc(bits)})</span>`:'';
}
// Record nối 'confirmed' (cùng chuỗi liên kết) với c — dùng để HIỂN THỊ chung 1 danh sách "cùng là người này". Không ghi gì vào dữ liệu.
function linkedPeersOf(c){
  if(!c)return [];
  return sameAsConfirmedGroup(S.characters,c);   // chỉ đi qua liên kết 'confirmed'
}
// Dòng chỉ-đọc dưới ô "Tên gọi khác": tên các record đã nối với c. KHÔNG nằm trong ô nhập nên Lưu không sao chép chúng vào aliases
// (sửa bên này không đổi bên kia; gỡ nối là hết ngay). Liên kết 'suggested' không hiện.
function linkedNamesHtml(c){
  const peers=linkedPeersOf(c);
  if(!peers.length)return '';
  return 'Cùng là người với (đã liên kết): '+peers.map(x=>`<strong>${esc(x.name)}</strong>`).join(', ');
}
function renderLinkedNamesLine(c){
  const input=document.getElementById('charFieldAlias');
  if(!input)return;
  let el=document.getElementById('charLinkedNames');
  if(!el){
    el=document.createElement('div');
    el.id='charLinkedNames';
    el.style.cssText='font-size:12px;opacity:.8;margin:2px 0 8px;';
    const host=input.parentElement||input;
    if(host.insertAdjacentElement)host.insertAdjacentElement('afterend',el);else return;
  }
  const html=c?linkedNamesHtml(c):'';
  el.innerHTML=html;
  el.style.display=html?'':'none';
}
// Record "chỉ là biệt danh/nhãn": tên chính chưa phải tên định danh (cờ do AI/giám khảo đặt). Nối 'confirmed' với 1 người có tên thật
// thì nó không còn giá trị độc lập -> được đề nghị gộp vào Tên gọi khác của người đó (vẫn do người dùng bấm, không tự động).
function isNicknameOnlyRecord(x){return !!x&&!!(x.namePlaceholder||x.nameLabelByJudge)&&x.nameSource!=='user';}
async function quickMergeNickname(srcId,tgtId){
  const source=S.characters.find(x=>x.id===srcId),target=S.characters.find(x=>x.id===tgtId);
  if(!source||!target||source.id===target.id)return;
  const gs=normalizeGenderValue(source.gender),gt=normalizeGenderValue(target.gender);
  const warn=(gs!=='Chưa rõ'&&gt!=='Chưa rõ'&&gs!==gt)?`<br><br>⚠ <strong>2 nhân vật đang KHÁC giới tính</strong> (${esc(gs)} / ${esc(gt)}). Chỉ gộp nếu chắc chắn là cùng 1 người.`:'';
  showPopup({
    title:'Gộp biệt danh vào Tên gọi khác?',
    msg:`<strong>${esc(source.name)}</strong> sẽ được gộp vào <strong>${esc(target.name)}</strong> và trở thành 1 mục trong "Tên gọi khác" của nhân vật này (không bị thay cứng khi dịch). Record <strong>${esc(source.name)}</strong> sẽ bị xoá, có thể hoàn tác bằng nút lịch sử ở bên phải ô Tên gọi khác của nhân vật này (khôi phục ở mức tốt nhất). Không ảnh hưởng bản gốc/bản dịch.`+warn,
    btns:[
      {label:'Gộp',cls:'btn-p',cb:async()=>{
        mergeCharacterInto(source,target);
        closeCharModal();
        await saveCharacterMemory();
        renderCharList();
      }},
      {label:'Hủy',cls:'btn'},
    ]
  });
}
// TỰ ĐỘNG gộp biệt danh vào tên thật (không popup, không banner): record "chỉ là biệt danh/nhãn" (do bước 1.1/giám khảo đặt cờ,
// xem isNicknameOnlyRecord) đã có liên kết sameAs (suggested hoặc confirmed) với 1 record có tên thật -> gộp luôn, tên thật làm tên
// nhân vật, biệt danh vào "Tên gọi khác". Chỉ log console. Vẫn qua lưới an toàn (cặp bị từ chối / khác giới / khác quan hệ -> bỏ qua).
// `appeared` (tuỳ chọn): danh sách nhân vật xuất hiện của chương, được cập nhật để không giữ record đã bị xoá.
function autoMergeNicknameLinks(appeared){
  let total=0;
  const skipped=new Set();
  for(let round=0;round<50;round++){
    let pair=null;
    outer:for(const c of (S.characters||[])){
      if(!c||!Array.isArray(c.sameAs))continue;
      for(const e of c.sameAs){
        const o=e&&(S.characters||[]).find(x=>x.id===e.id);
        if(!o||o.id===c.id)continue;
        if(e.status!=='confirmed')continue;   // [Fix gộp nhầm] 'suggested' (chưa có bằng chứng kiểm được) chỉ hiện banner, không tự gộp
        const cNick=isNicknameOnlyRecord(c),oNick=isNicknameOnlyRecord(o);
        if(cNick===oNick)continue;   // cả 2 cùng là biệt danh hoặc cùng là tên thật: không tự quyết
        const nick=cNick?c:o,real=cNick?o:c;
        const key=mergePairKey(nick.id,real.id);
        if(skipped.has(key))continue;
        if(isMergePairRejected(nick.id,real.id)){skipped.add(key);continue;}
        if(distinctByOrigName(nick,real)){skipped.add(key);resolveDistinctOrigPair(nick,real,'nickname');continue;}
        const why=autoMergeGuard(nick,real);   // [G+H] strict + userlock + giới hạn mỗi chương
        if(why){
          skipped.add(key);
          console.log(`[Luồng 1][Gộp biệt danh] Bỏ qua gộp tự động \"${nick.name}\" -> \"${real.name}\": ${describeMergeBlock(nick,real,why)}, để người dùng tự quyết.`);
          continue;
        }
        pair={nick,real,link:e};
        break outer;
      }
    }
    if(!pair)break;
    const {nick,real,link}=pair;
    const nickName=nick.name,realName=real.name;
    mergeCharacterInto(nick,real,{path:'biet-danh',reason:(link&&link.evidence)||'Liên kết đã xác nhận'});
    if(Array.isArray(appeared)){
      const had=appeared.includes(nick);
      for(let i=appeared.length-1;i>=0;i--){if(appeared[i]===nick)appeared.splice(i,1);}
      if(had&&!appeared.includes(real))appeared.push(real);
    }
    total++;
    console.log(`[Luồng 1][Gộp biệt danh] Tự động gộp biệt danh \"${nickName}\" vào tên thật \"${realName}\" (liên kết ${link&&link.status||'?'}${link&&link.evidence?`: ${link.evidence}`:''}) — \"${nickName}\" nay nằm trong Tên gọi khác.`);
  }
  return total;
}
function renderSameAsBannerHtml(c){
  const pending=sameAsPendingFor(S.characters,c.id).filter(x=>!_sameAsSnoozed.has(mergePairKey(c.id,x.other.id)));
  const confirmed=sameAsConfirmedGroup(S.characters,c).filter(x=>{const f=findSameAsLink(S.characters,c.id,x.id);return f&&f.link.status==='confirmed';});
  const pendHtml=pending.map(x=>`
    <div class="charmem-conflict-item">
      <div class="charmem-conflict-text"><strong>🔗 ${_cmL('Có thể gộp 2 nhân vật này?','Merge these two characters?')}</strong> "${esc(c.name)}" ${_cmL('và','and')} ${_sameAsWho(x.other)} ${_cmL('có phải cùng 1 người không?','— are they the same person?')}${_sameAsEvidenceHtml(x.link)}</div>
      <div class="charmem-conflict-btns">
        <button type="button" class="btn btn-p" onclick="mergeCharPair('${c.id}','${x.other.id}')">${_cmL('Gộp','Merge')}</button>
        <button type="button" class="btn" onclick="resolveSameAsLink('${c.id}','${x.other.id}','reject')">${_cmL('Không phải','Not the same')}</button>
        <button type="button" class="btn" onclick="resolveSameAsLink('${c.id}','${x.other.id}','later')">${_cmL('Để sau','Later')}</button>
      </div>
    </div>`).join('');
  const confHtml=confirmed.map(x=>`
    <div class="charmem-conflict-item">
      <div class="charmem-conflict-text"><strong>🔗 ${_cmL('Đã liên kết (cũ):','Already linked (legacy):')}</strong> "${esc(c.name)}" ${_cmL('cùng là người với','is the same person as')} ${_sameAsWho(x)} ${_cmL('— đang dùng chung dữ liệu xưng hô. Bấm Gộp để gộp hẳn thành 1 nhân vật.','— they already share address data. Press Merge to merge them into one character.')}</div>
      <div class="charmem-conflict-btns">
        <button type="button" class="btn btn-p" onclick="mergeCharPair('${c.id}','${x.id}')">${_cmL('Gộp','Merge')}</button>
        <button type="button" class="btn" onclick="resolveSameAsLink('${c.id}','${x.id}','reject')">${_cmL('Không phải (gỡ liên kết)','Not the same (unlink)')}</button>
      </div>
    </div>`).join('');
  // Trùng TÊN HIỂN THỊ nhưng chưa có đề xuất nối nào: hỏi nối (cùng người) / không phải (người khác) / để sau; gợi ý đổi tên nếu là người khác.
  const linkedIds=new Set(sameAsPendingFor(S.characters,c.id).map(x=>x.other.id));
  const twinHtml=charNameTwins(c).filter(x=>!linkedIds.has(x.id)&&!_sameAsSnoozed.has(mergePairKey(c.id,x.id))).map(x=>{
    const oc=charOrigNameList(c).join(', '),ox=charOrigNameList(x).join(', ');
    const orig=(oc||ox)?` <span class="charmem-conflict-reason">(${_cmL('tên gốc','original names')}: "${esc(oc||'?')}" vs "${esc(ox||'?')}")</span>`:'';
    return `
    <div class="charmem-conflict-item">
      <div class="charmem-conflict-text"><strong>⚠ ${_cmL('Trùng tên:','Duplicate name:')}</strong> "${esc(displayCharName(c))}" ${_cmL('cũng là tên của','is also the name of')} ${_sameAsWho(x)}${orig}. ${_cmL('Bản dịch sẽ dùng chung 1 tên cho cả hai. Cùng 1 người thì bấm Gộp; là 2 người khác nhau thì bấm Không phải rồi đổi tên ở ô Tên cho dễ phân biệt.','The translation will use one shared name for both. If they are the same person, press Merge; if they are different people, press Not the same, then rename one in the Name field to tell them apart.')}</div>
      <div class="charmem-conflict-btns">
        <button type="button" class="btn btn-p" onclick="mergeCharPair('${c.id}','${x.id}')">${_cmL('Gộp','Merge')}</button>
        <button type="button" class="btn" onclick="resolveSameAsLink('${c.id}','${x.id}','reject')">${_cmL('Không phải','Not the same')}</button>
        <button type="button" class="btn" onclick="resolveSameAsLink('${c.id}','${x.id}','later')">${_cmL('Để sau','Later')}</button>
      </div>
    </div>`;
  }).join('');
  const sus=suspectAliasesOf(c);
  const susHtml=sus.length?`
    <div class="charmem-conflict-item">
      <div class="charmem-conflict-text"><strong>⚠ ${_cmL('Tên gọi khác có thể gây ghép nhầm:','Alias that may cause wrong merges:')}</strong> ${sus.map(a=>`"${esc(a)}"`).join(', ')} <span class="charmem-conflict-reason">(${_cmL('chỉ là họ, hoặc họ + chức danh — nhiều người có thể cùng gọi như vậy. Nếu đây là tên riêng của người này thì bấm Giữ.','just a surname or surname + title — several people may be called this. Press Keep if it really is this character\'s own name.')})</span></div>
      <div class="charmem-conflict-btns">
        <button type="button" class="btn btn-p" onclick="removeSuspectAliases('${c.id}')">${_cmL('Gỡ','Remove')}</button>
        <button type="button" class="btn" onclick="keepSuspectAliases('${c.id}')">${_cmL('Giữ','Keep')}</button>
      </div>
    </div>`:'';
  return pendHtml+twinHtml+confHtml+susHtml;
}
// Gộp 2 record (nút "Gộp" ở banner). Đích: nhân vật chính > record có tên thật (nguồn là biệt danh/nhãn) > record không có hậu tố " (n)"
// > record tạo trước. Đích là nhân vật chính thì xưng hô/quan hệ/narrRef của nguồn KHÔNG được chuyển sang (chúng là so với người khác,
// vd thân xác "Vương Vũ" được cha gọi "nhi tử"), giống bước xử lý thẻ bodyOf. Luôn hỏi xác nhận vì gộp không hoàn tác được.
async function mergeCharPair(idA,idB){
  const a=S.characters.find(x=>x.id===idA),b=S.characters.find(x=>x.id===idB);
  if(!a||!b||a.id===b.id)return;
  let target,source;
  const mc=[a,b].find(x=>isCharProtagonist(x));
  if(mc){target=mc;source=(mc===a)?b:a;}
  else{
    const na=isNicknameOnlyRecord(a),nb=isNicknameOnlyRecord(b);
    const suf=x=>/\(\d+\)\s*$/.test(String(x.name||''));
    if(na!==nb){source=na?a:b;target=na?b:a;}
    else if(suf(a)!==suf(b)){source=suf(a)?a:b;target=suf(a)?b:a;}
    else{target=S.characters.indexOf(a)<=S.characters.indexOf(b)?a:b;source=(target===a)?b:a;}
  }
  const toMc=isCharProtagonist(target);
  const gs=normalizeGenderValue(source.gender),gt=normalizeGenderValue(target.gender);
  const warn=(gs!=='Chưa rõ'&&gt!=='Chưa rõ'&&gs!==gt)?`<br><br>⚠ <strong>2 nhân vật đang KHÁC giới tính</strong> (${esc(gs)} / ${esc(gt)}). Chỉ gộp nếu chắc chắn là cùng 1 người.`:'';
  const mcNote=toMc?'<br><br>Xưng hô, quan hệ và cách gọi ngôi thứ ba của record này (so với người khác) sẽ KHÔNG được chuyển sang nhân vật chính.':'';
  showPopup({
    title:'Gộp 2 nhân vật?',
    msg:`<strong>${esc(source.name)}</strong>${sameNameHint(source,target)} sẽ được gộp vào <strong>${esc(target.name)}</strong>${sameNameHint(target,source)}; tên của nó trở thành 1 mục trong "Tên gọi khác". Record <strong>${esc(source.name)}</strong> sẽ bị xoá, nhưng có thể hoàn tác bằng nút lịch sử ở bên phải ô Tên gọi khác của nhân vật này (khôi phục ở mức tốt nhất).${mcNote}${warn}`,
    btns:[
      {label:'Gộp',cls:'btn-p',cb:async()=>{
        const srcName=source.name;
        const _preSrc=_mhClone(source);   // [D] chụp trước khi xoá xưng hô/quan hệ bên dưới
        if(toMc){
          if(source.addrSource!=='user'){source.addrThemToMc='';source.addrMcToThem='';source.addrTone='Chưa rõ';}
          if(source.relationshipSource!=='user')source.relationship='Chưa rõ';
          if(source.affinitySource!=='user')source.affinity='Chưa rõ';
          if(source.narrRefSource!=='user')source.narrRef='';
        }
        _kinMerge(source,target,null,'manual',_preSrc);
        // Tên có hậu tố " (2)" chỉ là khoá nội bộ: alias lưu dạng đã bỏ hậu tố.
        const disp=displayCharName({name:srcName});
        const seen=new Set([String(target.name||'').trim().toLowerCase()]);
        target.aliases=(target.aliases||[]).map(x=>x===srcName?disp:x).filter(x=>{const k=String(x||'').trim().toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true;});
        closeCharModal();
        await saveCharacterMemory();
        renderCharList();
      }},
      {label:'Hủy',cls:'btn'},
    ]
  });
}
async function resolveSameAsLink(idA,idB,action){
  const a=S.characters.find(x=>x.id===idA),b=S.characters.find(x=>x.id===idB);
  if(!a||!b)return;
  if(action==='later'){
    _sameAsSnoozed.add(mergePairKey(idA,idB));
  }else if(action==='confirm'){
    setSameAsStatus(S.characters,a,b,'confirmed');
    await saveCharacterMemory();
  }else if(action==='reject'){
    setSameAsStatus(S.characters,a,b,'rejected');
    await saveCharacterMemory();
  }else return;
  if(_charEditingId===idA)openCharModal(idA); else renderCharList();
}
function autoResizeCharNote(el){
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,200)+'px';
}
function toggleCharAdv(ev){
  // (Icon (i) trong tiêu đề mục đã gỡ khỏi modal nhân vật; giữ chốt chặn này phòng khi thêm lại.)
  if(ev&&ev.target&&ev.target.closest&&ev.target.closest('.label-tip'))return;
  const t=document.getElementById('charAdvToggle'),o=t.classList.toggle('open');
  document.getElementById('charMergeRow').classList.toggle('open',o);
  t.setAttribute('aria-expanded',o?'true':'false');
  if(o)setTimeout(()=>{const r=document.getElementById('charMergeRow');if(r&&r.scrollIntoView)r.scrollIntoView({block:'nearest',behavior:'smooth'});},30);
}
// ===== THANH CUỘN TỰ VẼ cho modal nhân vật =====
// Ẩn scrollbar hệ thống của `el` (class .cm-cs) và vẽ thumb bo tròn nổi bên phải (.cm-sb/.cm-sbt), tự ẩn sau khi
// ngừng cuộn, kéo được, bấm vào track để cuộn từng trang. Thanh được gắn vào PHẦN TỬ CHA của `el` nên cha phải
// có position (.charmodal-box và .cm-dd đều có). Trả về {upd} để ép tính lại khi nội dung đổi kích thước.
// Cũng gắn class .cm-at-top / .cm-at-end lên `el` để CSS vẽ đường kẻ mờ dưới header khi đã cuộn.
function charMemScroll(el){
  el.classList.add('cm-cs');
  const host=el.parentElement,bar=document.createElement('div'),th=document.createElement('div'),M=8;
  bar.className='cm-sb na';th.className='cm-sbt';bar.appendChild(th);host.appendChild(bar);
  let hideT,hover=false,drag=null,raf=0,tr=0,thh=0;
  const flash=()=>{bar.classList.add('show');clearTimeout(hideT);if(!hover&&!drag)hideT=setTimeout(()=>bar.classList.remove('show'),900);};
  function upd(){
    raf=0;
    const ch=el.clientHeight,sh=el.scrollHeight,can=sh>ch+1;
    el.classList.toggle('cm-at-top',el.scrollTop<=0);
    el.classList.toggle('cm-at-end',el.scrollTop+ch>=sh-1);
    bar.classList.toggle('na',!can);
    if(!can)return;
    tr=ch-2*M;thh=Math.max(36,tr*ch/sh);
    bar.style.top=(el.offsetTop+M)+'px';
    bar.style.left=(el.offsetLeft+el.offsetWidth-12)+'px';
    bar.style.height=tr+'px';
    th.style.height=thh+'px';
    th.style.transform='translateY('+((tr-thh)*(el.scrollTop/(sh-ch)))+'px)';
  }
  const sched=()=>{if(!raf)raf=requestAnimationFrame(upd);};
  el.addEventListener('scroll',()=>{sched();flash();},{passive:true});
  el.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')flash();});
  el.addEventListener('input',sched);
  bar.addEventListener('pointerenter',()=>{hover=true;clearTimeout(hideT);bar.classList.add('show');});
  bar.addEventListener('pointerleave',()=>{hover=false;flash();});
  th.addEventListener('pointerdown',e=>{e.preventDefault();th.setPointerCapture(e.pointerId);drag={y:e.clientY,st:el.scrollTop};bar.classList.add('drag');});
  th.addEventListener('pointermove',e=>{if(!drag)return;el.scrollTop=drag.st+(e.clientY-drag.y)*((el.scrollHeight-el.clientHeight)/Math.max(1,tr-thh));});
  const end=()=>{if(!drag)return;drag=null;bar.classList.remove('drag');flash();};
  th.addEventListener('pointerup',end);th.addEventListener('pointercancel',end);
  bar.addEventListener('pointerdown',e=>{if(e.target!==bar)return;const r=th.getBoundingClientRect();el.scrollBy({top:(e.clientY<r.top?-1:1)*el.clientHeight*.9,behavior:'smooth'});});
  if(window.ResizeObserver)new ResizeObserver(sched).observe(el);
  if(window.MutationObserver)new MutationObserver(sched).observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  window.addEventListener('resize',sched);
  sched();
  el._cmScroll={upd:sched};
  return el._cmScroll;
}
// ===== Ô CHỌN NHÂN VẬT GỘP (giao diện tự vẽ trên <select id="charFieldMergeTarget"> ẩn) =====
const _CM_CHK='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function closeCharMergeDD(){
  const dd=document.getElementById('charMergeDD');
  if(!dd||!dd.classList.contains('open'))return false;
  dd.classList.remove('open');
  const b=document.getElementById('charMergeDDBtn');if(b)b.setAttribute('aria-expanded','false');
  return true;
}
// Dựng lại danh sách từ <option> của select ẩn + cập nhật nhãn nút theo giá trị đang chọn.
function syncCharMergeDD(){
  const sel=document.getElementById('charFieldMergeTarget'),list=document.getElementById('charMergeDDList'),txt=document.getElementById('charMergeDDText');
  if(!sel||!list||!txt)return;
  const opts=[...sel.options].filter(o=>o.value);
  list.innerHTML=opts.length
    ?opts.map(o=>`<button type="button" class="cm-dd-o${o.value===sel.value?' on':''}" role="option" data-v="${esc(o.value)}"><span data-i18n-skip>${esc(o.textContent)}</span>${_CM_CHK}</button>`).join('')
    :'<div class="cm-dd-e">Chưa có nhân vật khác.</div>';
  const cur=opts.find(o=>o.value===sel.value);
  txt.textContent=cur?cur.textContent:'— Chọn nhân vật —';
  txt.className=cur?'':'ph';
  closeCharMergeDD();
}
let _charModalWidgetsInit=false;
function initCharModalWidgets(){
  if(_charModalWidgetsInit)return;
  const inner=document.querySelector('#charModalOverlay .charmodal-inner');
  const btn=document.getElementById('charMergeDDBtn'),list=document.getElementById('charMergeDDList'),overlay=document.getElementById('charModalOverlay');
  if(!inner||!btn||!list||!overlay)return;
  _charModalWidgetsInit=true;
  charMemScroll(inner);
  charMemScroll(list);
  btn.addEventListener('click',()=>{
    const dd=document.getElementById('charMergeDD'),o=!dd.classList.contains('open');
    dd.classList.toggle('open',o);btn.setAttribute('aria-expanded',o?'true':'false');
    if(o)setTimeout(()=>{if(list.scrollIntoView)list.scrollIntoView({block:'nearest',behavior:'smooth'});},30);
  });
  list.addEventListener('click',e=>{
    const op=e.target.closest('.cm-dd-o');if(!op)return;
    document.getElementById('charFieldMergeTarget').value=op.dataset.v;
    syncCharMergeDD();btn.focus();
  });
  // Bấm ra ngoài ô chọn thì đóng danh sách
  overlay.addEventListener('click',e=>{if(!e.target.closest('#charMergeDD'))closeCharMergeDD();});
  // Bàn phím: mũi tên trên nút mở/duyệt danh sách; Esc đóng danh sách (không đóng cả modal)
  overlay.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&closeCharMergeDD()){e.stopPropagation();btn.focus();return;}
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    const opts=[...list.querySelectorAll('.cm-dd-o')],i=opts.indexOf(document.activeElement);
    if(document.activeElement===btn&&e.key==='ArrowDown'){
      e.preventDefault();
      if(!document.getElementById('charMergeDD').classList.contains('open'))btn.click();
      if(opts[0])opts[0].focus();
      return;
    }
    if(i<0)return;
    e.preventDefault();
    (opts[i+(e.key==='ArrowDown'?1:-1)]||opts[i]).focus();
  });
}
function populateMergeTargetSelect(excludeId){
  const sel=document.getElementById('charFieldMergeTarget');
  // Sắp theo alphabet (localeCompare tiếng Việt) để dễ tìm nhân vật muốn gộp khi danh sách dài,
  // thay vì giữ nguyên thứ tự thêm/phát hiện nhân vật trong S.characters (thứ tự đó không có ý
  // nghĩa gì với người dùng khi họ đang cần TÌM 1 cái tên cụ thể trong dropdown).
  const others=S.characters.filter(x=>x.id!==excludeId)
    .slice()
    .sort((a,b)=>(a.name||'').localeCompare(b.name||'','vi',{sensitivity:'base'}));
  // Nhiều nhân vật TRÙNG TÊN (khác giới) -> thêm giới tính/quan hệ vào nhãn để phân biệt được trong dropdown.
  const nameCount={};
  S.characters.forEach(x=>{const k=(x.name||'').trim().toLowerCase();nameCount[k]=(nameCount[k]||0)+1;});
  const optLabel=x=>{
    if(nameCount[(x.name||'').trim().toLowerCase()]<2)return esc(x.name);
    const g=normalizeGenderValue(x.gender);
    const bits=[g!=='Chưa rõ'?g:'chưa rõ giới',!isUnknownVal(x.relationship)?charmemStdLabel('rel',x.relationship):''].filter(Boolean);
    return `${esc(x.name)} (${esc(bits.join(' · '))})`;
  };
  sel.innerHTML='<option value="">— Chọn nhân vật —</option>'+
    others.map(x=>`<option value="${x.id}" data-i18n-skip>${optLabel(x)}</option>`).join('');
  // Ẩn CẢ MỤC "Gộp nhân vật" (không chỉ dòng tiêu đề) khi không còn nhân vật khác để gộp.
  const _sec=document.getElementById('charMergeSec')||document.getElementById('charAdvToggle');
  _sec.style.display=others.length?'':'none';
  syncCharMergeDD();
}
// Set trực tiếp giới tính đang hiển thị trong modal, KHÔNG toggle — dùng khi NẠP dữ liệu nhân vật
// lúc mở modal (openCharModal). Tách riêng khỏi setCharGender() để tránh việc _charModalGender còn
// sót lại giá trị từ lần sửa nhân vật TRƯỚC ĐÓ (biến này không reset khi đóng modal) làm cho
// setCharGender() hiểu nhầm là "bấm lại chip đang chọn" rồi tự ý set về "Chưa rõ" — bug này khiến
// mở modal 1 nhân vật có giới tính TRÙNG với nhân vật vừa sửa trước đó sẽ bị hiển thị sai thành
// "Chưa rõ", và nếu người dùng bấm Lưu lúc này sẽ vô tình xoá mất dữ liệu giới tính đã có.
function initCharGender(g){
  _charModalGender=g||'Chưa rõ';
  document.querySelectorAll('#charFieldGenderRow .charmodal-chip').forEach(b=>{
    b.classList.toggle('active',b.dataset.val===_charModalGender);
  });
}
// Bấm chip giới tính trong modal — bấm lại chip đang active thì bỏ chọn (về "Chưa rõ").
function setCharGender(g){
  _charModalGenderTouched=true;
  if(_charModalGender===g)g='Chưa rõ';
  initCharGender(g);
}
function closeCharModal(){
  if(window.hideLabelTip)window.hideLabelTip();
  closeCharMergeDD();
  document.getElementById('charModalOverlay').classList.remove('show');
  _charEditingId=null;
  markCharCardActive();
  _charModalGender='Chưa rõ';
  _charModalImg='';_charModalImgSrc='';
  _charMergeDir='into';
}
// Chuyển đổi chiều gộp (xem khai báo _charMergeDir) — chỉ đổi trạng thái 2 chip, không đụng tới
// lựa chọn đang chọn trong select (danh sách "nhân vật khác" giống nhau cho cả 2 chiều).
function setCharMergeDir(dir){
  _charMergeDir=dir==='out'?'out':'into';
  document.getElementById('charMergeDirInto').classList.toggle('active',_charMergeDir==='into');
  document.getElementById('charMergeDirOut').classList.toggle('active',_charMergeDir==='out');
}
// Giữ tên cũ làm alias khi đổi tên. Bỏ qua: tên cũ rỗng/trùng tên mới/đã là alias; tên có hậu tố " (2)" (khoá nội bộ, không phải cách gọi
// thật); tên cũ đang là tên/alias của NHÂN VẬT KHÁC (2 record cùng khớp 1 tên sẽ làm nhận diện mơ hồ).
function keepOldNameAsAlias(c,oldName){
  const old=String(oldName||'').trim();
  if(!c||!old||/\(\d+\)\s*$/.test(old))return false;
  const k=normKey(old);
  if(k===normKey(c.name)||(c.aliases||[]).some(a=>normKey(a)===k))return false;
  if((S.characters||[]).some(x=>x!==c&&[x.name,...(x.aliases||[])].some(n=>normKey(n)===k)))return false;
  c.aliases=[...(c.aliases||[]),old];
  return true;
}
// ===== ẢNH NHÂN VẬT (modal sửa) =====
// Ảnh được cắt tỉ lệ 3:4, thu về 384×512 JPEG rồi lưu thẳng vào nhân vật (c.img, data URL) — đi chung IndexedDB/localStorage
// với phần còn lại của nhân vật. Các prompt gửi AI chỉ chọn field cụ thể nên không bao giờ kèm ảnh.
const _CM_ICON_CAM='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
let _charPhUIReady=false;
function _cpEl(id){return document.getElementById(id);}
function drawCharPhoto(){
  const fr=_cpEl('charPhFrame');if(!fr)return;
  const nameEl=_cpEl('charFieldName');
  const name=String((nameEl&&nameEl.value)||'?').trim();
  const inner=_charModalImg
    ?`<img src="${esc(_charModalImg)}" alt="" draggable="false" referrerpolicy="no-referrer">`
    :`<div class="ph" style="${charPhStyle()}">${charAvatarSvg()}</div>`;
  fr.innerHTML=inner;
  const del=_cpEl('charPhDel');if(del)del.hidden=!_charModalImg;
  const im=fr.querySelector('img');
  if(im)im.addEventListener('error',()=>{_charModalImg='';setCharPhotoHint('Không hiển thị được ảnh từ link này.',true);drawCharPhoto();},{once:true});
}
function setCharPhotoHint(t,err){
  const h=_cpEl('charPhHint');if(!h)return;
  h.textContent=t||'';h.classList.toggle('err',!!err);
}
function charPhReset(){
  if(!_cpEl('charPhFrame'))return;
  _charImgLastPick='';
  try{charImgPoolLoad();}catch(e){}   // làm nóng kho ảnh để bấm nút đổi ngẫu nhiên có ảnh ngay   // index.html chưa có khung ảnh -> bỏ qua an toàn
  initCharPhotoUI();
  setCharPhotoHint('');
  const row=_cpEl('charUrlRow');if(row)row.classList.remove('open');
  const u=_cpEl('charUrlIn');if(u)u.value='';
  drawCharPhoto();
}
function _cpLoadImg(src,cors){
  return new Promise((res,rej)=>{const i=new Image();if(cors)i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>rej(new Error('load'));i.src=src;});
}
// Cắt tỉ lệ 3:4, thu về 384×512 JPEG (đủ nét cho khung 112px trên màn retina).
function _cpToAvatar(img){
  const W=384,H=512,iw=img.naturalWidth,ih=img.naturalHeight;
  if(!iw||!ih)throw new Error('empty');
  let sw=iw,sh=iw*4/3;if(sh>ih){sh=ih;sw=ih*3/4;}
  const sx=(iw-sw)/2,sy=(ih-sh)*0.2;   // ảnh dọc: cắt lệch lên trên (khuôn mặt thường ở nửa trên) thay vì cắt giữa
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,W,H);
  cx.drawImage(img,sx,sy,sw,sh,0,0,W,H);
  return cv.toDataURL('image/jpeg',0.85);
}
// ===== KHO ẢNH NHÂN VẬT (tự gán ảnh theo giới tính + độ tuổi + thể loại; nút "đổi ngẫu nhiên" trong modal dùng chung) =====
// File text đặt cạnh index.html (character-images.txt), do script Pinterest xuất. Cấu trúc:
//   - dòng bắt đầu bằng # hoặc // là ghi chú;
//   - tiêu đề nhóm "[Giới tính | Độ tuổi | id thể loại]" (VD [Nam | Trẻ nhỏ | co_dai]); mỗi dòng sau đó là 1 link ảnh;
//   - Trẻ sơ sinh dùng chung Nam/Nữ (khi chọn ảnh gộp mọi nhóm sơ sinh cùng thể loại);
//   - vẫn đọc được kiểu cũ: tiêu đề [Nam] / [Nữ] / [Chung] và dòng "Tên nhân vật | link" (gán cố định theo tên).
// Độ tuổi trong file -> bậc 0..6: Trẻ sơ sinh(0) Trẻ nhỏ(1) Thiếu niên(2) Thiếu niên lớn(3, gồm cả Thanh niên) Trưởng thành(4) Trung niên(5) Cao niên(6).
// Hết ảnh ở bậc tuổi của nhân vật (cùng giới tính + thể loại) -> lùi dần xuống bậc nhỏ hơn, tới Trẻ sơ sinh là hết.
const CHARIMG_BASE=location.protocol==='file:'?'':'/';   // gốc site: / và /en/ dùng chung 1 file ở thư mục gốc (file:// giữ đường dẫn tương đối)
const CHARIMG_USE_TXT=false;                              // đã dùng character-images.js; đặt true nếu muốn thử character-images.txt trước
const CHARIMG_LIST_URL=CHARIMG_BASE+'character-images.txt';
let _charImgPool=null,_charImgPoolP=null,_charImgErr='',_charImgLastPick='';
const _charImgBad=new Set();          // link ảnh lỗi trong phiên này -> không chọn lại
const _charImgTried=new Set();        // "idNV|khoá" đã thử mà hết ảnh -> không thử lại liên tục
const CHARIMG_AGE_OF_BAND=[0,1,2,3,3,4,5,6];   // chỉ số CHARMEM_AGE_BANDS (Sơ sinh..Cao niên) -> bậc ảnh (Thanh niên dùng chung Thiếu niên lớn)
const CHARIMG_GENRE_OF={   // id thể loại con / nhóm của addr-presets.js -> id thể loại trong kho ảnh
  co_dai:'co_dai',huyen_huyen:'co_dai',vo_hiep:'co_dai',lich_su:'co_dai',ngon_tinh_cd:'co_dai',cung_dau_trach_dau:'co_dai',
  dan_quoc:'dan_quoc',
  hien_dai:'do_thi',do_thi:'do_thi',ngon_tinh_hd:'do_thi',cong_so:'do_thi',hoc_duong:'do_thi',gioi_giai_tri:'do_thi',kinh_doanh:'do_thi',
  khoa_huyen:'khoa_huyen',fantasy:'fantasy',co_dien_phuong_tay:'co_dien_phuong_tay',light_novel:'light_novel',trung_co:'trung_co'
};
function _charImgKey(s){return stripVnDiacritics(String(s||'').normalize('NFC')).toLowerCase().replace(/\s+/g,' ').trim();}
function _charImgAgeRank(s){
  const k=_charImgKey(s);
  if(/so sinh/.test(k))return 0;
  if(k==='tre nho')return 1;
  if(k==='thieu nien')return 2;
  if(k==='thieu nien lon'||k==='thanh nien')return 3;
  if(k==='truong thanh')return 4;
  if(k==='trung nien')return 5;
  if(k==='cao nien')return 6;
  return -1;
}
// Preset thể loại (kết quả AddrPresets.resolve) -> id thể loại của kho ảnh; '' nếu không map được.
function charImgGenreOf(preset){
  if(!preset)return '';
  return CHARIMG_GENRE_OF[preset.id]||CHARIMG_GENRE_OF[preset.groupId]||'';
}
function parseCharImgList(text){
  const out={v:2,groups:{},legacy:{nam:[],nu:[],chung:[]},named:{}};
  text=String(text||'').replace(/^\uFEFF/,'');
  if(/^\s*<(!doctype|html)/i.test(text))return out;   // host trả về trang HTML, không phải file kho ảnh
  let sec={t:'legacy',g:'chung'};
  text.split(/\r?\n/).forEach(raw=>{
    const line=raw.trim();
    if(!line||/^(#|\/\/)/.test(line))return;
    const h=line.match(/^\[\s*([^\]]+?)\s*\]$/);
    if(h){
      const parts=h[1].split('|').map(x=>x.trim());
      if(parts.length>=3){
        const gk=_charImgKey(parts[0]),rank=_charImgAgeRank(parts[1]),genre=_charImgKey(parts[2]).replace(/\s+/g,'_');
        sec=rank<0?{t:'skip'}:{t:'group',key:(gk==='nam'?'nam':gk==='nu'?'nu':'chung')+'|'+rank+'|'+genre};
      }else{const k=_charImgKey(parts[0]);sec={t:'legacy',g:k==='nam'?'nam':k==='nu'?'nu':'chung'};}
      return;
    }
    const m=line.match(/https?:\/\/[^\s"'<>,;\]\)\\]+/i);
    if(!m)return;
    const pre=line.slice(0,m.index).replace(/[|=:\s]+$/,'').trim();
    if(pre){const k=_charImgKey(pre);(out.named[k]=out.named[k]||[]).push(m[0]);return;}
    if(sec.t==='group')(out.groups[sec.key]=out.groups[sec.key]||[]).push(m[0]);
    else if(sec.t==='legacy')out.legacy[sec.g].push(m[0]);
  });
  Object.keys(out.groups).forEach(k=>{out.groups[k]=[...new Set(out.groups[k])];});
  ['nam','nu','chung'].forEach(k=>{out.legacy[k]=[...new Set(out.legacy[k])];});
  Object.keys(out.named).forEach(k=>{out.named[k]=[...new Set(out.named[k])];});
  return out;
}
function charImgPoolSize(p){
  if(!p)return 0;
  let n=Object.keys(p.named||{}).length;
  Object.keys(p.groups||{}).forEach(k=>{n+=p.groups[k].length;});
  ['nam','nu','chung'].forEach(k=>{n+=((p.legacy&&p.legacy[k])||[]).length;});
  return n;
}
// Kho nằm trong RAM (file ~1,2 MB, tải lại mỗi phiên khi có mạng). Không lưu localStorage: mất mạng thì cũng không tải được ảnh để gán.
function charImgPoolSync(){return (_charImgPool&&charImgPoolSize(_charImgPool))?_charImgPool:null;}
// Mở bằng file:// thì trình duyệt chặn fetch() file local, nhưng thẻ <script src> thì được. Vì vậy ngoài character-images.txt
// còn đọc được character-images.js (cùng thư mục) có dạng:  window.CHARIMG_LIST_TEXT = "<nội dung file txt>";
// Tạo file này bằng make-character-images-js.js (node make-character-images-js.js). Cùng cấu trúc, cùng parseCharImgList.
const CHARIMG_JS_URL=CHARIMG_BASE+'character-images.js';
function charImgReadViaScript(){
  return new Promise((resolve,reject)=>{
    if(typeof window.CHARIMG_LIST_TEXT==='string'&&window.CHARIMG_LIST_TEXT)return resolve(window.CHARIMG_LIST_TEXT);
    const sc=document.createElement('script');
    const t=setTimeout(()=>{sc.remove();reject(new Error('timeout'));},8000);
    sc.onload=()=>{clearTimeout(t);sc.remove();(typeof window.CHARIMG_LIST_TEXT==='string'&&window.CHARIMG_LIST_TEXT)?resolve(window.CHARIMG_LIST_TEXT):reject(new Error('empty'));};
    sc.onerror=()=>{clearTimeout(t);sc.remove();reject(new Error('missing'));};
    sc.src=location.protocol==='file:'?CHARIMG_JS_URL:CHARIMG_JS_URL+'?_='+Math.floor(Date.now()/3600000);
    document.head.appendChild(sc);
  });
}
function charImgPoolLoad(){
  if(_charImgPoolP)return _charImgPoolP;
  _charImgPoolP=(async()=>{
    let pool=null;_charImgErr='';
    const sep=CHARIMG_LIST_URL.indexOf('?')<0?'?':'&';
    const _fileProto=location.protocol==='file:';
    for(const u of (_fileProto||!CHARIMG_USE_TXT?[]:[CHARIMG_LIST_URL+sep+'_='+Date.now(),CHARIMG_LIST_URL])){
      try{
        const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);
        const r=await fetch(u,{cache:'no-store',signal:ac.signal});
        clearTimeout(t);
        if(!r.ok){_charImgErr=CHARIMG_LIST_URL+' trả về HTTP '+r.status;continue;}
        const txt=await r.text();
        if(/^\s*<(!doctype|html)/i.test(txt)){_charImgErr='server trả về trang HTML thay vì file '+CHARIMG_LIST_URL+' (file chưa được đặt cạnh index.html?)';continue;}
        const p=parseCharImgList(txt);
        if(charImgPoolSize(p)){pool=p;_charImgErr='';break;}
        _charImgErr='file '+CHARIMG_LIST_URL+' chưa có link http(s) nào — hãy điền link ảnh vào file';
      }catch(e){
        _charImgErr=location.protocol==='file:'
          ?'đang mở bằng file:// nên trình duyệt chặn đọc '+CHARIMG_LIST_URL+' (hãy chạy server local)'
          :'không tải được '+CHARIMG_LIST_URL+' ('+(e&&e.name==='AbortError'?'quá 8 giây':'lỗi mạng')+')';
      }
    }
    if(!pool){   // fetch không được (file:// hoặc lỗi mạng) -> thử đọc qua <script> character-images.js
      try{
        const txt=await charImgReadViaScript();
        const p=parseCharImgList(txt);
        if(charImgPoolSize(p)){pool=p;_charImgErr='';}
        else _charImgErr='file '+CHARIMG_JS_URL+' chưa có link http(s) nào';
      }catch(e){
        if(_fileProto)_charImgErr='đang mở bằng file:// nên không đọc được '+CHARIMG_LIST_URL+' — hãy tạo '+CHARIMG_JS_URL+' cạnh index.html bằng make-character-images-js.js (hoặc chạy server local)';
      }
    }
    if(pool)_charImgPool=pool;
    _charImgPoolP=null;
    return pool||charImgPoolSync();
  })();
  return _charImgPoolP;
}
// Chọn 1 link ảnh. o={name,gender,band(chỉ số CHARMEM_AGE_BANDS hoặc null),genre('' = mọi thể loại),exclude:Set link đã dùng}.
// Trả {url,rank} hoặc {url:'',why}. Thứ tự: ảnh gắn theo TÊN -> nhóm đúng (giới tính, bậc tuổi, thể loại) -> lùi dần bậc tuổi nhỏ hơn.
function charImgPick(pool,o){
  const ex=o.exclude||new Set();
  const ok=u=>!ex.has(u)&&!_charImgBad.has(u);
  const rnd=a=>a[Math.floor(Math.random()*a.length)];
  const nm=pool.named[_charImgKey(o.name)];
  if(nm){const l=nm.filter(ok);if(l.length)return {url:rnd(l),rank:-1};}
  const g=normalizeGenderValue(o.gender);
  const start=(o.band==null)?null:CHARIMG_AGE_OF_BAND[o.band];
  if(start!=null){
    if(g==='Chưa rõ'&&start>0)return {url:'',why:'Chưa rõ giới tính'};
    const keys=Object.keys(pool.groups);
    for(let r=start;r>=0;r--){
      const gs=(r===0)?['nam','nu','chung']:(g==='Nam'?['nam','chung']:g==='Nữ'?['nu','chung']:['chung']);
      const list=[];
      keys.forEach(k=>{
        const [kg,kr,kgenre]=k.split('|');
        if(+kr!==r||!gs.includes(kg))return;
        if(o.genre&&kgenre!==o.genre)return;
        pool.groups[k].forEach(u=>{if(ok(u))list.push(u);});
      });
      const uniq=[...new Set(list)];
      if(uniq.length)return {url:rnd(uniq),rank:r};
    }
    return {url:'',why:'Hết ảnh phù hợp trong kho'};
  }
  // Không rõ độ tuổi (chỉ dùng cho nút đổi ngẫu nhiên thủ công): lấy theo giới tính (+thể loại nếu có), mọi bậc tuổi.
  const list=[];
  Object.keys(pool.groups).forEach(k=>{
    const [kg,kr,kgenre]=k.split('|');
    if(g==='Nam'&&kg==='nu'&&+kr>0)return;
    if(g==='Nữ'&&kg==='nam'&&+kr>0)return;
    if(o.genre&&kgenre!==o.genre)return;
    pool.groups[k].forEach(u=>{if(ok(u))list.push(u);});
  });
  const L=pool.legacy||{nam:[],nu:[],chung:[]};
  [...(g==='Nam'?L.nam:g==='Nữ'?L.nu:[]),...L.chung].forEach(u=>{if(ok(u))list.push(u);});
  const uniq=[...new Set(list)];
  return uniq.length?{url:rnd(uniq),rank:-2}:{url:'',why:'Kho ảnh trống'};
}
// Link gốc các ảnh đang được nhân vật khác dùng (chống trùng). exceptId: bỏ qua nhân vật này.
function charImgUsedSet(exceptId){
  const s=new Set();
  try{(S.characters||[]).forEach(c=>{if(c&&c.imgSrc&&c.id!==exceptId)s.add(c.imgSrc);});}catch(e){}
  return s;
}
function _charImgCurGenre(){
  try{return charImgGenreOf(getAddrPreset(getCachedPromptGuidanceSync()));}catch(e){return '';}
}
// Pinterest: link kho là bản 736x (~150-230 KB) nhưng avatar chỉ 384px rộng -> tải bản 474x (nhẹ ~2.5 lần). Lỗi thì quay về link gốc.
function _charImgSmall(url){return String(url).replace('://i.pinimg.com/736x/','://i.pinimg.com/474x/');}
function _charImgLoadAsData(url){
  const withTimeout=(p)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),12000))]);
  const one=(u)=>withTimeout(_cpLoadImg(u,true).then(img=>_cpToAvatar(img)));
  const small=_charImgSmall(url);
  const first=small!==url?one(small).catch(()=>one(url)):one(url);
  return first.catch(()=>
    withTimeout(_cpLoadImg(url,false)).then(()=>url));   // server không cho cắt/thu nhỏ -> dùng thẳng link
}
// Tự gán ảnh cho nhân vật CHƯA có ảnh hoặc đang dùng ảnh TỰ GÁN (c.imgAuto). Ảnh người dùng tự chọn (imgAuto không bật) không bao giờ bị đụng tới.
// Điều kiện: có mạng + truyện đã có thể loại xưng hô thường gặp (chọn tay hoặc tự nhận diện) + biết giới tính và độ tuổi nhân vật.
// Khoá c.imgKey = "thể loại|giới tính|bậc tuổi": đổi thể loại / giới tính / nhóm tuổi -> gán lại.
let _charImgAutoBusy=false,_charImgAutoTimer=null;
function charImgAutoSoon(delay){
  clearTimeout(_charImgAutoTimer);
  _charImgAutoTimer=setTimeout(()=>{charImgAutoAssign().catch(e=>console.warn('[Ảnh nhân vật] Tự gán lỗi:',e&&e.message||e));},delay==null?1200:delay);
}
async function charImgAutoAssign(){
  if(_charImgAutoBusy)return 0;
  if(typeof S==='undefined'||!S||!Array.isArray(S.characters)||!S.characters.length)return 0;
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return 0;
  const genre=_charImgCurGenre();
  if(!genre)return 0;
  _charImgAutoBusy=true;let changed=0;
  try{
    const pool=charImgPoolSync()||await charImgPoolLoad();
    if(!pool)return 0;
    for(const c of S.characters.slice()){
      if(navigator.onLine===false)break;
      if(_charImgCurGenre()!==genre)break;   // người dùng vừa đổi thể loại giữa chừng -> lượt sau làm lại
      if(c.img&&!c.imgAuto)continue;          // ảnh do người dùng chọn
      const bi=charmemAgeBandIndex(c.statusCue),g=charEffGender(c);
      if(bi==null)continue;                   // chưa rõ độ tuổi -> chờ
      const rank=CHARIMG_AGE_OF_BAND[bi];
      if(g==='Chưa rõ'&&rank>0)continue;      // chưa rõ giới tính (trừ sơ sinh) -> chờ
      const key=genre+'|'+(rank===0?'chung':g)+'|'+rank;
      if(c.img&&c.imgAuto&&c.imgKey===key)continue;
      const tk=c.id+'|'+key;
      if(_charImgTried.has(tk))continue;
      let url='',data='';
      for(let n=0;n<10;n++){
        const used=charImgUsedSet(c.id);
        const p=charImgPick(pool,{name:c.name,gender:g,band:bi,genre,exclude:used});
        if(!p.url)break;
        try{data=await _charImgLoadAsData(p.url);url=p.url;break;}
        catch(e){_charImgBad.add(p.url);}      // ảnh lỗi -> đổi ảnh khác
      }
      if(c.img&&!c.imgAuto)continue;           // trong lúc chờ tải, người dùng đã tự chọn ảnh
      if(url){c.img=data;c.imgSrc=url;c.imgAuto=true;c.imgKey=key;changed++;}
      else{
        _charImgTried.add(tk);
        if(c.imgAuto&&c.img){delete c.img;delete c.imgSrc;delete c.imgAuto;delete c.imgKey;changed++;}   // hết ảnh -> bỏ ảnh cũ, hiện avatar SVG
      }
    }
  }finally{_charImgAutoBusy=false;}
  if(changed){
    try{await saveCharacterMemory();}catch(e){console.warn('[Ảnh nhân vật] Không lưu được:',e);}
    try{if(typeof renderCharList==='function')renderCharList();}catch(e){}
  }
  return changed;
}
try{if(typeof window!=='undefined')window.addEventListener('online',()=>charImgAutoSoon(500));}catch(e){}
// Nền ô avatar mặc định: 1 MÀU PHẲNG theo theme (không gradient, không đổi màu theo nhân vật). Màu lấy từ chữ của theme
// (currentColor) pha loãng -> sáng/tối tự đổi theo light/dark mode, kể cả khi người dùng chuyển theme lúc đang mở.
// Dòng rgba là phương án dự phòng cho trình duyệt cũ chưa có color-mix().
function charPhStyle(){
  return 'color:inherit;background:rgba(128,128,128,.18);background:color-mix(in srgb,currentColor 14%,transparent)';
}
// Avatar trung tính (icon người) bằng SVG — hiện khi nhân vật chưa có ảnh (chưa gán được / không có mạng).
function charAvatarSvg(){
  return '<svg viewBox="0 0 64 64" style="width:64%;height:64%;opacity:.45" fill="none" aria-hidden="true"><circle cx="32" cy="23" r="11" fill="currentColor"/><path d="M10 58c0-12.2 9.8-20 22-20s22 7.8 22 20" fill="currentColor"/></svg>';
}
const _CM_ICON_SHUFFLE='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';
// Nút đổi ảnh ngẫu nhiên hiện khi rê chuột vào ảnh ở thẻ nhân vật (drawer bộ nhớ): bốc 1 ảnh mới từ kho theo tên/giới tính/tuổi/thể loại
// (tránh ảnh nhân vật khác đang dùng + ảnh hiện tại), lưu luôn như ảnh người dùng tự chọn (không còn bị tự gán đè).
let _charCardShuffleBusy=false;
async function charCardShuffle(id,btn){
  if(_charCardShuffleBusy)return;
  const c=(S.characters||[]).find(x=>x.id===id);if(!c)return;
  const say=m=>{try{if(typeof setStatus==='function'){setStatus(m,3500);return;}}catch(_){}console.warn('[Ảnh nhân vật]',m);};
  _charCardShuffleBusy=true;
  if(btn){btn.classList.add('busy');btn.disabled=true;}
  try{
    let pool=charImgPoolSync();
    if(!pool)pool=await charImgPoolLoad();
    if(!pool){say(_charImgErr?('Chưa lấy được ảnh: '+_charImgErr+'.'):'Chưa lấy được ảnh. Kiểm tra kết nối mạng rồi thử lại.');return;}
    const used=charImgUsedSet(c.id);
    if(c.imgSrc)used.add(c.imgSrc);
    if(_charImgLastPick)used.add(_charImgLastPick);
    const bi=charmemAgeBandIndex(c.statusCue),g=charEffGender(c),genre=_charImgCurGenre();
    for(let n=0;n<8;n++){
      const p=charImgPick(pool,{name:c.name,gender:g,band:bi,genre,exclude:used});
      if(!p.url){say(p.why||'Kho ảnh trống.');return;}
      _charImgLastPick=p.url;
      let data='';
      try{data=await _charImgLoadAsData(p.url);}
      catch(e){_charImgBad.add(p.url);used.add(p.url);continue;}   // ảnh lỗi -> thử ảnh khác
      c.img=data;c.imgSrc=p.url;delete c.imgAuto;delete c.imgKey;
      try{   // modal đang mở đúng nhân vật này -> đồng bộ để lúc Lưu không đè lại ảnh cũ
        const ov=document.getElementById('charModalOverlay');
        if(ov&&ov.classList.contains('show')&&c.id===_charEditingId){_charModalImg=data;_charModalImgSrc=p.url;if(_charModalInitial)_charModalInitial.img=data;drawCharPhoto();}
      }catch(_){}
      await saveCharacterMemory();
      renderCharList();
      return;
    }
    say('Không tải được ảnh nào từ kho, thử lại sau.');
  }catch(e){
    console.warn('[Ảnh nhân vật] Đổi ảnh ngẫu nhiên lỗi:',e&&e.message||e);
  }finally{
    _charCardShuffleBusy=false;
    if(btn&&btn.isConnected){btn.classList.remove('busy');btn.disabled=false;}
  }
}
async function charPhShuffle(){
  const btn=_cpEl('charPhShuffle');
  if(btn)btn.classList.toggle('spin');
  let pool=charImgPoolSync();
  if(!pool){setCharPhotoHint('Đang lấy ảnh...');pool=await charImgPoolLoad();}
  if(!pool){
    console.warn('[Ảnh nhân vật] Không lấy được kho ảnh:',_charImgErr||'không rõ nguyên nhân');
    setCharPhotoHint(_charImgErr?('Chưa lấy được ảnh: '+_charImgErr+'.'):'Chưa lấy được ảnh. Kiểm tra kết nối mạng rồi thử lại.',true);
    return;
  }
  const nameEl=_cpEl('charFieldName'),stEl=_cpEl('charFieldStatusCue');
  const bi=stEl?charmemAgeBandIndex(stEl.value):null;
  const used=charImgUsedSet(_charEditingId);
  if(_charImgLastPick)used.add(_charImgLastPick);
  for(let n=0;n<8;n++){
    const _ec=(typeof S!=='undefined'&&S&&Array.isArray(S.characters))?S.characters.find(x=>x.id===_charEditingId):null;
    const p=charImgPick(pool,{name:(nameEl&&nameEl.value)||'',gender:(_charModalGender&&_charModalGender!=='Chưa rõ')?_charModalGender:charEffGender(_ec),band:bi,genre:_charImgCurGenre(),exclude:used});
    if(!p.url){setCharPhotoHint(p.why||'Kho ảnh trống.',true);return;}
    _charImgLastPick=p.url;
    if(await charPhUseUrl(p.url))return;
    used.add(p.url);   // ảnh lỗi -> thử ảnh khác
  }
}
async function charPhUseFile(file){
  if(!file)return;
  if(!/^image\//i.test(file.type||'')){setCharPhotoHint('Vui lòng chọn một file ảnh.',true);return;}
  if(file.size>25*1048576){setCharPhotoHint('Ảnh quá lớn, hãy chọn ảnh nhỏ hơn 25 MB.',true);return;}
  setCharPhotoHint('Đang xử lý ảnh...');
  const u=URL.createObjectURL(file);
  try{const img=await _cpLoadImg(u,false);_charModalImg=_cpToAvatar(img);_charModalImgSrc='';setCharPhotoHint('');drawCharPhoto();}
  catch(_){setCharPhotoHint('Không đọc được ảnh này. Hãy thử ảnh khác.',true);}
  finally{URL.revokeObjectURL(u);}
}
async function charPhUseUrl(url){
  url=String(url||'').trim();
  if(!/^https?:\/\//i.test(url)){setCharPhotoHint('Link ảnh phải bắt đầu bằng http:// hoặc https://',true);return false;}
  setCharPhotoHint('Đang tải ảnh...');
  try{const img=await _cpLoadImg(url,true);_charModalImg=_cpToAvatar(img);setCharPhotoHint('');}
  catch(_){
    try{await _cpLoadImg(url,false);_charModalImg=url;setCharPhotoHint('Máy chủ ảnh không cho thu nhỏ — đang dùng thẳng link (cần mạng mới hiện).');}
    catch(__){_charImgBad.add(url);setCharPhotoHint('Không tải được ảnh từ link này.',true);return false;}
  }
  _charModalImgSrc=url;
  drawCharPhoto();
  const row=_cpEl('charUrlRow');if(row)row.classList.remove('open');
  return true;
}
function initCharPhotoUI(){
  if(_charPhUIReady)return;
  const fr=_cpEl('charPhFrame');if(!fr)return;
  _charPhUIReady=true;
  const pick=()=>{const f=_cpEl('charPhFile');if(f)f.click();};
  fr.addEventListener('click',pick);
  _cpEl('charPhUp').addEventListener('click',pick);
  const sh=_cpEl('charPhShuffle');if(sh)sh.addEventListener('click',charPhShuffle);
  _cpEl('charPhFile').addEventListener('change',function(){charPhUseFile(this.files[0]);this.value='';});
  _cpEl('charPhLink').addEventListener('click',()=>{
    const r=_cpEl('charUrlRow');r.classList.toggle('open');
    if(r.classList.contains('open'))_cpEl('charUrlIn').focus();
  });
  _cpEl('charUrlGo').addEventListener('click',()=>charPhUseUrl(_cpEl('charUrlIn').value));
  _cpEl('charUrlIn').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();charPhUseUrl(this.value);}});
  _cpEl('charPhDel').addEventListener('click',()=>{_charModalImg='';_charModalImgSrc='';setCharPhotoHint('');drawCharPhoto();});
  ['dragenter','dragover'].forEach(t=>fr.addEventListener(t,e=>{e.preventDefault();fr.classList.add('drag');}));
  ['dragleave','drop'].forEach(t=>fr.addEventListener(t,e=>{e.preventDefault();fr.classList.remove('drag');}));
  fr.addEventListener('drop',e=>charPhUseFile(e.dataTransfer.files[0]));
  // Chưa có ảnh: chữ cái đầu trong khung đổi theo tên đang gõ.
  const nm=_cpEl('charFieldName');if(nm)nm.addEventListener('input',()=>{if(!_charModalImg)drawCharPhoto();});
  // Dán ảnh (Ctrl+V) khi modal đang mở và không đang gõ vào ô nhập.
  document.addEventListener('paste',e=>{
    const ov=_cpEl('charModalOverlay');
    if(!ov||!ov.classList.contains('show'))return;
    const f=Array.from((e.clipboardData&&e.clipboardData.files)||[]).find(x=>/^image\//.test(x.type));
    if(f){e.preventDefault();charPhUseFile(f);}
  });
}
function parseAliasInput(v){
  return (v||'').split(',').map(s=>s.trim()).filter(Boolean);
}
async function saveCharModal(opts){
  const switchTo=!!(opts&&opts.switchTo);   // true = tự lưu khi chuyển sang nhân vật khác: không đóng modal (openCharModal sẽ nạp nhân vật mới)
  if(!_charEditingId)return;
  const c=S.characters.find(x=>x.id===_charEditingId);
  if(!c)return;
  const name=document.getElementById('charFieldName').value.trim();
  if(!name){alert('Vui lòng nhập tên nhân vật.');return false;}
  const rel=document.getElementById('charFieldRel').value.trim();
  const note=document.getElementById('charFieldNote').value;
  const aliasesStr=document.getElementById('charFieldAlias').value;
  const aliases=parseAliasInput(aliasesStr);
  // QUAN TRỌNG — race condition với AI chạy nền: giữa lúc modal đang MỞ (user đọc/gõ), 1 lượt phân
  // tích chương khác có thể đang chạy song song và cập nhật CHÍNH nhân vật này (VD AI cộng dồn thêm
  // narrRef, sửa statusCue, thêm note...) trực tiếp vào object `c` trong S.characters. Nếu code cứ
  // ghi đè MỌI field bằng giá trị đang có trong DOM (vốn được nạp TỪ LÚC MỞ modal, đã lỗi thời), thì
  // chỉ cần user bấm Lưu (dù chỉ để sửa 1 field khác, ví dụ chỉ sửa "Mối quan hệ") là các field khác
  // AI vừa cập nhật xong sẽ bị "hoàn tác" ngược lại giá trị cũ — mất dữ liệu AI mới thêm mà không ai
  // hay biết. Để tránh việc này: CHỈ ghi đè field nào giá trị trong DOM THỰC SỰ khác với lúc mở modal
  // (_charModalInitial, xem openCharModal) — tức người dùng có chủ đích sửa field đó. Field nào
  // người dùng không đụng tới thì bỏ qua hoàn toàn, giữ nguyên bất kỳ giá trị nào đang có trong `c`
  // tại THỜI ĐIỂM LƯU (có thể đã được AI cập nhật sau khi modal mở), thay vì lấy theo DOM cũ.
  let _renameFrom=null;
  if(name!==(_charModalInitial.name||'')){
    _renameFrom=c.name;
    c.name=name;
    // User tự gõ tên -> khoá luôn, AI không được nâng cấp/đổi lại nữa (kể cả khi tên user gõ trông
    // giống 1 nhãn mô tả, VD user cố ý muốn gọi là "Quản gia"), đúng nguyên tắc "user luôn ưu tiên
    // hơn AI" dùng nhất quán trong file này — xem nhánh nâng cấp tên ở mergeAnalysisResults.
    c.nameSource='user';
    c.nameTransChecked=true;   // tên do người dùng chốt -> khoá hẳn, không bao giờ so lại với tên gốc
    c.nameConflict=null;
    // Người dùng sửa tên KHÔNG làm mất nhãn "Biệt danh" nếu nhân vật vẫn chưa có tên gốc (truyện chữ Hán): chỉ khoá tên, không đổi trạng thái "chưa có tên thật".
    if(charmemStoryIsCJK()&&!charOrigNameList(c).length){c.namePlaceholder=true;c.namePlaceholderNoOrig=true;}
    else c.namePlaceholder=false;
  }
  if(_charModalGender!==(_charModalInitial.gender||'Chưa rõ')||(_charModalGenderTouched&&_charModalGender&&_charModalGender!=='Chưa rõ'&&isUnknownVal(c.gender))){
    c.gender=_charModalGender;
    c.genderSource=(_charModalGender&&_charModalGender!=='Chưa rõ')?'user':'ai';
    c.genderConflict=null;
    if(_charModalGender&&_charModalGender!=='Chưa rõ'){c.genderHint='';c.genderHintSource='';}   // [Mục 2.6] người dùng chốt giới tính -> hint hết vai trò
  }
  if(rel!==(_charModalInitial.relationship||'')){
    c.relationship=charmemStdCanon('rel',rel)||'Chưa rõ';
    c.relationshipSource=rel?'user':'ai';
    c.relationshipConflict=null;
    // Người dùng tự gõ/lưu quan hệ qua modal -> đây là hành động XÁC NHẬN THỦ CÔNG, luôn được tin
    // tưởng tuyệt đối: gỡ cờ "protagonistDenied" (nếu có) để isProtagonist phản ánh ĐÚNG những gì
    // user vừa gõ. Chỉ làm việc này khi user THỰC SỰ sửa relationship — nếu không, giữ nguyên cờ cũ,
    // tránh vô tình "hồi sinh" ngôi sao nhân vật chính chỉ vì user mở modal xem rồi bấm Lưu.
    c.isProtagonist=isProtagonistLabel(rel);
    c.protagonistDenied=false;
  }
  if(note!==(_charModalInitial.note||'')){
    c.note=note;
    c.noteSource=note.trim()?'user':'ai';
  }
  if(aliasesStr!==(_charModalInitial.aliases||'')){
    c.aliases=aliases;
  }
  // Tên gốc: chỉ ghi khi người dùng thực sự sửa (cùng nguyên tắc với các field khác ở trên). Tên gốc cũ
  // bị bỏ thì cũng gỡ khỏi aliases; tên gốc mới được thêm vào aliases bởi ensureOrigInAliases bên dưới.
  // Người dùng đã sửa/xoá tay -> origNameSource='user', AI không tự điền lại nữa.
  const inOrigField=document.getElementById('charFieldOrigName');
  const origStr=inOrigField?inOrigField.value.trim():undefined;
  if(origStr!==undefined&&origStr!==(_charModalInitial.origName||'')){
    const oldList=charOrigNameList(c);
    const newList=parseOrigNames(origStr);
    const keep=new Set(newList.map(n=>n.toLowerCase()));
    const dropped=new Set(oldList.filter(n=>!keep.has(n.toLowerCase())).map(n=>n.toLowerCase()));
    c.aliases=(c.aliases||[]).filter(a=>!dropped.has(String(a||'').trim().toLowerCase()));
    c.origName='';
    setOrigNameSingle(c,newList);   // ô Tên gốc chỉ 1 tên: nhập nhiều thì tên đầu là tên gốc, các tên sau tự sang Tên gọi khác
    c.origNameSource='user';
    c.origNameConflict=null;
  }
  ensureOrigInAliases(c);
  // Người dùng đổi tên (thường: sửa biệt danh thành tên thật) -> tên cũ vào "Tên gọi khác" để lần sau ai gọi bằng tên cũ vẫn nhận ra
  // đúng nhân vật (trước đây tên cũ biến mất, chương sau AI trả lại tên cũ thì tạo nhân vật trùng).
  if(_renameFrom)keepOldNameAsAlias(c,_renameFrom);
  const inThem=document.getElementById('charFieldAddrThemToMc');
  const inMc=document.getElementById('charFieldAddrMcToThem');
  const addrThem=inThem?inThem.value.trim():undefined;
  const addrMc=inMc?inMc.value.trim():undefined;
  // Chỉ ghi đè từng chiều xưng hô NẾU chính chiều đó thực sự đổi so với lúc mở modal — trước đây
  // ghi đè cả 2 chiều bất kể có đổi hay không (miễn input tồn tại), nay tách riêng để chiều không đổi
  // không bị ghi lại giá trị DOM cũ, phòng khi AI vừa cập nhật xong chiều đó trong lúc modal mở.
  const addrThemChanged=addrThem!==undefined&&addrThem!==(_charModalInitial.addrThemToMc||'');
  const addrMcChanged=addrMc!==undefined&&addrMc!==(_charModalInitial.addrMcToThem||'');
  if(addrThemChanged){c.addrThemToMc=addrThem||'Chưa rõ';c.addrThemToMcConflict=null;}
  if(addrMcChanged){c.addrMcToThem=addrMc||'Chưa rõ';c.addrMcToThemConflict=null;}
  // Chỉ khoá addrSource='user' nếu MỘT TRONG HAI ô xưng hô thực sự đổi giá trị so với lúc mở modal.
  // Người dùng chỉ mở modal xem rồi Lưu mà không sửa gì ở đây -> giữ nguyên nguồn cũ, không khoá oan.
  if(addrThemChanged||addrMcChanged){
    c.addrSource=(addrThem||addrMc)?'user':'ai';
    if(c.addrSource==='user')c.addrTrust='verified';
  }
  const inAffSave=document.getElementById('charFieldAffinity');
  const affSave=inAffSave?inAffSave.value.trim():undefined;
  if(affSave!==undefined&&affSave!==(_charModalInitial.affinity||'')){
    c.affinity=charmemStdCanon('aff',affSave)||'Chưa rõ';c.affinitySource=affSave?'user':'ai';c.affinityConflict=null;
  }
  const inStatus=document.getElementById('charFieldStatusCue');
  const statusCue=inStatus?inStatus.value.trim():undefined;
  // Người dùng thực sự sửa -> khoá lại (AI không ghi đè). Không đổi -> bỏ qua hoàn toàn (KHÔNG còn
  // nhánh "else" ghi lại giá trị DOM cũ như bản trước — đó chính là chỗ gây mất dữ liệu AI mới thêm).
  if(statusCue!==undefined&&statusCue!==(_charModalInitial.statusCue||'')){
    c.statusCue=charmemStdCanon('age',statusCue);c.statusCueSource=statusCue?'user':'ai';
  }
  const inNarrRef=document.getElementById('charFieldNarrRef');
  const narrRef=inNarrRef?inNarrRef.value.trim():undefined;
  // Giống statusCue ở trên: chỉ ghi khi THỰC SỰ đổi so với lúc mở modal, không còn ghi lại DOM cũ khi
  // không đổi — tránh hoàn tác nhầm các lựa chọn narrRef mà AI vừa cộng dồn thêm trong lúc modal mở.
  if(narrRef!==undefined&&narrRef!==(_charModalInitial.narrRef||'')){
    c.narrRef=narrRef||'Chưa rõ';c.narrRefConflict=null;
    c.narrRefSource=narrRef?'user':'ai';
  }
  // Ảnh: chỉ ghi khi người dùng thực sự đổi so với lúc mở modal (cùng nguyên tắc với các field khác ở trên).
  if(_charModalImg!==(_charModalInitial.img||'')){
    if(_charModalImg){c.img=_charModalImg;if(_charModalImgSrc)c.imgSrc=_charModalImgSrc;else delete c.imgSrc;}
    else{delete c.img;delete c.imgSrc;}
    delete c.imgAuto;delete c.imgKey;   // người dùng đã tự chọn/xoá ảnh -> không còn là ảnh tự gán, tự gán sẽ không đụng tới
  }
  if(!switchTo)closeCharModal();
  await saveCharacterMemory();
  renderCharList();
  if(_renameFrom)onCharRenamed(c,_renameFrom,true);
  return true;
}
// Có field nào trong modal khác với lúc mở không (cùng cách so với saveCharModal) — để chỉ tự lưu khi thật sự có sửa.
function isCharModalDirty(){
  const I=_charModalInitial||{};
  const el=id=>document.getElementById(id);
  const t=id=>{const e=el(id);return e?e.value.trim():undefined;};
  const ne=(cur,init)=>cur!==undefined&&cur!==(init||'');
  return ne(t('charFieldName'),I.name)||ne(t('charFieldRel'),I.relationship)||
    ne(el('charFieldNote')&&el('charFieldNote').value,I.note)||ne(el('charFieldAlias')&&el('charFieldAlias').value,I.aliases)||
    ne(t('charFieldOrigName'),I.origName)||ne(t('charFieldAddrThemToMc'),I.addrThemToMc)||ne(t('charFieldAddrMcToThem'),I.addrMcToThem)||
    ne(t('charFieldStatusCue'),I.statusCue)||ne(t('charFieldNarrRef'),I.narrRef)||ne(t('charFieldAffinity'),I.affinity)||
    _charModalGender!==(I.gender||'Chưa rõ')||_charModalImg!==(I.img||'');
}
// Bấm sang nhân vật khác khi modal đang mở: nếu nhân vật đang sửa có thay đổi thì TỰ LƯU rồi mới mở nhân vật mới.
// Thiếu tên (không lưu được) -> báo như nút Lưu và ở lại, không bỏ dở dữ liệu.
let _charSwitching=false;
async function switchCharModal(id){
  if(_charSwitching)return;
  const ov=document.getElementById('charModalOverlay');
  if(ov&&ov.classList.contains('show')&&_charEditingId&&_charEditingId!==id&&isCharModalDirty()){
    _charSwitching=true;
    try{if(await saveCharModal({switchTo:true})===false)return;}
    catch(e){console.warn('[Nhân vật] Tự lưu khi chuyển nhân vật lỗi:',e);}
    finally{_charSwitching=false;}
  }
  openCharModal(id);
}
// Gộp `source` vào `target` (target được giữ lại). Dùng chung cho cả gộp thủ công (nút trong
// modal) lẫn gộp tự động do AI phát hiện (xem applyAutoMerges). Tên + alias của nhân vật bị gộp
// được thêm vào aliases của đích để lần phân tích sau AI nhận đúng là 1 người.
// Sau mỗi lần nạp/lưu nhân vật: lên lịch tự gán token tên cho các chương đã dịch (xem scheduleAutoTokenize).
async function loadCharacterMemory(){
  try{return await _loadCharacterMemoryRaw();}finally{try{scheduleAutoTokenize(2500);}catch(e){}try{charImgAutoSoon(3000);}catch(e){}}
}
async function saveCharacterMemory(){
  try{normalizeDupSuffixes();}catch(e){console.warn('[normalizeDupSuffixes]',e);}
  try{return await _saveCharacterMemoryRaw();}finally{try{scheduleAutoTokenize();}catch(e){}try{charImgAutoSoon();}catch(e){}}
}
// Đổi ngôn ngữ đích khi đang mở truyện: lưu bộ nhân vật của đích CŨ (S._charTgt đã ghim) rồi nạp bộ của đích MỚI
// (truyện chưa từng dịch sang đích đó → bộ rỗng; bộ của đích cũ vẫn nguyên, không xoá/gộp gì).
let _charTgtSwitching=false;
document.addEventListener('dich-tgtlang-change',async function(){
  try{
    if(_charTgtSwitching)return;
    if(typeof S==='undefined'||!S||!S.fname||!S.chapters||!S.chapters.length)return;   // chưa mở truyện
    if((S._charTgt||'vi')===_charTgtNow())return;
    _charTgtSwitching=true;
    try{await saveCharacterMemory();}catch(e){console.warn('[Luồng 1][Đổi đích] lưu bộ cũ lỗi',e);}
    S.characters=[];S.charMergeRejected=[];S.mergeHistory=[];
    await loadCharacterMemory();
  }catch(e){console.warn('[Luồng 1][Đổi đích] nạp bộ nhân vật theo đích lỗi',e);}
  finally{_charTgtSwitching=false;}
});
// ===== D. NHẬT KÝ GỘP + HOÀN TÁC =====
// Mọi lần gộp (tự động lẫn thủ công) được ghi vào S.mergeHistory để người dùng nhìn thấy và hoàn tác.
// HOÀN TÁC LÀ BEST-EFFORT, cụ thể:
//  - Record nguồn được khôi phục từ ảnh chụp ngay trước khi gộp.
//  - Record đích: so 3 bên (trước gộp / ngay sau gộp / hiện tại) cho từng trường. Trường nào đích CHƯA bị đổi từ sau lần gộp thì
//    trả về giá trị cũ; trường dạng danh sách (tên gọi khác, chương xuất hiện...) chỉ gỡ phần do lần gộp thêm vào; trường đã bị
//    sửa/ghi thêm sau đó thì GIỮ NGUYÊN (có báo cho người dùng).
//  - Trả lại cạnh quan hệ / liên kết sameAs của NGƯỜI KHÁC đã bị đổi trỏ sang đích, thẻ kin.of, và token tên trong bản dịch
//    (theo thứ tự xuất hiện; bỏ qua chương nào đã bị sửa nội dung từ sau lần gộp).
//  - KHÔNG khôi phục: thân phận giả (personas) và ảnh nhân vật.
//  - Cặp (nguồn, đích) được ghi vào charMergeRejected để các chương sau không đề xuất/tự gộp lại.
const CHARMEM_MERGE_HISTORY_MAX=400;   // popup "nhân vật đã gộp" lấy từ nhật ký này: quá hạn mức thì lần gộp cũ nhất không còn hoàn tác/hiện được
let _curMergeChapter=null;   // chương đang phân tích (đặt bởi analyzeChapterCharacters) — chỉ dùng để ghi nhật ký
const _CM_TOKEN_RE=/\u27e6c:([^:\u27e6\u27e7]+):([^\u27e6\u27e7]*)\u27e7/g;
const CHARMEM_MERGE_PATH_LABEL={'manual':'Gộp thủ công','biet-danh':'Biệt danh → tên thật','giam-khao':'Giám khảo tên','the-kin':'Thẻ quan hệ (cha/mẹ/vợ/chồng…)','bodyOf':'Thân xác của nhân vật chính','ten-goc':'Trùng tên gốc'};
// ===== G + H. CHỐT CHẶN CHUNG CHO MỌI ĐƯỜNG TỰ GỘP =====
// autoMergeGuard(src,tgt,opts) -> '' nếu được phép TỰ gộp src vào tgt, ngược lại là lý do ('gender'|'relationship'|'origname'|'age'|
// 'cooccur'|'userlock'|'cap'). src là record SẼ BỊ XOÁ. opts.strict (mặc định true): lệch tuổi 1 bậc + cùng xuất hiện như 2 entry riêng
// cũng chặn; opts.safety=false: bỏ qua lưới giới tính/quan hệ/tên gốc/tuổi (chỉ còn userlock + cap).
//  - userlock: nguồn do người dùng đặt tên hoặc khoá tên gốc -> không tự xoá record đó.
//  - cap: đã tự gộp CHARMEM_AUTO_MERGE_MAX_PER_CHAPTER lần trong chương đang phân tích -> phần còn lại chỉ đề xuất (gộp hàng loạt
//    trong 1 chương gần như chắc là AI nhầm). Chỉ áp trong lúc phân tích chương (_curMergeChapter!==null).
const CHARMEM_AUTO_MERGE_MAX_PER_CHAPTER=2;
let _autoMergeCount=0;
function autoMergeGuard(src,tgt,opts){
  opts=opts||{};
  if(src&&(src.nameSource==='user'||src.origNameSource==='user'))return 'userlock';
  if(opts.safety!==false){
    const why=sameAsSafetyBlock(src,tgt,{strict:opts.strict!==false});
    if(why)return why;
  }
  if(_curMergeChapter!==null&&_autoMergeCount>=CHARMEM_AUTO_MERGE_MAX_PER_CHAPTER)return 'cap';
  return '';
}
// Ca bị chặn vì cap/userlock: không bỏ im lặng mà ghi thành đề xuất để người dùng duyệt ở banner "Gộp / Không phải".
function autoMergeDemote(a,b,why,path){
  try{
    const res=recordSameAsProposal(S.characters,a,b,{direct:false,
      evidence:why==='cap'?'Vượt giới hạn tự gộp mỗi chương, chờ người dùng duyệt':(why==='policy'?(path==='giam-khao'?'Giám khảo nói cùng người nhưng không đối chiếu được tên gốc, chờ người dùng duyệt':path==='bodyOf'?'AI báo đây là thân xác/thân phận của nhân vật chính (chưa có bằng chứng cơ học), chờ người dùng duyệt':'Cùng vai quan hệ của cùng một người (chưa đủ bằng chứng là một), chờ người dùng duyệt'):'Nhân vật do người dùng đặt tên/tên gốc, không tự gộp'),chapter:_curMergeChapter});
    console.log(`[Luồng 1][Gộp tự động] (${path}) "${a.name}" ~ "${b.name}": ${describeMergeBlock(a,b,why)} -> chỉ đề xuất (${res}).`);
  }catch(e){console.warn('[Luồng 1][Gộp tự động] Không ghi được đề xuất:',e);}
}
// ===== F. LƯỚI RIÊNG CHO ĐƯỜNG bodyOf=MC (thân xác của nhân vật chính) =====
// Thẻ bodyOf do AI gắn, không có câu trích kiểm được bằng máy, nên chỉ tự gộp khi qua 2 lưới cơ học rẻ:
//  - 'gender': 2 bên đều đã biết giới tính và khác nhau -> không tự gộp (xuyên không đổi giới vẫn có thể đúng, nhưng để người dùng duyệt).
//  - 'cooccur': 2 bên cùng được liệt kê như 2 entry riêng ở 1 chương -> truyện đang kể 2 người cùng lúc, không phải 1 người đổi thân xác.
// Bỏ qua chương ignoreChapters khi so cooccur: chương gắn thẻ (nơi MC và thân xác mới thường cùng bị nhắc, đúng ở chính chương xuyên không).
// Tên gốc KHÁC nhau thì KHÔNG chặn (thân xác mới luôn mang tên khác). Chưa có bodyQuote; thêm sau nếu 2 lưới này không đủ.
function bodyOfBlock(rec,mc,ignoreChapters){
  const ga=normalizeGenderValue(rec.gender),gb=normalizeGenderValue(mc.gender);
  if(ga!==gb)return 'gender';   // [Fix gộp nhầm] khác giới HOẶC một bên 'Chưa rõ' (không đủ bằng chứng) đều chặn; ignoreChapters không còn dùng
  const mine=new Set((mc.mentionChapters||[]).map(String));
  if((rec.mentionChapters||[]).some(x=>mine.has(String(x))))return 'cooccur';
  return '';
}
const _MH_SKIP_KEYS=new Set(['id','img','imgSrc','imgKey','imgAuto']);
function _mhClone(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function _mhEq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
// Với mỗi token ⟦c:<id nguồn>:tên⟧ trong bản dịch: nhớ THỨ TỰ của nó trong số mọi token của chương đó (để trả lại đúng chỗ).
function _mhCaptureTokens(srcId){
  const out={};
  if(!srcId||typeof S==='undefined'||!S.translations)return out;
  const prefix='\u27e6c:'+srcId+':';
  Object.keys(S.translations).forEach(k=>{
    const t=S.translations[k];
    if(typeof t!=='string'||t.indexOf(prefix)<0)return;
    let i=0;const ord=[];
    t.replace(_CM_TOKEN_RE,(m,id)=>{if(id===srcId)ord.push(i);i++;return m;});
    if(ord.length)out[k]={ord,total:i};
  });
  return out;
}
function _mhRestoreTokens(map,srcRec,tgtId){
  const res={restored:0,skipped:0};
  if(!map||typeof S==='undefined'||!S.translations)return res;
  const nm=displayCharName(srcRec).trim();
  if(!nm||/[\u27e6\u27e7]/.test(nm))return res;
  Object.keys(map).forEach(k=>{
    const t=S.translations[k],info=map[k];
    if(typeof t!=='string'){res.skipped++;return;}
    let tot=0;t.replace(_CM_TOKEN_RE,m=>{tot++;return m;});
    if(tot!==info.total){res.skipped++;return;}   // nội dung chương đã đổi từ sau lần gộp: không đoán
    const want=new Set(info.ord);let i=0,n=0;
    const out=t.replace(_CM_TOKEN_RE,(m,id)=>{const idx=i++;if(want.has(idx)&&id===tgtId){n++;return '\u27e6c:'+srcRec.id+':'+nm+'\u27e7';}return m;});
    if(n){S.translations[k]=out;res.restored+=n;}
  });
  if(res.restored){try{if(typeof saveSession==='function')saveSession();}catch(e){}}
  return res;
}
// Ai đang trỏ tới nguồn (sẽ bị đổi sang đích khi gộp): cạnh quan hệ + sameAs của NGƯỜI KHÁC, và thẻ kin.of.
function _mhCaptureRefs(srcId,tgtId){
  const refs={edges:[],sameAs:[],kin:[]};
  (S.characters||[]).forEach(c=>{
    if(!c||c.id===srcId)return;
    if(c.kin&&c.kin.of===srcId)refs.kin.push(c.id);
    if(c.id===tgtId)return;   // cạnh/sameAs của chính đích đã nằm trong phần so sánh trường của đích
    ['edges','sameAs'].forEach(k=>{
      if(!Array.isArray(c[k]))return;
      c[k].forEach(e=>{if(e&&e.id===srcId)refs[k].push({owner:c.id,e:_mhClone(e)});});
    });
  });
  return refs;
}
function _mhBegin(source,target,opts){
  // [Fix] Từng phần chụp được bọc riêng: 1 phần lỗi (token/cạnh) KHÔNG được làm mất cả nhật ký — nếu không thì lần gộp đó
  // không có nút lịch sử để tách (lỗi user báo). Tối thiểu luôn giữ được ảnh chụp record nguồn + đích.
  const path=(opts&&opts.path)||'manual';
  const safe=(fn,def)=>{try{return fn();}catch(e){console.warn('[Luồng 1][Nhật ký gộp] Bỏ qua 1 phần chụp:',e&&e.message||e);return def;}};
  const src=safe(()=>_mhClone((opts&&opts.preSrc)||source),null)||{id:source.id,name:source.name,gender:source.gender,relationship:source.relationship,
    note:source.note||'',aliases:(source.aliases||[]).slice(),origName:source.origName||'',mentionChapters:(source.mentionChapters||[]).slice()};   // ảnh chụp tối thiểu: vẫn có thẻ + nút tách
  return {
    src,
    tgt:safe(()=>_mhClone(target),{}),
    tokens:safe(()=>_mhCaptureTokens(source.id),{}),
    refs:safe(()=>_mhCaptureRefs(source.id,target.id),{edges:[],sameAs:[],kin:[]}),
    rej:safe(()=>_mhClone((S.charMergeRejected||[]).filter(p=>Array.isArray(p)&&(p[0]===source.id||p[1]===source.id))),[]),
    chapter:path==='manual'?null:_curMergeChapter,
  };
}
function _mhCommit(h,source,target,opts){
  if(!h)return null;
  try{
    const diff={};
    try{
      new Set([...Object.keys(h.tgt),...Object.keys(target)]).forEach(k=>{
        if(_MH_SKIP_KEYS.has(k))return;
        if(!_mhEq(h.tgt[k],target[k]))diff[k]={b:h.tgt[k],a:_mhClone(target[k])};
      });
    }catch(e){console.warn('[Luồng 1][Nhật ký gộp] Không so được trường của đích (vẫn ghi nhật ký, hoàn tác sẽ bỏ qua phần đích):',e&&e.message||e);}
    const entry={
      id:'mh'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      time:Date.now(),chapter:h.chapter,path:(opts&&opts.path)||'manual',reason:(opts&&opts.reason)||'',
      srcId:source.id,srcName:h.src.name,tgtId:target.id,tgtName:target.name,
      src:h.src,diff,tokens:h.tokens,refs:h.refs,rej:h.rej,
    };
    if(!Array.isArray(S.mergeHistory))S.mergeHistory=[];
    S.mergeHistory.push(entry);
    while(S.mergeHistory.length>CHARMEM_MERGE_HISTORY_MAX)S.mergeHistory.shift();
    if(entry.path!=='manual'&&_curMergeChapter!==null){
      _autoMergeCount++;
      if(_autoMergeCount===CHARMEM_AUTO_MERGE_MAX_PER_CHAPTER)console.warn(`[Luồng 1][Gộp tự động] Đã tự gộp ${_autoMergeCount} lần trong chương này — các ca còn lại chỉ được ĐỀ XUẤT (gộp hàng loạt bất thường gần như chắc là AI nhầm).`);
    }
    return entry;
  }catch(e){console.warn('[Luồng 1][Nhật ký gộp] Không ghi được nhật ký:',e);return null;}
}
// Hoàn tác 1 lần gộp. Trả {ok,msg,kept:[tên trường giữ nguyên],tokens:{restored,skipped}}. Không tự lưu (xem undoCharacterMergeUI).
function undoCharacterMerge(histId){
  const H=Array.isArray(S.mergeHistory)?S.mergeHistory:[];
  const e=H.find(x=>x&&x.id===histId);
  if(!e)return {ok:false,msg:'Không tìm thấy bản ghi gộp này (có thể đã bị xoá khỏi nhật ký).'};
  const list=S.characters||[];
  const target=list.find(c=>c&&c.id===e.tgtId);
  if(!target){
    const later=H.find(x=>x&&x!==e&&x.srcId===e.tgtId);
    return {ok:false,msg:later?`"${e.tgtName}" đã bị gộp tiếp vào "${later.tgtName}". Hãy hoàn tác lần gộp đó trước.`:`Nhân vật "${e.tgtName}" không còn tồn tại nên không hoàn tác được.`};
  }
  if(list.some(c=>c&&c.id===e.srcId))return {ok:false,msg:`"${e.srcName}" đã có lại trong danh sách nhân vật.`};
  // (1) Đích: so 3 bên từng trường.
  const kept=[];
  Object.keys(e.diff||{}).forEach(k=>{
    const b=e.diff[k].b,a=e.diff[k].a,cur=target[k];
    if(_mhEq(cur,a)){if(b===undefined)delete target[k];else target[k]=_mhClone(b);return;}
    if(Array.isArray(a)&&(b===undefined||Array.isArray(b))&&Array.isArray(cur)){
      const bk=new Set((b||[]).map(x=>JSON.stringify(x)));
      const added=new Set(a.map(x=>JSON.stringify(x)).filter(x=>!bk.has(x)));
      if(added.size){target[k]=cur.filter(x=>!added.has(JSON.stringify(x)));return;}
    }
    kept.push(k);
  });
  // (2) Nguồn quay lại danh sách.
  const src=_mhClone(e.src);
  S.characters.push(src);
  // (3) Liên kết sameAs giữa 2 bên không còn nghĩa; cặp bị từ chối trước đó của nguồn (với người thứ ba) được trả lại.
  if(Array.isArray(src.sameAs)){src.sameAs=src.sameAs.filter(x=>!(x&&x.id===target.id));if(!src.sameAs.length)delete src.sameAs;}
  if(Array.isArray(target.sameAs)){target.sameAs=target.sameAs.filter(x=>!(x&&x.id===src.id));if(!target.sameAs.length)delete target.sameAs;}
  if(!Array.isArray(S.charMergeRejected))S.charMergeRejected=[];
  (e.rej||[]).forEach(p=>{
    const other=p[0]===src.id?p[1]:p[0];
    if(S.characters.some(c=>c&&c.id===other)&&!isMergePairRejected(src.id,other))S.charMergeRejected.push(p.slice());
  });
  markMergePairRejected(src.id,target.id);   // người dùng đã hoàn tác = "Không phải" cùng người
  // (4) Cạnh quan hệ / sameAs của người khác: đổi lại từ đích về nguồn (chỉ khi còn khớp đúng như lúc chụp).
  ['edges','sameAs'].forEach(k=>{
    ((e.refs&&e.refs[k])||[]).forEach(r=>{
      const owner=S.characters.find(c=>c&&c.id===r.owner);
      if(!owner||!Array.isArray(owner[k]))return;
      const want=JSON.stringify(Object.assign({},r.e,{id:target.id}));
      const hit=owner[k].find(x=>x&&JSON.stringify(x)===want);
      if(hit)hit.id=src.id;
    });
  });
  ((e.refs&&e.refs.kin)||[]).forEach(id=>{
    const c=S.characters.find(x=>x&&x.id===id);
    if(c&&c.kin&&(c.kin.of===target.id||(c.kin.of==='MC'&&isCharProtagonist(target))))c.kin.of=src.id;
  });
  // (5) Token tên trong bản dịch.
  const tk=_mhRestoreTokens(e.tokens,src,target.id);
  try{refreshNameTokens(target);refreshNameTokens(src);}catch(err){console.warn('[nametok]',err);}
  S.mergeHistory=H.filter(x=>x!==e);
  console.log(`[Luồng 1][Hoàn tác gộp] Đã khôi phục "${src.name}" tách khỏi "${target.name}"${kept.length?`; giữ nguyên trường đã đổi sau đó: ${kept.join(', ')}`:''}; token tên: ${tk.restored} khôi phục, ${tk.skipped} chương bỏ qua.`);
  return {ok:true,msg:'',kept,tokens:tk,srcName:src.name,tgtName:target.name};
}
// ----- Giao diện: thông báo sau gộp tự động + lịch sử gộp -----
// [Fix light mode] Trước đây nền lấy var(--bg-elev) (app không định nghĩa -> rơi về #2b2b2f tối) còn chữ lấy var(--text) (app có định nghĩa,
// ở light mode là màu TỐI) -> chữ tối trên nền tối, không đọc được. Nay nền + chữ luôn đi THÀNH CẶP, chọn theo độ sáng thật của trang.
function _mhThemeColors(){
  let dark=true;
  try{
    const lum=col=>{const m=/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(col||'');if(!m)return null;if(m[4]!==undefined&&parseFloat(m[4])===0)return null;return (0.2126*m[1]+0.7152*m[2]+0.0722*m[3])/255;};
    let l=lum(getComputedStyle(document.body).backgroundColor);
    if(l===null)l=lum(getComputedStyle(document.documentElement).backgroundColor);
    if(l===null)l=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?1:0;
    dark=l<0.5;
  }catch(e){}
  return dark?{bg:'#2b2b2f',fg:'#f2f2f5',bd:'rgba(255,255,255,.12)',dark:true}:{bg:'#ffffff',fg:'#1f1f23',bd:'rgba(0,0,0,.14)',dark:false};
}
let _mhSnackTimer=null,_mhSnackPending=[];
function _mhSnackEl(){
  let el=document.getElementById('charMergeSnack');
  if(!el){
    el=document.createElement('div');el.id='charMergeSnack';
    el.style.cssText='position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:100000;max-width:min(92vw,520px);display:none;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);font-size:14px;line-height:1.4';
    document.body.appendChild(el);
  }
  return el;
}
function _mhSnackHide(){
  _mhSnackPending=[];
  if(_mhSnackTimer){clearTimeout(_mhSnackTimer);_mhSnackTimer=null;}
  const el=typeof document!=='undefined'&&document.getElementById('charMergeSnack');
  if(el)el.style.display='none';
}
const _MH_BTN='background:none;border:0;color:var(--accent,#7aa2ff);font-weight:600;cursor:pointer;padding:4px 6px;font-size:14px';
function _mhSnackShow(html,ms){
  const el=_mhSnackEl();
  const th=_mhThemeColors();
  el.style.background=th.bg;el.style.color=th.fg;el.style.border='1px solid '+th.bd;   // chọn lại mỗi lần hiện: người dùng có thể đổi theme giữa chừng
  el.innerHTML=html;el.style.display='flex';
  if(_mhSnackTimer)clearTimeout(_mhSnackTimer);
  _mhSnackTimer=setTimeout(_mhSnackHide,ms||12000);
}
function _mhNotify(entry){
  try{
    if(!entry||entry.path==='manual'||typeof document==='undefined'||!document.body)return;
    _mhSnackPending.push(entry.id);
    const n=_mhSnackPending.length;
    const txt=n===1?`Đã gộp “${esc(entry.srcName)}” vào “${esc(entry.tgtName)}”`:`Đã tự gộp ${n} nhân vật (mới nhất: “${esc(entry.srcName)}” → “${esc(entry.tgtName)}”)`;
    const act=n===1?`<button style="${_MH_BTN}" onclick="undoCharacterMergeUI('${entry.id}')">Hoàn tác</button>`:'';
    _mhSnackShow(`<span style="flex:1;min-width:0">${txt}</span>${act}<button style="${_MH_BTN};opacity:.6" onclick="_mhSnackHide()" aria-label="Đóng">✕</button>`,12000);
  }catch(e){console.warn('[Luồng 1][Nhật ký gộp] Không hiện được thông báo:',e);}
}
async function undoCharacterMergeUI(histId){
  const r=undoCharacterMerge(histId);
  if(!r.ok){
    if(typeof showInfoPopup==='function')showInfoPopup('Không hoàn tác được',esc(r.msg));else alert(r.msg);
    return;
  }
  await saveCharacterMemory();
  try{renderCharList();}catch(e){}
  let msg=`Đã tách “${esc(r.srcName)}” khỏi “${esc(r.tgtName)}”.`;
  if(r.kept&&r.kept.length)msg+=' Một số trường của đích đã được sửa sau lần gộp nên được giữ nguyên — hãy xem lại.';
  if(r.tokens&&r.tokens.skipped)msg+=` ${r.tokens.skipped} chương dịch đã đổi nội dung nên chưa trả lại được tên.`;
  _mhSnackPending=[];
  _mhSnackShow(`<span style="flex:1;min-width:0">${msg}</span><button style="${_MH_BTN};opacity:.6" onclick="_mhSnackHide()" aria-label="Đóng">✕</button>`,9000);
}
// ----- Nút lịch sử trong ô "Tên gọi khác" + popup các nhân vật đã gộp vào nhân vật này -----
// Thẻ trong popup là ẢNH CHỤP hồ sơ lúc gộp (entry.src) — đóng băng, không cập nhật theo phân tích sau đó. Mỗi thẻ có nút hoàn tác.
const _CM_ICON_HIST='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>';
function absorbedOf(c){return c&&Array.isArray(c.absorbed)?c.absorbed.filter(a=>a&&a.id):[];}
// Entry sổ hấp thụ cần hiện ở popup: bỏ entry sinh từ 1 lần gộp mà thẻ gộp (nút hoàn tác) còn trong nhật ký — tránh hiện đôi.
function absorbedVisibleOf(c){
  const live=new Set(mergedEntriesOf(c).map(e=>e.src&&e.src.id).filter(Boolean));
  return absorbedOf(c).filter(a=>!(a.viaMerge&&a.srcId&&live.has(a.srcId)));
}
function mergedEntriesOf(c){
  return c?(Array.isArray(S.mergeHistory)?S.mergeHistory:[]).filter(e=>e&&e.tgtId===c.id&&e.src):[];
}
function absorbedPopupHtml(c){
  const A=absorbedVisibleOf(c);
  if(!A.length)return '';
  return '<div style="margin:4px 0 8px;font-weight:600">Tên bị ghép chung (không có thẻ gộp)</div>'+A.map(a=>{
    const label=[a.dispName,a.orig].filter(Boolean).map(esc).join(' · ')||esc((a.names||[]).join(', '));
    return `<div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:10px 12px;border:1px solid rgba(128,128,128,.3);border-radius:10px"><div style="flex:1;min-width:0"><div>${label}</div>`+
      `<div style="opacity:.65;font-size:12px">${a.viaMerge?'Đã gộp vào nhân vật này (nhật ký hoàn tác không còn) — nếu là người khác thì bấm Tách ra':a.unverified?'Chưa đối chiếu được tên gốc — nếu là người khác thì bấm Tách ra':'Có thể là người khác (tên gốc khác hẳn)'}${a.chapter!=null&&Number.isFinite(+a.chapter)?` — thấy ở chương ${(+a.chapter)+1}`:''}</div></div>`+
      `<button type="button" class="btn btn-p" onclick="splitAbsorbedUI('${c.id}','${a.id}')">Tách ra</button>`+
      `<button type="button" class="btn" title="Giữ chung, bỏ khỏi danh sách này" onclick="dismissAbsorbedUI('${c.id}','${a.id}')">Giữ</button></div>`;
  }).join('');
}
function mergedCharsPopupBodyHtml(c){
  const H=mergedEntriesOf(c).slice().reverse();
  const AB=absorbedPopupHtml(c);
  if(!H.length&&AB)return AB;
  if(!H.length)return '<div style="opacity:.7;padding:8px 0">Chưa có nhân vật nào được gộp vào nhân vật này.</div>';
  // Chỉ thẻ + 1 nút "Hoàn tác" ở góc phải trên thẻ (hoàn tác tách nhân vật ra, gỡ tên đã thêm khỏi "Tên gọi khác", đánh dấu "Không phải").
  const css='<style>.cmg-x{position:absolute;top:8px;right:10px;opacity:0;transition:opacity .12s}.cmg-wrap:hover .cmg-x,.cmg-x:focus-visible{opacity:1}@media (hover:none){.cmg-x{opacity:1}}</style>';
  return AB+css+H.map(e=>{
    return `<div class="cmg-wrap" style="position:relative;margin:0 0 10px">${charCardHtml(e.src,{readonly:true})}`+
      `<button type="button" class="charmodal-x cmg-x" title="Hoàn tác" aria-label="Hoàn tác gộp ${esc(e.srcName)}" onclick="undoMergedFromPopupUI('${e.id}')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`;
  }).join('');
}
function closeMergedCharsPopup(){const el=document.getElementById('charMergedPopup');if(el)el.remove();}
function showMergedCharsPopup(charId){
  const c=(S.characters||[]).find(x=>x&&x.id===charId);
  if(!c)return;
  closeMergedCharsPopup();
  const ov=document.createElement('div');
  ov.id='charMergedPopup';
  ov.dataset.cid=charId;
  ov.style.cssText='position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px';
  ov.addEventListener('mousedown',e=>{if(e.target===ov)closeMergedCharsPopup();});
  const _th=_mhThemeColors();
  ov.innerHTML=`<div style="background:${_th.bg};color:${_th.fg};border:1px solid ${_th.bd};border-radius:14px;width:min(94vw,520px);max-height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.45)">`+
    `<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid rgba(128,128,128,.25)"><strong style="flex:1">Nhân vật đã gộp vào “${esc(c.name)}”</strong><button type="button" class="charmodal-x" onclick="closeMergedCharsPopup()" aria-label="Đóng" title="Đóng"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`+
    `<div id="charMergedPopupBody" style="padding:12px 16px;overflow:auto">${mergedCharsPopupBodyHtml(c)}</div></div>`;
  document.body.appendChild(ov);
}
// Nút icon nằm TRONG ô "Tên gọi khác" (bên phải); chỉ hiện khi nhân vật có lần gộp còn trong nhật ký.
function renderMergedBtn(c){
  const input=document.getElementById('charFieldAlias');
  if(!input||!input.parentElement)return;
  let wrap=input.parentElement;
  if(wrap.id!=='charAliasWrap'){
    wrap=document.createElement('div');
    wrap.id='charAliasWrap';
    wrap.style.cssText='position:relative';
    input.parentElement.insertBefore(wrap,input);
    wrap.appendChild(input);
  }
  let btn=document.getElementById('charMergedBtn');
  const n=c?mergedEntriesOf(c).length+absorbedVisibleOf(c).length:0;
  if(!n){if(btn)btn.style.display='none';input.style.paddingRight='';return;}
  if(!btn){
    btn=document.createElement('button');
    btn.id='charMergedBtn';btn.type='button';
    btn.style.cssText='position:absolute;right:8px;top:50%;transform:translateY(-50%);width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0;border-radius:8px;color:inherit;opacity:.7;cursor:pointer;padding:0';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(_charEditingId)showMergedCharsPopup(_charEditingId);});
    wrap.appendChild(btn);
  }
  btn.innerHTML=_CM_ICON_HIST;
  btn.title=`Nhân vật đã gộp vào đây (${n})`;btn.setAttribute('aria-label',btn.title);
  btn.style.display='flex';
  input.style.paddingRight='46px';
}
// Hoàn tác 1 lần gộp từ popup. Modal đang mở -> lưu phần người dùng sửa dở rồi nạp lại để ô "Tên gọi khác" không còn giữ tên vừa tách
// (nếu không, bấm Lưu sẽ ghi tên đó ngược vào aliases).
async function undoMergedFromPopupUI(histId){
  const e=(Array.isArray(S.mergeHistory)?S.mergeHistory:[]).find(x=>x&&x.id===histId);
  if(!e)return;
  const ov=document.getElementById('charModalOverlay');
  const open=!!(ov&&ov.classList.contains('show')&&_charEditingId===e.tgtId);
  if(open&&isCharModalDirty()){
    try{if(await saveCharModal({switchTo:true})===false)return;}
    catch(err){console.warn('[Nhân vật] Tự lưu trước khi hoàn tác gộp lỗi:',err);return;}
  }
  await undoCharacterMergeUI(histId);
  const tgt=(S.characters||[]).find(c=>c&&c.id===e.tgtId);
  if(open&&tgt)openCharModal(e.tgtId);
  if(tgt&&(mergedEntriesOf(tgt).length||absorbedVisibleOf(tgt).length))showMergedCharsPopup(tgt.id);else closeMergedCharsPopup();
}
// [P3] Hoàn nguyên correction (theo corrLog) từ chương fromChapter trở đi. Không có chương (null) -> không làm gì (không đủ căn cứ).
// Đi ngược từ mới đến cũ; mỗi field trả về giá trị TRƯỚC correction cũ nhất thuộc phạm vi. Bỏ qua nếu người dùng đã khoá/sửa field.
function revertCorrectionsSince(c,fromChapter){
  if(!c||!Array.isArray(c.corrLog)||!c.corrLog.length||fromChapter===null)return 0;
  const inScope=c.corrLog.filter(e=>e&&e.chapter!==null&&e.chapter>=fromChapter);
  if(!inScope.length)return 0;
  const byField={};
  inScope.forEach(e=>{(byField[e.field]=byField[e.field]||[]).push(e);});
  let n=0;
  Object.keys(byField).forEach(f=>{
    const list=byField[f];
    const last=list[list.length-1],first=list[0];
    const srcF=first.sourceField;
    if(srcF&&c[srcF]==='user')return;            // người dùng đã tự sửa -> giữ
    if(String(c[f]||'')!==String(last.val||''))return;   // đã đổi sau correction đó -> không đụng
    c[f]=first.old;
    if(srcF)c[srcF]=first.oldSource||'ai';
    if(c.pendingCorr)delete c.pendingCorr[f];
    n++;
  });
  c.corrLog=c.corrLog.filter(e=>!(e&&e.chapter!==null&&e.chapter>=fromChapter));
  return n;
}
// Tách 1 nhân vật bị ghép chung (sổ hấp thụ) thành record riêng; đánh dấu cặp "khác người" để không bị gộp lại.
async function splitAbsorbedUI(cid,absId){
  const c=(S.characters||[]).find(x=>x&&x.id===cid);
  const ab=c&&absorbedOf(c).find(a=>a.id===absId);
  if(!c||!ab)return;
  const ov=document.getElementById('charModalOverlay');
  const open=!!(ov&&ov.classList.contains('show')&&_charEditingId===cid);
  if(open&&isCharModalDirty()){
    try{if(await saveCharModal({switchTo:true})===false)return;}catch(err){console.warn('[Nhân vật] Tự lưu trước khi tách lỗi:',err);return;}
  }
  const k=v=>String(v||'').normalize('NFC').trim().toLowerCase();
  const mine=new Set([ab.orig,...(ab.names||[])].map(k).filter(Boolean));
  c.aliases=(c.aliases||[]).filter(a=>!mine.has(k(a)));
  c.demotedOrig=(c.demotedOrig||[]).filter(a=>!mine.has(k(a)));
  const baseName=ab.dispName||ab.names.find(n=>!containsCJK(n))||ab.orig;
  const nu={id:newCharId(),name:uniqueCharNameFor(baseName,null),gender:normalizeGenderValue(ab.gender),relationship:'Chưa rõ',note:ab.note||'',
    aliases:(ab.names||[]).filter(n=>k(n)!==k(baseName)&&k(n)!==k(ab.orig)),origName:ab.orig||'',origNameSource:'ai',demotedOrig:[],
    namePlaceholder:false,nameSource:'ai',isProtagonist:false,protagonistDenied:false,protagonistPendingVotes:[],
    genderSource:'ai',relationshipSource:'ai',noteSource:'ai',mentionChapters:Number.isFinite(+ab.chapter)?[+ab.chapter]:[],
    genderConflict:null,relationshipConflict:null,genderHint:'',genderHintSource:''};
  S.characters.push(nu);
  try{ensureAllForms(S.characters);}catch(e){}
  c.absorbed=absorbedOf(c).filter(a=>a.id!==absId);
  markMergePairRejected(c.id,nu.id,'user');
  // [P3] Trả lại các field bị correction ghi đè từ chương người bị ghép nhầm xuất hiện (giới tính/quan hệ/xưng hô...).
  // Chỉ hoàn nguyên khi: correction ở chương >= chương hấp thụ, giá trị hiện tại vẫn là giá trị correction đó đặt (chưa ai sửa tiếp),
  // và field không bị người dùng khoá.
  try{
    const n=revertCorrectionsSince(c,Number.isFinite(+ab.chapter)?+ab.chapter:null);
    if(n)console.log(`[Tách] Đã hoàn nguyên ${n} field của "${c.name}" bị correction ghi đè sau khi ghép nhầm.`);
  }catch(e){console.log('[Tách] Lỗi hoàn nguyên correction, bỏ qua:',e&&e.message||e);}
  await saveCharacterMemory();
  if(open)openCharModal(cid);else renderCharList();
  if(absorbedVisibleOf(c).length||mergedEntriesOf(c).length)showMergedCharsPopup(cid);else closeMergedCharsPopup();
}
async function dismissAbsorbedUI(cid,absId){
  const c=(S.characters||[]).find(x=>x&&x.id===cid);
  if(!c)return;
  c.absorbed=absorbedOf(c).filter(a=>a.id!==absId);
  await saveCharacterMemory();
  if(_charEditingId===cid)openCharModal(cid);
  if(absorbedVisibleOf(c).length||mergedEntriesOf(c).length)showMergedCharsPopup(cid);else closeMergedCharsPopup();
}
function mergeCharacterInto(source,target,opts={}){
  const _mh=_mhBegin(source,target,opts);   // [D] ảnh chụp trước khi gộp để hoàn tác
  // Nếu đích đang mang NHÃN MÔ TẢ TẠM (VD "Thanh niên tóc vàng") còn nguồn đã có TÊN THẬT (VD "Lý Tử
  // Minh"), thì sau khi gộp phải lấy tên thật làm tên chính — chứ không phải giữ nhãn tạm chỉ vì nó
  // tình cờ nằm ở vế "target". Nhãn tạm vẫn được đưa xuống aliases ngay bên dưới (newAliases lấy
  // theo target.name CŨ nếu đổi), nên không mất khoá nhận diện cho các chương trước. Không đụng khi
  // user đã tự gõ tên cho đích.
  if((target.namePlaceholder||target.nameLabelByJudge)&&target.nameSource!=='user'&&source.name&&
     !source.namePlaceholder&&!source.nameLabelByJudge&&!containsCJK(source.name)&&!looksLikePlaceholderCharName(source.name)){
    console.log(`[Luồng 1][Tên tạm] Gộp nhân vật: đổi tên chính từ nhãn mô tả "${target.name}" sang tên thật "${source.name}".`);
    const placeholderName=target.name;
    // Cách viết gốc của NHÃN (đích) chỉ còn là alias, không thay cứng thành tên thật (xem promoteToRealName).
    demoteOrigNames(target);
    target.name=source.name;
    target.namePlaceholder=false;
    target.nameLabelByJudge=false;   // trước đây quên tắt cờ này -> record tên thật vẫn bị coi là "chỉ là biệt danh" (banner/giám khảo sai)
    target.nameConflict=null;
    target.aliases=[...(target.aliases||[]),placeholderName];
  }
  const newAliases=new Set([...(target.aliases||[]),source.name,...(source.aliases||[])]);
  newAliases.delete(target.name);
  target.aliases=[...newAliases];
  // Ghi nhớ các tên/alias vừa được nuốt vào nhân vật chính, để sau này nếu bản ghi đó hoá ra là người khác (khác tên gốc)
  // thì trả đúng các tên này về cho họ (xem resolveDistinctOrigPair).
  if(isCharProtagonist(target)){
    if(!Array.isArray(target.absorbed))target.absorbed=[];
    // [P3] Trước đây entry này không có id nên absorbedOf() lọc mất -> hết nhật ký gộp (bị cắt bớt) là hết nút Tách. Nay đủ trường để
    // splitAbsorbedUI dựng lại record; srcId để popup ẩn entry khi thẻ gộp (có nút hoàn tác) của đúng nguồn đó còn trong nhật ký.
    target.absorbed.push({id:'ab'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),time:Date.now(),srcId:source.id,viaMerge:true,
      chapter:(_curMergeChapter!==null&&Number.isFinite(+_curMergeChapter))?+_curMergeChapter:null,
      dispName:source.name,orig:charOrigNameList(source)[0]||'',gender:source.gender||'',note:String(source.note||'').slice(0,400),
      names:[source.name,...(source.aliases||[]),...charOrigNameList(source)].filter(Boolean)});
    (source.absorbed||[]).forEach(x=>target.absorbed.push(x));
  }
  // Gợi ý đổi tên đang chờ duyệt mà giá trị đã trở thành tên chính/alias sau khi gộp thì hết ý nghĩa.
  if(target.nameConflict&&(normKey(target.nameConflict.value)===normKey(target.name)||target.aliases.some(a=>normKey(a)===normKey(target.nameConflict.value))))target.nameConflict=null;
  // Tên gốc của cả 2 nhân vật đều thành tên gốc của nhân vật còn lại, để mọi cách viết trong bản gốc
  // đều được thay bằng đúng 1 tên (target.name) sau khi gộp.
  // KHÔNG còn cộng dồn mù quáng: (1) đích đã bị người dùng khoá origName -> origName nguồn chỉ thành alias
  // (nếu không, ô Tên gốc người dùng đã cố ý xoá/đặt lại sẽ bị điền lại), và cờ 'user' của NGUỒN không lan
  // sang đích; (2) nguồn là NHÃN tạm còn đích đã là tên thật -> cách viết gốc của nhãn chỉ thành alias;
  // (3) mỗi cách viết nguồn được kiểm lại (không trùng nhân vật khác, loại nguồn/đích khỏi tập "others");
  // (4) sau khi gộp rà lại origName của đích (tập "others" vừa đổi).
  {
    const srcOrigs=charOrigNameList(source);
    const targetLocked=target.origNameSource==='user';
    const demoteSrc=!!source.namePlaceholder&&!target.namePlaceholder;
    if(srcOrigs.length){
      ensureOrigInAliasesAny(target,srcOrigs);
      if(demoteSrc){
        target.demotedOrig=parseOrigNames([...(target.demotedOrig||[]),...srcOrigs]);
      }else if(targetLocked){
        console.log(`[Luồng 1][Tên gốc] Gộp "${source.name}" -> "${target.name}": ô Tên gốc của đích do người dùng khoá, chỉ thêm ${srcOrigs.join(', ')} vào alias.`);
      }else{
        const okSrc=parseOrigNames(sanitizeOrigNameCandidate(srcOrigs.join(', '),target,null,[source],{allowLabel:!!target.namePlaceholder}))
          .filter(v=>!isDemotedOrig(target,v));
        if(okSrc.length){
          // Tên gốc chỉ 1 tên: đích đã có thì tên gốc của nguồn đi vào Tên gọi khác; đích chưa có thì lấy tên đầu, còn lại alias.
          const moved=setOrigNameSingle(target,okSrc);
          const dropped=okSrc.filter(v=>normKey(v)!==normKey(target.origName));
          if(dropped.length)console.log(`[Luồng 1][Tên gốc] Gộp "${source.name}" -> "${target.name}": Tên gốc chỉ cho 1 tên (${target.origName}), chuyển ${dropped.join(', ')} sang Tên gọi khác.`);
        }
      }
    }
    if(source.demotedOrig&&source.demotedOrig.length)target.demotedOrig=parseOrigNames([...(target.demotedOrig||[]),...source.demotedOrig]);
    if(!targetLocked&&charOrigNameList(target).length){
      target.origName=sanitizeOrigNameCandidate(charOrigNameList(target).join(', '),target,null,[source],{allowLabel:!!target.namePlaceholder});
    }
    if(charOrigNameList(target).length>1)setOrigNameSingle(target,[]);   // phòng đích (kể cả do người dùng khoá) đang có >1 tên gốc
    if(!target.origNameSource)target.origNameSource='ai';
  }
  ensureOrigInAliases(target);
  // Bổ sung field còn thiếu ở đích từ nguồn, tôn trọng ưu tiên user > ai, không ghi đè field đã có
  if(isUnknownVal(target.gender)&&!isUnknownVal(source.gender)){
    target.gender=source.gender;target.genderSource=source.genderSource||'ai';
  }
  // [Mục 2] genderHint khi gộp record: chỉ giữ khi gender vẫn chưa rõ; 2 hint khác nhau thì bỏ cả hai.
  if(!isUnknownVal(target.gender)){target.genderHint='';target.genderHintSource='';}
  else if(!target.genderHint&&source.genderHint){target.genderHint=source.genderHint;target.genderHintSource=source.genderHintSource||'model-guess';}
  else if(target.genderHint&&source.genderHint&&target.genderHint!==source.genderHint){target.genderHint='';target.genderHintSource='';}
  if(isUnknownVal(target.relationship)&&!isUnknownVal(source.relationship)){
    target.relationship=source.relationship;target.relationshipSource=source.relationshipSource||'ai';
  }
  // statusCue (vai vế/địa vị) trước đây KHÔNG được gộp -> mất hẳn khi gộp nếu đích chưa có.
  if((!target.statusCue||!target.statusCue.trim())&&source.statusCue&&source.statusCue.trim()){
    target.statusCue=source.statusCue;target.statusCueSource=source.statusCueSource||'ai';
  }
  if(!target.img&&source.img){target.img=source.img;if(source.imgSrc)target.imgSrc=source.imgSrc;if(source.imgAuto){target.imgAuto=true;target.imgKey=source.imgKey;}}   // gộp nhân vật: đích chưa có ảnh thì nhận ảnh của nguồn
  if(!target.genderConflict&&source.genderConflict)target.genderConflict=source.genderConflict;
  if(!target.relationshipConflict&&source.relationshipConflict)target.relationshipConflict=source.relationshipConflict;
  // Nhớ lại TRƯỚC KHI ghi đè: target có đang hoàn toàn chưa có dữ liệu xưng hô nào không — dùng để
  // quyết định có nên nhận luôn addrTone của source hay không (xem bên dưới), tránh so target.addrTone
  // (đã bị ghi đè) mà tưởng nhầm là target "vẫn chưa có" trong khi thực ra vừa mới nhận dữ liệu.
  const targetAddrWasEmpty=isAddrUnknown(target.addrThemToMc)&&isAddrUnknown(target.addrMcToThem);
  if((!target.addrThemToMc||isAddrUnknown(target.addrThemToMc))&&source.addrThemToMc&&!isAddrUnknown(source.addrThemToMc))target.addrThemToMc=source.addrThemToMc;
  if((!target.addrMcToThem||isAddrUnknown(target.addrMcToThem))&&source.addrMcToThem&&!isAddrUnknown(source.addrMcToThem))target.addrMcToThem=source.addrMcToThem;
  // addrTone ghi nhận NHÓM sắc thái của cặp xưng hô ĐANG LƯU — nếu không merge theo, target vẫn giữ
  // addrTone cũ (thường là "Chưa rõ" nếu target trước đó chưa có xưng hô), trong khi target.addrThemToMc/
  // addrMcToThem vừa nhận dữ liệu thật từ source ở trên. Lần phân tích chương kế tiếp, addrToneSameGroup()
  // sẽ so sánh nhóm "Chưa rõ" (sai) với nhóm mới của chương đó, luôn trả về null (không so sánh được)
  // thay vì so đúng, khiến quyết định cộng dồn/thay thế xưng hô kém chính xác hơn cần thiết. Chỉ nhận
  // addrTone của source khi target THỰC SỰ chưa có xưng hô nào trước đó (không ghi đè 1 tone đã có ý nghĩa).
  if(targetAddrWasEmpty&&source.addrTone&&source.addrTone!=='Chưa rõ')target.addrTone=source.addrTone;
  if((!target.affinity||isUnknownVal(target.affinity))&&source.affinity&&!isUnknownVal(source.affinity)){target.affinity=source.affinity;target.affinitySource=source.affinitySource||'ai';}
  if(!target.addrThemToMcConflict&&source.addrThemToMcConflict)target.addrThemToMcConflict=source.addrThemToMcConflict;
  if(!target.addrMcToThemConflict&&source.addrMcToThemConflict)target.addrMcToThemConflict=source.addrMcToThemConflict;
  // narrRef (cách gọi ngôi thứ 3 khi tường thuật): nếu target chưa có, nhận nguyên từ source; nếu cả
  // 2 đều đã có, cộng dồn các lựa chọn chưa trùng (giống addAddrCandidate) thay vì chọn 1 trong 2.
  if(isNarrRefUnknown(target.narrRef)&&!isNarrRefUnknown(source.narrRef)){
    target.narrRef=source.narrRef;target.narrRefSource=source.narrRefSource||'ai';
  } else if(!isNarrRefUnknown(target.narrRef)&&!isNarrRefUnknown(source.narrRef)){
    target.narrRef=addAddrCandidate(target.narrRef,source.narrRef);
  }
  if(!target.narrRefConflict&&source.narrRefConflict)target.narrRefConflict=source.narrRefConflict;
  target.note=mergeNoteText(target.note,source.note,target.noteSource);
  // Gộp 2 entry TRÙNG (cùng 1 người thật) -> nếu 1 trong 2 từng bị user bấm huỷ ngôi sao
  // (protagonistDenied), giữ nguyên sự huỷ đó cho entry gộp — không để bên kia "hồi sinh" lại
  // trạng thái nhân vật chính mà user đã chủ động phủ nhận cho đúng người này.
  target.protagonistDenied=target.protagonistDenied||source.protagonistDenied;
  if(source.isProtagonist&&!target.protagonistDenied)target.isProtagonist=true;
  // Gộp danh sách chương đã xuất hiện (không trùng lặp) thay vì cộng dồn số đếm, để tránh đếm
  // trùng nếu 1 chương từng được tính cho cả 2 nhân vật trước khi bị phát hiện là cùng 1 người.
  const chSet=new Set([...(target.mentionChapters||[]),...(source.mentionChapters||[])]);
  if(chSet.size){
    target.mentionChapters=[...chSet].sort((a,b)=>a-b);
  } else {
    target.mentionCount=(target.mentionCount||0)+(source.mentionCount||0);
  }
  // Liên kết sameAs đang trỏ tới/đi từ source chuyển sang target trước khi source bị xoá (xem repointSameAs).
  repointSameAs(S.characters,source.id,target.id);
  repointEdges(S.characters,source.id,target.id);   // cạnh quan hệ (3.2) cũng chuyển sang target
  repointPersonas(S.characters,source.id,target.id); // thân phận giả + knownBy (4.2)
  try{remapNameTokens(source.id,target);refreshNameTokens(target);}catch(e){console.warn('[nametok]',e);}
  S.characters=S.characters.filter(x=>x.id!==source.id);
  // Dọn luôn các cặp "đã xác nhận khác người" có nhắc tới source.id — record đó không còn tồn tại
  // nữa nên cặp cũ hết ý nghĩa (tránh charMergeRejected phình to vô ích theo thời gian).
  if(Array.isArray(S.charMergeRejected)&&S.charMergeRejected.length){
    S.charMergeRejected=S.charMergeRejected.filter(p=>Array.isArray(p)&&p[0]!==source.id&&p[1]!==source.id);
  }
  { const _mhEntry=_mhCommit(_mh,source,target,opts);if(_mhEntry)_mhNotify(_mhEntry); }   // [D]
  if(opts.auto){
    console.log(`[Luồng 1][Gộp trùng] Auto-merged: "${source.name}" -> "${target.name}"`);
  }
  return target;
}
// 2 nhân vật TRÙNG TÊN thì thêm (giới tính) sau tên trong popup xác nhận để người dùng biết đang gộp ai vào ai.
function sameNameHint(a,b){
  if((a.name||'').trim().toLowerCase()!==(b.name||'').trim().toLowerCase())return '';
  const g=normalizeGenderValue(a.gender);
  return ` (${g==='Chưa rõ'?'chưa rõ giới':esc(g)})`;
}
// Gộp nhân vật thủ công từ modal — 2 chiều tuỳ theo _charMergeDir (xem khai báo + setCharMergeDir):
// - 'into' (mặc định, hành vi cũ): nhân vật chọn ở dropdown (other) bị gộp VÀO nhân vật đang mở popup
//   (current) — current được giữ lại làm tên chính, tên other chuyển thành tên phụ (alias) của current.
// - 'out': ngược lại — nhân vật ĐANG MỞ POPUP (current) bị gộp vào nhân vật chọn ở dropdown (other) —
//   other được giữ lại, tên current chuyển thành tên phụ (alias) của other. Vì current không còn tồn
//   tại sau khi gộp, modal phải đóng lại như bình thường.
async function doMergeChar(){
  if(!_charEditingId)return;
  const targetId=document.getElementById('charFieldMergeTarget').value;
  if(!targetId){alert('Vui lòng chọn nhân vật muốn gộp.');return;}
  const current=S.characters.find(x=>x.id===_charEditingId);
  const other=S.characters.find(x=>x.id===targetId);
  if(!current||!other)return;
  const into=_charMergeDir!=='out';
  const source=into?other:current;
  const target=into?current:other;
  showPopup({
    title:'Gộp nhân vật?',
    msg:`<strong>${esc(source.name)}${sameNameHint(source,target)}</strong> sẽ được gộp vào <strong>${esc(target.name)}${sameNameHint(target,source)}</strong> (coi là cùng 1 người). Thao tác này không ảnh hưởng bản gốc/bản dịch.`+
      ((()=>{
        const gs=normalizeGenderValue(source.gender),gt=normalizeGenderValue(target.gender);
        return(gs!=='Chưa rõ'&&gt!=='Chưa rõ'&&gs!==gt)
          ?`<br><br>⚠ <strong>2 nhân vật đang KHÁC giới tính</strong> (${esc(gs)} / ${esc(gt)}). Chỉ gộp nếu chắc chắn là cùng 1 người — nếu chỉ trùng tên thì đừng gộp.`
          :'';
      })()),
    btns:[
      {label:'Gộp',cls:'btn-p',cb:async()=>{
        mergeCharacterInto(source,target);
        closeCharModal();
        await saveCharacterMemory();
        renderCharList();
      }},
      {label:'Hủy',cls:'btn'},
    ]
  });
}
// ===== TỰ ĐỘNG GỘP NHÂN VẬT TRÙNG (do AI phát hiện) =====
// Kết hợp nội dung ghi chú của 2 nhân vật khi gộp, không ghi đè ghi chú do NGƯỜI DÙNG tự viết.
function mergeNoteText(targetNote,sourceNote,targetNoteSource){
  const tN=(targetNote||'').trim(),sN=(sourceNote||'').trim();
  if(!sN)return targetNote||'';
  if(!tN)return sN;
  if(targetNoteSource==='user')return targetNote; // ghi chú người dùng tự viết — không tự ý ghép thêm
  if(tN.toLowerCase().includes(sN.toLowerCase()))return targetNote;
  return trimAiNote(tN+'; '+sN);
}
// Xử lý danh sách "merges" AI trả về: mỗi mục {keep, duplicates:[...], evidence, quote, reason} chỉ áp dụng cho các
// nhân vật ĐÃ CÓ SẴN trong S.characters (khớp theo tên chính hoặc alias). Bỏ qua an toàn nếu
// không tìm thấy nhân vật tương ứng, tránh nối nhầm nhân vật mới vừa phát hiện trong chương này.
// 2.3: KHÔNG còn gộp record nữa (mergeCharacterInto chỉ còn dùng cho nút Gộp thủ công). Mỗi cặp được ghi thành liên kết
// c.sameAs: 'confirmed' chỉ khi AI khai evidence="trực tiếp" VÀ quote chép nguyên văn tìm lại được trong chương (kiểm
// bằng addrQuoteKey, cùng cách kiểm addrQuote); còn lại là 'suggested', chờ người dùng duyệt (2.4).
// ctx = {chapterIdx, srcText} (srcText = văn bản gốc đã gửi cho model; thiếu thì mọi mục chỉ là suggested).
function applyAutoMerges(merges,ctx){
  if(!Array.isArray(merges)||!merges.length)return;
  const srcKey=(ctx&&ctx.srcText)?addrQuoteKey(ctx.srcText):'';
  const chapterIdx=(ctx&&Number.isFinite(ctx.chapterIdx))?ctx.chapterIdx:null;
  for(const m of merges){
    if(!m||!m.keep||!Array.isArray(m.duplicates)){console.log('[Luồng 1][Nối nhân vật] Bỏ qua mục merges thiếu keep/duplicates:',JSON.stringify(m).slice(0,200));continue;}
    const target=findCharByNameOrAlias(String(m.keep));
    if(!target){console.log(`[Luồng 1][Nối nhân vật] Bỏ qua: keep \"${m.keep}\" không khớp record nào (tên/alias) — nhóm trùng ${JSON.stringify(m.duplicates)} không được xử lý.`);continue;}
    const quote=String(m.quote||'').trim();
    const qKey=addrQuoteKey(quote);
    const quoteOk=!!srcKey&&qKey.length>=4&&srcKey.includes(qKey);
    const claimedDirect=m.evidence==='trực tiếp';
    const direct=claimedDirect&&quoteOk;
    const evidence=[quoteOk?quote:'',String(m.reason||'').trim()].filter(Boolean).join(' — ');
    for(const dupName of m.duplicates){
      if(!dupName)continue;
      const source=findCharByNameOrAlias(String(dupName),target.gender);
      if(!source){console.log(`[Luồng 1][Nối nhân vật] Bỏ qua: \"${dupName}\" (trùng với \"${target.name}\") không khớp record nào — có thể record này chưa được tạo ở thời điểm xử lý merges.`);continue;}
      if(source.id===target.id){console.log(`[Luồng 1][Nối nhân vật] Bỏ qua: \"${dupName}\" khớp chính \"${target.name}\" (đang là alias của nó) nên không có cặp nào để nối.`);continue;}
      // Cặp đã từng bị chặn/xác nhận là 2 người khác nhau -> không đề xuất lại.
      if(isMergePairRejected(source.id,target.id)){
        console.log(`[Luồng 1][Nối nhân vật] Bỏ qua "${source.name}" ~ "${target.name}": cặp này đã được xác nhận là 2 người khác nhau.`);
        continue;
      }
      if(distinctByOrigName(source,target)){resolveDistinctOrigPair(source,target,'merges');continue;}   // khác tên gốc -> không nối
      // LƯỚI AN TOÀN (xem sameAsSafetyBlock): giới tính hoặc quan hệ với MC đã xác định và khác nhau -> coi là 2 người,
      // ghi vào charMergeRejected để các chương sau không đề xuất lại. So sánh nguyên văn, không suy luận "gần giống":
      // thà bỏ lỡ vài ca hợp lệ còn hơn đề xuất/nối nhầm 2 người (VD "mẹ của MC" và "mẹ của phản diện" cùng tên "Mẹ").
      const why=sameAsSafetyBlock(source,target);
      if(why){
        console.log(`[Luồng 1][Nối nhân vật] Bỏ qua "${source.name}" ~ "${target.name}": ${describeMergeBlock(source,target,why)}, nghi AI nhầm 2 người khác nhau.`);
        // Chỉ lệch GIỚI TÍNH mới ghi rejected vĩnh viễn. Lệch "relationship" (so chuỗi nguyên văn, vd "Sư huynh" vs "Đại sư huynh")
        // chỉ bỏ qua lần này, để cặp vẫn có thể được đề xuất lại ở chương sau.
        if(why==='gender'||why==='origname')markMergePairRejected(source.id,target.id,'auto');
        continue;
      }
      if(claimedDirect&&!quoteOk)console.log(`[Luồng 1][Nối nhân vật] "${source.name}" ~ "${target.name}": AI khai "trực tiếp" nhưng quote không tìm thấy nguyên văn trong chương -> chỉ ghi đề xuất.`);
      // [Fix gộp nhầm] 'trực tiếp' chỉ tin khi chương chứa cả 2 tên (tên chính/alias/tên gốc của từng bên); không thì hạ xuống đề xuất.
      let directHere=direct;
      if(directHere){
        const hasName=r=>[r.name,...(r.aliases||[]),...charOrigNameList(r)].some(n=>{const k=addrQuoteKey(String(n||''));return k.length>=2&&srcKey.includes(k);});
        if(!(hasName(source)&&hasName(target))){directHere=false;console.log(`[Luồng 1][Nối nhân vật] "${source.name}" ~ "${target.name}": AI khai "trực tiếp" nhưng chương không chứa đủ cả 2 tên -> chỉ ghi đề xuất.`);}
      }
      const res=recordSameAsProposal(S.characters,source,target,{direct:directHere,evidence,chapter:chapterIdx});
      console.log(`[Luồng 1][Nối nhân vật] "${source.name}" ~ "${target.name}": ${res}${directHere?' (bằng chứng trực tiếp)':''}`);
    }
  }
}
// Record vừa được TẠO MỚI có tên (rawName) trùng ALIAS của 1 record khác (VD "Vương Vũ" mới, nhưng "Vương Vũ" đã là tên khác của
// nhân vật chính) -> rất có thể là thân xác/thân phận/tên khác của cùng 1 người. Chỉ ghi đề xuất 'suggested' để người dùng bấm
// "Nối"/"Không phải" ở banner; KHÔNG gộp, KHÔNG tự xác nhận. Bỏ qua lưới 'origname' (tên gốc khác nhau chính là lý do record bị tách);
// vẫn tôn trọng cặp đã bị từ chối và lệch giới tính/độ tuổi (nếu đã có dữ liệu).
function proposeSameAsForAliasHolders(c,rawName,chapterIdx){
  const nk=v=>normKey(String(v||'').normalize('NFC'));
  const key=nk(rawName);
  if(!c||!key)return;
  const holders=(S.characters||[]).filter(x=>x&&x!==c&&nk(x.name)!==key&&(x.aliases||[]).some(a=>nk(a)===key));
  holders.forEach(x=>{
    if(isMergePairRejected(c.id,x.id)){console.log(`[Luồng 1][Nối nhân vật] Tên \"${rawName}\" của \"${c.name}\" nằm trong alias của \"${x.name}\" nhưng cặp đã bị từ chối -> không đề xuất.`);return;}
    if(distinctByOrigName(c,x)){resolveDistinctOrigPair(c,x,'alias');return;}   // khác tên gốc -> không nối
    const why=sameAsSafetyBlock(c,x);
    if(why&&why!=='origname'){console.log(`[Luồng 1][Nối nhân vật] Tên \"${rawName}\" của \"${c.name}\" nằm trong alias của \"${x.name}\" nhưng ${describeMergeBlock(c,x,why)} -> không đề xuất.`);return;}
    const evidence=`Tên "${rawName}" của "${c.name}" trùng 1 tên khác (alias) của "${x.name}"`+(why==='origname'?` nhưng tên gốc khác nhau ("${charOrigNameList(c).join(', ')}" vs "${charOrigNameList(x).join(', ')}") — có thể là thân xác/thân phận/tên khác của cùng 1 người`:'');
    const res=recordSameAsProposal(S.characters,c,x,{direct:false,evidence,chapter:chapterIdx});
    console.log(`[Luồng 1][Nối nhân vật] Đề xuất gộp \"${c.name}\" ~ \"${x.name}\" (tên nằm trong alias): ${res}`);
  });
}
// ===================================================================
// ===== XỬ LÝ "realNameReveals" AI TRẢ VỀ (nâng cấp NHÃN TẠM -> TÊN THẬT, phát hiện qua nhân =====
// ===== vật/đoạn văn KHÁC chứ không phải qua chính nhân vật đó xuất hiện lại trong chương)   =====
// ===================================================================
// Bổ sung cho nhánh tự động nâng cấp namePlaceholder đã có sẵn ở mergeAnalysisResults (chỉ chạy khi
// CHÍNH nhân vật mang nhãn tạm được model re-extract lại trong chương này kèm "isPlaceholderName":
// false, khớp qua alias/originalName). Có những chương tên thật bị lộ ra qua LỜI người khác nói, mà
// bản thân nhân vật mang nhãn tạm không được model tách thành 1 entry đầy đủ trong "characters" của
// đúng chương đó — nhánh kia sẽ bỏ lỡ. Trước bản sửa này, ca đó chỉ được vá bằng cách quét chuỗi "tên
// thật là..." trong "note" bằng regex (xem detectRealNameStuckInNote) — không đáng tin vì "note" là
// văn xuôi tự do, không phân biệt được xác nhận thật với tin đồn/phủ định/nghi vấn.
//
// Field "realNameReveals" thay thế phần lớn ca đó bằng dữ liệu có cấu trúc: "placeholder" khớp vào
// record ĐÃ CÓ SẴN đúng như cách "merges" khớp keep/duplicates (xem applyAutoMerges ở trên), và
// "evidence" là mức tự tin do CHÍNH MODEL chấm — tái dùng đúng 2 mức đã có sẵn ở "addrEvidence"
// ("trực tiếp"/"suy đoán") thay vì bịa thang đo mới. "trực tiếp" -> tự áp thẳng, không hỏi (giống hệt
// mức độ tin cậy của applyAutoMerges/nhánh nâng cấp tên tự động ở mergeAnalysisResults). "suy đoán"
// -> vẫn đẩy vào nameConflict để hiện banner, đúng cơ chế duyệt thủ công đã có sẵn (xem
// CHARMEM_CONFLICT_CONFIG/applyCharConflict) — vì tin đồn/suy diễn trong truyện có thể SAI (VD nhân
// vật khác đoán nhầm, hoặc cố tình nói dối), tự áp thẳng ca này rủi ro hơn hẳn ca merges (vốn còn có
// 2 lưới an toàn gender/relationship chặn phía sau — ca đổi tên 1-chiều này không có lưới tương đương
// nên phải giữ lại bước duyệt cho mức "suy đoán").
//
// LƯU Ý: hàm này KHÔNG thay thế detectRealNameStuckInNote — vẫn giữ nguyên hàm đó làm lưới vá dự
// phòng cho dữ liệu cũ hoặc ca model quên dùng field mới, 2 cơ chế không giẫm chân nhau (cùng ghi vào
// nameConflict, cùng key theo giá trị nên không tạo banner trùng lặp).
function applyRealNameReveals(reveals,srcText,chapterIdx){
  if(!Array.isArray(reveals)||!reveals.length)return;
  for(const r of reveals){
    if(!r||!r.placeholder||!r.realName)continue;
    const c=findCharByNameOrAlias(String(r.placeholder));
    // Không tìm thấy record, không còn mang nhãn tạm, hoặc user đã tự khoá tên -> bỏ qua an toàn,
    // giống hệt cách applyAutoMerges bỏ qua khi không tìm thấy target/source tương ứng.
    if(!c||!c.namePlaceholder||c.nameSource==='user')continue;
    const real=String(r.realName).trim();
    if(!real||containsCJK(real))continue;
    // Lưới cơ học độc lập: tên thật đề xuất không được NHÌN vẫn giống 1 nhãn mô tả khác — tránh đổi
    // nhãn tạm này sang một nhãn tạm khác (vừa vô nghĩa vừa phá khoá nhận diện đã ổn định), y hệt
    // lưới đã áp cho nhánh nâng cấp tự động trong mergeAnalysisResults.
    if(looksLikePlaceholderCharName(real))continue;
    if(normKey(real)===normKey(c.name))continue;
    // Chữ gốc của tên thật (schema mới: "originalName"). Kiểm như mọi origName khác (không bịa, không trùng
    // nhân vật khác, phải có nguyên văn trong chương); không đạt thì chỉ mất phần tên gốc, vẫn đổi tên được.
    const realOrigRaw=String(r.originalName||'').trim();
    const realOrigOk=realOrigRaw?parseOrigNames(sanitizeOrigNameCandidate(realOrigRaw,c,srcText,[],{allowLabel:false}))
      .filter(v=>!isDemotedOrig(c,v)&&!charOrigNameList(c).some(o=>normKey(o)===normKey(v))||false):[];
    // Tên thật đã thuộc 1 record KHÁC -> đổi tên sẽ tạo 2 record trùng tên. Trước đây ca này bị bỏ qua (trực tiếp) hoặc đẩy
    // vào banner đổi tên (suy đoán). Nay ghi thành đề xuất nối c ~ clash (2.3). Luôn chỉ 'suggested': mục này không có
    // câu trích để code kiểm lại nên không đủ cơ sở để tự xác nhận.
    const clash=findAllCharsByNameOrAlias([real]).find(x=>x!==c);
    if(clash){
      if(distinctByOrigName(c,clash)){resolveDistinctOrigPair(c,clash,'realNameReveals');continue;}
      const why=sameAsSafetyBlock(c,clash);
      if(why){
        console.log(`[Luồng 1][Tên tạm] realNameReveals bỏ qua "${c.name}" ~ "${clash.name}": ${describeMergeBlock(c,clash,why)}, nghi 2 người khác nhau.`);
        markMergePairRejected(c.id,clash.id,'auto');
        continue;
      }
      const res=recordSameAsProposal(S.characters,c,clash,{direct:false,
        evidence:`Chương lộ tên thật "${real}" của "${c.name}" (${r.evidence==='trực tiếp'?'trực tiếp':'suy đoán'})`,chapter:chapterIdx});
      console.log(`[Luồng 1][Tên tạm] realNameReveals: tên "${real}" đã thuộc "${clash.name}" -> đề xuất nối "${c.name}" ~ "${clash.name}": ${res}`);
      continue;
    }
    if(r.evidence==='trực tiếp'){
      // Dùng chung promoteToRealName: nhãn cũ + origName cũ của nhãn hạ xuống alias, chữ gốc của tên thật vào origName.
      promoteToRealName(c,real,realOrigOk,'realNameReveals trực tiếp');
    }else{
      // evidence !== 'trực tiếp' (bao gồm 'suy đoán' hoặc model bỏ trống/sai định dạng) -> luôn đi
      // qua banner duyệt thủ công, không đoán ý model.
      if(!c.nameConflict||normKey(c.nameConflict.value)!==normKey(real)){
        c.nameConflict={value:real,reason:'AI phát hiện qua lời nhân vật khác (chưa đủ chắc để tự đổi)',origName:realOrigOk.join(', ')};
        console.log(`[Luồng 1][Tên tạm] realNameReveals (suy đoán) đưa vào banner chờ duyệt: "${c.name}" -> gợi ý "${real}"`);
      }
    }
  }
}
// ===== CẶP NHÂN VẬT ĐÃ XÁC NHẬN LÀ 2 NGƯỜI KHÁC NHAU (không đề xuất gộp lại) =====
// Lưu theo ID (không theo tên) để không bị lệch nếu nhân vật được đổi tên sau này. Ghi nhận từ 2
// nguồn: (1) TỰ ĐỘNG — ngay tại 2 lưới an toàn trong applyAutoMerges() ở trên, mỗi khi 1 đề xuất gộp
// của AI bị chặn vì gender/relationship đã XÁC ĐỊNH và KHÁC NHAU, coi như đã có đủ bằng chứng dữ liệu,
// không cần AI phải đoán lại chuyện này ở mỗi lần quét sau; (2) dự phòng cho UI xác nhận thủ công
// (rejectMergePairManually) — HIỆN CHƯA có nút nào gọi tới, chỉ mới có sẵn hàm để nối UI sau này.
function mergePairKey(idA,idB){return [idA,idB].sort().join('|');}
function isMergePairRejected(idA,idB){
  if(!Array.isArray(S.charMergeRejected)||!S.charMergeRejected.length)return false;
  const key=mergePairKey(idA,idB);
  return S.charMergeRejected.some(p=>Array.isArray(p)&&p.length>=2&&mergePairKey(p[0],p[1])===key);
}
// Cặp do HỆ THỐNG tự ghi (khác tên gốc...) có phần tử thứ 3 = 'auto'; cặp do người dùng bấm "Không phải" chỉ có 2 phần tử.
function isMergePairAuto(idA,idB){
  if(!Array.isArray(S.charMergeRejected))return false;
  const key=mergePairKey(idA,idB);
  return S.charMergeRejected.some(p=>Array.isArray(p)&&p[2]==='auto'&&mergePairKey(p[0],p[1])===key);
}
function markMergePairRejected(idA,idB,by){
  if(!idA||!idB||idA===idB)return;
  if(!Array.isArray(S.charMergeRejected))S.charMergeRejected=[];
  if(isMergePairRejected(idA,idB)){
    if(by!=='auto'){   // người dùng bấm thật -> nâng cặp 'auto' thành cặp của người dùng
      const key=mergePairKey(idA,idB);
      S.charMergeRejected.forEach(p=>{if(Array.isArray(p)&&p[2]==='auto'&&mergePairKey(p[0],p[1])===key)p.length=2;});
    }
    return;
  }
  S.charMergeRejected.push(by==='auto'?[idA,idB,'auto']:[idA,idB]);
}
// ===== SAMEAS BEGIN =====
// ===== 2.1 + 2.2 — LIÊN KẾT "CÓ THỂ LÀ CÙNG 1 NGƯỜI" (c.sameAs) =====
// Thay cho việc gộp mù: 2 record vẫn tách riêng, giữa chúng có thể có 1 liên kết {id,status,evidence,chapter}.
//  - status 'suggested': AI/code đề xuất nối, CHƯA có hiệu lực (chờ người dùng duyệt ở bước 2.4).
//  - status 'confirmed': đã nối (người dùng bấm Nối, hoặc AI có bằng chứng trực tiếp ở bước 2.3).
//  - 'rejected' KHÔNG lưu ở đây mà dùng luôn S.charMergeRejected (đã có sẵn, đã được lưu ở cả IndexedDB lẫn
//    localStorage, đã được applyAutoMerges đọc) -> chỉ 1 nguồn sự thật, không có 2 danh sách lệch nhau.
// Mỗi cặp chỉ lưu MỘT chiều (trên record đề xuất); đọc bằng findSameAsLink (xét cả 2 chiều).
// Chỉ THÊM trường: record chưa có liên kết thì không có c.sameAs (không ghi mảng rỗng) nên dữ liệu cũ nạp lên không đổi.
// 2.2: các lần gộp CŨ đã xoá hẳn record nguồn (chỉ còn tên của nó nằm trong aliases của đích) nên không có gì để
// chuyển thành liên kết; chúng chính là "đã nối" và giữ nguyên. Phần chuyển được duy nhất là các cặp đã bị từ chối.
const CHARMEM_SAMEAS_STATUS=['suggested','confirmed'];
function _sameAsEntry(e){
  if(!e||typeof e!=='object'||typeof e.id!=='string'||!e.id)return null;
  const ch=(e.chapter===null||e.chapter===undefined||e.chapter==='')?NaN:Number(e.chapter);
  return {id:e.id,
    status:CHARMEM_SAMEAS_STATUS.includes(e.status)?e.status:'suggested',
    evidence:String(e.evidence||'').trim().slice(0,200),
    chapter:Number.isFinite(ch)?ch:null};
}
// Gộp 2 mục cùng 1 cặp: confirmed thắng suggested; giữ bằng chứng có chữ.
function _sameAsPick(a,b){
  const win=(b.status==='confirmed'&&a.status!=='confirmed')?b:a;
  const lose=win===a?b:a;
  // id luôn giữ của `a` (mục đầu tiên gặp): 2 mục ở 2 chiều ngược nhau có id khác nhau nhưng cùng 1 cặp.
  return {...win,id:a.id,evidence:win.evidence||lose.evidence,chapter:win.chapter!=null?win.chapter:lose.chapter};
}
// Dọn dữ liệu: bỏ mục hỏng / tự trỏ vào mình / trỏ tới record không còn / trùng; bỏ 'suggested' của cặp đã bị
// từ chối; cặp lưu ở cả 2 chiều thì chỉ giữ 1. Chạy khi tải dữ liệu (giống ensureAllForms). Trả về true nếu có đổi.
function ensureAllSameAs(list,rejected){
  list=Array.isArray(list)?list:[];
  const ids=new Set(list.map(c=>c&&c.id));
  const rej=new Set((Array.isArray(rejected)?rejected:[]).filter(p=>Array.isArray(p)&&p.length===2).map(p=>mergePairKey(p[0],p[1])));
  const before=JSON.stringify(list.map(c=>c&&c.sameAs));
  const byPair=new Map();                       // khoá cặp -> {owner,entry}
  list.forEach(c=>{
    if(!c||!Array.isArray(c.sameAs))return;
    c.sameAs.forEach(raw=>{
      const e=_sameAsEntry(raw);
      if(!e||e.id===c.id||!ids.has(e.id))return;
      const key=mergePairKey(c.id,e.id);
      if(e.status==='suggested'&&rej.has(key))return;
      const prev=byPair.get(key);
      if(prev){prev.entry=_sameAsPick(prev.entry,e);return;}
      byPair.set(key,{owner:c,entry:e});
    });
  });
  list.forEach(c=>{if(c&&Array.isArray(c.sameAs))c.sameAs=[];});
  byPair.forEach(({owner,entry})=>owner.sameAs.push(entry));
  list.forEach(c=>{if(c&&Array.isArray(c.sameAs)&&!c.sameAs.length)delete c.sameAs;});
  return JSON.stringify(list.map(c=>c&&c.sameAs))!==before;
}
function findSameAsLink(list,idA,idB){
  for(const c of (list||[])){
    if(!c||!Array.isArray(c.sameAs))continue;
    if(c.id!==idA&&c.id!==idB)continue;
    const other=c.id===idA?idB:idA;
    const link=c.sameAs.find(e=>e&&e.id===other);
    if(link)return {owner:c,link};
  }
  return null;
}
// 'confirmed' | 'suggested' | 'rejected' | null
function sameAsStatus(list,idA,idB){
  if(!idA||!idB||idA===idB)return null;
  if(isMergePairRejected(idA,idB))return 'rejected';
  const f=findSameAsLink(list,idA,idB);
  return f?f.link.status:null;
}
// Ghi 1 đề xuất nối a~b (a là bên đề xuất). Không bao giờ hạ confirmed xuống suggested, không đề xuất lại cặp đã bị từ chối.
// Trả về 'added' | 'exists' | 'confirmed' | 'rejected' | 'invalid'.
function addSameAsSuggestion(list,a,b,info){
  if(!a||!b||!a.id||!b.id||a.id===b.id)return 'invalid';
  const st=sameAsStatus(list,a.id,b.id);
  if(st==='rejected')return 'rejected';
  if(st==='confirmed')return 'confirmed';
  if(st==='suggested'){
    const f=findSameAsLink(list,a.id,b.id);
    const add=_sameAsEntry({id:f.link.id,status:'suggested',evidence:info&&info.evidence,chapter:info&&info.chapter});
    if(!f.link.evidence&&add.evidence)f.link.evidence=add.evidence;
    if(f.link.chapter==null&&add.chapter!=null)f.link.chapter=add.chapter;
    return 'exists';
  }
  if(!Array.isArray(a.sameAs))a.sameAs=[];
  a.sameAs.push(_sameAsEntry({id:b.id,status:'suggested',evidence:info&&info.evidence,chapter:info&&info.chapter}));
  return 'added';
}
// Người dùng quyết định: 'confirmed' (Nối) hoặc 'rejected' (Không phải). "Để sau" = không gọi gì.
function setSameAsStatus(list,a,b,status){
  if(!a||!b||!a.id||!b.id||a.id===b.id)return false;
  const f=findSameAsLink(list,a.id,b.id);
  if(status==='confirmed'){
    if(Array.isArray(S.charMergeRejected))S.charMergeRejected=S.charMergeRejected.filter(p=>!(Array.isArray(p)&&mergePairKey(p[0],p[1])===mergePairKey(a.id,b.id)));
    if(f){f.link.status='confirmed';return true;}
    if(!Array.isArray(a.sameAs))a.sameAs=[];
    a.sameAs.push(_sameAsEntry({id:b.id,status:'confirmed'}));
    return true;
  }
  if(status==='rejected'){
    if(f){f.owner.sameAs=f.owner.sameAs.filter(e=>e!==f.link);if(!f.owner.sameAs.length)delete f.owner.sameAs;}
    markMergePairRejected(a.id,b.id);
    return true;
  }
  return false;
}
// Gọi khi record `fromId` sắp bị xoá vì gộp vào `toId` (mergeCharacterInto): mọi liên kết trỏ tới/đi từ nó chuyển sang `toId`.
function repointSameAs(list,fromId,toId){
  if(!fromId||!toId||fromId===toId)return;
  const from=(list||[]).find(c=>c&&c.id===fromId),to=(list||[]).find(c=>c&&c.id===toId);
  (list||[]).forEach(c=>{
    if(c&&Array.isArray(c.sameAs))c.sameAs.forEach(e=>{if(e&&e.id===fromId)e.id=toId;});
  });
  if(from&&Array.isArray(from.sameAs)&&from.sameAs.length&&to){
    to.sameAs=[...(Array.isArray(to.sameAs)?to.sameAs:[]),...from.sameAs];
    delete from.sameAs;
  }
  ensureAllSameAs(list,S.charMergeRejected);
}
// Gọi khi xoá hẳn 1 nhân vật: bỏ mọi liên kết trỏ tới nó.
function dropSameAsRefs(list,id){
  (list||[]).forEach(c=>{
    if(!c||!Array.isArray(c.sameAs))return;
    c.sameAs=c.sameAs.filter(e=>!(e&&e.id===id));
    if(!c.sameAs.length)delete c.sameAs;
  });
}
// ===== 2.3 — GHI ĐỀ XUẤT NỐI THAY CHO GỘP MÙ =====
// Lưới an toàn cơ học (trước đây nằm thẳng trong applyAutoMerges): 2 nhân vật đã có giới tính XÁC ĐỊNH và KHÁC NHAU,
// hoặc "relationship" (quan hệ với MC) XÁC ĐỊNH và KHÁC NHAU nguyên văn -> gần như chắc là 2 người khác nhau (hay gặp
// nhất: cả 2 đều bị model đặt tên chung "Mẹ"). Trả về 'gender' | 'relationship' | '' (không bị chặn).
// Nhóm tuổi từ statusCue (0 = chưa rõ): 1 thiếu niên/trẻ em, 2 thanh niên, 3 trung niên, 4 cao niên.
function _charAgeGroup(c){
  const i=charmemAgeBandIndex(c&&c.statusCue);
  return i===null?_charAgeGroupLegacy(c):[1,1,1,1,2,3,3,4][i];
}
function _charAgeGroupLegacy(c){
  const t=stripVnDiacritics(String((c&&c.statusCue)||'').normalize('NFC').toLowerCase());
  if(!t)return 0;
  if(/cao nien|lao nien|gia\b|lao\b/.test(t))return 4;
  if(/trung nien/.test(t))return 3;
  if(/thanh nien|thanh nu|trang nien/.test(t))return 2;
  if(/thieu nien|thieu nu|tre em|nhi dong|hai tu|be trai|be gai/.test(t))return 1;
  return 0;
}
// 2 nhân vật đều có TÊN GỐC thật mà không chung chuỗi nào -> là 2 người khác nhau (không ngoại lệ).
function _origNamesDisjoint(a,b){
  const oa=charOrigNameList(a).map(x=>normKey(String(x).normalize('NFC'))).filter(Boolean);
  const ob=charOrigNameList(b).map(x=>normKey(String(x).normalize('NFC'))).filter(Boolean);
  if(!oa.length||!ob.length)return false;
  return !oa.some(x=>ob.includes(x));
}
// opts.strict=true (dùng cho gộp TỰ ĐỘNG record thật, không chỉ đề xuất): lệch nhóm tuổi 1 bậc cũng chặn, và 2 record cùng được liệt kê
// ở MỘT chương (tức model thấy họ là 2 entry riêng trong cùng chương) cũng chặn. Không strict: chỉ chặn lệch từ 2 bậc tuổi trở lên.
function sameAsSafetyBlock(a,b,opts){
  const strict=!!(opts&&opts.strict);
  const ga=normalizeGenderValue(a.gender),gb=normalizeGenderValue(b.gender);
  if(ga!=='Chưa rõ'&&gb!=='Chưa rõ'&&ga!==gb)return 'gender';
  if(!isUnknownVal(a.relationship)&&!isUnknownVal(b.relationship)&&a.relationship!==b.relationship)return 'relationship';
  if(_origNamesDisjoint(a,b))return 'origname';
  const aa=_charAgeGroup(a),ab=_charAgeGroup(b);
  if(aa&&ab&&Math.abs(aa-ab)>=(strict?1:2))return 'age';
  if(strict){
    const ma=new Set((a.mentionChapters||[]).map(String));
    if((b.mentionChapters||[]).some(x=>ma.has(String(x))))return 'cooccur';
  }
  return '';
}
// ===== QUY TẮC: KHÁC TÊN GỐC = 2 NGƯỜI RIÊNG =====
// 2 nhân vật đều có tên gốc mà không chung tên nào thì KHÔNG BAO GIỜ nối/gộp, kể cả khi AI báo "cùng 1 người" / "thân phận khác" /
// "phân thân". Cặp được ghi vào charMergeRejected (không đề xuất lại). Riêng khi 1 bên là NHÂN VẬT CHÍNH: coi bên kia là thân phận
// khác/phân thân của nhân vật chính -> nâng bên kia lên nhân vật chính (đánh dấu thêm, không gộp, không bỏ nhân vật chính cũ).
// Nếu người dùng đã tự huỷ sao của bên kia (protagonistDenied) thì tôn trọng, không nâng.
// ===== TỰ GỘP KHI TRÙNG TÊN GỐC =====
// Quy tắc đối xứng với "khác tên gốc = 2 người riêng": 2 record chung ít nhất 1 TÊN GỐC (c.origName / charOrigNameList) là CÙNG 1 người,
// tự gộp, KHÔNG xét lệch độ tuổi / quan hệ / cùng xuất hiện (AI hay ghi độ tuổi mỗi chương một khác). Chỉ không gộp khi:
//  - tên gốc là danh xưng chung / nhãn mô tả (师兄, 金发青年...) vì nhiều người dùng chung;
//  - cặp đã bị người dùng/giám khảo ghi "không phải" (charMergeRejected);
//  - 2 bên đã biết giới tính và KHÁC nhau (tránh gộp nhầm 2 người trùng tên gốc, vd cùng gọi "Mẹ");
//  - cả 2 đều do người dùng khoá tên/tên gốc (không tự xoá record người dùng đặt).
function autoMergeSameOrigName(appeared){
  const nk=v=>normKey(String(v||'').normalize('NFC'));
  const sharedKey=(a,b)=>{
    const kb=new Set(charOrigNameList(b).map(nk).filter(Boolean));
    return charOrigNameList(a).map(nk).find(k=>k&&k.length>=2&&kb.has(k)&&!isGenericAddressTerm(k)&&!isDescriptiveLabel(k)&&!isBareSurnameAlias(k)&&!isRoleAddressAlias(k))||'';
  };
  const locked=c=>c.nameSource==='user'||c.origNameSource==='user';
  const hasSuffix=c=>/\(\d+\)\s*$/.test(String(c.name||''));
  const score=c=>(isCharProtagonist(c)?1000:0)+(locked(c)?500:0)+(hasSuffix(c)?0:100)+((c.mentionChapters||[]).length||c.mentionCount||0);
  let merged=0;
  for(let guard=0;guard<30;guard++){
    const list=(S.characters||[]).filter(c=>c&&c.id);
    let pair=null;
    for(let i=0;i<list.length&&!pair;i++){
      for(let j=i+1;j<list.length;j++){
        const a=list[i],b=list[j];
        const sk=sharedKey(a,b);
        if(!sk)continue;
        if(isMergePairRejected(a.id,b.id))continue;
        // [Fix gộp nhầm anh em] 2 record đều đã có TÊN GỐC CHÍNH riêng và khác hẳn nhau (杨思训 vs 杨思讷) là 2 người, dù chung 1 alias
        // (杨公, 杨大人...). Khoá chung chỉ 2 ký tự mà không phải tên gốc chính của bên nào cũng không đủ để tự gộp.
        { const pa=nk(a.origName),pb=nk(b.origName);
          // [Fix gộp nhầm] chứa nhau chỉ được tính khi cả 2 tên gốc >=3 ký tự; ngắn hơn thì phải TRÙNG HẲN mới coi là cùng người.
          if(pa&&pb&&pa!==pb&&(Math.min(pa.length,pb.length)<3||(!pa.includes(pb)&&!pb.includes(pa))))continue;
          if(sk.length<3&&sk!==pa&&sk!==pb)continue; }
        const ga=normalizeGenderValue(a.gender),gb=normalizeGenderValue(b.gender);
        if(ga!=='Chưa rõ'&&gb!=='Chưa rõ'&&ga!==gb)continue;
        if(locked(a)&&locked(b))continue;
        if(isCharProtagonist(a)&&isCharProtagonist(b))continue;
        pair=[a,b];break;
      }
    }
    if(!pair)break;
    const [tgt,src]=score(pair[0])>=score(pair[1])?[pair[0],pair[1]]:[pair[1],pair[0]];
    const realTgt=locked(src)&&!locked(tgt)?src:tgt, realSrc=realTgt===tgt?src:tgt;
    console.log(`[Luồng 1][Gộp tên gốc] "${realSrc.name}" và "${realTgt.name}" trùng tên gốc -> tự gộp (giữ "${realTgt.name}").`);
    try{mergeCharacterInto(realSrc,realTgt,{auto:true,path:'ten-goc',reason:'Trùng tên gốc'});}
    catch(e){console.warn('[Luồng 1][Gộp tên gốc] Lỗi, dừng:',e);break;}
    if(Array.isArray(appeared)){for(let k=appeared.length-1;k>=0;k--){if(appeared[k]===realSrc)appeared.splice(k,1);}}
    merged++;
  }
  return merged;
}
function distinctByOrigName(a,b){return !!(a&&b&&a.id!==b.id&&_origNamesDisjoint(a,b));}
function resolveDistinctOrigPair(a,b,src,alias){
  const ma=isCharProtagonist(a),mb=isCharProtagonist(b);
  // [Fix gộp nhầm] TÊN GỐC KHÁC NHAU nhưng TÊN DỊCH GIỐNG HỆT (VD 李明/黎明 cùng \"Lê Minh\"): không tự từ chối vĩnh viễn, cũng không tự gộp —
  // gắn nhãn \"Trùng tên\" và ghi đề xuất nối 'suggested' để người dùng quyết (có thể 1 trong 2 tên dịch sai hoặc là cùng 1 người).
  // Không áp khi 1 bên là nhân vật chính (đã có nhánh nâng sao bên dưới) hoặc cặp đã bị từ chối.
  try{
    if(!ma&&!mb&&!isMergePairRejected(a.id,b.id)&&normKey(displayCharName(a))&&normKey(displayCharName(a))===normKey(displayCharName(b))&&['','origname'].includes(sameAsSafetyBlock(a,b))){   // chỉ lệch tên gốc thì cho đề xuất; lệch giới tính/quan hệ/tuổi thì không
      const res=recordSameAsProposal(S.characters,a,b,{direct:false,
        evidence:`Trùng tên: cùng tên dịch \"${displayCharName(a)}\" nhưng tên gốc khác nhau (\"${charOrigNameList(a).join(', ')}\" vs \"${charOrigNameList(b).join(', ')}\")`});
      console.log(`[Luồng 1][Nối nhân vật] (${src}) \"${a.name}\" ~ \"${b.name}\": trùng tên dịch, tên gốc khác nhau -> đề xuất (không tự gộp): ${res}`);
      return;
    }
  }catch(e){console.warn('[Luồng 1][Nối nhân vật] Lỗi đề xuất trùng tên:',e);}
  markMergePairRejected(a.id,b.id,'auto');
  let msg=`tên gốc khác nhau ("${a.origName}" vs "${b.origName}") -> 2 người riêng, không nối/gộp`;
  if(ma!==mb){
    const mc=ma?a:b,other=ma?b:a;
    if(other.protagonistDenied)msg+=`; "${other.name}" đã bị người dùng huỷ sao nên không nâng lên nhân vật chính`;
    else{
      other.isProtagonist=true;other.protagonistDenied=false;other.protagonistReconfirmVotes=[];other.protagonistPendingVotes=[];
      msg+=`; "${mc.name}" là nhân vật chính -> nâng "${other.name}" lên nhân vật chính`;
      // Trả các tên mà nhân vật chính cũ đã nuốt nhầm (VD 柱子 / Trụ Tử) về đúng người vừa được nâng sao.
      if(alias&&Array.isArray(mc.absorbed)){
        const k=normKey(alias);
        const hit=mc.absorbed.filter(x=>x&&Array.isArray(x.names)&&x.names.some(n=>normKey(n)===k));
        hit.forEach(x=>{
          const ks=new Set(x.names.map(n=>normKey(n)));
          mc.aliases=(mc.aliases||[]).filter(n=>!ks.has(normKey(n)));
          other.aliases=[...new Set([...(other.aliases||[]),...x.names.filter(n=>normKey(n)!==normKey(other.name))])];
          msg+=`; chuyển ${x.names.join(', ')} từ "${mc.name}" sang "${other.name}"`;
        });
        mc.absorbed=mc.absorbed.filter(x=>!hit.includes(x));
      }
    }
  }
  console.log(`[Luồng 1][Nối nhân vật] (${src}) "${a.name}" ~ "${b.name}": ${msg}`);
}
function describeMergeBlock(a,b,why){
  if(why==='gender')return `giới tính khác nhau (${a.gender} vs ${b.gender})`;
  if(why==='relationship')return `quan hệ với nhân vật chính khác nhau ("${a.relationship}" vs "${b.relationship}")`;
  if(why==='origname')return `tên gốc khác nhau ("${a.origName}" vs "${b.origName}")`;
  if(why==='age')return `độ tuổi khác nhau ("${a.statusCue}" vs "${b.statusCue}")`;
  if(why==='cooccur')return 'cùng xuất hiện như 2 entry riêng trong một chương';
  if(why==='userlock')return 'nhân vật do người dùng đặt tên/tên gốc';
  if(why==='policy')return 'chính sách: đường này chỉ đề xuất, không tự gộp';
  if(why==='cap')return `đã tự gộp ${CHARMEM_AUTO_MERGE_MAX_PER_CHAPTER} lần trong chương này (gộp hàng loạt gần như chắc là AI nhầm)`;
  return String(why);
}
// Ghi 1 đề xuất "a ~ b là cùng 1 người". info.direct=true (AI khẳng định trực tiếp VÀ câu trích tìm lại được trong chương)
// -> 'confirmed'; ngược lại chỉ 'suggested'. Không bao giờ gộp record, không hạ confirmed, không đề xuất lại cặp đã từ chối.
// Trả về 'added' | 'exists' | 'confirmed' | 'rejected' | 'invalid'.
function recordSameAsProposal(list,a,b,info){
  const r=addSameAsSuggestion(list,a,b,info);
  if((r==='added'||r==='exists')&&info&&info.direct){
    setSameAsStatus(list,a,b,'confirmed');
    return 'confirmed';
  }
  return r;
}
// ===== 2.4 / 2.5 — TRUY VẤN LIÊN KẾT (hàm thuần, dùng cho banner và cho prompt dịch) =====
// Mọi liên kết 'suggested' đang chờ duyệt liên quan tới record id (cả 2 chiều), bỏ cặp đã bị từ chối.
// Trả về [{other,link,owner}] với `other` là record ở đầu bên kia.
function sameAsPendingFor(list,id){
  const out=[];
  (list||[]).forEach(c=>{
    if(!c||!Array.isArray(c.sameAs))return;
    c.sameAs.forEach(e=>{
      if(!e||e.status!=='suggested')return;
      if(c.id!==id&&e.id!==id)return;
      const otherId=c.id===id?e.id:c.id;
      const other=list.find(x=>x&&x.id===otherId);
      if(!other||isMergePairRejected(id,otherId)||_origNamesDisjoint(c,other))return;   // khác tên gốc: không hiện banner gộp (kể cả đề xuất cũ)
      out.push({other,link:e,owner:c});
    });
  });
  return out;
}
// Mọi record nối với c bằng chuỗi liên kết 'confirmed' (A~B, B~C đã xác nhận -> A có peer B và C), theo thứ tự gần -> xa,
// KHÔNG gồm c. 'suggested' không bao giờ được đi qua: chưa xác nhận thì không chia sẻ dữ liệu (2.5).
function sameAsConfirmedGroup(list,c){
  if(!c||!c.id||!Array.isArray(list))return [];
  const seen=new Set([c.id]),out=[],queue=[c.id];
  while(queue.length){
    const cur=queue.shift();
    list.forEach(x=>{
      if(!x||seen.has(x.id))return;
      if(sameAsStatus(list,cur,x.id)!=='confirmed')return;
      seen.add(x.id);out.push(x);queue.push(x.id);
    });
  }
  return out;
}
// ===== SAMEAS END =====
// 2.5 — Dữ liệu xưng hô DÙNG CHUNG giữa các record đã 'confirmed' là cùng 1 người. Mỗi ô: ưu tiên giá trị của chính c;
// chỉ khi c còn "Chưa rõ" mới mượn của peer đầu tiên (gần nhất) có giá trị thật. Không ghi gì vào dữ liệu, chỉ dùng khi dựng prompt.
// Liên kết 'suggested' / cặp đã từ chối không được xét. Trả về {addrThemToMc,addrMcToThem,narrRef,addrTone,statusCue,from:{ô:record}}.
function resolveSharedAddr(list,c){
  const peers=sameAsConfirmedGroup(list,c);
  const res={addrThemToMc:c.addrThemToMc,addrMcToThem:c.addrMcToThem,narrRef:c.narrRef,addrTone:c.addrTone,statusCue:c.statusCue,from:{}};
  if(!peers.length)return res;
  const known={
    addrThemToMc:v=>!!v&&!isAddrUnknown(v),
    addrMcToThem:v=>!!v&&!isAddrUnknown(v),
    narrRef:v=>!!v&&!isNarrRefUnknown(v),
    addrTone:v=>!!v&&!isUnknownVal(v),
    statusCue:v=>!!v&&!isUnknownVal(v)&&!!String(v).trim()
  };
  ['addrThemToMc','addrMcToThem','narrRef','statusCue'].forEach(f=>{
    if(known[f](c[f]))return;
    const p=peers.find(x=>known[f](x[f]));
    if(!p)return;
    res[f]=p[f];res.from[f]=p;
    // Sắc thái đi kèm xưng hô: mượn cùng peer đó, và chỉ khi c chưa có sắc thái riêng.
    if((f==='addrThemToMc'||f==='addrMcToThem')&&!known.addrTone(c.addrTone)&&known.addrTone(p.addrTone))res.addrTone=p.addrTone;
  });
  return res;
}
// ===== EDGES BEGIN =====
// ===== 3.1 — XƯNG HÔ MẶC ĐỊNH SUY RA TỪ KIỂU QUAN HỆ (hàm thuần, chưa nối vào đâu) =====
// Mục đích: cặp nhân vật PHỤ–PHỤ không có bảng xưng hô 2 chiều (xem hasPeerAddrContext). Biết kiểu quan hệ của 2 người
// (vd sư huynh–sư đệ, chủ–tớ) thì code tự suy ra xưng hô hợp lý theo thể loại, AI chỉ cần ghi NGOẠI LỆ (3.3).
// Đây là giá trị DỰ PHÒNG độ tin cậy thấp: không bao giờ ghi đè dữ liệu AI/người dùng đã có, và trả '' khi không chắc.
//
// Quy ước vai: mỗi kiểu có 2 vai 'a' và 'b' theo thứ tự trong nhãn (a = vai nêu trước: sư phụ, cha mẹ, anh/chị, chủ...).
// Kiểu đối xứng (symmetric: vợ chồng, bạn bè, kẻ thù...) chỉ có bảng 'a', dùng cho cả 2 chiều.
// Bảng thuật ngữ theo HỆ XƯNG HÔ của AddrPresets: co (cổ trang) | hd (hiện đại) | ta (phương Tây); chuỗi 'hd' = dùng lại bảng hd.
// Mỗi vai có s (từ TỰ XƯNG, khoá theo giới tính NGƯỜI NÓI) và o (từ GỌI NGƯỜI NGHE, khoá theo giới tính NGƯỜI NGHE).
// N = chỉ khi Nam, F = chỉ khi Nữ, X = dùng cho mọi giới (kể cả chưa rõ). Giới tính chưa rõ chỉ được dùng danh sách X:
// thà bỏ trống còn hơn đoán sai "anh"/"chị". Từ trong mỗi danh sách xếp theo độ ưu tiên (dùng từ hợp lệ đầu tiên).
const CHARMEM_REL_TYPES={
  spouse:{label:'Vợ chồng',symmetric:true,t:{
    co:{a:{s:{N:'vi phu|ta',F:'thiếp|ta'},o:{N:'phu quân|tướng công|chàng',F:'nương tử|nàng'}}},
    hd:{a:{s:{N:'anh|chồng',F:'em|vợ'},o:{N:'anh|chồng',F:'em|vợ'}}},
    ta:{a:{s:{N:'chồng|tôi|ta',F:'vợ|tôi'},o:{N:'chồng|phu quân|anh',F:'vợ|phu nhân|em'}}}}},
  lover:{label:'Người yêu',symmetric:true,t:{
    co:{a:{s:{N:'ta|tại hạ',F:'thiếp|ta'},o:{N:'chàng|công tử',F:'nàng|cô nương'}}},
    hd:{a:{s:{N:'anh',F:'em'},o:{N:'anh',F:'em'}}},
    ta:{a:{s:{N:'anh|tôi',F:'em|tôi'},o:{N:'anh|cậu',F:'em|cô'}}}}},
  parent_child:{label:'Cha mẹ – con',t:{
    co:{a:{s:{N:'phụ thân|ta',F:'mẫu thân|ta'},o:{X:'con|nhi tử'}},
        b:{s:{N:'con|nhi tử',F:'con',X:'con'},o:{N:'phụ thân',F:'mẫu thân'}}},
    hd:{a:{s:{N:'bố|ba|cha',F:'mẹ|má'},o:{X:'con'}},
        b:{s:{X:'con'},o:{N:'bố|ba|cha',F:'mẹ|má'}}},
    ta:{a:{s:{N:'cha|bố|phụ vương',F:'mẹ|mẫu hậu'},o:{X:'con'}},
        b:{s:{X:'con'},o:{N:'cha|bố|phụ vương',F:'mẹ|mẫu hậu'}}}}},
  grandparent:{label:'Ông bà – cháu',t:{
    co:{a:{s:{N:'gia gia|ta',F:'nãi nãi|tổ mẫu|ta'},o:{N:'tôn nhi',F:'tôn nữ|tôn nhi'}},
        b:{s:{N:'tôn nhi',F:'tôn nữ|tôn nhi'},o:{N:'gia gia',F:'nãi nãi|tổ mẫu'}}},
    hd:{a:{s:{N:'ông',F:'bà'},o:{X:'cháu'}},
        b:{s:{X:'cháu'},o:{N:'ông',F:'bà'}}},
    ta:{a:{s:{N:'ông nội|ông',F:'bà nội|bà'},o:{X:'cháu'}},
        b:{s:{X:'cháu'},o:{N:'ông nội|ông',F:'bà nội|bà'}}}}},
  sibling:{label:'Anh chị – em ruột',t:{
    co:{a:{s:{N:'huynh|ca ca|ta',F:'tỷ tỷ|tỷ|ta'},o:{N:'đệ đệ|đệ',F:'muội|muội muội'}},
        b:{s:{N:'đệ đệ|đệ|ta',F:'muội muội|muội|ta'},o:{N:'huynh|ca ca|huynh trưởng',F:'tỷ tỷ|tỷ'}}},
    hd:{a:{s:{N:'anh',F:'chị'},o:{X:'em'}},
        b:{s:{X:'em'},o:{N:'anh',F:'chị'}}},
    ta:{a:{s:{N:'anh trai|anh|tôi',F:'chị gái|chị|tôi'},o:{N:'em trai|em',F:'em gái|em'}},
        b:{s:{N:'em trai|em|tôi',F:'em gái|em|tôi'},o:{N:'anh trai|anh',F:'chị gái|chị'}}}}},
  master_disciple:{label:'Thầy – trò (sư phụ – đệ tử)',t:{
    co:{a:{s:{X:'sư phụ|sư tôn|ta'},o:{X:'đồ đệ|đệ tử'}},
        b:{s:{X:'đệ tử|đồ nhi|ta'},o:{X:'sư phụ|sư tôn'}}},
    hd:{a:{s:{N:'thầy',F:'cô',X:'tôi'},o:{X:'em|trò'}},
        b:{s:{X:'em|trò'},o:{N:'thầy',F:'cô'}}},
    ta:{a:{s:{X:'sư phụ|thầy'},o:{X:'đệ tử|trò|học trò'}},
        b:{s:{X:'đệ tử|trò|em'},o:{X:'sư phụ|thầy'}}}}},
  senior_junior:{label:'Đàn anh/chị – đàn em (sư huynh–sư đệ, tiền bối–hậu bối)',t:{
    co:{a:{s:{N:'sư huynh|ta',F:'sư tỷ|ta'},o:{N:'sư đệ',F:'sư muội'}},
        b:{s:{N:'sư đệ|ta',F:'sư muội|ta'},o:{N:'sư huynh',F:'sư tỷ'}}},
    hd:{a:{s:{N:'anh|tiền bối|tôi',F:'chị|tiền bối|tôi'},o:{N:'em|cậu|hậu bối',F:'em|hậu bối',X:'em'}},
        b:{s:{X:'em|tôi'},o:{N:'anh|tiền bối',F:'chị|tiền bối'}}},
    ta:{a:{s:{X:'tiền bối|tôi'},o:{N:'hậu bối|cậu|em',F:'hậu bối|em',X:'hậu bối'}},
        b:{s:{X:'hậu bối|tôi|em'},o:{X:'tiền bối'}}}}},
  lord_servant:{label:'Chủ – tớ',t:{
    co:{a:{s:{X:'ta'},o:{X:'ngươi'}},
        b:{s:{N:'nô tài|tiểu nhân',F:'nô tỳ|nô tì|nô tài'},o:{N:'công tử|thiếu gia|lão gia',F:'tiểu thư|phu nhân'}}},
    hd:{a:{s:{X:'tôi'},o:{N:'anh|cậu',F:'cô|em'}},
        b:{s:{X:'tôi|em'},o:{N:'ông chủ|chủ nhân|cậu chủ',F:'bà chủ|cô chủ|chủ nhân'}}},
    ta:{a:{s:{X:'chủ nhân|tôi'},o:{X:'tùy tùng'}},
        b:{s:{X:'tôi|tùy tùng'},o:{X:'chủ nhân|ngài'}}}}},
  ruler_subject:{label:'Vua – bề tôi',t:{
    co:{a:{s:{X:'trẫm|ta'},o:{X:'ái khanh|khanh|ngươi'}},
        b:{s:{X:'thần|vi thần|hạ thần|ta'},o:{X:'bệ hạ|hoàng thượng|thánh thượng'}}},
    hd:null,
    ta:{a:{s:{X:'ta|trẫm'},o:{X:'khanh|ngươi|thần'}},
        b:{s:{X:'thần|tôi'},o:{X:'bệ hạ|đức vua'}}}}},
  superior_subordinate:{label:'Cấp trên – cấp dưới',t:{
    co:{a:{s:{X:'ta|bổn tọa'},o:{X:'ngươi|thuộc hạ'}},
        b:{s:{X:'thuộc hạ|tiểu nhân|ta'},o:{X:'đại nhân|ngài'}}},
    hd:{a:{s:{X:'tôi'},o:{N:'cậu|anh',F:'cô|em'}},
        b:{s:{X:'em|tôi'},o:{X:'sếp|giám đốc|ngài'}}},
    ta:{a:{s:{X:'tôi|ta'},o:{N:'cậu|thành viên',F:'cô|thành viên',X:'thành viên'}},
        b:{s:{X:'tôi'},o:{X:'ngài|đội trưởng'}}}}},
  friend:{label:'Bạn bè',symmetric:true,t:{
    co:{a:{s:{X:'ta|tại hạ'},o:{X:'ngươi|huynh đài|đạo hữu'}}},
    hd:{a:{s:{X:'tôi|tớ|mình'},o:{X:'cậu|bạn'}}},
    ta:'hd'}},
  enemy:{label:'Kẻ thù / đối địch',symmetric:true,t:{
    co:{a:{s:{X:'ta|bổn tọa'},o:{X:'ngươi'}}},
    hd:{a:{s:{X:'tôi|tao'},o:{N:'cậu|anh|mày',F:'cô|mày'}}},
    ta:{a:{s:{X:'tôi|ta'},o:{N:'cậu|ngươi',F:'cô|ngươi',X:'ngươi'}}}}},
  acquaintance:{label:'Xã giao / mới quen',symmetric:true,t:{
    co:{a:{s:{X:'tại hạ|ta'},o:{N:'huynh đài|các hạ',F:'cô nương|các hạ',X:'các hạ'}}},
    hd:{a:{s:{X:'tôi'},o:{N:'anh|cậu',F:'cô|chị'}}},
    ta:{a:{s:{X:'tôi'},o:{N:'anh|cậu|ngài',F:'cô|ngài'}}}}}
};
const CHARMEM_REL_TYPE_IDS=Object.keys(CHARMEM_REL_TYPES);
const _relNorm=s=>String(s==null?'':s).normalize('NFC').toLowerCase().trim();
function _relGender(g){const v=normalizeGenderValue(g);return v==='Nam'||v==='Nữ'?v:'';}
function _relTerms(spec,g){
  if(!spec)return [];
  const k=g==='Nam'?'N':g==='Nữ'?'F':'';
  return [...(k&&spec[k]?String(spec[k]).split('|'):[]),...(spec.X?String(spec.X).split('|'):[])];
}
// Chọn 1 cặp "tự xưng/gọi người nghe" cho 1 chiều. Hai lượt: (1) cặp NGUYÊN VĂN có trong bộ xưng hô của thể loại
// (đúng cách người dùng đã duyệt, vd "anh/em"); (2) không có thì chấp nhận khi CẢ HAI từ đều nằm trong bộ từ của thể loại.
// Luôn loại từ trong danh sách tránh (avoid) của thể loại (gồm cả từ người dùng tự cấm) và cặp 2 từ trùng nhau.
function _relPick(slot,spk,lst,bank,terms,avoid){
  if(!slot)return '';
  const others=_relTerms(slot.o,lst);
  // Duyệt từ tự xưng theo thứ tự ưu tiên; với mỗi từ tự xưng, ưu tiên cặp NGUYÊN VĂN có trong bộ xưng hô của thể loại
  // (cách người dùng đã duyệt, vd "anh/em"), không có thì chấp nhận cặp mà CẢ HAI từ đều nằm trong bộ từ của thể loại.
  // Luôn loại từ trong danh sách tránh (avoid, gồm cả từ người dùng tự cấm) và cặp 2 từ trùng nhau.
  for(const s of _relTerms(slot.s,spk)){
    const ns=_relNorm(s);
    if(!ns||avoid.has(ns)||!terms.has(ns))continue;
    const ok=others.map(o=>[o,_relNorm(o)]).filter(([o,no])=>no&&no!==ns&&!avoid.has(no)&&terms.has(no));
    const ex=ok.find(([o,no])=>bank.has(ns+'/'+no))||ok[0];
    if(ex)return s+'/'+ex[0];
  }
  return '';
}
// defaultAddress(type, gender, preset) -> {aToB, bToA, family}
//   type   : id trong CHARMEM_REL_TYPES (vd 'master_disciple'); a = vai nêu trước trong nhãn.
//   gender : {a, b} giới tính 2 người (chấp nhận 'Nam'/'Nữ'/'Chưa rõ'/rỗng...). Chưa rõ -> chỉ dùng từ trung tính.
//   preset : kết quả AddrPresets.resolve(...) ({pairs,family,avoidAdd,avoidRemove}). null -> không đoán gì.
// aToB = cách người vai a TỰ XƯNG / GỌI người vai b ("self/other", cùng định dạng addrThemToMc). '' = không chắc.
// Hàm thuần: không ghi gì, chỉ đọc đối số và AddrPresets.avoidTerms (nếu có).
function defaultAddress(type,gender,preset){
  const out={aToB:'',bToA:'',family:null};
  const def=CHARMEM_REL_TYPES[type];
  if(!def||!preset||!Array.isArray(preset.pairs))return out;
  const ga=_relGender(gender&&gender.a),gb=_relGender(gender&&gender.b);
  // Dân quốc (family null) vừa Hán-Việt vừa hiện đại: thử cổ trang trước, rồi hiện đại; bộ từ của preset sẽ lọc.
  const fams=preset.family==='co_trang'?['co']:preset.family==='hien_dai'?['hd']:preset.family==='tay_au'?['ta']:['co','hd'];
  const bank=new Set(preset.pairs.map(_relNorm));
  const terms=new Set();
  preset.pairs.forEach(p=>String(p).split('/').forEach(t=>{const x=_relNorm(t);if(x)terms.add(x);}));
  const avoidList=(typeof AddrPresets!=='undefined'&&AddrPresets&&typeof AddrPresets.avoidTerms==='function')?AddrPresets.avoidTerms(preset):[];
  const avoid=new Set(avoidList.map(_relNorm));
  for(const f of fams){
    let tbl=def.t[f];
    if(typeof tbl==='string')tbl=def.t[tbl];
    if(!tbl)continue;
    const slotA=tbl.a,slotB=def.symmetric?tbl.a:tbl.b;
    const ab=_relPick(slotA,ga,gb,bank,terms,avoid);
    const ba=_relPick(slotB,gb,ga,bank,terms,avoid);
    if(ab||ba){out.aToB=ab;out.bToA=ba;out.family=f;return out;}
  }
  return out;
}
// ===== 3.2 — CẠNH QUAN HỆ c.edges[] (migrate nhẹ từ c.relationship) =====
// Mỗi CẶP nhân vật có TỐI ĐA 1 cạnh, lưu ở MỘT bên (giống c.sameAs): owner.edges=[{id,type,role,src,from,evidence,chapter}]
//   id   : người còn lại của cặp.        type : khoá trong CHARMEM_REL_TYPES (3.1).
//   role : vai CỦA OWNER trong kiểu đó ('a'|'b', xem quy ước vai ở 3.1; kiểu đối xứng luôn 'a'), người kia giữ vai còn lại.
//   src  : 'user' (người dùng chọn) > 'ai' (AI ghi) > 'migrated' (suy ra từ c.relationship). Nguồn thấp không bao giờ ghi đè nguồn cao.
//   from : với src 'migrated', chuỗi relationship gốc đã dùng để suy ra (để biết khi nào lỗi thời).
// Trường c.relationship KHÔNG bị đổi nghĩa hay bị sửa: cạnh 'migrated' chỉ là bản suy ra, tính lại được bất cứ lúc nào.
const CHARMEM_EDGE_SRC_RANK={migrated:1,ai:2,user:3};

// Nhãn "quan hệ với nhân vật chính" (c.relationship) -> [kiểu, vai CỦA NGƯỜI MANG NHÃN]. Chỉ khớp NGUYÊN CỤM (không khớp
// một phần) và bỏ những nhãn mơ hồ (cháu, anh họ, anh em, bạn gái cũ, người qua đường...) — thà không có cạnh còn hơn cạnh sai.
const CHARMEM_REL_ALIASES=[
  ['spouse','a','vợ|chồng|vợ chồng|phu thê|hôn thê|hôn phu|vợ chưa cưới|chồng chưa cưới|thê tử|phu quân|đạo lữ|bạn đời'],
  ['lover','a','người yêu|bạn gái|bạn trai|tình nhân|người thương|người trong lòng|người tình'],
  ['parent_child','a','cha|mẹ|bố|ba|má|cha ruột|mẹ ruột|bố ruột|phụ thân|mẫu thân|thân phụ|thân mẫu|cha mẹ|bố mẹ|cha nuôi|bố nuôi|mẹ nuôi'],
  ['parent_child','b','con|con trai|con gái|con ruột|con trai ruột|con gái ruột|nhi tử|nữ nhi|con nuôi'],
  ['grandparent','a','ông nội|bà nội|ông ngoại|bà ngoại|gia gia|nãi nãi|tổ phụ|tổ mẫu|ông bà'],
  ['grandparent','b','cháu nội|cháu ngoại|cháu đích tôn|tôn tử|tôn nhi|tôn nữ'],
  ['sibling','a','anh trai|chị gái|anh ruột|chị ruột|anh cả|chị cả|ca ca|tỷ tỷ|huynh trưởng'],
  ['sibling','b','em trai|em gái|em ruột|em út|em trai ruột|em gái ruột|đệ đệ|muội muội'],
  ['master_disciple','a','sư phụ|sư tôn|thầy|thầy giáo|cô giáo|giáo viên|giáo viên chủ nhiệm|giáo sư|người thầy|thầy dạy'],
  ['master_disciple','b','đệ tử|đồ đệ|học trò|học sinh|sinh viên|môn đồ|đồ nhi|đệ tử ruột|đệ tử nội môn|đệ tử ngoại môn|đệ tử chân truyền|đệ tử thân truyền'],
  ['senior_junior','a','sư huynh|sư tỷ|tiền bối|đàn anh|đàn chị'],
  ['senior_junior','b','sư đệ|sư muội|hậu bối|đàn em'],
  ['lord_servant','a','chủ nhân|chủ|ông chủ|bà chủ|chủ tử'],
  ['lord_servant','b','người hầu|hầu gái|quản gia|nô bộc|nô tài|nô tỳ|nô tì|nha hoàn|thị nữ|hạ nhân|tùy tùng|nô lệ|thị đồng|tiểu đồng|tớ|người giúp việc'],
  ['ruler_subject','a','hoàng đế|vua|quốc vương|bệ hạ|hoàng thượng|nữ hoàng|nữ vương|đức vua|đế vương'],
  ['ruler_subject','b','bề tôi|thần tử|thần dân|đại thần|quần thần'],
  ['superior_subordinate','a','cấp trên|sếp|giám đốc|tổng giám đốc|chủ tịch|trưởng phòng|quản lý|lãnh đạo|thượng cấp|thủ lĩnh|đội trưởng|hội trưởng|minh chủ|bang chủ|giáo chủ|chưởng môn|tộc trưởng|trưởng lão'],
  ['superior_subordinate','b','cấp dưới|thuộc hạ|nhân viên|thủ hạ|thuộc cấp|thư ký|trợ lý|binh sĩ|hộ vệ|thị vệ'],
  ['friend','a','bạn|bạn bè|bạn thân|bạn tốt|bạn cũ|bạn học|bạn thuở nhỏ|bạn từ nhỏ|bạn thời thơ ấu|bạn đồng hành|đồng đội|chiến hữu|tri kỷ|bằng hữu|đạo hữu'],
  ['enemy','a','kẻ thù|kẻ địch|đối thủ|tử thù|cừu nhân|địch nhân|đối địch|kẻ đối đầu|kẻ thù không đội trời chung'],
  ['acquaintance','a','người quen|người lạ|người xa lạ|đồng nghiệp|hàng xóm|đối tác|khách hàng']
];
let _relAliasMap=null;
function _relAliasLookup(){
  if(_relAliasMap)return _relAliasMap;
  const m=new Map();
  CHARMEM_REL_ALIASES.forEach(([type,role,list])=>list.split('|').forEach(w=>{
    const k=_relNorm(w);if(!k)return;
    m.set(k,m.has(k)?null:{type,role});      // trùng nhãn ở 2 kiểu khác nhau -> mơ hồ, coi như không có
  }));
  _relAliasMap=m;return m;
}
// Nhãn mô tả về chính nhân vật chính, không phải một mối quan hệ ("của nhân vật chính", "của MC", "của <tên MC>").
function _relStripMcSuffix(t,mcNames){
  const toks=['nhân vật chính','mc','nvc','main','nam chính','nữ chính'];
  (mcNames||[]).forEach(n=>{const k=_relNorm(n);if(k)toks.push(k);});
  toks.sort((a,b)=>b.length-a.length);
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return t.replace(new RegExp('\\s+(?:của|với|đối với|của người|của nhân vật)\\s+(?:'+toks.map(esc).join('|')+')\\s*$','u'),'');
}
// parseRelationshipText(text, mcNames?) -> {type, role} | null. role = vai của NGƯỜI MANG NHÃN so với nhân vật chính
// ("Đệ tử" -> master_disciple, b: người đó là đệ tử, MC là sư phụ). Nhãn ghép ("Vợ / người yêu", "Sư phụ, thầy") chỉ nhận khi
// MỌI phần cùng trỏ về 1 (kiểu, vai); khác nhau hoặc có phần lạ -> null.
function parseRelationshipText(text,mcNames){
  if(isUnknownVal(text)||isProtagonistLabel(text))return null;
  // Giá trị thuộc DANH SÁCH CHUẨN -> tra thẳng bảng CHARMEM_REL_STD_EDGE (không có trong bảng như "Cháu" = không tạo cạnh).
  const _stdVal=_relStdCanon(text);
  if(_stdVal){
    const e=CHARMEM_REL_STD_EDGE[_stdVal];
    return e?{type:e[0],role:CHARMEM_REL_TYPES[e[0]].symmetric?'a':e[1]}:null;
  }
  let t=String(text).normalize('NFC').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g,' ').replace(/\s+/g,' ').trim();
  t=t.replace(/^(?:là|thành)\s+/,'').replace(/[.!?:]+$/,'').trim();
  t=_relStripMcSuffix(t,mcNames);
  if(!t)return null;
  const map=_relAliasLookup();
  const parts=t.split(/\s*(?:[\/,;]|\s+và\s+|\s+hoặc\s+|\s+kiêm\s+)\s*/).map(x=>x.trim()).filter(Boolean);
  if(!parts.length)return null;
  let hit=null;
  for(const p of parts){
    const h=map.get(_relNorm(_relStripMcSuffix(p,mcNames)));
    if(!h)return null;
    if(hit&&(hit.type!==h.type||hit.role!==h.role))return null;
    hit=h;
  }
  return hit?{type:hit.type,role:CHARMEM_REL_TYPES[hit.type].symmetric?'a':hit.role}:null;
}

function _edgeEntry(e){
  if(!e||typeof e!=='object'||typeof e.id!=='string'||!e.id)return null;
  const def=CHARMEM_REL_TYPES[e.type];if(!def)return null;
  const ch=(e.chapter===null||e.chapter===undefined||e.chapter==='')?NaN:Number(e.chapter);
  const out={id:e.id,type:e.type,role:def.symmetric?'a':(e.role==='b'?'b':'a'),
    src:CHARMEM_EDGE_SRC_RANK[e.src]?e.src:'ai',
    from:String(e.from||'').trim().slice(0,80),
    evidence:String(e.evidence||'').trim().slice(0,200),
    chapter:Number.isFinite(ch)?ch:null};
  // 3.3: ngoại lệ xưng hô (chỉ có khi có): own = owner tự xưng/gọi người kia, oth = người kia tự xưng/gọi owner.
  if(e.addr&&typeof e.addr==='object'){
    const own=_edgeAddrClean(e.addr.own),oth=_edgeAddrClean(e.addr.oth);
    if(own||oth){out.addr={};if(own)out.addr.own=own;if(oth)out.addr.oth=oth;}
  }
  return out;
}
// Tìm cạnh của cặp (idA,idB) ở bất kỳ chiều lưu nào. -> {owner, edge} | null
function findEdge(list,idA,idB){
  const get=id=>(list||[]).find(c=>c&&c.id===id);
  const a=get(idA),b=get(idB);
  const ea=a&&Array.isArray(a.edges)?a.edges.find(e=>e&&e.id===idB):null;
  if(ea)return {owner:a,edge:ea};
  const eb=b&&Array.isArray(b.edges)?b.edges.find(e=>e&&e.id===idA):null;
  return eb?{owner:b,edge:eb}:null;
}
// Cạnh của cặp (x,y) nhìn từ x: {type, src, xRole, yRole} | null. Kiểu đối xứng: cả hai đều 'a'.
function edgeRoles(list,x,y){
  if(!x||!y||!x.id||!y.id)return null;
  const f=findEdge(list,x.id,y.id);if(!f)return null;
  const def=CHARMEM_REL_TYPES[f.edge.type];if(!def)return null;
  const own=f.edge.role==='b'?'b':'a',oth=def.symmetric?'a':(own==='a'?'b':'a');
  const xr=f.owner===x?own:oth,yr=f.owner===x?oth:own;
  return {type:f.edge.type,src:f.edge.src,xRole:xr,yRole:yr};
}
// Xưng hô mặc định của cặp (x,y) suy ra từ cạnh: {xToY, yToX, type, src, family} | null (không có cạnh).
// Chỉ ghép nối cạnh với defaultAddress (3.1), không ghi gì. gender lấy từ chính 2 nhân vật.
function pairDefaultAddress(list,x,y,preset){
  const e=edgeRoles(list,x,y);if(!e)return null;
  const def=CHARMEM_REL_TYPES[e.type];
  const xIsA=def.symmetric||e.xRole==='a';
  const A=xIsA?x:y,B=xIsA?y:x;
  const r=defaultAddress(e.type,{a:A.gender,b:B.gender},preset);
  return {xToY:xIsA?r.aToB:r.bToA,yToX:xIsA?r.bToA:r.aToB,type:e.type,src:e.src,family:r.family};
}
// Ghi cạnh cho cặp (a,b); info={type, role (vai của a), src, from, evidence, chapter}. Nguồn cao thắng nguồn thấp;
// cùng nguồn: 'user' và 'migrated' ghi đè (ý mới nhất), 'ai' giữ cái cũ cho ổn định.
// Trả về 'added' | 'replaced' | 'kept' | 'invalid'.
function setEdge(list,a,b,info){
  if(!a||!b||!a.id||!b.id||a.id===b.id||!info)return 'invalid';
  const ne=_edgeEntry({...info,id:b.id});if(!ne)return 'invalid';
  const f=findEdge(list,a.id,b.id);
  const put=()=>{if(!Array.isArray(a.edges))a.edges=[];a.edges.push(ne);};
  if(!f){put();return 'added';}
  const oldR=CHARMEM_EDGE_SRC_RANK[f.edge.src]||0,newR=CHARMEM_EDGE_SRC_RANK[ne.src];
  if(!(newR>oldR||(newR===oldR&&ne.src!=='ai')))return 'kept';
  if(f.owner===a&&JSON.stringify(_edgeEntry(f.edge))===JSON.stringify(ne))return 'kept';
  f.owner.edges=f.owner.edges.filter(e=>e!==f.edge);
  if(!f.owner.edges.length)delete f.owner.edges;
  put();return 'replaced';
}
function removeEdge(list,a,b){
  if(!a||!b)return false;
  const f=findEdge(list,a.id,b.id);if(!f)return false;
  f.owner.edges=f.owner.edges.filter(e=>e!==f.edge);
  if(!f.owner.edges.length)delete f.owner.edges;
  return true;
}
// Dọn dữ liệu (chạy khi tải + sau khi gộp): bỏ mục hỏng / tự trỏ / trỏ tới record không còn / trùng cặp (giữ nguồn cao hơn).
function _edgesSanitize(list){
  list=Array.isArray(list)?list:[];
  const ids=new Set(list.map(c=>c&&c.id));
  const before=JSON.stringify(list.map(c=>c&&c.edges));
  const best=new Map();
  list.forEach(c=>{
    if(!c||c.edges===undefined)return;
    if(!Array.isArray(c.edges))return;
    c.edges.forEach(raw=>{
      const e=_edgeEntry(raw);
      if(!e||e.id===c.id||!ids.has(e.id))return;
      const key=[c.id,e.id].sort().join('\u0001'),prev=best.get(key);
      if(!prev||CHARMEM_EDGE_SRC_RANK[e.src]>CHARMEM_EDGE_SRC_RANK[prev.entry.src])best.set(key,{owner:c,entry:e});
    });
  });
  list.forEach(c=>{if(c&&c.edges!==undefined)c.edges=Array.isArray(c.edges)?[]:c.edges;});
  best.forEach(({owner,entry})=>owner.edges.push(entry));
  list.forEach(c=>{if(c&&c.edges!==undefined&&!(Array.isArray(c.edges)&&c.edges.length))delete c.edges;});
  return JSON.stringify(list.map(c=>c&&c.edges))!==before;
}
// Đồng bộ các cạnh 'migrated' với c.relationship hiện tại. Cạnh migrated LUÔN là bản suy ra: chỉ tồn tại khi truyện có
// ĐÚNG 1 nhân vật chính (relationship tính theo MC; nhiều MC thì không biết "với ai") và nhãn parse được; ngoài ra bị gỡ.
// Cạnh 'ai'/'user' không bao giờ bị đụng. Idempotent. Trả về true nếu có thay đổi.
function migrateEdgesFromRelationship(list){
  list=Array.isArray(list)?list:[];
  const stars=list.filter(c=>c&&isCharProtagonist(c));
  const P=stars.length===1?stars[0]:null;
  const want=new Map();
  if(P){
    const mcNames=[P.name,...(Array.isArray(P.aliases)?P.aliases:[])].filter(x=>typeof x==='string'&&x.trim());
    list.forEach(c=>{
      if(!c||!c.id||c===P||isCharProtagonist(c))return;
      const p=parseRelationshipText(c.relationship,mcNames);
      if(p)want.set(c.id,{type:p.type,role:p.role,from:String(c.relationship).trim().slice(0,80)});
    });
  }
  let changed=false;
  const ok=new Set();
  list.forEach(c=>{
    if(!c||!Array.isArray(c.edges))return;
    const keep=c.edges.filter(e=>{
      if(!e||e.src!=='migrated')return true;
      const w=P&&e.id===P.id?want.get(c.id):null;
      if(w&&w.type===e.type&&w.role===(e.role==='b'?'b':'a')&&w.from===e.from){ok.add(c.id);return true;}
      return false;                                  // lỗi thời hoặc sai chiều -> gỡ, bên dưới ghi lại đúng
    });
    if(keep.length!==c.edges.length){changed=true;c.edges=keep;if(!keep.length)delete c.edges;}
  });
  want.forEach((w,id)=>{
    if(ok.has(id))return;
    const c=list.find(x=>x&&x.id===id);
    const r=setEdge(list,c,P,{type:w.type,role:w.role,src:'migrated',from:w.from});
    if(r==='added'||r==='replaced')changed=true;
  });
  return changed;
}
function ensureAllEdges(list){
  const a=_edgesSanitize(list),b=migrateEdgesFromRelationship(list);
  return a||b;
}
// Khi gộp record `fromId` vào `toId` (mergeCharacterInto): cạnh trỏ tới/đi từ nó chuyển sang `toId`, rồi dọn trùng/tự trỏ.
function repointEdges(list,fromId,toId){
  if(!fromId||!toId||fromId===toId)return;
  const from=(list||[]).find(c=>c&&c.id===fromId),to=(list||[]).find(c=>c&&c.id===toId);
  (list||[]).forEach(c=>{
    if(c&&Array.isArray(c.edges))c.edges.forEach(e=>{if(e&&e.id===fromId)e.id=toId;});
  });
  if(from&&Array.isArray(from.edges)&&from.edges.length&&to){
    to.edges=[...(Array.isArray(to.edges)?to.edges:[]),...from.edges];
    delete from.edges;
  }
  _edgesSanitize(list);
}
// Khi xoá hẳn 1 nhân vật: bỏ mọi cạnh trỏ tới nó (cạnh nó sở hữu đi theo record).
function dropEdgeRefs(list,id){
  (list||[]).forEach(c=>{
    if(!c||!Array.isArray(c.edges))return;
    c.edges=c.edges.filter(e=>!(e&&e.id===id));
    if(!c.edges.length)delete c.edges;
  });
}
// ===== 3.3 — DÙNG CẠNH LÀM XƯNG HÔ DỰ PHÒNG CHO CẶP PHỤ–PHỤ =====
// Tên người đọc được của 2 vai (a, b) mỗi kiểu — chỉ để dựng prompt cho AI (relationsPromptRule).
const CHARMEM_REL_ROLE_NAMES={
  spouse:null,lover:null,friend:null,enemy:null,acquaintance:null,
  parent_child:['cha/mẹ','con'],grandparent:['ông/bà','cháu'],sibling:['anh/chị','em'],
  master_disciple:['thầy/sư phụ','trò/đệ tử'],senior_junior:['sư huynh/sư tỷ/tiền bối','sư đệ/sư muội/hậu bối'],
  lord_servant:['chủ','tớ'],ruler_subject:['vua','bề tôi'],superior_subordinate:['cấp trên','cấp dưới']
};
// Chuẩn hoá ô xưng hô ngoại lệ: mỗi lựa chọn phải là "tự xưng/gọi đối phương" trọn vẹn; tối đa 3 lựa chọn; rác -> ''.
function _edgeAddrClean(v){
  const ok=String(v==null?'':v).split(/[,;]/).map(s=>s.trim()).filter(s=>/^[^\/]{1,30}\/[^\/]{1,30}$/.test(s)&&!/^\s*\/|\/\s*$/.test(s));
  return [...new Set(ok)].slice(0,3).join(', ');
}
// Ghi NGOẠI LỆ xưng hô lên cạnh có sẵn của cặp (x,y): xToY = cách x tự xưng/gọi y, yToX ngược lại. Chỉ ghi ô khác rỗng
// (ô rỗng = giữ nguyên). Nguồn 'ai' không được đụng cạnh 'user'. Lưu theo (owner,other) nên không lệ thuộc thứ tự tham số
// và vẫn đúng sau khi gộp nhân vật. Trả về true nếu có thay đổi.
function setEdgeAddr(list,x,y,addr,src){
  if(!x||!y||!addr)return false;
  const f=findEdge(list,x.id,y.id);if(!f)return false;
  if(f.edge.src==='user'&&src!=='user')return false;
  const xy=_edgeAddrClean(addr.xToY),yx=_edgeAddrClean(addr.yToX);
  if(!xy&&!yx)return false;
  const cur=(f.edge.addr&&typeof f.edge.addr==='object')?f.edge.addr:{};
  const own=f.owner===x?xy:yx,oth=f.owner===x?yx:xy;
  const next={own:own||cur.own||'',oth:oth||cur.oth||''};
  if(!next.own)delete next.own;if(!next.oth)delete next.oth;
  if(JSON.stringify(next)===JSON.stringify(cur))return false;
  f.edge.addr=next;return true;
}
// Xưng hô của cặp (x,y) = mặc định theo kiểu quan hệ (pairDefaultAddress) + ngoại lệ đã ghi trên cạnh (ưu tiên hơn).
// Ngoại lệ lệch hệ thể loại (AddrPresets.filterAddr bỏ hết) -> lùi về mặc định. null = cặp không có cạnh.
function pairAddress(list,x,y,preset){
  const d=pairDefaultAddress(list,x,y,preset);if(!d)return null;
  const f=findEdge(list,x.id,y.id),ad=f&&f.edge.addr;
  const res={xToY:d.xToY,yToX:d.yToX,type:d.type,src:d.src,family:d.family,exc:{xToY:false,yToX:false}};
  if(ad&&typeof ad==='object'){
    const fix=v=>{
      const c=_edgeAddrClean(v);if(!c)return '';
      if(preset&&typeof AddrPresets!=='undefined'&&AddrPresets&&typeof AddrPresets.filterAddr==='function')return AddrPresets.filterAddr(c,preset).text||'';
      return c;
    };
    const xy=fix(f.owner===x?ad.own:ad.oth),yx=fix(f.owner===x?ad.oth:ad.own);
    if(xy){res.xToY=xy;res.exc.xToY=true;}
    if(yx){res.yToX=yx;res.exc.yToX=true;}
  }
  return res;
}
// Các dòng xưng hô mặc định giữa những NHÂN VẬT PHỤ cùng xuất hiện trong chương (cặp có MC đã có addrThemToMc/addrMcToThem).
// Trả về mảng dòng (tối đa maxPairs); rỗng nếu không cặp nào có cạnh.
function buildPeerAddrDefaults(list,appeared,preset,maxPairs){
  const lim=maxPairs||12,lines=[],cs=Array.isArray(appeared)?appeared:[];
  for(let i=0;i<cs.length&&lines.length<lim;i++)for(let j=i+1;j<cs.length&&lines.length<lim;j++){
    const x=cs[i],y=cs[j];
    if(!x||!y||!x.id||!y.id||x.id===y.id||isCharProtagonist(x)||isCharProtagonist(y))continue;
    const r=pairAddress(list,x,y,preset);
    if(!r||(!r.xToY&&!r.yToX))continue;
    const parts=[];
    if(r.xToY)parts.push(`${x.name} tự xưng/gọi ${y.name}: ${r.xToY}${r.exc.xToY?' (ngoại lệ đã ghi)':''}`);
    if(r.yToX)parts.push(`${y.name} tự xưng/gọi ${x.name}: ${r.yToX}${r.exc.yToX?' (ngoại lệ đã ghi)':''}`);
    lines.push(`- ${x.name} ↔ ${y.name} (${CHARMEM_REL_TYPES[r.type].label}): ${parts.join('; ')}`);
  }
  return lines;
}
// Nhân vật có dính cạnh nào không (là owner hoặc là người còn lại) — dùng cho hasPeerAddrContext.
function charHasEdge(list,c){
  if(!c||!c.id)return false;
  if(Array.isArray(c.edges)&&c.edges.some(e=>e&&e.id))return true;
  return (list||[]).some(o=>o&&Array.isArray(o.edges)&&o.edges.some(e=>e&&e.id===c.id));
}
// Đoạn quy tắc thêm vào prompt TRÍCH XUẤT (cùng lượt gọi sẵn có, không tốn thêm lượt API): AI báo quan hệ giữa 2 nhân vật PHỤ.
function relationsPromptRule(){
  const types=CHARMEM_REL_TYPE_IDS.map(k=>{
    const rn=CHARMEM_REL_ROLE_NAMES[k];
    return rn?`${k} (${rn[0]} – ${rn[1]}; a=${rn[0]}, b=${rn[1]})`:`${k} (${CHARMEM_REL_TYPES[k].label}, đối xứng)`;
  }).join('; ');
  return `- "relations": CHỈ báo quan hệ giữa 2 nhân vật PHỤ (không ai trong 2 người là nhân vật chính — quan hệ với nhân vật chính đã có field "relationship") khi văn bản chương này NÓI THẲNG quan hệ đó `+
    `(VD hai người gọi nhau là sư huynh/sư muội, "A là vợ của B", chủ–tớ nêu rõ). Mỗi mục: {"a":"tên chính (name) người thứ nhất","b":"tên chính người thứ hai","type":"<mã kiểu>","roleOfA":"a"|"b","evidence":"trực tiếp","quote":"...","aToB":"","bToA":""}. `+
    `Mã kiểu: ${types}. "roleOfA" cho biết người "a" giữ vai nào của kiểu đó (bỏ qua với kiểu đối xứng). "quote": chép NGUYÊN VĂN, đúng ngôn ngữ của VĂN BẢN GỐC, 1 đoạn ngắn nói rõ quan hệ đó; hệ thống sẽ TÌM LẠI, không thấy thì bỏ cả mục. `+
    `Hệ thống tự suy xưng hô mặc định theo kiểu quan hệ và thể loại, nên "aToB"/"bToA" (định dạng "tự xưng/gọi đối phương", VD "ta/ngươi") CHỈ điền khi lời thoại trong chương cho thấy xưng hô KHÁC mặc định thông thường của quan hệ đó (ngoại lệ); mặc định thì để chuỗi rỗng. `+
    `Quan hệ GIA ĐÌNH (cha mẹ–con, ông bà–cháu, anh chị–em) CHỈ báo khi văn bản nói thẳng (gọi nhau là mẹ/cha/con/anh/chị/em..., hoặc "A là mẹ của B"). Cách TỰ XƯNG như "lão nương"/老娘 (= "bà đây"), "lão tử"/老子, "lão phu", "bản cô nương" KHÔNG phải bằng chứng người đó là mẹ/cha của người đang nghe; giáo sư–học trò, người xa lạ, đồng môn không phải quan hệ gia đình. `+
    `Chỉ dùng tên đã có trong "characters" của chính phản hồi này hoặc danh sách "đã biết"; không đoán mò, không bịa. Để mảng rỗng nếu không có.\n`;
}
// Quan hệ GIA ĐÌNH giữa 2 nhân vật phụ (cha mẹ–con, ông bà–cháu, anh chị–em) chỉ được nhận khi câu trích (quote) THẬT SỰ
// chứa từ chỉ họ hàng. Lỗi thực tế: nhân vật tự xưng "lão nương" (老娘 = "bà đây", cách TỰ XƯNG) bị AI hiểu thành "mẹ" ->
// ghi cạnh cha mẹ–con với người đối thoại -> hệ cổ trang tự gán xưng hô "mẫu thân" cho 2 người xa lạ (giáo sư–học trò).
// Các cách tự xưng/danh xưng chứa chữ "nương/娘" nhưng KHÔNG chỉ mẹ bị loại khỏi câu trích trước khi kiểm tra.
const CHARMEM_FAMILY_REL_TYPES=new Set(['parent_child','grandparent','sibling']);
function relQuoteHasKinTerm(quote){
  let q=String(quote||'').normalize('NFC').toLowerCase();
  q=q.replace(/老娘|老子|姑娘|娘子|大娘|新娘|娘们|娘們|娘娘|lão nương|lão tử|cô nương|nương tử|nương nương|tiểu nương|đại nương/g,' ');
  const cjk=['爸','爹','父亲','父親','母亲','母親','妈','媽','娘','儿子','兒子','女儿','女兒','闺女','爷爷','爺爺','奶奶','外公','外婆','祖父','祖母','哥','姐','姊','弟','妹','兄'];
  if(cjk.some(t=>q.includes(t)))return true;
  const phrases=['phụ thân','mẫu thân','thân phụ','thân mẫu','phụ mẫu','gia gia','nãi nãi','nhi tử','nữ nhi','ca ca','tỷ tỷ','muội muội','đệ đệ','tổ phụ','tổ mẫu'];
  if(phrases.some(t=>q.includes(t)))return true;
  const words=new Set(q.split(/[^\p{L}]+/u).filter(Boolean));
  return ['cha','mẹ','bố','ba','má','con','ông','bà','anh','chị','em','huynh','đệ','tỷ','muội','nương'].some(w=>words.has(w));
}
// Dọn cạnh gia đình do AI ghi từ trước mà câu trích không có từ chỉ họ hàng (dữ liệu sai đã lưu) — chỉ đụng cạnh src 'ai' CÓ evidence.
function purgeSuspectFamilyEdges(list){
  let n=0;
  (list||[]).forEach(c=>{
    if(!c||!Array.isArray(c.edges))return;
    const keep=c.edges.filter(e=>!(e&&e.src==='ai'&&CHARMEM_FAMILY_REL_TYPES.has(e.type)&&String(e.evidence||'').trim()&&!relQuoteHasKinTerm(e.evidence)));
    if(keep.length!==c.edges.length){n+=c.edges.length-keep.length;c.edges=keep;}
  });
  if(n)console.log(`[Luồng 1][Quan hệ] Đã gỡ ${n} cạnh quan hệ gia đình do AI ghi nhưng câu trích không có từ chỉ họ hàng (nghi tự xưng kiểu "lão nương" bị hiểu nhầm là mẹ).`);
  return n;
}
// Xử lý "relations" AI trả về: chỉ nhận mục có evidence="trực tiếp" VÀ quote tìm lại được nguyên văn trong chương (cùng cách kiểm
// verifyAddrQuote). Chỉ cặp phụ–phụ, kiểu hợp lệ. Ghi cạnh nguồn 'ai' (không đè 'user', không đổi cạnh 'ai' đã có), rồi ghi ngoại lệ
// xưng hô nếu có. ctx={chapterIdx, srcText}. Trả về mảng kết quả từng mục (để log/test).
function applyRelations(relations,ctx){
  const out=[];
  try{purgeSuspectFamilyEdges(S.characters);}catch(e){}
  if(!Array.isArray(relations)||!relations.length)return out;
  const srcKey=(ctx&&ctx.srcText)?addrQuoteKey(ctx.srcText):'';
  const chapterIdx=(ctx&&Number.isFinite(ctx.chapterIdx))?ctx.chapterIdx:null;
  for(const r of relations.slice(0,20)){
    if(!r||typeof r!=='object'||!r.a||!r.b)continue;
    const def=CHARMEM_REL_TYPES[r.type];if(!def)continue;
    const A=findCharByNameOrAlias(String(r.a)),B=findCharByNameOrAlias(String(r.b));
    if(!A||!B||A.id===B.id)continue;
    if(isCharProtagonist(A)||isCharProtagonist(B)){out.push({a:A.name,b:B.name,result:'skip-mc'});continue;}
    const quote=String(r.quote||'').trim(),qKey=addrQuoteKey(quote);
    if(!(r.evidence==='trực tiếp'&&srcKey&&qKey.length>=(containsCJK(quote)?4:8)&&srcKey.includes(qKey))){out.push({a:A.name,b:B.name,result:'skip-evidence'});continue;}
    if(CHARMEM_FAMILY_REL_TYPES.has(r.type)&&!relQuoteHasKinTerm(quote)){out.push({a:A.name,b:B.name,result:'skip-no-kin-term'});continue;}
    const role=def.symmetric?'a':(r.roleOfA==='a'||r.roleOfA==='b'?r.roleOfA:'');
    if(!role){out.push({a:A.name,b:B.name,result:'skip-role'});continue;}
    const res=setEdge(S.characters,A,B,{type:r.type,role,src:'ai',evidence:quote,chapter:chapterIdx});
    let exc=false;
    const er=edgeRoles(S.characters,A,B);
    if(er&&er.type===r.type&&er.xRole===role)exc=setEdgeAddr(S.characters,A,B,{xToY:r.aToB,yToX:r.bToA},'ai');
    out.push({a:A.name,b:B.name,result:res,exception:exc});
  }
  return out;
}
// ===== EDGES END =====
// Dự phòng cho UI xác nhận thủ công sau này: user tự xem 1 đề xuất gộp cụ thể và bấm "Không, đây là
// 2 người khác nhau" cho đúng cặp đó. Lưu lại ngay để lần quét sau AI không đề xuất lại cặp này nữa.
async function rejectMergePairManually(idA,idB){
  markMergePairRejected(idA,idB);
  await saveCharacterMemory();
}
// Ghi log để dev/người dùng kiểm tra trong console khi AI vừa tự động sửa lại 1 field
// (gender/relationship) do phát hiện dữ liệu cũ (vốn cũng chỉ do AI đoán) mâu thuẫn với
// bằng chứng rõ ràng trong chương vừa phân tích. Không hiện thông báo trên UI.
const CHARMEM_FIELD_LABEL={gender:'giới tính',relationship:'mối quan hệ'};
function notifyCharCorrection(charName,field,oldVal,newVal,reason){
  const label=CHARMEM_FIELD_LABEL[field]||field;
  const reasonTxt=reason?` (${reason})`:'';
  console.log(`[Luồng 1][Cập nhật] Đã tự sửa ${label} của "${charName}": ${oldVal} → ${newVal}${reasonTxt}`);
  renderCharList();
}
// Người dùng bấm "Áp dụng" gợi ý sửa (khi dữ liệu cũ đã được chính người dùng xác nhận trước đó,
// nên hệ thống không tự ý ghi đè mà chờ người dùng tự quyết định).
// sourceField theo field: gender/relationship có source riêng, 2 field xưng hô dùng chung addrSource.
function charSourceFieldFor(field){
  if(field==='gender')return 'genderSource';
  if(field==='relationship')return 'relationshipSource';
  if(field==='addrThemToMc'||field==='addrMcToThem')return 'addrSource';
  return field+'Source';
}
async function applyCharConflict(id,field){
  const c=S.characters.find(x=>x.id===id);
  if(!c)return;
  const cfg=CHARMEM_CONFLICT_CONFIG.find(x=>x.field===field);
  if(!cfg)return;
  const conflictField=cfg.conflictField;
  const sourceField=charSourceFieldFor(field);
  const conflict=c[conflictField];
  if(!conflict)return;
  // Ca đặc biệt "name": đây là tên thật vừa được phát hiện thay cho nhãn mô tả tạm (xem
  // detectRealNameStuckInNote) — ngoài đổi c.name còn phải giữ lại nhãn cũ làm alias (các chương
  // TRƯỚC đã dùng nhãn đó) và tắt namePlaceholder, giống hệt nhánh nâng cấp tự động ở
  // mergeAnalysisResults (chỉ khác là ở đây do người dùng tự bấm duyệt thay vì tự động).
  if(field==='name'){
    // Tên thật mới đã thuộc nhân vật khác -> đổi sẽ tạo 2 record trùng tên; bỏ gợi ý, người dùng nên dùng "Gộp".
    const clash=findAllCharsByNameOrAlias([conflict.value]).find(x=>x!==c);
    if(clash){
      // Tên thật đã là 1 nhân vật khác => chính là người đó: gộp biệt danh/nhãn vào nhân vật có tên thật. Tên thật giữ làm tên
      // nhân vật, biệt danh thành "Tên gọi khác" (mergeCharacterInto). Gợi ý được GIỮ NGUYÊN nếu người dùng bấm Hủy.
      quickMergeNickname(c.id,clash.id);
      return;
    }
    const origOk=conflict.origName?parseOrigNames(sanitizeOrigNameCandidate(conflict.origName,c,null,[],{allowLabel:false})):[];
    promoteToRealName(c,conflict.value,origOk,'người dùng duyệt');
    c[conflictField]=null;
    await saveCharacterMemory();
    if(_charEditingId===id)openCharModal(id); else renderCharList();
    return;
  }
  // Gợi ý sửa Tên gốc (khi ô này đang bị người dùng khoá): người dùng bấm Áp dụng = đồng ý, giữ cờ 'user'.
  if(field==='origName'){
    c.origName='';
    setOrigNameSingle(c,conflict.value);
    c.origNameSource='user';
    ensureOrigInAliases(c);
    c[conflictField]=null;
    await saveCharacterMemory();
    if(_charEditingId===id)openCharModal(id); else renderCharList();
    return;
  }
  c[field]=conflict.value;
  c[sourceField]='ai'; // vẫn tính là AI tự quản -> không khoá, chương sau AI vẫn có thể tự sửa tiếp mà không cần hỏi lại
  // User chủ động bấm "Áp dụng" gợi ý -> coi như xác nhận thủ công, gỡ luôn cờ protagonistDenied
  // (nếu có) để giá trị mới thực sự có hiệu lực, không bị chặn ngầm bởi 1 lần huỷ ngôi sao trước đó.
  if(field==='relationship'&&isProtagonistLabel(conflict.value)){c.isProtagonist=true;c.protagonistDenied=false;}
  c[conflictField]=null;
  await saveCharacterMemory();
  if(_charEditingId===id)openCharModal(id); else renderCharList();
}
// Người dùng bấm "Bỏ qua" -> giữ nguyên dữ liệu cũ, xoá gợi ý đi (AI sẽ không nhắc lại trừ khi
// phát hiện bằng chứng correction mới ở 1 chương khác).
async function dismissCharConflict(id,field){
  const c=S.characters.find(x=>x.id===id);
  if(!c)return;
  const cfg=CHARMEM_CONFLICT_CONFIG.find(x=>x.field===field);
  if(!cfg)return;
  c[cfg.conflictField]=null;
  await saveCharacterMemory();
  if(_charEditingId===id)openCharModal(id); else renderCharList();
}
function confirmDeleteChar(id){
  const c=S.characters.find(x=>x.id===id);
  if(!c)return;
  showPopup({
    title:'Xóa nhân vật này khỏi bộ nhớ?',
    msg:`<strong>${esc(c.name)}</strong> sẽ bị xóa khỏi Character Memory. Bản gốc và bản dịch không bị ảnh hưởng.`,
    btns:[
      {label:'Xóa',cls:'btn-d',cb:async()=>{
        S.characters=S.characters.filter(x=>x.id!==id);
        dropSameAsRefs(S.characters,id);
        dropEdgeRefs(S.characters,id);
        dropPersonaRefs(S.characters,id);
        await saveCharacterMemory();
        renderCharList();
      }},
      {label:'Hủy',cls:'btn'},
    ]
  });
}

// ===================================================================
// ===== "CHƯNG CẤT" CHỈ DẪN XƯNG HÔ/THỂ LOẠI TỪ PROMPT DỊCH CHÍNH =====
// ===================================================================
// Prompt dịch chính (ô "promptText" ở index.html) là nơi DUY NHẤT người dùng có thể tự tay dặn
// riêng cho bộ truyện của họ (thể loại, cách xưng hô Tây phương hoá, glossary tên riêng...), nhưng
// buildCharExtractPrompt/buildAuditReadPrompt trước đây hoàn toàn không biết gì về nội dung đó —
// chỉ dựa quy tắc chung chung. Nếu nhét NGUYÊN VĂN prompt dịch chính (có thể rất dài, lẫn cả hướng
// dẫn định dạng/thuật ngữ không liên quan) vào thẳng 2 prompt kia thì vừa tốn token vừa gây nhiễu.
// Giải pháp: gọi AI "chưng cất" 1 lần để lọc lấy đúng phần liên quan xưng hô/thể loại/tên riêng,
// rồi CACHE lại kết quả — chỉ gọi lại khi người dùng thực sự sửa nội dung prompt dịch chính (so
// bằng hash, không so nguyên văn để tiết kiệm chỗ lưu). Cache lưu theo TỪNG BỘ TRUYỆN (giống
// charMemStorageKey) vì các bộ khác nhau thường dùng prompt khác nhau.
function promptGuidanceStorageKey(){return 'dich-charm-guidance:'+(S.fname||'__noname__');}
// Hash chuỗi đơn giản (djb2 biến thể) — CHỈ dùng để phát hiện prompt dịch chính có bị sửa hay
// không (không cần chống va chạm mật mã học, chỉ cần đủ rẻ để không phải lưu lại nguyên văn prompt
// dài trong cache).
function simpleHash(s){
  let h=0;
  for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}
  return h.toString(36);
}
function buildPromptGuidanceDistillPrompt(mainPrompt){
  return `Dưới đây là PROMPT DỊCH CHÍNH mà người dùng đang dùng để dịch truyện — có thể dài, chứa nhiều loại chỉ dẫn khác nhau (định dạng output, cách dịch thuật ngữ chuyên môn, ví dụ minh hoạ, quy tắc kỹ thuật khác...).\n\n`+
    `Nhiệm vụ DUY NHẤT: đọc và CHỈ TRÍCH XUẤT đúng phần liên quan tới XƯNG HÔ giữa các nhân vật, THỂ LOẠI/BỐI CẢNH của truyện (VD tu tiên, đô thị hiện đại, phương Tây/hải tặc, xuyên không, cận đại/dân quốc...), và bất kỳ QUY ƯỚC TÊN RIÊNG/CÁCH GỌI cụ thể nào người dùng đã dặn riêng cho từng nhân vật (nếu có) — BỎ QUA HOÀN TOÀN mọi phần không liên quan (định dạng output, cách dịch thuật ngữ không phải xưng hô, ví dụ minh hoạ, hướng dẫn kỹ thuật khác).\n\n`+
    `Trả lời NGẮN GỌN dạng vài gạch đầu dòng, KHÔNG QUÁ khoảng 120 từ, chỉ nêu đúng sự thật/chỉ dẫn cụ thể, không diễn giải dài dòng, không thêm tiêu đề hay markdown fence. Nếu prompt dịch chính không có bất kỳ nội dung nào liên quan tới xưng hô/thể loại/tên riêng, trả về ĐÚNG một chuỗi rỗng, không viết gì khác.\n\n`+
    `PROMPT DỊCH CHÍNH:\n${mainPrompt.slice(0,8000)}`;
}
// Lấy chỉ dẫn đã chưng cất từ prompt dịch chính — có cache theo hash, chỉ gọi AI lại khi nội dung
// prompt dịch chính thực sự đổi. Không bao giờ throw; lỗi thì trả về '' (2 bước kia tự quay lại dùng
// quy tắc chung chung như trước, không bị chặn dịch).
async function getMainPromptGuidance(){
  try{
    if(charmemGeneric())return ''; // đích ≠ vi: chỉ dẫn này là về xưng hô/Hán Việt → không dùng
    const mainPrompt=(typeof getPrompt==='function')?getPrompt():'';
    if(!mainPrompt)return '';
    const hash=simpleHash(mainPrompt);
    let cache=null;
    try{cache=JSON.parse(localStorage.getItem(promptGuidanceStorageKey())||'null');}catch(e){cache=null;}
    if(cache&&cache.hash===hash)return cache.guidance||'';
    const keys=getKeys();
    // Chưa có key để gọi API: nếu cache cũ (dù đã lệch hash vì prompt vừa đổi) vẫn còn, thà dùng tạm
    // còn hơn không có gì — tự cập nhật lại ở lượt gọi kế tiếp khi có key.
    if(!keys.length)return cache?cache.guidance||'':'';
    const promptText=buildPromptGuidanceDistillPrompt(mainPrompt);
    const messages=[{role:'user',parts:[{text:promptText}]}];
    // DeepSeek chỉ có 1 model — không có model NHẸ riêng như CHAR_MODEL_A của Gemini để tiết kiệm
    // chi phí, đành dùng thẳng model đang chọn.
    const distillModel=getProvider()==='deepseek'?getModel():CHAR_MODEL_A;
    let rawText=await callCharModel(keys,distillModel,messages,CHAR_ANALYSIS_TIMEOUT_MS,'distill');
    rawText=(rawText||'').trim().replace(/^```[a-z]*\s*/i,'').replace(/```\s*$/,'').trim();
    // Model đôi khi trả nguyên chữ "" hoặc '' thay vì để trống thật khi không có gì liên quan.
    if(rawText==='""'||rawText==="''")rawText='';
    const guidance=rawText.slice(0,1500); // lưới an toàn phòng model bỏ qua giới hạn ~120 từ đã dặn
    try{localStorage.setItem(promptGuidanceStorageKey(),JSON.stringify({hash,guidance,ts:Date.now()}));}catch(e){}
    console.log(guidance
      ?`[Luồng 1][Chưng cất prompt] Đã chưng cất chỉ dẫn xưng hô/thể loại từ prompt dịch chính:\n${guidance}`
      :'[Luồng 1][Chưng cất prompt] Prompt dịch chính không có nội dung nào liên quan xưng hô/thể loại — không có chỉ dẫn thêm.');
    return guidance;
  }catch(e){
    console.log('[Luồng 1][Chưng cất prompt] Lỗi chưng cất prompt dịch chính — 2 bước sau tạm dùng quy tắc chung chung:',e.message||e);
    return '';
  }
}

// ===== PHÂN TÍCH NHÂN VẬT TRƯỚC KHI DỊCH =====
// Ký tự trong khối CJK Unified Ideographs — dùng để phát hiện tên còn sót lại chữ Hán chưa dịch.
function containsCJK(s){return /[\u3400-\u9fff]/.test(s||'');}

// ===== QUÉT CƠ HỌC CHỮ HÁN CÒN SÓT TRONG BẢN DỊCH (dùng cho bước soát "Luồng 3") =====
// LÝ DO: bước soát KIỂM TRA 4 (sot_dich) trước đây bắt AI (model lite) TỰ ĐỌC cả chương dài để
// "tìm ra" chỗ còn sót chữ Hán — đây là bài toán "tìm kim trong đống rơm" cổ điển với LLM: chữ Hán
// sót lại thường chỉ là 1-2 cụm rải rác giữa hàng nghìn chữ tiếng Việt, model lite rất dễ lướt qua
// mà không để ý, nhất là khi cùng lúc phải soát cả 3 loại lỗi khác nữa. Regex thì KHÔNG BAO GIỜ bỏ
// sót 1 ký tự CJK nào — nên quét cơ học TRƯỚC bằng JS, lấy sẵn NGUYÊN VĂN đoạn chứa nó kèm ngữ cảnh
// 2 bên, rồi đưa thẳng danh sách này vào prompt như "bằng chứng đã có sẵn, chỉ cần dịch" thay vì bắt
// AI tự tìm — biến việc "phát hiện" (dễ sót) thành việc "dịch hộ 1 câu đã chỉ rõ vị trí" (AI làm tốt
// hơn nhiều). Việc TỰ TÌM câu/cụm tiếng ANH còn sót (không có ký tự đặc trưng để regex bắt chắc như
// CJK) vẫn phải để AI tự đọc như cũ — quét cơ học ở đây CHỈ xử lý riêng phần chữ Hán.
const CJK_RUN_REGEX=/[\u3400-\u9fff]+/g;
// Độ dài tối đa (số ký tự) mở rộng ngữ cảnh về mỗi phía của 1 cụm chữ Hán tìm được, trước khi cắt lại
// theo dấu câu gần nhất — tránh trường hợp không tìm thấy dấu câu nào gần mà lấy ngữ cảnh dài vô hạn.
const CJK_CONTEXT_WINDOW=100;
// Từ vị trí "idx" (bắt đầu 1 cụm CJK) lùi về bên trái trong "text", tìm điểm bắt đầu ngữ cảnh: lùi
// tối đa CJK_CONTEXT_WINDOW ký tự rồi cắt tại dấu ngắt câu/xuống dòng gần nhất (nếu có) để ngữ cảnh
// lấy được là 1 câu/mệnh đề trọn vẹn thay vì cắt ngang giữa câu.
function expandLeftToSentenceStart(text,idx){
  const winStart=Math.max(0,idx-CJK_CONTEXT_WINDOW);
  const seg=text.slice(winStart,idx);
  let cut=-1;
  for(const mk of['.','!','?','\n','"','\u201c','\u201d'])
    {const p=seg.lastIndexOf(mk);if(p>cut)cut=p;}
  return cut===-1?winStart:winStart+cut+1;
}
// Tương tự expandLeftToSentenceStart nhưng mở rộng sang bên PHẢI từ điểm kết thúc cụm CJK.
function expandRightToSentenceEnd(text,idx){
  const winEnd=Math.min(text.length,idx+CJK_CONTEXT_WINDOW);
  const seg=text.slice(idx,winEnd);
  let cut=-1;
  for(const mk of['.','!','?','\n'])
    {const p=seg.indexOf(mk);if(cut===-1||(p!==-1&&p<cut))cut=p;}
  return cut===-1?winEnd:idx+cut+1;
}
// Quét toàn bộ "text" tìm MỌI cụm chữ Hán liên tiếp còn sót, gộp các cụm có ngữ cảnh mở rộng đè lên
// nhau thành 1 candidate duy nhất (tránh gửi trùng lặp/chồng lấn cho AI), trả về mảng các đoạn ngữ
// cảnh NGUYÊN VĂN (dùng làm "before" khi áp fix — xem applyAddressFixes) chắc chắn còn sót chữ Hán.
function findCJKLeftoverCandidates(text){
  if(!text)return[];
  const raw=[];
  let m;
  CJK_RUN_REGEX.lastIndex=0;
  while((m=CJK_RUN_REGEX.exec(text))){
    raw.push({start:expandLeftToSentenceStart(text,m.index),end:expandRightToSentenceEnd(text,m.index+m[0].length)});
  }
  if(!raw.length)return[];
  raw.sort((a,b)=>a.start-b.start);
  const merged=[raw[0]];
  for(let i=1;i<raw.length;i++){
    const last=merged[merged.length-1],cur=raw[i];
    if(cur.start<=last.end)last.end=Math.max(last.end,cur.end);
    else merged.push(cur);
  }
  return merged.map(r=>text.slice(r.start,r.end).trim()).filter(Boolean);
}

// ===== QUÉT CƠ HỌC TIẾNG ANH CÒN SÓT (dùng cho job "sót dịch" của Luồng 3) =====
// Chỉ bắt CỤM tiếng Anh THẬT (≥2 từ liên tiếp toàn chữ ASCII, trong đó có ít nhất 1 từ chức năng
// tiếng Anh mà tiếng Việt không bao giờ có — the/is/you/with...), hoặc 1 từ cảm thán/lịch sự đứng
// riêng (sorry/please/thanks...). CỐ TÌNH KHÔNG bắt từ đơn lẻ / tên riêng (John, Level, iPhone...) vì
// tiếng Việt vốn hay giữ nguyên các từ đó — bắt vào chỉ sinh báo oan. Không có từ nào trong danh
// sách này trùng từ tiếng Việt không dấu thông dụng (đã loại: an, to, me, do, so, no, can, be, on...).
// Đây CHỈ là bước "phát hiện" bằng code; AI ở lượt sau mới quyết định có dịch hay bỏ qua (tên riêng,
// tựa đề, tên skill...). Tách token theo khoảng trắng (không dùng \b) để không bị vỡ với chữ có dấu.
// MỞ RỘNG (sau khi rà lại): bộ cũ chỉ có hư từ ngữ pháp (mạo từ/đại từ/giới từ/động từ nối) nên bỏ lọt
// nguyên 1 lớp thành ngữ/câu cảm thán ngắn RẤT hay gặp trong lời thoại mà KHÔNG chứa hư từ nào trong đó
// (VD "move on", "watch out", "good job", "well done", "excuse me", "trust me", "help me" — mỗi từ
// trong các cụm này đều không nằm trong bộ cũ). Vì candidate loại "en" chỉ là NGHI NGỜ (AI lượt sau tự
// quyết định dịch hay bỏ qua tên riêng/thuật ngữ), nên thêm rộng rãi hơn ở đây rủi ro thấp (tối đa tốn
// thêm vài token cho AI tự loại), trong khi bỏ sót là mất vĩnh viễn (không còn bước nào khác dò lại).
// KHÔNG thêm "ok/okay/oh/well/hey": đây là nhóm từ mượn tiếng Anh đã được chấp nhận rộng rãi, cố tình
// giữ nguyên trong nhiều bản dịch tiếng Việt hiện đại (giống văn nói) — prompt sót dịch hiện chỉ cho AI
// quyền bỏ qua vì "tên riêng/tựa đề/thuật ngữ", không có nhánh "từ mượn được chấp nhận", nên thêm các
// từ này dễ khiến AI dịch đè lên đúng chỗ người dịch cố tình giữ nguyên — cần cân nhắc thêm prompt nếu
// muốn bật nhóm này (xem ghi chú cuối file).
const EN_LEFTOVER_STRONG_WORDS=new Set(['the','is','are','was','were','been','you','your','yours','he','she','they','them','we','us','my','his','her','its','our','their','and','but','not','this','that','these','those','with','from','have','has','had','will','would','could','should','what','who','why','how','when','where','which','there','here','of','for','just','very','yes','sorry','please','thanks','thank','hello','damn','hell','shit','fuck','wow','oops','huh','hmm','done','good','job','excuse','trust','help','watch','come','stop','move','wait','great','nice','sure','exactly','really','alright','welcome','congratulations','congrats','goodbye','bye',"i'm","i'll","i've","i'd","don't","can't","won't","didn't","doesn't","isn't","aren't","wasn't","it's","that's","let's","you're","we're","they're","he's","she's"]);
// Từ cảm thán đứng RIÊNG 1 mình vẫn coi là candidate (không cần ≥2 từ) — chỉ chọn từ nào chắc chắn
// không trùng 1 từ tiếng Việt không dấu thông dụng nào để tránh báo oan tràn lan.
const EN_LEFTOVER_SOLO_WORDS=new Set(['sorry','please','thanks','hello','yes','wow','damn','stop','wait','move','great','nice','sure','exactly','really','alright','welcome','oops','huh','hmm','congratulations','congrats','goodbye','bye']);
// Từ nối/trạng từ tiếng Anh ĐỨNG ĐẦU CÂU hay bị bỏ sót khi dịch (VD "After ...", "Then ...", "But ...") —
// bản dịch chỉ còn đúng 1 từ này nguyên xi trước phần câu đã là tiếng Việt nên bộ quét ≥2 từ ở trên
// KHÔNG bắt được. Chỉ tính là candidate khi từ này nằm ĐÚNG ĐẦU CÂU (đầu đoạn / sau dấu kết câu / sau
// dấu mở ngoặc kép đầu lời thoại) để tránh báo oan khi nó là 1 phần của tên riêng/tựa đề giữa câu.
// Không có từ nào trùng từ tiếng Việt không dấu thông dụng (đã loại "so", "no", "to", "me", "do", "can"...).
// Chỉ là bước phát hiện: AI ở lượt sau vẫn tự quyết định (tên riêng/tựa đề thì bỏ qua).
const EN_LEFTOVER_SENTENCE_START_WORDS=new Set(['after','then','but','and','however','because','while','when','if','also','finally','suddenly','meanwhile','now','still','even','only','maybe','perhaps','once','before','since','until','though','although','instead','besides','anyway','therefore','thus','next','later','soon','again','first','yet','otherwise','afterwards','afterward','eventually','immediately','actually','honestly']);
// pos có phải ĐẦU CÂU không: bỏ qua khoảng trắng + dấu mở ngoặc kép/gạch đầu dòng đứng trước, rồi xem ký tự
// thực sự đứng trước là đầu văn bản / xuống dòng / dấu kết câu, hoặc (nếu có mở ngoặc kép) dấu :/, dẫn lời thoại.
function isEnglishSentenceStart(text,pos){
  let i=pos-1,sawQuote=false;
  while(i>=0&&/[\s"“”‘'「『«(\[—–-]/.test(text[i])){
    if(/["“”‘'「『«]/.test(text[i]))sawQuote=true;
    i--;
  }
  if(i<0)return true;
  if(/[.!?…。！？\n]/.test(text[i]))return true;
  return sawQuote&&/[:,，：]/.test(text[i]);
}
function findEnglishLeftoverCandidates(text){
  if(!text)return[];
  const toks=[];
  const re=/\S+/g;
  let m;
  while((m=re.exec(text))){
    const core=m[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,'').replace(/’/g,"'");
    toks.push({start:m.index,ws:m.index+Math.max(0,m[0].search(/[\p{L}\p{N}]/u)),end:m.index+m[0].length,core,en:/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(core)});
  }
  const raw=[];
  let run=[];
  const flush=()=>{
    if(!run.length)return;
    const lows=run.map(t=>t.core.toLowerCase());
    const hasStrong=lows.some(w=>EN_LEFTOVER_STRONG_WORDS.has(w));
    const solo=run.length===1&&EN_LEFTOVER_SOLO_WORDS.has(lows[0]);
    const startWord=EN_LEFTOVER_SENTENCE_START_WORDS.has(lows[0])&&isEnglishSentenceStart(text,run[0].ws);
    if((run.length>=2&&hasStrong)||solo||startWord){
      raw.push({start:expandLeftToSentenceStart(text,run[0].start),end:expandRightToSentenceEnd(text,run[run.length-1].end)});
    }
    run=[];
  };
  for(const t of toks){
    if(!t.en){flush();continue;}
    const prev=run[run.length-1];
    if(prev&&!/^[ \t]+$/.test(text.slice(prev.end,t.start)))flush();
    run.push(t);
  }
  flush();
  if(!raw.length)return[];
  raw.sort((a,b)=>a.start-b.start);
  const merged=[raw[0]];
  for(let i=1;i<raw.length;i++){
    const last=merged[merged.length-1],cur=raw[i];
    if(cur.start<=last.end)last.end=Math.max(last.end,cur.end);
    else merged.push(cur);
  }
  return merged.map(r=>text.slice(r.start,r.end).trim()).filter(Boolean);
}

// [Mục 7] BEGIN — MÁY QUÉT ÂM TIẾT TIẾNG VIỆT (cơ học, không tốn API)
// LÝ DO: model dịch (flash-lite) thỉnh thoảng sinh sai token: "vẽch", "lạiộ"... Đây là âm tiết KHÔNG THỂ tồn tại
// trong tiếng Việt, nên bắt được bằng luật mà không cần AI đọc cả chương. Bắt không được các lỗi mà kết quả vẫn là
// âm tiết hợp lệ (tẻ nhò, ơn→ớn): phần đó vẫn thuộc job chính tả bằng AI.
// NGUYÊN TẮC CHỐNG BÁO OAN (ưu tiên hơn việc bắt đủ): chỉ xét từ có ÍT NHẤT 1 dấu thanh/dấu mũ/móc/đ (từ Latin thuần
// như "much", "Level" bỏ qua); từ viết hoa GIỮA câu coi là tên riêng, bỏ qua; từ có chữ f/j/w/z bỏ qua.
const VN_TONE_MARKS={'\u0300':'huyen','\u0301':'sac','\u0303':'nga','\u0309':'hoi','\u0323':'nang'};
const VN_ONSETS=['ngh','ch','gh','gi','kh','ng','nh','ph','qu','th','tr','b','c','d','đ','g','h','k','l','m','n','p','r','s','t','v','x',''];
const VN_CODAS=['ch','ng','nh','c','m','n','p','t',''];
const VN_NUCLEI=new Set(['a','ă','â','e','ê','i','o','ô','ơ','u','ư','y',
  'ai','ao','au','ay','âu','ây','eo','êu','ia','iê','iu','oa','oă','oe','oi','ôi','ơi','ua','uâ','uê','ui','uô','uơ','ưa','ưi','ươ','ưu','uy','yê','oo',
  'iêu','yêu','oai','oao','oay','oeo','uây','uôi','ươi','ươu','uyê','uya','uyu']);
const VN_NUCLEUS_NEEDS_CODA=new Set(['iê','yê','uyê','uô','ươ','ă','â']); // âm tiết mở không có các nguyên âm này
const VN_NUCLEUS_CODAS={'iê':'c m n ng p t','yê':'n t ng','uyê':'n t','uô':'c m n ng t','ươ':'c m n ng p t'};
const VN_CH_NH_NUCLEI=new Set(['a','ê','i','e','y','oa','uy','uê']); // vần -ch / -nh chỉ đi với các nguyên âm này
const VN_ENTERING_CODAS=new Set(['c','ch','p','t']); // vần chặn: chỉ mang thanh sắc hoặc nặng
// Tách 1 từ thành {base (không dấu thanh, NFC, chữ thường), tones[]}. Chữ ă â ê ô ơ ư đ giữ nguyên trong base.
function vnSplitTone(tok){
  const tones=[];let base='';
  for(const ch of String(tok).normalize('NFD')){
    if(VN_TONE_MARKS[ch])tones.push(VN_TONE_MARKS[ch]);else base+=ch;
  }
  return{base:base.normalize('NFC').toLowerCase(),tones};
}
// Trả null nếu hợp lệ, hoặc chuỗi lý do nếu KHÔNG THỂ là âm tiết tiếng Việt.
function vnSyllableProblem(tok){
  const {base,tones}=vnSplitTone(tok);
  if(!base)return null;
  if(tones.length>1)return'có '+tones.length+' dấu thanh trong 1 âm tiết';
  if(/[fjwz]/.test(base)||/[^a-zăâêôơưđ]/.test(base))return null; // không phải chữ Việt thuần -> không phán
  const tone=tones[0]||'';
  let firstProblem=null;
  for(const on of VN_ONSETS){
    if(on&&!base.startsWith(on))continue;
    const rest=base.slice(on.length);
    for(const co of VN_CODAS){
      if(co&&!rest.endsWith(co))continue;
      const nuc=rest.slice(0,rest.length-co.length);
      if(!nuc)continue;
      if(!VN_NUCLEI.has(nuc)){firstProblem=firstProblem||'cụm nguyên âm "'+nuc+'" không hợp lệ';continue;}
      // chính tả c/k, g/gh, ng/ngh
      const front=/^(i|e|ê|y|iê|yê)/.test(nuc);
      if(on==='k'&&!front){firstProblem=firstProblem||'"k" chỉ đứng trước i/e/ê/y';continue;}
      if(on==='c'&&front){firstProblem=firstProblem||'"c" không đứng trước i/e/ê/y';continue;}
      if(on==='gh'&&!front){firstProblem=firstProblem||'"gh" chỉ đứng trước i/e/ê';continue;}
      if(on==='ngh'&&!front){firstProblem=firstProblem||'"ngh" chỉ đứng trước i/e/ê';continue;}
      if((co==='ch'||co==='nh')&&!VN_CH_NH_NUCLEI.has(nuc)){firstProblem=firstProblem||'vần "'+nuc+co+'" không tồn tại';continue;}
      if(!co&&VN_NUCLEUS_NEEDS_CODA.has(nuc)){firstProblem=firstProblem||'âm tiết mở không thể có "'+nuc+'"';continue;}
      if(VN_NUCLEUS_CODAS[nuc]&&co&&!VN_NUCLEUS_CODAS[nuc].split(' ').includes(co)){firstProblem=firstProblem||'vần "'+nuc+co+'" không tồn tại';continue;}
      if((nuc==='ă'||nuc==='â')&&(co==='ch'||co==='nh')){firstProblem=firstProblem||'vần "'+nuc+co+'" không tồn tại';continue;}
      if(VN_ENTERING_CODAS.has(co)&&tone!=='sac'&&tone!=='nang'){
        firstProblem=firstProblem||'vần kết thúc bằng "'+co+'" chỉ được mang thanh sắc/nặng (đang '+(tone||'không dấu')+')';continue;
      }
      return null; // có ít nhất 1 cách tách hợp lệ
    }
  }
  return firstProblem||'không tách được thành phụ âm đầu + vần hợp lệ';
}
function isValidVnSyllable(tok){return vnSyllableProblem(tok)===null;}
// Từ đáng kiểm: có dấu đặc trưng tiếng Việt (nếu không thì có thể là từ Latin/tiếng Anh).
const VN_MARKED_RE=/[\u0300\u0301\u0303\u0309\u0323ăâêôơưđ\u0306\u0302\u031B]/i;
function vnHasMarks(tok){return VN_MARKED_RE.test(String(tok).normalize('NFD'))||/[đĐ]/.test(tok);}
// Quét 1 đoạn: trả [{word,index,why}] cho mọi âm tiết không hợp lệ (chỉ tính từ thuần chữ cái, bỏ chữ Hán).
function findSuspectSyllables(line){
  const out=[];
  if(!line)return out;
  const re=/[\p{L}\p{M}]+/gu;let m;
  while((m=re.exec(line))){
    const tok=m[0];
    if(containsCJK(tok)||!vnHasMarks(tok))continue;
    if(/^\p{Lu}/u.test(tok)&&!isEnglishSentenceStart(line,m.index))continue; // tên riêng giữa câu
    const why=vnSyllableProblem(tok);
    if(why)out.push({word:tok,index:m.index,why});
  }
  return out;
}
// Gom thành candidate: mỗi cụm = từ nghi ngờ ± VN_SYL_CONTEXT_WORDS từ lân cận (trong cùng đoạn); cụm chồng nhau thì gộp.
const VN_SYL_CONTEXT_WORDS=4;
function collectSyllableCandidates(paras){
  const out=[];let id=0;
  for(const p of paras){
    const sus=findSuspectSyllables(p.text);
    if(!sus.length)continue;
    const toks=[];const re=/\S+/g;let m;
    while((m=re.exec(p.text)))toks.push({s:m.index,e:m.index+m[0].length});
    const wins=[];
    sus.forEach(s=>{
      const ti=toks.findIndex(t=>s.index>=t.s&&s.index<t.e);if(ti<0)return;
      const a=Math.max(0,ti-VN_SYL_CONTEXT_WORDS),b=Math.min(toks.length-1,ti+VN_SYL_CONTEXT_WORDS);
      const last=wins[wins.length-1];
      if(last&&a<=last.b+1){last.b=Math.max(last.b,b);last.words.push(s);}else wins.push({a,b,words:[s]});
    });
    wins.forEach(w=>out.push({id:++id,p:p.n,text:p.text.slice(toks[w.a].s,toks[w.b].e),words:w.words.map(x=>x.word),whys:w.words.map(x=>x.why)}));
  }
  return out;
}
// 7.3: reason vô nghĩa kiểu "'ch' thay vì 'ch'" — 2 chuỗi trong cặp nháy giống hệt nhau.
function isNonsenseFixReason(reason){
  const qs=[];const re=/'([^']{1,20})'|"([^"]{1,20})"|“([^”]{1,20})”|‘([^’]{1,20})’/g;let m;
  const s=String(reason||'');
  while((m=re.exec(s)))qs.push((m[1]||m[2]||m[3]||m[4]||'').normalize('NFC').toLowerCase());
  for(let i=0;i<qs.length;i++)for(let j=i+1;j<qs.length;j++)if(qs[i]&&qs[i]===qs[j])return true;
  return false;
}
// 7.4: các âm tiết KHÔNG hợp lệ trong "after" mà "before" không có (tức fix tự đẻ thêm token hỏng).
function newInvalidSyllables(before,after){
  const bs=new Set(findSuspectSyllables(String(before||'')).map(x=>x.word));
  return findSuspectSyllables(String(after||'')).filter(x=>!bs.has(x.word));
}
// Hàng đợi "cần người xem lại" (7.3/7.4): fix hợp lệ về âm tiết nhưng không kiểm được nghĩa. Xem bằng auditReviewReport() trong Console.
const AUDIT_REVIEW_QUEUE=[];
function auditReviewPush(item){AUDIT_REVIEW_QUEUE.push(Object.assign({ts:Date.now()},item));if(AUDIT_REVIEW_QUEUE.length>200)AUDIT_REVIEW_QUEUE.shift();}
function auditReviewReport(){console.table(AUDIT_REVIEW_QUEUE.map(x=>({lý_do:x.why,before:x.before,after:x.after})));return AUDIT_REVIEW_QUEUE.slice();}
// [Mục 7] END

// [Bước 0 — đo quota] Đếm số lượt gọi API thật của Luồng 1 theo model + mục đích (mỗi lần thử 1 key = 1 lượt).
// Chỉ ghi số liệu + log, KHÔNG đổi hành vi. Xem tổng bằng charmemQuotaReport() trong Console.
const CHARMEM_QUOTA_STATS={};
function charmemQuotaCount(model,purpose,ok,errMsg){
  try{
    const m=model===CHAR_MODEL_B?'B':model===CHAR_MODEL_A?'A':model;
    const k=m+'|'+(purpose||'?')+'|'+(ok?'ok':'loi');
    CHARMEM_QUOTA_STATS[k]=(CHARMEM_QUOTA_STATS[k]||0)+1;
    if(!ok){
      const e=String(errMsg||'');
      const tag=e.includes('CHAN_NGAY')?'CHAN-NGAY':e.includes('CHAN_PHUT')?'CHAN-PHUT':e.includes('QUOTA_PER_DAY')?'429-NGAY':e.includes('429')?'429-PHUT':e.includes('TIMEOUT')?'TIMEOUT':'khac';
      const k2=m+'|'+(purpose||'?')+'|'+tag;
      CHARMEM_QUOTA_STATS[k2]=(CHARMEM_QUOTA_STATS[k2]||0)+1;
    }
  }catch(e){}
}
function charmemQuotaSnapshot(){return Object.assign({},CHARMEM_QUOTA_STATS);}
// Hiệu số 2 snapshot -> chuỗi gọn, VD "B: extract 1, verify 1 | A: judge 1"
function charmemQuotaDiff(before){
  const by={};
  Object.keys(CHARMEM_QUOTA_STATS).forEach(k=>{
    const d=CHARMEM_QUOTA_STATS[k]-(before[k]||0);
    if(d<=0)return;
    const [m,pu,st]=k.split('|');
    if(st==='loi')return; // 'loi' là tổng, đã có dòng chi tiết theo loại lỗi
    (by[m]=by[m]||[]).push(pu+(st==='ok'?'':' ['+st+']')+' '+d);
  });
  return Object.keys(by).sort().map(m=>m+': '+by[m].join(', ')).join(' | ')||'(không có lượt gọi)';
}
function charmemQuotaReport(){console.log('[Quota] Tổng từ khi nạp trang — '+charmemQuotaDiff({}));}

// [Bước 3] Hạ cấp có kiểm soát khi 1 model hết quota NGÀY ở MỌI key (rlDayBlocked, dùng chung với luồng dịch).
// Lượt TUỲ CHỌN (giám khảo tên, xác minh, dịch tên cứng đầu, soát lỗi) bị bỏ qua cho model đó — không gọi API, không đếm lượt;
// lượt BẮT BUỘC (trích xuất) vẫn chạy (và tự sang model dự phòng nếu model chính hết). Log 1 dòng khi bắt đầu hạ cấp,
// 1 dòng khi hồi phục — không spam theo từng lượt. Không có rlDayBlocked (thiếu translate.js) thì luôn cho chạy như cũ.
const _charDegraded={};
function charmemModelDayDead(model,keys){
  if(!_charRlOn()||!keys||!keys.length)return false;
  return keys.every(k=>rlDayBlocked(model,k));
}
// [Bước 5] Model này CÒN CHỖ NGAY BÂY GIỜ không? (có ít nhất 1 key chưa hết quota ngày VÀ còn trong 4 lượt/phút).
// Chỉ KIỂM TRA, không ghi nhận lượt (rlCheck không tính lượt, rlRecord mới tính). Dùng để quyết định có chuyển A<->B
// khi model kia đang bận hay không: chuyển sang model đang kín chỉ tốn 12s chờ rồi lại lỗi, và còn giành chỗ của
// lượt chính của model đó. Không có rlCheck (thiếu translate.js) thì luôn coi là còn chỗ (hành vi cũ).
function charmemModelHasRoom(model,keys){
  if(!_charRlOn()||!keys||!keys.length)return true;
  return keys.some(k=>!rlDayBlocked(model,k)&&(!CHARMEM_RL_MINUTE_LIMIT_ON||rlCheck(model,k)));
}
function charmemOptionalAllowed(model,keys,what){
  const m=model===CHAR_MODEL_B?'B':model===CHAR_MODEL_A?'A':model;
  if(!charmemModelDayDead(model,keys)){
    if(_charDegraded[model]){delete _charDegraded[model];console.log(`[Hạ cấp] Model ${m} đã có quota trở lại — chạy lại các lượt tuỳ chọn.`);}
    return true;
  }
  if(!_charDegraded[model]){
    _charDegraded[model]=true;
    console.log(`[Hạ cấp] Model ${m} hết quota ngày ở mọi key — tạm bỏ các lượt tuỳ chọn dùng model này (giám khảo tên, xác minh, tên cứng đầu, soát lỗi); giữ trích xuất. Lượt vừa bỏ: ${what}.`);
  }
  return false;
}

// [Bước 2] Gọi 1 model cụ thể cho mọi request nhỏ của Luồng 1 (trích xuất, xác minh, giám khảo...).
// Dùng CHUNG 2 lớp chặn với luồng dịch nội dung + dịch tiêu đề (translate.js):
//   - rlDayBlocked/rlDayBlock: key đã hết quota NGÀY cho đúng model này → bỏ qua; 429 kèm QUOTA_PER_DAY → khoá key.
//   - rlCheck/rlRecord: bộ đếm 4 req/phút/key/model → lượt gọi của Luồng 1 giờ được luồng dịch "nhìn thấy".
// KHÔNG dùng acquireApiLock (tránh kẹt hàng khi dịch đang chờ phân tích).
// Khác trước: xoay vòng key (không luôn bắt đầu từ key 1); chỉ đổi key khi lỗi 429/5xx/401/403/mạng,
// lỗi 400/404 hoặc "không trả về nội dung" thì DỪNG (đổi key cũng vô ích, chỉ tốn quota).
// false = BỎ giới hạn 4 lượt/phút/key/model cho Luồng 1: không chờ chỗ trống, không ghi lượt vào bộ đếm chung với luồng dịch.
// Vẫn giữ chặn theo NGÀY (rlDayBlocked, khi API thật sự trả 429 QUOTA_PER_DAY) và vẫn tự đổi key khi API trả 429/5xx.
// Đặt true để bật lại giới hạn theo phút như cũ.
const CHARMEM_RL_MINUTE_LIMIT_ON=false;
const CHARMEM_RL_WAIT_MAX_MS=12000;   // chờ tối đa để có chỗ trống theo phút (không tính vào timeout của lượt gọi)
const CHARMEM_RL_WAIT_STEP_MS=1500;
const CHARMEM_429_WAIT_MS=15000;     // 429 theo PHÚT: chờ 15s rồi mới thử lại (429 quota NGÀY thì không chờ)
const CHARMEM_429_MAX_ROUNDS=2;      // số vòng key được phép thử lại thêm sau khi đã chờ 15s
const _charSick={};                   // model -> thời điểm (ms) tới khi coi model đang quá tải 5xx (chỉ thử 1 key thay vì 2)
const CHARMEM_5XX_MAX_KEYS=2;        // 503/5xx là lỗi CẢ MODEL (không phải lỗi key): thử tối đa 2 key rồi thoát để nơi gọi sang model dự phòng
const CHARMEM_5XX_SICK_MS=30000;
const _charKeyCursor={};              // model -> vị trí key bắt đầu cho lượt gọi kế tiếp
function _charRlOn(){return typeof rlCheck==='function'&&typeof rlRecord==='function'&&typeof rlDayBlocked==='function'&&typeof rlDayBlock==='function';}
function _charErrStops(msg){
  // true = lỗi mà đổi key cũng không giúp gì → dừng ngay
  if(/^(400|404)\b/.test(msg))return true;
  if(msg.includes('API không trả về nội dung'))return true;
  return false;
}
// opts (tuỳ chọn): {json:true} -> bắt Gemini trả đúng MIME application/json (xem _callAPIRaw trong translate.js).
async function callCharModel(keys,model,messages,timeoutMs,purpose,opts){
  const n=keys.length;
  if(!n)throw new Error('Không có API key');
  const gate=_charRlOn();
  const startAt=(_charKeyCursor[model]||0)%n;
  const order=[];for(let i=0;i<n;i++)order.push((startAt+i)%n);
  const ctl={cancelled:false};
  // Timeout của lượt gọi được ĐẶT LẠI sau mỗi lần chờ 429 (15s), để thời gian chờ không bị tính vào timeout 30s.
  let timer=null,rejectTimeout=null;
  function armTimer(){clearTimeout(timer);timer=setTimeout(()=>{ctl.cancelled=true;rejectTimeout(new Error('TIMEOUT'));},timeoutMs);}

  // Pha 1 — chọn key còn chỗ. Chờ ngắn nếu tất cả đang kín theo phút; báo lỗi rõ nếu hết quota ngày.
  async function pickFirstKey(){
    if(!gate)return order[0];
    const waitStart=Date.now();
    while(true){
      const alive=order.filter(ki=>!rlDayBlocked(model,keys[ki]));
      if(!alive.length){
        charmemQuotaCount(model,purpose,false,'CHAN_NGAY');
        throw new Error('429 QUOTA_PER_DAY (CHAN_NGAY): mọi key đã hết quota ngày cho '+model);
      }
      let free=CHARMEM_RL_MINUTE_LIMIT_ON?alive.find(ki=>rlCheck(model,keys[ki])):alive[0];
      // [Sched] ưu tiên key đang có chỗ trống (hoặc sắp có chỗ sớm nhất)
      if(free!==undefined&&typeof Sched!=='undefined'&&Sched.enforcing()&&alive.length>1){
        free=alive.reduce((b,ki)=>Sched.waitMs(keys[ki],model)<Sched.waitMs(keys[b],model)?ki:b,free);
      }
      if(free!==undefined)return free;
      if(Date.now()-waitStart>=CHARMEM_RL_WAIT_MAX_MS){
        charmemQuotaCount(model,purpose,false,'CHAN_PHUT');
        throw new Error('429 (CHAN_PHUT): mọi key đang kín 4 lượt/phút cho '+model+' — chờ '+Math.round(CHARMEM_RL_WAIT_MAX_MS/1000)+'s vẫn chưa có chỗ');
      }
      await new Promise(r=>setTimeout(r,CHARMEM_RL_WAIT_STEP_MS));
    }
  }

  // Pha 2 — gọi thật. Bắt đầu từ key đã chọn, đổi key (không chờ thêm) chỉ khi lỗi đáng đổi.
  async function runCalls(firstKi){
    let lastErr='';
    const seq=order.slice(order.indexOf(firstKi)).concat(order.slice(0,order.indexOf(firstKi)));
    let rounds429=0;
    let n5xx=0;
    const max5xx=(_charSick[model]||0)>Date.now()?1:CHARMEM_5XX_MAX_KEYS;
    for(let j=0;j<seq.length;j++){
      if(ctl.cancelled)throw new Error('TIMEOUT');
      const ki=seq[j],key=keys[ki];
      if(gate){
        if(rlDayBlocked(model,key))continue;
        if(CHARMEM_RL_MINUTE_LIMIT_ON){
          if(j>0&&!rlCheck(model,key))continue; // key đầu đã được pha 1 kiểm; các key sau chỉ dùng nếu còn chỗ
          rlRecord(model,key);
        }
      }
      // [Sched giai đoạn 2] Chờ slot (key, model) còn chỗ trong cửa sổ 60s (Flash 5, Lite 15). Chạm RPM thì CHỜ, không hạ model.
      // Thời gian chờ không tính vào timeout của lượt gọi (tạm dừng timer, gắn lại sau khi có chỗ).
      let schedTok=null;
      if(typeof Sched!=='undefined'&&Sched.enforcing()){
        if(rejectTimeout)clearTimeout(timer);
        try{schedTok=await Sched.acquire(key,model,purpose,ctl);}
        catch(err){
          lastErr=err.message||String(err);
          if(lastErr==='TIMEOUT')throw err;
          charmemQuotaCount(model,purpose,false,'CHAN_SCHED');
          continue; // quá MAX_WAIT_MS: thử key khác (có thể đang trống)
        }
        if(ctl.cancelled)throw new Error('TIMEOUT');
        if(rejectTimeout)armTimer();
      }
      try{
        // thinkMode='fast': các lượt gọi này đều là tác vụ NHẸ — luôn ép mức thinking thấp nhất
        // (xem callAPI/callDeepseekAPI trong translate.js).
        const r=await callAPI(key,model,messages,undefined,'fast',undefined,purpose,schedTok?Object.assign({},opts,{schedTok}):opts);
        charmemQuotaCount(model,purpose,true);
        delete _charSick[model];
        _charKeyCursor[model]=(ki+1)%n; // lượt sau bắt đầu từ key kế tiếp
        CHARMEM_STD_LAST_MODEL=model;   // chỉ để gắn nhãn model cho bộ đếm charmemStdReport (ước lượng)
        return r.text;
      }catch(err){
        lastErr=err.message||String(err);
        charmemQuotaCount(model,purpose,false,lastErr);
        if(gate&&lastErr.includes('429')&&lastErr.includes('QUOTA_PER_DAY'))rlDayBlock(model,key);
        if(_charErrStops(lastErr))throw err;
        if(/\b5\d\d\b/.test(lastErr)||/UNAVAILABLE|INTERNAL/.test(lastErr)){
          // Lỗi server = cả model đang quá tải; đổi key chỉ nhân số request lỗi lên. Dừng sớm → nơi gọi tự sang model dự phòng.
          n5xx++;
          if(n5xx>=max5xx){
            if(!((_charSick[model]||0)>Date.now()))console.warn('[Luồng 1] '+model+' lỗi server liên tiếp → coi là quá tải, dừng thử thêm key (nơi gọi sẽ sang model dự phòng)');
            _charSick[model]=Date.now()+CHARMEM_5XX_SICK_MS;
            throw err;
          }
          await new Promise(r=>setTimeout(r,1000));
          if(ctl.cancelled)throw new Error('TIMEOUT');
          continue;
        }
        if(lastErr.includes('429')&&!lastErr.includes('QUOTA_PER_DAY')){
          // 429 phút: chờ 15s rồi thử tiếp (key kế; hết key thì quay lại vòng đầu tối đa CHARMEM_429_MAX_ROUNDS lần)
          console.warn('[Luồng 1] 429 (phút) '+model+' → chờ '+Math.round(CHARMEM_429_WAIT_MS/1000)+'s rồi thử lại');
          await new Promise(r=>setTimeout(r,CHARMEM_429_WAIT_MS));
          if(ctl.cancelled)throw new Error('TIMEOUT');
          if(rejectTimeout)armTimer(); // chỉ Gemini có timeout; DeepSeek không
          if(j===seq.length-1&&rounds429<CHARMEM_429_MAX_ROUNDS){rounds429++;j=-1;}
        }
        continue; // 429/5xx/401/403/mạng → thử key khác
      }
    }
    throw new Error(lastErr||'Tất cả key đều lỗi hoặc không còn chỗ trống');
  }

  const firstKi=await pickFirstKey();
  // DeepSeek thường chậm hơn Gemini khá nhiều (30s không đủ) → KHÔNG áp timeout, giống bước dịch chính.
  if(model.startsWith('deepseek'))return runCalls(firstKi);
  const timeoutPromise=new Promise((_,rej)=>{rejectTimeout=rej;armTimer();});
  try{return await Promise.race([runCalls(firstKi),timeoutPromise]);}
  finally{clearTimeout(timer);}
}

// Dựng prompt trích xuất nhân vật cho lượt gọi model chính (xem analyzeChapterCharacters).
// ===== Bản CHUNG (đích ≠ vi) của prompt trích xuất nhân vật: tiếng Anh, cùng schema lưu trữ, bỏ phần xưng hô/Hán Việt =====
function _gEn(g){return g==='Nam'?'Male':(g==='Nữ'?'Female':'Unknown');}
function _charmemRelPromptListEn(){
  const order=[],m={};
  CHARMEM_REL_ITEMS.forEach(it=>{if(!m[it[1]]){m[it[1]]=[];order.push(it[1]);}m[it[1]].push('"'+it[3]+'"');});
  return order.map(k=>CHARMEM_REL_GROUP_LABELS[k].en+': '+m[k].join(', ')).join(' | ');
}
function _charmemAgePromptListEn(){
  return CHARMEM_AGE_BANDS.map(b=>'"'+b.en+'" ('+(b.max>=120?b.min+'+':b.min+'-'+b.max)+' years)').join(', ');
}
function buildCharExtractPromptGeneric(chapterText,refOut){
  const fill=x=>{try{return TargetLang.fill(x);}catch(e){return x;}};
  const stdEn=(kind,v)=>{try{return (!v||isUnknownVal(v))?'Unknown':charmemStdLabel(kind,v,'en');}catch(e){return v||'Unknown';}};
  const known=selectKnownCharsForPrompt(chapterText).map(c=>{
    if(refOut)refOut[c._ref]=c.id;
    const base={
      ref:c._ref,
      name:c.name,
      placeholderName:(c.namePlaceholder&&c.nameSource!=='user')?true:undefined,
      isProtagonist:isCharProtagonist(c)?true:undefined,
      aliases:promptAliasesOf(c),
      originalName:charOrigNameList(c).join(', ')||undefined,
      gender:_gEn(c.gender),
      relationship:stdEn('rel',c.relationship)
    };
    if(!c._charmemForced)return base;
    return {...base,
      note:c.note&&c.note.trim()?c.note.trim():undefined,
      statusCue:(c.statusCue&&!isUnknownVal(c.statusCue))?stdEn('age',c.statusCue):undefined};
  });
  const protagonist=S.characters.find(c=>isCharProtagonist(c));
  const protagonistLine=protagonist
    ?`The protagonist is already identified as "${protagonist.name}". Always use this person as the reference point for "relationship" of every other character, even if they barely appear in this excerpt.\n\n`
    :`No protagonist has been identified yet: infer one from the first-person narrator or the most central character of the excerpt, and use that person as the reference point for "relationship".\n\n`;
  const sys=fill(`You extract character data for a novel translation system. `+
    `Read the source-text excerpt below (language: {{SOURCE_LANG}}) and identify ALL characters who appear in it. The translation target language is {{TARGET_LANG}}.\n`+
    `The "known characters" list further below holds characters already recorded. If a character in the excerpt matches a known one (by name, originalName or any alias), reuse that exact "name". `+
    `Do NOT return an entry for a known character who is absent from the excerpt (the protagonist is the only exception when present).\n\n`)+
    protagonistLine+
    `REQUIREMENTS:\n`+
    `- Return ONLY JSON — no extra text, explanation or markdown fences.\n`+
    `- Format: {"characters":[{"ref":"c1"|"new","name":"...","isPlaceholderName":true|false,"isProtagonist":true|false,"originalName":"...","nicknames":["..."],"isHuman":true|false,"gender":"Male"|"Female"|"Unknown","genderEvidence":"direct"|"appearance"|"title"|"name"|"none","genderQuote":"...","relationship":"...","statusCue":"...","note":"..."}]}\n`+
    `- Fill EVERY field of EVERY entry.\n`+
    `- "ref": REQUIRED on every entry. Each known character has a "ref" code (c1, c2, ...). If the entry describes a known character, copy that exact code; if it is a person NOT in the known list, write "new". Identify people by CODE, not by name: sharing a surname, a name, a nickname, a title, a gender or a scene does NOT make two characters the same person. Two different people with the same name are two entries: the one not in the known list gets "new" (tell them apart by "originalName"). If unsure which known character an entry is, write "new" instead of guessing a code. Use each code for at most one entry.\n`+
    fill(`- "name": the name to store for this character, as it should appear in the {{TARGET_LANG}} translation (translate or transliterate it following the normal conventions of {{TARGET_LANG}}; a name already in Latin script, e.g. "John Carter", stays exactly as written). If the character is already in the known list, reuse the known "name" verbatim.\n`)+
    `- "originalName": the name exactly as written in the excerpt (source script); empty if identical to "name". It is used to recognize the same character in later chapters.\n`+
    `- "isPlaceholderName": true when the character has no real personal name yet (only a nickname, title, kinship term or descriptive label such as "the black-haired girl"); then "name" is a short descriptive label. false only for a real personal name. When unsure, true. `+
    `If a known character has "placeholderName":true and this excerpt reveals the real name, return the real name with "isPlaceholderName":false and mention the old label in "note"; if the real name is still not revealed, keep the old label unchanged (never invent a different label).\n`+
    `- "nicknames": array of fixed nicknames, aliases, or titles tied to exactly ONE person (written as in the source). Do NOT include generic kinship words or descriptions that could fit many people.\n`+
    `- "isHuman": false for animals, objects, systems, spirits without personhood; otherwise true.\n`+
    `- "gender": "Male", "Female" or "Unknown". "genderEvidence" is the strongest evidence used: "direct" (a gendered third-person pronoun in the narration about this character, or an explicit statement), "appearance" (gendered physical description/clothing), "title" (a gendered title or kinship word attached to this character), "name" (only a name that sounds male/female), or "none" (then gender is "Unknown"). `+
    `If the known list already gives a gender other than Unknown, keep it unless this excerpt gives direct, unmistakable evidence that it is wrong. Pronouns inside dialogue usually refer to other people — do not count them.\n`+
    `- "genderQuote": required when evidence is "direct", "appearance" or "title" and the known list has no gender yet: a short passage (about 4-30 characters/words) copied VERBATIM from the SOURCE excerpt, close to the character's name.\n`+
    `- "relationship": the relationship of THIS character TO THE PROTAGONIST (the role of this person relative to the protagonist, e.g. this person is the protagonist's father → "Father"). Choose EXACTLY ONE value from this list, copied verbatim: ${_charmemRelPromptListEn()}. Use "Unknown" if unclear, and for the protagonist themself. `+
    `Never write an occupation or job title here (put it in "note"), and never a relationship to a different side character.\n`+
    `- "statusCue": AGE GROUP only — choose EXACTLY ONE of: ${_charmemAgePromptListEn()}, or "Unknown". Do not write a number, rank or status.\n`+
    fill(`- "note": short comma-separated phrases in {{TARGET_LANG}}, at most ~30 words, covering ONLY appearance, identity/occupation/affiliation, and personality. No actions, dialogue, momentary emotions, plot events, ages or relationships. For a known character that already has a note, add only NEW information (otherwise ""). Do not guess or invent.\n`)+
    `- "isProtagonist": true ONLY for the reference protagonist described above; false for everyone else. At most one entry per response may be true.\n`+
    `- Each entry describes only its own character: never copy notes or relationships from another entry. Sharing a surname, gender or scene does NOT make two characters the same person.\n`+
    `- If the source calls the same character by two different names within this excerpt and you are certain, return ONE entry; if unsure, treat them as two characters.\n`+
    `- If no character is clearly present, return {"characters":[]}.\n\n`+
    `Known characters (reuse their exact "name"; for entries whose gender or relationship is already not "Unknown", just list them unchanged; for "Unknown" fields, try again to infer from this excerpt):\n`+
    (known.length?JSON.stringify(known):'(none yet)');
  return sys+`\n\n---\n`+chapterText+`\n\n---\nReturn the JSON exactly as specified above.`;
}
function buildCharExtractPrompt(chapterTextForAnalysis,promptGuidance,refOut){
  if(charmemGeneric())return buildCharExtractPromptGeneric(chapterTextForAnalysis,refOut);
  const _presetForKnown=getAddrPreset(promptGuidance);
  // Xưng hô ĐÃ LƯU (AI ghi, chưa được người dùng khoá) mà lệch thể loại thì không gửi lại làm "dữ liệu đã biết",
  // tránh model chép y nguyên. Chỉ ảnh hưởng prompt, không sửa dữ liệu nhân vật.
  const _knownAddr=(c,v)=>{if(!v||!_presetForKnown||c.addrSource==='user')return v;const f=AddrPresets.filterAddr(v,_presetForKnown);return f.dropped.length?(f.text||undefined):v;};
  const known=selectKnownCharsForPrompt(chapterTextForAnalysis).map(c=>{
    if(refOut)refOut[c._ref]=c.id;
    const base={
      ref:c._ref,   // mã nhận diện của lượt này: entry trả về PHẢI dùng mã này (hoặc "new"), xem quy tắc "ref" trong prompt
      name:c.name,
      // Cờ báo hiệu tường minh cho model: "name" ở trên VẪN CÒN SÓT chữ Hán/Trung Quốc chưa được dịch
      // (lỗi từ lượt phân tích trước — nhất là với TÊN NHÂN VẬT CHÍNH vì bị nêu cố định trong
      // protagonistLine bên dưới nên model có xu hướng chỉ copy lại y nguyên mà không soát lại xem đã
      // dịch hay chưa). Để field JSON riêng, dễ model nhận ra hơn là chỉ dựa vào câu chữ mô tả trong
      // prompt — xem hướng dẫn xử lý needsTranslation ngay dưới prompt này.
      needsTranslation:containsCJK(c.name)?true:undefined,
      // Cờ báo hiệu: "name" ở trên chỉ là NHÃN MÔ TẢ TẠM do chính model tự đặt ở lượt trước khi
      // nhân vật chưa lộ tên (VD "Nữ sinh tóc đen", "Tài xế xe buýt"), KHÔNG phải tên thật. Cùng cơ
      // chế với needsTranslation: đây là đúng 1 trong 2 trường hợp được phép PHÁ quy tắc "dùng lại y
      // nguyên name đã có" — xem hướng dẫn placeholderName ngay dưới prompt này và nhánh nâng cấp tên
      // trong mergeAnalysisResults. Không gửi cờ khi user đã tự sửa tên (nameSource==='user').
      placeholderName:(c.namePlaceholder&&c.nameSource!=='user')?true:undefined,
      // Trạng thái nhân vật chính hiện tại của record — để model thấy rõ mốc đã chốt và tiếp tục xác
      // nhận đúng người đó qua "isProtagonist" thay vì tự chọn lại theo từng chương.
      isProtagonist:isCharProtagonist(c)?true:undefined,
      aliases:promptAliasesOf(c),
      // Tên gốc đã lưu: để model phân biệt 2 người KHÁC tên gốc nhưng phiên âm ra cùng 1 tên (xem luật "TÊN GỐC KHÁC NHAU" bên dưới).
      originalName:charOrigNameList(c).join(', ')||undefined,
      gender:c.gender||'Chưa rõ',
      relationship:c.relationship||'Chưa rõ'
    };
    // Field note/xưng hô/statusCue/narrRef CHỈ thực sự hữu ích cho nhân vật thuộc nhóm "forced"
    // (đang thực sự xuất hiện/có mặt trong chương đang phân tích, hoặc còn sót chữ Hán) — vì cơ chế
    // correction/addrEvidence (xem hướng dẫn "correction" bên dưới) đòi hỏi CHÍNH chương này đưa ra
    // bằng chứng TRỰC TIẾP, mà điều đó gần như chỉ xảy ra được với nhân vật đã nằm trong "forced".
    // Với nhân vật thuộc "rest" (lấp đầy chỗ trống trong CHARMEM_KNOWN_LIMIT, không có mặt trong
    // chương này), gửi kèm các field này chỉ tốn token vì model không có căn cứ nào trong chương để
    // dùng tới — nên lược bỏ hết, kể cả "note".
    if(!c._charmemForced)return base;
    return {
      ...base,
      note:c.note&&c.note.trim()?c.note.trim():undefined,
      personas:knownPersonasForPrompt(S.characters,c),
      statusCue:c.statusCue&&c.statusCue.trim()?c.statusCue.trim():undefined,
      addrThemToMc:_knownAddr(c,c.addrThemToMc)||undefined,
      addrMcToThem:_knownAddr(c,c.addrMcToThem)||undefined,
      addrTone:c.addrTone&&c.addrTone!=='Chưa rõ'?c.addrTone:undefined,
      affinity:c.affinity&&!isUnknownVal(c.affinity)?c.affinity:undefined,
      narrRef:c.narrRef&&!isNarrRefUnknown(c.narrRef)?c.narrRef:undefined
    };
  });
  // Nêu rõ TÊN nhân vật chính ngay từ đầu prompt (thay vì chỉ để AI tự mò trong "known" JSON) —
  // tránh việc model (nhất là model rẻ/lite) suy luận nhầm "mốc" nhân vật chính riêng cho từng
  // chương, dẫn tới field "relationship" của người khác bị ghi sai lệch/không liên quan tới MC.
  // LƯU Ý: chính vì tên nhân vật chính được nêu "đóng đinh" ở đây, model rất dễ chỉ copy lại y
  // nguyên chuỗi này mà quên mất là nó cần được KIỂM TRA/DỊCH nếu vẫn còn sót chữ Hán — nên khi phát
  // hiện protagonist.name còn CJK, phải chèn thêm câu nhắc riêng ngay trong chính protagonistLine
  // (không chỉ dựa vào needsTranslation trong "known" JSON phía dưới, vì protagonistLine xuất hiện
  // TRƯỚC và có trọng số nhắc lệnh mạnh hơn trong mắt model).
  const protagonist=S.characters.find(c=>isCharProtagonist(c));
  const protagonistNeedsFix=protagonist&&containsCJK(protagonist.name);
  const protagonistLine=protagonist
    ?`NHÂN VẬT CHÍNH của truyện đã được xác định là: "${protagonist.name}". BẮT BUỘC dùng CHÍNH XÁC người này làm mốc khi xác định "relationship" cho TẤT CẢ nhân vật khác bên dưới — không tự suy luận người khác làm nhân vật chính, kể cả khi người này không xuất hiện nhiều trong chương đang đọc.`+
      (protagonistNeedsFix
        ?` ⚠ LƯU Ý QUAN TRỌNG: cái tên "${protagonist.name}" nêu trên VẪN CÒN SÓT chữ Hán/Trung Quốc chưa được dịch (lỗi từ lượt phân tích trước) — việc dùng nó làm MỐC để tính "relationship" không có nghĩa là được phép giữ nguyên chữ Hán khi trả về entry "characters" của chính nhân vật này; BẮT BUỘC dịch tên này sang Hán Việt (hoặc phục hồi tên phương Tây nếu đúng là tên âm dịch, xem quy tắc "name" bên dưới) ngay trong lượt trích xuất này, và dùng tên ĐÃ DỊCH cho field "name" của nhân vật chính trong kết quả trả về.`
        :'')+
      `\n\n`
    :`Chưa xác định được nhân vật chính cụ thể — tự suy luận dựa vào người kể chuyện ngôi thứ nhất ("ta","tôi") hoặc nhân vật trung tâm/xuất hiện nhiều nhất của chương, rồi dùng người đó làm mốc khi xác định "relationship" cho nhân vật khác.\n\n`;
  // Chỉ dẫn xưng hô/thể loại/tên riêng đã "chưng cất" từ prompt dịch chính của người dùng (xem
  // getMainPromptGuidance) — cho phép bước trích xuất này bám sát ý người dùng thay vì chỉ dựa quy
  // tắc chung chung cho mọi thể loại truyện. Đặt SAU protagonistLine (mốc nhân vật chính) nhưng
  // TRƯỚC danh sách nhân vật đã biết, và nói rõ thứ tự ưu tiên khi có mâu thuẫn với quy tắc bắt buộc
  // bên dưới (VD định dạng "Chưa rõ", cách xác định relationship theo nhân vật chính...).
  const guidanceSection=promptGuidance
    ?`CHỈ DẪN THÊM từ prompt dịch chính của người dùng (đã lọc lại, chỉ giữ phần liên quan xưng hô/thể loại/tên riêng) — dùng để hiểu đúng bối cảnh/thể loại truyện và các quy ước riêng, nhưng khi mâu thuẫn với các QUY TẮC BẮT BUỘC liệt kê bên dưới (định dạng field, cách xác định relationship theo nhân vật chính...) thì QUY TẮC BẮT BUỘC luôn được ưu tiên hơn:\n${promptGuidance}\n\n`
    :'';
  // Xác định HỆ xưng hô (cổ trang/tu tiên hay hiện đại/đô thị) từ promptGuidance đã chưng cất ở trên
  // — dùng để chọn ĐÚNG 1 ví dụ "đường nền" (xem ⚠ BẮT BUỘC bên dưới) thay vì đưa cả 2 hệ ngang hàng
  // như trước đây (nguồn gây lỗi model tự "câu" nhầm xưng hô hiện đại vào truyện huyền huyễn/tu tiên).
  const addrGenreSystem=detectAddrGenreSystem(promptGuidance);
  const neutralAddrExamples=addrToneExamplesForSystem('Trung tính',addrGenreSystem);
  const neutralAddrExampleForGuess=(addrGenreSystem&&neutralAddrExamples.length)
    ?(()=>{const{self,other}=parseAddrChoice(neutralAddrExamples[0]);return{self,callsMc:other};})()
    :null;
  const addrPreset=getAddrPreset(promptGuidance);
  const presetSection=addrPreset?AddrPresets.blockForExtract(addrPreset):'';
  // Quy tắc "giữ Hán-Việt ước lệ (哥哥→ca ca)" bên dưới là NGUỒN GỐC lỗi "huynh muội" trong truyện phương Tây/hiện đại
  // (áp dụng vô điều kiện cho mọi thể loại) -> chỉ còn hiệu lực với hệ cổ trang hoặc chưa xác định thể loại.
  const hanVietOverride=(addrGenreSystem==='tay_au'||addrGenreSystem==='hien_dai')
    ?`⚠ NGOẠI LỆ THEO THỂ LOẠI (ưu tiên hơn quy tắc Hán-Việt ngay sau đây): truyện này thuộc hệ ${addrGenreSystem==='tay_au'?'phương Tây/fantasy':'hiện đại/đô thị'}, nên KHÔNG giữ phiên âm Hán Việt kiểu Trung Quốc — DỊCH NGHĨA (哥哥/大哥→"anh"/"anh trai", 姐姐→"chị"/"chị gái", 妹妹/弟弟→"em"...) và chọn từ trong bộ xưng hô thường gặp nêu ở đầu prompt; quy tắc Hán-Việt bên dưới CHỈ áp dụng cho truyện cổ trang/tu tiên. `
    :'';
  const sys=`Bạn là công cụ trích xuất dữ liệu nhân vật cho một hệ thống dịch truyện. `+
    `Đọc đoạn văn bản gốc (có thể là tiếng Trung, tiếng Anh, hoặc ngôn ngữ khác) bên dưới và xác định TẤT CẢ nhân vật xuất hiện. `+
    `Danh sách "đã biết" bên dưới gồm nhân vật có mặt trong chương này, cộng thêm nhân vật chính và nhân vật mang cờ "needsTranslation" dù có thể vắng mặt. Với nhân vật chỉ nằm trong danh sách vì vắng mặt (không xuất hiện trong đoạn văn bản), KHÔNG trả entry cho người đó — trừ trường hợp "needsTranslation" nêu ngay dưới.\n`+
    `NGOÀI những nhân vật thực sự xuất hiện trong đoạn văn bản đang đọc, nếu danh sách "đã biết" bên dưới có BẤT KỲ nhân vật nào mang cờ "needsTranslation":true, `+
    `BẮT BUỘC vẫn phải trả thêm 1 entry riêng cho đúng nhân vật đó trong "characters" — CHO DÙ người này KHÔNG xuất hiện trong đoạn văn bản của chương đang đọc — chỉ với MỘT mục đích DUY NHẤT là dịch lại "name" đang sót chữ Hán sang Hán Việt (hoặc phục hồi tên phương Tây gốc nếu đúng là tên âm dịch, xem quy tắc "name" bên dưới). `+
    `Với riêng entry này: "originalName" PHẢI điền lại ĐÚNG NGUYÊN VĂN chữ Hán đang lưu ở "name" của nhân vật đó trong danh sách "đã biết" (lấy từ chính danh sách đó, KHÔNG cần và KHÔNG thể tìm thấy trong đoạn văn bản đang đọc vì người này không xuất hiện ở đây) — bắt buộc phải điền đúng như vậy để hệ thống ghép lại đúng vào record cũ; mọi field khác (gender/relationship/addrThemToMc/addrMcToThem/narrRef/statusCue/note/isProtagonist) của entry này PHẢI giữ NGUYÊN VĂN giá trị đã có sẵn trong danh sách "đã biết", không suy luận/không đổi, và không đặt bất kỳ "correction" nào cho các field đó.\n\n`+
    protagonistLine+guidanceSection+presetSection+
    `YÊU CẦU BẮT BUỘC:\n`+
    `- Chỉ trả về JSON, không thêm bất kỳ văn bản, giải thích hay markdown fence nào khác.\n`+
    `- Định dạng: {"characters":[{"ref":"c1"|"new","name":"...","isPlaceholderName":true|false,"isProtagonist":true|false,"originalName":"...","sinoAlias":"...","nicknames":["..."],"isHuman":true|false,"gender":"Nam"|"Nữ"|"Chưa rõ","genderEvidence":"trực tiếp"|"ngoại hình"|"danh xưng"|"tên"|"không có","genderQuote":"...","relationship":"...","addrThemToMc":[{"self":"...","callsMc":"..."}],"addrMcToThem":[{"self":"...","callsThem":"..."}],"addrEvidence":"trực tiếp"|"suy đoán"|"không có hội thoại","addrQuote":"...","addrTone":"...","affinity":"...","narrRef":"...","statusCue":"...","note":"...","kin":null|{"role":"...","of":"..."},"bodyOf":""|"MC","correction":{"gender":true|false,"relationship":true|false,"addressing":true|false,"narrRef":true|false,"affinity":true|false,"reason":"..."}}],"merges":[{"keep":"...","duplicates":["..."],"evidence":"trực tiếp"|"suy đoán","quote":"...","reason":"..."}],"realNameReveals":[{"placeholder":"...","realName":"...","originalName":"...","evidence":"trực tiếp"|"suy đoán"}],"relations":[{"a":"...","b":"...","type":"...","roleOfA":"a"|"b","evidence":"trực tiếp","quote":"...","aToB":"","bToA":""}],"personas":[{"who":"...","alias":"...","gender":"Nam"|"Nữ"|"","action":"active"|"ended","knownBy":["..."],"evidence":"trực tiếp","quote":"..."}]}\n`+
    `- "ref": BẮT BUỘC ở MỌI entry. Mỗi nhân vật trong danh sách "đã biết" có 1 mã "ref" (c1, c2...). Entry mô tả đúng nhân vật đã biết nào thì chép ĐÚNG mã đó (vd "c3"); người CHƯA có trong danh sách thì ghi "new". Nhận diện người theo MÃ, KHÔNG theo tên: chỉ trùng họ, trùng tên/biệt danh/chức danh, cùng giới hay cùng cảnh KHÔNG đủ để coi là cùng một người. Hai người khác nhau mà trùng tên (kể cả cùng giới) là 2 entry riêng: người chưa có trong danh sách ghi "new" (phân biệt bằng "originalName"). Không chắc entry là ai trong danh sách thì ghi "new" chứ KHÔNG đoán mã. Mỗi mã chỉ dùng cho tối đa 1 entry.\n`+
    `- ĐIỀN ĐẦY ĐỦ MỌI TRƯỜNG ở MỌI entry, không bỏ sót trường nào: "name" (tên nhân vật đã dịch), "originalName" (tên gốc), "nicknames" (tên khác), "statusCue" (độ tuổi: CHỈ 1 nhóm tuổi chuẩn, không ghi số — xem quy tắc "statusCue" bên dưới), "relationship" (mối quan hệ với nhân vật chính: CHỈ 1 giá trị trong danh sách chuẩn — xem quy tắc "relationship" bên dưới), "addrThemToMc" (xưng hô họ → nhân vật chính), "addrMcToThem" (xưng hô nhân vật chính → họ), "narrRef" (cách gọi ngôi thứ 3), "note" (ghi chú: chỉ hình dáng, thân phận, tính cách). Trường nào chưa có căn cứ trực tiếp trong chương thì SUY LUẬN từ dữ liệu của chính nhân vật đó (quan hệ, độ tuổi, giới tính, thể loại truyện) thay vì để trống. Chỉ được để "" ở "originalName"/"sinoAlias"/"nicknames" khi THỰC SỰ không có (riêng "nicknames": xưng hô kiểu 大哥/đại tỷ KHÔNG phải biệt danh, không có biệt danh đúng nghĩa thì để mảng rỗng, đừng cố điền cho đủ), và chỉ dùng "Chưa rõ" cho "relationship" khi hoàn toàn không có căn cứ (đoán sai còn tệ hơn chưa rõ); riêng "gender" của nhân vật LÀ NGƯỜI thì LUÔN điền Nam/Nữ theo thang độ chắc chắn (xem quy tắc "gender"), "Chưa rõ" chỉ dành cho nhân vật không phải người (isHuman=false).\n`+
    `- ALIAS/TÊN KHÁC: chỉ ghi chuỗi định danh ĐƯỢC ĐÚNG MỘT người (biệt danh, ngoại hiệu, tên gọi tắt cố định, hoặc chức danh/thân phận gắn kèm họ/tên). KHÔNG đưa vào "nicknames" (và không dùng làm tên gọi khác) bất kỳ cách gọi nào chỉ là xưng hô theo vai vế/thứ bậc/tuổi/quan hệ, hay chỉ là từ mô tả chung dùng được cho nhiều người (VD chỉ nêu tuổi, giới, nghề, thứ tự trong môn phái/gia đình) — những thông tin đó thuộc về "relationship"/"note"/xưng hô, không phải tên.\n`+
    `- "name": tên nhân vật dùng để LƯU VÀO BỘ NHỚ (không phải để thay thế bản dịch chính văn), quy tắc tuỳ theo chữ viết của văn bản gốc: `+
    `NẾU văn bản gốc dùng CHỮ HÁN/TRUNG QUỐC: "name" BẮT BUỘC đã được phiên âm sang Hán Việt, TUYỆT ĐỐI CẤM còn sót bất kỳ ký tự chữ Hán/Trung Quốc nào. `+
    `Ví dụ chuyển đổi đúng (chữ Hán gốc → "name" phải ghi): 齐麟→"Tề Lân", 王韵之→"Vương Vận Chi", 老黄→"Lão Hoàng", 汤音璇→"Thang Âm Tuyền". `+
    `NGOẠI LỆ QUAN TRỌNG cho tên phiên âm gốc phương Tây: nếu tên chữ Hán đó THỰC CHẤT là do tác giả DÙNG CHỮ HÁN ĐỂ PHIÊN ÂM (âm dịch/音译) một tên người phương Tây/tiếng Anh — thường gặp ở nhân vật ngoại quốc, bối cảnh đô thị/xuyên không/dị giới hiện đại có yếu tố nước ngoài — thì PHẢI dùng lại tên phương Tây gốc (cách viết tiếng Anh/Latin thông dụng, đúng chính tả) làm "name", KHÔNG dùng Hán Việt cho trường hợp này. `+
    `Ví dụ: 莱恩 (âm dịch từ "Ryan") → "name":"Ryan"; 约翰 (âm dịch từ "John") → "name":"John"; 迈克尔 (âm dịch từ "Michael") → "name":"Michael"; 艾米丽 (âm dịch từ "Emily") → "name":"Emily". `+
    `Chỉ áp dụng ngoại lệ này khi CHẮC CHẮN đây là âm dịch từ tên phương Tây (âm tiết phiên âm nghe rõ như phiên âm ngoại quốc, nhân vật có bối cảnh/quốc tịch/gốc gác phương Tây trong truyện) — nếu là tên người Hoa/Việt/Á Đông bản địa bình thường thì vẫn áp dụng quy tắc Hán Việt như trên, TUYỆT ĐỐI KHÔNG suy diễn bừa chỉ vì âm nghe lạ. `+
    `Khi áp dụng ngoại lệ này, BẮT BUỘC đồng thời điền field "sinoAlias" bằng đúng cách phiên âm Hán Việt của chữ Hán đó (VD 莱恩→"Lai Ân", 约翰→"Ước Hàn") để hệ thống lưu lại làm tên phụ, phòng khi bản dịch trước đây hoặc chương khác từng dùng cách viết Hán Việt này. Nếu KHÔNG rơi vào ngoại lệ này (tên bản địa bình thường, hoặc văn bản gốc không phải chữ Hán), để "sinoAlias":"". `+
    `NẾU văn bản gốc KHÔNG phải chữ Hán (VD tiếng Anh, chữ Latin, hay ngôn ngữ khác): GIỮ NGUYÊN "name" y hệt cách viết trong văn bản gốc (VD "John Carter"→"John Carter", "Dr. Ellen Ripley"→"Dr. Ellen Ripley") — TUYỆT ĐỐI KHÔNG tự ý phiên âm, Việt hoá, hay đổi cách viết tên, vì đây chỉ là dữ liệu để đối chiếu/ghi nhớ nhân vật, không phải bản dịch. `+
    `Nếu nhân vật này đã có sẵn trong danh sách "đã biết" ở trên (khớp qua tên chính hoặc alias), PHẢI dùng lại NGUYÊN VĂN "name" đã có sẵn đó — không tự đổi sang cách viết khác dù thấy "hay hơn"; chỉ áp dụng quy tắc trên cho nhân vật CHƯA có trong danh sách. `+
    `TRỪ 2 NGOẠI LỆ: (a) nếu "name" đã có sẵn đó trong danh sách "đã biết" là văn bản gốc chữ Hán nhưng vẫn còn sót lại ký tự chữ Hán/Trung Quốc chưa phiên âm (do lần trước bỏ sót), thì lần này BẮT BUỘC phải dịch tên đó sang Hán Việt ngay; `+
    `(b) nếu nhân vật đó có cờ "placeholderName":true trong danh sách "đã biết" — nghĩa là tên đang lưu chỉ là NHÃN MÔ TẢ TẠM do chính bạn tự đặt ở chương trước khi chưa biết tên thật — mà chương này LỘ RA tên gọi thật của người đó, thì BẮT BUỘC trả về tên thật đó ở field "name" (xem hướng dẫn "placeholderName" ở phần danh sách đã biết bên dưới).\n`+
    `- QUY TẮC TÊN GỐC vs BIỆT DANH (quyết định "isPlaceholderName"): TÊN GỐC chỉ là HỌ TÊN ĐẦY ĐỦ hoặc TÊN RIÊNG THẬT của nhân vật (VD 陈明勇, 林墨, John Carter). Mọi cách gọi khác — biệt danh/ngoại hiệu (黄毛, 胖子), họ kèm tiền tố (老王, 小李), chức danh, quan hệ, ngoại hình — đều là BIỆT DANH, KHÔNG phải tên gốc. Không chắc đó có phải tên thật không thì coi là BIỆT DANH.\n`+
    `- Nhân vật CHƯA có tên gốc trong văn bản (chỉ có biệt danh, hoặc chỉ được nhắc qua chức danh/quan hệ/ngoại hình) đặt "isPlaceholderName":true và chọn "name" như sau: nếu có cách gọi cố định dùng như một cái tên (黄毛, 老王, 小李, 胖子) thì phiên âm Hán Việt chính cách gọi đó (黄毛→"Hoàng Mao", 老王→"Lão Vương", 小李→"Tiểu Lý", 胖子→"Bàn Tử"), TUYỆT ĐỐI KHÔNG dịch NGHĨA thành câu mô tả (CẤM 黄毛→"Thanh niên tóc vàng", CẤM 胖子→"Gã mập"); nếu không có cách gọi cố định nào thì đặt 1 nhãn ngắn bằng tiếng Việt (VD "Cha của Thẩm Quan", "Quản gia phủ họ Lâm", "Nữ sinh tóc đen"). Các cách gọi khác của cùng người này đưa vào "nicknames". Khi chương sau lộ tên gốc, hệ thống tự chuyển biệt danh xuống "tên khác" — nên chưa lộ thì GIỮ NGUYÊN "name" cũ, đừng đổi sang nhãn khác.\n`+
    `Nếu "name" tự đặt kiểu nhãn này có nhắc tới TÊN của nhân vật khác, BẮT BUỘC dùng đúng "name" ĐÃ ĐƯỢC DỊCH (Hán Việt hoặc tên phương Tây theo quy tắc trên) của người đó, TUYỆT ĐỐI KHÔNG chèn nguyên chữ Hán/Trung Quốc của người đó vào identifier này dù chỉ 1 phần — quy tắc "TUYỆT ĐỐI CẤM còn sót chữ Hán" ở trên áp dụng cho CẢ loại "name" tự đặt kiểu này.\n`+
    `- "isPlaceholderName": BẮT BUỘC có ở MỌI entry. true khi nhân vật CHƯA có tên gốc ("name" chỉ là biệt danh hoặc nhãn, theo quy tắc ngay trên); false CHỈ khi "name" là họ tên đầy đủ/tên riêng thật. Phân vân thì chọn true.\n`+
    `- "originalName": chữ/cách viết gốc của nhân vật đó xuất hiện trong đoạn văn bản đang đọc (chữ Hán nếu gốc là tiếng Trung; để trống nếu văn bản gốc không phải chữ Hán và trùng với "name"), dùng để đối chiếu nhận diện nhân vật ở các chương sau. ⚠ Với văn bản gốc là chữ Hán thì BẮT BUỘC điền ở MỌI entry có tên định danh bằng chữ Hán xuất hiện trong chương này (kể cả nhân vật đã có trong danh sách "đã biết": chép lại đúng chữ gốc thấy trong chương, hoặc đúng "originalName" đã lưu nếu chương có nhắc) — KHÔNG được bỏ trống chỉ vì đã có "name" phiên âm Hán Việt; chỉ để "" khi tên đó THỰC SỰ không xuất hiện bằng chữ Hán trong chương này (không bịa, hệ thống sẽ đối chiếu nguyên văn và bỏ giá trị không có trong chương). Với "isPlaceholderName":false: CHỈ điền chữ gốc của TÊN GỐC (họ tên/tên riêng thật); tên gọi tắt/thân mật, danh xưng, chức danh KHÔNG điền vào đây. Với "isPlaceholderName":true: điền chính cách gọi gốc mà văn bản dùng cho người đó (VD 黄毛) để nhận ra họ ở chương sau (hệ thống không dùng nó để thay cứng); chức danh dùng chung cho nhiều người (VD 管家, 掌柜) thì để "".\n`+
    `- "nicknames" (hiển thị ở ô "Tên gọi khác"): mảng các cách gọi mà văn bản dùng để chỉ ĐÚNG MỘT nhân vật này (viết như trong văn bản gốc), nhưng KHÔNG phải tên định danh chính thức. CHỈ nhận 3 loại: (1) biệt danh/ngoại hiệu/tên gọi tắt cố định (黄毛, 胖子, 老王, 小李); (2) danh xưng chức vị/thân phận gắn với đúng một người nhờ có kèm họ/tên/tổ chức/nơi chốn (冲云道长, 王掌柜, 陈博士, 青云宗宗主); (3) cụm miêu tả ngoại hình/đặc điểm nhận dạng dùng riêng để gọi người đó (独眼龙, 刀疤脸, 黄毛青年). TUYỆT ĐỐI KHÔNG đưa vào: (a) XƯNG HÔ theo vai vế/thứ bậc/tuổi tác mà người này gọi người kia hoặc nhiều người cùng được gọi như vậy (大哥, 二哥, 大姐, 老大, 哥哥, 姐姐, 师兄, 少爷, 老爷子, 前辈, 兄弟; Việt: đại ca, nhị ca, đại tỷ, sư huynh, huynh trưởng, tiền bối...); (b) chức danh/quan hệ/nghề đứng một mình không kèm gì để chỉ đúng một người (掌柜, 师父, 老板, 道长, anh trai, cha, mẹ); (c) đại từ. Phép thử: nếu 1 người thứ hai trong truyện cũng có thể bị gọi đúng y như vậy thì đó là xưng hô, KHÔNG đưa vào "nicknames". Quan hệ/vai vế (VD "anh cả của Trụ Tử") ghi ở "relationship"/"note", còn cách người khác xưng hô với họ ghi ở "addrThemToMc"/"addrMcToThem". Không có cách gọi nào đúng 3 loại trên thì để mảng rỗng.\n`+
    `- "note": ghi chú về nhân vật, CHỈ gồm 3 loại thông tin: (1) HÌNH DÁNG (ngoại hình, vóc dáng, đặc điểm nhận dạng nhìn thấy được), (2) THÂN PHẬN (xuất thân, nghề nghiệp, chức danh, môn phái, địa vị cố định, tên thật nếu đã lộ), (3) TÍNH CÁCH (tính tình, thói quen nổi bật). `+
    `Viết dạng cụm từ ngắn, cách nhau bằng dấu phẩy, tối đa ~30 từ (VD: "tóc bạc, sẹo dài bên má trái, trưởng lão phái Thanh Vân, tính tình nóng nảy"). TUYỆT ĐỐI KHÔNG ghi gì khác: không hành động, lời thoại, cảm xúc nhất thời, diễn biến tình tiết; không ghi tuổi (đã có "statusCue"); không ghi quan hệ với nhân vật khác (đã có "relationship"); không ghi cách xưng hô. Đây KHÔNG phải nhật ký tóm tắt chương. `+
    `⚠ NGÔN NGỮ: viết "note" hoàn toàn bằng TIẾNG VIỆT (tên người/địa danh/môn phái phiên âm Hán Việt) dù văn bản gốc là chữ Hán — KHÔNG chép nguyên câu/cụm chữ Hán vào "note"; chỉ được kèm chữ Hán trong ngoặc cho đúng tên riêng cần đối chiếu (VD "tên thật là Lâm Mộ (林慕)"). `+
    `Nhân vật CHƯA có "note" trong danh sách "đã biết": BẮT BUỘC ghi ít nhất 1 đặc điểm hợp lệ suy ra được từ chương (hình dáng / thân phận / tính cách thể hiện qua lời nói, hành vi). Nhân vật ĐÃ có "note": chỉ ghi phần MỚI chưa có trong "note" cũ (không chép lại cái đã có), không có gì mới thì để "". Không suy đoán, không bịa.\n`+
    `- QUY TẮC GỘP / CẬP NHẬT NHÂN VẬT (áp dụng cho "note", "relationship" và "merges"):\n`+
    `  (1) Mỗi entry CHỈ mô tả chính nhân vật của entry đó. TUYỆT ĐỐI KHÔNG chép/mượn "note", "relationship" hay chi tiết của entry KHÁC trong danh sách "đã biết" sang entry này, kể cả khi 2 nhân vật cùng họ, cùng giới tính, cùng xuất hiện trong một cảnh hoặc cùng chung một vai vế.\n`+
    `  (2) Chỉ coi 2 nhân vật là CÙNG MỘT NGƯỜI (đặt vào "merges") khi văn bản nói TRỰC TIẾP như vậy (VD "Hứa Đình, tức mẫu thân của Đinh Vũ", "X chính là Y"). Cùng họ, cùng giới tính, cùng vai vế hoặc xuất hiện gần nhau KHÔNG phải bằng chứng để coi là cùng một người.\n`+
    `  (3) Nhân vật mang biệt danh/danh xưng chung (Mẫu thân, Sư phụ, Trần Bác Sĩ...) mà đã có record riêng trong danh sách "đã biết" thì GIỮ NGUYÊN record đó; KHÔNG chép ghi chú của nó sang record của nhân vật có tên riêng, trừ khi truyện nêu rõ họ là cùng một người.\n`+
    `  (4) "relationship" và quan hệ gia đình (mẹ/cha/con/anh/chị/em của ai) ĐƯỢC suy ra từ cách xưng hô/danh xưng giữa chính nhân vật này với người kia (VD nhân vật tự xưng "nương" và gọi nhân vật chính là "nhi tử", hoặc nhân vật chính gọi họ là "mẫu thân"), miễn là lời thoại/xưng hô đó nói THẲNG giữa 2 người và phản ánh quan hệ CỦA CHÍNH nhân vật này (xem thêm ngoại lệ "xưng hô THAY" ở trên). KHÔNG suy quan hệ gia đình chỉ vì: cùng họ, cùng giới tính, đứng gần/cùng cảnh với người khác, hoặc chỉ có đại từ ngôi 3 ("nàng", "bà" chỉ cho biết giới tính, không cho biết quan hệ), hoặc vì một nhân vật KHÁC trong danh sách "đã biết" có quan hệ đó. Không có căn cứ rõ thì để "Chưa rõ" (relationship) hoặc bỏ qua (note).\n`+
    `  (5) Khi "note" cũ đã có ý tương tự, đừng ghi lại bằng cách diễn đạt khác (VD đã có "mẫu thân của nhân vật chính" thì không thêm "mẹ của nhân vật chính"). Không thêm quan hệ gia đình vào "note" nếu chương hiện tại không nhắc tới.\n`+
    `- "relationship": quan hệ của CHÍNH nhân vật này VỚI nhân vật chính (nhãn là vai của NGƯỜI NÀY so với MC: người này là cha của MC → "Cha", là mẹ → "Mẹ"; là học trò của MC → "Học trò"). CHỈ được chọn ĐÚNG 1 giá trị trong danh sách chuẩn sau, chép NGUYÊN VĂN, không tự đặt nhãn mới, không ghép nhiều giá trị — ${charmemRelPromptList()}. `+
    `Danh sách này phục vụ xưng hô khi dịch nên chỉ phân loại theo VAI VẾ (trên/ngang/dưới) và mức THÂN SƠ, KHÔNG ghi chức vụ/danh hiệu/nghề (lão tổ, trưởng lão, bang chủ, giám đốc, thầy thuốc... → quy về nhóm vai vế tương ứng như "Tiền bối", "Cấp trên"...; chức vụ ghi ở "note"). Chọn giá trị GẦN NHẤT về vai vế và thân sơ; không có căn cứ thì "Chưa rõ" (đoán sai còn tệ hơn chưa rõ). `+
    `Phân biệt: nhóm Gia đình chia theo GIỚI TÍNH vì xưng hô khác nhau (Cha/Mẹ, Ông/Bà, Anh/Chị, Vợ/Chồng, Đàn anh/Đàn chị) — chọn đúng giới tính của CHÍNH người này; "Em" dùng cho em trai/em gái (kể cả em họ, em rể, em dâu...); anh/chị/em họ và anh rể/chị dâu... chọn Anh/Chị/Em theo tuổi so với MC, không cần phân biệt ruột hay nuôi; "Cháu" dùng cho cháu nội/ngoại, cháu gọi MC bằng cô/dì/chú/bác...; "Bác"/"Chú"/"Cô"/"Dì"/"Cậu"/"Mợ" dùng đúng vai họ hàng bậc trên: bác (anh/chị của cha mẹ), chú (em trai của cha), cô (chị/em gái của cha), dì (chị/em gái của mẹ), cậu (anh/em trai của mẹ), mợ (vợ của cậu) — chọn theo cách nhân vật được gọi và gọi MC, KHÔNG gộp vào "Tiền bối"; bố/mẹ vợ, bố/mẹ chồng → "Cha"/"Mẹ"; "Tiền bối" là bậc trên NGOÀI gia đình (không phải họ hàng); "Đàn anh"/"Đàn chị" và "Đàn em" là người cùng môn phái/lớp/tổ chức nhưng lớn/nhỏ hơn MC (sư huynh, sư tỷ, sư đệ, sư muội); người ngang vai ngang lứa, đồng môn, đồng đội, bạn học → "Bạn bè" (mức thân/sơ do trường "affinity" biểu đạt, KHÔNG tạo nhãn riêng như "bạn thân"); đồng nghiệp, hàng xóm, đối tác → "Người quen"; "Chủ nhân" và "Người hầu" là quan hệ chủ - tớ, còn "Cấp trên" và "Cấp dưới" là quan hệ thứ bậc/quyền lực (kể cả vua - bề tôi).\n`+
    `- "statusCue": ĐỘ TUỔI của nhân vật — CHỈ ghi tuổi, TUYỆT ĐỐI KHÔNG ghi vai vế, địa vị, chức vụ, thân phận, cảnh giới tu luyện (những thứ đó thuộc "note" hoặc "relationship"). `+
    `CHỈ được chọn ĐÚNG 1 nhóm tuổi chuẩn, chép NGUYÊN VĂN tên nhóm, KHÔNG ghi số tuổi cụ thể: ${charmemAgePromptList()}. Văn bản nêu rõ số tuổi thì tự quy số đó vào đúng nhóm theo khoảng trong ngoặc (VD 17 tuổi → "Thiếu niên lớn"); nếu tuổi thật vượt xa vẻ ngoài kiểu tu tiên/trường sinh thì chọn nhóm theo vẻ ngoài và cách người khác đối xử. Không dùng từ nào khác (học sinh cấp 3, thiếu nữ, lão nhân... đều phải quy về nhóm chuẩn). `+
    `Văn bản không nêu thẳng thì SUY LUẬN từ ngoại hình, nghề nghiệp, quan hệ, cách người khác gọi (VD "lão", "tiểu nha đầu"...) — luôn điền, không để trống, không lặp lại nội dung của "note".\n`+
    `- "correction": CHỈ dùng khi trong danh sách "đã biết" ở trên, nhân vật này ĐÃ CÓ SẴN giá trị gender/relationship/addrThemToMc/addrMcToThem (khác "Chưa rõ"), `+
    `NHƯNG nội dung chương này đưa ra bằng chứng TRỰC TIẾP, RÕ RÀNG, KHÔNG THỂ HIỂU KHÁC rằng giá trị cũ đó SAI và cần sửa lại `+
    `(VD: nhân vật trước đó bị coi là nam nhưng chương này lộ rõ là nữ giả trai/cải trang; trước đó tưởng là "kẻ thù" nhưng chương này xác nhận trực tiếp là "huynh đệ thất lạc"). `+
    `LƯU Ý QUAN TRỌNG: khi nhân vật này TRỰC TIẾP gọi nhân vật chính (hoặc TỰ XƯNG) bằng một DANH XƯNG TỰ THÂN NÓ ĐÃ HÀM Ý RÕ MỘT LOẠI QUAN HỆ CỤ THỂ trong lời thoại — bất kể thể loại/văn phong nào, `+
    `cổ trang/tu tiên (VD "sư phụ", "lão sư", "nghĩa phụ", "phu quân", "chủ nhân", "thiếu chủ") hay đô thị/hiện đại/công sở (VD "sếp", "giám đốc" khi gọi cấp trên trực tiếp, "chồng"/"vợ", "má nuôi"/"ba nuôi", "thầy"/"cô" khi là giáo viên trực tiếp dạy nhân vật chính, "khách hàng" khi là quan hệ mua-bán trực tiếp) — `+
    `mà "relationship" đã lưu đang là giá trị KHÁC hẳn hoặc mơ hồ hơn (VD "Người qua đường", "Chưa rõ", "Kẻ thù", "Đồng nghiệp"), đây CŨNG được tính là bằng chứng trực tiếp đủ ngưỡng để sửa, giống hệt ví dụ gender/relationship ở trên — không chỉ dừng ở việc cập nhật addrThemToMc/addrMcToThem. `+
    `Ngược lại, những từ xưng hô chỉ mang sắc thái THÂN MẬT/XA CÁCH chung chung mà KHÔNG tự nó chỉ rõ một loại quan hệ cụ thể (VD "ngươi/ta" chuyển sang gọi thẳng tên, "anh/em" phiếm chỉ) thì CHỈ tính là thay đổi addressing, KHÔNG được suy ra thành correction cho relationship. `+
    `NGOẠI LỆ CẦN CẢNH GIÁC — "xưng hô THAY": tiếng Việt/văn hoá Á Đông có thói quen một người lớn gọi ai đó theo ĐÚNG VAI VẾ của con/em/cháu mình để giữ phép lịch sự trong gia đình, dù bản thân người nói KHÔNG có quan hệ đó (VD người mẹ gọi giáo viên của con là "thầy"/"cô" dù bản thân không phải học trò; người anh gọi sư phụ của em trai là "lão sư" theo đúng vai của em). Nếu văn bản chương này cho thấy danh xưng đó là gọi THAY cho quan hệ của một nhân vật khác (con/em/cháu...) chứ không phải quan hệ của chính người đang nói, TUYỆT ĐỐI KHÔNG suy ra correction cho relationship của người nói — trường hợp này vẫn có thể cộng dồn vào addrThemToMc/addrMcToThem như bình thường (vì họ thực sự có gọi câu đó), nhưng để relationship() giữ nguyên giá trị cũ. Chỉ áp dụng correction cho relationship khi có căn cứ rằng danh xưng đó phản ánh đúng quan hệ CỦA CHÍNH người đang nói với nhân vật chính. `+
    `Khi đúng trường hợp danh xưng chỉ rõ quan hệ như trên, PHẢI đặt cả "relationship" bằng giá trị mới (VD "Học trò", "Cấp dưới", "Vợ" — luôn là giá trị trong danh sách chuẩn) VÀ "correction":{"relationship":true,"addressing":true,"reason":"..."} trong CÙNG một lượt, không được chỉ sửa xưng hô mà bỏ quên relationship. `+
    `Riêng "correction":{"addressing":true} có NGƯỠNG THẤP HƠN HẲN so với gender/relationship: chỉ cần chương này có LỜI THOẠI TRỰC TIẾP THẬT giữa 2 người, thể hiện RÕ một cách xưng hô KHÁC với "addrThemToMc"/"addrMcToThem" đã lưu — `+
    `dù chỉ là một sắc thái nhẹ hơn/ấm hơn một chút (VD đang xưng "ta/ngươi" mà câu thoại chương này chuyển sang gọi thẳng tên, hoặc chỉ 1-2 câu xưng "muội/ca ca" xen giữa những câu khác vẫn còn trang trọng) — `+
    `KHÔNG cần đợi một bước ngoặt tình tiết hẳn hoi kiểu giảng hoà/lộ thân phận như gender/relationship mới được đặt correction cho addressing. `+
    `Hễ có bằng chứng lời thoại thật khác với dữ liệu cũ là đặt "correction":{"addressing":true,"reason":"..."} và cập nhật lại 2 field xưng hô theo đúng câu chữ vừa đọc được — việc quyết định CỘNG DỒN thêm cách gọi mới hay THAY HẲN cách gọi cũ (nếu sắc thái đã đổi khác hẳn) do hệ thống lưu trữ tự xử lý sau khi nhận correction, AI không cần tự cân nhắc phần đó, cứ báo đúng những gì đọc được trong chương này. `+
    `Tương tự, nếu "narrRef" đã lưu không còn khớp với cách văn bản chương này thực sự gọi nhân vật đó ở ngôi thứ 3 (VD trước ghi "Chưa rõ" nay đã xác định được giới tính để suy đoán đại từ phù hợp, `+
    `hoặc trước chỉ có "hắn" nhưng đoạn tường thuật theo góc nhìn khác trong chương này còn cho thấy thêm biến thể "tên đó"), đặt "correction":{"narrRef":true,"reason":"..."} và cập nhật "narrRef" cho đầy đủ hơn (bổ sung, không xoá lựa chọn cũ trừ khi nó sai hẳn). `+
    `Nếu đúng trường hợp gender/relationship kể trên: đặt field "gender" (và/hoặc "relationship") ở trên bằng giá trị ĐÃ SỬA, đồng thời "correction":{"gender":true,"reason":"lý do ngắn gọn, VD: lộ thân phận nữ giả nam trang"}. `+
    `TUYỆT ĐỐI KHÔNG đặt correction:{"gender":true} hay {"relationship":true} chỉ vì suy luận khác với dữ liệu cũ, thấy mơ hồ, hoặc không chắc chắn 100% — trường hợp đó BẮT BUỘC giữ nguyên y hệt giá trị cũ (ngưỡng chặt này KHÔNG áp dụng cho "addressing", xem ngoại lệ riêng ở trên). `+
    `Correction cho gender/relationship là ngoại lệ hiếm, chỉ dùng khi chương văn bản TRỰC TIẾP phủ nhận thông tin cũ; correction cho addressing thì phổ biến hơn nhiều, cứ có lời thoại thật khác đi là dùng được, không cần bằng chứng nặng ký như gender/relationship.\n`+
    `- "merges": dùng để báo cáo khi bạn phát hiện, dựa trên bằng chứng CỤ THỂ trong nội dung chương này, rằng RẤT CÓ KHẢ NĂNG 2 (hoặc nhiều) nhân vật KHÁC NHAU `+
    `trong danh sách "đã biết" ở trên (không phải nhân vật mới chỉ vừa xuất hiện) thực ra LÀ CÙNG MỘT NGƯỜI — ví dụ chương này tiết lộ tên thật của một người trước giờ `+
    `chỉ được biết qua biệt danh/ngoại hiệu, xác nhận trực tiếp "X chính là Y", hoặc có nhiều chi tiết trùng khớp rõ ràng cùng lúc (đặc điểm nhận dạng, bối cảnh xuất hiện, quan hệ/xưng hô với nhân vật chính đều khớp) khiến khả năng đây là CÙNG 1 người cao hơn hẳn khả năng là 2 người khác nhau trùng tên/danh xưng ngẫu nhiên. Mỗi mục: "keep" là tên chính (name) của nhân vật nên GIỮ LẠI (ưu tiên tên đã có nhiều thông tin/quen thuộc hơn), `+
    `"duplicates" là mảng tên chính (name) của (các) nhân vật trùng với "keep". KHÔNG cần chắc chắn tuyệt đối 100% như trước đây — chỉ cần có căn cứ cụ thể trong chính văn bản chương khiến bạn NGHIÊNG HẲN về khả năng trùng người là đủ để báo cáo; vẫn TUYỆT ĐỐI KHÔNG đoán mò hay suy luận chỉ vì 2 tên/danh xưng nghe giống nhau mà không có chi tiết nào khác củng cố. Hệ thống KHÔNG tự gộp 2 nhân vật: mỗi mục chỉ được ghi thành liên kết "có thể là cùng 1 người" giữa 2 record vẫn tách riêng, người dùng duyệt sau; hệ thống còn có lưới an toàn riêng (tự bỏ nếu 2 nhân vật đã có giới tính hoặc quan hệ với nhân vật chính XÁC ĐỊNH và KHÁC NHAU) — nên hãy ƯU TIÊN báo cáo khi có căn cứ hợp lý thay vì im lặng bỏ qua chỉ vì chưa chắc 100%. `+
    `Mỗi mục kèm: "evidence" = "trực tiếp" CHỈ khi văn bản chương xác nhận thẳng, không mập mờ (VD "X chính là Y", trần thuật nêu rõ X và Y là một) — khi đó BẮT BUỘC có "quote": chép NGUYÊN VĂN, đúng ngôn ngữ và từng ký tự của VĂN BẢN GỐC (không dịch, không tóm tắt), 1 đoạn ngắn khoảng 4-20 chữ nằm TRONG chương và nói rõ điều đó; hệ thống sẽ TÌM LẠI đoạn này, không thấy thì "trực tiếp" bị hạ xuống "suy đoán". `+
    `"evidence" = "suy đoán" cho mọi ca còn lại (nhiều chi tiết trùng khớp nhưng chưa ai xác nhận thẳng, tin đồn, nghi ngờ; "quote" để chuỗi rỗng nếu không có). "reason": 1 câu tiếng Việt thật ngắn nêu căn cứ để người dùng đọc khi duyệt. `+
    `Không tự tạo entry cho nhân vật mới trong "merges", chỉ dùng cho các tên đã có trong danh sách "đã biết". Cùng họ, cùng giới tính hoặc cùng vai vế KHÔNG tính là "chi tiết trùng khớp" — phải có đặc điểm nhận dạng/bối cảnh cụ thể hoặc xác nhận trực tiếp trong văn bản.\n`+
    `- "realNameReveals": dùng RIÊNG cho ca một nhân vật trong danh sách "đã biết" đang mang "placeholderName":true (nhãn mô tả tạm, chưa biết tên thật) và chương này LỘ RA tên thật của người đó, `+
    `NHƯNG việc lộ tên này KHÔNG PHẢI do chính nhân vật đó xuất hiện/thoại trực tiếp trong chương (ca đó bạn đã tự cập nhật thẳng vào "name"+"isPlaceholderName":false của entry đó ở "characters" rồi, không cần dùng field này nữa) — `+
    `mà là do một nhân vật/đoạn văn KHÁC trong chương nhắc tới tên thật của người mang nhãn tạm đó (VD ai đó nói "à, Kính Nữ kia tên thật là Lý Tuyết", hoặc lời kể tiết lộ tên thật của người trước giờ chỉ được gọi bằng biệt danh/nhãn tạm). `+
    `Mỗi mục: "placeholder" là tên chính (name) ĐÃ CÓ NGUYÊN VĂN trong danh sách "đã biết" của nhân vật đang mang nhãn tạm đó, "realName" là tên thật vừa đọc được (áp dụng đúng quy tắc phiên âm Hán Việt / giữ nguyên tên phương Tây như quy tắc "name" ở trên, TUYỆT ĐỐI không còn chữ Hán), `+
    `"originalName" là cách viết CHỮ GỐC của tên thật đó, chép NGUYÊN VĂN đúng như xuất hiện trong chương (VD 陈明勇) — KHÔNG phải chữ gốc của nhãn tạm, KHÔNG tự bịa/đoán; nếu tên thật không xuất hiện bằng chữ gốc trong chương này thì để chuỗi rỗng "". `+
    `"evidence": "trực tiếp" CHỈ khi văn bản xác nhận rõ ràng, dứt khoát, không mập mờ (VD chính nhân vật khác gọi thẳng tên thật, hoặc trần thuật xác nhận thẳng "tên thật của X là Y"); "suy đoán" khi đây chỉ là tin đồn, lời phỏng đoán, nghi ngờ chưa xác nhận, hoặc câu chữ còn mập mờ (VD "nghe nói", "có lẽ", "hình như"). Chấm sai mức "trực tiếp" cho một tin đồn/phủ định là lỗi nghiêm trọng vì hệ thống sẽ ĐỔI TÊN NGAY không qua bước duyệt nào — nếu còn chút nghi ngờ, LUÔN LUÔN chọn "suy đoán". `+
    `Không dùng field này để báo cáo trùng lặp giữa 2 nhân vật đã có tên riêng đầy đủ (đó là việc của "merges"); "realNameReveals" chỉ dành cho ca nâng cấp NHÃN TẠM lên TÊN THẬT.\n`+
    relationsPromptRule()+
    personasPromptRule()+
    `- "relationship" là mối quan hệ của nhân vật đó với NHÂN VẬT CHÍNH của truyện, ghi NGẮN GỌN chỉ tên mối quan hệ, KHÔNG thêm cụm "của nhân vật chính" `+
    `(VD ghi "Mẫu thân", "Sư phụ", "Sư tỷ", "Phụ thân", "Bạn bè", "Kẻ thù", "Đồng nghiệp", "Hàng xóm"... — không ghi "Mẫu thân của nhân vật chính"). Dùng "Chưa rõ" nếu không đủ căn cứ.\n`+
    `- TUYỆT ĐỐI CẤM ghi CHỨC VỤ/NGHỀ NGHIỆP/CHỨC DANH của nhân vật đó vào "relationship" `+
    `(VD CẤM ghi vào relationship: "giáo viên toán trường Hoa Sư Nhất", "lớp trưởng lớp thể dục", "bảo vệ trường", "học sinh"...) — đây là lỗi rất hay gặp, PHẢI tránh tuyệt đối. `+
    `Nghề nghiệp/chức vụ chỉ được lưu vào "note" (mục thân phận), KHÔNG BAO GIỜ được lưu vào "relationship". `+
    `Nghề nghiệp CHỈ được phép xuất hiện trong "relationship" khi chính nó LÀ mối quan hệ trực tiếp với nhân vật chính `+
    `(VD nhân vật chính là học sinh và người này trực tiếp DẠY nhân vật chính → được ghi "Giáo viên"; nhân vật chính là nhân viên và người này là quản lý trực tiếp → được ghi "Cấp trên"). `+
    `Nếu nhân vật đó chỉ đơn thuần làm việc/học cùng nơi với nhân vật chính nhưng KHÔNG có bằng chứng tương tác/quan hệ cụ thể nào với nhân vật chính, ghi "Đồng nghiệp" (nếu cùng làm) hoặc "Chưa rõ" — TUYỆT ĐỐI KHÔNG lấy chức danh của họ làm relationship chỉ vì không tìm được quan hệ nào khác.\n`+
    `- TUYỆT ĐỐI CẤM ghi vào "relationship" mối quan hệ của nhân vật đó với MỘT NHÂN VẬT PHỤ KHÁC (không phải nhân vật chính) `+
    `(VD CẤM ghi "vợ của <tên một nhân vật khác>" nếu người đó không phải là nhân vật chính của truyện). `+
    `"relationship" LUÔN LUÔN chỉ được tính theo NHÂN VẬT CHÍNH; quan hệ giữa các nhân vật phụ với nhau (nếu cần lưu để nhận dạng) thì ghi vào "note", không ghi vào "relationship". `+
    `Nếu không xác định được quan hệ trực tiếp nào giữa nhân vật đó và nhân vật chính, BẮT BUỘC để "relationship":"Chưa rõ" — không được thay thế bằng bất kỳ thông tin nào khác (nghề nghiệp, quan hệ với người khác...) chỉ vì thiếu dữ kiện.\n`+
    `- "kin": CHỈ điền khi văn bản nói THẲNG nhân vật này là người thân/thầy trò của MỘT NGƯỜI CỤ THỂ (người đó có thể là nhân vật chính hoặc nhân vật khác). Dạng {"role":"<đúng 1 trong: ${CHARMEM_KIN_ROLES.join(', ')}>","of":"<tên chính (name) của người đó trong danh sách characters, hoặc \"MC\" nếu là nhân vật chính>"}. "role" là vai CỦA NHÂN VẬT NÀY đối với người "of" (VD nhân vật "Cha của Trụ Tử" -> {"role":"cha","of":"Trụ Tử"}; cha của nhân vật chính -> {"role":"cha","of":"MC"}). Chỉ dùng ĐÚNG các từ trong danh sách role, KHÔNG viết từ khác (${CHARMEM_KIN_HINT}). Không thuộc các vai đó hoặc không chắc thì "kin":null.\n`+
    `- "bodyOf": CHỈ đặt "MC" khi văn bản nói THẲNG nhân vật này CHÍNH LÀ thân xác/thân phận/kiếp khác của nhân vật chính (VD nhân vật chính xuyên không nhập vào thân xác tên "Vương Thiết Trụ", hoặc "Trụ Tử" là tên người ta gọi thân xác đó). KHÔNG đặt khi chỉ là người có liên quan/giống nhân vật chính. KHÔNG đặt cho phân thân, hóa thân, bản sao, tái sinh song song hay người cùng xuất hiện với nhân vật chính trong cùng một cảnh: họ là người RIÊNG tồn tại song song, chỉ thân xác bị nhân vật chính chiếm lấy (chủ cũ không còn tồn tại độc lập) mới đặt "MC". Không chắc thì để "".\n`+
    `- "addrThemToMc": cách nhân vật này XƯNG HÔ khi trực tiếp nói chuyện với NHÂN VẬT CHÍNH — trả về MỘT MẢNG, mỗi phần tử là 1 lựa chọn xưng hô đầy đủ, `+
    `dạng object CÓ CẤU TRÚC RÕ RÀNG {"self":"<nhân vật này TỰ XƯNG gì>","callsMc":"<nhân vật này GỌI nhân vật chính là gì>"} — KHÔNG dùng chuỗi tự do kèm dấu "/" như định dạng cũ, `+
    `để tránh nhầm lẫn giữa phần tự xưng và phần gọi đối phương ngay từ lúc bạn sinh ra kết quả. `+
    `VD chỉ có 1 lựa chọn: [{"self":"muội","callsMc":"ca ca"}]. `+
    `Nếu chương cho thấy họ dùng NHIỀU cách xưng hô khác nhau tuỳ ngữ cảnh (VD lúc thân mật, lúc nghiêm túc) và cả 2 cách đều xuất hiện rõ ràng, `+
    `thêm từng object ĐẦY ĐỦ vào mảng (VD [{"self":"muội","callsMc":"ca ca"},{"self":"tiểu muội","callsMc":"đại ca"}]) — TUYỆT ĐỐI KHÔNG trộn "self" của lựa chọn này với "callsMc" của lựa chọn khác. `+
    `"addrMcToThem": ngược lại — cách NHÂN VẬT CHÍNH xưng hô khi nói với nhân vật này, CÙNG kiểu mảng object nhưng field thứ 2 tên là "callsThem" thay vì "callsMc": {"self":"<nhân vật chính TỰ XƯNG gì>","callsThem":"<nhân vật chính GỌI nhân vật này là gì>"}. `+
    `⚠ CẶP XƯNG HÔ LÀ BỘ ĐẠI TỪ DỊCH, KHÔNG PHẢI DANH XƯNG CHÉP TỪ BẢN GỐC: "self" = từ dịch cho ĐẠI TỪ NGÔI 1 (我/I/私/나/ta) khi nói với người kia; "callsMc"/"callsThem" = từ dịch cho ĐẠI TỪ NGÔI 2 (你/you/あなた/너/ngươi) — chọn sao cho hợp văn phong/vai vế/thể loại, và dùng được TRONG CÂU như một đại từ. `+
    `Danh xưng bản gốc dùng để GỌI người nghe (妈, 叔叔, 刘叔, 哥哥, 师兄, 老师, Mom, Uncle Liu, お兄ちゃん, 오빠...) là việc của bước dịch (luôn giữ nguyên), nên TUYỆT ĐỐI KHÔNG chép nó vào "callsMc"/"callsThem" để rồi bị lặp kiểu "Mẹ, mẹ đang làm gì" / "Lưu thúc, Lưu thúc mệt rồi". Thay vào đó SINH từ ngôi 2 tự nhiên tương ứng với vai vế: `+
    `bề trên/trưởng bối kính trọng (cha mẹ, chú bác, thầy, sư phụ, tiền bối) ở hệ cổ trang-tu tiên → "người" hoặc "ngài" (tự xưng thường "con"/"đệ tử"/"vãn bối"); anh chị em/đồng môn → ngôi 1/ngôi 2 kiểu huynh-muội-tỷ-đệ khớp giới và vai vế (VD bản gốc 哥哥 → "muội/huynh" chứ KHÔNG ghi "ca ca"); `+
    `ngang hàng/xa lạ/kẻ thù → các đại từ trung tính theo thể loại (ta/ngươi, tôi/cậu...). Truyện hiện đại/phương Tây/nguồn không phải tiếng Trung: chọn cặp đời thường tự nhiên của tiếng Việt (con/mẹ, em/anh, tôi/anh...), KHÔNG dùng người/ngài/huynh/muội nếu thể loại không phải cổ trang-tu tiên. Hệ hiện đại/đời thường mà "con/mẹ", "em/anh" thật sự là cách nói tự nhiên thì được ghi thêm như 1 lựa chọn thứ hai (VD [{"self":"con","callsMc":"người"},{"self":"con","callsMc":"mẹ"}]), lựa chọn ĐẦU TIÊN là lựa chọn ưu tiên. `+
    `Nếu bản gốc chỉ toàn dùng danh xưng (không có 我/你 nào) vẫn sinh cặp theo quy tắc trên từ "relationship"/giới tính/độ tuổi/thể loại — danh xưng gốc là bằng chứng cho vai vế chứ không phải nội dung để chép vào cặp. `+
    `Căn cứ ưu tiên lấy từ LỜI THOẠI trực tiếp giữa 2 người này, KHÔNG lấy từ ngôi kể chuyện hay từ cách người khác gọi họ. Có thoại nhưng cách xưng hô mơ hồ thì làm theo quy tắc "đường nền Trung tính" ở dưới (được phép suy đoán, khai "suy đoán"). `+
    `Nếu chương KHÔNG có đoạn hội thoại trực tiếp nào giữa họ: nhân vật ĐÃ có xưng hô lưu sẵn trong danh sách "đã biết" thì để MẢNG RỖNG [] cho cả 2 field (hệ thống tự giữ giá trị đã lưu); nhân vật CHƯA có xưng hô lưu sẵn cũng PHẢI để MẢNG RỖNG [] cho cả 2 field — TUYỆT ĐỐI KHÔNG suy đoán, KHÔNG điền cặp "Trung tính" làm "đường nền" cho nhân vật không có thoại trực tiếp với nhân vật chính (chỉ được nhắc tới, chỉ xuất hiện trong tường thuật, hoặc chỉ nói chuyện với người KHÁC không phải nhân vật chính); khai "addrEvidence":"không có hội thoại", "addrQuote":"", "addrTone":"Chưa rõ" — hệ thống sẽ để trống xưng hô cho tới chương nào thực sự có thoại với nhân vật chính. Vẫn TUYỆT ĐỐI KHÔNG bịa cặp mang sắc thái đặc thù chỉ vì quan hệ (VD không tự suy "là kẻ thù nên chắc chắn xưng ta/ngươi"). `+
    `Nếu chỉ xác định chắc chắn được 1 trong 2 phần của 1 lựa chọn (VD chỉ biết "callsMc" mà không rõ "self"), giữ phần chắc chắn và để phần còn lại là chuỗi rỗng "" trong CHÍNH object đó — KHÔNG bịa thêm cho đủ cặp, KHÔNG bỏ hẳn lựa chọn đó. (Khi KHÔNG trích được bất kỳ phần nào dù có thoại thì mới dùng "đường nền Trung tính" ở dưới.) `+
    `Khi cần CHỌN xưng hô cụ thể phù hợp (có hội thoại nhưng cách xưng hô chưa rõ ràng, hoặc phải đoán đường nền), dựa vào "relationship", độ tuổi ("statusCue") và thân phận trong "note" của cả 2 bên, kết hợp thể loại và bộ xưng hô thường gặp nêu ở đầu prompt (nếu có). `+
    `⚠ CẤM TÊN RIÊNG TRONG CẶP XƯNG HÔ: "self", "callsMc", "callsThem" CHỈ là đại từ/từ xưng hô dùng được trong câu (tôi, tớ, mình, em, anh, chị, cô, cậu, bạn, ông, bà, con, mẹ, người, ngài, huynh, muội...). TUYỆT ĐỐI KHÔNG ghi TÊN RIÊNG, biệt danh hay "chức danh + tên" của bất kỳ nhân vật nào (kể cả nhân vật chính) vào 3 field này. Sai: {"self":"tôi","callsMc":"Tô Nhàn"}, {"self":"tôi","callsThem":"Tiểu Man"}, {"self":"tôi","callsMc":"chị Lan"}. Đúng: {"self":"tôi","callsMc":"anh"}. Bản gốc gọi nhau bằng tên thì việc nhắc tên là của bước dịch; cặp xưng hô vẫn phải sinh ĐẠI TỪ phù hợp theo quan hệ, độ thiện cảm, tuổi, giới tính. Hệ thống sẽ tự loại cặp dính tên. `+
    `⚠ CHỌN CẶP THEO QUAN HỆ + ĐỘ THIỆN CẢM + TUỔI/GIỚI: cùng 1 quan hệ nhưng độ thiện cảm khác thì cặp phải khác. Dùng "relationship", "affinity", "statusCue", giới tính của CẢ 2 bên (đây là gợi ý, lệch được nếu hội thoại thật cho thấy khác). CHỈ dùng xưng hô tiếng Việt chuẩn/phổ thông, KHÔNG dùng từ địa phương (miền Nam: ba, má, tía, tui, qua, bậu, mầy, anh Hai/chị Ba...; miền Trung: mi, tau, mạ, bọ, o; Bắc nông thôn: u, bầm, bu, mế) — cha/mẹ ghi "bố"/"cha"/"mẹ". Hệ đời thường/hiện đại — ngang hàng/bạn bè: Thân thiết → tớ/cậu (hoặc mình/cậu); Thân thiện → tôi/bạn hoặc tôi/cậu; Bình thường hoặc Xa cách → tôi/anh, tôi/chị, tôi/cô theo giới và tuổi; Thù địch → tôi/anh lạnh lùng, chỉ dùng tao/mày khi đã trở mặt hẳn. Người dưới nói với người trên mà gần gũi → em/anh, em/chị; người trên nói với người dưới gần gũi → anh/em, chị/em. Cha mẹ - con: Thân thiết → con/bố (mẹ) và bố (mẹ)/con; Xa cách → tôi/ông (bà) hoặc con/ông (bà), phía cha mẹ lạnh nhạt có thể tôi/cậu (cô). Vợ chồng, người yêu: Thân thiết → anh/em hai chiều; Xa cách → tôi/anh, tôi/cô. VD gốc "ta không thích ngươi": bạn bè xa cách → "tôi không thích anh"; bạn bè gần gũi → "tớ không thích cậu"; trên/dưới gần gũi → "em không thích anh"; cha con lạnh nhạt → "tôi không thích ông". Hệ cổ trang/tu tiên (CHỈ khi thể loại đã xác định là cổ trang): xa cách → ta/ngươi; đã quen biết hơn → ta/huynh (ta/tỷ, ta/muội...); gần gũi và quan hệ đã rõ → huynh/muội, huynh/đệ, tỷ/muội. "ta/ngươi" là cặp trung tính của hệ này, KHÔNG nhất thiết là thù địch. Một quan hệ có thể có nhiều cách xưng tuỳ ngữ cảnh (VD mẹ con gốc ta/ngươi → [{"self":"con","callsMc":"mẹ"},{"self":"con","callsMc":"người"}]) — cặp ĐẦU là cặp ưu tiên. `+
    `⚠ "CON"/"CHÁU" CHỈ DÀNH CHO VAI DƯỚI THẬT SỰ: chỉ ghi tự xưng "con"/"cháu" (hoặc "callsThem" là "con"/"cháu") khi bên nói THỰC SỰ là con cái/cháu/học trò hoặc rõ ràng nhỏ tuổi hơn bên nghe cỡ cha mẹ-chú bác-trưởng bối. Hai người cùng tầm tuổi (VD cùng là thiếu niên) KHÔNG xưng "con" với nhau — nếu nghe thấy "con" trong chương, rất có thể nhân vật đang nói với NGƯỜI KHÁC (bậc cha chú, chủ quán, sư phụ, khách...) chứ không phải với nhân vật chính: khi đó KHÔNG ghi vào addrThemToMc/addrMcToThem. Cặp xưng hô chỉ được ghi khi lời thoại đó nói THẲNG giữa nhân vật này và nhân vật chính. `+
    `⚠ BẮT BUỘC — không được để trống khi CÓ hội thoại trực tiếp: nếu chương này xác nhận CÓ ít nhất 1 lượt lời thoại trực tiếp giữa nhân vật này và nhân vật chính, nhưng bản gốc lược chủ ngữ/tân ngữ hoặc xưng hô quá mơ hồ để trích xuất chính xác cặp cụ thể, TUYỆT ĐỐI KHÔNG để cả 2 field là mảng rỗng — PHẢI tự suy đoán tối thiểu 1 cặp thuộc nhóm sắc thái "Trung tính" làm "đường nền" an toàn, dựa trên "relationship" và độ tuổi ("statusCue") và thân phận trong "note" của cả 2 bên — rồi đặt "addrEvidence":"suy đoán" cho trường hợp này. `+
    `Nếu chưa rõ quan hệ giữa 2 nhân vật thì KHÔNG tự đặt xưng hô xác định quan hệ (bố/mẹ/con/anh/em...) và không thêm danh từ quan hệ vào lời dẫn; chỉ dùng xưng hô trung tính theo thể loại (cổ trang: ta/ngươi; hiện đại: tôi/anh, tôi/chị, tôi/cậu). `+
    (neutralAddrExampleForGuess
      ?`Ví dụ đường nền PHÙ HỢP HỆ xưng hô của CHÍNH truyện này (dựa trên thể loại/chỉ dẫn đã nêu ở trên): {"self":"${neutralAddrExampleForGuess.self}","callsMc":"${neutralAddrExampleForGuess.callsMc}"}. `
      :`VD 2 hệ tham khảo (CHỈ dùng đúng hệ khớp với thể loại của CHÍNH truyện này đã xác định ở trên — TUYỆT ĐỐI KHÔNG trộn hệ cổ trang/tu tiên với hệ hiện đại/đô thị trong CÙNG 1 cặp): hệ cổ trang/tu tiên {"self":"ta","callsMc":"ngươi"}, hệ hiện đại/đô thị {"self":"tôi","callsMc":"cậu"}. `)+
    `Khi chương THỰC SỰ không có thoại trực tiếp giữa nhân vật này và nhân vật chính thì BẮT BUỘC để mảng rỗng, dù nhân vật đã hay chưa có xưng hô lưu sẵn ("addrEvidence" là "không có hội thoại"); CHỈ khi CÓ thoại trực tiếp với nhân vật chính mới PHẢI có ít nhất 1 cặp. `+
    `⚠ ĐA DẠNG HOÁ NGAY CẢ KHI ĐÃ CÓ CẶP CỤ THỂ: quy tắc "Trung tính" ở trên chỉ là đường nền cho lúc KHÔNG trích được cặp nào — nhưng dù ĐÃ trích được 1 cặp cụ thể mang sắc thái đặc thù/thân phận/tôn ti từ hội thoại thật (VD cặp danh xưng/chức vụ/tôn ti đặc thù của quan hệ đó), nếu cặp đó có "addrTone" KHÁC "Trung tính" VÀ mối quan hệ giữa 2 người thuộc dạng có thể hợp lý chuyển qua lại giữa xưng hô trang trọng và xưng hô đời thường tuỳ ngữ cảnh (VD vợ chồng, người yêu, bạn bè, anh em/đồng môn thân thiết, đồng nghiệp qua lại thân mật...), BẮT BUỘC bổ sung THÊM ít nhất 1 lựa chọn thuộc nhóm "Trung tính" vào CUỐI mảng, giữ nguyên cặp cụ thể đã có (KHÔNG xoá, KHÔNG thay thế) — mục đích là cung cấp nhiều biến thể xưng hô hơn để bước dịch sau này chọn đúng theo từng ngữ cảnh cụ thể trong chương, thay vì chỉ có duy nhất 1 cách gọi trang trọng xuyên suốt. CHỈ được bỏ qua việc bổ sung này khi: (a) cặp đã trích ra vốn dĩ đã thuộc nhóm "Trung tính", hoặc (b) bản chất mối quan hệ KHÔNG hợp lý để chuyển sang xưng hô trung tính (VD kẻ thù/xa cách hẳn, quan hệ chủ-tớ hoặc quân-thần nghiêm ngặt theo đúng bối cảnh truyện bắt buộc giữ tôn ti tuyệt đối, không có tình huống nào trong truyện cho phép nói chuyện xuề xoà). `+
    `⚠ CẶP XƯNG HÔ PHẢI ĐỐI XỨNG ĐÚNG KIỂU QUAN HỆ, KHÔNG CHỈ ĐÚNG TRÊN/DƯỚI: nhiều xưng hô mang tính ƯỚC LỆ CỐ ĐỊNH theo TỪNG kiểu quan hệ (thầy-trò, đồng môn/đồng cấp, bề trên-bề dưới, tiền bối-hậu bối...) và không dùng lẫn giữa các kiểu; "self" và "callsMc"/"callsThem" trong CÙNG 1 lựa chọn PHẢI là 1 cặp đối ứng của ĐÚNG 1 kiểu quan hệ — TUYỆT ĐỐI KHÔNG ghép từ của kiểu quan hệ này với từ của kiểu quan hệ khác dù cả 2 từ đều đúng chiều trên/dưới. Đây là lỗi khác hẳn lỗi lệch vai vế trên/dưới nên PHẢI kiểm tra kỹ trước khi trả về. `+
    `⚠ NGÔN NGỮ CỦA "self"/"callsMc"/"callsThem" — áp dụng quy tắc CHẶT y hệt quy tắc "name" ở trên: NẾU văn bản gốc là chữ Hán/Trung Quốc, TUYỆT ĐỐI CẤM copy nguyên văn chữ Hán vào bất kỳ phần nào của các object xưng hô — PHẢI chuyển sang tiếng Việt trước khi điền vào field. `+
    hanVietOverride+`Với từ xưng hô Hán-Việt quen thuộc trong truyện dịch (VD 哥哥→"ca ca"/"huynh", 妹妹→"muội muội"/"muội", 师兄→"sư huynh", 前辈→"tiền bối"), nếu cần ghi vào cặp thì ghi ở DẠNG ĐẠI TỪ dùng được trong câu ("huynh", "muội", "tiền bối"...) theo quy tắc ở trên, không ghi dạng danh xưng lặp ("ca ca", "mẹ", "thúc thúc") làm từ ngôi 2; vẫn KHÔNG dịch nghĩa cứng sang thuần Việt. `+
    `Với các cách xưng hô là TỪ GHÉP/CỤM CÓ NGHĨA cụ thể theo chức danh/nghề nghiệp (VD 保安哥哥 = "bảo vệ" + "ca ca") chứ không phải 1 xưng hô Hán-Việt ước lệ đơn lẻ, MẶC ĐỊNH dịch nghĩa tự nhiên sang tiếng Việt (VD 保安哥哥→"anh bảo vệ", 小妹妹→"em gái nhỏ"/"cô bé") — TRỪ KHI phần "CHỈ DẪN THÊM từ prompt dịch chính" ở trên (nếu có) xác nhận RÕ RÀNG truyện muốn giữ phong cách xưng hô Hán Việt/kiểu Trung (VD dặn dùng ca ca/tỷ tỷ/huynh muội thay vì anh/chị/em), thì lúc đó GIỮ phần chức danh ở dạng Hán Việt (phiên âm nếu là từ đã quen dùng dạng Hán Việt, hoặc dùng từ Hán Việt tương đương nếu có) rồi ghép với phần xưng hô ước lệ, thay vì Việt hoá toàn bộ cụm (VD 保安哥哥→"bảo vệ ca ca" thay vì "anh bảo vệ"). Dù theo nhánh nào, TUYỆT ĐỐI KHÔNG để nguyên cụm chữ Hán dù chỉ 1 phần — nhánh "giữ phong cách Hán Việt" vẫn phải phiên âm/dịch hết, không phải cái cớ để chừa lại chữ Hán gốc. `+
    `Đây là lỗi rất hay gặp (khác hẳn "name" đã được nhắc kỹ, field xưng hô này dễ bị bỏ sót) — PHẢI tự kiểm tra lại: nếu bất kỳ ký tự nào trong "self"/"callsMc"/"callsThem" vẫn còn là chữ Hán, đó là lỗi và phải sửa trước khi trả về kết quả.\n`+
    `- "addrEvidence": TỰ KHAI BÁO trung thực độ chắc chắn của 2 field xưng hô vừa điền ở trên — CHỈ được chọn 1 trong 3 giá trị cố định: `+
    `"trực tiếp" (có ít nhất 1 câu THOẠI TRỰC TIẾP thật giữa 2 người thể hiện rõ cách xưng hô vừa điền), `+
    `"suy đoán" (không có thoại trực tiếp đủ rõ, nhưng bạn vẫn suy đoán dựa vào quan hệ/vai vế/văn phong thể loại), `+
    `hoặc "không có hội thoại" (chương không có thoại trực tiếp giữa nhân vật này và nhân vật chính — khi đó cả 2 field xưng hô PHẢI là mảng rỗng: đã có xưng hô lưu sẵn thì hệ thống giữ giá trị đã lưu, chưa có thì để trống, KHÔNG điền đường nền). `+
    `Hệ thống dùng field này để quyết định có cần đọc lại kỹ hơn hay không — TUYỆT ĐỐI KHÔNG chọn "trực tiếp" chỉ vì muốn kết quả trông chắc chắn hơn thực tế.\n`+
    `- "addrQuote": BẮT BUỘC khi "addrEvidence" là "trực tiếp": chép NGUYÊN VĂN, đúng ngôn ngữ và từng ký tự của VĂN BẢN GỐC (không dịch, không tóm tắt), 1 đoạn lời thoại ngắn khoảng 3-12 từ (với chữ Hán khoảng 4-20 chữ) nằm TRONG chương và cho thấy rõ cách xưng hô vừa điền (câu có từ tự xưng hoặc từ gọi đối phương). Hệ thống sẽ TÌM LẠI đoạn này trong văn bản gốc — không tìm thấy thì "trực tiếp" bị coi là khai không đúng và nhân vật bị đẩy qua bước xác minh. Không có câu nào đúng nghĩa đó thì đặt "addrEvidence":"suy đoán" và "addrQuote":"". KHÔNG ghép nhiều câu cách xa nhau thành 1 đoạn trích. Câu trích PHẢI là lời nhân vật này nói thẳng với (hoặc được nhân vật chính nói thẳng với) NHÂN VẬT CHÍNH — lời nói với người thứ ba không được dùng làm bằng chứng.\n`+
    `- "addrTone": xếp NHÓM sắc thái của cặp xưng hô addrThemToMc/addrMcToThem vừa xác định — CHỈ được chọn 1 trong các giá trị cố định: `+
    `${CHARMEM_ADDR_TONES.join(', ')}, hoặc "Chưa rõ" CHỈ khi cả 2 field xưng hô để mảng rỗng vì không có thoại trực tiếp với nhân vật chính (dù nhân vật đã hay chưa có xưng hô lưu sẵn). `+
    `LƯU Ý khi mảng có NHIỀU lựa chọn khác nhóm sắc thái (VD vừa có cặp cụ thể vừa có cặp "Trung tính" bổ sung theo quy tắc ĐA DẠNG HOÁ ở trên): "addrTone" LUÔN LUÔN phản ánh nhóm sắc thái của lựa chọn ĐẦU TIÊN/CHÍNH (cặp có bằng chứng/mang sắc thái đặc thù nhất, không phải cặp "Trung tính" bổ sung thêm) — vì hệ thống dùng field này (dạng số ít) để theo dõi quan hệ có đổi hẳn nhóm sắc thái hay không giữa các chương, không phải liệt kê tất cả sắc thái đang có trong mảng.\n`+
    `- "affinity": ĐỘ THIỆN CẢM thật sự giữa nhân vật này và NHÂN VẬT CHÍNH ở thời điểm chương này (khác "addrTone": addrTone là sắc thái cặp từ xưng hô, còn affinity là tình cảm giữa hai người). CHỈ chọn 1 giá trị nguyên văn trong: ${CHARMEM_AFFINITY_ITEMS.map(x=>x[2]).join(", ")}, hoặc "Chưa rõ". Dựa vào lời thoại, hành động, thái độ giữa họ trong chương, KHÔNG dựa vào quan hệ trên danh nghĩa (cha con mà hờ hững/lạnh nhạt là "Xa cách"; bạn bè mà đang đối đầu là "Thù địch"; bạn thân, vợ chồng hoà thuận, mẹ con quấn quýt là "Thân thiết"). Chương không có tương tác trực tiếp với nhân vật chính thì "Chưa rõ". Nếu thiện cảm đã đổi hẳn so với giá trị đã lưu trong danh sách "đã biết" thì đặt "correction":{"affinity":true,...} kèm "reason". `+
    `- "narrRef": HOÀN TOÀN KHÁC addrThemToMc/addrMcToThem — 2 field đó là xưng hô khi nhân vật này NÓI CHUYỆN TRỰC TIẾP với nhân vật chính; `+
    `còn "narrRef" là (các) ĐẠI TỪ/CÁCH GỌI NGÔI THỨ 3 PHIẾM CHỈ mà lời văn TƯỜNG THUẬT dùng để chỉ nhân vật này, hoặc khi MỘT NGƯỜI KHÁC (không phải đang nói trực tiếp với họ) nhắc tới họ — CHỈ cần TRUNG TÍNH theo giới tính là đủ (VD "hắn"/"anh ta"/"y" cho nhân vật Nam, "nàng"/"cô ấy" cho nhân vật Nữ), có thể kèm thêm vài biến thể phiếm chỉ khác sắc thái nhẹ như thân mật/suồng sã (VD "gã", "cô ta") hay xa cách/thù địch (VD "lão ta", "tên đó", "mụ", "con nhỏ đó") tuỳ góc nhìn tường thuật. `+
    `Với nhân vật NỮ: TUYỆT ĐỐI KHÔNG ghi \"em\"/\"em ấy\" vào narrRef (em là xưng hô trực tiếp, không phải ngôi thứ 3); chọn \"cô\"/\"cô ấy\" (người trẻ/trưởng thành), \"cô bé\"/\"con bé\" (trẻ nhỏ), \"bà\"/\"bà ấy\" (trung niên/cao tuổi) tuỳ độ tuổi, quan hệ, độ thiện cảm; truyện huyền huyễn/tiên hiệp/cổ trang dùng \"nàng\" thay \"cô\". `+
    `TUYỆT ĐỐI KHÔNG ghi các DANH XƯNG/CHỨC DANH KÍNH NGỮ CỤ THỂ như "ngài", "đại nhân", "bệ hạ", "tiền bối", "các hạ" — đây là XƯNG HÔ mang tính chức danh/địa vị, thuộc phạm vi addrThemToMc/addrMcToThem nếu xuất hiện trong hội thoại trực tiếp, KHÔNG PHẢI đại từ ngôi 3 phiếm chỉ nên không thuộc narrRef. `+
    `Vì đây là field chỉ cần đại từ TRUNG TÍNH/phiếm chỉ, được phép TỰ SUY ĐOÁN lựa chọn phù hợp dựa trên giới tính nhân vật, thể loại truyện và văn phong của đoạn tường thuật, KHÔNG cần bằng chứng chặt như addrEvidence — đây vốn là field mang tính GỢI Ý cho bước dịch chọn từ hợp ngữ cảnh, không phải field cần trích dẫn chính xác 1 câu chữ cụ thể.\n`+
    `TUYỆT ĐỐI KHÔNG ghi CÂU/CỤM MIÊU TẢ NGOẠI HÌNH, TRANG PHỤC hay ĐẶC ĐIỂM NHẬN DẠNG (VD "người mặc áo bào đen, khuôn mặt che kín", "gã đàn ông có vết sẹo dài trên má", "cô gái áo đỏ"), và cũng KHÔNG ghi biệt hiệu/biệt danh riêng (VD "Hắc y nhân", "Chu Tước vương") dù bản gốc dùng cách này để chỉ nhân vật — những cách gọi đó không phải đại từ phiếm chỉ trung tính, dễ lỗi thời khi tình tiết đổi; nếu không xác định được giới tính để chọn đại từ phù hợp, để "narrRef":"Chưa rõ".\n`+
    `TUYỆT ĐỐI CẤM copy y nguyên giá trị "relationship" (VD nhân vật có relationship="Sư tỷ") vào "narrRef" chỉ vì đó là mối quan hệ đã biết — đây là lỗi rất hay gặp, PHẢI tránh. `+
    `Ví dụ: nhân vật là "Sư tỷ" của nhân vật chính, nhưng khi tường thuật/kể chuyện, bản gốc dùng đại từ trung tính (VD tương đương "nàng") để chỉ cô ấy — trường hợp này PHẢI ghi "narrRef":"nàng" (đúng đại từ trung tính đang dùng), TUYỆT ĐỐI KHÔNG ghi "Sư tỷ" (đó là relationship, không phải đại từ ngôi 3 thật).\n`+
    `Nếu chương cho thấy nhân vật này có thể được gọi ngôi 3 theo NHIỀU SẮC THÁI KHÁC NHAU tuỳ góc nhìn/ngữ cảnh (VD phần lớn dùng trung tính "hắn", nhưng đoạn tường thuật theo góc nhìn kẻ thù dùng "tên đó"), `+
    `liệt kê TẤT CẢ các lựa chọn hợp lý, cách nhau bởi dấu phẩy (VD "hắn, tên đó") — không cần gắn nhãn phe/nhóm sắc thái, chỉ cần liệt kê đủ các đại từ phiếm chỉ phù hợp; `+
    `bước dịch sau này sẽ tự chọn lựa chọn phù hợp theo góc nhìn của đoạn văn đang dịch. Nếu không xác định được giới tính nhân vật để suy đoán đại từ phù hợp, để "Chưa rõ".\n`+
    `- Các bằng chứng sau ĐƯỢC TÍNH LÀ ĐỦ RÕ RÀNG để xác định giới tính, không cần chờ mô tả ngoại hình hay tên riêng: `+
    `danh xưng/xưng hô chỉ rõ giới tính (sư huynh/sư tỷ/sư đệ/sư muội, ca ca/tỷ tỷ/đệ đệ/muội muội, công tử/cô nương/tiểu thư/phu nhân/lão gia, thúc thúc/thẩm thẩm; `+
    `từ xưng hô gia đình: cha/ba/bố/phụ thân/gia phụ/ông nội/ông ngoại = Nam, mẹ/má/mẫu thân/gia mẫu/nương/bà nội/bà ngoại = Nữ, anh trai = Nam, chị gái = Nữ), `+
    `đại từ nhân xưng ngôi thứ 3 rõ giới tính (nàng, hắn, y, thị...), hoặc nhân vật tự xưng/được xác nhận trực tiếp là nam/nữ. `+
`CŨNG LÀ BẰNG CHỨNG ĐỦ: danh xưng/chức danh/loại người mà BẢN THÂN TỪ ĐÃ CHỈ GIỚI (không phụ thuộc tên riêng), gắn với chính nhân vật này — NỮ: thiếu phụ/phụ nhân/mỹ phụ/quả phụ/lão bà/đạo cô/ni cô/sư cô/sư thái/tiên tử/thánh nữ/nữ hiệp/thiếu nữ/cô nương (少妇/妇人/道姑/尼姑/师太/仙子/圣女/女侠…); NAM: đạo trưởng/đạo sĩ/lão đạo/hòa thượng/lão tăng/hán tử/đại hán/lão đầu/thư sinh/thiếu hiệp/đại hiệp/thái giám/sư huynh/sư đệ (道长/道士/和尚/大汉/老头/书生/太监…). VD biệt danh "Thiếu phụ Hoan Hỷ Cung" (欢喜宫少妇) = Nữ; "Trùng Vân Đạo Trưởng" = Nam (nữ đạo sĩ thì gọi đạo cô); mô tả "sư huynh của hòa thượng trẻ…" = Nam. Với các danh xưng này, genderQuote có thể chính là cụm biệt danh/danh xưng đó (không cần đại từ 他/她), miễn nó chỉ MỘT phía giới và gắn với đúng nhân vật này; với dạng "X của Y" thì giới tính là của X (vế trước "của"), KHÔNG phải của Y. `+
    `NGƯỢC LẠI, các danh xưng/tự xưng chỉ thể hiện ĐỊA VỊ, QUYỀN LỰC, TUỔI TÁC, hay SỰ TÔN KÍNH — dùng CHUNG được cho cả 2 giới tuỳ ngữ cảnh — TUYỆT ĐỐI KHÔNG được dùng làm bằng chứng xác định giới tính, `+
    `dù trong thói quen đọc truyện thường bị liên tưởng nhầm sang 1 giới cụ thể (VD "bản toạ"/"bổn toạ" (người tu luyện có địa vị cao, cả nam lẫn nữ đều tự xưng), "đại nhân"/"các hạ"/"tại hạ"/"tiền bối"/"bệ hạ"/"chủ nhân"/"lão nhân gia" (kính ngữ/khiêm ngữ theo địa vị-tuổi tác, không phải theo giới tính), `+
    `và các chức danh/nghề nghiệp không tự thân xác định giới tính như "đại soái"/"minh chủ"/"trưởng lão"/"thị vệ"/"quản gia" — những trường hợp này CHỈ được dùng làm bằng chứng nếu chương này CÒN có thêm 1 trong các bằng chứng rõ ràng đã liệt kê ở trên, không được tự suy diễn giới tính chỉ từ riêng chúng. `+
`CÓ PHẢI NGƯỜI KHÔNG — "isHuman" BẮT BUỘC có ở MỌI entry: true nếu nhân vật là người, hoặc sinh linh có hình người và có giới tính như người (kể cả thần/tiên/ma/yêu ĐÃ hoá hình người, người nhập vào thân xác khác); false nếu KHÔNG phải người và không có giới tính: thú vật/yêu thú chưa hoá hình, vật phẩm/pháp bảo/vũ khí, hệ thống/AI/máy móc, tinh thể, tổ chức/thế lực/địa danh bị nhầm là nhân vật. Nếu isHuman=false: đặt "gender":"Chưa rõ", "genderEvidence":"không có", "genderQuote":"" và KHÔNG cần xác định giới tính. Nếu isHuman=true: PHẢI điền Nam/Nữ theo thang bên dưới — hầu như không có người nào phải để "Chưa rõ". `+
`THANG ĐỘ CHẮC CHẮN của giới tính (khai đúng BẬC CAO NHẤT có thật trong chương, không bịa bậc cao hơn): `+
`BẬC 1 = "trực tiếp" (100%, hệ thống sẽ KHOÁ): đại từ nhân xưng ngôi 3 chỉ thẳng nhân vật này trong phần tường thuật (她/他, nàng/hắn/cô ta/anh ta/y/thị... — KHÔNG tính đại từ nằm trong lời thoại, vì thường chỉ người khác), hoặc từ chỉ quan hệ-giới/danh xưng tự thân chỉ giới đã liệt kê ở trên. `+
`BẬC 2 = "ngoại hình" (~70%): mô tả ngoại hình/thân thể/trang phục chỉ giới gắn với nhân vật (男子/女子/少女, râu/胡须, váy dài, son môi, dáng người...) khi chưa có đại từ ngôi 3. `+
`BẬC 3 = "danh xưng" (~50%): cách gọi hoặc từ khen vẻ đẹp thường dành cho 1 giới (tiểu thư, phu nhân, công tử, 美人, xinh đẹp, yêu kiều, diễm lệ...) khi chưa có bậc 1-2. `+
`BẬC 4 = "tên" (~20%): chỉ có TÊN riêng/tên gốc nghe giống nam hay nữ (VD 雪/婷/娜/丽 thường nữ; 强/伟/刚/龙 thường nam) khi KHÔNG có bậc 1-3 nào — vẫn PHẢI điền giới tính đoán được (đây là bậc thấp nhất, chỉ làm nhãn tạm). `+
`Hệ thống chỉ KHOÁ giới tính ở bậc 1. Bậc 2-4 được lưu thành NHÃN SUY ĐOÁN kèm độ chắc chắn (dùng để chọn đại từ khi dịch); về sau khi đại từ ngôi 3 xuất hiện: cùng giới thì nhãn được khoá, ngược giới thì nhãn bị SỬA LẠI theo đại từ; bằng chứng bậc cao hơn cũng thay được nhãn bậc thấp hơn. Vì vậy cứ điền thẳng giới tính + genderEvidence đúng bậc, không cần chờ chắc tuyệt đối. Nhân vật đã có giới tính trong danh sách "đã biết" mà đại từ ngôi 3 rõ ràng ngược lại thì đặt correction.gender=true.\n`+
`- "genderEvidence": BẮT BUỘC có ở MỌI entry, khai bậc bằng chứng cao nhất của "gender": "trực tiếp" (bậc 1, hoặc đang giữ nguyên giới tính đã lưu sẵn trong danh sách "đã biết"), "ngoại hình" (bậc 2), "danh xưng" (bậc 3), "tên" (bậc 4), hoặc "không có" CHỈ khi isHuman=false. Đặt "gender" mâu thuẫn với đại từ ngôi 3/cách tự xưng bạn điền ở "narrRef"/xưng hô của CÙNG entry (VD gender "Nam" nhưng narrRef "nàng") là lỗi — hãy sửa cho khớp bằng chứng mạnh hơn.\n`+
`- "genderQuote": BẮT BUỘC cho bậc 1-3 khi nhân vật CHƯA có giới tính trong danh sách "đã biết". Chép NGUYÊN VĂN, đúng ngôn ngữ và từng ký tự của VĂN BẢN GỐC, 1 câu/đoạn ngắn (khoảng 4-30 chữ) nằm TRONG chương, sát chỗ nhắc tên nhân vật (trong vòng 1-2 câu), chứa đúng bằng chứng của bậc đã khai (bậc 1: 她/他, nàng/hắn; bậc 2: cụm mô tả ngoại hình chỉ giới; bậc 3: danh xưng/từ khen đẹp). Bậc 4 ("tên"), isHuman=false và nhân vật đã có giới tính trong "đã biết" thì để "genderQuote":"". `+
`Hệ thống sẽ TÌM LẠI câu trích và kiểm có từ chỉ giới tính khớp giới bạn khai; không kiểm được thì giới tính vẫn được giữ ở bậc 4 (~20%) chứ không mất; riêng câu trích chỉ giới NGƯỢC với giới đã khai thì bị bỏ hẳn.\n`+
    `- HAI NHÂN VẬT KHÁC NHAU CÙNG TÊN: nếu danh sách "đã biết" có 2 entry trùng "name" (hoặc 1 entry đã biết + 1 người mới cùng tên) nhưng KHÁC GIỚI TÍNH (VD 1 nam 1 nữ cùng tên "Tiểu Vũ"), đó là 2 NGƯỜI RIÊNG — dùng đúng "name" đã có và đặt "gender" ĐÚNG giới tính của từng người để hệ thống ghép vào đúng record; TUYỆT ĐỐI KHÔNG gộp 2 người khác giới vào 1 entry và KHÔNG đặt họ vào "merges". `+
    `Nếu chương này chỉ nhắc tới 1 trong 2 người mà chưa đủ bằng chứng biết là người nào, để "gender":"Chưa rõ" thay vì đoán.\n`+
    `- TÊN GỐC KHÁC NHAU NHƯNG PHIÊN ÂM RA CÙNG 1 TÊN: mỗi nhân vật đã biết có thể kèm "originalName" (cách viết gốc đã lưu). Nếu nhân vật trong chương có "originalName" KHÁC HẲN mọi originalName/aliases của record mang cùng "name" (VD 李明 và 黎明 cùng phiên âm ra "Lê Minh"), đó là NGƯỜI KHÁC — TUYỆT ĐỐI KHÔNG dùng chung record/name đó. `+
    `Nếu danh sách đã biết có record khác (thường có hậu tố "(2)") mang đúng originalName này thì dùng ĐÚNG "name" của record đó; nếu chưa có, cứ trả "name" phiên âm bình thường cùng "originalName" — hệ thống tự tách record riêng và thêm hậu tố, KHÔNG tự thêm hậu tố. Chỉ coi là cùng người khi originalName trùng, hoặc là biệt danh/cách gọi tắt/cách viết khác của đúng tên gốc đã lưu.\n`+
    `- NHÂN VẬT CHÍNH dùng làm mốc tính "relationship" đã được nêu rõ ở đầu prompt này (mục "NHÂN VẬT CHÍNH của truyện..." hoặc mục tự suy luận nếu chưa xác định) — `+
    `luôn dùng ĐÚNG người đó, không tự đổi sang người khác dù chương này người đó ít xuất hiện. Ghi relationship NGẮN GỌN theo mốc đó `+
    `(VD "Phụ thân", "Sư tỷ" — không ghi thêm "của nhân vật chính"). KHÔNG tự gắn nhãn "chính"/"bản thân" cho field relationship của chính nhân vật chính đó, `+
    `cũng KHÔNG ghi "nhân vật chính" vào "note" — đã có field riêng "isProtagonist" cho việc này (xem ngay dưới đây). `+
    `Với CHÍNH nhân vật chính, "relationship" để "Chưa rõ" nếu không có quan hệ nào khác cần ghi; chỉ dùng người đó làm mốc tham chiếu khi ghi relationship cho NHỮNG NGƯỜI KHÁC.\n`+
    `- "isProtagonist": BẮT BUỘC có ở MỌI entry. Đặt true cho ĐÚNG nhân vật đang được dùng làm MỐC nhân vật chính ở đầu prompt này `+
    `(nếu mục đó đã nêu tên cụ thể thì chính là người đó — kể cả khi chương này người đó xuất hiện ít; nếu chưa xác định thì là người kể chuyện ngôi thứ nhất / nhân vật trung tâm mà bạn vừa tự suy luận ra làm mốc). `+
    `TẤT CẢ nhân vật còn lại BẮT BUỘC đặt false — kể cả nhân vật rất quan trọng, nam/nữ chính phụ, hay người xuất hiện nhiều nhất chương này, nếu họ không phải cái mốc nói trên. `+
    `Mỗi lượt trả về nhiều nhất 1 entry có "isProtagonist":true. Hệ thống KHÔNG đánh dấu ngay chỉ vì 1 lượt — chỉ đánh dấu khi nhiều chương khác nhau cùng chỉ về 1 người, nên cứ trả lời trung thực theo đúng mốc, không cần dè dặt.\n`+
    `- Nếu bản gốc gọi cùng 1 nhân vật bằng 2 tên khác nhau ở 2 chỗ khác nhau trong CÙNG chương này (VD lỗi biên tập/dịch thô: "Ryan" và "Lai Ân" chỉ cùng 1 người) `+
    `và có đủ ngữ cảnh để khẳng định chắc chắn, chỉ trả về MỘT entry duy nhất dùng tên xuất hiện nhiều/rõ nghĩa hơn. Nếu không chắc chắn, coi là 2 nhân vật riêng — không đoán mò.\n`+
    `- Nếu không có nhân vật nào đủ rõ ràng, trả về {"characters":[]}.\n\n`+
    `Danh sách nhân vật đã biết từ trước, có kèm "aliases" là các tên gọi khác của CÙNG một người `+
    `(nếu nhân vật trong chương khớp với tên chính hoặc bất kỳ alias nào, hãy dùng ĐÚNG "name" chính này, `+
    `không tạo tên mới/biến thể; CHỈ liệt kê lại y nguyên, không cần suy luận lại, đối với những nhân vật đã có sẵn giá trị gender/relationship KHÁC "Chưa rõ"; `+
    `còn nhân vật nào trong danh sách này đang là "Chưa rõ" thì vẫn PHẢI cố gắng suy luận lại từ nội dung chương hiện tại, vì có thể chương này mới cung cấp đủ bằng chứng. `+
    `RIÊNG với nhân vật có "needsTranslation":true — nghĩa là "name" đang lưu VẪN CÒN SÓT chữ Hán/Trung Quốc chưa dịch — quy tắc "dùng lại y nguyên tên đã có" Ở TRÊN KHÔNG ÁP DỤNG cho riêng field "name" của nhân vật đó: `+
    `BẮT BUỘC phải dịch "name" sang Hán Việt (hoặc phục hồi tên phương Tây gốc nếu đúng là tên âm dịch — xem quy tắc "name" bên dưới) ngay trong lượt này, TUYỆT ĐỐI KHÔNG trả về lại y hệt chữ Hán đã có trong "name" của danh sách đã biết này, dù các field khác (gender/relationship/...) vẫn giữ nguyên như hướng dẫn. `+
    `RIÊNG với nhân vật có "placeholderName":true — nghĩa là "name" đang lưu CHỈ LÀ NHÃN MÔ TẢ TẠM do lượt trước tự đặt khi chưa biết tên thật (VD "Nữ sinh tóc đen", "Thanh niên tóc vàng", "Tài xế xe buýt") — quy tắc "dùng lại y nguyên tên đã có" cũng KHÔNG áp dụng cho riêng field "name" của nhân vật đó: `+
    `nếu chương này lộ ra tên gọi thật của người đó (họ tên đầy đủ hoặc tên riêng thật — biệt danh, tên gọi tắt khác KHÔNG tính), BẮT BUỘC trả về TÊN THẬT đã phiên âm Hán Việt ở field "name" kèm "isPlaceholderName":false, và ghi nhãn mô tả cũ đó vào "note" nếu nó là đặc điểm nhận dạng hữu ích. `+
    `Để hệ thống ghép đúng vào record cũ, khi làm việc này BẮT BUỘC điền "originalName" bằng chữ gốc của tên thật đó và nêu rõ trong "note" rằng đây chính là người trước đây được gọi bằng nhãn mô tả kia. `+
    `Nếu chương này VẪN chưa lộ tên thật, giữ nguyên y hệt nhãn mô tả cũ và để "isPlaceholderName":true — TUYỆT ĐỐI KHÔNG tự đổi sang một nhãn mô tả khác (VD từ "Thanh niên tóc vàng" sang "Gã tóc vàng"), vì như vậy sẽ tạo ra nhân vật trùng lặp:\n`+
    (known.length?JSON.stringify(known):'(chưa có dữ liệu)')+`\n\n`+
    `LƯU Ý ĐỊNH DẠNG: các giá trị "addrThemToMc"/"addrMcToThem" trong danh sách "đã biết" ở trên chỉ là chuỗi rút gọn kiểu "tự xưng/gọi đối phương" để bạn THAM KHẢO ngữ cảnh đã lưu trước đó — `+
    `khi TRẢ VỀ kết quả mới cho 2 field này trong "characters" bên dưới, BẮT BUỘC dùng đúng định dạng MẢNG OBJECT có cấu trúc rõ ràng như hướng dẫn chi tiết đã nêu ở trên, TUYỆT ĐỐI KHÔNG trả về dạng chuỗi "self/other" cũ.`;
  return sys+`\n\n---\n`+chapterTextForAnalysis+`\n\n---\nHãy trả JSON theo đúng yêu cầu ở trên.`;
}

// ===== CHUẨN HOÁ SCHEMA CÓ CẤU TRÚC (model trả về) VỀ CHUỖI LƯU TRỮ NỘI BỘ (bằng code JS thuần) =====
function normKey(s){return (s||'').trim().toLowerCase();}
// Model giờ trả addrThemToMc/addrMcToThem dưới dạng MẢNG OBJECT {self, callsMc|callsThem} (xem
// buildCharExtractPrompt) — tách self/other RÕ RÀNG ngay từ lúc sinh ra, không còn phải suy luận từ
// dấu "/" trong 1 chuỗi tự do. Hàm này chuyển mảng object đó về ĐÚNG định dạng chuỗi "self/other,
// self2/other2..." mà toàn bộ phần còn lại của hệ thống (lưu trữ, modal sửa, prompt dịch,
// splitAddrCandidates/parseAddrChoice...) đang dùng — nhờ vậy chỉ cần đổi CÁCH MODEL SINH RA dữ
// liệu, không phải viết lại toàn bộ pipeline lưu trữ/hiển thị đã có.
// otherKey: 'callsMc' (dùng cho addrThemToMc) hoặc 'callsThem' (dùng cho addrMcToThem).
// ===== VALIDATOR XƯNG HÔ: CẤM TÊN RIÊNG TRONG CẶP "tự xưng/gọi đối phương" =====
// Lỗi gốc: model chép tên nhân vật vào callsMc/callsThem (VD "tôi/Tô Nhàn") -> bản dịch xưng "tôi" nhưng gọi đối phương bằng tên.
// Cặp xưng hô CHỈ gồm đại từ/từ xưng hô. Tên (kể cả "chị + tên") là việc của bước dịch khi nhắc tên, không nằm trong cặp.
// Kiểm 2 lớp: (1) vế trùng/chứa tên-biệt danh-tên gốc của MỌI nhân vật đã biết (bỏ nhân vật mang NHÃN TẠM như "Mẫu thân");
// (2) vế có từ VIẾT HOA chữ cái đầu mà không phải từ xưng hô quen thuộc (đại từ luôn viết thường) -> coi là tên mới chưa có trong danh sách.
const CHARMEM_ADDR_WORDS=new Set(('tôi ta tớ mình tao tui tụi em anh chị cô cậu bạn ông bà con mẹ má cha bố ba tía cụ chú bác dì thím mợ thầy ngài người ngươi mi mày hắn y nó gã thằng ả '
 +'huynh đệ muội tỷ ca đại nhị tam tứ lão phu nạp bần đạo tăng nô tài tì tỳ thiếp thần bệ hạ hoàng thượng vi hậu vương cung bổn bản tọa tôn thiếu gia tiểu thư công tử cô nương phu nhân nương tử quân '
 +'tướng công lang chàng nàng mẫu thân phụ nhi nữ sư phụ tôn đồ đệ tử tiền bối vãn các hạ tại hạ khanh trẫm ái phi nương nương điện chủ đại nhân thúc thẩm di cữu bá điệt bảo bối cưng em yêu '
 +'sếp quý khách chủ nhân tiên sinh lão gia bà bà gia ông ông ngoại nội nãi tổ cháu tôi tớ ngoại').split(/\s+/).filter(Boolean));
function _addrNk(x){return String(x==null?'':x).normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();}
let _addrNameCache={ref:null,len:-1,names:null};
function _addrKnownNames(){
  try{
    const arr=(typeof S!=='undefined'&&S&&Array.isArray(S.characters))?S.characters:[];
    if(_addrNameCache.ref===arr&&_addrNameCache.len===arr.length&&_addrNameCache.names&&Date.now()-(_addrNameCache.t||0)<3000)return _addrNameCache.names;
    const set=new Set();
    arr.forEach(c=>{
      if(!c||c.namePlaceholder)return;
      const add=n=>{const k=_addrNk(n);if(k&&k.length>=(containsCJK(k)?2:2)&&!CHARMEM_ADDR_WORDS.has(k))set.add(k);};
      add(c.name);
      (Array.isArray(c.aliases)?c.aliases:[]).forEach(add);
      try{(typeof charOrigNameList==='function'?charOrigNameList(c):[]).forEach(add);}catch(e){}
    });
    _addrNameCache={ref:arr,len:arr.length,names:set,t:Date.now()};
    return set;
  }catch(e){return new Set();}
}
// Trả về lý do nếu "token" (1 vế của cặp) KHÔNG phải đại từ xưng hô; '' nếu hợp lệ.
function addrTokenNameProblem(token,names){
  const raw=String(token==null?'':token).normalize('NFC').trim();
  names=names||_addrKnownNames();
  if(containsCJK(raw)){                                      // chữ Hán: giữ (tên/danh xưng sẽ dịch sau) TRỪ khi chứa tên gốc của 1 nhân vật (dịch xong sẽ thành "tôi/Tô Nhàn")
    for(const n of names){if(containsCJK(n)&&raw.indexOf(n)>=0)return _cmL('chứa tên gốc nhân vật "'+n+'"','contains a character\'s original name "'+n+'"');}
    return '';
  }
  if(!raw)return '';
  const k=_addrNk(raw).replace(/\s*\([^)]*\)\s*$/,'');          // bỏ chú thích cuối "(mỉa mai)"
  if(!k||CHARMEM_ADDR_WORDS.has(k))return '';
  if(names.has(k))return _cmL('trùng tên/biệt danh nhân vật','matches a character name/alias');
  const words=k.split(' ');
  for(const n of names){
    if(n.indexOf(' ')>=0){ if((' '+k+' ').indexOf(' '+n+' ')>=0)return _cmL('chứa tên nhân vật "'+n+'"','contains a character name "'+n+'"'); }
    else if(words.length>=2&&words.indexOf(n)>=0)return _cmL('chứa tên nhân vật "'+n+'"','contains a character name "'+n+'"');
  }
  const rawWords=raw.replace(/\s*\([^)]*\)\s*$/,'').split(/\s+/);
  for(const w of rawWords){
    if(/^[A-ZÀ-ỸĐ]/.test(w)&&!CHARMEM_ADDR_WORDS.has(_addrNk(w)))return _cmL('có từ viết hoa không phải đại từ ("'+w+'")','has a capitalized word that is not a pronoun ("'+w+'")');
  }
  return '';
}
// Cảnh báo cho chuỗi "a/b, c/d" (người dùng gõ tay trong modal): trả mảng mô tả vế có vấn đề. Chỉ CẢNH BÁO, không chặn.
function charmemAddrNameWarnings(text){
  const out=[],names=_addrKnownNames();
  String(text==null?'':text).split(/\s*,\s*/).forEach(pair=>{
    String(pair).split('/').forEach(tok=>{const r=addrTokenNameProblem(tok,names);if(r)out.push('"'+tok.trim()+'": '+r);});
  });
  return out;
}
function structuredAddrToString(raw,otherKey){
  if(typeof raw==='string')return raw; // model lỡ trả về chuỗi cũ (không tuân prompt) -> giữ nguyên, các hàm isAddrUnknown/splitAddrCandidates vẫn đọc được
  if(!Array.isArray(raw)||!raw.length)return 'Chưa rõ';
  const parts=raw.map(o=>{
    if(!o||typeof o!=='object')return '';
    let self=(o.self||'').toString().trim();
    let other=(o[otherKey]||'').toString().trim();
    if(!self&&!other)return '';
    // XƯNG HÔ ĐỊA PHƯƠNG (ba, má, tui, anh Hai...): chỉ dùng tiếng Việt chuẩn -> đổi sang từ chuẩn tương đương, không có thì bỏ cặp.
    if(typeof AddrPresets!=='undefined'&&AddrPresets&&typeof AddrPresets.regionalFix==='function'){
      const _a=AddrPresets.regionalFix(self),_b=AddrPresets.regionalFix(other);
      if((_a.regional&&!_a.standard)||(_b.regional&&!_b.standard)){console.log('[Luồng 1][Xưng hô] Bỏ cặp dùng từ địa phương: "'+self+'/'+other+'"');return '';}
      if(_a.regional||_b.regional){console.log('[Luồng 1][Xưng hô] Đổi từ địa phương sang chuẩn: "'+self+'/'+other+'" -> "'+_a.standard+'/'+_b.standard+'"');self=_a.standard;other=_b.standard;}
    }
    // KHÔNG còn bỏ lựa chọn xưng hô chỉ vì còn sót chữ Hán: xưng hô đã XÁC ĐỊNH được hay chưa không phụ
    // thuộc việc tên (vd tên người được gọi) còn là chữ Hán hay đã dịch — phần tên Hán sẽ được dịch sau
    // bằng các bước dịch tên riêng. Trước đây bỏ hẳn lựa chọn -> xưng hô trống suốt nhiều chương đầu.
    // Chỉ log (không warn) để còn theo dõi; log dạng chuỗi để copy từ Console không bị "Object".
    if(containsCJK(self)||containsCJK(other)){
      console.log('[CharMem] Giữ lựa chọn xưng hô còn chữ Hán (tên sẽ dịch sau): self="'+self+'" other="'+other+'"');
    }
    // CẤM TÊN RIÊNG: vế nào dính tên nhân vật thì loại CẢ cặp (không giữ nửa cặp) — xem addrTokenNameProblem.
    const _names=_addrKnownNames();
    const _p1=addrTokenNameProblem(self,_names),_p2=addrTokenNameProblem(other,_names);
    if(_p1||_p2){
      console.log('[Luồng 1][Xưng hô] Bỏ cặp dính tên riêng: "'+self+'/'+other+'" ('+(_p1||_p2)+')');
      return '';
    }
    if(self&&other)return `${self}/${other}`;
    return other||self; // chỉ biết 1 phần -> ghi đúng phần đó, không bịa phần còn lại
  }).filter(Boolean).filter((x,i,arr)=>arr.indexOf(x)===i);   // bỏ trùng (VD "con/ba" và "con/bố" cùng thành "con/bố")
  return parts.length?parts.join(', '):'Chưa rõ';
}
// Chuyển 1 entry "characters" thô từ model (schema có cấu trúc) về dạng mà mergeAnalysisResults/
// applyCharField đang mong đợi (addrThemToMc/addrMcToThem là CHUỖI) — gọi ngay sau khi parse JSON,
// trước khi chạy heuristic nghi vấn hay merge vào S.characters. addrEvidence/addrTone giữ nguyên
// để detectAddrSuspicion bên dưới dùng.
// Chuẩn hoá giới tính về ĐÚNG 3 giá trị chuẩn 'Nam' | 'Nữ' | 'Chưa rõ'. Trước đây gender model trả về được
// lưu NGUYÊN VĂN (chỉ .normalize('NFC')), nên "nam"/"Nữ giới"/"Male" bị coi là 1 giá trị KHÁC "Nam"/"Nữ"
// khi so sánh bằng === (VD 2 nhân vật cùng là nam nhưng bị coi là "khác giới" -> chặn gộp oan, hoặc
// ngược lại tách oan). Giá trị lạ/mơ hồ ("Nam/Nữ", "Không xác định"...) -> 'Chưa rõ' (thà không biết còn
// hơn lưu bừa: giới tính lưu lần đầu sẽ bị khoá rất lâu và dùng để quyết định có gộp 2 nhân vật hay không).
function normalizeGenderValue(g){
  const t=(g==null?'':String(g)).normalize('NFC').trim().toLowerCase();
  if(!t)return 'Chưa rõ';
  if(['nam','nam giới','male','m','man','boy','con trai','đàn ông'].includes(t))return 'Nam';
  if(['nữ','nu','nữ giới','female','f','woman','girl','con gái','phụ nữ'].includes(t))return 'Nữ';
  return 'Chưa rõ';
}
// Các từ trong CHÍNH entry vừa trích xuất (narrRef + từ tự xưng/được gọi) mang sắc thái giới tính RÕ RÀNG
// NGƯỢC với `gender` model khai trong cùng entry -> model tự mâu thuẫn với chính output của nó, gender đó
// không đáng tin để lưu lần đầu/để quyết định tách-gộp nhân vật. Trả về mảng mô tả các từ mâu thuẫn.
// [Mục 2.4] Khi `gender` chưa rõ mà `f.genderHint` (tầng yếu) có giá trị thì so với hint, để bắt ca như narrRef "nàng" mà hint là Nam.
function genderHintConflicts(f,gender){
  let g=normalizeGenderValue(gender),tag='';
  if(g==='Chưa rõ'&&f){
    const h=normalizeGenderValue(f.genderHint);
    if(h!=='Chưa rõ'){g=h;tag='so với hint '+h+': ';}
  }
  if(g==='Chưa rõ'||!f)return [];
  const out=[];
  if(!isNarrRefUnknown(f.narrRef)){
    splitAddrCandidates(f.narrRef).forEach(cand=>{
      const h=narrRefGenderHint(cand);
      if(h&&h!==g)out.push(`${tag}narrRef "${cand}" (${h})`);
    });
  }
  [...collectCharSelfTerms(f.addrThemToMc,'self'),...collectCharSelfTerms(f.addrMcToThem,'other')].forEach(term=>{
    const h=selfAddrGenderHint(term);
    if(h&&h!==g)out.push(`${tag}xưng hô "${term}" (${h})`);
  });
  return out;
}
// `f` (entry vừa trích) và `existing` (record tìm theo tên) có phải 2 NGƯỜI KHÁC NHAU cùng tên theo ĐÚNG quy tắc
// tách của mergeAnalysisResults không: cả 2 giới tính đã xác định và khác nhau, model không đính chính
// (correction.gender), không khai "suy đoán" và không tự mâu thuẫn với narrRef/xưng hô. Dùng để detectAddrSuspicion
// coi entry này là người MỚI (existing=null) thay vì so nhầm với dữ liệu của người kia (sinh pendingCorr giả và
// các lượt xác minh thừa).
function isDifferentPersonByGender(f,existing){
  if(!f||!existing)return false;
  const corr=(f.correction&&typeof f.correction==='object')?f.correction:{};
  if(corr.gender)return false;
  const ge=(f.genderEvidence||'').toString().normalize('NFC').trim().toLowerCase();
  if(ge==='suy đoán'||ge==='ngoại hình'||ge==='danh xưng'||ge==='tên')return false;
  const fg=normalizeGenderValue(f.gender),eg=normalizeGenderValue(existing.gender);
  if(fg==='Chưa rõ'||eg==='Chưa rõ'||fg===eg)return false;
  return genderHintConflicts(f,fg).length===0;
}
// ===== KIỂM CHỨNG GIỚI TÍNH BẰNG CODE (genderQuote) =====
// Model hay khai genderEvidence="trực tiếp" chỉ vì TÊN nghe giống nam/nữ. Nay giới tính LẦN ĐẦU được lưu phải kèm 1 câu trích
// NGUYÊN VĂN (genderQuote) mà code kiểm được: (1) có thật trong chương, (2) nằm gần 1 lần nhắc tên nhân vật, (3) chứa từ chỉ giới
// tính đúng giới đã khai và KHÔNG chứa từ của giới ngược lại. Không đạt -> coi là chưa có bằng chứng (giữ "Chưa rõ").
const CHARMEM_GENDER_MARK_F_CJK=['她','少妇','妇人','美妇','贵妇','老妇','寡妇','老妪','道姑','尼姑','女冠','仙姑','圣女','女侠','侍女','婢女','师太','王妃','太后','郡主','母亲','妈妈','娘亲','姐姐','姐','妹妹','妹','姑娘','小姐','夫人','太太','女儿','女人','女子','少女','女孩','妻子','奶奶','婆婆','阿姨','姨','公主','皇后','娘娘','师姐','师妹','女','母親','媽媽','娘親','女兒','師姐','師妹'];
const CHARMEM_GENDER_MARK_M_CJK=['他','道长','道士','老道','和尚','老僧','大汉','壮汉','汉子','老头','老翁','老叟','书生','少侠','大侠','太监','国王','皇子','太子','王爷','道長','老僧','父亲','爸爸','爹','哥哥','哥','弟弟','弟','公子','先生','少爷','兄','儿子','男人','男子','少年','男孩','丈夫','爷爷','大叔','叔叔','王子','皇帝','师兄','师弟','男','父親','兒子','爺爺','少爺','師兄','師弟'];
const CHARMEM_GENDER_MARK_F_LATIN=['nàng','thiếu phụ','phụ nhân','mỹ phụ','quý phụ','lão bà','bà lão','đạo cô','ni cô','sư cô','sư thái','tiên tử','thánh nữ','nữ hiệp','nữ nhân','nữ tử','quả phụ','vương phi','thái hậu','quận chúa','thiếu nữ','cô ấy','cô ta','thị','bà','mẹ','chị','em gái','cô nương','tiểu thư','phu nhân','mẫu thân','tỷ tỷ','muội muội','she','her','hers','herself','mother','sister','woman','girl','lady','wife'];
const CHARMEM_GENDER_MARK_M_LATIN=['hắn','đạo trưởng','đạo sĩ','lão đạo','hòa thượng','hoà thượng','lão tăng','hán tử','đại hán','tráng hán','nam nhân','nam tử','lão đầu','ông lão','thư sinh','thiếu hiệp','đại hiệp','thái giám','quốc vương','hoàng tử','thái tử','vương gia','anh ta','gã','ông','cha','bố','anh trai','công tử','thiếu gia','phụ thân','ca ca','đệ đệ','he','his','him','himself','father','brother','man','boy','husband','gentleman'];
function _gmHas(textLow,list){
  return list.some(m=>{
    if(containsCJK(m))return textLow.includes(m);
    const rx=new RegExp('(^|[^\\p{L}\\p{N}])'+m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\p{N}])','u');
    return rx.test(textLow);
  });
}
// Câu trích có chứa từ chỉ giới tính đúng 1 phía không. Trả 'Nam' | 'Nữ' | '' (không có/không rõ ràng/lẫn cả hai).
// 'y' (= "hắn" trong tiếng Việt cổ) trùng với từ thường gặp của ngôn ngữ khác (Tây Ban Nha 'y' = và, Pháp 'il y a' = có) -> KHÔNG nằm trong bảng
// dùng chung; chỉ tính khi chính câu đang xét có chữ mang dấu RIÊNG của tiếng Việt (ơ, ư và các nguyên âm có dấu chấm/móc).
const CHARMEM_GENDER_MARK_M_VI_ONLY=['y'];
const CHARMEM_VI_ONLY_RX=/[ơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/;
function _genderMarks(t){
  const isVi=CHARMEM_VI_ONLY_RX.test(t);
  const f=_gmHas(t,CHARMEM_GENDER_MARK_F_CJK)||_gmHas(t,CHARMEM_GENDER_MARK_F_LATIN);
  const m=_gmHas(t,CHARMEM_GENDER_MARK_M_CJK)||_gmHas(t,CHARMEM_GENDER_MARK_M_LATIN)||(isVi&&_gmHas(t,CHARMEM_GENDER_MARK_M_VI_ONLY));
  return {f,m};
}
function genderOfQuote(q){
  const t=String(q||'').normalize('NFC').toLowerCase();
  const {f,m}=_genderMarks(t);
  return f&&!m?'Nữ':m&&!f?'Nam':'';
}
// Bản theo ngôn ngữ nguồn: bảng dùng chung (Hán/Việt/Anh) có từ chỉ giới thì giữ nguyên kết quả cũ (kể cả lẫn 2 giới -> ''); CHỈ KHI không có từ nào
// mới hỏi bảng đại từ của ngôn ngữ đó (genderTierOfQuote: es/pt/ru... qua cấu hình 'generic' hoặc CHARMEM_GENDER_LANG_EXTRA).
function genderOfQuoteLang(q,lang){
  const t=String(q||'').normalize('NFC').toLowerCase();
  const {f,m}=_genderMarks(t);
  if(f||m)return f&&!m?'Nữ':m&&!f?'Nam':'';
  return genderTierOfQuote(t,lang).g;
}

// ===== [GIỚI TÍNH 3 MỨC] 1: đại từ ngôi 3 (KHOÁ) | 2: ngoại hình (nhãn suy đoán) | 3: danh xưng/từ khen đẹp (nhãn suy đoán) =====
// Không bao giờ suy đoán theo TÊN. Mức 2-3 chỉ ghi vào genderHint (kèm genderHintSource='appearance'|'title'); khi đại từ ngôi 3
// cộng dồn qua các chương cho kết luận thì: cùng giới -> KHOÁ thành gender, ngược giới -> sửa lại theo đại từ.
// XỬ LÝ THEO NGÔN NGỮ NGUỒN: có cấu hình RIÊNG cho zh (Trung) / ja (Nhật) / en (Anh); mọi ngôn ngữ khác dùng cấu hình 'generic'
// (bảng đại từ chỉ gồm các cặp không nhập nhằng + tiếng Việt; mức 2-3 tin mức model tự khai nhưng bắt buộc câu trích có thật và nằm gần tên).
// Thêm ngôn ngữ mới: gán vào CHARMEM_GENDER_LANG_EXTRA[<mã>] một cấu hình cùng dạng và sửa charmemDetectLang trả về mã đó.
const CHARMEM_PRON_NOISE=/其他|他们|她们|他人|他乡|他处|他日|他方|他国|他杀|他們|她們/g;
const CHARMEM_JA_NOISE=/彼ら|彼氏|彼方|彼女たち|彼女達|彼女ら/g;
const CHARMEM_GENDER_LANG={
  zh:{mode:'char',sub:true,term:'。！？!?',win:70,quote:/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g,pronM:['他'],pronF:['她'],
    tiers:{
      T1M:['他'],T1F:['她'],
      T2M:['男子','男人','汉子','大汉','壮汉','男孩','少年','胡须','胡子','络腮胡'],
      T2F:['女子','女人','少女','女孩','妇人','少妇','姑娘','长裙','红唇'],
      T3M:[],
      T3F:['美人','佳人','绝色','貌美','漂亮','美丽','美麗','清秀','窈窕','婀娜','妩媚','娇俏','倾国倾城','国色天香','柳眉','杏眼','朱唇']
    }},
  ja:{mode:'ja',sub:true,term:'。！？!?',win:70,quote:/「[^」]*」|『[^』]*』|“[^”]*”|"[^"\n]*"/g,
    tiers:{
      T1M:['彼'],T1F:['彼女'],   // 彼女 chứa 彼 -> xử lý riêng ở genderTierOfQuote/_count
      T2M:['男性','男の人','男の子','少年','青年','髭','ひげ','口髭','顎髭','ヒゲ'],
      T2F:['女性','女の人','女の子','少女','スカート','ワンピース','口紅','ドレス'],
      T3M:['ハンサム','イケメン','紳士'],
      T3F:['美人','美少女','美女','綺麗','きれい','美しい','麗しい','可憐','お嬢様','令嬢','奥様','姫君']
    }},
  en:{mode:'word',sub:false,term:'.!?',win:110,quote:/“[^”]*”|"[^"\n]*"/g,pronM:['he','himself'],pronF:['she','herself'],   // đếm chỉ đại từ CHỦ NGỮ (him/her tân ngữ hay chỉ người khác)
    tiers:{
      T1M:['he','him','his','himself'],T1F:['she','her','hers','herself'],
      T2M:['man','men','boy','beard','mustache','moustache','stubble','gentleman'],
      T2F:['woman','women','girl','dress','skirt','lipstick'],
      T3M:['handsome','sir','mister','mr','lord'],
      T3F:['beautiful','gorgeous','stunning','graceful','madam','mrs','lady']
    }},
  generic:{mode:'word',sub:false,term:'.!?。！？…',win:110,quote:/“[^”]*”|«[^»]*»|„[^“]*“|「[^」]*」|"[^"\n]*"/g,
    pronM:['hắn','gã','anh ta','él','ele','он'],pronF:['nàng','cô ta','cô ấy','ella','ela','она'],   // chỉ các từ không nhập nhằng giữa các ngôn ngữ (vi/es/pt/ru)
    tiers:{
      T1M:['hắn','gã','anh ta','él','ele','он'],T1F:['nàng','cô ta','cô ấy','ella','ela','она'],
      T2M:['nam tử','nam nhân','đàn ông','chàng trai','râu','chòm râu','ria mép','râu quai nón'],
      T2F:['nữ tử','nữ nhân','phụ nữ','thiếu nữ','cô gái','váy dài','váy','son môi','môi son'],
      T3M:[],
      T3F:['xinh đẹp','mỹ nhân','giai nhân','tuyệt sắc','diễm lệ','kiều diễm','yêu kiều','duyên dáng','thướt tha','mày liễu','đẹp như hoa']
    }}
};
const CHARMEM_GENDER_LANG_EXTRA={};   // người dùng tự thêm: CHARMEM_GENDER_LANG_EXTRA.ko={...cùng dạng...}
function charmemLangCfg(lang){return CHARMEM_GENDER_LANG[lang]||CHARMEM_GENDER_LANG_EXTRA[lang]||CHARMEM_GENDER_LANG.generic;}
// Đoán ngôn ngữ nguồn theo bảng chữ + vài từ chức năng. Trả 'zh' | 'ja' | 'en' | 'generic'.
function charmemDetectLang(text){
  const t=String(text||'').slice(0,4000);
  let han=0,kana=0,lat=0;
  for(const ch of t){
    const c=ch.codePointAt(0);
    if(c>=0x4e00&&c<=0x9fff)han++;
    else if(c>=0x3040&&c<=0x30ff)kana++;
    else if((c>=65&&c<=90)||(c>=97&&c<=122)||(c>=0xc0&&c<=0x24f)||(c>=0x1e00&&c<=0x1eff))lat++;
  }
  if(kana>=10&&kana>=han*0.15)return 'ja';
  if(han>=30&&han>=lat)return 'zh';
  if(lat>=60&&han+kana<lat*0.05){
    const hits=(t.match(/\b(the|and|was|she|he|his|her|that|with)\b/gi)||[]).length;
    if(hits/(lat/5)>=0.12)return 'en';
  }
  return 'generic';
}
function _gmHasLang(t,list,sub){
  if(!list||!list.length)return false;
  return list.some(m=>{
    if(sub)return t.includes(m);
    return new RegExp('(?<![\\p{L}\\p{N}])'+m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','iu').test(t);
  });
}
// Trả {g:'Nam'|'Nữ'|'', tier:1|2|3|0}: mức bằng chứng CAO NHẤT mà câu trích có (mỗi mức phải chỉ 1 giới; lẫn 2 giới -> không rõ).
function genderTierOfQuote(q,lang){
  const cfg=charmemLangCfg(lang);
  let t=String(q||'').normalize('NFC').toLowerCase();
  if(lang==='zh')t=t.replace(CHARMEM_PRON_NOISE,'');
  if(cfg.mode==='ja')t=t.replace(CHARMEM_JA_NOISE,'');   // 彼ら/彼女たち (số nhiều)/彼氏... không phải đại từ ngôi 3 số ít
  const T=cfg.tiers||{};
  for(let tier=1;tier<=3;tier++){
    let m,f;
    if(tier===1&&cfg.mode==='ja'){
      const t1=t.replace(CHARMEM_JA_NOISE,'');
      f=t1.includes('彼女');m=t1.split('彼女').join('').includes('彼');
    }else{
      m=_gmHasLang(t,T['T'+tier+'M'],cfg.sub);f=_gmHasLang(t,T['T'+tier+'F'],cfg.sub);
    }
    if(m&&f)return {g:'',tier:0};
    if(m||f)return {g:m?'Nam':'Nữ',tier};
  }
  const og=genderOfQuote(t);   // danh xưng cũ (tiểu thư, công tử, phu nhân...) -> mức 3
  return og?{g:og,tier:3}:{g:'',tier:0};
}
function charmemTierSrc(tier){return tier===1?'pronoun-weak':tier===2?'appearance':'title';}
function charmemGenderHintRank(src){const r={'pronoun-count':0,'pronoun-weak':1,'appearance':2,'title':3,'name':4};return r[src]!==undefined?r[src]:4;}
// Độ chắc chắn của giới tính theo bậc bằng chứng: 1 đại từ ngôi 3 = 100% (khoá) | 2 ngoại hình = 70% | 3 danh xưng/từ khen đẹp = 50% | 4 tên gốc = 20%.
// (pronoun-weak = mới 1 đại từ ngôi 3 chưa đủ khoá; pronoun-count = đã đối chiếu đếm đại từ trong văn bản gốc.)
const CHARMEM_GENDER_CONF={'pronoun-count':90,'pronoun-weak':85,'appearance':70,'title':50,'name':20,'model-guess':20};
// Giới tính HIỆU LỰC để hiển thị + gán ảnh: gender đã khoá thì dùng; chưa có thì dùng genderHint (nhãn suy đoán, mọi mức độ chắc chắn).
// Chỉ đọc, không ghi: gender vẫn là tầng KHOÁ (dùng cho gộp/tách record), hint vẫn tự được sửa/khoá khi có đại từ ngôi 3.
function charEffGender(c){
  if(!c)return 'Chưa rõ';
  const g=normalizeGenderValue(c.gender);
  if(g!=='Chưa rõ')return g;
  if(c.isHuman===false)return 'Chưa rõ';
  return normalizeGenderValue(c.genderHint);
}
function charmemGenderConf(c){
  if(!c)return 0;
  if(!isUnknownVal(c.gender))return 100;
  if(c.isHuman===false)return 0;
  if(normalizeGenderValue(c.genderHint)==='Chưa rõ')return 0;
  const v=CHARMEM_GENDER_CONF[c.genderHintSource];
  return v===undefined?20:v;
}
// Tìm câu trích trong văn bản (khớp chính xác rồi khớp mờ). Trả {qs,qe,src} (vị trí trong src đã NFC+lowercase) hoặc null.
function charmemQuoteLocate(raw,srcText){
  const src=String(srcText||'').normalize('NFC').toLowerCase();
  let key='';const map=[];
  for(let i=0;i<src.length;i++){if(/[\p{L}\p{N}]/u.test(src[i])){key+=src[i];map.push(i);}}
  const q=addrQuoteKey(String(raw||'').trim());
  if(q.length<(/[\u3040-\u30ff\u3400-\u9fff]/.test(raw||'')?4:8))return null;
  let at=key.indexOf(q),len=q.length;
  if(at===-1){
    const fz=charmemFuzzyFind(key,q,/[\u3040-\u30ff\u3400-\u9fff]/.test(raw||'')?0.4:0.25);
    if(!fz)return null;
    at=fz.start;len=fz.len;
  }
  return {qs:map[at],qe:map[at+len-1],src};
}
function charmemQuoteInSource(raw,srcText){return !!charmemQuoteLocate(raw,srcText);}
// Mức của câu trích cho entry f với giới tính đã khai fg. Ngôn ngữ 'generic' không có bảng từ mức 2-3 -> tin mức model tự khai
// ('ngoại hình'->2, 'danh xưng'/'trực tiếp'->3, KHÔNG BAO GIỜ tự khoá) nhưng câu trích phải có thật và nằm gần tên nhân vật.
function charmemQuoteTier(f,fg,srcText){
  const lang=charmemDetectLang(srcText);
  const tq=genderTierOfQuote(f&&f.genderQuote,lang);
  if(tq.tier>0||lang!=='generic'||(fg!=='Nam'&&fg!=='Nữ'))return tq;
  const ge=String((f&&f.genderEvidence)||'').normalize('NFC').trim().toLowerCase();
  if(ge!=='ngoại hình'&&ge!=='danh xưng'&&ge!=='trực tiếp')return tq;
  const loc=charmemQuoteLocate(f.genderQuote,srcText);
  if(!loc)return tq;
  let orig=[];try{orig=parseOrigNames(f.originalName)||[];}catch(e){}
  const names=[f.name,...orig,...(Array.isArray(f.nicknames)?f.nicknames:[]),f.sinoAlias]
    .map(v=>String(v||'').normalize('NFC').toLowerCase().trim()).filter(v=>v.length>=2);
  const R=250;
  const near=names.some(nm=>{let i=0,g=0;while(g++<200&&(i=loc.src.indexOf(nm,i))!==-1){if(i<=loc.qe+R&&i+nm.length>=loc.qs-R)return true;i+=nm.length;}return false;});
  return near?{g:fg,tier:ge==='ngoại hình'?2:3,generic:true}:tq;
}
function _charmemCountPron(w,cfg){
  const cnt=(x,k)=>x.split(k).length-1;
  if(cfg.mode==='char'){w=w.replace(CHARMEM_PRON_NOISE,'');return {m:cnt(w,'他'),f:cnt(w,'她')};}
  if(cfg.mode==='ja'){w=w.replace(CHARMEM_JA_NOISE,'');return {m:cnt(w.split('彼女').join(''),'彼'),f:cnt(w,'彼女')};}
  if(!cfg._rx){
    const mk=l=>new RegExp('(?<![\\p{L}\\p{N}])(?:'+(l||[]).map(m=>m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}])','giu');
    cfg._rx={m:mk(cfg.pronM),f:mk(cfg.pronF)};
  }
  return {m:(w.match(cfg._rx.m)||[]).length,f:(w.match(cfg._rx.f)||[]).length};
}
// Đếm đại từ ngôi 3 ngay sau mỗi lần nhắc tên (tối đa 2 câu / cfg.win ký tự; cắt ở xuống dòng, ở tên người khác, ở lần nhắc lại tên chính nó;
// bỏ lời thoại). Trả {m,f,name,lang}.
function genderFromPronounScan(names,srcText,otherNames){
  const lang=charmemDetectLang(srcText);
  const cfg=charmemLangCfg(lang);
  const out={m:0,f:0,name:'',lang};
  const src=String(srcText||'').normalize('NFC').replace(cfg.quote,x=>' '.repeat(x.length));
  const nms=(names||[]).map(v=>String(v||'').normalize('NFC').replace(/\s*\(\d+\)\s*$/,'').trim()).filter((v,i,a)=>v.length>=2&&v.length<=40&&a.indexOf(v)===i);
  if(!nms.length||!src)return out;
  const others=(otherNames||[]).filter(o=>!nms.some(n=>o===n||o.includes(n)||n.includes(o)));
  const wordy=cfg.mode==='word';
  const isL=ch=>!!ch&&/[\p{L}\p{N}]/u.test(ch);
  let best=null;
  for(const nm of nms){
    let m=0,f=0,at=0,g=0,occ=0;
    while(g++<200&&(at=src.indexOf(nm,at))!==-1){
      const from=at+nm.length;
      if(wordy&&(isL(src[at-1])||isL(src[from]))){at=from;continue;}   // "Tom" trong "Tomorrow" không tính
      occ++;
      let w=src.slice(from,from+(cfg.win||70));
      const nl=w.indexOf('\n');if(nl!==-1)w=w.slice(0,nl);
      let cnt=0;
      for(let k=0;k<w.length;k++){if(cfg.term.indexOf(w[k])!==-1&&++cnt===2){w=w.slice(0,k+1);break;}}
      let cut=w.length;
      for(const o of others){const p=w.indexOf(o);if(p!==-1&&p<cut)cut=p;}
      const pn=w.indexOf(nm);if(pn!==-1&&pn<cut)cut=pn;
      w=w.slice(0,cut);
      const c=_charmemCountPron(w,cfg);
      m+=c.m;f+=c.f;
      at=from;
    }
    if(occ&&(!best||(m+f)>(best.m+best.f)))best={m,f,name:nm};
  }
  if(best){out.m=best.m;out.f=best.f;out.name=best.name;}
  return out;
}
// Kết luận từ số đại từ CỘNG DỒN: >=2 cùng giới và 0 ngược giới; hoặc >=4 đại từ với >=85% cùng giới.
function charmemPronounVerdict(m,f){
  if(m>=2&&f===0)return 'Nam';
  if(f>=2&&m===0)return 'Nữ';
  const t=m+f;
  if(t>=4){if(m/t>=0.85)return 'Nam';if(f/t>=0.85)return 'Nữ';}
  return '';
}
function charmemPronounSubjectNames(c,f){
  let o=[];try{o=charOrigNameList(c)||[];}catch(e){}
  let fo=[];try{fo=parseOrigNames(f&&f.originalName)||[];}catch(e){}
  return [c&&c.name,...o,f&&f.name,...fo].filter(Boolean);
}
function charmemOtherNames(c){
  const set=new Set();
  (S.characters||[]).forEach(x=>{
    if(x===c)return;
    let o=[];try{o=charOrigNameList(x)||[];}catch(e){}
    [x.name,...o,...(x.aliases||[])].forEach(v=>{v=String(v||'').normalize('NFC').replace(/\s*\(\d+\)\s*$/,'').trim();if(v.length>=2&&v.length<=40)set.add(v);});
  });
  return [...set];
}
// [Sửa giới tính] Tìm gần đúng (khoảng cách sửa <= maxRatio*độ dài mẫu) mẫu `pat` trong `text` (cả hai đã là "khoá" bỏ dấu câu).
// Dùng khi model chép câu trích lệch vài chữ (phồn<->giản thể, bỏ/thêm 1-2 chữ) nên indexOf chính xác không thấy.
// Trả {start,len,dist} hoặc null. O(n*m), m bị chặn 200.
function charmemFuzzyFind(text,pat,maxRatio){
  const m=pat.length,n=text.length;
  if(!m||!n||m>200)return null;
  const maxEd=Math.floor(m*(maxRatio==null?0.25:maxRatio));
  let prevD=new Array(m+1),prevS=new Array(m+1),curD=new Array(m+1),curS=new Array(m+1);
  for(let i=0;i<=m;i++){prevD[i]=i;prevS[i]=0;}
  let best=null;
  for(let j=0;j<n;j++){
    curD[0]=0;curS[0]=j+1;
    const tc=text[j];
    for(let i=1;i<=m;i++){
      let d=prevD[i-1]+(pat[i-1]===tc?0:1),st=prevS[i-1];
      const d2=prevD[i]+1;if(d2<d){d=d2;st=prevS[i];}
      const d3=curD[i-1]+1;if(d3<d){d=d3;st=curS[i-1];}
      curD[i]=d;curS[i]=st;
    }
    if(curD[m]<=maxEd&&(!best||curD[m]<best.dist)){best={start:curS[m],len:j+1-curS[m],dist:curD[m]};}
    let t=prevD;prevD=curD;curD=t;t=prevS;prevS=curS;curS=t;
  }
  return best&&best.len>0?best:null;
}
// Trả {ok,why}. srcText = văn bản đã gửi cho model. Tên để kiểm "gần tên": name, originalName, nicknames, sinoAlias.
function verifyGenderQuote(f,gender,srcText){
  const raw=String((f&&f.genderQuote)||'').trim();
  if(!raw)return {ok:false,why:'không có genderQuote'};
  const src=String(srcText||'').normalize('NFC').toLowerCase();
  // Dựng khoá bỏ dấu câu/khoảng trắng kèm bản đồ vị trí gốc để biết câu trích nằm ở đâu.
  let key='';const map=[];
  for(let i=0;i<src.length;i++){if(/[\p{L}\p{N}]/u.test(src[i])){key+=src[i];map.push(i);}}
  const q=addrQuoteKey(raw);
  if(q.length<(containsCJK(raw)?4:8))return {ok:false,why:'genderQuote quá ngắn'};
  let at=key.indexOf(q),qlen=q.length,fuzzy=false;
  if(at===-1){
    const fz=charmemFuzzyFind(key,q,containsCJK(raw)?0.4:0.25); // chữ Hán: phồn/giản thể có thể lệch tới ~1/3 số chữ
    if(!fz)return {ok:false,why:'genderQuote không tìm thấy nguyên văn trong chương'};
    at=fz.start;qlen=fz.len;fuzzy=true;
  }
  const qs=map[at],qe=map[at+qlen-1];
  const _lang=charmemDetectLang(srcText);
  const qg=genderOfQuoteLang(raw,_lang);
  // Khớp mờ: đoạn THẬT trong chương cũng phải chứa từ chỉ giới đúng phía (không tin riêng câu model chép).
  if(fuzzy&&qg===gender){
    const sg=genderOfQuoteLang(src.slice(qs,qe+1),_lang);
    if(sg!==gender)return {ok:false,why:'genderQuote khớp mờ nhưng đoạn thật trong chương không có từ chỉ giới '+gender};
  }
  if(qg!==gender)return {ok:false,why:qg?`genderQuote chỉ giới ${qg}, lệch với ${gender}`:'genderQuote không chứa từ chỉ giới tính rõ ràng (hoặc lẫn cả 2 giới)'};
  const names=[f.name,...parseOrigNames(f.originalName),...(Array.isArray(f.nicknames)?f.nicknames:[]),f.sinoAlias]
    .map(v=>String(v||'').normalize('NFC').toLowerCase().trim()).filter(v=>v.length>=2);
  const R=250;
  const near=names.some(nm=>{
    let i=0,g=0;
    while(g++<200&&(i=src.indexOf(nm,i))!==-1){
      if(i<=qe+R&&i+nm.length>=qs-R)return true;
      i+=nm.length;
    }
    return false;
  });
  if(!near)return {ok:false,why:'genderQuote không nằm gần chỗ nhắc tên nhân vật (đại từ có thể chỉ người khác)'};
  return {ok:true,why:''};
}

// ===== GIỚI TÍNH TỪ TỪ CHỈ QUAN HỆ TRONG TÊN/QUAN HỆ ("Cha của X", "Mẫu thân của X", "Đại ca", "Sư tỷ"...) =====
// Từ chỉ quan hệ (cha/mẹ/anh/chị/sư huynh/sư tỷ...) KHÔNG phải tên riêng nên không có chuyện "tên nghe giống nam/nữ":
// giới tính do chính từ đó quyết định, không cần genderQuote/đại từ. Chỉ nhận khi từ chỉ quan hệ là TỪ ĐẦU của nhãn
// (trước "của" nếu có) và mọi từ khớp cùng 1 phía giới. Từ ngắn dễ là tên/đa nghĩa (ông, bà, cô, anh, chị...) chỉ nhận
// khi cả nhãn (hoặc phần trước "của") đúng bằng từ đó. Từ vai vế không chỉ giới (sư phụ, con, cháu, em, bạn...) không có trong bảng.
// Nguồn: name, nicknames, relationship (relationship luôn tính theo nhân vật chính). Trả {gender,label,why}.
const CHARMEM_KINSHIP_LONG={
  'Nam':['phụ thân','phụ vương','phụ hoàng','thân phụ','gia phụ','cha ruột','cha nuôi','cha dượng','cha vợ','cha chồng','bố ruột','bố nuôi','bố dượng','ông nội','ông ngoại','gia gia','tổ phụ','đại ca','nhị ca','tam ca','tứ ca','ca ca','huynh trưởng','đại huynh','nhị huynh','anh trai','anh ruột','anh rể','tỷ phu','đệ đệ','em trai','tiểu đệ','thúc thúc','bá phụ','bá bá','cữu cữu','cậu ruột','phu quân','trượng phu','lang quân','con trai','nhi tử','tôn tử','cháu trai','sư huynh','sư đệ','đại sư huynh','nhị sư huynh','tiểu sư đệ','biểu ca','biểu đệ','đường ca','đường đệ','nghĩa phụ','nghĩa huynh','nghĩa đệ','phu tử'],
  'Nữ':['mẫu thân','mẫu hậu','thân mẫu','gia mẫu','mẹ ruột','mẹ nuôi','mẹ kế','mẹ vợ','mẹ chồng','bà nội','bà ngoại','tổ mẫu','nãi nãi','đại tỷ','nhị tỷ','tam tỷ','tỷ tỷ','chị gái','chị ruột','chị dâu','muội muội','tiểu muội','em gái','di nương','nương tử','phu nhân','thê tử','nữ nhi','con gái','tôn nữ','cháu gái','sư tỷ','sư muội','đại sư tỷ','tiểu sư muội','biểu tỷ','biểu muội','đường tỷ','đường muội','tẩu tẩu','tẩu tử','nghĩa mẫu','nghĩa tỷ','nghĩa muội','thẩm thẩm']
};
const CHARMEM_KINSHIP_SUFFIX_RE={'Nam':/^\S+\s+(huynh|sư huynh|sư đệ|ca ca)$/,'Nữ':/^\S+\s+(tỷ|sư tỷ|sư muội|tỷ tỷ|muội muội)$/};
const CHARMEM_KINSHIP_SHORT={
  'Nam':['cha','bố','ba','ông','chú','bác','thúc','bá','cữu','dượng','chồng','huynh'],
  'Nữ':['mẹ','má','bà','cô','dì','di','thím','thẩm','chị','tỷ','muội','vợ','tẩu','nương','mợ']
};

// ===== GIỚI TÍNH TỪ DANH XƯNG/CHỨC DANH TỰ THÂN CHỈ GIỚI (thiếu phụ, đạo cô, đạo trưởng, hòa thượng, 少妇, 道长...) =====
// Khác genderFromKinship (chỉ từ quan hệ gia đình/sư môn): nhóm này là danh xưng/loại người mà bản thân từ đã quyết định giới
// (thiếu phụ = phụ nữ trẻ đã chồng, đạo cô = nữ đạo sĩ, đạo trưởng/hòa thượng = nam). Không cần genderQuote hay đại từ,
// vì từ này KHÔNG phải tên riêng nên không có chuyện "tên nghe giống nam/nữ".
// Nguồn: name, originalName, nicknames, sinoAlias, relationship (nhãn: từ chỉ giới ở ĐẦU hoặc CUỐI nhãn, trước "của"/"的") và note
// (chỉ mệnh đề ĐẦU TIÊN, từ ở ĐẦU mệnh đề — để "bị đạo trưởng X đánh bại" không bị gán cho người khác). Mâu thuẫn 2 giới -> bỏ.
const CHARMEM_ROLE_TERMS_F_CJK=['少妇','妇人','美妇','贵妇','老妇','寡妇','老妪','老太婆','道姑','尼姑','女冠','仙姑','圣女','女侠','侍女','婢女','师太','王妃','太后','郡主','新娘','妖女','魔女','女帝','女王'];
const CHARMEM_ROLE_TERMS_M_CJK=['道长','道長','道士','老道','和尚','老僧','大汉','壮汉','汉子','老头','老翁','老叟','书生','書生','少侠','大侠','太监','国王','皇子','太子','王爷'];
const CHARMEM_ROLE_TERMS_F_VI=['thiếu phụ','phụ nhân','mỹ phụ','quý phụ','lão bà','bà lão','đạo cô','ni cô','sư cô','sư thái','tiên tử','tiên cô','thánh nữ','nữ hiệp','nữ nhân','nữ tử','nữ tu','quả phụ','tân nương','vương phi','thái hậu','quận chúa','yêu nữ','ma nữ','nữ đế','nữ vương','tú bà'];
const CHARMEM_ROLE_TERMS_M_VI=['đạo trưởng','đạo sĩ','lão đạo','hòa thượng','hoà thượng','lão tăng','hán tử','đại hán','tráng hán','nam nhân','nam tử','lão đầu','ông lão','thư sinh','thiếu hiệp','đại hiệp','thái giám','quốc vương','hoàng tử','thái tử','vương gia'];
function _roleTermGender(text,mode){
  // mode 'label': từ ở đầu HOẶC cuối nhãn; mode 'note': từ phải ở ĐẦU mệnh đề. Trả {g,term} hoặc null.
  let t=String(text||'').normalize('NFC').toLowerCase().trim();
  if(!t)return null;
  t=t.replace(/^[\s"'“”‘’()\[\]\u27e6\u27e7:\-–]+|[\s"'“”‘’()\[\]\u27e6\u27e7:\-–]+$/g,'');
  if(containsCJK(t)){
    const head=t.split('的').pop();   // 少妇的丈夫 -> 丈夫 (danh từ trung tâm nằm SAU "的")
    const f=CHARMEM_ROLE_TERMS_F_CJK.find(k=>mode==='note'?head.startsWith(k):head.includes(k));
    const m=CHARMEM_ROLE_TERMS_M_CJK.find(k=>mode==='note'?head.startsWith(k):head.includes(k));
    if(f&&m)return {g:'?',term:f+'/'+m};
    return f?{g:'Nữ',term:f}:m?{g:'Nam',term:m}:null;
  }
  const head=t.split(/\s+của\s+/)[0].trim();
  if(!head)return null;
  const hit=k=>head===k||head.startsWith(k+' ')||(mode!=='note'&&head.endsWith(' '+k));
  let f=CHARMEM_ROLE_TERMS_F_VI.find(hit),m=CHARMEM_ROLE_TERMS_M_VI.find(hit);
  if(mode==='note'&&!f&&!m){   // mô tả kiểu "sư huynh của hòa thượng trẻ; ..." -> từ quan hệ-sư môn/gia đình ở đầu mệnh đề, chủ thể là vế TRƯỚC "của"
    const kh=k=>head===k||head.startsWith(k+' ');
    f=CHARMEM_KINSHIP_LONG['Nữ'].find(kh);m=CHARMEM_KINSHIP_LONG['Nam'].find(kh);
  }
  if(f&&m)return {g:'?',term:f+'/'+m};
  return f?{g:'Nữ',term:f}:m?{g:'Nam',term:m}:null;
}
function genderFromRoleTerms(f){
  const out={gender:'',label:'',why:''};
  if(!f)return out;
  const hits=[];
  const labels=[f.name,f.originalName,f.sinoAlias,...(Array.isArray(f.nicknames)?f.nicknames:[])];
  String(f.relationship||'').split(/[,;\/、]|\bhoặc\b/i).forEach(x=>labels.push(x));
  labels.forEach(raw=>{
    const r=_roleTermGender(raw,'label');
    if(r)hits.push({g:r.g,l:String(raw).trim(),term:r.term});
  });
  const firstClause=String(f.note||'').split(/[;；。\n]|\.\s/)[0];
  const rn=_roleTermGender(firstClause,'note');
  if(rn)hits.push({g:rn.g,l:firstClause.trim().slice(0,40),term:rn.term});
  if(!hits.length)return out;
  out.label=hits[0].l+' ('+hits[0].term+')';
  const gset=[...new Set(hits.map(x=>x.g))];
  if(gset.length>1||gset[0]==='?'){out.why='các danh xưng chỉ giới tính khác nhau ('+hits.map(x=>x.term+'='+x.g).join(', ')+')';return out;}
  out.gender=gset[0];
  return out;
}

function _genderFromKinshipBase(f){
  const out={gender:'',label:'',why:''};
  if(!f)return out;
  // Tên/biệt danh/quan hệ ở đích ≠ tiếng Việt không phải tiếng Việt: 'cha','ba','di','huynh'... có thể là TÊN RIÊNG (Hàn, pinyin) -> không so, không suy giới tính theo tên.
  if(charmemGeneric())return out;
  const labels=[f.name,...(Array.isArray(f.nicknames)?f.nicknames:[])];
  String(f.relationship||'').split(/[,;\/、]|\bhoặc\b/i).forEach(x=>labels.push(x));
  const hits=[];
  labels.forEach(raw=>{
    let t=String(raw||'').normalize('NFC').toLowerCase().trim().replace(/^[\s"'“”‘’()\[\]\u27e6\u27e7:\-–]+|[\s"'“”‘’()\[\]\u27e6\u27e7:\-–]+$/g,'');
    if(!t||containsCJK(t))return;
    const head=t.split(/\s+của\s+/)[0].trim();
    if(!head)return;
    for(const g of ['Nam','Nữ']){
      if(CHARMEM_KINSHIP_LONG[g].some(k=>head===k||head.startsWith(k+' '))||
         CHARMEM_KINSHIP_SHORT[g].some(k=>head===k)||CHARMEM_KINSHIP_SUFFIX_RE[g].test(head)){hits.push({g,l:String(raw).trim()});break;}
    }
  });
  if(!hits.length)return out;
  const gset=[...new Set(hits.map(x=>x.g))];
  out.label=hits[0].l;
  if(gset.length>1){out.why='các từ chỉ quan hệ chỉ giới tính khác nhau ('+hits.map(x=>x.l+'='+x.g).join(', ')+')';return out;}
  out.gender=gset[0];
  return out;
}

// Gói: thử từ chỉ quan hệ trước, không ra thì thử danh xưng/chức danh tự thân chỉ giới (genderFromRoleTerms).
function genderFromKinship(f){
  const k=_genderFromKinshipBase(f);
  if(k.gender||k.why)return k;
  return genderFromRoleTerms(f);
}

// ===== GIỚI TÍNH TỪ XƯNG HÔ TRỰC TIẾP + ĐẠI TỪ NGÔI 3 (narrRef) =====
// Ca gốc: nhân vật có xưng hô "ca ca/đệ đệ" và narrRef "hắn" nhưng gender vẫn "Chưa rõ" vì genderQuote/đếm 他 không đạt, còn
// các bảng xưng hô/narrRef cũ chỉ dùng để BẮT MÂU THUẪN (genderHintConflicts), chưa bao giờ dùng làm bằng chứng DƯƠNG.
// Chỉ nhận khi CẢ HAI nguồn độc lập cùng chỉ 1 giới và không có gì chỉ giới ngược:
//  (a) từ xưng hô/được gọi mang giới rõ ràng của CHÍNH nhân vật này: tự xưng (addrThemToMc.self) hoặc cách MC gọi họ
//      (addrMcToThem.other). KHÔNG dùng phần họ gọi MC (callsMc) vì đó là giới của MC.
//  (b) narrRef có đại từ ngôi 3 chỉ giới (hắn/nàng/...).
// Không nhận khi addrEvidence = "suy đoán". Chỉ dùng từ chắc chắn 1 giới, bỏ các từ dùng chung (ta, ngươi, huynh đệ...).
const CHARMEM_ADDR_KIN_GENDER={
  'Nam':['ca ca','đại ca','nhị ca','tam ca','tứ ca','huynh','đại huynh','nhị huynh','sư huynh','đệ đệ','tiểu đệ','sư đệ','phụ thân','phụ vương','gia gia','ông nội','ông ngoại','thúc thúc','bá bá','cữu cữu','cha','bố','bổn thiếu gia','bổn công tử'],
  'Nữ':['tỷ tỷ','đại tỷ','nhị tỷ','tam tỷ','sư tỷ','muội muội','tiểu muội','a muội','sư muội','mẫu thân','mẫu hậu','nãi nãi','bà nội','bà ngoại','cô cô','di di','thẩm thẩm','nương','thiếp','nô gia','mẹ','má','bổn cô nương']
};
function _addrKinGender(word){
  const w=normAddrWord(word);
  if(!w)return null;
  for(const g of ['Nam','Nữ']){if(CHARMEM_ADDR_KIN_GENDER[g].includes(w))return g;}
  return selfAddrGenderHint(w)||null;
}
function genderFromAddrNarr(f){
  const out={gender:'',label:'',why:''};
  if(!f)return out;
  const ev=(f.addrEvidence||'').toString().normalize('NFC').trim().toLowerCase();
  if(ev==='suy đoán')return out;
  const addrTerms=[...collectCharSelfTerms(f.addrThemToMc,'self'),...collectCharSelfTerms(f.addrMcToThem,'other')];
  const addrHits=addrTerms.map(t=>({t,g:_addrKinGender(t)})).filter(x=>x.g);
  const narrHits=isNarrRefUnknown(f.narrRef)?[]:splitAddrCandidates(f.narrRef).map(t=>({t,g:narrRefGenderHint(t)})).filter(x=>x.g);
  if(!addrHits.length||!narrHits.length)return out;     // cần đủ cả 2 nguồn
  const all=[...addrHits,...narrHits];
  const gset=[...new Set(all.map(x=>x.g))];
  if(gset.length>1){out.why='xưng hô và narrRef chỉ giới tính khác nhau ('+all.map(x=>x.t+'='+x.g).join(', ')+')';return out;}
  out.gender=gset[0];
  out.label='xưng hô \"'+addrHits.map(x=>x.t).join('/')+'\" + narrRef \"'+narrHits.map(x=>x.t).join('/')+'\"';
  return out;
}

// ===== GIỚI TÍNH TỪ ĐẠI TỪ SAU TÊN (dự phòng khi genderQuote không đạt) =====
// Chỉ chạy khi model ĐÃ khai giới tính L (trực tiếp) nhưng câu trích bị loại vì lý do hình thức (không có/quá ngắn/không tìm thấy/
// không chứa từ chỉ giới/lẫn cả 2 giới/không gần tên) — KHÔNG chạy khi câu trích chỉ giới NGƯỢC với L. Code tự đếm 他/她 trong
// 30 ký tự ngay sau mỗi lần nhắc tên gốc chữ Hán (cắt ở dấu kết câu), bỏ các từ dễ nhầm (其他, 他们, 她们, 他人...).
// Nhận khi đại từ cùng giới >= 2 và đại từ ngược giới = 0. Ít nhất 2 chỗ độc lập nên 1 đại từ lạc sang người khác không đủ.
// Trả {gender:'Nam'|'Nữ'|'', own, opp, name, why}.
function genderFromPronouns(f,L,srcText){
  const out={gender:'',own:0,opp:0,name:'',why:''};
  if(!f||(L!=='Nam'&&L!=='Nữ'))return out;
  const src=String(srcText||'').normalize('NFC');
  // Gồm cả tên đã dịch (f.name): khi giám khảo xếp tên gốc là proper, applyCharNameSubstitution đã thay chữ Hán bằng tên dịch
  // ở các chương sau nên chỉ tên dịch còn nguyên văn trong srcText. Vòng đếm vẫn tìm 他/她 ngay sau tên nên chạy được với tên chữ Việt.
  const names=[...parseOrigNames(f.originalName),...(Array.isArray(f.nicknames)?f.nicknames:[]),f.name]
    .map(v=>String(v||'').normalize('NFC').trim()).filter(v=>v.length>=2&&v.length<=12)
    .filter((v,i,a)=>a.indexOf(v)===i);
  if(!names.length){out.why='không có tên để đếm đại từ';return out;}
  const ownCh=L==='Nữ'?'她':'他',oppCh=L==='Nữ'?'他':'她';
  const noise=/其他|他们|她们|他人|他乡|他处|他日|他方|他国|他杀/g;
  let best=null;
  for(const nm of names){
    let own=0,opp=0,occ=0,at=0,guard=0;
    while(guard++<60&&(at=src.indexOf(nm,at))!==-1){
      occ++;
      let w=src.slice(at+nm.length,at+nm.length+30);
      const cut=w.search(/[。！？!?\n]/);if(cut!==-1)w=w.slice(0,cut);
      w=w.replace(noise,'');
      own+=(w.split(ownCh).length-1);opp+=(w.split(oppCh).length-1);
      at+=nm.length;
    }
    if(occ&&(!best||own-opp>best.own-best.opp))best={own,opp,name:nm,occ};
  }
  if(!best){out.why='tên (gốc/đã dịch) không có nguyên văn trong chương';return out;}
  out.own=best.own;out.opp=best.opp;out.name=best.name;
  if(best.opp>0){out.why=`đại từ sau tên "${best.name}" lẫn giới ngược lại (${ownCh}×${best.own}, ${oppCh}×${best.opp})`;return out;}
  if(best.own<2){out.why=`đại từ ${ownCh} sau tên "${best.name}" quá ít (${best.own}) để kết luận`;return out;}
  out.gender=L;
  return out;
}

// ===== GIỚI TÍNH TỪ NHÃN CÓ CHỮ CHỈ GIỚI (眼鏡女, 男青年, 紋身男, 王哥...) =====
// Nhãn tự có 男/女/哥/姐... là bằng chứng chỉ ĐỦ KHI có thêm mô tả đi kèm, vì nhiều khi nhân vật nam mà nhãn/biệt danh lại mang
// chữ nữ (và ngược lại). Nên chỉ điền khi: (1) nhãn có nguyên văn trong chương và chỉ chỉ 1 phía giới tính; (2) KHÔNG có gì mâu thuẫn:
// giới tính model khai (kể cả "suy đoán"), narrRef/xưng hô cùng entry, hoặc đại từ 她/他 ngay sau nhãn trong chương; (3) CÓ ít nhất 1
// mô tả khớp đi kèm: narrRef cùng giới, hoặc đại từ 她/他 ngay sau nhãn trong chương nghiêng về cùng giới (nhiều hơn phía ngược lại).
// Trả {gender:'Nam'|'Nữ'|'', why, label, basis}. why chỉ có khi nhãn chỉ giới rõ ràng nhưng bị từ chối (để log).
function genderFromLabel(f,srcText){
  const out={gender:'',why:'',label:'',basis:''};
  if(!f)return out;
  const src=String(srcText||'').normalize('NFC').toLowerCase();
  const labels=[...parseOrigNames(f.originalName),...(Array.isArray(f.nicknames)?f.nicknames:[]),f.sinoAlias]
    .map(v=>String(v||'').normalize('NFC').trim()).filter(v=>v.length>=2&&v.length<=10&&containsCJK(v))
    .filter((v,i,a)=>a.indexOf(v)===i);
  const hits=labels.map(l=>({l,g:genderOfQuote(l)})).filter(x=>x.g);
  if(!hits.length)return out;
  const gset=[...new Set(hits.map(x=>x.g))];
  out.label=hits[0].l;
  if(gset.length>1){out.why='các nhãn chỉ giới tính khác nhau ('+hits.map(x=>x.l+'='+x.g).join(', ')+')';return out;}
  const L=gset[0];
  const lab=hits.find(x=>src.includes(x.l.toLowerCase()));
  if(!lab){out.why='nhãn "'+hits[0].l+'" không có nguyên văn trong chương (có thể lệch phồn/giản thể)';return out;}
  out.label=lab.l;
  const declared=normalizeGenderValue(f.gender);
  if(declared!=='Chưa rõ'&&declared!==L){out.why='model khai giới tính '+declared+', ngược với nhãn "'+lab.l+'" ('+L+')';return out;}
  const gc=genderHintConflicts(f,L);
  if(gc.length){out.why='nhãn "'+lab.l+'" ('+L+') mâu thuẫn với '+gc.join(', ');return out;}
  // Đại từ 她/他 trong khoảng ngay sau mỗi lần nhắc nhãn (cắt ở dấu kết câu).
  let own=0,opp=0,occ=0,at=0,guard=0;
  const ln=lab.l.toLowerCase();
  const ownCh=L==='Nữ'?'她':'他',oppCh=L==='Nữ'?'他':'她';
  while(guard++<40&&(at=src.indexOf(ln,at))!==-1){
    occ++;
    let w=src.slice(at+ln.length,at+ln.length+30);
    const cut=w.search(/[。！？!?\n]/);if(cut!==-1)w=w.slice(0,cut);
    own+=(w.split(ownCh).length-1);opp+=(w.split(oppCh).length-1);
    at+=ln.length;
  }
  if(opp>own){out.why='đại từ sau nhãn "'+lab.l+'" nghiêng về giới ngược lại ('+oppCh+'×'+opp+' so với '+ownCh+'×'+own+')';return out;}
  let narrG='';
  if(!isNarrRefUnknown(f.narrRef)){
    const hs=[...new Set(splitAddrCandidates(f.narrRef).map(narrRefGenderHint).filter(Boolean))];
    if(hs.length===1)narrG=hs[0];
  }
  const byNarr=narrG===L,byText=own>opp;
  if(!byNarr&&!byText){out.why='nhãn "'+lab.l+'" ('+L+') chưa có mô tả nào đi kèm xác nhận (narrRef chưa rõ, không có đại từ '+ownCh+' ngay sau nhãn)';return out;}
  out.gender=L;
  out.basis=[byNarr?'narrRef cùng giới':'',byText?ownCh+'×'+own+' sau nhãn':''].filter(Boolean).join(' + ');
  return out;
}

// ===== [Mục 2] GIỚI TÍNH 2 TẦNG: gender (mạnh) + genderHint (yếu) =====
// gender: có genderQuote/đại từ kiểm được, dùng cho merge/split record. genderHint: model chỉ "suy đoán" nhưng không mâu thuẫn;
// CHỈ dùng chọn đại từ khi dịch (buildCharacterContextText), KHÔNG bao giờ dùng để tách/gộp record.
// narrRef do model sinh ra nên chỉ là tín hiệu phụ (kiểm mâu thuẫn); bằng chứng độc lập là đếm 他/她 trong văn bản gốc.
const CHARMEM_HINT_PRONOUN_MIN=3, CHARMEM_HINT_PRONOUN_RATIO=0.8;
function genderHintPronounText(c,narrRefRaw){
  const h=normalizeGenderValue(c&&c.genderHint);
  if(h==='Chưa rõ')return '';
  const raw=(narrRefRaw!==undefined?narrRefRaw:c.narrRef);
  if(!isNarrRefUnknown(raw)){
    const m=splitAddrCandidates(raw).filter(x=>narrRefGenderHint(x)===h).slice(0,2);
    if(m.length)return m.join(', ');
  }
  return h==='Nam'?'anh ta':'cô ta';
}
// Gọi SAU applyCharField(gender). hintCand: giá trị hint từ entry chương này ('' nếu entry không "suy đoán").
function applyGenderHint(c,f,hintCand,srcText,name,chapterIdx,hintSrc){
  if(!c)return;
  // [Có phải người?] isHuman=false (thú/vật/hệ thống/AI...) -> không có giới tính, không cần xác định. true thắng false (model có thể nhầm 1 chương).
  if(f&&typeof f.isHuman==='boolean'){
    if(f.isHuman===true){
      if(c.isHuman===false)console.log(`[Luồng 1][Giới tính] "${name}" được xác nhận là NGƯỜI (trước đó isHuman=false) -> xác định giới tính bình thường.`);
      c.isHuman=true;
    }else if(isUnknownVal(c.gender)&&c.isHuman!==true){
      if(c.isHuman!==false)console.log(`[Luồng 1][Giới tính] "${name}" KHÔNG phải người (isHuman=false) -> bỏ qua xác định giới tính.`);
      c.isHuman=false;
    }
  }
  if(c.isHuman===false&&isUnknownVal(c.gender)){
    c.genderHint='';c.genderHintSource='';c.genderConf=0;
    return;
  }
  _applyGenderHintCore(c,f,hintCand,srcText,name,chapterIdx,hintSrc);
  c.genderConf=charmemGenderConf(c);
}
function _applyGenderHintCore(c,f,hintCand,srcText,name,chapterIdx,hintSrc){
  if(!c)return;
  const gKnown=!isUnknownVal(c.gender);
  const old=normalizeGenderValue(c.genderHint);
  // 2.6: đã có giới tính chắc chắn -> hint hết vai trò
  if(gKnown){
    if(old!=='Chưa rõ'){
      console.log(`[Luồng 1][Giới tính] hint → xác nhận: "${name}" đã có giới tính ${c.gender}${normalizeGenderValue(c.gender)===old?' (khớp hint '+old+')':' (hint cũ '+old+' bị ghi đè)'}.`);
    }
    c.genderHint='';c.genderHintSource='';
    return;
  }
  let hint=old;
  // ===== MỨC 1: đại từ ngôi 3 (他/她) CỘNG DỒN qua các chương -> KHOÁ (cùng giới với hint) hoặc SỬA LẠI (ngược giới với hint) =====
  let weakPron='';
  try{
    if(!c.pronTally||typeof c.pronTally!=='object')c.pronTally={m:0,f:0,chs:[]};
    const t=c.pronTally;if(!Array.isArray(t.chs))t.chs=[];
    const chKey=chapterIdx==null?('x'+Date.now()):String(chapterIdx);
    if(srcText&&!t.chs.includes(chKey)){
      const sc=genderFromPronounScan(charmemPronounSubjectNames(c,f),srcText,charmemOtherNames(c));
      t.m+=sc.m;t.f+=sc.f;t.chs.push(chKey);
      if(t.chs.length>400)t.chs=t.chs.slice(-400);
      if(sc.m+sc.f>0)console.log(`[Luồng 1][Giới tính] Đại từ ngôi 3 [${sc.lang}] "${name}" (sau "${sc.name}") ch.${chKey}: Nam×${sc.m} Nữ×${sc.f} | cộng dồn Nam×${t.m} Nữ×${t.f}.`);
    }
    const verdict=charmemPronounVerdict(t.m,t.f);
    if(verdict){
      const gc=genderHintConflicts(f,verdict);
      if(gc.length){
        console.log(`[Luồng 1][Giới tính] Không khoá "${verdict}" cho "${name}" dù đại từ nghiêng về ${verdict} (Nam×${t.m}, Nữ×${t.f}): mâu thuẫn ${gc.join(', ')}.`);
      }else{
        const why=old==='Chưa rõ'?'':(old===verdict?` (xác nhận nhãn ${c.genderHintSource||'suy đoán'} ${old})`:` (SỬA LẠI nhãn ${c.genderHintSource||'suy đoán'} ${old} → ${verdict})`);
        c.gender=verdict;c.genderSource='ai';c.genderBasis='pronoun-3rd';
        c.genderHint='';c.genderHintSource='';
        if(c.pendingCorr)delete c.pendingCorr.gender;
        c.genderConflict=null;
        console.log(`[Luồng 1][Giới tính] KHOÁ giới tính "${verdict}" của "${name}" từ đại từ ngôi 3 cộng dồn (Nam×${t.m}, Nữ×${t.f})${why}.`);
        return;
      }
    }else if(t.m+t.f>=1&&(t.m===0||t.f===0)){
      weakPron=t.m>0?'Nam':'Nữ';   // mới có 1 đại từ: chưa đủ khoá, nhưng đủ làm nhãn suy đoán
    }
  }catch(e){console.warn('[Giới tính] pronoun scan lỗi:',e);}
  // 2.4: narrRef/xưng hô của entry chương này mâu thuẫn với hint đang lưu -> bỏ hint
  if(hint!=='Chưa rõ'){
    const gc=genderHintConflicts({...f,genderHint:hint},'Chưa rõ');
    if(gc.length){
      console.log(`[Luồng 1][Giới tính] Bỏ hẳn (mâu thuẫn): hint "${hint}" của "${name}" ${gc.join(', ')}.`);
      c.genderHint='';c.genderHintSource='';hint='Chưa rõ';
    }
  }
  // Gom các ứng viên nhãn của chương này (câu trích mức 2-3 / 1 đại từ), mức cao hơn (số nhỏ) thắng.
  const cands=[];
  const cand0=normalizeGenderValue(hintCand);
  if(cand0!=='Chưa rõ')cands.push({g:cand0,src:hintSrc||'title'});
  if(weakPron)cands.push({g:weakPron,src:'pronoun-weak'});
  cands.sort((a,b)=>charmemGenderHintRank(a.src)-charmemGenderHintRank(b.src));
  for(const cd of cands){
    if(hint==='Chưa rõ'){
      c.genderHint=cd.g;c.genderHintSource=cd.src;hint=cd.g;
      console.log(`[Luồng 1][Giới tính] Gắn nhãn suy đoán: "${name}" = ${cd.g} (nguồn: ${cd.src}); chờ đại từ ngôi 3 để khoá/sửa.`);
    }else if(hint===cd.g){
      if(charmemGenderHintRank(cd.src)<charmemGenderHintRank(c.genderHintSource))c.genderHintSource=cd.src;
    }else{
      const rn=charmemGenderHintRank(cd.src),ro=charmemGenderHintRank(c.genderHintSource);
      if(rn<ro){
        console.log(`[Luồng 1][Giới tính] SỬA LẠI nhãn: "${name}" ${hint} (${c.genderHintSource||'?'}) → ${cd.g} (${cd.src}, mức cao hơn).`);
        c.genderHint=cd.g;c.genderHintSource=cd.src;hint=cd.g;
      }else if(rn===ro){
        console.log(`[Luồng 1][Giới tính] Bỏ hẳn (mâu thuẫn cùng mức): hint cũ "${hint}" ≠ hint mới "${cd.g}" của "${name}".`);
        c.genderHint='';c.genderHintSource='';return;
      }
      // rn>ro: bằng chứng mới yếu hơn nhãn đang giữ -> bỏ qua
    }
  }
  if(hint==='Chưa rõ')return;
  // 2.3 (cũ): kiểm chứng độc lập bằng đếm 他/她 trong câu liền sau lần nhắc tên/nhãn gốc
  const gp=genderFromPronouns(f,hint,srcText);
  const own=gp.own||0,opp=gp.opp||0,tot=own+opp;
  if(tot>0){
    const ownCh=hint==='Nữ'?'她':'他',oppCh=hint==='Nữ'?'他':'她';
    if(own>=CHARMEM_HINT_PRONOUN_MIN&&own/tot>=CHARMEM_HINT_PRONOUN_RATIO){
      if(c.genderHintSource!=='pronoun-count'){
        c.genderHintSource='pronoun-count';
        console.log(`[Luồng 1][Giới tính] hint → xác nhận (đếm đại từ): "${name}" = ${hint} (${ownCh}×${own}, ${oppCh}×${opp} sau "${gp.name}"). Vẫn là tầng hint, chưa thành gender.`);
      }
    }else if(opp>=CHARMEM_HINT_PRONOUN_MIN&&opp/tot>=CHARMEM_HINT_PRONOUN_RATIO){
      console.log(`[Luồng 1][Giới tính] Bỏ hẳn (mâu thuẫn): hint "${hint}" của "${name}" ngược với đại từ trong văn bản gốc (${ownCh}×${own}, ${oppCh}×${opp}).`);
      c.genderHint='';c.genderHintSource='';
    }
  }
}

function normalizeExtractedCharacter(f){
  if(!f||typeof f!=='object')return f;
  const out={...f,
    gender:normalizeGenderValue(f.gender),
    addrThemToMc:structuredAddrToString(f.addrThemToMc,'callsMc'),
    addrMcToThem:structuredAddrToString(f.addrMcToThem,'callsThem')
  };
  // LƯỚI AN TOÀN: model tự khai "không có hội thoại" (không có thoại trực tiếp với nhân vật chính) thì
  // KHÔNG thêm xưng hô, kể cả khi model lỡ điền — bỏ trắng 2 field để mergeAnalysisResults không lưu gì
  // (nhân vật đã có xưng hô lưu sẵn thì giữ nguyên giá trị cũ vì field mới là "Chưa rõ").
  const _ev=(f.addrEvidence==null?'':String(f.addrEvidence)).normalize('NFC').trim().toLowerCase();
  if(_ev==='không có hội thoại'){
    if(!isAddrUnknown(out.addrThemToMc)||!isAddrUnknown(out.addrMcToThem)){
      console.log(`[Luồng 1][Xưng hô] "${f.name}" khai "không có hội thoại" với nhân vật chính nhưng vẫn điền xưng hô -> bỏ, không lưu.`);
    }
    out.addrThemToMc='Chưa rõ';
    out.addrMcToThem='Chưa rõ';
    out.addrTone='Chưa rõ';
    out.addrQuote='';
  }
  // genderEvidence chỉ giữ 'trực tiếp' | 'suy đoán'; CHỈ set khi model có gửi field này — để kết quả
  // xác minh (verifyFlaggedCharacters, không có field này) không vô tình xoá mất khai báo 'suy đoán' cũ.
  if('genderEvidence' in f){
    let ge=(f.genderEvidence==null?'':String(f.genderEvidence)).normalize('NFC').trim().toLowerCase();
    const _geEn={direct:'trực tiếp',appearance:'ngoại hình',title:'danh xưng',name:'tên',inferred:'suy đoán',guess:'suy đoán'}; // đích ≠ vi: prompt chung dùng nhãn tiếng Anh
    if(_geEn[ge])ge=_geEn[ge];
    out.genderEvidence=(ge==='trực tiếp'||ge==='suy đoán'||ge==='ngoại hình'||ge==='danh xưng'||ge==='tên')?ge:'';
  }
  // isHuman: chỉ set khi model có gửi field (true|false|"true"|"false"); không gửi thì để nguyên (không ép).
  if('isHuman' in f){
    const hv=f.isHuman;
    if(hv===true||hv==='true')out.isHuman=true;
    else if(hv===false||hv==='false')out.isHuman=false;
    else delete out.isHuman;
  }
  // Ép độ tuổi + mối quan hệ về DANH SÁCH CHUẨN (xem khối CHUẨN HOÁ ở đầu file). Chỉ chạm field có trong entry.
  if('relationship' in f)out.relationship=charmemStdNormTracked('rel',f.relationship,'extract');
  if('statusCue' in f)out.statusCue=charmemStdNormTracked('age',f.statusCue,'extract');
  return out;
}

// ===== BẮT NGHI VẤN BẰNG CODE (không tốn thêm lượt gọi AI) =====
// Vài từ xưng hô TRỰC TIẾP (tự xưng, hoặc được gọi thẳng) mang sắc thái giới tính RÕ RÀNG trong
// tiếng Việt — dùng chung tinh thần với CHARMEM_NARRREF_GENDER_HINTS (khai báo cùng nhóm bên dưới
// cho narrRef) nhưng đây là bảng RIÊNG cho lời THOẠI TRỰC TIẾP (addrThemToMc/addrMcToThem), vì bộ
// từ dùng khi xưng hô trực tiếp (huynh/muội/thiếp...) khác hẳn bộ đại từ tường thuật (hắn/nàng...).
// Chỉ đưa vào các từ CHẮC CHẮN 1 giới, để tránh chặn nhầm những từ trung tính/dùng chung (ta, ngươi,
// tại hạ...). "con"/"cháu" cũng không nằm trong bảng này vì tuỳ quan hệ (cha-con, thầy-trò...) — chúng được kiểm riêng ở
// detectJuniorSelfAddrForPeer (so với tuổi/quan hệ).
const CHARMEM_SELFADDR_GENDER_HINTS={
  'thiếp':'Nữ','muội':'Nữ','tiểu muội':'Nữ','a muội':'Nữ','nô gia':'Nữ','bổn cô nương':'Nữ','nương nương':'Nữ',
  'huynh':'Nam','tiểu đệ':'Nam','đại ca':'Nam','bổn thiếu gia':'Nam','bổn công tử':'Nam','tại hạ huynh đệ':'Nam'
};
function selfAddrGenderHint(word){return CHARMEM_SELFADDR_GENDER_HINTS[normAddrWord(word)]||null;}
// Cùng tinh thần với CHARMEM_SELFADDR_GENDER_HINTS ở trên, nhưng bắt lệch VAI VẾ (ai trên/ai dưới)
// thay vì giới tính — đây chính là lỗ hổng khiến trước đây 1 nhân vật được ghi "Mối quan hệ"=biểu tỷ
// (vai TRÊN so với MC) nhưng lại tự xưng "muội" (ngụ ý vai DƯỚI) mà không bị code bắt lỗi, vì
// detectAddrSuspicion trước đây chỉ so gender/addrTone, không so với relationship. Chỉ đưa vào các
// từ xưng hô NGỤ Ý VAI VẾ RÕ RÀNG (dùng phổ biến trong truyện cổ trang/tu tiên/kiếm hiệp) — không
// đưa từ trung tính (ta/ngươi, tôi/cậu...) vì các từ đó không tự thân ngụ ý ai trên ai dưới.
const CHARMEM_SELFADDR_JUNIOR_HINTS=['muội','tiểu muội','a muội','đệ','tiểu đệ','sư đệ','sư muội','vãn bối','đệ tử','tiểu bối'];
const CHARMEM_SELFADDR_SENIOR_HINTS=['tỷ','tiểu tỷ','a tỷ','ca','ca ca','đại ca','huynh','sư huynh','sư tỷ','sư phụ','sư phó','tiền bối'];
function selfAddrSeniorityHint(word){
  const w=normAddrWord(word);
  if(CHARMEM_SELFADDR_JUNIOR_HINTS.includes(w))return'junior';
  if(CHARMEM_SELFADDR_SENIOR_HINTS.includes(w))return'senior';
  return null;
}
// Nhãn "Mối quan hệ" (relationship) ngụ ý CHÍNH nhân vật đang xét là vai TRÊN hay vai DƯỚI so với MC.
// Chỉ liệt kê các nhãn quan hệ THÔNG DỤNG có hàm ý vai vế rõ ràng — vì nhãn relationship do model tự
// điền tự do (không phải enum cố định) nên bảng này CHỈ LÀ GỢI Ý, không phủ hết mọi trường hợp; dùng
// .includes() khi so khớp (thay vì so tuyệt đối) để bắt được các biến thể như "sư tỷ đồng môn",
// "biểu tỷ họ ngoại"... mà vẫn chứa đúng từ khoá gốc.
const CHARMEM_REL_SENIOR_HINTS=['biểu tỷ','biểu huynh','đường tỷ','đường huynh','sư tỷ','sư huynh','sư phụ','sư phó','tiền bối','ca ca','đại ca','thúc thúc','bá bá','cô cô','di di','đàn anh','đàn chị','trưởng bối','anh/chị ruột','họ hàng bậc trên','thầy/người dạy'];
const CHARMEM_REL_JUNIOR_HINTS=['biểu muội','biểu đệ','đường muội','đường đệ','sư muội','sư đệ','đệ tử','muội muội','đàn em','hậu bối','em ruột','học trò','họ hàng bậc dưới'];
function relSeniorityHint(relationship){
  const r=normAddrWord(relationship);
  if(!r||r==='chưa rõ')return null;
  if(CHARMEM_REL_SENIOR_HINTS.some(k=>r.includes(k)))return'senior';
  if(CHARMEM_REL_JUNIOR_HINTS.some(k=>r.includes(k)))return'junior';
  return null;
}

// ===== "CON/CHÁU" TỰ XƯNG CHO NGƯỜI NGANG TUỔI/NGANG VAI =====
// Lỗ hổng cũ: "con"/"cháu" cố tình không nằm trong CHARMEM_SELFADDR_JUNIOR_HINTS (vì dùng được cho cả cha-con,
// thầy-trò...) nên 1 nhân vật thiếu niên ngang tuổi MC vẫn lưu được cặp "con/..." mà không bị nghi ngờ.
// Luật mới: tự xưng "con"/"cháu" (hoặc MC gọi họ "con"/"cháu") chỉ hợp lý khi nhân vật thực sự ở vai DƯỚI
// (con cái, cháu, học trò...) hoặc rõ ràng nhỏ tuổi hơn đối phương. Nếu tuổi (statusCue) ngang/lớn hơn MC mà
// "Mối quan hệ" không giải thích được -> đẩy sang lượt xác minh (đọc lại văn bản gốc, xem ai là người nghe).
const CHARMEM_JUNIORISH_SELF_WORDS=['con','cháu'];
// bậc tuổi: 0 trẻ em, 1 thiếu niên/thanh niên, 2 trung niên, 3 lớn tuổi. null = không rõ.
function ageBucketOf(cue){
  const i=charmemAgeBandIndex(cue);
  return i===null?_ageBucketOfLegacy(cue):[0,0,1,1,1,2,2,3][i];
}
function _ageBucketOfLegacy(cue){
  const t=normAddrWord(cue);
  if(!t||t==='chưa rõ')return null;
  const m=t.match(/(\d{1,3})\s*(tuổi|t\b)/);
  if(m){const a=+m[1];return a<13?0:a<=30?1:a<=55?2:3;}
  const has=arr=>arr.some(k=>t.includes(k));
  if(has(['lão nhân','người già','cao tuổi','bô lão','lão bà','lão ông','tuổi già','già cả']))return 3;
  if(has(['trung niên','trung tuổi','người lớn','tráng niên']))return 2;
  if(has(['thiếu niên','thiếu nữ','thanh niên','thiếu hiệp','dậy thì','tuổi teen','học sinh','sinh viên','trẻ tuổi','cô gái trẻ','chàng trai trẻ','đôi mươi']))return 1;
  if(has(['trẻ em','nhi đồng','đứa trẻ','đứa bé','bé gái','bé trai','thiếu nhi','trẻ con','ấu nhi']))return 0;
  return null;
}
function _relHasToken(rel,list){
  const r=' '+normAddrWord(rel).replace(/[,;\/()\-–]+/g,' ').replace(/\s+/g,' ')+' ';
  return list.some(k=>r.includes(' '+k+' '));
}
// quan hệ giải thích được việc nhân vật xưng "con/cháu" (họ là vai dưới) hoặc họ là bề trên.
const CHARMEM_REL_JUNIORISH_TOKENS=['con','con gái','con trai','con nuôi','con riêng','cháu','cháu gái','cháu trai','cháu ngoại','cháu nội','đệ tử','học trò','học trò cưng','nghĩa tử','nghĩa nữ','nhi tử','tôn nhi','điệt nhi','điệt nữ','hậu bối','vãn bối','thị đồng','tùy tùng','nô tỳ','nô tì','nô tài','hầu gái','học việc','đồ đệ','đồ nhi','đàn em','họ hàng bậc dưới'];
const CHARMEM_REL_ELDER_TOKENS=['cha','mẹ','bố','ba','má','phụ thân','mẫu thân','thúc','bá','cô cô','di di','dì','chú','bác','ông','bà','thầy','cô giáo','sư phụ','sư tôn','sư phó','tiền bối','trưởng bối','trưởng lão','sư tổ','tổ phụ','tổ mẫu','nhạc phụ','nhạc mẫu','cậu','mợ','cữu','thím','thẩm','sư thúc','sư bá','gia gia','nãi nãi','lão sư','tộc trưởng','chưởng môn','họ hàng bậc trên','người dạy'];
function detectJuniorSelfAddrForPeer(f,existing){
  const reasons=[];
  const relVal=(f.relationship&&f.relationship!=='Chưa rõ')?f.relationship:(existing&&existing.relationship);
  const cue=(f.statusCue&&!isUnknownVal(f.statusCue))?f.statusCue:(existing&&existing.statusCue);
  const cb=ageBucketOf(cue);
  if(cb===null||cb<1)return reasons;               // chưa biết tuổi / là trẻ em -> không đủ căn cứ để nghi
  let mc=null;
  try{if(typeof S!=='undefined'&&Array.isArray(S.characters))mc=S.characters.find(c=>isCharProtagonist(c))||null;}catch(e){}
  const mb=mc?ageBucketOf(mc.statusCue):null;
  const rel=relVal||'';
  const elder=_relHasToken(rel,CHARMEM_REL_ELDER_TOKENS)||relSeniorityHint(rel)==='senior';
  const juniorish=_relHasToken(rel,CHARMEM_REL_JUNIORISH_TOKENS);
  // (1) nhân vật TỰ XƯNG con/cháu khi nói với MC
  if(!juniorish){
    collectCharSelfTerms(f.addrThemToMc,'self').forEach(term=>{
      if(!CHARMEM_JUNIORISH_SELF_WORDS.includes(normAddrWord(term)))return;
      if(mb!==null&&cb<mb)return;                   // nhỏ tuổi hơn MC hẳn -> hợp lý
      reasons.push(`nhân vật tự xưng "${term}" khi nói với MC nhưng độ tuổi/vai vế ("${String(cue).trim()}") `+
        (mb!==null?`không nhỏ hơn MC ("${String(mc.statusCue).trim()}")`:`thuộc người trẻ/trưởng thành`)+
        ` và "Mối quan hệ" ("${rel||'chưa ghi'}") không phải con cái/cháu/học trò — "${term}" thường chỉ hợp khi nói với bậc cha mẹ/trưởng bối; có thể lời đó nói với NGƯỜI KHÁC (khách, chủ quán, trưởng bối...) chứ không phải MC`);
    });
  }
  // (2) MC gọi nhân vật là con/cháu
  if(!elder&&mb!==null&&cb>=mb){
    collectCharSelfTerms(f.addrMcToThem,'other').forEach(term=>{
      if(!CHARMEM_JUNIORISH_SELF_WORDS.includes(normAddrWord(term)))return;
      if(juniorish)return;
      reasons.push(`MC gọi nhân vật là "${term}" nhưng nhân vật không nhỏ tuổi hơn MC ("${String(cue).trim()}" so với "${String(mc.statusCue).trim()}") và "Mối quan hệ" ("${rel||'chưa ghi'}") không phải con cái/cháu/học trò`);
    });
  }
  return reasons;
}
// Bảng ánh xạ CÁC CẶP xưng hô ĐẶC THÙ — bổ sung cho CHARMEM_SELFADDR_JUNIOR_HINTS/
// CHARMEM_SELFADDR_SENIOR_HINTS ở trên: 2 bảng đó chỉ biết 1 từ là vai TRÊN hay vai DƯỚI nói chung,
// nên không bắt được lỗi xưng hô LỆCH CẶP dù vẫn ĐÚNG CHIỀU trên/dưới — VD "đệ tử" (vai dưới, chỉ hợp
// xưng với "sư phụ/sư tôn" trong quan hệ THẦY-TRÒ) lại được ghép tự xưng khi nói với "sư huynh" (vai
// trên, nhưng thuộc quan hệ ĐỒNG MÔN, chỉ hợp cặp với "sư đệ/sư muội") — cả 2 từ đều đúng chiều
// trên/dưới nên lọt qua check vai vế chung chung, nhưng vẫn là xưng hô KHÔNG ĐỐI XỨNG vì thuộc 2 KIỂU
// QUAN HỆ khác hẳn nhau. Mỗi phần tử là 1 NHÓM CẶP hợp lệ — "senior" chỉ được ghép xưng hô với
// "junior" TRONG CÙNG 1 NHÓM, không ghép chéo giữa các nhóm dù cùng ngụ ý trên/dưới. Chỉ liệt kê các
// cặp ĐẶC THÙ/không dùng chung được cho quan hệ khác (khác với "muội"/"đệ" ở CHARMEM_SELFADDR_*_HINTS,
// vốn dùng chung được cho nhiều kiểu quan hệ nên không đủ đặc thù để bắt buộc đối phương phải xưng
// đúng 1 cặp cụ thể).
// "compat" (tuỳ chọn): nhãn các nhóm KHÁC mà truyện vẫn hay ghép chéo hợp lệ với nhóm này (VD "đệ" gọi "sư huynh",
// "nô tài" gọi "bệ hạ") — cặp chéo như vậy KHÔNG bị coi là lệch cặp. Chỉ dùng khi ghép chéo là thường gặp thật.
const CHARMEM_ADDR_PAIR_GROUPS=[
  {label:'thầy-trò',senior:['sư phụ','sư tôn','sư phó'],junior:['đệ tử']},
  {label:'đồng môn',senior:['sư huynh','sư tỷ'],junior:['sư đệ','sư muội']},
  {label:'tiền/hậu bối',senior:['tiền bối'],junior:['vãn bối','hậu bối']},
  // Anh chị em (thường là ruột, nhưng truyện cũng dùng cho bạn thân/anh em kết nghĩa). "đệ"/"muội" đứng riêng
  // còn dùng được với "sư huynh/sư tỷ" nên khai báo compat với nhóm đồng môn để không báo oan.
  {label:'huynh-đệ/tỷ-muội',senior:['huynh','ca ca','huynh trưởng','tỷ tỷ'],junior:['đệ','đệ đệ','muội','muội muội'],compat:['đồng môn']},
  // Vua-thần và chủ-tớ: "nô tài/nô tỳ" xưng với "bệ hạ/hoàng thượng" là bình thường nên 2 nhóm này compat với nhau.
  {label:'quân-thần',senior:['bệ hạ','hoàng thượng','thánh thượng'],junior:['thần','vi thần','hạ thần'],compat:['chủ-tớ']},
  {label:'chủ-tớ',senior:['chủ nhân','chủ tử'],junior:['nô tài','nô tỳ','nô tì'],compat:['quân-thần']}
];
// 2 nhóm (theo index) có cùng nhóm hoặc khai báo compat với nhau (1 trong 2 chiều) thì ghép chéo là hợp lệ.
function addrGroupsCompatible(i,j){
  if(i===j)return true;
  const a=CHARMEM_ADDR_PAIR_GROUPS[i],b=CHARMEM_ADDR_PAIR_GROUPS[j];
  return !!((a&&(a.compat||[]).includes(b&&b.label))||(b&&(b.compat||[]).includes(a&&a.label)));
}
// Tìm nhóm cặp (index trong CHARMEM_ADDR_PAIR_GROUPS) chứa đúng "word" ở đúng "role" ('senior' hoặc
// 'junior'). Trả về -1 nếu từ này không thuộc bảng cặp đặc thù nào.
function addrPairGroupIndex(word,role){
  const w=normAddrWord(word);
  return CHARMEM_ADDR_PAIR_GROUPS.findIndex(g=>(g[role]||[]).includes(w));
}
// So 1 CẶP xưng hô cụ thể (self/other trong CÙNG 1 lựa chọn "tự xưng/gọi đối phương") xem có LỆCH CẶP
// đặc thù hay không — thử cả 2 chiều (self là vai trên của 1 nhóm + other là vai dưới của nhóm KHÁC,
// hoặc ngược lại) vì không biết trước ai trên ai dưới ở đây. Trả về {selfGroup,otherGroup} (nhãn 2
// nhóm bị lệch) nếu có mâu thuẫn, null nếu khớp hoặc không đủ dữ liệu để kết luận (VD 1 trong 2 từ
// không thuộc bảng cặp đặc thù nào — lúc đó không đủ căn cứ để coi là lệch).
function findAddrPairMismatch(selfWord,otherWord){
  const selfSeniorGroup=addrPairGroupIndex(selfWord,'senior');
  const selfJuniorGroup=addrPairGroupIndex(selfWord,'junior');
  const otherSeniorGroup=addrPairGroupIndex(otherWord,'senior');
  const otherJuniorGroup=addrPairGroupIndex(otherWord,'junior');
  if(selfSeniorGroup!==-1&&otherJuniorGroup!==-1&&!addrGroupsCompatible(selfSeniorGroup,otherJuniorGroup))
    return{selfGroup:CHARMEM_ADDR_PAIR_GROUPS[selfSeniorGroup].label,otherGroup:CHARMEM_ADDR_PAIR_GROUPS[otherJuniorGroup].label};
  if(selfJuniorGroup!==-1&&otherSeniorGroup!==-1&&!addrGroupsCompatible(selfJuniorGroup,otherSeniorGroup))
    return{selfGroup:CHARMEM_ADDR_PAIR_GROUPS[selfJuniorGroup].label,otherGroup:CHARMEM_ADDR_PAIR_GROUPS[otherSeniorGroup].label};
  return null;
}
// Lấy các từ MÔ TẢ CHÍNH NHÂN VẬT ĐANG XÉT từ 1 field xưng hô đã chuẩn hoá thành chuỗi: với
// addrThemToMc đó là phần "self" (họ tự xưng); với addrMcToThem đó là phần "other" (MC gọi họ).
function collectCharSelfTerms(addrString,part){
  if(isAddrUnknown(addrString))return [];
  return splitAddrCandidates(addrString).map(cand=>parseAddrChoice(cand)[part]).filter(Boolean);
}
// Trả về MẢNG LÝ DO (string) nếu 1 nhân vật vừa trích xuất CẦN xác minh lại bằng 1 lượt gọi AI
// riêng — mảng rỗng nghĩa là đủ tin cậy, dùng thẳng không cần xác minh thêm. So sánh với 3 nguồn:
// chính bằng chứng model tự khai (addrEvidence), giới tính đã biết, và dữ liệu ĐÃ LƯU của nhân vật
// đó (existing).
// ===== BẰNG CHỨNG XƯNG HÔ KIỂM ĐƯỢC BẰNG CODE (addrQuote) =====
// Cùng ý với evidence/evP của Luồng 3 (verifyAddrEvidence): model phải chép nguyên văn 1 đoạn lời thoại,
// code tìm lại trong văn bản gốc. Không tìm thấy = lời khai "trực tiếp" không đáng tin. So khớp bỏ hết dấu
// câu + khoảng trắng + hoa/thường nên chịu được khác biệt định dạng, dùng được cả cho văn bản gốc chữ Hán.
// Giới hạn: chỉ chứng minh đoạn trích CÓ THẬT trong chương, không chứng minh nó khớp đúng cặp xưng hô.
function addrQuoteKey(s){return String(s||'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
function verifyAddrQuote(f,sourceKey){
  const raw=f&&f.addrQuote;
  const q=addrQuoteKey(raw);
  if(!q||!sourceKey)return false;
  if(q.length<(containsCJK(raw)?4:8))return false;
  return sourceKey.includes(q);
}
function hasAddrValueOf(f){return !isAddrUnknown(f.addrThemToMc)||!isAddrUnknown(f.addrMcToThem);}

// ===== QUÉT CƠ HỌC TỪ XƯNG HÔ ĐẶC THÙ GẦN TÊN NHÂN VẬT (chỉ để FLAG cho verify, KHÔNG tự sửa) =====
// Ở Luồng 1 có lượt AI xác minh gỡ được báo oan, nên chấp nhận code báo thừa hơn Luồng 3 (nơi không có ai gỡ oan).
// Chỉ quét các từ trong CHARMEM_ADDR_PAIR_GROUPS (đặc thù, ít nhiễu) — không quét "anh/em/cô..." vì quá chung chung,
// lời tường thuật cũng dùng. Văn bản gốc có thể là tiếng Việt (convert) hoặc chữ Hán nên có thêm bảng Hán -> Việt.
const CHARMEM_SCAN_CJK_TERMS={
  '师父':'sư phụ','师尊':'sư tôn','弟子':'đệ tử','师兄':'sư huynh','师姐':'sư tỷ','师弟':'sư đệ','师妹':'sư muội',
  '前辈':'tiền bối','晚辈':'vãn bối','哥哥':'ca ca','姐姐':'tỷ tỷ','弟弟':'đệ đệ','妹妹':'muội muội',
  '陛下':'bệ hạ','皇上':'hoàng thượng','圣上':'thánh thượng','主人':'chủ nhân','奴才':'nô tài','奴婢':'nô tỳ'
};
const CHARMEM_SCAN_WINDOW=60;        // số ký tự lấy mỗi bên quanh 1 lần nhắc tên
const CHARMEM_SCAN_MIN_COUNT=2;      // 1 từ phải xuất hiện >= số lần này gần tên mới đáng nghi (1 lần dễ là ngẫu nhiên)
function addrPairGroupAny(word){
  const w=normAddrWord(word);
  return CHARMEM_ADDR_PAIR_GROUPS.findIndex(g=>(g.senior||[]).includes(w)||(g.junior||[]).includes(w));
}
// Trả về Map(từ xưng hô đặc thù, dạng Việt -> số lần) xuất hiện trong các cửa sổ quanh mọi lần nhắc tên nhân vật.
function scanAddrTermsNearName(f,srcText){
  const out=new Map();
  if(!f||!srcText)return out;
  const text=String(srcText).normalize('NFC').toLowerCase();
  const names=[f.name,f.originalName,f.sinoAlias].map(x=>String(x||'').normalize('NFC').toLowerCase().trim()).filter(x=>x.length>=2);
  if(!names.length)return out;
  const spans=[];
  names.forEach(nm=>{
    let i=0,guard=0;
    while(guard++<40&&(i=text.indexOf(nm,i))!==-1){
      spans.push([Math.max(0,i-CHARMEM_SCAN_WINDOW),Math.min(text.length,i+nm.length+CHARMEM_SCAN_WINDOW)]);
      i+=nm.length;
    }
  });
  if(!spans.length)return out;
  spans.sort((a,b)=>a[0]-b[0]);
  const merged=[spans[0].slice()];
  spans.slice(1).forEach(sp=>{const last=merged[merged.length-1];if(sp[0]<=last[1])last[1]=Math.max(last[1],sp[1]);else merged.push(sp.slice());});
  const vi=[];
  CHARMEM_ADDR_PAIR_GROUPS.forEach(g=>[...(g.senior||[]),...(g.junior||[])].forEach(w=>{if(!vi.includes(w))vi.push(w);}));
  const terms=[...vi.map(w=>({src:w,vi:w,cjk:false})),...Object.keys(CHARMEM_SCAN_CJK_TERMS).map(k=>({src:k,vi:CHARMEM_SCAN_CJK_TERMS[k],cjk:true}))]
    .sort((a,b)=>b.src.length-a.src.length); // dài trước để "sư huynh" không bị đếm thêm thành "huynh"
  merged.forEach(([a,b])=>{
    const seg=text.slice(a,b);
    const used=new Array(seg.length).fill(false);
    terms.forEach(t=>{
      let i=0;
      while((i=seg.indexOf(t.src,i))!==-1){
        const end=i+t.src.length;
        let ok=true;
        for(let k=i;k<end;k++)if(used[k]){ok=false;break;}
        if(ok&&!t.cjk&&(isWordChar(seg[i-1])||isWordChar(seg[end])))ok=false;
        if(ok){for(let k=i;k<end;k++)used[k]=true;out.set(t.vi,(out.get(t.vi)||0)+1);}
        i=end;
      }
    });
  });
  return out;
}
// So kết quả quét với xưng hô ĐÃ LƯU: từ đặc thù xuất hiện nhiều lần gần tên nhưng xưng hô đã lưu không có từ nào cùng
// nhóm/nhóm tương thích -> trả về lý do (string) để đẩy qua verify; không thì null.
function mechanicalAddrScanReason(f,existing,srcText){
  if(!existing||!isEstablishedAddrChar(existing)||existing.addrSource==='user')return null;
  const stored=[...collectCharSelfTerms(existing.addrThemToMc,'self'),...collectCharSelfTerms(existing.addrThemToMc,'other'),
    ...collectCharSelfTerms(existing.addrMcToThem,'self'),...collectCharSelfTerms(existing.addrMcToThem,'other')];
  const storedGroups=stored.map(addrPairGroupAny).filter(i=>i!==-1);
  const counts=scanAddrTermsNearName(f,srcText);
  let best=null;
  counts.forEach((n,term)=>{
    if(n<CHARMEM_SCAN_MIN_COUNT)return;
    const g=addrPairGroupAny(term);
    if(g===-1)return;
    if(storedGroups.some(sg=>addrGroupsCompatible(sg,g)))return; // đã khớp (cùng nhóm hoặc nhóm tương thích)
    if(!best||n>best.n)best={term,n,label:CHARMEM_ADDR_PAIR_GROUPS[g].label};
  });
  if(!best)return null;
  return 'quét cơ học thấy từ "'+best.term+'" (nhóm '+best.label+') xuất hiện '+best.n+' lần gần tên nhân vật trong chương, nhưng xưng hô đã lưu không có từ nào thuộc nhóm này — đối chiếu lại văn bản gốc (chỉ cảnh báo, chưa tự sửa)';
}
// srcKey = addrQuoteKey(văn bản chương đã gửi cho model) — tính 1 lần/chương. Bỏ trống thì bỏ qua các check addrQuote.
function detectAddrSuspicion(f,existing,srcKey,srcText){
  const reasons=[];
  const evidence=(f.addrEvidence||'').trim();
  const hasAddrValue=!isAddrUnknown(f.addrThemToMc)||!isAddrUnknown(f.addrMcToThem);
  // Hướng (a): "đường nền Trung tính" khai "suy đoán" là ĐÚNG quy tắc prompt (có thoại nhưng mơ hồ) nên KHÔNG tự nó là lý do
  // tốn thêm 1 lượt xác minh. Vẫn flag khi suy đoán mà addrTone không phải Trung tính (đoán cặp có sắc thái riêng thì cần kiểm),
  // và luôn flag khi khai "không có hội thoại" mà vẫn điền.
  const neutralGuess=evidence==='suy đoán'&&(f.addrTone||'').toString().normalize('NFC').trim()==='Trung tính';
  if(hasAddrValue&&!neutralGuess&&(evidence==='suy đoán'||evidence==='không có hội thoại')){
    reasons.push(`model tự khai addrEvidence="${evidence}" nhưng vẫn điền xưng hô cụ thể`);
  }
  // Chiều NGƯỢC LẠI: model tự khai bằng chứng "trực tiếp"/"suy đoán" (tức nhận là CÓ hội thoại)
  // nhưng lại để cả 2 field xưng hô rỗng — vi phạm thẳng quy tắc BẮT BUỘC ở buildCharExtractPrompt
  // (phải tự suy đoán tối thiểu 1 cặp "Trung tính" làm đường nền khi có hội thoại nhưng mơ hồ,
  // xem hướng dẫn "⚠ BẮT BUỘC" trong prompt trích xuất). Bắt bằng code (tự-mâu-thuẫn trong chính
  // output, không cần đọc lại văn bản gốc) rồi đẩy qua lượt xác minh có sẵn (verifyFlaggedCharacters
  // có gửi kèm văn bản gốc) để model xác minh tự chọn cặp phù hợp ngữ cảnh — KHÔNG hardcode cứng 1
  // cặp mặc định ở tầng code vì code không có statusCue/relationship/thể loại để chọn đúng biến thể.
  if(!hasAddrValue&&(evidence==='trực tiếp'||evidence==='suy đoán')){
    reasons.push(`model tự khai addrEvidence="${evidence}" nhưng lại để trống xưng hô — vi phạm quy tắc bắt buộc phải suy đoán tối thiểu 1 cặp "Trung tính"`);
  }
  // Chống "chương đầu sai rồi nhất quán sai bị khoá luôn": xưng hô sắp được lưu LẦN ĐẦU (nhân vật chưa có
  // xưng hô nào), hoặc nhân vật đang mang cờ addrTrust='unverified' (lần verify trước bị lỗi/timeout), mà
  // chương này không có addrQuote tìm lại được trong văn bản -> đẩy qua lượt xác minh. Có addrQuote hợp lệ
  // thì coi đã có bằng chứng, KHÔNG tốn thêm lượt xác minh. (Trường hợp model khai "suy đoán"/"không có hội
  // thoại" mà vẫn điền xưng hô đã bị flag ở trên nên bỏ qua ở đây để khỏi trùng lý do.)
  if(srcKey&&hasAddrValue&&!neutralGuess&&!reasons.length&&!verifyAddrQuote(f,srcKey)){
    const quoteNote=(f.addrQuote||'').trim()?'addrQuote không tìm thấy nguyên văn trong chương':'không có addrQuote';
    if(!existing||!isEstablishedAddrChar(existing)){
      reasons.push(`xưng hô sắp được lưu LẦN ĐẦU cho nhân vật này nhưng ${quoteNote} — chưa có bằng chứng kiểm được, cần xác minh trước khi khoá`);
    }else if(existing.addrTrust==='unverified'){
      reasons.push(`xưng hô đã lưu của nhân vật này CHƯA từng được xác minh (lần xác minh trước bị lỗi) và chương này ${quoteNote} — ưu tiên xác minh lại`);
    }
  }
  // So TRỰC TIẾP gender trích xuất chương này với gender ĐÃ LƯU: nếu cả 2 đều đã xác định và khác
  // nhau MÀ KHÔNG kèm correction.gender, đây CÓ THỂ là model quên tự gắn cờ dù đọc đúng bằng chứng
  // thật (kẹt vĩnh viễn ở gender sai đoán từ chương đầu) — nhưng CŨNG CÓ THỂ chỉ là model bị đánh lừa
  // bởi 1 chi tiết đơn lẻ, KHÔNG PHẢI bằng chứng hợp lệ theo quy tắc đã nêu trong buildCharExtractPrompt
  // (VD nhân vật NAM cải trang/mặc trang phục nữ trong 1 cảnh — ngoại hình/trang phục CHỦ Ý bị loại
  // khỏi danh sách bằng chứng hợp lệ, chính vì lý do này). Nếu cứ đẩy qua xác minh ngay từ CHƯƠNG ĐẦU
  // TIÊN gặp mâu thuẫn thì rủi ro bị verify (đọc lại đúng đoạn có chi tiết gây nhầm đó) làm theo, gây
  // sửa nhầm vĩnh viễn. Vì vậy CHỈ coi là đủ nghi vấn để xác minh khi giá trị mới này đã bị đề xuất
  // LẶP LẠI ở ÍT NHẤT 2 chương khác nhau (dùng existing.pendingCorr.gender làm "phiếu chờ" — đúng ý đồ
  // thiết kế ban đầu của field pendingCorr, xem khai báo ở mergeAnalysisResults) — 1 chi tiết đơn lẻ,
  // ngẫu nhiên (VD 1 màn cải trang tạm thời) khó lặp lại đúng y giá trị đó ở 1 chương khác nữa, trong
  // khi 1 sự thay đổi/lộ thân phận thật thường được nhắc lại nhất quán ở các chương sau.
  if(existing&&normalizeGenderValue(existing.gender)!=='Chưa rõ'&&normalizeGenderValue(f.gender)!=='Chưa rõ'&&normalizeGenderValue(f.gender)!==normalizeGenderValue(existing.gender)){
    const corrCheck=(f.correction&&typeof f.correction==='object')?f.correction:{};
    if(corrCheck.gender){
      // Model tự tin gắn cờ correction -> tin theo thiết kế đã có (ngưỡng đã rất chặt ở prompt chính:
      // chỉ dùng khi có bằng chứng THẬT trực tiếp phủ nhận, không được dùng ngoại hình/suy luận).
      if(existing.pendingCorr)delete existing.pendingCorr.gender;
    } else {
      const prevPending=existing.pendingCorr&&existing.pendingCorr.gender;
      if(prevPending&&prevPending.value===f.gender){
        reasons.push(`giới tính trích xuất chương này ("${f.gender}") khác với giới tính đã lưu ("${existing.gender}") — đã LẶP LẠI đúng giá trị này ở ít nhất 1 chương trước đó (không kèm correction.gender lần nào), đủ nhất quán để cần xác minh lại`);
        // Reset ngay khi đã đủ ngưỡng và gửi xác minh — dù xác minh xác nhận đổi hay giữ nguyên, lần
        // "lặp lại" kế tiếp (nếu có) phải tính lại từ đầu, tránh spam gọi xác minh mỗi chương liên tục
        // với 1 nhân vật hay bị đoán sai giống hệt nhau (VD phong cách cải trang lặp lại nhiều chương).
        delete existing.pendingCorr.gender;
      } else {
        if(!existing.pendingCorr)existing.pendingCorr={};
        existing.pendingCorr.gender={value:f.gender};
      }
    }
  }
  // Chuẩn hoá về Nam/Nữ để so với bảng gợi ý (dữ liệu cũ có thể lưu lệch chuẩn như "nam") — tránh flag oan.
  const genderRaw=(f.gender&&f.gender!=='Chưa rõ')?f.gender:(existing&&existing.gender&&existing.gender!=='Chưa rõ'?existing.gender:null);
  const gender=genderRaw&&normalizeGenderValue(genderRaw)!=='Chưa rõ'?normalizeGenderValue(genderRaw):null;
  if(gender){
    const termsAboutThisChar=[
      ...collectCharSelfTerms(f.addrThemToMc,'self'),    // họ tự xưng khi nói với MC
      ...collectCharSelfTerms(f.addrMcToThem,'other')    // MC gọi họ là gì
    ];
    termsAboutThisChar.forEach(term=>{
      const hint=selfAddrGenderHint(term);
      if(hint&&hint!==gender)reasons.push(`xưng hô "${term}" mang sắc thái giới tính ${hint}, lệch với giới tính ${gender} đã xác định`);
    });
    // Lần ĐẦU gán giới tính (nhân vật chưa có giới tính lưu): đại từ ngôi 3 trong narrRef là bằng chứng
    // giới tính đáng tin hơn nhãn "gender" đứng riêng — nếu 2 thứ mâu thuẫn thì gender sắp bị khoá sai.
    // (Nhân vật đã có giới tính thì bỏ qua để khỏi tốn thêm lượt xác minh mỗi chương.)
    if((!existing||isUnknownVal(existing.gender))&&!isNarrRefUnknown(f.narrRef)){
      splitAddrCandidates(f.narrRef).forEach(cand=>{
        const hint=narrRefGenderHint(cand);
        if(hint&&hint!==gender)reasons.push(`đại từ ngôi 3 "${cand}" (narrRef) mang sắc thái giới tính ${hint}, lệch với giới tính ${gender} sắp được lưu LẦN ĐẦU cho nhân vật này`);
      });
    }
  }
  // So xưng hô mới trích xuất với "Mối quan hệ" (relationship) — trước đây KHÔNG có bước này, là lỗ
  // hổng khiến lọt các trường hợp như "Mối quan hệ"=biểu tỷ (vai TRÊN so với MC) nhưng chính nhân vật
  // lại tự xưng "muội" (ngụ ý vai DƯỚI), hoặc MC lại gọi họ bằng 1 từ ngụ ý vai DƯỚI — xem
  // CHARMEM_REL_SENIOR_HINTS/CHARMEM_SELFADDR_JUNIOR_HINTS. Ưu tiên relationship của chương này
  // (f.relationship), chỉ lùi về relationship ĐÃ LƯU khi chương này chưa xác định được, giống cách
  // biến `gender` ở trên đang làm.
  const relationshipVal=(f.relationship&&f.relationship!=='Chưa rõ')?f.relationship:(existing&&existing.relationship);
  const relSeniority=relSeniorityHint(relationshipVal);
  if(relSeniority){
    const seniorityTermsToCheck=[
      ...collectCharSelfTerms(f.addrThemToMc,'self'),   // họ tự xưng khi nói với MC
      ...collectCharSelfTerms(f.addrMcToThem,'other')   // MC gọi họ là gì
    ];
    seniorityTermsToCheck.forEach(term=>{
      const hint=selfAddrSeniorityHint(term);
      if(hint&&hint!==relSeniority){
        reasons.push(`xưng hô "${term}" ngụ ý vai vế ${hint==='senior'?'TRÊN':'DƯỚI'}, lệch với "Mối quan hệ" đã ghi ("${relationshipVal}") vốn ngụ ý nhân vật này là vai ${relSeniority==='senior'?'TRÊN':'DƯỚI'} so với MC`);
      }
    });
  }
  detectJuniorSelfAddrForPeer(f,existing).forEach(r=>reasons.push(r));
  // LỆCH CẶP xưng hô ĐẶC THÙ — khác với check vai vế CHUNG CHUNG ở trên (chỉ biết trên/dưới, không
  // biết CẶP cụ thể): VD "đệ tử" (self) xưng với "sư huynh" (other) đúng chiều dưới/trên nên không bị
  // check trên bắt, nhưng "đệ tử" chỉ hợp cặp thầy-trò (với sư phụ/sư tôn) còn "sư huynh" thuộc cặp
  // đồng môn (với sư đệ/sư muội) — 2 kiểu quan hệ khác hẳn nhau, không đối xứng. Phải xét self/other
  // theo TỪNG LỰA CHỌN xưng hô cụ thể (không dùng collectCharSelfTerms vì hàm đó gộp chung self và
  // other của MỌI lựa chọn thành 1 mảng phẳng, làm mất liên kết "cặp nào đi với cặp nào").
  [[f.addrThemToMc,'addrThemToMc (họ xưng hô với MC)'],[f.addrMcToThem,'addrMcToThem (MC xưng hô với họ)']].forEach(([val,fieldLabel])=>{
    if(isAddrUnknown(val))return;
    splitAddrCandidates(val).forEach(choice=>{
      const{self,other}=parseAddrChoice(choice);
      if(!self||!other)return;
      const mismatch=findAddrPairMismatch(self,other);
      if(mismatch){
        reasons.push(`xưng hô "${self}/${other}" (${fieldLabel}) lệch cặp: "${self}" thuộc quan hệ ${mismatch.selfGroup} còn "${other}" thuộc quan hệ ${mismatch.otherGroup} — 2 kiểu quan hệ khác nhau, không đối xứng`);
      }
    });
  });
  // So với dữ liệu ĐÃ LƯU: nếu nhân vật đã có xưng hô ổn định từ trước và chương này đề xuất 1 nhóm
  // sắc thái (addrTone) KHÁC HẲN mà model KHÔNG tự đặt correction.addressing — model có thể đã âm
  // thầm "trôi" khỏi dữ liệu cũ mà không nhận ra đó là 1 thay đổi cần báo cáo.
  if(existing&&isEstablishedAddrChar(existing)){
    const corr=(f.correction&&typeof f.correction==='object')?f.correction:{};
    const newTone=(f.addrTone||'').trim();
    if(!corr.addressing&&addrToneSameGroup(existing.addrTone,newTone)===false){
      reasons.push(`sắc thái xưng hô mới ("${newTone}") khác hẳn nhóm đã lưu ("${existing.addrTone}") nhưng không kèm correction.addressing`);
    }
  }
  const scanReason=mechanicalAddrScanReason(f,existing,srcText);
  if(scanReason)reasons.push(scanReason);
  return reasons;
}
// Gọi 1 lượt AI XÁC MINH — CHỈ gửi đúng những nhân vật bị code flag nghi vấn (không phải toàn bộ
// chương), kèm lý do nghi vấn cụ thể + văn bản gốc để model tự đối chiếu lại. Chỉ tốn thêm 1 lượt
// gọi khi CÓ nghi vấn thật, và model xác minh luôn so với BẰNG CHỨNG (văn bản gốc). Không throw —
// lỗi thì trả về [] và applyVerifiedOverrides() sẽ tự giữ nguyên đề xuất ban đầu.
// [Bước 4] Xác minh chỉ gửi ĐOẠN TRÍCH quanh chỗ nhắc tới các nhân vật bị flag (không gửi cả chương) để bớt token/lượt.
// Cắt ±CHARMEM_VERIFY_RADIUS ký tự quanh tối đa CHARMEM_VERIFY_MAX_HITS lần xuất hiện (rải đều đầu→cuối) của mỗi nhân vật,
// gộp các đoạn chồng nhau. Trả null (= gửi cả chương như cũ) khi: có nhân vật không tìm thấy chỗ nhắc nào trong văn bản,
// hoặc tổng đoạn trích vượt trần / chiếm ≥ CHARMEM_VERIFY_FULL_RATIO chương (cắt không còn tiết kiệm được gì).
const CHARMEM_VERIFY_RADIUS=260;
const CHARMEM_VERIFY_MAX_HITS=6;
const CHARMEM_VERIFY_MAX_EXCERPT_CHARS=20000;
const CHARMEM_VERIFY_FULL_RATIO=0.7;
function charmemHitPositions(lowerText,needle){
  const ln=String(needle||'').normalize('NFC').trim().toLowerCase();
  if(!ln)return [];
  const wordCh=/[a-zA-ZÀ-ỹ\u0300-\u036f0-9_]/;
  const cjk=containsCJK(ln);
  if(!cjk&&ln.length<2)return [];
  const hits=[];let i=0,guard=0;
  while(guard++<2000&&(i=lowerText.indexOf(ln,i))!==-1){
    const prev=i>0?lowerText[i-1]:'',next=i+ln.length<lowerText.length?lowerText[i+ln.length]:'';
    if(cjk||(!(prev&&wordCh.test(prev))&&!(next&&wordCh.test(next))))hits.push([i,ln.length]);
    i+=ln.length;
  }
  return hits;
}
function buildVerifyExcerpts(text,flagged){
  try{
    const t=String(text||'').normalize('NFC');
    if(!t||!flagged||!flagged.length)return null;
    const lower=t.toLowerCase();
    const ranges=[];
    for(const x of flagged){
      const it=x.item||{};
      const needles=[it.name,it.originalName,it.sinoAlias,it.addrQuote]
        .concat(Array.isArray(it.aliases)?it.aliases:[],Array.isArray(it.nicknames)?it.nicknames:[])
        .filter(v=>typeof v==='string'&&v.trim());
      let hits=[];
      needles.forEach(n=>{hits=hits.concat(charmemHitPositions(lower,n));});
      if(!hits.length)return null; // không có chỗ nhắc nào để cắt quanh -> không dám cắt, gửi cả chương
      hits.sort((a,b)=>a[0]-b[0]);
      // bỏ chỗ nhắc quá sát nhau (cùng 1 đoạn) rồi chọn rải đều tối đa MAX_HITS
      const spread=[];hits.forEach(h=>{if(!spread.length||h[0]-spread[spread.length-1][0]>CHARMEM_VERIFY_RADIUS)spread.push(h);});
      let pick=spread;
      if(spread.length>CHARMEM_VERIFY_MAX_HITS){
        pick=[];for(let k=0;k<CHARMEM_VERIFY_MAX_HITS;k++)pick.push(spread[Math.round(k*(spread.length-1)/(CHARMEM_VERIFY_MAX_HITS-1))]);
      }
      pick.forEach(h=>ranges.push([Math.max(0,h[0]-CHARMEM_VERIFY_RADIUS),Math.min(t.length,h[0]+h[1]+CHARMEM_VERIFY_RADIUS)]));
    }
    ranges.sort((a,b)=>a[0]-b[0]);
    const merged=[];
    ranges.forEach(r=>{const l=merged[merged.length-1];if(l&&r[0]<=l[1])l[1]=Math.max(l[1],r[1]);else merged.push([r[0],r[1]]);});
    const total=merged.reduce((n,r)=>n+(r[1]-r[0]),0);
    if(total>CHARMEM_VERIFY_MAX_EXCERPT_CHARS||total>=t.length*CHARMEM_VERIFY_FULL_RATIO)return null;
    return {text:merged.map(r=>t.slice(r[0],r[1]).trim()).join('\n[…]\n'),chars:total,full:t.length};
  }catch(e){return null;}
}
// model = model chính (A), fallbackModel = dự phòng (B, chỉ dùng khi còn chỗ — xem charmemModelHasRoom).
async function verifyFlaggedCharacters(flagged,ch,keys,promptGuidance,model,fallbackModel){
  if(!flagged.length)return [];
  // [Bước 3+4] Chọn model: chính trước, dự phòng sau; model hết quota ngày thì bỏ (không còn model nào -> như khi verify lỗi:
  // giữ đề xuất, applyVerifiedOverrides gắn 'unverified', chương sau verify lại).
  const _cands=[model].concat(fallbackModel&&fallbackModel!==model?[fallbackModel]:[]);
  if(!_cands.some((m,i)=>charmemOptionalAllowed(m,keys,i===0?'xác minh':'xác minh (dự phòng)')))return [];
  try{
    console.log(`[Luồng 1][Xác minh] Code phát hiện ${flagged.length} nhân vật có dấu hiệu nghi vấn — gọi xác minh lại...`);
    const protagonist=S.characters.find(c=>isCharProtagonist(c));
    const protagonistLine=protagonist
      ?`Nhân vật chính của truyện đã được xác định là: "${protagonist.name}". Dùng CHÍNH XÁC người này làm mốc khi xác định "relationship" bên dưới.\n\n`
      :`Chưa xác định được nhân vật chính cụ thể — tự suy luận dựa vào người kể chuyện ngôi thứ nhất ("ta","tôi") hoặc nhân vật trung tâm của chương, rồi dùng người đó làm mốc.\n\n`;
    const guidanceLine=promptGuidance
      ?`CHỈ DẪN THÊM từ prompt dịch chính của người dùng (chỉ tham khảo, ưu tiên thấp hơn bằng chứng thật trong văn bản gốc bên dưới):\n${promptGuidance}\n\n`
      :'';
    const list=flagged.map(x=>({
      name:x.item.name,originalName:x.item.originalName,
      de_xuat:{gender:x.item.gender,relationship:x.item.relationship,addrThemToMc:x.item.addrThemToMc,addrMcToThem:x.item.addrMcToThem,addrTone:x.item.addrTone,narrRef:x.item.narrRef},
      nghi_van:x.reasons
    }));
    const _fullSrc=applyCharNameSubstitution(charmemRawSource(ch)).slice(0,CHARMEM_ANALYSIS_MAX_CHARS);
    const _ex=buildVerifyExcerpts(_fullSrc,flagged);
    if(_ex)console.log(`[Luồng 1][Xác minh] Chỉ gửi đoạn trích: ${_ex.chars}/${_ex.full} ký tự (${Math.round(100*_ex.chars/_ex.full)}% chương).`);
    const srcSection=_ex
      ?`CÁC ĐOẠN TRÍCH TỪ VĂN BẢN GỐC (cắt quanh những chỗ nhắc tới từng nhân vật trong danh sách; các đoạn ngăn cách bằng dòng "[…]", phần giữa các đoạn đã bị lược). CHỈ dựa vào những gì có trong các đoạn dưới đây; không thấy đủ bằng chứng thì giữ nguyên đề xuất và đặt addrEvidence="suy đoán", KHÔNG tự suy diễn phần bị lược:\n${_ex.text}`
      :`VĂN BẢN GỐC CỦA CHƯƠNG:\n${_fullSrc}`;
    const prompt=`Bạn là bước XÁC MINH LẠI kết quả trích xuất nhân vật vừa thực hiện cho 1 chương truyện. Hệ thống (bằng code, không phải AI) đã phát hiện các nhân vật dưới đây có dấu hiệu nghi vấn (xem "nghi_van" của từng người) cần đọc lại văn bản gốc để xác nhận hoặc sửa lại. `+
      `Với MỖI nhân vật, đối chiếu "de_xuat" (đề xuất ban đầu) với văn bản gốc bên dưới, rồi trả về giá trị ĐÚNG NHẤT — giữ nguyên đề xuất cũ nếu xác nhận đúng, hoặc sửa lại nếu văn bản gốc cho thấy khác.\n\n`+
      protagonistLine+guidanceLine+
      `"addrTone" CHỈ được chọn 1 trong các giá trị: ${CHARMEM_ADDR_TONES.join(', ')}, hoặc "Chưa rõ". `+
      `"relationship" LUÔN tính theo nhân vật chính nêu trên, KHÔNG phải với nhân vật phụ khác, và KHÔNG được là chức vụ/nghề nghiệp trừ khi chính nó là quan hệ trực tiếp với nhân vật chính. `+
      `Riêng với nghi vấn "lệch cặp" (self/callsMc hoặc self/callsThem thuộc 2 kiểu quan hệ khác nhau): đối chiếu lại văn bản gốc xem đối phương thực sự được gọi là gì, rồi sửa lại đúng 1 cặp đối xứng theo ĐÚNG kiểu quan hệ đó — không tự ý giữ nguyên cặp lệch nếu văn bản gốc không xác nhận rõ.\n\n`+
      `Riêng "gender": CHỈ đổi so với giá trị "de_xuat" khi văn bản gốc có MỘT TRONG các bằng chứng THẬT SỰ sau — danh xưng/xưng hô chỉ rõ giới tính (sư huynh/sư tỷ, ca ca/tỷ tỷ, công tử/cô nương...), `+
      `từ xưng hô gia đình rõ giới tính (cha/mẹ/anh trai/chị gái...), đại từ nhân xưng ngôi 3 rõ giới tính (nàng, hắn, y, thị...), hoặc nhân vật TỰ XƯNG/được xác nhận trực tiếp là nam/nữ. `+
      `TUYỆT ĐỐI KHÔNG dùng MÔ TẢ NGOẠI HÌNH/TRANG PHỤC (VD "mặc váy đỏ", "để tóc dài", "dáng người mảnh khảnh") làm căn cứ đổi gender — những chi tiết này KHÔNG đáng tin (có thể là cải trang, giả trang, hoặc chỉ đơn thuần không liên quan đến giới tính thật), kể cả khi nhân vật đang cải trang/đóng giả khác giới trong đúng đoạn văn bản này. `+
      `CŨNG TUYỆT ĐỐI KHÔNG dùng danh xưng/tự xưng chỉ thể hiện ĐỊA VỊ/QUYỀN LỰC/TUỔI TÁC/SỰ TÔN KÍNH — dùng chung được cho cả 2 giới — làm căn cứ (VD "bản toạ"/"bổn toạ", "đại nhân", "các hạ", "tại hạ", "tiền bối", "bệ hạ", "chủ nhân"), dù cách đọc truyện quen thuộc hay liên tưởng nhầm những từ này sang 1 giới cụ thể. `+
      `Nếu KHÔNG tìm thấy bằng chứng hợp lệ nào trong các loại kể trên, PHẢI giữ nguyên gender="de_xuat.gender" (không đổi) và đặt "correction":{"gender":false}, dù cách xưng hô/ngoại hình có gợi ý khác đi.\n\n`+
      `Với mỗi nhân vật, nếu xác nhận được xưng hô từ lời thoại THẬT: điền "addrQuote" = đoạn lời thoại chép NGUYÊN VĂN từ văn bản gốc (khoảng 3-12 từ; chữ Hán khoảng 4-20 chữ) và "addrEvidence":"trực tiếp". Không tìm được thì "addrQuote":"" và "addrEvidence":"suy đoán". Hệ thống sẽ tìm lại đoạn trích trong văn bản gốc.\n\n`+
      `DANH SÁCH CẦN XÁC MINH:\n${JSON.stringify(list)}\n\n`+
      `Chỉ trả về JSON, không thêm văn bản/giải thích/markdown fence nào khác. PHẢI có đủ 1 entry cho MỖI nhân vật trong danh sách trên, dùng đúng "name" đã cho, addrThemToMc/addrMcToThem dùng ĐÚNG định dạng mảng object có cấu trúc như sau (KHÔNG dùng chuỗi "self/other" cũ):\n`+
      `{"characters":[{"name":"...","gender":"Nam"|"Nữ"|"Chưa rõ","relationship":"...","addrThemToMc":[{"self":"...","callsMc":"..."}],"addrMcToThem":[{"self":"...","callsThem":"..."}],"addrEvidence":"trực tiếp"|"suy đoán"|"không có hội thoại","addrQuote":"...","addrTone":"...","narrRef":"...","correction":{"gender":true|false,"relationship":true|false,"addressing":true|false,"narrRef":true|false,"affinity":true|false,"reason":"..."}}]}\n\n`+
      srcSection;
    const messages=[{role:'user',parts:[{text:prompt}]}];
    let rawText=null;
    for(let ci=0;ci<_cands.length;ci++){
      const m=_cands[ci];
      if(!charmemOptionalAllowed(m,keys,ci===0?'xác minh':'xác minh (dự phòng)'))continue;
      if(ci>0&&!charmemModelHasRoom(m,keys)){console.log('[Luồng 1][Xác minh] Model dự phòng không còn chỗ — không chuyển.');continue;}
      try{rawText=await callCharModel(keys,m,messages,CHAR_ANALYSIS_TIMEOUT_MS,ci===0?'verify':'verify-fb');break;}
      catch(e){console.log(`[Luồng 1][Xác minh] Model ${m===CHAR_MODEL_A?'A':m===CHAR_MODEL_B?'B':m} lỗi${ci<_cands.length-1?', thử model dự phòng':''}:`,e.message||e);}
    }
    if(rawText==null){console.log('[Luồng 1][Xác minh] Không gọi được model nào — giữ nguyên đề xuất ban đầu.');return [];}
    const parsed=parseCharacterJSON(rawText);
    const resolved=(parsed&&Array.isArray(parsed.characters))?parsed.characters.map(normalizeExtractedCharacter):[];
    console.log('[Luồng 1][Xác minh] Xác minh hoàn tất.');
    return resolved;
  }catch(e){
    console.log('[Luồng 1][Xác minh] Xác minh lỗi — giữ nguyên đề xuất ban đầu:',e.message||e);
    return [];
  }
}
// Ghi đè kết quả đã xác minh (nếu có) trở lại vào danh sách "found" gốc, theo đúng "name". Nhân vật
// không nằm trong danh sách xác minh (không bị flag, hoặc model xác minh bỏ sót) giữ nguyên đề xuất
// ban đầu — không có gì để mất so với luồng cũ.
// Trước đây ghép theo "name" thuần: 2 entry CÙNG TÊN trong 1 chương (2 người khác giới trùng tên) sẽ cùng
// nhận 1 kết quả xác minh, và entry KHÔNG bị flag cũng bị ghi đè nhầm. Nay: (1) chỉ ghi đè đúng các entry
// đã được gửi đi xác minh (flagged, so bằng tham chiếu đối tượng); (2) mỗi kết quả xác minh chỉ dùng 1 lần,
// theo thứ tự (danh sách gửi đi và danh sách trả về cùng thứ tự flagged).
function applyVerifiedOverrides(found,verified,flagged){
  verified=Array.isArray(verified)?verified:[];
  const flaggedSet=Array.isArray(flagged)?new Set(flagged.map(x=>x.item)):null;
  const used=new Set();
  return found.map(f=>{
    if(flaggedSet&&!flaggedSet.has(f))return f;
    const vi=verified.findIndex((x,i)=>!used.has(i)&&normKey(x.name)===normKey(f.name));
    if(vi===-1){
      // Lượt xác minh lỗi/timeout/bỏ sót nhân vật này: vẫn giữ đề xuất ban đầu (như trước) nhưng ĐÁNH DẤU
      // chưa xác minh, để mergeAnalysisResults lưu cờ addrTrust='unverified' và chương sau ưu tiên verify lại.
      return hasAddrValueOf(f)?{...f,addrTrust:'unverified'}:f;
    }
    used.add(vi);
    const v=verified[vi];
    const merged={...f,...v,name:f.name,originalName:f.originalName||v.originalName||'',sinoAlias:f.sinoAlias||v.sinoAlias||''};
    // Đã được model đọc lại văn bản gốc kèm lý do nghi vấn -> coi là đã xác minh.
    if(hasAddrValueOf(merged))merged.addrTrust='verified';
    return merged;
  });
}

// ===================================================================
// ===== "KIỂM TRA TÊN" — GIÁM KHẢO TÊN (công tắc getNameCheckOn) =====
// ===================================================================
// Vấn đề: thay chuỗi tên gốc (applyCharNameSubstitution) không nhìn ngữ cảnh, nên 1 cách gọi chung bị lấy nhầm làm tên
// ("phụ thân" trong "Phụ thân Nhị Cẩu" -> mọi chữ "phụ thân" bị đổi), và 1 chức danh dùng chung ("tiểu nhị" ở tiệm gạo và
// ở tiệm rượu) bị gộp vào 1 record. Sửa bằng bảng từ theo từng ngôn ngữ không mở rộng được, nên tách phán đoán này ra
// 1 lượt gọi model NHẸ, chuyên trách, KHÔNG gắn với ngôn ngữ nào (prompt viết trung lập, văn bản có thể là bất kỳ thứ tiếng):
//   - mục "form": cách viết gốc (origName) của nhân vật ĐÃ CÓ mà chưa được phân loại, có xuất hiện thật trong chương
//                 -> kind ghi vào c.forms[].aiKind (isReplaceForm chỉ thay khi 'proper');
//   - mục "entry": nhân vật vừa được trích xuất ở chương này -> kind của originalName, nameIsLabel (tên chính thực chất là
//                 nhãn vai trò/quan hệ), sameAs (cùng người với record cũ nào, hay người MỚI).
// Chính sách khi lỗi: không có phán quyết = KHÔNG thay chuỗi + gộp theo tên như cũ; chương sau tự thử lại.
// THIẾT KẾ 2 BƯỚC (công tắc "Kiểm tra tên" BẬT):
//   1.1 Trích xuất: model tách TÊN ĐỊNH DANH (originalName) khỏi BIỆT DANH (nicknames) thành 2 trường riêng; biệt danh chỉ vào aliases.
//   1.2 Giám khảo kiểm lại, chỉ trên nhân vật ĐÃ CÓ trong bộ nhớ và có mặt trong chương (đoạn trích ngắn, không đọc lại cả chương):
//       - form: tên gốc/biệt danh chưa phân loại -> aiKind; không phải 'proper' thì rời ô "Tên gốc" sang "Tên gọi khác";
//       - identity: ghi chú đã lưu nêu tên thật mà tên chính còn là nhãn/biệt danh -> applyIdentityVerdicts (có kiểm bằng dữ liệu).
//   Biệt danh không bao giờ bị thay cứng; khi dịch được nhắc là "tên gọi khác" và model dịch theo ngữ cảnh.
const CHARMEM_JUDGE_MAX_ITEMS=14;      // trần số mục mỗi lượt (mục "entry" được ưu tiên trước "form")
const CHARMEM_JUDGE_MAX_CANDS=5;       // trần số record ứng viên gửi kèm mỗi mục entry
const CHARMEM_JUDGE_OTHERS=40;         // số tên nhân vật khác gửi kèm (để nhận ra "cha của X")
// Đoạn trích ±radius ký tự quanh các lần xuất hiện của needle (đầu/giữa/cuối). Rỗng nếu không có mặt NGUYÊN VĂN trong text
// (tên Latin phải đứng riêng thành 1 từ, giống lúc thay thế). Đây là kiểm tra DỮ LIỆU duy nhất, không phải heuristic ngôn ngữ.
function judgeSnippets(text,needle,maxN,radius){
  const t=String(text||'').normalize('NFC'),n=String(needle||'').normalize('NFC').trim();
  if(!t||!n)return [];
  const lt=t.toLowerCase(),ln=n.toLowerCase();
  const wordCh=/[a-zA-ZÀ-ỹ\u0300-\u036f0-9_]/;
  const hits=[];let i=0,guard=0;
  while(guard++<400&&(i=lt.indexOf(ln,i))!==-1){
    const prev=i>0?lt[i-1]:'',next=i+ln.length<lt.length?lt[i+ln.length]:'';
    if(containsCJK(ln)||(!(prev&&wordCh.test(prev))&&!(next&&wordCh.test(next))))hits.push(i);
    i+=ln.length;
  }
  if(!hits.length)return [];
  const pick=[...new Set([hits[0],hits[Math.floor(hits.length/2)],hits[hits.length-1]])].slice(0,maxN||3);
  return pick.map(p=>t.slice(Math.max(0,p-radius),Math.min(t.length,p+ln.length+radius)).replace(/\s+/g,' ').trim());
}
// Record ứng viên "có thể là cùng người" với 1 entry vừa trích xuất: khớp tên/alias/originalName, cộng các record cùng
// gốc tên khác hậu tố " (2)", " (3)" (do chính bước này tạo ra) — những record đó khớp theo name sẽ không tới được.
function judgeCandidateRecords(f){
  const base=v=>normKey(String(v||'').normalize('NFC')).replace(/\s*\(\d+\)\s*$/,'');
  const name=(f.name||'').trim();
  const out=new Set(findAllCharsByNameOrAlias([name,...parseOrigNames(f.originalName||''),(f.sinoAlias||'').trim()]));
  const nb=base(name);
  if(nb)(S.characters||[]).forEach(x=>{if(base(x.name)===nb)out.add(x);});
  const last=x=>Math.max(-1,...(x.mentionChapters||[]).filter(Number.isFinite));
  return [...out].sort((a,b)=>last(b)-last(a)).slice(0,CHARMEM_JUDGE_MAX_CANDS);
}
function _judgeHasAiKind(c,text){
  const k=normKey(String(text||'').normalize('NFC'));
  return charForms(c).some(f=>normKey(String(f.text).normalize('NFC'))===k&&f.aiKind);
}
// Gom các mục cần phán quyết. CHỈ gọi model khi có việc (chương đầu nhiều, về sau gần như bằng 0).
function collectNamingJudgeItems(found,rawText){
  const items=[];
  const chNo=i=>{try{return chNum(i);}catch(e){return i;}};
  const entryOrigs=new Set();
  (found||[]).forEach(f=>{
    if(items.length>=CHARMEM_JUDGE_MAX_ITEMS)return;
    const name=(f.name||'').trim();
    if(!name||!f._jid)return;
    const origs=parseOrigNames(f.originalName||'');
    const orig=origs[0]||'';
    const cands=judgeCandidateRecords(f);
    // Cờ do AI/code ghi từ các lần trước (không phải heuristic ngôn ngữ): record đang là nhãn tạm hoặc đã bị giám khảo gắn "nhãn".
    const labelCand=cands.some(x=>x.namePlaceholder||x.nameLabelByJudge);
    const origUnclassified=!!orig&&!cands.some(x=>_judgeHasAiKind(x,orig));
    if(!(cands.length===0||labelCand||origUnclassified))return;
    const snips=judgeSnippets(rawText,orig||name,3,60);
    if(!orig&&!snips.length)return;                 // không có chữ gốc lẫn đoạn trích -> không có gì để xét
    if(orig&&!snips.length&&!cands.length)return;   // form phải có mặt thật trong chương
    if(orig)entryOrigs.add(normKey(orig));
    items.push({
      id:f._jid,type:'entry',name,original:orig,excerpts:snips,
      // originals/aliases: để giám khảo thấy TÊN GỐC của ứng viên — tên dịch trùng chưa chứng minh cùng người.
      candidates:cands.map(x=>({id:x.id,name:x.name,originals:charOrigNameList(x).slice(0,4),aliases:(x.aliases||[]).slice(0,8),gender:x.gender||'Chưa rõ',note:String(x.note||'').slice(0,60),
        lastSeenChapter:(()=>{const m=(x.mentionChapters||[]).filter(Number.isFinite);return m.length?chNo(Math.max(...m)):null;})()})),
      _candIds:cands.map(x=>x.id)
    });
  });
  // 1.2 — DANH TÍNH: nhân vật đã có, đang xuất hiện trong chương, tên chính mới chỉ là nhãn/biệt danh mà ghi chú đã lưu có thể đã
  // nêu tên thật. Chỉ hỏi lại khi note đã đổi so với lần kiểm trước (c.identityCheckSig).
  if(items.length<CHARMEM_JUDGE_MAX_ITEMS){
    let mentionedI;
    try{mentionedI=scanMentionedCharIds(rawText);}catch(e){mentionedI=new Set();}
    for(const c of (S.characters||[])){
      if(items.length>=CHARMEM_JUDGE_MAX_ITEMS)break;
      if(!mentionedI.has(c.id)||c.nameSource==='user'||!(c.namePlaceholder||c.nameLabelByJudge))continue;
      const note=String(c.note||'').trim();
      if(!note)continue;
      const sig=normKey(note.normalize('NFC'));
      if(c.identityCheckSig===sig)continue;
      let snips=[];
      for(const t of [...charOrigNameList(c),...(c.aliases||[]),c.name]){snips=judgeSnippets(rawText,t,2,60);if(snips.length)break;}
      items.push({id:'i'+items.length+'-'+c.id,type:'identity',currentName:c.name,note:note.slice(0,400),excerpts:snips,_charId:c.id,_sig:sig});
    }
  }
  // Form chưa phân loại của nhân vật đã có, đang xuất hiện trong chương này (nhiều lượt nhắc trước).
  if(items.length<CHARMEM_JUDGE_MAX_ITEMS){
    let mentioned;
    try{mentioned=scanMentionedCharIds(rawText);}catch(e){mentioned=new Set();}
    const chars=(S.characters||[]).filter(c=>mentioned.has(c.id)&&c.origNameSource!=='user')
      .sort((a,b)=>((b.mentionChapters||[]).length)-((a.mentionChapters||[]).length));
    outer:for(const c of chars){
      for(const fm of charForms(c)){
        if(items.length>=CHARMEM_JUDGE_MAX_ITEMS)break outer;
        if((fm.src!=='orig'&&!isDemotedOrig(c,fm.text))||fm.aiKind||fm.kindLocked||fm.kind==='role_label')continue;   // gồm cả biệt danh do bước 1.1 khai (nằm trong aliases) mà chưa được kiểm  // role_label: danh sách từ đã chặn chắc chắn
        if(entryOrigs.has(normKey(fm.text)))continue;
        const snips=judgeSnippets(rawText,fm.text,3,60);
        if(!snips.length)continue;
        items.push({id:'f'+items.length+'-'+c.id,type:'form',text:fm.text,ownerName:c.name,excerpts:snips,_charId:c.id});
      }
    }
  }
  return items;
}
function buildNamingJudgePrompt(items){
  const others=(S.characters||[]).slice()
    .sort((a,b)=>((b.mentionChapters||[]).length)-((a.mentionChapters||[]).length))
    .slice(0,CHARMEM_JUDGE_OTHERS).map(c=>c.name).filter(Boolean);
  const payload=items.map(it=>{
    const o={id:it.id,type:it.type};
    if(it.type==='entry'){o.name=it.name;o.original=it.original||undefined;o.candidates=it.candidates;}
    else if(it.type==='identity'){o.currentName=it.currentName;o.note=it.note;}
    else{o.text=it.text;o.ownerName=it.ownerName;}
    o.excerpts=it.excerpts;
    return o;
  });
  return `Bạn là bộ phân loại cách gọi nhân vật trong tiểu thuyết. Văn bản có thể thuộc BẤT KỲ ngôn ngữ nào (Trung, Việt, Anh, Hàn, Nhật...). Đừng dựa vào danh sách từ của riêng một ngôn ngữ — hãy đọc đoạn trích (excerpts, lấy từ văn bản gốc) rồi quyết định.\n\n`+
`ĐỊNH NGHĨA "kind" (áp dụng cho cụm "text" ở mục type="form", hoặc cụm "original" ở mục type="entry"):\n`+
`- "proper": tên định danh chính thức của đúng MỘT cá nhân (họ tên đầy đủ hoặc tên riêng, ở bất kỳ ngôn ngữ nào; VD 李明, Ryan, 山田太郎, Nguyễn Văn An).\n`+
`- "nickname": cách gọi PHÁT SINH nhưng cố định, tự nó chỉ đúng MỘT cá nhân: biệt danh, tên gọi tắt/thân mật, hoặc danh xưng/đặc điểm ghép với họ hay tên làm cách gọi quen dùng của người đó (VD 老王, Big Mike, 김 부장). Không phải tên định danh chính thức.\n`+
`- "title_or_relation": chuỗi chỉ vai trò, quan hệ, chức danh, nghề, tuổi, giới hoặc cụm mô tả, dùng được cho NHIỀU người tuỳ ngữ cảnh (VD 掌柜, the old man, お母さん, Mutter, "X's father").\n`+
`CÁCH XÉT: (1) Chỉ xét ĐÚNG chuỗi được đưa; bỏ qua mọi chuỗi dài hơn chứa nó — chuỗi ngắn nằm trong chuỗi dài KHÔNG thừa hưởng loại của chuỗi dài. (2) Tự hỏi: nếu chỉ thấy riêng chuỗi này, không có ngữ cảnh, nó có xác định được đúng một cá nhân không? Không -> "title_or_relation". Có -> "proper" nếu là tên định danh chính thức, "nickname" nếu là cách gọi phát sinh. (3) Đoạn trích chỉ để hiểu nghĩa của chuỗi, KHÔNG dùng để suy ra rằng một chuỗi vai trò đang chỉ một người nên là tên. Không chắc thì chọn "title_or_relation".\n\n`+
`RIÊNG mục type="entry" cần thêm:\n`+
`- "nameIsLabel": true nếu "name" (tên chính của mục) CHƯA phải tên định danh chính thức: nó là nhãn vai trò/quan hệ/mô tả hoặc là biệt danh, trong khi tên chính thức của người đó chưa xuất hiện; false nếu là tên chính thức.\n`+
`- "sameAs": chỉ xét khi có "candidates". Điền id của ĐÚNG MỘT ứng viên nếu đoạn trích/ghi chú cho thấy đây là CÙNG người; điền "new" nếu là người KHÁC (VD cùng chức danh nhưng ở địa điểm/bối cảnh/thời điểm khác, hoặc khác giới); điền null nếu không đủ căn cứ. Cùng một tên/chức danh chung KHÔNG đủ để kết luận là cùng một người. Mỗi ứng viên có thể kèm "originals" (cách viết gốc đã lưu của người đó) và "aliases" (các cách gọi khác đã biết). TÊN DỊCH ("name") trùng nhau CŨNG KHÔNG chứng minh cùng người, vì nhiều tên gốc khác nhau có thể phiên âm ra cùng một tên (VD 李明 và 黎明): nếu "original" của mục KHÁC HẲN mọi "originals" của ứng viên và cũng không phải biệt danh/cách gọi tắt/cách viết khác nằm trong "aliases" của ứng viên đó (xem thêm đoạn trích), thì đó là người KHÁC — điền id của ứng viên khác có "originals" khớp nếu có, không thì "new".\n\n`+
`RIÊNG mục type="identity" (nhân vật đã có; "currentName" có thể mới chỉ là nhãn/biệt danh): đọc "note" (ghi chú đã lưu) và "excerpts". "realName" = tên định danh chính thức của đúng người này NẾU "note" nêu rõ và khác "currentName", viết đúng như trong "note"; "realNameQuote" = cụm chép NGUYÊN VĂN từ "note" có chứa realName; "realNameOriginal" = cách viết trong văn bản gốc nếu thấy trong excerpts, nếu không thì "". Không có căn cứ rõ trong "note" thì realName=null. Không lấy biệt danh, chức danh hay mô tả làm realName.\n\n`+
`Các nhân vật khác trong truyện (để nhận ra cụm "danh xưng + tên người khác"): ${JSON.stringify(others)}\n\n`+
`DANH SÁCH MỤC CẦN PHÂN LOẠI:\n${JSON.stringify(payload)}\n\n`+
`CHỈ trả về DUY NHẤT 1 object JSON, không markdown, không giải thích: {"items":[{"id":"<id mục>","kind":"proper|nickname|title_or_relation","nameIsLabel":true|false,"sameAs":"<id ứng viên>"|"new"|null}]}. Mục type="form" chỉ cần id và kind. Mục type="identity" chỉ cần id, realName, realNameQuote, realNameOriginal (không cần kind). Phải có đủ MỌI id đã cho.`;
}
// Gọi giám khảo. Trả {entries:{<_jid>:{kind,nameIsLabel,sameAs,candIds,original}}}. Verdict cho mục "form" được ghi thẳng vào
// c.forms[].aiKind (lưu cùng lượt saveCharacterMemory của luồng phân tích). Mọi lỗi -> ném ra để nơi gọi bắt, KHÔNG có phán quyết.
async function judgeNamingBatch(found,chapterIdx,rawText,keys){
  const out={entries:{},identities:[]};
  if(!getNameJudgeOn()||!keys||!keys.length)return out;
  const items=collectNamingJudgeItems(found,rawText);
  if(!items.length)return out;
  const messages=[{role:'user',parts:[{text:buildNamingJudgePrompt(items)}]}];
  // Model nhẹ A làm chính (khác model trích xuất chính B để không tranh quota), tự fallback sang B khi lỗi — giống analyzeChapterCharacters.
  const isDeepseek=getProvider()==='deepseek';
  const primary=isDeepseek?getModel():CHAR_MODEL_A;
  const fallback=isDeepseek?null:CHAR_MODEL_B;
  // [Bước 3] Giám khảo là lượt tuỳ chọn: model chính hết quota ngày thì bỏ luôn, KHÔNG đẩy sang B (B còn phải giữ quota cho trích xuất).
  if(!charmemOptionalAllowed(primary,keys,'giám khảo tên'))return out;
  let raw;
  try{raw=await callCharModel(keys,primary,messages,CHAR_ANALYSIS_TIMEOUT_MS,'judge');}
  catch(e){
    // [Bước 5] B là model trích xuất: chỉ mượn làm dự phòng khi B còn chỗ ngay (không giành lượt của trích xuất/xác minh đang chạy song song).
    if(!fallback||!charmemOptionalAllowed(fallback,keys,'giám khảo tên (dự phòng)')||!charmemModelHasRoom(fallback,keys))throw e;
    console.log('[Luồng 1][Kiểm tra tên] Model chính lỗi/timeout, thử model dự phòng...',e.message||e);
    raw=await callCharModel(keys,fallback,messages,CHAR_ANALYSIS_TIMEOUT_MS,'judge-fb');
  }
  const parsed=parseCharacterJSON(raw);
  const list=parsed&&Array.isArray(parsed.items)?parsed.items:null;
  if(!list){console.log('[Luồng 1][Kiểm tra tên] Không parse được JSON — không có phán quyết lượt này. Raw:',raw);return out;}
  const byId=new Map();
  list.forEach(v=>{if(v&&typeof v.id==='string')byId.set(v.id,v);});
  let nForm=0,nEntry=0;
  for(const it of items){
    const v=byId.get(it.id);
    if(!v)continue;
    const kind=CHARMEM_AI_KINDS.includes(v.kind)?v.kind:null;
    if(it.type==='form'){
      if(!kind)continue;
      const c=(S.characters||[]).find(x=>x.id===it._charId);
      if(!c)continue;
      ensureForms(c);
      const fm=(c.forms||[]).find(x=>normKey(String(x.text).normalize('NFC'))===normKey(String(it.text).normalize('NFC')));
      if(fm&&!fm.kindLocked){fm.aiKind=kind;nForm++;if(kind!=='proper')demoteFormFromOrig(c,it.text);console.log(`[Luồng 1][Kiểm tra tên] "${it.text}" (của "${c.name}") -> ${kind}`);}
    }else if(it.type==='identity'){
      const c=(S.characters||[]).find(x=>x.id===it._charId);
      if(!c)continue;
      c.identityCheckSig=it._sig;   // đã xét với note này: không hỏi lại cho tới khi note đổi
      const real=typeof v.realName==='string'?v.realName.trim():'';
      if(!real)continue;
      out.identities.push({charId:c.id,realName:real,quote:typeof v.realNameQuote==='string'?v.realNameQuote:'',
        original:typeof v.realNameOriginal==='string'?v.realNameOriginal.trim():'',note:it.note});
      console.log(`[Luồng 1][Kiểm tra tên] Danh tính "${c.name}": ghi chú nêu tên thật "${real}"`);
    }else{
      let sameAs=null;
      if(v.sameAs==='new')sameAs='new';
      else if(typeof v.sameAs==='string'&&it._candIds.includes(v.sameAs))sameAs=v.sameAs;
      out.entries[it.id]={
        kind:it.original?kind:null,                       // kind chỉ có nghĩa khi có chữ gốc để gắn vào form
        nameIsLabel:typeof v.nameIsLabel==='boolean'?v.nameIsLabel:null,
        sameAs,candIds:it._candIds,original:it.original
      };
      nEntry++;
      console.log(`[Luồng 1][Kiểm tra tên] "${it.name}"${it.original?` (gốc "${it.original}")`:''} -> kind=${kind}, nameIsLabel=${v.nameIsLabel}, sameAs=${sameAs}`);
    }
  }
  console.log(`[Luồng 1][Kiểm tra tên] Chương ${chapterIdx!==undefined?(()=>{try{return chNum(chapterIdx);}catch(e){return chapterIdx;}})():'?'}: ${items.length} mục gửi, ${nForm} form + ${nEntry} entry có phán quyết.`);
  return out;
}
// 1.2: áp kết quả "danh tính" SAU mergeAnalysisResults. Căn cứ phải kiểm được bằng DỮ LIỆU: tên thật phải có trong ghi chú đã lưu;
// 'trực tiếp' (tự đổi tên) chỉ khi câu trích chép đúng nguyên văn từ ghi chú và chứa tên đó, còn lại chỉ đề xuất qua banner.
// Mọi lưới an toàn (tên người dùng khoá, trùng nhân vật khác -> đề xuất nối, chữ Hán...) do applyRealNameReveals xử lý.
function applyIdentityVerdicts(list,srcText,chapterIdx){
  if(!getNameJudgeOn()||!Array.isArray(list)||!list.length)return;
  const nk=v=>normKey(String(v||'').normalize('NFC'));
  list.forEach(it=>{
    const c=(S.characters||[]).find(x=>x.id===it.charId);
    if(!c||c.nameSource==='user'||!c.namePlaceholder)return;
    const notes=[nk(c.note),nk(it.note)].filter(Boolean);
    const real=String(it.realName||'').trim(),rk=nk(real);
    if(!rk||rk===nk(c.name)||!notes.some(n=>n.includes(rk)))return;
    const q=nk(it.quote);
    const direct=!!q&&q.includes(rk)&&notes.some(n=>n.includes(q));
    applyRealNameReveals([{placeholder:c.name,realName:real,originalName:it.original,evidence:direct?'trực tiếp':'suy đoán'}],srcText,chapterIdx);
  });
}
// Áp phán quyết của 1 entry lên record c SAU khi mergeAnalysisResults đã xác định c (gọi từ mergeAnalysisResults).
function applyEntryVerdict(c,f){
  const jv=f&&f._judge;
  if(!jv||!c||!getNameJudgeOn())return;
  if(jv.kind&&jv.original){
    ensureForms(c);
    const k=normKey(String(jv.original).normalize('NFC'));
    (c.forms||[]).forEach(fm=>{
      if(fm.src==='orig'&&!fm.kindLocked&&normKey(String(fm.text).normalize('NFC'))===k)fm.aiKind=jv.kind;
    });
    if(jv.kind!=='proper')demoteFormFromOrig(c,jv.original);
  }
  // nameIsLabel=true: tên chính chỉ là nhãn vai trò/quan hệ -> coi như nhãn tạm (có thể được nâng cấp khi lộ tên thật).
  // [Sửa lỗi tên thật bị gắn lại nhãn] Phán quyết nameIsLabel là về TÊN CỦA ENTRY (f.name) lúc giám khảo xét. Nếu record
  // ĐÃ được nâng lên tên thật (VD "眼鏡女" -> "Lý Tuyết" qua realNameReveals chạy TRƯỚC merge) mà entry nhãn cũ "眼鏡女"
  // vẫn nằm trong `found` và khớp record qua alias, phán quyết "là nhãn" của entry cũ không được phép gắn ngược lên record
  // đang mang tên thật. Chỉ chặn khi record đang KHÔNG phải nhãn và tên entry khác tên hiện tại của record.
  const _ek=normKey(String(f.name||'').normalize('NFC')),_ck=normKey(String(c.name||'').normalize('NFC')),_dk=normKey(String(displayCharName(c)||'').normalize('NFC'));
  const staleLabelVerdict=!c.namePlaceholder&&!c.nameLabelByJudge&&_ek&&_ek!==_ck&&_ek!==_dk;
  if(staleLabelVerdict&&jv.nameIsLabel===true)console.log(`[Luồng 1][Kiểm tra tên] Bỏ phán quyết \"nhãn\" của entry \"${f.name}\" — record đã mang tên thật \"${c.name}\".`);
  if(jv.nameIsLabel===true&&c.nameSource!=='user'&&!staleLabelVerdict){
    if(!c.namePlaceholder)console.log(`[Luồng 1][Kiểm tra tên] "${c.name}" thực chất là nhãn vai trò/quan hệ -> đặt namePlaceholder.`);
    c.namePlaceholder=true;
    c.nameLabelByJudge=true;
  }
}
// Áp phân loại theo NGHĨA của bước "Kiểm tra lại" (f._kinds / f._nameKind) lên record c SAU merge (cùng chỗ với applyEntryVerdict).
// - chuỗi không phải 'proper' rời ô "Tên gốc" sang "Tên gọi khác" (demoteFormFromOrig; không đụng ô người dùng tự điền/khoá);
// - tên chính là biệt danh/chức danh/mô tả -> bật namePlaceholder (hiện nhãn "Biệt danh"); tên đã khoá (nameVerified) hoặc do người dùng đặt thì KHÔNG đụng;
// - 'unsure' hoặc thiếu phân loại: để nguyên, không đoán.
// Truyện gốc chữ Hán? (có ít nhất 1 nhân vật đã lưu tên gốc chứa chữ Hán). Dùng để áp luật "chưa có tên gốc -> Biệt danh":
// truyện không phải chữ Hán thì originalName được phép để trống (trùng name) nên không áp.
// Đồng bộ luật "chưa có tên gốc -> Biệt danh" cho MỌI nhân vật (kể cả tên do người dùng sửa, kể cả nhân vật không xuất hiện lại ở chương mới).
// Chỉ bật cờ, không đổi tên/không khoá. Trả true nếu có đổi. Gọi mỗi lần vẽ danh sách.
function charmemSyncNoOrigLabels(){
  if(!charmemStoryIsCJK())return false;
  let changed=false;
  (S.characters||[]).forEach(c=>{
    if(!c||c.namePlaceholder||c.origNameSource==='user'||charOrigNameList(c).length||containsCJK(String(c.name||'')))return;
    c.namePlaceholder=true;c.namePlaceholderNoOrig=true;changed=true;
  });
  return changed;
}
function charmemStoryIsCJK(){return (S.characters||[]).some(x=>x&&x.origName&&containsCJK(String(x.origName)));}
// Record có ít nhất 1 chuỗi TÊN GỐC được bước "Kiểm tra lại" phân loại 'proper' (tên riêng thật)? ks = f._kinds của lượt này.
function charHasProperOrigForm(c,ks){
  return charOrigNameList(c).some(o=>{
    const k=normKey(String(o).normalize('NFC'));
    if(ks&&ks[k]==='proper')return true;
    return (c.forms||[]).some(fm=>fm&&fm.src==='orig'&&fm.aiKind==='proper'&&normKey(String(fm.text||'').normalize('NFC'))===k);
  });
}
function applyRecheckKinds(c,f){
  if(!c||!f||!getNameCheckOn())return;
  const ks=f._kinds&&typeof f._kinds==='object'?f._kinds:null;
  const hadOrig=charOrigNameList(c).length>0;
  let demotedAny=false;
  ensureForms(c);
  (c.forms||[]).forEach(fm=>{
    if(!fm||fm.kindLocked)return;
    let kd=ks?ks[normKey(String(fm.text||'').normalize('NFC'))]:undefined;
    // Lưới cơ học: chuỗi tên gốc mà bảng chức danh đã nhận là chức danh/tên+chức danh (VD 冲云道长) -> coi là không phải tên riêng.
    if(!kd&&fm.src==='orig'&&fm.kind==='role_label'&&!fm.aiKind)kd='title_or_relation';
    if(!kd)return;
    fm.aiKind=kd;
    if(kd!=='proper'&&fm.src==='orig'&&demoteFormFromOrig(c,fm.text))demotedAny=true;
  });
  // Mọi tên gốc đều bị hạ và không chuỗi nào là 'proper' -> nhân vật chưa có tên thật: đánh dấu "Biệt danh" (không khoá tên đã xác nhận/người dùng đặt).
  if(demotedAny&&hadOrig&&!charOrigNameList(c).length&&c.nameSource!=='user'&&c.origNameSource!=='user'&&!c.namePlaceholder
     &&f._nameKind!=='proper'&&!(ks&&Object.values(ks).includes('proper'))){
    const ek0=normKey(String(f.name||'').normalize('NFC')),ck0=normKey(String(c.name||'').normalize('NFC')),dk0=normKey(String(displayCharName(c)||'').normalize('NFC'));
    if(ek0&&(ek0===ck0||ek0===dk0)){
      delete c.nameVerified;c.namePlaceholder=true;c.nameLabelByJudge=true;
      console.log(`[Luồng 1][Kiểm tra lại] "${c.name}" chỉ có cách gọi kèm chức danh/biệt danh -> chuyển xuống Tên gọi khác, đánh dấu Biệt danh.`);
    }
  }
  // Tên gốc bị hạ xuống alias (là biệt danh/chức danh) -> nhân vật không còn tên gốc thật: gỡ cờ "đã kiểm nghĩa dịch" để khi lộ tên thật còn được kiểm.
  if(demotedAny&&c.nameSource!=='user'&&!charOrigNameList(c).length)delete c.nameTransChecked;
  const nameKind=f._nameKind;
  // [Sửa lỗi 1] Nhãn "tên tạm/Biệt danh" còn sót dù đã có tên gốc: bước trích xuất có thể khai "isPlaceholderName":true (luật "phân vân thì true")
  // lúc tạo record; sau đó bước Kiểm tra lại phân loại tên chính + tên gốc đều là 'proper' nhưng KHÔNG có nhánh nào gỡ nhãn
  // (nhánh gỡ bên dưới chỉ chạy cho nhãn do luật "chưa có tên gốc" đặt = namePlaceholderNoOrig; nhánh nâng cấp ở merge chỉ chạy khi tên ĐỔI).
  // Gỡ khi: tên chính được phân loại 'proper' + có ít nhất 1 tên gốc 'proper' + tên không còn chữ Hán/không phải nhãn mô tả/danh xưng chung.
  if(nameKind==='proper'&&c.nameSource!=='user'&&c.namePlaceholder&&!c.namePlaceholderNoOrig&&!containsCJK(String(c.name||''))
     &&!looksLikePlaceholderCharName(c.name)&&!isGenericAddressTerm(c.name)&&charHasProperOrigForm(c,ks)){
    const ek1=normKey(String(f.name||'').normalize('NFC')),ck1=normKey(String(c.name||'').normalize('NFC')),dk1=normKey(String(displayCharName(c)||'').normalize('NFC'));
    if(ek1&&(ek1===ck1||ek1===dk1)){
      c.namePlaceholder=false;delete c.nameLabelByJudge;
      console.log(`[Luồng 1][Kiểm tra lại] \"${c.name}\" đã có tên gốc và được phân loại là tên riêng -> gỡ nhãn tên tạm/Biệt danh.`);
    }
  }
  // [Sửa lỗi 2] Tên chính đã được đối chiếu đúng nghĩa với 1 tên gốc 'proper' (nameTransChecked) thì chính nó là phiên âm của tên riêng:
  // 1 lượt phân loại lẻ báo 'nickname'/'title_or_relation' cho nó không được gỡ khoá và gắn lại nhãn tên tạm (AI tự mâu thuẫn giữa các chương).
  const nameIsTransOfProper=c.nameTransChecked===true&&charHasProperOrigForm(c,ks);
  if(nameKind&&nameKind!=='proper'&&nameIsTransOfProper&&c.nameSource!=='user'&&!c.namePlaceholder){
    console.log(`[Luồng 1][Kiểm tra lại] Bỏ phân loại ${nameKind} của \"${c.name}\": tên đã đối chiếu là phiên âm của tên gốc 'proper' -> giữ nguyên, không gắn nhãn tên tạm.`);
  } else
  if(nameKind&&nameKind!=='proper'&&c.nameSource!=='user'&&!c.namePlaceholder){
    // Chặn phán quyết cũ: chỉ áp khi tên entry chính là tên hiện tại của record (record có thể đã được nâng lên tên thật).
    const ek=normKey(String(f.name||'').normalize('NFC')),ck=normKey(String(c.name||'').normalize('NFC')),dk=normKey(String(displayCharName(c)||'').normalize('NFC'));
    if(ek&&(ek===ck||ek===dk)){
      // nameVerified chỉ do chính bước Kiểm tra lại đặt (người dùng khoá thì nameSource==='user', đã loại ở trên) và bản cũ khoá cả khi chưa phân loại
      // -> phán quyết mới "không phải tên riêng" được phép gỡ khoá do chính bước này đặt.
      if(c.nameVerified===true){delete c.nameVerified;console.log(`[Luồng 1][Kiểm tra lại] Gỡ khoá tên "${c.name}" (khoá cũ khi chưa phân loại), vì bị phân loại ${nameKind}.`);}
      c.namePlaceholder=true;c.nameLabelByJudge=true;
      console.log(`[Luồng 1][Kiểm tra lại] "${c.name}" là ${nameKind}, chưa phải tên riêng -> đặt namePlaceholder.`);
    }
  }
  // LUẬT: chưa có tên gốc -> LUÔN là Biệt danh và không được khoá tên (phải điền được tên gốc mới khoá). Có tên gốc + tên chính 'proper' -> gỡ nhãn do luật này đặt.
  if(c.origNameSource!=='user'&&charmemStoryIsCJK()){   // kể cả tên do người dùng đặt: chỉ bật/tắt nhãn, KHÔNG đổi tên
    if(!charOrigNameList(c).length){
      if(c.nameVerified===true)delete c.nameVerified;
      if(!c.namePlaceholder){c.namePlaceholder=true;c.namePlaceholderNoOrig=true;console.log(`[Luồng 1][Kiểm tra lại] "${c.name}" chưa có tên gốc -> đánh dấu Biệt danh.`);}
    }else if(c.namePlaceholderNoOrig&&c.namePlaceholder&&f._nameKind==='proper'){
      c.namePlaceholder=false;delete c.namePlaceholderNoOrig;
      console.log(`[Luồng 1][Kiểm tra lại] "${c.name}" đã có tên gốc và là tên riêng -> bỏ nhãn Biệt danh.`);
    }
  }
}

// ===================================================================
// ===== "KIỂM TRA LẠI THÔNG TIN" — ĐỌC LẠI KẾT QUẢ BƯỚC PHÂN TÍCH (công tắc getNameCheckOn) =====
// ===================================================================
// Chạy SAU bước phân tích (model A; đã bỏ giám khảo tên + xác minh xưng hô), TRƯỚC khi merge vào bộ nhớ. CHỈ đọc dữ liệu do bước phân tích
// vừa trả về (KHÔNG gửi văn bản chương). Việc làm: (1) xếp lại tên/biệt danh nếu bước trước xếp sai, (2) dịch nốt chữ Hán còn sót
// (trừ tên gốc + tên khác), (3) sửa xưng hô cho đúng HỆ thể loại nhưng CÙNG cấp/vai vế (theo bộ xưng hô thường gặp + danh sách cần
// tránh), (4) điền lại đầy đủ các trường sau khi sửa, (1a) KIỂM TRA NGHĨA DỊCH CỦA TÊN: đối chiếu "name" với tên gốc, nếu dịch/phiên âm sai thì DỊCH LẠI cho đúng (chỉ từ chính tên gốc; xem nameTransCheck/nameTransChecked), (5) PHÂN LOẠI từng chuỗi tên theo nghĩa (proper/nickname/title_or_relation/unsure -> f._kinds/f._nameKind, áp bởi applyRecheckKinds; chỉ khoá nameVerified khi tên chính là 'proper'). Lỗi/timeout -> giữ nguyên kết quả bước phân tích (không chặn luồng).
const CHARMEM_RECHECK_MAX_ITEMS=30;
function _recheckAddrArr(str,otherKey){
  if(!str||isAddrUnknown(str))return [];
  return splitAddrCandidates(str).map(ch=>{const p=parseAddrChoice(ch);return {self:p.self,[otherKey]:p.other};}).filter(o=>o.self||o[otherKey]);
}
// ===== GỘP TỰ ĐỘNG THEO THẺ AI ĐÁNH DẤU (kin / bodyOf) — AI chỉ gắn thẻ ngắn cho TỪNG nhân vật, code làm hết việc so khớp/gộp =====
//  "bodyOf":"MC"            -> nhân vật này là thân xác/thân phận của nhân vật chính: gộp vào MC, tên thành alias của MC.
//  "kin":{role,of}          -> role ∈ CHARMEM_KIN_ROLES (cố định, không phụ thuộc ngôn ngữ), of = tên người (hoặc "MC").
//     Code đổi "of" về đúng người (kể cả khi "of" là alias/thân xác của MC -> thành MC) rồi lưu rec.kin={role,of:'MC'|recId,chapter}.
//     Các record cùng role DUY NHẤT (cha/mẹ/vợ/chồng) + cùng "of" + không lệch giới -> gộp (record tên thật giữ lại, nhãn tạm thành alias).
//     Role không duy nhất (anh/chị/em/con/thầy/trò) KHÔNG tự gộp vì có thể là 2 người khác nhau.
const CHARMEM_KIN_ROLES=['cha','mẹ','vợ','chồng','ông nội','ông ngoại','bà nội','bà ngoại','cha vợ','mẹ vợ','cha chồng','mẹ chồng','cha nuôi','mẹ kế',
  'anh','chị','em','con','con dâu','con rể','chú','bác','cô','dì','cậu','cháu','anh chị em họ','anh chị em kết nghĩa','bạn','người yêu','thầy','trò'];
// Vai mỗi người chỉ có 1 -> record cùng (vai, of) được tự gộp. Các vai còn lại (anh/chị/em, con, con dâu/rể, chú/bác/cô/dì/cậu, cháu, họ, kết nghĩa, bạn, người yêu, thầy/trò) chỉ lưu thẻ, KHÔNG tự gộp.
const CHARMEM_KIN_UNIQUE_ROLES=['cha','mẹ','vợ','chồng','ông nội','ông ngoại','bà nội','bà ngoại','cha vợ','mẹ vợ','cha chồng','mẹ chồng','cha nuôi','mẹ kế'];
// Gợi ý quy đổi từ ngữ cho prompt (dùng chung cho prompt trích xuất và prompt kiểm tra lại).
const CHARMEM_KIN_HINT='"thầy" = nhân vật NÀY là thầy/sư phụ của người "of"; "trò" = nhân vật NÀY là đệ tử/học trò của người "of" (VD Thanh Phong là đệ tử của Xung Vân đạo trưởng -> {"role":"trò","of":"Xung Vân đạo trưởng"}, KHÔNG phải "thầy"); phụ thân/mẫu thân quy về cha/mẹ; nhạc phụ/nhạc mẫu = cha vợ/mẹ vợ; cha/mẹ của chồng = cha chồng/mẹ chồng; cha/mẹ nuôi, mẹ kế dùng ĐÚNG vai riêng (cha nuôi, mẹ kế), KHÔNG quy về cha/mẹ; ông/bà phải ghi rõ nội hay ngoại; chú/bác/cô/dì/cậu giữ đúng từ';
function normKinRole(r){
  const t=String(r==null?'':r).normalize('NFC').trim().toLowerCase();
  return CHARMEM_KIN_ROLES.includes(t)?t:'';
}
function _isMcMark(v){return String(v==null?'':v).normalize('NFC').trim().toLowerCase()==='mc';}
function _kinIsRealName(c){return !c.namePlaceholder&&!c.nameLabelByJudge&&!looksLikePlaceholderCharName(c.name);}
// Gộp src vào tgt rồi sửa các kin.of đang trỏ tới src (trỏ tới MC thì ghi 'MC').
function _kinMerge(src,tgt,merged,path,preSrc){
  const toMc=isCharProtagonist(tgt);
  mergeCharacterInto(src,tgt,{auto:true,path:path||'the-kin',preSrc:preSrc||null});
  (S.characters||[]).forEach(c=>{if(c&&c.kin&&c.kin.of===src.id)c.kin.of=toMc?'MC':tgt.id;});
  if(merged){
    merged.forEach((v,k)=>{if(v&&v.id===src.id)merged.set(k,tgt);});   // chuỗi gộp: A->B rồi B->C thì A cũng trỏ C
    merged.set(src.id,tgt);
  }
}
// Công tắc: cho phép gộp thân xác vào MC khi AI gắn ĐỒNG THỜI bodyOf=MC và isProtagonist=true cho record đó (AI hay làm vậy với tên thân xác
// mới của MC, vd "Vương Vũ"). Đặt false nếu truyện có song nhân vật chính và AI hay gắn nhầm bodyOf=MC cho nhân vật chính thứ hai.
// [Fix gộp nhầm] true = khớp chỉ qua alias lỏng (không đối chiếu được tên gốc) thì TÁCH record + đề xuất nối thay vì ghép luôn.
const CHARMEM_SPLIT_UNVERIFIED_ALIAS=true;
// [Fix gộp nhầm] false = nhân vật gắn isProtagonist + bodyOf=MC không còn tự gộp (xem applyIdentityMarks).
const CHARMEM_MERGE_BODYOF_WHEN_FLAGGED_PROTAGONIST=false;
// [Fix gộp nhầm] Chính sách: bodyOf=MC và thẻ kin (cùng vai cha/mẹ/vợ/chồng của cùng 1 người) CHỈ ĐỀ XUẤT, không tự gộp.
// Bật true để quay lại hành vi tự gộp cũ (vẫn qua các lưới bên dưới). Chưa có tín hiệu cơ học để cho phép ngoại lệ.
const CHARMEM_BODYOF_AUTO_MERGE=false;
const CHARMEM_KIN_AUTO_MERGE=false;
// ===== PHÁN QUYẾT "CÙNG MỘT NGƯỜI" CỦA BƯỚC KIỂM TRA LẠI (samePersonAs) =====
// Bước kiểm tra lại là lượt AI thẩm định cuối, đọc được cả danh sách nên đáng tin hơn các lưới heuristic. Khi nó khẳng định
// mục A chính là MC / mục B trong chương / nhân vật đã lưu (maybeSame) thì GỘP THẲNG, không còn đi qua sameAsSafetyBlock
// (giới tính/tuổi/quan hệ/tên gốc), công tắc bodyOf+isProtagonist hay lưới "đã là nhân vật chính".
// Lưới DUY NHẤT còn giữ: cặp người dùng đã bấm "Không phải" (charMergeRejected) — đó là quyết định của chính người dùng.
// Đặt false để quay về hành vi cũ (phán quyết bị bỏ qua).
// [Fix gộp nhầm] CẬP NHẬT: các chú thích phía trên là hành vi CŨ. Nay phán quyết chỉ được GHI THÀNH ĐỀ XUẤT (sameAs 'suggested')
// để người dùng duyệt ở banner, KHÔNG còn gộp thẳng — vì bước này không đọc văn bản chương nên không kiểm chứng được. Xem applyRecheckVerdicts.
const CHARMEM_RECHECK_VERDICT_MERGE=true;
function applyRecheckVerdicts(found,chapterIdx){
  const out={log:[],merged:new Map()};
  if(!Array.isArray(found))return out;
  const list=()=>S.characters||[];
  const find1=(name,orig,gender)=>{
    const tries=[name,...parseOrigNames(orig||'')].filter(Boolean);
    for(const n of tries){let r=null;try{r=findCharByNameOrAlias(String(n).trim(),gender)||null;}catch(e){r=null;}if(r)return r;}
    return null;
  };
  const score=c=>(_kinIsRealName(c)?100:0)+(c.nameSource==='user'?50:0)+((c.mentionChapters||[]).length||c.mentionCount||0);
  found.forEach(f=>{
    if(!f||!f._aiSame)return;
    const v=f._aiSame;delete f._aiSame;
    if(!CHARMEM_RECHECK_VERDICT_MERGE)return;
    const a=find1(f.name,f.originalName,f.gender);
    let b=null;
    if(v.mc)b=list().find(c=>c&&isCharProtagonist(c))||null;
    else if(v.recId)b=list().find(c=>c&&c.id===v.recId)||null;
    else b=find1(v.name,v.orig);
    if(!a||!b||a.id===b.id)return;
    if(!list().includes(a)||!list().includes(b))return;
    if(isMergePairRejected(a.id,b.id)){
      if(!isMergePairAuto(a.id,b.id))out.log.push(`AI kiểm tra lại cho rằng "${a.name}" = "${b.name}" nhưng người dùng đã bấm "Không phải" cho cặp này -> bỏ qua`);
      return;   // cặp 'auto' (hệ thống tự ghi) thì im lặng
    }
    // [Fix gộp nhầm] CHỈ ĐỀ XUẤT, KHÔNG GỘP. Bước Kiểm tra lại không đọc văn bản chương (chỉ thấy dữ liệu có cấu trúc, trong đó
    // relationship của 2 người bạn của MC giống nhau) nên phán quyết của nó không kiểm chứng được. Ghi liên kết 'suggested' để
    // người dùng duyệt ở banner "Nối / Không phải". Chốt chặn cứng giới tính/tên gốc áp cho cặp không có MC (cặp có MC: thân xác
    // xuyên không có thể khác tên gốc/giới tính hợp lệ nên để người dùng quyết).
    const pa=isCharProtagonist(a),pb=isCharProtagonist(b);
    if(!pa&&!pb){
      const why=sameAsSafetyBlock(a,b);
      if(why==='gender'||why==='origname'){
        out.log.push(`AI kiểm tra lại cho rằng "${a.name}" = "${b.name}" nhưng ${describeMergeBlock(a,b,why)} -> bỏ qua`);
        markMergePairRejected(a.id,b.id,'auto');
        return;
      }
    }
    const res=recordSameAsProposal(S.characters,a,b,{direct:false,evidence:'AI kiểm tra lại (không đọc văn bản chương) cho rằng cùng một người',chapter:chapterIdx});
    out.log.push(`AI kiểm tra lại cho rằng "${a.name}" = "${b.name}" -> chỉ đề xuất (${res}), chờ người dùng duyệt`);
  });
  return out;
}
function applyIdentityMarks(found,chapterIdx){
  const out={log:[],merged:new Map()};
  if(!Array.isArray(found)||!found.length)return out;
  const list=()=>S.characters||[];
  const mc=list().find(c=>c&&isCharProtagonist(c));
  const byName=(name,gender)=>{
    const n=String(name==null?'':name).trim();
    if(!n)return null;
    try{return findCharByNameOrAlias(n,gender)||null;}catch(e){return null;}
  };
  const resolveFound=f=>byName(f&&f.name,f&&f.gender)||byName(f&&f.originalName,f&&f.gender);
  const chLabel=i=>(typeof i==='number'?(typeof _chn==='function'?_chn(i):(i+1)):'?');
  // (0) GHI NHỚ thẻ bodyOf=MC lên chính record, kể cả khi CHƯA có nhân vật chính để gộp vào (VD ch.1: "Trụ Tử" được gắn thẻ
  // trước khi MC được xác nhận ở ch.2). Trước đây thẻ chỉ sống trong 1 lượt rồi mất -> record mồ côi mãi mãi.
  // Thẻ chỉ là bản ghi "AI đã khẳng định"; việc gộp vẫn đi qua đúng các lưới bên dưới (cặp bị từ chối, MC...).
  found.forEach(f=>{
    if(!f||!_isMcMark(f.bodyOf))return;
    if(f.isProtagonist===true&&!CHARMEM_MERGE_BODYOF_WHEN_FLAGGED_PROTAGONIST)return;
    const rec=resolveFound(f);
    if(!rec||(mc&&rec.id===mc.id)||isCharProtagonist(rec))return;
    if(!Array.isArray(rec.mcBodyMarks))rec.mcBodyMarks=[];
    if(typeof chapterIdx==='number'&&!rec.mcBodyMarks.includes(chapterIdx))rec.mcBodyMarks.push(chapterIdx);
  });
  if(!mc)return out;   // chưa có nhân vật chính: thẻ đã được ghi nhớ ở trên, sẽ xử lý ở lượt có MC
  // Gộp 1 record là thân xác/thân phận của MC vào MC (dùng chung cho thẻ của chương này và thẻ đã ghi nhớ từ trước).
  const mergeBodyIntoMc=(rec,note)=>{
    if(isMergePairRejected(rec.id,mc.id)){
      out.log.push(`bodyOf=MC của "${rec.name}" nhưng cặp với "${mc.name}" đã bị từ chối -> bỏ qua`);
      rec.mcBodyMarks=[];
      return false;
    }
    if(!CHARMEM_BODYOF_AUTO_MERGE){out.log.push(`bodyOf=MC của "${rec.name}" -> chỉ đề xuất gộp vào "${mc.name}" (chính sách: không tự gộp)`);rec.mcBodyMarks=[];autoMergeDemote(rec,mc,'policy','bodyOf');return false;}
    { const _g=autoMergeGuard(rec,mc,{safety:false});   // [G+H] chỉ userlock + giới hạn mỗi chương (lưới riêng của đường này: hạng mục F)
      if(_g){out.log.push(`bodyOf=MC của "${rec.name}" nhưng ${describeMergeBlock(rec,mc,_g)} -> chỉ đề xuất`);autoMergeDemote(rec,mc,_g,'bodyOf');return false;} }
    { const _bb=bodyOfBlock(rec,mc,[chapterIdx,...(rec.mcBodyMarks||[])]);   // [F]
      if(_bb){out.log.push(`bodyOf=MC của "${rec.name}" nhưng ${describeMergeBlock(rec,mc,_bb)} -> chỉ đề xuất`);rec.mcBodyMarks=[];autoMergeDemote(rec,mc,_bb,'bodyOf');return false;} }
    const _pre=_mhClone(rec);   // [D] chụp trước khi xoá xưng hô/quan hệ bên dưới
    // Xưng hô/quan hệ của hồ sơ thân xác là so với NGƯỜI KHÁC (VD cha gọi "nhi tử") nên KHÔNG được đổ sang MC khi gộp.
    if(rec.addrSource!=='user'){rec.addrThemToMc='';rec.addrMcToThem='';rec.addrTone='Chưa rõ';}
    if(rec.relationshipSource!=='user')rec.relationship='Chưa rõ';
    if(rec.affinitySource!=='user')rec.affinity='Chưa rõ';
    if(rec.narrRefSource!=='user')rec.narrRef='';
    const nm=rec.name;
    _kinMerge(rec,mc,out.merged,'bodyOf',_pre);
    out.log.push(`"${nm}" là thân xác/thân phận của nhân vật chính -> gộp vào "${mc.name}" (tên thành alias)${note||''}`);
    return true;
  };
  // (1) bodyOf của CHƯƠNG NÀY: thân xác/thân phận của nhân vật chính -> gộp vào MC, tên thành alias của MC.
  // Trước đây entry có isProtagonist===true bị bỏ qua IM LẶNG ở đây (để khỏi tự gộp MC vào chính nó), nhưng AI hay gắn
  // isProtagonist cho cả thân xác mới của MC (VD "Vương Vũ") -> không gộp và không có log. Nay chỉ bỏ qua khi entry khớp đúng record MC.
  found.forEach(f=>{
    if(!f||!_isMcMark(f.bodyOf))return;
    const rec=resolveFound(f);
    if(!rec){if(f.isProtagonist!==true)out.log.push(`bodyOf=MC của "${f.name}" nhưng không tìm thấy record tương ứng -> bỏ qua`);return;}
    if(rec.id===mc.id){if(f.isProtagonist!==true)out.log.push(`bodyOf=MC của "${f.name}" nhưng tên/alias khớp chính "${mc.name}" (record riêng, nếu có, không được chọn) -> bỏ qua`);return;}
    if(f.isProtagonist===true&&!CHARMEM_MERGE_BODYOF_WHEN_FLAGGED_PROTAGONIST){out.log.push(`bodyOf=MC của "${rec.name}" kèm isProtagonist nhưng công tắc gộp đang tắt -> bỏ qua`);return;}
    if(isCharProtagonist(rec)){
      if(!isMergePairRejected(rec.id,mc.id))out.log.push(`bodyOf=MC của "${rec.name}" nhưng record này đã được coi là nhân vật chính (khác "${mc.name}") -> bỏ qua, cần người dùng quyết`);
      return;
    }
    mergeBodyIntoMc(rec,f.isProtagonist===true?' (AI cũng gắn isProtagonist cho thân xác này)':'');
  });
  // (1b) thẻ ĐÃ GHI NHỚ từ các chương trước mà chưa gộp được (lúc đó chưa có MC) -> gộp bây giờ.
  list().slice().forEach(c=>{
    if(!c||!Array.isArray(c.mcBodyMarks)||!c.mcBodyMarks.length)return;
    if(c.id===mc.id||isCharProtagonist(c)){c.mcBodyMarks=[];return;}
    if(!list().some(x=>x&&x.id===c.id))return;
    mergeBodyIntoMc(c,` (thẻ bodyOf=MC đã ghi từ ch.${chLabel(c.mcBodyMarks[0])}, lúc đó chưa gộp được)`);
  });
  // (2) kin: chuẩn hoá "of" về MC/id record rồi lưu lên record.
  found.forEach(f=>{
    if(!f||!f.kin||typeof f.kin!=='object')return;
    const role=normKinRole(f.kin.role);
    if(!role)return;
    const rec=resolveFound(f);
    if(!rec||rec.id===mc.id||isCharProtagonist(rec)||rec.kinSource==='user')return;
    let of=null;
    if(_isMcMark(f.kin.of))of='MC';
    else{
      const t=byName(f.kin.of);
      if(t)of=(t.id===mc.id||isCharProtagonist(t))?'MC':t.id;   // "Trụ Tử" đã là alias của MC -> 'MC'
    }
    if(!of||of===rec.id)return;
    rec.kin={role,of,chapter:chapterIdx};
    fixKinDirection(rec);
  });
  // (3) gộp các record cùng (role duy nhất, of).
  for(let guard=0;guard<10;guard++){
    const groups=new Map();
    list().forEach(c=>{
      if(!c||!c.kin||!CHARMEM_KIN_UNIQUE_ROLES.includes(c.kin.role)||isCharProtagonist(c))return;
      if(c.kin.of!=='MC'&&!list().some(x=>x&&x.id===c.kin.of))return;   // người "of" đã không còn
      const k=c.kin.role+'|'+c.kin.of;
      if(!groups.has(k))groups.set(k,[]);
      groups.get(k).push(c);
    });
    let did=false;
    for(const arr of groups.values()){
      if(arr.length<2)continue;
      const score=c=>(_kinIsRealName(c)?100:0)+(c.nameSource==='user'?50:0)+((c.mentionChapters||[]).length||c.mentionCount||0);
      arr.sort((a,b)=>score(b)-score(a));
      const tgt=arr[0];
      for(const src of arr.slice(1)){
        if(!list().some(x=>x&&x.id===src.id)||isMergePairRejected(src.id,tgt.id))continue;
        const ga=normalizeGenderValue(src.gender),gb=normalizeGenderValue(tgt.gender);
        if(ga!=='Chưa rõ'&&gb!=='Chưa rõ'&&ga!==gb)continue;
        // Lưới an toàn nghiêm: quan hệ/tên gốc/độ tuổi lệch hoặc cùng xuất hiện như 2 entry riêng trong 1 chương -> KHÔNG tự gộp record thật.
        if(!CHARMEM_KIN_AUTO_MERGE){autoMergeDemote(src,tgt,'policy','the-kin');continue;}
        { const _why=autoMergeGuard(src,tgt);   // [G+H]
          if(_why){
            console.log(`[Luồng 1][Gộp theo thẻ] Không gộp "${src.name}" vào "${tgt.name}": ${describeMergeBlock(src,tgt,_why)}.`);
            if(_why==='cap'||_why==='userlock')autoMergeDemote(src,tgt,_why,'the-kin');
            continue;} }
        // 2 TÊN THẬT khác nhau (VD cha ruột/cha nuôi): không tự gộp, có thể là 2 người.
        if(_kinIsRealName(src)&&_kinIsRealName(tgt)&&normKey(src.name)!==normKey(tgt.name))continue;
        const sn=src.name;
        _kinMerge(src,tgt,out.merged,'the-kin');
        out.log.push(`"${sn}" cùng vai ${tgt.kin.role} của cùng 1 người với "${tgt.name}" -> gộp (tên thành alias)`);
        did=true;
      }
      if(did)break;
    }
    if(!did)break;
  }
  return out;
}
function buildRecheckPrompt(items,promptGuidance){
  const preset=getAddrPreset(promptGuidance);
  const presetBlock=preset?AddrPresets.blockForExtract(preset):'';
  let avoid=[];
  try{if(preset&&typeof AddrPresets!=='undefined'&&AddrPresets&&typeof AddrPresets.avoidTerms==='function')avoid=AddrPresets.avoidTerms(preset)||[];}catch(e){avoid=[];}
  const avoidLine=Array.isArray(avoid)&&avoid.length?`XƯNG HÔ CẦN TRÁNH trong truyện này (không được xuất hiện trong kết quả): ${avoid.join(', ')}\n\n`:'';
  const guidance=promptGuidance?`CHỈ DẪN THỂ LOẠI/XƯNG HÔ của truyện (đã lọc từ prompt dịch chính):\n${promptGuidance}\n\n`:'';
  const protagonist=(S.characters||[]).find(c=>isCharProtagonist(c));
  const _mcNames=protagonist?[...new Set([...(protagonist.aliases||[]),...charOrigNameList(protagonist)].filter(x=>x&&x!==protagonist.name))].slice(0,12):[];
  // Bước 6 (samePersonAs) chỉ chèn khi thật sự có gì để so: có mục kèm ứng viên trùng, hoặc có mục AI gắn nhân vật chính nhưng không phải record MC đã lưu.
  // Còn lại prompt giữ như cũ để model rẻ không bị thêm việc.
  // Hai mục trong cùng chương chung 1 tên/tên gốc/biệt danh cũng đáng được hỏi (VD "Trụ Tử" và "Vương Thiết Trụ" cùng có 柱子).
  const _sharesString=(()=>{
    const seen=new Map();
    for(let i=0;i<items.length;i++){
      const it=items[i];if(!it)continue;
      const keys=new Set([it.name,...(it.originalName?parseOrigNames(it.originalName):[]),...(Array.isArray(it.nicknames)?it.nicknames:[])]
        .map(x=>normKey(String(x||'').normalize('NFC'))).filter(Boolean));
      for(const k of keys){if(seen.has(k)&&seen.get(k)!==i)return true;seen.set(k,i);}
    }
    return false;
  })();
  const needSame=CHARMEM_RECHECK_VERDICT_MERGE&&(_sharesString||items.some(it=>it&&it.newOrig)||items.some(it=>it&&it.maybeSame)||(!!protagonist&&items.some(it=>it&&it.isProtagonist===true&&it.recId!==protagonist.id&&!isMergePairRejected(it.recId,protagonist.id))));
  const mcLine=protagonist?`Nhân vật chính của truyện: "${protagonist.name}"${_mcNames.length?` (còn được gọi/đã gộp: ${_mcNames.join(', ')})`:''}.\n\n`:'';
  return `Bạn là bước KIỂM TRA LẠI dữ liệu nhân vật của một hệ thống dịch truyện. Bạn CHỈ được đọc danh sách kết quả của bước phân tích trước (bên dưới) — KHÔNG có văn bản chương, nên TUYỆT ĐỐI KHÔNG bịa thêm tình tiết/tên mới; chỉ kiểm tra, sắp xếp, dịch, sửa và điền lại từ chính dữ liệu đã có.\n\n`+
  mcLine+guidance+presetBlock+(presetBlock?'\n\n':'')+avoidLine+
  `Với MỖI nhân vật, làm lần lượt:\n`+
  `1) TÊN/BIỆT DANH: "name" = tên đã dịch của họ tên đầy đủ/tên riêng; "originalName" = tên gốc (họ tên đầy đủ nguyên văn); "nicknames" = tên khác, CHỈ gồm: biệt danh/ngoại hiệu/tên gọi tắt cố định; danh xưng chức vị/thân phận gắn đúng một người (có kèm họ/tên/tổ chức/nơi chốn, VD 冲云道长, 王掌柜); cụm miêu tả ngoại hình/đặc điểm nhận dạng dùng riêng cho người đó. Chuỗi chỉ là XƯNG HÔ theo vai vế/thứ bậc/tuổi (大哥, 二哥, 大姐, 老大, 哥哥, 师兄, 少爷, đại ca, nhị ca, đại tỷ, sư huynh, huynh trưởng...) hoặc chức danh/quan hệ đứng một mình dùng được cho nhiều người (掌柜, 师父, anh trai, cha) thì KHÔNG phải tên khác: BỎ khỏi "nicknames" (không chuyển sang "originalName"; ý quan hệ đó đã có ở "relationship"/"note"/xưng hô). Nếu bước trước xếp sai (VD biệt danh nằm ở "originalName" còn họ tên đầy đủ nằm trong "nicknames"; hoặc "name" là biệt danh trong khi tên thật có sẵn ở "originalName"/"nicknames") thì xếp lại cho đúng chỗ. CHỈ dùng các chuỗi đã có trong dữ liệu của nhân vật đó, KHÔNG bịa tên mới. Mục có "nameLocked":true thì GIỮ NGUYÊN "name" (chỉ được xếp lại "originalName"/"nicknames"). "originalName" và "nicknames" giữ NGUYÊN chữ gốc, TUYỆT ĐỐI KHÔNG dịch. `+
  `Mục có "nameLocked":true mà "name" rõ ràng SAI (vd đang là biệt danh/cách gọi phụ trong khi họ tên đầy đủ có sẵn trong "originalName"/"nicknames"/"sinoAlias") thì VẪN giữ nguyên "name" nhưng điền "suggestName" = tên đúng (chỉ chọn trong chuỗi đã có, không bịa) để hệ thống hỏi người dùng; không chắc thì để "suggestName":"". `+
  `Mục có "nameIsPlaceholder":true thì "name" hiện chỉ là NHÃN MÔ TẢ/QUAN HỆ TẠM (vd "Cha của X", "Gã áo đen"), KHÔNG phải tên riêng: nếu dữ liệu đã có tên riêng thật (vd "sinoAlias" là phiên âm Hán Việt của "originalName", hoặc 1 chuỗi trong "nicknames" là họ tên đầy đủ) thì đặt tên riêng đó vào "name"; nếu không có tên riêng nào thì giữ nguyên "name". "nicknames" CHỈ dành cho biệt danh thật — KHÔNG đưa phiên âm/bản dịch của chính tên gốc ("sinoAlias") hay tên chính vào "nicknames".\n`+
  `1b) PHÂN LOẠI TỪNG CÁCH GỌI — chỉ dựa vào NGHĨA và DẠNG của chuỗi (ở bất kỳ ngôn ngữ nào; bạn không có văn bản chương). Gắn "nameKind" cho "name" CUỐI CÙNG của bạn (sau khi đã xếp lại ở bước 1) và liệt kê trong "kinds" MỌI chuỗi có trong "originalName" và "nicknames", dạng {"text":"<đúng nguyên chuỗi>","kind":"..."}. "kind"/"nameKind" chỉ được là:\n`+
  `- "proper": tên định danh chính thức của đúng MỘT người (họ tên đầy đủ hoặc tên riêng; VD 陈明勇, 林墨, Nguyễn Văn An, John Carter).\n`+
  `- "nickname": biệt danh/ngoại hiệu/tên gọi tắt thân mật cố định, tự nó chỉ một người nhưng KHÔNG phải tên chính thức (VD 黄毛, 胖子, 老王, 小李, 陈博士 = họ + chức danh, hoặc bản phiên âm của chúng như Hoàng Mao, Bàn Tử, Lão Vương).\n`+
  `- "title_or_relation": chức danh, vai vế/quan hệ, nghề, tuổi, giới, ngoại hình hoặc cụm mô tả, dùng được cho nhiều người (VD 观主, 道人, 小道士, 威严男子, 军人男子; "Mập mạp", "Ngoại công", "Gã áo đen", "Cha của X").\n`+
  `- "unsure": không phân biệt được nếu không có ngữ cảnh (VD 柱子/Trụ Tử, 二狗/Nhị Cẩu có thể là tên thật hoặc biệt danh). Không chắc thì chọn "unsure", TUYỆT ĐỐI KHÔNG đoán.\n`+
  `Quy tắc: (a) xét từng chuỗi riêng lẻ, chuỗi ngắn nằm trong chuỗi dài không thừa hưởng loại của chuỗi dài; (b) "name" đã dịch/phiên âm thì xét theo nghĩa của chính nó; (c) nếu mọi chuỗi của nhân vật đều không phải "proper" thì "nameKind" cũng KHÔNG được là "proper"; (d) KHÔNG đổi/bỏ chuỗi nào chỉ vì phân loại — hệ thống sẽ tự xử lý theo "kind" (NGOẠI LỆ duy nhất: chuỗi chỉ là xưng hô theo vai vế như 大哥/đại tỷ phải bị bỏ khỏi "nicknames" theo mục 1; chúng không cần có trong "kinds"); (e) chuỗi dạng TÊN + CHỨC DANH/VAI VẾ (冲云道长, 王掌柜, "Trùng Vân đạo trưởng", "Chưởng quầy Vương") KHÔNG BAO GIỜ là "proper", kể cả khi phần tên trông như tên thật: chọn "nickname" (hoặc "title_or_relation"). KHÔNG cắt đuôi chức danh để tạo chuỗi mới. Nhân vật chỉ có cách gọi kèm chức danh thì "name" cũng là "nickname" (chưa có tên thật); (f) với truyện gốc chữ Hán: "nameKind":"proper" CHỈ hợp lệ khi "originalName" của nhân vật có chuỗi tên riêng thật (kind "proper") — hãy cố điền "originalName" từ các chuỗi sẵn có (sinoAlias, nicknames, originalName hiện tại). Không điền được tên gốc nào là tên riêng thì nhân vật CHƯA có tên thật: "nameKind" phải là "nickname" hoặc "title_or_relation", không được là "proper".\n`+
  `1a) KIỂM TRA NGHĨA DỊCH CỦA TÊN — chỉ áp dụng cho mục có "nameTransCheck":true (kèm "origForTrans" = các chuỗi tên gốc). Đối chiếu "name" với tên gốc là tên riêng đầu tiên trong "origForTrans" xem "name" đã là bản dịch/phiên âm ĐÚNG NGHĨA của tên gốc chưa. Chuẩn dịch tên: theo chỉ dẫn thể loại/xưng hô ở trên nếu có; không có thì tên chữ Hán → Hán Việt (viết hoa từng âm tiết, đúng họ + đệm + tên, đúng thứ tự); tên chữ Hán thực chất là ÂM DỊCH tên phương Tây → dạng Latin gốc (莱恩→Ryan); tên gốc không phải chữ Hán → giữ nguyên cách viết gốc. Nếu "name" ĐÃ đúng → giữ nguyên, "nameTransOk":true. Nếu "name" SAI (sai âm Hán Việt, thiếu/thừa/sai họ hoặc tên đệm, đảo thứ tự, DỊCH NGHĨA thay vì phiên âm, lấy biệt danh/chức danh làm tên, đánh vần sai tên phương Tây...) thì ĐẶT "name" = bản dịch ĐÚNG và "nameTransOk":false, kèm "nameFixReason" 1 câu ngắn. Bản dịch mới CHỈ được suy ra từ CHÍNH chuỗi tên gốc đó (không bịa, không lấy tên của nhân vật khác, không còn chữ Hán). Không chắc chắn → giữ nguyên "name" và "nameTransOk":true. Bước 1a ĐƯỢC PHÉP sửa "name" kể cả khi "nameLocked":true (nhưng không áp dụng cho mục không có cờ "nameTransCheck" — tên do người dùng đặt không bao giờ có cờ này). Mục không có "nameTransCheck" thì bỏ qua "nameTransOk"/"nameFixReason".\n`+
  `2) CHỮ HÁN SÓT: mọi trường khác ("name", "statusCue", "relationship", xưng hô, "narrRef", "note") còn ký tự chữ Hán thì dịch sang tiếng Việt (tên người → Hán Việt, hoặc phục hồi tên phương Tây nếu rõ là âm dịch; xưng hô Hán-Việt quen thuộc giữ phiên âm, nhưng phải đúng hệ thể loại ở bước 3). TRỪ "originalName" và "nicknames" — hai trường này giữ chữ gốc.\n`+
  `3) XƯNG HÔ ("addrThemToMc" = họ → nhân vật chính; "addrMcToThem" = nhân vật chính → họ; mỗi lựa chọn là 1 cặp {self: tự xưng, calls...: gọi đối phương}): đối chiếu với bộ xưng hô thường gặp của thể loại và danh sách cần tránh ở trên. Từ nào sai hệ/nằm trong danh sách cần tránh thì THAY bằng từ ĐÚNG HỆ nhưng CÙNG CẤP/VAI VẾ: người trên vẫn là trên, ngang vẫn ngang, dưới vẫn dưới; cùng nhóm sắc thái thân mật/kính trọng/trung tính; "self" và từ gọi đối phương trong CÙNG 1 lựa chọn phải là 1 cặp đối xứng đúng kiểu quan hệ. Các lựa chọn trong CÙNG 1 nhân vật không được tự mâu thuẫn vai vế (VD cùng lúc \"A/B\" và \"B/A\" trong cùng 1 hướng: nhân vật không thể vừa là bề trên vừa là bề dưới của cùng 1 người) — nếu mâu thuẫn, chỉ GIỮ lựa chọn khớp với \"relationship\"/\"note\"/\"statusCue\", bỏ lựa chọn còn lại; không có căn cứ để chọn thì giữ nguyên. Từ đã đúng hệ thì GIỮ NGUYÊN, không đổi bừa; không đổi quan hệ, không đổi vai vế. Không có bộ xưng hô thể loại ở trên thì chỉ sửa các lỗi lệch cặp/lệch vai vế hiển nhiên.\n`+
  `4) ĐIỀN LẠI ĐẦY ĐỦ sau khi sửa — trả về MỌI trường của MỖI nhân vật: "name", "originalName", "nicknames", "statusCue" (CHỈ độ tuổi: đúng 1 nhóm tuổi chuẩn nguyên văn trong [${charmemAgeLabelList()}], không ghi số; đang là số tuổi, chứa vai vế/địa vị/chức vụ hoặc từ ngoài danh sách thì quy về nhóm chuẩn, chuyển ý thân phận sang "note"), "relationship" (quan hệ với nhân vật chính — CHỈ 1 giá trị chuẩn nguyên văn trong danh sách: ${charmemRelPromptList()}; không phải chức vụ/nghề), "addrThemToMc", "addrMcToThem", "addrTone", "narrRef" (đại từ/cách gọi ngôi thứ 3, không phải quan hệ), "note" (CHỈ hình dáng, thân phận, tính cách — bỏ hành động, tình tiết, tuổi, xưng hô). Trường nào đang trống mà suy ra được từ dữ liệu của chính nhân vật (quan hệ, độ tuổi, giới tính, thể loại) thì điền — NGOẠI LỆ: "addrThemToMc"/"addrMcToThem" đang trống (rỗng/"Chưa rõ") thì GIỮ NGUYÊN TRỐNG, TUYỆT ĐỐI KHÔNG suy ra để điền (nhân vật chưa có thoại với nhân vật chính thì không thêm xưng hô), và "addrTone" cũng giữ "Chưa rõ"; không suy ra được thì giữ nguyên ("" hoặc "Chưa rõ"). Nhân vật có "isProtagonist":true thì "relationship", "addrThemToMc", "addrMcToThem" để rỗng. KHÔNG sửa giới tính (không có trong kết quả).\n\n`+
  `5) GHI CHÚ — nhân vật có "storedNote" nghĩa là ĐÃ có ghi chú lưu sẵn. Với nhân vật đó: (a) "note" CHỈ ghi thông tin MỚI thật sự chưa có trong "storedNote" (cùng ý nhưng khác cách diễn đạt cũng tính là ĐÃ CÓ); không có gì mới thì để "" — KHÔNG điền cho đủ, KHÔNG nhắc lại ý cũ; (b) "noteClean" = bản "storedNote" đã BỎ các ý lặp/cùng nghĩa (mỗi ý chỉ giữ 1 lần, giữ cách diễn đạt đầy đủ nhất), CHỈ dùng lại từ ngữ có sẵn trong "storedNote", KHÔNG thêm ý mới, KHÔNG dịch lại, KHÔNG đổi nghĩa; các đoạn cách nhau bằng "; "; nếu "storedNote" không có ý lặp thì để "noteClean":"". Nhân vật KHÔNG có "storedNote": "noteClean" để "", "note" làm như bước 4.\n`+
  `5) THẺ LIÊN KẾT "kin" và "bodyOf" (không áp dụng cho nhân vật chính): trả lại đúng giá trị đang có nếu đã điền. Nếu đang trống (kin=null / bodyOf="") thì CHỈ suy ra từ chính thông tin của NHÂN VẬT ĐÓ (tên, "relationship", "note", "nicknames") khi nó nói RÕ RÀNG, không suy từ nhân vật khác, không đoán. `+
`"kin":{"role":"<đúng 1 trong: ${CHARMEM_KIN_ROLES.join(', ')}>","of":"<tên người đó, hoặc \"MC\" nếu là nhân vật chính>"} khi thông tin cho thấy họ là người thân/thầy trò của một người cụ thể (VD relationship "phụ thân của Trụ Tử" -> {"role":"cha","of":"Trụ Tử"}; relationship "Phụ thân" -> {"role":"cha","of":"MC"}); "role" CHỈ dùng đúng từ trong danh sách (${CHARMEM_KIN_HINT}). `+
`"bodyOf":"MC" khi thông tin nói họ CHÍNH LÀ thân xác/thân phận/kiếp khác của nhân vật chính (VD relationship "thân xác hiện tại của nhân vật chính"). Không chắc thì "kin":null, "bodyOf":"".\n`+
(needSame?`6) CÙNG MỘT NGƯỜI — "samePersonAs": bạn là bước THẨM ĐỊNH CUỐI, được đối chiếu TOÀN BỘ danh sách (tên, tên gốc, biệt danh, "note", "relationship"). Nếu dữ liệu cho thấy mục này CHÍNH LÀ cùng một người với: (a) nhân vật chính nêu ở đầu prompt (kể cả thân xác/thân phận/tên mới sau khi xuyên không, hay cái tên người ta gọi thân xác đó) -> "MC"; (b) một mục KHÁC trong danh sách -> "id" của mục đó; (c) một nhân vật đã lưu nằm trong "maybeSame" của chính mục này -> "ref" của nó. Kết luận của bạn được hệ thống áp dụng TRỰC TIẾP (gộp 2 hồ sơ), nên chỉ điền khi bạn thật sự tin; 2 người chỉ trùng tên/biệt danh/họ thì chưa đủ, cần thêm dấu hiệu khác (ghi chú nói rõ, tên gốc trùng...). Cùng quan hệ với nhân vật chính (cùng là bạn, đồng môn, anh em, thuộc hạ...) KHÔNG phải bằng chứng cùng một người. Bạn không có văn bản chương để kiểm chứng nên không chắc thì để rỗng. Mục "isProtagonist":true chỉ trả "MC" khi nó thực chất là thân xác/thân phận khác của nhân vật chính đã nêu, KHÔNG phải chính nhân vật chính. Không chắc thì "".\n\n`:'\n')+
`"addrTone" CHỈ được chọn 1 trong: ${CHARMEM_ADDR_TONES.join(', ')}, hoặc "Chưa rõ" (khi cả 2 xưng hô rỗng); phản ánh nhóm sắc thái của lựa chọn ĐẦU TIÊN. Cặp xưng hô CHỈ gồm đại từ/từ xưng hô: TUYỆT ĐỐI KHÔNG ghi tên riêng/biệt danh của bất kỳ nhân vật nào vào "self"/"callsMc"/"callsThem" (VD "tôi/Tô Nhàn" là SAI, phải là "tôi/anh").\n\n`+
  `DANH SÁCH CẦN KIỂM TRA LẠI:\n${JSON.stringify(items)}\n\n`+
  `Chỉ trả về JSON, không giải thích, không markdown fence. PHẢI có đủ 1 entry cho MỖI "id" đã cho: {"characters":[{"id":"...","name":"...","nameTransOk":true,"nameFixReason":"","suggestName":"...","originalName":"...","nicknames":["..."],"nameKind":"...","kinds":[{"text":"...","kind":"..."}],"statusCue":"...","relationship":"...","addrThemToMc":[{"self":"...","callsMc":"..."}],"addrMcToThem":[{"self":"...","callsThem":"..."}],"addrTone":"...","narrRef":"...","note":"...","noteClean":"...","kin":null,"bodyOf":""${needSame?',"samePersonAs":""':''}}]}`;
}
// Luồng 1.2: entry của `found` chỉ đáng kiểm tra lại khi có THÔNG TIN MỚI so với bản ghi đã lưu (hoặc còn chữ Hán cần dịch,
// hoặc là nhân vật mới chưa có bản ghi). Entry y hệt dữ liệu đã lưu thì bỏ qua — không tốn token, không đổi gì.
// Nhân vật có đủ điều kiện để kiểm "tên đã dịch có đúng nghĩa tên gốc chưa": có tên gốc, tên không do người dùng đặt,
// không phải nhãn tạm, và chưa từng được kiểm (rec.nameTransChecked). Trả về danh sách tên gốc để gửi kèm ([] = không đủ điều kiện).
// Mục trích ra mang tên gốc CHƯA từng gắn với record khớp (không nằm trong tên gốc/alias đã lưu của nó). Cờ nameTransChecked chỉ có
// giá trị với các tên gốc đã lưu; tên gốc lạ (VD 王禹 trùng tên dịch "Đinh Vũ" với MC 丁禹) phải được kiểm lại nghĩa dịch.
function _recheckHasNewOrig(rec,f){
  if(!rec||!f||!f.originalName)return false;
  const known=new Set([...charOrigNameList(rec),...(rec.aliases||[])].map(x=>normKey(String(x||'').normalize('NFC'))).filter(Boolean));
  return parseOrigNames(f.originalName).some(o=>{const k=normKey(String(o||'').normalize('NFC'));return !!k&&!known.has(k);});
}
function _recheckTransOrigs(rec,f){
  if(rec&&(rec.nameSource==='user'||rec.namePlaceholder||rec.nameLabelByJudge))return [];
  if(rec&&rec.nameTransChecked===true&&!_recheckHasNewOrig(rec,f))return [];
  const fromF=f&&f.originalName?parseOrigNames(f.originalName):[];
  const fromRec=rec?charOrigNameList(rec):[];
  const seen=new Set(),out=[];
  [...fromF,...fromRec].forEach(o=>{const t=String(o||'').normalize('NFC').trim();const k=normKey(t);if(t&&k&&!seen.has(k)){seen.add(k);out.push(t);}});
  return out;
}
function _recheckTransEligible(rec,f){return !!rec&&_recheckTransOrigs(rec,f).length>0;}
function _recheckHasNewInfo(f,rec){
  if(!rec)return true;
  const sv=x=>String(x==null?'':x).normalize('NFC').trim();
  const nk=x=>normKey(sv(x));
  // (1) còn chữ Hán ở field dịch được -> recheck có việc để làm
  if([f.name,f.statusCue,f.relationship,f.addrThemToMc,f.addrMcToThem,f.narrRef,f.note].some(v=>containsCJK(sv(v))))return true;
  if(containsCJK(rec.name))return true;
  // (1b) tên đã lưu chưa từng được đối chiếu với tên gốc -> kiểm nghĩa dịch 1 lần (xem _recheckTransEligible)
  if(_recheckTransEligible(rec,f))return true;
  // (2) tên đổi
  if(nk(f.name)&&nk(f.name)!==nk(rec.name))return true;
  // (3) tên gốc / biệt danh mới
  const origHave=new Set(charOrigNameList(rec).map(nk));
  if(parseOrigNames(f.originalName||'').some(o=>nk(o)&&!origHave.has(nk(o))))return true;
  const aliasHave=new Set([rec.name,...(rec.aliases||[])].map(nk));
  if((Array.isArray(f.nicknames)?f.nicknames:[]).some(n=>nk(n)&&!aliasHave.has(nk(n))))return true;
  // (4) field đơn có giá trị thật mà khác bản đã lưu
  const diff=(nv,ov)=>!isUnknownVal(nv)&&nk(nv)!==nk(ov);
  if(diff(f.statusCue,rec.statusCue)||diff(f.relationship,rec.relationship))return true;
  if(!isNarrRefUnknown(f.narrRef)&&nk(f.narrRef)!==nk(rec.narrRef))return true;
  const diffAddr=(nv,ov)=>!isAddrUnknown(nv)&&normAddrWord(nv)!==normAddrWord(ov);
  if(diffAddr(f.addrThemToMc,rec.addrThemToMc)||diffAddr(f.addrMcToThem,rec.addrMcToThem))return true;
  // (5) ghi chú mới (prompt trích xuất chỉ cho model ghi phần MỚI vào "note")
  const n=sv(f.note);
  if(n&&!sv(rec.note).includes(n))return true;
  // (6) nhân vật chính mới được đánh dấu / thẻ liên kết mới
  if(f.isProtagonist===true&&!isCharProtagonist(rec))return true;
  if(_isMcMark(f.bodyOf))return true;
  if(f.kin&&typeof f.kin==='object'&&!rec.kin)return true;
  return false;
}
async function recheckExtractedCharacters(found,keys,promptGuidance,primary,fallback,presentIds){
  if(!getNameCheckOn()||!keys||!keys.length||!Array.isArray(found)||!found.length)return found;
  const items=[],idxs=[],candMaps=[];let skipped=0,absentSkipped=0;
  found.forEach((f,i)=>{
    if(items.length>=CHARMEM_RECHECK_MAX_ITEMS||!f||typeof f!=='object')return;
    const name=(f.name||'').trim();if(!name)return;
    let rec=null;
    try{rec=(f._refId&&(S.characters||[]).find(x=>x.id===f._refId))||findCharByNameOrAlias(name,f.gender)||(f.originalName?findCharByNameOrAlias(f.originalName,f.gender):null);}catch(e){rec=null;}
    if(!_recheckHasNewInfo(f,rec)){skipped++;return;}   // không có gì mới so với bản đã lưu -> không kiểm tra lại
    // Nhân vật chính: theo cờ model gắn HOẶC theo nhân vật chính đã lưu trong bộ nhớ (không chỉ tin model tự gắn cờ).
    const mc=f.isProtagonist===true||!!(rec&&isCharProtagonist(rec));
    // Lọc theo SỰ HIỆN DIỆN: nhân vật đã lưu mà tên/alias không xuất hiện nguyên văn trong chương (cùng tiêu chí scanMentionedCharIds
    // với danh sách "đã biết" ở bước trích xuất) thì không kiểm tra lại — trừ nhân vật chính hoặc người còn việc dịch lại tên/chữ Hán.
    // Người mới tạo (rec=null) luôn được coi là có mặt. presentIds không truyền -> giữ hành vi cũ.
    if(presentIds&&rec&&!mc&&!presentIds.has(rec.id)&&!_recheckTransEligible(rec,f)&&!containsCJK(rec.name)&&!containsCJK(name)){
      absentSkipped++;return;
    }
    const storedNote=(rec&&rec.noteSource!=='user'&&rec.note&&String(rec.note).trim())?String(rec.note).trim():undefined;
    // Record đã lưu nhưng tên chỉ là NHÃN tạm (vd "Cha của Đinh Vũ") và người dùng chưa tự đặt -> KHÔNG khoá tên,
    // để bước này được phép đổi sang tên thật (nếu dữ liệu đã có sẵn tên thật trong originalName/nicknames/sinoAlias).
    const isLabel=!!(rec&&(rec.namePlaceholder||rec.nameLabelByJudge)&&rec.nameSource!=='user');
    // Kiểm nghĩa dịch tên: chỉ khi f.isPlaceholderName không bật (tên chính không phải nhãn mô tả) và tên chưa chứa chữ Hán.
    const transOrigs=(f.isPlaceholderName===true||isLabel||containsCJK(name))?[]:_recheckTransOrigs(rec,f);
    // Ứng viên "có thể là cùng người": record đã lưu KHÁC rec mà tên/alias trùng 1 cách gọi của mục này. Trước đây các trùng này bị
    // loại im lặng (sanitizeAliasCandidate); nay đưa cho AI thẩm định (samePersonAs) thay vì để code đoán.
    const _own=[name,...(f.originalName?parseOrigNames(f.originalName):[]),...(Array.isArray(f.nicknames)?f.nicknames:[]),f.sinoAlias||''].filter(Boolean);
    let _cands=[];
    try{_cands=findAllCharsByNameOrAlias(_own,{skipRoleAlias:true}).filter(x=>x&&(!rec||x.id!==rec.id)&&!(rec&&isMergePairRejected(rec.id,x.id))).slice(0,2);}catch(e){_cands=[];}
    const _cmap={};
    const _maybe=_cands.map((x,ci)=>{const ref=isCharProtagonist(x)?'MC':'k'+ci;_cmap[ref]=x.id;
      return {ref,name:x.name,originalName:charOrigNameList(x).join(', ')||undefined,gender:x.gender||undefined,
        note:x.note?String(x.note).slice(0,60):undefined};});
    candMaps.push(_cmap);
    items.push({
      id:'r'+i,name,nameLocked:(rec&&!isLabel&&(rec.nameSource==='user'||rec.nameVerified===true))?true:undefined,nameIsPlaceholder:isLabel?true:undefined,
      sinoAlias:f.sinoAlias||undefined,recId:(rec&&rec.id)||undefined,
      nameTransCheck:transOrigs.length?true:undefined,origForTrans:transOrigs.length?transOrigs:undefined,
      newOrig:(transOrigs.length&&rec&&rec.nameTransChecked===true&&_recheckHasNewOrig(rec,f))?true:undefined,
      originalName:(f.originalName||'')||undefined,
      nicknames:Array.isArray(f.nicknames)&&f.nicknames.length?f.nicknames:undefined,
      gender:f.gender||'Chưa rõ',isProtagonist:mc?true:undefined,
      statusCue:f.statusCue||'',relationship:f.relationship||'',
      addrThemToMc:mc?[]:_recheckAddrArr(f.addrThemToMc,'callsMc'),
      addrMcToThem:mc?[]:_recheckAddrArr(f.addrMcToThem,'callsThem'),
      addrTone:f.addrTone||'',narrRef:f.narrRef||'',note:f.note||'',storedNote,
      kin:mc?undefined:(f.kin&&typeof f.kin==='object'?f.kin:null),bodyOf:mc?undefined:(_isMcMark(f.bodyOf)?'MC':''),
      maybeSame:_maybe.length?_maybe:undefined
    });
    idxs.push(i);
  });
  if(skipped)console.log(`[Luồng 1][Kiểm tra lại] Bỏ qua ${skipped} nhân vật không có thông tin mới so với dữ liệu đã lưu.`);
  if(absentSkipped)console.log(`[Luồng 1][Kiểm tra lại] Bỏ qua ${absentSkipped} nhân vật không có mặt trong chương (tên/alias không xuất hiện trong văn bản).`);
  if(!items.length)return found;
  if(!charmemOptionalAllowed(primary,keys,'kiểm tra lại thông tin'))return found;
  const messages=[{role:'user',parts:[{text:buildRecheckPrompt(items,promptGuidance)}]}];
  let raw;
  try{raw=await callCharModel(keys,primary,messages,CHAR_ANALYSIS_TIMEOUT_MS,'recheck');}
  catch(e){
    if(!fallback||!charmemOptionalAllowed(fallback,keys,'kiểm tra lại thông tin (dự phòng)')||!charmemModelHasRoom(fallback,keys))throw e;
    console.log('[Luồng 1][Kiểm tra lại] Model chính lỗi/timeout, thử model dự phòng...',e.message||e);
    raw=await callCharModel(keys,fallback,messages,CHAR_ANALYSIS_TIMEOUT_MS,'recheck-fb');
  }
  const parsed=parseCharacterJSON(raw);
  const list=parsed&&Array.isArray(parsed.characters)?parsed.characters:null;
  if(!list){console.log('[Luồng 1][Kiểm tra lại] Không parse được JSON — giữ nguyên kết quả bước phân tích. Raw:',raw);return found;}
  const byId=new Map();list.forEach(v=>{if(v&&typeof v.id==='string')byId.set(v.id,v);});
  const preset=getAddrPreset(promptGuidance);
  const T=x=>typeof x==='string'?x.normalize('NFC').trim():'';
  const nk=x=>normKey(String(x||'').normalize('NFC'));
  const okText=x=>!!x&&!containsCJK(x);
  let nChanged=0,nIdentity=0;
  items.forEach((it,k)=>{
    const v=byId.get(it.id);if(!v)return;
    const f=found[idxs[k]];if(!f)return;
    const before=JSON.stringify([f.name,f.originalName,f.nicknames,f.statusCue,f.relationship,f.addrThemToMc,f.addrMcToThem,f.narrRef,f.note]);
    const idBefore=JSON.stringify([f.name,f.originalName,f.nicknames]);
    const mc=it.isProtagonist===true;   // đã gồm cả nhân vật chính lấy từ bộ nhớ (xem lúc dựng items)
    // (1) tên/biệt danh: chuỗi gốc chỉ được lấy từ chính dữ liệu bước trước (không bịa), tên dịch không được còn chữ Hán, tên đã có trong bộ nhớ thì khoá.
    const pool=new Set([...(f.originalName?parseOrigNames(f.originalName):[]),...(Array.isArray(f.nicknames)?f.nicknames:[]),f.sinoAlias||''].map(nk).filter(Boolean));
    let identityChanged=false;
    const newName=T(v.name);
    // (1a) KIỂM NGHĨA DỊCH TÊN: model báo tên SAI nghĩa so với tên gốc -> cho dịch lại (không bắt buộc nằm trong pool, vì đây là bản dịch mới
    // của chính tên gốc). Chặn: tên do người dùng đặt (không có cờ nameTransCheck), tên mới còn chữ Hán/là nhãn/danh xưng chung/trùng nhân vật KHÁC.
    if(it.nameTransCheck){
      if(v.nameTransOk===false&&newName&&okText(newName)&&nk(newName)!==nk(f.name)&&newName.length<=60
         &&!looksLikePlaceholderCharName(newName)&&!isGenericAddressTerm(newName)){
        let clash=null;
        try{clash=findCharByNameOrAlias(newName,f.gender)||null;}catch(e){clash=null;}
        if(clash&&clash.id!==it.recId){
          console.log(`[Luồng 1][Kiểm tra lại][Dịch tên] Bỏ qua dịch lại "${f.name}" -> "${newName}" vì trùng nhân vật khác "${clash.name}".`);
        }else{
          console.log(`[Luồng 1][Kiểm tra lại][Dịch tên] Tên dịch sai nghĩa gốc ${JSON.stringify(it.origForTrans)}: "${f.name}" -> "${newName}"${T(v.nameFixReason)?' ('+T(v.nameFixReason)+')':''}`);
          f.name=newName;f._transFix=true;f._nameTransChecked=true;
          if(it.recId&&!it.newOrig)f._recheckRename=it.recId;   // tên gốc mới = có thể là người khác: không đổi tên record đã lưu
          identityChanged=true;
        }
      }else if(v.nameTransOk===true||(v.nameTransOk===false&&nk(newName)===nk(f.name))){
        f._nameTransChecked=true;   // tên đúng (hoặc model không đề xuất được bản sửa hợp lệ) -> không kiểm lại ở các chương sau
      }
    }
    if(!it.nameLocked&&okText(newName)&&nk(newName)!==nk(f.name)){
      if(it.nameIsPlaceholder){
        // Nhãn tạm -> tên thật: tên mới phải là chuỗi có sẵn trong dữ liệu (không bịa) và không được nhìn giống 1 nhãn mô tả khác.
        if(pool.has(nk(newName))&&!looksLikePlaceholderCharName(newName)&&!isGenericAddressTerm(newName)){
          f.name=newName;f.isPlaceholderName=false;identityChanged=true;   // mergeAnalysisResults -> promoteToRealName giữ nhãn cũ làm alias
        }
      }else if(it.recId){
        // Record đã lưu, tên chưa được xác nhận: chỉ đổi sang chuỗi CÓ SẴN trong dữ liệu (không bịa), không phải nhãn/danh xưng chung.
        // Việc đổi thật diễn ra ở mergeAnalysisResults (renameCharKeepAlias) qua cờ _recheckRename.
        if(pool.has(nk(newName))&&!looksLikePlaceholderCharName(newName)&&!isGenericAddressTerm(newName)){
          f.name=newName;f._recheckRename=it.recId;identityChanged=true;
        }
      }else{f.name=newName;identityChanged=true;}
    }
    // Tên đã lưu và bị khoá nhưng model thấy sai: KHÔNG tự đổi (không tin 1 lượt AI để phá khoá nhận diện nhiều chương),
    // chỉ đề xuất qua banner nameConflict cho người dùng duyệt (cùng cơ chế applyRealNameReveals).
    if(it.nameLocked&&it.recId){
      const sug=T(v.suggestName)||(newName&&nk(newName)!==nk(f.name)?newName:'');
      const rc=(S.characters||[]).find(x=>x&&x.id===it.recId);
      if(rc&&rc.nameSource!=='user'&&sug&&okText(sug)&&nk(sug)!==nk(rc.name)&&pool.has(nk(sug))
         &&!looksLikePlaceholderCharName(sug)&&!isGenericAddressTerm(sug)
         &&(!rc.nameConflict||nk(rc.nameConflict.value)!==nk(sug))){
        rc.nameConflict={value:sug,reason:'Kiểm tra lại: tên hiện tại có thể chưa đúng (chưa đủ chắc để tự đổi)'};
        console.log(`[Luồng 1][Kiểm tra lại] Đề xuất đổi tên "${rc.name}" -> "${sug}" (chờ người dùng duyệt).`);
      }
    }
    const newOrigs=T(v.originalName)?parseOrigNames(T(v.originalName)):[];
    if(newOrigs.length&&newOrigs.every(o=>pool.has(nk(o)))&&nk(newOrigs.join(', '))!==nk(f.originalName)){f.originalName=newOrigs.join(', ');identityChanged=true;}
    if(Array.isArray(v.nicknames)){
      const origSet=new Set(parseOrigNames(f.originalName||'').map(nk));
      const nn=[...new Set(v.nicknames.map(T).filter(x=>x&&pool.has(nk(x))&&!origSet.has(nk(x))&&nk(x)!==nk(f.name)&&nk(x)!==nk(f.sinoAlias||'')))];
      if(nn.length||!(f.nicknames&&f.nicknames.length)){
        if(JSON.stringify(nn)!==JSON.stringify(f.nicknames||[])){f.nicknames=nn;identityChanged=true;}
      }
    }
    // (1b) phân loại theo NGHĨA (proper/nickname/title_or_relation/unsure). Chỉ nhận chuỗi có sẵn trong dữ liệu; loại không hợp lệ bị bỏ.
    // nameKind chỉ dùng khi "name" cuối cùng đúng là tên model đã phân loại (không dùng nếu đề xuất đổi tên bị từ chối ở trên).
    const kindOf=x=>{const s=T(x).toLowerCase();return CHARMEM_AI_KINDS.includes(s)?s:null;};   // 'unsure'/lạ -> null = chưa phân loại
    const kinds={};
    if(Array.isArray(v.kinds))v.kinds.forEach(e=>{if(!e||typeof e.text!=='string')return;const kd=kindOf(e.kind),key=nk(e.text);if(kd&&key&&pool.has(key))kinds[key]=kd;});
    const nameKind=(!newName||nk(newName)===nk(f.name))?kindOf(v.nameKind):null;
    if(Object.keys(kinds).length)f._kinds=kinds;else delete f._kinds;
    if(nameKind)f._nameKind=nameKind;else delete f._nameKind;
    // Tên chính chỉ là biệt danh/chức danh/mô tả -> nhân vật CHƯA có tên thật (hiện nhãn "Biệt danh"). Không đụng tên đã khoá.
    if(nameKind&&nameKind!=='proper'&&!it.nameLocked&&f.isPlaceholderName!==true){f.isPlaceholderName=true;identityChanged=true;}
    // Chỉ khoá tên (nameVerified) khi tên chính được phân loại rõ là tên riêng. Chưa phân loại/unsure -> không khoá.
    // Khoá tên CHỈ khi có tên gốc: truyện chữ Hán thì originalName phải có ít nhất 1 chuỗi được gắn 'proper' (hoặc record đã lưu sẵn tên gốc).
    const origsNow=parseOrigNames(f.originalName||'');
    const storedRec=it.recId?(S.characters||[]).find(x=>x&&x.id===it.recId):null;
    const hasProperOrig=origsNow.some(o=>kinds[nk(o)]==='proper')||!!(storedRec&&charOrigNameList(storedRec).length);
    if(nameKind==='proper'&&(!charmemStoryIsCJK()||hasProperOrig)&&!containsCJK(f.name)&&!looksLikePlaceholderCharName(f.name)&&!isGenericAddressTerm(f.name)&&f.isPlaceholderName!==true
       &&(!it.nameTransCheck||f._nameTransChecked===true))f._nameVerified=true;   // CHỈ khoá khi tên đã được đối chiếu với tên gốc và chốt (đúng, hoặc đã dịch lại đúng)
    if(identityChanged)delete f._judge;   // phán quyết giám khảo gắn theo tên/tên gốc cũ -> không còn áp dụng
    // (2)+(4) trường văn bản: bản mới phải không còn chữ Hán; trống/"Chưa rõ" không được đè lên giá trị đã có.
    // isUnknownVal: chặn "Chưa rõ"/"chưa rõ"/"-"/rỗng không phân biệt hoa thường; giá trị cũ cũng là "chưa rõ" thì trả rỗng.
    const pickText=(nv,ov,lim)=>{const t=T(nv);if(!okText(t)||isUnknownVal(t)||(lim&&t.length>lim))return isUnknownVal(ov)?'':ov;return t;};
    f.statusCue=_keepIfStdUnknown(charmemStdNormTracked('age',pickText(v.statusCue,f.statusCue,60),'verify'),f.statusCue);
    if(it.storedNote!==undefined&&typeof v.note==='string'&&!T(v.note))f.note='';   // model xác nhận không có ý MỚI so với note đã lưu -> không nối thêm
    else f.note=pickText(v.note,f.note,300);
    if(it.storedNote!==undefined){
      const nc=T(v.noteClean);
      if(nc&&okText(nc)&&nc.length<it.storedNote.length&&nc.length<=CHARMEM_NOTE_MAX_CHARS)f.noteClean=nc;else delete f.noteClean;   // kiểm tra kỹ hơn ở applyNoteClean
    }
    if(!mc){
      f.relationship=_keepIfStdUnknown(charmemStdNormTracked('rel',pickText(v.relationship,f.relationship,80),'verify'),f.relationship);
      f.narrRef=pickText(v.narrRef,f.narrRef,80);
      // (3) xưng hô
      let addrChanged=false;
      const fixAddr=(arr,otherKey,old)=>{
        if(!Array.isArray(arr)||!arr.length)return old;
        // Nhân vật CHƯA có xưng hô (chưa có thoại với nhân vật chính) -> bước kiểm tra lại KHÔNG được tự điền thêm.
        if(isAddrUnknown(old))return old;
        let t=structuredAddrToString(arr,otherKey);
        if(!t||isAddrUnknown(t)||containsCJK(t))return old;
        if(preset){
          try{const fr=AddrPresets.filterAddr(t,preset);if(fr&&fr.dropped&&fr.dropped.length)t=fr.text||old;}catch(e){}
        }
        if(!t||isAddrUnknown(t))return old;
        if(nk(t)!==nk(old)){addrChanged=true;return t;}
        return old;
      };
      f.addrThemToMc=fixAddr(v.addrThemToMc,'callsMc',f.addrThemToMc);
      f.addrMcToThem=fixAddr(v.addrMcToThem,'callsThem',f.addrMcToThem);
      // Thẻ liên kết: bước phân tích thiếu thẻ thì nhận thẻ bước kiểm tra lại suy ra từ thông tin đã có (không ghi đè thẻ sẵn có).
      if(!f.kin&&v.kin&&typeof v.kin==='object'){
        const _r=normKinRole(v.kin.role),_o=T(v.kin.of);
        if(_r&&_o)f.kin={role:_r,of:_o};
      }
      if(!_isMcMark(f.bodyOf)&&_isMcMark(v.bodyOf))f.bodyOf='MC';
      if(addrChanged){
        // xưng hô đã bị sửa -> câu trích cũ không còn khớp: hạ về "suy đoán" để các lưới kiểm tra phía sau không coi là bằng chứng trực tiếp.
        f.addrEvidence='suy đoán';f.addrQuote='';
        const tone=T(v.addrTone);
        if(tone&&(tone==='Chưa rõ'||CHARMEM_ADDR_TONES.includes(tone)))f.addrTone=tone;
      }
    }
    // Phán quyết "cùng một người" (áp ở applyRecheckVerdicts sau mergeAnalysisResults, khi các record đã tồn tại).
    {
      const same=T(v.samePersonAs);
      if(same&&CHARMEM_RECHECK_VERDICT_MERGE){
        let ref=null;
        if(_isMcMark(same))ref={mc:true};
        else if(candMaps[k]&&candMaps[k][same])ref={recId:candMaps[k][same]};
        else{const j=items.findIndex(x=>x.id===same);if(j>=0&&j!==k){const g=found[idxs[j]];if(g)ref={name:g.name,orig:g.originalName||''};}}
        if(ref){f._aiSame=ref;console.log(`[Luồng 1][Kiểm tra lại] "${f.name}" -> AI khẳng định cùng người với ${ref.mc?'nhân vật chính':(ref.recId?'nhân vật đã lưu':`"${ref.name}"`)}.`);}
        else console.log(`[Luồng 1][Kiểm tra lại] "${f.name}": samePersonAs="${same}" không khớp mục/ứng viên/MC nào -> bỏ qua.`);
      }
    }
    if(JSON.stringify([f.name,f.originalName,f.nicknames,f.statusCue,f.relationship,f.addrThemToMc,f.addrMcToThem,f.narrRef,f.note])!==before){
      nChanged++;
      console.log(`[Luồng 1][Kiểm tra lại] "${f.name}": đã chỉnh/điền lại thông tin.`);
    }
    const idAfter=JSON.stringify([f.name,f.originalName,f.nicknames]);
    if(idAfter!==idBefore)nIdentity++;
    console.log(`[Luồng 1][Kiểm tra lại][Tên] ${idBefore} -> ${idAfter} | nameKind=${nameKind||'-'} kinds=${JSON.stringify(kinds)}${f._nameVerified?' | khoá tên':''}${f.isPlaceholderName===true?' | chưa có tên thật':''}`);
  });
  console.log(`[Luồng 1][Kiểm tra lại] ${items.length} nhân vật gửi kiểm tra, ${nChanged} có thay đổi (trong đó ${nIdentity} đổi tên/tên gốc/tên khác).`);
  return found;
}
// [Bước 1] Lỗi thật trả về mảng rỗng CÓ CỜ failed=true (+failReason) để nơi gọi (getChapterCharSnapshot, index.html)
// phân biệt với "chương không có nhân vật" (mảng rỗng bình thường) và KHÔNG lưu snapshot. Code cũ coi nó như [].
function charmemFail(reason){const r=[];r.failed=true;r.failReason=String(reason||'unknown');return r;}

// Trả về mảng các character object (đã merge vào S.characters) xuất hiện trong chương này.
// Không bao giờ throw — mọi lỗi đều bị nuốt, chỉ log console, để không chặn dịch.
// Lỗi thật (API/JSON/bất ngờ) -> charmemFail(...). Tắt tính năng/thiếu key/không có chương -> [] thường (không phải lỗi).
// ===== LỌC NHÂN VẬT VÔ DANH (không tên gốc, không tên khác) =====
// Lý do: record không có tên gốc lẫn tên gọi khác thì lần sau gặp lại code không có gì để nhận ra/gắn vào request dịch
// (scanMentionedCharIds, findCharByNameOrAlias đều dựa trên tên/alias) => chỉ tốn chỗ và gây nhiễu gộp nhầm. Quan hệ/xưng hô
// KHÔNG đủ để giữ: người qua đường cũng có thể có xưng hô. Áp dụng cho MỌI nhân vật như nhau, KỂ CẢ người thân (cha/mẹ/anh chị...): 
// không còn ngoại lệ riêng cho người thân. Giữ khi: nhân vật chính; người dùng đã tự sửa/khoá bất kỳ trường nào; có tên gốc hoặc tên gọi
// khác định danh (alias ngoài origName, không phải xưng hô/chức danh/mô tả ngoại hình); hoặc chỉ có cụm mô tả/xưng hô nhưng đã lặp lại từ 2 chương.
const CHARMEM_PRUNE_ANONYMOUS=true;
// Văn bản nguồn của 1 chương, đã chuẩn hoá (NFC + chữ thường), cache theo chương trong 1 lượt lọc.
let _anonSrcCache={ch:null,txt:''};
function _anonChapterText(chapterIdx){
  const ch=Number.isFinite(chapterIdx)?(S.chapters||[])[chapterIdx]:null;
  if(!ch)return '';
  if(_anonSrcCache.ch!==ch)_anonSrcCache={ch,txt:String(charmemRawSource(ch)||'').normalize('NFC').toLowerCase()};
  return _anonSrcCache.txt;
}
// name có xuất hiện NGUYÊN VĂN trong text (text đã NFC+lowercase) không. Chữ không tách từ bằng khoảng trắng (Hán/Kana/Thái): khớp chuỗi
// con (Hangul cũng vậy vì trợ từ dính liền sau tên). Chữ khác (Latin, Cyrillic, Hy Lạp, Ả Rập...): không được dính liền chữ/số ở hai đầu (tránh "Ann" khớp trong "Anna").
function charNameInText(name,text){
  const k=String(name||'').normalize('NFC').trim().toLowerCase();
  if(k.length<2||!text)return false;
  if(/[\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(k))return text.includes(k);
  const isW=x=>/[\p{L}\p{M}\p{N}_]/u.test(x);
  let i=0,guard=0;
  while(guard++<500&&(i=text.indexOf(k,i))!==-1){
    const prev=i>0?text[i-1]:'',next=i+k.length<text.length?text[i+k.length]:'';
    if(!(prev&&isW(prev))&&!(next&&isW(next)))return true;
    i+=k.length;
  }
  return false;
}
function isAnonymousCharRecord(c,chapterIdx){
  if(!c)return false;
  if(isCharProtagonist(c))return false;
  if(Object.keys(c).some(k=>/Source$/.test(k)&&c[k]==='user'))return false;   // nameSource/addrSource/... = 'user'
  // Cách gọi "định danh được" = tên riêng/biệt danh của đúng 1 người (tên gốc hoặc alias). Cụm mô tả ngoại hình/chức danh chung
  // (方脸男子, 白发苍苍老者, 高瘦青年...) KHÔNG tính vì code không thể dựa vào đó để nhận ra người này ở chương sau.
  // Tên riêng THẬT mà chính chữ đó đã xuất hiện trong văn bản nguồn (c.nameInSrc, đặt ở pruneAnonymousCharacters) => lần sau code nhận ra
  // bằng chính tên, KHÔNG cần "tên gốc" riêng. Không phụ thuộc ngôn ngữ (Việt convert, Anh, Pháp, Nga, Hàn...): "là tên thật hay chỉ
  // biệt danh/chức danh" do AI quyết (c.namePlaceholder, ở bất kỳ ngôn ngữ nào) chứ không dựa bảng từ tiếng Việt/Trung.
  // Truyện gốc Hán/Nhật: tên dịch không nằm trong văn bản nguồn nên không bao giờ có cờ này => vẫn phải có tên gốc như trước.
  if(c.nameInSrc===true&&c.namePlaceholder!==true&&!isGenericAddressTerm(c.name)&&!looksLikePlaceholderCharName(c.name))return false;
  const forms=charForms(c);
  const identifying=forms.filter(f=>f.aiKind?f.aiKind!=='title_or_relation':f.kind!=='role_label');
  if(identifying.length)return false;
  if(!forms.length)return true;   // không có tên gốc lẫn tên khác nào
  // Chỉ có cụm mô tả/danh xưng chung: giữ nếu đã lặp lại từ 2 chương trở lên; vừa mới thấy ở chương đang xử lý thì cho thêm 1 chương
  // để xem có xuất hiện lại không (xoá ngay thì không bao giờ đạt được "2 chương"); sau đó vẫn không lặp lại thì xoá.
  const ch=(c.mentionChapters||[]).filter(Number.isFinite);
  if(new Set(ch).size>=2)return false;
  if(Number.isFinite(chapterIdx)&&ch.length&&Math.max(...ch)>=chapterIdx)return false;
  return true;
}
function pruneAnonymousCharacters(appeared,chapterIdx){
  if(!CHARMEM_PRUNE_ANONYMOUS)return 0;
  // Đánh dấu nhân vật có tên riêng thật xuất hiện nguyên văn trong chương đang xử lý (xem isAnonymousCharRecord). Cờ được lưu lại nên các
  // chương sau, dù nhân vật không có mặt, vẫn không bị coi là vô danh.
  _anonSrcCache={ch:null,txt:''};
  try{
    const _txt=_anonChapterText(chapterIdx);
    if(_txt)(S.characters||[]).forEach(c=>{if(c&&!c.nameInSrc&&c.namePlaceholder!==true&&charNameInText(c.name,_txt))c.nameInSrc=true;});
  }catch(e){}
  const drop=(S.characters||[]).filter(c=>isAnonymousCharRecord(c,chapterIdx));
  if(!drop.length)return 0;
  const ids=new Set(drop.map(c=>c.id));
  S.characters=S.characters.filter(c=>!ids.has(c.id));
  S.characters.forEach(c=>{   // dọn tham chiếu treo tới record đã xoá
    if(Array.isArray(c.edges))c.edges=c.edges.filter(e=>!(e&&ids.has(e.id)));
    if(Array.isArray(c.sameAs))c.sameAs=c.sameAs.filter(e=>!(e&&ids.has(e.id)));
  });
  if(Array.isArray(S.charMergeRejected))S.charMergeRejected=S.charMergeRejected.filter(p=>Array.isArray(p)&&!ids.has(p[0])&&!ids.has(p[1]));
  if(Array.isArray(appeared)){for(let i=appeared.length-1;i>=0;i--){if(appeared[i]&&ids.has(appeared[i].id))appeared.splice(i,1);}}
  console.log(`[Luồng 1][Lọc vô danh] Bỏ ${drop.length} nhân vật không có tên gốc/tên khác định danh (hoặc chỉ có cụm mô tả, không lặp lại từ 2 chương): ${drop.map(c=>c.name).join(', ')}`);
  return drop.length;
}
// ===================================================================
// ===== TÊN DỊCH TRÙNG -> BỊ TÁCH "(2)": ĐỐI CHIẾU BẰNG AI, SỬA TÊN DỊCH SAI, ĐỀ XUẤT GỘP =====
// ===================================================================
// Khi 2 hồ sơ cùng mang 1 TÊN ĐÃ DỊCH mà phải thêm hậu tố "(2)" để phân biệt, gần như luôn có chuyện bất thường: hoặc 1 hồ sơ bị dịch
// SAI tên (VD 王禹 bị dịch thành "Đinh Vũ" trùng với 丁禹; đúng là "Vương Vũ"), hoặc 2 hồ sơ thật ra là 1 người. Trước đây chỉ thêm hậu tố
// rồi thôi nên tên sai tồn tại mãi. Nay mỗi chương, sau khi gộp/lọc xong, các nhóm trùng tên được gửi 1 lượt API RIÊNG (không kèm văn bản
// chương, chỉ gửi dữ liệu 2 hồ sơ) để AI: (1) đối chiếu tên dịch của từng hồ sơ với tên gốc, (2) sửa tên dịch sai, (3) nếu có dấu hiệu rõ là
// cùng 1 người thì chỉ ĐỀ XUẤT gộp (banner "Gộp / Không phải"), không tự gộp. Cùng họ khác chữ mà trùng âm (王宇/王禹 -> "Vương Vũ") là
// trùng hợp lệ: giữ hậu tố, đánh dấu đã kiểm, không hỏi lại.
const CHARMEM_DUPNAME_MAX_GROUPS=3;      // số nhóm trùng tên gửi tối đa mỗi lượt
const CHARMEM_DUPNAME_MAX_MEMBERS=4;     // số hồ sơ tối đa mỗi nhóm
const CHARMEM_DUPNAME_MAX_TRIES=3;       // số lượt hỏi tối đa cho cùng 1 nhóm (cùng dữ liệu) trước khi bỏ cuộc
const _DUPNAME_SUFFIX_RE=/\s*\(\d+\)\s*$/;
function _dupNameSig(arr){return arr.map(c=>c.id+'|'+charOrigNameList(c).map(normKey).sort().join(',')).sort().join(';');}
// Các nhóm hồ sơ (>=2, không phải nhãn mô tả) cùng tên hiển thị, trong đó có ít nhất 1 hồ sơ đã bị gắn hậu tố "(N)" và có ít nhất 1 tên gốc để đối chiếu.
function collectDupNameSplits(){
  const by=new Map();
  (S.characters||[]).forEach(c=>{
    if(!c||!c.name||c.namePlaceholder||c.nameLabelByJudge)return;   // nhãn mô tả ("Cha của X") trùng nhau là bình thường
    const base=normKey(displayCharName(c));
    if(!base||containsCJK(base))return;
    if(!by.has(base))by.set(base,[]);
    by.get(base).push(c);
  });
  const out=[];
  by.forEach(arr=>{
    if(arr.length<2||!arr.some(c=>_DUPNAME_SUFFIX_RE.test(String(c.name))))return;
    if(!arr.some(c=>charOrigNameList(c).length))return;   // không có tên gốc nào để đối chiếu
    const sig=_dupNameSig(arr);
    if(arr.every(c=>c.dupNameDone===true&&c.dupNameSig===sig))return;                                  // đã kiểm xong với đúng dữ liệu này
    if(arr.some(c=>c.dupNameSig===sig&&(c.dupNameTries||0)>=CHARMEM_DUPNAME_MAX_TRIES))return;         // hỏi đủ lần mà chưa xong
    out.push(arr.slice(0,CHARMEM_DUPNAME_MAX_MEMBERS));
  });
  return out.slice(0,CHARMEM_DUPNAME_MAX_GROUPS);
}
function buildDupNamePrompt(groups,promptGuidance){
  const chn=i=>(typeof _chn==='function'?_chn(i):i+1);
  const data=groups.map((g,gi)=>({id:'g'+gi,sharedName:displayCharName(g[0]),members:g.map((c,mi)=>({
    ref:'g'+gi+'m'+mi,name:c.name,originalName:charOrigNameList(c).join(', ')||undefined,
    aliases:(c.aliases||[]).slice(0,8),gender:c.gender||undefined,statusCue:c.statusCue||undefined,
    relationship:isUnknownVal(c.relationship)?undefined:c.relationship,protagonist:isCharProtagonist(c)?true:undefined,
    note:c.note?String(c.note).slice(0,160):undefined,chapters:(c.mentionChapters||[]).slice(0,6).map(chn)}))}));
  const guidance=promptGuidance?`CHỈ DẪN THỂ LOẠI/XƯNG HÔ của truyện:\n${promptGuidance}\n\n`:'';
  return `Trong bộ nhớ nhân vật của một bộ truyện, các nhóm dưới đây có NHIỀU hồ sơ đang mang CÙNG MỘT TÊN ĐÃ DỊCH (hệ thống phải thêm hậu tố "(2)" để phân biệt). `+
    `Thường là do MỘT hồ sơ bị dịch SAI tên (VD 张伟 lẽ ra là "Trương Vĩ" nhưng bị dịch thành "Lưu Vĩ" trùng với 刘伟), hoặc do 2 hồ sơ thật ra là cùng 1 người.\n\n`+guidance+
    `DỮ LIỆU:\n${JSON.stringify(data)}\n\n`+
    `NHIỆM VỤ:\n`+
    `1) Với MỖI hồ sơ có "originalName" chữ Hán: đối chiếu "name" (bỏ hậu tố "(N)") với "originalName" xem đã là phiên âm Hán Việt ĐÚNG chưa (đúng họ, đúng từng âm tiết, đúng thứ tự). `+
    `Đúng -> "nameOk":true. Sai -> "nameOk":false và "fixName" = tên đúng (viết hoa từng âm tiết, KHÔNG có hậu tố "(N)", KHÔNG còn chữ Hán, khác với tên của các hồ sơ khác trong nhóm). `+
    `Chuẩn dịch tên: theo chỉ dẫn thể loại nếu có; không có thì chữ Hán -> Hán Việt; tên chữ Hán thực chất là âm dịch tên phương Tây -> dạng Latin gốc. `+
    `LƯU Ý: HỌ khác nhau thì âm Hán Việt của họ phải khác nhau (王 ≠ 丁). Nhiều chữ khác nhau nhưng CÙNG họ có thể trùng âm hợp lệ (VD 王宇 và 王禹 đều là "Vương Vũ") -> đó KHÔNG phải lỗi, để "nameOk":true cho cả hai. `+
    `Hồ sơ không có "originalName" thì không cần trả "nameOk" cho hồ sơ đó.\n`+
    `2) Chỉ khi có dấu hiệu RẤT RÕ là cùng 1 người (VD cùng tên gốc chỉ khác giản/phồn thể, hoặc 1 hồ sơ chưa có tên gốc mà giới tính/độ tuổi/vai trò/ghi chú trùng khớp) thì liệt kê cặp đó trong "same". `+
    `Tên gốc chữ Hán khác hẳn nhau (khác họ hoặc khác tên) = 2 NGƯỜI RIÊNG, KHÔNG BAO GIỜ đưa vào "same". Không chắc thì KHÔNG liệt kê.\n`+
    `Bạn không có văn bản chương nên chỉ dựa vào dữ liệu trên; không bịa.\n\n`+
    `CHỈ trả về DUY NHẤT 1 object JSON, không markdown: {"groups":[{"id":"g0","members":[{"ref":"g0m0","nameOk":true},{"ref":"g0m1","nameOk":false,"fixName":"...","reason":"..."}],"same":[{"a":"g0m0","b":"g0m1","reason":"..."}]}]}`;
}
// Đổi tên 1 hồ sơ trong nhóm trùng tên. Khác renameCharKeepAlias: KHÔNG giữ tên cũ (đã sai, và là tên của người khác) làm alias,
// vì alias đó sẽ làm 2 hồ sơ cùng khớp 1 tên ở các chương sau.
function _dupNameRename(c,newName){
  const oldName=c.name;
  c.name=uniqueCharNameFor(newName,c);
  const drop=new Set([normKey(oldName),normKey(displayCharName({name:oldName}))]);
  c.aliases=(c.aliases||[]).filter(a=>!drop.has(normKey(a))&&normKey(a)!==normKey(c.name));
  c.nameConflict=null;
  c.nameTransChecked=true;c.nameVerified=true;   // vừa được đối chiếu riêng với tên gốc
  onCharRenamed(c,oldName);
  return oldName;
}
// Hồ sơ còn hậu tố "(N)" mà không còn ai trùng tên -> bỏ hậu tố.
function _dupNameTidySuffix(c){
  if(!c||!_DUPNAME_SUFFIX_RE.test(String(c.name)))return false;
  const base=displayCharName(c);
  const old=c.name;
  const free=uniqueCharNameFor(base,c);
  if(free===old||_DUPNAME_SUFFIX_RE.test(free))return false;
  c.name=free;onCharRenamed(c,old);
  return true;
}
function _dupNameFixCheck(c,group,fix){
  if(!fix)return 'không có tên sửa';
  if(c.nameSource==='user')return 'tên do người dùng đặt';
  if(isCharProtagonist(c))return 'nhân vật chính (để người dùng quyết)';
  if(containsCJK(fix)||fix.length>60||_DUPNAME_SUFFIX_RE.test(fix))return 'tên sửa không hợp lệ';
  if(looksLikePlaceholderCharName(fix)||isGenericAddressTerm(fix))return 'tên sửa là nhãn/danh xưng chung';
  const nk=normKey(fix);
  if(nk===normKey(displayCharName(c)))return 'tên sửa y như tên hiện tại';
  const clash=(S.characters||[]).find(x=>x!==c&&(normKey(x.name)===nk||normKey(displayCharName(x))===nk||(x.aliases||[]).some(a=>normKey(a)===nk)));
  if(clash)return `trùng nhân vật khác "${clash.name}"`;
  return '';
}
async function resolveDuplicateNameSplits(keys,chapterIdx,primary,fallback,promptGuidance){
  if(!keys||!keys.length||!getNameCheckOn())return 0;
  const groups=collectDupNameSplits();
  if(!groups.length)return 0;
  if(!charmemOptionalAllowed(primary,keys,'đối chiếu tên dịch trùng'))return 0;
  console.log(`[Luồng 1][Tên trùng] ${groups.length} nhóm hồ sơ trùng tên dịch (bị tách "(N)"): ${groups.map(g=>g.map(c=>`"${c.name}"[${charOrigNameList(c).join('/')||'?'}]`).join(' ~ ')).join(' | ')} -> gọi AI đối chiếu.`);
  const messages=[{role:'user',parts:[{text:buildDupNamePrompt(groups,promptGuidance)}]}];
  let raw;
  try{raw=await callCharModel(keys,primary,messages,CHAR_ANALYSIS_TIMEOUT_MS,'dupname');}
  catch(e){
    if(!fallback||!charmemOptionalAllowed(fallback,keys,'đối chiếu tên dịch trùng (dự phòng)')||!charmemModelHasRoom(fallback,keys)){
      console.log('[Luồng 1][Tên trùng] Lỗi gọi API — sẽ thử lại ở chương sau:',e&&e.message||e);return 0;}
    try{raw=await callCharModel(keys,fallback,messages,CHAR_ANALYSIS_TIMEOUT_MS,'dupname-fb');}
    catch(e2){console.log('[Luồng 1][Tên trùng] Lỗi gọi API (cả model dự phòng) — sẽ thử lại ở chương sau:',e2&&e2.message||e2);return 0;}
  }
  const parsed=parseCharacterJSON(raw);
  const res=parsed&&Array.isArray(parsed.groups)?parsed.groups:null;
  if(!res){console.log('[Luồng 1][Tên trùng] Không parse được JSON trả về — sẽ thử lại ở chương sau. Raw:',raw);return 0;}
  let changed=0;
  groups.forEach((g,gi)=>{
    const sig=_dupNameSig(g);
    g.forEach(c=>{c.dupNameTries=(c.dupNameSig===sig?(c.dupNameTries||0):0)+1;c.dupNameSig=sig;});   // chỉ đếm khi parse được (lỗi API không tính)
    const rg=res.find(x=>x&&x.id==='g'+gi);
    if(!rg){console.log(`[Luồng 1][Tên trùng] AI không trả kết quả cho nhóm "${displayCharName(g[0])}".`);return;}
    const byRef=new Map();(Array.isArray(rg.members)?rg.members:[]).forEach(m=>{if(m&&typeof m.ref==='string')byRef.set(m.ref,m);});
    const recOf=ref=>{const m=/^g(\d+)m(\d+)$/.exec(String(ref||''));return m&&+m[1]===gi?g[+m[2]]:null;};
    let allSettled=true;
    g.forEach((c,mi)=>{
      const v=byRef.get('g'+gi+'m'+mi);
      if(!charOrigNameList(c).length)return;
      if(!v||v.nameOk===undefined){allSettled=false;return;}
      if(v.nameOk===false){
        const fix=typeof v.fixName==='string'?v.fixName.normalize('NFC').trim():'';
        const bad=_dupNameFixCheck(c,g,fix);
        if(bad){allSettled=false;console.log(`[Luồng 1][Tên trùng] Bỏ qua sửa "${c.name}" -> "${fix}": ${bad}.`);return;}
        const old=_dupNameRename(c,fix);
        changed++;
        console.log(`[Luồng 1][Tên trùng] Dịch sai tên gốc ${JSON.stringify(charOrigNameList(c))}: "${old}" -> "${c.name}"${v.reason?' ('+String(v.reason).slice(0,120)+')':''}`);
      }
    });
    (Array.isArray(rg.same)?rg.same:[]).forEach(p=>{
      const a=p&&recOf(p.a),b=p&&recOf(p.b);
      if(!a||!b||a===b||!(S.characters||[]).includes(a)||!(S.characters||[]).includes(b))return;
      if(isMergePairRejected(a.id,b.id))return;
      const why=distinctByOrigName(a,b)?'origname':sameAsSafetyBlock(a,b);
      if(why==='gender'||why==='origname'){console.log(`[Luồng 1][Tên trùng] AI cho rằng "${a.name}" = "${b.name}" nhưng ${describeMergeBlock(a,b,why)} -> bỏ qua.`);return;}
      const r=recordSameAsProposal(S.characters,a,b,{direct:false,evidence:'AI đối chiếu 2 hồ sơ trùng tên dịch: '+String(p.reason||'có dấu hiệu cùng một người').slice(0,160),chapter:chapterIdx});
      changed++;
      console.log(`[Luồng 1][Tên trùng] AI cho rằng "${a.name}" = "${b.name}" -> chỉ đề xuất (${r}), chờ người dùng duyệt.`);
    });
    g.forEach(c=>{if(_dupNameTidySuffix(c))console.log(`[Luồng 1][Tên trùng] Bỏ hậu tố "(N)" của "${c.name}" vì không còn trùng tên.`);});
    if(allSettled){const s2=_dupNameSig(g);g.forEach(c=>{c.dupNameDone=true;c.dupNameSig=s2;});}
  });
  return changed;
}
async function analyzeChapterCharacters(chapterIdx){
  _curMergeChapter=chapterIdx;_autoMergeCount=0;   // [D][G] nhật ký biết chương nào; bộ đếm gộp tự động tính riêng từng chương
  try{return await _analyzeChapterCharactersInner(chapterIdx);}
  finally{_curMergeChapter=null;_autoMergeCount=0;}
}
async function _analyzeChapterCharactersInner(chapterIdx){
  try{
    if(!getCharMemOn())return [];
    const ch=S.chapters[chapterIdx];
    if(!ch)return [];
    const keys=getKeys();
    if(!keys.length)return [];
    console.log(`[Luồng 1][Phân tích chương] Analyzing chapter ${chNum(chapterIdx)}...`);
    const _quotaBefore=charmemQuotaSnapshot(); // Bước 0: đo số lượt gọi của chương này

    const chapterTextForAnalysis=applyCharNameSubstitution(charmemRawSource(ch)).slice(0,CHARMEM_ANALYSIS_MAX_CHARS);
    const srcKey=addrQuoteKey(chapterTextForAnalysis);
    const promptGuidance=await getMainPromptGuidance();
    const refMap={};   // mã ref (c1,c2...) -> id nhân vật của đúng lượt gọi này
    const promptText=buildCharExtractPrompt(chapterTextForAnalysis,promptGuidance,refMap);
    const messages=[{role:'user',parts:[{text:promptText}]}];

    // 1 LƯỢT GỌI DUY NHẤT cho cả Gemini lẫn DeepSeek. Với DeepSeek (chỉ có 1 model), model dự phòng
    // để trống — lỗi là bỏ qua luôn, không có gì để thử lại.
    const isDeepseek=getProvider()==='deepseek';
    // Trích xuất + kiểm tra lại thông tin nhân vật đều dùng model A (B chỉ là dự phòng khi A lỗi và B còn chỗ;
    // B dành cho các job soát chất lượng bản dịch ở Luồng 3).
    const primaryModel=isDeepseek?getModel():CHAR_MODEL_A;
    const fallbackModel=isDeepseek?null:CHAR_MODEL_B;
    const verifyModel=isDeepseek?getModel():CHAR_MODEL_A;
    const verifyFallback=isDeepseek?null:CHAR_MODEL_B;

    let rawText;
    let usedModel=primaryModel; // [Bước 5] model đã trả rawText — nếu JSON hỏng thì thử lại ĐÚNG model này
    try{
      rawText=await callCharModel(keys,primaryModel,messages,CHAR_ANALYSIS_TIMEOUT_MS,'extract');
    }catch(e){
      if(!fallbackModel){
        console.log('[Luồng 1][Phân tích chương] Lỗi gọi API — bỏ qua chương này:',e.message||e);
        return charmemFail('api: '+(e.message||e));
      }
      // [Bước 5] Chỉ sang model dự phòng khi nó còn chỗ. Đang kín thì bỏ chương này (Bước 1 sẽ tự thử lại sau 60s/3 phút),
      // không ép lượt thứ 2 vào model đã kín. Cả 2 hết quota NGÀY thì báo 'quota-ngay' để không thử lại vô ích (Bước 3).
      if(!charmemModelHasRoom(fallbackModel,keys)){
        const _fbDayDead=charmemModelDayDead(fallbackModel,keys);
        const _prDay=String(e&&e.message||'').includes('QUOTA_PER_DAY');
        console.log(`[Luồng 1][Phân tích chương] Model chính lỗi và model dự phòng ${fallbackModel===CHAR_MODEL_B?'B':fallbackModel} không còn chỗ (${_fbDayDead?'hết quota ngày':'kín lượt/phút'}) — bỏ qua chương này, không thử dự phòng:`,e.message||e);
        return charmemFail((_fbDayDead&&_prDay?'quota-ngay: ':'api: ')+(e.message||e));
      }
      console.log('[Luồng 1][Phân tích chương] Model chính lỗi/timeout, thử model dự phòng...',e.message||e);
      try{
        rawText=await callCharModel(keys,fallbackModel,messages,CHAR_ANALYSIS_TIMEOUT_MS,'extract-fb');
        usedModel=fallbackModel;
      }catch(e2){
        console.log('[Luồng 1][Phân tích chương] Cả model chính lẫn model dự phòng đều lỗi — bỏ qua chương này:',e2.message||e2);
        // [Bước 3] Hết quota NGÀY ở cả 2 model: failReason bắt đầu bằng 'quota-ngay' để nơi gọi (index.html) không thử lại vô ích.
        const _dayDead=String(e2&&e2.message||'').includes('QUOTA_PER_DAY')&&String(e&&e.message||'').includes('QUOTA_PER_DAY');
        return charmemFail((_dayDead?'quota-ngay: ':'api: ')+(e2.message||e2));
      }
    }
    let parsed=parseCharacterJSON(rawText);
    let found=parsed&&Array.isArray(parsed.characters)?parsed.characters:null;
    // JSON không parse được KHÔNG PHẢI lỗi gọi API (request vẫn thành công, model chỉ trả sai định
    // dạng — VD dư/thiếu dấu ngoặc) nên nhánh try/catch phía trên không bắt được trường hợp này —
    // trước bản sửa này, gặp là bỏ luôn chương dù còn model dự phòng chưa dùng tới. Garbled JSON
    // thường chỉ là lỗi phát sinh 1 lượt (không phải lỗi hệ thống như 503 ở trên), nên đáng thử lại
    // ĐÚNG 1 lần: có fallbackModel (Gemini) thì dùng fallback — đỡ lặp lại đúng kiểu lỗi format của
    // model chính; không có fallback (DeepSeek chỉ 1 model) thì thử lại CHÍNH model đó 1 lần.
    if(!found){
      // [Bước 5] Lỗi định dạng KHÔNG phải lỗi model/quota: thử lại đúng model vừa trả JSON hỏng (không đổi model, không giành chỗ của model kia).
      const retryModel=usedModel;
      console.log(`[Luồng 1][Phân tích chương] Model trả JSON không parse được, thử lại 1 lần với ${retryModel}... Raw:`,rawText);
      try{
        const retryRaw=await callCharModel(keys,retryModel,messages,CHAR_ANALYSIS_TIMEOUT_MS,'extract-retry',{json:true});
        parsed=parseCharacterJSON(retryRaw);
        found=parsed&&Array.isArray(parsed.characters)?parsed.characters:null;
        if(!found){
          console.log('[Luồng 1][Phân tích chương] Thử lại vẫn không parse được — bỏ qua chương này. Raw:',retryRaw);
          return charmemFail('json');
        }
      }catch(e3){
        console.log('[Luồng 1][Phân tích chương] Lỗi gọi API khi thử lại — bỏ qua chương này:',e3.message||e3);
        return charmemFail('api-retry: '+(e3.message||e3));
      }
    }
    // Chuyển schema có cấu trúc (addrThemToMc/addrMcToThem dạng mảng object) về chuỗi lưu trữ nội
    // bộ NGAY LẬP TỨC, trước khi chạy heuristic hay merge — phần còn lại của pipeline (heuristic,
    // mergeAnalysisResults, applyCharField...) chỉ cần biết đúng 1 định dạng chuỗi như trước giờ.
    found=found.map(normalizeExtractedCharacter);
    resolveEntryRefs(found,refMap);   // khớp record theo mã ref AI trả về (xem mergeAnalysisResults)

    // GIÁM KHẢO TÊN và XÁC MINH XƯNG HÔ đã BỎ: bước "Kiểm tra lại thông tin" bên dưới đã kiểm lại cùng dữ liệu.
    // Chỉ giữ lưới cơ học miễn phí: xưng hô có addrQuote chép đúng nguyên văn trong chương -> addrTrust='verified'.
    found.forEach(f=>{
      if(hasAddrValueOf(f)&&verifyAddrQuote(f,srcKey))f.addrTrust='verified';
    });
    // ===== KIỂM TRA LẠI THÔNG TIN: chỉ đọc kết quả vừa phân tích (không gửi văn bản chương) -> xếp lại tên, dịch chữ Hán sót, chỉnh xưng hô đúng hệ, điền đủ trường =====
    if(!charmemGeneric()&&getNameCheckOn()){ // đích ≠ vi: bước này là Hán Việt/xưng hô → bỏ qua
      try{found=await recheckExtractedCharacters(found,keys,promptGuidance,verifyModel,verifyFallback,scanMentionedCharIds(chapterTextForAnalysis));}
      catch(e){console.log('[Luồng 1][Kiểm tra lại] Lỗi — giữ nguyên kết quả bước phân tích:',e&&e.message||e);}
    }


    console.log(`[Luồng 1][Phân tích chương] Found ${found.length} characters.`);
    const merges=Array.isArray(parsed.merges)?parsed.merges:[];
    if(merges.length){
      console.log(`[Luồng 1][Phân tích chương] Detected ${merges.length} duplicate group(s) to link.`);
      console.log('[Luồng 1][Nối nhân vật] merges AI trả về:',JSON.stringify(merges).slice(0,700));
      applyAutoMerges(merges,{chapterIdx,srcText:chapterTextForAnalysis});
    }
    const realNameReveals=Array.isArray(parsed.realNameReveals)?parsed.realNameReveals:[];
    if(realNameReveals.length){
      console.log(`[Luồng 1][Phân tích chương] Detected ${realNameReveals.length} realNameReveal(s).`);
      applyRealNameReveals(realNameReveals,chapterTextForAnalysis,chapterIdx);
    }
    const appeared=mergeAnalysisResults(found,chapterIdx,chapterTextForAnalysis);
    // GỘP TỰ ĐỘNG theo thẻ AI đánh dấu (kin / bodyOf) — code làm hết, không tốn thêm lượt API. Bọc riêng.
    try{
      const _tags=(found||[]).filter(f=>f&&(_isMcMark(f.bodyOf)||(f.kin&&typeof f.kin==='object'))).map(f=>`\"${f.name}\" bodyOf=${_isMcMark(f.bodyOf)?'MC':'-'} kin=${(f.kin&&typeof f.kin==='object')?`${f.kin.role}→${f.kin.of}`:'-'}`);
      console.log(`[Luồng 1][Thẻ] ch.${_chn(chapterIdx)}: ${_tags.length?_tags.join(' | '):'AI không gắn thẻ bodyOf/kin nào'}`);
    }catch(e){}
    try{
      const _rv=applyRecheckVerdicts(found,chapterIdx);
      if(_rv.log.length)console.log('[Luồng 1][Phán quyết kiểm tra lại]',JSON.stringify(_rv.log));
      if(_rv.merged.size&&Array.isArray(appeared)){
        _rv.merged.forEach((tgt,srcId)=>{
          const had=appeared.some(x=>x&&x.id===srcId);
          for(let i=appeared.length-1;i>=0;i--){if(appeared[i]&&appeared[i].id===srcId)appeared.splice(i,1);}
          if(had&&!appeared.some(x=>x&&x.id===tgt.id))appeared.push(tgt);
        });
      }
    }catch(e){console.log('[Phán quyết kiểm tra lại] Lỗi, bỏ qua:',e&&e.message||e);}
    try{
      const _im=applyIdentityMarks(found,chapterIdx);
      if(_im.log.length)console.log('[Luồng 1][Gộp theo thẻ]',JSON.stringify(_im.log));
      if(_im.merged.size&&Array.isArray(appeared)){
        _im.merged.forEach((tgt,srcId)=>{
          const had=appeared.some(x=>x&&x.id===srcId);
          for(let i=appeared.length-1;i>=0;i--){if(appeared[i]&&appeared[i].id===srcId)appeared.splice(i,1);}
          if(had&&!appeared.some(x=>x&&x.id===tgt.id))appeared.push(tgt);
        });
      }
    }catch(e){console.log('[Luồng 1][Gộp theo thẻ] Lỗi, bỏ qua:',e&&e.message||e);}
    // 3.3: quan hệ phụ–phụ AI báo (cần nhân vật đã có trong S.characters nên chạy SAU merge) + cạnh migrated cho nhân vật mới.
    // Bọc riêng: lỗi ở đây không được làm mất `appeared` của luồng dịch chính.
    try{
      const _rel=applyRelations(Array.isArray(parsed.relations)?parsed.relations:[],{chapterIdx,srcText:chapterTextForAnalysis});
      if(_rel.length)console.log('[Luồng 1][Quan hệ]',JSON.stringify(_rel));
      migrateEdgesFromRelationship(S.characters);
    }catch(e){console.log('[Luồng 1][Quan hệ] Lỗi, bỏ qua:',e.message||e);}
    // 4.2: thân phận giả + ai biết (cùng lượt gọi; bọc riêng như trên).
    try{
      const _pe=applyPersonas(Array.isArray(parsed.personas)?parsed.personas:[],{chapterIdx,srcText:chapterTextForAnalysis});
      if(_pe.length)console.log('[Luồng 1][Thân phận giả]',JSON.stringify(_pe));
    }catch(e){console.log('[Luồng 1][Thân phận giả] Lỗi, bỏ qua:',e.message||e);}
    // Gộp tự động biệt danh -> tên thật (sau khi các bước trên đã đặt cờ biệt danh + ghi liên kết sameAs). Bọc riêng như các bước phụ.
    try{autoMergeNicknameLinks(appeared);}
    catch(e){console.log('[Luồng 1][Gộp biệt danh] Lỗi, bỏ qua:',e&&e.message||e);}
    try{pruneAnonymousCharacters(appeared,chapterIdx);}
    catch(e){console.log('[Luồng 1][Lọc vô danh] Lỗi, bỏ qua:',e&&e.message||e);}
    // Trùng tên gốc -> tự gộp (chạy trước resolveDuplicateNameSplits để khỏi tốn lượt AI cho các cặp "(N)" đã rõ là cùng người).
    try{autoMergeSameOrigName(appeared);}
    catch(e){console.log('[Luồng 1][Gộp tên gốc] Lỗi, bỏ qua:',e&&e.message||e);}
    // [Tên trùng] hồ sơ bị tách "(N)" vì trùng tên dịch -> AI đối chiếu, sửa tên dịch sai, đề xuất gộp nếu cần. Bọc riêng: lỗi không làm hỏng chương.
    try{if(!charmemGeneric())await resolveDuplicateNameSplits(keys,chapterIdx,verifyModel,verifyFallback,promptGuidance);}
    catch(e){console.log('[Luồng 1][Tên trùng] Lỗi, bỏ qua:',e&&e.message||e);}
    await saveCharacterMemory();
    flushAddrUnknownSummary(chapterIdx);
    console.log(`[Luồng 1][Phân tích chương] Completed.`);
    console.log(`[Quota] Chương ${chNum(chapterIdx)} — ${charmemQuotaDiff(_quotaBefore)}`); // lưu ý: gồm cả lượt nền chạy cùng lúc (soát lỗi, tên cứng đầu)
    // Chạy KHÔNG chờ (không await) — đây là tác vụ phụ tách hẳn khỏi luồng phân tích chương chính
    // (xem giải thích đầy đủ ở resolveStubbornNames), không được phép làm chậm việc trả "appeared"
    // về cho luồng dịch chính. Tự log lỗi bên trong, không throw ra ngoài.
    if(!charmemGeneric())resolveStubbornNames(keys).catch(e=>console.log('[Luồng 3][Dịch tên cứng đầu] Lỗi không mong muốn:',e.message||e));
    return appeared;
  }catch(e){
    console.log('[Luồng 1][Phân tích chương] Unexpected error — skipping:',e.message||e);
    return charmemFail('unexpected: '+(e.message||e));
  }
}

// ===================================================================
// ===== GỘP DỊCH "TÊN CỨNG ĐẦU" — TÊN CÒN SÓT CHỮ HÁN SAU NHIỀU CHƯƠNG LIÊN TIẾP =====
// ===================================================================
// Vấn đề: một số tên (VD từ Hán phổ thông dễ bị hiểu nhầm là danh từ chung, không giống cấu trúc
// Họ+Tên rõ ràng) bị model bỏ sót YÊU CẦU dịch/phiên âm hết lượt phân tích chương này tới lượt khác,
// vì việc "dịch tên" đang bị lồng chung trong 1 prompt trích xuất nhân vật dài, dễ bị các phần khác
// của prompt lấn át. Giải pháp: khi 1 tên đã bỏ sót ĐỦ LÂU (xem STUBBORN_NAME_STREAK_THRESHOLD, đếm
// ở c.untranslatedStreak trong mergeAnalysisResults), gộp TẤT CẢ các tên còn sót chữ Hán (không chỉ
// riêng tên vừa chạm ngưỡng) vào 1 lượt gọi API RIÊNG, tách hẳn khỏi prompt trích xuất chính — prompt
// chỉ tập trung 100% vào việc dịch tên, không bị nhiễu bởi văn cảnh dài dòng, và gộp nhiều tên vào 1
// request thay vì gọi lẻ tẻ mỗi chương (đỡ tốn quota, xem CHAR_MODEL_A dùng chung với distillModel).
const STUBBORN_NAME_STREAK_THRESHOLD=6;

// Chỉ cần TỪ 1 tên chạm ngưỡng streak là kích hoạt cả lượt gộp — nhưng gộp DỊCH LUÔN mọi tên đang
// còn sót chữ Hán tại thời điểm gọi (kể cả tên mới bị sót 1-2 chương, chưa tới ngưỡng riêng), vì đằng
// nào cũng đã tốn 1 lượt gọi API cho việc này, tiện gộp X để giảm số lần bị bỏ sót cần chờ tới streak
// 6 của riêng nó.
function collectNamesForStubbornResolve(){
  const triggered=S.characters.some(c=>containsCJK(c.name)&&(c.untranslatedStreak||0)>=STUBBORN_NAME_STREAK_THRESHOLD);
  if(!triggered)return [];
  return S.characters.filter(c=>containsCJK(c.name));
}

async function resolveStubbornNames(keys){
  if(!keys||!keys.length)return;
  const targets=collectNamesForStubbornResolve();
  if(!targets.length)return;
  if(!charmemOptionalAllowed(CHAR_MODEL_A,keys,'dịch tên cứng đầu'))return; // [Bước 3] streak chưa reset nên chương sau tự thử lại
  console.log(`[Luồng 3][Dịch tên cứng đầu] Có tên bỏ sót ≥${STUBBORN_NAME_STREAK_THRESHOLD} chương liên tiếp — gọi API riêng dịch gộp ${targets.length} tên còn sót chữ Hán: ${targets.map(c=>c.name).join(', ')}`);
  const namesList=targets.map(c=>c.name);
  const prompt=`Dưới đây là danh sách tên nhân vật tiếng Trung trong 1 bộ tiểu thuyết, vẫn CHƯA được dịch/phiên âm sang tiếng Việt dù đã xuất hiện qua nhiều chương:\n`+
    namesList.map(n=>`- ${n}`).join('\n')+
    `\n\nVới MỖI tên, đưa ra bản dịch phù hợp để dùng làm tên nhân vật trong bản dịch tiếng Việt: ưu tiên phiên âm Hán Việt nếu là tên người/địa danh Trung Hoa thông thường; nếu ngữ cảnh cho thấy đây là tên phương Tây/nước ngoài bị phiên âm ngược sang chữ Hán thì phục hồi lại tên gốc đó thay vì phiên âm Hán Việt máy móc.\n`+
    `CHỈ trả về DUY NHẤT 1 object JSON phẳng dạng {"tên_gốc":"tên_đã_dịch", ...}, đủ tất cả ${namesList.length} tên liệt kê trên, không thêm giải thích, không thêm markdown, không thêm field nào khác.`;
  const messages=[{role:'user',parts:[{text:prompt}]}];
  let rawText;
  try{
    // CHAR_MODEL_A (nhẹ hơn CHAR_MODEL_B) — tác vụ này đơn giản, không cần ngữ cảnh dài, và cố tình
    // dùng model khác với lượt trích xuất chính (đang ưu tiên CHAR_MODEL_B) để không giành chung 1
    // model/quota với Luồng 1 đang chạy dịch nội dung.
    rawText=await callCharModel(keys,CHAR_MODEL_A,messages,CHAR_ANALYSIS_TIMEOUT_MS,'stubborn');
  }catch(e){
    console.log('[Luồng 3][Dịch tên cứng đầu] Lỗi gọi API — bỏ qua lượt này, sẽ tự thử lại ở chương sau vì streak chưa reset:',e.message||e);
    return;
  }
  let mapping;
  try{
    mapping=JSON.parse(rawText.replace(/```json|```/g,'').trim());
  }catch(e){
    console.log('[Luồng 3][Dịch tên cứng đầu] Không parse được JSON trả về — bỏ qua lượt này. Raw:',rawText);
    return;
  }
  if(!mapping||typeof mapping!=='object')return;
  let appliedAny=false;
  for(const c of targets){
    const translated=(mapping[c.name]||'').toString().normalize('NFC').trim();
    // Lưới an toàn: model vẫn có thể trả lại y nguyên chữ Hán cho vài tên quá mơ hồ — bỏ qua, giữ
    // nguyên streak để vẫn hiện "Tên chưa dịch" trên UI, coi như báo cần người dùng tự sửa tay (ô
    // "Tên gọi khác" trong modal Chỉnh sửa là lưới an toàn cuối cùng cho các ca này).
    if(!translated||containsCJK(translated)){
      console.log(`[Luồng 3][Dịch tên cứng đầu] Bỏ qua "${c.name}" — model không đưa ra được bản dịch hợp lệ.`);
      continue;
    }
    const oldName=c.name;
    c.name=translated;
    onCharRenamed(c,oldName);
    c.untranslatedStreak=0;
    if(!(c.aliases||[]).some(a=>a.trim().toLowerCase()===oldName.trim().toLowerCase())){
      c.aliases=[...(c.aliases||[]),oldName];
    }
    // Bản dịch có thể vẫn chỉ là 1 nhãn mô tả (VD "Giả Cảnh Sát"), không phải tên riêng — dùng chung
    // đúng 1 lưới looksLikePlaceholderCharName như 2 nhánh vá tên khác trong mergeAnalysisResults.
    if(c.nameSource!=='user')c.namePlaceholder=looksLikePlaceholderCharName(translated);
    appliedAny=true;
    console.log(`[Luồng 3][Dịch tên cứng đầu] "${oldName}" -> "${translated}"`);
  }
  if(appliedAny)await saveCharacterMemory();
}

// ===================================================================
// ===== SOÁT XƯNG HÔ SAU KHI DỊCH XONG (theo 2 công tắc "Soát xưng hô bản dịch"/"Kiểm tra chính tả") =====
// ===================================================================
// Khác với analyzeChapterCharacters() (chạy TRƯỚC khi dịch, đọc VĂN BẢN GỐC để thu thập dữ liệu
// nhân vật/xưng hô rồi nhét vào prompt dịch) — hàm này chạy SAU khi dịch xong, đọc chính BẢN DỊCH
// vừa ra để bắt lỗi model dịch tự "trôi"/quên mất xưng hô đã được dặn (hay gặp ở chương dài, càng
// về cuối càng dễ lẫn). Không dịch lại cả chương — chỉ yêu cầu model chỉ ra ĐÚNG câu sai (trích
// nguyên văn) + câu đã sửa, rồi tool tự thay thế bằng find-and-replace theo CÂU TRỌN VẸN (không phải
// theo từ đơn lẻ như "ngươi"/"ta" — những từ này dùng chung bởi rất nhiều nhân vật/lời trần thuật
// trong cùng 1 chương, thay theo từ sẽ sửa nhầm hàng loạt chỗ không liên quan).
function isEstablishedAddrChar(c){
  return (c.addrThemToMc&&!isAddrUnknown(c.addrThemToMc))||
    (c.addrMcToThem&&!isAddrUnknown(c.addrMcToThem))||
    (c.narrRef&&!isNarrRefUnknown(c.narrRef));
}
// Nhân vật có "Mối quan hệ" (với MC) hoặc "Vai vế/địa vị" đã ghi nhận — đủ để model TỰ SUY ĐOÁN
// xưng hô hợp thể loại khi 2 nhân vật PHỤ (không phải cặp với MC) thoại trực tiếp với nhau, dù
// kiến trúc lưu trữ hiện tại KHÔNG có bảng xưng hô 2 chiều cho cặp phụ-phụ (chỉ addrThemToMc/
// addrMcToThem giữa từng nhân vật với MC). KHÔNG lưu lại kết quả suy đoán này — chỉ dùng cho riêng
// audit của chương hiện tại, vì mục đích thật sự chỉ là bắt chỗ model dịch chính lỡ quên dặn (xưng
// hô hiện đại/sai vai vế), không phải xây thêm 1 nguồn dữ liệu xưng hô mới cần đồng bộ giữa các chương.
function hasPeerAddrContext(c){
  // 3.3: đã có cạnh quan hệ (do AI báo trực tiếp / người dùng chọn) cũng đủ để suy xưng hô mặc định cho cặp phụ–phụ.
  return !!((c.relationship&&!isUnknownVal(c.relationship))||(c.statusCue&&c.statusCue.trim())||charHasEdge(S.characters,c));
}

// ===================================================================
// ===== KIỂM TRA CƠ HỌC CHO "fixes" CỦA auditChapterAddressing =====
// ===================================================================
// Trước bản sửa này, MỘT fix xưng hô chỉ được chấp nhận/loại dựa vào việc "before" có khớp DUY NHẤT
// 1 lần trong văn bản hay không (applyAddressFixes) — mọi lý do NGỮ NGHĨA (đúng phạm vi narrRef,
// đúng giới tính, đúng pattern ngữ pháp...) hoàn toàn dựa vào việc AI có tuân đúng prompt hay không,
// không có gì để code tự đối chiếu lại. Khối dưới đây thêm field "type"/"characterName"/
// "referentGender" vào schema (xem buildAuditReadPrompt) để code tự kiểm tra CHÉO — không tin
// nguyên văn "reason" AI viết ra, chỉ tin những gì đo/đếm được trực tiếp trên chính văn bản hoặc đối
// chiếu với dữ liệu nhân vật đã lưu. Thêm loại "type" mới BẮT BUỘC viết kèm 1 nhánh kiểm tra tương
// ứng trong validateAuditFixes bên dưới — không chỉ thêm vào danh sách rồi bỏ mặc cho AI tự giác.
// ĐÃ THU HẸP PHẠM VI (xem thảo luận): bỏ hẳn các type cần code/AI tự xác định "nhân vật này là ai"
// rồi đối chiếu với gender/relationship/narrRef đã lưu (addr_dialogue, narr_ref, gender_mismatch) —
// đây chính là nguồn gây sửa NHẦM NGƯỜI (2 nhân vật trùng 1 phần tên nhưng khác record vẫn bị AI gộp
// nhầm khi tự khai "characterName"), vì code chỉ kiểm tra được AI có tự mâu thuẫn với chính nó hay
// không, không kiểm tra được AI có NHẬN DIỆN ĐÚNG NGƯỜI hay không. Bỏ luôn "grammar_position" (không
// phải lỗi xưng hô/sắc thái, thực tế gần như luôn bị loại ở validateAuditFixes).
// GIỮ type THUẦN "sắc thái theo thể loại" — không cần biết nhân vật cụ thể là ai, không tra cứu
// gender/relationship đã lưu: genre_tone (đối chiếu với HỆ XƯNG HÔ CHUẨN theo thể loại của chương —
// báo & SỬA cả khi cả chương lỡ dùng sai hệ, không chỉ khi có vài câu lệch so với số đông — xem giải
// thích ở buildAuditReadPrompt).
// ĐÃ BỎ "narration_pronoun" (đại từ ngôi 3 khi tường thuật: hắn/nàng vs anh ấy/cô ấy, đối chiếu NỘI BỘ
// theo số đông trong chương) khỏi Luồng 3 — người dùng chỉ yêu cầu soát xưng hô LỜI THOẠI theo thể loại
// (genre_tone), không yêu cầu soát/sửa đại từ ngôi 3 lẫn tông trong tường thuật; việc này để AI tự làm
// đúng ngay từ bước dịch chính.
// (Job "gender_pronoun" — đại từ ngôi 3 SAI GIỚI TÍNH so với gender đã lưu — đã BỎ khỏi Luồng 3: việc
// này giờ được xử lý ngay từ bước dịch chính bằng cách gắn tag ⟦Nam⟧/⟦Nữ⟧ sau tên nhân vật trong văn
// bản gốc trước khi gửi AI dịch, xem insertGenderTags trong translate.js, thay vì soát/sửa lại sau.)
// THÊM LẠI "chinh_ta" (đã từng bị bỏ vì tưởng có bước KIỂM TRA BẢN DỊCH khác đảm nhiệm — thực tế
// KHÔNG tồn tại bước nào khác trong toàn bộ pipeline dịch làm việc này, nên chính tả trước giờ chưa
// hề được soát) và THÊM MỚI "sot_dich" (text tiếng Trung/Anh còn sót lại chưa được dịch sang tiếng
// Việt) — cả 2 đều có kiểm tra cơ học riêng bên dưới (isSpellingOnlyFix cho chinh_ta,
// containsCJK/looksLikeUntranslatedEnglish cho sot_dich), cùng nguyên tắc "không tin AI tự khai, chỉ
// tin những gì đo/đếm được" như type còn lại.
const AUDIT_FIX_TYPES=['genre_tone','chinh_ta','sot_dich'];

// Xác định vị trí idx trong text có đang nằm TRONG dấu ngoặc kép (lời thoại) hay không, bằng cách đếm
// dấu ngoặc mở/đóng xuất hiện TRƯỚC vị trí đó — thuần cơ học trên chính chuỗi ký tự, không hỏi lại AI.
// Dùng cho type "narr_ref": theo đúng "PHẠM VI ÁP DỤNG narrRef" đã nêu trong establishedSection ở
// trên, field này CHỈ áp dụng cho lời tường thuật NẰM NGOÀI dấu ngoặc kép — nếu "before" model trích
// ra lại đang nằm ngay trong lời thoại, đó là bằng chứng model đã tự vi phạm đúng phạm vi nó vừa được
// dặn, bất kể "reason" viết thuyết phục thế nào. Xử lý 2 kiểu ngoặc hay gặp trong bản dịch: ngoặc kép
// thẳng " (không phân biệt mở/đóng -> đếm số lần xuất hiện, lẻ = đang ở trong) và ngoặc kép cong
// “ ”/«  » (phân biệt rõ mở/đóng -> đếm lệch cặp mở nhiều hơn đóng = đang ở trong).
function isInsideQuote(text,idx){
  const before=text.slice(0,idx);
  const straightCount=(before.match(/"/g)||[]).length;
  if(straightCount%2===1)return true;
  const openCurly=(before.match(/[“„«]/g)||[]).length;
  const closeCurly=(before.match(/[”»]/g)||[]).length;
  return openCurly>closeCurly;
}
// "before" có thể không khớp CHÍNH XÁC trong text (lệch khoảng trắng/xuống dòng — xem
// buildLooseWhitespaceRegex ở applyAddressFixes) nhưng vẫn sẽ được ÁP DỤNG THẬT nhờ cơ chế khớp nới
// lỏng đó. Nếu isInsideQuote chỉ tra bằng text.indexOf(before) (khớp tuyệt đối) thì gặp đúng trường
// hợp lệch khoảng trắng này sẽ trả về -1 và BỊ COI LÀ "không xác định được vị trí" -> bỏ qua luôn
// kiểm tra ngoặc kép -> 1 fix narr_ref sai phạm vi (nằm trong lời thoại) vẫn lọt qua rồi được áp dụng
// thật ở bước sau bằng đúng cơ chế nới lỏng đó. Hàm này tìm vị trí THẬT SẼ ĐƯỢC DÙNG ĐỂ ÁP DỤNG (thử
// khớp tuyệt đối trước, không có thì thử regex nới lỏng khoảng trắng y hệt applyAddressFixes) rồi mới
// kiểm tra ngoặc kép tại đúng vị trí đó — khớp >1 lần (mơ hồ, applyAddressFixes cũng sẽ bỏ qua) thì
// không đoán, coi như không xác định được.
function findLikelyApplyIndex(text,before){
  const wordBoundaryOnly=!/\s/.test(before);
  const exact=findMatchPositions(text,before,wordBoundaryOnly);
  if(exact.length===1)return exact[0];
  if(exact.length===0){
    const re=buildLooseWhitespaceRegex(before);
    if(re){
      const matches=[...text.matchAll(re)];
      if(matches.length===1)return matches[0].index;
    }
  }
  return -1;
}

// Pattern cơ học cho type "grammar_position" (xem pronounAsNounSection): đại từ ngôi thứ 3 đứng sát
// 1 cụm lượng từ/chỉ định kiểu "một/loại/dạng/kẻ/người/hạng ~ như vậy/này/đó/ấy" ở 1 trong 2 thứ tự
// hay gặp khi dịch sát tiếng Trung: "một NÀNG như vậy" (đại từ ở giữa) hoặc "dạng này NÀNG" (đại từ ở
// cuối). Đây chỉ là 1 heuristic (không bắt được mọi biến thể câu chữ có thể có), nhưng đủ để chặn
// trường hợp model tự gắn type:"grammar_position" cho 1 câu KHÔNG hề chứa pattern này — khả năng cao
// là model đang lạm dụng type này để lách qua luật chặt hơn của các type khác (VD đổi hẳn xưng hô
// nhưng dán nhãn ngữ pháp cho có vẻ "an toàn").
const GRAMMAR_POS_RE=/(một|loại|dạng|kẻ|người|hạng)\s*(như vậy|như thế|này|đó|ấy)?\s*(nàng ta|hắn ta|nàng|hắn|y|thị|gã)\s*(như vậy|như thế|này|đó|ấy)?/i;
function matchesGrammarPositionPattern(before){
  if(!before)return false;
  const m=GRAMMAR_POS_RE.exec(before);
  if(!m)return false;
  return !!(m[2]||m[4]); // phải có ít nhất 1 cụm chỉ định thật đi kèm, không chỉ trùng ngẫu nhiên lượng từ+đại từ đứng cạnh nhau vì lý do khác
}


// ===================================================================
// ===== KIỂM TRA CƠ HỌC CẶP NGƯỜI NÓI/NGƯỜI NGHE CHO genre_tone =====
// (Không còn dùng trong Luồng 3 của file này — job genre_tone giờ để AI tự phán đoán, không khai thêm field.)
const AUDIT_TONE_EXTRA_FIELDS=[
  {name:'ngoi',desc:'"1" nếu từ bị sửa là TỰ XƯNG (ngôi 1), "2" nếu là từ GỌI ĐỐI PHƯƠNG (ngôi 2).',example:'1'},
  {name:'sCallsL',desc:'từ người NÓI dùng để gọi người NGHE (anh/em/chị/...), "" nếu không thấy trong văn bản. Chỉ điền khi từ thay vào là từ quan hệ.',example:'anh'},
  {name:'lCallsS',desc:'từ người NGHE dùng để gọi người NÓI trong lời thoại của họ (anh/em/chị/...), "" nếu không thấy. Chỉ điền khi từ thay vào là từ quan hệ.',example:''},
  {name:'evidence',desc:'trích NGUYÊN VĂN 3-12 từ của lời thoại cho thấy cặp xưng hô (sCallsL hoặc lCallsS); "" nếu từ thay vào không phải từ quan hệ.',example:'Anh à, anh lấy cái gì'},
  {name:'evP',desc:'số đoạn [số] chứa "evidence" (cùng đoạn [p] hoặc cách tối đa 3 đoạn); "" nếu không có evidence.',example:'21'}
];
// Từ xưng hô QUAN HỆ: dùng theo CẶP bổ sung giữa người nói và người nghe nên phải kiểm tra cặp.
const ADDR_REL_TERMS=new Set(['anh','em','chị','cô','chú','thúc','bác','dì','thím','mợ','cháu','con','bố','ba','mẹ','má','ông','bà','thầy']);
// ADDR_COMPLEMENT[x] = các từ hợp lệ cho PHÍA BÊN KIA khi 1 bên dùng x (VD 1 bên gọi "anh" thì bên kia tự xưng "em").
const ADDR_COMPLEMENT={
  anh:['em'],chị:['em'],em:['anh','chị'],
  chú:['cháu','con'],thúc:['cháu','con'],bác:['cháu','con'],cô:['cháu','con','em'],dì:['cháu','con'],thím:['cháu','con'],mợ:['cháu','con'],
  ông:['cháu','con'],bà:['cháu','con'],thầy:['em','con'],
  cháu:['ông','bà','chú','thúc','bác','cô','dì','thím','mợ'],
  con:['bố','ba','mẹ','má','ông','bà','thầy'],bố:['con'],ba:['con'],mẹ:['con'],má:['con']
};
// Tự xưng/gọi kiểu cũ CHẮC CHẮN thuộc 1 ngôi — dùng để code tự suy ra "ngoi" từ từ GỐC bị sửa, không phụ thuộc model khai.
const ADDR_OLD_NGOI1=new Set(['ta','lão phu','bổn tọa','bản tọa','tại hạ','tiểu nhân','bổn vương','bản vương','bổn cung','bản cung','lão nạp','bần đạo','tiểu sinh','bổn tiểu thư','bản tiểu thư']);
const ADDR_OLD_NGOI2=new Set(['ngươi','các hạ','nhà ngươi','ngươi ta']);
function addrPairOK(a,b){
  if(!a||!b)return true;
  if(a===b)return false; // 2 người đối thoại không thể dùng cùng 1 từ quan hệ cho nhau
  const ab=ADDR_COMPLEMENT[a],ba=ADDR_COMPLEMENT[b];
  if(!ab&&!ba)return true;
  return !!((ab&&ab.includes(b))||(ba&&ba.includes(a)));
}
function addrNorm(s){return String(s||'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
function addrHasWord(hayNorm,term){
  if(!term)return false;
  return new RegExp('(^| )'+escapeRegExp(term)+'( |$)','u').test(hayNorm);
}
function addrTokens(s){
  return String(s||'').trim().split(/\s+/).filter(Boolean).map(t=>{
    const m=/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(t);
    return {raw:t,pre:m[1],core:m[2],post:m[3]};
  });
}
// Tách phần KHÁC NHAU giữa before/after (cắt phần đầu/cuối giống nhau) -> đúng các từ bị đổi.
function diffToneSegment(before,after){
  const b=addrTokens(before),a=addrTokens(after);
  let pre=0;while(pre<b.length&&pre<a.length&&b[pre].raw===a[pre].raw)pre++;
  let suf=0;while(suf<b.length-pre&&suf<a.length-pre&&b[b.length-1-suf].raw===a[a.length-1-suf].raw)suf++;
  return{a,pre,bSeg:b.slice(pre,b.length-suf),aSeg:a.slice(pre,a.length-suf)};
}
// Lời thoại (đoạn trong ngoặc kép) chứa vị trí idx trong đoạn; không có ngoặc (thoại gạch đầu dòng) thì lấy cả đoạn.
function findUtteranceAt(paraText,idx){
  const re=/[“«][^”»]*[”»]|"[^"]*"/g;let m;
  while((m=re.exec(paraText))){if(idx>=m.index&&idx<m.index+m[0].length)return m[0].replace(/^[“«"]|[”»"]$/g,'');}
  return paraText;
}
// Gọi-đối-phương ở ĐẦU lời thoại ("Anh à, ...", "Em ơi! ...") — chắc chắn là ngôi 2, người nói KHÔNG được tự xưng trùng từ này.
function findLeadingVocative(utt){
  const m=/^\s*([\p{L}]+)\s*(?:à|ơi|nhé|nè|này|ạ|hả)?\s*[,!?…]/u.exec(utt);
  if(!m)return '';
  const w=m[1].toLowerCase();
  return ADDR_REL_TERMS.has(w)?w:'';
}
function verifyAddrEvidence(paras,p,fx){
  const ev=addrNorm(fx.evidence),evP=parseInt(fx.evP,10);
  if(!ev||ev.split(' ').length<2||!Number.isInteger(evP)||Math.abs(evP-p)>3)return '';
  const para=paras.find(x=>x.n===evP);
  return(para&&addrNorm(para.text).includes(ev))?ev:'';
}
// Trả {ok:true,after?} hoặc {ok:false,why}. after (nếu có) = bản đã CHỈNH LẠI cho đúng cặp xưng hô.
function checkToneFixPairing(text,fx){
  const seg=diffToneSegment(fx.before,fx.after);
  const bCores=seg.bSeg.map(t=>t.core.toLowerCase());
  const newRel=[];
  seg.aSeg.forEach((t,i)=>{const c=t.core.toLowerCase();if(ADDR_REL_TERMS.has(c)&&!bCores.includes(c))newRel.push(i);});
  if(!newRel.length)return{ok:true}; // từ thay vào không phải từ quan hệ (tôi/ngươi/...) — không có cặp để kiểm
  if(newRel.length>1)return{ok:false,why:'1 fix gộp nhiều từ xưng hô quan hệ — không kiểm được cặp người nói/người nghe (cần tách từng từ)'};
  const ti=newRel[0],to=seg.aSeg[ti].core.toLowerCase();
  const paras=buildAuditParagraphs(text);
  const p=fx.p,para=Number.isInteger(p)?paras.find(x=>x.n===p):null;
  if(!para)return{ok:false,why:`thiếu/sai số đoạn "p" nên không đối chiếu được cặp xưng hô cho từ "${to}"`};
  // ngôi: ưu tiên SUY RA từ từ gốc bị sửa (tự xưng/gọi kiểu cũ chắc chắn), chỉ dùng "ngoi" model khai khi không suy ra được.
  let ngoi=0;
  const fromCore=seg.bSeg.map(t=>t.core.toLowerCase()).join(' ');
  if(ADDR_OLD_NGOI1.has(fromCore))ngoi=1;else if(ADDR_OLD_NGOI2.has(fromCore))ngoi=2;
  if(!ngoi){const g=parseInt(fx.ngoi,10);if(g===1||g===2)ngoi=g;}
  if(!ngoi)return{ok:false,why:`không xác định được "${fromCore}" là ngôi 1 hay ngôi 2 (model không khai "ngoi") nên không kiểm được cặp cho từ "${to}"`};
  // bằng chứng cặp xưng hô
  const evOK=verifyAddrEvidence(paras,p,fx);
  const hay=addrNorm(para.text)+(evOK?' '+evOK:'');
  const claim=v=>{const t=addrNorm(v);return(ADDR_REL_TERMS.has(t)&&addrHasWord(hay,t))?t:'';};
  let sCallsL=claim(fx.sCallsL),lCallsS=claim(fx.lCallsS);
  // Gọi-đối-phương ở đầu CHÍNH lời thoại này: bằng chứng cơ học, mạnh hơn mọi khai báo của model.
  if(ngoi===1){
    const idx=findLikelyApplyIndex(para.text,fx.before.trim());
    const voc=idx>=0?findLeadingVocative(findUtteranceAt(para.text,idx)):findLeadingVocative(para.text);
    if(voc)sCallsL=voc;
  }
  let want=null;
  if(ngoi===1){
    if(!sCallsL&&!lCallsS)return{ok:false,why:`từ quan hệ \"${to}\" (tự xưng) không có bằng chứng về cặp người nói/người nghe (evidence không khớp văn bản hoặc không khai)`};
    // ĐỐI ỨNG, KHÔNG ÉP GIỐNG: tự xưng chỉ bị coi là SAI khi (a) trùng/không hợp cặp với từ người nói dùng gọi đối phương,
    // hoặc (b) trùng đúng từ người kia dùng để tự xưng (VD người kia gọi mình là "anh" => người kia tự xưng "em", nên mình không thể "em").
    // Tự xưng bằng từ KHÁC hợp lý (chú/tôi/...) vẫn được giữ; "tự xưng đúng như người kia gọi mình" chỉ là 1 lựa chọn phổ biến.
    const lSelf=lCallsS?(ADDR_COMPLEMENT[lCallsS]||[]):[];
    const invalid=t=>!!((sCallsL&&!addrPairOK(t,sCallsL))||(lCallsS&&lSelf.includes(t)));
    if(invalid(to)){
      const cands=[];
      if(lCallsS&&ADDR_REL_TERMS.has(lCallsS)&&!invalid(lCallsS))cands.push(lCallsS);
      (sCallsL&&ADDR_COMPLEMENT[sCallsL]||[]).forEach(c=>{if(!invalid(c)&&!cands.includes(c))cands.push(c);});
      if(cands.length===1)want=cands[0];
      else return{ok:false,why:`tự xưng \"${to}\" không đối ứng với cặp người nói/người nghe (người nói gọi đối phương: \"${sCallsL||'?'}\", người nghe gọi lại: \"${lCallsS||'?'}\") và không chọn được 1 từ thay thế duy nhất`};
    }
  }else{
    if(!lCallsS)return{ok:false,why:`từ quan hệ "${to}" (gọi đối phương) không có bằng chứng người nghe gọi người nói là gì nên không kiểm được cặp`};
    if(!addrPairOK(to,lCallsS))return{ok:false,why:`từ gọi đối phương "${to}" không hợp cặp với cách người kia gọi lại ("${lCallsS}")`};
  }
  if(want&&want!==to){
    const tok=seg.aSeg[ti];
    let w=want;if(tok.core&&tok.core[0]!==tok.core[0].toLowerCase())w=w[0].toUpperCase()+w.slice(1);
    const a=seg.a.slice();
    a[seg.pre+ti]={...tok,core:w,raw:tok.pre+w+tok.post};
    return{ok:true,after:a.map(t=>t.raw).join(' '),note:`chỉnh lại "${to}" -> "${want}" cho đúng cặp người nói/người nghe`};
  }
  return{ok:true};
}

// ===== CỔNG CHẶN "SỬA THỪA" CHO genre_tone =====
// Lỗi thực tế: truyện đô thị nhưng fix "cháu" -> "em" (giáo sư cao niên nói với thanh niên) và "tôi" -> "anh" vẫn được áp dụng
// vì checkToneFixPairing chỉ kiểm tra cặp có BỔ SUNG nhau không (anh↔em hợp lệ), không biết từ gốc đã đúng hệ rồi.
// Cổng này: khi hệ chuẩn là đô thị/phương Tây và CẢ từ bị đổi lẫn từ thay vào đều đã thuộc hệ đó thì đây không phải lỗi sai hệ
// -> loại fix. Ngoại lệ (vẫn cho đi tiếp, để checkToneFixPairing quyết): (a) trong cụm "before" còn từ thuộc hệ cổ trang
// (lẫn hệ thật sự); (b) sửa lỗi TRÙNG TỪ giữa 2 người đối thoại ("Anh à, anh..." — người nói tự xưng trùng từ gọi đối phương).
const ADDR_MODERN_VALID=new Set(['tôi','cậu','bạn','mình','tớ','ngài',...ADDR_REL_TERMS]);
const ADDR_OLD_SYSTEM_MARKERS=['ngươi','huynh','tỷ','đệ','muội','tại hạ','các hạ','lão phu','bổn tọa','bản tọa','đạo hữu','ca ca','tiểu nhân','lão nạp','bần đạo','tiểu sinh','nhà ngươi','bổn vương','bản vương','bổn cung','bản cung'];
// "ta" đứng riêng mới là tự xưng cổ trang; "chúng ta/anh ta/ông ta/hắn ta..." là đại từ thường dùng trong đô thị.
const ADDR_TA_SUFFIX_PREV=new Set(['chúng','ông','bà','anh','chị','cô','cậu','hắn','y','gã','lão','chú','bác','nó','họ','người','nàng','ả','thị','dì','em','cháu','mình']);
function hasOldSystemMarker(text){
  const n=addrNorm(text);
  if(ADDR_OLD_SYSTEM_MARKERS.some(m=>addrHasWord(n,m)))return true;
  const t=n.split(' ');
  return t.some((w,i)=>w==='ta'&&(i===0||!ADDR_TA_SUFFIX_PREV.has(t[i-1])));
}
// Trả về chuỗi lý do (nếu fix bị chặn) hoặc null (cho đi tiếp).
function isRedundantSwapWithinSystem(text,fx,genreSystem){
  if(genreSystem!=='hien_dai'&&genreSystem!=='tay_au')return null;
  const seg=diffToneSegment(fx.before,fx.after);
  const bT=seg.bSeg.map(t=>addrNorm(t.core)).filter(Boolean);
  const aT=seg.aSeg.map(t=>addrNorm(t.core)).filter(Boolean);
  if(!bT.length||!aT.length)return null;
  if(!bT.every(t=>ADDR_MODERN_VALID.has(t))||!aT.every(t=>ADDR_MODERN_VALID.has(t)))return null;
  if(hasOldSystemMarker(fx.before))return null;
  const old=bT.length===1?bT[0]:'';
  if(old&&ADDR_REL_TERMS.has(old)){
    const paras=buildAuditParagraphs(text);
    const para=Number.isInteger(fx.p)?paras.find(x=>x.n===fx.p):null;
    if(para){
      // (b1) gọi-đối-phương ở đầu CHÍNH lời thoại trùng từ đang bị đổi -> đúng là lỗi trùng từ.
      const idx=findLikelyApplyIndex(para.text,(fx.before||'').trim());
      const voc=idx>=0?findLeadingVocative(findUtteranceAt(para.text,idx)):findLeadingVocative(para.text);
      if(voc===old)return null;
      // (b2) model khai cặp trùng từ VÀ trích được bằng chứng khớp văn bản.
      const claimed=[fx.sCallsL,fx.lCallsS].map(addrNorm);
      if(claimed.includes(old)&&verifyAddrEvidence(paras,fx.p,fx))return null;
    }
  }
  return `\"${bT.join(' ')}\" -> \"${aT.join(' ')}\": từ gốc và từ thay đều đã thuộc hệ xưng hô chuẩn (${genreSystem==='tay_au'?'phương Tây':'đô thị'}), không có trùng từ/trộn hệ — không phải lỗi sai hệ, giữ nguyên bản dịch chính`;
}

// ===== CỔNG CHẶN CHO CỔ TRANG: ĐỪNG PHÁ CẶP CHÚ/THÚC–CHÁU THẬT =====
// Lỗi thực tế: truyện tu tiên có cặp chú-cháu ruột ("Trần thúc" / "Tiểu Đạo cháu") nhưng genre_tone sửa "cháu"->"ta/ngươi" và
// "thúc"->"huynh", ra cuộc thoại lộn xộn. isRedundantSwapWithinSystem chỉ chạy với đô thị/phương Tây, còn checkToneFixPairing
// chỉ kiểm khi từ thay vào là từ quan hệ (ngươi/ta/huynh thì cho qua). Cổng này: hệ cổ trang + fix đổi MỘT TỪ QUAN HỆ chú/thúc/bác/
// cháu... sang từ không quan hệ, mà trong ±3 đoạn có CẢ từ vai trên (thúc/chú/bác...) LẪN "cháu" => coi là quan hệ thật, loại fix.
// Chỉ giữ từ gần như CHỈ dùng cho quan hệ họ hàng. Cố ý bỏ bá (bá đạo/bá chủ), thẩm (họ Thẩm), cô (cô độc/cô ta), dì.
const KIN_ELDER_WORDS=['thúc','thím','chú','bác'];
const KIN_ALL_WORDS=new Set([...KIN_ELDER_WORDS,'cháu','mợ']);
function isKinPairRewrite(text,fx,genreSystem){
  if(genreSystem!=='co_trang'||!fx||fx.type!=='genre_tone'||!Number.isInteger(fx.p))return null;
  const seg=diffToneSegment(fx.before,fx.after);
  const bT=seg.bSeg.map(t=>addrNorm(t.core)).filter(Boolean);
  const aT=seg.aSeg.map(t=>addrNorm(t.core)).filter(Boolean);
  if(!bT.some(t=>KIN_ALL_WORDS.has(t))||aT.some(t=>KIN_ALL_WORDS.has(t)))return null;
  const near=buildAuditParagraphs(text).filter(x=>Math.abs(x.n-fx.p)<=3).map(x=>addrNorm(x.text)).join(' ');
  const hasElder=KIN_ELDER_WORDS.some(w=>addrHasWord(near,w));
  const hasNephew=addrHasWord(near,'cháu');
  return(hasElder&&hasNephew)?'có cặp chú/thúc–cháu thật trong ±3 đoạn, không phải xưng hô sai hệ — giữ nguyên':null;
}

// ===== CỔNG VAI VẾ (CỔ TRANG): SỬA PHẢI CÙNG BẬC, KHÔNG ĐƯỢC HẠ/NÂNG BẬC =====
// Lỗi thực tế: "Trần thúc, các chú sao cũng ở đây?" -> "các huynh". Sửa sắc thái đúng (chú là từ hiện đại) nhưng
// "chú" (hàng cha chú, vai TRÊN) bị đổi thành "huynh" (hàng anh, ngang vai) => người nói đang gọi bậc trưởng bối
// (cùng vế với "Trần thúc" ngay trước) bỗng gọi như đồng bối. Prompt chỉ dặn "cùng NGÔI" chứ không dặn cùng BẬC.
// Quy tắc: từ gốc thuộc bậc nào thì từ thay phải CÙNG BẬC. Với chú/bác/thím/dì có từ Hán-Việt tương đương cùng bậc
// thì code TỰ CHỈNH lại (chú->thúc, bác->bá, thím->thẩm, dì->di); không có tương đương chắc chắn thì loại fix.
const ADDR_RANK={
  // +2: hàng cha chú / trưởng bối
  'chú':2,'thúc':2,'bác':2,'bá':2,'thím':2,'thẩm':2,'dì':2,'di':2,'cô':2,'ông':2,'bà':2,'tiền bối':2,'lão tiền bối':2,
  // +1: hàng anh chị (ngang vai, hơn tuổi/hơn bậc)
  'huynh':1,'tỷ':1,'anh':1,'chị':1,'sư huynh':1,'sư tỷ':1,'ca ca':1,'đại ca':1,
  // -1: hàng em
  'đệ':-1,'muội':-1,'em':-1,'sư đệ':-1,'sư muội':-1,
  // -2: hàng con cháu / vãn bối
  'cháu':-2,'vãn bối':-2,'hậu bối':-2,'con':-2
};
// Từ gốc hiện đại -> từ Hán-Việt CÙNG BẬC dùng trong cổ trang/tu tiên.
const ADDR_SAME_RANK_MAP={'chú':'thúc','bác':'bá','thím':'thẩm','dì':'di','chị':'tỷ','anh':'huynh','em':'đệ'};
// Chọn "đệ" hay "muội" cho "em" cần biết giới tính => KHÔNG tự chỉnh (loại fix). Giữ map trên chỉ cho các từ không phụ thuộc giới tính.
const ADDR_SAME_RANK_AUTO=new Set(['chú','bác','thím','dì','chị','anh']);
// Trả {ok:true,after?} hoặc {ok:false,why}.
function checkToneFixSeniority(fx,genreSystem){
  if(genreSystem!=='co_trang'||!fx||fx.type!=='genre_tone'||!fx.before||typeof fx.after!=='string')return{ok:true};
  const seg=diffToneSegment(fx.before,fx.after);
  if(seg.bSeg.length!==1||seg.aSeg.length!==1)return{ok:true}; // chỉ xử lý đổi đúng 1 từ -> 1 từ (an toàn)
  const bw=addrNorm(seg.bSeg[0].core),aw=addrNorm(seg.aSeg[0].core);
  const br=ADDR_RANK[bw],ar=ADDR_RANK[aw];
  if(br===undefined||ar===undefined||br===ar)return{ok:true}; // cùng bậc hoặc không thuộc bảng bậc -> không can thiệp
  // Chỉ chặn khi ĐỔI BẬC: elder->ngang/em (hạ bậc) hoặc ngược lại. Các từ chung chung (ngươi/ta/tôi...) không nằm trong bảng nên vẫn qua.
  if(ADDR_SAME_RANK_AUTO.has(bw)&&ADDR_SAME_RANK_MAP[bw]&&ADDR_RANK[ADDR_SAME_RANK_MAP[bw]]===br){
    const w0=ADDR_SAME_RANK_MAP[bw];
    const tok=seg.aSeg[0];
    const w=(tok.core&&tok.core[0]!==tok.core[0].toLowerCase())?w0[0].toUpperCase()+w0.slice(1):w0;
    const a=seg.a.slice();
    a[seg.pre]={...tok,core:w,raw:tok.pre+w+tok.post};
    return{ok:true,after:a.map(t=>t.raw).join(' '),note:`đổi bậc vai vế "${bw}"(${br}) -> "${aw}"(${ar}); chỉnh lại thành "${w0}" cùng bậc`};
  }
  return{ok:false,why:`đổi vai vế: "${bw}" (bậc ${br}) -> "${aw}" (bậc ${ar}) — từ thay phải CÙNG BẬC với từ gốc, không có từ cùng bậc chắc chắn để tự chỉnh`};
}

// ===== GOM FIX THEO CUỘC THOẠI =====
// Sửa từng dòng rời dễ ra "sửa dở một nửa" (1 vế bị đổi, vế đối ứng bị loại/không khớp). Gom các fix genre_tone có "p" cách nhau
// <=3 đoạn thành 1 cuộc thoại; nếu có fix trong nhóm bị loại vì lý do liên quan CẶP xưng hô (cổng chú-cháu, sai cặp) thì loại luôn cả nhóm.
// Cố ý KHÔNG tính fix "không định vị được before" (AI hay trích lệch, không chứng tỏ gì về các fix lân cận) và fix bị loại vì lý do
// khác (VD sửa thừa đô thị), để khỏi kéo theo fix đúng ở gần.
const DIALOGUE_GROUP_GAP=3;
const DIALOGUE_GROUP_TRIGGER=/^genre_tone (sai cặp|sửa thừa \(cặp chú-cháu\))/;
function dropIncompleteDialogueGroups(text,kept,dropped){
  const tone=kept.filter(fx=>fx.type==='genre_tone'&&Number.isInteger(fx.p));
  const bad=dropped.map(d=>d.fx).filter((fx,i)=>fx&&fx.type==='genre_tone'&&Number.isInteger(fx.p)&&DIALOGUE_GROUP_TRIGGER.test(dropped[i].why||''));
  if(!bad.length)return kept;
  const nodes=[...tone.map(fx=>({fx,kept:true,bad:false})),...bad.map(fx=>({fx,kept:false,bad:true}))].sort((a,b)=>a.fx.p-b.fx.p);
  const groups=[];
  nodes.forEach(n=>{
    const g=groups[groups.length-1];
    if(g&&n.fx.p-g[g.length-1].fx.p<=DIALOGUE_GROUP_GAP)g.push(n);else groups.push([n]);
  });
  const drop=new Set();
  groups.forEach(g=>{
    if(!g.some(n=>n.bad))return;
    g.forEach(n=>{if(n.kept&&!n.bad)drop.add(n.fx);});
  });
  drop.forEach(fx=>dropped.push({fx,why:'genre_tone cùng cuộc thoại (±'+DIALOGUE_GROUP_GAP+' đoạn) với 1 fix bị loại vì cặp xưng hô — bỏ cả nhóm để không sửa dở một nửa'}));
  return kept.filter(fx=>!drop.has(fx));
}

// Chặn sửa TÊN RIÊNG: (1) chinh_ta sửa 1 từ CHỮ HOA giữa câu (VD "Trần Đại" -> "Trần Đạo": 2 người khác nhau, không phải lỗi gõ);
// (2) genre_tone đưa vào "after" 1 từ chữ hoa (không đứng đầu cụm) mà "before" không có (VD "Trần tiểu ca" -> "Trần Đạo").
function auditParaText(text,p){
  if(!Number.isInteger(p))return null;
  let n=0;const lines=String(text||'').split('\n');
  for(const ln of lines){if(ln.trim()&&++n===p)return ln;}
  return null;
}
function isNameSpellingFix(text,fx){
  const before=(fx.before||'').trim(),after=(fx.after||'').trim();
  const bw=before.split(/\s+/),aw=after.split(/\s+/);
  if(bw.length!==aw.length)return false;
  const para=auditParaText(text,fx.p);if(para===null)return false;
  const base=para.indexOf(before);if(base<0)return false;
  let off=base;
  for(let i=0;i<bw.length;i++){
    const st=para.indexOf(bw[i],off);if(st<0)return false;
    if(bw[i]!==aw[i]&&/^\p{Lu}/u.test(bw[i])){
      const prev=para.slice(0,st).replace(/\s+$/,'').slice(-1);
      if(prev&&!/[.!?…“"«「]/.test(prev))return true;
    }
    off=st+bw[i].length;
  }
  return false;
}
function introducesProperName(before,after){
  const bset=new Set(String(before||'').split(/\s+/).filter(Boolean));
  const aw=String(after||'').split(/\s+/).filter(Boolean);
  for(let i=1;i<aw.length;i++){
    const w=aw[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu,'');
    // Chữ hoa vì đứng đầu câu thoại (ngay sau dấu mở ngoặc) hoặc sau dấu kết câu là viết hoa đầu câu, KHÔNG phải tên riêng.
    if(/^[“"«「‘'(]/.test(aw[i])||/[.!?…]$/.test(aw[i-1]))continue;
    if(/^\p{Lu}/u.test(w)&&!bset.has(aw[i]))return true;
  }
  return false;
}

// LƯỚI AN TOÀN CHÍNH — chạy TRƯỚC applyAddressFixes, lọc theo "type" AI tự gắn cho từng fix bằng
// đúng 3 kiểm tra cơ học ở trên. Không đụng gì tới quy tắc so khớp "before" (đó vẫn do
// applyAddressFixes lo, xem đoạn count===1) — hàm này chỉ loại các fix mà chính "type" đã tự mâu
// thuẫn với bằng chứng đo được, trước khi tốn công so khớp/thay thế.
function validateAuditFixes(text,fixes){
  const kept=[],dropped=[];
  (fixes||[]).forEach(fx=>{
    const type=fx&&fx.type;
    const before=(fx&&fx.before||'').trim();
    const after=fx&&typeof fx.after==='string'?fx.after.trim():'';
    if(!before){dropped.push({fx,why:'thiếu "before"'});return;}
    // "type" là field BẮT BUỘC (xem buildAuditReadPrompt) — model tự bịa giá trị lạ hoặc bỏ trống
    // đều là dấu hiệu không tuân đúng schema, KHÔNG được lọt qua.
    if(!type||!AUDIT_FIX_TYPES.includes(type)){
      dropped.push({fx,why:`"type" thiếu hoặc không hợp lệ ("${type}") — không thuộc danh sách cho phép (genre_tone/chinh_ta/sot_dich)`});
      return;
    }
    // genre_tone: tự đối chiếu NỘI BỘ trong chính chương, không tra cứu characterName/gender đã lưu.
    if(type==='genre_tone'&&introducesProperName(before,after)){
      dropped.push({fx,why:'genre_tone: "after" đưa vào chữ hoa giữa cụm (nghi thay xưng hô bằng tên riêng) — không đổi tên/danh xưng đi kèm tên'});
      return;
    }
    if(type==='chinh_ta'&&isNameSpellingFix(text,fx)){
      dropped.push({fx,why:'type="chinh_ta" nhưng từ bị sửa là chữ hoa giữa câu (nghi tên riêng/tên nhân vật) — không sửa tên riêng'});
      return;
    }
    if(type==='chinh_ta'){
      // Chỉ chấp nhận fix ĐÚNG LÀ lỗi gõ nhỏ (số từ khác nhau ít, mỗi từ khác chỉ lệch vài ký tự) —
      // chặn model lợi dụng "chinh_ta" để viết lại cả câu dưới danh nghĩa sửa lỗi gõ.
      if(!isSpellingOnlyFix(before,after)){
        // LỐI THOÁT CÓ ĐIỀU KIỆN: 1 từ tiếng Anh lẫn nguyên vào câu tiếng Việt (VD "with" thay vì
        // "với") vẫn có thể bị model gắn nhầm type="chinh_ta" (nhìn bề ngoài giống lỗi gõ 1 từ),
        // trong khi Levenshtein per-word giữa 1 từ Latin thuần và 1 từ tiếng Việt có dấu tự nhiên
        // đã cao (VD lev("with","với")=4), khiến isSpellingOnlyFix loại oan. Dùng lại ĐÚNG kiểm tra
        // cơ học của type "sot_dich" (before chứa hư từ tiếng Anh thật — xem looksLikeRealEnglishSentence)
        // làm lối thoát ở đây: vẫn là bằng chứng đo được trên chuỗi ký tự, không tin AI tự khai,
        // chỉ đổi CĂN CỨ chấp nhận cho đúng bản chất lỗi (từ tiếng Anh sót lại) thay vì đòi hỏi
        // edit-distance thấp vốn chỉ đúng cho lỗi gõ tiếng Việt thuần.
        // Tương tự lối thoát tiếng Anh ở trên: model cũng có thể gắn nhầm type="chinh_ta" cho 1 chữ
        // Hán còn sót (đáng lẽ phải là "sot_dich") — before/after khác nhau nhiều vì đó là bản dịch
        // của 1 chữ Hán, không phải lỗi gõ. containsCJK là bằng chứng đo được trên chuỗi ký tự (before
        // còn chữ Hán thật), nên cũng được chấp nhận làm căn cứ giữ lại fix ở đây.
        if(!looksLikeRealEnglishSentence(before)&&!containsCJK(before)){
          dropped.push({fx,why:'type="chinh_ta" nhưng before/after khác nhau quá nhiều để là lỗi gõ thật (nghi model đang viết lại câu)'});
          return;
        }
      }
      // Từ CÓ dấu bị sửa thành từ KHÔNG dấu mà không phải âm tiết hợp lệ ("suýt"->"suyt"): findSuspectSyllables bỏ qua từ
      // không dấu nên 7.4 bên dưới không thấy. Chỉ xét cặp từ cùng vị trí (cùng số từ), không xét từ Latin thuần.
      {
        const _wb=before.split(/\s+/),_wa=after.split(/\s+/);
        if(_wb.length===_wa.length){
          const _bad=[];
          for(let i=0;i<_wb.length;i++){
            const b=_wb[i].replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu,''),a=_wa[i].replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu,'');
            if(!a||a===b||containsCJK(a)||!vnHasMarks(b)||vnHasMarks(a))continue;
            const why=vnSyllableProblem(a);
            if(why)_bad.push(a+': '+why);
          }
          if(_bad.length){
            dropped.push({fx,why:'chinh_ta: sửa từ có dấu thành từ không dấu không hợp lệ ('+_bad.join('; ')+')'});
            return;
          }
        }
      }
      // [Mục 7.4] Từ mới KHÔNG được là âm tiết không thể tồn tại (vd "vẽch"→"vếch" thì ổn về cấu trúc, nhưng "vạcl" thì loại).
      const _newBad=newInvalidSyllables(before,after);
      if(_newBad.length){
        dropped.push({fx,why:'chinh_ta: "after" chứa âm tiết không hợp lệ ('+_newBad.map(x=>x.word+': '+x.why).join('; ')+') — fix tự đẻ thêm token hỏng'});
        return;
      }
      // Fix do máy quét âm tiết đề xuất (fx._syl) phải THỰC SỰ làm giảm số âm tiết hỏng, không thì chưa sửa được gì.
      if(fx._syl&&findSuspectSyllables(after).length>=findSuspectSyllables(before).length){
        dropped.push({fx,why:'chinh_ta: máy quét âm tiết báo lỗi nhưng "after" vẫn còn âm tiết hỏng (model chưa sửa được)'});
        return;
      }
      // [Mục 7.3] reason vô nghĩa ("'ch' thay vì 'ch'"): không tin reason, nhưng fix qua được kiểm tra âm tiết thì vẫn dùng — chỉ cảnh báo + đánh cờ xem lại.
      if(isNonsenseFixReason(fx.reason)){
        console.log('[Luồng 3][Chính tả][Nghi ngờ] reason vô nghĩa ("'+String(fx.reason).slice(0,60)+'") — từ mới qua kiểm tra âm tiết nên vẫn dùng, cần xem lại tay: "'+before.slice(0,50)+'" -> "'+after.slice(0,50)+'"');
        auditReviewPush({why:'reason vô nghĩa',before,after});
      }
    }
    if(type==='sot_dich'){
      // Fix do CODE quét sẵn (fx._cand: "before" là nguyên văn candidate, không phải AI tự chép) — không cần
      // đoán "before" có phải tên riêng nữa (AI đã được dặn bỏ qua tên riêng); chỉ kiểm tra bản dịch trả về.
      if(fx._cand){
        if(!after){dropped.push({fx,why:'sot_dich: "after" rỗng'});return;}
        const cjkCount=str=>(str.match(/[\u3400-\u9fff]/g)||[]).length;
        if(fx._kind==='cjk'&&cjkCount(after)>=cjkCount(before)){
          dropped.push({fx,why:'sot_dich: bản dịch trả về không giảm được chữ Hán còn sót (model chưa dịch)'});
          return;
        }
        kept.push(fx);return;
      }
      // Chỉ chấp nhận khi "before" THỰC SỰ chứa chữ Hán, hoặc chứa hư từ tiếng Anh chứng tỏ đây là 1
      // câu/cụm có ý nghĩa cần dịch — không phải chỉ 1 tên riêng tiếng Anh bị model nhầm là "sót dịch".
      if(!containsCJK(before)&&!looksLikeRealEnglishSentence(before)){
        dropped.push({fx,why:'type="sot_dich" nhưng "before" không chứa chữ Hán lẫn hư từ tiếng Anh nào — nghi chỉ là 1 tên riêng bị nhầm thành text sót dịch'});
        return;
      }
    }
    kept.push(fx);
  });
  return {kept,dropped};
}

// Dùng cho type "chinh_ta" (xem chinhTaSection/validateAuditFixes): giới hạn chặt để field này không
// biến thành cửa sau cho AI viết lại nguyên câu dưới danh nghĩa "sửa lỗi gõ". Quy tắc: số từ khác
// nhau giữa before/after phải ít (mặc định tối đa 2 từ), và MỖI từ khác nhau phải là lỗi gõ nhỏ thật
// sự (Levenshtein <=2), không phải 1 từ hoàn toàn khác nghĩa.
function levenshtein(a,b){
  a=a||'';b=b||'';
  const m=a.length,n=b.length;
  if(!m)return n; if(!n)return m;
  const dp=new Array(n+1);
  for(let j=0;j<=n;j++)dp[j]=j;
  for(let i=1;i<=m;i++){
    let prev=dp[0];dp[0]=i;
    for(let j=1;j<=n;j++){
      const tmp=dp[j];
      dp[j]=a[i-1]===b[j-1]?prev:1+Math.min(prev,dp[j],dp[j-1]);
      prev=tmp;
    }
  }
  return dp[n];
}
function isSpellingOnlyFix(before,after,maxChangedWords,maxEditDistancePerWord){
  maxChangedWords=maxChangedWords||2;
  maxEditDistancePerWord=maxEditDistancePerWord||2;
  let wb=(before||'').trim().split(/\s+/);
  let wa=(after||'').trim().split(/\s+/);
  // Lỗi gõ dính/tách chữ ("thoángộ" -> "thoáng lộ", "tr ang" -> "trang"): lệch ĐÚNG 1 từ thì thử gộp 2 từ liền nhau
  // ở bên dài hơn, rồi so như bình thường với bên kia. Phần gộp phải gần như trùng từ bên kia (lev<=1) — không mở cửa
  // cho thêm/bớt từ tuỳ ý ("Đã người"->"Đã có người" vẫn bị loại vì "Đãcó" vs "Đã" lệch 2).
  // Thiếu đúng 1 chữ ("Đã người" -> "Đã có người"): after = before + 1 từ chèn, phần còn lại giữ nguyên. (Trước đây trường
  // hợp này chỉ lọt vì ENGLISH_FUNCTION_WORD_RE dùng \\b ASCII nên khớp nhầm chữ "i" trong "người"; giờ cho phép đúng luật.)
  if(wa.length===wb.length+1){
    for(let i=0;i<wa.length;i++){
      if(wa.slice(0,i).concat(wa.slice(i+1)).join(' ')===wb.join(' '))return true;
    }
  }
  if(Math.abs(wb.length-wa.length)===1){
    const bLonger=wb.length>wa.length;
    const longer=bLonger?wb:wa,shorter=bLonger?wa:wb;
    let found=null;
    for(let i=0;i<longer.length-1;i++){
      const mergedTok=longer[i]+longer[i+1];
      if(levenshtein(mergedTok,shorter[i])>1)continue;
      const merged=longer.slice(0,i).concat([mergedTok],longer.slice(i+2));
      if(merged.length!==shorter.length)continue;
      let rest=true;
      for(let k=0;k<merged.length;k++){if(k!==i&&merged[k]!==shorter[k]){rest=false;break;}}
      if(rest){found=merged;break;}
    }
    if(!found)return false;
    if(bLonger)wb=found;else wa=found;
    if(wb.join(' ')===wa.join(' '))return true; // chỉ sai khoảng trắng giữa 2 mảnh ("tr ang" -> "trang")
  }
  if(wb.length!==wa.length)return false; // chính tả thật không đổi số lượng từ trong câu
  let changed=0;
  for(let i=0;i<wb.length;i++){
    if(wb[i]===wa[i])continue;
    changed++;
    if(changed>maxChangedWords)return false;
    if(levenshtein(wb[i],wa[i])>maxEditDistancePerWord)return false;
  }
  return changed>0;
}
// Dùng cho type "sot_dich" (xem sotDichSection/validateAuditFixes): kiểm tra cơ học để phân biệt
// "còn sót thật" (cần sửa) với "chỉ là 1 tên riêng tiếng Anh cố tình giữ nguyên" (KHÔNG được sửa —
// đúng yêu cầu gốc "không bao gồm tên tiếng Anh"). Không thể phân biệt tuyệt đối bằng code thuần,
// nhưng dùng 1 tín hiệu khá đáng tin: 1 CÂU/CỤM tiếng Anh THẬT (có ý cần dịch) hầu như luôn chứa ít
// nhất 1 hư từ/từ chức năng tiếng Anh phổ biến (mạo từ, đại từ, giới từ, động từ nối...) — còn 1 TÊN
// RIÊNG (người/địa danh/tên skill-vật phẩm giữ nguyên chủ ý) thường chỉ là 1-2-3 từ viết hoa đứng
// liền nhau, không có hư từ nào xen giữa. VD "John Smith" -> không khớp hư từ nào -> coi là tên riêng,
// bỏ qua; "He is my brother" -> khớp "he/is/my" -> chắc chắn là câu thật, không phải tên riêng.
const ENGLISH_FUNCTION_WORD_RE=/\b(the|a|an|is|are|was|were|am|be|been|being|and|but|or|not|no|this|that|these|those|with|from|have|has|had|will|would|can|could|should|shall|must|may|might|you|your|yours|he|him|his|she|her|hers|they|them|their|we|us|our|it|its|i|me|my|mine|to|of|in|on|at|for|as|by|what|who|whom|when|where|why|how|do|does|did|so|if|then|than|too|very|just|please|thank|thanks|sorry|okay|ok|yes|damn|hell|god|shit|fuck)\b/i;
function looksLikeRealEnglishSentence(s){
  return ENGLISH_FUNCTION_WORD_RE.test(s||'');
}

// ===================================================================
// ===== LUỒNG 3 — SOÁT CHẤT LƯỢNG BẢN DỊCH: THIẾT KẾ "2 LÀN SONG SONG" =====
// ===================================================================
// VÌ SAO THIẾT KẾ LẠI: bản cũ dồn 4 loại lỗi + hàng chục quy tắc vào 1 prompt khổng lồ rồi bắt 1 model
// lite đọc CẢ chương dài -> model quá tải, lướt qua nhiều lỗi ("cá lọt lưới"); thêm nữa model phải chép
// lại "before" đúng từng chữ rồi code còn đòi "before" khớp DUY NHẤT 1 lần trong cả chương nên nhiều fix
// đúng vẫn bị bỏ oan. Bản mới:
//  1) MỖI PROMPT CHỈ LÀM 1 VIỆC (ngắn, tập trung) — không còn tình trạng làm nhiều tác vụ 1 lúc.
//  2) Bản dịch được ĐÁNH SỐ TỪNG ĐOẠN "[n] ..." -> model phải rà lần lượt từng đoạn (khó lướt qua hơn)
//     và trả về "p" (số đoạn) nên code chỉ cần "before" duy nhất TRONG ĐOẠN ĐÓ (xem applyAuditFixes).
//  3) "Sót dịch" KHÔNG bắt AI tự tìm nữa: code quét cơ học chữ Hán + cụm tiếng Anh, AI chỉ DỊCH các câu
//     đã được chỉ sẵn (trả về id + bản dịch, KHÔNG phải chép lại nguyên văn -> hết lỗi chép sai).
//  4) CHIA VIỆC CHO 2 MODEL CHẠY SONG SONG (2 "làn", mỗi làn chạy tuần tự để đỡ dồn quota):
//       LÀN NẶNG  — CHAR_MODEL_B (3.5 flash lite, mạnh hơn): việc cần SUY LUẬN NGỮ CẢNH
//                   ① xưng hô lời thoại (genre_tone)
//                   (Job "đại từ ngôi 3 lẫn tông" — narration_pronoun — và job "giới tính đại từ ngôi 3"
//                   — gender_pronoun — đã BỎ cả 2: để AI tự làm đúng từ bước dịch chính, xem AUDIT_FIX_TYPES)
//       LÀN NHẸ   — nay cũng CHAR_MODEL_B (dự phòng A): việc CƠ HỌC/ĐÃ ĐƯỢC CHỈ SẴN (sót dịch, âm tiết nghi lỗi, chính tả — chính tả đọc tối đa AUDIT_SPELL_CHUNK_MAX_CHARS ký tự/lượt)
//                   ③ dịch các câu sót chữ Hán/Anh do code quét (sot_dich)  ④ lỗi gõ/chính tả (chinh_ta)
//     Mỗi làn tự dự phòng bằng model còn lại nếu lỗi/timeout/JSON hỏng. Chương quá dài (> AUDIT_CHUNK_MAX_CHARS)
//     được chia theo ranh giới đoạn để model không phải đọc quá dài.
//  5) Kiểm tra cơ học sau AI (validateAuditFixes + các chốt trong applyAuditFixes) giữ nguyên nguyên tắc
//     "không tin AI tự khai". BỎ quét cơ học xưng hô lệch tông (báo oan nhiều) — chỉ còn quét sót dịch.
// Việc đảm bảo xưng hô ĐÚNG TỪNG NHÂN VẬT vẫn thuộc bước dịch chính (bộ nhớ nhân vật), không thuộc bước soát này.
const AUDIT_CHUNK_MAX_CHARS=12000;          // chương dài hơn mức này thì chia theo đoạn (job xưng hô thoại cũ)
const AUDIT_SPELL_CHUNK_MAX_CHARS=12000;    // job CHÍNH TẢ: mỗi lượt đọc tối đa 12000 ký tự (tính cả ~8 ký tự/đoạn; chương ngắn hơn thì đúng 1 lượt)
const AUDIT_UNTRANSLATED_BATCH=20;          // số câu sót dịch tối đa gửi trong 1 lượt
const AUDIT_RUN_LANE_CALLS_IN_PARALLEL=false; // true: các lượt trong CÙNG 1 làn cũng chạy song song (nhanh hơn nhưng dồn quota)

// Tách bản dịch thành các ĐOẠN (mỗi dòng không rỗng = 1 đoạn), đánh số từ 1.
function buildAuditParagraphs(text){
  const paras=[];
  String(text||'').split('\n').forEach(ln=>{
    if(ln.trim())paras.push({n:paras.length+1,text:ln.replace(/\r$/,'')});
  });
  return paras;
}
// Chia các đoạn thành nhóm ≤ maxChars (không cắt ngang đoạn). Số đoạn vẫn giữ theo cả chương.
function chunkAuditParagraphs(paras,maxChars){
  const chunks=[];let cur=[],len=0;
  for(const p of paras){
    if(cur.length&&len+p.text.length>maxChars){chunks.push(cur);cur=[];len=0;}
    cur.push(p);len+=p.text.length+8;
  }
  if(cur.length)chunks.push(cur);
  return chunks;
}
function renderAuditChunk(chunk){return chunk.map(p=>`[${p.n}] ${p.text}`).join('\n');}

function auditGuidanceSection(promptGuidance){
  return promptGuidance
    ?`CHỈ DẪN THÊM từ prompt dịch chính của người dùng (đã lọc, chỉ giữ phần liên quan xưng hô/thể loại/tên riêng) — dùng để hiểu đúng thể loại/quy ước riêng của truyện. Nếu chỉ dẫn này nêu RÕ thể loại/hệ xưng hô thì dùng CHÍNH XÁC đó làm chuẩn, ưu tiên hơn việc tự suy luận từ nội dung chương:\n${promptGuidance}\n\n`
    :'';
}

// Khung chung cho các job "đọc chương" (xưng hô thoại / chính tả).
// extraFields (tuỳ chọn): mảng {name,desc,example} để job nào cần khai thêm field ngoài 4 field gốc thì
// thêm vào đây, không đụng khung chung của các job khác (job "gender_pronoun" — ví dụ trước đây từng
// dùng "characterName"/"referentGender" qua tham số này — đã bị bỏ, xem AUDIT_FIX_TYPES).
function buildAuditReadPrompt(taskText,beforeRule,promptGuidance,chunk,chunkIdx,chunkCount,extraFields){
  const chunkNote=chunkCount>1
    ?`⚠ Chương dài nên được chia làm ${chunkCount} phần; đây là PHẦN ${chunkIdx+1}/${chunkCount} (số đoạn giữ nguyên theo cả chương nên có thể không bắt đầu từ [1]). Chỉ soát các đoạn trong phần này; không đủ căn cứ trong phần này thì không báo.\n\n`
    :'';
  const extraLines=(extraFields||[]).map(f=>`- "${f.name}": ${f.desc}`).join('\n');
  const extraJson=(extraFields||[]).map(f=>`,"${f.name}":"${f.example}"`).join('');
  return `Bạn là bước SOÁT CHẤT LƯỢNG cho 1 chương truyện ĐÃ DỊCH sang tiếng Việt. Lượt này CHỈ soát ĐÚNG MỘT loại lỗi (nêu ở NHIỆM VỤ); các loại lỗi khác đã có lượt soát riêng — TUYỆT ĐỐI KHÔNG sửa bất cứ điều gì ngoài nhiệm vụ này (không đụng văn phong, hành văn, nội dung, dấu câu) và KHÔNG dịch lại cả chương.\n`+
    `Bản dịch được đánh số theo từng đoạn dạng "[số] nội dung". Hãy đọc LẦN LƯỢT TỪNG đoạn từ đầu đến cuối, không bỏ đoạn nào và KHÔNG dừng sớm sau vài lỗi đầu tiên — lỗi có thể rải rác tới tận đoạn cuối.\n\n`+
    auditGuidanceSection(promptGuidance)+chunkNote+
    `NHIỆM VỤ:\n${taskText}\n\n`+
    `Với MỖI lỗi, thêm 1 phần tử vào "fixes":\n`+
    `- "p": số thứ tự đoạn chứa lỗi (con số trong ngoặc vuông ở đầu đoạn).\n`+
    `- "word": từ/cụm bị sai (nguyên văn).\n`+
    `- "before": ${beforeRule}\n`+
    `- "after": đúng cụm "before" sau khi sửa — chỉ đổi phần sai, giữ nguyên mọi từ khác; PHẢI khác "before" (nếu rà lại thấy không sai thì đừng thêm vào).\n`+
    `- "reason": lý do ngắn gọn.\n`+
    (extraLines?extraLines+'\n':'')+
    `Nếu 1 câu có nhiều từ sai thì gộp thành 1 phần tử. Chỉ báo khi CHẮC CHẮN là lỗi — không đoán, không sửa chỗ mơ hồ. Không có lỗi nào thì trả về {"fixes":[]}.\n`+
    `Chỉ trả về JSON, không kèm văn bản/giải thích/markdown fence nào khác:\n`+
    `{"fixes":[{"p":3,"word":"...","before":"...","after":"...","reason":"..."${extraJson}}]}\n\n`+
    `BẢN DỊCH CẦN SOÁT:\n${renderAuditChunk(chunk)}`;
}
const AUDIT_BEFORE_RULE_PHRASE='trích NGUYÊN VĂN từ đoạn [p], y hệt từng dấu câu/khoảng trắng, là cụm NGẮN NHẤT chứa "word" (thường 3–10 từ) nằm gọn trong ĐÚNG đoạn đó và đủ để chỉ khớp 1 chỗ TRONG ĐOẠN ĐÓ. Không trích cả đoạn, không trích xuyên nhiều đoạn, không chép lại số "[p]".';
const AUDIT_BEFORE_RULE_WORD='trích ĐÚNG 1 TỪ bị sai, nguyên văn (không phải cả câu). Chỉ khi từ đó xuất hiện lặp lại y hệt trong CÙNG đoạn [p] mới thêm tối thiểu 1-2 từ liền kề để phân biệt.';

// ---------- JOB ①: XƯNG HÔ TRONG LỜI THOẠI (type "genre_tone") — LÀN NẶNG ----------
// THIẾT KẾ ĐƠN GIẢN: KHÔNG liệt kê sẵn cặp từ cụ thể (ta/ngươi, tôi/cậu, anh/em...) và không có quy tắc cặp/vai vế
// viết cứng trong prompt — các ví dụ cụ thể dễ khiến model soát "đi theo lối mòn" (áp ví dụ máy móc, sửa nhầm
// người nói/người nghe). AI TỰ PHÁN ĐOÁN xưng hô nào lệch hệ, chỉ dựa vào: (1) "CHỈ DẪN THÊM" đã chưng cất từ prompt
// dịch chính (auditGuidanceSection), (2) khối preset xưng hô người dùng chọn (nếu có), (3) bối cảnh chính văn bản.
function buildDialogueToneTask(preset){
  const presetBlock=(preset&&typeof AddrPresets!=='undefined')?AddrPresets.blockForAudit(preset):'';
  return `XƯNG HÔ TRONG LỜI THOẠI SAI HỆ so với thể loại/bối cảnh của truyện.\n`+
    `Phạm vi: CHỈ lời THOẠI (trong ngoặc kép hoặc sau gạch đầu dòng), CHỈ từ xưng hô NGÔI 1 (tự xưng) và NGÔI 2 (gọi đối phương). KHÔNG đụng lời tường thuật, KHÔNG đụng đại từ ngôi 3.\n`+
    presetBlock+
    `Cách xác định: dựa vào thể loại, hệ xưng hô và các quy ước nêu ở phần "CHỈ DẪN THÊM" (và bộ xưng hô thường gặp ở trên, nếu có) để TỰ PHÁN ĐOÁN xưng hô nào trong lời thoại bị lệch hệ so với bối cảnh truyện (thường do dịch máy/dịch trôi, VD lẫn xưng hô của thể loại này vào thể loại khác). Nếu không có chỉ dẫn nào nêu rõ, tự suy từ bối cảnh chung của truyện; không suy thể loại chỉ từ đạo cụ/công nghệ.\n`+
    `Chỉ báo khi CHẮC CHẮN là lệch hệ. Xưng hô ĐÃ hợp bối cảnh thì KHÔNG báo, kể cả khi bạn thấy có cách xưng hô khác "hay hơn" — không đoán, không sửa chỗ mơ hồ, và không sửa chỉ để đổi cho khác.\n`+
    `Cách sửa: chỉ thay ĐÚNG từ xưng hô sai bằng 1 từ hợp hệ, GIỮ NGUYÊN NGÔI (từ tự xưng vẫn là tự xưng, từ gọi đối phương vẫn là gọi đối phương — không bao giờ biến cái này thành cái kia), giữ nguyên sắc thái thân mật/kính trọng/xa cách và vai vế của người nói với người nghe. Không đổi bất kỳ từ nào khác trong câu.\n`+
    `GIỚI HẠN NGHIÊM NGẶT: CHỈ được sửa khi CẢ từ đang sai LẪN từ thay vào đều là ĐẠI TỪ NHÂN XƯNG TRUNG TÍNH thông thường (kiểu tôi/ta/tao/tớ, ngươi/mày/cậu/anh/em...). TUYỆT ĐỐI KHÔNG sửa, và không đưa vào "after", các cách tự xưng/gọi mang CHỨC VỤ, ĐỊA VỊ hay sắc thái đặc biệt (VD lão phu, lão tử, bản tôn, bổn tọa, tại hạ, ngài, bệ hạ, công tử, tên riêng, chức danh...): đó là lựa chọn có chủ đích của người dịch/nhân vật, thấy khác hệ cũng để nguyên. Không sửa danh từ chỉ người trong lời tường thuật (ông lão, gã, hắn...).\n`+
    `GIỌNG THÔ/SUỒNG SÃ: tao/mày (và cách gọi côn đồ, thù địch, bạn bè suồng sã tương tự) là xưng hô HỢP LỆ của truyện hiện đại/phương Tây, KHÔNG phải lệch hệ — không báo và không đổi sang tôi/cậu. Chỉ khi truyện là cổ trang/tu tiên thì mới coi là lệch hệ.\n`+
    `Kiểm tra lại trước khi báo: đọc câu SAU khi sửa — người nói và người nghe phải vẫn được chỉ bằng 2 cách gọi khác nhau, đúng vai (không thể tự xưng và gọi đối phương bằng cùng 1 từ); nếu sau khi sửa câu thành vô lý hoặc đổi nghĩa thì đừng báo.`;
}

// ---------- JOB ④: CHÍNH TẢ (type "chinh_ta") — LÀN NHẸ ----------
const AUDIT_TASK_SPELLING=
  `LỖI GÕ/CHÍNH TẢ tiếng Việt THẬT SỰ (gõ nhầm phím, sai dấu thanh, thiếu/thừa 1 chữ cái do đánh máy — VD "khoong" thay vì "không", "đựoc" thay vì "được", "chuyên" thay vì "chuyện" khi ngữ cảnh rõ ràng là danh từ "chuyện").\n`+
  `TUYỆT ĐỐI KHÔNG sửa: lựa chọn từ ngữ/văn phong (dù thấy có từ hay hơn), cách hành văn, thứ tự câu chữ, xưng hô/đại từ, tên riêng, hay bất kỳ điều gì không phải lỗi gõ khách quan. Không chắc là lỗi gõ (có thể là lựa chọn từ có chủ đích) thì KHÔNG báo. "after" là đúng CHÍNH TỪ đó đã sửa, không đổi gì xung quanh.`;

// ---------- JOB ③: SÓT DỊCH (type "sot_dich") — LÀN NHẸ ----------
// Không đưa cả chương: chỉ đưa các câu do CODE đã quét ra (cands: {id,p,kind,text}); AI chỉ dịch và trả về id.
function buildUntranslatedPrompt(cands,promptGuidance,retryRound=0){
  const list=cands.map(c=>`[${c.id}] (${c.kind==='cjk'?'CHỮ HÁN':'TIẾNG ANH'}) "${c.text}"`).join('\n');
  return `Bạn là bước SOÁT SÓT DỊCH cho 1 chương truyện đã dịch sang tiếng Việt. Máy đã quét sẵn và trích ra các câu/mệnh đề dưới đây (mỗi mục có số id) còn sót chữ chưa dịch. Việc của bạn: dịch bổ sung cho từng mục, KHÔNG làm gì khác.\n\n`+
    auditGuidanceSection(promptGuidance)+
    (retryRound>0
      ?`⚠ ĐÂY LÀ LƯỢT THỬ LẠI (lần ${retryRound}): các mục dưới đây đã được dịch ở lượt trước nhưng VẪN CÒN chữ Hán. "after" lần này PHẢI dịch nốt TOÀN BỘ phần chữ Hán còn lại, tuyệt đối không được để sót bất kỳ ký tự chữ Hán nào (kể cả tên riêng — phiên âm Hán Việt).\n\n`
      :'')+
    `QUY TẮC:\n`+
    `- Mục "(CHỮ HÁN)": máy XÁC NHẬN chắc chắn còn nguyên chữ Hán chưa dịch -> với MỖI mục BẮT BUỘC trả về 1 phần tử {"id","after"}. "after" là bản dịch tiếng Việt tự nhiên của TOÀN BỘ mục đó: giữ nguyên phần đã dịch đúng, chỉ dịch phần chữ Hán còn sót; tên riêng chữ Hán thì phiên âm Hán-Việt (hoặc theo chỉ dẫn ở trên nếu có); kết quả không được còn chữ Hán. Chỉ được bỏ qua nếu chữ Hán đó rõ ràng chỉ là ký hiệu/con dấu trang trí không mang nghĩa (cực hiếm).\n`+
    `- Mục "(TIẾNG ANH)": máy chỉ NGHI NGỜ. Chỉ trả về phần tử khi đó thực sự là câu/cụm CÓ Ý NGHĨA mà đáng lẽ phải dịch (VD "I'm sorry", "Thank you", "He said nothing"). BỎ QUA (không trả về) nếu là tên riêng/tựa đề/tên kỹ năng, vật phẩm, thương hiệu, thuật ngữ, câu trích dẫn/lời bài hát cố ý giữ nguyên tiếng Anh.\n`+
    `- Mục "(TIẾNG ANH)" mở đầu bằng 1 từ nối/trạng từ tiếng Anh đứng đầu câu (After, Then, But, However...) mà phần còn lại của câu đã là tiếng Việt: gần như chắc chắn là SÓT DỊCH → BẮT BUỘC trả về {"id","after"}, trong đó dịch từ đó sang tiếng Việt tự nhiên, hợp ngữ cảnh và mạch văn; giữ nguyên toàn bộ phần còn lại của câu. Chỉ bỏ qua nếu từ đó rõ ràng là 1 phần của tên riêng/tựa đề/tên kỹ năng.\n`+
    `- Giữ nguyên dấu câu, dấu ngoặc kép và cách xưng hô hiện có trong mục; KHÔNG đổi xưng hô, KHÔNG thêm bớt ý, KHÔNG viết lại phần đã là tiếng Việt. "after" viết trên 1 dòng (không xuống dòng).\n\n`+
    `Chỉ trả về JSON, không kèm giải thích/markdown fence nào khác:\n{"fixes":[{"id":1,"after":"..."}]}\nKhông mục nào cần sửa thì trả về {"fixes":[]}.\n\n`+
    `CÁC MỤC MÁY ĐÃ QUÉT:\n${list}`;
}
// ---------- [Mục 7.2] ÂM TIẾT NGHI LỖI SINH TOKEN (type "chinh_ta", do CODE quét sẵn) — LÀN NHẸ ----------
// Máy quét (findSuspectSyllables) đã chỉ sẵn từ không thể tồn tại trong tiếng Việt; AI chỉ chọn từ đúng theo ngữ cảnh.
function buildSyllableFixPrompt(cands,promptGuidance){
  const list=cands.map(c=>`[${c.id}] từ nghi lỗi: ${c.words.map(w=>`"${w}"`).join(', ')}\n    cụm: "${c.text}"`).join('\n');
  return `Bạn là bước SOÁT LỖI SINH TOKEN cho 1 chương truyện đã dịch sang tiếng Việt. Máy đã quét cơ học và tìm thấy các "từ" dưới đây KHÔNG THỂ tồn tại trong tiếng Việt (sai cấu trúc âm tiết: dấu thanh sai với vần, nguyên âm thừa/lạc...), thường do model dịch sinh nhầm token. Việc của bạn: với mỗi mục, đoán từ ĐÚNG theo ngữ cảnh và trả lại cụm đã sửa.\n\n`+
    auditGuidanceSection(promptGuidance)+
    `QUY TẮC:\n`+
    `- Chỉ sửa đúng từ nghi lỗi (và có thể thêm 1 từ liền kề nếu lỗi dính liền, VD 2 từ bị dính nhau). Giữ nguyên MỌI từ khác, dấu câu, số lượng từ trong cụm.\n`+
    `- Từ thay vào PHẢI là từ/âm tiết tiếng Việt có thật và hợp nghĩa câu. Không chắc từ đúng là gì thì BỎ QUA mục đó (không trả về), đừng đoán.\n`+
    `- Không sửa tên riêng, không viết lại câu.\n`+
    `- "after": nguyên cụm sau khi sửa, trên 1 dòng. "reason": ngắn, dạng "<từ sai> -> <từ đúng>"; từ sai và từ đúng phải KHÁC nhau.\n\n`+
    `Chỉ trả về JSON, không kèm giải thích/markdown fence nào khác:\n{"fixes":[{"id":1,"after":"...","reason":"..."}]}\nKhông mục nào sửa được thì trả về {"fixes":[]}.\n\n`+
    `CÁC MỤC MÁY ĐÃ QUÉT:\n${list}`;
}
function mapAuditSyllableFixes(cands){
  const byId=new Map(cands.map(c=>[c.id,c]));
  return raw=>{
    const out=[],seen=new Set();
    (raw||[]).forEach(f=>{
      const c=f&&byId.get(parseInt(f.id,10));
      if(!c||seen.has(c.id))return;
      seen.add(c.id);
      out.push({type:'chinh_ta',p:c.p,word:c.words.join(', '),before:c.text,after:AUDIT_NFC(f.after),reason:f.reason,_syl:true});
    });
    const missed=cands.filter(c=>!seen.has(c.id));
    if(missed.length)console.log(`[Luồng 3][Âm tiết] Model bỏ qua ${missed.length}/${cands.length} cụm nghi lỗi (không chắc từ đúng): ${missed.map(c=>c.words.join('/')).join(', ')} — giữ nguyên, cần xem lại tay.`);
    return out;
  };
}
// ---------- GỘP: CHÍNH TẢ + ÂM TIẾT NGHI LỖI + SÓT DỊCH trong CÙNG 1 lượt gọi (khi bật "Kiểm tra chính tả") ----------
// Trước đây âm tiết nghi lỗi và sót dịch mỗi loại tốn lượt gọi riêng (gom 20 mục/lượt). Nay code vẫn quét cơ học như cũ
// nhưng nhét các mục thuộc đúng phần văn bản đang soát vào chung prompt chính tả. Trả JSON:
// {"fixes":[chính tả], "syllables":[{id,after,reason}], "untranslated":[{id,after}]} (2 khóa sau chỉ có khi có mục).
function buildSpellMergedPrompt(chunk,chunkIdx,chunkCount,untCands,sylCands,promptGuidance){
  const hasS=sylCands.length>0,hasU=untCands.length>0;
  const chunkNote=chunkCount>1
    ?`⚠ Chương dài nên được chia làm ${chunkCount} phần; đây là PHẦN ${chunkIdx+1}/${chunkCount} (số đoạn giữ nguyên theo cả chương nên có thể không bắt đầu từ [1]). Chỉ soát các đoạn trong phần này; không đủ căn cứ trong phần này thì không báo.\n\n`
    :'';
  const sylList=sylCands.map(c=>`[${c.id}] từ nghi lỗi: ${c.words.map(w=>`"${w}"`).join(', ')}\n    cụm: "${c.text}"`).join('\n');
  const untList=untCands.map(c=>`[${c.id}] (${c.kind==='cjk'?'CHỮ HÁN':'TIẾNG ANH'}) "${c.text}"`).join('\n');
  const nTasks=1+(hasS?1:0)+(hasU?1:0);
  let taskB='',taskC='';
  if(hasS)taskB=`VIỆC B — ÂM TIẾT NGHI LỖI (danh sách B ở cuối): máy đã quét cơ học và tìm thấy các "từ" KHÔNG THỂ tồn tại trong tiếng Việt (sai cấu trúc âm tiết: dấu thanh sai với vần, nguyên âm thừa/lạc...), thường do model dịch sinh nhầm token. Với mỗi mục, đoán từ ĐÚNG theo ngữ cảnh và trả lại cụm đã sửa.\n`+
    `- Chỉ sửa đúng từ nghi lỗi (có thể thêm 1 từ liền kề nếu lỗi dính liền, VD 2 từ bị dính nhau). Giữ nguyên MỌI từ khác, dấu câu, số lượng từ trong cụm.\n`+
    `- Từ thay vào PHẢI là từ/âm tiết tiếng Việt có thật và hợp nghĩa câu. Không chắc từ đúng là gì thì BỎ QUA mục đó (không trả về), đừng đoán. Không sửa tên riêng, không viết lại câu.\n`+
    `- Trả vào khóa "syllables": {"id":<id mục B>,"after":"nguyên cụm sau khi sửa, trên 1 dòng","reason":"<từ sai> -> <từ đúng>"}; từ sai và từ đúng phải KHÁC nhau.\n\n`;
  if(hasU)taskC=`VIỆC C — SÓT DỊCH (danh sách C ở cuối): máy đã quét sẵn các câu/mệnh đề còn sót chữ chưa dịch. Dịch bổ sung cho từng mục, KHÔNG làm gì khác.\n`+
    `- Mục "(CHỮ HÁN)": máy XÁC NHẬN chắc chắn còn nguyên chữ Hán chưa dịch -> với MỖI mục BẮT BUỘC trả về 1 phần tử. "after" là bản dịch tiếng Việt tự nhiên của TOÀN BỘ mục đó: giữ nguyên phần đã dịch đúng, chỉ dịch phần chữ Hán còn sót; tên riêng chữ Hán thì phiên âm Hán-Việt (hoặc theo chỉ dẫn ở trên nếu có); kết quả không được còn chữ Hán. Chỉ được bỏ qua nếu chữ Hán đó rõ ràng chỉ là ký hiệu/con dấu trang trí không mang nghĩa (cực hiếm).\n`+
    `- Mục "(TIẾNG ANH)": máy chỉ NGHI NGỜ. Chỉ trả về phần tử khi đó thực sự là câu/cụm CÓ Ý NGHĨA mà đáng lẽ phải dịch (VD "I'm sorry", "Thank you", "He said nothing"). BỎ QUA (không trả về) nếu là tên riêng/tựa đề/tên kỹ năng, vật phẩm, thương hiệu, thuật ngữ, câu trích dẫn/lời bài hát cố ý giữ nguyên tiếng Anh.\n`+
    `- Mục "(TIẾNG ANH)" mở đầu bằng 1 từ nối/trạng từ tiếng Anh đứng đầu câu (After, Then, But, However...) mà phần còn lại của câu đã là tiếng Việt: gần như chắc chắn là SÓT DỊCH -> BẮT BUỘC trả về phần tử, dịch từ đó sang tiếng Việt tự nhiên, hợp ngữ cảnh và mạch văn; giữ nguyên phần còn lại của câu. Chỉ bỏ qua nếu từ đó rõ ràng là 1 phần của tên riêng/tựa đề/tên kỹ năng.\n`+
    `- Giữ nguyên dấu câu, dấu ngoặc kép và cách xưng hô hiện có trong mục; KHÔNG đổi xưng hô, KHÔNG thêm bớt ý, KHÔNG viết lại phần đã là tiếng Việt.\n`+
    `- Mục có thể bắt đầu/kết thúc GIỮA câu (máy cắt theo độ dài). "after" CHỈ là bản dịch đúng đoạn chữ của mục đó: KHÔNG chép kèm nhãn đoạn "[số]", KHÔNG chép thêm phần câu nằm trước hoặc sau mục trong bản dịch, KHÔNG thêm lời giải thích.\n`+
    `- Trả vào khóa "untranslated": {"id":<id mục C>,"after":"bản dịch, trên 1 dòng (không xuống dòng)"}.\n\n`;
  const jsonShape=`{"fixes":[{"p":3,"word":"...","before":"...","after":"...","reason":"..."}]`+(hasS?`,"syllables":[{"id":1,"after":"...","reason":"..."}]`:'')+(hasU?`,"untranslated":[{"id":1,"after":"..."}]`:'')+`}`;
  return `Bạn là bước SOÁT CHẤT LƯỢNG cho 1 chương truyện ĐÃ DỊCH sang tiếng Việt. Lượt này gồm ${nTasks} việc ĐỘC LẬP nêu ở dưới; mỗi việc trả vào đúng khóa JSON của nó. TUYỆT ĐỐI KHÔNG sửa bất cứ điều gì ngoài các việc này (không đụng văn phong, hành văn, nội dung, dấu câu, xưng hô) và KHÔNG dịch lại cả chương.\n\n`+
    (hasU?auditGuidanceSection(promptGuidance):'')+chunkNote+
    `VIỆC A — LỖI GÕ/CHÍNH TẢ trong bản dịch (khóa "fixes"): ${AUDIT_TASK_SPELLING}\n`+
    `Bản dịch được đánh số theo từng đoạn dạng "[số] nội dung". Đọc LẦN LƯỢT TỪNG đoạn từ đầu đến cuối, không bỏ đoạn nào và KHÔNG dừng sớm sau vài lỗi đầu tiên — lỗi có thể rải rác tới tận đoạn cuối. Với MỖI lỗi, thêm 1 phần tử vào "fixes":\n`+
    `- "p": số thứ tự đoạn chứa lỗi (con số trong ngoặc vuông ở đầu đoạn).\n`+
    `- "word": từ/cụm bị sai (nguyên văn).\n`+
    `- "before": ${AUDIT_BEFORE_RULE_WORD}\n`+
    `- "after": đúng cụm "before" sau khi sửa — chỉ đổi phần sai, giữ nguyên mọi từ khác; PHẢI khác "before" (nếu rà lại thấy không sai thì đừng thêm vào).\n`+
    `- "reason": lý do ngắn gọn.\n`+
    `Nếu 1 câu có nhiều từ sai thì gộp thành 1 phần tử. Chỉ báo khi CHẮC CHẮN là lỗi — không đoán, không sửa chỗ mơ hồ.`+
    (hasS||hasU?` Việc A KHÔNG báo lại các từ đã nằm trong danh sách B và KHÔNG sửa trong các câu thuộc danh sách C (đã có việc riêng xử lý).`:'')+`\n\n`+
    taskB+taskC+
    `Chỉ trả về JSON, không kèm văn bản/giải thích/markdown fence nào khác; luôn có khóa "fixes" (rỗng nếu việc A không có lỗi), việc nào không có gì thì trả mảng rỗng:\n${jsonShape}\n\n`+
    `BẢN DỊCH CẦN SOÁT (cho việc A):\n${renderAuditChunk(chunk)}`+
    (hasS?`\n\nDANH SÁCH B — ÂM TIẾT NGHI LỖI (máy đã quét):\n${sylList}`:'')+
    (hasU?`\n\nDANH SÁCH C — CÂU SÓT DỊCH (máy đã quét):\n${untList}`:'');
}
// Gom candidate sót dịch theo TỪNG ĐOẠN (để biết đoạn nào) — CJK chắc chắn, Anh chỉ nghi ngờ; nếu 1 cụm
// Anh nằm trong/chứa 1 câu CJK cùng đoạn thì bỏ cụm Anh (tránh 2 fix chồng lên cùng 1 chỗ).
function collectUntranslatedCandidates(paras){
  const out=[];let id=0;
  for(const p of paras){
    const cjk=findCJKLeftoverCandidates(p.text);
    const en=findEnglishLeftoverCandidates(p.text).filter(e=>!cjk.some(c=>c.includes(e)||e.includes(c)));
    cjk.forEach(t=>out.push({id:++id,p:p.n,kind:'cjk',text:t}));
    en.forEach(t=>out.push({id:++id,p:p.n,kind:'en',text:t}));
  }
  return out;
}
// VÒNG THỬ LẠI cho job "sót dịch": auditChapterAddressing chỉ quét sót dịch 1 lần, nên nếu model dịch nửa
// chừng (chữ Hán giảm nhưng chưa hết — validateAuditFixes chỉ đòi giảm) hoặc bỏ sót hẳn 1 câu thì chữ Hán
// còn nằm nguyên trong chương. Hàm này QUÉT LẠI bản đã sửa và gọi lại CHỈ cho các câu còn chữ Hán (không
// gọi cho tiếng Anh — đó chỉ là nghi ngờ, không đáng tốn thêm lượt). Tối đa AUDIT_UNTRANSLATED_MAX_RETRIES
// vòng, dừng sớm ngay khi sạch. Chương sạch từ đầu thì KHÔNG tốn thêm lượt nào. Dùng đúng bước kiểm tra cơ
// học cũ (validateAuditFixes) và cùng model làn nhẹ. Không bao giờ throw — lỗi thì trả bản tốt nhất đang có.
const AUDIT_UNTRANSLATED_MAX_RETRIES=4;
async function retryLeftoverCjk(text,keys,models,promptGuidance){
  let cur=text;
  try{
    for(let round=1;round<=AUDIT_UNTRANSLATED_MAX_RETRIES;round++){
      const cands=collectUntranslatedCandidates(buildAuditParagraphs(cur)).filter(c=>c.kind==='cjk');
      if(!cands.length)return cur;
      console.log(`[Luồng 3][Sót dịch] Vòng thử lại ${round}/${AUDIT_UNTRANSLATED_MAX_RETRIES}: còn ${cands.length} câu chữ Hán chưa dịch hết — gọi lại API.`);
      const fixes=[];
      for(let i=0;i<cands.length;i+=AUDIT_UNTRANSLATED_BATCH){
        const batch=cands.slice(i,i+AUDIT_UNTRANSLATED_BATCH);
        try{
          const raw=await callAuditForFixes(keys,models,buildUntranslatedPrompt(batch,promptGuidance,round),`sót dịch thử lại ${round}`);
          fixes.push(...mapAuditUntranslatedFixes(batch)(raw));
        }catch(e){
          console.log(`[Luồng 3][Sót dịch] Vòng thử lại ${round}: 1 lượt gọi lỗi (cả model chính lẫn dự phòng) —`,e.message||e);
        }
      }
      const v=validateAuditFixes(cur,fixes);
      v.dropped.forEach(d=>console.log(`[Luồng 3][Sót dịch] Loại 1 fix thử lại: ${d.why} — "${(d.fx.before||'').slice(0,60)}..."`));
      if(!v.kept.length)continue;
      const r=applyAuditFixes(cur,v.kept);
      cur=r.text;
      console.log(`[Luồng 3][Sót dịch] Vòng thử lại ${round}: sửa ${r.applied}, bỏ qua ${r.skipped}.`);
    }
    const left=collectUntranslatedCandidates(buildAuditParagraphs(cur)).filter(c=>c.kind==='cjk').length;
    if(left)console.log(`[Luồng 3][Sót dịch] ⚠ Sau ${AUDIT_UNTRANSLATED_MAX_RETRIES} vòng thử lại vẫn còn ${left} câu chữ Hán chưa dịch hết — giữ nguyên, không gọi thêm.`);
  }catch(e){
    console.log('[Luồng 3][Sót dịch] Vòng thử lại lỗi — giữ bản đang có:',e.message||e);
  }
  return cur;
}

// Áp dụng danh sách fixes vào translatedText, CHỈ khi "before" khớp DUY NHẤT 1 lần trong văn bản
// TẠI THỜI ĐIỂM áp dụng (kiểm tra lại sau mỗi lần thay, vì thay 1 chỗ có thể ảnh hưởng số lần khớp
// của các fix sau) — khớp 0 lần (model trích sai/model đã diễn giải lại thay vì trích nguyên văn)
// hoặc khớp >1 lần (không đủ ngữ cảnh để xác định đúng chỗ cần sửa) đều BỎ QUA, không đoán mò, tránh
// sửa nhầm sang câu khác dùng chung 1 xưng hô cho nhân vật/tình huống khác.
// Trước khi bỏ cuộc hẳn ở lần so khớp CHÍNH XÁC (exact), thử thêm 1 lần so khớp NỚI LỎNG KHOẢNG
// TRẮNG: model soát đôi khi trích "before" đúng từng chữ nhưng lệch số khoảng trắng/xuống dòng so với
// bản dịch gốc (dấu cách kép, xuống dòng thừa...) — những lỗi thật bị bỏ sót oan chỉ vì lý do này.
// Cách làm: biến "before" thành regex, coi MỌI khoảng trắng liên tiếp trong đó là "\s+" (khớp được
// bất kỳ kiểu khoảng trắng nào ở vị trí tương ứng), rồi vẫn áp dụng đúng quy tắc cũ — CHỈ áp dụng khi
// regex đó khớp DUY NHẤT 1 lần trong toàn chương, tuyệt đối không đoán mò khi mơ hồ.
function escapeRegExp(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function buildLooseWhitespaceRegex(before){
  const pattern=escapeRegExp(before).replace(/\s+/g,'\\s+');
  try{return new RegExp(pattern,'g');}catch(e){return null;}
}
// "before" KHÔNG chứa khoảng trắng (1 từ/token đơn — tình huống hay gặp nhất ở type "chinh_ta", nơi
// prompt CHO PHÉP trích ngắn chỉ đúng từ bị gõ sai thay vì cả câu như xưng hô) là trường hợp NGUY HIỂM
// nếu chỉ đếm bằng out.split(before).length-1 (đếm SUBSTRING thô): 1 từ ngắn (VD "anh") có thể là
// substring của 1 từ HOÀN TOÀN KHÁC (VD "khoanh", "thanh") mà không phải chính nó đứng riêng — nếu
// tổng số lần khớp kiểu này vô tình đúng bằng 1, code cũ sẽ thay thế NHẦM VÀO GIỮA 1 TỪ KHÁC, làm hỏng
// từ đó. \b chuẩn của JS regex không dùng được vì chỉ nhận diện ký tự ASCII, vỡ hoàn toàn với chữ có
// dấu tiếng Việt (coi mọi ranh giới dấu là "word boundary" giả). Tự cài ranh giới bằng cách kiểm tra
// ký tự NGAY TRƯỚC/SAU vị trí khớp có phải chữ/số hay không (dùng \p{L}/\p{N} — nhận diện đúng cả chữ
// có dấu tiếng Việt nhờ Unicode property, cần flag 'u').
const VN_WORD_CHAR=/[\p{L}\p{N}]/u;
function isWordChar(ch){return !!ch&&VN_WORD_CHAR.test(ch);}
// Trả về mảng vị trí (index) mà "before" khớp trong text — nếu wordBoundaryOnly=true, CHỈ tính các vị
// trí mà 2 đầu không dính liền 1 ký tự chữ/số khác (loại các khớp "chui vào giữa từ khác" nói trên).
function findMatchPositions(text,before,wordBoundaryOnly){
  const positions=[];
  let searchFrom=0;
  while(true){
    const idx=text.indexOf(before,searchFrom);
    if(idx===-1)break;
    if(wordBoundaryOnly){
      const beforeChar=idx>0?text[idx-1]:'';
      const afterChar=idx+before.length<text.length?text[idx+before.length]:'';
      if(isWordChar(beforeChar)||isWordChar(afterChar)){searchFrom=idx+1;continue;}
    }
    positions.push(idx);
    searchFrom=idx+1; // lùi 1 ký tự (không phải idx+before.length) để không bỏ sót các khớp chồng lấn
  }
  return positions;
}
function applyAddressFixes(text,fixes){
  let out=text,applied=0,skipped=0;
  for(const fx of (fixes||[])){
    const before=(fx&&fx.before||'').trim(),after=fx&&fx.after;
    if(!before||typeof after!=='string'){skipped++;continue;}
    // Lưới an toàn: model đôi khi trả về fix "rỗng" (before và after giống hệt nhau, thực chất không
    // có lỗi gì — xem log thực tế: reason "dư thừa không có lỗi") dù prompt đã dặn không được làm vậy.
    // Loại các entry này trước khi áp dụng, không tính là applied (không có gì thay đổi thật) lẫn
    // skipped (không phải do không khớp được vị trí) để log phản ánh đúng bản chất.
    if(before===after.trim()){
      console.log(`[Luồng 3] Bỏ qua 1 gợi ý sửa rỗng (before = after, không có thay đổi thật): "${before.slice(0,60)}..."`);
      continue;
    }
    const wordBoundaryOnly=!/\s/.test(before); // trích ngắn kiểu 1 từ (chinh_ta) -> bắt buộc soi ranh giới từ
    const positions=findMatchPositions(out,before,wordBoundaryOnly);
    if(positions.length===1){
      if(before.length>300){
        console.log(`[Luồng 3] Lưu ý: 1 gợi ý soát chất lượng trích "before" khá dài (${before.length} ký tự) — model có thể đang trích thừa đoạn văn không cần thiết thay vì chỉ 1 câu.`);
      }
      const idx=positions[0];
      out=out.slice(0,idx)+after+out.slice(idx+before.length);
      applied++;
      console.log(`[Luồng 3] Đã sửa: "${before}" -> "${after}"${fx.reason?` (${fx.reason})`:''}`);
      continue;
    }
    // Không khớp chính xác đúng 1 lần -> thử lại với so khớp nới lỏng khoảng trắng trước khi bỏ qua.
    // (chỉ có ý nghĩa với "before" nhiều từ — 1 token đơn không có khoảng trắng để nới lỏng)
    const looseRe=buildLooseWhitespaceRegex(before);
    const looseMatches=looseRe?(out.match(looseRe)||[]):[];
    if(looseRe&&looseMatches.length===1){
      looseRe.lastIndex=0;
      out=out.replace(looseRe,()=>after);
      applied++;
      console.log(`[Luồng 3] Đã sửa (khớp nới lỏng khoảng trắng): "${before.slice(0,60)}..." -> "${after.slice(0,60)}..."${fx.reason?` (${fx.reason})`:''}`);
      continue;
    }
    console.log(`[Luồng 3] Bỏ qua 1 gợi ý soát chất lượng (khớp ${positions.length} lần thay vì đúng 1 lần, kể cả sau khi nới lỏng khoảng trắng): "${before.slice(0,60)}..."`);
    skipped++;
  }
  return {text:out,applied,skipped};
}
// Gọi 1 lượt soát: thử lần lượt các model trong "models" (model chính rồi model dự phòng); lỗi/timeout
// HOẶC JSON không hợp lệ đều coi là thất bại của model đó. Trả về mảng "fixes" thô; ném lỗi nếu hết model.
async function callAuditForFixes(keys,models,prompt,tag,opts){
  const messages=[{role:'user',parts:[{text:prompt}]}];
  let lastErr=null;
  for(let mi=0;mi<models.length;mi++){
    const model=models[mi];
    if(!charmemOptionalAllowed(model,keys,'soát lỗi')){lastErr=new Error('Bỏ qua: model hết quota ngày (hạ cấp)');continue;} // [Bước 3]
    // [Bước 5] Model dự phòng (không phải lựa chọn đầu) chỉ dùng khi còn chỗ ngay; đang kín thì bỏ qua thay vì chờ 12s rồi lỗi.
    if(mi>0&&models[mi]!==models[0]&&!charmemModelHasRoom(model,keys)){
      lastErr=lastErr||new Error('Model dự phòng không còn chỗ');
      console.log(`[Luồng 3][Soát] ${tag}: model dự phòng ${model} không còn chỗ (kín lượt/phút) — không chuyển.`);
      continue;
    }
    // [Bước 5] Lỗi JSON: thử lại ĐÚNG model đó 1 lần rồi mới coi là thất bại của model. Lỗi API (429/timeout/...): sang model khác ngay.
    let apiFailed=false;
    for(let attempt=0;attempt<2&&!apiFailed;attempt++){
      try{
        const rawText=await callCharModel(keys,model,messages,CHAR_ANALYSIS_TIMEOUT_MS,'audit');
        const parsed=parseCharacterJSON(rawText);
        if(opts&&opts.full){ // lượt gộp chính tả+âm tiết+sót dịch: trả CẢ object (fixes/syllables/untranslated)
          if(parsed&&(Array.isArray(parsed.fixes)||Array.isArray(parsed.syllables)||Array.isArray(parsed.untranslated)))return parsed;
        }else if(parsed&&Array.isArray(parsed.fixes))return parsed.fixes;
        lastErr=new Error('JSON không parse được');
        console.log(`[Luồng 3][Soát] ${tag}: model ${model} trả JSON không hợp lệ${attempt===0?', thử lại đúng model này 1 lần':', chuyển model khác'}. Raw:`,rawText);
      }catch(e){
        lastErr=e;
        apiFailed=true;
        console.log(`[Luồng 3][Soát] ${tag}: model ${model} lỗi gọi API, thử model khác...`,e.message||e);
      }
    }
  }
  throw lastErr||new Error('Không gọi được model nào');
}
// Chạy các lượt của 1 làn (mặc định tuần tự để mỗi model chỉ nhận 1 request/lúc, đỡ dồn quota).
// 1 lượt hỏng KHÔNG làm hỏng các lượt khác — nhưng phải log rõ "chưa được soát" (không giả vờ là sạch lỗi).
async function runAuditLane(laneName,calls){
  const fixes=[];let failed=0;
  const runOne=async c=>{
    try{
      const raw=await callAuditForFixes(c.keys,c.models,c.prompt,c.tag,c.full?{full:true}:undefined);
      const mapped=c.mapFixes(raw);
      console.log(`[Luồng 3][Soát][${laneName}] ${c.tag}: đề xuất ${mapped.length} fix.`);
      return mapped;
    }catch(e){
      failed++;
      console.log(`[Luồng 3][Soát][${laneName}] ${c.tag}: cả model chính lẫn dự phòng đều lỗi — PHẦN NÀY CHƯA ĐƯỢC SOÁT (không phải "sạch lỗi"):`,e.message||e);
      return [];
    }
  };
  if(AUDIT_RUN_LANE_CALLS_IN_PARALLEL){
    (await Promise.all(calls.map(runOne))).forEach(r=>fixes.push(...r));
  }else{
    for(const c of calls)fixes.push(...await runOne(c));
  }
  return{fixes,failed,total:calls.length};
}

const AUDIT_NFC=v=>typeof v==='string'?v.normalize('NFC'):'';
// Ánh xạ fix thô của job "đọc chương" -> fix chuẩn; "type" do CODE gán theo job (không tin model tự gắn nhãn).
// extraFieldNames (tuỳ chọn): tên các field ngoài 5 field gốc cần giữ nguyên cho job nào cần khai thêm
// (xem extraFields ở buildAuditReadPrompt) — không parse/chuẩn hoá gì thêm ở đây, để validateAuditFixes
// tự đối chiếu cơ học với dữ liệu đã lưu. Hiện không có job nào đang dùng tham số này (job "gender_pronoun",
// ví dụ trước đây từng khai "characterName"/"referentGender" qua đây, đã bị bỏ).
function mapAuditReadFixes(type,extraFieldNames){
  return raw=>(raw||[]).filter(f=>f&&typeof f==='object').map(f=>{
    const out={type,p:parseInt(f.p,10),word:AUDIT_NFC(f.word),before:AUDIT_NFC(f.before),after:AUDIT_NFC(f.after),reason:f.reason};
    (extraFieldNames||[]).forEach(name=>{out[name]=f[name];});
    return out;
  });
}
// Ánh xạ fix của job "sót dịch": model chỉ trả {id,after}; "before"/"p" lấy từ candidate do code quét
// (nguyên văn chính xác, không phụ thuộc model chép lại). Báo rõ các mục CHẮC CHẮN sót (CJK) mà model bỏ.
function mapAuditUntranslatedFixes(cands){
  const byId=new Map(cands.map(c=>[c.id,c]));
  return raw=>{
    const out=[],seen=new Set();
    (raw||[]).forEach(f=>{
      const c=f&&byId.get(parseInt(f.id,10));
      if(!c||seen.has(c.id))return;
      seen.add(c.id);
      out.push({type:'sot_dich',p:c.p,before:c.text,after:AUDIT_NFC(f.after),_cand:true,_kind:c.kind,reason:c.kind==='cjk'?'dịch chữ Hán còn sót':'dịch câu tiếng Anh còn sót'});
    });
    const missed=cands.filter(c=>c.kind==='cjk'&&!seen.has(c.id));
    if(missed.length)console.log(`[Luồng 3][Soát] Model bỏ qua ${missed.length}/${cands.filter(c=>c.kind==='cjk').length} đoạn CHẮC CHẮN còn chữ Hán (không trả về bản dịch): ${missed.map(c=>`"${c.text.slice(0,40)}..."`).join(' | ')}`);
    return out;
  };
}

// Job "sót dịch": candidate do code cắt theo cửa sổ ±CJK_CONTEXT_WINDOW ký tự nên hay bắt đầu/kết thúc GIỮA câu; model
// thường "tốt bụng" trả luôn cả đoạn (kèm nhãn "[12]" + phần câu đứng trước/sau mục) thay vì chỉ bản dịch của mục.
// Vì code chỉ thay ĐÚNG đoạn "before" bằng "after" nên phần chép thừa bị LẶP (câu đứng trước/sau xuất hiện 2 lần, nhãn
// "[12]" lọt vào truyện). Hàm này gỡ: (1) nhãn "[số]" đầu; (2) phần "after" mở đầu bằng đúng chữ đang đứng TRƯỚC chỗ
// thay trong đoạn; (3) phần "after" kết thúc bằng đúng chữ đang đứng SAU chỗ thay. Chỉ gỡ khi trùng nguyên văn >= 12 ký tự.
function trimEchoedContext(after,prefix,suffix){
  const MIN=12;
  let a=String(after||'').replace(/^\s*\[\d{1,4}\]\s*/,'');
  const p=String(prefix||'').replace(/\s+$/,'');
  for(let k=Math.min(p.length,a.length);k>=MIN;k--){
    if(a.startsWith(p.slice(p.length-k))){a=a.slice(k).replace(/^\s+/,'');break;}
  }
  const sf=String(suffix||'').replace(/^\s+/,'');
  for(let k=Math.min(sf.length,a.length);k>=MIN;k--){
    if(a.endsWith(sf.slice(0,k))){a=a.slice(0,a.length-k).replace(/\s+$/,'');break;}
  }
  return a;
}
// Áp dụng fixes vào văn bản. Nếu fix có "p" hợp lệ: chỉ tìm "before" TRONG ĐOẠN p (chỉ cần duy nhất trong
// đoạn đó -> ít bị bỏ oan hơn nhiều so với đòi duy nhất trong cả chương). Không có "p"/không tìm thấy
// trong đoạn p thì rơi về cách cũ (applyAddressFixes: khớp DUY NHẤT 1 lần trong cả chương). Khớp >1 lần
// trong đoạn (mơ hồ) thì bỏ qua, không đoán.
function applyAuditFixes(text,fixes){
  let out=text,applied=0,skipped=0;
  for(const fx of (fixes||[])){
    const before=(fx.before||'').trim();
    const after=typeof fx.after==='string'?fx.after.replace(/\s*[\r\n]+\s*/g,' ').trim():'';
    if(!before||!after){skipped++;continue;}
    if(before===after)continue;
    const lines=out.split('\n');
    let lineIdx=-1;
    if(Number.isInteger(fx.p)&&fx.p>=1){
      let n=0;
      for(let i=0;i<lines.length;i++){if(lines[i].trim()){n++;if(n===fx.p){lineIdx=i;break;}}}
    }
    if(lineIdx>=0){
      const line=lines[lineIdx];
      const pos=findMatchPositions(line,before,!/\s/.test(before));
      let idx=-1,matchLen=before.length;
      if(pos.length===1){idx=pos[0];}
      else if(pos.length===0){
        const re=buildLooseWhitespaceRegex(before);
        const ms=re?[...line.matchAll(re)]:[];
        if(ms.length===1){idx=ms[0].index;matchLen=ms[0][0].length;}
      }else{
        console.log(`[Luồng 3] Bỏ qua 1 gợi ý (${fx.type}): "before" khớp ${pos.length} lần trong đoạn [${fx.p}] — không đủ chắc để chọn chỗ sửa: "${before.slice(0,60)}"`);
        skipped++;continue;
      }
      if(idx>=0){
        let afterUse=after;
        if(fx._cand){ // sot_dich: gỡ phần model chép thừa (nhãn [n], câu trước/sau mục) rồi chặn bản dịch dài bất thường
          afterUse=trimEchoedContext(after,line.slice(0,idx),line.slice(idx+matchLen));
          if(afterUse!==after)console.log(`[Luồng 3] sot_dich đoạn ${fx.p}: model trả thừa ngữ cảnh/nhãn đoạn, đã gỡ trước khi chèn: "${after.slice(0,60)}..." -> "${afterUse.slice(0,60)}..."`);
          if(!afterUse||afterUse===before){skipped++;continue;}
          if(afterUse.length>matchLen*2.2+40){
            console.log(`[Luồng 3] Bỏ qua 1 gợi ý sot_dich đoạn ${fx.p}: bản dịch dài bất thường so với đoạn gốc (${afterUse.length} so với ${matchLen} ký tự) — nghi model viết lại cả đoạn, không chèn để tránh lặp câu`);
            skipped++;continue;
          }
        }
        const newLine=line.slice(0,idx)+afterUse+line.slice(idx+matchLen);
        if(newLine.trim()){
          lines[lineIdx]=newLine;out=lines.join('\n');applied++;
          console.log(`[Luồng 3] Đã sửa (${fx.type}, đoạn ${fx.p}): "${before}" -> "${afterUse}"${fx.reason?` (${fx.reason})`:''}`);
          continue;
        }
      }
    }
    const r=applyAddressFixes(out,[{...fx,before,after}]);
    out=r.text;applied+=r.applied;skipped+=r.skipped;
  }
  return{text:out,applied,skipped};
}

// Hàm chính (giữ nguyên tên + chữ ký để nơi gọi ở translate.js không phải sửa): gọi sau khi 1 chương đã
// dịch xong, chạy theo 2 công tắc getAuditAddrOn()/getAuditSpellOn() (độc lập với công tắc "Cập nhật quan hệ
// nhân vật" — xem isAuditEnabled()). Không bao giờ throw, luôn trả về ít nhất bản dịch gốc.
// "appearedChars": chỉ còn dùng để chuyển tiếp cho tone-audit.js (nếu có nạp); job xưng hô thoại (genre_tone) ở file này
// giờ để AI tự phán đoán theo thể loại/chỉ dẫn, không đưa danh sách nhân vật/giới tính/tuổi vào prompt nữa.
// Bộ lọc cơ học TỐI GIẢN cho fix xưng hô (genre_tone) — AI tự phán đoán, code chỉ chặn các fix tự mâu thuẫn.
// ===== CHỈ ĐỔI ĐẠI TỪ NHÂN XƯNG TRUNG TÍNH, TRONG LỜI THOẠI (job genre_tone) =====
// Lỗi thực tế: model "sửa" lão phu -> bản tôn (đổi địa vị), lão tử -> ta, và sửa cả câu tường thuật (ông lão -> hắn) dù prompt
// đã cấm. Không tin prompt: chặn cơ học. (1) mọi từ BỊ BỎ và mọi từ ĐƯA VÀO phải thuộc tập đại từ nhân xưng trung tính dưới
// đây (chức danh/địa vị/tự xưng đặc biệt đều ngoài tập -> fix bị loại); (2) chỗ bị sửa phải nằm trong lời thoại.
// Muốn cho phép thêm đại từ nào (VD huynh/muội/đệ/tỷ) thì thêm vào tập này.
const AUDIT_NEUTRAL_PRONOUN_WORDS=new Set(['tôi','ta','tao','tớ','mình','ngươi','mi','mày','cậu','bạn','anh','chị','em','cô','chúng','bọn','tụi','các']);
function _auditWords(str){
  return String(str||'').normalize('NFC').toLowerCase().split(/\s+/).map(w=>w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu,'')).filter(Boolean);
}
// Trả {ok,why}. Hiệu giữa 2 đa tập từ: removed = có ở before mà không còn ở after; added = ngược lại.
function checkNeutralPronounSwap(before,after){
  const b=_auditWords(before),a=_auditWords(after);
  const cnt=arr=>{const m=new Map();arr.forEach(w=>m.set(w,(m.get(w)||0)+1));return m;};
  const mb=cnt(b),ma=cnt(a),removed=[],added=[];
  mb.forEach((n,w)=>{const d=n-(ma.get(w)||0);for(let i=0;i<d;i++)removed.push(w);});
  ma.forEach((n,w)=>{const d=n-(mb.get(w)||0);for(let i=0;i<d;i++)added.push(w);});
  if(!removed.length||!added.length)return{ok:false,why:'không phải phép đổi đại từ này sang đại từ khác (chỉ thêm/bớt từ)'};
  const bad=removed.concat(added).filter(w=>!AUDIT_NEUTRAL_PRONOUN_WORDS.has(w));
  if(bad.length)return{ok:false,why:`từ bị đổi/đưa vào không phải đại từ nhân xưng trung tính (${[...new Set(bad)].join(', ')})`};
  return{ok:true};
}
// Chỗ "before" có nằm trong lời THOẠI của đoạn fx.p không? true/false; null = không xác định được (không chặn).
// Nhận: “ ” (curly), " " (thẳng, đếm chẵn lẻ), hoặc dòng thoại mở bằng gạch đầu dòng (— – -; mỗi gạch đảo trong/ngoài thoại).
// [4a] Tách phần quyết định ra hàm thuần để test được: idx = vị trí KÝ TỰ cần kiểm trong para.
// Trả true = idx nằm trong lời thoại, false = tường thuật.
function _auditIdxInDialogue(para,idx){
  const pre=para.slice(0,idx);
  if(/[“”]/.test(para)){
    const open=(pre.match(/“/g)||[]).length,close=(pre.match(/”/g)||[]).length;
    return open>close;
  }
  if(/[\"«»]/.test(para)&&!/^\s*[—–-]/.test(para)){
    const q=(pre.match(/\"/g)||[]).length;
    if(/[\"]/.test(para))return q%2===1;
  }
  if(/^\s*[—–-]/.test(para)){
    const dashes=(pre.match(/(?:^|\s)[—–-](?=\s|$)/g)||[]).length;
    return dashes%2===1;
  }
  return false;   // không có dấu hiệu lời thoại nào -> là tường thuật
}
function auditSpanInDialogue(text,fx){
  const para=auditParaText(text,fx&&fx.p);
  if(para===null)return null;
  const before=String(fx.before||'').trim();
  const base=para.indexOf(before);
  if(base<0)return null;
  // [4a] Lỗi cũ: kiểm tại ĐẦU "before", nhưng "before" thường bắt đầu CHÍNH BẰNG dấu mở thoại ("Anh định...)
  // nên dấu đó không được đếm vào phần trước -> câu thoại bị coi là tường thuật. Nay kiểm tại đúng chữ bị sửa
  // (fx.word) nếu có; không có thì kiểm sau cụm dấu ngoặc/gạch ở đầu "before".
  let off=-1;
  const w=String(fx.word||'').trim();
  if(w){
    const i=before.toLowerCase().indexOf(w.toLowerCase());
    if(i>=0)off=i;
  }
  if(off<0){
    const lead=before.match(/^(?:[“”\"«»]|[—–-](?=\s)|\s)+/);
    off=lead?lead[0].length:0;
  }
  return _auditIdxInDialogue(para,base+off);
}
// ===== GIỮ GIỌNG THÔ/SUỒNG SÃ (tao/mày) TRONG TRUYỆN KHÔNG PHẢI CỔ TRANG (job genre_tone) =====
// Lỗi thực tế: truyện đô thị, lời thoại côn đồ/thù địch "Nhóc con, tao cảnh cáo mày..." bị Luồng 3 đổi thành tôi/cậu
// (mất giọng, và chương khác lại giữ nguyên nên không nhất quán). tao/mày là xưng hô HỢP LỆ của hệ hiện đại/phương Tây
// (cùng sắc thái với tôi/cậu thì prompt cũng không đủ chặn), nên chặn cơ học: fix làm GIẢM số lần tao/mày thì bị loại.
// Chỉ cổ trang (co_trang) mới cho đổi, vì tao/mày ở đó mới là lệch hệ. Hệ chưa xác định (null) cũng giữ nguyên.
const AUDIT_ROUGH_REGISTER_WORDS=new Set(['tao','mày']);
function checkRoughRegisterKept(before,after,genreSystem){
  if(genreSystem==='co_trang')return{ok:true};
  const rough=arr=>arr.filter(w=>AUDIT_ROUGH_REGISTER_WORDS.has(w)).length;
  const b=rough(_auditWords(before)),a=rough(_auditWords(after));
  if(b>a)return{ok:false,why:'tao/mày là giọng thô hợp lệ của truyện không phải cổ trang — không đổi sang tôi/cậu'};
  return{ok:true};
}
function validateToneFixes(text,fixes,genreSystem){
  const v=validateAuditFixes(text,fixes);
  const dropped=v.dropped.slice();
  const kept=v.kept.filter(fx=>{
    // Chốt "word": từ AI tự khai là sai phải THỰC SỰ nằm trong "before" — không thì fix tự mâu thuẫn.
    if(fx.type==='genre_tone'&&fx.word&&!fx.before.toLowerCase().includes(fx.word.toLowerCase())){
      dropped.push({fx,why:`"word" (${fx.word}) không nằm trong "before" — fix tự mâu thuẫn`});
      return false;
    }
    if(fx.type==='genre_tone'){
      const nv=checkNeutralPronounSwap(fx.before,fx.after);
      if(!nv.ok){
        dropped.push({fx,why:`genre_tone chỉ được đổi đại từ nhân xưng trung tính (tôi/ta, ngươi/cậu...), không đổi chức danh/địa vị: ${nv.why}`});
        return false;
      }
      const rr=checkRoughRegisterKept(fx.before,fx.after,genreSystem);
      if(!rr.ok){
        dropped.push({fx,why:`genre_tone: ${rr.why}`});
        return false;
      }
      if(auditSpanInDialogue(text,fx)===false){
        dropped.push({fx,why:'genre_tone: chỗ bị sửa nằm ngoài lời thoại (tường thuật) — không đụng'});
        return false;
      }
    }
    return true;
  });
  return {kept,dropped};
}

async function auditChapterAddressing(chapterIdx,translatedText,appearedChars){
  try{
    // 4.3: hậu kiểm tên lệch bằng khoảng cách chỉnh sửa — thuần cơ học, không tốn API, chạy cả khi tắt các mục soát AI.
    translatedText=postcheckNameDrift(chapterIdx,translatedText);
    // Chỉ chạy khi bật ít nhất 1 trong 2 mục "Soát xưng hô bản dịch"/"Kiểm tra chính tả" (menu Cài đặt);
    // KHÔNG còn phụ thuộc mục "Phân tích nhân vật" (getCharMemOn) như trước.
    if(!isAuditEnabled())return translatedText;
    const doAddr=getAuditAddrOn(),doSpell=getAuditSpellOn();
    if(!translatedText||!translatedText.trim())return translatedText;
    const keys=getKeys();
    if(!keys.length)return translatedText;
    const promptGuidance=await getMainPromptGuidance();
    const paras=buildAuditParagraphs(translatedText);
    if(!paras.length)return translatedText;
    console.log(`[Luồng 3] Soát chất lượng bản dịch chương ${chNum(chapterIdx)} (${paras.length} đoạn) — xưng hô: ${doAddr?'BẬT':'tắt'}, chính tả: ${doSpell?'BẬT':'tắt'}...`);

    // Phân model: DeepSeek chỉ có 1 model nên cả 2 làn dùng chung; Gemini: CẢ 2 làn (xưng hô / sót dịch-âm tiết-chính tả)
    // dùng model B = 3.5 flash lite, dự phòng A = 3.1.
    const isDeepseek=getProvider()==='deepseek';
    const hardModels=isDeepseek?[getModel(),getModel()]:[CHAR_MODEL_B,CHAR_MODEL_A];
    // sót dịch / âm tiết nghi lỗi / chính tả đều dùng model B (dự phòng A) — tên biến giữ nguyên cho retryLeftoverCjk.
    const lightModels=isDeepseek?[getModel(),getModel()]:[CHAR_MODEL_B,CHAR_MODEL_A];
    const chunks=chunkAuditParagraphs(paras,AUDIT_CHUNK_MAX_CHARS);
    const spellChunks=chunkAuditParagraphs(paras,AUDIT_SPELL_CHUNK_MAX_CHARS);
    // Mọi lối ra của hàm đều đi qua finish() để còn chữ Hán sót thì được thử lại (xem retryLeftoverCjk).
    // Có tone-audit.js: chạy bước soát sắc thái xưng hô Ở CUỐI (sau sửa sót dịch/chính tả/hán sót).
    const finish=async t=>{
      const fixed=await retryLeftoverCjk(t,keys,lightModels,promptGuidance);
      return (doAddr&&typeof tnAuditChapter==='function')
        ?await tnAuditChapter(fixed,{keys,chapterIdx,promptGuidance,appearedChars})
        :fixed;
    };

    // ----- LÀN NẶNG: xưng hô lời thoại -----
    // (tắt "Soát xưng hô bản dịch" => làn nặng để trống, không tốn lượt gọi nào)
    // (Job "đại từ tường thuật" — narration_pronoun (lẫn tông) — đã BỎ khỏi làn này, và job "giới tính
    // đại từ ngôi 3" — gender_pronoun — cũng đã BỎ khỏi làn này, xem AUDIT_FIX_TYPES.)
    const hardCalls=[];
    // Có nạp tone-audit.js => bước soát xưng hô do tnAuditChapter đảm nhận (gọi ở finish bên dưới), bỏ job genre_tone cũ.
    const useToneAudit=typeof tnAuditChapter==='function';
    if(doAddr&&!useToneAudit){
      chunks.forEach((chunk,i)=>hardCalls.push({
        keys,models:hardModels,tag:`xưng hô thoại${chunks.length>1?` (phần ${i+1}/${chunks.length})`:''}`,
        prompt:buildAuditReadPrompt(buildDialogueToneTask(getAddrPreset(promptGuidance)),AUDIT_BEFORE_RULE_PHRASE,promptGuidance,chunk,i,chunks.length),
        mapFixes:mapAuditReadFixes('genre_tone')
      }));
    }

    // ----- LÀN NHẸ -----
    // BẬT "Kiểm tra chính tả": MỖI chunk (≤ AUDIT_SPELL_CHUNK_MAX_CHARS ký tự) chỉ tốn 1 lượt gọi, làm luôn cả 3 việc: chính tả +
    // âm tiết nghi lỗi + dịch câu sót — code vẫn quét cơ học như cũ rồi nhét các mục thuộc đúng chunk vào chung prompt.
    // TẮT "Kiểm tra chính tả": sót dịch vẫn chạy riêng như cũ (gom AUDIT_UNTRANSLATED_BATCH câu/lượt), không có âm tiết.
    const lightCalls=[];
    const cands=collectUntranslatedCandidates(paras);
    const nCjk=cands.filter(c=>c.kind==='cjk').length;
    if(cands.length)console.log(`[Luồng 3] Quét cơ học phát hiện ${nCjk} đoạn còn sót chữ Hán + ${cands.length-nCjk} đoạn nghi sót tiếng Anh — đưa thẳng cho AI dịch, không đợi AI tự tìm.`);
    if(doSpell){
      // [Mục 7.2] Máy quét âm tiết (thuộc mục "Kiểm tra chính tả"): cụm có âm tiết không thể tồn tại -> đưa thẳng cho AI, không đợi AI tự tìm.
      const sylCands=collectSyllableCandidates(paras);
      if(sylCands.length)console.log(`[Luồng 3][Âm tiết] Quét cơ học phát hiện ${sylCands.length} cụm có âm tiết không hợp lệ: ${sylCands.map(c=>c.words.join('/')).join(', ')} — đưa thẳng cho AI soát.`);
      spellChunks.forEach((chunk,i)=>{
        const inChunk=new Set(chunk.map(p=>p.n));
        const uc=cands.filter(c=>inChunk.has(c.p)),sc=sylCands.filter(c=>inChunk.has(c.p));
        lightCalls.push({
          keys,models:lightModels,full:true,
          tag:`chính tả${sc.length?' + âm tiết':''}${uc.length?' + sót dịch':''}${spellChunks.length>1?` (phần ${i+1}/${spellChunks.length})`:''}`,
          prompt:buildSpellMergedPrompt(chunk,i,spellChunks.length,uc,sc,promptGuidance),
          mapFixes:raw=>[].concat(
            mapAuditReadFixes('chinh_ta')(raw&&raw.fixes),
            mapAuditUntranslatedFixes(uc)(raw&&raw.untranslated),
            mapAuditSyllableFixes(sc)(raw&&raw.syllables)
          )
        });
      });
    }else{
      for(let i=0;i<cands.length;i+=AUDIT_UNTRANSLATED_BATCH){
        const batch=cands.slice(i,i+AUDIT_UNTRANSLATED_BATCH);
        const nb=Math.ceil(cands.length/AUDIT_UNTRANSLATED_BATCH);
        lightCalls.push({
          keys,models:lightModels,tag:`sót dịch${nb>1?` (lượt ${i/AUDIT_UNTRANSLATED_BATCH+1}/${nb})`:''}`,
          prompt:buildUntranslatedPrompt(batch,promptGuidance),
          mapFixes:mapAuditUntranslatedFixes(batch)
        });
      }
    }

    // 2 làn chạy SONG SONG với nhau.
    const [hard,light]=await Promise.all([runAuditLane('3.5 · xưng hô',hardCalls),runAuditLane('3.5 · sót dịch/âm tiết/chính tả',lightCalls)]);
    const failedCalls=hard.failed+light.failed,totalCalls=hard.total+light.total;
    // Thứ tự áp dụng: sửa cả câu (sót dịch) trước, các sửa từ lẻ (chính tả) sau cùng để ít va chạm nhau.
    const ORDER={sot_dich:0,genre_tone:1,chinh_ta:2};
    const all=hard.fixes.concat(light.fixes).sort((a,b)=>(ORDER[a.type]??9)-(ORDER[b.type]??9));
    if(!all.length){
      console.log(`[Luồng 3] Soát chất lượng bản dịch: không có lỗi nào${failedCalls?` (⚠ nhưng ${failedCalls}/${totalCalls} lượt soát bị lỗi nên chưa soát trọn vẹn)`:''}.`);
      return await finish(translatedText);
    }
    // Lọc bằng kiểm tra cơ học TRƯỚC khi áp dụng (không tin "reason" AI viết) — xem validateToneFixes.
    {
      const _byType={};all.forEach(x=>{_byType[x.type]=(_byType[x.type]||0)+1;});
      const _pr=getAddrPreset(promptGuidance);
      console.log(`[Luồng 3][Đề xuất] ch.${_chn(chapterIdx)}: AI đề xuất ${all.length} fix (${Object.entries(_byType).map(([k,v])=>k+':'+v).join(', ')}) — preset: ${_l1PresetTag(_pr)}, hệ dùng để chặn: ${detectAddrGenreSystem(promptGuidance)||'không ép hệ'}`);
      all.filter(x=>x.type==='genre_tone').forEach(x=>console.log(`[Luồng 3][Đề xuất] genre_tone: "${(x.before||'').slice(0,80)}" -> "${(x.after||'').slice(0,80)}"${x.word?` (từ bị coi lệch: ${x.word})`:''}${x.reason?` — lý do AI: ${x.reason}`:''}`));
    }
    const vt=validateToneFixes(translatedText,all,detectAddrGenreSystem(promptGuidance));
    const dropped=vt.dropped;
    const keptGrouped=vt.kept;
    dropped.forEach(d=>console.log(`[Luồng 3] Loại 1 fix [${d.fx.type||'?'}] (kiểm tra cơ học, không tin "reason" AI viết): ${d.why} — "${(d.fx.before||'').slice(0,60)}..."${d.fx.after!==undefined?` -> "${String(d.fx.after).slice(0,60)}..."`:''}`));
    if(!keptGrouped.length){
      console.log('[Luồng 3] Soát chất lượng bản dịch: toàn bộ fix đề xuất đều bị loại ở bước kiểm tra cơ học.');
      return await finish(translatedText);
    }
    const {text,applied,skipped}=applyAuditFixes(translatedText,keptGrouped);
    console.log(`[Luồng 3] Soát chất lượng bản dịch hoàn tất: sửa ${applied}, bỏ qua ${skipped} (không khớp/mơ hồ), loại ${dropped.length} (kiểm tra cơ học)${failedCalls?`, ⚠ ${failedCalls}/${totalCalls} lượt soát bị lỗi`:''}.`);
    return await finish(text);
  }catch(e){
    console.log('[Luồng 3] Soát chất lượng bản dịch lỗi — giữ nguyên bản dịch:',e.message||e);
    return translatedText;
  }
}

// [Mục 8a] Sửa JSON hỏng cơ học TRƯỚC khi tốn 1 lượt retry API (~30s). Không dùng AI.
// Các lỗi xử lý: (1) chuỗi giá trị bị cụt kiểu "reason":"}}],"merges":... (thiếu dấu nháy đóng ngay sau nháy mở);
// (2) ký tự điều khiển thô (xuống dòng) nằm trong chuỗi; (3) dấu phẩy thừa trước } ]; (4) } ] đóng thừa/không khớp ngăn xếp (bỏ);
// (5) bị cắt cụt giữa chừng (hết chuỗi khi còn mở chuỗi/ngoặc). Trả {text, quotes, closed, commas, truncated}.
function repairJson(text){
  const res={text:'',quotes:0,closed:0,commas:0,truncated:false,leftover:false};
  if(text==null)return res;
  let t=String(text).trim();
  t=t.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
  const first=t.search(/[\{\[]/);
  if(first<0)return res;
  if(first>0)t=t.slice(first); // bỏ lời dẫn trước JSON
  const stack=[];
  let o='',inStr=false,esc=false,strIsValue=false,strLen=0,rootDone=false;
  const lastSig=()=>{for(let k=o.length-1;k>=0;k--){const c=o[k];if(c!==' '&&c!=='\n'&&c!=='\t'&&c!=='\r')return c;}return '';};
  const dropTrailingComma=()=>{const n=o.replace(/,\s*$/,'');if(n.length!==o.length){o=n;res.commas++;}};
  let i=0;
  for(;i<t.length&&!rootDone;i++){
    const c=t[i];
    if(inStr){
      if(esc){o+=c;esc=false;strLen++;continue;}
      if(c==='\\'){o+=c;esc=true;strLen++;continue;}
      // Chuỗi GIÁ TRỊ vừa mở mà ký tự đầu đã là } hoặc ] -> model quên nháy đóng: chèn " rồi xử lý ký tự này như cấu trúc.
      if(strIsValue&&strLen===0&&(c==='}'||c===']')){o+='"';inStr=false;res.quotes++;i--;continue;}
      if(c==='"'){o+=c;inStr=false;continue;}
      if(c==='\n'){o+='\\n';strLen++;continue;}
      if(c==='\r'){strLen++;continue;}
      if(c==='\t'){o+='\\t';strLen++;continue;}
      o+=c;strLen++;continue;
    }
    if(c==='"'){inStr=true;strLen=0;strIsValue=lastSig()===':';o+=c;continue;}
    if(c==='{'||c==='['){stack.push(c);o+=c;continue;}
    if(c==='}'||c===']'){
      const want=c==='}'?'{':'[';
      if(!stack.length)continue; // thừa ngoặc đóng
      if(stack.indexOf(want)<0)continue; // không có ngoặc mở tương ứng -> bỏ
      if(stack[stack.length-1]!==want)continue; // không khớp đỉnh ngăn xếp -> coi là ngoặc đóng thừa, bỏ (không tự đóng tầng trong để khỏi cắt mất phần sau)
      stack.pop();dropTrailingComma();o+=c;
      if(!stack.length)rootDone=true; // bỏ phần rác sau JSON
      continue;
    }
    o+=c;
  }
  if(rootDone&&t.slice(i).trim())res.leftover=true; // còn nội dung sau khi JSON đã đóng -> nghi mất dữ liệu
  if(inStr){o+='"';inStr=false;res.quotes++;res.truncated=true;}
  if(!rootDone&&stack.length){
    res.truncated=true;
    dropTrailingComma();
    if(lastSig()===':'){o+='null';}
    else if(stack[stack.length-1]==='{'&&/[\{,]\s*"(?:[^"\\]|\\.)*"\s*$/.test(o)){o+=':null';} // khoá cụt không có giá trị
    while(stack.length){const top=stack.pop();dropTrailingComma();o+=top==='{'?'}':']';res.closed++;}
  }
  res.text=o;
  return res;
}
// [Mục 8a.3] Kết quả đã sửa chỉ được dùng nếu đúng cấu trúc; sai thì coi như không sửa được (nơi gọi sẽ retry như cũ).
function _repairedJsonLooksValid(p){
  if(!p||typeof p!=='object'||Array.isArray(p))return false;
  if('characters' in p){
    if(!Array.isArray(p.characters)||!p.characters.length)return false;
    return p.characters.every(c=>c&&typeof c==='object'&&typeof c.name==='string'&&c.name.trim());
  }
  if('items' in p)return Array.isArray(p.items);
  if('fixes' in p)return Array.isArray(p.fixes);
  return true;
}

function parseCharacterJSON(text){
  if(!text)return null;
  let t=text.trim();
  t=t.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'');
  try{return JSON.parse(t);}catch(e){}
  // Cố gắng "sửa" bằng cách trích xuất khối {...} đầu tiên
  const m=t.match(/\{[\s\S]*\}/);
  if(m){
    try{return JSON.parse(m[0]);}catch(e){}
  }
  // [Mục 8a.2] Tầng cuối: sửa JSON hỏng cơ học thay vì để nơi gọi tốn 1 lượt retry API.
  try{
    const rp=repairJson(t);
    if(rp.text&&rp.leftover){
      console.log('[Phân tích chương] JSON hỏng còn nội dung sau khi đóng gốc — không sửa tự động để khỏi mất dữ liệu.');
    }else if(rp.text){
      const p=JSON.parse(rp.text);
      if(_repairedJsonLooksValid(p)){
        console.log(`[Phân tích chương] JSON đã được sửa tự động (chèn ${rp.quotes} dấu nháy / đóng ${rp.closed} ngoặc${rp.commas?` / bỏ ${rp.commas} dấu phẩy thừa`:''}${rp.truncated?' / ⚠ bị cắt cụt, phần cuối có thể thiếu':''})`);
        return p;
      }
      console.log('[Phân tích chương] JSON sửa xong nhưng sai cấu trúc — coi như không sửa được.');
    }
  }catch(e){}
  return null;
}

// Merge kết quả AI vào S.characters theo nguyên tắc USER DATA > EXISTING DATA > NEW AI DATA.
// Trả về mảng character objects (từ S.characters) tương ứng các nhân vật xuất hiện trong chương.
// preferGender (tuỳ chọn): khi có NHIỀU record trùng tên (2 người khác nhau cùng tên), ưu tiên record cùng
// giới tính rồi tới record chưa rõ giới tính — thay vì luôn trả record đầu tiên (thường là người kia).
function findCharByNameOrAlias(name,preferGender){
  const n=name.trim().toLowerCase();
  const matches=S.characters.filter(x=>x.name.trim().toLowerCase()===n||
    (x.aliases||[]).some(a=>a.trim().toLowerCase()===n));
  if(matches.length>1){
    const pg=normalizeGenderValue(preferGender);
    if(pg!=='Chưa rõ'){
      const same=matches.find(x=>normalizeGenderValue(x.gender)===pg);
      if(same)return same;
      const unk=matches.find(x=>normalizeGenderValue(x.gender)==='Chưa rõ');
      if(unk)return unk;
    }
  }
  return matches[0];
}
// Giống findCharByNameOrAlias nhưng trả về TẤT CẢ record khớp (theo bất kỳ tên nào trong "names"),
// dùng ở mergeAnalysisResults để tránh bug cũ: findCharByNameOrAlias chỉ trả về record ĐẦU TIÊN tìm
// thấy, nên khi 1 nhân vật đã bị tách thành nhiều record trùng tên (VD "X", "X (2)", "X (3)" do lỗi
// nameCollision trước đây), mọi lần phân tích chương SAU chỉ so được với record đầu tiên — nếu
// relationship chương này lệch với record đó (dù khớp đúng 1 trong các record khác), code lại tưởng
// là người thứ 2 rồi tách thêm 1 record nữa, lặp vô hạn.
// opts.skipRoleAlias: alias là CHỨC DANH CHUNG (role_label: "tiểu nhị", "chưởng quầy"...) không được làm khoá khớp —
// nhiều người dùng chung 1 chức danh, khớp qua nó sẽ gộp nhầm 2 người khác nhau vào 1 record. Khớp theo name vẫn giữ nguyên.
function findAllCharsByNameOrAlias(names,opts){
  const ns=(names||[]).filter(Boolean).map(s=>String(s).trim().toLowerCase());
  if(!ns.length)return [];
  const skipRole=!!(opts&&opts.skipRoleAlias);
  return S.characters.filter(x=>{
    if(ns.includes(x.name.trim().toLowerCase()))return true;
    const roleKeys=skipRole?new Set(charRoleLabelList(x).map(r=>String(r).trim().toLowerCase())):null;
    return (x.aliases||[]).some(a=>{
      const k=a.trim().toLowerCase();
      return ns.includes(k)&&!(roleKeys&&roleKeys.has(k));
    });
  });
}
// Sinh 1 tên KHÔNG trùng với bất kỳ nhân vật nào đang có (so cả "name" lẫn "aliases", không phân biệt
// hoa/thường) — dùng khi mergeAnalysisResults phát hiện "nghi collision tên" (xem nameCollision ở đó):
// 1 nhân vật MỚI (thực ra là người khác) trùng đúng tên/nhãn chung chung với 1 record đã có (VD cả
// "mẹ của MC" và "mẹ của kẻ địch" đều chỉ được model gọi là "Mẹ"), nên không thể tạo record mới với
// nguyên tên đó — findCharByNameOrAlias ở lần phân tích SAU sẽ lại khớp nhầm về 1 trong 2 record.
// Thêm hậu tố " (2)", " (3)"... cho tới khi không còn trùng.
function uniqueCharName(base){
  const taken=n=>S.characters.some(x=>x.name.trim().toLowerCase()===n.trim().toLowerCase()||
    (x.aliases||[]).some(a=>a.trim().toLowerCase()===n.trim().toLowerCase()));
  if(!taken(base))return base;
  let i=2;
  while(taken(`${base} (${i})`))i++;
  return `${base} (${i})`;
}
// Giống uniqueCharName nhưng bỏ qua chính record `self` (dùng khi ĐỔI TÊN 1 record đã có: tên mới chỉ cần không trùng
// record KHÁC). Trùng thì thêm hậu tố " (2)", " (3)"... — hậu tố chỉ là khoá nội bộ, displayCharName() bỏ đi khi dịch.
function uniqueCharNameFor(base,self){
  const k=n=>String(n||'').trim().toLowerCase();
  const taken=n=>S.characters.some(x=>x!==self&&(k(x.name)===k(n)||(x.aliases||[]).some(a=>k(a)===k(n))));
  if(!taken(base))return base;
  let i=2;
  while(taken(`${base} (${i})`))i++;
  return `${base} (${i})`;
}
// ===== TÊN GỐC KHÁC NHAU NHƯNG TÊN DỊCH TRÙNG =====
// Nhiều tên gốc khác nhau có thể phiên âm ra CÙNG 1 tên (李明/黎明 -> "Lê Minh"). mergeAnalysisResults khớp record theo TÊN
// DỊCH nên trước đây 2 người đó bị gộp làm 1 (tên gốc thứ 2 thành alias của người thứ nhất). Các hàm dưới đây là lưới CƠ HỌC
// (chỉ dựa dữ liệu kiểm được: tên gốc đã lưu của record vs tên gốc entry vừa trích), chạy khi giám khảo tên không có phán
// quyết "cùng người" tường minh (công tắc tắt, lỗi/timeout, hoặc giám khảo trả null).
// Các tên gốc của entry đủ tin cậy để so: là TÊN ĐỊNH DANH (không phải danh xưng chung/nhãn mô tả/biệt danh kiểu 小明, 老李, 李哥),
// nằm nguyên văn trong chương, và giám khảo (nếu có phán quyết) không xếp vào loại khác 'proper'.
function charmemEntryProperOrigs(f,srcText){
  if(!f)return [];
  if(f._judge&&f._judge.kind&&f._judge.kind!=='proper')return [];
  const text=typeof srcText==='string'?srcText:null;
  const ks=f._kinds;   // phân loại theo nghĩa của bước Kiểm tra lại: chuỗi không phải 'proper' không dùng để so/nối nhân vật
  return parseOrigNames(f.originalName).filter(o=>{
    if(ks){const kd=ks[normKey(String(o).normalize('NFC'))];if(kd&&kd!=='proper')return false;}
    if(o.length<2||isGenericAddressTerm(o)||isDescriptiveLabel(o)||inferFormKind(o)!=='name')return false;
    return text===null||judgeSnippets(text,o,1,0).length>0;
  });
}
// Tên gốc của entry có KHÁC HẲN tên gốc đã lưu của record x không (=> 2 người khác nhau dù tên dịch trùng)?
// Thà bỏ sót còn hơn tách nhầm 1 người thành 2, nên chỉ kết luận KHÁC khi chắc: x đã có tên gốc đáng tin của riêng nó; tên gốc
// entry không nằm trong tên/alias/tên gốc của x (nên không phải biệt danh/cách viết khác đã biết); và 2 bên không chứa nhau
// (李明 ⊂ 李明轩 có thể là tên ngắn/đầy đủ của cùng 1 người). Record đang là nhãn tạm hoặc tên còn chữ Hán thì bỏ qua —
// chúng có đường nâng cấp tên riêng.
function entryOrigDiffersFromRecord(f,x,srcText){
  if(!x||x.namePlaceholder||containsCJK(x.name))return false;
  const eo=charmemEntryProperOrigs(f,srcText);
  if(!eo.length)return false;
  const nk=v=>normKey(String(v||'').normalize('NFC'));
  const known=new Set([x.name,...(x.aliases||[]),...charOrigNameList(x),...(x.demotedOrig||[])].map(nk).filter(Boolean));
  if(eo.some(o=>known.has(nk(o))))return false;
  const xo=charOrigNameList(x).filter(o=>o.length>=2&&!isGenericAddressTerm(o)&&!isDescriptiveLabel(o)&&inferFormKind(o)==='name');
  if(!xo.length)return false;
  if(eo.some(o=>xo.some(q=>{const a=nk(o),b=nk(q);return a.includes(b)||b.includes(a);})))return false;
  return true;
}
// Lọc danh sách record ứng viên (khớp theo tên dịch) theo tên gốc. Trả {cands,changed}: nếu mọi ứng viên đều KHÁC tên gốc thì
// tìm record ĐÃ SỞ HỮU tên gốc này (VD "Lý Minh (2)" do lần trước tách ra, model quên hậu tố) để chương này không tách thêm
// "(3)", "(4)"...; không có thì cands rỗng (= người mới, nơi gọi đặt hậu tố cho tên).
function resolveCandsByOrigin(f,cands,srcText){
  const list=Array.isArray(cands)?cands:[];
  const kept=list.filter(x=>!entryOrigDiffersFromRecord(f,x,srcText));
  if(kept.length===list.length)return {cands:list,changed:false};
  if(kept.length)return {cands:kept,changed:true};
  const eo=charmemEntryProperOrigs(f,srcText);
  const owners=eo.length?findAllCharsByNameOrAlias(eo,{skipRoleAlias:true}).filter(x=>!list.includes(x)):[];
  return {cands:owners,changed:true};
}
// Các field mà 1 khi NGƯỜI DÙNG đã tự tay chỉnh sửa (source==='user') thì AI KHÔNG được tự động
// ghi đè nữa — chỉ "quan hệ nhân vật" và "xưng hô" 2 chiều. Gender/note vẫn để AI tự do cập nhật
// theo diễn biến truyện như trước (không thuộc danh sách khoá này).
// Mở khoá lại: người dùng XOÁ HẾT nội dung field đó trong modal (input rỗng) -> field về "Chưa rõ"
// và nguồn được reset về 'ai' ngay tại saveCharModal() -> curEmpty=true -> rơi vào nhánh điền tự do
// bên dưới như bình thường, không cần logic riêng ở đây.
const CHARMEM_USER_LOCK_FIELDS=['relationship','affinity','addrThemToMc','addrMcToThem','narrRef'];
// Số chương tối thiểu 1 nhân vật đã xuất hiện để bị coi là "dữ liệu ổn định" — từ ngưỡng này trở đi,
// 1 correction đơn lẻ không còn đủ để tự động ghi đè ngay (xem applyCharField).
const CHARMEM_EVIDENCE_ESTABLISHED_CHAPTERS=3;
// So sánh nhóm sắc thái CŨ (đang gắn với giá trị xưng hô đang lưu) và MỚI (chương vừa phân tích)
// để quyết định CỘNG DỒN hay THAY THẾ (xem applyCharField, nhánh isAddrField):
// - CÙNG nhóm (VD "ca ca" và "đại ca" đều "Thân mật") -> chỉ là biến thể khác của cùng 1 kiểu
//   xưng hô -> CỘNG DỒN, giữ lại cả 2.
// - KHÁC nhóm rõ ràng (VD "ngươi" Xa cách/Thù địch -> "ca ca" Thân mật) -> dấu hiệu quan hệ đã
//   thực sự đổi -> THAY THẾ hẳn, không giữ xưng hô cũ đã lỗi thời trong prompt gửi AI.
// Trả về true (cùng nhóm), false (khác nhóm), hoặc null (chưa đủ dữ liệu để so sánh -> mặc định
// an toàn hơn là CỘNG DỒN, tránh lỡ tay xoá mất 1 xưng hô vẫn còn đúng).
function addrToneSameGroup(oldTone,newTone){
  const o=(oldTone||'').trim(),n=(newTone||'').trim();
  if(!o||o==='Chưa rõ'||!n||n==='Chưa rõ')return null;
  return o===n;
}
// Trần số cặp xưng hô tối đa được phép cộng dồn cho 1 chiều (addrThemToMc hoặc addrMcToThem).
// Không giới hạn thì qua hàng trăm chương, 1 nhân vật có thể tích luỹ quá nhiều biến thể (VD
// "muội/ca ca, tiểu muội/đại ca, muội muội/ca, a muội/ca ca..."), khiến prompt dịch
// (buildCharacterContextText) rối và model dịch phải chọn giữa quá nhiều lựa chọn gần giống
// nhau — dễ chọn khác nhau giữa các chương, làm xưng hô kém nhất quán thay vì nhất quán hơn.
const CHARMEM_ADDR_MAX_CANDIDATES=5;
// Thêm 1 giá trị mới vào danh sách các cách xưng hô đang lưu (chuỗi cách nhau bởi dấu phẩy, xem
// splitAddrCandidates) — không thêm trùng (so khớp không phân biệt hoa/thường). Nếu sau khi thêm
// vượt quá CHARMEM_ADDR_MAX_CANDIDATES, bỏ bớt (các) cặp CŨ NHẤT ở đầu danh sách — cùng chiến lược
// "giữ thông tin gần đây nhất" như trimAiNote() bên dưới, vì cách xưng hô mới quan sát được thường
// phản ánh đúng diễn biến quan hệ hiện tại hơn cặp đã lưu từ rất lâu.
function addAddrCandidate(cur,newVal){
  const curList=splitAddrCandidates(cur);
  const curSet=curList.map(normAddrWord);
  // newVal cũng có thể tự nó là nhiều lựa chọn (VD AI trả về "muội/ca ca, tiểu muội/đại ca") —
  // thêm từng lựa chọn CHƯA CÓ vào danh sách, thay vì nhét nguyên cả cụm vào làm 1 mục.
  const toAdd=splitAddrCandidates(newVal).filter(v=>!curSet.includes(normAddrWord(v)));
  if(!toAdd.length)return cur;
  let combined=curList.concat(toAdd);
  if(combined.length>CHARMEM_ADDR_MAX_CANDIDATES){
    combined=combined.slice(combined.length-CHARMEM_ADDR_MAX_CANDIDATES);
  }
  return combined.join(', ');
}
// Cập nhật 1 field (gender/relationship/xưng hô) của nhân vật theo kết quả phân tích chương hiện tại:
//  1) Field đang trống/"Chưa rõ" -> điền luôn, đánh dấu nguồn 'ai'. (Bao gồm cả trường hợp người dùng
//     vừa xoá hết field bị khoá — vì lúc đó field đã được reset về rỗng + nguồn 'ai' từ saveCharModal.)
//  2) Field đã có giá trị: với gender/relationship, AI trả về giá trị GIỐNG HỆT -> không đổi gì; với
//     xưng hô (isAddrField), AI trả về giá trị đã CÓ SẴN trong danh sách nhiều-lựa-chọn -> cũng coi
//     như khớp, không đổi gì (chỉ huỷ gợi ý chờ duyệt cũ nếu có).
//  3) Field thuộc CHARMEM_USER_LOCK_FIELDS và đang do NGƯỜI DÙNG tự nhập (source==='user') -> AI
//     KHÔNG được tự ý ghi đè/xoá nữa. Nếu có "correction" (bằng chứng rõ ràng), chỉ lưu thành gợi ý
//     CHỜ DUYỆT (conflictField) để hiện banner trong modal sửa nhân vật, người dùng tự bấm "Áp dụng"/
//     "Bỏ qua"; nếu không có correction thì bỏ qua hoàn toàn, không nhắc gì.
//     NGOẠI LỆ riêng cho narrRef (xem nhánh field==='narrRef' bên trong): field này vẫn được AI tự
//     CỘNG DỒN thêm lựa chọn mới dù đã khoá, không cần qua banner — vì cộng dồn không xoá/thay gì cả.
//  4) Các trường hợp còn lại (field không bị khoá, hoặc đang do 'ai' tự đoán từ trước):
//     - AI trả về giá trị KHÁC nhưng KHÔNG kèm "correction" -> bỏ qua (nhiễu/suy luận yếu).
//     - AI trả về giá trị KHÁC và có "correction" -> ÁP DỤNG NGAY, không chờ duyệt (field này AI vẫn
//       đang tự quản lý, chưa có gì để "bảo vệ" khỏi bị ghi đè). Riêng field xưng hô (isAddrField):
//       thay vì ghi đè thẳng, so sánh nhóm sắc thái CŨ/MỚI (addrToneSameGroup) để quyết định CỘNG DỒN
//       thêm 1 cách gọi hợp lệ, hay THAY THẾ hẳn vì quan hệ đã thực sự đổi — xem addrToneSameGroup ở trên.
// ===== LOG CHẨN ĐOÁN Luồng 1 (chỉ ghi log, KHÔNG sửa dữ liệu) =====
// Cho thấy với mỗi nhân vật: AI đề xuất gì, đang lưu gì trước/sau, và preset thể loại sẽ coi từ nào là lệch hệ.
function _chn(i){try{return typeof chNum==='function'?chNum(i):i;}catch(e){return i;}}
function _l1Preset(){
  try{return getAddrPreset(getCachedPromptGuidanceSync());}catch(e){return null;}
}
function _l1PresetTag(r){
  if(!r)return 'không có preset (không lọc theo thể loại)';
  return `${r.path} [id=${r.id}, hệ=${r.family||'không ép hệ'}, nguồn=${r.source}]`;
}
function _l1WouldFlag(v,r){
  try{
    if(!v||!r||typeof AddrPresets==='undefined'||typeof AddrPresets.filterAddr!=='function')return [];
    return AddrPresets.filterAddr(v,r).dropped||[];
  }catch(e){return [];}
}
// Gộp log "AI không cung cấp": nhân vật mà CẢ 2 chiều đều Chưa rõ (và không có cặp lệch hệ cần cảnh báo) không in từng dòng nữa,
// chỉ gom tên vào buffer rồi in 1 dòng tóm tắt/chương (flushAddrUnknownSummary, gọi ngay trước dòng "Completed").
let _ADDR_UNKNOWN_BUF=[];
function flushAddrUnknownSummary(chapterIdx){
  try{
    if(!_ADDR_UNKNOWN_BUF.length)return;
    const names=_ADDR_UNKNOWN_BUF.slice();_ADDR_UNKNOWN_BUF=[];
    console.log(`[Luồng 1][Xưng hô] ch.${_chn(chapterIdx)}: ${names.length} nhân vật AI không cung cấp xưng hô (cả 2 chiều, giữ nguyên giá trị đang lưu): ${names.join(', ')}`);
  }catch(e){_ADDR_UNKNOWN_BUF=[];}
}
function logAddrTrace(c,name,chapterIdx,proposed,before,r){
  try{
    const dirs=[['addrThemToMc','họ→MC'],['addrMcToThem','MC→họ']];
    if(dirs.every(([k])=>isAddrUnknown(proposed[k]))&&!dirs.some(([k])=>_l1WouldFlag(c[k],r).length)){
      _ADDR_UNKNOWN_BUF.push(name);return;
    }
    dirs.forEach(([k,label])=>{
      const prop=proposed[k],bef=before[k],aft=c[k];
      const unknown=isAddrUnknown(prop);
      const flagged=_l1WouldFlag(prop,r);
      const storedFlag=_l1WouldFlag(aft,r);
      const stateWord=unknown?'AI không cung cấp':(aft===bef?'KHÔNG đổi':'ĐÃ GHI');
      console.log(`[Luồng 1][Xưng hô] ch.${_chn(chapterIdx)} ${name} ${label}: AI đề xuất="${prop}" | trước="${bef||''}" -> sau="${aft||''}" (${stateWord}, nguồn=${c.addrSource||'?'})`
        +(flagged.length?` | ⚠ đề xuất có cặp lệch hệ: ${flagged.join(', ')}`:'')
        +(storedFlag.length&&stateWord!=='AI không cung cấp'?` | ⚠ giá trị đang lưu có cặp lệch hệ: ${storedFlag.join(', ')}`:''));
    });
  }catch(e){}
}
function applyCharField(c,field,sourceField,conflictField,newVal,isCorrection,reason,charName,isRelationship,chapterIdx,isAddrField,newTone){
  // Field xưng hô (isAddrField): dùng isAddrUnknown để bắt cả trường hợp AI trả nguyên chuỗi kiểu
  // "Chưa rõ / Chưa rõ" (không chỉ đúng y hệt "Chưa rõ") — xem isAddrUnknown ở trên. Các field khác
  // (gender/relationship...) vẫn so sánh trực tiếp như cũ, vì chúng không dùng định dạng nhiều-lựa-chọn.
  if(isAddrField?isAddrUnknown(newVal):isUnknownVal(newVal))return; // chương này không cung cấp thông tin -> không đụng gì (không phân biệt hoa/thường)
  const cur=c[field];
  const curEmpty=isAddrField?isAddrUnknown(cur):(!cur||isUnknownVal(cur));
  if(curEmpty){
    c[field]=newVal;c[sourceField]='ai';
    // AI tự gán -> nếu user đã huỷ ngôi sao, không áp dụng ngay mà tính vào phiếu bầu tự khôi phục
    // (xem noteProtagonistSignal) thay vì chặn cứng vĩnh viễn.
    noteProtagonistSignal(c,isRelationship,newVal,chapterIdx);
    if(c.pendingCorr)delete c.pendingCorr[field];
    console.log(`[Luồng 1][Cập nhật] Updated: ${charName}.${field}`);
    return;
  }
  // isAddrField: so khớp theo TẬP HỢP lựa chọn (đã tách bởi splitAddrCandidates) ở CẢ 2 bên, thay
  // vì so nguyên cụm newVal (chưa tách) với từng lựa chọn đã tách của cur — cách so cũ khiến 1 giá
  // trị nhiều-lựa-chọn (VD cur="ta/ngươi, ta/ngài") không bao giờ khớp lại với chính nó khi AI trả
  // về y hệt, vì "ta/ngươi, ta/ngài" không bằng riêng "ta/ngươi" hay riêng "ta/ngài". Khớp khi mọi
  // lựa chọn AI đề xuất đều đã có sẵn trong danh sách đang lưu.
  const alreadyMatches=isAddrField
    ?(()=>{
        const newCands=splitAddrCandidates(newVal).map(normAddrWord);
        const curCands=splitAddrCandidates(cur).map(normAddrWord);
        return newCands.length>0&&newCands.every(v=>curCands.includes(v));
      })()
    :newVal===cur;
  if(alreadyMatches){
    if(c[conflictField]){c[conflictField]=null;} // nếu còn gợi ý cũ treo lại từ trước, được AI tái xác nhận -> huỷ đi
    if(c.pendingCorr)delete c.pendingCorr[field];
    // QUAN TRỌNG: đây là trường hợp PHỔ BIẾN NHẤT khi 1 nhân vật đã bị huỷ ngôi sao — field
    // "relationship" thường VẪN còn giữ nguyên text "Nhân vật chính" từ trước lúc bị huỷ (huỷ chỉ
    // đổi isProtagonist/protagonistDenied, không xoá relationship), nên AI đề xuất lại y hệt giá trị
    // đang lưu -> rơi vào đúng nhánh "khớp sẵn" này. Nếu thiếu dòng dưới, phiếu bầu tự khôi phục sẽ
    // không bao giờ được tính trong tình huống hay gặp nhất, khiến cơ chế tự khôi phục gần như vô dụng.
    noteProtagonistSignal(c,isRelationship,newVal,chapterIdx);
    return;
  }
  const userLocked=CHARMEM_USER_LOCK_FIELDS.includes(field)&&c[sourceField]==='user';
  if(userLocked){
    // narrRef: khác với relationship/addrThemToMc/addrMcToThem — field này thường xuyên có NHIỀU
    // lựa chọn hợp lệ cùng lúc (tuỳ góc nhìn/phe), nên dù user đã tự sửa/khoá, AI vẫn được tự CỘNG
    // DỒN thêm lựa chọn ngôi thứ 3 MỚI (khác hẳn cái user đã gõ) mà KHÔNG cần chờ duyệt qua banner —
    // vì cộng dồn không xoá/thay bất cứ thứ gì user đã ghi, nên không có rủi ro để phải "Áp dụng"/
    // "Bỏ qua". narrRefSource VẪN giữ nguyên 'user' sau khi cộng dồn, để field tiếp tục được coi là
    // "đã khoá" (bảo vệ khỏi bị AI XOÁ/THAY THẾ hẳn ở những lượt phân tích sau, dù vẫn còn được thêm).
    if(field==='narrRef'){
      const merged=addAddrCandidate(cur,newVal);
      if(merged!==cur){
        c[field]=merged;
        if(c[conflictField])c[conflictField]=null;
        console.log(`[Luồng 1][Cập nhật] Auto-merged (user-locked, cộng dồn không thay): ${charName}.${field} -> ${merged}`);
      }
      return;
    }
    if(isCorrection){
      c[conflictField]={value:newVal,reason:reason||''};
      console.log(`[Luồng 1][Cập nhật] Pending suggestion (user-locked, chờ duyệt): ${charName}.${field} -> ${newVal}`);
    } else {
      console.log(`[Luồng 1][Cập nhật] Skipped: ${charName}.${field} - người dùng đã tự chỉnh sửa, AI không tự động cập nhật nữa`);
    }
    return;
  }
  if(!isCorrection){
    console.log(`[Luồng 1][Cập nhật] Skipped: ${charName}.${field} - đã có dữ liệu, không đủ căn cứ để sửa`);
    return;
  }
  // Field không bị user khoá, có correction hợp lệ -> áp dụng NGAY bằng logic tính toán cộng dồn/
  // thay thế sẵn có (xem addrToneSameGroup bên dưới cho field xưng hô), không chờ user duyệt và
  // không cần bằng chứng lặp lại ở chương khác nữa — banner "chờ duyệt" giờ CHỈ dành riêng cho field
  // đã bị user tự khoá (xem nhánh userLocked ở trên), tránh làm phiền với những field AI vẫn đang tự
  // quản lý (trước đây phần "established" từng chặn lại + hiện banner ngay cả khi user chưa từng đụng
  // vào field, khiến banner xuất hiện quá thường xuyên một cách không cần thiết).
  const oldVal=cur;
  c._prevSrc=c[sourceField]||'';

  if(isAddrField){
    const sameTone=addrToneSameGroup(c.addrTone,newTone);
    if(sameTone===false){
      // Khác nhóm sắc thái rõ ràng -> quan hệ đã đổi thật -> THAY THẾ hẳn, bỏ xưng hô cũ đã lỗi thời
      c[field]=newVal;
    } else {
      // Cùng nhóm sắc thái, hoặc chưa đủ dữ liệu để so sánh (null) -> an toàn hơn là CỘNG DỒN
      c[field]=addAddrCandidate(cur,newVal);
    }
  } else {
    c[field]=newVal;
  }
  c[sourceField]='ai';c[conflictField]=null;
  // Tương tự nhánh curEmpty ở trên — dùng chung cơ chế phiếu bầu tự khôi phục.
  noteProtagonistSignal(c,isRelationship,newVal,chapterIdx);
  // [P3] Nhật ký correction: để khi Tách (splitAbsorbedUI) trả lại giá trị cũ nếu correction đến từ người bị ghép nhầm.
  if(!Array.isArray(c.corrLog))c.corrLog=[];
  c.corrLog.push({field,sourceField,old:oldVal,oldSource:c._prevSrc||'',val:c[field],chapter:Number.isFinite(+chapterIdx)?+chapterIdx:null,time:Date.now()});
  if(c.corrLog.length>40)c.corrLog=c.corrLog.slice(-40);
  delete c._prevSrc;
  console.log(`[Luồng 1][Cập nhật] Auto-corrected: ${charName}.${field} (${oldVal} -> ${c[field]})`);
  notifyCharCorrection(charName,field,oldVal,c[field],reason);
}
// SỔ ĐĂNG KÝ narrRef trong 1 ĐỢT phân tích (1 lần gọi mergeAnalysisResults, thường = 1 chương):
// key = giá trị narrRef đã chuẩn hoá (normAddrWord), value = id nhân vật ĐẦU TIÊN được gán giá trị
// đó trong đợt này. Mục đích: chặn bug "gán trùng narrRef cho 2 nhân vật khác nhau trong cùng 1
// đợt phân tích" — xảy ra khi model trích xuất nhầm lẫn 2 nhân vật (VD cả 2 đều được ai đó gọi là
// "chú" trong những đoạn khác nhau) và trả về CÙNG 1 giá trị narrRef cho cả 2 entry JSON. Vì
// applyCharField() ghi thẳng ngay khi field narrRef của nhân vật đang rỗng (không qua bước chờ
// duyệt), nếu không chặn ở đây thì cả 2 nhân vật sẽ lặng lẽ nhận cùng 1 narrRef sai — đúng triệu
// chứng "sửa/nhận narrRef ở 1 nhân vật thì nhân vật khác cũng bị đổi theo" mà người dùng gặp phải.
// Không chặn nếu giá trị đó đã thuộc về CHÍNH nhân vật đang xét (đang cộng dồn thêm cho chính họ).
// Bảng tra 1 số đại từ/cách gọi ngôi thứ 3 THÔNG DỤNG có sắc thái giới tính RÕ RÀNG trong tiếng Việt
// — đây CHÍNH LÀ loại từ mà narrRef được thiết kế để lưu (đại từ trung tính theo giới tính, có thể
// kèm vài biến thể thân mật/xa cách-thù địch nhẹ — xem buildCharExtractPrompt), không còn là trường
// hợp hiếm gặp như thiết kế cũ (trước đây narrRef chỉ lưu danh xưng kính ngữ/khinh miệt đặc biệt).
// Dùng để bắt ĐÚNG loại lỗi thực tế đã gặp: 1 giá trị narrRef mang nghĩa giới tính rõ ràng (VD "chú
// ấy") bị gán nhầm cho 1 nhân vật đã xác định là giới tính NGƯỢC LẠI (VD nhân vật Nữ) — do model
// trích xuất nhầm lẫn 2 nhân vật khác nhau trong chương.
// KHÔNG dùng để chặn việc nhiều nhân vật CÙNG giới tính dùng chung 1 đại từ phổ biến — VD rất nhiều
// nhân vật nam trong 1 chương đều được gọi là "hắn", nhiều nhân vật nữ đều được gọi là "nàng", đó là
// chuyện HOÀN TOÀN BÌNH THƯỜNG trong văn tường thuật, không phải dấu hiệu nhầm lẫn gì cả — nên các từ
// càng phổ biến/mơ hồ về giới tính (VD "y" dùng phiếm chỉ chung, không rõ hẳn nam/nữ) càng KHÔNG nên
// đưa vào bảng này để tránh chặn nhầm (bản trước dùng cách so trùng-giá-trị-trong-đợt đã mắc đúng
// lỗi này, nay bỏ đi) — chỉ những từ dưới đây mới đủ RÕ RÀNG về giới tính để dùng làm căn cứ chặn.
const CHARMEM_NARRREF_GENDER_HINTS={
  'hắn':'Nam','hắn ta':'Nam','gã':'Nam','gã ta':'Nam','gã đó':'Nam','lão':'Nam','lão ta':'Nam',
  'ông ta':'Nam','anh ta':'Nam','cậu ta':'Nam','chú ấy':'Nam','thằng đó':'Nam','tên đó':'Nam',
  'nàng':'Nữ','nàng ta':'Nữ','thị':'Nữ','ả':'Nữ','mụ':'Nữ','mụ ta':'Nữ','bà ta':'Nữ','cô ta':'Nữ',
  'chị ta':'Nữ','cô ấy':'Nữ','chị ấy':'Nữ','dì ấy':'Nữ','thím ấy':'Nữ','con nhỏ đó':'Nữ'
};
// Trả về 'Nam'/'Nữ' nếu candidate khớp CHÍNH XÁC (không phân biệt hoa/thường, đã chuẩn hoá) với 1 từ
// trong bảng trên, hoặc null nếu từ không nằm trong bảng (trung tính/không rõ giới tính) — null nghĩa
// là KHÔNG có ý kiến gì, không chặn.
function narrRefGenderHint(candidate){
  return CHARMEM_NARRREF_GENDER_HINTS[normAddrWord(candidate)]||null;
}
// Lọc bỏ khỏi narrRefRaw các lựa chọn nào có sắc thái giới tính RÕ RÀNG NGƯỢC với giới tính đã xác
// định (charGender) của chính nhân vật đang xét. Nếu charGender chưa rõ, không lọc gì (không có gì
// để đối chiếu). Chỉ lọc từng LỰA CHỌN cụ thể vi phạm, giữ nguyên các lựa chọn khác không vi phạm.
function filterNarrRefByGender(narrRefRaw,charGender){
  if(isNarrRefUnknown(narrRefRaw)||isUnknownVal(charGender))return narrRefRaw;
  const cands=splitAddrCandidates(narrRefRaw);
  const kept=[];
  cands.forEach(cand=>{
    const hint=narrRefGenderHint(cand);
    if(hint&&hint!==charGender){
      console.log(`[Luồng 1][Dọn narrRef] Bỏ qua narrRef "${cand}" vì mang sắc thái giới tính ${hint}, không khớp giới tính ${charGender} đã xác định của nhân vật — nghi AI nhầm lẫn 2 nhân vật.`);
      return;
    }
    kept.push(cand);
  });
  return kept.length?kept.join(', '):'Chưa rõ';
}
// Từ khoá đặc trưng cho CÂU MIÊU TẢ NGOẠI HÌNH/TRANG PHỤC (thay vì 1 đại từ ngôi 3 phiếm chỉ thật) —
// dùng để bắt lỗi narrRef bị lưu nhầm thành cả cụm miêu tả (VD "người mặc áo bào đen, khuôn mặt che
// kín") thay vì 1 đại từ ngắn gọn thật (VD "hắn", "tên đó", "con nhỏ đó"). Loại miêu tả này có 2
// vấn đề: (1) dài dòng, nếu bước dịch chọn lại nguyên văn cho lời tường thuật sau này sẽ gượng; (2)
// thường gắn với 1 THỜI ĐIỂM/TRẠNG THÁI CỤ THỂ (đang cải trang, đang bị thương...) nên lỗi thời ngay
// khi tình tiết đổi, nhưng vì narrRef chỉ CỘNG DỒN chứ không bao giờ tự thay/xoá (xem lý do ở
// mergeAnalysisResults bên dưới), nó sẽ tồn tại mãi trong danh sách nếu không lọc riêng.
const CHARMEM_NARRREF_DESCRIPTIVE_WORDS=[
  'mặc','khoác','đeo','trùm','choàng','diện', // hành động liên quan trang phục
  'khuôn mặt','gương mặt','mặt nạ','che mặt','bịt mặt','đôi mắt','ánh mắt','mái tóc','làn da',
  'bộ dạng','dáng người','dáng vẻ','thân hình','vóc dáng','trang phục','y phục','bộ áo','chiếc áo'
];
// Trần số TỪ tối đa cho 1 lựa chọn narrRef hợp lệ — 1 đại từ ngôi 3 phiếm chỉ thật (VD "hắn", "tên
// đó", "con nhỏ đó") hiếm khi quá 5 từ; câu miêu tả ngoại hình thường dài hơn hẳn.
// Cố tình để hơi rộng (5, không phải 2-3) để tránh lọc nhầm các cụm phiếm chỉ dài nhưng hợp lệ.
const CHARMEM_NARRREF_MAX_WORDS=5;
function isNarrRefDescriptivePhrase(cand){
  const t=(cand||'').trim();
  if(!t)return false;
  if(t.split(/\s+/).filter(Boolean).length>CHARMEM_NARRREF_MAX_WORDS)return true;
  const low=normAddrWord(t);
  return CHARMEM_NARRREF_DESCRIPTIVE_WORDS.some(kw=>low.includes(kw));
}
// Lọc bỏ khỏi narrRefRaw các lựa chọn là câu miêu tả ngoại hình/trang phục (xem
// isNarrRefDescriptivePhrase), chỉ giữ lại các lựa chọn còn lại là danh xưng/biệt hiệu thật. Dùng cả
// khi merge dữ liệu MỚI (chặn từ gốc, không cho lọt vào — xem mergeAnalysisResults) lẫn khi dọn dữ
// liệu CŨ đã lỡ lưu trước bản sửa này (xem cleanupDescriptiveNarrRef).
function stripDescriptivePhraseFromNarrRef(narrRefRaw){
  if(isNarrRefUnknown(narrRefRaw))return narrRefRaw;
  const cands=splitAddrCandidates(narrRefRaw);
  const kept=cands.filter(cand=>{
    if(isNarrRefDescriptivePhrase(cand)){
      console.log(`[Luồng 1][Dọn narrRef] Bỏ qua narrRef "${cand}" vì là câu miêu tả ngoại hình/trang phục, không phải đại từ ngôi 3 thật.`);
      return false;
    }
    return true;
  });
  return kept.length?kept.join(', '):'Chưa rõ';
}
// Dọn narrRef ĐANG LƯU của 1 nhân vật, loại các lựa chọn là câu miêu tả ngoại hình/trang phục (xem
// stripDescriptivePhraseFromNarrRef) — CHỈ áp dụng khi narrRefSource !== 'user' (người dùng đã tự
// gõ/khoá thì giữ nguyên, đúng nguyên tắc "user luôn được ưu tiên hơn ai" dùng nhất quán trong file
// này, xem cleanupUnknownAddrValues/cleanupLabelDuplicateFromExistingNarrRef). Gọi ở CẢ 2 nơi:
// (1) mergeAnalysisResults — soát lại MỖI KHI nhân vật được cập nhật qua 1 chương mới, để dọn ngay cả
// những giá trị đã lỡ lưu từ TRƯỚC bản sửa này, không chỉ chặn giá trị mới của riêng chương đang phân
// tích; (2) cleanupUnknownAddrValues — dọn 1 lượt toàn bộ dữ liệu cũ ngay khi tải truyện, để không
// phải đợi có chương mới mới được dọn.
function cleanupDescriptiveNarrRef(c){
  if(c.narrRefSource==='user')return false;
  if(!c.narrRef||isNarrRefUnknown(c.narrRef))return false;
  const stripped=stripDescriptivePhraseFromNarrRef(c.narrRef);
  const normalizedStripped=isNarrRefUnknown(stripped)?'':stripped;
  if(normalizedStripped!==c.narrRef){
    console.log(`[Luồng 1][Dọn narrRef] Dọn narrRef miêu tả ngoại hình/trang phục cho "${c.name}": "${c.narrRef}" -> "${normalizedStripped||'(rỗng)'}"`);
    c.narrRef=normalizedStripped;
    return true;
  }
  return false;
}
// ===== CHỐT CHẶN TUỔI KHI CẬP NHẬT RECORD CÓ SẴN =====
// Entry mới ghép vào record cũ theo tên, nhưng độ tuổi (statusCue) lệch từ 2 bậc trở lên (VD thiếu nữ -> trung niên) gần như chắc
// chắn là NGƯỜI KHÁC (VD AI gán người mẹ họ Hứa vào cô gái "Hứa Đình"). Khi đó bỏ qua toàn bộ cập nhật của entry này lên record đó.
// Không áp cho nhân vật chính (MC có thể lớn lên theo cốt truyện) và cho record người dùng đã khoá tuổi thì vẫn chặn (user sửa tuổi
// là muốn giữ nguyên, không phải muốn ghép người khác vào).
const CHARMEM_AGE_GUARD=true;
function ageBandOf(v){
  const i=charmemAgeBandIndex(v);
  return i===null?_ageBandOfLegacy(v):[0,0,1,1,2,3,3,4][i];
}
function _ageBandOfLegacy(v){
  const t=String(v||'').normalize('NFC').toLowerCase();
  if(!t)return null;
  if(/(trẻ em|nhi đồng|hài tử|trẻ nhỏ|em bé|thiếu nhi|ấu)/.test(t))return 0;
  if(/(thiếu niên|thiếu nữ|thanh thiếu|vị thành niên|thiếu)/.test(t))return 1;
  if(/(thanh niên|thanh xuân|trẻ tuổi|trẻ|đôi mươi)/.test(t))return 2;
  if(/(trung niên|tráng niên|trung tuổi|thiếu phụ)/.test(t))return 3;
  if(/(cao niên|lão|già|cao tuổi|bạc đầu|tuổi già)/.test(t))return 4;
  return null;
}
function ageBandConflict(existingCue,newCue){
  const a=ageBandOf(existingCue),b=ageBandOf(newCue);
  if(a===null||b===null)return false;
  return Math.abs(a-b)>=2;
}
function mergeAnalysisResults(found,chapterIdx,srcText){
  const appeared=[];
  console.log(`[Luồng 1][Preset] ch.${_chn(chapterIdx)}: ${_l1PresetTag(_l1Preset())} — ${(found||[]).length} nhân vật AI trả về.`);
  for(const f of found){
    const name=(f.name||'').trim();
    if(!name)continue;
    normalizeExtractedStandards(f);   // lưới thứ 2 (idempotent): ép độ tuổi/mối quan hệ về danh sách chuẩn
    const origName=(f.originalName||'').trim();
    const sinoAlias=(f.sinoAlias||'').trim();
    // Lấy TẤT CẢ record đã có cùng tên/alias (không chỉ record ĐẦU TIÊN như findCharByNameOrAlias —
    // xem findAllCharsByNameOrAlias để hiểu vì sao bug cũ tự tách vô hạn khi dữ liệu cũ đã lỡ có
    // nhiều record cùng gốc tên).
    // Khớp theo TÊN CHÍNH (name) THẮNG khớp qua originalName/sinoAlias: nếu "name" đã khớp record A thì chỉ
    // xét A; originalName/sinoAlias trùng alias của record B khác không được kéo entry này sang B (trước
    // đây nameCands gộp cả 2 kiểu khớp, "compatible" chỉ xét giới tính/quan hệ nên entry "A" bị ghép nhầm
    // vào B và "A" thành alias của B). Giá trị trùng B sẽ bị sanitize*Candidate loại vì thuộc nhân vật khác.
    const nameMatched=findAllCharsByNameOrAlias([name],{skipRoleAlias:true});
    // Khớp dự phòng qua originalName chỉ nhận record mà originalName nằm trong CHÍNH danh sách tên gốc của nó
    // (hoặc record đang là nhãn tạm / tên còn chữ Hán — ca nâng cấp hợp lệ). Một alias thường như nhãn chung
    // "大师兄" của B không đủ để ghép người mới "A" vào B. sinoAlias (phiên âm Hán Việt) vẫn khớp qua alias.
    const oKey=normKey(String(origName).normalize('NFC'));
    const viaFallback=findAllCharsByNameOrAlias([origName,sinoAlias],{skipRoleAlias:true}).filter(x=>{
      const viaOrig=oKey&&[x.name,...(x.aliases||[])].some(a=>normKey(String(a||'').normalize('NFC'))===oKey);
      if(!viaOrig)return true; // khớp nhờ sinoAlias
      return charOrigNameList(x).some(o=>normKey(String(o).normalize('NFC'))===oKey)||x.namePlaceholder||containsCJK(x.name)||
        (sinoAlias&&findAllCharsByNameOrAlias([sinoAlias],{skipRoleAlias:true}).includes(x));
    });
    let nameCands=nameMatched.length?nameMatched:viaFallback;
    // KHỚP THEO MÃ REF (AI nhận diện người theo mã, không theo tên). Mã hợp lệ -> record đó là ứng viên DUY NHẤT (các lưới cơ học
    // bên dưới — tên gốc, giới tính... — vẫn chạy để chặn AI nhầm mã). AI báo "new" -> bỏ các ứng viên CHỈ khớp qua alias
    // (không phải tên chính, không có tên gốc trùng); trùng đúng tên chính vẫn giữ như cũ (AI hay báo "new" sai cho người đã biết).
    let refPinned=false;
    if(f._refId){
      const t=(S.characters||[]).find(x=>x.id===f._refId);
      if(t){nameCands=[t];refPinned=true;}
    }else if(f._refNew&&nameCands.length){
      const nkR=normKey(String(name).normalize('NFC'));
      const eoR=[origName,sinoAlias].map(v=>normKey(String(v||'').normalize('NFC'))).filter(Boolean);
      const kept=nameCands.filter(x=>normKey(String(x.name).normalize('NFC'))===nkR||x.namePlaceholder||containsCJK(x.name)||
        charOrigNameList(x).some(o=>eoR.includes(normKey(String(o).normalize('NFC')))));
      if(kept.length!==nameCands.length){
        console.log(`[Luồng 1][Ref] \"${name}\" AI báo người MỚI; bỏ ứng viên chỉ khớp qua alias: ${nameCands.filter(x=>!kept.includes(x)).map(x=>`\"${x.name}\"`).join(', ')}.`);
        nameCands=kept;
      }
      if(kept.length)console.log(`[Luồng 1][Ref] \"${name}\" AI báo người MỚI nhưng trùng tên chính/tên gốc với ${kept.map(x=>`\"${x.name}\"`).join(', ')} -> giữ khớp như cũ.`);
    }
    // KIỂM TRA TÊN: giám khảo đã đọc đoạn trích và quyết định cùng người hay người MỚI (thay cho việc gộp mù theo chuỗi tên —
    // VD "tiểu nhị tiệm gạo" ở chương 3 và "tiểu nhị tiệm rượu" ở chương 40). Không có phán quyết (null/lỗi) -> gộp theo tên như cũ.
    let forceUniqueName=false;
    {
      const jv=f._judge;
      if(jv&&getNameJudgeOn()){
        if(jv.sameAs==='new'){
          if(nameCands.length){nameCands=[];forceUniqueName=true;
            console.log(`[Luồng 1][Kiểm tra tên] "${name}": giám khảo xác định là NGƯỜI KHÁC với record cũ -> tạo record riêng.`);}
        }else if(jv.sameAs){
          const t=(S.characters||[]).find(x=>x.id===jv.sameAs);
          if(t&&(jv.candIds||[]).includes(t.id))nameCands=[t];
        }
      }
    }
    // KIỂM TRA TÊN GỐC (cơ học, không cần giám khảo): tên dịch trùng nhưng tên gốc KHÁC HẲN tên gốc đã lưu -> người khác.
    // Bỏ qua khi giám khảo đã chỉ đích danh 1 record là cùng người (nó đã thấy cả tên gốc của ứng viên trong đoạn trích/payload).
    if(nameCands.length){
      const jvSame=!!(f._judge&&nameCands.length===1&&f._judge.sameAs===nameCands[0].id);
      if(!jvSame){
        const br=resolveCandsByOrigin(f,nameCands,srcText);
        if(br.changed){
          console.log(`[Luồng 1][Tên gốc] \"${name}\" (gốc \"${origName}\") trùng TÊN DỊCH với ${nameCands.map(x=>`\"${x.name}\" (gốc \"${charOrigNameList(x).join(', ')}\")`).join(', ')} nhưng TÊN GỐC khác hẳn -> ${br.cands.length?`ghép vào record đã sở hữu tên gốc này: \"${br.cands[0].name}\"`:'coi là NGƯỜI KHÁC, tạo record riêng (thêm hậu tố cho tên)'}.`);
          nameCands=br.cands;
          if(!nameCands.length)forceUniqueName=true;
        }
      }
    }
    // [Fix gộp nhầm] KHỚP CHỈ QUA ALIAS, KHÔNG ĐỐI CHIẾU ĐƯỢC TÊN GỐC: tên chính của entry KHÁC tên chính của mọi record ứng viên,
    // và entry không có tên gốc/phiên âm nào trùng tên gốc đã lưu của record đó -> không có bằng chứng cùng người (chỉ trùng 1 alias lỏng).
    // Ghép nhầm tốn hơn nhiều so với tách thừa: KHÔNG ghép, tạo record riêng (hậu tố " (2)"); proposeSameAsForAliasHolders (gọi sau
    // khi tạo record) ghi đề xuất nối 'suggested' cho người dùng duyệt. Bỏ qua khi giám khảo đã chỉ đích danh record đó là cùng người,
    // hoặc record đang là nhãn tạm / tên còn chữ Hán (ca nâng cấp hợp lệ).
    if(nameCands.length&&!forceUniqueName&&!refPinned&&CHARMEM_SPLIT_UNVERIFIED_ALIAS){
      const jvSame2=!!(f._judge&&f._judge.sameAs&&f._judge.sameAs!=='new'&&nameCands.some(x=>x.id===f._judge.sameAs));
      if(!jvSame2){
        const nk=normKey(String(name).normalize('NFC'));
        const entryOrigs=[origName,sinoAlias].map(v=>normKey(String(v||'').normalize('NFC'))).filter(Boolean);
        const weakOnly=nameCands.every(x=>{
          if(normKey(String(x.name).normalize('NFC'))===nk)return false;
          if(x.namePlaceholder||containsCJK(x.name))return false;
          const xo=charOrigNameList(x).map(o=>normKey(String(o).normalize('NFC')));
          if(entryOrigs.some(k=>xo.includes(k)))return false;
          return true;
        });
        if(weakOnly){
          console.log(`[Luồng 1][Khớp alias lỏng] \"${name}\" chỉ khớp qua alias của ${nameCands.map(x=>`\"${x.name}\"`).join(', ')} và không đối chiếu được tên gốc -> KHÔNG ghép, tạo record riêng + đề xuất nối.`);
          nameCands=[];forceUniqueName=true;
        }
      }
    }
    // Log MỖI entry: khớp bằng gì (ref / tên chính / alias nào / tên gốc) để người dùng báo lỗi là truy được ngay.
    try{
      const nkL=normKey(String(name).normalize('NFC'));
      const via=nameCands.map(x=>{
        if(normKey(String(x.name).normalize('NFC'))===nkL)return `tên chính \"${x.name}\"`;
        const al=(x.aliases||[]).find(a=>normKey(String(a).normalize('NFC'))===nkL);
        return al?`alias \"${al}\" của \"${x.name}\"`:`tên gốc/phiên âm của \"${x.name}\"`;
      });
      const refTag=refPinned?`ref ${f.ref} -> `:(f._refNew?'ref=new; ':(f._refBad?`ref lỗi (${f.ref}); `:''));
      console.log(`[Luồng 1][Khớp] ch.${_chn(chapterIdx)} \"${name}\"${origName?` (gốc \"${origName}\")`:''}: ${refTag}${nameCands.length?'khớp '+via.join(' + '):(forceUniqueName?'tạo record riêng (bị chặn ghép)':'không khớp record nào -> người mới')}`);
    }catch(e){}
    // TỰ GỘP khi giám khảo khẳng định CÙNG NGƯỜI nhưng 2 record đã bị tách từ trước: record A còn tên chữ Hán (VD "假警察") và
    // record B đã mang đúng tên dịch của entry này (VD "Giả Cảnh Sát"). Nếu không gộp, nhánh "Fixed untranslated name" bên dưới đổi
    // tên A thành "Giả Cảnh Sát (2)" (vì tên đã thuộc B) -> 2 record trùng tồn tại vĩnh viễn, lặp lại với mọi nhân vật mang nhãn vai trò.
    // Chỉ gộp khi: giám khảo chỉ đích danh A (không phải suy đoán của code), tên không do người dùng khoá, qua lưới giới tính/quan hệ,
    // và cặp chưa từng bị từ chối. Giữ B (tên đã dịch) làm đích; tên chữ Hán của A thành alias qua mergeCharacterInto.
    if(f._judge&&f._judge.sameAs&&f._judge.sameAs!=='new'&&nameCands.length===1&&containsCJK(nameCands[0].name)&&!containsCJK(name)){
      const A=nameCands[0];
      const B=findAllCharsByNameOrAlias([name]).find(x=>x!==A);
      // [G+H] chốt chặn chung; strict:false vì giám khảo đã ĐỌC đoạn trích (cooccur cũ có thể là 2 record trùng tên dịch cần gộp), vẫn chặn userlock + giới hạn mỗi chương
      const _gk=(B&&A.nameSource!=='user'&&B.nameSource!=='user'&&!isMergePairRejected(A.id,B.id))?autoMergeGuard(A,B,{strict:false}):'x';
      if(_gk==='cap'||_gk==='userlock')autoMergeDemote(A,B,_gk,'giam-khao');
      // [Fix gộp nhầm] Giám khảo nói cùng người nhưng code không đối chiếu được tên gốc (không có tên gốc chung) -> chỉ đề xuất, không tự gộp.
      let _origOk=true;
      if(B&&!_gk){
        const _nk=v=>normKey(String(v||'').normalize('NFC'));
        const oA=[...charOrigNameList(A),A.name].map(_nk).filter(Boolean),oB=charOrigNameList(B).map(_nk).filter(Boolean);
        _origOk=oA.some(k=>oB.includes(k));
        if(!_origOk){
          autoMergeDemote(A,B,'policy','giam-khao');
          console.log(`[Luồng 1][Gộp trùng] Giám khảo nói \"${A.name}\" và \"${B.name}\" cùng người nhưng không đối chiếu được tên gốc -> chỉ đề xuất.`);
        }
      }
      if(B&&_origOk&&A.nameSource!=='user'&&B.nameSource!=='user'&&!isMergePairRejected(A.id,B.id)&&!_gk){
        console.log(`[Luồng 1][Gộp trùng] Giám khảo xác định \"${A.name}\" và \"${B.name}\" là cùng người -> tự gộp thay vì đổi tên thành \"(2)\".`);
        mergeCharacterInto(A,B,{auto:true,path:'giam-khao',reason:'Giám khảo xác định cùng người (2 record trùng tên dịch)'});
        nameCands=[B];
        for(let i=appeared.length-1;i>=0;i--){if(appeared[i]===A)appeared.splice(i,1);}   // A đã bị xoá khỏi S.characters
      }
    }
    const frCheck=(f.relationship||'').normalize('NFC').trim();
    const frDefined=frCheck&&frCheck!=='Chưa rõ';
    // ĐÃ BỎ nhánh "nghi collision tên" (tách record mới khi relationship lệch chuỗi) — lưới cơ học
    // này vốn chỉ nhắm 1 ca hẹp (2 người khác nhau cùng bị gán 1 nhãn chung chung, VD "Mẹ") nhưng vì
    // so === chuỗi relationship (vốn là free text AI tự viết lại mỗi chương, không phải giá trị cố
    // định) nên bắt nhầm hàng loạt ca chỉ diễn đạt khác nhau của CÙNG 1 người, tự tách thành
    // "Tên (2)", "Tên (3)"... AI trích xuất (buildCharExtractPrompt) đã được gửi kèm toàn bộ danh
    // sách nhân vật đã biết (tên/alias/gender/relationship — xem "known" ở trên) nên đã có đủ ngữ
    // cảnh để tự quyết định 1 tên trùng có thực sự là người khác hay không; nếu AI vẫn cố tình dùng
    // lại đúng 1 tên/alias đã có cho 1 người thực sự khác, coi đó là AI đã đưa ra phán đoán (dù có
    // thể sai) và chấp nhận ghép chung — có thể sửa lại bằng tay sau. Ưu tiên ghép vào record khớp
    // ĐÚNG relationship (nếu có) để giữ dữ liệu chính xác nhất khi
    // nhiều record cùng tên tồn tại (dữ liệu cũ từ trước bản sửa này), không thì lấy record đầu tiên.
    //
    // QUY TẮC MỚI (giới tính): 2 record cùng tên/alias nhưng KHÁC GIỚI TÍNH (đã xác định cả 2 bên) là 2
    // NGƯỜI KHÁC NHAU — không ghép vào nhau dù trùng tên (trước đây nameCands[0] bị ghép bất chấp giới
    // tính: note/addrTone/xưng hô của người kia đổ hết vào record này). Giới tính là giá trị RỜI RẠC
    // (Nam/Nữ) nên khác với relationship (free text) ở trên — không có nguy cơ tách vô hạn do diễn đạt
    // khác nhau. Ngoại lệ: model khai correction.gender=true (đính chính giới tính, VD nữ giả nam) -> vẫn
    // là CÙNG người, giữ nguyên luồng cũ. Giới tính chỉ được dùng để tách khi ĐÁNG TIN: model không tự khai
    // "suy đoán" và không tự mâu thuẫn với narrRef/xưng hô trong cùng entry.
    const corr=(f.correction&&typeof f.correction==='object')?f.correction:{};
    let fg=normalizeGenderValue(f.gender);
    const _nonHuman=(f.isHuman===false);   // không phải người -> không cần giới tính
    if(_nonHuman&&fg!=='Chưa rõ'){console.log(`[Luồng 1][Giới tính] Bỏ giới tính "${fg}" của "${name}": model khai không phải người (isHuman=false).`);fg='Chưa rõ';}
    let hintSrc='';let hintCand='';   // [Mục 2] giá trị genderHint đề xuất từ entry "suy đoán" của chương này
    const gEvid=(f.genderEvidence||'').toString().normalize('NFC').trim().toLowerCase();
    if(!corr.gender&&fg!=='Chưa rõ'){
      if(gEvid==='suy đoán'||gEvid==='ngoại hình'||gEvid==='danh xưng'||gEvid==='tên'){
        // [Mục 2.2] Không còn xoá sạch: gender ở lại 'Chưa rõ' (không dùng tách/gộp) nhưng giá trị suy đoán được giữ làm genderHint,
        // trừ khi tự mâu thuẫn với narrRef/xưng hô cùng entry (khi đó bỏ hẳn). Log được phát trong applyGenderHint (chỉ khi hint đổi).
        const gc0=genderHintConflicts(f,fg);
        const kg0=gc0.length?{gender:''}:genderFromKinship(f);
        if(kg0.gender===fg){
          // Model khai "suy đoán" nhưng nhãn/quan hệ là từ chỉ quan hệ chỉ giới rõ ràng, khớp giới đã khai -> không cần coi là suy đoán.
          console.log(`[Luồng 1][Giới tính] Giữ giới tính "${fg}" của "${name}": từ chỉ quan hệ "${kg0.label}" (không phải tên riêng).`);
        }else{
          if(gc0.length){
            console.log(`[Luồng 1][Giới tính] Bỏ hẳn (mâu thuẫn): "${fg}" của "${name}" (suy đoán) tự mâu thuẫn với ${gc0.join(', ')} trong cùng entry.`);
          }else{
            const _tq0=(gEvid==='tên')?{g:'',tier:0}:charmemQuoteTier(f,fg,srcText);
            if(_tq0.g===fg&&_tq0.tier>=1&&charmemQuoteInSource(f.genderQuote,srcText)){hintCand=fg;hintSrc=charmemTierSrc(_tq0.tier);}
            else{hintCand=fg;hintSrc='name';console.log(`[Luồng 1][Giới tính] Nhãn bậc 4 (tên gốc, ~20%) "${fg}" cho "${name}" (khai ${gEvid||'suy đoán'}${gEvid==='tên'?'':', câu trích không kiểm được'}).`);}
          }
          fg='Chưa rõ';
        }
      }else{
        const gc=genderHintConflicts(f,fg);
        if(gc.length){
          console.log(`[Luồng 1][Giới tính] Bỏ giới tính "${fg}" của "${name}": tự mâu thuẫn với ${gc.join(', ')} trong cùng entry.`);
          fg='Chưa rõ';
        }
        // Giới tính LẦN ĐẦU được lưu (chưa record ứng viên nào có đúng giới tính này) phải có genderQuote kiểm được trong chương.
        // Nhân vật đã được lưu cùng giới tính từ trước thì không phải chứng minh lại mỗi chương.
        if(fg!=='Chưa rõ'&&!nameCands.some(x=>normalizeGenderValue(x.gender)===fg)){
          const gv=verifyGenderQuote(f,fg,srcText);
          const _tq=charmemQuoteTier(f,fg,srcText);
          if(gv.ok&&_tq.g===fg&&_tq.tier>=2){
            // câu trích chỉ là NGOẠI HÌNH/DANH XƯNG (mức 2-3), không phải đại từ ngôi 3 -> chỉ gắn nhãn suy đoán, chưa khoá
            hintCand=fg;hintSrc=charmemTierSrc(_tq.tier);
            console.log(`[Luồng 1][Giới tính] Hạ "${fg}" của "${name}" xuống nhãn suy đoán (${hintSrc}): câu trích không có đại từ ngôi 3.`);
            fg='Chưa rõ';
          }else if(!gv.ok){
            // Dự phòng: câu trích hỏng vì lý do hình thức (không phải chỉ giới NGƯỢC) -> thử đếm đại từ 他/她 sau tên trong chương.
            const gp=/lệch với/.test(gv.why)?{gender:'',why:'câu trích chỉ giới ngược'}:genderFromPronouns(f,fg,srcText);
            const kg=gp.gender===fg?{gender:''}:genderFromKinship(f);
            if(gp.gender===fg){
              console.log(`[Luồng 1][Giới tính] Giữ giới tính "${fg}" của "${name}": ${gv.why}; bù bằng đại từ sau tên "${gp.name}" (cùng giới ×${gp.own}, ngược giới ×${gp.opp}).`);
            }else if(kg.gender===fg){
              // Nhãn/quan hệ là TỪ CHỈ QUAN HỆ (Cha của X, Mẫu thân của X, Đại ca...) -> giới tính chắc chắn, không phải "tên nghe giống nam/nữ".
              console.log(`[Luồng 1][Giới tính] Giữ giới tính "${fg}" của "${name}": ${gv.why}; bù bằng từ chỉ quan hệ "${kg.label}".`);
            }else{
              if(_tq.g===fg&&_tq.tier>=1&&charmemQuoteInSource(f.genderQuote,srcText)){
                hintCand=fg;hintSrc=charmemTierSrc(_tq.tier);
                console.log(`[Luồng 1][Giới tính] Hạ "${fg}" của "${name}" xuống nhãn suy đoán (${hintSrc}): ${gv.why}.`);
              }else if(!/lệch với/.test(gv.why)&&!((gp.opp||0)>(gp.own||0))){
                hintCand=fg;hintSrc='name';
                console.log(`[Luồng 1][Giới tính] Hạ "${fg}" của "${name}" xuống bậc 4 (tên gốc, ~20%): ${gv.why}.`);
              }else{
                console.log(`[Luồng 1][Giới tính] Bỏ giới tính "${fg}" của "${name}": ${gv.why}${gp.why?'; đại từ: '+gp.why:''} — mâu thuẫn với bằng chứng trong chương.`);
              }
              fg='Chưa rõ';
            }
          }
        }
      }
    }
    // Giới tính từ nhãn có chữ chỉ giới (眼鏡女...): chỉ khi chưa có giới tính (kể cả ở record trùng tên) và nhãn có mô tả đi kèm xác nhận.
    if(!_nonHuman&&!corr.gender&&fg==='Chưa rõ'&&!nameCands.some(x=>normalizeGenderValue(x.gender)!=='Chưa rõ')){
      const lg=genderFromLabel(f,srcText);
      if(lg.gender){
        console.log(`[Luồng 1][Giới tính] Lấy giới tính "${lg.gender}" của "${name}" từ nhãn "${lg.label}" + mô tả đi kèm (${lg.basis}).`);
        fg=lg.gender;
      }else if(lg.why){
        console.log(`[Luồng 1][Giới tính] Không lấy giới tính từ nhãn "${lg.label}" của "${name}": ${lg.why}.`);
      }
    }
    // Model để "Chưa rõ" nhưng nhãn/quan hệ là từ chỉ quan hệ chỉ giới rõ ràng: lấy giới tính từ đó (không mâu thuẫn narrRef/xưng hô, không ngược giới đã khai).
    if(!_nonHuman&&!corr.gender&&fg==='Chưa rõ'&&!nameCands.some(x=>normalizeGenderValue(x.gender)!=='Chưa rõ')){
      const kg=genderFromKinship(f);
      const declaredG=normalizeGenderValue(f.gender);
      if(kg.gender&&(declaredG==='Chưa rõ'||declaredG===kg.gender)&&!genderHintConflicts(f,kg.gender).length){
        console.log(`[Luồng 1][Giới tính] Lấy giới tính "${kg.gender}" của "${name}" từ từ chỉ quan hệ "${kg.label}".`);
        fg=kg.gender;
      }else if(kg.why){
        console.log(`[Luồng 1][Giới tính] Không lấy giới tính từ từ chỉ quan hệ của "${name}": ${kg.why}.`);
      }
    }
    // Vẫn "Chưa rõ": thử bằng chứng DƯƠNG từ xưng hô trực tiếp + narrRef (genderFromAddrNarr), cần cả 2 nguồn cùng giới.
    if(!_nonHuman&&!corr.gender&&fg==='Chưa rõ'&&!nameCands.some(x=>normalizeGenderValue(x.gender)!=='Chưa rõ')){
      const ag=genderFromAddrNarr(f);
      const declaredG2=normalizeGenderValue(f.gender);
      if(ag.gender&&(declaredG2==='Chưa rõ'||declaredG2===ag.gender)){
        console.log(`[Luồng 1][Giới tính] Lấy giới tính "${ag.gender}" của "${name}" từ ${ag.label}.`);
        fg=ag.gender;
      }else if(ag.why){
        console.log(`[Luồng 1][Giới tính] Không lấy giới tính từ xưng hô/narrRef của "${name}": ${ag.why}.`);
      }
    }
    let c=null;
    if(nameCands.length){
      const fgKnown=fg!=='Chưa rõ';
      // [Fix gộp nhầm] Khác giới tính đã xác định (Nam/Nữ) = chắc chắn 2 người, luôn tách. Cờ correction.gender (AI tự khai đính chính)
      // chỉ được bỏ qua lưới khi AI GHIM ĐÚNG MÃ record này (refPinned): AI báo người MỚI mà lại đòi đính chính giới tính là tự mâu thuẫn.
      const corrBypass=!!corr.gender&&refPinned;
      if(corr.gender&&!refPinned&&fgKnown&&nameCands.some(x=>{const g=normalizeGenderValue(x.gender);return g!=='Chưa rõ'&&g!==fg;}))
        console.log(`[Luồng 1][Giới tính] \"${name}\" khai đính chính giới tính nhưng không ghim mã record cũ -> không bỏ qua lưới giới tính.`);
      const compatible=nameCands.filter(x=>corrBypass||!fgKnown||normalizeGenderValue(x.gender)==='Chưa rõ'||normalizeGenderValue(x.gender)===fg);
      if(compatible.length){
        // Ưu tiên: cùng giới tính (2 điểm) > cùng relationship (1 điểm) > record đầu tiên.
        const score=x=>(fgKnown&&normalizeGenderValue(x.gender)===fg?2:0)+
          (frDefined&&(x.relationship||'').normalize('NFC').trim()===frCheck?1:0);
        c=compatible.reduce((best,x)=>score(x)>score(best)?x:best,compatible[0]);
      }else{
        console.log(`[Luồng 1][Tạo/Sửa nhân vật] "${name}" (${fg}) trùng tên với ${nameCands.map(x=>`"${x.name}" (${normalizeGenderValue(x.gender)})`).join(', ')} nhưng KHÁC giới tính -> coi là NGƯỜI KHÁC, tạo record riêng.`);
        // "phiếu chờ" đổi giới tính (detectAddrSuspicion) tích trên record kia là do nhầm người này với họ.
        nameCands.forEach(x=>{if(x.pendingCorr)delete x.pendingCorr.gender;});
      }
    }
    if(c&&CHARMEM_AGE_GUARD&&!isCharProtagonist(c)&&ageBandConflict(c.statusCue,f.statusCue)){
      console.log(`[Luồng 1][Chốt chặn tuổi] Bỏ qua entry \"${name}\" (tuổi \"${f.statusCue}\") vì lệch hẳn tuổi của record \"${c.name}\" (\"${c.statusCue}\") — nhiều khả năng là người khác cùng họ/tên; không cập nhật gì lên record này.`);
      continue;
    }
    if(!c){
      // Nhân vật hoàn toàn mới: dùng tên đã dịch làm tên chính (chỉ dịch 1 lần duy nhất ở đây),
      // lưu tên gốc/tên thô (nếu có) và phiên âm Hán Việt (nếu tên chính là tên phương Tây được
      // phục hồi từ chữ Hán phiên âm — xem "sinoAlias" trong buildCharExtractPrompt) vào aliases,
      // để các chương sau nhận đúng dù bản gốc/bản dịch cũ còn dùng cách viết nào trong 2 cách đó.
      // "!c" nghĩa là: (1) tên/alias này chưa từng xuất hiện trong S.characters (nameCands rỗng), HOẶC
      // (2) mọi record trùng tên đều KHÁC GIỚI TÍNH với entry này (người khác cùng tên — xem quy tắc giới
      // tính ở đoạn khai báo "c" phía trên). Ca (2) cố ý GIỮ NGUYÊN tên (không thêm hậu tố "(2)"): các lần
      // sau AI vẫn dùng đúng tên đã biết, và mergeAnalysisResults phân biệt 2 record theo giới tính.
      const finalName=forceUniqueName?uniqueCharName(name):name;
      // origName và sinoAlias qua cùng bộ lọc với origName: giá trị bị loại (bịa, cách gọi chung, trùng người khác)
      // KHÔNG được lọt vào aliases bằng cửa sau.
      const newIsLabel=f.isPlaceholderName===true||looksLikePlaceholderCharName(finalName);
      const origOkInit=(origName&&origName.toLowerCase()!==finalName.toLowerCase())?sanitizeOrigNameCandidate(origName,null,srcText,nameCands,{allowLabel:newIsLabel}):'';
      const sinoOkInit=sinoAlias?sanitizeAliasCandidate(sinoAlias,null,nameCands):'';
      const aliasesInit=[...parseOrigNames(origOkInit),sinoOkInit].filter((v,i,arr)=>v&&v.toLowerCase()!==finalName.toLowerCase()&&arr.findIndex(x=>x&&x.toLowerCase()===v.toLowerCase())===i);
      c={
        id:newCharId(),name:finalName,gender:'Chưa rõ',relationship:'Chưa rõ',note:'',aliases:aliasesInit,
        // Tên gốc trong bản gốc (xem applyCharNameSubstitution). Trùng tên chính (VD truyện gốc đã là tiếng Việt) thì để trống.
        origName:parseOrigNames(origOkInit)[0]||'',origNameSource:'ai',
        demotedOrig:parseOrigNames(origOkInit).slice(1),   // tên gốc chỉ 1 tên: các tên còn lại chỉ là alias (aliasesInit)
        // Nhãn mô tả TẠM hay tên thật? KHÔNG tin tuyệt đối lời khai của model theo 1 chiều — chỉ tin
        // ngay khi model khai true (an toàn: true chỉ MỞ khả năng đổi tên sau nếu tên thật lộ ra, chứ
        // không làm mất dữ liệu gì). Khi model khai false (hoặc quên khai/undefined), BẮT BUỘC qua
        // thêm lưới cơ học looksLikePlaceholderCharName mới được tin — đối xứng với điều kiện
        // "!looksLikePlaceholderCharName(name)" đã áp ở nhánh nâng cấp bên dưới (dòng ~2977). Nếu
        // không có lưới này, model lỡ khai sai false cho 1 nhãn mô tả (VD "Xăm Hình Nam") sẽ ĐÓNG
        // BĂNG VĨNH VIỄN cờ này thành false, khiến tên thật lộ ra sau đó không bao giờ được cập nhật
        // vào "name" (nhánh nâng cấp yêu cầu namePlaceholder===true mới cho đổi).
        namePlaceholder:f.isPlaceholderName===true?true:looksLikePlaceholderCharName(finalName),
        nameSource:'ai',
        // protagonistPendingVotes: phiếu bầu cho lần gán "nhân vật chính" (đối xứng với
        // protagonistReconfirmVotes bên dưới, dùng khi khôi phục sau khi bị huỷ) — xem noteProtagonistSignal.
        isProtagonist:false,protagonistDenied:false,protagonistPendingVotes:[],
        genderSource:'ai',relationshipSource:'ai',noteSource:'ai',mentionChapters:[],
        genderConflict:null,relationshipConflict:null,
        // [Mục 2.1] Tầng yếu của giới tính: 'Nam'|'Nữ'|'' — chỉ để chọn đại từ khi dịch, không dùng tách/gộp record.
        // genderHintSource: 'model-guess' | 'pronoun-count' (đã đối chiếu 他/她 trong văn bản gốc).
        genderHint:'',genderHintSource:'',
        // Xưng hô 2 chiều với nhân vật chính — giải quyết case "kẻ thù nhưng AI dịch thành ngài".
        // Không lưu quan hệ có hướng đầy đủ giữa MỌI cặp nhân vật (phức tạp, tốn payload) — chỉ lưu
        // xưng hô giữa nhân vật này với NHÂN VẬT CHÍNH, cùng trục quy chiếu với field `relationship`.
        addrThemToMc:'',addrMcToThem:'',addrSource:'ai',
        addrThemToMcConflict:null,addrMcToThemConflict:null,
        // Cách gọi ngôi thứ 3 khi TƯỜNG THUẬT/nói VỀ nhân vật này (khác addrThemToMc/addrMcToThem —
        // xem giải thích ở buildCharExtractPrompt và buildCharacterContextText). Chỉ lưu đại từ
        // TRUNG TÍNH/phiếm chỉ theo giới tính, có thể chứa nhiều biến thể tuỳ sắc thái/góc nhìn
        // (VD "hắn, tên đó"), dùng chung định dạng nhiều-lựa-chọn với addr fields
        // (splitAddrCandidates/addAddrCandidate) nhưng không tách self/other.
        narrRef:'',narrRefSource:'ai',narrRefConflict:null,
        // "Vai vế/địa vị" theo bối cảnh truyện (cảnh giới tu luyện, chức vụ, thân phận, tuổi tác...)
        // — dùng để AI đoán xưng hô đúng hơn, tổng quát cho mọi thể loại (không cứng hoá theo tuổi).
        statusCue:'',statusCueSource:'ai',
        // Nhóm sắc thái của cặp xưng hô hiện tại (1 trong CHARMEM_ADDR_TONES) — chỉ dùng nội bộ để
        // phát hiện khi xưng hô mới trích xuất lệch hẳn nhóm đã lưu (xem detectAddrSuspicion), không
        // hiển thị cho người dùng.
        addrTone:'Chưa rõ',
        // Theo dõi đề xuất "correction" gần nhất cho từng field (value + chương đề xuất), dùng để gate:
        // nhân vật đã có nhiều dữ liệu ổn định thì chỉ tự sửa ngay khi 2 chương liên tiếp cùng đề xuất
        // 1 giá trị mới giống nhau; lần đầu chỉ đưa vào Conflict chờ duyệt (xem applyCharField).
        pendingCorr:{},
        // Đếm số CHƯƠNG LIÊN TIẾP mà c.name vẫn còn sót chữ Hán ngay SAU khi lượt phân tích của
        // chương đó xử lý xong (kể cả sau khi đã thử 2 nhánh vá tên containsCJK ở trên) — tăng dần ở
        // cuối mỗi lượt mergeAnalysisResults, reset về 0 ngay khi tên hết chữ Hán (dù do model tự vá,
        // do resolveStubbornNames() dịch hộ, hay do người dùng tự sửa tay). Dùng để kích hoạt
        // resolveStubbornNames() — xem STUBBORN_NAME_STREAK_THRESHOLD.
        untranslatedStreak:containsCJK(finalName)?1:0
      };
      if(f._nameVerified&&!c.namePlaceholder&&!containsCJK(c.name))c.nameVerified=true;
      if(f._nameTransChecked&&!containsCJK(c.name)&&!c.namePlaceholder&&charOrigNameList(c).length)c.nameTransChecked=true;
      S.characters.push(c);
      console.log(`[Luồng 1][Tạo/Sửa nhân vật] Created: ${finalName}`);
      try{proposeSameAsForAliasHolders(c,name,chapterIdx);}
      catch(e){console.log('[Luồng 1][Nối nhân vật] Lỗi khi đề xuất theo alias, bỏ qua:',e&&e.message||e);}
    } else {
      // Nhân vật đã có sẵn — THÔNG THƯỜNG KHÔNG bao giờ đổi lại c.name (dù AI lần này dịch/viết
      // khác đi), giữ đúng nguyên tắc "chỉ dịch tên 1 lần".
      // NGOẠI LỆ DUY NHẤT: nếu c.name đang lưu vẫn còn SÓT chữ Hán (do lần phân tích trước model bỏ
      // qua yêu cầu dịch tên), và lần này có sẵn 1 "name" hợp lệ — không còn chữ Hán — khớp với đúng
      // nhân vật này (qua alias hoặc originalName), thì coi đây là dữ liệu vá lỗi và cho phép SỬA LẠI
      // c.name đúng 1 lần duy nhất. Kể từ khi đã có tên tiếng Việt, nhân vật này được xem là "đã dịch
      // tên xong" và áp dụng lại đúng nguyên tắc "không đổi tên" như bình thường ở các lần sau.
      // Tên hiển thị (bỏ hậu tố " (2)") cũng coi là đã biết: record "Lý Minh (2)" không được nhận thêm alias "Lý Minh" (sẽ làm 2 record cùng khớp 1 tên).
      const known=new Set([c.name.trim().toLowerCase(),displayCharName(c).trim().toLowerCase(),...(c.aliases||[]).map(a=>a.trim().toLowerCase())]);
      // Kiểm 1 LẦN cho cả alias lẫn origName (xem sanitizeAliasCandidate): giá trị bị loại không vào aliases.
      const okOrigList=origName?parseOrigNames(sanitizeOrigNameCandidate(origName,c,srcText,nameCands,{allowLabel:!!c.namePlaceholder})):[];
      const sinoOk=sinoAlias?sanitizeAliasCandidate(sinoAlias,c,nameCands):'';
      let toAdd=[name,...okOrigList,sinoOk].filter(v=>v&&!known.has(v.trim().toLowerCase())&&!isRoleAddressAlias(v));
      if(containsCJK(c.name)&&name&&!containsCJK(name)){
        const oldName=c.name;
        // Tên dịch đã thuộc record KHÁC (2 người cùng phiên âm) -> thêm hậu tố, tránh 2 record trùng hệt tên.
        const fixedName=uniqueCharNameFor(name,c);
        c.name=fixedName;
        onCharRenamed(c,oldName);
        toAdd=toAdd.filter(v=>v.trim().toLowerCase()!==name.trim().toLowerCase());
        if(!toAdd.some(v=>v.trim().toLowerCase()===oldName.trim().toLowerCase()))toAdd.push(oldName);
        console.log(`[Luồng 1][Tạo/Sửa nhân vật] Fixed untranslated name: "${oldName}" -> "${name}"`);
        // Tên vừa được vá là tên ĐÃ DỊCH từ chữ Hán gốc, nhưng "dịch xong" KHÔNG đồng nghĩa "là tên
        // thật" — bản dịch có thể vẫn chỉ là 1 NHÃN MÔ TẢ, chỉ khác là giờ viết bằng tiếng Việt thay vì
        // chữ Hán (VD "假警察" dịch thành "Giả Cảnh Sát" vẫn là nhãn mô tả "cảnh sát giả", không phải
        // tên riêng). Trước bản sửa này, dòng dưới ép cứng false bất kể nội dung tên mới là gì, khiến
        // nhánh nâng cấp nhãn tạm -> tên thật ngay bên dưới (yêu cầu c.namePlaceholder===true) không
        // bao giờ chạy được nữa cho những ca này -> tên thật lộ ra sau đó (VD "Trần Minh Dũng") chỉ
        // được nhét vào aliases, còn nhãn mô tả (đã dịch) thì đóng băng vĩnh viễn làm tên chính. Nay áp
        // đúng cùng 1 lưới đã dùng ở nhánh tạo nhân vật mới (dòng ~3025): tin thẳng nếu model tự khai
        // "isPlaceholderName":true, còn lại luôn phải qua kiểm tra cơ học looksLikePlaceholderCharName.
        c.namePlaceholder=f.isPlaceholderName===true?true:looksLikePlaceholderCharName(name);
      }
      // NGOẠI LỆ THỨ HAI cho nguyên tắc "không đổi tên": nhân vật đang mang NHÃN MÔ TẢ TẠM (do lượt
      // trước tự đặt khi chưa biết tên thật — xem looksLikePlaceholderCharName) và chương này model
      // trả về 1 TÊN THẬT khớp đúng record này (khớp qua alias/originalName/sinoAlias nên mới vào
      // được nhánh "đã có sẵn" này). Chỉ cho đổi ĐÚNG 1 LẦN: ngay sau khi đổi, namePlaceholder=false
      // -> từ đó trở đi áp lại nguyên tắc "không bao giờ đổi tên" như mọi nhân vật bình thường khác.
      // 4 điều kiện chặn, thiếu 1 là bỏ qua:
      //   - c.nameSource!=='user': user đã tự gõ tên thì AI không được đụng vào, nhất quán với
      //     genderSource/relationshipSource/narrRefSource.
      //   - f.isPlaceholderName===false: chính model phải KHẲNG ĐỊNH đây là tên thật, không suy diễn hộ.
      //   - !looksLikePlaceholderCharName(name): lưới cơ học độc lập, chặn ca model khai bừa false cho
      //     1 nhãn mô tả khác (đổi "Thanh niên tóc vàng" -> "Gã tóc vàng" là vô nghĩa, lại phá khoá
      //     nhận diện đã ổn định qua nhiều chương).
      //   - !containsCJK(name): tên mới còn chữ Hán thì để luồng needsTranslation lo, không nâng cấp vội.
      else if(c.namePlaceholder&&c.nameSource!=='user'&&name&&f.isPlaceholderName===false&&
              !containsCJK(name)&&!looksLikePlaceholderCharName(name)&&normKey(name)!==normKey(c.name)){
        // Dùng chung promoteToRealName: nhãn cũ (và origName cũ của nhãn) hạ xuống alias — BẮT BUỘC giữ làm
        // alias vì bản dịch các chương TRƯỚC đã dùng nhãn đó — nhưng KHÔNG còn bị thay cứng thành tên thật;
        // chữ gốc của tên thật (nếu model trả và qua kiểm) vào origName.
        promoteToRealName(c,uniqueCharNameFor(name,c),okOrigList,'nhánh nâng cấp tự động');
        toAdd=toAdd.filter(v=>normKey(v)!==normKey(name));
      }
      if(f._recheckRename&&f._recheckRename===c.id&&c.nameSource!=='user'&&(c.nameVerified!==true||f._transFix===true)&&!c.namePlaceholder&&
         name&&!containsCJK(name)&&!looksLikePlaceholderCharName(name)&&normKey(name)!==normKey(c.name)){
        renameCharKeepAlias(c,name,f._transFix?'dịch lại tên cho đúng nghĩa tên gốc':'tên chưa xác nhận');
        toAdd=toAdd.filter(v=>normKey(v)!==normKey(c.name));
      }
      if(toAdd.length){
        // [Sổ hấp thụ] Record đã có tên gốc riêng mà entry mang tên gốc KHÁC HẲN (VD 杨思训 nuốt 杨思讷: 2 anh em trùng 2 chữ đầu)
        // bị ghép chung KHÔNG đi qua mergeCharacterInto nên trước đây không có nhật ký -> không có nút tách. Ghi lại để tách được.
        try{
          const cOrigs=charOrigNameList(c).map(o=>normKey(String(o).normalize('NFC'))).filter(Boolean);
          const foreign=cOrigs.length?okOrigList.filter(v=>{
            const k=normKey(String(v).normalize('NFC'));
            if(!k||k.length<2||isGenericAddressTerm(v)||isDescriptiveLabel(v)||inferFormKind(v)!=='name')return false;
            return !cOrigs.some(q=>q===k||q.includes(k)||k.includes(q));
          }):[];
          const dispName=(name&&normKey(name)!==normKey(c.name))?name:'';
          // Ca CHƯA ĐỐI CHIẾU ĐƯỢC tên gốc: entry mang 1 tên hiển thị MỚI (khác tên chính, chưa là alias) nhưng khớp record này qua
          // danh xưng/alias — không có tên gốc nào để chứng minh cùng người hay khác người (record cũ chưa có tên gốc, hoặc entry không có).
          // Vẫn ghép như cũ nhưng luôn ghi sổ để có nút tách.
          const unverified=!foreign.length&&!!dispName&&toAdd.some(v=>normKey(v)===normKey(dispName));
          if(foreign.length||unverified){
            if(!Array.isArray(c.absorbed))c.absorbed=[];
            const names=toAdd.filter(Boolean);
            const dup=c.absorbed.some(a=>a&&(foreign.length?a.orig===foreign[0]:(!a.orig&&normKey(a.dispName)===normKey(dispName))));
            if(!dup){
              c.absorbed.push({id:'ab'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),time:Date.now(),chapter:chapterIdx,
                orig:foreign[0]||'',dispName,names,gender:f.gender||'',note:String(f.note||'').slice(0,400),unverified:foreign.length?undefined:true});
              console.warn(foreign.length
                ?'[Luồng 1][Sổ hấp thụ] "'+c.name+'" (gốc '+charOrigNameList(c).join('/')+') nhận thêm tên gốc KHÁC "'+foreign[0]+'" — ghi sổ để tách (nút lịch sử cạnh Tên gọi khác).'
                :'[Luồng 1][Sổ hấp thụ] "'+c.name+'" nhận tên mới "'+dispName+'" nhưng chưa đối chiếu được tên gốc — ghi sổ để tách nếu là người khác.');
            }
          }
        }catch(e){console.warn('[Luồng 1][Sổ hấp thụ] Lỗi:',e);}
        c.aliases=[...(c.aliases||[]),...toAdd];
        console.log(`[Luồng 1][Tạo/Sửa nhân vật] Added alias(es) for ${c.name}: ${toAdd.join(', ')}`);
      }
      // Chưa có tên gốc và người dùng chưa từng tự sửa/xoá ô này -> nhận originalName model trả về
      // (CHỈ khi đang trống, không bao giờ ghi đè: tên gốc bị sai sẽ làm thay nhầm tên trong cả bản gốc).
      if(!charOrigNameList(c).length&&c.origNameSource!=='user'&&origName){
        // okOrigList đã qua kiểm (nguyên văn trong chương + không trùng nhân vật khác) ở trên; không đạt thì để
        // trống, người dùng tự điền (ô vẫn trống nên chương sau AI được thử lại). Cách viết của NHÃN đã hạ
        // (c.demotedOrig) không được điền ngược lại vào origName.
        const okOrig=okOrigList.filter(v=>normKey(v)!==normKey(c.name)&&!isDemotedOrig(c,v));
        if(okOrig.length){
          setOrigNameSingle(c,okOrig);   // chỉ 1 tên gốc; tên còn lại vào Tên gọi khác
          c.origNameSource='ai';
        }
      }
      ensureOrigInAliases(c);
      purgeRoleAliases(c);
      // Cập nhật streak "bỏ sót liên tiếp" NGAY SAU khi 2 nhánh vá tên containsCJK phía trên đã có
      // cơ hội sửa c.name cho chương này — containsCJK(c.name) tại đây phản ánh đúng trạng thái CUỐI
      // CÙNG sau lượt phân tích chương hiện tại, không phải trạng thái trước khi vá.
      c.untranslatedStreak=containsCJK(c.name)?(c.untranslatedStreak||0)+1:0;
      if(f._nameVerified&&c.nameSource!=='user'&&!c.namePlaceholder&&!c.nameLabelByJudge&&!containsCJK(c.name)&&!looksLikePlaceholderCharName(c.name))c.nameVerified=true;   // chỉ khoá sau khi kiểm tra lại thành công
      if(f._nameTransChecked&&c.nameSource!=='user'&&!containsCJK(c.name)&&!c.namePlaceholder&&charOrigNameList(c).length)c.nameTransChecked=true;   // đã đối chiếu nghĩa dịch tên với tên gốc
    }
    // 1.1: biệt danh model khai riêng chỉ vào aliases (KHÔNG bao giờ vào origName nên không bị thay cứng) và ghi vào
    // demotedOrig để chương sau không điền ngược vào ô Tên gốc. Chỉ khi công tắc "Kiểm tra tên" bật.
    if(getNameCheckOn()&&Array.isArray(f.nicknames)&&f.nicknames.length){
      f.nicknames.slice(0,6).forEach(raw=>{
        const v=String(raw||'').normalize('NFC').trim();
        if(!v||v.length>40||normKey(v)===normKey(c.name))return;
        if(containsCJK(v)&&/[A-Za-z\u00C0-\u1EF9]/.test(v)){console.log(`[Luồng 1][Biệt danh] Bỏ biệt danh lai chữ Hán + chữ Latin "${v}" của "${c.name}" (model dịch dở tên gốc).`);return;}
        if(charOrigNameList(c).some(o=>normKey(o)===normKey(v)))return;   // đang là tên gốc: để bước 1.2 phán quyết
        const ok=sanitizeAliasCandidate(v,c);
        if(!ok)return;
        if(!(c.aliases||[]).some(a=>normKey(a)===normKey(ok))){c.aliases=[...(c.aliases||[]),ok];console.log(`[Luồng 1][Biệt danh] "${c.name}" có biệt danh: ${ok}`);}
        c.demotedOrig=parseOrigNames([...(c.demotedOrig||[]),ok]);
      });
    }
    applyRecheckKinds(c,f);   // KIỂM TRA LẠI: phân loại theo nghĩa (tên riêng/biệt danh/chức danh) từ bước kiểm tra lại
    applyEntryVerdict(c,f);   // KIỂM TRA TÊN: ghi aiKind cho tên gốc + cờ nhãn vai trò (không làm gì khi công tắc tắt/không có phán quyết)
    // .normalize('NFC') BẮT BUỘC ở đây: văn bản do AI trả về đôi khi encode Unicode tiếng Việt ở
    // dạng NFD (dấu tách rời) dù NHÌN GIỐNG HỆT "Chưa rõ" viết tay trong code (dạng NFC). Nếu không
    // chuẩn hoá, so sánh chuỗi === 'Chưa rõ' ở applyCharField sẽ ÂM THẦM SAI (2 chuỗi trông y hệt
    // nhưng khác nhau ở byte) -> "Chưa rõ" bị lưu nhầm thành 1 xưng hô/giá trị thật, sau đó bị gửi
    // vào prompt dịch như thể đã xác định được, dù thực ra chẳng có ý nghĩa gì.
    const fr=(f.relationship||'Chưa rõ').normalize('NFC').trim()||'Chưa rõ';
    const fat=(f.addrThemToMc||'Chưa rõ').normalize('NFC').trim()||'Chưa rõ';
    const fam=(f.addrMcToThem||'Chưa rõ').normalize('NFC').trim()||'Chưa rõ';
    const fnarrRaw=(f.narrRef||'Chưa rõ').normalize('NFC').trim()||'Chưa rõ';
    // Lưới an toàn: loại bỏ lựa chọn nào trong fnarrRaw trùng y nguyên với relationship (cả giá trị
    // MỚI của chương này lẫn giá trị ĐANG LƯU trên nhân vật) — xem stripRelationshipCopyFromNarrRef.
    // Mở rộng lưới lọc sang statusCue: lỗi "copy nhãn thay vì đọc tường thuật thật" xảy ra y hệt với
    // statusCue (VD model copy "Đang giả chết" của statusCue vào narrRef) như với relationship, nên
    // lọc cả 2 nguồn nhãn, ở cả giá trị MỚI của chương này lẫn giá trị ĐANG LƯU trên nhân vật.
    let fnarr=stripRelationshipCopyFromNarrRef(fnarrRaw,[fr,c.relationship,f.statusCue,c.statusCue]);
    // Lấy TRƯỚC khi c.addrTone bị ghi đè bên dưới — tại đây c.addrTone vẫn còn là nhóm sắc thái CŨ
    // (gắn với giá trị xưng hô đang lưu), dùng để so sánh với nhóm sắc thái MỚI của chương này.
    const fatone=(f.addrTone||'').normalize('NFC').trim();
    // Lấy TRƯỚC khi các applyCharField bên dưới ghi xưng hô mới — dùng cho cờ addrTrust ở dưới.
    const hadAddrBefore=isEstablishedAddrChar(c);
    applyCharField(c,'gender','genderSource','genderConflict',fg,!!corr.gender,corr.reason,name,false,chapterIdx);
    applyGenderHint(c,f,hintCand,srcText,name,chapterIdx,hintSrc);   // [Mục 2] tầng yếu genderHint (2.1–2.3, 2.6, 2.7)
    // Lọc theo giới tính SAU KHI gender của chương này đã được áp dụng ở trên (bắt cả trường hợp
    // gender vừa được xác nhận NGAY trong chương đang phân tích) — xem giải thích ở khai báo
    // filterNarrRefByGender phía trên. Chỉ chặn ĐÚNG các từ có sắc thái giới tính rõ ràng ngược với
    // giới tính đã biết, KHÔNG chặn việc nhiều nhân vật cùng giới dùng chung 1 đại từ phổ biến.
    fnarr=filterNarrRefByGender(fnarr,c.gender);
    // Chặn câu miêu tả ngoại hình/trang phục NGAY TỪ giá trị mới của chương này, trước khi nó có cơ
    // hội được cộng dồn vào narrRef đang lưu (xem isNarrRefDescriptivePhrase).
    fnarr=stripDescriptivePhraseFromNarrRef(fnarr);
    // Nhân vật chính ĐÃ xác nhận (isCharProtagonist) thì KHÔNG cập nhật quan hệ + xưng hô 2 chiều: các field này là
    // "quan hệ/xưng hô với nhân vật chính" nên với chính MC chúng vô nghĩa (AI hay ghi nhầm "sư huynh/sư đệ" của chính
    // MC, kể cả còn chữ Hán). Giá trị người dùng tự nhập vẫn được giữ nguyên vì không bị đụng tới.
    const _skipMcRel=isCharProtagonist(c);
    if(_skipMcRel)console.log(`[Luồng 1][Cập nhật] Skipped: ${c.name}.relationship/addrThemToMc/addrMcToThem - là nhân vật chính, không cập nhật xưng hô/quan hệ`);
    else applyCharField(c,'relationship','relationshipSource','relationshipConflict',fr,!!corr.relationship,corr.reason,name,true,chapterIdx);
    // Độ thiện cảm với MC: cùng cơ chế relationship (đã có giá trị thì chỉ đổi khi có correction.affinity; user khoá thì thành gợi ý chờ duyệt).
    if(!_skipMcRel)applyCharField(c,'affinity','affinitySource','affinityConflict',normalizeAffinityValue(f.affinity),!!corr.affinity,corr.reason,name,false,chapterIdx);
    // Dùng chung 1 cờ correction.addressing cho cả 2 chiều xưng hô, vì trên thực tế chúng luôn đổi
    // cùng lúc (VD lộ ra kẻ thù thật ra là ân nhân -> cả 2 chiều xưng hô đổi theo cùng 1 sự kiện).
    const _addrBefore={addrThemToMc:c.addrThemToMc,addrMcToThem:c.addrMcToThem};
    if(!_skipMcRel)applyCharField(c,'addrThemToMc','addrSource','addrThemToMcConflict',fat,!!corr.addressing,corr.reason,name,false,chapterIdx,true,fatone);
    if(!_skipMcRel)applyCharField(c,'addrMcToThem','addrSource','addrMcToThemConflict',fam,!!corr.addressing,corr.reason,name,false,chapterIdx,true,fatone);
    if(!_skipMcRel)logAddrTrace(c,name,chapterIdx,{addrThemToMc:fat,addrMcToThem:fam},_addrBefore,_l1Preset());
    // narrRef: không truyền newTone (bỏ trống) -> addrToneSameGroup() luôn trả null -> applyCharField
    // luôn CỘNG DỒN thay vì thay thế. Đây là chủ ý: các đại từ ngôi thứ 3 khác nhau theo sắc thái/góc
    // nhìn (VD "hắn" trung tính và "tên đó" của góc nhìn thù địch) đều ĐÚNG cùng lúc, không phải cái
    // sau thay thế cái trước như trường hợp quan hệ đổi hẳn của addrThemToMc/addrMcToThem.
    applyCharField(c,'narrRef','narrRefSource','narrRefConflict',fnarr,!!corr.narrRef,corr.reason,name,false,chapterIdx,true);
    // Soát lại TOÀN BỘ narrRef đang lưu của nhân vật này (không chỉ giá trị mới vừa merge ở trên) —
    // dọn luôn các câu miêu tả đã lỡ tích luỹ từ TRƯỚC bản sửa này, mỗi khi nhân vật được cập nhật
    // qua 1 chương mới. Bỏ qua nếu người dùng đã tự sửa/khoá narrRef (narrRefSource==='user').
    cleanupDescriptiveNarrRef(c);
    // Cờ addrTrust ('verified' | 'unverified' | rỗng=dữ liệu cũ, coi như đáng tin): chỉ nâng lên 'verified' khi giá
    // trị xưng hô đã xác minh THỰC SỰ nằm trong dữ liệu đang lưu (applyCharField có thể đã không nhận nó);
    // chỉ hạ xuống 'unverified' khi đây là xưng hô mới lưu lần đầu hoặc nhân vật đã mang cờ này sẵn — dữ
    // liệu cũ chưa có cờ không bị đánh dấu oan chỉ vì 1 lượt verify lỗi ở chương sau.
    if(!_skipMcRel&&c.addrSource!=='user'&&(!isAddrUnknown(fat)||!isAddrUnknown(fam))){
      const stored=(v,cur)=>isAddrUnknown(v)||normKey(cur).includes(normKey(v));
      if(f.addrTrust==='verified'&&stored(fat,c.addrThemToMc)&&stored(fam,c.addrMcToThem))c.addrTrust='verified';
      else if(f.addrTrust==='unverified'&&c.addrTrust!=='verified'&&(!hadAddrBefore||c.addrTrust==='unverified'))c.addrTrust='unverified';
    }
    updateStatusCue(c,f.statusCue);
    if(fatone&&!isUnknownVal(fatone)&&!_skipMcRel)c.addrTone=fatone;
    applyNoteClean(c,f.noteClean);   // bước "Kiểm tra lại" có thể đề xuất bản note đã bỏ ý lặp (chỉ nhận khi qua lưới an toàn)
    appendAiNote(c,f.note);
    // Lưới đỡ cuối: nhân vật đang mang nhãn mô tả tạm nhưng note vừa được cập nhật ở trên có thể đã
    // lộ ra tên thật theo đúng mẫu câu prompt gợi ý (xem detectRealNameStuckInNote). Không tự động
    // đổi tên — chỉ đề xuất vào nameConflict để hiện banner cho người dùng tự duyệt (giống hệt cơ chế
    // banner đã dùng cho gender/relationship/...). Bỏ qua nếu user đã tự khoá tên (nameSource==='user')
    // hoặc nếu đã có sẵn đúng gợi ý này đang chờ duyệt (tránh ghi log/đề xuất lặp lại mỗi chương).
    if(!getNameJudgeOn()&&c.namePlaceholder&&c.nameSource!=='user'){   // giám khảo đã bỏ -> luôn chạy lưới regex này
      const stuckName=detectRealNameStuckInNote(c);
      if(stuckName&&!containsCJK(stuckName)&&normKey(stuckName)!==normKey(c.name)&&
         (!c.nameConflict||normKey(c.nameConflict.value)!==normKey(stuckName))){
        c.nameConflict={value:stuckName,reason:'Phát hiện trong ghi chú nhân vật'};
        console.log(`[Luồng 1][Tên tạm] Phát hiện tên thật có thể bị kẹt trong note: "${c.name}" -> gợi ý "${stuckName}"`);
      }
    }
    // Tín hiệu "nhân vật chính" do model trả về cho CHÍNH chương này. Chỉ là 1 LÁ PHIẾU, không phải
    // lệnh đánh dấu: castProtagonistVote vẫn áp đủ ngưỡng nhiều-chương-khác-nhau và vẫn tôn trọng cờ
    // protagonistDenied của người dùng y như đường cũ qua relationship (xem castProtagonistVote).
    if(f.isProtagonist===true)castProtagonistVote(c,chapterIdx);
    // Chỉ tính là "xuất hiện thêm 1 chương" nếu chương này CHƯA từng được tính cho nhân vật đó —
    // nhờ vậy khi người dùng bấm "Dịch lại" 1 chương đã dịch, số lần xuất hiện không bị tăng ảo.
    if(typeof chapterIdx==='number'){
      if(!Array.isArray(c.mentionChapters))c.mentionChapters=[];
      if(!c.mentionChapters.includes(chapterIdx))c.mentionChapters.push(chapterIdx);
    } else {
      c.mentionCount=(c.mentionCount||0)+1;
    }
    appeared.push(c);
  }
  return appeared;
}
// Giới hạn tổng độ dài note (chỉ áp dụng cho note do AI tự ghi, không đụng note người dùng tự viết)
// để tránh note phình to vô hạn qua hàng trăm chương. Khi vượt ngưỡng, bỏ bớt các đoạn CŨ NHẤT
// (nối ở đầu chuỗi), giữ lại thông tin gần đây/mới nhất — vì thông tin mới thường quan trọng hơn
// (VD thân phận thật vừa lộ ra) và các đoạn cũ dễ đã "lỗi thời" theo diễn biến truyện.
const CHARMEM_NOTE_MAX_CHARS=280;
// ===== GỘP CÁC ĐOẠN GHI CHÚ TRÙNG Ý (kể cả đảo từ/thiếu-đủ thông tin) =====
// appendAiNote vốn chỉ lọc trùng theo kiểu "đoạn mới là SUBSTRING y hệt đoạn cũ" (xem
// existingLower.includes bên dưới) — không bắt được 2 trường hợp rất hay gặp khi model nhắc lại
// thông tin cũ bằng cách diễn đạt khác:
//  (1) Cùng 1 tập từ, chỉ đảo thứ tự (VD "đội trưởng Phương Thị đặc biệt hành động tổ" và
//      "Phương Thị đặc biệt hành động tổ đội trưởng" — cùng nghĩa, chỉ khác cách sắp câu).
//  (2) 1 đoạn là bản THIẾU của đoạn kia (VD "Thần Võ tông cao thủ" chỉ là 1 phần của "Thần Võ
//      tông cao thủ, nhận danh hiệu Thanh Điểu" — đoạn sau đầy đủ hơn nên nên giữ, bỏ đoạn trước).
// Giải pháp: so sánh theo TẬP TỪ (bag-of-words) của từng đoạn thay vì so nguyên chuỗi.
function tokenizeNoteSegment(seg){
  // Bỏ dấu câu (không bỏ dấu tiếng Việt — bỏ dấu dễ gộp nhầm 2 từ khác nghĩa) rồi tách theo
  // khoảng trắng để lấy tập từ dùng so sánh.
  return (seg||'')
    .toLowerCase()
    .replace(/[,;.…"“”'’()]/g,' ')
    .split(/\s+/)
    .map(w=>w.trim())
    .filter(Boolean);
}
function isTokenSubset(a,b){for(const x of a)if(!b.has(x))return false;return true;}
function isTokenSetEqual(a,b){return a.size===b.size&&isTokenSubset(a,b);}
// Duyệt tuần tự theo thứ tự xuất hiện (đủ dùng vì note tích luỹ tuần tự theo chương, không cần so
// khớp mờ phức tạp hơn): đoạn nào trùng tập từ hoặc là tập con của 1 đoạn ĐÃ GIỮ thì bỏ; đoạn nào
// là tập CHA của 1 đoạn đã giữ (tức đầy đủ thông tin hơn) thì THAY THẾ đoạn đã giữ đó.
// Duyệt tuần tự theo thứ tự xuất hiện (đủ dùng vì note tích luỹ tuần tự theo chương, không cần so
// khớp mờ phức tạp hơn). QUAN TRỌNG: tách note thành từng MỆNH ĐỀ NHỎ NHẤT — cả theo dấu ';' (ngăn
// cách các đoạn tích luỹ qua từng lần AI ghi) LẪN dấu ',' bên trong 1 đoạn (ngăn cách các "sự kiện/
// đặc điểm" nhỏ gộp chung 1 câu) — rồi mới so trùng ở cấp mệnh đề, thay vì so nguyên cả đoạn. Lý do:
// 1 cụm mệnh đề (VD "nhận danh hiệu Thanh Điểu") có thể bị AI nhắc lại y hệt ở 2 đoạn KHÁC NHAU,
// mỗi đoạn còn có phần còn lại khác nhau (nên so nguyên đoạn không phát hiện được đoạn nào là tập
// con của đoạn nào) — chỉ so ở cấp mệnh đề nhỏ nhất mới bắt được phần trùng chung đó.
// GIỚI HẠN CẦN BIẾT: đây vẫn chỉ là so khớp CHỮ (từ giống nhau/là tập con của nhau), KHÔNG hiểu
// NGHĨA — 2 mệnh đề diễn đạt cùng 1 ý bằng từ ngữ khác hẳn nhau (VD "tối cao người phụ trách" và
// "đội trưởng" — cùng nghĩa "người đứng đầu" nhưng không chung từ nào ngoài tên tổ chức) sẽ KHÔNG
// bị gộp, vì JS thuần không thể nhận biết đây là đồng nghĩa nếu không tra từ điển hoặc gọi AI.
function dedupeNoteSegments(note){
  const rawSegs=(note||'').split(/;\s*/).map(s=>s.trim()).filter(Boolean);
  const clauses=[];
  for(const seg of rawSegs){
    seg.split(/,\s*/).map(s=>s.trim()).filter(Boolean).forEach(cl=>clauses.push(cl));
  }
  if(clauses.length<=1)return clauses.join('; ');
  const kept=[];
  for(const cl of clauses){
    const tokenSet=new Set(tokenizeNoteSegment(cl));
    if(!tokenSet.size)continue;
    let handled=false;
    for(let i=0;i<kept.length;i++){
      const k=kept[i];
      if(isTokenSetEqual(tokenSet,k.tokenSet)){handled=true;break;}
      if(isTokenSubset(tokenSet,k.tokenSet)){handled=true;break;}
      if(isTokenSubset(k.tokenSet,tokenSet)){kept[i]={text:cl,tokenSet};handled=true;break;}
    }
    if(!handled)kept.push({text:cl,tokenSet});
  }
  return kept.map(k=>k.text).join('; ');
}
// Nhận bản note đã BỎ Ý LẶP do bước "Kiểm tra lại" đề xuất (f.noteClean). Lưới an toàn (thiếu 1 điều kiện là bỏ qua,
// giữ nguyên note cũ): note không do người dùng viết/khoá; bản mới ngắn hơn, không còn chữ Hán; MỌI từ của bản mới đã có
// sẵn trong note đang lưu (model chỉ được chọn/gộp lại, không được thêm ý mới); không được cắt quá ~65% nội dung.
function applyNoteClean(c,clean){
  const nc=(clean||'').normalize('NFC').trim();
  if(!nc||!c||c.noteSource==='user')return false;
  const cur=(c.note||'').trim();
  if(!cur||nc.length>=cur.length||containsCJK(nc))return false;
  if(nc.length<cur.length*0.35)return false;
  const curTok=new Set(tokenizeNoteSegment(cur));
  const ncTok=tokenizeNoteSegment(nc);
  if(!ncTok.length||!ncTok.every(w=>curTok.has(w)))return false;
  c.note=trimAiNote(nc);c.noteSource='ai';
  console.log(`[Luồng 1][Cập nhật] Updated: ${c.name}.note (bỏ ý lặp: ${cur.length} -> ${c.note.length} ký tự)`);
  return true;
}
function trimAiNote(note){
  let segs=(note||'').split('; ').filter(Boolean);
  while(segs.length>1&&segs.join('; ').length>CHARMEM_NOTE_MAX_CHARS)segs.shift();
  let out=segs.join('; ');
  if(out.length>CHARMEM_NOTE_MAX_CHARS)out=out.slice(out.length-CHARMEM_NOTE_MAX_CHARS).trim();
  return out;
}
// Ghi/nối thêm thông tin tổng quan (note) do AI tự phát hiện mỗi lần dịch — tích luỹ dần theo
// từng chương. Cùng nguyên tắc với gender/relationship: chỉ TÊN nhân vật mới ưu tiên dữ liệu
// người dùng tự nhập, note (dù người dùng từng tự viết) vẫn được AI tự động bổ sung thêm.
function appendAiNote(c,newNoteText){
  const t=(newNoteText||'').trim();
  if(!t)return;
  const existing=(c.note||'').trim();
  if(!existing){
    c.note=trimAiNote(t);c.noteSource='ai';
    console.log(`[Luồng 1][Cập nhật] Updated: ${c.name}.note`);
    return;
  }
  // Tách newNoteText thành từng đoạn nhỏ (note tích luỹ qua nhiều chương bằng dấu nối '; ') rồi chỉ
  // thêm đoạn nào CHƯA có sẵn — so theo TỪNG ĐOẠN thay vì so nguyên cụm t, để tránh lặp lại y hệt 1
  // đoạn đã có nếu model nhắc lại thông tin cũ kèm thông tin mới trong cùng 1 câu note của chương này.
  const existingLower=existing.toLowerCase();
  const segs=t.split(/;\s*/).map(s=>s.trim()).filter(Boolean);
  const newSegs=segs.filter(s=>!existingLower.includes(s.toLowerCase()));
  if(!newSegs.length)return;
  // dedupeNoteSegments bắt thêm 2 trường hợp existingLower.includes() bỏ sót: đoạn mới trùng Ý
  // với 1 đoạn cũ nhưng bị đảo từ, hoặc đoạn mới/cũ là bản thiếu của nhau (xem giải thích ở trên).
  c.note=trimAiNote(dedupeNoteSegments(existing+'; '+newSegs.join('; ')));
  c.noteSource='ai';
  console.log(`[Luồng 1][Cập nhật] Updated: ${c.name}.note (appended)`);
}

// Cập nhật "vai vế/địa vị" (statusCue) — khác note (tích luỹ) và khác gender/relationship (correction
// có gate): đây là thông tin MÔ TẢ HIỆN TẠI, dễ tự nhiên thay đổi theo diễn biến truyện (VD tu vi lên
// cảnh giới mới, thăng chức...), nên chỉ đơn giản GHI ĐÈ bằng giá trị mới nhất do AI cung cấp — TRỪ
// khi người dùng đã tự tay chỉnh sửa field này trong modal (statusCueSource==='user'), lúc đó AI
// không tự động ghi đè nữa (giữ đúng nguyên tắc user > ai).
function updateStatusCue(c,newVal){
  const v=(newVal||'').normalize('NFC').trim();
  if(isUnknownVal(v))return;   // chặn "Chưa rõ"/"chưa rõ"/"-"/rỗng... không phân biệt hoa thường: không được ghi đè độ tuổi đã có
  if(c.statusCueSource==='user')return;
  if(c.statusCue===v)return;
  c.statusCue=v;c.statusCueSource='ai';
  console.log(`[Luồng 1][Cập nhật] Updated: ${c.name}.statusCue -> ${v}`);
}

// ===== NHÂN VẬT CHÍNH =====
// Không tự ý gán nhân vật chính từ suy đoán 1 chương — chỉ đánh dấu nếu user đã xác nhận qua modal.
// (Người dùng có thể đặt cờ isProtagonist thủ công bằng cách chỉnh sửa; giữ đơn giản, không tự động đoán.)

// Gắn kèm SAU giá trị xưng hô cụ thể đã lưu 1 gợi ý ngắn về các biến thể CÙNG nhóm sắc thái (xem
// CHARMEM_ADDR_TONE_EXAMPLES) — không thay thế giá trị đã lưu, chỉ cho model dịch chính biết có
// "đường lui" nếu đúng câu đang dịch lệch giọng so với cách xưng hô thường ngày đã ghi nhận (VD nhân
// vật vốn xưng "muội/ca ca" nhưng đang giận dữ quát lên) — xem hướng dẫn sử dụng ở cuối
// buildCharacterContextText. Không hiện gợi ý nếu chưa xác định được nhóm sắc thái (addrTone
// "Chưa rõ" hoặc rỗng) vì khi đó không biết dựa vào nhóm nào để gợi ý cho đúng.
function addrToneExampleHint(tone,genreSystem){
  const t=(tone||'').trim();
  const examples=addrToneExamplesForSystem(t,genreSystem);
  if(!examples.length)return '';
  return ` (nhóm sắc thái "${t}" — nếu câu này rõ ràng lệch giọng thường ngày, có thể cân nhắc biến thể cùng nhóm như: ${examples.join(', ')})`;
}
// Đọc TẠM bản promptGuidance đã cache trong localStorage (KHÔNG gọi thêm API, không đợi async) — dùng
// khi buildCharacterContextText (hàm đồng bộ, không nhận tham số promptGuidance từ nơi gọi hiện tại)
// cần biết HỆ xưng hô để lọc ví dụ minh hoạ. Bản cache này chính là bản getMainPromptGuidance() đã lưu
// ở bước trích xuất nhân vật chạy TRƯỚC bước dịch trong cùng 1 lượt xử lý chương, nên hầu như luôn có
// sẵn; nếu chưa có (VD chương đầu tiên chưa từng chạy trích xuất), trả về '' và
// detectAddrGenreSystem('') sẽ tự trả null, addrToneExamplesForSystem sẽ gộp cả 2 hệ như hành vi cũ.
function getCachedPromptGuidanceSync(){
  try{
    const cache=JSON.parse(localStorage.getItem(promptGuidanceStorageKey())||'null');
    return (cache&&cache.guidance)||'';
  }catch(e){return '';}
}

// ===== CAST BEGIN =====
// 4.1 — BẢNG CAST THEO CHƯƠNG (hàm thuần + 1 dòng nối vào buildCharacterContextText; KHÔNG thêm lượt gọi API).
// Mục đích: danh sách chi tiết trong prompt dịch dài theo từng người; bảng này là MỤC LỤC tra nhanh ở đầu khối:
// ai có mặt, giới tính, vai với nhân vật chính, QUAN HỆ GIỮA CÁC NHÂN VẬT PHỤ (lấy từ c.edges — trước giờ chỉ tồn
// tại ngầm qua xưng hô mặc định, không được nói thẳng), và cách gọi khác CHƯA bị thay chuỗi (biệt danh chưa vào
// origName, chức danh chung). Chỉ THÊM, không thay phần cũ; dưới ngưỡng CHARMEM_CAST_MIN nhân vật thì không sinh bảng.
// Cột nào rỗng ở mọi hàng thì bỏ cả cột để đỡ tốn token. Tắt bằng localStorage 'dich-charm-cast'='0'.
const CHARMEM_CAST_MIN=3;
const CHARMEM_CAST_MAX=20;
// Vai nào trong CHARMEM_REL_ROLE_NAMES có tên tách theo giới ("cha/mẹ", "sư đệ/sư muội/hậu bối"): khoá 'kiểu:chỉ số vai'.
const CHARMEM_CAST_GENDERED=new Set(['parent_child:0','grandparent:0','sibling:0','senior_junior:0','senior_junior:1']);
function castTableOn(){try{return localStorage.getItem('dich-charm-cast')!=='0';}catch(e){return true;}}
function _castCell(s,n){
  const t=String(s==null?'':s).replace(/[|\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  return t.length>n?t.slice(0,n-1).trim()+'…':t;
}
function _castRoleName(type,roleIdx,gender){
  const rn=CHARMEM_REL_ROLE_NAMES[type];if(!rn)return '';
  const parts=String(rn[roleIdx]||'').split('/');
  if(parts.length>1&&CHARMEM_CAST_GENDERED.has(type+':'+roleIdx)){
    const g=normalizeGenderValue(gender);
    if(g==='Nam')return parts[0];
    if(g==='Nữ')return parts[1];
  }
  return parts.join('/');
}
// Quan hệ của x đối với y theo cạnh đã lưu ("tớ của Hắc Y", "bạn bè với Hắc Y"); '' nếu cặp chưa có cạnh.
function castRelPhrase(list,x,y){
  const e=edgeRoles(list,x,y);if(!e)return '';
  const def=CHARMEM_REL_TYPES[e.type];if(!def)return '';
  if(def.symmetric)return `${String(def.label||'').toLowerCase()} với ${y.name}`;
  const r=_castRoleName(e.type,e.xRole==='b'?1:0,x.gender);
  return r?`${r} của ${y.name}`:'';
}
// Cách gọi khác của c MÀ MODEL SẼ THẤY NGUYÊN DẠNG trong văn bản (form không bị thay bằng c.name). Chức danh chung
// nhiều nhân vật trong chương cùng có thì bỏ (không biết chỉ ai — cùng quy tắc với khối "Chức danh chung" bên dưới).
// chapterText (tuỳ chọn): chỉ giữ form thật sự có trong chương.
function castOtherForms(c,appeared,chapterText){
  const nt=s=>String(s||'').normalize('NFC').toLowerCase().trim();
  const chap=chapterText?nt(chapterText):'';
  const out=[];
  charForms(c).forEach(f=>{
    if(isReplaceForm(c,f))return;
    const k=nt(f.text);if(!k)return;
    if(chap&&!chap.includes(k))return;
    if(pendingOrigForms(c).some(x=>nt(x)===k))return;   // đã có dòng riêng "Cách viết gốc của tên chính" trong danh sách chi tiết
    if(formIsLabel(f)&&appeared.some(o=>o!==c&&charForms(o).some(x=>formIsLabel(x)&&!isReplaceForm(o,x)&&nt(x.text)===k)))return;
    out.push(formIsLabel(f)?`"${f.text}" (chức danh)`:`"${f.text}"`);
  });
  return out.slice(0,3);
}
// opts: {chapterText?, min?}. Trả '' nếu ít hơn min nhân vật.
function buildCastTable(list,appeared,opts){
  const cs=(Array.isArray(appeared)?appeared:[]).filter(c=>c&&c.id&&String(c.name||'').trim());
  const min=(opts&&Number.isFinite(opts.min))?opts.min:CHARMEM_CAST_MIN;
  if(!cs.length||cs.length<min)return '';
  const shown=cs.slice(0,CHARMEM_CAST_MAX);
  const chapterText=opts&&opts.chapterText;
  const rows=shown.map(c=>{
    const rels=[];
    shown.forEach(o=>{if(o===c)return;const p=castRelPhrase(list,c,o);if(p)rels.push(p);});
    return {
      name:_castCell(c.name,40),
      gender:isUnknownVal(c.gender)?'?':_castCell(c.gender,8),
      role:isCharProtagonist(c)?'Nhân vật chính':(isUnknownVal(c.relationship)?'':_castCell(c.relationship,40)),
      rel:_castCell(rels.slice(0,3).join('; '),90),
      forms:_castCell(castOtherForms(c,cs,chapterText).join(', '),70)
    };
  });
  const cols=[['Tên (giữ nguyên văn)','name'],['Giới','gender'],['Vai/quan hệ với nhân vật chính','role'],['Quan hệ với nhân vật khác trong chương','rel'],['Cách gọi khác (cùng người đó)','forms']]
    .filter(([,k])=>k==='name'||k==='gender'||rows.some(r=>r[k]));
  let out='BẢNG NHÂN VẬT XUẤT HIỆN TRONG CHƯƠNG NÀY (tra nhanh ai là ai):\n'+
    '| '+cols.map(c=>c[0]).join(' | ')+' |\n|'+cols.map(()=>'---').join('|')+'|\n';
  rows.forEach(r=>{out+='| '+cols.map(([,k])=>r[k]||'—').join(' | ')+' |\n';});
  if(cs.length>shown.length)out+=`(còn ${cs.length-shown.length} nhân vật khác chỉ có trong danh sách chi tiết bên dưới)\n`;
  out+='Bảng chỉ để tra nhanh; chi tiết từng người ở danh sách đánh số bên dưới — nếu khác nhau thì theo danh sách đó.\n\n';
  return out;
}
// ===== CAST END =====

// ===== CHARLINE BEGIN =====
// 1 dòng định danh cho mỗi nhân vật: tên, giới tính, các cách gọi khác/tên gốc/chức danh/liên kết cùng người. Không đưa note, độ tuổi vào prompt.
function _charContextLine(c,appeared){
  const nm=displayCharName(c);
  const bits=[];
  if(isCharProtagonist(c))bits.push('nhân vật chính');
  if(c.isHuman===false&&isUnknownVal(c.gender))bits.push('không phải người, không gán anh/cô/hắn/nàng');
  else if(!isUnknownVal(c.gender))bits.push(String(c.gender));
  else if(normalizeGenderValue(c.genderHint)!=='Chưa rõ'){
    const cf=charmemGenderConf(c);
    bits.push(`${normalizeGenderValue(c.genderHint)} (đoán ~${cf}%${cf<50?', văn bản chỉ giới khác thì THEO VĂN BẢN':''})`);
  }
  const roleSet=new Set(charRoleLabelList(c).map(normKey)),pendSet=new Set(pendingOrigForms(c).map(normKey));
  const alias=(c.aliases||[]).filter(a=>!roleSet.has(normKey(a))&&!pendSet.has(normKey(a)));
  if(alias.length)bits.push('cũng gọi: '+alias.join(', '));
  const pend=pendingOrigForms(c);
  if(pend.length)bits.push(`cách viết gốc ${pend.join(', ')} → dịch đúng "${nm}"`);
  const rep=charReplacedOrigList(c);
  if(rep.length)bits.push(`tên gốc ${rep.join(', ')} đã được thay sẵn bằng "${nm}", giữ nguyên`);
  const own=charRoleLabelList(c).filter(r=>appeared.every(o=>o===c||!charRoleLabelList(o).some(x=>normKey(x)===normKey(r)))).slice(0,3);
  if(own.length)bits.push('chức danh: '+own.map(r=>`"${r}"`).join(', '));
  // Chỉ nêu bản thể có MẶT trong chương; bản thể không xuất hiện thì không cần (và khỏi mớm tên lạ cho model).
  const _appIds=new Set((appeared||[]).map(o=>o&&o.id));
  const twins=sameAsConfirmedGroup(S.characters,c).filter(x=>x&&_appIds.has(x.id)).map(x=>displayCharName(x)).filter(n=>n&&n!==nm);
  if(twins.length)bits.push(`cùng người với [${twins.join(', ')}] nhưng KHÔNG đổi tên này sang tên kia`);
  return `- ${nm}${bits.length?' ('+bits.join('; ')+')':''}`;
}
// ===== CHARLINE END =====

// ===== NAMEDRIFT BEGIN =====
// 4.3 — HẬU KIỂM PHIÊN ÂM LẠ BẰNG KHOẢNG CÁCH CHỈNH SỬA (hàm thuần + 1 bước nối; KHÔNG thêm lượt gọi API).
// Tên chính c.name được GIỮ NGUYÊN VĂN trong prompt dịch, nhưng model đôi khi vẫn viết lệch 1 ký tự/1 dấu
// ("Trần Huynh" -> "Trần Huỳnh"), làm 1 nhân vật có 2 bản dịch tên. Hàm quét văn bản đã dịch, tìm cụm từ viết hoa
// chỉ lệch ĐÚNG 1 phép sửa (levenshtein = 1, gồm cả đổi dấu) so với tên chính của 1 nhân vật.
// TỰ SỬA chỉ khi chắc chắn; còn lại chỉ GHI LOG (flagged), không đụng văn bản:
//   - tên chính có >= 2 từ, mọi từ viết hoa (tên 1 từ như "Tuyết" dễ trùng từ thường -> chỉ log);
//   - cụm lạ KHÔNG trùng bất kỳ name/alias/origName/form nào của bất kỳ nhân vật (kẻo sửa nhầm sang người khác, vd
//     "Lâm Phòng" là nhân vật riêng); chỉ gần ĐÚNG 1 tên chính (gần 2 tên -> mơ hồ -> log);
//   - cụm lạ không xuất hiện nhiều gấp đôi tên chính trong chương (nhiều hơn hẳn = có thể là người khác -> log).
// Bỏ qua nhân vật đang là nhãn tạm (namePlaceholder), tên còn chữ Hán, tên không viết hoa từng từ.
// Công tắc: localStorage 'dich-charm-namedrift' = '0' tắt | 'log' chỉ ghi log | (mặc định) tự sửa phần chắc chắn.
function driftMode(){
  try{const v=localStorage.getItem('dich-charm-namedrift');return v==='0'?'off':(v==='log'?'log':'fix');}
  catch(e){return 'fix';}
}
const _driftKey=s=>String(s||'').normalize('NFC').toLowerCase().trim();
function driftCanonicalNames(list){
  const out=[];
  (list||[]).forEach(c=>{
    const n=String(c&&c.name||'').normalize('NFC').trim();
    if(!c||!c.id||!n||n.length<4||c.namePlaceholder||containsCJK(n))return;
    const words=n.split(/\s+/);
    if(!words.every(w=>/^\p{Lu}/u.test(w)))return;
    out.push({id:c.id,name:n,words:words.length});
  });
  return out;
}
// Mọi cách viết đã biết của mọi nhân vật (chữ thường) — cụm nằm trong tập này không bao giờ bị coi là "lệch".
function driftKnownSet(list){
  const set=new Set();
  (list||[]).forEach(c=>{
    if(!c)return;
    [c.name,...(c.aliases||[]),...charOrigNameList(c),...charForms(c).map(f=>f.text)].forEach(v=>{const k=_driftKey(v);if(k)set.add(k);});
  });
  return set;
}
function _driftCount(t,s){let n=0,i=0;while((i=t.indexOf(s,i))>=0){n++;i+=s.length;}return n;}
// -> {fixes:[{found,canonical,charId,positions:[[s,e]...]}], flagged:[{found,canonical,reason,count}]}
function findNameDrift(text,list){
  const res={fixes:[],flagged:[]};
  const t=String(text||'');
  const canon=driftCanonicalNames(list);
  if(!t||!canon.length)return res;
  const known=driftKnownSet(list);
  const toks=[];const re=/\p{L}[\p{L}\p{M}'’]*/gu;let m;
  while((m=re.exec(t)))toks.push({s:m.index,e:m.index+m[0].length});
  const byN=new Map();
  canon.forEach(c=>{if(!byN.has(c.words))byN.set(c.words,[]);byN.get(c.words).push(c);});
  const groups=new Map();
  for(const [n,cs] of byN){
    for(let i=0;i+n<=toks.length;i++){
      let ok=true;
      for(let k=0;k<n;k++){
        if(!/\p{Lu}/u.test(t[toks[i+k].s])){ok=false;break;}
        if(k<n-1&&t.slice(toks[i+k].e,toks[i+k+1].s)!==' '){ok=false;break;}
      }
      if(!ok)continue;
      const s=toks[i].s,e=toks[i+n-1].e,cand=t.slice(s,e).normalize('NFC');
      const ck=_driftKey(cand);
      if(known.has(ck))continue;
      for(const c of cs){
        if(Math.abs(cand.length-c.name.length)>1)continue;
        const nk=_driftKey(c.name);
        if(ck===nk||levenshtein(ck,nk)!==1)continue;
        let g=groups.get(cand);
        if(!g){g={cand,pos:[],hits:new Map()};groups.set(cand,g);}
        g.hits.set(c.id,c);
        if(!g.pos.some(p=>p[0]===s))g.pos.push([s,e]);
      }
    }
  }
  for(const g of groups.values()){
    if(g.hits.size>1){res.flagged.push({found:g.cand,canonical:[...g.hits.values()].map(c=>c.name).join(' | '),reason:'mơ hồ (gần 2 nhân vật)',count:g.pos.length});continue;}
    const c=[...g.hits.values()][0];
    if(c.words<2){res.flagged.push({found:g.cand,canonical:c.name,reason:'tên 1 từ, không tự sửa',count:g.pos.length});continue;}
    const cc=_driftCount(t,c.name);
    // Chỉ tự sửa khi cụm lệch là THIỂU SỐ so với tên chính (ít lần hơn). Bằng/nhiều hơn, hoặc tên chính không xuất hiện,
    // thì có thể là 2 người khác nhau chỉ lệch dấu (Lâm Phong/Lâm Phòng) -> chỉ log.
    if(!(cc>0&&g.pos.length<cc)){res.flagged.push({found:g.cand,canonical:c.name,reason:cc>0?'số lần không ít hơn tên chính (có thể là người khác)':'tên chính không xuất hiện trong chương',count:g.pos.length});continue;}
    res.fixes.push({found:g.cand,canonical:c.name,charId:c.id,positions:g.pos});
  }
  return res;
}
// Thay theo vị trí (từ cuối lên đầu), bỏ qua vị trí chồng lấn. -> {text,applied}
function applyNameDriftFixes(text,fixes){
  const all=[];
  (fixes||[]).forEach(f=>f.positions.forEach(p=>all.push({s:p[0],e:p[1],to:f.canonical})));
  all.sort((a,b)=>b.s-a.s);
  let out=String(text||''),applied=0,lastStart=Infinity;
  all.forEach(x=>{if(x.e>lastStart)return;out=out.slice(0,x.s)+x.to+out.slice(x.e);lastStart=x.s;applied++;});
  return {text:out,applied};
}
// Bước nối vào pipeline: trả về văn bản đã (hoặc chưa) sửa; không bao giờ ném lỗi.
function postcheckNameDrift(chapterIdx,text){
  const mode=driftMode();
  if(mode==='off'||!text||typeof S==='undefined'||!S||!Array.isArray(S.characters)||!S.characters.length)return text;
  try{
    text=String(text).normalize('NFC');   // bản dịch có thể là NFD (dấu tách rời): so khớp/đếm tên chính phải cùng dạng NFC
    const tag=`[Tên lệch] chương ${typeof chNum==='function'?chNum(chapterIdx):chapterIdx}`;
    const r=findNameDrift(text,S.characters);
    r.flagged.slice(0,10).forEach(f=>console.log(`${tag}: nghi "${f.found}" ≈ "${f.canonical}" (${f.reason}, ${f.count} lần) — không tự sửa.`));
    if(!r.fixes.length)return text;
    if(mode==='log'){r.fixes.forEach(f=>console.log(`${tag}: "${f.found}" lệch tên "${f.canonical}" (${f.positions.length} lần) — chế độ log, không sửa.`));return text;}
    const o=applyNameDriftFixes(text,r.fixes);
    r.fixes.forEach(f=>console.log(`${tag}: sửa "${f.found}" -> "${f.canonical}" (${f.positions.length} lần).`));
    return o.text;
  }catch(e){return text;}
}
// ===== NAMEDRIFT END =====

// ===== PERSONA BEGIN =====
// 4.2 — THÂN PHẬN GIẢ (persona) + AI BIẾT AI (knownBy) THEO CHƯƠNG. Chỉ THÊM trường c.personas (không đổi nghĩa trường cũ),
// dùng đúng lượt gọi trích xuất sẵn có (thêm field "personas" vào JSON), KHÔNG thêm lượt API.
// Khác sameAs: sameAs nói "2 record là cùng 1 người" (gộp dữ liệu xưng hô); persona nói "người THẬT c đang mang MẶT NẠ <alias>
// trong 1 khoảng chương, và chỉ vài người biết". Mặt nạ có thời hạn (from..to) và khán giả (knownBy), nên cùng 1 nhân vật được
// gọi khác nhau tuỳ NGƯỜI NÓI và tuỳ CHƯƠNG — thứ mà 1 trường aliases phẳng không diễn đạt được.
// c.personas[] = [{alias, gender, from, to, knownBy:[{id,chapter}], src:'ai'|'user', evidence, chapter}]
//   alias   tên/danh xưng giả, viết như trong bản dịch (≤40 ký tự)
//   gender  giới tính mặt nạ thể hiện ('Nam'|'Nữ'|''); '' = không khác người thật/không rõ
//   from/to chương bắt đầu / chương LỘ-BỎ mặt nạ (to=null: còn đang dùng)
//   knownBy ai biết sự thật, kèm chương người đó biết — chỉ TĂNG, không bao giờ rút lại (đã biết thì không quên)
// Chỉ nhận mục AI báo khi evidence="trực tiếp" VÀ quote tìm lại được nguyên văn (cùng cách applyRelations).
// Công tắc khối trong prompt dịch: MẶC ĐỊNH TẮT; localStorage 'dich-charm-persona'='1' để bật.
const CHARMEM_PERSONA_MAX=4;
const CHARMEM_PERSONA_KNOWN_MAX=12;
// MẶC ĐỊNH TẮT: bản gốc đã tự dùng đúng tên giả/đại từ, không được thay tên -> khối này vô ích. Bật lại: localStorage 'dich-charm-persona'='1'.
function personaOn(){try{return localStorage.getItem('dich-charm-persona')==='1';}catch(e){return false;}}
const _personaKey=s=>String(s||'').normalize('NFC').toLowerCase().trim();
const _personaCh=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
function _personaEntry(p){
  if(!p||typeof p!=='object')return null;
  const alias=String(p.alias||'').trim().slice(0,40);
  if(!alias)return null;
  const g=normalizeGenderValue(p.gender);
  const seen=new Set(),kb=[];
  (Array.isArray(p.knownBy)?p.knownBy:[]).forEach(k=>{
    const id=typeof k==='string'?k:(k&&k.id);
    if(typeof id!=='string'||!id||seen.has(id)||kb.length>=CHARMEM_PERSONA_KNOWN_MAX)return;
    seen.add(id);kb.push({id,chapter:_personaCh(k&&typeof k==='object'?k.chapter:null)});
  });
  return {alias,gender:g==='Nam'||g==='Nữ'?g:'',from:_personaCh(p.from),to:_personaCh(p.to),knownBy:kb,
    src:p.src==='user'?'user':'ai',evidence:String(p.evidence||'').trim().slice(0,200),chapter:_personaCh(p.chapter)};
}
// Mặt nạ có hiệu lực ở chương ch không? Không có ch: chỉ tính mặt nạ còn mở (to=null).
function personaActiveAt(p,ch){
  if(!p)return false;
  if(!Number.isFinite(ch))return p.to===null||p.to===undefined;
  const from=Number.isFinite(p.from)?p.from:0;
  return from<=ch&&(p.to===null||p.to===undefined||ch<=p.to);
}
// Id những người ĐÃ biết sự thật tính đến chương ch (không có ch: tất cả).
function personaKnownIds(p,ch){
  return (p&&Array.isArray(p.knownBy)?p.knownBy:[]).filter(k=>k&&k.id&&(!Number.isFinite(ch)||!Number.isFinite(k.chapter)||k.chapter<=ch)).map(k=>k.id);
}
// Ghi/cập nhật 1 mặt nạ cho c. info={alias,gender,action:'active'|'ended',knownBy:[id],chapter,src,evidence}.
// Trả 'added' | 'updated' | 'kept' | 'invalid'. Mục do người dùng ('user') không bị AI đụng tới.
function setPersona(list,c,info){
  if(!c||!c.id||!info)return 'invalid';
  const alias=String(info.alias||'').trim();
  if(!alias||_personaKey(alias)===_personaKey(c.name))return 'invalid';
  const ch=_personaCh(info.chapter),ended=info.action==='ended';
  const src=info.src==='user'?'user':'ai';
  const kbNew=(Array.isArray(info.knownBy)?info.knownBy:[]).filter(id=>typeof id==='string'&&id&&id!==c.id&&(list||[]).some(x=>x&&x.id===id));
  if(!Array.isArray(c.personas))c.personas=[];
  const key=_personaKey(alias);
  // mặt nạ cùng alias gần nhất còn hiệu lực/chưa đóng, hoặc đóng đúng chương này
  const cands=c.personas.filter(p=>_personaKey(p.alias)===key);
  let cur=cands.slice().reverse().find(p=>p.to===null||p.to===undefined||(Number.isFinite(ch)&&ch<=p.to));
  const fin=()=>{if(!c.personas.length)delete c.personas;};
  if(cur&&cur.src==='user'&&src!=='user'){fin();return 'kept';}
  if(!cur){
    const ne=_personaEntry({alias,gender:info.gender,from:ch,to:ended?ch:null,knownBy:kbNew.map(id=>({id,chapter:ch})),src,evidence:info.evidence,chapter:ch});
    if(!ne){fin();return 'invalid';}
    c.personas.push(ne);
    while(c.personas.length>CHARMEM_PERSONA_MAX){
      const i=c.personas.findIndex(p=>p.to!==null&&p.to!==undefined);
      c.personas.splice(i>=0?i:0,1);
    }
    return 'added';
  }
  let changed=false;
  const have=new Set((cur.knownBy||[]).map(k=>k.id));
  kbNew.forEach(id=>{if(!have.has(id)&&cur.knownBy.length<CHARMEM_PERSONA_KNOWN_MAX){cur.knownBy.push({id,chapter:ch});have.add(id);changed=true;}});
  const g=normalizeGenderValue(info.gender);
  if(!cur.gender&&(g==='Nam'||g==='Nữ')){cur.gender=g;changed=true;}
  if(ended&&(cur.to===null||cur.to===undefined)){cur.to=Number.isFinite(ch)?Math.max(ch,Number.isFinite(cur.from)?cur.from:ch):null;changed=true;}
  return changed?'updated':'kept';
}
// Dòng quy tắc thêm vào prompt TRÍCH XUẤT (cùng lượt gọi sẵn có).
function personasPromptRule(){
  return `- "personas": CHỈ dùng khi 1 nhân vật đang CẢI DANH / mang THÂN PHẬN GIẢ (tên giả, cải trang, dùng danh xưng khác để che thân phận thật — KHÔNG tính biệt danh thường ngày, ngoại hiệu ai cũng biết, hay nhãn tạm do chưa biết tên) `+
    `và văn bản chương này NÓI THẲNG điều đó. Mỗi mục: {"who":"tên chính (name) của người THẬT","alias":"tên/danh xưng giả, viết đúng như bạn sẽ viết trong bản dịch","gender":"Nam"|"Nữ"|"" (giới tính mà thân phận giả thể hiện; để rỗng nếu không khác người thật hoặc không rõ),`+
    `"action":"active"|"ended","knownBy":["tên chính những nhân vật BIẾT ĐÚNG người thật (không tính chính "who"), tính đến hết chương này"],"evidence":"trực tiếp","quote":"..."}. `+
    `"active": trong chương này người đó đang mang thân phận giả; "ended": thân phận giả bị lộ hoặc được bỏ ngay trong chương này. "knownBy" CHỈ ghi người mà văn bản cho thấy rõ là đã biết sự thật (tự mình nhìn ra, được kể, được nói thẳng) — không đoán, người nghi ngờ chưa chắc thì không ghi. `+
    `"quote": chép NGUYÊN VĂN, đúng ngôn ngữ của VĂN BẢN GỐC, 1 đoạn ngắn nói rõ chuyện cải danh/lộ thân phận; hệ thống sẽ TÌM LẠI, không thấy thì bỏ cả mục. `+
    `Danh sách "đã biết" có thể kèm "personas" của nhân vật (thân phận giả đang dùng và ai biết): nếu chương này chỉ có thêm người biết hoặc thân phận bị lộ thì báo lại đúng "alias" đó, đừng tạo alias mới. Để mảng rỗng nếu không có.\n`;
}
// Xử lý "personas" AI trả về. ctx={chapterIdx, srcText}. Trả mảng kết quả từng mục (để log/test).
function applyPersonas(personas,ctx){
  const out=[];
  if(!Array.isArray(personas)||!personas.length)return out;
  const srcKey=(ctx&&ctx.srcText)?addrQuoteKey(ctx.srcText):'';
  const chapterIdx=(ctx&&Number.isFinite(ctx.chapterIdx))?ctx.chapterIdx:null;
  for(const r of personas.slice(0,10)){
    if(!r||typeof r!=='object'||!r.who||!r.alias)continue;
    const c=findCharByNameOrAlias(String(r.who));
    if(!c){out.push({who:String(r.who),result:'skip-who'});continue;}
    const quote=String(r.quote||'').trim(),qKey=addrQuoteKey(quote);
    if(!(r.evidence==='trực tiếp'&&srcKey&&qKey.length>=(containsCJK(quote)?4:8)&&srcKey.includes(qKey))){out.push({who:c.name,alias:String(r.alias),result:'skip-evidence'});continue;}
    const kb=[];
    (Array.isArray(r.knownBy)?r.knownBy:[]).forEach(n=>{const k=findCharByNameOrAlias(String(n||''));if(k&&k.id!==c.id&&!kb.includes(k.id))kb.push(k.id);});
    const action=r.action==='ended'?'ended':'active';
    const res=setPersona(S.characters,c,{alias:r.alias,gender:r.gender,action,knownBy:kb,chapter:chapterIdx,src:'ai',evidence:quote});
    out.push({who:c.name,alias:String(r.alias),action,result:res,knownBy:kb.length});
  }
  return out;
}
// Mặt nạ ĐANG MỞ của c, dạng gọn để gửi kèm danh sách "đã biết" (AI biết đã có gì mà báo tiếp đúng alias).
function knownPersonasForPrompt(list,c){
  const ps=(Array.isArray(c&&c.personas)?c.personas:[]).filter(p=>p.to===null||p.to===undefined);
  if(!ps.length)return undefined;
  return ps.map(p=>({alias:p.alias,gender:p.gender||undefined,knownBy:personaKnownIds(p).map(id=>(list.find(x=>x&&x.id===id)||{}).name).filter(Boolean)}));
}
// Các dòng cho prompt DỊCH. opts={chapterIdx?, chapterText?}. appeared + (nếu có chapterText) mọi nhân vật có alias nằm trong chương.
function personaContextLines(list,appeared,opts){
  const ch=opts&&Number.isFinite(opts.chapterIdx)?opts.chapterIdx:NaN;
  const chap=opts&&opts.chapterText?String(opts.chapterText).normalize('NFC').toLowerCase():'';
  const pool=[];const add=c=>{if(c&&c.id&&!pool.includes(c))pool.push(c);};
  (appeared||[]).forEach(add);
  if(chap)(list||[]).forEach(c=>{if(c&&Array.isArray(c.personas)&&c.personas.some(p=>chap.includes(_personaKey(p.alias))))add(c);});
  const lines=[];
  const _presentIds=new Set((appeared||[]).map(o=>o&&o.id));
  pool.forEach(c=>{
    (Array.isArray(c.personas)?c.personas:[]).forEach(p=>{
      if(!personaActiveAt(p,ch))return;
      // Văn bản gửi đi KHÔNG thay biệt danh/thân phận/xưng hô (chỉ tên nhân vật được thay 1 lần), nên có thể dò tên giả ngay trong chương.
      // Có chapterText: chỉ in thân phận khi tên giả có trong chương HOẶC chương này là chương lộ/bỏ thân phận. Không có chapterText: giữ hành vi cũ.
      if(chap&&!(Number.isFinite(ch)&&p.to===ch)&&!chap.includes(_personaKey(p.alias)))return;
      const knownAll=personaKnownIds(p,ch).map(id=>({id,name:(list.find(x=>x&&x.id===id)||{}).name})).filter(k=>k.name);
      // Chỉ nêu người biết đang có mặt trong chương (không mớm tên người vắng mặt).
      const known=(chap?knownAll.filter(k=>_presentIds.has(k.id)):knownAll).map(k=>k.name);
      const g=p.gender?` (thể hiện là ${p.gender})`:'';
      // Có người biết nhưng vắng mặt -> không khẳng định "chưa ai biết" (sai sự thật), bỏ câu đó.
      const knownTxt=known.length?`Người BIẾT thân phận thật: ${known.join(', ')}.`:(knownAll.length?'':'Chưa ai khác biết thân phận thật.');
      if(Number.isFinite(ch)&&p.to===ch)
        lines.push(`- ${c.name} bỏ/bị lộ thân phận "${p.alias}"${g} ngay trong chương này. ${knownTxt} Trước đoạn lộ: người chưa biết vẫn chỉ gọi/nhắc người này là "${p.alias}"; từ đoạn lộ trở đi mới chuyển sang tên thật "${c.name}".`);
      else
        lines.push(`- ${c.name} đang dùng thân phận "${p.alias}"${g}. ${knownTxt} Mọi người còn lại chỉ biết người này là "${p.alias}".`);
    });
  });
  if(!lines.length)return [];
  return ['THÂN PHẬN GIẢ / CẢI DANH (theo chương này):',...lines,
    '- Quy tắc: lời thoại và lời nhắc tới của người KHÔNG biết thân phận thật PHẢI dùng thân phận giả (tên giả đã ghi, và đại từ đúng giới tính mà thân phận đó thể hiện nếu có ghi), TUYỆT ĐỐI không để họ nói ra tên thật; lời nói/suy nghĩ của người BIẾT thì dùng tên thật; văn trần thuật theo đúng cách bản gốc đang gọi (gốc còn gọi bằng tên giả thì giữ tên giả, không tự lộ sớm). Giới tính/xưng hô đã lưu ở danh sách trên là của NGƯỜI THẬT; khi người khác nói với thân phận giả thì chọn xưng hô theo vai mà thân phận giả thể hiện trong bản gốc.'];
}
// Khi gộp record fromId vào toId (mergeCharacterInto): mặt nạ của from sang to; mọi knownBy trỏ from đổi sang to (bỏ tự trỏ, trùng).
function repointPersonas(list,fromId,toId){
  if(!fromId||!toId||fromId===toId)return;
  const from=(list||[]).find(c=>c&&c.id===fromId),to=(list||[]).find(c=>c&&c.id===toId);
  (list||[]).forEach(c=>{
    if(!c||!Array.isArray(c.personas))return;
    c.personas.forEach(p=>{
      const seen=new Set(),kb=[];
      (p.knownBy||[]).forEach(k=>{
        const id=k.id===fromId?toId:k.id;
        if(id===c.id&&c.id!==fromId||seen.has(id))return;
        seen.add(id);kb.push({id,chapter:k.chapter});
      });
      p.knownBy=kb;
    });
  });
  if(from&&Array.isArray(from.personas)&&from.personas.length&&to){
    const mine=Array.isArray(to.personas)?to.personas:[];
    from.personas.forEach(p=>{
      const q={...p,knownBy:(p.knownBy||[]).filter(k=>k.id!==toId)};
      if(!mine.some(m=>_personaKey(m.alias)===_personaKey(q.alias)&&m.from===q.from))mine.push(q);
    });
    to.personas=mine.slice(-CHARMEM_PERSONA_MAX);
    delete from.personas;
  }
}
// Khi xoá hẳn 1 nhân vật: bỏ mọi knownBy trỏ tới nó (mặt nạ của nó đi theo record).
function dropPersonaRefs(list,id){
  (list||[]).forEach(c=>{
    if(!c||!Array.isArray(c.personas))return;
    c.personas.forEach(p=>{p.knownBy=(p.knownBy||[]).filter(k=>k.id!==id);});
  });
}
// ===== PERSONA END =====

// ===== BUILD CONTEXT CHO REQUEST DỊCH =====
// promptGuidance: tham số TUỲ CHỌN — nếu nơi gọi đã có sẵn bản promptGuidance (VD đã gọi
// getMainPromptGuidance() cho prompt dịch chính), TRUYỀN VÀO đây để dùng thẳng, chính xác hơn; nếu
// không truyền, tự lùi về đọc cache đồng bộ qua getCachedPromptGuidanceSync() — vẫn tương thích ngược
// với các lời gọi cũ chỉ truyền đúng 1 tham số appearedChars.
// opts: TUỲ CHỌN {chapterText, chapterIdx} — văn bản + chỉ số chương đang dịch: lọc cột "Cách gọi khác" của bảng cast (4.1) và chọn đúng thân phận giả theo chương (4.2).
// Quy tắc ĐỐI XỨNG/TƯƠNG HỖ cho xưng hô giữa 2 nhân vật PHỤ (cặp không có dòng mặc định). Lỗi hay gặp khi model tự suy từng lượt thoại:
// một bên "em/mình", bên kia "tôi/mày"; trộn tự xưng của nhiều cặp ("em" rồi "mình" rồi "tôi" trong CÙNG lượt); hai chiều không khớp nhau.
const CHARMEM_PEER_RECIPROCITY_RULE=
  '- Xưng hô giữa các nhân vật phụ phải đúng vai vế và cảm xúc của cảnh, đối xứng hai chiều (mỗi lượt thoại dùng nguyên 1 cặp "tự xưng/gọi", không trộn từ của cặp khác).';
function _buildCharacterContextTextRaw(appearedChars,promptGuidance,opts){
  const _pg=promptGuidance!==undefined?promptGuidance:getCachedPromptGuidanceSync();
  const addrPreset=getAddrPreset(_pg);
  // Khối thể loại được gửi CẢ KHI chương chưa có nhân vật nào trong bộ nhớ — sắc thái thể loại không phụ thuộc bộ nhớ nhân vật.
  const genreBlock=addrPreset?AddrPresets.blockForTranslate(addrPreset):'';
  if(!appearedChars||!appearedChars.length)return genreBlock.trim();
  const addrGenreSystem=detectAddrGenreSystem(_pg);
  // Xưng hô ĐÃ LƯU (do AI, chưa được người dùng khoá) mà lệch thể loại -> bỏ khỏi prompt, không sửa dữ liệu gốc.
  const _ctxAddr=(c,v)=>{if(!v||!addrPreset||c.addrSource==='user')return{text:v,dropped:[]};const f=AddrPresets.filterAddr(v,addrPreset);return f.dropped.length?f:{text:v,dropped:[]};};
  let out=genreBlock+'Đảm bảo thông tin các nhân vật sau đây được dịch chính xác và nhất quán:\n\n';
  // 4.1: bảng cast tra nhanh ở đầu khối (opts.chapterText tuỳ chọn -> chỉ liệt kê cách gọi khác có trong chương).
  if(castTableOn())out+=buildCastTable(S.characters,appearedChars,{chapterText:opts&&opts.chapterText});
  appearedChars.forEach(c=>{
    // Dòng định danh gọn (tên, giới tính, tên gọi khác, tên gốc, chức danh, liên kết) — không còn note/độ tuổi.
    out+=_charContextLine(c,appearedChars)+'\n';
    const _sh=resolveSharedAddr(S.characters,c);
    if(!isCharProtagonist(c)&&c.relationship&&!isUnknownVal(c.relationship))out+=`   Mối quan hệ với nhân vật chính: ${c.relationship}\n`;
    if(!isCharProtagonist(c)&&c.affinity&&!isUnknownVal(c.affinity))out+=`   Độ thiện cảm với nhân vật chính (hiện tại): ${c.affinity}\n`;
    const _aT=_ctxAddr(_sh.from.addrThemToMc||c,_sh.addrThemToMc),_aM=_ctxAddr(_sh.from.addrMcToThem||c,_sh.addrMcToThem);
    if(_aT.text&&!isAddrUnknown(_aT.text))out+=`   Đại từ dịch khi ${c.name} nói với nhân vật chính (định dạng "đại từ ngôi 1/đại từ ngôi 2", thay cho 我/你): ${_aT.text}\n`;
    if(_aM.text&&!isAddrUnknown(_aM.text))out+=`   Đại từ dịch khi nhân vật chính nói với ${c.name} (định dạng "đại từ ngôi 1/đại từ ngôi 2", thay cho 我/你): ${_aM.text}\n`;
    const _dropped=_aT.dropped.concat(_aM.dropped);
    if(_dropped.length)out+=`   (Xưng hô cũ "${_dropped.join(', ')}" lệch thể loại của truyện nên bỏ qua — chọn cặp hợp vai vế từ bộ xưng hô thường gặp ở đầu.)\n`;
    if(dropEmFromFemaleNarrRef(c,_sh.narrRef)&&!isNarrRefUnknown(dropEmFromFemaleNarrRef(c,_sh.narrRef)))out+=`   Cách gọi NGÔI THỨ 3 khi TƯỜNG THUẬT/nói VỀ ${c.name} (không phải khi nói trực tiếp với ${c.name}), các lựa chọn tuỳ góc nhìn: ${dropEmFromFemaleNarrRef(c,_sh.narrRef)}\n`;
  });
  out+='\n';
  // Cặp PHỤ–PHỤ (không ai là nhân vật chính) KHÔNG có addrThemToMc/addrMcToThem. Trước đây cạnh quan hệ đã trích xuất (edges) và
  // hàm buildPeerAddrDefaults có sẵn nhưng không được gửi cho model dịch -> model tự bịa từng lượt thoại (VD cha–con: "tôi… mày… tao").
  try{
    const _peerLines=buildPeerAddrDefaults(S.characters,appearedChars,addrPreset,8);
    if(_peerLines.length)out+='Xưng hô giữa các nhân vật phụ:\n'+_peerLines.join('\n')+'\n\n';
  }catch(e){console.warn('[Luồng 1][Xưng hô phụ–phụ] bỏ qua do lỗi:',e);}
  out+='Yêu cầu:\n'+
    '- ⚠ GIỮ NGUYÊN Ý NGHĨA CÁCH GỌI CỦA BẢN GỐC: biệt danh, chức danh, danh xưng vai vế (VD lão Vương, Vương thúc, Vương sát thủ, sư huynh/sư đệ, thúc...) phải dịch đúng nghĩa như bản gốc, TUYỆT ĐỐI KHÔNG thay bằng tên nhân vật hay từ khác, không thêm/bớt/đổi vai vế. Tên chính, giới tính, xưng hô ghi ở trên chỉ để hiểu danh tính, KHÔNG dùng để thay từ gốc. Chỉ được đổi khi bản gốc dùng ĐẠI TỪ TRUNG TÍNH (ta/ngươi, 我/你, I/you...) không hợp văn hoá Việt: khi đó chọn cặp hợp quan hệ (VD con nói với mẹ: con/mẹ hoặc con/người); còn từ vai vế bản gốc đã có thì giữ y nguyên.\n'+
    '- '+(appearedChars.some(c=>charReplacedOrigList(c).length)?'Tên có ghi "tên gốc" đã được thay sẵn bằng tên chính trong văn bản: GIỮ NGUYÊN VĂN tên chính, KHÔNG phiên âm lại. ':'')+'Bản gốc viết tên nào thì dịch đúng tên đó, không đổi sang tên khác của cùng một người (tên gọi khác, thân phận khác, mục "cũng gọi", "cùng người với" — chỉ để hiểu danh tính, giới tính, xưng hô). Biệt danh dịch theo ngữ cảnh nhưng vẫn áp đúng giới tính, quan hệ, xưng hô của người đó. TÊN LÁY (2 chữ giống nhau như 淘淘, 圆圆, 团团): đã là TÊN riêng thì dịch đúng dạng láy (VD 淘淘 → "Đào Đào"), KHÔNG tự thêm "bé/tiểu/nhỏ/A" hay rút còn 1 chữ ("bé Đào", "Tiểu Đào", "Đào") — chỉ thêm khi bản gốc thật sự có chữ đó (小/阿/宝/娃...).\n'+
    '- "Độ thiện cảm" (nếu có) cho biết mức gần gũi hiện tại: khi nhân vật có NHIỀU cặp xưng hô, lời thoại lạnh nhạt/giận dữ/khách sáo chọn cặp xa cách hơn, lời thoại thân mật chọn cặp gần gũi hơn. Không bao giờ dùng TÊN RIÊNG thay cho đại từ trong cặp xưng hô.\n'+
    '- Dùng đúng giới tính, quan hệ và mọi thông tin đã cung cấp; không tự sửa, và thông tin "Chưa rõ" thì không tự biến thành thông tin cụ thể khi bản gốc thiếu bằng chứng.\n'+
    '- Đã có xưng hô cụ thể: mỗi giá trị gồm 1 hoặc nhiều cặp "đại từ ngôi 1/đại từ ngôi 2" (dấu "/" ngăn ngôi 1 và ngôi 2 trong CÙNG 1 cặp, dấu phẩy ngăn các cặp) — chọn nguyên 1 cặp hợp đoạn thoại nhất, không phối xưng của cặp này với hô của cặp khác. KHÔNG nâng mức thân mật/tôn ti lên cao hơn bản gốc: bản gốc dùng đại từ trung tính giữa 2 người thì giữ trung tính, cùng lắm nới một bậc, không nhảy thẳng lên xưng hô thân thiết trừ khi chính câu thoại gốc dùng từ tương đương. Cặp này chỉ thay ĐẠI TỪ TRUNG TÍNH; bản gốc đã dùng từ vai vế/danh xưng (sư huynh, thúc, lão...) thì giữ nguyên, không thay bằng cặp này.\n'+
    '- ⚠ ĐẠI TỪ ≠ DANH XƯNG GỌI: cặp "ngôi 1/ngôi 2" ở trên CHỈ dùng để dịch đại từ trung tính ngôi 1/ngôi 2 của BẤT KỲ ngôn ngữ nguồn nào (我/你, I/you, 私/あなた, 나/너, ta/ngươi...) trong lời thoại; danh xưng bản gốc gọi người nghe (mẹ/Mom/お母さん/엄마, Lưu thúc/Uncle Liu, ca ca, sư huynh, lão sư...) luôn GIỮ NGUYÊN, không bị cặp này thay. '+
    'Khi trong CÙNG 1 câu/lượt thoại đã có danh xưng gọi người nghe, KHÔNG lặp lại đúng từ đó làm đại từ ngôi 2 (SAI: "Mẹ, mẹ đang làm gì thế?", "Lưu thúc, Lưu thúc mệt rồi hả?", "Ca ca, ca ca đi đâu?"). Nếu từ ngôi 2 trong cặp trùng/gần trùng danh xưng đó thì đổi sang đại từ ngôi 2 TỰ NHIÊN cùng cấp, theo hệ truyện: bậc trên/kính trọng hệ cổ trang-tu tiên → "người"/"ngài"; ngang hàng kiểu huynh-muội → "huynh"/"tỷ"/"muội"/"đệ"; đời thường/hiện đại → "cậu"/"anh"/"chị"/"em", hoặc bỏ hẳn đại từ nếu câu vẫn rõ nghĩa. '+
    'VD đúng: "妈，你在做什么？我饿了" → "Mẹ, người đang làm gì thế? Con đói rồi"; "刘叔，你累了吗？我给你拿水" → "Lưu thúc, người mệt rồi hả? Con lấy nước cho người"; "哥哥，我和你比剑" → "Ca ca, muội và huynh so kiếm đi"; "我最喜欢和哥哥玩" → "Muội thích chơi với ca ca nhất" (danh xưng ở ngôi 3 vẫn giữ). Nguồn khác tiếng Trung áp dụng y hệt: "Mom, what are you doing? I am hungry" → "Mẹ, người đang làm gì thế? Con đói rồi" (cổ trang) hoặc "Mẹ ơi, mẹ làm gì thế? Con đói rồi" (đời thường, hiện đại — lặp "mẹ" chấp nhận được khi tự nhiên); hệ hiện đại/phương Tây thì ưu tiên cách tự nhiên của tiếng Việt đời thường, KHÔNG ép "người/ngài/huynh/muội" khi không hợp thể loại. '+
    'Từ ngôi 1 trong cặp (con, muội, đệ, ta, tôi...) vẫn dùng bình thường; có nhiều lựa chọn thì chọn lựa chọn có ngôi 2 KHÔNG trùng danh xưng đang gọi.\n'+
    '- Chưa có xưng hô cụ thể: tự chọn 1 cặp hợp văn phong, thể loại, độ tuổi và giữ nhất quán suốt đoạn thoại (chỉ cho đại từ trung tính; từ vai vế/danh xưng bản gốc dùng thì giữ nguyên). Nhãn "Mối quan hệ" chỉ là vai vế, không phải chỉ định xưng hô; không dùng từ gia đình/họ hàng khi bản gốc không xác nhận có quan hệ họ hàng thật. Nếu chưa rõ quan hệ giữa 2 nhân vật thì KHÔNG tự đặt xưng hô xác định quan hệ (bố/mẹ/con/anh/em...) và không thêm danh từ quan hệ vào lời dẫn; chỉ dùng xưng hô trung tính theo thể loại (cổ trang: ta/ngươi; hiện đại: tôi/anh, tôi/chị, tôi/cậu).\n'+
    '- Danh xưng/chức vụ (bệ hạ, tướng quân, giáo sư...) dịch đúng như bản gốc dùng ở từng chỗ: gốc gọi ở câu nào thì giữ ở câu đó, không tự thêm, bớt hay đổi sang đại từ/tên. Từ huyết thống (anh/em, chị/em, ca ca/muội...) là hai chiều: xác định ai đang nói với ai rồi mới chọn từ, để câu "anh về rồi" không bị đảo thành "em về rồi".\n'+
    '- Xưng hô thoại trực tiếp và "Cách gọi NGÔI THỨ 3 khi tường thuật" là hai thứ riêng, không dùng lẫn.\n'+
    '- ⚠ NGÔI THỨ 3 KHI TƯỜNG THUẬT: gặp đại từ ngôi thứ 3 của bản gốc (他/她/he/she...) chỉ nhân vật có dòng "Cách gọi NGÔI THỨ 3" ở trên, hãy ưu tiên chọn trong chính các cách gọi đó, theo giọng văn và cảm xúc của đoạn (căm ghét, khinh bỉ, thân thiết, trang trọng...). Chỉ bỏ qua bộ nhớ khi có cách gọi hợp hơn thật sự: bản gốc đã gọi bằng tên/chức danh/biệt danh cụ thể thì giữ nguyên; hoặc không lựa chọn nào khớp sắc thái đoạn đó thì chọn đại từ ngôi thứ 3 phù hợp hơn. Nhân vật chưa có cách gọi ngôi thứ 3 thì chọn đại từ hợp giới tính, vai vế, thể loại rồi giữ nhất quán.\n'+
    '- ⚠ NGÔI THỨ 3 CHO NHÂN VẬT NỮ: TUYỆT ĐỐI KHÔNG dùng "em" ("em ấy") để chỉ nhân vật nữ khi tường thuật/nói VỀ họ ("em" chỉ được dùng khi họ TỰ XƯNG hoặc được gọi trực tiếp trong thoại, theo xưng hô đã lưu). Chọn theo độ tuổi, mối quan hệ, độ thiện cảm: người trẻ/trưởng thành → "cô", "cô ấy", "cô ta" (xa cách/thù địch có thể "ả", "mụ"); bé gái/thiếu nữ nhỏ → "cô bé", "con bé", "bé"; trung niên/cao tuổi → "bà", "bà ấy", "bà ta", "cụ". Truyện huyền huyễn/tiên hiệp/cổ trang dùng "nàng" ("nàng ấy") thay cho "cô" — bộ "cô bé/bà" vẫn dùng khi hợp tuổi. TUYỆT ĐỐI KHÔNG dùng "thị" làm đại từ ngôi thứ 3 (cách gọi lạ, không tự nhiên).\n'+
    '- ⚠ MỘT LƯỢT THOẠI = MỘT CẶP TỰ XƯNG: trong cùng 1 lời thoại (từ mở đến đóng ngoặc kép) của 1 nhân vật nói với 1 người, chỉ dùng đúng 1 cặp tự xưng/gọi từ đầu đến cuối, KỂ CẢ ở các cụm quen miệng như "đừng trách tôi", "để tôi", "cho tôi", "của tôi", "đừng trách ta" — những cụm này rất dễ trượt về "tôi" theo thói quen dù cả lời đang xưng tao/mày (hoặc ta/ngươi...). SAI: "Dù mày là ai, dám ra tay với tao... thì đừng trách tôi không nể tình!" ĐÚNG: "Dù mày là ai, dám ra tay với tao... thì đừng trách tao không nể tình!". Chỉ đổi cặp giữa chừng khi bản gốc đổi rõ (đổi người nghe, đổi thái độ). Soát lại từng lời thoại trước khi xuất.\n'+
    '- ⚠ TỰ THOẠI DÙNG "MÌNH": khi nhân vật tự nói với chính mình (độc thoại, lẩm bẩm, nghĩ thầm, tự hỏi, tự nhủ — không có người nghe), tự chỉ bản thân bằng "mình", KHÔNG dùng tôi/anh/em/cô... như khi nói với người khác. SAI: "Thứ mà Nhân ca để lại cho tôi rốt cuộc là cái gì?" ĐÚNG: "Thứ mà Nhân ca để lại cho mình rốt cuộc là cái gì?". Ngoại lệ: truyện cổ trang/tiên hiệp mà nhân vật vốn tự xưng "ta"/"bản tọa"/"bổn cung"... thì giữ cách tự xưng đó. Lời nói với người khác vẫn theo bảng xưng hô như thường.\n';

  // Quy tắc tương hỗ/1 bộ cho cặp phụ–phụ: trước đây CHARMEM_PEER_RECIPROCITY_RULE chỉ được khai báo, không bao giờ gửi đi.
  if(appearedChars.filter(c=>!isCharProtagonist(c)).length>=2)out+=CHARMEM_PEER_RECIPROCITY_RULE+'\n';
  // 4.2: thân phận giả đang hiệu lực ở chương này (opts.chapterIdx/chapterText tuỳ chọn; thiếu chapterIdx thì chỉ tính mặt nạ còn mở).
  if(personaOn()){
    try{
      const _pl=personaContextLines(S.characters,appearedChars,{chapterIdx:opts&&opts.chapterIdx,chapterText:opts&&opts.chapterText});
      if(_pl.length)out+='\n\n'+_pl.join('\n');
    }catch(e){}
  }
  return out;
}

// Bỏ hậu tố " (n)" khỏi MỌI chỗ tên nhân vật xuất hiện trong khối ngữ cảnh (danh sách, bảng cast, xưng hô phụ-phụ, thân phận giả).
function stripDupSuffixFromText(text,appeared){
  if(!text)return text;
  const pairs=[];
  (S.characters||[]).forEach(c=>{const n=String(c&&c.name||'').trim(),d=displayCharName(c);if(n&&d&&d!==n)pairs.push([n,d]);});
  if(!pairs.length)return text;
  pairs.sort((a,b)=>b[0].length-a[0].length);
  let out=text;
  pairs.forEach(([n,d])=>{out=out.split(n).join(d);});
  const used=(appeared||[]).some(c=>pairs.some(([n])=>n===String(c&&c.name||'').trim()));
  if(used)out+='\n\nLưu ý: một số nhân vật ở trên có TÊN GIỐNG NHAU nhưng là những người khác nhau — phân biệt bằng giới tính/ngữ cảnh. Trong bản dịch chỉ viết tên đúng như đã ghi, KHÔNG thêm hậu tố số như "(2)".';
  return out;
}
// Bản CHUNG (đích ≠ vi) của khối nhân vật gửi kèm prompt dịch: tiếng Anh, chỉ tên/giới tính/quan hệ/tuổi/ghi chú — không xưng hô.
function buildCharacterContextTextGeneric(appearedChars){
  if(!appearedChars||!appearedChars.length)return '';
  const lbl=(kind,v)=>{try{return charmemStdLabel(kind,v,'en');}catch(e){return v;}};
  let out='Keep the following characters correct and consistent in the translation:\n\n';
  appearedChars.forEach((c,idx)=>{
    const nm=displayCharName(c);
    out+=`${idx+1}. Name: ${nm}${isCharProtagonist(c)?' (protagonist)':''}\n`;
    const replaced=charReplacedOrigList(c);
    if(replaced.length)out+=`   Source name(s) ${replaced.join(', ')} have ALREADY been replaced in the text by "${nm}" — keep "${nm}" verbatim.\n`;
    const aliases=(c.aliases||[]).filter(a=>a&&String(a).trim()&&String(a).trim()!==nm&&!replaced.includes(a));
    if(aliases.length)out+=`   Also called (same person; for recognition only): ${aliases.join(', ')}\n`;
    if(c.isHuman===false&&isUnknownVal(c.gender))out+=`   Not a person (animal/object/system…): no gender — do not use he/she for it unless the source does.\n`;
    else if(!isUnknownVal(c.gender))out+=`   Gender: ${_gEn(normalizeGenderValue(c.gender))}\n`;
    else if(normalizeGenderValue(c.genderHint)!=='Chưa rõ'){let cf='';try{cf=charmemGenderConf(c);}catch(e){}out+=`   Gender: ${_gEn(normalizeGenderValue(c.genderHint))} (a guess${cf?', ~'+cf+'% sure':''} — if the text of this chapter clearly shows otherwise, follow the text)\n`;}
    if(!isCharProtagonist(c)&&c.relationship&&!isUnknownVal(c.relationship))out+=`   Relationship to the protagonist: ${lbl('rel',c.relationship)}\n`;
    if(!isCharProtagonist(c)&&c.affinity&&!isUnknownVal(c.affinity))out+=`   Affinity with the protagonist: ${lbl('aff',c.affinity)}\n`;
    if(c.statusCue&&!isUnknownVal(c.statusCue))out+=`   Age group: ${lbl('age',c.statusCue)}\n`;
    if(c.note&&c.note.trim())out+=`   Notes: ${c.note.trim()}\n`;
    out+='\n';
  });
  out+='Rules:\n- Use each name exactly as listed above; do not switch to another name or alias of the same person unless the source text itself does.\n'+
    '- Keep each character\'s gender consistent (matching pronouns and gendered words in the target language) and respect their relationship to the protagonist.\n'+
    '- Do not alter the information provided; where something is "Unknown" or missing, do not invent it.\n';
  return out;
}
function buildCharacterContextText(appearedChars,promptGuidance,opts){
  if(charmemGeneric())return buildCharacterContextTextGeneric(appearedChars);
  return stripDupSuffixFromText(_buildCharacterContextTextRaw(appearedChars,promptGuidance,opts),appearedChars);
}

// ===================================================================
// ===== TIỆN ÍCH XỬ LÝ FIELD XƯNG HÔ (nhiều-lựa-chọn "tự xưng/gọi đối phương") =====
// ===================================================================
// Chuẩn hoá để so khớp không phân biệt hoa/thường và cách dựng dấu tiếng Việt (NFC).
function normAddrWord(s){return (s||'').toLowerCase().normalize('NFC').trim();}
// Mỗi ô xưng hô lưu 1 hoặc NHIỀU "lựa chọn" (cách nhau bằng dấu phẩy (,), chấm phẩy (;) hoặc chữ
// "hoặc") — nhiều lựa chọn xảy ra khi nhân vật dùng nhiều cách xưng hô khác nhau tuỳ ngữ cảnh
// (VD lúc nghiêm túc "muội/ca ca", lúc nhõng nhẽo "tiểu muội/đại ca" — cả 2 đều đúng, không phải
// lỗi). MỖI lựa chọn tự nó là 1 cặp TRỌN VẸN "tự xưng/gọi đối phương" (xem parseAddrChoice) —
// dấu gạch chéo (/) KHÔNG phải là dấu ngăn cách giữa các lựa chọn, mà nằm BÊN TRONG 1 lựa chọn để
// tách xưng và hô. VD: "ta/ngươi, ta/ngài" = 2 lựa chọn hợp lệ; "ta/ngươi" KHÔNG được hiểu thành
// 2 lựa chọn rời "ta" và "ngươi" như trước đây (đó là bug cũ khiến "ta/ngươi" so với chính nó bị
// báo mâu thuẫn — vì so sánh nguyên cụm chưa tách với từng mảnh đã tách). Hàm này CHỈ tách theo
// lựa chọn (không đụng vào dấu /); dùng parseAddrChoice để tách tiếp xưng/hô trong 1 lựa chọn.
function splitAddrCandidates(raw){
  return (raw||'').split(/[,;]|\s+hoặc\s+/i).map(s=>s.trim()).filter(Boolean);
}
// Tách 1 lựa chọn xưng hô (đã lấy từ splitAddrCandidates) thành 2 phần theo dấu "/" ĐẦU TIÊN:
// {self: tự xưng, other: cách gọi đối phương}. Cho phép nhập tắt không có "/" khi chỉ muốn ghi
// cách gọi đơn thuần, không khai tự xưng — lúc đó self rỗng, other là cả chuỗi.
function parseAddrChoice(choice){
  const s=(choice||'').trim();
  const i=s.indexOf('/');
  if(i===-1)return{self:'',other:s};
  return{self:s.slice(0,i).trim(),other:s.slice(i+1).trim()};
}
// Coi 1 giá trị xưng hô là "chưa có dữ liệu" nếu: rỗng, đúng bằng "Chưa rõ", là 1 ký hiệu "rỗng"
// kiểu bảng biểu mà AI hay lỡ ghi thay vì "Chưa rõ" (VD "-", "n/a", "không có" — xem isPlaceholderJunk),
// HOẶC sau khi tách theo splitAddrCandidates thì TẤT CẢ các lựa chọn đều rơi vào 1 trong các trường
// hợp trên — bắt cả kiểu AI lỡ viết "Chưa rõ / Chưa rõ" hoặc "- / -" (nhầm áp dụng định dạng
// "tự xưng / gọi đối phương" cho lúc không xác định được, thay vì chỉ ghi đúng 1 chữ "Chưa rõ" như
// yêu cầu trong prompt). Dùng hàm này ở MỌI nơi cần hỏi "field xưng hô này đã có giá trị thật chưa"
// thay vì so sánh === 'Chưa rõ' trực tiếp — so === sẽ để lọt các ký hiệu rác này qua như 1 xưng hô
// "thật", rồi bị lưu vào nhân vật và gửi kèm vào prompt dịch như thể đã xác định được.
function isAddrUnknown(v){
  const t=(v||'').normalize('NFC').trim();
  if(!t)return true;
  const cands=splitAddrCandidates(t);
  if(!cands.length)return true;
  const isJunkWord=w=>w==='chưa rõ'||isPlaceholderJunk(w);
  return cands.every(x=>{
    const{self,other}=parseAddrChoice(x);
    const parts=[self,other].filter(Boolean);
    if(!parts.length)return isJunkWord(normAddrWord(x));
    // 1 lựa chọn (VD "Chưa rõ/Chưa rõ") chỉ coi là "chưa có dữ liệu" khi CẢ 2 phần xưng và hô
    // đều rỗng/rác — còn nếu chỉ 1 phần rác nhưng phần kia có giá trị thật (VD "Chưa rõ/ngươi")
    // thì vẫn coi là ĐÃ có dữ liệu (phần "hô" đã xác định được dù chưa rõ tự xưng).
    return parts.every(p=>isJunkWord(normAddrWord(p)));
  });
}
// Field narrRef ("đại từ ngôi thứ 3 TRUNG TÍNH/phiếm chỉ khi TƯỜNG THUẬT/nói VỀ nhân vật — khác
// addrThemToMc/addrMcToThem là xưng hô/chức danh khi nói TRỰC TIẾP VỚI nhau) dùng CHUNG định dạng
// nhiều-lựa-chọn (splitAddrCandidates) nhưng KHÔNG có khái niệm "tự xưng/gọi đối phương" (không tách
// theo "/") — mỗi lựa chọn chỉ là 1 đại từ ngôi thứ 3 phiếm chỉ độc lập (VD "hắn", "tên đó", "nàng").
// Coi là "chưa có dữ liệu" nếu rỗng, đúng "Chưa rõ", hoặc mọi lựa chọn sau khi tách đều là rác (xem
// isPlaceholderJunk).
function isNarrRefUnknown(v){
  const t=(v||'').normalize('NFC').trim();
  if(!t)return true;
  const cands=splitAddrCandidates(t);
  if(!cands.length)return true;
  return cands.every(x=>{
    const w=normAddrWord(x);
    return w==='chưa rõ'||isPlaceholderJunk(w);
  });
}
// LƯỚI AN TOÀN CẤP CODE cho narrRef (phòng khi model rẻ không tuân đúng prompt): loại bỏ khỏi
// narrRef bất kỳ lựa chọn nào TRÙNG Y NGUYÊN với "relationship" đang lưu — lỗi hay gặp nhất là model
// lười copy thẳng relationship (VD "Sư tỷ") vào narrRef thay vì đọc thật xem chương tường thuật gọi
// nhân vật đó bằng gì, dù bản chất "Sư tỷ" chỉ là NHÃN QUAN HỆ chứ không phải bằng chứng tường thuật
// thật. Chỉ loại đúng lựa chọn trùng, không đụng các lựa chọn khác nếu narrRef có nhiều lựa chọn.
// Lưới an toàn: nhân vật NỮ thì narrRef (ngôi 3) không được có "em"/"em ấy"/"em ta" (em là xưng hô trực tiếp). Chỉ lọc lúc dựng prompt dịch, không sửa dữ liệu đã lưu.
function dropEmFromFemaleNarrRef(c,narrRefRaw){
  if(!c||normalizeGenderValue(c.gender)!=='Nữ'||isNarrRefUnknown(narrRefRaw))return narrRefRaw;
  return splitAddrCandidates(narrRefRaw).filter(x=>!/^em(\s+(ấy|ta|nó))?$/.test(normAddrWord(x))).join(', ');
}
function stripRelationshipCopyFromNarrRef(narrRefRaw,relationshipVals){
  if(isNarrRefUnknown(narrRefRaw))return narrRefRaw;
  const relSet=(relationshipVals||[]).map(normAddrWord).filter(r=>r&&r!=='chưa rõ');
  if(!relSet.length)return narrRefRaw;
  const kept=splitAddrCandidates(narrRefRaw).filter(x=>!relSet.includes(normAddrWord(x)));
  return kept.length?kept.join(', '):'Chưa rõ';
}
// Dọn dữ liệu nhân vật CŨ đã lỡ bị lưu nhầm giá trị "Chưa rõ"/"Chưa rõ / Chưa rõ" hoặc các ký hiệu
// "rỗng" kiểu bảng biểu (VD "-", "n/a", "không có"...) vào field xưng hô (do AI trả về sai định dạng
// prompt yêu cầu, hoặc bug encoding/định dạng ở các phiên bản trước) — reset về rỗng để field mở lại
// cho AI tự động điền đúng ở chương sau, và modal hiển thị ô trống thay vì hiện chữ rác. Đồng thời
// chuẩn hoá lại gender/relationship/statusCue về đúng literal "Chưa rõ" (NFC) nếu bị lệch encoding
// hoặc cũng là ký hiệu rác tương tự, để các so sánh === 'Chưa rõ' còn sót lại trong code không bị
// đánh lừa.
// QUAN TRỌNG: mọi bước dọn dưới đây CHỈ động vào field khi nguồn của nó KHÔNG PHẢI 'user' (tức đang
// do AI tự quản lý) — nếu bạn đã tự tay gõ/khoá 1 field nào đó trong modal (kể cả khi giá trị đó
// TRÙNG với ký hiệu "rác" theo isPlaceholderJunk, VD bạn cố tình gõ "-" để đánh dấu điều gì đó),
// giá trị đó KHÔNG bị đụng vào — giữ đúng nguyên tắc "user luôn được ưu tiên hơn ai" dùng nhất quán
// ở mọi nơi khác trong file này (xem applyCharField/userLocked, updateStatusCue). Trước bản sửa này,
// cleanup chạy vô điều kiện bất kể nguồn — cùng loại lỗ hổng đã phát hiện và vá riêng cho narrRef,
// nay áp dụng nhất quán cho toàn bộ field xưng hô/gender/relationship/statusCue.
// Trả về true nếu có ít nhất 1 nhân vật được dọn (để quyết định có cần lưu lại không).
// Thẻ kin thầy/trò bị ngược (VD đệ tử mà ghi role "thầy"): đối chiếu với relationship/note của CHÍNH nhân vật. Chỉ sửa khi
// bằng chứng 1 chiều rõ ràng (note/relationship có "đệ tử/đồ đệ/học trò ... của", và không có từ chỉ thầy trong relationship).
function fixKinDirection(c){
  if(!c||!c.kin||c.kinSource==='user')return false;
  if(c.kin.role!=='thầy'&&c.kin.role!=='trò')return false;
  const rel=String(c.relationship||'').normalize('NFC').toLowerCase();
  const txt=(rel+' ; '+String(c.note||'')).normalize('NFC').toLowerCase();
  const relTeacher=/(sư phụ|sư tôn|thầy|quán chủ|quan chủ|sư bá|sư thúc)/.test(rel);
  const relStudent=/(đệ tử|đồ đệ|học trò|môn đồ|đồ nhi)/.test(rel);
  const noteStudent=/(đệ tử|đồ đệ|học trò|môn đồ)[^;]*\bcủa\b/.test(txt);
  const noteTeacher=/(sư phụ|thầy|sư tôn)[^;]*\bcủa\b/.test(txt);
  let want=null;
  if(c.kin.role==='thầy'&&(relStudent||noteStudent)&&!relTeacher&&!noteTeacher)want='trò';
  else if(c.kin.role==='trò'&&relTeacher&&!relStudent&&!noteStudent)want='thầy';
  if(!want)return false;
  console.log(`[Luồng 1][Dọn dữ liệu cũ] Sửa kin ngược cho "${c.name}": ${c.kin.role} -> ${want}`);
  c.kin.role=want;return true;
}
function cleanupUnknownAddrValues(list){
  if(!Array.isArray(list))return false;
  let changed=false;
  list.forEach(c=>{
    if(c.addrSource!=='user'){
      if(c.addrThemToMc&&isAddrUnknown(c.addrThemToMc)){c.addrThemToMc='';changed=true;}
      if(c.addrMcToThem&&isAddrUnknown(c.addrMcToThem)){c.addrMcToThem='';changed=true;}
      if(!c.addrThemToMc&&!c.addrMcToThem&&c.addrTone&&c.addrTone!=='Chưa rõ'){c.addrTone='Chưa rõ';changed=true;}
    }
    if(c.narrRefSource!=='user'&&c.narrRef&&isNarrRefUnknown(c.narrRef)){c.narrRef='';changed=true;}
    // Dọn cặp xưng hô CŨ dính tên riêng (VD "tôi/Tô Nhàn, tôi/anh" -> "tôi/anh"); không đụng ô người dùng đã khoá.
    if(c.addrSource!=='user'){
      const _nm=_addrKnownNames();
      ['addrThemToMc','addrMcToThem'].forEach(fld=>{
        const cur=c[fld];if(!cur||isAddrUnknown(cur))return;
        const all=splitAddrCandidates(cur);
        const _rf=(typeof AddrPresets!=='undefined'&&AddrPresets&&typeof AddrPresets.regionalFix==='function')?AddrPresets.regionalFix:null;
        const fixed=all.map(ch=>{   // địa phương -> chuẩn (không có từ chuẩn thì bỏ cặp)
          if(!_rf)return ch;
          const ps=String(ch).split('/');if(ps.length>2)return ch;
          const r=ps.map(t=>_rf(t));
          if(r.some(x=>x.regional&&!x.standard))return '';
          return r.some(x=>x.regional)?r.map(x=>x.standard).join('/'):ch;
        }).filter(Boolean);
        const keep=fixed.filter((ch,i)=>fixed.indexOf(ch)===i).filter(ch=>!String(ch).split('/').some(tok=>addrTokenNameProblem(tok,_nm)));
        if(keep.length!==all.length||keep.some((x,i)=>x!==all[i])){c[fld]=keep.join(', ');changed=true;console.log('[Luồng 1][Dọn dữ liệu cũ] Bỏ cặp xưng hô dính tên riêng ở "'+c.name+'": '+cur+' -> '+(c[fld]||'(trống)'));}
      });
    }
    if(c.genderSource!=='user'&&c.gender&&isUnknownVal(c.gender)&&c.gender!=='Chưa rõ'){c.gender='Chưa rõ';changed=true;}
    // Dữ liệu cũ do AI lưu dạng lệch chuẩn ("nam", "Nữ giới", "Nam/Nữ"...) -> đưa về Nam/Nữ/Chưa rõ để so sánh
    // giới tính (tách/gộp nhân vật trùng tên) không bị lệch. Không đụng giới tính do người dùng tự chọn.
    if(c.genderSource!=='user'&&c.gender){
      const gn=normalizeGenderValue(c.gender);
      if(gn!==c.gender){c.gender=gn;changed=true;}
    }
    if(c.relationshipSource!=='user'&&c.relationship&&isUnknownVal(c.relationship)&&c.relationship!=='Chưa rõ'){c.relationship='Chưa rõ';changed=true;}
    if(c.statusCueSource!=='user'&&c.statusCue&&isUnknownVal(c.statusCue)&&c.statusCue!==''){c.statusCue='';changed=true;}
    // Dọn note CŨ đã lỡ tích luỹ các đoạn trùng ý (đảo từ/thiếu-đủ thông tin) từ trước khi có
    // dedupeNoteSegments — chỉ động vào khi note đang do AI tự quản lý, không đụng note người dùng
    // tự viết/khoá (giữ nguyên tắc "user luôn được ưu tiên hơn ai" dùng nhất quán trong hàm này).
    if(c.noteSource!=='user'&&c.note){
      const deduped=dedupeNoteSegments(c.note);
      if(deduped!==c.note){c.note=deduped;changed=true;}
    }
    // Cờ nameTransChecked ghi nhầm cho nhân vật chưa có tên gốc thật / đang là nhãn -> gỡ (không đụng tên do người dùng chốt).
    if(c.nameTransChecked&&c.nameSource!=='user'&&(c.namePlaceholder||!charOrigNameList(c).length)){delete c.nameTransChecked;changed=true;}
    if(fixKinDirection(c))changed=true;
    if(cleanupLabelDuplicateFromExistingNarrRef(c))changed=true;
    if(cleanupDescriptiveNarrRef(c))changed=true;
  });
  if(changed)console.log('[Luồng 1][Dọn dữ liệu cũ] Đã dọn xưng hô "Chưa rõ" bị lưu nhầm ở dữ liệu cũ (chỉ với field do AI tự quản lý).');
  return changed;
}
// Dọn narrRef CŨ đã lỡ bị lưu trùng y hệt relationship/statusCue của chính nhân vật đó (lỗi model
// copy nhãn thay vì đọc tường thuật thật — xem stripRelationshipCopyFromNarrRef). CHỈ áp dụng khi
// narrRefSource !== 'user': nếu bạn đã tự tay gõ/khoá narrRef trong modal (kể cả khi giá trị đó
// TRÙNG với relationship/statusCue — có thể truyện của bạn cố tình dùng lối xưng hô đó), giá trị
// KHÔNG bị đụng vào.
function cleanupLabelDuplicateFromExistingNarrRef(c){
  if(c.narrRefSource==='user')return false;
  if(!c.narrRef||isNarrRefUnknown(c.narrRef))return false;
  const stripped=stripRelationshipCopyFromNarrRef(c.narrRef,[c.relationship,c.statusCue]);
  const normalizedStripped=isNarrRefUnknown(stripped)?'':stripped;
  if(normalizedStripped!==c.narrRef){
    console.log(`[Luồng 1][Dọn dữ liệu cũ] Dọn narrRef trùng nhãn (chỉ vì đây là giá trị AI tự điền, không phải do bạn khoá) cho "${c.name}": "${c.narrRef}" -> "${normalizedStripped||'(rỗng)'}"`);
    c.narrRef=normalizedStripped;
    return true;
  }
  return false;
}