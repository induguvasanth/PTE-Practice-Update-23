(()=>{'use strict';
const RECORDS='pte_progress_v4',ACTIVE='pte_active_student_v4';
const read=()=>{try{return JSON.parse(localStorage.getItem(RECORDS)||'[]')}catch{return []}};
const task=r=>{const item=String(r.item||'');const match=item.match(/^([A-Za-z][A-Za-z0-9]*)\s*\/\s*Question\s+\d+/i);const raw=match?match[1]:String(r.module||'');return raw.trim().replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,120)};
const qid=r=>String(r.questionId||r.item||'').trim().replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,120);
const key=r=>[r.studentId,task(r),qid(r)].join('|');let busy=false,queued=false,timer;const sent=new Map();
async function sync(){const user=window.PTEAuth?.session();if(!user||busy)return;busy=true;try{
for(const r of read().filter(x=>x.studentId===user.studentId)){
 if(!task(r)||!qid(r))continue;const sig=key(r)+'|'+r.updatedAt+'|'+r.finished+'|'+r.score;if(sent.get(key(r))===sig)continue;
 const response=await window.PTEAuth.request('write',{action:'saveQuestionProgress',studentId:user.studentId,studentToken:user.studentToken,task:task(r),questionId:qid(r),status:r.finished?'finished':'attempted',score:r.score??''});
 if(!response?.ok)throw Error(response?.error||'Save failed');sent.set(key(r),sig);
}
const remote=await window.PTEAuth.request('read',{action:'studentProgress',studentId:user.studentId,studentToken:user.studentToken});
if(!remote?.ok)throw Error(remote?.error||'Load failed');const map=new Map(read().filter(r=>r.studentId===user.studentId).map(r=>[key(r),r]));
for(const r of remote.records||[]){const k=[user.studentId,r.task,r.questionId].join('|');const local=map.get(k);if(local&&String(local.updatedAt||'')>=String(r.updatedAt||''))continue;map.set(k,{studentId:user.studentId,module:local?.module||r.task,item:local?.item||('Question '+r.questionId),questionId:r.questionId,finished:r.status==='finished',score:r.score===''?null:r.score,completedAt:r.completedAt||'',updatedAt:r.updatedAt})}
const others=read().filter(r=>r.studentId!==user.studentId);localStorage.setItem(RECORDS,JSON.stringify([...others,...map.values()]));window.PTEProgress?.refresh();window.dispatchEvent(new Event('pte:cloud-updated'));
}catch(e){console.warn('[PTE sync]',e.message);if(/session|login/i.test(e.message))window.PTEAuth?.open()}finally{busy=false;if(queued){queued=false;setTimeout(sync,500)}}}
function schedule(){clearTimeout(timer);timer=setTimeout(sync,350)}
window.addEventListener('pte:progress-changed',schedule);window.addEventListener('pte:student-changed',()=>{sent.clear();schedule()});window.addEventListener('online',schedule);window.PTECloud={sync,pull:sync,push:sync};setTimeout(schedule,900);
})();