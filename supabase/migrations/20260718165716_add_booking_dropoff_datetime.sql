set local lock_timeout = '5s';

alter table if exists public.bookings
  add column if not exists dropoff_datetime timestamptz;

comment on column public.bookings.dropoff_datetime is
  'Admin-only scheduled DSP end timestamp. This is planning data; actual Driver OTS/JC timing remains the invoice evidence source.';
