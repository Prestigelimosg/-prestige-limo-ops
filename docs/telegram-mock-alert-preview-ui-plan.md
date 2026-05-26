# Telegram Mock Alert Preview UI Plan

## 1. Purpose

This is a future mock/log-only Telegram alert preview UI plan only. It is not an implementation.

Use this plan before building any Telegram preview UI, Telegram Bot API integration, driver alert API, notification sending, Supabase storage, auth, payment, invoice, live-location, flight, maps, calendar, or file-upload behavior. The goal is to let staff safely review Telegram-style driver/admin alert wording later without sending anything.

## 2. Current Hard Boundary

- No Telegram UI now.
- No mock/log-only Telegram preview UI now.
- No Telegram Bot API now.
- No bot token now.
- No Telegram webhook now.
- No `getUpdates` polling now.
- No `sendMessage` call now.
- No real notification sending now.
- No Supabase schema/RLS change now.
- No app behavior change now.
- No parser change now.
- No WhatsApp/SMS/email sending now.
- No Stripe/payment/API/invoice/PDF/auth/live-location/flight/maps/calendar/file-upload behavior now.

This document does not add routes, components, environment variables, bot setup, storage, notification logs, or customer/driver workflow behavior.

## 3. Relationship To Existing Telegram Plan

Telegram is planned as the preferred future internal driver/admin alert channel because it is expected to be simpler and lower-cost than WhatsApp for internal driver operations.

Customer WhatsApp, SMS, and email notifications remain separate future work. Telegram should not replace the secure driver job link, and Telegram alerts should point drivers or admins back to the app or secure job link later.

Current Stage 4A-90 browser smoke tests protect that no Telegram API, bot token, webhook, `getUpdates`, `sendMessage`, network request, or active Telegram control exists. Those tests must stay in place before and after any preview work.

## 4. Mock/Log-Only Preview UI Goal

Future UI should:

- Live only on an internal staff/admin surface.
- Be clearly marked "Telegram Alert Preview — Mock Only".
- Show preview text for driver/admin alert messages.
- Never send messages.
- Never call Telegram.
- Never store bot tokens.
- Never create webhooks.
- Never poll `getUpdates`.
- Never call `sendMessage`.
- Never update real job status.
- Never update Supabase.
- Never notify customers.

The preview is for wording review only. It is not delivery, acknowledgement, dispatch, or notification behavior.

## 5. Staff/Admin-Only Placement Plan

The preview should be placed only in an internal admin/staff area. A compact placement near driver assignment, dispatch, or driver status context is preferred if implemented later.

Do not expose preview controls on:

- Public driver token page.
- `/book`.
- `/my-bookings`.
- Customer-facing copy.

Keep the section compact and operational. Avoid adding another long page or large card stack that makes dispatch work harder to scan.

## 6. Preview Alert Types To Plan

Future mock preview templates should cover:

- New driver job assignment.
- Driver acknowledgement reminder.
- 1-hour before pickup reminder.
- OTW reminder if driver has not pressed OTW.
- OTS reminder.
- Arrival/MNG flight ETA update alert later.
- POB reminder if needed.
- Job Completed reminder if needed.
- Dispatcher replacement/cancel/reassign alert later.
- Admin alert when driver is late or missing a status update.

Each preview should be clearly fake/mock until real Telegram sending is separately approved.

## 7. Preview Content Rules

Preview messages should:

- Be short and operational.
- Include job reference.
- Include pickup date/time.
- Include pickup location summary.
- Include job type.
- Include a secure job link placeholder later.
- Avoid unnecessary customer private data.
- Avoid payout/pricing unless explicitly approved for driver view.
- Avoid full customer database details.
- Never include bot token or secrets.
- For Arrival/MNG, mention flight ETA only when verified later.
- Never show fake ETA as real.

Example wording style for later:

```text
Telegram Alert Preview — Mock Only
Job REF-123: Arrival pickup at 14:30, Changi Airport T3.
Open secure job link: [job link placeholder]
Mock/local only. No Telegram message sent.
```

## 8. Mock/Local Data Rules

- Preview can use mock/local sample job data only.
- Preview must not write to Supabase.
- Preview must not update booking data.
- Preview must not update driver assignment data.
- Preview must not update dispatch data.
- Preview must not update job status.
- Preview must not persist alert content unless separately approved later.
- Preview must not create notification logs yet.
- Preview must not create audit records yet.
- Preview must not store Telegram chat IDs yet.

If real booking data is ever used later, that requires separate approval, Supabase/RLS review, and tests.

## 9. Local Feedback Rules

Any future preview button should show local-only feedback near the clicked control.

Feedback wording should say:

```text
Mock only — no Telegram message sent.
```

Feedback must not imply delivery. It must not mark the job as notified. It must not mark the driver as acknowledged, OTW, OTS, POB, or completed.

## 10. No-Send Safety Wording

Visible wording near the future preview must say:

```text
Mock/local only. Does not send Telegram, WhatsApp, SMS, or email. Does not update booking, driver status, Supabase, notification logs, or customer/driver records.
```

This wording should stay close to any preview or mock action control.

## 11. Security And Secret Handling

- No bot token in UI.
- No bot token in client bundle.
- No bot token in `localStorage`, `sessionStorage`, IndexedDB, or cookies.
- No token in screenshots, docs, chat, tests, or commits.
- Bot token must be environment variable only later.
- Bot token must be server-side only later.
- Webhook secret or verification plan is required later.
- No `service_role` key in frontend.

Any token exposure must be treated as a security incident and rotated before continuing.

## 12. Future Telegram Recipient Mapping Dependency

Mock preview should not require Telegram chat IDs.

Real sending later requires safe driver-to-Telegram chat ID mapping:

- Driver must opt in or start the bot later.
- Staff must verify driver identity before linking a chat ID.
- Mapping requires Supabase schema/RLS review later.
- Staff/admin should control mapping.
- Driver/customer pages must not expose Telegram mapping.
- Only necessary Telegram identifiers should be stored later.

No Telegram mapping storage is added now.

## 13. Testing Plan For Future Mock Preview

When UI is built later, add tests proving:

- Preview appears only on an internal staff/admin surface.
- Preview is clearly marked Mock Only.
- Clicking preview/send-test controls sends nothing.
- No `api.telegram.org`, `telegram.org`, `t.me`, `/telegram`, `/api/telegram`, `/api/notifications/telegram`, or `/api/driver-alerts/telegram` request occurs.
- No fetch/XHR/sendBeacon/WebSocket Telegram call occurs.
- No bot-token-looking string appears in visible text, scripts, resources, storage, or client-observable state.
- No Telegram controls appear on public driver token page.
- No Telegram controls appear on `/book`.
- No Telegram controls appear on `/my-bookings`.
- No real notification provider call occurs.
- No Supabase writes occur.
- Save/Acknowledge, OTW/OTS/POB/Job Completed remain protected.
- PayNow field remains present.
- Replacement placeholder leak/persistence protections remain covered.
- Mobile/no-horizontal-overflow remains protected.

Required checks should include:

- `npm run test:parser`
- `npm run lint`
- `npm run build`
- `npm run test:app-smoke-browser`
- `npm run test:mobile-usability-browser`
- `npm run test:safe`

## 14. Existing Protections That Must Remain

- Stage 4A-90 Telegram boundary smoke tests.
- No real Telegram Bot API.
- No bot token exposure.
- No webhook behavior.
- No `getUpdates` polling.
- No `sendMessage` behavior.
- No real notification sending.
- No public/customer Telegram controls.
- Driver job link remains protected.
- Replacement mock values do not leak or persist.
- Parser tests remain mandatory.
- No Supabase commands.

These protections should be checked before and after any future preview UI stage.

## 15. Failure And Fallback Planning

Preview text may be wrong, incomplete, too long, or unclear. Staff must review wording before any real send later.

Real Telegram failures later must not update job status automatically. Dispatcher manual call or WhatsApp fallback remains available later. Real delivery confirmation requires a separate future plan.

There is no delivery status now, and the mock preview must not pretend a message was delivered.

## 16. Future Staged Implementation Order

a. Docs-only mock/log-only preview UI plan.  
b. Test-only protection that no Telegram preview UI exists yet if desired.  
c. Mock/log-only preview UI on internal admin surface only.  
d. Browser tests proving preview sends nothing.  
e. Docs-only Telegram token/webhook/security plan.  
f. Driver Telegram chat ID linking plan only after approval.  
g. Real Telegram staging/test send only after explicit approval.  
h. Production driver alert sending only after separate explicit approval.

Each stage should be reviewed and committed separately.

## 17. Approval Gates

Separate explicit approval is required for:

- Building the mock/log-only preview UI.
- Any Telegram bot creation/use.
- Any bot token environment variable.
- Any webhook/getUpdates setup.
- Any real `sendMessage` call.
- Any Telegram chat ID storage.
- Any Supabase schema/RLS change.
- Any notification log table.
- Any production driver alert sending.
- Any customer notification by any channel.

Approval for this docs-only plan does not approve UI or real integration work.

## 18. Final Readiness Checklist

### Ready to build Telegram mock/log-only preview UI only when all are true

- [ ] Plan reviewed.
- [ ] Staff-only surface chosen.
- [ ] Preview wording reviewed.
- [ ] No real API scope confirmed.
- [ ] No bot token scope confirmed.
- [ ] No customer notification scope included.
- [ ] No Supabase write scope included.
- [ ] Stage 4A-90 Telegram boundary tests passing.
- [ ] Parser tests passing.
- [ ] App smoke tests passing.
- [ ] Mobile/no-horizontal-overflow passing.
- [ ] Explicit approval received.

If any item is not ready, stay docs-only and do not build Telegram UI.
