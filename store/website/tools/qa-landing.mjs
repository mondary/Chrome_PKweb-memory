// Isolated, headless QA. Does not connect to or restart the user's Chrome.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const temp = await mkdtemp('/private/var/folders/jb/07k9zyks6_d60c27tclhjd2h0000gn/T/opencode/landing-qa-');
const wait = ms => new Promise(r => setTimeout(r, ms));
const child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
  `--user-data-dir=${temp}`, '--remote-debugging-port=0', 'about:blank',
], { stdio:'ignore' });
let socket;
try {
  let port;
  for(let i=0;i<100;i++){try{port=Number((await readFile(join(temp,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{} if(port)break;await wait(100);}
  assert(port, 'Headless debug port');
  const browser = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket = new WebSocket(browser.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  let id=0;const pending = new Map();
  socket.addEventListener('message', e => { const d=JSON.parse(e.data),p=pending.get(d.id);if(p){pending.delete(d.id); d.error?p.reject(new Error(JSON.stringify(d.error))):p.resolve(d.result);} });
  function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,sessionId}));});}
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p={})=>send(m,p,sessionId);
  async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  await call('Page.enable');
  const url='file://'+resolve('store/website/index.html');
  await call('Page.navigate',{url:url+'?lang=fr'});await wait(700);
  const reports=[];
  for(const [width,height] of [[1440,900],[1024,768],[1920,1080],[768,1024],[390,844]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(300);
    const r=await evaluate(`(()=>{const r=document.querySelector('.stage').getBoundingClientRect(),img=document.querySelector('#demo-image');return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,stageWidth:Math.round(r.width),stageHeight:Math.round(r.height),imageLoaded:img.complete&&img.naturalWidth>0,src:img.getAttribute('src')};})()`);
    assert(r.scrollWidth<=width, 'No horizontal overflow '+width);
    if(width>=1000)assert(r.scrollHeight<=height, 'No desktop page scroll '+width);
    assert(r.imageLoaded, 'GIF loaded');assert(r.stageWidth>250);
    reports.push(r);
    const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(join(temp,`landing-${width}.png`),Buffer.from(data,'base64'));
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('#motion').click()`);
  assert.equal(await evaluate(`document.querySelector('#demo-image').getAttribute('src')`),'media/demo-poster.png');
  await evaluate(`document.querySelector('#tab-sessions').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
  assert.equal(await evaluate(`document.activeElement.id`),'tab-bookmarks');
  assert.equal(await evaluate(`document.querySelector('#demo-image').getAttribute('src')`),'media/bookmarks.png');  await evaluate(`document.querySelector('#enlarge').click()`);
  assert(await evaluate(`document.querySelector('dialog').open`));
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await wait(100);
  assert.equal(await evaluate(`document.querySelector('dialog').open`),false);
  assert.equal(await evaluate(`document.activeElement.id`),'enlarge');
  await evaluate(`document.querySelector('[data-lang="en"]').click()`);
  assert.equal(await evaluate(`document.documentElement.lang`),'en');
  assert((await evaluate(`document.title`)).includes('Pick up'));
  await evaluate(`document.querySelector('#tab-demo').click()`);
  const {data:en}=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(temp,'landing-en.png'),Buffer.from(en,'base64'));
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(100);
  assert.equal(await evaluate(`document.querySelector('#demo-image').getAttribute('src')`),'media/demo-poster.png');
  await evaluate(`document.querySelector('[data-lang="fr"]').click()`);
  await evaluate(`document.querySelector('#enlarge').click()`);
  const {data:large}=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(temp,'landing-expanded.png'),Buffer.from(large,'base64'));
  await call('Page.navigate',{url:url+'?lang=fr'});await wait(300);
  const text=await evaluate(`document.body.innerText`);
  assert(!/5.?097|249 sessions|41 dossiers|483|534/.test(text),'No personal statistics');
  // Storage failure must not break the manual language switch.
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});`});
  await call('Page.navigate',{url:url+'?lang=en'});await wait(300);
  await evaluate(`document.querySelector('[data-lang="fr"]').click()`);
  assert.equal(await evaluate(`document.documentElement.lang`),'fr');
  await call('Emulation.setScriptExecutionDisabled',{value:true});
  await call('Page.navigate',{url:url});await wait(200);
  assert((await evaluate(`document.body.innerText`)).includes('Retrouvez'));
  console.log(JSON.stringify({passed:true,screenshots:temp,viewports:reports,checks:['GIF loading','pause','keyboard tabs','dialog Escape + focus','FR/EN + metadata','reduced motion','no private stats','blocked localStorage','no-JS French']},null,2));
  await send('Browser.close');
} finally { socket?.close();child.kill('SIGTERM'); }
