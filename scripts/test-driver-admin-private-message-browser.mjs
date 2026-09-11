import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition, terminateChildProcess } from "./browser-test-helpers.mjs";
const appUrl=process.env.APP_URL || "http://127.0.0.1:3121";
assert.ok(["127.0.0.1","localhost"].includes(new URL(appUrl).hostname),"Synthetic UI test is local-only");
const profile=await mkdtemp(path.join(os.tmpdir(),"prestige-private-message-browser-"));
const port=Number(process.env.CHROME_DEBUG_PORT || 9347);
const chrome=spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",[
  "--headless=new",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check","about:blank",
],{stdio:"ignore"});
let client;
try {
  await waitForChromeDebugPort(port); const target=await waitForChromePageTarget(port);
  client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
  await client.send("Page.enable");await client.send("Runtime.enable");
  const errors=[];client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.text));
  const evaluate=async(expression)=>{
    const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  };
  await client.send("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.testSends=[];window.testSaved=[];
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.origin!==location.origin) throw Error('External request forbidden in local test');
      if(url.pathname.endsWith('/quick-replies')) {
        const body=JSON.parse(init.body);window.testSends.push(body);
        if(body.recipient==='admin') {
          if(!window.testSaved.some(x=>x.client_message_id===body.client_message_id))window.testSaved.push(body);
          if(window.testSends.length===1)throw Error('Synthetic lost response after save');
        }
        return Response.json({ok:true,direction:body.recipient==='admin'?'driver_to_admin':'driver_to_customer'});
      }
      if(url.pathname.endsWith('/notifications')) return Response.json({ok:true,notifications:window.testSaved.map(x=>({id:x.client_message_id,safe_title:'You → Admin',safe_message:x.message_text,safe_context:{direction:'driver_to_admin'},notification_status:'read'}))});
      const response=await originalFetch(input,init);
      if(/^\\/api\\/driver-job\\/[^/]+$/.test(url.pathname)&&(!init?.method||init.method==='GET')) {
        const data=await response.json();
        if(data.payload){data.payload.acknowledged=new URL(location.href).searchParams.get('ack')!=='no';data.payload.status=new URL(location.href).searchParams.get('status')||'assigned';}
        return Response.json(data);
      }
      return response;
    };`});
  const load=async(search="")=>{
    await client.send("Page.navigate",{url:`${appUrl}/driver-job/mock-driver-job-valid-a${search}`});
    await waitForCondition(()=>evaluate(`!!document.querySelector('[data-driver-message-recipient="admin"]')`),30000,"message selector");
  };
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const type=async(text)=>{await evaluate(`(()=>{const e=document.querySelector('[data-driver-customer-message-composer]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
  const text=()=>evaluate(`document.querySelector('[data-driver-customer-message-composer]').value`);
  const disabled=()=>evaluate(`document.querySelector('[data-driver-customer-message-composer]').disabled`);
  await client.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await load();
  assert.equal(await disabled(),false);
  assert.equal(await evaluate(`document.querySelectorAll('[data-driver-customer-message-composer]').length`),1);
  assert.equal(await evaluate(`!!document.querySelector('[data-driver-job-report-issue]')`),false);
  await type("Private pickup issue");
  await click('[data-driver-message-recipient="customer"]');assert.equal(await text(),"");
  await type("Customer greeting");
  await click('[data-driver-message-recipient="admin"]');assert.equal(await text(),"Private pickup issue");
  await click('[data-driver-customer-message-send]');
  await waitForCondition(()=>evaluate(`document.body.innerText.includes('Synthetic lost response')`),5000,"failed send feedback");
  assert.equal(await text(),"Private pickup issue");
  await click('[data-driver-customer-message-send]');
  await waitForCondition(()=>evaluate(`document.body.innerText.includes('Sent to Admin.')`),5000,"Admin success feedback");
  const attempts=await evaluate("window.testSends");
  assert.equal(attempts.length,2);assert.equal(attempts[0].client_message_id,attempts[1].client_message_id);
  assert.equal(await evaluate("window.testSaved.length"),1);
  assert.equal(await text(),"");
  await click('[data-driver-message-recipient="customer"]');assert.equal(await text(),"Customer greeting");
  await click('[data-driver-customer-message-send]');
  await waitForCondition(()=>evaluate(`document.body.innerText.includes('Sent to customer: Customer greeting')`),5000,"Customer success");
  assert.equal((await evaluate("window.testSends.at(-1)")).recipient,undefined,"Legacy Customer request body stays compatible");
  await load("?status=pob");assert.equal(await disabled(),false);
  await click('[data-driver-message-recipient="customer"]');assert.equal(await disabled(),true);
  await click('[data-driver-message-recipient="admin"]');assert.equal(await disabled(),false);
  await evaluate(`document.querySelector('[data-driver-customer-quick-replies]').scrollIntoView({block:'center'})`);
  const overflow=await evaluate(`document.documentElement.scrollWidth>innerWidth`);assert.equal(overflow,false);
  const screenshot=await client.send("Page.captureScreenshot",{format:"png"});
  await writeFile("/private/tmp/prestige-private-message-mobile.png",Buffer.from(screenshot.data,"base64"));
  await load("?ack=no");assert.equal(await disabled(),true);
  await load("?status=completed");assert.equal(await disabled(),true);
  assert.deepEqual(errors,[]);
  console.log("Local browser passed: one compact composer, no Report Issue, separate drafts, retry ID, Customer compatibility, POB/JC/ACK gates, 390px layout, no runtime exceptions.");
} finally {
  if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});
}
