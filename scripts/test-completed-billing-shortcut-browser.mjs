// Synthetic serve-only fixture; drive with the approved browser tool.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root=process.cwd(),require=createRequire(import.meta.url),temp=await mkdtemp(path.join(root,'.tmp-completed-billing-'));
const page=await readFile('app/page.tsx','utf8'),ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler,button;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='openCompletedHistoryBilling')handler=n.getText(ast);if(ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='data-completed-paid-booking'))button=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
if(!handler||!button)throw Error('Missing Completed shortcut');
await writeFile(path.join(temp,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;};`);
await writeFile(path.join(temp,'link.tsx'),`import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`);
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import MyBookingsPage from '../app/my-bookings/page';
import {CustomerInvoiceFolderPanel} from '../app/customers/[customerId]/customer-invoice-folder-panel';
import {CustomerFolderSavedBookingsPanel} from '../app/customers/[customerId]/saved-bookings-panel';
const scenario=new URLSearchParams(location.search).get('case')||sessionStorage.getItem('fixture-case')||'single';sessionStorage.setItem('fixture-case',scenario);
const booking={id:1,booking_reference:'ADM-209901010001',public_booking_reference:'99001',customer_id:'164',company_id:60,booker_id:38,traveler_id:null,customer_account:'LOCAL ACCOUNT',customer_display_name:'LOCAL ACCOUNT',passenger_name:'Example Passenger',customer_price_amount:85,service_type:'MNG',route_type:'MNG',pickup_at:'2026-09-20T10:00:00Z',pickup_datetime:'2026-09-20T10:00:00Z',pickup_location:'Example Airport',dropoff_location:'Example Hotel',route_summary:'Example Airport > Example Hotel',status:'completed',admin_status:'completed',vehicle_type_or_category:'AVF'};
const invoice={customerId:'164',customerName:'LOCAL ACCOUNT',invoiceNumber:'INV-20990101-0001',reference:'99001',documentType:'invoice',documentState:'issued',status:'Unpaid',amountCents:8500,amountLabel:'SGD85.00',lineItems:[{bookingReference:'99001',amountLabel:'SGD85.00',description:'ARRIVAL | 20 SEP, 1800 | EXAMPLE AIRPORT > EXAMPLE HOTEL',quantity:1}]};
let invoices=scenario==='prepaid'?[]:scenario==='ambiguous'?[invoice,{...invoice,invoiceNumber:'INV-20990101-0002'}]:[{...invoice,...(scenario==='shared'?{amountCents:17000,amountLabel:'SGD170.00',lineItems:[...invoice.lineItems,{bookingReference:'99002',amountLabel:'SGD85.00',description:'OTHER JOB',quantity:1}]}:{}),...(scenario==='paid'?{status:'Paid'}:{})}];
if(scenario==='portal'){invoices=JSON.parse(sessionStorage.getItem('fixture-invoices')||'null')||[{...invoice,status:'Paid'}];invoices.push({...invoice,invoiceNumber:'INV-20990101-0002',reference:'99002',status:'Unpaid',lineItems:[{...invoice.lineItems[0],bookingReference:'99002',description:'ARRIVAL | EXAMPLE BOSS B | 99002'}]});}
const diag={requests:[],errors:[]};window.addEventListener('error',e=>diag.errors.push(e.message));window.addEventListener('unhandledrejection',e=>diag.errors.push(String(e.reason)));
window.fetch=async(url,opts={})=>{const u=new URL(url,location.origin),method=opts.method||'GET';diag.requests.push({path:u.pathname,method});let body;
 if(u.pathname==='/api/admin-customer-invoices'){
  if(method==='GET')body={ok:true,invoices};
  else if(method==='PATCH'){const input=JSON.parse(opts.body);if(input.status!=='Paid'||input.invoiceNumber!==invoice.invoiceNumber)throw Error('Unexpected payment');invoices=invoices.map(x=>x.invoiceNumber===input.invoiceNumber?{...x,status:'Paid',paymentMethod:input.paymentMethod,paidAt:new Date().toISOString()}:x);sessionStorage.setItem('fixture-invoices',JSON.stringify(invoices));body={ok:true,invoice:invoices[0]};}
  else throw Error('Unexpected invoice writer');
 }else if(u.pathname==='/api/customer-principal-access'&&method==='GET')body={ok:true,data:{principal_role:scenario==='portal-boss'?'boss':'pa',memberships:scenario==='portal-boss'?[{company_id:60,booker_id:38,traveler_id:70,verified_boss_name:'Example Boss A'}]:[{company_id:60,booker_id:38,traveler_id:null}]}};
 else if(u.pathname==='/api/customer-invoices'&&method==='GET')body={ok:true,invoices:invoices.map(x=>({...x,id:x.invoiceNumber,billingMonthLabel:'September 2026',storageSource:'server',issueDateIso:'2026-09-20',issueDateLabel:'20 Sep 2026',dueDateLabel:'30 Sep 2026',pdfFilename:x.invoiceNumber+'.pdf'}))};
 else if(u.pathname==='/api/customer-saved-bookings'&&method==='GET')body={ok:true,pagination:{page:1,page_size:25,has_next_page:false,has_previous_page:false},saved_bookings:[{booking_reference:booking.booking_reference,public_booking_reference:'99001',customer_facing_status:'completed',passenger_name:'Example Boss A',pickup_at:booking.pickup_at,pickup_location:booking.pickup_location,dropoff_location:booking.dropoff_location,service_type:'MNG'},{booking_reference:'ADM-209901010002',public_booking_reference:'99002',customer_facing_status:'completed',passenger_name:'Example Boss B',pickup_at:booking.pickup_at,pickup_location:booking.pickup_location,dropoff_location:booking.dropoff_location,service_type:'MNG'}]};
 else if(u.pathname==='/api/customer-app-notifications'&&method==='GET')body={ok:true,alerts:[],alert_count:0,notifications:[],provider_send:false};
 else if(u.pathname==='/api/company-profile'&&method==='GET')body={ok:false};
 else if(u.pathname==='/api/customer-device-push-subscriptions'&&method==='GET')body={ok:true,readiness:{enabled:false,public_key:null,ready:false}};
 else if(method!=='GET')throw Error('Unexpected mutation '+u.pathname);
 else if(u.pathname==='/api/admin-bookings')body={ok:true,booking};
 else if(u.pathname==='/api/admin-customer-saved-bookings')body={ok:true,saved_bookings:[booking],summary:{returned_count:1}};
 else if(u.pathname==='/api/admin-customer-accounts')body={ok:true,accounts:[{customer_id:'164',customer_name:'LOCAL ACCOUNT',guest_account_billing_enabled:false,verified_company_id:60}]};
 else if(u.pathname==='/api/admin-rate-setup')body={ok:true,companies:[{id:60,company_name:'LOCAL ACCOUNT'}],bookers:[{id:38,company_id:60,customer_id:164,name:'Example Booker'}],travelers:[],settings:{customer_rates:{MNG:{AVF:85},DSP:{AVF:65}}}};
 else throw Error('Unexpected request '+u.pathname);
 return {ok:true,json:async()=>body};};
const customer={id:'164',companyName:'LOCAL ACCOUNT',invoices:[],bookingHistory:[],contacts:[],invoiceExamples:[]};
function App(){const [feedback,setFeedback]=useState(''),[completedHistoryBillingReadyBookingId,setCompletedHistoryBillingReadyBookingId]=useState(null),[diagnostics,setDiagnostics]=useState('');const completingBookingId=null,deletingCompletedBookingId=null,bookingId='1',savedBooking=booking,operationalCard=undefined;
const bookingRecordStableKey=r=>String(r.id),bookingRecordPersistedReference=r=>r?.booking_reference||'',bookingRecordIsCompletedStatus=r=>r?.status==='completed',adminDispatchVerifiedIdentityId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null,clean=v=>String(v??'').trim(),adminBookingsApiPath='/api/admin-bookings',adminLegacyDataPurpose='admin-booking-persistence',setBookingCompletionMessage=(_,m)=>setFeedback(m.text);
${handler}
return <main className="mx-auto max-w-7xl space-y-4 p-4"><p>Synthetic Completed billing check · {scenario} · no real records or network access</p>{location.pathname==='/my-bookings'?<MyBookingsPage/>:location.pathname==='/'?<><h1>Completed job 99001</h1>${button}<button onClick={()=>openCompletedHistoryBilling(booking)}>Open this job in billing</button><p>{feedback}</p></>:<><CustomerInvoiceFolderPanel customer={customer}/><CustomerFolderSavedBookingsPanel customerId="164" customerName="LOCAL ACCOUNT"/></>}
<a href="/my-bookings?case=portal">Open PA portal</a><button onClick={()=>setDiagnostics(JSON.stringify({...diag,invoices,overflow:document.documentElement.scrollWidth>innerWidth},null,2))}>Inspect local result</button><pre className="whitespace-pre-wrap break-words" role="status">{diagnostics}</pre></main>;}
createRoot(document.getElementById('root')).render(<App/>);`;
await writeFile(path.join(temp,'entry.tsx'),entry);
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>{const c=webpack({mode:'development',devtool:false,entry:path.join(temp,'entry.tsx'),output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'next/link':path.join(temp,'link.tsx')}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(temp,'loader.cjs')}]}});c.run((err,stats)=>{c.close(()=>{});if(err||stats.hasErrors())reject(err||Error(stats.toString('errors-only')));else resolve();});});
const bundle=await readFile(path.join(temp,'bundle.js'));
const css=(await postcss([tailwind({base:root})]).process(await readFile('app/globals.css','utf8'),{from:'app/globals.css'})).css;
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Completed billing local check</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server=createServer((req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'");if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle);}else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}else if(req.url==='/'||req.url?.startsWith('/?')||req.url?.startsWith('/my-bookings')||req.url?.startsWith('/customers/')){res.setHeader('Content-Type','text/html');res.end(html);}else{res.writeHead(404);res.end();}});
server.listen(0,'127.0.0.1',()=>console.log('Completed billing fixture: http://127.0.0.1:'+server.address().port));
process.on('SIGINT',()=>server.close(async()=>{await rm(temp,{recursive:true,force:true});process.exit(0);}));
