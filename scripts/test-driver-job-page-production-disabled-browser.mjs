import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mockDriverJobTokens } from "../lib/driver-job-link-mock-store.ts";

const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
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

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      server.close(() => resolve(port));
    });
  });
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

async function waitForChromeDebugPort(chromeDebugPort) {
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

async function waitForChromePageTarget(chromeDebugPort) {
  return waitForCondition(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/list`);

    return (
      targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) || false
    );
  });
}

async function waitForAppReady(appUrl, getServerLogs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(appUrl);

      if (response.ok) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Production-disabled Next test server did not become ready: ${normalizeErrorMessage(
      lastError,
    )}\n${getServerLogs()}`,
  );
}

function driverJobUrl(appUrl, token) {
  return new URL(`/driver-job/${token}`, appUrl).toString();
}

function assertAbsentText(text, pattern, message) {
  assert.doesNotMatch(text, pattern, message);
}

function assertNoSensitiveOrMockData(state) {
  const text = `${state.visibleText}\n${JSON.stringify(state.fetchCalls)}\n${state.resourceCalls.join("\n")}`;

  for (const pattern of [
    /Mock Pickup A/,
    /Mock Dropoff A/,
    /Mock Waypoint A/,
    /Mock Passenger A/,
    /Mock Assigned Driver A/,
    /MOCK-DRIVER-JOB-A/,
    /SQ333/,
    /\+65 8888 0000/,
    /SLA1234X/,
    /Mercedes V Class/,
    /BOOKING_B_SECRET_/,
    /SECRET_BOOKER_EMAIL/,
    /SECRET_NESTED_BOOKER_EMAIL/,
    /SECRET_BOOKER_NAME/,
    /SECRET_CRM_COMPANY/,
    /secret-crm\.example\.com/,
    /SECRET_CUSTOMER_OVERRIDE_REASON/,
    /SECRET_DRIVER_OVERRIDE_REASON/,
    /SECRET_DRIVER_DATABASE_ROW/,
    /SECRET_DRIVER_DATABASE_LIST/,
  ]) {
    assertAbsentText(text, pattern, `Production-disabled page should not expose ${pattern}.`);
  }

  assertAbsentText(text, /\b160\b/, "Production-disabled page should not expose customer price.");
  assertAbsentText(text, /\b95\b/, "Production-disabled page should not expose driver payout.");
  assertAbsentText(text, /pricing/i, "Production-disabled page should not expose pricing text.");
  assertAbsentText(text, /payout/i, "Production-disabled page should not expose payout text.");
  assertAbsentText(text, /crm/i, "Production-disabled page should not expose CRM text.");
  assertAbsentText(text, /booker email/i, "Production-disabled page should not expose booker email text.");
  assert.equal(text.includes("Driver Database"), false, "Production-disabled page should not expose Driver Database.");
  assert.deepEqual(
    state.fetchCalls.filter((call) => call.url.includes("/rest/v1/drivers")),
    [],
    "Production-disabled page should not fetch Driver Database rows.",
  );
  assert.deepEqual(
    state.fetchCalls.filter((call) => call.url.includes("/rest/v1/bookings") || call.url.includes("/api/bookings")),
    [],
    "Production-disabled page should not fetch or list unrelated bookings.",
  );
}

async function startProductionDisabledApp(appPort) {
  let stdout = "";
  let stderr = "";
  const appUrl = `http://127.0.0.1:${appPort}`;
  const server = spawn(
    "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(appPort)],
    {
      detached: true,
      env: {
        ...process.env,
        DRIVER_JOB_LINK_MODE: "production",
        NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const getServerLogs = () => `stdout:\n${stdout}\nstderr:\n${stderr}`;

  try {
    await waitForAppReady(appUrl, getServerLogs);
  } catch (error) {
    await stopProcessGroup(server);
    throw error;
  }

  return {
    appUrl,
    getServerLogs,
    server,
  };
}

async function stopProcessGroup(childProcess) {
  if (!childProcess.pid || childProcess.exitCode !== null) {
    return;
  }

  try {
    process.kill(-childProcess.pid, "SIGTERM");
  } catch {
    childProcess.kill("SIGTERM");
  }

  await waitForChildExit(childProcess);
}

async function runChromeTest() {
  const appPort = await getFreePort();
  const chromeDebugPort = await getFreePort();
  const app = await startProductionDisabledApp(appPort);
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-driver-job-prod-disabled-chrome-"));
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

  let chromeStderr = "";
  let client = null;

  chrome.stderr.on("data", (chunk) => {
    chromeStderr += chunk.toString();
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
        window.fetch = async (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          const response = await originalFetch(...args);
          let body = null;

          try {
            body = await response.clone().json();
          } catch {}

          window.__driverJobFetchCalls.push({
            body,
            method,
            status: response.status,
            url: String(target),
          });
          return response;
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
        visibleText: document.body?.innerText || "",
      }))()`);

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", {
      url: driverJobUrl(app.appUrl, mockDriverJobTokens.validA),
    });
    await loadEvent;

    await waitForCondition(
      () =>
        evaluate(`Boolean(document.querySelector("[data-driver-job-blocked='true']")) &&
          (window.__driverJobFetchCalls || []).some((call) =>
            call.url.includes("/api/driver-job/") &&
            call.status === 503 &&
            call.body?.reason === "not_configured" &&
            call.body?.payload === null
          )`),
      10000,
      "production-disabled blocked driver job page",
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
    assert.ok(state.visibleText.includes("Driver job link unavailable"));
    assert.ok(state.visibleText.includes("This driver job link is unavailable right now."));
    assert.equal(
      state.buttonLabels.some((buttonLabel) =>
        ["Acknowledge Job", "Activate Mock Live Location", "Save", "OTW", "OTS", "POB", "Job Completed"].includes(
          buttonLabel,
        ),
      ),
      false,
      "Production-disabled page should not show acknowledgement, mock live location, details, or status buttons.",
    );

    const driverJobFetches = state.fetchCalls.filter((call) => call.url.includes("/api/driver-job/"));
    assert.equal(driverJobFetches.length, 1, "Production-disabled page should only request the single tokenized job API.");
    assert.equal(driverJobFetches[0].method, "GET");
    assert.equal(driverJobFetches[0].status, 503);
    assert.deepEqual(driverJobFetches[0].body, {
      ok: false,
      payload: null,
      reason: "not_configured",
    });

    assertNoSensitiveOrMockData(state);

    console.log("Driver job page production-disabled browser tests passed.");
  } catch (error) {
    let pageSnapshot = "";

    if (client) {
      try {
        const snapshot = await client.send("Runtime.evaluate", {
          expression: `({
            href: location.href,
            readyState: document.readyState,
            buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
            fetchCalls: window.__driverJobFetchCalls || [],
            bodyText: document.body?.innerText?.slice(0, 1000) || "",
          })`,
          returnByValue: true,
        });
        pageSnapshot = `\n${JSON.stringify(snapshot.result?.value ?? {}, null, 2)}`;
      } catch {
        pageSnapshot = "";
      }
    }

    const message = `${normalizeErrorMessage(error)}${pageSnapshot}\n${chromeStderr}\n${app.getServerLogs()}`;
    throw new Error(message.trim());
  } finally {
    if (client) {
      await client.close();
    }

    chrome.kill("SIGTERM");
    await waitForChildExit(chrome);
    await rm(userDataDir, { force: true, recursive: true }).catch(() => {});
    await stopProcessGroup(app.server);
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
