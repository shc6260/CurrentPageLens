import {ChromeAIEngine,availabilityLabel} from '../ai/analyzer.js';
import {analyzeCurrentPage} from '../core/analyze-current-page.js';
import {listPresets,savePreset,deletePreset} from '../presets/preset-store.js';
import {revealSource} from '../core/page-service.js';
const $=id=>document.getElementById(id);
const engine=new ChromeAIEngine();let presets=[],controller=null,report=null,progressNodes=new Map();
const labels={answer:'질문 답변',keyPoints:'핵심 내용',requirements:'요구사항',confirmedFacts:'확인된 사실 · Fact',importantDetails:'중요한 세부 정보',observations:'관찰 · Observation',unknowns:'확인 필요 · Unknown',importantEvidence:'중요 근거',searchKeywords:'검색 키워드',coreConcepts:'핵심 개념',apis:'API',usage:'사용 방법',constraints:'제약사항',examples:'예제',cautions:'주의사항',compatibility:'Deprecated / 호환성',relevantParts:'질문 관련 내용',symptoms:'증상',errorMessages:'오류 메시지',possibleCauses:'가능 원인 · 추정',additionalChecks:'추가 확인',remedies:'문서에 제시된 조치'};
function element(tag,text,className) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function showError(e) {$('error').hidden=false;$('error').textContent=`${e.name || 'Error'}: ${e.message || e}`;}
function clearError() {$('error').hidden=true;$('error').textContent='';}
function progress({stage,message}) {let node=progressNodes.get(stage);if(!node){node=element('li');progressNodes.set(stage,node);$('progress').append(node);}node.textContent=message;state();}
function state() {
  const describe=type=>`${availabilityLabel(engine.status[type])}${engine.status[type]?` (${engine.status[type]})`:''}`;
  $('model-state').textContent=`텍스트: ${describe('text')} / 이미지: ${describe('image')}`;
  const text=engine.status.text;
  $('model-guidance').textContent=text==='available'?'준비되었습니다. 프리셋과 질문을 선택하고 분석을 실행하세요.':
    text==='downloadable'?'첫 사용에 로컬 모델 다운로드가 필요합니다. 모델 준비 또는 현재 페이지 분석 버튼을 눌러 시작하세요.':
    text==='downloading'?'모델 다운로드가 진행 중입니다. 모델 준비 버튼을 누르면 진행률을 확인하며 준비 완료를 기다릴 수 있습니다.':
    text==='unavailable' || text==='api-missing' || text==='failed'?'현재 환경에서 AI를 사용할 수 없습니다. Chrome 버전·하드웨어·디스크·브라우저 정책을 확인하세요. 수동 flag 설정은 기본 요구사항이 아닙니다.':'Chrome Built-in AI 상태를 자동 확인하고 있습니다.';
  const detail=[engine.status.reason,engine.status.textError?.message,engine.status.imageError?.message].filter(Boolean);
  $('model-detail').textContent=detail.join(' / ');$('model-detail').hidden=!detail.length;
}
function busy(value) {for(const id of ['prepare','probe','analyze','again'])$(id).disabled=value;$('cancel').disabled=!value;}
function table(container,items) {const dl=element('dl');for(const [name,value] of items){dl.append(element('dt',name),element('dd',String(value)));}container.append(dl);}
function collected(page) {
  $('collection').hidden=false;$('page-info').replaceChildren();
  table($('page-info'),[['제목',page.title],['URL',page.url],['수집 텍스트',`${page.stats.collectedChars.toLocaleString()} chars`],['원본 텍스트',`${page.stats.rawChars.toLocaleString()} chars`],['이미지',`${page.stats.imageCount}개`],['댓글 감지',page.stats.commentsDetected ?? 'Jira 랜드마크 없음'],['추출기',page.extractor],['수집 제한',page.stats.truncated?'상한 도달 · 일부 누락':'상한 미도달']]);
  $('collected-data').textContent=JSON.stringify(page,null,2);
}
function renderReport(data) {
  report=data;$('output').hidden=false;$('result-meta').replaceChildren();$('result').replaceChildren();
  table($('result-meta'),[['Preset',data.preset.name],['Chrome AI',`텍스트 ${data.ai.text} / 이미지 ${data.ai.image}`],['분석 본문',`${data.stats.analyzedTextChars.toLocaleString()} chars`],['전체 입력 합계',`${data.stats.analysisInputChars.toLocaleString()} chars`],['결과 JSON',`${data.stats.resultChars.toLocaleString()} chars`],['분석 구간',data.stats.chunkCount],['원문 대비 결과',`${data.stats.rawChars?(data.stats.resultChars/data.stats.rawChars*100).toFixed(1):0}%`]]);
  for(const note of [...data.limitations,...data.notes])$('result-meta').append(element('p',note,'warning'));
  for(const [field,value] of Object.entries(data.result)) {
    const group=element('div',undefined,'result-group');group.append(element('h3',labels[field] || field));
    if(typeof value==='string')group.append(element('p',value,'answer'));
    else {const ul=element('ul');for(const item of value){const li=element('li',item.text);for(const id of item.sourceIds){const source=data.sources.find(s=>s.id===id);const b=element('button',id,'secondary source-button');
      if(source?.ref){b.onclick=()=>revealSource(data.tabId,data.page.url,source.ref).catch(showError);b.title=source.text.slice(0,200);}else {b.disabled=true;b.title='이미지 분석 결과의 ID입니다.';}li.append(b);}
      if(item.invalidSourceIds?.length)li.append(element('span',` 존재하지 않는 근거 ID: ${item.invalidSourceIds.join(', ')}`,'warning'));
      if(!item.sourceIds.length)li.append(element('span',' (원문 위치 연결 없음)','warning'));ul.append(li);}if(!value.length)group.append(element('p','해당 내용 없음','hint'));group.append(ul);}
    $('result').append(group);
  }
  const imageGroup=element('div',undefined,'result-group');imageGroup.append(element('h3','이미지 분석 / 실패 이유'));
  for(const image of data.imageResults)imageGroup.append(element('pre',JSON.stringify(image,null,2)));
  $('result').append(imageGroup);$('json').textContent=JSON.stringify(data,null,2);
}
async function refreshPresets(selected) {
  presets=await listPresets();const current=selected || $('preset').value;
  $('preset').replaceChildren(...presets.map(p=>{const option=element('option',p.name);option.value=p.id;return option;}));
  $('preset').value=presets.some(p=>p.id===current)?current:'general';
  $('edit-id').replaceChildren(new Option('새 프리셋',''),...presets.filter(p=>p.custom).map(p=>new Option(p.name,p.id)));
}
function editPreset() {const p=presets.find(p=>p.id===$('edit-id').value);$('preset-name').value=p?.name || '';$('preset-prompt').value=p?.prompt || '';$('delete').disabled=!p;}
async function prepare() {clearError();busy(true);controller=new AbortController();try{await engine.prepare({images:$('images').checked||$('viewport').checked,onProgress:progress,signal:controller.signal});state();}catch(e){controller?.abort();engine.dispose();showError(e);state();}finally{busy(false);controller=null;}}
async function analyze() {
  clearError();busy(true);$('progress').replaceChildren();progressNodes=new Map();
  // Snapshot controls for this run; inputs remain editable for next run.
  const options={presetId:$('preset').value,userPrompt:$('question').value,includeImages:$('images').checked,includeViewport:$('viewport').checked,selectionOnly:$('selection').checked,outputLanguage:$('language').value};
  $('output').hidden=true;report=null;controller=new AbortController();
  try {
    // Collect even if AI unavailable, so diagnosis retains captured page evidence.
    const preparation=engine.prepare({images:options.includeImages||options.includeViewport,onProgress:progress,signal:controller.signal}).then(()=>null,e=>e);
    renderReport(await analyzeCurrentPage({...options,engine,ready:preparation,signal:controller.signal,onProgress:progress,onCollected:collected}));state();
  } catch(e) {controller?.abort();engine.dispose();if(e.name==='AbortError')progress({stage:'stopped',message:'분석이 취소되었습니다.'});else showError(e);state();}
  finally {busy(false);controller=null;}
}
$('prepare').onclick=prepare;$('analyze').onclick=analyze;$('again').onclick=analyze;
$('cancel').onclick=()=>{controller?.abort();engine.dispose();};
$('probe').onclick=async()=>{clearError();busy(true);try{await engine.probe();state();}catch(e){showError(e);}finally{busy(false);}};
$('edit-id').onchange=editPreset;
$('save').onclick=async()=>{try{const p=await savePreset({id:$('edit-id').value || undefined,name:$('preset-name').value,prompt:$('preset-prompt').value});await refreshPresets(p.id);$('edit-id').value=p.id;editPreset();$('preset-notice').textContent='저장했습니다.';}catch(e){showError(e);}};
$('delete').onclick=async()=>{try{await deletePreset($('edit-id').value);await refreshPresets();editPreset();$('preset-notice').textContent='삭제했습니다.';}catch(e){showError(e);}};
$('export').onclick=()=>{if(!report)return;const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=element('a');link.href=url;link.download=`current-page-analysis-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
addEventListener('pagehide',()=>engine.dispose());
// Read-only check on panel opening. Model download/session creation still requires a user button.
async function initialize() {
  busy(true);$('cancel').disabled=true;state();
  try {await Promise.all([refreshPresets(),engine.probe()]);state();}
  catch(e) {showError(e);state();}
  finally {busy(false);}
}
initialize();
