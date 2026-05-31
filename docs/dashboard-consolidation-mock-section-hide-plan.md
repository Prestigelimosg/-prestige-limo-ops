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

Recommended next stage: Stage 4A-287 - Read-only dashboard mock-section inventory.

Reason: the safest next move is to inventory the current dashboard sections, mock labels, route boundaries, and browser/mobile protections before creating an information architecture plan or implementing collapse/hide behavior. This keeps the project out of another mock workbench cycle and avoids runtime changes before the dashboard shape is fully understood.
