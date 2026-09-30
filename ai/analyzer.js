import {SYSTEM_PROMPT,IMAGE_SCHEMA,buildPrompt,resultSchema,validateResult} from './prompts.js';
const textOptions={expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]};
const imageOptions={...textOptions,expectedInputs:[...textOptions.expectedInputs,{type:'image'}]};
export function failure(error) {return {name:error.name || 'Error',message:error.message || String(error)};}
export function availabilityLabel(value) {
  return {available:'바로 사용 가능',downloadable:'로컬 모델 다운로드 필요',downloading:'모델 다운로드 중',unavailable:'현재 환경에서 사용 불가','api-missing':'현재 환경에서 사용 불가 · API 없음',failed:'현재 환경에서 사용 불가 · 상태 확인/준비 실패'}[value] || '상태 확인 중';
}
export function imageBlob(dataUrl) {
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if(!match) throw new Error('로컬 이미지 데이터 형식을 읽을 수 없습니다.');
  const bytes=Uint8Array.from(atob(match[2]),char=>char.charCodeAt(0));
  return new Blob([bytes],{type:match[1]});
}
export class ChromeAIEngine {
  constructor(api=globalThis.LanguageModel) {this.api=api;this.sessions={};this.status={};}
  async probe() {
    if(!this.api) return this.status={text:'api-missing',image:'api-missing',reason:'LanguageModel API가 이 Extension 문서에 노출되지 않습니다.'};
    for(const [type,options] of [['text',textOptions],['image',imageOptions]]) {
      try {this.status[type]=await this.api.availability(options);delete this.status[`${type}Error`];}
      catch(e) {this.status[type]='failed';this.status[`${type}Error`]=failure(e);}
    }
    return {...this.status};
  }
  async prepare({images=true,onProgress=()=>{},signal}={}) {
    if(!this.api) throw new Error('Chrome Built-in AI 사용 불가: LanguageModel API 없음. 최신 데스크톱 Chrome과 하드웨어 조건을 확인해주세요.');
    // Called from a user button; creation starts before page collection.
    await Promise.all(['text',...(images?['image']:[])].map(async type=> {
      if(this.sessions[type]) return;
      const options=type==='image'?imageOptions:textOptions;
      try {
        const state=await this.api.availability(options);this.status[type]=state;
        delete this.status[`${type}Error`];
        onProgress({stage:`model-${type}`,message:`${type==='image'?'이미지':'텍스트'}: ${availabilityLabel(state)} (${state})`});
        if(state==='unavailable') {if(type==='text') throw new Error(`Chrome Built-in AI 사용 불가 / 모델 상태: ${state}`); return;}
        const session=await this.api.create({...options,signal,initialPrompts:[{role:'system',content:SYSTEM_PROMPT}],monitor:m=>m.addEventListener('downloadprogress',e=>{
          this.status[type]='downloading';
          const percent=Math.round(e.loaded*100);
          onProgress({stage:`download-${type}`,message:`${type==='image'?'이미지':'텍스트'} 모델 ${percent>=100?'다운로드 완료 · 모델 로딩 중...':`다운로드 ${percent}%`}`});
        })});
        if(signal?.aborted) {session.destroy();throw new DOMException('취소됨','AbortError');}
        this.sessions[type]=session;this.status[type]='available';
        onProgress({stage:`model-${type}`,message:`${type==='image'?'이미지':'텍스트'}: 바로 사용 가능 (available)`});
      } catch(e) {this.status[`${type}Error`]=failure(e);if(type==='text' || e.name==='AbortError') throw e; this.status[type]='failed';}
    }));
    return {...this.status};
  }
  async run(prompt,schema,{type='text',signal,onStream=()=>{}}={}) {
    if(!this.sessions[type]) throw new Error(`${type} 모델 세션이 준비되지 않았습니다.`);
    const session=await this.sessions[type].clone({signal});
    try {
      const options={responseConstraint:schema,signal};
      if(typeof session.measureContextUsage==='function' && Number.isFinite(session.contextWindow)) {
        const usage=await session.measureContextUsage(prompt,options);
        if(usage>session.contextWindow*0.7) throw new Error(`입력이 모델 컨텍스트에 비해 큽니다 (${usage}/${session.contextWindow}). 더 작은 구간/선택 영역으로 분석해주세요.`);
      }
      let output='';
      if(typeof session.promptStreaming==='function') {
        for await(const chunk of session.promptStreaming(prompt,options)) {
          output+=chunk;onStream(output.length);
          if(output.length>100000) throw new Error('AI 출력이 100,000자를 초과하여 중단했습니다.');
        }
      } else output=await session.prompt(prompt,options);
      return {result:JSON.parse(output),chars:output.length};
    } finally {session.destroy();}
  }
  dispose() {for(const s of Object.values(this.sessions)) s.destroy();this.sessions={};}
}
export function chunkSources(sources,maxChars=6500) {
  const chunks=[];let chunk=[],size=0;
  for(const source of sources) {
    const parts=Math.max(1,Math.ceil(source.text.length/maxChars));
    for(let part=0;part<parts;part++) {
      const text=source.text.slice(part*maxChars,(part+1)*maxChars);
      if(chunk.length && size+text.length>maxChars) {chunks.push(chunk);chunk=[];size=0;}
      chunk.push({...source,text,part:part+1,parts});size+=text.length;
    }
  }
  if(chunk.length) chunks.push(chunk);return chunks.length?chunks:[[]];
}
export function mergeResults(results,preset) {
  const merged={answer:results.map((r,i)=>results.length>1?`[구간 ${i+1}] ${r.answer}`:r.answer).join('\n\n')};
  for(const field of preset.fields) {
    const seen=new Set();merged[field]=[];
    for(const r of results) for(const item of r[field]) {const key=JSON.stringify(item);if(!seen.has(key)){seen.add(key);merged[field].push(item);}}
  }
  return merged;
}
export async function analyzePageData({page,preset,userPrompt='',engine,signal,onProgress=()=>{},imageCaptures=[],outputLanguage='en',selectionOnly=false}) {
  const imageResults=[];let totalInputChars=0;
  for(const capture of imageCaptures) {
    if(signal?.aborted) throw new DOMException('취소됨','AbortError');
    if(capture.status!=='captured') {imageResults.push(capture);continue;}
    if(!engine.sessions.image) {imageResults.push({id:capture.id,status:'unsupported',reason:engine.status.imageError?.message || `이미지 모델 상태: ${engine.status.image}`});continue;}
    onProgress({stage:'image',message:`${capture.id} 이미지 분석 중...`});
    try {
      // Decode locally without fetch; extension CSP blocks every network connection.
      const blob=imageBlob(capture.dataUrl);
      const text=`Inspect image ${capture.id}. Return its ID, visible text verbatim, detailed observations and uncertainty. Never infer backend data. Return ${outputLanguage==='ko'?'Korean (experimental)':'English'} descriptions. User question: ${userPrompt}`;
      totalInputChars+=text.length;
      const {result}=await engine.run([{role:'user',content:[{type:'text',value:text},{type:'image',value:blob}]}],IMAGE_SCHEMA,{type:'image',signal});
      if(!result || typeof result.id!=='string') throw new Error('이미지 ID가 없는 JSON 결과입니다.');
      for(const key of ['visibleTexts','observations','uncertain']) if(!Array.isArray(result[key]) || result[key].some(x=>typeof x!=='string')) throw new Error('이미지 JSON 구조 검증 실패');
      imageResults.push({...result,id:capture.id,status:'success'});
    } catch(e) {if(e.name==='AbortError') throw e;imageResults.push({id:capture.id,status:'failed',...failure(e)});}
  }
  const sources=selectionOnly && page.selection ? [{id:'selection-1',kind:'selection',text:page.selection,ref:page.selectionRef}] : page.sources;
  const chunks=chunkSources(sources); const results=[];const schema=resultSchema(preset);
  for(let i=0;i<chunks.length;i++) {
    if(signal?.aborted) throw new DOMException('취소됨','AbortError');
    onProgress({stage:'analysis',message:`Chrome AI 분석 중... ${i+1}/${chunks.length} 구간`});
    const input={url:page.url,title:page.title,sources:chunks[i],chunk:i+1,chunkCount:chunks.length,
      selection:selectionOnly?undefined:page.selection.slice(0,1000),
      headings:page.headings.slice(0,40),links:page.links.slice(0,30),
      images:page.images,limitations:page.limitations};
    // Bound metadata and image reports too, not only body text.
    input.images=input.images.map(({id,alt,filename,ref})=>({id,alt:alt.slice(0,200),filename,ref}));
    const prompt=buildPrompt(preset,userPrompt,input,imageResults,outputLanguage);totalInputChars+=prompt.length;
    const {result}=await engine.run(prompt,schema,{signal,onStream:n=>onProgress({stage:'stream',message:`구조화 결과 생성 중... ${n.toLocaleString()} chars`})});
    validateResult(result,schema);
    const validIds=new Set([...chunks[i].map(s=>s.id),...imageResults.filter(r=>r.status==='success').map(r=>r.id)]);
    for(const field of preset.fields) for(const item of result[field]) {
      item.invalidSourceIds=item.sourceIds.filter(id=>!validIds.has(id));
      item.sourceIds=item.sourceIds.filter(id=>validIds.has(id));
    }
    results.push(result);
  }
  onProgress({stage:'complete',message:'완료'});
  const result=mergeResults(results,preset);
  const success=imageResults.filter(r=>r.status==='success').length;
  const imageStatus=!imageResults.length?'not-requested':imageResults.every(r=>r.status==='skipped')?'skipped':success?(imageResults.some(r=>r.status!=='success')?'partial':'success'):imageResults.some(r=>r.status==='unsupported')?'unsupported':'failed';
  return {version:1,page:{url:page.url,title:page.title,capturedAt:page.capturedAt},preset:{id:preset.id,name:preset.name},userPrompt,outputLanguage,
    ai:{text:'success',image:imageStatus,model:{...engine.status}},
    result,imageResults,sources,images:page.images,headings:page.headings,links:page.links,limitations:page.limitations,
    stats:{...page.stats,analysisInputChars:totalInputChars,analyzedTextChars:sources.reduce((sum,s)=>sum+s.text.length,0),resultChars:JSON.stringify(result).length,chunkCount:chunks.length},
    notes:['각 구간은 독립 분석 후 JSON으로 병합합니다. 구간 간 인과관계의 종합 추론은 수행하지 않습니다.',...(outputLanguage==='ko'?['한국어는 공식 지원 언어가 아니며 결과 품질/호출 성공을 보장하지 않습니다.']:[])]};
}
