"""Real SQL/locking tests. Pass a fresh network-isolated prestige-delete-guard-* container.
No network, host mounts, ports, Production credentials or provider calls.
"""
import runpy
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Reuse the existing deletion schema/fixtures and run every existing rollback/privacy test.
existing = runpy.run_path('scripts/test-admin-saved-booking-delete-postgres.py')
sql = existing['sql']
# Supabase's server-only service_role has BYPASSRLS; the older minimal fixture
# did not need it because its tables had no row policies enabled.
sql('alter role service_role bypassrls;')
sql('create schema if not exists extensions;')
sql(Path('supabase/migrations/202606240002_driver_live_location_runtime_settings_foundation.sql').read_text())
sql("""insert into driver_live_location_runtime_settings(
 setting_name,setting_status,driver_live_location_allowed_job_references)
 values('driver_live_location_runtime','active',array(select 'QA-'||i from generate_series(1,51)i));""", False)
print('REPRODUCED: original database rejects 51 authorized references')
sql(Path('supabase/migrations/20260911023042_location_access_without_count_limit.sql').read_text())
sql("""insert into bookings(id,booking_reference,admin_internal_status)
 select 10000+i,'QA-LOCATION-'||i,'draft' from generate_series(1,1001)i;""")
def open_ref(i):
    return "set role service_role; select public.admin_open_live_location_booking('QA-LOCATION-%s');" % i
def references():
    return sql('select driver_live_location_allowed_job_references::text from driver_live_location_runtime_settings')
for start, end in [(1,49),(50,50),(51,51),(52,201),(202,1001)]:
    sql("set role service_role; do $$ begin for i in %s..%s loop perform public.admin_open_live_location_booking('QA-LOCATION-'||i); end loop; end $$;" % (start,end))
    assert sql('select cardinality(driver_live_location_allowed_job_references) from driver_live_location_runtime_settings') == str(end)
    assert sql("select driver_live_location_allowed_job_references[1] from driver_live_location_runtime_settings") == 'QA-LOCATION-1'
before = references()
sql(open_ref(1))
assert references() == before
print('PASS: 49/50/51/201/1001, oldest booking and duplicate open preserved')

sql("update driver_live_location_runtime_settings set driver_live_location_allowed_job_references=array['QA-LOCATION-1'];")
with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(lambda i: sql(open_ref(i)), [2,3]))
assert sql("select cardinality(driver_live_location_allowed_job_references) from driver_live_location_runtime_settings") == '3'
print('PASS: actual concurrent SQL additions preserve both bookings')

for ref in ['missing', '*', 'all', 'ALL-JOBS', 'bad/ref', 'a'*121]:
    before = references()
    sql("set role service_role; select public.admin_open_live_location_booking('%s');" % ref, False)
    assert references() == before
for role in ['anon','authenticated']:
    sql(open_ref(1).replace('service_role',role), False)
assert sql("select prosecdef from pg_proc where proname='admin_open_live_location_booking'") == 'f'
print('PASS: invalid/missing targets and public roles cannot authorize tracking')

delete = "set role service_role; select public.admin_delete_saved_booking_atomic('10001','QA-LOCATION-1','admin_internal_status','draft',true,'admin');"
sql("create function fail_location_delete() returns trigger language plpgsql as $$ begin raise exception 'synthetic late failure'; end $$; create trigger fail_location_delete before delete on bookings for each row execute function fail_location_delete();")
before = references()
sql(delete, False)
assert references() == before
assert sql('select count(*) from bookings where id=10001') == '1'
sql('drop trigger fail_location_delete on bookings; drop function fail_location_delete();')
sql(delete)
assert sql("select 'QA-LOCATION-1'=any(driver_live_location_allowed_job_references) from driver_live_location_runtime_settings") == 'f'
assert sql("select cardinality(driver_live_location_allowed_job_references) from driver_live_location_runtime_settings") == '2'
sql(open_ref(1), False)
print('PASS: deletion removes only its reference; late failure restores booking and authorization')

# Simultaneous open and delete may linearize either way; neither may leave orphan access.
delete2 = delete.replace('10001','10002').replace('QA-LOCATION-1','QA-LOCATION-2')
def race_open():
    try:
        sql(open_ref(2))
    except AssertionError as error:
        assert 'Booking is unavailable' in str(error)
with ThreadPoolExecutor(max_workers=2) as pool:
    futures = [pool.submit(race_open), pool.submit(sql,delete2)]
    for future in futures: future.result()
assert sql("select 'QA-LOCATION-2'=any(driver_live_location_allowed_job_references) from driver_live_location_runtime_settings") == 'f'
assert sql('select count(*) from bookings where id=10002') == '0'
assert sql('select count(*) from bookings where id=10003') == '1'
print('PASS: concurrent open/delete cannot restore deleted-booking access')

# Same-row updates serialize with the existing explicit Close action.
sql("begin; set local role service_role; select public.admin_open_live_location_booking('QA-LOCATION-3'); update driver_live_location_runtime_settings set setting_status='closed',driver_live_location_mode='closed',driver_live_location_capture_enabled=false,admin_active_jobs_map_enabled=false,driver_live_location_allowed_job_references='{}'; commit;")
assert sql('select cardinality(driver_live_location_allowed_job_references) from driver_live_location_runtime_settings') == '0'
assert sql('select driver_live_location_capture_enabled from driver_live_location_runtime_settings') == 'f'
print('PASS: explicit Close retains closed capture and empty authorization list')
