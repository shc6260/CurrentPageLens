(() => {
  const normalize = value => value.replace(/[\t\u00a0 ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const ignored = 'script,style,noscript,template,nav,[role="navigation"],input[type="password"]';
  function visible(el) {
    if (!el || el.closest('[hidden],[aria-hidden="true"],script,style,noscript,template')) return false;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || css.opacity === '0') return false;
    }
    return el.getClientRects().length > 0;
  }
  function selector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    if (el === document.body) return 'body';
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const siblings = node.parentElement ? [...node.parentElement.children].filter(e => e.tagName === node.tagName) : [];
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
    }
    return `body > ${parts.join(' > ')}`;
  }
  function extract() {
    const jira = globalThis.CPA_JIRA?.identify(document);
    const candidates = [...document.querySelectorAll('main,article,[role="main"]')].filter(visible);
    const root = candidates.sort((a,b) => b.innerText.length - a.innerText.length)[0] || document.body;
    const sources = [], seen = new Map();
    let duplicateChars = 0, collectedChars = 0, truncated = false;
    const maxChars = 180000, maxSources = 1800;
    const rawChars = (document.body?.innerText || '').length;
    const landmarks = [];
    if (jira) {
      if (jira.title) landmarks.push([jira.title, 'issue-title']);
      if (jira.description) landmarks.push([jira.description, 'description']);
      jira.comments.forEach(e => landmarks.push([e, 'comment']));
    }
    const kindOf = el => landmarks.find(([node]) => node === el || node.contains(el))?.[1] ||
      (/^H[1-6]$/.test(el.tagName) ? 'heading' : el.closest('button,[role="button"],label') ? 'ui' : el.closest('pre,code') ? 'code' : 'text');
    const add = (el, value, kind) => {
      const text = normalize(value);
      if (!text) return;
      // Preserve repeated comments / rows: duplicates at different positions may be evidence.
      const key = `${kind}:${text}`;
      if (seen.has(key) && !['comment','description','issue-title'].includes(kind)) {
        duplicateChars += text.length;
        const existing=sources.find(s=>s.id===seen.get(key));
        if(existing){existing.duplicateLocations ||= [];if(existing.duplicateLocations.length<12)existing.duplicateLocations.push({url:location.href,selector:selector(el)});}
        return;
      }
      if (sources.length >= maxSources || collectedChars >= maxChars) { truncated = true; return; }
      const remaining = maxChars - collectedChars;
      const kept = text.slice(0, remaining);
      const id = `source-${sources.length + 1}`;
      const css = selector(el);
      sources.push({id,kind,text:kept,originalChars:text.length,truncated:kept.length < text.length,
        ref:{url:location.href,selector:css,tag:el.tagName.toLowerCase()},
        heading: el.closest('section,article')?.querySelector('h1,h2,h3,h4')?.innerText?.slice(0,150) || null});
      seen.set(key,id); collectedChars += kept.length;
      if (kept.length < text.length) truncated = true;
    };
    // Walk visible text nodes once, grouped by nearby semantic blocks; avoid overlapping innerText copies.
    const group = new Map();
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(ignored) || !visible(parent) || !node.textContent.trim()) continue;
      const el = parent.closest('p,li,pre,h1,h2,h3,h4,h5,h6,td,th,button,label,[role="button"]') || parent;
      group.set(el, (group.get(el) || '') + node.textContent + ' ');
    }
    for (const [el,text] of group) add(el,text,kindOf(el));
    // Landmarks outside main (dialogs / separately mounted comment areas).
    for (const [el,kind] of landmarks) if (visible(el) && !root.contains(el)) add(el,el.innerText,kind);
    const headings = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).slice(0,200)
      .map(e => ({level:Number(e.tagName[1]),text:normalize(e.innerText),selector:selector(e)}));
    const links = [...root.querySelectorAll('a[href]')].filter(e=>visible(e) && !e.closest(ignored)).slice(0,200)
      .map(e=>({text:normalize(e.innerText),href:e.href,selector:selector(e)}));
    const imageNodes = [...new Set([...root.querySelectorAll('img'),...(jira?.attachments || [])])].filter(visible);
    const images = imageNodes.slice(0,80).map((e,i) => {
      const src = e.currentSrc || e.src;
      let filename = ''; try { const url=new URL(src); if(['http:','https:','file:'].includes(url.protocol)) filename=decodeURIComponent(url.pathname.split('/').pop()).slice(0,300); } catch {}
      const rect = e.getBoundingClientRect();
      return {id:`image-${i+1}`,src,alt:e.alt || '',filename,width:e.naturalWidth,height:e.naturalHeight,
        selector:selector(e),ref:{url:location.href,selector:selector(e)},
        inViewport:rect.bottom>0 && rect.right>0 && rect.top<innerHeight && rect.left<innerWidth,
        nearbyText:normalize(e.parentElement?.innerText || '').slice(0,350)};
    });
    const selected = getSelection();
    return {version:1,url:location.href,title:document.title,capturedAt:new Date().toISOString(),
      extractor:jira ? 'generic+jira-landmarks' : 'generic',sources,headings,links,images,
      selection:selected?.toString().slice(0,20000) || '',
      selectionRef:selected?.anchorNode?.parentElement ? {url:location.href,selector:selector(selected.anchorNode.parentElement)} : null,
      stats:{rawChars,collectedChars,duplicateChars,sourceCount:sources.length,imageCount:imageNodes.length,
        imagesRetained:images.length,commentsDetected:jira?.comments.filter(visible).length ?? null,truncated},
      limitations:['현재 로드된 최상위 DOM만 수집합니다. 접힌 댓글·가상 스크롤·iframe·closed shadow DOM·CSS 배경 이미지는 누락될 수 있습니다.',
        ...(truncated ? ['수집 상한에 도달하여 본문 일부가 누락되었습니다.'] : []),
        ...(imageNodes.length>80 ? ['이미지 메타데이터는 처음 80개까지만 유지합니다.'] : [])]};
  }
  function imagePixels(image) {
    try {
      const el = document.querySelector(image.selector);
      if (!(el instanceof HTMLImageElement) || !visible(el) || (el.currentSrc || el.src) !== image.src) throw new Error('이미지가 변경되었거나 찾을 수 없습니다.');
      if (!el.complete || !el.naturalWidth) throw new Error('이미지가 아직 로드되지 않았습니다.');
      if (el.naturalWidth < 32 || el.naturalHeight < 32) return {id:image.id,status:'skipped',reason:'32px 미만의 작은 이미지'};
      const ratio = Math.min(1,1600/Math.max(el.naturalWidth,el.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width=Math.ceil(el.naturalWidth*ratio); canvas.height=Math.ceil(el.naturalHeight*ratio);
      canvas.getContext('2d').drawImage(el,0,0,canvas.width,canvas.height);
      return {id:image.id,status:'captured',dataUrl:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height};
    } catch(e) { return {id:image.id,status:'failed',reason:e.name==='SecurityError' ? '교차 출처 이미지의 canvas 읽기가 차단되었습니다 (CORS).' : e.message,errorName:e.name}; }
  }
  globalThis.CPA_EXTRACTOR = {extract,imagePixels};
})();
