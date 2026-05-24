# Customer Payment Approved Defaults Summary

This is an approved defaults summary only. No migration, schema change, Supabase command, payment API, bank API, notification sending, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This document records that the owner approved the recommended safe customer/payment production defaults from the owner decision answer sheet.

This approval is only for business rules and planning direction. It does not approve creating a Supabase migration, changing the database schema, applying RLS policies, allocating invoice numbers, writing audit events, connecting payment or bank APIs, sending notifications, generating invoices, generating statements, or turning on production payment behavior.

## 2. Owner/Admin Access

Owner/admin has full control over customer/payment production rules when production work is approved later.

Approved default:

- Owner/admin can view customer folders.
- Owner/admin can create and edit customers.
- Owner/admin can link or relink bookings to customers.
- Owner/admin can view payment history.
- Owner/admin can view audit history.
- Owner/admin can approve high-risk finance actions.
- Owner/admin can approve future invoice prefix changes.

## 3. Dispatcher Access

Dispatcher access is approved for normal daily operations only.

Dispatcher can:

- View customer folders.
- Link bookings to customers.
- Update normal collection follow-up.
- Record normal paid payment only with reference, note, and received date.
- Record normal partial payment only with amount, reference, note, and received date.

Dispatcher cannot:

- Waive balance.
- Refund payment.
- Cancel payment.
- Issue final invoice numbers.
- Change invoice prefix.
- Delete audit history.

These blocked actions remain owner/admin-only because they can affect money, customer account history, invoice sequence safety, or the permanent audit trail.

## 4. Accounting/Read-Only Access

Accounting/read-only user access is optional for later.

Approved default:

- Do not add this role unless Prestige Limo Ops needs finance review, bookkeeping support, or external account review.
- If added later, accounting/read-only can view payment history only if needed.
- Accounting/read-only should not update payments, invoice numbers, invoice prefixes, customer records, or audit history.

## 5. Invoice Number Rules

Approved invoice number defaults:

- Each customer has a fixed invoice prefix.
- Invoice numbers run separately per customer.
- Issued invoice numbers are never reused.
- Issued invoice numbers are never edited.
- Browser/client-side code never allocates invoice numbers.
- A future database or trusted server process must allocate invoice numbers safely.

These rules are approved as planning defaults only. No invoice sequence, RPC, server route, migration, or real invoice generation is created by this document.

## 6. Audit History Rules

Approved audit history defaults:

- Audit history is append-only.
- Audit events cannot be edited through normal app use.
- Audit events cannot be deleted through normal app use.
- Corrections should be recorded as new events later, not by changing old events.

These rules are approved as planning defaults only. No audit table, audit event write, migration, or production audit behavior is created by this document.

## 7. Items Kept Disabled For Now

The owner-approved default is to keep these disabled for now:

- Customer-facing payment links.
- Customer-facing invoice links.
- Real invoice generation.
- Real statement generation.
- Real statement sending.
- Payment provider API.
- Stripe, HitPay, PayPal, PayNow API, or similar provider integration.
- Bank API.
- Webhooks.
- WhatsApp sending.
- Email sending.
- SMS sending.
- Notification sending.
- Document or receipt storage.

These items need separate approval, separate planning, and separate safety checks before any implementation starts.

## 8. Approval Gates Still Required

This approved defaults summary does not approve implementation.

Still required before any production customer/payment implementation:

- Schema design approval.
- RLS/security design approval.
- Server route design approval.
- Invoice sequence/RPC design approval.
- Audit immutability design approval.
- Rollback plan approval.
- Explicit migration creation approval.
- Explicit migration application approval.

Migration creation and migration application must be approved separately.

Schema/RLS implementation is still not approved yet.

Supabase commands are still not approved yet.

Production payment behavior is still not approved yet.

## 9. Recommended Next Step

The next safest protected step is Supabase schema/RLS migration planning only, still docs-only.

That next planning task should turn these approved defaults into a clear migration plan and RLS policy plan. It should not create a migration file, run Supabase commands, change the database schema, add payment or bank APIs, send notifications, generate invoices, generate statements, or add production payment behavior until the owner explicitly approves those steps separately.
