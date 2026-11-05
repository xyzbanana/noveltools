// ===================================================================
// ===== XƯNG HÔ THƯỜNG GẶP THEO THỂ LOẠI (addr-presets.js) =====
// ===================================================================
// Dữ liệu DEFAULT_GROUPS được chép NGUYÊN VĂN từ xung-ho-ui-demo-v6-popup.html (bản demo cuối), kèm phần
// logic để 3 luồng (phân tích xưng hô / dịch chính / soát sắc thái) dùng chung MỘT nguồn thể loại.
// Nạp file này TRƯỚC character-memory.js. Global duy nhất: window.AddrPresets.
(function(global){
'use strict';

/* ===== Dữ liệu mặc định — 2 tầng =====
   Mỗi NHÓM (thường gặp) có bộ xưng hô CHUNG, áp dụng được cho nhiều thể loại con bên trong.
   Mỗi THỂ LOẠI CON có bộ xưng hô riêng, cụ thể hơn cho đúng bối cảnh đó.
   keywords vẫn giữ ngầm để mô phỏng auto-detect, không có ô sửa trong UI. */
const DEFAULT_GROUPS=[
  {id:'co_dai',label:'Cổ đại',keywords:['cổ đại','cổ trang','phong kiến'],
    pairs:['ta/ngươi','ta/ngài','ta/khanh','vi phu/nương tử','phu quân/nương tử','phu quân/thê tử','nương tử/phu quân','nương tử/tướng công','tướng công/nương tử','huynh/muội','huynh/đệ','ta/huynh','ca ca/muội muội','tỷ tỷ/muội muội','a huynh/a muội','đệ đệ/huynh trưởng','phụ thân/con','mẫu thân/con','phụ thân/nhi tử','gia gia/tôn nhi','tổ mẫu/tôn nữ','công tử/tiểu thư','thiếu gia/tiểu thư','lão gia/phu nhân','phu nhân/lão gia','lão gia/nô tài','lão gia/hạ nhân','tiểu thư/nha hoàn','công tử/tiểu nhị','chưởng quầy/khách quan','tiên sinh/học trò','sư phụ/đồ đệ','đại nhân/hạ quan','đại nhân/tiểu nhân','đại nhân/thảo dân','nãi nãi/tôn nhi','bá phụ/điệt nhi','thúc thúc/điệt nhi','cô cô/điệt nữ','cữu cữu/biểu điệt','di mẫu/con','biểu ca/biểu muội','đường ca/đường muội','nhạc phụ/hiền tế','nhạc mẫu/hiền tế','công công/nhi tức','bà bà/nhi tức','tẩu tẩu/tiểu thúc','cô trượng/điệt nhi','di trượng/điệt nhi','cữu mẫu/điệt nhi','đường tỷ/đường muội','biểu tỷ/biểu muội','kế phụ/con','kế mẫu/con'],
    children:[
      {id:'huyen_huyen',label:'Huyền huyễn',keywords:['huyền huyễn','tu tiên','tông môn','cảnh giới','tiên hiệp'],
        pairs:['ta/ngươi','ta/ngài','ta/khanh','vi phu/nương tử','phu quân/nương tử','phu quân/thê tử','nương tử/phu quân','nương tử/tướng công','tướng công/nương tử','huynh/muội','huynh/đệ','ta/huynh','ca ca/muội muội','tỷ tỷ/muội muội','a huynh/a muội','đệ đệ/huynh trưởng','phụ thân/con','mẫu thân/con','phụ thân/nhi tử','gia gia/tôn nhi','tổ mẫu/tôn nữ','công tử/tiểu thư','thiếu gia/tiểu thư','lão gia/phu nhân','phu nhân/lão gia','lão gia/nô tài','lão gia/hạ nhân','tiểu thư/nha hoàn','công tử/tiểu nhị','chưởng quầy/khách quan','tiên sinh/học trò','sư phụ/đồ đệ','đại nhân/hạ quan','đại nhân/tiểu nhân','đại nhân/thảo dân','bổn tọa/ngươi','bổn tiên/ngươi','bổn tôn/ngươi','bổn thiếu gia/ngươi','bổn cô nương/ngươi','sư phụ/đệ tử','sư tôn/đệ tử','sư huynh/sư đệ','sư tỷ/sư muội','đại sư huynh/tiểu sư muội','chưởng môn/đệ tử','trưởng lão/đệ tử','lão tổ/hậu bối','tiền bối/vãn bối','tiền bối/hậu bối','đạo hữu/tại hạ','đạo trưởng/thí chủ','tiên tử/công tử','ma đầu/các vị','giáo chủ/thuộc hạ','thánh nữ/tín đồ','nãi nãi/tôn nhi','bá phụ/điệt nhi','thúc thúc/điệt nhi','cô cô/điệt nữ','cữu cữu/biểu điệt','di mẫu/con','biểu ca/biểu muội','đường ca/đường muội','nhạc phụ/hiền tế','nhạc mẫu/hiền tế','công công/nhi tức','bà bà/nhi tức','tẩu tẩu/tiểu thúc','cô trượng/điệt nhi','di trượng/điệt nhi','cữu mẫu/điệt nhi','đường tỷ/đường muội','biểu tỷ/biểu muội','kế phụ/con','kế mẫu/con']},
      {id:'vo_hiep',label:'Võ hiệp',keywords:['võ hiệp','kiếm hiệp','giang hồ','võ lâm','môn phái'],
        pairs:['ta/ngươi','ta/ngài','ta/khanh','vi phu/nương tử','phu quân/nương tử','phu quân/thê tử','nương tử/phu quân','nương tử/tướng công','tướng công/nương tử','huynh/muội','huynh/đệ','ta/huynh','ca ca/muội muội','tỷ tỷ/muội muội','a huynh/a muội','đệ đệ/huynh trưởng','phụ thân/con','mẫu thân/con','phụ thân/nhi tử','gia gia/tôn nhi','tổ mẫu/tôn nữ','công tử/tiểu thư','thiếu gia/tiểu thư','lão gia/phu nhân','phu nhân/lão gia','lão gia/nô tài','lão gia/hạ nhân','tiểu thư/nha hoàn','công tử/tiểu nhị','chưởng quầy/khách quan','tiên sinh/học trò','sư phụ/đồ đệ','đại nhân/hạ quan','đại nhân/tiểu nhân','đại nhân/thảo dân','tại hạ/các hạ','lão phu/tiểu tử','lão phu/các vị','bần tăng/thí chủ','bần đạo/thí chủ','huynh đài/tại hạ','đại hiệp/tại hạ','cô nương/tại hạ','đại ca/tiểu đệ','đại ca/hiền đệ','tam ca/tiểu muội','bang chủ/thuộc hạ','minh chủ/quần hùng','sư phụ/đồ nhi','lão nhân gia/vãn bối','lão tiền bối/vãn bối','nãi nãi/tôn nhi','bá phụ/điệt nhi','thúc thúc/điệt nhi','cô cô/điệt nữ','cữu cữu/biểu điệt','di mẫu/con','biểu ca/biểu muội','đường ca/đường muội','nhạc phụ/hiền tế','nhạc mẫu/hiền tế','công công/nhi tức','bà bà/nhi tức','tẩu tẩu/tiểu thúc','cô trượng/điệt nhi','di trượng/điệt nhi','cữu mẫu/điệt nhi','đường tỷ/đường muội','biểu tỷ/biểu muội','kế phụ/con','kế mẫu/con']},
      {id:'lich_su',label:'Lịch sử',keywords:['lịch sử','triều đại','sử thi'],
        pairs:['ta/ngươi','ta/ngài','ta/khanh','vi phu/nương tử','phu quân/nương tử','phu quân/thê tử','nương tử/phu quân','nương tử/tướng công','tướng công/nương tử','huynh/muội','huynh/đệ','ta/huynh','ca ca/muội muội','tỷ tỷ/muội muội','a huynh/a muội','đệ đệ/huynh trưởng','phụ thân/con','mẫu thân/con','phụ thân/nhi tử','gia gia/tôn nhi','tổ mẫu/tôn nữ','công tử/tiểu thư','thiếu gia/tiểu thư','lão gia/phu nhân','phu nhân/lão gia','lão gia/nô tài','lão gia/hạ nhân','tiểu thư/nha hoàn','công tử/tiểu nhị','chưởng quầy/khách quan','tiên sinh/học trò','sư phụ/đồ đệ','đại nhân/hạ quan','đại nhân/tiểu nhân','đại nhân/thảo dân','thần/bệ hạ','vi thần/bệ hạ','lão thần/bệ hạ','hạ thần/bệ hạ','hạ quan/đại nhân','hoàng thượng/ái khanh','thánh thượng/thần','tướng quân/thuộc hạ','đại soái/thuộc hạ','chủ công/thuộc hạ','công tử/mưu sĩ','nãi nãi/tôn nhi','bá phụ/điệt nhi','thúc thúc/điệt nhi','cô cô/điệt nữ','cữu cữu/biểu điệt','di mẫu/con','biểu ca/biểu muội','đường ca/đường muội','nhạc phụ/hiền tế','nhạc mẫu/hiền tế','công công/nhi tức','bà bà/nhi tức','tẩu tẩu/tiểu thúc','cô trượng/điệt nhi','di trượng/điệt nhi','cữu mẫu/điệt nhi','đường tỷ/đường muội','biểu tỷ/biểu muội','kế phụ/con','kế mẫu/con']},
      {id:'ngon_tinh_cd',label:'Ngôn tình',keywords:['ngôn tình cổ đại','ngôn tình cổ trang'],
        pairs:['ta/ngươi','ta/ngài','ta/khanh','vi phu/nương tử','phu quân/nương tử','phu quân/thê tử','nương tử/phu quân','nương tử/tướng công','tướng công/nương tử','huynh/muội','huynh/đệ','ta/huynh','ca ca/muội muội','tỷ tỷ/muội muội','a huynh/a muội','đệ đệ/huynh trưởng','phụ thân/con','mẫu thân/con','phụ thân/nhi tử','gia gia/tôn nhi','tổ mẫu/tôn nữ','công tử/tiểu thư','thiếu gia/tiểu thư','lão gia/phu nhân','phu nhân/lão gia','lão gia/nô tài','lão gia/hạ nhân','tiểu thư/nha hoàn','công tử/tiểu nhị','chưởng quầy/khách quan','tiên sinh/học trò','sư phụ/đồ đệ','đại nhân/hạ quan','đại nhân/tiểu nhân','đại nhân/thảo dân','thiếp/chàng','ta/nàng','chàng/thiếp','công tử/cô nương','lang quân/nương tử','phu quân/thiếp thân','ta/ái phi','nãi nãi/tôn nhi','bá phụ/điệt nhi','thúc thúc/điệt nhi','cô cô/điệt nữ','cữu cữu/biểu điệt','di mẫu/con','biểu ca/biểu muội','đường ca/đường muội','nhạc phụ/hiền tế','nhạc mẫu/hiền tế','công công/nhi tức','bà bà/nhi tức','tẩu tẩu/tiểu thúc','cô trượng/điệt nhi','di trượng/điệt nhi','cữu mẫu/điệt nhi','đường tỷ/đường muội','biểu tỷ/biểu muội','kế phụ/con','kế mẫu/con']},
      {id:'cung_dau_trach_dau',label:'Cung đấu / Trạch đấu',keywords:['cung đấu','trạch đấu','hậu cung','hoàng thượng','vương phủ'],
        pairs:['ta/ngươi','ta/ngài','ta/khanh','vi phu/nương tử','phu quân/nương tử','phu quân/thê tử','nương tử/phu quân','nương tử/tướng công','tướng công/nương tử','huynh/muội','huynh/đệ','ta/huynh','ca ca/muội muội','tỷ tỷ/muội muội','a huynh/a muội','đệ đệ/huynh trưởng','phụ thân/con','mẫu thân/con','phụ thân/nhi tử','gia gia/tôn nhi','tổ mẫu/tôn nữ','công tử/tiểu thư','thiếu gia/tiểu thư','lão gia/phu nhân','phu nhân/lão gia','lão gia/nô tài','lão gia/hạ nhân','tiểu thư/nha hoàn','công tử/tiểu nhị','chưởng quầy/khách quan','tiên sinh/học trò','sư phụ/đồ đệ','đại nhân/hạ quan','đại nhân/tiểu nhân','đại nhân/thảo dân','trẫm/ái khanh','thần thiếp/bệ hạ','hoàng thượng/thần thiếp','nô tì/tiểu chủ','ai gia/các vị','bổn cung/ngươi','bổn phi/ngươi','nương nương/nô tỳ','quý phi/tần thiếp','thái hậu/hoàng thượng','hoàng hậu/thần thiếp','thần thiếp/thái hậu','công công/nô tài','chủ tử/nô tài','tiểu chủ/nô tì','nãi nãi/tôn nhi','bá phụ/điệt nhi','thúc thúc/điệt nhi','cô cô/điệt nữ','cữu cữu/biểu điệt','di mẫu/con','biểu ca/biểu muội','đường ca/đường muội','nhạc phụ/hiền tế','nhạc mẫu/hiền tế','công công/nhi tức','bà bà/nhi tức','tẩu tẩu/tiểu thúc','cô trượng/điệt nhi','di trượng/điệt nhi','cữu mẫu/điệt nhi','đường tỷ/đường muội','biểu tỷ/biểu muội','kế phụ/con','kế mẫu/con']},
      {id:'dan_quoc',label:'Dân quốc',keywords:['dân quốc','cận đại'],
        pairs:['ta/ngươi','ta/ngài','ta/khanh','vi phu/nương tử','phu quân/nương tử','phu quân/thê tử','nương tử/phu quân','nương tử/tướng công','tướng công/nương tử','huynh/muội','huynh/đệ','ta/huynh','ca ca/muội muội','tỷ tỷ/muội muội','a huynh/a muội','đệ đệ/huynh trưởng','phụ thân/con','mẫu thân/con','phụ thân/nhi tử','gia gia/tôn nhi','tổ mẫu/tôn nữ','công tử/tiểu thư','thiếu gia/tiểu thư','lão gia/phu nhân','phu nhân/lão gia','lão gia/nô tài','lão gia/hạ nhân','tiểu thư/nha hoàn','công tử/tiểu nhị','chưởng quầy/khách quan','tiên sinh/học trò','sư phụ/đồ đệ','đại nhân/hạ quan','đại nhân/tiểu nhân','đại nhân/thảo dân','tôi/cậu','tiểu nữ/tiên sinh','tiên sinh/tiểu thư','thiếu gia/tôi','phu nhân/tiên sinh','ông chủ/tôi','cô nương/tiên sinh','lão gia/tôi','thiếu phu nhân/tôi','đại thiếu gia/nhị thiếu gia','nãi nãi/tôn nhi','bá phụ/điệt nhi','thúc thúc/điệt nhi','cô cô/điệt nữ','cữu cữu/biểu điệt','di mẫu/con','biểu ca/biểu muội','đường ca/đường muội','nhạc phụ/hiền tế','nhạc mẫu/hiền tế','công công/nhi tức','bà bà/nhi tức','tẩu tẩu/tiểu thúc','cô trượng/điệt nhi','di trượng/điệt nhi','cữu mẫu/điệt nhi','đường tỷ/đường muội','biểu tỷ/biểu muội','kế phụ/con','kế mẫu/con']}
    ]},
  {id:'hien_dai',label:'Hiện đại',keywords:['hiện đại'],
    pairs:['tôi/cậu','tớ/cậu','anh/em','em/anh','chị/em','em/chị','mày/tao','cháu/chú','cháu/bác','cháu/cô','con/bố','con/mẹ','ông/cháu','bà/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','bạn/tôi','ngài/tôi','dì/cháu','cậu/cháu','mợ/cháu','thím/cháu','anh rể/em vợ','chị dâu/em chồng','bố vợ/con rể','mẹ vợ/con rể','bố chồng/con dâu','mẹ chồng/con dâu','anh vợ/em rể','em dâu/anh chồng','ông ngoại/cháu','bà ngoại/cháu','ông nội/cháu','bà nội/cháu','dượng/cháu','anh họ/em họ','chị họ/em họ','bố dượng/con','mẹ kế/con','bố nuôi/con nuôi','mẹ nuôi/con nuôi','anh kết nghĩa/em kết nghĩa','chị kết nghĩa/em kết nghĩa'],
    children:[
      {id:'do_thi',label:'Đô thị',keywords:['đô thị'],
        pairs:['tôi/cậu','tớ/cậu','anh/em','em/anh','chị/em','em/chị','mày/tao','cháu/chú','cháu/bác','cháu/cô','con/bố','con/mẹ','ông/cháu','bà/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','bạn/tôi','ngài/tôi','cô/con','anh trai/cô em','sếp/em','ông chủ/tôi','bà chủ/tôi','anh hàng xóm/em','dì/cháu','cậu/cháu','mợ/cháu','thím/cháu','anh rể/em vợ','chị dâu/em chồng','bố vợ/con rể','mẹ vợ/con rể','bố chồng/con dâu','mẹ chồng/con dâu','anh vợ/em rể','em dâu/anh chồng','ông ngoại/cháu','bà ngoại/cháu','ông nội/cháu','bà nội/cháu','dượng/cháu','anh họ/em họ','chị họ/em họ','bố dượng/con','mẹ kế/con','bố nuôi/con nuôi','mẹ nuôi/con nuôi','anh kết nghĩa/em kết nghĩa','chị kết nghĩa/em kết nghĩa']},
      {id:'ngon_tinh_hd',label:'Ngôn tình',keywords:['ngôn tình hiện đại','ngôn tình'],
        pairs:['tôi/cậu','tớ/cậu','anh/em','em/anh','chị/em','em/chị','mày/tao','cháu/chú','cháu/bác','cháu/cô','con/bố','con/mẹ','ông/cháu','bà/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','bạn/tôi','ngài/tôi','em yêu/anh','anh xã/vợ yêu','anh người yêu/em','chồng sắp cưới/vợ sắp cưới','dì/cháu','cậu/cháu','mợ/cháu','thím/cháu','anh rể/em vợ','chị dâu/em chồng','bố vợ/con rể','mẹ vợ/con rể','bố chồng/con dâu','mẹ chồng/con dâu','anh vợ/em rể','em dâu/anh chồng','ông ngoại/cháu','bà ngoại/cháu','ông nội/cháu','bà nội/cháu','dượng/cháu','anh họ/em họ','chị họ/em họ','bố dượng/con','mẹ kế/con','bố nuôi/con nuôi','mẹ nuôi/con nuôi','anh kết nghĩa/em kết nghĩa','chị kết nghĩa/em kết nghĩa']},
      {id:'cong_so',label:'Công sở',keywords:['công sở','văn phòng','đồng nghiệp'],
        pairs:['tôi/cậu','tớ/cậu','anh/em','em/anh','chị/em','em/chị','mày/tao','cháu/chú','cháu/bác','cháu/cô','con/bố','con/mẹ','ông/cháu','bà/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','bạn/tôi','ngài/tôi','sếp/tôi','giám đốc/nhân viên','trưởng phòng/nhân viên','đồng nghiệp/tôi','phó giám đốc/nhân viên','dì/cháu','cậu/cháu','mợ/cháu','thím/cháu','anh rể/em vợ','chị dâu/em chồng','bố vợ/con rể','mẹ vợ/con rể','bố chồng/con dâu','mẹ chồng/con dâu','anh vợ/em rể','em dâu/anh chồng','ông ngoại/cháu','bà ngoại/cháu','ông nội/cháu','bà nội/cháu','dượng/cháu','anh họ/em họ','chị họ/em họ','bố dượng/con','mẹ kế/con','bố nuôi/con nuôi','mẹ nuôi/con nuôi','anh kết nghĩa/em kết nghĩa','chị kết nghĩa/em kết nghĩa']},
      {id:'hoc_duong',label:'Học đường',keywords:['học đường','học sinh','sinh viên'],
        pairs:['tôi/cậu','tớ/cậu','anh/em','em/anh','chị/em','em/chị','mày/tao','cháu/chú','cháu/bác','cháu/cô','con/bố','con/mẹ','ông/cháu','bà/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','bạn/tôi','ngài/tôi','cậu/tớ','thầy/em','cô/em','anh khóa trên/em khóa dưới','chị khóa trên/em khóa dưới','lớp trưởng/các bạn','dì/cháu','cậu/cháu','mợ/cháu','thím/cháu','anh rể/em vợ','chị dâu/em chồng','bố vợ/con rể','mẹ vợ/con rể','bố chồng/con dâu','mẹ chồng/con dâu','anh vợ/em rể','em dâu/anh chồng','ông ngoại/cháu','bà ngoại/cháu','ông nội/cháu','bà nội/cháu','dượng/cháu','anh họ/em họ','chị họ/em họ','bố dượng/con','mẹ kế/con','bố nuôi/con nuôi','mẹ nuôi/con nuôi','anh kết nghĩa/em kết nghĩa','chị kết nghĩa/em kết nghĩa']},
      {id:'gioi_giai_tri',label:'Giới giải trí',keywords:['giới giải trí','showbiz','nghệ sĩ','ngôi sao'],
        pairs:['tôi/cậu','tớ/cậu','anh/em','em/anh','chị/em','em/chị','mày/tao','cháu/chú','cháu/bác','cháu/cô','con/bố','con/mẹ','ông/cháu','bà/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','bạn/tôi','ngài/tôi','ông bầu/nghệ sĩ','quản lý/nghệ sĩ','fan/thần tượng','đạo diễn/diễn viên','biên tập/nghệ sĩ','dì/cháu','cậu/cháu','mợ/cháu','thím/cháu','anh rể/em vợ','chị dâu/em chồng','bố vợ/con rể','mẹ vợ/con rể','bố chồng/con dâu','mẹ chồng/con dâu','anh vợ/em rể','em dâu/anh chồng','ông ngoại/cháu','bà ngoại/cháu','ông nội/cháu','bà nội/cháu','dượng/cháu','anh họ/em họ','chị họ/em họ','bố dượng/con','mẹ kế/con','bố nuôi/con nuôi','mẹ nuôi/con nuôi','anh kết nghĩa/em kết nghĩa','chị kết nghĩa/em kết nghĩa']},
      {id:'kinh_doanh',label:'Kinh doanh',keywords:['kinh doanh','tổng tài','doanh nhân','công ty'],
        pairs:['tôi/cậu','tớ/cậu','anh/em','em/anh','chị/em','em/chị','mày/tao','cháu/chú','cháu/bác','cháu/cô','con/bố','con/mẹ','ông/cháu','bà/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','bạn/tôi','ngài/tôi','tổng tài/tôi','ông chủ/tôi','đối tác/tôi','chủ tịch/nhân viên','giám đốc điều hành/nhân viên','dì/cháu','cậu/cháu','mợ/cháu','thím/cháu','anh rể/em vợ','chị dâu/em chồng','bố vợ/con rể','mẹ vợ/con rể','bố chồng/con dâu','mẹ chồng/con dâu','anh vợ/em rể','em dâu/anh chồng','ông ngoại/cháu','bà ngoại/cháu','ông nội/cháu','bà nội/cháu','dượng/cháu','anh họ/em họ','chị họ/em họ','bố dượng/con','mẹ kế/con','bố nuôi/con nuôi','mẹ nuôi/con nuôi','anh kết nghĩa/em kết nghĩa','chị kết nghĩa/em kết nghĩa']}
    ]},
  {id:'khoa_huyen',label:'Khoa huyễn',keywords:['khoa huyễn','khoa học viễn tưởng','vũ trụ','robot','người ngoài hành tinh'],
    pairs:['tôi/cậu','tôi/anh','ngài/tôi','chỉ huy/tôi','thuyền trưởng/thuyền viên','hạm trưởng/thủy thủ','đội trưởng/thành viên','tướng quân/binh sĩ','đại tá/binh nhì','tổng tư lệnh/quân nhân','đô đốc/thuộc hạ','tiến sĩ/trợ lý','giáo sư/học trò','bác sĩ/bệnh nhân','kỹ sư trưởng/kỹ thuật viên','chủ nhân/trợ lý AI','ngài chủ nhân/tôi','thưa ngài/tôi','chủ tịch tập đoàn/nhân viên','ngài đại sứ/tôi','bố/con','mẹ/con','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ','ông/cháu','bà/cháu','chú/cháu','bác/cháu','cô/cháu','dì/cháu','cậu/cháu','mợ/cháu','anh rể/em vợ','chị dâu/em chồng'],
    children:[

    ]},
  {id:'fantasy',label:'Fantasy',keywords:['fantasy','dị giới','ma pháp','phép thuật','vương quốc phép thuật'],
    pairs:['tôi/cậu','ngài/em','cô/tôi','đội trưởng/thành viên','tiền bối/hậu bối','thầy/trò','giáo sư/học viên','viện trưởng/học viên','bệ hạ/thần','quốc vương/hiệp sĩ','công chúa/hiệp sĩ','lãnh chúa/nông dân','sư phụ/đệ tử','đại pháp sư/học trò','dũng sĩ/đồng đội','chủ nhân/tùy tùng','tộc trưởng/tộc nhân','hội trưởng/thành viên','ma vương/thuộc hạ','chủ nhân/nô lệ','thống lĩnh hiệp sĩ/binh sĩ','phụ vương/con','mẫu hậu/con','cha/con','mẹ/con','anh trai/em gái','chị gái/em trai','ông nội/cháu','bà nội/cháu','ông ngoại/cháu','bà ngoại/cháu','chú/cháu','bác/cháu','cô/cháu','dì/cháu','vợ/chồng','chồng/vợ'],
    children:[

    ]},
  {id:'co_dien_phuong_tay',label:'Cổ điển phương Tây',keywords:['phương tây','quý tộc','lãnh chúa','công tước','tiểu thư'],
    pairs:['ngài/tôi','thưa ngài/tôi','phu nhân/tôi','tiểu thư/tôi','công tước/tôi','bá tước/tôi','nam tước/tôi','hầu tước/tôi','cha/con','mẹ/con','quản gia/ngài','hầu gái/tiểu thư','người hầu/chủ nhân','phu quân/phu nhân','vợ/chồng','chồng/vợ','đức ngài/tôi','đức vua/thần dân','hoàng hậu/thần dân','cha xứ/con chiên','quý ông/quý cô','tiểu thư/quý ngài','ông nội/cháu','bà nội/cháu','ông ngoại/cháu','bà ngoại/cháu','cô/cháu','bác/cháu','dượng/cháu','anh rể/em vợ','chị dâu/em chồng','chú/cháu','dì/cháu'],
    children:[

    ]},
  {id:'light_novel',label:'Light novel',keywords:['light novel','isekai','dị giới nhật','anime','manga','vô địch dị giới'],
    pairs:['tôi/cậu','cậu/tớ','tiền bối/hậu bối','anh/em','chị/em','anh trai/em gái','chị gái/em trai','thầy/trò','giáo viên chủ nhiệm/học sinh','đội trưởng/thành viên','công hội trưởng/thành viên','chủ nhân/tùy tùng','chủ nhân/nô lệ','chủ nhân/khế ước thú','bệ hạ/thần','công chúa/hiệp sĩ','bạn/tôi','tiên sinh/tôi','hội trưởng học sinh/thành viên','bố/con','mẹ/con','ông/cháu','bà/cháu','cô/cháu','chú/cháu','bác/cháu','dì/cháu','vợ/chồng','chồng/vợ'],
    children:[

    ]},
  {id:'trung_co',label:'Trung cổ',keywords:['trung cổ','hiệp sĩ','lâu đài','vương quốc'],
    pairs:['ngài/tôi','hiệp sĩ/tôi','ngài hiệp sĩ/tôi','thống lĩnh hiệp sĩ/hiệp sĩ','kỵ sĩ/tôi','đức vua/thần','hoàng hậu/thần','công chúa/hiệp sĩ','thái tử/thần dân','lãnh chúa/nông nô','lãnh chúa/tá điền','quý tộc/nông dân','giáo hoàng/tín đồ','linh mục/con chiên','tu sĩ/tín đồ','hiệp sĩ/tùy tùng','chủ nhân/thị đồng','thương nhân/học việc','phụ vương/con','mẫu hậu/con','cha/con','mẹ/con','ông nội/cháu','bà nội/cháu','ông ngoại/cháu','bà ngoại/cháu','chú/cháu','bác/cháu','cô/cháu','dì/cháu','anh trai/em gái','chị gái/em trai','vợ/chồng','chồng/vợ'],
    children:[

    ]}
];

// ===================================================================
// ===== LOGIC: chọn preset cho truyện + sinh khối chỉ dẫn cho 3 luồng =====
// ===================================================================
// Nạp TRƯỚC character-memory.js:  <script src="addr-presets.js"></script>
// Không đụng DOM, không gọi API. Mọi hàm đều "an toàn khi thiếu dữ liệu": không có preset -> trả
// null/'' để 3 luồng tự lùi về hành vi cũ.

const LS_KEY='addrPairPresetsGlobalV5';      // GIỮ NGUYÊN key của bản demo -> popup dùng lại được dữ liệu đã sửa
const STORY_KEY_PREFIX='dich-addr-preset:';  // lựa chọn preset THEO TỪNG BỘ TRUYỆN (khác state chung ở trên)

// ---------- HỆ XƯNG HÔ (family) ----------
// 3 hệ thay cho 2 hệ cũ (co_trang / hien_dai) của detectAddrGenreSystem. Lý do: Fantasy, Trung cổ, Cổ điển
// phương Tây, Light novel KHÔNG thuộc hệ nào trong 2 hệ cũ — nên trước đây bị coi là "chưa xác định" và
// bị đưa cả ví dụ huynh/muội lẫn tôi/cậu, model tự chọn nhầm.
//  avoid : từ CỨNG lệch hệ — dùng để (1) dặn model tránh, (2) lọc xưng hô đã lưu trước khi gửi đi dịch.
//          So khớp NGUYÊN CỤM (không so từng chữ) nên "đệ tử" không bị nhầm với "đệ".
//  watch : từ MỀM chỉ dùng làm gợi ý cho bước soát (có thể là quan hệ ruột thịt thật, vd chú-cháu).
//  narr  : nhóm đại từ ngôi 3 khi tường thuật hợp hệ.
//  hanViet: true = giữ phiên âm Hán Việt ước lệ (哥哥→ca ca) là đúng; false = phải dịch nghĩa (哥哥→anh).
// Từ kiểu Hán-Việt Trung Quốc SAI với cả hệ hiện đại lẫn hệ phương Tây (bản gốc chữ Hán phải DỊCH NGHĨA: 哥哥→anh,
// 师兄→anh/đàn anh...). Chia nhóm để dễ đọc/sửa; đây là danh sách NỀN, popup có thể thêm/xoá theo từng thể loại,
// và từ nào nằm trong bộ cặp của chính thể loại thì tự được miễn cấm (xem avoidTerms).
const _AV_HAN_VIET_COMMON=[
  // anh chị em
  'huynh','đệ','muội','tỷ','ca ca','tỷ tỷ','muội muội','đệ đệ','a huynh','a muội','a tỷ','huynh đài','huynh trưởng','hiền đệ','hiền muội',
  'sư huynh','sư đệ','sư tỷ','sư muội','biểu ca','biểu muội','đường ca','đường muội',
  // tự xưng / kính xưng cổ trang, giang hồ, tu tiên, cung đình
  'tại hạ','các hạ','bổn tọa','bổn tôn','bổn cung','bổn vương','bổn thiếu gia','bổn cô nương','lão phu','lão nạp','bần tăng','bần đạo',
  'tiểu nữ','nô tỳ','nô tì','nô tài','thần thiếp','ai gia','vi phu','vi thần','đạo hữu','đạo trưởng','thí chủ','vãn bối',
  // vợ chồng
  'nương tử','phu quân','tướng công','lang quân',
  // họ hàng
  'phụ thân','mẫu thân','gia gia','nãi nãi','thúc thúc','bá bá','cô cô','cữu cữu','di di','tẩu tẩu','bá phụ','bá mẫu','thẩm thẩm',
  'đường tỷ','đường đệ','biểu tỷ','biểu đệ','cô trượng','di trượng','cữu mẫu','tỷ phu','muội phu','đệ tức','nhạc phụ','nhạc mẫu','hiền tế','nhi tức'
];
const FAMILIES={
  co_trang:{
    label:'CỔ TRANG/TU TIÊN/HUYỀN HUYỄN/KIẾM HIỆP, giữ văn phong Hán-Việt',
    hanViet:true,
    // xưng hô/đại từ kiểu HIỆN ĐẠI xen vào truyện cổ trang
    avoid:['tôi','cậu','bạn','tao','mày','tớ','tui','anh ấy','cô ấy','chị ấy','em ấy','cậu ấy','bố','má','ba','sếp','cô','em','anh','mẹ'],
    watch:['chú','bác','cô','cháu'],
    narr:'hắn, nàng, y, gã (thù địch: lão ta, tên đó, mụ)'
  },
  hien_dai:{
    label:'ĐÔ THỊ/HIỆN ĐẠI/KHOA HUYỄN',
    hanViet:false,
    avoid:['ngươi'].concat(_AV_HAN_VIET_COMMON),
    watch:['ta (đứng riêng, không tính "chúng ta")'],
    narr:'anh ấy, cô ấy, anh ta, cô ta, cậu ấy'
  },
  tay_au:{
    label:'PHƯƠNG TÂY/FANTASY/TRUNG CỔ/LIGHT NOVEL, không theo kiểu Hán-Việt Trung Quốc',
    hanViet:false,
    // không cấm "ngươi"/"ta": ma vương, quốc vương... vẫn dùng
    avoid:['đại ca','tiểu muội'].concat(_AV_HAN_VIET_COMMON),
    watch:[],
    narr:'anh ta, cô ta, hắn, cô ấy, anh ấy (tránh y, thị, gã kiểu cổ trang trừ khi văn phong truyện đã dùng)'
  }
};
// Preset -> hệ. Ghi đè theo id THỂ LOẠI CON trước, không có thì theo id NHÓM. null = lai/không rõ (Dân quốc
// vừa "tiên sinh/thiếu gia" vừa "tôi/cậu") -> KHÔNG ép hệ nào, 3 luồng lùi về hành vi cũ nhưng vẫn nhận
// được danh sách cặp thường gặp của chính preset.
const FAMILY_OF={
  co_dai:'co_trang', dan_quoc:null,
  hien_dai:'hien_dai', khoa_huyen:'hien_dai',
  fantasy:'tay_au', co_dien_phuong_tay:'tay_au', light_novel:'tay_au', trung_co:'tay_au'
};

// ---------- tiện ích ----------
const _norm=s=>(s||'').toLowerCase().normalize('NFC').trim();
const _strip=s=>(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const _hasDia=s=>/[\u0300-\u036f]/.test((s||'').normalize('NFD'));

// ---------- state chung (mọi truyện) ----------
let _st=null;
function buildBank(groups){
  const set=new Set();
  groups.forEach(g=>{g.pairs.forEach(p=>set.add(p));g.children.forEach(c=>c.pairs.forEach(p=>set.add(p)));});
  return [...set];
}
function getState(){
  if(_st)return _st;
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(raw){const d=JSON.parse(raw);if(d&&Array.isArray(d.groups)&&d.groups.length){_st=d;return _st;}}
  }catch(e){}
  const groups=JSON.parse(JSON.stringify(DEFAULT_GROUPS));
  _st={groups,bank:buildBank(groups)};
  return _st;
}
function persist(){try{localStorage.setItem(LS_KEY,JSON.stringify(getState()));}catch(e){}}
function reload(){_st=null;return getState();}
function findNode(id){
  const st=getState();
  for(const g of st.groups){
    if(g.id===id)return{node:g,group:g};
    const c=g.children.find(x=>x.id===id);
    if(c)return{node:c,group:g};
  }
  return null;
}

// ---------- lựa chọn THEO TRUYỆN (popup ghi, 3 luồng đọc) ----------
// value: {id,ts} = người dùng chọn tay | {off:true,ts} = người dùng chủ động "không dùng preset" | null = chưa chọn
// (ts = mốc Date.now() lúc chọn — dùng để merge 2 chiều khi đồng bộ Drive nhiều thiết bị, xem backup.js)
function getStoryChoice(storyKey){
  try{return JSON.parse(localStorage.getItem(STORY_KEY_PREFIX+(storyKey||'__noname__'))||'null');}catch(e){return null;}
}
function setStoryChoice(storyKey,idOrNullOrOff){
  const k=STORY_KEY_PREFIX+(storyKey||'__noname__');
  try{
    if(idOrNullOrOff==null)localStorage.removeItem(k);                       // về chế độ tự nhận diện
    else if(idOrNullOrOff==='off')localStorage.setItem(k,JSON.stringify({off:true,ts:Date.now()}));
    else localStorage.setItem(k,JSON.stringify({id:idOrNullOrOff,ts:Date.now()}));
  }catch(e){}
}

// ---------- tự nhận diện từ chỉ dẫn đã chưng cất ----------
// Khác bản demo (simulateDetect, chỉ chốt khi ĐÚNG 1 thể loại khớp) ở 2 điểm: (1) chấm điểm theo từ khoá DÀI
// NHẤT khớp nên "ngôn tình cổ đại" không còn bị hoà oan với "cổ đại"/"ngôn tình"; (2) nếu chỉ dẫn CÓ dấu tiếng
// Việt thì so CÓ dấu, tránh "lịch sự" (xưng hô lịch sự) bị nhận nhầm thành từ khoá "lịch sử" khi bỏ dấu.
// Nhập nhằng (2 nhóm điểm sát nhau) -> null, 3 luồng lùi về hành vi cũ thay vì đoán.
// Từ khoá MƠ HỒ (xuất hiện ở nhiều thể loại: "công tử/tiểu thư" của cổ trang, "hiệp sĩ" của fantasy...) —
// bỏ qua khi nhận diện. Áp dụng ở đây (không sửa DEFAULT_GROUPS) để cũng có hiệu lực với state đã lưu.
const AMBIGUOUS_KEYWORDS=new Set(['tiểu thư','hiệp sĩ']);
function _detectKeywords(text){
  if(!text||!String(text).trim())return null;
  const dia=_hasDia(text);
  const pick=dia?_norm:_strip;
  const t=pick(text);
  const hits=[];
  getState().groups.forEach(g=>{
    [g].concat(g.children).forEach(n=>{
      let best=0;
      (n.keywords||[]).forEach(k=>{if(AMBIGUOUS_KEYWORDS.has(_norm(k)))return;const kk=pick(k);if(kk&&t.includes(kk)&&kk.length>best)best=kk.length;});
      if(best)hits.push({node:n,group:g,score:best,isGroup:n===g});
    });
  });
  if(!hits.length)return null;
  // Gom theo NHÓM. Chỉ chốt khi nhóm dẫn đầu hơn nhóm thứ 2 ít nhất 4 ký tự từ khoá (vd "ngôn tình cổ đại" 16 vs
  // "ngôn tình" 9 -> chốt; "hiện đại" 8 vs "tu tiên" 7 — truyện xuyên không 2 thế giới -> null, không đoán).
  const per=new Map();
  hits.forEach(h=>{
    let e=per.get(h.group.id);
    if(!e){e={group:h.group,best:0,hits:[]};per.set(h.group.id,e);}
    e.hits.push(h);if(h.score>e.best)e.best=h.score;
  });
  const ranked=[...per.values()].sort((a,b)=>b.best-a.best);
  if(ranked.length>1&&ranked[0].best-ranked[1].best<4)return null;
  const w=ranked[0];
  // Trong nhóm thắng: đúng 1 thể loại con khớp -> chọn thể loại con; không có hoặc ≥2 con cùng khớp -> chọn cấp NHÓM.
  const kids=w.hits.filter(h=>!h.isGroup);
  if(kids.length===1)return kids[0];
  return{node:w.group,group:w.group,score:w.best,isGroup:true};
}

// ---------- nhận diện THÔNG MINH (bọc ngoài _detectKeywords ở trên) ----------
// Thứ tự: (1) chỉ dẫn chưng cất GHI RÕ thể loại -> theo đúng thể loại đó; (2) từ khoá toàn văn như cũ (_detectKeywords);
// (3) chấm điểm theo "điểm chung" đặc trưng của từng thể loại (GENRE_SIGNALS) từ chỉ dẫn + (nửa điểm) quan hệ/ghi chú
// của các nhân vật đã lưu. Điểm chung chỉ được lật kết quả (2) khi đủ chắc và thuộc HỆ KHÁC; không đủ chắc -> giữ như cũ.
// "Ghi rõ" = cụm đứng ngay sau nhãn "thể loại / genre / bối cảnh / dòng truyện / truyện thuộc...". Chữ "truyện" trần chỉ xét 28
// ký tự sau (nó xuất hiện khắp nơi). Nếu các cụm đó nhắc tới >=2 nhóm sát điểm (VD "đô thị và tu tiên") -> coi là chưa rõ.
// Điểm chung: [từ khoá không dấu, điểm, id thể loại]; mỗi từ khoá chỉ tính 1 lần. Id không còn trong state đã lưu thì bị bỏ qua.
const GENRE_SIGNALS=[
  ['co trang',3,'co_dai'],['phong kien',2,'co_dai'],['su huynh',2,'co_dai'],['su de',2,'co_dai'],['su ty',2,'co_dai'],['su muoi',2,'co_dai'],['su phu',2,'co_dai'],
  ['tai ha',1,'co_dai'],['tien boi',1,'co_dai'],['van boi',1,'co_dai'],['cac ha',1,'co_dai'],['cong tu',1,'co_dai'],['bon toa',2,'co_dai'],
  ['tu tien',3,'huyen_huyen'],['tu chan',3,'huyen_huyen'],['tien hiep',3,'huyen_huyen'],['huyen huyen',3,'huyen_huyen'],['dao quan',3,'huyen_huyen'],['dao nhan',3,'huyen_huyen'],
  ['tu luyen',2,'huyen_huyen'],['tu vi',2,'huyen_huyen'],['linh khi',2,'huyen_huyen'],['kim dan',2,'huyen_huyen'],['nguyen anh',2,'huyen_huyen'],['tong mon',2,'huyen_huyen'],
  ['chuong mon',2,'huyen_huyen'],['truong lao',2,'huyen_huyen'],['dao huu',2,'huyen_huyen'],['canh gioi',1,'huyen_huyen'],['dan duoc',1,'huyen_huyen'],['phap bao',1,'huyen_huyen'],
  ['vo hiep',3,'vo_hiep'],['kiem hiep',3,'vo_hiep'],['vo lam',3,'vo_hiep'],['giang ho',3,'vo_hiep'],['bang phai',2,'vo_hiep'],['noi cong',2,'vo_hiep'],['vo cong',2,'vo_hiep'],['minh chu',2,'vo_hiep'],['mon phai',2,'vo_hiep'],
  ['cung dau',3,'cung_dau_trach_dau'],['trach dau',3,'cung_dau_trach_dau'],['hau cung',3,'cung_dau_trach_dau'],['hoang thuong',2,'cung_dau_trach_dau'],['hoang hau',2,'cung_dau_trach_dau'],
  ['phi tan',2,'cung_dau_trach_dau'],['nuong nuong',2,'cung_dau_trach_dau'],['thai giam',2,'cung_dau_trach_dau'],['thai hau',2,'cung_dau_trach_dau'],['than thiep',2,'cung_dau_trach_dau'],['vuong phu',2,'cung_dau_trach_dau'],
  ['hien dai',3,'hien_dai'],['dien thoai',2,'hien_dai'],['internet',2,'hien_dai'],['wechat',2,'hien_dai'],['canh sat',1,'hien_dai'],['benh vien',1,'hien_dai'],
  ['do thi',3,'do_thi'],['cong so',3,'cong_so'],['van phong',2,'cong_so'],['dong nghiep',1,'cong_so'],['giam doc',2,'cong_so'],
  ['tong tai',3,'kinh_doanh'],['cong ty',2,'kinh_doanh'],['doanh nhan',2,'kinh_doanh'],
  ['hoc duong',3,'hoc_duong'],['hoc sinh',2,'hoc_duong'],['truong hoc',2,'hoc_duong'],['lop hoc',2,'hoc_duong'],['sinh vien',2,'hoc_duong'],['giao vien',1,'hoc_duong'],['dai hoc',1,'hoc_duong'],
  ['khoa huyen',3,'khoa_huyen'],['vu tru',2,'khoa_huyen'],['robot',2,'khoa_huyen'],['phi thuyen',2,'khoa_huyen'],['nguoi ngoai hanh tinh',3,'khoa_huyen'],
  ['fantasy',3,'fantasy'],['di gioi',3,'fantasy'],['ma phap su',3,'fantasy'],['ma phap',2,'fantasy'],['phep thuat',2,'fantasy'],['elf',2,'fantasy'],['orc',2,'fantasy'],['phu thuy',1,'fantasy'],
  ['trung co',3,'trung_co'],['hiep si',2,'trung_co'],['ky si',2,'trung_co'],['lau dai',2,'trung_co'],['nong no',2,'trung_co'],
  ['phuong tay',3,'co_dien_phuong_tay'],['chau au',3,'co_dien_phuong_tay'],['quy toc',2,'co_dien_phuong_tay'],['ba tuoc',2,'co_dien_phuong_tay'],['cong tuoc',2,'co_dien_phuong_tay'],
  ['hau tuoc',2,'co_dien_phuong_tay'],['nam tuoc',2,'co_dien_phuong_tay'],['lanh chua',2,'co_dien_phuong_tay'],['quan gia',2,'co_dien_phuong_tay'],['giao hoi',1,'co_dien_phuong_tay'],
  ['light novel',3,'light_novel'],['isekai',3,'light_novel'],['anime',2,'light_novel'],['manga',2,'light_novel']
];
function _hasTerm(text,term){
  let from=0;
  while((from=text.indexOf(term,from))>=0){
    const b=from?text[from-1]:' ',a=text[from+term.length]||' ';
    if(!/[a-z0-9]/.test(b)&&!/[a-z0-9]/.test(a))return true;
    from+=term.length;
  }
  return false;
}
function _famOfNode(n,g){return (n.id in FAMILY_OF)?FAMILY_OF[n.id]:(g.id in FAMILY_OF?FAMILY_OF[g.id]:null);}
function _explicitText(text){
  const t=_strip(text),out=[];
  const scan=(rx,len)=>{let m;while((m=rx.exec(t)))out.push(m[1].slice(0,len));};
  scan(/(?:the loai|genre|bo canh|dong truyen|loai truyen|thuoc the loai|truyen thuoc|day la truyen|la truyen)\s*[:\-–]?\s*([^\n]{0,80})/g,80);
  scan(/truyen\s*[:\-–]?\s*([^\n]{0,28})/g,28);
  return out.length?out.join(' | '):'';
}
function _charEvidence(){
  try{
    if(typeof S==='undefined'||!S||!Array.isArray(S.characters))return '';
    return S.characters.slice(0,300).map(c=>[c.relationship,c.note,(c.aliases||[]).join(' ')].filter(Boolean).join(' ')).join(' | ');
  }catch(e){return '';}
}
function _signalDetect(text,extra){
  const t=_strip(text),x=_strip(extra||'');
  const nodeScore=new Map();   // id -> {f,pts}
  GENRE_SIGNALS.forEach(([term,w,id])=>{
    const f=findNode(id);if(!f)return;
    let pts=0;
    if(_hasTerm(t,term))pts+=w;
    if(x&&_hasTerm(x,term))pts+=w/2;
    if(!pts)return;
    const e=nodeScore.get(id)||{f,pts:0};e.pts+=pts;nodeScore.set(id,e);
  });
  if(!nodeScore.size)return null;
  // Gom theo HỆ (preset không thuộc hệ nào như Dân quốc tự thành 1 bucket riêng)
  const fam=new Map();
  nodeScore.forEach((e,id)=>{
    const k=_famOfNode(e.f.node,e.f.group)||('x:'+id);
    fam.set(k,(fam.get(k)||0)+e.pts);
  });
  const ranked=[...fam.entries()].sort((a,b)=>b[1]-a[1]);
  const top=ranked[0][1],second=ranked[1]?ranked[1][1]:0;
  if(top<4||top<second*1.6)return null;
  const wk=ranked[0][0];
  const inFam=[...nodeScore.values()].filter(e=>(_famOfNode(e.f.node,e.f.group)||('x:'+e.f.node.id))===wk).sort((a,b)=>b.pts-a.pts);
  const best=inFam[0];
  let node=best.f.node,group=best.f.group;
  // thể loại con chỉ được chọn khi đủ nổi trội so với các thể loại con khác CÙNG nhóm; không thì lùi về cấp nhóm
  if(node!==group){
    const sib=inFam.filter(e=>e!==best&&e.f.group===group).reduce((m,e)=>Math.max(m,e.pts),0);
    if(best.pts<3||best.pts<sib*2){node=group;}
  }
  return{node,group,score:top,isGroup:node===group,via:'signals'};
}
let _detMemo={k:'',v:null},_detLog='';
function detect(text){
  if(!text||!String(text).trim())return null;
  const extra=_charEvidence();
  const mk=String(text)+'|'+extra.length;
  if(_detMemo.k===mk)return _detMemo.v;
  let res=null,via='';
  const ex=_explicitText(text);
  const d1=ex?_detectKeywords(ex):null;
  if(d1){res=d1;via='ghi rõ thể loại trong chỉ dẫn';}
  else{
    const d0=_detectKeywords(text);
    const sg=_signalDetect(text,extra);
    if(sg&&(!d0||_famOfNode(d0.node,d0.group)!==_famOfNode(sg.node,sg.group))){res=sg;via='điểm chung đặc trưng'+(d0?' (lật kết quả từ khoá vì khác hệ)':'');}
    else{res=d0;via=d0?'từ khoá':'';}
  }
  _detMemo={k:mk,v:res};
  const msg=res?`${res.group.label}${res.node!==res.group?' › '+res.node.label:''} — ${via}`:'không nhận diện được';
  if(msg!==_detLog){_detLog=msg;try{console.log('[AddrPresets][Tự nhận diện] '+msg);}catch(e){}}
  return res;
}

// ---------- kết quả chốt cho 1 truyện ----------
function _termsOf(pairs){
  const set=new Set();
  (pairs||[]).forEach(p=>String(p).split('/').forEach(t=>{const x=_norm(t);if(x)set.add(x);}));
  return set;
}
function _build(node,group,source){
  const fam=(node.id in FAMILY_OF)?FAMILY_OF[node.id]:(group.id in FAMILY_OF?FAMILY_OF[group.id]:null);
  return{
    id:node.id,label:node.label,groupId:group.id,
    path:node.id===group.id?group.label:(group.label+' › '+node.label),
    pairs:node.pairs||[],family:fam,source,       // source: 'user' (chọn tay) | 'auto' (nhận diện)
    avoidAdd:node.avoidAdd||[],avoidRemove:node.avoidRemove||[]   // chỉnh riêng của thể loại này so với danh sách nền của hệ
  };
}
// promptGuidance: chỉ dẫn đã chưng cất (getMainPromptGuidance). storyKey: S.fname.
function resolve(promptGuidance,storyKey){
  const c=getStoryChoice(storyKey);
  if(c&&c.off)return null;
  if(c&&c.id){const f=findNode(c.id);if(f)return _build(f.node,f.group,'user');}
  const d=detect(promptGuidance);
  return d?_build(d.node,d.group,'auto'):null;
}
// Tên hệ ('co_trang'|'hien_dai'|'tay_au'|null) — cùng vai trò giá trị trả về của detectAddrGenreSystem cũ.
function systemOf(r){return r&&r.family?r.family:null;}

// ---------- XƯNG HÔ ĐỊA PHƯƠNG: KHÔNG dùng, chỉ dùng xưng hô tiếng Việt chuẩn/phổ thông ----------
// Giá trị = từ chuẩn tương đương ('' = không có từ chuẩn tương đương rõ ràng -> bỏ cặp). So khớp NGUYÊN từ/cụm (không so từng chữ).
// Áp dụng cho MỌI thể loại (kể cả khi người dùng tự thêm vào bộ cặp): khác "từ cần tránh" ở chỗ không được miễn theo bộ cặp.
const REGIONAL_MAP={
  // miền Nam
  'ba':'bố','má':'mẹ','tía':'bố','tui':'tôi','tụi':'','tụi tui':'','qua':'','bậu':'','bây':'','mầy':'mày',
  // miền Trung
  'mi':'mày','tau':'tao','mạ':'mẹ','bọ':'bố','o':'cô',
  // Bắc Bộ nông thôn
  'u':'mẹ','bầm':'mẹ','bu':'mẹ','mế':'mẹ',
  // xếp thứ theo kiểu Nam Bộ: anh Hai, chị Ba, dì Hai...
  'anh hai':'anh','anh ba':'anh','anh tư':'anh','chị hai':'chị','chị ba':'chị','chị tư':'chị','cô hai':'cô','cô ba':'cô','dì hai':'dì','dì ba':'dì',
  'cậu hai':'cậu','cậu ba':'cậu','bác hai':'bác','bác ba':'bác','chú hai':'chú','chú ba':'chú','mợ hai':'mợ','mợ ba':'mợ','thím hai':'thím','thím ba':'thím'
};
const _REGIONAL=new Map(Object.keys(REGIONAL_MAP).map(k=>[_norm(k),REGIONAL_MAP[k]]));
// -> {regional:bool, standard:string}. regional=false: từ chuẩn, giữ nguyên.
function regionalFix(tok){
  const k=_norm(String(tok==null?'':tok)).replace(/\s*\([^)]*\)\s*$/,'');
  if(!k||!_REGIONAL.has(k))return{regional:false,standard:String(tok==null?'':tok).trim()};
  return{regional:true,standard:_REGIONAL.get(k)};
}
function isRegionalTerm(tok){return regionalFix(tok).regional;}
function _isRegionalPair(p){return String(p).split('/').some(t=>isRegionalTerm(t));}
const STANDARD_ONLY_NOTE='CHỈ dùng xưng hô tiếng Việt chuẩn/phổ thông; KHÔNG dùng từ địa phương (miền Nam: ba, má, tía, tui, tụi, qua, bậu, mầy, anh Hai/chị Ba...; miền Trung: mi, tau, mạ, bọ, o; Bắc nông thôn: u, bầm, bu, mế). Cha/mẹ dùng "bố/cha/mẹ"; tự xưng dùng "tôi/tớ/mình/em/anh/chị...".';

// Từ CỨNG cần tránh của 1 preset = [danh sách nền của HỆ trừ những từ chính preset này liệt kê trong bộ cặp
// (Dân quốc có "tôi/cậu" nên không bị cấm "tôi"/"cậu") trừ những từ người dùng đã XOÁ (avoidRemove)]
// + những từ người dùng tự THÊM (avoidAdd — luôn có hiệu lực, không bị miễn theo bộ cặp). Preset không thuộc
// hệ nào (Dân quốc) không có danh sách nền nhưng vẫn nhận avoidAdd.
function avoidTerms(r){
  if(!r)return [];
  const own=_termsOf(r.pairs);
  const rem=new Set((r.avoidRemove||[]).map(_norm));
  const base=r.family?FAMILIES[r.family].avoid:[];
  const out=[],seen=new Set();
  base.forEach(w=>{const k=_norm(w);if(!k||seen.has(k)||own.has(k)||rem.has(k))return;seen.add(k);out.push(w);});
  (r.avoidAdd||[]).forEach(w=>{const k=_norm(w);if(!k||seen.has(k))return;seen.add(k);out.push(w);});
  return out;
}
function watchTerms(r){return (r&&r.family)?FAMILIES[r.family].watch.slice():[];}

// "ta/ngươi", "ta/ngài", "ta/khanh" -> "ta/ngươi|ngài|khanh" (gom theo từ tự xưng, ngắn hơn ~25-30% token)
function compactPairs(pairs){
  const order=[],map=new Map();
  (pairs||[]).forEach(p=>{
    if(_isRegionalPair(p))return;   // không đưa xưng hô địa phương vào prompt (kể cả bộ cặp đã lưu từ phiên bản cũ)
    const i=String(p).indexOf('/');if(i<0)return;
    const a=p.slice(0,i).trim(),b=p.slice(i+1).trim();if(!a||!b)return;
    if(!map.has(a)){map.set(a,[]);order.push(a);}
    if(!map.get(a).includes(b))map.get(a).push(b);
  });
  return order.map(a=>a+'/'+map.get(a).join('|')).join('; ');
}

// ---------- lọc xưng hô ĐÃ LƯU lệch hệ (chỉ ở lớp prompt, KHÔNG sửa dữ liệu nhân vật) ----------
// addrString: định dạng lưu của hệ thống "self/other, self2/other2". Trả {text, dropped[]}; text rỗng nếu
// mọi lựa chọn đều lệch hệ. Chỉ nên gọi cho dữ liệu KHÔNG do người dùng tự sửa (addrSource!=='user').
function filterAddr(addrString,r){
  const avoid=new Set(avoidTerms(r).map(_norm));
  if(!addrString)return{text:addrString||'',dropped:[]};
  const keep=[],dropped=[];
  String(addrString).split(/[,;]|\s+hoặc\s+/i).map(s=>s.trim()).filter(Boolean).forEach(ch=>{
    const bad=ch.split('/').map(_norm).some(t=>avoid.has(t))||_isRegionalPair(ch);   // từ địa phương luôn bị loại, không phụ thuộc thể loại
    (bad?dropped:keep).push(ch);
  });
  return{text:keep.join(', '),dropped};
}
// Đếm nhanh các từ lệch hệ trong 1 đoạn (dùng cho log/chẩn đoán hoặc bước quét bằng code trước khi gọi AI).
function findAvoidHits(text,r){
  const words=avoidTerms(r);if(!words.length||!text)return [];
  const low=String(text).toLowerCase();
  const NOT_AFTER={'đệ':'(?!\\s+tử)'};  // "đệ tử" (thầy-trò) không phải "đệ"
  return words.filter(w=>new RegExp('(^|[^\\p{L}])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}])'+(NOT_AFTER[w]||''),'iu').test(low));
}

// ---------- chỉnh cặp xưng hô của 1 thể loại (popup ghi vào state CHUNG, mọi truyện dùng lại) ----------
function parsePairInput(str){
  const ok=[],bad=[];
  String(str||'').split(/[,;\n]+/).map(s=>s.trim().replace(/\s*\/\s*/g,'/').replace(/\s+/g,' ')).filter(Boolean).forEach(p=>{
    const parts=p.split('/');
    if(parts.length===2&&parts[0].trim()&&parts[1].trim())ok.push(parts[0].trim()+'/'+parts[1].trim());
    else bad.push(p);
  });
  return{ok,bad};
}
// Thêm cặp mới (đưa lên ĐẦU danh sách). Trả {added[],dup[],bad[]}.
function addPairs(nodeId,str){
  const f=findNode(nodeId);
  if(!f)return{added:[],dup:[],bad:[]};
  const {ok,bad}=parsePairInput(str);
  const have=new Set(f.node.pairs.map(_norm));
  const added=[],dup=[];
  ok.forEach(p=>{const k=_norm(p);if(have.has(k)){dup.push(p);return;}have.add(k);added.push(p);});
  if(added.length){f.node.pairs.unshift(...added);getState().bank=buildBank(getState().groups);persist();}
  return{added,dup,bad};
}
function removePair(nodeId,pair){
  const f=findNode(nodeId);if(!f)return false;
  const n=f.node.pairs.length;
  f.node.pairs=f.node.pairs.filter(p=>p!==pair);
  if(f.node.pairs.length===n)return false;
  getState().bank=buildBank(getState().groups);persist();return true;
}
// Đặt lại bộ cặp của 1 thể loại về mặc định (không đụng từ khoá/thể loại khác).
function resetNode(nodeId){
  const f=findNode(nodeId);if(!f)return false;
  let def=null;
  DEFAULT_GROUPS.forEach(g=>{if(g.id===nodeId)def=g;g.children.forEach(c=>{if(c.id===nodeId)def=c;});});
  if(!def)return false;
  f.node.pairs=def.pairs.slice();
  delete f.node.avoidAdd;delete f.node.avoidRemove;
  getState().bank=buildBank(getState().groups);persist();return true;
}

// ---------- chỉnh "Từ cần tránh" của 1 thể loại (popup) ----------
// Lưu trong node: avoidAdd[] (từ thêm) và avoidRemove[] (từ nền bị xoá). Chưa chỉnh gì = theo danh sách nền của hệ.
function _avoidPreset(nodeId){
  const f=findNode(nodeId);
  return f?_build(f.node,f.group,'user'):null;
}
function avoidListOf(nodeId){return avoidTerms(_avoidPreset(nodeId));}
function avoidIsCustomized(nodeId){
  const f=findNode(nodeId);
  return !!(f&&((f.node.avoidAdd&&f.node.avoidAdd.length)||(f.node.avoidRemove&&f.node.avoidRemove.length)));
}
// Thêm từ (nhiều từ cách nhau dấu phẩy). Chỉ nhận TỪ/CỤM, không nhận dạng "A/B" (cặp thì để ở "Cặp đang dùng").
function addAvoid(nodeId,str){
  const f=findNode(nodeId);
  if(!f)return{added:[],dup:[],bad:[]};
  const cur=new Set(avoidListOf(nodeId).map(_norm));
  const added=[],dup=[],bad=[];
  String(str||'').split(/[,;\n]+/).map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean).forEach(w=>{
    if(w.includes('/')){bad.push(w);return;}
    const k=_norm(w);
    if(cur.has(k)){dup.push(w);return;}
    cur.add(k);
    const n=f.node;
    n.avoidRemove=(n.avoidRemove||[]).filter(x=>_norm(x)!==k);          // đang bị xoá -> chỉ cần bỏ dấu xoá
    const inBase=f.node&&(_normList(baseAvoidOf(f)).has(k));
    if(!inBase||_termsOf(n.pairs).has(k))(n.avoidAdd=n.avoidAdd||[]).push(k);  // từ nền bị miễn theo bộ cặp: thêm tường minh để có hiệu lực
    added.push(w);
  });
  if(added.length)persist();
  return{added,dup,bad};
}
function baseAvoidOf(f){
  const fam=(f.node.id in FAMILY_OF)?FAMILY_OF[f.node.id]:(f.group.id in FAMILY_OF?FAMILY_OF[f.group.id]:null);
  return fam?FAMILIES[fam].avoid:[];
}
function _normList(arr){return new Set((arr||[]).map(_norm));}
function removeAvoid(nodeId,word){
  const f=findNode(nodeId);if(!f)return false;
  const k=_norm(word),n=f.node;
  const had=(n.avoidAdd||[]).some(x=>_norm(x)===k);
  n.avoidAdd=(n.avoidAdd||[]).filter(x=>_norm(x)!==k);
  if(_normList(baseAvoidOf(f)).has(k)&&!(n.avoidRemove||[]).some(x=>_norm(x)===k))(n.avoidRemove=n.avoidRemove||[]).push(k);
  persist();return true;
}
function resetAvoid(nodeId){
  const f=findNode(nodeId);if(!f)return false;
  delete f.node.avoidAdd;delete f.node.avoidRemove;persist();return true;
}

// ---------- dữ liệu nhân vật CŨ lệch thể loại ----------
// Liệt kê nhân vật có xưng hô do AI ghi (addrSource!=='user') chứa từ lệch hệ của preset r. Không sửa gì.
// Trả [{char, changes:{addrThemToMc?:{before,after,dropped[]}, addrMcToThem?:{...}}}].
function staleAddrChars(chars,r){
  const out=[];
  if(!Array.isArray(chars))return out;
  chars.forEach(c=>{
    if(!c||c.addrSource==='user')return;
    const changes={};
    ['addrThemToMc','addrMcToThem'].forEach(k=>{
      if(!c[k])return;
      const f=filterAddr(c[k],r);
      if(f.dropped.length)changes[k]={before:c[k],after:f.text,dropped:f.dropped};
    });
    if(Object.keys(changes).length)out.push({char:c,changes});
  });
  return out;
}

// ---------- KHỐI CHỈ DẪN CHO 3 LUỒNG ----------
const _pairsLine=r=>compactPairs(r.pairs);
const _avoidLine=r=>avoidTerms(r).join(', ');

// LUỒNG 1 — phân tích xưng hô (buildCharExtractPrompt). Đặt cạnh guidanceSection.
function blockForExtract(r){
  if(!r)return '';
  const fam=r.family?FAMILIES[r.family]:null;
  let s=`THỂ LOẠI ĐÃ XÁC ĐỊNH CHO TRUYỆN NÀY: ${r.path}${fam?` — hệ xưng hô: ${fam.label}`:''} [${r.source==='user'?'người dùng chọn':'tự nhận diện'}].\n`+
    `BỘ XƯNG HÔ THƯỜNG GẶP của thể loại (dạng "tự xưng/gọi đối phương"; "A/B|C" = A với B hoặc C): ${_pairsLine(r)}\n`+
    `Cách dùng: khi điền self/callsMc/callsThem, ưu tiên từ nằm trong bộ này (đúng ý bản gốc, đừng gán cứng cặp nào). `;
  if(fam&&!fam.hanViet)s+=`Bản gốc chữ Hán dùng 哥哥/大哥/姐姐/妹妹/弟弟/师兄... thì DỊCH NGHĨA sang từ hợp thể loại (anh/anh trai, chị/chị gái, em...) — KHÔNG phiên âm Hán Việt kiểu Trung Quốc. `;
  const av=_avoidLine(r);
  if(av)s+=`TỪ CẦN TRÁNH — BẮT BUỘC, không ghi làm xưng hô: ${av}. Bản dịch dùng từ kiểu đó thì ghi cặp ĐÚNG HỆ tương đương (cùng vai vế, cùng sắc thái), không ghi chính từ cần tránh. `;
  s+=`Hai vế trong CÙNG một lựa chọn (tự xưng ↔ gọi đối phương) phải là hai đầu của MỘT quan hệ có thật, đối xứng vai vế: khi dùng cặp trong bộ này thì lấy đúng cặp đó, KHÔNG ghép vế trái của cặp này với vế phải của cặp khác (VD "đệ tử" chỉ đi với "sư phụ/sư tôn", không đi với "sư huynh"). `;
  s+=STANDARD_ONLY_NOTE+' ';
  s+=`Bộ này chỉ là gợi ý về từ vựng: TUYỆT ĐỐI không dùng nó để bịa xưng hô khi chương không có thoại trực tiếp (quy tắc mảng rỗng bên dưới vẫn giữ nguyên).\n\n`;
  return s;
}

// LUỒNG 2 — dịch chính (đầu buildCharacterContextText). Trả '' nếu chưa có preset.
function blockForTranslate(r){
  if(!r)return '';
  const fam=r.family?FAMILIES[r.family]:null;
  let s=`THỂ LOẠI CỦA TRUYỆN: ${r.path}${fam?` — hệ ${fam.label}`:''}. Mọi lời thoại và đại từ tường thuật trong bản dịch PHẢI mang đúng sắc thái thể loại này.\n`+
    `Bộ xưng hô thường gặp của thể loại (tự xưng/gọi đối phương; "A/B|C" = A với B hoặc C): ${_pairsLine(r)}\n`;
  const av=_avoidLine(r);
  if(av)s+=`TỪ CẦN TRÁNH — BẮT BUỘC, KHÔNG dùng làm xưng hô (lệch thể loại): ${av}. Luôn thắng xưng hô đã lưu và bộ thường gặp; chỉ bỏ qua khi từ đó không phải xưng hô (danh từ/từ ghép/tên riêng/số đếm).\n`;
  if(fam&&!fam.hanViet)s+=`Bản gốc chữ Hán có 哥哥/姐姐/妹妹/弟弟/师兄... thì dịch NGHĨA sang từ hợp thể loại (anh/chị/em...), không phiên âm Hán Việt (ca ca/huynh/tỷ/muội).\n`;
  s+=STANDARD_ONLY_NOTE+'\n';
  if(fam)s+=`Đại từ ngôi 3 khi tường thuật hợp thể loại: ${fam.narr}.\n`;
  s+=`Nếu chưa rõ quan hệ giữa 2 nhân vật thì KHÔNG tự đặt xưng hô xác định quan hệ (bố/mẹ/con/anh/em...) và không thêm danh từ quan hệ vào lời dẫn; chỉ dùng xưng hô trung tính theo thể loại (cổ trang: ta/ngươi; hiện đại: tôi/anh, tôi/chị, tôi/cậu).\n`;
  s+=`Thứ tự ưu tiên: xưng hô ĐÃ LƯU của từng nhân vật (nếu có bên dưới) > bộ thường gặp này > tự chọn hợp vai vế. Nếu prompt dịch chính ghi quy ước khác cho thể loại/xưng hô thì theo prompt dịch chính.\n\n`;
  return s;
}

// LUỒNG 3 — soát xưng hô thoại (buildDialogueToneTask). Trả các dòng bổ sung, '' nếu chưa có preset.
function blockForAudit(r){
  if(!r)return '';
  let s=`Thể loại cụ thể của truyện: ${r.path}. Bộ xưng hô thường gặp của thể loại (dùng để CHỌN TỪ THAY THẾ khi sửa; "A/B|C" = A với B hoặc C): ${_pairsLine(r)}\n`;
  const av=_avoidLine(r);
  if(av)s+=`TỪ CẦN TRÁNH — BẮT BUỘC (mọi chỗ xuất hiện làm xưng hô trong lời thoại, hoặc đại từ ngôi 3 trong tường thuật, đều PHẢI báo và sửa; chỉ bỏ qua khi từ đó không phải xưng hô: danh từ/từ ghép/tên riêng/số đếm): ${av}.\n`;
  s+='Xưng hô địa phương (ba, má, tía, tui, qua, bậu, mi, tau, mạ, u, bầm, anh Hai/chị Ba...) cũng là lỗi: đổi sang từ chuẩn/phổ thông (bố/cha, mẹ, tôi...).\n';
  return s;
}
// Chuẩn cho job "đại từ ngôi 3 khi tường thuật": neo theo thể loại thay vì chỉ theo phần còn lại của chương.
function narrAnchorForAudit(r){
  if(!r||!r.family)return '';
  return `\nChuẩn theo thể loại đã xác định — hệ ${FAMILIES[r.family].label}: nhóm đại từ ngôi 3 phù hợp là ${FAMILIES[r.family].narr}. Nếu CẢ phần đang soát lệch hẳn nhóm này (không chỉ vài câu lẻ) vẫn là lỗi, trừ khi "CHỈ DẪN THÊM" dặn khác.`;
}

// ---------- GÓI THEO NGÔN NGỮ ĐÍCH (kế hoạch 2.12) ----------
// byLang[mã] = danh sách nhóm (cùng định dạng DEFAULT_GROUPS). CHỈ 'vi' có dữ liệu; mọi ngôn ngữ khác ĐỂ TRỐNG (chủ dự án chốt 17/10/2026).
// Thêm ngôn ngữ sau này = thêm 1 dòng, vd  byLang.ja=JA_GROUPS;  (rồi nút "Xưng hô thường gặp" tự hiện cho đích ja, xem TargetLang.supports('addr')).
// Lưu ý: state người dùng sửa (LS_KEY / getState) hiện vẫn là của tiếng Việt; khi thêm gói ngôn ngữ khác cần khoá lưu riêng theo mã.
const byLang={vi:DEFAULT_GROUPS};
function groupsFor(code){const c=String(code||'vi');return byLang[c]||byLang[c.split('-')[0]]||[];}
function hasPack(code){const g=groupsFor(code);return Array.isArray(g)&&g.length>0;}

global.AddrPresets={
  byLang,groupsFor,hasPack,
  DEFAULT_GROUPS,FAMILIES,FAMILY_OF,
  getState,persist,reload,findNode,buildBank,
  getStoryChoice,setStoryChoice,
  detect,resolve,systemOf,avoidTerms,watchTerms,compactPairs,filterAddr,findAvoidHits,regionalFix,isRegionalTerm,STANDARD_ONLY_NOTE,
  parsePairInput,addPairs,removePair,resetNode,staleAddrChars,
  avoidListOf,avoidIsCustomized,addAvoid,removeAvoid,resetAvoid,
  blockForExtract,blockForTranslate,blockForAudit,narrAnchorForAudit
};
})(typeof window!=='undefined'?window:globalThis);
