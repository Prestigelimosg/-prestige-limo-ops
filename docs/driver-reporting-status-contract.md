# Driver Reporting Status Contract

This contract defines the driver reporting path from safe driver detail acknowledgement to JC. It is a pre-activation guardrail only; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.

## Scope

Driver reporting must stay a narrow operational workflow for one assigned job. The public driver job link is the controlled surface for safe job review, driver and vehicle detail acknowledgement, driver issue reporting, and status progression.

This document is the current source of truth for driver public reporting/status boundaries. Older driver-job planning docs remain useful historical planning context, but any older PayNow, live-location, OTS photo, reminder, exception, or broad future workflow wording must defer to this contract and its executable guard before runtime work proceeds.

The current source-of-truth modules are:

- `lib/driver-job-status-workflow.ts` for status values, aliases, labels, and sequence enforcement.
- `lib/driver-job-issue-alert.ts` for safe issue report choices.
- `lib/driver-job-link.ts` for `SafeDriverJobPayload` and safe status history projection.
- `app/driver-job/[token]/page.tsx` for the public driver action surface.
- `app/api/driver-job/[token]/status/route.ts` for the guarded status PATCH route.
- `lib/driver-job-status-persistence.ts` for production status event persistence when the production gate is explicitly enabled and configured.

## Driver Input To JC

1. Driver opens the private `/driver-job/[token]` link for one assigned job.
2. The page reads a `SafeDriverJobPayload` only.
3. Driver reviews safe job details: date/time, service, pickup, drop-off, route, waypoints, flight, passenger display, assigned driver name/contact/plate/vehicle model, safe app updates, and safe status history.
4. Driver enters or confirms driver and vehicle details, then uses Save & Acknowledge Job to persist the safe details through the token-scoped driver details path.
5. Acknowledgement is required before any status update can be accepted.
6. Driver can then advance the job only in this order:

```text
driver_otw -> ots -> pob -> completed
OTW -> OTS -> POB -> Job Completed
```

7. Accepted status updates are sent to `/api/driver-job/[token]/status` by PATCH with the guarded `status` value.
8. Safe status history/timing evidence is returned through the safe payload and may be read by guarded admin status surfaces.
9. `completed` is the JC terminal state. After JC, additional driver status updates must be rejected by the transition guard.

## Status Rules

The only driver-visible workflow statuses are:

| Value | Label | Meaning |
| --- | --- | --- |
| `driver_otw` | `OTW` | Driver is on the way to pickup. |
| `ots` | `OTS` | Driver is on the spot / arrived at pickup. |
| `pob` | `POB` | Passenger is on board. |
| `completed` | `Job Completed` | Job is completed / JC. |

`guardDriverJobStatusTransition` must keep these outcomes:

- invalid status: reject as `invalid_status`.
- not acknowledged: reject as `acknowledgement_required`.
- skipped or repeated step: reject as `out_of_order`.
- status after JC: reject as `already_completed`.
- exact next step only: accept and normalize to the guarded status value.

Aliases may normalize into the guarded values, but aliases must not create new workflow states.

## Driver Issue Reports

Driver issue reporting must stay enum-only and operational/safety-only:

- `cannot_find_passenger`
- `passenger_no_show`
- `passenger_late`
- `flight_or_pickup_timing_changed`
- `route_or_itinerary_changed`
- `vehicle_issue`
- `traffic_delay`
- `accident_or_safety_concern`
- `other_issue`

Issue reports must create internal app/admin handling only. They must not send Telegram, WhatsApp, SMS, email, provider messages, or customer messages from the public driver surface.

## Visibility Matrix

| Surface | Allowed reporting data |
| --- | --- |
| Driver public link | One-job safe payload, token-scoped saved driver/vehicle detail acknowledgement, guarded status buttons, enum-only issue alert, safe app updates, safe status history. |
| Admin/dispatcher | Saved driver status event summary, latest status, safe status history/timing, operational issue alert summary, source surface, safe actor label. |
| Customer public surfaces | Only separately approved customer-safe status summaries. No raw driver issue detail or internal handling state without a future approved customer contract. |
| Persistence/audit | Driver status event value, booking reference, verified driver job link id, driver actor role, source surface, status source, safe note/context only. |

## Never Expose

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Driver reporting must also avoid secrets, token hashes, service-role/server-only details, unrelated customer rows, other driver jobs, payment/PDF data, pricing/rate internals, live location, photo/proof upload state, parser internals, and unapproved auth/session internals.

## Future Expansion Rule

Do not broaden the driver status list to represent every real-world exception. Keep the driver path simple and push messy operational cases into safe issue reports and admin-only handling states.

Future admin-only handling states may be planned separately for dispatcher review, no-show review, replacement driver needed, replacement dispatched, admin cancellation, completed with exception, late risk, or flight ETA review. They must not become public driver statuses unless a separate contract, privacy guard, and verification pass approves them.
