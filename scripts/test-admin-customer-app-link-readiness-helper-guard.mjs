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
for (const fragment of [
  "const customerDriverDetailsPortalLinkCopyReady =",
  'clean(customerCopyText).startsWith("CUSTOMER BOOKING DETAILS")',
  "if (!customerDriverDetailsPortalLinkCopyReady)",
  "!customerDriverDetailsPortalLinkCopyReady ||",
]) {
  assert.equal(
    appPage.includes(fragment),
    true,
    `Customer app-link readiness must include ${fragment}`,
  );
}

console.log("Admin customer app-link readiness helper guard passed");
