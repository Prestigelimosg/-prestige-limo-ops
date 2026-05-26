# Telegram Driver Alert Workflow Plan

## 1. Purpose

This is a future Telegram driver/admin alert plan only. It is not an implementation.

Use this plan before building any Telegram Bot API, bot token handling, webhook, polling, notification sending, driver chat mapping, or production alert workflow. The goal is to make internal driver/admin alerts safe, simple, low-cost where practical, and clearly separated from customer-facing official notifications.

## 2. Current Hard Boundary

- No Telegram Bot API now.
- No bot token now.
- No Telegram webhook now.
- No `getUpdates` polling now.
- No real notification sending now.
- No Supabase schema/RLS change now.
- No app behavior change now.
- No parser change now.
- No WhatsApp/SMS/email sending now.
- No live location, flight API, payment, invoice, PDF, calendar, maps, or auth behavior now.

This document does not create a Telegram bot, send messages, store chat IDs, create API routes, add environment variables, update Supabase, or change driver/customer workflows.

## 3. Why Telegram First For Driver/Admin Alerts

Telegram is preferred for future internal driver/admin alerts because it is expected to be simpler and lower-cost than WhatsApp for driver operations.

Planned use:

- Driver/admin operational alerts first.
- Internal reminders and exception alerts first.
- Customer official notifications remain separate future work.
- Customer-facing communication may still use WhatsApp, SMS, or email later after separate approval.
- Telegram should not replace the secure driver job link.

Telegram should act as a light alert channel. The secure driver job link remains the controlled place for job details, acknowledgement, OTW, OTS, POB, Job Completed, and any future job-scoped workflow.

## 4. Future Alert Types

Future Telegram alert planning should cover:

- New driver job assignment.
- Driver acknowledge reminder.
- 1-hour before pickup reminder.
- OTW reminder if driver has not pressed OTW.
- OTS reminder.
- Arrival/MNG flight ETA update alert later.
- POB reminder if needed.
- Job Completed reminder if needed.
- Dispatcher replacement/cancel/reassign alert later.
- Admin alert when driver is late or missing a status update.
- Admin alert when a driver link is expired, revoked, or not acknowledged later.
- Dispatcher alert when manual fallback is needed.

Each alert type must be separately reviewed for message content, recipient, timing, and whether it is driver-facing or admin-only.

## 5. Driver Workflow Relationship

- Driver job link remains the source of job details.
- Telegram alerts should point drivers back to the secure job link later.
- Drivers should still use app buttons for Acknowledge, OTW, OTS, POB, and Job Completed.
- Telegram should not be the source of truth.
- Telegram should not be used to silently update job status.
- No Telegram scraping.
- No dependency on WhatsApp group scraping.
- No job status should be inferred from read receipts, chat replies, or group messages unless separately designed and approved later.

The safest future pattern is: Telegram sends a short alert, the driver opens the secure job link, and the app records the official action inside the app workflow.

## 6. Security And Token Handling

- Bot token must never be committed.
- Bot token must be stored in environment variables only.
- Separate local/staging/live bot tokens should be used later.
- No token in screenshots, docs, chat, or commits.
- Rotate token if exposed.
- Webhook secret or equivalent verification must be planned later.
- Only server-side code may use the bot token later.
- No bot token in frontend/client code.
- No Supabase `service_role` key in frontend.
- Bot permissions should be minimal.
- Production token use requires a rollback and disable plan.

Token handling should be reviewed before any real Telegram integration is built.

## 7. Telegram Recipient Mapping Plan

Telegram delivery needs a safe driver-to-Telegram chat ID mapping later.

Future mapping rules:

- Driver must opt in or start the bot later before direct alerts can work.
- Staff must verify driver identity before linking a Telegram chat ID.
- Staff/admin should control Telegram chat ID mapping.
- Store only necessary Telegram identifiers later.
- Do not expose all driver data to Telegram.
- Do not expose Telegram chat IDs on public/customer pages.
- Audit changes to driver Telegram mapping later.
- Support unlinking or rotating a driver's Telegram mapping later.
- Avoid sending production job alerts to unverified chat IDs.

No Telegram chat ID storage is added in this docs-only stage.

## 8. Alert Content Rules

Messages should stay short, operational, and privacy-aware.

Future driver alert content may include:

- Job reference.
- Pickup date/time.
- Pickup location summary.
- Job type.
- Secure job link later.
- A short action prompt, such as "Please acknowledge" or "Please press OTW".

Alert content rules:

- Do not include unnecessary customer private data.
- Do not include full customer database details.
- Do not include payout/pricing unless explicitly approved for driver view.
- Do not include internal staff notes.
- Do not include bank/payment details.
- Arrival/MNG alert can mention flight ETA later only when verified.
- No fake ETA.
- Do not send customer live location through Telegram unless separately approved.
- Keep links secure, job-scoped, and expiring later.

Admin alerts may include more operational context than driver alerts, but they still should avoid unnecessary customer private data.

## 9. Mock/Log-Only First Stage

The first implementation after this docs-only plan should be mock/log-only.

Mock/log-only stage plan:

- Show Telegram alert preview in the admin app.
- Clearly mark the preview as "Mock Only".
- Do not send any Telegram message.
- Do not call Telegram network APIs.
- Do not add a bot token.
- Do not create webhook or polling behavior.
- Staff can review message wording before real sending.
- Browser tests must confirm no Telegram network call.
- Tests should verify no bot token is present in client output.
- Tests should verify the secure driver job link remains the source of action.

This lets dispatchers and admin staff approve alert wording and timing without connecting any real notification provider.

## 10. Real Telegram Bot API Stage Later

Real Telegram Bot API work is later-only and requires explicit approval.

Future real API rules:

- Real API only after explicit approval.
- Use a server-side route only after approval.
- Use environment variables for bot token and webhook secret later.
- Start in staging/test mode.
- Limit alerts to an approved test driver/chat.
- Log every send attempt.
- Log send success, failure, retry, and manual fallback.
- Handle failed sends.
- Rate-limit retries.
- Provide manual fallback.
- Do not mark a job status as changed because an alert was sent.
- Do not send customer-facing notifications through this internal Telegram stage.

Production driver alert sending requires separate explicit approval after testing.

## 11. Driver Privacy And Consent

- Driver must know Telegram is used for job alerts.
- Driver should opt in before receiving alerts.
- Driver should be able to ask staff to update or remove the Telegram mapping later.
- Alert links must expire later.
- Do not expose customer data unnecessarily.
- Do not send live location to Telegram unless separately approved.
- Driver live location remains a secure job-scoped app workflow later.
- Telegram should not receive raw GPS coordinates unless a separate privacy, security, and approval plan exists.
- Do not use Telegram groups for sensitive job details unless separately reviewed.

Telegram should be used as a reminder and alert channel, not as a replacement for secure app permissions.

## 12. Supabase/RLS Considerations Later

Future Telegram work may need Supabase schema and RLS review before anything real is stored.

Review later:

- Telegram chat ID storage.
- Driver to Telegram mapping.
- Notification log table.
- Alert template table if templates become configurable.
- Staff/admin permissions for mapping changes.
- Driver/customer page boundaries.
- Audit log for mapping created, mapping changed, mapping removed, alert sent, alert failed, alert retried, and manual fallback used.
- RLS so customer pages cannot see Telegram mapping.
- RLS so public driver pages cannot browse driver Telegram identifiers.
- RLS so only authorized staff can manage mappings and logs.

No Supabase migration, schema change, RLS policy change, or real write behavior is added in this docs-only stage.

## 13. Testing Checklist

Required checks for this docs-only stage and future Telegram stages:

- [ ] `npm run test:parser`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test:app-smoke-browser`
- [ ] `npm run test:mobile-usability-browser`
- [ ] `npm run test:safe`
- [ ] No Telegram API calls in mock mode.
- [ ] No bot token in client bundle.
- [ ] No notification sends without staff action.
- [ ] No Supabase writes from public pages unless approved.
- [ ] Driver job link remains protected.
- [ ] Mobile/no-horizontal-overflow remains protected.
- [ ] Parser regression tests before and after notification work.
- [ ] Public driver token page does not expose Telegram admin mapping.
- [ ] Customer-facing pages do not expose Telegram driver/admin alert controls.
- [ ] Mock/log-only preview is clearly labelled before real sending is approved.

## 14. Failure And Fallback Plan

Future Telegram sending must assume failures happen.

Failure cases:

- Telegram message not delivered.
- Driver has not started the bot.
- Wrong chat ID.
- Bot blocked by driver.
- Network/API failure.
- Rate limit or retry failure.
- Driver did not see alert.
- Secure job link expired.
- Dispatcher selected the wrong recipient.

Fallback rules:

- Dispatcher uses manual call/WhatsApp fallback.
- App should not mark alert as delivered unless confirmed later.
- No automatic job status update from failed alert.
- No automatic job status update from sent alert alone.
- Failed alerts should be visible to staff later.
- Manual fallback should be audit logged later.

The business must still be able to operate manually if Telegram is unavailable.

## 15. Recommended Implementation Order

a. Docs-only Telegram driver alert workflow plan.  
b. Mock/log-only Telegram alert preview UI.  
c. Test-only protection that preview sends nothing.  
d. Docs-only Telegram token/webhook/security plan.  
e. Real Telegram test/staging integration only after explicit approval.  
f. Driver Telegram chat ID linking plan only after explicit approval.  
g. Limited real test alert to approved staff/test driver only.  
h. Production driver alert sending only after separate explicit approval.

Each step should be small, protected, and separately reviewed. Approval for mock/log-only preview does not approve real Telegram sending.

## 16. Approval Gates

Separate explicit approval is required for:

- Telegram bot creation/use in app.
- Bot token environment variables.
- Webhook/getUpdates setup.
- Real `sendMessage` calls.
- Telegram chat ID storage.
- Supabase schema/RLS changes.
- Notification logs.
- Production driver alerts.
- Customer notifications by any channel.
- WhatsApp/SMS/email customer sending.
- Driver live location notifications.
- Flight ETA alert integration.

Approval for one gate does not approve the others.

## 17. Final Readiness Checklist

### Ready to build Telegram mock/log-only preview when all are true

- [ ] Plan reviewed.
- [ ] Alert message wording reviewed.
- [ ] Staff-only surface chosen.
- [ ] No real API scope confirmed.
- [ ] No customer notification scope included.
- [ ] Parser tests passing.
- [ ] App tests passing.
- [ ] Explicit approval received.

If any item is not ready, stay docs-only and do not build Telegram behavior.
