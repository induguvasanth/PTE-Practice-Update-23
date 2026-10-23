/* Update 24: entirely local microphone acoustic timing; no uploads, keys, or paid API. */
(function(){'use strict';
let ctx,stream,source,analyser,handle,started,frames=[],last=null,recorder=null,chunks=[],audioBlob=null;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
async function start(){
  stop();frames=[];last=null;audioBlob=null;chunks=[];
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Secure HTTPS microphone access required');
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  if(window.MediaRecorder){try{recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>{audioBlob=chunks.length?new Blob(chunks,{type:recorder.mimeType||"audio/webm"}):null};recorder.start()}catch(e){recorder=null}}
  source=ctx.createMediaStreamSource(stream);analyser=ctx.createAnalyser();analyser.fftSize=2048;
  source.connect(analyser);const samples=new Float32Array(analyser.fftSize);started=performance.now();
  handle=setInterval(()=>{if(!analyser)return;analyser.getFloatTimeDomainData(samples);let power=0;
    for(let i=0;i<samples.length;i++)power+=samples[i]*samples[i];
    frames.push({time:(performance.now()-started)/1000,rms:Math.sqrt(power/samples.length)});
  },50);
}
function stop(){if(recorder&&recorder.state!=="inactive")try{recorder.stop()}catch(e){};if(handle){clearInterval(handle);handle=null}if(frames.length)last=frames.slice();
  if(source)try{source.disconnect()}catch(e){}source=null;analyser=null;
  if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
  if(ctx)ctx.close().catch(()=>{});ctx=null;
}
function result(words){const f=last||frames;if(f.length<12)return null;
  const levels=f.map(x=>x.rms).sort((a,b)=>a-b),noise=levels[Math.floor(levels.length*.15)]||0;
  const threshold=Math.max(.008,noise*2.8);const voiced=f.map(x=>x.rms>threshold);
  const speechFrames=voiced.filter(Boolean).length;
  if(speechFrames<8)return null;
  let first=voiced.indexOf(true),end=voiced.lastIndexOf(true),longPauses=0,pauseFrames=0,run=0;
  for(let i=first;i<=end;i++){if(!voiced[i])run++;else {if(run>=8){longPauses++;pauseFrames+=run}run=0}}
  if(run>=8){longPauses++;pauseFrames+=run}
  const speechSeconds=Math.round(speechFrames*.05*10)/10;
  const duration=Math.max(.1,(end-first+1)*.05);
  const wpm=Math.round((Number(words)||0)*60/duration);
  const articulation=Math.round((Number(words)||0)*60/Math.max(.1,speechSeconds));
  const pauseFraction=pauseFrames/Math.max(1,end-first+1);
  // Heuristic fluency score, not official PTE. Penalizes lengthy pauses and very fast/slow speech.
  const pacePenalty=Math.min(30,Math.abs(wpm-135)*.24);
  const pausePenalty=Math.min(28,pauseFraction*65+Math.max(0,longPauses-1)*2);
  const fluencyScore=Math.round(clamp(85-pacePenalty-pausePenalty,10,90));
  return {fluencyScore,speechSeconds,longPauses,wordsPerMinute:wpm,articulationRate:articulation,pauseFraction:Math.round(pauseFraction*100),method:'local-rms-voice-activity-heuristic',pronunciationScore:null};
}
window.PTEBrowserAcoustics={start,stop,result,getAudio:()=>audioBlob};
})();
