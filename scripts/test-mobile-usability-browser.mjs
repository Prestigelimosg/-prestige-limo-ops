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

      assertNoHorizontalOverflow(state, `${viewport.label} ${route.label}`);
      assert.equal(
        state.visibleText.includes(route.expectedText),
        true,
        `${viewport.label} ${route.label}: expected important section text to remain visible`,
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
        };
      })()`);
      assert.equal(emptyState.countText, "Showing 0 of 1 local mock row.", `${context}: expected zero visible rows`);
      assert.equal(emptyState.rowCount, 0, `${context}: expected no visible row cards while quick filter is empty`);
      assert.equal(emptyState.summaryCount, "0 visible of 1 local mock row", `${context}: expected summary to follow empty quick filter`);
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
      assert.equal(resetState.emptyVisible, false, `${context}: expected empty state to hide after reset`);
      assert.deepEqual(resetState.mutationCalls, [], `${context}: expected reset not to make Supabase mutations`);

      const resetLayoutState = await layoutState();
      assertNoHorizontalOverflow(resetLayoutState, `${context} reset`);
    };

    const checkMainAppViewport = async (viewport) => {
      await setViewport(viewport);
      await navigate(appUrl, "Prestige Limo Ops Dispatch");
      await waitForTabLabels(evaluate, appTabs, `${viewport.label} app tabs`);

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

      assertNoHorizontalOverflow(state, `${viewport.label} ${context}`);
      assertButtonTouchTargets(buttons, labels, `${viewport.label} ${context}`);
      return state;
    };

    const checkLoadedCopySectionsAtSmallPhone = async () => {
      const viewport = viewports[0];
      await setViewport(viewport);
      await navigate(appUrl, "Prestige Limo Ops Dispatch");
      await clickTab("Bookings");
      await clickButtonByText("Load Bookings");
      await waitForBodyText(evaluate, "MOBILE USABILITY TRAVELER", "mock loaded booking");
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
          text: summary?.innerText || "",
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
