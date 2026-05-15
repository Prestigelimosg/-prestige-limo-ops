alter table public.bookings
  add column if not exists extra_stop_count integer not null default 0,
  add column if not exists extra_stop_surcharge numeric not null default 0;
