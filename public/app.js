const SECS=[
  {k:'intro',label:'서론',hint:'주제를 열어 주는 단어'},
  {k:'body', label:'본론',hint:'근거와 내용을 펼치는 단어'},
  {k:'concl',label:'결론',hint:'정리하고 마무리하는 단어'}];
const N=15, INIT='0000';
const $=id=>document.getElementById(id);
let me=null, draft=null, dirty=false, stToken=null, tToken=null;
let all=[], selSid=null, pollT=null;

/* ---------- helpers ---------- */
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600)}
function blank(){return {intro:Array(N).fill(''),body:Array(N).fill(''),concl:Array(N).fill('')}}
function norm(w){const b=blank();for(const s of SECS){const a=(w&&w[s.k])||[];for(let i=0;i<N;i++)b[s.k][i]=typeof a[i]==='string'?a[i]:''}return b}
function filled(arr){return arr.filter(x=>x.trim()).length}
/* 학번 5자리: 1번째 = 학년, 2·3번째 = 반, 4·5번째 = 번호 (10101 → 1반 1번, 11021 → 10반 21번) */
function parseSid(sid){return {grade:+sid[0],cls:+sid.slice(1,3),num:+sid.slice(3)}}
function clsOf(s){return parseSid(s.sid).cls}
function fmtTime(iso){if(!iso)return '—';const d=new Date(iso);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function show(view){for(const v of ['vLogin','vPw','vStudent','vTeachLogin','vAdmin'])$(v).hidden=v!==view}
const ss={get(k){try{return sessionStorage.getItem(k)}catch(e){return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch(e){}},del(k){try{sessionStorage.removeItem(k)}catch(e){}}};

async function api(path,body,token){
  let r;
  try{
    r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  }catch(e){$('offline').hidden=false;throw {status:0,error:'서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.'}}
  $('offline').hidden=true;
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw {status:r.status,error:data.error||'요청을 처리하지 못했습니다.'};
  return data;
}

/* ---------- boot ---------- */
(async()=>{
  stToken=ss.get('suhaeng-st');tToken=ss.get('suhaeng-t');
  if(stToken){
    try{const d=await api('student',{action:'me'},stToken);enterStudent(d.student)}
    catch(e){stToken=null;ss.del('suhaeng-st')}
  }
})();

/* ---------- mode switch ---------- */
$('mStudent').onclick=()=>setMode(false);
$('mTeacher').onclick=()=>setMode(true);
function setMode(admin){
  $('mStudent').setAttribute('aria-pressed',!admin);$('mTeacher').setAttribute('aria-pressed',admin);
  if(admin){if(tToken){show('vAdmin');startAdmin()}else{$('teachErr').textContent='';show('vTeachLogin');$('inTeach').focus()}}
  else{stopAdmin();show(me?'vStudent':'vLogin')}
}

/* ---------- student login ---------- */
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const sid=$('inSid').value.trim(), name=$('inName').value.trim().replace(/\s+/g,''), pin=$('inPin').value.trim();
  const err=$('loginErr');err.textContent='';
  if(!/^\d{5}$/.test(sid))return err.textContent='학번은 숫자 5자리입니다. (예: 1학년 3반 5번 → 10305)';
  if(!name)return err.textContent='이름을 입력하세요.';
  if(!/^\d{4}$/.test(pin))return err.textContent='비밀번호는 숫자 4자리입니다.';
  $('loginBtn').disabled=true;
  try{
    const d=await api('student',{action:'login',sid,name,pin});
    stToken=d.token;ss.set('suhaeng-st',stToken);
    $('inPin').value='';
    enterStudent(d.student);
    if(d.mustChange){$('pwMsg').textContent='초기 비밀번호(0000)를 사용 중입니다. 나만 아는 숫자 4자리로 바꿔 주세요.';show('vPw')}
  }catch(ex){err.textContent=ex.error}
  finally{$('loginBtn').disabled=false}
});

/* ---------- password ---------- */
$('toPw').onclick=()=>{$('pwMsg').textContent='새로 사용할 숫자 4자리를 입력하세요.';$('pwErr').textContent='';show('vPw')};
$('pwForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const a=$('inPw1').value.trim(), b=$('inPw2').value.trim(), err=$('pwErr');err.textContent='';
  if(!/^\d{4}$/.test(a))return err.textContent='숫자 4자리로 입력하세요.';
  if(a===INIT)return err.textContent='0000은 초기 비밀번호라 사용할 수 없습니다.';
  if(a!==b)return err.textContent='두 번 입력한 비밀번호가 다릅니다.';
  try{
    const d=await api('student',{action:'password',newPin:a},stToken);
    stToken=d.token;ss.set('suhaeng-st',stToken);
    $('inPw1').value=$('inPw2').value='';
    toast('비밀번호를 바꿨습니다.');show('vStudent');
  }catch(ex){err.textContent=ex.error;if(ex.status===401)logoutNow()}
});

/* ---------- student ---------- */
function enterStudent(data){
  me={...data};draft=norm(data.words);dirty=false;
  const p=parseSid(me.sid);
  $('stName').textContent=me.name;$('stSid').textContent=`${p.cls}반 ${p.num}번 · ${me.sid}`;
  buildInputs();setTab('write');setState();show('vStudent');
}
function logoutNow(){me=null;draft=null;dirty=false;stToken=null;ss.del('suhaeng-st');show('vLogin')}
$('logout').onclick=()=>{
  const btn=$('logout');
  if(dirty&&!btn.dataset.armed){btn.dataset.armed='1';btn.textContent='저장 안 하고 나가기';setTimeout(()=>{delete btn.dataset.armed;btn.textContent='로그아웃'},4000);return}
  delete btn.dataset.armed;btn.textContent='로그아웃';logoutNow();
};
$('tWrite').onclick=()=>setTab('write');
$('tView').onclick=()=>setTab('view');
function setTab(t){
  $('tWrite').setAttribute('aria-selected',t==='write');$('tView').setAttribute('aria-selected',t==='view');
  $('writePane').hidden=t!=='write';$('viewPane').hidden=t!=='view';
  if(t==='view')renderWords($('viewPane'),me.words,true);
}
function buildInputs(){
  const box=$('secInputs');box.textContent='';
  for(const s of SECS){
    const sec=document.createElement('div');sec.className='sec';sec.dataset.k=s.k;
    sec.innerHTML=`<div class="sec-head"><h2>${s.label}<span class="hint">${s.hint}</span></h2><span class="count"><b>0</b> / ${N}</span></div><div class="meter"><i></i></div><div class="grid"></div>`;
    const grid=sec.querySelector('.grid');
    for(let i=0;i<N;i++){
      const cell=document.createElement('label');cell.className='cell';
      cell.innerHTML=`<span class="no">${i+1}</span>`;
      const inp=document.createElement('input');inp.id=`w-${s.k}-${i}`;inp.maxLength=20;inp.value=draft[s.k][i];
      inp.setAttribute('aria-label',`${s.label} ${i+1}번 단어`);
      inp.addEventListener('input',()=>{draft[s.k][i]=inp.value;dirty=true;setState();refreshSec(sec,s.k)});
      inp.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();const nx=i<N-1&&document.getElementById(`w-${s.k}-${i+1}`);if(nx)nx.focus()}});
      cell.appendChild(inp);grid.appendChild(cell);
    }
    box.appendChild(sec);refreshSec(sec,s.k);
  }
}
function refreshSec(sec,k){
  const arr=draft[k], n=filled(arr);
  sec.querySelector('.count b').textContent=n;
  sec.querySelector('.meter i').style.width=(n/N*100)+'%';
  const seen={};arr.forEach(w=>{const t=w.trim();if(t)seen[t]=(seen[t]||0)+1});
  sec.querySelectorAll('.cell').forEach((c,i)=>c.classList.toggle('dup',!!arr[i].trim()&&seen[arr[i].trim()]>1));
}
function setState(){
  const st=$('saveState');
  if(dirty){st.textContent='저장하지 않은 변경이 있습니다';st.className='state dirty'}
  else{st.textContent=me&&me.updatedAt?`저장됨 · ${fmtTime(me.updatedAt)}`:'아직 저장한 단어가 없습니다';st.className='state'+(me&&me.updatedAt?' saved':'')}
}
$('saveBtn').onclick=async()=>{
  const btn=$('saveBtn');btn.disabled=true;
  try{
    const d=await api('student',{action:'save',words:draft},stToken);
    me=d.student;dirty=false;setState();
    const total=SECS.reduce((a,s)=>a+filled(me.words[s.k]),0);
    toast(total===N*3?'45개 단어를 모두 저장했습니다.':`저장했습니다. (${total} / ${N*3})`);
  }catch(ex){toast(ex.error)}
  finally{btn.disabled=false}
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

/* ---------- shared word renderer ---------- */
function renderWords(box,words,showEmpty){
  box.textContent='';const w=norm(words);
  for(const s of SECS){
    const sec=document.createElement('div');sec.className='sec';sec.dataset.k=s.k;
    const n=filled(w[s.k]);
    const head=document.createElement('div');head.className='sec-head';
    head.innerHTML=`<h3>${s.label}</h3><span class="count"><b>${n}</b> / ${N}</span>`;
    const chips=document.createElement('div');chips.className='chips';
    w[s.k].forEach((x,i)=>{
      if(!x.trim()&&!showEmpty)return;
      const c=document.createElement('span');c.className='chip'+(x.trim()?'':' empty');
      const sm=document.createElement('small');sm.textContent=i+1;c.appendChild(sm);
      c.appendChild(document.createTextNode(x.trim()||'비어 있음'));chips.appendChild(c);
    });
    if(!n&&!showEmpty){const m=document.createElement('span');m.className='muted';m.textContent='입력한 단어가 없습니다.';chips.appendChild(m)}
    sec.append(head,chips);box.appendChild(sec);
  }
}

/* ---------- teacher login ---------- */
$('teachForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const password=$('inTeach').value;$('inTeach').value='';
  try{
    const d=await api('teacher',{action:'login',password});
    tToken=d.token;ss.set('suhaeng-t',tToken);setMode(true);
  }catch(ex){$('teachErr').textContent=ex.error}
});
$('teachOut').onclick=()=>{
  tToken=null;ss.del('suhaeng-t');all=[];selSid=null;setMode(false);toast('관리 화면을 잠갔습니다.');
};

/* ---------- admin ---------- */
async function loadAll(){
  try{
    const d=await api('teacher',{action:'list'},tToken);
    all=d.students;fillClasses();renderAdmin();
  }catch(ex){
    if(ex.status===401){tToken=null;ss.del('suhaeng-t');stopAdmin();$('teachErr').textContent='다시 로그인해 주세요.';show('vTeachLogin')}
    else toast(ex.error);
  }
}
function startAdmin(){loadAll();clearInterval(pollT);pollT=setInterval(()=>{if(!document.hidden)loadAll()},30000)}
function stopAdmin(){clearInterval(pollT);pollT=null}
$('refreshBtn').onclick=async()=>{await loadAll();toast('최신 내용으로 바꿨습니다.')};

function fillClasses(){
  const sel=$('fClass'), cur=sel.value;
  const keys=[...new Set(all.map(clsOf))].sort((a,b)=>a-b).map(String);
  sel.textContent='';
  for(const k of keys){const o=document.createElement('option');o.value=k;o.textContent=`${k}반`;sel.appendChild(o)}
  if(keys.includes(cur))sel.value=cur;
}
$('fScope').onchange=()=>{const v=$('fScope').value;$('fClass').hidden=v!=='class';$('fQ').hidden=v!=='one';if(v==='one')$('fQ').focus();renderAdmin()};
$('fClass').onchange=renderAdmin;
$('fQ').oninput=renderAdmin;

function status(s){const w=norm(s.words);return {w,t:SECS.reduce((a,x)=>a+filled(w[x.k]),0)}}
function visible(){
  const v=$('fScope').value;
  if(v==='class'){const k=$('fClass').value;return all.filter(s=>String(clsOf(s))===k)}
  if(v==='one'){const q=$('fQ').value.trim();if(!q)return [];return all.filter(s=>s.sid.includes(q)||s.name.includes(q))}
  return all;
}
function renderAdmin(){
  const list=visible();
  if($('fScope').value==='one'&&list.length===1)selSid=list[0].sid;
  const done=list.filter(s=>status(s).t===N*3).length, started=list.filter(s=>{const t=status(s).t;return t>0&&t<N*3}).length;
  const scopeLabel={all:'전체',class:$('fClass').selectedOptions[0]?.textContent||'반',one:'검색 결과'}[$('fScope').value];
  $('stats').textContent='';
  for(const[b,l]of[[list.length,`${scopeLabel} 학생`],[done,'45개 완료'],[started,'작성 중'],[list.length-done-started,'미작성']]){
    const d=document.createElement('div');d.className='stat';
    const bb=document.createElement('b');bb.textContent=b;const sp=document.createElement('span');sp.textContent=l;
    d.append(bb,sp);$('stats').appendChild(d);
  }
  const tb=$('rows');tb.textContent='';
  for(const s of list){
    const {w,t}=status(s), tr=document.createElement('tr');
    if(s.sid===selSid)tr.className='sel';
    tr.innerHTML='<td class="num"></td><td></td>'+SECS.map(x=>{const n=filled(w[x.k]);return `<td><span class="frac${n===N?' full':''}">${n} / ${N}</span></td>`}).join('')+'<td></td><td class="num"></td>';
    tr.children[0].textContent=s.sid;tr.children[1].textContent=s.name;
    const pill=document.createElement('span');
    if(t===N*3){pill.className='pill done';pill.textContent='완료'}else if(t>0){pill.className='pill part';pill.textContent='작성 중'}else{pill.className='pill none';pill.textContent='미작성'}
    tr.children[5].appendChild(pill);
    if(s.initialPw){const p=document.createElement('span');p.className='pill reset';p.style.marginLeft='6px';p.textContent='초기 비번';tr.children[5].appendChild(p)}
    tr.children[6].textContent=fmtTime(s.updatedAt);
    tr.onclick=()=>{selSid=s.sid;renderAdmin()};
    tb.appendChild(tr);
  }
  const noRows=$('noRows');
  noRows.hidden=list.length>0;
  if($('fScope').value==='one')noRows.textContent=$('fQ').value.trim()?'검색 결과가 없습니다.':'학번이나 이름을 입력하면 해당 학생을 보여 줍니다.';
  else noRows.textContent='아직 로그인한 학생이 없습니다. 학생이 학번·이름·0000으로 처음 로그인하면 여기에 나타납니다.';
  renderDetail();
}
function armed(btn,label,fn){
  btn.onclick=async()=>{
    if(!btn.classList.contains('armed')){btn.classList.add('armed');const o=btn.textContent;btn.textContent=label;btn._t=setTimeout(()=>{btn.classList.remove('armed');btn.textContent=o},4000);return}
    clearTimeout(btn._t);btn.disabled=true;try{await fn()}finally{btn.disabled=false}
  };
}
function renderDetail(){
  const box=$('detail'), s=all.find(x=>x.sid===selSid);
  if(!s){box.hidden=true;return}
  box.hidden=false;box.textContent='';
  const p=parseSid(s.sid);
  const head=document.createElement('div');head.className='who';
  const nm=document.createElement('div');
  const a=document.createElement('span');a.className='name';a.textContent=s.name;
  const b=document.createElement('span');b.className='sid';b.textContent=`${p.cls}반 ${p.num}번 · ${s.sid} · 최근 저장 ${fmtTime(s.updatedAt)}`;
  nm.append(a,b);
  const act=document.createElement('div');act.className='actions';
  const rb=document.createElement('button');rb.className='btn danger sm';rb.textContent='비밀번호 0000으로 초기화';
  armed(rb,'한 번 더 누르면 초기화',async()=>{
    try{await api('teacher',{action:'reset',sid:s.sid},tToken);toast(`${s.name} 학생의 비밀번호를 0000으로 초기화했습니다.`);await loadAll()}catch(e){toast(e.error)}
  });
  const del=document.createElement('button');del.className='btn danger sm';del.textContent='학생 삭제';
  armed(del,'한 번 더 누르면 삭제',async()=>{
    try{await api('teacher',{action:'delete',sid:s.sid},tToken);selSid=null;toast(`${s.sid} ${s.name} 학생을 삭제했습니다.`);await loadAll()}catch(e){toast(e.error)}
  });
  const close=document.createElement('button');close.className='btn sm';close.textContent='닫기';close.onclick=()=>{selSid=null;renderAdmin()};
  act.append(rb,del,close);head.append(nm,act);
  const words=document.createElement('div');renderWords(words,s.words,false);
  box.append(head,words);
}

/* ---------- excel export (current view) ---------- */
$('xlsxBtn').onclick=()=>{
  const list=visible();
  if(!list.length)return toast('내려받을 학생이 없습니다.');
  if(!window.XLSX)return toast('엑셀 기능을 불러오지 못했습니다. 새로고침해 주세요.');
  const head=['학번','이름','반','번호','서론 개수','본론 개수','결론 개수','합계','상태','최근 저장'];
  for(const s of SECS)for(let i=1;i<=N;i++)head.push(`${s.label}${i}`);
  const rows=[head];
  for(const s of list){
    const {w,t}=status(s), p=parseSid(s.sid);
    const row=[s.sid,s.name,p.cls,p.num,...SECS.map(x=>filled(w[x.k])),t,t===N*3?'완료':t>0?'작성 중':'미작성',s.updatedAt?new Date(s.updatedAt).toLocaleString('ko-KR'):''];
    for(const x of SECS)row.push(...w[x.k].map(v=>v.trim()));
    rows.push(row);
  }
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=head.map((h,i)=>({wch:i<2?10:i===9?20:8}));
  const wb=XLSX.utils.book_new();
  const scope=$('fScope').value, label=scope==='class'?`${$('fClass').value}반`:scope==='one'?'검색결과':'전체';
  XLSX.utils.book_append_sheet(wb,ws,label);
  const d=new Date(), ymd=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  XLSX.writeFile(wb,`수행평가_단어_${label}_${ymd}.xlsx`);
  toast(`${list.length}명의 자료를 내려받았습니다.`);
};

$('rosterBtn').onclick=async()=>{
  const lines=$('rosterText').value.split(/\n/).map(l=>l.trim()).filter(Boolean);
  const msg=$('rosterMsg');let bad=0;const rows=[];
  for(const l of lines){const m=l.match(/^(\d{5})[\s,\t]+(.+)$/);if(m)rows.push({sid:m[1],name:m[2]});else bad++}
  if(!rows.length){msg.textContent='"학번 이름" 형식의 줄이 없습니다.';return}
  $('rosterBtn').disabled=true;msg.textContent='등록 중…';
  try{
    const d=await api('teacher',{action:'roster',rows},tToken);
    msg.textContent=`${d.added}명 등록, ${d.skipped}명 건너뜀`+((bad+d.bad)?`, ${bad+d.bad}줄 형식 오류`:'');
    if(d.added)$('rosterText').value='';
    await loadAll();
  }catch(e){msg.textContent=e.error}
  finally{$('rosterBtn').disabled=false}
};
