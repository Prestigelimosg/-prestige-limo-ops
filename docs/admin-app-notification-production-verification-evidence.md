# Admin App Notification Production Verification Evidence

Date: 2026-06-07

## Scope

- Route verified: `/api/admin-app-notifications`
- Table touched: `admin_app_notification_outbox`
- Production target proof: masked project ref `kvv...atm`
- Supabase CLI: not run
- Raw SQL: not run
- External notification sending: not run
- Invoice/PDF/payment/payout/customer auth/driver auth: not touched

## Approved Command

```bash
PRESTIGE_ADMIN_APP_NOTIFICATION_PRODUCTION_SAVE_LOAD_APPROVED=stage-admin-app-notification-william-approved node scripts/run-admin-app-notification-production-save-load-verification.mjs
```

## Fake Row

- `booking_reference`: `PROD-APP-NOTIFY-VERIFY-20260607-001`
- `event_key`: `PROD-APP-NOTIFY-EVENT-20260607-001`
- `notification_type`: `system_notice`
- `notification_status`: `queued`
- `priority`: `normal`
- `workflow_area`: `admin_app_notifications`
- Safe admin-only title/message/context only.

## Result

- Anonymous/public-style access blocked with `403` before the live write.
- Customer referer-style access blocked with `403` before the live write.
- Driver referer-style access blocked with `403` before the live write.
- Unsafe payload content blocked with `400` before the live write.
- One fake row was saved through the guarded admin API.
- The same fake row was loaded back through the guarded admin API.
- Cleanup deleted exactly one fake row by `event_key` and `booking_reference`.
- Direct post-cleanup check found `0` exact fake rows remaining.
- Route post-cleanup load found `0` exact fake rows remaining.
- Persistence kill switch remained default `off`; the runner forced process persistence off after verification.

## Checks

These focused checks passed after the verification:

- `node scripts/test-admin-app-notification-production-runner-contract.mjs`
- `node scripts/test-admin-app-notification-api-contract.mjs`
- `node scripts/test-admin-app-notification-schema-contract.mjs`
- `node scripts/test-backend-api-integration-audit.mjs`
- `npm run test:parser`
- `npm run lint`
- `npm run build`
- `npm run test:safe`
- `git diff --check`
