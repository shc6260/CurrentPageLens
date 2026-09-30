const RESTRICTED_PAGE_MESSAGE='현재 페이지는 Chrome 보안 정책으로 인해 분석할 수 없습니다. 일반 웹페이지에서 다시 시도해주세요.';
export function isRestrictedPage(url) {
  if(!url) return false; // Tab URL can be omitted for protected tabs; injection errors are handled separately.
  try {
    const page=new URL(url);
    return !['http:','https:','file:'].includes(page.protocol) || page.hostname==='chromewebstore.google.com' ||
      (page.hostname==='chrome.google.com' && /^\/webstore(?:\/|$)/.test(page.pathname));
  } catch {return true;}
}
export function pageAccessError(error,url) {
  const message=String(error?.message || '');
  if(isRestrictedPage(url) || /(?:chrome|chrome-extension|chrome-untrusted|devtools|about|view-source|edge):|Chrome Web Store|extensions gallery|webstore/i.test(message)) return new Error(RESTRICTED_PAGE_MESSAGE);
  if(/No tab|tab.*closed|frame.*removed|No frame|frame.*not found/i.test(message)) return new Error('페이지가 닫히거나 이동하여 수집을 완료하지 못했습니다. 페이지 로딩이 끝난 뒤 다시 분석해주세요.');
  if(!url && /Cannot access|permission|host|not allowed/i.test(message)) return new Error(`${RESTRICTED_PAGE_MESSAGE} 일반 웹페이지에서도 발생한다면 Chrome 확장 설정의 사이트 액세스를 확인해주세요.`);
  if(/Cannot access|permission|host|not allowed/i.test(message)) return new Error('현재 페이지의 접근 권한이 허용되지 않았습니다. 확장프로그램을 새로고침하고 Chrome 확장 설정의 사이트 액세스를 확인해주세요.');
  return new Error('페이지 내용을 수집하지 못했습니다. 페이지 로딩이 끝난 뒤 다시 시도해주세요. 문제가 계속되면 확장프로그램을 새로고침해주세요.');
}
export async function activePage() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id) throw new Error('현재 탭을 찾을 수 없습니다.');
  if(isRestrictedPage(tab.url)) throw new Error(RESTRICTED_PAGE_MESSAGE);
  return tab;
}
export async function collectPage(tab) {
  let url=tab.url;
  try {
    // Refresh the URL for direct callers and for navigation after selecting a tab.
    url=(await chrome.tabs.get(tab.id)).url || url;
    if(isRestrictedPage(url)) throw new Error(RESTRICTED_PAGE_MESSAGE);
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content/site-extractors/jira.js','content/extractor.js']});
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.CPA_EXTRACTOR.extract()});
    if(!result?.result) throw new Error('페이지 수집 결과가 없습니다.');
    return result.result;
  } catch(e) {if(e.message===RESTRICTED_PAGE_MESSAGE) throw e;throw pageAccessError(e,url);}
}
export async function collectImages(tab,page,limit=4) {
  const eligible=page.images.filter(i=>i.width>=32 && i.height>=32);
  // Prioritize attached screenshots over icons, with viewport tie-break.
  eligible.sort((a,b)=>b.width*b.height-a.width*a.height || Number(b.inViewport)-Number(a.inViewport));
  const selected=eligible.slice(0,limit);
  let result;
  try {
    [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(images,url)=> {
    if(location.href!==url) throw new Error('페이지가 이동되었습니다. 다시 분석해주세요.');
    return images.map(i=>globalThis.CPA_EXTRACTOR.imagePixels(i));
    },args:[selected,page.url]});
  } catch(e) {throw pageAccessError(e,page.url);}
  const captures=result?.result || [];
  return [...captures,...page.images.filter(i=>!selected.some(s=>s.id===i.id)).map(i=>({id:i.id,status:'skipped',reason:'이미지 분석 한도(4개) 또는 작은 이미지 / 미로드'}))];
}
export async function viewportCapture(tab,page) {
  const current=await activePage();
  if(current.id!==tab.id || (current.url && current.url!==page.url)) throw new Error('활성 페이지가 변경되어 화면 캡처를 중단했습니다.');
  return {id:'viewport-1',status:'captured',dataUrl:await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'})};
}
export async function revealSource(tabId,url,ref) {
  await chrome.scripting.executeScript({target:{tabId},func:(expected,selector)=>{
    if(location.href!==expected) throw new Error('페이지가 이동되었습니다. 원본 결과의 URL을 확인해주세요.');
    const el=document.querySelector(selector); if(!el) throw new Error('원문 위치가 변경되었거나 더 이상 로드되어 있지 않습니다.');
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.animate([{outline:'3px solid #22c55e'},{outline:'3px solid transparent'}],{duration:1800});
  },args:[url,ref.selector]});
}
