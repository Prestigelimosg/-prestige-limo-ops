# Admin Monthly Drafts Production Save-Load Verification Evidence

## Scope

This evidence records one controlled production save/load/delete verification for the monthly billing draft planning API and monthly invoice draft API.

Approved command:

```bash
PRESTIGE_ADMIN_MONTHLY_BILLING_INVOICE_DRAFT_PRODUCTION_SAVE_LOAD_APPROVED=stage-monthly-drafts-william-approved node scripts/run-admin-monthly-billing-invoice-draft-production-save-load-verification.mjs
```

## Result

- Result: passed.
- Production DB touched: yes.
- Supabase CLI: not run.
- Raw SQL: not run.
- Migration apply: not run in this verification.
- Env/secrets/full project ref printed: no.
- Real bookings/customers touched: no.
- Customer/driver auth or policies changed: no.
- Invoice number/PDF/payment/payout/notification behavior: not created.

## Exact Fake Scope

Monthly billing draft planning:

- Table: `monthly_billing_draft_plans`.
- Fake customer/account: `PROD MONTHLY BILLING DRAFT VERIFY 20260607 SAFE ACCOUNT`.
- Billing month: `2026-06`.
- Draft status: `ready_for_billing_draft_review`.
- Readiness status: `ready`.
- Created rows: 1.
- Loaded rows matched: 1.
- Deleted rows: 1.
- Post-cleanup rows: 0.

Monthly invoice draft:

- Table: `monthly_invoice_drafts`.
- Linked table: `monthly_invoice_draft_trip_links`.
- Fake customer/account: `PROD MONTHLY INVOICE DRAFT VERIFY 20260607 SAFE ACCOUNT`.
- Fake linked trip reference: `PROD-INVOICE-DRAFT-VERIFY-20260607-SAFE-TRIP-001`.
- Billing month: `2026-06`.
- Draft status: `pending_admin_review`.
- Readiness status: `ready`.
- Created draft rows: 1.
- Created linked trip rows: 1.
- Loaded rows matched: 1.
- Deleted draft rows: 1.
- Post-cleanup draft rows: 0.
- Post-cleanup linked rows: 0.

## Safety Gates Verified

- Anonymous billing draft read blocked with `403`.
- Customer-referer invoice draft create blocked with `403`.
- Driver-referer invoice draft read blocked with `403`.
- Unsafe billing draft payload blocked with `400`.
- Unsafe invoice draft payload blocked with `400`.
- Persistence default remained off in the saved env after verification.
- Process kill switch was forced off after verification.

## Cleanup

Cleanup used exact-match Supabase JS deletes only:

- `monthly_billing_draft_plans` by exact `customer_account` and `billing_month`.
- `monthly_invoice_drafts` by exact draft id after exact `customer_account` and `billing_month` match.
- `monthly_invoice_draft_trip_links` cleanup was verified through the draft delete cascade.

No broad delete, real customer row, real booking row, invoice number, PDF, payment, payout, notification, customer auth, or driver auth action was performed.
