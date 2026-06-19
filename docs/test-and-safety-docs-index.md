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
- [Owner Feature Approval Contract](owner-feature-approval-contract.md) owns the global no-new-feature-without-explicit-owner-approval rule, including that vague forward-motion wording is not approval for UI/API/runtime behavior.
- [Pre-Edit Source Of Truth Contract](pre-edit-source-of-truth-contract.md) owns the task-start and pre-edit source-of-truth inspection order requiring `git log --oneline -12`, `git status --short`, and `docs/current-implementation-ledger.md` before choosing next work or editing repo files.
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
- [Legacy Public Table RLS Production Decision Packet](legacy-public-table-rls-production-decision-packet.md) owns the Stage 4A-400 post-apply staging evidence review, production blocked decision, production approval prerequisites, and no-live-DB-touch boundary.
- [Legacy Public Table RLS Production Target Proof Checklist](legacy-public-table-rls-production-target-proof-checklist.md) owns the Stage 4A-401A stop reason, production target proof requirements, rollback note, and future apply command boundary.
- [Legacy Public Table RLS Production Evidence](legacy-public-table-rls-production-apply-evidence.md) owns the Stage 4A-401C masked production target proof, already-applied migration ledger result, read-only production RLS/policy verification, and no-production-persistence-enable boundary.
- [Legacy Public Table RLS Hardening Closeout](legacy-public-table-rls-hardening-closeout.md) owns the Stage 4A-402 staging/production RLS evidence closeout, production-persistence-still-off boundary, and next Supabase-vs-app-work decision.
- [Admin Persistence/Auth Next-Step Map](admin-persistence-auth-next-step-map.md) owns the Stage 4A-403 docs-only backend workflow order after legacy RLS closeout: admin production persistence gate, admin production save/load verification, customer auth/RLS, driver auth/token security, then notifications/billing/PDF/payment.
- [Admin Persistence Production Save-Load Verification Evidence](admin-persistence-production-save-load-verification-evidence.md) owns the Stage 4A-404 stopped production admin persistence preflight evidence, masked production target proof, no-live-DB-touch result, and remaining blocked save/load scope.
- [Admin Persistence Production Save-Load Retry Evidence](admin-persistence-production-save-load-retry-evidence.md) owns the Stage 4A-405 non-secret env gate fix, masked production preflight pass, one admin-gated pre-save read attempt, safe no-write stop, and rollback/default-OFF evidence.
- [Admin Persistence Production GET 500 Diagnosis](admin-persistence-production-get-500-diagnosis.md) owns the Stage 4A-406 code-inspection diagnosis for the production admin GET safe `500`, the current-vs-foundation read-shape fix, no-live-DB-touch evidence, and the no-POST/no-write boundary.
- [Admin Persistence Production GET Verification Evidence](admin-persistence-production-get-verification-evidence.md) owns the Stage 4A-407 masked production admin GET-only verification, successful read-only `/api/admin-bookings` status, no-row-data evidence, and no-POST/no-write boundary.
- [Admin Persistence Production Save-Load Stage 4A-408 Evidence](admin-persistence-production-save-load-stage4a408-evidence.md) owns the Stage 4A-408 one-record production admin save/load verification, test reference, masked target evidence, no-delete cleanup decision, and current/foundation booking create fallback proof.
- [Admin Persistence Production Test Record Closeout Stage 4A-409](admin-persistence-production-test-record-closeout-stage4a409.md) owns the Stage 4A-409 exact-test-reference cleanup review, no-delete decision because no existing admin-gated cleanup route is supported, masked env preflight evidence, and no-production-touch closeout.
- [Admin Workflow Status Production Save-Load Stage 4A-430 Evidence](admin-workflow-status-production-save-load-stage4a430-evidence.md) owns the Stage 4A-430 one-row production workflow status save/load verification, exact fake reference, exact-reference cleanup result, masked target evidence, and no-real-booking-touch boundary.
- [Admin Monthly Drafts Production Save-Load Verification Evidence](admin-monthly-drafts-production-save-load-verification-evidence.md) owns the one-row production monthly billing draft and monthly invoice draft save/load/delete verification, exact fake accounts, exact cleanup result, masked target evidence, and no-real-booking/customer-touch boundary.
- [Driver Job Status Production Verification Blocked Evidence](driver-job-status-production-verification-blocked-evidence.md) owns the approved driver job status production verification attempt that stopped before live write because required Supabase server env names were not available, with no live DB touch and no secret exposure.
- [Driver Job Status Production Verification Evidence](driver-job-status-production-verification-evidence.md) owns the approved one-fake-row production driver job status save/load/delete verification, exact fake reference, exact cleanup result, masked target evidence, and no-real-booking/customer-touch boundary.
- [Business Workflow Resume Stage 4A-410](business-workflow-resume-stage4a410.md) owns the post-production-persistence business workflow outcome: admin-only confirmed booking to dispatch release is complete, with no live DB, auth, billing, notification, payout, PDF, parser-learning, or driver-token activation.
- [Business-Grade Forward Completion Sequence](business-grade-forward-completion-sequence.md) owns the forward-only completion order after persistence evidence: do not repeat completed verification, keep testing/staging required at the right layer, treat Confirmed Booking To Dispatch Release as complete, and require a fresh no-edit readiness audit plus explicit owner approval before any next runtime lane.
- [Business Workflow Source Of Truth After Confirmed Dispatch Release Guard](../scripts/test-business-workflow-source-of-truth-after-confirmed-dispatch-release.mjs) owns the guard that prevents stale source-of-truth wording from pulling future work backward into a completed Dispatch Release lane.
- [Admin Dispatch Release Existing Workflow Lock](admin-dispatch-release-existing-workflow-lock.md) owns the existing admin-only Dispatch Release checklist, handoff packet, workflow-status API integration, and no-duplicate rule for future work.
- [Admin Driver Acknowledgement Existing Workflow Lock](admin-driver-acknowledgement-existing-workflow-lock.md) owns the existing admin-only Driver Acknowledgement readiness, follow-up, workflow-status API integration, and no-duplicate rule for future work.
- [Admin Driver Acknowledgement Dispatch Release Boundary Guard](../scripts/test-admin-driver-acknowledgement-dispatch-release-boundary-guard.mjs) owns the saved Dispatch Release ready requirement before the existing Driver Acknowledgement mark-ready/save path or follow-up advancement can move forward.
- [Admin Day-of-Trip Dispatch Monitor Existing Workflow Lock](admin-day-of-trip-dispatch-monitor-existing-workflow-lock.md) owns the existing admin-only Day-of-Trip Dispatch Monitor, saved driver status readout, GET-only driver-status API integration, and no-duplicate rule for future work.
- [Admin Day-of-Trip Dispatch Monitor Driver Acknowledgement Boundary Guard](../scripts/test-admin-day-of-trip-dispatch-monitor-driver-ack-boundary-guard.mjs) owns the gated Driver Acknowledgement prerequisite before the existing Day-of-Trip local progress controls can advance beyond reminder/needs-call states.
- [Admin Completed Trip Closeout Existing Workflow Lock](admin-completed-trip-closeout-existing-workflow-lock.md) owns the existing admin-only Day-of-Trip Completion Handoff, Completed Trip Closeout Review, guarded completed-closeout API integration, and no-duplicate rule for future work.
- [Admin Closeout To Billing Preparation Existing Workflow Lock](admin-closeout-billing-preparation-existing-workflow-lock.md) owns the existing admin-only Closeout to Billing Preparation, Billing Preparation Exception, Billing Preparation Summary / Ready Review surfaces, and no-duplicate rule while keeping invoice/PDF/payment/payout/billing automation blocked.
- [Admin Closeout To Billing Preparation Sequencing Guard](../scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs) owns the existing derived-readiness sequence from completed closeout through billing-preparation exception checks, billing-preparation summary, and monthly billing queue readiness.
- [Admin Monthly Billing Queue Existing Workflow Lock](admin-monthly-billing-queue-existing-workflow-lock.md) owns the existing admin-only Monthly Billing Queue Readiness and Monthly Billing Queue Exception review surfaces, and no-duplicate rule while keeping invoice/PDF/payment/payout/billing automation and month grouping writes blocked.
- [Admin Monthly Billing Month Grouping Existing Workflow Lock](admin-monthly-billing-month-grouping-existing-workflow-lock.md) owns the existing admin-only Monthly Billing Month Grouping Review, guarded saved grouping read controls, draft/review action controls, and no-duplicate rule while keeping invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, and driver notifications blocked.
- [Admin Monthly Billing Queue To Month Grouping Sequencing Guard](../scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs) owns the existing derived-readiness sequence from Monthly Billing Queue readiness through Month Grouping local fallback/saved-group readiness, while keeping invoice/PDF/payment/payout/provider sends/billing automation/customer and driver sends blocked.
- [Admin Monthly Billing Draft And Invoice Review Sequencing Guard](../scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs) owns the existing derived-readiness sequence from saved Month Grouping through draft plan, invoice draft-prep, item review, billable price review, issue review, issue record, invoice-number reservation, and PDF-review readiness, while keeping invoice creation/PDF generation or sending/payment/payout/provider sends/billing automation/customer and driver sends blocked.
- [Customer Copy Multi-Channel Existing Workflow Lock](customer-copy-multi-channel-existing-workflow-lock.md) owns the existing admin Customer Copy Email/WhatsApp/SMS customer driver-details review row and no-duplicate rule while keeping provider/env reads, provider sends, notification sends, customer messages, driver notifications, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser changes, and DB writes blocked.
- [Production Rate Setup Checklist](production-rate-setup-checklist.md) owns the current default/customer-specific rate handling audit, admin-only rate field boundaries, owner setup checklist, and typed read-only rate API next-step recommendation.
- [Supabase Schema And RLS Review Checklist](supabase-schema-rls-review-checklist.md) owns future Supabase schema, RLS, public-page, service-role, storage, and access-boundary review.
- [Driver Job Link Production Checklist](driver-job-link-production-checklist.md) owns the production driver-link go/no-go checklist, approval locks, required tests, and disabled-by-default production posture.

## Driver Workflow And Public Driver Link Safety

- [Driver Reporting Status Contract](driver-reporting-status-contract.md) owns the current source-of-truth driver public reporting/status boundary from safe driver detail acknowledgement to JC, including OTW/OTS/POB/Job Completed, enum-only issue reports, role visibility, and no finance/payout/privacy leak rules.
- [Admin Driver Exception Handling Contract](admin-driver-exception-handling-contract.md) owns the current admin-only driver exception handling boundary for no-response, late/reminder, passenger issue, replacement, recovery, post-recovery update readiness, and completed-with-exception review without adding new UI sectors or public driver statuses.
- [Admin Exception Recovery To Closeout Sequencing Guard](../scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs) owns the existing derived-readiness sequence from dispatch recovery and post-recovery update through completion handoff and completed trip closeout review.
- [Customer Driver Status Visibility Contract](customer-driver-status-visibility-contract.md) owns the customer-safe visibility boundary for any future 30-minute customer live-location alert/link handoff while keeping Customer Portal saved-bookings generic, with POB auto-disable and without exposing raw driver statuses, issue reports, admin exceptions, replacement review, raw live-location state, photo/proof, finance, payout, billing, or payment data.
- [Driver Job Link Production Design](driver-job-link-production-design.md) owns the production driver-link design boundary, safe public projection, token verification expectations, and future table planning.
- [Driver Job Link Workflow Plan](driver-job-link-workflow-plan.md) owns older broad planning context for driver acknowledgement, driver detail, OTW/OTS/POB/Job Completed, exception, live-location, and testing; current public reporting/status boundaries defer to the Driver Reporting Status Contract.

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
- [Admin Billing Payment Finance Activation Split Approval Packet](admin-billing-payment-finance-activation-split-approval-packet.md) owns the docs/test-only split between invoice number readiness, invoice/PDF format, PDF generation, invoice sending, payment links/provider, manual payment reconciliation, and payout/accounting/finance export before any future finance runtime lane.
- [Admin Monthly Invoice PDF Generation Approval Packet](admin-monthly-invoice-pdf-generation-approval-packet.md) owns the docs/test-only approval/readiness boundary for future PDF generation only, while keeping invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, DB writes, UI additions, and runtime PDF generation blocked.
- [Regular Customer Monthly Billing Workflow Plan](regular-customer-monthly-billing-workflow-plan.md) owns regular-customer booking, monthly billing, draft invoice preview, and bank-transfer billing workflow planning.
- [Customer Portal Plan](customer-portal-plan.md) owns future portal separation, customer-safe booking views, auth/security planning, edit/amend requests, and mobile/search-first portal expectations.
- [Customer Portal Real Booking Data Path Audit](customer-portal-real-booking-data-path-audit.md) owns the customer saved-bookings read path, customer session issue contract, same-origin cookie handoff, customer-safe field boundary, fail-closed empty/sign-in-required posture, and no-live-write/no-send scope.

## UI And Mobile Safety

- [App-Wide Human-Usage UI Standard](app-wide-ui-human-usage-standard.md) owns the app-wide search-first, compact-row, mobile/no-horizontal-overflow, feedback-placement, and mock/local boundary standards.

## Rules For Future Changes

- No package script changes come from this index; package script changes need separate review.
- No `test:safe` membership changes come from this index; `test:safe` changes need separate review.
- No implementation behavior comes from this index.
- App, parser, Supabase, API, payment, billing, notification, auth, live-location, flight, maps, calendar, invoice, PDF, and customer-facing behavior require separate scoped approval and tests.
