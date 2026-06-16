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
    label: "company/traveler identity read lock guard",
    script: "scripts/test-company-traveler-identity-read-lock.mjs",
  },
  {
    label: "company/traveler CRM write split plan guard",
    script: "scripts/test-company-traveler-crm-write-split-plan.mjs",
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
    label: "Customer Copy multi-channel guard",
    script: "scripts/test-customer-copy-multi-channel-no-live-guard.mjs",
  },
  {
    label: "Email no-live guard",
    script: "scripts/test-email-no-live-guard.mjs",
  },
  {
    label: "WhatsApp no-live guard",
    script: "scripts/test-whatsapp-customer-driver-details-no-live-guard.mjs",
  },
  {
    label: "SMS no-live guard",
    script: "scripts/test-sms-customer-driver-details-no-live-guard.mjs",
  },
  {
    label: "Telegram no-live guard",
    script: "scripts/test-telegram-internal-admin-alert-no-live-guard.mjs",
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
