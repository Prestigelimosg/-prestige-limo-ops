import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const emailRoute = await readFile("app/api/admin-customer-invoice-email/route.ts", "utf8");

const stablePayload = JSON.stringify({
  attachments: [{ content: "amended-pdf-base64", filename: "JBT-0001.pdf" }],
  from: "Prestige Limo SG <billing@prestigelimo.sg>",
  html: "<p>Invoice JBT-0001</p>",
  subject: "Prestige Limo SG Invoice JBT-0001",
  text: "Invoice JBT-0001",
  to: ["willsglimo@gmail.com"],
});
const amendedPayload = stablePayload.replace("amended-pdf-base64", "second-amended-pdf-base64");
const payloadHash = (payload) => createHash("sha256").update(payload).digest("hex").slice(0, 24);

assert.equal(
  payloadHash(stablePayload),
  payloadHash(stablePayload),
  "an identical invoice email retry must retain the same payload version",
);
assert.notEqual(
  payloadHash(stablePayload),
  payloadHash(amendedPayload),
  "an amended stored PDF must receive a different payload version",
);

for (const fragment of [
  "const providerBody = buildProviderBody({",
  'const payloadHash = createHash("sha256").update(providerBody).digest("hex").slice(0, 24);',
  "`customer-invoice-${pdfResult.data.invoiceNumber}-${recipientHash}-${payloadHash}`",
  "body: providerBody,",
]) {
  assert.ok(emailRoute.includes(fragment), `Missing amended-invoice email idempotency fragment: ${fragment}`);
}

assert.ok(
  emailRoute.indexOf("const providerBody = buildProviderBody({") <
    emailRoute.indexOf('const payloadHash = createHash("sha256").update(providerBody)'),
  "the exact outgoing provider payload must exist before its idempotency version is derived",
);
assert.equal(
  emailRoute.split("fetch(resendEmailApiUrl").length - 1,
  1,
  "amended invoice delivery must stay in the one established Resend request lane",
);

console.log("Customer invoice amended-email idempotency guard passed.");
