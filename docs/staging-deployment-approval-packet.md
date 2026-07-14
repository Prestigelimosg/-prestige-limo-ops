# Staging Deployment Approval Packet

This packet is for approval planning only. It does not deploy the app, change environment values, enable writes, enable providers, or activate any live feature.

## Checkpoints

- Latest repo commit before this configuration record: `ebab0042 Guard ledger checkpoints against Git state`.
- Latest implementation checkpoint in the ledger: `dffad548 Keep request review on Dashboard`.
- Source of truth: `docs/current-implementation-ledger.md`.

## Approval Fields

- Owner: William / Prestige Limo SG
- Approval date: 2026-07-14
- Approved scope: Change only the Vercel Production Branch from `staging` to `main`, then verify without pushing or deploying
- Decision: Approved production-branch safety separation; no deployment approval
- Live activation approval: Not approved
- Approved staging target: Future `staging` Preview deployment only after separate Preview environment drift review; no production deploy
- Rollback owner: William / Prestige Limo SG
- Notes: Keep all live DB/write, migrations, provider/env activation, external APIs, live sending, payment/PDF/payout, auth activation, live location, photo upload/storage, CRM/calendar amendment writes, and risky shim writes blocked.

## Current Verified Branch Separation

- Vercel Production Branch is `main`; `staging` is no longer the Production Branch.
- Changing Branch Tracking created no deployment and made no domain, alias, environment-variable, or Git change.
- `app.prestigelimo.sg` remains on READY deployment `f7e253b3 Repair mobile automation regression coverage` with the same `f7e253b3` page build marker.
- Live Automation remains OFF; booking intake remains ON; calendar auto-write, invoice auto-issue, Driver Details Email auto-send, and external send remain OFF.
- Production's names-only audit finds all 22 required environment names without reading values.
- Preview is missing 13 required admin persistence/auth, typed-read, live-location, and map-gate names. This is configuration drift only; it does not approve copying values, editing Preview env, opening gates, pushing, or deploying.
- Remote `main` is `adf37589`, six commits behind remote `staging` at `f7e253b3`; local `staging` is three commits ahead. No merge or push occurred.
- Previous READY deployment `f91d0d1e Style customer invoice sectors in black and gold` remains the identified manual rollback target; no rollback is in progress or approved by this record.
- The public Vercel project PATCH attempt returned HTTP 400 before mutation because `productionBranch` is not a supported top-level field. The signed-in Vercel Branch Tracking control was then used and independently verified; nothing is hidden as an API success.

## Required Checks Before Staging

- `node scripts/test-preactivation-verification-suite.mjs`
- `npm run lint`
- `npm run build`
- `npm run test:app-smoke-browser`
- `npm run test:booking-ui-browser`
- `git diff --check`
- `git status --short`

Do not proceed if any check fails or if the worktree is dirty.

## Staging Deploy Steps

1. Confirm the owner/date/scope fields above are filled.
2. Confirm the target is staging only, not production.
3. Confirm the rollback commit and previous deployment are known.
4. Do not push `staging` until the 13-name Preview environment drift is separately reviewed and the exact safe Preview behavior is approved.
5. Deploy the existing app build artifact or clean repo commit to staging Preview only after that approval.
6. Do not add live credentials, provider tokens, payment keys, auth activation, DB write flags, or migration commands.
7. Run the post-deploy smoke checklist below against the staging Preview URL.
8. Record sanitized evidence only. Do not paste secrets, tokens, env values, database rows, stack traces, or provider responses.

## Env Values That Must Remain Unset Or Disabled

- `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` must not be `true`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must not point to an approved write/live target.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must not expose a live customer/write surface.
- `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`, and `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN` must not be used to open live writes.
- `DRIVER_JOB_LINK_MODE`, `NEXT_PUBLIC_DRIVER_JOB_LINK_MODE`, and `PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED` must stay mock/disabled unless separately approved.
- `AI_PARSE_MODE` must stay mock.
- Customer auth/session flags must stay disabled.
- OneMap/map flags and tokens must stay disabled unless a separate staging-only map approval exists.
- Email, WhatsApp, SMS, Telegram, FlightAware, payment, PDF, payout, auth, live-location, and photo/provider env keys must remain unset or disabled.

## No-Live Gates To Verify After Deploy

- Production hardening readiness still returns blocked/manual approval required.
- Pre-activation verification suite still passes locally against the same commit.
- Setup-only APIs remain GET-only and disabled/no-op.
- Customer Copy Email/WhatsApp/SMS stays setup-only with `sendingEnabled false` and `external_send false`.
- Calendar lifecycle create/update/cancel remains blocked and requires admin approval later.
- Customer amendment/cancellation never auto-updates CRM, booking, or calendar.
- Shim cleanup guard still parks risky write paths.
- Public/customer/driver routes do not expose admin finance, payout, PayNow payout, parser/debug internals, internal admin notes, mock QA/dev archive, or provider/env details.

## Post-Deploy Smoke Checklist

- Open staging admin route and confirm core tabs load.
- Confirm Dispatch, Dashboard, Bookings, Drivers, Completed, and Rates surfaces render without horizontal overflow.
- Confirm Customer Copy channel buttons remain setup-only/disabled.
- Confirm Save Booking + CRM auto-syncs Google Calendar; manual ICS export controls are removed from normal admin operation.
- Confirm `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]` route boundaries do not leak admin/private fields.
- Run `npm run test:app-smoke-browser` and `npm run test:booking-ui-browser` against staging if an approved `APP_URL` is available.

## Rollback Checklist

- Identify the previous clean deployment and commit.
- Redeploy the previous artifact or previous commit if staging smoke fails.
- Keep all live gates false/unset during rollback.
- Remove any accidentally added staging secrets and rotate any exposed keys.
- Re-run `node scripts/test-preactivation-verification-suite.mjs`.
- Confirm `git status --short` is clean.
- Record sanitized failure and rollback evidence.

## Explicit Blocked List

The following remain blocked unless separately and explicitly approved: live DB/write, migrations, provider/env activation, external APIs, live sending, payment/PDF/payout, auth, live location, photo upload, CRM/calendar writes, risky shim writes, deployment to production, package changes, and env changes.
