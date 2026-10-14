import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Actual chooser JSX and actual handlers, with in-memory identity records only.
// No server, credentials, booking persistence or provider requests.
globalThis.fetch = () => { throw new Error("Network forbidden in chooser explanation guard"); };
const source = fs.readFileSync("app/page.tsx", "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map(), declarations = new Map();
let chooser, clearButton, newBookingButton;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(tree));
  if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(tree), node.getText(tree));
  if (ts.isJsxElement(node)) {
    const attributes = node.openingElement.attributes.getText(tree);
    if (attributes.includes('data-admin-dispatch-crm-identity-selectors="true"')) {
      assert.equal(chooser, undefined, "Keep one existing identity sector");
      chooser = node.getText(tree);
    }
    if (attributes.includes('data-admin-mobile-booking-details-clear="true"')) clearButton = node.getText(tree);
    if (attributes.includes('onClick={() => resetAdminBookingDraft("message")}')) newBookingButton = node.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(chooser && clearButton && newBookingButton);
const compile = (text) => ts.transpileModule(text, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
} }).outputText;
const evaluate = (text, env) => new Function("React", "env", `with(env){${compile(text)}}`)(React, env);
function elements(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap((child) => elements(child, predicate))];
}
const find = (node, key) => elements(node, (element) => key in element.props);
const account = { key: "corporate:1:2", kind: "corporate", companyId: "1", bookerId: "2", customerId: "3", companyName: "Example", bookerName: "Nicole", label: "Example (Nicole)", secondaryLabel: "Company + Booker" };
function fixture(reference = "SAVED-A") {
  const calls = [];
  const env = {
    clean: (v) => typeof v === "string" ? v.trim() : "",
    booking: { companyId: "1", bookerId: "2", customerId: "3", travelerId: "", name: "Passenger", company: "Example", booker: "Nicole" },
    appliedAdminBookingSnapshotReference: reference,
    adminDispatchSelectedCustomerAccountName: account.label,
    adminDispatchSelectedCustomerAccount: account,
    adminDispatchFilteredCustomerAccountOptions: [account],
    adminDispatchCustomerAccountSearch: "",
    adminDispatchNewCustomerType: null,
    adminDispatchAgencyFoldersError: "",
    adminDispatchSelectedAgencyFolder: null,
    adminDispatchCreatingAgencyFolder: false,
    activeAdminEmailAiIntakeId: "",
    adminEmailAiCustomerProfileSuggestion: null,
    adminDispatchCustomerListAutoLoadAttemptedRef: { current: false },
    adminDispatchCustomerAccountChooserRef: { current: { open: true } },
    adminDispatchVerifiedIdentityId: (v) => /^\d+$/.test(v),
    loadSaveCrmBookerById: async (...args) => { calls.push(args); return { customer_id: 3 }; },
    createInitialBooking: () => ({ companyId: "", bookerId: "", customerId: "", travelerId: "" }),
    clearBookingMessageInput: () => calls.push("clear-local-input"),
    setMessage: () => { throw new Error("Unexpected account verification failure"); },
  };
  for (const name of ["customerCopyRequestRef", "driverJobLinkFormContextRevisionRef", "adminEmailAiCustomerRecommendationRevisionRef"]) env[name] = { current: 0 };
  for (const name of ["updateCalReturnBookingReferenceRef", "pendingSaveCrmBillingIdentityIntentRef", "loadedBookingIdRef", "appliedAdminBookingSnapshotReferenceRef", "adminBookingCreateIntentRef", "loadedAdminBookingBaselineRef", "driverJobLinkHandoffFocusAppliedRef", "activeAdminEmailAiIntakeIdRef", "bookingFormRef"]) env[name] = { current: null };
  for (const key of ["booking", "customerCopyButtonFeedback", "saveCrmBillingIdentityConfirmation", "loadedBookingId", "appliedAdminBookingSnapshotReference", "adminBookingCrossDeviceConflict", "driverJobLinkHandoffReference", "driverJobLinkCopyMessage", "dispatchLoadFocusTarget", "adminDispatchCustomerAccountSearch", "adminDispatchNewCustomerType", "activeAdminEmailAiIntakeId", "adminEmailAiCustomerProfileSuggestion", "mobileDispatchBookingStep"]) {
    env[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => { env[key] = typeof value === "function" ? value(env[key]) : value; };
  }
  for (const name of ["applyAdminDispatchCustomerAccount", "selectAdminDispatchCustomerAccount", "chooseAdminDispatchNewCustomerType", "clearLoadedBookingSelectionContext", "resetAdminBookingDraft"]) {
    env[name] = evaluate(`${functions.get(name)}; return ${name};`, env);
  }
  function render(fragment = chooser) {
    env.adminDispatchCustomerAccountSelectionLocked = evaluate(`const ${declarations.get("adminDispatchCustomerAccountSelectionLocked")}; return adminDispatchCustomerAccountSelectionLocked;`, env);
    return evaluate(`return (${fragment});`, env);
  }
  return { env, calls, render, html: () => renderToStaticMarkup(render()) };
}

const saved = fixture();
let node = saved.render();
assert.equal(find(node, "data-admin-dispatch-customer-account-option")[0].props.disabled, true);
assert.equal(find(node, "data-admin-dispatch-customer-account-create")[0].props.disabled, true);
find(node, "data-admin-dispatch-customer-account-search")[0].props.onChange({ target: { value: "Nic" } });
assert.equal(saved.env.adminDispatchCustomerAccountSearch, "Nic", "Search stays usable");
const identityBefore = JSON.stringify(saved.env.booking);
await saved.env.selectAdminDispatchCustomerAccount({ ...account, companyId: "9", bookerId: "8" });
saved.env.chooseAdminDispatchNewCustomerType("corporate");
assert.equal(JSON.stringify(saved.env.booking), identityBefore, "Locked handlers must not reassign identity");
assert.equal(saved.calls.length, 0, "Locked actions must not even load a different Booker");
console.log("Existing saved-booking search/disabled-selection sequence reproduced; ownership unchanged.");
let html = saved.html();
assert.match(html, /data-admin-dispatch-customer-account-locked="true"/, "Saved-booking chooser needs a visible Locked explanation");
assert.match(html, />Locked</);
assert.match(html, /Company \+ Booker locked/);
assert.match(html, /Tap Clear/);
assert.match(html, /Use New booking/);
assert.match(html, /Unsaved changes clear; saved booking stays\./);
const summary = elements(saved.render(), (el) => el.type === "summary")[0];
assert.equal(summary.props["aria-describedby"], "admin-dispatch-customer-account-help", "Explain lock to assistive technology");

saved.env.adminDispatchFilteredCustomerAccountOptions = [];
const empty = find(saved.render(), "data-admin-dispatch-customer-account-empty")[0];
assert.doesNotMatch(renderToStaticMarkup(empty), /Use Create New Customer/, "Do not recommend a disabled action");
assert.match(renderToStaticMarkup(empty), /selection is locked/i);

for (const [action, step] of [[clearButton, "details"], [newBookingButton, "message"]]) {
  const current = fixture();
  current.render();
  current.render(action).props.onClick();
  assert.equal(current.env.appliedAdminBookingSnapshotReference, "");
  assert.equal(current.env.adminBookingCreateIntentRef.current, true);
  assert.equal(current.env.mobileDispatchBookingStep, step);
  assert.equal(current.env.booking.companyId, "");
  assert.equal(current.env.booking.bookerId, "");
  html = current.html();
  assert.doesNotMatch(html, /data-admin-dispatch-customer-account-locked/);
  assert.match(html, /Search uses stored account/);
  assert.equal(find(current.render(), "data-admin-dispatch-customer-account-option")[0].props.disabled, false);
  await find(current.render(), "data-admin-dispatch-customer-account-option")[0].props.onClick();
  assert.equal(current.env.booking.companyId, "1");
  assert.equal(current.env.booking.bookerId, "2");
  assert.equal(current.env.booking.customerId, "3");
  assert.deepEqual(current.calls, ["clear-local-input", [1, 2]], "Clear/new selection only changes form and uses existing verified Booker read");
  current.env.appliedAdminBookingSnapshotReference = "SAVED-B";
  assert.match(current.html(), /data-admin-dispatch-customer-account-locked/, "Another loaded saved booking locks again");
}
const fresh = fixture("");
fresh.env.adminDispatchFilteredCustomerAccountOptions = [];
assert.match(fresh.html(), /Use Create New Customer only after review/);
assert.doesNotMatch(fresh.html(), /data-admin-dispatch-customer-account-locked/);

// Freeze the existing lock, selection and reset implementation for this text-only repair.
const baseline = {
  "clearLoadedBookingSelectionContext": "82155bcf86a192a28392ca9d427496bf42403dfeadbf9794c84030051fe12fb8",
  "resetAdminBookingDraft": "c9d472dfef24bb68167ccde3ed1c145691035706b6fcc8f44244b1ca97fa32e1",
  "adminDispatchCustomerAccountSelectionLocked": "2bc76fd75c60e228f5a328353b17050331a6e742e6bf3744144a1d934447b215",
  "applyAdminDispatchCustomerAccount": "e7eaeb786abc37425592f2558dcb26c6fccc9bdf50f2c6b76f077d8a77c573ac",
  "selectAdminDispatchCustomerAccount": "22ddc0eda67d2257e79c4f111b595854ef29203afec7e127b403607bf3c8dce7",
  "chooseAdminDispatchNewCustomerType": "8a101b18f9567a3bff48462123fd412180b2267e1452f885173d1bbb7fe47783"
};
for (const [name, expected] of Object.entries(baseline)) {
  const text = functions.get(name) ?? declarations.get(name);
  assert.equal(createHash("sha256").update(text).digest("hex"), expected, `${name} must stay unchanged`);
}
console.log("Customer Account lock explanation: saved/new/clear/search/selection/no-write and unchanged ownership guards passed.");
