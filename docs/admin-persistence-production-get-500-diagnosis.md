# Stage 4A-406 - Production Admin Bookings GET 500 Diagnosis

Stage 4A-406 diagnosed the Stage 4A-405 `/api/admin-bookings` production GET `500` by local code inspection and mocked tests only. No production route was called in this stage.

## Root Cause

The admin booking GET/load path selected only the newer admin booking schema shape:

- `bookings.pickup_at`, `bookings.service_type`, current review columns, and `source_surface`;
- `booking_route_points.sequence`, `location`, and `notes`;
- `booking_service_items.item_type`, `quantity`, and `notes`.

The earlier approved foundation migration shape still uses `pickup_datetime`, `route_type`, `source_channel`, `sequence_number`, `location_text`, `timing_note`, `service_item_type`, and `blocks_count`. When production was read through the admin-gated route in Stage 4A-405, a schema-cache or missing-column response would be converted to the safe load `500`.

## Local Fix

The server-only Supabase adapter now tries the current read shape first and falls back to the foundation read shape only when the first read fails as a missing-column/schema-cache category. The fallback is read-only and applies to:

- `/api/admin-bookings` GET list;
- safe reload by booking id after future approved writes;
- safe lookup by booking reference used by the update path.

The fallback does not select `booking_service_items.internal_note` and does not expose finance, payout, payment, PDF, notification, live-location, proof/photo, customer auth, driver auth, or parser-learning fields.

## Production Status

- Production DB touched in Stage 4A-406: no.
- Production write attempted: no.
- Production POST save/load verification attempted: no.
- Test record created: no.
- Cleanup/delete needed: no.
- Approved masked production target from the prior stage remains `kvv...atm`; the full project reference was not printed.
- Persistence default remains expected to be OFF outside a separately approved controlled verification.

## Remaining Boundary

This stage fixes the GET/load schema mismatch only. It does not approve a production POST write retry, customer auth/RLS, driver auth/token security, notifications, billing, payment, invoice/PDF, payout, live-location, dashboard fixes, migrations, raw SQL, or Supabase CLI work.
