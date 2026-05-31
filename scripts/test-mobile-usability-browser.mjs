import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createChromeClient,
  navigateAndWaitForBodyText,
  normalizeConsoleMessages,
  normalizeErrorMessage,
  waitForChildExit,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForBodyText,
  waitForCondition,
  waitForSelector,
  waitForTabLabels,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9230);
const browserErrors = [];
const browserConsoleErrors = [];

const viewports = [
  { height: 568, label: "small phone 320px", mobile: true, scale: 2, width: 320 },
  { height: 740, label: "common Android/Samsung/China phone 360px", mobile: true, scale: 3, width: 360 },
  { height: 667, label: "phone 375px", mobile: true, scale: 2, width: 375 },
  { height: 844, label: "phone 390px", mobile: true, scale: 3, width: 390 },
  { height: 915, label: "phone 412px", mobile: true, scale: 2.625, width: 412 },
  { height: 932, label: "large phone 430px", mobile: true, scale: 3, width: 430 },
  { height: 1024, label: "tablet 768px", mobile: true, scale: 2, width: 768 },
  { height: 1180, label: "iPad portrait 820px", mobile: true, scale: 2, width: 820 },
  { height: 1366, label: "tablet landscape 1024px", mobile: false, scale: 1, width: 1024 },
  { height: 900, label: "desktop 1280px", mobile: false, scale: 1, width: 1280 },
  { height: 900, label: "desktop 1440px", mobile: false, scale: 1, width: 1440 },
];
const appTabs = ["Dispatch", "Bookings", "Completed", "Dashboard", "Drivers", "Rates"];
const dispatcherIntakeControlLabels = [
  "AI Assist Parse (Mock)",
  "Create Job Card",
  "Clear Message",
];
const responsiveRoutes = [
  { expectedText: "Booking Request", label: "/book", path: "/book" },
  { expectedText: "My Bookings", label: "/my-bookings", path: "/my-bookings" },
  { expectedText: "Customers", label: "/customers", path: "/customers" },
];
const tabExpectedText = {
  Bookings: "Load Bookings",
  Completed: "No completed bookings loaded yet.",
  Dashboard: "Operations Dashboard",
  Dispatch: "Dispatcher Intake",
  Drivers: "Driver Database",
  Rates: "Load Rates",
};
const driverDemoUrl = new URL("/driver-job-demo", appUrl).toString();
const publicDriverJobUrl = new URL("/driver-job/mock-driver-job-valid-a", appUrl).toString();
const mobileLoadedBookingFixture = {
  id: "mobile-usability-booking-fixture",
  company_id: 811,
  booker_id: 812,
  traveler_id: 813,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "0945",
  pickup_address: "Changi Airport Terminal 3 Departure Door 5",
  dropoff_address: "The Fullerton Hotel Singapore",
  flight_no: "SQ888",
  route:
    "Changi Airport Terminal 3 Departure Door 5 > Marina Bay Sands Tower 3 Main Lobby > The Fullerton Hotel Singapore",
  pax: 2,
  job_card:
    "AVF DEP\n29 May 2026, 0945hrs\nFlight: SQ888\nChangi Airport Terminal 3 Departure Door 5 > Marina Bay Sands Tower 3 Main Lobby > The Fullerton Hotel Singapore\nCompany: MOBILE USABILITY COMPANY\nPassenger: MOBILE USABILITY TRAVELER\nPax: 2",
  status: "assigned",
  driver_id: 9010,
  driver_name: "MOBILE USABILITY DRIVER",
  driver_contact: "+65 8111 9999",
  driver_plate_number: "SMM320P",
  customer_price_amount: 160,
  driver_payout_amount: 95,
  driver_dispatch_include_payout: false,
  extra_stop_count: 1,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-19T00:00:00.000Z",
  updated_at: "2026-05-19T00:00:00.000Z",
  companies: {
    company_name: "MOBILE USABILITY COMPANY",
    domain: "mobile-usability.example.com",
  },
  bookers: {
    booker_name: "MOBILE USABILITY BOOKER",
    email: "mobile-booker@example.com",
    phone: "+65 8777 3200",
  },
  travelers: {
    traveler_name: "MOBILE USABILITY TRAVELER",
  },
};

function assertNoHorizontalOverflow(state, context) {
  const overflowingWidth = Math.max(state.docScrollWidth, state.bodyScrollWidth);

  assert.equal(
    overflowingWidth <= state.docClientWidth + 2,
    true,
    `${context}: expected no document horizontal overflow, got ${overflowingWidth}px for ${
      state.docClientWidth
    }px viewport. Offenders: ${JSON.stringify(state.overflowingElements.slice(0, 5))}`,
  );
}

function assertButtonTouchTargets(buttons, labels, context) {
  for (const label of labels) {
    const button = buttons.find((candidate) => candidate.text === label);

    assert.ok(button, `${context}: expected ${label} button to be present`);
    assert.equal(button.visible, true, `${context}: expected ${label} button to be visible`);
    assert.equal(
      button.height >= 44 && button.width >= 64,
      true,
      `${context}: expected ${label} to be touch-friendly, got ${button.width}x${button.height}`,
    );
  }
}

async function runChromeTest() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-mobile-usability-chrome-"));
  const chrome = spawn(
    chromeBinary,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-service-autorun",
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${chromeDebugPort}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  let stderr = "";
  let client = null;

  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForChromeDebugPort(chromeDebugPort);

    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;

    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      const description =
        exceptionDetails?.exception?.description ||
        exceptionDetails?.text ||
        "Unknown browser exception";
      browserErrors.push(description);
    });
    client.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
      if (type === "error") {
        browserConsoleErrors.push(normalizeConsoleMessages(args.map((value) => value?.value ?? value?.description ?? "")));
      }
    });

    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__mobileUsabilityFetchCalls = [];
        window.__prestigeErrors = [];
        window.__prestigeConsoleErrors = [];
        window.addEventListener("error", (event) => window.__prestigeErrors.push(event.message));
        window.addEventListener("unhandledrejection", (event) => window.__prestigeErrors.push(String(event.reason)));
        const originalError = console.error;
        console.error = (...args) => {
          window.__prestigeConsoleErrors.push(args.map(String).join(" "));
          originalError.apply(console, args);
        };
        const originalFetch = window.fetch.bind(window);
        const bookingsFixture = ${JSON.stringify([mobileLoadedBookingFixture])};
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          const url = String(target);

          if (url.includes("/rest/v1/")) {
            window.__mobileUsabilityFetchCalls.push(\`\${method} \${url}\`);
            const isBookingsRead = method === "GET" && url.includes("/rest/v1/bookings");
            const body = isBookingsRead ? bookingsFixture : method === "GET" ? [] : {
              message: "Blocked Supabase mutation in mobile usability browser test.",
            };

            return Promise.resolve(
              new Response(JSON.stringify(body), {
                status: method === "GET" ? 200 : 500,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          return originalFetch(...args);
        };
      `,
    });

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });

      return result.result?.value;
    };

    const setViewport = async (viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });
    };

    const navigate = async (url, expectedText) => {
      await navigateAndWaitForBodyText(
        client,
        evaluate,
        url,
        expectedText,
        `${url} visible text: ${expectedText}`,
      );
    };

    const layoutState = () =>
      evaluate(`(() => {
        const doc = document.documentElement;
        const body = document.body;
        const viewportWidth = doc.clientWidth;
        const visibleElements = [...document.querySelectorAll("body *")].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0;
        });
        const overflowingElements = visibleElements
          .map((element) => {
            const rect = element.getBoundingClientRect();

            return {
              className: String(element.className || "").slice(0, 120),
              clientWidth: Math.round(element.clientWidth || 0),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              scrollWidth: Math.round(element.scrollWidth || 0),
              tag: element.tagName.toLowerCase(),
              text: (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80),
              width: Math.round(rect.width),
            };
          })
          .filter(
            (element) =>
              element.left < -2 ||
              element.right > viewportWidth + 2 ||
              element.scrollWidth > element.clientWidth + 2,
          );

        return {
          bodyScrollWidth: body.scrollWidth,
          docClientWidth: doc.clientWidth,
          docScrollWidth: doc.scrollWidth,
          overflowingElements,
          visibleText: body.innerText || "",
        };
      })()`);

    const buttonState = () =>
      evaluate(`(() => [...document.querySelectorAll("button")].map((button) => {
        const rect = button.getBoundingClientRect();

        return {
          height: Math.round(rect.height),
          text: button.textContent.trim(),
          visible: rect.width > 0 && rect.height > 0,
          width: Math.round(rect.width),
        };
      }))()`);

    const dispatcherIntakeControlState = () =>
      evaluate(`(() => {
        const labels = ${JSON.stringify(dispatcherIntakeControlLabels)};
        const findButton = (label) => [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent.trim() === label,
        );
        const row = document.querySelector("[data-dispatcher-intake-action-row='true']");
        const safety = document.querySelector("[data-ai-assist-gate='true'] label");
        const aiButton = findButton("AI Assist Parse (Mock)");
        const safetyRect = safety?.getBoundingClientRect();
        const aiRect = aiButton?.getBoundingClientRect();
        const rowRect = row?.getBoundingClientRect();

        return {
          controls: labels.map((label) => {
            const button = findButton(label);
            const rect = button?.getBoundingClientRect();
            const style = button ? getComputedStyle(button) : null;

            return {
              exists: Boolean(button),
              height: Math.round(rect?.height || 0),
              label,
              left: Math.round(rect?.left || 0),
              right: Math.round(rect?.right || 0),
              text: button?.textContent.trim() || "",
              visible: Boolean(rect && rect.width > 0 && rect.height > 0),
              whiteSpace: style?.whiteSpace || "",
              width: Math.round(rect?.width || 0),
            };
          }),
          rowLeft: Math.round(rowRect?.left || 0),
          rowRight: Math.round(rowRect?.right || 0),
          rowVisible: Boolean(rowRect && rowRect.width > 0 && rowRect.height > 0),
          safetyGap: Math.round((safetyRect?.top || 0) - (aiRect?.bottom || 0)),
          safetyText: safety?.textContent.replace(/\\s+/g, " ").trim() || "",
          safetyVisible: Boolean(safetyRect && safetyRect.width > 0 && safetyRect.height > 0),
          viewportWidth: document.documentElement.clientWidth,
        };
      })()`);

    const clickButtonByText = async (label, description = label) => {
      const clicked = await evaluate(`(() => {
        const button = [...document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent.trim() === ${JSON.stringify(label)},
        );

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, `Expected ${description} button to be clickable`);
    };

    const clickTab = async (label) => {
      await clickButtonByText(label, `${label} tab`);
      await waitForCondition(
        () =>
          evaluate(`(() => {
            const selectedTab = [...document.querySelectorAll("button[role='tab']")].find(
              (button) =>
                button.textContent.trim() === ${JSON.stringify(label)} &&
                button.getAttribute("aria-selected") === "true",
            );

            return Boolean(selectedTab) &&
              document.body.innerText.includes(${JSON.stringify(tabExpectedText[label])});
          })()`),
        10000,
        `${label} tab content`,
      );
    };

    const checkDispatcherIntakeControls = async (viewport) => {
      const state = await dispatcherIntakeControlState();

      assert.equal(state.rowVisible, true, `${viewport.label}: expected Dispatcher Intake action row`);
      assert.equal(
        state.rowLeft >= -2 && state.rowRight <= state.viewportWidth + 2,
        true,
        `${viewport.label}: expected Dispatcher Intake action row not to overflow, got ${JSON.stringify(state)}`,
      );
      assert.equal(
        state.safetyVisible,
        true,
        `${viewport.label}: expected AI safety checkbox/help to stay near AI Assist`,
      );
      assert.equal(
        state.safetyText.includes("Tick the AI safety checkbox to enable AI Assist"),
        true,
        `${viewport.label}: expected AI safety help text near AI Assist`,
      );
      assert.equal(
        state.safetyGap >= 0 && state.safetyGap <= 16,
        true,
        `${viewport.label}: expected AI safety checkbox/help to stay close to AI Assist, got gap ${state.safetyGap}`,
      );

      for (const control of state.controls) {
        assert.equal(
          control.exists,
          true,
          `${viewport.label}: expected Dispatcher Intake ${control.label} control`,
        );
        assert.equal(
          control.visible,
          true,
          `${viewport.label}: expected Dispatcher Intake ${control.label} to be visible`,
        );
        assert.equal(
          control.height >= 44 && control.width >= 64,
          true,
          `${viewport.label}: expected Dispatcher Intake ${control.label} to be touch-friendly, got ${
            control.width
          }x${control.height}`,
        );
        assert.equal(
          control.left >= -2 && control.right <= state.viewportWidth + 2,
          true,
          `${viewport.label}: expected Dispatcher Intake ${control.label} not to overflow, got ${JSON.stringify(control)}`,
        );
      }

      const clearMessage = state.controls.find((control) => control.label === "Clear Message");
      assert.equal(
        clearMessage?.whiteSpace,
        "nowrap",
        `${viewport.label}: expected Clear Message label not to wrap awkwardly`,
      );
      assert.equal(
        (clearMessage?.height || 0) <= 56,
        true,
        `${viewport.label}: expected Clear Message button not to become tall/misaligned, got ${
          clearMessage?.height || 0
        }px`,
      );
    };

    const checkResponsiveRouteViewport = async (viewport, route) => {
      await setViewport(viewport);
      await navigate(new URL(route.path, appUrl).toString(), route.expectedText);
      const state = await layoutState();
      const adminHubVisible = await evaluate(`Boolean(document.querySelector("[data-admin-access-hub]"))`);
      const customerIntakeHandoffVisible = await evaluate(
        `Boolean(document.querySelector("[data-customer-intake-handoff]"))`,
      );
      const intakeConfirmationReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-intake-confirmation-readiness]"))`,
      );
      const driverAssignmentReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-driver-assignment-readiness]"))`,
      );
      const driverDetailCollectionReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-driver-detail-collection-readiness]"))`,
      );
      const driverDetailsCustomerUpdateReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-driver-details-customer-update-readiness]"))`,
      );
      const customerUpdateDeliveryReviewReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-customer-update-delivery-review-readiness]"))`,
      );
      const deliveryReviewDispatcherApprovalReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-delivery-review-dispatcher-approval-readiness]"))`,
      );
      const dispatcherApprovalNotificationQueueReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-dispatcher-approval-notification-queue-readiness]"))`,
      );
      const futureNotificationQueueCustomerUpdateAuditReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-future-notification-queue-customer-update-audit-readiness]"))`,
      );
      const mockDspMonthlyRollupReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-dsp-monthly-rollup-review]"))`,
      );
      const mockDspReconciliationExceptionsReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-dsp-reconciliation-exceptions-review]"))`,
      );
      const mockDspApprovalPacketReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-dsp-approval-packet-review]"))`,
      );
      const mockAccountingStatementPreviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-accounting-statement-preview]"))`,
      );
      const mockStatementVarianceReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-statement-variance-review]"))`,
      );
      const mockReceivablesHandoffReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-receivables-handoff-review]"))`,
      );
      const mockReceivablesAgingFollowUpReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-receivables-aging-follow-up-review]"))`,
      );
      const mockCollectionsCreditWriteoffReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-collections-credit-writeoff-review]"))`,
      );
      const mockPaymentAllocationRemittanceReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-payment-allocation-remittance-review]"))`,
      );
      const mockMonthEndArCloseReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-month-end-ar-close-review]"))`,
      );
      const mockAccountingHandoffGlAuditReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-accounting-handoff-gl-audit-review]"))`,
      );
      const mockAuditEvidenceFinanceArchiveReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-audit-evidence-finance-archive-review]"))`,
      );
      const mockPostCloseAuditRetentionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-post-close-audit-retention-review]"))`,
      );
      const mockCloseCycleEvidenceResponseRetentionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-close-cycle-evidence-response-retention-review]"))`,
      );
      const mockCloseCycleExceptionResolutionAuditHandoffReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-close-cycle-exception-resolution-audit-handoff-review]"))`,
      );
      const mockWaitingTimeExtraChargesPlanningReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-waiting-time-extra-charges-planning-review]"))`,
      );
      const mockExtraChargesVarianceApprovalReconciliationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review]"))`,
      );
      const mockMidnightChargeAutoDetectionOverrideReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-midnight-charge-auto-detection-override-review]"))`,
      );
      const mockCombinedExtraChargesSummarySeparationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-combined-extra-charges-summary-separation-review]"))`,
      );
      const mockExtraChargesApprovalDecisionSeparationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-extra-charges-approval-decision-separation-review]"))`,
      );
      const mockExtraChargesVarianceApprovalReconciliationTextLeaks = await evaluate(
        `(() => {
          const text = (document.body.innerText || "").toLowerCase();

          return [
            "extra charges variance / approval qa",
            "extra charges variance review",
            "static/mock extra-charge variance",
            "dispatcher approval handoff",
            "driver payout reconciliation",
            "waiting-time variance status",
            "customer charge review status",
            "driver payout reconciliation status",
            "not approved / not billed / not paid / not saved",
            "no dispatcher approval record generated",
            "no driver payout reconciliation record generated",
            "midnight charge auto-detection / override qa",
            "midnight charge auto-detection review",
            "static/mock midnight charge auto-detection",
            "midnight charge customer charge: $15",
            "midnight charge driver payout: $10",
            "manual override mock only",
            "override reason mock only",
            "no midnight-charge record generated",
            "manual override persistence",
            "combined extra charges",
            "summary / charge type separation qa",
            "static/mock combined extra charges summary",
            "charge-type separation qa",
            "waiting time, extra stops, and midnight charge may display together",
            "each charge type remains internally distinct",
            "no real combined charge calculation",
            "no invoice generated",
            "no payout created",
            "no accounting posting",
            "extra-stop record",
            "charge grouping persistence",
            "extra charges approval decision",
            "billing & payout separation qa",
            "static/mock extra charges approval decision",
            "customer billing decision",
            "driver payout decision",
            "customer billing approval and driver payout approval are separate decisions",
            "waived customer charge does not automatically cancel driver payout review",
            "approval-decision persistence",
            "approval-decision record",
          ].filter((value) => text.includes(value));
        })()`,
      );

      assertNoHorizontalOverflow(state, `${viewport.label} ${route.label}`);
      assert.equal(
        state.visibleText.includes(route.expectedText),
        true,
        `${viewport.label} ${route.label}: expected important section text to remain visible`,
      );
      assert.equal(adminHubVisible, false, `${viewport.label} ${route.label}: expected no admin access hub`);
      assert.equal(
        customerIntakeHandoffVisible,
        false,
        `${viewport.label} ${route.label}: expected no customer intake handoff`,
      );
      assert.equal(
        intakeConfirmationReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no intake confirmation readiness`,
      );
      assert.equal(
        driverAssignmentReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no driver assignment readiness`,
      );
      assert.equal(
        driverDetailCollectionReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no driver detail collection readiness`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no driver details customer update readiness`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no customer update delivery review readiness`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no delivery review dispatcher approval readiness`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no dispatcher approval notification queue readiness`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no future notification queue customer update audit readiness`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock DSP monthly rollup review`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock DSP reconciliation exceptions review`,
      );
      assert.equal(
        mockDspApprovalPacketReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock DSP approval packet review`,
      );
      assert.equal(
        mockAccountingStatementPreviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock accounting statement preview`,
      );
      assert.equal(
        mockStatementVarianceReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock statement variance review`,
      );
      assert.equal(
        mockReceivablesHandoffReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock receivables handoff review`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock receivables aging follow-up review`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock collections credit write-off review`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock payment allocation remittance review`,
      );
      assert.equal(
        mockMonthEndArCloseReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock month-end AR close review`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock accounting handoff GL audit review`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock audit evidence finance archive review`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock post-close audit retention review`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock close-cycle evidence response retention review`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock close-cycle exception resolution audit handoff review`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock waiting-time extra-charges planning review`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock extra charges variance approval reconciliation review`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock midnight charge auto-detection override review`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock combined extra charges summary separation review`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock extra charges approval decision separation review`,
      );
      assert.deepEqual(
        mockExtraChargesVarianceApprovalReconciliationTextLeaks,
        [],
        `${viewport.label} ${route.label}: expected no internal extra charges or midnight charge QA text leak`,
      );
    };

    const setRegularCustomerField = async (field, value, context) => {
      const actualValue = await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(`[data-regular-booking-field="${field}"]`)});

        if (!input) {
          return null;
        }

        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        descriptor?.set?.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        return input.value;
      })()`);
      assert.equal(actualValue, value, `${context}: expected regular customer ${field} field`);
    };

    const createLocalBillingRow = async (viewport, suffix) => {
      const context = `${viewport.label} /customers quick-filter empty`;
      const regularCustomerFields = {
        booker: `Mobile Billing Booker ${suffix}`,
        customerId: "ubs",
        dropoffLocation: "Raffles Place",
        passengerName: `Mobile Billing Passenger ${suffix}`,
        pickupDate: "2026-05-28",
        pickupLocation: "Changi Airport T3",
        pickupTime: "1530hrs",
        routeType: "Airport Arrival",
        vehicleType: "AVF",
      };

      for (const [field, value] of Object.entries(regularCustomerFields)) {
        await setRegularCustomerField(field, value, context);
      }

      const submitted = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-booking-submit]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(submitted, true, `${context}: expected regular customer mock submit`);
      await waitForSelector(
        evaluate,
        "[data-regular-customer-booking-list-row]",
        `${context} local billing row`,
      );
    };

    const checkCustomerBillingQuickFilterEmptyAtViewport = async (viewport) => {
      const context = `${viewport.label} /customers quick-filter empty`;
      await waitForSelector(
        evaluate,
        "[data-regular-customer-booking-submit]",
        `${context} regular customer submit`,
      );
      await createLocalBillingRow(viewport, viewport.width);

      const selectedNoMatch = await evaluate(`(() => {
        const select = document.querySelector("[data-regular-customer-billing-quick-filter]");

        if (!select) {
          return null;
        }

        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
        descriptor?.set?.call(select, "mock-no-match");
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));

        return select.value;
      })()`);
      assert.equal(selectedNoMatch, "mock-no-match", `${context}: expected no-match quick filter option`);
      await waitForBodyText(
        evaluate,
        "No mock billing rows match this quick filter.",
        `${context} quick filter empty state`,
      );

      const emptyLayoutState = await layoutState();
      assertNoHorizontalOverflow(emptyLayoutState, context);

      const emptyState = await evaluate(`(() => {
        const empty = document.querySelector("[data-regular-customer-billing-quick-filter-empty]");
        const reset = document.querySelector("[data-regular-customer-billing-quick-filter-reset]");
        const resetRect = reset?.getBoundingClientRect();

        return {
          countText:
            document.querySelector("[data-regular-customer-booking-list-filter-count]")?.textContent.trim() || "",
          emptyText: empty?.textContent.trim() || "",
          mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
          resetHeight: Math.round(resetRect?.height || 0),
          resetText: reset?.textContent.trim() || "",
          resetVisible: Boolean(resetRect && resetRect.width > 0 && resetRect.height >= 44),
          resetWidth: Math.round(resetRect?.width || 0),
          rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
          summaryCount:
            document.querySelector("[data-regular-customer-monthly-billing-summary-count]")?.textContent.trim() || "",
          visibleSummaryCount:
            document.querySelector("[data-regular-customer-billing-visible-summary-count]")?.textContent.trim() || "",
          visibleSummaryFilter:
            document.querySelector("[data-regular-customer-billing-visible-summary-filter]")?.textContent.trim() || "",
          visibleSummaryMonths:
            document.querySelector("[data-regular-customer-billing-visible-summary-months]")?.textContent.trim() || "",
          visibleSummaryStatuses:
            document.querySelector("[data-regular-customer-billing-visible-summary-statuses]")?.textContent.trim() || "",
          visibleSummaryText:
            document.querySelector("[data-regular-customer-billing-visible-summary]")?.textContent || "",
        };
      })()`);
      assert.equal(emptyState.countText, "Showing 0 of 1 local mock row.", `${context}: expected zero visible rows`);
      assert.equal(emptyState.rowCount, 0, `${context}: expected no visible row cards while quick filter is empty`);
      assert.equal(emptyState.summaryCount, "0 visible of 1 local mock row", `${context}: expected summary to follow empty quick filter`);
      assert.equal(
        emptyState.visibleSummaryCount,
        "0 visible of 1 local mock row",
        `${context}: expected visible summary to follow empty quick filter`,
      );
      assert.equal(
        emptyState.visibleSummaryFilter,
        "No matching mock rows",
        `${context}: expected visible summary to show the empty quick filter label`,
      );
      assert.equal(
        emptyState.visibleSummaryMonths,
        "No visible billing month",
        `${context}: expected visible summary to handle no visible billing month`,
      );
      assert.equal(
        emptyState.visibleSummaryStatuses,
        "No visible status",
        `${context}: expected visible summary to handle no visible status`,
      );
      for (const expectedText of [
        "Mock visible billing summary",
        "Mock/local only",
        "currently visible mock monthly billing rows after the local quick filter",
        "write browser storage",
        "write Supabase",
        "trigger messaging or notification behavior",
      ]) {
        assert.equal(
          emptyState.visibleSummaryText.includes(expectedText),
          true,
          `${context}: expected visible summary text ${expectedText}`,
        );
      }
      assert.equal(
        emptyState.emptyText.includes("No mock billing rows match this quick filter."),
        true,
        `${context}: expected compact mock/local empty state copy`,
      );
      assert.equal(emptyState.resetText, "Reset Billing Quick Filter — Mock Only", `${context}: expected reset label`);
      assert.equal(emptyState.resetVisible, true, `${context}: expected reset touch target`);
      assert.equal(emptyState.resetWidth >= 64, true, `${context}: expected reset width`);
      assert.equal(emptyState.resetHeight >= 44, true, `${context}: expected reset height`);
      assert.deepEqual(emptyState.mutationCalls, [], `${context}: expected no Supabase mutations`);

      const resetClicked = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-billing-quick-filter-reset]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(resetClicked, true, `${context}: expected reset button to be clickable`);
      const resetState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const state = {
              countText: document.querySelector("[data-regular-customer-booking-list-filter-count]")?.textContent.trim() || "",
              emptyVisible: Boolean(document.querySelector("[data-regular-customer-billing-quick-filter-empty]")),
              mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
              rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
              visibleSummaryCount:
                document.querySelector("[data-regular-customer-billing-visible-summary-count]")?.textContent.trim() || "",
              visibleSummaryFilter:
                document.querySelector("[data-regular-customer-billing-visible-summary-filter]")?.textContent.trim() || "",
              value: document.querySelector("[data-regular-customer-billing-quick-filter]")?.value || "",
            };

            return state.value === "all" && state.countText === "Showing 1 of 1 local mock row." ? state : false;
          })()`),
        10000,
        `${context} reset to all mock rows`,
      );
      assert.equal(resetState.value, "all", `${context}: expected reset to return quick filter to all mock rows`);
      assert.equal(resetState.countText, "Showing 1 of 1 local mock row.", `${context}: expected reset to show all local mock rows`);
      assert.equal(resetState.rowCount, 1, `${context}: expected reset not to add or remove rows`);
      assert.equal(
        resetState.visibleSummaryCount,
        "1 visible of 1 local mock row",
        `${context}: expected visible summary to return to all rows after reset`,
      );
      assert.equal(
        resetState.visibleSummaryFilter,
        "All mock rows",
        `${context}: expected visible summary to return to all mock rows after reset`,
      );
      assert.equal(resetState.emptyVisible, false, `${context}: expected empty state to hide after reset`);
      assert.deepEqual(resetState.mutationCalls, [], `${context}: expected reset not to make Supabase mutations`);

      const resetLayoutState = await layoutState();
      assertNoHorizontalOverflow(resetLayoutState, `${context} reset`);
    };

    const checkMainAppViewport = async (viewport) => {
      await setViewport(viewport);
      await navigate(appUrl, "Prestige Limo Ops Dispatch");
      await waitForTabLabels(evaluate, appTabs, `${viewport.label} app tabs`);

      const adminHubState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const hub = document.querySelector("[data-admin-access-hub]");
            if (!hub) {
              return false;
            }

            const hubRect = hub.getBoundingClientRect();
            const links = [...hub.querySelectorAll("[data-admin-access-link]")].map((link) => {
              const rect = link.getBoundingClientRect();
              return {
                height: Math.round(rect.height),
                href: link.getAttribute("href"),
                text: link.textContent.trim(),
                width: Math.round(rect.width),
              };
            });

            return {
              height: Math.round(hubRect.height),
              links,
              text: hub.innerText,
            };
          })()`),
        10000,
        `${viewport.label} admin access hub`,
      );
      assert.equal(adminHubState.text.includes("ADMIN ACCESS"), true, `${viewport.label}: expected admin access hub`);
      assert.deepEqual(
        adminHubState.links.map((link) => [link.text, link.href]),
        [
          ["Admin Home", "/"],
          ["Book Request", "/book"],
          ["My Bookings", "/my-bookings"],
          ["Customers", "/customers"],
          ["Driver Demo", "/driver-job-demo"],
          ["Token Demo", "/driver-job/mock-driver-job-valid-a"],
        ],
        `${viewport.label}: expected compact admin access links`,
      );
      assert.equal(
        adminHubState.height <= (viewport.width < 640 ? 190 : 120),
        true,
        `${viewport.label}: expected compact admin access hub, got ${adminHubState.height}px`,
      );
      assert.equal(
        adminHubState.links.every((link) => link.height >= 32 && link.height <= 52 && link.width >= 64),
        true,
        `${viewport.label}: expected admin access hub links to stay compact and touchable`,
      );

      const customerIntakeHandoffState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const handoff = document.querySelector("[data-customer-intake-handoff]");
            if (!handoff) {
              return false;
            }

            const rect = handoff.getBoundingClientRect();
            const items = [...handoff.querySelectorAll("[data-customer-intake-handoff-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-customer-intake-handoff-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              boundary: document.querySelector("[data-customer-intake-handoff-boundary]")?.textContent.trim() || "",
              height: Math.round(rect.height),
              items,
              text: handoff.innerText,
            };
          })()`),
        10000,
        `${viewport.label} customer intake handoff`,
      );
      assert.equal(
        customerIntakeHandoffState.text.toLowerCase().includes("customer intake"),
        true,
        `${viewport.label}: expected customer intake handoff`,
      );
      assert.deepEqual(
        customerIntakeHandoffState.items.map((item) => item.label),
        ["Source", "Contact", "Trip", "Status", "Next"],
        `${viewport.label}: expected compact customer intake handoff items`,
      );
      assert.equal(
        customerIntakeHandoffState.boundary.includes(
          "Mock/local only. No customer request is stored or sent here.",
        ),
        true,
        `${viewport.label}: expected customer intake handoff mock/local boundary`,
      );
      assert.equal(
        customerIntakeHandoffState.height <= (viewport.width < 640 ? 280 : 130),
        true,
        `${viewport.label}: expected compact customer intake handoff, got ${customerIntakeHandoffState.height}px`,
      );
      assert.equal(
        customerIntakeHandoffState.items.every((item) => item.height >= 32 && item.width >= 64),
        true,
        `${viewport.label}: expected customer intake handoff items to stay readable and compact`,
      );

      const intakeConfirmationReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-intake-confirmation-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-intake-confirmation-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-intake-confirmation-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-intake-confirmation-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} intake confirmation readiness`,
      );
      assert.equal(
        intakeConfirmationReadinessState.text.toLowerCase().includes("intake review"),
        true,
        `${viewport.label}: expected intake confirmation readiness`,
      );
      assert.deepEqual(
        intakeConfirmationReadinessState.items.map((item) => item.label),
        ["Source", "Review", "Customer", "Trip", "Confirm", "Next"],
        `${viewport.label}: expected compact intake confirmation readiness items`,
      );
      assert.equal(
        intakeConfirmationReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected intake confirmation readiness mock/local boundary`,
      );
      assert.equal(
        intakeConfirmationReadinessState.boundary.includes("No confirmed booking"),
        true,
        `${viewport.label}: expected no confirmed booking boundary`,
      );
      assert.equal(
        intakeConfirmationReadinessState.actionCount,
        0,
        `${viewport.label}: expected intake confirmation readiness to stay display-only`,
      );
      assert.equal(
        intakeConfirmationReadinessState.height <= (viewport.width < 640 ? 320 : 140),
        true,
        `${viewport.label}: expected compact intake confirmation readiness, got ${intakeConfirmationReadinessState.height}px`,
      );
      assert.equal(
        intakeConfirmationReadinessState.items.every((item) => item.height >= 32 && item.width >= 56),
        true,
        `${viewport.label}: expected intake confirmation readiness items to stay readable and compact`,
      );

      const driverAssignmentReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-driver-assignment-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-driver-assignment-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-driver-assignment-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-driver-assignment-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} driver assignment readiness`,
      );
      assert.equal(
        driverAssignmentReadinessState.text.toLowerCase().includes("driver assignment"),
        true,
        `${viewport.label}: expected driver assignment readiness`,
      );
      assert.deepEqual(
        driverAssignmentReadinessState.items.map((item) => item.label),
        ["Status", "Service", "Assign", "Driver details", "Notify", "Next"],
        `${viewport.label}: expected compact driver assignment readiness items`,
      );
      assert.equal(
        driverAssignmentReadinessState.items.some((item) => item.text.includes("Future/not sent")),
        true,
        `${viewport.label}: expected future customer notification note`,
      );
      assert.equal(
        driverAssignmentReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected driver assignment readiness mock/local boundary`,
      );
      assert.equal(
        driverAssignmentReadinessState.boundary.includes("No driver assignment"),
        true,
        `${viewport.label}: expected no real driver assignment boundary`,
      );
      assert.equal(
        driverAssignmentReadinessState.actionCount,
        0,
        `${viewport.label}: expected driver assignment readiness to stay display-only`,
      );
      assert.equal(
        driverAssignmentReadinessState.height <= (viewport.width < 640 ? 340 : 150),
        true,
        `${viewport.label}: expected compact driver assignment readiness, got ${driverAssignmentReadinessState.height}px`,
      );
      assert.equal(
        driverAssignmentReadinessState.items.every((item) => item.height >= 32 && item.width >= 56),
        true,
        `${viewport.label}: expected driver assignment readiness items to stay readable and compact`,
      );

      const driverDetailCollectionReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-driver-detail-collection-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-driver-detail-collection-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-driver-detail-collection-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-driver-detail-collection-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} driver detail collection readiness`,
      );
      assert.equal(
        driverDetailCollectionReadinessState.text.toLowerCase().includes("driver details"),
        true,
        `${viewport.label}: expected driver detail collection readiness`,
      );
      assert.deepEqual(
        driverDetailCollectionReadinessState.items.map((item) => item.label),
        ["Assigned", "Contact", "Vehicle", "Verify", "Update", "Next"],
        `${viewport.label}: expected compact driver detail collection readiness items`,
      );
      assert.equal(
        driverDetailCollectionReadinessState.items.some((item) => item.text.includes("Future/not sent")),
        true,
        `${viewport.label}: expected future customer update note`,
      );
      assert.equal(
        driverDetailCollectionReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected driver detail collection readiness mock/local boundary`,
      );
      assert.equal(
        driverDetailCollectionReadinessState.boundary.includes("No driver detail collection"),
        true,
        `${viewport.label}: expected no real driver detail collection boundary`,
      );
      assert.equal(
        driverDetailCollectionReadinessState.actionCount,
        0,
        `${viewport.label}: expected driver detail collection readiness to stay display-only`,
      );
      assert.equal(
        driverDetailCollectionReadinessState.height <= (viewport.width < 640 ? 340 : 150),
        true,
        `${viewport.label}: expected compact driver detail collection readiness, got ${driverDetailCollectionReadinessState.height}px`,
      );
      assert.equal(
        driverDetailCollectionReadinessState.items.every((item) => item.height >= 32 && item.width >= 56),
        true,
        `${viewport.label}: expected driver detail collection readiness items to stay readable and compact`,
      );

      const driverDetailsCustomerUpdateReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-driver-details-customer-update-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-driver-details-customer-update-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-driver-details-customer-update-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-driver-details-customer-update-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} driver details customer update readiness`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.text.toLowerCase().includes("customer update"),
        true,
        `${viewport.label}: expected driver details customer update readiness`,
      );
      assert.deepEqual(
        driverDetailsCustomerUpdateReadinessState.items.map((item) => item.label),
        ["Details", "Draft", "Channel", "Contact", "Review", "Next"],
        `${viewport.label}: expected compact driver details customer update readiness items`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.items.some((item) => item.text.includes("Future/not sent")),
        true,
        `${viewport.label}: expected future customer update note`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected driver details customer update readiness mock/local boundary`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.boundary.includes("No customer update persistence"),
        true,
        `${viewport.label}: expected no customer update persistence boundary`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.boundary.includes("notification sending"),
        true,
        `${viewport.label}: expected no notification sending boundary`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.actionCount,
        0,
        `${viewport.label}: expected driver details customer update readiness to stay display-only`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.height <= (viewport.width < 640 ? 340 : 150),
        true,
        `${viewport.label}: expected compact driver details customer update readiness, got ${driverDetailsCustomerUpdateReadinessState.height}px`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessState.items.every((item) => item.height >= 32 && item.width >= 56),
        true,
        `${viewport.label}: expected driver details customer update readiness items to stay readable and compact`,
      );

      const customerUpdateDeliveryReviewReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-customer-update-delivery-review-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-customer-update-delivery-review-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-customer-update-delivery-review-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-customer-update-delivery-review-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} customer update delivery review readiness`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.text.toLowerCase().includes("delivery review"),
        true,
        `${viewport.label}: expected customer update delivery review readiness`,
      );
      assert.deepEqual(
        customerUpdateDeliveryReviewReadinessState.items.map((item) => item.label),
        ["Update", "Review", "Channel", "Audit", "Approval", "Next"],
        `${viewport.label}: expected compact customer update delivery review readiness items`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.items.some((item) =>
          item.text.includes("Message check, not sent"),
        ),
        true,
        `${viewport.label}: expected not-sent message channel check`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.items.some((item) =>
          item.text.includes("Dispatcher approval"),
        ),
        true,
        `${viewport.label}: expected dispatcher approval readiness`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected customer update delivery review readiness mock/local boundary`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.boundary.includes("No customer update persistence"),
        true,
        `${viewport.label}: expected no customer update persistence boundary`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.boundary.includes("delivery") &&
          customerUpdateDeliveryReviewReadinessState.boundary.includes("notification sending"),
        true,
        `${viewport.label}: expected no delivery/notification sending boundary`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.actionCount,
        0,
        `${viewport.label}: expected customer update delivery review readiness to stay display-only`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.height <= (viewport.width < 640 ? 340 : 150),
        true,
        `${viewport.label}: expected compact customer update delivery review readiness, got ${customerUpdateDeliveryReviewReadinessState.height}px`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessState.items.every((item) => item.height >= 32 && item.width >= 56),
        true,
        `${viewport.label}: expected customer update delivery review readiness items to stay readable and compact`,
      );

      const deliveryReviewDispatcherApprovalReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-delivery-review-dispatcher-approval-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-delivery-review-dispatcher-approval-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-delivery-review-dispatcher-approval-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-delivery-review-dispatcher-approval-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} delivery review dispatcher approval readiness`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.text.toLowerCase().includes("dispatcher approval"),
        true,
        `${viewport.label}: expected delivery review dispatcher approval readiness`,
      );
      assert.deepEqual(
        deliveryReviewDispatcherApprovalReadinessState.items.map((item) => item.label),
        ["Review", "Approval", "Channel", "Audit", "Boundary", "Next"],
        `${viewport.label}: expected compact delivery review dispatcher approval readiness items`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.items.some((item) =>
          item.text.includes("Final check, not sent"),
        ),
        true,
        `${viewport.label}: expected not-sent final message channel check`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.items.some((item) =>
          item.text.includes("Future approval review"),
        ),
        true,
        `${viewport.label}: expected future approval review readiness`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected delivery review dispatcher approval readiness mock/local boundary`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.boundary.includes("approval persistence"),
        true,
        `${viewport.label}: expected no approval persistence boundary`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.boundary.includes("delivery") &&
          deliveryReviewDispatcherApprovalReadinessState.boundary.includes("notification sending"),
        true,
        `${viewport.label}: expected no delivery/notification sending boundary`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.actionCount,
        0,
        `${viewport.label}: expected delivery review dispatcher approval readiness to stay display-only`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.height <= (viewport.width < 640 ? 340 : 150),
        true,
        `${viewport.label}: expected compact delivery review dispatcher approval readiness, got ${deliveryReviewDispatcherApprovalReadinessState.height}px`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessState.items.every((item) => item.height >= 32 && item.width >= 56),
        true,
        `${viewport.label}: expected delivery review dispatcher approval readiness items to stay readable and compact`,
      );

      const dispatcherApprovalNotificationQueueReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-dispatcher-approval-notification-queue-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-dispatcher-approval-notification-queue-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-dispatcher-approval-notification-queue-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-dispatcher-approval-notification-queue-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} dispatcher approval notification queue readiness`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.text.toLowerCase().includes("notification queue"),
        true,
        `${viewport.label}: expected dispatcher approval notification queue readiness`,
      );
      assert.deepEqual(
        dispatcherApprovalNotificationQueueReadinessState.items.map((item) => item.label),
        ["Approval", "Queue", "Channel", "Audit", "Boundary", "Next"],
        `${viewport.label}: expected compact dispatcher approval notification queue readiness items`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.items.some((item) =>
          item.text.includes("Future queue review"),
        ),
        true,
        `${viewport.label}: expected future queue review readiness`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.items.some((item) =>
          item.text.includes("Message readiness, not sent"),
        ),
        true,
        `${viewport.label}: expected not-sent message channel readiness`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected dispatcher approval notification queue readiness mock/local boundary`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.boundary.includes("notification queue persistence"),
        true,
        `${viewport.label}: expected no notification queue persistence boundary`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.boundary.includes("delivery") &&
          dispatcherApprovalNotificationQueueReadinessState.boundary.includes("notification sending"),
        true,
        `${viewport.label}: expected no delivery/notification sending boundary`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.actionCount,
        0,
        `${viewport.label}: expected dispatcher approval notification queue readiness to stay display-only`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.height <= (viewport.width < 640 ? 340 : 150),
        true,
        `${viewport.label}: expected compact dispatcher approval notification queue readiness, got ${dispatcherApprovalNotificationQueueReadinessState.height}px`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessState.items.every((item) => item.height >= 32 && item.width >= 56),
        true,
        `${viewport.label}: expected dispatcher approval notification queue readiness items to stay readable and compact`,
      );

      const futureNotificationQueueCustomerUpdateAuditReadinessState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const readiness = document.querySelector("[data-future-notification-queue-customer-update-audit-readiness]");
            if (!readiness) {
              return false;
            }

            const rect = readiness.getBoundingClientRect();
            const items = [...readiness.querySelectorAll("[data-future-notification-queue-customer-update-audit-readiness-item]")].map((item) => {
              const itemRect = item.getBoundingClientRect();
              return {
                height: Math.round(itemRect.height),
                label: item.getAttribute("data-future-notification-queue-customer-update-audit-readiness-item") || "",
                text: item.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(itemRect.width),
              };
            });

            return {
              actionCount: readiness.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-future-notification-queue-customer-update-audit-readiness-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              items,
              text: readiness.innerText,
            };
          })()`),
        10000,
        `${viewport.label} future notification queue customer update audit readiness`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.text.toLowerCase().includes("customer audit"),
        true,
        `${viewport.label}: expected future notification queue customer update audit readiness`,
      );
      assert.deepEqual(
        futureNotificationQueueCustomerUpdateAuditReadinessState.items.map((item) => item.label),
        ["Queue", "Audit", "Channel", "Contact", "Boundary", "Next"],
        `${viewport.label}: expected compact future notification queue customer update audit readiness items`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.items.some((item) =>
          item.text.includes("Future audit review"),
        ),
        true,
        `${viewport.label}: expected future audit review readiness`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.items.some((item) =>
          item.text.includes("Message audit, not sent"),
        ),
        true,
        `${viewport.label}: expected not-sent message channel audit readiness`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.boundary.includes("Mock/local only."),
        true,
        `${viewport.label}: expected future notification queue customer update audit readiness mock/local boundary`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.boundary.includes("audit persistence"),
        true,
        `${viewport.label}: expected no audit persistence boundary`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.boundary.includes("notification queue persistence"),
        true,
        `${viewport.label}: expected no notification queue persistence boundary`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.boundary.includes("delivery") &&
          futureNotificationQueueCustomerUpdateAuditReadinessState.boundary.includes("notification sending"),
        true,
        `${viewport.label}: expected no delivery/notification sending boundary`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.actionCount,
        0,
        `${viewport.label}: expected future notification queue customer update audit readiness to stay display-only`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.height <= (viewport.width < 640 ? 340 : 150),
        true,
        `${viewport.label}: expected compact future notification queue customer update audit readiness, got ${futureNotificationQueueCustomerUpdateAuditReadinessState.height}px`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessState.items.every((item) =>
          item.height >= 32 && item.width >= 56,
        ),
        true,
        `${viewport.label}: expected future notification queue customer update audit readiness items to stay readable and compact`,
      );

      const mockDspMonthlyRollupReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-dsp-monthly-rollup-review]");
            if (!review) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-dsp-monthly-rollup-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-dsp-monthly-rollup-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-dsp-monthly-rollup-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock monthly DSP rollup review`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewState.text.toLowerCase().includes("monthly dsp rollup"),
        true,
        `${viewport.label}: expected mock monthly DSP rollup review`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewState.text.includes("Static mock sample rows only") &&
          mockDspMonthlyRollupReviewState.text.includes("12.50h") &&
          mockDspMonthlyRollupReviewState.text.includes("8.00h") &&
          mockDspMonthlyRollupReviewState.text.includes("4.50h") &&
          mockDspMonthlyRollupReviewState.text.includes("Not billed"),
        true,
        `${viewport.label}: expected static not-billed DSP rollup totals`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewState.boundary.includes("Mock/local only.") &&
          mockDspMonthlyRollupReviewState.boundary.includes("No billing automation") &&
          mockDspMonthlyRollupReviewState.boundary.includes("storage") &&
          mockDspMonthlyRollupReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected monthly rollup no billing/storage/API boundary`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewState.actionCount,
        0,
        `${viewport.label}: expected monthly DSP rollup review to stay display-only`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewState.rows.length,
        2,
        `${viewport.label}: expected two static mock monthly DSP rollup rows`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewState.height <=
          (viewport.width < 640 ? 520 : viewport.width < 1024 ? 380 : viewport.width < 1200 ? 320 : 260),
        true,
        `${viewport.label}: expected compact monthly DSP rollup review, got ${mockDspMonthlyRollupReviewState.height}px`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected monthly DSP rollup rows to stay readable`,
      );

      const mockDspReconciliationExceptionsReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-dsp-reconciliation-exceptions-review]");
            if (!review) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-dsp-reconciliation-exceptions-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-dsp-reconciliation-exceptions-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-dsp-reconciliation-exceptions-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock DSP reconciliation exceptions review`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewState.text.toLowerCase().includes("dsp exceptions"),
        true,
        `${viewport.label}: expected mock DSP reconciliation exceptions review`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewState.text.includes("Static mock exception rows only") &&
          mockDspReconciliationExceptionsReviewState.text.includes("Missing job completed time") &&
          mockDspReconciliationExceptionsReviewState.text.includes("Disputed extra hours") &&
          mockDspReconciliationExceptionsReviewState.text.includes("7.25h") &&
          mockDspReconciliationExceptionsReviewState.text.includes("6.75h") &&
          mockDspReconciliationExceptionsReviewState.text.includes("-0.50h") &&
          mockDspReconciliationExceptionsReviewState.text.includes("Not saved / not billed"),
        true,
        `${viewport.label}: expected static not-billed DSP reconciliation exception details`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewState.boundary.includes("Mock/local only.") &&
          mockDspReconciliationExceptionsReviewState.boundary.includes("No billing automation") &&
          mockDspReconciliationExceptionsReviewState.boundary.includes("storage") &&
          mockDspReconciliationExceptionsReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected reconciliation exceptions no billing/storage/API boundary`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewState.actionCount,
        0,
        `${viewport.label}: expected DSP reconciliation exceptions review to stay display-only`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewState.rows.length,
        4,
        `${viewport.label}: expected four static mock reconciliation exception rows`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewState.height <=
          (viewport.width < 640 ? 760 : viewport.width < 1024 ? 500 : viewport.width < 1200 ? 420 : 340),
        true,
        `${viewport.label}: expected compact DSP reconciliation exceptions review, got ${mockDspReconciliationExceptionsReviewState.height}px`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected DSP reconciliation exception rows to stay readable`,
      );

      const mockDspApprovalPacketReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-dsp-approval-packet-review]");
            if (!review) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-dsp-approval-packet-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-dsp-approval-packet-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-dsp-approval-packet-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              handoff:
                document.querySelector("[data-mock-dsp-approval-packet-review-handoff]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock DSP approval packet review`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.text.toLowerCase().includes("dsp approval packet"),
        true,
        `${viewport.label}: expected mock DSP approval packet review`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.text.includes("Static/mock approval packet data only") &&
          mockDspApprovalPacketReviewState.text.includes("3 jobs") &&
          mockDspApprovalPacketReviewState.text.includes("12.50h") &&
          mockDspApprovalPacketReviewState.text.includes("8.00h") &&
          mockDspApprovalPacketReviewState.text.includes("4.50h") &&
          mockDspApprovalPacketReviewState.text.includes("4 exceptions") &&
          mockDspApprovalPacketReviewState.text.includes("2 adjustments") &&
          mockDspApprovalPacketReviewState.text.includes("3.50h") &&
          mockDspApprovalPacketReviewState.text.includes("Not saved / not billed"),
        true,
        `${viewport.label}: expected static not-billed DSP approval packet details`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.handoff.includes("Future accounting handoff - mock only") &&
          mockDspApprovalPacketReviewState.handoff.includes("Future monthly invoice line - not created") &&
          mockDspApprovalPacketReviewState.handoff.includes("No invoice/payment/PDF generated") &&
          mockDspApprovalPacketReviewState.handoff.includes("Not saved / not billed"),
        true,
        `${viewport.label}: expected mock accounting handoff no invoice/payment/PDF copy`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.boundary.includes("Mock/local only.") &&
          mockDspApprovalPacketReviewState.boundary.includes("No approval persistence") &&
          mockDspApprovalPacketReviewState.boundary.includes("billing automation") &&
          mockDspApprovalPacketReviewState.boundary.includes("storage") &&
          mockDspApprovalPacketReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected approval packet no billing/storage/API boundary`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.actionCount,
        0,
        `${viewport.label}: expected DSP approval packet review to stay display-only`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.rows.length,
        2,
        `${viewport.label}: expected two static mock approval packet rows`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.height <=
          (viewport.width < 640 ? 620 : viewport.width < 1024 ? 420 : viewport.width < 1200 ? 360 : 300),
        true,
        `${viewport.label}: expected compact DSP approval packet review, got ${mockDspApprovalPacketReviewState.height}px`,
      );
      assert.equal(
        mockDspApprovalPacketReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected DSP approval packet rows to stay readable`,
      );

      const mockAccountingStatementPreviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const preview = document.querySelector("[data-mock-accounting-statement-preview]");
            if (!preview) {
              return false;
            }

            const rect = preview.getBoundingClientRect();
            const rows = [...preview.querySelectorAll("[data-mock-accounting-statement-preview-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-accounting-statement-preview-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: preview.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-accounting-statement-preview-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              line:
                document.querySelector("[data-mock-accounting-statement-preview-line]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              note:
                document.querySelector("[data-mock-accounting-statement-preview-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: preview.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock accounting statement preview`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.text.toLowerCase().includes("accounting statement"),
        true,
        `${viewport.label}: expected mock accounting statement preview`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.text.includes("Static/mock statement preview data only") &&
          mockAccountingStatementPreviewState.text.includes("3 jobs") &&
          mockAccountingStatementPreviewState.text.includes("11.50h") &&
          mockAccountingStatementPreviewState.text.includes("8.00h") &&
          mockAccountingStatementPreviewState.text.includes("3.50h") &&
          mockAccountingStatementPreviewState.text.includes("not charged") &&
          mockAccountingStatementPreviewState.text.includes("Not saved / not posted / not billed") &&
          mockAccountingStatementPreviewState.text.includes("Future preview only"),
        true,
        `${viewport.label}: expected static not-charged accounting statement preview details`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.line.includes("Future statement line - mock only") &&
          mockAccountingStatementPreviewState.line.includes("Future monthly invoice preview - not created") &&
          mockAccountingStatementPreviewState.line.includes("No invoice number generated") &&
          mockAccountingStatementPreviewState.line.includes("No PDF/payment link generated") &&
          mockAccountingStatementPreviewState.line.includes("Not saved / not posted / not billed"),
        true,
        `${viewport.label}: expected mock statement line with no invoice/PDF/payment/posting`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.note.includes("approved handoff reviewed") &&
          mockAccountingStatementPreviewState.note.includes("exceptions carried forward") &&
          mockAccountingStatementPreviewState.note.includes("adjustments noted") &&
          mockAccountingStatementPreviewState.note.includes("accounting review pending"),
        true,
        `${viewport.label}: expected accounting preview reconciliation note`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.boundary.includes("Mock/local only.") &&
          mockAccountingStatementPreviewState.boundary.includes("No billing automation") &&
          mockAccountingStatementPreviewState.boundary.includes("invoice") &&
          mockAccountingStatementPreviewState.boundary.includes("statement") &&
          mockAccountingStatementPreviewState.boundary.includes("payment link") &&
          mockAccountingStatementPreviewState.boundary.includes("PDF") &&
          mockAccountingStatementPreviewState.boundary.includes("storage") &&
          mockAccountingStatementPreviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected statement preview no billing/storage/API boundary`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.actionCount,
        0,
        `${viewport.label}: expected accounting statement preview to stay display-only`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.rows.length,
        2,
        `${viewport.label}: expected two static mock accounting statement preview rows`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.height <=
          (viewport.width < 640 ? 660 : viewport.width < 1024 ? 440 : viewport.width < 1200 ? 380 : 320),
        true,
        `${viewport.label}: expected compact accounting statement preview, got ${mockAccountingStatementPreviewState.height}px`,
      );
      assert.equal(
        mockAccountingStatementPreviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected accounting statement preview rows to stay readable`,
      );

      const mockStatementVarianceReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-statement-variance-review]");
            if (!review) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-statement-variance-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-statement-variance-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-statement-variance-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              generation:
                document.querySelector("[data-mock-statement-variance-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-statement-variance-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock statement variance review`,
      );
      assert.equal(
        mockStatementVarianceReviewState.text.toLowerCase().includes("statement variance"),
        true,
        `${viewport.label}: expected mock statement variance review`,
      );
      assert.equal(
        mockStatementVarianceReviewState.text.includes("Static/mock variance review data only") &&
          mockStatementVarianceReviewState.text.includes("11.50h") &&
          mockStatementVarianceReviewState.text.includes("7.25h") &&
          mockStatementVarianceReviewState.text.includes("6.75h") &&
          mockStatementVarianceReviewState.text.includes("-0.50h") &&
          mockStatementVarianceReviewState.text.includes("not charged") &&
          mockStatementVarianceReviewState.text.includes("Not billed / not posted"),
        true,
        `${viewport.label}: expected static not-billed statement variance details`,
      );
      assert.equal(
          mockStatementVarianceReviewState.note.includes("Variance review - mock only") &&
          mockStatementVarianceReviewState.note.includes("Statement approval decision - not saved") &&
          mockStatementVarianceReviewState.note.includes("Accounting approval pending") &&
          mockStatementVarianceReviewState.note.includes("manual goodwill adjustment noted"),
        true,
        `${viewport.label}: expected statement variance decision note`,
      );
      assert.equal(
        mockStatementVarianceReviewState.generation.includes("No invoice number generated") &&
          mockStatementVarianceReviewState.generation.includes("No PDF/payment link generated") &&
          mockStatementVarianceReviewState.generation.includes("No customer account posting generated") &&
          mockStatementVarianceReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected statement variance no invoice/PDF/payment/posting generation`,
      );
      assert.equal(
        mockStatementVarianceReviewState.boundary.includes("Mock/local only.") &&
          mockStatementVarianceReviewState.boundary.includes("No billing automation") &&
          mockStatementVarianceReviewState.boundary.includes("approval persistence") &&
          mockStatementVarianceReviewState.boundary.includes("storage") &&
          mockStatementVarianceReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected statement variance no billing/approval/storage/API boundary`,
      );
      assert.equal(
        mockStatementVarianceReviewState.actionCount,
        0,
        `${viewport.label}: expected statement variance review to stay display-only`,
      );
      assert.equal(
        mockStatementVarianceReviewState.rows.length,
        2,
        `${viewport.label}: expected two static mock statement variance rows`,
      );
      assert.equal(
        mockStatementVarianceReviewState.height <=
          (viewport.width < 640 ? 800 : viewport.width < 1024 ? 520 : viewport.width < 1200 ? 440 : 400),
        true,
        `${viewport.label}: expected compact statement variance review, got ${mockStatementVarianceReviewState.height}px`,
      );
      assert.equal(
        mockStatementVarianceReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected statement variance rows to stay readable`,
      );

      await clickTab("Dashboard");
      const mockReceivablesHandoffReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-receivables-handoff-review]");
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            if (!review || !group || !dashboard || !group.contains(review)) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-receivables-handoff-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-receivables-handoff-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-receivables-handoff-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              generation:
                document.querySelector("[data-mock-receivables-handoff-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-receivables-handoff-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock receivables handoff review`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.groupTop >= mockReceivablesHandoffReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected receivables review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.text.toLowerCase().includes("receivables handoff"),
        true,
        `${viewport.label}: expected mock receivables handoff review`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.text.includes("Static/mock receivables handoff QA data only") &&
          mockReceivablesHandoffReviewState.text.includes("Matched to preview") &&
          mockReceivablesHandoffReviewState.text.includes("Review variance") &&
          mockReceivablesHandoffReviewState.text.includes("Billing contact final check") &&
          mockReceivablesHandoffReviewState.text.includes("Statement release") &&
          mockReceivablesHandoffReviewState.text.includes("Not billed / not posted / not sent"),
        true,
        `${viewport.label}: expected static not-sent receivables handoff details`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.note.includes("Receivables handoff QA - mock only") &&
          mockReceivablesHandoffReviewState.note.includes("Statement release review - not saved") &&
          mockReceivablesHandoffReviewState.note.includes("Approved variance matched to statement preview") &&
          mockReceivablesHandoffReviewState.note.includes("billing contact needs final check") &&
          mockReceivablesHandoffReviewState.note.includes("exception carried forward") &&
          mockReceivablesHandoffReviewState.note.includes("accounting review pending"),
        true,
        `${viewport.label}: expected receivables QA decision note`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.generation.includes("No invoice number generated") &&
          mockReceivablesHandoffReviewState.generation.includes("No PDF/payment link generated") &&
          mockReceivablesHandoffReviewState.generation.includes("No customer account posting generated") &&
          mockReceivablesHandoffReviewState.generation.includes("No receivables record generated") &&
          mockReceivablesHandoffReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected receivables no invoice/PDF/payment/posting generation`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.boundary.includes("Mock/local only.") &&
          mockReceivablesHandoffReviewState.boundary.includes("No billing automation") &&
          mockReceivablesHandoffReviewState.boundary.includes("statement release persistence") &&
          mockReceivablesHandoffReviewState.boundary.includes("receivables record") &&
          mockReceivablesHandoffReviewState.boundary.includes("storage") &&
          mockReceivablesHandoffReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected receivables no billing/release/storage/API boundary`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.actionCount,
        0,
        `${viewport.label}: expected receivables handoff review to stay display-only`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.rows.length,
        2,
        `${viewport.label}: expected two static mock receivables rows`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.height <=
          (viewport.width < 640 ? 820 : viewport.width < 1024 ? 540 : viewport.width < 1200 ? 440 : 380),
        true,
        `${viewport.label}: expected compact receivables handoff review, got ${mockReceivablesHandoffReviewState.height}px`,
      );
      assert.equal(
        mockReceivablesHandoffReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected receivables handoff rows to stay readable`,
      );

      await clickTab("Dashboard");
      const mockReceivablesAgingFollowUpReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-receivables-aging-follow-up-review]");
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            if (!review || !group || !dashboard || !group.contains(review)) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-receivables-aging-follow-up-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-receivables-aging-follow-up-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-receivables-aging-follow-up-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              generation:
                document.querySelector("[data-mock-receivables-aging-follow-up-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-receivables-aging-follow-up-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock receivables aging follow-up review`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.groupTop >=
          mockReceivablesAgingFollowUpReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected receivables aging review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.text.toLowerCase().includes("receivables aging"),
        true,
        `${viewport.label}: expected mock receivables aging review`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.text.includes("Static/mock receivables aging review data only") &&
          mockReceivablesAgingFollowUpReviewState.text.includes("Current / not due") &&
          mockReceivablesAgingFollowUpReviewState.text.includes("1-30 day review") &&
          mockReceivablesAgingFollowUpReviewState.text.includes("DAYS") &&
          mockReceivablesAgingFollowUpReviewState.text.includes("Follow-up ready") &&
          mockReceivablesAgingFollowUpReviewState.text.includes("Billing contact needs check") &&
          mockReceivablesAgingFollowUpReviewState.text.includes("Exception carried forward") &&
          mockReceivablesAgingFollowUpReviewState.text.includes("Not sent / not posted / not billed"),
        true,
        `${viewport.label}: expected static not-sent receivables aging details`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.note.includes("Receivables aging review - mock only") &&
          mockReceivablesAgingFollowUpReviewState.note.includes("Follow-up QA - not saved") &&
          mockReceivablesAgingFollowUpReviewState.note.includes("Current/not due") &&
          mockReceivablesAgingFollowUpReviewState.note.includes("1-30 day follow-up ready") &&
          mockReceivablesAgingFollowUpReviewState.note.includes("billing contact needs check") &&
          mockReceivablesAgingFollowUpReviewState.note.includes("exception carried forward"),
        true,
        `${viewport.label}: expected receivables aging follow-up note`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.generation.includes("No customer reminder generated") &&
          mockReceivablesAgingFollowUpReviewState.generation.includes("No payment link generated") &&
          mockReceivablesAgingFollowUpReviewState.generation.includes("No receivables record generated") &&
          mockReceivablesAgingFollowUpReviewState.generation.includes("No collection action created") &&
          mockReceivablesAgingFollowUpReviewState.generation.includes("No invoice number generated") &&
          mockReceivablesAgingFollowUpReviewState.generation.includes("No PDF generated") &&
          mockReceivablesAgingFollowUpReviewState.generation.includes("No customer account posting generated") &&
          mockReceivablesAgingFollowUpReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected aging no reminder/payment/collection/invoice/PDF/posting generation`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.boundary.includes("Mock/local only.") &&
          mockReceivablesAgingFollowUpReviewState.boundary.includes("No billing automation") &&
          mockReceivablesAgingFollowUpReviewState.boundary.includes("aging persistence") &&
          mockReceivablesAgingFollowUpReviewState.boundary.includes("follow-up persistence") &&
          mockReceivablesAgingFollowUpReviewState.boundary.includes("collection persistence") &&
          mockReceivablesAgingFollowUpReviewState.boundary.includes("storage") &&
          mockReceivablesAgingFollowUpReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected aging no billing/follow-up/storage/API boundary`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.actionCount,
        0,
        `${viewport.label}: expected receivables aging review to stay display-only`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock aging rows`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.height <=
          (viewport.width < 640 ? 960 : viewport.width < 1024 ? 650 : viewport.width < 1200 ? 520 : 440),
        true,
        `${viewport.label}: expected compact receivables aging review, got ${mockReceivablesAgingFollowUpReviewState.height}px`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected receivables aging rows to stay readable`,
      );

      const mockCollectionsCreditWriteoffReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-collections-credit-writeoff-review]");
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            if (!review || !group || !dashboard || !group.contains(review)) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-collections-credit-writeoff-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-collections-credit-writeoff-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-collections-credit-writeoff-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              generation:
                document.querySelector("[data-mock-collections-credit-writeoff-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-collections-credit-writeoff-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock collections credit write-off review`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.groupTop >=
          mockCollectionsCreditWriteoffReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected collections credit write-off review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.text.toLowerCase().includes("collections escalation"),
        true,
        `${viewport.label}: expected mock collections escalation review`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.text.includes(
          "Static/mock collections escalation and credit/write-off QA data only",
        ) &&
          mockCollectionsCreditWriteoffReviewState.text.includes("Current / no escalation") &&
          mockCollectionsCreditWriteoffReviewState.text.includes("Follow-up ready") &&
          mockCollectionsCreditWriteoffReviewState.text.includes("Escalation needs manager review") &&
          mockCollectionsCreditWriteoffReviewState.text.includes("Credit/write-off candidate review") &&
          mockCollectionsCreditWriteoffReviewState.text.includes("Exception carried forward") &&
          mockCollectionsCreditWriteoffReviewState.text.includes(
            "Not sent / not posted / not billed / not written off",
          ),
        true,
        `${viewport.label}: expected static not-sent collections credit/write-off details`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.note.includes("Collections escalation review - mock only") &&
          mockCollectionsCreditWriteoffReviewState.note.includes("Credit/write-off QA - not saved") &&
          mockCollectionsCreditWriteoffReviewState.note.includes("Current account/no escalation") &&
          mockCollectionsCreditWriteoffReviewState.note.includes("follow-up ready") &&
          mockCollectionsCreditWriteoffReviewState.note.includes("escalation needs manager review") &&
          mockCollectionsCreditWriteoffReviewState.note.includes("credit/write-off candidate review") &&
          mockCollectionsCreditWriteoffReviewState.note.includes("exception carried forward"),
        true,
        `${viewport.label}: expected collections credit/write-off note`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.generation.includes("No customer reminder generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No payment link generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No collection action created") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No credit note generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No write-off record generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No receivables record generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No invoice number generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No PDF generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No customer account posting generated") &&
          mockCollectionsCreditWriteoffReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected collections no reminder/payment/collection/credit/write-off generation`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.boundary.includes("Mock/local only.") &&
          mockCollectionsCreditWriteoffReviewState.boundary.includes("No billing automation") &&
          mockCollectionsCreditWriteoffReviewState.boundary.includes("collection persistence") &&
          mockCollectionsCreditWriteoffReviewState.boundary.includes("credit note persistence") &&
          mockCollectionsCreditWriteoffReviewState.boundary.includes("write-off persistence") &&
          mockCollectionsCreditWriteoffReviewState.boundary.includes("storage") &&
          mockCollectionsCreditWriteoffReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected collections no billing/credit/write-off/storage/API boundary`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.actionCount,
        0,
        `${viewport.label}: expected collections credit write-off review to stay display-only`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock collections rows`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.height <=
          (viewport.width < 640 ? 1120 : viewport.width < 1024 ? 780 : viewport.width < 1200 ? 640 : 540),
        true,
        `${viewport.label}: expected compact collections credit write-off review, got ${mockCollectionsCreditWriteoffReviewState.height}px`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected collections credit write-off rows to stay readable`,
      );

      const mockPaymentAllocationRemittanceReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-payment-allocation-remittance-review]");
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            if (!review || !group || !dashboard || !group.contains(review)) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-payment-allocation-remittance-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-payment-allocation-remittance-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-payment-allocation-remittance-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              generation:
                document.querySelector("[data-mock-payment-allocation-remittance-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-payment-allocation-remittance-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock payment allocation remittance review`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.groupTop >=
          mockPaymentAllocationRemittanceReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected payment allocation remittance review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.text.toLowerCase().includes("payment allocation") &&
          mockPaymentAllocationRemittanceReviewState.text.toLowerCase().includes("remittance / short-pay qa"),
        true,
        `${viewport.label}: expected mock payment allocation remittance review`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.text.includes(
          "Static/mock payment allocation, remittance reconciliation, and short-pay dispute QA data only",
        ) &&
          mockPaymentAllocationRemittanceReviewState.text.includes("MOCK-PAY-UBS-MAY") &&
          mockPaymentAllocationRemittanceReviewState.text.includes("Full match / no dispute") &&
          mockPaymentAllocationRemittanceReviewState.text.includes("Short-pay needs review") &&
          mockPaymentAllocationRemittanceReviewState.text.includes("Remittance reference mismatch") &&
          mockPaymentAllocationRemittanceReviewState.text.includes("Overpayment / credit carry-forward") &&
          mockPaymentAllocationRemittanceReviewState.text.includes("Dispute carried forward") &&
          mockPaymentAllocationRemittanceReviewState.text.includes(
            "Not allocated / not posted / not reconciled / not billed",
          ),
        true,
        `${viewport.label}: expected static not-allocated payment allocation details`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.note.includes("Payment allocation review - mock only") &&
          mockPaymentAllocationRemittanceReviewState.note.includes("Remittance reconciliation QA - not saved") &&
          mockPaymentAllocationRemittanceReviewState.note.includes("Short-pay dispute review - not saved") &&
          mockPaymentAllocationRemittanceReviewState.note.includes("Full match/no dispute") &&
          mockPaymentAllocationRemittanceReviewState.note.includes("short-pay needs review") &&
          mockPaymentAllocationRemittanceReviewState.note.includes("remittance reference mismatch") &&
          mockPaymentAllocationRemittanceReviewState.note.includes("overpayment/credit carry-forward") &&
          mockPaymentAllocationRemittanceReviewState.note.includes("dispute carried forward"),
        true,
        `${viewport.label}: expected payment allocation remittance short-pay note`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.generation.includes("No payment record generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No remittance record generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No customer account posting generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No invoice number generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No PDF generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No payment link generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No receivables record generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No collection action created") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No credit note generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No write-off record generated") &&
          mockPaymentAllocationRemittanceReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected payment allocation no payment/remittance/posting/invoice/PDF generation`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.boundary.includes("Mock/local only.") &&
          mockPaymentAllocationRemittanceReviewState.boundary.includes("No billing automation") &&
          mockPaymentAllocationRemittanceReviewState.boundary.includes("payment allocation persistence") &&
          mockPaymentAllocationRemittanceReviewState.boundary.includes("remittance persistence") &&
          mockPaymentAllocationRemittanceReviewState.boundary.includes("dispute persistence") &&
          mockPaymentAllocationRemittanceReviewState.boundary.includes("storage") &&
          mockPaymentAllocationRemittanceReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected payment allocation no billing/remittance/dispute/storage/API boundary`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.actionCount,
        0,
        `${viewport.label}: expected payment allocation remittance review to stay display-only`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock payment allocation rows`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.height <=
          (viewport.width < 640 ? 1180 : viewport.width < 1024 ? 840 : viewport.width < 1200 ? 680 : 580),
        true,
        `${viewport.label}: expected compact payment allocation remittance review, got ${mockPaymentAllocationRemittanceReviewState.height}px`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected payment allocation remittance rows to stay readable`,
      );

      const mockMonthEndArCloseReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-month-end-ar-close-review]");
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            if (!review || !group || !dashboard || !group.contains(review)) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-month-end-ar-close-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-month-end-ar-close-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-month-end-ar-close-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              generation:
                document.querySelector("[data-mock-month-end-ar-close-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-month-end-ar-close-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock month-end AR close review`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.groupTop >= mockMonthEndArCloseReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected month-end AR close review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.text.toLowerCase().includes("month-end ar close") &&
          mockMonthEndArCloseReviewState.text.toLowerCase().includes("dispute packet qa"),
        true,
        `${viewport.label}: expected mock month-end AR close review`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.text.includes(
          "Static/mock month-end AR close and dispute-resolution approval packet QA data only",
        ) &&
          mockMonthEndArCloseReviewState.text.includes("Fully reconciled / ready for close") &&
          mockMonthEndArCloseReviewState.text.includes("Unresolved short-pay dispute") &&
          mockMonthEndArCloseReviewState.text.includes("Credit carry-forward pending") &&
          mockMonthEndArCloseReviewState.text.includes("Manager approval needed") &&
          mockMonthEndArCloseReviewState.text.includes("Accounting handoff pending") &&
          mockMonthEndArCloseReviewState.text.includes(
            "Not closed / not posted / not reconciled / not billed",
          ),
        true,
        `${viewport.label}: expected static not-closed month-end AR close details`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.note.includes("Month-end AR close review - mock only") &&
          mockMonthEndArCloseReviewState.note.includes("Dispute-resolution approval packet - not saved") &&
          mockMonthEndArCloseReviewState.note.includes("Fully reconciled/ready for close") &&
          mockMonthEndArCloseReviewState.note.includes("unresolved short-pay dispute") &&
          mockMonthEndArCloseReviewState.note.includes("credit carry-forward pending") &&
          mockMonthEndArCloseReviewState.note.includes("manager approval needed") &&
          mockMonthEndArCloseReviewState.note.includes("accounting handoff pending"),
        true,
        `${viewport.label}: expected month-end AR close dispute packet note`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.generation.includes("No AR close record generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No accounting handoff generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No customer account posting generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No invoice number generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No PDF generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No payment link generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No payment record generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No remittance record generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No dispute record generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No receivables record generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No collection action created") &&
          mockMonthEndArCloseReviewState.generation.includes("No credit note generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No write-off record generated") &&
          mockMonthEndArCloseReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected month-end AR close no close/payment/remittance/dispute/invoice/PDF generation`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.boundary.includes("Mock/local only.") &&
          mockMonthEndArCloseReviewState.boundary.includes("No billing automation") &&
          mockMonthEndArCloseReviewState.boundary.includes("AR close persistence") &&
          mockMonthEndArCloseReviewState.boundary.includes("month-end close persistence") &&
          mockMonthEndArCloseReviewState.boundary.includes("payment allocation persistence") &&
          mockMonthEndArCloseReviewState.boundary.includes("remittance persistence") &&
          mockMonthEndArCloseReviewState.boundary.includes("dispute persistence") &&
          mockMonthEndArCloseReviewState.boundary.includes("storage") &&
          mockMonthEndArCloseReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected month-end AR close no billing/close/remittance/dispute/storage/API boundary`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.actionCount,
        0,
        `${viewport.label}: expected month-end AR close review to stay display-only`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock month-end AR close rows`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.height <=
          (viewport.width < 640 ? 1180 : viewport.width < 1024 ? 840 : viewport.width < 1200 ? 680 : 580),
        true,
        `${viewport.label}: expected compact month-end AR close review, got ${mockMonthEndArCloseReviewState.height}px`,
      );
      assert.equal(
        mockMonthEndArCloseReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected month-end AR close rows to stay readable`,
      );

      const mockAccountingHandoffGlAuditReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const review = document.querySelector("[data-mock-accounting-handoff-gl-audit-review]");
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            if (!review || !group || !dashboard || !group.contains(review)) {
              return false;
            }

            const rect = review.getBoundingClientRect();
            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-accounting-handoff-gl-audit-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-accounting-handoff-gl-audit-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-accounting-handoff-gl-audit-review-column]")].map(
                  (column) => column.getAttribute("data-mock-accounting-handoff-gl-audit-review-column") || "",
                ),
              ),
            ];

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-accounting-handoff-gl-audit-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              copy:
                document.querySelector("[data-mock-accounting-handoff-gl-audit-review-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-accounting-handoff-gl-audit-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-accounting-handoff-gl-audit-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock accounting handoff GL audit review`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.groupTop >=
          mockAccountingHandoffGlAuditReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected accounting handoff GL audit review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.text.toLowerCase().includes("accounting handoff") &&
          mockAccountingHandoffGlAuditReviewState.text.toLowerCase().includes("gl / audit qa"),
        true,
        `${viewport.label}: expected mock accounting handoff GL audit review`,
      );
      assert.deepEqual(
        mockAccountingHandoffGlAuditReviewState.columns,
        [
          "Customer/account",
          "Statement month",
          "AR close status",
          "Accounting handoff status",
          "GL exception status",
          "Audit export readiness status",
          "Unresolved exception carry-forward status",
          "Manager/accounting approval status",
          "Mock handoff decision status",
          "Not-handed-off/not-posted/not-exported/not-billed status",
        ],
        `${viewport.label}: expected accounting handoff GL audit columns`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.copy.includes(
          "Static/mock accounting handoff, GL close exception, and audit export QA data only",
        ) &&
          mockAccountingHandoffGlAuditReviewState.copy.includes("internal review") &&
          mockAccountingHandoffGlAuditReviewState.copy.includes(
            "Nothing is handed off, posted, exported, billed, saved, generated, or sent",
          ),
        true,
        `${viewport.label}: expected static no-persistence accounting handoff copy`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.text.includes("AR close ready for accounting handoff") &&
          mockAccountingHandoffGlAuditReviewState.text.includes("GL exception needs review") &&
          mockAccountingHandoffGlAuditReviewState.text.includes("Audit export readiness pending") &&
          mockAccountingHandoffGlAuditReviewState.text.includes("Manager/accounting approval needed") &&
          mockAccountingHandoffGlAuditReviewState.text.includes("Unresolved exception carried forward") &&
          mockAccountingHandoffGlAuditReviewState.text.includes(
            "Not handed off / not posted / not exported / not billed",
          ),
        true,
        `${viewport.label}: expected static accounting handoff GL close audit scenarios`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.note.includes("Accounting handoff review - mock only") &&
          mockAccountingHandoffGlAuditReviewState.note.includes("GL close exception QA - not saved") &&
          mockAccountingHandoffGlAuditReviewState.note.includes("Audit export readiness - not exported") &&
          mockAccountingHandoffGlAuditReviewState.note.includes("AR close ready for accounting handoff") &&
          mockAccountingHandoffGlAuditReviewState.note.includes("GL exception needs review") &&
          mockAccountingHandoffGlAuditReviewState.note.includes("audit export readiness pending") &&
          mockAccountingHandoffGlAuditReviewState.note.includes("manager/accounting approval needed") &&
          mockAccountingHandoffGlAuditReviewState.note.includes("unresolved exception carried forward"),
        true,
        `${viewport.label}: expected accounting handoff GL audit note`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.generation.includes("No GL record generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No journal entry generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No accounting handoff generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No audit export file generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No customer account posting generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No invoice number generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No PDF generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No payment link generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No payment record generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No remittance record generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No dispute record generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No receivables record generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No collection action created") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No credit note generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No write-off record generated") &&
          mockAccountingHandoffGlAuditReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected accounting handoff no GL/journal/export/invoice/PDF generation`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.boundary.includes("Mock/local only.") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("No billing automation") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("AR close persistence") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("GL close persistence") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("accounting handoff persistence") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("journal entry persistence") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("audit export persistence") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("storage") &&
          mockAccountingHandoffGlAuditReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected accounting handoff no billing/GL/export/storage/API boundary`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.actionCount,
        0,
        `${viewport.label}: expected accounting handoff GL audit review to stay display-only`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock accounting handoff rows`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.height <=
          (viewport.width < 640 ? 1160 : viewport.width < 1024 ? 820 : viewport.width < 1200 ? 660 : 560),
        true,
        `${viewport.label}: expected compact accounting handoff GL audit review, got ${mockAccountingHandoffGlAuditReviewState.height}px`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected accounting handoff GL audit rows to stay readable`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewState.docScrollWidth <=
          mockAccountingHandoffGlAuditReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected accounting handoff GL audit review not to create horizontal overflow`,
      );

      const mockAuditEvidenceFinanceArchiveReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const review = document.querySelector("[data-mock-audit-evidence-finance-archive-review]");
            if (!group || !dashboard || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-audit-evidence-finance-archive-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-audit-evidence-finance-archive-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-audit-evidence-finance-archive-review-column]")].map(
                  (column) => column.getAttribute("data-mock-audit-evidence-finance-archive-review-column") || "",
                ),
              ),
            ];

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-audit-evidence-finance-archive-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              copy:
                document.querySelector("[data-mock-audit-evidence-finance-archive-review-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-audit-evidence-finance-archive-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-audit-evidence-finance-archive-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock audit evidence finance archive review`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.groupTop >=
          mockAuditEvidenceFinanceArchiveReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected audit evidence finance archive review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.text.toLowerCase().includes("audit evidence") &&
          mockAuditEvidenceFinanceArchiveReviewState.text.toLowerCase().includes("finance / archive qa"),
        true,
        `${viewport.label}: expected mock audit evidence finance archive review`,
      );
      assert.deepEqual(
        mockAuditEvidenceFinanceArchiveReviewState.columns,
        [
          "Customer/account",
          "Statement month",
          "Accounting handoff status",
          "Audit evidence packet status",
          "Finance close sign-off status",
          "Archive-readiness status",
          "Unresolved evidence exception carry-forward status",
          "Manager/finance approval status",
          "Mock archive decision status",
          "Not-signed-off/not-archived/not-exported/not-billed status",
        ],
        `${viewport.label}: expected audit evidence finance archive columns`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.copy.includes(
          "Static/mock audit evidence packet, finance close sign-off, and archive-readiness QA data only",
        ) &&
          mockAuditEvidenceFinanceArchiveReviewState.copy.includes("internal review") &&
          mockAuditEvidenceFinanceArchiveReviewState.copy.includes(
            "Nothing is signed off, archived, exported, billed, saved, generated, or sent",
          ),
        true,
        `${viewport.label}: expected static no-persistence audit evidence copy`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.text.includes("Audit evidence packet ready") &&
          mockAuditEvidenceFinanceArchiveReviewState.text.includes("Finance sign-off needed") &&
          mockAuditEvidenceFinanceArchiveReviewState.text.includes("Archive-readiness pending") &&
          mockAuditEvidenceFinanceArchiveReviewState.text.includes("Manager/finance approval needed") &&
          mockAuditEvidenceFinanceArchiveReviewState.text.includes("Unresolved evidence exception carried forward") &&
          mockAuditEvidenceFinanceArchiveReviewState.text.includes(
            "Not signed off / not archived / not exported / not billed",
          ),
        true,
        `${viewport.label}: expected static audit evidence finance archive scenarios`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.note.includes("Audit evidence packet review - mock only") &&
          mockAuditEvidenceFinanceArchiveReviewState.note.includes("Finance close sign-off QA - not saved") &&
          mockAuditEvidenceFinanceArchiveReviewState.note.includes("Archive-readiness review - not archived") &&
          mockAuditEvidenceFinanceArchiveReviewState.note.includes("Audit evidence packet ready") &&
          mockAuditEvidenceFinanceArchiveReviewState.note.includes("finance sign-off needed") &&
          mockAuditEvidenceFinanceArchiveReviewState.note.includes("archive-readiness pending") &&
          mockAuditEvidenceFinanceArchiveReviewState.note.includes("manager/finance approval needed") &&
          mockAuditEvidenceFinanceArchiveReviewState.note.includes("unresolved evidence exception carried forward"),
        true,
        `${viewport.label}: expected audit evidence finance archive note`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No audit evidence file generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No finance sign-off record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No archive record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No audit export file generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No GL record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No journal entry generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No accounting handoff generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No customer account posting generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No invoice number generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No PDF generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No payment link generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No payment record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No remittance record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No dispute record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No receivables record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No collection action created") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No credit note generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No write-off record generated") &&
          mockAuditEvidenceFinanceArchiveReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected audit evidence no archive/export/invoice/PDF generation`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("Mock/local only.") &&
          mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("No billing automation") &&
          mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("audit export persistence") &&
          mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("audit evidence persistence") &&
          mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("finance sign-off persistence") &&
          mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("archive persistence") &&
          mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("storage") &&
          mockAuditEvidenceFinanceArchiveReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected audit evidence no billing/archive/storage/API boundary`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.actionCount,
        0,
        `${viewport.label}: expected audit evidence finance archive review to stay display-only`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock audit evidence rows`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.height <=
          (viewport.width < 640 ? 1180 : viewport.width < 1024 ? 840 : viewport.width < 1200 ? 680 : 580),
        true,
        `${viewport.label}: expected compact audit evidence finance archive review, got ${mockAuditEvidenceFinanceArchiveReviewState.height}px`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected audit evidence finance archive rows to stay readable`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewState.docScrollWidth <=
          mockAuditEvidenceFinanceArchiveReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected audit evidence finance archive review not to create horizontal overflow`,
      );

      const mockPostCloseAuditRetentionReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const review = document.querySelector("[data-mock-post-close-audit-retention-review]");
            if (!group || !dashboard || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-post-close-audit-retention-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-post-close-audit-retention-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-post-close-audit-retention-review-column]")].map(
                  (column) => column.getAttribute("data-mock-post-close-audit-retention-review-column") || "",
                ),
              ),
            ];

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-post-close-audit-retention-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              copy:
                document.querySelector("[data-mock-post-close-audit-retention-review-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-post-close-audit-retention-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-post-close-audit-retention-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock post-close audit retention review`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.groupTop >=
          mockPostCloseAuditRetentionReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected post-close audit retention review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.text.toLowerCase().includes("post-close") &&
          mockPostCloseAuditRetentionReviewState.text.toLowerCase().includes("audit / retention qa"),
        true,
        `${viewport.label}: expected mock post-close audit retention review`,
      );
      assert.deepEqual(
        mockPostCloseAuditRetentionReviewState.columns,
        [
          "Customer/account",
          "Statement month",
          "Finance close status",
          "Archive status",
          "Post-close exception status",
          "Audit inquiry retrieval status",
          "Retention-readiness status",
          "Reopen approval status",
          "Mock retrieval decision status",
          "Not-reopened/not-retrieved/not-exported/not-billed status",
        ],
        `${viewport.label}: expected post-close audit retention columns`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.copy.includes(
          "Static/mock post-close exception reopen, audit inquiry retrieval, and retention-readiness QA data only",
        ) &&
          mockPostCloseAuditRetentionReviewState.copy.includes("internal review") &&
          mockPostCloseAuditRetentionReviewState.copy.includes(
            "Nothing is reopened, retrieved, exported, archived, retained, billed, saved, generated, or sent",
          ),
        true,
        `${viewport.label}: expected static no-persistence post-close audit retention copy`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.text.includes("Closed account / no reopen needed") &&
          mockPostCloseAuditRetentionReviewState.text.includes("Audit inquiry retrieval ready") &&
          mockPostCloseAuditRetentionReviewState.text.includes("Post-close exception needs manager review") &&
          mockPostCloseAuditRetentionReviewState.text.includes("Retention-readiness pending") &&
          mockPostCloseAuditRetentionReviewState.text.includes("Reopen request blocked pending approval") &&
          mockPostCloseAuditRetentionReviewState.text.includes("Unresolved evidence exception carried forward") &&
          mockPostCloseAuditRetentionReviewState.text.includes(
            "Not reopened / not retrieved / not exported / not billed",
          ),
        true,
        `${viewport.label}: expected static post-close audit retention scenarios`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.note.includes("Post-close exception review - mock only") &&
          mockPostCloseAuditRetentionReviewState.note.includes("Audit inquiry retrieval QA - not saved") &&
          mockPostCloseAuditRetentionReviewState.note.includes("Retention-readiness review - not archived") &&
          mockPostCloseAuditRetentionReviewState.note.includes("Closed account/no reopen needed") &&
          mockPostCloseAuditRetentionReviewState.note.includes("audit inquiry retrieval ready") &&
          mockPostCloseAuditRetentionReviewState.note.includes("post-close exception needs manager review") &&
          mockPostCloseAuditRetentionReviewState.note.includes("retention-readiness pending") &&
          mockPostCloseAuditRetentionReviewState.note.includes("reopen request blocked pending approval") &&
          mockPostCloseAuditRetentionReviewState.note.includes("unresolved evidence exception carried forward"),
        true,
        `${viewport.label}: expected post-close audit retention note`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.generation.includes("No post-close exception record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No audit inquiry record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No retrieval/export file generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No retention record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No audit evidence file generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No finance sign-off record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No archive record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No audit export file generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No GL record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No journal entry generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No accounting handoff generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No customer account posting generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No invoice number generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No PDF generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No payment link generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No payment record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No remittance record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No dispute record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No receivables record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No collection action created") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No credit note generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No write-off record generated") &&
          mockPostCloseAuditRetentionReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected post-close no inquiry/retrieval/retention/invoice/PDF generation`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.boundary.includes("Mock/local only.") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("No billing automation") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("audit evidence persistence") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("finance sign-off persistence") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("archive persistence") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("retention persistence") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("post-close exception persistence") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("audit inquiry persistence") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("retrieval/export persistence") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("storage") &&
          mockPostCloseAuditRetentionReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected post-close no billing/retrieval/retention/storage/API boundary`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.actionCount,
        0,
        `${viewport.label}: expected post-close audit retention review to stay display-only`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock post-close audit retention rows`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.height <=
          (viewport.width < 640 ? 1220 : viewport.width < 1024 ? 860 : viewport.width < 1200 ? 700 : 600),
        true,
        `${viewport.label}: expected compact post-close audit retention review, got ${mockPostCloseAuditRetentionReviewState.height}px`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected post-close audit retention rows to stay readable`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewState.docScrollWidth <=
          mockPostCloseAuditRetentionReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected post-close audit retention review not to create horizontal overflow`,
      );

      const mockCloseCycleEvidenceResponseRetentionReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const review = document.querySelector("[data-mock-close-cycle-evidence-response-retention-review]");
            if (!group || !dashboard || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-close-cycle-evidence-response-retention-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-close-cycle-evidence-response-retention-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-close-cycle-evidence-response-retention-review-column]")].map(
                  (column) => column.getAttribute("data-mock-close-cycle-evidence-response-retention-review-column") || "",
                ),
              ),
            ];

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-close-cycle-evidence-response-retention-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              copy:
                document.querySelector("[data-mock-close-cycle-evidence-response-retention-review-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-close-cycle-evidence-response-retention-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-close-cycle-evidence-response-retention-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock close-cycle evidence response retention review`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.groupTop >=
          mockCloseCycleEvidenceResponseRetentionReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected close-cycle evidence response retention review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.text.toLowerCase().includes("close-cycle") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.text.toLowerCase().includes("evidence / response qa"),
        true,
        `${viewport.label}: expected mock close-cycle evidence response retention review`,
      );
      assert.deepEqual(
        mockCloseCycleEvidenceResponseRetentionReviewState.columns,
        [
          "Customer/account",
          "Statement month",
          "Post-close review status",
          "Evidence index status",
          "Audit inquiry response status",
          "Response packet completeness status",
          "Retention exception approval status",
          "Evidence carry-forward status",
          "Mock response decision status",
          "Not-indexed/not-approved/not-exported/not-billed status",
        ],
        `${viewport.label}: expected close-cycle evidence response retention columns`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.copy.includes(
          "Static/mock close-cycle evidence index, audit inquiry response packet, and retention exception approval QA data only",
        ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.copy.includes("internal review") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.copy.includes(
            "Nothing is indexed, approved, exported, billed, saved, generated, or sent",
          ),
        true,
        `${viewport.label}: expected static no-persistence close-cycle evidence response retention copy`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.text.includes("Evidence index ready") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.text.includes("Audit inquiry response packet ready") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.text.includes("Missing evidence requires follow-up") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.text.includes("Retention exception needs approval") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.text.includes(
            "Response packet blocked pending manager review",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.text.includes(
            "Carried evidence exception remains unresolved",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.text.includes(
            "Not indexed / not approved / not exported / not billed",
          ),
        true,
        `${viewport.label}: expected static close-cycle evidence response retention scenarios`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.note.includes("Close-cycle evidence index - mock only") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes(
            "Audit inquiry response packet - not saved",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes(
            "Retention exception approval - not approved",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes("Evidence index ready") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes("audit inquiry response packet ready") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes("missing evidence requires follow-up") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes(
            "retention exception needs approval",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes(
            "response packet blocked pending manager review",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.note.includes(
            "carried evidence exception remains unresolved",
          ),
        true,
        `${viewport.label}: expected close-cycle evidence response retention note`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No evidence index generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No audit response packet generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No retention approval record generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No post-close exception record generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No audit inquiry record generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No retrieval/export file generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No retention record generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No audit evidence file generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No finance sign-off record generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No archive record generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No audit export file generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No GL record generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No journal entry generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No accounting handoff generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes(
            "No customer account posting generated",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No invoice number generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No PDF generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No payment link generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No payment record generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No remittance record generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No dispute record generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No receivables record generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No collection action created") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No credit note generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No write-off record generated") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.generation.includes("No accounting record generated"),
        true,
        `${viewport.label}: expected close-cycle no evidence/response/retention/invoice/PDF generation`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("Mock/local only.") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("No billing automation") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("audit evidence persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("finance sign-off persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("archive persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("retention persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("post-close exception persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("audit inquiry persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("retrieval/export persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("response packet persistence") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes(
            "retention exception approval persistence",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes(
            "close-cycle evidence index persistence",
          ) &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("storage") &&
          mockCloseCycleEvidenceResponseRetentionReviewState.boundary.includes("API call"),
        true,
        `${viewport.label}: expected close-cycle no billing/response/retention/storage/API boundary`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.actionCount,
        0,
        `${viewport.label}: expected close-cycle evidence response retention review to stay display-only`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock close-cycle evidence response retention rows`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.height <=
          (viewport.width < 640 ? 1280 : viewport.width < 1024 ? 900 : viewport.width < 1200 ? 720 : 620),
        true,
        `${viewport.label}: expected compact close-cycle evidence response retention review, got ${mockCloseCycleEvidenceResponseRetentionReviewState.height}px`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected close-cycle evidence response retention rows to stay readable`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewState.docScrollWidth <=
          mockCloseCycleEvidenceResponseRetentionReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected close-cycle evidence response retention review not to create horizontal overflow`,
      );

      const mockCloseCycleExceptionResolutionAuditHandoffReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const review = document.querySelector("[data-mock-close-cycle-exception-resolution-audit-handoff-review]");
            if (!group || !dashboard || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-close-cycle-exception-resolution-audit-handoff-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-close-cycle-exception-resolution-audit-handoff-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-close-cycle-exception-resolution-audit-handoff-review-column]")].map(
                  (column) =>
                    column.getAttribute("data-mock-close-cycle-exception-resolution-audit-handoff-review-column") || "",
                ),
              ),
            ];

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-close-cycle-exception-resolution-audit-handoff-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              copy:
                document.querySelector("[data-mock-close-cycle-exception-resolution-audit-handoff-review-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-close-cycle-exception-resolution-audit-handoff-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-close-cycle-exception-resolution-audit-handoff-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock close-cycle exception resolution audit handoff review`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.groupTop >=
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected close-cycle exception resolution audit handoff review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.toLowerCase().includes("close-cycle") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.text
            .toLowerCase()
            .includes("exception / handoff qa"),
        true,
        `${viewport.label}: expected mock close-cycle exception resolution audit handoff review`,
      );
      assert.deepEqual(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.columns,
        [
          "Customer/account",
          "Statement month",
          "Close-cycle evidence status",
          "Manager review outcome status",
          "Evidence follow-up queue status",
          "Audit response handoff status",
          "Retention exception disposition status",
          "Carried exception resolution status",
          "Mock resolution decision status",
          "Not-resolved/not-handed-off/not-exported/not-billed status",
        ],
        `${viewport.label}: expected close-cycle exception resolution audit handoff columns`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.copy.includes(
          "Static/mock internal close-cycle exception resolution, audit response handoff, and retention exception disposition QA data only",
        ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.copy.includes("internal review") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.copy.includes(
            "Nothing is resolved, handed off, exported, billed, saved, generated, approved, indexed, or sent",
          ),
        true,
        `${viewport.label}: expected static no-persistence close-cycle exception resolution audit handoff copy`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.includes(
          "Manager review approved - mock only",
        ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.includes("Follow-up queued") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.includes("Handoff ready") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.includes("Disposition pending") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.includes("Blocked pending manager review") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.includes(
            "Carried exception still unresolved",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.text.includes(
            "Not resolved / not handed off / not exported / not billed",
          ),
        true,
        `${viewport.label}: expected static close-cycle exception resolution audit handoff scenarios`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes(
          "Close-cycle exception resolution - mock only",
        ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes(
            "Audit response handoff QA - not saved",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes(
            "Retention exception disposition - not approved",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes(
            "Manager review approved - mock only",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes("evidence follow-up queued") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes("audit response handoff ready") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes(
            "retention exception disposition pending",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes(
            "resolution blocked pending manager review",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.note.includes(
            "carried exception still unresolved",
          ),
        true,
        `${viewport.label}: expected close-cycle exception resolution audit handoff note`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
          "No exception resolution record generated",
        ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No audit response handoff record generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No retention approval record generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No evidence index generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No audit response packet generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No post-close exception record generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No audit inquiry record generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No retrieval/export file generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No invoice/payment/PDF generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No waiting-time record generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No extra-charge record generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No customer charge record generated",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.generation.includes(
            "No driver payout record generated",
          ),
        true,
        `${viewport.label}: expected close-cycle no exception/audit handoff/waiting-time/extra-charge/invoice/PDF generation`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes("Mock/local only.") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes("No billing automation") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes(
            "response packet persistence",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes(
            "retention exception approval persistence",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes(
            "close-cycle evidence index persistence",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes(
            "exception resolution persistence",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes(
            "audit response handoff persistence",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes(
            "waiting-time persistence",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes(
            "extra-charge persistence",
          ) &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes("storage") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes("API call") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes("resolve") &&
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.boundary.includes("handoff"),
        true,
        `${viewport.label}: expected close-cycle no billing/exception/handoff/storage/API boundary`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.actionCount,
        0,
        `${viewport.label}: expected close-cycle exception resolution audit handoff review to stay display-only`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.rows.length,
        3,
        `${viewport.label}: expected three static mock close-cycle exception resolution audit handoff rows`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.height <=
          (viewport.width < 640 ? 1360 : viewport.width < 1024 ? 920 : viewport.width < 1200 ? 740 : 640),
        true,
        `${viewport.label}: expected compact close-cycle exception resolution audit handoff review, got ${mockCloseCycleExceptionResolutionAuditHandoffReviewState.height}px`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.rows.every(
          (row) => row.height >= 28 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected close-cycle exception resolution audit handoff rows to stay readable`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewState.docScrollWidth <=
          mockCloseCycleExceptionResolutionAuditHandoffReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected close-cycle exception resolution audit handoff review not to create horizontal overflow`,
      );

      const mockWaitingTimeExtraChargesPlanningReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const review = document.querySelector("[data-mock-waiting-time-extra-charges-planning-review]");
            if (!group || !dashboard || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-waiting-time-extra-charges-planning-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-waiting-time-extra-charges-planning-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-waiting-time-extra-charges-planning-review-column]")].map(
                  (column) =>
                    column.getAttribute("data-mock-waiting-time-extra-charges-planning-review-column") || "",
                ),
              ),
            ];

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-waiting-time-extra-charges-planning-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              copy:
                document.querySelector("[data-mock-waiting-time-extra-charges-planning-review-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-waiting-time-extra-charges-planning-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-waiting-time-extra-charges-planning-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock waiting-time extra-charges planning review`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.groupTop >=
          mockWaitingTimeExtraChargesPlanningReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected waiting-time extra-charges planning review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.text.toLowerCase().includes("waiting time") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.toLowerCase().includes("extra charges qa"),
        true,
        `${viewport.label}: expected mock waiting-time extra-charges planning review`,
      );
      assert.deepEqual(
        mockWaitingTimeExtraChargesPlanningReviewState.columns,
        [
          "Customer/account",
          "Statement month or job reference",
          "Extra charge type",
          "Waiting blocks",
          "Minutes per block",
          "Customer waiting charge per block",
          "Driver waiting payout per block",
          "Extra stop review status",
          "Customer extra-charge preview status",
          "Driver payout preview status",
          "Dispatcher review status",
          "Mock pricing decision status",
          "Not-billed/not-paid/not-posted/not-saved status",
        ],
        `${viewport.label}: expected waiting-time extra-charges planning columns`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.copy.includes(
          "Static/mock waiting-time, extra-charge pricing, and driver payout planning QA data only",
        ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.copy.includes("internal review") &&
          mockWaitingTimeExtraChargesPlanningReviewState.copy.includes(
            "Nothing is billed, paid, posted, saved, calculated as a real price, generated, exported, or sent",
          ),
        true,
        `${viewport.label}: expected static no-persistence waiting-time extra-charges planning copy`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.text.includes("No waiting / no extra stop") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes("Waiting time only") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes("Extra stop only") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes("Waiting time + extra stop") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes("2 blocks") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes("3 blocks") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes("$15 per block") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes("$10 per block") &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes(
            "Driver payout preview needs dispatcher confirmation",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes(
            "Customer charge preview blocked from real billing",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.text.includes(
            "Not billed / not paid / not posted / not saved",
          ),
        true,
        `${viewport.label}: expected static waiting-time extra-charge driver-payout planning scenarios`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.note.includes("Waiting time pricing review - mock only") &&
          mockWaitingTimeExtraChargesPlanningReviewState.note.includes("1 waiting block = 15 minutes") &&
          mockWaitingTimeExtraChargesPlanningReviewState.note.includes(
            "Customer waiting charge: $15 per block",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.note.includes(
            "Driver waiting payout: $10 per block",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.note.includes(
            "Waiting time remains separate from extra stops internally",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.note.includes(
            "remains internally distinct from extra stops",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.note.includes(
            "Extra Charges display may group waiting time and extra stops",
          ),
        true,
        `${viewport.label}: expected waiting-time rule and internal separation note`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.generation.includes(
          "No customer charge record generated",
        ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes(
            "No driver payout record generated",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes(
            "No waiting-time record generated",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes(
            "No extra-charge record generated",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes("No invoice number generated") &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes("No PDF generated") &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes("No payment link generated") &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes(
            "No receivables record generated",
          ) &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes("No collection action created") &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes("No credit note generated") &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes("No write-off record generated") &&
          mockWaitingTimeExtraChargesPlanningReviewState.generation.includes(
            "No accounting record generated",
          ),
        true,
        `${viewport.label}: expected no waiting-time/extra-charge/customer-charge/driver-payout generation`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("Mock/local only.") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("No billing automation") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("customer charge") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("driver payout") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("waiting-time persistence") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("extra-charge persistence") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("customer-charge persistence") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("driver-payout persistence") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("storage") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("API call") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("fetch") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("XHR") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("sendBeacon") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("WebSocket") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("Supabase") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("calculate-real-price") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("pay") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("bill") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("notification") &&
          mockWaitingTimeExtraChargesPlanningReviewState.boundary.includes("send behavior"),
        true,
        `${viewport.label}: expected waiting-time no billing/payout/storage/API boundary`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.actionCount,
        0,
        `${viewport.label}: expected waiting-time extra-charges planning review to stay display-only`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.rows.length,
        4,
        `${viewport.label}: expected four static mock waiting-time extra-charges planning rows`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.height <=
          (viewport.width < 640 ? 1520 : viewport.width < 1024 ? 980 : viewport.width < 1200 ? 800 : 700),
        true,
        `${viewport.label}: expected compact waiting-time extra-charges planning review, got ${mockWaitingTimeExtraChargesPlanningReviewState.height}px`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected waiting-time extra-charges planning rows to stay readable`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewState.docScrollWidth <=
          mockWaitingTimeExtraChargesPlanningReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected waiting-time extra-charges planning review not to create horizontal overflow`,
      );

      const mockExtraChargesVarianceApprovalReconciliationReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const waitingReview = document.querySelector("[data-mock-waiting-time-extra-charges-planning-review]");
            const review = document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review]");
            if (!group || !dashboard || !waitingReview || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const waitingRect = waitingReview.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-extra-charges-variance-approval-reconciliation-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-extra-charges-variance-approval-reconciliation-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-extra-charges-variance-approval-reconciliation-review-column]")].map(
                  (column) =>
                    column.getAttribute("data-mock-extra-charges-variance-approval-reconciliation-review-column") || "",
                ),
              ),
            ];

            return {
              actionCount: review.querySelectorAll("button, a, input, select, textarea, form").length,
              boundary:
                document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              copy:
                document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              sectionTop: Math.round(rect.top),
              text: review.innerText,
              waitingBottom: Math.round(waitingRect.bottom),
            };
          })()`),
        10000,
        `${viewport.label} mock extra charges variance approval reconciliation review`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.groupTop >=
          mockExtraChargesVarianceApprovalReconciliationReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected extra charges variance approval review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.sectionTop >=
          mockExtraChargesVarianceApprovalReconciliationReviewState.waitingBottom,
        true,
        `${viewport.label}: expected extra charges variance approval review after waiting-time planning review`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.text.toLowerCase().includes("extra charges") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.toLowerCase().includes("variance / approval qa"),
        true,
        `${viewport.label}: expected mock extra charges variance approval review`,
      );
      assert.deepEqual(
        mockExtraChargesVarianceApprovalReconciliationReviewState.columns,
        [
          "Customer/account",
          "Statement month or job reference",
          "Charge source",
          "Waiting block rule",
          "Customer waiting charge per block",
          "Driver waiting payout per block",
          "Extra-stop review status",
          "Waiting-time variance status",
          "Customer charge review status",
          "Driver payout reconciliation status",
          "Dispatcher approval handoff status",
          "Not-approved/not-billed/not-paid/not-saved status",
        ],
        `${viewport.label}: expected extra charges variance approval columns`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.copy.includes(
          "Static/mock extra-charge variance, dispatcher approval handoff, and driver payout reconciliation QA data only",
        ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.copy.includes("internal review") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.copy.includes(
            "Nothing is billed, paid, approved, posted, saved, reconciled, generated, exported, or sent",
          ),
        true,
        `${viewport.label}: expected static no-persistence extra charges variance copy`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("No waiting / no extra stop") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("Waiting time only") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("Extra stop only") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("Waiting time + extra stop") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("15 minutes per block") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("$15 per block") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("$10 per block") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("2 waiting blocks need review") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes("3 waiting blocks need review") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes(
            "Driver waiting payout reconciliation pending",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes(
            "Dispatcher approval handoff pending",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.text.includes(
            "Not approved / not billed / not paid / not saved",
          ),
        true,
        `${viewport.label}: expected static extra charges variance approval scenarios`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
          "Extra charges variance review - mock only",
        ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
            "1 waiting block = 15 minutes",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
            "Customer waiting charge: $15 per block",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
            "Driver waiting payout: $10 per block",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
            "Waiting time remains separate from extra stops internally",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
            "remains internally distinct from extra stops",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
            "Extra Charges display may group waiting time and extra stops",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.note.includes(
            "variance review keeps waiting-time and extra-stop sources separate",
          ),
        true,
        `${viewport.label}: expected extra charges variance rule and internal separation note`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes(
          "No dispatcher approval record generated",
        ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes(
            "No driver payout reconciliation record generated",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes(
            "No customer charge record generated",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes(
            "No waiting-time record generated",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes(
            "No extra-charge record generated",
          ) &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes("No invoice number generated") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes("No PDF generated") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes("No payment link generated") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.generation.includes(
            "No accounting record generated",
          ),
        true,
        `${viewport.label}: expected no extra-charge/customer-charge/driver-payout reconciliation generation`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("Mock/local only.") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("No billing automation") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("monthly invoice") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("payment link") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("PDF") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("accounting integration") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("customer auth") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("waiting-time persistence") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("extra-charge persistence") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("customer-charge persistence") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("driver-payout persistence") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("storage") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("localStorage") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("sessionStorage") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("API call") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("fetch") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("XHR") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("sendBeacon") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("WebSocket") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("Supabase") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("message-channel delivery") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("customer notification") &&
          mockExtraChargesVarianceApprovalReconciliationReviewState.boundary.includes("send behavior"),
        true,
        `${viewport.label}: expected extra charges variance no billing/payout/storage/API boundary`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.actionCount,
        0,
        `${viewport.label}: expected extra charges variance approval review to stay display-only`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.rows.length,
        4,
        `${viewport.label}: expected four static mock extra charges variance rows`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.height <=
          (viewport.width < 640 ? 1520 : viewport.width < 1024 ? 980 : viewport.width < 1200 ? 800 : 700),
        true,
        `${viewport.label}: expected compact extra charges variance approval review, got ${mockExtraChargesVarianceApprovalReconciliationReviewState.height}px`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.rows.every(
          (row) => row.height >= 28 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected extra charges variance rows to stay readable`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewState.docScrollWidth <=
          mockExtraChargesVarianceApprovalReconciliationReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected extra charges variance review not to create horizontal overflow`,
      );

      const mockMidnightChargeAutoDetectionOverrideReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const varianceReview = document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review]");
            const review = document.querySelector("[data-mock-midnight-charge-auto-detection-override-review]");
            if (!group || !dashboard || !varianceReview || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const varianceRect = varianceReview.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-midnight-charge-auto-detection-override-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-midnight-charge-auto-detection-override-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-midnight-charge-auto-detection-override-column]")].map(
                  (column) =>
                    column.getAttribute("data-mock-midnight-charge-auto-detection-override-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: review.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-midnight-charge-auto-detection-override-boundary]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: review.querySelectorAll("input, select, textarea").length,
              copy:
                document.querySelector("[data-mock-midnight-charge-auto-detection-override-copy]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-midnight-charge-auto-detection-override-generation]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              modeValue: document.querySelector("[data-mock-midnight-charge-override-mode]")?.value || "",
              note:
                document.querySelector("[data-mock-midnight-charge-auto-detection-override-note]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              reasonValue: document.querySelector("[data-mock-midnight-charge-override-reason]")?.value || "",
              rows,
              sectionTop: Math.round(rect.top),
              text: review.innerText,
              varianceBottom: Math.round(varianceRect.bottom),
            };
          })()`),
        10000,
        `${viewport.label} mock midnight charge auto-detection override review`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.groupTop >=
          mockMidnightChargeAutoDetectionOverrideReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected midnight charge review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.sectionTop >=
          mockMidnightChargeAutoDetectionOverrideReviewState.varianceBottom,
        true,
        `${viewport.label}: expected midnight charge review after extra charges variance approval review`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.text.toLowerCase().includes("midnight charge") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.text
            .toLowerCase()
            .includes("auto-detection / override qa"),
        true,
        `${viewport.label}: expected mock midnight charge auto-detection review`,
      );
      assert.deepEqual(
        mockMidnightChargeAutoDetectionOverrideReviewState.columns,
        [
          "Booking or pickup time",
          "Window boundary",
          "Auto-detection result",
          "Customer midnight charge",
          "Driver midnight payout",
          "Charge type",
          "Display group",
          "Internal distinction",
          "Manual override cue",
          "Mock status",
        ],
        `${viewport.label}: expected midnight charge detection columns`,
      );
      const midnightRowsByTime = Object.fromEntries(
        mockMidnightChargeAutoDetectionOverrideReviewState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        midnightRowsByTime["23:00"].includes("Detected") &&
          !midnightRowsByTime["23:00"].includes("Not detected") &&
          midnightRowsByTime["06:59"].includes("Detected") &&
          !midnightRowsByTime["06:59"].includes("Not detected") &&
          midnightRowsByTime["07:00"].includes("Not detected") &&
          midnightRowsByTime["22:59"].includes("Not detected"),
        true,
        `${viewport.label}: expected midnight charge boundary auto-detection examples`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.text.includes("$15") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.text.includes("$10") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.text.includes("Midnight Charge") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.text.includes("Extra Charges") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.text.includes(
            "Separate from waiting time and extra stops",
          ),
        true,
        `${viewport.label}: expected midnight charge amount, display group, and internal distinction`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.copy.includes(
          "Static/mock midnight charge auto-detection and manual override preview data only",
        ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.copy.includes("internal review") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.copy.includes("Nothing is billed"),
        true,
        `${viewport.label}: expected static no-persistence midnight charge copy`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.note.includes(
          "Midnight charge customer charge: $15",
        ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.note.includes(
            "Midnight charge driver payout: $10",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.note.includes(
            "booking time or pickup time is between 11:00pm and 6:59am",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.note.includes(
            "11:00pm and 6:59am are included",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.note.includes(
            "7:00am and 10:59pm are not included",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.note.includes(
            "remains internally distinct from waiting time, extra stops",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.note.includes("1 waiting block = 15 minutes"),
        true,
        `${viewport.label}: expected midnight charge and waiting-time locked rules`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.generation.includes(
          "No midnight-charge record generated",
        ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.generation.includes(
            "No customer charge record generated",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.generation.includes(
            "No driver payout record generated",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.generation.includes(
            "No override record generated",
          ) &&
          mockMidnightChargeAutoDetectionOverrideReviewState.generation.includes("No invoice number generated") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.generation.includes("No PDF generated") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.generation.includes("No payment link generated"),
        true,
        `${viewport.label}: expected no midnight/customer/driver override generation`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("Mock/local only.") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("midnight-charge persistence") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("manual override persistence") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("localStorage") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("sessionStorage") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("cookies") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("IndexedDB") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("API call") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("fetch") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("XHR") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("sendBeacon") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("WebSocket") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("Supabase") &&
          mockMidnightChargeAutoDetectionOverrideReviewState.boundary.includes("send behavior"),
        true,
        `${viewport.label}: expected midnight charge no persistence/storage/API boundary`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.actionControlCount,
        0,
        `${viewport.label}: expected midnight charge preview to have no action controls`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.controlCount,
        2,
        `${viewport.label}: expected only mock local select/input controls`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.modeValue,
        "auto",
        `${viewport.label}: expected midnight charge override mode to default to auto`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.reasonValue,
        "",
        `${viewport.label}: expected Override Reason to be blank by default`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.rows.length,
        4,
        `${viewport.label}: expected four midnight charge boundary rows`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.height <=
          (viewport.width < 640 ? 1900 : viewport.width < 1024 ? 1180 : viewport.width < 1200 ? 980 : 860),
        true,
        `${viewport.label}: expected compact midnight charge review, got ${mockMidnightChargeAutoDetectionOverrideReviewState.height}px`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.rows.every(
          (row) => row.height >= 28 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected midnight charge rows to stay readable`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewState.docScrollWidth <=
          mockMidnightChargeAutoDetectionOverrideReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected midnight charge review not to create horizontal overflow`,
      );

      const mockCombinedExtraChargesSummarySeparationReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const midnightReview = document.querySelector("[data-mock-midnight-charge-auto-detection-override-review]");
            const review = document.querySelector("[data-mock-combined-extra-charges-summary-separation-review]");
            if (!group || !dashboard || !midnightReview || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const midnightRect = midnightReview.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-combined-extra-charges-summary-separation-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-combined-extra-charges-summary-separation-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-combined-extra-charges-summary-separation-review-column]")].map(
                  (column) =>
                    column.getAttribute("data-mock-combined-extra-charges-summary-separation-review-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: review.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-combined-extra-charges-summary-separation-review-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: review.querySelectorAll("input, select, textarea").length,
              copy:
                document.querySelector("[data-mock-combined-extra-charges-summary-separation-review-copy]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-combined-extra-charges-summary-separation-review-generation]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              midnightBottom: Math.round(midnightRect.bottom),
              note:
                document.querySelector("[data-mock-combined-extra-charges-summary-separation-review-note]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              rule:
                document.querySelector("[data-mock-combined-extra-charges-summary-separation-review-rule]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock combined extra charges summary separation review`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.groupTop >=
          mockCombinedExtraChargesSummarySeparationReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected combined extra charges summary to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.sectionTop >=
          mockCombinedExtraChargesSummarySeparationReviewState.midnightBottom,
        true,
        `${viewport.label}: expected combined extra charges summary after midnight charge review`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.text
          .toLowerCase()
          .includes("combined extra charges") &&
          mockCombinedExtraChargesSummarySeparationReviewState.text
            .toLowerCase()
            .includes("summary / charge type separation qa"),
        true,
        `${viewport.label}: expected mock combined extra charges summary review`,
      );
      assert.deepEqual(
        mockCombinedExtraChargesSummarySeparationReviewState.columns,
        [
          "Charge type",
          "Display group",
          "Customer charge",
          "Driver payout",
          "Internal separation status",
          "Review status",
        ],
        `${viewport.label}: expected combined extra charges summary columns`,
      );
      const combinedRowsByType = Object.fromEntries(
        mockCombinedExtraChargesSummarySeparationReviewState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        combinedRowsByType["Waiting Time"].includes("Extra Charges") &&
          combinedRowsByType["Waiting Time"].includes("$15 customer per 15-minute block") &&
          combinedRowsByType["Waiting Time"].includes("$10 driver per 15-minute block") &&
          combinedRowsByType["Extra Stops"].includes("Extra Charges") &&
          combinedRowsByType["Extra Stops"].includes("Separate extra-stop source") &&
          combinedRowsByType["Midnight Charge"].includes("Extra Charges") &&
          combinedRowsByType["Midnight Charge"].includes("$15 customer midnight charge") &&
          combinedRowsByType["Midnight Charge"].includes("$10 driver midnight payout") &&
          combinedRowsByType["Midnight Charge"].includes("11:00pm to 6:59am"),
        true,
        `${viewport.label}: expected all extra charge types under Extra Charges with separate rows`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.note.includes(
          "Waiting Time, Extra Stops, and Midnight Charge may display together under Extra Charges",
        ) &&
          mockCombinedExtraChargesSummarySeparationReviewState.note.includes(
            "each charge type remains internally distinct",
          ) &&
          mockCombinedExtraChargesSummarySeparationReviewState.rule.includes(
            "1 waiting block = 15 minutes",
          ) &&
          mockCombinedExtraChargesSummarySeparationReviewState.rule.includes(
            "customer waiting charge $15 per waiting block",
          ) &&
          mockCombinedExtraChargesSummarySeparationReviewState.rule.includes(
            "driver waiting payout $10 per waiting block",
          ) &&
          mockCombinedExtraChargesSummarySeparationReviewState.rule.includes("11:00pm to 6:59am") &&
          mockCombinedExtraChargesSummarySeparationReviewState.rule.includes(
            "7:00am and 10:59pm are not included",
          ),
        true,
        `${viewport.label}: expected combined summary locked charge rules and separation note`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.generation.includes("Combined display only") &&
          mockCombinedExtraChargesSummarySeparationReviewState.generation.includes("No invoice generated") &&
          mockCombinedExtraChargesSummarySeparationReviewState.generation.includes("No payout created") &&
          mockCombinedExtraChargesSummarySeparationReviewState.generation.includes("No accounting posting") &&
          mockCombinedExtraChargesSummarySeparationReviewState.generation.includes("Not saved") &&
          mockCombinedExtraChargesSummarySeparationReviewState.generation.includes(
            "No real combined charge calculation",
          ),
        true,
        `${viewport.label}: expected no invoice/payout/accounting/save combined summary generation`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("Mock/local only.") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes(
            "No real combined charge calculation",
          ) &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("waiting-time persistence") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("extra-stop persistence") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("midnight-charge persistence") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("customer-charge persistence") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("driver-payout persistence") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("localStorage") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("sessionStorage") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("cookies") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("IndexedDB") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("API call") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("fetch") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("XHR") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("sendBeacon") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("WebSocket") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("Supabase") &&
          mockCombinedExtraChargesSummarySeparationReviewState.boundary.includes("send behavior"),
        true,
        `${viewport.label}: expected combined summary no persistence/storage/API boundary`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.actionControlCount,
        0,
        `${viewport.label}: expected combined summary to have no action controls`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.controlCount,
        0,
        `${viewport.label}: expected combined summary to have no form controls`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.rows.length,
        3,
        `${viewport.label}: expected three combined extra charge rows`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.height <=
          (viewport.width < 640 ? 1250 : viewport.width < 1024 ? 760 : viewport.width < 1200 ? 700 : 620),
        true,
        `${viewport.label}: expected compact combined extra charges summary, got ${mockCombinedExtraChargesSummarySeparationReviewState.height}px`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.rows.every(
          (row) => row.height >= 28 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected combined extra charges rows to stay readable`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewState.docScrollWidth <=
          mockCombinedExtraChargesSummarySeparationReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected combined extra charges summary not to create horizontal overflow`,
      );

      const mockExtraChargesApprovalDecisionSeparationReviewState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const combinedReview = document.querySelector("[data-mock-combined-extra-charges-summary-separation-review]");
            const review = document.querySelector("[data-mock-extra-charges-approval-decision-separation-review]");
            if (!group || !dashboard || !combinedReview || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const combinedRect = combinedReview.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-extra-charges-approval-decision-separation-review-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-extra-charges-approval-decision-separation-review-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-extra-charges-approval-decision-separation-review-column]")].map(
                  (column) =>
                    column.getAttribute("data-mock-extra-charges-approval-decision-separation-review-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: review.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-extra-charges-approval-decision-separation-review-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: review.querySelectorAll("input, select, textarea").length,
              copy:
                document.querySelector("[data-mock-extra-charges-approval-decision-separation-review-copy]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              combinedBottom: Math.round(combinedRect.bottom),
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-extra-charges-approval-decision-separation-review-generation]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              note:
                document.querySelector("[data-mock-extra-charges-approval-decision-separation-review-note]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              rows,
              rule:
                document.querySelector("[data-mock-extra-charges-approval-decision-separation-review-rule]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock extra charges approval decision separation review`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.groupTop >=
          mockExtraChargesApprovalDecisionSeparationReviewState.dashboardBottom,
        true,
        `${viewport.label}: expected extra charges approval decision review to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.sectionTop >=
          mockExtraChargesApprovalDecisionSeparationReviewState.combinedBottom,
        true,
        `${viewport.label}: expected extra charges approval decision review after combined extra charges summary`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.text
          .toLowerCase()
          .includes("extra charges approval decision") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.text
            .toLowerCase()
            .includes("billing & payout separation qa"),
        true,
        `${viewport.label}: expected mock extra charges approval decision review`,
      );
      assert.deepEqual(
        mockExtraChargesApprovalDecisionSeparationReviewState.columns,
        [
          "Charge type",
          "Display group",
          "Customer billing decision",
          "Driver payout decision",
          "Dispatcher review status",
          "Separation note",
        ],
        `${viewport.label}: expected extra charges approval decision columns`,
      );
      const approvalRowsByType = Object.fromEntries(
        mockExtraChargesApprovalDecisionSeparationReviewState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        approvalRowsByType["Waiting Time"].includes("Extra Charges") &&
          approvalRowsByType["Waiting Time"].includes("Customer billing approved in mock review") &&
          approvalRowsByType["Waiting Time"].includes("Driver payout approved in mock review") &&
          approvalRowsByType["Extra Stops"].includes("Extra Charges") &&
          approvalRowsByType["Extra Stops"].includes("Hold for dispatcher confirmation") &&
          approvalRowsByType["Extra Stops"].includes("no billing or payout created") &&
          approvalRowsByType["Midnight Charge"].includes("Extra Charges") &&
          approvalRowsByType["Midnight Charge"].includes("Customer billing waived in mock example") &&
          approvalRowsByType["Midnight Charge"].includes("Driver payout still reviewed separately"),
        true,
        `${viewport.label}: expected all approval decision rows under Extra Charges with separate billing and payout states`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.note.includes(
          "Waiting Time, Extra Stops, and Midnight Charge may display together under Extra Charges",
        ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.note.includes(
            "each charge type remains internally distinct",
          ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.note.includes(
            "Customer billing approval and driver payout approval are separate decisions",
          ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.rule.includes(
            "1 waiting block = 15 minutes",
          ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.rule.includes(
            "customer waiting charge $15 per waiting block",
          ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.rule.includes(
            "driver waiting payout $10 per waiting block",
          ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.rule.includes("11:00pm to 6:59am") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.rule.includes(
            "7:00am and 10:59pm are not included",
          ),
        true,
        `${viewport.label}: expected approval decision locked charge rules and separation note`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.generation.includes(
          "Waived customer charge does not automatically cancel driver payout review",
        ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.generation.includes("No invoice generated") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.generation.includes("No payout created") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.generation.includes("No accounting posting") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.generation.includes("Not saved") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.generation.includes(
            "No real approval workflow",
          ),
        true,
        `${viewport.label}: expected no invoice/payout/accounting/save approval decision generation`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("Mock/local only.") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("No real approval workflow") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes(
            "real combined charge calculation",
          ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("waiting-time persistence") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("extra-stop persistence") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("midnight-charge persistence") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes(
            "approval-decision persistence",
          ) &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("customer-charge persistence") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("driver-payout persistence") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("localStorage") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("sessionStorage") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("cookies") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("IndexedDB") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("API call") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("fetch") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("XHR") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("sendBeacon") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("WebSocket") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("Supabase") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("parser file changes") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("package script changes") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("test:safe membership changes") &&
          mockExtraChargesApprovalDecisionSeparationReviewState.boundary.includes("send behavior"),
        true,
        `${viewport.label}: expected approval decision no persistence/storage/API boundary`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.actionControlCount,
        0,
        `${viewport.label}: expected approval decision review to have no action controls`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.controlCount,
        0,
        `${viewport.label}: expected approval decision review to have no form controls`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.rows.length,
        3,
        `${viewport.label}: expected three approval decision rows`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.height <=
          (viewport.width < 640 ? 1250 : viewport.width < 1024 ? 760 : viewport.width < 1200 ? 700 : 620),
        true,
        `${viewport.label}: expected compact extra charges approval decision review, got ${mockExtraChargesApprovalDecisionSeparationReviewState.height}px`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.rows.every(
          (row) => row.height >= 28 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected approval decision rows to stay readable`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewState.docScrollWidth <=
          mockExtraChargesApprovalDecisionSeparationReviewState.docClientWidth + 2,
        true,
        `${viewport.label}: expected extra charges approval decision review not to create horizontal overflow`,
      );

      for (const tabLabel of appTabs) {
        await clickTab(tabLabel);
        const state = await layoutState();
        assertNoHorizontalOverflow(state, `${viewport.label} main app ${tabLabel}`);
        assert.equal(
          state.visibleText.includes(tabExpectedText[tabLabel]),
          true,
          `${viewport.label} ${tabLabel}: expected important section text to remain visible`,
        );

        if (tabLabel === "Dispatch") {
          await checkDispatcherIntakeControls(viewport);
        }
      }
    };

    const checkDriverRouteViewport = async (viewport, url, expectedText, labels, context) => {
      await setViewport(viewport);
      await navigate(url, expectedText);
      const state = await layoutState();
      const buttons = await buttonState();
      const adminHubVisible = await evaluate(`Boolean(document.querySelector("[data-admin-access-hub]"))`);
      const driverAssignmentReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-driver-assignment-readiness]"))`,
      );
      const driverDetailCollectionReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-driver-detail-collection-readiness]"))`,
      );
      const driverDetailsCustomerUpdateReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-driver-details-customer-update-readiness]"))`,
      );
      const customerUpdateDeliveryReviewReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-customer-update-delivery-review-readiness]"))`,
      );
      const deliveryReviewDispatcherApprovalReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-delivery-review-dispatcher-approval-readiness]"))`,
      );
      const dispatcherApprovalNotificationQueueReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-dispatcher-approval-notification-queue-readiness]"))`,
      );
      const futureNotificationQueueCustomerUpdateAuditReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-future-notification-queue-customer-update-audit-readiness]"))`,
      );
      const mockDriverDetailCustomerUpdatePreviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-driver-detail-customer-update-preview]"))`,
      );
      const mockDspUsageAccountingPreviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-dsp-usage-accounting-preview]"))`,
      );
      const mockDspMonthlyRollupReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-dsp-monthly-rollup-review]"))`,
      );
      const mockDspReconciliationExceptionsReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-dsp-reconciliation-exceptions-review]"))`,
      );
      const mockDspApprovalPacketReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-dsp-approval-packet-review]"))`,
      );
      const mockAccountingStatementPreviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-accounting-statement-preview]"))`,
      );
      const mockStatementVarianceReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-statement-variance-review]"))`,
      );
      const mockReceivablesHandoffReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-receivables-handoff-review]"))`,
      );
      const mockReceivablesAgingFollowUpReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-receivables-aging-follow-up-review]"))`,
      );
      const mockCollectionsCreditWriteoffReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-collections-credit-writeoff-review]"))`,
      );
      const mockPaymentAllocationRemittanceReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-payment-allocation-remittance-review]"))`,
      );
      const mockMonthEndArCloseReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-month-end-ar-close-review]"))`,
      );
      const mockAccountingHandoffGlAuditReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-accounting-handoff-gl-audit-review]"))`,
      );
      const mockAuditEvidenceFinanceArchiveReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-audit-evidence-finance-archive-review]"))`,
      );
      const mockPostCloseAuditRetentionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-post-close-audit-retention-review]"))`,
      );
      const mockCloseCycleEvidenceResponseRetentionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-close-cycle-evidence-response-retention-review]"))`,
      );
      const mockCloseCycleExceptionResolutionAuditHandoffReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-close-cycle-exception-resolution-audit-handoff-review]"))`,
      );
      const mockWaitingTimeExtraChargesPlanningReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-waiting-time-extra-charges-planning-review]"))`,
      );
      const mockExtraChargesVarianceApprovalReconciliationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-extra-charges-variance-approval-reconciliation-review]"))`,
      );
      const mockMidnightChargeAutoDetectionOverrideReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-midnight-charge-auto-detection-override-review]"))`,
      );
      const mockCombinedExtraChargesSummarySeparationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-combined-extra-charges-summary-separation-review]"))`,
      );
      const mockExtraChargesApprovalDecisionSeparationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-extra-charges-approval-decision-separation-review]"))`,
      );
      const mockExtraChargesVarianceApprovalReconciliationTextLeaks = await evaluate(
        `(() => {
          const text = (document.body.innerText || "").toLowerCase();

          return [
            "extra charges variance / approval qa",
            "extra charges variance review",
            "static/mock extra-charge variance",
            "dispatcher approval handoff",
            "driver payout reconciliation",
            "waiting-time variance status",
            "customer charge review status",
            "driver payout reconciliation status",
            "not approved / not billed / not paid / not saved",
            "no dispatcher approval record generated",
            "no driver payout reconciliation record generated",
            "midnight charge auto-detection / override qa",
            "midnight charge auto-detection review",
            "static/mock midnight charge auto-detection",
            "midnight charge customer charge: $15",
            "midnight charge driver payout: $10",
            "manual override mock only",
            "override reason mock only",
            "no midnight-charge record generated",
            "manual override persistence",
            "combined extra charges",
            "summary / charge type separation qa",
            "static/mock combined extra charges summary",
            "charge-type separation qa",
            "waiting time, extra stops, and midnight charge may display together",
            "each charge type remains internally distinct",
            "no real combined charge calculation",
            "no invoice generated",
            "no payout created",
            "no accounting posting",
            "extra-stop record",
            "charge grouping persistence",
            "extra charges approval decision",
            "billing & payout separation qa",
            "static/mock extra charges approval decision",
            "customer billing decision",
            "driver payout decision",
            "customer billing approval and driver payout approval are separate decisions",
            "waived customer charge does not automatically cancel driver payout review",
            "approval-decision persistence",
            "approval-decision record",
          ].filter((value) => text.includes(value));
        })()`,
      );
      const driverDemoDetailWorkflowState = await evaluate(`(() => {
        const workflow = document.querySelector("[data-driver-demo-detail-workflow]");
        const preview = document.querySelector("[data-driver-demo-detail-workflow-preview]");
        const workflowRect = workflow?.getBoundingClientRect();
        const reviewButton = document.querySelector("[data-driver-demo-detail-workflow-review]");
        const reviewRect = reviewButton?.getBoundingClientRect();

        return {
          previewVisible: Boolean(preview),
          reviewButtonHeight: Math.round(reviewRect?.height || 0),
          reviewButtonVisible: Boolean(reviewRect && reviewRect.width >= 64 && reviewRect.height >= 44),
          text: workflow?.innerText || "",
          visible: Boolean(workflowRect && workflowRect.width > 0 && workflowRect.height > 0),
        };
      })()`);
      const driverDemoDspUsageWorkflowState = await evaluate(`(() => {
        const workflow = document.querySelector("[data-driver-demo-dsp-usage-workflow]");
        const preview = document.querySelector("[data-driver-demo-dsp-preview]");
        const workflowRect = workflow?.getBoundingClientRect();
        const reviewButton = document.querySelector("[data-driver-demo-dsp-review]");
        const reviewRect = reviewButton?.getBoundingClientRect();

        return {
          previewVisible: Boolean(preview),
          reviewButtonHeight: Math.round(reviewRect?.height || 0),
          reviewButtonVisible: Boolean(reviewRect && reviewRect.width >= 64 && reviewRect.height >= 44),
          text: workflow?.innerText || "",
          visible: Boolean(workflowRect && workflowRect.width > 0 && workflowRect.height > 0),
        };
      })()`);

      assertNoHorizontalOverflow(state, `${viewport.label} ${context}`);
      assertButtonTouchTargets(buttons, labels, `${viewport.label} ${context}`);
      assert.equal(adminHubVisible, false, `${viewport.label} ${context}: expected no admin access hub`);
      assert.equal(
        driverAssignmentReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no driver assignment readiness`,
      );
      assert.equal(
        driverDetailCollectionReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no driver detail collection readiness`,
      );
      assert.equal(
        driverDetailsCustomerUpdateReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no driver details customer update readiness`,
      );
      assert.equal(
        customerUpdateDeliveryReviewReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no customer update delivery review readiness`,
      );
      assert.equal(
        deliveryReviewDispatcherApprovalReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no delivery review dispatcher approval readiness`,
      );
      assert.equal(
        dispatcherApprovalNotificationQueueReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no dispatcher approval notification queue readiness`,
      );
      assert.equal(
        futureNotificationQueueCustomerUpdateAuditReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no future notification queue customer update audit readiness`,
      );
      assert.equal(
        mockDriverDetailCustomerUpdatePreviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock driver detail customer update preview`,
      );
      assert.equal(
        mockDspUsageAccountingPreviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock DSP usage accounting preview`,
      );
      assert.equal(
        mockDspMonthlyRollupReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock DSP monthly rollup review`,
      );
      assert.equal(
        mockDspReconciliationExceptionsReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock DSP reconciliation exceptions review`,
      );
      assert.equal(
        mockDspApprovalPacketReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock DSP approval packet review`,
      );
      assert.equal(
        mockAccountingStatementPreviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock accounting statement preview`,
      );
      assert.equal(
        mockStatementVarianceReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock statement variance review`,
      );
      assert.equal(
        mockReceivablesHandoffReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock receivables handoff review`,
      );
      assert.equal(
        mockReceivablesAgingFollowUpReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock receivables aging follow-up review`,
      );
      assert.equal(
        mockCollectionsCreditWriteoffReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock collections credit write-off review`,
      );
      assert.equal(
        mockPaymentAllocationRemittanceReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock payment allocation remittance review`,
      );
      assert.equal(
        mockMonthEndArCloseReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock month-end AR close review`,
      );
      assert.equal(
        mockAccountingHandoffGlAuditReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock accounting handoff GL audit review`,
      );
      assert.equal(
        mockAuditEvidenceFinanceArchiveReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock audit evidence finance archive review`,
      );
      assert.equal(
        mockPostCloseAuditRetentionReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock post-close audit retention review`,
      );
      assert.equal(
        mockCloseCycleEvidenceResponseRetentionReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock close-cycle evidence response retention review`,
      );
      assert.equal(
        mockCloseCycleExceptionResolutionAuditHandoffReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock close-cycle exception resolution audit handoff review`,
      );
      assert.equal(
        mockWaitingTimeExtraChargesPlanningReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock waiting-time extra-charges planning review`,
      );
      assert.equal(
        mockExtraChargesVarianceApprovalReconciliationReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock extra charges variance approval reconciliation review`,
      );
      assert.equal(
        mockMidnightChargeAutoDetectionOverrideReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock midnight charge auto-detection override review`,
      );
      assert.equal(
        mockCombinedExtraChargesSummarySeparationReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock combined extra charges summary separation review`,
      );
      assert.equal(
        mockExtraChargesApprovalDecisionSeparationReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock extra charges approval decision separation review`,
      );
      assert.deepEqual(
        mockExtraChargesVarianceApprovalReconciliationTextLeaks,
        [],
        `${viewport.label} ${context}: expected no internal extra charges or midnight charge QA text leak`,
      );
      if (context === "driver job demo") {
        assert.equal(
          driverDemoDetailWorkflowState.visible,
          true,
          `${viewport.label} ${context}: expected mock driver detail workflow`,
        );
        assert.equal(
          driverDemoDetailWorkflowState.reviewButtonVisible,
          true,
          `${viewport.label} ${context}: expected review button to stay touch-friendly`,
        );
        assert.equal(
          driverDemoDetailWorkflowState.previewVisible,
          false,
          `${viewport.label} ${context}: expected no preview before valid mock details`,
        );
        assert.equal(
          driverDemoDetailWorkflowState.text.toLowerCase().includes("mock driver detail workflow"),
          true,
          `${viewport.label} ${context}: expected mock driver detail workflow text`,
        );
        assert.equal(
          driverDemoDspUsageWorkflowState.visible,
          true,
          `${viewport.label} ${context}: expected mock DSP usage workflow`,
        );
        assert.equal(
          driverDemoDspUsageWorkflowState.reviewButtonVisible,
          true,
          `${viewport.label} ${context}: expected DSP usage review button to stay touch-friendly`,
        );
        assert.equal(
          driverDemoDspUsageWorkflowState.previewVisible,
          false,
          `${viewport.label} ${context}: expected no DSP usage preview before valid mock usage`,
        );
        assert.equal(
          driverDemoDspUsageWorkflowState.text.toLowerCase().includes("dsp job completion usage"),
          true,
          `${viewport.label} ${context}: expected mock DSP usage workflow text`,
        );
      } else {
        assert.equal(
          driverDemoDetailWorkflowState.visible,
          false,
          `${viewport.label} ${context}: expected no driver demo detail workflow`,
        );
        assert.equal(
          driverDemoDspUsageWorkflowState.visible,
          false,
          `${viewport.label} ${context}: expected no driver demo DSP usage workflow`,
        );
      }
      return state;
    };

    const checkLoadedCopySectionsAtSmallPhone = async () => {
      const viewport = viewports[0];
      await setViewport(viewport);
      await navigate(appUrl, "Prestige Limo Ops Dispatch");
      await clickTab("Bookings");
      await clickButtonByText("Load Bookings");
      await waitForBodyText(evaluate, "MOBILE USABILITY TRAVELER", "mock loaded booking");
      const recentAssignedDriverState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const recentArticle = [...document.querySelectorAll("article")].find((article) =>
              article.innerText.includes("MOBILE USABILITY TRAVELER")
            );
            const summary = recentArticle?.querySelector("[data-assigned-driver-summary]");

            return summary
              ? {
                  text: summary.innerText,
                  articleText: recentArticle.innerText,
                }
              : false;
          })()`),
        10000,
        "loaded booking assigned-driver summary",
      );
      for (const expectedText of [
        "Assigned Driver",
        "Driver: MOBILE USABILITY DRIVER",
        "Driver contact: +65 8111 9999",
        "Vehicle: AVF",
        "Car plate: SMM320P",
      ]) {
        assert.equal(
          recentAssignedDriverState.text.includes(expectedText),
          true,
          `${viewport.label}: expected Recent Bookings assigned-driver summary to include ${expectedText}`,
        );
      }
      const recentDispatcherStatusState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const recentArticle = [...document.querySelectorAll("article")].find((article) =>
              article.innerText.includes("MOBILE USABILITY TRAVELER")
            );
            const summary = recentArticle?.querySelector("[data-dispatcher-status-summary]");

            return summary
              ? {
                  text: summary.innerText,
                  articleText: recentArticle.innerText,
                }
              : false;
          })()`),
        10000,
        "loaded booking dispatcher-status summary",
      );
      for (const expectedText of ["Dispatcher Status", "Status: Assigned"]) {
        assert.equal(
          recentDispatcherStatusState.text.includes(expectedText),
          true,
          `${viewport.label}: expected Recent Bookings dispatcher-status summary to include ${expectedText}`,
        );
      }
      const recentOperationalCardState = await evaluate(`(() => {
        const recentArticle = [...document.querySelectorAll("article")].find((article) =>
          article.innerText.includes("MOBILE USABILITY TRAVELER")
        );
        const sections = [...(recentArticle?.querySelectorAll("[data-operational-card-section]") || [])].map(
          (section) => ({
            key: section.getAttribute("data-operational-card-section"),
            text: section.innerText,
          })
        );
        const summaryGridText =
          recentArticle?.querySelector("[data-operational-card-summary-grid]")?.innerText || "";
        return {
          sections,
          summaryGridText,
        };
      })()`);
      assert.deepEqual(
        recentOperationalCardState.sections.map((section) => section.key),
        ["booking", "route", "vehicle-pax-price"],
        `${viewport.label}: expected Recent Bookings card to group booking, route, and vehicle/pax/price sections`,
      );
      for (const expectedText of ["BOOKING", "ROUTE", "VEHICLE / PAX / PRICE"]) {
        assert.equal(
          recentOperationalCardState.sections.some((section) => section.text.includes(expectedText)),
          true,
          `${viewport.label}: expected Recent Bookings operational card section ${expectedText}`,
        );
      }
      for (const expectedText of [
        "Dispatcher Status",
        "Assigned Driver",
        "Operational Readiness",
        "OTS Proof: Pending OTS step",
        "Exception / Replacement: No replacement recorded",
      ]) {
        assert.equal(
          recentOperationalCardState.summaryGridText.includes(expectedText),
          true,
          `${viewport.label}: expected Recent Bookings summary grid to include ${expectedText}`,
        );
      }
      await clickTab("Dashboard");
      await waitForBodyText(evaluate, "MOBILE USABILITY TRAVELER", "dashboard loaded booking");
      const dashboardOperationalCardState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const dashboardCard = [...document.querySelectorAll("[data-dashboard-operational-card]")].find((card) =>
              card.innerText.includes("MOBILE USABILITY TRAVELER")
            );
            if (!dashboardCard) {
              return false;
            }
            const sections = [...dashboardCard.querySelectorAll("[data-operational-card-section]")].map(
              (section) => ({
                key: section.getAttribute("data-operational-card-section"),
                text: section.innerText,
              })
            );
            const summaryGridText =
              dashboardCard.querySelector("[data-operational-card-summary-grid]")?.innerText || "";
            const actionsText = dashboardCard.querySelector("[data-dashboard-action-group]")?.innerText || "";
            return {
              actionsText,
              sections,
              summaryGridText,
            };
          })()`),
        10000,
        "dashboard operational card structure",
      );
      assert.deepEqual(
        dashboardOperationalCardState.sections.map((section) => section.key),
        ["booking", "route", "vehicle-pax-price"],
        `${viewport.label}: expected dashboard card to group booking, route, and vehicle/pax/price sections`,
      );
      for (const expectedText of [
        "Dispatcher Status",
        "Assigned Driver",
        "Operational Readiness",
        "OTS Proof: Pending OTS step",
        "Exception / Replacement: No replacement recorded",
      ]) {
        assert.equal(
          dashboardOperationalCardState.summaryGridText.includes(expectedText),
          true,
          `${viewport.label}: expected dashboard summary grid to include ${expectedText}`,
        );
      }
      assert.equal(
        dashboardOperationalCardState.actionsText.includes("INTERNAL ACTIONS"),
        true,
        `${viewport.label}: expected dashboard card to label internal actions`,
      );
      assertNoHorizontalOverflow(await layoutState(), `${viewport.label} dashboard operational card`);
      await clickTab("Bookings");
      await waitForBodyText(evaluate, "MOBILE USABILITY TRAVELER", "mock loaded booking after dashboard check");
      await clickButtonByText("Load this booking");
      await waitForCondition(
        () =>
          evaluate(`document.body.innerText.includes("Driver Job Link") &&
            document.body.innerText.includes("MOBILE USABILITY TRAVELER")`),
        10000,
        "loaded booking dispatch copy sections",
      );

      const loadedState = await layoutState();
      assertNoHorizontalOverflow(loadedState, `${viewport.label} loaded Dispatch copy sections`);

      const previewState = await evaluate(`(() => {
        const previews = [...document.querySelectorAll("[data-copy-preview]")].map((preview) => ({
          clientWidth: preview.clientWidth,
          key: preview.getAttribute("data-copy-preview"),
          scrollWidth: preview.scrollWidth,
          text: preview.innerText.slice(0, 100),
        }));

        return {
          keys: previews.map((preview) => preview.key),
          overflowingPreviews: previews.filter((preview) => preview.scrollWidth > preview.clientWidth + 2),
          text: document.body.innerText,
        };
      })()`);

      assert.deepEqual(
        ["jobCard", "customerCopy", "driverDispatch", "driverJobLink"].filter(
          (key) => !previewState.keys.includes(key),
        ),
        [],
        `${viewport.label}: expected all protected copy previews, including Driver Job Link`,
      );
      assert.deepEqual(
        previewState.overflowingPreviews,
        [],
        `${viewport.label}: expected copy previews to wrap without horizontal overflow`,
      );
      assert.equal(
        previewState.text.includes("/driver-job/mock-driver-job-valid-a"),
        true,
        `${viewport.label}: expected Driver Job Link preview to use mock public driver job route`,
      );

      for (const editTarget of ["jobCard", "customerCopy", "driverDispatch"]) {
        const editClicked = await evaluate(`(() => {
          const button = document.querySelector(${JSON.stringify(`[data-copy-edit-button="${editTarget}"]`)});

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(editClicked, true, `${viewport.label}: expected ${editTarget} edit button`);

        await waitForSelector(
          evaluate,
          `[data-copy-edit-textarea="${editTarget}"]`,
          `${editTarget} edit textarea`,
        );

        const textareaState = await evaluate(`(() => {
          const textarea = document.querySelector(${JSON.stringify(`[data-copy-edit-textarea="${editTarget}"]`)});
          const rect = textarea?.getBoundingClientRect();

          return {
            clientWidth: textarea?.clientWidth || 0,
            height: Math.round(rect?.height || 0),
            scrollWidth: textarea?.scrollWidth || 0,
            width: Math.round(rect?.width || 0),
          };
        })()`);
        assert.equal(
          textareaState.scrollWidth <= textareaState.clientWidth + 2,
          true,
          `${viewport.label}: expected ${editTarget} edit textarea not to overflow horizontally`,
        );
        assert.equal(
          textareaState.height >= 160 && textareaState.width >= 250,
          true,
          `${viewport.label}: expected ${editTarget} edit textarea to stay readable, got ${
            textareaState.width
          }x${textareaState.height}`,
        );

        const cancelClicked = await evaluate(`(() => {
          const button = document.querySelector(${JSON.stringify(`[data-copy-cancel-edit="${editTarget}"]`)});

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(cancelClicked, true, `${viewport.label}: expected ${editTarget} cancel button`);
      }

      const networkState = await evaluate(`(() => ({
        mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
      }))()`);
      assert.deepEqual(
        networkState.mutationCalls,
        [],
        "Mobile usability test must not make Supabase mutations while loading copy sections.",
      );
    };

    const checkCustomerBillingDetailPanelAtSmallPhone = async () => {
      const viewport = viewports[1];
      const customerDashboardUrl = new URL("/customers", appUrl).toString();
      await setViewport(viewport);
      await navigate(customerDashboardUrl, "Regular Customer Monthly Billing List Preview");
      await waitForSelector(
        evaluate,
        "[data-regular-customer-booking-submit]",
        `${viewport.label} regular customer mock submit`,
      );
      await evaluate(`new Promise((resolve) => setTimeout(resolve, 250))`);

      const setRegularCustomerField = async (field, value) => {
        const actualValue = await evaluate(`(() => {
          const input = document.querySelector(${JSON.stringify(`[data-regular-booking-field="${field}"]`)});

          if (!input) {
            return null;
          }

          const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
          descriptor?.set?.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          return input.value;
        })()`);
        assert.equal(actualValue, value, `${viewport.label}: expected regular customer ${field} field`);
      };

      const regularCustomerFields = {
        booker: "Mobile Billing Booker",
        customerId: "ubs",
        dropoffLocation: "Raffles Place",
        passengerName: "Mobile Billing Passenger",
        pickupDate: "2026-05-28",
        pickupLocation: "Changi Airport T3",
        pickupTime: "1530hrs",
        routeType: "Airport Arrival",
        vehicleType: "AVF",
      };

      for (const [field, value] of Object.entries(regularCustomerFields)) {
        await setRegularCustomerField(field, value);
      }
      await evaluate(`new Promise((resolve) => setTimeout(resolve, 250))`);

      const submitted = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-booking-submit]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(submitted, true, `${viewport.label}: expected regular customer mock submit`);
      await waitForSelector(
        evaluate,
        "[data-regular-customer-billing-detail-action]",
        `${viewport.label} billing detail action`,
      );
      await waitForBodyText(
        evaluate,
        "Monthly Billing Summary — Mock Only",
        `${viewport.label} monthly billing summary`,
      );
      await waitForBodyText(
        evaluate,
        "Billing Quick Filter — Mock Only",
        `${viewport.label} billing quick filter`,
      );

      const summaryLayoutState = await layoutState();
      assertNoHorizontalOverflow(summaryLayoutState, `${viewport.label} /customers monthly billing summary`);

      const quickFilterState = await evaluate(`(() => {
        const section = document.querySelector("[data-regular-customer-billing-quick-filter-section]");
        const select = document.querySelector("[data-regular-customer-billing-quick-filter]");
        const rect = select?.getBoundingClientRect();

        return {
          height: Math.round(rect?.height || 0),
          mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
          options: [...(select?.querySelectorAll("option") || [])].map((option) => ({
            label: option.textContent.trim(),
            value: option.value,
          })),
          rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
          text: section?.innerText || "",
          value: select?.value || "",
          visible: Boolean(rect && rect.width > 0 && rect.height >= 44),
          width: Math.round(rect?.width || 0),
        };
      })()`);
      assert.equal(quickFilterState.visible, true, `${viewport.label}: expected billing quick filter touch target`);
      assert.equal(quickFilterState.width >= 64, true, `${viewport.label}: expected billing quick filter width`);
      assert.equal(quickFilterState.height >= 44, true, `${viewport.label}: expected billing quick filter height`);
      assert.equal(quickFilterState.rowCount, 1, `${viewport.label}: expected one local billing row before quick filter check`);
      assert.deepEqual(
        quickFilterState.options,
        [
          { label: "All mock rows", value: "all" },
          { label: "No matching mock rows", value: "mock-no-match" },
          { label: "Month: 2026-05", value: "month:2026-05" },
          { label: "Status: unbilled / draft", value: "status:unbilled / draft" },
        ],
        `${viewport.label}: expected billing quick filter options from local mock rows`,
      );
      for (const expectedText of [
        "Billing Quick Filter — Mock Only",
        "Showing 1 of 1 local mock row with All mock rows",
        "Filter changes only visible mock rows and counts",
        "no row data is added, removed, saved, or permanently changed",
        "no invoice, payment request, or statement was generated",
        "no storage or Supabase write occurs",
        "no payment, PDF, notification, or network API is called",
      ]) {
        assert.equal(
          quickFilterState.text.includes(expectedText),
          true,
          `${viewport.label}: expected billing quick filter text ${expectedText}`,
        );
      }
      assert.deepEqual(
        quickFilterState.mutationCalls,
        [],
        `${viewport.label}: expected billing quick filter not to make Supabase mutations`,
      );

      const changedQuickFilterState = await evaluate(`(() => {
        const select = document.querySelector("[data-regular-customer-billing-quick-filter]");
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
        descriptor?.set?.call(select, "month:2026-05");
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));

        return {
          mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
          rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
          text:
            document.querySelector("[data-regular-customer-billing-quick-filter-feedback]")?.textContent.trim() ||
            "",
          value: select?.value || "",
        };
      })()`);
      assert.equal(
        changedQuickFilterState.value,
        "month:2026-05",
        `${viewport.label}: expected billing quick filter to accept local month`,
      );
      assert.equal(
        changedQuickFilterState.rowCount,
        1,
        `${viewport.label}: expected billing quick filter not to add or remove the matching row`,
      );
      assert.equal(
        changedQuickFilterState.text.includes("Showing 1 of 1 local mock row with Month: 2026-05"),
        true,
        `${viewport.label}: expected billing quick filter month feedback`,
      );
      assert.deepEqual(
        changedQuickFilterState.mutationCalls,
        [],
        `${viewport.label}: expected billing quick filter change not to make Supabase mutations`,
      );

      const summaryState = await evaluate(`(() => {
        const summary = document.querySelector("[data-regular-customer-monthly-billing-summary]");

        return {
          mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
          rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
          text: summary?.textContent || "",
          visible: Boolean(summary),
        };
      })()`);
      assert.equal(summaryState.visible, true, `${viewport.label}: expected monthly billing summary`);
      assert.equal(summaryState.rowCount, 1, `${viewport.label}: expected one local billing row before summary check`);
      for (const expectedText of [
        "Monthly Billing Summary — Mock Only",
        "1 visible of 1 local mock row",
        "2026-05 (1)",
        "unbilled / draft (1)",
        "Not calculated from mock rows",
        "Mock summary only — no invoice, payment request, or statement was generated.",
        "write browser storage",
        "write Supabase",
      ]) {
        assert.equal(
          summaryState.text.includes(expectedText),
          true,
          `${viewport.label}: expected monthly billing summary text ${expectedText}`,
        );
      }
      assert.deepEqual(
        summaryState.mutationCalls,
        [],
        `${viewport.label}: expected monthly billing summary not to make Supabase mutations`,
      );

      const visibleSummaryState = await evaluate(`(() => {
        const summary = document.querySelector("[data-regular-customer-billing-visible-summary]");
        const rect = summary?.getBoundingClientRect();

        return {
          height: Math.round(rect?.height || 0),
          mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
          rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
          text: summary?.textContent || "",
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
          width: Math.round(rect?.width || 0),
        };
      })()`);
      assert.equal(visibleSummaryState.visible, true, `${viewport.label}: expected mock visible billing summary`);
      assert.equal(
        visibleSummaryState.rowCount,
        1,
        `${viewport.label}: expected one local billing row before visible summary check`,
      );
      assert.equal(
        visibleSummaryState.width > 0 && visibleSummaryState.height > 0,
        true,
        `${viewport.label}: expected visible summary to keep stable mobile dimensions`,
      );
      for (const expectedText of [
        "Mock visible billing summary",
        "1 visible of 1 local mock row",
        "Month: 2026-05",
        "2026-05 (1)",
        "unbilled / draft (1)",
        "Mock/local only",
        "write browser storage",
        "write Supabase",
        "trigger messaging or notification behavior",
      ]) {
        assert.equal(
          visibleSummaryState.text.includes(expectedText),
          true,
          `${viewport.label}: expected mock visible billing summary text ${expectedText}`,
        );
      }
      assert.deepEqual(
        visibleSummaryState.mutationCalls,
        [],
        `${viewport.label}: expected mock visible billing summary not to make Supabase mutations`,
      );
      const visibleSummaryLayoutState = await layoutState();
      assertNoHorizontalOverflow(
        visibleSummaryLayoutState,
        `${viewport.label} /customers mock visible billing summary`,
      );

      const opened = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-billing-detail-action]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(opened, true, `${viewport.label}: expected billing detail action`);
      await waitForBodyText(
        evaluate,
        "Billing Details Preview — Mock Only",
        `${viewport.label} billing detail preview`,
      );

      const openLayoutState = await layoutState();
      assertNoHorizontalOverflow(openLayoutState, `${viewport.label} /customers billing detail preview`);

      const panelState = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-billing-detail-action]");
        const dismiss = document.querySelector("[data-regular-customer-billing-detail-dismiss]");
        const panel = document.querySelector("[data-regular-customer-billing-detail-preview]");
        const buttonRect = button?.getBoundingClientRect();
        const dismissRect = dismiss?.getBoundingClientRect();

        return {
          buttonHeight: Math.round(buttonRect?.height || 0),
          buttonText: button?.textContent.trim() || "",
          buttonWidth: Math.round(buttonRect?.width || 0),
          dismissHeight: Math.round(dismissRect?.height || 0),
          dismissText: dismiss?.textContent.trim() || "",
          dismissWidth: Math.round(dismissRect?.width || 0),
          mutationCalls: (window.__mobileUsabilityFetchCalls || []).filter((call) => !call.startsWith("GET ")),
          panelText: panel?.innerText || "",
          panelVisible: Boolean(panel),
          rowCount: document.querySelectorAll("[data-regular-customer-booking-list-row]").length,
        };
      })()`);

      assert.equal(panelState.panelVisible, true, `${viewport.label}: expected billing detail panel`);
      assert.equal(
        panelState.buttonText,
        "View Billing Details — Mock Only",
        `${viewport.label}: expected billing detail action label`,
      );
      assert.equal(
        panelState.dismissText,
        "Close Billing Details — Mock Only",
        `${viewport.label}: expected billing detail close label`,
      );
      assert.equal(panelState.buttonHeight >= 44, true, `${viewport.label}: expected billing detail button height`);
      assert.equal(panelState.dismissHeight >= 44, true, `${viewport.label}: expected billing detail dismiss height`);
      assert.equal(panelState.buttonWidth >= 64, true, `${viewport.label}: expected billing detail button width`);
      assert.equal(panelState.dismissWidth >= 64, true, `${viewport.label}: expected billing detail dismiss width`);
      assert.equal(panelState.rowCount, 1, `${viewport.label}: expected one local billing row`);
      for (const expectedText of [
        "Mobile Billing Passenger",
        "Billing Details Preview — Mock Only",
        "This is not an invoice and no payment was requested.",
        "write browser storage",
        "write Supabase",
      ]) {
        assert.equal(
          panelState.panelText.includes(expectedText),
          true,
          `${viewport.label}: expected billing detail panel text ${expectedText}`,
        );
      }
      assert.deepEqual(
        panelState.mutationCalls,
        [],
        `${viewport.label}: expected billing detail panel not to make Supabase mutations`,
      );

      const dismissed = await evaluate(`(() => {
        const button = document.querySelector("[data-regular-customer-billing-detail-dismiss]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(dismissed, true, `${viewport.label}: expected billing detail dismiss`);
      await waitForCondition(
        () => evaluate(`!document.querySelector("[data-regular-customer-billing-detail-preview]")`),
        10000,
        `${viewport.label} billing detail preview dismissed`,
      );

      const dismissedLayoutState = await layoutState();
      assertNoHorizontalOverflow(dismissedLayoutState, `${viewport.label} /customers billing detail dismissed`);
    };

    for (const viewport of viewports) {
      await checkMainAppViewport(viewport);
      for (const route of responsiveRoutes) {
        await checkResponsiveRouteViewport(viewport, route);
        if (route.path === "/customers") {
          await checkCustomerBillingQuickFilterEmptyAtViewport(viewport);
        }
      }
      await checkDriverRouteViewport(viewport, driverDemoUrl, "Prestige Limo Driver Job", [
        "Acknowledge Job",
        "Activate Mock Live Location",
        "Review Mock DSP Usage",
        "Review Mock Details",
        "Save",
        "OTW",
        "OTS",
        "POB",
        "Job Completed",
      ], "driver job demo");
      await checkDriverRouteViewport(viewport, publicDriverJobUrl, "Mock Pickup A", [
        "Acknowledge Job",
        "Activate Mock Live Location",
        "Save",
        "OTW",
        "OTS",
        "POB",
        "Job Completed",
      ], "public driver job page");
    }

    await checkLoadedCopySectionsAtSmallPhone();
    await checkCustomerBillingDetailPanelAtSmallPhone();

    const runtimeState = await evaluate(`(() => ({
      consoleErrors: window.__prestigeConsoleErrors || [],
      errors: window.__prestigeErrors || [],
    }))()`);
    const errors = [...browserErrors, ...(runtimeState.errors || [])];
    const consoleErrors = [...browserConsoleErrors, ...(runtimeState.consoleErrors || [])];

    assert.deepEqual(errors, [], `Expected no runtime errors:\n${errors.join("\n")}`);
    assert.deepEqual(consoleErrors, [], `Expected no browser console errors:\n${consoleErrors.join("\n")}`);
    console.log("Mobile usability browser tests passed.");
  } catch (error) {
    let pageSnapshot = "";

    if (client) {
      try {
        const snapshot = await client.send("Runtime.evaluate", {
          expression: `({
            href: location.href,
            readyState: document.readyState,
            bodyText: document.body?.innerText?.slice(0, 1000) || "",
            bodyScrollWidth: document.body?.scrollWidth || 0,
            docClientWidth: document.documentElement?.clientWidth || 0,
            docScrollWidth: document.documentElement?.scrollWidth || 0,
          })`,
          returnByValue: true,
        });
        pageSnapshot = `\n${JSON.stringify(snapshot.result?.value ?? {}, null, 2)}`;
      } catch {
        pageSnapshot = "";
      }
    }

    const message = stderr
      ? `${normalizeErrorMessage(error)}${pageSnapshot}\n${stderr}`
      : `${normalizeErrorMessage(error)}${pageSnapshot}`;
    throw new Error(message.trim());
  } finally {
    if (client) {
      await client.close();
    }

    chrome.kill("SIGTERM");
    await waitForChildExit(chrome);
    await rm(userDataDir, { force: true, recursive: true }).catch(() => {});
  }
}

async function runBrowserTest() {
  if (browserName === "chrome") {
    await runChromeTest();
    return;
  }

  throw new Error(`Unsupported browser "${browserName}". Use "chrome".`);
}

await runBrowserTest();
