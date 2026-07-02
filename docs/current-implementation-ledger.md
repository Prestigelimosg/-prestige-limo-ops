# Prestige Limo Ops — Current Implementation Ledger

Latest verified clean runtime checkpoint:
4aaacd88 Normalize service type aliases for pricing

Latest pushed main/staging runtime checkpoint:
4aaacd88 Normalize service type aliases for pricing

Latest remote main/staging deployment checkpoint verified before this docs note:
4aaacd88 Normalize service type aliases for pricing

Purpose:
This file is the repo source of truth for Codex and future work. Inspect this file before adding new UI, API, helper, test, or docs.

### Live Billing Rehearsal And Cleanup Closeout

- On 2026-07-02 14:29 SGT, the fresh visible Mac Chrome production billing rehearsal passed on `https://app.prestigelimo.sg` after the service-change price review runtime was live at `4aaacd88`.
- Successful safe fake booking: `ADM-20260702061357`.
- Successful safe fake billing account: `Codex Live Ops Account 20260702141102 Pte Ltd [Codex Traveler 20260702141102]`.
- The visible admin flow confirmed Billing Identity Review first, then `Save + CRM` saved the booking and displayed Google Calendar auto-sync success with no guest email sent.
- Completed Trip Closeout Review saved `ADM-20260702061357` as ready for billing prep.
- Customers > Unbilled Customers showed the booking, `Prepare` loaded it into Send Invoice Workbench, the admin entered reviewed amount `$55.00`, and the invoice preview showed the correct account, reference, amount, due date, and no card/payment action.
- `Issue` created stored invoice `INV-20260702-0001`, started PDF download, and removed the row from Unbilled Customers.
- The approved invoice email was sent only to `william@prestigelimo.sg`; the visible invoice row changed to `Emailed`, and William confirmed the email arrived.
- The customer portal access link for the same account opened `/my-bookings` without using the token as proof text. The customer-facing Invoices tab showed `INV-20260702-0001`, reference `ADM-20260702061357`, amount `$55.00`, due date `09 Jul 2026`, one stored PDF ready, and an enabled PDF action. The customer portal PDF download completed in Chrome as `INV-20260702-0001 (1).pdf`.
- The first attempted safe fake booking `ADM-20260702060846` was not used for invoice proof because its test passenger/account wording included `Invoice`, which the guarded customer account readers intentionally filter as unsafe text. No cleanup write was attempted for that abandoned test artifact.
- Cleanup decision: do not mark `INV-20260702-0001` Paid, do not create a credit note, and do not direct-delete invoice/booking rows. The current supported stored invoice mutations are Paid/Unpaid only; there is no approved stored void/archive/delete route. Marking a test invoice paid would create a false accounting trail, and creating a credit note would require first marking it paid and would also be misleading.
- The unpaid safe fake invoice remains in production as live acceptance evidence until a separate exact-reference, admin-gated void/test-cleanup lane is approved and implemented. Future cleanup must be scoped to `ADM-20260702061357`, `INV-20260702-0001`, and clearly linked safe fake records only, with no raw SQL, no Supabase CLI, no Vercel CLI, no secret output, no real customer data touch, and rollback/proof evidence.
- No Stripe/payment charge, payout, Paid click, SMS, WhatsApp, Telegram, provider dispatch send, GPS/live-location action, env change, DB schema change, Vercel CLI, or customer/driver message outside the approved invoice email occurred in this closeout.

### Save + CRM Billing Identity Review

- `Save + CRM`, lower `Save Operational Snapshot`, and `Update + Cal` now share a billing-identity review guard before writing admin booking persistence.
- The guard checks loaded records plus an admin-only capped `/api/admin-bookings?limit=200` read for the risky EA pattern: the same/similar company/account or same booker/contact already has different passenger/traveler names.
- Same-company matching ignores common account suffix tokens such as `Pte`, `Ltd`, `LLC`, `Company`, `Group`, `Singapore`, and `SG` before comparing; booker/contact and traveler names still use exact normalized matching.
- When that pattern is detected, the app shows a compact admin-only `Billing Identity Review` prompt in the Job Card Preview save area and blocks the save until the admin confirms the boss/traveler billing account.
- Confirmed review uses a distinct customer account label shaped like `Company [Traveler]` as the persisted `customer_display_name`. The existing `/api/admin-bookings` persistence adapter then finds or creates that customer account, and the existing unbilled/monthly invoice grouping path bills by that account label/id.
- If a conflict is detected but Passenger name is blank, the guard blocks save and asks the admin to enter the passenger/traveler name first.
- Normal one-company/one-traveler saves keep the existing customer/account behavior and do not show the prompt.
- This pass does not change DB schema, invoice/PDF/payment/payout/provider/GPS/live-location behavior, customer/driver public surfaces, parser behavior, or address suggestions.
- Focused guard coverage lives in `scripts/test-save-crm-billing-identity-review-guard.mjs`.

### Admin Dispatch Compact Live-Ops Rows

- Loaded operational snapshots now keep customer-review controls inside a compact row disclosure instead of expanding every booking into a large review card.
- The Day-of-Trip Dispatch Monitor progress controls now render as one compact row/wrap group instead of a large grid block.
- Active Jobs Map text was increased slightly for readability while keeping the section compact, and the driver location action is labelled `Driver Pin` with an explicit Google Maps search-pin URL.
- The Active Jobs Map runtime state pill now says `Live On` when active, so it is clearer that it is a status label and not a clickable map button.
- This is an admin UI wording/layout pass only. It does not activate a browser map key, change live-location/GPS capture behavior, change Vercel/env/DB schema, send customer/driver/provider messages, touch billing/payment/PDF/invoice/payout, change parser behavior, or change Save Booking/calendar behavior.
- Focused checks passed: driver live-location runtime UI guard, active jobs map contract guard, gated runtime evidence guard, Day-of-Trip Dispatch Monitor existing workflow lock, Day-of-Trip driver acknowledgement boundary guard, Load Bookings primary-list source boundary guard, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Admin Active Jobs Browser Map JavaScript API

- Admin Dispatch can render an optional same-window Google Maps JavaScript canvas inside the existing compact Active Jobs Map panel.
- The canvas is default-closed: it only loads after active driver markers exist and `/api/admin-active-jobs-map-browser-config` returns a configured browser-safe provider/key response.
- The browser config route uses the existing admin dispatcher boundary, same-origin dashboard purpose header, a separate `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER=google_maps_javascript` gate, `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, explicit `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS`, and optional `PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID`.
- The existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY` remains server-only for admin location search/route estimates and is not read or returned by the browser-map config route.
- If the configured Google Maps JavaScript renderer errors before producing a visible map DOM, the admin UI may fall back inside the same compact panel to a same-window Google road-tile map centered on the active driver marker, with tile attribution and the marker pin still rendered from the guarded admin live-location data.
- When the browser map config is missing or origin is not allowed, the admin UI stays compact, shows an embedded-map-off message, and keeps the per-driver `Driver Pin` Google Maps fallback links.
- The browser map canvas is admin-only and shows only active driver marker positions already returned by the guarded active-jobs map route.
- This lane does not change driver GPS capture, driver share/stop behavior, customer live maps, customer portal, public booking, billing/payment/PDF/invoice/payout, provider messaging, parser, Save Booking, `/api/admin-saved-bookings`, calendar, Vercel/env values, or DB schema.
- No `NEXT_PUBLIC_` map key is introduced; browser key values must never be committed, printed, logged, or pasted into docs.

### Admin Active Jobs Browser Map Environment Activation

- On 2026-07-01 21:30 SGT, Google Cloud project `Prestige Limo Ops Maps` / `prestige-limo-ops-maps` was used for the browser map key setup.
- The existing `Maps Platform API Key` was inspected and left unchanged because it is used for non-browser Maps APIs and should not be repurposed as the browser key.
- A separate browser-safe Google Maps key was created externally for the active jobs browser map, restricted to website referrer `https://app.prestigelimo.sg/*` and Maps JavaScript API only.
- Vercel production env was configured externally with `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER=google_maps_javascript`, `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, and `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS=https://app.prestigelimo.sg`.
- Production was redeployed from the current deployment through the Vercel web UI so the new env values are available to `https://app.prestigelimo.sg`.
- Redacted live config proof on `https://app.prestigelimo.sg/api/admin-active-jobs-map-browser-config` with the same-origin dashboard referer returned status `200`, `ok: true`, `enabled: true`, provider `google_maps_javascript`, and `apiKeyPresent: true`.
- The proof did not print, log, commit, or paste the API key value. No code, DB schema, driver GPS capture, customer live maps, booking save/load, calendar, billing/payment/PDF/invoice/payout, provider messaging, parser, or customer/driver notification behavior changed.

### Admin Active Jobs Browser Map Visual Readiness Fix

- Live headed Mac Chrome proof on `https://app.prestigelimo.sg/` used safe test booking `ADM-20260630171930` with a fresh one-time driver job link. The driver page opened, browser location permission was granted, and `Share Location` returned `Location shared for this job only.` with sharing state `active`.
- The production admin map read showed marker count `1`, marker row `ADM-20260630171930`, canvas state `ready`, and `Live driver map 1 pin`; however, a clipped headed-Chrome screenshot of the embedded map canvas showed only the panel header and a blank map area. DOM proof showed Google Maps runtime functions were present, but the map host had no `.gm-style` visual map DOM, so the embedded same-window map marker was not actually visible.
- The `Driver Pin` fallback link remained present and would still be needed on that production deployment until the visual map fix is deployed.
- A pre-existing runtime selection `CUST-20260628035919-0NIBST` had marker count `0` before the test. The test added `ADM-20260630171930` only temporarily, then `Stop Sharing` cleared the test marker, the fresh driver job link was revoked, the runtime was closed, and the pre-existing single selection was restored.
- After commit `6873c0ec` was pushed and production redeployed, a second live headed proof still failed the same-window embedded marker test: driver sharing succeeded and the admin marker row loaded, but the compact canvas correctly fell back to `Embedded map could not load. Use Driver Pin.` because Google Maps runtime initialization never reached `importLibrary`, `Map`, `Marker`, or `.gm-style` readiness. After commit `16c53d7e` was pushed and production redeployed, Google runtime readiness passed, but Mac Chrome rendered the embedded Maps JavaScript canvas through Google's static map image DOM and legacy `google.maps.Marker` did not produce a visible marker. After commits `956d37eb` and `d4e3f06e` were pushed and production redeployed, the same panel still did not allow Maps JavaScript to paint its map image inside the compact admin panel ancestry; the attempted Google Maps iframe frame also painted blank in live Chrome and was removed.
- The visible same-window admin map now first tries Google Maps JavaScript in a body-level fixed map host aligned over the compact Active Jobs Map slot, with same-window admin overlay pins rendered from the guarded active driver marker data. The configured browser-safe map route gates this admin-only feature, and the JavaScript path still waits for real Google Maps DOM before reporting `ready`. If Google Maps JavaScript errors or does not render visual DOM, the same host renders a same-window Google road-tile map centered on the active marker and waits for at least one tile image before reporting `ready`, so the admin can see the Google map and guarded marker in the same window instead of a false gray ready surface. If neither in-window Google map host renders, the compact panel falls back to the existing `Embedded map could not load. Use Driver Pin.` state instead of showing a false `1 pin` ready state.
- Focused guard coverage now locks this visual readiness boundary in `scripts/test-driver-live-location-browser-map-key-readiness-contract-guard.mjs`.
- Live headed Mac Chrome proof on 2026-07-02 00:09 SGT after deployed commit `beaaa0c5` used the same safe test booking `ADM-20260630171930` with a fresh one-time driver job link. The driver page opened, browser location permission was granted, and `Share Location` returned `Location shared for this job only.` with sharing state `active`.
- The production admin map read showed marker count `1`, marker row `ADM-20260630171930`, canvas state `ready`, `Live driver map 1 pin`, Google road tiles loaded from the same window, `Map tiles © Google` attribution, and one visible admin overlay marker inside the compact Active Jobs Map panel. The headed-Chrome screenshot verified the embedded same-window map marker was visible in the panel; the external `Driver Pin` fallback remained available but was not needed.
- Cleanup was completed: `Stop Sharing` cleared the test marker, the fresh driver job link was revoked, the runtime was closed, and the pre-existing runtime selection `CUST-20260628035919-0NIBST` was restored.
- This pass did not print, log, screenshot, or commit the browser map key value; did not use Vercel CLI; did not change env, DB schema, provider sends, billing/payment/PDF/invoice/payout, parser, Save Booking, customer messaging, driver messaging, customer live maps, address suggestions, or GPS/live-location scope beyond the bounded same-window driver marker proof.
- Checks passed: browser map key readiness guard, active jobs map contract guard, live-location runtime control UI guard, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Admin Dispatch Map Location Lookup

- The visible `Suggest` controls under Admin Dispatch Pickup, Drop-off, and Extra stop location fields were removed after live proof showed the production route was safely disabled by env. This avoids a visible button that can only return "not enabled or configured" during real operations.
- The guarded `/api/admin-map-location-search` server route and `Map Route Assist` lookup helper remain in place for future admin-only map work. Pickup/Drop-off `Resolve` inside `Map Route Assist` still uses the same guarded server route when the server env is intentionally enabled.
- The route remains admin-only through the existing same-origin admin dashboard boundary and `x-prestige-admin-purpose` header. The existing `PRESTIGE_GOOGLE_MAPS_API_KEY` remains server-side only and is not exposed to browser code, customer pages, or driver pages.
- Public `/book` and customer portal `/my-bookings` booking request forms remain unchanged. Customer-facing address suggestions still require a separate rate-limited customer-safe route or a separate browser-safe Places key plan.
- This lane does not embed a Google map, does not add a browser Maps JavaScript key, and does not change live-location/GPS behavior. Multi-driver live-location list and same-window embedded map remain separate lanes.
- No Vercel CLI, env value change, DB schema change, booking save/load behavior, parser behavior, customer message, driver notification, provider send, email, billing, invoice/PDF, payment, payout, calendar, or pricing behavior changed.
- Focused guard coverage lives in `scripts/test-admin-dispatch-map-location-suggestions-guard.mjs`; it now verifies the visible Suggest UI stays removed while the guarded server helper/API boundary remains available for Map Route Assist.

### Driver Live Location Multi-Driver Admin List

- Admin Dispatch has a compact Active Jobs Map runtime control inside the existing Day-of-Trip Dispatch Monitor.
- The control adds selected saved bookings one by one through `/api/admin-live-location-runtime` instead of replacing the previous selected booking.
- Runtime control keeps existing `driver_live_location_allowed_job_references`, removes duplicates, and caps the selected booking list at 50 references.
- Driver `Share Location` first calls `GET /api/driver-job/[token]/live-location` for server readiness; Chrome GPS is requested only after that readiness check passes.
- Admin marker refresh uses the existing guarded `GET /api/admin-active-jobs-map-locations` route and returns both selected booking references and current driver markers.
- The admin UI renders compact selected-booking chips, marker rows, Driver Pin fallback links, and an optional browser map canvas that remains off unless the separate browser-safe map config route is enabled.
- Closing the runtime clears the selected list and gates driver/customer map reads off.
- Customer live-location API remains same-origin/session/booking-boundary gated and no customer message is sent by this lane.
- No broad driver tracking, no wildcard job tracking, no existing server-side Google key exposure, no Vercel CLI, env value change, DB schema change, provider send, email/WhatsApp/SMS/Telegram send, billing/payment/PDF/invoice/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, or calendar behavior changed.
- Focused guard coverage lives in `scripts/test-driver-live-location-runtime-control-ui-guard.mjs`.
- Live Mac Chrome proof on `https://app.prestigelimo.sg/` after pushing `71f56f99` confirmed the Active Jobs Map UI shows `Add saved bookings one by one`, `Selected: 0`, `Add`, `Refresh`, `Close all`, and the updated admin-only boundary with `browser map key` blocked. No live `Add`/`Close all` action was clicked, so runtime location settings were not changed during proof.
- Live Mac Chrome proof on `https://app.prestigelimo.sg/` after pushing `b78c26d6` loaded saved booking `ADM-20260630171930`, opened Active Jobs Map for that one booking, created/copied the driver job link, and confirmed the live driver page route itself loads the driver page and exposes the `Share Location` control.
- Actual Mac Chrome geolocation was attempted first. Chrome did not grant the browser location permission, the driver page showed `Location permission was not granted`, admin marker count stayed `0`, then `Stop Sharing` and `Close all` were run so no runtime selection was left open.
- A controlled visible Chrome proof then used a Singapore test coordinate to verify the live wiring without pretending it was the user's physical GPS: admin runtime opened with `selected_count: 1`, driver `Share Location` returned `Location shared for this job only`, the driver page status settled to `Sharing` with permission `Allowed`, admin active-jobs read returned `marker_count: 1`, driver `Stop Sharing` returned `Location sharing stopped for this job`, admin read returned `marker_count: 0`, and `Close all` returned runtime `closed` with `selected_count: 0`.
- The proof did not print or expose the driver token in the ledger, did not use a browser Maps JavaScript key, did not embed a map, did not send customer/provider/email/WhatsApp/SMS/Telegram messages, did not change env/DB schema, did not create billing/payment/PDF/invoice/payout records, and left the admin live-location runtime closed.

### Admin Dispatch Draft Save Must-Fill Removal

- Admin Dispatch fields no longer show required asterisks; Save + CRM can save an admin draft even when customer/contact/date/route fields are blank.
- Blank admin draft values are saved through safe `To Confirm` placeholders where the `/api/admin-bookings` contract requires text, while optional Booker email still validates only when typed.
- The old Booker WhatsApp / Contact preflight and the old “review warnings before saving” checkbox gate were removed from the admin Save + CRM path.
- Google Calendar auto-sync is skipped for incomplete admin drafts that do not have real date/time or route details, so placeholder draft saves do not create fake calendar events.
- Public/customer booking request validation is separate and was not changed by this admin Dispatch draft lane.
- This keeps Save + CRM on `POST /api/admin-bookings`; it does not use `/api/admin-saved-bookings`, change parser behavior, change env/DB schema, send email/providers, activate Stripe/payment, touch invoice/PDF/payout/pricing, or activate GPS/live-location.
- Guard coverage lives in `scripts/test-dispatch-action-feedback-compact-guard.mjs`.

### WhatsApp Job Card Preview Format

- Dispatch `Job Card Preview` now uses the compact WhatsApp job-card format William requested: `VEHICLE - SERVICE`, blank line, `D Mon (Day), HHMMhrs`, blank line, route, blank line, passenger name, then pax/operational notes only when present.
- Vehicle defaults to `E / AVF` when no vehicle is stated. The formatter normalizes `E-Class / AVF` to `E / AVF` and maps short service codes as `DEP`, `MNG`, `TRF`, `DSP`, and `DWPU` only when explicitly present.
- Departure routes prefer `pickup > flight number`; if no flight is present they fall back to `pickup > airport/drop-off`. Arrival routes prefer `flight number > drop-off`. Transfer/hourly routes keep `pickup > stop(s) > destination`.
- The Job Card Preview scrubber strips customer price fragments such as `$70`, `$55`, or `SGD 70` before the driver-facing copy is shown or copied. This keeps the driver-facing Job Card Preview free of customer price, invoice/payment, payout, PayNow, email, and phone leakage.
- This change is intentionally limited to `Job Card Preview` / the `jobCard` copy target. Existing Customer Copy, Driver Dispatch, driver job link, invoice/customer portal, calendar save payload, billing, payout, payment, provider, GPS, and live-location paths were not reformatted by this lane.
- Focused formatter examples locked:
  - `AVF - DEP / 2 Jul (Thu), 0700hrs / Jalan Buloh Perindu > SQ708 / Ms. Nicole / 1 pax`.
  - `VVV - MNG / 28 Jun (Sun), 2115hrs / QF1 > The Outpost Hotel Sentosa / Belinda / 4 pax`, with `$70` stripped.
  - Missing vehicle/flight departure defaults to `E / AVF - DEP` and falls back to `Changi Airport Terminal 3`.
  - `VVV - DEP / 2 Jul (Thu), 2200hrs / Intercontinental Robertson > ET639 / Mr Temitope Taiye Elijah / 1 pax`, with `$55` stripped.
  - `E / AVF - TRF` multi-stop with child seat keeps compact route and `Child seat: 1 x booster seat`.
- Parser guard also locks the pasted `*2 x VVV - DEP* ... Intercontinental Robertson > ET639 ... Mr. Temitope Taiye Elijah $55` sample as `DEP`, `VVV`, `2026-07-02`, `2200hrs`, flight `ET639`, pickup `Intercontinental Robertson`, drop-off `Changi Airport`, passenger `Mr Temitope Taiye Elijah`, pax `1`, and no customer price override.
- Checks passed: `node --experimental-strip-types scripts/test-whatsapp-job-card-format.mjs`, `node scripts/test-whatsapp-job-card-preview-wiring-guard.mjs`, `npm run test:parser`, `node --check scripts/test-booking-ui-browser.mjs`, `npx tsc --noEmit --pretty false`, `npm run lint` with only the existing `loadBookings` warnings, `npm run build`, and `git diff --check`.
- This pass did not push/deploy, use Vercel CLI, change env/DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.

### Pickup-Only WhatsApp Timing And Address

- Dispatch job-card parsing now recognizes short pickup-only WhatsApp timing such as `the time for pickup on Sunday 5 July is at 8.30pm from Great World Service apartment`.
- Locked sample: `Hi William, the time for pickup on Sunday 5 July is at 8.30pm from Great World Service apartment. They have 6 x 23kg luggage. mr denis`.
- The sample parses as `TRF`, date `2026-07-05`, pickup time `2030hrs`, pickup `Great World Service apartment`, no invented drop-off, and pax remains `1` instead of treating `6 x 23kg luggage` as passenger count. This prevents the Dispatch form from falling back to the default `MNG`/arrival lane and showing a wrong missing-flight warning.
- Live Mac Chrome proof on `https://app.prestigelimo.sg/` after pushing `0a41c415` pasted the exact Denis/Great World message into Dispatch, clicked `Create Job Card`, and confirmed the live form filled booking type `TRF`, date `2026-07-05`, time `2030hrs`, pickup `Great World Service apartment`, pax `1`, blank flight, blank drop-off, and warnings for missing drop-off/name/contact only, with no missing-flight-for-arrival warning.
- This pass did not save a booking, sync calendar, touch live app data, use Vercel CLI, change env/DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: `npm run test:parser`, `node --check scripts/test-booking-ui-browser.mjs`, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Departure Pickup Time Beats Flight Schedule

- Dispatch job-card parsing now gives explicit pickup phrases such as `Pick up at 07:00` priority over flight schedule lines such as `Singapore 09:30 to Bangkok 11:00`.
- Locked sample: `Hi William. Need pick up for Nicole tomorrow - 2 Jul / home to airport - 1 Jalan Buloh Perindu / SQ 708 - Singapore to Bangkok / Singapore 09:30 to Bangkok 11:00 / 1 person / Pick up at 07:00`.
- The sample now parses as `DEP`, `2026-07-02`, pickup time `0700hrs`, flight `SQ708`, pickup `1 Jalan Buloh Perindu`, drop-off `Changi Airport`, passenger `Nicole`, pax `1`.
- The route parser also recognizes `home to airport - [address]` as an airport-departure pickup address instead of leaving pickup blank.
- Live Mac Chrome proof on `https://app.prestigelimo.sg/` after pushing `9392372b` pasted the exact Nicole/SQ708 message into Dispatch, clicked `Create Job Card`, and confirmed the live form filled `DEP`, `2026-07-02`, `0700hrs`, `SQ708`, pickup `1 Jalan Buloh Perindu`, drop-off `Changi Airport`, passenger/booker `Nicole`, and pax `1`.
- This pass did not save a booking, sync calendar, touch live app data, use Vercel CLI, change env/DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: `npm run test:parser`, `node --check scripts/test-booking-ui-browser.mjs`, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Narrated Round-Trip Airport Parser Choices

- Dispatch job-card parsing now treats a casual airport-transfer message with one departure flight plus one `return flight` as two selectable booking drafts instead of one merged draft.
- Locked sample: `Hi, can I book an airport transfer and pick up - 5 people + bags. We will need one forward facing booster seat. Pick up date 02 July at 6am SQ938. Return flight on the 10th July SQ939. mr. peter. 276 ocean drive lobb o`
- The first draft is `DEP`, `2026-07-02`, `0600hrs`, `SQ938`, pickup `276 Ocean Drive lobby O`, drop-off `Changi Airport`, passenger `Mr Peter`, pax `5`, child seat `1 x booster seat`.
- The second draft is `MNG`, `2026-07-10`, no pickup time invented, `SQ939`, pickup `Changi Airport`, drop-off `276 Ocean Drive lobby O`, passenger `Mr Peter`, pax `5`, child seat `1 x booster seat`.
- The parser warning remains active for this shape: operators must choose one extracted booking before the app fills the form, so the two flights cannot silently merge into one job card.
- The multiple-booking chooser now carries child-seat details into the booking form when a draft is selected.
- The duplicate parser-debug chooser is hidden during daily operation unless the parser debug panel is explicitly opened, so this two-booking message shows exactly two `Use this booking` choices.
- Local Mac Chrome proof on `http://localhost:3000/` pasted the exact customer sentence into Dispatch, clicked `Create Job Card`, confirmed exactly two choices with `SQ938`, `SQ939`, and `Child seat: 1 x booster seat`, then selected each draft. The first filled the departure fields above; the second filled the arrival/return fields above and left pickup time blank for admin review.
- Live Mac Chrome proof on `https://app.prestigelimo.sg/` after pushing `550ef1ab` repeated the same no-save flow: Dispatch showed exactly two `Use this booking` choices, the departure draft filled `DEP` / `2026-07-02` / `0600hrs` / `SQ938`, and the return draft filled `MNG` / `2026-07-10` / blank pickup time / `SQ939`; both kept pax `5` and `1 x booster seat`.
- This pass did not save a booking, sync calendar, touch live app data, use Vercel CLI, change env/DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: `npm run test:parser`, `node --check scripts/test-booking-ui-browser.mjs`, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Dispatch Job-Card Parser Boundary

- Dispatch `Create Job Card` now uses the job-card-only parser helper instead of the base booking parser directly.
- The base parser still extracts customer price overrides for parser/billing lanes that already rely on it, but the Dispatch job-card lane strips `customerPriceOverride` and `customerPriceOverrideReason` so pasted supplier/order totals do not pollute the driver job card draft.
- The exact pasted Prestige Transport airport-departure format with tab-delimited fields, Korean/Singapore route text, first/second pickup comments, Trip Organizer contact, Toyota Alphard vehicle text, and `Flight No. SQ892` is locked in the parser test.
- That exact job-card parse produces `DEP`, `AVF`, `2026-07-02`, `0705hrs`, `SQ892`, pickup `26 Newton Rd, 307957`, extra stop `28 Alexandra View, Singapore 158744`, drop-off `Changi Airport`, passenger `Pui Yu Chan`, pax `2`, booker `Mr Kim, Hyun Soo`, and no customer price override.
- Local Mac Chrome form proof on `http://localhost:3010/` pasted the exact supplier booking into Dispatch `Paste Booking Message`, clicked `Create Job Card`, and read back the same field values in the actual form. `Customer Price Override` and override reason stayed empty; the pasted supplier `S$120.00` was not carried into the job-card lane.
- Browser guard expectations now require Dispatch parsed customer price override fields to stay empty after `Create Job Card`; pricing/invoice work remains separate.
- This pass did not use Vercel CLI, change env, change DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: `npm run test:parser`, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, `git diff --check`, and `node --check scripts/test-booking-ui-browser.mjs`.

### Loaded Booking Calendar Update And Snapshot Finder

- Bookings opened from Dashboard/Bookings rows now convert the loaded `BookingRecord` into a safe admin operational persistence record and mark that booking reference as the active update target.
- After a saved booking is opened, editing the app form arms the Job Card primary action as `Update + Cal`; clicking it uses the existing guarded admin-booking `PATCH` path and then auto-syncs the same Google Calendar event for that booking reference.
- Operators do not need to delete the old Google Calendar event when edits are made in Prestige. Prestige remains the source of truth; edit in the app, then use `Update + Cal`.
- The lower Dispatch operational snapshot finder no longer renders only the first 3 records while saying more were loaded. It renders all matching loaded records inside a fixed-height scroll box with compact rows, so 25 loaded records stay searchable without giant cards.
- Customer request review controls in that snapshot finder remain admin-only and compact. They still do not contact customers, dispatch drivers, or expose price, billing, payout, payment, notification provider, parser/debug, GPS, photo, or internal finance data.
- The Load Bookings primary-list source boundary guard now fails if the loaded operational snapshot list reintroduces the three-row rendering cap or loses the scroll-box marker.
- This pass did not use Vercel CLI, change env, change DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: Load Bookings primary-list source boundary guard, Load Bookings typed-read admin display exposure guard, dispatch action feedback compact guard, admin booking Google Calendar sync API contract, admin route flow lock guard, full preactivation verification suite, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.
- Live Mac Chrome proof on `https://app.prestigelimo.sg/` after pushing `4b35cfdf` confirmed the lower Dispatch snapshot finder loaded 25 operational booking records, rendered 25 records, and used the fixed-height scroll box (`max-height: 512px`) instead of the previous first-3 rendering cap.
- Live Mac Chrome proof created fake booking `ADM-20260630181427` for passenger `Codex Calendar Sync 202606301813`; `Save + CRM` returned `Operational booking saved: ADM-20260630181427. Google Calendar auto-synced; reminders included; no guest email sent.`
- Editing that same booking in Prestige from `1530` / `Changi Airport Terminal 3` to `1600` / `Changi Airport Terminal 2` changed the Job Card primary button to `Update + Cal`; clicking it returned `Operational booking updated: ADM-20260630181427. Google Calendar auto-synced; reminders included; no guest email sent.`
- Read-only Google Calendar search for `ADM-20260630181427` showed `1 event found` on `Prestige Ops Calendar`, now at `16:00 - 17:30`, proving the app edit updated the existing event instead of creating a duplicate.
- Live Customers invoice path proof found 0 unbilled rows at test time, so no fresh unbilled invoice was created. Existing fake invoice `INV-20260630-0001` downloaded through the admin `PDF` UI as a 130,604-byte PDF, its `Paid`/`Unpaid` status toggle worked both directions, and it was restored to `Unpaid`.
- Live customer portal proof for `hourly-test-customer` opened `/my-bookings`, showed monthly `Quotations`, `Unpaid Invoices`, `Paid Invoices`, and `Credit Notes` folders, passed the forbidden text scan for payout/internal/debug/payment-provider fragments, and downloaded customer PDF `INV-20260629-0003 (2).pdf` as a 128,201-byte file.
- The live proof did not send invoice email, create payment links, charge Stripe/cards, call providers, change payouts, change DB schema, or activate GPS/live-location.

### Saved Booking Calendar Update Continuity

- Live Mac Chrome inspection found booking `ADM-20260630171930` was saved and loaded in Dispatch, but the lower persistence panel still said no operational snapshot was applied, so the update path was not naturally armed for same-event Google Calendar edits.
- Read-only live API proof confirmed `ADM-20260630171930` existed in `/api/admin-bookings` and was the first returned admin booking record.
- `Save + CRM` and the lower `Save Operational Snapshot` now mark the saved booking reference as the active/applied booking for future updates, and keep the saved record at the front of the loaded operational records.
- The Job Card primary action now changes from `Save + CRM` to `Update + Cal` when an active booking reference exists. Clicking it uses the existing guarded `PATCH /api/admin-bookings` update path and then auto-syncs the same saved booking to Google Calendar.
- Successful update sync now feeds the Job Card button feedback too, so the operator sees the completed `Saved` state after `Operational booking updated: ... Google Calendar auto-synced; reminders included; no guest email sent.`
- This pass did not use Vercel CLI, change env, change DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: dispatch action feedback compact guard, admin booking Google Calendar sync API contract, admin route flow lock guard, admin operational snapshot apply guard, full preactivation verification suite, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Job Card Button Separation And Typed Read Tolerance

- Live Mac Chrome inspection on `https://app.prestigelimo.sg/` confirmed the Job Card Preview actions are separated and compact as `Save + CRM`, `Calendar`, `Edit`, and `Copy`.
- DevTools console was cleared and showed `0 messages in console` at inspection time after the live typed-read fix was deployed.
- The live typed Load Bookings read route previously returned `422` with `rejected_fields: ["traveler_display_name"]` when one optional traveler label contained an unsafe/too-long admin-only display fragment.
- The mapper now treats `traveler_display_name` as an optional safe display label: unsafe optional traveler text is omitted from the typed card instead of rejecting the full booking list, while required/unsafe displayed fields continue to fail closed.
- Live read-back from `/api/admin-load-bookings-typed-read?limit=25` returned `200` after deployment, confirming the app no longer needs the legacy fallback for this safe optional traveler-label case.
- This pass did not use Vercel CLI, change env, change DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: focused Load Bookings typed-read and operational mapper guards, dispatch compact button guard, full preactivation verification suite, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Admin Operational Snapshot Apply Safety

- Live Mac Chrome testing on `https://app.prestigelimo.sg/` confirmed `Save Booking + CRM` now persisted the test booking `ADM-20260630160450` and auto-synced it to Google Calendar with reminders and no guest email sent.
- Google Calendar showed the event in `Prestige Ops Calendar` as `11:00 to 12:30, Prestige - TRF - Codex Calendar Test`, with reference, passenger, booker, route, flight, and pax in the event details.
- Before testing the edit/update click, applying the saved operational snapshot exposed a real bug: the app changed the saved `1100hrs` pickup into `0300hrs` because the DB returned the timestamp in UTC and the apply helper copied the UTC clock face instead of converting it back to Singapore time.
- The same apply path also failed to restore saved `flight_no` and assigned driver name/contact/plate, and used the customer/company display name as the Booker even when a saved contact display name existed.
- The apply path now uses one Singapore-time parser for timestamp display and saved-snapshot apply. Bare local timestamps stay direct; timezone-bearing DB/provider timestamps are converted to `Asia/Singapore`.
- Applying a saved operational snapshot now restores Booker from `contact_display_name`, flight from `flight_no`, and driver assignment from `driver_name`, `driver_contact`, and `driver_plate_number`.
- A new guard `scripts/test-admin-operational-snapshot-apply-guard.mjs` executes the exact failure shape (`2026-07-03T03:00:00+00:00`) and requires it to apply/display as `1100hrs` Singapore time. It also locks flight and driver restoration and is registered in the full preactivation suite.
- This pass did not change Vercel/env/DB schema, send email, activate Stripe/payment, create payouts, send providers, or change GPS/live-location behavior.
- Checks passed: admin operational snapshot apply guard, admin booking Google Calendar sync API contract, admin booking Supabase adapter mocked contract, dispatch action feedback compact guard, core booking persistence safe path guard, full preactivation verification suite, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` warnings, `npm run build`, and `git diff --check`.

### Live Admin Booking Save Boundary

- Live Mac Chrome verification on `https://app.prestigelimo.sg/` found that a filled `Save Booking + CRM` click reached `POST /api/admin-bookings` but was blocked at `403 Forbidden` before booking persistence.
- `/api/admin-bookings` now uses the same server-session admin boundary shape as other live admin write routes: same-origin admin dashboard `POST` and `PATCH` are allowed through the server-side admin/dispatcher role without exposing the private session token to the browser.
- Public/customer/non-dashboard surfaces remain blocked by the existing `x-prestige-admin-purpose` and same-origin `/` referer boundary before any write logic runs.
- The admin booking Supabase adapter contract now asserts the no-browser-token live-admin write path, so this exact `403` blocker cannot silently return.
- This pass did not change Vercel/env/DB schema, send email, activate Stripe/payment, create payouts, send providers, or change GPS/live-location behavior.
- Checks passed: admin booking Supabase adapter mocked contract, dispatch action feedback compact guard, core booking persistence safe path guard, full preactivation verification suite, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` dependency warnings, `npm run build`, and `git diff --check`.

### Admin Booking Save Safe Failure Diagnostics

- Admin booking persistence failures from `GET`, `POST`, and `PATCH /api/admin-bookings` now return admin-only safe labels as `safe_error_category` and `safe_error_operation` instead of only the generic `Admin booking persistence save failed safely.` message.
- The Supabase adapter labels safe failure stages such as `customer_lookup`, `customer_contact`, `booking_row`, `route_points`, `service_items`, `booking_reload`, and `audit_log`.
- Dispatch maps those safe labels into plain operator messages beside `Save Booking + CRM`, so a failed save can show whether the blocker is schema, table reachability, permission/RLS, configuration, or an unexpected route failure without exposing raw DB text, secrets, tokens, pricing, payout, billing, provider, GPS, parser/debug, or mock archive details.
- The admin booking adapter contract guard was refreshed to include the current calendar-safe booking fields (`flight_no`, driver name/contact/plate) and to load the current customer request notification helper dependencies in its temporary harness.
- This pass did not use Vercel CLI, change env, change DB schema, send email, activate Stripe/payment, send providers, create payouts, or change GPS/live-location behavior.
- Checks passed: admin booking Supabase adapter mocked contract, dispatch action feedback compact guard, core booking persistence safe path guard, full preactivation verification suite, `npx tsc --noEmit --pretty false`, `npm run lint` with only existing `loadBookings` dependency warnings, `npm run build`, and `git diff --check`.

### Load Bookings Guard Marker Refresh

- The Load Bookings typed-read admin display exposure guard now matches the current Dispatch memo order: `activeAdminDriverJobLink` is declared before Customer Copy, and the Driver Dispatch copy boundary now ends at `driverJobLinkMessage`.
- The selected-booking guard now separates the `BookingRecord` form source from the display-only typed operational card refresh. `loadSelectedBooking` must still load the editable booking form through `bookingRecordToForm(bookingRecord)`, while the typed refresh may only update `setLoadBookingsTypedOperationalCardsById` and `setLoadBookingsTypedOperationalCardOrder`.
- The admin Load Bookings CRM fallback compact guard now recognizes the current Dashboard default through `Home({ initialTab = "dashboard" })`, `useState<AppTab>(initialTab)`, and `useRef<AppTab>(initialTab)`.
- The public API source privacy guard allowlist now recognizes the existing customer booking request route's guarded admin app notification import path, matching the ledger-approved admin notification helper while keeping payment, billing, payout, parser/debug, provider-send, GPS/photo/calendar, and mock archive imports blocked.
- The public customer form surface guard now recognizes that `/my-bookings` portal booking requests require pickup and drop-off locations, matching the current portal form and the main `/book` request route requirement.
- The same public customer form surface guard now checks the current dynamic portal success copy: the request is received for review, is not confirmed yet, and `{companyName} staff` will reply to confirm availability.
- The customer portal saved-bookings read evidence guard now recognizes the current safe select indirection: `readCustomerSavedBookingRowsForSchema` selects `selectedColumns`, with current and foundation safe schemas supplied by `customerSavedBookingsCurrentSelect` and `customerSavedBookingsFoundationSelect`.
- The same saved-bookings read guard now recognizes `customerAccountBookingFilter`: UUID account references stay scoped by `customer_id = reference`, while named account references stay scoped by `customer_display_name ilike reference`.
- The customer driver status visibility guard now checks the same current/foundation customer saved-bookings safe select block instead of the removed single `customerSavedBookingsSelect` marker.
- The public OTS photo proof surface guard now allows exactly one `/my-bookings` `URL.createObjectURL` use inside the invoice PDF blob download helper, requires the paired `revokeObjectURL`, and continues to block public camera, file upload, storage, and photo proof activation fragments.
- The ledger checkpoint source-of-truth guard now validates the current top header format: latest verified clean runtime checkpoint, latest pushed main/staging runtime checkpoint, and latest remote main/staging deployment checkpoint.
- The current implementation ledger alignment guard now compares the current verified clean runtime checkpoint with the pushed main/staging runtime checkpoint and verifies that hash exists in git history.
- The customer/driver app compact surface guard now treats customer invoice/PDF folders as an approved customer portal surface while keeping billing, invoice, payment, PDF, customer price, PayNow, and payout language blocked from driver job pages.
- The controlled customer runtime activation contract guard now recognizes the same `customerAccountBookingFilter` customer saved-bookings isolation shape as the portal read guards.
- This is a test/ledger guard repair only. It does not change the live app runtime, Load Bookings button behavior, Vercel/env/DB schema, provider sends, email, Stripe/payment, GPS/live-location, billing, payout, or customer/driver-visible data.
- Focused checks passed: Load Bookings typed-read admin display exposure guard, admin Load Bookings CRM fallback compact guard, public API source privacy boundary guard, public customer form surface boundary guard, typed-read detail isolation guard, typed-read gated API contract, typed operational display merge guard, primary-list source boundary guard, and typed-read admin boundary order guard.

### Google Calendar Stable Event Identity

- Google Calendar live sync now builds deterministic Google event IDs from the Prestige booking reference only, not from `booking_reference + starts_at_local`.
- Future app-side booking edits, including pickup date/time changes, sync to the same Google Calendar event ID for that booking reference instead of creating a second calendar event.
- Save Booking + CRM, Save Operational Snapshot, and Update Applied Snapshot continue to auto-sync through the existing guarded Google Calendar route after the app save/update succeeds.
- Prestige remains the source of truth. Google Calendar edits still do not sync back into Prestige; make changes in the app and save/update again.
- Existing old Google Calendar events created before this fix used the previous time-based ID. New/future saves use the stable ID; any already duplicated old event may need one-time manual cleanup only if it was created before this fix.
- The Google provider write remains `sendUpdates=none`, no attendees, and calendar-native popup reminders only. This pass did not change Vercel/env/DB schema, send email, activate Stripe/payment, create payouts, send provider jobs, or change GPS/live-location behavior.
- Focused checks passed: admin booking Google Calendar sync API contract, dashboard urgent requests/active monitor guard, `npx tsc --noEmit --pretty false`, `npm run lint` with only the existing `loadBookings` dependency warnings, `npm run build`, and `git diff --check`.

### Dispatch Customer Copy Notes Removed

- Customer Copy in Dispatch now renders only `CUSTOMER BOOKING DETAILS` and `DRIVER DETAILS`; the previous `NOTES` block with surcharge, waiting-time, hourly grace, amendment, and confirmation/terms text has been removed from the generated copy.
- The small Customer Copy helper sentence `Customer notes included: midnight surcharge, waiting time, hourly grace, and amendment policy.` has also been removed from the Customer Copy UI.
- The Customer Copy-specific terms export was removed from `lib/customer-facing-booking-terms.ts` so future code cannot accidentally reattach those notes to the dispatch copy.
- After live still showed the old notes, remote `staging` was fast-forwarded from `91868f7a` to `811d7a1e` because the live deployment lane has been staging-based. `git ls-remote` verified both `origin/main` and `origin/staging` at `811d7a1e`.
- Public booking-request terms acceptance, customer-facing booking terms details, and invoice/monthly-billing footer note helpers remain intact; this change is limited to the admin Dispatch Customer Copy section.
- This pass did not change Vercel/env/DB schema, send email, activate Stripe/payment, create payouts, send provider jobs, or change GPS/live-location behavior.
- Focused checks passed: customer booking driver details copy preview guard, customer terms/hourly billing guard, `npx tsc --noEmit --pretty false`, `npm run lint` with only the existing `loadBookings` dependency warnings, `npm run build`, and `git diff --check`.

### Admin Calendar Save Auto-Sync

- Save Booking + CRM now preserves safe operational fields needed for dispatch calendar entries: service type, route summary, passenger name, flight number, and assigned driver name/contact/plate.
- Save Booking + CRM, the operational snapshot save action, and Update Applied Snapshot auto-sync the saved booking one-way to Google Calendar through the existing guarded Google sync route after the admin booking save/update succeeds.
- Prestige Limo Ops remains the source of truth. Google Calendar edits do not update the app; booking amendments must be made in Prestige, then saved/updated again.
- The Dashboard command centre now shows Admin App Notifications before Operations Calendar, and Operations Calendar states that save/update auto-syncs while Sync Google remains the loaded-bookings backup.
- Create Calendar Event remains the manual ICS/calendar-file export path and does not become a provider send path.
- Auto-sync uses the same safe calendar payload boundary as loaded-booking Google sync and continues to exclude customer pricing/rates, driver payout, billing/payment/invoice/PDF fields, internal admin/finance notes, parser/debug/mock archive fragments, provider payloads, secrets/tokens, live location, proof/photo, and unsafe notification fragments.
- This pass did not change Vercel/env/DB schema, send email, activate Stripe/payment, create payouts, send provider jobs, or change GPS/live-location behavior.
- Focused checks passed: dashboard urgent requests/active monitor guard, admin booking Google Calendar sync API contract, admin booking calendar agenda/event/sync-status API contracts, admin route flow lock guard, staging deployment approval packet guard, `node --check scripts/test-booking-ui-browser.mjs`, `npx tsc --noEmit --pretty false`, `npm run lint` with only the existing `loadBookings` dependency warnings, `npm run build`, and `git diff --check`.

### Admin Calendar Wired Path Live Proof

- Source-of-truth fix commits for the live calendar path are `7243c614` (saved-booking pickup time payload), `558f04cf` (same-origin browser calendar download route access), and `ea12f713` (Bookings row calendar identity).
- Production deployment `dpl_3AYsi2t2QBePo4wut3a17gHQzYeW` completed `READY` and was aliased to `https://app.prestigelimo.sg`.
- Live Mac Chrome verification on `https://app.prestigelimo.sg` confirmed the Dashboard `Operations Calendar` `Sync Google` action succeeded for 3 loaded events with Google reminders included and no guest email sent.
- Live Mac Chrome verification confirmed the Dashboard `Export Loaded` action downloaded a 3-event calendar file and kept the file-only source-of-truth warning.
- Live Mac Chrome verification confirmed the Bookings row calendar action used real booking reference `CUST-20260629234245-ZPJ85L`, downloaded the calendar file, showed success only on the clicked row, and no longer displayed `booking undefined`.
- Live Mac Chrome verification confirmed loading `CUST-20260629234245-ZPJ85L` into Dispatch and clicking the Job Card calendar action changed the button to `Calendar Created`.
- The browser calendar routes now allow same-origin admin dashboard `POST` access through the verified server-session admin/dispatcher role without exposing the private admin session token to the browser; customer/driver referers remain blocked.
- This pass did not send email, create payment links, activate Stripe/card charges, call transport providers, change GPS/live-location behavior, create payouts, change DB schema, or print/commit Google service-account secrets.
- No customer or driver surfaces were changed by this wired-path pass; the calendar payload guards continue to reject payout, payment, billing/invoice/PDF, internal admin/finance notes, parser/debug/mock archive, provider payload, secret/token, live-location, proof/photo, and unsafe notification fragments.
- Focused checks passed: admin booking Google Calendar sync API contract, admin booking calendar agenda API contract, admin booking calendar event API contract, admin booking calendar sync-status API contract, `npm run build`, `npm run lint` with only the existing `loadBookings` dependency warnings, `npx tsc --noEmit --pretty false`, and `git diff --check`.

### Admin Google Calendar Live Sync

- A new guarded route `POST /api/admin-booking-calendar-google-sync` can sync loaded Dashboard booking agenda rows into Google Calendar when the provider gate is configured.
- The Dashboard `Operations Calendar` panel now keeps the existing file export controls and adds a compact `Sync Google` action for loaded active bookings.
- Google sync reuses the same safe loaded-booking calendar payload contract as the `.ics` agenda export, with the same 25-booking limit and the same forbidden-field rejection for pricing, payout, billing/payment/invoice/PDF, finance/internal/admin notes, parser/debug/mock archive, provider payloads, secrets/tokens, live location, proof/photo, and unsafe notification fragments.
- The provider integration is default-closed and requires `PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED=true`, `PRESTIGE_GOOGLE_CALENDAR_ID`, `PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL`, and `PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY` before any Google request can happen. Optional test/override env names are `PRESTIGE_GOOGLE_CALENDAR_TOKEN_URI` and `PRESTIGE_GOOGLE_CALENDAR_API_BASE_URL`.
- Credentials remain server-only. No downloaded JSON key, private key, access token, service account secret, or provider response body is committed, printed, exposed to the browser, or returned by the API.
- The route uses the admin dashboard same-origin boundary plus verified server-session admin/dispatcher role; local-dev admin surface is not enough for live Google provider writes.
- Sync uses service-account OAuth on the server and writes Google Calendar events with deterministic Prestige event IDs, so repeating the same loaded-booking sync updates the existing Google event instead of creating duplicates.
- Google event writes use `sendUpdates=none`, no attendees, and Google Calendar popup reminders at 2 hours and 30 minutes before pickup. This is calendar-native reminder delivery only; it does not send customer/driver email, push, WhatsApp, Telegram, SMS, Stripe/payment, provider job dispatch, GPS/live location, payout, DB schema, or Vercel/env changes.
- The app remains the source of truth. Google Calendar edits do not update Prestige Limo Ops, and booking amendments should be made in the app then synced again.
- Guard coverage lives in `scripts/test-admin-booking-google-calendar-sync-api-contract.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.
- Production activation on 2026-06-30 added the required Google Calendar env names as Vercel Production Sensitive values only: `PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED`, `PRESTIGE_GOOGLE_CALENDAR_ID`, `PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL`, and `PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY`. Secret values were not printed, logged, committed, or pasted into docs.
- Production deployment `dpl_7T91EWzYBtqFksaPHNssa2XrGcAx` completed `READY` and was aliased to `https://app.prestigelimo.sg`.
- Live deployed route proof on `https://app.prestigelimo.sg/api/admin-booking-calendar-google-sync` returned `ok: true`, provider `google_calendar`, `events_synced: 1`, `send_updates: none`, and `notification_delivery: calendar_native_reminders_only`.
- Live Google Calendar read-back found `Prestige - OPS - Calendar Live Check` on `2026-07-01T09:00:00+08:00` to `2026-07-01T10:30:00+08:00` in `Prestige Ops Calendar`, with popup reminders at 120 and 30 minutes, zero attendees, and Prestige reference `CALENDAR-LIVE-CHECK-20260630-001`.
- Mac Chrome visual verification on Google Calendar day view for 2026-07-01 showed the same `Prestige - OPS - Calendar Live Check` event under `Prestige Ops Calendar`.
- This activation did not send guest/customer/driver email, WhatsApp, Telegram, SMS, Stripe/payment, provider job dispatch, GPS/live location, payout, DB schema changes, or customer/driver-visible internal data. It did create one harmless live calendar check event in the operator-owned `Prestige Ops Calendar`.

### Admin Operations Calendar Agenda Export

- The Dashboard now has an `Operations Calendar` panel in the live operations command centre.
- The panel summarizes loaded active bookings by `Today` and `Upcoming`, shows the next loaded agenda rows, and keeps the existing per-booking `Calendar` buttons available in booking lists.
- `Export Today` downloads one `.ics` file for today's loaded active bookings.
- `Export Loaded` downloads one `.ics` file for up to 25 loaded active bookings from the current dashboard set.
- The new guarded route is `POST /api/admin-booking-calendar-agenda`; it reuses the same safe saved-booking calendar payload contract as the single-booking calendar export and returns a multi-event calendar file.
- Each exported calendar event includes calendar-native display reminders 2 hours and 30 minutes before pickup, so the imported calendar can alert the operator from the same event without app push/email/provider delivery.
- Calendar agenda export is file-only: `connection_mode: ics_file_only`, `provider_connection: not_connected`, `live_calendar_provider: none`, and `live_calendar_write_performed: false`.
- The app remains the source of truth. Calendar edits in Google/Apple/Outlook do not update Prestige Limo Ops, and booking changes require regenerating/exporting the `.ics` file until a separately approved live provider sync lane exists.
- The route rejects unsafe calendar payload fields such as pricing, payout, billing/payment/invoice/PDF, finance/internal/admin notes, parser/debug/mock archive, provider payloads, secrets/tokens, live location, proof/photo, and notification fragments.
- This does not create Google Calendar, Apple/iCloud, Outlook, or provider events; does not read/write DB rows; does not apply migrations; does not change Vercel/env; does not send email/push/Telegram/WhatsApp/SMS; does not activate Stripe/payment, GPS/live location, payout, billing, customer auth, driver auth, or notification runtime.
- Guard coverage lives in `scripts/test-admin-booking-calendar-agenda-api-contract.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.
- Focused checks passed: admin booking calendar event API contract, admin booking calendar sync status API contract, admin booking calendar agenda API contract, calendar event lifecycle no-live guard, `npx tsc --noEmit --pretty false`, `npm run lint` with only the existing `loadBookings` dependency warnings, `npm run build`, and `git diff --check`.

### Customer Billing Document Lifecycle And PDF Notes Order

- Admin Customers invoice workbench now has a document selector for `Invoice` or `Quotation`.
- `Invoice` remains the default and keeps the stored invoice/PDF/email/paid-unpaid path.
- `Quotation` now uses the same stored billing-document route as invoices when the DB lifecycle columns are present, with `QUO-YYYYMMDD-####` numbering, PDF title `QUOTATION`, and document-aware email subject/body.
- Quotation and credit-note PDFs now use document-specific date labels (`Quotation Date:` and `Credit Note Date:`) instead of carrying `Invoice Date:` on every document type.
- `Save Draft` stores the reviewed workbench details as a server draft billing document when lifecycle columns are present; drafts stay admin-only, cannot be emailed, and are filtered out of the customer portal until issued.
- Stored quotation rows show compact `Quote` / `Convert` actions instead of payment actions, so a quote is not treated as a payable invoice. Converting a stored quotation creates a new stored invoice/PDF without mutating the original quotation.
- Paid stored invoice rows can create a separate stored `CN-YYYYMMDD-####` credit-note PDF linked to the original `INV-...`; the original paid invoice is not edited or deleted.
- Customer portal invoice folders are compact monthly `Quotations`, `Unpaid Invoices`, `Paid Invoices`, and `Credit Notes` folders, and the customer API filters to issued documents only.
- The unbilled checkpoint only treats real invoices as billed; quotations and credit notes no longer remove jobs from the unbilled list.
- Invoice PDFs now render the lower sections in this order: sign-off, bank information, `Notes`, then `Terms & Conditions`; the Notes block is immediately above Terms instead of above the sign-off/bank section.
- `supabase/migrations/202606300001_customer_billing_document_lifecycle.sql` scaffolds the DB columns/checks for `document_type`, `document_state`, `original_invoice_number`, `INV/QUO/CN` number prefixes, and credit-note linkage. The production Supabase lifecycle columns were applied on 2026-06-30 through the logged-in Supabase dashboard/API path after live `document_type` column-missing proof; API tokens and connection strings were not printed or recorded.
- The persistence adapter now reads/writes lifecycle columns and falls back safely for legacy `INV-...` issued invoices if an environment is still on the old invoice-only schema. Server-backed quote/draft/credit-note runtime still requires the lifecycle migration to be applied in that environment.
- The invoice workbench controls are compact: prep actions are `Open`/`Clear`, card options are small `Card`/`10% fee` chips, and the reviewed document actions are `Preview`, `Draft`, and `Issue` instead of large wrapping buttons. Guard coverage rejects the old noisy workbench labels.
- Billing document rows now show compact `PDF`, `Email`, `Paid`/`Unpaid`, `Quote`, `Convert`, and `Credit` chips with a 5-row pager, so older invoices remain reachable without large action cards or hidden first-five-only behavior.
- This pass does not create Stripe checkout/payment links, card charges, bank debit, payout records, provider sends, GPS/live-location records, automatic reconciliation, or customer/driver-visible internal/admin/debug/mock/payout data.
- Guard coverage lives in `scripts/test-customer-billing-document-lifecycle-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.
- Focused checks passed: customer billing document lifecycle guard, customer stored invoice PDF portal guard, customer trust path invoice portal guard, customer invoice driver JC timing/override guard, customer hourly invoice calculation guard, `npx tsc --noEmit --pretty false`, targeted ESLint, and `git diff --check`.
- A sample invoice PDF was rendered to PNG with Poppler and visually checked; Notes sits above Terms & Conditions with no overlap or clipping.
- Live Mac Chrome verification on `https://app.prestigelimo.sg/customers` prepared the Ritz Carlton unbilled row, switched the document selector to `Quotation`, previewed the quotation, and downloaded `QUO-20260630-0001.pdf` without issuing an invoice, sending email, taking payment, calling providers, writing DB rows, or changing payment status.
- The live-downloaded quotation PDF rendered cleanly to PNG; bank information, `Notes`, and `Terms & Conditions` appeared in that order with no overlap. A patched local render also verified the document-specific `Quotation Date:` label.
- The issued invoice action row is compact: stored invoices show `PDF`, `Email`, and a single `Paid`/`Unpaid` status toggle; local quotation/credit rows do not show a dead email button while server-backed quotation/credit-note email is not activated.
- Live Mac Chrome verification after deployment of `139c793d` confirmed the issued invoice section shows compact `PDF`, `Email`, `Paid`, `Unpaid`, `Quote`, `Convert`, and `Credit` controls and no longer shows the noisy `Download PDF`, `Email Invoice`, `Email Quotation`, `Mark Unpaid`, or `Convert to Invoice` action labels.
- Live Mac Chrome verification after deployment of `5064a397` confirmed the Billing Documents table shows compact action chips plus `1-5 of 8` / `Next` pagination, then page 2 exposed older invoice `INV-20260629-0002` with compact `PDF`, `Email`, `Unpaid`, and `Credit` actions.
- The live `Credit` action created stored credit note `CN-20260630-0001` linked to original paid invoice `INV-20260629-0002`; admin API read-back confirmed the credit note is `documentType: credit_note`, `documentState: issued`, `status: Unpaid`, `storageSource: server`, and `originalInvoiceNumber: INV-20260629-0002`, while the original invoice remained `Paid`.
- Live customer portal access for `hourly-test-customer` opened `/my-bookings`, and the Invoices tab showed compact monthly folders for `Unpaid Invoices`, `Paid Invoices`, and `Credit Notes`, including `INV-20260629-0003`, `INV-20260629-0002`, and `CN-20260630-0001`.
- The live customer-visible portal text scan for that invoice view found no driver payout, PayNow payout, internal admin/finance notes, parser/debug/mock archive fragments, payout comparisons, secrets, Stripe checkout, or payment-intent fragments.
- The previously recorded Load Bookings typed-read admin display exposure marker mismatch was repaired in the Load Bookings Guard Marker Refresh. The billing lifecycle lane itself remains unchanged by that guard-only repair.

### Customer Invoice Card Payment Toggle Live Proof

- Source-of-truth commit for the card-payment checkbox: `5118f697 Add invoice card payment toggle`.
- Vercel Deployments UI showed staging commit `5118f69` as `Ready` and `Production` on `https://app.prestigelimo.sg`.
- Live Mac Chrome verification on `https://app.prestigelimo.sg/customers` loaded the Ritz Carlton unbilled row into the Send Invoice Workbench.
- `Card payment` was off by default, and `10% card fee` was disabled while card payment was off.
- Turning `Card payment` on enabled the `10% card fee` checkbox; turning the fee checkbox on and clicking `Preview Invoice` showed `Enabled, 10% fee note included` and appended the customer-facing card payment / 10% card processing fee note to the invoice line item.
- The live UI proof used Preview only and did not click `Issue Invoice + PDF`; the prepared row was cleared afterward so no accidental live issue button remained armed.
- Approved live email proof created stored test invoice `INV-20260630-0001` for customer account `codexed` / `Codexed Pte Ltd`, reference `CODEXED-20260630011037`, amount `$130.00`, status `Unpaid`, with card-payment wording in the line item.
- The live stored PDF downloaded successfully and rendered cleanly to PNG for visual inspection: logo/company block, `INVOICE` header, bill-to/date summary, item table, totals, notes, bank details, and short terms were visible without overlap.
- One approved real invoice email was sent successfully to `willsglimo@gmail.com`; the stored row recorded `emailDeliveryStatus: sent`.
- A signed customer portal access proof for `codexed` read back the same invoice as `$130.00`, `Unpaid`, and `sent`; the forbidden-fragment scan did not detect driver payout, PayNow payout, internal admin/finance notes, parser/debug/mock archive fragments, Stripe checkout/payment intent fragments, secrets, or payout comparison fragments.
- This proof did not create a Stripe checkout, payment link, card charge, bank debit, payout, provider job send, GPS/live location record, or automatic payment reconciliation.

### Customer Invoice PDF Layout Refresh

- Stored customer invoice PDFs now render in a compact professional invoice layout: company logo/details top-left, `INVOICE` and balance due top-right, bill-to/date summary, item table with Qty/Rate/Amount, subtotal/total/balance due block, notes, finance sign-off, bank information, and short essential terms.
- Default company profile fallback bank instructions now include the DBS bank account, bank code, branch code, SWIFT code, bank address, and PayNow UEN, so invoices do not render a blank payment section when saved company settings omit bank text.
- Default invoice footer terms are shortened to essential payment/charge language; live saved company terms can still override them through Company Profile.
- A sample invoice PDF was generated and rendered to PNG with Poppler for visual inspection; the layout showed no overlap, clipping, or missing table/totals/footer sections.
- This is invoice PDF presentation and safe payment-instruction fallback only. It does not create invoices by itself, send emails, send payment links, charge Stripe/cards, call providers, activate GPS/live location, expose payout/customer pricing, or print secrets/env values.
- Guard coverage was extended in `scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs` and `scripts/test-company-profile-settings-guard.mjs`.

### Customer Invoice Email Production Activation And Live Send

- Production Vercel env for stored customer invoice email sending is enabled without printing or recording secret values.
- Production scope only was selected for the invoice email send gate, invoice email sender, invoice email reply-to, and invoice email recipient allowlist.
- The live send allowlist is bounded to `william@prestigelimo.sg` for this go-live proof.
- Production was redeployed from staging commit `1059f27` through the Vercel web UI, not the Vercel CLI, and `app.prestigelimo.sg` was assigned to the ready deployment.
- Fresh live trust-smoke booking reference: `CUST-20260629234245-ZPJ85L`.
- Fresh live trust-smoke invoice: `INV-20260629-0003` for `hourly-test-customer`.
- Hourly billing proof: actual 09:00-10:16 equals 76 minutes; with 15 minutes grace and the 16th minute starting a new hour, the app generated 2 billable hours at `$65/hr`, total `$130.00`.
- Admin stored invoice read-back returned `INV-20260629-0003` as `$130.00`, `Unpaid`, and `sent` after the email send.
- Customer portal signed-link read-back returned the same invoice as `$130.00`, `Unpaid`, and `sent`; the safe-surface scan did not detect driver payout, PayNow payout, internal admin/finance notes, parser/debug/mock archive fragments, customer price leaks, or payout comparison fragments.
- One approved real invoice email was sent successfully to `william@prestigelimo.sg`; the stored row recorded `emailDeliveryStatus: sent`.
- This proof did not send payment links, charge Stripe/cards, call providers, activate GPS/live location, expose payout/customer pricing, expose admin finance/internal notes, or print any API keys, tokens, passwords, or env secret values.

### Customer Portal Access Production Env Activation

- Production Vercel env for customer portal access links is enabled without printing or recording secret values.
- Production scope only was selected for the portal access link gate, signing secret, access account allowlist, customer portal runtime gate, small-allowlist runtime mode, and runtime account allowlist.
- The bounded production allowlist covers the current customer portal test accounts: `ubs`, `ritz-carlton`, `vip-customer`, and `hourly-test-customer`.
- The saved settings require a fresh production deployment before live `https://app.prestigelimo.sg` can create signed customer portal links.
- Live verification found the public access route created and sent the signed HttpOnly cookie, but the customer saved-bookings boundary tried the legacy saved-bookings session-token gate before the new signed portal-access cookie branch. The boundary now accepts a valid portal-access cookie immediately after the same-origin `/my-bookings` and controlled runtime allowlist checks, while keeping the legacy session-token path as fallback. The saved-bookings DB read client also recognizes that already-validated signed portal-cookie session so the customer portal can read account-scoped bookings without opening anonymous or non-portal reads.
- This activation does not create invoices/PDFs, send email, send payment links, call providers, activate Stripe charges, expose payout/customer pricing, write bookings, write invoice rows, change parser behavior, enable GPS/live location, or expose customer/driver-forbidden internal data.
- Guard coverage for this gate remains in `scripts/test-customer-portal-access-link-guard.mjs` and the customer trust path remains covered by `scripts/test-customer-trust-path-invoice-portal-guard.mjs`.

### Public Company Contact Dedupe

- Public company profile contact display now dedupes WhatsApp/phone/email contact lines before rendering on `/my-bookings`, `/book`, invoice PDFs, and the admin Company Profile preview.
- When WhatsApp and phone contain the same number, customer-facing pages show the number once instead of `+65 9655 0807 | +65 9655 0807`.
- The settings page can still store separate WhatsApp and phone fields for future operation; the preview and public output are compact and non-duplicative.
- This is display-only cleanup. It does not add routes/APIs, DB writes, env changes, provider sends, email sends, payment/Stripe actions, GPS/live location, billing/payout changes, parser changes, or customer/driver-visible internal data.
- Guard coverage lives in `scripts/test-company-profile-settings-guard.mjs`.

### Customer Portal Access Link Lock

- Admin can create a compact customer portal access link from the Customers finder row.
- The default link is signed server-side, account allowlisted, expires after a bounded window, and does not require the customer browser page to know any session token.
- A non-allowlisted saved customer account can receive a link only after the admin route proves with a read-only server check that the account already has an issued stored customer billing document; that signed stored-document link scopes portal reads to exactly that customer account.
- Opening the link sets the existing customer saved-bookings HttpOnly Secure SameSite=Lax Priority=High cookie and redirects to `/my-bookings`.
- `/my-bookings` still calls only the existing saved-bookings and stored-invoice read adapters with same-origin credentials and purpose headers.
- Portal reads remain scoped to the signed customer account and either the controlled customer runtime allowlist or the one-account stored-document scope minted by the admin route after issued-document proof.
- The public access route does not read or write Supabase, create invoices, generate PDFs, send providers, send email, activate Stripe/payment, expose billing internals, expose customer price, expose driver payout, or expose parser/debug/mock archive data.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- Guard coverage lives in `scripts/test-customer-portal-access-link-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Portal Saved Bookings Schema Fallback Lock

- Customer portal saved-bookings reads now try the current customer-safe booking columns first, then fall back to the foundation booking schema only when the live DB reports a missing-column schema drift.
- Text customer account references such as `ubs` are matched against `customer_display_name`; UUID-shaped account references remain matched against `customer_id`, avoiding live DB type errors when the bookings `customer_id` column is UUID-backed.
- The fallback keeps the same public saved-booking response shape, mapping foundation `pickup_datetime`, `route_type`, and `customer_display_name` into the customer portal booking fields.
- The customer portal should return a safe saved-bookings result for the signed customer account instead of showing the generic sign-in state when current/foundation booking columns differ.
- Selected and returned fields remain customer-safe only: booking reference, service/type, pickup time, pickup/drop-off, passenger display name, status, month, and timestamps.
- Customer/driver-visible forbidden data remains blocked: driver payout, PayNow payout, customer price, billing, invoice/payment, internal admin/finance notes, parser/debug internals, secrets/tokens, raw provider payloads, and mock QA/dev archive data.
- This is read-only schema fallback. It does not write DB records, create invoices/PDFs, send email/providers, change env, alter Save Booking + CRM, use `/api/admin-saved-bookings`, change parser behavior, activate billing/payment/payout, or activate GPS/live location.
- Guard coverage lives in `scripts/test-customer-saved-bookings-api-contract.mjs` and `scripts/test-public-customer-portal-saved-booking-surface-guard.mjs`.

### Admin Dashboard Browser Read Boundary Fix

- Live admin troubleshooting on 2026-06-25 found that customer `/book` request intake and admin CRM API proof passed, but the browser admin dashboard `Load Bookings` path still returned the safe `Admin booking persistence is available only from the internal admin dashboard.` boundary error.
- Root cause: the admin browser was correctly sending the same-origin dashboard request and `x-prestige-admin-purpose`, but browser code must not expose `x-prestige-admin-session-token`; the shared admin dispatcher boundary therefore rejected safe dashboard `GET` reads in live browser operation.
- The boundary now allows same-origin root-dashboard `GET` reads to resolve the configured server-side admin/dispatcher role without exposing the private session token to the browser.
- Mutating admin booking persistence paths such as `POST` and `PATCH` still require the private `x-prestige-admin-session-token`; customer/driver referers and public origins remain blocked.
- This does not open broad public writes, provider sends/calls, parser changes, DB schema changes, Vercel env changes, deploys, live GPS/customer-wide live map, billing/payment/PDF/invoice/payout, calendar sync, or shims.
- Guard coverage lives in `scripts/test-admin-booking-persistence-enable-readiness.mjs` and locks the browser dashboard read/write split.

### Live Admin Dashboard Load Bookings Proof

- Evidence marker: `ADMIN-DASHBOARD-LOAD-BOOKINGS-LIVE-202606251552`.
- Source-of-truth runtime commit deployed for proof: `9127387 Fix admin dashboard booking read boundary`.
- Live app target: `https://app.prestigelimo.sg`.
- Vercel production deployment completed successfully and aliased the deployment to `https://app.prestigelimo.sg`.
- No Vercel env values were changed for this proof; the deployment used the already-corrected project env.
- Browser-style same-origin admin dashboard `GET /api/admin-saved-bookings?limit=25` returned HTTP 200 with `ok: true`.
- Browser-style same-origin admin dashboard `GET /api/admin-bookings` returned HTTP 200 with `ok: true`.
- The proof recorded counts only and did not print booking rows, customer private data, IDs, tokens, DB URLs, env values, or secrets.
- Browser-style `POST /api/admin-bookings` without `x-prestige-admin-session-token` still returned HTTP 403, proving write paths remain private-token gated.
- No DB writes, E2E rerun, provider sends/calls, Email/Telegram/WhatsApp/SMS, parser changes, live GPS, broad customer live map, billing/payment/PDF/invoice/payout, calendar sync, or shim occurred.

### Admin Load Bookings CRM Fallback And Compact List Fix

- Live manual walkthrough on 2026-06-26 found that the visible admin `Load Bookings` button could still fail with the safe `Admin saved booking read failed safely.` message when `GET /api/admin-saved-bookings?limit=25` failed, even though same-origin admin `GET /api/admin-bookings` returned `ok: true`.
- Admin `Load Bookings` now tries same-origin admin `GET /api/admin-saved-bookings?limit=25` first and falls back to same-origin admin `GET /api/admin-bookings` when the saved-bookings read fails or returns a malformed list.
- Both reads use the existing `x-prestige-admin-purpose` browser-admin header and remain GET-only.
- Silent dashboard/bookings/dispatch auto-sync skips the legacy saved-bookings read and uses the CRM-safe admin bookings list, so `Save Booking + CRM` cannot accidentally reload through `/api/admin-saved-bookings`.
- The fallback is an admin dashboard read fallback only; it does not add public reads, broad writes, DB writes, provider sends, env changes, deploys, parser changes, live GPS/customer-wide live map, billing/payment/PDF/invoice/payout, or shims.
- Save Booking + CRM remains on `POST /api/admin-bookings` and is not changed by this fallback.
- Recent and Completed booking lists now render compact expandable rows by default so dispatch can scan more bookings at once while keeping existing details and action buttons available.
- The Bookings tab now triggers the same safe Load Bookings read automatically the first time it is opened with an empty loaded list.
- Open customer booking requests are surfaced on the Dashboard command centre and above Recent Bookings, using the existing customer request source markers with a bounded fallback for open `CUST-` request references when live rows do not carry those markers.
- The Dashboard is the default admin landing tab, shows a compact `Urgent Booking Requests` alert for open customer requests with pickup under 24 hours, and routes request clicks to the existing Bookings review area instead of loading Dispatch directly.
- The Dashboard now runs the same existing safe Load Bookings read once on initial command-centre entry when the local booking list is empty, so newly submitted customer requests can appear without first opening the Bookings tab.
- Dashboard initial Load Bookings completion only writes the global status message while the operator is still on Dashboard, so a delayed read cannot overwrite Rates or other tab feedback after navigation.
- The Bookings request row is the review handoff point and can load the selected request into the existing Dispatch form only when the operator chooses `Load this booking`; the handoff focuses the existing Customer Copy section for admin review/send preparation without adding a duplicate write path.
- Loading a customer request into Dispatch now records a bounded browser-local handled-request key so that request leaves the Dashboard urgent queue plus the Bookings `Urgent & New Booking Requests` queue and badge on that admin browser while remaining available in Recent/Active booking lists.
- Loading a saved booking into Dispatch refreshes the typed operational display once immediately and pauses one background sync tick, keeping the existing guarded read set stable while Customer Copy focuses for review.
- The Dashboard now uses compact read-only booking summaries plus `Open` handoff buttons; single-booking driver assignment, status, copy, job-card, and completion work stays in Dispatch/Bookings so page purposes do not duplicate.
- The loaded active jobs monitor is shown on the Dashboard command centre for multi-driver scanning; the Dispatch day-of-trip monitor remains the selected single-booking workbench.
- The loaded active jobs monitor shows one active job window by default and provides a compact `Show other active jobs` / `Show one job` toggle only when more loaded active jobs are inside the 1-hour pickup monitor window.
- The default active jobs monitor set pins the currently loaded booking when it would otherwise be hidden below the one visible row, so its saved driver report can refresh after OTW/OTS/POB/Completed without expanding the monitor first.
- The Dashboard active jobs monitor now shows a compact saved driver report readout per visible job, using the existing guarded admin `GET /api/admin-driver-job-statuses` path only, with monitor-wide/per-card refresh controls and a read-only dashboard auto-refresh toggle that is off by default.
- The Dashboard driver report readout is read-only and does not create driver status events, notification rows, provider sends, GPS/live-location records, billing/payment/PDF/invoice/payout records, or a duplicate single-booking Dispatch workflow.
- The Bookings tab shows a compact new-request badge/highlight after open customer requests are detected; no sound, browser notification, polling loop, provider send, or new route is added.
- Customer/driver-visible forbidden data remains blocked from this list path: driver payout, PayNow payout, customer price, billing, invoice, payment, internal admin notes, parser/debug, secrets, raw provider payloads, and mock QA/dev archive data.
- Guard coverage lives in `scripts/test-admin-load-bookings-crm-fallback-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Bookings Earlier Jobs Completed History Compact

- Past pickup-date jobs now leave Current / Upcoming and move into Completed / History alongside completed jobs.
- Completed / History defaults to the latest available pickup month, can switch to `All months`, and keeps search available by passenger/company/flight/route/driver/status.
- Completed / History rows are grouped under compact monthly headers such as `June 2026`, with known-date months sorted newest first and unknown dates grouped under `Date to confirm`.
- The Dashboard no longer renders earlier booking cards; it shows a compact count plus an `Open Completed / History` handoff.
- Expanded Current / Upcoming and Completed / History rows use compact detail strips instead of large mini-cards.
- Earlier non-completed rows do not show `Undo completed` or `Delete` because they are history rows, not completed-status rows.
- This is UI-only grouping/layout on existing loaded booking data; it does not add routes/APIs, DB writes, env changes, provider sends, GPS/live location, billing/payment/PDF/invoice/payout, calendar sync, parser changes, or shims.
- Guard coverage lives in `scripts/test-bookings-earlier-history-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Dashboard Urgent Requests And One-Window Active Monitor

- Dashboard request panel is now `Urgent Booking Requests` and only displays open customer requests with pickup under 24 hours.
- The Bookings page request panel remains the full queue as `Urgent & New Booking Requests`, with row badges separating urgent under-24h requests from new non-urgent requests.
- Active Jobs Monitor shows one job window by default, auto-includes jobs only when they are inside the 1-hour-before-pickup monitor window, and expands with `Show other active jobs` only when more jobs are inside that window.
- Dashboard driver report auto-refresh remains a manual toggle and is off by default.
- This is UI-only filtering/layout on existing loaded booking data; it does not add routes/APIs, DB writes, env changes, provider sends, notification sends, GPS/live location, billing/payment/PDF/invoice/payout, calendar sync, parser changes, or shims.
- Guard coverage lives in `scripts/test-dashboard-urgent-requests-active-monitor-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Completed History Grouping Lock

- Saved driver `Job Completed` reports now move the loaded booking out of Today/Upcoming and Active Jobs Monitor and into Completed / History.
- The booking row is not overwritten; admin history reads the existing guarded driver status state from the dashboard/dispatch read cache.
- Driver-completed rows show a compact `Driver completed` badge and do not expose admin billing, customer pricing, payout, internal notes, parser/debug internals, or mock/dev archive data.
- This is UI-only grouping/read behavior; it does not add routes/APIs, DB writes, provider sends, notification sends, GPS/live location, billing/payment/PDF/invoice/payout, calendar sync, env changes, deploy activation, parser changes, or shims.
- Guard coverage lives in `scripts/test-driver-completed-history-grouping-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Admin New Booking Email Alert Runtime Gate

- A server-side admin Email alert can run after a customer `/book` request is saved, so the owner can receive new-booking alerts without depending on the admin Dashboard or Mac being open.
- The alert is default-closed and requires `PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_ENABLED=true`, `PRESTIGE_EMAIL_PROVIDER=resend`, `PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_TO`, and `RESEND_API_KEY` before any provider request can happen.
- The customer booking request response remains unchanged and customer-safe; an Email alert failure must not make customer booking submission fail.
- The alert is one-message-per-saved-request, template-only, and includes only admin-safe booking summary fields: reference, customer/account, passenger, contact, pickup time, pickup, drop-off, trip type, and the admin Dashboard URL.
- The alert must not expose driver payout, PayNow payout, customer price, billing/payment/PDF/invoice, internal admin notes, parser/debug, secrets/tokens, raw provider payloads, GPS/live location, calendar sync, or mock QA/dev archive data.
- This does not add polling, scheduler, retry loop, batch/blast sending, DB writes beyond the already-approved booking save, Vercel env changes, deploys, Telegram/WhatsApp/SMS, GPS/live-location activation, billing/payment/PDF/invoice/payout, or calendar sync.
- Guard coverage lives in `scripts/test-admin-new-booking-email-alert-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Admin Device Push Notification Runtime Gate

- A browser/device push alert scaffold is now available for admin-owned phone/Mac browser devices so new customer `/book` requests can alert the owner without keeping the Dashboard open.
- This lane is default-closed and does not activate push delivery until the exact future gate/config is provided and approved: `PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED`, `PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY`, `PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY`, `PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL`, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Admin device subscriptions are admin-dashboard-only through `GET/POST/PATCH /api/admin-device-push-subscriptions`, same-origin admin boundary checks, and the `admin_device_push_subscriptions` table migration scaffold. The migration is not applied by this commit.
- The Dashboard `Admin App Notifications` area includes compact `Device Push` controls to enable/disable push for the current admin browser after explicit notification permission; it does not create a duplicate notification page.
- The customer `/book` request path calls the Email alert helper and device-push helper as separate best-effort side channels after the booking request is saved. Alert failure must never fail customer booking submission.
- The safe push payload is template-only and lock-screen safe: title `New booking request`, body `New booking request received. Open Dashboard to review.`, URL `/`, and tag `prestige-new-booking-request`.
- No passenger name, phone, email, booking reference, pickup/drop-off location, raw driver token, provider payload, pricing, payout, billing/payment/PDF/invoice, internal note, parser/debug, secret, GPS, live location, or customer data is exposed in the push payload.
- No WhatsApp, Telegram, SMS, provider fallback, billing, payment, payout, PDF, GPS, live location, or customer data is exposed by this scaffold. True live in-app screen sync is still a separate realtime lane.
- No Vercel CLI, Vercel env change, redeploy, DB apply, DB write, provider send, GPS activation, billing/payment/PDF/invoice/payout, calendar sync, or production activation occurred in this scaffold lane.
- Guard coverage lives in `scripts/test-admin-device-push-notification-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Live Admin Load Bookings Fallback Compact UI Verification

- Evidence marker: `ADMIN-LOAD-BOOKINGS-FALLBACK-COMPACT-LIVE-20260626`.
- Source-of-truth commit during proof: `e027bc7 Fix admin load bookings fallback and compact list`.
- Live app target: `https://app.prestigelimo.sg`.
- Safe live root GET returned HTTP 200 with title `Prestige Limo Ops`.
- Browser-style same-origin admin `GET /api/admin-saved-bookings?limit=25` still returned the safe HTTP 500 `Admin saved booking read failed safely.` response.
- Browser-style same-origin admin `GET /api/admin-bookings` returned HTTP 200 with a bookings array.
- Headless live UI smoke clicked only the admin `Bookings` tab and `Load Bookings` button, observed no `Load bookings failed` message, and observed the `CRM list fallback used` operator note.
- Compact expandable CRM rows rendered successfully: 14 recent rows, 14 recent detail bodies, and 14 recent action rows; rows were closed by default.
- No form submit, save, edit, calendar, provider send, Email/Telegram/WhatsApp/SMS, DB write, Vercel env change, Vercel CLI, dashboard automation, deploy, parser change, live GPS/customer-wide live map, billing/payment/PDF/invoice/payout, or calendar sync occurred.
- Customer/driver-visible forbidden data remains blocked from this verification path: driver payout, PayNow payout, customer price, billing, invoice, payment, internal admin notes, parser/debug, secrets, raw provider payloads, and mock QA/dev archive data.

### Customer Folder Compact Index UI Lock

- The old Customer Folder / Job History Handoff support drawer is removed from the normal Customers page flow; the compact finder is now the single customer-folder lookup surface.
- The compact finder keeps 10-row pages and an `All customers` dropdown with numbered page buttons for 200-plus accounts.
- The top payment summary is a slim strip instead of four large cards.
- No route, API, parser, DB, env, Vercel, provider-send, GPS/live-location, billing/payment/PDF/payout, calendar, or shim behavior is changed.
- This polish is guarded by `scripts/test-customer-folder-compact-index-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customers Page Scaled Queue Pagination UI Lock

- The Customers & Payments follow-up queue and monthly statement preview now render through compact paginated row lists instead of mapping every visible customer row at once.
- Default page size is 10 rows with a 25-row option, keeping desktop scanning practical for larger customer lists while mobile remains stacked and touch-friendly.
- This is UI-only pagination on existing local/admin sections; it does not add routes, APIs, DB reads/writes, env changes, Vercel changes, provider sends, GPS/live-location, billing/payment/PDF/payout activation, calendar sync, or shims.
- Existing admin-only boundaries remain unchanged and customer/driver forbidden finance/internal/mock-archive data remains blocked from public surfaces.
- This polish is guarded by `scripts/test-customers-page-scaled-queues-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Terms And Hourly Billing Rule Lock

- Customer-facing terms are centralized for compact reuse across the public booking form, admin Customer Copy, and the monthly invoice review footer.
- The public `/book` form now requires customers to accept booking terms, surcharges, waiting-time policy, and the hourly grace rule before request submission.
- Customer Copy includes the compact customer notes in the copied text and shows a tiny visual note in the admin UI; the invoice review workspace shows the same terms as a small footer note.
- Hourly actual-time billing is locked to 15 minutes grace after each hour: 16 minutes or more starts the next chargeable hour.
- Monthly invoice billable price review calculates hourly billable minutes from saved actual total minutes before approval and rejects hourly minute values that do not match the 15-minute grace rule.
- DSP actual-time behavior remains separate; DSP billable minutes are not rounded by the hourly rule.
- This does not generate invoices, PDFs, payment links, provider sends, customer notifications, payout records, live GPS/location records, DB migrations, env changes, Vercel actions, parser changes, or shims.
- Customer/driver-visible forbidden data remains blocked from these surfaces: driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, mock QA/dev archive, customer price on driver surfaces, billing/payment/payout comparisons on driver surfaces, and internal finance notes.
- Guard coverage lives in `scripts/test-customer-terms-hourly-billing-guard.mjs` and `scripts/test-admin-monthly-invoice-billable-item-price-review-api-contract.mjs`, both registered through the existing test paths.

### Public Booking Request Compact Header Lock

- The public `/book` header is compact: smaller title, one thank-you/hotline sentence, no duplicate profile contact row, and no Step 1/2/3 cards.
- The request form fields, submit route, booking persistence, company profile read, customer portal, billing/payment/PDF/invoice, provider-send, GPS/live location, parser, and admin routes are unchanged.
- Customer-visible forbidden data remains blocked from the public booking request page.
- Guard coverage lives in `scripts/test-public-booking-request-compact-header-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Company Profile Customer Settings Lock

- Admin now has a compact `Company` settings tab for public-facing company logo URL, company name, WhatsApp/phone/email, address, UEN/business reg no., bank/payment instructions, Stripe card availability, optional card fee percentage, and invoice footer terms.
- `/settings/invoice` opens the existing admin Company settings tab directly for invoice-facing logo, company contact, bank/payment instructions, Stripe card option/card fee wording, and invoice footer terms.
- The default public company profile email is `acc@prestigelimo.sg`, used as the official accounting contact fallback on customer-facing pages and invoice PDFs.
- The default public company profile logo is `/prestige-limo-sg-logo.jpg` and the default address is `10 Anson Rd, #10-11 Prestige Limo SG, International Plaza, Singapore 079903`.
- Customer `/book` and `/my-bookings` read the same public-safe profile through `GET /api/company-profile` and fall back to safe defaults when the settings table is not ready.
- Admin saves use `GET/POST /api/admin-company-profile` behind the existing same-origin admin dashboard boundary and `x-prestige-admin-purpose`; the browser does not receive or expose the private admin session token.
- The Stripe and bank settings are wording/settings only. This does not create Stripe charges, payment links, invoices, PDFs, payment reconciliation records, provider sends, payouts, GPS/live-location records, env changes, or activation of billing/payment providers.
- The `company_profile_settings` migration scaffold stores only public business identity and payment-instruction text, with RLS enabled, anon/authenticated access revoked, and service-role-only access.
- Public profile sanitization rejects customer-hidden/internal fragments: driver payout, PayNow payout, internal admin/internal finance/admin finance, parser/debug internals, secrets/tokens/API keys, customer price, mock QA, dev archive, and payout comparisons.
- Guard coverage lives in `scripts/test-company-profile-settings-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Status Hourly Actual-Time Evidence Lock

- Verified driver job status writes now create server-side actual-time evidence for hourly/DSP-style jobs: `OTS` writes the start marker and `Job Completed` writes the end marker.
- The evidence uses the same persisted driver status timestamp, booking reference, verified driver job link id, actor role, source surface, and safe context only.
- `OTW` and `POB` do not create hourly billing timing evidence.
- If the separate actual-time evidence table is unavailable, the driver status tap still succeeds; admin invoice review will continue to show missing timing evidence rather than exposing an error to the driver.
- Driver status responses do not expose actual-time evidence, customer price, billing, invoice, payment, payout, PayNow payout details, finance/internal notes, parser/debug internals, tokens, GPS/live-location, proof/photo, or mock QA/dev archive data.
- This does not generate invoices, PDFs, payment links, provider sends, customer notifications, payout records, live GPS/location records, env changes, migrations, parser changes, calendar sync, or shims.
- Guard coverage lives in `scripts/test-driver-job-status-persistence-api-contract.mjs`.

### Customer Booking Request Persistence Actor Fix

- The public `/book` customer booking request path now keeps its existing same-origin `/book`, `x-prestige-customer-purpose`, and safe payload parser boundary, while allowing only the exact `Customer booking request` system actor to pass the admin booking persistence write gate.
- Admin/dispatcher persistence remains limited to the existing `server-session-role-surface` admin/dispatcher actor path.
- Live `/book` intake diagnostics on 2026-06-25 showed the deployed customer request route was reachable but returned safe `503` when the shared persistence readiness required admin dispatcher envs. The customer-request actor now uses a separate server-only DB readiness path that still requires `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`, but does not require admin dispatcher session envs. Admin/dispatcher routes still require the full admin dispatcher readiness check.
- This fix does not open broad public writes, provider sends, parser changes, billing/payment/PDF/payout, live location/GPS, Vercel env changes, deploys, or `/api/admin-saved-bookings` behavior.
- Guard coverage lives in `scripts/test-customer-booking-request-api-contract.mjs` and locks the exact customer-request actor in `lib/admin-booking-supabase-adapter.ts`.

### Live Customer Booking Request CRM Proof

- Evidence marker: `WILLIAM-LIVE-BOOK-PROOF-20260625152450`.
- Source-of-truth code during evidence: `5b7f07f Fix customer booking request live readiness`.
- Live app target: `https://app.prestigelimo.sg`.
- The live app was first verified to serve `/` and `/book` with HTTP 200 and the current customer booking wording.
- Vercel production runtime drift was found without printing env values: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` was present but not true, so `/api/customer-booking-requests` returned the safe intake-disabled `503`.
- Vercel CLI was re-authorized on the Mac, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` was set to `true`, and production was redeployed so the live customer booking request route could read the corrected gate.
- After customer submit began working, admin CRM verification returned HTTP 403 until the production admin dispatcher auth env names were synced from the known local evidence values and production was redeployed again.
- Secret values, API keys, DB URLs, tokens, raw env values, booking row IDs, and private customer data were not printed or recorded.
- Final bounded live proof passed: `/book` customer request submit returned HTTP 200 with a booking reference, Supabase verification found exactly one matching booking row, admin CRM load returned HTTP 200, and CRM output contained the expected passenger marker.
- Cleanup deleted the exact temporary evidence rows only: booking route points, booking row, customer contact, customer row, and audit row.
- Zero matching rows remained afterward for bookings by marker/reference, customer contacts/customers by marker, `customer_driver_app_notification_outbox`, `driver_job_links`, and audit logs.
- No provider sends/calls, Email/Telegram/WhatsApp/SMS, real GPS, broad customer live map, billing/payment/PDF/invoice/payout, calendar sync, parser change, shim, Google/OneMap/FlightAware call, or production finance/live-location activation occurred.

### Local Production-Mode CRM E2E Evidence Record

- Evidence marker: `E2E-CUSTOMER-JC-CRM-20260625113956`.
- Source-of-truth commit during evidence: `ea83944 Allow customer booking request persistence actor`.
- Evidence ran on a local production-mode server from `npm run build` plus `npm start` on port 3001.
- This was local production-mode evidence only, not deployed staging evidence and not production launch readiness.
- `/`, `/book`, and `/my-bookings` returned HTTP 200.
- `/book` customer request submission succeeded through the bounded customer booking request path.
- Admin CRM load returned HTTP 200 and included the submitted booking.
- Passenger name mapping appeared correctly in the admin CRM-loaded booking.
- Admin confirm/edit returned HTTP 200.
- Customer in-app confirmation notification remained safely gated with HTTP 403.
- Driver job link create returned HTTP 200 with token display-once behavior.
- Driver job link load returned HTTP 200 with the expected single evidence link.
- Driver job page returned HTTP 200.
- Driver job link revoke returned HTTP 200.
- Anonymous customer portal read remained blocked with HTTP 403.
- Customer-safe projection included only safe booking fields: customer-facing status, service type, pickup datetime, pickup location, drop-off location, passenger name, passenger count, and luggage count.
- Cleanup completed after the evidence run.
- Zero matching rows remained for `bookings`, `driver_job_links`, and `customer_driver_app_notification_outbox`.
- No Vercel CLI, Vercel env change, browser/dashboard automation, or redeploy occurred.
- No provider sends/calls, Email/Telegram/WhatsApp/SMS, real GPS, broad customer live map, billing/payment/PDF/invoice/payout, or calendar sync occurred.
- No parser behavior, runtime code, test code, route/helper, shim, DB schema, or app deployment change occurred in this evidence record.
- Checks from the evidence lane passed: `npm run build`, `npm run lint`, `git diff --check`, `git diff --cached --check`, and final `git status --short` clean.

### Driver Job Production Mode Vercel Drift Fix

- Live walkthrough retry on 2026-06-26 proved customer `/book` request, admin CRM load, passenger mapping, admin confirm, driver job link creation, and driver job link listing all worked, but the driver job token API still returned HTTP 401.
- Root cause: production driver job links were enabled, but a stale explicit mock mode env could still keep the live Vercel production driver job route mock-backed.
- The driver job link mode resolver now keeps local/demo mock mode intact when no production persistence path is configured, but `PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED=true` or the same server-side admin booking persistence/Supabase config that creates real driver links now prefers the production path over stale `DRIVER_JOB_LINK_MODE=mock` or `NEXT_PUBLIC_DRIVER_JOB_LINK_MODE=mock` drift.
- This is an app-side drift hardening fix; it does not require Vercel CLI, Vercel env changes, dashboard automation, DB schema changes, provider sends/calls, real GPS, broad customer live map, parser changes, billing/payment/PDF/invoice/payout, calendar sync, or shims.
- Guard coverage lives in `scripts/test-driver-job-link-mode.mjs` and `scripts/test-driver-job-link-production-guard.mjs`.

### Driver Job Link Browser Dashboard Create/Revoke Boundary Fix

- Live manual walkthrough on 2026-06-26 found that the Driver Job Link panel could now build a safe booking reference without driver details, but `Create Link` still returned the safe admin persistence boundary error from the browser dashboard.
- Root cause: `/api/admin-driver-job-links` reused the generic admin persistence boundary where browser `GET` reads may resolve the server-side configured admin/dispatcher role, but browser `POST` and `PATCH` writes remained private-token-only; the dashboard button cannot expose `x-prestige-admin-session-token`.
- The admin dispatcher boundary now supports an explicit route-level allowlist for resolving the configured server-side admin/dispatcher role without a browser-exposed token.
- Only `/api/admin-driver-job-links` opts into that allowlist for `POST` create and `PATCH` revoke, after the existing same-origin root-dashboard referer and `x-prestige-admin-purpose` checks pass.
- Generic admin booking writes such as `POST /api/admin-bookings` remain private-session-token gated and are not opened by this fix.
- Customer/driver/public referers, wrong origins, missing purpose headers, unsafe payloads, human-style read references on create, and unsafe driver/customer/finance/internal fields remain blocked.
- This does not change Vercel env, deploy behavior, DB schema, provider sends/calls, real GPS, broad customer live map, parser behavior, billing/payment/PDF/invoice/payout, calendar sync, or shims.
- Guard coverage lives in `scripts/test-admin-driver-job-link-api-contract.mjs`.

### Driver Save And Acknowledge Details Admin Sync

- Driver job link `Save & Acknowledge Job` now persists safe driver name/contact/plate/vehicle details through the verified driver job token path.
- The driver job page may prefill assigned driver details, but it does not mark the job acknowledged or show confirmed saved driver details until the driver presses `Save & Acknowledge Job`.
- The update is scoped to the resolved driver job token and matching booking reference only; the driver browser cannot choose another booking/customer.
- The server updates only safe assigned-driver fields on `driver_job_links.safe_link_context` and safe driver detail fields on the matching booking record.
- Admin Dashboard, Bookings, and Dispatch silently re-read the existing admin-safe booking list every 3 seconds while loaded and merge only driver name/contact/plate/vehicle into the currently opened booking.
- Driver-entered vehicle model uses the existing safe booking vehicle display field only after driver details are present; no new DB schema, customer-wide vehicle exposure, provider send, GPS, billing, payout, or env gate is added.
- The admin booking read select includes the same safe vehicle display field that driver acknowledgement writes, so Customer Copy and Driver Dispatch do not lose the driver-entered vehicle model when the booking is reloaded.
- Customer Copy and Driver Dispatch also use the active driver job link safe vehicle summary as an admin-display fallback when the booking list has already picked up driver name/contact/plate but the driver vehicle model is still coming from the job-link payload.
- The admin Dispatch page quietly refreshes the existing active driver job link read once when booking sync sees driver name/contact/plate but no vehicle model on the currently loaded booking, so the safe vehicle summary can catch up after driver `Save & Acknowledge Job` without a manual refresh.
- If the loaded Dispatch booking already has driver name/contact/plate but no vehicle model, the same one-shot active driver job link safe-summary fallback starts immediately on load.
- Customer Copy and Driver Dispatch can reflect driver-entered details without pressing Refresh or reloading the page.
- The Dashboard Active Jobs Monitor pins the currently loaded booking into the single default visible monitor window, so its saved OTW/OTS/POB/Completed driver report can appear without expanding the monitor first.
- This is not a customer send; admin still reviews Customer Copy before any customer-facing send.
- The auto-sync uses existing admin-safe booking read paths only and does not add public reads, broad writes, provider sends, Email/Resend/Telegram/WhatsApp/SMS, push sends, live GPS/customer map, billing/payment/PDF/invoice/payout, parser, calendar, or shims.
- Customer/driver-visible forbidden data remains blocked from this path: driver payout, PayNow payout, customer price, billing, invoice, payment, internal admin notes, parser/debug, secrets, raw provider payloads, and mock QA/dev archive data.
- Guard coverage lives in `scripts/test-driver-job-details-admin-sync-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Admin Dashboard Live Follow-up Fixes

- Customer `/book` requests now create an internal admin-app inbox item after the booking request is saved.
- The admin-app notification payload is safe and template-only: no phone, email, pricing, payout, billing, provider payload, live location, token, parser/debug, or internal note data is included.
- Customer Copy and Driver Dispatch keep using the existing active driver job link safe-summary fallback for driver-entered vehicle models, and the fallback read can retry after a driver save instead of getting stuck behind an early stale read.
- Dashboard Active Jobs Monitor only lists jobs inside the one-hour-before-pickup monitor window.
- Dashboard Upcoming booking rows show assigned driver name/contact/plate/vehicle details when available.
- Dashboard driver report auto-refresh has an explicit 10-second on/off switch; manual Refresh remains available.
- Customers payment review rows are compact by default; the mock payment controls and long notes stay collapsed until `View details` is opened.
- No app smoke, provider send, external notification delivery, GPS/live location, billing/payment/PDF/invoice/payout, env, DB schema, parser, calendar, or duplicate workflow sector was added.
- Guard coverage lives in `scripts/test-admin-dashboard-live-followup-fixes-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Dispatch Flight Location Copy And Link Feedback

- Departure copies now attach the flight detail to the drop-off location line.
- Arrival copies now attach the flight detail to the pickup location line.
- Customer Copy, Driver Dispatch, and Driver Job Link copy reuse the same formatter so the airport-side location is consistent.
- The Driver Job Link `Copy Link` button now shades green and changes to `Copied` after a successful copy.
- This is copy/UI-only; it does not change parser behavior, booking saves, driver job link API payloads, DB writes, env values, provider sends, GPS/live location, billing/payment/PDF/invoice/payout, or deploy behavior.
- Guard coverage lives in `scripts/test-dispatch-flight-location-copy-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Dispatch Action Feedback And Compact Review

- Dispatch action buttons now reuse a common completed-state style so finished actions shade green and switch to result wording.
- Customer Copy, Job Card, Driver Dispatch, Driver Job Link, Email/WhatsApp/SMS checks, and in-app send controls use result labels only when their existing local state confirms success.
- The Driver Job Link card no longer renders the active-link status pill, copied success box, or loaded-active-link banner shown below the buttons; only errors remain as separate feedback.
- The Job Card Preview action toolbar is compact and wrapped; Save + CRM now sits in its own primary save group, separated from Calendar/Edit/Copy utility buttons and Manual Extra Charges, without changing the save or calendar handlers.
- Admin Dispatch fields no longer show required asterisks; Save + CRM can save an admin draft even when customer/contact/date/route fields are blank.
- Blank admin draft values are saved through safe `To Confirm` placeholders where the `/api/admin-bookings` contract requires text, while optional Booker email still validates only when typed.
- Google Calendar auto-sync is skipped for incomplete admin drafts that do not have real date/time or route details, so placeholder draft saves do not create fake calendar events.
- Job Card Preview now shows Save Booking + CRM feedback beside the compact toolbar, so failed/saved state is visible where the operator clicks instead of only in the lower persistence panel.
- Job Card extra charges, Job Card preview, Driver Dispatch preview, Driver Job Link preview, and admin readiness chips are collapsed behind compact disclosure rows.
- This keeps Save Booking + CRM on `POST /api/admin-bookings`; it does not change driver job link API payloads, provider sends, DB schema, env values, GPS/live location, billing/payment/PDF/invoice/payout, parser behavior, or deploy behavior.
- Guard coverage lives in `scripts/test-dispatch-action-feedback-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customers Outstanding Review Compact Dropdown

- Outstanding Payments Review now renders each customer as a slim account row with only compact `Open` and `Actions` controls visible by default.
- The `Actions` control uses the existing expanded row state as a dropdown; mock payment controls, long notes, and row feedback stay inside that dropdown.
- The default row keeps the practical scan fields visible: customer, invoice, outstanding amount/status, aging, due date, and next action.
- This is UI-only polish on the existing local/mock customers page; it does not add routes, APIs, DB reads/writes, env changes, deploys, provider sends, GPS/live location, billing/payment/PDF/invoice/payout activation, calendar sync, or shims.
- Guard coverage lives in `scripts/test-customers-outstanding-review-dropdown-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customers Remaining Queues Compact Dropdowns

- Collection Follow-up Queue now renders each account as a slim row with compact `Open` and `Actions` controls.
- Monthly Account Statement Preview now uses the same compact row/dropdown pattern instead of large action cards.
- Follow-up buttons, statement row details, preview controls, long helper text, and feedback stay inside native `Actions` dropdowns.
- This is UI-only polish on the existing local/mock customers page; it does not add routes, APIs, DB reads/writes, env changes, provider sends, GPS/live location, billing/payment/PDF/invoice/payout activation, calendar sync, or shims.
- Guard coverage lives in `scripts/test-customers-remaining-queues-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customers Invoice Workspace Cleanup

- Customers page daily flow is compact: summary strip, customer finder, unbilled checkpoint, then invoice workspace.
- Statement previews are the default tab because this page is the invoice-sending workbench.
- The duplicate folder handoff support drawer is removed; advanced booking/draft tools and mock logs sit after the daily invoice workflow instead of before it.
- This is UI-only structure cleanup; it does not activate invoice/PDF/payment/provider sending, DB writes, env changes, GPS/live location, billing/payout, calendar sync, parser changes, or shims.
- Guard coverage lives in `scripts/test-customers-invoice-workspace-cleanup-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customers Folder Finder And Unbilled Queue

- Customers page now has a visible Customer Folder Finder that searches all loaded customer folders and paginates the compact folder rows 10 per page by default.
- The finder uses a visible `All customers` dropdown for direct folder selection; it shows 10 customer folders at a time and keeps numbered page buttons inside the dropdown for larger 200-plus account lists.
- The finder keeps the existing guarded `Load Accounts` control visible as a compact one-line button, with the folder count shown as a small `1-10 of N folders` chip; that same button now refreshes the guarded saved-booking bridge for the existing Unbilled Customers queue without adding a new route/API.
- A new Unbilled Customers checkpoint sits before the invoice workspace so unbilled draft rows and statement-needed account rows are visible before invoice work starts.
- Guarded saved-booking reads now check the existing completed closeout status for those references and bridge only closeout-ready saved bookings into the existing Unbilled Customers queue with `Draft amount not set`.
- Closeout-ready saved-booking rows prefer the matched customer folder slug as the invoice `customerId`, so issued invoices stay visible in the token-scoped customer portal for that folder.
- Each unbilled row has a compact `Prepare` action that changes through `Preparing` to `Prepared`, loads that exact customer/job into the Send Invoice Workbench prep strip, opens the Statements tab, narrows the Outstanding search to that customer, and focuses the next workbench action.
- The finder no longer shows a separate page-size dropdown or separate previous/next buttons; the Unbilled Customers list keeps one dropdown plus a compact scrollable row/table, with the duplicate selected-label wording below the dropdown removed.
- This is a UI handoff into the existing admin monthly billing workflow; it does not add a second invoice engine, create invoice numbers, generate PDFs, send invoices, activate payment/provider sending, write DB rows, change env, activate GPS/live location, billing/payout automation, calendar sync, parser changes, or shims.
- Guard coverage lives in `scripts/test-customers-folder-finder-unbilled-queue-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Trust Path And Portal Invoice Folder Lock

- Customer `/book` and `/my-bookings` request forms both require contact number, passenger name, pickup date, pickup time, pickup location, and drop-off location before submission.
- The customer portal has a compact `Invoices` section with `Unpaid` and `Paid` folders grouped by month, reading only server-stored customer invoice records through the existing secure customer portal session boundary.
- Customer portal stored invoice and PDF reads explicitly use same-origin credentials so the secure HttpOnly account session is sent without exposing token plumbing in the page.
- The portal invoice section shows whether the customer is seeing stored account PDFs or a sign-in-required state, and PDF buttons change through Downloading, Downloaded, or Try again.
- The portal invoice folders do not import admin mock customer data and do not call admin APIs, Stripe/payment providers, email/SMS/WhatsApp providers, or write APIs.
- Admin Customers keeps the Unbilled Customers checkpoint as one dropdown plus a compact scrollable table; the duplicate wording block below the dropdown is removed.
- Admin Customers subtracts already-issued invoice references from the Unbilled Customers checkpoint, including server-stored invoice records and browser-local issued invoice records, so an already-invoiced job does not remain available for duplicate billing.
- Customer saved-booking reads remain booking-only and strip invoice/payment/PDF/finance/internal fields; invoice rows now use their own customer-scoped source and PDF download route filtered by the portal customer account.
- Hourly billing remains locked to the 15-minute grace rule: 16 minutes or more starts the next chargeable hour.
- This trust-path pass does not activate Stripe/payment links, bank debit, payouts, provider job sending, GPS/live location, or automatic payment reconciliation.
- Guard coverage lives in `scripts/test-customer-trust-path-invoice-portal-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Stored Invoice Record PDF And Portal Folder Lock

- Admin Customers can issue a stored customer invoice from the prepared Unbilled Customers row after the approved amount, due date, folder, and optional customer email are reviewed.
- The issue action creates a unique `INV-YYYYMMDD-####` invoice number only at click time, writes one `customer_invoice_records` row with the generated PDF bytes, and starts a PDF download from the stored server record.
- The customer portal `Invoices` tab reads only server-stored invoice records under compact `Unpaid` and `Paid` monthly folders when the secure portal session is active; browser-local invoice fallback is not rendered in the customer portal.
- The customer portal invoice/PDF reads explicitly send same-origin credentials, keep the secure account session invisible to the page, and show stored/sign-in state plus Downloading/Downloaded/Try again button feedback.
- Downloaded invoice PDFs embed the safe Company Profile JPEG logo when available and keep company name, contact, accounting email, address, bank/payment instructions, and footer terms in the same customer-facing profile path.
- Admin must click `Preview Invoice` before `Issue Invoice + PDF`; changing amount, due date, folder, or adjustment reason makes the preview stale and blocks issue until refreshed.
- The per-invoice Card payment checkbox is off by default; when enabled it appends customer-facing card payment wording to that invoice line item, with an optional 10% card processing fee note.
- Changing the card payment checkbox or card fee note makes the invoice preview stale and blocks issue until admin refreshes the preview.
- The amount input is required before issue so admin must review the charge before invoice number/PDF creation.
- Issued invoices show one compact status toggle: unpaid rows show `Paid`, and paid rows show `Unpaid`, so an accidental paid click can be reversed before any payment reconciliation exists.
- Paid/Unpaid status changes refresh the stored PDF bytes/hash in the same server update so the customer portal folder status and downloaded invoice PDF status cannot disagree.
- `Email` is wired behind `PRESTIGE_CUSTOMER_INVOICE_EMAIL_SEND_ENABLED`, `PRESTIGE_EMAIL_PROVIDER=resend`, `PRESTIGE_CUSTOMER_INVOICE_EMAIL_FROM`, optional `PRESTIGE_CUSTOMER_INVOICE_EMAIL_RECIPIENT_ALLOWLIST`, and `RESEND_API_KEY`; closed gates mark the invoice email status blocked and do not call Resend.
- The `customer_invoice_records` migration scaffold is service-role only with RLS enabled and no anon/authenticated grants.
- This pass does not activate Stripe checkout/payment links, card charges, bank debit, payout, provider job sending, GPS/live location, automatic payment reconciliation, or customer-visible internal/mock/debug data.
- Guard coverage lives in `scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Hourly Invoice Auto Calculation Lock

- Admin Customers can create a mock/local hourly booking row with actual start time, actual end time, and a default `$65/hr` rate.
- Hourly invoice amounts use the locked 15-minute grace rule: 16 minutes or more starts the next chargeable hour.
- Preparing an hourly unbilled row carries the calculated amount and calculation breakdown into the Send Invoice Workbench.
- The generated invoice/PDF line item includes the hourly start/end, actual minutes, billable minutes, and hourly rate.
- Issued invoices show compact PDF, gated Email, and one Paid/Unpaid status toggle in the issued invoice table.
- The added `Hourly Test Customer` is mock/local test data only and does not create real customer, payment, provider, bank, or Supabase records.
- This pass does not create Stripe/payment links, write bank/provider/payout records, change env, activate GPS/live location, or activate automatic payment reconciliation.
- Guard coverage lives in `scripts/test-customer-hourly-invoice-auto-calculation-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Invoice Driver JC Timing And Override Guard

- Preparing an hourly unbilled invoice row now checks the existing guarded driver JC actual-time summary read path by booking reference.
- A completed driver JC timing summary recalculates the customer invoice amount with the locked 15-minute grace hourly rule and the `$65/hr` default rate.
- The Approved amount remains editable before issue, but changing it away from the calculated amount requires an Adjustment reason before invoice/PDF creation.
- Adjustment reasons stay in admin review feedback and are not printed into the customer PDF line item.
- The driver JC invoice read is GET-only through `/api/admin-driver-job-dsp-actual-time-summaries` with `x-prestige-admin-purpose`; it does not write records, send providers, activate payments, or expose driver/customer forbidden data.
- This pass does not send invoices/email/reminders, create Stripe/payment links, write bank/payment/provider records, write Supabase rows, change env, apply migrations, or activate cross-device invoice sync.
- Guard coverage lives in `scripts/test-customer-invoice-driver-jc-override-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Completed History Billing Audit Scope Lock

- Completed / History remains the search surface for earlier jobs and true completed jobs, so operators can locate older work without returning those rows to Current / Upcoming.
- The completed booking billing readiness audit now sends only booking rows with status `Completed` to the billing audit payload.
- Earlier non-completed history rows are not treated as completed billing evidence and do not count toward the audit button enablement or pre-run audit count.
- This prevents older scheduled/confirmed history rows from entering billing readiness checks while keeping the compact history lookup intact.
- No customer/driver surface, payment provider, payout, GPS/live location, env, migration, parser, provider-send, email-send, or invoice-send activation is changed by this scope lock.

### Customer Booking Request Flight Persistence Fix

- Public `/book` flight number input now persists into the safe operational `flight_no` booking field, instead of living only in the parser/source summary.
- Admin booking persistence save and reload include `flight_no`, so a customer request loaded into Dispatch carries the flight into Customer Copy.
- The existing copy formatter still applies the customer-facing airport rule: departure bookings append flight detail to drop-off, arrival bookings append flight detail to pickup.
- This fix does not add provider sends, customer notifications, GPS/live location, billing/payment/PDF/invoice/payout records, env changes, migrations, parser activation, or a duplicate workflow.
- Customer/driver-visible forbidden data remains blocked from this path: driver payout, PayNow payout, customer price, billing, invoice, payment, internal admin notes, parser/debug, secrets, raw provider payloads, and mock QA/dev archive data.
- Guard coverage lives in `scripts/test-customer-booking-request-api-contract.mjs` and `scripts/test-dispatch-flight-location-copy-guard.mjs`.

### Customer Folder Job History Compact Rows

- Customer folder `Job history snapshot` now uses one slim summary strip plus a compact scrollable table instead of summary cards and large job cards.
- The duplicate Upcoming/Completed job blocks are combined into one compact index table below All booking history.
- This is customer-folder UI-only polish on existing mock/customer data; it does not add routes, APIs, DB reads/writes, env changes, Vercel changes, invoice/PDF/payment/provider sending, payout automation, GPS/live location, calendar sync, parser changes, or shims.
- Guard coverage lives in `scripts/test-customer-folder-job-history-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Live William Walkthrough CRM And Driver Job Proof

- Evidence marker: `WILLIAM-WALKTHROUGH-20260626074259`.
- Live app target: `https://app.prestigelimo.sg`.
- Source-of-truth code during evidence: `0632c84 Use server persistence for driver job production mode`.
- The evidence used one clearly marked temporary live test booking only.
- `/`, `/book`, and `/my-bookings` returned HTTP 200.
- `/book` customer booking request submit returned HTTP 200.
- Supabase verification found exactly one matching marked booking row before cleanup.
- Admin CRM load through `/api/admin-bookings` returned HTTP 200 and found the marked booking.
- Admin confirm/edit through `/api/admin-bookings` returned HTTP 200.
- Admin driver job link create returned HTTP 200.
- Admin driver job link load returned HTTP 200 and returned one matching safe link summary.
- Driver job API load returned HTTP 200 in production mode.
- Driver job page returned HTTP 200.
- Driver status progression returned HTTP 200 for `driver_otw`, `ots`, `pob`, and `completed`.
- Driver job link revoke returned HTTP 200.
- Anonymous customer saved-bookings read stayed blocked with HTTP 403.
- Cleanup deleted the exact temporary evidence rows only: driver status events, driver job link, customer app notification rows if any, audit rows, route points, service items, booking row, customer contact, and customer row.
- Zero matching rows remained afterward for the marked booking, `driver_job_links`, `driver_job_status_events`, and `customer_driver_app_notification_outbox`.
- Earlier same-day failed walkthrough attempts were test-payload issues only (`audit` object on admin booking update, unsupported `luggage` service item, and wrong revoke payload shape); each attempt cleaned its marked rows to zero before rerun.
- No private customer data, booking references, tokens, row IDs, DB URLs, env values, API keys, raw provider payloads, or secrets were printed or recorded.
- No Vercel CLI, Vercel env change, browser/dashboard automation, or redeploy occurred.
- No provider sends/calls, Email/Telegram/WhatsApp/SMS, real GPS, broad customer live map, billing/payment/PDF/invoice/payout, calendar sync, parser change, shim, Google/OneMap/FlightAware call, or production finance/live-location activation occurred.

## Next GPT Lock / Uncompleted Backlog

- Last verified repo checkpoint before this Load Bookings typed primary display source staging smoke record: `a682e97 Implement Load Bookings typed primary display source`.
- Latest staging-smoked app checkpoint to preserve: `a682e97 Implement Load Bookings typed primary display source`.
- Latest `origin/staging` branch head to preserve: `47980662d5bebfcc2dadd151055604ab19026a8f` (`4798066 Record staging smoke for Load Bookings typed display`), docs-only smoke record for `a682e97 Implement Load Bookings typed primary display source`, verified directly with `git ls-remote`.
- Recent forward activation-readiness locks already completed and smoked; do not repeat them: rate settings scalar activation readiness `331f854` plus smoke record `f1d6b07`, customer rates activation readiness `d4d22e3` plus smoke record `c6619c7`, driver payout rules activation readiness `49039b9` plus smoke record `59e69c6`, full driver profile activation readiness `566fdba` plus smoke record `98cb731`, company/traveler CRM runtime write activation readiness `dea22b3` plus smoke record `d070ad6`, public customer/driver auth surface guard `52af3d6` plus smoke record `f93d5f9`, public billing/payment surface guard `df51173` plus smoke record `f892af7`, public live location surface guard `bfa61e5` plus smoke record `8e8fc73`, and public OTS photo proof surface guard `168f710`.
- Company/traveler CRM identity/contact staging write gate evidence is now completed for staging target `ded13cd Guard remote staging ledger branch head`; do not repeat it. The evidence used one bounded staging DB write window through the existing `POST /api/admin-company-traveler-crm-runtime-write-action` route helper, wrote only safe CRM identity/contact fields to `companies` and `travelers`, closed the gate afterward, and confirmed the deployed staging route still returns `write_gate_closed`.
- Rate settings scalar staging write gate evidence is now completed for staging target `b3f858e Record CRM staging write gate evidence`; do not repeat it. The evidence used one bounded same-value default-row upsert through the existing `POST /api/admin-rate-settings-runtime-write-action` route helper, kept scalar business values unchanged, closed the in-process gate afterward, and confirmed the deployed staging route still returns `write_gate_closed`.
- Customer rates staging write gate evidence is now completed for staging target `c3b517f Record rate settings staging write gate evidence`; do not repeat it. The evidence used one bounded same-value company `customer_rates` update through the existing `POST /api/admin-customer-rates-runtime-write-action` route helper, kept customer rate values unchanged, closed the in-process gate afterward, and confirmed the deployed staging route still returns `write_gate_closed`.
- Driver payout rules staging write gate evidence is now completed for staging target `a49dafb Record customer rates staging write gate evidence`; do not repeat it. The evidence used one bounded same-value company `driver_payout_rules` update through the existing `POST /api/admin-driver-payout-rules-runtime-write-action` route helper, kept business values unchanged, closed the in-process gate afterward, and confirmed the deployed staging route still returns `write_gate_closed`.
- Full Driver Profile staging write gate evidence is now completed for staging target `16ba6c3 Guard full driver profile five-field write scope`; do not repeat it. The evidence used one bounded same-value safe driver update through the existing `POST /api/admin-full-driver-profile-runtime-write-action` route helper, kept business values unchanged, closed the in-process gate afterward, and confirmed the deployed staging route still returns `write_gate_closed`.
- Next forward lane after this source-of-truth alignment: choose the next bounded docs/test-only/read-only preactivation hardening guard after reading the ledger and current code; do not perform endpoint migration, env change, DB write, provider send, migration, parser change, Save Booking change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector addition, or new shim without separate approval.
- Current business-grade forward direction is now sequence-locked: Confirmed Booking To Dispatch Release is complete, confirmed-only eligibility is implemented and guarded, staging smoke is recorded, and the existing Dispatch Release workflow was reused without duplicate UI sector/button/card/route/helper/shim; do not repeat it. Admin Driver Acknowledgement Dispatch Release sequencing is complete, staging-smoked, and guarded; do not repeat it. Any next runtime lane requires a fresh no-edit readiness audit plus explicit owner approval naming the lane; without new approval, stay on read-only audit, local tests/smokes, docs clarification, docs/test-only guard hardening, already-approved bug fixes, review, and commit.
- Existing admin-only Dispatch Release workflow is now no-duplicate locked: reuse the current checklist, mark-ready control, handoff packet, and `/api/admin-booking-workflow-statuses` integration; do not add a second Dispatch Release UI sector/button/card/route/helper/shim without explicit owner approval.
- Existing admin-only Driver Acknowledgement workflow is now no-duplicate locked: reuse the current readiness, mark-ready control, follow-up tracker, and `/api/admin-booking-workflow-statuses` integration; do not add a second Driver Acknowledgement UI sector/button/card/route/helper/shim without explicit owner approval.
- Existing admin-only Driver Acknowledgement Dispatch Release sequencing is now boundary-locked: Driver Acknowledgement mark-ready/save and follow-up advancement require the existing Dispatch Release workflow status to be saved ready first; reuse the current readiness, mark-ready control, follow-up tracker, and `/api/admin-booking-workflow-statuses` integration.
- Existing admin-only Day-of-Trip Dispatch Monitor is now no-duplicate locked: reuse the current monitor, local status controls, saved driver status readout, and GET-only `/api/admin-driver-job-statuses` integration; do not add a second day-of-trip monitor UI sector/button/card/route/helper/shim without explicit owner approval.
- Existing admin-only Day-of-Trip Dispatch Monitor Driver Acknowledgement sequencing is now guard-locked: local OTW, OTS, POB, and Completed progress controls remain blocked until Driver Acknowledgement is acknowledged through the gated Driver Acknowledgement follow-up outcome; reminder/needs-call states remain available for manual exception handling.
- Existing admin-only driver exception/recovery contract now covers the current Post-Recovery Update Readiness anchor: reuse `data-admin-day-of-trip-exception-escalation`, `data-admin-dispatch-recovery-replacement-readiness`, `data-admin-post-recovery-update-readiness`, and the existing completed closeout review section; do not add a second exception, recovery, post-recovery, or closeout exception UI sector/button/card/route/helper/shim without explicit owner approval.
- Existing admin-only exception/recovery to closeout sequencing is now docs/test guard-locked through derived readiness state: Dispatch Recovery feeds Post-Recovery update readiness, Post-Recovery and closed exception review feed Day-of-Trip Completion Handoff, and Completion Handoff feeds Completed Trip Closeout Review checklist states.
- Existing admin-only Day-of-Trip Completion Handoff and Completed Trip Closeout Review workflow is now no-duplicate locked: reuse the current completion handoff, completed closeout review, and guarded `/api/admin-completed-booking-closeouts` integration; do not add a second closeout UI sector/button/card/route/helper/shim without explicit owner approval.
- Existing admin-only Closeout to Billing Preparation workflow is now no-duplicate locked: reuse `data-admin-closeout-to-billing-preparation-review`, `data-admin-billing-preparation-exception-review`, and `data-admin-billing-preparation-summary-ready-review`; do not add a second billing-prep UI sector/button/card/route/helper/shim or activate invoice/PDF/payment/payout/billing automation without explicit owner approval.
- Existing admin-only Closeout to Billing Preparation sequencing is now docs/test guard-locked through derived readiness state: Completed Trip Closeout feeds Closeout to Billing Preparation, Billing Preparation exceptions feed the summary, and the summary feeds Monthly Billing Queue readiness locally without activating billing/invoice/PDF/payment/payout behavior.
- Existing admin-only Monthly Billing Queue workflow is now no-duplicate locked: reuse `data-admin-monthly-billing-queue-readiness-review` and `data-admin-monthly-billing-queue-exception-review`; do not add a second monthly billing queue UI sector/button/card/route/helper/shim or activate invoice/PDF/payment/payout/billing automation/month grouping writes without explicit owner approval.
- Existing admin-only Monthly Billing Month Grouping workflow is now no-duplicate locked: reuse `data-admin-monthly-billing-month-grouping-review`, `data-admin-monthly-billing-month-grouping-read-controls`, `data-admin-completed-booking-billing-readiness-audit-action`, `data-admin-monthly-billing-draft-plan-save-action`, and the existing monthly invoice draft/review action controls; do not add a second month grouping/draft/invoice review UI sector/button/card/route/helper/shim or activate invoice creation, PDF generation/sending, payment, payout, billing automation, customer messages, or driver notifications without explicit owner approval.
- Existing admin-only Monthly Billing Queue to Month Grouping sequencing is now docs/test guard-locked through derived readiness state: Monthly Billing Queue ready state feeds Month Grouping local fallback counts only when no saved monthly billing group is loaded, blocked queue/saved trips block grouped readiness, and Month Grouping stays on existing read/review controls without activating invoice/PDF/payment/payout/provider/billing automation/customer/driver sends.
- Existing admin-only Monthly Billing Month Grouping to Draft Plan / Invoice Review sequencing is now docs/test guard-locked through derived readiness state: saved Month Grouping gates draft-plan and invoice draft-prep, saved invoice draft gates item review, saved item review and reviewed amount gate billable price review, approved billable price review gates issue review, saved issue review gates issue record creation, locked issue record gates invoice-number reservation, and reserved invoice number gates PDF-review readiness without activating invoice creation/PDF generation or sending/payment/payout/provider/billing automation/customer or driver sends.
- Admin billing/payment finance activation split is now docs/test guard-locked: future finance runtime work must choose exactly one separately approved sub-lane from invoice number readiness, invoice/PDF format, PDF generation, invoice sending, payment links/provider, manual payment reconciliation, or payout/accounting/finance export, with payout/accounting kept separate from customer billing/payment.
- Admin monthly invoice PDF format approval/readiness is now docs/test guard-locked: future invoice/PDF format decisions remain a separate sub-lane before PDF generation, must define invoice/statement naming, included rows, trip snapshots, tax/GST handling, payment terms, staff review, private-field exclusions, and generated-file access policy, and still cannot implement runtime format behavior, create invoices, generate PDFs, send invoices, create payment links, record payments, automate payouts/accounting/export, run billing automation, or change runtime without explicit owner approval.
- Admin monthly invoice PDF generation approval/readiness is now docs/test guard-locked: future PDF generation remains a separate sub-lane after PDF-readiness review and still cannot generate PDFs, send invoices, create payment links, record payments, automate payouts/accounting/export, run billing automation, or change runtime without explicit owner approval.
- Admin monthly invoice customer/company prefix running-number approval/readiness is now docs/test guard-locked: future invoice prefix and sequence policy remains a separate sub-lane, must use admin-approved unique prefixes per billing customer/company, must prevent duplicate or reused voided/cancelled invoice numbers, and still cannot assign runtime invoice numbers, generate PDFs, send invoices, create payment links, record payments, automate payouts/accounting/export, run billing automation, or change runtime without explicit owner approval.
- Admin monthly invoice sending/delivery approval/readiness is now docs/test guard-locked: future invoice sending remains a separate sub-lane after invoice-number reservation and separately approved PDF generation, and still cannot send invoices, deliver customer messages, activate providers, create payment links, record payments, automate payouts/accounting/export, run billing automation, or change runtime without explicit owner approval.
- Admin monthly invoice payment links/provider approval/readiness is now docs/test guard-locked: future payment links/provider remains a separate sub-lane after staff-reviewed billing/payment context, must define test-mode scope, provider, secret handling, webhook security, idempotency, payment-status mapping, failure states, disabled-by-default production posture, no-auto-send proof, and rollback, and still cannot create payment links, create checkout sessions, activate webhooks, use live Stripe mode, send invoices/customer messages, record payments, automate payouts/accounting/export, run billing automation, or change runtime without explicit owner approval.
- Admin monthly invoice manual payment record/reconciliation approval/readiness is now docs/test guard-locked: future manual payment record/reconciliation remains a separate sub-lane after staff-confirmed funds outside the app, must define actor roles, evidence fields, customer-visible fields, payment-status mapping, correction/reversal workflow, audit requirements, duplicate/retry safety, no-bank-API/no-auto-reconciliation proof, and rollback, and still cannot record payments, persist reconciliation, change customer payment status, access bank APIs, scrape bank data, auto-reconcile, create payment links, activate providers, automate payouts/accounting/export, run billing automation, or change runtime without explicit owner approval.
- Admin monthly payout/accounting/finance export approval/readiness is now docs/test guard-locked: future payout/accounting/finance export remains a separate finance-only sub-lane after staff-reviewed monthly billing/payment context, must define finance-only role access, exported fields, excluded customer/driver fields, PayNow handling, accounting destination, export format, duplicate export prevention, correction/reversal workflow, audit requirements, rollback, and customer/driver visibility proof, and still cannot generate exports, post to accounting providers, execute payouts, activate PayNow/bank APIs, record payments, automate billing, or change runtime without explicit owner approval.
- Existing admin Customer Copy multi-channel workflow is now no-duplicate locked: reuse `data-dispatch-workflow-step="customer-whatsapp-copy"`, `data-copy-edit-button="customerCopy"`, `data-copy-copy-button="customerCopy"`, `data-copy-preview="customerCopy"`, `data-customer-live-location-helper`, `data-admin-customer-driver-details-email-review-item`, the existing compact Email/WhatsApp/SMS controls, and `data-admin-email-activation-preflight-status`; Email may use only the existing gated Resend POST route, while SMS/WhatsApp remain parked and duplicate channel/provider UI sectors/buttons/cards/routes/helpers/shims remain blocked.
- Completed foundations/APIs/UI not to repeat: Flight ETA setup-only chain, email setup-only chain, Telegram disabled/internal admin alert setup foundations, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, WhatsApp customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, SMS customer driver details setup foundation, preview/readiness API, disabled send API, send audit payload setup, and no-live guard, secure customer driver-details link setup foundation, preview/readiness API, disabled access API, access audit payload setup, and no-live guard, email no-live guard, customer driver details email preview/readiness API, disabled customer driver details email send API, customer driver details email send audit payload setup foundation, customer driver details email review item API, Customer Copy customer driver details email review UI, disabled-send button, email activation preflight status UI, WhatsApp/SMS disabled-send UI, compact multi-channel buttons row/layout fix, admin dashboard horizontal overflow fix, and multi-channel no-live guard, Dispatch pricing/review/OneMap section reorder, Save Booking + CRM button placement near Job Card Preview actions, Save Booking duplicate-submit guard, separated Save Booking + CRM and calendar actions, Save Booking + CRM safe admin booking persistence reroute, disabled admin booking read/list/detail contract setup and no-live guard, unused legacy bookings shim surface retirement, booking UI browser test stabilization, calendar event lifecycle readiness setup foundation/API, disabled action API, action audit payload setup foundation, and no-live guard, customer amendment/cancellation review handoff setup foundation/API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, live location window policy setup foundation/API, disabled access/capture API, and no-live guard, OTS photo proof setup foundation, preview/readiness API, disabled access/upload API, audit payload setup foundation, and no-live guard, customer/driver auth readiness setup foundation/API, disabled access API, access audit payload setup foundation, no-live guard, and pre-activation audit lock, billing/payment readiness setup foundation, preview API, disabled action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock, production deployment hardening readiness setup foundation/API, disabled action API, action audit payload setup foundation, and no-live guard, staging deployment approval packet and guard, core admin booking persistence activation readiness packet, guard, safe path guard, and Save Booking + CRM safe reroute, global pre-activation no-live guard, activation decision matrix guard, pre-activation verification suite, shim cleanup typed API inventory, shim cleanup no-new-shim guard, companies CRM identity/domain typed helper/API and typed display wiring, travelers CRM identity/default-address typed helper/API and typed display wiring, company/traveler CRM write-readiness setup foundation/API, disabled action API, audit payload setup foundation, no-live guard, and pre-activation audit lock, driver assignment/display typed helper/API and booking assignment display wiring, email provider readiness setup foundation/API, email provider selection setup foundation/API, email activation preflight setup API, app smoke email preflight setup-only allowlist, driver ack customer message handoff setup foundation/API, ledger guards.
- Uncompleted backlog: provider activation/live sending later; Telegram/WhatsApp activation; FlightAware live; live location activation; OTS photo activation; customer/driver auth activation; billing/payment activation; shim cleanup; production.
- Rules: no duplicate work, no new product features without explicit owner approval, no new shims, no unnecessary UI/giant cards, no live risky features without approval.

## Master Pre-Activation Completion Audit Lock

- Full app is complete up to the activation stop across: Customer Copy Email/WhatsApp/SMS driver-details messaging; secure customer driver-details link; Telegram internal admin alerts; Flight ETA setup-only chain; live location; OTS photo proof; customer/driver auth; billing/payment; customer amendment/cancellation review flow; calendar event lifecycle; company/traveler CRM write-blocked readiness; production hardening; core admin booking persistence activation readiness packet; shim cleanup guards and parked risky write paths; global pre-activation no-live guard.
- Global pre-activation no-live guard is done at `e381e3e Add global pre-activation no-live guard`; it coordinates the completed module guards, shim cleanup guard, setup route GET-only checks, and master ledger approval/block wording.
- Activation decision matrix guard is done at `702ec53 Add activation decision matrix guard`; it keeps the matrix rows and explicit approval requirements locked.
- Pre-activation verification suite is done at `da21fb5 Add pre-activation verification suite` and now includes `4382cdf Add staging deployment approval packet guard`, `96c4e7a Add core booking persistence activation packet guard`, `4045c0a Add core booking persistence safe path guard`, `6214484 Add disabled admin booking read contract setup`, `e438e0c Add admin booking read no-live guard`, the ledger preactivation suite registration guard, the current implementation ledger alignment guard, and the current implementation ledger not-live guard; it fail-fast runs the global guard, activation matrix guard, staging deployment approval packet guard, core admin booking persistence activation packet guard, core booking persistence safe path guard, channel/module no-live guards, production hardening guard, ledger suite-registration guard, ledger alignment guard, ledger not-live guard, disabled admin booking read contract setup check, admin booking read no-live guard, and shim cleanup guard.
- Booking UI browser stabilization is done at `4b7a1ab Stabilize booking UI browser test`; stale browser expectations/mocks were aligned to the current Customer Copy setup-only routes, separated Save Booking + CRM and Create Calendar Event flow, typed traveler identity read, and saved-address mock path.
- Disabled admin booking read/list/detail contract setup is done at `6214484 Add disabled admin booking read contract setup`; the dedicated no-live guard is done at `e438e0c Add admin booking read no-live guard`; it remains setup-only, disabled/no-live-read/no-op, is registered in the preactivation verification suite, and has no Load Bookings or `app/page.tsx` runtime wiring.
- Driver job link GET validation is fixed at `43c5970 Fix driver job link GET validation`; GET/read for `/api/admin-driver-job-links` now accepts safe dashboard-style booking refs without noisy 400s while POST create, PATCH revoke, and token creation/revocation behavior remain unchanged.
- Calendar event lifecycle status: readiness foundation, preview/readiness API, disabled action API, action audit payload setup foundation, no-live guard, and final pre-activation lock are done; customer amendment/cancellation never auto-updates calendar; calendar create/update/cancel remains blocked until explicit approval.
- Production hardening status: readiness foundation, preview/readiness API, disabled production action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock are done.
- Shim cleanup status: inventory and no-new-shim guard are done; companies CRM identity/domain typed API and travelers CRM identity/default-address typed API are done and wired into company/traveler display-read at `69c269d Wire company traveler identity display to typed APIs`; unused legacy bookings shim surface is retired; driver assignment display now uses the existing typed display-only API for the booking assignment display path; Driver Database display/search now uses separate typed display-only state fed by the existing `/api/admin-driver-assignment-display` route; company/traveler CRM write setup is locked through the activation stop; CRM identity/contact payload code is split from rate override payload code at `d65aac1 Split CRM identity payload from rate override payload`, the rate separation boundary is finished at `fb2e9ca Finish CRM write rate separation boundary`, the disabled CRM identity/contact write action API is done at `3cfd0a2 Add disabled CRM identity write action API`, the disabled/no-write typed `rate_settings` write action setup is done at `945e894 Add disabled rate settings write action setup`, the setup-only disabled/no-write full driver profile action boundary is done at `9ebaf97 Add disabled full driver profile action setup`, the disabled/no-write full driver profile audit payload setup is done at `0f25461 Add disabled full driver profile audit payload setup`, and the dedicated full driver profile no-live guard is done at `c9b1681 Add full driver profile no-live guard`; customer_rates and `driver_payout_rules` now have gated app boundaries with live DB writes closed by default; risky full-driver profile write/delete runtime paths, real `rate_settings` save/upsert, broader pricing, and broader payout surfaces remain parked.
- Still blocked unless explicitly approved: live DB/write, migrations, deployment, provider/env activation, external APIs, live sending, payment/PDF/payout, auth activation, FlightAware live lookup, live location activation, photo upload/storage, CRM/calendar amendment updates, calendar event lifecycle create/update/cancel and live sync, job-card creation from customer amendments, and risky shim write paths.
- Continue to use setup-only helpers/APIs and direct guards. Do not add new shims, duplicate UI/API/helper work, live provider behavior, or customer/driver-visible finance/internal details.

## Owner Feature Approval Contract Lock

- Owner feature approval is defined in `docs/owner-feature-approval-contract.md` as the global no-new-feature-without-explicit-owner-approval rule.
- This is a docs/test-only contract lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env change, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Vague forward-motion phrases such as `proceed`, `move forward`, `move to next`, `next task`, `keep moving`, or `continue` are not approval to add a new product feature.
- Allowed without new-feature approval: read-only audits, local tests/smokes, docs clarification, docs/test-only guard hardening, already-approved bug fixes, review, and commit.
- Runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env change, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, and new shims still require explicit owner approval.
- Customer and driver privacy blocks remain unchanged; customer/driver-visible finance, payout, internal admin notes, parser/debug internals, raw operational internals, and mock QA/dev archive remain forbidden.
- Future approved UI, if any, must stay compact, colocated with the existing similar area, and protected by matching tests.
- This lock adds `scripts/test-owner-feature-approval-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Pre-Edit Source Of Truth Contract Lock

- Pre-edit source-of-truth inspection is defined in `docs/pre-edit-source-of-truth-contract.md`.
- At every task start, before choosing the next task, moving forward, or editing any repo file, Codex must read recent git history first (`git log --oneline -12` or wider equivalent), current worktree state (`git status --short`), and `docs/current-implementation-ledger.md`.
- The ledger remains the repo source of truth before choosing a task, adding docs/tests, changing UI/API/helper behavior, or committing.
- This lock applies to docs-only, test-only, read-only, review, smoke, bug-fix, and commit work; it prevents moving to a next task without source-of-truth inspection, repeating completed work, moving backward to old staging checkpoints, treating vague forward-motion wording as feature approval, missing a parked risky lane, editing over an unclean worktree, or using inconsistent checkpoint counters instead of commit hashes and task names.
- Allowed next work remains bounded to read-only verification, local tests/smokes, docs clarification, docs/test-only guard hardening, already-approved bug fixes, review, and commit unless the owner explicitly approves a new feature.
- This lock does not approve runtime implementation, UI/API behavior change, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Final task summaries must name the commit hash and task name when a commit is made, list checks that passed, and report final `git status --short`.
- This lock adds `scripts/test-pre-edit-source-of-truth-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Business-Grade Forward Completion Sequence Lock

- Business-grade forward completion sequencing is locked by `docs/business-grade-forward-completion-sequence.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Do not repeat completed persistence, RLS, staging, or production verification unless a new runtime/deploy/env change creates a fresh reason.
- Confirmed Booking To Dispatch Release is complete: confirmed-only eligibility is implemented and guarded, the staging smoke for the eligibility fix is recorded, and the existing Dispatch Release workflow was reused without adding a duplicate UI sector/button/card/route/helper/shim.
- The next runtime lane is not auto-selected by this sequence; it requires a fresh no-edit readiness audit and explicit owner approval naming the lane.
- Without new owner approval, allowed forward work remains read-only audit, local tests/smokes, docs clarification, docs/test-only guard hardening, already-approved bug fixes, review, and commit.
- Testing and staging remain required at the correct layer; staging smoke is required after deploy-relevant runtime change and should not be used to move backward over already-smoked checkpoints.
- Customer/driver privacy blocks remain unchanged: no customer exposure of driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive; no driver exposure of customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance/admin notes, or mock QA/dev archive.
- Business workflow resume Stage 4A-410 audit is registered in `scripts/test-preactivation-verification-suite.mjs` through `scripts/test-business-workflow-resume-stage4a410.mjs`; it keeps the completed Confirmed Booking To Dispatch Release outcome docs/test-only and verifies the public customer booking request route does not expose internal admin review statuses.
- The source-of-truth alignment after `ef080ee` is guarded by `scripts/test-business-workflow-source-of-truth-after-confirmed-dispatch-release.mjs`; stale wording must not pull Codex backward into treating Confirmed Booking To Dispatch Release as the next runtime task.
- This lock adds `scripts/test-business-grade-forward-completion-sequence.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Dispatch Release Existing Workflow Lock

- The existing admin-only Dispatch Release workflow is locked by `docs/admin-dispatch-release-existing-workflow-lock.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Do not add a duplicate Dispatch Release UI sector, button, card, route, helper, or shim.
- Existing surfaces are `data-admin-dispatch-release-checklist`, `data-admin-dispatch-release-mark-ready`, and `data-admin-dispatch-release-handoff-packet` in `app/page.tsx`.
- Existing workflow status integration is `/api/admin-booking-workflow-statuses` with workflow area `dispatch_release` and status label `Ready for dispatch release`.
- Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, and `scripts/test-admin-booking-workflow-status-api-contract.mjs`.
- Future approved changes must stabilize or extend the existing workflow only, stay compact and colocated, and keep customer/driver privacy boundaries intact.
- This lock adds `scripts/test-admin-dispatch-release-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Confirmed Booking Dispatch Release Boundary Lock

- Only normalized `confirmed` bookings are eligible for the existing admin Dispatch Release mark-ready/save path.
- Requested, Pending Staff Review, Cancelled, and Completed bookings are explicitly non-eligible for Dispatch Release; Completed remains closeout/review-only and is not dispatch-release eligible.
- Existing Dispatch Release checklist, mark-ready control, handoff packet, and `/api/admin-booking-workflow-statuses` route are reused without adding a duplicate UI sector, card, button, route, helper, or shim.
- The confirmed-only check runs before the existing workflow-status POST and keeps the mark-ready control disabled until the booking is confirmed and the existing checklist is ready.
- Public customer and driver surfaces cannot trigger Dispatch Release; the boundary remains admin/dispatcher-only.
- This lock does not activate provider sends, payment/PDF, pricing, payout, auth/location/photo/calendar, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, env changes, deploy, live DB reads/writes, or migrations.
- This lock adds `scripts/test-confirmed-booking-dispatch-release-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Deploy Smoke for Confirmed Dispatch Release Eligibility

- `origin/staging` points to `766f305cfb96c3e6e6c7386e8d11ac829763680c` (`766f305 Guard confirmed dispatch release eligibility`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Passive no-click Chrome/CDP staging smoke rendered the main admin UI with title `Prestige Limo Ops`.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was visible but was not clicked.
- Dispatch Release rendered exactly one checklist, one mark-ready control, and one handoff packet.
- No Dispatch Release controls were clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Browser request audit observed 38 GET requests, 0 non-GET requests, 0 POST/write/send requests, 0 non-200 responses, and 0 missing responses.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- The earlier Chrome/CDP abort was a local tooling blocker; the unsandboxed rerun passed and did not require any app/runtime changes.
- Confirmed-only Dispatch Release eligibility remains guarded by `scripts/test-confirmed-booking-dispatch-release-boundary-guard.mjs`.
- Save Booking remains on `POST /api/admin-bookings`; `/api/admin-saved-bookings`, parser behavior, provider send, payment/PDF, pricing, payout, auth/location/photo/calendar, UI sectors/cards/buttons, and shims remain unchanged.

### Staging Docs-Only Alignment for Confirmed Dispatch Release Smoke Record

- `origin/staging` points to `ef080ee1edc44d8e38997eed2423e366054ee94f` (`ef080ee Record staging smoke for confirmed dispatch release`), verified directly with `git ls-remote`.
- `ef080ee` is a docs-only smoke record checkpoint for `766f305 Guard confirmed dispatch release eligibility`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET after the docs-only checkpoint was promoted.
- This source-of-truth alignment does not rerun or duplicate the completed `766f305` no-click browser smoke.
- The no-click smoke recorded by `ef080ee` remains the `766f305` browser smoke: No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- The recorded browser request audit observed 38 GET requests, 0 non-GET requests, 0 POST/write/send requests, 0 non-200 responses, and 0 missing responses.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- Confirmed Booking To Dispatch Release is complete, confirmed-only eligibility remains guarded, and the existing Dispatch Release workflow is reused.
- No duplicate Dispatch Release UI sector/button/card/route/helper/shim was added.
- Save Booking remains on `POST /api/admin-bookings`; `/api/admin-saved-bookings`, parser behavior, provider send, payment/PDF, pricing, payout, auth/location/photo/calendar, UI sectors/cards/buttons, and shims remain unchanged.

### Staging Docs/Test Source-of-Truth Alignment Promotion

- `origin/staging` points to `f370968cbdbd20a48f07d7baabaec0a8cb092792` (`f370968 Align workflow source of truth after dispatch release`), verified directly with `git ls-remote`.
- `f370968` is a docs/test-only source-of-truth alignment checkpoint after the completed confirmed Dispatch Release smoke record.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops` after the docs/test-only checkpoint was promoted.
- No new browser smoke was run for `f370968`; the latest applicable recorded browser smoke remains the no-click `766f305` confirmed Dispatch Release smoke recorded by `ef080ee`.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- The recorded browser request audit observed 38 GET requests, 0 non-GET requests, 0 POST/write/send requests, 0 non-200 responses, and 0 missing responses.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- Confirmed Booking To Dispatch Release remains complete and must not be repeated as the next runtime lane.
- The next runtime lane still requires a fresh no-edit readiness audit plus explicit owner approval naming the lane.
- Save Booking remains on `POST /api/admin-bookings`; `/api/admin-saved-bookings`, parser behavior, provider send, payment/PDF, pricing, payout, auth/location/photo/calendar, UI sectors/cards/buttons, and shims remain unchanged.

## Admin Driver Acknowledgement Existing Workflow Lock

- The existing admin-only Driver Acknowledgement workflow is locked by `docs/admin-driver-acknowledgement-existing-workflow-lock.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Do not add a duplicate Driver Acknowledgement UI sector, button, card, route, helper, or shim.
- Existing surfaces are `data-admin-driver-acknowledgement-readiness`, `data-admin-driver-acknowledgement-mark-ready`, and `data-admin-driver-acknowledgement-follow-up` in `app/page.tsx`.
- Existing workflow status integration is `/api/admin-booking-workflow-statuses` with workflow area `driver_acknowledgement` and status label `Driver acknowledgement ready`.
- Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, and `scripts/test-admin-booking-workflow-status-api-contract.mjs`.
- Future approved changes must stabilize or extend the existing workflow only, stay compact and colocated, and keep customer/driver privacy boundaries intact.
- This lock adds `scripts/test-admin-driver-acknowledgement-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Driver Acknowledgement Dispatch Release Boundary Lock

- Driver Acknowledgement mark-ready/save now requires the existing Dispatch Release workflow status to be saved ready first.
- The existing Driver Acknowledgement readiness surface, mark-ready control, follow-up tracker, and `/api/admin-booking-workflow-statuses` route are reused; no duplicate Driver Acknowledgement UI sector/button/card/route/helper/shim is added.
- The saved Dispatch Release gate runs before the Driver Acknowledgement workflow-status POST and keeps the existing mark-ready control disabled until Dispatch Release is saved ready and the existing Driver Acknowledgement readiness checks are complete.
- The existing Driver Acknowledgement follow-up controls cannot advance beyond pending until the same combined readiness boundary is satisfied.
- Day-of-Trip handoff treats driver acknowledgement as complete only through the gated Driver Acknowledgement follow-up outcome.
- Admin/dispatcher-only boundary remains required through the existing workflow-status route.
- Public customer and driver surfaces cannot trigger Driver Acknowledgement workflow status changes.
- Save Booking remains on `POST /api/admin-bookings`; `/api/admin-saved-bookings`, parser behavior, provider send, payment/PDF, pricing, payout, auth/location/photo/calendar, UI sectors/cards/buttons, and shims remain unchanged.
- This lock adds `scripts/test-admin-driver-acknowledgement-dispatch-release-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Deploy Smoke for Driver Acknowledgement Dispatch Release Boundary

- `origin/staging` points to `7b13575320b878190a9c983d72e0eb1a6ce2b016` (`7b13575 Guard driver acknowledgement dispatch release boundary`), verified directly with `git ls-remote`.
- Remote staging before promotion was `f370968cbdbd20a48f07d7baabaec0a8cb092792`.
- The push to `origin/staging` succeeded; local remote-tracking ref update was blocked by the sandbox lock-file permission, so direct `git ls-remote` is the remote source of truth.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Passive no-click Chrome/CDP staging smoke rendered the main admin UI with title `Prestige Limo Ops`.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was visible but was not clicked.
- Dispatch Release rendered exactly one checklist, one mark-ready control, and one handoff packet.
- Driver Acknowledgement rendered exactly one readiness surface, one mark-ready control, and one follow-up tracker.
- Driver Acknowledgement Dispatch Release boundary text rendered, proving the staged app includes the saved Dispatch Release prerequisite.
- No Dispatch Release or Driver Acknowledgement controls were clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Browser request audit rerun observed 38 GET requests, 38 HTTP 200 responses, 0 non-GET requests, 0 POST/write/send requests, 0 non-200 responses, and 0 missing responses.
- A shorter preliminary CDP audit saw one GET-only load completion still pending; the longer detail rerun passed cleanly and is the recorded smoke result.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- Save Booking remains on `POST /api/admin-bookings`; `/api/admin-saved-bookings`, parser behavior, provider send, payment/PDF, pricing, payout, auth/location/photo/calendar, UI sectors/cards/buttons, and shims remain unchanged.

## Admin Day-of-Trip Dispatch Monitor Existing Workflow Lock

- The existing admin-only Day-of-Trip Dispatch Monitor workflow is locked by `docs/admin-day-of-trip-dispatch-monitor-existing-workflow-lock.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Do not add a duplicate Day-of-Trip Dispatch Monitor UI sector, button, card, route, helper, or shim.
- Existing surfaces are `data-admin-day-of-trip-dispatch-monitor`, `data-admin-day-of-trip-dispatch-monitor-option`, and `data-admin-driver-job-status-readout` in `app/page.tsx`.
- Existing saved driver status integration is GET-only `/api/admin-driver-job-statuses` through `lib/admin-driver-job-status-read.ts`; driver token writes stay on the tokenized driver job route.
- Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, and `docs/backend-api-integration-audit.md`.
- Future approved changes must stabilize or extend the existing monitor only, stay compact and colocated, keep the admin route read-only unless separately approved, and keep customer/driver privacy boundaries intact.
- This lock adds `scripts/test-admin-day-of-trip-dispatch-monitor-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Day-of-Trip Dispatch Monitor Driver Acknowledgement Boundary Lock

- Day-of-Trip progress controls for OTW, OTS, POB, and Completed remain blocked until Driver Acknowledgement is acknowledged through the gated Driver Acknowledgement follow-up outcome.
- Reminder Due and Needs Call remain available before Driver Acknowledgement so dispatchers can handle manual reminders and exceptions without advancing trip progress.
- The existing Day-of-Trip Dispatch Monitor, local progress controls, saved driver status readout, and GET-only `/api/admin-driver-job-statuses` integration are reused; no duplicate Day-of-Trip UI sector/button/card/route/helper/shim is added.
- The admin driver-status route remains read-only for monitoring; driver token writes stay on the tokenized driver job route.
- Public customer and driver surfaces cannot trigger the admin Day-of-Trip monitor controls.
- Save Booking remains on `POST /api/admin-bookings`; `/api/admin-saved-bookings`, parser behavior, provider send, payment/PDF, pricing, payout, auth/location/photo/calendar, UI sectors/cards/buttons, and shims remain unchanged.
- This lock adds `scripts/test-admin-day-of-trip-dispatch-monitor-driver-ack-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Exception Recovery To Closeout Sequencing Guard Lock

- Exception/recovery to closeout sequencing is now docs/test guard-locked through existing derived readiness state.
- Dispatch Recovery / Replacement readiness feeds Post-Recovery replacement-driver copy and new-driver job-link readiness.
- Post-Recovery Update ready locally feeds Day-of-Trip Completion Handoff customer closeout readiness.
- Closed Day-of-Trip Exception Escalation feeds Day-of-Trip Completion Handoff exception/resolution review.
- Day-of-Trip Completion Handoff feeds Completed Trip Closeout Review customer closeout and exception/resolution checklist states.
- Existing admin surfaces are reused: `data-admin-day-of-trip-exception-escalation`, `data-admin-dispatch-recovery-replacement-readiness`, `data-admin-post-recovery-update-readiness`, `data-admin-day-of-trip-completion-handoff`, and `data-admin-completed-trip-closeout-review`; no duplicate UI sector/button/card/route/helper/shim is added.
- The existing completed closeout route remains `/api/admin-completed-booking-closeouts`, guarded/status-only, and separate from Save Booking and `/api/admin-saved-bookings`.
- This lock does not approve stronger runtime-control blocking, endpoint migration, env changes, DB writes, provider sends, parser changes, payment/PDF/pricing/payout/billing activation, auth/location/photo/calendar activation, customer messages, driver notifications, UI sectors/buttons/cards, or new shims.
- This lock adds `scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Completed Trip Closeout Existing Workflow Lock

- The existing admin-only Day-of-Trip Completion Handoff and Completed Trip Closeout Review workflow is locked by `docs/admin-completed-trip-closeout-existing-workflow-lock.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, new live reads, DB writes beyond the existing guarded completed closeout API path, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Do not add a duplicate Completion Handoff or Completed Trip Closeout Review UI sector, button, card, route, helper, or shim.
- Existing surfaces are `data-admin-day-of-trip-completion-handoff` and `data-admin-completed-trip-closeout-review` in `app/page.tsx`.
- Existing completed closeout integration is `/api/admin-completed-booking-closeouts` through `lib/admin-completed-booking-closeout-persistence.ts` and remains guarded/status-only.
- Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, `scripts/test-admin-completed-booking-closeout-api-contract.mjs`, and `docs/backend-api-integration-audit.md`.
- Future approved changes must stabilize or extend the existing closeout workflow only, stay compact and colocated, keep invoice/PDF/payment/payout/billing automation blocked unless separately approved, and keep customer/driver privacy boundaries intact.
- This lock adds `scripts/test-admin-completed-trip-closeout-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Closeout To Billing Preparation Existing Workflow Lock

- The existing admin-only Closeout to Billing Preparation workflow is locked by `docs/admin-closeout-billing-preparation-existing-workflow-lock.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Do not add a duplicate Closeout to Billing Preparation, Billing Preparation Exception, or Billing Preparation Summary / Ready Review UI sector, button, card, route, helper, or shim.
- Existing surfaces are `data-admin-closeout-to-billing-preparation-review`, `data-admin-billing-preparation-exception-review`, and `data-admin-billing-preparation-summary-ready-review` in `app/page.tsx`.
- Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, and `scripts/test-mobile-usability-browser.mjs`.
- Future approved changes must stabilize or extend the existing billing-preparation workflow only, stay compact and colocated, keep invoice/PDF/payment/payout/billing automation blocked unless separately approved, and keep customer/driver privacy boundaries intact.
- This lock adds `scripts/test-admin-closeout-billing-preparation-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Closeout To Billing Preparation Sequencing Guard Lock

- Closeout to billing preparation sequencing is now docs/test guard-locked through existing derived readiness state.
- Completed Trip Closeout ready locally feeds Closeout to Billing Preparation closeout readiness.
- Closeout to Billing Preparation review feeds Billing Preparation Exception Review checks for missing account, incomplete trip/service details, pending extra charges, and billing note/action readiness.
- Billing Preparation Summary / Ready Review requires closeout readiness, account readiness, trip/service details, extra charges review, and cleared billing-prep exceptions before it can become ready for monthly billing review.
- Monthly Billing Queue readiness consumes the Billing Preparation Summary ready state as local queue evidence only.
- Existing admin surfaces are reused: `data-admin-completed-trip-closeout-review`, `data-admin-closeout-to-billing-preparation-review`, `data-admin-billing-preparation-exception-review`, `data-admin-billing-preparation-summary-ready-review`, and `data-admin-monthly-billing-queue-readiness-review`; no duplicate UI sector/button/card/route/helper/shim is added.
- This lock does not approve invoice creation, PDF generation, payment links, payment collection, payout automation, billing automation, accounting posts, provider sends, DB writes, endpoint migration, Save Booking changes, `/api/admin-saved-bookings` changes, parser changes, auth/location/photo/calendar activation, customer messages, driver notifications, UI sectors/buttons/cards, or new shims.
- This lock adds `scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Monthly Billing Queue Existing Workflow Lock

- The existing admin-only Monthly Billing Queue Readiness and Exception workflow is locked by `docs/admin-monthly-billing-queue-existing-workflow-lock.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, month grouping activation, or new shims.
- Do not add a duplicate Monthly Billing Queue Readiness or Monthly Billing Queue Exception UI sector, button, card, route, helper, or shim.
- Existing surfaces are `data-admin-monthly-billing-queue-readiness-review` and `data-admin-monthly-billing-queue-exception-review` in `app/page.tsx`.
- Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, and `scripts/test-mobile-usability-browser.mjs`.
- Existing closeout-to-billing preparation sequencing feeds Monthly Billing Queue readiness locally and is guard-locked by `scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs`.
- Future approved changes must stabilize or extend the existing monthly billing queue workflow only, stay compact and colocated, keep invoice/PDF/payment/payout/billing automation and month grouping writes blocked unless separately approved, and keep customer/driver privacy boundaries intact.
- This lock adds `scripts/test-admin-monthly-billing-queue-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Monthly Billing Month Grouping Existing Workflow Lock

- The existing admin-only Monthly Billing Month Grouping workflow is locked by `docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md`.
- This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes beyond existing approved admin API routes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing automation, invoice creation, PDF generation or sending, payment/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Do not add a duplicate Monthly Billing Month Grouping, billing readiness audit, monthly billing draft plan, monthly invoice draft-prep, invoice item review, billable price review, issue review, issue record, invoice-number reservation, or PDF-readiness UI sector, button, card, route, helper, or shim.
- Existing surfaces are `data-admin-monthly-billing-month-grouping-review`, `data-admin-monthly-billing-month-grouping-read-controls`, `data-admin-completed-booking-billing-readiness-audit-action`, `data-admin-monthly-billing-draft-plan-save-action`, and the existing monthly invoice draft/review action controls in `app/page.tsx`.
- Existing guarded read path is `GET /api/admin-monthly-billing-groups`, backed by `lib/admin-monthly-billing-grouping-read.ts`.
- Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, and the dedicated monthly billing/invoice API contract tests.
- Future approved changes must stabilize or extend the existing monthly billing month grouping workflow only, stay compact and colocated, keep invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, and driver notifications blocked unless separately approved, and keep customer/driver privacy boundaries intact.
- This lock adds `scripts/test-admin-monthly-billing-month-grouping-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Monthly Billing Queue To Month Grouping Sequencing Guard Lock

- Monthly Billing Queue to Month Grouping sequencing is now docs/test guard-locked through existing derived readiness state.
- Monthly Billing Queue ready state feeds Month Grouping local fallback counts only when no saved monthly billing group is loaded.
- Month Grouping can mark grouped locally only when the existing Monthly Billing Queue is ready locally or a saved admin group is ready.
- Blocked queue trips and blocked saved trips remain blockers for Month Grouping readiness.
- Existing admin surfaces are reused: `data-admin-monthly-billing-queue-readiness-review`, `data-admin-monthly-billing-queue-exception-review`, `data-admin-monthly-billing-month-grouping-review`, `data-admin-monthly-billing-month-grouping-read-controls`, `data-admin-completed-booking-billing-readiness-audit-action`, and `data-admin-monthly-billing-draft-plan-save-action`; no duplicate UI sector/button/card/route/helper/shim is added.
- This lock does not approve invoice creation, PDF generation/sending, payment links, payment collection, payout automation, billing automation, accounting posts, provider sends, DB writes, endpoint migration, Save Booking changes, `/api/admin-saved-bookings` changes, parser changes, auth/location/photo/calendar activation, customer messages, driver notifications, UI sectors/buttons/cards, or new shims.
- This lock adds `scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Monthly Billing Draft And Invoice Review Sequencing Guard Lock

- Monthly Billing Month Grouping to Draft Plan / Invoice Review sequencing is now docs/test guard-locked through existing derived readiness state.
- Saved monthly billing grouping gates the existing draft-plan and invoice draft-prep actions.
- Saved invoice draft, item review, approved billable price review, issue review, issue record, invoice-number reservation, and PDF-review readiness stay ordered through the existing action controls.
- Existing admin surfaces are reused: `data-admin-monthly-billing-month-grouping-review`, `data-admin-monthly-billing-draft-plan-save-action`, `data-admin-monthly-invoice-draft-save-action`, `data-admin-monthly-invoice-draft-item-review-save-action`, `data-admin-monthly-invoice-billable-price-review-save-action`, `data-admin-monthly-invoice-issue-review-save-action`, `data-admin-monthly-invoice-issue-record-save-action`, `data-admin-monthly-invoice-number-reservation-action`, and `data-admin-monthly-invoice-pdf-readiness-action`; no duplicate UI sector/button/card/route/helper/shim is added.
- Existing guarded admin routes are reused: `/api/admin-monthly-billing-draft-plans`, `/api/admin-monthly-invoice-drafts`, `/api/admin-monthly-invoice-draft-item-reviews`, `/api/admin-monthly-invoice-billable-item-price-reviews`, `/api/admin-monthly-invoice-issue-reviews`, `/api/admin-monthly-invoice-issue-records`, `/api/admin-monthly-invoice-number-reservations`, and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- This lock does not approve invoice creation, PDF generation/sending, payment links, payment collection, payout automation, billing automation, accounting posts, provider sends, DB writes, endpoint migration, Save Booking changes, `/api/admin-saved-bookings` changes, parser changes, auth/location/photo/calendar activation, customer messages, driver notifications, UI sectors/buttons/cards, or new shims.
- This lock adds `scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Admin Route Flow Lock

- Current route-flow map is locked by `scripts/test-admin-route-flow-lock.mjs`.
- Save Booking + CRM uses `POST /api/admin-bookings` with `x-prestige-admin-purpose=admin-booking-persistence`.
- Save Booking + CRM does not POST to `/api/admin-saved-bookings`.
- Load Bookings legacy read remains separate at `GET /api/admin-saved-bookings`.
- Disabled typed admin booking read/list/detail contract setup exists at `GET /api/admin-booking-read-contract-disabled-setup`; Load Bookings runtime wiring is not active.
- Save Booking + CRM and Update Applied Snapshot auto-sync the saved booking one-way to Google Calendar through the guarded Google sync route; Prestige remains the source of truth.
- Create Calendar Event remains the manual ICS/calendar file export path.
- Driver assignment display uses `GET /api/admin-driver-assignment-display`.
- Driver Database display/search uses typed display-only state.
- Full driver profile save/delete remains parked on the legacy `drivers` shim path.
- Remaining legacy shim families are only `companies`, `travelers`, `drivers`, and `rate_settings`.
- Driver job link creation uses `/api/admin-driver-job-links` and creates `/driver-job/{token}`.
- Customer driver-details send buttons remain disabled/setup-only.
- Provider/live sending, payment/PDF/payout, auth, location, photo, calendar activation, and risky shim writes remain blocked.
- Expected 503 gated families remain documented: admin booking persistence when `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` is closed or Supabase config is missing; legacy admin data when Supabase config is missing; driver job production mode when neither the driver-job production gate nor the server-side admin booking persistence/Supabase config is available; customer booking intake when persistence is not enabled/configured; monthly billing/invoice/closeout/notification persistence when server gates are closed.
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
- No `/api/admin-saved-bookings` route endpoint swap is approved; the read helper may use the approved schema fallback only.
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
- No `/api/admin-saved-bookings` route endpoint swap is approved; the read helper may use the approved schema fallback only.
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
- No `/api/admin-saved-bookings` route endpoint swap is approved; the read helper may use the approved schema fallback only.
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
- No `/api/admin-saved-bookings` route endpoint swap is approved; the read helper may use the approved schema fallback only.
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

### Load Bookings Primary List Source Boundary Guard Lock
- Load Bookings primary-list-source boundary was guarded before bounded runtime implementation.
- This guard did not approve runtime implementation by itself; runtime work still requires owner approval and remains bounded to list/display source only.
- For the bounded runtime lane, `runtime read wiring` means typed read safe operational data may become the primary list/display source only.
- `runtime read wiring` does not mean opening the DB-read gate, changing env, activating live DB reads, migrating detail/form fallback, or replacing legacy action/form source.
- Existing `GET /api/admin-load-bookings-typed-read` must be reused for typed safe operational list/display data.
- Existing `GET /api/admin-saved-bookings` must remain the booking/form/detail fallback source unless a separate owner-approved detail/form migration guard is added later.
- `loadSelectedBooking` and `bookingRecordToForm` must continue to consume legacy `BookingRecord` records, not typed `safe_card` or `safe_dto` output.
- Typed safe-card data must not feed Save Booking + CRM, `bookingRecordToForm`, driver dispatch payout copy, driver assignment payout controls, billing readiness, pricing, payout, payment/PDF, provider send, parser, auth/location/photo/calendar, or internal/admin/debug fields.
- Typed read failure, closed gate, blocked admin boundary, or malformed response must fall back safely without replacing the legacy booking/form source.
- No duplicate Load Bookings UI sector/button/card/route/helper/shim is approved.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- This lock adds `scripts/test-load-bookings-primary-list-source-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Load Bookings Primary List Source Runtime Implementation Lock
- Owner-approved bounded runtime implementation for Load Bookings primary list/display source is recorded.
- `GET /api/admin-load-bookings-typed-read` safe operational cards and ordered IDs are now the primary display/list ordering source when present.
- Legacy `GET /api/admin-saved-bookings` remains the `BookingRecord` fallback for booking/form/detail/actions.
- Typed safe cards mark display items with `primaryListSource: "typed-read"` only; they do not feed `bookingRecordToForm`, `loadSelectedBooking`, Save Booking + CRM, pricing, payout, payment/PDF, provider send, parser, auth/location/photo/calendar, or internal/admin/debug fields.
- Typed-card IDs without a matching legacy `BookingRecord` are not made actionable by this implementation.
- Typed read failure, closed gate, blocked admin boundary, malformed response, or missing typed data falls back safely to legacy display ordering without replacing the legacy booking/form source.
- No duplicate Load Bookings UI sector/button/card/route/helper/shim was added.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, deployment, DB read/write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, unrelated UI sector/button/card addition, or new shim is included.

### Staging No-Click Smoke for Load Bookings Typed Primary Display Source
- At smoke time, `origin/staging` pointed to `a682e974cf977a15602b13e3e7d8d1f1f4c99a30` (`a682e97 Implement Load Bookings typed primary display source`), verified directly with `git ls-remote`.
- After the docs-only smoke record was committed and pushed, `origin/staging` points to `47980662d5bebfcc2dadd151055604ab19026a8f` (`4798066 Record staging smoke for Load Bookings typed display`), while the staging-smoked app checkpoint remains `a682e97 Implement Load Bookings typed primary display source`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Passive no-click Chrome/CDP staging smoke rendered the main admin UI with document title `Prestige Limo Ops`.
- Expected tabs rendered: `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- The default active tab remained Dispatch; the Bookings tab was present but was not clicked, so inactive Bookings tab body text was not required by this no-click smoke.
- Save Booking + CRM was visible but was not clicked.
- No forms were submitted.
- Screenshot captured: false.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Browser request audit observed 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 POST/write/send requests, 0 non-200 responses, 0 missing responses, and 0 unexpected failed requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- The Load Bookings typed primary display source boundary remains: typed safe operational cards and ordering are display/list-only, while legacy `GET /api/admin-saved-bookings` remains the `BookingRecord` booking/form/detail/action fallback.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, manual deploy, DB read/write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

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
- Driver job methods must stay limited to safe job `GET`, safe token-scoped driver-details `PATCH`, status `PATCH`, notification `GET`/`PATCH`, issue-alert `POST`, setup-only flight ETA `GET`, setup-only acknowledgement `GET`, and blocked driver bidding `GET`/`POST`/`PATCH`.
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
- Public customer/driver API runtime gate and dependency boundaries are guarded across customer booking request, customer portal session issue, customer saved bookings, customer booking memory, customer booking status, customer app notifications, customer-driver quick replies, driver job, driver job status, driver notifications, driver quick replies, driver issue-alert, driver flight ETA setup, driver flight ETA acknowledgement setup, and driver bidding routes.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Public API route files must not directly read env, create Supabase clients, import Supabase, or execute direct database query/write methods; runtime dependencies must stay mediated through existing helpers and gates.
- Customer portal session issue must remain default-off and token/purpose/origin/referer gated before issuing a secure cookie.
- Customer saved-bookings, booking-memory, and booking-status reads must remain auth-gated by explicit env-name gates, same-origin/purpose checks, server session token or allowed cookie boundaries, and mocked contract tests.
- Driver job production mode must remain mock by default and production reads/status writes must remain blocked unless the driver-job production gate is explicitly true or the same server-side admin booking persistence/Supabase config that creates real driver links is available.
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
- Public Company Profile reads and customer portal invoice/PDF reads now live in dedicated customer-safe adapters, so `/book` and `/my-bookings` pages do not own raw fetch calls.
- Customer client adapters must use `cache: "no-store"`, `credentials: "same-origin"`, and purpose headers while never manually attaching Cookie, Authorization, customer session-token, admin purpose, or server env-token plumbing.
- `/driver-job/[token]` must keep driver API calls no-store and limited to safe job GET, token-scoped driver-details PATCH, notification GET, issue-alert POST with `issue_type`, and status PATCH with `status` only.
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

### Customer Voice Booking Draft Input Contract Lock
- This is the bounded contract for the approved compact Customer Voice Booking Draft Input helper; it does not approve parser changes, `/api/ai-parse` changes, Save Booking changes, `/api/admin-saved-bookings` changes, new customer booking routes, audio recording/storage, speech-to-text provider integration, provider sends, env changes, DB read/write, production deploy, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, UI sector/button/card additions, or new shims.
- Customer voice booking is input-helper-only and must stay compact and colocated inside the existing `/book` customer booking page/form.
- The approved Speak control is one compact `type="button"` beside the existing `/book` Portal link in the header action group.
- No new sector, giant card, duplicate booking page, duplicate booking workflow, duplicate route/helper/shim, or customer booking surface is approved by this lock.
- Voice transcript may only fill the bounded local draft transcript helper or existing safe customer booking request fields if a future parser/draft-fill lane is separately approved.
- Customer must review/edit and manually press BOOK / Submit Booking Request.
- Admin review remains required after customer submission.
- Speaking alone must not create a booking, auto-submit, auto-confirm, auto-dispatch, trigger Dispatch Release, or trigger Driver Acknowledgement.
- No audio storage, customer/traveler memory write, speech-to-text provider integration, provider send, env change, DB read/write, parser change, `/api/ai-parse` exposure, Save Booking change, `/api/admin-saved-bookings` change, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, or new shim is approved.
- Transcript stays in local component state only and is not submitted.
- Browser `SpeechRecognition` or browser-only dictation must include an unsupported-browser fallback and must not require backend audio storage.
- Parser/draft-fill from voice requires separate owner approval unless a future guard proves a safe customer draft parser path.
- Existing `/book` submit path stays `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- Customer booking requests continue to map to customer-facing `Request Received` and internal admin `Admin Review Required` review state.
- Existing WhatsApp transcript parsing and admin dispatcher intake parser/draft-fill are not Customer Voice Booking Draft Input and must not be treated as already-approved customer voice behavior.
- `/api/ai-parse` cannot be exposed or reused for customer voice without separate owner approval.
- This lock is guarded by `docs/customer-voice-booking-draft-input-contract.md`, `scripts/test-customer-voice-booking-draft-input-contract.mjs`, `scripts/test-customer-voice-booking-speak-button-ui-guard.mjs`, and `scripts/test-preactivation-verification-suite.mjs`.

### Customer Voice Booking Draft Field-Fill Contract Lock
- This is a docs/test-only lock for a future Customer Voice Booking Draft Field-Fill lane; it does not approve field-fill implementation, parser changes, `/api/ai-parse` usage, UI changes, new buttons, submit behavior changes, Save Booking changes, `/api/admin-saved-bookings` changes, new customer booking routes, audio storage, backend speech-to-text/provider integration, provider sends, env changes, DB read/write, production deploy, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, or new shims.
- Customer Voice Booking Draft Field-Fill is separate from the existing compact Speak button lane.
- The existing compact Speak button remains input-helper-only until field-fill is separately approved.
- Current Speak behavior remains compact local transcript helper only: transcript is local React state, does not fill form fields, does not submit transcript/audio, and does not call parser/API/STT/provider routes.
- Future field-fill must never auto-submit, auto-confirm, auto-dispatch, trigger Dispatch Release, or trigger Driver Acknowledgement.
- Customer must manually review/edit fields and manually press Submit Booking Request / BOOK.
- Admin review remains required after submission.
- Existing `/book` submit path remains `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- Future field-fill may target only existing submitted customer request fields: `companyName`, `contactNo`, `emailAddress`, `passengerName`, `pickupDate`, `pickupTime`, `flightNumber`, `pickupLocation`, `dropoffLocation`, `serviceType`, `vehicleType`, `passengerCount`, `luggage`, and `extraStops`.
- `specialRequest` exists in `/book` UI state but is not forwarded by the adapter, is not allowed in customer booking request persistence, and remains local-only and excluded from submitted field-fill scope until separately approved.
- Transcript/audio must not be submitted or stored unless separately approved.
- `/api/ai-parse` cannot be used for customer voice field-fill without separate owner approval.
- Admin parser/draft-fill cannot be reused directly for public customer voice.
- Existing `/api/ai-parse` remains admin/parser-shaped and includes `customerPriceOverride`; existing WhatsApp transcript parsing and admin dispatcher intake draft-fill are not Customer Voice Booking Draft Field-Fill.
- If parsing is uncertain, leave fields unchanged and show the transcript for manual review; do not guess unsafe fields.
- Future field-fill must exclude pricing, payout, payment/PDF, billing, dispatch release, driver acknowledgement, admin internal status, provider send fields, auth/location/photo/calendar, `customer_rates`, `driver_payout_rules`, internal/debug/secrets, transcript/audio persistence, and `specialRequest` submission unless separately approved.
- Future implementation must include browser/mobile coverage proving Speak remains `type="button"`, field-fill does not submit, manual Submit Booking Request / BOOK remains required, customer review/edit remains required, mobile layout does not overflow, Portal remains unchanged, and the submit path remains `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- No duplicate booking page, workflow, sector, card, route, helper, button, or shim is approved.
- Example future phrase: "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road."
- Safe future mapping example after separate implementation approval: `passengerName` Stanley, `pickupDate` 2 June, `pickupTime` 1000, `pickupLocation` 123 Orchard Road, `dropoffLocation` airport, and `flightNumber` SQ123.
- This lock is guarded by `docs/customer-voice-booking-draft-field-fill-contract.md`, `scripts/test-customer-voice-booking-draft-field-fill-contract.mjs`, and `scripts/test-preactivation-verification-suite.mjs`.

### Staging Safe GET for Customer Voice Booking Draft Field-Fill Contract Guard
- `origin/staging` was promoted from `92b7976aea812cb47721114dd40c1a4ff3e513b2` to `046102707b95408c25fc9dc50fc26231247e9a76`.
- Staging includes `0461027 Guard customer voice draft field fill`.
- `git ls-remote --heads origin staging` confirmed `046102707b95408c25fc9dc50fc26231247e9a76` after push.
- A non-fatal local tracking-ref warning prevented updating local `refs/remotes/origin/staging` during push, so direct `git ls-remote` is the remote hash source of truth.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Safe GET response included `Save Booking`, but it was not clicked.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- Field-fill was not implemented.
- Parser behavior was not changed.
- `/api/ai-parse` was not used or changed.
- The existing compact Speak helper remains input-helper-only.
- Future Customer Voice Booking Draft Field-Fill implementation still requires separate explicit owner approval.
- The staged commit remains docs/test-only guard work and does not approve UI/runtime/parser/API/env/DB/provider/audio storage/Save Booking/`/api/admin-saved-bookings`/payment/pricing/payout/PDF/dispatch/auth/location/photo/calendar/shim changes.

### Customer Voice Booking Draft Field-Fill Local Helper Implementation Lock
- This is the bounded owner-approved Customer Voice Booking Draft Field-Fill implementation for the existing `/book` customer booking page/form only.
- The existing compact Speak button remains the only Speak control, remains `type="button"`, and remains beside the existing Portal link in the same `/book` header action group.
- No new booking page, customer workflow, UI sector, card, route, helper button, backend route, or shim is introduced.
- The Speak transcript remains browser-local React state/ref only; no transcript or audio is submitted, stored, recorded, sent to a provider, or written to DB.
- Local field-fill runs only from the existing browser `SpeechRecognition` transcript after local capture ends.
- Field-fill only fills empty approved fields and does not overwrite customer-entered values.
- Approved local field-fill targets are `passengerName`, `pickupDate`, `pickupTime`, `flightNumber`, `pickupLocation`, and `dropoffLocation`.
- The broader customer request submit allowlist remains `companyName`, `contactNo`, `emailAddress`, `passengerName`, `pickupDate`, `pickupTime`, `flightNumber`, `pickupLocation`, `dropoffLocation`, `serviceType`, `vehicleType`, `passengerCount`, `luggage`, and `extraStops`.
- `specialRequest` remains local-only/excluded from submitted field-fill scope and remains excluded from customer booking request persistence.
- Date field-fill is conservative: explicit year dates may fill `pickupDate`; no-year phrases such as `2 June` remain unchanged for manual review.
- Example local mapping: "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road." may fill `passengerName` Stanley, `pickupTime` 10:00, `pickupLocation` 123 Orchard Road, `dropoffLocation` airport, and `flightNumber` SQ123, while leaving `pickupDate` unchanged because no year is present.
- Customer must manually review/edit fields and manually press Submit Booking Request / BOOK.
- Existing `/book` submit path remains `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- Admin review remains required after submission; speaking alone and field-fill alone do not create, confirm, dispatch, or release a booking.
- No parser changes, `/api/ai-parse` usage, admin parser reuse, Save Booking changes, `/api/admin-saved-bookings` changes, provider sends, env changes, DB read/write, production deploy, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, audio storage, backend speech-to-text, or new shims are approved.
- This implementation is guarded by `docs/customer-voice-booking-draft-field-fill-contract.md`, `scripts/test-customer-voice-booking-draft-field-fill-contract.mjs`, `scripts/test-customer-voice-booking-draft-field-fill-ui-guard.mjs`, `scripts/test-customer-voice-booking-speak-button-ui-guard.mjs`, and `scripts/test-preactivation-verification-suite.mjs`.

### Staging Smoke for Customer Voice Booking Draft Field-Fill Helper
- `origin/staging` points to `36b5fac46a1e38f33509fa0dff3fb2d75e96ca25` (`36b5fac Add customer voice draft field fill helper`), verified directly with `git ls-remote`.
- Remote staging before promotion was `20e3503ee2200e1482ceab1113e14bcf55575cf1`.
- The push to `origin/staging` succeeded; local remote-tracking ref update reported a non-fatal lock warning, so direct `git ls-remote` is the remote source of truth.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/book` returned HTTP 200 by safe GET.
- Passive no-click Chrome/CDP staging smoke rendered document title `Prestige Limo Ops`.
- Expected admin tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- `/book` rendered the existing customer booking page and form.
- `/book` rendered the existing Portal link pointing to `/my-bookings`.
- `/book` rendered exactly one compact Speak button.
- The Speak button rendered as `type="button"` with visible text `Speak`.
- Speak was not clicked during smoke.
- No microphone permission prompt was triggered.
- Submit Booking Request / BOOK was not clicked.
- Save Booking was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Browser request audit observed 54 staging requests, all GET-only.
- Browser request audit observed 54 staging GET responses, 0 non-GET requests, 0 POST/write/send requests, 0 non-200 responses, and 0 missing responses.
- Browser request audit observed one browser-canceled GET-only load event (`net::ERR_ABORTED`, canceled true); it was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- A first local Chrome/CDP launch attempt aborted before DevTools became ready; the direct passive Chrome/CDP rerun passed and did not require any app/runtime changes.
- Field-fill remains local-only browser transcript state/ref behavior, fills only empty approved fields, keeps manual customer review required, and keeps existing manual submit semantics.
- No parser, `/api/ai-parse`, backend STT, provider, DB, route, Save Booking, `/api/admin-saved-bookings`, billing/payment, pricing, payout, PDF, dispatch, auth/location/photo/calendar, or shim wiring was added.

### Staging Deploy Smoke for Customer Voice Booking Speak Helper

- `origin/staging` points to `888d957344d01a1218b727131b8872af18bf8f19` (`888d957 Add customer voice booking speak helper`), verified directly with `git ls-remote`.
- Remote staging before promotion was `20a64cdd2f6f7dd347585c27b8dba0939cfd06b2`.
- The push to `origin/staging` succeeded; local remote-tracking ref update was blocked by the sandbox lock-file permission, so direct `git ls-remote` is the remote source of truth.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/book` returned HTTP 200 by safe GET and included the Speak helper and Portal link markers.
- Passive no-click Chrome/CDP staging smoke rendered the main admin UI with title `Prestige Limo Ops`.
- Expected tabs rendered: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Save Booking + CRM was visible but was not clicked.
- `/book` rendered the existing customer booking page and form.
- `/book` rendered exactly one compact Speak button beside the existing Portal link in the same header action group.
- The Speak button rendered as `type="button"` with visible text `Speak`; observed button size was 71px by 42px.
- Speak helper remains input-helper-only.
- Speak was not clicked during smoke.
- No microphone permission prompt was triggered.
- Portal link remained present, unchanged, and pointed to `/my-bookings`.
- Customer still manually submits the booking through the existing Submit Booking Request / BOOK flow.
- Submit Booking Request / BOOK was not clicked.
- No forms were submitted.
- No transcript or audio was submitted or stored.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Browser request audit observed 54 GET requests, 54 staging GET responses, 0 non-GET requests, 0 POST/write/send requests, 0 non-200 responses, and 0 missing responses.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- A first local Chrome/CDP launch attempt failed because the sandbox blocked Chrome Crashpad settings access; the unsandboxed passive rerun passed and did not require any app/runtime changes.
- No parser, `/api/ai-parse`, backend STT, provider, DB, route, Save Booking, `/api/admin-saved-bookings`, billing/payment, pricing, payout, PDF, dispatch, auth/location/photo/calendar, or shim wiring was added.
- Billing/payment is not touched or wired by this customer voice helper.

### Staging Safe GET for Customer Voice Booking Draft Input Contract Guard

- `origin/staging` was promoted from `61d11d1dcbb929f23ccfb5a9260b4ab05e7a21f8` to `4adb2ed6d69560ff0e3401ca270f0231b6a071f4`.
- Staging includes `4adb2ed Guard customer voice booking draft input`.
- `git ls-remote --heads origin staging` confirmed `4adb2ed6d69560ff0e3401ca270f0231b6a071f4` after push.
- A non-fatal local tracking-ref warning prevented updating local `refs/remotes/origin/staging` during push, so the remote hash source of truth for this record is `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Safe GET response included `Save Booking + CRM`, but it was not clicked.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- Speak button was not implemented.
- Voice booking remains contract-only.
- Future Customer Voice Booking Draft Input implementation still requires separate explicit owner approval.
- The staged commit remains docs/test-only guard work and does not approve UI implementation, runtime implementation, parser changes, `/api/ai-parse` changes, Save Booking route changes, `/api/admin-saved-bookings` changes, new customer booking routes, audio recording/storage, speech-to-text provider integration, provider sends, env changes, DB read/write, production deploy, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, UI sector/button/card additions, or new shims.

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

### Public Driver Job Action Surface Guard Lock
- Public driver job display/action surfaces are guarded across `/driver-job/[token]`, the driver job status workflow, issue choices, and driver job action routes.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- The driver page action surface must stay limited to safe job GET, token-scoped driver-details PATCH, saved app-update GET, issue-alert POST with `issue_type`, and status PATCH with the guarded status value.
- Driver status controls must stay limited to OTW, OTS, POB, and Job Completed, coordinated with `guardDriverJobStatusTransition`.
- Driver issue choices must stay limited to operational/safety issue values and must not include finance, billing, payment, PayNow, payout, invoice, PDF, parser/debug, internal admin, or mock QA/archive issue types.
- Driver app updates and status timing must render only safe fields: `safe_title`, `safe_message`, notification metadata, and status labels/times; visible activity-log and saved-status-history panels stay hidden from the driver page.
- Driver job detail display must stay limited to date/time, service, pickup, drop-off, route, waypoints, flight, and passenger display fields.
- Pasted driver details remain local-only and filtered so bank/account/PayNow/payment/payout lines are not parsed into driver-visible details.
- The driver page must not attach manual Cookie, Authorization, admin purpose, session-token, service-role, Supabase env, local/session storage, credential, geolocation, media, file, FormData, or object URL plumbing.
- The driver page must not submit forms, create downloads, expose outbound admin links, or call notification PATCH from the public driver UI.
- This guard coordinates the driver job route action contract, driver status persistence safe input contract, public route source privacy guard, public API client caller guard, and public API request input guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-driver-job-action-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Driver Job Action Surface Guard
- `origin/staging` points to `87328b96a2b92046a7290028b71c18ebbe897093` (`87328b9 Guard public driver job action surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public driver job action surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- Driver job display/action surfaces remain guarded to safe job GET, saved app-update GET, issue-alert POST with `issue_type`, and status PATCH with the guarded status value.
- Driver status controls remain limited to OTW, OTS, POB, and Job Completed, coordinated with `guardDriverJobStatusTransition`.
- Driver issue choices remain limited to operational/safety issue values and exclude finance, billing, payment, PayNow, payout, invoice, PDF, parser/debug, internal admin, and mock QA/archive issue types.
- Driver app updates and saved status history remain limited to safe fields: `safe_title`, `safe_message`, notification metadata, status labels/times, and `safeNote`.
- Pasted driver details remain local-only and filtered so bank/account/PayNow/payment/payout lines are not parsed into driver-visible details.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

### Driver Reporting Status Contract Lock
- Driver reporting/status is defined in `docs/driver-reporting-status-contract.md` as the source-of-truth contract for the driver path from safe driver detail acknowledgement to JC.
- This is a docs/test-only contract lock; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- The driver public path remains one assigned job per secure `/driver-job/[token]` link.
- Driver input remains driver/vehicle detail confirmation followed by token-scoped Save & Acknowledge Job before status updates are accepted.
- Driver workflow status remains exactly `driver_otw -> ots -> pob -> completed`.
- Driver-facing labels remain exactly OTW -> OTS -> POB -> Job Completed.
- JC remains the terminal `completed` status; status updates after JC must be rejected.
- `guardDriverJobStatusTransition` remains the transition gate for invalid, acknowledgement-required, out-of-order, already-completed, and exact-next-step acceptance behavior.
- Driver issue reports remain enum-only and operational/safety-only: `cannot_find_passenger`, `passenger_no_show`, `passenger_late`, `flight_or_pickup_timing_changed`, `route_or_itinerary_changed`, `vehicle_issue`, `traffic_delay`, `accident_or_safety_concern`, and `other_issue`.
- Driver issue reports remain internal app/admin handling only; they do not approve Telegram, WhatsApp, SMS, email, provider, or customer sends from the public driver surface.
- Driver public link data remains limited to the safe one-job payload, token-scoped saved acknowledgement, guarded status buttons, enum-only issue alert, safe app updates, and safe status history.
- Admin/dispatcher reporting remains limited to saved driver status event summary, latest status, safe status history/timing, operational issue alert summary, source surface, and safe actor label.
- Customer public surfaces may receive only separately approved customer-safe status summaries; raw driver issue detail and internal handling states remain blocked until a future customer contract approves them.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- Future admin-only states such as no-show review, replacement needed, dispatcher review, cancellation, completed with exception, late risk, or flight ETA review must not become public driver statuses without a separate contract, privacy guard, and verification pass.
- This lock adds `scripts/test-driver-reporting-status-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No runtime implementation, UI/API behavior change, env change, deployment, DB read/write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, parser change, Save Booking change, `/api/admin-saved-bookings` change, UI sector/button/card addition, or new shim is approved by this lock.

### Admin Driver Exception Handling Contract Lock
- Admin-only driver exception handling is defined in `docs/admin-driver-exception-handling-contract.md` as the source-of-truth contract for operational driver exceptions that must not become public driver statuses.
- This is a docs/test-only contract lock; it does not approve runtime implementation, UI/API behavior change, new UI sectors, new buttons, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Public driver status remains exactly `driver_otw -> ots -> pob -> completed` with labels OTW -> OTS -> POB -> Job Completed.
- Future admin exception work, if separately approved, must stay compact and colocated with existing admin operational areas: Day-of-Trip Exception Escalation, Dispatch Recovery / Replacement Readiness, Post-Recovery Update Readiness, and Completed Trip Closeout Review.
- Existing app anchors remain the target placement: `data-admin-day-of-trip-exception-escalation`, `data-admin-dispatch-recovery-replacement-readiness`, `data-admin-post-recovery-update-readiness`, and the existing completed closeout review section.
- Driver issue reports may inform admin-only exception handling, but raw issue detail, dispatcher notes, replacement-driver review, and closeout exception notes must not become public customer or public driver states without a separate customer/driver-safe contract.
- Contract-level admin exception categories include driver no response, driver late/reminder due, cannot find passenger, passenger no-show review, passenger late review, timing/route changed, vehicle issue, replacement driver needed, replacement vehicle needed, dispatcher call needed, customer update review, completed-with-exception review, and closed after dispatcher review.
- The existing workflow-status planning areas remain the only planned persistence placement for this lane: `day_of_trip_exception`, `dispatch_recovery`, `trip_completion`, and `closeout_review`.
- Exception/recovery to closeout sequencing is guard-locked by `scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs`: Dispatch Recovery / Replacement readiness feeds Post-Recovery update readiness, Post-Recovery ready locally and closed exception review feed Day-of-Trip Completion Handoff, and Completion Handoff feeds Completed Trip Closeout Review customer closeout and exception/resolution checklist states.
- Public driver pages must keep dispatcher exception/cancel/replacement workflows absent and future/staff-controlled.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, mock QA/dev archive, dispatcher exception notes, replacement-driver review notes, or customer billing/payment/PDF readiness.
- This lock adds `scripts/test-admin-driver-exception-handling-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No new admin UI sector, UI button, runtime behavior, endpoint migration, env change, deployment, DB read/write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, parser change, Save Booking change, `/api/admin-saved-bookings` change, or new shim is approved by this lock.

### Customer Driver Status Visibility Contract Lock
- Customer driver/job progress visibility is defined in `docs/customer-driver-status-visibility-contract.md` as the source-of-truth contract for any future customer-facing driver progress summary.
- This is a docs/test-only contract lock; it does not approve runtime implementation, UI/API behavior change, new UI sectors, new buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.
- Current `/my-bookings` saved-booking display remains generic and customer-safe, limited to Requested, Pending Staff Review, Confirmed, Completed, and Cancelled status labels.
- Owner direction is locked: do not mix future driver-progress display into `/my-bookings` or the Customer Portal saved-booking list; the portal remains a generic customer booking/status list.
- Current customer saved-bookings data may use `customer_facing_status` only and must not expose `driver_otw`, `ots`, `pob`, driver status history, driver issue report type, admin exception category, replacement-driver review, dispatcher note, internal status, or driver status event rows.
- Future customer driver-progress display is not approved here; if separately approved, it must be its own customer-safe status surface or handoff and may only use customer-safe summaries such as Driver assigned, Driver on the way, Driver arrived, Trip in progress, and Completed.
- Future customer live-location alert/link direction is a separate handoff, not Customer Portal saved-booking list content; for eligible DEP, TRF, and hourly jobs, the target customer alert/link window is 30 minutes before pickup only after owner approval of customer live links.
- Arrival/MNG customer live location stays disabled unless separately approved, and customer-visible live location must auto-disable when the driver presses POB or POB is marked; any backend cleanup grace must not leave customer tracking visible after POB.
- Driver/admin source status must be projected through a customer-safe adapter before any customer display; raw driver issue values and admin-only exception categories remain blocked.
- Customer public surfaces must never show driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, mock QA/dev archive, raw driver issue reports, dispatcher exception notes, replacement-driver review notes, raw status event rows, token hashes, service-role/server-only details, live location coordinates, photo/proof storage details, billing internals, invoices, payments, PDFs, pricing internals, or payout comparisons.
- This lock coordinates the driver reporting contract, admin driver exception contract, customer portal saved-bookings adapter, customer saved-bookings read helper, and public customer portal saved-booking surface guard.
- This lock adds `scripts/test-customer-driver-status-visibility-contract.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- No runtime implementation, UI/API behavior change, UI sector, UI button, endpoint migration, env change, deployment, DB read/write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, parser change, Save Booking change, `/api/admin-saved-bookings` change, or new shim is approved by this lock.

### Public Customer Portal Session Issue Surface Guard Lock
- Public customer portal session issue surfaces are guarded across `/api/customer-portal-sessions`, `lib/customer-portal-session-issue.ts`, `/my-bookings`, and the customer portal saved-bookings adapter.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.
- The customer portal session issue helper must remain server-only, default-off, same-origin `/my-bookings` referer gated, purpose-header gated, server-token gated, and cookie-name fail-closed.
- Only `POST /api/customer-portal-sessions` may issue a cookie, and successful or blocked responses must stay `Cache-Control: no-store`.
- Successful session issue responses must expose only `{ ok: true, version }` in the body; the session token remains only in the HttpOnly Secure SameSite=Lax Priority=High cookie.
- GET, PUT, PATCH, and DELETE on `/api/customer-portal-sessions` must stay blocked and must not issue cookies.
- `/my-bookings` and the customer portal saved-bookings adapter must not call or expose `/api/customer-portal-sessions`, the session issue token header, customer session-token plumbing, Cookie, Authorization, or server env names.
- The customer portal saved-bookings adapter must keep using only `/api/customer-saved-bookings?limit=25&page=1` with `cache: "no-store"`, `credentials: "same-origin"`, and the customer saved-bookings purpose header.
- The session issue source must not touch Supabase, DB write/query clients, RPC, provider sends, admin saved-bookings, parser, payment/PDF/pricing/payout/auth activation, location/photo/calendar, or new shims.
- This guard coordinates the customer portal session issue API contract, public API session cookie/cache guard, customer saved-bookings auth handoff readiness, public API request input guard, and public API client caller guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-portal-session-issue-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer Portal Session Issue Surface Guard
- `origin/staging` points to `66b6c8507865f52b39d924cde6448bb514fb86aa` (`66b6c85 Guard public customer portal session issue surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, GCM `PHONE_REGISTRATION_ERROR`, TensorFlow Lite delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer portal session issue surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- Customer portal session issue surfaces remain guarded as server-only, default-off, same-origin `/my-bookings` referer gated, purpose-header gated, server-token gated, and cookie-name fail-closed.
- Only `POST /api/customer-portal-sessions` may issue a cookie, and successful or blocked responses remain `Cache-Control: no-store`.
- Successful session issue responses expose only `{ ok: true, version }` in the body; the session token remains only in the HttpOnly Secure SameSite=Lax Priority=High cookie.
- `/my-bookings` and the customer portal saved-bookings adapter do not call or expose `/api/customer-portal-sessions`, the session issue token header, customer session-token plumbing, Cookie, Authorization, or server env names.
- The customer portal saved-bookings adapter remains limited to `/api/customer-saved-bookings?limit=25&page=1` with `cache: "no-store"`, `credentials: "same-origin"`, and the customer saved-bookings purpose header.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, or new shim was included.

### Public Customer Booking Memory Surface Guard Lock
- Public customer booking memory suggestion surfaces are guarded across `/book`, `lib/customer-booking-memory-adapter.ts`, `lib/customer-booking-memory-form.ts`, `lib/customer-booking-memory-read.ts`, and `/api/customer-booking-memory`.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.
- `/book` booking memory must remain a quiet passenger datalist suggestion read only; it must not submit forms, show extra customer-facing memory instructions, expose auth failures, or overwrite customer date/time choices.
- The customer booking memory adapter must keep using only `GET /api/customer-booking-memory?limit=10` with optional safe `q`, `cache: "no-store"`, `credentials: "same-origin"`, and the customer booking-memory purpose header without manual Cookie, Authorization, customer session-token, admin headers, or browser credential storage.
- The customer booking memory route must keep GET read handling only, with POST, PUT, PATCH, and DELETE blocked by the auth-required result.
- The server reader must remain server-only, same-origin `/book` referer gated, purpose-header gated, server-session-token/server-validated cookie gated, default-off, and limited to `limit` and `q` query params.
- Customer booking memory API and adapter output must stay limited to passenger name, pickup/drop-off, service, vehicle, and last-used metadata and must exclude customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.
- This guard coordinates the customer booking memory UI contract, customer booking memory API contract, public API request input guard, public API response privacy guard, public API session cookie/cache guard, and public API client caller guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-booking-memory-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer Booking Memory Surface Guard
- `origin/staging` points to `c7b8e39257c13983b28033f19d89ef599f276635` (`c7b8e39 Guard public customer booking memory surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, and TensorFlow Lite XNNPACK delegate creation; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer booking memory surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/book` booking memory remains guarded as a quiet passenger datalist suggestion read only, without customer-facing memory instructions, auth-failure text, form submission, or customer date/time overwrites.
- The customer booking memory adapter remains limited to `GET /api/customer-booking-memory?limit=10` with optional safe `q`, `cache: "no-store"`, `credentials: "same-origin"`, and the customer booking-memory purpose header without manual Cookie, Authorization, customer session-token, admin headers, or browser credential storage.
- The customer booking memory route remains GET read-only, with POST, PUT, PATCH, and DELETE blocked by the auth-required result.
- The server reader remains server-only, same-origin `/book` referer gated, purpose-header gated, server-session-token/server-validated cookie gated, default-off, and limited to `limit` and `q` query params.
- Customer booking memory API and adapter output remains limited to passenger name, pickup/drop-off, service, vehicle, and last-used metadata and excludes customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, or new shim was included.

### Public Customer Booking Status Surface Guard Lock
- Public customer booking status lookup surfaces are guarded across `/api/customer-booking-statuses`, `lib/customer-booking-status-read.ts`, `/my-bookings`, and public customer client code.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.
- The customer booking status route must keep GET read handling only, with POST and PATCH blocked by the auth-required result and no PUT, DELETE, HEAD, OPTIONS, TRACE, or CONNECT exports.
- The status reader must remain server-only, default-off, same-origin `/my-bookings` referer gated, purpose-header gated, explicit server session-token gated, cookie-free, and limited to `booking_reference`, `limit`, and `page` query params.
- `/book`, `/my-bookings`, and the customer portal saved-bookings adapter must not call `/api/customer-booking-statuses` or expose the status purpose header, status session-token header, booking-status env names, Cookie, Authorization, or browser credential storage.
- Customer booking status API output must stay limited to safe customer-facing status, review status, booking reference, pickup/drop-off, passenger, service, created, and updated metadata and must exclude customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.
- This guard coordinates the customer booking status API contract, public API method surface guard, public API request input guard, public API response privacy guard, public API session cookie/cache guard, and public API runtime gate guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-booking-status-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer Booking Status Surface Guard
- `origin/staging` points to `6f79f19e948f29fa39681523bcf006ba25eba031` (`6f79f19 Guard public customer booking status surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 0.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, GCM `PHONE_REGISTRATION_ERROR`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer booking status surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- Customer booking status lookup remains guarded as GET read handling only, with POST and PATCH blocked by the auth-required result and no PUT, DELETE, HEAD, OPTIONS, TRACE, or CONNECT exports.
- The status reader remains server-only, default-off, same-origin `/my-bookings` referer gated, purpose-header gated, explicit server session-token gated, cookie-free, and limited to `booking_reference`, `limit`, and `page` query params.
- `/book`, `/my-bookings`, and the customer portal saved-bookings adapter do not call `/api/customer-booking-statuses` or expose the status purpose header, status session-token header, booking-status env names, Cookie, Authorization, or browser credential storage.
- Customer booking status API output remains limited to safe customer-facing status, review status, booking reference, pickup/drop-off, passenger, service, created, and updated metadata and excludes customer price, driver payout, PayNow payout, billing, invoice/payment/PDF, internal finance/admin notes, parser/debug, secrets/tokens, provider/send, notification payloads, live location/photo, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, or new shim was included.

### Public Driver Bidding Surface Guard Lock
- Public driver bidding surfaces are guarded across `/api/driver-job-bids`, `/api/admin-driver-job-bid-offers`, `lib/driver-portal-bidding-persistence.ts`, and public driver pages.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.
- `/api/driver-job-bids` must remain blocked for GET, POST, and PATCH by `driverBidRuntimeAccessBlocked` until approved driver auth exists; it must not parse request bodies, read env, create Supabase clients, or execute DB reads/writes.
- Public driver pages must not call `/api/driver-job-bids` or `/api/admin-driver-job-bid-offers`, expose bid offer IDs, driver references, admin purpose/session-token headers, Cookie, Authorization, browser credential storage, or service-role/Supabase env names.
- `/api/admin-driver-job-bid-offers` must keep GET, POST, and PATCH behind the internal admin/dispatcher boundary and safe failure response, with reads, saves, and status updates mediated by `lib/driver-portal-bidding-persistence.ts`.
- Driver bidding persistence safe shapes must stay limited to booking reference, offer/bid statuses, pickup time, safe pickup/drop-off areas, safe vehicle/trip/context fields, driver reference, safe driver label/bid note/context, status timestamps, and actor/source metadata.
- Driver bidding surfaces must exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Driver bidding persistence must stay mediated by the existing admin booking persistence gate and verified server-session admin/dispatcher actor before creating a server-only Supabase client.
- This guard coordinates the driver portal bidding API contract, driver portal bidding schema contract, public API method guard, public API request input guard, public API response privacy guard, public API runtime gate guard, and public API client caller guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-driver-bidding-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Driver Bidding Surface Guard
- `origin/staging` points to `b6cfcb7978c2be154982694e4c300e29c99df00c` (`b6cfcb7 Guard public driver bidding surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 0.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public driver bidding surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/driver-job-bids` remains blocked for GET, POST, and PATCH by `driverBidRuntimeAccessBlocked` until approved driver auth exists, with no body parsing, env read, Supabase client creation, or DB read/write in the public route.
- Public driver pages do not call `/api/driver-job-bids` or `/api/admin-driver-job-bid-offers`, expose bid offer IDs, driver references, admin purpose/session-token headers, Cookie, Authorization, browser credential storage, or service-role/Supabase env names.
- `/api/admin-driver-job-bid-offers` remains behind the internal admin/dispatcher boundary and safe failure response, with reads, saves, and status updates mediated by `lib/driver-portal-bidding-persistence.ts`.
- Driver bidding persistence safe shapes remain limited to booking reference, offer/bid statuses, pickup time, safe pickup/drop-off areas, safe vehicle/trip/context fields, driver reference, safe driver label/bid note/context, status timestamps, and actor/source metadata.
- Driver bidding surfaces exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, or new shim was included.

### Public Customer/Driver App Notification Surface Guard Lock
- Public customer/driver app notification surfaces are guarded across `/api/customer-app-notifications`, `/api/driver-job/[token]/notifications`, `/api/admin-customer-driver-app-notifications`, `lib/customer-driver-app-notification-persistence.ts`, and public client pages.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, or new shims.
- `/api/customer-app-notifications` must remain blocked for GET and PATCH by the customer auth-required result by default; the only allowed customer GET read is the disabled-by-default staging evidence path after the customer in-app read gate, staging reference, same-origin customer portal headers, and existing saved-bookings session boundary pass.
- `/api/customer-app-notifications` must not parse request bodies, directly read env, create Supabase clients in the route, set cookies, or execute DB writes; any future customer GET evidence DB read must stay isolated in the gated server helper after the route boundary passes.
- `/api/driver-job/[token]/notifications` must remain limited to token-scoped GET and PATCH, with PATCH forced to `delivery_surface: "driver_app"` before persistence update.
- Driver notification reads and updates must verify the hashed driver job token, reject revoked/expired/outside-window links, scope rows to `driver_app`, booking reference, queued status, and the matching driver job link id or booking-wide null link id, then return safe notification records only.
- `/api/admin-customer-driver-app-notifications` must keep GET, POST, and PATCH behind the internal admin/dispatcher boundary, with create/read/update mediated by `lib/customer-driver-app-notification-persistence.ts`.
- Customer/driver app notification safe records must stay limited to booking reference, delivery surface, notification type/status, priority, safe title/message/context, workflow area, id, and created/updated timestamps.
- Customer/driver app notification surfaces must exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Public client pages must not call `/api/customer-app-notifications` or `/api/admin-customer-driver-app-notifications`, expose admin purpose/session-token headers, Cookie, Authorization, browser credential storage, or service-role/Supabase env names.
- This guard coordinates the customer/driver app notification API contract, schema contract, public API method guard, request input guard, response privacy guard, runtime gate guard, client caller guard, and session cookie/cache guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-driver-app-notification-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer/Driver App Notification Surface Guard
- `origin/staging` points to `52c6c2912a31d7b87362526b5dd1939d6d39e346` (`52c6c29 Guard public app notification surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 2 GET-only RSC prefetch load-completion events for `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer/driver app notification surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/customer-app-notifications` remains blocked for GET and PATCH by the customer auth-required result until approved customer auth exists, with no body parsing, env read, Supabase client creation, cookie setting, or DB read/write in the public customer route.
- `/api/driver-job/[token]/notifications` remains limited to token-scoped GET and PATCH, with PATCH forced to `delivery_surface: "driver_app"` before persistence update.
- Driver notification reads and updates remain scoped by hashed driver job token validation, revoked/expired/outside-window rejection, `driver_app`, booking reference, queued status, and the matching driver job link id or booking-wide null link id before returning safe notification records only.
- `/api/admin-customer-driver-app-notifications` remains behind the internal admin/dispatcher boundary, with create/read/update mediated by `lib/customer-driver-app-notification-persistence.ts`.
- Customer/driver app notification safe records remain limited to booking reference, delivery surface, notification type/status, priority, safe title/message/context, workflow area, id, and created/updated timestamps.
- Customer/driver app notification surfaces exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Public client pages do not call `/api/customer-app-notifications` or `/api/admin-customer-driver-app-notifications`, expose admin purpose/session-token headers, Cookie, Authorization, browser credential storage, or service-role/Supabase env names.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, or new shim was included.

### Public Driver Flight ETA Setup Surface Guard Lock
- Public driver Flight ETA setup surfaces are guarded across `/api/driver-job/[token]/flight-eta-setup`, `/api/driver-job/[token]/flight-eta-acknowledgement-setup`, `lib/admin-flight-api-setup-foundation.ts`, `lib/driver-flight-eta-acknowledgement-setup-foundation.ts`, and the public driver job page.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, live location/photo activation, FlightAware live lookup, or new shims.
- `/api/driver-job/[token]/flight-eta-setup` must remain token-scoped, GET-only, setup-only, and limited to safe setup statuses: customer update status, driver ETA notification status, driver ETA acknowledgement status, future MNG/Arrival eligibility, future driver notification minutes, and future admin-and-driver-only scope.
- `/api/driver-job/[token]/flight-eta-acknowledgement-setup` must remain token-scoped, GET-only, setup-only, and limited to disabled acknowledgement/action/resend/admin-escalation statuses, MNG/Arrival-only eligibility, future before-OTW acknowledgement, 2-attempt escalation rule, and replacement-driver admin action wording.
- Both routes must not call external flight providers, send notifications, create Supabase clients, read env, set cookies, parse request bodies, submit forms, call geolocation/media/file APIs, or execute DB reads/writes.
- The public driver job page must not call the Flight ETA setup or acknowledgement setup routes until separate Flight ETA activation/UI approval exists.
- Driver Flight ETA setup surfaces must exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- This guard coordinates the driver flight ETA setup API contract, driver flight ETA acknowledgement setup API contract, public API method guard, request input guard, response privacy guard, runtime gate guard, logging/error guard, and session cookie/cache guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-driver-flight-eta-setup-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Driver Flight ETA Setup Surface Guard
- `origin/staging` points to `234ac6f8535cbdd4b992c5fdfc60dcb39bd2934e` (`234ac6f Guard public driver Flight ETA setup surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 2 GET-only RSC prefetch load-completion events for `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: allocator warning, GCM `PHONE_REGISTRATION_ERROR`, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad settings noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public driver Flight ETA setup surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/driver-job/[token]/flight-eta-setup` remains token-scoped, GET-only, setup-only, and limited to safe setup statuses for customer update status, driver ETA notification status, driver ETA acknowledgement status, future MNG/Arrival eligibility, future driver notification minutes, and future admin-and-driver-only scope.
- `/api/driver-job/[token]/flight-eta-acknowledgement-setup` remains token-scoped, GET-only, setup-only, and limited to disabled acknowledgement/action/resend/admin-escalation statuses, MNG/Arrival-only eligibility, future before-OTW acknowledgement, 2-attempt escalation rule, and replacement-driver admin action wording.
- Both routes remain free of external flight provider calls, notification sends, Supabase client creation, env reads, cookie setting, request-body parsing, form submission, geolocation/media/file APIs, and DB reads/writes.
- The public driver job page does not call the Flight ETA setup or acknowledgement setup routes.
- Driver Flight ETA setup surfaces exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, live location/photo activation, FlightAware live lookup, or new shim was included.

### Public Customer Driver-Details Link Surface Guard Lock
- Public customer driver-details link surfaces are guarded across `/api/customer-driver-details-link-access-disabled-setup`, `/api/admin-customer-driver-details-link-preview-readiness-setup`, `lib/customer-driver-details-link-setup-foundation.ts`, `lib/customer-driver-details-link-access-audit-payload-setup-foundation.ts`, and public client pages.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, live link access, token issuance, or new shims.
- `/api/customer-driver-details-link-access-disabled-setup` must remain GET-only, setup-only, disabled/no-op, token-free, live-access-free, provider-send-free, cookie-free, and limited to blocked access/readiness/preview payloads.
- `/api/admin-customer-driver-details-link-preview-readiness-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `external_send`, `linkEnabled`, `liveAccessEnabled`, `providerConfigured`, and `tokenIssued` all false.
- The setup and access audit helpers must stay server-only, setup-only, no-live, no-op, and must not issue tokens, generate secrets, read env, create Supabase clients, write audits, send providers, activate auth/session access, or use location/photo/file APIs.
- Public client pages must not call the customer driver-details link access or admin preview routes until separate secure-link activation/UI approval exists.
- Customer driver-details link surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- This guard coordinates the setup foundation contract, admin preview/readiness API contract, disabled access API contract, access audit payload setup contract, and customer driver-details link no-live guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-driver-details-link-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer Driver-Details Link Surface Guard
- `origin/staging` points to `6086b30ac2cbdee5d76d2cedb5c3b44a09c6ca1d` (`6086b30 Guard public customer driver details link surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 0.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad settings noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer driver-details link surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/customer-driver-details-link-access-disabled-setup` remains GET-only, setup-only, disabled/no-op, token-free, live-access-free, provider-send-free, cookie-free, and limited to blocked access/readiness/preview payloads.
- `/api/admin-customer-driver-details-link-preview-readiness-setup` remains behind the internal admin/dispatcher boundary and returns setup-only preview/readiness payloads with `external_send`, `linkEnabled`, `liveAccessEnabled`, `providerConfigured`, and `tokenIssued` all false.
- The setup and access audit helpers remain server-only, setup-only, no-live, no-op, and do not issue tokens, generate secrets, read env, create Supabase clients, write audits, send providers, activate auth/session access, or use location/photo/file APIs.
- Public client pages do not call the customer driver-details link access or admin preview routes.
- Customer driver-details link surfaces exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, live link access, token issuance, or new shim was included.

### Public Customer/Driver Auth Surface Guard Lock
- Public customer/driver auth setup surfaces are guarded across `/api/admin-customer-driver-auth-access-disabled-setup`, `/api/admin-customer-driver-auth-readiness-preview-setup`, `lib/customer-driver-auth-readiness-setup-foundation.ts`, `lib/customer-driver-auth-access-audit-payload-setup-foundation.ts`, and public client pages.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, live customer/driver auth, session creation, token issuance, or new shims.
- `/api/admin-customer-driver-auth-access-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, token-free, live-access-free, live-session-free, provider-send-free, cookie-free, and limited to blocked auth access/readiness/preview payloads.
- `/api/admin-customer-driver-auth-readiness-preview-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `accessPolicyEnabled`, `authProviderConfigured`, `customerAuthEnabled`, `driverAuthEnabled`, and `liveSessionEnabled` all false.
- The readiness and access audit helpers must stay server-only, setup-only, no-live, no-op, and must not issue tokens, generate secrets, read env, create Supabase clients, write audits, send providers, activate auth/session access, set cookies, or use location/photo/file APIs.
- Public client pages must not call the customer/driver auth disabled access or admin preview routes until separate customer/driver auth activation/UI approval exists.
- Customer/driver auth setup surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- This guard coordinates the auth foundation API contract, auth foundation schema contract, readiness setup foundation contract, admin preview/readiness API contract, disabled access API contract, access audit payload setup contract, and customer/driver auth no-live guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-customer-driver-auth-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Customer/Driver Auth Surface Guard
- `origin/staging` points to `52af3d69b665e91383b5b573a966986954182e87` (`52af3d6 Guard public customer driver auth surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary with `ok: false` and `status: "blocked"`; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, allocator warning, GCM `PHONE_REGISTRATION_ERROR`, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad settings noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public customer/driver auth surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/admin-customer-driver-auth-access-disabled-setup` remains behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, token-free, live-access-free, live-session-free, provider-send-free, cookie-free, and limited to blocked auth access/readiness/preview payloads.
- `/api/admin-customer-driver-auth-readiness-preview-setup` remains behind the internal admin/dispatcher boundary and returns setup-only preview/readiness payloads with `accessPolicyEnabled`, `authProviderConfigured`, `customerAuthEnabled`, `driverAuthEnabled`, and `liveSessionEnabled` all false.
- The readiness and access audit helpers remain server-only, setup-only, no-live, no-op, and do not issue tokens, generate secrets, read env, create Supabase clients, write audits, send providers, activate auth/session access, set cookies, or use location/photo/file APIs.
- Public client pages do not call the customer/driver auth disabled access or admin preview routes.
- Customer/driver auth setup surfaces exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, auth activation, live customer/driver auth, session creation, token issuance, or new shim was included.

### Public Billing/Payment Surface Guard Lock
- Public billing/payment setup surfaces are guarded across `/api/admin-billing-payment-action-disabled-setup`, `/api/admin-billing-payment-readiness-preview-setup`, `lib/admin-billing-payment-readiness-setup-foundation.ts`, `lib/admin-billing-payment-action-audit-payload-setup-foundation.ts`, and public client pages.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, invoice PDF generation, invoice sending, payment links, payout automation, production auto-billing, or new shims.
- `/api/admin-billing-payment-action-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, provider-free, payment-link-free, invoice-PDF-free, invoice-send-free, payout-automation-free, live-billing-free, cookie-free, and limited to blocked billing/payment action/readiness/preview payloads.
- `/api/admin-billing-payment-readiness-preview-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `invoicePdfEnabled`, `invoiceSendingEnabled`, `paymentLinksEnabled`, `payoutAutomationEnabled`, `productionAutoBillingEnabled`, `paymentProviderConfigured`, and `liveBillingEnabled` all false.
- The readiness and action audit helpers must stay server-only, setup-only, no-live, no-op, and must not generate PDFs, send invoices, create payment links, automate payouts, read env, create Supabase clients, write audits, send providers, set cookies, or use file APIs.
- Public client pages must not call the billing/payment disabled action or admin preview routes until separate billing/payment activation/UI approval exists.
- Billing/payment setup surfaces must exclude customer price, driver payout, PayNow payout details, invoice numbers, payment URLs, PDF URLs, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- This guard coordinates the readiness setup foundation contract, admin preview/readiness API contract, disabled action API contract, action audit payload setup contract, and billing/payment no-live guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-billing-payment-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Billing/Payment Surface Guard
- `origin/staging` points to `df5117324223fe06da50cebbf5dba5f9bd086385` (`df51173 Guard public billing payment surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary with `ok: false` and `status: "blocked"`; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: attempted IPH before browser initialization, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad settings noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public billing/payment surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/admin-billing-payment-action-disabled-setup` remains behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, provider-free, payment-link-free, invoice-PDF-free, invoice-send-free, payout-automation-free, live-billing-free, cookie-free, and limited to blocked billing/payment action/readiness/preview payloads.
- `/api/admin-billing-payment-readiness-preview-setup` remains behind the internal admin/dispatcher boundary and returns setup-only preview/readiness payloads with `invoicePdfEnabled`, `invoiceSendingEnabled`, `paymentLinksEnabled`, `payoutAutomationEnabled`, `productionAutoBillingEnabled`, `paymentProviderConfigured`, and `liveBillingEnabled` all false.
- The readiness and action audit helpers remain server-only, setup-only, no-live, no-op, and do not generate PDFs, send invoices, create payment links, automate payouts, read env, create Supabase clients, write audits, send providers, set cookies, or use file APIs.
- Public client pages do not call the billing/payment disabled action or admin preview routes.
- Billing/payment setup surfaces exclude customer price, driver payout, PayNow payout details, invoice numbers, payment URLs, PDF URLs, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, invoice PDF generation, invoice sending, payment links, payout automation, production auto-billing, or new shim was included.

### Public Live Location Surface Guard Lock
- Public live-location setup surfaces are guarded across `/api/admin-live-location-setup`, `/api/admin-live-location-window-policy-preview-readiness-setup`, `/api/admin-live-location-access-capture-disabled-setup`, `lib/admin-live-location-setup-foundation.ts`, `lib/live-location-window-policy-setup-foundation.ts`, and public client pages.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, live GPS capture, admin live map, customer map link, location storage, or new shims.
- `/api/admin-live-location-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, and limited to disabled live-location, admin-map, customer-map, and driver-capture setup payloads.
- `/api/admin-live-location-window-policy-preview-readiness-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `gpsCaptureEnabled`, `liveMapEnabled`, `customerVisible`, `locationStorageEnabled`, and `liveAccessEnabled` all false.
- `/api/admin-live-location-access-capture-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, GPS-capture-free, live-map-free, customer-map-link-free, location-storage-free, provider-send-free, cookie-free, and limited to blocked access/capture/readiness/preview payloads.
- The setup and window policy helpers must stay setup-only, no-live, no-op, and must not use GPS capture APIs, map provider APIs, provider/env reads, Supabase clients, DB/storage writes, auth/session activation, file APIs, or photo APIs.
- Public client pages must not call live-location setup, access, capture, or preview routes until separate live-location activation/UI approval exists.
- Live-location setup surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live GPS coordinates, map provider payloads, photo/file fields, and mock QA/dev archive fields.
- This guard coordinates the setup foundation contract, setup API contract, window policy foundation contract, window policy preview/readiness API contract, disabled access/capture API contract, and live-location no-live guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-live-location-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public Live Location Surface Guard
- `origin/staging` points to `bfa61e556838adb27a5ca530c084503b82691c0d` (`bfa61e5 Guard public live location surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary with `ok: false` and `status: "blocked"`; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 1 GET-only RSC prefetch load-completion event for `/driver-job/mock-driver-job-valid-a` after HTTP 200; this was not a POST/write/send request.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: attempted IPH before browser initialization, allocator warning, GCM `DEPRECATED_ENDPOINT`, GCM `PHONE_REGISTRATION_ERROR`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad settings noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public live-location surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/admin-live-location-setup` remains behind the internal admin/dispatcher boundary, GET-only, setup-only, and limited to disabled live-location, admin-map, customer-map, and driver-capture setup payloads.
- `/api/admin-live-location-window-policy-preview-readiness-setup` remains behind the internal admin/dispatcher boundary and returns setup-only preview/readiness payloads with `gpsCaptureEnabled`, `liveMapEnabled`, `customerVisible`, `locationStorageEnabled`, and `liveAccessEnabled` all false.
- `/api/admin-live-location-access-capture-disabled-setup` remains behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, GPS-capture-free, live-map-free, customer-map-link-free, location-storage-free, provider-send-free, cookie-free, and limited to blocked access/capture/readiness/preview payloads.
- The setup and window policy helpers remain setup-only, no-live, no-op, and do not use GPS capture APIs, map provider APIs, provider/env reads, Supabase clients, DB/storage writes, auth/session activation, file APIs, or photo APIs.
- Public client pages do not call live-location setup, access, capture, or preview routes.
- Live-location setup surfaces exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live GPS coordinates, map provider payloads, photo/file fields, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, live GPS capture, admin live map, customer map link, location storage, or new shim was included.

### Public OTS Photo Proof Surface Guard Lock
- Public OTS photo proof setup surfaces are guarded across `/api/admin-ots-photo-proof-setup`, `/api/admin-ots-photo-proof-preview-readiness-setup`, `/api/admin-ots-photo-proof-access-upload-disabled-setup`, `lib/admin-ots-photo-proof-setup-foundation.ts`, `lib/admin-ots-photo-proof-access-upload-audit-payload-setup-foundation.ts`, and public client pages.
- This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, camera capture, file upload, Supabase Storage, admin photo viewer, customer photo visibility, or new shims.
- `/api/admin-ots-photo-proof-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, and limited to disabled OTS photo proof, camera-capture, file-upload, storage, admin-viewer, and customer-visibility setup payloads.
- `/api/admin-ots-photo-proof-preview-readiness-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `photoUploadEnabled`, `storageEnabled`, `adminViewerEnabled`, `customerVisible`, and `liveAccessEnabled` all false.
- `/api/admin-ots-photo-proof-access-upload-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, camera-free, upload-free, storage-write-free, admin-viewer-free, customer-visibility-free, provider-send-free, cookie-free, and limited to blocked access/upload/readiness/preview payloads.
- The setup and access/upload audit helpers must stay setup-only, no-live, no-op, and must not use camera APIs, file upload APIs, storage APIs, provider/env reads, Supabase clients, DB/storage writes, auth/session activation, payment APIs, or photo data payloads.
- Public client pages must not call OTS photo proof setup, access, upload, or preview routes until separate OTS photo activation/UI approval exists.
- OTS photo proof setup surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, real photo bytes, storage object IDs, signed/download URLs, live location fields, and mock QA/dev archive fields.
- This guard coordinates the setup foundation contract, setup API contract, preview/readiness API contract, disabled access/upload API contract, access/upload audit payload setup contract, and OTS photo proof no-live guard in the preactivation suite.
- No Save Booking + CRM change.
- No `/api/admin-saved-bookings` change.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new shims are added.
- This lock adds `scripts/test-public-ots-photo-proof-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Public OTS Photo Proof Surface Guard
- `origin/staging` points to `168f710da521aa8cd213abef9435c7b4c08b42db` (`168f710 Guard public OTS photo proof surface`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Safe GET to `/api/admin-load-bookings-typed-read?limit=1` with `x-prestige-admin-purpose=admin-booking-persistence` returned HTTP 403 at the admin boundary with `ok: false` and `status: "blocked"`; no booking rows or safe cards were returned by that check.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 37 staging GET requests, 37 staging GET responses, 37 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser-canceled staging request count after observed response: 2 GET-only RSC prefetch load-completion events for `/driver-job/mock-driver-job-valid-a` after HTTP 200; these were not POST/write/send requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Chrome process stderr emitted non-app background lines: DevTools listening, attempted IPH before browser initialization, allocator warning, GCM `DEPRECATED_ENDPOINT`, TensorFlow Lite XNNPACK delegate creation, and GoogleUpdater/Crashpad settings noise; these were not page console/runtime exceptions and did not come from an app POST/write/send request.
- Screenshot captured: false.
- The public OTS photo proof surface guard remains docs/test-only/read-only and does not approve endpoint migration.
- `/api/admin-ots-photo-proof-setup` remains behind the internal admin/dispatcher boundary, GET-only, setup-only, and limited to disabled OTS photo proof, camera-capture, file-upload, storage, admin-viewer, and customer-visibility setup payloads.
- `/api/admin-ots-photo-proof-preview-readiness-setup` remains behind the internal admin/dispatcher boundary and returns setup-only preview/readiness payloads with `photoUploadEnabled`, `storageEnabled`, `adminViewerEnabled`, `customerVisible`, and `liveAccessEnabled` all false.
- `/api/admin-ots-photo-proof-access-upload-disabled-setup` remains behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, camera-free, upload-free, storage-write-free, admin-viewer-free, customer-visibility-free, provider-send-free, cookie-free, and limited to blocked access/upload/readiness/preview payloads.
- The setup and access/upload audit helpers remain setup-only, no-live, no-op, and do not use camera APIs, file upload APIs, storage APIs, provider/env reads, Supabase clients, DB/storage writes, auth/session activation, payment APIs, or photo data payloads.
- Public client pages do not call OTS photo proof setup, access, upload, or preview routes.
- OTS photo proof setup surfaces exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, real photo bytes, storage object IDs, signed/download URLs, live location fields, and mock QA/dev archive fields.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, camera capture, file upload, Supabase Storage, admin photo viewer, customer photo visibility, or new shim was included.

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
- The top latest verified clean runtime checkpoint must match the latest pushed main/staging runtime checkpoint line.
- The top latest remote main/staging deployment checkpoint must remain recorded as the most recent verified deployed reference by commit hash and task name; it can differ from the runtime checkpoint when docs-only or non-deployed commits exist.
- No inconsistent checkpoint counters are approved.
- This lock adds `scripts/test-ledger-checkpoint-source-of-truth-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Ledger Pre-Activation Suite Registration Guard Lock
- Ledger preactivation suite registration promises are guarded.
- This is docs/test-only guard hardening; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- Any ledger line that says a `scripts/test-*.mjs` guard is registered in the preactivation suite must match an actual script entry in `scripts/test-preactivation-verification-suite.mjs`.
- This prevents future source-of-truth drift where the ledger claims master-suite coverage that the suite does not run.
- This lock adds `scripts/test-ledger-preactivation-suite-registration-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Ledger Pre-Activation Suite Registration Guard
- `origin/staging` points to `00c683eeb930dad61027e4e86a061d3bba67c60c` (`00c683e Guard ledger preactivation suite registrations`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET with document title `Prestige Limo Ops`.
- Passive browser request smoke rendered the main admin UI at desktop viewport with document title `Prestige Limo Ops`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo Ops`, `Create Job Card`, `Save Booking + CRM`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking + CRM was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, and 0 missing responses.
- CDP also reported 2 browser-canceled load-completion events after all staging GET responses had HTTP 200; these were not POST/write/send actions.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- The ledger preactivation suite registration guard remains docs/test-only and does not approve endpoint migration, env changes, DB read/write, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors/buttons/cards, or new shims.
- Save Booking + CRM remains on `POST /api/admin-bookings`.
- `/api/admin-saved-bookings` remains unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No new UI sectors/buttons/cards were added.
- No new shims were added.

### Current Implementation Ledger Alignment Suite Registration
- The existing current implementation ledger alignment guard is repaired for the current ledger checkpoint markers and registered in `scripts/test-preactivation-verification-suite.mjs`.
- This is docs/test-only guard hardening; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- The guard verifies the top latest verified clean checkpoint and latest staging-smoked app checkpoint both use commit hash plus task name, remain aligned, and point to a hash present in git history.
- The obsolete `Latest known clean checkpoint:` marker is no longer required by this guard.

### Current Implementation Ledger Not-Live Suite Registration
- The existing current implementation ledger not-live guard is registered in `scripts/test-preactivation-verification-suite.mjs`.
- This is docs/test-only guard hardening; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.
- The guard keeps the ledger `## Not Live / Not Implemented` section present and protects the listed parked items: external flight API calls, live ETA lookup, real driver ETA notification sending, real GPS/live map, real OTS photo upload/storage, customer/driver auth activation, invoice PDF generation, payment links, payout automation, and production deployment activation.
- The master preactivation suite now fail-fast runs this guard with the other source-of-truth and no-live checks.

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

## Telegram Internal Admin Alert Live Send Activation Lock

- Approval status: approved by William from Codex mobile for internal-admin Telegram activation.
- Telegram internal admin alerts now have one bounded live-send path: `POST /api/admin-telegram-internal-admin-alert-send`.
- The live-send route is admin-dashboard only through the existing same-origin dispatcher boundary and `x-prestige-admin-purpose: admin-booking-persistence`.
- Live send remains closed unless all server env gates are configured: `PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED=true`, `PRESTIGE_TELEGRAM_BOT_TOKEN`, `PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID`, and `PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST`.
- Chat IDs are server-side only and must be numeric. The configured default chat must be present in the configured allowlist before any provider call is attempted.
- The admin UI adds one compact `Send Internal Test` action inside the existing Telegram details panel. The browser sends only safe test text and a confirmation marker; it never receives or reads the bot token or chat ID.
- The live sender uses Telegram Bot API `sendMessage` only, with protected content and disabled link previews, matching the official Bot API text-message method shape.
- Provider responses are redacted: the app reports only safe status, whether a provider message id was present, and redacted chat/config booleans. It does not return the token, chat ID, Telegram URL, provider response body, or raw provider error text.
- The existing mock preview/readiness and disabled-send setup routes remain available as setup/no-op evidence.
- No Telegram webhook, `getUpdates`, polling, scheduler, retry loop, batch send, DB write, schema change, customer send, driver send, live-location send, payment/PDF/billing/payout, parser, Save Booking + CRM, or `/api/admin-saved-bookings` behavior is added.
- Customer and driver pages remain free of Telegram controls, Telegram chat mapping, bot tokens, chat IDs, payout/pricing/payment/PDF, parser/debug, and internal admin/finance data.
- Focused guard coverage: `scripts/test-telegram-internal-admin-alert-live-send-guard.mjs` plus the existing setup-route no-live guard.

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

## Customer Copy Multi-Channel Existing Workflow Lock

- The existing admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow is locked by `docs/customer-copy-multi-channel-existing-workflow-lock.md`.
- This lock now reflects the approved current lane: real Email is admin-selected through the already approved gated Resend route; Customer In-App and Driver In-App are admin-selected through the existing in-app notification route; Telegram remains internal-admin only; SMS and WhatsApp remain parked.
- Do not add duplicate Email, WhatsApp, SMS, customer-message, driver-notification, provider-send, or customer driver-details workflow sectors, buttons, cards, routes, helpers, or shims.
- Existing surfaces are `data-dispatch-workflow-step="customer-whatsapp-copy"`, `data-copy-edit-button="customerCopy"`, `data-copy-copy-button="customerCopy"`, `data-copy-preview="customerCopy"`, `data-customer-live-location-helper`, `data-admin-customer-driver-details-email-review-item`, the existing compact Email/WhatsApp/SMS controls, the existing Customer In-App control, and `data-admin-email-activation-preflight-status` in `app/page.tsx`.
- Email now uses the existing approved gated POST route `POST /api/admin-customer-driver-details-email-send-action` from the same compact row.
- WhatsApp and SMS remain parked on setup-only/no-op GET paths.
- Customer In-App and Driver In-App remain explicit admin-selected in-app notification actions through `POST /api/admin-customer-driver-app-notifications`.
- Telegram remains the existing internal-admin alert send path only through `POST /api/admin-telegram-internal-admin-alert-send`.
- SMS and WhatsApp sends remain parked unless separately approved.
- Customer/driver Telegram sends remain parked unless separately approved.
- Existing coverage lives in `scripts/test-customer-copy-multi-channel-no-live-guard.mjs`, `scripts/test-admin-customer-driver-details-email-send-action-api-contract.mjs`, `scripts/test-customer-copy-multi-channel-existing-workflow-lock.mjs`, `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, and `scripts/test-mobile-usability-browser.mjs`.
- This lock adds `scripts/test-customer-copy-multi-channel-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging No-Screenshot Request Smoke for Customer Copy Multi-Channel Workflow Lock
- `origin/staging` points to `46b52179a66582cc23bc8b9b35428c0d997c7fc0` (`46b5217 Lock existing customer copy multi-channel workflow`), verified directly with `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/?smoke=46b5217` returned HTTP 200 by safe GET with `content-type: text/html; charset=utf-8` and Vercel response headers.
- Passive browser request smoke rendered the main admin UI at `https://prestige-limo-ops-staging.vercel.app/?visual-smoke=46b5217-response-tracked-idle`; no screenshot was captured.
- Expected UI text rendered: `Prestige Limo`, `Create Job Card`, `Job Card Preview`, `Driver Dispatch`, `Save Booking + CRM`, `Dispatch`, `Dashboard`, `Bookings`, `Drivers`, `Completed`, and `Rates`.
- Save Booking + CRM was visible but was not clicked.
- No forms were submitted.
- No POST/write/send action was attempted by the smoke; observed staging browser requests were GET-only.
- Observed browser request/response summary: 38 staging GET requests, 38 staging GET responses, 38 HTTP 200 responses, 0 non-GET requests, 0 non-200 responses, 0 missing responses, and 0 failed-before-response requests.
- Browser console error logs: 0.
- Browser runtime exceptions: 0.
- Browser dialogs/security prompts: 0.
- Screenshot captured: false.
- The Customer Copy multi-channel existing workflow lock remains docs/test-only and does not approve runtime implementation, UI/API behavior change, endpoint migration, env changes, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, customer/driver portal changes, UI sectors/buttons/cards, or new shims.
- Existing Customer Copy Email/WhatsApp/SMS setup-only disabled-send review surfaces remain colocated inside the existing Customer Copy section.
- Email, WhatsApp, SMS, Telegram, customer messages, driver notifications, provider/env reads, and provider sends remain blocked until separate explicit approval.
- Save Booking + CRM remains separate and was not used by this smoke.
- `/api/admin-saved-bookings` remains separate and unchanged.
- Parser behavior and `/api/ai-parse` remain unchanged.
- No env change, DB read/write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim was included.

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

### Customer/Driver Auth Activation Evidence Contract Guard Lock

- This is a docs/test-only guard for a future separately approved Customer/Driver Auth activation evidence pass.
- This lock does not activate customer auth, driver auth, Supabase Auth, customer portal access, driver portal access, live sessions, session creation, cookie creation, token creation, password reset, magic-link, OTP, env changes, DB read/write, RLS/policy changes, deployment, provider sends, parser behavior, Save Booking, `/api/admin-saved-bookings`, UI expansion, shims, or production activation.
- Future auth evidence requires explicit owner approval for customer auth activation.
- Future auth evidence requires explicit owner approval for driver auth activation.
- Future auth evidence requires explicit owner approval for the auth provider.
- Future auth evidence requires explicit owner approval for live sessions.
- Future auth evidence requires explicit owner approval for access policies.
- Future Supabase Auth provider/config proof must use names only and must not print passwords, cookies, session tokens, API keys, env values, database URLs, JWT secrets, OAuth secrets, service-role keys, or credentials.
- Future customer access proof must include table/RLS policy proof for customer row isolation on `customer_access_accounts` and any customer-safe booking projection used by the portal.
- Future driver access proof must include table/RLS policy proof for driver row isolation on `driver_access_accounts` and any driver-safe job projection used by the driver portal.
- Future audit proof must account for `customer_driver_access_audit_events` without exposing raw tokens, cookies, secrets, provider payloads, finance, payout, parser/debug, or mock archive fields.
- Future session/cookie issuance proof must show HttpOnly Secure SameSite cookie behavior or equivalent server-session protection, and response bodies/logs must not expose token values, cookie values, raw JWTs, magic links, OTPs, password reset links, or session secrets.
- Customer-safe projection proof must block payout, PayNow payout, `driver_payout_rules`, internal/admin notes, parser/debug fields, finance, mock archive, secrets/tokens, raw provider payloads, Save Booking internals, and `/api/admin-saved-bookings` internals.
- Driver-safe projection proof must block customer price, `customer_rates`, billing, invoice/payment, payout comparisons, finance/admin notes, parser/debug fields, mock archive, secrets/tokens, raw provider payloads, Save Booking internals, and `/api/admin-saved-bookings` internals.
- Future rollback/disable proof must close the auth/session/access gates, verify setup-only/blocked/no-op behavior again, and preserve fail-closed public customer and driver surfaces.
- Customer/Driver Auth activation evidence must remain separate from live location, OTS photo/storage, calendar, payment/PDF/billing, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, provider sends, Email/Telegram/WhatsApp/SMS sending, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.
- Existing auth setup surfaces remain GET-only, admin/dispatcher gated, blocked/no-op, token-free, cookie-free, and not live until a separate owner-approved activation evidence pass.
- This guard adds `scripts/test-customer-driver-auth-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

## Billing/Payment Pre-Activation Completion Audit Lock

- Billing/payment is complete up to the activation stop.
- Readiness foundation is done.
- Preview/readiness API is done.
- Disabled billing/payment action API is done.
- Action audit payload setup foundation is done.
- Billing/payment no-live guard is done.
- Invoice PDF generation, invoice sending, payment links, payout automation, production auto-billing, payment provider/env, and DB/write remain blocked until explicit approval.

### Admin Billing/Payment Finance Activation Split Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime implementation, UI/API behavior change, env change, DB read/write, provider send, production deploy, Save Booking route change, `/api/admin-saved-bookings` change, parser change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim.
- Billing/payment is complete only up to the activation stop.
- Existing setup-only boundaries stay on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- Future finance runtime work must be split into exactly one separately approved sub-lane per task.
- Split sub-lanes: Invoice number reservation readiness.
- Split sub-lanes: Invoice/PDF format approval.
- Split sub-lanes: PDF generation.
- Split sub-lanes: Invoice sending/delivery.
- Split sub-lanes: Payment links/provider.
- Split sub-lanes: Manual payment record/reconciliation.
- Split sub-lanes: Payout/accounting/finance export.
- Payout/accounting/finance export is separate from customer billing/payment.
- Each future runtime lane requires explicit owner approval naming exactly one sub-lane before implementation.
- Required future approval proof: Exact staging target and commit hash.
- Required future approval proof: Env gate names only, with no values or secrets.
- Required future approval proof: Table, RLS, storage, and access-policy proof for only the named sub-lane.
- Required future approval proof: Admin/dispatcher/finance role-boundary proof.
- Required future approval proof: Customer and driver privacy proof.
- Required future approval proof: Rollback, kill-switch, and manual recovery plan.
- Required future approval proof: One bounded evidence window and stop conditions.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- Existing billing/payment setup remains planned-only and blocked.
- `invoicePdfEnabled` stays false.
- `invoiceSendingEnabled` stays false.
- `paymentLinksEnabled` stays false.
- `payoutAutomationEnabled` stays false.
- `productionAutoBillingEnabled` stays false.
- `paymentProviderConfigured` stays false.
- `liveBillingEnabled` stays false.
- `auditWriteEnabled` stays false.
- `external_send` stays false.
- Missing requirement remains `invoice_pdf_generation_approval`.
- Missing requirement remains `invoice_sending_approval`.
- Missing requirement remains `payment_provider`.
- Missing requirement remains `payment_links_approval`.
- Missing requirement remains `payout_automation_approval`.
- Missing requirement remains `production_auto_billing_approval`.
- Missing requirement remains `live_billing_approval`.
- Before PDF generation, owner approval must define invoice/statement format, invoice-number rules, included rows, tax/GST treatment, adjustment rules, staff review steps, generated-file access/storage, customer/month selection, rollback, and leak-proofing.
- Before invoice sending/delivery, owner approval must define channel, recipients, copy/template, opt-out or manual-send policy, audit logging, failure/retry handling, and proof provider sends remain disabled until approved.
- Before payment links/provider, owner approval must define test-mode scope, provider, secret-handling plan, webhook security, idempotency, payment-status mapping, failure states, disabled-by-default production posture, and rollback.
- Before manual payment record/reconciliation, owner approval must define who can record payments, evidence storage, customer-visible fields, audit requirements, correction workflow, and rollback.
- Before payout/accounting/finance export, owner approval must define finance-only role access, exported fields, PayNow handling, accounting destination, customer/driver visibility proof, and rollback.
- This packet does not approve invoice creation, PDF generation, PDF storage, invoice sending, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, finance export, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-billing-payment-finance-activation-split-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Admin Monthly Invoice PDF Format Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime invoice format implementation, invoice creation, PDF generation, PDF storage, invoice sending, customer email, WhatsApp, SMS, provider send, payment links/provider, payment recording, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.
- Admin Monthly Invoice PDF Format is a future finance decision sub-lane.
- It remains blocked until explicit owner approval names this exact invoice/PDF-format-only lane.
- Invoice/PDF format approval is separate from: Invoice number reservation.
- Invoice/PDF format approval is separate from: Customer/company prefix and running-number policy.
- Invoice/PDF format approval is separate from: PDF generation.
- Invoice/PDF format approval is separate from: Invoice sending/delivery.
- Invoice/PDF format approval is separate from: Payment links/provider.
- Invoice/PDF format approval is separate from: Manual payment record/reconciliation.
- Invoice/PDF format approval is separate from: Payout/accounting/export.
- Invoice/PDF format approval is separate from: Billing automation.
- Invoice/PDF format approval must not be bundled with runtime invoice creation, PDF generation, PDF storage, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, customer messages, driver notifications, or production activation.
- Future invoice/PDF format approval requires explicit owner decisions for: Invoice versus statement naming.
- Future invoice/PDF format approval requires explicit owner decisions for: Header, footer, logo, company registration, and contact display.
- Future invoice/PDF format approval requires explicit owner decisions for: Invoice-number placement and reserved-number reference.
- Future invoice/PDF format approval requires explicit owner decisions for: Billing customer/company identity snapshot.
- Future invoice/PDF format approval requires explicit owner decisions for: Billing month and trip grouping display.
- Future invoice/PDF format approval requires explicit owner decisions for: Included row rules.
- Future invoice/PDF format approval requires explicit owner decisions for: Trip snapshot fields.
- Future invoice/PDF format approval requires explicit owner decisions for: Booking reference, service type, pickup, dropoff, date, time, vehicle, and passenger display.
- Future invoice/PDF format approval requires explicit owner decisions for: Rate, charge, adjustment, credit, waiting time, and discount display.
- Future invoice/PDF format approval requires explicit owner decisions for: Currency and rounding rules.
- Future invoice/PDF format approval requires explicit owner decisions for: Tax/GST treatment, including explicit no-GST wording if applicable.
- Future invoice/PDF format approval requires explicit owner decisions for: Payment terms and bank-transfer instruction reference.
- Future invoice/PDF format approval requires explicit owner decisions for: Internal-only fields to exclude.
- Future invoice/PDF format approval requires explicit owner decisions for: Customer-visible fields allowed.
- Future invoice/PDF format approval requires explicit owner decisions for: Driver-visible exclusion proof.
- Future invoice/PDF format approval requires explicit owner decisions for: Staff review and approval steps before generation.
- Future invoice/PDF format approval requires explicit owner decisions for: Generated-file name pattern, access, storage, retention, and redaction policy for any later PDF generation lane.
- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing guarded routes stay `/api/admin-monthly-invoice-number-reservations` and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- Existing PDF generation approval remains separate and must treat this format packet as a prerequisite decision packet, not as generation approval.
- This packet does not add a duplicate UI sector/card/button, route, helper, or shim.
- Future runtime work after this format decision requires separate owner approval with Exact staging target and commit hash proof.
- Future runtime work after this format decision requires separate owner approval with The one named finance sub-lane being opened.
- Future runtime work after this format decision requires separate owner approval with Admin/dispatcher/finance role-boundary proof.
- Future runtime work after this format decision requires separate owner approval with Customer and driver privacy proof.
- Future runtime work after this format decision requires separate owner approval with Table, storage, and access-policy proof for only the named sub-lane.
- Future runtime work after this format decision requires separate owner approval with Rollback and kill-switch proof.
- Future runtime work after this format decision requires separate owner approval with One bounded evidence window.
- Future runtime work after this format decision requires separate owner approval with Env gate names only, with no env values or secrets printed.
- Future invoice/PDF format approval must not imply: Invoice creation.
- Future invoice/PDF format approval must not imply: Invoice number assignment or sequence increment.
- Future invoice/PDF format approval must not imply: PDF generation.
- Future invoice/PDF format approval must not imply: PDF storage.
- Future invoice/PDF format approval must not imply: Invoice sending/delivery.
- Future invoice/PDF format approval must not imply: Customer email, WhatsApp, or SMS sending.
- Future invoice/PDF format approval must not imply: Provider live send.
- Future invoice/PDF format approval must not imply: Payment link creation.
- Future invoice/PDF format approval must not imply: Payment provider activation.
- Future invoice/PDF format approval must not imply: Payment recording.
- Future invoice/PDF format approval must not imply: Customer portal billing/payment activation.
- Future invoice/PDF format approval must not imply: Payout/accounting/export.
- Future invoice/PDF format approval must not imply: Billing automation writes.
- Each of those remains a separate finance sub-lane requiring later explicit owner approval.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- This packet does not approve runtime invoice format implementation, invoice creation, invoice number assignment, invoice prefix writes, sequence writes, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-monthly-invoice-pdf-format-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Safe GET for Monthly Invoice PDF Format Approval Guard

- `origin/staging` was promoted from `028d3985138db4b0a85aa2143f7006a3072a35d4` to `988b65887eff3ee02e00c883aa578c4425c40a47`.
- Staging includes `988b658 Guard monthly invoice PDF format approval`.
- `git ls-remote --heads origin staging` confirmed `988b65887eff3ee02e00c883aa578c4425c40a47` after push.
- A non-fatal local sandbox warning prevented updating the local `refs/remotes/origin/staging` tracking ref during push, so the remote hash source of truth for this record is `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Safe GET response included `Save Booking + CRM`, but it was not clicked.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- The staged commit remains docs/test-only guard work and does not approve runtime invoice format implementation, invoice creation, invoice number assignment, invoice prefix writes, sequence writes, PDF generation, PDF storage, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.

### Admin Monthly Invoice PDF Generation Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime implementation, actual PDF generation, invoice creation, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, env changes, DB read/write, provider send, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.
- Admin Monthly Invoice PDF Generation is a future finance sub-lane.
- PDF generation remains blocked until explicit owner approval names this exact PDF-generation-only lane.
- PDF generation is separate from: Invoice number reservation.
- PDF generation is separate from: Invoice sending.
- PDF generation is separate from: Payment links/provider.
- PDF generation is separate from: Payment recording.
- PDF generation is separate from: Payout/accounting/export.
- PDF generation must not be bundled with invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, customer messages, driver notifications, or production activation.
- Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only.
- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing guarded routes stay `/api/admin-monthly-invoice-number-reservations` and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- This packet does not add a duplicate UI sector/card/button, route, helper, or shim.
- Future runtime PDF generation requires explicit owner approval with Exact staging target and commit hash proof.
- Future runtime PDF generation requires explicit owner approval with PDF format decision.
- Future runtime PDF generation requires explicit owner approval with Included invoice row decision.
- Future runtime PDF generation requires explicit owner approval with Tax/GST handling decision.
- Future runtime PDF generation requires explicit owner approval with Admin-only access boundary proof.
- Future runtime PDF generation requires explicit owner approval with Storage, access, and retention decision.
- Future runtime PDF generation requires explicit owner approval with Rollback and kill-switch proof.
- Future runtime PDF generation requires explicit owner approval with One bounded evidence window.
- Future runtime PDF generation requires explicit owner approval with Env gate names only, with no env values or secrets printed.
- Future PDF generation approval must not imply: Invoice sending.
- Future PDF generation approval must not imply: Payment link creation.
- Future PDF generation approval must not imply: Customer email, WhatsApp, or SMS sending.
- Future PDF generation approval must not imply: Provider live send.
- Future PDF generation approval must not imply: Payment recording.
- Future PDF generation approval must not imply: Payout/accounting/export.
- Future PDF generation approval must not imply: Billing automation writes.
- Each of those remains a separate finance sub-lane requiring later explicit owner approval.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- This packet does not approve PDF file creation, PDF storage, invoice sending, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-monthly-invoice-pdf-generation-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Admin Monthly Invoice Number Prefix Sequence Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime invoice number generation, invoice prefix writes, sequence writes, DB read/write execution, env changes, migrations, PDF generation, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider send, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.
- Admin Monthly Invoice Customer Prefix Running Number is a future finance sub-lane.
- The lane remains blocked until explicit owner approval names this exact customer/company prefix and running-number lane.
- Customer/company invoice prefix and running-number policy is separate from: PDF generation.
- Customer/company invoice prefix and running-number policy is separate from: Invoice sending.
- Customer/company invoice prefix and running-number policy is separate from: Payment links/provider.
- Customer/company invoice prefix and running-number policy is separate from: Payment recording.
- Customer/company invoice prefix and running-number policy is separate from: Payout/accounting/export.
- Customer/company invoice prefix and running-number policy is separate from: Billing automation.
- Admin sets and approves a unique invoice prefix code for each billing customer/company.
- Future runtime may auto-generate the next running invoice number for that billing customer/company only when invoice-number reservation is explicitly approved through the existing reservation boundary.
- Draft invoices, previews, grouping, billing preparation, and PDF-readiness review must not assign final invoice numbers.
- PDF generation later must use an already-reserved invoice number.
- Prefixes are admin-controlled and unique per billing customer/company.
- Running sequences are scoped to the billing customer/company.
- Future implementation must prevent duplicate invoice numbers with transaction-safe unique-constraint proof.
- Future implementation must never reuse voided or cancelled invoice numbers.
- Customer/company name changes must not silently change the assigned prefix.
- Invoice number format requires explicit owner decision before runtime, including whether to use `PREFIX-0001` or `PREFIX-YYYY-0001`.
- Yearly reset versus lifetime running sequence requires explicit owner decision before runtime.
- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing route stays `/api/admin-monthly-invoice-number-reservations`.
- Existing RPC boundary stays `reserve_monthly_invoice_number_for_issue_record`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- This packet does not add a duplicate UI sector/card/button, route, helper, or shim.
- Future runtime approval for this lane requires Exact staging target and commit hash proof.
- Future runtime approval for this lane requires Table and policy proof for the customer/company prefix and sequence tables only.
- Future runtime approval for this lane requires Admin-only boundary proof.
- Future runtime approval for this lane requires Transaction and unique-constraint proof.
- Future runtime approval for this lane requires Duplicate prevention proof.
- Future runtime approval for this lane requires Voided/cancelled invoice number non-reuse proof.
- Future runtime approval for this lane requires Customer/company rename prefix immutability proof.
- Future runtime approval for this lane requires Invoice number format decision.
- Future runtime approval for this lane requires Yearly reset versus lifetime sequence decision.
- Future runtime approval for this lane requires Rollback and kill-switch proof.
- Future runtime approval for this lane requires One bounded evidence window.
- Future runtime approval for this lane requires Env gate names only, with no env values or secrets printed.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- Future invoice-number runtime work must prove customer/driver public surfaces cannot expose finance/internal/payout fields.
- This packet does not approve runtime invoice number generation, invoice prefix assignment or update, sequence increment execution, DB reads/writes, migrations, PDF generation, PDF storage, invoice sending, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-monthly-invoice-number-prefix-sequence-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Safe GET for Monthly Invoice PDF and Prefix Sequence Approval Guards

- `origin/staging` was promoted from `8abe172cc6d2d0436677d7cb3000b77239c8a476` to `d3861d8caa2864ef465e06c00aec0cae628c3839`.
- Staging includes `3f731f0 Guard monthly invoice PDF generation approval` and `d3861d8 Guard monthly invoice prefix sequence approval`.
- `git ls-remote --heads origin staging` confirmed `d3861d8caa2864ef465e06c00aec0cae628c3839` after push.
- A non-fatal local sandbox warning prevented updating the local `refs/remotes/origin/staging` tracking ref, so the remote hash source of truth for this record is `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- The staged commits remain docs/test-only guard work and do not approve runtime invoice number generation, PDF generation, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.

### Admin Monthly Invoice Sending Delivery Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider send, payment links/provider, payment recording, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.
- Admin Monthly Invoice Sending Delivery is a future finance sub-lane.
- It remains blocked until explicit owner approval names this exact invoice-sending/delivery-only lane.
- Invoice sending/delivery is separate from: Invoice number reservation.
- Invoice sending/delivery is separate from: Customer/company prefix and running-number policy.
- Invoice sending/delivery is separate from: PDF generation.
- Invoice sending/delivery is separate from: Payment links/provider.
- Invoice sending/delivery is separate from: Payment recording.
- Invoice sending/delivery is separate from: Payout/accounting/export.
- Invoice sending/delivery is separate from: Billing automation.
- Future invoice sending/delivery may only happen after an invoice number has already been reserved and a PDF artifact has been generated through its own separately approved PDF-generation lane.
- Draft invoices, previews, grouping, billing preparation, issue record review, invoice-number reservation, and PDF-readiness review must not send invoices or notify customers.
- PDF generation approval must not imply invoice sending/delivery approval.
- Payment links/provider approval must not be bundled into invoice sending/delivery approval.
- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing guarded routes stay `/api/admin-monthly-invoice-number-reservations` and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit invoice delivery approval.
- This packet does not add a duplicate UI sector/card/button, route, helper, or shim.
- Future runtime invoice sending/delivery requires explicit owner approval with Exact staging target and commit hash proof.
- Future runtime invoice sending/delivery requires explicit owner approval with Channel decision.
- Future runtime invoice sending/delivery requires explicit owner approval with Recipient decision.
- Future runtime invoice sending/delivery requires explicit owner approval with Copy/template decision.
- Future runtime invoice sending/delivery requires explicit owner approval with Attachment/link policy decision.
- Future runtime invoice sending/delivery requires explicit owner approval with Opt-out or manual-send policy decision.
- Future runtime invoice sending/delivery requires explicit owner approval with Audit logging decision.
- Future runtime invoice sending/delivery requires explicit owner approval with Failure/retry handling decision.
- Future runtime invoice sending/delivery requires explicit owner approval with Provider-send disabled-until-approved proof.
- Future runtime invoice sending/delivery requires explicit owner approval with Admin/dispatcher/finance role-boundary proof.
- Future runtime invoice sending/delivery requires explicit owner approval with Customer and driver privacy proof.
- Future runtime invoice sending/delivery requires explicit owner approval with Rollback and kill-switch proof.
- Future runtime invoice sending/delivery requires explicit owner approval with One bounded evidence window.
- Future runtime invoice sending/delivery requires explicit owner approval with Env gate names only, with no env values or secrets printed.
- Future invoice sending/delivery approval must not imply: PDF generation.
- Future invoice sending/delivery approval must not imply: Payment link creation.
- Future invoice sending/delivery approval must not imply: Payment provider activation.
- Future invoice sending/delivery approval must not imply: Payment recording.
- Future invoice sending/delivery approval must not imply: Customer portal billing/payment activation.
- Future invoice sending/delivery approval must not imply: Payout/accounting/export.
- Future invoice sending/delivery approval must not imply: Billing automation writes.
- Each of those remains a separate finance sub-lane requiring later explicit owner approval.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- This packet does not approve runtime invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, PDF generation, PDF storage, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-monthly-invoice-sending-delivery-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Safe GET for Monthly Invoice Sending Delivery Approval Guard

- `origin/staging` was promoted from `41a7ab776e314b4e62bb6543d78bbfcfc92ab783` to `f5b8f4752c0affc25913fc4fb0741cebdcfa89de`.
- Staging includes `f5b8f47 Guard monthly invoice sending delivery approval`.
- `git ls-remote --heads origin staging` confirmed `f5b8f4752c0affc25913fc4fb0741cebdcfa89de` after push.
- A non-fatal local sandbox warning prevented updating the local `refs/remotes/origin/staging` tracking ref during push, so the remote hash source of truth for this record is `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Safe GET response included `Save Booking + CRM`, but it was not clicked.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- The staged commit remains docs/test-only guard work and does not approve runtime invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, PDF generation, payment links/provider, payment recording, payout/accounting/export, billing automation, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.

### Admin Monthly Invoice Payment Links Provider Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime payment link creation, payment provider setup, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice sending, PDF generation, payment recording, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.
- Admin Monthly Invoice Payment Links Provider is a future finance sub-lane.
- It remains blocked until explicit owner approval names this exact payment-links/provider-only lane.
- Payment links/provider is separate from: Invoice number reservation.
- Payment links/provider is separate from: Customer/company prefix and running-number policy.
- Payment links/provider is separate from: Invoice/PDF format approval.
- Payment links/provider is separate from: PDF generation.
- Payment links/provider is separate from: Invoice sending/delivery.
- Payment links/provider is separate from: Manual payment record/reconciliation.
- Payment links/provider is separate from: Payout/accounting/export.
- Payment links/provider is separate from: Billing automation.
- Payment links/provider is separate from: Customer portal billing/payment activation.
- Payment links/provider must not be bundled with invoice creation, PDF generation, invoice sending/delivery, payment recording, payout/accounting/export, billing automation, provider sends, customer messages, driver notifications, or production activation.
- Future payment links/provider work may only happen after staff has reviewed the customer, booking or monthly billing context, amount, currency, description, duplicate-link risk, payment status, and invoice or draft billing relationship.
- Future payment link creation must start in test mode only unless a later explicit live-mode approval is granted.
- Payment links must not be auto-sent immediately after creation.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing guarded routes stay `/api/admin-monthly-invoice-number-reservations` and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- The existing Stripe Test-Mode Payment-Link Workflow Plan remains planning-only and does not create payment records, payment links, checkout sessions, invoices, PDFs, webhook routes, API routes, Supabase rows, customer notifications, or customer-facing payment behavior.
- Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit payment-link sending approval.
- This packet does not add a duplicate UI sector/card/button, route, helper, or shim.
- Future runtime payment links/provider work requires explicit owner approval with: Exact staging target and commit hash proof.
- Future runtime payment links/provider work requires explicit owner approval with: Test-mode scope decision.
- Future runtime payment links/provider work requires explicit owner approval with: Provider decision.
- Future runtime payment links/provider work requires explicit owner approval with: Secret-handling plan.
- Future runtime payment links/provider work requires explicit owner approval with: Webhook security plan.
- Future runtime payment links/provider work requires explicit owner approval with: Idempotency and duplicate-link prevention plan.
- Future runtime payment links/provider work requires explicit owner approval with: Payment-status mapping decision.
- Future runtime payment links/provider work requires explicit owner approval with: Failure, expired, cancelled, unpaid, paid, refunded, and disputed state handling.
- Future runtime payment links/provider work requires explicit owner approval with: Disabled-by-default production posture.
- Future runtime payment links/provider work requires explicit owner approval with: Staff review and confirmation requirement.
- Future runtime payment links/provider work requires explicit owner approval with: No auto-send proof.
- Future runtime payment links/provider work requires explicit owner approval with: Admin/dispatcher/finance role-boundary proof.
- Future runtime payment links/provider work requires explicit owner approval with: Customer and driver privacy proof.
- Future runtime payment links/provider work requires explicit owner approval with: Rollback and kill-switch proof.
- Future runtime payment links/provider work requires explicit owner approval with: One bounded evidence window.
- Future runtime payment links/provider work requires explicit owner approval with: Env gate names only, with no env values or secrets printed.
- Future payment links/provider approval must not imply: Invoice creation.
- Future payment links/provider approval must not imply: Invoice number assignment or sequence increment.
- Future payment links/provider approval must not imply: PDF generation.
- Future payment links/provider approval must not imply: PDF storage.
- Future payment links/provider approval must not imply: Invoice sending/delivery.
- Future payment links/provider approval must not imply: Customer email, WhatsApp, or SMS sending.
- Future payment links/provider approval must not imply: Provider live send outside the exact approved payment provider lane.
- Future payment links/provider approval must not imply: Webhook status update activation.
- Future payment links/provider approval must not imply: Payment recording.
- Future payment links/provider approval must not imply: Customer portal billing/payment activation.
- Future payment links/provider approval must not imply: Payout/accounting/export.
- Future payment links/provider approval must not imply: Billing automation writes.
- Future payment links/provider approval must not imply: Stripe live mode.
- Each of those remains a separate finance sub-lane requiring later explicit owner approval.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- This packet does not approve runtime payment link creation, payment provider setup, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-monthly-invoice-payment-links-provider-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Safe GET for Monthly Invoice Payment Links Provider Approval Guard

- `origin/staging` was promoted from `adefd36848919b89d2420ed18a2d6bc88aced95d` to `6323a4c8005475ff6068d851a65cf0fddebaa889`.
- Staging includes `6323a4c Guard monthly invoice payment links provider approval`.
- `git ls-remote --heads origin staging` confirmed `6323a4c8005475ff6068d851a65cf0fddebaa889` after push.
- A non-fatal local sandbox warning prevented updating the local `refs/remotes/origin/staging` tracking ref during push, so the remote hash source of truth for this record is `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Safe GET response included `Save Booking + CRM`, but it was not clicked.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- The staged commit remains docs/test-only guard work and does not approve runtime payment link creation, payment provider setup, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.

### Admin Monthly Invoice Manual Payment Reconciliation Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime manual payment recording, reconciliation persistence, customer payment status changes, bank API access, bank scraping, automatic reconciliation, payment provider setup, payment link creation, invoice sending, PDF generation, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.
- Admin Monthly Invoice Manual Payment Reconciliation is a future finance sub-lane.
- It remains blocked until explicit owner approval names this exact manual-payment-reconciliation-only lane.
- Manual payment record/reconciliation is separate from: Invoice number reservation.
- Manual payment record/reconciliation is separate from: Customer/company prefix and running-number policy.
- Manual payment record/reconciliation is separate from: Invoice/PDF format approval.
- Manual payment record/reconciliation is separate from: PDF generation.
- Manual payment record/reconciliation is separate from: Invoice sending/delivery.
- Manual payment record/reconciliation is separate from: Payment links/provider.
- Manual payment record/reconciliation is separate from: Payout/accounting/export.
- Manual payment record/reconciliation is separate from: Billing automation.
- Manual payment record/reconciliation is separate from: Customer portal billing/payment activation.
- Manual payment record/reconciliation is separate from: Bank API, bank scraping, or automatic reconciliation.
- Manual payment record/reconciliation must not be bundled with invoice creation, PDF generation, invoice sending/delivery, payment links/provider, provider sends, payout/accounting/export, billing automation, customer messages, driver notifications, bank API access, automatic reconciliation, or production activation.
- Future manual payment record/reconciliation work may only happen after staff confirms funds outside the app through an approved business process.
- Manual payment recording must be staff-entered, auditable, and correction-safe.
- Bank wire/transfer remains manual-record only.
- This lane must not add bank API access, bank scraping, automatic matching, automatic paid status, provider status trust, or payment-link status trust.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing guarded routes stay `/api/admin-monthly-invoice-number-reservations` and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- The existing Customer Payments Workflow Design remains planning-only and does not approve a migration, app behavior change, payment provider, bank, notification, Supabase, or production implementation work.
- The existing Regular Customer Monthly Billing Workflow Plan keeps bank wire/transfer manual-record only and says no bank API, bank scraping, or automatic reconciliation is approved.
- Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit payment request or receipt sending approval.
- This packet does not add a duplicate UI sector/card/button, route, helper, or shim.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Exact staging target and commit hash proof.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Staff role and actor-boundary decision.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Payment evidence fields decision.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Customer-visible fields decision.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Payment status mapping decision.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Partial payment, paid, waived, refunded, reversal, and correction workflow decision.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Manual reference correction workflow.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Audit event requirements.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Duplicate-record and retry safety plan.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Bank API, bank scraping, and automatic reconciliation absent-proof.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Admin/dispatcher/finance role-boundary proof.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Customer and driver privacy proof.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Rollback and kill-switch proof.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: One bounded evidence window.
- Future runtime manual payment record/reconciliation work requires explicit owner approval with: Env gate names only, with no env values or secrets printed.
- Future manual payment record/reconciliation approval must not imply: Invoice creation.
- Future manual payment record/reconciliation approval must not imply: Invoice number assignment or sequence increment.
- Future manual payment record/reconciliation approval must not imply: PDF generation.
- Future manual payment record/reconciliation approval must not imply: PDF storage.
- Future manual payment record/reconciliation approval must not imply: Invoice sending/delivery.
- Future manual payment record/reconciliation approval must not imply: Customer email, WhatsApp, or SMS sending.
- Future manual payment record/reconciliation approval must not imply: Payment link creation.
- Future manual payment record/reconciliation approval must not imply: Payment provider activation.
- Future manual payment record/reconciliation approval must not imply: Webhook status update activation.
- Future manual payment record/reconciliation approval must not imply: Bank API access.
- Future manual payment record/reconciliation approval must not imply: Bank scraping.
- Future manual payment record/reconciliation approval must not imply: Automatic reconciliation.
- Future manual payment record/reconciliation approval must not imply: Automatic paid status.
- Future manual payment record/reconciliation approval must not imply: Customer portal billing/payment activation.
- Future manual payment record/reconciliation approval must not imply: Payout/accounting/export.
- Future manual payment record/reconciliation approval must not imply: Billing automation writes.
- Each of those remains a separate finance sub-lane requiring later explicit owner approval.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- This packet does not approve runtime manual payment recording, reconciliation persistence, customer payment status changes, bank API access, bank scraping, automatic reconciliation, payment provider setup, payment link creation, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-monthly-invoice-manual-payment-reconciliation-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Safe GET for Monthly Invoice Manual Payment Reconciliation Approval Guard

- `origin/staging` was promoted from `a1b7a985211a1f40485e75bf601813f1bca50dcb` to `445163328aa2b0fad3981e1dc89b29153d236ab8`.
- Staging includes `4451633 Guard monthly invoice manual payment reconciliation approval`.
- `git ls-remote --heads origin staging` confirmed `445163328aa2b0fad3981e1dc89b29153d236ab8` after push.
- A non-fatal local sandbox warning prevented updating the local `refs/remotes/origin/staging` tracking ref during push, so the remote hash source of truth for this record is `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Safe GET response included `Save Booking + CRM`, but it was not clicked.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- The staged commit remains docs/test-only guard work and does not approve runtime manual payment recording, reconciliation persistence, customer payment status changes, bank API access, bank scraping, automatic reconciliation, payment provider setup, payment link creation, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.

### Admin Monthly Payout Accounting Finance Export Approval Packet Lock

- This packet is docs/test-only.
- It does not approve runtime payout/accounting/export implementation, export file generation, accounting provider integration, payout payment execution, PayNow activation or send/payment, bank API access, bank scraping, provider sends, invoice sending, PDF generation, payment links/provider, payment recording, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.
- Admin Monthly Payout Accounting Finance Export is a future finance-only sub-lane.
- It remains blocked until explicit owner approval names this exact payout-accounting-finance-export-only lane.
- Payout/accounting/finance export is separate from: Invoice number reservation.
- Payout/accounting/finance export is separate from: Customer/company prefix and running-number policy.
- Payout/accounting/finance export is separate from: Invoice/PDF format approval.
- Payout/accounting/finance export is separate from: PDF generation.
- Payout/accounting/finance export is separate from: Invoice sending/delivery.
- Payout/accounting/finance export is separate from: Payment links/provider.
- Payout/accounting/finance export is separate from: Manual payment record/reconciliation.
- Payout/accounting/finance export is separate from: Customer billing/payment activation.
- Payout/accounting/finance export is separate from: Driver payout rules runtime writes.
- Payout/accounting/finance export is separate from: PayNow payout activation.
- Payout/accounting/finance export is separate from: Bank API, bank scraping, or accounting provider integration.
- Payout/accounting/finance export is separate from: Billing automation.
- Payout/accounting/finance export must not be bundled with invoice creation, PDF generation, invoice sending/delivery, payment links/provider, payment recording, provider sends, payout payment execution, PayNow send/payment, bank API access, accounting provider integration, customer messages, driver notifications, billing automation, or production activation.
- Future payout/accounting/finance export work may only happen after staff has reviewed monthly billing/payment context and explicit finance-only access rules are approved.
- Finance export must be internal/admin-finance only, audit-safe, correction-safe, and customer/driver-hidden.
- It must define exported fields, excluded fields, PayNow handling, accounting destination, export format, duplicate export prevention, correction/reversal workflow, audit requirements, rollback, and kill-switch behavior before runtime work.
- This lane must not execute payouts, trigger PayNow sends/payments, call bank APIs, scrape bank data, post accounting entries to external providers, trust provider status, update customer payment status, or expose payout/accounting/export details to customers or drivers.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.
- Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only.
- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing guarded routes stay `/api/admin-monthly-invoice-number-reservations` and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- Existing driver payout rules runtime guards remain separate and are not approval for month-end payout/accounting/export.
- `driver_payout_rules` covers company/traveler payout rule writes only and does not generate finance exports, execute payouts, activate PayNow, call accounting providers, or expose accounting export data.
- Existing manual payment reconciliation, payment links/provider, invoice sending, PDF generation, invoice prefix, and invoice/PDF format packets remain separate prerequisite or sibling lanes only.
- None of them approve payout/accounting/export runtime behavior.
- This packet does not add a duplicate UI sector/card/button, route, helper, or shim.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Exact staging target and commit hash proof.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Finance-only role and actor-boundary decision.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Exported fields decision.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Excluded customer/driver/internal fields decision.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: PayNow handling decision.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Accounting destination decision.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Export format decision, such as CSV or accounting-system-ready file.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Customer and driver visibility proof.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Duplicate export prevention plan.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Correction/reversal workflow decision.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Audit event requirements.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Accounting provider, bank API, bank scraping, payout payment execution, and PayNow activation absent-proof unless separately approved.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Admin/dispatcher/finance role-boundary proof.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Rollback and kill-switch proof.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: One bounded evidence window.
- Future runtime payout/accounting/finance export work requires explicit owner approval with: Env gate names only, with no env values or secrets printed.
- Future payout/accounting/finance export approval must not imply: Invoice creation.
- Future payout/accounting/finance export approval must not imply: Invoice number assignment or sequence increment.
- Future payout/accounting/finance export approval must not imply: PDF generation.
- Future payout/accounting/finance export approval must not imply: PDF storage.
- Future payout/accounting/finance export approval must not imply: Invoice sending/delivery.
- Future payout/accounting/finance export approval must not imply: Customer email, WhatsApp, or SMS sending.
- Future payout/accounting/finance export approval must not imply: Payment link creation.
- Future payout/accounting/finance export approval must not imply: Payment provider activation.
- Future payout/accounting/finance export approval must not imply: Webhook status update activation.
- Future payout/accounting/finance export approval must not imply: Manual payment recording.
- Future payout/accounting/finance export approval must not imply: Customer payment status changes.
- Future payout/accounting/finance export approval must not imply: Customer portal billing/payment activation.
- Future payout/accounting/finance export approval must not imply: Driver payout rules runtime writes.
- Future payout/accounting/finance export approval must not imply: Payout payment execution.
- Future payout/accounting/finance export approval must not imply: PayNow payout activation or send/payment.
- Future payout/accounting/finance export approval must not imply: Bank API access.
- Future payout/accounting/finance export approval must not imply: Bank scraping.
- Future payout/accounting/finance export approval must not imply: Accounting provider posting.
- Future payout/accounting/finance export approval must not imply: Billing automation writes.
- Each of those remains a separate finance sub-lane requiring later explicit owner approval.
- Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.
- Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.
- Future payout/accounting/finance export design, export files, audit payloads, correction workflow, accounting destination payloads, failure responses, and finance review screens must prove those customer/driver privacy boundaries before any runtime work.
- This packet does not approve runtime payout/accounting/export implementation, export file generation, CSV generation, accounting-system-ready file generation, accounting provider integration, accounting provider posting, payout payment execution, PayNow activation, PayNow send/payment, bank API access, bank scraping, payout automation, finance export, customer-visible finance changes, driver-visible finance changes, runtime manual payment recording, reconciliation persistence, customer payment status changes, payment provider setup, payment link creation, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, billing automation, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
- This lock adds `scripts/test-admin-monthly-payout-accounting-export-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Staging Safe GET for Monthly Payout Accounting Finance Export Approval Guard

- `origin/staging` was promoted from `c34ec6a99a9a8b74630c6cb0158ab4eaf07263d7` to `000f13eacafe431b1bc706bcae58e9725831c4fd`.
- Staging includes `000f13e Guard monthly payout accounting export approval`.
- `git ls-remote --heads origin staging` confirmed `000f13eacafe431b1bc706bcae58e9725831c4fd` after push.
- A non-fatal local sandbox warning prevented updating the local `refs/remotes/origin/staging` tracking ref during push, so the remote hash source of truth for this record is `git ls-remote`.
- Staging URL `https://prestige-limo-ops-staging.vercel.app/` returned HTTP 200 by safe GET.
- Safe GET response title was `Prestige Limo Ops`.
- Safe GET response included expected admin tab text: Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates.
- Safe GET response included `Save Booking + CRM`, but it was not clicked.
- No browser clicks were performed.
- No forms were submitted.
- No POST/write/send action was attempted.
- Screenshot captured: false.
- The staged commit remains docs/test-only guard work and does not approve runtime payout/accounting/export implementation, export file generation, CSV generation, accounting-system-ready file generation, accounting provider integration, accounting provider posting, payout payment execution, PayNow activation, PayNow send/payment, bank API access, bank scraping, payout automation, finance export, customer-visible finance changes, driver-visible finance changes, runtime manual payment recording, reconciliation persistence, customer payment status changes, payment provider setup, payment link creation, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, billing automation, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.

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
- Status Timing.
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

### Company/Traveler CRM Staging Write Gate Evidence
- Owner-approved bounded staging evidence pass completed for `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`.
- Staging target proof before the write window: Vercel project `prestige-limo-ops-staging`, URL `https://prestige-limo-ops-staging.vercel.app/`, and `origin/staging` / local HEAD both at `ded13cd7af32b18820cc474fac4f5b7ae95448a7` (`ded13cd Guard remote staging ledger branch head`).
- New evidence runner: `scripts/run-company-traveler-crm-staging-write-gate-verification.mjs`.
- Dry-run evidence passed before the DB write: staging root HTTP 200, `GET /api/admin-company-traveler-crm-runtime-write-action` returned HTTP 405, closed gate returned `blocked-503`, unsafe-field probe returned `rejected-400`, customer referer/public origin/wrong token probes returned `blocked-403`, and no live DB write was attempted.
- Live evidence used the ignored staging env file `.env.stage4a388.local`; env values and secrets were not printed, logged, committed, or echoed.
- The explicit approval env for the runner was `PRESTIGE_COMPANY_TRAVELER_CRM_STAGING_WRITE_VERIFICATION_APPROVED`; the approval value was used only for the command gate and is not stored in the ledger.
- The CRM write gate was opened in-process only for one bounded evidence window; no persistent Vercel env change, no production env change, and no production deployment was performed.
- The existing `POST /api/admin-company-traveler-crm-runtime-write-action` route/helper was used for the write proof; no direct raw SQL, Supabase CLI write, migration, new route, new shim, or UI change was used.
- Closed-gate proof before the write returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Boundary probes during the open in-process gate returned: customer referer `blocked-403`, public origin `blocked-403`, wrong token `blocked-403`, and unsafe fields `rejected-400`; the unsafe-field probe did not create a database client.
- Table/column write proof completed through the existing route helper for approved staging tables only: `companies` and `travelers`.
- Safe company create passed with returned safe company record id `23`; safe traveler create passed with returned safe traveler record id `21`; verification reference was `CRM-STAGING-20260620090814-9C0A0R`.
- Safe company fields were limited to `company_name`, `domain`, and returned `id`; safe traveler fields were limited to `company_id`, `traveler_name`, `preferred_vehicle`, `default_address`, `default_pickup_address`, `default_dropoff_address`, `booker_name`, `booker_contact`, `booker_email`, and returned `id`.
- Unsafe fields written: false. Rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, PayNow, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields were not written or exposed.
- Rollback/kill-switch proof passed after the write: the runner closed `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` in-process and the same route returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Deployed staging rollback proof passed after the local evidence window: real staging `POST /api/admin-company-traveler-crm-runtime-write-action` returned HTTP 503 with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, provider send, payment/PDF/pricing/payout activation, auth/location/photo/calendar activation, UI sector/button/card addition, new shim, or production activation was included.
- One bounded evidence window was used; the live marker prevents accidental repeat execution without manual review.

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

### Rate Settings Scalar Staging Write Gate Evidence
- Owner-approved bounded staging evidence pass completed for `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`.
- Staging target proof before the write window: Vercel project `prestige-limo-ops-staging`, URL `https://prestige-limo-ops-staging.vercel.app/`, and `origin/staging` / local HEAD both at `b3f858e774ed63180ab3cd47b026a0238b4f0c30` (`b3f858e Record CRM staging write gate evidence`).
- New evidence runner: `scripts/run-rate-settings-staging-write-gate-verification.mjs`.
- Dry-run evidence passed before the DB write: staging root HTTP 200, `GET /api/admin-rate-settings-runtime-write-action` returned HTTP 405, closed gate returned `blocked-503`, unsafe-field probe returned `rejected-400`, customer referer/public origin/wrong token probes returned `blocked-403`, and no live DB write was attempted.
- Dry-run performed a staging DB read of the existing `rate_settings` default row only to prevent accidental row creation and to build a same-value payload; env values and scalar values were not printed.
- Live evidence used the ignored staging env file `.env.stage4a388.local`; env values and secrets were not printed, logged, committed, or echoed.
- The explicit approval env for the runner was `PRESTIGE_RATE_SETTINGS_STAGING_WRITE_VERIFICATION_APPROVED`; the approval value was used only for the command gate and is not stored in the ledger.
- The rate settings write gate was opened in-process only for one bounded evidence window; no persistent Vercel env change, no production env change, and no production deployment was performed.
- The existing `POST /api/admin-rate-settings-runtime-write-action` route/helper was used for the write proof; no direct raw SQL, Supabase CLI write, migration, new route, new shim, or UI change was used.
- Closed-gate proof before the write returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Boundary probes during the open in-process gate returned: customer referer `blocked-403`, public origin `blocked-403`, wrong token `blocked-403`, and unsafe fields `rejected-400`; the unsafe-field probe did not create a database client.
- Table/column write proof completed through the existing route helper for approved staging table only: `rate_settings`.
- Safe default-row same-value scalar upsert passed for six safe scalar fields on `id: default`; business scalar values changed: false.
- Safe scalar fields were limited to `midnight_surcharge`, `extra_stop_surcharge`, `midnight_payout`, `extra_stop_payout`, `child_seat_customer_surcharge`, and `child_seat_driver_payout`, with `id` fixed to `default`.
- Unsafe fields written: false. `customer_rates`, `driver_payout_rules`, customer price/rate maps, rate overrides, pricing snapshots, payout snapshots, PayNow, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields were not written or exposed.
- Rollback/kill-switch proof passed after the write: the runner closed `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED` in-process and the same route returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Deployed staging rollback proof passed after the local evidence window: real staging `POST /api/admin-rate-settings-runtime-write-action` returned HTTP 503 with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, provider send, customer-rates activation, driver-payout-rules activation, payment/PDF/pricing/payout activation, auth/location/photo/calendar activation, UI sector/button/card addition, new shim, or production activation was included.
- One bounded evidence window was used; the live marker prevents accidental repeat execution without manual review.

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

### Customer Rates Staging Write Gate Evidence
- Owner-approved bounded staging evidence pass completed for `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.
- Staging target proof before the write window: Vercel project `prestige-limo-ops-staging`, URL `https://prestige-limo-ops-staging.vercel.app/`, and `origin/staging` / local HEAD both at `c3b517f779cbc960dafcbb4b737bf3862e59885e` (`c3b517f Record rate settings staging write gate evidence`).
- Evidence harness ran from `/private/tmp/prestige-customer-rates-staging-write-gate-verification.mjs`; no project route/helper/shim was added.
- Dry-run evidence passed before the DB write: staging root HTTP 200, `GET /api/admin-customer-rates-runtime-write-action` returned HTTP 405, closed gate returned `blocked-503`, unsafe-field probe returned `rejected-400`, customer referer/public origin/wrong token probes returned `blocked-403`, and no live DB write was attempted.
- Dry-run performed staging DB baseline reads for the approved columns only: `companies.customer_rates` and `travelers.customer_rates`; env values and rate values were not printed.
- Live evidence used the ignored staging env file `.env.stage4a388.local`; env values and secrets were not printed, logged, committed, or echoed.
- The explicit approval env for the runner was `PRESTIGE_CUSTOMER_RATES_STAGING_WRITE_VERIFICATION_APPROVED`; the approval value was used only for the command gate and is not stored in the ledger.
- The customer rates write gate was opened in-process only for one bounded evidence window; no persistent Vercel env change, no production env change, and no production deployment was performed.
- The existing `POST /api/admin-customer-rates-runtime-write-action` route/helper was used for the write proof; no direct raw SQL, Supabase CLI write, migration, new route, new project helper, new shim, or UI change was used.
- Closed-gate proof before the write returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Boundary probes during the open in-process gate returned: customer referer `blocked-403`, public origin `blocked-403`, wrong token `blocked-403`, and unsafe fields `rejected-400`; the unsafe-field probe did not create a database client.
- Table/column evidence stayed within approved staging scope: `companies.customer_rates` and `travelers.customer_rates` baseline reads succeeded; the single write proof targeted `companies.customer_rates`.
- Safe company same-value `customer_rates` update passed for keys `DEP`, `DSP`, `MNG`, and `TRF`; business values changed: false.
- Verification reference: `CUSTOMER-RATES-STAGING-20260620094804-A1CVYG`.
- Unsafe fields written: false. `driver_payout_rules`, driver payout, payout, PayNow, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields were not written or exposed.
- Rollback/kill-switch proof passed after the write: the runner closed `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED` in-process and the same route returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Deployed staging rollback proof passed after the local evidence window: real staging `POST /api/admin-customer-rates-runtime-write-action` returned HTTP 503 with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, provider send, rate settings change, CRM identity/contact repeat evidence, driver-payout-rules activation, payment/PDF/pricing/payout activation, auth/location/photo/calendar activation, UI sector/button/card addition, new shim, or production activation was included.
- One bounded evidence window was used; the live marker prevents accidental repeat execution without manual review.

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

### Driver Payout Rules Staging Write Gate Evidence
- Owner-approved bounded staging evidence pass completed for `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.
- Staging target proof before the write window: Vercel project `prestige-limo-ops-staging`, URL `https://prestige-limo-ops-staging.vercel.app/`, and `origin/staging` / local HEAD both at `a49dafbd0e803eb79f555475619091ff26abe76f` (`a49dafb Record customer rates staging write gate evidence`).
- Evidence harness ran from `/private/tmp/prestige-driver-payout-rules-staging-write-gate-verification.mjs`; no project route/helper/shim was added.
- Dry-run evidence passed before the DB write: staging root HTTP 200, `GET /api/admin-driver-payout-rules-runtime-write-action` returned HTTP 405, closed gate returned `blocked-503`, unsafe-field probe returned `rejected-400`, customer referer/public origin/wrong token probes returned `blocked-403`, and no live DB write was attempted.
- Dry-run performed staging DB baseline reads for the approved columns only: `companies.driver_payout_rules` and `travelers.driver_payout_rules`; env values and payout rule values were not printed.
- Live evidence used the ignored staging env file `.env.stage4a388.local`; env values and secrets were not printed, logged, committed, or echoed.
- The explicit approval env for the runner was `PRESTIGE_DRIVER_PAYOUT_RULES_STAGING_WRITE_VERIFICATION_APPROVED`; the approval value was used only for the command gate and is not stored in the ledger.
- The driver payout rules write gate was opened in-process only for one bounded evidence window; no persistent Vercel env change, no production env change, and no production deployment was performed.
- The existing `POST /api/admin-driver-payout-rules-runtime-write-action` route/helper was used for the write proof; no direct raw SQL, Supabase CLI write, migration, new route, new project helper, new shim, or UI change was used.
- Closed-gate proof before the write returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Boundary probes during the open in-process gate returned: customer referer `blocked-403`, public origin `blocked-403`, wrong token `blocked-403`, and unsafe fields `rejected-400`; the unsafe-field probe did not create a database client.
- Table/column evidence stayed within approved staging scope: `companies.driver_payout_rules` and `travelers.driver_payout_rules` baseline reads succeeded; the single write proof targeted `companies.driver_payout_rules`.
- Safe company same-value `driver_payout_rules` update passed through action `company_driver_payout_rules_update`; business values changed: false.
- Verification reference: `DRIVER-PAYOUT-RULES-STAGING-20260620102810-E8KAMJ`.
- Unsafe fields written: false. Customer pricing, `customer_rates`, rate settings, PayNow payout details, payout preferences, payment/PDF/billing, provider/send, auth/location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields were not written or exposed.
- Rollback/kill-switch proof passed after the write: the runner closed `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED` in-process and the same route returned `blocked-503` with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- Deployed staging rollback proof passed after the local evidence window: real staging `POST /api/admin-driver-payout-rules-runtime-write-action` returned HTTP 503 with `write_gate_closed`, `no_op: true`, `write_enabled: false`, and `database_client_enabled: false`.
- No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser or `/api/ai-parse` change, provider send, customer_rates change, rate settings change, CRM identity/contact repeat evidence, payment/PDF/pricing/payout execution, accounting export, auth/location/photo/calendar activation, UI sector/button/card addition, new shim, or production activation was included.
- One bounded evidence window was used; the live marker prevents accidental repeat execution without manual review.

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

### Full Driver Profile Five-Field Runtime Scope Fix
- Full Driver Profile staging write gate evidence was blocked because `updated_at` was present in the runtime write/select evidence path even though the approved activation scope is five safe operational fields only.
- The runtime write/select evidence path is tightened to `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`, with `id` used only as the existing driver record identifier.
- `updated_at` is not app-written, not selected for the runtime evidence response, and is defensively stripped from the helper write payload before return.
- The activation readiness guard now treats `updated_at` as forbidden evidence scope and enforces the five-field write/select boundary.
- Full Driver Profile staging write gate evidence was unblocked by the fresh no-edit readiness audit and completed in the evidence pass recorded below.
- This fix does not open `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`, run a DB write/delete/read evidence window, change env, deploy, touch provider/send, parser, Save Booking + CRM, `/api/admin-saved-bookings`, pricing, customer rates, driver payout rules, payout execution, payment/PDF/billing, auth/location/photo/calendar, UI sectors/cards/buttons, or shims.

### Full Driver Profile Staging Write Gate Evidence
- Gate: `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.
- Target: `https://prestige-limo-ops-staging.vercel.app`; project: `prestige-limo-ops-staging`.
- Staging root returned HTTP 200.
- Safe GET to `/api/admin-full-driver-profile-runtime-write-action` returned HTTP 405, confirming the approved route remains POST-only.
- Approved route/helper used: `POST /api/admin-full-driver-profile-runtime-write-action` and `lib/admin-full-driver-profile-runtime-write-action.ts`.
- Table/policy proof: `public.drivers` safe columns only accepted one same-value update through the existing route/helper; no driver field values or secrets were printed.
- Safe fields were limited to `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`, with `id` used only as the existing driver record identifier.
- Rollback proof passed: closed before returned `blocked-503`, closed after returned `blocked-503`, and deployed staging closed-gate proof returned `blocked-503`.
- Privacy/boundary proof passed: customer referer returned `blocked-403`, public origin returned `blocked-403`, wrong token returned `blocked-403`, and forbidden fields returned `rejected-400`.
- `updated_at` exclusion proof passed: `updated_at` was not selected, not returned, and not written.
- Write window was in-process only with no persistent env change.
- Evidence write performed exactly one same-value safe driver update.
- Business values changed: false.
- Write response: HTTP 200 / `saved`.
- Evidence reference: `FULL-DRIVER-PROFILE-STAGING-20260620114037-X4GYRF`.
- Boundary confirmations: no production deploy, no raw SQL, no Supabase CLI write, no migration, no provider send, no parser, no Save Booking, no `/api/admin-saved-bookings`, no pricing, no `customer_rates`, no `driver_payout_rules`, no payout preferences, no payout execution, no payment/PDF/billing, no auth/location/photo/calendar, no UI sector/card/button, and no shim path was used.
- No repo files changed during the runtime evidence pass; the temporary evidence runner existed only under `/private/tmp`.
- Required post-evidence checks passed before this docs-only record: `node scripts/test-full-driver-profile-runtime-activation-readiness-guard.mjs`, `node scripts/test-full-driver-profile-runtime-write-action-api-contract.mjs`, `node scripts/test-remaining-shim-parked-state-lock.mjs`, `node scripts/test-shim-cleanup-no-new-shim-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `npm run lint`, `npm run build`, `git diff --check`, `git diff --cached --check`, and `git status --short`.

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
- Approval status: superseded for Driver Details Email by the gated send action contract; setup foundations remain setup-only/no-live.
- This is a docs/test-only no-send approval packet guarded by `scripts/test-email-provider-no-send-approval-packet.mjs`.
- Current Email setup routes remain setup-only/no-live:
  `GET /api/admin-customer-driver-details-email-preview-readiness-setup`,
  `GET /api/admin-customer-driver-details-email-review-item-setup`,
  `GET /api/admin-customer-driver-details-email-send-disabled-setup`,
  `GET /api/admin-email-provider-readiness-setup`,
  `GET /api/admin-email-provider-selection-setup`, and
  `GET /api/admin-email-activation-preflight-setup`.
- The setup-only disabled Email send surface remains available as a no-op audit/setup route with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.
- The admin Customer Copy Email button now uses the separate gated Driver Details Email route `POST /api/admin-customer-driver-details-email-send-action`.
- No provider env values are printed, required, or read by the current Email setup-only routes/helpers.
- No SMTP provider, SMS, WhatsApp, Telegram customer/driver send, automatic fallback, batch send, scheduler, polling, or retry automation is approved by this setup packet.
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

### Email Provider Staging Send Safety Contract Lock
- This is a docs/test-only guard for a future separately approved one-message staging Email send evidence pass.
- This lock does not activate Email sending, provider credentials, provider SDKs, SMTP/API calls, env changes, deployment, DB read/write, or live send behavior.
- Future Email provider handling must list env names only; env values, secrets, API keys, SMTP passwords, access tokens, provider tokens, and connection strings must never be printed, logged, committed, echoed, or surfaced.
- A recipient allowlist is required before any future staging Email send evidence pass.
- Future Email send content must exclude pricing, payout, payment/PDF/billing, auth/location/photo/calendar/OTS, parser/internal debug, internal notes, secrets/tokens, `customer_rates`, and `driver_payout_rules`.
- Future staging Email send scope must be exactly one message only; batch send, resend automation, scheduler, polling, retry loop, customer-visible auto-refresh, and background sends remain forbidden.
- Future staging Email send evidence requires explicit owner approval naming the staging target, provider, env-name handling, allowlisted recipient, content fixture, one-message boundary, rollback/disable proof, and checks.
- Future Driver Details Email may be app-sent through Resend only when admin explicitly clicks the Email action, the exact Email driver-details gate is approved/opened, and staging recipient allowlist proof passes; this does not approve Telegram/WhatsApp provider sends.
- Rollback/disable proof is required after any future send evidence; the provider gate must be closed again and disabled/no-op behavior must be verified.
- Future Email may include an admin-selected secure tracking-link live-location email only after separate owner approval for that exact channel/action gate.
- Email must not auto-send live location, must not send native/streaming live location, and must not be the future automatic live-location channel.
- No provider activation or provider send is approved by this guard.

### Owner Domain Email Provider Setup Safety Contract Lock
- This is a docs/test-only guard for future owner-domain outbound Email setup before any SMTP/API/provider activation or one-message staging send evidence.
- This lock does not activate Email sending, provider credentials, provider SDKs, SMTP/API calls, IMAP login/test, DNS changes, env changes, deployment, DB read/write, runtime API behavior, UI, route/helper changes, or live send behavior.
- Future app Email must use owner-domain email addresses.
- Owner domain for the first Driver Details Email lane is `prestigelimo.sg`.
- Selected first Driver Details Email provider is Resend.
- Owner-confirmed external Resend setup: `prestigelimo.sg` domain verification is completed externally in Resend for the Tokyo region, with no DNS record values, secrets, API keys, passwords, tokens, cookies, env values, or provider credentials recorded.
- This owner-confirmed domain verification does not activate Resend credentials, provider sends, Email sends, env changes, DNS changes, API key creation/use, deployment, DB read/write, SMTP/IMAP login, or one-message evidence.
- Future outbound Driver Details Email uses the Resend API later only after separate owner approval, staging recipient allowlist proof, one-message evidence approval, and rollback/disable proof.
- Selected Driver Details Email From is `Prestige Limo Dispatch <info@prestigelimo.sg>`.
- Selected Driver Details Email Reply-To is `info@prestigelimo.sg`.
- Existing `info@prestigelimo.sg` remains usable for normal business email and cPanel inbox/replies through IMAP/webmail.
- No `dispatch@prestigelimo.sg` mailbox is required for this first Driver Details Email lane.
- Future Invoice Email sender is billing@<owner-domain>, but invoice email remains a separate billing lane.
- Outbound app Email must use an approved Email API or separately approved SMTP lane; the first Driver Details Email lane selects Resend API.
- IMAP is receive-only and must never be treated as a send mechanism.
- cPanel may remain the inbox/reply mailbox system through IMAP or webmail only.
- cPanel SMTP is not the selected first Driver Details Email provider.
- SES, SendGrid, Mailgun, and cPanel SMTP require separate future owner approval before any use.
- Future env names are names only and no env values, secrets, API keys, SMTP passwords, IMAP passwords, provider tokens, DNS secret values, or connection strings may be printed, logged, committed, echoed, or surfaced.
- Future env names only for the first Resend Driver Details Email lane: PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED, PRESTIGE_EMAIL_PROVIDER, PRESTIGE_DRIVER_DETAILS_EMAIL_FROM, PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO, PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST, RESEND_API_KEY.
- Future DNS/auth proof requires owner-domain verification, SPF, DKIM, DMARC, Resend/domain alignment, sender address proof, and reply inbox proof, with names only and no secret values.
- A staging recipient allowlist is required before any future one-message staging Driver Details Email send evidence.
- Future Driver Details Email staging evidence must be one-message-only.
- One-message Resend evidence remains blocked until separate owner approval for staging env setup, recipient allowlist proof, send-gate opening, one bounded message, rollback/disable proof, and checks.
- Future rollback/disable proof must close the send gate, verify the disabled/no-op route, prove no follow-up send, and keep provider credentials non-live unless separately approved.
- Driver-details Email must not imply invoice/PDF/payment/billing activation.
- Invoice Email remains a separate billing lane, and billing@<owner-domain> may be used later only after separate billing/invoice approval.
- Email may later send admin-selected secure tracking-link live location only; Email must not auto-send live location and must not send native/streaming live location.
- Telegram remains the first future true live-location channel; Telegram POB plus 5 minute auto-stop remains future-only and is not implemented by this lock.
- No provider activation, provider send, Email send, SMTP login/test, IMAP login/test, DNS change, env change, DB read/write, deploy, parser change, Save Booking change, `/api/admin-saved-bookings` change, pricing/rates/customer_rates change, driver_payout_rules change, payout/payment/PDF/billing change, auth/location/photo/calendar/OTS change, UI sector/card/button change, or shim change is approved by this lock.
- This lock adds `scripts/test-owner-domain-email-provider-setup-safety-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Resend Driver Details Email Gated Send Contract Lock
- This is a bounded gated route/helper contract for explicit admin-selected Driver Details Email sends; it does not change provider credentials, env values, DNS, deployment, DB reads/writes, SMS/WhatsApp/Telegram sends, or automatic multi-channel behavior.
- Approved route is `POST /api/admin-customer-driver-details-email-send-action`.
- Approved server-only helper is `lib/admin-customer-driver-details-email-send-action.ts`.
- Gate is `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED`, closed by default.
- Selected provider is Resend.
- Selected Driver Details Email From is `Prestige Limo Dispatch <info@prestigelimo.sg>`.
- Selected Driver Details Email Reply-To is `info@prestigelimo.sg`.
- Future env names only for this lane are `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED`, `PRESTIGE_EMAIL_PROVIDER`, `PRESTIGE_DRIVER_DETAILS_EMAIL_FROM`, `PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO`, `PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST`, and `RESEND_API_KEY`.
- Env values, API keys, SMTP passwords, IMAP passwords, DNS secrets, provider tokens, raw provider payloads, and debug/internal fields must never be printed, logged, committed, echoed, or surfaced.
- Closed-gate behavior returns safe 503/no-op, does not read `RESEND_API_KEY`, does not read provider credentials, does not instantiate a Resend SDK/client, and does not make an external Resend request.
- Closed-gate same-origin admin-surface probes may return the safe 503/no-op before session-token handling so staging can prove the gate is closed without asking the owner to paste cookies, passwords, session tokens, API keys, or secrets.
- Public/missing-boundary requests remain safe 403/no-op, and the admin/dispatcher server-session boundary remains required for every gate-open send path before provider config, allowlist, API key read, or Resend call. Same-origin dashboard POSTs may use the server-session role boundary without exposing a private request token to the browser.
- Missing provider configuration returns safe 503/no-op without exposing secrets or values.
- Invalid or forbidden payload fields return safe 400/no-op.
- Recipient allowlist is required before any future staging evidence; non-allowlisted recipients return safe 403/no-op.
- Email send remains an explicit admin-selected Email action only; it must not auto-send, fallback, batch, blast, or trigger Telegram/WhatsApp/SMS provider sends.
- Future send scope is one-message-only; batch send, automatic fallback, automatic multi-channel blast, scheduler, cron, queue, polling loop, server retry loop, resend automation, and customer-visible auto-refresh remain forbidden.
- Payload is limited to CUSTOMER BOOKING DETAILS and DRIVER DETAILS sections only.
- Allowed customer booking detail source fields include customer/passenger/traveler name when available, but the customer-facing label `Passenger name:` must be used; other allowed fields are booking reference, service type, pickup date, pickup time, pickup location, drop-off location, passenger count, and customer-facing flight number.
- Allowed driver-detail fields are driver name, driver contact, car plate, and car type.
- The canonical route/helper payload field for customer/passenger/traveler name is `customer_passenger_traveler_name`; when present, it is used in the greeting and CUSTOMER BOOKING DETAILS only, with customer-facing label `Passenger name:`.
- Copy polish after `9b5c8d3 Record driver details email staging send evidence`: future generated Driver Details Email body and Customer Copy preview output use customer-facing label `Passenger name:`. This is copy polish only; it does not run another staging Email evidence send, does not activate a provider, and does not change the Resend send gate.
- Customer-facing payloads must exclude pricing, payout, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing/invoice details, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/location/photo/calendar/OTS data, and mock/dev archive fields.
- Successful future send response must be normalized and may expose only safe status, selected provider, safe message id, one-provider-request count, and no raw provider response, headers, secrets, debug/internal fields, customer price, billing, payout, notes, or mock archive fields.
- Provider failure/timeout responses must be sanitized 502/504-style failures with no raw provider payload, token, header, stack, secret, customer price, billing, payout, note, or debug exposure.
- This lane does not add a Resend SDK/package dependency and uses no SMTP, IMAP, Telegram, WhatsApp, SMS, FlightAware, live location, billing/payment/PDF, payout, pricing/rates/customer_rates, driver_payout_rules, parser, Save Booking, `/api/admin-saved-bookings`, auth/location/photo/calendar/OTS, UI sector/card/button, or shim activation.
- Wider live evidence or production recipient expansion remains blocked until separate owner approval names the target, provider, recipient allowlist/env-name handling, content fixture, send boundary, and rollback/disable proof.
- Rollback/disable proof after any future evidence must close the gate and verify disabled/no-op behavior with no follow-up send.
- Staging public boundary no-send smoke for `6e80fba Guard customer name and channel split in driver details email contract` is recorded: staging root GET returned HTTP 200 with title `Prestige Limo Ops`; public/dummy POST to `POST /api/admin-customer-driver-details-email-send-action` returned HTTP 403 safe no-op with `email_send_enabled: false`, `external_send: false`, `no_op: true`, and `ok: false`.
- Public boundary proof passed for the Resend Driver Details Email route; no Email was sent, no Resend call was made, no env/API key was used, and no credentials were exposed.
- Same-origin admin-surface closed-gate HTTP 503 proof replaces the prior token-handling blocker: Codex must not ask the owner to paste passwords, cookies, session tokens, API keys, or secrets just to prove the gate is closed.
- Staging same-origin admin-surface closed-gate smoke for `81d91ec Guard driver details email closed gate smoke path` is completed: staging root GET returned HTTP 200 with title `Prestige Limo Ops`; same-origin admin-surface POST to `POST /api/admin-customer-driver-details-email-send-action` returned HTTP 503 safe no-op after the staging deployment became current, with `reason: email_send_gate_closed`, `email_send_enabled: false`, `external_send: false`, `no_op: true`, `provider_request_count: 0`, `database_persistence_enabled: false`, `notification_table_write_enabled: false`, `scheduler_enabled: false`, `retry_enabled: false`, `polling_enabled: false`, `fallback_enabled: false`, `blast_enabled: false`, `batch_send_enabled: false`, `invoice_email_enabled: false`, and `live_location_email_enabled: false`.
- Same-origin closed-gate proof passed for the Resend Driver Details Email route; no Email was sent, no Resend call was made, no env/API key was used, no provider credentials were required, and no credentials were exposed.
- One-message Resend staging evidence is no longer blocked by the closed-gate 503 proof, but it still requires separate owner approval, Resend/provider configuration, staging recipient allowlist proof, send-gate opening approval, rollback/disable proof, and the normal admin/dispatcher server-session boundary before any real send.
- One-message Resend Driver Details Email staging evidence is completed for staging target `3d8b8d9 Record Resend domain verification for driver details email`; evidence reference `DRIVER-DETAILS-EMAIL-STAGING-20260621185103`. The evidence used the approved staging recipient allowlist `info@prestigelimo.sg`, opened `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED` only for one bounded staging deployment window, sent exactly one Driver Details Email through `POST /api/admin-customer-driver-details-email-send-action`, received HTTP 200 with `status: sent`, `reason: send_succeeded`, `external_send: true`, and `provider_request_count: 1`, and then immediately closed the gate and redeployed. Rollback/disable proof after the window returned HTTP 503 safe no-op with `reason: email_send_gate_closed`, `email_send_enabled: false`, `external_send: false`, `no_op: true`, and `provider_request_count: 0`. No API key, env value, token, password, cookie, DNS value, or provider credential was printed or recorded; no batch, retry, scheduler, polling, fallback, blast, DB persistence, notification table write, invoice email, live-location email, Telegram/WhatsApp/SMS send, payment/PDF/billing, pricing/rates/customer_rates, driver_payout_rules, payout, parser, Save Booking, `/api/admin-saved-bookings`, auth/location/photo/calendar/OTS, UI, or shim behavior was activated.
- Owner inbox/content confirmation for evidence reference `DRIVER-DETAILS-EMAIL-STAGING-20260621185103` is recorded: the Email arrived and was opened in `info@prestigelimo.sg`; From displayed as `Prestige Limo Dispatch <info@prestigelimo.sg>`; Reply-To displayed as `info@prestigelimo.sg`; the subject displayed as Driver details for the staging booking reference; the body included `CUSTOMER BOOKING DETAILS` and `DRIVER DETAILS`, passenger/customer/traveler name, booking reference, service type, pickup date/time/location, drop-off location, passenger count, customer-facing flight number, driver name, driver contact, car plate, and car type. Owner confirmed no forbidden pricing, payout, PayNow, payment/PDF/billing, `customer_rates`, `driver_payout_rules`, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, or `/api/admin-saved-bookings` internals were visible. The received evidence Email used the pre-polish name label at send time; future generated Driver Details Email body and Customer Copy preview output use `Passenger name:` after `3bfe8a7 Polish driver details passenger name label`. No resend is required for the label polish.
- Contract guards: `scripts/test-admin-customer-driver-details-email-send-action-api-contract.mjs`; exact POST-route exception registered in `scripts/test-global-preactivation-no-live-guard.mjs`; suite registration in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Notification Channel Matrix Lock
- This is a docs/test-only guard for future customer notification channel selection; it does not activate provider sends, credentials, env changes, DB reads/writes, deployment, UI, API, route, helper, scheduler, fallback, or blast behavior.
- Telegram may be used for true live location only after the specific channel/action gate is separately approved, and may use generated/copied driver details for manual admin send outside the app for now.
- Telegram is the first future live-location channel and the only future channel allowed to auto-send true live location after separate owner approval.
- Future Telegram auto-send and POB plus 5 minute auto-stop are requirements for a later lane only; this lock does not implement or activate them.
- Email may be used for app-sent driver details through Resend only after admin explicitly clicks the Email action and the specific Email driver-details gate is separately approved/opened.
- Email may send an admin-selected secure tracking-link live-location email only after the exact channel/action gate is separately approved.
- Email must not auto-send live location and must not send native/streaming live location.
- WhatsApp may use generated/copied driver details for manual admin send outside the app for now; WhatsApp provider/API sending and WhatsApp live location remain later-phase only and must remain unactivated.
- SMS is not approved for driver details or live location unless separately approved later.
- Admin must explicitly choose exactly one channel/action for each future send, except for the future separately approved Telegram auto-send lane.
- No automatic fallback is approved.
- No automatic multi-channel blast is approved.
- No provider send is approved unless that specific channel/action gate is separately approved.
- Future admin choices remain separated: Send driver details by Email through the gated Resend action; Generate/copy driver details for Telegram manual send; Generate/copy driver details for WhatsApp manual send; Send true live location by Telegram; Send secure tracking-link live location by Email; later-phase Send live location by WhatsApp.
- Telegram driver-details and WhatsApp driver-details currently mean generated/copied/manual-send only; Telegram live location means future true live-location send, Email live location means future admin-selected secure tracking link only, and WhatsApp live location means future later phase only.
- Allowed driver-detail payload fields are driver name, driver contact, car plate, and car type.
- Customer-facing provider messages must exclude pricing, payout, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, and auth/location/photo/calendar/OTS data outside the selected approved lane.
- Driver details messages must stay separate from payout, payout preferences, `driver_payout_rules`, `customer_rates`, pricing, payment/PDF/billing, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, and `/api/admin-saved-bookings` internals.

### Customer/Driver In-App Notification Admin-Selected Channel Contract Lock
- This is a docs/test-only guard for future customer/driver in-app notification channel selection; it does not activate runtime UI, provider sends, credentials, env changes, DB reads/writes, deployment, route/helper behavior, scheduler, fallback, or blast behavior.
- Existing foundations to reuse are `POST /api/admin-customer-driver-app-notifications`, `GET/PATCH /api/customer-app-notifications`, `GET/PATCH /api/driver-job/[token]/notifications`, and `lib/customer-driver-app-notification-persistence.ts`.
- Future admin choices must stay separated: Send in-app to customer; Send in-app to driver; Send driver details by Email through the gated Resend action; Generate/copy driver details for Telegram manual send; Generate/copy driver details for WhatsApp manual send.
- Future In-app buttons must be compact controls aligned in the same Customer Copy action row as Email, Telegram, and WhatsApp/WA choices; no giant cards, no duplicate UI sectors, no duplicate cards, and no duplicate provider-send panels are approved.
- Future in-app notification controls must reuse the existing Customer Copy area and existing compact customerCopy preview/copy/edit controls where possible.
- Admin must explicitly choose exactly one channel/action for each future in-app message.
- No automatic fallback is approved.
- No automatic multi-channel blast is approved.
- No provider send is approved for in-app notifications; in-app notification is a separate app-visible message path, not Email, Telegram, WhatsApp, SMS, Resend, SMTP, IMAP, or provider delivery.
- Customer app notification read remains blocked until secure customer auth/portal read is separately approved; customer-visible in-app notification runtime must not bypass customer auth.
- Driver app notification read may use the existing driver job token notification route, but future driver-visible messages must stay scoped to the verified driver job link or safe booking reference.
- Future persistence requires separate owner approval, table/policy proof for `customer_driver_app_notification_outbox`, rollback/disable proof, and no secret/env value printing before any staging DB write.
- Allowed in-app notification records remain limited to booking reference, delivery surface, notification type/status, priority, safe title/message/context, workflow area, id, and created/updated timestamps.
- Driver-details in-app message content must use the approved CUSTOMER BOOKING DETAILS and DRIVER DETAILS payload contract when sending driver details.
- Customer/driver in-app messages must exclude pricing, payout, PayNow payout, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/location/photo/calendar/OTS data outside the selected approved lane, live-location streaming payloads, and mock QA/dev archive fields.
- This lock does not approve Google Maps, OneMap retry, live location, auth activation, provider sends, env changes, DB writes, Save Booking changes, `/api/admin-saved-bookings` changes, parser changes, pricing/rates/customer_rates changes, driver_payout_rules changes, payout/payment/PDF/billing changes, UI sector/card expansion, or new shims.
- This lock adds `scripts/test-customer-driver-in-app-notification-channel-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Status to Customer In-App Automatic Notification Readiness Contract Guard Lock
- Driver Status -> Customer In-App automatic notification fanout is implemented through the verified driver job status route only.
- The fanout runs after a persisted `driver_job_status_events` update is accepted for the verified driver job token and queues one fixed safe `customer_app` notification for the same booking/customer scope.
- Fanout is best-effort; a customer notification insert failure must not undo or hide the accepted driver status event.
- OTW status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.
- OTW title: `Driver is on the way`.
- OTW message: `Your Prestige Limo driver is on the way to pickup.`
- OTS status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.
- OTS title: `Driver has arrived`.
- OTS message: `Your Prestige Limo driver is at the pickup location.`
- POB status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.
- POB title: `Passenger on board`.
- POB message: `Your trip has started.`
- Job Completed status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.
- Job Completed title: `Trip completed`.
- Job Completed message: `Your trip is completed. Thank you for choosing Prestige Limo.`
- Status-triggered customer notifications must be template-only.
- Status-triggered customer notifications must use the guarded driver status workflow `driver_otw -> ots -> pob -> completed`.
- Status-triggered customer notifications must use persisted status evidence and must not rely on local/demo/mock UI state, customer-visible status text, localStorage, or untrusted browser-submitted status history.
- Customer-visible reads must stay behind the existing Customer In-App read path and customer/account isolation.
- The customer must see only their own booking notification.
- Admin/dispatch must be able to see the status-triggered in-app notification/audit trail through approved admin surfaces.
- POB must stop any future pre-POB customer-driver quick replies for that job.
- No phone number exposure is approved.
- No Email, Resend, Telegram, WhatsApp, SMS, SMTP, IMAP, push provider, fallback, scheduler, retry, or blast is approved by this lock.
- The Dashboard driver report readout keeps the existing guarded 10-second polling fallback while driver status writes and customer-app fanout happen server-side when the driver presses OTW, OTS, POB, or Job Completed.
- Customer-driver quick replies are a later separate lane, not implemented by this guard.
- Future customer-to-driver quick reply templates are limited to `I am at the lobby.`, `I am running 5 minutes late.`, `Please wait at pickup point.`, and `I cannot find the car.` unless separately approved.
- Future driver-to-customer quick reply templates are limited to `I am on the way.`, `I have arrived.`, `Please meet me at pickup point.`, and `I am waiting nearby.` unless separately approved.
- Future quick replies must be in-app only, job-token scoped, customer/account scoped, visible to admin/dispatch, audited, disabled automatically at POB, and must not expose phone numbers.
- No free-form customer-driver text is approved until a later explicit approval.
- Forbidden fields remain pricing, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/GPS coordinates, OTS/photo/storage, calendar, customer/driver phone numbers, customer/driver private contact data, and mock QA/dev archive fields.
- This guard adds `scripts/test-driver-status-customer-in-app-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer/Driver Quick Replies Readiness Contract Guard Lock
- This is a docs/test-only guard for future Customer/Driver Quick Replies.
- This lock does not implement runtime quick replies, notification writes, DB writes, provider sends, Email/Telegram/WhatsApp/SMS, free-form chat, auth/session changes, env changes, deploys, GPS/location activation, billing/payment/PDF/payout, or production activation.
- Future Customer -> Driver quick replies are limited to exactly four fixed templates: `I am at the lobby.`, `I am running 5 minutes late.`, `Please wait at pickup point.`, and `I cannot find the car.`
- Future Driver -> Customer quick replies are limited to exactly four fixed templates: `I am on the way.`, `I have arrived.`, `Please meet me at pickup point.`, and `I am waiting nearby.`
- Quick replies must be in-app only.
- Quick replies must be job-token scoped for the driver side.
- Quick replies must be customer/account scoped for the customer side.
- Quick replies must be scoped to the correct booking and must not cross bookings, customers, accounts, drivers, or driver job links.
- Quick replies must be visible to admin/dispatch through approved admin surfaces.
- Quick replies must be audited with safe operational metadata only.
- Quick replies must be disabled automatically at POB for that job.
- Quick replies must not expose customer or driver phone numbers, email addresses, chat IDs, device identifiers, or private contact details.
- No free-form customer-driver text is approved until a later explicit owner approval.
- No provider send is approved for quick replies; quick replies are not Email, Resend, Telegram, WhatsApp, SMS, SMTP, IMAP, push provider, fallback, scheduler, retry, polling, or blast.
- Future Customer -> Driver quick replies must be visible only through the driver job token notification/read path or a separately approved equivalent driver-token-scoped in-app path.
- Future Driver -> Customer quick replies must be visible only through the customer in-app read path and customer/account isolation.
- Future quick-reply evidence must prove customer-to-driver send/read, driver-to-customer send/read, admin/dispatch visibility, audit proof, wrong-customer blocked, wrong-driver blocked, wrong-booking blocked, anonymous blocked, post-POB blocked, cleanup/zero-row proof, and rollback disabled proof.
- Forbidden fields remain pricing, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/GPS coordinates, OTS/photo/storage, calendar, customer/driver phone numbers, customer/driver private contact data, chat IDs, device identifiers, and mock QA/dev archive fields.
- This guard adds `scripts/test-customer-driver-quick-replies-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer/Driver Quick Replies Disabled Runtime Scaffold Lock
- This lane adds a disabled-by-default runtime scaffold for fixed Customer/Driver Quick Replies only.
- This lane does not run quick-reply evidence, open env gates, change env values, deploy, activate runtime, add UI, write DB rows, activate GPS/location, send providers, send Email/Telegram/WhatsApp/SMS, activate billing/payment/PDF/payout, expose secrets/private data, or activate production.
- Quick replies remain closed unless `PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED=true` and `PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE=controlled-runtime`.
- The customer runtime/account gates remain required: `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`, existing customer saved-bookings session env names, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Closed quick-reply gate returns a safe no-op response with `external_send: false`, `provider_send: false`, no provider send, no notification row write, and no Supabase client access.
- Customer -> Driver route scaffold: `POST /api/customer-driver-quick-replies`.
- Customer -> Driver requires same-origin `/my-bookings`, `x-prestige-customer-purpose: customer-driver-quick-reply`, existing customer saved-bookings session/account boundary, controlled-runtime account allowlist, and a booking reference scoped to that customer/account.
- Customer -> Driver can later write only one `driver_app` outbox notification through `customer_driver_app_notification_outbox` with fixed safe title `Passenger reply`.
- Customer -> Driver fixed templates are exactly: `I am at the lobby.`, `I am running 5 minutes late.`, `Please wait at pickup point.`, and `I cannot find the car.`
- Driver -> Customer route scaffold: `POST /api/driver-job/[token]/quick-replies`.
- Driver -> Customer requires the existing driver job token boundary, the token-scoped booking reference, controlled-runtime customer account allowlist, and the customer/account mapped to that booking.
- Driver -> Customer can later write only one `customer_app` outbox notification through `customer_driver_app_notification_outbox` with fixed safe title `Driver reply`.
- Driver -> Customer fixed templates are exactly: `I am on the way.`, `I have arrived.`, `Please meet me at pickup point.`, and `I am waiting nearby.`
- Both directions are in-app only, job/booking scoped, customer/account scoped, admin/dispatch visible through approved admin notification surfaces, and audited with safe operational metadata only.
- Both directions must check the latest persisted `driver_job_status_events` status and block when the job has reached `pob` or `completed`.
- No free-form message composer, textarea, customer-driver chat box, phone number exposure, customer/driver private contact exposure, WhatsApp/Telegram/SMS/Email provider fallback, scheduler, retry, polling, or blast is approved.
- Forbidden fields remain pricing, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/GPS coordinates, OTS/photo/storage, calendar, customer/driver phone numbers, customer/driver private contact data, chat IDs, device identifiers, and mock QA/dev archive fields.
- Future quick-reply evidence remains separate and must prove customer-to-driver send/read, driver-to-customer send/read, admin/dispatch visibility, audit proof, wrong-customer blocked, wrong-driver blocked, wrong-booking blocked, anonymous blocked, post-POB blocked, cleanup/zero-row proof, and rollback disabled proof before any live use.
- This scaffold is guarded by `scripts/test-customer-driver-quick-replies-runtime-scaffold-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.

### Customer/Driver App Compact Surface Polish Lock
- This lane compacts the existing Customer Portal and Driver Job app surfaces only.
- No runtime route, helper, DB, env, provider-send, GPS/location, billing/payment/PDF/payout, or production activation behavior is changed.
- Customer Portal keeps the same `/my-bookings` request, search, pagination, detail expansion, and local review controls.
- Driver Job keeps the same job summary, driver detail acknowledgement, App Updates, Live Location disabled controls, status workflow, Report Issue, and status timing controls while hiding noisy activity-log and saved-status-history panels from drivers.
- The customer header/guidance and section tabs are compact bands/rows rather than giant cards.
- The driver status, live-location, updates, and detail sections use compact spacing and shorter controls.
- No new sector, feature card, free-form chat surface, provider-send panel, map activation, or notification runtime is introduced.
- Customer and driver forbidden fields remain blocked by the existing privacy guards.
- This polish is guarded by `scripts/test-customer-driver-app-compact-surface-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.

### Driver In-App Notification Staging Evidence Contract Guard Lock
- This is a docs/test-only guard for a future separately approved Driver In-App Notification staging evidence pass.
- This lock is distinct from the Customer/Driver In-App Notification Admin-Selected Channel Contract Lock; it locks the exact future one-row staging evidence window for driver notifications.
- This lock does not activate runtime notification writes, DB reads/writes, auth, sessions, cookies, customer portal, driver portal changes beyond the existing token read path, provider sends, env changes, deployment, UI sectors/cards/buttons, shims, or production activation.
- Future Driver In-App Notification staging evidence requires explicit owner approval.
- Future evidence requires explicit owner approval for one safe driver notification row write.
- Future evidence requires explicit owner approval for a staging target allowlist.
- Future evidence requires explicit owner approval for a staging driver-job token or synthetic/staging booking reference.
- Future evidence requires explicit owner approval for table/policy/RLS proof.
- Future evidence requires explicit owner approval for rollback/cleanup proof.
- Future gate/env names are names-only: `PRESTIGE_DRIVER_IN_APP_NOTIFICATIONS_STAGING_WRITE_ENABLED`, `PRESTIGE_DRIVER_IN_APP_NOTIFICATIONS_STAGING_READ_ENABLED`, `PRESTIGE_DRIVER_IN_APP_NOTIFICATIONS_STAGING_TARGET_ALLOWLIST`, and `PRESTIGE_ADMIN_IN_APP_NOTIFICATIONS_WRITE_ENABLED`.
- Future evidence must prove the admin/dispatcher write boundary on `POST /api/admin-customer-driver-app-notifications`.
- Future evidence must prove the driver token/read boundary on `GET /api/driver-job/[token]/notifications`.
- Future evidence must prove exactly one driver notification row is written.
- Future evidence must prove the driver page App Updates read path displays the safe notification.
- Future read/unread or status transition proof is optional and requires separate owner approval.
- Future evidence must prove no external provider send, no Email, no Resend, no Telegram, no WhatsApp, no SMS, no Google Maps call, no OneMap call, and no FlightAware call.
- Customer in-app read activation remains blocked until secure customer auth/portal proof is separately approved.
- Customer auth and customer portal activation are not part of this driver evidence lane.
- Allowed future driver notification fields are booking reference, service type, pickup date, pickup time, pickup location, drop-off location, passenger count if safe for driver, customer-facing flight number if safe for driver, safe title/message/context, workflow area, and driver job status context if already driver-safe.
- Forbidden driver notification fields are customer price, pricing, billing, invoice/payment, payment/PDF, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, live location, and OTS photo/storage unless separately approved.
- Rollback/cleanup proof must use exact cleanup of the one staging evidence row by safe event key or staging booking reference.
- Rollback/cleanup proof must include post-cleanup zero-row proof, gate closed proof, no follow-up notification row writes, and no provider sends.
- Driver-side evidence can proceed separately from customer-side auth/portal read because the existing driver read path is scoped through the verified driver job token route.
- Driver In-App Notification staging evidence must remain separate from customer in-app read activation, customer auth/portal activation, Email, Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live location, driver GPS, OTS/photo/storage, calendar, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.
- This guard adds `scripts/test-driver-in-app-notification-staging-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver In-App Notification One-Row Staging Evidence Record
- Evidence reference: `DRIVER-INAPP-STAGING-20260622075329`.
- Staging target commit: `bf688cf Guard driver in-app notification evidence contract`.
- A bounded Driver In-App Notification staging evidence pass completed once through the existing admin notification and driver job token read paths.
- The evidence used a staging-safe synthetic booking reference and a temporary staging driver job link; no real customer data was used.
- Exactly one safe `driver_app` notification row was written with queued status and trip-update type.
- The Driver App Updates read path was verified through `GET /api/driver-job/[token]/notifications`.
- The evidence row appeared through the driver token-scoped read path only.
- The evidence row was cleaned up by exact evidence reference and staging booking reference.
- Post-cleanup proof showed zero matching notification rows remained.
- The temporary driver job link was cleaned up after the read proof.
- Post-cleanup proof showed zero matching temporary driver job links remained.
- Admin/dispatcher boundary proof returned blocked HTTP 403 for anonymous access.
- Customer notification read boundary proof returned blocked HTTP 403.
- Unsafe payload proof returned blocked HTTP 400.
- No provider sends occurred: Email, Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, and FlightAware were not called.
- No persistent env change occurred.
- No production deploy or production activation occurred.
- No parser, Save Booking, `/api/admin-saved-bookings`, pricing/rates/customer_rates, `driver_payout_rules`, payout/payment/PDF/billing/invoice, auth/session/cookie, live-location, OTS/photo/storage, calendar, UI sector/card/button, or shim change occurred.
- No secrets, tokens, row IDs, env values, API keys, DB URLs, real customer data, or provider payloads were printed or recorded.
- Customer in-app read activation remains blocked until secure customer auth/portal proof is separately approved.
- Provider sends remain separate and not live.

### Driver In-App Notification Compact Admin Button Lock
- This is a bounded runtime implementation in the existing Driver Dispatch section.
- It reuses the existing compact Driver Dispatch action row and does not add a new UI sector, card, provider-send panel, route, helper, or shim.
- The compact button label is `Send Driver In-App`.
- The button is placed beside the existing Driver Dispatch `Edit` and `Copy` controls.
- The button is admin-selected only and sends no automatic fallback, no automatic multi-channel blast, and no provider message.
- The button requires a loaded saved booking reference and an active saved driver job link for that booking.
- The driver target is the currently selected booking's active driver job link; no free-form driver selection is introduced.
- The first message template is fixed: safe title `Dispatch update` and safe message `Please review this assigned trip in your Driver Job page.`
- The created notification uses `delivery_surface: "driver_app"`, `notification_type: "trip_update"`, `notification_status: "queued"`, `priority: "normal"`, and `workflow_area: "driver_app_updates"`.
- The click action uses the existing `POST /api/admin-customer-driver-app-notifications` route and existing `lib/customer-driver-app-notification-persistence.ts` boundary.
- The route remains behind the existing admin/dispatcher boundary and admin persistence gate.
- Customer in-app notification write/read remains blocked until customer auth/portal proof is separately approved.
- No free-text message body, template menu, batch send, retry, polling, scheduler, fallback, or blast is introduced.
- No Email, Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, provider-send, or external-call path is introduced.
- No env change, deploy, parser change, Save Booking change, `/api/admin-saved-bookings` change, pricing/rates/customer_rates change, `driver_payout_rules` change, payout/payment/PDF/billing/invoice change, auth/session/cookie activation, OTS/photo/storage change, calendar change, UI sector/card expansion, or shim change is included.
- Driver-visible in-app content remains forbidden from exposing customer price, pricing, billing, invoice/payment, payment/PDF, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, live location, and OTS photo/storage unless separately approved.
- Guard: `scripts/test-driver-in-app-notification-admin-button-guard.mjs`; suite registration in `scripts/test-preactivation-verification-suite.mjs`.

### Customer In-App Notification Read Prerequisite Contract Guard Lock
- This is a docs/test-only guard for the prerequisites required before Customer In-App Notification runtime, customer read, or a customer in-app button can be considered.
- Customer In-App Notification read/runtime remains blocked.
- `GET/PATCH /api/customer-app-notifications` must stay fail-closed through `customerAppNotificationsRequireAuthResult` by default.
- `GET /api/customer-app-notifications` may only use the disabled-by-default staging evidence read path after `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED=true`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE=staging`, the approved staging reference, same-origin customer portal headers, and the existing saved-bookings customer session boundary all pass.
- `PATCH /api/customer-app-notifications` remains fail-closed and must not read or write notification rows.
- The customer route itself must not parse request bodies, directly read env, create Supabase clients, set cookies, create sessions, create tokens, or write notification rows; Supabase reads must remain isolated to the gated staging evidence helper after the gate and customer boundary pass.
- A customer in-app button must not be added before customer read proof.
- Customer notification writes for `customer_app` must not be enabled before customer read/isolation proof.
- Future proof must include customer auth/session proof, customer portal/read path proof, `customer_driver_app_notification_outbox` table/RLS proof, customer row isolation proof, customer-safe booking projection proof, `customer_access_accounts` and audit proof if applicable, and rollback/disable proof.
- Customer-visible in-app payloads must remain limited to safe customer-facing notification title/message/context and safe booking context approved by a later customer-read lane.
- Customer-visible in-app payloads must exclude pricing, billing, invoice/payment/PDF, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, live location unless separately approved, and OTS/photo/storage unless separately approved.
- Driver in-app completion and the Driver Dispatch `Send Driver In-App` button do not unlock customer in-app runtime or customer in-app reads.
- Provider sends remain separate from in-app notifications; this lock does not approve Email, Resend, Telegram, WhatsApp, SMS, SMTP, IMAP, push, fallback, blast, scheduler, polling, or retry behavior.
- Google Maps evidence completion does not unlock customer in-app runtime, customer in-app reads, customer in-app writes, or customer in-app buttons.
- OneMap remains parked after safe provider failure and must not be retried by this lane.
- This lane does not activate auth, portal behavior, DB reads/writes, notification row writes, provider sends, UI, env changes, deploy, or production.
- This guard adds `scripts/test-customer-in-app-notification-read-prereq-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer In-App Notification Read Table/RLS Evidence Contract Guard Lock
- This is a docs/test-only guard for a future separately approved Customer In-App Notification read/table-RLS evidence pass.
- Customer In-App Notification runtime/read and customer in-app button remain blocked.
- `GET/PATCH /api/customer-app-notifications` must stay fail-closed through `customerAppNotificationsRequireAuthResult` by default.
- The only allowed customer notification read path is the disabled-by-default staging evidence path behind `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE`, the existing saved-bookings customer session boundary, and server-side Supabase credentials read only after that gate passes.
- `PATCH /api/customer-app-notifications` remains fail-closed and cannot read or write notification rows.
- Future evidence requires table/RLS proof for `public.customer_driver_app_notification_outbox` before any customer-visible notification read can be considered.
- Future evidence may create exactly one fake staging `customer_app` notification row and must clean it up.
- Future evidence must prove anonymous, missing-session, wrong-session, wrong-customer, cross-origin, and wrong-referer paths are blocked.
- Future evidence must prove customer row isolation so the fake customer sees only the fake `customer_app` notification row and cannot see another customer/account row.
- Future evidence must prove safe audit/access logging without printing row IDs, auth user IDs, customer IDs, cookies, session tokens, JWTs, API keys, DB URLs, env values, or secrets.
- Future evidence must prove cleanup/zero-row rollback and closed-gate/no-read behavior after the evidence window.
- Customer-safe notification payload fields remain limited to delivery surface, notification type/status, priority, safe title, safe message, safe context, workflow area, safe booking reference/context, and created/updated timestamps.
- Customer-visible in-app notification payloads must exclude pricing, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS unless separately approved, and OTS/photo/storage unless separately approved.
- Customer Portal saved-bookings evidence completion does not unlock customer in-app notification runtime, `customer_app` notification writes, or a customer in-app button.
- Driver in-app notification evidence/runtime and the Driver Dispatch `Send Driver In-App` button do not unlock customer in-app notification runtime, `customer_app` notification writes, or a customer in-app button.
- No provider sends, Email/Resend, Telegram, WhatsApp, SMS, push, Google Maps, OneMap, FlightAware, live location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, shim, env change, deploy, production activation, or UI button is approved by this lock.
- This guard adds `scripts/test-customer-in-app-notification-read-table-rls-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer In-App Notification Staging Read Evidence Runner Guard Lock
- This is a docs/test-only guard plus a disabled-by-default runner scaffold for a future separately approved Customer In-App Notification read/table-RLS staging evidence pass.
- The runner is `scripts/run-customer-in-app-notification-staging-read-evidence.mjs`.
- The runner is not executed by this commit, and Customer In-App Notification read evidence remains not run.
- The runner requires `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_APPROVED=customer-in-app-notification-staging-read-approved` before any phase runs.
- The runner requires `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_PHASE` to be one of `pre-window`, `read-window`, or `post-rollback`.
- The runner is staging-only and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_TARGET_URL` or its default.
- The runner does not open gates, close gates, edit Vercel env, deploy, run evidence automatically, or print env values.
- `pre-window` and `post-rollback` perform blocked/no-read route proof only and do not read/write the database.
- The `read-window` path is implemented as a disabled-by-default gated staging evidence path and must not run unless the explicit runner approval, phase, staging target, read gate, saved-bookings customer session boundary, Supabase env names, and staging reference are present.
- Future `read-window` evidence requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE`.
- Future `read-window` evidence may create exactly one fake staging `customer_app` notification row for the approved staging reference only, then must clean it up.
- Future evidence must prove anonymous, missing-session, wrong-session, wrong-customer, cross-origin, wrong-referer, customer row isolation, safe payload projection, audit/access logging, cleanup/zero-row rollback, and closed-gate/no-read behavior after rollback.
- Customer-safe notification fields remain limited to delivery surface, notification type/status, priority, safe title, safe message, safe context, workflow area, safe booking reference/context, and created/updated timestamps.
- Customer-visible in-app notification payloads must exclude pricing, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS unless separately approved, and OTS/photo/storage unless separately approved.
- The customer route remains fail-closed by default; this gated evidence path does not activate customer in-app runtime, customer auth/session, customer portal behavior, notification row writes outside the one fake future evidence fixture, provider sends, maps, FlightAware, UI buttons, env changes, deploys, or production.
- The runner output is normalized and must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data.
- A future evidence pass still requires separate owner approval for staging env/gate/deploy window, runner execution, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.
- This guard adds `scripts/test-customer-in-app-notification-staging-read-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer In-App Notification Staging Read Evidence Record
- Evidence reference: `CUSTOMER-IN-APP-NOTIFICATION-STAGING-READ-20260623115215`.
- Evidence was run once on staging through `scripts/run-customer-in-app-notification-staging-read-evidence.mjs`.
- Staging target commit: `8e87f01 Add customer in-app notification read evidence path`.
- The evidence used one fake staging customer/account reference and one fake `customer_app` notification row only.
- No real customer data was used.
- Pre-window closed proof passed with staging root HTTP 200 and `GET/PATCH /api/customer-app-notifications` blocked for anonymous access.
- Temporary staging read-window env/gate names were opened only for the bounded evidence window: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` were used only by the local evidence runner and deployed server-side environment for the bounded fixture/read/cleanup window; values were never printed, logged, committed, or recorded.
- Boundary proof during the read window returned HTTP 403 for anonymous, cross-origin, missing-session, wrong-referer, wrong-session, and wrong-customer/reference paths.
- Correct fake customer read proof returned HTTP 200 with exactly one safe `customer_app` notification row.
- Safe projection proof passed with `safe_fields_only: true` and field count `11`.
- Audit proof passed with `read_route_does_not_write_audit_rows: true`.
- Cleanup proof passed: the fake notification row was deleted and zero matching rows remained afterward.
- Rollback proof passed after a no-override staging redeploy closed the temporary gates: staging root HTTP 200 and `GET/PATCH /api/customer-app-notifications` blocked for anonymous access.
- Local temporary evidence env/key files were removed after the evidence window.
- No customer in-app button, customer notification send UI, customer portal production activation, real customer auth/session creation, provider send, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, shim, production activation, or production deploy occurred.
- No secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data were printed or recorded.
- Customer In-App Notification read/table evidence is complete for the bounded staging-safe read lane, but customer in-app runtime button/write activation, production activation, and real customer data access remain blocked until separately approved.

### Customer In-App Notification Compact Admin Button Lock
- This is a bounded runtime implementation in the existing Customer Copy section after completed Customer In-App Notification read/table evidence.
- It reuses the existing compact Customer Copy action row and does not add a new UI sector, card, provider-send panel, route, helper, or shim.
- The compact visible button label is `Send In-App` with an accessible Customer In-App label.
- The button is placed beside the existing compact Customer Copy `Email`, `WhatsApp`, and `SMS` controls.
- Customer Copy status polish keeps the same in-app route, gate, payload, and no-provider-send behavior while replacing long visible technical labels with compact admin labels: `SMS/WA off`, `Email gate off`, and `Needs copy` / `In-App ready`.
- The longer technical safety details for provider send disabled state, email activation preflight, and Customer In-App readiness remain available in title/status metadata for review and guards; they are no longer forced into the visible admin row.
- The button is admin-selected only and sends no automatic fallback, no automatic multi-channel blast, and no provider message.
- The button requires a loaded saved booking reference and complete customer copy readiness for the current booking.
- The customer target is the currently selected booking's customer app notification surface; no free-form customer selection is introduced.
- The first message template is fixed: safe title `Driver details ready` and safe message `Your Prestige Limo driver details are ready in your customer app.`
- The created notification uses `delivery_surface: "customer_app"`, `notification_type: "trip_update"`, `notification_status: "queued"`, `priority: "normal"`, and `workflow_area: "customer_app_updates"`.
- The click action uses the existing `POST /api/admin-customer-driver-app-notifications` route and existing `lib/customer-driver-app-notification-persistence.ts` boundary.
- The route remains behind the existing admin/dispatcher boundary and admin persistence gate.
- No free-text message body, template menu, batch send, retry, polling, scheduler, fallback, or blast is introduced.
- No Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, provider-send, or external-call path is introduced by the In-App button; Email remains separate through the gated Resend route.
- Customer read remains gated by `/api/customer-app-notifications`; this button only queues the approved safe customer_app notification row.
- Customer-visible in-app content remains forbidden from exposing pricing, billing, invoice/payment/PDF, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, live location, and OTS/photo/storage unless separately approved.
- Production activation, real customer notification evidence, customer portal production activation, env changes, deploy, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, pricing/rates/customer_rates changes, `driver_payout_rules` changes, payout/payment/PDF/billing/invoice changes, auth/session/cookie changes, OTS/photo/storage changes, calendar changes, UI sector/card expansion, and shim changes remain separate lanes.
- Guard: `scripts/test-customer-in-app-notification-admin-button-guard.mjs`; suite registration in `scripts/test-preactivation-verification-suite.mjs`.

### Customer In-App Notification Admin Button One-Row Staging Evidence Record
- Evidence reference: `CUSTOMER-IN-APP-ADMIN-BUTTON-STAGING-20260623`.
- Staging target commit: `9a0a03b Add customer in-app notification admin button`.
- The compact `Send In-App` button was visible on staging in the existing Customer Copy action row.
- Staging root proof returned HTTP 200 with title `Prestige Limo Ops`.
- Public `POST /api/admin-customer-driver-app-notifications` was blocked with HTTP 403.
- Authenticated admin `POST /api/admin-customer-driver-app-notifications` succeeded during the approved bounded gate window.
- Exactly one fake staging `customer_app` notification row was written.
- The fake evidence row used the fixed safe customer-facing template only: title `Driver details ready` and message `Your Prestige Limo driver details are ready in your customer app.`
- The fake evidence row used `delivery_surface: "customer_app"`, `notification_type: "trip_update"`, `notification_status: "queued"`, `priority: "normal"`, and no provider-send payload.
- The fake evidence row was cleaned up after the write proof.
- Cleanup proof passed with zero matching fake evidence rows remaining.
- Rollback proof after the gate was closed and staging was redeployed closed: `/api/customer-app-notifications` GET remained blocked with HTTP 403.
- Rollback proof after the gate was closed and staging was redeployed closed: `/api/customer-app-notifications` PATCH remained blocked with HTTP 403.
- No real customer data was used.
- No provider send occurred.
- No Email, Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, shim, production activation, or production deploy occurred.
- No secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data were printed or recorded.
- Temporary local evidence files holding staging secret/env material were removed after the evidence window.
- Customer In-App admin-button one-row staging evidence is complete for the bounded fake-row lane, but broader customer messaging templates, production activation, real customer notification sends/rows, customer auth/session/portal activation, and customer in-app production read/write remain separate lanes requiring explicit owner approval.

### Controlled Customer Portal + Customer In-App Runtime Activation Contract Guard Lock
- This is a docs/test-only guard for a future separately approved controlled customer-facing runtime activation lane.
- This lock does not activate customer portal runtime, customer auth/session/cookie creation, customer in-app production read/write, notification row writes, env changes, DB reads/writes, provider sends, Google Maps/OneMap/FlightAware calls, deploy, production activation, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, pricing/rates/customer_rates changes, `driver_payout_rules` changes, payout/payment/PDF/billing/invoice activation, OTS/photo/storage activation, calendar activation, UI sector/card expansion, or shims.
- Completed prerequisites now recorded: Customer Portal saved-bookings staging read evidence, Customer In-App read/table-RLS staging evidence, and Customer In-App admin button one-row staging evidence.
- Those completed prerequisites do not approve broad customer-facing runtime activation, all-customer access, production activation, provider sends, live location, billing/payment/PDF, payout, or real customer notification sends/rows.
- Future controlled activation must be limited to exactly one owner-approved customer/account first, or an explicit owner-approved small account allowlist; broad/all-customer activation is forbidden until a later separate approval and evidence pass.
- Future activation approval must name the exact environment, staging or production pilot mode, customer/account reference scope, booking/reference scope if applicable, gate/env names, allowed safe fields, audit plan, rollback/disable plan, stop conditions, and checks.
- Future env names must be documented as names only with no values or secrets; planned gate names include `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP`, and `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.
- Exact-2 live-window reads must use `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP` to map exactly two private customer sessions to exactly two allowlisted customer accounts without printing token values.
- Customer portal runtime must remain authenticated, same-origin, session-bound, account-scoped, and customer-row-isolated before any real customer can read saved bookings.
- Customer in-app notification read runtime must remain authenticated, same-origin, session-bound, account-scoped, and customer-row-isolated before any real customer can read notifications.
- Customer in-app notification write runtime must remain admin-selected only through the existing compact `Send In-App` action or a separately approved equivalent; no automatic fallback, automatic multi-channel blast, scheduler, retry, polling, batch send, provider send, free-form customer message, or broad notification write is approved.
- Customer portal safe saved-booking fields remain limited to booking reference, customer-facing status, service type, pickup date/time, pickup location, drop-off location, passenger name, and safe created/updated/month grouping fields unless a later contract expands them.
- Customer in-app safe notification fields remain limited to delivery surface, notification type/status, priority, safe title, safe message, safe context, workflow area, safe booking reference/context, and created/updated timestamps unless a later contract expands them.
- Customer-facing runtime must exclude pricing, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS unless separately approved, and OTS/photo/storage unless separately approved.
- Future activation evidence must prove anonymous, missing-session, wrong-session, wrong-customer/account, cross-origin, wrong-referer, and out-of-allowlist paths are blocked.
- Future activation evidence must prove audit/access logging without printing row IDs, auth user IDs, customer IDs, cookies, session tokens, JWTs, API keys, DB URLs, env values, or secrets.
- Future activation evidence must prove rollback/disable by closing gates, removing temporary env exposure if any, redeploying closed when needed, and verifying blocked/no-read/no-write behavior after rollback.
- Driver In-App, Driver Details Email, Google Maps, OneMap retirement, FlightAware locks, and provider-send evidence do not unlock customer portal runtime or customer in-app runtime.
- This guard adds `scripts/test-controlled-customer-runtime-activation-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- The disabled-by-default controlled runtime gate scaffold is now implemented in `lib/customer-saved-bookings-read.ts`, `lib/customer-driver-app-notification-persistence.ts`, and `app/api/customer-app-notifications/route.ts`.
- The scaffold defaults closed unless the relevant runtime gate is explicitly enabled, mode is `one-customer` or `small-allowlist`, and the customer account reference is present in the allowlist.
- Customer Portal saved-bookings reads require the existing customer saved-bookings session boundary plus `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST` before reading booking rows.
- Customer In-App notification runtime reads require the existing saved-bookings session boundary plus `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`, then verify the booking belongs to the allowlisted customer account before reading notifications.
- Customer In-App `customer_app` writes require the existing admin/dispatcher boundary, the approved fixed `Driver details ready` template, a safe booking reference, and the controlled customer in-app account allowlist before inserting a row.
- `driver_app` notification writes remain separate from customer runtime activation and are not unlocked or blocked by the customer allowlist scaffold.

### Controlled Ritz Carlton Production Customer Runtime Pilot Runner Guard Lock
- This is a disabled-by-default production evidence runner guard for the separately approved Ritz Carlton controlled one-customer production pilot.
- The runner is `scripts/run-controlled-ritz-customer-runtime-production-pilot.mjs`.
- The runner requires `PRESTIGE_CONTROLLED_RITZ_PRODUCTION_PILOT_APPROVED=controlled-ritz-production-pilot-approved` before it can run.
- The runner selects only the owner-approved target label `Ritz Carlton` and one latest active booking for that customer/account.
- The runner uses production Supabase credentials only from existing local env files and validates the masked production project ref `kvv...atm`; no values are printed.
- The runner opens runtime gates only in the local process harness and does not edit env files, Vercel env, or deploy.
- The runner creates one temporary `customer_access_accounts` mapping and one temporary `customer_app` notification row, then deletes both and verifies zero matching rows remain.
- The runner proves customer portal read, customer in-app read, admin `Send In-App`, blocked missing/wrong session, out-of-scope booking isolation, and post-rollback blocked behavior.
- The runner is forbidden from provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing, payout, `customer_rates`, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, UI changes, deploy, or broad/all-customer runtime activation.
- The runner output must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, booking references, customer names, or private customer data.
- The runner guard is `scripts/test-controlled-ritz-customer-runtime-production-pilot-runner-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.
- This lock does not run the production pilot, open production Vercel gates, change env, deploy, write DB rows, create notification rows, or activate customer runtime by itself.

### Controlled Hidden Customer Production Runtime Pilot Runner Guard Lock
- This is a disabled-by-default production evidence runner guard for the separately approved hidden active customer controlled one-customer production pilot.
- The runner is `scripts/run-hidden-customer-runtime-production-pilot.mjs`.
- The runner requires `PRESTIGE_HIDDEN_CUSTOMER_PRODUCTION_PILOT_APPROVED=hidden-customer-production-pilot-approved` before it can run.
- The runner selects one owner-approved hidden active production customer candidate internally and one latest active booking for that customer/account.
- The runner intentionally does not print the customer name, customer ID, auth user ID, booking reference, booking row ID, row IDs, tokens, cookies, env values, contacts, or private customer data.
- The runner uses production Supabase credentials only from existing local env files and validates the masked production project ref `kvv...atm`; no values are printed.
- The runner opens runtime gates only in the local process harness and does not edit env files, Vercel env, or deploy.
- The runner creates one temporary `customer_access_accounts` mapping and one temporary `customer_app` notification row, then deletes both and verifies zero matching rows remain.
- The runner proves customer portal read, customer in-app read, admin `Send In-App`, blocked missing/wrong session, out-of-scope booking isolation, and post-rollback blocked behavior.
- The runner is forbidden from provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing, payout, `customer_rates`, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, UI changes, deploy, or broad/all-customer runtime activation.
- The runner output must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, booking references, customer names, phone/email, contacts, or private customer data.
- The runner guard is `scripts/test-hidden-customer-runtime-production-pilot-runner-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.
- This lock does not run the production pilot, open production Vercel gates, change env, deploy, write DB rows, create notification rows, or activate customer runtime by itself.

### Hidden Customer Controlled Customer Portal + Customer In-App Production Pilot Evidence Record
- Evidence reference: `HIDDEN-CUSTOMER-PRODUCTION-PILOT-20260623121654`.
- Production target proof used the masked Supabase project ref `kvv...atm`; no full project ref, API key, DB URL, env value, token, cookie, customer ID, auth user ID, booking reference, booking row ID, row ID, phone/email/contact, customer name, or private customer data was printed or recorded.
- The owner-approved target was one hidden active production customer candidate selected internally and one latest active booking for that customer/account.
- Runtime gates were opened only in the local process harness and were closed afterward; no Vercel env was changed, no env file was edited, and no deploy occurred.
- Customer portal read proof passed through `GET /api/customer-saved-bookings` with HTTP 200 and exactly one safe saved-booking projection containing ten safe fields only.
- Customer in-app read proof passed through `GET /api/customer-app-notifications` with HTTP 200 and exactly one safe `customer_app` notification projection containing eleven safe fields only.
- Admin `Send In-App` proof passed through `POST /api/admin-customer-driver-app-notifications` with HTTP 200 using the approved fixed safe customer template only: title `Driver details ready` and message `Your Prestige Limo driver details are ready in your customer app.`
- Out-of-scope booking isolation proof passed with zero out-of-scope portal rows.
- Temporary DB write scope was limited to one `customer_access_accounts` mapping and one `customer_app` notification row for the evidence window.
- Cleanup proof passed: access mapping rows remaining `0`, notification rows remaining `0`, and `zero_matching_rows: true`.
- Safe field proof passed for customer portal and customer in-app projections; no pricing, payout, PayNow, `customer_rates`, `driver_payout_rules`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS, OTS/photo/storage, or private customer/contact fields were exposed.
- No provider send, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, shim, production deploy, all-customer activation, free-form customer message, fallback, blast, scheduler, or retry occurred.
- The production pilot evidence is complete for one hidden active customer candidate only; broad/all-customer runtime activation, free-form customer messaging, provider sends, and finance/billing/payment/PDF/payout lanes remain blocked until separately approved.

### Controlled Small-Allowlist Customer Production Runtime Pilot Runner Guard Lock
- This is a disabled-by-default production evidence runner guard for the separately approved small-allowlist customer production pilot.
- The runner is `scripts/run-small-allowlist-customer-runtime-production-pilot.mjs`.
- The runner requires `PRESTIGE_SMALL_ALLOWLIST_CUSTOMER_PRODUCTION_PILOT_APPROVED=small-allowlist-customer-production-pilot-approved` before it can run.
- The runner selects exactly two hidden active production customer candidates internally, with one latest active booking for each customer/account.
- The runner skips customer/account candidates that already have an existing `customer_access_accounts` mapping so it does not overwrite, reuse, or collide with current production access rows.
- The runner uses `small-allowlist` runtime mode for both Customer Portal and Customer In-App gates and keeps the allowlist account-scoped.
- The runner intentionally does not print customer names, customer IDs, auth user IDs, booking references, booking row IDs, row IDs, tokens, cookies, env values, phone/email/contacts, or private customer data.
- The runner uses production Supabase credentials only from existing local env files and validates the masked production project ref `kvv...atm`; no values are printed.
- The runner opens runtime gates only in the local process harness and does not edit env files, Vercel env, or deploy.
- The runner creates one temporary `customer_access_accounts` mapping and one temporary `customer_app` notification row per allowlisted customer, then deletes them and verifies zero matching rows remain.
- The runner proves customer portal read, customer in-app read, admin `Send In-App`, blocked missing/wrong session, out-of-scope booking isolation, and post-rollback blocked behavior for every allowlisted customer.
- The runner is forbidden from provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing, payout, `customer_rates`, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, UI changes, deploy, or broad/all-customer runtime activation.
- The runner output must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, booking references, customer names, phone/email, contacts, or private customer data.
- The runner guard is `scripts/test-small-allowlist-customer-runtime-production-pilot-runner-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.
- This lock does not run the production pilot, open production Vercel gates, change env, deploy, write DB rows, create notification rows, or activate customer runtime by itself.

### Small-Allowlist Customer Production Runtime Pilot Safe Attempt Note
- A bounded production pilot attempt on `2026-06-23` initially selected three hidden active production customer candidates because the staged runner still allowed up to four candidates.
- The attempt printed no customer names, customer IDs, auth user IDs, booking references, booking row IDs, row IDs, tokens, cookies, env values, phone/email/contacts, or private customer data.
- The attempt reported customer portal read HTTP 200 for all selected customers, customer in-app read HTTP 200 for all selected customers, admin `Send In-App` HTTP 200 for all selected customers, safe field projection proof, zero out-of-scope portal rows, no provider sends, no billing/payment/PDF/payout, no Google Maps/OneMap/FlightAware calls, and no secrets printed.
- Cleanup proof passed: all temporary `customer_access_accounts` mappings and `customer_app` notification rows were deleted and zero matching rows remained.
- Because the owner approval was for exactly two hidden active production customers, this three-customer safe run is not accepted as the completed small-allowlist production pilot evidence.
- The runner is now locked to exactly two candidates before any separately approved rerun.

### Exact-2 Small-Allowlist Customer Production Runtime Pilot Evidence Record
- Evidence reference: `SMALL-ALLOWLIST-CUSTOMER-PRODUCTION-PILOT-20260623131644`.
- Production target proof used the masked Supabase project ref `kvv...atm`; no full project ref, API key, DB URL, env value, token, cookie, customer ID, auth user ID, booking reference, booking row ID, row ID, phone/email/contact, customer name, or private customer data was printed or recorded.
- The owner-approved scope was exactly two hidden active production customer candidates selected internally, with one latest active booking for each customer/account.
- The runner skipped candidates with existing `customer_access_accounts` mappings so current production access rows were not overwritten, reused, or collided with.
- Runtime gates were opened only in the local process harness and were closed afterward; no Vercel env was changed, no env file was edited, and no deploy occurred.
- Customer portal read proof passed through `GET /api/customer-saved-bookings` with HTTP 200 for both selected customers, using safe saved-booking projection only.
- Customer in-app read proof passed through `GET /api/customer-app-notifications` with HTTP 200 for both selected customers, using safe `customer_app` notification projection only.
- Admin `Send In-App` proof passed through `POST /api/admin-customer-driver-app-notifications` with HTTP 200 for both selected customers, using the approved fixed safe customer template only: title `Driver details ready` and message `Your Prestige Limo driver details are ready in your customer app.`
- Out-of-scope booking isolation proof passed with zero out-of-scope portal rows.
- Temporary DB write scope was limited to one `customer_access_accounts` mapping and one `customer_app` notification row per selected customer for the evidence window.
- Cleanup proof passed: selected customer count `2`, access mapping rows remaining `0`, notification rows remaining `0`, and `all_zero_matching_rows: true`.
- Safe field proof passed for customer portal and customer in-app projections; no pricing, payout, PayNow, `customer_rates`, `driver_payout_rules`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS, OTS/photo/storage, or private customer/contact fields were exposed.
- No provider send, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, shim, production deploy, all-customer activation, free-form customer message, fallback, blast, scheduler, or retry occurred.
- The exact-2 small-allowlist production pilot evidence is complete; broad/all-customer runtime activation, free-form customer messaging, provider sends, and finance/billing/payment/PDF/payout lanes remain blocked until separately approved.

### Small Live Customer Production Runtime Allowlist Window Runner Guard Lock
- This is a disabled-by-default guard plus execution runner scaffold for a future separately approved small live Customer Portal + Customer In-App production allowlist window.
- The runner is `scripts/run-small-live-customer-runtime-production-window.mjs`.
- The no-side-effect preflight phase still requires `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED=small-live-customer-runtime-window-approved` and `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=preflight-only`.
- The execution phase is disabled by default and additionally requires `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=execute-window`, `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED=small-live-customer-runtime-window-deploy-approved`, and `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL` before it can open any live window.
- Execution mode can deploy a bounded production window using Vercel deployment-time environment overrides only; it must not edit Vercel project env, local env files, source files, or persistent saved env values.
- The live-window scope remains exactly two hidden active production customer accounts, with one latest active booking per allowlisted account.
- Future live-window gate names are names-only/no-values: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`.
- Execution mode selects the two targets internally and must not print customer names, customer IDs, account references, booking references, auth user IDs, row IDs, phone/email/contact data, session tokens, cookies, API keys, DB URLs, env values, or private customer data.
- Execution mode must use `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP` to map exactly two private customer sessions to exactly two allowlisted customer accounts without printing token values.
- Execution mode may create exactly one temporary `customer_app` notification row per allowlisted customer through the existing admin `Send In-App` route, then must delete only those matching temporary event-key rows and prove zero matching rows remain.
- Execution mode must prove production root health, pre-window blocked routes, customer portal read for both allowlisted customers, customer in-app read for both allowlisted customers, admin Send In-App for both allowlisted customers, anonymous/missing-session/wrong-session/wrong-customer/cross-origin/wrong-referer blocks, cleanup, rollback deployment, and post-rollback blocked/no-read proof.
- Customer Portal live-window visibility must stay limited to safe saved-booking fields only.
- Customer In-App live-window visibility must stay limited to safe customer-app notification fields only.
- Admin `Send In-App` remains fixed-template only: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`
- Stop conditions include any out-of-allowlist read, wrong-customer read, forbidden field exposure, provider send attempt, billing/payment/PDF/payout activation, secret/private-data print risk, failure to clean up temporary rows, or inability to prove rollback immediately.
- Provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback/blast/scheduler/retry, and all-customer activation remain blocked.
- This lock is not approval to run the live window or keep production runtime live; the execution phase still requires a separate owner approval immediately before use.
- The guard is `scripts/test-small-live-customer-runtime-production-window-runner-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Small Live Customer Production Runtime Window Blocked Attempt Record
- Attempt reference: `SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-BLOCKED-20260623`.
- Production app URL setup completed for `app.prestigelimo.sg`; root health returned HTTP 200 and title `Prestige Limo Ops`.
- The bounded exact-2 live-window runner was attempted once after owner approval using two hidden active production customers and one latest active booking each.
- The runner stopped before accepting evidence because the wrong-customer targeted Customer Portal saved-booking proof returned HTTP 200 instead of the required HTTP 403.
- The observed issue was response-boundary semantics only: a session targeting another customer's booking reference must hard-block as unauthorized rather than return an empty successful read.
- This blocked attempt is not accepted live-window evidence.
- Safety proof after the blocked attempt: production gates were closed, production root remained HTTP 200, `GET /api/customer-saved-bookings` returned HTTP 403, `GET /api/customer-app-notifications` returned HTTP 403, and zero temporary `customer_app` notification rows matching the live-window event-key prefix remained.
- No provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback, blast, scheduler, retry, broad/all-customer activation, or private customer data exposure occurred.
- Customer Portal targeted booking-reference reads are now hardened so a requested booking reference outside the session customer's scoped account returns the existing safe HTTP 403 auth-required response.
- The exact-2 small live production runtime window remains blocked until this hardening is reviewed, promoted, and a fresh owner-approved live-window run is requested.

### Small Live Customer Production Runtime Window Evidence Record
- Evidence reference: `SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-20260623161907`.
- Source-of-truth commit before the window: `ace1d25 Harden customer portal targeted booking isolation`.
- Production target label: two hidden active production customers.
- Booking scope: exactly two latest active hidden production customer bookings, one per selected customer.
- The bounded live-window runner completed successfully after the targeted booking isolation hardening was promoted.
- The window opened only deployment-time gate overrides through the runner; it did not edit Vercel project env, local env files, source files, or persistent saved env values.
- Gate/window proof: `opened_by_runner: true`, `closed_after: true`, `gate_overrides_only: true`, and `persistent_vercel_env_changed: false`.
- Pre-window blocked proof passed: Customer Portal route HTTP 403 and Customer In-App route HTTP 403 before the temporary window opened.
- Customer Portal live-window read proof passed for both hidden allowlisted customers: HTTP 200 for both, using safe saved-booking projection only.
- Customer In-App live-window read proof passed for both hidden allowlisted customers: HTTP 200 for both, using safe `customer_app` notification projection only.
- Admin `Send In-App` proof passed for both hidden allowlisted customers: HTTP 200 for both, fixed safe template only.
- The approved fixed customer in-app template remained: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`
- Wrong/anonymous/cross-customer and rollback proof passed through the runner's blocked-route checks; post-rollback Customer Portal and Customer In-App statuses were HTTP 403 for both selected customer contexts.
- Cleanup proof passed: selected customer count `2`, checked customer count `2`, temporary notification rows remaining `0`, total matching notification rows remaining `0`, and `all_zero_matching_rows: true`.
- Production DB was touched only for the approved temporary evidence fixtures: one temporary `customer_app` notification row per allowlisted customer and cleanup of only matching temporary event-key rows.
- No real customer rows were deleted.
- No customer names, customer IDs, account references, booking references, auth user IDs, row IDs, phone/email/contact data, session tokens, cookies, API keys, DB URLs, env values, full project ref, or private customer data were printed.
- No provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback, blast, scheduler, retry, or broad/all-customer activation occurred.
- The exact-2 small live production runtime window evidence is complete.
- Production Customer Portal + Customer In-App broad/all-customer runtime remains blocked; keeping any customer runtime live, expanding the allowlist, adding free-form customer messages, or enabling provider/billing/payment/PDF/payout lanes requires separate owner approval and a fresh bounded lane.

### Exact-3 Small Live Customer Production Runtime Window Runner Guard Lock
- This is a disabled-by-default exact-3 extension of the small live Customer Portal + Customer In-App production allowlist window runner.
- The runner remains `scripts/run-small-live-customer-runtime-production-window.mjs`; the exact-3 profile is selected only by exact-3 approval/window env names.
- The exact-2 live-window evidence history remains preserved: `SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-20260623161907` remains the completed exact-2 evidence record and is not reclassified or replaced by this lock.
- The exact-3 profile requires `PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED=exact-3-small-live-customer-runtime-window-approved` and `PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=preflight-only` for no-side-effect preflight.
- The exact-3 execution phase is disabled by default and additionally requires `PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=execute-window`, `PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED=exact-3-small-live-customer-runtime-window-deploy-approved`, and `PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL` before it can open any live window.
- The exact-3 live-window scope is exactly three hidden active production customer accounts, with one latest active booking per allowlisted account.
- Execution mode can deploy a bounded production window using Vercel deployment-time environment overrides only; it must not edit Vercel project env, local env files, source files, or persistent saved env values.
- Execution mode must use `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP` to map exactly three private customer sessions to exactly three allowlisted customer accounts without printing token values.
- The Customer Portal and Customer In-App runtime boundaries now validate the private session map against the active runtime allowlist size, restricted to the guarded exact-2 or exact-3 counts; unclear mappings, broad counts, duplicate auth users, duplicate customer accounts, duplicate tokens, and unmatched tokens remain blocked.
- Execution mode selects the three targets internally and must not print customer names, customer IDs, account references, booking references, auth user IDs, row IDs, phone/email/contact data, session tokens, cookies, API keys, DB URLs, env values, or private customer data.
- Execution mode may create exactly one temporary `customer_app` notification row per allowlisted customer through the existing admin `Send In-App` route, then must delete only those matching temporary event-key rows and prove zero matching rows remain.
- Execution mode must prove production root health, pre-window blocked routes, customer portal read for all three allowlisted customers, customer in-app read for all three allowlisted customers, admin Send In-App for all three allowlisted customers, anonymous/missing-session/wrong-session/wrong-customer/cross-origin/wrong-referer blocks, cleanup, rollback deployment, and post-rollback blocked/no-read proof.
- Customer Portal exact-3 live-window visibility must stay limited to safe saved-booking fields only.
- Customer In-App exact-3 live-window visibility must stay limited to safe customer-app notification fields only.
- Admin `Send In-App` remains fixed-template only: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`
- Stop conditions include any out-of-allowlist read, wrong-customer read, forbidden field exposure, provider send attempt, billing/payment/PDF/payout activation, secret/private-data print risk, failure to clean up temporary rows, inability to prove zero matching rows remain, or inability to prove rollback immediately.
- Provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback/blast/scheduler/retry, and all-customer activation remain blocked.
- This lock is not approval to run the exact-3 live window or keep production runtime live; the execution phase still requires separate owner approval immediately before use.
- The guard is `scripts/test-exact-three-small-live-customer-runtime-production-window-runner-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Exact-3 Small Live Customer Production Runtime Window Evidence Record
- Evidence reference: `EXACT-3-SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-20260623171652`.
- Source-of-truth commit before the window: `b6a2905 Guard exact three customer runtime live window`.
- Production target label: three hidden active production customers.
- Booking scope: exactly three latest active hidden production customer bookings, one per selected customer.
- The bounded exact-3 live-window runner completed successfully using the separately approved exact-3 profile.
- The window opened only deployment-time gate overrides through the runner; it did not edit Vercel project env, local env files, source files, or persistent saved env values.
- Gate/window proof: `opened_by_runner: true`, `closed_after: true`, `gate_overrides_only: true`, and `persistent_vercel_env_changed: false`.
- Pre-window blocked proof passed: Customer Portal route HTTP 403 and Customer In-App route HTTP 403 before the temporary window opened.
- Customer Portal live-window read proof passed for all three hidden allowlisted customers: HTTP 200 for all three, using safe saved-booking projection only.
- Customer In-App live-window read proof passed for all three hidden allowlisted customers: HTTP 200 for all three, using safe `customer_app` notification projection only.
- Admin `Send In-App` proof passed for all three hidden allowlisted customers: HTTP 200 for all three, fixed safe template only.
- The approved fixed customer in-app template remained: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`
- Wrong/anonymous/cross-customer and rollback proof passed through the runner's blocked-route checks; post-rollback Customer Portal and Customer In-App statuses were HTTP 403 for all three selected customer contexts.
- Cleanup proof passed: selected customer count `3`, checked customer count `3`, temporary notification rows remaining `0`, total matching notification rows remaining `0`, and `all_zero_matching_rows: true`.
- Production DB was touched only for the approved temporary evidence fixtures: one temporary `customer_app` notification row per allowlisted customer and cleanup of only matching temporary event-key rows.
- No real customer rows were deleted.
- No customer names, customer IDs, account references, booking references, auth user IDs, row IDs, phone/email/contact data, session tokens, cookies, API keys, DB URLs, env values, full project ref, or private customer data were printed.
- No provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback, blast, scheduler, retry, or broad/all-customer activation occurred.
- The exact-3 small live production runtime window evidence is complete.
- Production Customer Portal + Customer In-App broad/all-customer runtime remains blocked; keeping customer runtime live beyond the bounded evidence window, expanding the allowlist, adding free-form customer messages, or enabling provider/billing/payment/PDF/payout lanes requires separate owner approval and a fresh bounded lane.

### Exact-3 Live Continuation Window Evidence Record
- Evidence reference: `EXACT-3-SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-20260623233533`.
- Source-of-truth commit before the window: `d23daf5 Record exact three customer runtime window evidence`.
- Production target label: same exact-3 hidden active production customer scope.
- Booking scope: exactly three latest active hidden production customer bookings, one per selected customer.
- The bounded exact-3 continuation runner completed successfully using the separately approved exact-3 profile.
- The window opened only deployment-time gate overrides through the runner; it did not edit Vercel project env, local env files, source files, or persistent saved env values.
- Gate/window proof: `opened_by_runner: true`, `closed_after: true`, `gate_overrides_only: true`, and `persistent_vercel_env_changed: false`.
- Pre-window blocked proof passed: Customer Portal route HTTP 403 and Customer In-App route HTTP 403 before the temporary window opened.
- Customer Portal live-continuation read proof passed for all three hidden allowlisted customers: HTTP 200 for all three, using safe saved-booking projection only.
- Customer In-App live-continuation read proof passed for all three hidden allowlisted customers: HTTP 200 for all three, using safe `customer_app` notification projection only.
- Admin `Send In-App` proof passed for all three hidden allowlisted customers: HTTP 200 for all three, fixed safe template only.
- The approved fixed customer in-app template remained: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`
- Wrong/anonymous/cross-customer and rollback proof passed through the runner's blocked-route checks; post-rollback Customer Portal and Customer In-App statuses were HTTP 403 for all three selected customer contexts.
- Cleanup proof passed: selected customer count `3`, checked customer count `3`, temporary notification rows remaining `0`, total matching notification rows remaining `0`, and `all_zero_matching_rows: true`.
- Production DB was touched only for the approved temporary evidence fixtures: one temporary `customer_app` notification row per allowlisted customer and cleanup of only matching temporary event-key rows.
- No real customer rows were deleted.
- No customer names, customer IDs, account references, booking references, auth user IDs, row IDs, phone/email/contact data, session tokens, cookies, API keys, DB URLs, env values, full project ref, or private customer data were printed.
- No provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback, blast, scheduler, retry, or broad/all-customer activation occurred.
- The exact-3 live continuation window evidence is complete.
- Production Customer Portal + Customer In-App broad/all-customer runtime remains blocked; keeping customer runtime live beyond a bounded approved window, expanding the allowlist, adding free-form customer messages, or enabling provider/billing/payment/PDF/payout lanes requires separate owner approval and a fresh bounded lane.

### Exact-5 Small Live Customer Production Runtime Window Runner Guard Lock
- This is a disabled-by-default exact-5 extension of the small live Customer Portal + Customer In-App production allowlist window runner.
- The runner remains `scripts/run-small-live-customer-runtime-production-window.mjs`; the exact-5 profile is selected only by exact-5 approval/window env names.
- The exact-2 and exact-3 live-window evidence history remains preserved: `SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-20260623161907`, `EXACT-3-SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-20260623171652`, and `EXACT-3-SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW-20260623233533` remain completed evidence records and are not reclassified or replaced by this lock.
- The exact-5 profile requires `PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED=exact-5-small-live-customer-runtime-window-approved` and `PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=preflight-only` for no-side-effect preflight.
- The exact-5 execution phase is disabled by default and additionally requires `PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=execute-window`, `PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED=exact-5-small-live-customer-runtime-window-deploy-approved`, and `PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL` before it can open any live window.
- The exact-5 live-window scope is exactly five hidden active production customer accounts, with one latest active booking per allowlisted account.
- Execution mode can deploy a bounded production window using Vercel deployment-time environment overrides only; it must not edit Vercel project env, local env files, source files, or persistent saved env values.
- Execution mode must use `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP` to map exactly five private customer sessions to exactly five allowlisted customer accounts without printing token values.
- The Customer Portal and Customer In-App runtime boundaries validate the private session map against the active runtime allowlist size, restricted to the guarded exact-2, exact-3, or exact-5 counts; unclear mappings, broad counts, duplicate auth users, duplicate customer accounts, duplicate tokens, and unmatched tokens remain blocked.
- Execution mode selects the five targets internally and must not print customer names, customer IDs, account references, booking references, auth user IDs, row IDs, phone/email/contact data, session tokens, cookies, API keys, DB URLs, env values, or private customer data.
- Execution mode may create exactly one temporary `customer_app` notification row per allowlisted customer through the existing admin `Send In-App` route, then must delete only those matching temporary event-key rows and prove zero matching rows remain.
- Execution mode must prove production root health, pre-window blocked routes, customer portal read for all five allowlisted customers, customer in-app read for all five allowlisted customers, admin Send In-App for all five allowlisted customers, anonymous/missing-session/wrong-session/wrong-customer/cross-origin/wrong-referer blocks, cleanup, rollback deployment, and post-rollback blocked/no-read proof.
- Customer Portal exact-5 live-window visibility must stay limited to safe saved-booking fields only.
- Customer In-App exact-5 live-window visibility must stay limited to safe customer-app notification fields only.
- Admin `Send In-App` remains fixed-template only: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`
- Stop conditions include any out-of-allowlist read, wrong-customer read, forbidden field exposure, provider send attempt, billing/payment/PDF/payout activation, secret/private-data print risk, failure to clean up temporary rows, inability to prove zero matching rows remain, or inability to prove rollback immediately.
- Provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback/blast/scheduler/retry, and all-customer activation remain blocked.
- This lock is not approval to run the exact-5 live window or keep production runtime live; the execution phase still requires separate owner approval immediately before use.
- The guard is `scripts/test-exact-five-small-live-customer-runtime-production-window-runner-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.

### Controlled Customer Portal + Customer In-App Staging Runtime Pilot Evidence Record
- Evidence record reference: `CONTROLLED-CUSTOMER-RUNTIME-PILOT-20260623-STATUS-VERIFIED`.
- Staging target commit: `25e22a7 Add controlled customer runtime gate scaffold`.
- The bounded pilot used fake staging data only: one fake customer/account, one fake saved booking, and one fake `customer_app` notification row.
- No real customer data was used.
- Pre-window closed proof passed with staging root HTTP 200/title `Prestige Limo Ops`, `GET /api/customer-saved-bookings` blocked with HTTP 403, and `GET/PATCH /api/customer-app-notifications` blocked with HTTP 403.
- Temporary runtime gates were opened only for the bounded evidence window using names-only/no-values handling: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`.
- The pilot issued a staging customer portal session for the fake account only and kept the route same-origin, session-bound, account-scoped, and allowlist-scoped.
- Customer portal read proof passed through `GET /api/customer-saved-bookings` with HTTP 200 and exactly one safe saved-booking row for the fake customer/account.
- Customer portal boundary proof passed for missing session, wrong session, wrong referer, and out-of-scope booking/customer paths.
- Admin `Send In-App` proof passed through `POST /api/admin-customer-driver-app-notifications` with the approved fixed safe customer template only: title `Driver details ready` and message `Your Prestige Limo driver details are ready in your customer app.`
- Customer in-app read proof passed through `GET /api/customer-app-notifications` with HTTP 200 and exactly one safe `customer_app` notification row for the fake customer/account.
- Customer in-app boundary proof passed for anonymous, missing-session, wrong-session, wrong-referer, and wrong-customer/reference paths.
- Safe field proof passed for saved-booking and customer in-app notification projections; no pricing, payout, PayNow, `customer_rates`, `driver_payout_rules`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS, or OTS/photo/storage fields were exposed.
- Cleanup proof passed in the runner and in a separate fake-prefix cleanup verification: fake access account rows `0`, fake audit rows `0`, fake booking rows `0`, fake customer rows `0`, and fake customer notification rows `0`.
- Rollback proof passed after a no-override staging redeploy closed the temporary gates: staging root HTTP 200/title `Prestige Limo Ops`, `GET /api/customer-saved-bookings` HTTP 403, `GET/PATCH /api/customer-app-notifications` HTTP 403, and public/admin customer-app POST status-only probe HTTP 403.
- Tooling note: the temporary local pilot runner returned a nonzero result only after cleanup and closed redeploy because its final blocked-response sanitizer overmatched a generic blocked admin-send response body; a separate status-only rollback probe confirmed HTTP 403, and no product/runtime failure or leftover fake row remained.
- Local temporary evidence env files were removed after the evidence window and cleanup verification.
- No provider send, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, shim, production activation, or production deploy occurred.
- No secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data were printed or recorded.
- Controlled one-customer staging runtime pilot evidence is complete for fake staging data; broader customer runtime activation, real customer access, all-customer activation, production activation, free-form customer messages, and provider sends remain blocked until separately approved.

### Ritz Carlton Controlled Customer Portal + Customer In-App Pilot Evidence Record
- Evidence reference: `RITZ-CONTROLLED-PILOT-20260623085715`.
- Staging target commit: `93d54e2 Record controlled customer runtime pilot evidence`.
- The selected pilot label was `Ritz Carlton Controlled Pilot`.
- Precheck found no existing Ritz customer/account or Ritz booking candidate in staging, so the evidence used a temporary fake controlled pilot fixture only.
- The bounded pilot created exactly one fake customer/account, one matching fake saved booking, and one fake `customer_app` notification row for the evidence window.
- No real customer data was used.
- Pre-window closed proof passed with staging root HTTP 200/title `Prestige Limo Ops`, `GET /api/customer-saved-bookings` blocked with HTTP 403, and `GET/PATCH /api/customer-app-notifications` blocked with HTTP 403.
- Temporary runtime gates were opened only for the bounded evidence window using names-only/no-values handling: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`.
- Customer portal read proof passed through `GET /api/customer-saved-bookings` with HTTP 200 and exactly one safe saved-booking row for the fake controlled pilot account.
- Customer portal safe projection contained only approved customer-facing fields and exposed ten safe fields.
- Customer portal boundary proof passed for missing session, wrong session, wrong referer, and wrong customer/reference paths, all blocked with HTTP 403.
- Admin `Send In-App` proof passed through `POST /api/admin-customer-driver-app-notifications` with HTTP 200 using the approved fixed safe customer template only: title `Driver details ready` and message `Your Prestige Limo driver details are ready in your customer app.`
- Customer in-app read proof passed through `GET /api/customer-app-notifications` with HTTP 200 and exactly one safe `customer_app` notification row for the fake controlled pilot account.
- Customer in-app safe projection contained only approved customer-facing notification fields and exposed eleven safe fields.
- Customer in-app boundary proof passed for anonymous, missing-session, wrong-session, wrong-referer, and wrong-customer/reference paths, all blocked with HTTP 403.
- Cleanup proof passed with fake access account rows `0`, fake audit rows `0`, fake booking rows `0`, fake customer rows `0`, fake customer notification rows `0`, and `zero_matching_rows: true`.
- Rollback proof passed after a closed staging redeploy with no temporary gate overrides: staging root HTTP 200/title `Prestige Limo Ops`, `GET /api/customer-saved-bookings` HTTP 403, `GET/PATCH /api/customer-app-notifications` HTTP 403, and admin customer-app POST blocked with HTTP 403 and no write after rollback.
- The temporary fake controlled pilot fixture was cleaned up and left no matching customer/account, booking, audit, or notification rows.
- No provider send, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, shim, production activation, or production deploy occurred.
- No secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data were printed or recorded.
- Ritz Carlton controlled pilot evidence is complete for a fake controlled staging fixture; real Ritz/customer access, all-customer activation, production activation, free-form customer messages, and provider sends remain blocked until separately approved.

### Controlled One-Real-Customer Portal + Customer In-App Staging Pilot Evidence Record
- Evidence reference: `REAL-CUSTOMER-PILOT-20260623094425`.
- Staging target commit: `060b1e9 Record Ritz controlled customer runtime pilot evidence`.
- The pilot runner selected the safest existing active staging customer/account candidate without printing the customer name, customer ID, auth user ID, booking reference, booking row ID, row IDs, tokens, cookies, env values, or private customer data.
- Candidate selection used an existing real staging customer and one matching safe customer-linked booking.
- Candidate customer kind was `unspecified`; no preferred hotel/company/business account with an existing access mapping was required for this evidence pass.
- Pre-window proof showed active customer access account count `0`, staging root HTTP 200/title `Prestige Limo Ops`, `GET /api/customer-saved-bookings` HTTP 403, and `GET/PATCH /api/customer-app-notifications` HTTP 403.
- Exactly one controlled `customer_access_accounts` mapping was created for the selected real customer account during the pilot setup.
- The controlled access mapping remained active after evidence and rollback, with active mapping count `1` for the created pilot mapping.
- Temporary runtime gates were opened only for the bounded evidence window using names-only/no-values handling: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`.
- Customer portal read proof passed through `GET /api/customer-saved-bookings` with HTTP 200 and exactly one safe saved-booking row for the selected real customer account.
- Customer portal safe projection exposed ten safe fields only.
- Customer portal/customer in-app boundary proof passed for missing session, wrong session, wrong referer, and wrong customer/reference paths, all blocked with HTTP 403.
- Admin `Send In-App` proof passed through `POST /api/admin-customer-driver-app-notifications` with HTTP 200 using the approved fixed safe customer template only: title `Driver details ready` and message `Your Prestige Limo driver details are ready in your customer app.`
- Customer in-app read proof passed through `GET /api/customer-app-notifications` with HTTP 200 and exactly one safe `customer_app` notification row for the selected real customer account.
- Customer in-app safe projection exposed eleven safe fields only.
- The temporary customer-app evidence notification row was cleaned up after read proof, leaving `0` matching evidence notification rows.
- Rollback proof passed after a closed staging redeploy with no temporary gate overrides: staging root HTTP 200/title `Prestige Limo Ops`, `GET /api/customer-saved-bookings` HTTP 403, `GET/PATCH /api/customer-app-notifications` HTTP 403, and admin customer-app POST blocked with HTTP 403 and no write after rollback.
- DB write scope was limited to exactly one controlled customer access mapping plus one temporary `customer_app` notification row; the notification row was cleaned up, and the access mapping remained as the controlled pilot account mapping.
- No provider send, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, shim, production activation, or production deploy occurred.
- No secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, booking references, customer names, or private customer data were printed or recorded.
- Controlled one-real-customer staging pilot evidence is complete for one selected real staging customer/account and one matching safe booking; all-customer activation, production activation, free-form customer messages, provider sends, and broader customer access remain blocked until separately approved.

### Customer Portal Saved-Bookings Authenticated Read Evidence Contract Guard Lock
- This is a docs/test-only guard for a future separately approved bounded Customer Portal saved-bookings authenticated read evidence pass using one staging-safe customer account/reference.
- This lock does not activate customer auth, customer portal live read, session creation, cookie creation, token creation, env changes, DB reads/writes, notification row writes, customer in-app runtime/buttons, provider sends, Google Maps/OneMap/FlightAware calls, deploy, or production activation.
- `/my-bookings` remains shell/guarded until approved evidence.
- `/api/customer-saved-bookings` remains gated and must not become a broad read.
- `/api/customer-portal-sessions` remains default-off and must not expose session values.
- `/api/customer-app-notifications` remains fail-closed/auth-required 403.
- Future evidence requires exactly one staging-safe customer account/reference and one bounded authenticated read window.
- Future table/RLS proof must cover `customer_access_accounts`, `customer_driver_access_audit_events` or equivalent, and the customer-safe booking projection.
- Future row isolation proof must show customer A only sees customer A saved-booking rows and cannot see another customer account's rows.
- Future boundary proof must show anonymous, missing-session, wrong-session/token, wrong-customer/account, cross-origin, and wrong-referer paths blocked.
- Future audit proof must use `customer_driver_access_audit_events` or equivalent without recording raw tokens, cookies, JWTs, secrets, finance, payout, parser/debug, provider payloads, or real customer data.
- Future rollback/disable proof must close customer saved-bookings/session gates and verify blocked/no-read behavior again.
- Customer-safe saved-booking fields remain limited to booking reference, customer-facing status, service type, pickup date/time, pickup location, drop-off location, passenger name, and safe created/updated/month grouping fields.
- Passenger count and customer-facing flight number require separate contract alignment before becoming customer portal read evidence fields.
- Customer portal saved-bookings evidence must exclude pricing, payout, PayNow, `customer_rates`, `driver_payout_rules`, billing/payment/PDF/invoice, internal/admin notes, parser/debug, secrets/tokens/cookies/JWTs, raw provider payloads, live-location/photo/OTS data, provider sends, Save Booking internals, and `/api/admin-saved-bookings` internals.
- Driver in-app evidence/runtime, Google Maps evidence/runtime, and OneMap retirement do not unlock customer portal read or customer in-app notification runtime.
- This guard adds `scripts/test-customer-portal-saved-bookings-read-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Portal Saved-Bookings Staging Evidence Runner Guard Lock
- This is a docs/test-only guard plus a manual future runner for a separately approved Customer Portal saved-bookings staging evidence pass.
- The runner is `scripts/run-customer-portal-saved-bookings-staging-read-evidence.mjs`.
- The runner is not executed by this commit, and customer portal saved-bookings evidence remains not run.
- The runner requires `PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_APPROVED=customer-portal-saved-bookings-staging-read-approved` before any phase runs.
- The runner requires `PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_PHASE` to be one of `pre-window`, `read-window`, or `post-rollback`.
- The runner is staging-only and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_STAGING_TARGET_URL` or its default.
- The runner does not open gates, close gates, edit Vercel env, deploy, or print env values.
- The `read-window` phase requires the existing customer saved-bookings and customer portal session gates to already be open in staging.
- The `read-window` phase requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, and `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`.
- The `pre-window` and `post-rollback` phases perform blocked/no-read route proof only and do not write to the database.
- The `read-window` phase creates exactly one staging-safe fake customer, one matching customer access account, one matching saved booking, and one safe audit event.
- The `read-window` phase reads the saved booking through the guarded customer portal session and `/api/customer-saved-bookings` route.
- The `read-window` phase verifies anonymous, missing-session, wrong-session, cross-origin, unmatched-reference, safe-projection, wrong-auth-user no-account, and audit proof.
- The runner cleans up the exact staging evidence customer, access account, booking, and audit event, then verifies zero matching rows remain.
- The runner treats the staging `customers.id` as an opaque safe customer account reference, so UUID-shaped and non-UUID staging identifiers are supported without printing row IDs.
- The runner uses a thrown safe failure path so partial fixture cleanup can run before reporting a blocked evidence result.
- The runner must not use real customer data, notification row writes, customer in-app runtime/buttons, provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, shims, or production activation.
- The runner output is normalized and must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data.
- A future evidence pass still requires separate owner approval for staging env/gate/deploy window, runner execution, rollback/disable proof, docs evidence recording, and staging promotion.
- This guard adds `scripts/test-customer-portal-saved-bookings-staging-read-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Portal Saved-Bookings Staging Read Evidence Record
- Evidence reference: `CUSTOMER-PORTAL-SAVED-BOOKINGS-STAGING-20260622152544`.
- Evidence was run once on staging through `scripts/run-customer-portal-saved-bookings-staging-read-evidence.mjs`.
- The evidence used one staging-safe fake customer account/reference and one matching fake staging saved booking only.
- No real customer data was used.
- Pre-window closed proof passed with staging root HTTP 200/title `Prestige Limo Ops`, anonymous blocked HTTP 403, and wrong-referer blocked HTTP 403.
- Temporary staging read-window env/gate names were opened only for the bounded evidence window: `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, and `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`.
- The evidence route read used the guarded customer portal session and `GET /api/customer-saved-bookings` path.
- Boundary proof during the read window returned HTTP 403 for anonymous, cross-origin, missing-session, and wrong-session paths.
- Correct customer read proof returned HTTP 200 with exactly one saved-booking row.
- Safe projection proof passed with `safe_fields_only: true` and field count `10`.
- Row isolation proof passed: unmatched booking reference rows `0`, wrong-auth-user active account rows `0`.
- Audit proof passed with one safe audit event written for the evidence and then cleaned up.
- Cleanup proof passed: evidence booking, audit, access-account, and customer rows were deleted and zero matching rows remained afterward.
- Rollback proof passed after closing the gates and redeploying staging closed: staging root HTTP 200/title `Prestige Limo Ops`, anonymous blocked HTTP 403, and wrong-referer blocked HTTP 403.
- Temporary staging env/gate names were removed after the evidence window and verified absent.
- Local temporary evidence env files were removed after the evidence window.
- No notification row write, customer in-app runtime/button, provider send, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, shim, production activation, or production deploy occurred.
- No secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data were printed or recorded.
- Customer portal saved-bookings evidence is complete for the bounded staging-safe read lane, but broader customer portal runtime, customer in-app notification runtime/button, production activation, and real customer data access remain blocked until separately approved.

### Customer Booking + Driver Details Message Payload Safety Contract Lock
- This is a docs/test-only guard for future customer-facing customer booking plus driver details message payloads; it does not activate provider sends, credentials, env changes, DB reads/writes, deployment, runtime API behavior, UI, route/helper changes, live location implementation, scheduler, fallback, or blast behavior.
- Customer-facing driver-details messages must include both approved sections: CUSTOMER BOOKING DETAILS and DRIVER DETAILS.
- Driver details must not be sent without the relevant customer booking context.
- Allowed customer booking detail fields are customer/passenger/traveler name when available with customer-facing label `Passenger name:`, booking reference if available, service type, pickup date, pickup time, pickup location, drop-off location, passenger count, and flight number only if already customer-facing.
- Allowed driver-detail fields are driver name, driver contact, car plate, and car type.
- No extra customer booking fields or extra driver fields are approved by this lock.
- Future Email may app-send customer booking plus driver details through Resend only after admin explicitly clicks the Email action and the exact Email driver-details channel/action gate is separately approved/opened.
- Future Telegram may generate/copy customer booking plus driver details for manual admin send outside the app only; Telegram provider/API driver-details sending is not approved by this lock.
- Future WhatsApp may generate/copy customer booking plus driver details for manual admin send outside the app only; WhatsApp provider/API driver-details sending is not approved by this lock.
- Telegram may later send true live location as the first-priority live-location channel; POB trigger and POB plus 5 minute auto-stop require separate readiness, guard coverage, and owner-approved activation and are not active here.
- Email may later send secure tracking-link live location only when admin explicitly chooses that exact channel/action; Email must not auto-send live location and must not send native/streaming live location.
- SMS remains unapproved unless separately approved later.
- Admin must explicitly choose exactly one channel/action for each future send; no automatic fallback, no automatic multi-channel blast, and no provider send is approved without that specific channel/action gate approval.
- Customer-facing provider payloads must exclude pricing, payout, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, and auth/location/photo/calendar/OTS data unless the selected lane explicitly approves it later.
- This lock does not implement live location, Telegram auto-send, POB trigger, POB plus 5 minute auto-stop, provider activation, provider credentials, Telegram provider send, WhatsApp provider send, SMS send, runtime app/API behavior, UI, DB writes, or deploys.

### Customer Booking + Driver Details Copyable Message Preview Lock
- This is a bounded runtime implementation in the existing Customer Copy section.
- It reuses `data-dispatch-workflow-step="customer-whatsapp-copy"`, `data-copy-preview="customerCopy"`, `data-copy-copy-button="customerCopy"`, and `data-copy-edit-button="customerCopy"`.
- The generated plain-text preview has only `CUSTOMER BOOKING DETAILS` and `DRIVER DETAILS` sections.
- Allowed customer booking fields are customer/passenger/traveler name when available with customer-facing label `Passenger name:`, booking reference when available, service type, pickup date, pickup time, pickup location, drop-off location, passenger count, and customer-facing flight number only if available.
- Allowed driver fields are driver name, driver contact, car plate, and car type from assigned driver profile data only.
- Telegram and WhatsApp remain generate/copy/manual-send only; no Telegram API send, WhatsApp API send, automatic fallback, automatic multi-channel blast, provider credentials, provider activation, or provider send is included.
- Email remains separate through the gated Resend route and is not activated by this preview.
- The preview excludes pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, invoice content, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/location/photo/calendar/OTS data, live-location text, route extras, and child-seat/internal service extras.
- The Resend send route now uses a same-origin admin-surface closed-gate 503 proof path so the no-send gate can be verified without secret-token handling; that staging proof is completed for `81d91ec`, and any one-message Resend evidence still requires separate approval before a real send.
- Guard: `scripts/test-customer-booking-driver-details-copy-preview-guard.mjs`; suite registration in `scripts/test-preactivation-verification-suite.mjs`.

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

### Telegram Provider Activation Packet Supersession Lock
- The previous Telegram no-send approval packet is superseded by the approved `Telegram Internal Admin Alert Live Send Activation Lock`.
- The only approved live provider path is `POST /api/admin-telegram-internal-admin-alert-send`.
- The previous setup-only routes remain no-op/readiness evidence:
  `GET /api/admin-telegram-internal-admin-alert-preview-readiness-setup` and
  `GET /api/admin-telegram-internal-admin-alert-send-disabled-setup`.
- Telegram remains forbidden for customer sends, driver sends, live-location sends, webhooks, `getUpdates`, polling, scheduler/retry loops, batch sends, DB writes, schema changes, parser changes, Save Booking + CRM changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, new shims, or broad UI sectors.
- Provider env values, bot tokens, chat IDs, cookies, API keys, database URLs, and secrets must never be printed, logged, committed, screenshot, or returned to the browser.
- If the live provider test fails, close `PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED`, rotate any exposed bot token, and keep the disabled/no-op setup route surface available while investigating.

### Telegram True Live Location Evidence Contract Guard Lock
- This is a docs/test-only guard for a future separately approved Telegram True Live Location evidence pass.
- This lock does not activate Telegram provider setup, Telegram credentials, Telegram Bot API calls, Telegram sends, bot token creation/use, env changes, DB read/write, driver GPS capture, live-location routes/helpers, scheduler/timer/polling/retry behavior, customer map, admin live map, auth activation, session/token/cookie creation, deployment, UI expansion, or production activation.
- Future Telegram true live-location activation requires explicit owner approval.
- Future Telegram provider/bot setup requires explicit owner approval.
- Future staging chat/recipient allowlist requires explicit owner approval.
- Future live-location start action requires explicit owner approval.
- Future POB plus 5 minute auto-stop behavior requires explicit owner approval.
- Future driver location source requires explicit owner approval.
- Future DB persistence or RLS/policy changes require explicit owner approval if introduced.
- Future rollback/disable plan requires explicit owner approval.
- Future env/provider proof must be names-only and must not print tokens, chat IDs, cookies, passwords, API keys, env values, database URLs, or secrets.
- Future gate/env names are names-only: `PRESTIGE_TELEGRAM_LIVE_LOCATION_ENABLED`, `PRESTIGE_TELEGRAM_LIVE_LOCATION_STAGING_CHAT_ALLOWLIST`, `PRESTIGE_TELEGRAM_LIVE_LOCATION_AUTO_STOP_AFTER_POB_MINUTES`, and `TELEGRAM_BOT_TOKEN`.
- Future Telegram gate must be closed by default.
- Closed gate must not read `TELEGRAM_BOT_TOKEN`.
- Closed gate must not call Telegram.
- Public, customer, and driver unauthorized routes must not trigger Telegram sends.
- Admin/dispatcher boundary is required for any future start/send action.
- Staging chat/recipient allowlist proof is required.
- Future evidence is limited to exactly one bounded staging live-location evidence action unless separately approved.
- Batch send is forbidden.
- Retry loop is forbidden unless separately approved and bounded.
- Polling loop is forbidden unless separately approved and bounded.
- Scheduler/background worker is forbidden unless separately approved and bounded.
- Fallback to WhatsApp, SMS, or Email is forbidden.
- Automatic multi-channel blast is forbidden.
- POB status source proof is required from the guarded driver status workflow `driver_otw -> ots -> pob -> completed`.
- Auto-stop 5 minutes after POB proof is required.
- Rollback/disable proof is required after any future evidence pass.
- No token, chat ID, env value, raw provider payload, finance/internal/admin/provider/debug data, or secret may be exposed.
- No DB persistence is approved unless separately approved with table/RLS proof.
- Customer-facing Telegram live-location evidence must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, invoice content, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, or OTS photo/storage data unless separately approved.
- Telegram live location must remain separate from Customer/Driver Auth activation, OTS photo/storage, calendar, billing/payment/PDF, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, Email/WhatsApp/SMS sends, FlightAware live lookup, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.
- Current Telegram live-location surfaces remain setup-only/no-live and current live-location surfaces remain setup-only/disabled.
- No true live-location route/helper exists and no driver GPS source exists for true live location in this lane.
- WhatsApp remains a later phase.
- Email remains driver-details and admin-selected secure tracking link only; Email must not do native/streaming live location.
- This guard adds `scripts/test-telegram-live-location-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Location Source + POB Status Evidence Contract Guard Lock
- This is a docs/test-only guard for a future separately approved Driver Location Source + POB Status evidence pass before Telegram True Live Location activation.
- This lock does not activate driver GPS/location capture, driver location source implementation, Telegram live-location routes/helpers, Telegram Bot API calls, Telegram sends, bot token creation/use, env changes, DB read/write, coordinate persistence, scheduler/timer/polling/retry behavior, customer map, admin live map, OneMap provider calls, auth/session/cookie creation, OTS photo/storage, calendar, deployment, UI expansion, shims, or production activation.
- Future driver location source requires explicit owner approval.
- Future driver GPS/location capture requires explicit owner approval.
- Future Telegram live-location integration requires explicit owner approval.
- Future POB-driven auto-stop requires explicit owner approval.
- Future bounded timer/scheduler/polling requires explicit owner approval if needed.
- Future DB persistence/table/RLS proof requires explicit owner approval if coordinates are stored.
- Future rollback/disable plan requires explicit owner approval.
- Future gate/env proof must be names-only and must not print tokens, chat IDs, cookies, passwords, API keys, env values, database URLs, coordinates from real users, or secrets.
- Future gate/env names are names-only: `PRESTIGE_DRIVER_LOCATION_SOURCE_ENABLED`, `PRESTIGE_DRIVER_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_TELEGRAM_LIVE_LOCATION_ENABLED`, `PRESTIGE_TELEGRAM_LIVE_LOCATION_STAGING_CHAT_ALLOWLIST`, `PRESTIGE_TELEGRAM_LIVE_LOCATION_AUTO_STOP_AFTER_POB_MINUTES`, `TELEGRAM_BOT_TOKEN`, and `PRESTIGE_ONEMAP_LOOKUP_ENABLED` only if OneMap is later approved for map/geocode/routing support.
- POB source proof must use persisted `driver_job_status_events`.
- POB sequence proof must use `driver_otw -> ots -> pob -> completed`.
- Auto-stop proof must use a persisted `pob` event plus 5 minutes.
- Auto-stop must not rely on local UI state, demo state, or mock-only state.
- Driver location source proof is required before any Telegram live-location evidence.
- Location capture must be closed/disabled by default.
- Closed location gate must not capture GPS.
- Closed Telegram gate must not read `TELEGRAM_BOT_TOKEN`.
- Closed Telegram gate must not call Telegram.
- No OneMap call is approved in this lane.
- OneMap active admin map/search/route runtime is retired; any future OneMap reintroduction must remain separate from driver GPS and requires separate owner approval.
- Admin/dispatcher boundary is required for any future start, stop, or live-location action.
- Staging chat allowlist proof is required before any future Telegram evidence.
- No public, customer, or driver route may trigger Telegram sends unless separately approved and guarded.
- Rollback/disable proof must verify no GPS capture, no Telegram call, and no live-location send after gate close.
- No timer/scheduler/polling/retry/background worker may be introduced in this lane.
- Future auto-stop mechanism must be separately approved and bounded.
- Future timer/scheduler/polling proof must show one bounded live-location session only, no indefinite loop, no retry storm, no fallback send, no multi-channel blast, clean stop after POB plus 5 minutes, and rollback disables the mechanism.
- Future driver/live-location evidence must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, invoice content, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, OTS photo/storage data unless separately approved, or calendar data unless separately approved.
- Driver location source + POB must remain separate from Save Booking, parser, `/api/admin-saved-bookings`, pricing/rates/customer_rates, `driver_payout_rules`, payout/payment/PDF/billing/invoice, auth/session/cookie, OTS/photo/storage, calendar, UI sector/card/button expansion, shims, Email/WhatsApp/SMS sends, FlightAware live lookup, and production activation.
- Current POB source candidate is the production driver job status path: `PATCH /api/driver-job/[token]/status` writing `pob` into `driver_job_status_events` through the guarded `driver_otw -> ots -> pob -> completed` workflow.
- Current driver location source is absent: no current GPS capture, Telegram live-location source, or live driver coordinate stream exists.
- Current live-location surfaces remain setup-only/disabled with no driver browser GPS capture, no customer map link, no admin live map, no external map tracking, and no database read/write.
- This guard adds `scripts/test-driver-location-pob-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Capture + Admin Active Jobs Map Contract Guard Lock
- This is a docs/test-only guard for future separately approved Driver Live Location Capture and Admin Active Jobs Map implementation.
- This lock does not activate driver browser GPS capture, driver location write/read APIs, admin active-jobs map runtime, customer live map links, location storage, table/RLS changes, env changes, deploy, provider sends, Google Maps browser key exposure, OneMap retry, Telegram live-location sends, WhatsApp/Email/SMS fallback, billing/payment/PDF/payout, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, UI sector/card expansion, shims, or production activation.
- Current state remains setup-only/disabled: no driver GPS capture, no coordinate persistence, no admin active-jobs map, no customer live map link, no external map tracking, and no database read/write.
- The exact-2/exact-3/exact-5 customer runtime pilots are customer portal/in-app allowlist scopes only; they are not driver live-location capacity limits.
- Future admin active-jobs map must support multiple simultaneous active jobs by showing one admin-only marker per actively sharing driver/job, with stale/offline state instead of hiding failure.
- Future driver capture must be explicit opt-in from the existing driver job link, require browser location permission, show clear sharing state to the driver, and provide an explicit stop control.
- Future capture must be scoped to the current driver job token and assigned job only; one driver token must not see or write another driver/job location.
- Future admin map read must be admin/dispatcher-only and same-origin/admin-boundary protected.
- Future customer visibility is not approved by this lane; any customer live map link remains a separate later approval.
- Future base-map rendering must not expose the existing server-side Google Maps key. Any browser map key requires a separately approved, domain-restricted, names-only env plan before use.
- Future provider/base-map env names are names-only and must not print values: `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`, `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_DRIVER_LIVE_LOCATION_MODE`, `PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`, `PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`, `PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`, `PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`, and a separately approved browser-safe map key name if needed.
- Closed gates must not call `navigator.geolocation`, must not read map/provider keys, must not create a DB client, must not write coordinates, and must not render an active admin map.
- Future safe admin-visible location fields are limited to driver display label, assigned job label/reference, driver job status, vehicle/plate label if already assigned, latest latitude/longitude, accuracy, heading/speed if browser provides them, last updated time, stale/offline flag, and sharing state.
- Future driver-visible fields are limited to the current job location-sharing state, permission state, last shared time, and stop/share controls.
- Future location rows must not include pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, customer contact details, customer messages, OTS/photo/storage, or calendar data unless separately approved.
- Future persistence requires a separately approved table/RLS/retention proof before live coordinates are stored.
- Future persistence must prefer latest-location state plus bounded audit events over unbounded coordinate history unless owner separately approves retention.
- Future cleanup/retention proof must define how test/evidence rows are removed and how stale production rows expire.
- Future POB/job-complete stop behavior must use persisted driver status events from the guarded `driver_otw -> ots -> pob -> completed` workflow, not local/demo/mock state.
- Future auto-stop must be bounded, must not create an indefinite polling loop, and must stop capture after the approved POB/job-complete policy window.
- Future evidence must begin with closed-gate proof, use fake/staging-safe jobs first, prove anonymous/wrong-driver/wrong-admin blocked paths, prove no forbidden fields, prove rollback/disable, and prove zero matching temporary location rows remain after cleanup.
- Future runtime must remain separate from Telegram True Live Location, Email/WhatsApp/SMS provider sends, Google Maps admin search/route estimates, OneMap, FlightAware, customer portal/in-app runtime, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.
- This guard adds `scripts/test-driver-live-location-active-jobs-map-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Disabled Scaffold Implementation
- This adds disabled-by-default scaffold routes for future Driver Live Location Capture and Admin Active Jobs Map runtime wiring.
- `POST /api/driver-job/[token]/live-location` is present as a future driver share/capture scaffold, but returns safe HTTP 503 no-op.
- `DELETE /api/driver-job/[token]/live-location` is present as a future driver stop-sharing scaffold, but returns safe HTTP 503 no-op.
- `GET /api/admin-active-jobs-map-locations` is present as a future admin active-jobs map read scaffold, but remains admin-boundary protected and returns safe HTTP 503 no-op with an empty active-jobs list.
- The scaffold does not call browser GPS APIs, does not parse coordinate request bodies, does not create a Supabase client, does not read or write location rows, does not render a map, does not read map/provider keys, and does not call Google Maps, OneMap, Telegram, WhatsApp, Email, SMS, or any provider.
- The driver scaffold does not print or return the driver token; it exposes only whether a token parameter was present.
- The admin scaffold reuses the internal admin/dispatcher boundary before returning the closed no-op payload.
- Gate/env names are names-only and values must not be printed: `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`, `PRESTIGE_DRIVER_LIVE_LOCATION_MODE`, `PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`, `PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`, `PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`, and `PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`.
- Safe scaffold responses keep `gpsCaptureEnabled`, `locationStorageEnabled`, `liveMapEnabled`, `customerVisible`, and `external_send` false; driver sharing state remains inactive and admin active-jobs output remains empty.
- This lane does not add UI, map rendering, database schema, table/RLS policy, evidence runner, env change, deploy, production activation, provider send, Telegram true live-location, customer live map link, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, or shim work.
- Next activation blockers remain: table/RLS/retention proof for live position storage, driver consent UI, admin active-jobs map UI, browser-safe domain-restricted map key plan if a browser map is needed, closed-gate evidence, fake/staging-safe evidence, cleanup proof, rollback proof, and owner approval.
- This scaffold adds `lib/driver-live-location-scaffold.ts`, `POST/DELETE /api/driver-job/[token]/live-location`, `GET /api/admin-active-jobs-map-locations`, `scripts/test-driver-live-location-disabled-scaffold-guard.mjs`, and preactivation suite registration.

### Driver Live Location Closed-Gate Route Smoke Guard Lock
- This is a local docs/test-only in-process smoke guard for the disabled Driver Live Location route scaffold.
- This lock does not activate GPS capture, live-location runtime, admin active-jobs map runtime, customer live map links, route/helper writes, table reads/writes, migration application, env changes, deploy, provider calls, provider sends, billing/payment/PDF/payout, or production activation.
- The guard calls `POST /api/driver-job/[token]/live-location` through a temporary harness and requires HTTP 503 safe no-op with `action: "share"`, `gpsCaptureEnabled: false`, `locationStorageEnabled: false`, `liveMapEnabled: false`, `customerVisible: false`, `external_send: false`, and `sharing_state: "inactive"`.
- The guard calls `DELETE /api/driver-job/[token]/live-location` through a temporary harness and requires HTTP 503 safe no-op with `action: "stop"` and the same disabled/no-op flags.
- The guard calls `GET /api/admin-active-jobs-map-locations` anonymously and requires HTTP 403 before any active-jobs payload is returned.
- The guard calls `GET /api/admin-active-jobs-map-locations` with the same-origin admin surface boundary and requires HTTP 503 safe no-op with `active_jobs: []`, `map_rendered: false`, and `marker_count: 0`.
- The guard must not print or return driver job tokens, Supabase URLs, service-role keys, anon keys, row IDs, booking references, private customer data, live coordinates, cookies, JWTs, API keys, env values, or secrets.
- The guard must not parse coordinate request bodies, call browser GPS APIs, create a Supabase client, read/write location rows, render a map, read map/provider keys, call Google Maps/OneMap/FlightAware, send Email/Telegram/WhatsApp/SMS, run timers/schedulers/polling/retries, or touch billing/payment/PDF/payout.
- This smoke guard is not live evidence and does not replace future separately approved fake/staging-safe table/RLS, GPS capture, admin map, stale/offline, POB auto-stop, customer access, cleanup, and rollback evidence.
- This guard adds `scripts/test-driver-live-location-closed-gate-route-smoke-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Table/RLS/Retention Evidence Contract Guard Lock
- This is a docs/test-only guard for future Driver Live Location table/RLS/retention evidence.
- This lock does not create migrations, tables, RLS policies, coordinate storage, GPS capture, runtime DB reads/writes, admin active-jobs map runtime, customer live map links, env changes, deploy, provider calls, or production activation.
- `driver_live_location_latest_positions` is the future latest-position state table name only; it is not created in this lane.
- `driver_live_location_audit_events` is the future bounded audit-event table name only; it is not created in this lane.
- Future latest-position rows are limited to driver job link reference, booking reference, driver display label, assigned job label, job status, vehicle/plate label if assigned, latitude, longitude, accuracy meters, heading degrees, speed meters per second, captured at, stale after, sharing state, source surface, evidence reference when applicable, and updated at.
- Future audit-event rows are limited to event type, driver job link reference, booking reference, occurred at, safe event context, source surface, actor role, evidence reference when applicable, and created at.
- Future driver write isolation must resolve the current driver job token server-side, must not accept arbitrary booking references from the browser, and must allow writes only for the resolved active assigned driver job.
- Future admin read isolation must require the internal admin/dispatcher boundary, same-origin admin surface, and gate approval before any active-jobs map rows are read.
- Future direct table access must block anonymous, customer, wrong-driver, wrong-token, and non-admin paths through RLS or equivalent database policy proof.
- Future retention must prefer one latest-position row per active sharing driver/job plus bounded audit events, not unbounded coordinate history.
- Future stale cleanup must define stale/offline thresholds, retention minutes, evidence row cleanup, and zero matching temporary rows after evidence.
- Future evidence must prove closed gates, fake/staging-safe rows first, wrong-driver blocked, wrong-admin blocked, forbidden fields absent, cleanup zero rows, rollback disabled, and no customer live map.
- Future table rows must not contain raw driver job tokens, token hashes, cookies, JWTs, API keys, service-role keys, customer contact details, customer messages, pricing, payout, PayNow, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.
- Future gate/env names are names-only and values must not be printed: `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`, `PRESTIGE_DRIVER_LIVE_LOCATION_MODE`, `PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`, `PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`, `PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`, and `PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`.
- This guard keeps the current disabled scaffold closed until a separately approved table/RLS migration scaffold is reviewed and promoted.
- This guard adds `scripts/test-driver-live-location-table-rls-retention-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Table/RLS Migration Scaffold Lock
- This adds a disabled-by-default SQL migration scaffold for Driver Live Location table/RLS/retention storage.
- This migration scaffold is file-only and was not applied to any database in this lane.
- No DB read/write, GPS capture, coordinate collection, admin active-jobs map runtime, customer live map, env change, deploy, provider call, provider send, billing/payment/PDF/payout, parser, Save Booking, or `/api/admin-saved-bookings` behavior is activated.
- The future latest-position table is `driver_live_location_latest_positions`.
- The future bounded audit table is `driver_live_location_audit_events`.
- RLS is enabled for both tables with no public, customer, anonymous, broad authenticated, or direct driver policies in this scaffold.
- Direct grants to `anon` and `authenticated` are revoked in the scaffold.
- The latest-position table is one-row-per-driver-job-link through `driver_live_location_latest_positions_job_link_key`.
- The scaffold stores safe driver/job/location operational fields only and excludes raw driver job tokens, token hashes, cookies, JWTs, API keys, service-role keys, customer contact details, customer messages, pricing, payout, PayNow, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, and calendar data.
- A later separately approved route/helper evidence lane must prove server-side driver job token resolution, driver write isolation, admin read isolation, stale cleanup, evidence cleanup, zero temporary rows, rollback disabled state, and no customer live map before GPS capture or active map runtime is enabled.
- This lane adds `supabase/migrations/202606240001_driver_live_location_table_rls_retention_foundation.sql`, `scripts/test-driver-live-location-table-rls-migration-scaffold-guard.mjs`, updates the table/RLS/retention contract guard for the new migration-scaffold state, and registers the new guard in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Table/RLS Evidence Runner Guard Lock
- This adds a disabled-by-default runner scaffold for future Driver Live Location table/RLS/retention evidence.
- The runner is `scripts/run-driver-live-location-table-rls-retention-evidence.mjs`.
- The runner is not executed by this commit, no migration was applied, and no database read/write occurred.
- The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_APPROVED=driver-live-location-table-rls-retention-evidence-approved` before any phase runs.
- The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_PHASE` to be one of `pre-window`, `db-window`, or `post-rollback`.
- The runner is staging-only by default and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_TARGET_URL` or its default.
- `pre-window` and `post-rollback` prove the driver capture and admin active-jobs routes are blocked/closed without database access.
- `db-window` requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE`, `PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_DRIVER_JOB_LINK_ID`, and `PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_BOOKING_REFERENCE`.
- Future `db-window` evidence may write exactly one fake latest-position row and one fake audit row for a staging-safe driver job link, then must clean them up and prove zero matching rows remain.
- Future proof must show anonymous table access is blocked, service-role fixture cleanup succeeds, routes are closed before and after the window, no customer live map is enabled, and no provider sends occur.
- The runner output is normalized and must not print Supabase URLs, service-role keys, anon keys, driver job tokens, row IDs, booking references, private customer data, coordinates from real users, cookies, JWTs, API keys, or env values.
- This runner does not open gates, edit Vercel env, deploy, apply migrations, activate GPS capture, activate admin active-jobs map runtime, activate customer live map links, call Google Maps/OneMap/FlightAware, send provider messages, or touch billing/payment/PDF/payout.
- A future evidence pass still requires separate owner approval for migration application state, staging-safe driver job target, DB evidence window, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.
- This guard adds `scripts/test-driver-live-location-table-rls-retention-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Table/RLS Evidence Record
- Evidence reference: `DRIVER-LIVE-LOCATION-RLS-EVIDENCE-20260624T121500`.
- Owner approved applying the existing Driver Live Location table/RLS/retention migration or equivalent Supabase RLS/grant fix after the first evidence attempt found anonymous table access was not blocked.
- The checked-in migration `supabase/migrations/202606240001_driver_live_location_table_rls_retention_foundation.sql` was applied externally through the Supabase SQL editor; no secrets, API keys, env values, row IDs, booking references, driver job tokens, private customer data, or real coordinates were printed or recorded.
- After migration application, direct anonymous reads were blocked for both `driver_live_location_latest_positions` and `driver_live_location_audit_events`.
- Pre-window closed-route proof passed: admin active-jobs map remained blocked, driver live-location capture remained closed, and driver live-location stop remained closed.
- Bounded DB evidence used exactly one temporary fake `driver_job_links` row, one fake latest-position row, and one fake audit row through a Supabase SQL window; the proof enforced count `1` for each fake live-location row before cleanup and then deleted all temporary rows.
- Cleanup proof passed with zero matching fake latest-position rows, zero matching fake audit rows, and zero matching fake driver-job-link rows remaining.
- Post-rollback closed-route proof passed: admin active-jobs map remained blocked, driver live-location capture remained closed, and driver live-location stop remained closed.
- No GPS capture, browser geolocation, admin active-jobs map runtime, customer live map, customer live-location link, provider call, provider send, Email/Telegram/WhatsApp/SMS, Google Maps/OneMap/FlightAware call, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, env change, deploy, or production activation was performed.
- Driver Live Location remains closed by default; the next lane is still explicit driver consent UI and guarded runtime implementation/evidence, not automatic GPS activation.

### Driver Live Location Consent UI Disabled Scaffold Implementation
- This adds a compact disabled Driver Live Location consent UI scaffold to the existing driver job link page.
- The scaffold renders explicit Share Location and Stop Sharing controls; runtime handlers are present but disabled by default behind the Share/Stop UI gate and browser GPS gate.
- The scaffold shows only driver-visible safe state fields: sharing state, permission state, last shared time, and stale/offline state.
- The scaffold does not call `navigator.geolocation` or the driver live-location route unless the gated runtime UI is open and the driver explicitly clicks Share Location or Stop Sharing; it does not read or write location rows while gates are closed, does not open gates, does not create a Supabase client, and does not call providers.
- The existing driver live-location capture/stop route remains closed with HTTP 503 safe no-op behavior.
- No customer live map link, admin active-jobs map runtime, browser map key, DB write, env change, deploy, provider send, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, auth expansion, or shim work is activated.
- Next live-location lane remains a separately approved live evidence pass with explicit driver consent, wrong-driver/wrong-admin blocked proof, cleanup zero rows, rollback proof, and no customer visibility unless separately approved.

### Driver Live Location Admin Active Jobs Map Disabled Scaffold Implementation
- This adds a compact disabled Admin Active Jobs Map scaffold inside the existing Day-of-Trip Dispatch Monitor admin surface.
- The scaffold is a local UI status strip only; it shows future admin-only marker count, sharing state, and stale/offline state with all values disabled/off by default.
- The scaffold does not render a base map, map canvas, map script, or provider widget.
- The scaffold does not call `GET /api/admin-active-jobs-map-locations`, does not call `navigator.geolocation`, does not read map/browser keys, does not create a Supabase client, and does not read or write location rows.
- The scaffold does not expose driver coordinates, customer live map links, customer visibility, browser map keys, raw provider payloads, row IDs, tokens, secrets, or env values.
- No driver GPS capture, admin active-jobs map runtime, customer live map, DB read/write, env change, deploy, provider send, Email/Telegram/WhatsApp/SMS, Google Maps/OneMap/FlightAware call, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, auth expansion, or shim work is activated.
- The scaffold remains colocated with the existing Day-of-Trip Dispatch Monitor and does not add a new UI sector/card.
- Next live-location lane remains separately approved gated runtime/evidence with explicit driver consent, table/RLS/retention proof already recorded as prerequisite, wrong-driver/wrong-admin blocked proof, cleanup zero rows, rollback proof, and no customer visibility unless separately approved.

### Driver Live Location Gated Runtime Evidence Contract Guard Lock
- This is a docs/test-only guard for a future separately approved Driver Live Location gated runtime evidence pass.
- This lock does not activate GPS capture, open driver live-location routes, open admin active-jobs map reads, write/read location rows, change env, deploy, expose browser map keys, call providers, send messages, activate customer live map visibility, or touch billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work.
- Current prerequisites are recorded but still closed: table/RLS evidence is complete, driver consent UI scaffold is disabled, admin active-jobs map scaffold is disabled, and closed-gate route smoke is complete.
- Future runtime evidence requires separate owner approval naming the exact target, gate window, staging-safe driver job, evidence reference, cleanup plan, rollback plan, and whether a browser map key is involved.
- Future evidence must begin with closed-gate proof for driver share, driver stop, and admin active-jobs routes before any approved window is opened.
- Future driver capture must be explicit opt-in from the existing driver job link through the Share Location control, require browser permission, show sharing state, and provide Stop Sharing.
- Future capture must never auto-start from page load, driver status buttons, POB, OTW, OTS, Completed, copy, email, in-app, Telegram, WhatsApp, SMS, customer portal, or admin map actions.
- Future driver writes must resolve the current driver job token server-side and may write only for the resolved active assigned driver job; browser-submitted booking references, arbitrary job IDs, wrong tokens, and wrong drivers must be blocked.
- Future admin active-jobs reads must require the internal admin/dispatcher boundary and same-origin admin surface before any location rows are read.
- Future admin UI proof must show one admin-only marker/status row per actively sharing driver/job, visible stale/offline state, and no silent hiding or pretending stale drivers are live.
- Future customer visibility remains blocked; no customer live map link, Customer Copy live-location URL, customer portal tracking, customer in-app tracking, or customer-visible driver movement is approved by this lock.
- Future browser map rendering remains blocked unless a separately approved browser-safe, domain-restricted map key plan is complete; the existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY` must never be exposed to client code.
- Future evidence may write only bounded temporary live-location latest-position and audit rows for the approved fake/staging-safe job, then must clean them up and prove zero matching rows remain.
- Future evidence must prove anonymous, wrong-driver, wrong-token, wrong-admin, wrong-origin, closed-gate, missing-config, and rollback-disabled paths are blocked without leaking secrets or private data.
- Future evidence must prove no forbidden fields appear in driver UI, admin UI, route responses, normalized logs, temporary rows, or docs evidence.
- Forbidden fields remain pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, mock QA/dev archive fields, and env values.
- Future stop proof must include explicit Stop Sharing rollback or equivalent bounded stop evidence; future POB/completed auto-stop remains a separate proof unless explicitly included in the approved evidence task.
- No scheduler, indefinite polling, retry storm, queue, cron, fallback send, provider send, Telegram true live-location send, Email/WhatsApp/SMS send, customer blast, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work is approved by this lock.
- Gate/env names are names-only and values must not be printed: `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`, `PRESTIGE_DRIVER_LIVE_LOCATION_MODE`, `PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`, `PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`, `PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`, `PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`, `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE`, and any separately approved browser-safe map key env name.
- This guard adds `scripts/test-driver-live-location-gated-runtime-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Gated Runtime Path Implementation
- This wires a disabled-by-default server-only Driver Live Location runtime path behind the existing driver capture and admin active-jobs map scaffold routes.
- Default state remains closed: without `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED=true`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED=true`, and `PRESTIGE_DRIVER_LIVE_LOCATION_MODE=runtime` or `evidence`, the routes return the existing safe HTTP 503 no-op scaffold payloads.
- The route files do not statically create Supabase clients and do not parse coordinate request bodies before the gate check; the server-only runtime helper is loaded by dynamic import only after the relevant gate and mode are open.
- Driver share/stop writes are scoped to the server-resolved driver job token hash and the allowlisted booking references in `PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`.
- Driver share accepts only `latitude`, `longitude`, `accuracy_meters`, `heading_degrees`, `speed_meters_per_second`, and `captured_at` from the approved driver job link request body.
- Driver stop deletes the latest-position row for the resolved driver job link and writes a bounded audit event.
- Admin active-jobs reads remain admin/dispatcher-boundary protected and return only allowlisted active/stale latest-position rows for admin use.
- Runtime responses keep `customerVisible: false` and `external_send: false`; customer live-location links and customer tracking remain blocked.
- No browser GPS UI activation, no admin browser map rendering, no customer live map link, no provider send, no Telegram live-location send, no Email/WhatsApp/SMS, no Google Maps/OneMap/FlightAware call, no billing/payment/PDF/payout, no parser, no Save Booking, no `/api/admin-saved-bookings`, no auth expansion, no OTS/photo/storage, no calendar, no shim, and no production activation is approved by this lane.
- Future evidence still requires a separately approved gate window, safe driver job target, cleanup zero-row proof, rollback proof, and no-forbidden-field proof.
- Runtime env names are names-only and values must never be recorded: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE`.
- This guard adds `scripts/test-driver-live-location-gated-runtime-path-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Admin-Controlled Runtime Gate Readiness Lock
- This is a docs/test-only readiness lock for replacing temporary deploy-time live-location evidence gates with a future admin-controlled runtime gate.
- Normal live operation must not depend on Vercel CLI gate flips, repeated redeploys, or locally injected evidence env values.
- Future production operation should install stable server env names once, then use an admin/dispatcher-controlled runtime setting to open or close Driver Live Location without a redeploy.
- The current app remains closed by default and this lane does not add a live admin toggle, does not open GPS capture, does not open admin active-jobs map reads, does not write/read location rows, does not change env, and does not deploy.
- Future admin-controlled runtime gate must be disabled by default, admin/dispatcher-only, same-origin protected, audited, scoped to explicit booking/job references or a small approved allowlist, and rollbackable without a deploy.
- Future driver sharing must still require explicit driver consent from the job-token-scoped driver page and must never auto-start from page load, OTW, OTS, POB, Completed, customer copy, email, in-app, Telegram, WhatsApp, or SMS actions.
- Future admin active-jobs map reads must still require the internal admin/dispatcher boundary and must never expose driver coordinates to customers until the separate customer live-location lane is approved.
- Future admin gate UI must be compact and live in the existing admin dispatch/live-location area, not a new giant card, not Customer Copy, and not a duplicate sector.
- Future admin gate write path must prove server-session admin/dispatcher auth, exact setting row scope, audit event, wrong-admin blocked proof, rollback/disable proof, and no broad all-driver activation.
- Future evidence must prove the admin gate can open and close runtime without Vercel CLI, without changing env during the evidence window, and without leaving gates open after rollback.
- Future stable install env names are names-only and values must not be printed: `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`, `PRESTIGE_DRIVER_LIVE_LOCATION_MODE`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Future admin-controlled setting names are names-only and values must not be printed: `driver_live_location_capture_enabled`, `admin_active_jobs_map_enabled`, `driver_live_location_mode`, `driver_live_location_allowed_job_references`, `driver_live_location_stale_after_seconds`, and `driver_live_location_retention_minutes`.
- No provider sends, Email/Telegram/WhatsApp/SMS, Google Maps/OneMap/FlightAware calls, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, shim work, customer live map, free-form chat, or production activation is approved by this readiness lock.
- This guard adds `scripts/test-driver-live-location-admin-runtime-gate-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Admin-Controlled Runtime Gate Scaffold
- This lane adds the disabled-by-default server-side scaffold for a future admin-controlled Driver Live Location runtime gate.
- No admin toggle UI, no setting write route, no DB migration, no env change, no deploy, no GPS activation, no customer live map, and no provider send is included.
- The existing env gates remain the stable server-side kill switch and must still be open before any runtime setting can be read.
- `evidence` mode preserves the existing bounded env-gated evidence path and still requires explicit allowed job references.
- `runtime` mode requires the server to read exactly one admin-controlled setting row from `driver_live_location_runtime_settings` with `setting_name=driver_live_location_runtime`.
- The runtime setting row must be `active`, `driver_live_location_mode=runtime`, have the relevant purpose enabled, and name explicit safe job references before capture or admin map reads can proceed.
- Missing settings, closed settings, missing references, invalid references, or missing Supabase config fail closed with safe 503/no-op responses.
- The scaffold rejects broad/all-driver activation by requiring explicit safe booking/job references and rejecting wildcard or empty reference lists.
- Driver capture remains job-token scoped and explicit-driver-consent scoped; admin active-jobs map remains admin/dispatcher-boundary scoped; customer visibility remains false.
- No pricing, payout, PayNow, billing/payment/PDF, internal/admin notes, parser/debug, secrets/tokens, raw provider payloads, customer contact data, phone numbers, OTS/photo/storage, or mock QA/dev archive fields are exposed.
- This guard adds `scripts/test-driver-live-location-admin-runtime-gate-scaffold-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Admin-Controlled Runtime Gate Evidence Runner Guard Lock
- This adds a disabled-by-default runner scaffold for future Driver Live Location admin-controlled runtime gate evidence.
- The runner is `scripts/run-driver-live-location-admin-runtime-gate-evidence.mjs`.
- The runner is not executed by this commit, no env was changed, no database read/write occurred, no GPS capture was activated, and no provider send occurred.
- The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_APPROVED=driver-live-location-admin-runtime-evidence-approved` before any phase runs.
- The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_PHASE` to be one of `pre-window`, `runtime-window`, or `post-rollback`.
- The runner is staging-only by default and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_TARGET_URL` or its default.
- `pre-window` and `post-rollback` prove driver capture and admin active-jobs map routes are blocked/closed without database access.
- `runtime-window` requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_REFERENCE`, `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_DRIVER_JOB_LINK_TOKEN`, and `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_BOOKING_REFERENCE`.
- Future `runtime-window` evidence may create exactly one temporary fake `driver_job_links` row, one temporary admin runtime setting row, one fake latest-position row through the driver route, and audit rows produced by the runtime path.
- The runner must restore the previous `driver_live_location_runtime_settings` row or delete the temporary row if none existed, then clean up temporary driver link, latest-position, and audit rows and prove zero matching evidence rows remain.
- The runner must prove correct driver share, admin active-jobs map read, wrong-origin admin block, missing-admin block, wrong-driver block, customer visibility false, external_send false, and rollback/closed proof.
- The runner output is normalized and must not print Supabase URLs, service-role keys, admin session tokens, raw driver tokens, token hashes, row IDs, booking references, private customer data, coordinates from real users, cookies, JWTs, API keys, or env values.
- This runner does not edit Vercel env, deploy, apply migrations, activate browser GPS automatically, activate customer live map links, call Google Maps/OneMap/FlightAware, send provider messages, or touch billing/payment/PDF/payout.
- A future evidence pass still requires separate owner approval for stable server env gate state, staging-safe fake driver job token/reference, runtime DB window, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.
- This guard adds `scripts/test-driver-live-location-admin-runtime-gate-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Runtime Settings Migration Scaffold Lock
- This adds a file-only SQL migration scaffold for the missing `driver_live_location_runtime_settings` table.
- The migration is `supabase/migrations/202606240002_driver_live_location_runtime_settings_foundation.sql`.
- The migration was applied through the Supabase SQL Editor on 2026-06-24 after separate owner approval; Supabase reported success with no rows returned.
- The database change was limited to this table/index/comment/RLS/grant migration. No env change, deploy, GPS capture, admin active-jobs runtime, customer live map, provider call/send, Email/Telegram/WhatsApp/SMS, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work is activated.
- The table is a singleton keyed by `setting_name=driver_live_location_runtime`.
- Default state is closed: `setting_status=closed`, `driver_live_location_mode=closed`, capture disabled, admin map disabled, and no allowed job references.
- The table permits only explicit safe job references and rejects wildcard/all-driver/all-job references.
- RLS is enabled with no public, customer, anonymous, broad authenticated, or direct driver policies.
- `anon` and `authenticated` grants are revoked; only `service_role` is granted server-side table access.
- Runtime evidence was rerun after the migration apply and admin dispatcher auth env sync, using the approved bounded fake staging driver/job target only.
- The accepted evidence pass proved closed default state, explicit fake reference scoping, cleanup/zero-row proof, rollback/disable proof, and no customer live map.
- This guard adds `scripts/test-driver-live-location-runtime-settings-migration-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Admin Runtime Evidence Record
- Evidence reference: `DRIVER-LIVE-LOCATION-ADMIN-RUNTIME-20260624`.
- Source-of-truth at evidence time: `acf7f1c Record driver live location runtime settings migration apply`.
- Stable server env gates were set through Vercel Production env for the staging project and redeployed before evidence: `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`, and `PRESTIGE_DRIVER_LIVE_LOCATION_MODE`.
- Admin dispatcher auth envs were synced through Vercel Production env for the staging project and redeployed before evidence: `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`, and `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`.
- Vercel sensitive env values, Supabase values, admin session tokens, raw driver tokens, token hashes, row IDs, booking references tied to real users, private customer data, and env values were not printed or recorded.
- Pre-window closed proof passed: driver capture returned HTTP 503 and admin active-jobs map returned HTTP 403 before the runtime setting window.
- Runtime-window proof used one fake driver job link token/reference and one fake booking reference only.
- Driver share proof passed through `POST /api/driver-job/[token]/live-location` with HTTP 200, `customer_visible false`, and `external_send false`.
- Admin active-jobs map proof passed through `GET /api/admin-active-jobs-map-locations` with HTTP 200, marker count `1`, `customer_visible false`, and `external_send false`.
- Boundary proof passed: missing admin was blocked HTTP 403, wrong origin was blocked HTTP 403, and wrong driver token was blocked HTTP 401.
- Cleanup proof passed: temporary fake driver-job link, latest-position, audit/runtime evidence rows were cleaned up and zero matching evidence rows remained.
- Runtime setting rollback proof passed: the previous `driver_live_location_runtime_settings` state was restored or the temporary setting was removed.
- Post-rollback closed proof passed: driver capture returned HTTP 503 and admin active-jobs map returned HTTP 403 after the runtime window.
- No real GPS, browser geolocation, real driver/customer data, customer live map, provider send, Email/Telegram/WhatsApp/SMS, Google Maps/OneMap/FlightAware call, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work was activated.

### Vercel Env Drift Names-Only Audit Guard Lock
- This adds a no-value Vercel env drift audit guard for env-sensitive runtime lanes.
- The optional audit runner is `scripts/run-vercel-env-name-drift-audit.mjs`.
- The preactivation suite runs `scripts/test-vercel-env-drift-audit-guard.mjs`; it does not call Vercel.
- The optional runner checks Vercel project env names only and must not pull, print, compare, or store env values.
- The optional runner is read-only and must not add, remove, edit, sync, or deploy Vercel env.
- The optional runner must never use `vercel env pull`, `vercel env add`, `vercel env rm`, `vercel deploy`, `vercel --prod`, or deployment-time overrides.
- The required names-only set covers Supabase, admin dispatcher auth, booking persistence, typed Load Bookings, Driver Live Location stable gates, Google Maps admin map gates, and Driver Details Email/Resend gates.
- The audit output is normalized to counts and missing env names only; it must not print Supabase URLs, service-role keys, Resend keys, Google keys, admin session tokens, env values, cookies, DB URLs, row IDs, booking references, or private customer/driver data.
- A missing env name is only a configuration drift signal; the audit does not approve opening gates, DB writes, provider sends, GPS activation, production activation, billing/payment/PDF/payout, or deploys.
- This guard adds `scripts/test-vercel-env-drift-audit-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Consent Runtime Evidence Contract Guard Lock
- This is a docs/test-only guard for the future Driver Live Location driver-consent runtime evidence pass.
- Share/Stop runtime wiring is server-gated by the driver live-location runtime policy plus an explicit Share Location click.
- Current driver job pages must not auto-start sharing from page load or status buttons, and browser GPS is requested only after the server readiness check accepts the current driver job token.
- Future evidence must use one fake or staging-safe driver job target only, never a real driver/customer trip, and must not print tokens, booking references, row IDs, coordinates from real users, cookies, env values, API keys, DB URLs, or private customer data.
- Future evidence must prove an explicit driver click on Share Location before any browser geolocation request and an explicit driver click on Stop Sharing before the stop route is called.
- Future evidence must mock or safely simulate browser geolocation first; real browser GPS, real device location, and silent background location capture are not approved without separate evidence-window approval.
- Future evidence must prove no capture on page load, no capture from OTW/OTS/POB/Completed status buttons, no capture from Customer Copy, no capture from Email/Telegram/WhatsApp/SMS, and no capture from in-app notifications or quick replies.
- Future evidence must prove driver job token scoping, wrong-driver blocked proof, missing/wrong-admin blocked proof for admin reads, admin active-jobs map safe read proof, stale/offline proof, stop proof, cleanup zero-row proof, and rollback/closed-gate proof.
- Future driver-visible fields remain limited to sharing state, browser permission state, last shared time, stale/offline state, and Share/Stop controls.
- Future admin-visible fields remain limited to operational marker/status fields already allowed for the admin active-jobs map; customer visibility remains false until a separate customer live-location lane is approved.
- Future customer live map links, Customer Copy live-location URLs, customer portal tracking, customer in-app tracking, Telegram true live-location sends, Email/WhatsApp/SMS provider sends, and free-form chat are not approved by this lock.
- Future evidence must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.
- This guard depends on the completed Driver Live Location table/RLS evidence, admin runtime evidence, runtime settings migration apply, and Vercel env drift names-only audit guard; it does not repeat those lanes.
- A future implementation lane still requires separate owner approval for the runtime UI wiring, a browser-safe test harness, gate state, fake/staging-safe job target, cleanup/zero-row proof, rollback proof, docs evidence recording, and staging promotion.
- This guard adds `scripts/test-driver-live-location-consent-runtime-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Share/Stop Runtime Wiring Guard Lock
- This wires Driver Live Location Share/Stop controls to the existing driver job link page.
- The browser UI is controlled by the loaded driver job state and the server runtime readiness check, not a public build-time env flag.
- The browser GPS request is one-time and explicit: it runs only after the driver taps Share Location and `GET /api/driver-job/[token]/live-location` accepts the job.
- No browser geolocation request can happen on page load, status updates, app updates, issue reporting, Customer Copy, provider sends, or quick replies.
- Share Location calls only the existing job-token scoped `POST /api/driver-job/[token]/live-location` route with safe browser position fields: latitude, longitude, accuracy_meters, heading_degrees, speed_meters_per_second, and captured_at.
- Stop Sharing calls only the existing job-token scoped `DELETE /api/driver-job/[token]/live-location` route.
- Both Share and Stop require route responses with `customerVisible: false` and `external_send: false`; customer live map remains blocked.
- Driver-visible UI remains limited to sharing state, browser permission state, last shared time, stale/offline state, feedback text, and Share/Stop controls.
- The evidence runner `scripts/run-driver-live-location-share-stop-runtime-evidence.mjs` is disabled by default, mock/unit only, and performs no DB write, env change, deploy, provider send, real GPS capture, or customer live map activation.
- Future live evidence still requires separate owner approval for fake/staging-safe driver job target, gate window, cleanup zero rows, rollback proof, docs evidence, and staging promotion.
- This guard adds `scripts/test-driver-live-location-share-stop-runtime-wiring-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.
- A no-behavior-change alias guard `scripts/test-driver-live-location-share-stop-runtime-scaffold-guard.mjs` runs the same wiring guard so promotion checklists using the scaffold name remain covered without changing runtime code.

### Driver Live Location Share/Stop Staging Evidence Runner Guard Lock
- This adds a disabled-by-default runner scaffold for future Driver Live Location Share/Stop staging evidence.
- The runner is `scripts/run-driver-live-location-share-stop-staging-evidence.mjs`.
- The runner is not executed by this commit, no env was changed, no database read/write occurred, no GPS capture was activated, and no provider send occurred.
- The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_APPROVED=driver-live-location-share-stop-staging-evidence-approved` before any phase runs.
- The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_PHASE` to be one of `pre-window`, `runtime-window`, or `post-rollback`.
- The runner is staging-only by default and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_TARGET_URL` or its default.
- `pre-window` and `post-rollback` prove driver Share/Stop and admin active-jobs map routes are blocked/closed without database access.
- `runtime-window` requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_REFERENCE`, `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_DRIVER_JOB_LINK_TOKEN`, and `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_BOOKING_REFERENCE`.
- Future `runtime-window` evidence may create exactly one temporary fake `driver_job_links` row, one temporary runtime setting row, one fake latest-position row through Share Location, and audit rows produced by Share/Stop and admin read paths.
- The runner must prove Share Location, admin active-jobs map sees one safe fake marker, wrong-origin admin block, missing-admin block, wrong-driver block, Stop Sharing, admin active-jobs map drops back to zero markers, cleanup zero rows, and rollback/closed proof.
- The runner must restore the previous `driver_live_location_runtime_settings` row or delete the temporary row if none existed, then clean up temporary driver link, latest-position, and audit rows and prove zero matching evidence rows remain.
- The runner output is normalized and must not print Supabase URLs, service-role keys, admin session tokens, raw driver tokens, token hashes, row IDs, booking references, private customer data, real coordinates, cookies, JWTs, API keys, or env values.
- This runner does not edit Vercel env, deploy, apply migrations, activate browser GPS automatically, activate customer live map links, call Google Maps/OneMap/FlightAware, send provider messages, or touch billing/payment/PDF/payout.
- A future evidence pass still requires separate owner approval for stable server env gate state, staging-safe fake driver job token/reference, runtime DB window, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.
- This guard adds `scripts/test-driver-live-location-share-stop-staging-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Share/Stop Staging Evidence Record
- Evidence reference: `DRIVER-LIVE-LOCATION-SHARE-STOP-STAGING-20260624`.
- Source-of-truth at evidence time: `8b78f23 Add driver live location share stop evidence runner`.
- Stable server env gates and admin dispatcher auth env names were present in Vercel Production env for the staging project before evidence; admin dispatcher auth values were synced to the local evidence values and staging was redeployed before the accepted pass.
- No Supabase URL value, service-role key, admin session token, raw driver token, token hash, row ID, booking reference, customer/driver private data, real coordinates, cookie, JWT, API key, or env value was printed or recorded.
- Pre-window closed proof passed: driver Share Location returned HTTP 503, driver Stop Sharing returned HTTP 503, and admin active-jobs map returned HTTP 403 before the runtime setting window.
- Runtime-window proof used one fake/staging-safe driver job link token/reference and one fake booking reference only.
- Share Location proof passed through `POST /api/driver-job/[token]/live-location` with HTTP 200, `sharing_state active`, `customer_visible false`, and `external_send false`.
- Admin active-jobs map proof after Share Location passed through `GET /api/admin-active-jobs-map-locations` with HTTP 200, marker count `1`, `customer_visible false`, and `external_send false`.
- Boundary proof passed: missing admin was blocked HTTP 403, wrong origin was blocked HTTP 403, and wrong driver token was blocked HTTP 401.
- Stop Sharing proof passed through `DELETE /api/driver-job/[token]/live-location` with HTTP 200, `sharing_state stopped`, `customer_visible false`, and `external_send false`.
- Admin active-jobs map proof after Stop Sharing passed with HTTP 200 and marker count `0`.
- Cleanup proof passed: the temporary fake driver-job link, latest-position row, audit rows, and runtime evidence rows were cleaned up, and zero matching evidence rows remained.
- Runtime setting rollback proof passed: the previous `driver_live_location_runtime_settings` state was restored or the temporary setting was removed.
- Post-rollback closed proof passed: driver Share Location returned HTTP 503, driver Stop Sharing returned HTTP 503, and admin active-jobs map returned HTTP 403 after the runtime window.
- No real GPS, browser geolocation, real driver/customer data, customer live map, provider send, Email/Telegram/WhatsApp/SMS, Google Maps/OneMap/FlightAware call, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work was activated.

### Driver Live Location Consent UI Readiness Contract Guard Lock
- This is a docs/test-only guard for future Driver Live Location driver consent UI and compact Admin Active Jobs Map UI readiness.
- This lock does not activate GPS capture by default, open live-location gates by default, write/read location rows, apply migrations, change env, deploy, expose browser map keys, call Google Maps/OneMap/FlightAware, send Email/Telegram/WhatsApp/SMS, activate customer live map visibility, or touch billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work.
- Current state remains disabled by default: driver job pages must not start location sharing on page load and must not silently capture coordinates from status buttons.
- Future driver consent UI must live on the existing driver job link surface after the server resolves the current assigned job token.
- Future driver consent UI must use an explicit Share Location control, browser permission prompt, visible sharing state, last shared/stale state, and an explicit Stop Sharing control.
- Future driver consent UI must make clear that sharing is job-scoped and can be stopped; one driver job token must not see or write another driver/job location.
- Future capture must never auto-start from page load, POB, OTW, OTS, completed, copy, email, in-app, Telegram, WhatsApp, or SMS actions.
- Future auto-stop may be added only after separately approved persisted status evidence and must stop on POB/completed policy without indefinite polling.
- Future admin active-jobs UI must be compact and placed in the existing admin dispatch/active-jobs area, not a new giant card, not a new sector, and not inside Customer Copy.
- Future admin active-jobs UI must support simultaneous active jobs with one admin-only marker/status row per actively sharing driver/job and visible stale/offline state.
- Future admin active-jobs UI must remain admin/dispatcher-only, same-origin/admin-boundary protected, and must not expose driver coordinates to customers.
- Future customer live map links remain not approved; customer portal, customer in-app notifications, and customer copy must not display live driver movement unless separately approved.
- Future browser map rendering must not use the existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY`; any browser key requires a separately approved domain-restricted names-only env plan.
- Future driver-visible fields are limited to current job sharing state, browser permission state, last shared time, stale/offline state, and share/stop controls.
- Future admin-visible fields are limited to driver display label, assigned job label/reference, job status, vehicle/plate label if already assigned, latest latitude/longitude, accuracy, heading/speed if browser provides them, last updated time, stale/offline flag, and sharing state.
- Future UI must not show pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.
- Future UI evidence must prove closed gates, explicit driver consent, wrong-driver blocked paths, wrong-admin blocked paths, mobile-friendly layout, no text overlap, no new giant cards/sectors, no provider sends, no forbidden fields, rollback/disable, and zero matching temporary location rows after cleanup.
- Future runtime must remain separate from Customer In-App, Driver In-App, Customer Copy, Driver Details Email, Google Maps admin search/route estimates, OneMap, FlightAware, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.
- This guard adds `scripts/test-driver-live-location-consent-ui-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Browser Map Key Readiness Contract Guard Lock
- Superseded by `### Admin Active Jobs Browser Map JavaScript API`.
- The old docs/test-only future lock is replaced by a default-closed implementation: the admin page can render the optional browser map canvas only after the admin config route returns a separate browser-safe Google Maps JavaScript API key and allowed-origin match.
- Current production behavior remains closed until separate browser-safe env values are configured. No `NEXT_PUBLIC_` map key is introduced and no customer-visible live map is approved.
- Future admin active-jobs browser map must use a separate browser-safe key from the existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY`; the server-side key must never be sent to client code, HTML, logs, errors, or API responses.
- Future browser key setup requires separate owner approval, Google Cloud key creation, API restriction to browser map rendering APIs only, HTTP referrer/domain restrictions, and names-only ledger recording with no key value.
- Future names-only env plan must use `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER`, `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS`, and optional `PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID`; values must never be printed, logged, committed, or pasted into docs.
- Future allowed origins must be explicit and limited to approved staging/production app origins; wildcard, unrestricted, localhost-only production, mobile-app, IP-address, or server-key reuse configurations are not approved.
- Future browser map APIs must remain separate from server-side admin location search/route estimates, driver GPS capture/write routes, customer portal, customer in-app notifications, Driver Details Email, Telegram, WhatsApp, SMS, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, and shim work.
- Closed gates must not return `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, must not render map scripts, must not call `navigator.geolocation`, and must not expose coordinates outside the guarded admin active-jobs marker response.
- Future map UI evidence must prove no key appears in page source, route responses, server logs, normalized evidence, or committed files; it must also prove rollback removes the browser map surface.
- Future admin map UI remains admin/dispatcher-only and may show only approved operational marker/status fields; customer live map links remain separately blocked.
- This guard adds `scripts/test-driver-live-location-browser-map-key-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location POB Auto-Stop Readiness Contract Guard Lock
- This is a docs/test-only guard for future Driver Live Location stop behavior after POB or Job Completed.
- This lock does not activate GPS capture, start/stop live-location runtime, open live-location gates, write/read location rows, apply migrations, change env, deploy, call providers, send messages, activate customer live map links, or activate production.
- Current state remains closed: no browser GPS capture, no location row persistence, no active admin map, no customer live map, no polling loop, and no background auto-stop worker.
- Future auto-stop must use persisted driver job status evidence from `driver_job_status_events`, not local UI state, demo state, mock state, localStorage, customer status text, or untrusted browser-submitted status history.
- Future auto-stop may stop sharing when the resolved assigned job reaches persisted `pob` or `completed`, using the guarded `driver_otw -> ots -> pob -> completed` workflow.
- Future POB stop policy must be bounded and names-only; the default planning value remains 5 minutes after persisted POB unless owner separately approves a different value.
- Future Job Completed stop policy must stop sharing immediately or at the approved bounded grace window; it must not leave indefinite tracking active after terminal completion.
- Future auto-stop must be scoped to the resolved driver job token and assigned job only; one driver's POB/completed event must not stop or expose another driver/job location.
- Future auto-stop implementation must be server-side verified, admin/dispatcher auditable, and must not rely on client-only timers as the source of truth.
- Future auto-stop may use a bounded timer or scheduler only after separate owner approval; no indefinite polling loop, retry storm, fallback send, queue, cron, or multi-channel blast is approved by this guard.
- Future auto-stop evidence must prove closed gates, fake/staging-safe status events first, wrong-driver blocked, wrong-admin blocked, stop after persisted POB/completed, stale/offline state, cleanup zero temporary rows, rollback disabled, and no customer live map.
- Future stop/audit rows must include only safe operational fields and must not include pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.
- Future auto-stop remains separate from Telegram True Live Location, Email/WhatsApp/SMS provider sends, Customer In-App, Driver In-App, Customer Copy, Driver Details Email, Google Maps admin search/route estimates, OneMap, FlightAware, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.
- This guard adds `scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Driver Live Location Stale/Offline Readiness Contract Guard Lock
- This is a docs/test-only guard for future Driver Live Location stale/offline behavior.
- This lock does not activate GPS capture, live-location runtime, admin active-jobs map runtime, customer live map links, route/helper reads or writes, table writes, migration application, env changes, deploy, provider calls, provider sends, billing/payment/PDF/payout, or production activation.
- Current state remains closed: driver capture returns blocked/no-op, admin active-jobs returns no rows, customer visibility is false, and no stale/offline calculation is executed at runtime.
- Future stale/offline handling must use server-side persisted `captured_at` and `stale_after` values from `driver_live_location_latest_positions`, not browser local time, localStorage, demo/mock state, route text, or customer-visible status text.
- Future stale/offline threshold must be explicit through `PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`; if the threshold is missing or invalid, future runtime must fail closed instead of displaying a driver as live.
- Future admin active-jobs map must show stale/offline state instead of silently hiding a stale driver, pretending the driver is still live, or exposing a customer live map.
- Future stale/offline evidence must prove closed gates, fake/staging-safe rows first, active row shown as active, stale row shown as stale/offline, expired/stopped row excluded or marked stopped, wrong-driver blocked, wrong-admin blocked, cleanup zero temporary rows, rollback disabled, and no customer live map.
- Future stale/offline behavior must be scoped to the resolved driver job token and assigned job only; one driver's stale/offline state must not affect another driver/job.
- Future stale/offline implementation may not add indefinite polling, retry storm, scheduler, fallback send, provider send, queue, cron, blast, or background worker without separate owner approval.
- Future stale/offline fields must be limited to safe operational fields and must not include pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.
- This guard adds `scripts/test-driver-live-location-stale-offline-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Live Location Link Readiness Contract Guard Lock
- This is a docs/test-only guard for future customer-visible live-location link/readiness behavior.
- This lock does not activate customer live map links, GPS capture, live-location runtime, admin active-jobs map runtime, route/helper reads or writes, table writes, migration application, env changes, deploy, provider calls, provider sends, billing/payment/PDF/payout, or production activation.
- Current state remains closed: Customer Copy may show eligibility/help text only, must not generate or copy a live-location URL, customer visibility is false, and no customer map link is active.
- Future customer live-location links require separate owner approval after driver GPS capture, table/RLS/retention evidence, admin active-jobs map evidence, browser map key readiness, stale/offline proof, POB auto-stop proof, customer access proof, rollback proof, and no-forbidden-field proof.
- Future customer live-location links are not approved for MNG/Arrival bookings; eligible future service families remain DEP/DEPARTURE, TRF/TRANSFER, DSP, and HOURLY only after separate approval.
- Future customer link window remains 30 minutes before pickup by default and must fail closed outside the window or when secure driver live-location setup is incomplete.
- Future customer map/link runtime must never expose raw driver job tokens, raw booking IDs, admin/internal notes, pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.
- Future customer map/link must show only customer-safe trip and location context needed for tracking and must hide admin-only active-jobs controls, other drivers/jobs, stale/offline implementation details, and evidence/debug fields.
- Future evidence must prove no link for Arrival/MNG, no fake link inside eligibility window while setup is incomplete, blocked anonymous/wrong-customer access, customer-safe link scope, stale/offline handling, POB/completed stop behavior, cleanup zero rows, rollback disabled, and no provider sends.
- Future customer live-location link remains separate from Driver Details Email, Customer Copy manual send, Customer In-App, Driver In-App, Telegram True Live Location, Email/WhatsApp/SMS provider sends, Google Maps admin search/route estimates, OneMap, FlightAware, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.
- This guard adds `scripts/test-customer-live-location-link-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Live Location Link/Map Scaffold Guard Lock
- This adds a disabled-by-default Customer Live Location link/map scaffold and evidence runner.
- The customer map route is `GET /api/customer-live-location-map` and remains closed by default.
- The scaffold helper is `lib/customer-live-location-map-scaffold.ts`.
- The disabled runner is `scripts/run-customer-live-location-link-map-staging-evidence.mjs`.
- No runtime activation occurred, no env was changed, no database read/write occurred, no GPS capture was activated, no provider send occurred, and no customer live map was exposed.
- The route requires same-origin customer headers and a customer session token before returning even the closed scaffold response.
- Anonymous, cross-origin, missing-session, and write-method access must remain blocked.
- Even with a customer boundary, the default response is closed/no-op with `customerVisible false`, `liveMapEnabled false`, `gpsCaptureEnabled false`, `locationStorageEnabled false`, `external_send false`, and zero markers.
- If future gates are accidentally opened before runtime evidence setup is ready, the route must fail safely with `customer_live_location_map_runtime_config_not_ready`, `customer_live_location_map_runtime_gate_closed`, or `customer_live_location_map_scope_blocked`.
- Future eligible service families remain DEP/DEPARTURE, TRF/TRANSFER, DSP, and HOURLY only; MNG/Arrival remains blocked unless separately approved.
- Future evidence must prove customer/account/booking scope, no link for Arrival/MNG, same-customer access only, wrong-customer blocked, stale/offline handling, POB/completed stop behavior, cleanup zero rows, rollback disabled, and no provider sends.
- Future customer-visible fields are limited to safe trip label/status, driver sharing state, stale/offline state, last updated time, and map marker context required for tracking.
- The scaffold must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, raw driver job tokens, raw booking IDs, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.
- The runner requires `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_APPROVED=customer-live-location-link-map-staging-evidence-approved` and `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_PHASE` set to `pre-window`, `runtime-window`, or `post-rollback`.
- The runner is staging-only and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_TARGET_URL` or its default.
- `pre-window` and `post-rollback` prove blocked/closed customer route behavior without database access.
- `runtime-window` is disabled by default and may only write one fake staging driver link row and one fake staging latest-position row after explicit runner approval, then must prove customer map read, wrong/anonymous/cross-origin block, cleanup zero rows, and rollback.
- This guard adds `scripts/test-customer-live-location-link-map-scaffold-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Live Location Map Runtime Guard Lock
- This adds a disabled-by-default Customer Live Location map runtime implementation behind `GET /api/customer-live-location-map`.
- The runtime helper is `lib/customer-live-location-map-runtime.ts` and is loaded only when either the bounded customer-map evidence gate is open or the stable app-side Driver Live Location runtime mode is configured.
- Default state remains closed/no-op; no env was changed, no database read/write occurred, no GPS capture was activated, no provider send occurred, no customer live map was exposed, and no evidence was run in this lane.
- Evidence-mode reads require same-origin customer headers, `x-prestige-customer-purpose: customer-live-location-map-read`, a customer session token, `x-prestige-customer-account-reference`, an allowlisted customer account, and an allowlisted booking reference.
- App-side runtime reads require `driver_live_location_runtime_settings` to be active in `runtime` mode, capture and admin active-jobs map flags open, explicit safe booking references, customer session/account resolution, booking ownership proof through `bookings`, and an eligible service family before reading any latest-position row.
- The runtime reads only `driver_live_location_latest_positions` through the server-side Supabase service role after same-origin boundary, runtime gate, customer account scope, booking ownership, service eligibility, and booking reference scope pass.
- Customer-visible runtime fields are limited to `active_driver_marker` map coordinates, accuracy, heading, speed, sharing state, stale/offline status, captured/updated/stale timestamps, scoped booking label, marker count, and safe runtime flags.
- Customer-visible runtime output must not expose driver job link ids, raw driver job tokens, token hashes, raw booking IDs, pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.
- The evidence runner remains staging-only. Its `runtime-window` path requires explicit approval and `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_REFERENCE`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_ACCOUNT_REFERENCE`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_BOOKING_REFERENCE`, and `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_CUSTOMER_SESSION_TOKEN` names only.
- Future runtime evidence must use fake/staging-safe data only, write exactly one fake `driver_job_links` row and one fake `driver_live_location_latest_positions` row, prove a single customer map marker read, prove wrong-customer/anonymous/cross-origin blocked access, clean up fake rows, prove zero matching rows remain, and prove rollback disabled.
- The runtime does not call Google Maps, OneMap, FlightAware, Telegram, WhatsApp, SMS, Email, Resend, or any provider API; browser map rendering and real GPS remain separate lanes.
- The app-side runtime path is covered by `scripts/test-customer-live-location-app-side-runtime-path.mjs` using mocked Supabase responses only.
- This guard adds `scripts/test-customer-live-location-map-runtime-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Live Location Map Staging Evidence Record
- Evidence reference: `CUSTOMER-LIVE-LOCATION-MAP-STAGING-20260625`.
- Source-of-truth commit under test: `5465f1d Add customer live location map runtime scaffold`.
- Evidence was run through the guarded staging runner `scripts/run-customer-live-location-link-map-staging-evidence.mjs`.
- Pre-window proof: anonymous access returned HTTP 403, customer-boundary read returned safe closed HTTP 503, write method returned HTTP 403, `customer_live_map false`, `db_write false`, `gps_activation false`, `provider_send false`, and `secrets_printed false`.
- Staging map gates were opened only for the bounded evidence window through Vercel dashboard project env: `PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ENABLED`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_MODE`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES`, and `PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS`.
- Evidence used one fake staging account reference and one fake staging booking reference only.
- Runtime-window proof: the runner wrote exactly one fake `driver_job_links` row and exactly one fake `driver_live_location_latest_positions` row, customer map read returned HTTP 200, `marker_count` was 1, anonymous access returned HTTP 403, wrong-customer access returned HTTP 403, cross-origin access returned HTTP 403, and cleanup proved zero matching rows remained.
- Rollback proof: `PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ENABLED` was returned to a closed value and staging was redeployed closed.
- Post-rollback proof: anonymous access returned HTTP 403, customer-boundary read returned safe closed HTTP 503, write method returned HTTP 403, `customer_live_map false`, `db_write false`, `gps_activation false`, `provider_send false`, and `secrets_printed false`.
- No real GPS capture occurred.
- No browser geolocation call occurred.
- No customer live map was broadly exposed.
- No real customer data, real booking data, private coordinates, private customer contact data, driver phone number, raw driver job token, raw booking ID, row ID tied to a real user, env value, API key, cookie, password, token, DB URL, or secret was printed or recorded.
- No provider call or provider send occurred.
- No Google Maps, OneMap, FlightAware, Telegram, WhatsApp, SMS, Email, Resend, billing/payment/PDF, payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, shim, production activation, or broad/all-customer activation occurred.
- Customer-visible evidence output stayed limited to the single safe fake marker context and did not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.

### Customer Live Location App-Side Gate Readiness Guard Lock
- This is a docs/test-only readiness lock for reducing Customer Live Location map runtime dependence on deploy-time Vercel gate flips after the completed staging evidence record.
- Customer Live Location remains disabled/not active by default; this lock does not activate customer live location, real GPS, customer-wide live map, provider sends, Vercel env changes, deploy, DB reads/writes, route/helper runtime changes, browser/dashboard automation, or production.
- Normal customer live-location evidence and future activation readiness should prefer app-side/admin-controlled gates where already supported instead of Vercel CLI, repeated redeploys, unclear dashboard env flips, or locally injected evidence env values as the only control path.
- Vercel CLI is not required for normal customer live-location evidence.
- Any future Vercel env or dashboard gate work must be separately approved, explicitly scoped by exact gate names, intended values, target environment, cleanup/rollback window, and post-rollback proof.
- App-side/admin-controlled runtime gates, once implemented for customer live location, must be disabled by default, admin/dispatcher-only for writes, same-origin protected, audited, scoped to explicit customer/account and booking references or a small approved allowlist, and rollbackable without a redeploy.
- No customer live map exposure may occur without same-origin customer headers, customer session token, account scope, booking scope, eligible service type, stale/offline handling, POB/completed stop behavior, no-forbidden-field proof, and explicit activation/evidence approval.
- MNG/Arrival remains blocked for customer live-location links/maps.
- Future eligible service families remain DEP/DEPARTURE, TRF/TRANSFER, DSP, and HOURLY only after separate approval.
- Customer-visible output must not expose raw driver tokens, raw provider payloads, pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, admin internals, raw booking IDs, customer contact data, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.
- Future evidence must prove closed-by-default behavior, no Vercel CLI dependence, app-side/admin-controlled gate open/close where supported, blocked anonymous/wrong-customer/cross-origin access, single scoped customer map marker, stale/offline behavior, POB/completed rollback/stop behavior, cleanup zero rows, and no provider sends.
- This guard adds `scripts/test-customer-live-location-app-side-gate-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### Customer Live Location App-Side Runtime Path Implementation
- This lane wires the Customer Live Location map runtime to the existing app-side/admin Driver Live Location runtime settings path, avoiding Vercel CLI or dashboard env flips as the normal control mechanism.
- `GET /api/customer-live-location-map` can now load the runtime helper when `PRESTIGE_DRIVER_LIVE_LOCATION_MODE=runtime` is present, while the helper still fails closed until the app-side `driver_live_location_runtime_settings` row is active and scoped.
- The app-side runtime requires `driver_live_location_runtime_settings.setting_name=driver_live_location_runtime`, `setting_status=active`, `driver_live_location_mode=runtime`, `driver_live_location_capture_enabled=true`, `admin_active_jobs_map_enabled=true`, and an explicit allowed booking reference.
- The customer must pass the same-origin customer-live-location boundary, a customer saved-bookings session token, customer account resolution through `customer_access_accounts` or the approved exact customer session map, and booking ownership proof through the `bookings` table before any latest-position read occurs.
- Customer live-location map eligibility remains limited to DEP/DEPARTURE, TRF/TRANSFER, DSP, and HOURLY; MNG/Arrival remains blocked.
- Customer-visible output remains limited to the safe scoped marker payload and safe stale/offline metadata; raw driver tokens, driver job link ids, raw booking IDs, pricing, payout, PayNow, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact data, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, and mock QA/dev archive remain blocked.
- No Vercel CLI, Vercel env change, redeploy, dashboard automation, DB write, provider call, provider send, real GPS activation, customer-wide live map exposure, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, shim, or production activation occurred in this implementation lane.
- `scripts/test-customer-live-location-app-side-runtime-path.mjs` exercises the actual runtime helper with mocked Supabase responses and proves correct customer read, wrong-customer block, Arrival/MNG-style service block, closed app-side gate block, and default closed behavior.

### One Real Booking Live Location App-Side Evidence Runner Lock
- This adds `scripts/run-one-real-booking-live-location-app-side-evidence.mjs` for the approved bounded one-real-booking Driver Live Location + Customer Live Location evidence pass.
- The runner uses app-side/admin runtime gates only through the existing `driver_live_location_runtime_settings` row and does not use Vercel CLI, Vercel env changes, dashboard automation, or redeploys.
- The runner requires `PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_EVIDENCE_APPROVED=one-real-booking-live-location-evidence-approved` before any DB write can occur.
- Existing-token mode requires an existing raw driver job link token through `PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_DRIVER_JOB_LINK_TOKEN` and an owner-approved matching booking reference through `PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_BOOKING_REFERENCE`.
- Temporary-link mode is separately owner-approved through `PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_TEMP_DRIVER_LINK_APPROVED=temporary-driver-job-link-approved`, creates exactly one temporary `driver_job_links` row for one eligible real booking, then revokes/deletes that temporary link and proves zero matching link rows remain.
- The runner resolves an existing token by hash or creates one temporary token by hash only, validates the booking reference match, validates the link is active/not expired, validates the booking belongs to an active `customer_access_accounts` mapping or the private in-memory customer session map, and validates customer live-location service eligibility.
- Eligible customer live-location service families remain DEP/DEPARTURE, TRF/TRANSFER, DSP, and HOURLY; MNG/Arrival remains blocked.
- The runner refuses to proceed if `driver_live_location_runtime_settings` is already active or if an existing latest-position row is present for the selected real booking/driver job link, to avoid disturbing live operations.
- Runtime-window DB writes are limited to the optional one temporary driver job link row, the app-side runtime setting row, one latest-position row written through the driver Share Location runtime helper, audit rows written by the driver/admin helpers, and cleanup/rollback.
- The runner proves closed pre-window behavior, driver Share Location, admin active-jobs read, customer live map read, wrong customer/cross-origin/wrong driver blocks, Stop Sharing, cleanup zero rows, restored runtime setting, and closed post-rollback behavior.
- The runner output is normalized and must not print Supabase URLs, service-role keys, admin tokens, raw driver tokens, token hashes, booking references, row IDs, customer names, customer contact data, private coordinates, cookies, JWTs, API keys, env values, or secrets.
- No provider send, Email, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, browser geolocation, real GPS activation, customer-wide live map, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, shim, or production activation is introduced.
- If neither an existing-token path nor the separately approved temporary-link path can safely resolve exactly one eligible real booking, the runner must stop BLOCKED with names-only missing input or blocker details instead of guessing, creating a fake driver link, or widening scope.
- This guard adds `scripts/test-one-real-booking-live-location-app-side-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.

### One Real Booking Live Location App-Side Evidence Record
- Evidence reference: `ONE-REAL-BOOKING-LIVE-LOCATION-20260625`.
- Evidence was run once through `scripts/run-one-real-booking-live-location-app-side-evidence.mjs` using app-side/admin runtime gates only.
- Evidence used exactly one approved real booking selected by the guarded runner; no booking reference, customer name, customer contact data, raw token, token hash, row id, private coordinate, env value, DB URL, cookie, API key, password, or secret was printed or recorded.
- The runner created exactly one temporary `driver_job_links` row for the selected real booking, stored only the token hash, used the raw token only in-process, then revoked/deleted the temporary link and proved `driver_job_links: 0` matching temporary rows remained.
- Runtime-window DB writes were limited to the temporary driver job link, the app-side `driver_live_location_runtime_settings` row, one `driver_live_location_latest_positions` row written through the driver Share Location runtime helper, driver/admin audit rows, and cleanup/rollback.
- Pre-window proof: driver Share Location returned HTTP 503, admin active-jobs map returned HTTP 503, customer live map returned HTTP 503, and anonymous customer access returned HTTP 403.
- Runtime proof: driver Share Location returned HTTP 200, admin active-jobs map returned HTTP 200 with marker count 1, customer live map returned HTTP 200 with marker count 1, wrong customer returned HTTP 403, cross-origin customer access returned HTTP 403, wrong driver token returned HTTP 401, driver Stop Sharing returned HTTP 200, and customer live map after stop returned marker count 0.
- Cleanup proof: matching temporary `driver_live_location_latest_positions`, `driver_live_location_audit_events`, and temporary `driver_job_links` rows all remained at zero after cleanup.
- Rollback proof: the previous runtime setting was restored, post-rollback driver Share Location returned HTTP 503, post-rollback admin active-jobs map returned HTTP 503, post-rollback customer live map returned HTTP 503, and post-rollback anonymous customer access returned HTTP 403.
- The evidence exposed no customer-wide live map, real GPS/browser geolocation, provider send, Email, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, shim, or production activation.
- Implementation hardening from the evidence path: customer live-location booking scope now queries by booking reference and compares customer/account scope in code, so numeric or string customer references remain safely blocked unless they match after normalization; customer-visible forbidden fields remain blocked.

### Blocked OneMap Admin Map Staging Evidence Safe Failure Record

- Evidence reference: `ONEMAP-ADMIN-MAP-STAGING-BLOCKED-20260621222308`.
- Staging target commit: `a6cd226 Guard driver location POB evidence contract`.
- A bounded OneMap admin map/search/route estimate staging evidence pass was attempted once through the then-existing `scripts/run-admin-onemap-read-only-verification-phase3.mjs` runner, which is now retired.
- The evidence attempt used safe public-landmark scope only.
- Location search used safe public-landmark scope and returned safe provider failure HTTP 502.
- Route estimate used public landmarks only: RAFFLES HOTEL SINGAPORE to CHANGI AIRPORT TERMINAL 2, and returned safe provider failure HTTP 502.
- The runner returned `onemap_read_only_verification_failed_safely`.
- Closed-gate/local route contracts passed before and after the attempt.
- Boundary probes returned blocked HTTP 403 for anonymous, customer, and wrong-token paths.
- No unsafe evidence was produced.
- No DB write occurred.
- No real customer coordinates were used.
- No provider sends occurred.
- No OneMap token, endpoint value, env value, API key, DB URL, cookie, password, or secret was printed or recorded.
- No production deploy or production activation occurred.
- No repo files changed during the evidence attempt.
- No second OneMap call or retry was run.
- Blocker: OneMap provider/token/endpoint readiness must be owner-verified before any future retry.
- OneMap was scoped to admin map/search/route estimate only during the blocked evidence attempt; after Google Maps evidence completion, active OneMap admin map runtime is retired and remains not the driver GPS source, Telegram/live-location source, provider-send surface, DB persistence surface, billing/payment/PDF surface, parser surface, Save Booking surface, `/api/admin-saved-bookings` surface, shim cleanup lane, UI expansion, or production activation.

### Google Maps Admin Map Evidence Contract Guard Lock

- Google Maps is selected as the replacement direction for admin map/search/route estimate.
- OneMap is parked after the safe HTTP 502 provider failure record.
- No OneMap retry is approved without separate owner approval.
- Current Google Maps scope is admin location search and admin route estimates only.
- Google Maps replacement reuses the existing provider-neutral admin map routes: `GET /api/admin-map-location-search` and `POST /api/admin-map-route-estimates`.
- Google Maps runtime provider support is gated by `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED`, `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER=google_maps_geocoding`, `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED`, and `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER=google_maps_routes`.
- Google Maps key usage is server-side only through `PRESTIGE_GOOGLE_MAPS_API_KEY`; the key value must never be printed, logged, committed, or exposed to the browser.
- Google Maps services used by the runtime provider are Geocoding API for location search and Routes API for route estimates.
- The implementation reuses the existing admin route-assist UI section and does not add a new UI sector, card, or button.
- Closed-gate proof is required before evidence.
- Closed gate must not read `PRESTIGE_GOOGLE_MAPS_API_KEY`.
- Closed gate must not call Google Maps.
- Missing-config proof must return a safe disabled or missing-config response with no key, env value, billing detail, token, cookie, password, endpoint value, DB URL, or secret exposure.
- Admin/dispatcher boundary proof is required.
- Public, customer, and driver boundary proof is required.
- Evidence is limited to one safe public-landmark location search and one safe public-landmark route estimate.
- Evidence must not use real customer coordinates.
- Evidence must not write to the database.
- No DB persistence is required for this lane.
- No scheduler, retry loop, polling loop, queue, cron, timer, or background worker is approved.
- Timeout, rate-limit, and safe provider failure contracts are required.
- Rollback/disable proof is required after evidence.
- API restrictions are limited to Google Geocoding API and Routes API.
- No API key values or env values may be printed.
- No raw Google response, headers, keys, tokens, or debug payloads may be exposed.
- Normalized Google Maps responses may expose only provider, search label, address fragments, postal if available, latitude/longitude for safe public-landmark evidence only, distance, duration, and route type.
- Google Maps responses must not expose raw Google payloads, headers, API keys, tokens, debug/internal fields, pricing, payout, PayNow, payment/PDF/billing, `customer_rates`, `driver_payout_rules`, internal/admin notes, parser/debug fields, Save Booking internals, `/api/admin-saved-bookings` internals, customer/private contact data, or real customer coordinates in evidence.
- Google Maps is not the driver GPS source.
- Google Maps is not Telegram live location.
- Google Maps is not customer live tracking.
- Google Maps admin map/search/route estimate remains separate from driver GPS, Telegram live location, driver location source, POB auto-stop, customer/driver auth activation, in-app notifications, OTS photo/storage, billing/payment/PDF, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, provider sends, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.
- This lock does not approve DB reads/writes, OneMap retry, driver GPS capture, live-location implementation, provider sends, auth activation, notification row writes, in-app notification runtime, OTS photo/storage activation, calendar activation, scheduler/timer/polling/retry implementation, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, pricing/rates/customer_rates changes, `driver_payout_rules` changes, payout/payment/PDF/billing/invoice activation, UI sector/card/button changes, shim changes, or production activation.
- This guard updates `scripts/test-google-maps-admin-map-evidence-contract-guard.mjs` and keeps it registered in `scripts/test-preactivation-verification-suite.mjs`.
- Bounded read-only staging evidence runner: `scripts/run-admin-google-maps-read-only-verification.mjs`.
- The runner requires `PRESTIGE_ADMIN_GOOGLE_MAPS_READ_ONLY_VERIFICATION_APPROVED=google-maps-admin-map-staging-read-only-approved`, a staging admin/dispatcher session token, open staging map gates, and public-landmark-only inputs before it can call Google Maps through the app routes.

### Google Maps Admin Map Staging Evidence Record

- Evidence reference: `GOOGLE-MAPS-STAGING-20260622105932`.
- Promoted implementation commit: `5ce71cd Add Google Maps admin map provider support`.
- Previous staging head before promotion: `17d65ab Move driver in-app button to driver dispatch`.
- New staging head after promotion: `5ce71cd Add Google Maps admin map provider support`.
- Staging root proof after promotion and after final rollback deployment: HTTP 200, title `Prestige Limo Ops`, with the existing Map Route Assist surface present.
- Google Maps evidence was run once through the guarded app routes only, using `scripts/run-admin-google-maps-read-only-verification.mjs`.
- Evidence approval env name used by the runner: `PRESTIGE_ADMIN_GOOGLE_MAPS_READ_ONLY_VERIFICATION_APPROVED`; no approval value or secret was recorded.
- Staging map gates were opened only for the bounded evidence window: `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED=true`, `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER=google_maps_geocoding`, `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED=true`, and `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER=google_maps_routes`.
- `PRESTIGE_GOOGLE_MAPS_API_KEY` was used server-side by the deployed staging app only; the key value was never printed, logged, committed, or exposed to the browser.
- A temporary admin/dispatcher session token was used only for the staging evidence deployments; the token value was never printed, logged, committed, or recorded, and the local temporary token files were deleted.
- Location search evidence used safe public-landmark scope only: Raffles Hotel Singapore.
- Location search returned normalized provider `google_maps_geocoding`, `found: 1`, and `result_count: 1`.
- Route estimate evidence used public landmarks only: RAFFLES HOTEL SINGAPORE to CHANGI AIRPORT TERMINAL 2.
- Route estimate returned normalized provider `google_maps_routes`, route type `drive`, distance `18890` meters, and duration `1211` seconds.
- Runner result: `google_maps_read_only_verification_passed`.
- Evidence proof: `customer_data_used: false`, `db_write: false`, `provider_send: false`, `raw_provider_payload_exposed: false`, `secrets_exposed: false`, and `google_maps_called_through_guarded_routes: true`.
- No real customer coordinates, customer contact data, booking private data, driver GPS, live-location data, raw Google payload, headers, API keys, tokens, debug/internal fields, pricing, payout, PayNow, payment/PDF/billing, `customer_rates`, `driver_payout_rules`, parser/debug fields, Save Booking internals, or `/api/admin-saved-bookings` internals were used or exposed.
- Rollback/disable proof after evidence: `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED=false` and `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED=false`, followed by a closed-gate staging deployment.
- Authenticated closed-gate proof after rollback: `GET /api/admin-map-location-search` returned HTTP 503 with `Admin map location search is not enabled on this server.`
- Authenticated closed-gate proof after rollback: `POST /api/admin-map-route-estimates` returned HTTP 503 with `Admin map route estimate is not enabled on this server.`
- Final post-evidence staging deployment was run without a temporary session-token override so staging returned to the saved project environment with the map gates closed.
- No database read/write, OneMap retry, driver GPS capture, live-location implementation, provider sends, Email/Resend/Telegram/WhatsApp/SMS sends, FlightAware call, auth activation, notification row write, OTS/photo/storage activation, calendar activation, scheduler/timer/polling/retry implementation, parser change, Save Booking change, `/api/admin-saved-bookings` change, pricing/rates/customer_rates change, `driver_payout_rules` change, payout/payment/PDF/billing/invoice activation, UI sector/card/button change, shim change, production deploy, or production activation occurred.
- Customer in-app notification send button remains not implemented and blocked separately pending customer auth/portal read path plus table/RLS proof; this Google Maps evidence did not change customer in-app notification runtime.

### OneMap Active Runtime Retirement Lock

- OneMap active runtime/provider paths are retired after Google Maps staging evidence completion.
- OneMap was parked after the safe HTTP 502 provider failure record.
- OneMap is no longer the active or fallback admin map provider.
- Google Maps remains the selected admin map/search/route provider.
- Current admin map routes must not call OneMap under any gate or provider configuration.
- `onemap_search` and `onemap_routing` provider values must fail closed as missing configuration with no provider call.
- The obsolete OneMap read-only evidence runner is removed so OneMap evidence cannot be retried accidentally from the repo.
- Admin map route-assist UI data attributes are provider-neutral `data-admin-map-*`; no new UI sector, card, or button is approved by this retirement lane.
- No OneMap retry, OneMap call, OneMap token setup, OneMap endpoint setup, env change, deploy, DB read/write, provider send, auth activation, billing activation, production activation, or customer data use is approved by this retirement lane.
- No Google Maps call was made in this retirement lane.
- No customer data, real customer coordinates, DB write, provider send, Email/Resend/Telegram/WhatsApp/SMS send, auth/session/cookie work, billing/payment/PDF/payout activation, parser change, Save Booking change, `/api/admin-saved-bookings` change, customer in-app runtime activation, shim change, env change, manual deploy, or production activation occurred.
- Future OneMap reintroduction requires separate owner approval, provider/token/endpoint readiness, a fresh contract guard, bounded staging evidence, and no secret exposure.

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
- FlightAware/AeroAPI gated live lookup contract route/helper added:
  `POST /api/admin-flightaware-aeroapi-live-lookup-action` and
  `lib/admin-flightaware-aeroapi-live-lookup-action.ts`.
- FlightAware/AeroAPI live lookup gate remains closed by default:
  `PRESTIGE_FLIGHTAWARE_AEROAPI_LIVE_LOOKUP_ENABLED`.
- FlightAware/AeroAPI contract guards are registered in the preactivation suite and do not approve or run live lookup evidence.

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
- New product features without explicit owner approval.

## Current Flight ETA Rule

- MNG / Arrival only.
- Admin + driver only.
- Customer disabled by default.
- Future purpose: notify driver latest ETA 1 hour before pickup so driver does not miss arrival flight.
- If driver does not acknowledge, resend later.
- After 2 no-ack attempts, alert admin to get replacement driver.
- Current state is setup-only; no live sending or external API.

## FlightAware/AeroAPI Gated Live Lookup Contract Lock

- Approved contract route: `POST /api/admin-flightaware-aeroapi-live-lookup-action`.
- Approved server-only helper: `lib/admin-flightaware-aeroapi-live-lookup-action.ts`.
- Approved gate: `PRESTIGE_FLIGHTAWARE_AEROAPI_LIVE_LOOKUP_ENABLED`.
- Required env names are names-only and values must not be printed: `PRESTIGE_FLIGHTAWARE_AEROAPI_LIVE_LOOKUP_ENABLED`, `FLIGHTAWARE_AEROAPI_API_KEY`, and `FLIGHTAWARE_AEROAPI_BASE_URL`.
- The gate is closed by default. Closed gate returns safe HTTP 503 with `flight_lookup_gate_closed`, zero provider requests, no provider token read, no DB client, no scheduler, no retry, and no persistence.
- Missing provider token/base URL returns safe HTTP 503 with no provider request and no env value exposure.
- Invalid input returns safe HTTP 400. The allowed service scope is MNG/Arrival only.
- Success is allowed only after separate gate-opening approval and returns normalized fields only: provider, flight number, status, scheduled arrival ISO, estimated arrival ISO, source updated ISO, and `customerVisible: false`.
- Provider failure returns safe HTTP 502 or 504 with sanitized error code only; raw provider body, headers, token, debug/internal fields, mock archive, customer price, billing, payout, notes, and secrets remain excluded.
- The contract is manual admin/dispatcher-only. Public customer/driver routes and pages cannot trigger the lookup.
- The contract allows max one provider request per invocation, uses a strict timeout, and has no scheduler, cron, queue, polling loop, server retry, provider send, notification send, DB persistence, UI sector/button/card, parser change, Save Booking change, `/api/admin-saved-bookings` change, pricing/rates/payout/payment/PDF/billing change, auth/location/photo/calendar/OTS activation, or shim change.
- Guards added: `scripts/test-admin-flightaware-aeroapi-live-lookup-action-api-contract.mjs` and `scripts/test-flightaware-aeroapi-live-lookup-no-scheduler-guard.mjs`.
- This contract remains not-live until a separate owner-approved staging evidence pass names the staging target, opens the gate for one bounded live lookup window, records rollback/closed-gate proof, and confirms no forbidden surfaces were activated.

## FlightAware/AeroAPI Commercial Activation Constraint Lock

- Owner has not approved the FlightAware company contract.
- Owner prefers usage/GET-style cost only and does not approve monthly/business service activation at this time.
- FlightAware AeroAPI business use may require Standard terms/monthly minimum, so the app must remain not-live until owner separately approves the company contract and cost model.
- Keep the internal app route as `POST /api/admin-flightaware-aeroapi-live-lookup-action`, not GET, because it is an admin action with authorization and request payload.
- The route must remain closed behind `PRESTIGE_FLIGHTAWARE_AEROAPI_LIVE_LOOKUP_ENABLED`.
- Future live evidence requires separate owner approval after company contract and cost approval.
- No live FlightAware/AeroAPI request, env change, token setup, provider credential read while the gate is closed, external request while the gate is closed, scheduler, polling, retry loop, customer-visible auto-refresh, monthly/business activation, deploy, DB write, provider send, Email/WhatsApp/SMS/Telegram, parser, Save Booking, `/api/admin-saved-bookings`, pricing/rates/payout/payment/PDF/billing, auth/location/photo/calendar/OTS, UI, or shim change is approved by this lock.
- This lock is guarded by `scripts/test-flightaware-aeroapi-commercial-activation-constraint-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.
