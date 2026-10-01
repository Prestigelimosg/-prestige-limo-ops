import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
assert.ok(process.env.PRESTIGE_TEST_PGLITE,'Set PRESTIGE_TEST_PGLITE to a disposable PGlite runtime outside app dependencies.');
const {PGlite}=await import(process.env.PRESTIGE_TEST_PGLITE);
const db=new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const original=await readFile('supabase/migrations/202606280001_admin_device_push_subscriptions.sql','utf8');
  await db.exec(original.replace('create extension if not exists pgcrypto;',''));
  await db.exec("insert into admin_device_push_subscriptions(endpoint,p256dh,auth) values ('fixture','fixture','fixture');");
  await db.exec(await readFile('supabase/migrations/20261001015132_admin_notification_target_capability.sql','utf8'));
  assert.equal((await db.query('select supports_alert_target from admin_device_push_subscriptions')).rows[0].supports_alert_target,false);
  for(const role of ['anon','authenticated']) {
    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await db.query(`select has_table_privilege('${role}','admin_device_push_subscriptions','${privilege}') as allowed`)).rows[0].allowed,false);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='admin_device_push_subscriptions'::regclass")).rows[0].relrowsecurity,true);
  await db.exec("set role service_role; update admin_device_push_subscriptions set supports_alert_target=true where endpoint='fixture';");
  assert.equal((await db.query('select supports_alert_target from admin_device_push_subscriptions')).rows[0].supports_alert_target,true);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as count from admin_device_push_subscriptions')).rows[0].count,1);
  console.log('Admin target migration passed in disposable PostgreSQL: legacy false, exact existing row upgrade, unchanged RLS and denied public roles. Production Data API acceptance remains a release check.');
} finally { await db.close(); }
