# Business-Grade Activation Handoff Audit

This runbook is a compact handoff layer over `docs/current-implementation-ledger.md`. The ledger remains the source of truth for completed setup-only modules, the activation decision matrix, and blocked live areas.

## Current Checkpoints

- Latest repo checkpoint at this handoff baseline: `926408c Update ledger for pre-activation verification suite`.
- Latest implementation checkpoint: `da21fb5 Add pre-activation verification suite`.
- Required master verification runner: `node scripts/test-preactivation-verification-suite.mjs`.

## Complete Up To Activation Stop

- Customer Copy Email/WhatsApp/SMS driver-details messaging.
- Secure customer driver-details link.
- Telegram internal admin alerts.
- Flight ETA setup-only chain.
- Live location setup chain.
- OTS photo proof setup chain.
- Customer/driver auth readiness chain.
- Billing/payment readiness chain.
- Customer amendment/cancellation review flow.
- Calendar event lifecycle readiness chain.
- Company/traveler CRM write-blocked readiness.
- Production hardening readiness chain.
- Shim cleanup inventory and no-new-shim guards, with risky write paths parked.
- Global pre-activation no-live guard, activation decision matrix guard, and pre-activation verification suite.

## Still Blocked

All live areas below remain blocked unless explicitly approved through the ledger activation decision matrix:

- Live DB/write, migrations, and deployment.
- Provider/env activation and external APIs.
- Email, WhatsApp, SMS, and Telegram live sending.
- FlightAware live lookup and scheduler.
- Live location GPS capture, storage, admin map, and customer map.
- OTS photo camera/upload, Supabase Storage bucket, storage policies, and admin viewer.
- Customer/driver auth, Supabase Auth, sessions, token issuing, and access policies.
- Billing/payment, invoice PDF generation, invoice sending, payment links, payout automation, and production auto-billing.
- CRM/calendar amendment update actions, calendar sync/update/cancel, and customer/driver notifications.
- Risky shim write paths: `rate_settings` writes, full drivers write/delete, `customer_rates`, `driver_payout_rules`, pricing, and payout.

## Activation Order Recommendation

1. Production hardening gate: approve deployment readiness, rollback plan, manual go/no-go, and environment handling without enabling live writes.
2. Live DB/write and migration gate: approve schema/write scope, RLS/policies, rollback, and production data safety.
3. CRM identity write split: activate company/traveler CRM create/update/name-memory only after excluding rate/payout override writes.
4. Customer amendment admin action gate: activate admin-approved CRM booking update only after confirming amendment/cancel never auto-writes from customer request intake.
5. Calendar lifecycle gate: activate create/update/cancel only after the admin approval flow is live and separated from customer amendment intake.
6. Provider messaging gates: activate Email first, then SMS/WhatsApp, then Telegram internal admin alerts, each with recipient safety and provider/env approval.
7. Customer/driver auth gate: activate Supabase Auth, sessions, token issuing, and customer/driver access only after customer-safe and driver-safe projections are verified.
8. Secure customer driver-details link gate: activate token issuing and customer access only after auth/access policies are approved.
9. Live location gate: activate GPS capture, storage, admin map, and customer map only after auth/customer access and retention are approved.
10. OTS photo proof gate: activate camera/upload, private storage, policies, and admin viewer only after storage and auth boundaries are approved.
11. FlightAware live gate: activate provider/env, scheduler, rate limits, and live lookup after external API controls are approved.
12. Billing/payment gate: activate invoice PDF, invoice sending, payment links, payout automation, and production auto-billing last, after finance exposure rules are locked.
13. Risky shim write-path replacement: handle one family at a time only after explicit split/gating approval.

## Approval Needed By Live Area

Use the ledger Activation Decision Matrix for exact approval wording. In short:

- DB/write/migrations: owner approval for schema/write scope, migration plan, rollback, RLS/policies, and production data safety.
- Deployment: production readiness verification, rollback plan, and manual go/no-go.
- Provider/env/live sending: provider credentials, recipient safety, templates/sender selection, and live-send approval per channel.
- FlightAware: provider/env, scheduler/rate-limit, and live external lookup approval.
- Live location: GPS capture, storage policy, auth/customer access, retention, and customer-visible map approval.
- OTS photo: camera/upload, private bucket, storage policy, DB/write, admin viewer, and access-control approval.
- Auth: Supabase Auth, sessions/tokens, access policy, DB/write, and customer/driver access approval.
- Billing/payment/PDF/payout: payment provider, PDF/invoice, payout, payment links, DB/write, and finance exposure approval.
- CRM/calendar amendments: admin approval workflow, CRM booking update, calendar update/cancel, notification, and write-safety approval.
- Risky shims: one-family split/gating approval with typed helpers/APIs/tests before any write-path replacement.

## Must Never Be Activated Together

- Customer amendment/cancellation intake and CRM/calendar writes. Customer amendment/cancel must never auto-update booking, CRM, or calendar; admin approval is required first.
- Calendar update/cancel and customer request intake. Calendar changes only happen after admin approval and explicit calendar activation.
- Provider/env live sending across multiple channels in one pass. Activate one channel at a time with recipient-safety evidence.
- Auth/session/token issuing and customer-visible private data access in the same unreviewed pass.
- Live location GPS capture and customer map visibility without storage, retention, auth, and access-control approval.
- OTS upload/storage and customer visibility without private bucket, storage policy, admin viewer, and auth approval.
- Billing/payment/PDF/payout with CRM/calendar/customer messaging changes.
- `rate_settings`, full drivers, `customer_rates`, `driver_payout_rules`, pricing, and payout write-path changes in the same pass.

## Tests Before Each Activation Phase

- Before any activation planning: `node scripts/test-preactivation-verification-suite.mjs`, `git diff --check`, `git status --short`.
- Before deployment/build gates: `npm run lint`, `npm run build`, `npm run test:app-smoke-browser`.
- Before any DB/write/migration gate: run the relevant direct contract tests plus migration/RLS checks approved for that phase; do not run live Supabase commands without explicit approval.
- Before provider/env/live sending: run the channel no-live guard, disabled action/send API tests, preview/readiness tests, recipient-safety tests, `npm run lint` if imports changed, and the pre-activation verification suite.
- Before CRM/calendar amendment activation: run customer amendment no-live guard, calendar event lifecycle no-live guard, disabled action API tests, preview API tests, and the pre-activation verification suite.
- Before auth/link/live location/OTS activation: run the matching no-live guard, disabled access/action API tests, preview/readiness API tests, `npm run lint`, `npm run build`, and browser smoke if UI or route exposure changes.
- Before billing/payment/PDF/payout activation: run billing/payment no-live guard, disabled billing/payment action API tests, readiness preview tests, `npm run lint`, `npm run build`, browser smoke, and any explicitly approved finance/payment provider sandbox tests.
- Before risky shim replacement: run shim cleanup no-new-shim guard plus the specific typed helper/API tests for the one family being split.

## Parked Risk Areas

- `rate_settings` writes/default-rate save/upsert.
- Full drivers write/delete and payout/internal-field-entangled profile paths.
- `customer_rates`.
- `driver_payout_rules`.
- Pricing.
- Payout.

These remain parked until explicit one-family split/gating approval. Do not combine them with customer/traveler/company CRM write activation, billing/payment activation, or booking save changes.
