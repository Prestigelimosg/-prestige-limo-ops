# Driver Job Link Workflow Plan

This is a documentation-only planning checkpoint. It does not approve app behavior changes, migrations, schema changes, Supabase commands, real notifications, real live location, real flight APIs, payment or bank APIs, invoices, statements, PDFs, or parser changes.

## 1. Driver Job Link Flow

The future driver job link should open to a clear, simple job card. The page should be easy to scan on a phone and should show only the information a driver needs for that one assigned job.

The driver-facing view should not become an internal dashboard. It should not expose customer account administration, unrelated bookings, internal staff tools, pricing, invoices, statements, PDFs, payment records, bank records, parser debug data, or Supabase table details.

## 2. Driver Acknowledgement

Planned flow:

1. Driver opens a secure job link.
2. Driver checks the job card.
3. Driver enters or updates driver details.
4. Driver presses Save / Acknowledge Job.
5. Save / Acknowledge Job means the driver accepted or acknowledged the job.

No real notification system is built in this docs-only stage. Acknowledgement planning does not send WhatsApp, email, SMS, push notifications, calendar events, or any other live alert.

## 3. Driver Detail Fields

The driver details section should stay simple and easy to read.

Planned fields:

- Driver name
- Contact number
- Vehicle number / car plate
- Vehicle model
- PayNow number
- Optional note

The PayNow number is planned as a driver detail field only. This document does not add payment, bank, payout, invoice, statement, or PDF behavior.

## 4. Future 1-Hour Reminder

Later, the app should be able to remind or alert the driver 1 hour before pickup. The driver should acknowledge the alert.

For arrival jobs, the reminder can initially be based on pickup time. Later, after separate approval, the reminder may be based on the latest flight ETA.

No real notification, WhatsApp, SMS, email, calendar, or flight API is added in this docs-only stage.

## 5. Driver Status Workflow

Planned driver statuses:

- Acknowledged
- OTW
- OTS
- POB
- JC / Job Completed

Workflow notes:

- Driver should activate live location later or press OTW.
- The OTW button may blink if the driver forgets to press it.
- OTS means the driver is on the spot and at the correct pickup location.
- For arrival jobs, OTS should include photo proof or upload later.
- POB means passenger on board.
- Live location should auto-disable 5 minutes after POB later.
- JC means the job is completed.

The current stage only documents this flow. It does not add real live location, real upload, real storage, or real status persistence.

## 6. Arrival Job Special Flow

Arrival jobs need a stricter future flow because flight timing and pickup proof matter.

Planned arrival flow:

1. App shows latest flight ETA later.
2. Driver acknowledges the ETA.
3. Driver presses OTW.
4. Driver presses OTS and uploads or takes photo proof later.
5. Driver presses POB.
6. Driver presses JC.

Latest flight ETA and OTS photo proof are planning items only here. This document does not add a flight API, camera API, file upload, storage, notification, or Supabase write.

## 7. Dispatcher Exception Workflow

For car breakdown, driver missed job, late driver, or replacement car cases, the dispatcher needs a staff-controlled exception workflow.

Planned dispatcher abilities:

- Cancel the driver assignment.
- Manually edit replacement car and driver details.
- Reassign a replacement driver later.
- Keep exception handling staff-controlled.

No automatic real dispatch changes are added in this docs-only stage.

## 8. Live Location Planning

Live location is required later, but it must not be built now.

Future live location requirements:

- Must be secure.
- Must be scoped to a single job.
- Must not expose unrelated booking, customer, driver, or internal staff data.
- Must have separate approval before any real geolocation, map, tracking, or customer live-link behavior is added.

Customer live location rules remain separate:

- Arrival/MNG should not expose customer live location.
- DEP/TRF/hourly can later use a customer live link only when secure and allowed.

## 9. Safety Boundaries

This planning stage explicitly does not add:

- Real notifications
- WhatsApp, email, or SMS sending
- Real live location
- Real flight API integration
- Supabase schema changes
- Supabase migrations
- Supabase commands
- Payment or bank API behavior
- Invoice, PDF, or statement behavior
- Parser changes
- Real authentication changes
- New app behavior

## 10. Future Staged Implementation Order

Recommended implementation order:

1. Docs-only plan.
2. Mock/local driver job link UI improvements.
3. Add PayNow field to driver details UI mock/local.
4. Mock/local acknowledge/save driver details.
5. Mock/local OTW/OTS/POB/JC status UI.
6. Mock/local OTS photo placeholder.
7. Mock/local dispatcher exception/replacement UI.
8. Real secure job-scoped API only after approval.
9. Real notification, live location, and flight API only after separate approval.

Each stage should keep its own safety boundary and test coverage. Real Supabase writes, real notifications, real location, real flight API, and real storage should stay blocked until explicitly approved.

## 11. Testing Plan

Future protection should include tests that confirm:

- Driver job link shows a simple job card.
- Driver details include PayNow number.
- Save / Acknowledge Job is mock/local until real API approval.
- OTW, OTS, POB, and JC buttons are shown in the correct flow.
- POB explains live location would end later, but no real live location is added now.
- OTS photo proof placeholder is mock/local only.
- Dispatcher cancel/replacement flow is staff-only.
- No Supabase writes happen unless later approved.
- No WhatsApp, email, SMS, calendar, live-location, or flight API calls happen.
- Mobile/no-horizontal-overflow checks pass.
- Driver page remains simple and easy to read.
