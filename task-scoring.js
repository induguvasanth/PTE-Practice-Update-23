/* Update 10: deterministic task-aware PRACTICE grading. Not Pearson scoring. */
(function(){'use strict';
const norm=v=>String(v??'').toLowerCase().normalize('NFKC').replace(/^[a-f][.)]\s*/i,'').replace(/[^\p{L}\p{N}\s']/gu,' ').replace(/\s+/g,' ').trim();
const split=v=>String(v??'').split(/\s*[|,;]\s*/).map(x=>x.trim()).filter(Boolean);
const opts=q=>Array.isArray(q.options)?q.options:split(q.options);
const label=(x,options)=>{if(typeof x==='number')return String(options[x]??'');if(/^\d+$/.test(String(x)))return String(options[+x]??x);return String(x??'')};
const key=(x,options)=>{const s=String(x??'').trim();if(/^[a-f]$/i.test(s)&&options.length)return norm(options[s.toUpperCase().charCodeAt(0)-65]??s);return norm(s)};
const equal=(a,b)=>norm(a)===norm(b);
function orderedAlignment(expected,actual){
 const a=norm(expected).split(' ').filter(Boolean),b=norm(actual).split(' ').filter(Boolean);
 if(a.length*b.length>160000)return {supported:false,reason:'Response too long to align safely'};
 const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
 let i=a.length,j=b.length;const missing=[],extra=[],matched=[];
 while(i&&j){if(a[i-1]===b[j-1]){matched.unshift({referenceIndex:i-1,responseIndex:j-1,word:a[i-1]});i--;j--}else if(dp[i-1][j]>=dp[i][j-1])missing.unshift({index:--i,word:a[i]});else extra.unshift({index:--j,word:b[j]})}
 while(i)missing.unshift({index:--i,word:a[i]});while(j)extra.unshift({index:--j,word:b[j]});
 return {supported:true,matched,missing,extra,referenceCount:a.length,responseCount:b.length};
}
function grade(q,response){const task=String(q.sourceTask||q.taskKey||q.type||'');const options=opts(q),ans=String(q.answer||'').trim();const selected=Array.isArray(response)?response.map(v=>label(v,options)): [label(response,options)];
if(!ans)return {supported:false,reason:'No answer key in sheet'};
if(/reorderParagraph/i.test(task)){
 const order=split(ans),shown=Array.isArray(response)?response.map(String):[];
 if(order.length<2||shown.length<2)return {supported:false,reason:'No complete paragraph ordering'};
 // The workbook uses 1-based ordering indices (e.g. 2|1|4|3). The UI may hold paragraph text.
 const ids=shown.map(x=>{const pos=options.findIndex(y=>equal(x,y));return pos>=0?String(pos+1):x});
 if(ids.some(x=>!/^\d+$/.test(x)))return {supported:false,reason:'Cannot map paragraph texts to original positions'};
 const pairs=new Set(order.slice(0,-1).map((x,i)=>x+'|'+order[i+1]));let earned=0;
 for(let i=0;i<ids.length-1;i++)if(pairs.has(ids[i]+'|'+ids[i+1]))earned++;
 return {supported:true,earned,possible:order.length-1,exact:earned===order.length-1,reason:'Adjacent correct paragraph pairs',feedback:{correctPairs:[...pairs],submittedPairs:ids.slice(0,-1).map((x,i)=>x+'|'+ids[i+1])},scoringMethod:'adjacent-pair-credit',practiceOnly:true};
}
if(/readingRWBlanks|readingBlanks|listeningBlanks/i.test(task)){
 const expected=split(ans),actual=selected; if(!expected.length)return {supported:false,reason:'No blank keys'};
 const earned=expected.reduce((n,x,i)=>n+(equal(x,actual[i])?1:0),0);
 return {supported:true,earned,possible:expected.length,exact:earned===expected.length,reason:'Correct blanks',feedback:{blanks:expected.map((answer,i)=>({index:i+1,expected:answer,actual:String(actual[i]||''),correct:equal(answer,actual[i])}))},scoringMethod:'exact-blank-match',practiceOnly:true};
}
if(/readingMCQMultiple|listeningMCQMultiple/i.test(task)){
 const expected=split(ans).map(x=>key(x,options));const actual=selected.map(x=>key(x,options));
 const correct=new Set(expected),picked=new Set(actual);let hit=0,wrong=0;picked.forEach(x=>correct.has(x)?hit++:wrong++);
 const earned=Math.max(0,hit-wrong);return {supported:true,earned,possible:correct.size,exact:hit===correct.size&&!wrong,reason:'Correct selections minus incorrect selections; minimum zero',feedback:{correct:[...correct],selected:[...picked],incorrect:[...picked].filter(x=>!correct.has(x)),missed:[...correct].filter(x=>!picked.has(x))},scoringMethod:'multiple-choice-partial-credit',practiceOnly:true};
}
if(/readingMCQSingle|listeningMCQSingle|highlightSummary|missingWord|grammar/i.test(task)){
 const expected=key(ans,options),actual=key(selected[0],options);
 const ok=expected===actual;return {supported:true,earned:ok?1:0,possible:1,exact:ok,reason:'Single correct answer'};
}
if(/dictation/i.test(task)){
 const aligned=orderedAlignment(ans,selected.join(' '));
 if(!aligned.supported)return aligned;
 const earned=aligned.matched.length,possible=aligned.referenceCount;
 return {supported:true,earned,possible,exact:earned===possible&&aligned.extra.length===0,
 reason:'Correct words in original sequence (practice alignment)',feedback:{missing:aligned.missing,extra:aligned.extra,matched:aligned.matched},
 scoringMethod:'ordered-word-alignment',practiceOnly:true};
}
if(/incorrectWords/i.test(task)){
 const expected=split(ans).map(norm),actual=selected.map(norm);const set=new Set(expected),chosen=new Set(actual);
 let hit=0,wrong=0;chosen.forEach(x=>set.has(x)?hit++:wrong++);
 return {supported:true,earned:Math.max(0,hit-wrong),possible:set.size,exact:hit===set.size&&!wrong,reason:'Correct highlights minus incorrect highlights',feedback:{correct:[...set],selected:[...chosen],incorrect:[...chosen].filter(x=>!set.has(x))},practiceOnly:true};
}
return {supported:false,reason:'Open-response task: requires human or configured AI evaluation'};
}
window.PTETaskScoring={grade,normalize:norm,split,orderedAlignment};
})();
