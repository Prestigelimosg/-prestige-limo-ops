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

### Stage D: Implement Collapsed Mock QA Area

Implement the approved collapse/hide behavior only. Keep all sections mock/local/static/display-only, keep Mock Only labels visible, and preserve browser/mobile route leakage protections.

### Stage E: Real-Data Design Review Before Persistence

Review production data boundaries, auth, Supabase/RLS, rollback, and test strategy before any real database or API behavior is introduced.

### Stage F: Choose One Real Production Workflow

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

Recommended next stage: Stage 4A-289 - Read-only route leakage boundary map.

Reason: after Stage 4A-287 inventory and Stage 4A-288 dashboard information architecture planning, the safest next move is to map exactly which admin-only sections must stay absent from `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and public driver token routes before any collapse/hide implementation is designed.
