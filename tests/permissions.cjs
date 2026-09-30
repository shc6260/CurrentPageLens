// Uses the production manifest verbatim: no test-only host grants or activeTab clicks.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..');const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cpl-permissions-'));
  await fs.cp(root,path.join(temp,'extension'),{recursive:true,filter:source=>!source.split(path.sep).includes('.git')});
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  assert.deepEqual(manifest.permissions,['activeTab','scripting','storage','sidePanel']);
  assert.deepEqual(manifest.host_permissions,['http://*/*','https://*/*']);
  const html=await fs.readFile(path.join(__dirname,'fixtures','docs.html'),'utf8');
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  let context;const checks=[];
  try{
    context=await chromium.launchPersistentContext(path.join(temp,'profile'),{executablePath:process.env.CPA_CHROME || '/tmp/cpa-browser/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${path.join(temp,'extension')}`,`--load-extension=${path.join(temp,'extension')}`,'--no-sandbox']});
    // HTTPS fixtures preserve HTTPS origins without changing certificate-validation settings.
    await context.route(/^https:\/\/(?:first\.example\.test|second\.example\.test)\//,route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).host;
    const target=await context.newPage();const httpURL=`http://127.0.0.1:${port}/docs.html`;await target.goto(httpURL);
    const panel=await context.newPage();await panel.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    await panel.waitForFunction(()=>!document.querySelector('#probe').disabled);
    const tabId=await panel.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url).id,httpURL);
    const collect=()=>panel.evaluate(async id=>{const service=await import('../core/page-service.js');try{return {page:await service.collectPage({id})};}catch(e){return {error:e.message};}},tabId);
    for(const [name,url] of [['HTTP extraction',httpURL],['HTTPS extraction','https://first.example.test/docs.html'],['Cross-domain navigation extraction','https://second.example.test/docs.html']]){
      await target.goto(url);const r=await collect();assert(!r.error,r.error);assert.equal(r.page.url,url);assert(r.page.sources.some(s=>s.text.includes('Do not call from a Worker')));
      checks.push({name,status:'passed',url,collectedChars:r.page.stats.collectedChars});
    }
    for(const [name,url] of [['Chrome internal page guidance','chrome://extensions/'],['Chrome Web Store guidance','https://chromewebstore.google.com/detail/test'],['Extension page guidance',`chrome-extension://${extensionId}/sidepanel/sidepanel.html`]]){
      try {await target.goto(url,{waitUntil:'domcontentloaded'});} catch(e) {if(!url.startsWith('https://chromewebstore.google.com/') || !e.message.includes('ERR_CERT_AUTHORITY_INVALID')) throw e;}
      const r=await collect();assert(r.error?.includes('Chrome 보안 정책'),JSON.stringify({name,...r,tab:await panel.evaluate(id=>chrome.tabs.get(id),tabId)}));assert(!r.error.includes('Cannot access'));
      await target.bringToFront();const active=await panel.evaluate(async()=>{const service=await import('../core/page-service.js');try{const tab=await service.activePage();await service.collectPage(tab);return 'unexpected success';}catch(e){return e.message;}});
      assert(active.includes('Chrome 보안 정책'),active);checks.push({name,status:'passed',message:r.error,activePageMessage:active});
    }
    await target.goto('https://first.example.test/docs.html');
    const ai=await panel.evaluate(async()=>{const {ChromeAIEngine}=await import('../ai/analyzer.js');const engine=new ChromeAIEngine();return engine.probe();});
    checks.push({name:'Real Built-in AI availability regression',status:ai.text==='available'?'passed':'blocked',detail:ai});
    const pipeline=await panel.evaluate(async id=>{
      const {collectPage}=await import('../core/page-service.js');const {analyzePageData}=await import('../ai/analyzer.js');const {BUILTIN_PRESETS}=await import('../ai/prompts.js');
      const page=await collectPage({id});const preset=BUILTIN_PRESETS[0];let prompted=false;
      const engine={status:{text:'test-double'},sessions:{text:{}},run:async(prompt,schema)=>{prompted=prompt.includes('Find constraints');const result={answer:'Test answer'};for(const key of schema.required)if(key!=='answer')result[key]=[];return {result};}};
      const result=await analyzePageData({page,preset,engine,userPrompt:'Find constraints'});return {prompted,text:result.ai.text};
    },tabId);assert.equal(pipeline.prompted,true);assert.equal(pipeline.text,'success');checks.push({name:'Extraction to AI pipeline regression (TEST DOUBLE)',status:'passed'});
    const result={testedAt:new Date().toISOString(),browser:context.browser().version(),manifestHostPermissions:manifest.host_permissions,checks,limitations:['HTTP uses a real loopback server; HTTPS uses intercepted fixture responses with real HTTPS URLs/origins. Live external TLS is not verified. The Web Store URL is tested on Chrome’s certificate-error page because this environment cannot validate external TLS.','Actual Gemini Nano inference is unverified if the model remains unavailable. The pipeline test double is not a real AI success.']};
    await fs.writeFile(path.join(__dirname,'permissions-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{await context?.close();await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
