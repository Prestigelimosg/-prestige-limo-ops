import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import ts from "typescript";

const helperPath = "lib/customer-driver-app-notification-persistence.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-customer-driver-quick-reply-booking-event-key-guard.mjs";

const [helper, ledger, preactivationSuite] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const sourceFile = ts.createSourceFile(
  helperPath,
  helper,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TS,
);
const eventKeyFunctionName = "customerDriverQuickReplyEventKey";
const eventKeyFunction = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === eventKeyFunctionName,
);

assert.ok(
  eventKeyFunction,
  `The established quick-reply persistence helper must declare ${eventKeyFunctionName}.`,
);
assert.equal(
  eventKeyFunction.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  ),
  true,
  `${eventKeyFunctionName} must remain executable by this focused regression guard.`,
);

const eventKeyFunctionSource = helper.slice(
  eventKeyFunction.getStart(sourceFile),
  eventKeyFunction.end,
);
const executableSource = ts.transpileModule(
  `import { createHash } from "node:crypto";\n${eventKeyFunctionSource}`,
  {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const executableModule = await import(
  `data:text/javascript;base64,${Buffer.from(executableSource).toString("base64")}`
);
const eventKeyFor = executableModule[eventKeyFunctionName];

assert.equal(typeof eventKeyFor, "function", "The booking-scoped event-key helper must execute.");

const exactBookingA = "MSG-BOOKING-10001";
const exactBookingB = "MSG-BOOKING-10002";
const exactTemplate = "customer_at_lobby";
const firstBookingKey = eventKeyFor("customer_to_driver", exactTemplate, exactBookingA);
const secondBookingKey = eventKeyFor("customer_to_driver", exactTemplate, exactBookingB);
const repeatedFirstBookingKey = eventKeyFor(
  "customer_to_driver",
  exactTemplate,
  exactBookingA,
);

assert.notEqual(
  firstBookingKey,
  secondBookingKey,
  "The same fixed template on two exact different bookings must not collide.",
);
assert.equal(
  repeatedFirstBookingKey,
  firstBookingKey,
  "The same booking, direction, and template must retain duplicate protection.",
);

const globallyUniqueEventKeys = new Set();
const insertLikeExistingUniqueIndex = (eventKey) => {
  if (globallyUniqueEventKeys.has(eventKey)) return false;
  globallyUniqueEventKeys.add(eventKey);
  return true;
};

assert.equal(insertLikeExistingUniqueIndex(firstBookingKey), true, "first booking insert");
assert.equal(insertLikeExistingUniqueIndex(secondBookingKey), true, "second booking insert");
assert.equal(
  insertLikeExistingUniqueIndex(repeatedFirstBookingKey),
  false,
  "same-booking duplicate must remain blocked by the existing unique event-key index",
);

for (const eventKey of [firstBookingKey, secondBookingKey]) {
  assert.match(
    eventKey,
    /^customer_driver_quick_reply:v2:[0-9a-f]{64}$/,
    "Quick-reply identity must be one bounded opaque SHA-256 event key.",
  );
  assert.equal(eventKey.length <= 180, true, "event key must fit the existing schema limit");
  assert.equal(eventKey.includes(exactTemplate), false, "event key must not expose template text");
  assert.equal(eventKey.includes("MSG-BOOKING-"), false, "event key must not expose booking identity");
}

assert.equal(
  eventKeyFor("driver_to_customer", exactTemplate, exactBookingA) === firstBookingKey,
  false,
  "Direction must remain part of the same-booking idempotency identity.",
);
assert.equal(
  helper.includes("customerDriverQuickReplyEventKey(") &&
    helper.includes("customerDriverMessageEventKey(direction, bookingReference, clientMessageId)"),
  true,
  "The established writer must keep booking-scoped fixed-template and typed-message helpers.",
);
assert.equal(
  helper.includes("event_key: `customer_driver_quick_reply:${direction}:${templateKey}`"),
  false,
  "The former cross-booking global template key must stay retired.",
);
assert.equal(
  preactivationSuite.includes(guardPath),
  true,
  "The booking-scoped quick-reply event-key guard must remain registered.",
);

for (const phrase of [
  "Customer/Driver Quick-Reply Booking-Scoped Event-Key Repair",
  "same fixed quick-reply template on two different exact booking references",
  "same booking, direction, and template remains deterministic",
  "Customer Native Alerts And Shared Boss/PA Customer Copy handoff",
  "Native Expo delivery fans out only to active exact devices",
  "Driver details ready",
  "persists verified name, contact, plate, and vehicle",
]) {
  assert.equal(ledger.includes(phrase), true, `Ledger must preserve: ${phrase}`);
}

console.log("Customer/Driver quick-reply booking event-key guard passed");
