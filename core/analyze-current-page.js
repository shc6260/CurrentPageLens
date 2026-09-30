import {activePage,collectPage,collectImages,viewportCapture} from './page-service.js';
import {listPresets} from '../presets/preset-store.js';
import {analyzePageData} from '../ai/analyzer.js';
// Independent orchestration; no UI selectors/rendering. Must run in an extension document.
export async function analyzeCurrentPage({presetId,userPrompt='',engine,ready,signal,onProgress=()=>{},onCollected=()=>{},includeImages=true,includeViewport=false,outputLanguage='en',selectionOnly=false}) {
  const check=()=>{if(signal?.aborted) throw new DOMException('취소됨','AbortError');};
  const tab=await activePage(); check();onProgress({stage:'page',message:'✓ 페이지 감지'});
  const preset=(await listPresets()).find(p=>p.id===presetId);if(!preset) throw new Error('프리셋을 찾을 수 없습니다.');
  const page=await collectPage(tab);check();onCollected(page,tab);
  onProgress({stage:'text',message:`✓ 텍스트 수집 ${page.stats.collectedChars.toLocaleString()} chars`});
  onProgress({stage:'images',message:`✓ 이미지 ${page.stats.imageCount}개 확인 / 댓글 ${page.stats.commentsDetected ?? '해당 없음'}`});
  onProgress({stage:'clean',message:`✓ 페이지 정제 / 원본 ${page.stats.rawChars.toLocaleString()} chars`});
  if(selectionOnly && !page.selection) throw new Error('선택 영역이 없습니다. 페이지에서 텍스트를 선택하거나 선택 영역 옵션을 해제해주세요.');
  if(ready) {const preparationError=await ready;check();if(preparationError)throw preparationError;}
  let imageCaptures=[];
  if(includeImages) {
    try {imageCaptures=await collectImages(tab,page);} catch(e) {imageCaptures=page.images.map(i=>({id:i.id,status:'failed',reason:e.message}));}
  }
  if(includeViewport) {
    try {imageCaptures.push(await viewportCapture(tab,page));} catch(e) {imageCaptures.push({id:'viewport-1',status:'failed',reason:e.message});}
  }
  check();
  const report=await analyzePageData({page,preset,userPrompt,engine,signal,onProgress,imageCaptures,outputLanguage,selectionOnly});
  return {...report,tabId:tab.id};
}
