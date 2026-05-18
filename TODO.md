# Prestige Limo Ops TODO

Phase 1 goal: stable internal limo operations dashboard.

## Highest Priority

- Make auto read and auto detect the core architecture.
- The parser should understand messy real-world WhatsApp bookings with minimal formatting.
- Parser priority order:
  - auto detect operational meaning
  - auto detect name/passenger
  - auto detect route
  - auto detect booking type
  - auto detect timing
  - auto detect company/booker
  - auto detect CRM relationships
  - generate clean operational output
- Parser architecture should be layered:
  - WhatsApp cleanup
  - intent detection
  - operational extraction
  - CRM enrichment
  - clean output generation
- Long-term direction: dispatcher-style understanding, not strict template parsing.

## Phase 1 Completed

- Consolidated booking extraction so the app uses `lib/booking-parser.ts` as the single parser source.
- Removed duplicated parser helpers from `app/page.tsx`; the page now only adapts parser output into React state.
- Preserved one operational person field: `name`.
- Kept React state merges functional and name-safe so valid names are not overwritten by blank parser or CRM updates.
- Fixed WhatsApp multiline parsing with blank-line handling.
- Verified the Alson SQ377 WhatsApp sample parses:
  - `name: Lim Yeow Beng`
  - `company: UOB`
  - `booker: Alson Chua`
  - `date: 2026-05-14`
  - `time: 0740hrs`
  - `flight: SQ377`
  - `bookingType: MNG`
- Added/kept regression coverage for:
  - Alson WhatsApp SQ377 with a blank line before the name
  - airport arrival/MNG
  - airport departure/DEP
  - point-to-point transfer/TRF
  - DSP dinner standby
  - return-trip wording
  - name propagation into merged booking state and job card output
- Added parser confidence fixtures in `parser_examples/booking-examples.json`.
- Converted parser examples into regression tests for 52 real-world samples across 14 categories.
- Added universal airline flight-code detection:
  - supports 2-letter IATA code plus 1-4 digits
  - normalizes spaced/lowercase codes such as `SQ 377` and `qr948`
  - covers SQ, QR, BA, QF, TR, EK, CX, NH, and MU examples
- Added arrival/departure inference from airport pickup/drop-off wording, ETA/ETD, landing, flight-arrives/departure wording, `flight > destination`, and `pickup > flight/terminal` route patterns.
- Added airport terminal inference for `T1`-`T4` and `Terminal 1`-`Terminal 4`; airport jobs without a stated terminal now use `Changi Airport`.
- Fixed live parser regressions:
  - names stop before date/route/flight keywords instead of capturing whole sentence fragments
  - generic words like `arrival`, `arriving`, `landing`, `pickup`, `transfer`, and `guest` no longer become names
  - `<booker> from <company>` now maps to booker/company instead of pickup
  - `get <driver> to drive <passenger>` detects both driver and passenger
  - route cleanup strips passenger fragments such as `for Mr...`
  - DSP return wording supports wait duration, intermediate stop text, and `return to <destination>`
  - informal `go home` / `send home` / `to home` destinations are detected
  - pickup extraction is stricter after `from`, `pickup from`, and `send from`
  - junk passenger fallbacks such as `him back`, `to Marina Bay Sands`, and `tmr morn pls` are filtered out
  - multi-booking messages now stop the single-booking parse pipeline early
  - multi-booking parser output returns `multipleBookingsDetected`, `parserWarning`, and `extractedBookingsPreview` without merged single-booking fields
  - UI shows a warning banner and does not auto-fill the booking form for multi-job messages
  - parser warning fields are excluded from React booking-form merges so warnings do not pollute booking state
- Completed parser confidence categories:
  - MNG airport arrival
  - DEP airport departure
  - TRF transfer
  - DSP/hourly/standby
  - dinner/event standby
  - multiline WhatsApp
  - blank-line WhatsApp
  - copied group chats
  - shorthand messages
  - typo messages
  - landmark-only locations
  - return trips
  - multiple passengers
  - boss/booker separation
- Fixed bare-year time parsing so `2026` is not mistaken for a pickup time before `0815` or `1430`.
- Job card output uses operational `Name: <name>` and does not show booker.
- Driver dispatch output uses `Passenger: <name>`.
- Save/load flow keeps company, booker, name/traveler, route, flight, pickup time, and job card data through Supabase-linked records.
- Added `npm run reset:dev` to clear `.next` and start a clean dev server.
- Removed temporary runtime parser/name trace logging from the app.
- Added browser runtime verification in `scripts/test-booking-browser.mjs`:
  - headless Chrome is the default runner for `npm run test:browser`
  - optional Safari WebDriver support remains available when remote automation is enabled
  - verifies the Alson SQ377 live parse flow through the Name field, parsed state, job card, and driver dispatch
  - verifies the multi-booking warning path and extracted-booking preview behavior
- Added Phase 1 driver management:
  - internal driver profiles with name, contact, vehicle type, plate, availability, notes, preferred areas, airport permit notes, payout preferences, and driver-specific payout rules
  - manual driver assignment on draft and saved bookings
  - driver reassignment without changing parser output
  - driver assignment persisted on bookings through `driver_id`, driver contact, plate, notes, payout, override amount, and override reason
  - driver dispatch updates from assigned driver, passenger/name, route, timing, flight, and optional internal payout
  - driver payout priority: manual override, driver-specific rule, company-specific rule, default Prestige payout
  - driver booking history visibility through saved assignment counts and driver-searchable booking records
- Added Supabase migration `202605130003_driver_management.sql` for driver profiles and booking assignment/payout fields.
- Completed Phase 1 customer rates management:
  - editable Rates section for default customer rates, default driver payouts, midnight surcharge, extra stop surcharge, midnight payout, and extra stop payout
  - default rates saved to Supabase `rate_settings`
  - company-specific overrides saved to Supabase `companies.customer_rates` and `companies.driver_payout_rules`
  - boss/name-specific overrides saved to Supabase `travelers.customer_rates` and `travelers.driver_payout_rules`
  - existing company and boss/name overrides can be loaded back into the edit form for amendments
  - Supabase-backed seed rules preserved for Tiger Global / June Aw, Su Ling, and Transzend
  - booking pricing auto-calculates customer price, driver payout, and profit from boss/name, company, then default Prestige rates
  - booking form now supports explicit extra-stop count and applies extra-stop customer surcharge and driver payout into live pricing totals
  - booking form supports manual customer price override, customer override reason, manual driver payout override, and driver override reason
  - manual driver payout override is treated as the final payout amount, so it no longer double-counts midnight or extra-stop surcharges
  - saved bookings persist customer price snapshot, customer override amount, customer override reason, driver payout snapshot, payout override reason, and extra-stop pricing snapshots
- Added Supabase migration `202605130004_customer_rate_overrides.sql` for booking-level customer price override fields and customer rate seed protection.
- Added Supabase migration `202605130005_extra_stop_count.sql` for booking-level extra-stop count and customer surcharge snapshots.
- Added Phase 1 child seat support:
  - booking form fields for child seat required, seat count, and seat type/note
  - pricing now applies child seat customer surcharge, driver payout, and profit impact
  - Rates management supports editable child seat customer surcharge and child seat driver payout
  - saved bookings persist child seat requirement, count, type, and pricing snapshots
  - job card, driver dispatch, and saved booking summaries show child seat details when selected
  - parser adds low-risk child seat detection for `child seat`, `baby seat`, `booster seat`, `infant seat`, `toddler seat`, and explicit seat counts
- Added Supabase migration `202605140001_child_seat_pricing.sql` for child seat pricing defaults and booking child seat fields.
- Added `npm run test:pricing` for child seat pricing coverage alongside parser regressions.

## Verification Run

- `npm run test:parser` passed.
- `npm run test:pricing` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Customer rates management is already implemented in the current Phase 1 tree and was re-verified without parser changes in this pass.
- `npm run test:browser` passed for the live single-booking parse flow.
- `EXPECT_MULTIPLE=1 ... npm run test:browser` passed for the live multi-booking warning flow.

## Remaining Bugs / Risks

- Parser is improved but still primarily rule/regex based; the next major parser work should introduce an explicit intent/extraction pipeline around dispatcher concepts.
- Weak parser areas to keep testing:
  - ambiguous one-line messages without clear route separators
  - multiple jobs in one pasted chat
  - fuzzy landmark aliases and misspelled hotel/building names
  - mixed languages or Singlish-heavy shorthand
  - messages where time, date, flight, and address numbers appear close together
  - multiple passengers where only one should be operationally displayed
  - CRM relationship inference when company is omitted and only booker/contact is known
- Browser runtime automation now exists, but local browser tests still depend on an allowed unsandboxed localhost/browser session in the target macOS environment.
- Supabase schema/migrations must be applied in the deployment database before CRM save/load fields can persist outside local development.
- Saved booking load depends on joined `companies`, `bookers`, and `travelers` records; incomplete historical rows may only recover name from stored job cards.
- Parser coverage is now stable for the required Phase 1 booking styles, but more real customer messages should be added as regression tests when they appear.
- Flight detection now avoids obvious name/time false positives, but any new airline-like collision from real messages should be added to `parser_examples/booking-examples.json`.
- Some CRM/pricing capabilities already exist in code from earlier work, but no Phase 2 features were added in this pass.
- Driver management requires the new Supabase migration to be applied before saved driver profiles and assignments persist in deployed databases.
- Driver payout rules are simple per-booking-type amounts for Phase 1; advanced distance, zone, and conditional payout logic remains out of scope.
- Customer rate management requires Supabase migrations through `202605130005_extra_stop_count.sql` to be applied before booking-level override and extra-stop snapshots persist.
- Child seat pricing and saved child seat fields require Supabase migration `202605140001_child_seat_pricing.sql` to be applied in the deployment database.
- Future architecture task: Make Save Booking + CRM atomic.
  Current frontend save order can create/update CRM records before booking insert.
  Risk: if booking insert fails, CRM records may remain without booking.
  Best long-term fix: Supabase RPC / database transaction that writes company, booker, traveler, booking, and links together atomically.
  Do not attempt quick frontend-only refactor unless specifically approved.

## Next Testing Checklist

- Start clean with `npm run reset:dev`.
- Open `http://localhost:3000`.
- Run `npm run test:browser` for the live single-booking UI regression.
- Run `npm run test:parser` after every parser rule change.
- Add any real failed booking paste to `parser_examples/booking-examples.json` before fixing parser code.
- Paste the Alson SQ377 WhatsApp booking with a blank line before `Lim Yeow Beng`.
- Click `Parse Booking`.
- Confirm the Name input shows `Lim Yeow Beng`.
- Confirm parsed booking state shows `"name": "Lim Yeow Beng"`.
- Confirm job card shows `Name: Lim Yeow Beng`.
- Confirm driver dispatch shows `Passenger: Lim Yeow Beng`.
- Test an airport departure message and confirm `DEP`, clean route, date, and time.
- Test an airport arrival message and confirm `MNG`, flight, clean route, date, and time.
- Test spaced and lowercase flight inputs such as `SQ 377`, `qr948`, and `QF 1`.
- Test `flight > destination` arrival and `pickup > flight` departure route shorthand.
- Test a transfer message and confirm `TRF`, pickup, drop-off, date, and time.
- Test the DSP dinner standby message and confirm `DSP`, `Drew`, `Richard`, `1800hrs`, `ION Orchard`, and `Ritz Carlton`.
- Test one copied group chat, one shorthand message, one typo message, one landmark-only route, one multiple-passenger booking, and one boss/booker-separated booking from `parser_examples`.
- Save one parsed booking to CRM, reload bookings, and confirm name, company, booker relationship, route, flight, and pickup time still display correctly.
- Create or load a driver profile with contact, vehicle, plate, availability, preferred areas, and payout rules.
- Assign a driver to a draft booking and confirm the driver dispatch message updates immediately.
- Save the booking, change the assigned driver, and confirm the saved dispatch card updates.
- Test payout priority with default payout, company payout, driver-specific payout, and manual override.
- Confirm override payout reason and driver notes remain visible after saving and reloading.
- Search bookings by driver name and confirm assigned jobs are discoverable.
- Load Rates and confirm default Prestige customer rates and driver payouts populate from Supabase.
- Amend Tiger Global company rates and confirm MNG/DEP pricing updates on a Tiger Global booking.
- Amend a boss/name override such as Su Ling DSP and confirm it takes priority over company/default pricing.
- Enter an extra-stop count and confirm customer price, driver payout, and profit update immediately.
- Select child seat required, set count/type, and confirm customer price, driver payout, profit, job card, and driver dispatch update immediately.
- Enter a manual customer price override and confirm customer price and profit update immediately.
- Enter a manual driver payout override and confirm driver payout and profit update immediately.
- Save a booking with customer and driver override reasons, reload bookings, and confirm the saved pricing summary, extra-stop count, and child seat details remain visible.

## Phase 2 Out Of Scope

- Flight tracking.
- Invoice generation.
- Calendar sync.
- Customer portal.
- Advanced deployment work.
