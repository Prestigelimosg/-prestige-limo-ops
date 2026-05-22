import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
  assert.doesNotMatch(text, /BOOKING_B_SECRET_/);
  assert.doesNotMatch(text, /\b160\b/, "Driver job page should not expose customer price.");
  assert.doesNotMatch(text, /\b95\b/, "Driver job page should not expose driver payout.");
  assert.equal(text.includes("Driver Database"), false, "Driver job page should not expose Driver Database UI.");
  assert.deepEqual(
    state.fetchCalls.filter((call) => call.includes("/rest/v1/drivers")),
    [],
    "Driver job page should not fetch Driver Database rows.",
  );
}

async function runChromeTest() {
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

    const clickStatus = async (label, expectedStatus) => {
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
              messageText.includes(${JSON.stringify(`Status updated to ${expectedStatus}.`)});
          })()`),
        10000,
        `${label} status update`,
      );

      const state = await pageState();

      assertNoSensitiveText(state);
      return state;
    };

    const validState = await navigateToDriverJob(mockDriverJobTokens.validA, "Mock Pickup A");
    assert.ok(validState.visibleText.includes("Mock Dropoff A"));
    assert.ok(validState.visibleText.includes("Mock Pickup A > Mock Waypoint A > Mock Dropoff A"));
    assert.ok(validState.visibleText.includes("Mock Waypoint A"));
    assert.ok(validState.visibleText.includes("SQ333"));
    assert.ok(validState.visibleText.includes("Mock Passenger A"));
    assert.ok(validState.visibleText.includes("Mock Assigned Driver A"));
    assert.ok(validState.buttonLabels.includes("OTW"));
    assert.ok(validState.buttonLabels.includes("POB"));
    assert.ok(validState.buttonLabels.includes("Job Completed"));
    assertNoSensitiveText(validState);

    await clickStatus("OTW", "OTW");
    await clickStatus("POB", "POB");
    await clickStatus("Job Completed", "Job Completed");

    for (const [token, label] of [
      ["not-a-real-token", "invalid"],
      [mockDriverJobTokens.expired, "expired"],
      [mockDriverJobTokens.revoked, "revoked"],
    ]) {
      const blockedState = await navigateToDriverJob(token, "Driver job link unavailable");

      assert.equal(
        blockedState.buttonLabels.some((buttonLabel) => ["OTW", "POB", "Job Completed"].includes(buttonLabel)),
        false,
        `${label} token should not show status buttons.`,
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
