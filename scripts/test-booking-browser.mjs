import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const safariDriverPath = process.env.SAFARIDRIVER || "/System/Cryptexes/App/usr/bin/safaridriver";
const safariDriverPort = Number(process.env.SAFARIDRIVER_PORT || 4444);
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9224);
const bookingSample =
  process.env.BOOKING_SAMPLE ||
  `[11/5/26, 13:33:10] Alson Chua UOB: Hi kindly arrange airport pick up to home on 14 May Thursday 0740 SQ377. Thank you
[11/5/26, 13:33:16] Alson Chua UOB: Lim Yeow Beng`;
const expectMultiple = process.env.EXPECT_MULTIPLE === "1";

const webElementKey = "element-6066-11e4-a52e-4f735466cecf";
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

function extractStateScript(expectMultipleValue) {
  return `const labels = [...document.querySelectorAll("label")];
  const inputAfterLabel = (labelText) => {
    const normalizeLabel = (value) => (value || "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
    const label = labels.find((candidate) => {
      const spanText = normalizeLabel(candidate.querySelector("span")?.textContent);
      return spanText === labelText;
    });
    return label?.querySelector("input")?.value || "";
  };
  const pres = [...document.querySelectorAll("pre")].map((pre) => pre.innerText);
  const result = {
    nameField: inputAfterLabel("Name"),
    parsedState: pres.find((text) => text.includes('"name"')) || "",
    warning: document.body.innerText.includes("Multiple bookings detected") ? "Multiple bookings detected" : "",
    previewText: document.body.innerText.includes("Extracted booking") ? document.body.innerText : "",
    jobCard: pres.find((text) => text.includes("Name:")) || "",
    driverDispatch: pres.find((text) => text.includes("DRIVER DISPATCH")) || "",
    buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
    errors: window.__prestigeErrors || [],
    consoleErrors: window.__prestigeConsoleErrors || [],
    visibleText: document.body.innerText,
  };
  return ${
    expectMultipleValue
      ? "result.warning"
      : "result.nameField || result.parsedState || result.jobCard || result.driverDispatch"
  } ? result : false;`;
}

function assertBrowserState(state) {
  assert.deepEqual(state.errors, []);
  assert.deepEqual(state.consoleErrors, []);
  assert.ok(state.buttonLabels.includes("Save Booking + CRM"));

  if (expectMultiple) {
    assert.equal(state.nameField, "");
    assert.match(state.visibleText, /Multiple bookings detected/);
    assert.match(state.visibleText, /Extracted booking 1/);
    return;
  }

  assert.equal(state.nameField, "Lim Yeow Beng");
  assert.match(state.parsedState, /"name": "Lim Yeow Beng"/);
  assert.match(state.jobCard, /Name: Lim Yeow Beng/);
  assert.match(state.driverDispatch, /Passenger: Lim Yeow Beng/);
}

function request(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        method,
        path: requestPath,
        port: safariDriverPort,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let responseBody = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          let parsedBody = {};

          if (responseBody) {
            try {
              parsedBody = JSON.parse(responseBody);
            } catch {
              reject(new Error(`Invalid WebDriver JSON response: ${responseBody}`));
              return;
            }
          }

          if (res.statusCode && res.statusCode >= 400) {
            const message = parsedBody.value?.message || responseBody || `${method} ${requestPath} failed`;
            reject(new Error(message));
            return;
          }

          resolve(parsedBody.value);
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error(`${method} ${requestPath} timed out`));
    });
    req.end(payload);
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

async function runSafariTest() {
  const safariDriver = spawn(safariDriverPath, ["-p", String(safariDriverPort)], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  let sessionId = "";

  safariDriver.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  async function waitForSafariDriver() {
    const startedAt = Date.now();
    let lastError = null;

    while (Date.now() - startedAt < 10000) {
      try {
        await request("GET", "/status");
        return;
      } catch (error) {
        lastError = error;
        await sleep(100);
      }
    }

    throw new Error(
      `safaridriver did not become ready: ${
        lastError instanceof Error ? lastError.message : "unknown error"
      }\n${stderr}`.trim(),
    );
  }

  async function execute(script, args = []) {
    return request("POST", `/session/${sessionId}/execute/sync`, { script, args });
  }

  async function findElement(using, value) {
    const element = await request("POST", `/session/${sessionId}/element`, { using, value });
    const elementId = element?.[webElementKey];

    assert.ok(elementId, `Expected to find element: ${using} ${value}`);
    return elementId;
  }

  try {
    await waitForSafariDriver();

    const session = await request("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "safari",
        },
      },
    });

    sessionId = session.sessionId;
    assert.ok(sessionId, "Expected Safari WebDriver session id");

    await request("POST", `/session/${sessionId}/url`, { url: appUrl });

    await waitForCondition(
      () =>
      execute(`return Boolean(document.querySelector("textarea")) &&
        [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Parse Booking");`),
      10000,
      "Safari intake controls",
    );
    await execute(
      `window.__prestigeErrors = [];
      window.__prestigeConsoleErrors = [];
      window.addEventListener("error", (event) => window.__prestigeErrors.push(event.message));
      window.addEventListener("unhandledrejection", (event) => window.__prestigeErrors.push(String(event.reason)));
      const originalError = console.error;
      console.error = (...args) => {
        window.__prestigeConsoleErrors.push(args.map(String).join(" "));
        originalError.apply(console, args);
      };`,
    );

    const textareaId = await findElement("css selector", "textarea");
    await request("POST", `/session/${sessionId}/element/${textareaId}/clear`);
    await request("POST", `/session/${sessionId}/element/${textareaId}/value`, {
      text: bookingSample,
    });

    const parseButtonId = await findElement(
      "xpath",
      "//button[normalize-space(.) = 'Parse Booking']",
    );
    await request("POST", `/session/${sessionId}/element/${parseButtonId}/click`);

    const state = await waitForCondition(
      () => execute(extractStateScript(expectMultiple)),
      10000,
      "Safari parsed booking state",
    );

    assertBrowserState(state);
    console.log(JSON.stringify(state, null, 2));
  } finally {
    if (sessionId) {
      await request("DELETE", `/session/${sessionId}`).catch(() => {});
    }

    safariDriver.kill("SIGTERM");
  }
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

async function runChromeTest() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-chrome-"));
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

    await waitForCondition(
      () =>
        evaluate(`Boolean(document.querySelector("textarea")) &&
          [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Parse Booking")`),
      10000,
      "Chrome intake controls",
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

    const textareaFocused = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
      return true;
    })()`);

    assert.equal(textareaFocused, true, "Expected textarea to be focusable");
    await client.send("Input.insertText", { text: bookingSample });
    await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await sleep(100);
    const typedTextareaValue = await evaluate(`document.querySelector("textarea")?.value || ""`);
    assert.equal(typedTextareaValue, bookingSample, "Expected booking sample to be entered into textarea");

    await evaluate(`(async () => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Parse Booking",
      );

      if (!parseButton) {
        return false;
      }

      parseButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return true;
    })()`);

    await waitForCondition(
      () =>
        evaluate(
          expectMultiple
            ? `document.body.innerText.includes("Multiple bookings detected")`
            : `document.body.innerText.includes("Name: Lim Yeow Beng") &&
              document.body.innerText.includes("Passenger: Lim Yeow Beng")`,
        ),
      10000,
      "Chrome parsed booking state",
    );

    const state = {
      nameField: await evaluate(`(() => {
        const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
        const label = [...document.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Name",
        );
        return label?.querySelector("input")?.value || "";
      })()`),
      parsedState: await evaluate(
        `([...document.querySelectorAll("pre")].map((pre) => pre.innerText).find((text) => text.includes('"name"')) || "")`,
      ),
      warning: await evaluate(
        `document.body.innerText.includes("Multiple bookings detected") ? "Multiple bookings detected" : ""`,
      ),
      previewText: await evaluate(
        `document.body.innerText.includes("Extracted booking") ? document.body.innerText : ""`,
      ),
      jobCard: await evaluate(
        `([...document.querySelectorAll("pre")].map((pre) => pre.innerText).find((text) => text.includes("Name:")) || "")`,
      ),
      driverDispatch: await evaluate(
        `([...document.querySelectorAll("pre")].map((pre) => pre.innerText).find((text) => text.includes("DRIVER DISPATCH")) || "")`,
      ),
      buttonLabels: await evaluate(
        `[...document.querySelectorAll("button")].map((button) => button.textContent.trim())`,
      ),
      errors: await evaluate(`window.__prestigeErrors || []`),
      consoleErrors: await evaluate(`window.__prestigeConsoleErrors || []`),
      visibleText: await evaluate(`document.body.innerText`),
    };
    state.errors = [...browserErrors, ...(state.errors || [])];
    state.consoleErrors = [...browserConsoleErrors, ...(state.consoleErrors || [])];

    assertBrowserState(state);
    console.log(JSON.stringify(state, null, 2));
  } catch (error) {
    let pageSnapshot = "";

    if (client) {
      try {
        const snapshot = await client.send("Runtime.evaluate", {
          expression: `({
            href: location.href,
            readyState: document.readyState,
            hasTextarea: Boolean(document.querySelector("textarea")),
            textareaValue: document.querySelector("textarea")?.value || "",
            statusText:
              [...document.querySelectorAll("div")]
                .map((element) => element.textContent?.trim() || "")
                .find(
                  (text) =>
                    text === "Ready for dispatch." ||
                    text === "Paste a booking message before parsing." ||
                    text.includes("Parsed "),
                ) || "",
            buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
            bodyText: document.body?.innerText?.slice(0, 500) || "",
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
  if (browserName === "safari") {
    await runSafariTest();
    return;
  }

  if (browserName === "chrome") {
    await runChromeTest();
    return;
  }

  throw new Error(`Unsupported browser "${browserName}". Use "chrome" or "safari".`);
}

await runBrowserTest();
