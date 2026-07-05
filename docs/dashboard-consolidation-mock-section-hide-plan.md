# Dashboard Consolidation / Mock-Section Hide Plan

## 1. Purpose

This plan explains how the internal/admin dashboard should be cleaned up now that Prestige Limo Ops has enough mock workflow coverage. It is documentation-only and does not approve or implement any app behavior, parser behavior, storage, API, Supabase, billing, payment, PDF, notification, dispatch, live location, route, flight, maps, or customer account behavior.

No new mock workbenches should be added during this phase. The next direction is dashboard consolidation and production-readiness planning.

## 2. Why Dashboard Consolidation Is Needed

- `app/page.tsx` and the internal/admin dashboard are now mock-section-heavy.
- Too many mock workbenches are visible in one dashboard.
- Production staff need fewer, clearer operational panels focused on live operational decisions.
- Future real behavior should not be added on top of dashboard sprawl.
- Mock sections should be consolidated, collapsed, hidden behind a QA/dev toggle, or converted carefully in later approved stages.

## 3. Mock/Local/Static Areas To Freeze

These mock/local/static areas should not be expanded with more small workbenches:

- Quote & Pricing Review.
- Operations Risk & SLA Watchlist.
- Booking Lifecycle Timeline & Internal Audit Readiness.
- Driver Assignment & Dispatch Readiness.
- Route & Itinerary Readiness.
- Airport Flight Monitoring & Pickup Readiness.
- Booking Intake Quality & Account Matching.
- Customer Account & Service Profile.
- Operations Handover & Shift Briefing.
- Fleet & Driver Readiness.
- Customer Service Recovery Communication.
- Replacement Vehicle & Service Recovery.
- Driver Job Completion & Exception Intake.
- Completed Job Closeout.
- Month-End Closeout.
- Finance Exception Resolution.
- Extra Charges mock/control areas.

These sections should remain clearly labeled as Mock Only until they are removed, hidden, consolidated, or replaced by approved production-grade behavior.

## 4. Dashboard Cleanup Options

Practical cleanup options include:

- Collapse all mock workbenches by default.
- Move mock workbenches behind a clearly labeled internal QA/dev area.
- Convert repeated workbench content into fewer production-grade operational panels.
- Keep operational dashboard content above mock/QA sections.
- Protect customer/public/driver routes from all admin-only content.
- Keep mock labels visible until mock sections are removed or replaced.

The preferred near-term approach is to keep runtime behavior unchanged while planning a smaller dashboard information architecture.

## 5. Recommended Dashboard Consolidation Path

Use staged batches so dashboard cleanup stays reversible and test-protected.

### Stage A: Read-Only Dashboard Inventory

Inventory every current dashboard section, route exposure boundary, mock label, and browser/mobile protection without editing files.

### Stage B: Docs-Only Dashboard Information Architecture Plan

Define the future internal dashboard structure: primary operational panels, secondary QA/dev area, collapsed mock areas, and route protection expectations.

#### Dashboard Information Architecture Plan

Stage 4A-288 is documentation-only. It records the dashboard information architecture direction after the Stage 4A-287 read-only inventory and does not approve or implement runtime collapse/hide behavior.

##### A. Current Dashboard Structure

Stage 4A-287 counted the current internal/admin dashboard surface:

- `app/page.tsx` is 15,775 lines.
- 52 mock/local/static admin dashboard sections or panels total.
- 48 explicit mock/local/static admin sections in the pre-tab mock review block.
- 4 embedded mock/local dispatch panels:
  - Customer Match Suggestion.
  - Replacement Car / Driver - Mock Only.
  - Telegram Alert Preview - Mock Only.
  - Manual Extra Charges Review.
- Main internal/admin tabs:
  - Dispatch.
  - Bookings.
  - Completed.
  - Dashboard.
  - Drivers.
  - Rates.

The current shape is useful as a protected prototype, but it is too broad for daily production staff. Production staff should see current operational work first, while mock QA material should move into a clearly separated archive area.

2026-07-05 update: the normal Dispatch surface no longer exposes the visible `Replacement Car / Driver - Mock Only` panel or the visible Telegram internal-admin test panel. Real dispatch recovery readiness and manual Telegram copy lanes remain separate.

##### B. Proposed Production Dashboard Hierarchy

1. Today / Active Operations
   - Live operational booking cards.
   - Today's jobs.
   - Pickup timing.
   - Assigned driver summary.
   - Dispatch status.
   - Customer update readiness.

2. Booking Intake & Review
   - Booking form.
   - Parser/manual intake review.
   - Account/customer matching.
   - Route readiness.
   - Short-notice admin review status.

3. Dispatch & Driver Readiness
   - Proposed driver/vehicle.
   - Driver contact readiness.
   - Driver acknowledgement readiness.
   - Schedule/overlap warning only.
   - Dispatch handoff.

4. Customer / Public / Driver Surfaces
   - `/book`.
   - `/my-bookings`.
   - `/customers`.
   - `/driver-job-demo`.
   - Public driver token route.
   - Route leakage boundaries.

5. Finance / Extra Charges / Closeout
   - Manual Extra Charges preview.
   - Extra Charges Control Center.
   - Completed job closeout.
   - Month-end/finance review.
   - All finance, billing, payment, invoice, PDF, payout, and accounting areas remain Mock Only until real finance behavior is explicitly approved.

6. Internal QA / Mock Workbench Archive
   - All frozen mock workbench sections.
   - Hidden or collapsed by default.
   - Clearly labeled Mock Only.
   - Not visible to production staff by default.

##### C. Section Treatment Matrix

| Current area | Future treatment | Notes |
| --- | --- | --- |
| Main operational tabs: Dispatch, Bookings, Completed, Dashboard, Drivers, Rates | Keep visible for production staff | Keep as the primary navigation, with staff-facing operational content above mock QA material. |
| Booking form / parser intake | Keep visible but simplify | Preserve manual review and parser safety. Do not change parser behavior or add parser learning. |
| Manual Extra Charges field and preview | Keep visible but simplify | Keep local UI/form-state only. No totals, billing, invoice, payment, PDF, payout, storage, API, Supabase, or notifications. |
| Extra Charges Control Center | Consolidate into a smaller production panel or QA panel | Keep Mock Only until real billing/payout/finance boundaries are separately approved. |
| Job card, customer copy, driver dispatch copy, driver job link previews | Keep visible for production staff | Preserve customer/public/driver leakage boundaries and copy protections. |
| Driver assignment mock sections | Move behind QA/dev toggle | Future real assignment must be a separate approved stage. Schedule conflicts should warn only, not block or hide drivers. |
| Route, airport, and itinerary mock sections | Move behind QA/dev toggle | Do not activate maps, geocoding, traffic, route optimization, flight API, or live API behavior. |
| Customer, account, and intake mock sections | Consolidate into Booking Intake & Review | Keep mock/local/static until a production data/auth/account plan is approved. |
| Finance, month-end, receivables, accounting, and payment mock sections | Move behind QA/dev toggle | Collapse by default. Do not activate billing, invoice, payment, PDF, payout, accounting, or finance export behavior. |
| Quote, pricing, risk, SLA, lifecycle, and audit mock sections | Move behind QA/dev toggle | Keep Mock Only. Do not activate quote automation, pricing automation, SLA automation, or audit trails. |
| Completed job, recovery, replacement vehicle, and closeout mock sections | Collapse by default and consolidate | Remove later after approved real completion, recovery, and closeout workflows replace them. |

##### D. Route Protection Information Architecture

Admin/internal content must remain excluded from:

- `/book`.
- `/my-bookings`.
- `/customers`.
- `/driver-job-demo`.
- Public driver token route.

Browser and mobile checks must continue to guard against leakage of:

- Admin-only dashboard panels.
- Private driver details.
- Billing, payout, and internal finance details.
- Invoice, payment, PDF, and accounting details.
- Mock QA/dev sections.
- Supabase, API, and storage behavior.
- Notification and send behavior.

Public/customer/driver routes should stay compact, customer-safe, and role-appropriate. The internal/admin dashboard can link to those routes, but those routes must not inherit admin-only dashboard sections.

##### E. Future Implementation Stages

Recommended stages after this docs-only IA plan:

1. Read-only route leakage boundary map.
2. Docs-only mock-section collapse/hide UI plan.
3. Implementation of a collapsed mock QA/dev archive area.
4. Read-only checkpoint review.
5. Production data/auth boundary plan.
6. Only then select one real workflow to implement.

No runtime collapse/hide implementation happens in Stage 4A-288.

### Stage C: Mock-Section Collapse/Hide UI Plan

Plan the exact UI behavior for collapsed mock sections or a QA/dev area. This should still be design-only and should not activate persistence, storage, APIs, auth, billing, notification, or dispatch behavior.

#### Mock-Section Collapse / Hide UI Plan

Stage 4A-290 is documentation-only. It defines the future UI behavior for collapsing, hiding, archiving, or consolidating the current mock/local/static admin dashboard sections. It does not implement runtime collapse/hide behavior and does not approve any real app, parser, API, storage, Supabase, billing, payment, PDF, payout, notification, dispatch, live location, maps, flight, route, auth, or customer account behavior.

##### A. Design Goal

The internal/admin dashboard is currently too mock-heavy for production staff. The future production-facing admin view should show operational work first, while frozen mock workbenches remain available only as a clearly labeled internal QA/dev archive.

Planning rules:

- No new mock workbenches.
- No real behavior activated.
- No runtime implementation in Stage 4A-290.
- This section is only the plan for a future UI implementation stage.

##### B. Default Production View

The future production-facing admin dashboard should keep these areas visible by default:

- Compact admin route/access hub, if still useful.
- Primary tabs: Dispatch, Bookings, Completed, Dashboard, Drivers, Rates.
- Booking form / parser intake.
- Job Card Preview.
- Customer Copy Preview.
- Driver Dispatch Preview.
- Driver Job Link Preview.
- Manual Extra Charges field and local preview.
- Assigned driver controls and internal driver summary.
- Operational booking cards, recent bookings, completed bookings, and live operational content needed by dispatch staff.

These areas remain internal/admin-only unless a future auth or role stage explicitly approves a different boundary. Public, customer, and driver routes must not inherit admin dashboard content.

##### C. Collapsed-By-Default Areas

These areas should be collapsed by default in a future UI implementation, while still being accessible for internal review:

- Extra Charges Control Center.
- Completed Job Closeout.
- Month-End Closeout.
- Finance Exception Resolution.
- Customer/account and booking intake mock review sections.
- Route/airport/itinerary mock review sections.
- Driver/fleet/dispatch readiness mock review sections.
- Customer service recovery, replacement vehicle, and driver completion mock sections.
- Quote/pricing/risk/audit mock sections.

Collapsed does not mean production-active. These areas remain Mock Only and must not calculate totals, save records, send messages, create billing artifacts, assign drivers, call live services, or change parser behavior.

##### D. Internal QA / Mock Workbench Archive

A future implementation should create or designate an internal archive area for frozen mock workbenches:

- Label: `Internal QA / Mock Workbench Archive - Mock Only`.
- Hidden or collapsed by default.
- Not shown to production staff by default.
- Never shown on public/customer/driver routes.
- Protected by route leakage tests.
- No real API, storage, Supabase, billing, payment, invoice, PDF, payout, accounting, notification, live location, maps, flight, route, or parser behavior.

Stage 4A-287 counted 52 mock/local/static admin dashboard sections or panels: 48 explicit pre-tab mock review sections and 4 embedded dispatch panels. The archive should eventually contain, replace, or collapse the frozen pre-tab mock review block instead of leaving every mock section visible as a production staff surface.

##### E. Consolidation Groups

Frozen mock workbenches should be grouped into fewer archive categories:

1. Customer Intake / Account / Booking Review
   - Contains customer intake handoff, intake confirmation, booking intake quality, account matching, customer/account profile, parser/manual review, and customer match suggestion mock areas.
   - These should not appear as many separate production panels because production staff need one intake review path, not repeated mock review examples.

2. Dispatch / Driver / Fleet Readiness
   - Contains driver assignment readiness, driver detail collection, driver update previews, fleet readiness, operations handover, assignment/dispatch readiness, and assigned-driver mock support panels.
   - These should consolidate because real dispatch work needs a small set of actionable driver and vehicle readiness signals.

3. Route / Airport / Itinerary Readiness
   - Contains route readiness, airport flight monitoring, pickup readiness, itinerary and waypoint review, FBO/private airport notes, and route exception mock sections.
   - These should remain archived until maps, traffic, route, geocoding, and flight API boundaries are approved.

4. Customer Service Recovery / Replacement / Completion
   - Contains replacement car/driver, customer service recovery communication, replacement vehicle recovery, driver job completion and exception intake, and completed job closeout mock sections.
   - These should collapse together because they are recovery and completion review aids, not separate production workbenches yet.

5. Finance / Extra Charges / Closeout
   - Contains Manual Extra Charges review, Extra Charges Control Center, waiting-time and midnight charge mock reviews, completed closeout, month-end closeout, finance exception, receivables, payment allocation, and accounting mock areas.
   - These should stay Mock Only and collapsed because real finance, billing, invoice, payment, PDF, payout, accounting, and export behavior require separate approval.

6. Quote / Risk / SLA / Audit
   - Contains Quote & Pricing Review, Operations Risk & SLA Watchlist, Booking Lifecycle Timeline & Internal Audit Readiness, and related risk/audit readiness mock sections.
   - These should not appear as production panels until quote automation, pricing automation, SLA automation, and audit trails are separately designed.

7. Legacy Close-Cycle / DSP / Receivables / Accounting QA
   - Contains DSP usage rollups, DSP exceptions, approval packets, statement variance, receivables aging, collections, month-end AR close, GL/audit handoff, audit evidence, retention, and close-cycle evidence mock sections.
   - These should be archived as QA examples because production staff should not see a full accounting close-cycle workbench by default.

##### F. Future Implementation Rules

A future runtime collapse/hide implementation must follow these rules:

- Implement in one bounded stage.
- Do not change parser behavior.
- Do not change public/customer/driver route behavior.
- Do not activate real data persistence.
- Do not add new mock workbenches.
- Keep action feedback near clicked controls if any controls are added later.
- Keep mobile and no-horizontal-overflow protections.
- Preserve data attributes where possible, or update browser tests deliberately in the same approved implementation stage.
- Preserve all route leakage protections from Stage 4A-289.
- Run the full required pre-commit test sequence and post-commit `npm run test:safe`.

##### G. Future Browser/Mobile Test Requirements

When collapse/hide behavior is implemented, tests should verify:

- Admin dashboard still shows production-useful content first.
- QA/dev archive is collapsed or hidden by default.
- User can expand the QA/dev archive only inside the admin dashboard if the implementation adds that control.
- Public/customer/driver routes never show archive content.
- `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and public driver token/demo routes remain protected.
- Mobile layouts have no horizontal overflow.
- No admin-only leakage of billing, payout, finance, driver, parser, Supabase/API/storage, or notification/send details.
- Existing booking UI, parser, app smoke, mobile usability, and `test:safe` checks continue to pass.

Future implementation should preserve existing browser selectors whenever practical because current tests already use route leakage sentinels for many mock sections.

##### H. What Not To Activate

Collapse/hide implementation must not activate:

- Supabase/database persistence.
- Auth/customer accounts.
- Booking save/load.
- Billing/monthly invoice.
- Invoice/PDF/payment links.
- Payouts/accounting/finance export.
- Driver assignment/dispatch persistence.
- Notifications/message sending.
- Live location/maps/flight/route APIs.
- Proof/photo upload.
- SLA/audit/quote/pricing automation.
- Parser learning or parser rule changes.

##### I. Recommended Next Safe Stage

Recommended next stage after Stage 4A-290: Stage 4A-291 - Docs-only QA/dev archive acceptance criteria.

Reason: the route leakage map and collapse/hide UI plan are now documented, but a short acceptance-criteria stage should define the exact pass/fail expectations before editing `app/page.tsx`. That keeps the future implementation bounded, test-protected, and clearly separate from real data/API/auth work.

### Stage D: QA/dev Archive Acceptance Criteria

Define exact pass/fail criteria for the future collapsed internal QA/dev archive before editing `app/page.tsx`.

#### QA/dev Archive Acceptance Criteria

Stage 4A-291 is documentation-only. It defines the acceptance criteria for a future runtime UI-only implementation of the collapsed internal QA/dev archive. It does not implement collapse/hide behavior and does not approve any real app, parser, API, storage, Supabase, auth, billing, invoice, payment, PDF, payout, notification, dispatch, live location, maps, flight, route, customer account, booking save/load, or parser-learning behavior.

##### A. Acceptance Criteria Overview

The future implementation is successful only if the internal/admin dashboard becomes easier for production staff while all existing route, parser, mobile, and browser protections remain intact.

Acceptance rules:

- The implementation must not add new mock sections.
- The implementation must only reorganize existing mock/local/static admin sections.
- Production staff must see operational work first.
- Frozen mock workbenches must remain clearly labeled as Mock Only.
- Public, customer, and driver routes must remain protected from internal/admin leakage.

##### B. Default Visible Admin Dashboard Criteria

Future implementation must keep these areas visible by default:

- Main operational tabs: Dispatch, Bookings, Completed, Dashboard, Drivers, Rates.
- Booking form / parser intake.
- Job Card Preview.
- Customer Copy Preview.
- Driver Dispatch Preview.
- Driver Job Link Preview.
- Manual Extra Charges field and local preview.
- Assigned driver controls / internal driver summary.
- Operational booking cards.
- Recent Bookings.
- Completed Bookings.
- Current operational dispatch controls needed for admin/staff use.

Acceptance rule: production-useful admin content must remain reachable without opening the QA/dev archive.

##### C. Collapsed Or Hidden Archive Criteria

Future implementation must place frozen mock/local/static workbench content into a collapsed or hidden internal archive area.

The archive label should be exactly or very close to:

`Internal QA / Mock Workbench Archive — Mock Only`

The archive must be:

- Internal/admin-only.
- Collapsed or hidden by default.
- Clearly marked Mock Only.
- Not visible on public/customer/driver routes.
- Not treated as a production workflow.
- Not connected to Supabase, APIs, billing, notifications, storage, or payments.
- Not expanded automatically on page load.
- Not added as another giant visible section above operational work.

##### D. Archive Content Grouping Criteria

Future implementation should group existing frozen sections into compact archive groups instead of leaving 52 separate full-width panels visible.

Required archive groups:

1. Customer Intake / Account / Booking Review.
2. Dispatch / Driver / Fleet Readiness.
3. Route / Airport / Itinerary Readiness.
4. Customer Service Recovery / Replacement / Completion.
5. Finance / Extra Charges / Closeout.
6. Quote / Risk / SLA / Audit.
7. Legacy close-cycle / DSP / receivables / accounting QA.

Each group should contain existing mock/local/static content only. No new mock workbench content should be created.

##### E. Public/Customer/Driver Route Criteria

Future implementation must preserve Stage 4A-289 route boundaries.

These routes must not show the QA/dev archive, archive groups, mock workbench labels, admin-only panels, billing/payout internals, parser internals, notification/API/storage wording, or driver-demo-only content:

- `/book`.
- `/my-bookings`.
- `/customers`.
- `/driver-job-demo`.
- Public driver token/demo route.
- `/driver-job/[token]`.

Note: `/customers` is internal staff-only despite the customer-facing name, but it still must not receive admin dashboard mock workbench sprawl or driver-demo content.

##### F. Mobile And Usability Criteria

Future implementation must preserve:

- No horizontal overflow.
- Touch-friendly controls.
- Readable text.
- Compact layout.
- No giant card stack above the operational dashboard.
- Archive expand/collapse control, if added later, must be easy to tap on iOS and Android.
- Action feedback must appear near the clicked control if any new control is added.

##### G. Test Acceptance Criteria For Future Implementation

Future implementation should add or preserve browser/mobile checks for:

- Admin dashboard shows production-useful sections without opening the archive.
- QA/dev archive is collapsed or hidden by default.
- Archive content appears only after the internal/admin archive is opened, if an expand control exists.
- Archive content never appears on `/book`.
- Archive content never appears on `/my-bookings`.
- Archive content never appears on `/customers`.
- Archive content never appears on `/driver-job-demo`.
- Archive content never appears on public driver token/demo routes.
- No billing, payment, PDF, invoice, accounting, or payout leakage.
- No Supabase, API, storage, fetch, XHR, sendBeacon, or WebSocket activation.
- No WhatsApp, email, SMS, Telegram, notification, or send behavior.
- No parser behavior changes.
- Manual Extra Charges remains local UI/form-state only.
- Mobile usability still passes with no horizontal overflow.
- Existing `test:booking-ui-browser`, `test:parser`, `test:app-smoke-browser`, `test:mobile-usability-browser`, and `test:safe` checks still pass.

##### H. Failure Criteria

Future implementation should be considered failed if:

- Any public/customer/driver route shows archive content.
- Any mock workbench appears as a new top-level production panel.
- Any new mock workbench is added.
- Any parser behavior changes.
- Any Supabase, API, storage, billing, payment, PDF, or notification behavior is activated.
- Any booking save/load or customer account behavior is activated.
- Any mobile horizontal overflow appears.
- Any protected test fails.
- `app/page.tsx` grows significantly without reducing visible dashboard sprawl.
- Archive content is visible by default above operational work.

##### I. Implementation Sequence Recommendation

Recommended sequence after Stage 4A-291:

1. Stage 4A-292 - Implementation of collapsed internal QA/dev archive shell and grouping only.
2. Stage 4A-293 - Read-only checkpoint review after archive implementation.
3. Stage 4A-294 - Production data/auth boundary plan.
4. Only after that, select one real workflow for implementation.

Stage 4A-292, if approved later, should be a bounded runtime UI-only implementation with browser test updates in the same stage. It must not activate real data, API, auth, billing, notification, dispatch, parser, Supabase, or package-script behavior.

Stage 4A-294 plans production data/auth boundaries after the collapsed archive implementation and read-only verification. The mock archive remains internal/admin-only, and real data/auth/Supabase work remains blocked until future approved stages.

Stage 4A-296 keeps the mock QA/dev archive separate from future persisted production data. Mock archive content remains internal/admin-only and should not become business data.

Stage 4A-298 keeps QA/dev archive content out of future persisted production data, RLS policies, and API boundaries.

Stage 4A-300 keeps QA/dev archive and mock data protected through future test guard planning. It does not activate schema, migration, API, runtime, or persistence behavior.

### Stage E: Implement Collapsed Mock QA Area

Implement the approved collapse/hide behavior only. Keep all sections mock/local/static/display-only, keep Mock Only labels visible, and preserve browser/mobile route leakage protections.

### Stage F: Real-Data Design Review Before Persistence

Review production data boundaries, auth, Supabase/RLS, rollback, and test strategy before any real database or API behavior is introduced.

### Stage G: Choose One Real Production Workflow

Only after the dashboard is consolidated and real-data design is approved, choose one bounded production workflow to implement with tests and a read-only checkpoint review.

## 6. What Not To Activate Yet

These sectors must remain inactive until separately planned, approved, and test-protected:

- Supabase/database persistence.
- Auth/customer accounts.
- Real booking save/load.
- Real billing/monthly invoice.
- Invoice/PDF/payment links.
- Payouts/accounting/finance export.
- Driver assignment/dispatch persistence.
- Notifications/message sending.
- Live location/maps/flight/route APIs.
- Proof/photo upload.
- SLA/audit/quote/pricing automation.
- Parser learning or parser rule changes.

Dashboard cleanup must not become an indirect path to activating any of these sectors.

## 7. Customer Short-Notice Booking Rule

Locked rule:

- If a customer-submitted pickup time is less than 24 hours away, the customer cannot directly confirm in the app.
- The booking must be marked `Admin Review Required`.
- Admin/dispatcher staff must review availability and confirm manually.
- Customer-facing wording:

> “This booking is within 24 hours, so our team will review and confirm availability.”

This rule is documentation-only in Stage 4A-286. Do not implement app behavior yet. Future implementation must be a separate approved stage with booking UI, customer route, browser/mobile, parser-boundary, and `test:safe` protection.

## 8. Parser Safety Plateau

Parser behavior should stay frozen unless a specific parser defect or approved parser-improvement stage exists.

Any parser change must:

- Include regression tests.
- Pass `npm run test:parser`.
- Pass `npm run test:safe`.
- Preserve Prestige Transport own-company handling.
- Preserve organization email inference.
- Preserve public email guards.
- Preserve route/address parsing.
- Preserve passenger/booker/company handling.
- Preserve recent parser protections.

Parser learning or parser rule changes must not be bundled into dashboard cleanup, mock hiding, billing, dispatch, Supabase, auth, or notification stages.

## 9. Future Commit Safety Checks

Keep this required checkpoint pattern before future commits:

```bash
git status --short
npm run test:booking-ui-browser
npm run test:parser
npm run lint
npm run build
npm run test:app-smoke-browser
npm run test:mobile-usability-browser
npm run test:safe
git diff --check
git status --short
```

Commit only if clean.

After commit:

```bash
npm run test:safe
git status --short
```

Do not change package scripts or `test:safe` membership without a separate explicit approval stage.

## 10. Recommended Next Safe Stage

Recommended next stage: Stage 4A-299 - Read-only checkpoint review after Migration / RLS / API plan.

Reason: Stage 4A-298 documents future migration, RLS, and API boundaries while keeping mock archive content out of persisted business data. The safest next step is a read-only review before test guard planning or real implementation advances.
