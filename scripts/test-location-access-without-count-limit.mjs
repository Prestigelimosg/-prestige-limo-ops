import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real server modules with memory-only persistence and no provider client.
const nativeRequire = createRequire(import.meta.url);
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, Date, URL, Request,
    process: { env: {} }, console,
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@supabase/supabase-js') return { createClient() { throw Error('Live client prohibited'); } };
      if (name.startsWith('node:')) return nativeRequire(name);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name.endsWith('.ts') ? name : `${name}.ts`));
      throw Error(`Unmocked import ${name}`);
    },
  });
  return module.exports;
}
const migration = readFileSync('supabase/migrations/20260911023042_location_access_without_count_limit.sql', 'utf8');
const originalDelete = readFileSync('supabase/migrations/20260910000149_admin_saved_booking_atomic_delete.sql', 'utf8');
const oldBody = originalDelete.split('as $$')[1].split('$$;')[0];
const newBody = migration.split('create or replace function public.admin_delete_saved_booking_atomic(')[1].split('as $$')[1].split('$$;')[0];
const exactCleanup = `  update public.driver_live_location_runtime_settings
    set driver_live_location_allowed_job_references = array_remove(
      driver_live_location_allowed_job_references, p_booking_reference), updated_at = now()
    where setting_name = 'driver_live_location_runtime'
      and p_booking_reference = any(driver_live_location_allowed_job_references);
`;
assert.ok(newBody.includes(exactCleanup));
assert.equal(newBody.replace(exactCleanup, ''), oldBody, 'Every other atomic booking cleanup operation must remain unchanged');
assert.ok(migration.includes('drop constraint driver_live_location_runtime_references_limit'));
assert.ok(migration.includes('security invoker'));
assert.ok(migration.includes('from public, anon, authenticated'));

const control = load('lib/admin-live-location-runtime-control.ts');
const runtime = load('lib/driver-live-location-runtime.ts');
const env = { PRESTIGE_DRIVER_LIVE_LOCATION_MODE: 'runtime',
  PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED: 'true', PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED: 'true' };
const actor = { role: 'admin', actorLabel: 'Synthetic guard' };
const refs = n => Array.from({ length: n }, (_, i) => `QA-LOCATION-${String(i).padStart(5, '0')}`);
function fixture(count) {
  const references = refs(count);
  const setting = { setting_name: 'driver_live_location_runtime', setting_status: 'active',
    driver_live_location_mode: 'runtime', driver_live_location_capture_enabled: true,
    admin_active_jobs_map_enabled: true, driver_live_location_allowed_job_references: references,
    driver_live_location_stale_after_seconds: 300, driver_live_location_retention_minutes: 120 };
  const db = { setting, writes: [], fail: '', queries: [],
    tables: { bookings: references.map((ref, i) => ({ id: i + 1, booking_reference: ref,
      driver_id: i + 1, driver_name: `QA Driver ${i}`, admin_internal_status: 'assigned' })),
    driver_live_location_latest_positions: references.map((ref, i) => ({ id: String(i + 1).padStart(8, '0'),
      booking_reference: ref, driver_job_link_id: `link-${i}`, sharing_state: 'active',
      latitude: 1.3, longitude: 103.8, updated_at: new Date().toISOString(),
      stale_after: new Date(Date.now() + 300000).toISOString() })) },
    from(table) { return new Query(this, table); },
    async rpc(name, args) {
      assert.equal(name, 'admin_open_live_location_booking');
      this.writes.push(name);
      if (this.fail === 'rpc') return { data: null, error: { code: 'PGRST202' } };
      if (this.fail === 'empty_rpc') return { data: null, error: null };
      this.setting.driver_live_location_allowed_job_references = [...new Set([
        ...this.setting.driver_live_location_allowed_job_references, args.p_booking_reference])];
      return { data: structuredClone(this.setting), error: null };
    },
  };
  return db;
}
class Query {
  constructor(db, table) { Object.assign(this, { db, table, filters: [], maximum: Infinity }); }
  select() { return this; }
  eq(k,v) { this.filters.push(r => r[k] === v); return this; }
  in(k,v) { assert.ok(v.length <= 50, 'Transport batches must stay small, without limiting total jobs'); this.filters.push(r => v.includes(r[k])); return this; }
  gt(k,v) { this.filters.push(r => r[k] > v); return this; }
  order(k) { this.sort = k; return this; }
  limit(n) { this.maximum = n; return this; }
  upsert(payload) { this.payload = payload; return this; }
  insert(payload) { this.db.writes.push({ table: this.table, payload }); return Promise.resolve({ error: null }); }
  delete() { throw Error('No position may be cleaned before all map evidence has been read'); }
  maybeSingle() { return this.exec(true); }
  then(resolve, reject) { return this.exec(false).then(resolve, reject); }
  async exec(one) {
    this.db.queries.push(this.table);
    if (this.db.fail === this.table) return { data: null, error: { code: 'read_failed' } };
    if (this.db.fail === 'late_read' && this.db.queries.length > 6) return { data: null, error: { code: 'read_failed' } };
    if (this.table === 'driver_live_location_runtime_settings') {
      const data = structuredClone(this.db.setting);
      if (this.payload) Object.assign(this.db.setting, this.payload);
      return { data: this.payload ? structuredClone(this.db.setting) : data, error: null };
    }
    let rows = this.db.tables[this.table].filter(r => this.filters.every(f => f(r)));
    if (this.sort) rows.sort((a,b) => a[this.sort] < b[this.sort] ? -1 : a[this.sort] > b[this.sort] ? 1 : 0);
    rows = rows.slice(0, this.maximum);
    return { data: one ? rows[0] : structuredClone(rows), error: null };
  }
}
for (const count of [49, 50, 51, 201, 1001]) {
  const db = fixture(count);
  control.setAdminLiveLocationRuntimeControlClientForTests(db);
  const result = await control.openAdminLiveLocationRuntimeControl({ actor, bookingReference: 'QA-LOCATION-NEW' });
  assert.equal(result.ok, true);
  assert.equal(result.allowed_booking_references.length, count + 1, `opening after ${count} must preserve all prior jobs`);
  assert.ok(result.allowed_booking_references.includes(refs(1)[0]), 'Oldest job remains authorized');
  await control.openAdminLiveLocationRuntimeControl({ actor, bookingReference: 'QA-LOCATION-NEW' });
  assert.equal(db.setting.driver_live_location_allowed_job_references.length, count + 1, 'Duplicate open is idempotent');
  const policy = await runtime.readAdminControlledRuntimePolicy({ client: db, env, purpose: 'capture' });
  assert.equal(policy.policy.allowedJobReferences.length, count + 1, 'Driver policy must retain all references');
  runtime.setDriverLiveLocationRuntimeClientForTests(db);
  const map = await runtime.handleAdminActiveJobsMapRuntimeRequest({ actorRole: 'admin', env });
  assert.equal(map.status, 200);
  assert.equal(map.body.active_jobs.length, count, `Map must include all ${count} authorized positions`);
  assert.ok(!JSON.stringify(map.body).includes('customer_price'));
}
{
  const db = fixture(1); control.setAdminLiveLocationRuntimeControlClientForTests(db);
  await Promise.all(['QA-ADD-A', 'QA-ADD-B'].map(bookingReference => control.openAdminLiveLocationRuntimeControl({ actor, bookingReference })));
  assert.equal(db.setting.driver_live_location_allowed_job_references.length, 3, 'Concurrent additions cannot overwrite each other');
  const before = JSON.stringify(db.setting);
  db.fail = 'rpc';
  assert.equal((await control.openAdminLiveLocationRuntimeControl({ actor, bookingReference: 'QA-FAIL' })).ok, false);
  assert.equal(JSON.stringify(db.setting), before, 'Missing migration must fail without a fallback overwrite');
  db.fail = 'empty_rpc';
  assert.equal((await control.openAdminLiveLocationRuntimeControl({ actor, bookingReference: 'QA-EMPTY' })).ok, false);
  assert.equal(JSON.stringify(db.setting), before);
  for (const bookingReference of ['', '*', 'all', 'bad/ref']) {
    assert.equal((await control.openAdminLiveLocationRuntimeControl({ actor, bookingReference })).ok, false);
  }
  assert.equal((await control.openAdminLiveLocationRuntimeControl({ actor: { role: 'driver' }, bookingReference: 'QA-DENY' })).ok, false);
}
{
  const db = fixture(51);
  const first = db.tables.driver_live_location_latest_positions[0];
  for (let i = 0; i < 70; i++) db.tables.driver_live_location_latest_positions.push({
    ...first, id: `extra-${String(i).padStart(4, '0')}`, driver_job_link_id: `extra-link-${i}`,
  });
  runtime.setDriverLiveLocationRuntimeClientForTests(db);
  const map = await runtime.handleAdminActiveJobsMapRuntimeRequest({ actorRole: 'admin', env });
  assert.equal(map.status, 200);
  assert.equal(map.body.active_jobs.length, 121, 'Multiple links for a batch require complete cursor pagination');
  db.queries = []; db.writes = []; db.fail = 'late_read';
  const failedMap = await runtime.handleAdminActiveJobsMapRuntimeRequest({ actorRole: 'admin', env });
  assert.equal(failedMap.status, 503);
  assert.equal(db.writes.length, 0, 'A late page failure must not expose a partial map or clean positions');
}
{
  const db = fixture(100); runtime.setDriverLiveLocationRuntimeClientForTests(db);
  db.fail = 'driver_live_location_latest_positions';
  const map = await runtime.handleAdminActiveJobsMapRuntimeRequest({ actorRole: 'admin', env });
  assert.equal(map.status, 503, 'Incomplete map reads must fail visibly');
  assert.equal(db.writes.length, 0, 'Read failures cannot delete positions or write audits');
  db.fail = ''; db.setting.setting_status = 'closed';
  assert.equal((await runtime.readAdminControlledRuntimePolicy({ client: db, env, purpose: 'capture' })).ok, false);
}
console.log('Location access without count limit runtime guard passed.');
