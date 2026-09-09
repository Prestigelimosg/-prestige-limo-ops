import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

// Deliberately no connection URL: this test can only use the isolated, offline container.
const container = process.env.PRESTIGE_OFFLINE_TEST_CONTAINER || "prestige-pending-limit-test-20260909";
const database = `pending_admission_test_${process.pid}`;
function docker(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(input);
  });
}
async function sql(query, { db = database, failure = null } = {}) {
  const result = await docker(["exec", "-i", container, "psql", "-h", "/tmp", "-U", "postgres", "-d", db, "-XAt", "-v", "ON_ERROR_STOP=1"], query);
  if (failure) {
    assert.notEqual(result.code, 0, "Expected database rejection");
    assert.match(result.stderr, failure);
  } else {
    assert.equal(result.code, 0, result.stderr);
  }
  return result.stdout;
}
const id = (n) => n.toString(16).padStart(32, "0");
const phone = (n) => n.toString(16).padStart(64, "0");
const group = (n) => `CBOTP-${n.toString(16).padStart(24, "0").toUpperCase()}`;
const refs = (n, pair = false) => pair ? `array['${group(n)}-OUT','${group(n)}-RET']` : `array['${group(n)}']`;
const claim = (n, mobile = n, pair = false) => `select reason from public.reserve_customer_public_booking_request('${id(n)}','${phone(mobile)}','${group(n)}',${refs(n, pair)});`;
const send = (n, mobile) => `select reason from public.reserve_customer_booking_phone_otp_send('${id(n)}','${phone(mobile)}','${phone(n + 10000)}');`;
async function sendReasonWithAgedOtp(n, mobile, expected) {
  // Roll back simulated time and reservation writes; no provider or production access.
  const result = await sql(`begin;
    update public.customer_booking_phone_otp_challenges set created_at=now()-interval '1 hour' where phone_hash='${phone(mobile)}';
    ${send(n, mobile)}
    select count(*) from public.customer_booking_phone_otp_challenges where challenge_id='${id(n)}';
    rollback;`);
  assert.match(result, new RegExp(`\\n${expected}\\n${expected === "reserved" ? 1 : 0}\\nROLLBACK$`));
}
const insert = (n, suffix = "") => `insert into public.bookings(booking_reference) values ('${group(n)}${suffix}');`;
async function challenge(n, mobile = n) {
  await sql(`insert into public.customer_booking_phone_otp_challenges(challenge_id,phone_hash,ip_hash,status,verified_at) values ('${id(n)}','${phone(mobile)}','${phone(999)}','verified',now());`);
}

const runtime = await docker(["inspect", "--format", "{{.HostConfig.NetworkMode}}", container]);
assert.equal(runtime.code, 0, runtime.stderr);
assert.equal(runtime.stdout, "none", "Test container must have networking disabled");
await sql(`create database ${database};`, { db: "postgres" });
try {
  await sql(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
  end $$;
  create table public.bookings(id bigint generated always as identity primary key,
    booking_reference text unique, status text default 'new', request_review_status text,
    admin_internal_status text default 'Admin Review Required', customer_facing_status text default 'Request Received',
    contact_phone text, source_channel text default 'customer-booking-request');
  grant select,insert,update on public.bookings to service_role;
  grant usage on sequence public.bookings_id_seq to service_role;`);
  await sql(await readFile("supabase/migrations/20260725053824_customer_booking_phone_otp_challenges.sql", "utf8"));

  // Reproduce the current gap using the existing database schema and two verified challenges.
  await challenge(1, 1); await challenge(2, 1);
  await Promise.all([sql(insert(1)), sql(insert(2))]);
  assert.equal(await sql("select count(*) from public.bookings;"), "2");
  console.log("Baseline reproduced: two groups for one verified phone can be persisted.");
  await sql("truncate public.bookings, public.customer_booking_phone_otp_challenges;");
  const migrations = (await readdir("supabase/migrations")).filter((name) => name.endsWith("_customer_public_pending_request_admission.sql"));
  assert.equal(migrations.length, 1);
  await sql(await readFile(`supabase/migrations/${migrations[0]}`, "utf8"));
  await challenge(1);
  assert.equal(await sql(claim(1)), "unavailable", "New route must fail closed before activation");
  await sql("alter table public.bookings enable trigger customer_public_pending_admission;");

  await challenge(2, 1);
  const simultaneous = await Promise.all([sql(claim(1)), sql(claim(2, 1))]);
  assert.deepEqual(simultaneous.sort(), ["allowed", "public_request_in_progress"]);
  const winner = await sql("select booking_group_reference from public.customer_booking_phone_otp_challenges where booking_group_reference is not null;");
  const first = winner === group(1) ? 1 : 2;
  const second = first === 1 ? 2 : 1;
  await sql(insert(first));
  await sendReasonWithAgedOtp(900, 1, "reserved");
  console.log("Baseline reproduced: a saved pending booking still permits a second SMS reservation.");
  await sql(await readFile("supabase/migrations/20260909143500_customer_public_pending_before_sms.sql", "utf8"));
  await sendReasonWithAgedOtp(900, 1, "public_request_pending");
  assert.equal(await sql(claim(second, 1)), "public_request_pending");
  assert.equal(await sql(claim(first, 1)), "public_request_pending", "Retry must not run downstream sends");
  await sql(`update public.customer_booking_phone_otp_challenges set booking_admission_until=now()-interval '1 second' where booking_group_reference is not null;`);
  assert.equal(await sql(claim(second, 1)), "public_request_pending", "Saved pending group outlives reservation/OTP");
  await sql(`update public.bookings set contact_phone='edited display', admin_internal_status='Job Completed';`);
  assert.equal(await sql(claim(second, 1)), "public_request_pending", "Phone edit and Driver JC wording do not release");
  await sendReasonWithAgedOtp(901, 1, "public_request_pending");
  await sql("update public.bookings set request_review_status='approved';");
  await sendReasonWithAgedOtp(902, 1, "reserved");
  assert.equal(await sql(claim(second, 1)), "allowed");
  await sql(insert(second));
  await sql(`update public.bookings set request_review_status=null where booking_reference='${group(first)}';`, { failure: /public_request_pending/ });
  await sql(`update public.bookings set booking_reference='RENAMED' where booking_reference='${group(second)}';`, { failure: /public_admission_invalid/ });
  await sql(`update public.bookings set status='cancelled' where booking_reference='${group(second)}';`);
  await sendReasonWithAgedOtp(903, 1, "reserved");
  await challenge(3, 1);
  assert.equal(await sql(claim(3, 1, true)), "allowed");
  await sql(insert(3, "-OUT")); await sql(insert(3, "-RET"));
  await challenge(4, 1);
  await sql(`update public.bookings set request_review_status='approved' where booking_reference='${group(3)}-OUT';`);
  assert.equal(await sql(claim(4, 1)), "public_request_pending");
  await sendReasonWithAgedOtp(904, 1, "public_request_pending");
  await sql(`update public.bookings set status='cancelled' where booking_reference='${group(3)}-RET';`);
  assert.equal(await sql(claim(4, 1)), "allowed");
  await sendReasonWithAgedOtp(905, 1, "reserved");

  await challenge(10, 10); await challenge(11, 10);
  assert.equal(await sql(claim(10)), "allowed");
  await sql(`update public.customer_booking_phone_otp_challenges set booking_admission_until=now()-interval '1 second' where challenge_id='${id(10)}';`);
  assert.equal(await sql(claim(11, 10)), "allowed", "Empty interrupted reservation recovers");
  await sql(insert(10), { failure: /public_admission_invalid/ });
  assert.equal(await sql(claim(10)), "public_request_in_progress");
  await sql(insert(11));
  await sql(insert(12), { failure: /public_admission_invalid/ });

  await challenge(20); assert.equal(await sql(claim(20, 20, true)), "allowed");
  await sql(insert(20, "-OUT"));
  await sql(`update public.customer_booking_phone_otp_challenges set booking_admission_until=now()-interval '1 second' where challenge_id='${id(20)}';`);
  await challenge(21, 20);
  assert.equal(await sql(claim(21, 20)), "public_request_pending", "Partial group must remain visible and occupied");
  await sql(insert(20, "-RET"), { failure: /public_admission_invalid/ });
  await sql(`update public.bookings set status='cancelled' where booking_reference='${group(20)}-OUT';`);
  assert.equal(await sql(claim(21, 20)), "allowed");

  // Prove locking across actual overlapping transactions, not just sequential calls.
  await challenge(30); await challenge(31, 30);
  const racing = await Promise.all([
    sql(`begin; ${claim(30)} select pg_sleep(0.25); ${insert(30)} commit;`),
    sql(`begin; select pg_sleep(0.05); ${claim(31, 30)} commit;`),
  ]);
  assert.match(racing[0], /allowed/); assert.match(racing[1], /public_request_pending/);
  await challenge(40); await challenge(41);
  assert.deepEqual(await Promise.all([sql(claim(40)), sql(claim(41))]), ["allowed", "allowed"]);

  await challenge(70);
  assert.equal(await sql(`select reason from public.reserve_customer_public_booking_request('${id(70)}','${phone(71)}','${group(70)}',${refs(70)});`), "invalid");
  assert.equal(await sql(`select reason from public.reserve_customer_public_booking_request('${id(70)}','${phone(70)}','${group(70)}',array['${group(70)}-OUT']);`), "invalid");
  await sql(`update public.customer_booking_phone_otp_challenges set verified_at=now()-interval '11 minutes' where challenge_id='${id(70)}';`);
  assert.equal(await sql(claim(70)), "invalid");
  assert.equal(await sql(`select count(*) from public.customer_booking_phone_otp_challenges where challenge_id='${id(70)}' and booking_group_reference is not null;`), "0");
  await challenge(80); await challenge(81,80);
  assert.equal(await sql(claim(80)), "allowed"); await sql(insert(80));
  // An Admin decision and a fresh public request overlap in real transactions.
  const releaseRace = await Promise.all([
    sql(`begin; update public.bookings set request_review_status='approved' where booking_reference='${group(80)}'; select pg_sleep(0.25); commit;`),
    sql(`begin; select pg_sleep(0.05); ${claim(81,80)} commit;`),
  ]);
  assert.match(releaseRace[1], /allowed/);
  await sql(insert(81));
  const reopens = await Promise.all([
    sql(`begin; update public.bookings set status='cancelled' where booking_reference='${group(81)}'; select pg_sleep(0.25); commit;`),
    sql(`begin; select pg_sleep(0.05); update public.bookings set request_review_status=null where booking_reference='${group(80)}'; commit;`),
  ]);
  assert.equal(reopens.length, 2);
  assert.equal(await sql(`select count(*) from public.bookings where booking_reference in ('${group(80)}','${group(81)}') and public.customer_public_booking_pending(status,request_review_status);`), "1");

  await sql("insert into public.bookings(booking_reference) values ('CBINV-EXEMPT'),('PORTAL-EXEMPT');");
  await challenge(50);
  assert.equal(await sql(`set role service_role; ${claim(50)}`), "SET\nallowed");
  await sql(`set role anon; ${claim(50)}`, { failure: /permission denied/ });
  await sql(`set role authenticated; select * from public.customer_booking_phone_otp_challenges;`, { failure: /permission denied/ });
  assert.equal(await sql("select count(*) from pg_proc where proname in ('reserve_customer_public_booking_request','customer_public_booking_pending','enforce_customer_public_pending_admission') and (prosecdef or not ('search_path=\"\"'=any(proconfig)));"), "0");
  await sql("alter table public.bookings disable trigger customer_public_pending_admission;");
  await challenge(60); assert.equal(await sql(claim(60)), "unavailable");
  console.log("Public pending admission database tests passed: pre-SMS blocking without a challenge write, cancellation/approval/return release, concurrency, return groups, crash fencing, release, replay, privacy and fail-closed rollout.");
} finally {
  await sql(`drop database ${database} with (force);`, { db: "postgres" });
}
