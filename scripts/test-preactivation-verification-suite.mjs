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
