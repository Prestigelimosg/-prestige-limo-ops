import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9226);
const browserErrors = [];
const browserConsoleErrors = [];
const tabLabels = ["Dispatch", "Bookings", "Completed", "Dashboard", "Drivers", "Rates"];
const tabExpectedText = {
  Dispatch: "Create Job Card",
  Bookings: "Load Bookings",
  Completed: "No completed bookings loaded yet.",
  Dashboard: "Operations Dashboard",
  Drivers: "Driver Database",
  Rates: "Load Rates",
};
const responsiveTabViewports = [
  { height: 667, label: "mobile 375px", mobile: true, scale: 2, width: 375 },
  { height: 915, label: "mobile 412px", mobile: true, scale: 2.625, width: 412 },
  { height: 1024, label: "iPad/tablet 768px", mobile: true, scale: 2, width: 768 },
  { height: 1366, label: "Android tablet 1024px", mobile: false, scale: 1, width: 1024 },
  { height: 900, label: "desktop 1440px", mobile: false, scale: 1, width: 1440 },
];
const driverDemoUrl = new URL("/driver-job-demo", appUrl).toString();
const driverDemoViewports = [
  { height: 568, label: "small phone 320px", mobile: true, scale: 2, width: 320 },
  { height: 667, label: "mobile 375px", mobile: true, scale: 2, width: 375 },
  { height: 915, label: "mobile 412px", mobile: true, scale: 2.625, width: 412 },
  { height: 1024, label: "tablet 768px", mobile: true, scale: 2, width: 768 },
  { height: 900, label: "desktop 1440px", mobile: false, scale: 1, width: 1440 },
];
const requiredVisibleText = [
  "Prestige Limo",
  "Booking",
  "Pricing",
  "Route Extras & Child Seat",
  "Job Card Preview",
  "Driver Dispatch",
  "Load Bookings",
  "No completed bookings loaded yet.",
  "Operations Dashboard",
  "Driver Database",
  "Save Driver Profile",
  "Rates",
  "Saved Rate Overrides",
];
const forbiddenRuntimeText = [
  "formatOverrideSummary is not defined",
  "ReferenceError",
  "TypeError",
  "Unhandled Runtime Error",
];

function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function waitForChildExit(childProcess, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(undefined);
    }, timeoutMs);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeConsoleMessages(values) {
  return values.map(String).join(" ");
}

async function waitForCondition(check, timeoutMs = 10000, description = "browser condition") {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();

    if (value) {
      return value;
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

function createChromeClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const eventListeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));

    if (typeof message.id === "number") {
      const pendingRequest = pending.get(message.id);

      if (!pendingRequest) {
        return;
      }

      pending.delete(message.id);

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message));
        return;
      }

      pendingRequest.resolve(message.result);
      return;
    }

    const listeners = eventListeners.get(message.method) ?? [];
    for (const listener of listeners) {
      listener(message.params ?? {});
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(method, listener) {
    const listeners = eventListeners.get(method) ?? [];
    listeners.push(listener);
    eventListeners.set(method, listeners);
  }

  function once(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listener = (params) => {
        clearTimeout(timeout);
        const listeners = eventListeners.get(method) ?? [];
        eventListeners.set(
          method,
          listeners.filter((candidate) => candidate !== listener),
        );
        resolve(params);
      };

      on(method, listener);
    });
  }

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(undefined), { once: true });
    socket.addEventListener(
      "error",
      (event) => {
        reject(event.error || new Error("Chrome DevTools WebSocket connection failed"));
      },
      { once: true },
    );
  });

  async function close() {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      await sleep(100);
    }
  }

  return {
    close,
    on,
    once,
    ready,
    send,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function waitForChromeDebugPort() {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 10000) {
    try {
      await fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/version`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }

  throw new Error(
    `Chrome remote debugging did not become ready: ${normalizeErrorMessage(lastError)}`,
  );
}

async function waitForChromePageTarget() {
  return waitForCondition(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/list`);

    return (
      targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) || false
    );
  });
}

function assertAppSmokeState(state) {
  const combinedErrors = [...state.errors, ...state.consoleErrors].join("\n");
  const combinedVisibleAndErrors = `${state.visibleText}\n${combinedErrors}`;
  const missingText = requiredVisibleText.filter((text) => !state.visibleText.includes(text));
  const forbiddenTextFound = forbiddenRuntimeText.filter((text) =>
    combinedVisibleAndErrors.includes(text),
  );

  assert.deepEqual(state.errors, [], `Expected no runtime errors:\n${state.errors.join("\n")}`);
  assert.deepEqual(
    state.consoleErrors,
    [],
    `Expected no browser console errors:\n${state.consoleErrors.join("\n")}`,
  );
  assert.deepEqual(missingText, [], `Missing visible smoke-test text: ${missingText.join(", ")}`);
  assert.deepEqual(
    forbiddenTextFound,
    [],
    `Forbidden runtime text appeared: ${forbiddenTextFound.join(", ")}`,
  );
}

async function runChromeTest() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-app-smoke-chrome-"));
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
    await waitForChromeDebugPort();

    const target = await waitForChromePageTarget();
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

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: appUrl });
    await loadEvent;

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });

      return result.result?.value;
    };

    const clickTab = async (label) => {
      const clicked = await evaluate(`(() => {
        const tab = [...document.querySelectorAll("button[role='tab']")].find(
          (button) => button.textContent.trim() === ${JSON.stringify(label)},
        );

        if (!tab || tab.disabled) {
          return false;
        }

        tab.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected ${label} tab to be clickable`);

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const selectedTab = [...document.querySelectorAll("button[role='tab']")].find(
              (button) =>
                button.textContent.trim() === ${JSON.stringify(label)} &&
                button.getAttribute("aria-selected") === "true",
            );
            const expectedText = ${JSON.stringify(tabExpectedText[label] || "")};

            return Boolean(selectedTab) && (!expectedText || document.body.innerText.includes(expectedText));
          })()`),
        10000,
        `${label} tab content`,
      );
    };

    const waitForTabs = () =>
      waitForCondition(
        () =>
          evaluate(`(() => {
            const labels = [...document.querySelectorAll("button[role='tab']")].map(
              (button) => button.textContent.trim(),
            );

            return ${JSON.stringify(tabLabels)}.every((label) => labels.includes(label));
          })()`),
        10000,
        "Prestige Limo app tabs",
      );

    const setViewportAndReload = async (viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      const viewportLoadEvent = client.once("Page.loadEventFired");
      await client.send("Page.navigate", { url: appUrl });
      await viewportLoadEvent;
      await waitForTabs();
    };

    const checkResponsiveTabs = async (viewport) => {
      await setViewportAndReload(viewport);

      const tabStates = [];
      for (const label of tabLabels) {
        await clickTab(label);
        const tabState = await evaluate(`(() => {
          const doc = document.documentElement;
          const nav = document.querySelector("nav[role='tablist']");
          const buttons = [...document.querySelectorAll("button[role='tab']")].map((button) => {
            const rect = button.getBoundingClientRect();

            return {
              bottom: Math.round(rect.bottom),
              height: Math.round(rect.height),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              selected: button.getAttribute("aria-selected") === "true",
              text: button.textContent.trim(),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
            };
          });
          const selected = buttons.find((button) => button.selected);
          const expectedText = ${JSON.stringify(tabExpectedText)}[${JSON.stringify(label)}] || "";

          return {
            activeTab: selected?.text || "",
            bodyScrollWidth: document.body.scrollWidth,
            docClientWidth: doc.clientWidth,
            docScrollWidth: doc.scrollWidth,
            expectedTextVisible: expectedText ? document.body.innerText.includes(expectedText) : true,
            navClientWidth: nav?.clientWidth || 0,
            navScrollWidth: nav?.scrollWidth || 0,
            tabButtons: buttons,
          };
        })()`);

        const overflowingWidth = Math.max(tabState.docScrollWidth, tabState.bodyScrollWidth);
        const offscreenTabs = tabState.tabButtons.filter(
          (button) => button.left < 0 || button.right > tabState.docClientWidth || button.width <= 0,
        );
        const smallTouchTargets = tabState.tabButtons.filter(
          (button) => button.height < 40 || button.width < 64,
        );

        assert.equal(
          overflowingWidth <= tabState.docClientWidth + 2,
          true,
          `${viewport.label} ${label}: expected no document-level horizontal overflow`,
        );
        assert.equal(
          tabState.navScrollWidth <= tabState.navClientWidth + 2,
          true,
          `${viewport.label} ${label}: expected tabs not to require horizontal scrolling`,
        );
        assert.deepEqual(
          offscreenTabs,
          [],
          `${viewport.label} ${label}: expected all tabs visible within viewport`,
        );
        assert.deepEqual(
          smallTouchTargets,
          [],
          `${viewport.label} ${label}: expected comfortable tab touch targets`,
        );
        assert.equal(tabState.activeTab, label, `${viewport.label}: expected selected tab ${label}`);
        assert.equal(
          tabState.expectedTextVisible,
          true,
          `${viewport.label} ${label}: expected tab content to be visible`,
        );

        if (label === "Dispatch") {
          const dispatchControlsVisible = await evaluate(`document.body.innerText.includes("AI Assist Parse (Mock)") &&
            document.body.innerText.includes("Create Job Card") &&
            document.body.innerText.includes("Clear Message")`);
          assert.equal(
            dispatchControlsVisible,
            true,
            `${viewport.label}: expected Dispatch tab controls visible`,
          );
        }

        tabStates.push({
          activeTab: tabState.activeTab,
          docClientWidth: tabState.docClientWidth,
          docScrollWidth: tabState.docScrollWidth,
          label,
          navClientWidth: tabState.navClientWidth,
          navScrollWidth: tabState.navScrollWidth,
          tabButtons: tabState.tabButtons.map((button) => ({
            height: button.height,
            text: button.text,
            width: button.width,
          })),
          viewport: viewport.label,
        });
      }

      return tabStates;
    };

    const setDriverDemoViewportAndLoad = async (viewport) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: viewport.scale,
        height: viewport.height,
        mobile: viewport.mobile,
        width: viewport.width,
      });

      const viewportLoadEvent = client.once("Page.loadEventFired");
      await client.send("Page.navigate", { url: driverDemoUrl });
      await viewportLoadEvent;
      await waitForCondition(
        () => evaluate(`document.body.innerText.includes("Prestige Limo Driver Job")`),
        10000,
        `${viewport.label} driver job demo route`,
      );
      await evaluate(`(() => {
        window.__driverDemoFetchCalls = [];
        const originalFetch = window.__driverDemoOriginalFetch || window.fetch.bind(window);
        window.__driverDemoOriginalFetch = originalFetch;
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          const url = String(target);

          window.__driverDemoFetchCalls.push(\`\${method} \${url}\`);

          if (url.includes("/rest/v1/drivers")) {
            return Promise.resolve(
              new Response(JSON.stringify({ message: "Driver demo must not access Driver Database from the browser" }), {
                status: 500,
                headers: { "content-type": "application/json" },
              }),
            );
          }

          return originalFetch(...args);
        };
      })()`);
    };

    const clickDriverDemoButton = async (selector, description) => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected ${description} button to be clickable`);
    };

    const checkDriverDemoRoute = async (viewport) => {
      await setDriverDemoViewportAndLoad(viewport);

      const initialState = await evaluate(`(() => {
        const text = document.body.innerText;
        const lowerText = text.toLowerCase();
        const doc = document.documentElement;
        const body = document.body;
        const inputs = [...document.querySelectorAll("input")].map((input) => ({
          height: Math.round(input.getBoundingClientRect().height),
          label: input.closest("label")?.innerText.trim() || "",
          type: input.getAttribute("type") || "",
          width: Math.round(input.getBoundingClientRect().width),
        }));
        const textareas = [...document.querySelectorAll("textarea")].map((textarea) => ({
          height: Math.round(textarea.getBoundingClientRect().height),
          label: textarea.closest("label")?.innerText.trim() || "",
          width: Math.round(textarea.getBoundingClientRect().width),
        }));
        const buttons = [...document.querySelectorAll("button")].map((button) => ({
          className: button.className,
          height: Math.round(button.getBoundingClientRect().height),
          text: button.textContent.trim(),
          width: Math.round(button.getBoundingClientRect().width),
        }));

        return {
          adminTabsVisible: document.querySelectorAll("button[role='tab']").length,
          activityLogLabels: [...document.querySelectorAll("[data-driver-demo-activity-log-label]")]
            .map((item) => item.textContent.trim()),
          bodyScrollWidth: body.scrollWidth,
          buttonLabels: buttons.map((button) => button.text),
          buttons,
          docClientWidth: doc.clientWidth,
          docScrollWidth: doc.scrollWidth,
          forbiddenText: [
            "pricing",
            "payout",
            "crm",
            "booker email",
            "internal notes",
            "dispatch",
            "dashboard",
            "driver database",
            "rates",
          ].filter((value) => lowerText.includes(value)),
          inputs,
          text,
          textareas,
          warningVisible: Boolean(document.querySelector("[data-driver-demo-warning]")),
        };
      })()`);

      const overflowingWidth = Math.max(initialState.docScrollWidth, initialState.bodyScrollWidth);
      const smallInputs = initialState.inputs.filter((input) => input.height < 44 || input.width < 220);
      const smallTextareas = initialState.textareas.filter((textarea) => textarea.height < 96 || textarea.width < 220);
      const smallButtons = initialState.buttons.filter((button) => button.height < 44 || button.width < 96);

      assert.equal(
        overflowingWidth <= initialState.docClientWidth + 2,
        true,
        `${viewport.label}: expected driver demo to avoid horizontal document overflow`,
      );
      assert.equal(initialState.warningVisible, true, `${viewport.label}: expected driver demo warning`);
      assert.equal(initialState.adminTabsVisible, 0, `${viewport.label}: expected no admin tabs`);
      assert.deepEqual(
        initialState.forbiddenText,
        [],
        `${viewport.label}: expected no pricing, payout, CRM, or admin text on driver demo`,
      );
      assert.deepEqual(
        ["Driver name", "Mobile number", "Car plate", "Vehicle model"].filter(
          (label) => !initialState.inputs.some((input) => input.label.includes(label)),
        ),
        [],
        `${viewport.label}: expected all driver detail fields`,
      );
      assert.deepEqual(
        initialState.inputs.map((input) => input.type),
        ["text", "tel", "text", "text"],
        `${viewport.label}: expected mobile-friendly input types`,
      );
      assert.deepEqual(
        ["Paste Driver Details"].filter(
          (label) => !initialState.textareas.some((textarea) => textarea.label.includes(label)),
        ),
        [],
        `${viewport.label}: expected driver details paste textarea`,
      );
      assert.deepEqual(smallInputs, [], `${viewport.label}: expected comfortable driver inputs`);
      assert.deepEqual(smallTextareas, [], `${viewport.label}: expected comfortable paste textarea`);
      assert.deepEqual(smallButtons, [], `${viewport.label}: expected comfortable driver buttons`);
      assert.deepEqual(
        [
          "Acknowledge Job",
          "Activate Mock Live Location",
          "Acknowledge Latest ETA",
          "Parse Driver Details",
          "Save",
          "OTW",
          "OTS",
          "POB",
          "Job Completed",
        ].filter(
          (label) => !initialState.buttonLabels.includes(label),
        ),
        [],
        `${viewport.label}: expected all driver action buttons`,
      );
      assert.deepEqual(
        ["Acknowledge Job", "Parse Driver Details", "Save"].filter((label) => {
          const button = initialState.buttons.find((candidate) => candidate.text === label);
          return !button?.className.includes("bg-slate-950") || !button.className.includes("text-white");
        }),
        [],
        `${viewport.label}: expected driver details actions to use primary button styling`,
      );
      assert.equal(
        initialState.text.includes("Demo only — not connected to live bookings yet."),
        true,
        `${viewport.label}: expected exact demo-only warning`,
      );
      assert.equal(
        initialState.text.includes("Mock Latest Flight ETA"),
        true,
        `${viewport.label}: expected mock latest flight ETA section`,
      );
      assert.equal(
        initialState.text.includes("Latest mock flight ETA: 15:45"),
        true,
        `${viewport.label}: expected mock latest flight ETA value`,
      );
      assert.equal(
        initialState.text.includes("Mock/local only. No real flight API is called and no notification is sent."),
        true,
        `${viewport.label}: expected mock/local latest ETA explanation`,
      );
      assert.equal(
        initialState.text.includes("Driver Activity Log"),
        true,
        `${viewport.label}: expected driver activity log section`,
      );
      assert.deepEqual(
        initialState.activityLogLabels,
        [],
        `${viewport.label}: expected empty driver activity log before successful actions`,
      );

      const preAcknowledgementFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
      const preAcknowledgementLogLabels = await evaluate(
        `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
      );
      await clickDriverDemoButton("[data-driver-demo-status=\"OTW\"]", `${viewport.label} blocked pre-ack OTW`);
      const preAcknowledgementStatusState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-status='OTW']");
            const message = document.querySelector("[data-driver-demo-status-message='OTW']");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Acknowledge this job before updating status." &&
              document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() === "Assigned"
              ? {
                  currentStatus: "Assigned",
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  fetchCount: (window.__driverDemoFetchCalls || []).length,
                  messageText: message.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} pre-acknowledgement status block`,
      );
      assert.equal(preAcknowledgementStatusState.currentStatus, "Assigned");
      assert.equal(preAcknowledgementStatusState.fetchCount, preAcknowledgementFetchCount);
      assert.deepEqual(
        await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
        preAcknowledgementLogLabels,
        `${viewport.label}: expected blocked pre-ack OTW not to create a log entry`,
      );
      assert.equal(
        preAcknowledgementStatusState.distance <= 16,
        true,
        `${viewport.label}: expected pre-acknowledgement status feedback close to OTW`,
      );

      const preAcknowledgementLiveLocationFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
      const preAcknowledgementLiveLocationLogLabels = await evaluate(
        `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
      );
      await clickDriverDemoButton(
        "[data-driver-demo-live-location]",
        `${viewport.label} blocked pre-ack mock live location`,
      );
      const preAcknowledgementLiveLocationState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-live-location]");
            const message = document.querySelector("[data-driver-demo-live-location-message]");
            const state = document.querySelector("[data-driver-demo-live-location-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Acknowledge this job before activating mock live location." &&
              state?.textContent.trim() === "Mock live location inactive"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  fetchCount: (window.__driverDemoFetchCalls || []).length,
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} pre-acknowledgement mock live location block`,
      );
      assert.equal(preAcknowledgementLiveLocationState.fetchCount, preAcknowledgementLiveLocationFetchCount);
      assert.deepEqual(
        await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
        preAcknowledgementLiveLocationLogLabels,
        `${viewport.label}: expected blocked pre-ack mock live location not to create a log entry`,
      );
      assert.equal(
        preAcknowledgementLiveLocationState.distance <= 16,
        true,
        `${viewport.label}: expected pre-acknowledgement live location feedback close to button`,
      );

      await clickDriverDemoButton("[data-driver-demo-acknowledge]", `${viewport.label} Acknowledge Job`);
      const acknowledgedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-acknowledge]");
            const message = document.querySelector("[data-driver-demo-acknowledge-message]");
            const acknowledged = document.querySelector("[data-driver-demo-acknowledged-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Job acknowledged locally for this mock driver page." &&
              acknowledged?.textContent.trim() === "Acknowledged"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  stateText: acknowledged.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} acknowledgement message`,
      );
      assert.equal(acknowledgedState.stateText, "Acknowledged");
      assert.equal(
        acknowledgedState.distance <= 16,
        true,
        `${viewport.label}: expected acknowledgement feedback close to Acknowledge Job`,
      );

      const liveLocationFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
      await clickDriverDemoButton(
        "[data-driver-demo-live-location]",
        `${viewport.label} Activate Mock Live Location`,
      );
      const liveLocationState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-live-location]");
            const message = document.querySelector("[data-driver-demo-live-location-message]");
            const state = document.querySelector("[data-driver-demo-live-location-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() ===
              "Mock live location active locally for this mock driver page. No phone location is captured or sent." &&
              state?.textContent.trim() === "Mock live location active"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  fetchCount: (window.__driverDemoFetchCalls || []).length,
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} mock live location activation`,
      );
      assert.equal(liveLocationState.fetchCount, liveLocationFetchCount);
      assert.equal(
        liveLocationState.distance <= 16,
        true,
        `${viewport.label}: expected mock live location feedback close to button`,
      );

      const parseDriverDetailsSample = async (sample, description) => {
        const pastedDriverDetails = await evaluate(`(() => {
          const textarea = document.querySelector("[data-driver-demo-paste-details]");
          if (!textarea) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
          setter?.call(textarea, ${JSON.stringify(sample)});
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        })()`);
        assert.equal(pastedDriverDetails, true, `${viewport.label}: expected paste textarea to accept ${description}`);

        await clickDriverDemoButton("[data-driver-demo-parse-details]", `${viewport.label} Parse Driver Details`);
        return waitForCondition(
          () =>
            evaluate(`(() => {
              const parseButton = document.querySelector("[data-driver-demo-parse-details]");
              const parseMessage = document.querySelector("[data-driver-demo-parse-message]");
              const paymentHelper = document.querySelector("[data-driver-demo-payment-helper]");
              const buttonRect = parseButton?.getBoundingClientRect();
              const messageRect = parseMessage?.getBoundingClientRect();

              const state = {
                databaseCheckVisible: Boolean(document.querySelector("[data-driver-demo-database-check]")),
                overwritePromptVisible: Boolean(document.querySelector("[data-driver-demo-overwrite-prompt]")),
                helperText: paymentHelper?.textContent.trim() || "",
                messageDistance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                messageText: parseMessage?.textContent.trim() || "",
                mobile: document.querySelector("[data-driver-demo-mobile]")?.value || "",
                name: document.querySelector("[data-driver-demo-name]")?.value || "",
                plate: document.querySelector("[data-driver-demo-plate]")?.value || "",
                vehicleModel: document.querySelector("[data-driver-demo-vehicle-model]")?.value || "",
              };

              return state.messageText === "Driver details parsed. Please review before saving." &&
                state.databaseCheckVisible === false &&
                state.overwritePromptVisible === false &&
                state.helperText === "Payment details were detected but not saved in this demo."
                ? state
                : false;
            })()`),
          10000,
          `${viewport.label} parsed ${description}`,
        );
      };

      const labelledDriverDetails = [
        "Name: Ah Seng",
        "Contact: 91234567",
        "Plate: S1234Z",
        "Vehicle model: Toyota Alphard",
        "PayNow: 81234567",
        "Bank: 123-456-789",
      ].join("\n");

      const labelledDetailsState = await parseDriverDetailsSample(labelledDriverDetails, "labelled driver details");
      assert.equal(labelledDetailsState.name, "Ah Seng");
      assert.equal(labelledDetailsState.mobile, "91234567");
      assert.equal(labelledDetailsState.plate, "S1234Z");
      assert.equal(labelledDetailsState.vehicleModel, "Toyota Alphard");
      assert.equal(
        labelledDetailsState.messageDistance <= 16,
        true,
        `${viewport.label}: expected parse feedback close to Parse Driver Details`,
      );
      assert.notEqual(
        labelledDetailsState.mobile,
        "81234567",
        `${viewport.label}: expected PayNow number not to overwrite explicit contact number`,
      );
      assert.notEqual(
        labelledDetailsState.plate,
        "123-456-789",
        `${viewport.label}: expected bank details not to populate car plate`,
      );
      assert.notEqual(
        labelledDetailsState.vehicleModel,
        "123-456-789",
        `${viewport.label}: expected bank details not to populate vehicle model`,
      );

      await setDriverDemoViewportAndLoad(viewport);

      const freeformDriverDetails = [
        "Juraimi",
        "Alphard HS/ Black",
        "SNH4429M",
        "8189 5041",
        "8200 8671(Paynow)",
      ].join("\n");
      const freeformDetailsState = await parseDriverDetailsSample(
        freeformDriverDetails,
        "freeform Juraimi driver details",
      );
      assert.equal(freeformDetailsState.name, "Juraimi");
      assert.equal(freeformDetailsState.vehicleModel, "Alphard HS/ Black");
      assert.equal(freeformDetailsState.plate, "SNH4429M");
      assert.equal(freeformDetailsState.mobile.replace(/\D/g, ""), "81895041");
      assert.notEqual(
        freeformDetailsState.mobile.replace(/\D/g, ""),
        "82008671",
        `${viewport.label}: expected PayNow number not to overwrite freeform mobile number`,
      );
      assert.equal(
        freeformDetailsState.messageDistance <= 16,
        true,
        `${viewport.label}: expected freeform parse feedback close to Parse Driver Details`,
      );

      await clickDriverDemoButton("[data-driver-demo-save-details]", `${viewport.label} Save`);
      const savedDetailsState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-save-details]");
            const message = document.querySelector("[data-driver-demo-details-message]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            const messageText = message?.textContent.trim() || "";

            return messageText === "Driver details saved locally for this mock driver page."
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText,
                }
              : false;
          })()`),
        10000,
        `${viewport.label} driver details saved message`,
      );
      assert.equal(
        savedDetailsState.messageText,
        "Driver details saved locally for this mock driver page.",
      );
      assert.equal(
        savedDetailsState.distance <= 16,
        true,
        `${viewport.label}: expected driver details saved message close to button`,
      );

      await clickDriverDemoButton(
        "[data-driver-demo-acknowledge]",
        `${viewport.label} Acknowledge Job after driver details reload`,
      );
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-acknowledged-state]")?.textContent.trim() === "Acknowledged"`),
        10000,
        `${viewport.label} acknowledgement after driver details reload`,
      );

      await clickDriverDemoButton(
        "[data-driver-demo-live-location]",
        `${viewport.label} Activate Mock Live Location before valid status flow`,
      );
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-live-location-state]")?.textContent.trim() === "Mock live location active"`),
        10000,
        `${viewport.label} active mock live location before status flow`,
      );

      const clickBlockedStatus = async (label, expectedMessage, expectedStatus) => {
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton(
          `[data-driver-demo-status="${label}"]`,
          `${viewport.label} blocked ${label}`,
        );
        const blockedStatusState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const statusLabel = ${JSON.stringify(label)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const expectedStatus = ${JSON.stringify(expectedStatus)};
              const button = document.querySelector(\`[data-driver-demo-status="\${statusLabel}"]\`);
              const message = document.querySelector(\`[data-driver-demo-status-message="\${statusLabel}"]\`);
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const currentStatus = document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "";

              return message?.textContent.trim() === expectedMessage && currentStatus === expectedStatus
                ? {
                    currentStatus,
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    messageCount: document.querySelectorAll("[data-driver-demo-status-message]").length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} blocked ${label} status message`,
        );

        assert.equal(blockedStatusState.currentStatus, expectedStatus);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          beforeLogLabels,
          `${viewport.label}: expected blocked ${label} not to create a log entry`,
        );
        assert.equal(blockedStatusState.messageText, expectedMessage);
        assert.equal(blockedStatusState.messageCount, 1);
        assert.equal(
          blockedStatusState.distance <= 16,
          true,
          `${viewport.label}: expected blocked ${label} status message close to button`,
        );
      };

      const clickMissingEtaOtw = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton("[data-driver-demo-status=\"OTW\"]", `${viewport.label} missing-ETA OTW`);
        const blockedEtaState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-status='OTW']");
              const message = document.querySelector("[data-driver-demo-status-message='OTW']");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const activityLogText = document.querySelector("[data-driver-demo-activity-log]")?.innerText || "";

              return message?.textContent.trim() === "Acknowledge latest mock flight ETA before OTW." &&
                document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() === "Assigned" &&
                activityLogText.includes("OTW blocked") &&
                activityLogText.includes("OTW was blocked because latest ETA acknowledgement is missing.")
                ? {
                    currentStatus: "Assigned",
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} missing-ETA OTW block`,
        );

        assert.equal(blockedEtaState.currentStatus, "Assigned");
        assert.equal(blockedEtaState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [...beforeLogLabels, "OTW blocked"],
          `${viewport.label}: expected missing-ETA OTW to create a blocked log entry`,
        );
        assert.equal(
          blockedEtaState.distance <= 16,
          true,
          `${viewport.label}: expected missing-ETA OTW feedback close to button`,
        );
      };

      const clickAcknowledgeLatestEta = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        await waitForCondition(
          () =>
            evaluate(`Boolean(document.querySelector("[data-driver-demo-latest-eta-section]")) &&
              document.querySelector("[data-driver-demo-latest-eta-section]")?.innerText.includes("Latest mock flight ETA: 15:45") &&
              document.querySelector("[data-driver-demo-latest-eta-section]")?.innerText.includes("Mock/local only. No real flight API is called and no notification is sent.")`),
          10000,
          `${viewport.label} mock latest flight ETA section`,
        );
        await clickDriverDemoButton(
          "[data-driver-demo-latest-eta]",
          `${viewport.label} Acknowledge Latest ETA`,
        );
        const etaState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-latest-eta]");
              const message = document.querySelector("[data-driver-demo-latest-eta-message]");
              const state = document.querySelector("[data-driver-demo-latest-eta-state]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === "Latest mock flight ETA acknowledged locally. No real flight API or notification was used." &&
                state?.textContent.trim() === "Latest mock flight ETA acknowledged"
                ? {
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} mock latest flight ETA acknowledged`,
        );

        assert.equal(etaState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [
            "Mock driver details saved",
            "Job acknowledged",
            "Mock live location activated",
            "OTW blocked",
            "Latest ETA acknowledged",
          ],
          `${viewport.label}: expected latest ETA acknowledgement to create a local log entry`,
        );
        assert.equal(
          etaState.distance <= 16,
          true,
          `${viewport.label}: expected latest ETA feedback close to button`,
        );
      };

      const clickValidStatus = async (label, expectedMessage) => {
        await clickDriverDemoButton(
          `[data-driver-demo-status="${label}"]`,
          `${viewport.label} ${label}`,
        );
        const statusState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const statusLabel = ${JSON.stringify(label)};
              const expectedMessage = ${JSON.stringify(expectedMessage)};
              const button = document.querySelector(\`[data-driver-demo-status="\${statusLabel}"]\`);
              const message = document.querySelector(\`[data-driver-demo-status-message="\${statusLabel}"]\`);
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === expectedMessage
                ? {
                    currentStatus: document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "",
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    messageCount: document.querySelectorAll("[data-driver-demo-status-message]").length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} ${label} status message`,
        );

        assert.equal(statusState.currentStatus, label);
        assert.equal(statusState.messageText, expectedMessage);
        assert.equal(statusState.messageCount, 1);
        assert.equal(
          statusState.distance <= 16,
          true,
          `${viewport.label}: expected ${label} status message close to button`,
        );
      };

      const clickMissingProofPob = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton("[data-driver-demo-status=\"POB\"]", `${viewport.label} missing-proof POB`);
        const blockedProofState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-status='POB']");
              const message = document.querySelector("[data-driver-demo-status-message='POB']");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();
              const activityLogText = document.querySelector("[data-driver-demo-activity-log]")?.innerText || "";

              return message?.textContent.trim() === "Add mock OTS photo proof before POB." &&
                document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() === "OTS" &&
                activityLogText.includes("POB blocked") &&
                activityLogText.includes("POB was blocked because OTS photo proof is missing.")
                ? {
                    currentStatus: "OTS",
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} missing-proof POB block`,
        );

        assert.equal(blockedProofState.currentStatus, "OTS");
        assert.equal(blockedProofState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          [...beforeLogLabels, "POB blocked"],
          `${viewport.label}: expected missing-proof POB to create a blocked log entry`,
        );
        assert.equal(
          blockedProofState.distance <= 16,
          true,
          `${viewport.label}: expected missing-proof POB feedback close to button`,
        );
      };

      const clickAddMockOtsPhotoProof = async () => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        await waitForCondition(
          () =>
            evaluate(`Boolean(document.querySelector("[data-driver-demo-ots-photo-proof-section]")) &&
              document.querySelector("[data-driver-demo-ots-photo-proof-section]")?.innerText.includes("Mock/local only. No real file upload, camera, or storage is used.")`),
          10000,
          `${viewport.label} mock OTS photo proof section`,
        );
        await clickDriverDemoButton(
          "[data-driver-demo-ots-photo-proof]",
          `${viewport.label} Add Mock OTS Photo Proof`,
        );
        const proofState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-ots-photo-proof]");
              const message = document.querySelector("[data-driver-demo-ots-photo-proof-message]");
              const state = document.querySelector("[data-driver-demo-ots-photo-proof-state]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === "Mock OTS photo proof added locally. No real file upload, camera, or storage was used." &&
                state?.textContent.trim() === "Mock OTS photo proof added"
                ? {
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} mock OTS photo proof added`,
        );

        assert.equal(proofState.fetchCount, beforeFetchCount);
        assert.equal(
          proofState.distance <= 16,
          true,
          `${viewport.label}: expected proof feedback close to proof button`,
        );
      };

      const clickBlockedLiveLocationAfterEnd = async (description) => {
        const beforeFetchCount = await evaluate(`(window.__driverDemoFetchCalls || []).length`);
        const beforeLogLabels = await evaluate(
          `[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`,
        );
        await clickDriverDemoButton("[data-driver-demo-live-location]", description);
        const blockedLiveLocationState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-live-location]");
              const message = document.querySelector("[data-driver-demo-live-location-message]");
              const state = document.querySelector("[data-driver-demo-live-location-state]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === "Mock live location has ended for this job." &&
                state?.textContent.trim() === "Mock live location inactive"
                ? {
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    fetchCount: (window.__driverDemoFetchCalls || []).length,
                    messageText: message.textContent.trim(),
                    stateText: state.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          `${viewport.label} mock live location remains ended`,
        );

        assert.equal(blockedLiveLocationState.fetchCount, beforeFetchCount);
        assert.deepEqual(
          await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
          beforeLogLabels,
          `${viewport.label}: expected blocked ended mock live location not to create a log entry`,
        );
        assert.equal(
          blockedLiveLocationState.distance <= 16,
          true,
          `${viewport.label}: expected ended mock live location feedback close to button`,
        );
      };

      await clickBlockedStatus("OTS", "Update OTW before OTS.", "Assigned");
      await clickBlockedStatus("POB", "Update OTW before POB.", "Assigned");
      await clickBlockedStatus("Job Completed", "Update OTW before Job Completed.", "Assigned");
      await clickMissingEtaOtw();
      await clickAcknowledgeLatestEta();
      await clickValidStatus("OTW", "Status updated: OTW");
      await clickBlockedStatus("POB", "Update OTS before POB.", "OTW");
      await clickValidStatus("OTS", "Status updated: OTS");
      await clickBlockedStatus("Job Completed", "Update POB before Job Completed.", "OTS");
      await clickMissingProofPob();
      await clickAddMockOtsPhotoProof();
      await clickValidStatus("POB", "Status updated: POB. Mock live location ended locally.");
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-live-location-state]")?.textContent.trim() === "Mock live location inactive"`),
        10000,
        `${viewport.label} mock live location ended at POB`,
      );
      await clickBlockedLiveLocationAfterEnd(
        `${viewport.label} blocked mock live location after POB`,
      );
      await clickValidStatus("Job Completed", "Status updated: Completed");
      await waitForCondition(
        () =>
          evaluate(`document.querySelector("[data-driver-demo-live-location-state]")?.textContent.trim() === "Mock live location inactive"`),
        10000,
        `${viewport.label} mock live location remains ended after Job Completed`,
      );
      await clickBlockedLiveLocationAfterEnd(
        `${viewport.label} blocked mock live location after Job Completed`,
      );
      assert.deepEqual(
        await evaluate(`[...document.querySelectorAll("[data-driver-demo-activity-log-label]")].map((item) => item.textContent.trim())`),
        [
          "Mock driver details saved",
          "Job acknowledged",
          "Mock live location activated",
          "OTW blocked",
          "Latest ETA acknowledged",
          "OTW marked",
          "OTS marked",
          "OTS photo proof requested",
          "POB blocked",
          "Mock OTS photo proof added",
          "POB marked",
          "Mock live location auto-ended at POB",
          "Job Completed marked",
        ],
        `${viewport.label}: expected driver demo activity log to preserve successful event order`,
      );

      const networkState = await evaluate(`(() => {
        const resourceCalls = performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) =>
            name.includes("/rest/v1/") ||
            name.includes("/api/") ||
            name.toLowerCase().includes("supabase"),
          );

        return {
          fetchCalls: window.__driverDemoFetchCalls || [],
          resourceCalls,
        };
      })()`);

      assert.deepEqual(
        networkState.fetchCalls.filter((call) => call.includes("/rest/v1/drivers")),
        [],
        `${viewport.label}: expected no public browser Driver Database fetches on driver demo route`,
      );
      assert.deepEqual(
        networkState.resourceCalls,
        [],
        `${viewport.label}: expected no Supabase/API resources on driver demo route`,
      );

      return {
        buttons: initialState.buttonLabels,
        docClientWidth: initialState.docClientWidth,
        docScrollWidth: initialState.docScrollWidth,
        inputs: initialState.inputs.map((input) => ({
          label: input.label.split("\\n")[0],
          type: input.type,
        })),
        textareas: initialState.textareas.map((textarea) => textarea.label.split("\\n")[0]),
        viewport: viewport.label,
      };
    };

    await evaluate(`window.__prestigeErrors = [];
      window.__prestigeConsoleErrors = [];
      window.addEventListener("error", (event) => window.__prestigeErrors.push(event.message));
      window.addEventListener("unhandledrejection", (event) => window.__prestigeErrors.push(String(event.reason)));
      const originalError = console.error;
      console.error = (...args) => {
        window.__prestigeConsoleErrors.push(args.map(String).join(" "));
        originalError.apply(console, args);
      };`);

    await waitForTabs();

    const visibleSnapshots = [];
    const buttonLabels = [];
    for (const label of tabLabels) {
      await clickTab(label);
      visibleSnapshots.push(await evaluate("document.body?.innerText || ''"));
      buttonLabels.push(
        ...(await evaluate(`[...document.querySelectorAll("button")].map((button) => button.textContent.trim())`)),
      );
    }

    const state = {
      buttonLabels: [...new Set(buttonLabels)],
      consoleErrors: await evaluate("window.__prestigeConsoleErrors || []"),
      errors: await evaluate("window.__prestigeErrors || []"),
      visibleText: visibleSnapshots.join("\n\n"),
    };
    state.responsiveTabs = [];
    for (const viewport of responsiveTabViewports) {
      const responsiveStates = await checkResponsiveTabs(viewport);
      state.responsiveTabs.push(...responsiveStates);
    }
    state.driverJobDemo = [];
    for (const viewport of driverDemoViewports) {
      state.driverJobDemo.push(await checkDriverDemoRoute(viewport));
    }
    state.errors = [...browserErrors, ...(state.errors || [])];
    state.consoleErrors = [...browserConsoleErrors, ...(state.consoleErrors || [])];

    assertAppSmokeState(state);
    console.log(JSON.stringify(state, null, 2));
  } catch (error) {
    let pageSnapshot = "";

    if (client) {
      try {
        const snapshot = await client.send("Runtime.evaluate", {
          expression: `({
            href: location.href,
            readyState: document.readyState,
            buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
            bodyText: document.body?.innerText?.slice(0, 1000) || "",
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
