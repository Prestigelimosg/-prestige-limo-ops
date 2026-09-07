"""Run only against a fresh disposable PostgreSQL container with no network or mounts.

The named container must provide psql and a postgres database on /tmp.
This harness seeds fictional tables, proves the race, then tests the repository migration.
"""
import json
import subprocess
import sys
from pathlib import Path
container=sys.argv[1]
assert container.startswith('prestige-invoice-guard-'), 'Only the isolated guard container is permitted'
details=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
assert details['HostConfig']['NetworkMode']=='none' and not details['Mounts'], 'A network-isolated container without mounts is required'
cmd=['docker','exec','-i',container,'/usr/lib/postgresql/bin/psql','-h','/tmp','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1']
def sql(text, ok=True):
 r=subprocess.run(cmd,input=text,text=True,capture_output=True)
 if ok: assert r.returncode==0,(r.stdout,r.stderr)
 return r

assert sql("select count(*) from pg_tables where schemaname='public';").stdout.strip()=='0', 'A fresh empty fixture database is required'
sql("""
create table bookings (booking_reference text primary key, public_booking_reference text, customer_id bigint);
create table customer_invoice_records (id uuid primary key default gen_random_uuid(), invoice_number text unique, customer_id text, booker_id bigint, traveler_id bigint, reference text, line_items jsonb default '[]', document_type text default 'invoice', document_state text default 'issued', status text default 'Unpaid', amount_cents integer default 1000);
insert into bookings values ('JOB-A','99001',41),('JOB-B','99002',41),('JOB-C','99003',41),('JOB-D','99004',42);
""")

def insert(number,ref='JOB-A',customer='41',lines='[]',extra=''):
 return f"insert into customer_invoice_records(invoice_number,customer_id,reference,line_items{',document_type' if extra else ''}) values('{number}','{customer}','{ref}','{lines}'::jsonb{','+repr(extra) if extra else ''});"
def race(first,second):
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write('begin;'+first+"select 'holding';select pg_sleep(1);commit;\n");p.stdin.close()
 while True:
  line=p.stdout.readline()
  assert line, p.stderr.read()
  if line.strip()=='holding':break
 r=sql(second,False); p.wait();assert p.returncode==0,p.stderr.read()
 return r
r=race(insert('BASE-0001'),insert('BASE-0002'))
assert r.returncode==0
assert sql('select count(*) from customer_invoice_records;').stdout.strip()=='2'
print('REPRODUCED: existing schema permits two concurrent invoices for one booking')
sql('truncate customer_invoice_records;')
sql(Path('supabase/migrations/20260907044810_customer_invoice_issued_booking_coverage.sql').read_text())
r=race(insert('FIX-0001'),insert('FIX-0002'))
assert r.returncode!=0 and 'Invoice already contains one or more selected jobs.' in r.stderr,r.stderr
assert sql('select count(*) from customer_invoice_records;').stdout.strip()=='1'
print('PASS: concurrent same-booking issue rejects the second invoice')
sql('truncate customer_invoice_records;')
r=race(insert('FIX-0003','JOB-A'),insert('FIX-0004','JOB-B'))
assert r.returncode==0,r.stderr
print('PASS: concurrent different bookings under the same account both succeed')
for number,ref,lines in [('FIX-0005','99001','[]'),('FIX-0006','MULTI','[{"bookingReference":"JOB-C"},{"bookingReference":"99001"}]')]:
 r=sql(insert(number,ref,lines=lines),False)
 assert r.returncode!=0 and 'Invoice already contains one or more selected jobs.' in r.stderr,r.stderr
print('PASS: public-reference aliases and overlapping multi-job invoices are rejected')
sql(insert('QUO-0001','JOB-A',extra='quotation'))
sql("insert into customer_invoice_records(invoice_number,customer_id,reference,document_state) values('DRAFT-0001','41','JOB-A','draft');")
r=sql("update customer_invoice_records set document_state='issued' where invoice_number='DRAFT-0001';",False)
assert r.returncode!=0
sql("update customer_invoice_records set amount_cents=2000,status='Paid' where invoice_number='FIX-0003';")
sql("update customer_invoice_records set line_items='[{\"bookingReference\":\"JOB-A\"}]'::jsonb where invoice_number='FIX-0003';")
sql(insert('OTHER-0001','JOB-D','42'))
print('PASS: quotation/draft, same-invoice amendment, payment status, and another customer remain supported')
r=sql('begin isolation level repeatable read;'+insert('STALE-0001','JOB-C')+'commit;',False)
assert r.returncode!=0 and 'fresh transaction snapshot' in r.stderr
print('PASS: a fixed stale snapshot fails closed')
sql("delete from bookings where booking_reference='JOB-A';")
sql("update customer_invoice_records set line_items='[{\"bookingReference\":\"JOB-A\",\"description\":\"AMENDED DESCRIPTION\"}]'::jsonb where invoice_number='FIX-0003';")
print('PASS: an unchanged issued-booking scope remains editable after the old booking is gone')
print('Local database tests complete. No network, host volume, Supabase migration or real data used.')
