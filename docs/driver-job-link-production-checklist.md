# Driver Job Link Production Checklist

This checklist protects the real secure driver job link rollout. The current app must remain in mock mode until every approval and guard below is complete.

## Approval Locks

- William must explicitly approve the Supabase migration before any `driver_job_links` table migration is created.
- Explicit migration approval from William must be recorded before migration work starts.
- William must explicitly approve `supabase db push` before any approved migration is applied.
- No `supabase db reset` is allowed. No supabase db reset is ever permitted for this project.
- Production driver job links must not be enabled by default.

## Required Production Readiness

Production mode must stay disabled until all of these are true:

- The `public.driver_job_links` table exists through an approved migration.
- A server-only Supabase client is configured safely for the API routes.
- API routes verify the secure random token server-side before returning or writing anything.
- Public driver routes return only the safe driver job payload.
- No Driver Database exposure from public driver routes or pages.
- No pricing/payout/CRM exposure from public driver routes or pages.
- Invalid/expired/revoked tokens are blocked. Invalid/expired/revoked tokens blocked is a required rollout gate.
- Completed tokens are blocked or made read-only according to the approved completion policy.
- Status updates can affect only the booking linked to the verified token.
- Public driver pages cannot list bookings or query unrelated bookings.
- Customer live location endpoints, when added later, verify token and job eligibility server-side.
- Mobile tests required for phone, tablet, and desktop widths pass before rollout.
- Parser tests pass before rollout.

## Required Checks Before Enabling Production Mode

Run and keep passing:

- `npm run test:parser`
- `npm run lint`
- `npm run build`
- `npm run test:driver-job-link`
- `npm run test:driver-job-link-contract`
- `npm run test:driver-job-link-api-routes`
- `npm run test:driver-job-page-browser`
- `npm run test:driver-job-link-mode`
- `npm run test:mobile-usability-browser`
- `npm run test:safe`

## Go/No-Go Rule

If any item above is incomplete, production driver job links remain disabled and API routes must return a safe `not_configured` response instead of falling through to mock, Driver Database, booking list, or insecure Supabase behavior.
