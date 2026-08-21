import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createBrowserTestReporter,
  createChromeClient,
  navigateWithLoadEvent,
  normalizeConsoleMessages,
  normalizeErrorMessage,
  terminateChildProcess,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9241);
const reporter = createBrowserTestReporter("customer-portal-view-details-browser");
const targetBookingId = "saved-VIEW-002";

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

function upcomingPickupAt(dayOffset) {
  const pickupAt = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
  pickupAt.setUTCHours(9 + (dayOffset % 6), 0, 0, 0);
  return pickupAt.toISOString();
}

const savedBookingsPayload = {
  ok: true,
  pagination: {
    has_next_page: false,
    has_previous_page: false,
    page: 1,
    page_size: 25,
  },
  saved_bookings: Array.from({ length: 10 }, (_, index) => ({
    booking_month: upcomingPickupAt(index + 1).slice(0, 7),
    booking_reference: `VIEW-${String(index + 1).padStart(3, "0")}`,
    created_at: new Date().toISOString(),
    customer_driver_details: null,
    customer_facing_status: "confirmed",
    dropoff_location: index % 2 === 0 ? "Changi Airport T3" : "Raffles Singapore",
    passenger_name: `Viewport Passenger ${index + 1}`,
    pickup_at: upcomingPickupAt(index + 1),
    pickup_location: index % 2 === 0 ? "Marina Bay Sands" : "Orchard Hotel Singapore",
    public_booking_reference: String(99101 + index),
    service_type: index % 2 === 0 ? "Airport Departure" : "Point-to-Point Transfer",
    updated_at: new Date().toISOString(),
  })),
  version: "customer-view-details-browser-fixture",
};

async function main() {
  const chromeProfileDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-customer-view-details-chrome-"),
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
    "--window-size=390,844",
    "about:blank",
  ];

  if (!/^(1|true|yes)$/i.test(process.env.PRESTIGE_BROWSER_VISIBLE || "")) {
    chromeArgs.unshift("--headless=new");
  }

  reporter.step("launching Chrome");
  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;
  const apiCalls = [];
  const browserErrors = [];
  const browserConsoleErrors = [];

  try {
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Fetch.enable", {
        patterns: [{ requestStage: "Request", urlPattern: "*/api/*" }],
      }),
      client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 3,
        height: 844,
        mobile: true,
        width: 390,
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

    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      browserErrors.push(
        exceptionDetails?.exception?.description ||
          exceptionDetails?.text ||
          "Unknown browser exception",
      );
    });
    client.on("Runtime.consoleAPICalled", ({ args = [], type }) => {
      if (type === "error") {
        browserConsoleErrors.push(
          normalizeConsoleMessages(
            args.map((value) => value?.value ?? value?.description ?? ""),
          ),
        );
      }
    });

    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const method = request.method || "GET";
      apiCalls.push(`${method} ${requestUrl.pathname}`);
      let responseBody;
      let responseCode = 200;

      if (requestUrl.pathname === "/api/customer-saved-bookings" && method === "GET") {
        responseBody = savedBookingsPayload;
      } else if (requestUrl.pathname === "/api/customer-app-notifications" && method === "GET") {
        responseBody = {
          delivery_surface: "customer_app",
          external_send: false,
          notification_count: 0,
          notifications: [],
          ok: true,
          provider_send: false,
          version: "customer-view-details-browser-fixture",
        };
      } else if (requestUrl.pathname === "/api/customer-invoices" && method === "GET") {
        responseBody = { invoices: [], ok: true };
      } else if (requestUrl.pathname === "/api/customer-device-push-subscriptions" && method === "GET") {
        responseBody = {
          ok: true,
          readiness: { enabled: false, public_key: null, ready: false },
        };
      } else if (requestUrl.pathname === "/api/company-profile" && method === "GET") {
        responseBody = { ok: false };
      } else {
        responseBody = { error: "Unexpected Customer View-details browser request.", ok: false };
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

    await navigateWithLoadEvent(client, new URL("/my-bookings", appUrl).toString());
    reporter.step("opening mocked Customer My Bookings");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const rows = document.querySelectorAll("[data-customer-portal-row]");
          const button = document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]');

          if (rows.length !== 10 || !button) {
            return false;
          }

          const reactPropsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
          return Boolean(
            reactPropsKey &&
              button[reactPropsKey] &&
              typeof button[reactPropsKey].onClick === "function"
          );
        })()`),
      10000,
      "hydrated non-final Customer View details control",
    );

    const initialState = await evaluate(`(() => {
      const rows = [...document.querySelectorAll("[data-customer-portal-row]")];
      const targetButton = document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]');
      const targetRow = rows.find((row) => row.contains(targetButton));
      const targetRowStyle = targetRow ? window.getComputedStyle(targetRow) : null;
      return {
        detailCount: document.querySelectorAll("[data-customer-portal-detail]").length,
        documentWidth: document.documentElement.scrollWidth,
        rowCount: rows.length,
        rowBorderColor: targetRowStyle?.borderTopColor || "",
        rowBorderWidths: targetRowStyle
          ? [
              targetRowStyle.borderTopWidth,
              targetRowStyle.borderRightWidth,
              targetRowStyle.borderBottomWidth,
              targetRowStyle.borderLeftWidth,
            ]
          : [],
        targetButtonText: targetButton?.textContent?.trim() || "",
        targetIsNonFinal: rows.findIndex((row) => row.contains(targetButton)) < rows.length - 1,
        viewportWidth: document.documentElement.clientWidth,
      };
    })()`);

    assert.deepEqual(initialState, {
      detailCount: 0,
      documentWidth: 390,
      rowCount: 10,
      rowBorderColor: "rgb(148, 163, 184)",
      rowBorderWidths: ["1px", "1px", "1px", "1px"],
      targetButtonText: "View details",
      targetIsNonFinal: true,
      viewportWidth: 390,
    });
    assert.equal(apiCalls.some((call) => !call.startsWith("GET ")), false);

    await evaluate(`(() => {
      window.scrollTo({ left: 0, top: 0 });
      document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]').click();
    })()`);
    await evaluate(`new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    })`);

    const expandedState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const detail = document.querySelector('[data-customer-portal-detail="${targetBookingId}"]');
          const rect = detail?.getBoundingClientRect();
          const button = document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]');
          const detailStyle = detail ? window.getComputedStyle(detail) : null;

          if (!detail || button?.textContent?.trim() !== "Hide details") {
            return false;
          }

          return {
            detailHasDriverDetails: Boolean(
              detail.querySelector("[data-customer-portal-driver-details-card]"),
            ),
            detailHasTracking: Boolean(
              detail.querySelector("[data-customer-portal-driver-tracking]"),
            ),
            detailBorderColor: detailStyle?.borderTopColor || "",
            detailBorderWidths: detailStyle
              ? [
                  detailStyle.borderTopWidth,
                  detailStyle.borderRightWidth,
                  detailStyle.borderBottomWidth,
                  detailStyle.borderLeftWidth,
                ]
              : [],
            detailText: detail.innerText,
            detailVisibleInViewport: Boolean(
              rect && rect.bottom > 0 && rect.top < window.innerHeight
            ),
            documentWidth: document.documentElement.scrollWidth,
            targetButtonText: button.textContent.trim(),
            viewportWidth: document.documentElement.clientWidth,
          };
        })()`),
      10000,
      "expanded Customer detail panel",
    );

    assert.equal(
      expandedState.detailVisibleInViewport,
      true,
      "Manual View details must bring the existing exact detail panel into the viewport",
    );
    assert.equal(expandedState.targetButtonText, "Hide details");
    assert.equal(expandedState.detailBorderColor, "rgb(148, 163, 184)");
    assert.deepEqual(expandedState.detailBorderWidths, ["1px", "1px", "1px", "1px"]);
    assert.equal(expandedState.detailText.includes("Booking Details"), true);
    assert.equal(expandedState.detailText.includes("Driver Tracking"), true);
    assert.equal(expandedState.detailText.includes("Trip Updates"), true);
    assert.equal(expandedState.detailHasDriverDetails, false);
    assert.equal(expandedState.detailHasTracking, true);
    assert.equal(expandedState.documentWidth, expandedState.viewportWidth);
    assert.equal(apiCalls.some((call) => !call.startsWith("GET ")), false);

    await evaluate(
      `document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]').click()`,
    );
    await waitForCondition(
      () =>
        evaluate(`
          document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]')
            ?.textContent?.trim() === "View details" &&
          !document.querySelector('[data-customer-portal-detail="${targetBookingId}"]')
        `),
      10000,
      "collapsed Customer detail panel",
    );
    assert.equal(apiCalls.some((call) => !call.startsWith("GET ")), false);

    for (const viewport of [
      { height: 932, width: 430 },
      { height: 956, width: 440 },
    ]) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 3,
        height: viewport.height,
        mobile: true,
        width: viewport.width,
      });
      await navigateWithLoadEvent(client, new URL("/my-bookings", appUrl).toString());
      await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]');

            if (document.querySelectorAll("[data-customer-portal-row]").length !== 10 || !button) {
              return false;
            }

            const reactPropsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
            return Boolean(
              reactPropsKey &&
                button[reactPropsKey] &&
                typeof button[reactPropsKey].onClick === "function"
            );
          })()`),
        10000,
        `${viewport.width}px hydrated Customer View details control`,
      );
      await evaluate(`(() => {
        window.scrollTo({ left: 0, top: 0 });
        document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]').click();
      })()`);
      await evaluate(`new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      })`);
      const viewportState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const detail = document.querySelector('[data-customer-portal-detail="${targetBookingId}"]');
            const rect = detail?.getBoundingClientRect();
            const button = document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]');
            const row = button?.closest("[data-customer-portal-row]");
            const detailStyle = detail ? window.getComputedStyle(detail) : null;
            const rowStyle = row ? window.getComputedStyle(row) : null;

            if (!detail || button?.textContent?.trim() !== "Hide details") {
              return false;
            }

            return {
              detailBorderColor: detailStyle?.borderTopColor || "",
              detailBorderWidths: detailStyle
                ? [
                    detailStyle.borderTopWidth,
                    detailStyle.borderRightWidth,
                    detailStyle.borderBottomWidth,
                    detailStyle.borderLeftWidth,
                  ]
                : [],
              detailVisibleInViewport: Boolean(
                rect && rect.bottom > 0 && rect.top < window.innerHeight
              ),
              documentWidth: document.documentElement.scrollWidth,
              rowBorderColor: rowStyle?.borderTopColor || "",
              rowBorderWidths: rowStyle
                ? [
                    rowStyle.borderTopWidth,
                    rowStyle.borderRightWidth,
                    rowStyle.borderBottomWidth,
                    rowStyle.borderLeftWidth,
                  ]
                : [],
              viewportWidth: document.documentElement.clientWidth,
            };
          })()`),
        10000,
        `${viewport.width}px expanded Customer detail panel`,
      );
      assert.equal(viewportState.detailVisibleInViewport, true);
      assert.equal(viewportState.detailBorderColor, "rgb(148, 163, 184)");
      assert.deepEqual(viewportState.detailBorderWidths, ["1px", "1px", "1px", "1px"]);
      assert.equal(viewportState.documentWidth, viewportState.viewportWidth);
      assert.equal(viewportState.rowBorderColor, "rgb(148, 163, 184)");
      assert.deepEqual(viewportState.rowBorderWidths, ["1px", "1px", "1px", "1px"]);
      await evaluate(
        `document.querySelector('[data-customer-portal-detail-button="${targetBookingId}"]').click()`,
      );
    }

    assert.deepEqual(browserErrors, []);
    assert.deepEqual(browserConsoleErrors, []);
    assert.equal(apiCalls.some((call) => !call.startsWith("GET ")), false);

    console.log(
      JSON.stringify(
        reporter.summary({
          apiCalls,
          errorCount: 0,
          ok: true,
          targetBookingId,
          viewports: ["390x844", "430x932", "440x956"],
        }),
        null,
        2,
      ),
    );
  } finally {
    await client?.close().catch(() => {});
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      reporter.summary({
        error: normalizeErrorMessage(error),
        errorCount: 1,
        ok: false,
      }),
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
