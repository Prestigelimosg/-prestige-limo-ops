import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const canonicalBrowserPath =
  "scripts/test-admin-booking-persistence-canonical-ui-browser.mjs";
const preactivationSuitePath =
  "scripts/test-preactivation-verification-suite.mjs";

const [appSmoke, canonicalBrowser, preactivationSuite] = await Promise.all([
  readFile(appSmokePath, "utf8"),
  readFile(canonicalBrowserPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assert.match(
  appSmoke,
  /String\(url\)\.includes\("\/api\/admin-bookings"\)\s*\|\|\s*String\(url\)\.includes\("\/api\/admin-saved-bookings"\)/,
  "The full app smoke fixture must intercept both the established admin write route and saved-bookings read route.",
);
assert.match(
  appSmoke,
  /String\(url\)\.includes\("\/api\/admin-customer-driver-app-notifications"\)/,
  "The full app smoke fixture must keep customer confirmation checks and sends in memory.",
);
assert.match(
  appSmoke,
  /Customer booking request accepted: LOADED-OPS-001/,
  "The full app smoke must wait for the current accepted-request completion feedback.",
);
assert.match(
  appSmoke,
  /Phone verification is required for this public booking request\./,
  "The full app smoke must recognize the established public phone-verification boundary.",
);
assert.match(
  appSmoke,
  /return error === customerBookingPhoneVerificationBoundaryError\s*\?\s*"phone-verification-boundary"\s*:\s*"customer-form-boundary"/,
  "The full app smoke must distinguish the OTP gate from the existing customer-form boundary.",
);
assert.match(
  appSmoke,
  /const \{ identifier: customerBookingFixtureIdentifier \} = await client\.send\(\s*"Page\.addScriptToEvaluateOnNewDocument"/,
  "The customer booking fixture must install before navigation so the initial access check cannot leak into a real local API.",
);
assert.match(
  appSmoke,
  /"Page\.removeScriptToEvaluateOnNewDocument", \{\s*identifier: customerBookingFixtureIdentifier/,
  "The pre-navigation customer booking fixture must be removed after the bounded route load.",
);
assert.match(
  appSmoke,
  /booker_profile: null,\s*memories: \[/,
  "The established customer-memory browser fixture must retain an explicit safe portal profile boundary.",
);
assert.match(
  appSmoke,
  /ok: true,\s*travelers: \[\],\s*version: "customer-booking-memory-read-v1"/,
  "The established customer-memory browser fixture must satisfy the current safe profile response contract.",
);
assert.match(
  appSmoke,
  /if \(!String\(url\)\.includes\("\/_next\/webpack-hmr"\)\)/,
  "The customer booking integration assertion must ignore only the Next.js development hot-reload socket.",
);
assert.match(
  appSmoke,
  /readStorage\(sessionStorage\)\.filter\(\s*\(value\) => !value\.startsWith\("__next_debug_channel:"\)/,
  "The browser persistence assertion must ignore only Next.js development debug-channel session entries.",
);
assert.match(
  appSmoke,
  /routedBookingRequestState\.text\.includes\("Verify your mobile for a first public booking"\)\s*&&\s*routedBookingRequestState\.text\.includes\("Phone verification required"\)/,
  "The mock portal-to-booking navigation must retain the real public OTP boundary when no customer session exists.",
);
assert.doesNotMatch(
  appSmoke,
  /Expected routed \/book form to keep the customer-safe submit button/,
  "The browser smoke must not require the retired pre-OTP routed booking button state.",
);
assert.match(
  canonicalBrowser,
  /document\.querySelector\("\[data-bookings-find-toolbar='true'\]"\)/,
  "The canonical browser guard must wait for the current saved-jobs search surface.",
);
assert.match(
  canonicalBrowser,
  /pickup_at: "2030-06-25T11:15:00\+08:00"/,
  "The canonical browser fixture must remain an upcoming booking instead of aging out of the default list.",
);
assert.match(
  canonicalBrowser,
  /public_booking_reference: "19001"/,
  "The canonical browser fixture must exercise the established public booking reference display.",
);
assert.match(
  canonicalBrowser,
  /text\.includes\("Booking 19001 loaded\."\)/,
  "The canonical browser guard must wait for the customer-safe public reference feedback.",
);
assert.match(
  canonicalBrowser,
  /replace\(\/\\\\s\*\\\\\*\\\\s\*\$\/, ""\)\.trim\(\)/,
  "The canonical browser guard must normalize only the optional required-field asterisk.",
);
assert.doesNotMatch(
  canonicalBrowser,
  /data-recent-operational-card='canonical-row-37'/,
  "The canonical browser guard must not select a booking card by the superseded database-row-first key.",
);
assert.match(
  canonicalBrowser,
  /data-recent-operational-card='CANONICAL-REQ-001'/,
  "The canonical browser guard must select the card by the established stable booking reference.",
);
assert.match(
  canonicalBrowser,
  /cardState\.savedCalls >= 1 && cardState\.savedCalls <= 2/,
  "The canonical browser guard must bound saved-booking reads across production and React development replay.",
);
assert.match(
  canonicalBrowser,
  /candidate\.textContent\.trim\(\) === "Open \/ Edit"/,
  "The canonical browser guard must use the current booking action label.",
);
assert.doesNotMatch(
  canonicalBrowser,
  /candidate\.textContent\.trim\(\) === "Load this booking"/,
  "The canonical browser guard must not require the retired booking action label.",
);
assert.match(
  canonicalBrowser,
  /Expected the retired manual Load Bookings button to stay absent/,
  "The canonical browser guard must prevent the retired manual Load Bookings control from returning.",
);
assert.doesNotMatch(
  canonicalBrowser,
  /Expected visible Load Bookings control and auto-load tab marker/,
  "The canonical browser guard must not require the retired manual Load Bookings control.",
);
assert.match(
  preactivationSuite,
  /scripts\/test-admin-booking-browser-fixture-boundary-guard\.mjs/,
  "The fixture boundary guard must remain registered in the pre-activation verification suite.",
);

console.log("Admin booking browser fixture boundary guard passed.");
