import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mockDriverJobTokens } from "../lib/driver-job-link-mock-store.ts";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9228);
const browserErrors = [];
const browserConsoleErrors = [];

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

function driverJobUrl(token) {
  return new URL(`/driver-job/${token}`, appUrl).toString();
}

function driverJobApiUrl(token) {
  return new URL(`/api/driver-job/${token}`, appUrl).toString();
}

function assertNoSensitiveText(state) {
  const text = `${state.visibleText}\n${state.fetchCalls.join("\n")}\n${state.resourceCalls.join("\n")}`;

  assert.doesNotMatch(text, /SECRET_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_NESTED_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_BOOKER_NAME/);
  assert.doesNotMatch(text, /SECRET_CRM_COMPANY/);
  assert.doesNotMatch(text, /secret-crm\.example\.com/);
  assert.doesNotMatch(text, /SECRET_CUSTOMER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_DRIVER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_DRIVER_DATABASE_ROW/);
  assert.doesNotMatch(text, /SECRET_DRIVER_DATABASE_LIST/);
  assert.doesNotMatch(text, /SECRET_WORKFLOW_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_WORKFLOW_BOOKER_NAME/);
  assert.doesNotMatch(text, /SECRET_WORKFLOW_CRM_COMPANY/);
  assert.doesNotMatch(text, /secret-workflow-crm\.example\.com/);
  assert.doesNotMatch(text, /SECRET_WORKFLOW_DRIVER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_WORKFLOW_DRIVER_DATABASE_LIST/);
  assert.doesNotMatch(text, /BOOKING_B_SECRET_/);
  assert.doesNotMatch(text, /\b188\b/, "Driver job page should not expose workflow customer price.");
  assert.doesNotMatch(text, /\b99\b/, "Driver job page should not expose workflow driver payout.");
  assert.doesNotMatch(text, /\b160\b/, "Driver job page should not expose customer price.");
  assert.doesNotMatch(text, /\b95\b/, "Driver job page should not expose driver payout.");
  assert.equal(text.includes("Driver Database"), false, "Driver job page should not expose Driver Database UI.");
  assert.deepEqual(
    state.fetchCalls.filter((call) => call.includes("/rest/v1/drivers")),
    [],
    "Driver job page should not fetch Driver Database rows.",
  );
}

async function assertNoRealLocationImplementation() {
  const guardedSources = await Promise.all([
    readFile(new URL("../app/driver-job/[token]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/driver-job-demo/page.tsx", import.meta.url), "utf8"),
  ]);
  const source = guardedSources.join("\n");

  assert.doesNotMatch(source, /navigator\.geolocation/i, "Driver pages must not call navigator.geolocation.");
  assert.doesNotMatch(source, /\/api\/(?:driver-)?live-location/i, "Driver pages must not add live location endpoints.");
  assert.doesNotMatch(source, /google\.maps|maps\.google|mapbox|gps api/i, "Driver pages must not add map or GPS APIs.");
  assert.doesNotMatch(source, /customer live location link/i, "Driver pages must not create fake customer live location links.");
}

async function runChromeTest() {
  await assertNoRealLocationImplementation();

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-driver-job-page-chrome-"));
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
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__driverJobFetchCalls = [];
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
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          window.__driverJobFetchCalls.push(\`\${method} \${String(target)}\`);
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

    const pageState = () =>
      evaluate(`(() => ({
        activityLogLabels: [...document.querySelectorAll("[data-driver-job-activity-log-label]")]
          .map((item) => item.textContent.trim()),
        buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
        consoleErrors: window.__prestigeConsoleErrors || [],
        errors: window.__prestigeErrors || [],
        fetchCalls: window.__driverJobFetchCalls || [],
        resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
        statusText: document.querySelector("[data-driver-job-current-status='true']")?.textContent?.trim() || "",
        visibleText: document.body?.innerText || "",
      }))()`);

    const navigateToDriverJob = async (token, expectedText) => {
      const loadEvent = client.once("Page.loadEventFired");
      await client.send("Page.navigate", { url: driverJobUrl(token) });
      await loadEvent;

      await waitForCondition(
        () => evaluate(`document.body?.innerText.includes(${JSON.stringify(expectedText)})`),
        10000,
        `driver job page text: ${expectedText}`,
      );

      const state = await pageState();
      state.errors = [...browserErrors, ...(state.errors || [])];
      state.consoleErrors = [...browserConsoleErrors, ...(state.consoleErrors || [])];

      assert.deepEqual(state.errors, [], `Expected no runtime errors:\n${state.errors.join("\n")}`);
      assert.deepEqual(
        state.consoleErrors,
        [],
        `Expected no browser console errors:\n${state.consoleErrors.join("\n")}`,
      );

      return state;
    };

    const resetMockDriverJobData = async () => {
      const response = await fetch(driverJobApiUrl(mockDriverJobTokens.workflowOrder), {
        headers: {
          "x-prestige-driver-job-mock-reset": "1",
        },
      });
      const body = await response.json();

      assert.equal(response.ok, true, "Expected mock driver job data reset request to succeed.");
      assert.equal(body.ok, true, "Expected mock driver job data reset request to return a safe payload.");
      assertNoSensitiveText({
        fetchCalls: [],
        resourceCalls: [],
        visibleText: JSON.stringify(body),
      });
    };

    const clickAcknowledge = async () => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-acknowledge]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected Acknowledge Job button to be clickable.");

      const acknowledgementState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-acknowledge]");
            const message = document.querySelector("[data-driver-job-acknowledge-message]");
            const state = document.querySelector("[data-driver-job-acknowledged-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return state?.textContent.trim() === "Acknowledged" &&
              message?.textContent.trim() === "Job acknowledged locally for this mock driver page."
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        "driver job acknowledgement",
      );

      assert.equal(acknowledgementState.distance <= 16, true, "Expected acknowledgement feedback near button.");
      const state = await pageState();

      assertNoSensitiveText(state);
      return state;
    };

    const saveDriverDetails = async () => {
      const beforeSaveState = await pageState();
      const filled = await evaluate(`(() => {
        const values = [
          ["[data-driver-job-detail-name]", "Mock Local Driver A"],
          ["[data-driver-job-detail-contact]", "+65 9123 4567"],
          ["[data-driver-job-detail-plate]", "SLM1234A"],
          ["[data-driver-job-detail-vehicle-model]", "Toyota Alphard"],
        ];
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

        for (const [selector, value] of values) {
          const input = document.querySelector(selector);

          if (!input) {
            return false;
          }

          setter?.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        return true;
      })()`);
      assert.equal(filled, true, "Expected public driver details fields to be editable.");

      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-save-details]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, "Expected public driver details Save button to be clickable.");

      const savedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-save-details]");
            const message = document.querySelector("[data-driver-job-details-message]");
            const savedDetails = document.querySelector("[data-driver-job-saved-details]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Driver details saved locally for this mock driver page." &&
              savedDetails?.innerText.includes("Mock Local Driver A") &&
              savedDetails?.innerText.includes("+65 9123 4567") &&
              savedDetails?.innerText.includes("SLM1234A") &&
              savedDetails?.innerText.includes("Toyota Alphard")
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  savedText: savedDetails.innerText,
                }
              : false;
          })()`),
        10000,
        "public driver details local save",
      );

      const afterSaveState = await pageState();
      assert.equal(savedState.distance <= 16, true, "Expected driver details feedback near Save button.");
      assert.equal(
        afterSaveState.fetchCalls.length,
        beforeSaveState.fetchCalls.length,
        "Public driver details local Save should not make network requests.",
      );
      assertNoSensitiveText(afterSaveState);
      return afterSaveState;
    };

    const clickBlockedLiveLocation = async (
      expectedMessage = "Acknowledge this job before activating mock live location.",
    ) => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-live-location]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected Activate Mock Live Location button to be clickable.");

      const blockedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-live-location]");
            const message = document.querySelector("[data-driver-job-live-location-message]");
            const state = document.querySelector("[data-driver-job-live-location-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === ${JSON.stringify(expectedMessage)} &&
              state?.textContent.trim() === "Mock live location inactive"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        "blocked mock live location activation",
      );

      assert.equal(blockedState.distance <= 16, true, "Expected blocked live location feedback near button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Blocked mock live location activation should not make a network request.",
      );
      assert.deepEqual(
        afterState.activityLogLabels,
        beforeState.activityLogLabels,
        "Blocked mock live location activation should not create a success log entry.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const clickActivateLiveLocation = async () => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-live-location]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected Activate Mock Live Location button to be clickable after acknowledgement.");

      const activeState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-live-location]");
            const message = document.querySelector("[data-driver-job-live-location-message]");
            const state = document.querySelector("[data-driver-job-live-location-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() ===
              "Mock live location active locally for this mock driver page. No phone location is captured or sent." &&
              state?.textContent.trim() === "Mock live location active"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        "mock live location activation",
      );

      assert.equal(activeState.distance <= 16, true, "Expected mock live location feedback near button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Mock live location activation should stay local and avoid network requests.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const clickStatus = async (
      label,
      expectedStatus,
      expectedMessage = `Status updated to ${expectedStatus}.`,
    ) => {
      const clicked = await evaluate(`(() => {
        const button = [...document.querySelectorAll("[data-driver-job-status]")].find(
          (candidate) => candidate.getAttribute("data-driver-job-status") === ${JSON.stringify(label)},
        );

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, `Expected ${label} status button to be clickable.`);

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const statusText = document.querySelector("[data-driver-job-current-status='true']")?.textContent || "";
            const messageText = document.querySelector(${JSON.stringify(`[data-driver-job-status-message="${label}"]`)})?.textContent || "";

            return statusText.includes(${JSON.stringify(expectedStatus)}) &&
              messageText.includes(${JSON.stringify(expectedMessage)});
          })()`),
        10000,
        `${label} status update`,
      );

      const state = await pageState();

      assertNoSensitiveText(state);
      return state;
    };

    const clickBlockedStatus = async (label, expectedMessage, expectedStatusText) => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = [...document.querySelectorAll("[data-driver-job-status]")].find(
          (candidate) => candidate.getAttribute("data-driver-job-status") === ${JSON.stringify(label)},
        );

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, `Expected ${label} status button to be clickable.`);

      const blockedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector(${JSON.stringify(`[data-driver-job-status="${label}"]`)});
            const message = document.querySelector(${JSON.stringify(`[data-driver-job-status-message="${label}"]`)});
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();
            const statusText = document.querySelector("[data-driver-job-current-status='true']")?.textContent.trim() || "";

            return message?.textContent.trim() === ${JSON.stringify(expectedMessage)} &&
              statusText === ${JSON.stringify(expectedStatusText)}
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  statusText,
                }
              : false;
          })()`),
        10000,
        `${label} blocked status feedback`,
      );

      assert.equal(blockedState.distance <= 16, true, `Expected ${label} blocked feedback near button.`);

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        `${label} blocked status should not make a network request.`,
      );
      assert.deepEqual(
        afterState.activityLogLabels,
        beforeState.activityLogLabels,
        `${label} blocked status should not create a success log entry.`,
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    await resetMockDriverJobData();
    const validState = await navigateToDriverJob(mockDriverJobTokens.workflowOrder, "Mock Workflow Pickup");
    assert.ok(validState.visibleText.includes("Mock Workflow Dropoff"));
    assert.ok(validState.visibleText.includes("Mock Workflow Pickup > Mock Workflow Waypoint > Mock Workflow Dropoff"));
    assert.ok(validState.visibleText.includes("Mock Workflow Waypoint"));
    assert.ok(validState.visibleText.includes("SQ889"));
    assert.ok(validState.visibleText.includes("Mock Workflow Passenger"));
    assert.ok(validState.visibleText.includes("Mock Workflow Driver"));
    const startingStatusText = validState.statusText || "Assigned";
    assert.ok(validState.visibleText.includes("Acknowledge Job"));
    assert.ok(validState.visibleText.includes("Mock Live Location"));
    assert.ok(validState.visibleText.includes("Mock/local only. No phone location is captured or sent."));
    assert.ok(validState.visibleText.includes("Activate Mock Live Location"));
    assert.ok(validState.visibleText.includes("Driver Activity Log"));
    assert.ok(validState.visibleText.includes("No mock driver activity recorded yet."));
    assert.ok(validState.visibleText.includes("Driver Details"));
    assert.ok(validState.visibleText.includes("Driver name"));
    assert.ok(validState.visibleText.includes("Contact"));
    assert.ok(validState.visibleText.includes("Car plate"));
    assert.ok(validState.visibleText.includes("Vehicle model"));
    assert.deepEqual(
      validState.buttonLabels.filter((buttonLabel) =>
        ["Acknowledge Job", "Save", "OTW", "OTS", "POB", "Job Completed"].includes(buttonLabel),
      ),
      ["Acknowledge Job", "Save", "OTW", "OTS", "POB", "Job Completed"],
      "Expected public driver job page to show acknowledgement, details, and status controls in order.",
    );
    assert.deepEqual(
      validState.buttonLabels.filter((buttonLabel) =>
        ["Acknowledge Job", "Activate Mock Live Location", "Save", "OTW", "OTS", "POB", "Job Completed"].includes(
          buttonLabel,
        ),
      ),
      ["Acknowledge Job", "Activate Mock Live Location", "Save", "OTW", "OTS", "POB", "Job Completed"],
      "Expected public driver job page to show mock live location control before details/status controls.",
    );
    assertNoSensitiveText(validState);

    await clickBlockedLiveLocation();
    await clickBlockedStatus("OTW", "Acknowledge this job before updating status.", startingStatusText);
    await clickAcknowledge();
    await clickActivateLiveLocation();
    await saveDriverDetails();
    await clickBlockedStatus("OTS", "Update OTW before OTS.", startingStatusText);
    await clickBlockedStatus("POB", "Update OTW before POB.", startingStatusText);
    await clickBlockedStatus("Job Completed", "Update OTW before Job Completed.", startingStatusText);
    await clickStatus("OTW", "OTW");
    await clickBlockedStatus("POB", "Update OTS before POB.", "OTW");
    await clickStatus("OTS", "OTS");
    await clickBlockedStatus("Job Completed", "Update POB before Job Completed.", "OTS");
    await clickStatus("POB", "POB", "Status updated to POB. Mock live location ended locally.");
    const endedLiveLocationState = await pageState();
    assert.ok(
      endedLiveLocationState.visibleText.includes("Mock live location inactive"),
      "Expected POB to auto-end mock live location.",
    );
    await clickBlockedLiveLocation("Mock live location has ended for this job.");
    await clickStatus("Job Completed", "Job Completed");
    const completedLiveLocationState = await pageState();
    assert.ok(
      completedLiveLocationState.visibleText.includes("Mock live location inactive"),
      "Expected Job Completed to leave mock live location ended.",
    );
    assert.deepEqual(
      completedLiveLocationState.activityLogLabels,
      [
        "Job acknowledged",
        "Mock live location activated",
        "Mock driver details saved",
        "OTW marked",
        "OTS marked",
        "POB marked",
        "Mock live location auto-ended at POB",
        "Job Completed marked",
      ],
      "Expected public driver activity log to preserve successful workflow event order.",
    );
    await clickBlockedLiveLocation("Mock live location has ended for this job.");
    await resetMockDriverJobData();

    for (const [token, label] of [
      ["not-a-real-token", "invalid"],
      [mockDriverJobTokens.expired, "expired"],
      [mockDriverJobTokens.revoked, "revoked"],
    ]) {
      const blockedState = await navigateToDriverJob(token, "Driver job link unavailable");

      assert.equal(
        blockedState.buttonLabels.some((buttonLabel) =>
          ["Acknowledge Job", "Activate Mock Live Location", "Save", "OTW", "OTS", "POB", "Job Completed"].includes(
            buttonLabel,
          ),
        ),
        false,
        `${label} token should not show acknowledgement, mock live location, details, or status buttons.`,
      );
      assert.equal(blockedState.visibleText.includes("Mock Pickup A"), false);
      assert.equal(blockedState.visibleText.includes("Mock Dropoff A"), false);
      assert.equal(blockedState.visibleText.includes("Mock Waypoint A"), false);
      assertNoSensitiveText(blockedState);
    }

    console.log("Driver job page browser tests passed.");
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
