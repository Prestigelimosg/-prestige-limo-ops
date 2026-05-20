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

    await evaluate(`(() => {
      const duplicateCompanyName = "DUPLICATE RATE SAFETY TEST";
      window.__prestigeRateDuplicateStore = {
        companies: [
          {
            id: 9001,
            company_name: duplicateCompanyName,
            domain: null,
            customer_rates: { MNG: 85 },
            driver_payout_rules: {},
            transzend_excel_privacy: false,
          },
        ],
        travelers: [],
        updateCalls: [],
        unexpectedCalls: [],
      };
      const originalFetch = window.__prestigeOriginalFetchForRateGuard || window.fetch.bind(window);
      const jsonResponse = (payload, status = 200) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        });

      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const url = String(target);
        const method = args[1]?.method || args[0]?.method || "GET";

        if (!url.includes("/rest/v1/")) {
          return originalFetch(...args);
        }

        const store = window.__prestigeRateDuplicateStore;

        if (url.includes("/rest/v1/rate_settings") && method === "GET") {
          return jsonResponse({
            customer_rates: { MNG: 85, DEP: 75, TRF: 55, DSP: 65 },
            driver_payout_rules: {
              MNG: { min: 65, max: 75 },
              DEP: { min: 65, max: 65 },
              TRF: { min: 70, max: 70 },
              DSP: { amount: 50, perHour: true },
            },
            midnight_surcharge: 15,
            extra_stop_surcharge: 15,
            midnight_payout: 10,
            extra_stop_payout: 10,
            child_seat_customer_surcharge: 15,
            child_seat_driver_payout: 10,
          });
        }

        if (url.includes("/rest/v1/companies") && method === "GET") {
          return jsonResponse(store.companies);
        }

        if (url.includes("/rest/v1/travelers") && method === "GET") {
          return jsonResponse(store.travelers);
        }

        if (url.includes("/rest/v1/companies") && method === "PATCH") {
          const payload = JSON.parse(args[1]?.body || "{}");
          store.updateCalls.push({ method, url, payload });
          store.companies = store.companies.map((company) =>
            company.id === 9001 ? { ...company, ...payload } : company,
          );
          return jsonResponse(store.companies[0]);
        }

        store.unexpectedCalls.push(\`\${method} \${url}\`);
        return jsonResponse({ message: "Unhandled rate duplicate mock" }, 500);
      };
    })()`);

    const clickedMockLoadRates = await evaluate(`(() => {
      const loadRatesButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Rates",
      );

      if (!loadRatesButton || loadRatesButton.disabled) {
        return false;
      }

      loadRatesButton.click();
      return true;
    })()`);
    assert.equal(clickedMockLoadRates, true, "Expected mocked Load Rates button to be clickable");

    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("DUPLICATE RATE SAFETY TEST")`),
      10000,
      "mock duplicate rate company loaded",
    );

    const saveDuplicateCompanyOverride = async (customerRate) => {
      const preparedDuplicateOverride = await evaluate(`(() => {
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

        return setLabeledInput("Company / Account", "DUPLICATE RATE SAFETY TEST") &&
          setLabeledInput("Boss / Name", "") &&
          setLabeledInput("MNG customer", ${JSON.stringify(String(customerRate))}) &&
          setLabeledInput("DEP customer", "") &&
          setLabeledInput("TRF customer", "") &&
          setLabeledInput("DSP customer", "") &&
          setLabeledInput("MNG driver", "") &&
          setLabeledInput("DEP driver", "") &&
          setLabeledInput("TRF driver", "") &&
          setLabeledInput("DSP driver", "");
      })()`);
      assert.equal(preparedDuplicateOverride, true, `Expected duplicate override ${customerRate} fields to be editable`);

      const clickedDuplicateOverrideSave = await evaluate(`(() => {
        const saveOverrideButton = [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Save Override",
        );

        if (!saveOverrideButton || saveOverrideButton.disabled) {
          return false;
        }

        saveOverrideButton.click();
        return true;
      })()`);
      assert.equal(clickedDuplicateOverrideSave, true, `Expected duplicate override ${customerRate} save to be clickable`);
    };

    await saveDuplicateCompanyOverride(90);
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const heading = [...document.querySelectorAll("h4")].find(
            (element) => element.textContent.trim() === "Company Overrides",
          );
          const panel = heading?.parentElement;
          const rows = [...(panel?.querySelectorAll("[data-rate-company-override-row]") || [])].filter(
            (element) => element.querySelector("p")?.textContent.trim() === "DUPLICATE RATE SAFETY TEST",
          );

          return rows.length === 1 && rows[0].innerText.includes("Customer: MNG 90.00");
        })()`),
      10000,
      "first duplicate rate override save refresh",
    );

    await saveDuplicateCompanyOverride(95);

    const duplicateSaveState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const saveOverrideButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Save Override",
          );
          const feedback = document.querySelector("[data-rate-feedback='override']");
          const globalStatusPanels = [...document.querySelectorAll("[data-status-panel='global']")];
          const heading = [...document.querySelectorAll("h4")].find(
            (element) => element.textContent.trim() === "Company Overrides",
          );
          const panel = heading?.parentElement;
          const rows = [...(panel?.querySelectorAll("[data-rate-company-override-row]") || [])].filter(
            (element) => element.querySelector("p")?.textContent.trim() === "DUPLICATE RATE SAFETY TEST",
          );

          if (
            !saveOverrideButton ||
            !feedback ||
            !feedback.textContent.includes("Override saved.") ||
            rows.length !== 1 ||
            !rows[0].innerText.includes("Customer: MNG 95.00")
          ) {
            return false;
          }

          const buttonRect = saveOverrideButton.getBoundingClientRect();
          const feedbackRect = feedback.getBoundingClientRect();

          return {
            distance: Math.abs(feedbackRect.top - buttonRect.bottom),
            feedbackText: feedback.textContent.trim(),
            globalOverrideMessages: globalStatusPanels.filter((panel) =>
              panel.textContent.includes("Override saved."),
            ).length,
            rowCount: rows.length,
            rowText: rows[0].innerText,
            updateCalls: window.__prestigeRateDuplicateStore?.updateCalls || [],
            unexpectedCalls: window.__prestigeRateDuplicateStore?.unexpectedCalls || [],
          };
        })()`),
      10000,
      "second duplicate rate override save refresh",
    );
    assert.equal(duplicateSaveState.rowCount, 1, "Expected same company override to appear once after repeated saves");
    assert.match(duplicateSaveState.rowText, /Customer: MNG 95\.00/);
    assert.equal(
      duplicateSaveState.updateCalls.length,
      2,
      `Expected repeated same-company saves to update the existing row twice, got ${duplicateSaveState.updateCalls.length}`,
    );
    assert.deepEqual(
      duplicateSaveState.unexpectedCalls,
      [],
      `Expected duplicate save mock to avoid inserts/unhandled calls, got ${duplicateSaveState.unexpectedCalls.join(", ")}`,
    );
    assert.ok(
      duplicateSaveState.updateCalls.every((call) => call.method === "PATCH"),
      `Expected duplicate saves to use PATCH updates, got ${duplicateSaveState.updateCalls.map((call) => call.method).join(", ")}`,
    );
    assert.ok(
      duplicateSaveState.distance <= 80,
      `Expected duplicate save feedback near Save Override, got ${duplicateSaveState.distance}px`,
    );
    assert.equal(
      duplicateSaveState.globalOverrideMessages,
      0,
      "Expected duplicate save feedback not to duplicate in the top Rates status panel",
    );

    const clickedRemoveDuplicateOverride = await evaluate(`(() => {
      const heading = [...document.querySelectorAll("h4")].find(
        (element) => element.textContent.trim() === "Company Overrides",
      );
      const panel = heading?.parentElement;
      const row = [...(panel?.querySelectorAll("[data-rate-company-override-row]") || [])].find(
        (element) => element.querySelector("p")?.textContent.trim() === "DUPLICATE RATE SAFETY TEST",
      );
      const removeButton = [...(row?.querySelectorAll("[data-rate-company-remove]") || [])].find(
        (button) => button.textContent.trim() === "Remove override",
      );

      if (!removeButton || removeButton.disabled) {
        return false;
      }

      window.__prestigeRemoveRateButtonBottom = removeButton.getBoundingClientRect().bottom;
      removeButton.click();
      return true;
    })()`);
    assert.equal(clickedRemoveDuplicateOverride, true, "Expected duplicate company Remove override button to be clickable");

    const removeOverrideState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const heading = [...document.querySelectorAll("h4")].find(
            (element) => element.textContent.trim() === "Company Overrides",
          );
          const panel = heading?.parentElement;
          const rows = [...(panel?.querySelectorAll("[data-rate-company-override-row]") || [])].filter(
            (element) => element.querySelector("p")?.textContent.trim() === "DUPLICATE RATE SAFETY TEST",
          );
          const feedback = document.querySelector("[data-rate-feedback='company-overrides']");
          const globalStatusPanels = [...document.querySelectorAll("[data-status-panel='global']")];

          if (
            !feedback ||
            !feedback.textContent.includes("DUPLICATE RATE SAFETY TEST override removed.") ||
            rows.length !== 0 ||
            panel?.innerText.includes("Customer: MNG 95.00")
          ) {
            return false;
          }

          const feedbackRect = feedback.getBoundingClientRect();

          return {
            distance: Math.abs(feedbackRect.top - (window.__prestigeRemoveRateButtonBottom || feedbackRect.top)),
            feedbackText: feedback.textContent.trim(),
            globalRemoveMessages: globalStatusPanels.filter((panel) =>
              panel.textContent.includes("override removed."),
            ).length,
            rowCount: rows.length,
            updateCalls: window.__prestigeRateDuplicateStore?.updateCalls || [],
            unexpectedCalls: window.__prestigeRateDuplicateStore?.unexpectedCalls || [],
          };
        })()`),
      10000,
      "rate override remove refresh",
    );
    assert.equal(removeOverrideState.rowCount, 0, "Expected removed override row to leave the saved company list");
    assert.equal(
      removeOverrideState.updateCalls.length,
      3,
      `Expected remove override to make a third PATCH update, got ${removeOverrideState.updateCalls.length}`,
    );
    assert.deepEqual(
      removeOverrideState.updateCalls.at(-1)?.payload?.customer_rates,
      {},
      "Expected remove override PATCH to clear customer_rates",
    );
    assert.deepEqual(
      removeOverrideState.updateCalls.at(-1)?.payload?.driver_payout_rules,
      {},
      "Expected remove override PATCH to clear driver_payout_rules",
    );
    assert.deepEqual(
      removeOverrideState.unexpectedCalls,
      [],
      `Expected remove override mock to avoid inserts/unhandled calls, got ${removeOverrideState.unexpectedCalls.join(", ")}`,
    );
    assert.ok(
      removeOverrideState.distance <= 120,
      `Expected remove override feedback near the clicked row, got ${removeOverrideState.distance}px`,
    );
    assert.equal(
      removeOverrideState.globalRemoveMessages,
      0,
      "Expected remove override feedback not to duplicate in the top Rates status panel",
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
