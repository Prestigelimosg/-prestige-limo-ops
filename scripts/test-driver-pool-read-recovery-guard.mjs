import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Execute the real reader and existing section, with synthetic read-only responses.
const source=fs.readFileSync('app/driver-portal/page.tsx','utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback,section,decision;
function visit(n){
  if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='loadAvailableJobs')callback=n.initializer.arguments[0].getText(ast);
  if(ts.isFunctionDeclaration(n)&&n.name?.text==='decideAvailableJob')decision=n.getText(ast);
  if(ts.isConditionalExpression(n)&&ts.isParenthesizedExpression(n.whenTrue)&&ts.isJsxElement(n.whenTrue.expression)&&n.whenTrue.expression.openingElement.attributes.getText(ast).includes('data-driver-pool-available-jobs'))section=n.getText(ast);
  ts.forEachChild(n,visit);
}visit(ast);
assert.ok(callback&&section);
function evaluate(code,bindings){return new Function(...Object.keys(bindings),ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(...Object.values(bindings));}
function harness(){
  const state={availableJobs:[],availableJobsEnabled:false,availableJobsReadAvailable:false,availableJobsError:'',availableJobsHasMore:false,availableJobsPage:1,availableJobsBusy:false,availableJobsFeedback:{},availableJobsAcceptedConfirmation:''};
  const requests=[];let response=async()=>({ok:false,json:async()=>({ok:false})});
  const setters=Object.fromEntries(Object.keys(state).map(k=>['set'+k[0].toUpperCase()+k.slice(1),v=>{state[k]=typeof v==='function'?v(state[k]):v;}]));
  const ref={current:0};
  const load=evaluate(`return (${callback});`,{...setters,availableJobsReadRevisionRef:ref,currentNativeInstallationId:()=>null,fetch:async(url,options)=>{requests.push({url,options});return response();}});
  const html=(account=true)=>renderToStaticMarkup(evaluate(`return (${section});`,{React,...state,driverPoolAccountSession:account,loadAvailableJobs:load,decideAvailableJob:()=>{},DriverComboTrips:()=>null}));
  return {state,load,html,requests,ref,setResponse:fn=>response=fn};
}
const success=(jobs=[],enabled=true)=>async()=>({ok:true,json:async()=>({ok:true,enabled,jobs,has_more:false})});
const job={offer_key:'a'.repeat(64),public_booking_reference:'QA-READ',offer_payout_sgd:45,pickup_at:'2026-10-01T02:00:00Z',closes_at:'2026-10-01T01:00:00Z',safe_pickup_area:'QA pickup',safe_dropoff_area:'QA dropoff',safe_job_details:{},response_status:'pending'};
const h=harness();
await h.load();
assert.ok(h.state.availableJobsError,'Failed read must have visible recovery feedback');
assert.match(h.html(),/Available Jobs/);assert.match(h.html(),/>Refresh</);assert.doesNotMatch(h.html(),/No open job offers/);assert.equal(h.state.availableJobsBusy,false);
assert.equal(h.html(false),'','No section for an unverified account');
h.setResponse(success([job]));await h.load();assert.equal(h.state.availableJobsError,'');assert.equal(h.state.availableJobsReadAvailable,true);assert.match(h.html(),/QA-READ/);
h.setResponse(async()=>{throw Error('synthetic network failure');});await h.load(1,{quiet:true});
assert.equal(h.state.availableJobsReadAvailable,false,'Quiet failure must invalidate freshness');assert.ok(h.state.availableJobsError);assert.match(h.html(),/QA-READ/,'Retain prior card with warning');assert.match(h.html(),/disabled=""[^>]*>Accept</);assert.match(h.html(),/disabled=""[^>]*>Decline</);
h.setResponse(success());await h.load();assert.equal(h.state.availableJobsError,'');assert.match(h.html(),/No open job offers/);
h.setResponse(success([],false));await h.load();assert.equal(h.html(),'','Successful disabled-feature response stays hidden');
let rejectOld;h.setResponse(()=>new Promise((_,reject)=>{rejectOld=reject;}));const old=h.load();
h.setResponse(success([job]));await h.load();rejectOld(Error('late failure'));await old;assert.equal(h.state.availableJobsReadAvailable,true);assert.equal(h.state.availableJobsError,'');
assert.ok(h.requests.every(r=>r.url.startsWith('/api/driver-job-bids?')&&!r.options.method),'Recovery performs reads only');
const blockedDecision=evaluate(`${decision};return decideAvailableJob;`,{availableJobsReadAvailable:false});
await blockedDecision(job,'accept');await blockedDecision(job,'decline'); // Must return before touching any writer or request state.
console.log('PASS Available Jobs read recovery: visible retry, truthful empty/stale state, disabled stale decisions, successful retry, feature-off and late-response isolation.');
