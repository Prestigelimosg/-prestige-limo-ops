import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const env = { NODE_ENV: "test", SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-key", PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET: "synthetic-only-secret-".repeat(3) };
const scope = { bookingIds: [9001,9002], bookingReferences: ["QA-ONE","QA-TWO"], companyId: 901, bookerId: 902, customerId: 903, driverId: 904, travelerIds: [905], bookingTargets: [{ bookingId:9001, bookingReference:"QA-ONE", travelerId:905 }, { bookingId:9002, bookingReference:"QA-TWO", travelerId:905 }] };
const credentials = { admin:"A".repeat(43), driver:"D".repeat(43), customer:"C".repeat(43) };
env.PRESTIGE_STORE_REVIEW_ACCESS = JSON.stringify({ version:1, databaseOrigin:env.SUPABASE_URL, expiresAt:"2099-01-01T00:00:00Z", scope, credentials:Object.fromEntries(Object.entries(credentials).map(([role,code])=>[role,require("node:crypto").createHash("sha256").update(code).digest("hex")])) });
const safeInvoice = { id:"00000000-0000-4000-8000-000000000001", invoice_number:"QA-1000", customer_id:"903", booker_id:902, traveler_id:905, document_type:"invoice", document_state:"issued", customer_name:"QA Customer", status:"Unpaid", amount_cents:1000, amount_label:"SGD 10.00", billing_month_label:"October 2026", issue_date_iso:"2026-10-17T00:00:00Z", issue_date_label:"17 Oct 2026", due_date_label:"24 Oct 2026", reference:"QA-ONE", route:"QA pickup > QA dropoff", service:"Transfer", line_items:[{ bookingReference:"QA-ONE", description:"QA TEST TRIP", quantity:1, amountLabel:"SGD 10.00" }], pdf_base64:Buffer.from("%PDF-1.4\nSynthetic QA only\n%%EOF").toString("base64"), pdf_filename:"QA-1000.pdf", pdf_content_type:"application/pdf", email_delivery_status:"not_sent" };
let invoiceRows = [safeInvoice], bookerMatches=true, bookingMatches=true, failInvoice=false;
let calls=[];
let ordinaryAccountCalls=0;
const fakeFetch = async (input, init={}) => {
  const url=new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.origin,env.SUPABASE_URL);
  assert.equal(init.method || "GET","GET","No QA invoice writer/provider request permitted");
  calls.push(url);
  const table=url.pathname.split("/").at(-1);
  let data;
  if(table==="bookers") data=bookerMatches ? [{id:902,company_id:901,customer_id:903}] : [];
  else if(table==="bookings") data=bookingMatches ? scope.bookingTargets.map(target=>({id:target.bookingId,booking_reference:target.bookingReference,traveler_id:target.travelerId,company_id:901,booker_id:902,customer_id:903,driver_id:904})) : [];
  else if(table==="customer_invoice_records") {
    if(failInvoice) return Response.json({code:"42703",message:"fixture missing lifecycle column"},{status:400});
    data=invoiceRows;
    const requested=url.searchParams.get("invoice_number");
    if(requested) data=data.filter(row=>`eq.${row.invoice_number}`===requested);
  } else throw Error(`Unexpected table ${table}`);
  return Response.json(data);
};
const modules=new Map();
function load(relative) {
  if(modules.has(relative)) return modules.get(relative);
  const loaded={exports:{}};
  modules.set(relative,loaded.exports);
  const source=fs.readFileSync(new URL(`../${relative}`,import.meta.url),"utf8");
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{
    module:loaded,exports:loaded.exports,Buffer,URL,URLSearchParams,Request,Response,Headers,Uint8Array,ArrayBuffer,fetch:fakeFetch,process:{env},console,
    require:name=>{
      if(name==="server-only") return {};
      if(name.startsWith("node:")) return require(name);
      if(name==="@supabase/supabase-js") return {createClient:(url,key,options)=>createClient(url,key,{...options,global:{...options.global,fetch:options.global?.fetch || fakeFetch}})};
      if(name==="./store-review-access") return load("lib/store-review-access.ts");
      if(name.endsWith("/lib/customer-saved-bookings-read")) return load("lib/customer-saved-bookings-read.ts");
      if(name.endsWith("/lib/customer-invoice-record-persistence")) return load("lib/customer-invoice-record-persistence.ts");
      if(name==="./admin-booking-supabase-adapter") return {checkCustomerBookingRequestPersistenceConfigReadiness:()=>({ok:true})};
      if(name==="./admin-dispatcher-auth-boundary") return {resolveAdminAccountSession:()=>({ok:false})};
      if(name==="./customer-portal-access-account") return {assertActiveCustomerPortalAccessAccount:async()=>{ordinaryAccountCalls++;return {ok:true,data:{customer_account_reference:"777",booker_id:778}};}};
      if(name==="./customer-local-invoices") return {formatInvoiceDate:()=>"17 Oct 2026",formatInvoiceMonth:()=>"October 2026"};
      return new Proxy({}, {get:(_,key)=>{if(key==="__esModule") return false; return ()=>{throw Error(`Unexpected ordinary dependency ${name}:${String(key)}`);};}});
    },
  },{filename:relative});
  return loaded.exports;
}
const access=load("lib/store-review-access.ts");
const invoices=load("lib/customer-invoice-record-persistence.ts");
const cookie=access.issueStoreReviewSession("customer",credentials.customer,{env});
const review=access.resolveStoreReviewSession(cookie,{env});
assert.equal(review.state,"valid");
const context={auth_user_id:"store-reviewer",mode:"server-session-cookie",review,source_surface:"customer_api",runtime_gate:{account_allowlist:new Set(),mode:"small-allowlist"}};
const result=await invoices.loadCustomerInvoiceRecordsForPortal(context);
assert.equal(result.ok,true,"QA customer must be able to load its own issued invoice through the existing reader");
assert.equal(result.data.length,1);
assert.equal(result.data[0].invoiceNumber,"QA-1000");
const pdf=await invoices.loadCustomerInvoicePdfForPortal("QA-1000",context);
assert.equal(pdf.ok,true);
assert.equal(Buffer.from(pdf.data.bytes).toString(),Buffer.from(safeInvoice.pdf_base64,"base64").toString());
for(const call of calls) {
  if(call.pathname.endsWith("customer_invoice_records")) {
    assert.ok(call.searchParams.getAll("customer_id").includes("eq.903"));
    assert.ok(call.searchParams.getAll("booker_id").includes("eq.902"));
    assert.ok(call.searchParams.getAll("traveler_id").includes("in.(905)"));
    assert.ok(call.searchParams.getAll("reference").includes("in.(QA-ONE,QA-TWO)"));
    assert.ok(call.searchParams.getAll("document_state").includes("eq.issued"));
  }
}
for(const bad of [
  {customer_id:"999"},{booker_id:999},{traveler_id:999},{reference:"REAL-JOB"},{document_state:"draft"},
  {line_items:[...safeInvoice.line_items,{...safeInvoice.line_items[0],bookingReference:"REAL-JOB"}]},
  {line_items:[{...safeInvoice.line_items[0],bookingReference:undefined}]},
]) {
  invoiceRows=[{...safeInvoice,...bad}];
  assert.equal((await invoices.loadCustomerInvoiceRecordsForPortal(context)).ok,false,"Mixed/non-QA response must fail closed");
  assert.equal((await invoices.loadCustomerInvoicePdfForPortal("QA-1000",context)).ok,false,"Mixed/non-QA PDF must fail closed");
}
invoiceRows=[safeInvoice];
for(const which of ["booker","booking"]) {
  bookerMatches=which!=="booker"; bookingMatches=which!=="booking"; calls=[];
  assert.equal((await invoices.loadCustomerInvoiceRecordsForPortal(context)).ok,false);
  assert.ok(!calls.some(url=>url.pathname.endsWith("customer_invoice_records")),"Ownership drift must block invoice query");
}
bookerMatches=true; bookingMatches=true;
for(const role of ["admin","driver"]) {
  const other=access.resolveStoreReviewSession(access.issueStoreReviewSession(role,credentials[role],{env}),{env});
  calls=[];
  assert.equal((await invoices.loadCustomerInvoiceRecordsForPortal({...context,review:other})).ok,false);
  assert.equal(calls.length,0);
}
failInvoice=true; calls=[];
assert.equal((await invoices.loadCustomerInvoiceRecordsForPortal(context)).ok,false);
assert.equal(calls.filter(url=>url.pathname.endsWith("customer_invoice_records")).length,1,"No legacy fallback for reviewer");
failInvoice=false;
const request=path=>new Request(`http://localhost${path}`,{headers:{cookie,referer:"http://localhost/my-bookings","x-prestige-customer-purpose":"customer-saved-bookings-read"}});
for(const path of ["/api/customer-invoices","/api/customer-invoice-pdf/QA-1000"]) {
  assert.equal(access.storeReviewRequestAllowed(review,path,"GET",request(path)),true);
  assert.equal(access.storeReviewRequestAllowed(review,path,"POST",request(path)),false);
}
for(const path of ["/api/admin-customer-invoices","/api/customer-invoice-pdf/QA-1000/extra"]) assert.equal(access.storeReviewRequestAllowed(review,path,"GET",request(path)),false);
assert.equal(ordinaryAccountCalls,0,"Reviewer must never use ordinary account authorization");
// Exercise the existing UI adapters through the actual route and session boundary.
const listRoute=load("app/api/customer-invoices/route.ts");
const pdfRoute=load("app/api/customer-invoice-pdf/[invoiceNumber]/route.ts");
const ui=load("lib/customer-portal-invoices-adapter.ts");
const uiFetch=async(path,init)=>{
  const req=new Request(`http://localhost${path}`,{...init,headers:{...init.headers,cookie,referer:"http://localhost/my-bookings"}});
  return path==="/api/customer-invoices" ? listRoute.GET(req) : pdfRoute.GET(req,{params:Promise.resolve({invoiceNumber:decodeURIComponent(path.split("/").at(-1))})});
};
assert.equal((await ui.loadCustomerPortalInvoiceRecords({fetcher:uiFetch}))[0].invoiceNumber,"QA-1000");
assert.equal((await ui.fetchCustomerPortalInvoicePdf("QA-1000",{fetcher:uiFetch})).filename,"QA-1000.pdf");
for(const headers of [{cookie,referer:"http://foreign.invalid/my-bookings"},{cookie,referer:"http://localhost/my-bookings"}]) {
  const denied=await listRoute.GET(new Request("http://localhost/api/customer-invoices",{headers}));
  assert.equal(denied.status,403,"Wrong purpose/referer denied at route boundary");
}
assert.equal(await ui.fetchCustomerPortalInvoicePdf("REAL-9999",{fetcher:uiFetch}),null);
assert.equal((await listRoute.POST()).status,403);
assert.equal((await pdfRoute.PATCH()).status,403);
// Ordinary account dispatch and query shape remain unchanged.
calls=[];
const ordinary={...context,review:undefined,customer_account_reference:"777"};
assert.equal((await invoices.loadCustomerInvoiceRecordsForPortal(ordinary)).ok,true);
assert.equal(ordinaryAccountCalls,1);
assert.equal(calls.length,1);
assert.equal(calls[0].searchParams.get("customer_id"),"eq.777");
assert.equal(calls[0].searchParams.get("booker_id"),"eq.778");
assert.equal(calls[0].searchParams.has("reference"),false);
assert.equal(calls[0].searchParams.has("traveler_id"),false);
// New table permissions remain read-only, role-specific and conjunctively scoped.
calls=[];
const scoped=access.storeReviewReadFetch(review,env.SUPABASE_URL,fakeFetch);
await scoped(`${env.SUPABASE_URL}/rest/v1/customer_invoice_records?reference=eq.REAL-JOB&select=reference`);
assert.deepEqual(calls[0].searchParams.getAll("reference"),["eq.REAL-JOB","in.(QA-ONE,QA-TWO)"]);
for(const method of ["POST","PATCH","PUT","DELETE"]) {
  await assert.rejects(()=>scoped(`${env.SUPABASE_URL}/rest/v1/customer_invoice_records`,{method}));
}
await assert.rejects(()=>scoped("https://foreign.invalid/rest/v1/customer_invoice_records"));
for(const role of ["admin","driver"]) {
  const other=access.resolveStoreReviewSession(access.issueStoreReviewSession(role,credentials[role],{env}),{env});
  await assert.rejects(()=>access.storeReviewReadFetch(other,env.SUPABASE_URL,fakeFetch)(`${env.SUPABASE_URL}/rest/v1/customer_invoice_records`));
  for(const path of ["/api/customer-invoices","/api/customer-invoice-pdf/QA-1000"]) assert.equal(access.storeReviewRequestAllowed(other,path,"GET",request(path)),false);
}
assert.equal(calls.length,1,"Denied methods/roles/hosts never reach Data API");
console.log("PASS: QA invoice list/PDF through existing UI adapters/routes/session/SDK; ownership/mixed-row/role/method denial; no fallback; ordinary dispatch preserved. Synthetic only.");
