// Synthetic React fixture: renders the existing photo JSX and executes its real
// deletion handler. No Production data, credentials or network writers.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url);
const source=await readFile('app/page.tsx','utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler,photoBlock;
function visit(n){
  if(ts.isFunctionDeclaration(n)&&n.name?.text==='deleteAdminOtsPhoto')handler=n.getText(ast);
  if(ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='data-admin-driver-ots-photo-proof-visible-readout'))photoBlock=n.getText(ast);
  ts.forEachChild(n,visit);
}visit(ast);assert.ok(handler&&photoBlock);
const entry=`import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
const initialProof={id:'11111111-1111-4111-8111-111111111111',booking_reference:'SYNTHETIC-A',uploaded_at:'2026-06-20T12:00:00.000Z',admin_view_url:'/photo.svg'};
const initialState={bookingReference:'SYNTHETIC-A',proofs:[initialProof],latestProof:initialProof,status:'loaded'};
function Fixture(){
const [adminDriverOtsPhotoProofReadState,setAdminDriverOtsPhotoProofReadState]=useState(initialState);
const [dashboard,setDashboardDriverOtsPhotoProofReadStates]=useState({'SYNTHETIC-A':initialState});
const [otsPhotoDeleteAction,setOtsPhotoDeleteAction]=useState(null);
const [requests,setRequests]=useState(0),[fail,setFail]=useState(false);
const deletedOtsPhotoIdsRef=useRef(new Set()),deletingOtsPhotoRef=useRef(false);
const adminDriverOtsPhotoProofLatest=adminDriverOtsPhotoProofReadState.latestProof;
const adminDriverOtsPhotoProofLatestTime='20 June 2026, 20:00 SGT';
const adminDriverOtsPhotoProofReadoutMessage='OTS photo received for SYNTHETIC-A';
const adminDriverOtsPhotoProofLabel='OTS photo received';
const dispatchReleaseWorkflowBookingReference='SYNTHETIC-A';
const adminDriverOtsPhotoProofsApiPath='/api/admin-driver-ots-photo-proofs',adminLegacyDataPurpose='admin-booking-persistence';
const adminDriverJobStatusTimeLabel=()=>adminDriverOtsPhotoProofLatestTime,adminVisibleBookingReference=x=>x,clean=x=>x;
const refreshAdminDriverOtsPhotoProofRead=async()=>{};
const fetch=async(url,opts)=>{if(url!==adminDriverOtsPhotoProofsApiPath||opts.method!=='DELETE')throw Error('Unexpected fixture request');setRequests(n=>n+1);return {ok:!fail,json:async()=>({ok:!fail})};};
${handler}
return <main className="mx-auto max-w-3xl p-4"><h1 className="mb-4 font-semibold">Synthetic completed-job photo test</h1>
<label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/> Simulate deletion failure</label>
<button className="m-2 rounded border px-2" onClick={()=>{setAdminDriverOtsPhotoProofReadState(initialState);setDashboardDriverOtsPhotoProofReadStates({'SYNTHETIC-A':initialState});setOtsPhotoDeleteAction(null);setRequests(0);deletedOtsPhotoIdsRef.current.clear();}}>Reset fixture</button>
<details open className="rounded border p-3"><summary>Driver Reports</summary>
<p data-report-history="true">OTW 19:20 · OTS 19:40 · POB 19:50 · JC 20:15</p>
{otsPhotoDeleteAction?<p role="status">{otsPhotoDeleteAction.text}</p>:null}
{adminDriverOtsPhotoProofLatest?(${photoBlock}):<p>No OTS photo.</p>}
</details><output>Requests: {requests}; photo records: {adminDriverOtsPhotoProofReadState.proofs.length}; Dashboard photo records: {dashboard['SYNTHETIC-A'].proofs.length}</output></main>;
}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const temp=await mkdtemp(path.join(os.tmpdir(),'prestige-ots-photo-fixture-'));
await writeFile(path.join(temp,'entry.js'),ts.transpileModule(entry,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry:path.join(temp,'entry.js'),output:{path:temp,filename:'bundle.js'},resolve:{modules:[path.join(process.cwd(),'node_modules')]}});compiler.run((err,stats)=>{compiler.close(()=>{});if(err||stats.hasErrors())reject(err||Error(stats.toString('errors-only')));else resolve();});});
const bundle=await readFile(path.join(temp,'bundle.js'));
const css=(await postcss([tailwind({base:process.cwd()})]).process(await readFile('app/globals.css','utf8'),{from:'app/globals.css'})).css;
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>OTS photo local regression</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server=createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'");
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle);}
  else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else if(req.url==='/photo.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="lightblue"/><text x="20" y="100">Synthetic OTS photo</text></svg>');}
  else{res.setHeader('Content-Type','text/html');res.end(html);}
});
server.listen(0,'127.0.0.1',()=>console.log('OTS fixture: http://127.0.0.1:'+server.address().port));
process.on('SIGINT',()=>server.close(async()=>{await rm(temp,{recursive:true,force:true});process.exit(0);}));
