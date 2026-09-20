// Actual local React page with synthetic GET/status responses. No live records,
// GPS, notifications, account writes or provider calls are allowed by this test.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const appUrl=process.env.APP_URL||'http://127.0.0.1:3122';
assert.ok(['127.0.0.1','localhost'].includes(new URL(appUrl).hostname));
const profile=await mkdtemp(path.join(os.tmpdir(),'prestige-jc-confirm-'));
const port=Number(process.env.CHROME_DEBUG_PORT||9352);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'
],{stdio:'ignore'});
let client;
try{
  await waitForChromeDebugPort(port);
  const target=await waitForChromePageTarget(port);client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
  const rawSend=client.send;
  client.send=(method,args)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`Timed out: ${method}`)),15000);
    rawSend(method,args).then(resolve,reject).finally(()=>clearTimeout(timer));
  });
  await client.send('Page.enable');await client.send('Runtime.enable');
  const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
  const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.testWrites=[];window.testUnexpected=[];window.testFail=false;
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      const method=init?.method||'GET';
      if(url.origin!==location.origin){window.testUnexpected.push(url.origin);throw Error('External request forbidden');}
      if(method!=='GET'){
        if(!url.pathname.endsWith('/status')||method!=='PATCH'){window.testUnexpected.push(url.pathname);throw Error('Unexpected mutation');}
        const body=JSON.parse(init.body);window.testWrites.push({method,path:url.pathname,body});
        await new Promise(r=>setTimeout(r,100));
        if(window.testFail)return Response.json({ok:false,reason:'unavailable'},{status:503});
        window.testPayload={...window.testPayload,status:body.status,statusLabel:'Completed'};
        return Response.json({ok:true,payload:window.testPayload});
      }
      if(url.pathname.endsWith('/notifications'))return Response.json({ok:true,notifications:[]});
      const response=await originalFetch(input,init);
      if(/^\\/api\\/driver-job\\/[^/]+$/.test(url.pathname)){
        const data=await response.json();
        if(data.payload){
          const query=new URL(location.href).searchParams;
          data.payload.acknowledged=query.get('ack')!=='no';
          data.payload.status=query.get('status')||'pob';
          data.payload.statusLabel=data.payload.status==='pob'?'Passenger on board':'Assigned';
          window.testPayload=data.payload;
        }
        return Response.json(data);
      }
      return response;
    };`});
  const load=async search=>{
    await client.send('Page.navigate',{url:`${appUrl}/driver-job/mock-driver-job-valid-a${search||''}`});
    await waitForCondition(()=>evaluate(`!!document.querySelector('[data-driver-job-status="Job Completed"]') && !document.querySelector('[data-driver-job-status="Job Completed"]').disabled && !!window.testPayload`),30000,'JC control');
  };
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const open=async()=>{
    await click('[data-driver-job-status="Job Completed"]');
    await waitForCondition(()=>evaluate(`document.querySelector('[data-driver-completion-dialog]').open`),3000,'confirmation');
  };
  for(const width of [320,390,1280]){
    console.log(`Checking compact confirmation at ${width}px`);
    await client.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await load();await open();
    const state=await evaluate(`(()=>{const d=document.querySelector('[data-driver-completion-dialog]'),r=d.getBoundingClientRect();return {
      text:d.innerText,width:r.width,height:r.height,left:r.left,right:r.right,
      buttons:[...d.querySelectorAll('button')].map(b=>({text:b.innerText,label:b.getAttribute('aria-label'),height:b.getBoundingClientRect().height})),
      focused:document.activeElement?.getAttribute('aria-label'),writes:window.testWrites,
      overflow:document.documentElement.scrollWidth>innerWidth};})()`);
    assert.ok(state.width<=288.1&&state.height<=190,'Compact window, not a large card');
    assert.ok(state.left>=15&&state.right<=width-15,'Fits phone viewport');
    assert.equal(state.overflow,false);
    assert.deepEqual(state.buttons.map(b=>b.text),['×','Confirm']);
    assert.ok(state.buttons.every(b=>b.height>=44),'Compact controls retain usable touch targets');
    assert.match(state.text,/Complete this job\?/);assert.match(state.text,/Only confirm when the trip has finished\./);
    assert.equal(state.focused,'Close without completing','Opening must not focus the destructive action');
    assert.deepEqual(state.writes,[],'Opening JC popup cannot save JC');
    const shot=await client.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`/private/tmp/prestige-jc-confirm-${width}.png`,Buffer.from(shot.data,'base64'));
    await click('[aria-label="Close without completing"]');
    assert.equal(await evaluate(`document.querySelector('[data-driver-completion-dialog]').open`),false);
    assert.deepEqual(await evaluate('window.testWrites'),[],'X sends nothing');
    await open();
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitForCondition(()=>evaluate(`!document.querySelector('[data-driver-completion-dialog]').open`),3000,'Escape close');
    assert.deepEqual(await evaluate('window.testWrites'),[],'Escape sends nothing');
    await open();
    await evaluate(`(()=>{const b=document.querySelector('[data-driver-completion-confirm]');b.click();b.click();})()`);
    await waitForCondition(()=>evaluate(`document.querySelector('[data-driver-job-status-message="Job Completed"]')?.textContent.includes('Status updated to Completed.')`),5000,'JC confirmation success');
    assert.deepEqual(await evaluate('window.testWrites'),[{method:'PATCH',path:'/api/driver-job/mock-driver-job-valid-a/status',body:{status:'completed'}}],'Confirm uses exactly one unchanged status request');
    assert.deepEqual(await evaluate('window.testUnexpected'),[]);
  }
  for(const search of ['?ack=no','?status=ots']){
    await load(search);await click('[data-driver-job-status="Job Completed"]');
    await waitForCondition(()=>evaluate(`!!document.querySelector('[data-driver-job-status-message="Job Completed"]')`),3000,'existing blocked status feedback');
    assert.equal(await evaluate(`document.querySelector('[data-driver-completion-dialog]').open`),false,'Existing guards run before popup');
    assert.deepEqual(await evaluate('window.testWrites'),[]);
  }
  await load();await evaluate('window.testFail=true');await open();await click('[data-driver-completion-confirm]');
  await waitForCondition(()=>evaluate(`document.querySelector('[data-driver-job-status-message="Job Completed"]')?.textContent.includes('unavailable')`),5000,'existing failure feedback');
  assert.equal(await evaluate('window.testPayload.status'),'pob','Failed request must not complete locally');
  await evaluate('window.testFail=false');await open();await click('[data-driver-completion-confirm]');
  await waitForCondition(()=>evaluate('window.testPayload.status==="completed"'),5000,'explicit retry');
  assert.equal(await evaluate('window.testWrites.length'),2);
  assert.deepEqual(await evaluate('window.testUnexpected'),[]);assert.deepEqual(errors,[]);
  console.log('PASS compact JC confirmation at 320/390/1280px; X/Escape no write, focus safety, single confirmed PATCH, existing ACK/POB guards, failure and explicit retry; no unrelated writes or runtime exceptions.');
}finally{
  if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});
}
