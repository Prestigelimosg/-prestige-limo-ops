alter table public.rate_settings
  add column if not exists child_seat_customer_surcharge numeric not null default 15,
  add column if not exists child_seat_driver_payout numeric not null default 0;

alter table public.bookings
  add column if not exists child_seat_required boolean not null default false,
  add column if not exists child_seat_count integer not null default 0,
  add column if not exists child_seat_type text,
  add column if not exists child_seat_customer_surcharge numeric not null default 0,
  add column if not exists child_seat_driver_payout numeric not null default 0;
