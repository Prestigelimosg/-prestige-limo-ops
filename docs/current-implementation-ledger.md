# Prestige Limo Ops — Current Implementation Ledger

Latest known clean checkpoint:
e438e0c Add admin booking read no-live guard

Purpose:
This file is the repo source of truth for Codex and future work. Inspect this file before adding new UI, API, helper, test, or docs.

## Next GPT Lock / Uncompleted Backlog

- Latest repo commit to preserve as handoff baseline: `e438e0c Add admin booking read no-live guard`.
- Latest implementation checkpoint to preserve: `e438e0c Add admin booking read no-live guard`.
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
- Shim cleanup status: inventory and no-new-shim guard are done; companies CRM identity/domain typed API and travelers CRM identity/default-address typed API are done and wired into company/traveler display-read at `69c269d Wire company traveler identity display to typed APIs`; unused legacy bookings shim surface is retired; driver assignment display now uses the existing typed display-only API for the booking assignment display path; Driver Database display/search now uses separate typed display-only state fed by the existing `/api/admin-driver-assignment-display` route; company/traveler CRM write setup is locked through the activation stop; CRM identity/contact payload code is split from rate override payload code at `d65aac1 Split CRM identity payload from rate override payload`, the rate separation boundary is finished at `fb2e9ca Finish CRM write rate separation boundary`, the disabled CRM identity/contact write action API is done at `3cfd0a2 Add disabled CRM identity write action API`, the disabled/no-write typed `rate_settings` write action setup is done at `945e894 Add disabled rate settings write action setup`, the setup-only disabled/no-write full driver profile action boundary is done at `9ebaf97 Add disabled full driver profile action setup`, the disabled/no-write full driver profile audit payload setup is done at `0f25461 Add disabled full driver profile audit payload setup`, and the dedicated full driver profile no-live guard is done at `c9b1681 Add full driver profile no-live guard`; risky full-driver profile write/delete runtime paths, real `rate_settings` save/upsert, pricing, payout, `customer_rates`, and `driver_payout_rules` write paths remain parked.
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

### Operational-Only Load Bookings Runtime Mapping Guard Lock
- Stage 1 operational-only Load Bookings display mapping is guarded.
- Current Load Bookings remains on `GET /api/admin-saved-bookings`.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Safe DTO contract remains setup-only.
- Safe UI adapter/card contract remains setup-only.
- `app/page.tsx` uses a client-side operational display card mapper that mirrors the safe DTO plus safe UI adapter/card field shape without importing the server-only setup helpers.
- `app/page.tsx` now has a gated typed-read operational display bridge that can hydrate operational display cards from `GET /api/admin-load-bookings-typed-read` when the typed read gate and admin boundary allow it.
- The bridge keeps the loaded booking/form source on `GET /api/admin-saved-bookings` and silently falls back to the existing operational display card mapper when typed read is blocked, closed, or unavailable.
- No blind endpoint swap is approved.
- Operational display mapping uses safe operational card fields only.
- Operational display mapping must not feed safe operational card data into `bookingCardPriceLine`, `bookingRecordToForm` finance/payout mapping, driver dispatch payout copy, driver assignment payout controls, billing readiness finance paths, or `BookingRecord` finance/payout/internal fields.
- Dashboard/recent/completed operational display cards no longer render finance/payout price lines.
- Forbidden fields remain rejected/excluded from the operational mapping path: pricing, payout, `customer_rate`, `customer_price_amount`, `customer_rate_override`, `customer_price_override_reason`, `customer_rates`, `driver_payout_rules`, `driver_payout_min/max/amount/override/reason/unit`, `driver_notes`, `driver_dispatch_include_payout`, midnight_surcharge/payout, extra_stop_surcharge/payout, child_seat_customer_surcharge/driver_payout, `pricing_source`, rate overrides, payment, PDF, billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.
- Parser behavior and `/api/ai-parse` remain untouched.
- No direct Supabase, `adminLegacyDataClient`, or DB write path is introduced by this mapping guard.
- No new shims are added.
- This lock adds `scripts/test-load-bookings-operational-runtime-mapping-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No blind typed endpoint migration, Save Booking + CRM change, `/api/admin-saved-bookings` route/helper change, parser or `/api/ai-parse` change, env change, deployment, DB write, migration, `adminLegacyDataClient` behavior change, provider/sending, payment/PDF/payout, auth, location, photo, calendar, UI sector/button/card addition, or new shim is approved by this lock.

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
- Runtime behavior remains unchanged.
- Company/traveler CRM writes remain parked.
- Rate override payload logic remains separate and parked.
- Rate override save/remove remains parked.
- `customer_rates` and `driver_payout_rules` remain parked.
- Typed CRM write foundation is still not wired to runtime saves.
- No `app/page.tsx` wiring was added.
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
- Approval status: pending future runtime-wiring approval.
- This is a docs/test-only approval packet guarded by `scripts/test-rate-settings-runtime-approval-packet.mjs`.
- `rate_settings` read path is typed through `GET /api/admin-rate-setup`.
- `rate_settings` save/upsert runtime remains parked.
- `saveDefaultRates` still uses the legacy `rate_settings` shim path.
- Disabled `rate_settings` write action setup exists at `GET /api/admin-rate-settings-write-action-disabled-setup` and remains no-write/no-op.
- Future runtime lane must exclude `customer_rates`, `driver_payout_rules`, pricing, payout snapshots, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.
- Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.
- Future runtime wiring must not change Save Booking + CRM.
- Future runtime wiring must not change `/api/admin-saved-bookings`.
- Future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Future runtime wiring must not add UI sectors/buttons/cards.
- Future runtime wiring must not add new shims.
- Required tests before any future wiring: typed rate settings runtime contract test, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-admin-rate-settings-write-action-disabled-setup-api-contract.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep `saveDefaultRates` on the parked legacy `rate_settings` shim path until typed runtime wiring is separately approved, tested, and verified; if a future runtime wiring pass fails any guard, revert that single lane and restore the parked legacy path unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky activation, UI sector/button/card, or new shim is approved by this packet.

### Pricing Customer Rates Runtime Approval Packet Lock
- Approval status: pending future runtime-wiring approval.
- This is a docs/test-only approval packet guarded by `scripts/test-pricing-customer-rates-approval-packet.mjs`.
- Customer rates/pricing runtime remains parked.
- Pricing is coupled to `rate_settings`, company/traveler overrides, booking price/payout snapshots, and billing/payment/PDF-adjacent paths.
- `driver_payout_rules` and payout remain separate and parked.
- Current `rate_settings` read path is typed, but pricing/customer_rates runtime wiring is not approved.
- Current company/traveler rate override save/remove remains parked and still touches `customer_rates` with `driver_payout_rules`.
- Future pricing lane may include only customer-facing pricing/customer_rates setup or contract fields after separate approval.
- Future pricing lane must exclude payout, `driver_payout_rules`, payment/PDF/billing activation, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.
- Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.
- Future runtime wiring must not change Save Booking + CRM.
- Future runtime wiring must not change `/api/admin-saved-bookings`.
- Future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Future runtime wiring must not add UI sectors/buttons/cards.
- Future runtime wiring must not add new shims.
- Required tests before any future wiring: typed pricing/customer_rates runtime contract test, forbidden-field exclusion guard for payout, `driver_payout_rules`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets, `node scripts/test-pricing-customer-rates-approval-packet.mjs`, `node scripts/test-rate-override-split-gating-plan.mjs`, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep pricing/customer_rates runtime parked on the current legacy rate settings/company/traveler override and booking snapshot paths until a typed lane is separately approved, tested, and verified; if a future runtime wiring pass fails any guard, revert that single lane and restore the parked legacy paths unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/payout/provider/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

### Payout Runtime Approval Packet Lock
- Approval status: pending future runtime-wiring approval.
- This is a docs/test-only approval packet guarded by `scripts/test-payout-approval-packet.mjs`.
- `driver_payout_rules`/payout runtime remains parked.
- Payout is coupled to pricing/profit, `rate_settings`, company/traveler overrides, full driver profile, assignment, dispatch copy, and saved-booking snapshots.
- `customer_rates`/pricing must remain separate and parked.
- Payment/PDF/billing must remain separate and parked.
- Current `rate_settings` save/upsert, company/traveler rate override save/remove, full driver profile save/delete, saved-booking driver assignment payout snapshots, and dispatch payout copy remain parked for payout purposes.
- Future payout lane must prevent customer-visible payout leakage and driver-visible customer price/billing leakage.
- Future payout lane must exclude customer pricing, `customer_rates`, payment/PDF/billing activation, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.
- Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.
- Future runtime wiring must not change Save Booking + CRM.
- Future runtime wiring must not change `/api/admin-saved-bookings`.
- Future runtime wiring must not change parser behavior or `/api/ai-parse`.
- Future runtime wiring must not add UI sectors/buttons/cards.
- Future runtime wiring must not add new shims.
- Required tests before any future wiring: typed payout runtime contract test, customer/driver finance visibility guard, forbidden-field exclusion guard for customer pricing, `customer_rates`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets, `node scripts/test-payout-approval-packet.mjs`, `node scripts/test-pricing-customer-rates-approval-packet.mjs`, `node scripts/test-full-driver-profile-runtime-approval-packet.mjs`, `node scripts/test-rate-settings-runtime-approval-packet.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run test:booking-ui-browser` if `app/page.tsx` wiring changes, `git diff --check`, and `git status --short`.
- Rollback note: keep `driver_payout_rules`/payout runtime parked on the current legacy rate settings/company/traveler override, full driver profile, saved-booking assignment, dispatch copy, and booking snapshot paths until a typed lane is separately approved, tested, and verified; if a future runtime wiring pass fails any guard, revert that single lane and restore the parked legacy paths unchanged.
- No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/customer_rates/provider/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.

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
