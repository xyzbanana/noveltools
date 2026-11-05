/* ============================================================================
   api-sched.js — BỘ ĐIỀU PHỐI API (Sched) — GIAI ĐOẠN 3–5: MỌI REQUEST GEMINI CHỜ CHỖ TRỐNG TRƯỚC KHI GỬI (khoá giữa các tab bằng navigator.locks)
   ----------------------------------------------------------------------------
   Mục đích giai đoạn này: đo xem HIỆN TẠI từng cặp (key, model) đang bị bắn bao nhiêu
   request trong 60 giây, có vượt giới hạn Flash 5/phút, Lite 15/phút hay không, và luồng
   (purpose) nào gây vượt. Không đổi hành vi dịch: Sched.begin() chỉ ghi số liệu rồi trả về.

   Móc vào: callAPI() trong translate.js — mọi request Gemini (dịch, translate-cont, tiêu đề,
   toàn bộ lượt của character-memory.js) đều đi qua hàm này nên đếm được hết ở 1 chỗ.
   DeepSeek (model không bắt đầu bằng "gemini") bị bỏ qua, không có giới hạn 5/15.

   Bộ đếm lưu localStorage (mốc thời gian 60s gần nhất mỗi slot) để reload / nhiều tab
   không làm mất số đếm. KHÔNG xóa khi tải lại trang. Id slot = model + 8 ký tự cuối key.

   Dùng trong Console:  Sched.report()   — in số request mỗi slot trong 60s qua + đỉnh + vi phạm
                        Sched.reset()    — xóa số liệu thống kê của trang này (không xóa mốc 60s)
   Cảnh báo tự động:    [RL-AUDIT] khi 1 slot vượt giới hạn, hoặc nhận 429 dù bộ đếm báo còn chỗ.
   ============================================================================ */
(function(global){
  'use strict';
  const CFG={
    // TÀI KHOẢN TRẢ PHÍ (Tier 1): theo tài liệu bên thứ ba (tháng 2/2026) khoảng 150–300 RPM tuỳ model. CHƯA xác nhận với các model 3.x
    // và với tier thật của project bạn → đặt ở đầu thấp của khoảng đó như lưới an toàn (tốc độ 3x chỉ ~vài chục request/phút nên hầu như không bao giờ chạm).
    // Hạn mức thật xem ở Google AI Studio → Rate limits. Giới hạn của Google tính theo PROJECT, không theo key.
    // Gói miễn phí: LIMIT_FLASH:5, LIMIT_LITE:15. Tắt hẳn việc chờ: MODE:'count'.
    LIMIT_FLASH:150,   // req/60s mỗi (key, model Flash)
    LIMIT_LITE:300,    // req/60s mỗi (key, model Lite)
    WINDOW_MS:60000,
    SAFETY_MS:1000,    // (giai đoạn sau) cộng vào thời gian chờ slot trống
    LS_KEY:'dich-sched-v1',
    MODE:'enforce',    // 'enforce' = MỌI luồng Gemini chờ khi slot kín (callAPI tự acquire). 'count' = chỉ đếm, KHÔNG chờ.
    ENFORCE_CHAR:true, // giữ tên cũ: bật/tắt toàn bộ cơ chế chờ (false = chỉ đếm như giai đoạn 1)
    LOCK_NAME:'dich-sched-lock', // navigator.locks: kiểm tra→ghi lượt nguyên tử giữa các tab
    MAX_WAIT_MS:90000, // chờ tối đa 1 lần acquire; quá thì ném lỗi 429 (CHAN_SCHED) để caller đổi key/model
    LOG_MAX:200
  };
  const stats={since:Date.now(),peak:{},byPurpose:{},violations:[],err429:[],lag429:0,err5xx:0,inflight:0,waits:{}};

  const isGemini=m=>/^gemini/i.test(String(m||''));
  const isLite=m=>/lite/i.test(String(m||''));
  function limitFor(model){return !isGemini(model)?null:(isLite(model)?CFG.LIMIT_LITE:CFG.LIMIT_FLASH);}
  function slotId(key,model){return String(model)+':'+String(key||'').slice(-8);}
  function maskId(id){const i=id.lastIndexOf(':');return id.slice(0,i)+':***'+id.slice(-4);}
  function load(){try{const o=JSON.parse(localStorage.getItem(CFG.LS_KEY)||'{}');return (o&&typeof o==='object')?o:{};}catch(_){return {};}}
  function save(o){try{localStorage.setItem(CFG.LS_KEY,JSON.stringify(o));}catch(_){}}
  function prune(o,now){
    for(const id in o){
      const a=Array.isArray(o[id])?o[id].filter(t=>now-t<CFG.WINDOW_MS):[];
      if(a.length)o[id]=a;else delete o[id];
    }
    return o;
  }
  function cap(arr){if(arr.length>CFG.LOG_MAX)arr.splice(0,arr.length-CFG.LOG_MAX);}
  function purp(p){const k=p||'khac';return stats.byPurpose[k]||(stats.byPurpose[k]={sent:0,over:0});}

  // Gọi NGAY TRƯỚC khi gửi request thật. Trả về token (hoặc null nếu không áp dụng, vd DeepSeek).
  function begin(key,model,purpose){
    try{
      const lim=limitFor(model);
      if(lim==null)return null;
      const now=Date.now(),id=slotId(key,model);
      const o=prune(load(),now);
      const a=o[id]||(o[id]=[]);
      a.push(now);
      save(o);
      const n=a.length;
      stats.inflight++;
      const p=purp(purpose);p.sent++;
      if(!stats.peak[id]||stats.peak[id]<n)stats.peak[id]=n;
      if(n>lim){
        p.over++;
        stats.violations.push({t:now,slot:maskId(id),purpose:purpose||'khac',n,lim});cap(stats.violations);
        console.warn(`[RL-AUDIT] VƯỢT giới hạn: ${maskId(id)} = ${n}/${lim} trong 60s · luồng "${purpose||'khac'}"`);
      }
      return {id,model,key,purpose:purpose||'khac',t:now,n,lim};
    }catch(_){return null;}
  }


  // Số ms phải chờ để slot (key, model) có chỗ trống (0 = gửi được ngay). DeepSeek luôn 0.
  function waitMs(key,model){
    const lim=limitFor(model);
    if(lim==null)return 0;
    const now=Date.now(),a=(prune(load(),now)[slotId(key,model)]||[]).slice().sort((x,y)=>x-y);
    if(a.length<lim)return 0;
    return Math.max(0,a[a.length-lim]+CFG.WINDOW_MS+CFG.SAFETY_MS-now);
  }

  // Giai đoạn 2: CHỜ tới khi slot còn chỗ rồi mới ghi lượt + trả token (dùng thay begin).
  // Kiểm tra→ghi chạy đồng bộ trong 1 tab nên nhiều lượt song song không chen nhau; giữa các tab chưa nguyên tử (giai đoạn 5).
  // ctl (tuỳ chọn): {cancelled:bool} — dừng chờ nếu bị huỷ. Token trả về truyền cho callAPI qua opts.schedTok để không đếm đôi.
  // Hook do app cài: shouldCancel() -> true khi người dùng bấm Dừng; onWait(info) / onWaitEnd() để hiện trạng thái chờ.
  const hooks={shouldCancel:null,onWait:null,onWaitEnd:null};
  function setHooks(h){Object.assign(hooks,h||{});}
  const enforcing=()=>CFG.ENFORCE_CHAR&&CFG.MODE==='enforce';

  // Kiểm tra chỗ trống + ghi lượt trong 1 bước. Có navigator.locks thì nguyên tử giữa MỌI tab; không có thì nguyên tử trong tab (JS đơn luồng).
  // Trả {tok} nếu đã ghi lượt, hoặc {wait:ms} nếu phải chờ.
  function tryTake(key,model,purpose){
    const w=waitMs(key,model);
    if(w>0)return {wait:w};
    return {tok:begin(key,model,purpose)};
  }
  function tryTakeLocked(key,model,purpose){
    if(typeof navigator!=='undefined'&&navigator.locks&&typeof navigator.locks.request==='function'){
      return navigator.locks.request(CFG.LOCK_NAME,()=>tryTake(key,model,purpose));
    }
    return Promise.resolve(tryTake(key,model,purpose));
  }

  // CHỜ tới khi slot còn chỗ rồi mới ghi lượt + trả token (dùng thay begin).
  // ctl (tuỳ chọn): {cancelled:bool} — dừng chờ nếu bị huỷ. Token trả về truyền cho callAPI qua opts.schedTok để không đếm đôi.
  async function acquire(key,model,purpose,ctl){
    if(!enforcing()||limitFor(model)==null)return begin(key,model,purpose);
    const t0=Date.now();let announced=false;
    try{
      while(true){
        if((ctl&&ctl.cancelled)||(hooks.shouldCancel&&hooks.shouldCancel(purpose))){
          const e=new Error('Đã dừng');e.name=(ctl&&ctl.cancelled)?'Error':'AbortError';
          if(ctl&&ctl.cancelled)e.message='TIMEOUT';
          throw e;
        }
        const r=await tryTakeLocked(key,model,purpose);
        if(r.tok!==undefined){
          const waited=Date.now()-t0;
          if(waited>50){const k=purpose||'khac',x=stats.waits[k]||(stats.waits[k]={n:0,ms:0,max:0});x.n++;x.ms+=waited;if(waited>x.max)x.max=waited;}
          return r.tok;
        }
        const w=r.wait;
        if(Date.now()-t0+w>CFG.MAX_WAIT_MS){
          throw new Error('429 (CHAN_SCHED): slot '+maskId(slotId(key,model))+' kín, cần chờ thêm '+Math.round(w/1000)+'s');
        }
        if(!announced){announced=true;try{hooks.onWait&&hooks.onWait({model,purpose,waitMs:w,cool:isCooling(key,model)});}catch(_){}}
        await new Promise(r2=>setTimeout(r2,Math.min(w,1000)));
      }
    }finally{
      if(announced){try{hooks.onWaitEnd&&hooks.onWaitEnd({model,purpose});}catch(_){}}
    }
  }

  // Google vừa trả 429 RPM dù bộ đếm báo còn chỗ → bộ đếm lệch: coi slot này ĐÃ ĐẦY (điền mốc "bây giờ" cho đủ giới hạn)
  // để mọi luồng/tab chờ thêm ~60s thay vì bắn tiếp. Chỉ tăng, không bớt mốc thật.
  // Đánh dấu slot đang "nghỉ" do Google vừa trả 429 (khác với việc app tự đếm đủ giới hạn) → thanh trạng thái nói đúng nguyên nhân.
  const COOL_LS='dich-sched-cool-v1';
  function markCool(key,model){try{const o=JSON.parse(localStorage.getItem(COOL_LS)||'{}');o[slotId(key,model)]=Date.now();localStorage.setItem(COOL_LS,JSON.stringify(o));}catch(_){}}
  function isCooling(key,model){try{const t=(JSON.parse(localStorage.getItem(COOL_LS)||'{}'))[slotId(key,model)];return !!t&&(Date.now()-t)<CFG.WINDOW_MS+CFG.SAFETY_MS;}catch(_){return false;}}
  function markFull(key,model){
    try{
      const lim=limitFor(model);if(lim==null)return;
      const now=Date.now(),id=slotId(key,model),o=prune(load(),now),a=o[id]||(o[id]=[]);
      while(a.length<lim)a.push(now);
      save(o);
      markCool(key,model);
    }catch(_){}
  }

  // Gọi khi request kết thúc (err = null nếu thành công).
  function end(tok,err){
    if(!tok)return;
    try{
      stats.inflight=Math.max(0,stats.inflight-1);
      if(!err||err.name==='AbortError')return;
      const m=String(err.message||'');
      if(/\b429\b/.test(m)){
        const kind=m.includes('QUOTA_PER_DAY')?'RPD':m.includes('QUOTA_PER_MINUTE')?'RPM':'khong-ro';
        stats.err429.push({t:Date.now(),slot:maskId(tok.id),purpose:tok.purpose,kind,nAtSend:tok.n,lim:tok.lim});cap(stats.err429);
        if(kind!=='RPD'&&CFG.MODE==='enforce'){
          try{const i=tok.id.lastIndexOf(':');markFull(tok.key,tok.model);}catch(_){}
        }
        if(kind!=='RPD'&&tok.n<=tok.lim){
          stats.lag429++;
          console.warn(`[RL-AUDIT] 429 (${kind}) dù bộ đếm báo còn chỗ (${tok.n}/${tok.lim}): ${maskId(tok.id)} · "${tok.purpose}" — bộ đếm cục bộ lệch Google, hoặc project dùng chung / chạm TPM`);
        }
      }else if(/\b5\d\d\b/.test(m)){stats.err5xx++;}
    }catch(_){}
  }

  function report(){
    const now=Date.now(),o=prune(load(),now);
    const rows=Object.keys(o).sort().map(id=>{
      const lim=limitFor(id.slice(0,id.lastIndexOf(':')));
      return {slot:maskId(id),'60s qua':o[id].length,'giới hạn':lim,'đỉnh (trang này)':stats.peak[id]||0,vuot:lim!=null&&o[id].length>lim?'VƯỢT':''};
    });
    console.log(`[Sched] Chế độ: ${enforcing()?'enforce (mọi luồng Gemini chờ chỗ trống)':'chỉ đếm'} · từ khi nạp trang ${Math.round((now-stats.since)/60000)} phút · đang bay: ${stats.inflight}`);
    if(rows.length)console.table(rows);else console.log('[Sched] Không có request nào trong 60s qua.');
    const pr=Object.keys(stats.byPurpose).sort().map(k=>({luong:k,'đã gửi':stats.byPurpose[k].sent,'gây vượt':stats.byPurpose[k].over}));
    if(pr.length)console.table(pr);
    const wr=Object.keys(stats.waits).sort().map(k=>({luong:k,'lần chờ':stats.waits[k].n,'TB chờ (s)':(stats.waits[k].ms/stats.waits[k].n/1000).toFixed(1),'chờ lâu nhất (s)':(stats.waits[k].max/1000).toFixed(1)}));
    if(wr.length)console.table(wr);
    const c={RPM:0,RPD:0,'khong-ro':0};stats.err429.forEach(e=>c[e.kind]++);
    console.log(`[Sched] Vi phạm giới hạn: ${stats.violations.length} · 429: RPM ${c.RPM}, RPD ${c.RPD}, không rõ ${c['khong-ro']} (trong đó ${stats.lag429} lần bộ đếm báo còn chỗ) · 5xx: ${stats.err5xx}`);
    return {rows,byPurpose:stats.byPurpose,waits:stats.waits,violations:stats.violations.slice(),err429:stats.err429.slice(),lag429:stats.lag429,err5xx:stats.err5xx};
  }
  function reset(){
    stats.since=Date.now();stats.peak={};stats.byPurpose={};stats.violations=[];stats.err429=[];stats.lag429=0;stats.err5xx=0;stats.waits={};
  }

  global.Sched={CFG,begin,acquire,waitMs,markFull,setHooks,enforcing,end,report,reset,limitFor,slotId,_stats:stats,_load:load};
})(typeof window!=='undefined'?window:globalThis);
