# App-Wide Human-Usage UI Standard

This document is a product and UI standard for Prestige Limo Ops. It is documentation only. It does not change app behavior, create records, create migrations, run Supabase commands, add APIs, generate invoices, generate statements, create invoice numbers, send notifications, or add calendar sync.

## Core Rule

No giant long-scroll card stacks for operational records.

Business-critical records must be easy for staff to search, scan, filter, sort, and open for detail. Staff should not need to scroll through a very long page of large repeated cards to find an urgent customer, booking, driver, payment, invoice, or follow-up item.

## Why This Matters For Prestige Limo Operations

Prestige Limo Ops is an internal operations app. Dispatchers and admin staff may need to find the right record quickly while handling live bookings, drivers, payments, customer requests, and follow-ups.

Long pages full of large cards create real operational risk:

- Staff may miss urgent jobs, overdue payments, or follow-ups.
- Mobile use becomes slow and tiring.
- Similar customer or booking records become harder to compare.
- Important actions may be separated too far from the record they affect.
- Future growth to 200+ customers, bookings, payments, or drivers would make the page difficult to use.

## App-Wide Scope

This standard applies across the app, including:

- CRM options and customer matching
- Customer lists and customer folders
- Bookings
- Upcoming jobs
- Completed jobs
- Dispatch work queues
- Driver lists and driver records
- Outstanding payments
- Invoices
- Statements
- Rates and overrides
- Future saved bookings
- Future new features

If a screen can show many records, it must follow the search-first operational pattern.

## Required Search-First Layout Pattern

Screens with many records should start with a search or quick finder near the top.

Required pattern:

- Search input first for customer, company, booker, passenger, reference, invoice, booking, driver, or payment text.
- Filter controls for status, type, date, customer, driver, payment state, or priority where useful.
- Sort controls for amount, date, customer, status, driver, priority, or last update where useful.
- Limited visible rows or pagination, usually 10 to 25 rows at a time for full list views.
- A clear "Showing X of Y" message where lists can grow.
- Clear empty and no-result states that do not remove data or call APIs.

## Mobile-Friendly Search And Suggestion Limit

All search-first lists, suggestion lists, dropdown suggestions, lookup results, CRM options, customer search results, booking search results, driver search results, payment review results, invoice and statement search results, dispatch search, and all future search/list UIs must be mobile-friendly.

Locked default:

- Show a maximum of 10 visible suggestions or results at a time by default.
- Do not show 50, 100, or 200 results in one long dropdown, card stack, or page section.
- After 10 results, use refine search, filters, pagination, View more, expandable details, or a detail drawer.

Mobile requirements:

- Must work well on iPhone, iPad, Android phones, Samsung Internet, Chrome Android, Safari iOS, tablets, and desktop.
- No horizontal scrolling.
- Touch targets must be easy to tap.
- Text must be readable.
- Search bars must be easy to reach.
- Results must be compact rows, not giant cards.
- Action feedback must appear near the clicked button or control.

## Compact Row Pattern

Repeated operational records should use compact rows, not large repeated cards.

Compact rows should show only the fields staff need for fast scanning, such as:

- Customer or company name
- Passenger, booker, driver, or contact where relevant
- Date and time
- Status or priority
- Amount or aging bucket where relevant
- Next action or follow-up state
- Small action buttons or menu controls

Rows may use responsive wrapping on mobile, but they must stay compact and readable.

## Expand/Detail Pattern

Do not show every detail for every record at once.

Use one of these patterns instead:

- Expandable row details
- Detail drawer
- Detail panel
- Link to a focused record page

Expanded details should stay close to the selected row or clearly tied to it. Detail areas should include only useful supporting information and should not duplicate the entire record list.

## Mobile And No-Horizontal-Overflow Rule

Every operational record layout must work on phone, tablet, and desktop.

Requirements:

- No document-level horizontal overflow.
- Touch controls must be large enough to tap reliably.
- Filters and sorting must wrap or stack cleanly on mobile.
- Compact rows must remain readable without sideways scrolling.
- Pagination or limited result controls must be reachable without long scrolling.

## Feedback Placement Rule

Action feedback must appear near the clicked control or affected row.

Examples:

- Save feedback appears near the save button.
- Mock row action feedback appears near that row.
- Filter feedback appears near the filter controls.
- Expand/detail feedback appears near the expanded detail.

Do not rely only on one global status area when staff need to understand which record was affected.

## Mock/Local Placeholder Rule

Mock/local placeholders must remain clearly separated from real actions.

Required wording or equivalent safety signal:

- Mock/local only
- Not saved
- No Supabase call
- No payment or bank API
- No invoice number
- No invoice, statement, or PDF generated
- No notification, WhatsApp, email, SMS, or calendar action
- No audit record unless a real audit feature has been approved

Mock/local controls should not look like completed production workflows. Important real actions must remain visually and behaviorally separate from mock previews and planning placeholders.

## Testing Expectations

For every screen changed under this standard, browser tests should protect the human-usage behavior and safety boundaries.

Expected tests where relevant:

- Search input appears before large result lists.
- Filters work.
- Sorting works.
- Visible rows are limited or paginated.
- "Showing X of Y" appears where lists can grow.
- Expandable row details or detail drawer works.
- Empty and no-result states are clear.
- Mobile checks confirm no horizontal overflow.
- Action feedback appears near the clicked control.
- Mock/local boundaries remain visible.
- Mock controls do not call Supabase, payment, bank, notification, calendar, invoice, statement, or PDF behavior.
- Existing parser tests remain unchanged unless parser behavior is intentionally touched.

## Future Implementation Order

Use this order for future protected work:

1. Commit this docs-only rule.
2. Review `/customers` remaining large sections.
3. Convert the customer folder/search area to a compact search-first layout.
4. Convert CRM sections to compact searchable rows.
5. Convert booking and job lists to compact searchable rows.
6. Convert driver, invoice, statement, rates, and future screens using the same pattern.
7. Add or update browser tests for every screen changed.

Each implementation stage should stay small, keep mock/local boundaries visible until real behavior is explicitly approved, and preserve the app safety rules around parser behavior, Supabase schema, payments, invoices, statements, PDFs, notifications, and calendar sync.
