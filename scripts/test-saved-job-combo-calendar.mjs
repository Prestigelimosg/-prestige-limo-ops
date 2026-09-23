// Run the real existing Calendar writer with a fake database and HTTP provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import * as links from '../lib/driver-job-link.ts';
import * as calendarEvent from '../lib/driver-job-calendar-event.ts';
const tokens=['synthetic-combo-calendar-A','synthetic-combo-calendar-B','synthetic-combo-calendar-C'];
const payloads=tokens.map((token,i)=>({acknowledged:true,reference:String(99101+i),pickupDate:`2026-10-0${i+1}`,pickupTime:'0800',pickupDateTime:`2026-10-0${i+1}T08:00:00+08:00`,
  bookingType:i===2?'DEP':'DSP',bookingTypeLabel:i===2?'Departure':'Hourly',pickupLocation:'Synthetic pickup',dropoffLocation:'Synthetic dropoff',route:'Synthetic route',waypoints:[],flightNumber:'',passengerName:'QA',status:'assigned',statusHistory:[],statusLabel:'Assigned',assignedDriver:{name:'QA',contact:'00000000',plate:'QA1',vehicleModel:'AVF'}}));
const rows=tokens.map((token,i)=>({id:crypto.randomUUID(),booking_reference:`QA-${i}`,driver_id:45,token_hash:links.hashDriverJobLinkToken(token),link_status:'active',expires_at:new Date(Date.now()+86400000).toISOString(),revoked_at:null,safe_link_context:{combo_id:crypto.randomUUID(),driver_acknowledged_at:new Date().toISOString()}}));
let connection=null,providerFailure=1,refreshFailure=false,requests=[];
const events=new Map();
const client={from(table){const filters=[];let update=null,upsert=null;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},maybeSingle(){return q},update(v){update=v;return q},upsert(v){upsert=v;return q},
 then(resolve,reject){try{if(upsert){connection=upsert;return Promise.resolve({data:upsert,error:null}).then(resolve,reject)}let data=table==='driver_google_calendar_connections'?(connection?[connection]:[]):table==='driver_job_links'?rows:rows.map(r=>({booking_reference:r.booking_reference,driver_id:r.driver_id}));const matched=data.filter(r=>filters.every(f=>f(r)));if(update)matched.forEach(r=>Object.assign(r,update));return Promise.resolve({data:matched[0]||null,error:null}).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}};return q;}};
const source=fs.readFileSync('lib/driver-google-calendar.ts','utf8')+'\nexport {buildAuthorization,readConfig};';
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
const required=name=>{
 if(name==='server-only')return {};
 if(name==='node:crypto')return crypto;
 if(name==='@supabase/supabase-js')return {createClient:()=>client};
 if(name==='./driver-job-link.ts')return links;
 if(name==='./driver-job-calendar-event.ts')return calendarEvent;
 if(name==='./driver-job-status-persistence.ts')return {loadDriverJobPayloadThroughStatusPersistence:async({token})=>({ok:true,payload:payloads[tokens.indexOf(token)]})};
 if(name==='./driver-job-combo.ts')return {loadDriverComboAccess:async()=>({tokens})};
 throw new Error('Unexpected module: '+name);
};
new Function('require','module','exports',code)(required,mod,mod.exports);
const calendar=mod.exports;
Object.assign(process.env,{PRESTIGE_DRIVER_GOOGLE_CALENDAR_SYNC_ENABLED:'true',PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_ID:'synthetic-client',
 PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_SECRET:'synthetic-secret',PRESTIGE_DRIVER_GOOGLE_OAUTH_REDIRECT_URI:'https://qa.invalid/api/driver-google-calendar-oauth/callback',
 PRESTIGE_DRIVER_GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64url'),
 PRESTIGE_DRIVER_GOOGLE_CALENDAR_API_BASE_URL:'https://calendar.invalid',PRESTIGE_DRIVER_GOOGLE_OAUTH_TOKEN_URI:'https://token.invalid',
 SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'});
const fetcher=async(url,options)=>{
 requests.push({url,method:options.method,body:options.body});
 if(url==='https://token.invalid')return Response.json(refreshFailure?{error:'temporarily_unavailable'}:{access_token:'synthetic-access-token-000000000000',refresh_token:'synthetic-refresh-token-00000000000'},{status:refreshFailure?503:200});
 assert.ok(url.startsWith('https://calendar.invalid/'));assert.ok(url.endsWith('sendUpdates=none'));
 const event=JSON.parse(options.body);assert.equal(event.attendees,undefined);assert.equal(event.reminders.overrides[0].minutes,60);
 if(event.source.url.endsWith(tokens[providerFailure]))return new Response('',{status:503});
 if(options.method==='PUT'&&!events.has(event.id))return new Response('',{status:404});
 events.set(event.id,event);return Response.json(event);
};
const start=await calendar.saveOrAuthorizeDriverGoogleCalendar(tokens[0],fetcher);
assert.equal(start.action,'authorize');assert.equal(requests.length,0);
const config=calendar.readConfig();const authorization=calendar.buildAuthorization(config,tokens[0]);
const state=new URL(authorization.authorizationUrl).searchParams.get('state');
const first=await calendar.completeDriverGoogleCalendarOauth({code:'synthetic-code',state,cookieValue:authorization.cookieValue},fetcher);
assert.equal(first.ok,false,'One failed provider event must not report the whole combo saved');
assert.equal(events.size,2);assert.ok(connection?.encrypted_refresh_token);assert.doesNotMatch(connection.encrypted_refresh_token,/synthetic-refresh/);
assert.equal((await calendar.readDriverGoogleCalendarStatus(tokens[0])).status,'update_calendar');
providerFailure=-1;requests=[];
const retry=await calendar.saveOrAuthorizeDriverGoogleCalendar(tokens[0],fetcher);
assert.equal(retry.ok,true);assert.equal(retry.saved_count,3);assert.equal(retry.total_count,3);assert.equal(events.size,3);
assert.equal(requests.filter(r=>r.url==='https://token.invalid').length,1,'One reused connection per combo');
assert.equal(requests.filter(r=>r.method==='POST'&&r.url.startsWith('https://calendar.invalid')).length,1,'Only the missing event is newly created');
assert.equal((await calendar.readDriverGoogleCalendarStatus(tokens[0])).status,'cal_saved');
assert.equal(new Set(rows.map(r=>r.google_calendar_event_id)).size,3,'Each exact booking has its own stable event');
refreshFailure=true;const retained=connection.encrypted_refresh_token;
assert.equal((await calendar.saveOrAuthorizeDriverGoogleCalendar(tokens[0],fetcher)).reason,'provider_failed');assert.equal(connection.encrypted_refresh_token,retained);
console.log('PASS combo Calendar: one consent/connection, separate deterministic events and reminders, partial failure visible, retry without duplicates, transient failure retains credentials.');
