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
  waitForSelector,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9233);
const reporter = createBrowserTestReporter("customer-corporate-identity-browser");
const customerId = "165";
const customerName = "Apollo [Ms Tanya Sanwal]";
const bookingReferences = ["ADM-BROWSER-CORPORATE-001", "ADM-BROWSER-CORPORATE-002"];

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

function setInputValueScript(selector, value) {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-corporate-identity-chrome-"));
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
    "--window-size=1440,1000",
    "about:blank",
  ];

  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) {
    chromeArgs.unshift("--headless=new");
  }

  reporter.step("launching Chrome");
  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;
  let rateSetupReadCount = 0;
  let alternateTravelerAvailable = false;
  let bookerPatchPayload = null;
  const travelerPatchPayloads = [];
  const bookingPatchPayloads = [];
  let bookerRecord = {
    booker_name: "Georgina",
    company_id: 33,
    email: null,
    id: 17,
    phone: null,
  };
  let travelerRecord = {
    booker_id: 17,
    booker_name: "Georgina",
    company_id: 33,
    id: 30,
    traveler_name: "Tanya",
  };

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Fetch.enable", {
        patterns: [
          { requestStage: "Request", urlPattern: "*/api/admin-customer-accounts*" },
          { requestStage: "Request", urlPattern: "*/api/admin-companies-crm-identity*" },
          { requestStage: "Request", urlPattern: "*/api/admin-rate-setup*" },
          { requestStage: "Request", urlPattern: "*/api/admin-bookers*" },
          { requestStage: "Request", urlPattern: "*/api/admin-legacy-data/rest/v1/travelers*" },
          { requestStage: "Request", urlPattern: "*/api/admin-customer-saved-bookings*" },
          { requestStage: "Request", urlPattern: "*/api/admin-customer-invoices*" },
          { requestStage: "Request", urlPattern: "*/api/admin-bookings*" },
        ],
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

    client.on("Page.javascriptDialogOpening", () => {
      client.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });

    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      let responseBody;

      if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "GET") {
        responseBody = {
          accounts: [{
            customer_account: customerName,
            customer_id: customerId,
            guest_account_billing_enabled: false,
            verified_company_id: 33,
          }],
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-companies-crm-identity" && method === "GET") {
        responseBody = {
          company: {
            company_name: customerName,
            domain: "apollo.com",
            id: 33,
            operations_email: "operations@apollo.com",
            primary_contact_name: "Georgina",
          },
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-rate-setup" && method === "GET") {
        rateSetupReadCount += 1;
        responseBody = {
          companies: [{ company_name: customerName, id: 33 }],
          ok: true,
          settings: null,
          travelers: [
            travelerRecord,
            ...(alternateTravelerAvailable
              ? [{
                  booker_id: 17,
                  booker_name: "Georgina Cheung",
                  company_id: 33,
                  id: 31,
                  traveler_name: "Alternate Traveller",
                }]
              : []),
          ],
          version: "browser-corporate-identity-rate-setup",
        };
      } else if (requestUrl.pathname === "/api/admin-bookers" && method === "GET") {
        responseBody = {
          booker: bookerRecord,
          ok: true,
          version: "browser-corporate-identity-booker",
        };
      } else if (requestUrl.pathname === "/api/admin-bookers" && method === "PATCH") {
        bookerPatchPayload = JSON.parse(request.postData || "{}");
        bookerRecord = {
          ...bookerRecord,
          booker_name: bookerPatchPayload.booker_name,
          email: bookerPatchPayload.email,
          phone: bookerPatchPayload.phone,
        };
        responseBody = {
          booker: bookerRecord,
          ok: true,
          version: "browser-corporate-identity-booker",
        };
      } else if (
        requestUrl.pathname === "/api/admin-legacy-data/rest/v1/travelers" &&
        method === "PATCH"
      ) {
        const travelerPatchPayload = JSON.parse(request.postData || "{}");
        travelerPatchPayloads.push(travelerPatchPayload);
        travelerRecord = {
          ...travelerRecord,
          ...(travelerPatchPayload.booker_id ? { booker_id: travelerPatchPayload.booker_id } : {}),
          ...(travelerPatchPayload.booker_name ? { booker_name: travelerPatchPayload.booker_name } : {}),
          ...(travelerPatchPayload.traveler_name ? { traveler_name: travelerPatchPayload.traveler_name } : {}),
        };
        const returnedTraveler = {
          ...travelerRecord,
          booker_contact: travelerPatchPayload.booker_contact,
          booker_email: travelerPatchPayload.booker_email,
        };
        responseBody = requestUrl.searchParams.get("single") === "single"
          ? returnedTraveler
          : [returnedTraveler];
      } else if (requestUrl.pathname === "/api/admin-customer-saved-bookings" && method === "GET") {
        responseBody = {
          ok: true,
          saved_bookings: bookingReferences.map((reference, index) => ({
            booking_reference: reference,
            company_id: 33,
            customer_account: customerName,
            customer_id: customerId,
            customer_price_label: "$70.00",
            dropoff_location: "61 Grange Road",
            passenger_name: "Ms Tanya Sanwal",
            pickup_at: index === 0
              ? "2026-08-03T19:50:00+08:00"
              : "2026-08-03T07:00:00+08:00",
            pickup_location: "Airport",
            public_booking_reference: index === 0 ? "10860" : "10859",
            route_summary: "Airport > 61 Grange Road",
            service_type: "DEP",
          })),
          summary: { returned_count: 2 },
        };
      } else if (requestUrl.pathname === "/api/admin-customer-invoices" && method === "GET") {
        responseBody = { invoices: [], ok: true };
      } else if (requestUrl.pathname === "/api/admin-bookings" && method === "GET") {
        const requestedReference = requestUrl.searchParams.get("booking_reference");
        const bookingIndex = bookingReferences.indexOf(requestedReference);
        responseBody = {
          booking: {
            booking_reference: requestedReference,
            company_id: 33,
            contact_display_name: "Georgina Cheung",
            contact_email: "gcheung@apollo.com",
            contact_phone: "97359990",
            customer_display_name: customerName,
            customer_id: customerId,
            dropoff_location: "61 Grange Road",
            passenger_name: "Ms Tanya Sanwal",
            pickup_datetime: bookingIndex === 0
              ? "2026-08-03T19:50:00+08:00"
              : "2026-08-03T07:00:00+08:00",
            pickup_location: "Airport",
            public_booking_reference: bookingIndex === 0 ? "10860" : "10859",
            route_summary: "Airport > 61 Grange Road",
            service_type: "DEP",
          },
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-bookings" && method === "PATCH") {
        const payload = JSON.parse(request.postData || "{}");
        bookingPatchPayloads.push(payload);
        responseBody = {
          booking: {
            ...payload.booking,
            pickup_at: payload.booking.pickup_datetime,
            public_booking_reference:
              payload.target_booking_reference === bookingReferences[0] ? "10860" : "10859",
          },
          ok: true,
        };
      } else {
        responseBody = { error: "Unexpected corporate identity browser request.", ok: false };
      }

      client
        .send("Fetch.fulfillRequest", {
          body: Buffer.from(JSON.stringify(responseBody)).toString("base64"),
          requestId,
          responseCode: responseBody.ok === false ? 500 : 200,
          responseHeaders: responseHeaders(),
        })
        .catch(() => {});
    });

    const customerUrl = new URL(`/customers/${customerId}`, appUrl);
    customerUrl.searchParams.set("name", customerName);
    await navigateWithLoadEvent(client, customerUrl.toString());

    reporter.step("opening corporate profile identity editor");
    await waitForSelector(
      evaluate,
      `[data-customer-company-profile-edit="${customerId}"]`,
      "customer profile edit button",
    );
    await evaluate(`document.querySelector('[data-customer-company-profile-edit="${customerId}"]').click()`);
    await waitForSelector(
      evaluate,
      '[data-customer-edit-booker-traveler="17-30"]',
      "existing Booker and Traveller edit button",
    );
    await evaluate(`document.querySelector('[data-customer-edit-booker-traveler="17-30"]').click()`);
    await waitForCondition(
      async () => await evaluate(`document.querySelector('[data-customer-booker-name="true"]')?.value === "Georgina"`),
      10000,
      "existing corporate identity values",
    );

    assert.equal(await evaluate(setInputValueScript('[data-customer-booker-name="true"]', "Georgina Cheung")), true);
    assert.equal(await evaluate(setInputValueScript('[data-customer-traveler-name="true"]', "Ms Tanya Sanwal")), true);
    assert.equal(await evaluate(setInputValueScript('[data-customer-booker-email="true"]', "gcheung@apollo.com")), true);
    assert.equal(await evaluate(setInputValueScript('[data-customer-booker-contact="true"]', "97359990")), true);

    reporter.step("saving and reloading the exact corporate identity pair");
    await evaluate(`document.querySelector('[data-customer-save-booker-traveler="true"]').click()`);
    await waitForCondition(
      async () => await evaluate(`document.body.innerText.includes("Saved, reloaded, and verified this exact Booker and Traveller pair.")`),
      10000,
      "saved corporate identity confirmation",
    );

    const persistedForm = await evaluate(`(() => ({
      booker: document.querySelector('[data-customer-booker-name="true"]')?.value || "",
      contact: document.querySelector('[data-customer-booker-contact="true"]')?.value || "",
      email: document.querySelector('[data-customer-booker-email="true"]')?.value || "",
      traveller: document.querySelector('[data-customer-traveler-name="true"]')?.value || "",
    }))()`);
    assert.deepEqual(persistedForm, {
      booker: "Georgina Cheung",
      contact: "97359990",
      email: "gcheung@apollo.com",
      traveller: "Ms Tanya Sanwal",
    });
    assert.deepEqual(bookerPatchPayload, {
      booker_name: "Georgina Cheung",
      email: "gcheung@apollo.com",
      id: 17,
      phone: "97359990",
    });
    assert.equal(travelerPatchPayloads[0].traveler_name, "Ms Tanya Sanwal");
    assert.deepEqual(travelerPatchPayloads[1], {
      booker_contact: "97359990",
      booker_email: "gcheung@apollo.com",
      booker_name: "Georgina Cheung",
    });

    alternateTravelerAvailable = true;
    reporter.step("resolving two same-passenger legacy jobs once in Section 4");
    for (const reference of bookingReferences) {
      await waitForSelector(
        evaluate,
        `[data-customer-folder-saved-bookings-select="${reference}"]`,
        `saved booking selection ${reference}`,
      );
      await evaluate(`document.querySelector('[data-customer-folder-saved-bookings-select="${reference}"]').click()`);
    }
    await waitForSelector(
      evaluate,
      '[data-customer-folder-selected-identity-resolver="true"]',
      "selected-job Booker and Traveller resolver",
    );
    await waitForSelector(
      evaluate,
      '[data-customer-folder-selected-identity-pair="true"]',
      "combined Booker and Traveller choice",
    );
    const resolverState = await evaluate(`(() => ({
      disabledInvoiceBlockerCount: document.querySelectorAll('[data-customer-folder-create-invoice-selected-disabled="true"]').length,
      groupCount: document.querySelectorAll('[data-customer-folder-selected-identity-group]').length,
      pairOptionCount: document.querySelector('[data-customer-folder-selected-identity-pair="true"]')?.options?.length || 0,
      saveDisabled: document.querySelector('[data-customer-folder-selected-identity-save="true"]')?.disabled === true,
      selectedCount: document.querySelectorAll('[data-customer-folder-saved-bookings-select]:checked').length,
    }))()`);
    assert.deepEqual(resolverState, {
      disabledInvoiceBlockerCount: 0,
      groupCount: 1,
      pairOptionCount: 3,
      saveDisabled: true,
      selectedCount: 2,
    });

    assert.equal(
      await evaluate(`(() => {
        const selector = document.querySelector('[data-customer-folder-selected-identity-pair="true"]');
        if (!(selector instanceof HTMLSelectElement)) return false;
        selector.value = "30";
        selector.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`),
      true,
      "Expected the actual Booker and Traveller pair to be selectable once for both jobs.",
    );
    await waitForCondition(
      async () => await evaluate(
        `document.querySelector('[data-customer-folder-selected-identity-save="true"]')?.disabled === false`,
      ),
      10000,
      "selected-job identity save enabled after an exact pair choice",
    );

    await evaluate(`document.querySelector('[data-customer-folder-selected-identity-save="true"]').click()`);
    await waitForCondition(
      async () => await evaluate(`document.body.innerText.includes("Saved Booker / Traveller for 2 selected jobs.")`),
      10000,
      "batch identity saved confirmation",
    );
    assert.equal(
      await evaluate(`document.querySelector('[data-customer-folder-selected-identity-resolver="true"]') === null`),
      true,
      "The resolver must close after persisted success.",
    );
    assert.equal(
      await evaluate(`document.querySelectorAll('[data-customer-folder-saved-bookings-select]:checked').length`),
      2,
      "Selected jobs must remain selected after the batch save.",
    );
    assert.equal(bookingPatchPayloads.length, 2);
    assert.deepEqual(
      bookingPatchPayloads.map((payload) => ({
        bookerId: payload.booking.booker_id,
        companyId: payload.booking.company_id,
        reference: payload.target_booking_reference,
        travelerId: payload.booking.traveler_id,
      })),
      bookingReferences.map((reference) => ({
        bookerId: 17,
        companyId: 33,
        reference,
        travelerId: 30,
      })),
    );
    assert.ok(rateSetupReadCount >= 4, "Expected a fresh selected-job Booker and Traveller read after the profile save.");

    console.log(JSON.stringify(reporter.summary({
      errorCount: 0,
      ok: true,
      bookingPatchCount: bookingPatchPayloads.length,
      rateSetupReadCount,
    }), null, 2));
  } finally {
    await client?.close().catch(() => {});
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify(reporter.summary({
    error: normalizeErrorMessage(error),
    errorCount: 1,
    ok: false,
  }), null, 2));
  process.exitCode = 1;
});
