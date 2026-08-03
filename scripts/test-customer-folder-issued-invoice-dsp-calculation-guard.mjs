import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  normalizeCustomerInvoiceDspLineDescription,
  parseCustomerInvoiceDspLineTimeRange,
} from "../lib/customer-invoice-line-description.ts";
import { calculateDspBillableMinutes } from "../lib/hourly-billing.ts";

const guardScript =
  "scripts/test-customer-folder-issued-invoice-dsp-calculation-guard.mjs";
const [agents, invoiceFolder, ledger, suite] = await Promise.all([
  readFile("AGENTS.md", "utf8"),
  readFile(
    "app/customers/[customerId]/customer-invoice-folder-panel.tsx",
    "utf8",
  ),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

function mustInclude(source, fragment, label) {
  assert.equal(
    source.includes(fragment),
    true,
    `${label} must include ${fragment}.`,
  );
}

assert.deepEqual(
  parseCustomerInvoiceDspLineTimeRange(
    "HOURLY | 26 JUL 2026, 12:00 / 21:14 | ALPHARD | MR. JENN BIN TAN | REF 10846",
  ),
  {
    actualMinutes: 554,
    endTime: "21:14",
    startTime: "12:00",
  },
  "The owner-approved DSP description must expose its exact start/end interval.",
);

assert.deepEqual(
  parseCustomerInvoiceDspLineTimeRange(
    "HOURLY | 26 JUL 2026, 1200 TO 2114 | ALPHARD | MR. JENN BIN TAN | REF 10846",
  ),
  {
    actualMinutes: 554,
    endTime: "21:14",
    startTime: "12:00",
  },
  "The owner-approved alternate TO input must use the same DSP interval.",
);

assert.equal(
  normalizeCustomerInvoiceDspLineDescription(
    "HOURLY / DISPOSAL | 26 JUL 2026, 12:00-2114| ALPHARD / VELLFIRE | MR. JENN BIN TAN | REF 10846",
  ),
  "HOURLY | 26 JUL 2026, 1200 - 2114 | ALPHARD | MR. JENN BIN TAN | REF 10846",
  "A disputed DSP invoice line must save the full owner-approved canonical description.",
);

assert.equal(
  normalizeCustomerInvoiceDspLineDescription(
    "DSP | 26 JUL 2026, 1200 TO 2114 | AVF | MR. JENN BIN TAN | REF 10846",
  ),
  "HOURLY | 26 JUL 2026, 1200 - 2114 | ALPHARD | MR. JENN BIN TAN | REF 10846",
  "Every future booking-linked DSP invoice edit must save the same canonical layout.",
);

const jbtActualMinutes = 9 * 60 + 14;
const jbtBillableMinutes = calculateDspBillableMinutes(jbtActualMinutes);

assert.equal(jbtActualMinutes, 554, "1200 - 2114 must be 554 actual minutes.");
assert.equal(
  jbtBillableMinutes,
  540,
  "554 DSP minutes must be nine billable hours under the locked grace rule.",
);
assert.equal(
  (jbtBillableMinutes / 60) * 6500,
  58_500,
  "Nine billable hours at SGD65/hour must be SGD585.",
);

assert.deepEqual(
  parseCustomerInvoiceDspLineTimeRange(
    "HOURLY / DISPOSAL | 26 JUL 2026, 12:00-2114| ALPHARD / VELLFIRE | MR. JENN BIN TAN | REF 10846",
  ),
  {
    actualMinutes: 554,
    endTime: "21:14",
    startTime: "12:00",
  },
  "The stored JBT dispute description must expose its exact start/end interval.",
);

assert.equal(
  parseCustomerInvoiceDspLineTimeRange(
    "CITY TRANSFER | 26 JUL 2026, 12:00 | A > B | ALPHARD | REF 10846",
  ),
  null,
  "Non-DSP invoice lines must never enter the DSP calculator.",
);

for (const fragment of [
  "calculateCustomerInvoiceRateReview",
  "type CustomerInvoiceRateSetupRecord",
  "parseCustomerInvoiceDspLineTimeRange",
  "normalizeCustomerInvoiceDspLineDescription",
  "const description = isIssuedInvoiceDspLine(item)",
  'const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";',
  'const adminRateSetupApiPath = "/api/admin-rate-setup";',
  "function calculateIssuedInvoiceDspLine",
  "async function loadIssuedInvoiceDspPricing",
  "billingReview.amountCents",
  "billingReview.billableHours",
  "billingReview.rateCents",
  "data-customer-invoice-folder-edit-dsp-calculation=",
  "DSP amount recalculated from the edited start and end time.",
  "Enter the DSP time as 1200 - 2114 or 1200 TO 2114.",
]) {
  mustInclude(
    invoiceFolder,
    fragment,
    `existing Section 2 DSP calculation ${fragment}`,
  );
}

assert.ok(
  invoiceFolder.indexOf("data-customer-invoice-folder-selected-item-table=") <
    invoiceFolder.indexOf("data-customer-invoice-folder-editor="),
  "The selected-invoice table must remain above the unchanged in-place Edit lane.",
);

for (const fragment of [
  "Unified Invoice Item Description Format Repair",
  "Issued-Invoice DSP Dispute Calculation Repair",
  "Section 2",
  "HOURLY | DATE, START - END | VEHICLE | PASSENGER | REF",
  "MNG, DEP, TRF, and DSP",
  "same invoice",
  "start and end",
  "invoice layout",
  guardScript,
]) {
  mustInclude(ledger, fragment, `implementation ledger ${fragment}`);
  mustInclude(agents, fragment, `owner lock ${fragment}`);
}

mustInclude(suite, guardScript, "preactivation suite registration");

console.log("Customer-folder issued-invoice DSP calculation guard passed.");
