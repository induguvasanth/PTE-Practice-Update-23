(()=>{'use strict';
const BASE=String(window.PTE_SYNC_URL||'').trim();
const STORE='pte_student_session_v14',ACTIVE='pte_active_student_v4',RECORDS='pte_progress_v4';
const el=(tag,attrs={},text)=>{const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n};
const stored=()=>{try{const x=JSON.parse(localStorage.getItem(STORE)||'null');return x&&Date.parse(x.expiresAt)>Date.now()?x:null}catch{return null}};
let session=stored(),names=[],frame=null,ready=false,bridgeWindow=null,seq=0,pending=new Map(),opening=false;
if(!session)localStorage.removeItem(ACTIVE);else localStorage.setItem(ACTIVE,session.studentId);
const style=el('style');style.textContent=`#pteStudentBar{position:fixed!important;bottom:12px!important;left:12px!important;z-index:9000!important;background:white!important;border:1px solid #e3e6f0!important;border-radius:14px!important;padding:7px!important;box-shadow:0 8px 25px #11182720!important}#pteStudentBar .pte-learner-icon{display:none}#pteStudentBar button{border:0;background:#f0edff;color:#4f37ca;border-radius:9px;padding:8px 12px;font:700 12px system-ui;cursor:pointer}#pteAuthShade{position:fixed;inset:0;background:#101a36a6;z-index:2147483600;display:grid;place-items:center;padding:14px}#pteAuthShade[hidden]{display:none!important}#pteAuthCard{background:white;border-radius:22px;padding:28px;width:min(420px,100%);box-shadow:0 30px 90px #0003;font:14px system-ui;color:#17243b}#pteAuthCard h2{margin:0 0 8px;font-size:24px}#pteAuthCard p{color:#68768d;line-height:1.5}#pteAuthCard label{display:block;font-weight:700;font-size:12px;margin:15px 0 6px}#pteAuthCard select,#pteAuthCard input{width:100%;border:1px solid #d7dfea;border-radius:10px;padding:12px;font:inherit;box-sizing:border-box}#pteAuthCard button{border:0;border-radius:10px;background:#6244ea;color:white;padding:12px;font-weight:700;cursor:pointer}#pteAuthCard .pteAuthClose{background:#eef1f8;color:#4d5c71}#pteAuthCard .pteAuthError{color:#b52d3e;min-height:22px;margin-top:12px}#pteAuthCard .pteAuthActions{display:flex;gap:10px;margin-top:20px}#pteAuthCard .pteAuthActions button{flex:1}`;document.head.appendChild(style);
function auth(){return session&&Date.parse(session.expiresAt)>Date.now()?session:null}
function setSession(s){session=s;if(s){localStorage.setItem(STORE,JSON.stringify(s));localStorage.setItem(ACTIVE,s.studentId)}else{localStorage.removeItem(STORE);localStorage.removeItem(ACTIVE)}window.dispatchEvent(new Event('pte:student-changed'));window.PTEProgress?.refresh();renderBar()}
function logout(){setSession(null);localStorage.removeItem(RECORDS);window.location.href='index.html'}
function bridge(){if(frame)return;frame=el('iframe',{src:BASE+'?bridge=1',title:'PTE secure connection','aria-hidden':'true'});frame.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';document.body.appendChild(frame)}
// Apps Script HTML Service can nest its actual content inside a Google-owned frame.
// Keep the source window that sends READY and send subsequent requests directly to it.
window.addEventListener('message',e=>{
 const origin=e.origin;
 if(!/^https:\/\/(?:script\.google\.com|[a-z0-9.-]*googleusercontent\.com)$/i.test(origin))return;
 const d=e.data||{};
 if(d.type==='PTE_BRIDGE_READY'){
   if(!frame)return;
   bridgeWindow=e.source;ready=true;return;
 }
 if(d.type!=='PTE_BRIDGE_RESPONSE'||e.source!==bridgeWindow)return;
 const p=pending.get(d.id);if(!p)return;
 pending.delete(d.id);clearTimeout(p.timeout);
 d.error?p.reject(Error(d.error)):p.resolve(d.result);
});
async function request(method,params){
 if(!BASE)throw Error('Apps Script URL is not configured');
 bridge();
 for(let i=0;i<100&&!ready;i++)await new Promise(r=>setTimeout(r,100));
 if(!ready)throw Error('Apps Script bridge did not respond. Deploy the updated Bridge.html and Code.gs as a NEW Apps Script version, then reload this page.');
 return new Promise((resolve,reject)=>{
  const id='req'+(++seq);
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Apps Script request timed out. Verify Web App access and Google Sheets permissions.'))},25000);
  pending.set(id,{resolve,reject,timeout});
  bridgeWindow.postMessage({type:'PTE_BRIDGE_REQUEST',id,method,params},'*');
 });
}
async function directory(){const x=await request('read',{action:'studentDirectory'});if(!x?.ok)throw Error(x?.error||'Cannot load student list');names=x.students||[];return names}
async function login(id,password){const x=await request('write',{action:'studentLogin',studentId:id,password});if(!x?.ok)throw Error(x?.error||'Login failed');setSession(x);return x}
function renderBar(){const b=document.getElementById('pteStudentBar');if(!b)return;b.replaceChildren();const btn=el('button',{},auth()?'👤 '+session.studentName+' · My progress':'👤 Student Login');btn.type='button';btn.onclick=()=>auth()?window.location.assign('student.html'):open();b.appendChild(btn);if(auth()){const out=el('button',{},'Sign out');out.style.marginLeft='5px';out.onclick=logout;b.appendChild(out)}}
let shade=null;
async function open(){if(opening)return;opening=true;if(!shade){shade=el('div',{id:'pteAuthShade'});shade.innerHTML=`<form id="pteAuthCard"><h2>Student Login</h2><p>Select your name and enter the password provided by your teacher. Your login is remembered on this browser.</p><label for="pteName">Student</label><select id="pteName" required><option value="">Loading students…</option></select><label for="ptePassword">Password</label><input id="ptePassword" type="password" autocomplete="current-password" required placeholder="Enter your password"><div class="pteAuthActions"><button type="button" class="pteAuthClose">Cancel</button><button type="submit">Sign in</button></div><div class="pteAuthError" role="alert"></div></form>`;document.body.appendChild(shade);shade.querySelector('.pteAuthClose').onclick=()=>{shade.hidden=true;opening=false};shade.addEventListener('pointerdown',e=>{if(e.target===shade){shade.hidden=true;opening=false}});shade.querySelector('form').onsubmit=async e=>{e.preventDefault();const id=shade.querySelector('select').value,pass=shade.querySelector('input').value,err=shade.querySelector('.pteAuthError'),btn=shade.querySelector('button[type=submit]');err.textContent='';btn.disabled=true;try{await login(id,pass);shade.hidden=true;opening=false;shade.querySelector('input').value='';if(location.pathname.endsWith('student.html'))window.PTEStudentPage?.refresh()}catch(x){err.textContent=x.message}finally{btn.disabled=false}}}
shade.hidden=false;shade.querySelector('.pteAuthError').textContent='';try{await directory();const select=shade.querySelector('select');select.replaceChildren(el('option',{value:''},'Choose your name'));names.forEach(x=>select.appendChild(el('option',{value:x.id},x.name+' ('+x.id+')')))}catch(e){shade.querySelector('.pteAuthError').textContent=e.message}finally{opening=false}}
window.PTEAuth={session:auth,login,logout,open,directory,request,refreshBar:renderBar};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{renderBar();bridge()});else{renderBar();bridge()}
})();