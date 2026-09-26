import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const adapterSource = read("lib/customer-portal-invoices-adapter.ts");
assert.match(adapterSource, /export async function deliverCustomerPortalInvoicePdf/, "The PDF button needs an awaited native handoff, not a blob anchor success claim");

function load(path, globals = {}, dependencies = {}) {
  const output = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, URL, Blob, console, ...globals, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const origin = "https://app.prestigelimo.sg/my-bookings";
const context = { eventUrl: origin, currentUrl: origin, loadedUrl: origin, unlocked: true };
const request = { type: "customer_invoice_pdf", requestId: "11111111-1111-4111-8111-111111111111", filename: "INV-QA.pdf", base64: Buffer.from("%PDF-1.7\nsynthetic QA only").toString("base64") };
let saved = [], deleted = [], shares = [], finishShare, failShare = false, failWrite = false;
class Directory {
  constructor(...parts) { this.uri = parts.map((part) => part.uri || part).join("/"); this.exists = true; }
  create() { this.exists = true; }
  delete() { deleted.push(this.uri); this.exists = false; }
}
class File {
  constructor(directory, filename) { this.uri = directory.uri + "/" + filename; }
  write(data, options) { if (failWrite) throw Error("Disk full"); saved.push({ data, options, uri: this.uri }); }
}
const native = load("customer-companion/src/customer-invoice-pdf.ts", {}, {
  "expo-file-system": { Directory, File, Paths: { cache: "file://private-cache" } },
  "react-native": { Share: { sharedAction: "sharedAction", share: (input) => { if (failShare) throw Error("Sheet unavailable"); shares.push(input); return new Promise((resolve) => { finishShare = resolve; }); } } },
});
const handler = native.createCustomerInvoicePdfHandler();
const replies = [];
const reply = (id, status) => replies.push({ id, status });
const invoke = (patch = {}, ctx = context) => handler(JSON.stringify({ ...request, ...patch }), ctx, reply);
assert.equal(await handler('{"type":"customer_native_notifications_enable"}', context, reply), false, "Notification messages keep their existing handler");
for (const ctx of [
  { ...context, unlocked: false },
  ...["eventUrl", "currentUrl", "loadedUrl"].flatMap((key) => [
    { ...context, [key]: "https://evil.example/my-bookings" },
    { ...context, [key]: "https://app.prestigelimo.sg/book" },
  ]),
]) await invoke({}, ctx);
for (const patch of [
  { filename: "../../private.pdf" }, { filename: "invoice.html" },
  { base64: Buffer.from("<html>not a PDF</html>").toString("base64") },
  { base64: request.base64 + "!" }, { url: "https://evil.example" },
]) await invoke(patch);
assert.equal(shares.length, 0, "Untrusted or malformed input must never reach iOS");
const pending = invoke();
assert.equal(shares.length, 1);
assert.equal(shares[0].url, "file://private-cache/customer-invoice-pdf/INV-QA.pdf");
assert.equal(saved[0].data, request.base64, "Share the exact authenticated bytes, without another network request");
assert.equal(saved[0].options.encoding, "base64");
assert.equal(replies.at(-1)?.status, "failed", "No success before the share sheet completes");
await invoke({ requestId: "22222222-2222-4222-8222-222222222222" });
assert.equal(shares.length, 1, "Only one sheet at a time");
finishShare({ action: "sharedAction" });
await pending;
assert.deepEqual(replies.at(-1), { id: request.requestId, status: "shared" });
assert.ok(deleted.includes("file://private-cache/customer-invoice-pdf"), "Temporary PDF must be cleaned up");
const cancelled = invoke();
finishShare({ action: "dismissedAction" });
await cancelled;
assert.equal(replies.at(-1).status, "cancelled");
for (const failure of ["write", "share"]) {
  failWrite = failure === "write";
  failShare = failure === "share";
  const deletedBefore = deleted.length;
  await invoke();
  assert.equal(replies.at(-1).status, "failed");
  assert.ok(deleted.length > deletedBefore, "Failures also clean temporary PDF data");
}
failWrite = failShare = false;
await invoke({ base64: "JVBERi0" + "A".repeat(14 * 1024 * 1024) });
assert.equal(shares.length, 2, "Oversized data is rejected before writing or opening a sheet");

// Run the real web adapter against a browser-like bridge, including correlation and failure.
const events = new EventTarget();
const timers = new Map();
let timerId = 0, sent = [], anchors = 0;
const window = Object.assign(events, {
  __prestigeCustomerNativePdf: 1,
  ReactNativeWebView: { postMessage: (value) => sent.push(JSON.parse(value)) },
  crypto: { randomUUID: () => request.requestId },
  setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
  clearTimeout: (id) => timers.delete(id),
  URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => {} },
});
class FileReader {
  readAsDataURL(blob) { blob.arrayBuffer().then((buffer) => { this.result = "data:application/pdf;base64," + Buffer.from(buffer).toString("base64"); this.onload(); }); }
}
const document = { createElement: () => ({ click: () => anchors++, remove: () => {} }), body: { appendChild: () => {} } };
const web = load("lib/customer-portal-invoices-adapter.ts", { window, document, FileReader });
const pdf = new Blob(["%PDF-1.7\nsynthetic QA only"], { type: "application/pdf" });
function result(status, requestId = request.requestId) {
  const event = new Event("prestige-customer-pdf-result");
  event.detail = { requestId, status };
  window.dispatchEvent(event);
}
let settled = false;
const delivery = web.deliverCustomerPortalInvoicePdf(pdf, "INV-QA.pdf").then((status) => { settled = true; return status; });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(sent.length, 1);
assert.equal(sent[0].base64, request.base64);
result("shared", "unrelated-request");
await Promise.resolve();
assert.equal(settled, false);
result("shared");
assert.equal(await delivery, "shared");
assert.equal(timers.size, 0);
assert.equal(anchors, 0, "Native PDF must not use the broken blob-anchor path");
const cancelledDelivery = web.deliverCustomerPortalInvoicePdf(pdf, "INV-QA.pdf");
await new Promise((resolve) => setImmediate(resolve));
result("cancelled");
assert.equal(await cancelledDelivery, "cancelled");
const failedDelivery = web.deliverCustomerPortalInvoicePdf(pdf, "INV-QA.pdf");
await new Promise((resolve) => setImmediate(resolve));
result("failed");
await assert.rejects(failedDelivery);
const timeoutDelivery = web.deliverCustomerPortalInvoicePdf(pdf, "INV-QA.pdf");
await new Promise((resolve) => setImmediate(resolve));
for (const timer of [...timers.values()]) timer();
await assert.rejects(timeoutDelivery);
assert.equal(timers.size, 0);
const closedDelivery = web.deliverCustomerPortalInvoicePdf(pdf, "INV-QA.pdf");
await new Promise((resolve) => setImmediate(resolve));
window.dispatchEvent(new Event("pagehide"));
await assert.rejects(closedDelivery);
assert.equal(timers.size, 0);
delete window.__prestigeCustomerNativePdf;
await assert.rejects(web.deliverCustomerPortalInvoicePdf(pdf, "INV-QA.pdf"), /update/i, "Older native builds fail visibly rather than claiming a download");
delete window.ReactNativeWebView;
assert.equal(await web.deliverCustomerPortalInvoicePdf(pdf, "INV-QA.pdf"), "downloaded");
assert.equal(anchors, 1, "Ordinary browser download remains unchanged");

const app = read("customer-companion/App.tsx");
const page = read("app/my-bookings/page.tsx");
assert.match(app, /onMessage=\{handleCustomerNativeBridgeMessage\}/);
assert.match(app, /customerInvoicePdfHandlerRef\.current/);
assert.match(app, /eventUrl: event\.nativeEvent\.url/);
assert.match(app, /unlocked: unlockStateRef\.current === "ready"/);
assert.match(app, /Platform\.OS === "ios"/);
assert.match(app, /sharedCookiesEnabled/);
assert.match(page, /await deliverCustomerPortalInvoicePdf\(pdf\.blob/);
assert.match(page, /\[invoice\.invoiceNumber\]: result/);
assert.doesNotMatch(page, /function downloadBrowserBlob/);
assert.match(adapterSource, /credentials: "same-origin"/);
assert.match(read("scripts/test-preactivation-verification-suite.mjs"), /test-customer-native-invoice-pdf-guard/);
console.log("Customer native invoice PDF guard passed: trusted scope, exact bytes, busy/cancel/failure/timeout, cleanup, web fallback and button wiring.");
