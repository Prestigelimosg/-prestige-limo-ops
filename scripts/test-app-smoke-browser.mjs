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
          window.__driverDemoFetchCalls.push(String(target));
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
        ["Parse Driver Details", "Save Driver Details", "OTW", "POB", "Job Completed"].filter(
          (label) => !initialState.buttonLabels.includes(label),
        ),
        [],
        `${viewport.label}: expected all driver action buttons`,
      );
      assert.deepEqual(
        ["Parse Driver Details", "Save Driver Details"].filter((label) => {
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
                helperText: paymentHelper?.textContent.trim() || "",
                messageDistance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                messageText: parseMessage?.textContent.trim() || "",
                mobile: document.querySelector("[data-driver-demo-mobile]")?.value || "",
                name: document.querySelector("[data-driver-demo-name]")?.value || "",
                plate: document.querySelector("[data-driver-demo-plate]")?.value || "",
                vehicleModel: document.querySelector("[data-driver-demo-vehicle-model]")?.value || "",
              };

              return state.messageText === "Driver details parsed. Please review before saving." &&
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

      await clickDriverDemoButton("[data-driver-demo-save-details]", `${viewport.label} Save Driver Details`);
      const savedDetailsState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-demo-save-details]");
            const message = document.querySelector("[data-driver-demo-details-message]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Driver details saved."
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        `${viewport.label} driver details saved message`,
      );
      assert.equal(savedDetailsState.messageText, "Driver details saved.");
      assert.equal(
        savedDetailsState.distance <= 16,
        true,
        `${viewport.label}: expected driver details saved message close to button`,
      );

      const statusChecks = [
        { label: "OTW", message: "Status updated: OTW" },
        { label: "POB", message: "Status updated: POB" },
        { label: "Job Completed", message: "Status updated: Completed" },
      ];

      for (const statusCheck of statusChecks) {
        await clickDriverDemoButton(
          `[data-driver-demo-status="${statusCheck.label}"]`,
          `${viewport.label} ${statusCheck.label}`,
        );
        const statusState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const statusLabel = ${JSON.stringify(statusCheck.label)};
              const expectedMessage = ${JSON.stringify(statusCheck.message)};
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
          `${viewport.label} ${statusCheck.label} status message`,
        );

        assert.equal(statusState.currentStatus, statusCheck.label);
        assert.equal(statusState.messageText, statusCheck.message);
        assert.equal(statusState.messageCount, 1);
        assert.equal(
          statusState.distance <= 16,
          true,
          `${viewport.label}: expected ${statusCheck.label} status message close to button`,
        );
      }

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
        networkState.fetchCalls,
        [],
        `${viewport.label}: expected driver demo actions not to call fetch`,
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
