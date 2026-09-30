export async function activePage() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id) throw new Error('현재 탭을 찾을 수 없습니다.');
  if(tab.url && !/^(https?|file):/.test(tab.url)) throw new Error('이 페이지는 수집할 수 없습니다. chrome://·웹스토어·확장 페이지 대신 일반 웹페이지를 선택해주세요.');
  return tab;
}
export async function collectPage(tab) {
  try {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content/site-extractors/jira.js','content/extractor.js']});
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.CPA_EXTRACTOR.extract()});
    if(!result?.result) throw new Error('페이지 수집 결과가 없습니다.');
    return result.result;
  } catch(e) {throw new Error(`페이지 수집 실패: ${e.message} 일반 웹페이지에서 확장 아이콘을 다시 클릭해 접근 권한을 부여해주세요.`);}
}
export async function collectImages(tab,page,limit=4) {
  const eligible=page.images.filter(i=>i.width>=32 && i.height>=32);
  // Prioritize attached screenshots over icons, with viewport tie-break.
  eligible.sort((a,b)=>b.width*b.height-a.width*a.height || Number(b.inViewport)-Number(a.inViewport));
  const selected=eligible.slice(0,limit);
  const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(images,url)=> {
    if(location.href!==url) throw new Error('페이지가 이동되었습니다. 다시 분석해주세요.');
    return images.map(i=>globalThis.CPA_EXTRACTOR.imagePixels(i));
  },args:[selected,page.url]});
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
