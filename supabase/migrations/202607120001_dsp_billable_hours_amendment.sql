-- DSP final whole-hour billing compatibility.
-- do not apply without explicit owner approval.
-- This changes only the existing admin billable-item price-review constraint.

set search_path = public, extensions;

alter table public.monthly_invoice_billable_item_price_reviews
  drop constraint if exists monthly_invoice_billable_item_price_reviews_dsp_minutes_check;

alter table public.monthly_invoice_billable_item_price_reviews
  add constraint monthly_invoice_billable_item_price_reviews_dsp_minutes_check check (
    (
      dsp_total_minutes is null
      and dsp_billable_minutes is null
    )
    or (
      dsp_total_minutes is not null
      and dsp_total_minutes >= 0
      and (
        dsp_billable_minutes is null
        or (
          dsp_billable_minutes >= 0
          and (
            booking_type = 'hourly'
            or dsp_billable_minutes % 60 = 0
          )
        )
      )
    )
  );

comment on constraint monthly_invoice_billable_item_price_reviews_dsp_minutes_check
  on public.monthly_invoice_billable_item_price_reviews is
  'DSP final billable time may exceed raw actual time for the two-hour minimum and must use whole hours; legacy hourly validation remains server-enforced.';
