alter table if exists public.bookings
  add column if not exists customer_special_request text;

alter table if exists public.bookings
  drop constraint if exists bookings_customer_special_request_safe_check;

alter table if exists public.bookings
  add constraint bookings_customer_special_request_safe_check
  check (
    customer_special_request is null
    or (
      char_length(customer_special_request) between 1 and 500
      and customer_special_request = btrim(customer_special_request)
      and position(E'\r' in customer_special_request) = 0
      and translate(customer_special_request, E'\n', '') !~ '[[:cntrl:]]'
    )
  );
