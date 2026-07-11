import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");

for (const fragment of [
  'data-admin-dispatch-crm-identity-selectors="true"',
  'data-admin-dispatch-company-identity-select="true"',
  'data-admin-dispatch-booker-identity-select="true"',
  'data-admin-dispatch-traveler-identity-select="true"',
  "adminDispatchVerifiedBookerOptions",
  "rateCompanies",
  "rateTravelers",
]) assert.ok(app.includes(fragment), `Missing ${fragment}`);

assert.ok(app.includes("companyId: event.target.value"));
assert.ok(app.includes("bookerId: event.target.value"));
assert.ok(app.includes("travelerId: event.target.value"));
assert.ok(!/parseBookingMessageForState[\s\S]{0,1500}companyId/.test(app));

console.log("Admin Dispatch CRM identity selectors guard passed.");
