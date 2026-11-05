// ===================================================================
// export.js — Xuất/tải xuống truyện dạng TXT và EPUB (tách từ index.html)
//
// Classic script (không type="module") — dùng chung global scope với khối
// <script> chính, giống cách tts.js/translate.js đã tách. Các hàm/biến ở đây
// (S, setStatus, applyReplace, stripTitle, cleanCensorChars, esc...) vẫn đọc/
// gọi bình thường qua global scope; XLATED_TAG_RE cũng được dùng lại ở phần
// SPLIT (nhận diện chương đã dịch lúc import lại) trong index.html.
// ===================================================================

// ===== DOWNLOAD TOÀN BỘ TRUYỆN (thay thế các chương đã dịch) =====
// Hậu tố "[ Dịch ]" chèn vào cuối tiêu đề các chương ĐÃ DỊCH lúc xuất file TXT/EPUB — hiển thị
// công khai (không ẩn) để người đọc cũng nhận biết được, đồng thời để tool tự nhận diện lại khi
// import file này (hoặc file đã dịch từ nơi khác có gắn thẻ tương tự) — coi nội dung (vốn đã là
// bản dịch) làm luôn bản dịch, không dịch nhầm/dịch lại từ đầu. Chỉ hoạt động đáng tin cậy ở chế độ
// chia chương theo MẪU TIÊU ĐỀ (không áp dụng cho chế độ chia theo số ký tự).
const XLATED_SUFFIX=' [ Dịch ]';
// Nhận diện các biến thể thẻ đánh dấu "đã dịch" ở tiêu đề chương: [ Dịch ], [Dịch], (Dịch), ( Dịch )...
// không phân biệt hoa/thường chữ D (theo yêu cầu người dùng), để nhận cả file dịch từ nơi khác.
const XLATED_TAG_RE=/[\(\[]\s*[Dd]ịch\s*[\)\]]/;
// ===== POPUP CHỌN KHOẢNG CHƯƠNG KHI TẢI XUỐNG TXT/EPUB =====
let _dlRangeFormat='txt';
// Nguồn đang tải: null = truyện ĐANG MỞ (đọc thẳng từ S); ngược lại là bản dựng sẵn từ tủ truyện
// ({name,fname,chapters,translations,translatedTitles}) cho truyện KHÔNG cần mở.
let _dlSrc=null;
function setDlFormat(fmt){
  _dlRangeFormat=(fmt==='epub')?'epub':'txt';
  document.querySelectorAll('#dlRangeBox .dl-fmt-btn').forEach(function(b){
    b.setAttribute('aria-checked',b.getAttribute('data-fmt')===_dlRangeFormat?'true':'false');
  });
  dlSyncOpts();
}
// Mục "Tuỳ chọn" của popup: mặc định ĐÓNG, bấm tiêu đề mới mở ra. Khi đóng, huy hiệu số cho biết có bao nhiêu tuỳ chọn đang bật.
function toggleDlOpts(force){
  const wrap=document.getElementById('dlOptsWrap'),btn=document.getElementById('dlOptsToggle');
  if(!wrap||!btn)return;
  const open=(typeof force==='boolean')?force:!wrap.classList.contains('open');
  wrap.classList.toggle('open',open);
  btn.setAttribute('aria-expanded',open?'true':'false');
  if(open)wrap.removeAttribute('inert');else wrap.setAttribute('inert','');
}
// Ba tuỳ chọn "Bỏ đánh dấu chương đã dịch" / "Bỏ tiêu đề chương" / "Bỏ ảnh bìa" được nhớ giữa các lần mở popup (localStorage).
// "Bỏ ảnh bìa" chỉ có nghĩa với EPUB → TXT thì làm mờ.
// TXT + "Bỏ tiêu đề chương": tiêu đề không xuất ra nên tuỳ chọn thẻ [ Dịch ] vô nghĩa → làm mờ (EPUB vẫn dùng tiêu đề ở mục lục).
function dlSyncOpts(){
  const noTitle=document.getElementById('dlNoTitle'),noTag=document.getElementById('dlNoXlatedTag');
  if(!noTitle||!noTag)return;
  const off=noTitle.checked&&_dlRangeFormat==='txt';
  noTag.disabled=off;
  const row=noTag.closest('.dl-opt');if(row)row.classList.toggle('is-off',off);
  const noCover=document.getElementById('dlNoCover');
  if(noCover){ // chỉ EPUB có ảnh bìa: TXT thì tuỳ chọn này vô nghĩa → làm mờ
    const offC=_dlRangeFormat==='txt';
    noCover.disabled=offC;
    const rowC=noCover.closest('.dl-opt');if(rowC)rowC.classList.toggle('is-off',offC);
  }
  try{localStorage.setItem('dl-no-title',noTitle.checked?'1':'0');localStorage.setItem('dl-no-xtag',noTag.checked?'1':'0');if(noCover)localStorage.setItem('dl-no-cover',noCover.checked?'1':'0');}catch(e){}
  const cnt=document.getElementById('dlOptsCount');
  if(cnt){
    const n=['dlMergeDup','dlNoXlatedTag','dlNoTitle','dlNoCover'].filter(function(id){const el=document.getElementById(id);return el&&el.checked&&!el.disabled;}).length;
    cnt.textContent=String(n);cnt.hidden=!n;
  }
}
function dlLoadOpts(){
  let t='0',x='0',c='0';
  try{t=localStorage.getItem('dl-no-title')||'0';x=localStorage.getItem('dl-no-xtag')||'0';c=localStorage.getItem('dl-no-cover')||'0';}catch(e){}
  document.getElementById('dlNoTitle').checked=(t==='1');
  document.getElementById('dlNoXlatedTag').checked=(x==='1');
  const nc=document.getElementById('dlNoCover');if(nc)nc.checked=(c==='1');
}
// format (tuỳ chọn): nhớ lựa chọn TXT/EPUB lần trước nếu không truyền. src (tuỳ chọn): xem _dlSrc.
function showDownloadRangePopup(format,src){
  _dlSrc=src||null;
  setDlFormat(format||_dlRangeFormat);
  let name='';
  if(_dlSrc)name=_dlSrc.name||_dlSrc.fname||'';
  else{
    const bk=(typeof libBooks!=='undefined'&&S.loadedBookId)?libBooks.find(function(b){return b.id===S.loadedBookId;}):null;
    name=(bk&&bk.name)||S.fname||'';
  }
  // Chỉ hiện TÊN truyện (màu nhấn, giống mục "Truyện đang đọc"), không kèm chữ "Truyện:". Tên nằm trong <span data-i18n-skip>
  // để bộ dịch giao diện không đụng vào tên truyện; không có tên thì hiện câu hướng dẫn như cũ (vẫn được dịch).
  const _dlMsg=document.getElementById('dlRangeMsg');
  _dlMsg.textContent='';
  if(name){
    const sp=document.createElement('span');
    sp.className='dl-book-name';sp.setAttribute('data-i18n-skip','');sp.textContent=name;
    _dlMsg.appendChild(sp);
  } else {
    _dlMsg.textContent='Chọn định dạng và khoảng chương muốn tải xuống.';
  }
  document.getElementById('dlFromChapter').value='';
  document.getElementById('dlToChapter').value='';
  document.getElementById('dlMergeDup').checked=false;
  dlLoadOpts();toggleDlOpts(false);dlSyncOpts(); // mục Tuỳ chọn luôn mở ra ở trạng thái đóng
  document.getElementById('dlRangeOverlay').classList.add('show');
}
function closeDlRangePopup(){
  document.getElementById('dlRangeOverlay').classList.remove('show');
  toggleDlOpts(false); // đóng luôn mục Tuỳ chọn nếu đang mở
}
document.getElementById('dlRangeOverlay').addEventListener('mousedown',function(e){if(e.target===this)closeDlRangePopup();});
// Chạy fn() với S tạm trỏ vào dữ liệu của truyện trong tủ (không mở truyện). Các hàm tải xuống đọc S ĐỒNG BỘ
// trước khi có await đầu tiên nên khôi phục S ngay sau khi fn() trả về là an toàn.
function _withExportSource(src,fn){
  if(!src)return fn();
  const bak={chapters:S.chapters,translations:S.translations,translatedTitles:S.translatedTitles,fname:S.fname,characters:S.characters};
  S.chapters=src.chapters;S.translations=src.translations;S.translatedTitles=src.translatedTitles;S.fname=src.fname;
  // resolveCharTokens() (character-memory.js) giải token ⟦c:id:Tên⟧ theo S.characters → nạp nhân vật của CHÍNH truyện này.
  S.characters=src.characters||[];
  try{return fn();}
  finally{
    S.chapters=bak.chapters;S.translations=bak.translations;S.translatedTitles=bak.translatedTitles;S.fname=bak.fname;S.characters=bak.characters;
  }
}
function confirmDownloadRange(){
  const src=_dlSrc;
  const chapters=src?src.chapters:S.chapters;
  const total=chapters?chapters.length:0;
  const fromRaw=document.getElementById('dlFromChapter').value.trim();
  const toRaw=document.getElementById('dlToChapter').value.trim();
  let from=parseInt(fromRaw,10);
  if(!fromRaw||isNaN(from))from=1;
  let to;
  if(!toRaw||/^cu[oố]i\s*c[uù]ng$/i.test(toRaw)){
    to=total;
  } else {
    to=parseInt(toRaw,10);
    if(isNaN(to))to=total;
  }
  if(from<1)from=1;
  if(to>total)to=total;
  if(from>to){setStatus('Khoảng chương không hợp lệ ("Tải từ chương" phải nhỏ hơn hoặc bằng "Tới chương").',4000);return;}
  const merge=document.getElementById('dlMergeDup').checked;
  const opts={noXlatedTag:document.getElementById('dlNoXlatedTag').checked,noTitle:document.getElementById('dlNoTitle').checked,noCover:!!(document.getElementById('dlNoCover')&&document.getElementById('dlNoCover').checked),cover:src?(src.cover||''):epubCurrentCover()}; // cover: ảnh bìa của truyện (chỉ EPUB dùng)
  const fmt=_dlRangeFormat;
  closeDlRangePopup();
  _withExportSource(src,function(){
    return fmt==='epub'?downloadFullStoryEpub(from,to,merge,opts):downloadFullStory(from,to,merge,opts);
  });
}

// ===== TẢI XUỐNG TỪ MENU TỦ TRUYỆN (không cần mở truyện) =====
// Dựng lại danh sách chương + bản dịch của 1 truyện từ IndexedDB theo ĐÚNG cách loadTxt()/libOpen() làm,
// nhưng KHÔNG đụng vào S, cài đặt hay truyện đang đọc.
async function libBuildExportSource(id){
  const bk=await libGet(id);
  if(!bk||!bk.content)return null;
  const cfg=bk.splitCfg||SPLIT_CFG_LEGACY;
  const chars=getST()==='chars';
  const key=splitConfigKey(chars,cfg);
  const v=bk.variants?(bk.variants[key]||null):{translations:bk.translations||{},translatedTitles:bk.translatedTitles||{},chapterTitles:bk.chapterTitles||null};
  const savedTitles=(v&&Array.isArray(v.chapterTitles))?v.chapterTitles:null;
  let text=bk.content;
  if(!savedTitles)text=cleanDecorChars(text);
  if(!chars)text=stripTocBlock(text,getPat());
  let chs=chars?splitChars(text,getCC()):splitPat(text,getPat(),cfg);
  if(!chars){
    const big=getCC()*2;
    const singleHuge=chs.length===1&&text.length>getCC();
    const allInOne=chs.length<=2&&text.length>big&&chs.every(function(c){return c.content.length>big;});
    if(singleHuge||allInOne)chs=splitChars(text,getCC());
  }
  if(!chs.length)return null;
  const translations={},translatedTitles={};
  // Chương đã mang thẻ [ Dịch ] ở tiêu đề: nội dung chính là bản dịch
  chs.forEach(function(ch,i){if(ch._xlatedTag){translations[i]=ch.content;}});
  const sT=v&&v.translations,sTT=v&&v.translatedTitles;
  if(sT&&Object.keys(sT).length>0){
    if(savedTitles){
      const t2t={},t2tt={};
      savedTitles.forEach(function(title,oi){
        if(sT[oi])t2t[title]=sT[oi];
        if(sTT&&sTT[oi])t2tt[title]=sTT[oi];
      });
      chs.forEach(function(ch,i){
        if(t2t[ch.title])translations[i]=t2t[ch.title];
        if(t2tt[ch.title])translatedTitles[i]=t2tt[ch.title];
      });
    }else{
      chs.forEach(function(ch,i){
        if(sT[i])translations[i]=sT[i];
        if(sTT&&sTT[i])translatedTitles[i]=sTT[i];
      });
    }
  }
  return {name:bk.name||'',cover:bk.cover||'',fname:bk.fname||((bk.name||'truyen')+'.txt'),chapters:chs,translations:translations,translatedTitles:translatedTitles,characters:(function(){const f=(typeof charmemField==='function')?charmemField('characters',(typeof TargetLang!=='undefined'&&TargetLang.code)?TargetLang.code():'vi'):'characters';const v=bk[f];return Array.isArray(v)?v:[];})()};
}
async function libDownload(e,id){
  if(e)e.stopPropagation();
  libCloseMenu();
  // Truyện đang mở: dùng thẳng dữ liệu đang hiển thị (luôn mới nhất, kể cả bản dịch chưa kịp lưu).
  if(id===S.loadedBookId&&S.chapters&&S.chapters.length){showDownloadRangePopup();return;}
  setStatus('Đang chuẩn bị truyện...',60000);
  let src=null;
  try{src=await libBuildExportSource(id);}catch(err){console.warn('[Lib] Không đọc được truyện để tải xuống',err);}
  setStatus('',0);
  if(!src){setStatus('Không đọc được nội dung truyện này để tải xuống.',4000);return;}
  showDownloadRangePopup(null,src);
}

// ===== GỘP CÁC CHƯƠNG TRÙNG TIÊU ĐỀ =====
// Tiền tố số chương: "Chương 12", "Chapter 12", "Hồi 12", "第12"... (nhóm 1 = chữ, nhóm 2 = số)
const _CH_PREFIX_RE=/^((?:ch[uư][oơ]ng|chapter|ch\.?|h[ồo]i|quy[ểe]n|t[ậa]p|ph[ầa]n|第)\s*)(\d+)/i;
const _CH_PREFIX_FULL_RE=/^(?:ch[uư][oơ]ng|chapter|ch\.?|h[ồo]i|quy[ểe]n|t[ậa]p|ph[ầa]n|第)\s*\d+\s*[章回节節]?\s*[:：.\-–—]?\s*/i;
// Hậu tố phần — CHỈ nhận 3 dạng: "Phần 1" (gốc), "Part 1" (có thể kèm "-" hoặc ngoặc: "- Phần 1", "(Part 1)") và "(1)".
// Muốn hỗ trợ ngôn ngữ khác sau này: thêm regex mới vào mảng _PART_SUFFIX_RES (phải kết thúc bằng $).
const _PART_SUFFIX_RES=[
  /\s*(?:[-–—:|]\s*)?[\(\[]?\s*ph[ầa]n\s*\.?\s*\d+\s*[\)\]]?\s*$/i, // Phần 1
  /\s*(?:[-–—:|]\s*)?[\(\[]?\s*part\s*\.?\s*\d+\s*[\)\]]?\s*$/i, // Part 1
  /\s*\(\s*\d+\s*\)\s*$/                                           // (1)
];
function _stripXlatedTag(t){return t.replace(new RegExp(XLATED_TAG_RE.source,'g'),'').trim();}
function _stripPartSuffix(t){
  for(let i=0;i<_PART_SUFFIX_RES.length;i++){
    if(_PART_SUFFIX_RES[i].test(t))return t.replace(_PART_SUFFIX_RES[i],'').trim();
  }
  return t.trim();
}
// Phân tích tiêu đề GỐC (S.chapters[i].title) do tool sinh ra: "Chương N: Tên - Phần X", "Chương N: - Phần X",
// "Chương N: Phần X". Trả về {body (tên gốc, chuẩn hoá), part} hoặc null nếu tiêu đề không có hậu tố Phần.
// Dùng tiêu đề GỐC (không phải tiêu đề đã dịch) vì AI có thể dịch/đặt tên khác nhau cho từng phần.
function _origPartInfo(title){
  const m=(title||'').match(/^Chương\s+\d+:\s*(.*?)(?:\s*-)?\s*Phần\s+(\d+)\s*$/i);
  if(!m)return null;
  return {body:m[1].trim().toLowerCase().replace(/\s+/g,' '),part:parseInt(m[2],10)};
}
function _dupTitleKey(title){
  let t=_stripXlatedTag(title).replace(_CH_PREFIX_FULL_RE,'');
  t=_stripPartSuffix(t).toLowerCase().replace(/\s+/g,' ').trim();
  return t||null; // tiêu đề chỉ có "Chương N" → không gộp
}
// Gom dữ liệu các chương [from..to] (1-based). merge=true: gộp chương LIỀN KỀ cùng tiêu đề (bỏ hậu tố
// "Phần N"), rồi đánh số lại "Chương N" liên tục theo số của chương đầu tiên.
function collectExportChapters(from,to,merge,opts){
  opts=opts||{};
  let translatedCount=0;
  let raw=[];
  for(let i=from-1;i<to;i++){
    const ch=S.chapters[i];
    const trans=S.translations[i];
    // Ưu tiên tiêu đề ĐÃ DỊCH nếu có, kể cả khi nội dung chương CHƯA dịch.
    // Chương KHÔNG tên ("Chương N:", "Chương N: - Phần X") không có tên thật → bỏ qua tiêu đề đã dịch (có thể là tên AI
    // tự đặt/bịa lưu từ phiên cũ; tính năng AI tự đặt tên đã gỡ bỏ).
    const info=_origPartInfo(ch.title);
    const untitled=/^Chương\s+\d+:\s*(?:-\s*)?(?:Phần\s+\d+)?\s*$/i.test(ch.title||'');
    let body,title=(!untitled&&S.translatedTitles[i])||ch.title;
    const translated=!!trans;
    if(trans){
      translatedCount++;
      // [TOKEN TÊN] resolveCharTokens: bản dịch lưu tên nhân vật dạng ⟦c:id:Tên⟧ — mọi chỗ ĐỌC nội dung bản dịch phải giải token (xem khối chú thích trong character-memory.js).
      body=cleanCensorChars(applyReplace(stripTitle(resolveCharTokens(trans),ch.title)));
    }else{
      body=applyReplace(stripTitle(ch.content,ch.title));
    }
    raw.push({title:title,body:body.trimEnd(),translated:translated,info:info});
  }
  if(merge){
    const groups=[];
    raw.forEach(function(it){
      const last=groups[groups.length-1];
      const prev=last?last.items[last.items.length-1]:null;
      let same=false;
      if(prev){
        if(it.info&&prev.info){
          // Cùng tên gốc và số Phần liền kề (n → n+1) = cùng 1 chương bị tách. Không phụ thuộc tiêu đề đã dịch.
          same=it.info.body===prev.info.body&&it.info.part===prev.info.part+1;
        }else if(!it.info&&!prev.info){
          const k=_dupTitleKey(it.title);
          same=!!k&&k===_dupTitleKey(prev.title);
        }
      }
      if(same)last.items.push(it);else groups.push({items:[it]});
    });
    let merged=groups.map(function(g){
      if(g.items.length===1)return g.items[0];
      const first=g.items[0];
      return {
        title:_stripPartSuffix(_stripXlatedTag(first.title)).replace(/\s*[:：]\s*$/,''),
        body:g.items.map(function(x){return x.body;}).filter(Boolean).join('\n\n'),
        translated:g.items.some(function(x){return x.translated;})
      };
    });
    // Đánh số lại chương liên tục theo thứ tự MỚI sau khi gộp. Bắt đầu từ số của chương có đánh số ĐẦU TIÊN trong
    // khoảng xuất (bỏ qua các mục không số đứng trước như "Mở đầu"), rồi +1 cho mỗi chương có đánh số kế tiếp.
    if(merged.length<raw.length){
      let n=null;
      merged.forEach(function(it){
        const m=_CH_PREFIX_RE.exec(it.title);
        if(!m)return;
        if(n===null)n=parseInt(m[2],10);
        const cur=n++;
        it.title=it.title.replace(_CH_PREFIX_RE,function(_,pre){return pre+cur;});
      });
    }
    raw=merged;
  }
  const list=raw.map(function(it){
    let title=it.title;
    if(opts.noXlatedTag)title=_stripXlatedTag(title).replace(/\s{2,}/g,' '); // bỏ cả thẻ đã có sẵn ở tiêu đề (file nhập từ nơi khác)
    else if(it.translated&&!XLATED_TAG_RE.test(title))title=title+XLATED_SUFFIX; // tránh gắn trùng
    return {title:title,body:it.body};
  });
  return {list:list,translatedCount:translatedCount};
}
function downloadFullStory(fromCh,toCh,merge,opts){
  opts=opts||{};
  if(!S.chapters||S.chapters.length===0){setStatus('Chưa có truyện nào để tải xuống.',3000);return;}
  const total=S.chapters.length;
  const from=Math.max(1,fromCh||1);
  const to=Math.min(total,toCh||total);
  const res=collectExportChapters(from,to,!!merge,opts);
  const translatedCount=res.translatedCount;
  const parts=res.list.map(function(c){return (opts.noTitle?c.body:(c.title+'\n\n'+c.body)).trimEnd();}).filter(function(x){return x||!opts.noTitle;});
  const fullText=parts.join('\n\n\n');
  const baseName=(S.fname||'truyen.txt').replace(/\.txt$/i,'');
  const rangeSuffix=(from===1&&to===total)?'':(' (ch.'+from+'-'+to+')');
  const outName=baseName+rangeSuffix+' (đã dịch '+translatedCount+'-'+(to-from+1)+').txt';
  const blob=new Blob([fullText],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=outName;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  setStatus(`Đã tải xuống truyện (${translatedCount}/${to-from+1} chương đã dịch).`,4000);
}
// ===== DOWNLOAD TOÀN BỘ TRUYỆN DẠNG EPUB =====
function epubUuid(){
  try{if(crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
    const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16);
  });
}
function textToXhtmlParagraphs(text){
  return text.split(/\n{2,}/).map(function(block){
    block=block.trim();
    if(!block)return '';
    // giữ ngắt dòng đơn (vd: thoại từng dòng) bằng <br/>
    const lines=block.split(/\n/).map(function(l){return esc(l);});
    return '<p>'+lines.join('<br/>')+'</p>';
  }).filter(Boolean).join('\n');
}
// ===== ẢNH BÌA TRONG EPUB =====
// Ảnh bìa của truyện (bk.cover) là data:image/... (ảnh tự tải lên / lấy từ file EPUB nhập) hoặc link http(s) (ảnh chọn từ kho).
// Link http(s): ưu tiên bản đã tải sẵn trong Cache Storage (COVER_CACHE, JPEG 560x784 — xem libCacheCover trong index.html),
// không có thì tải từ link (cần server ảnh cho phép CORS). Không có bìa / không lấy được thì xuất EPUB bình thường, chỉ thiếu bìa.
function epubCurrentCover(){
  try{
    if(typeof libBooks==='undefined'||!S||S.loadedBookId==null)return '';
    const m=libBooks.find(function(b){return b.id===S.loadedBookId;});
    return (m&&m.cover)||'';
  }catch(e){return '';}
}
async function epubFetchCoverBlob(url){
  if(url.slice(0,11)==='data:image/'){
    try{
      const i=url.indexOf(','),head=url.slice(5,i),mime=head.split(';')[0];
      if(/;base64/i.test(head)){
        const bin=atob(url.slice(i+1)),u8=new Uint8Array(bin.length);
        for(let k=0;k<bin.length;k++)u8[k]=bin.charCodeAt(k);
        return new Blob([u8],{type:mime});
      }
    }catch(e){}
    return await (await fetch(url)).blob();
  }
  try{
    if('caches' in window){
      const c=await caches.open(typeof COVER_CACHE!=='undefined'?COVER_CACHE:'nt-covers-v1');
      const hit=await c.match(url);
      if(hit){const b=await hit.blob();if(b&&b.size&&/^image\//i.test(b.type))return b;}
    }
  }catch(e){}
  const ac=new AbortController();
  const t=setTimeout(function(){ac.abort();},10000);
  try{
    const r=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:ac.signal});
    if(!r.ok)return null;
    const b=await r.blob();
    return (b&&b.size&&/^image\//i.test(b.type))?b:null;
  }finally{clearTimeout(t);}
}
// EPUB chỉ chắc chắn đọc được JPEG/PNG/GIF: định dạng khác (webp, avif, bmp...) được đổi sang JPEG qua canvas.
// Trả về {buf:ArrayBuffer, mime, ext} hoặc null.
async function epubPrepareCover(url){
  if(!url)return null;
  try{
    let blob=await epubFetchCoverBlob(url);
    if(!blob)return null;
    let mime=(blob.type||'').toLowerCase().split(';')[0];
    if(mime==='image/jpg')mime='image/jpeg';
    if(mime!=='image/jpeg'&&mime!=='image/png'&&mime!=='image/gif'){
      const bmp=await createImageBitmap(blob);
      const cv=document.createElement('canvas');cv.width=bmp.width;cv.height=bmp.height;
      const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(bmp,0,0);
      if(bmp.close)bmp.close();
      blob=await new Promise(function(res){cv.toBlob(res,'image/jpeg',0.92);});
      if(!blob)return null;
      mime='image/jpeg';
    }
    return {buf:await blob.arrayBuffer(),mime:mime,ext:mime==='image/png'?'png':(mime==='image/gif'?'gif':'jpg')};
  }catch(e){console.warn('[EPUB] Không lấy được ảnh bìa:',e);return null;}
}
async function downloadFullStoryEpub(fromCh,toCh,merge,opts){
  opts=opts||{};
  const coverUrl=opts.noCover?'':((opts.cover!==undefined)?opts.cover:epubCurrentCover()); // "Bỏ ảnh bìa" → không nhúng bìa // đọc ĐỒNG BỘ trước await đầu tiên (S còn trỏ đúng truyện)
  if(!S.chapters||S.chapters.length===0){setStatus('Chưa có truyện nào để tải xuống.',3000);return;}
  if(typeof JSZip==='undefined'){setStatus('Chưa tải được thư viện tạo EPUB (JSZip). Kiểm tra kết nối mạng rồi thử lại.',4000);return;}
  setStatus('Đang tạo file EPUB...',60000);
  try{
    const total=S.chapters.length;
    const from=Math.max(1,fromCh||1);
    const to=Math.min(total,toCh||total);
    const res=collectExportChapters(from,to,!!merge,opts);
    const translatedCount=res.translatedCount;
    const chapterData=res.list;
    const baseName=(S.fname||'truyen').replace(/\.(txt|epub)$/i,'');
    const bookId=epubUuid();
    const nowIso=new Date().toISOString().replace(/\.\d+Z$/,'Z');

    // Ngôn ngữ/hướng chữ của file xuất (2.11/4.2): đích vi → 'vi', ltr, chuỗi giống hệt cũ. Đích ≠ vi → mã đích, dir=rtl nếu cần.
    const tlx=(window.TargetLang&&!TargetLang.isVi())?TargetLang:null;
    const xLang=tlx?tlx.code():'vi';
    const xRtl=!!(tlx&&tlx.dir()==='rtl');
    const xLangAttr='xml:lang="'+xLang+'" lang="'+xLang+'"'+(xRtl?' dir="rtl"':'');
    const xToc=tlx?'Contents':'Mục lục';
    const xCover=tlx?'Cover':'Bìa';
    const cover=await epubPrepareCover(coverUrl); // null nếu truyện chưa có bìa / không lấy được
    const zip=new JSZip();
    zip.file('mimetype','application/epub+zip',{compression:'STORE'});
    zip.folder('META-INF').file('container.xml',
      '<?xml version="1.0" encoding="UTF-8"?>\n'+
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'+
      '  <rootfiles>\n'+
      '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n'+
      '  </rootfiles>\n'+
      '</container>');

    const oebps=zip.folder('OEBPS');
    oebps.file('style.css',
      'body{font-family:serif;line-height:1.6;margin:1em;}\n'+
      'h1{font-size:1.3em;margin:0 0 1em;text-align:center;}\n'+
      'p{margin:0 0 1em;text-indent:1.5em;}\n'+
      'nav ol{list-style:none;padding-left:1em;}'+(xRtl?'\nbody{direction:rtl;}\nnav ol{padding-left:0;padding-right:1em;}':''));

    if(cover){
      oebps.file('images/cover.'+cover.ext,cover.buf,{binary:true});
      oebps.file('cover.xhtml',
        '<?xml version="1.0" encoding="UTF-8"?>\n'+
        '<!DOCTYPE html>\n'+
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '+xLangAttr+'>\n'+
        '<head><title>'+xCover+'</title>\n'+
        '<style type="text/css">html,body{margin:0;padding:0;height:100%;text-align:center;}img{max-width:100%;max-height:100%;margin:0 auto;}</style></head>\n'+
        '<body epub:type="cover"><img src="images/cover.'+cover.ext+'" alt="'+xCover+'"/></body>\n</html>');
    }
    const chapFolder=oebps.folder('chapters');
    const manifestItems=[];
    const spineItems=[];
    const navPoints=[];
    const ncxPoints=[];

    chapterData.forEach(function(ch,i){
      const id='chap'+String(i+1).padStart(4,'0');
      const fname=id+'.xhtml';
      const xhtml=
        '<?xml version="1.0" encoding="UTF-8"?>\n'+
        '<!DOCTYPE html>\n'+
        '<html xmlns="http://www.w3.org/1999/xhtml" '+xLangAttr+'>\n'+
        '<head><title>'+esc(ch.title)+'</title>\n'+
        '<link rel="stylesheet" type="text/css" href="../style.css"/></head>\n'+
        '<body>\n'+(opts.noTitle?'':'<h1>'+esc(ch.title)+'</h1>\n')+textToXhtmlParagraphs(ch.body)+'\n</body>\n</html>'; // noTitle: không in tiêu đề trong trang, mục lục (nav/ncx) vẫn giữ tên chương để điều hướng
      chapFolder.file(fname,xhtml);
      manifestItems.push('    <item id="'+id+'" href="chapters/'+fname+'" media-type="application/xhtml+xml"/>');
      spineItems.push('    <itemref idref="'+id+'"/>');
      navPoints.push('      <li><a href="chapters/'+fname+'">'+esc(ch.title)+'</a></li>');
      ncxPoints.push(
        '    <navPoint id="np'+(i+1)+'" playOrder="'+(i+1)+'">\n'+
        '      <navLabel><text>'+esc(ch.title)+'</text></navLabel>\n'+
        '      <content src="chapters/'+fname+'"/>\n'+
        '    </navPoint>');
    });

    oebps.file('nav.xhtml',
      '<?xml version="1.0" encoding="UTF-8"?>\n'+
      '<!DOCTYPE html>\n'+
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '+xLangAttr+'>\n'+
      '<head><title>'+xToc+'</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n'+
      '<body>\n<nav epub:type="toc" id="toc"><h1>'+xToc+'</h1><ol>\n'+navPoints.join('\n')+'\n</ol></nav>\n'+
      (cover?'<nav epub:type="landmarks" hidden="hidden"><ol><li><a epub:type="cover" href="cover.xhtml">'+xCover+'</a></li></ol></nav>\n':'')+
      '</body>\n</html>');

    oebps.file('toc.ncx',
      '<?xml version="1.0" encoding="UTF-8"?>\n'+
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'+
      '  <head>\n'+
      '    <meta name="dtb:uid" content="urn:uuid:'+bookId+'"/>\n'+
      '  </head>\n'+
      '  <docTitle><text>'+esc(baseName)+'</text></docTitle>\n'+
      '  <navMap>\n'+ncxPoints.join('\n')+'\n  </navMap>\n'+
      '</ncx>');

    oebps.file('content.opf',
      '<?xml version="1.0" encoding="UTF-8"?>\n'+
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">\n'+
      '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'+
      '    <dc:identifier id="BookId">urn:uuid:'+bookId+'</dc:identifier>\n'+
      '    <dc:title>'+esc(baseName)+'</dc:title>\n'+
      '    <dc:language>'+xLang+'</dc:language>\n'+
      '    <meta property="dcterms:modified">'+nowIso+'</meta>\n'+
      (cover?'    <meta name="cover" content="cover-image"/>\n':'')+ // EPUB2: đọc được bìa ở các app cũ
      '  </metadata>\n'+
      '  <manifest>\n'+
      '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n'+
      '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n'+
      '    <item id="css" href="style.css" media-type="text/css"/>\n'+
      (cover?'    <item id="cover-image" href="images/cover.'+cover.ext+'" media-type="'+cover.mime+'" properties="cover-image"/>\n    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n':'')+
      manifestItems.join('\n')+'\n'+
      '  </manifest>\n'+
      '  <spine toc="ncx"'+(xRtl?' page-progression-direction="rtl"':'')+'>\n'+(cover?'    <itemref idref="cover"/>\n':'')+spineItems.join('\n')+'\n  </spine>\n'+
      (cover?'  <guide><reference type="cover" title="'+xCover+'" href="cover.xhtml"/></guide>\n':'')+
      '</package>');

    const blob=await zip.generateAsync({type:'blob',mimeType:'application/epub+zip'});
    const rangeSuffix=(from===1&&to===total)?'':(' (ch.'+from+'-'+to+')');
    const outName=baseName+rangeSuffix+' (đã dịch '+translatedCount+'-'+(to-from+1)+').epub';
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=outName;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url);},2000);
    setStatus('Đã tải xuống EPUB ('+translatedCount+'/'+(to-from+1)+' chương đã dịch'+(cover?', có ảnh bìa':'')+').'+((coverUrl&&!cover)?' Không lấy được ảnh bìa nên EPUB chưa có bìa.':''),(coverUrl&&!cover)?7000:4000);
  }catch(err){
    console.error(err);
    setStatus('Lỗi khi tạo EPUB: '+(err&&err.message?err.message:err),5000);
  }
}
