/* ============================================================================
   lang-registry.js — BẢNG NGÔN NGỮ (GĐ2 mục 2.4)
   ----------------------------------------------------------------------------
   Một dòng cho mỗi mã trong danh sách ô "Ngôn ngữ gốc / Dịch sang" (window.__sdrLangs ở index.html).
   Dữ liệu thuần, không logic. Nạp SAU i18n.js, TRƯỚC target-lang.js.
     nameEn : tên tiếng Anh điền vào {{TARGET_LANG}} / {{SOURCE_LANG}} (ưu tiên hơn Intl.DisplayNames vì Intl hay trả
              "Chinese", "Filipino"... không phân biệt Giản/Phồn thể)
     script : mã bảng chữ ISO 15924 (Latn, Hans, Hant, Jpan, Kore, Cyrl, Arab, Deva, Thai...)
     dir    : 'ltr' | 'rtl'
     notes  : (tuỳ chọn) ghi chú ngắn cho prompt, điền vào {{TARGET_NOTES}}; thiếu = rỗng
     nameNative : tên ngôn ngữ viết bằng chính ngôn ngữ đó (GĐ2 mục 2.10)
     status : 'experimental' | 'tested' (GĐ2 mục 2.10). MẶC ĐỊNH MỌI MÃ = 'experimental' → ô "Dịch sang" hiện nhãn "Thử nghiệm".
              Đổi sang 'tested' chỉ bằng DỮ LIỆU ở bảng STATUS cuối phần dữ liệu (không sửa code):
                  es:{status:'tested', testedAt:'2026-10-20', model:'gemini-3.8-flash'},
              nên chạy LangQA.run('es') (lang-qa.js) + tự đọc mẫu rồi mới đổi.
     testedAt / model : (tuỳ chọn) ngày và model đã kiểm thử, để tra lại sau.
   Thêm ngôn ngữ = thêm 1 dòng. Mã không có trong bảng vẫn chạy (rơi về Intl.DisplayNames, Latn, ltr, experimental).
   ============================================================================ */
(function (g) {
  'use strict';
  if (g.LangRegistry) return;
  var R = {
    vi:['Vietnamese','Latn'], 'zh':['Simplified Chinese','Hans'], 'zh-TW':['Traditional Chinese','Hant'], en:['English','Latn'],
    ja:['Japanese','Jpan'], ko:['Korean','Kore'], fr:['French','Latn'], de:['German','Latn'], es:['Spanish','Latn'],
    ru:['Russian','Cyrl'], pt:['Portuguese','Latn'], it:['Italian','Latn'], th:['Thai','Thai'], id:['Indonesian','Latn'],
    hi:['Hindi','Deva'], ar:['Arabic','Arab','rtl'], tr:['Turkish','Latn'],
    af:['Afrikaans','Latn'], sq:['Albanian','Latn'], am:['Amharic','Ethi'], hy:['Armenian','Armn'], az:['Azerbaijani','Latn'],
    eu:['Basque','Latn'], be:['Belarusian','Cyrl'], bn:['Bengali','Beng'], bs:['Bosnian','Latn'], bg:['Bulgarian','Cyrl'],
    ca:['Catalan','Latn'], hr:['Croatian','Latn'], cs:['Czech','Latn'], da:['Danish','Latn'], nl:['Dutch','Latn'],
    eo:['Esperanto','Latn'], et:['Estonian','Latn'], tl:['Tagalog (Filipino)','Latn'], fi:['Finnish','Latn'], gl:['Galician','Latn'],
    ka:['Georgian','Geor'], el:['Greek','Grek'], gu:['Gujarati','Gujr'], ha:['Hausa','Latn'], he:['Hebrew','Hebr','rtl'],
    hu:['Hungarian','Latn'], is:['Icelandic','Latn'], ig:['Igbo','Latn'], ga:['Irish','Latn'], jv:['Javanese','Latn'],
    kn:['Kannada','Knda'], kk:['Kazakh','Cyrl'], km:['Khmer','Khmr'], ku:['Kurdish','Latn'], ky:['Kyrgyz','Cyrl'],
    lo:['Lao','Laoo'], la:['Latin','Latn'], lv:['Latvian','Latn'], lt:['Lithuanian','Latn'], mk:['Macedonian','Cyrl'],
    mg:['Malagasy','Latn'], ms:['Malay','Latn'], ml:['Malayalam','Mlym'], mt:['Maltese','Latn'], mr:['Marathi','Deva'],
    mn:['Mongolian','Cyrl'], my:['Burmese','Mymr'], ne:['Nepali','Deva'], no:['Norwegian','Latn'], ps:['Pashto','Arab','rtl'],
    fa:['Persian','Arab','rtl'], pl:['Polish','Latn'], pa:['Punjabi','Guru'], ro:['Romanian','Latn'], sr:['Serbian','Cyrl'],
    si:['Sinhala','Sinh'], sk:['Slovak','Latn'], sl:['Slovenian','Latn'], so:['Somali','Latn'], su:['Sundanese','Latn'],
    sw:['Swahili','Latn'], sv:['Swedish','Latn'], tg:['Tajik','Cyrl'], ta:['Tamil','Taml'], te:['Telugu','Telu'],
    uk:['Ukrainian','Cyrl'], ur:['Urdu','Arab','rtl'], uz:['Uzbek','Latn'], cy:['Welsh','Latn'], yo:['Yoruba','Latn'], zu:['Zulu','Latn']
  };
  // Tên bản ngữ (nameNative). Thiếu mã nào thì nameNative rơi về nameEn.
  var N = {
    vi:'Tiếng Việt', 'zh':'简体中文', 'zh-TW':'繁體中文', en:'English', ja:'日本語', ko:'한국어', fr:'Français', de:'Deutsch', es:'Español',
    ru:'Русский', pt:'Português', it:'Italiano', th:'ไทย', id:'Bahasa Indonesia', hi:'हिन्दी', ar:'العربية', tr:'Türkçe',
    af:'Afrikaans', sq:'Shqip', am:'አማርኛ', hy:'Հայերեն', az:'Azərbaycanca', eu:'Euskara', be:'Беларуская', bn:'বাংলা', bs:'Bosanski',
    bg:'Български', ca:'Català', hr:'Hrvatski', cs:'Čeština', da:'Dansk', nl:'Nederlands', eo:'Esperanto', et:'Eesti', tl:'Tagalog',
    fi:'Suomi', gl:'Galego', ka:'ქართული', el:'Ελληνικά', gu:'ગુજરાતી', ha:'Hausa', he:'עברית', hu:'Magyar', is:'Íslenska',
    ig:'Igbo', ga:'Gaeilge', jv:'Basa Jawa', kn:'ಕನ್ನಡ', kk:'Қазақша', km:'ខ្មែរ', ku:'Kurdî', ky:'Кыргызча', lo:'ລາວ', la:'Latina',
    lv:'Latviešu', lt:'Lietuvių', mk:'Македонски', mg:'Malagasy', ms:'Bahasa Melayu', ml:'മലയാളം', mt:'Malti', mr:'मराठी',
    mn:'Монгол', my:'မြန်မာ', ne:'नेपाली', no:'Norsk', ps:'پښتو', fa:'فارسی', pl:'Polski', pa:'ਪੰਜਾਬੀ', ro:'Română', sr:'Српски',
    si:'සිංහල', sk:'Slovenčina', sl:'Slovenščina', so:'Soomaali', su:'Basa Sunda', sw:'Kiswahili', sv:'Svenska', tg:'Тоҷикӣ',
    ta:'தமிழ்', te:'తెలుగు', uk:'Українська', ur:'اردو', uz:'Oʻzbekcha', cy:'Cymraeg', yo:'Yorùbá', zu:'isiZulu'
  };
  // ===== TRẠNG THÁI CHẤT LƯỢNG (2.10) — CHỈ DỮ LIỆU: thêm 1 dòng = đổi nhãn, không đụng code =====
  // Mã không có trong bảng này = 'experimental'. Giá trị hợp lệ: 'tested' | 'experimental' (giá trị lạ coi như 'experimental').
  // 'vi' = 'tested' vì là đường dịch gốc của app (golden vi), không phải ngôn ngữ thử nghiệm. Các mã khác: chưa có.
  var STATUS = {
    vi: { status: 'tested' }
    // es: { status: 'tested', testedAt: '2026-10-20', model: 'gemini-3.8-flash' },
  };
  var info = {};
  Object.keys(R).forEach(function (c) {
    var s = STATUS[c] || {};
    info[c] = {
      code: c, nameEn: R[c][0], nameNative: N[c] || R[c][0], script: R[c][1], dir: R[c][2] || 'ltr', notes: '',
      status: s.status === 'tested' ? 'tested' : 'experimental', testedAt: s.testedAt || '', model: s.model || ''
    };
  });
  // Tra theo mã đầy đủ rồi theo mã gốc ('pt-BR' → 'pt'); không có → null
  function get(code) { code = String(code || ''); return info[code] || info[code.split('-')[0]] || null; }
  // Trạng thái chất lượng của 1 mã: 'tested' | 'experimental'. Mã lạ (không có trong bảng) = 'experimental'.
  function status(code) { var r = get(code); return r ? r.status : 'experimental'; }
  function isTested(code) { return status(code) === 'tested'; }
  g.LangRegistry = { get: get, all: info, status: status, isTested: isTested };
})(window);
