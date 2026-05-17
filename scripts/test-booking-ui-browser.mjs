import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9227);
const bookingSample = `Company: BROWSER UI TEST COMPANY
Booking type: MNG
Vehicle: AVF
Date: 27/05/2026
Time: 15:30
Flight: SQ333
Pickup: Changi Airport Terminal 3
Extra stop: Marina Bay Sands
Drop-off: Raffles Hotel Singapore
Booker: BROWSER UI TEST BOOKER
Booker WhatsApp: +65 9000 0333
Booker Email: browserui@example.com
Name: BROWSER UI TEST TRAVELER
Pax: 2
Child seat: 2 booster seat
Quoted price: $160.00
Driver Name: TEST DRIVER CRM 20260516`;
const dspItinerarySample = `Hi William, we need a car for Drew tomorrow, please refer to the below schedule:
From Grand Hyatt to Ritz-Carlton Singapore (by 10am); 12pm BDC office; 1:30pm Temasek Office, 60B Orchard Road, Tower 2, The Atrium@Orchard, Singapore; 3:30pm 8 Marina View, Asia Square Tower 1, #37-01, Singapore 018960; 6pm Ritz-Carlton`;
const timedScheduleItinerarySample = `Hi William, please arrange a car for Drew tomorrow, schedule as follow:
9:30am 1 HarbourFront Avenue, #02-01 Keppel Bay Tower;
11am One Raffles Quay, #39-01 North Tower;
2pm Capital Tower;
4:30pm BDC office;`;
const browserErrors = [];
const browserConsoleErrors = [];
const forbiddenRuntimeText = [
  "ReferenceError",
  "TypeError",
  "Unhandled Runtime Error",
  "formatOverrideSummary is not defined",
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

function assertBookingUiState(state) {
  const combinedErrors = [...state.errors, ...state.consoleErrors].join("\n");
  const combinedUiText = [
    state.visibleText,
    state.jobCardPreview,
    state.driverDispatch,
    state.fieldText,
    combinedErrors,
  ].join("\n");
  const forbiddenTextFound = forbiddenRuntimeText.filter((text) => combinedUiText.includes(text));

  assert.deepEqual(state.errors, [], `Expected no runtime errors:\n${state.errors.join("\n")}`);
  assert.deepEqual(
    state.consoleErrors,
    [],
    `Expected no browser console errors:\n${state.consoleErrors.join("\n")}`,
  );
  assert.deepEqual(
    forbiddenTextFound,
    [],
    `Forbidden runtime text appeared: ${forbiddenTextFound.join(", ")}`,
  );
  assert.equal(state.fields.company, "BROWSER UI TEST COMPANY");
  assert.equal(state.fields.flight, "SQ333");
  assert.ok(
    state.fields.pickup === "Changi Airport Terminal 3" ||
      state.fields.pickup === "Changi Airport T3",
    `Expected Changi Airport Terminal 3 or T3, received "${state.fields.pickup}"`,
  );
  assert.equal(state.fields.extraStopLocation, "Marina Bay Sands");
  assert.equal(state.fields.extraStopCount, "1");
  assert.equal(state.fields.dropoff, "Raffles Hotel Singapore");
  assert.match(state.visibleText, /Route Extras & Child Seat/);
  assert.match(state.visibleText, /Extra stop location/);
  assert.match(state.visibleText, /Extra Stops/);
  assert.match(state.visibleText, /Child seat count/);
  assert.equal(state.fields.childSeatCount, "2");
  assert.match(state.fields.childSeatType, /booster seat/);
  assert.match(state.visibleText, /Customer Price Override/);
  assert.equal(state.fields.customerPriceOverride, "160");
  assert.ok(combinedUiText.includes("160.00"), "Expected parsed quoted price text 160.00");
  assert.match(state.visibleText, /Job Card Preview/);
  assert.match(state.jobCardPreview, /Guest details hidden for privacy/);
  assert.doesNotMatch(state.jobCardPreview, /BROWSER UI TEST BOOKER/);
  assert.doesNotMatch(state.jobCardPreview, /BROWSER UI TEST TRAVELER/);
  assert.match(state.visibleText, /Driver Dispatch/);
  assert.match(state.driverDispatch, /DRIVER DISPATCH/);
  assert.match(state.visibleText, /Pricing/);
}

async function runChromeTest() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-booking-ui-chrome-"));
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
      "booking parse controls",
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

    const focusedTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(focusedTextarea, true, "Expected booking message textarea to be focused");

    await client.send("Input.insertText", { text: bookingSample });

    const filledTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(bookingSample)}`,
    );
    assert.equal(filledTextarea, true, "Expected booking message textarea to be filled");

    const clickedParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Parse Booking",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedParse, true, "Expected Parse Booking button to be clickable");

    const extractStateScript = `(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const labels = [...document.querySelectorAll("label")];
      const fieldValue = (labelText) => {
        const label = labels.find((candidate) => {
          const spanText = normalizeLabel(candidate.querySelector("span")?.textContent);
          return spanText === labelText;
        });
        const control = label?.querySelector("input, select, textarea");

        if (!control) {
          return "";
        }

        if (control.tagName === "SELECT") {
          return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
        }

        return control.value || "";
      };
      const fieldValuesByLabel = (labelText) =>
        labels
          .filter((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText)
          .map((label) => {
            const control = label.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          });
      const pres = [...document.querySelectorAll("pre")].map((pre) => pre.innerText);
      const fields = {
        company: fieldValue("Company / Account"),
        bookingType: fieldValue("Booking type"),
        flight: fieldValue("Flight number"),
        pickup: fieldValue("Pickup"),
        extraStopLocation: fieldValue("Extra stop location"),
        extraStopCount: fieldValue("Extra Stops"),
        dropoff: fieldValue("Drop-off"),
        childSeatCount: fieldValue("Child seat count"),
        childSeatType: fieldValue("Child seat type / note"),
        customerPriceOverride: fieldValue("Customer Price Override"),
        driverName: fieldValue("Driver Name"),
      };
      const overrideReasons = fieldValuesByLabel("Override Reason");

      return {
        buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
        consoleErrors: window.__prestigeConsoleErrors || [],
        driverDispatch: pres.find((text) => text.includes("DRIVER DISPATCH")) || "",
        errors: window.__prestigeErrors || [],
        fields,
        fieldText: [...Object.values(fields), ...overrideReasons].join("\\n"),
        jobCardPreview: pres.find((text) => text.includes("Guest details hidden for privacy")) || "",
        visibleText: document.body.innerText,
      };
    })()`;
    const state = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.company === "BROWSER UI TEST COMPANY" &&
          candidateState?.fields?.flight === "SQ333" &&
          candidateState?.jobCardPreview?.includes("Guest details hidden for privacy")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed booking UI state",
    );
    state.errors = [...browserErrors, ...(state.errors || [])];
    state.consoleErrors = [...browserConsoleErrors, ...(state.consoleErrors || [])];

    assertBookingUiState(state);

    const focusedDspTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(focusedDspTextarea, true, "Expected booking message textarea to be focused for DSP sample");

    await client.send("Input.insertText", { text: dspItinerarySample });

    const filledDspTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(dspItinerarySample)}`,
    );
    assert.equal(filledDspTextarea, true, "Expected DSP itinerary booking message textarea to be filled");

    const clickedDspParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Parse Booking",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedDspParse, true, "Expected Parse Booking button to parse DSP itinerary sample");

    const dspState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DSP" &&
          candidateState?.fields?.pickup === "Grand Hyatt" &&
          candidateState?.fields?.extraStopCount === "5"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed DSP itinerary UI state",
    );
    dspState.errors = [...browserErrors, ...(dspState.errors || [])];
    dspState.consoleErrors = [...browserConsoleErrors, ...(dspState.consoleErrors || [])];

    assert.deepEqual(dspState.errors, [], `Expected no browser runtime errors, got ${dspState.errors.join("\n")}`);
    assert.deepEqual(
      dspState.consoleErrors,
      [],
      `Expected no browser console errors, got ${dspState.consoleErrors.join("\n")}`,
    );
    assert.equal(dspState.fields.dropoff, "Ritz-Carlton");
    assert.match(
      dspState.jobCardPreview,
      /Grand Hyatt > Multi-stop itinerary hidden for privacy > Ritz-Carlton/,
    );
    assert.doesNotMatch(dspState.jobCardPreview, /Temasek Office|Asia Square|60B Orchard|#37-01|018960/);
    assert.match(dspState.visibleText, /Itinerary preview/);
    assert.match(dspState.driverDispatch, /Pickup: Grand Hyatt/);
    assert.match(dspState.driverDispatch, /Itinerary:/);
    assert.match(dspState.driverDispatch, /1000hrs - Ritz-Carlton Singapore/);
    assert.match(dspState.driverDispatch, /1200hrs - BDC office/);
    assert.match(dspState.driverDispatch, /1330hrs - Temasek Office, The Atrium@Orchard/);
    assert.match(dspState.driverDispatch, /1530hrs - Asia Square Tower 1, 8 Marina View/);
    assert.match(dspState.driverDispatch, /1800hrs - Ritz-Carlton/);
    assert.doesNotMatch(dspState.driverDispatch, /Grand Hyatt > .*Ritz-Carlton/s);
    assert.equal(
      (dspState.driverDispatch.match(/1800hrs - Ritz-Carlton/g) || []).length,
      1,
      "Expected final Ritz-Carlton to appear once in the driver itinerary",
    );

    const focusedTimedScheduleTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedTimedScheduleTextarea,
      true,
      "Expected booking message textarea to be focused for timed schedule sample",
    );

    await client.send("Input.insertText", { text: timedScheduleItinerarySample });

    const filledTimedScheduleTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(timedScheduleItinerarySample)}`,
    );
    assert.equal(
      filledTimedScheduleTextarea,
      true,
      "Expected timed schedule booking message textarea to be filled",
    );

    const clickedTimedScheduleParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Parse Booking",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedTimedScheduleParse,
      true,
      "Expected Parse Booking button to parse timed schedule sample",
    );

    const timedScheduleState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DSP" &&
          candidateState?.fields?.pickup === "1 HarbourFront Avenue, Keppel Bay Tower" &&
          candidateState?.fields?.extraStopCount === "3"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed timed schedule itinerary UI state",
    );
    timedScheduleState.errors = [...browserErrors, ...(timedScheduleState.errors || [])];
    timedScheduleState.consoleErrors = [...browserConsoleErrors, ...(timedScheduleState.consoleErrors || [])];

    assert.deepEqual(
      timedScheduleState.errors,
      [],
      `Expected no browser runtime errors, got ${timedScheduleState.errors.join("\n")}`,
    );
    assert.deepEqual(
      timedScheduleState.consoleErrors,
      [],
      `Expected no browser console errors, got ${timedScheduleState.consoleErrors.join("\n")}`,
    );
    assert.equal(timedScheduleState.fields.dropoff, "BDC office");
    assert.doesNotMatch(timedScheduleState.fields.extraStopLocation, /Marina Bay Sands/);
    assert.match(
      timedScheduleState.fields.extraStopLocation,
      /1 HarbourFront Avenue, Keppel Bay Tower at 9:30am/,
    );
    assert.match(
      timedScheduleState.jobCardPreview,
      /HarbourFront Avenue > Multi-stop itinerary hidden for privacy > BDC office/,
    );
    assert.doesNotMatch(timedScheduleState.jobCardPreview, /#02-01|#39-01|North Tower|Capital Tower/);
    assert.match(timedScheduleState.visibleText, /Itinerary preview/);
    assert.match(timedScheduleState.driverDispatch, /Pickup: 1 HarbourFront Avenue, Keppel Bay Tower/);
    assert.match(timedScheduleState.driverDispatch, /Itinerary:/);
    assert.match(timedScheduleState.driverDispatch, /0930hrs - 1 HarbourFront Avenue, Keppel Bay Tower/);
    assert.match(timedScheduleState.driverDispatch, /1100hrs - One Raffles Quay, North Tower/);
    assert.match(timedScheduleState.driverDispatch, /1400hrs - Capital Tower/);
    assert.match(timedScheduleState.driverDispatch, /1630hrs - BDC office/);
    assert.doesNotMatch(timedScheduleState.driverDispatch, /Pickup > Drop-off|Marina Bay Sands/);

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
