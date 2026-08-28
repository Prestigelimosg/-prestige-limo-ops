import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertNotIncludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

const adminPage = read("app/page.tsx");
const invoiceSettingsPage = read("app/settings/invoice/page.tsx");
const ledger = read("docs/current-implementation-ledger.md");
const preactivationSuite = read("scripts/test-preactivation-verification-suite.mjs");

assertIncludes(
  adminPage,
  'import { usePathname } from "next/navigation";',
  "Root admin app must use the supported pathname boundary for its direct-link route.",
);
assertIncludes(
  adminPage,
  'export default function Home()',
  "Root admin route must not accept unsupported custom page props.",
);
assertIncludes(
  adminPage,
  'const initialTab: AppTab = usePathname() === "/settings/invoice" ? "company" : "dashboard";',
  "Invoice settings must open Company while normal visits open Dashboard.",
);
assertIncludes(
  adminPage,
  'useState<AppTab>(initialTab)',
  "Root admin app must initialize active tab from the direct-link route.",
);
assertIncludes(
  adminPage,
  'if (activeTab === "company" && !companyProfileLoaded && companyProfileAction === "idle")',
  "Direct Company tab open must auto-load company invoice settings.",
);

assertIncludes(
  invoiceSettingsPage,
  'import Home from "../../page";',
  "Invoice settings direct route must reuse the existing admin app.",
);
assertIncludes(
  invoiceSettingsPage,
  'title: "Invoice Settings | Prestige Limo Ops"',
  "Invoice settings route must have a clear title.",
);
assertIncludes(
  invoiceSettingsPage,
  '<Home />',
  "Invoice settings route must open the existing Company tab directly.",
);
assertNotIncludes(
  invoiceSettingsPage,
  "initialTab=",
  "Invoice settings route must not pass unsupported custom props to a Next.js page.",
);

for (const forbidden of [
  "new Stripe",
  "checkout.sessions",
  "paymentIntent",
  "paymentLink",
  "new Resend",
  "sendMail",
  "SUPABASE_SERVICE_ROLE_KEY",
  "createClient",
  "driver payout",
  "PayNow payout",
  "internal admin notes",
]) {
  assertNotIncludes(
    invoiceSettingsPage,
    forbidden,
    `Invoice settings direct route must not add provider/db/internal behavior: ${forbidden}`,
  );
}

assertIncludes(
  ledger,
  "`/settings/invoice` opens the existing admin Company settings tab directly for invoice-facing logo, company contact, bank/payment instructions, Stripe card option/card fee wording, and invoice footer terms.",
  "Ledger must record the direct invoice settings link.",
);
assertIncludes(
  preactivationSuite,
  "scripts/test-invoice-settings-direct-link-guard.mjs",
  "Preactivation suite must register the invoice settings direct-link guard.",
);

console.log("invoice settings direct link guard passed");
