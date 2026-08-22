import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createBrowserTestReporter,
  createChromeClient,
  navigateWithLoadEvent,
  normalizeErrorMessage,
  terminateChildProcess,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3010";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9249);
const reporter = createBrowserTestReporter("customer-folder-reviewed-price-invalidation-browser");
const customerId = "190";
const customerName = "DSP Price Invalidation Test";
const bookingReference = "dsp-reviewed-price-invalidation-001";

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

function bookingFixture(serviceType = "MNG") {
  return {
    booking_reference: bookingReference,
    child_seat_count: 0,
    company_id: null,
    contact_display_name: "Test Booker",
    contact_email: null,
    contact_phone: null,
    customer_account: customerName,
    customer_display_name: customerName,
    customer_id: customerId,
    customer_price_amount: "85",
    dropoff_location: "Marina Bay",
    extra_stop_count: 0,
    passenger_name: "Test Passenger",
    pickup_at: "2026-08-21T10:35:00.000Z",
    pickup_datetime: "2026-08-21T10:35:00.000Z",
    pickup_location: "Changi Airport",
    public_booking_reference: "10894",
    route_points: [],
    route_summary: "Changi Airport > Marina Bay",
    route_type: serviceType,
    service_items: [],
    service_type: serviceType,
    status: "confirmed",
    traveler_id: null,
    vehicle_type_or_category: "AVF",
  };
}

async function main() {
  const chromeProfileDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-dsp-price-invalidation-chrome-"),
  );
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
    "--window-size=1280,1000",
    "about:blank",
  ];

  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) {
    chromeArgs.unshift("--headless=new");
  }

  reporter.step("launching light-mode Chrome");
  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;
  let currentBooking = bookingFixture();
  let dspSummary = null;
  const requests = [];
  const consoleErrors = [];

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "light" }],
      }),
      client.send("Fetch.enable", {
        patterns: [{ requestStage: "Request", urlPattern: "*/api/*" }],
      }),
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

    client.on("Runtime.consoleAPICalled", ({ args, type }) => {
      if (type === "error") {
        consoleErrors.push(args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
      }
    });
    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      consoleErrors.push(
        exceptionDetails.exception?.description || exceptionDetails.text || "Runtime exception",
      );
    });
    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      requests.push({ body: request.postData || "", method, path: requestUrl.pathname });
      let responseBody;
      let responseCode = 200;

      if (requestUrl.pathname === "/api/admin-customer-saved-bookings" && method === "GET") {
        responseBody = {
          ok: true,
          saved_bookings: [currentBooking],
          summary: { returned_count: 1 },
        };
      } else if (requestUrl.pathname === "/api/admin-customer-invoices" && method === "GET") {
        responseBody = { invoices: [], ok: true };
      } else if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "GET") {
        responseBody = {
          accounts: [
            {
              customer_id: customerId,
              guest_account_billing_enabled: false,
              verified_company_id: null,
            },
          ],
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-rate-setup" && method === "GET") {
        responseBody = {
          companies: [],
          ok: true,
          settings: {
            customer_rates: {
              DSP: { AVF: 65 },
              MNG: { AVF: 85 },
            },
            midnight_surcharge: 15,
          },
          travelers: [],
        };
      } else if (
        requestUrl.pathname === "/api/admin-driver-job-dsp-actual-time-summaries" &&
        method === "GET"
      ) {
        responseBody = { latest_summary: dspSummary, ok: true };
      } else if (
        requestUrl.pathname === "/api/admin-driver-job-dsp-actual-time-summaries" &&
        method === "POST"
      ) {
        const payload = JSON.parse(request.postData || "{}");
        assert.equal(payload.booking_reference, bookingReference);
        assert.equal(payload.dsp_started_at, "2026-08-21T18:35:00+08:00");
        assert.equal(payload.dsp_ended_at, "2026-08-22T03:19:00+08:00");
        dspSummary = {
          billing_time_correction_reason: "end time",
          billing_time_source: "admin_correction",
          dsp_ended_at: payload.dsp_ended_at,
          dsp_started_at: payload.dsp_started_at,
        };
        responseBody = { corrected_summary: dspSummary, ok: true };
      } else if (requestUrl.pathname === "/api/admin-bookings" && method === "GET") {
        responseBody = { booking: currentBooking, ok: true };
      } else if (requestUrl.pathname === "/api/admin-bookings" && method === "PATCH") {
        const payload = JSON.parse(request.postData || "{}");
        assert.equal(payload.target_booking_reference, bookingReference);
        assert.equal(payload.booking?.service_type, "DSP");
        currentBooking = bookingFixture("DSP");
        responseBody = { booking: currentBooking, ok: true };
      } else {
        responseBody = { error: `Unexpected ${method} ${requestUrl.pathname}`, ok: false };
        responseCode = 500;
      }

      client
        .send("Fetch.fulfillRequest", {
          body: Buffer.from(JSON.stringify(responseBody)).toString("base64"),
          requestId,
          responseCode,
          responseHeaders: responseHeaders(),
        })
        .catch(() => {});
    });

    const customerUrl = new URL(`/customers/${customerId}`, appUrl);
    customerUrl.searchParams.set("name", customerName);
    await navigateWithLoadEvent(client, customerUrl.toString());

    const priceSelector = `[data-customer-folder-saved-bookings-price="${bookingReference}"]`;
    const selectSelector = `[data-customer-folder-saved-bookings-select="${bookingReference}"]`;
    const editSelector = `[data-customer-folder-saved-bookings-edit="${bookingReference}"]`;

    reporter.step("confirming initial MNG proposal and reviewed state");
    await waitForCondition(
      () => evaluate(`document.querySelector(${JSON.stringify(priceSelector)})?.textContent.includes("$85.00")`),
      10000,
      "initial MNG SGD85 proposal",
    );
    await evaluate(`document.querySelector(${JSON.stringify(selectSelector)}).click()`);
    await waitForCondition(
      () => evaluate(`document.querySelector(${JSON.stringify(priceSelector)})?.textContent.includes("Reviewed")`),
      10000,
      "initial reviewed MNG price",
    );

    reporter.step("changing the exact saved job from MNG to DSP");
    await evaluate(`document.querySelector(${JSON.stringify(editSelector)}).click()`);
    await waitForCondition(
      () => evaluate(`Boolean(document.querySelector('[data-customer-folder-inline-service="true"]'))`),
      10000,
      "exact saved-job editor",
    );
    await evaluate(`(() => {
      const input = document.querySelector('[data-customer-folder-inline-service="true"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "DSP");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await evaluate(`document.querySelector('[data-customer-folder-inline-save="true"]').click()`);

    reporter.step("confirming the stale reviewed amount is invalidated");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const price = document.querySelector(${JSON.stringify(priceSelector)});
          const row = document.querySelector('[data-customer-folder-saved-bookings-row="${bookingReference}"]');
          return price?.textContent.trim() === "Review required" && row?.textContent.includes("DSP");
        })()`),
      10000,
      "DSP Review required state after exact job save",
    );

    const finalState = await evaluate(`(() => ({
      invoiceDisabled: Boolean(document.querySelector('[data-customer-folder-saved-bookings-create-invoice-disabled="${bookingReference}"]')),
      priceText: document.querySelector(${JSON.stringify(priceSelector)})?.textContent.trim() || "",
      rowText: document.querySelector('[data-customer-folder-saved-bookings-row="${bookingReference}"]')?.textContent || "",
    }))()`);
    assert.equal(finalState.priceText, "Review required");
    assert.equal(finalState.priceText.includes("85.00"), false);
    assert.equal(finalState.invoiceDisabled, true);

    reporter.step("saving the corrected crossing-midnight DSP interval");
    await evaluate(`document.querySelector(${JSON.stringify(priceSelector)}).click()`);
    await waitForCondition(
      () => evaluate(`Boolean(document.querySelector('[data-customer-folder-dsp-billing-start="true"]'))`),
      10000,
      "DSP billing-time correction editor",
    );
    await evaluate(`(() => {
      const values = [
        ['[data-customer-folder-dsp-billing-start="true"]', "2026-08-21T18:35"],
        ['[data-customer-folder-dsp-billing-end="true"]', "2026-08-22T03:19"],
        ['[data-customer-folder-dsp-billing-reason="true"]', "end time"],
      ];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      for (const [selector, value] of values) {
        const input = document.querySelector(selector);
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      document.querySelector('[data-customer-folder-dsp-billing-time-save="true"]').click();
    })()`);

    reporter.step("confirming one midnight surcharge in the recalculated proposal");
    await waitForCondition(
      () => evaluate(`document.querySelector(${JSON.stringify(priceSelector)})?.textContent.includes("$600.00")`),
      10000,
      "SGD600 crossing-midnight DSP proposal",
    );
    const midnightState = await evaluate(`(() => ({
      breakdown: document.querySelector('[data-customer-folder-price-review-editor="${bookingReference}"]')?.textContent || "",
      priceText: document.querySelector(${JSON.stringify(priceSelector)})?.textContent.trim() || "",
      priceDraft: document.querySelector('[data-customer-folder-price-review-input="${bookingReference}"]')?.value || "",
    }))()`);
    assert.equal(midnightState.priceText, "$600.00 · Review required · tick to confirm");
    assert.equal(midnightState.priceDraft, "600.00");
    assert.equal(midnightState.breakdown.includes("524 corrected billing min"), true);
    assert.equal(midnightState.breakdown.includes("9 billable hr"), true);
    assert.equal(midnightState.breakdown.includes("$15.00 surcharges"), true);
    assert.equal(
      requests.filter((request) => request.method === "PATCH" && request.path === "/api/admin-bookings").length,
      1,
    );
    assert.equal(
      requests.filter(
        (request) =>
          request.method === "POST" &&
          request.path === "/api/admin-driver-job-dsp-actual-time-summaries",
      ).length,
      1,
    );
    assert.equal(
      requests.some((request) =>
        request.method !== "GET" &&
        !(
          request.method === "PATCH" && request.path === "/api/admin-bookings"
        ) &&
        !(
          request.method === "POST" &&
          request.path === "/api/admin-driver-job-dsp-actual-time-summaries"
        ),
      ),
      false,
      "the runtime repair must not invoke price, invoice, email, payment, or other writers",
    );
    assert.deepEqual(consoleErrors, []);

    console.log(
      JSON.stringify(
        reporter.summary({
          bookingReference: "10894 fixture",
          finalPriceState: midnightState.priceText,
          midnightSurchargeCents: 1500,
          patchCount: 1,
          result: "passed",
        }),
        null,
        2,
      ),
    );
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      reporter.summary({ error: normalizeErrorMessage(error), result: "failed" }),
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
