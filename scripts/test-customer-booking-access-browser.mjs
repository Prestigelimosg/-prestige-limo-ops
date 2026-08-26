import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createBrowserTestReporter,
  createChromeClient,
  navigateWithLoadEvent,
  terminateChildProcess,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9251);
const reporter = createBrowserTestReporter("customer-booking-access-browser");

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-booking-access-chrome-"));
  const chromeArgs = [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-service-autorun",
    `--remote-debugging-port=${chromeDebugPort}`,
    `--user-data-dir=${chromeProfileDir}`,
    "--window-size=430,932",
    "about:blank",
  ];

  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) {
    chromeArgs.unshift("--headless=new");
  }

  reporter.step("launching Chrome");
  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
    ]);

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
      }
      return result.result?.value;
    };

    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const originalFetch = window.fetch.bind(window);
        window.__customerBookingAccessCalls = [];
        window.fetch = async (...args) => {
          const target = args[0]?.url || args[0];
          const options = args[1] || {};
          const url = String(target);
          const method = options.method || args[0]?.method || "GET";
          const scenario = new URLSearchParams(location.search).get("test_case") || "public";
          window.__customerBookingAccessCalls.push({ method, url });

          if (url.includes("/api/customer-booking-memory")) {
            if (scenario === "principal" || scenario === "portal") {
              return new Response(JSON.stringify({
                booker_profile: {
                  booker_name: "Verified Booker",
                  email: "verified@example.com",
                  phone: "+65 9000 1234",
                },
                memories: [],
                ok: true,
                travelers: [{
                  default_dropoff_address: null,
                  default_pickup_address: null,
                  id: 901,
                  preferred_vehicle: null,
                  traveler_name: "Verified Traveller",
                }],
                version: "customer-booking-memory-read-v1",
              }), { headers: { "Content-Type": "application/json" }, status: 200 });
            }
            return new Response(JSON.stringify({
              error: "Customer booking memory read requires secure customer account access.",
              ok: false,
            }), { headers: { "Content-Type": "application/json" }, status: 403 });
          }

          if (url.includes("/api/customer-booking-phone-verification")) {
            const body = JSON.parse(String(options.body || "{}"));
            if (scenario === "rate-limit" && body.action === "start") {
              return new Response(JSON.stringify({
                error: "Too many verification requests. Please wait before trying again.",
                ok: false,
                reason: "rate_limited",
                retry_after_seconds: 60,
              }), {
                headers: { "Content-Type": "application/json", "Retry-After": "60" },
                status: 429,
              });
            }
            if (body.action === "start") {
              return new Response(JSON.stringify({
                challenge_id: "0123456789abcdef0123456789abcdef",
                expires_in_seconds: 600,
                ok: true,
                retry_after_seconds: 60,
              }), { headers: { "Content-Type": "application/json" }, status: 200 });
            }
            if (body.code === "000000") {
              return new Response(JSON.stringify({
                error: "The verification code expired. Request a new code.",
                ok: false,
                reason: "challenge_expired",
                retry_after_seconds: null,
              }), { headers: { "Content-Type": "application/json" }, status: 403 });
            }
            if (body.code !== "246802") {
              return new Response(JSON.stringify({
                error: "The verification code is incorrect.",
                ok: false,
                reason: "code_invalid",
                retry_after_seconds: null,
              }), { headers: { "Content-Type": "application/json" }, status: 403 });
            }
            return new Response(JSON.stringify({
              expires_in_seconds: 600,
              ok: true,
              proof: "customer_booking_phone_otp_proof_v1.mock.payload",
            }), { headers: { "Content-Type": "application/json" }, status: 200 });
          }

          if (url.includes("/api/customer-booking-requests")) {
            throw new Error("The booking access browser guard must never submit a booking.");
          }

          return originalFetch(...args);
        };
      })()`,
    });

    const bookingUrl = (scenario, invitation = false) => {
      const url = new URL("/book", appUrl);
      url.searchParams.set("test_case", scenario);
      if (invitation) url.searchParams.set("invite", "synthetic-private-invitation");
      return url.toString();
    };
    const state = () => evaluate(`(() => ({
      bookingPosts: window.__customerBookingAccessCalls.filter((call) => call.url.includes("/api/customer-booking-requests")).length,
      feedback: document.querySelector('[data-customer-booking-phone-otp-feedback]')?.textContent?.trim() || "",
      phoneSectors: document.querySelectorAll('[data-customer-booking-phone-verification="true"]').length,
      submitDisabled: document.querySelector('[data-customer-booking-submit]')?.disabled ?? null,
      submitLabel: document.querySelector('[data-customer-booking-submit]')?.textContent?.trim() || "",
      text: document.body?.innerText || "",
    }))()`);
    const setInput = (selector, value) => evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!input || !setter) return false;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    const click = (selector) => evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);

    reporter.step("active principal session bypasses public SMS");
    await navigateWithLoadEvent(client, bookingUrl("principal"));
    const principal = await waitForCondition(
      async () => {
        const current = await state();
        return current.submitLabel === "Submit Booking Request" ? current : false;
      },
      10000,
      "principal booking access",
    );
    assert.equal(principal.phoneSectors, 0);
    assert.equal(principal.bookingPosts, 0);

    reporter.step("current portal session bypasses public SMS");
    await navigateWithLoadEvent(client, bookingUrl("portal"));
    const portal = await waitForCondition(
      async () => {
        const current = await state();
        return current.submitLabel === "Submit Booking Request" ? current : false;
      },
      10000,
      "portal booking access",
    );
    assert.equal(portal.phoneSectors, 0);
    assert.equal(portal.bookingPosts, 0);

    reporter.step("private invitation bypasses public SMS pending server validation");
    await navigateWithLoadEvent(client, bookingUrl("invitation", true));
    const invitation = await waitForCondition(
      async () => {
        const current = await state();
        return current.submitLabel === "Submit Booking Request" ? current : false;
      },
      10000,
      "private invitation booking access",
    );
    assert.equal(invitation.phoneSectors, 0);
    assert.equal(invitation.text.includes("Private booking invitation detected"), true);
    assert.equal(invitation.bookingPosts, 0);

    reporter.step("anonymous public SMS verification unlocks the same submit button");
    await navigateWithLoadEvent(client, bookingUrl("public"));
    const publicInitial = await waitForCondition(
      async () => {
        const current = await state();
        return current.submitLabel === "Phone verification required" ? current : false;
      },
      10000,
      "public SMS boundary",
    );
    assert.equal(publicInitial.phoneSectors, 1);
    assert.equal(await setInput('[data-customer-booking-field="contactNo"]', "+65 9000 1234"), true);
    assert.equal(await click('[data-customer-booking-phone-otp-send="true"]'), true);
    await waitForCondition(
      () => evaluate(`document.querySelector('[data-customer-booking-phone-otp-code="true"]') !== null`),
      10000,
      "public SMS code field",
    );
    assert.equal(await setInput('[data-customer-booking-phone-otp-code="true"]', "135791"), true);
    assert.equal(await click('[data-customer-booking-phone-otp-check="true"]'), true);
    const wrongCode = await waitForCondition(
      async () => {
        const current = await state();
        return current.feedback.includes("incorrect") ? current : false;
      },
      10000,
      "wrong SMS code feedback",
    );
    assert.equal(wrongCode.phoneSectors, 1);
    assert.equal(wrongCode.submitLabel, "Phone verification required");
    assert.equal(await setInput('[data-customer-booking-phone-otp-code="true"]', "000000"), true);
    assert.equal(await click('[data-customer-booking-phone-otp-check="true"]'), true);
    const expiredCode = await waitForCondition(
      async () => {
        const current = await state();
        return current.feedback.includes("expired") ? current : false;
      },
      10000,
      "expired SMS code feedback",
    );
    assert.equal(expiredCode.phoneSectors, 1);
    assert.equal(await setInput('[data-customer-booking-phone-otp-code="true"]', "246802"), true);
    assert.equal(await click('[data-customer-booking-phone-otp-check="true"]'), true);
    const verified = await waitForCondition(
      async () => {
        const current = await state();
        return current.submitLabel === "Submit Booking Request" && current.phoneSectors === 0
          ? current
          : false;
      },
      10000,
      "verified public booking access",
    );
    assert.equal(verified.bookingPosts, 0);
    assert.equal(await setInput('[data-customer-booking-field="contactNo"]', "+65 9000 5678"), true);
    const changedPhone = await waitForCondition(
      async () => {
        const current = await state();
        return current.submitLabel === "Phone verification required" && current.phoneSectors === 1
          ? current
          : false;
      },
      10000,
      "phone change clears proof",
    );
    assert.equal(changedPhone.bookingPosts, 0);

    reporter.step("rate limit stays clear and fail-closed");
    await navigateWithLoadEvent(client, bookingUrl("rate-limit"));
    await waitForCondition(
      async () => (await state()).submitLabel === "Phone verification required",
      10000,
      "rate-limit public boundary",
    );
    assert.equal(await setInput('[data-customer-booking-field="contactNo"]', "+65 9000 1234"), true);
    assert.equal(await click('[data-customer-booking-phone-otp-send="true"]'), true);
    const rateLimited = await waitForCondition(
      async () => {
        const current = await state();
        return current.feedback.includes("Too many requests") ? current : false;
      },
      10000,
      "rate-limit feedback",
    );
    assert.equal(rateLimited.phoneSectors, 1);
    assert.equal(rateLimited.submitLabel, "Phone verification required");
    assert.equal(rateLimited.bookingPosts, 0);

    console.log(JSON.stringify(reporter.summary({ ok: true }), null, 2));
    console.log("Customer booking access browser guard passed.");
  } finally {
    client?.close();
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
