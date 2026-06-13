# Prestige Limo Ops — Current Implementation Ledger

Latest known clean checkpoint:
4e98376 Add disabled customer driver details email send API

Purpose:
This file is the repo source of truth for Codex and future work. Inspect this file before adding new UI, API, helper, test, or docs.

## Next GPT Lock / Uncompleted Backlog

- Latest repo commit to preserve as handoff baseline: `ec276b6 Update ledger for disabled customer driver details email send API`.
- Latest implementation checkpoint to preserve: `4e98376 Add disabled customer driver details email send API`.
- Completed foundations/APIs not to repeat: Flight ETA setup-only chain, email setup-only chain, customer driver details email preview/readiness API, disabled customer driver details email send API, ledger guards.
- Uncompleted backlog: provider/live sending later; Telegram/WhatsApp; FlightAware live; live location; OTS photo; auth; billing/payment; shim cleanup; production.
- Rules: no duplicate work, no new shims, no unnecessary UI/giant cards, no live risky features without approval.

## Locked Workflow Rules

- Inspect first.
- Do not duplicate UI/API/helpers/tests/docs.
- Do not add → remove → replace loop.
- Reuse existing setup-only foundations.
- Terminal 2 checks before Codex whenever possible.
- No live DB, migrations, payment, PDF, payout, auth activation, live sending, external APIs, live location, or photo upload unless explicitly approved.

## Implemented

### Admin / booking
- Admin booking dashboard foundation.
- Saved booking create/read/list/status/delete foundations.
- Driver assignment typed API foundation.
- Calendar download/sync foundations.
- Admin booking workflow statuses.
- Admin driver job statuses.
- Job lifecycle monitor helper and typed read-only API.
- Job lifecycle monitor missing-checkpoint contract coverage.
- Implementation ledger alignment guard.
- Implementation ledger not-live guard.

### Customer
- `/book` customer booking request foundation.
- Passenger memory suggestions.
- Safe autofill for pickup/drop-off/service/vehicle only.
- `/my-bookings` fail-closed customer portal.
- Customer portal actions simplified: PDF | Edit | Cancel.
- Customer saved booking session/cookie/auth boundary foundations.

### Driver
- `/driver-job/[token]` single-job driver flow.
- Save & Acknowledge Job.
- OTW / OTS / POB / Completed.
- Status History.
- Driver notifications GET/PATCH foundation.
- Driver issue alert foundation.

### Billing / invoice
- Completed booking billing readiness audit.
- Monthly billing grouping.
- Monthly invoice draft plans.
- Monthly invoice draft trip candidates.
- Monthly invoice issue records.
- DSP actual-time evidence connected.
- Billable price review foundations.

### Rates / pricing
- `resolvePricing` uses customer_rates and driver_payout_rules.
- Rates/payout save paths exist.
- Some rate/pricing save paths still use legacy shim and are parked due pricing/payout risk.

### Legacy shim retired
- bookers
- saved_addresses
- driver deactivation

### Notifications
- Admin app notifications API.
- Customer app notifications API.
- Customer-driver app notifications API.
- Driver job notifications API.
- Telegram disabled adapter foundation.
- WhatsApp disabled adapter foundation.
- Disabled email send adapter setup foundation.
- Email notification setup foundation.
- Email sender selection setup foundation.
- Email recipient safety setup foundation.
- Email send policy setup foundation.
- Customer driver details email setup foundation.
- Customer driver details email readiness setup foundation.
- Customer driver details email preview/readiness setup API.
- Disabled customer driver details email send setup API.
- No real sending active.

### Live location
- Live location setup foundation.
- `/api/admin-live-location-setup`.
- Setup-only. No real GPS/map/tracking.

### OTS photo proof
- OTS photo proof setup foundation.
- `/api/admin-ots-photo-proof-setup`.
- Setup-only. No camera/upload/storage.

### Flight ETA / MNG Arrival
- Flight API setup foundation.
- `/api/admin-flight-api-setup`.
- `/api/driver-job/[token]/flight-eta-setup`.
- Driver flight ETA notification setup foundation.
- `/api/admin-driver-flight-eta-notification-setup`.
- Driver ETA acknowledgement setup foundation.
- `/api/driver-job/[token]/flight-eta-acknowledgement-setup`.
- Resend/escalation rule recorded: after 2 no-ack attempts, escalate admin to get replacement driver.
- Admin ETA escalation setup foundation.
- `/api/admin-driver-flight-eta-escalation-setup`.
- ETA reminder timing setup foundation.
- `/api/admin-driver-flight-eta-reminder-timing-setup`.
- ETA notification payload setup helper.
- `/api/admin-driver-flight-eta-notification-payload-setup`.
- Flight provider selection setup foundation.
- `/api/admin-flight-provider-selection-setup`.
- Future flight provider recorded: FlightAware AeroAPI, setup-only/disabled.
- Driver flight ETA live readiness setup foundation.
- Flight ETA result normalization setup foundation.
- Flight ETA comparison/update setup foundation.

## Not Live / Not Implemented

- Real flight provider activation.
- External flight API call.
- Provider token/env.
- Live ETA lookup.
- Real driver ETA notification sending.
- Real resend automation.
- Real admin escalation alert.
- Real Telegram/WhatsApp/email/SMS/push sending.
- Real GPS/live map.
- Real OTS photo upload/storage.
- Customer/driver auth activation.
- Invoice PDF generation.
- Payment links.
- Invoice sending.
- Payout automation.
- Production deployment activation.
- Remaining risky shim cleanup for companies/travelers/rate_settings/full drivers.

## Current Flight ETA Rule

- MNG / Arrival only.
- Admin + driver only.
- Customer disabled by default.
- Future purpose: notify driver latest ETA 1 hour before pickup so driver does not miss arrival flight.
- If driver does not acknowledge, resend later.
- After 2 no-ack attempts, alert admin to get replacement driver.
- Current state is setup-only; no live sending or external API.
