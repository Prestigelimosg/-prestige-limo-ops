# Telegram / WhatsApp Readiness Audit

Last reviewed: 2026-07-03
Reviewed checkpoint: `6503f2e8 Add operator live app handoff checklist`

## Scope

This is a readiness audit only. It does not activate Telegram provider sends, WhatsApp, SMS, provider credentials, env values, schema, DB writes, dispatch writes, notification rows, customer sends, driver sends, payment, payout, GPS, live-location, PDF, or invoice behavior.

The normal Dispatch UI no longer exposes the old Telegram `Send Internal Test` panel. Do not call `POST /api/admin-telegram-internal-admin-alert-send` unless William gives explicit action-time approval for a real internal-admin Telegram test send.

## Current State

- Email driver-details has one approved gated admin route: `POST /api/admin-customer-driver-details-email-send-action`.
- WhatsApp driver-details is parked on setup-only/no-op admin GET route: `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup`.
- SMS driver-details is parked on setup-only/no-op admin GET route: `GET /api/admin-sms-customer-driver-details-send-disabled-setup`.
- Telegram internal-admin alerts have one bounded admin route: `POST /api/admin-telegram-internal-admin-alert-send`.
- Telegram customer/driver provider sends, live-location sends, webhooks, polling, schedulers, retries, batch sends, and automatic multi-channel fallback are not approved.
- Dispatch has admin manual Telegram clipboard controls for customer driver details and driver job link copy. They do not call Telegram, open Telegram URLs, use chat IDs, write notifications, or send provider messages.
- The old Telegram setup/no-send packet is superseded by the ledger section `Telegram Internal Admin Alert Live Send Activation Lock`.

## Telegram Boundary

The Telegram send helper is server-only and remains blocked unless all of these are true:

- Admin dispatcher boundary passes for the admin dashboard purpose.
- Browser sends the explicit confirmation marker `approved_internal_admin_test`.
- `PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED` is `true`.
- Bot token, default chat ID, and chat allowlist are configured server-side.
- The default chat ID is present in the allowlist.

Safe response behavior:

- Token, chat ID, Telegram URL, provider response body, and raw provider error text must not be returned to the browser.
- Success may only report safe status flags and whether a provider message ID was present.
- Failure must remain safe no-op/blocked/rejected without leaking provider details.

## Customer Copy Boundary

Customer Copy currently keeps channels separated:

- Email is the only customer driver-details provider send path, and it is gated.
- WhatsApp and SMS buttons must remain disabled/setup-only checks unless separately approved.
- Telegram customer/driver buttons must remain manual clipboard-only unless separately approved.
- Customer In-App and Driver In-App are separate admin-selected in-app actions.
- No automatic fallback, automatic multi-channel blast, scheduler, retry loop, queue, or batch send is approved.

## Operator Rules

- Use Email only when the recipient is correct and the existing Email route is enabled.
- Treat WhatsApp/SMS as manual-copy or setup evidence until a separate activation packet is approved.
- Treat Telegram provider sending as internal-admin only. For customer driver details and driver job links, use only the Dispatch manual-copy controls, then choose the Telegram recipient yourself outside the app.
- Never print, screenshot, log, commit, or return provider tokens, chat IDs, cookies, API keys, secrets, or env values.
- If any provider test fails, close the relevant env gate first, then investigate from the disabled/no-op surface.

## Required Checks Before Future Telegram Send Evidence

- `node scripts/test-telegram-internal-admin-alert-live-send-guard.mjs`
- `node scripts/test-telegram-provider-no-send-approval-packet.mjs`
- `node scripts/test-customer-copy-multi-channel-no-live-guard.mjs`
- `node scripts/test-admin-customer-driver-details-email-send-action-api-contract.mjs`
- `git diff --check`
- `git status --short`

Future live evidence must record only safe status, route, approval, and result. It must not record token values, chat IDs, provider request bodies, provider response bodies, cookies, or raw errors.
