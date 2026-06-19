# Customer Copy Multi-Channel Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, customer/driver portal changes, or new shims.

The admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow already exists in the current app. Do not rebuild it as duplicate Email, WhatsApp, or SMS workflow sectors.

## Existing Surfaces

- `app/page.tsx` owns the existing Customer Copy section at `data-dispatch-workflow-step="customer-whatsapp-copy"`.
- `app/page.tsx` owns the existing Customer Copy text edit/copy controls at `data-copy-edit-button="customerCopy"`, `data-copy-copy-button="customerCopy"`, and `data-copy-preview="customerCopy"`.
- `app/page.tsx` owns the existing customer live-location helper inside Customer Copy at `data-customer-live-location-helper`.
- `app/page.tsx` owns the existing compact customer driver-details Email review item at `data-admin-customer-driver-details-email-review-item`.
- `app/page.tsx` owns the existing disabled/no-op Email, WhatsApp, and SMS review buttons at `data-admin-customer-driver-details-email-disabled-send-action`, `data-admin-customer-driver-details-whatsapp-disabled-send-action`, and `data-admin-customer-driver-details-sms-disabled-send-action`.
- `app/page.tsx` owns the existing Email activation preflight status at `data-admin-email-activation-preflight-status`.
- The existing disabled-send setup paths are `GET /api/admin-customer-driver-details-email-send-disabled-setup`, `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup`, and `GET /api/admin-sms-customer-driver-details-send-disabled-setup`.
- These surfaces are admin-only setup/review controls. They do not send Email, WhatsApp, SMS, Telegram, push, customer messages, or driver notifications.

## Existing Coverage

- `scripts/test-customer-copy-multi-channel-no-live-guard.mjs` owns the no-live/provider/env/DB-write guard for the existing Customer Copy Email/WhatsApp/SMS review controls.
- `scripts/test-app-smoke-browser.mjs` covers the compact Customer Copy email review row and setup-only disabled send state.
- `scripts/test-booking-ui-browser.mjs` covers the Customer Copy driver-details review item, saved-booking review-item GET, disabled Email send no-op GET, copy output protections, and no private/finance/internal leakage.
- `scripts/test-mobile-usability-browser.mjs` covers the Customer Copy surface in mobile layout checks.

## Future Work Rule

Future work must reuse the existing compact Customer Copy multi-channel row instead of adding another Email, WhatsApp, SMS, provider-send, customer-message, or driver-notification UI sector, card, route, helper, or shim for the same purpose.

Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing Customer Copy controls.

Still blocked without separate explicit approval:

- Adding duplicate Email, WhatsApp, SMS, customer-message, driver-notification, provider-send, or customer driver-details workflow sectors, buttons, cards, routes, helpers, or shims.
- Activating live Email, WhatsApp, SMS, Telegram, push, provider/env reads, provider sends, recipient sends, notification sends, customer messages, driver notifications, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser-learning behavior, or DB writes.
- Moving Customer Copy multi-channel controls into customer or driver surfaces.
- Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, raw provider payloads, tokens, or secrets.

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
