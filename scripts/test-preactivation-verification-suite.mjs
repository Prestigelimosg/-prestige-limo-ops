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
    label: "Telegram provider no-send approval packet guard",
    script: "scripts/test-telegram-provider-no-send-approval-packet.mjs",
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
    label: "customer amendment no-live guard",
    script: "scripts/test-customer-amendment-no-live-guard.mjs",
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
