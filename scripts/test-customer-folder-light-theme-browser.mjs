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

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary = process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9241);
const reporter = createBrowserTestReporter("customer-folder-light-theme-browser");
const customerId = "161";
const customerName = "Light Theme Test Account";
const phoneWidths = [390, 430, 440];
const viewports = [...phoneWidths, 1280];

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-folder-theme-chrome-"));
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
      consoleErrors.push(exceptionDetails.exception?.description || exceptionDetails.text || "Runtime exception");
    });
    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      requests.push(`${method} ${requestUrl.pathname}`);
      let responseBody;

      if (method !== "GET") {
        responseBody = { error: "Writer request blocked by Customer folder theme test.", ok: false };
      } else if (requestUrl.pathname === "/api/admin-customer-saved-bookings") {
        responseBody = {
          ok: true,
          saved_bookings: [{
            booking_reference: "theme-row-001",
            customer_account: customerName,
            customer_id: customerId,
            customer_price_label: "$70.00",
            dropoff_location: "Changi Airport T3",
            passenger_name: "Theme Passenger",
            pickup_at: "2026-08-21T10:00:00+08:00",
            pickup_location: "Raffles Singapore",
            public_booking_reference: "10882",
            route_summary: "Raffles Singapore > Changi Airport T3",
            service_type: "Event / VIP Movement",
          }],
          summary: { returned_count: 1 },
        };
      } else if (requestUrl.pathname === "/api/admin-customer-invoices") {
        responseBody = {
          invoices: [
            {
              amountCents: 7000,
              amountLabel: "$70.00",
              customerId,
              customerName,
              documentState: "issued",
              documentType: "invoice",
              invoiceNumber: "THEME-0002",
              issueDateLabel: "05 Aug 2026",
              lineItems: [{ amountLabel: "$70.00", description: "THEME TEST INVOICE ITEM 2" }],
              reference: "theme-invoice-002",
              status: "Paid",
            },
            {
              amountCents: 7000,
              amountLabel: "$70.00",
              customerId,
              customerName,
              documentState: "issued",
              documentType: "invoice",
              invoiceNumber: "THEME-0001",
              issueDateLabel: "04 Aug 2026",
              lineItems: [{ amountLabel: "$70.00", description: "THEME TEST INVOICE ITEM 1" }],
              reference: "theme-invoice-001",
              status: "Paid",
            },
          ],
          ok: true,
        };
      } else if (requestUrl.pathname === "/api/admin-customer-accounts") {
        responseBody = {
          accounts: [{
            customer_account: customerName,
            customer_id: customerId,
            guest_account_billing_enabled: false,
            verified_company_id: null,
          }],
          ok: true,
        };
      } else {
        responseBody = { error: `Unexpected read ${requestUrl.pathname}`, ok: false };
      }

      client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify(responseBody)).toString("base64"),
        requestId,
        responseCode: responseBody.ok ? 200 : 500,
        responseHeaders: responseHeaders(),
      }).catch(() => {});
    });

    const customerUrl = new URL(`/customers/${customerId}`, appUrl);
    customerUrl.searchParams.set("name", customerName);
    const results = [];

    for (const width of viewports) {
      reporter.step(`verifying ${width}px light Customer folder`);
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: 1000,
        mobile: width < 768,
        width,
      });
      await navigateWithLoadEvent(client, customerUrl.toString());
      await waitForCondition(
        () => evaluate(`document.querySelectorAll('[data-customer-folder-sector]').length === 4`),
        10000,
        `${width}px four Customer folder sectors`,
      );
      await waitForCondition(
        () => evaluate(`document.body.textContent.includes("10882")`),
        10000,
        `${width}px intercepted pending booking reference`,
      );
      await waitForCondition(
        () => evaluate(`document.querySelectorAll('[data-customer-invoice-folder-row]').length === 2`),
        10000,
        `${width}px two intercepted invoice rows`,
      );

      const state = await evaluate(`(() => {
        const tokenProbe = document.createElement('div');
        tokenProbe.className = 'border border-slate-300 bg-stone-50 text-slate-600';
        tokenProbe.style.position = 'fixed';
        tokenProbe.style.pointerEvents = 'none';
        tokenProbe.style.visibility = 'hidden';
        document.body.append(tokenProbe);
        const tokenStyle = getComputedStyle(tokenProbe);
        const whiteProbe = document.createElement('div');
        whiteProbe.className = 'bg-white';
        whiteProbe.style.position = 'fixed';
        whiteProbe.style.pointerEvents = 'none';
        whiteProbe.style.visibility = 'hidden';
        document.body.append(whiteProbe);
        const whiteStyle = getComputedStyle(whiteProbe);
        const sectors = [...document.querySelectorAll('[data-customer-folder-sector]')];
        const sectorStyles = sectors.map((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderLeftWidth: style.borderLeftWidth,
            borderTopWidth: style.borderTopWidth,
            borderColor: style.borderTopColor,
          };
        });
        const labels = sectors.map((element) => element.querySelector('p')?.textContent?.trim() || "");
        const invoiceHeader = document.querySelector('[data-customer-folder-sector="invoices"] > div');
        const invoiceMessage = document.querySelector('[data-customer-folder-sector="invoices"] > p');
        const invoiceRows = [...document.querySelectorAll('[data-customer-invoice-folder-row]')];
        const invoiceTableHeader = document.querySelector('[data-customer-invoice-folder-table] thead tr');
        const selectedItemHeader = document.querySelector('[data-customer-invoice-folder-selected-item-table] thead tr');
        const selectedItemRows = [...document.querySelectorAll('[data-customer-invoice-folder-selected-item-table] tbody tr')];
        const pendingHeader = document.querySelector('[data-customer-folder-sector="unbilled-jobs"] thead');
        return {
          bodyBackground: getComputedStyle(document.querySelector('main')).backgroundColor,
          documentWidth: document.documentElement.scrollWidth,
          invoiceHeaderBackground: invoiceHeader ? getComputedStyle(invoiceHeader).backgroundColor : "",
          invoiceHeaderBorder: invoiceHeader ? getComputedStyle(invoiceHeader).borderBottomColor : "",
          invoiceMessageBorder: invoiceMessage ? getComputedStyle(invoiceMessage).borderBottomColor : "",
          invoiceRowBorders: invoiceRows.map((row) => ({
            color: getComputedStyle(row).borderBottomColor,
            width: getComputedStyle(row).borderBottomWidth,
          })),
          invoiceTableHeaderBorder: invoiceTableHeader ? getComputedStyle(invoiceTableHeader).borderBottomColor : "",
          labels,
          pendingHeaderBackground: pendingHeader ? getComputedStyle(pendingHeader).backgroundColor : "",
          pendingHeaderText: pendingHeader ? getComputedStyle(pendingHeader).color : "",
          selectedItemHeaderBorder: selectedItemHeader ? getComputedStyle(selectedItemHeader).borderBottomColor : "",
          selectedItemRowBorders: selectedItemRows.map((row) => ({
            color: getComputedStyle(row).borderBottomColor,
            width: getComputedStyle(row).borderBottomWidth,
          })),
          sectorStyles,
          tokens: {
            slate300: tokenStyle.borderTopColor,
            slate600: tokenStyle.color,
            stone50: tokenStyle.backgroundColor,
            white: whiteStyle.backgroundColor,
          },
          viewportWidth: document.documentElement.clientWidth,
        };
      })()`);

      assert.equal(state.bodyBackground, state.tokens.stone50, `${width}px page uses stone-50.`);
      assert.equal(state.documentWidth, state.viewportWidth, `${width}px page must not overflow horizontally.`);
      assert.deepEqual(
        state.sectorStyles,
        Array.from({ length: 4 }, () => ({
          backgroundColor: state.tokens.white,
          borderLeftWidth: "1px",
          borderTopWidth: "1px",
          borderColor: state.tokens.slate300,
        })),
        `${width}px four sectors retain one-pixel slate-300 light surfaces.`,
      );
      assert.deepEqual(state.labels, [
        "1 · Customer profile & invoice prefix",
        "2 · Total invoices",
        "3 · Pending jobs for payment",
        "4 · Selected jobs invoice review",
      ]);
      assert.equal(state.invoiceHeaderBackground, state.pendingHeaderBackground);
      assert.equal(state.invoiceHeaderBorder, state.tokens.slate300);
      assert.equal(state.invoiceMessageBorder, state.tokens.slate300);
      assert.equal(state.invoiceTableHeaderBorder, state.tokens.slate300);
      assert.deepEqual(state.invoiceRowBorders, [
        { color: state.tokens.slate300, width: "1px" },
        { color: state.tokens.slate300, width: "0px" },
      ]);
      assert.equal(state.selectedItemHeaderBorder, state.tokens.slate300);
      assert.deepEqual(state.selectedItemRowBorders, [
        { color: state.tokens.slate300, width: "0px" },
      ]);

      assert.equal(state.pendingHeaderText, state.tokens.slate600);
      results.push({ width, ...state });
    }

    assert.deepEqual(
      requests.filter((request) => !request.startsWith("GET ")),
      [],
      "Customer folder light-theme verification must issue zero writer requests.",
    );
    assert.deepEqual(consoleErrors, [], "Customer folder light-theme verification must have no console/runtime errors.");

    console.log(JSON.stringify(reporter.summary({ errorCount: 0, ok: true, requests, results }), null, 2));
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
