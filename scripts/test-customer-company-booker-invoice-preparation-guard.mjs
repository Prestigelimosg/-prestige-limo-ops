import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as crypto from "node:crypto";
import path from "node:path";

const folderSource = await readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8");
const persistenceSource = await readFile("lib/customer-invoice-record-persistence.ts", "utf8");

function loadFunctions(source, names, bindings = {}) {
  const ast = ts.createSourceFile("invoice-contract.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = names.map((name) => {
    const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(declaration, `Missing existing function ${name}`);
    return declaration.getText(ast);
  });
  const compiled = ts.transpileModule(`${declarations.join("\n")}\nreturn { ${names.join(",")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}

const folder = loadFunctions(folderSource, [
  "displayText", "inlineEditText", "inlineEditComparableText", "inlineEditIdentityId",
  "safePublicBookingReference", "publicBookingReferenceDisplay", "safeDispatchReference",
  "safeBookingReferenceValue", "customerWorkspaceHref", "customerFolderReviewedPricePayload",
  "customerFolderInvoiceHref", "customerFolderTravelerInvoiceGroups", "customerFolderLegacyIdentityResolution",
], { customerFolderPaidBookingReferenceParam: "paid_booking_reference", customerFolderSelectedPriceReviewsParam: "selected_booking_price_reviews" });

const job = {
  booking_reference: "ADM-20990101000001", public_booking_reference: "99001",
  customer_id: "164", company_id: 60, booker_id: 38, traveler_id: null,
  passenger_name: "Sample passenger", pickup_at: "2026-09-06T06:45:00Z", service_type: "DSP",
};
const otherJob = { ...job, booking_reference: "ADM-20990101000002", public_booking_reference: "99002", passenger_name: "Different typed passenger" };
const grouping = folder.customerFolderTravelerInvoiceGroups([job, otherJob]);
assert.equal(grouping.error, "", "Verified Company + Booker with ordinary passenger names must prepare an invoice without a Traveller ID");
assert.equal(grouping.groups.length, 1);
assert.equal(grouping.groups[0].bookerId, 38);
assert.equal(grouping.groups[0].travelerId, null);
assert.equal(grouping.groups[0].guestAccountBillingEnabled, false, "Corporate accounts must not use the Hotel bypass");
assert.equal(folder.customerFolderLegacyIdentityResolution([job], 60).error, "", "Valid account identity must not be called an incomplete Booker/Traveller pair");
const reviews = Object.fromEntries([job, otherJob].map((row) => [row.booking_reference, { status: "reviewed", amountCents: 26000 }]));
const href = folder.customerFolderInvoiceHref(job, "164", "Account", [job, otherJob], reviews);
assert.ok(href.startsWith("/customers?"));
const params = new URLSearchParams(href.split("?")[1]);
assert.equal(params.get("selected_booking_references"), `${job.booking_reference},${otherJob.booking_reference}`);
assert.equal(params.has("guest_account_billing"), false);
for (const bad of [
  { ...otherJob, booker_id: 39 }, { ...otherJob, company_id: 61 },
  { ...otherJob, customer_id: "165" }, { ...otherJob, company_id: null },
]) {
  assert.equal(folder.customerFolderInvoiceHref(job, "164", "Account", [job, bad], reviews), "", "Mixed or missing account identity must fail closed");
}
const registeredGroups = folder.customerFolderTravelerInvoiceGroups([
  { ...job, traveler_id: 70 }, { ...otherJob, traveler_id: 71 }, job,
]);
assert.equal(registeredGroups.error, "");
assert.equal(registeredGroups.groups.length, 3, "Existing registered Traveller invoice groups must stay separate");
assert.ok(folder.customerFolderTravelerInvoiceGroups([{ ...job, booker_id: null }]).error);
assert.ok(folder.customerFolderLegacyIdentityResolution([{ ...job, traveler_id: 70, booker_id: null }], 60).error);
assert.equal(folder.customerFolderTravelerInvoiceGroups([{ ...job, company_id: null, booker_id: null }], true).error, "", "Existing Hotel account lane remains separate");

const persistenceAst = ts.createSourceFile("persistence.ts", persistenceSource, ts.ScriptTarget.Latest, true);
const constantNames = ["customerInvoiceRecordVersion", "customerInvoiceRecordTableName", "safeValidationError", "safeReadError", "maxTextLength", "forbiddenCustomerInvoiceFragments"];
const constants = Object.fromEntries(constantNames.map((name) => {
  const declaration = persistenceAst.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => item.name.getText(persistenceAst) === name);
  assert.ok(declaration?.initializer);
  return [name, new Function(`return ${declaration.initializer.getText(persistenceAst)}`)()];
}));
const persistence = loadFunctions(persistenceSource, [
  "verifyIssuedInvoiceBookingOwnership", "uniqueInvoiceBookingReferences", "safeFailure",
  "positiveIdentityId", "asRecord", "asArray", "safeText", "includesForbiddenFragment", "normalizeToken",
  "safeLineItems", "safeLineItemDescription", "safeLineItemQuantity",
], constants);
const lineItem = { bookingReference: job.booking_reference, description: "HOURLY | SAMPLE PASSENGER | 99001", amountLabel: "$260.00", quantity: 1 };
const input = { bookerId: 38, travelerId: null, customerId: "164", bookingReference: job.booking_reference, guestAccountBillingEnabled: false, lineItems: [lineItem] };
function clientFor({ bookings = [job], bookers = [{ id: 38, company_id: 60, customer_id: 164 }], invoices = [], customers = [], failTable = "", writes = null } = {}) {
  const tables = { bookings, bookers, customers, customer_invoice_records: invoices };
  return { from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    let rows = tables[table];
    let single = false;
    const query = {
      select() { return query; },
      eq(key, value) { rows = rows.filter((row) => String(row[key]) === String(value)); return query; },
      is(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
      in(key, values) { rows = rows.filter((row) => values.includes(row[key])); return query; },
      like(key, value) { rows = rows.filter((row) => String(row[key]).startsWith(value.replace(/%$/, ""))); return query; },
      order() { return query; },
      limit(count) { rows = rows.slice(0, count); return query; },
      insert(payload) {
        assert.equal(table, "customer_invoice_records");
        assert.ok(writes, "Ownership-only tests must never write");
        writes.push(payload);
        const row = { ...payload, id: "isolated-invoice", created_at: new Date().toISOString() };
        invoices.push(row);
        rows = [row];
        return query;
      },
      single() { single = true; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) { return Promise.resolve({ data: single ? rows[0] ?? null : rows, count: rows.length, error: failTable === table ? { message: "fixture read failed" } : null }).then(resolve, reject); },
    };
    return query;
  } };
}
const verify = (changes = {}, data = {}) => persistence.verifyIssuedInvoiceBookingOwnership({ ...input, ...changes }, clientFor(data));
assert.equal((await verify()).ok, true, "The real issue verifier must accept the exact Company + Booker account without a Traveller ID");
for (const data of [
  { bookers: [] }, { bookers: [{ id: 38, company_id: 61, customer_id: 164 }] },
  { bookers: [{ id: 38, company_id: 60, customer_id: 165 }] },
  { bookings: [{ ...job, booker_id: 39 }] }, { bookings: [{ ...job, customer_id: "165" }] },
  { bookings: [{ ...job, traveler_id: 70 }] }, { failTable: "bookers" }, { failTable: "bookings" },
]) assert.equal((await verify({}, data)).ok, false, "Wrong, missing or unavailable account ownership must remain blocked");
assert.equal((await verify({ bookerId: null })).ok, false);
assert.equal((await verify({ bookerId: null, travelerId: 70 })).ok, false);
assert.equal((await verify({ travelerId: 70 }, { bookings: [{ ...job, traveler_id: 70 }] })).ok, true, "Registered Traveller ownership must still work");
assert.equal((await verify({}, { invoices: [{ customer_id: "164", reference: job.booking_reference, document_type: "invoice", document_state: "issued" }] })).status, 409);
assert.equal((await verify({}, { invoices: [{ customer_id: "164", reference: "another", line_items: [lineItem], document_type: "invoice", document_state: "issued" }] })).status, 409);
assert.equal((await verify({}, { invoices: [{ customer_id: "164", reference: job.booking_reference, document_type: "quotation", document_state: "issued" }] })).ok, true);
assert.equal((await verify({}, { failTable: "customer_invoice_records" })).status, 503);
assert.equal((await verify({ bookerId: null, guestAccountBillingEnabled: true }, { customers: [{ id: 164, customer_type: "hotel" }] })).ok, true);
assert.equal((await verify({ bookerId: null, guestAccountBillingEnabled: true })).ok, false, "Corporate accounts cannot opt into Hotel billing");

// Execute the real sanitizer, issue writer and PDF renderer with an in-memory database.
// Dependency boundaries supply configuration/profile only; no network or real invoice write can run.
function loadModule(source, dependencies = {}) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unconfigured dependency ${name}`);
    return dependencies[name];
  }, module.exports, module);
  return module.exports;
}
const profile = loadModule(await readFile("lib/company-profile-shared.ts", "utf8"));
const pdf = loadModule(await readFile("lib/customer-local-invoices.ts", "utf8"), { "./company-profile-shared": profile });
const recordModule = loadModule(persistenceSource, {
  "server-only": {}, "node:crypto": crypto, "node:path": path, "node:fs/promises": { readFile },
  "@supabase/supabase-js": { createClient() { throw new Error("Network clients are forbidden in this guard"); } },
  "./admin-booking-supabase-adapter": {
    checkAdminBookingPersistenceStagingConfigReadiness: () => ({ ok: true }),
    checkCustomerBookingRequestPersistenceConfigReadiness: () => ({ ok: true }),
  },
  "./company-profile-shared": profile,
  "./company-profile-persistence": { loadPublicCompanyProfile: async () => ({ profile: profile.defaultCompanyProfile }) },
  "./customer-local-invoices": pdf,
  "./admin-driver-job-dsp-actual-time-read": {}, "./customer-invoice-line-description": {},
  "./customer-portal-access-account": {
    assertActiveCustomerPortalAccessAccount: async (reference) => ({ ok: true, data: { booker_id: reference === "verified-pa" ? 38 : 39 } }),
  },
});
const writes = [];
const invoices = [];
const client = clientFor({ writes, invoices });
const issueInput = { ...input, amountCents: 26000, customerName: "LOCAL ACCOUNT", dueDateIso: "2026-09-30", reference: job.booking_reference, route: "PICKUP > DROPOFF", service: "DSP", status: "Unpaid", documentType: "invoice", documentState: "issued" };
const actor = { source_surface: "admin_api", actor_role: "admin", actor_label: "Local guard" };
const issued = await recordModule.createCustomerInvoiceRecord(issueInput, actor, client);
assert.equal(issued.ok, true, JSON.stringify(issued));
assert.equal(writes.length, 1);
assert.equal(writes[0].booker_id, 38);
assert.equal(writes[0].traveler_id, null);
assert.equal(writes[0].customer_id, "164");
assert.equal(writes[0].status, "Unpaid");
assert.equal(writes[0].email_delivery_status, "not_sent");
assert.match(writes[0].invoice_number, /^INV-\d{8}-\d{4}$/, "Reuse the established standard invoice numbering path");
assert.ok(Buffer.from(writes[0].pdf_base64, "base64").toString("latin1").startsWith("%PDF-"), "Real stored PDF must be generated");
assert.equal((await recordModule.createCustomerInvoiceRecord(issueInput, actor, client)).status, 409);
assert.equal(writes.length, 1, "Duplicate issue must not add another record");
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal({ customer_account_reference: "verified-pa" }, client)).data.length, 1);
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal({ customer_account_reference: "other-pa" }, client)).data.length, 0, "Account-only invoices remain private to the verified Booker");
const travelerWrites = [];
const travelerClient = clientFor({ bookings: [{ ...job, traveler_id: 70 }], writes: travelerWrites });
let reservations = 0;
travelerClient.rpc = async (name, parameters) => {
  assert.equal(name, "reserve_customer_invoice_number");
  assert.equal(parameters.p_booker_id, 38);
  assert.equal(parameters.p_traveler_id, 70);
  reservations += 1;
  return { data: [{ invoice_number: "LOCAL-0001" }], error: null };
};
const travelerIssued = await recordModule.createCustomerInvoiceRecord({ ...issueInput, travelerId: 70 }, actor, travelerClient);
assert.equal(travelerIssued.ok, true);
assert.equal(reservations, 1, "Registered Traveller invoices must retain their existing prefix reservation");
assert.equal(travelerWrites[0].invoice_number, "LOCAL-0001");
assert.equal(travelerWrites[0].traveler_id, 70);
console.log("Company + Booker invoice preparation guard passed.");
