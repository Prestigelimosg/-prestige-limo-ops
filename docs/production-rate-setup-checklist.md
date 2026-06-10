# Production Rate Setup Checklist

Last reviewed: 2026-06-10

Scope: this is a production-readiness audit and setup checklist only. It does not change pricing behavior, add UI, run Supabase CLI, write a live database, generate invoices/PDFs, send payments, send payouts, or send notifications.

## Current Rate Handling

- Code defaults live in `lib/pricing.ts`.
- Default customer rates are `MNG 85`, `DEP 75`, `TRF 55`, and `DSP 65/hour`.
- Default driver payout rules are `MNG 65-75`, `DEP 55-65`, `TRF 45-70`, and `DSP 50/hour`.
- Default surcharges and payouts are midnight customer `15`, midnight driver `10`, extra stop customer `15`, extra stop driver `10`, child seat customer `15`, and child seat driver `10`.
- `initialRateSettings` seeds the dashboard state when saved settings are unavailable.
- The admin Rates tab loads saved defaults, company/account overrides, and boss/name overrides through `/api/admin-rate-setup`, then merges saved default values over the code defaults.
- The admin Rates tab can still save defaults and overrides back through the guarded legacy admin data route; save behavior is unchanged by the typed read path.

## Override Support

- Company/account overrides are supported on `companies.customer_rates` and `companies.driver_payout_rules`.
- Boss/name customer-rate overrides are supported on `travelers.customer_rates` and are applied before company/default customer rates.
- Boss/name driver-payout rules are supported by the current admin save/display data shape on `travelers.driver_payout_rules`, but `resolvePricing` does not currently consume traveler payout rules.
- Selected driver payout overrides are supported on `drivers.driver_payout_rules` and override company/default payout rules for the selected booking type.
- Manual booking overrides are supported by booking fields such as customer price override/reason and driver payout override/reason.
- Current customer price priority is boss/name customer rate, then company customer rate, then default customer rate.
- Current driver payout priority is selected driver payout rule, then company payout rule, then default payout rule.

## Admin-Only Fields

Keep these fields and concepts admin/dispatcher-only unless a later approved role boundary explicitly allows a narrower projection:

- Customer rates, customer price amounts, quote overrides, customer price override reasons, billing, invoice, payment, and PDF fields.
- Driver payout rules, payout amounts, payout min/max, payout overrides, payout reasons, payout preferences, PayNow payout details, payout comparisons, and internal finance notes.
- Internal admin notes, driver notes intended for staff review, parser/debug internals, raw parser prompts or AI output, service-role/server-only config, mock QA archive, and dev workbench data.

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data. Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, or mock QA/dev archive data.

## Owner Setup Checklist

- Confirm the default customer rates for `MNG`, `DEP`, `TRF`, and `DSP/hour`.
- Confirm the default driver payout rule for each booking type, including whether the value is a fixed amount, min/max range, or hourly amount.
- Confirm default midnight, extra stop, and child seat customer surcharges.
- Confirm default midnight, extra stop, and child seat driver payouts.
- List company/account overrides that differ from the defaults.
- List boss/name customer-rate overrides that differ from the company/account defaults.
- Decide whether boss/name driver-payout overrides should become pricing-effective; today they are stored/displayed but not applied by `resolvePricing`.
- List selected-driver payout rules that differ from company/default payout rules.
- Keep effective dates, approval notes, and override reasons in admin-only review data when those fields are later added.

## Safest Next Rate Implementation Step

After the typed read API, the safest rate-specific implementation step is to replace one existing Rates tab save path with a typed admin-only server API, starting with the smallest default-rate save contract. Keep pricing calculations and UI unchanged until each save contract is covered by route tests and customer/driver/anonymous leak checks.

Do not add customer-facing pricing, driver-facing customer price, invoice/PDF/payment/payout behavior, notification sending, Supabase CLI changes, or live DB writes as part of that step.
