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
  waitForSelector,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary = process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9248);
const reporter = createBrowserTestReporter("admin-monthly-billing-dashboard-review-recheck-browser");
const blockedReference = "MONTHLY-RECHECK-BLOCKED";
const unpaidReference = "MONTHLY-RECHECK-UNPAID";

function responseHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "content-type", value: "application/json" },
  ];
}

function classificationJob({ bookingReference, displayReference, paymentStatus = null, status }) {
  return {
    billing_month: "2026-08",
    booker_id: 11,
    booking_reference: bookingReference,
    company_id: 7,
    customer_account: "Tiger Global (June)",
    customer_id: "197",
    display_booking_reference: displayReference,
    safe_billing_status: status,
    safe_payment_status: paymentStatus,
    safe_reason:
      paymentStatus === "unpaid"
        ? "An issued customer bill already covers this booking."
        : status === "blocked"
          ? "Completed booking closeout needs Admin review."
          : "Ready and not covered by an issued customer bill.",
  };
}

function monthlyBillingGroupsResponse(readNumber) {
  const blockedStatus = readNumber >= 2 ? "ready" : "blocked";
  const unpaidPaymentStatus = readNumber >= 4 ? "paid" : "unpaid";
  const jobs = [
    classificationJob({
      bookingReference: blockedReference,
      displayReference: "11901",
      status: blockedStatus,
    }),
    classificationJob({
      bookingReference: unpaidReference,
      displayReference: "11902",
      paymentStatus: unpaidPaymentStatus,
      status: "covered",
    }),
    classificationJob({
      bookingReference: "MONTHLY-PAID",
      displayReference: "11903",
      paymentStatus: "paid",
      status: "covered",
    }),
    classificationJob({
      bookingReference: "MONTHLY-READY",
      displayReference: "11904",
      status: "ready",
    }),
    classificationJob({
      bookingReference: "MONTHLY-COVERED-UNKNOWN",
      displayReference: "11905",
      status: "covered",
    }),
    classificationJob({
      bookingReference: "",
      displayReference: "11906",
      status: "blocked",
    }),
  ];

  return {
    groups: [{
      billing_month: "2026-08",
      blocked_count: blockedStatus === "blocked" ? 2 : 1,
      booker_id: 11,
      classified_count: jobs.length,
      company_id: 7,
      covered_count: 3,
      customer_account: "Tiger Global (June)",
      customer_id: "197",
      jobs,
      ready_count: blockedStatus === "ready" ? 2 : 1,
      safe_readiness_status: "mixed",
      total_count: jobs.length,
    }],
    ok: true,
    pagination: {
      has_next_page: false,
      page: 1,
      page_count: 1,
      page_size: 250,
      total_group_count: 1,
    },
    summary: {
      blocked_count: blockedStatus === "blocked" ? 2 : 1,
      classified_count: jobs.length,
      covered_count: 3,
      group_count: 1,
      ready_count: blockedStatus === "ready" ? 2 : 1,
      total_count: jobs.length,
    },
  };
}

function notificationResponse() {
  return {
    notifications: [{
      created_at: "2026-09-01T00:00:00.000Z",
      id: "monthly-billing-review-recheck-fixture",
      notification_status: "queued",
      notification_type: "monthly_billing",
      priority: "normal",
      safe_context: { billing_month: "2026-08" },
      safe_message: "Monthly billing classifications are ready for Admin review.",
      safe_title: "Monthly Billing Draft",
      updated_at: "2026-09-01T00:00:00.000Z",
      workflow_area: "monthly_billing_draft_prep",
    }],
    ok: true,
    pagination: {
      has_next_page: false,
      page: 1,
      page_count: 1,
      page_size: 5,
      total_notification_count: 1,
    },
  };
}

function exactBookingResponse(reference) {
  return {
    booking: {
      admin_internal_status: "confirmed",
      booker_id: 11,
      booking_reference: reference,
      company_id: 7,
      contact_display_name: "June",
      customer_display_name: "Tiger Global",
      customer_facing_status: "Confirmed",
      customer_id: 197,
      dropoff_location: "Raffles Place",
      passenger_name: "Synthetic Traveller",
      pickup_at: "2026-09-02T02:00:00.000Z",
      pickup_location: "Changi Airport",
      public_booking_reference: "11901",
      route_summary: "Changi Airport > Raffles Place",
      service_type: "MNG",
      traveler_id: 42,
    },
    ok: true,
  };
}

async function main() {
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-review-recheck-chrome-"));
  const chromeArgs = [
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-gpu",
    "--force-color-profile=srgb",
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

  const chromeProcess = spawn(chromeBinary, chromeArgs, { stdio: "ignore" });
  let client = null;
  let groupingReadCount = 0;
  let resolveReadCount = 0;
  let resolveRecheckStarted = false;
  const exactBookingReads = [];
  const mutationRequests = [];
  const protectedLaneRequests = [];
  const consoleErrors = [];

  try {
    reporter.step("launching Chrome");
    await waitForChromeDebugPort(chromeDebugPort);
    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
      client.send("Log.enable"),
      client.send("Fetch.enable", {
        patterns: [
          { requestStage: "Request", urlPattern: "*/api/admin-app-notifications*" },
          { requestStage: "Request", urlPattern: "*/api/admin-monthly-billing-groups*" },
          { requestStage: "Request", urlPattern: "*/api/admin-bookings?booking_reference=*" },
        ],
      }),
    ]);

    client.on("Network.requestWillBeSent", ({ request }) => {
      const method = request.method || "";
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        mutationRequests.push({ method, url: request.url });
      }
      if (
        method !== "GET" &&
        /\/(?:api\/)?(?:customers?.*invoice|admin-monthly-invoice|admin-booking-google-calendar|driver-job-calendar|admin-device-push|notification-outbox|push-subscription)/i.test(request.url)
      ) {
        protectedLaneRequests.push({ method, url: request.url });
      }
    });
    client.on("Runtime.consoleAPICalled", ({ args, type }) => {
      if (type === "error") consoleErrors.push(args.map((arg) => arg.value || arg.description || "").join(" "));
    });
    client.on("Log.entryAdded", ({ entry }) => {
      if (entry.level === "error") consoleErrors.push(entry.text || "Browser log error");
    });
    client.on("Fetch.requestPaused", ({ request, requestId }) => {
      const requestUrl = new URL(request.url);
      const fulfill = (responseCode, body) => client.send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
        requestId,
        responseCode,
        responseHeaders: responseHeaders(),
      }).catch(() => {});

      if (requestUrl.pathname === "/api/admin-app-notifications") {
        void fulfill(200, notificationResponse());
        return;
      }
      if (requestUrl.pathname === "/api/admin-monthly-billing-groups") {
        groupingReadCount += 1;
        if (resolveRecheckStarted) resolveReadCount += 1;
        void fulfill(200, monthlyBillingGroupsResponse(resolveReadCount));
        return;
      }

      const reference = requestUrl.searchParams.get("booking_reference") || "";
      exactBookingReads.push({ method: request.method, reference });
      setTimeout(() => void fulfill(200, exactBookingResponse(reference)), 200);
    });

    const evaluate = async (expression) => {
      const response = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
      return response.result?.value;
    };
    const click = (selector, twice = false) => evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      ${twice ? "button.click();" : ""}
      return true;
    })()`);
    const waitForRows = () => waitForSelector(
      evaluate,
      '[data-admin-monthly-billing-dashboard-classification-rows="true"]',
      "Monthly Billing Draft classification rows",
    );
    const rowExists = (reference) => evaluate(`[...document.querySelectorAll('[data-admin-monthly-billing-dashboard-classification-row]')].some((row) => row.textContent?.includes(${JSON.stringify(reference)}))`);
    const feedbackIncludes = (text) => waitForCondition(
      async () => (await evaluate(`document.querySelector('[data-admin-monthly-billing-dashboard-booking-feedback="true"]')?.textContent?.includes(${JSON.stringify(text)})`)) === true,
      5000,
      `feedback ${text}`,
    );

    await navigateWithLoadEvent(client, appUrl);
    await waitForRows();
    reporter.step("checking compact Review titles, plain status pills, and actionable Resolve controls");
    const desktopState = await evaluate(`(() => {
      const panel = document.querySelector('[data-admin-monthly-billing-dashboard-classifications="true"]');
      const review = document.querySelector('button[aria-label="Review booking 11901 in Dispatch"]');
      const resolve = document.querySelector('button[aria-label="Recheck booking 11901"]');
      const pills = [...document.querySelectorAll('[data-admin-monthly-billing-dashboard-status-pill="true"]')];
      return panel instanceof HTMLElement && review instanceof HTMLButtonElement && resolve instanceof HTMLButtonElement ? {
        labels: pills.map((pill) => pill.textContent?.trim()),
        missingReferenceReviewAbsent: !document.querySelector('button[aria-label="Review booking 11906 in Dispatch"]'),
        missingReferenceResolveAbsent: !document.querySelector('button[aria-label="Recheck booking 11906"]'),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        plainPills: pills.every((pill) => !(pill instanceof HTMLButtonElement) && !(pill instanceof HTMLAnchorElement)),
        resolveCount: panel.querySelectorAll('[data-admin-monthly-billing-dashboard-resolve-booking="true"]').length,
        resolveHeight: resolve.getBoundingClientRect().height,
        reviewCount: panel.querySelectorAll('[data-admin-monthly-billing-dashboard-review-booking="true"]').length,
        reviewHeight: review.getBoundingClientRect().height,
      } : null;
    })()`);
    assert.deepEqual(desktopState, {
      labels: ["Needs review", "Unpaid", "Paid", "Ready", "Already invoiced", "Needs review"],
      missingReferenceReviewAbsent: true,
      missingReferenceResolveAbsent: true,
      noHorizontalOverflow: true,
      plainPills: true,
      resolveCount: 2,
      resolveHeight: 44,
      reviewCount: 5,
      reviewHeight: 44,
    });

    reporter.step("checking Review uses one exact GET under a double click");
    assert.equal(await click('button[aria-label="Review booking 11901 in Dispatch"]', true), true);
    await waitForCondition(
      async () => (await evaluate(`document.querySelector('[data-app-tab="dispatch"]')?.getAttribute("aria-selected")`)) === "true",
      5000,
      "Dispatch exact booking load",
    );
    assert.deepEqual(exactBookingReads, [{ method: "GET", reference: blockedReference }]);
    await evaluate(`document.querySelector('[data-app-tab="dashboard"]')?.click()`);
    await waitForRows();
    await waitForCondition(
      async () => (await evaluate(`document.querySelector('button[aria-label="Recheck booking 11901"]')?.disabled`)) === false,
      5000,
      "blocked Resolve enabled after Review handoff",
    );

    reporter.step("checking blocked recheck retains, then removes only after fresh ready evidence");
    resolveRecheckStarted = true;
    assert.equal(await click('button[aria-label="Recheck booking 11901"]'), true);
    await feedbackIncludes("still needs review");
    assert.equal(await rowExists("11901"), true);
    assert.equal(await click('button[aria-label="Recheck booking 11901"]'), true);
    await feedbackIncludes("no longer actionable");
    assert.equal(await rowExists("11901"), false);

    reporter.step("checking unpaid recheck retains, then removes only after fresh paid evidence");
    assert.equal(await click('button[aria-label="Recheck booking 11902"]'), true);
    await feedbackIncludes("remains Unpaid");
    assert.equal(await rowExists("11902"), true);
    assert.equal(await click('button[aria-label="Recheck booking 11902"]'), true);
    await feedbackIncludes("no longer actionable");
    assert.equal(await rowExists("11902"), false);

    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 844,
      mobile: true,
      width: 390,
    });
    reporter.step("checking 390px light-mode layout remains compact and accessible");
    const mobileState = await evaluate(`(() => {
      const review = document.querySelector('button[aria-label="Review booking 11903 in Dispatch"]');
      return review instanceof HTMLButtonElement ? {
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        reviewHeight: review.getBoundingClientRect().height,
      } : null;
    })()`);
    assert.deepEqual(mobileState, {
      bodyBackground: "rgb(250, 250, 249)",
      noHorizontalOverflow: true,
      reviewHeight: 44,
    });

    const actionableConsoleErrors = consoleErrors.filter((message) =>
      !/Failed to load resource: the server responded with a status of (?:403|503) \((?:Forbidden|Service Unavailable)\)/.test(message),
    );
    assert.ok(groupingReadCount >= 5);
    assert.equal(resolveReadCount, 4);
    assert.deepEqual(mutationRequests, []);
    assert.deepEqual(protectedLaneRequests, []);
    assert.deepEqual(actionableConsoleErrors, []);

    console.log(JSON.stringify(reporter.summary({
      exactBookingReadCount: exactBookingReads.length,
      groupingReadCount,
      resolveReadCount,
      mobileWidth: 390,
      ok: true,
      protectedLaneRequestCount: protectedLaneRequests.length,
      unexpectedMutationCount: mutationRequests.length,
    }), null, 2));
  } finally {
    if (client) await client.close().catch(() => {});
    await terminateChildProcess(chromeProcess);
    await rm(chromeProfileDir, { force: true, recursive: true });
  }
}

await main();
