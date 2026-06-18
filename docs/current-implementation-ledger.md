# Prestige Limo Ops — Current Implementation Ledger

Latest verified clean checkpoint before this public customer portal saved-booking surface staging smoke record:
fa3ccf0 Guard public customer portal saved-booking surface

Latest staging-smoked app checkpoint:
fa3ccf0 Guard public customer portal saved-booking surface

Purpose:
This file is the repo source of truth for Codex and future work. Inspect this file before adding new UI, API, helper, test, or docs.

## Next GPT Lock / Uncompleted Backlog

- Last verified repo checkpoint before this public customer portal saved-booking surface staging smoke record: `fa3ccf0 Guard public customer portal saved-booking surface`.
- Latest implementation checkpoint to preserve: `fa3ccf0 Guard public customer portal saved-booking surface`; `origin/staging` points to `fa3ccf0a75358e4f1d05d8ce0f17634ba51a806e`.
- Recent forward activation-readiness locks already completed and smoked; do not repeat them: rate settings scalar activation readiness `331f854` plus smoke record `f1d6b07`, customer rates activation readiness `d4d22e3` plus smoke record `c6619c7`, driver payout rules activation readiness `49039b9` plus smoke record `59e69c6`, full driver profile activation readiness `566fdba` plus smoke record `98cb731`, and company/traveler CRM runtime write activation readiness `dea22b3` plus smoke record `d070ad6`.
- Next forward lane after this staging smoke record: choose the next bounded docs/test-only/read-only preactivation hardening guard after reading the ledger and current code; do not perform endpoint migration, env change, DB write, provider send, migration, parser change, Save Booking change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector addition, or new shim without separate approval.
- Completed foundations/APIs/UI not to repeat: Flight ETA setup-only chain, email setup-only chain, Telegram disabled/internal admin alert setup foundations, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, WhatsApp customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, SMS customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, secure customer driver-details link setup foundation, preview/readiness API, disabled access API, access audit payload setup, and no-live guard, email no-live guard, customer driver details email preview/readiness API, disabled customer driver details email send API, customer driver details email send audit payload setup foundation, customer driver details email review item API, Customer Copy customer driver details email review UI, disabled-send button, email activation preflight status UI, WhatsApp/SMS disabled-send UI, compact multi-channel buttons row/layout fix, admin dashboard horizontal overflow fix, and multi-channel no-live guard, Dispatch pricing/review/OneMap section reorder, Save Booking + CRM button placement near Job Card Preview actions, Save Booking duplicate-submit guard, separated Save Booking + CRM and calendar actions, Save Booking + CRM safe admin booking persistence reroute, disabled admin booking read/list/detail contract setup and no-live guard, unused legacy bookings shim surface retirement, booking UI browser test stabilization, calendar event lifecycle readiness setup foundation/API, disabled action API, action audit payload setup foundation, and no-live guard, customer amendment/cancellation review handoff setup foundation/API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, live location window policy setup foundation/API, disabled access/capture API, and no-live guard, OTS photo proof setup foundation, preview/readiness API, disabled access/upload API, audit payload setup foundation, and no-live guard, customer/driver auth readiness setup foundation/API, disabled access API, access audit payload setup foundation, no-live guard, and pre-activation audit lock, billing/payment readiness setup foundation, preview API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, production deployment hardening readiness setup foundation/API, disabled action API, action audit payload setup foundation, and no-live guard, staging deployment approval packet and guard, core admin booking persistence activation readiness packet, guard, safe path guard, and Save Booking + CRM safe reroute, global pre-activation no-live guard, activation decision matrix guard, pre-activation verification suite, shim cleanup typed API inventory, shim cleanup no-new-shim guard, companies CRM identity/domain typed helper/API and typed display wiring, travelers CRM identity/default-address typed helper/API and typed display wiring, company/traveler CRM write-readiness setup foundation/API, disabled action API, audit payload setup foundation, no-live guard, and pre-activation audit lock, driver assignment/display typed helper/API and booking assignment display wiring, email provider readiness setup foundation/API, email provider selection setup foundation/API, email activation preflight setup API, app smoke email preflight setup-only allowlist, driver ack customer message handoff setup foundation/API, ledger guards.
- Uncompleted backlog: provider activation/live sending later; Telegram/WhatsApp activation; FlightAware live; live location activation; OTS photo activation; customer/driver auth activation; billing/payment activation; shim cleanup; production.
- Rules: no duplicate work, no new shims, no unnecessary UI/giant cards, no live risky features without approval.

## Master Pre-Activation Completion Audit Lock

- Full app is complete up to the activation stop across: Customer Copy Email/WhatsApp/SMS driver-details messaging; secure customer driver-details link; Telegram internal admin alerts; Flight ETA setup-only chain; live location; OTS photo proof; customer/driver auth; billing/payment; customer amendment/cancellation review flow; calendar event lifecycle; company/traveler CRM write-blocked readiness; production hardening; core admin booking persistence activation readiness packet; shim cleanup guards and parked risky write paths; global pre-activation no-live guard.
- Global pre-activation no-live guard is done at `e381e3e Add global pre-activation no-live guard`; it coordinates the completed module guards, shim cleanup guard, setup route GET-only checks, and master ledger approval/block wording.
- Activation decision matrix guard is done at `702ec53 Add activation decision matrix guard`; it keeps the matrix rows and explicit approval requirements locked.
- Pre-activation verification suite is done at `da21fb5 Add pre-activation verification suite` and now includes `4382cdf Add staging deployment approval packet guard`, `96c4e7a Add core booking persistence activation packet guard`, `4045c0a Add core booking persistence safe path guard`, `6214484 Add disabled admin booking read contract setup`, and `e438e0c Add admin booking read no-live guard`; it fail-fast runs the global guard, activation matrix guard, staging deployment approval packet guard, core admin booking persistence activation packet guard, core booking persistence safe path guard, channel/module no-live guards, production hardening guard, disabled admin booking read contract setup check, admin booking read no-live guard, and shim cleanup guard.
- Booking UI browser stabilization is done at `4b7a1ab Stabilize booking UI browser test`; stale browser expectations/mocks were aligned to the current Customer Copy setup-only routes, separated Save Booking + CRM and Create Calendar Event flow, typed traveler identity read, and saved-address mock path.
- Disabled admin booking read/list/detail contract setup is done at `6214484 Add disabled admin booking read contract setup`; the dedicated no-live guard is done at `e438e0c Add admin booking read no-live guard`; it remains setup-only, disabled/no-live-read/no-op, is registered in the preactivation verification suite, and has no Load Bookings or `app/page.tsx` runtime wiring.
- Driver job link GET validation is fixed at `43c5970 Fix driver job link GET validation`; GET/read for `/api/admin-driver-job-links` now accepts safe dashboard-style booking refs without noisy 400s while POST create, PATCH revoke, and token creation/revocation behavior remain unchanged.
- Calendar event lifecycle status: readiness foundation, preview/readiness API, disabled action API, action audit payload setup foundation, no-live guard, and final pre-activation lock are done; customer amendment/cancellation never auto-updates calendar; calendar create/update/cancel remains blocked until explicit approval.
- Production hardening status: readiness foundation, preview/readiness API, disabled production action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock are done.
- Shim cleanup status: inventory and no-new-shim guard are done; companies CRM identity/domain typed API and travelers CRM identity/default-address typed API are done and wired into company/traveler display-read at `69c269d Wire company traveler identity display to typed APIs`; unused legacy bookings shim surface is retired; driver assignment display now uses the existing typed display-only API for the booking assignment display path; Driver Database display/search now uses separate typed display-only state fed by the existing `/api/admin-driver-assignment-display` route; company/traveler CRM write setup is locked through the activation stop; CRM identity/contact payload code is split from rate override payload code at `d65aac1 Split CRM identity payload from rate override payload`, the rate separation boundary is finished at `fb2e9ca Finish CRM write rate separation boundary`, the disabled CRM identity/contact write action API is done at `3cfd0a2 Add disabled CRM identity write action API`, the disabled/no-write typed `rate_settings` write action setup is done at `945e894 Add disabled rate settings write action setup`, the setup-only disabled/no-write full driver profile action boundary is done at `9ebaf97 Add disabled full driver profile action setup`, the disabled/no-write full driver profile audit payload setup is done at `0f25461 Add disabled full driver profile audit payload setup`, and the dedicated full driver profile no-live guard is done at `c9b1681 Add full driver profile no-live guard`; customer_rates and `driver_payout_rules` now have gated app boundaries with live DB writes closed by default; risky full-driver profile write/delete runtime paths, real `rate_settings` save/upsert, broader pricing, and broader payout surfaces remain parked.
- Still blocked unless explicitly approved: live DB/write, migrations, deployment, provider/env activation, external APIs, live sending, payment/PDF/payout, auth activation, FlightAware live lookup, live location activation, photo upload/storage, CRM/calendar amendment updates, calendar event lifecycle create/update/cancel and live sync, job-card creation from customer amendments, and risky shim write paths.
- Continue to use setup-only helpers/APIs and direct guards. Do not add new shims, duplicate UI/API/helper work, live provider behavior, or customer/driver-visible finance/internal details.

## Admin Route Flow Lock

- Current route-flow map is locked by `scripts/test-admin-route-flow-lock.mjs`.
- Save Booking + CRM uses `POST /api/admin-bookings` with `x-prestige-admin-purpose=admin-booking-persistence`.
- Save Booking + CRM does not POST to `/api/admin-saved-bookings`.
- Load Bookings legacy read remains separate at `GET /api/admin-saved-bookings`.
- Disabled typed admin booking read/list/detail contract setup exists at `GET /api/admin-booking-read-contract-disabled-setup`; Load Bookings runtime wiring is not active.
- Create Calendar Event builds an ICS/calendar payload only; no external calendar sync is active.
- Driver assignment display uses `GET /api/admin-driver-assignment-display`.
- Driver Database display/search uses typed display-only state.
- Full driver profile save/delete remains parked on the legacy `drivers` shim path.
- Remaining legacy shim families are only `companies`, `travelers`, `drivers`, and `rate_settings`.
- Driver job link creation uses `/api/admin-driver-job-links` and creates `/driver-job/{token}`.
- Customer driver-details send buttons remain disabled/setup-only.
- Provider/live sending, payment/PDF/payout, auth, location, photo, calendar activation, and risky shim writes remain blocked.
- Expected 503 gated families remain documented: admin booking persistence when `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` is closed or Supabase config is missing; legacy admin data when Supabase config is missing; driver job production mode when `PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED` is not open/configured; customer booking intake when persistence is not enabled/configured; monthly billing/invoice/closeout/notification persistence when server gates are closed.
- `/api/admin-driver-job-links` GET/read accepts safe dashboard-style booking refs without noisy 400s; unsafe/malformed read refs still reject safely.
- `/api/admin-driver-job-links` current safe 400 reasons remain documented: malformed create payload, unsafe/malformed read booking reference/status/limit/page, malformed revoke payload, and unsupported unsafe link fields.

### Disabled Admin Booking Read Contract Setup Lock
- Setup-only/disabled typed admin booking read/list/detail contract boundary is done at `6214484 Add disabled admin booking read contract setup`.
- Dedicated static admin booking read no-live guard is done at `e438e0c Add admin booking read no-live guard`.
- New setup route: `app/api/admin-booking-read-contract-disabled-setup/route.ts`.
- New helper: `lib/admin-booking-read-contract-disabled-setup.ts`.
- GET-only setup route validates safe future read fields and remains disabled/no-live-read/no-op.
- It rejects pricing, payout, payment, provider/send, auth, location, photo, calendar, internal/admin notes, debug, and secret fields.
- It is registered in the preactivation verification suite.
- Guard is registered in the preactivation verification suite.
- Guard verifies setup-only/disabled/no-live-read/no-op status.
- Guard verifies no `app/page.tsx` or Load Bookings runtime wiring.
- Guard verifies no Supabase, `adminLegacyDataClient`, or DB read/write path.
- Guard verifies no parser or `/api/ai-parse` change.
- Guard verifies no Save Booking + CRM change.
- Guard verifies no `/api/admin-saved-bookings` change.
- Guard verifies no new shims.
- Guard verifies forbidden fields remain parked: pricing, payout, `customer_rates`, `driver_payout_rules`, rate overrides, payment, PDF, billing, provider/send, auth, location, photo, calendar, internal/admin notes, debug, and secrets.
- No Load Bookings runtime wiring was added.
- No `app/page.tsx` runtime wiring was added.
- Save Booking + CRM is unchanged and remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` is unchanged and remains separate.
- Parser behavior and `/api/ai-parse` are unchanged.
- It does not call Supabase.
- It does not call `adminLegacyDataClient`.
- It does not execute any DB read/write path.
- No UI sectors, buttons, or cards were added.
- No new shims were added.
- Checks passed for the implementation: `node scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-core-booking-persistence-safe-path-guard.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, `git diff --cached --check`, and `git status --short`.
- Checks passed for the no-live guard: `node scripts/test-admin-booking-read-no-live-guard.mjs`, `node scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-core-booking-persistence-safe-path-guard.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, `git diff --cached --check`, and `git status --short`.
- Note: the first booking UI browser run during the no-live guard pass hit an unrelated timing timeout; rerun passed cleanly.

### Load Bookings Typed Read Migration Plan Lock
- Future typed Load Bookings read/list/detail migration is planned only; no runtime implementation is approved by this lock.
- Current Load Bookings runtime wiring remains unchanged and stays on the existing legacy read surface.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Save Booking + CRM is unchanged and remains on `POST /api/admin-bookings`.
- Existing disabled admin booking read/list/detail contract remains setup-only/no-live-read/no-op at `GET /api/admin-booking-read-contract-disabled-setup`.
- Future typed Load Bookings migration must be read/list/detail only.
- Future typed read must exclude pricing, payout, `customer_rates`, `driver_payout_rules`, rate overrides, payment, PDF, billing, provider/send, auth, location, photo, calendar, internal/admin notes, debug, and secrets.
- Future implementation must not change Save Booking + CRM.
- Future implementation must not activate DB read/write without separate explicit approval.
- Required tests before any runtime wiring: typed read contract test, no-live read guard, Load Bookings route-flow guard, forbidden-field exclusion guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, and no-new-shim guard.
- Rollback note: keep Load Bookings on the existing legacy read surface until a typed read path is separately approved and verified.
- No UI/API/helper behavior change, `app/page.tsx` Load Bookings wiring, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, Supabase key use, `adminLegacyDataClient` behavior change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, UI sector/card, or new shim is approved by this lock.

### Load Bookings Runtime Wiring Approval Packet
- Approval status: pending future runtime-wiring approval.
- This packet does not approve runtime wiring.
- Current Load Bookings runtime remains on `/api/admin-saved-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Existing typed admin booking read/list/detail contract remains setup-only/disabled/no-live-read/no-op.
- Future runtime wiring may only be read/list/detail.
- Future runtime wiring must exclude pricing, payout, `customer_rates`, `driver_payout_rules`, rate overrides, payment, PDF, billing, provider/send, auth, location, photo, calendar, internal/admin notes, debug, and secrets.
- Future wiring must not change Save Booking + CRM.
- Future wiring must not change `/api/admin-saved-bookings` behavior.
- Future wiring must not touch parser or `/api/ai-parse`.
- Future wiring must not add UI sectors/buttons/cards.
- Future wiring must not add new shims.
- Future live DB read activation requires separate approval and gate/env verification.
- Required future tests before runtime wiring: typed read contract test, no-live read guard, Load Bookings route-flow guard, forbidden-field exclusion guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, and booking UI browser test.
- Rollback note: keep Load Bookings on existing legacy read surface until typed read path is separately approved, tested, and verified.
- No runtime implementation, `app/page.tsx` Load Bookings wiring, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, Supabase key use, `adminLegacyDataClient` behavior change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, UI sector/button/card, or new shim is approved by this packet.

### Load Bookings Typed DTO Split Plan Lock
- Future typed Load Bookings DTO split is planned only; no runtime implementation is approved by this lock.
- Current Load Bookings runtime remains on `GET /api/admin-saved-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Existing disabled admin booking read/list/detail contract remains setup-only/no-live-read/no-op.
- Future typed Load Bookings DTO must include safe operational read fields only: booking id/reference/status, booking type, vehicle/service display, pickup/dropoff datetime/address, route summary/route points summary, pax/job card display, customer/company/booker/traveler display fields, booker email/phone, assigned driver display only if non-payout, child seat/extra stop display only if non-price, created_at/updated_at, and audit summary.
- Future typed DTO must exclude pricing, payout, `customer_rate`, `customer_price_amount`, `customer_rate_override`, `customer_price_override_reason`, `customer_rates`, `driver_payout_rules`, `driver_payout_min/max/amount/override/reason/unit`, `driver_notes`, `driver_dispatch_include_payout`, midnight_surcharge/payout, extra_stop_surcharge/payout, child_seat_customer_surcharge/driver_payout, `pricing_source`, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- Future wiring must not be a blind endpoint swap.
- Future wiring needs an adapter/DTO layer or safe cards that do not require finance/payout fields.
- Existing legacy finance/payout-aware card behavior must remain parked until separate finance approval.
- Required future tests before runtime wiring: typed DTO contract test, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, and focused UI mapping test proving typed Load Bookings no longer depends on risky fields.
- Rollback note: keep Load Bookings on `/api/admin-saved-bookings` until typed DTO runtime wiring is separately approved and verified.
- No UI/API/helper behavior change, `app/page.tsx` Load Bookings wiring, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, Supabase key use, `adminLegacyDataClient` behavior change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, UI sector/button/card, or new shim is approved by this lock.

### Load Bookings Safe DTO Contract Setup Lock
- Load Bookings safe DTO contract setup is done for future read/list/detail migration preparation only.
- New setup-only helper: `lib/admin-load-bookings-safe-dto-contract.ts`.
- New guard: `scripts/test-load-bookings-safe-dto-contract.mjs`.
- Dedicated no-live guard: `scripts/test-load-bookings-safe-dto-no-live-guard.mjs`.
- The guard is registered in `scripts/test-preactivation-verification-suite.mjs`.
- The no-live guard is registered in `scripts/test-preactivation-verification-suite.mjs`.
- The helper validates a future safe operational Load Bookings read/list/detail DTO shape only.
- Safe DTO fields are limited to booking id/reference/status, booking type, vehicle/service display, pickup/dropoff datetime/address, route summary/route points summary, pax/job card display, customer/company/booker/traveler display fields, booker email/phone, assigned driver display/contact/vehicle fields only if non-payout, child seat/extra stop display only if non-price, created_at/updated_at, and audit summary.
- Forbidden fields remain rejected/excluded: pricing, payout, `customer_rate`, `customer_price_amount`, `customer_rate_override`, `customer_price_override_reason`, `customer_rates`, `driver_payout_rules`, `driver_payout_min/max/amount/override/reason/unit`, `driver_notes`, `driver_dispatch_include_payout`, midnight_surcharge/payout, extra_stop_surcharge/payout, child_seat_customer_surcharge/driver_payout, `pricing_source`, rate overrides, payment, PDF, billing, provider/send, auth, live location, photo, calendar, internal/admin notes, debug, and secrets.
- The helper remains setup-only, disabled/no-live-read/no-op, and does not create a route or runtime surface.
- No Load Bookings runtime wiring was added.
- Current Load Bookings runtime remains on `GET /api/admin-saved-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Parser behavior and `/api/ai-parse` are unchanged.
- The helper does not call Supabase, `adminLegacyDataClient`, or any DB read/write path.
- The no-live guard verifies no `app/page.tsx` runtime wiring, no Load Bookings endpoint change, no Save Booking + CRM change, no `/api/admin-saved-bookings` change, no parser or `/api/ai-parse` change, no Supabase, no `adminLegacyDataClient`, no DB read/write path, no UI sectors/buttons/cards, and no new shims.
- No UI sectors, buttons, or cards were added.
- No new shims were added.
- Checks passed for the implementation and no-live guard: `node scripts/test-load-bookings-safe-dto-contract.mjs`, `node scripts/test-load-bookings-safe-dto-no-live-guard.mjs`, `node scripts/test-load-bookings-typed-dto-split-plan.mjs`, `node scripts/test-load-bookings-runtime-wiring-approval-packet.mjs`, `node scripts/test-load-bookings-typed-read-migration-plan.mjs`, `node scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs`, `node scripts/test-admin-booking-read-no-live-guard.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-core-booking-persistence-safe-path-guard.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.

### Load Bookings Runtime Wiring Blocker Lock
- Runtime wiring to the safe DTO is blocked for now.
- Current Load Bookings runtime remains on `GET /api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Reason: current `BookingRecord` and parked action/finance UI paths still consume risky legacy finance/payout/internal fields.
- Current risky dependencies include `customer_rate`, `customer_price_amount`, `customer_rate_override`, `customer_price_override_reason`, `driver_payout_min/max/amount/override/reason/unit`, `driver_notes`, `driver_dispatch_include_payout`, midnight_surcharge/payout, extra_stop_surcharge/payout, child_seat_customer_surcharge/driver_payout, and `pricing_source`.
- Stage 1 operational display cards no longer call `bookingCardPriceLine`.
- `bookingCardPriceLine`, `bookingRecordToForm`, driver dispatch copy, driver assignment controls, and billing readiness paths remain parked and must not be fed by the safe DTO.
- Future typed Load Bookings endpoint migration still requires separate approval and must use the safe operational UI adapter/card path.
- Future safe UI adapter must exclude pricing, payout, `customer_rates`, `driver_payout_rules`, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- Existing legacy finance/payout-aware UI behavior remains parked until separate finance/payout approval.
- Rollback note: keep Load Bookings on `GET /api/admin-saved-bookings` until safe UI adapter and typed read path are separately approved and verified.
- This lock adds `scripts/test-load-bookings-runtime-wiring-blocker.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No typed endpoint migration, Save Booking + CRM change, `/api/admin-saved-bookings` route/helper change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, Supabase key use, `adminLegacyDataClient` behavior change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this lock.

### Load Bookings Safe UI Adapter/Card Contract Setup Lock
- Load Bookings safe operational UI adapter/card contract setup is done for future read/list/detail migration preparation only.
- New setup-only helper: `lib/admin-load-bookings-safe-ui-adapter-card-contract.ts`.
- New guard: `scripts/test-load-bookings-safe-ui-adapter-card-contract.mjs`.
- The guard is registered in `scripts/test-preactivation-verification-suite.mjs`.
- The helper validates a future safe operational Load Bookings card/adapter shape only.
- Allowed adapter/card fields are limited to booking id/reference/status, booking type, vehicle/service display, pickup/dropoff datetime/address, route summary/route points summary, pax/job card display, customer/company/booker/traveler display fields, booker email/phone, assigned driver display/contact/vehicle/status only if non-payout, child seat/extra stop display only if non-price, created_at/updated_at, and audit summary.
- Forbidden fields remain rejected/excluded: pricing, payout, `customer_rate`, `customer_price_amount`, `customer_rate_override`, `customer_price_override_reason`, `customer_rates`, `driver_payout_rules`, `driver_payout_min/max/amount/override/reason/unit`, `driver_notes`, `driver_dispatch_include_payout`, midnight_surcharge/payout, extra_stop_surcharge/payout, child_seat_customer_surcharge/driver_payout, `pricing_source`, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- The helper remains setup-only, disabled/no-live-read/no-op, and does not create a route or runtime surface.
- The server-only setup helper is not imported into `app/page.tsx`.
- Stage 1 operational display mapping mirrors the allowed adapter/card field names client-side without importing the server-only helper.
- Current Load Bookings runtime remains on `GET /api/admin-saved-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Parser behavior and `/api/ai-parse` are unchanged.
- The helper does not call Supabase, `adminLegacyDataClient`, or any DB read/write path.
- No UI sectors, buttons, or cards were added.
- No new shims were added.
- No env change, deployment, migration, Supabase key use, provider/sending, payment/PDF/payout, auth, location, photo, calendar, or live activation is approved by this lock.

### Operational-Only Load Bookings Runtime Wiring Approval Packet
- Approval status: pending future typed endpoint migration approval.
- This packet does not approve typed endpoint migration or DB read activation.
- Current Load Bookings remains on `GET /api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Safe DTO contract exists but remains server-only/setup-only.
- Safe UI adapter/card contract exists but remains server-only/setup-only.
- Stage 1 operational display mapping is active in `app/page.tsx` without importing the server-only setup helpers.
- Typed endpoint migration remains blocked until approved separately.
- Future typed endpoint migration must use operational-only adapter/card fields.
- Future typed endpoint migration must not feed the safe DTO into existing finance/payout/internal `BookingRecord` paths.
- Existing finance/payout/internal UI paths remain parked: `bookingCardPriceLine`, `bookingRecordToForm` finance/payout mapping, driver dispatch payout copy, driver assignment payout controls, and billing readiness finance paths.
- Future operational-only UI adapter/card must exclude pricing, payout, `customer_rate`, `customer_price_amount`, `customer_rate_override`, `customer_price_override_reason`, `customer_rates`, `driver_payout_rules`, `driver_payout_min/max/amount/override/reason/unit`, `driver_notes`, `driver_dispatch_include_payout`, midnight_surcharge/payout, extra_stop_surcharge/payout, child_seat_customer_surcharge/driver_payout, `pricing_source`, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- Future implementation must not change Save Booking + CRM.
- Future implementation must not change `/api/admin-saved-bookings` behavior.
- Future implementation must not touch parser or `/api/ai-parse`.
- Future implementation must not add UI sectors/buttons/cards.
- Future implementation must not add new shims.
- Future live DB read activation requires separate approval and gate/env verification.
- Required future tests before typed endpoint migration: safe DTO contract guard, safe UI adapter/card contract guard, operational-only runtime mapping guard, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, and rollback/no-live checkpoint.
- Rollback note: keep Load Bookings endpoint on `/api/admin-saved-bookings` until the typed read endpoint path is separately approved, implemented, verified, and reversible.
- This packet adds `scripts/test-load-bookings-operational-runtime-wiring-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No typed endpoint migration, Save Booking + CRM change, `/api/admin-saved-bookings` route/helper change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, Supabase key use, `adminLegacyDataClient` behavior change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this packet.

### Typed Load Bookings Endpoint Migration Approval Packet
- Approval status: pending future typed endpoint migration approval.
- This packet does not approve runtime implementation, DB read activation, env changes, deployment, migrations, or live reads.
- Load Bookings still uses `GET /api/admin-saved-bookings`.
- Operational display adapter is implemented and guarded.
- Typed endpoint migration remains parked.
- Existing typed read contract is setup-only/no-live-read at `GET /api/admin-booking-read-contract-disabled-setup`.
- Future typed endpoint requires separate DB read, env, table-policy, and rollback approval.
- Future migration must not touch Save Booking + CRM, `/api/admin-saved-bookings` behavior, parser, pricing, payout, payment/PDF, provider, auth, location/photo/calendar, UI sectors, or shims.
- Future migration must not feed typed operational data into `bookingCardPriceLine`, `bookingRecordToForm`, driver dispatch payout copy, driver assignment payout controls, billing readiness finance paths, or `BookingRecord` finance/payout/internal fields.
- Future typed endpoint must return safe operational display/list/detail fields only and must exclude pricing, payout, `customer_rates`, `driver_payout_rules`, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- Required future tests before endpoint migration: typed endpoint contract test, safe DTO contract guard, safe UI adapter/card contract guard, operational runtime mapping guard, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, DB read/env/table-policy approval guard, and rollback/no-live checkpoint.
- Rollback note: keep Load Bookings on `GET /api/admin-saved-bookings` until the typed endpoint migration is separately approved, implemented, verified, and reversible.
- This packet adds `scripts/test-load-bookings-typed-endpoint-migration-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No runtime implementation, UI/API/helper behavior change, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, provider/sending, payment/PDF/pricing/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this packet.

### Load Bookings DB Read Approval Packet
- Approval status: pending future DB-read activation approval.
- This packet is docs/test-only and does not approve typed endpoint migration, runtime implementation, DB read activation, env changes, deployment, migrations, or live reads.
- Typed Load Bookings endpoint migration remains parked.
- Load Bookings still uses `GET /api/admin-saved-bookings`.
- Operational display adapter remains implemented and guarded.
- Existing typed read contract remains setup-only/no-live-read at `GET /api/admin-booking-read-contract-disabled-setup`.
- Future typed read requires separate DB-read approval before any DB read execution.
- Future approval must verify required env names only; env values, secrets, tokens, keys, and connection strings must not be printed, logged, committed, or echoed.
- Future approval must verify target table names, read-only policy/RLS posture, read-only query shape, and no write/update/delete/upsert/rpc path before activation.
- Future approval must include a rollback plan that keeps Load Bookings on `GET /api/admin-saved-bookings` until the typed endpoint is approved, verified, and reversible.
- Future typed endpoint migration must not change Save Booking + CRM.
- Future typed endpoint migration must not change `/api/admin-saved-bookings` behavior.
- Future typed endpoint migration must not touch parser behavior or `/api/ai-parse`.
- Future typed endpoint migration must exclude pricing, payout, payment/PDF, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- Future typed endpoint migration must not add UI sectors/buttons/cards.
- Future typed endpoint migration must not add new shims.
- Required future tests before any DB-read activation: typed endpoint contract test, DB-read/env-name/table-policy approval guard, safe DTO contract guard, safe UI adapter/card contract guard, operational runtime mapping guard, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, and rollback/no-live checkpoint.
- This packet adds `scripts/test-load-bookings-db-read-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No runtime implementation, UI/API/helper behavior change, Save Booking + CRM change, `/api/admin-saved-bookings` behavior change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, provider/sending, payment/PDF/pricing/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this packet.

### Load Bookings Typed Read Adapter Foundation Lock
- Setup-only typed Load Bookings DB-read adapter foundation is added at `lib/admin-load-bookings-typed-read-adapter-foundation.ts`.
- It uses the existing safe Load Bookings DTO contract shape only.
- It validates future read/list/detail adapter fields without executing any live read.
- It remains disabled/no-live-read/no-op with read, DB-read, live-read, write, endpoint-change, app-page runtime wiring, parser-change, Save Booking change, and `/api/admin-saved-bookings` change flags closed.
- It does not call Supabase.
- It does not call `adminLegacyDataClient`.
- It does not execute any DB read/write path.
- It does not wire `app/page.tsx`.
- It does not change the Load Bookings endpoint.
- Load Bookings still uses `GET /api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Safe future adapter fields remain limited to safe DTO fields: booking id/reference/status, booking type, vehicle/service display, pickup/dropoff datetime/address, route summary/route points summary, pax/job card display, customer/company/booker/traveler display fields, booker email/phone, assigned driver display only if non-payout, child seat/extra stop display only if non-price, created_at/updated_at, and audit summary.
- Forbidden fields remain rejected/excluded: pricing, payout, customer rates, driver payout rules, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and mock QA/dev archive fields.
- Typed endpoint migration and DB-read activation remain parked until separate approval.
- This lock adds `scripts/test-load-bookings-typed-read-adapter-foundation.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No runtime implementation, UI/API route/helper behavior change, Load Bookings endpoint change, Save Booking + CRM change, `/api/admin-saved-bookings` behavior change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, provider/sending, payment/PDF/pricing/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this lock.

### Disabled Typed Load Bookings Read Endpoint Setup Lock
- Setup-only disabled typed Load Bookings read endpoint is added at `GET /api/admin-load-bookings-typed-read-disabled-setup`.
- New setup route: `app/api/admin-load-bookings-typed-read-disabled-setup/route.ts`.
- It uses the existing typed read adapter foundation at `lib/admin-load-bookings-typed-read-adapter-foundation.ts`.
- The route is GET-only and remains disabled/no-live-read/no-op.
- It validates safe DTO fields only.
- It does not call Supabase.
- It does not call `adminLegacyDataClient`.
- It does not execute any DB read/write path.
- It does not wire `app/page.tsx`.
- It does not change the Load Bookings endpoint.
- Load Bookings still uses `GET /api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Pricing, payout, payment/PDF, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and mock QA/dev archive fields remain rejected/excluded.
- This lock adds `scripts/test-load-bookings-typed-read-disabled-setup-api-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No runtime implementation, live API behavior change, Load Bookings endpoint change, Save Booking + CRM change, `/api/admin-saved-bookings` behavior change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, provider/sending, payment/PDF/pricing/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this lock.

### Load Bookings Operational Record Mapper Lock
- Setup-only operational Load Bookings record mapper is added at `lib/admin-load-bookings-operational-record-mapper.ts`.
- It prepares future typed read migration by mapping saved-booking-shaped records into the existing safe DTO and safe UI adapter/card contract shapes.
- It remains setup-only/no-live-read/no-op.
- It does not call Supabase.
- It does not call `adminLegacyDataClient`.
- It does not call `fetch`, read env, or execute any DB read/write path.
- It does not wire `app/page.tsx`.
- It does not change the Load Bookings endpoint.
- Load Bookings still uses `GET /api/admin-saved-bookings`.
- The disabled typed Load Bookings read endpoint remains unwired and no-live/no-op.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Safe mapper output is limited to operational DTO/card fields only: booking id/reference/status, booking type, vehicle/service display, pickup/dropoff datetime/address, route summary/route points summary, pax/job card display, customer/company/booker/traveler display fields, booker email/phone, assigned driver display only if non-payout, child seat/extra stop display only if non-price, created_at/updated_at, and audit summary.
- Forbidden finance/payout/internal/source fields are quarantined by field name only and their values are not returned through `safe_dto` or `safe_card`: pricing, payout, customer rates, driver payout rules, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and mock QA/dev archive fields.
- No UI sectors/cards were added.
- No new shims were added.
- This lock adds `scripts/test-load-bookings-operational-record-mapper.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No runtime implementation, live API behavior change, typed endpoint migration, Load Bookings endpoint change, Save Booking + CRM change, `/api/admin-saved-bookings` behavior change, parser or `/api/ai-parse` change, env change, deployment, DB read/write, migration, provider/sending, payment/PDF/pricing/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this lock.

### Load Bookings Typed Read Gated Endpoint Lock
- Gated typed Load Bookings read endpoint is added at `GET /api/admin-load-bookings-typed-read`.
- New route: `app/api/admin-load-bookings-typed-read/route.ts`.
- New helper: `lib/admin-load-bookings-typed-read-gated.ts`.
- The endpoint is closed by default behind env-name gate `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED`; no env values are printed, required, or changed by this lock.
- With the gate closed, the endpoint returns a safe blocked response and does not create a database client.
- Open-gate behavior is covered only through mocked tests; no live DB read was executed.
- It uses the existing saved-booking read helper only after the gate is open and maps records through the operational record mapper before returning data.
- The endpoint response returns only safe operational `safe_dto` and `safe_card` shapes plus forbidden-field quarantine counts.
- It does not return legacy finance/payout/internal/source values.
- It now has a bounded `app/page.tsx` operational display bridge: the app keeps `GET /api/admin-saved-bookings` as the loaded booking/form source and legacy fallback, then may use `GET /api/admin-load-bookings-typed-read` only for safe operational card display data when the existing gate and admin boundary allow it.
- This is not a blind endpoint swap.
- Typed safe-card data must not replace the `BookingRecord` source used by `bookingRecordToForm`, driver dispatch payout copy, driver assignment payout controls, billing readiness, or finance/payout/internal paths.
- With the gate closed or the admin boundary blocked, the bridge falls back to the existing saved-bookings operational display mapping.
- The current Load Bookings booking/form source still uses `GET /api/admin-saved-bookings`.
- The disabled typed Load Bookings read setup endpoint remains no-live/no-op.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Pricing, payout, payment/PDF, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and mock QA/dev archive fields remain excluded from typed read output.
- No UI sectors/cards were added.
- No new shims were added.
- This lock adds `scripts/test-load-bookings-typed-read-gated-api-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No env change, deployment, live DB write, migration, provider/sending, payment/PDF/pricing/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this lock.

### Staging Typed Load Bookings Read Activation
- Staging project: `prestige-limo-ops-staging`.
- Staging URL: `https://prestige-limo-ops-staging.vercel.app/`.
- Staging typed-read gate env name enabled: `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED`.
- No env values or secrets were printed.
- Staging was redeployed through Vercel after the gate env was added.
- Staging home returned HTTP 200.
- Safe GET-only check to `GET /api/admin-load-bookings-typed-read?limit=2` returned HTTP 200.
- Typed read response reported `status: ready`, `mode: list`, `read_gate_open: true`, `db_read_enabled: true`, and `live_write_enabled: false`.
- Typed read response returned 2 safe operational records through `safe_dto` and `safe_card`.
- Safe DTO/card key scan found no forbidden pricing, payout, customer rate, driver payout, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secret, or token keys.
- No POST/write/send was attempted.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Load Bookings booking/form source remains on `GET /api/admin-saved-bookings`; the typed endpoint is used only by the bounded operational display bridge and fallback remains in place.
- `/api/admin-saved-bookings` behavior remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Provider sending remains inactive.
- No live DB write, migration, payment/PDF/pricing/payout, auth, location, photo, calendar, UI sector/card addition, or new shim was introduced by this activation.

### Staging Smoke for Typed Load Bookings Operational Display Priority
- `origin/staging` deployed to `2157ab3 Prioritize typed Load Bookings operational display`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; smoke used passive page load plus read-only DOM and console checks.
- Console/runtime errors: 0.
- The typed Load Bookings operational display priority remains bounded to safe operational cards.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- The typed Load Bookings endpoint remains read-only; no DB write path was introduced.
- All 6 runtime lanes remain parked: Load Bookings endpoint migration, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- Email, WhatsApp, SMS, and Telegram remain setup-only/no-live.
- No new UI sectors/cards were added.
- No new shims were added.

### Staging Smoke for Typed Load Bookings Operational Order
- `origin/staging` deployed to `2e882cf Preserve typed Load Bookings operational order`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; passive page load observed only safe requests.
- Console/runtime errors: 0.
- Typed read safe-card order is used only as an operational display ordering hint.
- Legacy `BookingRecord` remains the action/form/detail source.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- The typed Load Bookings endpoint remains read-only; no DB write path was introduced.
- All 6 runtime lanes remain parked: Load Bookings endpoint migration, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- Email, WhatsApp, SMS, and Telegram remain setup-only/no-live.
- No new UI sectors/cards were added.
- No new shims were added.

### Load Bookings Typed Read Rollback Boundary Lock
- Typed Load Bookings read rollback boundary is guarded.
- Rollback path: close `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED`; Load Bookings continues to use `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- Typed read failures, blocked responses, closed gates, or malformed responses must return `null` from the operational display bridge and must not block the legacy saved-bookings read.
- Typed safe-card state resets to empty before each load and falls back to empty maps/orders when typed read is unavailable.
- Typed read safe-card order is display-only and must not replace the legacy `BookingRecord` action/form/detail source.
- The typed endpoint remains GET-only and read-only.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` route/helper change.
- No parser or `/api/ai-parse` change.
- No DB write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card addition, or new shim is approved by this lock.
- This lock adds `scripts/test-load-bookings-typed-read-rollback-boundary.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Load Bookings Typed Read Query Shape Guard Lock
- Typed Load Bookings read query shape is guarded before any endpoint migration.
- The typed read endpoint remains gated by env-name `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED` and must not print or require env values.
- The typed read query helper may read only the `bookings` table through list/detail select queries.
- The query helper must not use insert, update, upsert, delete, rpc, provider send, payment/PDF, auth, location/photo/calendar, parser/debug, internal/admin notes, secret/token fields, or legacy shim paths.
- Legacy finance/payout/rate source columns selected for compatibility must stay quarantined by field name and must only pass through `mapAdminLoadBookingsTypedReadList` or `mapAdminLoadBookingsTypedReadDetail` before any response.
- Typed read responses must return only safe operational `safe_dto` and `safe_card` shapes plus quarantine counts.
- Raw saved-booking rows must not be returned from `GET /api/admin-load-bookings-typed-read`.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- No `/api/admin-saved-bookings` route/helper change.
- No parser or `/api/ai-parse` change.
- No DB write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card addition, or new shim is approved by this lock.
- This lock adds `scripts/test-load-bookings-typed-read-query-shape-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Load Bookings DB Read Env Table Policy Guard Lock
- Load Bookings DB-read env/table-policy readiness is guarded without executing a live DB read.
- This lock does not approve DB-read activation, endpoint migration, env changes, deployment, migrations, or live reads.
- Required env names are limited to `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; env values must not be printed, logged, committed, or echoed.
- Future typed read activation must verify the target `bookings` table, joined read relationships `companies`, `bookers`, and `travelers`, read-only policy/RLS posture, and rollback before opening the gate.
- The read helper must validate admin/dispatcher actor boundary before creating a Supabase client.
- When booking persistence is enabled, the read helper must require `server-session-role-surface` and admin/dispatcher role before DB-read execution.
- The read helper must use read-only list/detail operators only: select, eq, order, limit, and maybeSingle.
- The read helper must not use insert, update, upsert, delete, rpc, storage, provider send, payment/PDF, auth, location/photo/calendar, parser/debug, internal/admin notes, secret/token fields, or legacy shim paths.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as booking/form/detail source and fallback.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- No `/api/admin-saved-bookings` route/helper change.
- No parser or `/api/ai-parse` change.
- No UI sector/card addition or new shim is approved by this lock.
- This lock adds `scripts/test-load-bookings-db-read-env-table-policy-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Admin Setup Readiness Archive Label Hardening Lock
- The collapsed admin archive header now uses the business-grade visible label `Setup Readiness Archive`.
- The old visible label `Internal QA / Mock Workbench Archive — Mock Only` is removed from `app/page.tsx`.
- The archive remains collapsed by default and keeps the existing `data-internal-qa-mock-archive` boundary for tests.
- Customer and driver public-surface browser guards treat `Setup Readiness Archive` as forbidden outside the admin shell.
- Dispatcher Intake `Clear Message` keeps an explicit 44px minimum touch target on small mobile viewports.
- Existing monthly billing month-grouping pagination stacks on small phones to preserve readable touch targets.
- No UI sector/card addition, route change, parser change, Save Booking change, DB read/write, provider send, pricing/payout/payment/PDF activation, or new shim is approved by this lock.
- This lock adds `scripts/test-admin-setup-readiness-archive-label-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Deploy Smoke for Admin Setup Archive Label
- `origin/staging` deployed to `9772661 Harden admin setup archive label`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; the staging smoke used passive browser and GET-only checks.
- Console/runtime errors: 0.
- `Setup Readiness Archive` was present.
- The old `Internal QA / Mock Workbench Archive` / `Mock Workbench Archive` wording was absent.
- All 6 runtime lanes remain parked: Load Bookings runtime read wiring, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- Email, WhatsApp, SMS, and Telegram remain setup-only/no-live.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Smoke for Load Bookings Typed Read Rollback Guard
- `origin/staging` deployed to `4004b3a Add Load Bookings typed read rollback guard`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; passive page load observed no unsafe requests.
- Console/runtime errors: 0.
- Load Bookings typed read rollback guard remains registered and passing.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- The typed Load Bookings endpoint remains GET-only/read-only; no DB write path was introduced.
- All 6 runtime lanes remain parked: Load Bookings endpoint migration, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- Email, WhatsApp, SMS, and Telegram remain setup-only/no-live.
- No new UI sectors/cards were added.
- No new shims were added.

### Staging Static Smoke for Load Bookings Typed Read Query Shape Guard
- `origin/staging` deployed to `9b62133 Add Load Bookings typed read query shape guard`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Static staging HTML rendered the main admin shell.
- Expected tabs were present in the static staging response: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present in the static staging response but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; this checkpoint used GET-only static/HTTP checks.
- Local headless Chrome console attachment was unavailable because Chrome did not expose the remote debug port from this sandbox, so this checkpoint does not claim browser console/runtime inspection.
- Load Bookings typed read query shape guard remains registered and passing.
- Pre-activation verification suite remains passing.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- The typed Load Bookings endpoint remains gated/read-only; no DB write path was introduced.
- All 6 runtime lanes remain parked: Load Bookings endpoint migration, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- Email, WhatsApp, SMS, and Telegram remain setup-only/no-live.
- No new UI sectors/cards were added.
- No new shims were added.

### Operational-Only Load Bookings Runtime Mapping Guard Lock
- Stage 1 operational-only Load Bookings display mapping is guarded.
- Current Load Bookings remains on `GET /api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Safe DTO contract remains setup-only.
- Safe UI adapter/card contract remains setup-only.
- `app/page.tsx` uses a client-side operational display card mapper that mirrors the safe DTO plus safe UI adapter/card field shape without importing the server-only setup helpers.
- `app/page.tsx` now has a gated typed-read operational display bridge that hydrates operational display cards from `GET /api/admin-load-bookings-typed-read` before the legacy booking/form read when the typed read gate and admin boundary allow it.
- The bridge keeps the loaded booking/form source on `GET /api/admin-saved-bookings` and silently falls back to the existing operational display card mapper when typed read is blocked, closed, or unavailable.
- No blind endpoint swap is approved.
- Operational display mapping uses safe operational card fields only.
- When available, typed safe-card data is the primary operational display source and legacy saved-booking fields are fallback-only for the display card.
- Operational card render loops consume `LoadBookingsOperationalDisplayItem` pairs: typed-safe `operationalCard` for display, legacy `BookingRecord` for actions/form/detail fallback.
- Typed read preserves ordered safe-card ids as an operational display ordering hint; legacy `BookingRecord` remains the action/form/detail source.
- Operational display mapping must not feed safe operational card data into `bookingCardPriceLine`, `bookingRecordToForm` finance/payout mapping, driver dispatch payout copy, driver assignment payout controls, billing readiness finance paths, or `BookingRecord` finance/payout/internal fields.
- Dashboard/recent/completed operational display cards no longer render finance/payout price lines.
- Forbidden fields remain rejected/excluded from the operational mapping path: pricing, payout, `customer_rate`, `customer_price_amount`, `customer_rate_override`, `customer_price_override_reason`, `customer_rates`, `driver_payout_rules`, `driver_payout_min/max/amount/override/reason/unit`, `driver_notes`, `driver_dispatch_include_payout`, midnight_surcharge/payout, extra_stop_surcharge/payout, child_seat_customer_surcharge/driver_payout, `pricing_source`, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- Parser behavior and `/api/ai-parse` remain untouched.
- No direct Supabase, `adminLegacyDataClient`, or DB write path is introduced by this mapping guard.
- No new shims are added.
- This lock adds `scripts/test-load-bookings-operational-runtime-mapping-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No blind typed endpoint migration, Save Booking + CRM change, `/api/admin-saved-bookings` route/helper change, parser or `/api/ai-parse` change, env change, deployment, DB write, migration, `adminLegacyDataClient` behavior change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this lock.

### Load Bookings Typed Operational Display Merge Guard Lock
- Typed Load Bookings operational display merge is guarded.
- Typed safe-card fields are primary for operational display.
- Legacy saved-booking operational card fields are sanitized fallback only.
- The merge is field-by-field across `loadBookingsOperationalDisplayFieldNames`.
- Typed safe-card null/blank fields must not blank safe fallback operational display fields.
- Typed safe-card data must not replace the `BookingRecord` source used by form/action/detail paths.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- No blind endpoint swap is approved.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` route/helper change.
- No parser or `/api/ai-parse` change.
- No DB write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card addition, or new shim is approved by this lock.
- This lock adds `scripts/test-load-bookings-typed-operational-display-merge-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Load Bookings Endpoint Migration Readiness Guard Lock
- Load Bookings endpoint migration readiness is guarded before any future endpoint swap.
- This is a docs/test-only readiness guard; it does not approve endpoint migration.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.
- The typed read endpoint remains `GET /api/admin-load-bookings-typed-read` and is used only for safe operational display-card hydration when the existing gate and admin boundary allow it.
- Typed safe-card data must not replace the legacy `BookingRecord` source used by `bookingRecordToForm`, `loadSelectedBooking`, Save Booking + CRM, driver dispatch payout copy, driver assignment payout controls, billing readiness, or finance/payout/internal paths.
- Future endpoint migration requires separate owner approval, rollback proof, no forbidden-field leak proof, and a bounded staging smoke.
- Forbidden fields remain excluded from typed output and must not reach customers or drivers: pricing, payout, customer rates, driver payout rules, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, deployment, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim is approved by this lock.
- This lock adds `scripts/test-load-bookings-endpoint-migration-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Load Bookings Endpoint Migration Readiness Guard
- `origin/staging` points to `75ec5e3ff8d67f4265a9a6466a0894fcbb48d531` (`75ec5e3 Guard Load Bookings endpoint migration readiness`).
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser visual smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, and 0 non-200 responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot evidence was captured at `/private/tmp/prestige-staging-75ec5e3-smoke.png`.
- The Load Bookings endpoint migration readiness guard remains docs/test-only and does not approve endpoint migration.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.
- The typed read endpoint remains `GET /api/admin-load-bookings-typed-read` for safe operational display-card hydration only when the existing gate and admin boundary allow it.
- Typed safe-card data still must not replace the legacy `BookingRecord` source used by `bookingRecordToForm`, `loadSelectedBooking`, Save Booking + CRM, driver dispatch payout copy, driver assignment payout controls, billing readiness, or finance/payout/internal paths.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields remain excluded from typed output and must not reach customer or driver surfaces.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Load Bookings Typed Read Admin Boundary Order Guard Lock
- Load Bookings typed-read admin-boundary ordering is guarded before any future endpoint migration.
- This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, or DB writes.
- The typed-read route must resolve the admin/dispatcher boundary before checking the read gate, converting the actor, parsing search params, or calling saved-booking read helpers.
- If the admin boundary fails, the route must return the boundary blocked response before any actor conversion or saved-booking read helper call.
- The route may include gate-state metadata in blocked responses, but it must not create a DB client or execute a list/detail read before the admin boundary passes.
- The typed-read route remains GET-only and read-only.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No pricing, payout, customer rates, driver payout rules, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.
- This lock adds `scripts/test-load-bookings-typed-read-admin-boundary-order-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Load Bookings Typed Read Admin Boundary Order Guard
- `origin/staging` points to `9824581872702c987705f9a59d7394202e38a6e8` (`9824581 Guard Load Bookings typed-read admin boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser visual smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, and 0 non-200 responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted one non-app background GCM `DEPRECATED_ENDPOINT` line; it was not a page console/runtime exception and did not come from an app POST/write/send request.
- Screenshot evidence was captured at `/private/tmp/prestige-staging-9824581-smoke.png`.
- The Load Bookings typed-read admin-boundary order guard remains docs/test-only and does not approve endpoint migration.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.
- The typed read endpoint remains `GET /api/admin-load-bookings-typed-read` for safe operational display-card hydration only when the existing gate and admin boundary allow it.
- The typed-read route must keep admin boundary resolution before gate handling, actor conversion, search param parsing, or saved-booking read helper calls.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields remain excluded from typed output and must not reach customer or driver surfaces.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Load Bookings Typed Read Failure Payload Guard Lock
- Load Bookings typed-read failure and blocked payload shape is guarded before any future endpoint migration.
- This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, or DB writes.
- Non-ready typed-read responses must expose only gate metadata plus safe `ok`, `status`, `error`, and optional `rejected_fields` field-name lists.
- Blocked, closed-gate, safe-failure, and read-helper failure responses must not include `booking`, `bookings`, raw `data`, `records`, safe cards, DTOs, customer pricing, driver payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields.
- Rejected unsafe-record responses may include only `rejected_fields` field names and must not include mapped booking/card/DTO payloads or raw saved-booking rows.
- The app bridge must return `null` for non-OK, blocked, failed, rejected, malformed, or non-list typed-read responses and must continue the legacy `GET /api/admin-saved-bookings` booking/form/detail read.
- The typed-read endpoint remains GET-only and read-only.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.
- This lock adds `scripts/test-load-bookings-typed-read-failure-payload-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Load Bookings Typed Read Failure Payload Guard
- `origin/staging` points to `f68f41cf88d09fc78f986cdcda423d65c6dd334e` (`f68f41c Guard Load Bookings typed-read failure payload`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, and 0 non-200 responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted one non-app background GCM `DEPRECATED_ENDPOINT` line; it was not a page console/runtime exception and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The Load Bookings typed-read failure payload guard remains docs/test-only and does not approve endpoint migration.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.
- The typed read endpoint remains `GET /api/admin-load-bookings-typed-read` for safe operational display-card hydration only when the existing gate and admin boundary allow it.
- Non-ready typed-read responses remain constrained to safe gate/error/status metadata and optional rejected field-name lists; they must not return booking rows, safe cards, DTOs, finance/payout/payment/billing/provider/auth/location/photo/calendar/internal/parser/debug/secret/token/mock archive payloads.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields remain excluded from typed output and must not reach customer or driver surfaces.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Load Bookings Typed Read Detail Isolation Guard Lock
- Load Bookings typed-read detail mode is isolated before any future endpoint migration.
- This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, or DB writes.
- Typed detail responses may exist only on `GET /api/admin-load-bookings-typed-read` when an `id` or `booking_id` query param is supplied by an approved internal caller.
- The app Load Bookings bridge must request only list mode with `limit=25`; it must not send `id` or `booking_id` to the typed-read endpoint.
- The app typed-read response type and bridge must consume only `bookings` list payloads; they must not consume a singular `booking` detail payload or branch on typed `mode=detail`.
- Typed detail data must not feed `loadSelectedBooking`, `bookingRecordToForm`, Save Booking + CRM, driver dispatch payout copy, driver assignment payout controls, billing readiness, or finance/payout/internal paths.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings` and `BookingRecord`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.
- This lock adds `scripts/test-load-bookings-typed-read-detail-isolation-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Load Bookings Typed Read Detail Isolation Guard
- `origin/staging` points to `8c2eb8ad24231fdf20aa28f8d29414d59f68fdce` (`8c2eb8a Guard Load Bookings typed-read detail isolation`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary from the strict no-screenshot rerun: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted one non-app background GCM `DEPRECATED_ENDPOINT` line; it was not a page console/runtime exception and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The Load Bookings typed-read detail isolation guard remains docs/test-only and does not approve endpoint migration.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings` and `BookingRecord`.
- The app Load Bookings bridge remains list-mode only and must not send `id` or `booking_id` to the typed-read endpoint.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields remain excluded from typed output and must not reach customer or driver surfaces.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Load Bookings Typed Read Admin Display Exposure Guard Lock
- Load Bookings typed-read safe-card exposure is guarded at the admin display boundary.
- This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, customer/driver visibility changes, or runtime behavior changes.
- The typed-read app bridge may hydrate only `LoadBookingsOperationalDisplayCard` list display data inside the internal admin Load Bookings path.
- Typed safe-card and safe DTO data must not feed Customer Copy, Driver Job Link payloads/copy, driver job pages or APIs, customer pages or APIs, selected booking form, Save Booking + CRM, parser, or `/api/admin-saved-bookings`.
- The typed-read app bridge remains list-mode only with `limit=25` and must not send `id` or `booking_id`.
- The safe operational display field list remains limited to operational identifiers/status/booking/vehicle/service/date/address/route/pax/job-card/display/contact summary fields.
- Visible typed operational text is filtered for forbidden finance/payout/payment/billing/internal/parser/debug/secret/token/mock archive fragments before display.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings` and `BookingRecord`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.
- This lock adds `scripts/test-load-bookings-typed-read-admin-display-exposure-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Load Bookings Typed Read Admin Display Exposure Guard
- `origin/staging` points to `bd0d012a96c6f2ed663a4a3a59f6c563eb102cc3` (`bd0d012 Guard Load Bookings typed-read admin display exposure`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, and TensorFlow Lite delegate creation; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The Load Bookings typed-read admin display exposure guard remains docs/test-only and does not approve endpoint migration.
- Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings` and `BookingRecord`.
- The typed-read app bridge remains internal-admin list-display-only and must not feed Customer Copy, Driver Job Link payloads/copy, driver job pages or APIs, customer pages or APIs, selected booking form, Save Booking + CRM, parser, or `/api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields remain excluded from typed output and must not reach customer or driver surfaces.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Public Customer/Driver Visibility Boundary Guard Lock
- Public customer/driver visibility is guarded across customer booking, customer portal, and driver job contract surfaces.
- This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, customer/driver auth activation, payment/PDF/pricing/payout activation, UI sectors, or runtime behavior changes.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive details.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive details.
- The customer booking request, customer booking memory, customer saved bookings, customer booking status, customer portal session, customer portal saved-bookings adapter, customer saved-bookings auth handoff, customer booking-page API audit, and driver job link API contracts are coordinated by this guard.
- Coordinated scripts: `scripts/test-customer-booking-request-api-contract.mjs`, `scripts/test-customer-saved-bookings-api-contract.mjs`, `scripts/test-customer-booking-memory-api-contract.mjs`, `scripts/test-customer-booking-status-api-contract.mjs`, `scripts/test-customer-portal-session-issue-api-contract.mjs`, `scripts/test-customer-portal-saved-bookings-adapter.mjs`, `scripts/test-customer-saved-bookings-auth-handoff-readiness.mjs`, `scripts/test-customer-booking-page-api-audit.mjs`, and `scripts/test-driver-job-link-api-contract.mjs`.
- The driver job browser privacy checks remain in `npm run test:safe` and are not moved into the preactivation suite because they require a running app/browser harness.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-driver-visibility-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public Route Source Privacy Boundary Guard Lock
- Public customer/driver route source privacy is guarded across `app/book/page.tsx`, `app/my-bookings/page.tsx`, `app/driver-job/[token]/page.tsx`, and `lib/driver-job-link.ts`.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Customer booking and customer portal source must not render driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive details.
- Driver job source must not render customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive details.
- Driver job source may keep forbidden words only in protective redaction/blocking code such as `driverPaymentDetailLinePattern`, `lineValue`, `driverDetailLines`, and `unsafeStatusHistoryFragments`.
- Driver app updates and status history must render only safe fields: `safe_title`, `safe_message`, and `safeNote`.
- The browser privacy checks remain in `npm run test:safe`; this guard covers static source boundaries that do not require a running app.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-route-source-privacy-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public API Source Privacy Boundary Guard Lock
- Public customer/driver API source privacy is guarded across customer booking, customer portal, customer saved-booking/memory/status/notification, driver job, driver job status, driver job notifications, driver issue-alert, flight ETA setup, and driver bidding route sources.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Intentional guarded imports from admin booking persistence, admin booking Supabase adapter, admin app notification persistence, and admin flight setup foundations remain allowed only for the existing public API setup/gated paths.
- Public API route files must not import monthly billing, invoice/PDF, payment, pricing/customer_rates, payout/driver_payout_rules, parser/AI parse, location/photo/calendar activation, provider-send, or mock archive modules.
- Public API helper deny-lists must keep blocking customer price, driver payout, PayNow payout details, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, service-role/token/secrets, and mock QA/dev archive fields.
- Public driver job response shape must stay `SafeDriverJobPayload` with safe status history fields only.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-source-privacy-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public API Response Privacy Boundary Guard Lock
- Public customer/driver API response privacy is guarded across customer booking request, customer saved bookings, customer booking memory, customer booking status, customer portal session, customer/driver app notifications, driver job link, driver job status, driver issue-alert, driver bidding, and driver flight ETA setup response contracts.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Customer API responses must stay limited to safe request/status/memory/saved-booking/session metadata and must not expose driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug internals, service-role/token/secrets, or mock QA/dev archive fields.
- Driver API responses must stay limited to `SafeDriverJobPayload`, safe status/issue-alert metadata, disabled bidding/auth-required errors, safe notification records, and setup-only flight ETA metadata.
- Public API response contracts must continue checking safe body leak patterns and allowed field lists with mocked route harnesses; this guard coordinates those scripts in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-response-privacy-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public API Method Surface Boundary Guard Lock
- Public customer/driver API method surfaces are guarded across customer booking request, customer portal session, customer saved bookings, customer booking memory, customer booking status, customer app notifications, driver job link, driver job status, driver notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Customer booking requests may keep the existing guarded `POST` submission path while `GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` fail closed through `blockedResponse`.
- Customer saved-booking, booking-memory, booking-status, portal-session, and app-notification methods must stay on their current safe read/auth-required or submit-only boundaries.
- Driver job methods must stay limited to safe job `GET`, status `PATCH`, notification `GET`/`PATCH`, issue-alert `POST`, setup-only flight ETA `GET`, setup-only acknowledgement `GET`, and blocked driver bidding `GET`/`POST`/`PATCH`.
- Public API method contracts must continue checking blocked or setup-only methods through mocked route harnesses; this guard coordinates those scripts in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-method-surface-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public API Request Input Boundary Guard Lock
- Public customer/driver API request input boundaries are guarded across customer booking request, customer saved bookings, customer booking memory, customer booking status, customer portal session issue, customer app notifications, driver job status, driver job notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Customer booking request POST input must stay limited to the approved customer form fields and must reject forbidden or unknown finance/internal/parser/token/archive fields before persistence.
- Customer saved-bookings, booking-memory, and booking-status read inputs must keep explicit query allowlists and forbidden-fragment checks on both query keys and values.
- Customer portal session issue input must remain server-gated by purpose/origin/referer/token headers and must not be called from customer UI/client code.
- Driver status and notification inputs must stay limited to current safe status, safe note/context, notification id/status, and driver_app delivery surface boundaries; driver issue-alert input must stay enum-only.
- Driver bidding remains blocked for GET/POST/PATCH until approved driver auth exists.
- Public API request input contracts must continue checking safe field allowlists, forbidden-field rejection, auth-required boundaries, and mocked route harnesses; this guard coordinates those scripts in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-request-input-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public API Session Cookie Cache Boundary Guard Lock
- Public customer/driver API session, cookie, and cache boundaries are guarded across customer portal session issue, customer saved bookings, customer booking memory, customer booking status, customer booking request, customer app notifications, driver job, driver job notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Only the customer portal session issue route may set `Set-Cookie`, and successful or blocked session-issue responses must stay `Cache-Control: no-store`.
- Customer portal session cookies must stay HttpOnly, Secure, SameSite=Lax, Priority=High, path-scoped, max-age limited, server-token backed, and fail closed for unsafe configured cookie names.
- Customer booking request, booking memory, and portal saved-bookings client adapters must use `credentials: "same-origin"`, `cache: "no-store"`, and purpose headers while never manually attaching Cookie, Authorization, or customer session-token headers.
- Customer saved-bookings and booking-memory reads may accept a server-validated same-origin session cookie; ambiguous, wrong, unsafe, placeholder, or duplicate cookie values fail closed.
- Customer booking status stays on its explicit server session-token header contract and does not set cookies.
- Driver public APIs must remain cookie-free and must not set session cookies.
- Public API session/cache contracts must continue checking secure cookie attributes, no-store responses, no manual client auth headers, and cookie-backed fail-closed reads through mocked route harnesses; this guard coordinates those scripts in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-session-cookie-cache-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public API Logging Error Boundary Guard Lock
- Public customer/driver API logging and error-detail boundaries are guarded across customer booking request, customer portal session, customer saved bookings, customer booking memory, customer booking status, customer app notifications, driver job, driver job status, driver notifications, driver issue-alert, driver flight ETA setup, driver flight ETA acknowledgement setup, and driver bidding routes.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Public API route/helper sources must not use console logging, process stdout/stderr writes, telemetry capture calls, or raw request/body/header/token/cookie serialization.
- Public API route catch blocks must stay generic and must not return caught error messages, stacks, raw request data, headers, cookies, or tokens.
- Customer-facing error responses must stay mapped through safe fixed messages such as `customerSafeError`, auth-required results, and failed-safely fallbacks.
- Driver-facing error responses must stay limited to safe reason enums, setup-only blocked messages, auth-required bidding errors, malformed issue alerts, and failed-safely fallbacks.
- Existing helper code may classify provider/adapter failures internally but must return safe error strings/categories without logging raw errors.
- Public API logging/error contracts must continue coordinating source privacy, response privacy, request input, and session/cache guards.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-logging-error-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Public API Runtime Gate Boundary Guard Lock
- Public customer/driver API runtime gate and dependency boundaries are guarded across customer booking request, customer portal session issue, customer saved bookings, customer booking memory, customer booking status, customer app notifications, driver job, driver job status, driver notifications, driver issue-alert, driver flight ETA setup, driver flight ETA acknowledgement setup, and driver bidding routes.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Public API route files must not directly read env, create Supabase clients, import Supabase, or execute direct database query/write methods; runtime dependencies must stay mediated through existing helpers and gates.
- Customer portal session issue must remain default-off and token/purpose/origin/referer gated before issuing a secure cookie.
- Customer saved-bookings, booking-memory, and booking-status reads must remain auth-gated by explicit env-name gates, same-origin/purpose checks, server session token or allowed cookie boundaries, and mocked contract tests.
- Driver job production mode must remain mock by default and production reads/status writes must remain blocked unless `PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED` is explicitly true and the production persistence client is configured.
- Driver bidding and customer/driver app notification runtime persistence must remain mediated by the existing admin persistence gate and auth-required boundaries.
- Public helper env-name usage must stay in the bounded allowlist documented by this guard; env values, secrets, tokens, and connection strings must not be printed, committed, or surfaced.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-runtime-gate-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public API Runtime Gate Boundary Guard
- `origin/staging` points to `147dfa9f94a2c3f48b7c7f09db5f044bfb8cc8bc` (`147dfa9 Guard public API runtime gate boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, GCM `PHONE_REGISTRATION_ERROR`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API runtime gate boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Public API route files remain guarded against direct env reads, direct Supabase client creation/import, and direct database query/write methods.
- Customer portal session issue remains default-off and token/purpose/origin/referer gated before issuing a secure cookie.
- Customer saved-bookings, booking-memory, and booking-status reads remain auth-gated by explicit env-name gates, same-origin/purpose checks, server session token or allowed cookie boundaries, and mocked contract tests.
- Driver job production mode remains mock by default; production reads/status writes remain blocked unless `PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED` is explicitly true and the production persistence client is configured.
- Driver bidding and customer/driver app notification runtime persistence remain mediated by the existing admin persistence gate and auth-required boundaries.
- Public helper env-name usage remains bounded by the runtime gate guard; env values, secrets, tokens, and connection strings were not printed, committed, or surfaced.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Public API Client Caller Boundary Guard Lock
- Public customer/driver browser caller boundaries are guarded across `/book`, `/my-bookings`, and `/driver-job/[token]` client surfaces plus their customer-safe adapters.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- `/book` and `/my-bookings` must delegate public API calls to customer-safe adapters instead of owning raw fetch/session plumbing.
- Customer client adapters must use `cache: "no-store"`, `credentials: "same-origin"`, and purpose headers while never manually attaching Cookie, Authorization, customer session-token, admin purpose, or server env-token plumbing.
- `/driver-job/[token]` must keep driver API calls no-store and limited to safe job GET, notification GET, issue-alert POST with `issue_type`, and status PATCH with `status` only.
- Driver client code must not expose customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, token secrets, or mock QA/dev archive fields.
- Public client caller contracts must continue coordinating the existing customer booking page API audit, customer booking memory UI contract, and customer portal saved-bookings adapter contract in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-api-client-caller-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public API Client Caller Boundary Guard
- `origin/staging` points to `85c23060105bd42b72b356ec7b4aee53703a2361` (`85c2306 Guard public API client caller boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 2 GET-only RSC prefetch load-completion events for `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API client caller boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/book` and `/my-bookings` remain guarded to delegate public API calls to customer-safe adapters instead of owning raw fetch/session plumbing.
- Customer client adapters remain guarded for `cache: "no-store"`, `credentials: "same-origin"`, and purpose headers while never manually attaching Cookie, Authorization, customer session-token, admin purpose, or server env-token plumbing.
- `/driver-job/[token]` remains guarded for no-store driver API calls limited to safe job GET, notification GET, issue-alert POST with `issue_type`, and status PATCH with `status` only.
- Driver client code remains guarded against customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, token secrets, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Public Client Navigation Boundary Guard Lock
- Public customer/driver client navigation is guarded across `/book`, `/my-bookings`, `/driver-job/[token]`, and the driver job demo page.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- `/book` may keep only the existing internal customer portal link to `/my-bookings`.
- `/my-bookings`, `/driver-job/[token]`, and the driver job demo page must not add public outbound links, deep links, app-store/native-app links, admin links, or session-issue links.
- Public client pages must not call `window.open`, imperative navigation helpers, `mailto:`, `tel:`, SMS/WhatsApp deep links, external HTTP URLs, `/api/admin*`, `/api/customer-portal-sessions`, or `/api/admin-saved-bookings`.
- Public navigation contracts must continue coordinating the public route source privacy guard, public API client caller guard, and customer booking page API audit in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-client-navigation-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Client Navigation Boundary Guard
- `origin/staging` points to `c247a7338b7cd98b62f2e1f5a55919ceeac5858e` (`c247a73 Guard public client navigation boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public client navigation boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/book` remains guarded to keep only the existing internal customer portal link to `/my-bookings`.
- `/my-bookings`, `/driver-job/[token]`, and the driver job demo page remain guarded against public outbound links, deep links, app-store/native-app links, admin links, and session-issue links.
- Public client pages remain guarded against `window.open`, imperative navigation helpers, `mailto:`, `tel:`, SMS/WhatsApp deep links, external HTTP URLs, `/api/admin*`, `/api/customer-portal-sessions`, and `/api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Public Customer Form Surface Boundary Guard Lock
- Public customer booking request form surfaces are guarded across `/book`, `/my-bookings`, and `lib/customer-booking-request-adapter.ts`.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- `/book` and `/my-bookings` `BookingRequestForm` keys must stay limited to request-only customer trip/contact fields.
- `/book` required fields must stay limited to contact number, passenger name, pickup date, pickup time, pickup location, and drop-off location.
- `/my-bookings` new-request required fields must stay limited to contact number, passenger name, pickup date, and pickup time.
- Customer request field data attributes and static control names must stay on the approved form-field allowlist and must not introduce pricing, payout, PayNow, billing, invoice, payment/PDF, provider/send, auth, location-photo, calendar, parser/debug, token/secret, internal/admin finance/note, mock archive, or rate fields.
- `/book` continues to submit through `submitCustomerBookingRequest` and the customer-safe adapter, not raw fetch/session/admin plumbing.
- `/my-bookings` new-request form remains local review-only and does not submit to customer booking request persistence.
- Customer request copy must remain request-only and must not create a price, payment, invoice, PDF, or billing file from these forms.
- The customer request adapter may submit only the approved API payload fields and must not forward `specialRequest` or finance/internal/free-note fields.
- This guard coordinates the customer booking page API audit, public route source privacy guard, public API request input guard, and customer booking request adapter contract in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-form-surface-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer Form Surface Boundary Guard
- `origin/staging` points to `a2818ad3a1726369599f3076407791bfb7f9fc18` (`a2818ad Guard public customer form surface boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 0.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- A first local CDP expression attempt failed from shell quoting around an empty string before telemetry assertions; the corrected no-screenshot passive run passed and did not perform a screenshot, click, form submit, POST, write, or send.
- Screenshot captured: false.
- The public customer form surface boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/book` and `/my-bookings` customer request form surfaces remain guarded to request-only trip/contact fields and safe required fields.
- `/book` remains on `submitCustomerBookingRequest` through the customer-safe adapter without raw fetch/session/admin plumbing.
- `/my-bookings` new-request form remains local review-only and does not submit to customer booking request persistence.
- The customer request adapter remains limited to approved API payload fields and does not forward `specialRequest` or finance/internal/free-note fields.
- Customer request copy remains request-only and does not create a price, payment, invoice, PDF, or billing file from these forms.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Public Customer Portal Saved-Booking Surface Guard Lock
- Public customer portal saved-booking display/action surfaces are guarded across `/my-bookings`, `lib/customer-portal-saved-bookings-adapter.ts`, and `lib/customer-saved-bookings-read.ts`.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- `/my-bookings` saved-booking rows must render only customer-safe status, passenger, pickup/drop-off, service, vehicle, date/time, flight, and optional request-note display fields.
- `/my-bookings` saved-booking actions must stay limited to disabled PDF, local edit-review feedback, local cancel-review feedback, and local detail expansion.
- The customer PDF control must remain disabled/no-op and must not create files, links, downloads, invoices, payment records, or provider sends.
- Edit and cancel controls must remain local review requests only and must not call APIs, mutate bookings, submit forms, or change `/api/customer-saved-bookings`.
- The customer portal saved-bookings adapter must keep using the guarded read endpoint with `cache: "no-store"`, `credentials: "same-origin"`, and the customer saved-bookings purpose header without manual Cookie, Authorization, customer session-token, or admin headers.
- Customer saved-booking API and adapter output must stay limited to the approved saved-booking record fields and must exclude customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.
- This guard coordinates the customer portal saved-bookings adapter contract, customer saved-bookings API contract, public API response privacy guard, and public API client caller guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-portal-saved-booking-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer Portal Saved-Booking Surface Guard
- `origin/staging` points to `fa3ccf0a75358e4f1d05d8ce0f17634ba51a806e` (`fa3ccf0 Guard public customer portal saved-booking surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- First passive browser run rendered the page with 36 staging GET requests, 31 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 console errors, 0 runtime exceptions, and 0 dialogs, but it ended while 5 GET-only prefetch/script requests were still pending; it was rerun with a longer settle window.
- Corrected passive browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 2 GET-only RSC prefetch load-completion events for `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer portal saved-booking surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/my-bookings` saved-booking display/actions remain guarded to customer-safe fields, disabled PDF no-op, local edit-review feedback, local cancel-review feedback, and local detail expansion.
- The customer portal saved-bookings adapter remains guarded on `cache: "no-store"`, `credentials: "same-origin"`, and the customer saved-bookings purpose header without manual Cookie, Authorization, customer session-token, or admin headers.
- Customer saved-booking API and adapter output remains limited to the approved saved-booking record fields and excludes customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public API Logging Error Boundary Guard
- `origin/staging` points to `aa99c03e0770e2a587aa6fcaec9c045a0ad959f8` (`aa99c03 Guard public API logging error boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 2 GET-only RSC prefetch load-completion events for `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API logging/error boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Public API route/helper sources remain guarded against console logging, process stdout/stderr writes, telemetry capture calls, and raw request/body/header/token/cookie serialization.
- Public API route catch blocks remain generic and do not return caught error messages, stacks, raw request data, headers, cookies, or tokens.
- Customer-facing error responses remain mapped through safe fixed messages such as `customerSafeError`, auth-required results, and failed-safely fallbacks.
- Driver-facing error responses remain limited to safe reason enums, setup-only blocked messages, auth-required bidding errors, malformed issue alerts, and failed-safely fallbacks.
- Existing helper code may classify provider/adapter failures internally but must continue returning safe error strings/categories without logging raw errors.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public API Session Cookie Cache Boundary Guard
- `origin/staging` points to `a104b2d9d5580191901fe5053bd5557b831f8d52` (`a104b2d Guard public API session cookie cache boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 2 GET-only RSC prefetch load-completion events for `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `PHONE_REGISTRATION_ERROR`, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API session cookie/cache boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Only the customer portal session issue route may set `Set-Cookie` and `Cache-Control: no-store`.
- Customer portal session cookies remain HttpOnly, Secure, SameSite=Lax, Priority=High, path-scoped, max-age limited, server-token backed, and fail closed for unsafe configured cookie names.
- Customer booking request, booking memory, and portal saved-bookings client adapters remain on `credentials: "same-origin"`, `cache: "no-store"`, and purpose headers without manually attaching Cookie, Authorization, or customer session-token headers.
- Customer saved-bookings and booking-memory reads may accept only server-validated same-origin session cookies; ambiguous, wrong, unsafe, placeholder, or duplicate cookie values fail closed.
- Customer booking status remains on the explicit server session-token header contract and does not parse or set cookies.
- Driver public APIs remain cookie-free and do not set session cookies.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public API Request Input Boundary Guard
- `origin/staging` points to `969506aa82146e0ee8525110476e29b3405c0001` (`969506a Guard public API request input boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 0.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API request input boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Public customer/driver API request input boundaries remain guarded across customer booking request, customer saved bookings, customer booking memory, customer booking status, customer portal session issue, customer app notifications, driver job status, driver job notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.
- Customer booking request POST input remains limited to the approved customer form fields and rejects forbidden or unknown finance/internal/parser/token/archive fields before persistence.
- Customer saved-bookings, booking-memory, and booking-status read inputs keep explicit query allowlists and forbidden-fragment checks on both query keys and values.
- Customer portal session issue input remains server-gated by purpose/origin/referer/token headers and is not called from customer UI/client code.
- Driver status and notification inputs remain limited to current safe status, safe note/context, notification id/status, and driver_app delivery surface boundaries; driver issue-alert input remains enum-only.
- Driver bidding remains blocked for GET/POST/PATCH until approved driver auth exists.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public API Method Surface Boundary Guard
- `origin/staging` points to `cc331e49298c4c5ba18f0cc1f72b4fe91661559a` (`cc331e4 Guard public API method surface boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, and GCM `DEPRECATED_ENDPOINT`; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API method surface boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Public customer/driver API method surfaces remain guarded across customer booking request, customer portal session, customer saved bookings, customer booking memory, customer booking status, customer app notifications, driver job link, driver job status, driver notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.
- Customer booking requests keep the existing guarded `POST` submission path while `GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` fail closed through `blockedResponse`.
- Customer saved-booking, booking-memory, booking-status, portal-session, and app-notification methods remain on their current safe read/auth-required or submit-only boundaries.
- Driver job methods remain limited to safe job `GET`, status `PATCH`, notification `GET`/`PATCH`, issue-alert `POST`, setup-only flight ETA `GET`, setup-only acknowledgement `GET`, and blocked driver bidding `GET`/`POST`/`PATCH`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public API Response Privacy Boundary Guard
- `origin/staging` points to `7709cc3ab4302b6d58c82d3812e45d27230f972c` (`7709cc3 Guard public API response privacy boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, and GCM `PHONE_REGISTRATION_ERROR`; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API response privacy boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Public customer/driver API response privacy remains guarded across customer booking request, customer saved bookings, customer booking memory, customer booking status, customer portal session, customer/driver app notifications, driver job link, driver job status, driver issue-alert, driver bidding, and driver flight ETA setup response contracts.
- Customer API responses remain limited to safe request/status/memory/saved-booking/session metadata and must not expose driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug internals, service-role/token/secrets, or mock QA/dev archive fields.
- Driver API responses remain limited to `SafeDriverJobPayload`, safe status/issue-alert metadata, disabled bidding/auth-required errors, safe notification records, and setup-only flight ETA metadata.
- Public API response contracts remain coordinated in `scripts/test-public-api-response-privacy-boundary-guard.mjs`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public API Source Privacy Boundary Guard
- `origin/staging` points to `58c4c69f1dc59ab7bd34639c386b923f3416b04f` (`58c4c69 Guard public API source privacy boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, and GCM `DEPRECATED_ENDPOINT`; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public API source privacy boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Public customer/driver API source privacy remains guarded across customer booking, customer portal, customer saved-booking/memory/status/notification, driver job, driver job status, driver job notifications, driver issue-alert, flight ETA setup, and driver bidding route sources.
- Intentional guarded imports from admin booking persistence, admin booking Supabase adapter, admin app notification persistence, and admin flight setup foundations remain allowed only for the existing public API setup/gated paths.
- Public API route files remain blocked from importing monthly billing, invoice/PDF, payment, pricing/customer_rates, payout/driver_payout_rules, parser/AI parse, location/photo/calendar activation, provider-send, or mock archive modules.
- Public API helper deny-lists remain locked against customer price, driver payout, PayNow payout details, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, service-role/token/secrets, and mock QA/dev archive fields.
- Public driver job response shape remains `SafeDriverJobPayload` with safe status history fields only.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public Route Source Privacy Boundary Guard
- `origin/staging` points to `9f39f231a8f9cde0d661e1edff45fb4b32cff86e` (`9f39f23 Guard public route source privacy boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 2 browser-canceled GET-only RSC prefetch load-completion events to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send actions.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, and GCM `PHONE_REGISTRATION_ERROR`; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public route source privacy boundary guard remains docs/test-only/read-only and does not approve endpoint migration.
- Customer booking and customer portal source remain guarded against driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, and mock QA/dev archive details.
- Driver job source remains guarded against customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, and mock QA/dev archive details.
- Driver job source keeps forbidden words only in protective redaction/blocking code such as `driverPaymentDetailLinePattern`, `lineValue`, `driverDetailLines`, and `unsafeStatusHistoryFragments`.
- Driver app updates and status history remain constrained to safe fields: `safe_title`, `safe_message`, and `safeNote`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Ledger Checkpoint Source-of-Truth Guard Lock
- Ledger checkpoint source-of-truth consistency is guarded.
- This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Checkpoint state must be recorded by commit hash and task name, not counters.
- The top latest staging-smoked app checkpoint must match the Next GPT Lock staging-smoked or implementation checkpoint line.
- The latest staging smoke section for the top checkpoint must name the same short hash and the full 40-character `origin/staging` hash.
- No inconsistent checkpoint counters are approved.
- This lock adds `scripts/test-ledger-checkpoint-source-of-truth-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Ledger Checkpoint Source-of-Truth Guard
- `origin/staging` points to `8bc78c68388136b7a93a450194776f42415e0476` (`8bc78c6 Guard ledger checkpoint source of truth`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, and GCM `DEPRECATED_ENDPOINT`; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The ledger checkpoint source-of-truth guard remains docs/test-only and does not approve endpoint migration.
- Checkpoint state remains recorded by commit hash and task name, not counters.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging No-Screenshot Request Smoke for Public Customer/Driver Visibility Boundary Guard
- `origin/staging` points to `de91f170301773aac975f4cc4f6bd2f8ecb664c8` (`de91f17 Guard public customer driver visibility boundary`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, and TensorFlow Lite delegate creation; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer/driver visibility boundary guard remains docs/test-only and does not approve endpoint migration.
- Customers must still never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive details.
- Drivers must still never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive details.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Staging Deploy Smoke for Load Bookings Typed Operational Display Merge
- `origin/staging` deployed to `6d331bf Guard Load Bookings typed operational display merge`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; the passive browser smoke observed GET requests only.
- Console/runtime errors: 0.
- Load Bookings typed operational display merge remains guarded.
- Typed safe-card fields remain primary for operational display, with sanitized legacy saved-booking operational card fields as fallback only.
- Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.
- No blind endpoint swap was performed.
- No env change, DB read/write, provider send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` route/helper change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card addition, or new shim was included.

### Staging Deploy Smoke for Load Bookings Form Mapping Split
- `origin/staging` deployed to `5b100a7 Split Load Bookings form mapping boundaries`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted.
- Console/runtime errors: 0.
- Load Bookings form mapping split was not actively exercised, but no unsafe Load Bookings/write signals were observed.
- All 6 runtime lanes remain parked: Load Bookings runtime read wiring, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Deploy Smoke After Form Mapping Ledger Deploy
- `origin/staging` deployed to `3ca1a59 Record staging smoke for Load Bookings form mapping split`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; the passive smoke observed network GET only.
- Console/runtime errors: 0.
- Load Bookings form mapping split remains safe and was not actively exercised.
- All 6 runtime lanes remain parked: Load Bookings runtime read wiring, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Deploy Smoke for Load Bookings Operational Display
- `origin/staging` deployed to `bc72391 Wire Load Bookings to operational safe display adapter`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered with the existing compact admin tabs.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; the passive smoke observed GET-only behavior.
- Console/runtime errors: 0.
- Load Bookings operational display mapping was present by static asset check.
- The old finance/payout label `Vehicle / pax / price` was absent from the passive DOM and staging assets.
- All 6 runtime lanes remain parked: Load Bookings runtime read wiring, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Deploy Smoke After Load Bookings DB Read Packet
- `origin/staging` points to `446d860 Add Load Bookings DB read approval packet`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted.
- Observed network behavior was GET only.
- Console/runtime errors: 0.
- Email, WhatsApp, SMS, and Telegram remain setup-only/no-live.
- All 6 runtime lanes remain parked: Load Bookings runtime read wiring, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Deploy Smoke for Disabled Load Bookings Typed Read Setup
- `origin/staging` deployed to `a68df2b Add disabled Load Bookings typed read endpoint setup`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted.
- Console/runtime errors: 0.
- Disabled typed Load Bookings read setup remains no-live/no-op.
- All 6 runtime lanes remain parked: Load Bookings runtime read wiring, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- No new UI sectors/cards were observed.
- No new shims were added.
- Passive setup-only `GET /api/admin-email-activation-preflight-setup` returned 403 without provider send, write behavior, or runtime activation.

### Driver Job Link GET Validation Lock
- GET/read for `/api/admin-driver-job-links` is fixed at `43c5970 Fix driver job link GET validation`.
- GET/read now accepts safe dashboard-style booking refs without noisy 400s.
- POST create validation remains strict.
- PATCH revoke behavior is unchanged.
- Token creation and revocation behavior is unchanged.
- No UI sectors/cards were added.
- No env, deployment, DB/write, or migration changes were made.
- No provider, sending, payment, PDF, payout, auth, location, photo, calendar, CRM-calendar, or risky shim behavior changed.
- Static/API coverage was added in `scripts/test-admin-driver-job-link-api-contract.mjs`.
- Stale wording was fixed in `scripts/test-company-traveler-identity-read-lock.mjs`.
- Checks passed for the implementation: `node scripts/test-admin-driver-job-link-api-contract.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.

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

### Email Activation Preflight Staging Read Cleanliness Lock
- `GET /api/admin-email-activation-preflight-setup` remains setup-only/no-live/no-send.
- Same-origin admin dashboard reads now return a clean blocked/setup-only 200 response even when the booking persistence write gate is open.
- Anonymous and cross-origin reads remain 403 blocked.
- The response still reports `activationReady: false`, `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.
- No provider env values are printed, required, or read.
- No SMTP/provider SDK/API activation, live send, DB read/write, migration, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card, or new shim is included.
- Focused coverage: `node scripts/test-admin-email-activation-preflight-setup-api-contract.mjs`.

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
- Unused legacy bookings shim surface retirement is done at `9aa4ab6 Retire unused legacy bookings shim surface`; `/api/admin-saved-bookings` was not changed, Save Booking + CRM remains on `/api/admin-bookings`, no UI changed, no DB/write behavior changed, no new shim was added, and pricing/payout/rates/full-driver/payment/PDF/billing/provider/auth/location/photo/calendar risky paths were not touched.
- Checks passed for `9aa4ab6`: `node scripts/test-legacy-admin-api-route-contract.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-core-booking-persistence-safe-path-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.
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
- unused legacy bookings shim surface

### Shim cleanup typed API inventory
- Remaining shim route: `app/api/admin-legacy-data/rest/v1/[table]/route.ts`, called by `app/page.tsx` through `adminLegacyDataClient`.
- Remaining shim families found: `companies` CRM create plus rate/payout-dependent save/override paths; `travelers` CRM/name-memory create/update plus traveler rate override writes; `rate_settings` default-rate upsert; full `drivers` read/profile save/delete. The legacy route also allowlists pricing/payout columns on these parked families.
- Existing typed replacements: `admin-bookers` and `admin-saved-addresses` are retired from the shim; `admin-companies-crm-identity` covers read-only companies id/company_name/domain lookup without rate/payout fields and is wired into company identity display when a safe company_id exists; `admin-travelers-crm-identity` covers read-only travelers id/company_id/name/contact/default-address/saved-address display lookup without rate/payout fields and is wired into traveler identity/default-address display; `admin-company-traveler-crm-write-readiness-setup-foundation`, `GET /api/admin-company-traveler-crm-write-readiness-preview-setup`, `GET /api/admin-company-traveler-crm-write-action-disabled-setup`, and `admin-company-traveler-crm-write-action-audit-payload-setup-foundation` cover setup-only blocked readiness/no-op action/audit payload results for future company/traveler CRM create/update/name-memory actions without rate/payout override fields, and `test-admin-company-traveler-crm-write-no-live-guard` guards the chain against live activation; `admin-driver-assignment-display` covers read-only driver id/name/contact/vehicle/plate/availability assignment/display lookup without payout/rate/pricing/billing/internal-note fields and is wired into the booking driver assignment display state/loader plus Driver Database display/search through separate typed display-only state; it is not wired into editable full driver profile save/delete or payout-aware saved-booking assignment paths; `admin-customer-name-memory` remains a narrow read-only helper/API but app display-read now uses the typed company/traveler identity APIs directly; `admin-rate-setup` covers read-only rate settings/company/traveler rate setup; `admin-driver-availability` covers availability-only driver PATCH; saved booking driver assignment has its own typed path and is not a full driver database replacement.
- Safe one-family-at-a-time order: companies CRM identity/domain typed API and display wiring are done; travelers CRM identity/default-address typed API and display wiring are done; company/traveler CRM write-readiness setup foundation/API, disabled action API, audit payload setup foundation, and no-live guard are done; driver assignment/display typed API, booking assignment display wiring, and safe Driver Database display/search split are done as separate safe reads; next full driver profile save/delete replacement remains parked until payout preferences, driver payout rules, notes, preferred areas, and airport permit notes are excluded or approval-gated; fourth `rate_settings` default-rate save; fifth company/traveler rate override writes; sixth driver payout rules/preferences.
- Risk requiring explicit approval: `customer_rates`, `driver_payout_rules`, pricing, payout, driver payout preferences, PayNow/payout-adjacent fields, and any customer/driver-visible finance exposure.
- Rule: no new shims. Replace remaining shim usage only with typed helpers, typed API routes, and direct contract tests.
- Shim cleanup no-new-shim guard is done.

### Remaining Shim Parked State Lock
- This lock is guarded by `scripts/test-remaining-shim-parked-state-lock.mjs`.
- No remaining low-risk read/display-only shim lane exists.
- Existing typed reads are: company/traveler identity display; driver display/search; rate setup read.
- Remaining legacy shim families are parked: `companies`, `travelers`, `drivers`, and `rate_settings`.
- Remaining parked behavior is write/edit/rate/full-profile only.
- Company/traveler writes must be split from `customer_rates` and `driver_payout_rules` before implementation.
- `rate_settings` save/upsert remains parked.
- Full driver profile save/delete remains parked.
- Pricing and payout remain parked.
- Future implementation must be one lane at a time with typed API, direct contract test, no-live guard, and rollback note.
- No runtime implementation is approved by this lock.
- No UI/API/helper behavior change, env change, deployment, DB/write, migration, new shim, payment, PDF, payout, auth, location, photo, calendar, provider, or live sending activation is approved.

### Companies/travelers legacy allowlist blocker lock
- `companies` and `travelers` cannot be removed from the `admin-legacy-data` allowlist yet.
- Typed companies API covers only safe read fields: `id`, `company_name`, and `domain`.
- Typed travelers API covers only identity/default-address display fields.
- `app/page.tsx` still uses legacy `companies` and `travelers` paths for create/update and rate override behavior.
- Rate override writes still depend on legacy `companies` and `travelers` and touch `customer_rates` / `driver_payout_rules`.
- Next safe split is separate typed company/traveler CRM create/update/name-memory APIs, excluding rate/payout override writes.
- `customer_rates`, `driver_payout_rules`, pricing, and payout remain parked until explicit approval.

### Company/Traveler CRM Write Split Plan Lock
- This is a docs/test-only plan guarded by `scripts/test-company-traveler-crm-write-split-plan.mjs`.
- Company/traveler identity display is already typed through `GET /api/admin-companies-crm-identity` and `GET /api/admin-travelers-crm-identity`.
- Company/traveler writes remain parked.
- Future company/traveler CRM write API must exclude: `customer_rates`, `driver_payout_rules`, pricing, payout, rate overrides, surcharge/payout fields, `pricing_source`, and payout snapshots.
- Rate override save/remove remains separate and parked.
- Future implementation must be one lane only: company/traveler CRM identity/contact write fields.
- Required direct contract tests before implementation: typed helper contract for allowed company/traveler CRM identity/contact write fields; GET/POST method contract for the new typed route; forbidden-field rejection for `customer_rates`, `driver_payout_rules`, pricing, payout, rate overrides, surcharge/payout fields, `pricing_source`, payout snapshots, payment, PDF, billing, provider/send, auth, location, photo, calendar, internal notes, and debug fields; no legacy shim usage in the typed write path.
- Required no-live guard: write remains disabled/no-op until explicit owner approval; no DB/write, env change, deployment, migration, provider/live sending, payment, PDF, payout, auth, location, photo, calendar, or new shim activation.
- Rollback/manual recovery note: keep the future split one lane only, revert the single split commit if guards or browser tests fail, restore parked legacy company/traveler write paths unchanged, rerun route-flow, identity-read, rate-override, shim-cleanup, preactivation, lint, and booking UI checks, and do not deploy or enable live DB/write without separate owner approval.
- No UI expansion is approved; keep the existing compact CRM area.
- No runtime implementation is approved by this plan.

### Company/Traveler CRM Runtime Write Approval Packet Lock
- Approval status: pending future runtime-write approval.
- This is a docs/test-only approval packet guarded by `scripts/test-company-traveler-crm-runtime-write-approval-packet.mjs`.
- Current company/traveler runtime writes remain parked.
- Existing legacy write flow still mixes CRM identity/contact with rate overrides, `customer_rates`, and `driver_payout_rules`.
- Existing CRM identity/contact write contract, disabled action, and audit payload setup remains setup-only/no-write/no-op.
- Future runtime lane may include only CRM identity/contact fields.
- Future runtime lane must exclude rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets.
- Future runtime wiring must not change Save Booking + CRM.
- Future runtime wiring must not change `/api/admin-saved-bookings`.
- Future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Future runtime wiring must not add new shims.
- Runtime DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.
- Required tests before any future wiring: typed CRM runtime route contract test, forbidden-field rejection guard, CRM identity/rate override payload split guard, rate override split/gating plan guard, CRM disabled action and audit setup guards, route-flow lock, no-new-shim guard, preactivation verification suite, lint, and booking UI browser test if `app/page.tsx` wiring changes.
- Rollback note: keep the future runtime write split one lane only; if any guard or browser test fails, revert the single runtime-wiring commit, restore the parked legacy company/traveler write paths unchanged, rerun CRM, rate override, route-flow, shim cleanup, preactivation, lint, and booking UI checks, and do not deploy or enable DB/write without separate owner approval.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky activation, UI sector/button/card, or new shim is approved by this packet.

### Company/Traveler CRM Runtime Write Action Gate Lock
- Bounded CRM identity/contact runtime write boundary is guarded by `scripts/test-company-traveler-crm-runtime-write-action-api-contract.mjs`.
- New route: `POST /api/admin-company-traveler-crm-runtime-write-action`.
- New server-only helper: `lib/admin-company-traveler-crm-runtime-write-action.ts`.
- The route uses the existing typed CRM identity/contact contract from `25d0703 Add typed company traveler CRM write foundation`.
- Stage 1 runtime app wiring calls the route from the existing Company/Boss Overrides save path through `saveCompanyTravelerCrmIdentityContactRuntime`; it sends only identity/contact payloads.
- Closed-gate/no-op CRM route responses are tolerated so current legacy rate override behavior is preserved until the CRM write gate is separately opened and verified.
- The existing legacy rate override fallback remains in place for gate-closed company/traveler creation; rate/pricing/payout migration remains separate.
- Load/save booking flow is unchanged; Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged and separate.
- Parser behavior and `/api/ai-parse` remain unchanged.
- The separate CRM write gate is `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`; it is closed by default and env values are never printed.
- With the CRM write gate closed, the route returns blocked/no-op and does not create a Supabase client.
- If the CRM write gate is opened later, a server-session admin/dispatcher actor is still required before any database client can be created.
- The route never calls `adminLegacyDataClient`, `adminLegacyTables`, or `/api/admin-legacy-data`.
- Safe company fields are limited to: `company_name`, `domain`, and safe record id.
- Safe traveler fields are limited to: `company_id`, `traveler_name`, `preferred_vehicle`, `default_address`, `default_pickup_address`, `default_dropoff_address`, `booker_name`, `booker_contact`, `booker_email`, and safe record id.
- Forbidden fields remain rejected/excluded: rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and tokens.
- No customer-visible driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive fields are exposed.
- No driver-visible customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive fields are exposed.
- No UI sectors, buttons, cards, layout changes, provider activation, live sending, env changes, deployment, DB write execution, migrations, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky rate/pricing/payout activation, or new shim is included in this lock.
- Additional `app/page.tsx` wiring beyond the existing Company/Boss Overrides identity/contact split and any live DB write execution remain separate future work and require dedicated verification before staging or production use.
- Checks for this lock: `node scripts/test-company-traveler-crm-runtime-write-action-api-contract.mjs`, `node scripts/test-company-traveler-crm-runtime-write-approval-packet.mjs`, CRM identity/contact disabled action and audit setup guards, CRM identity/rate override payload split guard, rate override split/gating plan guard, shim cleanup no-new-shim guard, preactivation verification suite, lint, build, booking UI browser test, `git diff --check`, and `git status --short`.

### Company/Traveler CRM Runtime Write Env Table Policy Guard Lock
- CRM identity/contact runtime write env/table-policy readiness is guarded without opening the write gate or executing a live DB write.
- This lock does not approve env changes, deployment, migrations, DB writes, live CRM activation, rate overrides, pricing, payout, provider/send, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, UI sectors/cards, or new shims.
- Required env names are limited to `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; env values must not be printed, logged, committed, or echoed.
- The CRM write gate remains closed by default; closed-gate/no-op responses must preserve the existing legacy rate override fallback until a separate owner-approved gate-opening pass.
- Future gate opening must verify table/policy readiness for `companies` and `travelers` only.
- Allowed future `companies` write fields are limited to `company_name` and `domain`, plus safe returned `id`.
- Allowed future `travelers` write fields are limited to `company_id`, `traveler_name`, `preferred_vehicle`, `default_address`, `default_pickup_address`, `default_dropoff_address`, `booker_name`, `booker_contact`, and `booker_email`, plus safe returned `id`.
- Forbidden fields remain excluded: rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and tokens.
- The helper must validate the CRM write gate and server-session admin/dispatcher actor boundary before creating any Supabase client.
- The helper must not use `adminLegacyDataClient`, `adminLegacyTables`, `/api/admin-legacy-data`, or any new shim.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged and separate.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Rollback note: close `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`, keep the legacy rate override fallback unchanged, rerun CRM runtime, rate split, shim cleanup, preactivation, lint, build, and booking UI checks, and do not deploy or write live data until rollback is verified.
- This lock adds `scripts/test-company-traveler-crm-runtime-write-env-table-policy-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Company/Traveler CRM Runtime Write Gate Preflight Setup Lock
- Setup-only CRM runtime write gate preflight is added at `GET /api/admin-company-traveler-crm-runtime-write-gate-preflight-setup`.
- New server-only helper: `lib/admin-company-traveler-crm-runtime-write-gate-preflight-setup.ts`.
- It is admin-gated, GET-only, setup-only, no-live, and no-op.
- It does not read or print env values; it lists env names only.
- It does not import Supabase, create a DB client, call `adminLegacyDataClient`, call `/api/admin-legacy-data`, or execute DB read/write.
- Gate opening remains blocked pending owner approval, env-name verification, `companies` and `travelers` table/policy verification, server-session admin/dispatcher verification, rollback/disable verification, and staging no-POST/write smoke.
- Allowed future CRM write fields remain company `company_name`/`domain` and traveler identity/contact/default-address fields only.
- Forbidden fields remain excluded: rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and tokens.
- No `app/page.tsx` runtime wiring, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider activation, live send, DB read/write, env change, deployment, migration, or new shim is included.
- This lock is guarded by `scripts/test-company-traveler-crm-runtime-write-gate-preflight-setup-api-contract.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.

### Company/Traveler CRM Runtime Write Activation Readiness Guard Lock
- Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`.
- This is a docs/test-only activation-readiness guard for `POST /api/admin-company-traveler-crm-runtime-write-action`.
- The company/traveler CRM identity/contact runtime boundary is already wired but remains closed by default through `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`.
- Allowed company activation scope remains limited to existing company `id`, action types `company_create` and `company_update`, and safe CRM identity fields only: `company_name` and `domain`.
- Allowed traveler activation scope remains limited to existing traveler `id`, action types `traveler_create` and `traveler_update`, and safe CRM identity/contact/default-address fields only: `company_id`, `traveler_name`, `preferred_vehicle`, `default_address`, `default_pickup_address`, `default_dropoff_address`, `booker_name`, `booker_contact`, and `booker_email`.
- Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.companies` and `public.travelers` table/policy proof for the safe CRM columns only, server-session admin/dispatcher proof, rollback/kill-switch proof, customer/driver finance visibility proof, and one bounded evidence window.
- Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.
- Future table/policy proof must verify access for `public.companies` and `public.travelers` safe CRM identity/contact columns only and must not include rate overrides, `customer_rates`, `driver_payout_rules`, customer pricing, driver payout, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields.
- Future rollback/kill-switch proof must close `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy rate override fallback/manual recovery plan intact.
- Any future write attempt, if separately approved, must be one bounded company/traveler CRM identity/contact create or update through the existing route only.
- Required tests before any future activation: `node scripts/test-company-traveler-crm-runtime-write-activation-readiness-guard.mjs`, `node scripts/test-company-traveler-crm-runtime-write-action-api-contract.mjs`, `node scripts/test-company-traveler-crm-runtime-write-approval-packet.mjs`, `node scripts/test-company-traveler-crm-runtime-write-env-table-policy-guard.mjs`, `node scripts/test-company-traveler-crm-runtime-write-gate-preflight-setup-api-contract.mjs`, `node scripts/test-company-traveler-crm-write-split-plan.mjs`, `node scripts/test-company-traveler-crm-write-foundation-lock.mjs`, `node scripts/test-admin-company-traveler-crm-identity-contact-write-contract.mjs`, `node scripts/test-admin-company-traveler-crm-identity-contact-write-action-disabled-setup-api-contract.mjs`, `node scripts/test-admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup-api-contract.mjs`, `node scripts/test-crm-identity-rate-override-payload-split.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `git diff --check`, `git diff --cached --check`, and `git status --short`.
- No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, rate override activation, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, PayNow, or mock QA/dev archive change is approved by this lock.
- This lock adds `scripts/test-company-traveler-crm-runtime-write-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Company/Traveler CRM Runtime Write Activation Readiness Guard
- `origin/staging` points to `dea22b3b05ff0afdbaac7b0e0e7510e1c900d453` (`dea22b3 Add CRM runtime write activation readiness guard`).
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET to `/api/admin-company-traveler-crm-runtime-write-action` returned HTTP 405, confirming the boundary remains POST-only and did not expose a GET/write path.
- Passive browser visual smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, and 0 non-200 responses.
- CDP also reported 2 browser-canceled GET-only RSC prefetch load-completion events to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send actions.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot evidence was captured at `/private/tmp/prestige-staging-dea22b3-smoke.png`.
- The company/traveler CRM runtime write activation-readiness guard remains docs/test-only and does not approve opening `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`.
- The company/traveler CRM typed runtime write gate remains closed by default through `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`; no live DB write was executed.
- Rate overrides, `customer_rates`, `driver_payout_rules`, customer pricing, driver payout, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and customer/driver mock QA/dev archive fields remain separated, parked, or excluded by their existing guards.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/buttons/cards were added.
- No new shims were added.

### Company/Traveler CRM Identity/Contact Write Foundation Lock
- This lock is guarded by `scripts/test-company-traveler-crm-write-foundation-lock.mjs`.
- Typed company/traveler CRM identity/contact write contract foundation is done at `25d0703 Add typed company traveler CRM write foundation`.
- Setup endpoint path: `/api/admin-company-traveler-crm-identity-contact-write-contract-setup`.
- New setup endpoint: `app/api/admin-company-traveler-crm-identity-contact-write-contract-setup/route.ts`.
- New foundation helper: `lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts`.
- This is setup-only and GET-only. It validates the future company/traveler CRM identity/contact write contract and keeps write flags disabled.
- No UI wiring was added.
- No `app/page.tsx` save flow changed.
- Save Booking + CRM behavior was not changed.
- `/api/admin-saved-bookings` was not changed.
- No parser or `/api/ai-parse` changes were made.
- No DB/write/live activation happened.
- Forbidden fields remain rejected/excluded: rate, pricing, payout, payment, PDF, billing, provider/send, auth, location, photo, calendar, internal, and debug fields.
- `customer_rates`, `driver_payout_rules`, rate overrides, pricing, and payout remain parked.
- No new shims were added.
- Checks passed: focused CRM identity/contact write contract test, company/traveler CRM write foundation lock guard, admin route flow lock, company/traveler identity read lock, CRM write split plan guard, rate override split gating plan, remaining shim parked state lock, shim cleanup no-new-shim guard, preactivation verification suite, `npm run lint`, `git diff --check`, and `git status --short`.
- No env change, deployment, DB/write, migration, Supabase key use, parser change, provider/sending/payment/PDF/payout/auth/location/photo/CRM-calendar/risky shim behavior change is approved by this lock.

### Rate Override Split/Gating Plan Lock
- This is a docs/test-only plan guarded by `scripts/test-rate-override-split-gating-plan.mjs`.
- No implementation is approved by this plan.
- Future design must separate these lanes before touching company/traveler legacy writes: company/traveler display/read; company/traveler create/update; customer rate overrides; driver payout rules; pricing/payout behavior.
- Company/traveler display/read lane: keep using typed read/display APIs only (`GET /api/admin-companies-crm-identity`, `GET /api/admin-travelers-crm-identity`, and narrow customer name memory reads) with display/identity/default-address fields only.
- Company/traveler create/update lane: keep blocked behind company/traveler CRM write-readiness, disabled action, audit payload, and no-live guard until separate approval; do not mix with rate override fields.
- Company/traveler legacy writes remain parked.
- Rate override save/remove remains parked.
- `customer_rates` and `driver_payout_rules` remain excluded.
- Pricing/payout remains excluded.
- Customer rate overrides lane: company/traveler legacy writes remain parked; rate override save/remove remains parked; `customer_rates` and `driver_payout_rules` remain excluded.
- Driver payout rules lane: driver payout rules remain excluded from company/traveler CRM write/read splits and must not be exposed to customers or mixed into display-only data.
- Pricing/payout behavior lane: pricing/payout remains excluded; `resolvePricing`, customer price, driver payout, saved-booking payout snapshots, PayNow/payout details, billing, payment, and PDF behavior must not be touched in the same pass.
- No UI/API behavior changes are approved by this plan. No live DB/write, env, deployment, migration, new shim, payment, PDF, payout, auth, location, photo, calendar, provider, or live sending activation is approved.
- Required future tests before implementation: `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-admin-companies-crm-identity-api-contract.mjs`, `node scripts/test-admin-travelers-crm-identity-api-contract.mjs`, `node scripts/test-admin-company-traveler-crm-write-no-live-guard.mjs`, `node scripts/test-admin-rate-setup-api-contract.mjs`, `node scripts/test-core-booking-persistence-safe-path-guard.mjs` if booking/pricing/save state is touched, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Hard blockers: any implementation requiring `customer_rates`, `driver_payout_rules`, pricing, payout, rate override save/remove, company/traveler override writes, booking price/payout snapshots, full driver payout rules, payment/PDF/billing, provider/send, auth, location, photo, calendar writes, live DB/write, env/deploy/migration, or a new shim in the same pass.
- Rollback plan: keep any future implementation one lane at a time, revert the single split commit if guards or browser tests fail, restore the parked legacy company/traveler rate override save/remove paths unchanged, rerun route-flow, shim cleanup, rate setup, core booking, preactivation, lint, and booking UI browser checks, and do not deploy or enable live DB/write without separate owner approval.

### Company/Traveler Identity Read Lock
- This is a docs/test-only lock guarded by `scripts/test-company-traveler-identity-read-lock.mjs`.
- Typed identity display wiring is done at `69c269d Wire company traveler identity display to typed APIs`.
- GET /api/admin-companies-crm-identity is company identity read/display only.
- GET /api/admin-travelers-crm-identity is traveler identity/default-address read/display only.
- Company/traveler display-read now uses existing typed identity APIs: `GET /api/admin-travelers-crm-identity` and `GET /api/admin-companies-crm-identity`.
- Traveler identity/default-address display uses the typed read path.
- Company identity display uses the typed read path when a safe `company_id` exists.
- The typed identity routes remain GET-only, read-only, `writeEnabled false`, and `external_send false`.
- Company/traveler create/update/name-memory writes remain parked.
- Rate override save/remove remains parked.
- `customer_rates`, `driver_payout_rules`, pricing, payout, rate snapshots, and payout snapshots remain excluded.
- Save Booking + CRM behavior was not changed.
- `/api/admin-saved-bookings` was not changed.
- No new shims were added.
- Remaining legacy company/traveler call sites are blocked because they mix rate/payout fields.
- Future work must split identity, CRM writes, customer rates, driver payout rules, and `rate_settings` into separate typed lanes.
- Checks passed for the typed identity display wiring: `node scripts/test-company-traveler-identity-read-lock.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.
- No env change, deployment, DB/write, migration, new shim, payment, PDF, payout, auth, location, photo, calendar, provider, or live sending activation is approved.

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

### CRM Identity/Rate Override Payload Split Lock
- CRM identity/contact payload code is separated from rate override payload code at `d65aac1 Split CRM identity payload from rate override payload`.
- CRM identity/contact logic is further isolated from rate override save/remove at `fb2e9ca Finish CRM write rate separation boundary`.
- GET-only disabled/no-write CRM identity/contact write action boundary is done at `3cfd0a2 Add disabled CRM identity write action API`.
- Disabled action endpoint: `/api/admin-company-traveler-crm-identity-contact-write-action-disabled-setup`.
- Disabled/no-write CRM identity/contact audit payload setup is done at `db72c46 Add disabled CRM identity audit payload setup`.
- Audit payload setup endpoint: `/api/admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup`.
- It prepares the future audit evidence shape only.
- It does not persist audit logs.
- It does not call Supabase.
- It does not call `adminLegacyDataClient`.
- It uses the typed CRM identity/contact contract from `25d0703 Add typed company traveler CRM write foundation`.
- It validates safe company/traveler identity/contact fields.
- It rejects forbidden rate/pricing/payout/payment/internal/debug fields.
- It always stays no-write/no-op.
- Stage 1 CRM identity/contact runtime route mapping calls the typed CRM runtime write action from the existing Company/Boss Overrides save path with identity/contact payloads only.
- Closed-gate/no-op CRM route responses preserve current legacy rate override behavior.
- Rate override payload logic remains separate and parked.
- Rate override save/remove remains parked.
- `customer_rates` is tracked separately by the customer_rates runtime gate and app wiring locks.
- `driver_payout_rules` remains parked.
- Typed CRM write foundation is wired only through the gated CRM identity/contact runtime action path.
- `app/page.tsx` wiring is limited to the existing Company/Boss Overrides save flow; no UI layout, sector, button, or card was added.
- Save Booking + CRM is unchanged and remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` is unchanged and remains separate.
- Parser behavior and `/api/ai-parse` are unchanged.
- No UI change was made.
- No DB/write/live activation or Supabase use happened.
- No new shims were added.
- No env change, deployment, live DB/write execution, migration, UI sector/card, provider/sending, payment/PDF/payout, auth, location, photo, calendar, or live sending activation happened.
- The split is guarded by `scripts/test-crm-identity-rate-override-payload-split.mjs`.
- Checks passed for the separation boundary: `node scripts/test-crm-identity-rate-override-payload-split.mjs`, `node scripts/test-company-traveler-crm-write-foundation-lock.mjs`, `node scripts/test-admin-company-traveler-crm-identity-contact-write-contract.mjs`, `node scripts/test-company-traveler-crm-write-split-plan.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.
- Checks passed for the disabled CRM identity/contact write action API: `node scripts/test-admin-company-traveler-crm-identity-contact-write-action-disabled-setup-api-contract.mjs`, `node scripts/test-crm-identity-rate-override-payload-split.mjs`, `node scripts/test-company-traveler-crm-write-foundation-lock.mjs`, `node scripts/test-admin-company-traveler-crm-identity-contact-write-contract.mjs`, `node scripts/test-company-traveler-crm-write-split-plan.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.
- Checks passed for the disabled CRM identity/contact audit payload setup: `node scripts/test-admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup-api-contract.mjs`, CRM/shim/preactivation guard scripts, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `git diff --check`, and `git status --short`.

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

### Rate Settings Shim Split Approval Packet
- Approval status: pending owner approval.
- Goal: split safe read/display of default rate settings from risky write/update behavior before any future `rate_settings` shim replacement.
- Safe current path: read-only rate setup already exists through `GET /api/admin-rate-setup`; future work must preserve read/display-only behavior unless explicitly approved.
- `rate_settings` default-rate save remains parked; no implementation is approved by this packet.
- No UI change is approved. Do not add new sectors, buttons, cards, or rate surfaces as part of this planning packet.
- No DB/write, env, deployment, migration, Supabase key use, package change, or new shim is approved.
- Excluded fields/paths: `customer_rates`, `driver_payout_rules`, pricing, payout, rate overrides, company/traveler overrides, payment, PDF, billing, provider/send, auth, location, photo, and calendar-write fields.
- Required tests before any future implementation: focused typed helper/API contract test for the split, `scripts/test-admin-rate-setup-api-contract.mjs`, `scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `scripts/test-core-booking-persistence-safe-path-guard.mjs` if booking/pricing state is touched, `scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Hard blockers: any need to write default rates, customer rates, driver payout rules, pricing, payout, company/traveler overrides, booking price/payout snapshots, payment/PDF/billing fields, or rate override behavior in the same pass.
- Rollback plan for future implementation: keep changes one-family-only, revert the typed split commit if any guard/browser test fails, restore the parked `saveDefaultRates` legacy path unchanged, rerun rate setup, shim cleanup, core booking, and preactivation guards, and do not deploy or enable live DB/write until separate owner approval.

### Rate Settings Default Write Split Lock
- Rate settings default write split is locked by `scripts/test-rate-settings-write-split-lock.mjs`.
- `rate_settings` read path is already typed through `GET /api/admin-rate-setup`.
- Typed rate setup read is covered by `scripts/test-admin-rate-setup-api-contract.mjs`.
- `rate_settings` save/upsert remains parked in `saveDefaultRates` on the legacy `rate_settings` path.
- `rate_settings` is rate/pricing-related and must stay disabled/no-write until a separate explicit approval.
- `customer_rates`, `driver_payout_rules`, pricing, payout, rate overrides, company/traveler override writes, and booking price/payout snapshots remain parked.
- No runtime implementation is approved by this lock.
- No UI/API behavior change, DB/write, env, deployment, migration, Supabase key use, package change, or new shim is approved.
- Future implementation must be one typed lane only, with a direct contract test, no-live guard, rollback note, `scripts/test-admin-rate-setup-api-contract.mjs`, `scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `scripts/test-rate-override-split-gating-plan.mjs`, `scripts/test-remaining-shim-parked-state-lock.mjs`, `scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `git diff --check`, and `git status --short`.

### Disabled Rate Settings Write Action Setup Lock
- Disabled/no-write typed `rate_settings` write action setup is done at `945e894 Add disabled rate settings write action setup`.
- Setup route: `GET /api/admin-rate-settings-write-action-disabled-setup`.
- It validates allowed default `rate_settings` scalar shape only and remains disabled/no-write/no-op.
- `rate_settings` read path remains typed through `GET /api/admin-rate-setup`.
- Real `rate_settings` save/upsert remains parked in `saveDefaultRates` on the legacy `rate_settings` path.
- No runtime `app/page.tsx` wiring was added.
- Save Booking + CRM is unchanged and remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` is unchanged.
- Parser behavior and `/api/ai-parse` are unchanged.
- It does not call Supabase, `adminLegacyDataClient`, or any write path.
- `customer_rates`, `driver_payout_rules`, pricing, payout, and rate overrides remain parked.
- No new shims were added.
- No app behavior, UI, env, deployment, DB/write, migration, Supabase key use, provider/sending, payment/PDF/payout, auth, location, photo, calendar, CRM-calendar, or risky shim behavior changed.
- Checks passed for the implementation: `node scripts/test-admin-rate-settings-write-action-disabled-setup-api-contract.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, `git diff --cached --check`, and `git status --short`.

### Rate Settings Runtime Approval Packet Lock
- Approval status: Stage 1 scalar runtime wiring is active behind the closed typed write gate; full `rate_settings` save/upsert migration remains pending future approval.
- This is a docs/test-only approval packet guarded by `scripts/test-rate-settings-runtime-approval-packet.mjs`.
- `rate_settings` read path is typed through `GET /api/admin-rate-setup`.
- `rate_settings` safe scalar write path is called through `POST /api/admin-rate-settings-runtime-write-action`.
- `saveDefaultRates` still uses the legacy `rate_settings` shim path for parked `customer_rates` and `driver_payout_rules` map fields.
- Disabled `rate_settings` write action setup exists at `GET /api/admin-rate-settings-write-action-disabled-setup` and remains no-write/no-op.
- Current scalar runtime lane excludes `customer_rates`, `driver_payout_rules`, pricing, payout snapshots, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.
- Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.
- Current and future runtime wiring must not change Save Booking + CRM.
- Current and future runtime wiring must not change `/api/admin-saved-bookings`.
- Current and future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Current and future runtime wiring must not add UI sectors/buttons/cards.
- Current and future runtime wiring must not add new shims.
- Required tests before any future wiring: typed rate settings runtime contract test, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-admin-rate-settings-write-action-disabled-setup-api-contract.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep `saveDefaultRates` on the parked legacy `rate_settings` shim path until typed runtime wiring is separately approved, tested, and verified; if a future runtime wiring pass fails any guard, revert that single lane and restore the parked legacy path unchanged.
- No UI/API/helper behavior change outside the scalar rate settings boundary, env change, deployment, DB write execution, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky activation, UI sector/button/card, or new shim is approved by this packet.

### Rate Settings Runtime Write Action Gate Lock
- Typed `rate_settings` runtime write boundary is added at `POST /api/admin-rate-settings-runtime-write-action`.
- Stage 1 app wiring calls the route from `saveDefaultRates` through `saveDefaultRateSettingsScalarRuntime`; it sends only scalar default `rate_settings` fields.
- Closed-gate blocked/no-op responses are treated as non-blocking so the current legacy save behavior remains preserved.
- `saveDefaultRates` still uses the parked legacy `rate_settings` shim path for `customer_rates` and `driver_payout_rules` map fields.
- The dedicated gate is `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`; it is closed by default and env values are never printed.
- With the gate closed, the route returns blocked/no-op and does not create a Supabase client.
- If the gate is opened later, a server-session admin/dispatcher actor is still required before any database client can be created.
- Allowed scalar `rate_settings` fields are limited to `midnight_surcharge`, `extra_stop_surcharge`, `midnight_payout`, `extra_stop_payout`, `child_seat_customer_surcharge`, and `child_seat_driver_payout` with `id` fixed to `default`.
- Forbidden fields remain rejected/excluded: `customer_rates`, `driver_payout_rules`, customer price/rate maps, rate overrides, pricing/payout snapshots, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and tokens.
- No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider activation, live send, env change, deployment, migration, live DB write execution, or new shim is included.

### Rate Settings Save Defaults Boundary Split Lock
- Default rate save payload construction is split into `buildDefaultRateSettingsScalarPayload` and `buildDefaultRateSettingsLegacyRateMapsPayload`.
- The scalar helper contains only `id`, `midnight_surcharge`, `extra_stop_surcharge`, `midnight_payout`, `extra_stop_payout`, `child_seat_customer_surcharge`, and `child_seat_driver_payout`.
- The parked legacy maps helper contains `customer_rates` and `driver_payout_rules` only to preserve the current legacy `saveDefaultRates` behavior.
- `saveDefaultRates` calls `saveDefaultRateSettingsScalarRuntime` before the parked legacy save; the typed call sends only scalar fields and treats closed-gate no-op responses as non-blocking.
- When the typed scalar runtime reports saved, the parked legacy save keeps only `id`, `customer_rates`, and `driver_payout_rules`; scalar defaults are not duplicated through the legacy shim.
- `saveDefaultRates` still uses `.from(adminLegacyTables.rateSettings)` for the parked legacy `customer_rates` and `driver_payout_rules` maps.
- No env change, deployment, DB write execution, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider activation, live send, or new shim is included.

### Rate Settings Scalar Runtime Legacy Fallback Guard Lock
- Rate settings scalar runtime legacy fallback is guarded.
- Closed-gate/no-op typed scalar responses keep the existing legacy `rate_settings` fallback behavior unchanged.
- When the typed scalar runtime reports saved, `saveDefaultRates` keeps scalar fields out of the legacy shim follow-up.
- The legacy follow-up still carries parked `customer_rates` and `driver_payout_rules` map fields until those maps are separately migrated.
- The typed scalar runtime result now carries `saved: true` only for successful typed scalar writes.
- No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider send, env change, deployment, live DB write execution, or new shim is included.
- This lock adds `scripts/test-rate-settings-scalar-runtime-legacy-fallback-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Rate Settings Scalar Runtime Fallback
- `origin/staging` points to `68d75df109ab77af4259d213d29bdb83563a8d1d` (`68d75df Guard rate settings scalar runtime fallback`).
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Passive browser visual smoke rendered the main admin UI.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; checks were limited to passive page load, visible UI, screenshot, DOM, console, and safe GET evidence.
- Browser console error logs: 0.
- `Setup Readiness Archive` remained present; old `Internal QA / Mock Workbench Archive` / `Mock Workbench Archive` wording remained absent.
- Rate settings scalar runtime legacy fallback remains guarded by `68d75df Guard rate settings scalar runtime fallback`.
- The `rate_settings` typed scalar runtime write gate remains closed by default through `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`; no live DB write was executed.
- `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, and mock QA/dev archive fields remain separated, parked, or excluded by their existing guards.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/cards were observed.
- No new shims were added.

### Rate Settings Scalar Runtime Activation Readiness Guard Lock
- Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`.
- This is a docs/test-only activation-readiness guard for `POST /api/admin-rate-settings-runtime-write-action`.
- The `rate_settings` scalar runtime boundary is already wired but remains closed by default through `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`.
- Allowed scalar `rate_settings` fields remain limited to `midnight_surcharge`, `extra_stop_surcharge`, `midnight_payout`, `extra_stop_payout`, `child_seat_customer_surcharge`, and `child_seat_driver_payout` with `id` fixed to `default`.
- Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.rate_settings` table/policy proof, server-session admin/dispatcher proof, rollback/kill-switch proof, and one bounded evidence window.
- Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.
- Future table/policy proof must verify scalar-column access for `public.rate_settings` only and must not include `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.
- Future rollback/kill-switch proof must close `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.
- Any future write attempt, if separately approved, must be one default-row scalar upsert through the existing route only.
- Required tests before any future activation: `node scripts/test-rate-settings-scalar-runtime-activation-readiness-guard.mjs`, `node scripts/test-rate-settings-runtime-write-action-api-contract.mjs`, `node scripts/test-rate-settings-scalar-runtime-legacy-fallback-guard.mjs`, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-admin-rate-settings-write-action-disabled-setup-api-contract.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `git diff --check`, `git diff --cached --check`, and `git status --short`.
- No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, or mock QA/dev archive change is approved by this lock.
- This lock adds `scripts/test-rate-settings-scalar-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Rate Settings Scalar Activation Readiness Guard
- `origin/staging` points to `331f8548e89ee69ceabb52b62b9490c7b10a7679` (`331f854 Add rate settings scalar activation readiness guard`).
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Passive browser visual smoke rendered the main admin UI at desktop viewport.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request summary: 39 requests, 39 HTTP 200 responses, 0 non-GET requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Screenshot evidence was captured at `/private/tmp/prestige-staging-331f854-smoke.png`.
- The `rate_settings` scalar runtime activation-readiness guard remains docs/test-only and does not approve opening `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`.
- The `rate_settings` typed scalar runtime write gate remains closed by default through `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`; no live DB write was executed.
- `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, and mock QA/dev archive fields remain separated, parked, or excluded by their existing guards.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/cards were observed.
- No new shims were added.

### Pricing Customer Rates Boundary Split Lock
- Company/traveler customer rate override payload builders are split from driver payout override payload builders.
- `buildCompanyCustomerRateOverridePayload` and `buildTravelerCustomerRateOverridePayload` contain `customer_rates` only.
- `buildCompanyDriverPayoutOverridePayload` and `buildTravelerDriverPayoutOverridePayload` contain `driver_payout_rules` only.
- Existing `buildCompanyRateOverridePayload` and `buildTravelerRateOverridePayload` compose the split helpers to preserve current legacy behavior.
- Company/traveler rate override save/remove still keeps the existing legacy `adminLegacyDataClient` companies/travelers paths as the closed-gate fallback.
- This split did not by itself wire typed pricing/customer_rates runtime write; current customer_rates app wiring is tracked separately by the Customer Rates Runtime App Wiring Lock.
- No typed payout runtime write is wired by this split.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No UI sector/card, env change, deployment, DB read/write execution, provider activation, live send, or new shim is included.

### Customer Rates Runtime Write Gate Lock
- Added gated customer_rates runtime write boundary.
- New route: `POST /api/admin-customer-rates-runtime-write-action`.
- New server-only helper: `lib/admin-customer-rates-runtime-write-action.ts`.
- The write gate is closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.
- Allowed input is existing company/traveler `id`, action type, and safe `customer_rates` keys only: MNG, DEP, TRF, DSP.
- The route requires the existing admin/dispatcher boundary before any runtime write can proceed.
- With the gate closed, the route remains no-op and does not create a database client.
- If the gate is opened later, a server-session admin/dispatcher actor is still required before any database client can be created.
- Forbidden fields remain rejected/excluded: `driver_payout_rules`, driver payout, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, and mock QA/dev archive fields.
- The app rate override save/remove flow calls this typed boundary for `customer_rates` first.
- Closed-gate/no-op responses fall back to the existing legacy path to preserve current behavior.
- When the typed boundary reports `saved`, the legacy follow-up omits `customer_rates` and writes only parked `driver_payout_rules` plus allowed metadata.
- No typed payout runtime write is wired by this gate.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- No parser or `/api/ai-parse` change.
- No UI sector/card, env change, deployment, DB write execution, provider activation, live send, or new shim is included.

### Customer Rates Runtime App Wiring Lock
- Company/traveler rate override save/remove now calls the gated customer_rates runtime write boundary first.
- The route remains closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.
- Closed-gate/no-op responses fall back to the existing legacy combined path to preserve current behavior.
- When the typed customer_rates boundary reports `saved`, the legacy follow-up omits `customer_rates` and writes only parked `driver_payout_rules` plus allowed metadata.
- Driver-only override saves do not call the customer_rates runtime boundary.
- Remove override supports safe customer_rates clear through an empty customer_rates map.
- Typed payout app wiring is tracked separately by the Driver Payout Rules Runtime App Wiring Lock and remains excluded from customer_rates payloads.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.

### Customer Rates Runtime Create Path Lock
- New company/traveler rate override create paths defer customer_rates to the gated runtime boundary when customer rate overrides are present.
- Legacy create payload builders accept `includeCustomerRates` and can omit `customer_rates` before the runtime boundary runs.
- When the customer_rates runtime boundary reports saved, legacy follow-up keeps customer_rates omitted.
- When the customer_rates runtime boundary is closed/no-op, the existing legacy fallback writes customer_rates to preserve behavior.
- Driver payout rules are handled by the separate payout runtime boundary and remain excluded from the customer_rates runtime boundary.
- Guarded by `scripts/test-customer-rates-runtime-create-path-guard.mjs` and registered in the preactivation verification suite.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.

### Staging Smoke After Customer Rates Runtime Create Path
- `origin/staging` deployed to `e347e3d Route customer rates create path through runtime gate`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; passive browser smoke observed GET-only behavior.
- Console/runtime errors: 0.
- Known passive setup-only `GET /api/admin-email-activation-preflight-setup` returned 403 without provider send, write behavior, or runtime activation.
- Customer_rates create-path runtime gate remains guarded; no active customer_rates create/write flow was exercised by the smoke.
- Pricing and payout remain separate and parked; `driver_payout_rules` remains outside the customer_rates runtime boundary.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Smoke After Customer Rates Runtime Save Path
- `origin/staging` points to `c9008b4 Wire customer rates runtime save path`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Main admin UI rendered with the expected compact admin tabs: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; the passive smoke blocked and recorded zero unsafe requests.
- Runtime exceptions: 0.
- Known setup-only/admin-gated `GET /api/admin-email-activation-preflight-setup` returned 403 during passive render without provider send, write behavior, or runtime activation.
- Customer rates runtime app wiring remains guarded by `scripts/test-customer-rates-runtime-app-wiring.mjs`.
- `customer_rates` runtime DB write remains closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.
- `driver_payout_rules` and payout runtime remain separate and parked.
- Load Bookings remains on `GET /api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/cards were observed.
- No new shims were added.

### Pricing Customer Rates Runtime Approval Packet Lock
- Approval status: live DB write remains pending future approval; app-side gated customer_rates wiring is complete.
- This is a docs/test-only approval packet guarded by `scripts/test-pricing-customer-rates-approval-packet.mjs`.
- Customer rates/pricing app runtime wiring now calls the gated customer_rates boundary, but the live DB write remains closed by default.
- Pricing is coupled to `rate_settings`, company/traveler overrides, booking price/payout snapshots, and billing/payment/PDF-adjacent paths.
- `driver_payout_rules` and payout remain separate and parked.
- Current `rate_settings` read path is typed, and customer_rates app wiring is bounded to the gated customer_rates boundary only.
- Current company/traveler rate override save/remove calls the gated customer_rates boundary first, then falls back to the existing legacy combined path when the gate returns no-op.
- A gated customer_rates runtime write boundary is wired from `app/page.tsx`, but it remains closed by default and never carries `driver_payout_rules`.
- Future pricing lane may include only customer-facing pricing/customer_rates setup or contract fields after separate approval.
- Future pricing lane must exclude payout, `driver_payout_rules`, payment/PDF/billing activation, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.
- Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.
- Future runtime wiring must not change Save Booking + CRM.
- Future runtime wiring must not change `/api/admin-saved-bookings`.
- Future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Future runtime wiring must not add UI sectors/buttons/cards.
- Future runtime wiring must not add new shims.
- Required tests before any future live DB write: typed pricing/customer_rates runtime contract test, customer_rates app wiring guard, forbidden-field exclusion guard for payout, `driver_payout_rules`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets, `node scripts/test-pricing-customer-rates-approval-packet.mjs`, `node scripts/test-customer-rates-runtime-app-wiring.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: if the customer_rates gated runtime path fails any guard, revert that single lane and restore the closed-gate legacy fallback unchanged; keep broader pricing/customer_rates, booking snapshots, billing/payment/PDF, and payout lanes parked until separately approved, tested, and verified.
- No UI behavior change, env change, deployment, live DB write execution, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/payout/provider/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

### Customer Rates Runtime Activation Readiness Guard Lock
- Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.
- This is a docs/test-only activation-readiness guard for `POST /api/admin-customer-rates-runtime-write-action`.
- The `customer_rates` runtime boundary is already wired but remains closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.
- Allowed customer_rates activation scope remains limited to existing company/traveler `id`, action type, and safe `customer_rates` keys only: MNG, DEP, TRF, and DSP.
- Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.companies.customer_rates` and `public.travelers.customer_rates` table/policy proof, server-session admin/dispatcher proof, rollback/kill-switch proof, and one bounded evidence window.
- Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.
- Future table/policy proof must verify `customer_rates` column access for `public.companies` and `public.travelers` only and must not include `driver_payout_rules`, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.
- Future rollback/kill-switch proof must close `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.
- Any future write attempt, if separately approved, must be one bounded company/traveler `customer_rates` update or clear through the existing route only.
- Required tests before any future activation: `node scripts/test-customer-rates-runtime-activation-readiness-guard.mjs`, `node scripts/test-customer-rates-runtime-write-action-api-contract.mjs`, `node scripts/test-customer-rates-runtime-app-wiring.mjs`, `node scripts/test-customer-rates-runtime-create-path-guard.mjs`, `node scripts/test-pricing-customer-rates-approval-packet.mjs`, `node scripts/test-pricing-customer-rates-boundary-split.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `git diff --check`, `git diff --cached --check`, and `git status --short`.
- No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, `driver_payout_rules`, payout, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, or mock QA/dev archive change is approved by this lock.
- This lock adds `scripts/test-customer-rates-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Customer Rates Activation Readiness Guard
- `origin/staging` points to `d4d22e38f327e9a2d15ebe3d4511f4cf05bd02e7` (`d4d22e3 Add customer rates activation readiness guard`).
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Passive browser visual smoke rendered the main admin UI at desktop viewport.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request summary: 39 requests, 39 HTTP 200 responses, 0 non-GET requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Screenshot evidence was captured at `/private/tmp/prestige-staging-d4d22e3-smoke.png`.
- The `customer_rates` runtime activation-readiness guard remains docs/test-only and does not approve opening `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.
- The `customer_rates` typed runtime write gate remains closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`; no live DB write was executed.
- `driver_payout_rules`, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, and mock QA/dev archive fields remain separated, parked, or excluded by their existing guards.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/cards were observed.
- No new shims were added.

### Payout Runtime Approval Packet Lock
- Approval status: gated driver_payout_rules boundary and app fallback wiring are implemented; live DB write remains pending future env/table-policy approval.
- This is a docs/test-only approval packet guarded by `scripts/test-payout-approval-packet.mjs`.
- `driver_payout_rules` app runtime wiring now calls the closed-by-default payout boundary before legacy fallback.
- Payout is coupled to pricing/profit, `rate_settings`, company/traveler overrides, full driver profile, assignment, dispatch copy, and saved-booking snapshots.
- `customer_rates`/pricing must remain separate on the customer_rates runtime boundary.
- Payment/PDF/billing must remain separate and parked.
- Current `rate_settings` save/upsert, full driver profile save/delete, saved-booking driver assignment payout snapshots, and dispatch payout copy remain parked for payout purposes.
- Company/traveler rate override save/remove may call the gated payout boundary, but closed-gate/no-op responses preserve the existing legacy fallback.
- Future payout lane must prevent customer-visible payout leakage and driver-visible customer price/billing leakage.
- Future payout lane must exclude customer pricing, `customer_rates`, payment/PDF/billing activation, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.
- Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.
- Future runtime wiring must not change Save Booking + CRM.
- Future runtime wiring must not change `/api/admin-saved-bookings`.
- Future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Future runtime wiring must not add UI sectors/buttons/cards.
- Future runtime wiring must not add new shims.
- Required tests before any future live DB write or broader payout wiring: typed payout runtime contract test, payout runtime app wiring guard, customer/driver finance visibility guard, forbidden-field exclusion guard for customer pricing, `customer_rates`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets, `node scripts/test-payout-approval-packet.mjs`, `node scripts/test-driver-payout-rules-runtime-app-wiring.mjs`, `node scripts/test-pricing-customer-rates-approval-packet.mjs`, `node scripts/test-full-driver-profile-runtime-approval-packet.mjs`, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: if the payout gated runtime path fails any guard, revert that single lane and restore the closed-gate legacy fallback unchanged; keep broader payout surfaces in `rate_settings`, full driver profile, saved-booking assignment, dispatch copy, and booking snapshots parked until separately approved, tested, and verified.
- No env change, deployment, live DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/customer_rates/provider/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

### Payout Runtime Split Guard Lock
- `driver_payout_rules` payout payload builders remain split from customer_rates payload builders.
- Customer_rates runtime payloads and route remain customer-rate only and must never carry payout fields.
- Payout app wiring is guarded separately by `scripts/test-driver-payout-rules-runtime-app-wiring.mjs`.
- Closed-gate/no-op payout responses preserve the existing legacy combined company/traveler override fallback.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Customer-visible and driver-visible finance separation remains mandatory.
- The guard is registered in the preactivation verification suite as `scripts/test-payout-runtime-split-guard.mjs`.
- No UI sector/card, env change, deployment, DB write execution, provider activation, live send, or new shim is included.

### Driver Payout Rules Runtime Write Gate Lock
- Added gated `driver_payout_rules` runtime write boundary.
- New route: `POST /api/admin-driver-payout-rules-runtime-write-action`.
- New server-only helper: `lib/admin-driver-payout-rules-runtime-write-action.ts`.
- The route remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.
- It accepts company/traveler `driver_payout_rules` only.
- It validates safe booking-type payout rule fields: `MNG`, `DEP`, `TRF`, `DSP` with `min`, `max`, `amount`, and `perHour`.
- It rejects customer pricing, `customer_rates`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, secrets, PayNow, and payout preferences.
- Closed-gate/no-op behavior is preserved; no DB client is created while the gate is closed.
- App runtime wiring is guarded separately by `scripts/test-driver-payout-rules-runtime-app-wiring.mjs`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- The guard is registered in the preactivation verification suite as `scripts/test-driver-payout-rules-runtime-write-action-api-contract.mjs`.
- No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.

### Driver Payout Rules Runtime App Wiring Lock
- Company/traveler rate override save/remove now calls the gated `driver_payout_rules` runtime write boundary first.
- The route remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.
- Closed-gate/no-op responses fall back to the existing legacy path to preserve current behavior.
- When the typed payout boundary reports `saved`, the legacy follow-up omits `driver_payout_rules`.
- Customer_rates/pricing stays separate on the customer_rates runtime boundary.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- The guard is registered in the preactivation verification suite as `scripts/test-driver-payout-rules-runtime-app-wiring.mjs`.
- No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.

### Driver Payout Rules Runtime Activation Readiness Guard Lock
- Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.
- This is a docs/test-only activation-readiness guard for `POST /api/admin-driver-payout-rules-runtime-write-action`.
- The `driver_payout_rules` runtime boundary is already wired but remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.
- Allowed driver_payout_rules activation scope remains limited to existing company/traveler `id`, action type, booking types MNG, DEP, TRF, and DSP, and payout rule fields `min`, `max`, `amount`, and `perHour`.
- Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.companies.driver_payout_rules` and `public.travelers.driver_payout_rules` table/policy proof, server-session admin/dispatcher proof, rollback/kill-switch proof, customer/driver finance visibility proof, and one bounded evidence window.
- Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.
- Future table/policy proof must verify `driver_payout_rules` column access for `public.companies` and `public.travelers` only and must not include customer pricing, `customer_rates`, PayNow payout details, payout preferences, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.
- Future rollback/kill-switch proof must close `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.
- Any future write attempt, if separately approved, must be one bounded company/traveler `driver_payout_rules` update or clear through the existing route only.
- Required tests before any future activation: `node scripts/test-driver-payout-rules-runtime-activation-readiness-guard.mjs`, `node scripts/test-driver-payout-rules-runtime-write-action-api-contract.mjs`, `node scripts/test-driver-payout-rules-runtime-app-wiring.mjs`, `node scripts/test-payout-approval-packet.mjs`, `node scripts/test-payout-runtime-split-guard.mjs`, `node scripts/test-pricing-customer-rates-approval-packet.mjs`, `node scripts/test-customer-rates-runtime-activation-readiness-guard.mjs`, `node scripts/test-full-driver-profile-runtime-approval-packet.mjs`, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `git diff --check`, `git diff --cached --check`, and `git status --short`.
- No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, customer pricing, `customer_rates`, PayNow payout details, payout preferences, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, or mock QA/dev archive change is approved by this lock.
- This lock adds `scripts/test-driver-payout-rules-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Driver Payout Rules Activation Readiness Guard
- `origin/staging` points to `49039b90df8338af48e598308b7ebf5845fd8908` (`49039b9 Add driver payout activation readiness guard`).
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Passive browser visual smoke rendered the main admin UI at desktop viewport.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser response summary: 37 staging GET responses, 37 HTTP 200 responses, and 0 non-GET requests.
- CDP also reported 2 browser-canceled GET-only RSC prefetch load-completion events to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a`; both had HTTP 200 responses before cancellation and were not POST/write/send actions.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot evidence was captured at `/private/tmp/prestige-staging-49039b9-smoke-rerun.png`.
- The `driver_payout_rules` runtime activation-readiness guard remains docs/test-only and does not approve opening `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.
- The `driver_payout_rules` typed runtime write gate remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`; no live DB write was executed.
- Customer pricing, `customer_rates`, PayNow payout details, payout preferences, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, and customer/driver mock QA/dev archive fields remain separated, parked, or excluded by their existing guards.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Deploy Smoke for Driver Payout Rules Runtime Fallback
- `origin/staging` deployed to `4d1a187 Wire driver payout rules runtime fallback path`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Passive headless browser smoke rendered the main admin UI.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; passive network observation saw GET-only requests.
- Console/runtime errors: 0.
- Passive setup-only `GET /api/admin-email-activation-preflight-setup` returned 403 without provider send, write behavior, or runtime activation.
- Driver payout runtime app wiring guard, driver payout runtime write action guard, payout split guard, payout approval guard, preactivation verification suite, core booking safe-path guard, lint, and build passed before/after deploy.
- The `driver_payout_rules` runtime boundary remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`; no live DB write was executed.
- Customer pricing/customer_rates, payment/PDF/billing, provider/send, auth, location/photo/calendar, parser/debug, internal/admin notes, secrets, and broader payout surfaces remain separated or parked behind their own approvals.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No UI sectors/cards were added.
- No new shims were added.

### Full driver profile shim risk lock
- Full driver profile shim replacement is payout/internal-field entangled.
- `loadDrivers` reads `payout_preferences`, `driver_payout_rules`, `notes`, `preferred_areas`, and `airport_permit_notes`.
- `saveDriverProfile` writes `payout_preferences` and `driver_payout_rules`.
- Editable driver profile UI includes payout inputs.
- Legacy `drivers` route still includes payout/internal-note-adjacent fields.
- Safe driver assignment/display typed API already exists.
- Full driver profile write/delete path must stay parked until explicit split/gating approval.

### Full Driver Profile Save/Delete Split Readiness Lock
- Full driver profile save/delete split readiness is locked by `scripts/test-full-driver-profile-split-readiness-lock.mjs`.
- Remaining legacy driver shim call sites are `loadDrivers`, `saveDriverProfile`, and `deleteDriverProfile`.
- Full driver profile legacy path still exposes `GET`, `POST`, `PATCH`, and `DELETE` through the admin legacy data route.
- Loaded/saved legacy driver fields include `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, `availability_status`, `payout_preferences`, `driver_payout_rules`, `notes`, `preferred_areas`, and `airport_permit_notes`.
- Safe driver display/read is already typed through `GET /api/admin-driver-assignment-display`.
- Driver availability/deactivation is already typed through `/api/admin-driver-availability`.
- Full driver profile save/delete remains parked.
- Future safe shape must be disabled/no-write first.
- Allowed future safe fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.
- Forbidden fields remain parked: `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, internal/admin notes, payment, PDF, billing, provider/send, auth, location, photo, calendar, and debug.
- No runtime implementation is approved by this lock.
- No UI/API/helper behavior change, DB/write, env, deployment, migration, Supabase key use, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, package change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, or new shim is approved.

### Disabled Full Driver Profile Action Setup Lock
- Setup-only disabled/no-write full driver profile action boundary is done at `9ebaf97 Add disabled full driver profile action setup`.
- Safe allowed fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.
- Forbidden fields remain rejected/parked: `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, internal/admin notes, payment, PDF, billing, provider/send, auth, location, photo, calendar, and debug.
- No runtime `app/page.tsx` wiring was added.
- Driver save/delete behavior is unchanged.
- Save Booking + CRM is unchanged.
- `/api/admin-saved-bookings` is unchanged.
- Parser behavior and `/api/ai-parse` are unchanged.
- No UI sectors, buttons, or cards were added.
- No env, deployment, live DB/write execution, migration, Supabase use, or `adminLegacyDataClient` use happened.
- No provider/sending, payment/PDF/payout, auth, location, photo, calendar, CRM-calendar, or risky shim behavior changed.
- No new shims were added.
- Checks passed for the implementation: `node scripts/test-full-driver-profile-split-readiness-lock.mjs`, `node scripts/test-admin-driver-assignment-display-api-contract.mjs`, `node scripts/test-admin-driver-availability-api-contract.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.

### Disabled Full Driver Profile Audit Payload Setup Lock
- Disabled/no-write full driver profile audit payload setup is done at `0f25461 Add disabled full driver profile audit payload setup`.
- New setup route: `app/api/admin-full-driver-profile-action-audit-payload-setup/route.ts`.
- New server-only helper: `lib/admin-full-driver-profile-action-audit-payload-setup.ts`.
- It summarizes safe driver display field names and rejected forbidden-field counts only.
- It does not persist audit logs.
- It does not call Supabase.
- It does not call `adminLegacyDataClient`.
- It does not wire `app/page.tsx`.
- Driver save/delete behavior is unchanged.
- Save Booking + CRM is unchanged.
- `/api/admin-saved-bookings` is unchanged.
- Parser behavior and `/api/ai-parse` are unchanged.
- No UI sectors, buttons, or cards were added.
- No env, deployment, live DB/write execution, or migration changed.
- No provider/sending, payment/PDF/payout, auth, location, photo, calendar, CRM-calendar, or risky shim behavior changed.
- No new shims were added.
- Checks passed for the implementation: `node scripts/test-admin-full-driver-profile-action-audit-payload-setup-api-contract.mjs`, `node scripts/test-full-driver-profile-split-readiness-lock.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, `git diff --cached --check`, and `git status --short`.

### Full Driver Profile No-Live Guard Lock
- Dedicated static full driver profile no-live guard is done at `c9b1681 Add full driver profile no-live guard`.
- Guard covers both disabled setup boundaries: disabled full driver profile action setup and disabled full driver profile audit payload setup.
- Guard verifies setup-only/no-write status.
- Guard verifies no runtime `app/page.tsx` wiring.
- Guard verifies no driver save/delete behavior change.
- Guard verifies no Supabase, `adminLegacyDataClient`, or write path.
- Guard verifies no parser or `/api/ai-parse` change.
- Guard verifies no Save Booking + CRM change.
- Guard verifies no `/api/admin-saved-bookings` change.
- Forbidden fields remain parked: `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, internal/admin notes, payment, PDF, billing, provider/send, auth, location, photo, calendar, and debug.
- No new shims were added.
- Checks passed for the implementation: `node scripts/test-admin-full-driver-profile-no-live-guard.mjs`, `node scripts/test-admin-full-driver-profile-action-audit-payload-setup-api-contract.mjs`, `node scripts/test-full-driver-profile-split-readiness-lock.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-admin-route-flow-lock.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, `git diff --cached --check`, and `git status --short`.

### Full Driver Profile Runtime Approval Packet Lock
- Approval status: pending future runtime-wiring approval.
- This is a docs/test-only approval packet guarded by `scripts/test-full-driver-profile-runtime-approval-packet.mjs`.
- Full driver profile display/read is typed through `GET /api/admin-driver-assignment-display`.
- Driver availability/deactivation is typed through `/api/admin-driver-availability`.
- Full driver profile save/delete runtime remains parked.
- `loadDrivers`, `saveDriverProfile`, and `deleteDriverProfile` still use the legacy `drivers` shim path for full profile surfaces.
- Disabled full driver profile action setup, audit payload setup, and no-live guard already exist.
- Future runtime lane must exclude `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, internal/admin notes, payment/PDF/billing, provider/send, auth, location/photo/calendar, debug, and secrets unless separately approved.
- Future DB write/delete requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write/delete execution.
- Future runtime wiring must not change Save Booking + CRM.
- Future runtime wiring must not change `/api/admin-saved-bookings`.
- Future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Future runtime wiring must not add UI sectors/buttons/cards.
- Future runtime wiring must not add new shims.
- Required tests before any future wiring: typed full driver profile runtime contract test, `node scripts/test-full-driver-profile-runtime-approval-packet.mjs`, `node scripts/test-admin-full-driver-profile-no-live-guard.mjs`, `node scripts/test-full-driver-profile-split-readiness-lock.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep full driver profile save/delete on the parked legacy `drivers` shim path until typed runtime wiring is separately approved, tested, and verified; if a future runtime wiring pass fails any guard, revert that single lane and restore the parked legacy path unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write/delete, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky activation, UI sector/button/card, or new shim is approved by this packet.

### Full Driver Profile Runtime Write Action Gate Lock
- Added gated full driver profile runtime write/delete boundary.
- New route: `POST /api/admin-full-driver-profile-runtime-write-action`.
- New server-only helper: `lib/admin-full-driver-profile-runtime-write-action.ts`.
- The route remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.
- It accepts safe operational driver fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.
- Delete action accepts only a safe driver id plus the action type.
- It rejects `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, PayNow, and mock/archive fields.
- Closed-gate/no-op behavior is preserved; no DB client is created while the gate is closed.
- No `app/page.tsx` runtime wiring was added.
- Existing `loadDrivers`, `saveDriverProfile`, and `deleteDriverProfile` legacy fallback behavior remains unchanged.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- The guard is registered in the preactivation verification suite as `scripts/test-full-driver-profile-runtime-write-action-api-contract.mjs`.
- No UI sector/card, env change, deployment, live DB write/delete execution, provider activation, live send, or new shim is included.

### Staging Deploy Smoke for Full Driver Profile Runtime Write Gate
- `origin/staging` deployed to `e783817 Add full driver profile runtime write gate`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Safe GET to `/api/admin-full-driver-profile-runtime-write-action` returned HTTP 405, confirming the new boundary is deployed as POST-only and did not expose a GET/write path.
- Passive headless browser smoke rendered the main admin UI.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; passive browser network observation saw GET-only requests.
- Console/runtime errors: 0.
- The full driver profile runtime write gate remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`; no live DB write/delete was executed.
- Existing `loadDrivers`, `saveDriverProfile`, and `deleteDriverProfile` legacy fallback behavior remains unchanged.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No UI sectors/cards were added.
- No new shims were added.

### Full Driver Profile Runtime App Wiring Lock
- Driver Database save/delete now calls the gated full driver profile runtime write boundary first.
- The route remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.
- Closed-gate/no-op responses fall back to the existing legacy `drivers` shim path to preserve current behavior.
- When the typed full driver profile boundary reports `saved` or `deleted`, the legacy follow-up is skipped.
- The runtime payload includes safe operational driver fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.
- The delete runtime payload includes only a safe driver id plus action type.
- Payout preferences, driver payout rules, notes, preferred areas, airport permit notes, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, PayNow, and mock/archive fields remain outside the typed runtime payload.
- Existing legacy fallback still contains the parked full-profile fields while the gate is closed.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- The guard is registered in the preactivation verification suite as `scripts/test-full-driver-profile-runtime-app-wiring.mjs`.
- No UI sector/card, env change, deployment, live DB write/delete execution, provider activation, live send, or new shim is included.

### Full Driver Profile Runtime Activation Readiness Guard Lock
- Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.
- This is a docs/test-only activation-readiness guard for `POST /api/admin-full-driver-profile-runtime-write-action`.
- The full driver profile runtime boundary is already wired but remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.
- Allowed full driver profile activation scope remains limited to existing driver `id`, action types `full_driver_profile_save` and `full_driver_profile_delete`, and safe operational fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.
- Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.drivers` table/policy proof for the safe operational columns only, server-session admin/dispatcher proof, rollback/kill-switch proof, customer/driver finance and internal-field visibility proof, and one bounded evidence window.
- Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.
- Future table/policy proof must verify access for `public.drivers` safe operational columns only and must not include `payout_preferences`, `driver_payout_rules`, customer pricing, `customer_rates`, PayNow payout details, payout preferences, notes, preferred areas, airport permit notes, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.
- Future rollback/kill-switch proof must close `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.
- Any future write/delete attempt, if separately approved, must be one bounded driver save/update/delete through the existing route only.
- Required tests before any future activation: `node scripts/test-full-driver-profile-runtime-activation-readiness-guard.mjs`, `node scripts/test-full-driver-profile-runtime-write-action-api-contract.mjs`, `node scripts/test-full-driver-profile-runtime-app-wiring.mjs`, `node scripts/test-full-driver-profile-runtime-approval-packet.mjs`, `node scripts/test-admin-full-driver-profile-no-live-guard.mjs`, `node scripts/test-full-driver-profile-split-readiness-lock.mjs`, `node scripts/test-admin-full-driver-profile-action-disabled-setup-api-contract.mjs`, `node scripts/test-admin-full-driver-profile-action-audit-payload-setup-api-contract.mjs`, `node scripts/test-payout-approval-packet.mjs`, `node scripts/test-payout-runtime-split-guard.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `git diff --check`, `git diff --cached --check`, and `git status --short`.
- No env change, deployment, DB read/write/delete execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, preferred areas, airport permit notes, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, PayNow, or mock QA/dev archive change is approved by this lock.
- This lock adds `scripts/test-full-driver-profile-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Visual Smoke for Full Driver Profile Activation Readiness Guard
- `origin/staging` points to `566fdba7e34a88d189761d8fbd215446394c90ed` (`566fdba Add full driver profile activation readiness guard`).
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET to `/api/admin-full-driver-profile-runtime-write-action` returned HTTP 405, confirming the boundary remains POST-only and did not expose a GET/write/delete path.
- Passive browser visual smoke rendered the main admin UI at desktop viewport.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send/delete action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser response summary: 38 staging GET responses, 38 HTTP 200 responses, and 0 non-GET requests.
- CDP also reported 1 browser-canceled GET-only RSC prefetch load-completion event to the pre-existing admin Token Demo route `/driver-job/mock-driver-job-valid-a`; it had an HTTP 200 response before cancellation and was not a POST/write/send/delete action.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot evidence was captured at `/private/tmp/prestige-staging-566fdba-smoke.png`.
- The full driver profile runtime activation-readiness guard remains docs/test-only and does not approve opening `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.
- The full driver profile typed runtime write/delete gate remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`; no live DB write/delete was executed.
- `payout_preferences`, `driver_payout_rules`, customer pricing, `customer_rates`, PayNow payout details, payout preferences, notes, preferred areas, airport permit notes, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, and customer/driver mock QA/dev archive fields remain separated, parked, or excluded by their existing guards.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/cards were observed.
- No new shims were added.

### Staging Deploy Smoke for Full Driver Profile Runtime App Wiring
- `origin/staging` deployed to `4daf6ec Fix email activation preflight staging read`, including `9bffce6 Wire full driver profile runtime fallback path`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Safe GET to `/api/admin-full-driver-profile-runtime-write-action` returned HTTP 405, confirming the gated boundary remains POST-only and did not expose a GET/write path.
- Same-origin setup-only GET to `/api/admin-email-activation-preflight-setup` returned HTTP 200 with no live provider/send behavior.
- Passive headless browser smoke rendered the main admin UI.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; passive browser network observation saw 38 GET requests only.
- Console/runtime errors: 0.
- Failed network requests: 0.
- The full driver profile runtime write gate remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`; no live DB write/delete was executed.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- No UI sectors/cards were added.
- No new shims were added.

### Full Driver Profile Shim Split Approval Packet
- Approval status: pending owner approval.
- Goal: split safe driver display/operational fields from risky full profile save/delete fields before any future full-driver shim replacement.
- Safe possible future fields: driver name, phone/contact number, vehicle type, plate number, and availability/display status only where already supported by typed APIs such as `admin-driver-assignment-display` or `admin-driver-availability`.
- Excluded fields: `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, internal/admin notes, payment, PDF, billing, provider/send, auth, location, photo, and calendar-write fields.
- Full driver profile save/delete remains parked; no implementation is approved by this packet.
- No UI change is approved. Do not add new sectors, buttons, cards, or profile surfaces as part of this planning packet.
- No DB/write, env, deployment, migration, Supabase key use, package change, or new shim is approved.
- Required tests before any future implementation: focused typed helper/API contract test for the split, `scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `scripts/test-core-booking-persistence-safe-path-guard.mjs` if booking state is touched, `scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Hard blockers: any need to read/write payout preferences, driver payout rules, pricing, payout, internal notes, preferred areas, airport permit notes, full profile delete, or saved-booking payout-aware assignment in the same pass.
- Rollback plan for future implementation: keep changes one-family-only, revert the typed split commit if any guard/browser test fails, restore the legacy full driver profile parked path unchanged, rerun shim cleanup and preactivation guards, and do not deploy or enable live DB/write until separate owner approval.

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

### Safe driver profile display split lock
- Safe driver profile display split is done at `168d038 Split safe driver profile display from legacy shim`.
- Driver Database display/search now uses separate typed display-only state.
- The display-only state is fed by the existing `GET /api/admin-driver-assignment-display` route.
- Full driver profile save/delete remains parked on the existing legacy path.
- Payout, rate, and internal fields were not touched.
- Save Booking + CRM payload behavior was not changed.
- No new shims were added.
- No env changes, deployment, live DB/write, migrations, payment/PDF/payout, auth, location, photo, calendar, provider, or live sending happened.
- Checks passed for the implementation: `node scripts/test-admin-driver-assignment-display-api-contract.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser`, `git diff --check`, and `git status --short`.

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

### Staging Deploy Smoke After Provider Packets
- `origin/staging` points to `4f917e7 Add SMS provider no-send approval packet`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200.
- Visual staging smoke passed after the provider no-send packet deploy.
- Main admin UI rendered with the expected compact admin tabs: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was present but was not clicked.
- No forms were submitted.
- No POST/write/send was attempted; the passive smoke observed GET requests only.
- Console/runtime errors: 0.
- Email, WhatsApp, SMS, and Telegram remain setup-only/no-live.
- All 6 runtime lanes remain parked: Load Bookings runtime read wiring, company/traveler CRM runtime writes, `rate_settings` save/upsert runtime, full driver profile save/delete runtime, `customer_rates`/pricing, and `driver_payout_rules`/payout.
- No new UI sectors/cards were observed.
- No new shims were added.

### Email Provider No-Send Approval Packet Lock
- Approval status: pending future Email staging test approval.
- This is a docs/test-only no-send approval packet guarded by `scripts/test-email-provider-no-send-approval-packet.mjs`.
- Current Email routes remain setup-only/no-live:
  `GET /api/admin-customer-driver-details-email-preview-readiness-setup`,
  `GET /api/admin-customer-driver-details-email-review-item-setup`,
  `GET /api/admin-customer-driver-details-email-send-disabled-setup`,
  `GET /api/admin-email-provider-readiness-setup`,
  `GET /api/admin-email-provider-selection-setup`, and
  `GET /api/admin-email-activation-preflight-setup`.
- Current Email send surface remains disabled/no-op with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.
- No provider env values are printed, required, or read by the current Email setup-only routes/helpers.
- No SMTP/API/provider activation is approved.
- No live Email send is approved.
- Future staging Email test requires separate owner approval, secret-safe provider env-name handling, recipient allowlist, content guard, one-message test scope, and rollback/disable plan.
- Future Email content must exclude pricing, payout, payment/PDF, auth, location/photo/calendar, parser/debug, internal notes, and secrets.
- Future live/provider send wiring must not change Save Booking + CRM.
- Future live/provider send wiring must not change `/api/admin-saved-bookings`.
- Future live/provider send wiring must not change parser behavior or `/api/ai-parse`.
- Future live/provider send wiring must not add UI sectors/buttons/cards.
- Future live/provider send wiring must not add new shims.
- Required tests before any future Email staging send: `node scripts/test-email-provider-no-send-approval-packet.mjs`, `node scripts/test-email-no-live-guard.mjs`, `node scripts/test-customer-copy-multi-channel-no-live-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, provider env-name/secret-safe listing guard, recipient allowlist guard, content forbidden-field guard, single-send staging approval guard, rollback/disable verification guard, `npm run lint`, `npm run test:booking-ui-browser` if UI wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep Email on the setup-only disabled-send/preflight routes until a separate staging test is approved, guarded, and verified; if any future provider test fails, close the provider gate/env, redeploy if env changed, rotate exposed provider tokens, and restore the disabled/no-op route surface unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB read/write, migration, provider activation, live send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

### WhatsApp Provider No-Send Approval Packet Lock
- Approval status: pending future WhatsApp staging test approval.
- This is a docs/test-only no-send approval packet guarded by `scripts/test-whatsapp-provider-no-send-approval-packet.mjs`.
- Current WhatsApp routes remain setup-only/no-live:
  `GET /api/admin-whatsapp-customer-driver-details-preview-readiness-setup` and
  `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup`.
- Current WhatsApp send surface remains disabled/no-op with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.
- No provider env values are printed, required, or read by the current WhatsApp setup-only routes/helpers.
- No WhatsApp provider SDK/API activation is approved.
- No live WhatsApp send is approved.
- Future staging WhatsApp test requires separate owner approval, secret-safe provider env-name handling, recipient allowlist, template/content guard, one-message test scope, and rollback/disable plan.
- Future WhatsApp template/content must exclude pricing, payout, payment/PDF, auth, location/photo/calendar, parser/debug, internal notes, and secrets.
- Future live/provider send wiring must not change Save Booking + CRM.
- Future live/provider send wiring must not change `/api/admin-saved-bookings`.
- Future live/provider send wiring must not change parser behavior or `/api/ai-parse`.
- Future live/provider send wiring must not add UI sectors/buttons/cards.
- Future live/provider send wiring must not add new shims.
- Required tests before any future WhatsApp staging send: `node scripts/test-whatsapp-provider-no-send-approval-packet.mjs`, `node scripts/test-whatsapp-customer-driver-details-no-live-guard.mjs`, `node scripts/test-customer-copy-multi-channel-no-live-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, provider env-name/secret-safe listing guard, recipient allowlist guard, template/content forbidden-field guard, single-send staging approval guard, rollback/disable verification guard, `npm run lint`, `npm run test:booking-ui-browser` if UI wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep WhatsApp on the setup-only disabled-send route until a separate staging test is approved, guarded, and verified; if any future provider test fails, close the provider gate/env, redeploy if env changed, rotate exposed provider tokens, and restore the disabled/no-op route surface unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB read/write, migration, provider activation, live send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

### SMS Provider No-Send Approval Packet Lock
- Approval status: pending future SMS staging test approval.
- This is a docs/test-only no-send approval packet guarded by `scripts/test-sms-provider-no-send-approval-packet.mjs`.
- Current SMS routes remain setup-only/no-live:
  `GET /api/admin-sms-customer-driver-details-preview-readiness-setup` and
  `GET /api/admin-sms-customer-driver-details-send-disabled-setup`.
- Current SMS send surface remains disabled/no-op with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.
- No provider env values are printed, required, or read by the current SMS setup-only routes/helpers.
- No SMS API/provider activation is approved.
- No live SMS send is approved.
- Future staging SMS test requires separate owner approval, secret-safe provider env-name handling, recipient allowlist, content guard, one-message test scope, and rollback/disable plan.
- Future SMS content must exclude pricing, payout, payment/PDF, auth, location/photo/calendar, parser/debug, internal notes, and secrets.
- Future live/provider send wiring must not change Save Booking + CRM.
- Future live/provider send wiring must not change `/api/admin-saved-bookings`.
- Future live/provider send wiring must not change parser behavior or `/api/ai-parse`.
- Future live/provider send wiring must not add UI sectors/buttons/cards.
- Future live/provider send wiring must not add new shims.
- Required tests before any future SMS staging send: `node scripts/test-sms-provider-no-send-approval-packet.mjs`, `node scripts/test-sms-customer-driver-details-no-live-guard.mjs`, `node scripts/test-customer-copy-multi-channel-no-live-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, provider env-name/secret-safe listing guard, recipient allowlist guard, content forbidden-field guard, single-send staging approval guard, rollback/disable verification guard, `npm run lint`, `npm run test:booking-ui-browser` if UI wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep SMS on the setup-only disabled-send route until a separate staging test is approved, guarded, and verified; if any future provider test fails, close the provider gate/env, redeploy if env changed, rotate exposed provider tokens, and restore the disabled/no-op route surface unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB read/write, migration, provider activation, live send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

### Telegram Provider No-Send Approval Packet Lock
- Approval status: pending future Telegram staging test approval.
- This is a docs/test-only no-send approval packet guarded by `scripts/test-telegram-provider-no-send-approval-packet.mjs`.
- Current Telegram routes remain setup-only/no-live:
  `GET /api/admin-telegram-internal-admin-alert-preview-readiness-setup` and
  `GET /api/admin-telegram-internal-admin-alert-send-disabled-setup`.
- Current Telegram send surface remains disabled/no-op with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.
- No provider env values are printed, required, or read by the current Telegram setup-only routes/helpers.
- No Telegram bot token/API activation is approved.
- No live Telegram send is approved.
- Future staging Telegram test requires separate owner approval, secret-safe bot/env-name handling, recipient/chat allowlist, content guard, one-message test scope, and rollback/disable plan.
- Future Telegram content must exclude pricing, payout, payment/PDF, auth, location/photo/calendar, parser/debug, internal notes, and secrets.
- Future live/provider send wiring must not change Save Booking + CRM.
- Future live/provider send wiring must not change `/api/admin-saved-bookings`.
- Future live/provider send wiring must not change parser behavior or `/api/ai-parse`.
- Future live/provider send wiring must not add UI sectors/buttons/cards.
- Future live/provider send wiring must not add new shims.
- Required tests before any future Telegram staging send: `node scripts/test-telegram-provider-no-send-approval-packet.mjs`, `node scripts/test-telegram-internal-admin-alert-no-live-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, provider env-name/secret-safe listing guard, recipient/chat allowlist guard, content forbidden-field guard, single-send staging approval guard, rollback/disable verification guard, `npm run lint`, `npm run test:booking-ui-browser` if UI wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep Telegram on the setup-only disabled-send route until a separate staging test is approved, guarded, and verified; if any future provider test fails, close the provider gate/env, redeploy if env changed, rotate exposed bot tokens, and restore the disabled/no-op route surface unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB read/write, migration, provider activation, live send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

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
