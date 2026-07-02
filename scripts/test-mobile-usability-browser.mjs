import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createBrowserTestReporter,
  createChromeClient,
  navigateAndWaitForBodyText,
  normalizeConsoleMessages,
  normalizeErrorMessage,
  terminateChildProcess,
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
const appTabs = ["Dispatch", "Dashboard", "Bookings", "Drivers", "Completed", "Rates"];
const internalQaMockArchiveLabel = "Setup Readiness Archive";
const internalQaMockArchiveGroupLabels = [
  "Customer Intake / Account / Booking Review",
  "Dispatch / Driver / Fleet Readiness",
  "Route / Airport / Itinerary Readiness",
  "Customer Service Recovery / Replacement / Completion",
  "Finance / Extra Charges / Closeout",
  "Quote / Risk / SLA / Audit",
  "Legacy close-cycle / DSP / receivables / accounting QA",
];
const dispatcherIntakeControlLabels = [
  "AI Assist Parse (Mock)",
  "Create Job Card",
  "Clear Message",
];
const responsiveRoutes = [
  {
    expectedMobileWebText:
      "Thank you for your request. Admin will review it at our soonest. Hotline: +65 9655 0807.",
    expectedText: "Booking Request",
    label: "/book",
    path: "/book",
  },
  {
    expectedText: "My Bookings",
    label: "/my-bookings",
    path: "/my-bookings",
  },
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
const mobileCustomerFacingPriceVisibilityPatterns = [
  { label: "price/pricing/fare wording", pattern: /\b(?:price|prices|pricing|fare)\b/i },
  { label: "quoted price wording", pattern: /\bquoted\s+price\b/i },
  { label: "customer price wording", pattern: /\bcustomer\s+price\b/i },
  { label: "currency pricing amount", pattern: /(?:s\$\s*|\$\s*|sgd\s*)\d+(?:[,.]\d{2})?|\b\d+(?:[,.]\d{2})?\s*sgd\b/i },
  { label: "amount due wording", pattern: /\bamount\s+due\b/i },
  { label: "payment wording", pattern: /\bpayment\b/i },
  { label: "payment link wording", pattern: /\bpayment\s+link\b/i },
  { label: "invoice wording", pattern: /\binvoice\b/i },
  { label: "PDF wording", pattern: /\bpdf\b/i },
  { label: "billing wording", pattern: /\bbilling\b/i },
  { label: "statement wording", pattern: /\bstatement\b/i },
  { label: "finance wording", pattern: /\bfinance\b/i },
  { label: "driver payout wording", pattern: /\bdriver\s+payout\b/i },
  { label: "PayNow payout wording", pattern: /\bpay\s*now\s+payout\b/i },
  { label: "admin finance wording", pattern: /\badmin\s+finance\b/i },
  { label: "parser/debug wording", pattern: /\b(?:parser(?:\/debug|\s+debug)|debug\s+output|manual\s+review\s+internals)\b/i },
  { label: "internal QA mock archive label", pattern: /internal qa\s*\/\s*mock workbench archive/i },
  { label: "setup readiness archive label", pattern: /setup\s+readiness\s+archive/i },
];
const mobileDriverPriceFinanceLeakPatterns = [
  { label: "customer price wording", pattern: /\bcustomer\s+price\b/i },
  { label: "quoted customer price wording", pattern: /\bquoted\s+(?:customer\s+)?price\b/i },
  { label: "customer billing wording", pattern: /\bcustomer\s+billing\b/i },
  { label: "invoice/payment details wording", pattern: /\binvoice\s*\/\s*payment\s+details\b/i },
  { label: "payment link wording", pattern: /\bpayment\s+link\b/i },
  { label: "driver payout wording", pattern: /\bdriver\s+payout\b/i },
  { label: "payout comparison wording", pattern: /\bpayout\s+comparison\b/i },
  { label: "PayNow payout wording", pattern: /\bpay\s*now\s+payout\b/i },
  { label: "internal finance wording", pattern: /\binternal\s+finance\b/i },
  { label: "internal admin notes wording", pattern: /\binternal\s+admin\s+notes?\b/i },
  { label: "admin notes wording", pattern: /\badmin\s+notes?\b/i },
  { label: "customer account internals wording", pattern: /\bcustomer\s+account\s+internals?\b/i },
  { label: "mock QA/dev archive wording", pattern: /\bmock\s+qa\s*\/\s*dev\s+archive\b/i },
  { label: "internal QA mock archive label", pattern: /internal qa\s*\/\s*mock workbench archive/i },
  { label: "setup readiness archive label", pattern: /setup\s+readiness\s+archive/i },
];
const mobileAdminBookingPersistenceUiPatterns = [
  { label: "admin booking persistence wording", pattern: /\badmin\s+booking\s+persistence\b/i },
  { label: "save booking to database wording", pattern: /\bsave\s+booking\s+to\s+database\b/i },
  { label: "save booking control wording", pattern: /\bsave\s+booking\b/i },
  { label: "load booking control wording", pattern: /\bload\s+booking\b/i },
  { label: "persisted booking wording", pattern: /\bpersisted\s+booking\b/i },
  { label: "database save wording", pattern: /\bdatabase\s+save\b/i },
  { label: "create booking record wording", pattern: /\bcreate\s+booking\s+record\b/i },
  { label: "update booking record wording", pattern: /\bupdate\s+booking\s+record\b/i },
  { label: "booking persistence API wording", pattern: /\bbooking\s+persistence\s+api\b/i },
  { label: "admin save/load wording", pattern: /\badmin\s+save\s*\/\s*load\b/i },
  { label: "internal save wording", pattern: /\binternal\s+save\b/i },
  { label: "persistence prototype wording", pattern: /\bpersistence\s+prototype\b/i },
];
const mobileAdminBookingPersistenceSupabaseSavePattern = /\bsupabase\s+save\b/gi;
const mobileAdminBookingPersistenceApiPattern =
  /\/api\/(?:admin-bookings?|bookings\/admin|persistence|save-booking|load-booking)(?:[/?#]|$)/i;
const mobileNativeAppOnlyLanguagePattern =
  /\b(?:native\s+(?:mobile\s+)?app|ios\s+app|android\s+app|app\s+store|play\s+store)\b/i;

function findVisibleTextLeaks(text, patterns) {
  return patterns.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

function findMobileAdminBookingPersistenceLeaks(text) {
  const leaks = findVisibleTextLeaks(text, mobileAdminBookingPersistenceUiPatterns);
  const supabaseSaveLeaks = [...text.matchAll(mobileAdminBookingPersistenceSupabaseSavePattern)]
    .filter((match) => {
      const index = match.index || 0;
      const sentenceStart = Math.max(text.lastIndexOf(".", index), text.lastIndexOf("\n", index));
      const sentencePrefix = text.slice(Math.max(0, sentenceStart + 1), index).toLowerCase();

      return !/\b(?:no|not|without)\b/.test(sentencePrefix);
    });

  return supabaseSaveLeaks.length > 0 ? [...leaks, "Supabase save wording"] : leaks;
}

function stripMobileCustomerPortalDocumentHistoryBoundary(text, context) {
  if (!context.includes("/my-bookings") && !context.includes("/book")) {
    return text;
  }

  return text
    .replaceAll("No PDF/document is generated yet. No invoice/payment link is created.", "")
    .replaceAll("Booking Documents / Request History", "")
    .replaceAll("Booking request history is read-only for now.", "")
    .replaceAll("No price, payment, invoice, PDF, or billing file is created here.", "")
    .replaceAll("Review before submitting", "")
    .replace(/\bPDF\b/g, "");
}

function assertNoMobileCustomerFacingPriceLeaks(text, context) {
  assert.deepEqual(
    findVisibleTextLeaks(
      stripMobileCustomerPortalDocumentHistoryBoundary(text, context),
      mobileCustomerFacingPriceVisibilityPatterns,
    ),
    [],
    `${context}: expected no mobile customer-facing pricing, payment, billing, finance, payout, parser/debug, or archive leakage`,
  );
}

function assertNoMobileDriverPriceFinanceLeaks(text, context) {
  assert.deepEqual(
    findVisibleTextLeaks(text, mobileDriverPriceFinanceLeakPatterns),
    [],
    `${context}: expected no mobile driver customer price, billing, payout, PayNow payout, finance, admin-note, customer-account, or archive leakage`,
  );
}

function assertNoMobileAdminBookingPersistenceLeaks(text, context) {
  assert.deepEqual(
    findMobileAdminBookingPersistenceLeaks(text),
    [],
    `${context}: expected no mobile admin booking persistence save/load UI leakage`,
  );
}

function assertNoMobileAdminPersistenceNetworkCalls(calls, context) {
  assert.deepEqual(
    calls.filter((call) => mobileAdminBookingPersistenceApiPattern.test(call)),
    [],
    `${context}: expected no mobile admin booking persistence API calls`,
  );
}

function assertNoMobileNativeAppOnlyLanguage(text, context) {
  assert.equal(
    mobileNativeAppOnlyLanguagePattern.test(text),
    false,
    `${context}: expected mobile web/PWA-first language without native app assumptions`,
  );
}

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
  const reporter = createBrowserTestReporter("mobile-usability-browser");
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
    reporter.step("launching Chrome");
    await waitForChromeDebugPort(chromeDebugPort);

    const target = await waitForChromePageTarget(chromeDebugPort);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    reporter.step("Chrome DevTools ready");

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
          const blockedAdminPersistenceApiPattern =
            /\\/api\\/(?:admin-bookings?|bookings\\/admin|persistence|save-booking|load-booking)(?:[/?#]|$)/i;

          if (url.includes("/api/admin-app-notifications")) {
            window.__mobileUsabilityFetchCalls.push(\`\${method} \${url}\`);

            if (method === "GET") {
              return Promise.resolve(
                new Response(JSON.stringify({
                  notifications: [
                    {
                      created_at: "2026-06-08T02:00:00.000Z",
                      id: "mobile-admin-app-notification-one",
                      notification_status: "queued",
                      notification_type: "monthly_billing",
                      priority: "normal",
                      safe_message: "Mobile monthly billing draft prep was saved from grouped completed trip data.",
                      safe_title: "Mobile billing draft prep saved",
                      updated_at: "2026-06-08T02:00:00.000Z",
                    },
                  ],
                  ok: true,
                  pagination: {
                    has_next_page: false,
                    has_previous_page: false,
                    page: 1,
                    page_count: 1,
                    page_size: 5,
                    total_notification_count: 1,
                  },
                  version: "mobile-admin-app-notification-feed-read-mock",
                }), {
                  status: 200,
                  headers: { "content-type": "application/json" },
                }),
              );
            }

            return Promise.resolve(
              new Response(JSON.stringify({
                message: "Blocked admin app notification mutation in mobile usability browser test.",
              }), {
                status: 500,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          if (url.includes("/api/admin-saved-bookings")) {
            window.__mobileUsabilityFetchCalls.push(\`\${method} \${url}\`);

            if (method === "GET") {
              return Promise.resolve(
                new Response(JSON.stringify({
                  bookings: bookingsFixture,
                  ok: true,
                  version: "mobile-admin-saved-bookings-read-mock",
                }), {
                  status: 200,
                  headers: { "content-type": "application/json" },
                }),
              );
            }

            return Promise.resolve(
              new Response(JSON.stringify({
                message: "Blocked admin saved booking mutation in mobile usability browser test.",
              }), {
                status: 500,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          if (blockedAdminPersistenceApiPattern.test(url)) {
            window.__mobileUsabilityFetchCalls.push(\`\${method} \${url}\`);

            return Promise.resolve(
              new Response(JSON.stringify({
                message: "Blocked admin booking persistence API call in mobile usability browser test.",
              }), {
                status: 500,
                headers: { "content-type": "application/json" },
              }),
            );
          }

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

    const checkDispatchReleaseHandoffPacket = async (viewport) => {
      const state = await evaluate(`(() => {
        const packet = document.querySelector("[data-admin-dispatch-release-handoff-packet='true']");
        const note = packet?.querySelector("[data-admin-dispatch-release-handoff-note='true']");
        const packetRect = packet?.getBoundingClientRect();
        const noteRect = note?.getBoundingClientRect();
        const items = [...(packet?.querySelectorAll("[data-admin-dispatch-release-handoff-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-dispatch-release-handoff-item") || "",
              label:
                item.querySelector("[data-admin-dispatch-release-handoff-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );

        return {
          boundary:
            packet?.querySelector("[data-admin-dispatch-release-handoff-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(packetRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          status:
            packet?.querySelector("[data-admin-dispatch-release-handoff-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text: packet?.innerText || "",
          visible: Boolean(packetRect && packetRect.width > 0 && packetRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Dispatch Release handoff packet`);
      assert.equal(
        state.text.includes("Dispatch Release Handoff Packet"),
        true,
        `${viewport.label}: expected Dispatch Release handoff packet title`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Release status",
          "Customer update copy",
          "Driver dispatch copy",
          "Driver job link",
          "Assigned driver summary",
          "Local release note/status",
        ],
        `${viewport.label}: expected Dispatch Release handoff packet rows`,
      );
      assert.equal(
        state.status,
        "Not ready for local release",
        `${viewport.label}: expected Dispatch Release handoff packet to start blocked`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected local release note to start empty`);
      assert.equal(
        state.noteHeight >= 60,
        true,
        `${viewport.label}: expected local release note field to be touch-friendly`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Dispatch Release handoff packet local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 700 : 460),
        true,
        `${viewport.label}: expected compact Dispatch Release handoff packet, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Dispatch Release handoff packet rows to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Dispatch Release handoff packet not to create horizontal overflow`,
      );
    };

    const checkDriverAcknowledgementReadiness = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-driver-acknowledgement-readiness='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-driver-acknowledgement-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-driver-acknowledgement-item") || "",
              label:
                item.querySelector("[data-admin-driver-acknowledgement-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );

        return {
          boundary:
            section?.querySelector("[data-admin-driver-acknowledgement-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          markReadyDisabled:
            section?.querySelector("[data-admin-driver-acknowledgement-mark-ready='true']")?.disabled ?? null,
          status:
            section?.querySelector("[data-admin-driver-acknowledgement-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Driver Acknowledgement Readiness section`);
      assert.equal(
        state.text.includes("Driver Acknowledgement Readiness"),
        true,
        `${viewport.label}: expected Driver Acknowledgement Readiness title`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Dispatch release saved",
          "Driver assigned",
          "Driver contact available",
          "Dispatch copy prepared",
          "Driver job link prepared",
          "Acknowledgement local status",
          "Next dispatcher action",
        ],
        `${viewport.label}: expected Driver Acknowledgement Readiness rows`,
      );
      assert.equal(
        state.status,
        "Acknowledgement pending",
        `${viewport.label}: expected Driver Acknowledgement Readiness to start pending`,
      );
      assert.equal(
        state.markReadyDisabled,
        true,
        `${viewport.label}: expected Driver Acknowledgement Readiness local action to start disabled`,
      );
      assert.equal(
        state.boundary.includes("UI/local-state") &&
          state.boundary.includes("workflow-status API") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("live database access") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Driver Acknowledgement Readiness workflow-status API boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 760 : 450),
        true,
        `${viewport.label}: expected compact Driver Acknowledgement Readiness, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Driver Acknowledgement Readiness rows to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Driver Acknowledgement Readiness not to create horizontal overflow`,
      );
    };

    const checkDriverAcknowledgementFollowUp = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-driver-acknowledgement-follow-up='true']");
        const sectionRect = section?.getBoundingClientRect();
        const note = section?.querySelector("[data-admin-driver-acknowledgement-follow-up-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-driver-acknowledgement-follow-up-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-driver-acknowledgement-follow-up-item") || "",
              label:
                item.querySelector("[data-admin-driver-acknowledgement-follow-up-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );
        const options = [
          ...(section?.querySelectorAll("[data-admin-driver-acknowledgement-follow-up-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            disabled: option.disabled,
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-driver-acknowledgement-follow-up-option-state") || "",
            value: option.getAttribute("data-admin-driver-acknowledgement-follow-up-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section?.querySelector("[data-admin-driver-acknowledgement-follow-up-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section?.querySelector("[data-admin-driver-acknowledgement-follow-up-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Driver Acknowledgement Follow-up section`);
      assert.equal(
        state.text.includes("Driver Acknowledgement Follow-up"),
        true,
        `${viewport.label}: expected Driver Acknowledgement Follow-up title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        ["Pending", "Acknowledged", "Needs Call"],
        `${viewport.label}: expected Driver Acknowledgement Follow-up local status controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Acknowledgement pending",
          "Acknowledged locally",
          "No response / needs call",
          "Next dispatcher action",
          "Local follow-up note/status",
        ],
        `${viewport.label}: expected Driver Acknowledgement Follow-up rows`,
      );
      assert.equal(
        state.status,
        "Acknowledgement pending",
        `${viewport.label}: expected Driver Acknowledgement Follow-up to start pending`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected Driver Acknowledgement Follow-up note to start empty`);
      assert.equal(
        state.noteHeight >= 48,
        true,
        `${viewport.label}: expected Driver Acknowledgement Follow-up note to be touch-friendly`,
      );
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Driver Acknowledgement Follow-up controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Driver Acknowledgement Follow-up local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 760 : 500),
        true,
        `${viewport.label}: expected compact Driver Acknowledgement Follow-up, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Driver Acknowledgement Follow-up rows to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Driver Acknowledgement Follow-up not to create horizontal overflow`,
      );
    };

    const checkDayOfTripDispatchMonitor = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-day-of-trip-dispatch-monitor='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-day-of-trip-dispatch-monitor-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-day-of-trip-dispatch-monitor-item") || "",
              label:
                item.querySelector("[data-admin-day-of-trip-dispatch-monitor-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );
        const options = [
          ...(section?.querySelectorAll("[data-admin-day-of-trip-dispatch-monitor-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            disabled: option.disabled,
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-day-of-trip-dispatch-monitor-option-state") || "",
            value: option.getAttribute("data-admin-day-of-trip-dispatch-monitor-option") || "",
            width: Math.round(optionRect.width),
          };
        });
        const savedDriverStatusReadout = section?.querySelector("[data-admin-driver-job-status-readout='true']");
        const savedDriverStatusReadoutRect = savedDriverStatusReadout?.getBoundingClientRect();

        return {
          boundary:
            section?.querySelector("[data-admin-day-of-trip-dispatch-monitor-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          options,
          savedDriverStatusReadout: {
            height: Math.round(savedDriverStatusReadoutRect?.height || 0),
            latest:
              savedDriverStatusReadout
                ?.querySelector("[data-admin-driver-job-status-readout-detail='latest-status']")
                ?.textContent.replace(/\\s+/g, " ")
                .trim() || "",
            message:
              savedDriverStatusReadout
                ?.querySelector("[data-admin-driver-job-status-readout-message='true']")
                ?.textContent.replace(/\\s+/g, " ")
                .trim() || "",
            state:
              savedDriverStatusReadout
                ?.querySelector("[data-admin-driver-job-status-readout-state='true']")
                ?.textContent.replace(/\\s+/g, " ")
                .trim() || "",
            text: savedDriverStatusReadout?.textContent.replace(/\\s+/g, " ").trim() || "",
            visible: Boolean(
              savedDriverStatusReadoutRect &&
                savedDriverStatusReadoutRect.width > 0 &&
                savedDriverStatusReadoutRect.height > 0,
            ),
            width: Math.round(savedDriverStatusReadoutRect?.width || 0),
          },
          status:
            section?.querySelector("[data-admin-day-of-trip-dispatch-monitor-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Day-of-Trip Dispatch Monitor section`);
      assert.equal(
        state.text.includes("Day-of-Trip Dispatch Monitor"),
        true,
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        ["Reminder Due", "OTW", "OTS", "POB", "Completed", "Needs Call"],
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor local status controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Driver acknowledged",
          "Reminder due",
          "OTW",
          "OTS",
          "POB",
          "Completed",
          "No response / needs call",
          "Next dispatcher action",
        ],
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor rows`,
      );
      assert.equal(
        state.status,
        "Reminder due",
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor to start reminder due`,
      );
      assert.equal(
        state.savedDriverStatusReadout.visible,
        true,
        `${viewport.label}: expected saved driver status readout inside Day-of-Trip Dispatch Monitor`,
      );
      assert.equal(
        state.savedDriverStatusReadout.text.includes("Saved driver status") &&
          state.savedDriverStatusReadout.latest === "No saved driver status" &&
          state.savedDriverStatusReadout.state === "No saved status",
        true,
        `${viewport.label}: expected saved driver status readout to stay safe and empty by default`,
      );
      assert.equal(
        state.savedDriverStatusReadout.width > 0 && state.savedDriverStatusReadout.height >= 48,
        true,
        `${viewport.label}: expected saved driver status readout to stay readable`,
      );
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("live location") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 880 : 620),
        true,
        `${viewport.label}: expected compact Day-of-Trip Dispatch Monitor, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor rows to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Day-of-Trip Dispatch Monitor not to create horizontal overflow`,
      );
    };

    const checkAdminAppNotificationFeed = async (viewport) => {
      const state = await waitForCondition(
        () =>
          evaluate(`(() => {
            const section = document.querySelector("[data-admin-app-notification-feed='true']");
            const sectionRect = section?.getBoundingClientRect();
            const rows = [...(section?.querySelectorAll("[data-admin-app-notification-feed-row='true']") || [])].map((row) => {
              const rowRect = row.getBoundingClientRect();

              return {
                height: Math.round(rowRect.height),
                message:
                  row.querySelector("[data-admin-app-notification-feed-message='true']")
                    ?.textContent.replace(/\\s+/g, " ")
                    .trim() || "",
                title:
                  row.querySelector("[data-admin-app-notification-feed-title='true']")
                    ?.textContent.replace(/\\s+/g, " ")
                    .trim() || "",
                width: Math.round(rowRect.width),
              };
            });

            if (!section || rows.length === 0) {
              return false;
            }

            return {
              boundary:
                section.querySelector("[data-admin-app-notification-feed-boundary='true']")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              feedback:
                section.querySelector("[data-admin-app-notification-feed-feedback='true']")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              height: Math.round(sectionRect?.height || 0),
              rows,
              state:
                section.querySelector("[data-admin-app-notification-feed-state='true']")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
            };
          })()`),
        10000,
        `${viewport.label} admin app notification feed`,
      );

      assert.equal(state.visible, true, `${viewport.label}: expected admin app notification feed`);
      assert.equal(state.state, "Queued", `${viewport.label}: expected queued notification state`);
      assert.equal(
        state.feedback.includes("Loaded 1 saved admin app notification"),
        true,
        `${viewport.label}: expected admin app notification feed read feedback`,
      );
      assert.equal(
        state.rows[0].title === "Mobile billing draft prep saved" &&
          state.rows[0].message === "Mobile monthly billing draft prep was saved from grouped completed trip data.",
        true,
        `${viewport.label}: expected safe mobile notification title/message`,
      );
      assert.equal(
        /customer_price|driver_payout|paynow|token_hash|raw_token|service_role|parser|safe_context/i.test(
          JSON.stringify(state.rows),
        ),
        false,
        `${viewport.label}: expected mobile notification feed rows not to expose private internals`,
      );
      assert.equal(
        state.rows.every((row) => row.height >= 48 && row.width >= (viewport.width < 360 ? 180 : 240)),
        true,
        `${viewport.label}: expected admin app notification rows to stay readable`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 520 : 360),
        true,
        `${viewport.label}: expected compact admin app notification feed, got ${state.height}px`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected admin app notification feed not to create horizontal overflow`,
      );
      assert.equal(
        state.boundary.includes("No external delivery") &&
          state.boundary.includes("invoice creation") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("customer auth") &&
          state.boundary.includes("driver auth"),
        true,
        `${viewport.label}: expected admin app notification feed safe boundary`,
      );
    };

    const checkDayOfTripExceptionEscalation = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-day-of-trip-exception-escalation='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-day-of-trip-exception-escalation-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-day-of-trip-exception-escalation-item") || "",
              label:
                item.querySelector("[data-admin-day-of-trip-exception-escalation-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );
        const note = section?.querySelector("[data-admin-day-of-trip-exception-escalation-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-day-of-trip-exception-escalation-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-day-of-trip-exception-escalation-option-state") || "",
            value: option.getAttribute("data-admin-day-of-trip-exception-escalation-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section?.querySelector("[data-admin-day-of-trip-exception-escalation-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section?.querySelector("[data-admin-day-of-trip-exception-escalation-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Day-of-Trip Exception Escalation section`);
      assert.equal(
        state.text.includes("Day-of-Trip Exception Escalation"),
        true,
        `${viewport.label}: expected Day-of-Trip Exception Escalation title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        ["No Response", "Late Reminder", "Call Needed", "Replacement", "Customer Update", "Closed"],
        `${viewport.label}: expected Day-of-Trip Exception Escalation local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Driver no response",
          "Driver late / reminder due",
          "Needs dispatcher call",
          "Replacement driver may be needed",
          "Customer update may be needed",
          "Next escalation action",
          "Local escalation note/status",
        ],
        `${viewport.label}: expected Day-of-Trip Exception Escalation rows`,
      );
      assert.equal(
        state.status,
        "Driver late / reminder due",
        `${viewport.label}: expected Day-of-Trip Exception Escalation to start late/reminder due`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local escalation note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Day-of-Trip Exception Escalation controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("live location") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Day-of-Trip Exception Escalation local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 820 : 560),
        true,
        `${viewport.label}: expected compact Day-of-Trip Exception Escalation, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Day-of-Trip Exception Escalation rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Day-of-Trip Exception Escalation note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Day-of-Trip Exception Escalation not to create horizontal overflow`,
      );
    };

    const checkDispatchRecoveryReplacementReadiness = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-dispatch-recovery-replacement-readiness='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-dispatch-recovery-replacement-readiness-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-dispatch-recovery-replacement-readiness-item") || "",
              label:
                item.querySelector("[data-admin-dispatch-recovery-replacement-readiness-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );
        const note = section?.querySelector("[data-admin-dispatch-recovery-replacement-readiness-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-dispatch-recovery-replacement-readiness-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-dispatch-recovery-replacement-readiness-option-state") || "",
            value: option.getAttribute("data-admin-dispatch-recovery-replacement-readiness-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-dispatch-recovery-replacement-readiness-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-dispatch-recovery-replacement-readiness-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Dispatch Recovery Replacement section`);
      assert.equal(
        state.text.includes("Dispatch Recovery / Replacement Readiness"),
        true,
        `${viewport.label}: expected Dispatch Recovery Replacement title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        ["Review Needed", "Driver Reviewed", "Vehicle Reviewed", "Copy Ready", "Job Link Ready", "Ready Locally"],
        `${viewport.label}: expected Dispatch Recovery Replacement local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Replacement driver review",
          "Replacement vehicle review",
          "Customer update readiness",
          "Dispatch copy update readiness",
          "New driver job link readiness",
          "Next recovery action",
          "Local recovery note/status",
        ],
        `${viewport.label}: expected Dispatch Recovery Replacement rows`,
      );
      assert.equal(
        state.status,
        "Recovery review needed",
        `${viewport.label}: expected Dispatch Recovery Replacement to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local recovery note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Dispatch Recovery Replacement controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("live location") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Dispatch Recovery Replacement local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 880 : 580),
        true,
        `${viewport.label}: expected compact Dispatch Recovery Replacement, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Dispatch Recovery Replacement rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Dispatch Recovery Replacement note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Dispatch Recovery Replacement not to create horizontal overflow`,
      );
    };

    const checkPostRecoveryUpdateReadiness = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-post-recovery-update-readiness='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-post-recovery-update-readiness-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-post-recovery-update-readiness-item") || "",
              label:
                item.querySelector("[data-admin-post-recovery-update-readiness-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );
        const note = section?.querySelector("[data-admin-post-recovery-update-readiness-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-post-recovery-update-readiness-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-post-recovery-update-readiness-option-state") || "",
            value: option.getAttribute("data-admin-post-recovery-update-readiness-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-post-recovery-update-readiness-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-post-recovery-update-readiness-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Post-Recovery Update section`);
      assert.equal(
        state.text.includes("Post-Recovery Update Readiness"),
        true,
        `${viewport.label}: expected Post-Recovery Update title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Customer Copy",
          "Driver Copy",
          "Original Driver",
          "Job Link Ready",
          "ETA Ready",
          "Ready Locally",
        ],
        `${viewport.label}: expected Post-Recovery Update local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Customer update copy reviewed",
          "Replacement driver dispatch copy reviewed",
          "Original driver follow-up reviewed",
          "New driver job link readiness",
          "Customer ETA/update status",
          "Next dispatcher action",
          "Local update note/status",
        ],
        `${viewport.label}: expected Post-Recovery Update rows`,
      );
      assert.equal(
        state.status,
        "Post-recovery update review needed",
        `${viewport.label}: expected Post-Recovery Update to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local update note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Post-Recovery Update controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("live location") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Post-Recovery Update local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 1020 : viewport.width < 1200 ? 700 : 600),
        true,
        `${viewport.label}: expected compact Post-Recovery Update, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Post-Recovery Update rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Post-Recovery Update note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Post-Recovery Update not to create horizontal overflow`,
      );
    };

    const checkDayOfTripCompletionHandoff = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-day-of-trip-completion-handoff='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-day-of-trip-completion-handoff-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-day-of-trip-completion-handoff-item") || "",
              label:
                item.querySelector("[data-admin-day-of-trip-completion-handoff-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );
        const note = section?.querySelector("[data-admin-day-of-trip-completion-handoff-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-day-of-trip-completion-handoff-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-day-of-trip-completion-handoff-option-state") || "",
            value: option.getAttribute("data-admin-day-of-trip-completion-handoff-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-day-of-trip-completion-handoff-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-day-of-trip-completion-handoff-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Day-of-Trip Completion Handoff section`);
      assert.equal(
        state.text.includes("Day-of-Trip Completion Handoff"),
        true,
        `${viewport.label}: expected Day-of-Trip Completion Handoff title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Trip Complete",
          "Driver Complete",
          "Customer Closeout",
          "Exception Reviewed",
          "Ready Locally",
        ],
        `${viewport.label}: expected Day-of-Trip Completion Handoff local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Final trip status",
          "Driver completion status",
          "Customer closeout update readiness",
          "Exception/resolution note reviewed",
          "Next admin closeout action",
          "Local completion note/status",
        ],
        `${viewport.label}: expected Day-of-Trip Completion Handoff rows`,
      );
      assert.equal(
        state.status,
        "Completion handoff review needed",
        `${viewport.label}: expected Day-of-Trip Completion Handoff to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local completion note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Day-of-Trip Completion Handoff controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("live location") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Day-of-Trip Completion Handoff local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 900 : 620),
        true,
        `${viewport.label}: expected compact Day-of-Trip Completion Handoff, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Day-of-Trip Completion Handoff rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Day-of-Trip Completion Handoff note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Day-of-Trip Completion Handoff not to create horizontal overflow`,
      );
    };

    const checkCompletedTripCloseoutReview = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-completed-trip-closeout-review='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [...(section?.querySelectorAll("[data-admin-completed-trip-closeout-review-item]") || [])].map(
          (item) => {
            const itemRect = item.getBoundingClientRect();

            return {
              height: Math.round(itemRect.height),
              key: item.getAttribute("data-admin-completed-trip-closeout-review-item") || "",
              label:
                item.querySelector("[data-admin-completed-trip-closeout-review-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              width: Math.round(itemRect.width),
            };
          },
        );
        const note = section?.querySelector("[data-admin-completed-trip-closeout-review-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-completed-trip-closeout-review-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-completed-trip-closeout-review-option-state") || "",
            value: option.getAttribute("data-admin-completed-trip-closeout-review-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-completed-trip-closeout-review-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-completed-trip-closeout-review-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(state.visible, true, `${viewport.label}: expected Completed Trip Closeout Review section`);
      assert.equal(
        state.text.includes("Completed Trip Closeout Review"),
        true,
        `${viewport.label}: expected Completed Trip Closeout Review title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Trip Complete",
          "Driver Reviewed",
          "Customer Closeout",
          "Exception Reviewed",
          "Billing Note",
          "Ready Locally",
        ],
        `${viewport.label}: expected Completed Trip Closeout Review local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Trip completed",
          "Driver completion reviewed",
          "Customer closeout reviewed",
          "Exception/resolution reviewed",
          "Billing-readiness note reviewed",
          "Next admin closeout action",
          "Local closeout note/status",
        ],
        `${viewport.label}: expected Completed Trip Closeout Review rows`,
      );
      assert.equal(
        state.status,
        "Completed trip closeout review needed",
        `${viewport.label}: expected Completed Trip Closeout Review to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local closeout note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Completed Trip Closeout Review controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("UI/local-state") &&
          state.boundary.includes("completed closeout API") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("invoice") &&
          state.boundary.includes("PDF") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("payout") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Completed Trip Closeout Review completed-closeout API boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 980 : 680),
        true,
        `${viewport.label}: expected compact Completed Trip Closeout Review, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Completed Trip Closeout Review rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Completed Trip Closeout Review note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Completed Trip Closeout Review not to create horizontal overflow`,
      );
    };

    const checkCloseoutToBillingPreparationReview = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-closeout-to-billing-preparation-review='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [
          ...(section?.querySelectorAll("[data-admin-closeout-to-billing-preparation-review-item]") || []),
        ].map((item) => {
          const itemRect = item.getBoundingClientRect();

          return {
            height: Math.round(itemRect.height),
            key: item.getAttribute("data-admin-closeout-to-billing-preparation-review-item") || "",
            label:
              item.querySelector("[data-admin-closeout-to-billing-preparation-review-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            width: Math.round(itemRect.width),
          };
        });
        const note = section?.querySelector("[data-admin-closeout-to-billing-preparation-review-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-closeout-to-billing-preparation-review-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-closeout-to-billing-preparation-review-option-state") || "",
            value: option.getAttribute("data-admin-closeout-to-billing-preparation-review-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-closeout-to-billing-preparation-review-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-closeout-to-billing-preparation-review-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(
        state.visible,
        true,
        `${viewport.label}: expected Closeout to Billing Preparation Review section`,
      );
      assert.equal(
        state.text.includes("Closeout to Billing Preparation Review"),
        true,
        `${viewport.label}: expected Closeout to Billing Preparation Review title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Closeout Reviewed",
          "Account Ready",
          "Trip Details",
          "Extra Charges",
          "Billing Note",
          "Ready Locally",
        ],
        `${viewport.label}: expected Closeout to Billing Preparation Review local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Closeout reviewed",
          "Customer/account billing readiness",
          "Trip/service details reviewed",
          "Extra charges review needed",
          "Billing note reviewed",
          "Next billing preparation action",
          "Local billing-prep note/status",
        ],
        `${viewport.label}: expected Closeout to Billing Preparation Review rows`,
      );
      assert.equal(
        state.status,
        "Closeout to billing preparation review needed",
        `${viewport.label}: expected Closeout to Billing Preparation Review to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local billing-prep note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Closeout to Billing Preparation Review controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("billing activation") &&
          state.boundary.includes("invoice") &&
          state.boundary.includes("PDF") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("payout") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Closeout to Billing Preparation Review local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 640 ? 1000 : 700),
        true,
        `${viewport.label}: expected compact Closeout to Billing Preparation Review, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Closeout to Billing Preparation Review rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Closeout to Billing Preparation Review note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Closeout to Billing Preparation Review not to create horizontal overflow`,
      );
    };

    const checkBillingPreparationExceptionReview = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-billing-preparation-exception-review='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [
          ...(section?.querySelectorAll("[data-admin-billing-preparation-exception-review-item]") || []),
        ].map((item) => {
          const itemRect = item.getBoundingClientRect();

          return {
            height: Math.round(itemRect.height),
            key: item.getAttribute("data-admin-billing-preparation-exception-review-item") || "",
            label:
              item.querySelector("[data-admin-billing-preparation-exception-review-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            width: Math.round(itemRect.width),
          };
        });
        const note = section?.querySelector("[data-admin-billing-preparation-exception-review-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-billing-preparation-exception-review-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-billing-preparation-exception-review-option-state") || "",
            value: option.getAttribute("data-admin-billing-preparation-exception-review-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-billing-preparation-exception-review-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-billing-preparation-exception-review-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(
        state.visible,
        true,
        `${viewport.label}: expected Billing Preparation Exception Review section`,
      );
      assert.equal(
        state.text.includes("Billing Preparation Exception Review"),
        true,
        `${viewport.label}: expected Billing Preparation Exception Review title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Missing Account",
          "Details Missing",
          "Extra Charges",
          "Dispute/Waiver",
          "Billing Action",
          "Cleared Locally",
        ],
        `${viewport.label}: expected Billing Preparation Exception Review local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Missing billing account",
          "Incomplete trip/service details",
          "Extra charges pending",
          "Disputed or waived charges",
          "Billing note/action required",
          "Next billing-prep action",
          "Local exception note/status",
        ],
        `${viewport.label}: expected Billing Preparation Exception Review rows`,
      );
      assert.equal(
        state.status,
        "Billing preparation exception review needed",
        `${viewport.label}: expected Billing Preparation Exception Review to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local exception note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Billing Preparation Exception Review controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("billing activation") &&
          state.boundary.includes("invoice") &&
          state.boundary.includes("PDF") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("payout") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Billing Preparation Exception Review local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 340 ? 1060 : viewport.width < 640 ? 1000 : 700),
        true,
        `${viewport.label}: expected compact Billing Preparation Exception Review, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Billing Preparation Exception Review rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Billing Preparation Exception Review note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Billing Preparation Exception Review not to create horizontal overflow`,
      );
    };

    const checkBillingPreparationSummaryReadyReview = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-billing-preparation-summary-ready-review='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [
          ...(section?.querySelectorAll("[data-admin-billing-preparation-summary-ready-review-item]") || []),
        ].map((item) => {
          const itemRect = item.getBoundingClientRect();

          return {
            height: Math.round(itemRect.height),
            key: item.getAttribute("data-admin-billing-preparation-summary-ready-review-item") || "",
            label:
              item.querySelector("[data-admin-billing-preparation-summary-ready-review-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            width: Math.round(itemRect.width),
          };
        });
        const note = section?.querySelector("[data-admin-billing-preparation-summary-ready-review-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-billing-preparation-summary-ready-review-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-billing-preparation-summary-ready-review-option-state") || "",
            value: option.getAttribute("data-admin-billing-preparation-summary-ready-review-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-billing-preparation-summary-ready-review-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-billing-preparation-summary-ready-review-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(
        state.visible,
        true,
        `${viewport.label}: expected Billing Preparation Summary / Ready Review section`,
      );
      assert.equal(
        state.text.includes("Billing Preparation Summary / Ready Review"),
        true,
        `${viewport.label}: expected Billing Preparation Summary / Ready Review title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Closeout Ready",
          "Account Ready",
          "Details Ready",
          "Charges Reviewed",
          "Exceptions Clear",
          "Monthly Ready",
        ],
        `${viewport.label}: expected Billing Preparation Summary / Ready Review local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Closeout ready",
          "Billing account ready",
          "Trip/service details ready",
          "Extra charges reviewed",
          "Exceptions cleared or pending",
          "Ready for monthly billing review",
          "Next admin billing action",
          "Local summary note/status",
        ],
        `${viewport.label}: expected Billing Preparation Summary / Ready Review rows`,
      );
      assert.equal(
        state.status,
        "Billing preparation summary review needed",
        `${viewport.label}: expected Billing Preparation Summary / Ready Review to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local summary note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Billing Preparation Summary / Ready Review controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("billing activation") &&
          state.boundary.includes("invoice") &&
          state.boundary.includes("PDF") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("payout") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("parser-learning"),
        true,
        `${viewport.label}: expected Billing Preparation Summary / Ready Review local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 340 ? 1220 : viewport.width < 640 ? 1120 : 760),
        true,
        `${viewport.label}: expected compact Billing Preparation Summary / Ready Review, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Billing Preparation Summary / Ready Review rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Billing Preparation Summary / Ready Review note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Billing Preparation Summary / Ready Review not to create horizontal overflow`,
      );
    };

    const checkMonthlyBillingQueueReadinessReview = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-monthly-billing-queue-readiness-review='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [
          ...(section?.querySelectorAll("[data-admin-monthly-billing-queue-readiness-review-item]") || []),
        ].map((item) => {
          const itemRect = item.getBoundingClientRect();

          return {
            height: Math.round(itemRect.height),
            key: item.getAttribute("data-admin-monthly-billing-queue-readiness-review-item") || "",
            label:
              item.querySelector("[data-admin-monthly-billing-queue-readiness-review-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            width: Math.round(itemRect.width),
          };
        });
        const note = section?.querySelector("[data-admin-monthly-billing-queue-readiness-review-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-monthly-billing-queue-readiness-review-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-monthly-billing-queue-readiness-review-option-state") || "",
            value: option.getAttribute("data-admin-monthly-billing-queue-readiness-review-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-monthly-billing-queue-readiness-review-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-monthly-billing-queue-readiness-review-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(
        state.visible,
        true,
        `${viewport.label}: expected Monthly Billing Queue Readiness Review section`,
      );
      assert.equal(
        state.text.includes("Monthly Billing Queue Readiness Review"),
        true,
        `${viewport.label}: expected Monthly Billing Queue Readiness Review title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Account Reviewed",
          "Month Reviewed",
          "Trips Reviewed",
          "Prep Reviewed",
          "Exceptions Reviewed",
          "Queued Locally",
        ],
        `${viewport.label}: expected Monthly Billing Queue Readiness Review local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Customer/account",
          "Billing month",
          "Ready trips count",
          "Blocked trips count",
          "Billing prep status",
          "Exception status",
          "Monthly billing queue status",
          "Next action",
          "Local queue note/status",
        ],
        `${viewport.label}: expected Monthly Billing Queue Readiness Review rows`,
      );
      assert.equal(
        state.status,
        "Monthly billing queue review needed",
        `${viewport.label}: expected Monthly Billing Queue Readiness Review to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local queue note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Monthly Billing Queue Readiness Review controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("live database access") &&
          state.boundary.includes("invoice creation") &&
          state.boundary.includes("PDF") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("payout") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("auth change") &&
          state.boundary.includes("parser change"),
        true,
        `${viewport.label}: expected Monthly Billing Queue Readiness Review local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 340 ? 1380 : viewport.width < 640 ? 1260 : 900),
        true,
        `${viewport.label}: expected compact Monthly Billing Queue Readiness Review, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Monthly Billing Queue Readiness Review rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Monthly Billing Queue Readiness Review note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Monthly Billing Queue Readiness Review not to create horizontal overflow`,
      );
    };

    const checkMonthlyBillingQueueExceptionReview = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-monthly-billing-queue-exception-review='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [
          ...(section?.querySelectorAll("[data-admin-monthly-billing-queue-exception-review-item]") || []),
        ].map((item) => {
          const itemRect = item.getBoundingClientRect();

          return {
            height: Math.round(itemRect.height),
            key: item.getAttribute("data-admin-monthly-billing-queue-exception-review-item") || "",
            label:
              item.querySelector("[data-admin-monthly-billing-queue-exception-review-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            width: Math.round(itemRect.width),
          };
        });
        const note = section?.querySelector("[data-admin-monthly-billing-queue-exception-review-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const options = [
          ...(section?.querySelectorAll("[data-admin-monthly-billing-queue-exception-review-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-monthly-billing-queue-exception-review-option-state") || "",
            value: option.getAttribute("data-admin-monthly-billing-queue-exception-review-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-monthly-billing-queue-exception-review-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          status:
            section
              ?.querySelector("[data-admin-monthly-billing-queue-exception-review-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(
        state.visible,
        true,
        `${viewport.label}: expected Monthly Billing Queue Exception Review section`,
      );
      assert.equal(
        state.text.includes("Monthly Billing Queue Exception Review"),
        true,
        `${viewport.label}: expected Monthly Billing Queue Exception Review title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Account/Month",
          "Reason Reviewed",
          "Account Exception",
          "Details Exception",
          "Charges Exception",
          "Prep Exception",
          "Decision Reviewed",
          "Cleared Locally",
        ],
        `${viewport.label}: expected Monthly Billing Queue Exception Review local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Customer/account",
          "Billing month",
          "Blocked trip reason",
          "Missing billing account status",
          "Trip/service detail exception",
          "Extra charges exception",
          "Billing-prep exception",
          "Queue exception decision",
          "Next action",
          "Local exception note/status",
        ],
        `${viewport.label}: expected Monthly Billing Queue Exception Review rows`,
      );
      assert.equal(
        state.status,
        "Monthly billing queue exception review needed",
        `${viewport.label}: expected Monthly Billing Queue Exception Review to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local queue exception note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Monthly Billing Queue Exception Review controls to stay readable`,
      );
      assert.equal(
        state.boundary.includes("Local UI only.") &&
          state.boundary.includes("No Supabase write") &&
          state.boundary.includes("live database access") &&
          state.boundary.includes("invoice creation") &&
          state.boundary.includes("PDF") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("payout") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("auth change") &&
          state.boundary.includes("parser change"),
        true,
        `${viewport.label}: expected Monthly Billing Queue Exception Review local-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 340 ? 1500 : viewport.width < 640 ? 1380 : 980),
        true,
        `${viewport.label}: expected compact Monthly Billing Queue Exception Review, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Monthly Billing Queue Exception Review rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Monthly Billing Queue Exception Review note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Monthly Billing Queue Exception Review not to create horizontal overflow`,
      );
    };

    const checkMonthlyBillingMonthGroupingReview = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-admin-monthly-billing-month-grouping-review='true']");
        const sectionRect = section?.getBoundingClientRect();
        const items = [
          ...(section?.querySelectorAll("[data-admin-monthly-billing-month-grouping-review-item]") || []),
        ].map((item) => {
          const itemRect = item.getBoundingClientRect();

          return {
            height: Math.round(itemRect.height),
            key: item.getAttribute("data-admin-monthly-billing-month-grouping-review-item") || "",
            label:
              item.querySelector("[data-admin-monthly-billing-month-grouping-review-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            width: Math.round(itemRect.width),
          };
        });
        const note = section?.querySelector("[data-admin-monthly-billing-month-grouping-review-note='true']");
        const noteRect = note?.getBoundingClientRect();
        const readControls = [
          section?.querySelector("[data-admin-monthly-billing-month-grouping-customer-search='true']"),
          section?.querySelector("[data-admin-monthly-billing-month-grouping-readiness-filter='true']"),
          section?.querySelector("[data-admin-monthly-billing-month-grouping-limit='true']"),
        ].filter(Boolean).map((control) => {
          const controlRect = control.getBoundingClientRect();

          return {
            height: Math.round(controlRect.height),
            label:
              control.closest("label")?.querySelector("span")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            tag: control.tagName.toLowerCase(),
            value: control.value || "",
            width: Math.round(controlRect.width),
          };
        });
        const pageButtons = [
          section?.querySelector("[data-admin-monthly-billing-month-grouping-previous-page='true']"),
          section?.querySelector("[data-admin-monthly-billing-month-grouping-next-page='true']"),
        ].filter(Boolean).map((button) => {
          const buttonRect = button.getBoundingClientRect();

          return {
            disabled: button.disabled,
            height: Math.round(buttonRect.height),
            label: button.textContent.replace(/\\s+/g, " ").trim(),
            width: Math.round(buttonRect.width),
          };
        });
        const options = [
          ...(section?.querySelectorAll("[data-admin-monthly-billing-month-grouping-review-option]") || []),
        ].map((option) => {
          const optionRect = option.getBoundingClientRect();

          return {
            height: Math.round(optionRect.height),
            label: option.textContent.replace(/\\s+/g, " ").trim(),
            state: option.getAttribute("data-admin-monthly-billing-month-grouping-review-option-state") || "",
            value: option.getAttribute("data-admin-monthly-billing-month-grouping-review-option") || "",
            width: Math.round(optionRect.width),
          };
        });

        return {
          boundary:
            section
              ?.querySelector("[data-admin-monthly-billing-month-grouping-review-boundary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          height: Math.round(sectionRect?.height || 0),
          items,
          noteHeight: Math.round(noteRect?.height || 0),
          noteValue: note?.value ?? null,
          options,
          pageButtons,
          pageSummary:
            section
              ?.querySelector("[data-admin-monthly-billing-month-grouping-page-summary='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          readControls,
          status:
            section
              ?.querySelector("[data-admin-monthly-billing-month-grouping-review-status='true']")
              ?.textContent.replace(/\\s+/g, " ")
              .trim() || "",
          text: section?.innerText || "",
          visible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
        };
      })()`);

      assert.equal(
        state.visible,
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review section`,
      );
      assert.equal(
        state.text.includes("Monthly Billing Month Grouping Review"),
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review title`,
      );
      assert.deepEqual(
        state.options.map((option) => option.label),
        [
          "Review Needed",
          "Account Reviewed",
          "Month Reviewed",
          "Counts Reviewed",
          "Grouping Reviewed",
          "Admin Reviewed",
          "Grouped Locally",
        ],
        `${viewport.label}: expected Monthly Billing Month Grouping Review local controls`,
      );
      assert.deepEqual(
        state.items.map((item) => item.label),
        [
          "Customer/account",
          "Billing month",
          "Ready trips count",
          "Blocked trips count",
          "Completed billing audit",
          "Total trips in month",
          "Month grouping status",
          "Admin review status",
          "Next action",
          "Local grouping note/status",
        ],
        `${viewport.label}: expected Monthly Billing Month Grouping Review rows`,
      );
      assert.equal(
        state.status,
        "Monthly billing month grouping review needed",
        `${viewport.label}: expected Monthly Billing Month Grouping Review to start at review needed`,
      );
      assert.equal(state.noteValue, "", `${viewport.label}: expected blank local month grouping note`);
      assert.equal(
        state.options.every((option) => option.height >= 36 && option.width >= 72),
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review controls to stay readable`,
      );
      assert.deepEqual(
        state.readControls.map((control) => [control.label, control.tag]),
        [
          ["Customer/account filter", "input"],
          ["Readiness filter", "select"],
          ["Groups per read", "select"],
        ],
        `${viewport.label}: expected Monthly Billing Month Grouping Review read filters`,
      );
      assert.equal(
        state.readControls.every((control) => control.height >= 36 && control.width >= 120),
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review read filters to stay readable`,
      );
      assert.deepEqual(
        state.pageButtons.map((button) => button.label),
        ["Previous", "Next"],
        `${viewport.label}: expected Monthly Billing Month Grouping Review pagination controls`,
      );
      assert.equal(
        state.pageButtons.every((button) => button.height >= 36 && button.width >= 72),
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review pagination controls to stay readable`,
      );
      assert.equal(
        state.pageSummary.includes("Page 1") || state.pageSummary.includes("No matching saved groups"),
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review page summary`,
      );
      assert.equal(
        state.boundary.includes("Guarded admin API read plus completed-booking billing-readiness audit") &&
          state.boundary.includes("monthly billing draft-plan") &&
          state.boundary.includes("invoice draft-prep") &&
          state.boundary.includes("item-review") &&
          state.boundary.includes("billable price review") &&
          state.boundary.includes("issue-review") &&
          state.boundary.includes("issue-record save, invoice-number reservation, and PDF-review readiness only.") &&
          state.boundary.includes("No direct Supabase write outside approved API routes") &&
          state.boundary.includes("invoice creation") &&
          state.boundary.includes("PDF generation") &&
          state.boundary.includes("PDF sending") &&
          state.boundary.includes("payment") &&
          state.boundary.includes("payout") &&
          state.boundary.includes("notification sending") &&
          state.boundary.includes("auth change") &&
          state.boundary.includes("parser change"),
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review read-only boundary`,
      );
      assert.equal(
        state.height <= (viewport.width < 340 ? 1640 : viewport.width < 640 ? 1540 : 1040),
        true,
        `${viewport.label}: expected compact Monthly Billing Month Grouping Review, got ${state.height}px`,
      );
      assert.equal(
        state.items.every((item) => item.height >= 48 && item.width >= 120),
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review rows to stay readable`,
      );
      assert.equal(
        state.noteHeight >= 40,
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review note to stay readable`,
      );
      assert.equal(
        state.docScrollWidth <= state.docClientWidth + 2,
        true,
        `${viewport.label}: expected Monthly Billing Month Grouping Review not to create horizontal overflow`,
      );
    };

    const checkManualExtraChargesBookingFields = async (viewport) => {
      const state = await evaluate(`(() => {
        const section = document.querySelector("[data-route-extras-child-seat-section='true']");
        const amount = section?.querySelector("[data-manual-extra-charges-amount='true']");
        const note = section?.querySelector("[data-manual-extra-charges-note='true']");
        const boundary = section?.querySelector("[data-manual-extra-charges-boundary='true']");
        const preview = document.querySelector("[data-manual-extra-charges-review-preview='true']");
        const amountRect = amount?.getBoundingClientRect();
        const noteRect = note?.getBoundingClientRect();
        const previewRect = preview?.getBoundingClientRect();
        const sectionRect = section?.getBoundingClientRect();

        return {
          amountLabel: amount?.closest("label")?.innerText.replace(/\\s+/g, " ").trim() || "",
          amountValue: amount?.value ?? null,
          amountVisible: Boolean(amountRect && amountRect.width > 0 && amountRect.height >= 40),
          boundaryText: boundary?.textContent.replace(/\\s+/g, " ").trim() || "",
          noteLabel: note?.closest("label")?.innerText.replace(/\\s+/g, " ").trim() || "",
          noteValue: note?.value ?? null,
          noteVisible: Boolean(noteRect && noteRect.width > 0 && noteRect.height >= 40),
          previewAmount:
            preview?.querySelector("[data-manual-extra-charges-review-amount='true']")?.textContent.trim() ||
            "",
          previewBoundary:
            preview?.querySelector("[data-manual-extra-charges-review-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          previewNote:
            preview?.querySelector("[data-manual-extra-charges-review-note='true']")?.textContent.trim() ||
            "",
          previewRight: Math.round(previewRect?.right || 0),
          previewText: preview?.innerText || "",
          previewVisible: Boolean(previewRect && previewRect.width > 0 && previewRect.height > 0),
          sectionText: section?.innerText || "",
          sectionVisible: Boolean(sectionRect && sectionRect.width > 0 && sectionRect.height > 0),
          sectionRight: Math.round(sectionRect?.right || 0),
          viewportWidth: document.documentElement.clientWidth,
        };
      })()`);

      assert.equal(
        state.sectionVisible,
        true,
        `${viewport.label}: expected Route Extras & Child Seat section to stay visible`,
      );
      assert.equal(
        state.sectionText.includes("Route Extras & Child Seat") &&
          state.amountLabel.includes("Extra Charges") &&
          state.noteLabel.includes("Extra Charges note / reason"),
        true,
        `${viewport.label}: expected manual Extra Charges amount and note in Route Extras & Child Seat`,
      );
      assert.equal(state.amountValue, "", `${viewport.label}: expected manual Extra Charges to default blank`);
      assert.equal(state.noteValue, "", `${viewport.label}: expected manual Extra Charges note to default blank`);
      assert.equal(state.amountVisible, true, `${viewport.label}: expected manual Extra Charges field to be touch-friendly`);
      assert.equal(state.noteVisible, true, `${viewport.label}: expected manual Extra Charges note to be touch-friendly`);
      assert.equal(
        state.previewVisible,
        true,
        `${viewport.label}: expected manual Extra Charges review preview to stay visible`,
      );
      assert.equal(state.previewAmount, "$0.00", `${viewport.label}: expected preview amount to default safely`);
      assert.equal(state.previewNote, "Blank", `${viewport.label}: expected preview note to default blank`);
      const normalizedPreviewText = state.previewText.toLowerCase();
      assert.equal(
        normalizedPreviewText.includes("manual extra charges") &&
          normalizedPreviewText.includes("manual extra charges note") &&
          state.previewBoundary.includes("Manual staff entry only") &&
          state.previewBoundary.includes("Not billed, not saved, no total calculated") &&
          state.previewBoundary.includes("No invoice") &&
          state.previewBoundary.includes("payment") &&
          state.previewBoundary.includes("PDF") &&
          state.previewBoundary.includes("payout") &&
          state.previewBoundary.includes("accounting") &&
          state.previewBoundary.includes("storage") &&
          state.previewBoundary.includes("API") &&
          state.previewBoundary.includes("Supabase") &&
          state.previewBoundary.includes("notification"),
        true,
        `${viewport.label}: expected manual Extra Charges review preview local-only boundary`,
      );
      assert.equal(
        state.boundaryText.includes("Manual staff entry only") &&
          state.boundaryText.includes("local UI field") &&
          state.boundaryText.includes("not included in totals") &&
          state.boundaryText.includes("invoice") &&
          state.boundaryText.includes("payment") &&
          state.boundaryText.includes("payout") &&
          state.boundaryText.includes("storage") &&
          state.boundaryText.includes("API") &&
          state.boundaryText.includes("Supabase") &&
          state.boundaryText.includes("notification"),
        true,
        `${viewport.label}: expected manual Extra Charges local-only boundary`,
      );
      assert.equal(
        state.sectionRight <= state.viewportWidth + 2,
        true,
        `${viewport.label}: expected manual Extra Charges section not to overflow`,
      );
      assert.equal(
        state.previewRight <= state.viewportWidth + 2,
        true,
        `${viewport.label}: expected manual Extra Charges review preview not to overflow`,
      );
    };

    const checkResponsiveRouteViewport = async (viewport, route) => {
      await setViewport(viewport);
      await evaluate(`window.__mobileUsabilityFetchCalls = []`);
      await navigate(new URL(route.path, appUrl).toString(), route.expectedText);
      const state = await layoutState();
      const adminPersistenceNetworkCalls = await evaluate(`window.__mobileUsabilityFetchCalls || []`);
      const adminHubVisible = await evaluate(`Boolean(document.querySelector("[data-admin-access-hub]"))`);
      const adminDispatchRecoveryReplacementReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-dispatch-recovery-replacement-readiness]"))`,
      );
      const adminPostRecoveryUpdateReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-post-recovery-update-readiness]"))`,
      );
      const adminDayOfTripCompletionHandoffVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-day-of-trip-completion-handoff]"))`,
      );
      const adminCompletedTripCloseoutReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-completed-trip-closeout-review]"))`,
      );
      const adminCloseoutToBillingPreparationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-closeout-to-billing-preparation-review]"))`,
      );
      const adminBillingPreparationExceptionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-billing-preparation-exception-review]"))`,
      );
      const adminBillingPreparationSummaryReadyReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-billing-preparation-summary-ready-review]"))`,
      );
      const adminMonthlyBillingQueueReadinessReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-monthly-billing-queue-readiness-review]"))`,
      );
      const adminMonthlyBillingQueueExceptionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-monthly-billing-queue-exception-review]"))`,
      );
      const adminMonthlyBillingMonthGroupingReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-monthly-billing-month-grouping-review]"))`,
      );
      const adminAppNotificationFeedVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-app-notification-feed]"))`,
      );
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
      const mockExtraChargesControlCenterVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-extra-charges-control-center]"))`,
      );
      const mockCompletedJobCloseoutCenterVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-completed-job-closeout-center]"))`,
      );
      const mockMonthEndCloseoutWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-month-end-closeout-workbench]"))`,
      );
      const mockFinanceExceptionResolutionWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-finance-exception-resolution-workbench]"))`,
      );
      const mockDriverJobCompletionExceptionIntakeWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-driver-job-completion-exception-intake-workbench]"))`,
      );
      const mockReplacementVehicleServiceRecoveryWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-replacement-vehicle-service-recovery-workbench]"))`,
      );
      const mockCustomerServiceRecoveryCommunicationWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-customer-service-recovery-communication-workbench]"))`,
      );
      const mockFleetDriverReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-fleet-driver-readiness-workbench]"))`,
      );
      const mockOperationsHandoverShiftBriefingWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-operations-handover-shift-briefing-workbench]"))`,
      );
      const mockCustomerAccountServiceProfileWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-customer-account-service-profile-workbench]"))`,
      );
      const mockBookingIntakeAccountMatchingWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-booking-intake-account-matching-workbench]"))`,
      );
      const mockAirportFlightPickupReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench]"))`,
      );
      const mockRouteItineraryReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-route-itinerary-readiness-workbench]"))`,
      );
      const mockDriverAssignmentDispatchReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench]"))`,
      );
      const mockBookingLifecycleAuditReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench]"))`,
      );
      const mockOperationsRiskSlaWatchlistWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench]"))`,
      );
      const mockQuotePricingReviewReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-quote-pricing-review-readiness-workbench]"))`,
      );
      const internalQaMockArchiveVisible = await evaluate(
        `Boolean(document.querySelector("[data-internal-qa-mock-archive]"))`,
      );
      const internalQaMockArchiveTextLeaks = await evaluate(
        `(() => {
          const text = document.body.innerText || "";
          const groupLabels = ${JSON.stringify(internalQaMockArchiveGroupLabels)};

          return [
            ${JSON.stringify(internalQaMockArchiveLabel)},
            ...groupLabels,
          ].filter((value) => text.includes(value));
        })()`,
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
            "extra charges control center",
            "consolidated extra charges qa",
            "manual staff entry only",
            "manual extra charges",
            "extra charges note / reason",
            "manual extra charge reason",
            "manual override mock only",
            "override reason mock only",
            "customer billing approved in mock review",
            "driver payout approved in mock review",
            "driver payout still reviewed separately",
            "dispatcher handoff pending",
            "driver payout reconciliation pending",
            "no real extra-charge workflow",
            "completed job closeout center",
            "internal/admin-only completed-job closeout preview",
            "completed jobs ready for closeout qa",
            "clean / extra-charge review / waived billing",
            "completion status",
            "closeout readiness",
            "customer billing readiness",
            "driver payout readiness",
            "finance/month-end handoff",
            "no real job closeout workflow",
            "completed-job persistence",
            "driver payout creation",
            "month-end closeout workbench",
            "internal/admin-only month-end grouping preview",
            "all mock accounts with completed jobs",
            "completed job closeout center rows grouped by account/month",
            "3 account/month groups maximum",
            "statement/invoice readiness",
            "customer billing blocked",
            "driver payout still pending review separately",
            "finance/month-end handoff blocked",
            "no real month-end closeout workflow",
            "monthly billing persistence",
            "finance export",
            "finance exception resolution workbench",
            "internal/admin-only finance exception preview",
            "month-end closeout workbench exception rows",
            "extra-charge evidence missing",
            "customer charge waived / payout still reviewed",
            "statement/invoice readiness blocked",
            "no exception saved",
            "no real finance exception workflow",
            "exception persistence",
            "driver job completion & exception intake workbench",
            "internal/admin-only driver completion and exception intake preview",
            "completed and exception driver jobs",
            "clean / proof pending / exception reported",
            "ots confirmed; pob confirmed",
            "proof/photo received in mock review",
            "proof/photo pending - not uploaded here",
            "driver exception reported",
            "late driver / car breakdown",
            "replacement vehicle needed - mock review only",
            "ready for completed-job closeout handoff",
            "no live location activated",
            "no proof/photo uploaded",
            "no driver acknowledgement sent",
            "no job completion saved",
            "no replacement car dispatch created",
            "no real driver job completion workflow",
            "ots/pob/completed persistence",
            "replacement vehicle dispatch",
            "replacement vehicle & service recovery workbench",
            "dispatch recovery / replacement readiness",
            "new driver job link readiness",
            "post-recovery update readiness",
            "customer eta/update status",
            "day-of-trip completion handoff",
            "customer closeout update readiness",
            "completed trip closeout review",
            "billing-readiness note reviewed",
            "closeout to billing preparation review",
            "customer/account billing readiness",
            "billing preparation exception review",
            "missing billing account",
            "billing preparation summary / ready review",
            "ready for monthly billing review",
            "monthly billing queue readiness review",
            "local queue note/status",
            "queued locally for monthly billing",
            "monthly billing queue exception review",
            "local exception note/status",
            "queue exception decision",
            "monthly billing month grouping review",
            "local grouping note/status",
            "grouped locally for monthly billing review",
            "internal/admin-only service recovery preview",
            "late driver / breakdown / missed job / replacement need",
            "driver exception and dispatcher escalation review",
            "3 recovery rows maximum",
            "car breakdown reported",
            "replacement vehicle identified - mock review only",
            "backup driver pending confirmation",
            "customer update needed",
            "dispatcher escalation in progress",
            "missed job / service recovery review",
            "no backup driver assigned",
            "no customer update sent",
            "job status persistence",
            "customer service recovery communication workbench",
            "internal/admin-only customer recovery communication preview",
            "late driver / replacement used / missed job recovery",
            "service recovery rows and customer impact review",
            "3 customer recovery rows maximum",
            "communication reference",
            "proposed customer update",
            "manager approval status",
            "goodwill/no-charge review status",
            "message-channel readiness",
            "delay update prepared - not sent",
            "replacement vehicle explanation prepared - not sent",
            "service recovery apology draft held - not sent",
            "goodwill/no-charge review pending",
            "no-charge review required before future closeout",
            "no message-channel delivery",
            "no customer notification sent",
            "no goodwill credit created",
            "no no-charge billing decision saved",
            "no invoice adjusted",
            "no real customer update sending",
            "no-charge billing decision persistence",
            "invoice adjustment",
            "fleet & driver readiness workbench",
            "internal/admin-only fleet and driver readiness preview",
            "drivers, vehicles, schedule conflicts, backup coverage",
            "mock operations readiness review before dispatch",
            "3 fleet/driver readiness rows maximum",
            "readiness reference",
            "driver readiness status",
            "vehicle readiness status",
            "schedule conflict status",
            "maintenance/documentation status",
            "backup coverage status",
            "dispatch readiness",
            "driver ready for dispatch review",
            "vehicle documentation check pending",
            "backup vehicle watch needed",
            "driver schedule conflict risk",
            "backup driver review needed",
            "no driver assigned",
            "no vehicle assigned",
            "no schedule changed",
            "no dispatch record created",
            "no maintenance record created",
            "no real fleet scheduling workflow",
            "fleet tracking",
            "schedule update",
            "maintenance record",
            "dispatch workflow",
            "operations handover & shift briefing workbench",
            "internal/admin-only shift handover and daily briefing preview",
            "today shift handover / daily operations briefing",
            "mock cross-workbench operations review",
            "3 handover rows maximum",
            "handover reference",
            "shift / handover window",
            "priority area",
            "owner / next shift assignee",
            "customer impact",
            "driver/fleet impact",
            "finance/closeout impact",
            "handover readiness",
            "vip airport job confirmed",
            "manager/customer update review pending",
            "evidence pending before billing handoff",
            "no shift handover saved",
            "no job status changed",
            "no real operations handover workflow",
            "shift scheduling workflow",
            "customer account & service profile workbench",
            "internal/admin-only regular customer/account service profile preview",
            "regular customer/account service profiles",
            "mock service preference and billing-readiness review",
            "3 account rows maximum",
            "primary booker/contact",
            "billing contact readiness",
            "service preference summary",
            "usual service pattern",
            "vip/special handling notes",
            "monthly billing readiness",
            "open operations note",
            "internal review status",
            "billing contact confirmed",
            "billing contact needs confirmation",
            "no customer profile saved",
            "no crm/account record created",
            "no billing contact saved",
            "no monthly billing activated",
            "no real customer account/profile workflow",
            "crm record creation",
            "billing contact persistence",
            "monthly billing activation",
            "booking intake quality & account matching workbench",
            "internal/admin-only booking intake quality and customer/account matching preview",
            "mock parser/manual review and dispatcher intake qa",
            "3 booking intake rows maximum",
            "plo-intake-match-ubs",
            "plo-intake-manual-personal",
            "plo-intake-missing-detail",
            "ubs matched from organization domain ubs.com",
            "public/personal email domain - no company/account created",
            "prestige transport ignored as own company",
            "parser/manual review required - no parser change made",
            "manual account review separate from parser behavior",
            "drop-off or flight detail incomplete",
            "dispatch handoff ready in mock review",
            "dispatch handoff blocked in mock review",
            "no parser change",
            "mock only. no parser change, no booking saved, no account linked",
            "no account linked",
            "no customer/contact record created",
            "no dispatch job created",
            "no parser behavior changes",
            "parser test changes",
            "customer/account matching workflow",
            "booking save/load behavior",
            "account linking",
            "dispatch job creation",
            "airport flight monitoring & pickup readiness workbench",
            "internal/admin-only airport pickup readiness preview",
            "mock dispatcher airport timing and fbo review",
            "3 airport pickup rows maximum",
            "plo-air-ready-changi-arr",
            "plo-air-ready-changi-dep",
            "plo-air-ready-seletar-fbo",
            "flight/tail number",
            "scheduled pickup window",
            "driver staging status",
            "meet-and-greet readiness",
            "seletar airport / wssl / jet aviation fbo",
            "private-jet airport location",
            "not converted to changi",
            "no flight api connected",
            "no live flight tracking activated",
            "no maps or traffic api connected",
            "no airport/fbo confirmation sent",
            "no real flight api behavior",
            "maps/traffic api behavior",
            "airport/fbo confirmation sending",
            "route & itinerary readiness workbench",
            "internal/admin-only route and itinerary readiness preview",
            "mock dispatcher route and itinerary review",
            "3 route/itinerary rows maximum",
            "plo-route-ready-airport",
            "plo-route-ready-multistop",
            "plo-route-ready-vip-child",
            "route readiness reference",
            "pickup readiness",
            "drop-off readiness",
            "route/waypoint summary",
            "timing readiness",
            "passenger/contact readiness",
            "special handling/child seat note",
            "route exception risk",
            "dispatch handoff readiness",
            "ritz-carlton > gardens by the bay > national gallery > raffles hotel",
            "preserve all later waypoints",
            "extra stops shown as itinerary context only",
            "child seat note pending final confirmation",
            "no route optimization",
            "no maps or geocoding api connected",
            "no traffic api connected",
            "no real route optimization behavior",
            "maps/geocoding/traffic api behavior",
            "driver assignment & dispatch readiness workbench",
            "internal/admin-only driver assignment and dispatch readiness preview",
            "mock dispatcher driver/vehicle pairing review",
            "3 driver assignment rows maximum",
            "plo-disp-ready-airport",
            "plo-disp-ready-vip-hourly",
            "plo-disp-ready-transfer-hold",
            "dispatch readiness reference",
            "proposed driver/vehicle pairing",
            "proposed driver: kumar tan",
            "proposed driver: lee wei",
            "proposed driver: siva kumar",
            "proposed vehicle/plate",
            "driver contact readiness",
            "driver acknowledgement readiness",
            "schedule overlap risk",
            "customer update readiness",
            "schedule overlap warning only",
            "dispatcher may intentionally assign same driver",
            "warning without blocking or hiding drivers",
            "customer update not prepared - no message sent",
            "no driver assigned, no vehicle assigned",
            "no driver acknowledgement sent",
            "no schedule changed",
            "no real driver assignment",
            "driver acknowledgement behavior",
            "booking lifecycle timeline & internal audit readiness workbench",
            "internal/admin-only booking lifecycle timeline",
            "mock dispatcher/admin lifecycle timeline",
            "3 lifecycle rows maximum",
            "plo-life-audit-airport",
            "plo-life-audit-vip-multi",
            "plo-life-audit-recovery",
            "lifecycle reference",
            "current lifecycle stage",
            "intake/account status",
            "route/itinerary status",
            "driver assignment status",
            "dispatch/customer update status",
            "completion/closeout status",
            "service recovery/exception status",
            "internal audit readiness",
            "audit readiness mock-ready",
            "no audit trail created",
            "no booking lifecycle saved",
            "no real booking lifecycle workflow",
            "audit trail creation",
            "audit logging",
            "operations risk & sla watchlist workbench",
            "internal/admin-only operations risk and sla watchlist",
            "mock dispatcher/admin risk desk",
            "3 risk watchlist rows maximum",
            "plo-risk-sla-vip-airport",
            "plo-risk-sla-recovery-update",
            "plo-risk-sla-finance-closeout",
            "risk reference",
            "sla/timing window",
            "risk severity",
            "owner/responsible desk",
            "customer / fleet impact",
            "closeout/finance impact",
            "vip airport pickup timing watch",
            "customer update risk after service recovery",
            "finance/closeout evidence risk",
            "customer update readiness pending",
            "exception evidence pending",
            "no sla alert created",
            "no risk task saved",
            "no real sla alerting workflow",
            "operations risk workflow",
            "sla alerting",
            "quote & pricing review readiness workbench",
            "internal/admin-only quote and pricing review readiness",
            "mock dispatcher/admin quote desk",
            "3 quote/pricing rows maximum",
            "plo-quote-ready-corp-airport",
            "plo-quote-ready-vip-hourly",
            "plo-quote-ready-recovery-nocharge",
            "quote review reference",
            "rate/price basis",
            "quoted amount status",
            "manual extra charge review",
            "discount/goodwill review",
            "approval readiness",
            "margin/risk note",
            "customer quote handoff readiness",
            "quoted amount ready - display-only",
            "manual extra charge note present",
            "goodwill/no-charge review pending",
            "customer quote handoff blocked",
            "no quote sent",
            "no quoted amount saved",
            "no pricing calculation created",
            "no real quote workflow",
            "pricing automation",
            "quote automation",
          ].filter((value) => text.includes(value));
        })()`,
      );

      assertNoHorizontalOverflow(state, `${viewport.label} ${route.label}`);
      assert.equal(
        state.visibleText.includes(route.expectedText),
        true,
        `${viewport.label} ${route.label}: expected important section text to remain visible`,
      );
      if (route.expectedMobileWebText) {
        assert.equal(
          state.visibleText.includes(route.expectedMobileWebText),
          true,
          `${viewport.label} ${route.label}: expected mobile-web route guidance`,
        );
      }
      assertNoMobileNativeAppOnlyLanguage(state.visibleText, `${viewport.label} ${route.label}`);
      if (route.path === "/book" || route.path === "/my-bookings") {
        assertNoMobileCustomerFacingPriceLeaks(
          state.visibleText,
          `${viewport.label} ${route.label}`,
        );
      }
      assertNoMobileAdminBookingPersistenceLeaks(state.visibleText, `${viewport.label} ${route.label}`);
      assertNoMobileAdminPersistenceNetworkCalls(
        adminPersistenceNetworkCalls,
        `${viewport.label} ${route.label}`,
      );
      assert.equal(adminHubVisible, false, `${viewport.label} ${route.label}: expected no admin access hub`);
      assert.equal(
        adminDispatchRecoveryReplacementReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin dispatch recovery replacement readiness`,
      );
      assert.equal(
        adminPostRecoveryUpdateReadinessVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin post-recovery update readiness`,
      );
      assert.equal(
        adminDayOfTripCompletionHandoffVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin day-of-trip completion handoff`,
      );
      assert.equal(
        adminCompletedTripCloseoutReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin completed trip closeout review`,
      );
      assert.equal(
        adminCloseoutToBillingPreparationReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin closeout to billing preparation review`,
      );
      assert.equal(
        adminBillingPreparationExceptionReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin billing preparation exception review`,
      );
      assert.equal(
        adminBillingPreparationSummaryReadyReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin billing preparation summary ready review`,
      );
      assert.equal(
        adminMonthlyBillingQueueReadinessReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin monthly billing queue readiness review`,
      );
      assert.equal(
        adminMonthlyBillingQueueExceptionReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin monthly billing queue exception review`,
      );
      assert.equal(
        adminMonthlyBillingMonthGroupingReviewVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin monthly billing month grouping review`,
      );
      assert.equal(
        adminAppNotificationFeedVisible,
        false,
        `${viewport.label} ${route.label}: expected no admin app notification feed`,
      );
      assert.equal(
        internalQaMockArchiveVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal QA mock archive`,
      );
      assert.deepEqual(
        internalQaMockArchiveTextLeaks,
        [],
        `${viewport.label} ${route.label}: expected no internal QA mock archive text`,
      );
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
      assert.equal(
        mockExtraChargesControlCenterVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock extra charges control center`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock completed job closeout center`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock month-end closeout workbench`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock finance exception resolution workbench`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock driver job completion exception intake workbench`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock replacement vehicle service recovery workbench`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock customer service recovery communication workbench`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock fleet driver readiness workbench`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock operations handover shift briefing workbench`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock customer account service profile workbench`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock booking intake account matching workbench`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock airport flight pickup readiness workbench`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock route itinerary readiness workbench`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock driver assignment dispatch readiness workbench`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock booking lifecycle audit readiness workbench`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock operations risk SLA watchlist workbench`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${route.label}: expected no internal mock quote pricing review readiness workbench`,
      );
      assert.deepEqual(
        mockExtraChargesVarianceApprovalReconciliationTextLeaks,
        [],
        `${viewport.label} ${route.label}: expected no internal extra charges, finance, driver completion, replacement recovery, customer recovery communication, fleet readiness, operations handover, customer account profile, booking intake, airport readiness, route itinerary, driver assignment dispatch, booking lifecycle audit, operations risk SLA, or quote pricing review text leak`,
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

      const internalQaMockArchiveDefaultState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const archive = document.querySelector("[data-internal-qa-mock-archive]");
            const toggle = document.querySelector("[data-internal-qa-mock-archive-toggle]");
            const text = document.body.innerText || "";
            const toggleRect = toggle?.getBoundingClientRect();
            const groupLabels = ${JSON.stringify(internalQaMockArchiveGroupLabels)};

            if (!archive || !toggle) {
              return false;
            }

            return {
              archiveOpen: toggle.getAttribute("aria-expanded") === "true",
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              groupLabelLeaks: groupLabels.filter((label) => text.includes(label)),
              labelVisible: text.includes(${JSON.stringify(internalQaMockArchiveLabel)}),
              productionVisible:
                ${JSON.stringify(appTabs)}.every((label) =>
                  [...document.querySelectorAll("button[role='tab']")].some(
                    (button) => button.textContent.trim() === label,
                  ),
                ) &&
                (
                  (
                    text.includes("Operations Dashboard") &&
                    text.includes("Urgent Booking Requests") &&
                    text.includes("Today's Jobs")
                  ) ||
                  (
                    text.includes("Dispatcher Intake") &&
                    text.includes("Job Card Preview") &&
                    text.includes("Driver Dispatch")
                  )
                ),
              toggleHeight: Math.round(toggleRect?.height || 0),
              toggleWidth: Math.round(toggleRect?.width || 0),
            };
          })()`),
        10000,
        `${viewport.label} internal QA mock archive default`,
      );
      assert.equal(
        internalQaMockArchiveDefaultState.archiveOpen,
        false,
        `${viewport.label}: expected internal QA mock archive collapsed by default`,
      );
      assert.equal(
        internalQaMockArchiveDefaultState.labelVisible,
        true,
        `${viewport.label}: expected internal QA mock archive label on admin dashboard`,
      );
      assert.deepEqual(
        internalQaMockArchiveDefaultState.groupLabelLeaks,
        [],
        `${viewport.label}: expected archive group labels hidden before opening archive`,
      );
      assert.equal(
        internalQaMockArchiveDefaultState.productionVisible,
        true,
        `${viewport.label}: expected operational admin content visible before opening archive`,
      );
      assert.equal(
        internalQaMockArchiveDefaultState.toggleHeight >= 44 && internalQaMockArchiveDefaultState.toggleWidth >= 240,
        true,
        `${viewport.label}: expected archive summary to be touch-friendly`,
      );
      assert.equal(
        internalQaMockArchiveDefaultState.docScrollWidth <= internalQaMockArchiveDefaultState.docClientWidth + 2,
        true,
        `${viewport.label}: expected collapsed archive not to create horizontal overflow`,
      );

      const internalQaMockArchiveOpenState = await waitForCondition(
        () =>
          evaluate(`(() => {
        const toggle = document.querySelector("[data-internal-qa-mock-archive-toggle]");
        if (!toggle) {
          return false;
        }

        if (toggle.getAttribute("aria-expanded") !== "true") {
          toggle.click();
          return false;
        }

        const text = document.body.innerText || "";
        const groupLabels = ${JSON.stringify(internalQaMockArchiveGroupLabels)};

        return {
          archiveOpen: toggle.getAttribute("aria-expanded") === "true",
          docClientWidth: document.documentElement.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          groupLabelsVisible: groupLabels.filter((label) => text.includes(label)),
        };
      })()`),
        10000,
        `${viewport.label} internal QA mock archive open`,
      );
      assert.equal(
        internalQaMockArchiveOpenState.archiveOpen,
        true,
        `${viewport.label}: expected internal QA mock archive to open inside admin dashboard`,
      );
      assert.deepEqual(
        internalQaMockArchiveOpenState.groupLabelsVisible,
        internalQaMockArchiveGroupLabels,
        `${viewport.label}: expected archive grouping labels after opening archive`,
      );
      assert.equal(
        internalQaMockArchiveOpenState.docScrollWidth <= internalQaMockArchiveOpenState.docClientWidth + 2,
        true,
        `${viewport.label}: expected opened archive not to create horizontal overflow`,
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

      const mockExtraChargesControlCenterState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const review = document.querySelector("[data-mock-extra-charges-control-center]");
            if (!group || !dashboard || !review) {
              return false;
            }

            const legacySelectors = [
              "[data-mock-waiting-time-extra-charges-planning-review]",
              "[data-mock-extra-charges-variance-approval-reconciliation-review]",
              "[data-mock-midnight-charge-auto-detection-override-review]",
              "[data-mock-combined-extra-charges-summary-separation-review]",
              "[data-mock-extra-charges-approval-decision-separation-review]",
            ];
            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-extra-charges-control-center-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-extra-charges-control-center-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const detectionRows = [
              ...review.querySelectorAll("[data-mock-extra-charges-control-center-detection-row]"),
            ].map((row) => ({
              key: row.getAttribute("data-mock-extra-charges-control-center-detection-row") || "",
              text: row.textContent.replace(/\\s+/g, " ").trim(),
            }));
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-extra-charges-control-center-column]")].map(
                  (column) => column.getAttribute("data-mock-extra-charges-control-center-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: review.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-extra-charges-control-center-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: review.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              detectionRows,
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              generation:
                document.querySelector("[data-mock-extra-charges-control-center-generation]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              legacyVisibleSelectors: legacySelectors.filter((selector) => document.querySelector(selector)),
              modeValue: review.querySelector("[data-mock-midnight-charge-override-mode]")?.value || "",
              previewStatus:
                review.querySelector("[data-mock-midnight-charge-override-preview-status]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              reasonValue: review.querySelector("[data-mock-midnight-charge-override-reason]")?.value || "",
              rows,
              rules:
                document.querySelector("[data-mock-extra-charges-control-center-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              separation:
                document.querySelector("[data-mock-extra-charges-control-center-separation]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock extra charges control center`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.groupTop >= mockExtraChargesControlCenterState.dashboardBottom,
        true,
        `${viewport.label}: expected extra charges control center to remain in bottom mock workflow group`,
      );
      assert.deepEqual(
        mockExtraChargesControlCenterState.legacyVisibleSelectors,
        [],
        `${viewport.label}: expected old extra-charge QA strips to be consolidated out of the rendered dashboard`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.text.toLowerCase().includes("extra charges control center") &&
          mockExtraChargesControlCenterState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected consolidated extra charges control center`,
      );
      assert.deepEqual(
        mockExtraChargesControlCenterState.columns,
        [
          "Charge type",
          "Display group",
          "Customer charge rule",
          "Driver payout rule",
          "Detection / review status",
          "Billing decision",
          "Payout decision",
          "Dispatcher handoff / reconciliation status",
          "Internal separation status",
          "Next internal action",
        ],
        `${viewport.label}: expected consolidated control center columns`,
      );
      const controlRowsByType = Object.fromEntries(
        mockExtraChargesControlCenterState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        controlRowsByType["Waiting Time"].includes("Extra Charges") &&
          controlRowsByType["Waiting Time"].includes("$15 customer per 15-minute waiting block") &&
          controlRowsByType["Waiting Time"].includes("$10 driver per 15-minute waiting block") &&
          controlRowsByType["Waiting Time"].includes("Waiting Time source stays separate") &&
          controlRowsByType["Extra Stops"].includes("Extra Charges") &&
          controlRowsByType["Extra Stops"].includes("Extra Stops source stays separate") &&
          controlRowsByType["Midnight Charge"].includes("Extra Charges") &&
          controlRowsByType["Midnight Charge"].includes("$15 customer midnight charge") &&
          controlRowsByType["Midnight Charge"].includes("$10 driver midnight payout") &&
          controlRowsByType["Midnight Charge"].includes("Driver payout still reviewed separately"),
        true,
        `${viewport.label}: expected all consolidated charge rows under Extra Charges with separation`,
      );
      const detectionRowsByTime = Object.fromEntries(
        mockExtraChargesControlCenterState.detectionRows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        detectionRowsByTime["23:00"].includes("Detected") &&
          detectionRowsByTime["06:59"].includes("Detected") &&
          detectionRowsByTime["07:00"].includes("Not detected") &&
          detectionRowsByTime["22:59"].includes("Not detected"),
        true,
        `${viewport.label}: expected protected midnight detection boundaries in control center`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.rules.includes("1 waiting block = 15 minutes") &&
          mockExtraChargesControlCenterState.rules.includes("customer waiting charge $15 per waiting block") &&
          mockExtraChargesControlCenterState.rules.includes("driver waiting payout $10 per waiting block") &&
          mockExtraChargesControlCenterState.rules.includes("Midnight Charge: customer charge $15") &&
          mockExtraChargesControlCenterState.rules.includes("11:00pm / 23:00 through 6:59am / 06:59 inclusive") &&
          mockExtraChargesControlCenterState.rules.includes("7:00am / 07:00") &&
          mockExtraChargesControlCenterState.rules.includes("10:59pm / 22:59 are excluded"),
        true,
        `${viewport.label}: expected waiting-time and midnight locked rules in control center`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.separation.includes("under Extra Charges") &&
          mockExtraChargesControlCenterState.separation.includes("each charge type remains internally distinct") &&
          mockExtraChargesControlCenterState.separation.includes(
            "Customer billing approval and driver payout approval are separate decisions",
          ) &&
          mockExtraChargesControlCenterState.separation.includes(
            "waived customer charge does not automatically cancel driver payout review",
          ),
        true,
        `${viewport.label}: expected display grouping and decision separation in control center`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.generation.includes("No real extra-charge workflow") &&
          mockExtraChargesControlCenterState.generation.includes("approval workflow") &&
          mockExtraChargesControlCenterState.generation.includes("combined charge calculation") &&
          mockExtraChargesControlCenterState.generation.includes("invoice") &&
          mockExtraChargesControlCenterState.generation.includes("payment link") &&
          mockExtraChargesControlCenterState.generation.includes("PDF") &&
          mockExtraChargesControlCenterState.generation.includes("payout") &&
          mockExtraChargesControlCenterState.generation.includes("accounting posting") &&
          mockExtraChargesControlCenterState.generation.includes("finance export") &&
          mockExtraChargesControlCenterState.boundary.includes("save/load behavior") &&
          mockExtraChargesControlCenterState.boundary.includes("localStorage") &&
          mockExtraChargesControlCenterState.boundary.includes("sessionStorage") &&
          mockExtraChargesControlCenterState.boundary.includes("cookies") &&
          mockExtraChargesControlCenterState.boundary.includes("IndexedDB") &&
          mockExtraChargesControlCenterState.boundary.includes("API call") &&
          mockExtraChargesControlCenterState.boundary.includes("fetch") &&
          mockExtraChargesControlCenterState.boundary.includes("XHR") &&
          mockExtraChargesControlCenterState.boundary.includes("sendBeacon") &&
          mockExtraChargesControlCenterState.boundary.includes("WebSocket") &&
          mockExtraChargesControlCenterState.boundary.includes("Supabase") &&
          mockExtraChargesControlCenterState.boundary.includes("customer notification"),
        true,
        `${viewport.label}: expected control center no persistence/storage/API boundary`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.modeValue,
        "auto",
        `${viewport.label}: expected mock midnight override mode to default to auto`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.reasonValue,
        "",
        `${viewport.label}: expected mock midnight Override Reason to be blank by default`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.previewStatus.includes("mock only") ||
          mockExtraChargesControlCenterState.previewStatus.includes("Mock Only"),
        true,
        `${viewport.label}: expected mock-only midnight override preview`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.actionControlCount,
        0,
        `${viewport.label}: expected extra charges control center to have no action controls`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.controlCount,
        2,
        `${viewport.label}: expected only local mock override select/input controls`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.rows.length,
        3,
        `${viewport.label}: expected three consolidated charge rows`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.detectionRows.length,
        4,
        `${viewport.label}: expected four midnight detection examples`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.height <=
          (viewport.width < 640 ? 1950 : viewport.width < 1024 ? 1180 : viewport.width < 1200 ? 980 : 880),
        true,
        `${viewport.label}: expected compact extra charges control center, got ${mockExtraChargesControlCenterState.height}px`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.rows.every((row) => row.height >= 28 && row.width >= 240),
        true,
        `${viewport.label}: expected extra charges control center rows to stay readable`,
      );
      assert.equal(
        mockExtraChargesControlCenterState.docScrollWidth <=
          mockExtraChargesControlCenterState.docClientWidth + 2,
        true,
        `${viewport.label}: expected extra charges control center not to create horizontal overflow`,
      );

      const legacyExtraChargeQaStripsVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-waiting-time-extra-charges-planning-review]"))`,
      );
      if (legacyExtraChargeQaStripsVisible) {
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
      }

      const mockCompletedJobCloseoutCenterState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const controlCenter = document.querySelector("[data-mock-extra-charges-control-center]");
            const review = document.querySelector("[data-mock-completed-job-closeout-center]");
            if (!group || !dashboard || !controlCenter || !review) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const controlCenterRect = controlCenter.getBoundingClientRect();
            const rect = review.getBoundingClientRect();
            const rows = [...review.querySelectorAll("[data-mock-completed-job-closeout-center-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-completed-job-closeout-center-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...review.querySelectorAll("[data-mock-completed-job-closeout-center-column]")].map(
                  (column) => column.getAttribute("data-mock-completed-job-closeout-center-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: review.querySelectorAll("button, a, form").length,
              controlCenterBottom: Math.round(controlCenterRect.bottom),
              boundary:
                document.querySelector("[data-mock-completed-job-closeout-center-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: review.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              decision:
                document.querySelector("[data-mock-completed-job-closeout-center-decision]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              rows,
              rule:
                document.querySelector("[data-mock-completed-job-closeout-center-rule]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              searchSummary:
                document.querySelector("[data-mock-completed-job-closeout-center-search-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              separation:
                document.querySelector("[data-mock-completed-job-closeout-center-separation]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              text: review.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock completed job closeout center`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.groupTop >= mockCompletedJobCloseoutCenterState.dashboardBottom,
        true,
        `${viewport.label}: expected completed job closeout center to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.sectionTop >= mockCompletedJobCloseoutCenterState.controlCenterBottom,
        true,
        `${viewport.label}: expected completed job closeout center after extra charges control center`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.text.toLowerCase().includes("completed job closeout center") &&
          mockCompletedJobCloseoutCenterState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected completed job closeout center heading`,
      );
      assert.deepEqual(
        mockCompletedJobCloseoutCenterState.columns,
        [
          "Job reference customer service",
          "Completion status closeout readiness",
          "Extra charges status",
          "Customer billing and driver payout readiness",
          "Dispatcher exception and finance handoff status",
          "Next internal action",
        ],
        `${viewport.label}: expected completed job closeout workflow columns`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.searchSummary.includes("Completed jobs ready for closeout QA") &&
          mockCompletedJobCloseoutCenterState.searchSummary.includes("Clean / extra-charge review / waived billing") &&
          mockCompletedJobCloseoutCenterState.searchSummary.includes("3 completed jobs maximum") &&
          mockCompletedJobCloseoutCenterState.searchSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only search summary`,
      );
      const closeoutRowsByRef = Object.fromEntries(
        mockCompletedJobCloseoutCenterState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        closeoutRowsByRef["PLO-CLOSE-101"].includes("Completed cleanly") &&
          closeoutRowsByRef["PLO-CLOSE-101"].includes("Customer billing ready") &&
          closeoutRowsByRef["PLO-CLOSE-101"].includes("Driver payout ready") &&
          closeoutRowsByRef["PLO-CLOSE-118"].includes("Waiting Time 2 blocks") &&
          closeoutRowsByRef["PLO-CLOSE-118"].includes("Extra Stops 1") &&
          closeoutRowsByRef["PLO-CLOSE-118"].includes("Driver payout review pending") &&
          closeoutRowsByRef["PLO-CLOSE-207"].includes("Customer charge waived in mock example") &&
          closeoutRowsByRef["PLO-CLOSE-207"].includes("Driver payout still under review separately") &&
          closeoutRowsByRef["PLO-CLOSE-207"].includes("Midnight Charge detected"),
        true,
        `${viewport.label}: expected clean, extra-charge review, and waived-charge closeout rows`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.separation.includes(
          "Waiting Time, Extra Stops, and Midnight Charge may display together",
        ) &&
          mockCompletedJobCloseoutCenterState.separation.includes("under Extra Charges") &&
          mockCompletedJobCloseoutCenterState.separation.includes(
            "each charge type remains internally distinct",
          ) &&
          mockCompletedJobCloseoutCenterState.decision.includes(
            "Customer billing approval and driver payout approval are separate decisions",
          ) &&
          mockCompletedJobCloseoutCenterState.decision.includes(
            "Waived customer charge does not automatically cancel driver payout review",
          ),
        true,
        `${viewport.label}: expected closeout charge separation and billing/payout decision rules`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.rule.includes("1 waiting block = 15 minutes") &&
          mockCompletedJobCloseoutCenterState.rule.includes("customer charge $15 per waiting block") &&
          mockCompletedJobCloseoutCenterState.rule.includes("driver payout $10 per waiting block") &&
          mockCompletedJobCloseoutCenterState.rule.includes("Midnight Charge: customer charge $15") &&
          mockCompletedJobCloseoutCenterState.rule.includes("11:00pm / 23:00 through 6:59am / 06:59 inclusive") &&
          mockCompletedJobCloseoutCenterState.rule.includes(
            "7:00am / 07:00 and 10:59pm / 22:59 are excluded",
          ),
        true,
        `${viewport.label}: expected closeout waiting-time and midnight locked rules`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.decision.includes("No invoice generated") &&
          mockCompletedJobCloseoutCenterState.decision.includes("no payment link created") &&
          mockCompletedJobCloseoutCenterState.decision.includes("no PDF generated") &&
          mockCompletedJobCloseoutCenterState.decision.includes("no payout created") &&
          mockCompletedJobCloseoutCenterState.decision.includes("no accounting posting") &&
          mockCompletedJobCloseoutCenterState.decision.includes("not saved") &&
          mockCompletedJobCloseoutCenterState.boundary.includes("No real job closeout workflow") &&
          mockCompletedJobCloseoutCenterState.boundary.includes("completed-job persistence") &&
          mockCompletedJobCloseoutCenterState.boundary.includes("API call") &&
          mockCompletedJobCloseoutCenterState.boundary.includes("storage") &&
          mockCompletedJobCloseoutCenterState.boundary.includes("Supabase") &&
          mockCompletedJobCloseoutCenterState.boundary.includes("parser file changes") &&
          mockCompletedJobCloseoutCenterState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected closeout no invoice/payment/PDF/payout/accounting/storage/API boundary`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.actionControlCount,
        0,
        `${viewport.label}: expected completed job closeout center to have no action controls`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.controlCount,
        0,
        `${viewport.label}: expected completed job closeout center to have no form controls`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.rows.length,
        3,
        `${viewport.label}: expected three completed job closeout rows`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.height <=
          (viewport.width < 640 ? 1550 : viewport.width < 1024 ? 900 : viewport.width < 1200 ? 840 : 760),
        true,
        `${viewport.label}: expected compact completed job closeout center, got ${mockCompletedJobCloseoutCenterState.height}px`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected completed job closeout rows to stay readable`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterState.docScrollWidth <=
          mockCompletedJobCloseoutCenterState.docClientWidth + 2,
        true,
        `${viewport.label}: expected completed job closeout center not to create horizontal overflow`,
      );

      const mockMonthEndCloseoutWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const closeoutCenter = document.querySelector("[data-mock-completed-job-closeout-center]");
            const workbench = document.querySelector("[data-mock-month-end-closeout-workbench]");
            if (!group || !dashboard || !closeoutCenter || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const closeoutRect = closeoutCenter.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-month-end-closeout-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-month-end-closeout-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-month-end-closeout-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-month-end-closeout-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-month-end-closeout-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              closeoutBottom: Math.round(closeoutRect.bottom),
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              decision:
                document.querySelector("[data-mock-month-end-closeout-workbench-decision]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-month-end-closeout-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              rows,
              rule:
                document.querySelector("[data-mock-month-end-closeout-workbench-rule]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              separation:
                document.querySelector("[data-mock-month-end-closeout-workbench-separation]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock month-end closeout workbench`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.groupTop >= mockMonthEndCloseoutWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected month-end closeout workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.sectionTop >= mockMonthEndCloseoutWorkbenchState.closeoutBottom,
        true,
        `${viewport.label}: expected month-end closeout workbench after completed job closeout center`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.text.toLowerCase().includes("month-end closeout workbench") &&
          mockMonthEndCloseoutWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected month-end closeout workbench heading`,
      );
      assert.deepEqual(
        mockMonthEndCloseoutWorkbenchState.columns,
        [
          "Closeout month customer account completed jobs count",
          "Billing readiness driver payout readiness",
          "Exception count status",
          "Extra charges review status",
          "Finance month-end handoff status statement invoice readiness",
          "Next internal action",
        ],
        `${viewport.label}: expected month-end closeout workflow columns`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.filterSummary.includes("May 2026") &&
          mockMonthEndCloseoutWorkbenchState.filterSummary.includes("All mock accounts with completed jobs") &&
          mockMonthEndCloseoutWorkbenchState.filterSummary.includes(
            "Completed Job Closeout Center rows grouped by account/month",
          ) &&
          mockMonthEndCloseoutWorkbenchState.filterSummary.includes("3 account/month groups maximum") &&
          mockMonthEndCloseoutWorkbenchState.filterSummary.includes("display-only"),
        true,
        `${viewport.label}: expected compact display-only month/account filter summary`,
      );
      const workbenchRowsByRef = Object.fromEntries(
        mockMonthEndCloseoutWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        workbenchRowsByRef["PLO-ME-2026-05-UBS"].includes("18 completed jobs") &&
          workbenchRowsByRef["PLO-ME-2026-05-UBS"].includes("Customer billing ready") &&
          workbenchRowsByRef["PLO-ME-2026-05-UBS"].includes("Driver payout handoff ready") &&
          workbenchRowsByRef["PLO-ME-2026-05-RITZ"].includes("Customer billing blocked") &&
          workbenchRowsByRef["PLO-ME-2026-05-RITZ"].includes("Waiting Time 2 blocks") &&
          workbenchRowsByRef["PLO-ME-2026-05-RITZ"].includes("Extra Stops 1") &&
          workbenchRowsByRef["PLO-ME-2026-05-RITZ"].includes("Statement/invoice readiness not ready") &&
          workbenchRowsByRef["PLO-ME-2026-05-VIP"].includes("Customer charge waived in mock month-end example") &&
          workbenchRowsByRef["PLO-ME-2026-05-VIP"].includes("Driver payout still pending review separately") &&
          workbenchRowsByRef["PLO-ME-2026-05-VIP"].includes("Midnight Charge detected"),
        true,
        `${viewport.label}: expected ready, blocked, and waived-charge month-end rows`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.separation.includes(
          "Waiting Time, Extra Stops, and Midnight Charge may display",
        ) &&
          mockMonthEndCloseoutWorkbenchState.separation.includes("under Extra Charges") &&
          mockMonthEndCloseoutWorkbenchState.separation.includes("each charge type remains internally distinct") &&
          mockMonthEndCloseoutWorkbenchState.decision.includes(
            "Customer billing approval and driver payout approval are separate decisions",
          ) &&
          mockMonthEndCloseoutWorkbenchState.decision.includes(
            "Waived customer charge does not automatically cancel driver payout review",
          ),
        true,
        `${viewport.label}: expected month-end charge separation and billing/payout decision rules`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.rule.includes("1 waiting block = 15 minutes") &&
          mockMonthEndCloseoutWorkbenchState.rule.includes("customer charge $15 per waiting block") &&
          mockMonthEndCloseoutWorkbenchState.rule.includes("driver payout $10 per waiting block") &&
          mockMonthEndCloseoutWorkbenchState.rule.includes("Midnight Charge: customer charge $15") &&
          mockMonthEndCloseoutWorkbenchState.rule.includes("11:00pm / 23:00 through 6:59am / 06:59 inclusive") &&
          mockMonthEndCloseoutWorkbenchState.rule.includes(
            "7:00am / 07:00 and 10:59pm / 22:59 are excluded",
          ),
        true,
        `${viewport.label}: expected month-end waiting-time and midnight locked rules`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.decision.includes("No invoice generated") &&
          mockMonthEndCloseoutWorkbenchState.decision.includes("no statement generated") &&
          mockMonthEndCloseoutWorkbenchState.decision.includes("no payment link created") &&
          mockMonthEndCloseoutWorkbenchState.decision.includes("no PDF generated") &&
          mockMonthEndCloseoutWorkbenchState.decision.includes("no payout created") &&
          mockMonthEndCloseoutWorkbenchState.decision.includes("no accounting posting") &&
          mockMonthEndCloseoutWorkbenchState.decision.includes("not saved") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("No real month-end closeout workflow") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("monthly billing persistence") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("statement generation") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("finance export") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("API call") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("storage") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("Supabase") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("parser file changes") &&
          mockMonthEndCloseoutWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected month-end no statement/invoice/payment/PDF/payout/accounting/storage/API boundary`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected month-end closeout workbench to have no action controls`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected month-end closeout workbench to have no form controls`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three month-end closeout rows`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.height <=
          (viewport.width < 640 ? 1550 : viewport.width < 1024 ? 900 : viewport.width < 1200 ? 840 : 760),
        true,
        `${viewport.label}: expected compact month-end closeout workbench, got ${mockMonthEndCloseoutWorkbenchState.height}px`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected month-end closeout rows to stay readable`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchState.docScrollWidth <=
          mockMonthEndCloseoutWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected month-end closeout workbench not to create horizontal overflow`,
      );

      const mockFinanceExceptionResolutionWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const monthEndWorkbench = document.querySelector("[data-mock-month-end-closeout-workbench]");
            const workbench = document.querySelector("[data-mock-finance-exception-resolution-workbench]");
            if (!group || !dashboard || !monthEndWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const monthEndRect = monthEndWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-finance-exception-resolution-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-finance-exception-resolution-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-finance-exception-resolution-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-finance-exception-resolution-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-finance-exception-resolution-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              decision:
                document.querySelector("[data-mock-finance-exception-resolution-workbench-decision]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-finance-exception-resolution-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              monthEndBottom: Math.round(monthEndRect.bottom),
              rows,
              rule:
                document.querySelector("[data-mock-finance-exception-resolution-workbench-rule]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              separation:
                document.querySelector("[data-mock-finance-exception-resolution-workbench-separation]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock finance exception resolution workbench`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.groupTop >=
          mockFinanceExceptionResolutionWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected finance exception workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.sectionTop >=
          mockFinanceExceptionResolutionWorkbenchState.monthEndBottom,
        true,
        `${viewport.label}: expected finance exception workbench after month-end closeout workbench`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.text.toLowerCase().includes(
          "finance exception resolution workbench",
        ) && mockFinanceExceptionResolutionWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected finance exception workbench heading`,
      );
      assert.deepEqual(
        mockFinanceExceptionResolutionWorkbenchState.columns,
        [
          "Exception reference closeout month customer account related job month-end group",
          "Exception type",
          "Customer billing impact",
          "Driver payout impact",
          "Finance review status dispatcher follow-up status",
          "Resolution readiness next internal action",
        ],
        `${viewport.label}: expected finance exception workflow columns`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.filterSummary.includes("May 2026") &&
          mockFinanceExceptionResolutionWorkbenchState.filterSummary.includes(
            "Month-End Closeout Workbench exception rows",
          ) &&
          mockFinanceExceptionResolutionWorkbenchState.filterSummary.includes(
            "Open billing, payout, statement, and finance review exceptions",
          ) &&
          mockFinanceExceptionResolutionWorkbenchState.filterSummary.includes("3 exception rows maximum") &&
          mockFinanceExceptionResolutionWorkbenchState.filterSummary.includes("display-only"),
        true,
        `${viewport.label}: expected compact display-only finance exception filter summary`,
      );
      const financeExceptionRowsByRef = Object.fromEntries(
        mockFinanceExceptionResolutionWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        financeExceptionRowsByRef["PLO-FIN-EX-2026-05-RITZ-EV"].includes("Extra-charge evidence missing") &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-RITZ-EV"].includes("Hold customer billing") &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-RITZ-EV"].includes("Driver payout still under review") &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-RITZ-EV"].includes("Waiting Time 2 blocks") &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-RITZ-EV"].includes("Extra Stops 1") &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-VIP-WAIVER"].includes("Customer charge waived") &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-VIP-WAIVER"].includes(
            "Driver payout review remains separate",
          ) &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-VIP-WAIVER"].includes("Midnight Charge detected") &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-RITZ-STMT"].includes(
            "Statement/invoice readiness blocked",
          ) &&
          financeExceptionRowsByRef["PLO-FIN-EX-2026-05-RITZ-STMT"].includes("finance review note"),
        true,
        `${viewport.label}: expected finance exception rows for evidence, waiver, and statement readiness`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.separation.includes(
          "Waiting Time, Extra Stops, and Midnight Charge may display",
        ) &&
          mockFinanceExceptionResolutionWorkbenchState.separation.includes("under Extra Charges") &&
          mockFinanceExceptionResolutionWorkbenchState.separation.includes("each charge type remains internally distinct") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes(
            "Customer billing approval and driver payout approval are separate decisions",
          ) &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes(
            "Waived customer charge does not automatically cancel driver payout review",
          ),
        true,
        `${viewport.label}: expected finance charge separation and billing/payout decision rules`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.rule.includes("1 waiting block = 15 minutes") &&
          mockFinanceExceptionResolutionWorkbenchState.rule.includes("customer charge $15 per waiting block") &&
          mockFinanceExceptionResolutionWorkbenchState.rule.includes("driver payout $10 per waiting block") &&
          mockFinanceExceptionResolutionWorkbenchState.rule.includes("Midnight Charge: customer charge $15") &&
          mockFinanceExceptionResolutionWorkbenchState.rule.includes(
            "11:00pm / 23:00 through 6:59am / 06:59 inclusive",
          ) &&
          mockFinanceExceptionResolutionWorkbenchState.rule.includes(
            "7:00am / 07:00 and 10:59pm / 22:59 are excluded",
          ),
        true,
        `${viewport.label}: expected finance waiting-time and midnight locked rules`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.decision.includes("No exception saved") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("no statement generated") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("no invoice generated") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("no payment link created") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("no PDF generated") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("no payout created") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("no accounting posting") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("no finance export") &&
          mockFinanceExceptionResolutionWorkbenchState.decision.includes("not saved") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("No real finance exception workflow") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("real month-end closeout workflow") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("monthly billing persistence") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("statement generation") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("finance export") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("API call") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("storage") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("Supabase") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("parser file changes") &&
          mockFinanceExceptionResolutionWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected finance no exception/statement/invoice/payment/PDF/payout/accounting/storage/API boundary`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected finance exception workbench to have no action controls`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected finance exception workbench to have no form controls`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three finance exception rows`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.height <=
          (viewport.width < 640 ? 1700 : viewport.width < 1024 ? 980 : viewport.width < 1200 ? 900 : 820),
        true,
        `${viewport.label}: expected compact finance exception workbench, got ${mockFinanceExceptionResolutionWorkbenchState.height}px`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected finance exception rows to stay readable`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchState.docScrollWidth <=
          mockFinanceExceptionResolutionWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected finance exception workbench not to create horizontal overflow`,
      );

      const mockDriverJobCompletionExceptionIntakeWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const financeWorkbench = document.querySelector("[data-mock-finance-exception-resolution-workbench]");
            const workbench = document.querySelector("[data-mock-driver-job-completion-exception-intake-workbench]");
            if (!group || !dashboard || !financeWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const financeRect = financeWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-driver-job-completion-exception-intake-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-driver-job-completion-exception-intake-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-driver-job-completion-exception-intake-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-driver-job-completion-exception-intake-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-driver-job-completion-exception-intake-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-driver-job-completion-exception-intake-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              financeBottom: Math.round(financeRect.bottom),
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              rows,
              safety:
                document.querySelector("[data-mock-driver-job-completion-exception-intake-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock driver job completion exception intake workbench`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.groupTop >=
          mockDriverJobCompletionExceptionIntakeWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected driver completion workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.sectionTop >=
          mockDriverJobCompletionExceptionIntakeWorkbenchState.financeBottom,
        true,
        `${viewport.label}: expected driver completion workbench after finance exception workbench`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.text
          .toLowerCase()
          .includes("driver job completion & exception intake workbench") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected driver job completion workbench heading`,
      );
      assert.deepEqual(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.columns,
        [
          "Job reference driver vehicle plate service type",
          "Completion status",
          "OTS POB completed status",
          "Proof photo status",
          "Exception type replacement vehicle status",
          "Dispatcher follow-up status closeout handoff readiness next internal action",
        ],
        `${viewport.label}: expected driver completion workflow columns`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.filterSummary.includes(
          "Completed and exception driver jobs",
        ) &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.filterSummary.includes(
            "Clean / proof pending / exception reported",
          ) &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.filterSummary.includes("3 driver job rows maximum") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only driver completion filter summary`,
      );
      const driverCompletionRowsByRef = Object.fromEntries(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        driverCompletionRowsByRef["PLO-DRV-COMP-101"].includes("Completed cleanly") &&
          driverCompletionRowsByRef["PLO-DRV-COMP-101"].includes("Proof/photo received") &&
          driverCompletionRowsByRef["PLO-DRV-COMP-101"].includes("Ready for completed-job closeout handoff") &&
          driverCompletionRowsByRef["PLO-DRV-COMP-118"].includes("Completed; proof pending") &&
          driverCompletionRowsByRef["PLO-DRV-COMP-118"].includes("Proof/photo pending - not uploaded here") &&
          driverCompletionRowsByRef["PLO-DRV-COMP-207"].includes("Driver exception reported") &&
          driverCompletionRowsByRef["PLO-DRV-COMP-207"].includes("Late driver / car breakdown") &&
          driverCompletionRowsByRef["PLO-DRV-COMP-207"].includes("Replacement vehicle needed - mock review only"),
        true,
        `${viewport.label}: expected clean, proof-pending, and exception driver completion rows`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes("No live location activated") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes("no proof/photo uploaded") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes("no notification sent") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes("no driver acknowledgement sent") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes("no job completion saved") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes(
            "no replacement car dispatch created",
          ) &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes("no closeout record created") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.safety.includes(
            "no billing, invoice, payment, PDF, payout, accounting, or finance export created",
          ) &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes(
            "No real driver job completion workflow",
          ) &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes(
            "OTS/POB/completed persistence",
          ) &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes("proof/photo upload") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes("live location behavior") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes(
            "replacement vehicle dispatch",
          ) &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes("API call") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes("storage") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes("Supabase") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes("parser file changes") &&
          mockDriverJobCompletionExceptionIntakeWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected driver completion no live/proof/notification/persistence/API boundary`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected driver completion workbench to have no action controls`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected driver completion workbench to have no form controls`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three driver completion rows`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.height <=
          (viewport.width < 640 ? 1500 : viewport.width < 1024 ? 900 : viewport.width < 1200 ? 840 : 760),
        true,
        `${viewport.label}: expected compact driver completion workbench, got ${mockDriverJobCompletionExceptionIntakeWorkbenchState.height}px`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.rows.every(
          (row) => row.height >= 48 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected driver completion rows to stay readable`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchState.docScrollWidth <=
          mockDriverJobCompletionExceptionIntakeWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected driver completion workbench not to create horizontal overflow`,
      );

      const mockReplacementVehicleServiceRecoveryWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const driverWorkbench = document.querySelector("[data-mock-driver-job-completion-exception-intake-workbench]");
            const workbench = document.querySelector("[data-mock-replacement-vehicle-service-recovery-workbench]");
            if (!group || !dashboard || !driverWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const driverRect = driverWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-replacement-vehicle-service-recovery-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-replacement-vehicle-service-recovery-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-replacement-vehicle-service-recovery-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-replacement-vehicle-service-recovery-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-replacement-vehicle-service-recovery-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              driverBottom: Math.round(driverRect.bottom),
              filterSummary:
                document.querySelector("[data-mock-replacement-vehicle-service-recovery-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              rows,
              safety:
                document.querySelector("[data-mock-replacement-vehicle-service-recovery-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock replacement vehicle service recovery workbench`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.groupTop >=
          mockReplacementVehicleServiceRecoveryWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected replacement recovery workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.sectionTop >=
          mockReplacementVehicleServiceRecoveryWorkbenchState.driverBottom,
        true,
        `${viewport.label}: expected replacement recovery workbench after driver completion workbench`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.text
          .toLowerCase()
          .includes("replacement vehicle & service recovery workbench") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected replacement recovery workbench heading`,
      );
      assert.deepEqual(
        mockReplacementVehicleServiceRecoveryWorkbenchState.columns,
        [
          "Recovery reference related job reference customer account",
          "Original driver original vehicle plate exception type",
          "Replacement vehicle status backup driver status",
          "Customer impact customer update readiness",
          "Dispatcher escalation status closeout handoff readiness",
          "Next internal action",
        ],
        `${viewport.label}: expected replacement recovery workflow columns`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.filterSummary.includes(
          "Late driver / breakdown / missed job / replacement need",
        ) &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.filterSummary.includes(
            "Driver exception and dispatcher escalation review",
          ) &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.filterSummary.includes("3 recovery rows maximum") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only replacement recovery filter summary`,
      );
      const replacementRecoveryRowsByRef = Object.fromEntries(
        mockReplacementVehicleServiceRecoveryWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        replacementRecoveryRowsByRef["PLO-REC-2026-05-BREAKDOWN"].includes("Car breakdown reported") &&
          replacementRecoveryRowsByRef["PLO-REC-2026-05-BREAKDOWN"].includes(
            "Replacement vehicle identified - mock review only",
          ) &&
          replacementRecoveryRowsByRef["PLO-REC-2026-05-BREAKDOWN"].includes(
            "Backup driver pending confirmation",
          ) &&
          replacementRecoveryRowsByRef["PLO-REC-2026-05-LATE"].includes("Late driver risk") &&
          replacementRecoveryRowsByRef["PLO-REC-2026-05-LATE"].includes("customer update needed") &&
          replacementRecoveryRowsByRef["PLO-REC-2026-05-MISSED"].includes(
            "Missed job / service recovery review",
          ) &&
          replacementRecoveryRowsByRef["PLO-REC-2026-05-MISSED"].includes("Manager approval required"),
        true,
        `${viewport.label}: expected breakdown, late-driver, and missed-job recovery rows`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes(
          "No replacement car dispatch created",
        ) &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes("no backup driver assigned") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes("no customer update sent") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes(
            "no driver acknowledgement sent",
          ) &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes("no live location activated") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes("no proof/photo uploaded") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes("no job status saved") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes("no closeout record created") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.safety.includes(
            "no billing, invoice, payment, PDF, payout, accounting, or finance export created",
          ) &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes(
            "No real replacement vehicle dispatch",
          ) &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("backup driver assignment") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("customer update sending") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("job status persistence") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("API call") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("storage") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("Supabase") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("parser file changes") &&
          mockReplacementVehicleServiceRecoveryWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected replacement recovery no dispatch/update/persistence/API boundary`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected replacement recovery workbench to have no action controls`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected replacement recovery workbench to have no form controls`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three replacement recovery rows`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.height <=
          (viewport.width < 640 ? 1600 : viewport.width < 1024 ? 960 : viewport.width < 1200 ? 900 : 820),
        true,
        `${viewport.label}: expected compact replacement recovery workbench, got ${mockReplacementVehicleServiceRecoveryWorkbenchState.height}px`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.rows.every(
          (row) => row.height >= 48 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected replacement recovery rows to stay readable`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchState.docScrollWidth <=
          mockReplacementVehicleServiceRecoveryWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected replacement recovery workbench not to create horizontal overflow`,
      );

      const mockCustomerServiceRecoveryCommunicationWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const replacementWorkbench = document.querySelector("[data-mock-replacement-vehicle-service-recovery-workbench]");
            const workbench = document.querySelector("[data-mock-customer-service-recovery-communication-workbench]");
            if (!group || !dashboard || !replacementWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const replacementRect = replacementWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-customer-service-recovery-communication-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-customer-service-recovery-communication-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-customer-service-recovery-communication-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-customer-service-recovery-communication-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-customer-service-recovery-communication-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-customer-service-recovery-communication-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              replacementBottom: Math.round(replacementRect.bottom),
              rows,
              safety:
                document.querySelector("[data-mock-customer-service-recovery-communication-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock customer service recovery communication workbench`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.groupTop >=
          mockCustomerServiceRecoveryCommunicationWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected customer communication workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.sectionTop >=
          mockCustomerServiceRecoveryCommunicationWorkbenchState.replacementBottom,
        true,
        `${viewport.label}: expected customer communication workbench after replacement recovery workbench`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.text
          .toLowerCase()
          .includes("customer service recovery communication workbench") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected customer recovery communication workbench heading`,
      );
      assert.deepEqual(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.columns,
        [
          "Communication reference related recovery job reference customer account",
          "Service issue customer impact",
          "Proposed customer update",
          "Manager approval status goodwill no-charge review status",
          "Communication readiness message-channel readiness",
          "Closeout handoff readiness next internal action",
        ],
        `${viewport.label}: expected customer communication workflow columns`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.filterSummary.includes(
          "Late driver / replacement used / missed job recovery",
        ) &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.filterSummary.includes(
            "Service recovery rows and customer impact review",
          ) &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.filterSummary.includes(
            "3 customer recovery rows maximum",
          ) &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only customer communication filter summary`,
      );
      const customerRecoveryRowsByRef = Object.fromEntries(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        customerRecoveryRowsByRef["PLO-COMM-2026-05-LATE"].includes("Late driver risk") &&
          customerRecoveryRowsByRef["PLO-COMM-2026-05-LATE"].includes("Delay update prepared - not sent") &&
          customerRecoveryRowsByRef["PLO-COMM-2026-05-REPLACE"].includes("Replacement vehicle used") &&
          customerRecoveryRowsByRef["PLO-COMM-2026-05-REPLACE"].includes("Goodwill/no-charge review pending") &&
          customerRecoveryRowsByRef["PLO-COMM-2026-05-MISSED"].includes("Missed job / service recovery") &&
          customerRecoveryRowsByRef["PLO-COMM-2026-05-MISSED"].includes("Manager approval required"),
        true,
        `${viewport.label}: expected late-driver, replacement, and missed-job customer communication rows`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("No customer update sent") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no message-channel delivery") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes(
            "no customer notification sent",
          ) &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no goodwill credit created") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes(
            "no no-charge billing decision saved",
          ) &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no invoice adjusted") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no payment link created") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no PDF generated") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no accounting posting") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no finance export") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.safety.includes("no closeout record created") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes("No real customer update sending") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes("message-channel delivery") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes(
            "no-charge billing decision persistence",
          ) &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes("API call") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes("storage") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes("Supabase") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes("parser file changes") &&
          mockCustomerServiceRecoveryCommunicationWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected customer communication no update/notification/goodwill/API boundary`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected customer communication workbench to have no action controls`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected customer communication workbench to have no form controls`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three customer communication rows`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.height <=
          (viewport.width < 640 ? 1650 : viewport.width < 1024 ? 980 : viewport.width < 1200 ? 900 : 840),
        true,
        `${viewport.label}: expected compact customer communication workbench, got ${mockCustomerServiceRecoveryCommunicationWorkbenchState.height}px`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.rows.every(
          (row) => row.height >= 48 && row.width >= 240,
        ),
        true,
        `${viewport.label}: expected customer communication rows to stay readable`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchState.docScrollWidth <=
          mockCustomerServiceRecoveryCommunicationWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected customer communication workbench not to create horizontal overflow`,
      );

      const mockFleetDriverReadinessWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const customerCommunication = document.querySelector("[data-mock-customer-service-recovery-communication-workbench]");
            const workbench = document.querySelector("[data-mock-fleet-driver-readiness-workbench]");
            if (!group || !dashboard || !customerCommunication || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const customerRect = customerCommunication.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-fleet-driver-readiness-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-fleet-driver-readiness-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-fleet-driver-readiness-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-fleet-driver-readiness-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-fleet-driver-readiness-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              customerBottom: Math.round(customerRect.bottom),
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-fleet-driver-readiness-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              rows,
              safety:
                document.querySelector("[data-mock-fleet-driver-readiness-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock fleet driver readiness workbench`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.groupTop >=
          mockFleetDriverReadinessWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected fleet driver readiness workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.sectionTop >=
          mockFleetDriverReadinessWorkbenchState.customerBottom,
        true,
        `${viewport.label}: expected fleet driver readiness workbench after customer communication workbench`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.text.toLowerCase().includes("fleet & driver readiness workbench") &&
          mockFleetDriverReadinessWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected fleet driver readiness workbench heading`,
      );
      assert.deepEqual(
        mockFleetDriverReadinessWorkbenchState.columns,
        [
          "Readiness reference driver vehicle plate",
          "Service class next job window",
          "Driver readiness status vehicle readiness status",
          "Schedule conflict status maintenance documentation status",
          "Backup coverage status dispatch readiness",
          "Next internal action",
        ],
        `${viewport.label}: expected fleet driver readiness workflow columns`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.filterSummary.includes(
          "Drivers, vehicles, schedule conflicts, backup coverage",
        ) &&
          mockFleetDriverReadinessWorkbenchState.filterSummary.includes(
            "Mock operations readiness review before dispatch",
          ) &&
          mockFleetDriverReadinessWorkbenchState.filterSummary.includes(
            "3 fleet/driver readiness rows maximum",
          ) &&
          mockFleetDriverReadinessWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only fleet readiness filter summary`,
      );
      const fleetReadinessRowsByRef = Object.fromEntries(
        mockFleetDriverReadinessWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        fleetReadinessRowsByRef["PLO-FLEET-2026-05-READY"].includes("Driver ready for dispatch review") &&
          fleetReadinessRowsByRef["PLO-FLEET-2026-05-READY"].includes("Dispatch ready - no assignment created") &&
          fleetReadinessRowsByRef["PLO-FLEET-2026-05-DOCS"].includes("Vehicle documentation check pending") &&
          fleetReadinessRowsByRef["PLO-FLEET-2026-05-DOCS"].includes("Backup vehicle watch needed") &&
          fleetReadinessRowsByRef["PLO-FLEET-2026-05-CONFLICT"].includes("Driver schedule conflict risk") &&
          fleetReadinessRowsByRef["PLO-FLEET-2026-05-CONFLICT"].includes("Backup driver review needed"),
        true,
        `${viewport.label}: expected ready, documentation pending, and conflict fleet rows`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.safety.includes("No driver assigned") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no vehicle assigned") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no schedule changed") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no live location activated") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no driver acknowledgement sent") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no customer update sent") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no notification sent") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no job status saved") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no dispatch record created") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no maintenance record created") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("no billing, invoice, payment, PDF, payout") &&
          mockFleetDriverReadinessWorkbenchState.safety.includes("No save/load and no API/storage/Supabase behavior") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("No real fleet scheduling workflow") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("driver assignment") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("vehicle assignment") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("backup driver assignment") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("schedule update") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("maintenance record") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("dispatch workflow") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("API call") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("storage") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("Supabase") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("parser file changes") &&
          mockFleetDriverReadinessWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected fleet readiness no assignment/schedule/API boundary`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected fleet driver readiness workbench to have no action controls`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected fleet driver readiness workbench to have no form controls`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three fleet driver readiness rows`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.height <=
          (viewport.width < 640 ? 1700 : viewport.width < 1024 ? 1000 : viewport.width < 1200 ? 900 : 860),
        true,
        `${viewport.label}: expected compact fleet driver readiness workbench, got ${mockFleetDriverReadinessWorkbenchState.height}px`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected fleet driver readiness rows to stay readable`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchState.docScrollWidth <=
          mockFleetDriverReadinessWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected fleet driver readiness workbench not to create horizontal overflow`,
      );

      const mockOperationsHandoverShiftBriefingWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const fleetWorkbench = document.querySelector("[data-mock-fleet-driver-readiness-workbench]");
            const workbench = document.querySelector("[data-mock-operations-handover-shift-briefing-workbench]");
            if (!group || !dashboard || !fleetWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const fleetRect = fleetWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-operations-handover-shift-briefing-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-operations-handover-shift-briefing-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-operations-handover-shift-briefing-workbench-column]")].map(
                  (column) =>
                    column.getAttribute("data-mock-operations-handover-shift-briefing-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-operations-handover-shift-briefing-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-operations-handover-shift-briefing-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              fleetBottom: Math.round(fleetRect.bottom),
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              rows,
              safety:
                document.querySelector("[data-mock-operations-handover-shift-briefing-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock operations handover shift briefing workbench`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.groupTop >=
          mockOperationsHandoverShiftBriefingWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected operations handover workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.sectionTop >=
          mockOperationsHandoverShiftBriefingWorkbenchState.fleetBottom,
        true,
        `${viewport.label}: expected operations handover workbench after fleet driver readiness workbench`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.text
          .toLowerCase()
          .includes("operations handover & shift briefing workbench") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected operations handover workbench heading`,
      );
      assert.deepEqual(
        mockOperationsHandoverShiftBriefingWorkbenchState.columns,
        [
          "Handover reference shift handover window",
          "Priority area related job account",
          "Current status risk exception summary",
          "Owner next shift assignee customer impact",
          "Driver fleet impact finance closeout impact",
          "Handover readiness next internal action",
        ],
        `${viewport.label}: expected operations handover workflow columns`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.filterSummary.includes(
          "Today shift handover / daily operations briefing",
        ) &&
          mockOperationsHandoverShiftBriefingWorkbenchState.filterSummary.includes(
            "Mock cross-workbench operations review",
          ) &&
          mockOperationsHandoverShiftBriefingWorkbenchState.filterSummary.includes("3 handover rows maximum") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only operations handover filter summary`,
      );
      const operationsHandoverRowsByRef = Object.fromEntries(
        mockOperationsHandoverShiftBriefingWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        operationsHandoverRowsByRef["PLO-HANDOVER-2026-05-MORNING"].includes("VIP airport job confirmed") &&
          operationsHandoverRowsByRef["PLO-HANDOVER-2026-05-MORNING"].includes("Driver/fleet ready") &&
          operationsHandoverRowsByRef["PLO-HANDOVER-2026-05-RECOVERY"].includes(
            "Manager/customer update review pending",
          ) &&
          operationsHandoverRowsByRef["PLO-HANDOVER-2026-05-RECOVERY"].includes("update not sent") &&
          operationsHandoverRowsByRef["PLO-HANDOVER-2026-05-CLOSEOUT"].includes(
            "Evidence pending before billing handoff",
          ) &&
          operationsHandoverRowsByRef["PLO-HANDOVER-2026-05-CLOSEOUT"].includes(
            "Finance/closeout blocked pending evidence",
          ),
        true,
        `${viewport.label}: expected morning, recovery, and closeout handover rows`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("No shift handover saved") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no job status changed") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no driver assigned") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no vehicle assigned") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no schedule changed") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no customer update sent") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no notification sent") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no live location activated") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no dispatch record created") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes("no closeout record created") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes(
            "no billing, invoice, payment, PDF, payout",
          ) &&
          mockOperationsHandoverShiftBriefingWorkbenchState.safety.includes(
            "No save/load and no API/storage/Supabase behavior",
          ) &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes(
            "No real operations handover workflow",
          ) &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("shift scheduling workflow") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("driver assignment") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("vehicle assignment") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("schedule update") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("job status persistence") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("dispatch workflow") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("closeout workflow") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("API call") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("storage") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("Supabase") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("parser file changes") &&
          mockOperationsHandoverShiftBriefingWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected operations handover no scheduling/notification/API boundary`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected operations handover workbench to have no action controls`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected operations handover workbench to have no form controls`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three operations handover rows`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.height <=
          (viewport.width < 640 ? 1750 : viewport.width < 1024 ? 1020 : viewport.width < 1200 ? 920 : 890),
        true,
        `${viewport.label}: expected compact operations handover workbench, got ${mockOperationsHandoverShiftBriefingWorkbenchState.height}px`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected operations handover rows to stay readable`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchState.docScrollWidth <=
          mockOperationsHandoverShiftBriefingWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected operations handover workbench not to create horizontal overflow`,
      );

      const mockCustomerAccountServiceProfileWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const operationsWorkbench = document.querySelector("[data-mock-operations-handover-shift-briefing-workbench]");
            const workbench = document.querySelector("[data-mock-customer-account-service-profile-workbench]");
            if (!group || !dashboard || !operationsWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const operationsRect = operationsWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-customer-account-service-profile-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-customer-account-service-profile-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-customer-account-service-profile-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-customer-account-service-profile-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-customer-account-service-profile-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-customer-account-service-profile-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              operationsBottom: Math.round(operationsRect.bottom),
              rows,
              safety:
                document.querySelector("[data-mock-customer-account-service-profile-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock customer account service profile workbench`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.groupTop >=
          mockCustomerAccountServiceProfileWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected customer account service profile workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.sectionTop >=
          mockCustomerAccountServiceProfileWorkbenchState.operationsBottom,
        true,
        `${viewport.label}: expected customer account service profile workbench after operations handover workbench`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.text
          .toLowerCase()
          .includes("customer account & service profile workbench") &&
          mockCustomerAccountServiceProfileWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected customer account service profile workbench heading`,
      );
      assert.deepEqual(
        mockCustomerAccountServiceProfileWorkbenchState.columns,
        [
          "Account reference customer account",
          "Primary booker contact billing contact readiness",
          "Service preference summary usual service pattern",
          "VIP special handling notes monthly billing readiness",
          "Open operations note internal review status",
          "Next internal action",
        ],
        `${viewport.label}: expected customer account service profile workflow columns`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.filterSummary.includes(
          "Regular customer/account service profiles",
        ) &&
          mockCustomerAccountServiceProfileWorkbenchState.filterSummary.includes(
            "Mock service preference and billing-readiness review",
          ) &&
          mockCustomerAccountServiceProfileWorkbenchState.filterSummary.includes("3 account rows maximum") &&
          mockCustomerAccountServiceProfileWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only customer account filter summary`,
      );
      const customerAccountRowsByRef = Object.fromEntries(
        mockCustomerAccountServiceProfileWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        customerAccountRowsByRef["PLO-ACCT-PROFILE-UBS"].includes("Billing contact confirmed") &&
          customerAccountRowsByRef["PLO-ACCT-PROFILE-UBS"].includes("Monthly billing ready in mock review") &&
          customerAccountRowsByRef["PLO-ACCT-PROFILE-RITZ"].includes("Billing contact needs confirmation") &&
          customerAccountRowsByRef["PLO-ACCT-PROFILE-RITZ"].includes("Concierge service notes reviewed") &&
          customerAccountRowsByRef["PLO-ACCT-PROFILE-VIP"].includes(
            "VIP/special handling notes pending manager review",
          ) &&
          customerAccountRowsByRef["PLO-ACCT-PROFILE-VIP"].includes(
            "Monthly billing handoff pending manager review",
          ),
        true,
        `${viewport.label}: expected corporate, concierge, and VIP customer account rows`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.safety.includes("No customer profile saved") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no CRM/account record created") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no billing contact saved") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no monthly billing activated") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no invoice generated") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no statement generated") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no payment link created") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no PDF generated") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no customer notification sent") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes("no message-channel delivery") &&
          mockCustomerAccountServiceProfileWorkbenchState.safety.includes(
            "No save/load and no API/storage/Supabase behavior",
          ) &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes(
            "No real customer account/profile workflow",
          ) &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("CRM record creation") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("billing contact persistence") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("monthly billing activation") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("invoice generation") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("statement generation") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("payment links") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("message-channel delivery") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("API call") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("storage") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("Supabase") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("parser file changes") &&
          mockCustomerAccountServiceProfileWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected customer account no CRM/billing/API boundary`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected customer account service profile workbench to have no action controls`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected customer account service profile workbench to have no form controls`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three customer account service profile rows`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.height <=
          (viewport.width < 640 ? 1750 : viewport.width < 1024 ? 1020 : viewport.width < 1200 ? 920 : 890),
        true,
        `${viewport.label}: expected compact customer account service profile workbench, got ${mockCustomerAccountServiceProfileWorkbenchState.height}px`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected customer account service profile rows to stay readable`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchState.docScrollWidth <=
          mockCustomerAccountServiceProfileWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected customer account service profile workbench not to create horizontal overflow`,
      );

      const mockBookingIntakeAccountMatchingWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const previousWorkbench = document.querySelector("[data-mock-customer-account-service-profile-workbench]");
            const workbench = document.querySelector("[data-mock-booking-intake-account-matching-workbench]");
            if (!group || !dashboard || !previousWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const previousRect = previousWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-booking-intake-account-matching-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-booking-intake-account-matching-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-booking-intake-account-matching-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-booking-intake-account-matching-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-booking-intake-account-matching-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-booking-intake-account-matching-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              previousBottom: Math.round(previousRect.bottom),
              rows,
              rules:
                document.querySelector("[data-mock-booking-intake-account-matching-workbench-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              safety:
                document.querySelector("[data-mock-booking-intake-account-matching-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock booking intake account matching workbench`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.groupTop >=
          mockBookingIntakeAccountMatchingWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected booking intake account matching workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.sectionTop >=
          mockBookingIntakeAccountMatchingWorkbenchState.previousBottom,
        true,
        `${viewport.label}: expected booking intake account matching workbench after customer account profile workbench`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.text
          .toLowerCase()
          .includes("booking intake quality & account matching workbench") &&
          mockBookingIntakeAccountMatchingWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected booking intake account matching workbench heading`,
      );
      assert.deepEqual(
        mockBookingIntakeAccountMatchingWorkbenchState.columns,
        [
          "Intake reference source channel",
          "Customer account match booker contact readiness",
          "Passenger readiness route completeness",
          "Flight timing readiness vehicle pax readiness",
          "Parser manual review status missing detail exception summary",
          "Dispatch handoff readiness next internal action",
        ],
        `${viewport.label}: expected booking intake account matching workflow columns`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.filterSummary.includes(
          "Booking intake quality and account matching",
        ) &&
          mockBookingIntakeAccountMatchingWorkbenchState.filterSummary.includes(
            "Mock parser/manual review and dispatcher intake QA",
          ) &&
          mockBookingIntakeAccountMatchingWorkbenchState.filterSummary.includes("3 booking intake rows maximum") &&
          mockBookingIntakeAccountMatchingWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only booking intake filter summary`,
      );
      const bookingIntakeRowsByRef = Object.fromEntries(
        mockBookingIntakeAccountMatchingWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        bookingIntakeRowsByRef["PLO-INTAKE-MATCH-UBS"].includes("UBS matched from organization domain ubs.com") &&
          bookingIntakeRowsByRef["PLO-INTAKE-MANUAL-PERSONAL"].includes(
            "Public/personal email domain - no company/account created",
          ) &&
          bookingIntakeRowsByRef["PLO-INTAKE-MISSING-DETAIL"].includes(
            "Prestige Transport ignored as own company",
          ) &&
          bookingIntakeRowsByRef["PLO-INTAKE-MISSING-DETAIL"].includes(
            "Drop-off or flight detail incomplete",
          ),
        true,
        `${viewport.label}: expected account inference, personal email, and missing detail intake rows`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.rules.includes("Prestige Transport is our own company") &&
          mockBookingIntakeAccountMatchingWorkbenchState.rules.includes("not a customer/account") &&
          mockBookingIntakeAccountMatchingWorkbenchState.rules.includes("ubs.com to UBS") &&
          mockBookingIntakeAccountMatchingWorkbenchState.rules.includes("public/personal email domains") &&
          mockBookingIntakeAccountMatchingWorkbenchState.rules.includes(
            "manual account review stays separate from automatic parser behavior",
          ),
        true,
        `${viewport.label}: expected protected booking intake account matching rules`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("No parser change") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no booking saved") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no account linked") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no customer profile saved") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes(
            "no customer/contact record created",
          ) &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no dispatch job created") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no driver assigned") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no vehicle assigned") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no customer update sent") &&
          mockBookingIntakeAccountMatchingWorkbenchState.safety.includes("no notification sent") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("No parser behavior changes") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("parser file changes") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("parser test changes") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("customer/account matching workflow") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("booking save/load behavior") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("account linking") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("dispatch job creation") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("API call") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("localStorage") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("sessionStorage") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("IndexedDB") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("Supabase") &&
          mockBookingIntakeAccountMatchingWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected booking intake no parser/account/dispatch/API boundary`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected booking intake account matching workbench to have no action controls`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected booking intake account matching workbench to have no form controls`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three booking intake account matching rows`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.height <=
          (viewport.width < 640 ? 1900 : viewport.width < 1024 ? 1120 : viewport.width < 1200 ? 1020 : 960),
        true,
        `${viewport.label}: expected compact booking intake account matching workbench, got ${mockBookingIntakeAccountMatchingWorkbenchState.height}px`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected booking intake account matching rows to stay readable`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchState.docScrollWidth <=
          mockBookingIntakeAccountMatchingWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected booking intake account matching workbench not to create horizontal overflow`,
      );

      const mockAirportFlightPickupReadinessWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const previousWorkbench = document.querySelector("[data-mock-booking-intake-account-matching-workbench]");
            const workbench = document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench]");
            if (!group || !dashboard || !previousWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const previousRect = previousWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-airport-flight-pickup-readiness-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-airport-flight-pickup-readiness-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-airport-flight-pickup-readiness-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-airport-flight-pickup-readiness-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              previousBottom: Math.round(previousRect.bottom),
              rows,
              rules:
                document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              safety:
                document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock airport flight pickup readiness workbench`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.groupTop >=
          mockAirportFlightPickupReadinessWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected airport flight pickup readiness workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.sectionTop >=
          mockAirportFlightPickupReadinessWorkbenchState.previousBottom,
        true,
        `${viewport.label}: expected airport flight pickup readiness workbench after booking intake workbench`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.text
          .toLowerCase()
          .includes("airport flight monitoring & pickup readiness workbench") &&
          mockAirportFlightPickupReadinessWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected airport flight pickup readiness workbench heading`,
      );
      assert.deepEqual(
        mockAirportFlightPickupReadinessWorkbenchState.columns,
        [
          "Airport readiness reference job reference",
          "Customer account airport terminal FBO",
          "Flight tail number scheduled pickup window",
          "Flight timing status driver staging status",
          "Meet and greet readiness customer contact readiness",
          "Delay exception risk dispatch readiness next internal action",
        ],
        `${viewport.label}: expected airport flight pickup readiness workflow columns`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.filterSummary.includes(
          "Mock Changi and Seletar/WSSL airport pickup readiness",
        ) &&
          mockAirportFlightPickupReadinessWorkbenchState.filterSummary.includes(
            "Mock dispatcher airport timing and FBO review",
          ) &&
          mockAirportFlightPickupReadinessWorkbenchState.filterSummary.includes("3 airport pickup rows maximum") &&
          mockAirportFlightPickupReadinessWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only airport readiness filter summary`,
      );
      const airportRowsByRef = Object.fromEntries(
        mockAirportFlightPickupReadinessWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        airportRowsByRef["PLO-AIR-READY-CHANGI-ARR"].includes("Changi Airport T3 arrival") &&
          airportRowsByRef["PLO-AIR-READY-CHANGI-DEP"].includes("Changi Airport T1 departure") &&
          airportRowsByRef["PLO-AIR-READY-SELETAR-FBO"].includes(
            "Seletar Airport / WSSL / Jet Aviation FBO",
          ) &&
          airportRowsByRef["PLO-AIR-READY-SELETAR-FBO"].includes("do not convert to Changi") &&
          airportRowsByRef["PLO-AIR-READY-SELETAR-FBO"].includes("keep Seletar/WSSL/Jet Aviation"),
        true,
        `${viewport.label}: expected Changi and Seletar private-jet readiness rows`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.rules.includes(
          "Seletar Airport / WSSL / Jet Aviation FBO is a private-jet airport location",
        ) &&
          mockAirportFlightPickupReadinessWorkbenchState.rules.includes(
            "airport arrival/departure evidence like Changi",
          ) &&
          mockAirportFlightPickupReadinessWorkbenchState.rules.includes("remains Seletar/WSSL/Jet Aviation") &&
          mockAirportFlightPickupReadinessWorkbenchState.rules.includes("not converted to Changi") &&
          mockAirportFlightPickupReadinessWorkbenchState.rules.includes("private-jet arrival-style readiness") &&
          mockAirportFlightPickupReadinessWorkbenchState.rules.includes("private-jet departure-style readiness"),
        true,
        `${viewport.label}: expected protected airport/FBO business rules`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.safety.includes("No flight API connected") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no live flight tracking activated") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no maps or traffic API connected") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no driver dispatch created") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no driver assigned") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no live location activated") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no customer update sent") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no notification sent") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no airport/FBO confirmation sent") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no booking saved") &&
          mockAirportFlightPickupReadinessWorkbenchState.safety.includes("no job status changed") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("No real flight API behavior") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("live flight tracking") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("maps/traffic API behavior") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("airport/FBO confirmation sending") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("parser behavior changes") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("parser file changes") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("parser test changes") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("API call") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("Supabase") &&
          mockAirportFlightPickupReadinessWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected airport readiness no API/dispatch/parser boundary`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected airport flight pickup readiness workbench to have no action controls`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected airport flight pickup readiness workbench to have no form controls`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three airport flight pickup readiness rows`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.height <=
          (viewport.width < 640 ? 2050 : viewport.width < 1024 ? 1220 : viewport.width < 1200 ? 1100 : 1030),
        true,
        `${viewport.label}: expected compact airport flight pickup readiness workbench, got ${mockAirportFlightPickupReadinessWorkbenchState.height}px`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected airport flight pickup readiness rows to stay readable`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchState.docScrollWidth <=
          mockAirportFlightPickupReadinessWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected airport flight pickup readiness workbench not to create horizontal overflow`,
      );

      const mockRouteItineraryReadinessWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const previousWorkbench = document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench]");
            const workbench = document.querySelector("[data-mock-route-itinerary-readiness-workbench]");
            if (!group || !dashboard || !previousWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const previousRect = previousWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [...workbench.querySelectorAll("[data-mock-route-itinerary-readiness-workbench-row]")].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-route-itinerary-readiness-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [...workbench.querySelectorAll("[data-mock-route-itinerary-readiness-workbench-column]")].map(
                  (column) => column.getAttribute("data-mock-route-itinerary-readiness-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-route-itinerary-readiness-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-route-itinerary-readiness-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              previousBottom: Math.round(previousRect.bottom),
              rows,
              rules:
                document.querySelector("[data-mock-route-itinerary-readiness-workbench-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              safety:
                document.querySelector("[data-mock-route-itinerary-readiness-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock route itinerary readiness workbench`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.groupTop >=
          mockRouteItineraryReadinessWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected route itinerary readiness workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.sectionTop >=
          mockRouteItineraryReadinessWorkbenchState.previousBottom,
        true,
        `${viewport.label}: expected route itinerary readiness workbench after airport flight pickup readiness workbench`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.text
          .toLowerCase()
          .includes("route & itinerary readiness workbench") &&
          mockRouteItineraryReadinessWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected route itinerary readiness workbench heading`,
      );
      assert.deepEqual(
        mockRouteItineraryReadinessWorkbenchState.columns,
        [
          "Route readiness reference job reference",
          "Customer account pickup readiness drop-off readiness",
          "Route waypoint summary timing readiness",
          "Passenger contact readiness special handling child seat note",
          "Route exception risk dispatch handoff readiness",
          "Next internal action",
        ],
        `${viewport.label}: expected route itinerary readiness workflow columns`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.filterSummary.includes(
          "Mock pickup, drop-off, and waypoint readiness",
        ) &&
          mockRouteItineraryReadinessWorkbenchState.filterSummary.includes(
            "Mock dispatcher route and itinerary review",
          ) &&
          mockRouteItineraryReadinessWorkbenchState.filterSummary.includes("3 route/itinerary rows maximum") &&
          mockRouteItineraryReadinessWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only route itinerary filter summary`,
      );
      const routeRowsByRef = Object.fromEntries(
        mockRouteItineraryReadinessWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        routeRowsByRef["PLO-ROUTE-READY-AIRPORT"].includes("Changi Airport T3 pickup confirmed") &&
          routeRowsByRef["PLO-ROUTE-READY-MULTISTOP"].includes(
            "Ritz-Carlton > Gardens by the Bay > National Gallery > Raffles Hotel",
          ) &&
          routeRowsByRef["PLO-ROUTE-READY-MULTISTOP"].includes("Raffles Hotel final drop-off retained") &&
          routeRowsByRef["PLO-ROUTE-READY-MULTISTOP"].includes("preserve all later waypoints") &&
          routeRowsByRef["PLO-ROUTE-READY-MULTISTOP"].includes(
            "Extra Stops shown as itinerary context only - not billed",
          ) &&
          routeRowsByRef["PLO-ROUTE-READY-VIP-CHILD"].includes(
            "Child seat note pending final confirmation - service handling only",
          ),
        true,
        `${viewport.label}: expected route itinerary rows with airport, multi-stop, and child-seat examples`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.rules.includes(
          "route and itinerary readiness stays separate from parser behavior",
        ) &&
          mockRouteItineraryReadinessWorkbenchState.rules.includes("preserves all waypoints") &&
          mockRouteItineraryReadinessWorkbenchState.rules.includes("must not drop later waypoints") &&
          mockRouteItineraryReadinessWorkbenchState.rules.includes(
            "Extra Stops appear as route/itinerary context only",
          ) &&
          mockRouteItineraryReadinessWorkbenchState.rules.includes("not calculated or billed") &&
          mockRouteItineraryReadinessWorkbenchState.rules.includes("Child seat notes are service-handling context only") &&
          mockRouteItineraryReadinessWorkbenchState.rules.includes("no pricing, billing, or inventory behavior") &&
          mockRouteItineraryReadinessWorkbenchState.rules.includes("Manual route review stays separate"),
        true,
        `${viewport.label}: expected protected route and waypoint business rules`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.safety.includes("No route optimization") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no maps or geocoding API connected") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no traffic API connected") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no booking saved") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no dispatch job created") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no driver assigned") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no vehicle assigned") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no customer update sent") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no notification sent") &&
          mockRouteItineraryReadinessWorkbenchState.safety.includes("no job status changed") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("No real route optimization behavior") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("maps/geocoding/traffic API behavior") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("booking save/load behavior") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("dispatch workflow") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("parser behavior changes") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("parser file changes") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("parser test changes") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("API call") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("Supabase") &&
          mockRouteItineraryReadinessWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected route itinerary no API/dispatch/parser boundary`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected route itinerary readiness workbench to have no action controls`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected route itinerary readiness workbench to have no form controls`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three route itinerary readiness rows`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.height <=
          (viewport.width < 640 ? 2050 : viewport.width < 1024 ? 1220 : viewport.width < 1200 ? 1100 : 1030),
        true,
        `${viewport.label}: expected compact route itinerary readiness workbench, got ${mockRouteItineraryReadinessWorkbenchState.height}px`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected route itinerary readiness rows to stay readable`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchState.docScrollWidth <=
          mockRouteItineraryReadinessWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected route itinerary readiness workbench not to create horizontal overflow`,
      );

      const mockDriverAssignmentDispatchReadinessWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const previousWorkbench = document.querySelector("[data-mock-route-itinerary-readiness-workbench]");
            const workbench = document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench]");
            if (!group || !dashboard || !previousWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const previousRect = previousWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [
              ...workbench.querySelectorAll("[data-mock-driver-assignment-dispatch-readiness-workbench-row]"),
            ].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-driver-assignment-dispatch-readiness-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [
                  ...workbench.querySelectorAll("[data-mock-driver-assignment-dispatch-readiness-workbench-column]"),
                ].map(
                  (column) =>
                    column.getAttribute("data-mock-driver-assignment-dispatch-readiness-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              previousBottom: Math.round(previousRect.bottom),
              rows,
              rules:
                document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              safety:
                document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock driver assignment dispatch readiness workbench`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.groupTop >=
          mockDriverAssignmentDispatchReadinessWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected driver assignment dispatch readiness workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.sectionTop >=
          mockDriverAssignmentDispatchReadinessWorkbenchState.previousBottom,
        true,
        `${viewport.label}: expected driver assignment dispatch readiness workbench after route itinerary readiness workbench`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.text
          .toLowerCase()
          .includes("driver assignment & dispatch readiness workbench") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected driver assignment dispatch readiness workbench heading`,
      );
      assert.deepEqual(
        mockDriverAssignmentDispatchReadinessWorkbenchState.columns,
        [
          "Dispatch readiness reference job reference",
          "Customer account service type pickup window",
          "Proposed driver proposed vehicle plate",
          "Driver contact readiness driver acknowledgement readiness",
          "Schedule overlap risk customer update readiness",
          "Dispatch readiness next internal action",
        ],
        `${viewport.label}: expected driver assignment dispatch workflow columns`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.filterSummary.includes(
          "Mock proposed driver, vehicle, and pickup-window readiness",
        ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.filterSummary.includes(
            "Mock dispatcher driver/vehicle pairing review",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.filterSummary.includes(
            "3 driver assignment rows maximum",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only driver assignment filter summary`,
      );
      const driverAssignmentRowsByRef = Object.fromEntries(
        mockDriverAssignmentDispatchReadinessWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        driverAssignmentRowsByRef["PLO-DISP-READY-AIRPORT"].includes("Proposed driver: Kumar Tan") &&
          driverAssignmentRowsByRef["PLO-DISP-READY-AIRPORT"].includes("Mercedes V-Class / SLP 8822") &&
          driverAssignmentRowsByRef["PLO-DISP-READY-AIRPORT"].includes(
            "Driver acknowledgement pending - not sent",
          ) &&
          driverAssignmentRowsByRef["PLO-DISP-READY-VIP-HOURLY"].includes(
            "Schedule overlap warning only - dispatcher may intentionally assign same driver",
          ) &&
          driverAssignmentRowsByRef["PLO-DISP-READY-VIP-HOURLY"].includes(
            "Review overlap warning without blocking or hiding drivers",
          ) &&
          driverAssignmentRowsByRef["PLO-DISP-READY-TRANSFER-HOLD"].includes(
            "Customer update not prepared - no message sent",
          ) &&
          driverAssignmentRowsByRef["PLO-DISP-READY-TRANSFER-HOLD"].includes("Dispatch hold in mock review"),
        true,
        `${viewport.label}: expected driver assignment rows with airport, schedule-overlap, and customer-update hold examples`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.rules.includes(
          "readiness stays separate from real driver assignment",
        ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.rules.includes(
            "proposed driver/vehicle display creates no assignment",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.rules.includes(
            "acknowledgement readiness sends nothing",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.rules.includes(
            "customer update readiness sends nothing",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.rules.includes(
            "schedule/overlap review is display-only",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.rules.includes(
            "dispatcher may intentionally assign the same driver to multiple bookings",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.rules.includes(
            "warn only, not block or hide drivers",
          ),
        true,
        `${viewport.label}: expected protected driver assignment and schedule-overlap business rules`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("No driver assigned") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no vehicle assigned") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes(
            "no driver acknowledgement sent",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no customer update sent") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no notification sent") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no live location activated") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no schedule changed") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no dispatch job created") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no job status changed") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.safety.includes("no booking saved") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("No real driver assignment") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("vehicle assignment") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes(
            "driver acknowledgement behavior",
          ) &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("schedule update") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("dispatch workflow") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("booking save/load behavior") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("parser behavior changes") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("parser file changes") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("parser test changes") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("API call") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("Supabase") &&
          mockDriverAssignmentDispatchReadinessWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected driver assignment no API/dispatch/parser boundary`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected driver assignment dispatch workbench to have no action controls`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected driver assignment dispatch workbench to have no form controls`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three driver assignment dispatch readiness rows`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.height <=
          (viewport.width < 640 ? 2050 : viewport.width < 1024 ? 1220 : viewport.width < 1200 ? 1100 : 1030),
        true,
        `${viewport.label}: expected compact driver assignment dispatch readiness workbench, got ${mockDriverAssignmentDispatchReadinessWorkbenchState.height}px`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected driver assignment dispatch readiness rows to stay readable`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchState.docScrollWidth <=
          mockDriverAssignmentDispatchReadinessWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected driver assignment dispatch readiness workbench not to create horizontal overflow`,
      );

      const mockBookingLifecycleAuditReadinessWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const previousWorkbench = document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench]");
            const workbench = document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench]");
            if (!group || !dashboard || !previousWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const previousRect = previousWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [
              ...workbench.querySelectorAll("[data-mock-booking-lifecycle-audit-readiness-workbench-row]"),
            ].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-booking-lifecycle-audit-readiness-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [
                  ...workbench.querySelectorAll("[data-mock-booking-lifecycle-audit-readiness-workbench-column]"),
                ].map(
                  (column) =>
                    column.getAttribute("data-mock-booking-lifecycle-audit-readiness-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              previousBottom: Math.round(previousRect.bottom),
              rows,
              rules:
                document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              safety:
                document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock booking lifecycle audit readiness workbench`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.groupTop >=
          mockBookingLifecycleAuditReadinessWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected booking lifecycle audit readiness workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.sectionTop >=
          mockBookingLifecycleAuditReadinessWorkbenchState.previousBottom,
        true,
        `${viewport.label}: expected booking lifecycle audit readiness workbench after driver assignment dispatch readiness workbench`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.text
          .toLowerCase()
          .includes("booking lifecycle timeline & internal audit readiness workbench") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected booking lifecycle audit readiness workbench heading`,
      );
      assert.deepEqual(
        mockBookingLifecycleAuditReadinessWorkbenchState.columns,
        [
          "Lifecycle reference job reference",
          "Customer account current lifecycle stage",
          "Intake account status route itinerary status",
          "Driver assignment status dispatch customer update status",
          "Completion closeout status service recovery exception status",
          "Internal audit readiness next internal action",
        ],
        `${viewport.label}: expected booking lifecycle audit workflow columns`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.filterSummary.includes(
          "Mock booking lifecycle and audit readiness review",
        ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.filterSummary.includes(
            "Mock dispatcher/admin lifecycle timeline",
          ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.filterSummary.includes(
            "3 lifecycle rows maximum",
          ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only booking lifecycle filter summary`,
      );
      const lifecycleRowsByRef = Object.fromEntries(
        mockBookingLifecycleAuditReadinessWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        lifecycleRowsByRef["PLO-LIFE-AUDIT-AIRPORT"].includes("Dispatch handoff pending") &&
          lifecycleRowsByRef["PLO-LIFE-AUDIT-AIRPORT"].includes(
            "Proposed driver/vehicle ready - no assignment created",
          ) &&
          lifecycleRowsByRef["PLO-LIFE-AUDIT-AIRPORT"].includes(
            "Audit readiness mock-ready; no audit trail created",
          ) &&
          lifecycleRowsByRef["PLO-LIFE-AUDIT-VIP-MULTI"].includes("Multi-stop waypoint review pending") &&
          lifecycleRowsByRef["PLO-LIFE-AUDIT-VIP-MULTI"].includes(
            "Driver assignment status not active - no driver assigned",
          ) &&
          lifecycleRowsByRef["PLO-LIFE-AUDIT-RECOVERY"].includes(
            "Driver completion received; closeout review needed",
          ) &&
          lifecycleRowsByRef["PLO-LIFE-AUDIT-RECOVERY"].includes("Customer recovery note pending - not sent"),
        true,
        `${viewport.label}: expected lifecycle rows with airport, multi-stop hold, and recovery closeout cases`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.rules.includes(
          "lifecycle readiness stays separate from real booking save/load behavior",
        ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.rules.includes(
            "internal audit readiness creates no audit records",
          ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.rules.includes(
            "driver assignment status creates no driver or vehicle assignment",
          ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.rules.includes(
            "dispatch/customer update status sends nothing",
          ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.rules.includes(
            "completion/closeout status saves no proof",
          ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.rules.includes(
            "parser/manual review stays separate from parser behavior",
          ),
        true,
        `${viewport.label}: expected protected lifecycle/audit business rules`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("No booking lifecycle saved") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no audit trail created") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no booking saved") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no account linked") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no dispatch job created") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no driver assigned") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no vehicle assigned") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no customer update sent") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no notification sent") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no live location activated") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no proof/photo uploaded") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no job status changed") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.safety.includes("no closeout record") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes(
            "No real booking lifecycle workflow",
          ) &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("audit trail creation") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("booking save/load behavior") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("dispatch workflow") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("parser behavior changes") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("audit logging") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("API call") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("Supabase") &&
          mockBookingLifecycleAuditReadinessWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected lifecycle audit no API/dispatch/parser/audit boundary`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected booking lifecycle audit workbench to have no action controls`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected booking lifecycle audit workbench to have no form controls`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three booking lifecycle audit readiness rows`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.height <=
          (viewport.width < 640 ? 2140 : viewport.width < 1024 ? 1260 : viewport.width < 1200 ? 1120 : 1080),
        true,
        `${viewport.label}: expected compact booking lifecycle audit readiness workbench, got ${mockBookingLifecycleAuditReadinessWorkbenchState.height}px`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected booking lifecycle audit readiness rows to stay readable`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchState.docScrollWidth <=
          mockBookingLifecycleAuditReadinessWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected booking lifecycle audit readiness workbench not to create horizontal overflow`,
      );

      const mockOperationsRiskSlaWatchlistWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const previousWorkbench = document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench]");
            const workbench = document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench]");
            if (!group || !dashboard || !previousWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const previousRect = previousWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [
              ...workbench.querySelectorAll("[data-mock-operations-risk-sla-watchlist-workbench-row]"),
            ].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-operations-risk-sla-watchlist-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [
                  ...workbench.querySelectorAll("[data-mock-operations-risk-sla-watchlist-workbench-column]"),
                ].map(
                  (column) =>
                    column.getAttribute("data-mock-operations-risk-sla-watchlist-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              previousBottom: Math.round(previousRect.bottom),
              rows,
              rules:
                document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              safety:
                document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock operations risk SLA watchlist workbench`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.groupTop >=
          mockOperationsRiskSlaWatchlistWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected operations risk SLA watchlist workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.sectionTop >=
          mockOperationsRiskSlaWatchlistWorkbenchState.previousBottom,
        true,
        `${viewport.label}: expected operations risk SLA watchlist workbench after booking lifecycle audit readiness workbench`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.text
          .toLowerCase()
          .includes("operations risk & sla watchlist workbench") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected operations risk SLA watchlist workbench heading`,
      );
      assert.deepEqual(
        mockOperationsRiskSlaWatchlistWorkbenchState.columns,
        [
          "Risk reference related job reference",
          "Customer account risk area",
          "SLA timing window current status",
          "Risk severity owner responsible desk",
          "Customer impact driver fleet impact",
          "Closeout finance impact next internal action",
        ],
        `${viewport.label}: expected operations risk SLA workflow columns`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.filterSummary.includes(
          "Mock operations risk and SLA watchlist review",
        ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.filterSummary.includes(
            "Mock dispatcher/admin risk desk",
          ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.filterSummary.includes(
            "3 risk watchlist rows maximum",
          ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only operations risk SLA filter summary`,
      );
      const riskRowsByRef = Object.fromEntries(
        mockOperationsRiskSlaWatchlistWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        riskRowsByRef["PLO-RISK-SLA-VIP-AIRPORT"].includes("VIP airport pickup timing watch") &&
          riskRowsByRef["PLO-RISK-SLA-VIP-AIRPORT"].includes("Driver/vehicle ready; watch timing") &&
          riskRowsByRef["PLO-RISK-SLA-VIP-AIRPORT"].includes("no assignment created") &&
          riskRowsByRef["PLO-RISK-SLA-RECOVERY-UPDATE"].includes(
            "Customer update risk after service recovery",
          ) &&
          riskRowsByRef["PLO-RISK-SLA-RECOVERY-UPDATE"].includes(
            "Customer update readiness pending - not sent",
          ) &&
          riskRowsByRef["PLO-RISK-SLA-FINANCE-CLOSEOUT"].includes("Finance/closeout evidence risk") &&
          riskRowsByRef["PLO-RISK-SLA-FINANCE-CLOSEOUT"].includes("Exception evidence pending") &&
          riskRowsByRef["PLO-RISK-SLA-FINANCE-CLOSEOUT"].includes("no invoice/payout created"),
        true,
        `${viewport.label}: expected operations risk SLA rows with VIP, recovery update, and finance closeout cases`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.rules.includes(
          "SLA/risk watchlist readiness stays separate from real scheduling, alerts, notifications, dispatch, billing, and audit behavior",
        ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.rules.includes(
            "risk severity creates no alerts or tasks",
          ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.rules.includes(
            "owner/responsible desk display assigns no staff, drivers, or vehicles",
          ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.rules.includes(
            "customer impact sends no customer update",
          ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.rules.includes(
            "driver/fleet impact assigns no drivers or vehicles",
          ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.rules.includes(
            "closeout/finance impact creates no closeout, billing, invoice, payout, or finance records",
          ) &&
          mockOperationsRiskSlaWatchlistWorkbenchState.rules.includes(
            "parser/manual review stays separate from parser behavior",
          ),
        true,
        `${viewport.label}: expected protected operations risk/SLA business rules`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("No SLA alert created") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no risk task saved") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no booking status changed") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no staff assigned") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no driver assigned") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no vehicle assigned") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no customer update sent") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no notification sent") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no live location activated") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no dispatch job created") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.safety.includes("no closeout record created") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("No real SLA alerting workflow") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("operations risk workflow") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("task creation") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("booking status persistence") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("staff assignment") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("dispatch workflow") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("closeout workflow") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("parser behavior changes") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("SLA alerting") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("API call") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("Supabase") &&
          mockOperationsRiskSlaWatchlistWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected operations risk SLA no API/dispatch/parser/audit boundary`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected operations risk SLA workbench to have no action controls`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected operations risk SLA workbench to have no form controls`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three operations risk SLA watchlist rows`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.height <=
          (viewport.width < 640 ? 2140 : viewport.width < 1024 ? 1260 : viewport.width < 1200 ? 1120 : 1080),
        true,
        `${viewport.label}: expected compact operations risk SLA workbench, got ${mockOperationsRiskSlaWatchlistWorkbenchState.height}px`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected operations risk SLA rows to stay readable`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchState.docScrollWidth <=
          mockOperationsRiskSlaWatchlistWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected operations risk SLA workbench not to create horizontal overflow`,
      );

      const mockQuotePricingReviewReadinessWorkbenchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const group = document.querySelector("[data-mock-workflow-review-group]");
            const dashboard = document.querySelector("[data-operations-dashboard]");
            const previousWorkbench = document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench]");
            const workbench = document.querySelector("[data-mock-quote-pricing-review-readiness-workbench]");
            if (!group || !dashboard || !previousWorkbench || !workbench) {
              return false;
            }

            const groupRect = group.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const previousRect = previousWorkbench.getBoundingClientRect();
            const rect = workbench.getBoundingClientRect();
            const rows = [
              ...workbench.querySelectorAll("[data-mock-quote-pricing-review-readiness-workbench-row]"),
            ].map((row) => {
              const rowRect = row.getBoundingClientRect();
              return {
                height: Math.round(rowRect.height),
                key: row.getAttribute("data-mock-quote-pricing-review-readiness-workbench-row") || "",
                text: row.textContent.replace(/\\s+/g, " ").trim(),
                width: Math.round(rowRect.width),
              };
            });
            const columns = [
              ...new Set(
                [
                  ...workbench.querySelectorAll("[data-mock-quote-pricing-review-readiness-workbench-column]"),
                ].map(
                  (column) =>
                    column.getAttribute("data-mock-quote-pricing-review-readiness-workbench-column") || "",
                ),
              ),
            ];

            return {
              actionControlCount: workbench.querySelectorAll("button, a, form").length,
              boundary:
                document.querySelector("[data-mock-quote-pricing-review-readiness-workbench-boundary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              columns,
              controlCount: workbench.querySelectorAll("input, select, textarea").length,
              dashboardBottom: Math.round(dashboardRect.bottom),
              docClientWidth: document.documentElement.clientWidth,
              docScrollWidth: document.documentElement.scrollWidth,
              filterSummary:
                document.querySelector("[data-mock-quote-pricing-review-readiness-workbench-filter-summary]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              groupTop: Math.round(groupRect.top),
              height: Math.round(rect.height),
              previousBottom: Math.round(previousRect.bottom),
              rows,
              rules:
                document.querySelector("[data-mock-quote-pricing-review-readiness-workbench-rules]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              safety:
                document.querySelector("[data-mock-quote-pricing-review-readiness-workbench-safety]")
                  ?.textContent.replace(/\\s+/g, " ")
                  .trim() || "",
              sectionTop: Math.round(rect.top),
              text: workbench.innerText,
            };
          })()`),
        10000,
        `${viewport.label} mock quote pricing review readiness workbench`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.groupTop >=
          mockQuotePricingReviewReadinessWorkbenchState.dashboardBottom,
        true,
        `${viewport.label}: expected quote pricing review workbench to remain in bottom mock workflow group`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.sectionTop >=
          mockQuotePricingReviewReadinessWorkbenchState.previousBottom,
        true,
        `${viewport.label}: expected quote pricing review workbench after operations risk SLA watchlist workbench`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.text
          .toLowerCase()
          .includes("quote & pricing review readiness workbench") &&
          mockQuotePricingReviewReadinessWorkbenchState.text.toLowerCase().includes("mock only"),
        true,
        `${viewport.label}: expected quote pricing review workbench heading`,
      );
      assert.deepEqual(
        mockQuotePricingReviewReadinessWorkbenchState.columns,
        [
          "Quote review reference related job reference",
          "Customer account service type",
          "Rate price basis quoted amount status",
          "Manual extra charge review discount goodwill review",
          "Approval readiness margin risk note",
          "Customer quote handoff readiness next internal action",
        ],
        `${viewport.label}: expected quote pricing review workflow columns`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.filterSummary.includes(
          "Mock quote and pricing review readiness",
        ) &&
          mockQuotePricingReviewReadinessWorkbenchState.filterSummary.includes(
            "Mock dispatcher/admin quote desk",
          ) &&
          mockQuotePricingReviewReadinessWorkbenchState.filterSummary.includes(
            "3 quote/pricing rows maximum",
          ) &&
          mockQuotePricingReviewReadinessWorkbenchState.filterSummary.includes("display-only / no actions"),
        true,
        `${viewport.label}: expected compact display-only quote pricing filter summary`,
      );
      const quoteRowsByRef = Object.fromEntries(
        mockQuotePricingReviewReadinessWorkbenchState.rows.map((row) => [row.key, row.text]),
      );
      assert.equal(
        quoteRowsByRef["PLO-QUOTE-READY-CORP-AIRPORT"].includes(
          "Corporate account MNG rate basis reviewed",
        ) &&
          quoteRowsByRef["PLO-QUOTE-READY-CORP-AIRPORT"].includes(
            "Quoted amount ready - display-only",
          ) &&
          quoteRowsByRef["PLO-QUOTE-READY-VIP-HOURLY"].includes(
            "Manual extra charge note present - review only",
          ) &&
          quoteRowsByRef["PLO-QUOTE-READY-VIP-HOURLY"].includes(
            "Manager approval pending - no approval saved",
          ) &&
          quoteRowsByRef["PLO-QUOTE-READY-RECOVERY-NOCHARGE"].includes(
            "Goodwill/no-charge review pending",
          ) &&
          quoteRowsByRef["PLO-QUOTE-READY-RECOVERY-NOCHARGE"].includes(
            "Customer quote handoff blocked - no notification",
          ),
        true,
        `${viewport.label}: expected quote pricing rows with corporate, VIP, and recovery cases`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.rules.includes(
          "quote review stays separate from real billing, invoice, statement, payment, payout, and accounting behavior",
        ) &&
          mockQuotePricingReviewReadinessWorkbenchState.rules.includes(
            "quoted amount status does not calculate or change totals",
          ) &&
          mockQuotePricingReviewReadinessWorkbenchState.rules.includes(
            "manual extra charge review creates no records",
          ) &&
          mockQuotePricingReviewReadinessWorkbenchState.rules.includes(
            "discount/goodwill review creates no credit or no-charge decision",
          ) &&
          mockQuotePricingReviewReadinessWorkbenchState.rules.includes(
            "approval readiness creates no approvals, tasks, audit records, or quote records",
          ) &&
          mockQuotePricingReviewReadinessWorkbenchState.rules.includes(
            "customer quote handoff readiness sends no quote, payment link, PDF, customer notification, or message-channel delivery",
          ) &&
          mockQuotePricingReviewReadinessWorkbenchState.rules.includes(
            "parser/manual review stays separate from parser behavior",
          ),
        true,
        `${viewport.label}: expected protected quote pricing business rules`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.safety.includes("No quote sent") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no quoted amount saved") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no pricing calculation created") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no invoice generated") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no statement generated") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no payment link created") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no PDF generated") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no payout created") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no accounting posting created") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no finance export created") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no customer notification sent") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no message-channel delivery") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no approval record created") &&
          mockQuotePricingReviewReadinessWorkbenchState.safety.includes("no audit record created") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("No real quote workflow") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("pricing automation") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("quoted amount persistence") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("approval workflow") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("audit trail creation") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("parser behavior changes") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("API call") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("Supabase") &&
          mockQuotePricingReviewReadinessWorkbenchState.boundary.includes("package script changes"),
        true,
        `${viewport.label}: expected quote pricing no API/parser/billing boundary`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.actionControlCount,
        0,
        `${viewport.label}: expected quote pricing workbench to have no action controls`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.controlCount,
        0,
        `${viewport.label}: expected quote pricing workbench to have no form controls`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.rows.length,
        3,
        `${viewport.label}: expected three quote pricing rows`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.height <=
          (viewport.width < 640 ? 2140 : viewport.width < 1024 ? 1260 : viewport.width < 1200 ? 1120 : 1080),
        true,
        `${viewport.label}: expected compact quote pricing workbench, got ${mockQuotePricingReviewReadinessWorkbenchState.height}px`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.rows.every((row) => row.height >= 48 && row.width >= 240),
        true,
        `${viewport.label}: expected quote pricing rows to stay readable`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchState.docScrollWidth <=
          mockQuotePricingReviewReadinessWorkbenchState.docClientWidth + 2,
        true,
        `${viewport.label}: expected quote pricing workbench not to create horizontal overflow`,
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
          await checkDispatchReleaseHandoffPacket(viewport);
          await checkDriverAcknowledgementReadiness(viewport);
          await checkDriverAcknowledgementFollowUp(viewport);
          await checkDayOfTripDispatchMonitor(viewport);
          await checkDayOfTripExceptionEscalation(viewport);
          await checkDispatchRecoveryReplacementReadiness(viewport);
          await checkPostRecoveryUpdateReadiness(viewport);
          await checkDayOfTripCompletionHandoff(viewport);
          await checkCompletedTripCloseoutReview(viewport);
          await checkCloseoutToBillingPreparationReview(viewport);
          await checkBillingPreparationExceptionReview(viewport);
          await checkBillingPreparationSummaryReadyReview(viewport);
          await checkMonthlyBillingQueueReadinessReview(viewport);
          await checkMonthlyBillingQueueExceptionReview(viewport);
          await checkMonthlyBillingMonthGroupingReview(viewport);
          await checkManualExtraChargesBookingFields(viewport);
        } else if (tabLabel === "Dashboard") {
          await checkAdminAppNotificationFeed(viewport);
        }
      }
    };

    const checkDriverRouteViewport = async (viewport, url, expectedText, labels, context) => {
      await setViewport(viewport);
      await evaluate(`window.__mobileUsabilityFetchCalls = []`);
      await navigate(url, expectedText);
      const state = await layoutState();
      const buttons = await buttonState();
      const adminPersistenceNetworkCalls = await evaluate(`window.__mobileUsabilityFetchCalls || []`);
      const adminHubVisible = await evaluate(`Boolean(document.querySelector("[data-admin-access-hub]"))`);
      const adminDispatchRecoveryReplacementReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-dispatch-recovery-replacement-readiness]"))`,
      );
      const adminPostRecoveryUpdateReadinessVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-post-recovery-update-readiness]"))`,
      );
      const adminDayOfTripCompletionHandoffVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-day-of-trip-completion-handoff]"))`,
      );
      const adminCompletedTripCloseoutReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-completed-trip-closeout-review]"))`,
      );
      const adminCloseoutToBillingPreparationReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-closeout-to-billing-preparation-review]"))`,
      );
      const adminBillingPreparationExceptionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-billing-preparation-exception-review]"))`,
      );
      const adminBillingPreparationSummaryReadyReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-billing-preparation-summary-ready-review]"))`,
      );
      const adminMonthlyBillingQueueReadinessReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-monthly-billing-queue-readiness-review]"))`,
      );
      const adminMonthlyBillingQueueExceptionReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-monthly-billing-queue-exception-review]"))`,
      );
      const adminMonthlyBillingMonthGroupingReviewVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-monthly-billing-month-grouping-review]"))`,
      );
      const adminAppNotificationFeedVisible = await evaluate(
        `Boolean(document.querySelector("[data-admin-app-notification-feed]"))`,
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
      const mockExtraChargesControlCenterVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-extra-charges-control-center]"))`,
      );
      const mockCompletedJobCloseoutCenterVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-completed-job-closeout-center]"))`,
      );
      const mockMonthEndCloseoutWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-month-end-closeout-workbench]"))`,
      );
      const mockFinanceExceptionResolutionWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-finance-exception-resolution-workbench]"))`,
      );
      const mockDriverJobCompletionExceptionIntakeWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-driver-job-completion-exception-intake-workbench]"))`,
      );
      const mockReplacementVehicleServiceRecoveryWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-replacement-vehicle-service-recovery-workbench]"))`,
      );
      const mockCustomerServiceRecoveryCommunicationWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-customer-service-recovery-communication-workbench]"))`,
      );
      const mockFleetDriverReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-fleet-driver-readiness-workbench]"))`,
      );
      const mockOperationsHandoverShiftBriefingWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-operations-handover-shift-briefing-workbench]"))`,
      );
      const mockCustomerAccountServiceProfileWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-customer-account-service-profile-workbench]"))`,
      );
      const mockBookingIntakeAccountMatchingWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-booking-intake-account-matching-workbench]"))`,
      );
      const mockAirportFlightPickupReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-airport-flight-pickup-readiness-workbench]"))`,
      );
      const mockRouteItineraryReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-route-itinerary-readiness-workbench]"))`,
      );
      const mockDriverAssignmentDispatchReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-driver-assignment-dispatch-readiness-workbench]"))`,
      );
      const mockBookingLifecycleAuditReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-booking-lifecycle-audit-readiness-workbench]"))`,
      );
      const mockOperationsRiskSlaWatchlistWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-operations-risk-sla-watchlist-workbench]"))`,
      );
      const mockQuotePricingReviewReadinessWorkbenchVisible = await evaluate(
        `Boolean(document.querySelector("[data-mock-quote-pricing-review-readiness-workbench]"))`,
      );
      const internalQaMockArchiveVisible = await evaluate(
        `Boolean(document.querySelector("[data-internal-qa-mock-archive]"))`,
      );
      const internalQaMockArchiveTextLeaks = await evaluate(
        `(() => {
          const text = document.body.innerText || "";
          const groupLabels = ${JSON.stringify(internalQaMockArchiveGroupLabels)};

          return [
            ${JSON.stringify(internalQaMockArchiveLabel)},
            ...groupLabels,
          ].filter((value) => text.includes(value));
        })()`,
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
            "extra charges control center",
            "consolidated extra charges qa",
            "manual staff entry only",
            "manual extra charges",
            "extra charges note / reason",
            "manual extra charge reason",
            "manual override mock only",
            "override reason mock only",
            "customer billing approved in mock review",
            "driver payout approved in mock review",
            "driver payout still reviewed separately",
            "dispatcher handoff pending",
            "driver payout reconciliation pending",
            "no real extra-charge workflow",
            "completed job closeout center",
            "internal/admin-only completed-job closeout preview",
            "completed jobs ready for closeout qa",
            "clean / extra-charge review / waived billing",
            "completion status",
            "closeout readiness",
            "customer billing readiness",
            "driver payout readiness",
            "finance/month-end handoff",
            "no real job closeout workflow",
            "completed-job persistence",
            "driver payout creation",
            "month-end closeout workbench",
            "internal/admin-only month-end grouping preview",
            "all mock accounts with completed jobs",
            "completed job closeout center rows grouped by account/month",
            "3 account/month groups maximum",
            "statement/invoice readiness",
            "customer billing blocked",
            "driver payout still pending review separately",
            "finance/month-end handoff blocked",
            "no real month-end closeout workflow",
            "monthly billing persistence",
            "finance export",
            "finance exception resolution workbench",
            "internal/admin-only finance exception preview",
            "month-end closeout workbench exception rows",
            "extra-charge evidence missing",
            "customer charge waived / payout still reviewed",
            "statement/invoice readiness blocked",
            "no exception saved",
            "no real finance exception workflow",
            "exception persistence",
            "driver job completion & exception intake workbench",
            "internal/admin-only driver completion and exception intake preview",
            "completed and exception driver jobs",
            "clean / proof pending / exception reported",
            "ots confirmed; pob confirmed",
            "proof/photo received in mock review",
            "proof/photo pending - not uploaded here",
            "driver exception reported",
            "late driver / car breakdown",
            "replacement vehicle needed - mock review only",
            "ready for completed-job closeout handoff",
            "no live location activated",
            "no proof/photo uploaded",
            "no driver acknowledgement sent",
            "no job completion saved",
            "no replacement car dispatch created",
            "no real driver job completion workflow",
            "ots/pob/completed persistence",
            "replacement vehicle dispatch",
            "replacement vehicle & service recovery workbench",
            "dispatch recovery / replacement readiness",
            "new driver job link readiness",
            "post-recovery update readiness",
            "customer eta/update status",
            "day-of-trip completion handoff",
            "customer closeout update readiness",
            "completed trip closeout review",
            "billing-readiness note reviewed",
            "closeout to billing preparation review",
            "customer/account billing readiness",
            "billing preparation exception review",
            "missing billing account",
            "billing preparation summary / ready review",
            "ready for monthly billing review",
            "monthly billing queue readiness review",
            "local queue note/status",
            "queued locally for monthly billing",
            "monthly billing queue exception review",
            "local exception note/status",
            "queue exception decision",
            "monthly billing month grouping review",
            "local grouping note/status",
            "grouped locally for monthly billing review",
            "internal/admin-only service recovery preview",
            "late driver / breakdown / missed job / replacement need",
            "driver exception and dispatcher escalation review",
            "3 recovery rows maximum",
            "car breakdown reported",
            "replacement vehicle identified - mock review only",
            "backup driver pending confirmation",
            "customer update needed",
            "dispatcher escalation in progress",
            "missed job / service recovery review",
            "no backup driver assigned",
            "no customer update sent",
            "job status persistence",
            "customer service recovery communication workbench",
            "internal/admin-only customer recovery communication preview",
            "late driver / replacement used / missed job recovery",
            "service recovery rows and customer impact review",
            "3 customer recovery rows maximum",
            "communication reference",
            "proposed customer update",
            "manager approval status",
            "goodwill/no-charge review status",
            "message-channel readiness",
            "delay update prepared - not sent",
            "replacement vehicle explanation prepared - not sent",
            "service recovery apology draft held - not sent",
            "goodwill/no-charge review pending",
            "no-charge review required before future closeout",
            "no message-channel delivery",
            "no customer notification sent",
            "no goodwill credit created",
            "no no-charge billing decision saved",
            "no invoice adjusted",
            "no real customer update sending",
            "no-charge billing decision persistence",
            "invoice adjustment",
            "fleet & driver readiness workbench",
            "internal/admin-only fleet and driver readiness preview",
            "drivers, vehicles, schedule conflicts, backup coverage",
            "mock operations readiness review before dispatch",
            "3 fleet/driver readiness rows maximum",
            "readiness reference",
            "driver readiness status",
            "vehicle readiness status",
            "schedule conflict status",
            "maintenance/documentation status",
            "backup coverage status",
            "dispatch readiness",
            "driver ready for dispatch review",
            "vehicle documentation check pending",
            "backup vehicle watch needed",
            "driver schedule conflict risk",
            "backup driver review needed",
            "no driver assigned",
            "no vehicle assigned",
            "no schedule changed",
            "no dispatch record created",
            "no maintenance record created",
            "no real fleet scheduling workflow",
            "fleet tracking",
            "schedule update",
            "maintenance record",
            "dispatch workflow",
            "operations handover & shift briefing workbench",
            "internal/admin-only shift handover and daily briefing preview",
            "today shift handover / daily operations briefing",
            "mock cross-workbench operations review",
            "3 handover rows maximum",
            "handover reference",
            "shift / handover window",
            "priority area",
            "owner / next shift assignee",
            "customer impact",
            "driver/fleet impact",
            "finance/closeout impact",
            "handover readiness",
            "vip airport job confirmed",
            "manager/customer update review pending",
            "evidence pending before billing handoff",
            "no shift handover saved",
            "no job status changed",
            "no real operations handover workflow",
            "shift scheduling workflow",
            "customer account & service profile workbench",
            "internal/admin-only regular customer/account service profile preview",
            "regular customer/account service profiles",
            "mock service preference and billing-readiness review",
            "3 account rows maximum",
            "primary booker/contact",
            "billing contact readiness",
            "service preference summary",
            "usual service pattern",
            "vip/special handling notes",
            "monthly billing readiness",
            "open operations note",
            "internal review status",
            "billing contact confirmed",
            "billing contact needs confirmation",
            "no customer profile saved",
            "no crm/account record created",
            "no billing contact saved",
            "no monthly billing activated",
            "no real customer account/profile workflow",
            "crm record creation",
            "billing contact persistence",
            "monthly billing activation",
            "booking intake quality & account matching workbench",
            "internal/admin-only booking intake quality and customer/account matching preview",
            "mock parser/manual review and dispatcher intake qa",
            "3 booking intake rows maximum",
            "plo-intake-match-ubs",
            "plo-intake-manual-personal",
            "plo-intake-missing-detail",
            "ubs matched from organization domain ubs.com",
            "public/personal email domain - no company/account created",
            "prestige transport ignored as own company",
            "parser/manual review required - no parser change made",
            "manual account review separate from parser behavior",
            "drop-off or flight detail incomplete",
            "dispatch handoff ready in mock review",
            "dispatch handoff blocked in mock review",
            "no parser change",
            "mock only. no parser change, no booking saved, no account linked",
            "no account linked",
            "no customer/contact record created",
            "no dispatch job created",
            "no parser behavior changes",
            "parser test changes",
            "customer/account matching workflow",
            "booking save/load behavior",
            "account linking",
            "dispatch job creation",
            "airport flight monitoring & pickup readiness workbench",
            "internal/admin-only airport pickup readiness preview",
            "mock dispatcher airport timing and fbo review",
            "3 airport pickup rows maximum",
            "plo-air-ready-changi-arr",
            "plo-air-ready-changi-dep",
            "plo-air-ready-seletar-fbo",
            "flight/tail number",
            "scheduled pickup window",
            "driver staging status",
            "meet-and-greet readiness",
            "seletar airport / wssl / jet aviation fbo",
            "private-jet airport location",
            "not converted to changi",
            "no flight api connected",
            "no live flight tracking activated",
            "no maps or traffic api connected",
            "no airport/fbo confirmation sent",
            "no real flight api behavior",
            "maps/traffic api behavior",
            "airport/fbo confirmation sending",
            "route & itinerary readiness workbench",
            "internal/admin-only route and itinerary readiness preview",
            "mock dispatcher route and itinerary review",
            "3 route/itinerary rows maximum",
            "plo-route-ready-airport",
            "plo-route-ready-multistop",
            "plo-route-ready-vip-child",
            "route readiness reference",
            "pickup readiness",
            "drop-off readiness",
            "route/waypoint summary",
            "timing readiness",
            "passenger/contact readiness",
            "special handling/child seat note",
            "route exception risk",
            "dispatch handoff readiness",
            "ritz-carlton > gardens by the bay > national gallery > raffles hotel",
            "preserve all later waypoints",
            "extra stops shown as itinerary context only",
            "child seat note pending final confirmation",
            "no route optimization",
            "no maps or geocoding api connected",
            "no traffic api connected",
            "no real route optimization behavior",
            "maps/geocoding/traffic api behavior",
            "driver assignment & dispatch readiness workbench",
            "internal/admin-only driver assignment and dispatch readiness preview",
            "mock dispatcher driver/vehicle pairing review",
            "3 driver assignment rows maximum",
            "plo-disp-ready-airport",
            "plo-disp-ready-vip-hourly",
            "plo-disp-ready-transfer-hold",
            "dispatch readiness reference",
            "proposed driver/vehicle pairing",
            "proposed driver: kumar tan",
            "proposed driver: lee wei",
            "proposed driver: siva kumar",
            "proposed vehicle/plate",
            "driver contact readiness",
            "driver acknowledgement readiness",
            "schedule overlap risk",
            "customer update readiness",
            "schedule overlap warning only",
            "dispatcher may intentionally assign same driver",
            "warning without blocking or hiding drivers",
            "customer update not prepared - no message sent",
            "no driver assigned, no vehicle assigned",
            "no driver acknowledgement sent",
            "no schedule changed",
            "no real driver assignment",
            "driver acknowledgement behavior",
            "booking lifecycle timeline & internal audit readiness workbench",
            "internal/admin-only booking lifecycle timeline",
            "mock dispatcher/admin lifecycle timeline",
            "3 lifecycle rows maximum",
            "plo-life-audit-airport",
            "plo-life-audit-vip-multi",
            "plo-life-audit-recovery",
            "lifecycle reference",
            "current lifecycle stage",
            "intake/account status",
            "route/itinerary status",
            "driver assignment status",
            "dispatch/customer update status",
            "completion/closeout status",
            "service recovery/exception status",
            "internal audit readiness",
            "audit readiness mock-ready",
            "no audit trail created",
            "no booking lifecycle saved",
            "no real booking lifecycle workflow",
            "audit trail creation",
            "audit logging",
            "operations risk & sla watchlist workbench",
            "internal/admin-only operations risk and sla watchlist",
            "mock dispatcher/admin risk desk",
            "3 risk watchlist rows maximum",
            "plo-risk-sla-vip-airport",
            "plo-risk-sla-recovery-update",
            "plo-risk-sla-finance-closeout",
            "risk reference",
            "sla/timing window",
            "risk severity",
            "owner/responsible desk",
            "customer / fleet impact",
            "closeout/finance impact",
            "vip airport pickup timing watch",
            "customer update risk after service recovery",
            "finance/closeout evidence risk",
            "customer update readiness pending",
            "exception evidence pending",
            "no sla alert created",
            "no risk task saved",
            "no real sla alerting workflow",
            "operations risk workflow",
            "sla alerting",
            "quote & pricing review readiness workbench",
            "internal/admin-only quote and pricing review readiness",
            "mock dispatcher/admin quote desk",
            "3 quote/pricing rows maximum",
            "plo-quote-ready-corp-airport",
            "plo-quote-ready-vip-hourly",
            "plo-quote-ready-recovery-nocharge",
            "quote review reference",
            "rate/price basis",
            "quoted amount status",
            "manual extra charge review",
            "discount/goodwill review",
            "approval readiness",
            "margin/risk note",
            "customer quote handoff readiness",
            "quoted amount ready - display-only",
            "manual extra charge note present",
            "goodwill/no-charge review pending",
            "customer quote handoff blocked",
            "no quote sent",
            "no quoted amount saved",
            "no pricing calculation created",
            "no real quote workflow",
            "pricing automation",
            "quote automation",
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
      assertNoMobileDriverPriceFinanceLeaks(state.visibleText, `${viewport.label} ${context}`);
      assertNoMobileAdminBookingPersistenceLeaks(state.visibleText, `${viewport.label} ${context}`);
      assertNoMobileNativeAppOnlyLanguage(state.visibleText, `${viewport.label} ${context}`);
      assertNoMobileAdminPersistenceNetworkCalls(
        adminPersistenceNetworkCalls,
        `${viewport.label} ${context}`,
      );
      assertButtonTouchTargets(buttons, labels, `${viewport.label} ${context}`);
      assert.equal(adminHubVisible, false, `${viewport.label} ${context}: expected no admin access hub`);
      assert.equal(
        adminDispatchRecoveryReplacementReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no admin dispatch recovery replacement readiness`,
      );
      assert.equal(
        adminPostRecoveryUpdateReadinessVisible,
        false,
        `${viewport.label} ${context}: expected no admin post-recovery update readiness`,
      );
      assert.equal(
        adminDayOfTripCompletionHandoffVisible,
        false,
        `${viewport.label} ${context}: expected no admin day-of-trip completion handoff`,
      );
      assert.equal(
        adminCompletedTripCloseoutReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin completed trip closeout review`,
      );
      assert.equal(
        adminCloseoutToBillingPreparationReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin closeout to billing preparation review`,
      );
      assert.equal(
        adminBillingPreparationExceptionReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin billing preparation exception review`,
      );
      assert.equal(
        adminBillingPreparationSummaryReadyReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin billing preparation summary ready review`,
      );
      assert.equal(
        adminMonthlyBillingQueueReadinessReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin monthly billing queue readiness review`,
      );
      assert.equal(
        adminMonthlyBillingQueueExceptionReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin monthly billing queue exception review`,
      );
      assert.equal(
        adminMonthlyBillingMonthGroupingReviewVisible,
        false,
        `${viewport.label} ${context}: expected no admin monthly billing month grouping review`,
      );
      assert.equal(
        adminAppNotificationFeedVisible,
        false,
        `${viewport.label} ${context}: expected no admin app notification feed`,
      );
      assert.equal(
        internalQaMockArchiveVisible,
        false,
        `${viewport.label} ${context}: expected no internal QA mock archive`,
      );
      assert.deepEqual(
        internalQaMockArchiveTextLeaks,
        [],
        `${viewport.label} ${context}: expected no internal QA mock archive text`,
      );
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
      assert.equal(
        mockExtraChargesControlCenterVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock extra charges control center`,
      );
      assert.equal(
        mockCompletedJobCloseoutCenterVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock completed job closeout center`,
      );
      assert.equal(
        mockMonthEndCloseoutWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock month-end closeout workbench`,
      );
      assert.equal(
        mockFinanceExceptionResolutionWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock finance exception resolution workbench`,
      );
      assert.equal(
        mockDriverJobCompletionExceptionIntakeWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock driver job completion exception intake workbench`,
      );
      assert.equal(
        mockReplacementVehicleServiceRecoveryWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock replacement vehicle service recovery workbench`,
      );
      assert.equal(
        mockCustomerServiceRecoveryCommunicationWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock customer service recovery communication workbench`,
      );
      assert.equal(
        mockFleetDriverReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock fleet driver readiness workbench`,
      );
      assert.equal(
        mockOperationsHandoverShiftBriefingWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock operations handover shift briefing workbench`,
      );
      assert.equal(
        mockCustomerAccountServiceProfileWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock customer account service profile workbench`,
      );
      assert.equal(
        mockBookingIntakeAccountMatchingWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock booking intake account matching workbench`,
      );
      assert.equal(
        mockAirportFlightPickupReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock airport flight pickup readiness workbench`,
      );
      assert.equal(
        mockRouteItineraryReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock route itinerary readiness workbench`,
      );
      assert.equal(
        mockDriverAssignmentDispatchReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock driver assignment dispatch readiness workbench`,
      );
      assert.equal(
        mockBookingLifecycleAuditReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock booking lifecycle audit readiness workbench`,
      );
      assert.equal(
        mockOperationsRiskSlaWatchlistWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock operations risk SLA watchlist workbench`,
      );
      assert.equal(
        mockQuotePricingReviewReadinessWorkbenchVisible,
        false,
        `${viewport.label} ${context}: expected no admin mock quote pricing review readiness workbench`,
      );
      assert.deepEqual(
        mockExtraChargesVarianceApprovalReconciliationTextLeaks,
        [],
        `${viewport.label} ${context}: expected no internal extra charges, finance, driver completion, replacement recovery, customer recovery communication, fleet readiness, operations handover, customer account profile, booking intake, airport readiness, route itinerary, driver assignment dispatch, booking lifecycle audit, operations risk SLA, or quote pricing review text leak`,
      );
      if (context === "driver job demo") {
        assert.equal(
          state.visibleText.includes(
            "Mobile web driver card. Keep this link with the assigned job and review route details before each status update.",
          ),
          true,
          `${viewport.label} ${context}: expected mobile-web driver demo guidance`,
        );
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
          state.visibleText.includes(
            "Mobile web driver card. Keep this link private and use it only for this assigned job.",
          ),
          true,
          `${viewport.label} ${context}: expected mobile-web driver job guidance`,
        );
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
      await waitForCondition(
        () =>
          evaluate(`(() => {
            const recentArticle = [...document.querySelectorAll("article")].find((article) =>
              article.innerText.includes("MOBILE USABILITY TRAVELER")
            );
            const details = recentArticle?.querySelector("[data-recent-operational-details]");
            const summary = details?.querySelector("summary");

            if (!details || !summary) {
              return false;
            }

            if (!details.open) {
              summary.click();
            }

            return details.open;
          })()`),
        10000,
        "open compact Recent Bookings details",
      );
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
        `${viewport.label}: expected Recent Bookings card to group booking, route, and vehicle/pax sections`,
      );
      for (const expectedText of ["BOOKING", "ROUTE", "VEHICLE / PAX"]) {
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
      const dashboardActiveJobState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const activeJobCard = [...document.querySelectorAll("[data-admin-multi-driver-active-job]")].find((card) =>
              card.innerText.includes("MOBILE USABILITY DRIVER") &&
              card.innerText.includes("Changi Airport Terminal 3 Departure Door 5")
            );
            if (!activeJobCard) {
              return false;
            }
            return {
              reportVisible: Boolean(activeJobCard.querySelector("[data-admin-multi-driver-active-job-driver-report]")),
              text: activeJobCard.innerText,
            };
          })()`),
        10000,
        "dashboard active job monitor card",
      );
      for (const expectedText of [
        "MOBILE USABILITY DRIVER",
        "Changi Airport Terminal 3 Departure Door 5",
        "The Fullerton Hotel Singapore",
        "Driver report:",
      ]) {
        assert.equal(
          dashboardActiveJobState.text.includes(expectedText),
          true,
          `${viewport.label}: expected dashboard active job monitor to include ${expectedText}`,
        );
      }
      assert.equal(
        dashboardActiveJobState.reportVisible,
        true,
        `${viewport.label}: expected dashboard active job monitor to include driver report panel`,
      );
      assertNoHorizontalOverflow(await layoutState(), `${viewport.label} dashboard active job monitor`);
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
        previewState.text.includes("Create a fresh driver job link to display the one-time URL for copying."),
        true,
        `${viewport.label}: expected Driver Job Link preview to use guarded create-before-copy wording`,
      );
      assert.equal(
        /mock-driver-job-valid-a|driver-job-demo|Mock\/demo driver job link|Local demo link/.test(previewState.text),
        false,
        `${viewport.label}: expected Driver Job Link preview not to use mock/demo token wording`,
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
      reporter.step(`checking viewport matrix: ${viewport.label}`);
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
        "Save & Acknowledge Job",
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
    console.log(JSON.stringify(reporter.summary({
      consoleErrorCount: consoleErrors.length,
      errorCount: errors.length,
      ok: true,
      publicRoutesPerViewport: responsiveRoutes.length + 2,
      verboseHint: "Set PRESTIGE_BROWSER_TEST_VERBOSE=1 for verbose browser diagnostics.",
      viewports: viewports.map((viewport) => viewport.label),
    }), null, 2));
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

    await terminateChildProcess(chrome);
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
process.exit(0);
