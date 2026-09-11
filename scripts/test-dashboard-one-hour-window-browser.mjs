import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition, terminateChildProcess } from "./browser-test-helpers.mjs";
const appUrl=process.env.APP_URL || "http://127.0.0.1:3122";
assert.ok(["127.0.0.1","localhost"].includes(new URL(appUrl).hostname),"Synthetic UI test is local-only");
const profile=await mkdtemp(path.join(os.tmpdir(),"prestige-dashboard-window-browser-"));
const port=Number(process.env.CHROME_DEBUG_PORT || 9350);
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
  await client.send("Page.addScriptToEvaluateOnNewDocument", {source:`
    const realNow=Math.floor(Date.now()/60000)*60000; window.qaNow=realNow; Date.now=()=>window.qaNow;
    window.qaWrites=[]; window.qaReads=[];
    const make=(id,delta,status='assigned',driver='Example Chauffeur')=>({
      id,booking_reference:id,public_booking_reference:id,booking_type:'TRF',vehicle:'AVF',
      pickup_at:new Date(realNow+delta).toISOString(),pickup_datetime:new Date(realNow+delta).toISOString(),
      pickup_address:'Example pickup',dropoff_address:'Example destination',route:'Example pickup > Example destination',
      passenger_name:'Example passenger',driver_name:driver,driver_id:driver?71:null,status,pax:1,
      created_at:new Date(realNow).toISOString(),updated_at:new Date(realNow).toISOString()
    });
    window.qaRows=[make('WINDOW-ADVANCE',22*86400000),make('WINDOW-BOUNDARY',3600000),
      make('WINDOW-WAIT',3660000),make('WINDOW-ACTIVE',-3600000),make('WINDOW-JC',-3600000),
      make('WINDOW-CLOSED',0,'completed'),make('WINDOW-CANCELLED',0,'cancelled'),make('WINDOW-TBC',0,'assigned','')];
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const u=new URL(typeof input==='string'?input:input.url,location.href);
      if(u.origin!==location.origin)throw Error('External fetch forbidden');
      if(!u.pathname.startsWith('/api/'))return original(input,init);
      const method=init?.method||'GET';window.qaReads.push(u.pathname);
      if(method!=='GET'){window.qaWrites.push(method+' '+u.pathname);return Response.json({ok:false},{status:403});}
      if(u.pathname==='/api/admin-saved-bookings')return Response.json({ok:true,bookings:window.qaRows});
      if(u.pathname==='/api/admin-load-bookings-typed-read')return Response.json({ok:true,bookings:[],read_gate_open:true,status:'ready'});
      if(u.pathname==='/api/admin-driver-job-statuses'){
        const ref=u.searchParams.get('booking_reference');const status=ref==='WINDOW-JC'?'completed':'pob';
        return Response.json({ok:true,booking_reference:ref,statuses:[{id:'status-'+ref,status_value:status,occurred_at:new Date(realNow).toISOString(),created_at:new Date(realNow).toISOString()}]});
      }
      return Response.json({ok:true,bookings:[],notifications:[],statuses:[],items:[],links:[],settings:{enabled:false},has_more:false});
    };
  `});
  await client.send("Page.navigate",{url:appUrl});
  const cards=()=>evaluate(`Array.from(document.querySelectorAll('[data-admin-multi-driver-active-job]')).map(e=>e.getAttribute('data-admin-multi-driver-active-job'))`);
  await waitForCondition(async()=> (await cards()).includes('WINDOW-BOUNDARY'),30000,'loaded Dashboard boundary card');
  assert.deepEqual((await cards()).sort(),['WINDOW-ACTIVE','WINDOW-BOUNDARY','WINDOW-JC'].sort());
  assert.equal(await evaluate(`document.querySelector('[data-admin-multi-driver-active-jobs-auto-refresh-state]').getAttribute('data-admin-multi-driver-active-jobs-auto-refresh-state')`),'off');
  // Let the existing 30-second clock update state; do not click Refresh or enable polling.
  await evaluate('window.qaNow += 60000');
  await waitForCondition(async()=> (await cards()).includes('WINDOW-WAIT'),40000,'automatic one-hour boundary');
  assert.ok(!(await cards()).includes('WINDOW-ADVANCE'));
  assert.deepEqual(await evaluate('window.qaWrites'),[],'Read-only fixture must not submit any action');
  assert.deepEqual(errors,[]);
  console.log('Dashboard browser passed: future hidden, one-hour visible, automatic boundary with refresh Off, active cards retained, no writes or runtime exceptions.');
} finally {
  if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});
}
