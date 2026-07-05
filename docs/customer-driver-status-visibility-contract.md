# Customer Driver Status Visibility Contract

This contract defines how driver/job details and progress may be shown to customer-facing surfaces. The current approved runtime scope is bounded to the `/my-bookings` expanded booking details card, optional customer-safe assigned-driver details from the saved-bookings projection, and one customer-safe Driver Tracking panel that uses the existing gated customer map read plus compact Trip Updates. It does not approve any additional customer/admin sectors, endpoint migration, env changes, deployment by CLI, migrations, provider sends, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/calendar activation, raw GPS exposure, customer message sending, or new shims.

## Scope

Customer surfaces must not receive raw driver reporting, raw driver issue reports, admin exception state, dispatcher notes, replacement-driver review, raw live location state, OTS photo/proof state, or internal closeout notes.

Current customer saved-booking list display remains generic and customer-safe. The current `/my-bookings` saved-booking status surface is limited to:

- `Requested`
- `Pending Staff Review`
- `Confirmed`
- `Completed`
- `Cancelled`

These are customer-facing booking states, not raw driver workflow states.

Owner direction: keep the Customer Portal saved-booking list generic, but allow the expanded booking detail view to show customer-safe assigned-driver details and one Grab/Uber-style customer tracking panel after staff confirmation. The portal must not show raw driver workflow/progress internals.

## Current Data Boundary

The current customer saved-bookings path is:

- `app/my-bookings/page.tsx`
- `lib/customer-portal-saved-bookings-adapter.ts`
- `lib/customer-saved-bookings-read.ts`
- `/api/customer-saved-bookings`

This current path is referenced to prove the booking list remains generic and protected while the expanded detail card may show only customer-safe assigned-driver details and the approved customer tracking panel.

The current customer saved-booking record may use `customer_facing_status` and optional `customer_driver_details` only. `customer_driver_details` may contain only driver name, driver contact, car plate, and car type. It must not expose `driver_otw`, `ots`, `pob`, driver status history, driver issue report type, admin exception category, replacement-driver review, dispatcher note, internal status, status event rows, payout, finance, invoice, payment, PDF, proof/photo, raw GPS, or token data.

## Current Customer-Safe Driver Details

The current approved `/my-bookings` expanded detail card may show:

- driver name
- driver contact
- car plate
- car type
- pickup date/time
- route

The card appears from the customer saved-bookings projection only after safe assigned-driver fields exist. If those fields are not present, `/my-bookings` shows only the normal booking details and no empty Driver Details card.

## Current Customer-Safe Driver Tracking

The current approved customer tracking display lives only in the expanded `/my-bookings` detail view. It may use customer-safe summary labels such as:

- `Driver assigned`
- `Driver on the way`
- `Driver arrived`
- `Trip in progress`
- `Completed`

Those labels must be derived through a customer-safe projection. They must not expose raw status event rows, exact internal status values, issue reports, safe admin notes, dispatcher calls, replacement review notes, driver payout, PayNow payout, billing, payment, PDF, raw live-location state, photo/proof, auth internals, parser/debug internals, or mock QA/dev archive details.

The customer tracking panel must stay out of the Customer Portal saved-booking list. It appears only after opening one booking detail.

## Live-Location Handoff Direction

Customer live-location viewing is a gated detail-card tracking panel, not Customer Portal saved-booking list content.

For eligible DEP, TRF, and hourly jobs, the customer may view the in-app map only after the driver is on the way and Prestige opens customer viewing. Arrival/MNG customer live location stays disabled unless separately approved.

Customer-visible live location must auto-disable when the driver presses POB or POB is marked; any backend cleanup grace must not leave customer tracking visible after POB.

This contract does not activate live-location capture, provider send, notification send, storage writes, timing automation, or customer link delivery. The existing customer map read remains server-gated and must return only a safe in-app map embed URL/fallback map URL, message, optional timestamp, and optional accuracy label; raw coordinates must not be rendered as customer-visible text in `/my-bookings`.

## Mapping Rule

Driver public workflow remains:

```text
driver_otw -> ots -> pob -> completed
OTW -> OTS -> POB -> Job Completed
```

Customer-safe progress must map only as a summary:

| Driver/Admin source | Customer-safe summary |
| --- | --- |
| assigned / `driver_assigned` | `Driver assigned` or existing `Confirmed` |
| `driver_otw` | `Driver on the way` |
| `ots` | `Driver arrived` |
| `pob` | `Trip in progress` |
| `completed` | `Completed` |
| any issue or exception | Existing safe booking status, or a separately approved customer-safe service update |

No customer surface may show raw issue values such as `passenger_no_show`, `vehicle_issue`, `accident_or_safety_concern`, or admin-only exception categories such as replacement needed, dispatcher call needed, completed with exception, or closed after dispatcher review.

## Visibility Rules

Customer public surfaces may show only customer-safe booking status/progress summaries.

Driver public surfaces keep the guarded driver reporting workflow and enum-only issue alert.

Admin/dispatcher surfaces keep operational issue, exception, recovery, and closeout review details internal.

## Never Expose

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, mock QA/dev archive, raw driver issue reports, dispatcher exception notes, replacement-driver review notes, raw status event rows, token hashes, service-role/server-only details, live location coordinates, photo/proof storage details, customer billing internals, invoices, payments, PDFs, pricing internals, or payout comparisons.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, mock QA/dev archive, dispatcher exception notes, replacement-driver review notes, or customer billing/payment/PDF readiness.

## Runtime Rule

Customer driver-progress visibility must:

- keep the Customer Portal saved-booking list generic;
- keep the assigned-driver detail card limited to customer-safe driver name, contact, car plate, car type, pickup time, and route;
- use one customer-safe Driver Tracking panel in the expanded booking detail instead of adding a duplicate customer tracking page;
- route customer live-location viewing through the existing gated customer map read and never render raw coordinates in `/my-bookings`;
- auto-disable customer-visible live location when the driver presses POB or POB is marked;
- keep Arrival/MNG customer live location disabled unless separately approved;
- keep customer summaries separate from raw driver workflow and admin exception states;
- keep customer issue/update wording separately approved and customer-safe;
- preserve `/my-bookings` adapter allowlists and forbidden-field filtering;
- prove no finance, payout, PayNow, billing, invoice, payment, PDF, parser/debug, auth, live-location state outside the approved handoff, photo/proof, provider send, token, or mock archive leakage.
