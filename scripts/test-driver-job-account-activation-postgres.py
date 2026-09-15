"""Synthetic transaction acceptance in a disposable no-network/no-mount PostgreSQL container."""
import concurrent.futures, json, subprocess, sys
from pathlib import Path
container=sys.argv[1]
assert container.startswith('prestige-activation-guard-')
docker='/Applications/Docker.app/Contents/Resources/bin/docker'
info=json.loads(subprocess.check_output([docker,'inspect',container],text=True))[0]
assert info['HostConfig']['NetworkMode']=='none' and not info['Mounts']
cmd=[docker,'exec','-i',container,'/usr/lib/postgresql/bin/psql','-h','/tmp','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1']
def sql(s,success=True):
    r=subprocess.run(cmd,input=s,text=True,capture_output=True)
    if success: assert r.returncode==0,r.stderr
    return r
def val(s): return json.loads(sql(s).stdout.strip())
def q(s): return "'"+str(s).replace("'","''")+"'"
assert sql("select count(*) from pg_tables where schemaname='public'").stdout.strip()=='0'
sql("""
create role anon;create role authenticated;create role service_role;
create table drivers(id bigint primary key,driver_name text,availability_status text);
create table bookings(booking_reference text primary key,driver_id bigint,status text,admin_internal_status text,customer_facing_status text);
create table driver_job_links(id uuid primary key default gen_random_uuid(),booking_reference text,driver_id bigint,token_hash text unique,link_status text,expires_at timestamptz,revoked_at timestamptz,safe_link_context jsonb default '{}');
create table driver_access_accounts(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique,driver_reference text unique,account_status text,auth_provider text,safe_display_label text,source_surface text,source_driver_job_link_id uuid unique,active_device_id_hash text unique,device_bound_at timestamptz);
create table driver_account_enrollments(id uuid primary key default gen_random_uuid(),driver_job_link_id uuid unique,driver_id bigint not null references drivers(id),email_normalized text,enrollment_status text,auth_user_id uuid unique,created_at timestamptz default now(),consumed_at timestamptz,updated_at timestamptz default now(),unique(driver_id));
alter table driver_account_enrollments enable row level security;
insert into drivers select i,'Synthetic Driver '||i,'available' from generate_series(1,20)i;
insert into bookings select 'QA-'||i,case when i=2 then null else i end,'confirmed',null,null from generate_series(1,20)i;
insert into driver_job_links(booking_reference,driver_id,token_hash,link_status,expires_at) select booking_reference,driver_id,lpad(substr(booking_reference,4),64,'a'),'active',now()+interval '24 hours' from bookings;
""")
sql(Path('supabase/migrations/20260914231217_driver_job_link_account_activation.sql').read_text())
def call(n,action,device=None,setup='b'*64,auth=None):
    token=str(n).rjust(64,'a');device=device or str(n).rjust(64,'c')
    return val(f"select driver_job_account_activation({q(action)},{q(token)},{q(device)},{q(setup)},'driver{n}@example.test',{q(auth) if auth else 'null'});")
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
assert call(1,'claim')['create_auth']
assert call(1,'claim')['reason']=='review_required' # no second Auth attempt
assert call(1,'record_auth',auth=uid(1))['scope']=='account'
assert call(1,'resume')['scope']=='account'
assert call(1,'claim')['scope']=='account' # response lost after Auth: retry does not create another identity
assert call(1,'resume',device='d'*64)['ok'] is False
assert call(1,'resume',setup='d'*64)['ok'] is False
assert sql("select count(*) from driver_access_accounts").stdout.strip()=='1'
assert sql("select safe_link_context::text from driver_job_links where booking_reference='QA-1'").stdout.strip()=='{}'

# Unassigned link activates only this job, without inventing a Driver or an account session.
assert call(2,'claim')['create_auth']
assert call(2,'record_auth',auth=uid(2))['scope']=='this_job'
assert call(2,'resume')['scope']=='this_job'
assert sql("select count(*) from driver_access_accounts").stdout.strip()=='1'
# Simulate the existing ACK writer, not a new activation writer.
sql("update bookings set driver_id=2 where booking_reference='QA-2';update driver_job_links set driver_id=2,safe_link_context='{}' where booking_reference='QA-2'")
assert call(2,'resume')['scope']=='account'
assert call(2,'resume')['scope']=='account'
assert sql("select count(*) from driver_access_accounts").stdout.strip()=='2'

# An invalid/revoked/terminal/reassigned link must not even reserve signup.
sql("update driver_job_links set revoked_at=now() where booking_reference='QA-3'")
assert call(3,'claim')['reason']=='invalid_link'
sql("update driver_job_links set expires_at=now()-interval '1 minute' where booking_reference='QA-4'")
assert call(4,'claim')['reason']=='invalid_link'
sql("update bookings set customer_facing_status='cancelled' where booking_reference='QA-5'")
assert call(5,'claim')['reason']=='invalid_link'
sql("update bookings set driver_id=20 where booking_reference='QA-6'")
assert call(6,'claim')['reason']=='assignment_changed'
assert call(7,'claim')['create_auth']
sql("update bookings set driver_id=20 where booking_reference='QA-7';update driver_job_links set driver_id=20 where booking_reference='QA-7'")
assert call(7,'record_auth',auth=uid(7))['reason']=='assignment_changed'
assert sql("select count(*) from driver_access_accounts").stdout.strip()=='2'

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results=list(pool.map(lambda _:call(8,'claim'),range(8)))
assert sum(r.get('create_auth',False) for r in results)==1
assert call(8,'record_auth',auth=uid(8))['scope']=='account'
sql("update driver_access_accounts set account_status='revoked' where driver_reference='8'")
assert call(8,'resume')['ok'] is False
assert call(9,'claim',device=str(1).rjust(64,'c'))['reason']=='account_exists'
# The same native setup may open Admin's replacement for an invalid first link.
replacement_device='e'*64
assert call(3,'claim',device=replacement_device)['reason']=='invalid_link'
assert call(10,'claim',device=replacement_device)['create_auth']
assert call(11,'claim',device=replacement_device)['reason']=='account_exists'
assert call(10,'record_auth',device=replacement_device,auth=uid(10))['scope']=='account'
# Different valid links racing on one phone still reserve Auth only once.
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda n:call(n,'claim',device='f'*64),[12,13]))
assert sum(r.get('create_auth',False) for r in results)==1
# A failed enrollment cannot resume into an account even if an Auth identity exists.
assert call(14,'claim')['create_auth']
sql("update driver_account_enrollments set enrollment_status='failed',auth_user_id='00000000-0000-4000-8000-000000000014' where driver_job_link_id=(select id from driver_job_links where booking_reference='QA-14')")
assert call(14,'resume')['reason']=='activation_unavailable'
assert call(14,'claim')['reason']=='activation_unavailable'
assert sql("select count(*) from driver_access_accounts where driver_reference='14'").stdout.strip()=='0'
for role in ['anon','authenticated']:
    assert sql(f"set role {role};select driver_job_account_activation('claim',repeat('a',64),repeat('b',64),repeat('c',64));",False).returncode!=0
assert sql("insert into driver_account_enrollments(driver_id) values(null)",False).returncode!=0
print('PASS PostgreSQL: assigned/unassigned activation, no implicit ACK or Driver, one-phone and one-claim races, exact identity completion, revoked/expired/terminal/reassigned rejection, existing-account and public-role protection.')
