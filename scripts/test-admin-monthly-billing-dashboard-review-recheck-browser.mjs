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
const reporter = createBrowserTestReporter("admin-monthly-billing-dashboard-action-queue-browser");
const blockedReference = "MONTHLY-ACTION-BLOCKED";
const unpaidReference = "MONTHLY-ACTION-UNPAID";

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

function monthlyBillingGroupsResponse() {
  const jobs = [
    classificationJob({
      bookingReference: blockedReference,
      displayReference: "11901",
      status: "blocked",
    }),
    classificationJob({
      bookingReference: unpaidReference,
      displayReference: "11902",
      paymentStatus: "unpaid",
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
      blocked_count: 2,
      booker_id: 11,
      classified_count: jobs.length,
      company_id: 7,
      covered_count: 3,
      customer_account: "Tiger Global (June)",
      customer_id: "197",
      jobs,
      ready_count: 1,
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
      blocked_count: 2,
      classified_count: jobs.length,
      covered_count: 3,
      group_count: 1,
      ready_count: 1,
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
  const chromeProfileDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-action-queue-chrome-"));
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
        void fulfill(200, monthlyBillingGroupsResponse());
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
    await navigateWithLoadEvent(client, appUrl);
    await waitForRows();
    reporter.step("checking the compact action queue keeps Review and omits non-actionable rows and Resolve");
    const desktopState = await evaluate(`(() => {
      const panel = document.querySelector('[data-admin-monthly-billing-dashboard-classifications="true"]');
      const sector = document.querySelector('[data-admin-monthly-billing-dashboard-sector="true"]');
      const monthlyNotification = document.querySelector('[data-admin-monthly-billing-dashboard-notification="true"]');
      const activeJobs = document.querySelector('[data-admin-multi-driver-active-jobs-monitor="true"]');
      const review = document.querySelector('button[aria-label="Review booking 11901 in Dispatch"]');
      const pills = [...document.querySelectorAll('[data-admin-monthly-billing-dashboard-status-pill="true"]')];
      return panel instanceof HTMLElement ? {
        afterActiveJobs: activeJobs instanceof HTMLElement && sector instanceof HTMLElement &&
          Boolean(activeJobs.compareDocumentPosition(sector) & Node.DOCUMENT_POSITION_FOLLOWING),
        heading: panel.querySelector('p')?.textContent?.trim(),
        isBottomSector: sector instanceof HTMLElement && sector.parentElement?.lastElementChild === sector,
        monthlyNotificationAtBottom: sector instanceof HTMLElement && monthlyNotification instanceof HTMLElement &&
          sector.contains(monthlyNotification),
        monthlyNotificationBeforeActiveAbsent: activeJobs instanceof HTMLElement && monthlyNotification instanceof HTMLElement &&
          Boolean(activeJobs.compareDocumentPosition(monthlyNotification) & Node.DOCUMENT_POSITION_FOLLOWING),
        monthlyNotificationCount: document.querySelectorAll('[data-admin-monthly-billing-dashboard-notification="true"]').length,
        monthlyNotificationDoneLabel: monthlyNotification?.querySelector('[data-admin-app-notification-action="read"]')?.textContent?.trim(),
        monthlyNotificationTitle: monthlyNotification?.querySelector('[data-admin-app-notification-feed-title="true"]')?.textContent?.trim(),
        monthlySectorCount: document.querySelectorAll('[data-admin-monthly-billing-dashboard-classifications="true"]').length,
        notificationFeedMonthlyRowAbsent: !document.querySelector('[data-admin-app-notification-feed-rows="true"] [data-admin-monthly-billing-dashboard-notification="true"]'),
        outsideNotificationRow: !panel.closest('[data-admin-app-notification-feed-row="true"]'),
        panelText: panel.textContent?.trim(),
        reviewPresent: review instanceof HTMLButtonElement,
        labels: pills.map((pill) => pill.textContent?.trim()),
        missingReferenceReviewAbsent: !document.querySelector('button[aria-label="Review booking 11906 in Dispatch"]'),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
        nonActionableReferencesAbsent: !["11903", "11904", "11905"].some((reference) => panel.textContent?.includes(reference)),
        plainPills: pills.every((pill) => !(pill instanceof HTMLButtonElement) && !(pill instanceof HTMLAnchorElement)),
        resolveAbsent: !panel.querySelector('[data-admin-monthly-billing-dashboard-resolve-booking="true"]') && !panel.textContent?.includes("Resolve"),
        reviewCount: panel.querySelectorAll('[data-admin-monthly-billing-dashboard-review-booking="true"]').length,
        reviewHeight: review instanceof HTMLButtonElement ? review.getBoundingClientRect().height : null,
      } : null;
    })()`);
    assert.deepEqual(desktopState, {
      afterActiveJobs: true,
      heading: "3 jobs need Monthly Billing action for August 2026",
      isBottomSector: true,
      monthlyNotificationAtBottom: true,
      monthlyNotificationBeforeActiveAbsent: true,
      monthlyNotificationCount: 1,
      monthlyNotificationDoneLabel: "Done",
      monthlyNotificationTitle: "Monthly Billing Draft",
      monthlySectorCount: 1,
      notificationFeedMonthlyRowAbsent: true,
      outsideNotificationRow: true,
      panelText: "3 jobs need Monthly Billing action for August 202611901 · Tiger Global (June)Completed booking closeout needs Admin review.Needs review11902 · Tiger Global (June)An issued customer bill already covers this booking.Unpaid11906 · Tiger Global (June)Completed booking closeout needs Admin review.Needs review",
      reviewPresent: true,
      labels: ["Needs review", "Unpaid", "Needs review"],
      missingReferenceReviewAbsent: true,
      noHorizontalOverflow: true,
      nonActionableReferencesAbsent: true,
      plainPills: true,
      resolveAbsent: true,
      reviewCount: 2,
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
    assert.equal(await evaluate(`document.querySelector('[data-admin-monthly-billing-dashboard-resolve-booking="true"]')`), null);

    await client.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: 844,
      mobile: true,
      width: 390,
    });
    reporter.step("checking 390px light-mode layout remains compact and accessible");
    const mobileState = await evaluate(`(() => {
      const review = document.querySelector('button[aria-label="Review booking 11902 in Dispatch"]');
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
    assert.ok(groupingReadCount >= 2);
    assert.deepEqual(mutationRequests, []);
    assert.deepEqual(protectedLaneRequests, []);
    assert.deepEqual(actionableConsoleErrors, []);

    console.log(JSON.stringify(reporter.summary({
      exactBookingReadCount: exactBookingReads.length,
      groupingReadCount,
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
