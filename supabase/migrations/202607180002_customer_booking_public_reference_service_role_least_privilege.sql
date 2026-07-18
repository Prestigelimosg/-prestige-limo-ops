-- Tighten default Data API grants after the public-reference foundation.
-- The server-side app reads and creates customer prefix rows, and the booking
-- trigger advances either sequence. It does not need DELETE on either table or
-- INSERT on the singleton global sequence after foundation setup.

set search_path = public, extensions;

revoke all on table public.customer_booking_reference_sequences from service_role;
revoke all on table public.global_booking_reference_sequence from service_role;

grant select, insert, update on table public.customer_booking_reference_sequences to service_role;
grant select, update on table public.global_booking_reference_sequence to service_role;
