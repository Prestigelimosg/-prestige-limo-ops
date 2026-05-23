# Driver Job Link Production Design

This is a planning document only. It does not approve a migration, does not enable production driver links, and does not add real notification, upload, flight, live location, storage, GPS, map, or public Supabase behavior.

## 1. Purpose

Production driver links are intended to give an assigned driver a narrow, tokenized, mobile-friendly view of one job and the minimum workflow actions needed to complete that job. A valid link should let the driver acknowledge the job, update operational status, and later submit approved production proof or location events only after those features have their own schema, RLS, API, and rollout approvals.

The production link is not a dashboard. It must not expose booking administration, Driver Database data, pricing, payout, CRM history, internal notes, booker email, unrelated bookings, or any internal Supabase table shape.

## 2. Current Protected Mock State

The current protected driver workflow is mock-only:

1. Acknowledge Job
2. Arrival/MNG latest ETA acknowledgement
3. OTW
4. OTS
5. Arrival/MNG OTS photo proof
6. POB
7. Job Completed

DEP, TRF, and DSP mock jobs do not require latest ETA acknowledgement or OTS photo proof. Arrival/MNG mock jobs require latest ETA acknowledgement before OTW and mock OTS photo proof before POB.

Mock live location is local/page state only. It requires job acknowledgement, captures no phone location, calls no geolocation API, and auto-ends at POB. Reactivation after POB or Job Completed is blocked.

Mock 1-hour reminders, dispatcher reminder summaries, dispatcher workflow summaries, OTS proof, ETA acknowledgement, and activity logs are local/mock only. They do not send messages, call flight APIs, write Supabase, upload files, use storage, use camera APIs, create customer live location links, or read/write Driver Database data.

## 3. Production Safety Boundary

Production driver links must never:

- expose Driver Database records or reusable driver profile data
- expose pricing, customer price, driver payout, payout rules, CRM data, company private data, booker email, or internal-only notes
- expose unrelated bookings or allow booking list/search behavior
- expose internal dashboard data, tabs, saved bookings, completed bookings, rates, or driver management surfaces
- create fake customer live location links
- let the browser read or write Supabase tables directly
- trust public client state for token validity, booking ownership, workflow order, proof state, ETA acknowledgement, or completion state
- fall back from production mode into mock data if production configuration is incomplete

Public driver routes should only return safe, projected data after server-side token verification. Invalid, expired, revoked, missing, or not-configured links must return safe, minimal error responses.

## 4. Proposed Supabase Tables, Planning Only

No migration is approved by this document. These are planning targets for a later schema/RLS proposal.

### `driver_job_links`

Purpose: Stores server-side token metadata linking one opaque driver URL token to exactly one booking.

Likely columns:

- `id` UUID primary key
- `booking_id` foreign key to bookings
- `token_hash` unique text, generated from the raw token server-side
- `created_by` internal user/dispatcher id
- `created_at`
- `expires_at`
- `revoked_at`
- `revoked_by`
- `last_accessed_at`
- `completed_read_policy`, if a per-link policy is approved

Sensitive columns:

- `token_hash`
- `booking_id`
- `created_by`
- `revoked_by`
- access timestamps

Public-safe columns:

- none directly. The browser should never receive this table row.

RLS expectations:

- no anonymous direct select/insert/update/delete
- internal dispatcher/admin roles may create/revoke through approved server paths only
- token verification should happen in server code using a server-only Supabase client or approved RPC path
- public clients must receive only the safe projected driver job payload, never the link row

### `driver_job_status_events` or `driver_job_activity_events`

Purpose: Immutable audit log for driver-facing workflow events such as acknowledgement, ETA acknowledgement, OTW, OTS, POB, completion, blocked attempts, reminder records, and dispatcher-visible workflow events.

Likely columns:

- `id` UUID primary key
- `booking_id`
- `driver_job_link_id`
- `event_type`
- `event_label`
- `event_detail`
- `previous_status`
- `next_status`
- `created_at`
- `created_by_type` such as `driver_link`, `dispatcher`, or `system`
- `request_id` or idempotency key, if approved
- minimal request metadata such as user agent or IP hash, if approved

Sensitive columns:

- internal ids
- request metadata
- raw event detail if it can contain operational notes

Public-safe columns:

- only a deliberately projected, driver-safe activity timeline if product-approved
- no internal ids, request metadata, pricing, payout, CRM, booker data, or unrelated activity

RLS expectations:

- no anonymous direct writes
- server API writes audit events after verifying the token and booking link
- internal dashboard reads require authenticated internal access
- public token route can return a safe projected timeline only through server-side projection

### Optional `driver_job_proof_events`

Purpose: Future proof/photo metadata for production OTS proof after a separate proof/upload design is approved.

Likely columns:

- `id` UUID primary key
- `booking_id`
- `driver_job_link_id`
- `proof_type`
- `status`
- `created_at`
- `created_by_type`
- future storage object reference or checksum, only after storage design approval

Sensitive columns:

- storage object references
- metadata that could reveal location, device, or internal notes
- raw upload status/error details

Public-safe columns:

- proof received state such as `required`, `submitted`, or `accepted`, if approved

RLS expectations:

- no anonymous direct table writes
- no storage bucket access from the public browser until a dedicated storage policy is approved
- metadata writes only through a server API after token verification

### Optional `driver_job_location_sessions`

Purpose: Future live-location session coordination only, after a separate live-location privacy and API design is approved.

Likely columns:

- `id` UUID primary key
- `booking_id`
- `driver_job_link_id`
- `session_state`
- `started_at`
- `ended_at`
- `ended_reason`
- future provider/session reference, if approved

Sensitive columns:

- provider/session references
- location-related metadata
- device or network metadata

Public-safe columns:

- high-level state such as `inactive`, `active`, or `ended`, if approved

RLS expectations:

- no anonymous direct access
- no browser geolocation calls until a separate approval stage
- location session start/end must be mediated by server APIs
- customer live location links require separate token verification and eligibility rules

## 5. Token Design

Production links should use random opaque tokens with no sequential ids in the public URL. The raw token should be generated with high entropy, shown only once, and sent only by an authorized dispatcher through an approved channel. The database should store only a hash of the token.

Token requirements:

- raw token is never stored in plaintext
- hash is computed server-side before lookup
- `token_hash` is unique
- link points to exactly one booking
- expiry is required
- revoke is supported
- invalid, expired, revoked, and not-configured responses use safe generic copy
- production mode must not fall through to mock behavior

Completed/read-only policy must be approved before implementation. The safest default is: after Job Completed, the link becomes read-only or blocked for status mutation, while still allowing a limited final confirmation view only if the business needs it. Reactivation after POB or Job Completed must require explicit dispatcher-side reset through an authenticated internal path.

## 6. Public Payload Projection

The public driver page may receive only the fields required for a driver to perform the job.

Safe examples:

- public job reference
- pickup date and time
- pickup location, dropoff location, and driver-needed waypoints
- route display
- booking type and driver-facing job type label
- flight number and approved ETA field if relevant
- vehicle type needed for the job
- passenger/customer display name only when operationally needed
- current driver workflow status
- assigned driver snapshot already intended for this driver-facing view
- driver-safe activity/proof/reminder state if approved

Unsafe examples:

- booker email
- booker private CRM data
- private company/account data beyond what the driver needs
- customer price
- driver payout
- pricing source, rates, overrides, or profit
- internal notes not meant for the driver
- unrelated bookings
- Driver Database records or reusable driver profile data
- internal dashboard tabs or admin state
- raw Supabase ids unless explicitly approved as public-safe

The public payload must be assembled server-side from an allowlist. It must not serialize full booking rows and then rely on the client to ignore sensitive fields.

## 7. Server API Design

Future production API routes should be server-only Supabase access paths. Public clients should never write directly to Supabase.

Conceptual routes:

- `GET /api/driver-job/[token]`: validates token and returns the safe projected payload
- `PATCH /api/driver-job/[token]/status`: validates token, enforces workflow order, updates only the linked booking, writes an audit event, returns safe projected payload
- `POST /api/driver-job/[token]/acknowledgement`: validates token, records acknowledgement, writes an audit event
- `POST /api/driver-job/[token]/proof`: future proof metadata only after proof/storage approval
- `POST /api/driver-job/[token]/location-session`: future live-location session only after live-location approval

Required API rules:

- server validates token on every request
- server checks expiry/revocation on every request
- server verifies the token maps to exactly one booking
- server enforces all workflow transitions
- server writes immutable audit events for accepted mutations and approved blocked attempts
- server returns only safe projection
- server never reads Driver Database for public pages
- server never returns booking lists or unrelated bookings
- public client never receives Supabase credentials beyond normal public app config and never queries public tables directly for driver workflow

## 8. Status Workflow Enforcement

Production must enforce workflow order server-side. The browser can give immediate feedback, but server checks are authoritative.

Required production enforcement:

- Acknowledge Job is required before OTW
- Arrival/MNG latest ETA acknowledgement is required before OTW
- OTW is required before OTS
- OTS is required before POB
- Arrival/MNG OTS proof is required before POB
- POB is required before Job Completed
- DEP/TRF/DSP do not require latest ETA acknowledgement or OTS proof unless a future business rule explicitly changes that
- live location session state ends at POB, once live-location exists
- reactivation after POB or Job Completed is blocked unless a dispatcher explicitly resets the job server-side
- completed jobs cannot be mutated through public links unless a completed-link policy explicitly allows a narrow action

Blocked attempts should return safe feedback and may write a safe audit event if approved. They must not update booking status.

## 9. RLS and Security Questions Before Migration

Unanswered decisions before any migration:

- Which internal roles can create driver links?
- Which internal roles can revoke links?
- How does app auth identify dispatcher/admin users?
- Is a server-side service role used only inside API routes, or is an RPC/security-definer pattern preferred?
- If service role is used, how is it kept out of the browser bundle and logs?
- Does the anonymous public token route bypass RLS through server-only lookup, or use a restricted RPC?
- What exact public-safe projection is approved field by field?
- Should `booking_id` ever be exposed to the public client?
- What is the approved token expiry period?
- What is the completed job link access policy: blocked, read-only, or limited final view?
- How long are driver link audit events retained?
- What request metadata may be retained without creating privacy risk?
- What rate limiting or abuse protection is required for token routes?
- Should invalid token responses be indistinguishable from revoked/expired responses, or keep distinct HTTP codes with generic UI copy?
- What internal process rotates or invalidates tokens after driver reassignment?
- Should driver reassignment revoke old links automatically?
- How are duplicate/retry status submissions made idempotent?
- Who can reset workflow state after POB or completion?
- What production monitoring is required before enablement?

## 10. Testing Plan Before Implementation

Tests required before enabling production links:

- production disabled guard remains
- production links stay disabled unless env/config and server readiness gates are explicitly enabled
- invalid token returns a safe error
- expired token returns a safe error
- revoked token returns a safe error
- valid token returns only safe projected payload
- no pricing, payout, CRM, booker email, Driver Database, unrelated booking, or internal dashboard exposure
- status transition is enforced server-side
- acknowledgement is enforced server-side before OTW
- Arrival/MNG ETA acknowledgement is enforced server-side before OTW
- Arrival/MNG OTS proof is enforced server-side before POB
- DEP/TRF/DSP exemption is enforced
- only the linked booking can be updated
- audit event is written for accepted mutations
- approved blocked attempts are audited without status mutation
- production mode never falls back to mock data
- no `navigator.geolocation` until a live-location stage is approved
- no upload, camera, storage, or object URL plumbing until a proof/upload stage is approved
- no notification, WhatsApp, SMS, or flight API calls until their separate stages are approved
- production-disabled browser page still hides mock workflow controls
- mobile usability passes for phone, tablet, and desktop widths
- parser, Driver Dispatch copy, Customer Copy, and Job Card copy regression tests keep passing

## 11. Rollout Plan

Recommended rollout stages:

1. Design doc
2. Supabase schema/RLS proposal only
3. Migration only after explicit approval
4. Server adapter implementation behind production-disabled guard
5. API and browser tests for disabled, invalid, expired, revoked, and valid-token paths
6. Limited internal test with non-sensitive fixture data
7. Production enablement only after explicit approval

No `supabase db reset` is allowed at any stage. `supabase db push` requires explicit approval after an approved migration exists.

## 12. Final Recommendation

The next coding task after this document should be a Supabase schema/RLS proposal only, still with no migration. That proposal should define table columns, indexes, RLS policies, server-only access shape, safe projection rules, and test expectations in enough detail that a later migration can be reviewed safely before it is created.
