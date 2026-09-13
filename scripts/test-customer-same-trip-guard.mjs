import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = process.cwd();
const sql = await readFile(`${root}/supabase/migrations/20260913080000_customer_same_trip_guard.sql`, 'utf8');
const modulePath = process.env.PRESTIGE_TEST_PGLITE || '@electric-sql/pglite';
let db;
const container = process.env.PRESTIGE_OFFLINE_TEST_CONTAINER;
if (container) {
 const { spawn } = await import('node:child_process');
 const database = `same_trip_test_${process.pid}`;
 const run = (args,input='') => new Promise((resolve,reject)=> {
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']}); let out='',err='';
  child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);
  child.on('close',code=> {if(code) {const e=new Error(err);e.code=err.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1];reject(e);}else resolve(out.trim());});child.stdin.end(input);
 });
 assert.equal(await run(['inspect','--format','{{.HostConfig.NetworkMode}}',container]),'none');
 const psql=(sql,name=database)=>run(['exec','-i',container,'psql','-h','/tmp','-U','postgres','-d',name,'-XAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],sql);
 await psql(`create database ${database}`,'postgres');
 let role='postgres';
 db={
  exec:async sql=> {const m=sql.match(/^set role (\w+)$/i);if(m){role=m[1];return;}if(sql==='reset role'){role='postgres';return;}return psql(`set role ${role}; ${sql}`);},
  query:async (sql,values=[])=> {
   const bound=sql.replace(/\$(\d+)/g,(_,n)=>values[n-1]===null?'NULL':"'"+String(values[n-1]).replaceAll("'","''")+"'");
   const statement=bound.replace(/;$/,'');
   const query=/^insert/i.test(statement)?`with changed as (${statement}) select coalesce(json_agg(changed),'[]') from changed`:`select coalesce(json_agg(q),'[]') from (${statement}) q`;
   const output=await psql(`set role ${role}; ${query}`);return {rows:JSON.parse(output.split('\n').at(-1))};
  },
  close:()=>psql(`drop database ${database}`,'postgres')
 };
} else {const { PGlite } = await import(modulePath);db=new PGlite();}
try {
 await db.exec(`do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
 create table public.bookings(id bigint generated always as identity primary key, booking_reference text unique,
 public_booking_reference text, customer_id bigint, company_id bigint, booker_id bigint, traveler_id bigint,
 passenger_name text, pickup_at timestamptz, pickup_location text, dropoff_location text, service_type text,
 vehicle_type_or_category text, flight_no text, pax_count integer, luggage_count integer,
 status text default 'new', request_review_status text, source_surface text, created_at timestamp without time zone default now());
 create table public.booking_route_points(booking_id bigint, point_type text, sequence integer, location text);
 grant all on public.bookings, public.booking_route_points to service_role;
 grant usage,select on all sequences in schema public to service_role;`);
 await db.exec(sql);
 const base = {customer_id:120,company_id:1,booker_id:5,traveler_id:901,passenger_name:'QA PERSON',pickup_at:'2026-10-01T12:00:00+08:00',pickup_location:'Synthetic A',dropoff_location:'Synthetic B',service_type:'TRF',vehicle_type_or_category:'AVF',flight_no:null,pax_count:1,luggage_count:0,stops:[]};
 const leg=(ref,patch={})=>({...base,booking_reference:ref,...patch});
 const check=async(group)=> (await db.query('select * from public.check_customer_same_trip($1::jsonb)',[JSON.stringify(group)])).rows[0];
 const insert=async(group,index=0)=> {
  const row={...group[index],source_surface:'customer_booking_request',public_booking_reference:String(11000+index),customer_request_trip_group:group}; delete row.stops;
  const keys=Object.keys(row); return db.query(`insert into public.bookings (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning id`,keys.map(k=> typeof row[k]==='object'&&row[k]!==null?JSON.stringify(row[k]):row[k]));
 };
 const first=[leg('CUST-QA-FIRST')];
 assert.equal((await check(first)).duplicate,false);
 await insert(first);
 const again=[leg('CUST-QA-SECOND')];
 assert.equal((await check(again)).duplicate,true);
 await assert.rejects(insert(again),e=>e.code==='PBD01');
 assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,1);
 assert.equal((await check([leg('CUST-QA-CASE',{pickup_at:'2026-10-01T04:00:00Z',pickup_location:'  SYNTHETIC   A '})])).duplicate,true);
 for (const patch of [{booker_id:6},{customer_id:121},{company_id:2},{traveler_id:902},{pickup_at:'2026-10-02T04:00:00Z'},{vehicle_type_or_category:'VVV'},{service_type:'DEP'},{stops:['Different Stop']},{pickup_location:'Different Pickup'},{dropoff_location:'Different Dropoff'},{pax_count:2}]) assert.equal((await check([leg('CUST-QA-OTHER',patch)])).duplicate,false,JSON.stringify(patch));
 await db.exec("update bookings set status='cancelled'"); assert.equal((await check(again)).duplicate,false);
 await db.exec("update bookings set status='new',request_review_status='Rejected'"); assert.equal((await check(again)).duplicate,false);
 await db.exec("update bookings set request_review_status='Approved'"); assert.equal((await check(again)).duplicate,true);
 await db.exec("truncate bookings,booking_route_points restart identity");
 const pair=[leg('CUST-QA-PAIR-OUT'),leg('CUST-QA-PAIR-RET',{pickup_at:'2026-10-02T04:00:00Z',pickup_location:'Synthetic B',dropoff_location:'Synthetic A'})];
 await insert(pair);
 const competing=[leg('CUST-QA-COMPETE-OUT',{pickup_at:'2026-10-03T04:00:00Z'}),{...pair[1],booking_reference:'CUST-QA-COMPETE-RET'}];
 assert.equal((await check(competing)).in_progress,true);
 await assert.rejects(insert(competing),e=>e.code==='PBD01');
 await insert(pair,1); assert.equal((await check(competing)).duplicate,true);
 await db.exec("truncate bookings,booking_route_points restart identity"); await insert(pair);
 await db.exec("update bookings set created_at=now()-interval '6 minutes'");
 assert.equal((await check(competing)).duplicate,false);
 await assert.rejects(insert(pair,1),e=>e.code==='PBD02');
 if(container) {
  await db.exec('truncate bookings,booking_route_points restart identity');
  const candidates=Array.from({length:8},(_,i)=>[leg('CUST-QA-RACE-'+i)]);
  assert.ok((await Promise.all(candidates.map(check))).every(r=>!r.duplicate));
  const results=await Promise.allSettled(candidates.map(group=>insert(group)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='PBD01'));
  assert.equal((await db.query('select count(*)::int n from bookings')).rows[0].n,1);
  console.log('Eight independent PostgreSQL connections: all prechecks clear, exactly one insert succeeds.');
  await db.exec('truncate bookings,booking_route_points restart identity'); await insert(pair);
 }
 // Admin inserts and amendments remain outside the new insertion fence.
 await db.exec("insert into bookings(booking_reference,customer_id) values ('ADMIN-UNCHANGED',120)");
 await db.exec("update bookings set pickup_location='Amended' where booking_reference='CUST-QA-PAIR-OUT'");
 assert.equal((await check(first)).duplicate,false);
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(check(first),e=>e.code==='42501'); await db.exec('reset role');
 }
 console.log('Same-trip SQL passed: exact matching, scope, timezone, cancellation/rejection, return-group fence, expiry, Admin preservation and permissions.');
} finally { await db.close(); }
