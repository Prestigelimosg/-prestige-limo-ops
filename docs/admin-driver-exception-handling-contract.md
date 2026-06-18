# Admin Driver Exception Handling Contract

This contract defines where driver-side exceptions go after the public driver reporting/status contract. It is docs/test-only and does not approve runtime implementation, UI/API behavior change, endpoint migration, new UI sectors, new buttons, env changes, deployment, DB read/write, migrations, provider sends, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Scope

Driver public reporting stays simple and must not grow into a broad exception workflow. Public driver status remains:

```text
driver_otw -> ots -> pob -> completed
OTW -> OTS -> POB -> Job Completed
```

The admin-only exception handling path owns messy operational cases that should not become public driver statuses.

## Existing Admin Placement

Do not add another admin UI sector or loose button for this contract.

Future runtime work, if separately approved, must stay compact and colocated with the existing admin operational areas:

- Day-of-Trip Exception Escalation: `data-admin-day-of-trip-exception-escalation`.
- Dispatch Recovery / Replacement Readiness: `data-admin-dispatch-recovery-replacement-readiness`.
- Completed Trip Closeout Review for post-JC exception resolution review.

Current matching workflow persistence planning uses:

- `day_of_trip_exception`.
- `dispatch_recovery`.
- `trip_completion`.
- `closeout_review`.

## Admin-Only Exception Types

Admin-only driver exception handling may classify operational cases such as:

- `driver_no_response`
- `driver_late_or_reminder_due`
- `cannot_find_passenger`
- `passenger_no_show_review`
- `passenger_late_review`
- `timing_or_route_changed`
- `vehicle_issue`
- `replacement_driver_needed`
- `replacement_vehicle_needed`
- `dispatcher_call_needed`
- `customer_update_review`
- `completed_with_exception_review`
- `closed_after_dispatcher_review`

These names are contract-level categories only. They do not approve new database values, runtime status values, API inputs, UI buttons, customer messages, or driver-visible states.

## Mapping From Driver Issue Reports

Safe public driver issue reports may inform admin review, but they must not directly become public customer or driver workflow states.

| Driver issue report | Admin-only handling area |
| --- | --- |
| `cannot_find_passenger` | Day-of-Trip Exception Escalation |
| `passenger_no_show` | Day-of-Trip Exception Escalation |
| `passenger_late` | Day-of-Trip Exception Escalation |
| `flight_or_pickup_timing_changed` | Day-of-Trip Exception Escalation |
| `route_or_itinerary_changed` | Day-of-Trip Exception Escalation |
| `vehicle_issue` | Dispatch Recovery / Replacement Readiness |
| `traffic_delay` | Day-of-Trip Exception Escalation |
| `accident_or_safety_concern` | Day-of-Trip Exception Escalation and Dispatch Recovery / Replacement Readiness |
| `other_issue` | Dispatcher review before any customer/driver wording |

## Visibility Rules

Driver public surfaces may show only the safe job payload, guarded status chain, enum-only issue alert, safe app updates, and safe status history.

Admin/dispatcher surfaces may review operational exception state, replacement readiness, local staff notes, and closeout exception resolution, as long as those surfaces remain internal and guarded.

Customer public surfaces may receive only separately approved customer-safe status summaries. Raw driver issue details, replacement-driver reasoning, dispatcher notes, internal exception state, and closeout notes remain blocked until a future customer contract approves them.

## Never Expose

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, mock QA/dev archive, dispatcher exception notes, replacement-driver review notes, or customer billing/payment/PDF readiness.

## Future Runtime Rule

If future runtime implementation is approved, it must:

- reuse the existing compact admin exception/recovery areas instead of adding a new UI sector;
- keep public driver statuses unchanged;
- keep driver issue input enum-only;
- keep customer visibility separately approved and customer-safe;
- keep admin local notes/internal exception states out of public driver and customer payloads;
- prove no payment, pricing, payout, PayNow, invoice, PDF, billing, parser/debug, auth, live location, photo/proof, provider send, or mock archive leakage.
