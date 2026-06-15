# Prestige Limo Ops — Current Implementation Ledger

Latest known clean checkpoint:
924fbe4 Wire driver assignment display to typed API

Purpose:
This file is the repo source of truth for Codex and future work. Inspect this file before adding new UI, API, helper, test, or docs.

## Next GPT Lock / Uncompleted Backlog

- Latest repo commit to preserve as handoff baseline: `924fbe4 Wire driver assignment display to typed API`.
- Latest implementation checkpoint to preserve: `924fbe4 Wire driver assignment display to typed API`.
- Completed foundations/APIs/UI not to repeat: Flight ETA setup-only chain, email setup-only chain, Telegram disabled/internal admin alert setup foundations, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, WhatsApp customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, SMS customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, secure customer driver-details link setup foundation, preview/readiness API, disabled access API, access audit payload setup, and no-live guard, email no-live guard, customer driver details email preview/readiness API, disabled customer driver details email send API, customer driver details email send audit payload setup foundation, customer driver details email review item API, Customer Copy customer driver details email review UI, disabled-send button, email activation preflight status UI, WhatsApp/SMS disabled-send UI, compact multi-channel buttons row/layout fix, admin dashboard horizontal overflow fix, and multi-channel no-live guard, Dispatch pricing/review/OneMap section reorder, Save Booking + CRM button placement near Job Card Preview actions, Save Booking duplicate-submit guard, separated Save Booking + CRM and calendar actions, Save Booking + CRM safe admin booking persistence reroute, booking UI browser test stabilization, calendar event lifecycle readiness setup foundation/API, disabled action API, action audit payload setup foundation, and no-live guard, customer amendment/cancellation review handoff setup foundation/API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, live location window policy setup foundation/API, disabled access/capture API, and no-live guard, OTS photo proof setup foundation, preview/readiness API, disabled access/upload API, audit payload setup foundation, and no-live guard, customer/driver auth readiness setup foundation/API, disabled access API, access audit payload setup foundation, no-live guard, and pre-activation audit lock, billing/payment readiness setup foundation, preview API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, production deployment hardening readiness setup foundation/API, disabled action API, action audit payload setup foundation, and no-live guard, staging deployment approval packet and guard, core admin booking persistence activation readiness packet, guard, safe path guard, and Save Booking + CRM safe reroute, global pre-activation no-live guard, activation decision matrix guard, pre-activation verification suite, shim cleanup typed API inventory, shim cleanup no-new-shim guard, companies CRM identity/domain typed helper/API, travelers CRM identity/default-address typed helper/API, company/traveler CRM write-readiness setup foundation/API, disabled action API, audit payload setup foundation, no-live guard, and pre-activation audit lock, driver assignment/display typed helper/API and booking assignment display wiring, email provider readiness setup foundation/API, email provider selection setup foundation/API, email activation preflight setup API, app smoke email preflight setup-only allowlist, driver ack customer message handoff setup foundation/API, ledger guards.
- Uncompleted backlog: provider activation/live sending later; Telegram/WhatsApp activation; FlightAware live; live location activation; OTS photo activation; customer/driver auth activation; billing/payment activation; shim cleanup; production.
- Rules: no duplicate work, no new shims, no unnecessary UI/giant cards, no live risky features without approval.

## Master Pre-Activation Completion Audit Lock

- Full app is complete up to the activation stop across: Customer Copy Email/WhatsApp/SMS driver-details messaging; secure customer driver-details link; Telegram internal admin alerts; Flight ETA setup-only chain; live location; OTS photo proof; customer/driver auth; billing/payment; customer amendment/cancellation review flow; calendar event lifecycle; company/traveler CRM write-blocked readiness; production hardening; core admin booking persistence activation readiness packet; shim cleanup guards and parked risky write paths; global pre-activation no-live guard.
- Global pre-activation no-live guard is done at `e381e3e Add global pre-activation no-live guard`; it coordinates the completed module guards, shim cleanup guard, setup route GET-only checks, and master ledger approval/block wording.
- Activation decision matrix guard is done at `702ec53 Add activation decision matrix guard`; it keeps the matrix rows and explicit approval requirements locked.
- Pre-activation verification suite is done at `da21fb5 Add pre-activation verification suite` and now includes `4382cdf Add staging deployment approval packet guard`, `96c4e7a Add core booking persistence activation packet guard`, and `4045c0a Add core booking persistence safe path guard`; it fail-fast runs the global guard, activation matrix guard, staging deployment approval packet guard, core admin booking persistence activation packet guard, core booking persistence safe path guard, channel/module no-live guards, production hardening guard, and shim cleanup guard.
- Booking UI browser stabilization is done at `4b7a1ab Stabilize booking UI browser test`; stale browser expectations/mocks were aligned to the current Customer Copy setup-only routes, separated Save Booking + CRM and Create Calendar Event flow, typed traveler identity read, and saved-address mock path.
- Calendar event lifecycle status: readiness foundation, preview/readiness API, disabled action API, action audit payload setup foundation, no-live guard, and final pre-activation lock are done; customer amendment/cancellation never auto-updates calendar; calendar create/update/cancel remains blocked until explicit approval.
- Production hardening status: readiness foundation, preview/readiness API, disabled production action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock are done.
- Shim cleanup status: inventory and no-new-shim guard are done; companies CRM identity/domain typed API and travelers CRM identity/default-address typed API are done; driver assignment display now uses the existing typed display-only API for the booking assignment display path; company/traveler CRM write setup is locked through the activation stop; risky full-driver profile write/delete paths and full-driver profile read/save/delete paths, `rate_settings` save/upsert, pricing, payout, `customer_rates`, and `driver_payout_rules` write paths remain parked.
- Still blocked unless explicitly approved: live DB/write, migrations, deployment, provider/env activation, external APIs, live sending, payment/PDF/payout, auth activation, FlightAware live lookup, live location activation, photo upload/storage, CRM/calendar amendment updates, calendar event lifecycle create/update/cancel and live sync, job-card creation from customer amendments, and risky shim write paths.
- Continue to use setup-only helpers/APIs and direct guards. Do not add new shims, duplicate UI/API/helper work, live provider behavior, or customer/driver-visible finance/internal details.

## Activation Decision Matrix

| Blocked live area | Approval required before activation |
| --- | --- |
| Live DB/write/migrations | Explicit owner approval for schema/write scope, migration plan, rollback plan, and production data safety. |
| Deployment | Explicit deployment approval with production readiness verification, rollback plan, and manual go/no-go. |
| Email provider/env/live sending | Explicit provider/env approval plus recipient safety, sender selection, and live-send approval. |
| WhatsApp provider/env/live sending | Explicit provider/env approval plus customer-safe template, recipient safety, and live-send approval. |
| SMS provider/env/live sending | Explicit provider/env approval plus short customer-safe message policy, recipient safety, and live-send approval. |
| Telegram bot token/env/live sending | Explicit bot token/env approval plus internal-admin recipient policy and live-send approval. |
| FlightAware live lookup/scheduler | Explicit FlightAware provider/env approval plus scheduler/rate-limit policy and live external lookup approval. |
| Live location/GPS/storage/customer map | Explicit GPS capture, storage policy, auth/customer-access, retention, and customer-visible map approval. |
| OTS photo upload/Supabase Storage/admin viewer | Explicit camera/upload, private bucket, storage policy, DB/write, admin viewer, and access-control approval. |
| Customer/driver auth/Supabase Auth/session/token issuing | Explicit auth provider, session/token, access policy, DB/write, and customer/driver access approval. |
| Billing/payment/PDF/payout/payment links | Explicit payment provider, PDF/invoice, payout, payment-link, DB/write, and finance exposure approval. |
| CRM/calendar amendment update actions | Explicit admin approval workflow, CRM booking update, calendar update/cancel, notification, and write-safety approval. |
| Risky shim write paths: `rate_settings`, full drivers, `customer_rates`, `driver_payout_rules`, pricing, payout | Explicit one-family split/gating approval with typed helpers/APIs/tests before any write-path replacement. |

## Email Pre-Activation Completion Audit Lock

- Customer driver-details email is complete up to the activation stop.
- Preview/readiness API is done.
- Disabled send API is done.
- Driver ack handoff foundation/API is done.
- Admin review item API is done.
- Customer Copy compact review UI/button and preflight status are done.
- Provider readiness, provider selection, and activation preflight setup are done.
- Send audit payload setup foundation is done.
- Email no-live guard is done.
- Customer Copy multi-channel no-live guard is done.
- Live provider/env/send activation remains blocked until explicit approval.

## Telegram Pre-Activation Completion Audit Lock

- Telegram internal admin alerts are complete up to the activation stop.
- Setup foundation is done.
- Preview/readiness API is done.
- Disabled send API is done.
- Send audit payload setup foundation is done.
- Telegram no-live guard is done.
- Live bot token/env/Telegram API/send activation remains blocked until explicit approval.

## WhatsApp Pre-Activation Completion Audit Lock

- WhatsApp customer driver-details is complete up to the activation stop.
- Setup foundation is done.
- Preview/readiness API is done.
- Disabled send API is done.
- Send audit payload setup foundation is done.
- WhatsApp no-live guard is done.
- Customer Copy compact disabled-send UI is done.
- Customer Copy multi-channel no-live guard is done.
- Live provider/env/WhatsApp API/send activation remains blocked until explicit approval.

## SMS Pre-Activation Completion Audit Lock

- SMS customer driver-details is complete up to the activation stop.
- Setup foundation is done.
- Preview/readiness API is done.
- Disabled send API is done.
- Send audit payload setup foundation is done.
- SMS no-live guard is done.
- Customer Copy compact disabled-send UI is done.
- Customer Copy multi-channel no-live guard is done.
- Live provider/env/SMS API/send activation remains blocked until explicit approval.

## Customer Copy Multi-Channel Pre-Activation Completion Audit Lock

- Customer Copy Email/WhatsApp/SMS customer driver-details messaging is complete up to the activation stop.
- Compact Customer Copy UI, multi-channel buttons row/layout fix, and admin dashboard horizontal overflow fix are done.
- Disabled send APIs are done.
- Preview/readiness APIs are done.
- Send audit payload setup foundations are done.
- Channel no-live guards are done.
- Customer Copy multi-channel no-live guard is done.
- Live provider/env/send activation remains blocked until explicit approval.

## Customer Amendment/Cancellation Pre-Activation Completion Audit Lock

- Customer amendment/cancellation is complete up to the activation stop.
- Review handoff foundation is done.
- Preview/readiness API is done.
- Disabled amendment/cancellation action API is done.
- Action audit payload setup foundation is done.
- Customer amendment no-live guard is done.
- Customer amendment/cancel never auto-updates booking, CRM, or calendar.
- Admin approval is required before CRM booking update or calendar update/cancel.
- Live booking update, calendar sync/update/cancel, CRM update, job card creation, customer/driver notification, customer auth, and DB/write remain blocked until explicit approval.

## Calendar Event Lifecycle Pre-Activation Completion Audit Lock

- Calendar event lifecycle is complete up to the activation stop.
- Readiness foundation is done at `faede95 Add calendar event lifecycle readiness setup`.
- Preview/readiness API is done at `b77b33f Add calendar event lifecycle preview readiness API`.
- Disabled calendar action API is done at `88f1db2 Add disabled calendar event lifecycle action API`.
- Action audit payload setup foundation is done at `f743df2 Add calendar event lifecycle audit payload setup`.
- Calendar event lifecycle no-live guard is done at `e36e802 Add calendar event lifecycle no-live guard`.
- Calendar create/update/cancel remains disabled/no-op.
- It returns `calendarCreateEnabled false`, `calendarUpdateEnabled false`, `calendarCancelEnabled false`, `liveCalendarSyncEnabled false`, `external_calendar false`, `adminApprovalRequired true`, and `auditWriteEnabled false` where audit payloads are involved.
- Customer amendment/cancellation must never auto-update calendar.
- Calendar update/cancel only happens after admin approval and explicit activation later.
- No POST/write/DB/calendar provider/env/live calendar sync/package/shim/payment behavior is active.

## Secure Customer Driver Details Link Pre-Activation Completion Audit Lock

- Secure customer driver-details link is complete up to the activation stop.
- Setup foundation is done.
- Preview/readiness API is done.
- Disabled link access API is done.
- Access audit payload setup foundation is done.
- Customer driver-details link no-live guard is done.
- Live token issuing/auth/DB/write/customer access remains blocked until explicit approval.

## Live Location Pre-Activation Completion Audit Lock

- Live location is complete up to the activation stop.
- Window policy foundation is done.
- Preview/readiness API is done.
- Disabled access/capture API is done.
- Live location no-live guard is done.
- GPS capture, admin live map, customer map link, storage/policies, and auth/customer access remain blocked until explicit approval.

## OTS Photo Proof Pre-Activation Completion Audit Lock

- OTS photo proof is complete up to the activation stop.
- Setup foundation is done.
- Preview/readiness API is done.
- Disabled access/upload API is done.
- Access/upload audit payload setup foundation is done.
- OTS photo proof no-live guard is done.
- Live camera/file upload, Supabase Storage bucket, storage policies, DB/write, admin viewer, customer visibility, and auth/live access remain blocked until explicit approval.

## Customer/Driver Auth Pre-Activation Completion Audit Lock

- Customer/driver auth is complete up to the activation stop.
- Readiness foundation is done.
- Preview/readiness API is done.
- Disabled auth access API is done.
- Access audit payload setup foundation is done.
- Customer/driver auth no-live guard is done.
- Customer auth, driver auth, Supabase Auth, session creation, token issuing, saved booking access, driver-only job visibility, and DB/write remain blocked until explicit approval.

## Billing/Payment Pre-Activation Completion Audit Lock

- Billing/payment is complete up to the activation stop.
- Readiness foundation is done.
- Preview/readiness API is done.
- Disabled billing/payment action API is done.
- Action audit payload setup foundation is done.
- Billing/payment no-live guard is done.
- Invoice PDF generation, invoice sending, payment links, payout automation, production auto-billing, payment provider/env, and DB/write remain blocked until explicit approval.

## Production Hardening Pre-Activation Completion Audit Lock

- Production hardening is complete up to the activation stop.
- Readiness foundation is done at `74c864b Add production hardening readiness setup`.
- Preview/readiness API is done at `1a79d06 Add production hardening readiness preview API`.
- Disabled production action API is done at `72fc6ff Add disabled production hardening action API`.
- Action audit payload setup foundation is done at `4daddff Add production hardening action audit payload setup`.
- Production hardening no-live guard is done at `d75d278 Add production hardening no-live guard`.
- Deployment, live DB writes, migrations, external API/provider/env activation, payment/PDF/payout/auth/live sending/live location/photo upload remain blocked until explicit approval.
- Manual approval remains required for any live activation.
- The setup/API/audit chain returns `productionDeploymentEnabled false`, `liveDbWriteEnabled false`, `migrationEnabled false`, `externalApiEnabled false`, `providerEnvEnabled false`, `paymentActivationEnabled false`, `authActivationEnabled false`, `liveSendingEnabled false`, and `manualApprovalRequired true`.
- No deployment, env read, DB/write, migration, provider activation, payment/PDF/payout/auth/live sending/live location/photo upload, package change, or shim is active from this setup/API/audit chain.

## Production Deployment Planning Inventory Lock

- Deployment planning inventory is docs-only and does not approve deployment or live activation.
- Current build/deploy config: `package.json` provides `npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run test:app-smoke-browser`, `npm run test:booking-ui-browser`, and `npm run test:safe`; `next.config.ts` is the default empty Next config; no `vercel.json`, `Dockerfile`, `netlify.toml`, or custom deployment config was found.
- Required pre-deploy checks before any staging deploy planning packet: `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run build`, `npm run test:app-smoke-browser`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`. Run `npm run test:safe` for a broader release candidate gate.
- Current no-live activation gates: production hardening readiness/action APIs remain blocked with `productionDeploymentEnabled false`, `liveDbWriteEnabled false`, `migrationEnabled false`, `externalApiEnabled false`, `providerEnvEnabled false`, `paymentActivationEnabled false`, `authActivationEnabled false`, `liveSendingEnabled false`, and `manualApprovalRequired true`; the pre-activation verification suite runs global, channel, module, production hardening, activation matrix, core admin booking persistence activation packet, core booking persistence safe path, and shim cleanup guards.
- Env files remain ignored by `.gitignore`; do not print, commit, or paste env values. Local env names observed are inventory only, not approval to use them.
- Staging env variables that must remain unset, false, mock, or non-production unless separately approved: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, `DRIVER_JOB_LINK_MODE`, `NEXT_PUBLIC_DRIVER_JOB_LINK_MODE`, `PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED`, `AI_PARSE_MODE`, customer auth/session flags, `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED`, `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED`, OneMap tokens/endpoints, and any future email/WhatsApp/SMS/Telegram/FlightAware/payment/provider/env keys.
- Recommended staging deploy order: freeze the clean repo commit and rollback target; deploy the app build with no live credentials and no write/provider/payment/auth/location/photo/sending gates enabled; run the pre-deploy checks against the staged app; verify route leak/no-live guards and setup-only labels; collect sanitized evidence; stop before any env/provider/DB/write activation.
- Rollback checklist: keep the last known good commit and deployment id, redeploy the previous artifact if needed, keep all live gates false/unset, remove any accidentally added staging secrets, rotate exposed keys if any value leaks, confirm `git status --short` is clean, rerun the pre-activation verification suite, and record sanitized evidence without secrets.
- Explicit warning: no live DB/write, migrations, deployment activation, provider/env activation, external APIs, payment/PDF/payout, auth activation, live location, photo upload/storage, live sending, CRM/calendar amendment update, risky shim write path, package, or env change is approved by this planning inventory.
- Staging deployment approval packet guard is done at `4382cdf Add staging deployment approval packet guard`; it verifies the packet keeps checkpoint fields, required checks, staging-only steps, disabled env requirements, no-live gates, rollback and smoke checklists, approval fields, and explicit blocked live areas.

## Core Admin Booking Persistence Activation Readiness Packet Lock

- Core admin booking persistence activation readiness packet is done at `693a623 Add core booking persistence activation readiness packet`.
- Core admin booking persistence activation packet guard is done at `96c4e7a Add core booking persistence activation packet guard` and is included in `scripts/test-preactivation-verification-suite.mjs`.
- Core booking persistence safe path guard is done at `4045c0a Add core booking persistence safe path guard`; it proves the future safe path uses the `/api/admin-bookings` contract, accepts operational booking fields only, rejects/excludes pricing, payout, payment, PDF, billing, `customer_rates`, `driver_payout_rules`, rate overrides, provider/send/auth/photo/live-location/internal-note/debug fields, stays blocked/no-write while `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` is closed, and does not rely on `/api/admin-saved-bookings` for the first live activation path.
- Completed staging rehearsal evidence: the owner-approved staging-only `POST /api/admin-bookings` rehearsal returned HTTP 200 with `ok: true` for booking ref `STAGING-ADMIN-BOOKING-20260615074303-3JLQIZ`; inserted safe operational row ids were booking `15`, customer `4`, route points `11`/`12`, service item `6`, and audit log `8`; no secrets were printed, no cleanup was attempted, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` was closed afterward, staging was redeployed and returned HTTP 200, Save Booking + CRM was not rerouted, `/api/admin-saved-bookings` was not used, and no provider/sending/payment/PDF/payout/auth/location/photo/CRM-calendar/risky shim writes were activated.
- Save Booking + CRM safe reroute is done at `af57438 Reroute Save Booking CRM to safe admin booking persistence`.
- Save Booking + CRM now posts to `POST /api/admin-bookings`, no longer posts to `/api/admin-saved-bookings`, uses the safe operational payload builder, and sends the `x-prestige-admin-purpose: admin-booking-persistence` purpose header.
- The Save Booking + CRM payload keeps operational booking/customer/contact/route/service fields only. Pricing, payout, rates, payment, PDF, billing, `customer_rates`, `driver_payout_rules`, rate overrides, provider/send, auth, photo, live location, internal/debug fields, driver notes, parser internals, and legacy company/traveler CRM write fields remain excluded.
- Calendar behavior remains separate; Create Calendar Event still uses the file-only calendar path and Save Booking + CRM does not create/update/cancel calendar events.
- The reroute did not perform a live POST/write, env change, deployment, migration, Supabase key use, cleanup, `/api/admin-saved-bookings` activation, provider/send/payment/PDF/payout/auth/location/photo/CRM-calendar write, or risky shim write.
- `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` remains closed from the prior staging verification.
- Proposed first live activation scope remains Admin Save Booking + CRM only, narrowed to the safe admin-only operational persistence contract at `POST /api/admin-bookings`; activation is still blocked until explicit owner approval opens the kill switch again.
- The legacy rich `/api/admin-saved-bookings` path still exists for read/delete/legacy paths but is not used by Save Booking + CRM and is not approved for first live DB activation.
- Live DB/write approval, Supabase env approval, table/policy verification, and rollback/manual recovery approval remain required before activation.
- Migrations are not approved by this packet.
- Pricing, payout, payment, PDF, billing, `customer_rates`, `driver_payout_rules`, and rate overrides remain excluded.
- Provider/env/live sending/auth/location/photo activation is not allowed in the same pass.
- Customer amendment/cancellation must never auto-update CRM or calendar; admin approval remains required before any CRM booking update or calendar update/cancel.

## Locked Workflow Rules

- Inspect first.
- Do not duplicate UI/API/helpers/tests/docs.
- Do not add → remove → replace loop.
- Reuse existing setup-only foundations.
- Terminal 2 checks before Codex whenever possible.
- No live DB, migrations, payment, PDF, payout, auth activation, live sending, external APIs, live location, or photo upload unless explicitly approved.
- After every Codex task, provide a short "ChatGPT record message" for the user to paste back into ChatGPT. Include implementation commit if any, ledger/docs commit if any, files changed, checks run, final `git status --short`, applicable boundaries (no live DB/provider/env/sending/payment/etc.), and next suggested task if obvious.

## Required Check Lock

| Task type | Required checks |
| --- | --- |
| Docs-only ledger update | `git diff --check`, `git status --short` |
| Helper/setup foundation | Direct contract test, `git diff --check`, `git status --short` |
| API route | API contract test + related helper test, `git diff --check`, `git status --short` |
| Compact UI change | Relevant test if any + `npm run lint`; build only if risky |
| Big UI/page change | `npm run lint` + `npm run build` |
| Live DB/API/payment/auth/provider changes | Full relevant tests + lint + build + smoke |

## Implemented

### Admin / booking
- Admin booking dashboard foundation.
- Saved booking create/read/list/status/delete foundations.
- Driver assignment typed API foundation.
- Calendar download/sync foundations.
- Admin booking workflow statuses.
- Admin driver job statuses.
- Job lifecycle monitor helper and typed read-only API.
- Job lifecycle monitor missing-checkpoint contract coverage.
- Implementation ledger alignment guard.
- Implementation ledger not-live guard.

### Customer
- `/book` customer booking request foundation.
- Passenger memory suggestions.
- Safe autofill for pickup/drop-off/service/vehicle only.
- `/my-bookings` fail-closed customer portal.
- Customer portal actions simplified: PDF | Edit | Cancel.
- Customer saved booking session/cookie/auth boundary foundations.
- Customer/driver auth readiness setup foundation, preview API, disabled access API, access audit payload setup foundation, and no-live guard.
- Customer amendment/cancellation review handoff setup foundation, preview API, disabled action API, action audit payload setup foundation, and no-live guard for date, time, location, cancellation, and reject requests.

### Driver
- `/driver-job/[token]` single-job driver flow.
- Save & Acknowledge Job.
- OTW / OTS / POB / Completed.
- Status History.
- Driver notifications GET/PATCH foundation.
- Driver issue alert foundation.

### Billing / invoice
- Completed booking billing readiness audit.
- Billing/payment readiness setup foundation, preview API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock.
- Monthly billing grouping.
- Monthly invoice draft plans.
- Monthly invoice draft trip candidates.
- Monthly invoice issue records.
- DSP actual-time evidence connected.
- Billable price review foundations.

### Rates / pricing
- `resolvePricing` uses customer_rates and driver_payout_rules.
- Rates/payout save paths exist.
- Some rate/pricing save paths still use legacy shim and are parked due pricing/payout risk.

### Legacy shim retired
- bookers
- saved_addresses
- driver deactivation

### Shim cleanup typed API inventory
- Remaining shim route: `app/api/admin-legacy-data/rest/v1/[table]/route.ts`, called by `app/page.tsx` through `adminLegacyDataClient`.
- Remaining shim families found: `companies` CRM create plus rate/payout-dependent save/override paths; `travelers` CRM/name-memory create/update plus traveler rate override writes; `rate_settings` default-rate upsert; full `drivers` read/profile save/delete. The legacy route also allowlists pricing/payout columns on these parked families.
- Existing typed replacements: `admin-bookers` and `admin-saved-addresses` are retired from the shim; `admin-companies-crm-identity` covers read-only companies id/company_name/domain lookup without rate/payout fields; `admin-travelers-crm-identity` covers read-only travelers id/company_id/name/contact/default-address/saved-address display lookup without rate/payout fields; `admin-company-traveler-crm-write-readiness-setup-foundation`, `GET /api/admin-company-traveler-crm-write-readiness-preview-setup`, `GET /api/admin-company-traveler-crm-write-action-disabled-setup`, and `admin-company-traveler-crm-write-action-audit-payload-setup-foundation` cover setup-only blocked readiness/no-op action/audit payload results for future company/traveler CRM create/update/name-memory actions without rate/payout override fields, and `test-admin-company-traveler-crm-write-no-live-guard` guards the chain against live activation; `admin-driver-assignment-display` covers read-only driver id/name/contact/vehicle/plate/availability assignment/display lookup without payout/rate/pricing/billing/internal-note fields and is wired only into the booking driver assignment display state/loader; it is not wired into editable full driver profile read/save/delete or payout-aware saved-booking assignment paths; `admin-customer-name-memory` covers narrow read-only company/traveler/address memory; `admin-rate-setup` covers read-only rate settings/company/traveler rate setup; `admin-driver-availability` covers availability-only driver PATCH; saved booking driver assignment has its own typed path and is not a full driver database replacement.
- Safe one-family-at-a-time order: companies CRM identity/domain typed API is done; travelers CRM identity/default-address typed API is done; company/traveler CRM write-readiness setup foundation/API, disabled action API, audit payload setup foundation, and no-live guard are done; driver assignment/display typed API and booking assignment display wiring are done as a separate safe read; next full driver profile write/delete replacement remains parked until payout preferences, driver payout rules, notes, preferred areas, and airport permit notes are excluded or approval-gated; fourth `rate_settings` default-rate save; fifth company/traveler rate override writes; sixth driver payout rules/preferences.
- Risk requiring explicit approval: `customer_rates`, `driver_payout_rules`, pricing, payout, driver payout preferences, PayNow/payout-adjacent fields, and any customer/driver-visible finance exposure.
- Rule: no new shims. Replace remaining shim usage only with typed helpers, typed API routes, and direct contract tests.
- Shim cleanup no-new-shim guard is done.

### Companies/travelers legacy allowlist blocker lock
- `companies` and `travelers` cannot be removed from the `admin-legacy-data` allowlist yet.
- Typed companies API covers only safe read fields: `id`, `company_name`, and `domain`.
- Typed travelers API covers only identity/default-address display fields.
- `app/page.tsx` still uses legacy `companies` and `travelers` paths for create/update/name-memory behavior.
- Rate override writes still depend on legacy `companies` and `travelers` and touch `customer_rates` / `driver_payout_rules`.
- Next safe split is separate typed company/traveler CRM create/update/name-memory APIs, excluding rate/payout override writes.
- `customer_rates`, `driver_payout_rules`, pricing, and payout remain parked until explicit approval.

### Company/traveler CRM write pre-activation completion audit lock
- Company/traveler CRM write path is complete up to the activation stop.
- Write-readiness foundation is done.
- Preview/readiness API is done.
- Disabled write action API is done.
- Action audit payload setup foundation is done.
- Company/traveler CRM write no-live guard is done.
- Company/traveler create/update/name-memory writes remain blocked until explicit approval.
- `customer_rates`, `driver_payout_rules`, pricing, payout, and rate override writes remain parked.
- Legacy allowlist removal remains blocked until write paths are safely split and explicitly approved.

### Company/traveler CRM write-readiness setup lock
- Setup-only typed helper is done at `32ca2ca Add company traveler CRM write readiness setup`.
- GET-only admin-gated preview/readiness API is done at `d19ee37 Add company traveler CRM write readiness preview API`.
- GET-only admin-gated disabled/no-op action API is done at `d8b5d49 Add disabled company traveler CRM write action API`.
- Setup-only action audit payload foundation is done at `42e5aa0 Add company traveler CRM write audit payload setup`.
- Company/traveler CRM write no-live guard is done at `b3dab3c Add company traveler CRM write no-live guard`.
- It prepares future company/traveler CRM create/update/name-memory action readiness only.
- It always returns `actionEnabled false`, `writeEnabled false`, `liveWriteEnabled false`, `adminReviewRequired true`, `companyCreateEnabled false`, `companyUpdateEnabled false`, `travelerCreateEnabled false`, `travelerUpdateEnabled false`, `nameMemoryWriteEnabled false`, and `auditWriteEnabled false` where audit payloads apply.
- It excludes `customer_rates`, `driver_payout_rules`, pricing, payout, rate overrides, payment, and billing.
- No UI, live DB/write, provider/env, payment/PDF/payout, or package change is active from this foundation/API.

### Rate settings shim risk lock
- `rate_settings` touches `customer_rates`, `driver_payout_rules`, customer surcharges, and driver payout fields.
- Those fields feed `resolvePricing` and booking save price/payout snapshots.
- Safe read-only rate setup already exists through `GET /api/admin-rate-setup`.
- Unsafe remaining `rate_settings` family is default-rate save/upsert.
- Do not replace `saveDefaultRates` or the `rate_settings` write path without explicit approval.
- Do not touch company/traveler overrides, pricing, payout, `customer_rates`, or `driver_payout_rules` in the same pass.

### Full driver profile shim risk lock
- Full driver profile shim replacement is payout/internal-field entangled.
- `loadDrivers` reads `payout_preferences`, `driver_payout_rules`, `notes`, `preferred_areas`, and `airport_permit_notes`.
- `saveDriverProfile` writes `payout_preferences` and `driver_payout_rules`.
- Editable driver profile UI includes payout inputs.
- Legacy `drivers` route still includes payout/internal-note-adjacent fields.
- Safe driver assignment/display typed API already exists.
- Full driver profile write/delete path must stay parked until explicit split/gating approval.

### Driver assignment display typed API wiring lock
- Driver assignment display wiring is done at `924fbe4 Wire driver assignment display to typed API`.
- Booking driver assignment display now uses the existing typed display-only `GET /api/admin-driver-assignment-display` API/helper through separate display-only state/loader.
- Full driver profile read/save/delete shim remains parked.
- No payout/rate/profile save-delete changes were made.
- No Save Booking + CRM payload change was made; it remains on the safe `/api/admin-bookings` operational payload.
- No new shims were added.
- Excluded fields remain parked: `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, and `airport_permit_notes`.
- Checks passed for the implementation: admin driver assignment display API contract, shim cleanup guard, core booking safe-path guard, preactivation suite, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.
- Full driver profile write/delete and payout fields remain parked until explicit split/gating approval.

### Notifications
- Admin app notifications API.
- Customer app notifications API.
- Customer-driver app notifications API.
- Driver job notifications API.
- Telegram disabled adapter foundation.
- Telegram internal admin alert setup foundation.
- Telegram internal admin alert preview/readiness setup API.
- Disabled Telegram internal admin alert send setup API.
- Telegram internal admin alert send audit payload setup foundation.
- Telegram no-live guard.
- WhatsApp disabled adapter foundation.
- WhatsApp customer driver details setup foundation.
- WhatsApp customer driver details preview/readiness setup API.
- Disabled WhatsApp customer driver details send setup API.
- WhatsApp customer driver details send audit payload setup foundation.
- WhatsApp customer driver details no-live guard.
- SMS customer driver details setup foundation.
- SMS customer driver details preview/readiness setup API.
- Disabled SMS customer driver details send setup API.
- SMS customer driver details send audit payload setup foundation.
- SMS customer driver details no-live guard.
- Secure customer driver details link setup foundation, preview/readiness setup API, disabled access setup API, access audit payload setup foundation, and no-live guard.
- Disabled email send adapter setup foundation.
- Email notification setup foundation.
- Email sender selection setup foundation.
- Email recipient safety setup foundation.
- Email send policy setup foundation.
- Email provider readiness setup foundation.
- Email provider readiness setup API.
- Email provider selection setup foundation.
- Email provider selection setup API.
- Email activation preflight setup API.
- App smoke email activation preflight setup-only allowlist.
- Email no-live guard.
- Customer driver details email setup foundation.
- Customer driver details email readiness setup foundation.
- Customer driver details email preview/readiness setup API.
- Disabled customer driver details email send setup API.
- Customer driver details email send audit payload setup foundation.
- Driver ack customer message handoff setup foundation.
- Driver ack customer message handoff setup API.
- Customer driver details email review item setup API.
- Customer Copy customer driver details email review UI, disabled-send button, email activation preflight status UI, compact Email/WhatsApp/SMS disabled-send buttons row/layout fix, and multi-channel no-live guard.
- No real sending active.

### Live location
- Live location setup foundation.
- Live location window policy setup foundation.
- `/api/admin-live-location-setup`.
- `/api/admin-live-location-window-policy-preview-readiness-setup`.
- `/api/admin-live-location-access-capture-disabled-setup`.
- Live location no-live guard.
- Setup-only. No real GPS/map/tracking.

### OTS photo proof
- OTS photo proof setup foundation with disabled upload/storage/viewer/customer access flags.
- `/api/admin-ots-photo-proof-setup`.
- `/api/admin-ots-photo-proof-preview-readiness-setup`.
- `/api/admin-ots-photo-proof-access-upload-disabled-setup`.
- OTS photo proof access/upload audit payload setup foundation.
- OTS photo proof no-live guard.
- Setup-only. No camera/upload/storage.

### Flight ETA / MNG Arrival
- Flight API setup foundation.
- `/api/admin-flight-api-setup`.
- `/api/driver-job/[token]/flight-eta-setup`.
- Driver flight ETA notification setup foundation.
- `/api/admin-driver-flight-eta-notification-setup`.
- Driver ETA acknowledgement setup foundation.
- `/api/driver-job/[token]/flight-eta-acknowledgement-setup`.
- Resend/escalation rule recorded: after 2 no-ack attempts, escalate admin to get replacement driver.
- Admin ETA escalation setup foundation.
- `/api/admin-driver-flight-eta-escalation-setup`.
- ETA reminder timing setup foundation.
- `/api/admin-driver-flight-eta-reminder-timing-setup`.
- ETA notification payload setup helper.
- `/api/admin-driver-flight-eta-notification-payload-setup`.
- Flight provider selection setup foundation.
- `/api/admin-flight-provider-selection-setup`.
- Future flight provider recorded: FlightAware AeroAPI, setup-only/disabled.
- Driver flight ETA live readiness setup foundation.
- Flight ETA result normalization setup foundation.
- Flight ETA comparison/update setup foundation.

## Not Live / Not Implemented

- Real flight provider activation.
- External flight API call.
- Provider token/env.
- Live ETA lookup.
- Real driver ETA notification sending.
- Real resend automation.
- Real admin escalation alert.
- Real Telegram/WhatsApp/email/SMS/push sending.
- Real customer driver-details link token issuance/access.
- Real GPS/live map.
- Real OTS photo upload/storage.
- Supabase Storage bucket/policies, admin viewer, customer visibility, and auth/live access.
- Customer/driver auth activation.
- Invoice PDF generation.
- Payment links.
- Invoice sending.
- Payout automation.
- Production auto-billing activation.
- Production deployment activation.
- Real customer amendment/cancellation booking writes, CRM updates, calendar sync/update/cancel, customer auth, notification sends, job-card creation, or live booking updates.
- Remaining risky shim cleanup for companies/travelers/rate_settings/full drivers.

## Current Flight ETA Rule

- MNG / Arrival only.
- Admin + driver only.
- Customer disabled by default.
- Future purpose: notify driver latest ETA 1 hour before pickup so driver does not miss arrival flight.
- If driver does not acknowledge, resend later.
- After 2 no-ack attempts, alert admin to get replacement driver.
- Current state is setup-only; no live sending or external API.
