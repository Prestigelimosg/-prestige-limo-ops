import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Execute the actual recipient selector and render the existing button only.
// No app server, credentials, database or provider access.
globalThis.fetch = () => { throw new Error("Network is forbidden in this display guard"); };
const source = fs.readFileSync("app/page.tsx", "utf8");
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
let button;
function visit(node) {
  if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(tree), node.getText(tree));
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "button" &&
      node.openingElement.attributes.getText(tree).includes('data-admin-customer-driver-details-email-disabled-send-action="true"')) {
    assert.equal(button, undefined, "Keep one existing Email button");
    button = node.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(button, "Existing Email button must remain");
const compile = (text) => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
}).outputText;
const selectorName = "adminCustomerDriverDetailsEmailRecipientDisplay";
const record = (reference, email, bookerEmail = "") => ({ booking_reference: reference, contact_email: email, bookers: { email: bookerEmail } });
function render(overrides = {}) {
  const env = {
    clean: (value) => typeof value === "string" ? value.trim() : "",
    adminCustomerDriverDetailsEmailReviewBookingReference: "TEST-A",
    adminCustomerDriverDetailsEmailReviewCustomerEmail: "booker@example.test",
    appliedAdminBookingSnapshot: null,
    dispatchReleaseLoadedBookingRecord: record("TEST-A", "booker@example.test"),
    customerDriverDetailsPortalLastSavedRecord: null,
    adminCustomerDriverDetailsEmailDisabledSendActionLabel: "Email customer",
    adminCustomerDriverDetailsEmailButtonTone: null,
    adminCustomerDriverDetailsEmailDisabledSendCanCall: true,
    adminCustomerDriverDetailsEmailButtonLabel: "Email",
    sendAdminCustomerDriverDetailsEmail: () => { throw new Error("Never send from a display test"); },
    actionFeedbackButtonClass: (_tone, css) => css,
    ...overrides,
  };
  const selector = declarations.get(selectorName);
  if (selector) env[selectorName] = new Function("env", `with(env){${compile(`const ${selector}; return ${selectorName};`)}}`)(env);
  const element = new Function("React", "env", `with(env){${compile(`return (${button});`)}}`)(React, env);
  return renderToStaticMarkup(element);
}

let html = render();
assert.match(html, />To: booker@example\.test</, "Existing Email button must visibly identify the exact intended recipient");
assert.match(html, /aria-label="Email customer: To: booker@example\.test"/, "Accessible label includes recipient");
assert.match(html, /title="Email customer: To: booker@example\.test"/);
assert.match(render({ dispatchReleaseLoadedBookingRecord: record("TEST-A", "", "booker@example.test") }), />To: booker@example\.test</, "Saved Booker fallback");
assert.match(render({ dispatchReleaseLoadedBookingRecord: record("TEST-A", "booker@example.test", "other@example.test") }), />To: booker@example\.test</, "Booking contact takes precedence over Booker profile");
assert.match(render({ adminCustomerDriverDetailsEmailReviewCustomerEmail: "BOOKER@example.test" }), />To: BOOKER@example\.test</, "Case-only differences are not unsaved changes");
assert.match(render({ adminCustomerDriverDetailsEmailReviewCustomerEmail: "new@example.test" }), />Unsaved email change</);
assert.match(render({ adminCustomerDriverDetailsEmailReviewCustomerEmail: "" }), />Unsaved email change</, "Clearing a saved address is an unsaved change");
html = render({ adminCustomerDriverDetailsEmailReviewCustomerEmail: "", dispatchReleaseLoadedBookingRecord: record("TEST-A", ""), adminCustomerDriverDetailsEmailDisabledSendCanCall: false });
assert.match(html, />No email saved</);
assert.match(html, /disabled=""/);
assert.doesNotMatch(html, /booker@example\.test/);
assert.match(render({ adminCustomerDriverDetailsEmailReviewCustomerEmail: "new@example.test", dispatchReleaseLoadedBookingRecord: record("TEST-A", "") }), />Unsaved email change</, "New address is not saved yet");
assert.match(render({ appliedAdminBookingSnapshot: record("TEST-A", "new@example.test"), adminCustomerDriverDetailsEmailReviewCustomerEmail: "new@example.test" }), />To: new@example\.test</, "Approved existing save result refreshes display");
assert.match(render({ dispatchReleaseLoadedBookingRecord: null, customerDriverDetailsPortalLastSavedRecord: record("TEST-A", "booker@example.test") }), />To: booker@example\.test</, "Existing successful-save fallback");
html = render({ adminCustomerDriverDetailsEmailReviewBookingReference: "TEST-B", adminCustomerDriverDetailsEmailReviewCustomerEmail: "next@example.test", appliedAdminBookingSnapshot: record("TEST-A", "old@example.test"), dispatchReleaseLoadedBookingRecord: record("TEST-B", "next@example.test") });
assert.match(html, />To: next@example\.test</);
assert.doesNotMatch(html, /old@example\.test|booker@example\.test/, "Booking switch cannot retain another recipient");
html = render({ adminCustomerDriverDetailsEmailReviewBookingReference: "", adminCustomerDriverDetailsEmailReviewCustomerEmail: "", adminCustomerDriverDetailsEmailDisabledSendCanCall: false });
assert.match(html, />No email saved</);
assert.doesNotMatch(html, /booker@example\.test/, "Clear cannot retain a previous recipient");
assert.match(render({ adminCustomerDriverDetailsEmailReviewBookingReference: "TEST-B" }), />Unsaved email change</, "Wrong-reference record is not evidence of a saved recipient");
for (const label of ["Sending Email", "Emailed", "Email blocked", "Email gate off"]) {
  html = render({ adminCustomerDriverDetailsEmailButtonLabel: label, adminCustomerDriverDetailsEmailDisabledSendCanCall: false });
  assert.ok(html.includes(`>${label}</span>`), `Preserve ${label} state`);
  assert.match(html, />To: booker@example\.test</);
  assert.match(html, /disabled=""/);
}
const longEmail = "a".repeat(60) + "@" + "b".repeat(60) + ".example.test";
html = render({ adminCustomerDriverDetailsEmailReviewCustomerEmail: longEmail, dispatchReleaseLoadedBookingRecord: record("TEST-A", longEmail) });
assert.ok(html.includes(`>To: ${longEmail}</span>`), "Do not truncate recipient");
assert.match(button, /min-w-0 max-w-full/);
assert.match(button, /whitespace-normal/);
assert.match(button, /break-all/);
assert.match(button, /onClick=\{sendAdminCustomerDriverDetailsEmail\}/);
assert.match(button, /disabled=\{!adminCustomerDriverDetailsEmailDisabledSendCanCall\}/);

// Preserve the actual sender, existing enabled/disabled decision and feedback
// labels from the reviewed main3fa326fc baseline. No extra send or reset lane.
const locks = [["  async function sendAdminCustomerDriverDetailsEmail(", "  async function ", "828e9cf3a79a28a0cac97b57c08992a550e42391c8d462c06a06818a5883a58d"], ["  const adminCustomerDriverDetailsEmailDisabledSendCanCall =", "  const adminCustomerDriverDetailsEmailDisabledSendActionLabel =", "1d88d8e7192e9e65b600ef6843f58dde229d4174aecdb6620d20bd36ce5d9428"], ["  const adminCustomerDriverDetailsEmailButtonLabel =", "  const adminCustomerDriverDetailsWhatsAppLoaded =", "dd867271afd281664e525f669dec26de6ae25e18a7cf1099156892c760d24519"]];
for (const [start, end, digest] of locks) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  assert.equal(createHash("sha256").update(source.slice(a,b)).digest("hex"), digest, `Unchanged behavior: ${start.trim()}`);
}
console.log("PASS: actual Email button recipient render; saved contact/Booker fallback; blank, unsaved, saved refresh, booking switch, Clear, long address, accessibility, send-state preservation. No network or sends.");
