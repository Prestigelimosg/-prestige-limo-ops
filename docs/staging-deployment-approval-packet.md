# Staging Deployment Approval Packet

This packet records the approved deployment-safety configuration work. It does not deploy the app, enable writes, enable providers, or activate any live feature. The Preview isolation change and its bounded Production recovery are recorded below without exposing values.

## Checkpoints

- Latest repo commit before this configuration record: `88ea2ce5 Record Production credential recovery checkpoint`.
- Latest implementation checkpoint in the ledger: `dffad548 Keep request review on Dashboard`.
- Source of truth: `docs/current-implementation-ledger.md`.

## Approval Fields

- Owner: William / Prestige Limo SG
- Approval date: 2026-07-14
- Approved scope: Change the Vercel Production Branch from `staging` to `main`, then isolate future Preview environment assignments from Production without pushing or deploying
- Decision: Approved production-branch safety separation and Preview isolation only; no deployment approval
- Live activation approval: Not approved
- Approved staging target: Future `staging` Preview deployment only after separate Preview environment drift review; no production deploy
- Preview isolation approval: Approved on 2026-07-14 for Preview environment targeting only; no provider-key rotation, Production deployment, database write, or external send was approved
- Production recovery approval: Approved on 2026-07-14 for exact existing credential recovery and safe prior-state verification only; no credential creation/rotation, write-gate activation, deployment, push, or external send was approved
- Resend replacement-key approval: Owner gave separate action-time approval on 2026-07-14 to create one sending-access key and save it to Vercel Production only; deletion of the existing key, Preview assignment, deployment, push, send-gate activation, and external send remained unapproved
- Rollback owner: William / Prestige Limo SG
- Notes: Keep all live DB/write, migrations, provider/env activation, external APIs, live sending, payment/PDF/payout, auth activation, live location, photo upload/storage, CRM/calendar amendment writes, and risky shim writes blocked.

## Current Verified Branch Separation

- Vercel Production Branch is `main`; `staging` is no longer the Production Branch.
- Changing Branch Tracking created no deployment and made no domain, alias, environment-variable, or Git change.
- `app.prestigelimo.sg` remains on READY deployment `f7e253b3 Repair mobile automation regression coverage` with the same `f7e253b3` page build marker.
- Live Automation remains OFF; booking intake remains ON; calendar auto-write, invoice auto-issue, Driver Details Email auto-send, and external send remain OFF.
- Owner approved Preview isolation only. The Vercel CLI was instructed to remove 17 shared names from Preview, but it deleted the multi-target records from both Preview and Production despite the documented environment-specific command. This failure is recorded openly; no deployment was created, so the running Production artifact retained its frozen environment.
- Final bounded recovery established 16 Production assignments without printing values: the prior 15 exact assignments plus one newly approved Resend sending-access key stored as `RESEND_API_KEY`. The new key is named `prestige-limo-ops-production-recovery-20260714`, is restricted to the verified `prestigelimo.sg` domain, and showed no activity after creation. The existing Resend key remains intact. None was added to Preview.
- Production's names-only audit now passes with all 22 required names and no missing names. Preview still finds 0 of 22 required names; its only remaining project variable is the inert Preview-only browser allowed-origins entry. Values were not printed.
- `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` remains intentionally absent and fail-closed. Vercel history confirms its prior target changes but does not expose the prior value; the existing readiness lock still requires separate owner approval before this write gate may be opened, so it was not guessed or restored.
- `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED` remains false. Creating and storing the replacement key did not send email, enable a provider action, create a deployment, or change the running Production artifact.
- Vercel environment changes do not affect existing deployments. The existing protected Preview artifact still contains its old frozen environment and must not be treated as isolated; only a future Preview deployment would consume the isolated configuration.
- Remote `main` is `adf37589`, six commits behind remote `staging` at `f7e253b3`; local `staging` is six commits ahead before this record. No merge or push occurred.
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
4. Production's required names-only configuration recovery is complete, but do not push `staging`, push `main`, or deploy without a separate deployment approval.
5. Keep the existing Resend key intact and the Driver Details Email send gate false. Do not delete or rotate either key, assign provider credentials to Preview, or send a message without separate action-time approval. Keep the CRM gate absent and fail-closed until its separately guarded activation is explicitly approved.
6. After exact Production recovery is verified, deploy the existing app build artifact or clean repo commit to staging Preview only with its isolated no-Supabase/no-provider configuration.
7. Do not add live credentials, provider tokens, payment keys, auth activation, DB write flags, or migration commands to Preview.
8. Run the post-deploy smoke checklist below against the new staging Preview URL; do not use the existing old Preview artifact as isolation evidence.
9. Record sanitized evidence only. Do not paste secrets, tokens, env values, database rows, stack traces, or provider responses.

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
