// Source contract plus a local, synthetic layout fixture using the real JSX/CSS.
// Run normally for source checks; use --serve for browser geometry verification.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const source = await readFile("app/page.tsx", "utf8");
const start = source.indexOf("const recentBookingsPanel =");
const end = source.indexOf("const completedEmptyState =", start);
assert.ok(start >= 0 && end > start);
const panel = source.slice(start, end);
const tree = ts.createSourceFile("fixture.tsx", panel, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
const tagged = (name) => elements.find((node) => node.openingElement.attributes.properties.some(
  (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === name,
));
const article = tagged("data-recent-operational-card");
const details = tagged("data-recent-operational-details");
const actions = tagged("data-recent-operational-actions");
const summary = elements.find((node) => node.openingElement.tagName.getText(tree) === "summary");
assert.ok(article && details && actions && summary);
const summaryClass = summary.openingElement.attributes.properties.find(
  (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === "className",
).initializer.text;
assert.doesNotMatch(summaryClass, /minmax\((?:13|10|14)rem,/,
  "Booking summary columns must shrink inside their allotted width beside the actions");
assert.match(summaryClass, /md:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(0,0\.8fr\)_minmax\(0,1\.4fr\)_minmax\(9rem,0\.7fr\)_minmax\(0,1fr\)\]/);
assert.match(summary.getText(tree), /className="min-w-0 flex flex-wrap items-center gap-2 text-right"/,
  "Existing status badges must wrap within their own summary column");
for (const unchanged of [
  'className="grid gap-2 sm:grid-cols-3 xl:w-52 xl:grid-cols-1"',
  "onClick={() => loadSelectedBooking(savedBooking)}",
  "onClick={() => markBookingCompleted(savedBooking)}",
  "onClick={() => markBookingCancelled(savedBooking)}",
]) assert.ok(actions.getText(tree).includes(unchanged), `Preserve action contract: ${unchanged}`);
console.log("Booking summary layout source guard passed.");

if (process.argv.includes("--serve")) {
  // Compile only the real summary/actions. Expanded-body content cannot affect
  // the collapsed row; a local placeholder permits disclosure containment checks.
  const jsx = `${article.openingElement.getText(tree)}
    ${details.parent.openingElement.getText(tree)}
      ${details.openingElement.getText(tree)}${summary.getText(tree)}
        <div className="p-2">Synthetic expanded booking details</div>
      </details>${actions.getText(tree)}
    </div></article>`;
  const fixture = {
    bookingId: "synthetic-layout", bookingAlternateColour: "sky",
    operationalCard: { company: "SYNTHETIC COMPANY WITH A LONG NAME", pax_display: "3", vehicle_display: "AVF" },
    pickupMetaText: "20 Sept 2026, 1215hrs SGT · Flight QA123",
    passengerText: "SYNTHETIC PASSENGER WITH A LONG NAME", bookerText: "Synthetic Booker",
    routeText: "SYNTHETIC PICKUP LOBBY > SYNTHETIC AIRPORT TERMINAL",
    hasAssignedDriver: true, driverText: "Synthetic Driver With A Long Name",
    driverSummary: { contact: "00000000", plate: "TEST1234", vehicle: "AVF" },
    bookingGoogleCalendarStatus: "update_calendar", bookingGoogleCalendarStatusLabel: "Update Cal",
    bookingDriverDetailsDeliveryStatus: { status: "sent" }, bookingDriverDetailsDeliveryStatusLabel: "Detail sent 10:37",
    showBookingsListStatus: true, bookingsListStatus: "Confirmed", savedBooking: { status: "confirmed" },
    isCompleted: false, completingBookingId: null, bookingCompletionMessage: null,
    AdminOperationalUppercaseValue: ({ children }) => children,
    getLoadBookingsOperationalDisplayTitle: (card) => card.company,
    bookingStatusClass: () => "bg-slate-100 text-slate-700",
    statusClass: () => "text-slate-700",
    loadSelectedBooking: () => { throw Error("Fixture cannot edit a booking"); },
    markBookingCompleted: () => { throw Error("Fixture cannot complete a booking"); },
    markBookingCancelled: () => { throw Error("Fixture cannot cancel a booking"); },
  };
  const compiled = ts.transpileModule(`const row = (${jsx});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const render = new Function("React", ...Object.keys(fixture), `${compiled}; return row;`);
  const variants = [
    {},
    { hasAssignedDriver: false, driverText: "Driver TBC", driverSummary: {}, bookingDriverDetailsDeliveryStatusLabel: "", showBookingsListStatus: false },
    { bookingGoogleCalendarStatus: "cal_saved", bookingGoogleCalendarStatusLabel: "Cal saved", bookingDriverDetailsDeliveryStatus: { status: "acknowledged" }, bookingDriverDetailsDeliveryStatusLabel: "Acknowledged 10:37" },
    { bookingGoogleCalendarStatusLabel: "", bookingDriverDetailsDeliveryStatusLabel: "", showBookingsListStatus: false },
  ];
  const rows = variants.map((variant, index) => {
    const data = { ...fixture, ...variant, bookingId: `synthetic-layout-${index}` };
    return renderToStaticMarkup(render(React, ...Object.keys(fixture).map((key) => data[key])));
  }).join("");
  const css = (await postcss([tailwind({ base: process.cwd() })]).process(
    await readFile("app/globals.css", "utf8"), { from: "app/globals.css" },
  )).css;
  // Executed by the browser on load, resize, and disclosure toggle. No fetches,
  // storage, credentials, production data, or operational handlers are involved.
  function measure() {
    const failures = [];
    const intersects = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    document.querySelectorAll("[data-recent-operational-card]").forEach((card, index) => {
      const summary = card.querySelector("summary");
      const bounds = summary.getBoundingClientRect();
      const actions = card.querySelector("[data-recent-operational-actions]");
      const actionBounds = actions.getBoundingClientRect();
      [...summary.children].forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) failures.push(`row ${index}: summary child escapes`);
        if (intersects(rect, actionBounds)) failures.push(`row ${index}: summary overlaps actions`);
      });
      const badges = [...summary.lastElementChild.children];
      badges.forEach((badge, position) => {
        const rect = badge.getBoundingClientRect();
        if (rect.right > bounds.right + 1 || intersects(rect, actionBounds)) failures.push(`row ${index}: badge escapes or overlaps actions`);
        if (badge.scrollWidth > badge.clientWidth + 1) failures.push(`row ${index}: badge text clipped`);
        badges.slice(position + 1).forEach((other) => {
          if (intersects(rect, other.getBoundingClientRect())) failures.push(`row ${index}: badges overlap`);
        });
      });
      if (actions.querySelectorAll("button").length !== 3) failures.push(`row ${index}: action missing`);
    });
    if (document.documentElement.scrollWidth > innerWidth + 1) failures.push("page horizontal overflow");
    const output = document.getElementById("layout-result");
    output.textContent = JSON.stringify({ width: innerWidth, passed: failures.length === 0, failures });
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Booking row layout regression</title></head><body class="admin-ops-shell"><main class="mx-auto max-w-6xl p-6"><h1>Booking row layout regression — synthetic records</h1><output id="layout-result"></output><section class="rounded-md border p-3"><div class="mt-3 rounded-md border p-3"><div class="space-y-2">${rows}</div></div></section></main><script>const measure = ${measure.toString()}; addEventListener('load',measure); addEventListener('resize',measure); document.addEventListener('toggle',measure,true);</script></body></html>`;
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/style.css" ? "text/css" : "text/html");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'");
    res.end(req.url === "/style.css" ? css : html);
  });
  server.listen(0, "127.0.0.1", () => console.log(`Layout fixture: http://127.0.0.1:${server.address().port}`));
  process.on("SIGINT", () => server.close());
}
