# Customer Portal Real Booking Data Path Audit

Last reviewed: 2026-06-10

Scope: this is a production-readiness audit only. It does not change pricing behavior, add UI, add migrations, run Supabase CLI, write a live database, generate invoices/PDFs, send payments, send payouts, or send notifications.

## Current State

- `/my-bookings` still renders in-file customer portal sample bookings from `app/my-bookings/page.tsx`.
- `/book` submits customer booking requests, but it does not currently feed a customer-scoped saved booking list back into `/my-bookings`.
- The existing typed saved booking list API is admin-scoped: `/api/admin-customer-saved-bookings` uses `lib/admin-customer-saved-bookings-read.ts` and is intended for guarded admin/customer folder surfaces.
- `/api/customer-booking-statuses` is customer-facing status lookup only. It is not a complete customer booking history endpoint.
- A customer-specific saved booking list must not reuse the admin API directly because `/my-bookings` needs a customer account/session boundary that can only return that customer's own booking rows.

## Customer-Safe Future Row Fields

- Booking reference or booking id.
- Customer/account label only after the request is scoped to that customer.
- Pickup date/time, pickup location, drop-off location, service type, vehicle type, flight number, passenger name, customer-facing status, and customer-entered special request.
- Edit and cancel review statuses, if they are customer-facing and staff-approved for display.

## Admin-Only Fields

Keep these out of any customer portal booking list unless a later approved role boundary explicitly allows a narrower projection:

- Customer price, rates, billing, invoice, payment, PDF internals, and finance fields.
- Driver payout, payout comparisons, payout overrides, PayNow payout details, and internal finance notes.
- Internal admin notes, parser/debug internals, raw tokens, service-role/server-only config, mock QA archive, and dev archive data.

## Safest Next Implementation Step

Add a small customer portal saved-bookings read contract before changing the UI data source:

- Create a customer-only read helper and route, for example `lib/customer-portal-saved-bookings-read.ts` plus `/api/customer-saved-bookings`.
- Fail closed until secure customer account/session access is available.
- Return only customer-safe fields, with tests proving no admin finance, payout, invoice/payment, parser/debug, mock/dev archive, or other-customer data can leak.
- After that contract is safe, replace `/my-bookings` sample rows with the customer-scoped API result.
