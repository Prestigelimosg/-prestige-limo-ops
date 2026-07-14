import { spawnSync } from "node:child_process";

const guardChecks = [
  {
    label: "global pre-activation no-live guard",
    script: "scripts/test-global-preactivation-no-live-guard.mjs",
  },
  {
    label: "activation decision matrix guard",
    script: "scripts/test-activation-decision-matrix-guard.mjs",
  },
  {
    label: "owner feature approval contract guard",
    script: "scripts/test-owner-feature-approval-contract.mjs",
  },
  {
    label: "pre-edit source-of-truth contract guard",
    script: "scripts/test-pre-edit-source-of-truth-contract.mjs",
  },
  {
    label: "admin automation runtime control guard",
    script: "scripts/test-admin-automation-runtime-control-guard.mjs",
  },
  {
    label: "Codex job-card automatic preparation guard",
    script: "scripts/test-codex-job-card-auto-preparation-guard.mjs",
  },
  {
    label: "Codex calendar conflict detection guard",
    script: "scripts/test-codex-calendar-conflict-detection-guard.mjs",
  },
  {
    label: "Codex monthly invoice draft auto-preparation guard",
    script: "scripts/test-codex-monthly-invoice-draft-auto-preparation-guard.mjs",
  },
  {
    label: "admin exact customer account delete API contract guard",
    script: "scripts/test-admin-customer-account-delete-api-contract.mjs",
  },
  {
    label: "admin exact customer account delete runtime guard",
    script: "scripts/test-admin-customer-account-delete-runtime.mjs",
  },
  {
    label: "retired Ritz mock customer guard",
    script: "scripts/test-retired-ritz-mock-customer-guard.mjs",
  },
  {
    label: "customer folder multi-job invoice handoff guard",
    script: "scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs",
  },
  {
    label: "business-grade forward completion sequence guard",
    script: "scripts/test-business-grade-forward-completion-sequence.mjs",
  },
  {
    label: "business workflow resume Stage 4A-410 audit",
    script: "scripts/test-business-workflow-resume-stage4a410.mjs",
  },
  {
    label: "business workflow source-of-truth after confirmed Dispatch Release guard",
    script: "scripts/test-business-workflow-source-of-truth-after-confirmed-dispatch-release.mjs",
  },
  {
    label: "admin Dispatch Release existing workflow lock guard",
    script: "scripts/test-admin-dispatch-release-existing-workflow-lock.mjs",
  },
  {
    label: "confirmed booking Dispatch Release boundary guard",
    script: "scripts/test-confirmed-booking-dispatch-release-boundary-guard.mjs",
  },
  {
    label: "admin Driver Acknowledgement existing workflow lock guard",
    script: "scripts/test-admin-driver-acknowledgement-existing-workflow-lock.mjs",
  },
  {
    label: "admin Driver Acknowledgement Dispatch Release boundary guard",
    script: "scripts/test-admin-driver-acknowledgement-dispatch-release-boundary-guard.mjs",
  },
  {
    label: "admin Day-of-Trip Dispatch Monitor existing workflow lock guard",
    script: "scripts/test-admin-day-of-trip-dispatch-monitor-existing-workflow-lock.mjs",
  },
  {
    label: "admin Day-of-Trip Dispatch Monitor Driver Acknowledgement boundary guard",
    script: "scripts/test-admin-day-of-trip-dispatch-monitor-driver-ack-boundary-guard.mjs",
  },
  {
    label: "admin Completed Trip Closeout existing workflow lock guard",
    script: "scripts/test-admin-completed-trip-closeout-existing-workflow-lock.mjs",
  },
  {
    label: "admin Closeout to Billing Preparation existing workflow lock guard",
    script: "scripts/test-admin-closeout-billing-preparation-existing-workflow-lock.mjs",
  },
  {
    label: "admin Closeout to Billing Preparation sequencing guard",
    script: "scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs",
  },
  {
    label: "no-show and late-cancellation billing control guard",
    script: "scripts/test-no-show-late-cancellation-billing-control-guard.mjs",
  },
  {
    label: "admin Monthly Billing Queue existing workflow lock guard",
    script: "scripts/test-admin-monthly-billing-queue-existing-workflow-lock.mjs",
  },
  {
    label: "admin Monthly Billing Queue to Month Grouping sequencing guard",
    script: "scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs",
  },
  {
    label: "admin Monthly Billing Month Grouping existing workflow lock guard",
    script: "scripts/test-admin-monthly-billing-month-grouping-existing-workflow-lock.mjs",
  },
  {
    label: "admin Monthly Billing Draft and Invoice Review sequencing guard",
    script: "scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs",
  },
  {
    label: "Customer Copy multi-channel existing workflow lock guard",
    script: "scripts/test-customer-copy-multi-channel-existing-workflow-lock.mjs",
  },
  {
    label: "admin manual Telegram copy channel guard",
    script: "scripts/test-admin-manual-telegram-copy-channel-guard.mjs",
  },
  {
    label: "staging deployment approval packet guard",
    script: "scripts/test-staging-deployment-approval-packet-guard.mjs",
  },
  {
    label: "core admin booking persistence activation packet guard",
    script: "scripts/test-core-admin-booking-persistence-activation-packet-guard.mjs",
  },
  {
    label: "core booking persistence safe path guard",
    script: "scripts/test-core-booking-persistence-safe-path-guard.mjs",
  },
  {
    label: "admin booking read contract disabled setup guard",
    script: "scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs",
  },
  {
    label: "admin booking read no-live guard",
    script: "scripts/test-admin-booking-read-no-live-guard.mjs",
  },
  {
    label: "Load Bookings typed read migration plan guard",
    script: "scripts/test-load-bookings-typed-read-migration-plan.mjs",
  },
  {
    label: "Load Bookings runtime wiring approval packet guard",
    script: "scripts/test-load-bookings-runtime-wiring-approval-packet.mjs",
  },
  {
    label: "Load Bookings typed DTO split plan guard",
    script: "scripts/test-load-bookings-typed-dto-split-plan.mjs",
  },
  {
    label: "Load Bookings safe DTO contract guard",
    script: "scripts/test-load-bookings-safe-dto-contract.mjs",
  },
  {
    label: "Load Bookings safe DTO no-live guard",
    script: "scripts/test-load-bookings-safe-dto-no-live-guard.mjs",
  },
  {
    label: "Load Bookings runtime wiring blocker guard",
    script: "scripts/test-load-bookings-runtime-wiring-blocker.mjs",
  },
  {
    label: "Load Bookings safe UI adapter card contract guard",
    script: "scripts/test-load-bookings-safe-ui-adapter-card-contract.mjs",
  },
  {
    label: "Operational-only Load Bookings runtime wiring approval packet guard",
    script: "scripts/test-load-bookings-operational-runtime-wiring-approval-packet.mjs",
  },
  {
    label: "Typed Load Bookings endpoint migration approval packet guard",
    script: "scripts/test-load-bookings-typed-endpoint-migration-approval-packet.mjs",
  },
  {
    label: "Load Bookings DB read approval packet guard",
    script: "scripts/test-load-bookings-db-read-approval-packet.mjs",
  },
  {
    label: "Load Bookings typed read adapter foundation guard",
    script: "scripts/test-load-bookings-typed-read-adapter-foundation.mjs",
  },
  {
    label: "Load Bookings typed read disabled setup API contract guard",
    script: "scripts/test-load-bookings-typed-read-disabled-setup-api-contract.mjs",
  },
  {
    label: "Load Bookings operational record mapper guard",
    script: "scripts/test-load-bookings-operational-record-mapper.mjs",
  },
  {
    label: "Load Bookings typed read gated API contract guard",
    script: "scripts/test-load-bookings-typed-read-gated-api-contract.mjs",
  },
  {
    label: "Load Bookings typed read rollback boundary guard",
    script: "scripts/test-load-bookings-typed-read-rollback-boundary.mjs",
  },
  {
    label: "Load Bookings typed read query shape guard",
    script: "scripts/test-load-bookings-typed-read-query-shape-guard.mjs",
  },
  {
    label: "Load Bookings DB read env/table-policy guard",
    script: "scripts/test-load-bookings-db-read-env-table-policy-guard.mjs",
  },
  {
    label: "Load Bookings operational runtime mapping guard",
    script: "scripts/test-load-bookings-operational-runtime-mapping-guard.mjs",
  },
  {
    label: "Load Bookings typed operational display merge guard",
    script: "scripts/test-load-bookings-typed-operational-display-merge-guard.mjs",
  },
  {
    label: "Load Bookings endpoint migration readiness guard",
    script: "scripts/test-load-bookings-endpoint-migration-readiness-guard.mjs",
  },
  {
    label: "Load Bookings primary-list source boundary guard",
    script: "scripts/test-load-bookings-primary-list-source-boundary-guard.mjs",
  },
  {
    label: "Load Bookings typed-read admin boundary order guard",
    script: "scripts/test-load-bookings-typed-read-admin-boundary-order-guard.mjs",
  },
  {
    label: "Load Bookings typed-read failure payload guard",
    script: "scripts/test-load-bookings-typed-read-failure-payload-guard.mjs",
  },
  {
    label: "Load Bookings typed-read detail isolation guard",
    script: "scripts/test-load-bookings-typed-read-detail-isolation-guard.mjs",
  },
  {
    label: "Load Bookings typed-read admin display exposure guard",
    script: "scripts/test-load-bookings-typed-read-admin-display-exposure-guard.mjs",
  },
  {
    label: "admin Load Bookings CRM fallback and compact list guard",
    script: "scripts/test-admin-load-bookings-crm-fallback-compact-guard.mjs",
  },
  {
    label: "Codex job-card correction preparer guard",
    script: "scripts/test-codex-job-card-correction-preparer.mjs",
  },
  {
    label: "bookings earlier jobs completed history compact guard",
    script: "scripts/test-bookings-earlier-history-compact-guard.mjs",
  },
  {
    label: "Rates mobile layout containment guard",
    script: "scripts/test-rates-mobile-layout-guard.mjs",
  },
  {
    label: "dashboard urgent requests and active monitor guard",
    script: "scripts/test-dashboard-urgent-requests-active-monitor-guard.mjs",
  },
  {
    label: "manual Extra Charges review toggle guard",
    script: "scripts/test-manual-extra-charges-review-toggle-guard.mjs",
  },
  {
    label: "driver completed history grouping guard",
    script: "scripts/test-driver-completed-history-grouping-guard.mjs",
  },
  {
    label: "completed history delete id resolution guard",
    script: "scripts/test-completed-history-delete-id-resolution-guard.mjs",
  },
  {
    label: "completed history billing ready reference display guard",
    script: "scripts/test-completed-history-billing-ready-reference-display-guard.mjs",
  },
  {
    label: "customer terms and hourly billing guard",
    script: "scripts/test-customer-terms-hourly-billing-guard.mjs",
  },
  {
    label: "customer hourly invoice auto calculation guard",
    script: "scripts/test-customer-hourly-invoice-auto-calculation-guard.mjs",
  },
  {
    label: "customer invoice driver JC timing and override guard",
    script: "scripts/test-customer-invoice-driver-jc-override-guard.mjs",
  },
  {
    label: "customer billing document lifecycle guard",
    script: "scripts/test-customer-billing-document-lifecycle-guard.mjs",
  },
  {
    label: "public booking request compact header guard",
    script: "scripts/test-public-booking-request-compact-header-guard.mjs",
  },
  {
    label: "company profile customer settings guard",
    script: "scripts/test-company-profile-settings-guard.mjs",
  },
  {
    label: "invoice settings direct link guard",
    script: "scripts/test-invoice-settings-direct-link-guard.mjs",
  },
  {
    label: "admin new booking email alert guard",
    script: "scripts/test-admin-new-booking-email-alert-guard.mjs",
  },
  {
    label: "admin device push notification guard",
    script: "scripts/test-admin-device-push-notification-guard.mjs",
  },
  {
    label: "public customer/driver visibility boundary guard",
    script: "scripts/test-public-customer-driver-visibility-boundary-guard.mjs",
  },
  {
    label: "public route source privacy boundary guard",
    script: "scripts/test-public-route-source-privacy-boundary-guard.mjs",
  },
  {
    label: "public API source privacy boundary guard",
    script: "scripts/test-public-api-source-privacy-boundary-guard.mjs",
  },
  {
    label: "public API response privacy boundary guard",
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
  },
  {
    label: "public API method surface boundary guard",
    script: "scripts/test-public-api-method-surface-boundary-guard.mjs",
  },
  {
    label: "public API request input boundary guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
  },
  {
    label: "public API session cookie/cache boundary guard",
    script: "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs",
  },
  {
    label: "public API logging/error boundary guard",
    script: "scripts/test-public-api-logging-error-boundary-guard.mjs",
  },
  {
    label: "public API runtime gate boundary guard",
    script: "scripts/test-public-api-runtime-gate-boundary-guard.mjs",
  },
  {
    label: "public API client caller boundary guard",
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
  },
  {
    label: "public client navigation boundary guard",
    script: "scripts/test-public-client-navigation-boundary-guard.mjs",
  },
  {
    label: "public customer form surface boundary guard",
    script: "scripts/test-public-customer-form-surface-boundary-guard.mjs",
  },
  {
    label: "Customer Voice Booking Draft Input contract guard",
    script: "scripts/test-customer-voice-booking-draft-input-contract.mjs",
  },
  {
    label: "Customer Voice Booking Draft Field-Fill contract guard",
    script: "scripts/test-customer-voice-booking-draft-field-fill-contract.mjs",
  },
  {
    label: "Customer Voice Booking Draft Field-Fill UI guard",
    script: "scripts/test-customer-voice-booking-draft-field-fill-ui-guard.mjs",
  },
  {
    label: "Customer Voice Booking Speak button UI guard",
    script: "scripts/test-customer-voice-booking-speak-button-ui-guard.mjs",
  },
  {
    label: "public customer portal saved-booking surface guard",
    script: "scripts/test-public-customer-portal-saved-booking-surface-guard.mjs",
  },
  {
    label: "customer booking change request review guard",
    script: "scripts/test-customer-booking-change-request-review-guard.mjs",
  },
  {
    label: "admin booking change request email alert guard",
    script: "scripts/test-admin-booking-change-request-email-alert-guard.mjs",
  },
  {
    label: "Customer Portal saved-bookings authenticated read evidence contract guard",
    script: "scripts/test-customer-portal-saved-bookings-read-evidence-contract-guard.mjs",
  },
  {
    label: "Customer Portal saved-bookings staging read evidence runner guard",
    script: "scripts/test-customer-portal-saved-bookings-staging-read-evidence-runner-guard.mjs",
  },
  {
    label: "public driver job action surface guard",
    script: "scripts/test-public-driver-job-action-surface-guard.mjs",
  },
  {
    label: "driver job details admin sync guard",
    script: "scripts/test-driver-job-details-admin-sync-guard.mjs",
  },
  {
    label: "dispatch flight-location copy guard",
    script: "scripts/test-dispatch-flight-location-copy-guard.mjs",
  },
  {
    label: "dispatch action feedback compact guard",
    script: "scripts/test-dispatch-action-feedback-compact-guard.mjs",
  },
  {
    label: "admin operational snapshot apply guard",
    script: "scripts/test-admin-operational-snapshot-apply-guard.mjs",
  },
  {
    label: "admin dashboard live follow-up fixes guard",
    script: "scripts/test-admin-dashboard-live-followup-fixes-guard.mjs",
  },
  {
    label: "customers outstanding review dropdown guard",
    script: "scripts/test-customers-outstanding-review-dropdown-guard.mjs",
  },
  {
    label: "customers remaining queues compact guard",
    script: "scripts/test-customers-remaining-queues-compact-guard.mjs",
  },
  {
    label: "customers invoice workspace cleanup guard",
    script: "scripts/test-customers-invoice-workspace-cleanup-guard.mjs",
  },
  {
    label: "customers folder finder and unbilled queue guard",
    script: "scripts/test-customers-folder-finder-unbilled-queue-guard.mjs",
  },
  {
    label: "customer folder dispatch handoff guard",
    script: "scripts/test-customer-folder-dispatch-handoff-guard.mjs",
  },
  {
    label: "customer trust path invoice portal guard",
    script: "scripts/test-customer-trust-path-invoice-portal-guard.mjs",
  },
  {
    label: "customer local invoice issue PDF portal guard",
    script: "scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs",
  },
  {
    label: "customer invoice test artifact archive guard",
    script: "scripts/test-customer-invoice-test-artifact-archive-guard.mjs",
  },
  {
    label: "invoice action safety shield guard",
    script: "scripts/test-invoice-action-safety-shield-guard.mjs",
  },
  {
    label: "admin app notification refresh no-blink guard",
    script: "scripts/test-admin-app-notification-refresh-no-blink-guard.mjs",
  },
  {
    label: "customer folder job history compact guard",
    script: "scripts/test-customer-folder-job-history-compact-guard.mjs",
  },
  {
    label: "driver reporting status contract guard",
    script: "scripts/test-driver-reporting-status-contract.mjs",
  },
  {
    label: "admin driver exception handling contract guard",
    script: "scripts/test-admin-driver-exception-handling-contract.mjs",
  },
  {
    label: "admin exception/recovery to closeout sequencing guard",
    script: "scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs",
  },
  {
    label: "customer driver status visibility contract guard",
    script: "scripts/test-customer-driver-status-visibility-contract.mjs",
  },
  {
    label: "public customer portal session issue surface guard",
    script: "scripts/test-public-customer-portal-session-issue-surface-guard.mjs",
  },
  {
    label: "customer portal access link guard",
    script: "scripts/test-customer-portal-access-link-guard.mjs",
  },
  {
    label: "public customer booking memory surface guard",
    script: "scripts/test-public-customer-booking-memory-surface-guard.mjs",
  },
  {
    label: "public customer booking status surface guard",
    script: "scripts/test-public-customer-booking-status-surface-guard.mjs",
  },
  {
    label: "public driver bidding surface guard",
    script: "scripts/test-public-driver-bidding-surface-guard.mjs",
  },
  {
    label: "public customer/driver app notification surface guard",
    script: "scripts/test-public-customer-driver-app-notification-surface-guard.mjs",
  },
  {
    label: "public driver Flight ETA setup surface guard",
    script: "scripts/test-public-driver-flight-eta-setup-surface-guard.mjs",
  },
  {
    label: "admin FlightAware AeroAPI live lookup action guard",
    script: "scripts/test-admin-flightaware-aeroapi-live-lookup-action-api-contract.mjs",
  },
  {
    label: "FlightAware AeroAPI live lookup no-scheduler guard",
    script: "scripts/test-flightaware-aeroapi-live-lookup-no-scheduler-guard.mjs",
  },
  {
    label: "FlightAware AeroAPI commercial activation constraint guard",
    script: "scripts/test-flightaware-aeroapi-commercial-activation-constraint-guard.mjs",
  },
  {
    label: "public customer driver-details link surface guard",
    script: "scripts/test-public-customer-driver-details-link-surface-guard.mjs",
  },
  {
    label: "public customer/driver auth surface guard",
    script: "scripts/test-public-customer-driver-auth-surface-guard.mjs",
  },
  {
    label: "Customer/Driver Auth activation evidence contract guard",
    script: "scripts/test-customer-driver-auth-evidence-contract-guard.mjs",
  },
  {
    label: "public billing/payment surface guard",
    script: "scripts/test-public-billing-payment-surface-guard.mjs",
  },
  {
    label: "public live-location surface guard",
    script: "scripts/test-public-live-location-surface-guard.mjs",
  },
  {
    label: "public OTS photo proof surface guard",
    script: "scripts/test-public-ots-photo-proof-surface-guard.mjs",
  },
  {
    label: "ledger checkpoint source-of-truth guard",
    script: "scripts/test-ledger-checkpoint-source-of-truth-guard.mjs",
  },
  {
    label: "ledger preactivation suite registration guard",
    script: "scripts/test-ledger-preactivation-suite-registration-guard.mjs",
  },
  {
    label: "current implementation ledger alignment guard",
    script: "scripts/test-current-implementation-ledger-alignment.mjs",
  },
  {
    label: "current implementation ledger not-live guard",
    script: "scripts/test-current-implementation-ledger-not-live-guard.mjs",
  },
  {
    label: "admin setup readiness archive label guard",
    script: "scripts/test-admin-setup-readiness-archive-label-guard.mjs",
  },
  {
    label: "admin route flow lock guard",
    script: "scripts/test-admin-route-flow-lock.mjs",
  },
  {
    label: "rate override split/gating plan guard",
    script: "scripts/test-rate-override-split-gating-plan.mjs",
  },
  {
    label: "rate settings write split lock guard",
    script: "scripts/test-rate-settings-write-split-lock.mjs",
  },
  {
    label: "disabled rate settings write action guard",
    script: "scripts/test-admin-rate-settings-write-action-disabled-setup-api-contract.mjs",
  },
  {
    label: "rate settings runtime approval packet guard",
    script: "scripts/test-rate-settings-runtime-approval-packet.mjs",
  },
  {
    label: "rate settings runtime write action guard",
    script: "scripts/test-rate-settings-runtime-write-action-api-contract.mjs",
  },
  {
    label: "rate settings save defaults boundary split guard",
    script: "scripts/test-rate-settings-save-defaults-boundary-split.mjs",
  },
  {
    label: "rate settings scalar runtime legacy fallback guard",
    script: "scripts/test-rate-settings-scalar-runtime-legacy-fallback-guard.mjs",
  },
  {
    label: "rate settings scalar runtime activation readiness guard",
    script: "scripts/test-rate-settings-scalar-runtime-activation-readiness-guard.mjs",
  },
  {
    label: "pricing/customer_rates runtime approval packet guard",
    script: "scripts/test-pricing-customer-rates-approval-packet.mjs",
  },
  {
    label: "pricing/customer_rates boundary split guard",
    script: "scripts/test-pricing-customer-rates-boundary-split.mjs",
  },
  {
    label: "customer_rates runtime write action guard",
    script: "scripts/test-customer-rates-runtime-write-action-api-contract.mjs",
  },
  {
    label: "customer_rates runtime app wiring guard",
    script: "scripts/test-customer-rates-runtime-app-wiring.mjs",
  },
  {
    label: "customer_rates runtime create path guard",
    script: "scripts/test-customer-rates-runtime-create-path-guard.mjs",
  },
  {
    label: "customer_rates runtime activation readiness guard",
    script: "scripts/test-customer-rates-runtime-activation-readiness-guard.mjs",
  },
  {
    label: "payout runtime approval packet guard",
    script: "scripts/test-payout-approval-packet.mjs",
  },
  {
    label: "payout runtime split guard",
    script: "scripts/test-payout-runtime-split-guard.mjs",
  },
  {
    label: "driver_payout_rules runtime write action guard",
    script: "scripts/test-driver-payout-rules-runtime-write-action-api-contract.mjs",
  },
  {
    label: "driver_payout_rules runtime app wiring guard",
    script: "scripts/test-driver-payout-rules-runtime-app-wiring.mjs",
  },
  {
    label: "driver_payout_rules runtime activation readiness guard",
    script: "scripts/test-driver-payout-rules-runtime-activation-readiness-guard.mjs",
  },
  {
    label: "company/traveler identity read lock guard",
    script: "scripts/test-company-traveler-identity-read-lock.mjs",
  },
  {
    label: "company/traveler CRM write split plan guard",
    script: "scripts/test-company-traveler-crm-write-split-plan.mjs",
  },
  {
    label: "company/traveler CRM runtime write approval packet guard",
    script: "scripts/test-company-traveler-crm-runtime-write-approval-packet.mjs",
  },
  {
    label: "company/traveler CRM runtime write action guard",
    script: "scripts/test-company-traveler-crm-runtime-write-action-api-contract.mjs",
  },
  {
    label: "company/traveler CRM runtime write env/table-policy guard",
    script: "scripts/test-company-traveler-crm-runtime-write-env-table-policy-guard.mjs",
  },
  {
    label: "company/traveler CRM runtime write gate preflight setup guard",
    script: "scripts/test-company-traveler-crm-runtime-write-gate-preflight-setup-api-contract.mjs",
  },
  {
    label: "company/traveler CRM runtime write activation readiness guard",
    script: "scripts/test-company-traveler-crm-runtime-write-activation-readiness-guard.mjs",
  },
  {
    label: "company/traveler CRM identity/contact write contract guard",
    script: "scripts/test-admin-company-traveler-crm-identity-contact-write-contract.mjs",
  },
  {
    label: "company/traveler CRM identity/contact disabled write action guard",
    script: "scripts/test-admin-company-traveler-crm-identity-contact-write-action-disabled-setup-api-contract.mjs",
  },
  {
    label: "company/traveler CRM identity/contact audit payload setup guard",
    script:
      "scripts/test-admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup-api-contract.mjs",
  },
  {
    label: "company/traveler CRM write foundation lock guard",
    script: "scripts/test-company-traveler-crm-write-foundation-lock.mjs",
  },
  {
    label: "CRM identity/rate override payload split guard",
    script: "scripts/test-crm-identity-rate-override-payload-split.mjs",
  },
  {
    label: "remaining shim parked state lock guard",
    script: "scripts/test-remaining-shim-parked-state-lock.mjs",
  },
  {
    label: "full driver profile split readiness lock guard",
    script: "scripts/test-full-driver-profile-split-readiness-lock.mjs",
  },
  {
    label: "disabled full driver profile action guard",
    script: "scripts/test-admin-full-driver-profile-action-disabled-setup-api-contract.mjs",
  },
  {
    label: "disabled full driver profile action audit payload guard",
    script: "scripts/test-admin-full-driver-profile-action-audit-payload-setup-api-contract.mjs",
  },
  {
    label: "full driver profile no-live guard",
    script: "scripts/test-admin-full-driver-profile-no-live-guard.mjs",
  },
  {
    label: "full driver profile runtime approval packet guard",
    script: "scripts/test-full-driver-profile-runtime-approval-packet.mjs",
  },
  {
    label: "full driver profile runtime write action guard",
    script: "scripts/test-full-driver-profile-runtime-write-action-api-contract.mjs",
  },
  {
    label: "full driver profile runtime app wiring guard",
    script: "scripts/test-full-driver-profile-runtime-app-wiring.mjs",
  },
  {
    label: "full driver profile runtime activation readiness guard",
    script: "scripts/test-full-driver-profile-runtime-activation-readiness-guard.mjs",
  },
  {
    label: "Customer Copy multi-channel guard",
    script: "scripts/test-customer-copy-multi-channel-no-live-guard.mjs",
  },
  {
    label: "Email no-live guard",
    script: "scripts/test-email-no-live-guard.mjs",
  },
  {
    label: "Email provider no-send approval packet guard",
    script: "scripts/test-email-provider-no-send-approval-packet.mjs",
  },
  {
    label: "Email provider staging send safety contract guard",
    script: "scripts/test-email-provider-staging-send-safety-contract.mjs",
  },
  {
    label: "owner-domain email provider setup safety guard",
    script: "scripts/test-owner-domain-email-provider-setup-safety-guard.mjs",
  },
  {
    label: "admin customer driver-details Email send action contract guard",
    script: "scripts/test-admin-customer-driver-details-email-send-action-api-contract.mjs",
  },
  {
    label: "Customer notification channel matrix guard",
    script: "scripts/test-customer-notification-channel-matrix-guard.mjs",
  },
  {
    label: "Customer/Driver In-App Notification channel contract guard",
    script: "scripts/test-customer-driver-in-app-notification-channel-contract-guard.mjs",
  },
  {
    label: "Driver Status to Customer In-App runtime fanout guard",
    script: "scripts/test-driver-status-customer-in-app-readiness-contract-guard.mjs",
  },
  {
    label: "Customer/Driver Quick Replies readiness contract guard",
    script: "scripts/test-customer-driver-quick-replies-readiness-contract-guard.mjs",
  },
  {
    label: "Customer/Driver Quick Replies runtime scaffold guard",
    script: "scripts/test-customer-driver-quick-replies-runtime-scaffold-guard.mjs",
  },
  {
    label: "Customer/Driver app compact surface guard",
    script: "scripts/test-customer-driver-app-compact-surface-guard.mjs",
  },
  {
    label: "Customer folder compact index guard",
    script: "scripts/test-customer-folder-compact-index-guard.mjs",
  },
  {
    label: "Customers page scaled queues guard",
    script: "scripts/test-customers-page-scaled-queues-guard.mjs",
  },
  {
    label: "Driver In-App Notification staging evidence contract guard",
    script: "scripts/test-driver-in-app-notification-staging-evidence-contract-guard.mjs",
  },
  {
    label: "Driver In-App Notification admin button guard",
    script: "scripts/test-driver-in-app-notification-admin-button-guard.mjs",
  },
  {
    label: "Driver Job calendar download guard",
    script: "scripts/test-driver-job-calendar-download-guard.mjs",
  },
  {
    label: "Customer In-App Notification admin button guard",
    script: "scripts/test-customer-in-app-notification-admin-button-guard.mjs",
  },
  {
    label: "Controlled Customer Portal + Customer In-App runtime activation contract guard",
    script: "scripts/test-controlled-customer-runtime-activation-contract-guard.mjs",
  },
  {
    label: "Controlled Ritz Carlton production customer runtime pilot runner guard",
    script: "scripts/test-controlled-ritz-customer-runtime-production-pilot-runner-guard.mjs",
  },
  {
    label: "Controlled hidden customer production runtime pilot runner guard",
    script: "scripts/test-hidden-customer-runtime-production-pilot-runner-guard.mjs",
  },
  {
    label: "Controlled small-allowlist customer production runtime pilot runner guard",
    script: "scripts/test-small-allowlist-customer-runtime-production-pilot-runner-guard.mjs",
  },
  {
    label: "Small live customer production runtime allowlist window runner guard",
    script: "scripts/test-small-live-customer-runtime-production-window-runner-guard.mjs",
  },
  {
    label: "Exact-3 small live customer production runtime window runner guard",
    script: "scripts/test-exact-three-small-live-customer-runtime-production-window-runner-guard.mjs",
  },
  {
    label: "Exact-5 small live customer production runtime window runner guard",
    script: "scripts/test-exact-five-small-live-customer-runtime-production-window-runner-guard.mjs",
  },
  {
    label: "Exact-2 customer runtime session map guard",
    script: "scripts/test-exact-two-customer-runtime-session-map-guard.mjs",
  },
  {
    label: "Customer In-App Notification read prerequisite contract guard",
    script: "scripts/test-customer-in-app-notification-read-prereq-contract-guard.mjs",
  },
  {
    label: "Customer In-App Notification read/table-RLS evidence contract guard",
    script: "scripts/test-customer-in-app-notification-read-table-rls-evidence-contract-guard.mjs",
  },
  {
    label: "Customer In-App Notification staging read evidence runner guard",
    script: "scripts/test-customer-in-app-notification-staging-read-evidence-runner-guard.mjs",
  },
  {
    label: "customer booking driver-details message payload safety guard",
    script: "scripts/test-customer-booking-driver-details-message-payload-safety-guard.mjs",
  },
  {
    label: "customer booking driver-details copy preview guard",
    script: "scripts/test-customer-booking-driver-details-copy-preview-guard.mjs",
  },
  {
    label: "WhatsApp no-live guard",
    script: "scripts/test-whatsapp-customer-driver-details-no-live-guard.mjs",
  },
  {
    label: "WhatsApp provider no-send approval packet guard",
    script: "scripts/test-whatsapp-provider-no-send-approval-packet.mjs",
  },
  {
    label: "SMS no-live guard",
    script: "scripts/test-sms-customer-driver-details-no-live-guard.mjs",
  },
  {
    label: "SMS provider no-send approval packet guard",
    script: "scripts/test-sms-provider-no-send-approval-packet.mjs",
  },
  {
    label: "Telegram no-live guard",
    script: "scripts/test-telegram-internal-admin-alert-no-live-guard.mjs",
  },
  {
    label: "Telegram internal admin alert live-send guard",
    script: "scripts/test-telegram-internal-admin-alert-live-send-guard.mjs",
  },
  {
    label: "Telegram True Live Location evidence contract guard",
    script: "scripts/test-telegram-live-location-evidence-contract-guard.mjs",
  },
  {
    label: "Driver Location Source + POB Status evidence contract guard",
    script: "scripts/test-driver-location-pob-evidence-contract-guard.mjs",
  },
  {
    label: "Driver Live Location Capture + Admin Active Jobs Map contract guard",
    script: "scripts/test-driver-live-location-active-jobs-map-contract-guard.mjs",
  },
  {
    label: "Driver Live Location gated runtime evidence contract guard",
    script: "scripts/test-driver-live-location-gated-runtime-evidence-contract-guard.mjs",
  },
  {
    label: "Driver Live Location gated runtime path guard",
    script: "scripts/test-driver-live-location-gated-runtime-path-guard.mjs",
  },
  {
    label: "Driver Live Location admin-controlled runtime gate readiness guard",
    script: "scripts/test-driver-live-location-admin-runtime-gate-readiness-guard.mjs",
  },
  {
    label: "Driver Live Location admin-controlled runtime gate scaffold guard",
    script: "scripts/test-driver-live-location-admin-runtime-gate-scaffold-guard.mjs",
  },
  {
    label: "Driver Live Location admin-controlled runtime gate evidence runner guard",
    script: "scripts/test-driver-live-location-admin-runtime-gate-evidence-runner-guard.mjs",
  },
  {
    label: "Driver Live Location multi-driver admin list guard",
    script: "scripts/test-driver-live-location-runtime-control-ui-guard.mjs",
  },
  {
    label: "Driver Live Location runtime settings migration guard",
    script: "scripts/test-driver-live-location-runtime-settings-migration-guard.mjs",
  },
  {
    label: "Vercel env drift names-only audit guard",
    script: "scripts/test-vercel-env-drift-audit-guard.mjs",
  },
  {
    label: "Driver Live Location consent runtime evidence contract guard",
    script: "scripts/test-driver-live-location-consent-runtime-evidence-contract-guard.mjs",
  },
  {
    label: "Driver Live Location Share/Stop runtime wiring guard",
    script: "scripts/test-driver-live-location-share-stop-runtime-wiring-guard.mjs",
  },
  {
    label: "Driver Live Location Share/Stop runtime scaffold alias guard",
    script: "scripts/test-driver-live-location-share-stop-runtime-scaffold-guard.mjs",
  },
  {
    label: "Driver Live Location Share/Stop staging evidence runner guard",
    script: "scripts/test-driver-live-location-share-stop-staging-evidence-runner-guard.mjs",
  },
  {
    label: "Driver Live Location disabled scaffold guard",
    script: "scripts/test-driver-live-location-disabled-scaffold-guard.mjs",
  },
  {
    label: "Driver Live Location closed-gate route smoke guard",
    script: "scripts/test-driver-live-location-closed-gate-route-smoke-guard.mjs",
  },
  {
    label: "Driver Live Location table/RLS/retention contract guard",
    script: "scripts/test-driver-live-location-table-rls-retention-contract-guard.mjs",
  },
  {
    label: "Driver Live Location table/RLS migration scaffold guard",
    script: "scripts/test-driver-live-location-table-rls-migration-scaffold-guard.mjs",
  },
  {
    label: "Driver Live Location table/RLS evidence runner guard",
    script: "scripts/test-driver-live-location-table-rls-retention-evidence-runner-guard.mjs",
  },
  {
    label: "Driver Live Location consent UI readiness contract guard",
    script: "scripts/test-driver-live-location-consent-ui-readiness-contract-guard.mjs",
  },
  {
    label: "Driver Live Location browser map key readiness contract guard",
    script: "scripts/test-driver-live-location-browser-map-key-readiness-contract-guard.mjs",
  },
  {
    label: "Driver Live Location POB auto-stop readiness contract guard",
    script: "scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs",
  },
  {
    label: "Driver Live Location stale/offline readiness contract guard",
    script: "scripts/test-driver-live-location-stale-offline-readiness-contract-guard.mjs",
  },
  {
    label: "Customer Live Location link readiness contract guard",
    script: "scripts/test-customer-live-location-link-readiness-contract-guard.mjs",
  },
  {
    label: "Customer Live Location link/map scaffold guard",
    script: "scripts/test-customer-live-location-link-map-scaffold-guard.mjs",
  },
  {
    label: "Customer Live Location map runtime guard",
    script: "scripts/test-customer-live-location-map-runtime-guard.mjs",
  },
  {
    label: "Customer Live Location app-side gate readiness guard",
    script: "scripts/test-customer-live-location-app-side-gate-readiness-guard.mjs",
  },
  {
    label: "Customer Live Location app-side runtime path test",
    script: "scripts/test-customer-live-location-app-side-runtime-path.mjs",
  },
  {
    label: "One-real-booking live-location app-side evidence runner guard",
    script: "scripts/test-one-real-booking-live-location-app-side-evidence-runner-guard.mjs",
  },
  {
    label: "Google Maps admin map evidence contract guard",
    script: "scripts/test-google-maps-admin-map-evidence-contract-guard.mjs",
  },
  {
    label: "customer driver-details link no-live guard",
    script: "scripts/test-customer-driver-details-link-no-live-guard.mjs",
  },
  {
    label: "live location no-live guard",
    script: "scripts/test-live-location-no-live-guard.mjs",
  },
  {
    label: "OTS photo proof no-live guard",
    script: "scripts/test-admin-ots-photo-proof-no-live-guard.mjs",
  },
  {
    label: "auth no-live guard",
    script: "scripts/test-customer-driver-auth-no-live-guard.mjs",
  },
  {
    label: "billing/payment no-live guard",
    script: "scripts/test-admin-billing-payment-no-live-guard.mjs",
  },
  {
    label: "admin billing/payment finance activation split approval packet guard",
    script: "scripts/test-admin-billing-payment-finance-activation-split-approval-packet.mjs",
  },
  {
    label: "admin monthly invoice PDF format approval packet guard",
    script: "scripts/test-admin-monthly-invoice-pdf-format-approval-packet.mjs",
  },
  {
    label: "admin monthly invoice PDF generation approval packet guard",
    script: "scripts/test-admin-monthly-invoice-pdf-generation-approval-packet.mjs",
  },
  {
    label: "admin monthly invoice number prefix sequence approval packet guard",
    script: "scripts/test-admin-monthly-invoice-number-prefix-sequence-approval-packet.mjs",
  },
  {
    label: "admin customer invoice prefix settings guard",
    script: "scripts/test-admin-customer-invoice-prefix-settings-guard.mjs",
  },
  {
    label: "admin Create Invoice manual bill-to guard",
    script: "scripts/test-admin-create-invoice-manual-bill-to-guard.mjs",
  },
  {
    label: "admin monthly invoice saved-prefix precedence guard",
    script: "scripts/test-admin-monthly-invoice-saved-prefix-precedence-guard.mjs",
  },
  {
    label: "admin monthly invoice sending delivery approval packet guard",
    script: "scripts/test-admin-monthly-invoice-sending-delivery-approval-packet.mjs",
  },
  {
    label: "admin monthly invoice payment links provider approval packet guard",
    script: "scripts/test-admin-monthly-invoice-payment-links-provider-approval-packet.mjs",
  },
  {
    label: "admin monthly invoice manual payment reconciliation approval packet guard",
    script: "scripts/test-admin-monthly-invoice-manual-payment-reconciliation-approval-packet.mjs",
  },
  {
    label: "admin monthly payout accounting finance export approval packet guard",
    script: "scripts/test-admin-monthly-payout-accounting-export-approval-packet.mjs",
  },
  {
    label: "customer amendment no-live guard",
    script: "scripts/test-customer-amendment-no-live-guard.mjs",
  },
  {
    label: "admin booking calendar agenda API contract guard",
    script: "scripts/test-admin-booking-calendar-agenda-api-contract.mjs",
  },
  {
    label: "admin booking Google Calendar sync API contract guard",
    script: "scripts/test-admin-booking-google-calendar-sync-api-contract.mjs",
  },
  {
    label: "calendar event lifecycle no-live guard",
    script: "scripts/test-admin-calendar-event-lifecycle-no-live-guard.mjs",
  },
  {
    label: "production hardening no-live guard",
    script: "scripts/test-admin-production-deployment-hardening-no-live-guard.mjs",
  },
  {
    label: "shim cleanup no-new-shim guard",
    script: "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
  },
];

for (const check of guardChecks) {
  console.log(`\nRunning ${check.label}: ${check.script}`);

  const result = spawnSync(process.execPath, [check.script], {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\npre-activation verification suite passed");
