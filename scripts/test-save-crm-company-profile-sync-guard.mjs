import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const [appSource, calendarSyncSource, ledger] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("lib/admin-booking-google-calendar-sync.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);
const bookingUiBrowserSource = await readFile("scripts/test-booking-ui-browser.mjs", "utf8");

for (const fragment of [
  "type AdminCompanyCrmIdentityRecord",
  "function buildSaveCrmCompanyProfileContactPayload",
  "async function loadSaveCrmCompanyProfileForSave",
  "async function loadSaveCrmCompanyProfileCandidateByOperationsEmail",
  "async function saveCrmCompanyProfileForBooking",
  "async function resolveSaveCrmCompanyProfileForSave",
  "saveCrmDefaultCustomerAccount(booking)",
  "const companyProfileSyncRequired = Boolean(",
  "saveCrmExplicitCompanyAccount(booking)",
  "primary_contact_name: clean(bookingValue.booker)",
  "mobile_phone: clean(bookingValue.bookerContact)",
  "operations_email: clean(bookingValue.bookerEmail).toLowerCase()",
  "company_id: adminDispatchVerifiedIdentityId(bookingValue.companyId)",
  "customer_id: adminDispatchVerifiedIdentityId(bookingValue.customerId)",
  'data-admin-dispatch-customer-account-select="true"',
  'onClick={() => chooseAdminDispatchNewCustomerType("corporate")}',
  'data-admin-dispatch-agency-folder-create="true"',
  "New Company + Booker selected",
  "adminDispatchIsCreatingAgencyFolder(booking)",
  "hotel_agency_folder_create",
  "Each booking keeps its own passenger name.",
  "customer_folder_active",
  "verified_company_id",
  "companyId: String(companyProfileResolution.companyId)",
  "companyProfileResolution?.companyName || saveCrmCustomerAccountLabel",
]) {
  assert.ok(appSource.includes(fragment), `Missing Save + CRM company profile sync fragment: ${fragment}`);
}

const saveCrmSyncSection = appSource.slice(
  appSource.indexOf("function buildSaveCrmCompanyProfileContactPayload"),
  appSource.indexOf("function isCustomerRatesRuntimeWriteBlockedNoOp"),
);

for (const forbiddenField of [
  "accounts_email:",
  "billing_email:",
  "customer_rates:",
  "driver_payout_rules:",
  "main_phone:",
]) {
  assert.equal(
    saveCrmSyncSection.includes(forbiddenField),
    false,
    `Save + CRM company profile sync must not write ${forbiddenField}`,
  );
}

assert.match(
  saveCrmSyncSection,
  /existingValue && incomingValue && existingValue !== incomingValue/,
  "existing different company profile values must be detected before an overwrite",
);
assert.match(
  saveCrmSyncSection,
  /window\.confirm\(/,
  "new profile links, creates, or conflicting profile updates must require Admin confirmation",
);
for (const disclosure of [
  `Create and link the new CRM company profile "${"${requestedCompanyName}"}" using this booking's Booker contact? This does not create an invoice, change rates, or send a message. Saving a complete booking also syncs it to the existing private Operations Calendar with no attendees or guest email (sendUpdates=none).`,
  `Approve this Company + Booker Customer Account? Company: ${"${companyName}"}. Booker: ${"${bookerName}"}. This creates the account only after your approval. It does not create an invoice, send a message, or change driver or payment. Saving a complete booking also syncs it to the existing private Operations Calendar with no attendees or guest email (sendUpdates=none).`,
]) {
  assert.ok(
    appSource.includes(disclosure),
    `Save + CRM confirmation must disclose the established private Operations Calendar handoff: ${disclosure}`,
  );
}
assert.ok(
  appSource.includes("const calendarSyncResult = await autoSyncSavedBookingGoogleCalendar(savedBooking);"),
  "Save + CRM must retain its established Operations Calendar handoff",
);
assert.ok(
  calendarSyncSource.includes('send_updates: "none"'),
  "The disclosed Operations Calendar handoff must retain sendUpdates=none",
);
assert.equal(
  /attendees\s*:/.test(calendarSyncSource),
  false,
  "The disclosed Operations Calendar handoff must not add attendees",
);
assert.match(
  saveCrmSyncSection,
  /status !== "saved"/,
  "Save + CRM must fail closed when the guarded profile writer returns a blocked no-op",
);

const saveBookingSection = appSource.slice(
  appSource.indexOf("async function saveBooking("),
  appSource.indexOf("function bookingRecordReferenceCandidates"),
);

assert.ok(
  saveBookingSection.includes("resolveSaveCrmCompanyProfileForSave("),
  "Save + CRM must resolve the exact company profile before booking persistence",
);
assert.ok(
  saveBookingSection.includes(
    "resolveSaveCrmCompanyProfileForSave(\n            booking,\n            saveCrmExplicitCompanyAccount(booking),",
  ),
  "Save + CRM company profile lookup must use the base company field, never the passenger-scoped billing label.",
);
assert.ok(
  saveCrmSyncSection.includes(
    "Select it under Verified company, then Save + CRM again. No booking was saved.",
  ),
  "A matching operations email must block duplicate company creation and require explicit verified CRM selection.",
);
assert.ok(
  saveCrmSyncSection.includes(
    "matches this Company / Account. Select it under Verified company",
  ),
  "An unselected exact-name company match must also block and require explicit verified CRM selection.",
);
assert.ok(
  saveBookingSection.indexOf("resolveSaveCrmCompanyProfileForSave(") <
    saveBookingSection.indexOf('fetch("/api/admin-bookings"'),
  "company profile resolution must finish before a booking write begins",
);
assert.equal(
  saveBookingSection.includes("adminCompanyProfileApiPath"),
  false,
  "Save + CRM must not modify Prestige's own Company Settings lane",
);
assert.ok(
  ledger.includes("### GroundBooker Canonical Company And Agency Account Reuse Repair (2026-08-05)"),
  "the implementation ledger must record the exact GroundBooker duplicate-prevention repair",
);
assert.ok(
  ledger.includes("### Save + CRM Company Contact And Invoice Email Meaning Repair (2026-08-02)"),
  "the implementation ledger must record this exact Save + CRM repair",
);
assert.ok(
  ledger.includes("Booker email as `operations_email`"),
  "the ledger must preserve the approved operations-email meaning",
);
assert.ok(
  ledger.includes("### Save + CRM Operations Calendar Confirmation Disclosure Repair (2026-08-23)"),
  "the implementation ledger must record the exact Save + CRM Operations Calendar disclosure repair",
);
for (const fragment of [
  "__prestigeCrmCompanyIdentityRequests",
  "__prestigeCrmCompanyWriteRequests",
  "Create and link the new CRM company profile",
  'operations_email: "browserui@example.com"',
  "Expected Save + CRM to write only the approved base company name and Booker contact fields",
  "future Company + Booker-only new-customer choice",
  "New Company + Booker selected",
  "future Company + Booker light-mode UI",
  "Expected the future Company + Booker mode to keep one unified customer choice",
  'assert.equal(futureCompanyBookerUi.company, "BROWSER UI TEST COMPANY")',
  'assert.equal(futureCompanyBookerUi.booker, "BROWSER UI TEST BOOKER")',
  'assert.equal(futureCompanyBookerUi.passenger, "BROWSER UI TEST TRAVELER")',
  "Expected a future booking without Company + Booker to fail before booking, CRM, or Calendar writes",
]) {
  assert.ok(
    bookingUiBrowserSource.includes(fragment),
    `Missing visible browser Save + CRM profile sync coverage: ${fragment}`,
  );
}

console.log("Save + CRM company profile contact sync guard passed.");

// Execute the real company and Booker resolvers without network or database writes.
// A new Booker under an existing company must never enter company contact sync.
const resolverAst = ts.createSourceFile("page.tsx", appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const resolverNames = ["resolveSaveCrmCompanyProfileForSave", "resolveSaveCrmCorporateIdentityForSave"];
const resolverCode = resolverNames.map((name) => {
  const declaration = resolverAst.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(declaration, `Missing ${name}`);
  return declaration.getText(resolverAst);
}).join("\n");
let company = { id: 42, company_name: "KKR", primary_contact_name: "Kelly" };
let approve = true;
let existingBooker = null;
const calls = [];
const bindings = {
  clean: (value) => String(value ?? "").trim(),
  adminDispatchVerifiedIdentityId: (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null,
  adminDispatchIsCreatingAgencyFolder: () => false,
  loadSaveCrmCompanyProfileForSave: async () => company,
  loadSaveCrmCompanyProfileCandidateByOperationsEmail: async () => null,
  saveCrmCompanyProfileForBooking: async (payload) => { calls.push(["company-write", payload]); return { id: 43, company_name: payload.company_name }; },
  buildSaveCrmCompanyProfileContactPayload: () => { calls.push(["contact-payload"]); return { company_name: "New Company" }; },
  saveCrmCompanyProfileConflictFields: () => [],
  saveCrmCompanyProfileNeedsWrite: () => false,
  window: { confirm: (message) => { calls.push(["confirm", message]); return approve; } },
  loadSaveCrmBookerById: async () => { throw new Error("Unexpected stale Booker ID"); },
  findOrCreateSaveCrmBooker: async (companyId, booking, create) => {
    calls.push(["booker", companyId, booking.booker, create]);
    return create ? { id: 81, company_id: companyId } : existingBooker;
  },
  loadSaveCrmCorporateIdentityRows: async () => [],
};
const compiledResolvers = ts.transpileModule(`${resolverCode}\nreturn { ${resolverNames.join(",")} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const resolvers = new Function(...Object.keys(bindings), compiledResolvers)(...Object.values(bindings));
const draft = { company: "KKR ", companyId: "", booker: "Connie", bookerId: "", customerId: "", travelerId: "", name: "John Pattar" };
const reusedCompany = await resolvers.resolveSaveCrmCompanyProfileForSave(draft, "KKR", true);
assert.deepEqual(reusedCompany, { companyId: 42, companyName: "KKR", ok: true, profileWritePerformed: false });
assert.deepEqual(calls, [], "Company reuse must perform no contact update or extra confirmation");
assert.equal(company.primary_contact_name, "Kelly");
const newAccount = await resolvers.resolveSaveCrmCorporateIdentityForSave(draft, reusedCompany.companyId, reusedCompany.companyName);
assert.equal(newAccount.ok, true);
assert.equal(newAccount.bookerId, 81);
assert.equal(newAccount.companyId, 42);
assert.equal(newAccount.travelerId, null);
assert.equal(newAccount.accountCreationApproved, true);
assert.deepEqual(calls.filter(([kind]) => kind === "booker"), [["booker", 42, "Connie", false], ["booker", 42, "Connie", true]]);
assert.equal(calls.filter(([kind]) => kind === "confirm").length, 1);
calls.length = 0;
approve = false;
assert.equal((await resolvers.resolveSaveCrmCorporateIdentityForSave(draft, 42, "KKR")).ok, false);
assert.ok(!calls.some(([kind, , , create]) => kind === "booker" && create), "Cancel must not create a Booker");
calls.length = 0;
existingBooker = { id: 80, company_id: 42, customer_id: 700 };
assert.equal((await resolvers.resolveSaveCrmCorporateIdentityForSave(draft, 42, "KKR")).ok, false);
assert.deepEqual(calls, [["booker", 42, "Connie", false]], "Existing Booker must require exact account selection, not name-based reuse");
calls.length = 0;
assert.equal((await resolvers.resolveSaveCrmCompanyProfileForSave(draft, "KKR")).ok, false, "Reuse must require explicit new-customer intent");
assert.equal((await resolvers.resolveSaveCrmCompanyProfileForSave({ ...draft, customerId: "700" }, "KKR", true)).ok, false, "Stale customer identity must remain blocked");
assert.deepEqual(await resolvers.resolveSaveCrmCompanyProfileForSave({ ...draft, companyId: "42" }, "KKR", true), reusedCompany, "Retry must preserve shared company contacts too");
company = { id: null, company_name: "KKR" };
await assert.rejects(() => resolvers.resolveSaveCrmCompanyProfileForSave(draft, "KKR", true), /incomplete/);
company = null;
approve = true;
calls.length = 0;
assert.equal((await resolvers.resolveSaveCrmCompanyProfileForSave({ ...draft, company: "New Company" }, "New Company", true)).companyId, 43);
assert.equal(calls.filter(([kind]) => kind === "company-write").length, 1, "The existing genuinely-new-company path must remain usable");
assert.equal(calls.find(([kind]) => kind === "company-write")[1].action_type, "company_create");
console.log("Existing-company new-Booker isolation, cancellation, duplicate and retry checks passed.");

const bookerHelperNames = ["findOrCreateSaveCrmBooker", "saveCrmValidatedBookerRecord", "saveCrmComparableIdentityValue"];
const helperCode = bookerHelperNames.map(name => resolverAst.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name).getText(resolverAst)).join("\n");
const lookupMethods = [];
const existingRecord = { id: 80, company_id: 42, booker_name: "Connie", email: null, phone: null };
const helperBindings = {
  clean: bindings.clean,
  adminDispatchVerifiedIdentityId: bindings.adminDispatchVerifiedIdentityId,
  adminBookersApiPath: "/api/admin-bookers",
  adminLegacyDataPurpose: "admin-legacy-data",
  fetch: async (_url, options) => {
    lookupMethods.push(options.method);
    return { ok: true, json: async () => ({ ok: true, booker: existingRecord }) };
  },
};
const helperJs = ts.transpileModule(`${helperCode}\nreturn findOrCreateSaveCrmBooker;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const lookupBooker = new Function(...Object.keys(helperBindings), helperJs)(...Object.values(helperBindings));
const contactDraft = { ...draft, bookerEmail: "connie@example.invalid", bookerContact: "90000000" };
assert.equal((await lookupBooker(42, contactDraft, false, true)).id, 80);
assert.deepEqual(lookupMethods, ["GET"], "New-customer duplicate lookup must not fill another account's blank contacts");
lookupMethods.length = 0;
await assert.rejects(() => lookupBooker(42, contactDraft, true), /appeared before/);
assert.deepEqual(lookupMethods, ["GET"], "A Booker appearing after approval must still stop creation");
lookupMethods.length = 0;
await lookupBooker(42, contactDraft, false);
assert.deepEqual(lookupMethods, ["GET", "PATCH"], "Keep the pre-existing contact-completion behavior outside new-customer setup");
assert.match(saveBookingSection, /companyProfileResolution\.companyName,\s+adminDispatchNewCustomerType === "corporate",/, "Only the established new-customer save passes read-only duplicate intent");
console.log("New-customer duplicate contact protection and unchanged legacy contact lookup passed.");
