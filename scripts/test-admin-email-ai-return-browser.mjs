// Serve-only, synthetic browser fixture. Drive with the approved browser tool.
// Executes actual Dispatch handlers, normalizers and field JSX; CRM is stubbed.
// No provider credentials, saved booking writer, or Production data are loaded.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root=process.cwd(), require=createRequire(import.meta.url);
const source=await readFile('app/page.tsx','utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map(); let returnBlock, createButton, reviewButton;
function visit(n){
  if(ts.isFunctionDeclaration(n)&&n.name) declarations.set(n.name.text,n.getText(ast));
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)) declarations.set(n.name.text,`const ${n.getText(ast)};`);
  if(ts.isJsxElement(n)) {
    if(n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='data-admin-dispatch-return-trip-control')) returnBlock=n.getText(ast);
    if(n.openingElement.tagName.getText(ast)==='button') {
      if(n.children.some(c=>ts.isJsxText(c)&&c.text.trim()==='Create Job Card')) createButton=n.getText(ast);
      if(n.children.some(c=>ts.isJsxText(c)&&c.text.trim()==='Review in Dispatch')) reviewButton=n.getText(ast);
    }
  }
  ts.forEachChild(n,visit);
} visit(ast);
assert.ok(returnBlock&&createButton&&reviewButton);
const extract=names=>names.map(name=>{assert.ok(declarations.has(name),name);return declarations.get(name);}).join('\n');
const globals=extract(['clean','cleanReferenceText','hasParsedValue','compactParsedBooking','createInitialBooking','getNeedsReviewWarnings',
  'parseBookingMessageForState','mergeParsedBookingIntoForm','buildAdminDispatchReturnTripBooking',
  'adminDispatchReturnTripRequested','adminDispatchSelectableBookingForm','adminDispatchSafeServiceTypeValue','adminDispatchSafeVehicleTypeValue',
  'normalizeCompanyAccount','getPublicEmailLocalPart','normaliseEmail','normaliseEmailDomain','isPublicEmailDomain',
  'isInternalPrestigeEmailDomain','isIgnoredAccountEmailDomain','isInternalPrestigeAccount','isValidEmail',
  'publicEmailDomains','internalPrestigeEmailDomains','internalPrestigeAccountTokens',
  'adminEmailAiRecommendationEmail','adminEmailAiRecommendationCompanyName','adminEmailAiRecommendationBookerName',
  'adminDispatchServiceTypeOptions','adminDispatchVehicleTypeOptions','fieldLabels','requiredFields']);
const handlers=extract(['openAdminEmailAiIntakeReview','applyParsedBookingMessage','handleParseBookingMessage','renderDispatchBookingField']);
const temp=await mkdtemp(path.join(os.tmpdir(),'prestige-email-return-browser-'));
const transpile=text=>ts.transpileModule(text,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
for(const name of ['booking-parser','ai-parser-schema','admin-email-ai-intake-schema','admin-email-ai-intake-contract','pricing','hourly-billing']) {
  await writeFile(path.join(temp,`${name}.js`),transpile(await readFile(path.join(root,'lib',`${name}.ts`),'utf8')));
}
const entry=`import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {parseJobCardBookingMessage,mergeParsedBookingState} from './booking-parser';
import {sanitizeAiParseResult} from './ai-parser-schema';
import {adminEmailAiCanonicalBookingText,sanitizeAdminEmailAiAnalysis,adminEmailAiAnalysisJsonSchema} from './admin-email-ai-intake-schema';
import {adminEmailAiIntakeAppearsInApp} from './admin-email-ai-intake-contract';
import {normalizeBookingType} from './pricing';
${globals}
const diagnostics={errors:[],networkAttempts:0};
window.addEventListener('error',e=>diagnostics.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>diagnostics.errors.push(String(e.reason)));
for(const method of ['error','warn']){const original=console[method];console[method]=(...args)=>{diagnostics.errors.push(method+': '+args.join(' '));original(...args);};}
window.fetch=async()=>{diagnostics.networkAttempts++;throw Error('Fixture forbids network requests');};
const outbound=Object.fromEntries(Object.keys(adminEmailAiAnalysisJsonSchema.properties.bookingResult.properties.bookings.items.properties).map(k=>[k,k==='needsReviewReasons'?[]:k==='confidence'?0.9:'']));
Object.assign(outbound,{bagCount:'2',bookingType:'TRF',companyAccount:'Example Speakers and Trainers',bookerEmail:'requester@example.test',passengerName:'Alex Sample',vehicle:'Mercedes Benz E-class',pickupDate:'2026-10-07',pickupTime:'18:15',pickup:'7 Example Avenue, Singapore 111111',dropoff:'50 Sample Quay, Singapore 222222',needsReviewReasons:['Confirm booked passenger count.','Confirm Booker identity and contact role.']});
const analysis={classification:'confirmed_booking',confidence:0.9,summary:'Synthetic two-leg return request',reviewReasons:[],suggestedReply:'',bookingResult:{validatedReturnTrip:true,multipleBookingsDetected:true,rawWarnings:[],bookings:[outbound,{...outbound,pickupTime:'20:40',pickup:'50 Sample Quay Rooftop Level 19, Singapore 222222',dropoff:'7 Example Avenue, Singapore 111111'}]}};
const initialRecord={id:'synthetic-return-intake',classification:'confirmed_booking',processing_status:'queued',sender_address:'info@prestigelimo.sg',subject:'Synthetic return booking',booking_parse_result:analysis.bookingResult,canonical_booking_text:adminEmailAiCanonicalBookingText(analysis)};
function Fixture(){
const [record,setRecord]=useState(initialRecord);
const [booking,setBooking]=useState(createInitialBooking),[bookingMessage,setBookingMessage]=useState('');
const [activeAdminEmailAiIntakeId,setActiveAdminEmailAiIntakeId]=useState(''),[activeTab,setActiveTab]=useState('dashboard');
const [aiAssistMode,setAiAssistMode]=useState('parser'),[mobileDispatchBookingStep,setMobileDispatchBookingStep]=useState('message');
const [message,setMessage]=useState(null),[aiDraft,setAiDraft]=useState(null),[aiAssistResponseNote,setAiAssistResponseNote]=useState('');
const [multiBookingNotice,setMultiBookingNotice]=useState(null),[parsedDebug,setParsedDebugBooking]=useState(null);
const [aiAssistMessage,setAiAssistMessage]=useState(null),[diagnosticDisplay,setDiagnosticDisplay]=useState('Not checked');
const appliedAdminBookingSnapshotReferenceRef=useRef(''),loadedBookingIdRef=useRef(''),adminBookingCreateIntentRef=useRef(true);
const activeAdminEmailAiIntakeIdRef=useRef(''),bookingFormRef=useRef(booking),bookingMessageRef=useRef(null),adminEmailAiCustomerRecommendationRevisionRef=useRef(0);
const adminEmailAiIntakeReadState={records:[record]},rateTravelers=[];
const setAdminEmailAiCustomerProfileSuggestion=()=>{},setAiConversationMessages=()=>{};
const clearParseArtifacts=()=>{setMessage(null);setMultiBookingNotice(null);setParsedDebugBooking(null);};
const clearLoadedBookingSelectionContext=()=>{appliedAdminBookingSnapshotReferenceRef.current='';loadedBookingIdRef.current='';adminBookingCreateIntentRef.current=true;};
const loadRates=async()=>({ok:true});
const loadAdminEmailAiCustomerProfileRecommendation=async()=>({status:'not_matched',message:'Synthetic CRM has no matching account. Review the existing identity selectors before saving.'});
const applyAdminEmailAiCustomerProfileRecommendation=()=>{};
const update=(field,value)=>setBooking(current=>({...current,[field]:value}));
${handlers}
return <main className="mx-auto max-w-4xl space-y-3 p-4 text-slate-900">
<h1 className="text-xl font-bold">Synthetic Email AI return-trip browser check</h1>
<p>Actual Dispatch handlers and fields; synthetic queued record and CRM response. Network blocked. No Save + CRM writer.</p>
<div className="flex flex-wrap gap-2">${reviewButton}
<button className="rounded border px-2" onClick={()=>{const next={...initialRecord,booking_parse_result:{...initialRecord.booking_parse_result,validatedReturnTrip:undefined}};setRecord(next);openAdminEmailAiIntakeReview(next);}}>Open unvalidated pair</button>
<button className="rounded border px-2" onClick={()=>{setRecord(initialRecord);openAdminEmailAiIntakeReview(initialRecord);}}>Reopen validated pair</button></div>
<p>Current surface: {activeTab}; step: {mobileDispatchBookingStep}</p>
{activeTab==='dispatch'?<>
<p>{aiAssistResponseNote}</p><p>{aiAssistMessage?.text}</p>
<p>AI source vehicle: {aiDraft?.bookings[0]?.vehicle}; source legs: {aiDraft?.bookings.length}</p>
{aiDraft?.bookings[0]?.needsReviewReasons.map(reason=><p key={reason}>{reason}</p>)}
<label className="block">Paste Booking Message<textarea ref={bookingMessageRef} className="block h-52 w-full rounded border p-2 text-xs" value={bookingMessage} onChange={e=>setBookingMessage(e.target.value)}/></label>
${createButton}
{message?<p role="status">{message.text}</p>:null}
<section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{['company','booker','bookerEmail','bookerContact','name','passengerContact','pax','luggageCount','bookingType','vehicle','date','time','pickup','dropoff'].map(renderDispatchBookingField)}</section>
${returnBlock}
<button className="rounded border p-2" onClick={()=>{const ret=buildAdminDispatchReturnTripBooking(booking);setDiagnosticDisplay(JSON.stringify({outbound:{date:booking.date,time:booking.time,pickup:booking.pickup,dropoff:booking.dropoff},returnLeg:{date:ret.date,time:ret.time,pickup:ret.pickup,dropoff:ret.dropoff},blanks:{pax:booking.pax,booker:booking.booker,bookerContact:booking.bookerContact,passengerContact:booking.passengerContact},vehicleCategory:booking.vehicle,errors:diagnostics.errors,networkAttempts:diagnostics.networkAttempts,overflow:document.documentElement.scrollWidth>window.innerWidth},null,2));}}>Inspect local result</button>
<pre className="whitespace-pre-wrap break-words text-xs" role="status">{diagnosticDisplay}</pre>
</>:null}</main>;
}createRoot(document.getElementById('root')).render(<Fixture/>);`;
await writeFile(path.join(temp,'entry.js'),transpile(entry));
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry:path.join(temp,'entry.js'),output:{path:temp,filename:'bundle.js'},resolve:{modules:[path.join(root,'node_modules')]}});compiler.run((err,stats)=>{compiler.close(()=>{});if(err||stats.hasErrors())reject(err||Error(stats.toString('errors-only')));else resolve();});});
const bundle=await readFile(path.join(temp,'bundle.js'));
const css=(await postcss([tailwind({base:root})]).process(await readFile('app/globals.css','utf8'),{from:'app/globals.css'})).css;
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Email AI return local regression</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server=createServer((req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'");if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle);}else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}else if(req.url==='/'||req.url==='/favicon.ico'){res.setHeader('Content-Type','text/html');res.end(html);}else{res.writeHead(404);res.end();}});
server.listen(0,'127.0.0.1',()=>console.log('Email return fixture: http://127.0.0.1:'+server.address().port));
process.on('SIGINT',()=>server.close(async()=>{await rm(temp,{recursive:true,force:true});process.exit(0);}));
