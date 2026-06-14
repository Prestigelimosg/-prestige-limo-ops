# Prestige Limo Ops — Current Implementation Ledger

Latest known clean checkpoint:
f743df2 Add calendar event lifecycle audit payload setup

Purpose:
This file is the repo source of truth for Codex and future work. Inspect this file before adding new UI, API, helper, test, or docs.

## Next GPT Lock / Uncompleted Backlog

- Latest repo commit to preserve as handoff baseline: `f743df2 Add calendar event lifecycle audit payload setup`.
- Latest implementation checkpoint to preserve: `f743df2 Add calendar event lifecycle audit payload setup`.
- Completed foundations/APIs/UI not to repeat: Flight ETA setup-only chain, email setup-only chain, Telegram disabled/internal admin alert setup foundations, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, WhatsApp customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, SMS customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, secure customer driver-details link setup foundation, preview/readiness API, disabled access API, access audit payload setup, and no-live guard, email no-live guard, customer driver details email preview/readiness API, disabled customer driver details email send API, customer driver details email send audit payload setup foundation, customer driver details email review item API, Customer Copy customer driver details email review UI, disabled-send button, email activation preflight status UI, WhatsApp/SMS disabled-send UI, compact multi-channel buttons row/layout fix, admin dashboard horizontal overflow fix, and multi-channel no-live guard, Dispatch pricing/review/OneMap section reorder, Save Booking + CRM button placement near Job Card Preview actions, Save Booking duplicate-submit guard, separated Save Booking + CRM and calendar actions, calendar event lifecycle readiness setup foundation/API, disabled action API, and action audit payload setup foundation, customer amendment/cancellation review handoff setup foundation/API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, live location window policy setup foundation/API, disabled access/capture API, and no-live guard, OTS photo proof setup foundation, preview/readiness API, disabled access/upload API, audit payload setup foundation, and no-live guard, customer/driver auth readiness setup foundation/API, disabled access API, access audit payload setup foundation, no-live guard, and pre-activation audit lock, billing/payment readiness setup foundation, preview API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, production deployment hardening readiness setup foundation/API, disabled action API, action audit payload setup foundation, and no-live guard, shim cleanup typed API inventory, shim cleanup no-new-shim guard, companies CRM identity/domain typed helper/API, travelers CRM identity/default-address typed helper/API, company/traveler CRM write-readiness setup foundation/API, disabled action API, audit payload setup foundation, no-live guard, and pre-activation audit lock, driver assignment/display typed helper/API, email provider readiness setup foundation/API, email provider selection setup foundation/API, email activation preflight setup API, app smoke email preflight setup-only allowlist, driver ack customer message handoff setup foundation/API, ledger guards.
- Uncompleted backlog: provider activation/live sending later; Telegram/WhatsApp activation; FlightAware live; live location activation; OTS photo activation; customer/driver auth activation; billing/payment activation; shim cleanup; production.
- Rules: no duplicate work, no new shims, no unnecessary UI/giant cards, no live risky features without approval.

## Master Pre-Activation Completion Audit Lock

- Complete up to activation stop: Customer Copy Email/WhatsApp/SMS driver-details messaging; secure customer driver-details link; Telegram internal admin alerts; live location; OTS photo proof; customer/driver auth; billing/payment; customer amendment/cancellation review flow; company/traveler CRM write-blocked readiness; production hardening.
- Production hardening status: readiness foundation, preview/readiness API, disabled production action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock are done.
- Shim cleanup status: inventory and no-new-shim guard are done; companies CRM identity/domain typed API and travelers CRM identity/default-address typed API are done; company/traveler CRM write setup is locked through the activation stop; risky full-driver profile write/delete, `rate_settings` save/upsert, pricing, payout, `customer_rates`, and `driver_payout_rules` write paths remain parked.
- Still blocked unless explicitly approved: live DB/write, migrations, deployment, provider/env activation, external APIs, live sending, payment/PDF/payout, auth activation, live location activation, photo upload/storage, CRM/calendar amendment updates, job-card creation from customer amendments, and risky shim write paths.
- Continue to use setup-only helpers/APIs and direct guards. Do not add new shims, duplicate UI/API/helper work, live provider behavior, or customer/driver-visible finance/internal details.

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

## Calendar Event Lifecycle Readiness Setup/API Lock

- Calendar event lifecycle readiness setup foundation is done at `faede95 Add calendar event lifecycle readiness setup`.
- GET-only admin-gated preview/readiness API is done at `b77b33f Add calendar event lifecycle preview readiness API`.
- GET-only admin-gated disabled action API is done at `88f1db2 Add disabled calendar event lifecycle action API`.
- Action audit payload setup foundation is done at `f743df2 Add calendar event lifecycle audit payload setup`.
- It prepares future create calendar event for confirmed booking, update existing calendar event after admin-approved amendment, and cancel existing calendar event after admin-approved cancellation.
- It returns `calendarCreateEnabled false`, `calendarUpdateEnabled false`, `calendarCancelEnabled false`, `liveCalendarSyncEnabled false`, `external_calendar false`, and `adminApprovalRequired true`.
- Audit payload setup returns `auditWriteEnabled false` and `blocked/no-op` result metadata only.
- Customer amendment/cancellation must never auto-update calendar.
- Calendar update/cancel only happens after admin approval.
- Disabled action API returns `status blocked` and `blocked/no-op`; no POST/write/DB/calendar provider/env/live calendar sync/package/shim/payment behavior is active from this setup/API.

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
- Existing typed replacements: `admin-bookers` and `admin-saved-addresses` are retired from the shim; `admin-companies-crm-identity` covers read-only companies id/company_name/domain lookup without rate/payout fields; `admin-travelers-crm-identity` covers read-only travelers id/company_id/name/contact/default-address/saved-address display lookup without rate/payout fields; `admin-company-traveler-crm-write-readiness-setup-foundation`, `GET /api/admin-company-traveler-crm-write-readiness-preview-setup`, `GET /api/admin-company-traveler-crm-write-action-disabled-setup`, and `admin-company-traveler-crm-write-action-audit-payload-setup-foundation` cover setup-only blocked readiness/no-op action/audit payload results for future company/traveler CRM create/update/name-memory actions without rate/payout override fields, and `test-admin-company-traveler-crm-write-no-live-guard` guards the chain against live activation; `admin-driver-assignment-display` covers read-only driver id/name/contact/vehicle/plate/availability assignment/display lookup without payout/rate/pricing/billing/internal-note fields and is not wired into the editable full driver profile save/delete path; `admin-customer-name-memory` covers narrow read-only company/traveler/address memory; `admin-rate-setup` covers read-only rate settings/company/traveler rate setup; `admin-driver-availability` covers availability-only driver PATCH; saved booking driver assignment has its own typed path and is not a full driver database replacement.
- Safe one-family-at-a-time order: companies CRM identity/domain typed API is done; travelers CRM identity/default-address typed API is done; company/traveler CRM write-readiness setup foundation/API, disabled action API, audit payload setup foundation, and no-live guard are done; driver assignment/display typed API is done as a separate safe read; next full driver profile write/delete replacement remains parked until payout preferences, driver payout rules, notes, preferred areas, and airport permit notes are excluded or approval-gated; fourth `rate_settings` default-rate save; fifth company/traveler rate override writes; sixth driver payout rules/preferences.
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

### Driver assignment display typed API wiring blocker lock
- Safe driver assignment/display typed API already exists.
- Wiring it into `app/page.tsx` is not safe yet.
- `loadDrivers` still loads full driver profile fields including `payout_preferences`, `driver_payout_rules`, `notes`, `preferred_areas`, and `airport_permit_notes`.
- `draftPricing` and Save Booking use shared full `drivers` state for pricing and payout snapshots.
- Saved-booking driver assignment uses selected driver payout rules.
- Current booking driver selection copies driver notes into the form.
- Next safe split requires separate display-only driver assignment state/loader from payout-aware driver profile state.
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
