"""Real constraints/rollback tests in an empty network-isolated disposable Postgres.

Usage: python3 scripts/test-admin-saved-booking-delete-postgres.py prestige-delete-guard-...
No production credentials, mounts, ports or provider calls.
"""
import json
import subprocess
import sys
from pathlib import Path

container = sys.argv[1]
assert container.startswith('prestige-delete-guard-')
info = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
assert info['HostConfig']['NetworkMode'] == 'none' and not info['Mounts']
assert not info['HostConfig']['PortBindings']
cmd = ['docker', 'exec', '-i', container, '/usr/lib/postgresql/bin/psql',
       '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']

def sql(query, success=True):
    result = subprocess.run(cmd, input=query, capture_output=True, text=True)
    assert (result.returncode == 0) == success, result.stderr
    return result.stdout.strip()

assert sql("select count(*) from pg_tables where schemaname='public'") == '0'
sql("""
create role anon; create role authenticated; create role service_role;
create table drivers(id bigint primary key, label text);
create table bookings(id bigint primary key, booking_reference text unique,
  admin_internal_status text, customer_facing_status text, status text);
create table driver_job_links(id uuid primary key, booking_reference text, driver_id bigint);
create table driver_access_accounts(id uuid primary key, driver_reference text,
  auth_user_id uuid, account_status text, active_device_id_hash text,
  source_driver_job_link_id uuid references driver_job_links(id) on delete restrict);
create table driver_account_enrollments(id uuid primary key, driver_id bigint,
  auth_user_id uuid, enrollment_status text, consumed_at timestamptz,
  driver_job_link_id uuid not null references driver_job_links(id) on delete restrict);
create table booking_service_items(id bigint, booking_id bigint references bookings(id));
create table booking_route_points(id bigint, booking_id bigint references bookings(id));
""")
children = ['driver_job_bids', 'driver_job_bid_offers', 'customer_driver_app_notification_outbox',
            'driver_live_location_latest_positions', 'driver_live_location_audit_events',
            'driver_ots_photo_proofs', 'driver_job_dsp_actual_time_events', 'driver_job_status_events']
for table in children:
    sql(f'create table {table}(id bigint, booking_reference text);')
sql('grant usage on schema public to service_role; grant select,insert,update,delete on all tables in schema public to service_role; revoke delete on driver_account_enrollments from service_role;')

def seed():
    sql('truncate bookings,drivers,driver_job_links,driver_access_accounts,driver_account_enrollments,booking_service_items,booking_route_points,' + ','.join(children) + ' cascade;')
    sql("""
    insert into drivers values (10,'Fictional driver'),(20,'Unrelated driver');
    insert into bookings values (1,'ADM-SYNTHETIC-1','completed','completed','completed'),(2,'ADM-SYNTHETIC-2','draft','received','draft');
    insert into driver_job_links values ('00000000-0000-4000-8000-000000000001','ADM-SYNTHETIC-1',10),('00000000-0000-4000-8000-000000000002','ADM-SYNTHETIC-2',10);
    insert into driver_access_accounts values ('10000000-0000-4000-8000-000000000001','10','20000000-0000-4000-8000-000000000001','active','synthetic-bound-device','00000000-0000-4000-8000-000000000001');
    insert into driver_account_enrollments values ('30000000-0000-4000-8000-000000000001',10,'20000000-0000-4000-8000-000000000001','consumed','2026-01-01Z','00000000-0000-4000-8000-000000000001');
    insert into booking_service_items values (1,1),(2,2);
    insert into booking_route_points values (1,1),(2,2);
    """)
    for table in children:
        sql(f"insert into {table} values (1,'ADM-SYNTHETIC-1'),(2,'ADM-SYNTHETIC-2');")

def snapshot():
    tables = ['bookings','drivers','driver_job_links','driver_access_accounts','driver_account_enrollments',
              'booking_service_items','booking_route_points'] + children
    return {t: sql(f"select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from {t} t") for t in tables}

seed()
# Reproduce the restrictive source-link failure without retaining fixture mutations.
sql("begin; delete from driver_job_status_events where booking_reference='ADM-SYNTHETIC-1'; delete from driver_job_links where booking_reference='ADM-SYNTHETIC-1'; commit;", False)
print('PASS: original first-login FK failure reproduced')
sql(Path('supabase/migrations/20260910000149_admin_saved_booking_atomic_delete.sql').read_text())

def call(expected='completed', any_status=False, role='admin'):
    return "set role service_role; select public.admin_delete_saved_booking_atomic('1','ADM-SYNTHETIC-1','admin_internal_status','%s',%s,'%s');" % (expected, str(any_status).lower(), role)

before = snapshot()
sql(call())
assert sql('select count(*) from bookings where id=1') == '0'
assert sql("select account_status||':'||active_device_id_hash||':'||(source_driver_job_link_id is null)::text from driver_access_accounts") == 'active:synthetic-bound-device:true'
assert sql("select (driver_job_link_id is null)::text from driver_account_enrollments") == 'true'
assert snapshot()['drivers'] == before['drivers']
for t in children:
    assert sql(f'select id from {t}') == '2'
assert sql('select id from booking_route_points') == '2'
assert sql('select id from booking_service_items') == '2'
assert sql('select booking_reference from driver_job_links') == 'ADM-SYNTHETIC-2'
assert json.loads(sql("select to_jsonb(a)-'source_driver_job_link_id' from driver_access_accounts a")) == {k:v for k,v in json.loads(before['driver_access_accounts'])[0].items() if k != 'source_driver_job_link_id'}
assert json.loads(sql("select to_jsonb(e)-'driver_job_link_id' from driver_account_enrollments e")) == {k:v for k,v in json.loads(before['driver_account_enrollments'])[0].items() if k != 'driver_job_link_id'}
print('PASS: first booking deletes; account, binding, enrollment history and other job preserved')

for setup, request in [
    ("update driver_account_enrollments set enrollment_status='reserved'", call()),
    ("update driver_account_enrollments set enrollment_status='failed'", call()),
    ("update driver_access_accounts set driver_reference='20'", call()),
    ('', call(expected='cancelled')),
    ("update bookings set admin_internal_status='draft' where id=1", call(expected='draft')),
    ('', call(role='driver')),
]:
    seed()
    if setup: sql(setup)
    before = snapshot()
    sql(request, False)
    assert snapshot() == before
print('PASS: unfinished setup, ambiguous account, stale status, scope and actor reject without writes')

seed()
sql("create function fail_late() returns trigger language plpgsql as $$ begin raise exception 'synthetic late failure'; end $$; create trigger fail_late before delete on bookings for each row execute function fail_late();")
before = snapshot()
sql(call(), False)
assert snapshot() == before
sql('drop trigger fail_late on bookings; drop function fail_late();')
print('PASS: late failure rolls back children and account provenance')

sql("update bookings set admin_internal_status='draft' where id=1")
sql(call(expected='draft', any_status=True))
assert sql('select count(*) from bookings where id=1') == '0'
seed()
for role in ['anon','authenticated']:
    sql(call().replace('set role service_role', 'set role '+role), False)
assert sql("select prosecdef from pg_proc where proname='admin_delete_saved_booking_atomic'") == 'f'
sql("update driver_account_enrollments set enrollment_status='reserved',driver_job_link_id=null", False)
print('PASS: existing any-status scope, private invoker privileges and new-setup source constraint')

# Missing/deleted target is inert and duplicate requests cannot delete another job.
sql(call())
after = snapshot()
sql(call())
assert snapshot() == after
print('PASS: duplicate deletion is inert')

# Competing requests serialize on the same booking; exactly one receives the deleted row.
from concurrent.futures import ThreadPoolExecutor
seed()
with ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(lambda _: sql(call()), range(2)))
assert sum('"id": 1' in result for result in results) == 1, results
assert sql('select count(*) from bookings where id=1') == '0'
assert sql('select count(*) from bookings where id=2') == '1'
print('PASS: concurrent deletes serialize with one successful target')
