/* Open-source Hama phoneme ASR + G2P, client-side. Requires built assets from tools/pronunciation-build. */
(function(){'use strict';
let modelsPromise=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function phonemes(s){return String(s||'').normalize('NFKC').replace(/[ˈˌː]/g,'').split(/[\s|/]+/u).filter(Boolean);}
function distance(a,b){const m=b.length,prev=Array.from({length:m+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let before=prev[0];prev[0]=i;for(let j=1;j<=m;j++){const old=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,before+(a[i-1]===b[j-1]?0:1));before=old}}return prev[m];}
async function models(){
 if(!modelsPromise)modelsPromise=(async()=>{
  const base=new URL('./pronunciation-assets/',document.baseURI);
  const files=['hama-browser.js','asr_waveform.hama','encoder.hama','decoder_step.hama','hama.wasm'];
  for(const f of files){const url=new URL(f,base);let response;try{response=await fetch(url,{method:'HEAD',cache:'no-store'})}catch(e){throw new Error('Cannot access '+f+' ('+e.message+'). Check GitHub Pages path and network.')}if(!response.ok)throw new Error(f+' returned HTTP '+response.status+'. Upload the complete pronunciation-assets folder beside speaking.html.');}
  let m;try{m=await import(new URL('hama-browser.js',base).href)}catch(e){throw new Error('Could not load hama-browser.js: '+e.message)}
  if(!m.ASRBrowserModel||!m.G2PBrowserModel)throw new Error('Hama module exports missing. Rebuild pronunciation-assets.');
  try{return {asr:await m.ASRBrowserModel.create({modelUrl:new URL('asr_waveform.hama',base).href}),g2p:await m.G2PBrowserModel.create({encoderUrl:new URL('encoder.hama',base).href,decoderStepUrl:new URL('decoder_step.hama',base).href})}}catch(e){throw new Error('Hama model initialization failed: '+e.message)}
 })().catch(e=>{modelsPromise=null;throw e});return modelsPromise;
}
async function evaluate(blob,reference){if(!blob||!reference?.trim())return {score:null,reason:'Audio or reference text unavailable'};
 const {asr,g2p}=await models();let ac=new (window.AudioContext||window.webkitAudioContext)();let decoded;
 try{decoded=await ac.decodeAudioData(await blob.arrayBuffer())}finally{await ac.close()}
 const pcm=new Float32Array(decoded.length);for(let c=0;c<decoded.numberOfChannels;c++){const channel=decoded.getChannelData(c);for(let i=0;i<pcm.length;i++)pcm[i]+=channel[i]/decoded.numberOfChannels}
 const [heard,expected]=await Promise.all([asr.transcribeWaveform(pcm,decoded.sampleRate),g2p.predict(reference)]);
 const expectedPhones=phonemes(expected.ipa),heardPhones=phonemes(heard.phonemeText);
 if(expectedPhones.length<3||heardPhones.length<3)return {score:null,reason:'Not enough recognized phonemes to assess'};
 const error=distance(expectedPhones,heardPhones),per=error/expectedPhones.length;
 // Phoneme recognition similarity: NOT calibrated Pearson pronunciation score.
 const score=Math.round(clamp(90*(1-per),10,90));
 return {score,method:'hama-phoneme-asr-edit-distance',phonemeErrorRate:Math.round(per*100),expectedCount:expectedPhones.length,heardCount:heardPhones.length};
}
window.PTEPronunciation={evaluate};
})();
