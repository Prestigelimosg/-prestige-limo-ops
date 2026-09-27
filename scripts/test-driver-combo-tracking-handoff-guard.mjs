import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const read = path => fs.readFileSync(path, 'utf8');
const transpile = source => ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const contract = await import('data:text/javascript;base64,'+Buffer.from(transpile(read('driver-companion/src/driver-job-contract.ts'))).toString('base64'));
function callback(file,name,hook=false){
  const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let value;
  function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)value=(hook?n.initializer.arguments[0]:n.initializer).getText(ast);ts.forEachChild(n,visit);}visit(ast);
  assert.ok(value,name);return value;
}
function bind(expression,deps){return new Function(...Object.keys(deps),transpile('return ('+expression+');'))(...Object.values(deps));}
const failures=[];async function test(name,fn){try{await fn();console.log('PASS',name)}catch(e){failures.push(name+': '+e.message);console.error('FAIL',name,e.message)}}
const origin=contract.productionOrigin;
const old=contract.parseDriverJobUrl(origin+'/driver-job/'+'a'.repeat(43));
const next=contract.parseDriverJobUrl(origin+'/driver-job/'+'b'.repeat(43));
const continuation={ok:false,reason:'expired',payload:null,next_job_url:'/driver-job/'+next.token};
const originalFetch=globalThis.fetch;
await test('completed combo response is terminal only for canonical verified continuation',async()=>{
  for(const [status,body,terminal] of [[200,continuation,true],[410,{ok:false,reason:'expired'},true],[503,continuation,false],[200,{...continuation,reason:'unavailable'},false],[200,{...continuation,next_job_url:'https://example.com/driver-job/'+next.token},false],[200,{...continuation,next_job_url:'/driver-job/'+old.token},false],[200,{...continuation,next_job_url:'/driver-job/'+next.token+'?x=1'},false]]){
    globalThis.fetch=async()=>new Response(JSON.stringify(body),{status});
    await assert.rejects(()=>contract.loadDriverJobSummary(old),e=>e instanceof contract.DriverJobRequestError&&e.terminal===terminal);
  }
});
globalThis.fetch=originalFetch;
await test('failed native start cannot show sharing active',()=>{
  let state={};const activities=[];
  const handle=bind(callback('app/driver-job/[token]/page.tsx','handleNativeTrackingResult'),{setDriverLiveLocation:fn=>state=fn(state),addActivity:(...x)=>activities.push(x)});
  handle({detail:{request:'tracking_start',ok:false,active:true,message:'Another tracking action is still running.'}});
  assert.equal(state.sharingState,'inactive');assert.equal(state.retryAction,'share');assert.equal(state.feedback.tone,'error');assert.equal(activities.length,0);
  handle({detail:{request:'tracking_start',ok:true,active:true,message:'Trip tracking is active.'}});assert.equal(state.sharingState,'active');assert.equal(activities.length,1);
  handle({detail:{request:'tracking_stop',ok:false,active:true,message:'Stop failed'}});assert.equal(state.retryAction,'stop');
});
function openerDeps(summary){let active=true;const calls=[];const ref={current:old.jobUrl};return {calls,ref,deps:{...contract,parseDriverJobUrl:contract.parseDriverJobUrl,driverAppJobUrl:x=>x,currentWebViewUrlRef:ref,webViewRequestHeadersRef:{current:null},pendingOauthTokenRef:{current:''},readTrackingState:async()=>({active,job:active?old:null}),loadDriverJobSummary:summary,stopTrackingAfterTerminalResponse:async job=>{assert.equal(job.token,old.token);active=false;calls.push('stop')},readDriverAccountSetup:async()=>null,setCanGoBack:()=>{},setScreen:fn=>calls.push(fn({navigationKey:1})),readableFailure:e=>e.message}}}
await test('next member recovers terminal old tracking; active or uncertain old trip remains protected',async()=>{
  for(const mode of ['completed','expired','active','offline']){
    const h=openerDeps(async()=>{if(mode==='expired')throw new contract.DriverJobRequestError('expired',200,true);if(mode==='offline')throw Error('offline');return {status:mode==='completed'?'completed':'pob'}});
    await bind(callback('driver-companion/App.tsx','receiveDriverJobUrl',true),h.deps)(next.jobUrl);
    const opens=h.calls.filter(x=>typeof x==='object');
    assert.equal(opens.at(-1)?.jobUrl,['completed','expired'].includes(mode)?next.jobUrl:old.jobUrl);
    assert.equal(h.calls.includes('stop'),['completed','expired'].includes(mode));
  }
});
await test('late old-job verification cannot override newer navigation',async()=>{
  const h=openerDeps(async()=>{h.ref.current=origin+'/driver-portal';return {status:'completed'}});
  await bind(callback('driver-companion/App.tsx','receiveDriverJobUrl',true),h.deps)(next.jobUrl);
  assert.equal(h.calls.length,0);
});
await test('terminal cleanup waits for busy start then clears only that exact job',async()=>{
  let resolveStart;const calls=[];const busy={current:false};const pending={current:null};
  const deps={...contract,parseDriverBridgeMessage:JSON.parse,currentWebViewUrlRef:{current:old.jobUrl},bridgeBusyRef:busy,pendingTrackingTerminalRef:pending,screen:{active:true},readTrackingState:async()=>({active:true,job:old}),startDriverTracking:()=>new Promise(resolve=>resolveStart=resolve),stopTrackingAfterTerminalResponse:async job=>{assert.equal(job.token,old.token);calls.push('stop');return true},setScreen:()=>{},sendTrackingResult:(request,result)=>calls.push({request,...result})};
  const handle=bind(callback('driver-companion/App.tsx','handleBridgeMessage',true),deps);
  const running=handle({nativeEvent:{url:old.jobUrl,data:JSON.stringify({type:'tracking_start'})}});
  await handle({nativeEvent:{url:old.jobUrl,data:JSON.stringify({type:'tracking_terminal'})}});
  assert.equal(calls.includes('stop'),false);assert.equal(pending.current?.token,old.token);
  resolveStart({active:true,message:'Tracking started'});await running;
  assert.equal(calls.filter(x=>x==='stop').length,1);assert.equal(busy.current,false);assert.equal(pending.current,null);
});
await test('terminal stop preserves unrelated tracking and retains retry state when OS stop fails',async()=>{
  const source=read('driver-companion/src/tracking.ts');const ast=ts.createSourceFile('tracking.ts',source,ts.ScriptTarget.Latest,true);let fn;
  ast.forEachChild(n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='stopTrackingAfterTerminalResponse')fn=n.getText(ast).replace('export ','')});
  for(const mode of ['same','different','failure']){
    const calls=[];const deps={readActiveJob:async()=>mode==='different'?next:old,hasStartedTracking:async()=>true,Location:{stopLocationUpdatesAsync:async()=>{if(mode==='failure')throw Error('OS stop failed');calls.push('stop')}},DRIVER_LOCATION_TASK_NAME:'test',clearActiveJob:async()=>calls.push('clear')};
    const stop=new Function(...Object.keys(deps),transpile(fn+';return stopTrackingAfterTerminalResponse;'))(...Object.values(deps));
    if(mode==='failure')await assert.rejects(()=>stop(old));else await stop(old);
    assert.deepEqual(calls,mode==='same'?['stop','clear']:[]);
  }
});
await test('background worker stops only completed member and sends no position for it',async()=>{
  const source=read('driver-companion/src/background-location-task.ts');
  const ast=ts.createSourceFile('task.ts',source,ts.ScriptTarget.Latest,true);let expression;
  function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='TaskManager.defineTask')expression=n.arguments[1].getText(ast);ts.forEachChild(n,visit);}visit(ast);
  for(const [status,body,stopped] of [[200,continuation,true],[503,{ok:false,reason:'unavailable'},false],[200,{ok:true,payload:{status:'completed'}},true]]){
    globalThis.fetch=async()=>new Response(JSON.stringify(body),{status});const calls=[];
    const task=bind(expression,{...contract,readActiveJob:async()=>old,postDriverLocation:async()=>calls.push('upload'),stopTrackingAfterTerminalResponse:async job=>{assert.equal(job.token,old.token);calls.push('stop')}});
    await task({data:{locations:[{coords:{latitude:0,longitude:0},timestamp:Date.now()}]}});
    assert.deepEqual(calls,stopped?['stop']:[]);
  }
  globalThis.fetch=originalFetch;
});
await test('queued old completion cannot stop a newly active member',async()=>{
  const pending={current:old};const busy={current:false};let stops=0;
  const deps={...contract,parseDriverBridgeMessage:JSON.parse,currentWebViewUrlRef:{current:next.jobUrl},bridgeBusyRef:busy,pendingTrackingTerminalRef:pending,screen:{active:true},readTrackingState:async()=>({active:true,job:next}),startDriverTracking:async()=>({active:true,message:'Active'}),stopTrackingAfterTerminalResponse:async job=>{assert.equal(job.token,old.token);return false},setScreen:fn=>{const result=fn({active:true});if(result.active===false)stops++},sendTrackingResult:()=>{}};
  await bind(callback('driver-companion/App.tsx','handleBridgeMessage',true),deps)({nativeEvent:{url:next.jobUrl,data:JSON.stringify({type:'tracking_start'})}});
  assert.equal(stops,0);assert.equal(pending.current,null);assert.equal(busy.current,false);
});
assert.equal(failures.length,0,failures.join('\n'));
