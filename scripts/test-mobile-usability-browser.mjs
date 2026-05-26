import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createChromeClient,
  navigateWithLoadEvent,
  normalizeConsoleMessages,
  normalizeErrorMessage,
  waitForChildExit,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
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
  { height: 667, label: "phone 375px", mobile: true, scale: 2, width: 375 },
  { height: 844, label: "phone 390px", mobile: true, scale: 3, width: 390 },
  { height: 915, label: "phone 412px", mobile: true, scale: 2.625, width: 412 },
  { height: 1024, label: "tablet 768px", mobile: true, scale: 2, width: 768 },
  { height: 900, label: "desktop 1440px", mobile: false, scale: 1, width: 1440 },
];
const appTabs = ["Dispatch", "Bookings", "Completed", "Dashboard", "Drivers", "Rates"];
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
      await navigateWithLoadEvent(client, url);
      await waitForCondition(
        () => evaluate(`document.body?.innerText.includes(${JSON.stringify(expectedText)})`),
        10000,
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
              right: Math.round(rect.right),
              tag: element.tagName.toLowerCase(),
              text: (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80),
              width: Math.round(rect.width),
            };
          })
          .filter((element) => element.right > viewportWidth + 2);

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

    const checkMainAppViewport = async (viewport) => {
      await setViewport(viewport);
      await navigate(appUrl, "Prestige Limo Ops Dispatch");
      await waitForCondition(
        () =>
          evaluate(`(() => {
            const labels = [...document.querySelectorAll("button[role='tab']")].map(
              (button) => button.textContent.trim(),
            );

            return ${JSON.stringify(appTabs)}.every((label) => labels.includes(label));
          })()`),
        10000,
        `${viewport.label} app tabs`,
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
      await waitForCondition(
        () => evaluate(`document.body.innerText.includes("MOBILE USABILITY TRAVELER")`),
        10000,
        "mock loaded booking",
      );
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

        await waitForCondition(
          () =>
            evaluate(`Boolean(document.querySelector(${JSON.stringify(`[data-copy-edit-textarea="${editTarget}"]`)}))`),
          10000,
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

    for (const viewport of viewports) {
      await checkMainAppViewport(viewport);
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
