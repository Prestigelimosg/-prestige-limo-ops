# Stage 4A-397 - Legacy Public Table Server Route Hardening

Stage 4A-397 retires the admin dashboard's browser-side direct Supabase access for the legacy admin CRM, rates, and driver tables before any RLS hardening migration is created.

## Layman Summary

The old admin dashboard was still using a browser Supabase client for legacy internal tables. That meant the browser could talk directly to those tables, which is not the shape we want before tightening RLS.

This stage moves those dashboard actions behind a server-only admin route that is protected by the existing admin/dispatcher boundary. The browser now calls the internal route, and the route uses server-only Supabase access after validating the table, selected fields, filters, and payload fields against a narrow allowlist.

## Tables Covered

The browser-side direct table calls were retired for:

- `public.bookers`.
- `public.companies`.
- `public.saved_addresses`.
- `public.rate_settings`.
- `public.travelers`.
- `public.drivers`.

The admin page's legacy booking list/update/delete calls also moved through the same admin-gated route layer so `app/page.tsx` no longer depends on the browser Supabase client import.

## Route Boundary

- Route: `/api/admin-legacy-data/rest/v1/[table]`.
- Server-only Supabase access uses server env on the route, never browser env.
- Requests require the existing admin/dispatcher boundary and the admin booking persistence purpose header.
- Anonymous, customer, public, and driver-style referers are rejected.
- Local-dev admin fallback is rejected in production runtime.
- Missing or placeholder server config is rejected.
- Failure responses are sanitized.
- Unsupported tables, unsupported columns, wildcard selects, unsafe select fields, unsafe filters, and unsafe payload keys are rejected.

## What This Stage Does Not Do

- No RLS migration was created.
- No RLS migration was applied.
- No Supabase CLI command was run.
- No raw SQL was run.
- No dashboard quick fix was used.
- No production write was performed.
- No staging row was deleted.
- No public anon policy was added.
- No customer auth or driver auth was added.
- No billing, payment, invoice, PDF, PayNow payout, live-location, proof/photo, notification, or parser-learning workflow was added.
- Production enablement remains not approved.

## Tests

- `scripts/test-legacy-admin-supabase-browser-access-retired.mjs` proves `app/page.tsx` no longer imports the browser Supabase client or directly calls the six legacy table names.
- `scripts/test-legacy-admin-api-route-contract.mjs` proves the route rejects anonymous/customer/driver/public-style requests, accepts a mocked admin session request, rejects unsafe contract fields, sanitizes failures, rejects placeholder/missing server config, and needs no real Supabase network/write.

## Remaining Backend Workflow

RLS hardening is still a separate backend security stage. Any future RLS migration, Supabase command, raw SQL, production enablement, staging cleanup write/delete, or dashboard fix still requires separate explicit William approval.
