import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPage = await readFile("app/page.tsx", "utf8");

assert.equal(
  appPage.includes("const customerLiveLocationHelperText = customerDriverDetailsPortalAccountReference"),
  true,
  "Customer app-link helper must check the saved customer account.",
);
assert.equal(
  appPage.includes('"Save + CRM or load the saved booking first."'),
  true,
  "Missing-account helper must explain the short safe next step.",
);
assert.equal(
  appPage.includes("{customerLiveLocationHelperText}"),
  true,
  "Customer Copy must render the account-aware helper.",
);

console.log("Admin customer app-link readiness helper guard passed");
