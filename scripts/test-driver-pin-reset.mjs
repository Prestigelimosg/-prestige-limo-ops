import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PRESTIGE_TEST_PGLITE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table drivers(id bigint primary key);
create table driver_access_accounts(id uuid primary key,driver_reference text unique,auth_user_id uuid,account_status text,active_device_id_hash text,updated_at timestamptz);
insert into drivers values(7),(8);
insert into driver_access_accounts values('11111111-1111-4111-8111-111111111111','7','22222222-2222-4222-8222-222222222222','active',repeat('a',64),now()),('33333333-3333-4333-8333-333333333333','8','44444444-4444-4444-8444-444444444444','active',repeat('b',64),now());`);
await db.exec(await readFile('supabase/migrations/20260913043958_driver_admin_authorized_pin_reset.sql','utf8'));
const allow=async(role='admin')=>(await db.query(`select authorize_driver_pin_reset(7,$1,'Synthetic Admin') result`,[role])).rows[0].result;
const claim=async(device='a'.repeat(64))=>(await db.query(`select claim_driver_pin_reset($1) result`,[device])).rows[0].result;
await assert.rejects(allow('driver'));
assert.equal(await claim(),null);
const grant=await allow(); assert.equal(grant.ok,true);
assert.equal(await claim('b'.repeat(64)),null);
const first=await claim(); assert.ok(first.claim_id);
assert.equal(await claim(),null); // One use even with two concurrent requests serialized by row lock.
await assert.rejects(allow(),/progress/i);
await assert.rejects(db.query(`select finish_driver_pin_reset($1,$2,$3)`,[first.account_id,crypto.randomUUID(),'a'.repeat(64)]));
await db.query(`select finish_driver_pin_reset($1,$2,$3)`,[first.account_id,first.claim_id,'a'.repeat(64)]);
assert.equal(await claim(),null);
let account=(await db.query(`select * from driver_access_accounts where driver_reference='7'`)).rows[0];
assert.equal(account.account_status,'active');assert.equal(account.active_device_id_hash,'a'.repeat(64));assert.ok(account.pin_session_not_before);
await allow(); await db.exec(`update driver_access_accounts set pin_reset_expires_at=now()-interval '1 minute' where driver_reference='7'`);assert.equal(await claim(),null);
await db.exec(`update driver_access_accounts set account_status='revoked' where driver_reference='7'`);await assert.rejects(allow());assert.equal(await claim(),null);
for(const role of ['anon','authenticated']) { await db.exec(`set role ${role}`);await assert.rejects(allow());await assert.rejects(claim());await db.exec('reset role'); }
const other=(await db.query(`select * from driver_access_accounts where driver_reference='8'`)).rows[0];assert.equal(other.pin_session_not_before,null);assert.equal(other.pin_reset_state,null);
await db.close();console.log('Driver PIN reset SQL expiry, one-use, wrong-phone, role, retained account and unrelated-account tests passed.');
