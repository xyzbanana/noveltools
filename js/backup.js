// ===================================================================
// backup.js — Sao lưu/khôi phục dữ liệu ra file .json trên thiết bị + đăng nhập Google Drive
// phục vụ ĐỒNG BỘ TỰ ĐỘNG (sao lưu/khôi phục thủ công KHÔNG còn dùng Drive)
// ===================================================================
// i18n: dịch chuỗi động (UI=vi trả nguyên chữ Việt, thay {x1}.. — kết quả giống hệt trước đây)
const _bt=(vi,p)=>(window.I18N&&window.I18N.t)?window.I18N.t(vi,p):String(vi).replace(/\{(\w+)\}/g,(m,k)=>p&&p[k]!=null?p[k]:m);

// ===== TOAST TIẾN ĐỘ KHÔI PHỤC (thay cho dòng trạng thái trên toolbar + log console) =====
// start → book(i) / shards(n) / tick() → bookDone(i,..) [revert(i,..) nếu ghi tủ lỗi] → finish() | error(msg). Mọi hàm no-op khi chưa start.
const RestoreToast=(function(){
  const CSS=`.rst-wrap{--rst-bg:var(--glass-bg,var(--bg2));--rst-line:var(--border);--rst-hover:var(--btn-hover);--rst-shadow:var(--shadow-md,0 10px 28px rgba(0,0,0,.3));--rst-ok:#16a34a;--rst-warn:#b7791f;--rst-err:#dc2626;}
[data-theme="dark"] .rst-wrap{--rst-ok:#4ade80;--rst-warn:#f5b454;--rst-err:#f87171;}
.rst button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0;margin:0}
.rst button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}
.rst,.rst *{box-sizing:border-box}
.rst{font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text)}
.rst-wrap{position:fixed;left:0;right:0;bottom:calc(18px + env(safe-area-inset-bottom,0));display:flex;justify-content:center;pointer-events:none;z-index:1400;padding:0 14px}
.rst{pointer-events:auto;width:min(380px,100%);background:var(--rst-bg);border:1px solid var(--rst-line);border-radius:18px;
box-shadow:var(--rst-shadow);-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);overflow:hidden;
transform:translateY(24px) scale(.97);opacity:0;visibility:hidden;transition:transform .32s cubic-bezier(.2,.9,.3,1),opacity .22s,visibility 0s .32s}
.rst.show{transform:none;opacity:1;visibility:visible;transition:transform .32s cubic-bezier(.2,.9,.3,1),opacity .22s}
.rst-head{display:flex;align-items:center;gap:12px;padding:13px 12px 13px 14px}
.rst-ring{position:relative;flex:none;width:38px;height:38px}
.rst-ring svg{display:block;width:38px;height:38px;transform:rotate(-90deg)}
.rst-ring .rst-trk{stroke:var(--rst-line);}
.rst-ring .rst-val{stroke:var(--accent);stroke-linecap:round;transition:stroke-dashoffset .45s ease,stroke .2s}
.rst-ring .rst-pct{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text)}
.rst-ring .rst-ico{position:absolute;inset:0;display:none;place-items:center}
.rst-ring .rst-ico svg{width:20px;height:20px;transform:none}
.rst[data-state="done"] .rst-ring .rst-val,.rst[data-state="warn"] .rst-ring .rst-val{stroke-dashoffset:0!important}
.rst[data-state="done"] .rst-ring .rst-val{stroke:var(--rst-ok)}
.rst[data-state="warn"] .rst-ring .rst-val{stroke:var(--rst-warn)}
.rst[data-state="done"] .rst-pct,.rst[data-state="warn"] .rst-pct{display:none}
.rst[data-state="done"] .rst-ico.rst-ok{display:grid;color:var(--rst-ok)}
.rst[data-state="warn"] .rst-ico.rst-wn{display:grid;color:var(--rst-warn)}
.rst-txt{flex:1;min-width:0}
.rst-ttl{font-weight:650;font-size:14.5px;line-height:1.3;letter-spacing:-.005em}
.rst-sub{font-size:12.5px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.rst-sub b{font-weight:600;color:var(--text)}
.rst-acts{display:flex;align-items:center;gap:2px;flex:none}
.rst-ib{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:var(--text2);transition:background .15s,color .15s}
.rst-ib:hover{background:var(--rst-hover);color:var(--text)}
.rst-ib svg{width:18px;height:18px;transition:transform .25s}
.rst.open .rst-chev svg{transform:rotate(180deg)}
.rst-bar{height:3px;background:var(--rst-line)}
.rst-bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .45s ease,background .2s}
.rst[data-state="done"] .rst-bar i{background:var(--rst-ok);width:100%!important}
.rst[data-state="warn"] .rst-bar i{background:var(--rst-warn);width:100%!important}
.rst-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}
.rst.open .rst-body{grid-template-rows:1fr}
.rst-body>div{overflow:hidden;min-height:0}
.rst-list{list-style:none;margin:8px 12px 6px;padding:8px 6px;border:1px solid var(--border);border-radius:12px;background:var(--bg3);max-height:236px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--border2) transparent}
.rst-list::-webkit-scrollbar{width:8px}
.rst-list::-webkit-scrollbar-track{background:transparent}
.rst-list::-webkit-scrollbar-thumb{background:var(--border2);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.rst-it{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:10px;font-size:13px}
.rst-it .rst-st{flex:none;width:18px;height:18px;display:grid;place-items:center;color:var(--text3)}
.rst-it .rst-st svg{width:16px;height:16px}
.rst-it .rst-nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rst-it .rst-mt{flex:none;font-size:12px;color:var(--text3);font-variant-numeric:tabular-nums}
.rst-it[data-s="wait"] .rst-nm{color:var(--text3)}
.rst-it[data-s="run"]{background:var(--rst-hover)}
.rst-it[data-s="run"] .rst-st{color:var(--accent)}
.rst-it[data-s="run"] .rst-mt{color:var(--accent)}
.rst-it[data-s="ok"] .rst-st{color:var(--rst-ok)}
.rst-it[data-s="ok"] .rst-mt{color:var(--text2)}
.rst-it[data-s="skip"] .rst-mt{color:var(--text3)}
.rst-it[data-s="err"] .rst-st{color:var(--rst-err)}
.rst-it[data-s="err"] .rst-mt{color:var(--rst-err)}
.rst-it .rst-why{display:none}
.rst-spin{animation:rstSpin .9s linear infinite}
@keyframes rstSpin{to{transform:rotate(360deg)}}
.rst-err{margin:2px 10px 8px;padding:9px 11px;border-radius:10px;background:color-mix(in srgb,var(--rst-err) 12%,transparent);font-size:12.5px;color:var(--text2);display:none}
.rst-err b{color:var(--rst-err);font-weight:600}
.rst.has-err .rst-err{display:block}
.rst-foot{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:0 10px 10px}
.rst-foot[hidden],.rst-sum{display:none}
.rst-foot .rst-sum{flex:1;font-size:12.5px;color:var(--text3);padding-left:6px}
.rst-fb{padding:7px 12px;border-radius:10px;font-size:13px;font-weight:600;color:var(--accent);transition:background .15s}
.rst-fb:hover{background:var(--rst-hover)}
.rst-fb[hidden]{display:none}
@media (prefers-reduced-motion:reduce){
.rst,.rst.show,.rst-ring .rst-val,.rst-bar i,.rst-body,.rst-ib svg{transition:none}
.rst-spin{animation:none}
}`;
  const C=2*Math.PI*16;
  const SVG={
    wait:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2.6"/></svg>',
    run:'<svg class="rst-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
    ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    skip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    err:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>'
  };
  let R=null,S=null,hideT=null,seenOpen=false;
  const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function build(){
    if(R)return R;
    const st=document.createElement('style');st.id='rstStyle';st.textContent=CSS;document.head.appendChild(st);
    const w=document.createElement('div');w.className='rst-wrap';
    w.innerHTML='<section class="rst" role="status" aria-live="polite" data-state="run">'
      +'<div class="rst-head"><div class="rst-ring">'
      +'<svg viewBox="0 0 38 38" fill="none" stroke-width="3.2"><circle class="rst-trk" cx="19" cy="19" r="16"/><circle class="rst-val" cx="19" cy="19" r="16" stroke-dasharray="100.53" stroke-dashoffset="100.53"/></svg>'
      +'<span class="rst-pct">0%</span>'
      +'<span class="rst-ico rst-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>'
      +'<span class="rst-ico rst-wn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6M12 17h.01"/></svg></span></div>'
      +'<div class="rst-txt"><div class="rst-ttl"></div><div class="rst-sub"></div></div>'
      +'<div class="rst-acts"><button type="button" class="rst-ib rst-chev" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg></button>'
      +'<button type="button" class="rst-ib rst-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>'
      +'<div class="rst-bar"><i></i></div>'
      +'<div class="rst-body"><div><ul class="rst-list"></ul><div class="rst-err"></div>'
      +'<div class="rst-foot"><span class="rst-sum"></span><button type="button" class="rst-fb" hidden></button></div></div></div></section>';
    document.body.appendChild(w);
    const q=s=>w.querySelector(s);
    R={rt:q('.rst'),ring:q('.rst-val'),pct:q('.rst-pct'),ttl:q('.rst-ttl'),sub:q('.rst-sub'),bar:q('.rst-bar i'),list:q('.rst-list'),sum:q('.rst-sum'),foot:q('.rst-foot'),
      chev:q('.rst-chev'),close:q('.rst-x'),errBox:q('.rst-err'),retry:q('.rst-fb')};
    R.close.setAttribute('aria-label',_bt('Ẩn thông báo'));
    R.retry.textContent=_bt('Thử lại truyện lỗi');
    R.chev.setAttribute('aria-label',_bt('Xem chi tiết'));
    R.chev.onclick=()=>{seenOpen=true;open(!R.rt.classList.contains('open'));};
    R.close.onclick=hide;
    return R;
  }
  function open(on){R.rt.classList.toggle('open',on);R.chev.setAttribute('aria-expanded',on);R.chev.setAttribute('aria-label',_bt(on?'Thu gọn':'Xem chi tiết'));}
  function show(){clearTimeout(hideT);R.rt.classList.add('show');}
  function hide(){if(R)R.rt.classList.remove('show');}
  function set(i,s,meta){
    const li=R.list.children[i];if(!li)return;
    li.dataset.s=s;li.querySelector('.rst-st').innerHTML=SVG[s];li.querySelector('.rst-mt').textContent=meta||'';
  }
  function progress(frac){
    const f=Math.max(0,Math.min(1,frac));
    R.ring.style.strokeDashoffset=C*(1-f);R.pct.textContent=Math.round(f*100)+'%';R.bar.style.width=(f*100)+'%';
  }
  function summary(){
    const p=[];
    if(S.added)p.push(_bt('thêm {x1} truyện',{x1:S.added}));
    if(S.merged)p.push(_bt('gộp {x1} truyện',{x1:S.merged})+(S.chapters?' '+_bt('(+{x1} chương)',{x1:S.chapters}):''));
    if(S.skipped)p.push(_bt('{x1} truyện đã đủ',{x1:S.skipped}));
    if(S.over)p.push(_bt('ghi đè {x1} truyện',{x1:S.over}));
    S.extra.forEach(x=>p.push(x));
    if(S.failed)p.push(_bt('{x1} truyện lỗi',{x1:S.failed}));
    return p.length>1?p.slice(0,-1).join(', ')+' '+_bt('và')+' '+p[p.length-1]:p.join(', ');
  }
  function bookName(i){const li=R.list.children[i];return li?li.querySelector('.rst-nm').textContent:'';}
  function live(){
    if(!S||!S.active||S.cur<0)return;
    set(S.cur,'run',S.pd?S.pn+'/'+S.pd:'');
    R.sub.innerHTML='<b>'+esc(bookName(S.cur))+'</b> '+esc(S.phase||'')+(S.pd?' ('+S.pn+'/'+S.pd+')':'');
    progress((S.done+(S.pd?S.pn/S.pd*.9:.05))/Math.max(1,S.total));
  }
  return{
    start({device,total,names,title,sub}){
      build();
      S={total,done:0,added:0,merged:0,over:0,chapters:0,skipped:0,failed:0,errs:[],res:[],extra:[],cur:-1,pn:0,pd:0,phase:'',active:true};
      R.rt.dataset.state='run';R.rt.classList.remove('has-err');R.retry.hidden=true;
      R.ttl.textContent=title||_bt('Đang khôi phục từ {x1}',{x1:device});R.sub.textContent=sub||_bt('Đang đọc bản sao lưu...');R.retry.onclick=null;R.foot.hidden=true;
      R.list.innerHTML=names.map(n=>'<li class="rst-it" data-s="wait"><span class="rst-st">'+SVG.wait+'</span><span class="rst-nm">'+esc(n)+'</span><span class="rst-mt"></span></li>').join('');
      R.sum.textContent='';R.errBox.innerHTML='';
      progress(0);open(false);seenOpen=false;show();
    },
    book(i,phase){
      if(!S||!S.active)return;
      S.cur=i;S.pn=0;S.pd=0;S.phase=phase||'';live();
      const li=R.list.children[i];if(li&&!seenOpen)li.scrollIntoView({block:'nearest'});
    },
    shards(n){if(!S||!S.active)return;S.pd+=n;live();},
    tick(){if(!S||!S.active)return;S.pn++;live();},
    writing(){if(!S||!S.active)return;R.sub.textContent=_bt('Đang ghi vào tủ truyện...');},
    bookDone(i,{state,gain,isNew,why,kind}){
      if(!S||!S.active)return;
      S.done++;S.res[i]={state,gain:gain||0,isNew:!!isNew,kind};
      if(state==='ok'){if(isNew)S.added++;else if(kind==='over')S.over++;else{S.merged++;S.chapters+=gain||0;}
        set(i,'ok',isNew?_bt('truyện mới'):(kind==='over'?_bt('đã ghi đè'):(gain?_bt('+{x1} chương',{x1:gain}):_bt('đã gộp'))));}
      else if(state==='skip'){S.skipped++;set(i,'skip',_bt('đã đủ'));}
      else{S.failed++;S.errs.push({name:bookName(i),why});set(i,'err',_bt('lỗi'));}
      progress(S.done/Math.max(1,S.total));
    },
    revert(i,why){ // truyện đã tải xong nhưng ghi vào tủ lỗi → chuyển từ "ok" sang "lỗi"
      if(!S||!S.active)return;const r=S.res[i];if(!r||r.state!=='ok')return;
      if(r.isNew)S.added--;else if(r.kind==='over')S.over--;else{S.merged--;S.chapters-=r.gain;}
      r.state='err';S.failed++;S.errs.push({name:bookName(i),why});set(i,'err',_bt('lỗi'));
    },
    extra(txt){if(S&&S.active)S.extra.push(txt);},
    finish(){
      if(!S||!S.active)return;S.active=false;
      const bad=S.failed>0;
      R.rt.dataset.state=bad?'warn':'done';
      R.ttl.textContent=bad?_bt('Khôi phục xong, {x1} truyện lỗi',{x1:S.failed}):((S.added||S.merged||S.over||S.extra.length)?_bt('Đã khôi phục'):_bt('Máy này đã đủ'));
      R.sub.textContent=summary()||_bt('Không có truyện nào cần thêm');
      if(bad){
        R.errBox.innerHTML=S.errs.slice(0,4).map(e=>'<div><b>'+esc(e.name)+'</b>: '+esc(e.why||'')+'</div>').join('');
        R.rt.classList.add('has-err');R.retry.hidden=true;open(true);seenOpen=true;
      }else{clearTimeout(hideT);hideT=setTimeout(hide,6000);}
      show();
    },
    error(msg){ // lỗi chặn hẳn (chưa/không chạy được)
      build();if(S)S.active=false;
      clearTimeout(hideT);
      R.rt.dataset.state='warn';R.rt.classList.remove('has-err');R.retry.hidden=true;R.foot.hidden=true;
      R.ttl.textContent=_bt('Khôi phục thất bại');R.sub.textContent=String(msg==null?'':_bt(String(msg)));
      progress(1);show();
    },
    reading(){ // đang đọc bản sao lưu (trước khi hiện hộp xác nhận)
      build();S=null;clearTimeout(hideT);
      R.rt.dataset.state='run';R.rt.classList.remove('has-err','open');R.retry.hidden=true;R.foot.hidden=true;
      R.ttl.textContent=_bt('Đang đọc bản sao lưu...');R.sub.textContent='';R.list.innerHTML='';R.sum.textContent='';R.errBox.innerHTML='';
      progress(0);show();
    },
    dismiss(){if(!S||!S.active)hide();},
    onRetry(fn){build();R.retry.onclick=fn;R.retry.hidden=!(fn&&R.rt.classList.contains('has-err'));R.foot.hidden=R.retry.hidden;}
  };
})();
const DRIVE_CLIENT_ID='937124838897-5r7k23h9sfriip4d5mdb2lsd51qv5r36.apps.googleusercontent.com';
// Thêm scope userinfo.email (ngoài drive.appdata) để lấy được email hiển thị trong menu avatar
// (#syncAccountEmail) — xem fetchAndStoreDriveEmail() bên dưới. Người dùng ĐÃ đăng nhập từ trước
// khi chưa có scope này sẽ chưa có email cho tới lần cấp quyền lại tiếp theo (refresh_token cũ hết
// hạn, hoặc bấm Đăng xuất rồi Đăng nhập lại) — không sao, chỉ ảnh hưởng phần hiển thị.
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
// URL của Cloudflare Worker (xem worker.js + wrangler.toml đính kèm) — THAY bằng URL Worker thật
// của bạn sau khi deploy xong (dạng https://<ten-worker>.<subdomain>.workers.dev).
const AUTH_WORKER_URL='https://noveltools-drive-auth.thienco-tcc.workers.dev';

const LS_DRIVE_REFRESH_TOKEN='dich-drive-refresh-token';
const LS_DRIVE_EMAIL='dich-drive-email';
let _driveAccessToken=null;
let _driveTokenExpiry=0;
let _driveAuthPending=null; // {resolve,reject,state} — request đăng nhập Google đang chờ popup trả kết quả

function getStoredRefreshToken(){try{return localStorage.getItem(LS_DRIVE_REFRESH_TOKEN)||'';}catch(e){return '';}}
function setStoredRefreshToken(t){try{if(t)localStorage.setItem(LS_DRIVE_REFRESH_TOKEN,t);else localStorage.removeItem(LS_DRIVE_REFRESH_TOKEN);}catch(e){}}
function getStoredDriveEmail(){try{return localStorage.getItem(LS_DRIVE_EMAIL)||'';}catch(e){return '';}}
const LS_DRIVE_PIC='dich-drive-pic';
function getStoredDrivePic(){try{return localStorage.getItem(LS_DRIVE_PIC)||'';}catch(e){return '';}}
function setStoredDrivePic(v){try{if(v)localStorage.setItem(LS_DRIVE_PIC,v);else localStorage.removeItem(LS_DRIVE_PIC);localStorage.setItem('dich-drive-pic-tried',v?'1':'');}catch(e){}}
function setStoredDriveEmail(v){try{if(v)localStorage.setItem(LS_DRIVE_EMAIL,v);else localStorage.removeItem(LS_DRIVE_EMAIL);}catch(e){}}
// "Đã đăng nhập" = còn refresh_token đã lưu — dùng để quyết định hiện "Đăng nhập" hay email trong
// menu avatar (renderSyncAccountUI()), KHÔNG cần access token còn hạn hay không (access token hết
// hạn thì ensureDriveToken() tự làm mới bằng refresh_token khi cần dùng thật).
function isDriveLoggedIn(){return !!getStoredRefreshToken();}

// Gọi userinfo endpoint lấy email hiển thị — chỉ gọi khi CHƯA có email lưu sẵn (không cần gọi lại
// mỗi lần lấy token, email 1 tài khoản không đổi). Lỗi thì bỏ qua lặng lẽ — thiếu email chỉ ảnh
// hưởng hiển thị, không ảnh hưởng chức năng đồng bộ/sao lưu chính.
async function fetchAndStoreDriveEmail(token){
  if(!token||(getStoredDriveEmail()&&(getStoredDrivePic()||localStorage.getItem('dich-drive-pic-tried'))))return;
  try{
    const res=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{'Authorization':'Bearer '+token}});
    if(!res.ok)return;
    const info=await res.json();
    if(info&&info.email){
      setStoredDriveEmail(info.email);
      const pu=info.picture&&/^https:\/\//.test(info.picture)?info.picture:'';
      setStoredDrivePic(pu);try{localStorage.setItem('dich-drive-pic-tried','1');}catch(e){}
      renderSyncAccountUI();
    }
  }catch(e){/* bỏ qua — không có email cũng không sao */}
}

function ensureDriveToken(){
  return new Promise((resolve,reject)=>{
    if(_driveAccessToken&&Date.now()<_driveTokenExpiry-60000){resolve(_driveAccessToken);return;}
    const refreshToken=getStoredRefreshToken();
    if(refreshToken){
      refreshDriveAccessToken(refreshToken).then(resolve).catch(()=>{
        // refresh_token hết hạn (quá 7 ngày ở trạng thái Testing, hoặc bị thu hồi thủ công trong
        // tài khoản Google, hoặc >6 tháng không dùng) — xoá token cũ, xin cấp quyền lại từ đầu.
        setStoredRefreshToken('');
        beginGoogleAuth().then(resolve).catch(reject);
      });
      return;
    }
    beginGoogleAuth().then(resolve).catch(reject);
  });
}

function refreshDriveAccessToken(refreshToken){
  if(!AUTH_WORKER_URL||AUTH_WORKER_URL.indexOf('REPLACE-WITH')>=0){
    return Promise.reject(new Error('Chưa cấu hình AUTH_WORKER_URL trong backup.js.'));
  }
  return fetch(AUTH_WORKER_URL+'/oauth/refresh',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:refreshToken})
  }).then(res=>res.json().then(tok=>{
    if(!res.ok||!tok.access_token)throw new Error(tok.error||'Làm mới access token thất bại');
    _driveAccessToken=tok.access_token;
    _driveTokenExpiry=Date.now()+((tok.expires_in||3600)*1000);
    fetchAndStoreDriveEmail(_driveAccessToken);
    return _driveAccessToken;
  }));
}

// Mở popup đưa người dùng sang màn hình đồng ý của Google. access_type=offline + prompt=consent
// ĐẢM BẢO Google trả về refresh_token (prompt=consent bắt hiện lại màn hình đồng ý mỗi lần, kể cả
// đã cấp quyền trước đó, để chắc chắn có refresh_token — không dùng chỉ vì "lần đầu" mà bỏ qua).
function beginGoogleAuth(){
  // Chạy trong APK (WebToApp/WebView): popup + postMessage không dùng được -> luồng trình duyệt hệ thống bên dưới.
  if(isEmbeddedAppShell())return beginGoogleAuthExternal();
  return new Promise((resolve,reject)=>{
    if(!AUTH_WORKER_URL||AUTH_WORKER_URL.indexOf('REPLACE-WITH')>=0){
      reject(new Error('Chưa cấu hình AUTH_WORKER_URL trong backup.js (xem hướng dẫn deploy Worker).'));
      return;
    }
    const state=Math.random().toString(36).slice(2)+Date.now().toString(36);
    const redirectUri=AUTH_WORKER_URL+'/oauth/callback';
    const params=new URLSearchParams({
      client_id:DRIVE_CLIENT_ID,
      redirect_uri:redirectUri,
      response_type:'code',
      scope:DRIVE_SCOPE,
      access_type:'offline',
      prompt:'consent',
      include_granted_scopes:'true',
      state
    });
    const authUrl='https://accounts.google.com/o/oauth2/v2/auth?'+params.toString();
    const w=480,h=640;
    const left=(window.screenX||0)+((window.outerWidth||w)-w)/2;
    const top=(window.screenY||0)+((window.outerHeight||h)-h)/2;
    const popup=window.open(authUrl,'drive-auth','width='+w+',height='+h+',left='+left+',top='+top);
    if(!popup){reject(new Error('Trình duyệt chặn popup — hãy cho phép popup cho trang này rồi thử lại.'));return;}
    if(_driveAuthPending)_driveAuthPending.reject(new Error('Đã mở yêu cầu đăng nhập Google mới.'));
    _driveAuthPending={resolve,reject,state};
    const timer=setInterval(()=>{
      if(popup.closed){
        clearInterval(timer);
        if(_driveAuthPending&&_driveAuthPending.state===state){
          _driveAuthPending=null;
          reject(new Error('Cửa sổ đăng nhập Google đã bị đóng.'));
        }
      }
    },500);
  });
}

// Nhận kết quả đăng nhập từ trang callback do Worker render (xem worker.js: renderPopupResult()) —
// trang đó postMessage lại cho window chính (opener) rồi tự đóng.
window.addEventListener('message',function(e){
  let authOrigin=null;
  try{authOrigin=new URL(AUTH_WORKER_URL).origin;}catch(err){}
  if(!authOrigin||e.origin!==authOrigin)return; // CHỈ nhận message từ đúng Worker, không nhận từ nơi khác
  const data=e.data;
  if(!data||(data.type!=='drive_auth_success'&&data.type!=='drive_auth_error'))return;
  const pending=_driveAuthPending;
  if(!pending||data.state!==pending.state)return; // chống CSRF: state phải khớp đúng lần mở popup gần nhất
  _driveAuthPending=null;
  if(data.type==='drive_auth_error'){pending.reject(new Error(data.error||'Đăng nhập Google thất bại'));return;}
  _driveAccessToken=data.access_token;
  _driveTokenExpiry=Date.now()+((data.expires_in||3600)*1000);
  if(data.refresh_token)setStoredRefreshToken(data.refresh_token);
  fetchAndStoreDriveEmail(_driveAccessToken);
  renderSyncAccountUI();
  pending.resolve(_driveAccessToken);
});

// ===================================================================
// ĐĂNG NHẬP GOOGLE KHI CHẠY TRONG APK (WebToApp / WebView)
// -------------------------------------------------------------------
// Vì sao luồng popup ở trên hỏng trong APK:
//  1) Shell WebToApp không bật nhiều cửa sổ -> window.open() nạp luôn trang Google vào CHÍNH WebView
//     (trang app bị thay mất), và trang callback không có window.opener để postMessage về.
//  2) Google chỉ ổn định khi đăng nhập OAuth ở trình duyệt thật (Chrome/Custom Tabs), không phải WebView.
// Cách làm ở đây (không cần sửa shell APK, không cần deep link):
//  - Mở URL đăng nhập bằng TRÌNH DUYỆT HỆ THỐNG qua 'intent://' (shell WebToApp có sẵn handleNavigation()
//    -> openIntentUri() xử lý scheme này).
//  - Google chuyển về Worker /app/callback -> Worker đổi code lấy token và lưu tạm (KV, 5 phút) theo `state`.
//  - App tự hỏi Worker /app/poll?state=... mỗi 2 giây tới khi có kết quả (xem worker-app-login.js).
// ===================================================================
const EXT_AUTH_POLL_MS=2000;
const EXT_AUTH_TTL_MS=5*60*1000;
const LS_DRIVE_EXT_STATE='dich-drive-ext-state';
let _extAuth=null;          // lượt đăng nhập ngoài đang chờ: {state,authUrl,started,timer,busy,promise,resolve,reject,overlay}
let _extCooldownUntil=0;    // sau khi hủy/lỗi: tạm không tự mở trình duyệt lại nếu không có thao tác bấm

// Nhận diện shell WebToApp qua JS bridge window.WebToApp (shell gắn addJavascriptInterface "WebToApp").
// Đóng gói bằng công cụ khác mà vẫn muốn dùng luồng này: đặt window.DRIVE_AUTH_EXTERNAL=true trước khi nạp backup.js.
function isEmbeddedAppShell(){
  try{return !!window.WebToApp||window.DRIVE_AUTH_EXTERNAL===true;}catch(e){return false;}
}
function openInSystemBrowser(url){
  if(window.WebToApp){
    // 'intent://host/path?query#Intent;scheme=https;...;end' = https://host/path?query ; shell chuyển thành ACTION_VIEW.
    location.href='intent://'+url.replace(/^https?:\/\//,'')+'#Intent;scheme=https;action=android.intent.action.VIEW;end';
    return true;
  }
  return !!window.open(url,'_blank');
}
// Chỉ tự mở trình duyệt khi người dùng vừa bấm (tránh vòng đồng bộ nền bật trình duyệt liên tục khi token hỏng).
function _extGestureOk(){
  try{if(navigator.userActivation)return !!navigator.userActivation.isActive;}catch(e){}
  return Date.now()>=_extCooldownUntil;
}
function _extNewJob(state,authUrl,started){
  const job={state,authUrl,started,timer:null,busy:false,overlay:null};
  job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
  return job;
}
function beginGoogleAuthExternal(){
  if(_extAuth)return _extAuth.promise; // đang chờ sẵn 1 lượt -> dùng chung, KHÔNG mở thêm trình duyệt
  if(!AUTH_WORKER_URL||AUTH_WORKER_URL.indexOf('REPLACE-WITH')>=0){
    return Promise.reject(new Error('Chưa cấu hình AUTH_WORKER_URL trong backup.js.'));
  }
  if(!_extGestureOk())return Promise.reject(new Error('Hãy bấm "Đăng nhập" để mở trình duyệt xác thực Google.'));
  const rnd=new Uint8Array(16);crypto.getRandomValues(rnd);
  const state=Array.from(rnd,b=>('0'+b.toString(16)).slice(-2)).join(''); // 32 ký tự hex, vừa là CSRF state vừa là khoá lấy kết quả
  const params=new URLSearchParams({
    client_id:DRIVE_CLIENT_ID,
    redirect_uri:AUTH_WORKER_URL+'/app/callback', // PHẢI thêm URI này vào "Authorized redirect URIs" của OAuth client
    response_type:'code',
    scope:DRIVE_SCOPE,
    access_type:'offline',
    prompt:'consent',
    include_granted_scopes:'true',
    state
  });
  const job=_extNewJob(state,'https://accounts.google.com/o/oauth2/v2/auth?'+params.toString(),Date.now());
  _extAuth=job;
  try{localStorage.setItem(LS_DRIVE_EXT_STATE,JSON.stringify({s:state,t:job.started}));}catch(e){}
  _extShowOverlay(job);
  job.timer=setInterval(()=>_extPollOnce(job),EXT_AUTH_POLL_MS);
  openInSystemBrowser(job.authUrl);
  return job.promise;
}
async function _extPollOnce(job){
  if(_extAuth!==job||job.busy)return;
  if(Date.now()-job.started>EXT_AUTH_TTL_MS){_extFinish(job,new Error('Hết thời gian chờ đăng nhập Google — hãy thử lại.'));return;}
  job.busy=true;
  try{
    const res=await fetch(AUTH_WORKER_URL+'/app/poll?state='+encodeURIComponent(job.state),{cache:'no-store'});
    const d=await res.json();
    if(_extAuth!==job)return;
    if(d&&d.status==='ok'&&d.access_token)_extFinish(job,null,d);
    else if(d&&d.status==='error')_extFinish(job,new Error(d.error||'Đăng nhập Google thất bại'));
  }catch(e){/* mất mạng thoáng qua — thử lại ở lượt sau */}
  finally{job.busy=false;}
}
function _extFinish(job,err,data){
  if(_extAuth===job)_extAuth=null;
  clearInterval(job.timer);
  try{localStorage.removeItem(LS_DRIVE_EXT_STATE);}catch(e){}
  _extHideOverlay(job);
  if(err){_extCooldownUntil=Date.now()+120000;job.reject(err);return;}
  _driveAccessToken=data.access_token;
  _driveTokenExpiry=Date.now()+((data.expires_in||3600)*1000);
  if(data.refresh_token)setStoredRefreshToken(data.refresh_token);
  fetchAndStoreDriveEmail(_driveAccessToken);
  renderSyncAccountUI();
  job.resolve(_driveAccessToken);
}
function _extShowOverlay(job){
  try{
    const o=document.createElement('div');
    o.style.cssText='position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    const btn='border:0;border-radius:8px;padding:8px 14px;font-size:14px;cursor:pointer;';
    o.innerHTML='<div style="max-width:340px;width:100%;background:#1f2430;color:#fff;border-radius:14px;padding:18px;font:14px/1.55 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);">'
      +'<div style="font-weight:600;font-size:16px;margin-bottom:8px;">Đăng nhập Google Drive</div>'
      +'<div>Đã mở trình duyệt để đăng nhập. Sau khi bấm <b>Cho phép</b>, hãy <b>quay lại ứng dụng này</b> — app sẽ tự nhận kết quả.</div>'
      +'<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">'
      +'<button data-a="again" style="'+btn+'background:#3a4156;color:#fff;">Mở lại</button>'
      +'<button data-a="cancel" style="'+btn+'background:#5a2f35;color:#fff;">Hủy</button></div></div>';
    o.addEventListener('click',function(e){
      const a=e.target&&e.target.getAttribute?e.target.getAttribute('data-a'):null;
      if(a==='again')openInSystemBrowser(job.authUrl);
      else if(a==='cancel')_extFinish(job,new Error('Đã hủy đăng nhập Google.'));
    });
    document.body.appendChild(o);
    job.overlay=o;
  }catch(e){}
}
function _extHideOverlay(job){try{if(job.overlay&&job.overlay.parentNode)job.overlay.parentNode.removeChild(job.overlay);}catch(e){}job.overlay=null;}
// Android có thể đóng trang nền khi người dùng đang ở trình duyệt -> mở lại app thì nối tiếp lượt chờ còn hạn.
function resumeExternalDriveAuth(){
  if(_extAuth)return;
  let st=null;try{st=JSON.parse(localStorage.getItem(LS_DRIVE_EXT_STATE)||'null');}catch(e){}
  if(!st||!st.s||Date.now()-st.t>EXT_AUTH_TTL_MS){try{localStorage.removeItem(LS_DRIVE_EXT_STATE);}catch(e){}return;}
  const job=_extNewJob(st.s,'',st.t);
  job.promise.catch(()=>{});
  _extAuth=job;
  job.timer=setInterval(()=>_extPollOnce(job),EXT_AUTH_POLL_MS);
  _extPollOnce(job);
}
// Quay lại app từ trình duyệt -> hỏi kết quả ngay, không đợi nhịp 2 giây kế tiếp.
document.addEventListener('visibilitychange',function(){if(!document.hidden&&_extAuth)_extPollOnce(_extAuth);});
window.addEventListener('focus',function(){if(_extAuth)_extPollOnce(_extAuth);});

// ===== Nén gzip + đọc tự nhận biết định dạng =====
// DRIVE_CLEAN_LEGACY: true = sau khi đã có bản .json.gz thì tự xoá file cũ (.json chưa nén) cùng tên
// trên Drive. CHỈ bật khi MỌI thiết bị đã cập nhật bản mới (thiết bị chạy bản cũ không đọc được .gz).
const DRIVE_CLEAN_LEGACY=false;
// Nén object -> Blob gzip (CompressionStream có sẵn trong trình duyệt hiện đại). Trình duyệt quá cũ
// không có CompressionStream thì trả JSON thô — readJSONAuto() bên dưới vẫn đọc được cả 2 dạng.
async function toGzipBlob(obj){
  const s=JSON.stringify(obj);
  if(typeof CompressionStream==='undefined'||typeof Blob.prototype.stream!=='function'){const raw=new Blob([s],{type:'application/json'});raw.rawSize=s.length;return raw;}
  try{
    const out=await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    const gz=new Blob([out],{type:'application/gzip'});
    gz.rawSize=s.length; // chỉ để log so sánh dung lượng trước/sau khi nén
    return gz;
  }catch(e){const raw=new Blob([s],{type:'application/json'});raw.rawSize=s.length;return raw;}
}
// ===== Giải nén gzip bằng JS thuần (dự phòng cho trình duyệt cũ không có DecompressionStream, vd iOS/iPadOS < 16.4) =====
// Cài đặt kiểu "tiny-inflate" (DEFLATE, RFC 1951) + bóc header/footer gzip (RFC 1952). Chỉ dùng khi không có DecompressionStream.
const _GZ={lb:new Uint8Array(30),lbase:new Uint16Array(30),db:new Uint8Array(30),dbase:new Uint16Array(30),
  clc:new Uint8Array([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),lens:new Uint8Array(320),offs:new Uint16Array(16),
  mk(){return {t:new Uint16Array(16),x:new Uint16Array(288)};}};
(function(){
  function bb(bits,base,delta,first){let i,s;for(i=0;i<delta;++i)bits[i]=0;for(i=0;i<30-delta;++i)bits[i+delta]=i/delta|0;for(s=first,i=0;i<30;++i){base[i]=s;s+=1<<bits[i];}}
  bb(_GZ.lb,_GZ.lbase,4,3);bb(_GZ.db,_GZ.dbase,2,1);
  _GZ.lb[28]=0;_GZ.lbase[28]=258;
  _GZ.sl=_GZ.mk();_GZ.sd=_GZ.mk();_GZ.ct=_GZ.mk();
  const lt=_GZ.sl,dt=_GZ.sd;let i;
  for(i=0;i<7;++i)lt.t[i]=0;lt.t[7]=24;lt.t[8]=152;lt.t[9]=112;
  for(i=0;i<24;++i)lt.x[i]=256+i;for(i=0;i<144;++i)lt.x[24+i]=i;for(i=0;i<8;++i)lt.x[168+i]=280+i;for(i=0;i<112;++i)lt.x[176+i]=144+i;
  for(i=0;i<5;++i)dt.t[i]=0;dt.t[5]=32;for(i=0;i<32;++i)dt.x[i]=i;
})();
function _gzTree(t,lens,off,num){
  let i,s;const o=_GZ.offs;
  for(i=0;i<16;++i)t.t[i]=0;
  for(i=0;i<num;++i)t.t[lens[off+i]]++;
  t.t[0]=0;
  for(s=0,i=0;i<16;++i){o[i]=s;s+=t.t[i];}
  for(i=0;i<num;++i)if(lens[off+i])t.x[o[lens[off+i]]++]=i;
}
function _gzRead(d,n,base){
  if(!n)return base;
  while(d.bc<24){d.tag|=d.src[d.si++]<<d.bc;d.bc+=8;}
  const v=d.tag&(0xffff>>>(16-n));d.tag>>>=n;d.bc-=n;return v+base;
}
function _gzSym(d,t){
  while(d.bc<24){d.tag|=d.src[d.si++]<<d.bc;d.bc+=8;}
  let sum=0,cur=0,len=0,tag=d.tag;
  do{cur=2*cur+(tag&1);tag>>>=1;++len;sum+=t.t[len];cur-=t.t[len];}while(cur>=0&&len<16);
  if(cur>=0)throw new Error('Dữ liệu gzip hỏng');
  d.tag=tag;d.bc-=len;return t.x[sum+cur];
}
function _gzBlock(d,lt,dt){
  const dest=d.dst;
  for(;;){
    let sym=_gzSym(d,lt);
    if(sym===256)return;
    if(sym<256){if(d.dl>=dest.length)throw new Error('Dữ liệu gzip hỏng');dest[d.dl++]=sym;}
    else{
      sym-=257;if(sym>=29)throw new Error('Dữ liệu gzip hỏng');
      const length=_gzRead(d,_GZ.lb[sym],_GZ.lbase[sym]);
      const ds=_gzSym(d,dt);if(ds>=30)throw new Error('Dữ liệu gzip hỏng');
      const from=d.dl-_gzRead(d,_GZ.db[ds],_GZ.dbase[ds]);
      if(from<0||d.dl+length>dest.length)throw new Error('Dữ liệu gzip hỏng');
      for(let i=0;i<length;++i)dest[d.dl++]=dest[from+i];
    }
  }
}
// u: Uint8Array gzip -> Uint8Array dữ liệu gốc. Kích thước đầu ra lấy từ ISIZE (4 byte cuối).
function gunzipJS(u){
  if(u.length<18||u[0]!==0x1f||u[1]!==0x8b||u[2]!==8)throw new Error('Không phải gzip hợp lệ');
  const flg=u[3];let p=10;
  if(flg&4){p+=2+(u[p]|(u[p+1]<<8));}
  if(flg&8){while(u[p++]!==0&&p<u.length);}
  if(flg&16){while(u[p++]!==0&&p<u.length);}
  if(flg&2)p+=2;
  const n=u.length;
  const isize=(u[n-4]|(u[n-3]<<8)|(u[n-2]<<16)|(u[n-1]<<24))>>>0;
  const d={src:u,si:p,tag:0,bc:0,dst:new Uint8Array(isize),dl:0,lt:_GZ.mk(),dt:_GZ.mk()};
  let fin;
  do{
    if(!d.bc--){d.tag=d.src[d.si++];d.bc=7;}
    fin=d.tag&1;d.tag>>>=1;
    const type=_gzRead(d,2,0);
    if(type===0){
      while(d.bc>8){d.si--;d.bc-=8;}
      const len=d.src[d.si]|(d.src[d.si+1]<<8),inv=d.src[d.si+2]|(d.src[d.si+3]<<8);
      if(len!==(~inv&0xffff))throw new Error('Dữ liệu gzip hỏng');
      d.si+=4;
      if(d.dl+len>d.dst.length)throw new Error('Dữ liệu gzip hỏng');
      for(let i=0;i<len;++i)d.dst[d.dl++]=d.src[d.si++];
      d.bc=0;d.tag=0;
    }else if(type===1){_gzBlock(d,_GZ.sl,_GZ.sd);}
    else if(type===2){
      const hlit=_gzRead(d,5,257),hdist=_gzRead(d,5,1),hclen=_gzRead(d,4,4),L=_GZ.lens;
      let i,num;
      for(i=0;i<19;++i)L[i]=0;
      for(i=0;i<hclen;++i)L[_GZ.clc[i]]=_gzRead(d,3,0);
      _gzTree(_GZ.ct,L,0,19);
      for(num=0;num<hlit+hdist;){
        const sym=_gzSym(d,_GZ.ct);let k;
        if(sym===16){const prev=L[num-1];for(k=_gzRead(d,2,3);k;--k)L[num++]=prev;}
        else if(sym===17){for(k=_gzRead(d,3,3);k;--k)L[num++]=0;}
        else if(sym===18){for(k=_gzRead(d,7,11);k;--k)L[num++]=0;}
        else L[num++]=sym;
        if(num>hlit+hdist+138)throw new Error('Dữ liệu gzip hỏng');
      }
      _gzTree(d.lt,L,0,hlit);_gzTree(d.dt,L,hlit,hdist);
      _gzBlock(d,d.lt,d.dt);
    }else throw new Error('Dữ liệu gzip hỏng');
  }while(!fin);
  return d.dl===d.dst.length?d.dst:d.dst.subarray(0,d.dl);
}

// Đọc JSON từ Response: nhận ra gzip qua 2 byte đầu (1f 8b), không phải gzip thì parse thẳng — nên file
// cũ chưa nén (trên Drive hoặc backup .json cũ trong máy) vẫn mở được bình thường.
async function readJSONAuto(res){
  const buf=await res.arrayBuffer();
  const u=new Uint8Array(buf);
  if(u.length>2&&u[0]===0x1f&&u[1]===0x8b){
    let text=null;
    if(typeof DecompressionStream!=='undefined'&&typeof Blob!=='undefined'&&typeof Blob.prototype.stream==='function'){
      try{text=await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}catch(e){text=null;}
    }
    // Trình duyệt cũ (vd iOS/iPadOS < 16.4) không có DecompressionStream → giải nén bằng JS thuần (gunzipJS).
    if(text===null){
      try{text=new TextDecoder().decode(gunzipJS(u));}
      catch(e){throw new Error(_bt('Không giải nén được gzip: {x1}',{x1:((e&&e.message)||e)}));}
    }
    return JSON.parse(text);
  }
  try{return JSON.parse(new TextDecoder().decode(u));}
  catch(e){throw new Error(_bt('Dữ liệu tải về không phải JSON hợp lệ ({x1} byte)',{x1:u.length}));}
}

// ===== Danh sách file trên Drive: LIỆT KÊ 1 LẦN, cache thành Map tên -> {id,md5Checksum} =====
// Trước đây mỗi lần upload/tải/xoá 1 sách đều tốn thêm 1 request files.list để tìm id theo tên.
// Giờ autoSyncNow() gọi driveRefreshFileMap() 1 lần ở đầu lượt, các hàm tìm file bên dưới tra Map
// (upload/xoá tự cập nhật Map), và Map bị bỏ (null) khi hết lượt để lượt sau lấy danh sách mới —
// không giữ id cũ qua các lượt phòng khi file bị xoá/đổi từ thiết bị khác.
let _driveFileMap=null;
async function driveRefreshFileMap(){
  const token=await ensureDriveToken();
  const map=new Map();
  let pageToken='';
  do{
    const url='https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q='+encodeURIComponent('trashed=false')+
      '&orderBy='+encodeURIComponent('modifiedTime desc')+'&pageSize=1000'+
      '&fields='+encodeURIComponent('nextPageToken,files(id,name,md5Checksum,modifiedTime,appProperties)')+
      (pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
    const res=await fetch(url,{headers:{'Authorization':'Bearer '+token}});
    if(!res.ok)throw new Error(_bt('Không liệt kê được file trên Drive (HTTP {x1})',{x1:res.status}));
    const j=await res.json();
    // Trùng tên (hiếm, do race cũ): giữ file SỬA GẦN NHẤT (orderBy modifiedTime desc → gặp trước)
    for(const f of (j.files||[]))if(!map.has(f.name))map.set(f.name,{id:f.id,md5Checksum:f.md5Checksum,modifiedTime:f.modifiedTime||'',h:(f.appProperties&&f.appProperties.h)||'',p:f.appProperties||{}});
    pageToken=j.nextPageToken||'';
  }while(pageToken);
  _driveFileMap=map;
  return map;
}

// fileId có => PATCH ghi đè đúng file đó; không có => tạo mới trong appDataFolder. Nội dung luôn nén gzip.
async function driveUploadJSON(filename,obj,fileId,props){
  const token=await ensureDriveToken();
  const blob=await toGzipBlob(obj);
  const boundary='dichtr_backup_'+Date.now();
  const mime=blob.type||'application/gzip';
  const metadata={name:filename,mimeType:mime};
  // parents:['appDataFolder'] CHỈ set lúc TẠO MỚI (endpoint upload multipart không cho đổi "parents"
  // khi PATCH file đã có).
  if(!fileId)metadata.parents=['appDataFolder'];
  if(props)metadata.appProperties=props; // vd {h:hash nội dung} — đọc lại được qua files.list, khỏi tải file
  const body=new Blob([
    '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n'+
    '--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',
    blob,
    '\r\n--'+boundary+'--'
  ]);
  const url=fileId
    ?'https://www.googleapis.com/upload/drive/v3/files/'+fileId+'?uploadType=multipart&fields=id,md5Checksum'
    :'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum';
  const res=await fetch(url,{
    method:fileId?'PATCH':'POST',
    headers:{
      'Authorization':'Bearer '+token,
      'Content-Type':'multipart/related; boundary="'+boundary+'"'
    },
    body
  });
  if(res.status===404&&fileId){
    // id trong cache đã cũ (file bị xoá từ nơi khác) → bỏ khỏi cache và tạo mới
    if(_driveFileMap)_driveFileMap.delete(filename);
    return driveUploadJSON(filename,obj,undefined,props);
  }
  if(!res.ok)throw new Error(_bt('Tải lên Drive thất bại (HTTP {x1})',{x1:res.status}));
  const j=await res.json();
  if(_driveFileMap&&j&&j.id)_driveFileMap.set(filename,{id:j.id,md5Checksum:j.md5Checksum,h:(props&&props.h)||'',p:props||{},modifiedTime:new Date().toISOString()});
  console.log('[Drive] upload '+filename+': '+Math.round(blob.size/1024)+' KB'+(blob.rawSize?' (gốc '+Math.round(blob.rawSize/1024)+' KB)':''));
  return j;
}

// Tìm file theo TÊN CHÍNH XÁC trong appDataFolder (tra Map đã cache) — null nếu chưa có.
// driveFindFileMetaByName trả thêm md5Checksum → so với bản đã biết để KHỎI tải lại file lớn.
async function driveFindFileMetaByName(name){
  if(!_driveFileMap)await driveRefreshFileMap();
  return _driveFileMap.get(name)||null;
}
async function driveFindFileIdByName(name){
  const m=await driveFindFileMetaByName(name);
  return m?m.id:null;
}
// "Upsert": có file cùng tên thì PATCH ĐÈ nội dung vào ĐÚNG file đó, chưa có thì tạo mới — dùng cho
// đồng bộ tự động để không đẻ thêm file mới mỗi lần chạy.
async function driveUpsertJSON(filename,obj,props){
  const existingId=await driveFindFileIdByName(filename);
  return driveUploadJSON(filename,obj,existingId||undefined,props);
}

async function driveDeleteFile(fileId){
  const token=await ensureDriveToken();
  const res=await fetch('https://www.googleapis.com/drive/v3/files/'+fileId,{
    method:'DELETE',
    headers:{'Authorization':'Bearer '+token}
  });
  // 404 nghĩa là file đã bị xoá từ trước (vd xoá tay trên Drive) — coi như thành công, không cần báo lỗi
  if(!res.ok&&res.status!==404)throw new Error(_bt('Không xoá được file trên Drive (HTTP {x1})',{x1:res.status}));
  if(_driveFileMap){for(const [k,v] of _driveFileMap){if(v.id===fileId)_driveFileMap.delete(k);}}
}

// Tải + giải nén (nhận cả file gzip lẫn JSON thô cũ).
// Thử lại tối đa 3 lần khi: lỗi mạng thoáng qua, 401 (token hết hạn → làm mới), 429/5xx (Drive quá tải).
async function driveDownloadJSON(fileId){
  let lastErr=null;
  const _t0=Date.now();
  for(let attempt=0;attempt<3;attempt++){
    try{
      const token=await ensureDriveToken();
      const _ac=(typeof AbortController!=='undefined')?new AbortController():null;
      const _to=_ac?setTimeout(()=>_ac.abort(),90000):null; // treo quá 90s → huỷ và thử lại (trước đây có thể treo vô hạn)
      let res;
      try{
        res=await fetch('https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media',{
          headers:{'Authorization':'Bearer '+token},signal:_ac?_ac.signal:undefined
        });
      }finally{if(_to)clearTimeout(_to);}
      if(!res.ok){
        if(res.status===401)_driveTokenExpiry=0; // buộc lần sau làm mới access token
        let detail='';
        try{const j=await res.json();detail=(j&&j.error&&(j.error.message||j.error.status))||'';}catch(e){}
        const err=new Error(_bt('Không tải được file từ Drive (HTTP {x1}{x2})',{x1:res.status,x2:(detail?': '+detail:'')}));
        err.retry=(res.status===401||res.status===429||res.status>=500);
        throw err;
      }
      const _j=await readJSONAuto(res);
      console.log('[Drive] tải xong '+fileId+' sau '+(Date.now()-_t0)+'ms'+(attempt?' (lần thử '+(attempt+1)+')':''));
      return _j;
    }catch(e){
      lastErr=e;
      console.warn('[Drive] tải lỗi '+fileId+' (lần '+(attempt+1)+'/3, '+(Date.now()-_t0)+'ms): '+((e&&e.name)||'')+' '+((e&&e.message)||e));
      const transient=e&&(e.retry||e.name==='TypeError'||e.name==='AbortError'); // TypeError = fetch lỗi mạng
      if(!transient||attempt===2)break;
      await new Promise(r=>setTimeout(r,600*(attempt+1)));
    }
  }
  throw lastErr;
}

// ===== BACKUP & RESTORE (chỉ file .json trên thiết bị) =====
// Mã chọn "Toàn bộ truyện" trong dropdown của popup sao lưu tủ truyện
const BACKUP_ALL_BOOKS='__all__';

// Chuẩn hoá tên truyện để so sánh "cùng tên" khi khôi phục (bỏ khoảng trắng đầu/cuối, thống nhất
// dạng Unicode NFC — tránh lệch chỉ vì cùng 1 chữ tiếng Việt có dấu được gõ theo 2 kiểu mã hoá).
function normBookNameNFC(n){return String(n==null?'':n).normalize('NFC').trim();}
// Khoá localStorage của 1 truyện dùng fname (xem sessionKey()/bmKey() trong index.html)
function bookFnameOf(bk){return bk.fname||((bk.name||'')+'.txt');}
// Ghi 1 record vào tủ qua CỔNG CHẶN MẤT BẢN DỊCH (trGuardMerge ở index.html): đọc bản đang có trong CÙNG transaction rồi gộp ngược chương
// bị thiếu trước khi ghi. Không truyền token xoá → khôi phục/gộp/đồng bộ KHÔNG BAO GIỜ làm giảm số chương dịch. onErr(e) khi lỗi.
function _guardedPutRec(store,metaStore,rec,onErr){
  const g=store.get(rec.id);
  g.onsuccess=()=>{
    try{
      const old=g.result;
      if(old&&typeof trGuardMerge==='function')trGuardMerge(old,rec,[]);
      store.put(rec);metaStore.put(bookToMeta(rec));
    }catch(e){if(onErr)onErr(e);}
  };
  g.onerror=()=>{if(onErr)onErr(g.error||new Error('Không đọc được bản đang có trong tủ'));};
}
const LS_TR_USERDEL='dich-tr-userdel'; // {bookId:ts} — người dùng vừa chủ động xoá bản dịch (index.html trAllowDelete) → cho phép số chương giảm ở lượt sao lưu kế
function _userDelMarker(id){try{return !!(JSON.parse(localStorage.getItem(LS_TR_USERDEL)||'{}')||{})[id];}catch(e){return false;}}
function _clearUserDelMarker(id){try{const m=JSON.parse(localStorage.getItem(LS_TR_USERDEL)||'{}')||{};if(m[id]){delete m[id];localStorage.setItem(LS_TR_USERDEL,JSON.stringify(m));}}catch(e){}}
// Tên truyện -> chuỗi không dấu an toàn để đặt vào tên file backup
function slugifyForFilename(n){
  const t=String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D')
    .replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase().slice(0,40);
  return t||'truyen';
}

// bookId (chỉ dùng khi type==='library'): BACKUP_ALL_BOOKS (mặc định) = cả tủ truyện, hoặc id 1 truyện cụ thể.
let _backupBusy=false;
async function doBackup(type,bookId){
  if(_backupBusy)return; // đang xuất rồi (bấm 2 lần) → bỏ qua, tránh tải 2 file
  _backupBusy=true;
  setStatus('Đang sao lưu...');
  try{
    await _doBackupImpl(type,bookId);
  }catch(e){
    console.error('[Backup] Sao lưu thất bại',e);
    let why=(e&&e.message)||String(e);
    // JSON.stringify của cả tủ truyện vượt giới hạn độ dài chuỗi của trình duyệt (~500 triệu ký tự)
    if(e&&(e.name==='RangeError'||/invalid string length|allocation failed|out of memory/i.test(why)))
      why='dữ liệu quá lớn, hãy sao lưu từng truyện.';
    setStatus(_bt('Sao lưu thất bại: {x1}',{x1:why}),6000);
  }finally{
    _backupBusy=false;
  }
}
async function _doBackupImpl(type,bookId){
  // Flush bản dịch đang trong RAM vào IndexedDB/localStorage trước khi export
  if((type==='library'||type==='all')&&S.fname){
    await saveSession();
  }
  const data={version:'1.0',type,exportedAt:new Date().toISOString()};
  if(type==='settings'||type==='all'){
    data.settings=JSON.parse(localStorage.getItem('ds')||'{}');
    data.theme=localStorage.getItem('dt');
    data.auto=localStorage.getItem('dich-auto');
    // 2 bộ preset tách biệt theo ngôn ngữ đích: data.presets = bộ TIẾNG VIỆT (như cũ, backup cũ/máy cũ vẫn đọc được), data.presetsEn = bộ tiếng Anh (chỉ ghi khi có)
    data.presets=(typeof loadPresetsFor==='function')?loadPresetsFor(''):loadPresets();
    try{if(typeof loadPresetsFor==='function'&&(localStorage.getItem('dich-presets-en')||_presetNs()==='en'))data.presetsEn=loadPresetsFor('en');}catch(e){}
    data.etRules=JSON.parse(localStorage.getItem('dich-et-rules')||'[]'); // quy tắc "Sửa text" (popup mới)
    try{data.etSort=JSON.parse(localStorage.getItem('dich-et-sort')||'{}')||{};}catch(e){data.etSort={};} // công tắc "Ưu tiên cụm dài trước" theo từng phạm vi
    try{data.etAiNote=JSON.parse(localStorage.getItem('dich-et-ainote')||'{}')||{};}catch(e){data.etAiNote={};} // "Ghi chú cho AI" riêng từng truyện ({S.fname: text})
    // Cặp xưng hô + từ cần tránh tuỳ chỉnh (popup "Xưng hô thường gặp", state CHUNG mọi truyện) — xem addr-presets.js
    try{data.addrPairPresets=JSON.parse(localStorage.getItem('addrPairPresetsGlobalV5')||'null');}catch(e){data.addrPairPresets=null;}
  }
  let singleBook=null; // truyện được chọn riêng (nếu có) — dùng để đặt tên file
  if(type==='library'||type==='all'){
    let allBooks=await libGetAll();
    // Sao lưu riêng 1 truyện: chỉ giữ đúng truyện đó (và chỉ kèm bản dịch/bookmark/xưng hô của nó)
    if(type==='library'&&bookId&&bookId!==BACKUP_ALL_BOOKS){
      allBooks=allBooks.filter(b=>b.id===bookId);
      if(!allBooks.length){setStatus('Không tìm thấy truyện này.',4000);return;}
      singleBook=allBooks[0];
    }
    // Merge bản dịch từ localStorage vào các book chưa có translations trong IndexedDB
    // (trường hợp fallback: IndexedDB bị chặn hoặc chưa saveSession lần nào)
    const lsMerged=new Set(); // truyện vừa nhận bản dịch từ localStorage (fallback) — KHÔNG được bỏ trường phẳng của chúng
    for(const bk of allBooks){
      if(!bk.translations||Object.keys(bk.translations).length===0){
        const lsKey='dich-tr:'+(bk.fname||bk.name+'.txt');
        try{
          const v=localStorage.getItem(lsKey);
          if(v){const d=JSON.parse(v);if(d&&d.translations&&Object.keys(d.translations).length>0){bk.translations=d.translations;bk.cur=d.cur??bk.cur;bk.ts=d.ts??bk.ts;bk.chapterTitles=d.chapterTitles??bk.chapterTitles;lsMerged.add(bk);}}
        }catch(e){}
      }
    }
    // Record có variants đã chứa đủ bản dịch → bỏ translations/translatedTitles/audited phẳng ở gốc (bản sao trùng,
    // làm file phình gần gấp đôi). Khi khôi phục, rehydrateFlat() dựng lại. Không đụng record gốc trong IndexedDB.
    data.library=allBooks.map(b=>lsMerged.has(b)?b:slimForDrive(b));
    // Khoá localStorage của riêng các truyện đang sao lưu (theo fname hoặc id) — null = lấy hết
    const wantKey=singleBook
      ? (prefix=>{const ok=new Set([prefix+bookFnameOf(singleBook),prefix+singleBook.id]);return k=>ok.has(k);})
      : null;
    // Gom 1 nhóm khoá localStorage theo prefix (lọc theo truyện đã chọn nếu có)
    const collect=prefix=>{
      const out={};
      const accept=wantKey?wantKey(prefix):null;
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith(prefix)&&(!accept||accept(k))){
          try{const v=JSON.parse(localStorage.getItem(k));if(v)out[k]=v;}catch(e){}
        }
      }
      return out;
    };
    // Bản dịch + vị trí chương đang đọc (localStorage dich-tr:*) — giữ lại để tương thích restore cũ
    data.sessions=collect('dich-tr:');
    // Khôi phục chỉ dùng dich-tr:* cho truyện mà record trong tủ CHƯA có bản dịch (xem applyRestoreData) → bỏ các bản
    // localStorage của truyện đã có bản dịch trong tủ, tránh mang trùng cả bản dịch nặng vào file.
    for(const bk of allBooks){
      if(!trCount(bk))continue; // chỉ bỏ bản localStorage khi record THỰC SỰ đã có chương dịch (variant rỗng không tính)
      delete data.sessions['dich-tr:'+bookFnameOf(bk)];
      delete data.sessions['dich-tr:'+bk.id];
    }
    // Bookmark (dich-bm:*)
    data.bookmarks=collect('dich-bm:');
    // Lựa chọn thể loại xưng hô RIÊNG THEO TỪNG TRUYỆN (localStorage dich-addr-preset:*, xem addr-presets.js
    // setStoryChoice/getStoryChoice) — khác state cặp/tránh dùng CHUNG ở trên, key khác nhau theo từng truyện.
    data.addrStoryChoices=collect('dich-addr-preset:');
    // Bộ nhớ nhân vật: dữ liệu CHÍNH (bk.characters, bk.charMergeRejected) nằm sẵn trong bản ghi sách ở data.library
    // (character-memory.js saveCharacterMemory). Chỉ khi truyện KHÔNG nằm trong tủ thì nó mới rơi về localStorage
    // 'dich-charm:<fname>' (+ ':rejected') — gom luôn phần này, cùng bản chưng cất chỉ dẫn xưng hô/thể loại
    // 'dich-charm-guidance:<fname>' (cache theo hash prompt, mang theo đỡ tốn 1 lượt gọi AI chưng cất lại).
    const collectCharm=prefix=>{
      const out={};
      const okBase=singleBook?prefix+bookFnameOf(singleBook):null;
      // gồm cả bản theo đích khác tiếng Việt: '<khoá>@<mã đích>' (+ ':rejected')
      const ok=okBase?{has:k=>k===okBase||k===okBase+':rejected'||k.startsWith(okBase+'@')}:null;
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith(prefix)&&(!ok||ok.has(k))){
          try{const v=JSON.parse(localStorage.getItem(k));if(v!=null)out[k]=v;}catch(e){}
        }
      }
      return out;
    };
    data.charmemStorage=collectCharm('dich-charm:');
    data.charmemGuidance=collectCharm('dich-charm-guidance:');
    // Quy tắc "Sửa văn bản" RIÊNG của từng truyện (scope = S.fname, xem edit-text.js) + công tắc "Ưu tiên cụm
    // dài trước" của chúng — đi kèm file để khôi phục truyện không cần sao lưu thêm Cài đặt. Quy tắc dùng chung
    // ("Tất cả truyện", scope 'all') thuộc phần Cài đặt nên KHÔNG kèm ở đây.
    const fnames=new Set(allBooks.map(bookFnameOf));
    let etAll=[];try{etAll=JSON.parse(localStorage.getItem('dich-et-rules')||'[]');}catch(e){}
    data.etStoryRules=(Array.isArray(etAll)?etAll:[]).filter(r=>r&&r.scope&&r.scope!=='all'&&fnames.has(r.scope));
    let etSortAll={};try{etSortAll=JSON.parse(localStorage.getItem('dich-et-sort')||'{}')||{};}catch(e){}
    data.etStorySort={};
    for(const f of fnames){if(Object.prototype.hasOwnProperty.call(etSortAll,f))data.etStorySort[f]=etSortAll[f];}
    // "Ghi chú cho AI" của các truyện trong file (đi kèm file để khôi phục truyện không mất ghi chú)
    let etNoteAll={};try{etNoteAll=JSON.parse(localStorage.getItem('dich-et-ainote')||'{}')||{};}catch(e){}
    data.etStoryAiNote={};
    for(const f of fnames){if(typeof etNoteAll[f]==='string'&&etNoteAll[f].trim())data.etStoryAiNote[f]=etNoteAll[f];}
  }
  const suffix=type==='all'?'toan-bo':type==='settings'?'cai-dat':'tu-truyen';
  const bookPart=singleBook?('-'+slugifyForFilename(singleBook.name)):'';
  const _d=new Date(); // ngày THEO GIỜ MÁY (toISOString là UTC → 0–7h sáng ở VN bị ghi nhầm sang hôm trước)
  const ymd=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0');
  const filename='backup-'+suffix+bookPart+'-'+ymd+'.json';

  // Nén gzip + bỏ thụt lề (trước đây JSON.stringify(data,null,2)) → file nhẹ hơn nhiều. Trình duyệt không
  // hỗ trợ nén thì toGzipBlob trả JSON thô và vẫn đặt tên .json như cũ.
  const blob=await toGzipBlob(data);
  const finalName=blob.type==='application/gzip'?filename+'.gz':filename;
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download=finalName;
  a.style.display='none';
  document.body.appendChild(a); // Firefox/Safari cũ chỉ cho tải khi <a> nằm trong DOM
  a.click();
  // KHÔNG revoke ngay: file lớn mà thu hồi URL liền sau click có thể làm trình duyệt huỷ tải / ra file 0 byte.
  setTimeout(()=>{try{a.remove();}catch(e){}URL.revokeObjectURL(url);},60000);
  setStatus('Đã sao lưu xong.',3000);
}

// Nhãn hiển thị cho loại dữ liệu ('all'|'settings'|'library'), dùng chung cho các popup xác nhận
// bên dưới lẫn cho phần đồng bộ tự động.
function backupTypeLabel(type){
  return type==='settings'?'Cài đặt':type==='library'?'Tủ truyện':'Toàn bộ';
}

// Popup xác nhận SAO LƯU — loại dữ liệu (Toàn bộ/Cài đặt/Tủ truyện) chọn sẵn từ menu con avatar
// (xem chooseBackupType bên dưới). Sao lưu chỉ xuất file .json tải về máy. Riêng "Tủ truyện" có thêm
// dropdown chọn truyện: "Toàn bộ truyện" (mặc định) hoặc 1 truyện cụ thể, xếp tên A -> Z.
async function confirmBackupPopup(type){
  let msg='Xuất ra file <strong>.json.gz</strong> và tải về máy.';
  let chosen=BACKUP_ALL_BOOKS;
  if(type==='library'){
    let metas=[];
    try{metas=await libGetAllMeta();}catch(e){}
    metas.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'vi',{numeric:true}));
    const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const opts='<option value="'+BACKUP_ALL_BOOKS+'">Toàn bộ truyện</option>'+
      metas.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name||'(không tên)')+'</option>').join('');
    msg+='<div style="margin:12px 0 4px;">'+
      '<label for="backupBookSelect" style="display:block;font-size:12px;color:var(--text3);margin-bottom:5px;">Chọn truyện</label>'+
      '<select id="backupBookSelect" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text);font:inherit;font-size:14px;">'+opts+'</select>'+
    '</div>';
  }
  showPopup({
    title:_bt('Sao lưu dữ liệu — {x1}',{x1:_bt(backupTypeLabel(type))}),
    msg,
    btns:[
      {label:'Sao lưu',cls:'btn-p',cb:()=>doBackup(type,chosen)},
      {label:'Hủy',cls:'btn'},
    ]
  });
  const sel=document.getElementById('backupBookSelect');
  if(sel)sel.addEventListener('change',()=>{chosen=sel.value;});
}

// Popup xác nhận KHÔI PHỤC — chọn file .json từ máy (pickRestoreFile mở hộp chọn file).
// Tủ truyện: chỉ ghi đè truyện TRÙNG TÊN, truyện khác trong tủ giữ nguyên (xem applyRestoreData).
function confirmRestorePopup(type){
  const warn=(type==='settings')
    ?'&#9888; Ghi đè cài đặt hiện tại.'
    :(type==='library')
      ?'Truyện <b>trùng tên</b> sẽ được gộp, không mất chương dịch.'
      :'&#9888; Ghi đè cài đặt; truyện <b>trùng tên</b> được gộp.';
  showPopup({
    title:_bt('Khôi phục dữ liệu — {x1}',{x1:_bt(backupTypeLabel(type))}),
    msg:'<span style="color:var(--accent);font-size:12px;display:block;margin-bottom:2px;">'+warn+'</span>Chọn file backup (<strong>.json.gz</strong> hoặc <strong>.json</strong>).',
    btns:[
      {label:'Khôi phục',cls:'btn-p',cb:()=>pickRestoreFile(type)},
      {label:'Hủy',cls:'btn'},
    ]
  });
}

let _restoreType='all';
// id truyện đang mở bị đóng tạm để khôi phục đè (xem applyRestoreData) — mở lại ở cuối, kể cả khi khôi phục lỗi.
let _restoreReopenId=null;
async function reopenAfterRestore(){
  const id=_restoreReopenId;_restoreReopenId=null;
  if(!id)return;
  try{await libOpen(id);}catch(e){}
}

function pickRestoreFile(type){
  _restoreType=type;
  const fi=document.getElementById('restoreFileInput');
  fi.setAttribute('accept','.json,.gz,application/json,application/gzip'); // nhận cả backup mới (.gz) lẫn cũ (.json)
  fi.value='';fi.click();
}

let _restoreBusy=false;
let _rtFile=false; // đang khôi phục từ FILE (hiện toast tiến độ trong applyRestoreData)
async function doRestoreFile(input){
  if(_restoreBusy)return; // đang khôi phục dở (chọn file 2 lần) → bỏ qua
  _restoreBusy=true;
  try{await _doRestoreFileImpl(input);}finally{_restoreBusy=false;}
}
async function _doRestoreFileImpl(input){
  const file=input.files[0];if(!file)return;
  let data;
  try{data=await readJSONAuto(new Response(file));}catch(err){RestoreToast.error(/gzip/i.test((err&&err.message)||'')?'Trình duyệt quá cũ, không mở được file .gz.':'File không hợp lệ.');return;}
  const bad=validateRestoreData(data,_restoreType);
  if(bad){RestoreToast.error(bad);return;}
  // Đồng bộ tự động đang chạy dở có thể tải bản Drive về đè lên truyện vừa khôi phục → đợi nó xong, rồi chiếm cờ
  // _autoSyncRunning (autoSyncNow thấy cờ này thì bỏ qua lượt) cho tới khi khôi phục xong. Không đợi được thì thôi, báo thử lại.
  const _t0=Date.now();
  while(_autoSyncRunning&&Date.now()-_t0<60000)await new Promise(r=>setTimeout(r,200));
  if(_autoSyncRunning){RestoreToast.error('Đang đồng bộ, thử lại sau ít phút.');return;}
  // Khoá liên-tab (Web Locks) dùng CHUNG tên với autoSyncNow: tab khác đang đồng bộ thì đợi (tối đa 60s); trong lúc khôi phục
  // thì mọi tab khác bị bỏ qua lượt đồng bộ. Trình duyệt không hỗ trợ Web Locks thì chạy như cũ.
  let _relLock=null;
  if(typeof navigator!=='undefined'&&navigator.locks&&navigator.locks.request){
    try{
      const ac=typeof AbortController!=='undefined'?new AbortController():null;
      const tm=ac?setTimeout(()=>ac.abort(),60000):null;
      await new Promise((resolveGot,rejectGot)=>{
        navigator.locks.request('nt-autosync',ac?{signal:ac.signal}:{},()=>new Promise(rel=>{_relLock=rel;resolveGot();})).catch(rejectGot);
      }).finally(()=>{if(tm)clearTimeout(tm);});
    }catch(e){RestoreToast.error('Đang đồng bộ ở tab khác, thử lại sau ít phút.');return;}
  }
  _autoSyncRunning=true;
  try{
    _rtFile=true;
    await applyRestoreData(data,_restoreType);
  }catch(err){
    const quota=err&&(err.name==='QuotaExceededError'||/quota/i.test(err.message||''));
    await reopenAfterRestore();
    RestoreToast.error(quota?_bt('bộ nhớ đã đầy.'):((err&&err.message)||String(err)));
  }finally{
    _rtFile=false;
    _autoSyncRunning=false; // nhả khoá: lượt đồng bộ sau sẽ đẩy các truyện vừa khôi phục (đã markBookDirty) lên Drive
    if(_relLock)_relLock();  // nhả khoá liên-tab
  }
}
// Kiểm tra file đã đọc có đúng loại đang khôi phục không — trả chuỗi báo lỗi, hoặc '' nếu hợp lệ.
// (Trước đây chọn "Tủ truyện" mà file chỉ có cài đặt, hoặc file lạ, vẫn báo "Khôi phục thành công".)
const RESTORE_SETTINGS_KEYS=['settings','theme','auto','presets','presetsEn','etRules','etSort','etAiNote','addrPairPresets'];
function validateRestoreData(data,type){
  if(!data||typeof data!=='object'||Array.isArray(data))return 'File không hợp lệ.';
  const hasSettings=RESTORE_SETTINGS_KEYS.some(k=>data[k]!=null);
  const hasLib=Array.isArray(data.library)&&data.library.some(b=>b&&typeof b==='object');
  if(type==='settings'&&!hasSettings)return _bt('File này không có cài đặt.')+(hasLib?' '+_bt('Hãy chọn "Tủ truyện".'):'');
  if(type==='library'&&!hasLib)return _bt('File này không có truyện.')+(hasSettings?' '+_bt('Hãy chọn "Cài đặt".'):'');
  if(type==='all'&&!hasSettings&&!hasLib)return 'File này không có dữ liệu để khôi phục.';
  return '';
}

// Hộp hỏi khi có truyện trong máy MỚI HƠN bản trong file backup. Trả 'merge' (gộp theo chương),
// 'all' (ghi đè hết) hoặc 'cancel'. (Đã đổi: 'keep' → 'merge' = gộp theo chương, giữ chương dịch của cả 2 bản.) Đóng hộp bằng click ra ngoài/Esc (không bấm nút) cũng tính là 'cancel'.
function askRestoreConflict(conflicts){
  return new Promise(resolve=>{
    let done=false,iv=null;
    const fin=v=>{if(done)return;done=true;if(iv)clearInterval(iv);resolve(v);};
    const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const rows=conflicts.slice(0,5).map(c=>'• '+esc(c.lm.name||c.bk.name||_bt('(không tên)'))).join('<br>');
    const more=conflicts.length>5?'<br>'+_bt('… và {x1} truyện khác',{x1:(conflicts.length-5)}):'';
    const myTitle='Có truyện mới hơn file backup';
    showPopup({
      title:myTitle,
      msg:'<div class="meta-card" style="margin-top:0;line-height:1.7;">'+rows+more+'</div>',
      btns:[
        {label:'Gộp',cls:'btn-p',cb:()=>fin('merge')},
        {label:'Ghi đè',cls:'btn',cb:()=>fin('all')},
        {label:'Huỷ',cls:'btn',cb:()=>fin('cancel')},
      ]
    });
    // Hộp bị đóng không qua nút (click ngoài/Esc) HOẶC bị popup khác (lỗi chương, chặn vị trí...) dùng đè lên → coi như Hủy,
    // nếu không promise treo mãi và đồng bộ tự động bị khoá.
    iv=setInterval(()=>{
      const ov=document.getElementById('popupOverlay'),ti=document.getElementById('popupTitle');
      if(!ov||!ov.classList.contains('show')||(ti&&ti.textContent!==myTitle))fin('cancel');
    },400);
  });
}

// ===== GỘP quy tắc "Sửa văn bản" khi khôi phục/đồng bộ (chỉ THÊM, không xoá quy tắc đang có) =====
// Khoá nhận diện 1 quy tắc: phạm vi + từ khoá + 3 tuỳ chọn. Trùng khoá thì giữ bản đang có ở máy này
// (kể cả khi "thay bằng" khác), quy tắc mới trong file được thêm vào cuối với id mới. Trả số quy tắc đã thêm.
function _etRuleKey(r){return [r.scope,r.find,r.regex?1:0,r.matchCase?1:0,r.wholeWord?1:0].join('\u0001');}
function mergeEtRulesIntoLS(incoming,scopeFilter){
  if(!Array.isArray(incoming))return 0;
  let cur=[];try{cur=JSON.parse(localStorage.getItem('dich-et-rules')||'[]');}catch(e){cur=[];}
  if(!Array.isArray(cur))cur=[];
  const seen=new Set();
  for(const r of cur){if(r&&typeof r.find==='string')seen.add(_etRuleKey(r));}
  let nid=cur.reduce((m,r)=>Math.max(m,(r&&r.id)||0),0)+1;
  let added=0;
  for(const r of incoming){
    if(!r||typeof r.find!=='string'||typeof r.scope!=='string'||!r.scope)continue;
    if(scopeFilter&&!scopeFilter(r.scope))continue;
    const k=_etRuleKey(r);
    if(seen.has(k))continue;
    seen.add(k);
    cur.push({id:nid++,scope:r.scope,find:r.find,replace:(typeof r.replace==='string'?r.replace:''),regex:!!r.regex,matchCase:!!r.matchCase,wholeWord:!!r.wholeWord});
    added++;
  }
  if(added)localStorage.setItem('dich-et-rules',JSON.stringify(cur));
  return added;
}
// Gộp công tắc "Ưu tiên cụm dài trước": khoá đã có ở máy này thì giữ nguyên, chỉ thêm khoá còn thiếu.
function mergeEtSortIntoLS(incoming,keyFilter){
  if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))return 0;
  let cs={};try{cs=JSON.parse(localStorage.getItem('dich-et-sort')||'{}')||{};}catch(e){cs={};}
  if(!cs||typeof cs!=='object'||Array.isArray(cs))cs={};
  let added=0;
  for(const k of Object.keys(incoming)){
    if(keyFilter&&!keyFilter(k))continue;
    if(Object.prototype.hasOwnProperty.call(cs,k))continue;
    cs[k]=incoming[k];added++;
  }
  if(added)localStorage.setItem('dich-et-sort',JSON.stringify(cs));
  return added;
}
async function applyRestoreData(data,type){
  // Truyện trong file mà bản trong máy MỚI HƠN: hỏi trước khi làm bất cứ điều gì (kể cả áp cài đặt ở loại 'all').
  const _skipBooks=new Set(); // các object truyện trong data.library sẽ bị bỏ qua
  const _replaceBooks=new Set(); // truyện người dùng CHỦ ĐỘNG chọn "Ghi đè hết" (thay nguyên record, không gộp). Mặc định mọi truyện trùng tên đều được GỘP theo chương.
  if((type==='library'||type==='all')&&Array.isArray(data.library)&&typeof showPopup==='function'){
    const ex=await libGetAllMeta();
    const byId=new Map(),byName=new Map();
    for(const m of ex){byId.set(m.id,m);const nk=normBookNameNFC(m.name);if(!byName.has(nk))byName.set(nk,m.id);}
    const conflicts=[];
    for(const bk of data.library){
      if(!bk||typeof bk!=='object')continue;
      const lid=byName.get(normBookNameNFC(bk.name));
      const lm=lid&&byId.get(lid);
      if(lm&&metaTs(lm)>metaTs(bk))conflicts.push({bk,lm});
    }
    if(conflicts.length){
      const choice=await askRestoreConflict(conflicts);
      if(choice==='cancel')return;
      if(choice==='all')conflicts.forEach(c=>_replaceBooks.add(c.bk));
    }
  }
  let _rtI=0;
  if(_rtFile){
    const _bn=((type==='library'||type==='all')&&Array.isArray(data.library))?data.library.filter(b=>b&&typeof b==='object').map(b=>b.name||_bt('(không tên)')):[];
    RestoreToast.start({device:'',total:_bn.length,names:_bn,title:_bt('Đang khôi phục từ file'),sub:_bt('Đang xử lý…')});
  }
  if(type==='settings'||type==='all'){
    // Không để cài đặt RỖNG (hoặc k/dk trống) từ máy khác/Drive xoá mất API key đang có ở máy này:
    // field k (Gemini) / dk (DeepSeek) trống trong dữ liệu đến thì giữ lại giá trị cục bộ; nếu sau đó
    // object vẫn rỗng thì không ghi gì.
    if(data.settings&&typeof data.settings==='object'&&!Array.isArray(data.settings)){
      let _curDs={};try{_curDs=JSON.parse(localStorage.getItem('ds')||'{}')||{};}catch(e){}
      const _incDs=Object.assign({},data.settings);
      for(const f of ['k','dk']){if(!_incDs[f]&&_curDs[f])_incDs[f]=_curDs[f];}
      if(Object.keys(_incDs).length)localStorage.setItem('ds',JSON.stringify(_incDs));
    }
    if(data.theme)localStorage.setItem('dt',data.theme);
    if(data.auto!=null)localStorage.setItem('dich-auto',data.auto);
    { // chỉ ghi bộ nào file có; backup cũ (không có presetsEn) giữ nguyên bộ tiếng Anh hiện tại
      let _pChanged=false;
      if(data.presets&&Array.isArray(data.presets)&&data.presets.length){(typeof savePresetsFor==='function')?savePresetsFor('',data.presets):savePresets(data.presets);_pChanged=true;}
      if(data.presetsEn&&Array.isArray(data.presetsEn)&&data.presetsEn.length&&typeof savePresetsFor==='function'){savePresetsFor('en',data.presetsEn);_pChanged=true;}
      if(_pChanged)initPresets();
    }
    // Quy tắc "Sửa text" (popup mới) — chỉ ghi đè khi file backup có sẵn field này
    // (backup từ bản mới); backup từ bản CŨ không có field này, để etRules hiện tại
    // nguyên vẹn cho loadSettings() bên dưới di chuyển (migrate) quy tắc "A=B" cũ vào.
    // GỘP (chỉ thêm quy tắc chưa có), không ghi đè nguyên khối: file backup cũ/máy khác không được làm mất
    // quy tắc bạn mới thêm ở máy này.
    if(data.etRules&&Array.isArray(data.etRules)){
      try{
        mergeEtRulesIntoLS(data.etRules);
        if(typeof etLoadRules==='function')etLoadRules(); // nạp lại vào biến etRules trong bộ nhớ
      }catch(e){}
    }
    // Công tắc "Ưu tiên cụm dài trước" — chỉ ghi đè khi backup có field này (backup/manifest cũ không có)
    if(data.etSort&&typeof data.etSort==='object'&&!Array.isArray(data.etSort)){
      try{
        mergeEtSortIntoLS(data.etSort); // gộp: khoá đã có giữ nguyên, chỉ thêm khoá còn thiếu
        if(typeof etLoadSortPrefs==='function')etLoadSortPrefs();
      }catch(e){}
    }
    // "Ghi chú cho AI" — GỘP theo từng truyện (ghi chú truyện nào có trong file thì lấy từ file; truyện không
    // có trong file giữ nguyên), không ghi đè nguyên khối để khôi phục/đồng bộ không làm mất ghi chú mới hơn.
    if(data.etAiNote&&typeof data.etAiNote==='object'&&!Array.isArray(data.etAiNote)){
      try{
        let cur={};try{cur=JSON.parse(localStorage.getItem('dich-et-ainote')||'{}')||{};}catch(e){}
        if(!cur||typeof cur!=='object'||Array.isArray(cur))cur={};
        for(const k of Object.keys(data.etAiNote)){if(typeof data.etAiNote[k]==='string'&&data.etAiNote[k].trim())cur[k]=data.etAiNote[k];}
        localStorage.setItem('dich-et-ainote',JSON.stringify(cur));
        if(typeof etLoadAiNotes==='function')etLoadAiNotes();
      }catch(e){}
    }
    // Cặp xưng hô + từ cần tránh tuỳ chỉnh — chỉ ghi đè khi backup có sẵn field này (backup từ bản
    // cũ không có), rồi gọi AddrPresets.reload() để bộ nhớ trong (cache _st) đọc lại từ localStorage
    // thay vì tiếp tục dùng bản cũ đã nạp từ đầu phiên.
    if(data.addrPairPresets){
      try{
        localStorage.setItem('addrPairPresetsGlobalV5',JSON.stringify(data.addrPairPresets));
        if(window.AddrPresets&&typeof window.AddrPresets.reload==='function')window.AddrPresets.reload();
      }catch(e){}
    }
    loadSettings();
  }
  let _restoreReport=null; // {overwritten, added} — chỉ có khi có khôi phục tủ truyện
  const _restoredFnames=new Set(); // fname các truyện vừa khôi phục — dùng cho quy tắc Sửa văn bản theo truyện
  // Truyện ĐANG MỞ mà bị khôi phục đè: bản dịch trong RAM (S.*) sẽ bị saveSession() ghi ngược lại lên bản vừa khôi phục
  // (đồng bộ tự động gọi saveSession mỗi chu kỳ) → phải đóng truyện trước khi ghi, rồi mở lại bằng libOpen sau khi xong.
  _restoreReopenId=null;
  if(type==='library'||type==='all'){
    // Khôi phục tủ truyện theo kiểu GỘP THEO TÊN: truyện trong file có CÙNG TÊN với truyện đã có trong
    // tủ thì ghi đè truyện đó; truyện chưa có thì thêm mới; truyện đang có mà file không nhắc tới thì
    // giữ nguyên (KHÔNG xoá tủ truyện cũ như trước). File chỉ có 1 truyện thì chỉ đụng tới 1 truyện đó.
    const restoredBooks=[]; // các record đã ghi (id có thể đã đổi sang id local khi ghi đè)
    if(data.library&&Array.isArray(data.library)){
      const existing=await libGetAllMeta();
      const idByName=new Map();
      const usedIds=new Set();
      for(const m of existing){
        usedIds.add(m.id);
        const nk=normBookNameNFC(m.name);
        if(!idByName.has(nk))idByName.set(nk,m.id);
      }
      const now=Date.now();
      let overwritten=0,added=0,skipped=0,merged=0;
      const recs=[];
      // Truyện đang mở: chốt bản dịch đang trong RAM xuống tủ trước, để bước gộp bên dưới đọc được bản mới nhất.
      if(typeof S!=='undefined'&&S&&S.fname){try{await saveSession();}catch(e){}}
      for(const bk of data.library){
        if(!bk||typeof bk!=='object')continue;
        const _bi=_rtI++;
        RestoreToast.book(_bi,_bt('đang gộp'));
        if(_skipBooks.has(bk)){skipped++;RestoreToast.bookDone(_bi,{state:'skip'});continue;} // người dùng chọn giữ bản mới hơn trong máy
        const rec=Object.assign({},bk);
        rehydrateFlat(rec); // backup mới bỏ trường phẳng trùng (xem doBackup) → dựng lại từ variant dùng gần nhất
        rec.__origId=bk.id; // chỉ dùng tạm bên dưới để khớp khoá localStorage, xoá trước khi ghi
        const localId=idByName.get(normBookNameNFC(bk.name));
        let _kind='added',_gain=0;
        let outRec=rec;
        if(localId){
          rec.id=localId; // ghi TẠI CHỖ truyện cùng tên (giữ id máy này, đồng bộ tự động không thấy thành truyện mới)
          if(_replaceBooks.has(bk)){
            overwritten++;_kind='over'; // người dùng chủ động chọn "Ghi đè hết"
          }else{
            // MẶC ĐỊNH: GỘP theo chương với bản trong máy (chương chỉ 1 bên có → giữ; cả 2 bên có → bản mới hơn thắng).
            // Trước đây thay nguyên record bằng bản trong file → file ít chương dịch hơn sẽ xoá mất chương dịch trong máy.
            let local=null;
            try{local=await libGet(localId);}
            catch(e){skipped++;RestoreToast.bookDone(_bi,{state:'err',why:_bt('Không đọc được truyện trong máy')});continue;}
            if(local){
              outRec=mergeBookRecords(local,rec); // dùng ts THẬT của file (chưa gán now) để so mới/cũ
              outRec.id=localId;outRec.__origId=bk.id;
              merged++;_kind='merged';_gain=Math.max(0,trCount(outRec)-trCount(local));
            }else{overwritten++;_kind='over';}
          }
        }else{
          // Truyện mới: giữ id trong file, trừ khi trùng id với 1 truyện KHÁC TÊN đã có (vd đã đổi tên) → cấp id mới để không ghi đè nhầm
          if(!rec.id||usedIds.has(rec.id))rec.id='bk-'+now+'-'+Math.random().toString(36).slice(2,8);
          usedIds.add(rec.id);
          idByName.set(normBookNameNFC(bk.name),rec.id); // file có 2 truyện trùng tên với nhau thì truyện sau ghi đè truyện trước
          added++;
        }
        // Đánh dấu "vừa sửa" để đồng bộ tự động coi bản vừa khôi phục là mới nhất (nếu không, bản cũ hơn
        // trong file có thể bị bản mới hơn trên Drive tải đè ngược lại ở lượt đồng bộ kế tiếp)
        outRec.ts=now;
        recs.push(outRec);
        RestoreToast.bookDone(_bi,{state:'ok',isNew:_kind==='added',kind:_kind,gain:_gain});
      }
      if(recs.length){
        const _openId=(typeof S!=='undefined'&&S&&S.fname)
          ?((S.loadedBookId!==undefined)?S.loadedBookId:(typeof libCurrentId!=='undefined'?libCurrentId:null)):null;
        if(_openId&&recs.some(r=>r.id===_openId)&&typeof resetToUploadScreen==='function'){
          try{await saveSession();}catch(e){} // chốt bản hiện tại, phòng khi khôi phục thất bại
          resetToUploadScreen(); // dừng dịch, xoá S.* — từ đây saveSession không còn ghi bản cũ đè lên được
          libCurrentId=null;     // giống libRemove(): không để saveSession ghi nhầm vào truyện này
          _restoreReopenId=_openId;
        }
        const db=await openLibDB();
        // QUAN TRỌNG: phải ghi CẢ 2 store trong CÙNG 1 transaction — 'books' (đầy đủ) và
        // META_STORE/'booksMeta' (bản nhẹ dùng để hiển thị tủ truyện); libLoad() đọc danh sách từ META_STORE.
        // Trước đây onerror/onabort đều gọi resolve() nên khi IndexedDB hết dung lượng (transaction bị abort,
        // KHÔNG ghi được gì) hàm vẫn chạy tiếp và báo "Khôi phục thành công" dù tủ truyện không hề có gì mới.
        // Giờ lấy đúng lỗi của transaction để báo thật.
        let _restoreErr=null;
        await new Promise(resolve=>{
          const tx=db.transaction([LIB_STORE,META_STORE],'readwrite');
          const store=tx.objectStore(LIB_STORE);
          const metaStore=tx.objectStore(META_STORE);
          for(const rec of recs){
            const origId=rec.__origId;
            delete rec.__origId;
            try{
              _guardedPutRec(store,metaStore,rec,e=>{_restoreErr=_restoreErr||e;try{tx.abort();}catch(_){}});
            }catch(e){_restoreErr=e;try{tx.abort();}catch(_){}break;}
            restoredBooks.push({rec,origId});
          }
          tx.oncomplete=resolve;
          tx.onerror=()=>{_restoreErr=_restoreErr||tx.error;};
          tx.onabort=()=>{_restoreErr=_restoreErr||tx.error||new Error('Transaction aborted');resolve();};
        });
        if(_restoreErr){
          // Cả transaction bị huỷ → KHÔNG có truyện nào được ghi. Không đánh dấu dirty, không báo thành công.
          restoredBooks.length=0;
          if(typeof reportLibStorageError==='function')await reportLibStorageError(_restoreErr,'tủ truyện vừa khôi phục');
          RestoreToast.error(_bt('Không ghi được vào tủ truyện.'));
          await reopenAfterRestore(); // truyện đang đọc vẫn là bản cũ nguyên vẹn → mở lại như trước
          return;
        }
        if(typeof markBookDirty==='function')restoredBooks.forEach(b=>markBookDirty(b.rec.id));
        await libLoad();
      }
      _restoreReport={overwritten,added,skipped,merged};
    }
    restoredBooks.forEach(b=>_restoredFnames.add(bookFnameOf(b.rec)));
    // Khoá localStorage (bản dịch/bookmark/xưng hô theo truyện) CHỈ của các truyện vừa khôi phục — theo
    // fname hoặc id gốc trong file; KHÔNG xoá khoá của truyện khác như trước.
    const wantKeys=prefix=>{
      const ok=new Set();
      for(const {rec,origId} of restoredBooks){
        ok.add(prefix+bookFnameOf(rec));
        if(origId)ok.add(prefix+origId);
      }
      return ok;
    };
    // Khôi phục bản dịch + vị trí chương đang đọc
    if(data.sessions){
      // Bản dịch của truyện trong tủ đã nằm sẵn trong record vừa ghi (translations/variants) → KHÔNG chép thêm
      // sang localStorage (nặng, nhỏ ~5MB, dễ làm đầy). Chỉ chép cho backup rất cũ mà record chưa có bản dịch.
      const ok=new Set();
      for(const {rec,origId} of restoredBooks){
        if(trCount(rec))continue;
        ok.add('dich-tr:'+bookFnameOf(rec));
        if(origId)ok.add('dich-tr:'+origId);
      }
      // Ghi session mới — gia hạn TTL về hiện tại để không bị xóa ngay
      for(const [k,v] of Object.entries(data.sessions)){
        if(!ok.has(k))continue;
        try{v.ts=Date.now();localStorage.setItem(k,JSON.stringify(v));}catch(e){}
      }
    }
    // Khôi phục bookmark
    if(data.bookmarks){
      const ok=wantKeys('dich-bm:');
      for(const [k,v] of Object.entries(data.bookmarks)){
        if(!ok.has(k))continue;
        try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}
      }
    }
    // Khôi phục lựa chọn thể loại xưng hô riêng theo từng truyện (dich-addr-preset:*)
    if(data.addrStoryChoices){
      const ok=wantKeys('dich-addr-preset:');
      for(const [k,v] of Object.entries(data.addrStoryChoices)){
        if(!ok.has(k))continue;
        try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}
      }
    }
  }
  // Bộ nhớ nhân vật (bản fallback localStorage) + cache chỉ dẫn xưng hô — chỉ của các truyện vừa khôi phục
  if((type==='library'||type==='all')&&_restoredFnames.size){
    const okCharm=new Set(),okGuide=new Set();
    for(const f of _restoredFnames){
      okCharm.add('dich-charm:'+f);okCharm.add('dich-charm:'+f+':rejected');
      okGuide.add('dich-charm-guidance:'+f);
    }
    const put=(obj,ok)=>{
      if(!obj||typeof obj!=='object')return;
      for(const [k,v] of Object.entries(obj)){
        if(!ok.has(k))continue;
        try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}
      }
    };
    const _rf=Array.from(_restoredFnames);
    // bản nhân vật theo đích khác tiếng Việt: 'dich-charm:<fname>@<mã đích>' (+ ':rejected')
    put(data.charmemStorage,{has:k=>okCharm.has(k)||_rf.some(f=>k.startsWith('dich-charm:'+f+'@'))});
    put(data.charmemGuidance,okGuide);
  }
  // Quy tắc "Sửa văn bản" riêng của các truyện vừa khôi phục: GỘP (chỉ thêm quy tắc còn thiếu), giữ nguyên
  // mọi quy tắc đang có, kể cả của truyện khác và quy tắc "Tất cả truyện". Nguồn: etStoryRules (backup tủ truyện) hoặc, với backup
  // "Toàn bộ"/cài đặt, các quy tắc trong etRules có scope khác 'all'. Không có nguồn nào (backup cũ) thì bỏ qua.
  let _etRestored=0;
  if((type==='library'||type==='all')&&_restoredFnames.size){
    let src=null;
    if(Array.isArray(data.etStoryRules))src=data.etStoryRules;
    else if(Array.isArray(data.etRules))src=data.etRules.filter(r=>r&&r.scope&&r.scope!=='all');
    if(src){
      try{
        // GỘP: không xoá quy tắc riêng đang có của các truyện này, chỉ thêm quy tắc trong file mà máy chưa có.
        _etRestored+=mergeEtRulesIntoLS(src,sc=>_restoredFnames.has(sc));
        if(typeof etLoadRules==='function')etLoadRules();
      }catch(e){}
    }
    // Công tắc "Ưu tiên cụm dài trước" của các truyện này (chỉ khi file có thông tin)
    const srcSort=(data.etStorySort&&typeof data.etStorySort==='object')?data.etStorySort
      :((data.etSort&&typeof data.etSort==='object'&&!Array.isArray(data.etSort))?data.etSort:null);
    if(srcSort){
      try{
        mergeEtSortIntoLS(srcSort,f=>_restoredFnames.has(f)); // gộp: không xoá/ghi đè công tắc đang có
        if(typeof etLoadSortPrefs==='function')etLoadSortPrefs();
      }catch(e){}
    }
  }
  // "Ghi chú cho AI" của các truyện vừa khôi phục: chỉ ghi ghi chú CÓ trong file; truyện không có ghi chú trong file
  // thì giữ nguyên ghi chú hiện tại (không xoá).
  if((type==='library'||type==='all')&&_restoredFnames.size){
    const srcNote=(data.etStoryAiNote&&typeof data.etStoryAiNote==='object')?data.etStoryAiNote
      :((data.etAiNote&&typeof data.etAiNote==='object'&&!Array.isArray(data.etAiNote))?data.etAiNote:null);
    if(srcNote){
      try{
        let cur={};try{cur=JSON.parse(localStorage.getItem('dich-et-ainote')||'{}')||{};}catch(e){}
        if(!cur||typeof cur!=='object'||Array.isArray(cur))cur={};
        for(const f of _restoredFnames){if(typeof srcNote[f]==='string'&&srcNote[f].trim())cur[f]=srcNote[f];}
        localStorage.setItem('dich-et-ainote',JSON.stringify(cur));
        if(typeof etLoadAiNotes==='function')etLoadAiNotes();
      }catch(e){}
    }
  }
  const _wasReopened=!!_restoreReopenId;
  await reopenAfterRestore(); // sau khi đã ghi xong bookmark/nhân vật/quy tắc — libOpen mới đọc đủ dữ liệu vừa khôi phục
  if(_rtFile){
    if(type!=='library')RestoreToast.extra(_bt('cài đặt'));
    if(_etRestored)RestoreToast.extra(_bt('{x1} quy tắc sửa văn bản',{x1:_etRestored}));
    if(_wasReopened)RestoreToast.extra(_bt('Truyện đang đọc đã mở lại.'));
    RestoreToast.finish();
  }
}

// ===================================================================
// MENU ĐỒNG BỘ/SAO LƯU (#syncMenuWrap, avatar cạnh nút sáng/tối ở header)
// Thay cho 3 nút Sao lưu/Khôi phục/Mặc định cũ từng nằm trong khung Cài đặt.
// Cấu trúc: bấm avatar -> mở menu (Đăng nhập HOẶC Tài khoản đã đăng nhập / Đồng bộ ngay / Sao lưu /
// Khôi phục) -> mục "Sao lưu"/"Khôi phục" (và "Tài khoản" khi đã đăng nhập) expand sang bên cạnh
// ra menu con — riêng "Tài khoản" CHỈ mở bằng click (không mở khi hover, không có icon mũi tên),
// 2 mục "Sao lưu"/"Khôi phục" vẫn mở cả bằng hover trên desktop như cũ (Toàn bộ/Cài đặt/Tủ
// truyện) -> chọn xong mở thẳng popup xác nhận tương ứng (confirmBackupPopup/
// confirmRestorePopup ở trên; sao lưu/khôi phục thủ công CHỈ dùng file .json trên máy). "Đồng bộ hoá tự động" (bật/tắt + khoảng thời gian) không còn nằm
// trong menu này nữa — xem khối #autoSyncSettingsRow trong khung Cài đặt.
// ===================================================================
// Map which ('backup'/'restore'/'account') -> id của wrap + submenu tương ứng, dùng chung cho
// openSyncSubmenu/closeSyncSubmenu/toggleSyncSubmenu bên dưới thay vì lặp lại 3 lần logic giống
// hệt nhau cho từng loại.
function toggleSyncMenu(e){
  if(e)e.stopPropagation();
  const menu=document.getElementById('syncMenu');
  const btn=document.getElementById('btnSyncMenu');
  if(!menu||!btn)return;
  const willOpen=!menu.classList.contains('open');
  if(willOpen){
    // Đưa menu ra thẳng <body> để không bị kẹt trong stacking context của header → luôn nằm trên nút Nghe và mọi thứ khác.
    if(menu.parentNode!==document.body)document.body.appendChild(menu);
    renderSyncAccountUI();
    if(isDriveLoggedIn())renderDevicesSubmenu(false);
    const r=btn.getBoundingClientRect();
    // Căn theo mép PHẢI của nút (avatar là nút ngoài cùng bên phải header) để menu không tràn ra khỏi màn hình.
    menu.style.left='';menu.style.right=(window.innerWidth-r.right)+'px';
    menu.style.top=(r.bottom+6)+'px';
    menu.classList.add('open');
    requestAnimationFrame(()=>{
      const mr=menu.getBoundingClientRect();
      if(mr.left<8){menu.style.right='';menu.style.left='8px';}
      if(mr.bottom>window.innerHeight-8)menu.style.top=Math.max(8,window.innerHeight-mr.height-8)+'px';
    });
  }else{
    closeSyncMenu();
  }
  btn.classList.toggle('on',willOpen);
}
function closeSyncMenu(){
  const menu=document.getElementById('syncMenu');
  if(menu)menu.classList.remove('open');
  const btn=document.getElementById('btnSyncMenu');
  if(btn)btn.classList.remove('on');
}
// Sao lưu / khôi phục bằng tệp .json: công tắc 2 ngăn + 3 nút Toàn bộ / Tủ truyện / Cài đặt.
let _saFileMode='backup';
function setFileMode(btn){
  _saFileMode=btn.getAttribute('data-m')||'backup';
  document.querySelectorAll('#saSeg button').forEach(x=>x.classList.toggle('on',x===btn));
}
function chooseFile(e,type){
  if(_saFileMode==='restore')chooseRestoreType(e,type);else chooseBackupType(e,type);
}
// Ô chọn "Tự động sao lưu": Tắt = dừng vòng lặp; chọn thời gian = bật + lưu chu kỳ + chạy ngay.
function onAutoSyncMenuChange(el){
  const v=el.value;
  try{
    if(v==='0')localStorage.setItem(LS_AUTOSYNC,'0');
    else{localStorage.setItem(LS_AUTOSYNC_INTERVAL,v);localStorage.setItem(LS_AUTOSYNC,'1');}
  }catch(e){}
  if(v==='0')stopAutoSyncLoop();else startAutoSyncLoop();
  renderAutoSyncSwitch();
}
// Icon đồng bộ quay + chấm trạng thái nhấp nháy trong lúc đang sao lưu.
function _setSyncBusy(on){
  const ico=document.getElementById('autoSyncIcoMenu');
  if(ico)ico.classList.toggle('busy',!!on);
  document.querySelectorAll('.sa-dot').forEach(x=>x.classList.toggle('busy',!!on));
  _refreshMeDevTime(on?'busy':(parseInt(localStorage.getItem(LS_AUTOSYNC_LAST)||'0',10)||0));
}

// ===================================================================
// MENU "THIẾT BỊ" (Pha 5) — liệt kê các máy đã sao lưu lên Drive (driveListDevices, 1 lần files.list, không tải file nào).
//  - Dòng máy này "(Hiện tại)": bấm = sao lưu ngay (autoSyncNow({flush:true})); nút ✎ = đổi tên máy.
//  - Dòng máy khác / "Bản cũ": bấm = khôi phục từ máy đó (restoreFromDevice -> popup xem trước -> xác nhận).
// ===================================================================
let _devListSeq=0,_devListCache=null,_devListAt=0; // cache 30s: rê chuột nhiều lần không gọi Drive lại
function _devEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _devTimeText(ts){
  if(!ts)return 'chưa sao lưu';
  const d=new Date(ts),p=n=>String(n).padStart(2,'0'),now=new Date();
  // Số ngày lịch chênh lệch (so theo 0h, không phải 24h trôi) — qua nửa đêm là tính sang ngày hôm sau.
  const days=Math.round((new Date(now.getFullYear(),now.getMonth(),now.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);
  if(days<=0)return p(d.getHours())+':'+p(d.getMinutes()); // hôm nay (hoặc lệch đồng hồ ở tương lai)
  if(days<7)return _bt('{x1} ngày trước',{x1:days});                     // 1-6 ngày trước
  if(days===7)return '1 tuần trước';
  return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear(); // sau 7 ngày: ngày/tháng/năm
}
// Cập nhật dòng "máy này" trong danh sách thiết bị ngay khi sao lưu xong (không cần mở lại menu / chờ Drive liệt kê lại).
function _refreshMeDevTime(ts){
  document.querySelectorAll('#syncDevicesList .sa-dev[data-me="1"] small').forEach(s=>{s.textContent=ts==='busy'?'Đang sao lưu...':_devTimeText(ts);});
}
// Nhiều máy trùng tên (VD 2 điện thoại cùng "Chrome · Mobile") -> máy đầu giữ nguyên, các máy sau thêm số: "… 2", "… 3".
// Thứ tự theo deviceId (cố định, mọi máy nhìn ra cùng 1 kết quả); chỉ là NHÃN HIỂN THỊ — tên thật (d.name) không bị ghi số.
function _devLabelize(list){
  const groups=new Map();
  list.forEach(d=>{d.label=d.name;const k=String(d.name||'').trim().toLowerCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d);});
  groups.forEach(arr=>{
    if(arr.length<2)return;
    arr.slice().sort((a,b)=>String(a.dev)<String(b.dev)?-1:String(a.dev)>String(b.dev)?1:0).forEach((d,i)=>{if(i>0)d.label=d.name+' '+(i+1);});
  });
  return list;
}
function _devRowHtml(d){
  const S='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  return '<div class="sa-row sa-dev" data-dev="'+_devEsc(d.dev)+'" data-name="'+_devEsc(d.name)+'" data-me="'+(d.me?1:0)+'" onclick="onDeviceRowClick(event,this)" title="'+(d.me?'Sao lưu ngay':'Khôi phục từ máy này')+'">'
    +S+' class="sa-k"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'
    +'<span class="sa-txt"><span>'+_devEsc(d.label||d.name)+'</span><small>'+_devEsc(_devTimeText(d.ts))+'</small></span>'
    +'<span class="sa-mini sa-kebab" role="button" tabindex="0" aria-label="Tuỳ chọn" aria-haspopup="menu" onclick="toggleDevMenu(event,this)" onkeydown="if(event.key===\'Enter\'||event.key===\' \')toggleDevMenu(event,this)">'
    +'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></span></div>';
}
// refresh=true: liệt kê lại từ Drive (sau khi đổi tên/sao lưu); false: dùng cache 30s. "Bản cũ" (chỉ đọc) không hiện trong menu.
async function renderDevicesSubmenu(refresh){
  _ensureDevMenuCss();
  const box=document.getElementById('syncDevicesList');
  if(!box)return;
  if(_devUiBusy()){_devRenderPending=true;return;} // đang sửa tên máy: khoan vẽ lại để khỏi mất ô nhập
  const seq=++_devListSeq;
  const meRow={dev:getDeviceId(),name:getDeviceName(),ts:+localStorage.getItem(LS_AUTOSYNC_LAST)||0,me:true,legacy:false};
  if(!box.innerHTML)box.innerHTML=_devRowHtml(meRow);
  let list=null;
  try{
    if(!refresh&&_devListCache&&Date.now()-_devListAt<30000)list=_devListCache.map(d=>Object.assign({},d));
    else{list=await driveListDevices(true);_devListCache=list.map(d=>Object.assign({},d));_devListAt=Date.now();}
  }
  catch(e){if(_devUiBusy()){_devRenderPending=true;return;}if(seq===_devListSeq)box.innerHTML=_devRowHtml(meRow)+'<div class="sa-empty">'+_devEsc(_bt('Không đọc được danh sách: {x1}',{x1:((e&&e.message)||e)}))+'</div>';return;}
  if(seq!==_devListSeq)return;
  if(_devUiBusy()){_devRenderPending=true;return;}
  list=list.filter(d=>!d.legacy);
  {const mm=list.find(d=>d.me);if(mm)_adoptRemoteDeviceName(mm.name);meRow.name=getDeviceName();}
  if(!list.some(d=>d.me))list.unshift(meRow);
  else{const m=list.find(d=>d.me);m.name=getDeviceName();m.ts=Math.max(m.ts||0,meRow.ts);}
  _devLabelize(list);
  box.innerHTML=list.map(_devRowHtml).join('');
}
function onDeviceRowClick(e,row){
  if(e)e.stopPropagation();
  if(row.classList.contains('is-editing'))return;
  if(e&&e.target.closest&&e.target.closest('.sa-kebab'))return;
  const dev=row.getAttribute('data-dev'),me=row.getAttribute('data-me')==='1';
  if(me){
    if(_autoSyncRunning)return;
    Promise.resolve(autoSyncNow({flush:true})).then(()=>renderDevicesSubmenu(true));
  }else{
    closeSyncMenu();
    restoreFromDevice(dev);
  }
}
// Đổi tên bất kỳ máy nào trong danh sách — sửa NGAY TRÊN DÒNG (giống sửa tên truyện ở tủ truyện):
// ẩn tên máy + giờ sao lưu + 2 nút cũ, hiện ô nhập + nút Lưu (✓) / Huỷ (✕). Enter/✓/bấm ra ngoài = lưu, Esc/✕ = huỷ.
//  - Máy này: lưu local rồi ép 1 lượt sao lưu để tên mới lên Drive. Để trống = quay về tên tự động.
//  - Máy khác: ghi thẳng tên lên Drive (appProperties). Để trống = huỷ sửa.
let _devRenderPending=false; // có lượt vẽ lại danh sách bị hoãn vì đang sửa tên
function _devEditingRow(){return document.querySelector('#syncDevicesList .sa-dev.is-editing');}
function _devEditEnd(row,newName){
  if(!row)return;
  row.classList.remove('is-editing'); // gỡ class TRƯỚC khi xoá input để blur không kích hoạt lưu lần 2
  row.querySelectorAll('.sa-edit-in').forEach(x=>x.remove());
  if(row._devTitle!=null){row.title=row._devTitle;row._devTitle=null;}
  if(newName!=null){const sp=row.querySelector('.sa-txt>span');if(sp)sp.textContent=newName;}
  else if(_devRenderPending){_devRenderPending=false;renderDevicesSubmenu(false);}
}
async function _devEditSave(row){
  if(!row||!row.classList.contains('is-editing'))return;
  const inp=row.querySelector('.sa-edit-input');
  const name=String(inp?inp.value:'').trim().slice(0,40);
  const me=row.getAttribute('data-me')==='1',dev=row.getAttribute('data-dev'),cur=row._devCur||'';
  if(me){
    const finalName=name||autoDeviceName();
    if(finalName===cur){_devEditEnd(row);return;}
    _devEditEnd(row,finalName);_devRenderPending=false;
    setDeviceName(name);
    // Ép 1 lượt sao lưu để tên mới lên Drive (appProperties của manifest) rồi vẽ lại danh sách.
    try{if(isDriveLoggedIn()&&!_autoSyncRunning&&!_restoring)await autoSyncNow({flush:true});}catch(e2){}
    renderDevicesSubmenu(true);
    return;
  }
  if(!name||name===cur){_devEditEnd(row);return;}
  _devEditEnd(row,name);_devRenderPending=false;
  try{await driveSetDeviceName(dev,name);}
  catch(err){setStatus(_bt('Lỗi đổi tên máy: {x1}',{x1:((err&&err.message)||err)}),5000);}
  renderDevicesSubmenu(true);
}
// ===== Menu 3 chấm của dòng thiết bị (giống menu 3 chấm của Tủ truyện) =====
// Gom "Đổi tên" + "Xoá bản sao lưu" vào 1 menu. Menu gắn vào <body> (position:fixed) để không bị panel Cài đặt cắt/che.
// Desktop: nút 3 chấm chỉ hiện khi rê chuột vào dòng (CSS ở index.html); mobile luôn hiện.
// CSS dự phòng cho menu: bình thường nằm ở index.html (.sa-dev-menu). Nếu trang đang chạy là bản index CŨ / bản /en/ chưa build lại
// (JS mới nhưng CSS chưa có) thì menu sẽ hiện thành nút trơn ở cuối trang → tự chèn CSS này để menu luôn đúng hình dạng.
const _DEV_MENU_CSS='.sa-dev-menu{position:fixed;z-index:99995;display:flex;flex-direction:column;min-width:170px;padding:5px;background:transparent;border:0;border-radius:14px;box-shadow:var(--pnl-shadow,0 12px 32px rgba(0,0,0,.25)),0 0 0 1px var(--pnl-ring,rgba(128,128,128,.12));font-family:"Segoe UI",system-ui,-apple-system,sans-serif}'
  +'.sa-dev-menu>*+*{margin-top:1px}'
  +'.sa-dev-menu::before{content:"";position:absolute;top:0;right:0;bottom:0;left:0;z-index:-1;pointer-events:none;border-radius:inherit;background:var(--pnl-glass,var(--bg2,#222));-webkit-backdrop-filter:var(--pnl-blur,none);backdrop-filter:var(--pnl-blur,none)}'
  +'.sa-dev-menu button{display:flex;align-items:center;width:100%;height:36px;padding:0 11px;border:0;border-radius:9px;background:transparent;font-family:inherit;font-size:14px;font-weight:600;color:var(--text2,var(--text,#ccc));text-align:left;white-space:nowrap;cursor:pointer}'
  +'.sa-dev-menu button>*+*{margin-left:9px}.sa-dev-menu button svg{flex-shrink:0}'
  +'.sa-dev-menu button.danger{color:#e5484d}'
  +'.sa-dev-menu button:hover,.sa-dev-menu button:active{background:var(--pnl-hover,rgba(128,128,128,.14))}.sa-dev-menu button.danger:hover{background:rgba(229,72,77,.12)}'
  +'@media (pointer:coarse),(max-width:480px){.sa-dev-menu button{height:44px;font-size:15px}}'
  +'.sa-kebab.open{background:var(--btn-hover);color:var(--text)}'
  +'@media (hover:hover){.sa-dev:not(.is-editing) .sa-kebab{opacity:0;transition:opacity .12s}.sa-dev:hover .sa-kebab,.sa-dev .sa-kebab.open,.sa-dev .sa-kebab:focus-visible{opacity:1}}'
  // Ô sửa tên: bỏ vòng focus ngoài (rule #sdr input:focus-visible của Cài đặt vẽ outline 2px + offset); giữ viền accent 1px của chính ô.
  +'.sa-edit-input:focus,.sa-edit-input:focus-visible,#sdr .sa-edit-input:focus,#sdr .sa-edit-input:focus-visible,#pmodal .sa-edit-input:focus,#pmodal .sa-edit-input:focus-visible{outline:none!important;box-shadow:none!important}';
function _ensureDevMenuCss(){
  try{
    if(document.getElementById('saDevMenuCss'))return;
    const st=document.createElement('style');st.id='saDevMenuCss';st.textContent=_DEV_MENU_CSS;document.head.appendChild(st);
  }catch(e){}
}
// Bấm vào menu (nằm ngoài khung Cài đặt vì gắn vào <body>) KHÔNG được tính là "bấm ra ngoài" làm đóng Cài đặt.
// Listener đóng Cài đặt chạy ở pha capture trên document → chặn sớm hơn 1 bậc, ở window (capture đi từ window xuống).
window.addEventListener('pointerdown',function(e){
  const t=e.target;
  if(t&&t.closest&&t.closest('.sa-dev-menu'))e.stopPropagation();
},true);
let _devMenuEl=null,_devMenuBtn=null;
function _devUiBusy(){return !!(_devEditingRow()||_devMenuEl);}
function closeDevMenu(){
  if(!_devMenuEl)return;
  try{_devMenuEl.remove();}catch(e){}
  if(_devMenuBtn)_devMenuBtn.classList.remove('open');
  _devMenuEl=null;_devMenuBtn=null;
  document.removeEventListener('click',_devMenuOutside,true);
  document.removeEventListener('keydown',_devMenuKey,true);
  window.removeEventListener('resize',closeDevMenu);
  document.removeEventListener('scroll',_devMenuScroll,true);
  if(_devRenderPending&&!_devEditingRow()){_devRenderPending=false;renderDevicesSubmenu(false);}
}
function _devMenuOutside(e){
  if(_devMenuEl&&_devMenuEl.contains(e.target))return;
  if(_devMenuBtn&&_devMenuBtn.contains(e.target))return; // bấm lại đúng nút 3 chấm: để toggleDevMenu tự đóng
  closeDevMenu();
}
function _devMenuKey(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDevMenu();}}
function _devMenuScroll(e){if(_devMenuEl&&_devMenuEl.contains(e.target))return;closeDevMenu();}
function toggleDevMenu(e,btn){
  _ensureDevMenuCss();
  if(e){e.stopPropagation();e.preventDefault();}
  const wasThis=_devMenuBtn===btn;
  closeDevMenu();
  if(wasThis)return;
  const row=btn&&btn.closest?btn.closest('.sa-dev'):null;
  if(!row||row.classList.contains('is-editing'))return;
  const prev=_devEditingRow();if(prev)_devEditEnd(prev);
  const me=row.getAttribute('data-me')==='1',dev=row.getAttribute('data-dev');
  const S='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const items=[{
    label:_bt('Đổi tên'),
    ico:S+'><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    fn:()=>renameDevice(null,btn)
  }];
  if(!me&&_isDev(dev))items.push({ // máy này sẽ tự sao lưu lại ở lượt kế nên không cho xoá; "Bản cũ" chỉ đọc
    label:_bt('Xoá bản sao lưu'),danger:true,
    ico:S+'><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>',
    fn:()=>deleteDeviceBackup(null,btn)
  });
  const m=document.createElement('div');
  m.className='sa-dev-menu';m.setAttribute('role','menu');
  items.forEach(it=>{
    const b=document.createElement('button');
    b.type='button';b.setAttribute('role','menuitem');
    if(it.danger)b.className='danger';
    b.innerHTML=it.ico+'<span></span>';
    b.lastChild.textContent=it.label;
    b.addEventListener('click',ev=>{ev.stopPropagation();ev.preventDefault();closeDevMenu();it.fn();});
    m.appendChild(b);
  });
  m.addEventListener('click',ev=>ev.stopPropagation());
  m.style.visibility='hidden';
  document.body.appendChild(m);
  // Đặt vị trí: căn mép phải với nút 3 chấm, mở xuống dưới; không đủ chỗ thì lật lên trên; không tràn khỏi màn hình.
  const r=btn.getBoundingClientRect(),mw=m.offsetWidth,mh=m.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
  let left=Math.min(Math.max(8,r.right-mw),vw-mw-8),top=r.bottom+4;
  if(top+mh>vh-8)top=Math.max(8,r.top-mh-4);
  m.style.left=left+'px';m.style.top=top+'px';m.style.visibility='';
  btn.classList.add('open');
  _devMenuEl=m;_devMenuBtn=btn;
  document.addEventListener('click',_devMenuOutside,true);
  document.addEventListener('keydown',_devMenuKey,true);
  window.addEventListener('resize',closeDevMenu);
  document.addEventListener('scroll',_devMenuScroll,true);
}
// Xoá toàn bộ bản sao lưu của 1 MÁY KHÁC trên Drive (manifest + 2 bản xoay vòng + bookh-/books- của máy đó).
// Nội dung truyện theo hash (bookc-…) dùng chung giữa các máy nên KHÔNG xoá. Không áp dụng cho máy này / "Bản cũ".
async function deleteDeviceBackup(e,btn){
  if(e){e.stopPropagation();e.preventDefault();}
  const row=btn&&btn.closest?btn.closest('.sa-dev'):null;
  if(!row||row.classList.contains('is-editing')||row.getAttribute('data-me')==='1'||row.classList.contains('is-deleting'))return;
  const dev=row.getAttribute('data-dev');
  if(!_isDev(dev))return;
  const nm=row.getAttribute('data-name')||dev;
  if(!confirm(_bt('Bạn có muốn xoá bản sao lưu \"{x1}\" trên Drive không?',{x1:nm})))return;
  row.classList.add('is-deleting');row.style.opacity='.5';row.style.pointerEvents='none';
  try{
    setStatus(_bt('Đang xoá bản sao lưu của máy \"{x1}\"...',{x1:nm}));
    await driveDeleteDevice(dev);
    setStatus(_bt('Đã xoá bản sao lưu của máy \"{x1}\"',{x1:nm}),3500);
  }catch(err){
    setStatus(_bt('Lỗi xoá bản sao lưu máy: {x1}',{x1:((err&&err.message)||err)}),5000);
  }
  _devListCache=null;
  renderDevicesSubmenu(true);
}
function renameDevice(e,btn){
  if(e){e.stopPropagation();e.preventDefault();}
  const row=btn&&btn.closest?btn.closest('.sa-dev'):null;
  if(!row||row.classList.contains('is-editing'))return;
  const prev=_devEditingRow();if(prev)_devEditEnd(prev); // chỉ cho sửa 1 dòng cùng lúc
  const me=row.getAttribute('data-me')==='1';
  const nameEl=row.querySelector('.sa-txt>span'),txt=row.querySelector('.sa-txt');
  if(!txt)return;
  const cur=(row.getAttribute('data-name')||(nameEl?nameEl.textContent:'')).trim(); // tên GỐC (không kèm số thứ tự hiển thị)
  row._devCur=cur;row._devTitle=row.title;row.title='';
  const inp=document.createElement('input');
  inp.type='text';inp.className='sa-edit-input sa-edit-in';inp.maxLength=40;inp.value=cur;
  inp.placeholder=me?autoDeviceName():'Tên máy';
  inp.setAttribute('autocomplete','off');inp.setAttribute('spellcheck','false');inp.setAttribute('aria-label','Tên máy');
  inp.addEventListener('click',ev=>ev.stopPropagation());
  inp.addEventListener('keydown',ev=>{
    ev.stopPropagation(); // không để Esc đóng luôn cả menu
    if(ev.key==='Enter'){ev.preventDefault();_devEditSave(row);}
    else if(ev.key==='Escape'){ev.preventDefault();_devEditEnd(row);}
  });
  inp.addEventListener('blur',()=>_devEditSave(row));
  txt.appendChild(inp);
  const mk=(cls,title,svg,fn)=>{
    const b=document.createElement('span');
    b.className='sa-mini sa-edit-btn sa-edit-in '+cls;b.setAttribute('role','button');b.title=title;b.innerHTML=svg;
    b.addEventListener('mousedown',ev=>{ev.preventDefault();ev.stopPropagation();}); // giữ focus ở ô nhập, tránh blur lưu sớm
    b.addEventListener('click',ev=>{ev.stopPropagation();fn();});
    return b;
  };
  const S='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">';
  row.appendChild(mk('sa-ok','Xong',S+'<polyline points="20 6 9 17 4 12"/></svg>',()=>_devEditSave(row)));
  row.appendChild(mk('sa-danger','Huỷ',S+'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',()=>_devEditEnd(row)));
  row.classList.add('is-editing');
  inp.focus();inp.select();
}

function chooseBackupType(e,type){
  if(e)e.stopPropagation();
  closeSyncMenu();
  confirmBackupPopup(type);
}
function chooseRestoreType(e,type){
  if(e)e.stopPropagation();
  closeSyncMenu();
  confirmRestorePopup(type);
}

// Đăng nhập Google Drive từ menu avatar — dùng CHUNG ensureDriveToken() với luồng Sao lưu/Khôi
// phục/đồng bộ tự động (không viết trùng logic OAuth). Đăng nhập xong renderSyncAccountUI() sẽ tự
// ẩn "Đăng nhập" và hiện email (được gọi lại bên trong message listener của beginGoogleAuth rồi).
async function doDriveLogin(e){
  if(e)e.stopPropagation();
  closeSyncMenu();
  setStatus('Đang mở cửa sổ đăng nhập Google...');
  try{
    await ensureDriveToken();
    setStatus('Đăng nhập Google Drive thành công!',3000);
    // Đăng nhập xong: nếu công tắc "Đồng bộ hoá tự động" đang Bật thì đồng bộ NGAY (startAutoSyncLoop
    // tự gọi autoSyncNow() ngay rồi đặt lại mốc chu kỳ). Công tắc Tắt thì không đồng bộ gì cả.
    if(isAutoSyncOn())startAutoSyncLoop();
  }catch(err){
    setStatus(_bt('Đăng nhập thất bại: {x1}',{x1:err.message}),4500);
  }
}
// Đăng xuất — xoá refresh_token + email đã lưu, tắt luôn đồng bộ tự động (không còn đăng nhập thì
// không có gì để đồng bộ) rồi cập nhật lại menu avatar + khối cài đặt đồng bộ tự động.
function doDriveLogout(e){
  if(e)e.stopPropagation();
  closeSyncMenu();
  setStoredRefreshToken('');
  setStoredDriveEmail('');setStoredDrivePic('');
  _driveAccessToken=null;_driveTokenExpiry=0;
  stopAutoSyncLoop();
  try{localStorage.setItem(LS_AUTOSYNC,'0');}catch(err){}
  renderAutoSyncSwitch();
  renderSyncAccountUI();
  setStatus('Đã đăng xuất khỏi Google Drive.',3000);
}
// Cập nhật phần đăng nhập/tài khoản trong menu avatar — gọi mỗi lần mở menu (toggleSyncMenu),
// ngay sau khi đăng nhập/đăng xuất, và sau khi lấy được email lần đầu (fetchAndStoreDriveEmail()).
function renderSyncAccountUI(){
  const loggedIn=isDriveLoggedIn();
  const loginBtn=document.getElementById('syncLoginBtn');
  const acctWrap=document.getElementById('syncAccountWrap');
  if(loginBtn)loginBtn.style.display=loggedIn?'none':'';
  if(acctWrap)acctWrap.style.display=loggedIn?'':'none';
  const mw=document.getElementById('syncMenuWrap');
  if(mw)mw.classList.toggle('logged',loggedIn);
  // #syncMenu bị dời ra <body> khi mở nên không còn nằm trong #syncMenuWrap → bật class 'logged' trực tiếp trên menu để CSS đổi độ rộng (220px → 300px).
  const sm=document.getElementById('syncMenu');
  if(sm)sm.classList.toggle('logged',loggedIn);
  if(!loggedIn)return;
  const email=getStoredDriveEmail();
  const emailEl=document.getElementById('syncAccountEmail');
  if(emailEl)emailEl.textContent=email||'Đã đăng nhập';
  const notifyBtn=document.getElementById('syncNotifyUpdateBtn');
  if(notifyBtn)notifyBtn.style.display=isUpdateAdmin(email)?'':'none';
  const letter=document.getElementById('syncAvatarLetter'),pic=document.getElementById('syncAvatarPic');
  const url=getStoredDrivePic();
  if(letter)letter.textContent=url?'':((email||'?').charAt(0).toUpperCase());
  if(pic)pic.style.backgroundImage=url?'url("'+url.replace(/"/g,'%22')+'")':'';
  renderAutoSyncSwitch();
  syncAutoSyncIntervalSelects();
}

document.addEventListener('click',function(e){
  const wrap=document.getElementById('syncMenuWrap');
  if(wrap&&!wrap.contains(e.target)&&!e.target.closest('#syncMenu')&&!e.target.closest('.pc-menu'))closeSyncMenu();
});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSyncMenu();});
window.addEventListener('resize',function(){
  const a=document.activeElement;
  if(a&&a.classList&&a.classList.contains('sa-edit-input'))return; // bàn phím ảo bật lên cũng gây resize — đừng đóng menu lúc đang sửa tên máy
  closeSyncMenu();
});

// ===================================================================
// ĐỒNG BỘ HOÁ TỰ ĐỘNG — mục "Bật/Tắt đồng bộ hoá tự động" trong menu avatar.
//
// !!! BẢN 3.0 — ĐỔI TỪ "BACKUP 1 CHIỀU" (chỉ đẩy local → Drive) SANG "SYNC 2 CHIỀU CÓ MERGE" !!!
// Bản trước (2.0) mỗi lần chạy CHỈ đẩy sách/manifest của máy đang chạy lên Drive, không bao giờ
// tải gì về, và ghi đè NGUYÊN VẸN autosync-manifest.json bằng danh sách sách của riêng máy đó.
// Hậu quả: 2 thiết bị dùng cùng 1 tài khoản KHÔNG thấy tủ sách của nhau, và máy nào đồng bộ sau
// cùng sẽ xoá mất "tầm nhìn" (manifest) về sách của máy kia khỏi Drive (dù file book-<id>.json
// gốc không bị xoá, chỉ là không ai biết tới nữa).
//
// Cách mới — vẫn giữ nguyên kiến trúc "mỗi cuốn sách 1 file" (rẻ, không phải tải lại nguyên khối
// mỗi lần đổi 1 chữ), nhưng THÊM bước TẢI VỀ + MERGE theo timestamp mỗi lần đồng bộ:
//   book-<id>.json          Nội dung đầy đủ 1 cuốn (content, translations, variants, cur, ts...)
//   autosync-manifest.json  Cài đặt + danh sách sách (metadata, có "ts" = lúc NỘI DUNG đổi lần
//                            cuối) + sessions/bookmarks (fallback localStorage) + "tombstone"
//                            (nhật ký các sách đã bị xoá, kèm thời điểm xoá) + addrPairPresets
//                            (cặp xưng hô/từ cần tránh tuỳ chỉnh, state CHUNG mọi truyện — theo cơ
//                            chế "cả cụm settingsTs" giống ds/dt/presets) + addrStoryChoices (lựa
//                            chọn thể loại xưng hô RIÊNG theo từng truyện, merge theo "ts" từng
//                            truyện giống sessions/bookmarks — xem addr-presets.js).
//
// MỖI LẦN ĐỒNG BỘ (autoSyncNow), theo đúng thứ tự:
//   0) Tải manifest hiện có trên Drive (nếu có) — để biết trạng thái các máy khác.
//   1) Hợp nhất "tombstone" (sách đã xoá) 2 chiều; áp tombstone MỚI HƠN vào máy này (xoá cục bộ
//      nếu sách đó đã bị xoá ở máy khác SAU lần sửa cuối mà máy này biết).
//   2) Tải về những sách: chưa có ở máy này, HOẶC bản trên Drive có "ts" MỚI HƠN bản cục bộ (ai
//      sửa sau thì thắng — so theo "ts" thật của nội dung, không phải "máy nào đồng bộ sau").
//   3) Đẩy lên những sách: cục bộ đang "dirty" (mới sửa) VÀ bản cục bộ không cũ hơn bản trên
//      Drive (nếu lỡ có xung đột — cùng sửa gần như đồng thời ở 2 máy — máy có "ts" nhỏ hơn sẽ
//      NHƯỜNG, tự tải bản mới hơn về ở bước 2 thay vì ghi đè nhầm).
//   4) Xoá trên Drive các sách đã xoá ở máy này (và ghi tombstone để máy khác biết mà xoá theo).
//   5) Merge lại "library" trong manifest (không ghi đè toàn bộ) + merge sessions/bookmarks theo
//      "ts" từng key, rồi mới ghi đè manifest (manifest bản thân nó luôn phải ghi đè vì Drive
//      không hỗ trợ merge JSON — nhưng NỘI DUNG ghi vào là bản đã hợp nhất, không phải chỉ của
///     riêng máy này).
//
// GIỚI HẠN CÒN LẠI (cần biết): id mỗi sách được sinh ngẫu nhiên riêng theo từng máy lúc thêm mới
// (xem libAddNew() trong index.html: 'bk-'+Date.now()+'-'+random). Nghĩa là nếu bạn THÊM ĐỘC LẬP
// cùng 1 truyện ở 2 máy khác nhau (không phải do đồng bộ mà có), 2 bản đó sẽ có 2 id khác nhau —
// hệ thống KHÔNG tự nhận ra đó là "cùng 1 truyện" để gộp lại (cố tình không tự gộp theo tên, vì
// dễ gộp nhầm 2 truyện trùng tên nhưng khác nội dung). Trường hợp này 2 bản sẽ tồn tại song song
// như 2 mục riêng trong tủ truyện của cả 2 máy sau khi đồng bộ.
// ===================================================================
const LS_AUTOSYNC='dich-autosync';
const LS_AUTOSYNC_LAST='dich-autosync-last';
const LS_AUTOSYNC_INTERVAL='dich-autosync-interval'; // khoảng thời gian đồng bộ (ms) — chọn ở
                                                      // #autoSyncIntervalSelect trong khung Cài đặt
const LS_AUTOSYNC_DIRTY='dich-autosync-dirty';         // JSON array id các sách CẦN tải lên lại
const LS_AUTOSYNC_DELETED='dich-autosync-deleted';     // JSON array id các sách CẦN xoá trên Drive (hàng đợi, xoá xong khỏi đây)
const LS_AUTOSYNC_TOMBSTONES='dich-autosync-tombstones'; // {id: deletedAtMs} — KHÔNG xoá khỏi đây, để báo mãi cho máy khác biết
const LS_AUTOSYNC_INITED='dich-autosync-inited';       // '1' = đã từng đẩy đủ 1 lượt toàn bộ (riêng máy này)
const AUTOSYNC_MANIFEST_FILENAME='autosync-manifest.json.gz';
const AUTOSYNC_MANIFEST_FILENAME_LEGACY='autosync-manifest.json'; // tên cũ (chưa nén) — chỉ để ĐỌC khi chưa có bản .gz
const AUTOSYNC_INTERVAL_MS_DEFAULT=30*1000; // 30 giây — dùng khi chưa từng chọn gì ở dropdown
// Đọc khoảng thời gian đồng bộ đã chọn (ms) — fallback về mặc định nếu chưa lưu hoặc giá trị hỏng.
function getAutoSyncIntervalMs(){
  const v=parseInt(localStorage.getItem(LS_AUTOSYNC_INTERVAL)||'',10);
  return (v>0)?v:AUTOSYNC_INTERVAL_MS_DEFAULT;
}
let _autoSyncTimer=null;
let _autoSyncRunning=false;
let _syncLibTouched=false; // true = lượt đồng bộ này đã ghi/xoá sách ở máy này → phải vẽ lại tủ truyện (kể cả khi lượt đó lỗi giữa chừng)
let _manifestCaches=new Map(); // tên file manifest -> {md5,data} (chỉ trong RAM) — md5 không đổi thì khỏi tải lại
let _lastManifestSig=null; // chữ ký manifest MÁY NÀY đã đẩy lần gần nhất — giống thì khỏi đẩy lại
let _myManifestMd5=null;   // md5 file manifest của máy này ngay sau lần đẩy gần nhất

// ===== MỖI THIẾT BỊ 1 FILE MANIFEST RIÊNG (chống ghi đè nhau khi 2 máy đồng bộ cùng lúc) =====
// Trước đây mọi máy cùng ghi đè 1 file autosync-manifest.json.gz: 2 máy đọc cùng lúc rồi ghi lần lượt thì
// máy ghi sau xoá mất phần của máy ghi trước. Giờ mỗi máy CHỈ ghi autosync-manifest-<deviceId>.json.gz của
// riêng nó; khi đồng bộ thì ĐỌC hết các file manifest (của mọi máy + file chung cũ nếu còn) rồi GỘP (mergeManifests).
// Máy nào cũng ghi bản đã gộp đầy đủ vào file của mình, nên các file hội tụ dần về cùng 1 nội dung.
const LS_DEVICE_ID='dich-device-id';
const MANIFEST_DEVICE_RE=/^autosync-manifest-[A-Za-z0-9]+\.json\.gz$/;
const MANIFEST_STALE_MS=365*86400000; // file manifest của máy không sao lưu >365 ngày thì được dọn
let _deviceIdMem='';
function getDeviceId(){
  if(_deviceIdMem)return _deviceIdMem;
  let v='';try{v=localStorage.getItem(LS_DEVICE_ID)||'';}catch(e){}
  if(!/^[a-z0-9]{6,32}$/.test(v)){
    v=(Math.random().toString(36).slice(2,8)+Date.now().toString(36)+Math.random().toString(36).slice(2,6)).slice(0,20);
    try{localStorage.setItem(LS_DEVICE_ID,v);}catch(e){}
  }
  _deviceIdMem=v;
  return v;
}
function isLegacyManifestName(nm){return nm===AUTOSYNC_MANIFEST_FILENAME||nm===AUTOSYNC_MANIFEST_FILENAME_LEGACY||MANIFEST_DEVICE_RE.test(nm);}

// ===== "settingsTs" — mốc thời gian DUY NHẤT cho CẢ CỤM cài đặt/preset/etRules =====
// Cách 1 (đơn giản, không merge từng trường): mỗi khi BẤT KỲ trường nào trong cụm cài đặt
// đổi (localStorage 'ds'/'dt'/'dich-auto'/'dich-presets'/'dich-preset-active'/'dich-et-rules'/'dich-et-sort'/
// 'addrPairPresetsGlobalV5' — cặp xưng hô + từ cần tránh tuỳ chỉnh trong popup "Xưng hô thường
// gặp", xem addr-presets.js), cập nhật LUÔN mốc LS_SETTINGS_TS='dich-settings-ts'=Date.now(). Lúc
// đồng bộ, so mốc này với
// mốc trên Drive: bên nào MỚI HƠN thì CẢ CỤM của bên đó thắng (không so/merge từng trường riêng
// lẻ — chấp nhận rủi ro thấp: nếu 2 máy cùng sửa 2 trường KHÁC NHAU gần như đồng thời, máy sửa
// sau sẽ ghi đè luôn trường mà máy kia vừa đổi, dù về logic 2 thay đổi đó không hề xung đột thật
// sự — đánh đổi lấy sự đơn giản, vì mỗi trường không có "ts" riêng để so).

function bookSyncFilename(id){return 'book-'+id+'.json.gz';}
function bookSyncFilenameLegacy(id){return 'book-'+id+'.json';} // tên cũ (chưa nén)
// Tìm file sách trên Drive: ưu tiên bản .gz mới, không có thì dùng bản cũ chưa nén (chưa kịp chuyển).
async function driveFindBookFileId(id){
  return (await driveFindFileIdByName(bookSyncFilename(id)))||(await driveFindFileIdByName(bookSyncFilenameLegacy(id)));
}
// Bỏ các trường PHẲNG trùng lặp trước khi đẩy lên Drive: khi record đã có variants thì
// translations/translatedTitles/audited ở gốc chỉ là bản sao của variants[key] (libOpen chỉ đọc
// variants[key]; trường phẳng chỉ dùng cho record cũ CHƯA có variants). KHÔNG sửa record gốc trong IndexedDB.
function slimForDrive(bk){
  if(!bk||!bk.variants||!Object.keys(bk.variants).length)return bk;
  bk=absorbFlat(bk); // trường phẳng có chương mà mọi variant không có → cất vào variant TRƯỚC khi bỏ (không để rơi bản dịch)
  const o=Object.assign({},bk);
  delete o.translations;delete o.translatedTitles;delete o.audited;
  return o;
}
// ----- Đếm / chọn variant theo SỐ CHƯƠNG DỊCH (không theo ts: ts đổi cả khi chỉ mở đọc, variant rỗng mới mở sẽ có ts lớn nhất) -----
function _cntObj(t){if(!t||typeof t!=='object')return 0;let n=0;for(const k in t)if(t[k])n++;return n;}
function _cntV(v){return v?_cntObj(v.translations):0;}
function bestVariantKey(bk){
  if(!bk||!bk.variants)return null;
  let bestK=null,bestN=-1,bestTs=-1;
  for(const k of Object.keys(bk.variants)){
    const v=bk.variants[k],n=_cntV(v),t=(v&&v.ts)||0;
    if(n>bestN||(n===bestN&&t>bestTs)){bestK=k;bestN=n;bestTs=t;}
  }
  return bestK;
}
function _settingsVariantKey(bk){
  try{if(typeof splitConfigKey==='function'&&typeof getST==='function')return splitConfigKey(getST()==='chars',(bk&&bk.splitCfg)||(typeof SPLIT_CFG_LEGACY!=='undefined'?SPLIT_CFG_LEGACY:null));}catch(e){}
  return 'flat|legacy';
}
// Record có trường phẳng (translations ở gốc) NHIỀU chương hơn mọi variant → bản dịch chỉ nằm ở trường phẳng. Trả bản sao nông
// đã cất trường phẳng đó thành 1 variant (không sửa record gốc). Nếu variants đã đủ thì trả nguyên record.
function absorbFlat(bk){
  if(!bk)return bk;
  const fn=_cntObj(bk.translations);
  if(!fn)return bk;
  const vs=bk.variants||{};
  let mx=0;for(const k of Object.keys(vs))mx=Math.max(mx,_cntV(vs[k]));
  if(mx>=fn)return bk;
  const o=Object.assign({},bk);o.variants=Object.assign({},vs);
  const fv={translations:bk.translations,translatedTitles:bk.translatedTitles||{},audited:bk.audited||{},cur:bk.cur!=null?bk.cur:-1,chapterTitles:bk.chapterTitles||null,ts:bk.ts||0};
  const key=_settingsVariantKey(bk);
  if(!o.variants[key]||!_cntV(o.variants[key]))o.variants[key]=fv;else o.variants[key+'|flat']=fv;
  return o;
}
// Sách tải về từ Drive đã bị bỏ trường phẳng (xem slimForDrive) → dựng lại từ biến thể dùng gần nhất
// (ts lớn nhất) để record trên máy này giống hệt kiểu saveSession() vẫn ghi (tương thích nơi còn đọc
// trực tiếp bk.translations). Chỉ gán tham chiếu, không sao chép.
// ===== BƯỚC 2: tách nội dung gốc + so hash để bỏ qua upload/tải thừa =====
// Trên Drive mỗi sách giờ gồm:
//   bookc-<id>.json.gz  {id,h,content}  nội dung gốc (gần như bất biến) — upload khi đổi, hash nằm cả trong appProperties.h
//   bookt-<id>.json.gz  bản ghi sách KHÔNG có content + cH (hash content) — bản dịch/variants/vị trí đọc
// Manifest thêm vào mỗi mục sách: h (hash "trạng thái bản dịch", KHÔNG gồm vị trí đọc) và pk (khoá variant của vị trí đọc).
// Nhờ đó: chỉ đổi vị trí đọc → không upload/tải cả sách; đổi bản dịch → không động tới content.
// Tên mới (bookt-/bookc-) khác tên Bước 1 (book-<id>.json.gz) để máy chạy bản cũ không đọc nhầm bản ghi thiếu content.
function bookTransFilename(id){return 'bookt-'+id+'.json.gz';}
function bookContentFilename(id){return 'bookc-'+id+'.json.gz';}
const LS_AUTOSYNC_BASEH='dich-autosync-baseh'; // {id: h} — trạng thái bản dịch ở lần đồng bộ thành công gần nhất của MÁY NÀY
// Hash chuỗi nhanh, đồng bộ, kết quả giống nhau trên mọi thiết bị (cyrb53 + độ dài) — không phụ thuộc crypto.subtle
// (không có trên http thường). Chỉ dùng để phát hiện "có đổi hay không", không phải bảo mật.
function hashStr(s){
  let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36)+'.'+s.length.toString(36);
}
// Khoá variant dùng gần nhất (ts lớn nhất) — chính là variant mà vị trí đọc hiện tại thuộc về.
function latestVariantKey(bk){
  if(!bk||!bk.variants)return null;
  let bestK=null,bestTs=-1;
  for(const k of Object.keys(bk.variants)){const v=bk.variants[k];const t=(v&&v.ts)||0;if(t>bestTs){bestTs=t;bestK=k;}}
  return bestK;
}
// Hash "trạng thái sách" (bản dịch + hash content): bỏ content thô, trường phẳng trùng, và MỌI trường chỉ là vị trí đọc/thời điểm
// (cur, lastOpen, ts — cả ở gốc lẫn trong từng variant). Chỉ đổi vị trí đọc → hash KHÔNG đổi.
function stateHash(bk){
  const o=Object.assign({},slimForDrive(bk));
  delete o.content;delete o.cH;delete o.cur;delete o.lastOpen;delete o.ts;
  // Nội dung gốc đổi (vd "Cập nhật truyện cũ") cũng phải làm đổi hash để được đồng bộ — gộp hash content vào.
  if(typeof bk.content==='string')o.cH=hashStr(bk.content);
  if(o.variants){
    const vs={};
    for(const k of Object.keys(o.variants)){const v=Object.assign({},o.variants[k]);delete v.cur;delete v.ts;vs[k]=v;}
    o.variants=vs;
  }
  return hashStr(JSON.stringify(o));
}
// Sửa dữ liệu hỏng do lỗi trên: xoá mốc baseH 1 lần để mỗi sách được so lại hash với Drive (khác → tải về + gộp theo chương).
// ===== BƯỚC 3: chia bản dịch thành shard (mỗi shard BOOK_SHARD_SIZE chương) =====
// Với mỗi variant có NHIỀU hơn BOOK_SHARD_SIZE chương, 3 trường nặng translations / translatedTitles / audited được
// tách ra các file shard, chia theo chỉ số chương (chương i -> shard floor(i/100)):
//   books-<id>-<hash khoá variant>-<n>.json.gz   {id,h,d:{translations?,translatedTitles?,audited?}}  — h cũng nằm trong appProperties.h
//   bookh-<id>.json.gz                            "đầu" sách: như bookt- của Bước 2 nhưng variant lớn chỉ còn metadata
//                                                 + shd:{fs:[trường có mặt], s:{n:hash shard}} (3 trường nặng được thay bằng 0 để giữ NGUYÊN thứ tự khoá)
// Dịch thêm 1 chương -> chỉ shard chứa chương đó + bookh được đẩy/tải; shard khác không đụng tới.
// Tên bookh-/books- khác bookt- của Bước 2 để máy chạy bản cũ không đọc nhầm "đầu" thiếu bản dịch rồi ghi đè ngược lên.
// Variant ≤ BOOK_SHARD_SIZE chương, hoặc có khoá chương không phải số nguyên, hoặc trường nặng không phải object thường
// -> giữ nguyên trong bookh (không chia).
const BOOK_SHARD_SIZE=100;
const BOOK_SHARD_FIELDS=['translations','translatedTitles','audited'];
// ===== PHA 2: MỖI MÁY MỘT VÙNG RIÊNG TRÊN DRIVE =====
// dev = deviceId của máy sở hữu bản sao lưu; dev rỗng hoặc 'legacy' = dữ liệu CŨ dùng chung (bookh-<id>, books-<id>-…, bookc-<id>)
// — chỉ ĐỌC, không bao giờ ghi/xoá. Vùng riêng của máy: bookh-<dev>-<id>, books-<dev>-<id>-<hash>-<n>.
// Nội dung truyện đặt tên theo HASH (bookc-<id>-<cH>) → bất biến, các máy dùng chung, không tốn dung lượng N lần.
const LEGACY_DEV='legacy';
function _isDev(dev){return !!dev&&dev!==LEGACY_DEV;}
function bookHeadFilename(id,dev){return _isDev(dev)?'bookh-'+dev+'-'+id+'.json.gz':'bookh-'+id+'.json.gz';}
function bookShardFilename(id,vk,n,dev){
  return 'books-'+(_isDev(dev)?dev+'-':'')+id+'-'+hashStr(vk).replace('.','_')+'-'+n+'.json.gz';
}
// Tên file nội dung: máy mới -> theo hash (dùng chung); bản cũ -> bookc-<id>.json.gz
function bookContentFilenameDev(id,cH,dev){
  return (_isDev(dev)&&cH)?'bookc-'+id+'-'+String(cH).replace('.','_')+'.json.gz':bookContentFilename(id);
}
// Tên file có phải shard của sách id (thuộc vùng dev) không (kiểm tra cả phần đuôi để id này không nuốt nhầm shard của id khác có tiền tố giống).
function isBookShardOf(id,name,dev){
  const pre='books-'+(_isDev(dev)?dev+'-':'')+id+'-';
  return name.startsWith(pre)&&/^[0-9a-z_]+-\d+\.json\.gz$/.test(name.slice(pre.length));
}
// Chia 1 variant thành các shard. Trả null nếu KHÔNG nên/không thể chia (xem điều kiện ở trên).
// minKeys: chỉ chia khi tổng số chương (hợp 3 trường) > minKeys (truyền -1 để bỏ ngưỡng — dùng khi chỉ muốn tính hash shard cục bộ).
// Kết quả xác định (shard sắp theo n, trường theo BOOK_SHARD_FIELDS) nên hash giống nhau trên mọi thiết bị.
function splitVariantShards(v,minKeys){
  if(!v||typeof v!=='object')return null;
  const fs=[],keys=new Set();
  for(const f of BOOK_SHARD_FIELDS){
    if(!Object.prototype.hasOwnProperty.call(v,f))continue;
    const o=v[f];
    if(!o||typeof o!=='object'||Array.isArray(o))return null;
    for(const k of Object.keys(o)){if(!/^(0|[1-9]\d*)$/.test(k))return null;keys.add(k);}
    fs.push(f);
  }
  if(!fs.length||keys.size<=minKeys)return null;
  const tmp=new Map();
  for(const f of fs){
    const o=v[f];
    for(const k of Object.keys(o)){
      const n=Math.floor(+k/BOOK_SHARD_SIZE);
      let sh=tmp.get(n);if(!sh){sh={};tmp.set(n,sh);}
      (sh[f]||(sh[f]={}))[k]=o[k];
    }
  }
  const shards=new Map();
  for(const n of Array.from(tmp.keys()).sort((x,y)=>x-y)){
    const sh=tmp.get(n),o={};
    for(const f of fs)if(sh[f])o[f]=sh[f];
    shards.set(n,{sh:o,h:hashStr(JSON.stringify(o))});
  }
  return {fs,shards};
}
// Đẩy 1 sách theo kiểu tách: content CHỈ khi hash khác bản trên Drive; shard bản dịch CHỈ shard nào hash khác; "đầu" luôn đẩy (nhỏ).
// Thứ tự: content -> shard -> đầu (đầu cuối cùng; nếu hỏng giữa chừng thì đầu cũ còn nguyên, lần sau làm lại).
// Danh sách {name,h} các file (content, shard, đầu) của LẦN đẩy sách gần nhất — để autoSyncNow đọc lại Drive xác nhận
// file của mình chưa bị máy khác ghi đè (xem verifyBookUploads).
let _lastBookUpload=[];
async function driveUploadBookSplit(bk,lhKnown,dev){
  dev=dev||getDeviceId(); // mặc định: vùng của máy này
  if(!_isDev(dev))throw new Error('Không được ghi vào vùng dữ liệu cũ (chỉ đọc)');
  const id=bk.id;
  _lastBookUpload=[];
  const lh=lhKnown||stateHash(bk);
  const o=Object.assign({},slimForDrive(bk));
  if(typeof bk.content==='string'){
    const cH=hashStr(bk.content);
    const cn=bookContentFilenameDev(id,cH,dev);
    const ce=_driveFileMap&&_driveFileMap.get(cn);
    if(!ce)await driveUpsertJSON(cn,{id,h:cH,content:bk.content},{h:cH}); // tên theo hash: đã có file = đúng nội dung, khỏi đẩy
    _lastBookUpload.push({name:cn,h:cH});
    delete o.content;o.cH=cH;
  } // else: không có content dạng chuỗi (bất thường) → gửi nguyên, không tách content
  const shardFiles=[];
  if(o.variants){
    const nv={};
    for(const k of Object.keys(o.variants)){
      const v=o.variants[k];
      const sp=splitVariantShards(v,BOOK_SHARD_SIZE);
      if(!sp){nv[k]=v;continue;}
      const head=Object.assign({},v); // gán lại khoá ĐÃ CÓ nên vị trí khoá giữ nguyên → hash trạng thái sau khi ráp lại vẫn y hệt
      for(const f of sp.fs)head[f]=0;
      const s={};
      for(const [n,e] of sp.shards){
        s[n]=e.h;
        shardFiles.push({name:bookShardFilename(id,k,n,dev),body:{id,h:e.h,d:e.sh},h:e.h});
      }
      head.shd={fs:sp.fs,s};
      nv[k]=head;
    }
    o.variants=nv;
  }
  for(const f of shardFiles){
    const ex=_driveFileMap&&_driveFileMap.get(f.name);
    if(!ex||ex.h!==f.h)await driveUpsertJSON(f.name,f.body,{h:f.h});
    _lastBookUpload.push({name:f.name,h:f.h});
  }
  await driveUpsertJSON(bookHeadFilename(id,dev),o,{h:lh}); // h ở appProperties → đọc lại được qua files.list, khỏi tải file
  _lastBookUpload.push({name:bookHeadFilename(id,dev),h:lh});
  if(_driveFileMap){
    // Dọn shard mồ côi của sách này (variant đã xoá / không còn chia / chương bị xoá hết shard đó).
    const keep=new Set(shardFiles.map(f=>f.name));
    for(const nm of Array.from(_driveFileMap.keys())){
      if(isBookShardOf(id,nm,dev)&&!keep.has(nm)){
        const e=_driveFileMap.get(nm);
        if(e)await driveDeleteFile(e.id).catch(()=>{});
      }
    }
    // (Pha 2: KHÔNG đụng tới file cũ dùng chung bookt-/bookh-<id> — đó là vùng "Bản cũ", chỉ đọc.)
  }
  return lh;
}
// Ráp lại các trường nặng của variant từ shard. Shard máy này ĐÃ có (hash khớp) thì dùng lại, KHÔNG tải.
// Thiếu file / hash không khớp (máy kia đang đẩy dở) -> throw, lượt đồng bộ sau thử lại.
async function rebuildBookShards(id,t,getLocal,dev){
  if(!t||!t.variants)return;
  for(const k of Object.keys(t.variants)){
    const v=t.variants[k];
    if(!v||!v.shd)continue;
    const shd=v.shd;delete v.shd;
    const lbk=await getLocal();
    const lv=lbk&&lbk.variants&&lbk.variants[k];
    const ls=lv?splitVariantShards(lv,-1):null;
    for(const f of shd.fs)v[f]={};
    const nsList=Object.keys(shd.s).sort((x,y)=>x-y);
    const datas=new Array(nsList.length);
    const getShard=async(idx)=>{
      const ns=nsList[idx],want=shd.s[ns];
      const le=ls&&ls.shards.get(+ns);
      if(le&&le.h===want){datas[idx]=le.sh;RestoreToast.tick();return;}
      const fid=await driveFindFileIdByName(bookShardFilename(id,k,ns,dev));
      if(!fid)throw new Error('Thiếu file bản dịch (shard) trên Drive');
      const d=await driveDownloadJSON(fid);
      if(!d||d.h!==want||!d.d)throw new Error('File bản dịch (shard) chưa khớp (đang đồng bộ dở) — thử lại sau');
      datas[idx]=d.d;RestoreToast.tick();
    };
    RestoreToast.shards(nsList.length);
    { // tải tối đa 6 shard cùng lúc (trước đây tải lần lượt từng file nên truyện dài mất rất lâu)
      let next=0;
      const worker=async()=>{while(next<nsList.length){const i=next++;await getShard(i);}};
      await Promise.all(Array.from({length:Math.min(6,nsList.length)},worker));
    }
    for(let i=0;i<nsList.length;i++){const data=datas[i];for(const f of shd.fs)if(data[f])Object.assign(v[f],data[f]);} // ráp theo đúng thứ tự shard
  }
}
// Tải 1 sách từ Drive thành record đầy đủ. Ưu tiên bookh- (Bước 3), rồi bookt- (Bước 2), rồi bản đầy đủ cũ
// (Bước 1 / chưa nén). Nội dung gốc và shard bản dịch máy này đã có (hash khớp) thì dùng lại, KHÔNG tải.
// dev: máy nguồn (mặc định máy này); 'legacy' = bản cũ dùng chung (chỉ đọc, có đường lui về bookt-/book-<id>).
async function driveFetchBook(id,hasLocal,dev){
  dev=dev||getDeviceId();
  let hfid=await driveFindFileIdByName(bookHeadFilename(id,dev));
  if(!hfid&&!_isDev(dev))hfid=await driveFindFileIdByName(bookTransFilename(id));
  if(!hfid&&_isDev(dev))return null; // máy này chưa từng sao lưu sách đó
  if(!hfid){
    const fid=await driveFindBookFileId(id);
    return fid?rehydrateFlat(await driveDownloadJSON(fid)):null;
  }
  const t=await driveDownloadJSON(hfid);
  let _loaded=false,_lbk=null;
  const getLocal=async()=>{if(!_loaded){_lbk=hasLocal?await libGet(id):null;_loaded=true;}return _lbk;};
  if(typeof t.cH==='string'&&typeof t.content!=='string'){
    let content=null;
    const lbk=await getLocal();
    if(lbk&&typeof lbk.content==='string'&&hashStr(lbk.content)===t.cH)content=lbk.content;
    if(content===null){
      const cfid=await driveFindFileIdByName(bookContentFilenameDev(id,t.cH,dev));
      if(!cfid)throw new Error('Thiếu file nội dung truyện trên Drive');
      const c=await driveDownloadJSON(cfid);
      if(c.h!==t.cH||typeof c.content!=='string')throw new Error('File nội dung chưa khớp bản dịch (đang đồng bộ dở) — thử lại sau');
      content=c.content;
    }
    t.content=content;
  }
  delete t.cH;
  await rebuildBookShards(id,t,getLocal,dev);
  return rehydrateFlat(t);
}

// ===== PHA 2: DANH SÁCH THIẾT BỊ + MANIFEST RIÊNG MỖI MÁY =====
// Manifest của máy: dev-<id>-manifest.json.gz ; 2 bản xoay vòng: dev-<id>-manifest.1.json.gz (trước đó), .2 (trước nữa).
// deviceName + ts nằm ở appProperties → 1 lần files.list (driveRefreshFileMap) là liệt kê được "Máy – giờ sao lưu", không tải file nào.
const LS_DEVICE_NAME='dich-device-name';
const DEV_MANIFEST_RE=/^dev-([a-z0-9]+)-manifest\.json\.gz$/;
const MANIFEST_KEEP=3; // bản hiện tại + 2 bản xoay vòng
function devManifestFilename(dev,slot){return 'dev-'+dev+'-manifest'+(slot?'.'+slot:'')+'.json.gz';}
function myManifestFilename(){return devManifestFilename(getDeviceId());}
// Tên máy mặc định lấy từ trình duyệt + hệ điều hành, vd "Chrome · Windows" (người dùng đổi được).
// Tên máy tự động = "Trình duyệt · Loại máy", loại máy đo theo KÍCH THƯỚC MÀN HÌNH (cạnh ngắn của screen, px CSS —
// không phụ thuộc cửa sổ trình duyệt co/giãn hay xoay ngang/dọc): < 600 → "Mobile"; >= 600 và màn cảm ứng chính
// (không hover) → "Tablet"; còn lại → "PC".
function autoDeviceType(){
  let w=0,h=0,coarse=false;
  try{w=+screen.width||0;h=+screen.height||0;}catch(e){}
  if(!w||!h){w=window.innerWidth||0;h=window.innerHeight||0;}
  try{coarse=!!(window.matchMedia&&window.matchMedia('(hover:none) and (pointer:coarse)').matches);}catch(e){}
  const short=Math.min(w,h);
  if(short&&short<600)return 'Mobile';
  return coarse?'Tablet':'PC';
}
function autoDeviceName(){
  const ua=(typeof navigator!=='undefined'&&navigator.userAgent)||'';
  const br=/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Trình duyệt';
  return br+' · '+autoDeviceType();
}
function getDeviceName(){
  let v='';try{v=(localStorage.getItem(LS_DEVICE_NAME)||'').trim();}catch(e){}
  return v||autoDeviceName();
}
function setDeviceName(name){
  const v=String(name||'').trim().slice(0,40);
  try{if(v)localStorage.setItem(LS_DEVICE_NAME,v);else localStorage.removeItem(LS_DEVICE_NAME);}catch(e){}
  return getDeviceName();
}
// Tên máy nằm ở appProperties.deviceName của manifest từng máy. Máy này đổi tên MÁY KHÁC bằng cách ghi thẳng appProperties đó
// (không đụng nội dung). Để máy kia không ghi đè lại tên cũ ở lần sao lưu kế, mỗi máy nhớ tên đã đồng bộ lần cuối
// (LS_DEVICE_NAME_SYNCED): nếu tên trên Drive đã khác mà tên local chưa bị sửa → nhận tên từ Drive; nếu local vừa sửa → local thắng.
const LS_DEVICE_NAME_SYNCED='dich-device-name-synced';
function _adoptRemoteDeviceName(remote){
  remote=String(remote||'').trim();
  if(!remote)return;
  let synced='';try{synced=localStorage.getItem(LS_DEVICE_NAME_SYNCED)||'';}catch(e){}
  if(remote!==synced&&getDeviceName()===synced)setDeviceName(remote);
}
function _markDeviceNameSynced(){try{localStorage.setItem(LS_DEVICE_NAME_SYNCED,getDeviceName());}catch(e){}}
async function driveSetDeviceName(dev,name){
  if(!_driveFileMap)await driveRefreshFileMap();
  const e=_driveFileMap.get(devManifestFilename(dev));
  if(!e)throw new Error('Không thấy file của máy này trên Drive');
  const token=await ensureDriveToken();
  const res=await fetch('https://www.googleapis.com/drive/v3/files/'+e.id+'?fields=id',{
    method:'PATCH',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({appProperties:{deviceName:name}})
  });
  if(!res.ok)throw new Error(_bt('Không đổi được tên máy trên Drive (HTTP {x1})',{x1:res.status}));
  e.p=Object.assign({},e.p,{deviceName:name});
}
async function driveRenameFile(fileId,newName){
  const token=await ensureDriveToken();
  const res=await fetch('https://www.googleapis.com/drive/v3/files/'+fileId+'?fields=id',{
    method:'PATCH',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:newName})
  });
  if(!res.ok&&res.status!==404)throw new Error(_bt('Không đổi được tên file trên Drive (HTTP {x1})',{x1:res.status}));
  return res.ok;
}
// Liệt kê các nguồn sao lưu trên Drive từ _driveFileMap (gọi driveRefreshFileMap() trước nếu cần).
// Trả [{dev,name,ts,me,legacy}] — máy này đứng đầu, rồi theo ts giảm dần; "Bản cũ" (nếu còn dữ liệu cũ) đứng cuối.
async function driveListDevices(refresh){
  if(refresh||!_driveFileMap)await driveRefreshFileMap();
  const me=getDeviceId(),out=[];let legacyTs=0,hasLegacy=false;
  for(const [nm,e] of _driveFileMap){
    const m=DEV_MANIFEST_RE.exec(nm);
    if(m){
      const p=e.p||{};
      out.push({dev:m[1],name:p.deviceName||_bt('Máy {x1}',{x1:m[1].slice(0,4)}),ts:+p.ts||Date.parse(e.modifiedTime)||0,me:m[1]===me,legacy:false});
    }else if(isLegacyManifestName(nm)){
      hasLegacy=true;legacyTs=Math.max(legacyTs,Date.parse(e.modifiedTime)||0);
    }
  }
  out.sort((a,b)=>(b.me-a.me)||(b.ts-a.ts));
  if(hasLegacy)out.push({dev:LEGACY_DEV,name:'Bản cũ',ts:legacyTs,me:false,legacy:true});
  return out;
}
// Ghi manifest của máy này, xoay vòng giữ MANIFEST_KEEP bản (đổi tên file, không tải/tải lên lại nội dung cũ).
async function driveWriteMyManifest(manifest,opts){
  if(!_driveFileMap)await driveRefreshFileMap();
  const dev=getDeviceId(),cur=_driveFileMap.get(devManifestFilename(dev));
  const minRotateMs=(opts&&opts.minRotateMs)||0;
  // Bản hiện tại còn "mới" (< minRotateMs) → ghi đè tại chỗ, KHÔNG xoay: để 3 bản lịch sử trải rộng theo thời gian chứ không dồn trong vài phút.
  if(cur&&minRotateMs&&(Date.now()-(+(cur.p&&cur.p.ts)||0))<minRotateMs){
    const r0=await driveUploadJSON(devManifestFilename(dev),manifest,cur.id,{deviceName:getDeviceName(),ts:String(Date.now())});
    _markDeviceNameSynced();return r0;
  }
  let rotated=null;
  if(cur){
    const s2=_driveFileMap.get(devManifestFilename(dev,2));if(s2)await driveDeleteFile(s2.id).catch(()=>{});
    const s1=_driveFileMap.get(devManifestFilename(dev,1));
    if(s1){await driveRenameFile(s1.id,devManifestFilename(dev,2));_driveFileMap.delete(devManifestFilename(dev,1));_driveFileMap.set(devManifestFilename(dev,2),s1);}
    await driveRenameFile(cur.id,devManifestFilename(dev,1));
    _driveFileMap.delete(devManifestFilename(dev));_driveFileMap.set(devManifestFilename(dev,1),cur);
    rotated=cur;
  }
  const ts=Date.now();
  try{
    const r1=await driveUploadJSON(devManifestFilename(dev),manifest,undefined,{deviceName:getDeviceName(),ts:String(ts)});
    _markDeviceNameSynced();return r1;
  }catch(e){
    // Đẩy thất bại → trả bản vừa xoay về chỗ cũ để máy này không "mất" manifest.
    if(rotated){try{await driveRenameFile(rotated.id,devManifestFilename(dev));_driveFileMap.delete(devManifestFilename(dev,1));_driveFileMap.set(devManifestFilename(dev),rotated);}catch(e2){}}
    throw e;
  }
}
const LS_MY_MANIFEST_ID='dich-my-manifest-id';
let _lastManifestTouch=0;
// Chỉ cập nhật appProperties (deviceName + ts) của manifest máy này — 1 request nhỏ, không đụng nội dung/không xoay vòng bản.
async function driveTouchMyManifest(){
  let id='';try{id=localStorage.getItem(LS_MY_MANIFEST_ID)||'';}catch(e){}
  if(!id){ // chưa có id lưu sẵn (VD vừa cập nhật app, chưa ghi manifest lần nào) → tra 1 lần trong danh sách file Drive rồi nhớ lại
    const m=await driveFindFileMetaByName(devManifestFilename(getDeviceId()));
    if(!m||!m.id)return false;
    id=m.id;try{localStorage.setItem(LS_MY_MANIFEST_ID,id);}catch(e){}
  }
  const token=await ensureDriveToken();
  const ts=String(Date.now());
  const res=await fetch('https://www.googleapis.com/drive/v3/files/'+id+'?fields=id',{
    method:'PATCH',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({appProperties:{deviceName:getDeviceName(),ts}})
  });
  if(res.status===404){try{localStorage.removeItem(LS_MY_MANIFEST_ID);}catch(e){}return false;} // id cũ (manifest đã xoay/xoá) → lần ghi manifest sau lấy id mới
  if(!res.ok)throw new Error('HTTP '+res.status);
  return true;
}
// Đọc manifest của 1 nguồn. Máy thường: dev-<id>-manifest.json.gz. 'legacy': manifest chung cũ, rồi manifest riêng-máy cũ mới nhất.
async function driveReadManifest(dev){
  if(!_driveFileMap)await driveRefreshFileMap();
  if(_isDev(dev)){
    const e=_driveFileMap.get(devManifestFilename(dev));
    return e?await driveDownloadJSON(e.id):null;
  }
  const cands=[];
  for(const [nm,e] of _driveFileMap)if(isLegacyManifestName(nm))cands.push(e);
  cands.sort((a,b)=>(Date.parse(b.modifiedTime)||0)-(Date.parse(a.modifiedTime)||0));
  return cands.length?await driveDownloadJSON(cands[0].id):null;
}
// Dọn dữ liệu của các máy quá MANIFEST_STALE_MS không sao lưu (không bao giờ đụng máy này hoặc "Bản cũ").
// Nội dung truyện theo hash (bookc-…) dùng chung nên KHÔNG xoá ở đây. Trả số máy đã dọn.
async function driveCleanStaleDevices(){
  return 0; // ĐÃ TẮT: không tự xoá bản sao lưu của máy khác (có thể là bản sao DUY NHẤT của bản dịch). Chỉ xoá khi người dùng tự bấm xoá thiết bị.
  const devs=await driveListDevices(false),now=Date.now();let n=0;
  for(const d of devs){
    if(d.me||d.legacy||!d.ts||now-d.ts<=MANIFEST_STALE_MS)continue;
    const pre=['bookh-'+d.dev+'-','books-'+d.dev+'-','dev-'+d.dev+'-manifest'];
    for(const [nm,e] of Array.from(_driveFileMap)){
      if(pre.some(p=>nm.startsWith(p)))await driveDeleteFile(e.id).catch(()=>{});
    }
    n++;
  }
  return n;
}

// Xoá mọi file của 1 máy (không đụng máy này, "Bản cũ", hay nội dung bookc- dùng chung). Trả số file đã xoá.
// Xoá 1 file, tự thử lại (tối đa 4 lần, chờ tăng dần) khi Drive trả lỗi tạm thời (500/503/429/403 rate limit, rớt mạng...).
async function _driveDeleteRetry(id){
  let last;
  for(let i=0;i<4;i++){
    try{await driveDeleteFile(id);return;}
    catch(e){last=e;if(i<3)await new Promise(r=>setTimeout(r,400*Math.pow(2,i)+Math.random()*250));}
  }
  throw last;
}
async function driveDeleteDevice(dev){
  if(!_isDev(dev)||dev===getDeviceId())throw new Error('Không xoá được máy này');
  await driveRefreshFileMap(); // lấy danh sách mới nhất, tránh xoá theo id cũ
  const pre=['bookh-'+dev+'-','books-'+dev+'-','dev-'+dev+'-manifest'];
  const rest=[],mans=[];
  for(const [nm,e] of _driveFileMap){
    if(!pre.some(p=>nm.startsWith(p)))continue;
    (nm.startsWith('dev-'+dev+'-manifest')?mans:rest).push(e.id);
  }
  // 1) Xoá file sách theo từng đợt 4 file; 1 file lỗi KHÔNG làm dừng cả đợt (trước đây Promise.all dừng ở lỗi đầu tiên → còn sót file, phải xoá lần 2).
  let failed=0;
  for(let i=0;i<rest.length;i+=4){
    const rs=await Promise.all(rest.slice(i,i+4).map(id=>_driveDeleteRetry(id).then(()=>0,()=>1)));
    failed+=rs.reduce((a,b)=>a+b,0);
  }
  // 2) Còn file lỗi → GIỮ manifest (máy vẫn hiện trong danh sách để bấm xoá lại), báo lỗi. Xoá hết rồi mới xoá manifest.
  if(failed)throw new Error(_bt('còn {x1} file chưa xoá được, bấm xoá lại',{x1:failed}));
  for(const id of mans)await _driveDeleteRetry(id);
  return rest.length+mans.length;
}

function rehydrateFlat(bk){
  if(!bk||!bk.variants||bk.translations)return bk;
  const bkey=bestVariantKey(bk),best=bkey?bk.variants[bkey]:null; // nhiều chương dịch nhất (không phải ts mới nhất)
  if(best){
    bk.translations=best.translations||{};
    bk.translatedTitles=best.translatedTitles||{};
    bk.audited=best.audited||{};
  }
  return bk;
}

// ===== GỘP 2 BẢN CỦA CÙNG 1 SÁCH theo TỪNG CHƯƠNG (thay cho "bản nào ts mới hơn thắng cả cuốn") =====
// ts của sách = lúc đọc/lưu gần nhất (saveSession đặt ts=now cả khi chỉ đổi vị trí đọc), KHÔNG phải lúc dịch thêm.
// Nên máy nào vừa MỞ ĐỌC sau cùng sẽ "thắng" và đẩy bản dịch ngắn hơn đè bản dịch dài hơn của máy kia.
// Gộp: chương chỉ 1 bên có → giữ; cả 2 bên có → lấy bên có ts mới hơn; vị trí đọc/metadata theo bên mới hơn.
function mergeVariantRecords(a,b,conf){
  // a = bản TRONG MÁY, b = bản từ file/máy khác. Quy tắc: chương chỉ 1 bên có → giữ; cả 2 bên có và KHÁC nhau → GIỮ bản trong máy,
  // bản kia cất vào conf (→ biến thể "<khoá>|alt"), không có bên nào bị ghi đè mất. (Trước đây bên có ts mới hơn thắng, mà ts đổi cả khi chỉ mở đọc.)
  if(!a)return b;if(!b)return a;
  const aNew=(a.ts||0)>=(b.ts||0);
  const o=Object.assign({},aNew?a:b); // vị trí đọc/metadata theo bên mới hơn
  for(const f of ['translations','translatedTitles','audited']){
    const x=a[f],y=b[f];
    if(!x&&!y)continue;
    const r=Object.assign({},x||{});
    for(const i in (y||{})){
      if(!y[i])continue;
      if(!r[i])r[i]=y[i];
      else if(f==='translations'&&conf&&r[i]!==y[i]){(conf.translations||(conf.translations={}))[i]=y[i];if(b.translatedTitles&&b.translatedTitles[i])(conf.translatedTitles||(conf.translatedTitles={}))[i]=b.translatedTitles[i];}
    }
    o[f]=r;
  }
  if(!o.chapterTitles)o.chapterTitles=(aNew?b:a).chapterTitles||o.chapterTitles;
  return o;
}
function mergeBookRecords(l,r){
  if(!l)return r;if(!r)return l;
  l=absorbFlat(l);r=absorbFlat(r); // bản dịch chỉ nằm ở trường phẳng cũng được tính (không bị bỏ khi bên kia có variants)
  const lNew=metaTs(l)>=metaTs(r);
  const base=Object.assign({},lNew?l:r);
  if(typeof base.content!=='string')base.content=(lNew?r:l).content;
  const lv=l.variants||{},rv=r.variants||{};
  const keys=new Set([...Object.keys(lv),...Object.keys(rv)]);
  if(keys.size){
    const out={};
    for(const k of keys){
      const conf={};
      out[k]=mergeVariantRecords(lv[k],rv[k],conf);
      if(conf.translations&&!/\|(alt|bak|flat)$/.test(k)){
        const ak=k+'|alt',ex=out[ak]||lv[ak]||rv[ak]||{};
        conf.translatedTitles=conf.translatedTitles||{};
        out[ak]=mergeVariantRecords(ex,Object.assign({chapterTitles:(rv[k]||{}).chapterTitles||null,ts:(rv[k]||{}).ts||0},conf),null);
      }
    }
    base.variants=out;
    const bk=bestVariantKey(base);
    if(bk&&out[bk]){ // trường phẳng (tương thích code cũ) dựng lại từ variant NHIỀU chương nhất
      base.translations=out[bk].translations||{};
      base.translatedTitles=out[bk].translatedTitles||{};
      base.audited=out[bk].audited||{};
    }
  }else{ // sách cũ chưa có variants: gộp thẳng các trường phẳng (bản máy thắng khi khác nhau)
    for(const f of ['translations','translatedTitles','audited']){
      if(l[f]||r[f])base[f]=Object.assign({},r[f]||{},l[f]||{});
    }
  }
  return base;
}

function getAutoSyncSet(key){
  try{return new Set(JSON.parse(localStorage.getItem(key)||'[]'));}catch(e){return new Set();}
}
function setAutoSyncSet(key,set){
  try{localStorage.setItem(key,JSON.stringify(Array.from(set)));}catch(e){}
}
function markBookDirty(id){
  if(!id)return;
  const s=getAutoSyncSet(LS_AUTOSYNC_DIRTY);s.add(id);setAutoSyncSet(LS_AUTOSYNC_DIRTY,s);
  // Vừa sửa lại 1 sách trước đó lỡ đánh dấu "đã xoá" (hiếm, VD xoá xong rồi undo) → bỏ đánh dấu xoá
  // khỏi hàng đợi xoá (KHÔNG xoá tombstone cũ nếu có — tombstone vẫn giữ để so ts khi cần).
  const d=getAutoSyncSet(LS_AUTOSYNC_DELETED);
  if(d.has(id)){d.delete(id);setAutoSyncSet(LS_AUTOSYNC_DELETED,d);}
}
function markBookDeleted(id){} // không còn tombstone xoá sách

// ===== TOMBSTONE XOÁ CHƯƠNG + TỰ KHÔI PHỤC CHƯƠNG MẤT NGOÀI Ý MUỐN =====
// Quy tắc: chương CHỈ bị xoá trên các máy khác khi người dùng chủ động xoá bằng tính năng "xoá bản dịch"
// (index.html gọi syncNoteChaptersDeleted() TRƯỚC khi xoá). Chương biến mất vì lý do khác (lỗi khi "Cập nhật truyện cũ",
// đổi chia chương/tiêu đề...) KHÔNG có tombstone → lượt đồng bộ tải bản Drive về, gộp lại và KHÔI PHỤC chương đó, không đẩy bản thiếu lên đè Drive.
// Tombstone: {bookId:{variantKey:{chapterIdx:{t:thờiĐiểmXoá, h:hashBảnDịchĐãXoá(0=không rõ), x:1=đã vô hiệu}}}}
// h dùng để phân biệt "bản dịch đã xoá" với "bản dịch MỚI dịch lại sau đó" (khác hash → giữ, tombstone tự vô hiệu).
const LS_CHTOMB='dich-autosync-chtomb';
const LS_AUTOSYNC_BASEKEYS='dich-autosync-basekeys'; // {id:{variantKey:"0-120,122"}} — các chương đã có bản dịch ở lần đồng bộ thành công gần nhất
// Giữ lại để index.html gọi không lỗi: sao lưu thủ công không còn dùng tombstone xoá chương.
async function syncNoteChaptersDeleted(idxs,opts){}

// "Móc" (wrap) 2 hàm libPut()/libDelete() đã định nghĩa sẵn ở khối <script> chính của index.html
// (backup.js nạp SAU nên 2 hàm này đã tồn tại) — vẫn KHÔNG sửa trực tiếp code lõi quản lý tủ
// truyện, chỉ đứng ngoài "nghe" để tự đánh dấu dirty/deleted. Đồng thời giữ lại tham chiếu tới
// bản GỐC (_rawLibPut/_rawLibDelete) để autoSyncNow() dùng riêng khi TỰ NÓ ghi/xoá sách vì lý do
// đồng bộ (tải bản mới hơn về, hoặc xoá theo tombstone từ máy khác) — PHẢI dùng bản gốc ở 2
// trường hợp này, nếu không sẽ tự đánh dấu "dirty"/"deleted" cho chính thay đổi do đồng bộ gây
// ra, khiến vòng đồng bộ sau lại đẩy ngược lên/xoá nhầm, chạy lòng vòng vô ích.
let _rawLibPut=null,_rawLibDelete=null;
let _syncSaving=false; // true khi autoSyncNow tự gọi saveSession() — lúc đó KHÔNG đánh dấu dirty (tránh đẩy lại cả cuốn sách mỗi chu kỳ)
(function hookLibForAutoSync(){
  const origPut=window.libPut,origDel=window.libDelete;
  _rawLibPut=origPut;_rawLibDelete=origDel;
  if(typeof origPut==='function'){
    window.libPut=async function(book){
      const r=await origPut(book);
      if(book&&book.id&&!_syncSaving)markBookDirty(book.id);
      return r;
    };
  }
  if(typeof origDel==='function'){
    window.libDelete=async function(id,opts){
      const r=await origDel(id,opts); // chuyển tiếp {userConfirmed:true} — thiếu cờ thì libDelete gốc từ chối
      markBookDeleted(id);
      return r;
    };
  }
})();

function isAutoSyncOn(){try{return localStorage.getItem(LS_AUTOSYNC)==='1';}catch(e){return false;}}

// Đọc "ts" nội dung thật của 1 mục metadata nhẹ, fallback dần về các field cũ hơn nếu thiếu
// (tương thích ngược với record tạo trước khi có field "ts" trong bookToMeta()).
function metaTs(m){return (m&&(m.ts||m.lastOpen||m.added))||0;}

// Nhiều tab cùng 1 máy: chỉ 1 tab được đồng bộ tại 1 thời điểm (Web Locks). Tab đến sau gặp khoá đang bận thì bỏ qua lượt
// (vòng lặp sẽ gọi lại). Trình duyệt/ngữ cảnh không hỗ trợ Web Locks thì chạy như cũ.
async function autoSyncNow(opts){
  if(opts&&typeof opts.stopPropagation==='function')opts=null; // lỡ bị gọi trực tiếp làm listener sự kiện
  let entered=false;
  try{
    if(typeof navigator!=='undefined'&&navigator.locks&&navigator.locks.request){
      await navigator.locks.request('nt-autosync',{ifAvailable:true},async lock=>{
        entered=true;
        if(!lock)return;
        await _autoSyncNowImpl(opts);
      });
      return;
    }
  }catch(e){if(entered)return;}
  await _autoSyncNowImpl(opts);
}
async function _autoSyncNowImpl(opts){await doAutoBackup(opts);}

// ===== PHA 3: SAO LƯU TỰ ĐỘNG MỘT CHIỀU (chỉ ĐẨY lên Drive, KHÔNG BAO GIỜ tải về / ghi vào tủ truyện) =====
// Mỗi lượt:
//  1) Ứng viên = sách đã "dirty" (hookLibForAutoSync đánh dấu mỗi lần libPut) + sách chưa từng đẩy. Không có ứng viên và
//     manifest không đổi → KHÔNG tốn request nào.
//  2) Mỗi ứng viên: tính stateHash; trùng hash của bản "đầu sách" trên Drive (appProperties.h) → bỏ qua, khác → driveUploadBookSplit.
//  3) Manifest riêng máy (thư viện + cài đặt + sessions/bookmarks/xưng hô) chỉ ghi khi chữ ký đổi.
//  Sách bị xoá ở máy này KHÔNG bị xoá trên Drive: mục trong manifest chỉ đánh dấu gone, giữ BACKUP_TRASH_MS rồi mới dọn file của máy này.
let _restoring=false;       // Pha 4 đặt true khi đang gộp dữ liệu từ máy khác → không sao lưu đè giữa chừng
let _headChecked=false;     // 1 lần mỗi phiên: kiểm sách nào thiếu file đầu trên Drive
let _staleChecked=false;    // dọn máy quá 365 ngày: 1 lần mỗi phiên trang
const LS_BACKUP_MSIG='dich-backup-msig';   // chữ ký manifest lần ghi gần nhất
const LS_BACKUP_LIB='dich-backup-lib';     // {id:entry} bản lib trong manifest lần ghi gần nhất (cache cục bộ, khỏi tải Drive)
const BACKUP_TRASH_MS=30*86400000;
function _readLS(key,def){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v==null?def:v;}catch(e){return def;}}
function _writeLS(key,v){try{localStorage.setItem(key,JSON.stringify(v));}catch(e){}}
// Số chương đã có bản dịch (variant dùng gần nhất) — để popup khôi phục (Pha 4) hiện "Drive 120 chương, máy này 95".
function trCount(bk){
  if(!bk)return 0;
  let n=_cntObj(bk.translations);
  if(bk.variants)for(const k of Object.keys(bk.variants))n=Math.max(n,_cntV(bk.variants[k]));
  return n;
}
function _collectPrefix(prefix){
  const out={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith(prefix)){try{const v=JSON.parse(localStorage.getItem(k));if(v)out[k]=v;}catch(e){}}
  }
  return out;
}
function _collectSettings(){
  const o={};
  try{o.settings=JSON.parse(localStorage.getItem('ds')||'{}');}catch(e){o.settings={};}
  o.theme=localStorage.getItem('dt');
  o.auto=localStorage.getItem('dich-auto');
  try{o.presets=(typeof loadPresetsFor==='function')?loadPresetsFor(''):((typeof loadPresets==='function')?loadPresets():null);}catch(e){o.presets=null;}
  try{o.presetsEn=(typeof loadPresetsFor==='function'&&(localStorage.getItem('dich-presets-en')||_presetNs()==='en'))?loadPresetsFor('en'):null;}catch(e){o.presetsEn=null;}
  o.etRules=_readLS('dich-et-rules',[]);
  o.etSort=_readLS('dich-et-sort',{});
  o.etAiNote=_readLS('dich-et-ainote',{});
  o.addrPairPresets=_readLS('addrPairPresetsGlobalV5',null);
  return o;
}
function setBackupStatus(t){setAutoSyncStatusText(t);}
async function doAutoBackup(opts){
  opts=opts||{};
  if(_restoring||_autoSyncRunning||!isDriveLoggedIn())return {skipped:true};
  _autoSyncRunning=true;_setSyncBusy(true);
  let failed=0,lastErr=null,pushed=0,held=0;
  try{
    setBackupStatus('Đang sao lưu...');
    // "Sao lưu ngay": ghi bản dịch đang trong RAM xuống tủ trước (giống sao lưu file thủ công); vòng tự động thì dựa vào hook libPut.
    if(opts.flush&&typeof S!=='undefined'&&S&&S.fname){try{await saveSession();}catch(e){}}
    const dev=getDeviceId(),now=Date.now();
    const metas=(await libGetAllMeta())||[];
    const baseh=_readLS(LS_AUTOSYNC_BASEH,{});
    const libPrev=_readLS(LS_BACKUP_LIB,{});
    const entries={};
    for(const m of metas){
      if(!m||!m.id)continue;
      const pv=libPrev[m.id]||{};
      entries[m.id]=Object.assign({},m,{bh:baseh[m.id]||pv.bh||'',tc:pv.tc||0});
    }
    // Sách đã biến mất khỏi tủ → giữ mục trong manifest (đánh dấu gone), hết hạn thùng rác mới dọn file của máy này.
    const expired=[];
    for(const id of Object.keys(libPrev)){
      if(entries[id])continue;
      const pv=libPrev[id],g=pv.gone||now;
      if(now-g>BACKUP_TRASH_MS)expired.push(id);else entries[id]=Object.assign({},pv,{gone:g});
    }
    if(!metas.length)expired.length=0; // tủ đọc ra RỖNG (có thể do lỗi IndexedDB) → tuyệt đối không dọn file nào trên Drive
    const dirty=getAutoSyncSet(LS_AUTOSYNC_DIRTY);
    let cand=metas.filter(m=>m&&m.id&&(dirty.has(m.id)||!baseh[m.id])).map(m=>m.id);
    // 1 lần sau khi cập nhật: tính lại số chương dịch (tc) của mọi truyện — manifest cũ có thể ghi 0 sai. Chỉ đẩy lên khi hash khác.
    if(!localStorage.getItem('dich-tc-fixed-v1')){const cs0=new Set(cand);for(const m of metas){if(m&&m.id&&!cs0.has(m.id))cand.push(m.id);}}
    // 1 lần mỗi phiên trang: sách đã có mốc baseh nhưng file đầu của MÁY NÀY không có trên Drive (vd mốc từ bản app cũ,
    // truyện chưa sửa từ đó → không bao giờ "dirty") thì đẩy lại, kẻo manifest ghi có mà khôi phục không thấy file.
    if(!_headChecked){
      _headChecked=true;
      await driveRefreshFileMap();
      const cs=new Set(cand);
      for(const m of metas){if(m&&m.id&&!cs.has(m.id)&&!_driveFileMap.has(bookHeadFilename(m.id,dev))){cand.push(m.id);cs.add(m.id);}}
    }
    if(cand.length||expired.length)await driveRefreshFileMap();
    for(const id of cand){
      // Gỡ dirty TRƯỚC khi đọc: sửa tiếp trong lúc đang đẩy thì libPut đánh dấu lại, không bị mất.
      const d=getAutoSyncSet(LS_AUTOSYNC_DIRTY);d.delete(id);setAutoSyncSet(LS_AUTOSYNC_DIRTY,d);
      try{
        const bk=await libGet(id);
        if(!bk)continue;
        // CHẶN lan truyền mất bản dịch lên Drive: số chương dịch GIẢM so với lần sao lưu trước mà người dùng không bấm xoá
        // → giữ nguyên bản đã sao lưu trên Drive (không ghi đè, không xoá shard). Người dùng bấm xoá → trAllowDelete đã đặt dấu.
        const tcNow=trCount(bk),tcPrev=(libPrev[id]&&libPrev[id].tc)||0;
        if(tcNow<tcPrev&&!_userDelMarker(id)){
          held++;console.warn('[Sao lưu] Giữ nguyên bản sao lưu cũ của '+(bk.name||id)+': số chương dịch giảm '+tcPrev+' → '+tcNow+' không do người dùng xoá');
          continue;
        }
        const lh=stateHash(bk);
        const he=_driveFileMap.get(bookHeadFilename(id,dev));
        if(!he||he.h!==lh){await driveUploadBookSplit(bk,lh,dev);pushed++;}
        _clearUserDelMarker(id);
        baseh[id]=lh;entries[id].bh=lh;entries[id].tc=tcNow;
      }catch(e){
        failed++;lastErr=e;console.warn('[Sao lưu] lỗi sách '+id,e);
        const d2=getAutoSyncSet(LS_AUTOSYNC_DIRTY);d2.add(id);setAutoSyncSet(LS_AUTOSYNC_DIRTY,d2);
      }
    }
    // Mục manifest chỉ được "quảng cáo" khi file đầu (bookh-<máy>-<id>) của máy này THẬT SỰ có trên Drive. Trước đây mục nào còn mốc baseh cũ
    // (từ bản app cũ / truyện chỉ có ở danh sách nhẹ, không có bản đầy đủ để đẩy) vẫn được ghi → máy kia thấy "có truyện cần gộp" nhưng bấm
    // Khôi phục thì không tải được file nào. Mốc baseh của mục bị bỏ được xoá để lượt sau thử đẩy lại.
    if(_driveFileMap){
      for(const id of Object.keys(entries)){
        if(!entries[id].bh)continue;
        if(!_driveFileMap.has(bookHeadFilename(id,dev))){
          console.warn('[Sao lưu] Bỏ "'+(entries[id].name||id)+'" khỏi manifest: chưa có file trên Drive');
          entries[id].bh='';delete baseh[id];
        }
      }
    }
    for(const id of Object.keys(entries))if(!entries[id].bh)delete entries[id]; // chưa đẩy được → chưa đưa vào manifest (khôi phục sẽ không tìm thấy file)
    for(const id of expired){
      for(const [nm,e] of Array.from(_driveFileMap||[])){
        if(nm===bookHeadFilename(id,dev)||isBookShardOf(id,nm,dev))await driveDeleteFile(e.id).catch(()=>{});
      }
      delete baseh[id];
    }
    // Manifest: thư viện + cài đặt + sessions/bookmarks/xưng hô. Sessions của truyện đã nằm trong tủ đã có bản dịch trong record → bỏ (như sao lưu file).
    const sessions=_collectPrefix('dich-tr:');
    for(const m of metas){if(!m||!m.id||!(entries[m.id]&&entries[m.id].tc>0))continue;delete sessions['dich-tr:'+(m.fname||((m.name||'')+'.txt'))];delete sessions['dich-tr:'+m.id];} // truyện CHƯA có chương dịch trong record → giữ bản localStorage (không bỏ sót)
    if(_driveFileMap){const ce=_driveFileMap.get(devManifestFilename(dev));if(ce&&ce.p)_adoptRemoteDeviceName(ce.p.deviceName);}
    const man=Object.assign({v:1,dev,deviceName:getDeviceName(),lib:entries},{settings:_collectSettings()},
      {sessions,bookmarks:_collectPrefix('dich-bm:'),addrStoryChoices:_collectPrefix('dich-addr-preset:')});
    const sig=hashStr(JSON.stringify(man));
    if(opts.flush||pushed||expired.length||sig!==localStorage.getItem(LS_BACKUP_MSIG)){
      man.ts=now;
      const _mr=await driveWriteMyManifest(man,{minRotateMs:6*3600*1000});
      try{localStorage.setItem(LS_BACKUP_MSIG,sig);if(_mr&&_mr.id)localStorage.setItem(LS_MY_MANIFEST_ID,_mr.id);}catch(e){}
      _lastManifestTouch=Date.now();
    }else if(!failed&&Date.now()-_lastManifestTouch>60000){
      // Không có gì thay đổi → manifest không ghi lại, nên giờ hiển thị của máy này ở CÁC MÁY KHÁC đứng yên dù máy này vẫn đang sao lưu đều.
      // Chỉ cập nhật mốc giờ (appProperties.ts, không tải nội dung) để máy khác thấy "đã sao lưu lúc …".
      try{await driveTouchMyManifest();}catch(e){console.warn('[Sao lưu] cập nhật mốc giờ lỗi',e);}
      _lastManifestTouch=Date.now();
    }
    if(!failed){try{localStorage.setItem('dich-tc-fixed-v1','1');}catch(e){}}
    _writeLS(LS_AUTOSYNC_BASEH,baseh);
    _writeLS(LS_BACKUP_LIB,entries);
    if(!_staleChecked){_staleChecked=true;try{await driveCleanStaleDevices();}catch(e){console.warn('[Sao lưu] dọn máy cũ lỗi',e);}}
    if(held)console.warn('[Sao lưu] '+held+' truyện được giữ nguyên bản sao lưu cũ (số chương dịch giảm bất thường)');
    if(failed){setBackupStatus(_bt('Sao lưu chưa đủ: {x1} truyện lỗi',{x1:failed}));}
    else{try{localStorage.setItem(LS_AUTOSYNC_LAST,String(Date.now()));localStorage.setItem(LS_AUTOSYNC_INITED,'1');}catch(e){}updateAutoSyncStatusText();}
    return {pushed,failed};
  }catch(e){
    console.warn('[Sao lưu] lỗi',e);
    setBackupStatus(_bt('Lỗi sao lưu: {x1}',{x1:((e&&e.message)||e)}));
    return {error:e};
  }finally{
    _driveFileMap=null; // lượt sau liệt kê lại, không giữ id cũ
    _autoSyncRunning=false;_setSyncBusy(false);
  }
}


// ===== PHA 4: KHÔI PHỤC TỪ MÁY KHÁC (hoặc "Bản cũ") — GỘP, không xoá chương nào =====
// Luồng: planRestoreFromDevice (đọc manifest nguồn, so từng truyện với tủ máy này) -> popup xem trước ->
// applyRestoreFromDevice (tải từng truyện của máy nguồn, gộp bằng mergeBookRecords, ghi theo lô nhỏ) -> doAutoBackup() 1 lần.
// Cờ _restoring chặn sao lưu tự động chạy đè giữa lúc đang gộp. Chương chỉ 1 bên có thì giữ; cả 2 bên có thì bản mới hơn thắng
// (đúng quy tắc mergeBookRecords). Vị trí đọc/metadata theo bản mới hơn (không có cơ chế "kéo vị trí đọc" riêng — để Pha 6).
const _escH=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let _restoreDevBusy=false;
function _manifestBooks(man){
  const l=man&&man.lib;
  return Array.isArray(l)?l:(l&&typeof l==='object'?Object.values(l):[]);
}
// Trả null nếu nguồn không có manifest. rows = các truyện MỚI (chưa có ở máy này) hoặc nguồn có NHIỀU chương dịch hơn máy này.
async function planRestoreFromDevice(devId){
  await driveRefreshFileMap();
  const man=await driveReadManifest(devId);
  if(!man)return null;
  const me=devId===getDeviceId();
  const metas=(await libGetAllMeta())||[];
  const byId=new Map(),byName=new Map();
  for(const m of metas){byId.set(m.id,m);const nk=normBookNameNFC(m.name);if(!byName.has(nk))byName.set(nk,m.id);}
  const rows=[],st={total:0,same:0,have:0};
  for(const e of _manifestBooks(man)){
    if(!e||!e.id)continue;
    const rh=e.bh||e.h||'';           // manifest mới: bh; manifest cũ (Bản cũ): h
    if(!rh)continue;
    if(e.gone&&!me)continue;           // sách đã xoá chỉ khôi phục được từ chính máy này (thùng rác 30 ngày)
    // Máy nguồn (không phải "Bản cũ") quảng cáo truyện nhưng file đầu không có trên Drive → không thể khôi phục: báo riêng, không đưa vào danh sách.
    if(devId!==LEGACY_DEV&&_driveFileMap&&!_driveFileMap.has(bookHeadFilename(e.id,devId))){(st.missing||(st.missing=[])).push(e.name||'(không tên)');continue;}
    st.total++;
    const lid=byId.has(e.id)?e.id:byName.get(normBookNameNFC(e.name));
    const lbk=lid?await libGet(lid):null;
    if(lbk&&stateHash(lbk)===rh){st.same++;continue;}   // giống hệt
    const hasTc=typeof e.tc==='number'&&e.tc>0; // tc=0 có thể do bản cũ đếm nhầm variant rỗng → coi là chưa rõ, vẫn cho khôi phục/gộp
    const rtc=hasTc?e.tc:null,ltc=lbk?trCount(lbk):0;
    const add=hasTc?Math.max(0,rtc-ltc):null;
    let newer=false;
    if(lbk&&hasTc&&add===0){
      // Đủ chương rồi, nhưng nguồn có bản MỚI HƠN (sửa/dịch lại chương đã có) → vẫn cho gộp (mergeBookRecords: chương nào mới hơn thì thắng).
      if((+e.ts||0)>(metaTs(byId.get(lid))||0))newer=true;
      else{st.have++;continue;}
    }
    rows.push({id:e.id,name:e.name||'(không tên)',localId:lid||null,isNew:!lid,rtc,ltc,add,newer,gone:!!e.gone,rh,nch:(+e.nCh||0)});
  }
  rows.sort((a,b)=>String(a.name).localeCompare(String(b.name),'vi',{numeric:true}));
  return {devId,man,rows,stats:st,devName:devId===LEGACY_DEV?'Bản cũ':(((_driveFileMap&&_driveFileMap.get(devManifestFilename(devId))||{}).p||{}).deviceName||man.deviceName||''),canSettings:man.v===1&&!!man.settings};
}
// Ghi 1 lô record vào CẢ 2 store trong cùng 1 transaction (như khôi phục file). Trả null nếu OK, hoặc lỗi.
async function _writeBooksToLib(recs){
  const db=await openLibDB();
  let err=null;
  await new Promise(resolve=>{
    const tx=db.transaction([LIB_STORE,META_STORE],'readwrite');
    const store=tx.objectStore(LIB_STORE),metaStore=tx.objectStore(META_STORE);
    for(const rec of recs){
      try{_guardedPutRec(store,metaStore,rec,e=>{err=err||e;try{tx.abort();}catch(_){}});}
      catch(e){err=e;try{tx.abort();}catch(_){}break;}
    }
    tx.oncomplete=resolve;
    tx.onerror=()=>{err=err||tx.error;};
    tx.onabort=()=>{err=err||tx.error||new Error('Transaction aborted');resolve();};
  });
  return err;
}
function _mergeLSKeysByTs(obj,okKeys){
  if(!obj||typeof obj!=='object')return;
  for(const [k,v] of Object.entries(obj)){
    if(!okKeys.has(k)||!v)continue;
    let cur=null;try{cur=JSON.parse(localStorage.getItem(k)||'null');}catch(e){}
    if(!cur||((v&&v.ts)||0)>((cur&&cur.ts)||0)){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  }
}
// opts.settings=true: áp cả cài đặt của máy nguồn (mặc định KHÔNG). Trả {merged,added,chapters,failed}.
async function applyRestoreFromDevice(plan,opts){
  opts=opts||{};
  for(let i=0;i<100&&_autoSyncRunning;i++)await new Promise(r=>setTimeout(r,300)); // đợi lượt sao lưu đang chạy
  if(_autoSyncRunning)throw new Error('Đang sao lưu, thử lại sau ít giây');
  _restoring=true;
  const res={merged:0,added:0,chapters:0,failed:0,errors:[],failedRows:[]};
  _restoreReopenId=null;
  let _fatal=null;
  RestoreToast.start({device:plan.devName||_bt('máy khác'),total:plan.rows.length,names:plan.rows.map(r=>r.name||r.id)});
  try{
    try{await driveRefreshFileMap();}catch(e){} // popup có thể đã mở lâu → id/shard cũ có thể đã đổi
    const dev=plan.devId,rows=plan.rows,usedIds=new Set((await libGetAllMeta()||[]).map(m=>m.id));
    // Truyện đang mở nằm trong số cần gộp → chốt + đóng tạm (saveSession sẽ không ghi đè lại bản vừa gộp), mở lại ở cuối.
    const openId=(typeof S!=='undefined'&&S&&S.fname)?((S.loadedBookId!==undefined)?S.loadedBookId:(typeof libCurrentId!=='undefined'?libCurrentId:null)):null;
    if(openId&&rows.some(r=>r.localId===openId)&&typeof resetToUploadScreen==='function'){
      try{await saveSession();}catch(e){}
      resetToUploadScreen();libCurrentId=null;_restoreReopenId=openId;
    }
    const restored=[]; // {rec,origId} đã ghi
    for(let i=0;i<rows.length;i+=5){            // lô 5 truyện: tải hết lô rồi mới ghi, lỗi giữa chừng không làm hỏng tủ (gộp không xoá gì)
      const recs=[],meta=[];
      for(const r of rows.slice(i,i+5)){
        const idx=rows.indexOf(r);
        try{
          RestoreToast.book(idx,_bt('đang tải'));
          const remote=await driveFetchBook(r.id,r.localId===r.id,dev);
          if(!remote){res.failed++;res.failedRows.push(r);res.errors.push(_bt('{x1}: không thấy file của truyện này trên Drive',{x1:(r.name||r.id)}));RestoreToast.bookDone(idx,{state:'err',why:_bt('Không thấy file của truyện này trên Drive')});continue;}
          const local=r.localId?await libGet(r.localId):null;
          const before=local?trCount(local):0;
          const rec=local?mergeBookRecords(local,remote):Object.assign({},remote);
          rehydrateFlat(rec);
          if(local)rec.id=local.id;
          else if(!rec.id||usedIds.has(rec.id))rec.id='bk-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
          usedIds.add(rec.id);
          const _gain=Math.max(0,trCount(rec)-before);
          recs.push(rec);meta.push({idx,row:r,rec,origId:r.id,isNew:!local,gain:_gain});
          RestoreToast.bookDone(idx,{state:'ok',isNew:!local,gain:_gain});
        }catch(e){res.failed++;res.failedRows.push(r);res.errors.push((r.name||r.id)+': '+((e&&e.message)||e));RestoreToast.bookDone(idx,{state:'err',why:_bt(String((e&&e.message)||e))});}
      }
      if(!recs.length)continue;
      RestoreToast.writing();
      const err=await _writeBooksToLib(recs);
      if(err){res.failed+=recs.length;const _w=_bt('Ghi vào tủ truyện lỗi: {x1}',{x1:((err&&err.message)||err)});res.errors.push(_w);for(const m of meta){res.failedRows.push(m.row);RestoreToast.revert(m.idx,_w);}continue;}
      for(const m of meta){
        restored.push(m);markBookDirty(m.rec.id); // để doAutoBackup đẩy bản đã gộp vào vùng của máy này
        if(m.isNew)res.added++;else res.merged++;
        if(!m.isNew)res.chapters+=m.gain; // chỉ tính chương thêm vào truyện ĐÃ CÓ; truyện mới đã nằm ở "thêm N truyện"
      }
    }
    // sessions / bookmarks / xưng hô riêng từng truyện: gộp theo ts từng key, chỉ cho các truyện vừa gộp
    const man=plan.man;
    const want=(prefix,onlyNoTr)=>{
      const ok=new Set();
      for(const {rec,origId} of restored){
        if(onlyNoTr&&trCount(rec))continue;
        ok.add(prefix+bookFnameOf(rec));ok.add(prefix+rec.id);if(origId)ok.add(prefix+origId);
      }
      return ok;
    };
    _mergeLSKeysByTs(man.sessions,want('dich-tr:',true));
    _mergeLSKeysByTs(man.bookmarks,want('dich-bm:',false));
    _mergeLSKeysByTs(man.addrStoryChoices,want('dich-addr-preset:',false));
    if(opts.settings&&plan.canSettings){
      const st=man.settings||{};
      await applyRestoreData({settings:st.settings,theme:st.theme,auto:st.auto,presets:st.presets,presetsEn:st.presetsEn,etRules:st.etRules,etSort:st.etSort,etAiNote:st.etAiNote,addrPairPresets:st.addrPairPresets},'settings');
      RestoreToast.extra(_bt('cài đặt'));
    }
    if(restored.length&&typeof libLoad==='function')await libLoad();
    await reopenAfterRestore();
  }catch(e){_fatal=e;throw e;}finally{
    _restoring=false;
    if(!_fatal)RestoreToast.finish();
  }
  // Không đợi sao lưu xong mới báo kết quả (sao lưu cả tủ có thể mất lâu → dòng "Đang khôi phục..." treo mãi, tưởng không khôi phục được gì).
  Promise.resolve().then(()=>doAutoBackup()).catch(()=>{});
  return res;
}
// Điểm vào cho UI (Pha 5): bấm dòng máy khác -> xem trước + xác nhận.
async function restoreFromDevice(devId){
  if(_restoreDevBusy||_restoring)return;
  if(!isDriveLoggedIn()){setStatus('Chưa đăng nhập Google Drive.',4000);return;}
  _restoreDevBusy=true;
  try{
    RestoreToast.reading();
    let plan;
    try{plan=await planRestoreFromDevice(devId);}
    catch(e){RestoreToast.dismiss();_restoreInfo('Không đọc được bản sao lưu',_escH((e&&e.message)||e));return;}
    if(!plan){RestoreToast.dismiss();_restoreInfo('Không tìm thấy bản sao lưu','Không thấy file sao lưu (manifest) của máy này trên Drive. Hãy bật Sao lưu tự động hoặc bấm "(Hiện tại)" trong "Thiết bị" trên máy đó trước.');return;}
    RestoreToast.dismiss();
    let withSettings=false;
    const rows=plan.rows.slice(0,8).map(r=>{
      let d;
      if(r.isNew)d='truyện mới'+(r.nch?' ('+r.nch+' chương'+(r.rtc?', đã dịch '+r.rtc:', chưa dịch chương nào')+')':(r.rtc?' (đã dịch '+r.rtc+' chương)':' (chưa có bản dịch)'));
      else if(r.newer)d=_bt('có bản mới hơn trên Drive ({x1} chương, máy này {x2})',{x1:r.rtc,x2:r.ltc});
      else if(r.add!=null)d=_bt('Drive {x1} chương, máy này {x2} → thêm {x3}',{x1:r.rtc,x2:r.ltc,x3:r.add});
      else d='có bản khác trên Drive';
      return '• <b>'+_escH(r.name)+'</b>'+(r.gone?' (đã xoá)':'')+': '+d;
    }).join('<br>');
    const more=plan.rows.length>8?'<br>… và '+(plan.rows.length-8)+' truyện khác':'';
    const missNote=(plan.stats&&plan.stats.missing&&plan.stats.missing.length)
      ?'<div style=\"font-size:12px;opacity:.8;margin:6px 0;line-height:1.5;\">'+plan.stats.missing.length+' truyện ('+plan.stats.missing.slice(0,3).map(_escH).join(', ')+(plan.stats.missing.length>3?'…':'')+') máy kia có ghi nhưng chưa có file trên Drive nên chưa khôi phục được. Hãy mở app trên máy kia, bấm dòng \"(Hiện tại)\" trong Thiết bị để sao lưu lại rồi thử lại.</div>':'';
    const body=plan.rows.length
      ?'<div style="margin-bottom:8px;line-height:1.7;">'+rows+more+'</div><span style="color:var(--accent);font-size:12px;display:block;margin-bottom:6px;">Gộp vào tủ truyện, không xoá chương nào.</span>'
      :'<div style="margin-bottom:8px;line-height:1.6;">Không có truyện nào cần thêm — máy này đã đủ.'+(plan.stats&&plan.stats.total?'<br><span style="font-size:12px;opacity:.75;">'+_escH(plan.devName||'Máy kia')+' có '+plan.stats.total+' truyện: '+plan.stats.same+' giống hệt, '+plan.stats.have+' máy này đã đủ chương và không cũ hơn.</span>':'')+'</div>';
    const settingsBox=plan.canSettings
      ?'<label class="dl-opt" for="restoreDevSettings" style="text-align:left;"><input type="checkbox" id="restoreDevSettings"><span class="dl-opt-box"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span><span class="dl-opt-text">Áp cả cài đặt của máy này (ghi đè cài đặt hiện tại)</span></label>':'';
    const run=async(p,o)=>{
      try{
        const r=await applyRestoreFromDevice(p,o);
        if(r.failedRows&&r.failedRows.length)RestoreToast.onRetry(()=>run(Object.assign({},p,{rows:r.failedRows}),{settings:false}));
      }catch(e){RestoreToast.error((e&&e.message)||String(e));}
    };
    const doIt=()=>run(plan,{settings:withSettings});
    showPopup({
      title:_bt('Khôi phục từ {x1}',{x1:_escH(plan.devName||_bt('máy khác'))}),
      msg:body+missNote+settingsBox,
      btns:[
        {label:'Khôi phục',cls:'btn-p',cb:()=>doIt()},
        {label:'Hủy',cls:'btn'},
      ]
    });
    const cb=document.getElementById('restoreDevSettings');
    if(cb)cb.addEventListener('change',()=>{withSettings=!!cb.checked;});
  }catch(e){
    RestoreToast.dismiss();_restoreInfo('Khôi phục lỗi',_escH((e&&e.message)||e));
  }finally{_restoreDevBusy=false;}
}
function _restoreInfo(title,msg){try{showPopup({title:title,msg:'<div style="line-height:1.6;">'+msg+'</div>',btns:[{label:'Đóng',cls:'btn-p'}]});}catch(e){setStatus(title,6000);}}

function startAutoSyncLoop(){
  stopAutoSyncLoop();
  autoSyncNow();
  _autoSyncTimer=setInterval(function(){if(!document.hidden)autoSyncNow();},getAutoSyncIntervalMs());
}
document.addEventListener('visibilitychange',function(){if(!document.hidden&&isAutoSyncOn())autoSyncNow();});
function stopAutoSyncLoop(){
  if(_autoSyncTimer){clearInterval(_autoSyncTimer);_autoSyncTimer=null;}
}

function toggleAutoSync(e){
  if(e)e.stopPropagation();
  const on=!isAutoSyncOn();
  try{localStorage.setItem(LS_AUTOSYNC,on?'1':'0');}catch(e){}
  renderAutoSyncSwitch();
  spinSyncAutoIcon();
  if(on)startAutoSyncLoop();else stopAutoSyncLoop();
}
// Icon "Đồng bộ hoá tự động" (#autoSyncIcoMenu, trong menu con Tài khoản) xoay 1 vòng 360 độ mỗi
// lần bấm bật/tắt — y hệt hiệu ứng bản cũ (.sync-item-ico.spin-once/@keyframes syncIcoSpin360 đã
// có sẵn trong CSS). Gỡ class bằng timeout (không đợi 'animationend') để chắc chắn gỡ được kể cả
// khi animation bị ngắt giữa chừng do bấm liên tục nhiều lần; ép reflow (offsetWidth) trước khi
// thêm lại class để animation restart được đúng lúc bấm liên tiếp.
function spinSyncAutoIcon(){
  const ico=document.getElementById('autoSyncIcoMenu');
  if(!ico)return;
  ico.classList.remove('spin-once');
  void ico.offsetWidth;
  ico.classList.add('spin-once');
  setTimeout(()=>ico.classList.remove('spin-once'),2520);
}

// Đổi khoảng thời gian đồng bộ — có 2 nơi chọn giống hệt nhau: #autoSyncIntervalSelect (khung
// Cài đặt) và #autoSyncIntervalSelectMenu (menu con "Tài khoản" ở avatar). Đổi ở đâu cũng lưu
// lại rồi đồng bộ giá trị hiển thị sang nơi còn lại (syncAutoSyncIntervalSelects), và khởi động
// lại vòng lặp với chu kỳ mới NGAY nếu đang bật (không cần đợi tới lượt chạy kế tiếp).
function onAutoSyncIntervalChange(el){
  const sel=el||document.getElementById('autoSyncIntervalSelect');
  if(!sel)return;
  try{localStorage.setItem(LS_AUTOSYNC_INTERVAL,sel.value);}catch(e){}
  syncAutoSyncIntervalSelects();
  if(isAutoSyncOn())startAutoSyncLoop();
}
// Ép cả 2 dropdown khoảng thời gian (Cài đặt + menu Tài khoản) luôn hiện cùng 1 giá trị đã lưu —
// gọi sau khi đổi ở 1 trong 2 nơi, và lúc khởi động trang / mở menu avatar. #autoSyncIntervalSelect
// (khung Cài đặt) vẫn là <select> native nên gán .value là xong; #autoSyncIntervalSelectMenu (menu
// avatar) đã bị enhanceSelectAsDropdown() biến thành dropdown tuỳ biến — gán .value bằng JS KHÔNG
// tự bắn 'change' nên phải gọi thêm ._csSync() (hàm nó tự gắn vào select gốc) để nút + menu tuỳ
// biến cập nhật lại nhãn/mục đang chọn cho khớp.
function syncAutoSyncIntervalSelects(){
  const v=String(getAutoSyncIntervalMs());
  const a=document.getElementById('autoSyncIntervalSelect');
  const b=document.getElementById('autoSyncIntervalSelectMenu');
  // Giá trị mặc định/đã lưu chưa có trong danh sách <option> (vd 30 giây) → thêm vào để dropdown không bị trống
  for(const sel of [a,b]){
    if(sel&&!Array.from(sel.options||[]).some(o=>o.value===v)){
      const ms=parseInt(v,10);
      const o=document.createElement('option');o.value=v;
      o.textContent=ms<60000?_bt('{x1} giây',{x1:Math.round(ms/1000)}):_bt('{x1} phút',{x1:Math.round(ms/60000)});
      let at=null;for(const x of Array.from(sel.options||[])){if(parseInt(x.value,10)>ms){at=x;break;}}
      sel.insertBefore(o,at);
    }
  }
  if(a)a.value=v;
  if(b){b.value=isAutoSyncOn()?v:'0';b._csSync&&b._csSync();}
}

// Không còn công tắc gạt riêng — bấm vào cả dòng (#autoSyncSettingsRow trong khung Cài đặt, HOẶC
// #syncSubmenuAutoSyncRow trong menu con "Tài khoản" ở avatar) là bật/tắt, trạng thái hiện bằng
// chữ Bật/Tắt ngay trên dòng đó (#autoSyncOnOffText / #autoSyncOnOffTextMenu — luôn cập nhật
// đồng thời cả 2). Giờ đồng bộ gần nhất hiện riêng ở phần tài khoản trong menu avatar
// (#autoSyncStatusText, xem renderSyncAccountUI()) — cùng cập nhật ở đây cho đồng bộ khi trạng
// thái bật/tắt thay đổi.
function renderAutoSyncSwitch(){
  const on=isAutoSyncOn();
  const ico=document.getElementById('autoSyncIcoMenu');
  if(ico)ico.classList.toggle('on',on);
  document.querySelectorAll('.sa-dot').forEach(x=>x.classList.toggle('off',!on));
  syncAutoSyncIntervalSelects();
  updateAutoSyncStatusText();
}

function setAutoSyncStatusText(t){
  // Dòng phụ dưới "Tự động sao lưu" đã bỏ (giờ sao lưu hiện ở dòng thiết bị). Nếu index.html cũ còn phần tử này thì gỡ luôn,
  // để chỉ cần thay backup.js cũng không còn thấy dòng phụ.
  const el=document.getElementById('autoSyncStatusText');
  if(el)el.remove();
}
// Giờ đồng bộ gần nhất — hiện dưới email trong menu avatar, không phụ thuộc "Đồng bộ hoá tự động"
// đang bật hay tắt (Đồng bộ ngay cũng cập nhật cùng mốc LS_AUTOSYNC_LAST này).
function updateAutoSyncStatusText(){
  const last=parseInt(localStorage.getItem(LS_AUTOSYNC_LAST)||'0',10);
  if(!_autoSyncRunning)_refreshMeDevTime(last||0);
  if(!last){setAutoSyncStatusText('Chưa sao lưu lần nào');return;}
  const d=new Date(last);
  const hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0');
  setAutoSyncStatusText(_bt('Sao lưu lúc {x1}',{x1:hh+':'+mm}));
}

// Nút "Đồng bộ ngay" (2 chiều: đẩy lên + tải về/khôi phục) — chạy 1 lượt autoSyncNow() ngay lập tức thay vì phải đợi tới mốc của vòng lặp
// tự động (startAutoSyncLoop). Hoạt động cả khi "Đồng bộ hoá tự động" đang TẮT — gọi thẳng
// autoSyncNow(), KHÔNG đụng tới vòng lặp/công tắc bật-tắt (isAutoSyncOn() ở trên).
async function syncNowManual(e){
  if(e)e.stopPropagation();
  // Trước đây return thẳng ở đây khi trùng lúc vòng lặp tự động đang chạy nền — khiến nút bấm
  // như "vô tác dụng" (không có bất kỳ phản hồi gì) mỗi khi rơi đúng lúc autoSyncNow() của vòng
  // lặp chưa kịp xong. Giữ nguyên việc CHẶN chạy chồng (vẫn không gọi lại autoSyncNow()), nhưng
  // báo cho người dùng biết đang có 1 lượt đồng bộ chạy rồi, tránh cảm giác bấm mà không thấy gì.
  if(_autoSyncRunning){setAutoSyncStatusText('Đang sao lưu...');return;}
  await autoSyncNow({flush:true}); // dùng CHUNG đúng 1 logic đồng bộ với vòng lặp tự động, không viết trùng
}

// Khởi động lại vòng lặp nếu đã bật từ trước (mở lại app/reload trang), khôi phục lựa chọn khoảng
// thời gian đồng bộ đã lưu vào dropdown, và cập nhật trạng thái đăng nhập trong menu avatar. Đợi
// tới sự kiện 'load' (thay vì chạy ngay khi nạp file, dù S/libGetAll/saveSession lúc này đã tồn
// tại vì backup.js nạp SAU khối <script> chính) để chắc chắn IndexedDB/thư viện đã sẵn sàng, tránh
// gọi vào lúc trang còn đang khởi tạo dở.
// Công tắc "Đồng bộ hoá tự động" Tắt → KHÔNG đồng bộ gì cả (chỉ nút "Đồng bộ ngay" mới chạy thủ công).
// Công tắc Bật → mỗi lần tải lại trang đồng bộ ngay, rồi lặp theo chu kỳ.
function bootSyncOnPageOpen(){
  try{resumeExternalDriveAuth();}catch(e){}
  renderAutoSyncSwitch();
  syncAutoSyncIntervalSelects();
  renderSyncAccountUI();
  if(isAutoSyncOn())startAutoSyncLoop(); // đã tự gọi autoSyncNow() ngay, rồi lặp theo chu kỳ
}
// Nếu file được nạp muộn (sau khi sự kiện 'load' đã bắn) thì chạy luôn, tránh listener không bao giờ được gọi.
if(document.readyState==='complete')bootSyncOnPageOpen();
else window.addEventListener('load',bootSyncOnPageOpen);
// Quay lại trang từ bộ nhớ đệm back/forward (bfcache) không bắn 'load' → đồng bộ ngay tại đây.
window.addEventListener('pageshow',function(e){
  if(e.persisted&&isAutoSyncOn())autoSyncNow();
});

// ===================================================================
// THÔNG BÁO UPDATE — quản trị viên bấm "Thông báo update" (menu avatar, dưới email) → mọi người đang mở
// web (và người mở web sau đó) thấy toast "Đã có phiên bản mới. Reload để update".
//  - Gửi: POST AUTH_WORKER_URL/notify/update kèm access token Google. Worker TỰ kiểm tra email có thuộc
//    danh sách quản trị không (xem worker-notify.js) — danh sách phía client chỉ để ẩn/hiện mục menu.
//  - Nhận: GET AUTH_WORKER_URL/notify/update → { id } (id đổi mỗi lần quản trị bấm). Mỗi trình duyệt chỉ
//    hiện 1 lần cho mỗi id (lưu localStorage), nên sau khi reload sẽ không hiện lại.
//  - Kiểm tra lúc mở web (hiện toast sau ~1 giây), rồi mỗi 5 phút và mỗi lần quay lại tab.
// ===================================================================
const UPDATE_ADMIN_EMAILS=['thienco.tcc@gmail.com','noveltools.ai@gmail.com'];
const LS_UPDATE_SEEN='nt-update-seen';
const UPDATE_POLL_MS=5*60*1000;
const UPDATE_TOAST_DELAY_MS=1000;
let _updateLastCheck=0,_updateToastEl=null;

function isUpdateAdmin(email){return !!email&&UPDATE_ADMIN_EMAILS.indexOf(String(email).trim().toLowerCase())>=0;}
function getUpdateSeen(){try{return localStorage.getItem(LS_UPDATE_SEEN)||'';}catch(e){return '';}}
function setUpdateSeen(v){try{localStorage.setItem(LS_UPDATE_SEEN,v);}catch(e){}}

async function sendUpdateNotice(ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  const btn=document.getElementById('syncNotifyUpdateBtn');
  if(!isUpdateAdmin(getStoredDriveEmail()))return;
  if(!confirm('Gửi thông báo "Đã có phiên bản mới" cho tất cả người dùng?'))return;
  if(btn)btn.disabled=true;
  try{
    const token=await ensureDriveToken();
    const res=await fetch(AUTH_WORKER_URL+'/notify/update',{method:'POST',headers:{'Authorization':'Bearer '+token}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.id)throw new Error(data.error||'Gửi thông báo thất bại');
    setUpdateSeen(data.id); // máy quản trị không cần tự nhận lại thông báo vừa gửi
    if(typeof closeSyncMenu==='function')closeSyncMenu();
    toast('Đã gửi thông báo update');
  }catch(e){
    toast(_bt('Chưa gửi được: {x1}',{x1:((e&&e.message)||_bt('lỗi không rõ'))}));
  }finally{
    if(btn)btn.disabled=false;
  }
}

function showUpdateToast(){
  if(_updateToastEl)return;
  const el=document.createElement('div');
  el.setAttribute('role','status');
  el.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:10px 12px 10px 16px;background:var(--bg2,#1f2024);color:var(--text,#e6e6ea);border:1px solid var(--border,#3a3b42);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:13.5px;line-height:1.4;';
  const tx=document.createElement('span');
  tx.textContent='Đã có phiên bản mới. Reload để update';
  const go=document.createElement('button');
  go.type='button';go.textContent='Reload';
  go.style.cssText='flex:none;padding:6px 14px;border:none;border-radius:8px;background:var(--accent,#6366f1);color:#fff;font-size:13px;font-weight:500;cursor:pointer;';
  go.onclick=function(){location.reload();};
  const x=document.createElement('button');
  x.type='button';x.textContent='✕';x.setAttribute('aria-label','Đóng');
  x.style.cssText='flex:none;padding:4px 6px;border:none;background:none;color:var(--text3,#9a9b9e);font-size:14px;cursor:pointer;';
  x.onclick=function(){el.remove();_updateToastEl=null;};
  el.appendChild(tx);el.appendChild(go);el.appendChild(x);
  document.body.appendChild(el);
  _updateToastEl=el;
}

async function checkUpdateNotice(){
  _updateLastCheck=Date.now();
  try{
    const res=await fetch(AUTH_WORKER_URL+'/notify/update',{cache:'no-store'});
    if(!res.ok)return;
    const data=await res.json();
    if(!data||!data.id||data.id===getUpdateSeen())return;
    setUpdateSeen(data.id);
    showUpdateToast();
  }catch(e){/* tính năng phụ: lỗi mạng thì bỏ qua lặng lẽ */}
}

function startUpdateNoticeWatcher(){
  setTimeout(checkUpdateNotice,UPDATE_TOAST_DELAY_MS);
  setInterval(function(){if(!document.hidden)checkUpdateNotice();},UPDATE_POLL_MS);
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden&&Date.now()-_updateLastCheck>60000)checkUpdateNotice();
  });
}
if(document.readyState==='complete')startUpdateNoticeWatcher();
else window.addEventListener('load',startUpdateNoticeWatcher);
