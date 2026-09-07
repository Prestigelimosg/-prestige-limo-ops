import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const migration = 'supabase/migrations/20260907044810_customer_invoice_issued_booking_coverage.sql';
const sql = await readFile(migration, 'utf8');
const writer = await readFile('lib/customer-invoice-record-persistence.ts', 'utf8');
for (const fragment of [
  'if new.traveler_id is not null or new.booker_id is null then',
  'old.traveler_id is null and old.booker_id is not null',
  'security invoker', "set local lock_timeout = '5s'", 'pg_advisory_xact_lock',
  "current_setting('transaction_isolation')", 'booking.customer_id::text = new.customer_id',
  'booking.public_booking_reference::text', "item->>'bookingReference' = any(booking_aliases)",
  'existing.id is distinct from new.id', "coalesce(existing.document_state, 'issued') = 'issued'",
  "coalesce(existing.document_type, 'invoice') = 'invoice'", "errcode = '23505'",
  'previous_references is not distinct from requested_references',
  'before insert or update of customer_id, booker_id, traveler_id, reference, line_items, document_type, document_state',
  'revoke all on function public.enforce_customer_invoice_issued_booking_coverage() from public',
]) assert.ok(sql.includes(fragment), `Missing database coverage contract: ${fragment}`);
assert.ok(!/security definer|create table|add column|delete from|update public\.|grant .* to (anon|authenticated)/i.test(sql), 'The guard must not broaden privileges or rewrite data/schema fields');
assert.ok(writer.includes('return safeFailure("Invoice already contains one or more selected jobs.", 409)'));
assert.ok(writer.includes('if (sanitized.data.bookerId || travelerInvoiceNumber)'));
const container = process.argv.find((argument) => argument.startsWith('--container='))?.slice(12);
if (container) {
  assert.match(container, /^prestige-invoice-guard-[a-z0-9-]+$/);
  execFileSync('python3', ['scripts/test-customer-invoice-booking-coverage-postgres.py', container], { stdio: 'inherit' });
} else {
  console.log('SQL contract passed. Real concurrency acceptance requires --container=prestige-invoice-guard-... using an isolated fixture; static checks alone do not prove concurrency.');
}
