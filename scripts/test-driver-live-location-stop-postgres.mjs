// Disposable PostgreSQL and synthetic records over a Unix socket. No app credentials.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const runtime = process.env.POOL_EMBEDDED_PG_PATH;
assert.ok(runtime, "Set POOL_EMBEDDED_PG_PATH to the isolated embedded-postgres package.");
const migrationName = fs.readdirSync("supabase/migrations").find((name) => name.endsWith("_driver_live_location_atomic_stop.sql"));
assert.ok(migrationName, "Atomic GPS stop migration is required.");
const migration = fs.readFileSync(path.join("supabase/migrations", migrationName), "utf8");
assert.match(migration, /create(?: or replace)? function public\.persist_driver_live_location/i, "Atomic persistence must exist before the race can pass.");
const { default: EmbeddedPostgres } = await import(path.join(runtime, "dist/index.js"));
const directory = fs.mkdtempSync("/private/tmp/prestige-gps-stop-pg-");
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, "data"), user: "postgres", password: randomUUID(),
  persistent: false, port: 5432, postgresFlags: ["-c", "listen_addresses=", "-k", directory],
  onLog: () => {}, onError: () => {},
});
const connections = [];
let db;
const linkA = "10000000-0000-4000-8000-000000000001";
const linkB = "10000000-0000-4000-8000-000000000002";
const signature = "public.persist_driver_live_location(text,uuid,text,jsonb,text,timestamptz)";
const connect = async () => {
  const client = postgres.getPgClient("postgres", directory);
  await client.connect();
  await client.query("set statement_timeout='8s'");
  connections.push(client);
  return client;
};
try {
  await postgres.initialise();
  await postgres.start();
  db = await connect();
  assert.equal((await db.query("show listen_addresses")).rows[0].listen_addresses, "");
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema extensions;
    create table public.bookings(id bigint primary key,booking_reference text unique,status text,driver_id bigint,customer_price numeric);
    create table public.driver_job_links(id uuid primary key,booking_reference text,link_status text,revoked_at timestamptz,
      expires_at timestamptz,safe_link_context jsonb,driver_id bigint);
    create table public.driver_job_status_events(id bigint primary key,booking_reference text,status_value text,occurred_at timestamptz);
    insert into bookings values(1,'GPS-QA-A','assigned',46,100),(2,'GPS-QA-B','assigned',47,200);
    insert into driver_job_links values
      ('${linkA}','GPS-QA-A','active',null,clock_timestamp()+interval '1 day','{}',46),
      ('${linkB}','GPS-QA-B','active',null,clock_timestamp()+interval '1 day','{}',47);
    insert into driver_job_status_events values(1,'GPS-QA-A','otw','2026-01-01T00:00:00Z');`);
  await db.query(fs.readFileSync("supabase/migrations/202606240001_driver_live_location_table_rls_retention_foundation.sql", "utf8"));
  // Reproduce existing deployment table privileges; the new migration must not broaden them.
  await db.query("grant usage on schema public to anon,authenticated,service_role; grant all on all tables in schema public to service_role;");
  const tableAcl = async () => (await db.query(`select relname,relacl::text,relrowsecurity from pg_class
    where relname in ('driver_live_location_latest_positions','driver_live_location_audit_events') order by relname`)).rows;
  const initialAcl = await tableAcl();
  await db.query(migration);
  assert.deepEqual(await tableAcl(), initialAcl, "Existing GPS table grants and RLS must not change.");
  const definition = (await db.query("select prosecdef,proconfig from pg_proc where oid=$1::regprocedure", [signature])).rows[0];
  assert.equal(definition.prosecdef, false, "RPC must run as SECURITY INVOKER.");
  assert.ok(definition.proconfig?.some((setting) => setting.startsWith("search_path=")), "RPC must pin its search path.");

  const clientA = await connect();
  const clientB = await connect();
  await clientA.query("set role service_role");
  await clientB.query("set role service_role");
  const now = async () => (await db.query("select clock_timestamp()::text instant")).rows[0].instant;
  const position = (capturedAt) => ({
    latitude: 1.3, longitude: 103.8, accuracy_meters: 10, heading_degrees: null, speed_meters_per_second: null,
    captured_at: capturedAt, stale_after: new Date(new Date(capturedAt).getTime() + 300000).toISOString(),
    driver_display_label: "Synthetic Driver", assigned_job_label: "Synthetic route", job_status: "assigned", vehicle_plate_label: "QA0000",
  });
  const persist = async (client, action, { link = linkA, reference = "GPS-QA-A", point = null, started } = {}) => {
    const requestStart = started ?? await now();
    const result = await client.query("select public.persist_driver_live_location($1,$2,$3,$4::jsonb,$5,$6) result",
      [action, link, reference, point === null ? null : JSON.stringify(point), "gps-atomic-stop-synthetic", requestStart]);
    return result.rows[0].result;
  };
  const share = async (client = clientA, overrides = {}) => persist(client, "share", { point: position(await now()), ...overrides });
  const stop = (client = clientA, overrides = {}) => persist(client, "stop", overrides);
  const positions = async () => (await db.query("select * from driver_live_location_latest_positions order by driver_job_link_id")).rows;
  const snapshot = async () => (await db.query(`select jsonb_build_object(
    'positions',(select coalesce(jsonb_agg(to_jsonb(p) order by driver_job_link_id),'[]') from driver_live_location_latest_positions p),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from driver_live_location_audit_events a)) state`)).rows[0].state;
  const protectedSnapshot = async () => (await db.query(`select jsonb_build_object(
    'bookings',(select jsonb_agg(to_jsonb(b) order by id) from bookings b),
    'links',(select jsonb_agg(to_jsonb(l) order by id) from driver_job_links l),
    'reports',(select jsonb_agg(to_jsonb(s) order by id) from driver_job_status_events s)) state`)).rows[0].state;
  const preserved = await protectedSnapshot();
  const reset = () => db.query("truncate driver_live_location_latest_positions,driver_live_location_audit_events");
  const lastStop = async () => (await db.query("select max(occurred_at)::text instant from driver_live_location_audit_events where driver_job_link_id=$1 and event_type='share_stopped'", [linkA])).rows[0].instant;
  const assertNoRows = async () => assert.equal((await positions()).length, 0);
  const waitForBlocked = async (client) => {
    for (let attempt = 0; attempt < 500; attempt++) {
      const row = (await db.query("select wait_event_type from pg_stat_activity where pid=$1", [client.processID])).rows[0];
      if (row?.wait_event_type === "Lock") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("Concurrent operation did not actually wait on a PostgreSQL lock.");
  };

  for (const role of ["anon", "authenticated"]) {
    assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed", [role, signature])).rows[0].allowed, false);
    await clientB.query(`set role ${role}`);
    await assert.rejects(stop(clientB), (error) => error.code === "42501", `${role} cannot invoke persistence`);
    await clientB.query("set role service_role");
  }
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'execute') allowed", [signature])).rows[0].allowed, true);
  assert.equal(await share(), "stored");
  assert.equal(await stop(), "stopped");
  await assertNoRows();
  const cutoff = await lastStop();
  const stoppedSnapshot = await snapshot();
  assert.equal(await share(clientA, { point: position(cutoff) }), "ignored", "Capture equal to cutoff cannot restore a point.");
  assert.equal(await share(clientA, { point: position("2026-01-01T00:00:00Z") }), "ignored", "Old capture submitted after stop stays stopped.");
  assert.equal(await share(clientA, { point: position(new Date(Date.now() + 60000).toISOString()), started: cutoff }), "ignored", "Ahead-clock capture in an already admitted request stays stopped.");
  await assertNoRows();
  assert.deepEqual(await snapshot(), stoppedSnapshot, "Ignored uploads must not add position_updated audit or mutate stopped state.");
  assert.equal(await share(), "stored", "A fresh capture from a new request restarts sharing.");
  assert.equal(await stop(), "stopped");
  assert.equal(await stop(), "stopped", "Repeated stop is safe.");
  await assertNoRows();
  console.log("PASS stale/equal captures and pre-stop requests ignored; fresh restart and repeated stop work.");

  await reset();
  for (const first of ["share", "stop"]) {
    const oldPoint = position(await now());
    const oldRequest = await now();
    await clientA.query("begin");
    let waiting;
    try {
      assert.equal(await (first === "share" ? share(clientA, { point: oldPoint, started: oldRequest }) : stop(clientA)), first === "share" ? "stored" : "stopped");
      waiting = (first === "share" ? stop(clientB) : share(clientB, { point: oldPoint, started: oldRequest })).then((result) => ({ result }), (error) => ({ error }));
      await waitForBlocked(clientB);
      await clientA.query("commit");
      const outcome = await waiting;
      if (outcome.error) throw outcome.error;
      assert.equal(outcome.result, first === "share" ? "stopped" : "ignored");
      await assertNoRows();
    } finally {
      await clientA.query("rollback");
      if (waiting) await waiting;
    }
    await reset();
  }
  console.log("PASS real two-connection share/stop races in both commit orders leave no position.");

  // A stopped transaction can begin before waiting for the existing booking lock.
  const blocker = await connect();
  await blocker.query("begin");
  await blocker.query("select id from bookings where booking_reference='GPS-QA-A' for update");
  let waitingStop;
  try {
    waitingStop = stop(clientA).then((result) => ({ result }), (error) => ({ error }));
    await waitForBlocked(clientA);
    const capturedWhileWaiting = await now();
    await blocker.query("commit");
    const result = await waitingStop;
    if (result.error) throw result.error;
    assert.equal(result.result, "stopped");
    assert.equal(await share(clientB, { point: position(capturedWhileWaiting) }), "ignored", "Stop cutoff must be assigned after lock acquisition, not transaction start.");
  } finally {
    await blocker.query("rollback");
    if (waitingStop) await waitingStop;
  }
  console.log("PASS stop cutoff reflects wall clock after a waited booking lock.");

  await reset();
  assert.equal(await share(), "stored");
  assert.equal(await share(clientB, { link: linkB, reference: "GPS-QA-B" }), "stored");
  const unrelated = (await positions()).find((row) => row.driver_job_link_id === linkB);
  await stop();
  assert.deepEqual(await positions(), [unrelated], "Stop affects only the exact link, never another job.");
  const stable = await snapshot();
  for (const mutation of [
    (p) => { delete p.captured_at; }, (p) => { p.captured_at = "invalid"; },
    (p) => { p.captured_at = null; }, (p) => { p.captured_at = "infinity"; },
    (p) => { p.latitude = 91; }, (p) => { p.customer_price = 123; },
    (p) => { p.stale_after = p.captured_at; },
  ]) {
    const point = position(await now()); mutation(point);
    await assert.rejects(share(clientA, { point }), (error) => ["22007", "22023", "23514"].includes(error.code), "Malformed position must fail closed.");
    assert.deepEqual(await snapshot(), stable, "Invalid input cannot alter positions or audit.");
  }
  await assert.rejects(stop(clientA, { reference: "GPS-QA-B" }), undefined, "Link/booking mismatch cannot stop another job.");
  assert.deepEqual(await snapshot(), stable);
  console.log("PASS exact-link isolation and invalid capture/position rejection preserve all state.");

  await reset();
  await share();
  await db.query(`create function reject_gps_audit_fixture() returns trigger language plpgsql as $$
    begin raise exception 'synthetic audit failure'; end; $$;
    create trigger reject_gps_audit_fixture before insert on driver_live_location_audit_events
    for each row execute function reject_gps_audit_fixture();`);
  const beforeFailure = await snapshot();
  await assert.rejects(stop(), /synthetic audit failure/);
  assert.deepEqual(await snapshot(), beforeFailure, "Audit failure rolls back Stop deletion.");
  await assert.rejects(share(), /synthetic audit failure/);
  assert.deepEqual(await snapshot(), beforeFailure, "Audit failure rolls back position upsert.");
  await db.query("drop trigger reject_gps_audit_fixture on driver_live_location_audit_events; drop function reject_gps_audit_fixture();");
  assert.deepEqual(await protectedSnapshot(), preserved, "GPS persistence must preserve booking, link, ACK context and Driver report evidence.");
  console.log("PASS audit failure is atomic; service-only execution, RLS, bookings, links and reports preserved.");
} finally {
  await Promise.allSettled(connections.map((client) => client.end()));
  await postgres.stop().catch(() => undefined);
  fs.rmSync(directory, { recursive: true, force: true });
}
