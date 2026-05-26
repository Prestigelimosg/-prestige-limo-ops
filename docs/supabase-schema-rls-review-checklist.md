# Supabase Schema And RLS Review Checklist

## 1. Purpose

This is a future review checklist only. It is not an implementation, migration, schema change, policy change, API connection, auth setup, or production database rollout.

Use this checklist before any live production feature touches Supabase tables, relationships, Row Level Security policies, storage buckets, public pages, customer portal data, driver job data, payment records, notifications, files, or audit logs.

The goal is simple: review the data model and access rules before the business depends on them. Supabase should not become live just because the app can connect to it. The schema, access boundaries, backups, rollback plan, and tests must all be reviewed first.

## 2. Current Hard Boundary

- No Supabase command now.
- No Supabase migration now.
- No schema change now.
- No RLS policy change now.
- No production database change now.
- No real customer auth now.
- No real driver auth or job-token database write now.
- No real payment behavior now.
- No invoice, statement, or PDF behavior now.
- No notification sending now.
- No live-location behavior now.
- No flight API behavior now.
- No maps, geocoding, or routing behavior now.
- No calendar sync now.
- No file or photo upload now.
- No parser changes now.

This stage is documentation only. It does not approve real reads, writes, storage, authentication, public access, or service-role usage.

## 3. Supabase Areas To Review Later

Review each area before any production rollout:

- Bookings.
- Customers / CRM.
- Drivers.
- Assigned drivers.
- Completed jobs.
- Regular customer bookings.
- Customer portal booking views.
- Driver job link data.
- Driver status history.
- Driver live location.
- Customer live location eligibility.
- Pricing / rates / overrides.
- Invoices / monthly billing drafts.
- Payment records.
- Audit logs.
- Notification logs.
- File/photo uploads, especially future OTS photo proof.

For each area, confirm whether it is real production data, staging data, local mock data, or demo-only data.

## 4. Table Ownership And Relationship Checklist

Before any schema change, review these ownership and relationship rules:

- [ ] Each booking belongs to the correct customer, company, booker, or CRM account.
- [ ] The customer-to-booking relationship is explicit and does not depend only on free-text names.
- [ ] Each booking can have an assigned driver relationship when assignment is approved.
- [ ] Driver assignment history is separate from the current assigned driver if replacements are later supported.
- [ ] A completed job can be traced back to the original booking.
- [ ] Completion does not destroy the original booking context needed for history, billing, or audit.
- [ ] A booking can later link to invoice or monthly statement records only after billing is approved.
- [ ] Invoice/monthly statement relationships do not create real invoice numbers until approval.
- [ ] A booking can later link to audit events.
- [ ] A booking can later link to driver status history.
- [ ] A booking can later link to a future live-location session.
- [ ] A booking can later link to payment records.
- [ ] A booking can later link to notification logs.
- [ ] Orphan records are prevented or detected.
- [ ] Deleting or cancelling a parent record does not silently leave unsafe child records.
- [ ] Cancelled bookings keep enough history for business review.
- [ ] Amended bookings preserve old value and new value where practical.
- [ ] Reassigned bookings preserve the previous driver/car and replacement driver/car history.
- [ ] Test/demo records are clearly separated from real bookings.
- [ ] Demo records cannot be mistaken for production dispatch, payment, invoice, or customer records.
- [ ] Real records cannot be overwritten by mock/local placeholders.

## 5. RLS Review Checklist

Before live access is enabled, review Row Level Security for every table and storage bucket:

- [ ] Internal admin/staff access is explicitly defined.
- [ ] Staff access requires real auth and appropriate role checks later.
- [ ] Dispatcher access is separated from owner/admin access if needed.
- [ ] Customer portal access is limited only to that customer's own bookings.
- [ ] Customer portal users cannot read other customers, other bookings, driver database rows, rates, internal notes, or admin-only fields.
- [ ] Driver job link access is limited only to that one job.
- [ ] Driver job link users cannot browse the driver database or customer database.
- [ ] Public booking request access, if approved later, is limited to a safe insert or request-only workflow.
- [ ] No public role can read all bookings.
- [ ] No public role can update all bookings.
- [ ] No public role can delete bookings.
- [ ] No customer role can access driver database tables.
- [ ] No driver role can access customer database tables.
- [ ] No frontend access requires the `service_role` key.
- [ ] Read policies are separate from insert policies.
- [ ] Insert policies are separate from update policies.
- [ ] Update policies are separate from delete policies.
- [ ] Delete policies are highly restricted or avoided.
- [ ] Storage bucket policies are reviewed for future OTS photo uploads.
- [ ] Audit log writes are protected from customer, driver, and public tampering.
- [ ] Audit logs cannot be edited or deleted by normal users.
- [ ] Admin-only overrides and edits require explicit role checks.
- [ ] Completed job read/edit boundaries are clear.
- [ ] Completed jobs cannot be silently modified by customer or driver roles.
- [ ] Payment record access is staff-only unless a later customer-facing receipt view is approved.
- [ ] Payment records cannot be created from public/customer/driver pages without explicit approval.
- [ ] Rate and pricing override tables are staff-only.
- [ ] RLS tests cover allowed and blocked examples for every role.

## 6. Public Page Safety Checklist

Public and semi-public pages need strict boundaries:

- [ ] `/book` must not have unrestricted Supabase write access unless explicitly approved later.
- [ ] `/book` must not expose internal staff, CRM, driver, rate, payment, invoice, or admin data.
- [ ] `/my-bookings` must only show the logged-in customer's own bookings later.
- [ ] `/my-bookings` must not expose all bookings, all customers, driver database records, rates, or internal notes.
- [ ] Public driver token pages must show only one job for one valid secure token later.
- [ ] Public driver token pages must not expose all bookings.
- [ ] Public driver token pages must not expose the customer database.
- [ ] Public driver token pages must not expose the driver database.
- [ ] Customer pages must not expose internal admin data.
- [ ] Expired, revoked, invalid, or unauthorized tokens are handled safely.
- [ ] Invalid tokens do not reveal whether a real job exists.
- [ ] No `service_role` key appears in frontend code.
- [ ] No public page relies on hidden UI controls as its only security boundary.
- [ ] Browser tests cover public/private route boundaries later.

## 7. Service Role And Secret Handling

Secret handling rules:

- The `service_role` key must never be used in frontend/client code.
- The `service_role` key must never be committed.
- The `service_role` key must only be server-side if ever needed.
- The anon key is not a security bypass.
- RLS policies must still protect data even when the anon key is public.
- Use environment variables only.
- Use separate local, staging, and live keys.
- Rotate keys immediately if exposed.
- Do not paste secrets into screenshots.
- Do not paste secrets into docs.
- Do not paste secrets into chat.
- Do not paste secrets into commits.
- Do not add secrets to browser smoke tests.
- Staff should not share keys in WhatsApp or informal messages.

## 8. Storage And File Upload Checklist

Future OTS photo proof requires a separate storage review:

- [ ] No real file upload now.
- [ ] No Supabase storage behavior in this docs-only stage.
- [ ] Storage bucket names are reviewed before implementation.
- [ ] Storage bucket privacy is reviewed before implementation.
- [ ] Driver can only upload proof for the assigned job later.
- [ ] Driver cannot browse other job proof files.
- [ ] Customer cannot browse storage.
- [ ] Public users cannot browse storage.
- [ ] File size limits are defined.
- [ ] File type limits are defined.
- [ ] Unsafe file types are blocked.
- [ ] Expiry or retention policy is defined.
- [ ] Upload audit trail is defined.
- [ ] Staff review workflow is defined.
- [ ] Deletion or retention rules are approved.
- [ ] Storage costs are reviewed before live use.

## 9. Audit Log Checklist

Future audit logs should record important business events:

- [ ] Booking created.
- [ ] Booking edited.
- [ ] Booking amended.
- [ ] Booking cancelled.
- [ ] Driver assigned.
- [ ] Driver replaced.
- [ ] Driver status changed.
- [ ] Payment recorded.
- [ ] Invoice generated later.
- [ ] Notification sent later.
- [ ] Live location started later.
- [ ] Live location stopped later.
- [ ] File/photo proof uploaded later.
- [ ] Who made the change.
- [ ] When the change happened.
- [ ] Source of the change, such as staff dashboard, customer portal, driver link, API, or system job.
- [ ] Old value and new value where practical.
- [ ] Reason for cancellation, amendment, override, driver replacement, or payment adjustment.
- [ ] Audit logs are append-only or otherwise tamper-resistant.
- [ ] Audit logs are not exposed to public pages.

## 10. Migration Safety Checklist

Before any migration exists or runs, confirm:

- [ ] The reason for the migration is written down.
- [ ] The affected business workflow is clear.
- [ ] The SQL has been reviewed.
- [ ] The data impact has been reviewed.
- [ ] RLS impact has been reviewed.
- [ ] Indexes and constraints have been reviewed.
- [ ] Staging is tested first.
- [ ] Backup/export plan exists.
- [ ] Rollback plan exists.
- [ ] RLS test cases exist.
- [ ] App test cases exist.
- [ ] Parser regression tests still pass.
- [ ] Browser smoke tests still pass.
- [ ] Mobile/no-horizontal-overflow tests still pass.
- [ ] No destructive changes happen without explicit approval.
- [ ] No production migration runs without explicit approval.
- [ ] Never run `supabase db reset`.
- [ ] Never use production as a migration experiment.

## 11. Auth/RBAC Checklist

Future auth and role-based access control must be planned before live database behavior:

- [ ] Staff/admin role is defined.
- [ ] Dispatcher role is defined.
- [ ] Customer role is defined.
- [ ] Driver access or token model is defined.
- [ ] Customer portal login is planned later.
- [ ] Driver job secure token access is planned later.
- [ ] Session expiry is defined.
- [ ] Passwordless auth or managed auth options are reviewed later.
- [ ] Staff invitation and offboarding process is planned.
- [ ] Customer account linking rules are planned.
- [ ] Driver token expiry/revocation rules are planned.
- [ ] Audit trail is planned for sign-in, access, and sensitive changes.
- [ ] No real auth is added in this stage.

## 12. Testing Checklist

Required checks before and after future Supabase work:

- [ ] `npm run test:parser`.
- [ ] `npm run lint`.
- [ ] `npm run build`.
- [ ] `npm run test:app-smoke-browser`.
- [ ] `npm run test:mobile-usability-browser`.
- [ ] `npm run test:safe`.
- [ ] RLS tests later.
- [ ] Public/private route boundary tests later.
- [ ] No Supabase writes from public pages unless approved.
- [ ] No `service_role` key exposure.
- [ ] Customer can only see own data later.
- [ ] Driver can only see one assigned job later.
- [ ] Staff/admin can access only approved staff areas.
- [ ] Invalid driver token cannot reveal real job data.
- [ ] Expired driver token cannot update status.
- [ ] Customer portal cannot see driver database rows.
- [ ] Driver page cannot see customer database rows.
- [ ] Mobile/no-horizontal-overflow for customer pages.
- [ ] Mobile/no-horizontal-overflow for driver pages.
- [ ] Mock/local tests continue to prove no real API calls in mock mode.

## 13. Approval Gates

Each item below requires separate explicit approval:

- Real Supabase schema migration.
- RLS policy changes.
- Production Supabase project connection.
- Real customer auth.
- Real driver secure job tokens.
- Real customer portal database reads.
- Real customer portal database writes.
- Real driver job link database reads.
- Real driver job link database writes.
- Real live-location writes.
- Real file/photo uploads.
- Real payment or Stripe integration.
- Real invoice/PDF/statement generation.
- Real notification sending.
- Calendar sync.
- Any destructive database operation.
- Any production database operation.

Approval for one item does not approve the others.

## 14. Final Readiness Checklist

### Ready to implement real Supabase changes only when all are true

- [ ] Plan reviewed.
- [ ] Staging environment ready.
- [ ] Backup plan ready.
- [ ] Rollback plan ready.
- [ ] RLS design reviewed.
- [ ] Table relationships reviewed.
- [ ] Public page boundaries reviewed.
- [ ] Storage boundaries reviewed if files are involved.
- [ ] Secrets configured safely.
- [ ] Parser tests passing.
- [ ] App tests passing.
- [ ] Mobile/no-horizontal-overflow tests passing.
- [ ] RLS tests prepared.
- [ ] Staff/customer/driver role behavior is clear.
- [ ] Demo/test data separation is clear.
- [ ] Explicit approval received.

If any item is not ready, keep Supabase production work blocked and continue with docs-only or mock/local planning.
