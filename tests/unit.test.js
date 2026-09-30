import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_PRESETS,resultSchema,buildPrompt,validateResult} from '../ai/prompts.js';
import {chunkSources,mergeResults,ChromeAIEngine,analyzePageData,imageBlob,availabilityLabel} from '../ai/analyzer.js';
import {listPresets,savePreset,deletePreset} from '../presets/preset-store.js';
import {isRestrictedPage,pageAccessError} from '../core/page-service.js';
const store=()=>{let data={};return {get:async key=>({[key]:structuredClone(data[key])}),set:async value=>{data={...data,...structuredClone(value)};}};};
test('custom presets persist, update and delete without changing builtins',async()=>{
  const storage=store();const p=await savePreset({name:' 제약사항 ',prompt:'Only find constraints'},storage);
  assert.equal(p.name,'제약사항');assert.equal((await listPresets(storage)).length,5);
  await savePreset({...p,name:'수정'},storage);assert.equal((await listPresets(storage)).at(-1).name,'수정');
  await assert.rejects(deletePreset('general',storage));await deletePreset(p.id,storage);assert.equal((await listPresets(storage)).length,4);
  await assert.rejects(savePreset({name:'',prompt:'x'},storage));
});
test('chunks retain all text, order and source IDs for oversized sources',()=>{
  const sources=[{id:'source-1',text:'a'.repeat(15000)},{id:'source-2',text:'b'.repeat(2000)}];
  const chunks=chunkSources(sources);assert.equal(chunks.flat().map(x=>x.text).join(''),sources.map(x=>x.text).join(''));
  assert(chunks.every(c=>c.reduce((n,s)=>n+s.text.length,0)<=6500));assert.equal(chunks[0][0].id,'source-1');
});
test('preset and question change prompt and schemas',()=>{
  const a=buildPrompt(BUILTIN_PRESETS[0],'Find errors',{sources:[]},[],'en');
  const b=buildPrompt(BUILTIN_PRESETS[1],'Find constraints',{sources:[]},[],'en');
  assert.notEqual(a,b);assert(a.includes('Find errors'));assert(resultSchema(BUILTIN_PRESETS[1]).required.includes('requirements'));
});
test('malformed structured output is rejected',()=>{
  assert.throws(()=>validateResult({answer:'x'},resultSchema(BUILTIN_PRESETS[0])));
});
test('API absence is explicit and image capability uses image modality',async()=>{
  const absent=new ChromeAIEngine(null);assert.equal((await absent.probe()).text,'api-missing');await assert.rejects(absent.prepare(),/API 없음/);
  const calls=[];const engine=new ChromeAIEngine({availability:async options=>{calls.push(options);return options.expectedInputs.some(x=>x.type==='image')?'unavailable':'available';}});
  assert.equal((await engine.probe()).image,'unavailable');assert(calls[1].expectedInputs.some(x=>x.type==='image'));
});
test('streamed JSON uses responseConstraint and destroys cloned session on parse failure',async()=>{
  let destroyed=false,options;
  const engine=new ChromeAIEngine(null);engine.sessions.text={clone:async()=>({promptStreaming:(p,o)=>{options=o;return (async function*(){yield '{"answer":';yield '"ok"}';})();},destroy:()=>{destroyed=true;}})};
  assert.equal((await engine.run('x',{type:'object'})).result.answer,'ok');assert(options.responseConstraint);assert(destroyed);
});
test('structured analysis keeps missing references explicit and never treats metadata as pixels',async()=>{
  const preset=BUILTIN_PRESETS[0];const result={answer:'ok'};for(const f of preset.fields)result[f]=[];result.confirmedFacts=[{text:'fact',sourceIds:['source-1','invented']}];
  let observedPrompt='';const engine={sessions:{text:{}},status:{image:'unavailable'},run:async p=>{observedPrompt=p;return {result:structuredClone(result)}}};
  const page={url:'https://example.test',title:'Page',sources:[{id:'source-1',text:'fact'}],headings:[],links:[],images:[{id:'image-1',alt:'metadata',filename:'a.png',ref:{url:'x'}}],selection:'',limitations:[],stats:{rawChars:4,collectedChars:4}};
  const report=await analyzePageData({page,preset,userPrompt:'What is confirmed?',engine,imageCaptures:[{id:'image-1',status:'captured',dataUrl:'data:image/png;base64,ignored'}]});
  assert.equal(report.imageResults[0].status,'unsupported');assert.equal(report.ai.image,'unsupported');
  assert.deepEqual(report.result.confirmedFacts[0].sourceIds,['source-1']);assert.deepEqual(report.result.confirmedFacts[0].invalidSourceIds,['invented']);assert(observedPrompt.includes('What is confirmed?'));
});
test('merge deduplicates identical evidence but retains different locations',()=>{
  const p={fields:['confirmedFacts']};const a={answer:'a',confirmedFacts:[{text:'same',sourceIds:['source-1']}]};const b={answer:'b',confirmedFacts:[...a.confirmedFacts,{text:'same',sourceIds:['source-2']}]};
  assert.equal(mergeResults([a,b],p).confirmedFacts.length,2);
});
test('local image data is decoded without network calls',async()=>{
  const blob=imageBlob('data:image/png;base64,aGVsbG8=');assert.equal(blob.type,'image/png');assert.equal(await blob.text(),'hello');
  assert.throws(()=>imageBlob('https://example.com/a.png'));
});
test('all official availability states have user-readable labels',()=>{
  assert.equal(availabilityLabel('available'),'바로 사용 가능');assert.equal(availabilityLabel('downloadable'),'로컬 모델 다운로드 필요');
  assert.equal(availabilityLabel('downloading'),'모델 다운로드 중');assert.equal(availabilityLabel('unavailable'),'현재 환경에서 사용 불가');
});
test('probe never downloads; user prepare creates downloadable model and reports loading progress',async()=>{
  let createCalls=0;const events=[];
  const engine=new ChromeAIEngine({availability:async()=> 'downloadable',create:async options=>{
    createCalls++;const monitor=new EventTarget();options.monitor(monitor);
    for(const loaded of [0.5,1]){const event=new Event('downloadprogress');Object.defineProperty(event,'loaded',{value:loaded});monitor.dispatchEvent(event);}
    return {destroy(){}};
  }});
  await engine.probe();assert.equal(createCalls,0);assert.equal(engine.status.text,'downloadable');
  await engine.prepare({images:false,onProgress:event=>events.push({...event,state:engine.status.text})});
  assert.equal(createCalls,1);assert(events.some(e=>e.message.includes('50%') && e.state==='downloading'));
  assert(events.some(e=>e.message.includes('모델 로딩 중')));assert.equal(engine.status.text,'available');engine.dispose();
});
test('restricted pages are distinguished from ordinary HTTP and HTTPS pages',()=>{
  for(const url of ['chrome://extensions','chrome-extension://abc/page.html','about:blank','devtools://devtools','view-source:https://example.com','https://chromewebstore.google.com/detail/test','https://chrome.google.com/webstore/detail/test']) assert.equal(isRestrictedPage(url),true,url);
  for(const url of ['http://example.com','https://another.example/page','https://chrome.google.com/docs','https://chromewebstore.google.com.evil.example/page']) assert.equal(isRestrictedPage(url),false,url);
});
test('script injection errors never expose raw browser messages',()=>{
  const raw=new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.');
  assert(pageAccessError(raw,'https://example.com').message.includes('사이트 액세스'));
  assert(!pageAccessError(raw,'https://example.com').message.includes('Cannot access'));
  assert(pageAccessError(raw).message.includes('Chrome 보안 정책'));
  assert(pageAccessError(raw,'chrome://extensions').message.includes('Chrome 보안 정책'));
  assert(pageAccessError(new Error('Cannot access a chrome:// URL')).message.includes('Chrome 보안 정책'));
  assert(pageAccessError(new Error('No tab with id: 1'),'https://example.com').message.includes('닫히거나 이동'));
  assert(!pageAccessError(new Error('internal raw details'),'https://example.com').message.includes('raw details'));
});
