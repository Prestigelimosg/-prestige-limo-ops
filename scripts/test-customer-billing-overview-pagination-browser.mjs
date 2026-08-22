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

const appUrl = process.env.APP_URL || "http://localhost:3020";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9250);
const reporter = createBrowserTestReporter("customer-billing-overview-pagination-browser");

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

const accountFixtures = Array.from({ length: 32 }, (_, index) => {
  const accountNumber = index + 1;
  const customerId = String(1000 + accountNumber);
  const customerName = `Pagination Customer ${String(accountNumber).padStart(2, "0")}`;

  return {
    account_scope_key: "customer_account",
    account_scope_label: null,
    completed_count: 0,
    customer_account: customerName,
    customer_folder_active: true,
    customer_folder_key: `${customerId}::customer_account`,
    customer_id: customerId,
    guest_account_billing_enabled: false,
    latest_booking_reference: null,
    latest_public_booking_reference: null,
    latest_pickup_at: null,
    latest_service_type: null,
    saved_booking_count: 0,
    source: "customer_directory",
    upcoming_count: 0,
    verified_company_id: null,
  };
});

async function main() {
  const chromeProfileDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-customer-overview-pagination-chrome-"),
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
    "--window-size=1440,1000",
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
      consoleErrors.push(
        exceptionDetails.exception?.description || exceptionDetails.text || "Runtime exception",
      );
    });
    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      requests.push({ method, path: requestUrl.pathname, search: requestUrl.search });
      let responseBody;
      let responseCode = 200;

      if (requestUrl.pathname === "/api/admin-customer-accounts" && method === "GET") {
        responseBody = {
          accounts: accountFixtures,
          ok: true,
          summary: {
            recent_read_count: 0,
            returned_count: accountFixtures.length,
            total_account_count: accountFixtures.length,
          },
        };
      } else if (
        requestUrl.pathname === "/api/admin-customer-saved-bookings" &&
        method === "GET"
      ) {
        responseBody = {
          ok: true,
          saved_bookings: [],
          summary: { returned_count: 0 },
        };
      } else if (requestUrl.pathname === "/api/admin-customer-invoices" && method === "GET") {
        responseBody = { invoices: [], ok: true };
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

    await navigateWithLoadEvent(client, new URL("/customers", appUrl).toString());
    reporter.step("loading 32 guarded customer accounts");
    await waitForCondition(
      () => evaluate(`Boolean(document.querySelector('[data-customer-billing-overview-load-accounts="true"]'))`),
      10000,
      "Customer Billing Overview Load Accounts control",
    );
    await evaluate(`document.querySelector('[data-customer-billing-overview-load-accounts="true"]').click()`);

    const pageOneState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const rows = [...document.querySelectorAll('[data-customer-billing-overview-row]')];
          const pages = [...document.querySelectorAll('[data-customer-billing-overview-page]')];
          const feedback = document.querySelector('[data-customer-billing-overview-feedback]')?.textContent.trim() || "";
          if (rows.length !== 15 || pages.length !== 3 || !feedback.includes("Showing 1-15 of 32 customers")) {
            return false;
          }
          const scrollBox = document.querySelector('[data-customer-billing-overview-scroll="true"]');
          const pageNumbers = document.querySelector('[data-customer-billing-overview-page-numbers="true"]');
          const scrollRect = scrollBox?.getBoundingClientRect();
          const pageRect = pageNumbers?.getBoundingClientRect();
          return {
            feedback,
            firstName: rows[0]?.querySelector('a')?.textContent.trim() || "",
            lastName: rows.at(-1)?.querySelector('a')?.textContent.trim() || "",
            pageLabels: pages.map((page) => page.textContent.trim()),
            pageNumbersRightAligned: Boolean(
              scrollRect && pageRect && Math.abs(scrollRect.right - pageRect.right) <= 2
            ),
            scrollable: Boolean(scrollBox && scrollBox.scrollHeight > scrollBox.clientHeight),
          };
        })()`),
      10000,
      "15-row Customer Billing Overview page one",
    );

    assert.equal(pageOneState.firstName, "Pagination Customer 01");
    assert.equal(pageOneState.lastName, "Pagination Customer 15");
    assert.deepEqual(pageOneState.pageLabels, ["1", "2", "3"]);
    assert.equal(pageOneState.pageNumbersRightAligned, true);
    assert.equal(pageOneState.scrollable, true);

    reporter.step("opening clickable customer page two");
    await evaluate(`document.querySelector('[data-customer-billing-overview-page="2"]').click()`);
    const pageTwoState = await waitForCondition(
      () => evaluate(`(() => {
        const rows = [...document.querySelectorAll('[data-customer-billing-overview-row]')];
        const feedback = document.querySelector('[data-customer-billing-overview-feedback]')?.textContent.trim() || "";
        return rows.length === 15 && feedback.includes("Showing 16-30 of 32 customers")
          ? {
              firstName: rows[0]?.querySelector('a')?.textContent.trim() || "",
              lastName: rows.at(-1)?.querySelector('a')?.textContent.trim() || "",
            }
          : false;
      })()`),
      10000,
      "Customer Billing Overview page two",
    );
    assert.equal(pageTwoState.firstName, "Pagination Customer 16");
    assert.equal(pageTwoState.lastName, "Pagination Customer 30");

    reporter.step("opening clickable customer page three");
    await evaluate(`document.querySelector('[data-customer-billing-overview-page="3"]').click()`);
    const pageThreeState = await waitForCondition(
      () => evaluate(`(() => {
        const rows = [...document.querySelectorAll('[data-customer-billing-overview-row]')];
        const feedback = document.querySelector('[data-customer-billing-overview-feedback]')?.textContent.trim() || "";
        return rows.length === 2 && feedback.includes("Showing 31-32 of 32 customers")
          ? rows.map((row) => row.querySelector('a')?.textContent.trim() || "")
          : false;
      })()`),
      10000,
      "Customer Billing Overview page three",
    );
    assert.deepEqual(pageThreeState, ["Pagination Customer 31", "Pagination Customer 32"]);
    assert.equal(
      requests.some(
        (request) =>
          request.path === "/api/admin-customer-accounts" &&
          request.search === "?limit=1000",
      ),
      true,
    );
    assert.equal(
      requests.some((request) => request.method !== "GET"),
      false,
      "Customer overview pagination must remain read-only.",
    );
    assert.deepEqual(consoleErrors, []);

    console.log(
      JSON.stringify(
        reporter.summary({
          accountCount: accountFixtures.length,
          pageOneRows: 15,
          pageThreeRows: 2,
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
