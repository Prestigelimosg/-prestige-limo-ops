# Test and Safety Docs Index

## Purpose

This index is a docs-only cross-reference for existing Prestige Limo Ops testing, safety, production-readiness, and planning documents. It does not change app behavior, package scripts, parser behavior, Supabase behavior, payment behavior, notification behavior, API behavior, or implementation approval status.

## Current Safety Position

- `test:safe` membership is unchanged.
- `package.json` scripts are unchanged.
- `test:browser` remains standalone manual legacy browser coverage and is not claimed as part of `test:safe`.
- This index does not approve implementation work.
- Use the linked docs for planning context, safety gates, and ownership boundaries.
- Implementation still needs separate scoped approval and matching tests.

## Test Coverage And Manual Browser Testing

- [Manual test:browser coverage note](test-browser-manual-coverage-note.md) owns the standalone/manual `test:browser` coverage note, runtime expectations, Safari/cross-browser value, and its relationship to newer safe-suite browser tests.

## Production And Environment Safety

- [Production Environment Checklist](production-environment-checklist.md) owns staging/live rollout safety, environment variable handling, secret handling, and production readiness gates.
- [Admin Persistence Enable Approval Checklist](admin-persistence-enable-approval-checklist.md) owns the read-only persistence enablement approval/audit checklist, mocked backend gate list, kill-switch requirements, forbidden fields, and no-real-write approval boundary.
- [Admin Persistence Real-Write Approval Proposal](admin-persistence-real-write-approval-proposal.md) owns the docs-only William review packet for any future staging-only controlled real-write proposal, including required approvals, environment gates, rollback steps, forbidden fields, and test gates.
- [Admin Persistence Staging Verification Packet](admin-persistence-staging-verification-packet.md) owns the docs-only staging verification packet for the controlled admin persistence path, including preflight checks, future evidence requirements, rollback steps, stop conditions, and the no-live-write approval boundary.
- [Admin Persistence Staging Command And Evidence Checklist](admin-persistence-staging-command-and-evidence-checklist.md) owns the docs-only exact future staging command group, env/config requirements, one controlled admin booking/customer save-load evidence checklist, rollback steps, stop conditions, and the no-command/no-live-write approval boundary.
- [Admin Persistence Staging Save-Load Failure Evidence](admin-persistence-staging-save-load-failure-evidence.md) owns the sanitized Stage 4A-388 controlled save failure reference, Stage 4A-389 local adapter/schema diagnosis, no-second-live-write boundary, and future retry prerequisites.
- [Admin Persistence Staging Save-Load Retry Failure Evidence](admin-persistence-staging-save-load-retry-failure-evidence.md) owns the sanitized Stage 4A-390 one-retry failure reference, current-first/cumulative-fallback adapter diagnosis, no-rerun boundary, and future retry prerequisites.
- [Admin Persistence Staging Read-Only Diagnostics Evidence](admin-persistence-staging-readonly-diagnostics-evidence.md) owns the sanitized Stage 4A-391 read-only staging diagnostic category, auth/key blocker diagnosis, no-write boundary, and future read-only retry prerequisites.
- [Admin Persistence Staging Read-Only Env Key Confirmed](admin-persistence-staging-readonly-env-key-confirmed.md) owns the sanitized Stage 4A-392 read-only env/key acceptance evidence, current-shape read-only schema confirmation, no-write boundary, and future approval-gated save-load retry prerequisite.
- [Admin Persistence Staging Save-Load Success Evidence](admin-persistence-staging-save-load-success-evidence.md) owns the sanitized Stage 4A-393 one controlled save-load success reference, kill-switch proof, admin gate proof, no-unsafe-field evidence, no-rerun boundary, and rollback notes.
- [Admin Persistence API Staging Save-Load Success Evidence](admin-persistence-api-staging-save-load-success-evidence.md) owns the sanitized Stage 4A-394 one controlled API-route save-load success reference, kill-switch proof, admin gate proof, customer/public/driver/anonymous block proof, no-unsafe-field evidence, no-rerun boundary, and rollback notes.
- [Admin Persistence Production Readiness Gate](admin-persistence-production-readiness-gate.md) owns the Stage 4A-395 production go/no-go summary, proven-safe evidence, production blockers, approval requirements, legacy public-table RLS blocker, and no-production-enable boundary.
- [Admin Persistence Staging Cleanup Decision](admin-persistence-staging-cleanup-decision.md) owns the Stage 4A-395 staging cleanup decision, no-cleanup-write boundary, required separate cleanup approval, and staging evidence row retention note.
- [Legacy Public Table Server Route Hardening](legacy-public-table-server-route-hardening.md) owns the Stage 4A-397 server-only admin route hardening for legacy admin public-table access, the browser direct-access retirement evidence, and the no-RLS-migration boundary.
- [Legacy Public Table RLS Hardening](legacy-public-table-rls-hardening.md) owns the Stage 4A-398 local RLS migration draft, Stage 4A-399 staging-only apply result, no-production-apply boundary, and no-public-anon-policy boundary.
- [Legacy Public Table RLS Hardening Apply Evidence](legacy-public-table-rls-hardening-apply-evidence.md) owns the masked Stage 4A-399 staging apply evidence, read-only RLS/policy verification result, rollback boundary, and no-production-touch boundary.
- [Supabase Schema And RLS Review Checklist](supabase-schema-rls-review-checklist.md) owns future Supabase schema, RLS, public-page, service-role, storage, and access-boundary review.
- [Driver Job Link Production Checklist](driver-job-link-production-checklist.md) owns the production driver-link go/no-go checklist, approval locks, required tests, and disabled-by-default production posture.

## Driver Workflow And Public Driver Link Safety

- [Driver Job Link Production Design](driver-job-link-production-design.md) owns the production driver-link design boundary, safe public projection, token verification expectations, and future table planning.
- [Driver Job Link Workflow Plan](driver-job-link-workflow-plan.md) owns the driver acknowledgement, driver detail, OTW/OTS/POB/Job Completed, exception, live-location, and testing workflow plan.

## API, Payment, And Provider Planning

- [API Integration Cost, Security, and Rollout Plan](api-integration-cost-security-plan.md) owns broad future API categories, cost/security concerns, rollout staging, and provider-risk framing.
- [Limo API Integration Plan](limo-api-integration-plan.md) owns the wider provider planning for payments, manual bank transfer, live location, maps, notifications, flight status, storage, monitoring, and related rollout boundaries.
- [Limo API Provider Decision Shortlist](limo-api-provider-decision-shortlist.md) owns the provider shortlist and owner decision prompts before API implementation.
- [Stripe Test-Mode Payment-Link Workflow Plan](stripe-test-mode-payment-link-workflow-plan.md) owns future Stripe test-mode payment-link planning, staff review requirements, webhook planning, and payment-link safety boundaries.

## Telegram Planning

- [Telegram Driver Alert Workflow Plan](telegram-driver-alert-workflow-plan.md) owns future Telegram driver/admin alert planning, token handling, recipient mapping, message rules, and mock/log-only-first staging.
- [Telegram Mock Alert Preview UI Plan](telegram-mock-alert-preview-ui-plan.md) owns future mock/no-send Telegram preview UI boundaries, no-send wording, secret handling, and test expectations.

## Customer, Payment, Billing, And Portal Planning

- [Customer-Facing Booking Page Separation Plan](customer-facing-booking-page-plan.md) owns the separation between `/customers` and future customer-safe booking request pages.
- [Customer Payments Workflow Design](customer-payments-workflow-design.md) owns internal customer folders, outstanding payments, manual-first collection, invoice prefix, and billing workflow planning.
- [Customer Payment Owner Decision Answer Sheet](customer-payment-owner-decision-answer-sheet.md) owns owner decision prompts for customer/payment roles, payment updates, invoice numbers, audit rules, and production defaults.
- [Customer Payment Production Open Decisions](customer-payment-production-open-decisions.md) owns the unresolved decision gates before customer/payment production implementation.
- [Customer Payment Approved Defaults Summary](customer-payment-approved-defaults-summary.md) owns the approved planning defaults for roles, invoice numbering, audit history, and disabled production behavior.
- [Customer Payment Schema and RLS Plan](customer-payment-schema-rls-plan.md) owns the initial customer/payment schema and RLS planning shape.
- [Customer Payment Schema and RLS Proposal](customer-payment-schema-rls-proposal.md) owns the review proposal for future schema, RLS, server-only routes, invoice sequence safety, and audit events.
- [Customer Payment Final Schema/RLS Proposal](customer-payment-final-schema-rls-proposal.md) owns the final plain-English customer/payment schema, RLS, route, invoice-number, and audit-event proposal.
- [Customer Payment Supabase Migration Planning](customer-payment-supabase-migration-planning.md) owns future migration planning boundaries without creating or applying migrations.
- [Regular Customer Monthly Billing Workflow Plan](regular-customer-monthly-billing-workflow-plan.md) owns regular-customer booking, monthly billing, draft invoice preview, and bank-transfer billing workflow planning.
- [Customer Portal Plan](customer-portal-plan.md) owns future portal separation, customer-safe booking views, auth/security planning, edit/amend requests, and mobile/search-first portal expectations.

## UI And Mobile Safety

- [App-Wide Human-Usage UI Standard](app-wide-ui-human-usage-standard.md) owns the app-wide search-first, compact-row, mobile/no-horizontal-overflow, feedback-placement, and mock/local boundary standards.

## Rules For Future Changes

- No package script changes come from this index; package script changes need separate review.
- No `test:safe` membership changes come from this index; `test:safe` changes need separate review.
- No implementation behavior comes from this index.
- App, parser, Supabase, API, payment, billing, notification, auth, live-location, flight, maps, calendar, invoice, PDF, and customer-facing behavior require separate scoped approval and tests.
