# Customer Driver Status Visibility Contract

This contract defines how driver/job progress may be shown to customer-facing surfaces. It is docs/test-only and does not approve runtime implementation, UI/API behavior change, new UI sectors, new buttons, endpoint migration, env changes, deployment, DB read/write, migrations, provider sends, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Scope

Customer surfaces must not receive raw driver reporting, raw driver issue reports, admin exception state, dispatcher notes, replacement-driver review, live location state, OTS photo/proof state, or internal closeout notes.

Current customer saved-booking display remains generic and customer-safe. The current `/my-bookings` saved-booking status surface is limited to:

- `Requested`
- `Pending Staff Review`
- `Confirmed`
- `Completed`
- `Cancelled`

These are customer-facing booking states, not raw driver workflow states.

## Current Data Boundary

The current customer saved-bookings path is:

- `app/my-bookings/page.tsx`
- `lib/customer-portal-saved-bookings-adapter.ts`
- `lib/customer-saved-bookings-read.ts`
- `/api/customer-saved-bookings`

The current customer saved-booking record may use `customer_facing_status` only. It must not expose `driver_otw`, `ots`, `pob`, driver status history, driver issue report type, admin exception category, replacement-driver review, dispatcher note, internal status, or status event rows.

## Future Customer-Safe Driver Progress

Future customer driver-progress display is not approved by this contract. If separately approved later, it may only use customer-safe summary labels such as:

- `Driver assigned`
- `Driver on the way`
- `Driver arrived`
- `Trip in progress`
- `Completed`

Those labels must be derived through a customer-safe projection. They must not expose raw status event rows, exact internal status values, issue reports, safe admin notes, dispatcher calls, replacement review notes, driver payout, PayNow payout, billing, payment, PDF, live location, photo/proof, auth internals, parser/debug internals, or mock QA/dev archive details.

## Mapping Rule

Driver public workflow remains:

```text
driver_otw -> ots -> pob -> completed
OTW -> OTS -> POB -> Job Completed
```

Customer-safe progress, if approved later, must map only as a summary:

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

## Future Runtime Rule

If future customer driver-progress visibility is approved, it must:

- reuse the existing customer portal/status surfaces instead of adding a new UI sector;
- keep customer summaries separate from raw driver workflow and admin exception states;
- keep customer issue/update wording separately approved and customer-safe;
- preserve `/my-bookings` adapter allowlists and forbidden-field filtering;
- prove no finance, payout, PayNow, billing, invoice, payment, PDF, parser/debug, auth, live location, photo/proof, provider send, token, or mock archive leakage.
