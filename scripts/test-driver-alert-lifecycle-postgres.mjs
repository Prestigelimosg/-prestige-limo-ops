// Synthetic, in-memory PostgreSQL only. Never connect to a deployed database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PRESTIGE_TEST_PGLITE || '@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table bookings(booking_reference text primary key,driver_id bigint,status text,admin_internal_status text,customer_facing_status text);
 create table driver_job_links(id uuid primary key,booking_reference text,driver_id bigint,link_status text,issued_at timestamptz,
 expires_at timestamptz,revoked_at timestamptz,safe_link_context jsonb,created_at timestamptz,updated_at timestamptz);
 create table customer_driver_app_notification_outbox(id uuid primary key default gen_random_uuid(), booking_reference text,driver_job_link_id uuid,
 event_key text unique,workflow_area text,notification_status text,notification_type text,delivery_surface text,priority text,safe_title text,
 safe_message text,safe_context jsonb,actor_role text,actor_label text,source_surface text,created_at timestamptz default now(),updated_at timestamptz);
 create table driver_access_accounts(id uuid default gen_random_uuid(),driver_reference text unique,account_status text,active_device_id_hash text);
 create table driver_device_push_subscriptions(driver_id bigint,endpoint text unique,p256dh text,auth text,last_driver_job_link_id uuid,
 revoked_at timestamptz,source_surface text,subscription_status text,updated_at timestamptz);`);
 await db.exec(`create table driver_job_bid_offers(id uuid primary key default gen_random_uuid(),offer_key text unique,offer_status text,updated_at timestamptz);
 create table driver_job_bids(driver_job_bid_offer_id uuid,driver_reference text,bid_status text,safe_bid_context jsonb default '{}');`);
 const baseline=await readFile('supabase/migrations/20260913032248_driver_link_after_duplicate_retirement.sql','utf8');
 await db.exec(baseline.slice(baseline.indexOf('create or replace function public.reserve_driver_job_link_delivery')));
 for(const file of ['20260918043000_driver_alert_lifecycle.sql','20260918043100_driver_native_push_installation.sql','20260918043200_driver_pool_alert_read.sql','20260920020706_driver_account_alert_registration.sql'])
   await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 const link='11111111-1111-4111-8111-111111111111';
 const other='22222222-2222-4222-8222-222222222222';
 const hash='a'.repeat(64);
 await db.query(`insert into bookings values ('ONE',7,'assigned','assigned','confirmed'),('TWO',7,'assigned','assigned','confirmed');
 `);
 for(const [id,reference] of [[link,'ONE'],[other,'TWO']]) await db.query(`insert into driver_job_links values
 ($1,$2,7,'active',now()-interval '1 hour',now()+interval '1 day',null,'{"job_card_revision":"rev1"}',now()-interval '1 hour',now())`,[id,reference]);
 const reserve=async(mode,id=link,reference='ONE',driver=7,role='admin')=>(await db.query(`select reserve_driver_job_link_delivery($1,$2,$3,$4,'rev1',gen_random_uuid(),$5,'Synthetic') r`,[reference,id,driver,mode,role])).rows[0].r;
 const before=(await db.query('select * from bookings order by booking_reference')).rows;
 assert.equal((await reserve('close_ack_alert')).reason,'alert_closed');
 assert.equal((await reserve('reminder')).reason,'alert_closed','closed exact alert cannot be re-sent by scheduler or manual reminder');
 assert.equal((await reserve('reminder',other,'TWO')).claimed,true,'another job for the same driver remains remindable');
 assert.deepEqual((await db.query('select * from bookings order by booking_reference')).rows,before,'Close never changes booking assignment or status');
 const closed=(await db.query('select * from driver_job_links where id=$1',[link])).rows[0];
 assert.equal(closed.link_status,'active');assert.equal(closed.revoked_at,null);
 assert.equal(closed.safe_link_context.driver_acknowledged_at,undefined);
 assert.equal((await reserve('close_ack_alert',link,'TWO')).claimed,false,'cross-booking close rejected');
 await assert.rejects(()=>reserve('close_ack_alert',link,'ONE',7,'system'),'scheduler cannot close alerts');
 assert.equal((await reserve('recovery')).claimed,true,'explicit Create Link reopens a fresh alert on the same link');
 assert.equal((await db.query('select safe_link_context from driver_job_links where id=$1',[link])).rows[0].safe_link_context.ack_alert_closed_at,undefined);
 assert.equal((await db.query('select count(*)::int n from driver_job_links')).rows[0].n,2,'recovery does not duplicate links');
 await db.exec("delete from customer_driver_app_notification_outbox where booking_reference='ONE'");
 assert.equal((await reserve('close_ack_alert')).claimed,true);
 await db.query(`update driver_job_links set safe_link_context=safe_link_context||'{"job_card_revision":"rev2"}' where id=$1`,[link]);
 assert.equal((await reserve('reminder')).claimed,true,'changed amendment revision is not hidden by an old Close');
 await db.query(`update driver_job_links set safe_link_context=safe_link_context||jsonb_build_object('driver_acknowledged_at',now()) where id=$1`,[link]);
 await db.query(`insert into driver_access_accounts(driver_reference,account_status,active_device_id_hash) values ('7','active',$1)`,[hash]);
 await db.query(`insert into driver_device_push_subscriptions(driver_id,endpoint,p256dh,auth,source_surface,subscription_status)
 values (7,'ExpoPushToken[old]','native_expo_push_token','native_expo_push_token','driver_native_ios','active'),
 (7,'https://example.test/web','web','web','driver_job_web','active'),
 (8,'ExpoPushToken[other]','native_expo_push_token','native_expo_push_token','driver_native_ios','active')`);
 const register=async(token,proof=hash)=>(await db.query('select register_driver_native_push_installation(7,$1,$2,$3) r',[link,proof,token])).rows[0].r;
 assert.equal((await register('ExpoPushToken[new]','b'.repeat(64))).registered,false,'wrong phone cannot retire existing subscriptions');
 assert.equal((await register('ExpoPushToken[other]')).registered,false,'cannot steal another driver token');
 assert.equal((await register('ExpoPushToken[new]')).registered,true);
 assert.equal((await register('ExpoPushToken[new]')).registered,true,'retry is idempotent');
 const subscriptions=(await db.query('select * from driver_device_push_subscriptions order by endpoint')).rows;
 assert.equal(subscriptions.filter(r=>r.driver_id===7 && r.source_surface==='driver_native_ios' && r.subscription_status==='active').length,1);
 assert.equal(subscriptions.find(r=>r.endpoint==='ExpoPushToken[new]').subscription_status,'active');
 assert.equal(subscriptions.find(r=>r.endpoint==='ExpoPushToken[old]').subscription_status,'revoked');
 assert.equal(subscriptions.find(r=>r.endpoint==='ExpoPushToken[other]').subscription_status,'active');
 assert.equal(subscriptions.find(r=>r.endpoint==='https://example.test/web').subscription_status,'active');
 assert.equal((await db.query('select active_device_id_hash from driver_access_accounts')).rows[0].active_device_id_hash,hash);
 // Recovery without a job still requires the same active account and installation.
 const snapshot=(await db.query('select * from driver_access_accounts')).rows;
 const bookingSnapshot=(await db.query('select * from bookings order by booking_reference')).rows;
 const linkSnapshot=(await db.query('select * from driver_job_links order by id')).rows;
 const accountRegister=async(token,proof=hash)=>(await db.query('select register_driver_native_push_installation(7,null,$1,$2) r',[proof,token])).rows[0].r;
 assert.equal((await accountRegister('ExpoPushToken[new]')).registered,true);
 assert.equal((await db.query("select last_driver_job_link_id from driver_device_push_subscriptions where endpoint='ExpoPushToken[new]'" )).rows[0].last_driver_job_link_id,link,'account recovery preserves historical link association');
 await db.query("update driver_job_links set expires_at=now()-interval '1 day'");
 assert.equal((await register('ExpoPushToken[legacy]')).registered,false,'legacy expired-link registration still fails');
 assert.equal((await accountRegister('ExpoPushToken[account]')).registered,true,'no usable job required');
 assert.equal((await accountRegister('ExpoPushToken[account]')).registered,true);
 assert.equal((await accountRegister('ExpoPushToken[other]')).registered,false,'foreign endpoint remains protected');
 assert.equal((await accountRegister('ExpoPushToken[wrong]','b'.repeat(64))).registered,false);
 await db.query("update driver_access_accounts set account_status='suspended'");
 assert.equal((await accountRegister('ExpoPushToken[suspended]')).registered,false);
 await db.query("update driver_access_accounts set account_status='active'");
 await db.exec("create function reject_qa_token() returns trigger language plpgsql as $$ begin if new.endpoint='ExpoPushToken[fail]' then raise exception 'synthetic storage failure'; end if; return new; end $$; create trigger reject_qa before insert on driver_device_push_subscriptions for each row execute function reject_qa_token();");
 await assert.rejects(()=>accountRegister('ExpoPushToken[fail]'));
 assert.equal((await db.query("select count(*)::int n from driver_device_push_subscriptions where driver_id=7 and source_surface='driver_native_ios' and subscription_status='active' and revoked_at is null")).rows[0].n,1);
 assert.equal((await db.query("select subscription_status from driver_device_push_subscriptions where endpoint='ExpoPushToken[account]'" )).rows[0].subscription_status,'active','failed replacement keeps working token');
 assert.deepEqual((await db.query('select * from driver_access_accounts')).rows,snapshot,'account/PIN/binding unchanged');
 assert.deepEqual((await db.query('select * from bookings order by booking_reference')).rows,bookingSnapshot);
 assert.deepEqual((await db.query('select id, safe_link_context from driver_job_links order by id')).rows,linkSnapshot.map(({id,safe_link_context})=>({id,safe_link_context})),'ACK/report context unchanged');
 assert.equal((await db.query("select has_function_privilege('anon','register_driver_native_push_installation(bigint,uuid,text,text)','execute') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','register_driver_native_push_installation(bigint,uuid,text,text)','execute') allowed")).rows[0].allowed,false);
 console.log('No-job recovery: correct phone, legacy expiry, foreign token, suspended account, rollback and unchanged account/booking evidence passed');
 const offer='b'.repeat(64), secondOffer='c'.repeat(64);
 const version='2030-01-01T00:00:00+00:00';
 await db.query("insert into driver_job_bid_offers(offer_key,offer_status,updated_at) values ($1,'open',$3),($2,'open',$3)",[offer,secondOffer,version]);
 await db.exec("insert into driver_job_bids(driver_job_bid_offer_id,driver_reference,bid_status) select id,'7','pending' from driver_job_bid_offers");
 const mark=async(reads,driver=7)=>(await db.query('select mark_driver_pool_alerts_read($1,$2::jsonb) r',[driver,JSON.stringify(reads)])).rows[0].r;
 assert.equal((await mark([{offer_key:offer,updated_at:version}],8)).ok,false,'foreign driver cannot mark another invitation');
 assert.equal((await mark([{offer_key:offer,updated_at:version},{offer_key:secondOffer,updated_at:'2031-01-01T00:00Z'}])).ok,false,'stale mixed batch fails before writes');
 assert.equal((await db.query("select count(*)::int n from driver_job_bids where safe_bid_context<>'{}'::jsonb")).rows[0].n,0);
 assert.equal((await mark([{offer_key:offer,updated_at:version}])).ok,true);
 assert.equal((await db.query("select count(*)::int n from driver_job_bids where safe_bid_context<>'{}'::jsonb")).rows[0].n,1,'only viewed offer marked read');
 assert.equal((await db.query("select count(*)::int n from driver_job_bids where bid_status='pending'")).rows[0].n,2,'reading does not accept or decline');
 await db.query("update driver_job_bid_offers set offer_status='assigned' where offer_key=$1",[secondOffer]);
 assert.equal((await mark([{offer_key:secondOffer,updated_at:version}])).ok,false,'read cannot consume a newer winner alert');
 console.log('Local PostgreSQL: exact Close, amendment isolation, active-phone proof, token ownership and retry tests passed');
} finally {await db.close();}
