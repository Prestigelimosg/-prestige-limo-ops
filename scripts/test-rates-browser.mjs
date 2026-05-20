import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9225);
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

function assertRatesState(state) {
  const combinedErrors = [...state.errors, ...state.consoleErrors].join("\n");

  assert.equal(state.errors.length, 0, `Expected no runtime errors:\n${state.errors.join("\n")}`);
  assert.ok(!combinedErrors.includes("formatOverrideSummary is not defined"));
  assert.ok(!state.visibleText.includes("formatOverrideSummary is not defined"));
  assert.match(state.visibleText, /\bRates\b/);
  assert.match(state.visibleText, /Saved Rate Overrides/);
  assert.match(state.visibleText, /Company Overrides/);
  assert.match(state.visibleText, /Boss \/ Name Overrides/);
  assert.ok(state.buttonLabels.includes("Load Rates"));
  assert.ok(state.buttonLabels.includes("Save Defaults"));
  assert.ok(state.buttonLabels.includes("Save Override"));
  assert.ok(
    state.visibleText.includes("Rates loaded.") || state.visibleText.includes("Load failed:"),
    "Expected Load Rates to finish with a visible status message.",
  );
}

async function runChromeTest() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-rates-chrome-"));
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

    const clickTab = async (label, expectedText = "") => {
      await waitForCondition(
        () =>
          evaluate(`(() => {
            const tab = [...document.querySelectorAll("button[role='tab']")].find(
              (button) => button.textContent.trim() === ${JSON.stringify(label)},
            );
            const expectedText = ${JSON.stringify(expectedText)};
            const isSelected = () =>
              Boolean(
                [...document.querySelectorAll("button[role='tab']")].find(
                  (button) =>
                    button.textContent.trim() === ${JSON.stringify(label)} &&
                    button.getAttribute("aria-selected") === "true",
                ),
              );

            if (!tab || tab.disabled) {
              return false;
            }

            if (!isSelected()) {
              tab.click();
            }

            const selectedTab = [...document.querySelectorAll("button[role='tab']")].find(
              (button) =>
                button.textContent.trim() === ${JSON.stringify(label)} &&
                button.getAttribute("aria-selected") === "true",
            );

            return Boolean(selectedTab) && (!expectedText || document.body.innerText.includes(expectedText));
          })()`),
        10000,
        `${label} tab content`,
      );
    };

    await clickTab("Rates", "Load Rates");

    await waitForCondition(
      () =>
        evaluate(`document.body.innerText.includes("Rates") &&
          [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Load Rates")`),
      10000,
      "Chrome Rates controls",
    );

    await evaluate(`window.__prestigeErrors = [];
      window.__prestigeConsoleErrors = [];
      window.addEventListener("error", (event) => window.__prestigeErrors.push(event.message));
      window.addEventListener("unhandledrejection", (event) => window.__prestigeErrors.push(String(event.reason)));
      const originalError = console.error;
      console.error = (...args) => {
        window.__prestigeConsoleErrors.push(args.map(String).join(" "));
        originalError.apply(console, args);
      };`);

    const clickedLoadRates = await evaluate(`(() => {
      const ratesHeading = [...document.querySelectorAll("h2, h3")].find(
        (element) => element.textContent.trim() === "Rates",
      );
      ratesHeading?.scrollIntoView({ block: "center" });
      const loadRatesButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Rates",
      );

      if (!loadRatesButton || loadRatesButton.disabled) {
        return false;
      }

      loadRatesButton.click();
      return true;
    })()`);

    assert.equal(clickedLoadRates, true, "Expected Load Rates button to be clickable");

    await waitForCondition(
      () =>
        evaluate(`document.body.innerText.includes("Rates loaded.") ||
          document.body.innerText.includes("Load failed:")`),
      15000,
      "Load Rates result",
    );

    const state = {
      buttonLabels: await evaluate(
        `[...document.querySelectorAll("button")].map((button) => button.textContent.trim())`,
      ),
      errors: await evaluate(`window.__prestigeErrors || []`),
      consoleErrors: await evaluate(`window.__prestigeConsoleErrors || []`),
      visibleText: await evaluate(`document.body.innerText`),
    };
    state.errors = [...browserErrors, ...(state.errors || [])];
    state.consoleErrors = [...browserConsoleErrors, ...(state.consoleErrors || [])];

    assertRatesState(state);

    const clickedSaveOverride = await evaluate(`(() => {
      const saveOverrideButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Override",
      );

      if (!saveOverrideButton || saveOverrideButton.disabled) {
        return false;
      }

      saveOverrideButton.scrollIntoView({ block: "center" });
      saveOverrideButton.click();
      return true;
    })()`);
    assert.equal(clickedSaveOverride, true, "Expected Save Override button to be clickable");

    const overrideFeedbackState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const saveOverrideButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Save Override",
          );
          const feedback = document.querySelector("[data-rate-feedback='override']");
          const globalStatusPanels = [...document.querySelectorAll("[data-status-panel='global']")];

          if (!saveOverrideButton || !feedback || !feedback.textContent.includes("Save rate override failed:")) {
            return false;
          }

          const buttonRect = saveOverrideButton.getBoundingClientRect();
          const feedbackRect = feedback.getBoundingClientRect();

          return {
            distance: Math.abs(feedbackRect.top - buttonRect.bottom),
            feedbackText: feedback.textContent.trim(),
            globalOverrideMessages: globalStatusPanels.filter((panel) =>
              panel.textContent.includes("Save rate override failed:"),
            ).length,
          };
        })()`),
      10000,
      "Save Override local feedback",
    );
    assert.ok(
      overrideFeedbackState.distance <= 80,
      `Expected Save Override feedback near the button, got ${overrideFeedbackState.distance}px`,
    );
    assert.equal(
      overrideFeedbackState.globalOverrideMessages,
      0,
      "Expected Save Override feedback not to duplicate in the top Rates status panel",
    );

    await evaluate(`(() => {
      window.__prestigeBlockedRateWrites = [];
      window.__prestigeOriginalFetchForRateGuard = window.__prestigeOriginalFetchForRateGuard || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const method = args[1]?.method || args[0]?.method || "GET";
        const isReadOnlyRequest = method === "GET" || method === "HEAD" || method === "OPTIONS";

        if (String(target).includes("/rest/v1/") && !isReadOnlyRequest) {
          window.__prestigeBlockedRateWrites.push(\`\${method} \${target}\`);
          return new Response(JSON.stringify({ message: "Blocked rate write during invalid override test" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return window.__prestigeOriginalFetchForRateGuard(...args);
      };
    })()`);

    const preparedBlankOverride = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const setLabeledInput = (labelText, value) => {
        const label = [...document.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
        );
        const input = label?.querySelector("input");

        if (!input) {
          return false;
        }

        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return input.value === value;
      };

      return setLabeledInput("Company / Account", "BLANK RATE SAFETY TEST") &&
        setLabeledInput("Boss / Name", "") &&
        setLabeledInput("MNG customer", "") &&
        setLabeledInput("DEP customer", "") &&
        setLabeledInput("TRF customer", "") &&
        setLabeledInput("DSP customer", "") &&
        setLabeledInput("MNG driver", "") &&
        setLabeledInput("DEP driver", "") &&
        setLabeledInput("TRF driver", "") &&
        setLabeledInput("DSP driver", "");
    })()`);
    assert.equal(preparedBlankOverride, true, "Expected blank rate override test fields to be editable");

    const clickedBlankOverrideSave = await evaluate(`(() => {
      const saveOverrideButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Override",
      );

      if (!saveOverrideButton || saveOverrideButton.disabled) {
        return false;
      }

      saveOverrideButton.click();
      return true;
    })()`);
    assert.equal(clickedBlankOverrideSave, true, "Expected Save Override button to remain clickable for blank value test");

    const blankRateFeedbackState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const saveOverrideButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Save Override",
          );
          const feedback = document.querySelector("[data-rate-feedback='override']");

          if (!saveOverrideButton || !feedback || !feedback.textContent.includes("Enter at least one customer or driver rate override")) {
            return false;
          }

          const buttonRect = saveOverrideButton.getBoundingClientRect();
          const feedbackRect = feedback.getBoundingClientRect();

          return {
            blockedWrites: window.__prestigeBlockedRateWrites || [],
            distance: Math.abs(feedbackRect.top - buttonRect.bottom),
            feedbackText: feedback.textContent.trim(),
          };
        })()`),
      10000,
      "blank rate override validation feedback",
    );
    assert.deepEqual(
      blankRateFeedbackState.blockedWrites,
      [],
      `Expected blank rate override not to make Supabase writes, got ${blankRateFeedbackState.blockedWrites.join(", ")}`,
    );
    assert.ok(
      blankRateFeedbackState.distance <= 80,
      `Expected blank rate feedback near Save Override, got ${blankRateFeedbackState.distance}px`,
    );

    await evaluate(`window.__prestigeBlockedRateWrites = []`);

    const preparedNegativeOverride = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const setLabeledInput = (labelText, value) => {
        const label = [...document.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
        );
        const input = label?.querySelector("input");

        if (!input) {
          return false;
        }

        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return input.value === value;
      };

      return setLabeledInput("Company / Account", "NEGATIVE RATE SAFETY TEST") &&
        setLabeledInput("MNG customer", "-5");
    })()`);
    assert.equal(preparedNegativeOverride, true, "Expected negative rate override test fields to be editable");

    const clickedNegativeOverrideSave = await evaluate(`(() => {
      const saveOverrideButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Override",
      );

      if (!saveOverrideButton || saveOverrideButton.disabled) {
        return false;
      }

      saveOverrideButton.click();
      return true;
    })()`);
    assert.equal(clickedNegativeOverrideSave, true, "Expected Save Override button to remain clickable for invalid value test");

    const invalidRateFeedbackState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const saveOverrideButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Save Override",
          );
          const feedback = document.querySelector("[data-rate-feedback='override']");

          if (!saveOverrideButton || !feedback || !feedback.textContent.includes("Enter positive numbers")) {
            return false;
          }

          const buttonRect = saveOverrideButton.getBoundingClientRect();
          const feedbackRect = feedback.getBoundingClientRect();

          return {
            blockedWrites: window.__prestigeBlockedRateWrites || [],
            distance: Math.abs(feedbackRect.top - buttonRect.bottom),
            feedbackText: feedback.textContent.trim(),
          };
        })()`),
      10000,
      "negative rate override validation feedback",
    );
    assert.match(invalidRateFeedbackState.feedbackText, /MNG customer/);
    assert.deepEqual(
      invalidRateFeedbackState.blockedWrites,
      [],
      `Expected invalid negative rate override not to make Supabase writes, got ${invalidRateFeedbackState.blockedWrites.join(", ")}`,
    );
    assert.ok(
      invalidRateFeedbackState.distance <= 80,
      `Expected invalid rate feedback near Save Override, got ${invalidRateFeedbackState.distance}px`,
    );

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
