// Browser integration tests. Test-only host grants are never included in the deliverable.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..');const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cpa-test-'));
  const extension=path.join(temp,'extension');await fs.cp(root,extension,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8'));
  manifest.host_permissions=['http://127.0.0.1/*','http://localhost/*','https://developer.chrome.com/*','https://en.wikipedia.org/*'];
  await fs.writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  const server=http.createServer(async(req,res)=>{try{let name=(req.url||'/').split('?')[0].slice(1);if(name.startsWith('browse/'))name='jira.html';
    if(['real-docs.html','real-article.html'].includes(name) && process.env.CPA_REAL_HTML_DIR){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile(path.join(process.env.CPA_REAL_HTML_DIR,name)));return;}
    if(!['jira.html','docs.html','article.html','screen.svg'].includes(name)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',name.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8');res.end(await fs.readFile(path.join(__dirname,'fixtures',name)));
  }catch{res.writeHead(500).end();}});
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));const port=server.address().port;const base=`http://127.0.0.1:${port}`;
  let context;const checks=[];
  const record=(name,detail)=>checks.push({name,status:'passed',detail});
  try {
    context=await chromium.launchPersistentContext(path.join(temp,'profile'),{executablePath:process.env.CPA_CHROME || '/tmp/cpa-browser/chrome-linux64/chrome',headless:true,viewport:{width:420,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-sandbox'],ignoreDefaultArgs:['--disable-extensions']});
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    const target=await context.newPage();await target.goto(`${base}/docs.html`);
    const panel=await context.newPage();const errors=[];panel.on('pageerror',e=>errors.push(e.message));
    await panel.goto(`chrome-extension://${id}/sidepanel/sidepanel.html`);
    await panel.waitForFunction(()=>document.querySelector('#preset').options.length===4);
    await panel.waitForFunction(()=>!document.querySelector('#probe').disabled && !document.querySelector('#model-state').textContent.includes('자동 확인 중'));
    record('MV3 extension loaded / Side Panel document initialized',{id,presetCount:4});
    record('Automatic availability check on panel opening',await panel.locator('#model-state').textContent());
    const panelOpen=await panel.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const button=document.createElement('button');button.id='test-open-panel';button.textContent='test open';button.onclick=async()=>{try{await chrome.sidePanel.open({windowId:tab.windowId});window.testPanelOpen='opened';}catch(e){window.testPanelOpen=e.name+': '+e.message;}};document.body.append(button);return true;});
    await panel.click('#test-open-panel');await panel.waitForFunction(()=>window.testPanelOpen);record('Side Panel API open from user gesture',await panel.evaluate(()=>window.testPanelOpen));
    await panel.evaluate(()=>document.querySelector('#test-open-panel').remove());
    const tabId=await panel.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,`${base}/docs.html`);
    const collect=async()=>panel.evaluate(async id=>{const m=await import('../core/page-service.js');return m.collectPage({id});},tabId);
    const pages=[];
    for(const [name,url] of [['docs',`${base}/docs.html`],['article',`${base}/article.html`],['jira',`${base}/browse/UCSO-TEST`]]) {
      await target.goto(url);await target.waitForFunction(()=>[...document.images].every(i=>i.complete));const page=await collect();pages.push(page);
      const text=page.sources.map(x=>x.text).join('\n');assert(text.length>50);assert(!text.includes('SECRET_HIDDEN'));assert(!text.includes('OPACITY_HIDDEN'));assert(!text.includes('Home Search'));assert(!text.includes('Dashboard Projects'));
      assert(page.sources.every(x=>x.ref.selector));
      if(name==='docs'){assert(text.includes('Do not call from a Worker'));assert.equal(page.headings.length,4);assert(page.links.some(x=>x.text==='API reference'));}
      if(name==='article'){assert(page.stats.collectedChars>10000);assert(text.includes('Section 139'));}
      if(name==='jira'){assert.equal(page.stats.commentsDetected,2);assert(page.sources.some(s=>s.kind==='comment'));assert(page.sources.some(s=>s.kind==='description'));assert(text.includes('before assuming a database error'));assert.equal(page.images.length,1);}
      record(`${name} DOM extraction`,{chars:page.stats.collectedChars,sources:page.sources.length,comments:page.stats.commentsDetected,images:page.images.length});
    }
    await target.evaluate(()=>{const image=document.createElement('img');image.id='inline-budget-test';image.src='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">'+' '.repeat(180000)+'</svg>');document.querySelector('main').append(image);});
    await target.waitForFunction(()=>document.querySelector('#inline-budget-test').complete);
    const inlinePage=await collect();assert.equal(inlinePage.images.find(i=>i.selector==='#inline-budget-test').filename,'');
    record('Inline image filename excludes binary payload',{status:'passed'});
    await target.evaluate(()=>document.querySelector('#inline-budget-test').remove());
    const jira=pages.at(-1);const images=await panel.evaluate(async({tabId,page})=>{const m=await import('../core/page-service.js');return m.collectImages({id:tabId},page);},{tabId,page:jira});
    assert(images.some(i=>i.status==='captured'));record('Image pixel capture from same-origin page',{status:images[0].status,width:images[0].width});
    await target.evaluate(port=>{const image=document.createElement('img');image.src=`http://localhost:${port}/screen.svg`;image.width=600;image.height=180;document.querySelector('main').append(image);},port);
    await target.waitForFunction(()=>[...document.images].every(i=>i.complete));const crossPage=await collect();
    const cross=await panel.evaluate(async({tabId,page})=>{const m=await import('../core/page-service.js');return m.collectImages({id:tabId},page);},{tabId,page:crossPage});assert(cross.some(i=>i.reason?.includes('CORS')));record('Cross-origin image capture failure explicitly recorded',cross.filter(i=>i.status==='failed').map(({reason,errorName})=>({reason,errorName})));
    await target.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#description-val'));getSelection().removeAllRanges();getSelection().addRange(range);});assert((await collect()).selection.includes('BMD2'));record('Selected text and source reference captured',true);
    // Exercise UI storage without mocks, including reload persistence.
    await panel.locator('.preset-editor > summary').click();await panel.fill('#preset-name','Constraint review');await panel.fill('#preset-prompt','Only extract documented constraints.');await panel.click('#save');await panel.waitForFunction(()=>document.querySelector('#preset').options.length===5);const customId=await panel.locator('#preset').inputValue();assert(customId.startsWith('custom-'));
    await panel.reload();await panel.waitForFunction(()=>document.querySelector('#preset').options.length===5);await panel.locator('.preset-editor > summary').click();await panel.selectOption('#edit-id',customId);await panel.fill('#preset-name','Revised constraints');await panel.click('#save');await panel.waitForFunction(()=>[...document.querySelector('#preset').options].some(o=>o.textContent==='Revised constraints'));await panel.click('#delete');await panel.waitForFunction(()=>document.querySelector('#preset').options.length===4);record('Custom preset UI create / persist / edit / delete',true);
    const capability=await panel.evaluate(async()=>{const {ChromeAIEngine}=await import('../ai/analyzer.js');const engine=new ChromeAIEngine();const status=await engine.probe();let createResult;
      if(typeof LanguageModel!=='undefined'){try{const s=await LanguageModel.create({expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]});createResult={status:'created',prompt:await s.prompt('Reply with the word OK.')};s.destroy();}catch(e){createResult={status:'failed',name:e.name,message:e.message};}}
      return {apiPresent:typeof LanguageModel!=='undefined',status,createResult};});
    checks.push({name:'REAL Chrome Built-in AI capability and call attempt',status:capability.createResult?.status==='created'?'passed':'blocked',detail:capability});
    // Core end-to-end with an explicit test double: never counted as actual model success.
    const mockResult=await panel.evaluate(async({page,captures})=>{
      const {analyzePageData}=await import('../ai/analyzer.js');const {BUILTIN_PRESETS}=await import('../ai/prompts.js');let lastPrompt;
      const engine={sessions:{text:{},image:{}},status:{text:'test-double',image:'test-double'},run:async(prompt,schema)=>{lastPrompt=prompt;const r={};for(const key of schema.required)r[key]=key==='answer'?'Test answer':key==='id'?'image-1':[];if(r.confirmedFacts)r.confirmedFacts=[{text:'Mapping should be checked',sourceIds:[page.sources.find(s=>s.kind==='comment').id]}];if(r.visibleTexts)r.visibleTexts=['BMD2'];return {result:r};}};
      const output=await analyzePageData({page,preset:BUILTIN_PRESETS[1],userPrompt:'Find mapping evidence',engine,imageCaptures:captures});return {output,questionPresent:lastPrompt.includes('Find mapping evidence')};
    },{page:jira,captures:images});assert(mockResult.questionPresent);assert.equal(mockResult.output.ai.image,'success');assert(mockResult.output.result.confirmedFacts[0].sourceIds.length);record('Analysis orchestration / source refs / image schema (TEST DOUBLE)',{questionPresent:true,sourceId:mockResult.output.result.confirmedFacts[0].sourceIds[0]});
    await panel.click('#probe');await panel.waitForFunction(()=>!document.querySelector('#probe').disabled);assert((await panel.locator('#model-state').textContent()).includes('텍스트:'));record('AI status UI and error visibility',await panel.locator('#model-state').textContent());
    // Render unavailable analysis error from a real DOM collection. Call handler without switching active tab.
    await target.bringToFront();await panel.evaluate(()=>document.querySelector('#analyze').click());await panel.waitForFunction(()=>!document.querySelector('#analyze').disabled,{timeout:30000});
    assert(await panel.locator('#collection').isVisible());record('Analysis button retains collection when AI unavailable',await panel.locator('#error').textContent());
    assert.deepEqual(errors,[]);await panel.screenshot({path:path.join(root,'tests','sidepanel-verified.png'),fullPage:true});record('No uncaught Side Panel JS errors',errors);
    for(const [name,url] of [['Live technical documentation','https://developer.chrome.com/docs/ai/prompt-api'],['Live general long article','https://en.wikipedia.org/wiki/ChromeOS']]) {
      try {
        await target.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
        const data=await collect();assert(data.stats.collectedChars>2000);
        record(name,{title:data.title,chars:data.stats.collectedChars,sources:data.sources.length,images:data.images.length,extractor:data.extractor});
      }catch(e){checks.push({name,status:'blocked',detail:e.message});}
    }
    if(process.env.CPA_REAL_HTML_DIR)for(const [file,originalURL] of [['real-docs.html','https://developer.chrome.com/docs/ai/prompt-api'],['real-article.html','https://en.wikipedia.org/wiki/ChromeOS']]){
      const offline=await context.newPage();const url=`${base}/${file}`;
      await offline.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
      const data=await panel.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);const m=await import('../core/page-service.js');return m.collectPage(tab);},url);assert(data.stats.collectedChars>2000);
      record(`Real public HTML offline: ${file}`,{originalURL,title:data.title,chars:data.stats.collectedChars,sources:data.sources.length,headings:data.headings.length,truncated:data.stats.truncated});
      await offline.close();
    }
    const downloadPanel=await context.newPage();
    await downloadPanel.addInitScript(()=>{
      window.testCreateCalls=0;
      Object.defineProperty(globalThis,'LanguageModel',{configurable:true,value:{
        availability:async options=>options.expectedInputs.some(i=>i.type==='image')?'unavailable':window.testCreateCalls?'available':'downloadable',
        create:async options=>{window.testCreateCalls++;const m=new EventTarget();options.monitor(m);
          for(const loaded of [0.5,1]) {await new Promise(resolve=>setTimeout(resolve,150));const e=new Event('downloadprogress');Object.defineProperty(e,'loaded',{value:loaded});m.dispatchEvent(e);}
          return {destroy(){}};}
      }});
    });
    await downloadPanel.goto(`chrome-extension://${id}/sidepanel/sidepanel.html`);
    await downloadPanel.waitForFunction(()=>!document.querySelector('#prepare').disabled);
    assert.equal(await downloadPanel.evaluate(()=>window.testCreateCalls),0);
    assert((await downloadPanel.locator('#model-state').textContent()).includes('로컬 모델 다운로드 필요'));
    assert.equal(await downloadPanel.locator('#collection').isVisible(),false);
    await downloadPanel.uncheck('#images');await downloadPanel.click('#prepare');
    await downloadPanel.waitForFunction(()=>document.querySelector('#model-state').textContent.includes('모델 다운로드 중'));
    await downloadPanel.waitForFunction(()=>!document.querySelector('#prepare').disabled);
    assert.equal(await downloadPanel.evaluate(()=>window.testCreateCalls),1);
    assert((await downloadPanel.locator('#model-state').textContent()).includes('바로 사용 가능'));
    record('First-use download UX: no create on opening / user prepare / progress / ready (TEST DOUBLE)',true);
    await downloadPanel.close();
    const report={testedAt:new Date().toISOString(),browser:await context.browser().version(),testHostPermissions:manifest.host_permissions,checks,limitations:['Headless test; Side Panel document and open API exercised, native docked visual layout needs user Chrome confirmation.','No signed-in Jira tab in provided browser inventory; Jira fixture only.','Test copy adds explicit fixture/public-test host permissions for automation. Production manifest grants ordinary HTTP/HTTPS hosts; test grants are limited to fixtures/public tests.','Mock analysis/download results verify plumbing and UI, not Gemini Nano quality, actual model download or real AI success.']};
    await fs.writeFile(path.join(root,'tests','browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await context?.close();await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
