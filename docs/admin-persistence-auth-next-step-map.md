# Stage 4A-403 - Production Persistence/Auth Next-Step Map

Stage 4A-403 is a docs-and-tests map only. It does not run Supabase CLI commands, run raw SQL, read or write a live database, run live save/load, enable production persistence, change environment values, create policies, change customer or driver auth, print secrets, or change billing, payment, PDF, payout, notification, live-location, proof/photo, parser-learning, parser, or app behavior.

## Current State

Legacy public-table RLS hardening is closed out for staging and production. The existing admin persistence code is still a narrow server-only path behind `/api/admin-bookings`, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, same-origin/admin-purpose checks, admin/dispatcher session gating, safe payload parsing, unsafe-field rejection, and safe failure responses.

Approved now:

- Keep persistence OFF.
- Use this local map and focused tests to decide the next backend workflow order.
- Prepare a separate approval packet for production persistence enablement.

Still blocked now:

- Production env reads, Supabase commands, raw SQL, dashboard fixes, feature-flag changes, live save/load, production writes, staging cleanup writes, migrations, policies, customer auth, driver auth, notifications, billing, payment, invoice/PDF, payout, live-location, proof/photo, parser-learning, and parser changes.

## Ordered Backend Workflow

1. Admin production persistence enablement gate.

   Approved now: prepare the gate locally as a separate William-approved stage. The gate must restate the exact production target without exposing values, prove persistence starts OFF, prove the kill-switch, prove admin/dispatcher-only access, prove unsafe-field rejection, prove browser/client bundles cannot import server-only persistence, define rollback, and name the exact checks to run.

   Still blocked: turning persistence ON, reading production env values, running Supabase commands, creating policies, applying migrations, using dashboard fixes, or writing production data.

2. Admin save/load production verification.

   Approved now: none beyond planning the acceptance criteria after the enablement gate passes.

   Still blocked: any production save, load, update, delete, upsert, live API verification, live database evidence collection, feature-flag enablement window, or cleanup. If later approved, it must be one controlled admin-only production save/load through the existing API gate, with redacted evidence, kill-switch OFF before and after, no raw SQL, no Supabase CLI by implication, no row contents printed, and no secret exposure.

3. Customer auth/RLS later.

   Approved now: docs-only planning after admin production persistence has its own evidence.

   Still blocked: customer accounts, customer sessions, customer-facing database policies, customer portal production reads/writes, customer-safe projections, and any customer-visible data path. Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

4. Driver auth/token security later.

   Approved now: docs-only planning after the admin and customer boundaries are stable.

   Still blocked: production driver auth, token tables, token issuance, token lookup, token hashing/storage migration, driver-facing production mutations, and driver RLS policies. Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.

5. Notifications, billing, PDF, and payment later.

   Approved now: docs-only dependency mapping.

   Still blocked: notification sending, Telegram/WhatsApp/SMS/email delivery, billing workflows, invoice generation, PDF generation, payment links, Stripe, PayNow, payment webhooks, provider integrations, finance automation, payout behavior, and customer/driver exposure of restricted financial fields.

## Evidence References Reviewed

- [Legacy Public Table RLS Hardening Closeout](legacy-public-table-rls-hardening-closeout.md).
- [Admin Persistence Production Readiness Gate](admin-persistence-production-readiness-gate.md).
- [Admin Persistence Staging Verification Packet](admin-persistence-staging-verification-packet.md).
- [Admin Persistence API Staging Save-Load Success Evidence](admin-persistence-api-staging-save-load-success-evidence.md).
- `lib/admin-booking-persistence.ts`.
- `lib/admin-booking-supabase-adapter.ts`.
- `lib/admin-dispatcher-auth-boundary.ts`.
- `app/api/admin-bookings/route.ts`.
