# Customer Copy Multi-Channel Existing Workflow Lock

This document is docs/test-only. It does not approve a duplicate UI/API surface, env changes, deployment, bulk sends, payment/PDF/pricing/payout/auth/location/photo/calendar activation, parser changes, customer/driver portal changes, or new shims.

The admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow already exists in the current app. Do not rebuild it as duplicate Email, WhatsApp, SMS, or Telegram workflow sectors.
Telegram customer/driver use is limited to admin manual clipboard preparation inside the existing Dispatch rows. It does not call Telegram, store chat IDs, open Telegram URLs, or send provider messages.

## Existing Surfaces

- `app/page.tsx` owns the existing Customer Copy section at `data-dispatch-workflow-step="customer-whatsapp-copy"`.
- `app/page.tsx` owns the existing Customer Copy text edit/copy controls at `data-copy-edit-button="customerCopy"`, `data-copy-copy-button="customerCopy"`, and `data-copy-preview="customerCopy"`.
- `app/page.tsx` owns the existing customer live-location helper inside Customer Copy at `data-customer-live-location-helper`.
- `app/page.tsx` owns the existing compact customer driver-details Email review item at `data-admin-customer-driver-details-email-review-item`.
- `app/page.tsx` owns the existing Email, WhatsApp, SMS, and manual Telegram controls at `data-admin-customer-driver-details-email-disabled-send-action`, `data-admin-customer-driver-details-whatsapp-disabled-send-action`, `data-admin-customer-driver-details-sms-disabled-send-action`, and `data-admin-customer-driver-details-telegram-manual-copy-action`.
- `app/page.tsx` owns the manual driver job link Telegram copy control at `data-driver-job-link-telegram-manual-copy-button`.
- Email now uses the existing approved gated POST route `POST /api/admin-customer-driver-details-email-send-action` from the same compact row.
- WhatsApp and SMS remain parked on setup-only/no-op GET paths: `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup` and `GET /api/admin-sms-customer-driver-details-send-disabled-setup`.
- `app/page.tsx` owns the existing Email activation preflight status at `data-admin-email-activation-preflight-status`.
- Customer In-App and Driver In-App remain the existing admin-selected app notification path through `POST /api/admin-customer-driver-app-notifications`.
- Telegram provider sending remains the existing internal-admin alert send path only: `POST /api/admin-telegram-internal-admin-alert-send`.
- Customer and driver Telegram controls are admin manual-copy only; they write already-visible safe copy to the clipboard and keep `external_send=false`.

## Existing Coverage

- `scripts/test-customer-copy-multi-channel-no-live-guard.mjs` owns the parked SMS/WhatsApp no-live guard and the Email UI-to-gated-route source guard.
- `scripts/test-admin-customer-driver-details-email-send-action-api-contract.mjs` owns the gated Email POST contract.
- `scripts/test-app-smoke-browser.mjs` covers the compact Customer Copy Email review row.
- `scripts/test-booking-ui-browser.mjs` covers the Customer Copy driver-details review item, saved-booking review-item GET, Email POST interaction, copy output protections, and no private/finance/internal leakage.
- `scripts/test-mobile-usability-browser.mjs` covers the Customer Copy surface in mobile layout checks.

## Future Work Rule

Future work must reuse the existing compact Customer Copy multi-channel row and existing Driver Job Link row instead of adding another Email, WhatsApp, SMS, Telegram, provider-send, customer-message, or driver-notification UI sector, card, route, helper, or shim for the same purpose.

Approved current lane:

- Email may be triggered only by explicit admin click through `POST /api/admin-customer-driver-details-email-send-action`, using the gated Resend helper and allowlist safeguards.
- Customer In-App and Driver In-App may be triggered only by explicit admin click through the existing in-app notification route.
- Telegram provider messages may be sent only through the existing internal-admin alert route.
- Customer/driver Telegram may only be prepared through the existing admin manual clipboard controls. No Telegram provider send, chat ID, bot token, `t.me` link, external request, app notification, DB write, or public/customer/driver Telegram surface is added.
- SMS and WhatsApp remain parked setup-only/no-op for now.
- Activating live Email beyond the existing gate, WhatsApp, SMS, Telegram provider sends, push, provider/env reads, provider sends, recipient sends, notification sends, customer messages, driver notifications, or any fallback/blast behavior requires a separately approved lane.

Still blocked without separate explicit approval:

- Adding duplicate Email, WhatsApp, SMS, Telegram, customer-message, driver-notification, provider-send, or customer driver-details workflow sectors, buttons, cards, routes, helpers, or shims.
- Activating SMS or WhatsApp sends, customer/driver Telegram provider sends, automatic fallback, automatic multi-channel blast, batch send, scheduler, polling, retry automation, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser-learning behavior, or broad DB writes.
- Moving Customer Copy multi-channel controls into customer or driver surfaces.
- Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, raw provider payloads, tokens, or secrets.

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
