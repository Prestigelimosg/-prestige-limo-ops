# Customer Portal Real Booking Data Path Audit

Last reviewed: 2026-06-11

Scope: this is a production-readiness audit only. It does not change pricing behavior, add UI, add migrations, run Supabase CLI, write a live database, generate invoices/PDFs, send payments, send payouts, or send notifications.

## Current State

- `/my-bookings` keeps compact in-file sample bookings as the fallback state in `app/my-bookings/page.tsx`.
- The customer portal adapter attempts the guarded read through `lib/customer-portal-saved-bookings-adapter.ts`.
- The adapter fetches `/api/customer-saved-bookings?limit=25&page=1` with `credentials: "same-origin"` and only the `x-prestige-customer-purpose: customer-saved-bookings-read` header.
- The browser must not manually attach `Cookie`, `Authorization`, or `x-prestige-customer-session-token` headers.
- `/api/customer-saved-bookings` uses the server-only `lib/customer-saved-bookings-read.ts` boundary and blocks POST, PUT, PATCH, and DELETE.
- `/api/admin-customer-saved-bookings` remains admin-scoped and must not be reused directly by `/my-bookings`.
- `/api/customer-booking-statuses` remains a customer-facing status lookup only. It is not a complete customer booking history endpoint.

## Customer Saved Bookings Auth Handoff

The current handoff is intentionally small and server-side:

- Enablement requires `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED=true`.
- The accepted auth mode remains `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE=server-session-token`.
- The server maps the accepted session to `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`.
- The server validates `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`.
- The default request cookie names are `prestige_customer_saved_bookings_session` and `prestige_customer_session`.
- `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME` may set one deployment-specific safe cookie name.
- A configured cookie name is exclusive; default names are not accepted when the override is set.
- Unsafe, duplicate, ambiguous, wrong, missing, or placeholder values fail closed with the customer auth-required response.
- The read path still needs server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; those values must never be exposed to the browser.
- No UI change is included in this handoff contract.
- No Supabase CLI command, migration, live DB write, invoice/PDF/payment/payout, or notification send is included.

The static readiness check is `node scripts/test-customer-saved-bookings-auth-handoff-readiness.mjs`.

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

Add real customer session issuance only after the owner approves the exact auth/login path:

- The session setter must create a secure HTTP-only, same-site customer cookie for one customer account.
- The customer portal client should stay compact and continue using same-origin credentials only.
- Keep sample/fallback behavior until the real session issuer and customer account mapping are approved and tested.
- Keep proving that no admin finance, payout, invoice/payment, parser/debug, mock/dev archive, or other-customer data can leak.
