(()=>{'use strict';
const KEY='pte_students_v4',ACTIVE='pte_active_student_v4',RECORDS='pte_progress_v4',CATALOG='pte_question_catalog_v6';
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const getStudents=()=>read(KEY,[]),getRecords=()=>read(RECORDS,[]),active=()=>localStorage.getItem(ACTIVE)||'';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateTime=v=>v?new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
const modules={'index.html':'Home','reading.html':'Reading','listening.html':'Listening','speaking.html':'Speaking & Writing','grammar.html':'Grammar','vocabulary.html':'Vocabulary','full-mock.html':'Full Mock'};
const page=location.pathname.split('/').pop()||'index.html';
const style=document.createElement('style');
style.textContent=`#pteStudentBar{position:fixed;bottom:12px;left:12px;z-index:9000;display:flex;align-items:center;gap:7px;padding:6px 9px;background:rgba(255,255,255,.96);border:1px solid #dce3ef;border-radius:12px;box-shadow:0 8px 28px #10182818;font:12px system-ui;color:#334155}#pteStudentBar select{font:12px system-ui;border:0;background:transparent;color:#334155;max-width:160px;outline:none}#pteStudentBar .pte-learner-icon{font-size:14px}#pteStudentBar[hidden]{display:none!important}.pteCompletionStamp{font:600 12px system-ui;color:#078147;margin:6px 0}`;
document.head.appendChild(style);
const bar=document.createElement('div');bar.id='pteStudentBar';bar.setAttribute('aria-label','Current student');document.body.append(bar);
let context=null;
const catalog=()=>read(CATALOG,[]);
function register(c){if(!c||c.item==='Module')return;const all=catalog();if(!all.some(x=>x.module===c.module&&x.item===c.item)){all.push(c);localStorage.setItem(CATALOG,JSON.stringify(all))}}
function recordAttempt(){const s=window.PTEAuth?.session()?.studentId||'',c=currentItem();if(!s||c.item==='Module'||recordFor(s,c.module,c.item))return;const all=getRecords();all.push({studentId:s,...c,finished:false,score:null,completedAt:null,updatedAt:new Date().toISOString()});localStorage.setItem(RECORDS,JSON.stringify(all));window.dispatchEvent(new CustomEvent('pte:progress-changed'));refresh()}

function currentItem(){return context||{module:modules[page]||page,item:'Module',questionId:''}}
function setContext(module,section,index,q){const id=String(q?.id??q?.ID??'').trim();const item=String(section||'Practice')+' / Question '+(Number(index)+1);const next={module,item,questionId:id||String(Number(index)+1)};if(!context||context.module!==next.module||context.item!==next.item||context.questionId!==next.questionId){context=next;register(next);window.PTEExamClock?.context(next);refresh()}}
function statusOf(s,c){const r=recordFor(s,c.module,c.item);return r?.finished?'Finished':r?'Attempted':'Not attempted'}
function recordFor(s,m,i){return getRecords().find(r=>r.studentId===s&&r.module===m&&r.item===i)}
function mark(done,score,meta){
 const studentId=window.PTEAuth?.session()?.studentId||'';if(!studentId){window.PTEAuth?.open();return false;}
 const c=meta?.context||currentItem();if(c.item==='Module')return false;
 const all=getRecords(),old=all.find(x=>x.studentId===studentId&&x.module===c.module&&x.item===c.item);
 const now=new Date().toISOString();
 const entry={...(old||{}),studentId,...c,finished:!!done,
   score:score??old?.score??null,completedAt:done?(old?.completedAt||now):null,updatedAt:now};
 const records=all.filter(x=>!(x.studentId===studentId&&x.module===c.module&&x.item===c.item));
 records.push(entry);localStorage.setItem(RECORDS,JSON.stringify(records));
 window.dispatchEvent(new CustomEvent('pte:progress-changed'));refresh();return true;
}

function refresh(){
 const s=active(),c=currentItem(),r=recordFor(s,c.module,c.item);
 const headerStatus=document.querySelector('.exam-head .status');
 if(headerStatus){let badge=document.getElementById('pteCompletionStamp');if(!badge){badge=document.createElement('div');badge.id='pteCompletionStamp';badge.className='pteCompletionStamp';headerStatus.insertAdjacentElement('afterend',badge)}badge.textContent=r?.finished?'✓ Finished · '+dateTime(r.completedAt||r.updatedAt):''}
}
window.PTEProgress={refresh,mark,markAttempted:recordAttempt,
 markScore:(score,meta)=>mark(true,score,meta),setContext,currentItem,getStudents,getRecords,active};refresh();
window.addEventListener('pte:progress-changed',()=>{if(page==='results.html'&&typeof draw==='function')draw()});

// Teacher-only results are served from Apps Script (?teacher=1), not public GitHub Pages.
})();
