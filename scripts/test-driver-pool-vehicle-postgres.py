"""Execute Driver Pool vehicle rules in a fresh, network-isolated disposable Postgres.

Usage: python3 scripts/test-driver-pool-vehicle-postgres.py prestige-pool-guard-...
No Production credentials, network, mounts or provider calls are used.
"""
import json
import subprocess
import sys
import uuid
from pathlib import Path

container = sys.argv[1]
assert container.startswith('prestige-pool-guard-')
info = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
assert info['HostConfig']['NetworkMode'] == 'none' and not info['Mounts']
cmd = ['docker', 'exec', '-i', container, '/usr/lib/postgresql/bin/psql',
       '-h', '/tmp', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']

def sql(statement, ok=True):
    result = subprocess.run(cmd, input=statement, text=True, capture_output=True)
    if ok:
        assert result.returncode == 0, result.stderr
    return result

def value(statement):
    return json.loads(sql(statement).stdout.strip())

def quote(text):
    return "'" + str(text).replace("'", "''") + "'"

assert sql("select count(*) from pg_tables where schemaname='public';").stdout.strip() == '0'
sql("""
create role anon; create role authenticated; create role service_role;
create schema extensions;
create table bookings (
 id bigserial primary key, booking_reference text unique, public_booking_reference text,
 customer_id bigint, updated_at timestamptz default clock_timestamp(), pickup_at timestamptz,
 dropoff_datetime timestamptz, driver_id bigint, driver_name text, driver_contact text,
 driver_plate_number text, driver_payout_override numeric, driver_payout_reason text,
 admin_internal_status text, customer_facing_status text, vehicle text,
 vehicle_type_or_category text, service_type text, booking_type text
);
create table drivers (id bigint primary key, driver_name text, contact_number text,
 plate_number text, vehicle_type text, availability_status text);
create table driver_access_accounts (driver_reference text, account_status text, active_device_id_hash text);
create table driver_device_push_subscriptions (driver_id bigint, subscription_status text);
create table driver_job_links (booking_reference text);
create table driver_job_status_events (booking_reference text);
create table audit_logs (entity_type text, entity_id bigint, action text, source_route text,
 actor_label text, change_summary text, booking_id bigint, customer_id bigint, actor_role text,
 action_type text, booking_reference text, source_surface text, reason text, safe_before jsonb, safe_after jsonb);
""")
for name in [
    '202606090002_driver_portal_bidding_foundation.sql',
    '20260904112430_driver_pool_fast_accept.sql',
    '20260904125321_driver_pool_completion_repair.sql',
    '20260904190552_driver_pool_exact_concurrency_tokens.sql',
    '20260905012642_driver_pool_admin_cancel_assigned_offer.sql',
]:
    sql(Path('supabase/migrations', name).read_text())

def reset(vehicle='AVF'):
    sql("""truncate driver_job_bids, driver_job_bid_offers, audit_logs,
      bookings, drivers, driver_access_accounts, driver_device_push_subscriptions restart identity cascade;
      insert into drivers values
      (1,'AVF driver','90000001','SQA1001A','AVF','available'),
      (2,'E driver','90000002','SQA1002A','E class','available'),
      (3,'VVV driver','90000003','SQA1003A','VVV','available'),
      (4,'Combi driver','90000004','SQA1004A','Combi','available'),
      (5,'S driver','90000005','SQA1005A','S','available'),
      (6,'Unknown driver','90000006','SQA1006A','Unknown','available'),
      (7,'Blank driver','90000007','SQA1007A',null,'available'),
      (8,'VClass driver','90000008','SQA1008A','VClass','available'),
      (9,'Unavailable driver','90000009','SQA1009A','AVF','unavailable');
      insert into driver_access_accounts select id::text,'active',repeat('a',64) from drivers;
      insert into driver_device_push_subscriptions select id,'active' from drivers;
    """)
    sql("insert into bookings(booking_reference,public_booking_reference,pickup_at,vehicle,vehicle_type_or_category,service_type) "
        f"values('POOL-QA','99001',now()+interval '2 days',{quote(vehicle)},{quote(vehicle)},'TRF');")

def publish(requirement=None, legacy=False):
    extra = '' if legacy else ',' + ('null' if requirement is None else quote(requirement))
    return value("select public.publish_driver_pool_offer('POOL-QA',"
                 "(select updated_at from bookings where booking_reference='POOL-QA'),100,"
                 f"{quote(uuid.uuid4())},'admin','Synthetic Admin'{extra});")

def accept_statement(offer, driver):
    return 'select public.accept_driver_pool_offer(' + ','.join([
        quote(offer['offer']['offer_key']), str(driver), quote(offer['offer']['updated_at']), quote(uuid.uuid4())
    ]) + ');'

def list_jobs(driver):
    return value(f'select public.list_driver_pool_available_jobs({driver},1,20);')['jobs']

reset('VVV')
old_offer = publish(legacy=True)
assert 1 in old_offer['recipient_driver_ids']
assert value(accept_statement(old_offer, 1))['ok']
print('REPRODUCED: old Production functions let an AVF Driver win a VVV job', flush=True)
reset()
sql(Path('supabase/migrations/20260909171426_driver_pool_vehicle_requirement.sql').read_text())

expected = {'AVF': [1], 'E / AVF': [1, 2], 'VVV': [3, 8], 'COMBI': [4], 'S': [5]}
for requirement, recipients in expected.items():
    reset()
    # Current-schema bookings need no legacy vehicle value for the explicit Pool requirement.
    sql("update bookings set vehicle=null where booking_reference='POOL-QA';")
    offer = publish(requirement)
    assert offer['recipient_driver_ids'] == recipients, (requirement, offer)
    assert offer['offer']['safe_vehicle_label'] == requirement
    for driver in range(1, 10):
        assert bool(list_jobs(driver)) == (driver in recipients), (requirement, driver)
    wrong = next(driver for driver in range(1, 6) if driver not in recipients)
    before = sql("select row_to_json(bookings) from bookings;").stdout
    assert value(accept_statement(offer, wrong))['ok'] is False
    assert sql("select row_to_json(bookings) from bookings;").stdout == before
    assert value(accept_statement(offer, recipients[0]))['reason'] == 'accepted'
    assert value(accept_statement(offer, recipients[0]))['reason'] == 'already_accepted'
print('PASS: AVF, explicit E / AVF, VVV, COMBI and S match only eligible profiles', flush=True)

# Even a stale or incorrectly retained recipient row must not authorize a wrong vehicle.
for requirement, recipients in expected.items():
    for driver in range(1, 9):
        if driver in recipients:
            continue
        reset()
        offer = publish(requirement)
        sql("insert into driver_job_bids(driver_job_bid_offer_id,booking_reference,driver_reference,bid_status,bid_source) "
            "select id,booking_reference," + quote(driver) + ",'pending','system' from driver_job_bid_offers;")
        before = sql("select row_to_json(bookings) from bookings;").stdout
        assert not list_jobs(driver)
        assert value(accept_statement(offer, driver))['reason'] == 'vehicle_mismatch'
        assert sql("select row_to_json(bookings) from bookings;").stdout == before
        assert sql("select count(*) from driver_job_bids where bid_status='accepted';").stdout.strip() == '0'
print('PASS: complete wrong-vehicle recipient matrix cannot assign or consume a job', flush=True)

for label in ['Alphard', 'Vellfire', 'Toyota Alphard', 'Toyota Vellfire']:
    assert value("select to_json(public.driver_pool_vehicle_matches('AVF'," + quote(label) + '));')
for label in ['', 'Unknown', 'Van', 'E / AVF', 'AVF or VVV']:
    assert not value("select to_json(public.driver_pool_vehicle_matches('AVF'," + quote(label) + '));')

for scenario, expected_reason in [('revoked', 'not_eligible'), ('unavailable', 'not_eligible'), ('overlap', 'schedule_conflict')]:
    reset()
    offer = publish('AVF')
    if scenario == 'revoked':
        sql("update driver_access_accounts set account_status='revoked' where driver_reference='1';")
    elif scenario == 'unavailable':
        sql("update drivers set availability_status='unavailable' where id=1;")
    else:
        sql("insert into bookings(booking_reference,driver_id,pickup_at) select 'OTHER-JOB',1,pickup_at from bookings;")
    assert value(accept_statement(offer, 1))['reason'] == expected_reason
    assert sql("select driver_id is null from bookings where booking_reference='POOL-QA';").stdout.strip() == 't'
print('PASS: active-account, availability and overlapping-schedule protections preserved', flush=True)


for changed in ['E class', 'VVV', 'Combi', '', 'Unknown']:
    reset()
    offer = publish('AVF')
    sql(f"update drivers set vehicle_type={quote(changed)} where id=1;")
    assert not list_jobs(1)
    before = sql("select row_to_json(bookings) from bookings;").stdout
    decision = value(accept_statement(offer, 1))
    assert decision['reason'] == 'vehicle_mismatch', decision
    assert sql("select row_to_json(bookings) from bookings;").stdout == before
    assert sql("select offer_status from driver_job_bid_offers;").stdout.strip() == 'open'
print('PASS: vehicle changes after publication are rechecked without consuming the offer', flush=True)

reset()
offer = publish('AVF')
sql("update driver_job_bid_offers set safe_offer_context='{}';")
assert not list_jobs(1)
assert value(accept_statement(offer, 1))['reason'] == 'vehicle_mismatch'
print('PASS: historical offers without explicit requirement evidence fail closed', flush=True)

for invalid in [None, '', 'Van', 'avf', 'E/AVF', 'Unknown']:
    reset()
    extra = 'null' if invalid is None else quote(invalid)
    result = sql("select public.publish_driver_pool_offer('POOL-QA',"
      "(select updated_at from bookings limit 1),100," + quote(uuid.uuid4()) +
      ",'admin','Synthetic Admin'," + extra + ');', False)
    assert result.returncode != 0
    assert sql('select count(*) from driver_job_bid_offers;').stdout.strip() == '0'
reset()
assert sql("select public.publish_driver_pool_offer('POOL-QA',(select updated_at from bookings limit 1),100,"
  + quote(uuid.uuid4()) + ",'admin','Synthetic Admin');", False).returncode != 0
print('PASS: missing or invalid requirements and old publish clients cannot broadcast', flush=True)

# Both transactions block behind the booking lock; one stale-vehicle recipient must lose.
reset()
offer = publish('E / AVF')
sql("update drivers set vehicle_type='Combi' where id=2;")
locker = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
locker.stdin.write("begin;select id from bookings where booking_reference='POOL-QA' for update;select 'locked';select pg_sleep(1);commit;\n")
locker.stdin.close()
while locker.stdout.readline().strip() != 'locked':
    assert locker.poll() is None
attempts = [subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
for process, driver in zip(attempts, [2, 1]):
    process.stdin.write(accept_statement(offer, driver)); process.stdin.close()
results = []
for process in attempts:
    output = process.stdout.read(); error = process.stderr.read(); process.wait()
    assert process.returncode == 0, error
    results.append(json.loads(output.strip()))
locker.wait(); assert locker.returncode == 0
assert results[0]['ok'] is False and results[1]['reason'] == 'accepted', results
assert sql('select driver_id from bookings;').stdout.strip() == '1'
assert sql("select count(*) from driver_job_bids where bid_status='accepted';").stdout.strip() == '1'
print('PASS: concurrent wrong and correct vehicles preserve the one matching winner', flush=True)

# Two eligible simultaneous acceptances still produce only one fixed-payout winner.
reset()
offer = publish('E / AVF')
processes = [subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
for process, driver in zip(processes, [1, 2]):
    process.stdin.write(accept_statement(offer, driver)); process.stdin.close()
results = []
for process in processes:
    output = process.stdout.read(); error = process.stderr.read(); process.wait()
    assert process.returncode == 0, error
    results.append(json.loads(output.strip()))
assert sum(result['reason'] == 'accepted' for result in results) == 1, results
assert sql("select count(*) from driver_job_bids where bid_status='accepted';").stdout.strip() == '1'
assert sql("select driver_payout_override from bookings;").stdout.strip() == '100.00'
assert sql("select count(*) from driver_job_links;").stdout.strip() == '0'
assert sql("select count(*) from driver_job_status_events;").stdout.strip() == '0'
print('PASS: eligible concurrent acceptances keep one fixed-payout winner and no Job Link or ACK', flush=True)

for role in ['anon', 'authenticated']:
    assert sql("select has_function_privilege(" + quote(role) +
      ",'public.driver_pool_vehicle_matches(text,text)','EXECUTE');").stdout.strip() == 'f'
assert sql("select bool_and(not prosecdef) from pg_proc where proname in ('publish_driver_pool_offer','accept_driver_pool_offer','list_driver_pool_available_jobs','driver_pool_vehicle_matches');").stdout.strip() == 't'
print('PASS: invoker and private function execution boundaries preserved', flush=True)
