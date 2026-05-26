import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mockDriverJobTokens } from "../lib/driver-job-link-mock-store.ts";
import {
  createChromeClient,
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
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9228);
const browserErrors = [];
const browserConsoleErrors = [];

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
  assert.doesNotMatch(text, /SECRET_ARRIVAL_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_ARRIVAL_BOOKER_NAME/);
  assert.doesNotMatch(text, /SECRET_ARRIVAL_CRM_COMPANY/);
  assert.doesNotMatch(text, /secret-arrival-crm\.example\.com/);
  assert.doesNotMatch(text, /SECRET_ARRIVAL_DRIVER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_ARRIVAL_DRIVER_DATABASE_LIST/);
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
  assert.doesNotMatch(source, /navigator\.mediaDevices|getUserMedia/i, "Driver pages must not call camera APIs.");
  assert.doesNotMatch(source, /\/api\/(?:driver-)?live-location/i, "Driver pages must not add live location endpoints.");
  assert.doesNotMatch(source, /\/api\/(?:driver-)?(?:ots-photo|photo-proof)/i, "Driver pages must not add photo upload endpoints.");
  assert.doesNotMatch(source, /\/api\/[^"')\s]*(?:upload|storage|file)/i, "Driver pages must not add upload, storage, or file APIs.");
  assert.doesNotMatch(source, /\/api\/(?:driver-)?(?:flight|eta|reminder|notification|notify|sms|whatsapp)/i, "Driver pages must not add flight or notification endpoints.");
  assert.doesNotMatch(source, /\/api\/[^"')\s]*(?:cancel|reassign|replacement|exception|breakdown|missed|late-driver)/i, "Driver pages must not add dispatcher exception APIs.");
  assert.doesNotMatch(source, /aviationstack|flightaware|flightstats|flightradar|opensky|aeroapi/i, "Driver pages must not add real flight API integrations.");
  assert.doesNotMatch(source, /twilio|messagebird|vonage|nexmo|api\.whatsapp\.com|wa\.me|whatsapp\.send|sendWhatsApp|sendWhatsapp|sendSms|sendSMS|sms\.send/i, "Driver pages must not add WhatsApp/SMS integrations.");
  assert.doesNotMatch(source, /\b(?:Notification|PushManager|serviceWorker|showNotification|sendNotification)\b/, "Driver pages must not add notification APIs.");
  assert.doesNotMatch(source, /google\.maps|maps\.google|mapbox|gps api/i, "Driver pages must not add map or GPS APIs.");
  assert.doesNotMatch(source, /customer live location link/i, "Driver pages must not create fake customer live location links.");
  assert.doesNotMatch(source, /type=["']file["']|capture=|accept=["'][^"']*image/i, "Driver pages must not add file or camera inputs.");
  assert.doesNotMatch(source, /new FormData|URL\.createObjectURL|supabase\.storage|storage\.from|\.upload\s*\(/i, "Driver pages must not add upload/storage plumbing.");
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
        activityLogItems: [...document.querySelectorAll("[data-driver-job-activity-log-item]")]
          .map((item) => item.innerText.trim()),
        activityLogLabels: [...document.querySelectorAll("[data-driver-job-activity-log-label]")]
          .map((item) => item.textContent.trim()),
        buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
        consoleErrors: window.__prestigeConsoleErrors || [],
        errors: window.__prestigeErrors || [],
        fetchCalls: window.__driverJobFetchCalls || [],
        fileInputs: [...document.querySelectorAll("input[type='file'], input[capture], input[accept*='image'], input[accept*='photo']")]
          .map((input) => input.closest("label")?.innerText.trim() || input.outerHTML),
        resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
        statusText: document.querySelector("[data-driver-job-current-status='true']")?.textContent?.trim() || "",
        visibleText: document.body?.innerText || "",
        dispatcherExceptionText: [
          "cancel driver assignment",
          "cancel assignment",
          "replacement driver",
          "replacement car",
          "reassign driver",
          "car breakdown",
          "driver missed job",
          "late driver",
        ].filter((value) => (document.body?.innerText || "").toLowerCase().includes(value)),
        workflowSummaryRows: Object.fromEntries(
          [...document.querySelectorAll("[data-driver-job-workflow-summary-row]")].map((row) => [
            row.getAttribute("data-driver-job-workflow-summary-row"),
            row.querySelector("[data-driver-job-workflow-summary-value]")?.textContent.trim() || "",
          ]),
        ),
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
            const workflowSummary = document.querySelector("[data-driver-job-workflow-summary]");
            const workflowAcknowledgement = document
              .querySelector("[data-driver-job-workflow-summary-row='job-acknowledged'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return state?.textContent.trim() === "Acknowledged" &&
              workflowSummary?.innerText.includes("Mock Dispatcher Driver Workflow Summary") &&
              workflowAcknowledgement === "Acknowledged" &&
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
          ["[data-driver-job-detail-paynow]", "8123 4567"],
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
              savedDetails?.innerText.includes("Toyota Alphard") &&
              savedDetails?.innerText.includes("8123 4567")
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
            const workflowLiveLocation = document
              .querySelector("[data-driver-job-workflow-summary-row='live-location'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() ===
              "Mock live location active locally for this mock driver page. No phone location is captured or sent." &&
              state?.textContent.trim() === "Mock live location active" &&
              workflowLiveLocation === "Active"
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

    const clickMockDriverReminder = async (expectedStatusText) => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-reminder]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected Trigger Mock 1-Hour Reminder button to be clickable.");

      const reminderState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-reminder]");
            const message = document.querySelector("[data-driver-job-reminder-message]");
            const section = document.querySelector("[data-driver-job-reminder-section]");
            const dispatcherLog = document.querySelector("[data-driver-job-dispatcher-notification-log]");
            const summary = document.querySelector("[data-driver-job-reminder-summary]");
            const summaryStatus = document.querySelector("[data-driver-job-reminder-summary-status]");
            const summaryState = document.querySelector("[data-driver-job-reminder-summary-state]");
            const summaryLog = document.querySelector("[data-driver-job-reminder-summary-log]");
            const summaryMockOnly = document.querySelector("[data-driver-job-reminder-summary-mock-only]");
            const workflowReminder = document
              .querySelector("[data-driver-job-workflow-summary-row='reminder-status'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const workflowDispatcherLog = document
              .querySelector("[data-driver-job-workflow-summary-row='dispatcher-log'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const workflowMockOnly = document.querySelector("[data-driver-job-workflow-summary-mock-only]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();
            const statusText = document.querySelector("[data-driver-job-current-status='true']")?.textContent.trim() || "";

            return section?.innerText.includes("Mock Driver Reminder") &&
              summary?.innerText.includes("Mock dispatcher reminder summary") &&
              summaryStatus?.textContent.trim() === "Triggered locally" &&
              summaryState?.textContent.trim() === "Triggered" &&
              summaryLog?.textContent.includes("Mock dispatcher notification log: Driver reminder recorded locally.") &&
              summaryMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
              workflowReminder === "Triggered locally (Triggered)" &&
              workflowDispatcherLog?.includes("Mock dispatcher notification log: Driver reminder recorded locally.") &&
              workflowMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
              section?.innerText.includes("Mock/local only. No real notification, WhatsApp, or SMS is sent.") &&
              section?.innerText.includes("Mock reminder: 1 hour before pickup") &&
              section?.innerText.includes("Reminder tells the driver to activate mock live location and continue workflow.") &&
              message?.textContent.trim() === "Mock 1-hour reminder triggered locally. No real notification, WhatsApp, or SMS was sent." &&
              dispatcherLog?.textContent.includes("Mock dispatcher notification log") &&
              dispatcherLog?.textContent.includes("Mock only. No message was sent.") &&
              statusText === ${JSON.stringify(expectedStatusText)}
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  dispatcherText: dispatcherLog.textContent.trim(),
                  messageText: message.textContent.trim(),
                  statusText,
                }
              : false;
          })()`),
        10000,
        "mock 1-hour driver reminder",
      );

      assert.equal(reminderState.distance <= 16, true, "Expected mock reminder feedback near reminder button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Mock driver reminder should stay local and avoid network requests.",
      );
      assert.deepEqual(
        afterState.activityLogLabels.slice(-1),
        ["Mock 1-hour reminder triggered"],
        "Expected mock reminder trigger to create an activity log entry.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const clickBlockedMockDriverReminder = async (expectedStatusText) => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-reminder]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected Trigger Mock 1-Hour Reminder button to be clickable after POB.");

      const blockedReminderState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-reminder]");
            const message = document.querySelector("[data-driver-job-reminder-message]");
            const dispatcherLog = document.querySelector("[data-driver-job-dispatcher-notification-log]");
            const summary = document.querySelector("[data-driver-job-reminder-summary]");
            const summaryStatus = document.querySelector("[data-driver-job-reminder-summary-status]");
            const summaryState = document.querySelector("[data-driver-job-reminder-summary-state]");
            const summaryLog = document.querySelector("[data-driver-job-reminder-summary-log]");
            const summaryMockOnly = document.querySelector("[data-driver-job-reminder-summary-mock-only]");
            const workflowReminder = document
              .querySelector("[data-driver-job-workflow-summary-row='reminder-status'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const workflowDispatcherLog = document
              .querySelector("[data-driver-job-workflow-summary-row='dispatcher-log'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const workflowMockOnly = document.querySelector("[data-driver-job-workflow-summary-mock-only]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();
            const statusText = document.querySelector("[data-driver-job-current-status='true']")?.textContent.trim() || "";

            return message?.textContent.trim() === "Mock reminder is blocked after POB or Job Completed." &&
              summary?.innerText.includes("Mock dispatcher reminder summary") &&
              summaryStatus?.textContent.trim() === "Blocked locally" &&
              summaryState?.textContent.trim() === "Blocked" &&
              summaryLog?.textContent.includes("Mock dispatcher notification log: Reminder blocked locally after POB or Job Completed.") &&
              summaryMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
              workflowReminder === "Blocked locally (Blocked)" &&
              workflowDispatcherLog?.includes("Mock dispatcher notification log: Reminder blocked locally after POB or Job Completed.") &&
              workflowMockOnly?.textContent.trim() === "Mock only. No real message was sent." &&
              dispatcherLog?.textContent.includes("Mock dispatcher notification log") &&
              dispatcherLog?.textContent.includes("Mock only. No message was sent.") &&
              statusText === ${JSON.stringify(expectedStatusText)}
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  dispatcherText: dispatcherLog.textContent.trim(),
                  messageText: message.textContent.trim(),
                  statusText,
                }
              : false;
          })()`),
        10000,
        "blocked mock 1-hour driver reminder",
      );

      assert.equal(blockedReminderState.distance <= 16, true, "Expected blocked reminder feedback near reminder button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Blocked mock driver reminder should stay local and avoid network requests.",
      );
      assert.deepEqual(
        afterState.activityLogLabels.slice(-1),
        ["Mock reminder blocked"],
        "Expected blocked mock reminder to create an activity log entry.",
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
            const workflowKey = ${JSON.stringify({
              "Job Completed": "completed",
              OTS: "ots",
              OTW: "otw",
              POB: "pob",
            }[label])};
            const workflowValue = workflowKey
              ? document
                  .querySelector(\`[data-driver-job-workflow-summary-row="\${workflowKey}"] [data-driver-job-workflow-summary-value]\`)
                  ?.textContent.trim()
              : "";

            return statusText.includes(${JSON.stringify(expectedStatus)}) &&
              messageText.includes(${JSON.stringify(expectedMessage)}) &&
              (!workflowKey || workflowValue === "Done");
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

    const clickMissingEtaOtw = async () => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-status='OTW']");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected OTW status button to be clickable before ETA acknowledgement.");

      const blockedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-status='OTW']");
            const message = document.querySelector("[data-driver-job-status-message='OTW']");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();
            const statusText = document.querySelector("[data-driver-job-current-status='true']")?.textContent.trim() || "";
            const activityLogText = document.querySelector("[data-driver-job-activity-log]")?.innerText || "";
            const workflowOtw = document
              .querySelector("[data-driver-job-workflow-summary-row='otw'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const workflowLatestEta = document
              .querySelector("[data-driver-job-workflow-summary-row='latest-eta'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();

            return message?.textContent.trim() === "Acknowledge latest mock flight ETA before OTW." &&
              statusText === "Assigned" &&
              workflowOtw === "Pending" &&
              workflowLatestEta === "Pending acknowledgement" &&
              activityLogText.includes("OTW blocked") &&
              activityLogText.includes("OTW was blocked because latest ETA acknowledgement is missing.")
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  statusText,
                }
              : false;
          })()`),
        10000,
        "OTW blocked by missing latest mock flight ETA acknowledgement",
      );

      assert.equal(blockedState.distance <= 16, true, "Expected missing-ETA feedback near OTW button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Missing-ETA OTW block should not make a network request.",
      );
      assert.deepEqual(
        afterState.activityLogLabels.slice(-1),
        ["OTW blocked"],
        "Expected missing-ETA OTW block to add a local activity log entry.",
      );
      assert.ok(
        afterState.activityLogItems.at(-1)?.includes("OTW was blocked because latest ETA acknowledgement is missing."),
        "Expected missing-ETA OTW log entry detail.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const clickMissingProofPob = async () => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-status='POB']");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected POB status button to be clickable before proof.");

      const blockedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-status='POB']");
            const message = document.querySelector("[data-driver-job-status-message='POB']");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();
            const statusText = document.querySelector("[data-driver-job-current-status='true']")?.textContent.trim() || "";
            const activityLogText = document.querySelector("[data-driver-job-activity-log]")?.innerText || "";
            const workflowPob = document
              .querySelector("[data-driver-job-workflow-summary-row='pob'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const workflowProof = document
              .querySelector("[data-driver-job-workflow-summary-row='ots-photo-proof'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();

            return message?.textContent.trim() === "Add mock OTS photo proof before POB." &&
              statusText === "OTS" &&
              workflowPob === "Pending" &&
              workflowProof === "Pending proof" &&
              activityLogText.includes("POB blocked") &&
              activityLogText.includes("POB was blocked because OTS photo proof is missing.")
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  statusText,
                }
              : false;
          })()`),
        10000,
        "POB blocked by missing mock OTS photo proof",
      );

      assert.equal(blockedState.distance <= 16, true, "Expected missing-proof feedback near POB button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Missing-proof POB block should not make a network request.",
      );
      assert.deepEqual(
        afterState.activityLogLabels.slice(-1),
        ["POB blocked"],
        "Expected missing-proof POB block to add a local activity log entry.",
      );
      assert.ok(
        afterState.activityLogItems.at(-1)?.includes("POB was blocked because OTS photo proof is missing."),
        "Expected missing-proof POB log entry detail.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const clickAcknowledgeLatestEta = async () => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-latest-eta]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected Acknowledge Latest ETA button to be clickable.");

      const etaState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-latest-eta]");
            const message = document.querySelector("[data-driver-job-latest-eta-message]");
            const state = document.querySelector("[data-driver-job-latest-eta-state]");
            const section = document.querySelector("[data-driver-job-latest-eta-section]");
            const etaValue = document.querySelector("[data-driver-job-latest-eta-value]");
            const workflowLatestEta = document
              .querySelector("[data-driver-job-workflow-summary-row='latest-eta'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return section?.innerText.includes("Mock/local only. No real flight API is called and no notification is sent.") &&
              etaValue?.textContent.trim() === "Latest mock flight ETA: 15:45" &&
              message?.textContent.trim() === "Latest mock flight ETA acknowledged locally. No real flight API or notification was used." &&
              state?.textContent.trim() === "Latest mock flight ETA acknowledged" &&
              workflowLatestEta === "Acknowledged"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        "latest mock flight ETA acknowledged",
      );

      assert.equal(etaState.distance <= 16, true, "Expected ETA acknowledgement feedback near ETA button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Acknowledging latest mock flight ETA should stay local and avoid network requests.",
      );
      assert.deepEqual(
        afterState.activityLogLabels.slice(-1),
        ["Latest ETA acknowledged"],
        "Expected latest ETA acknowledgement to create an activity log entry.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const clickAddMockOtsPhotoProof = async () => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-ots-photo-proof]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected Add Mock OTS Photo Proof button to be clickable.");

      const proofState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-ots-photo-proof]");
            const message = document.querySelector("[data-driver-job-ots-photo-proof-message]");
            const state = document.querySelector("[data-driver-job-ots-photo-proof-state]");
            const section = document.querySelector("[data-driver-job-ots-photo-proof-section]");
            const workflowProof = document
              .querySelector("[data-driver-job-workflow-summary-row='ots-photo-proof'] [data-driver-job-workflow-summary-value]")
              ?.textContent.trim();
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return section?.innerText.includes("Mock/local only. No real file upload, camera, or storage is used.") &&
              message?.textContent.trim() === "Mock OTS photo proof added locally. No real file upload, camera, or storage was used." &&
              state?.textContent.trim() === "Mock OTS photo proof added" &&
              workflowProof === "Added"
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  stateText: state.textContent.trim(),
                }
              : false;
          })()`),
        10000,
        "mock OTS photo proof added",
      );

      assert.equal(proofState.distance <= 16, true, "Expected proof feedback near proof button.");

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length,
        "Adding mock OTS photo proof should stay local and avoid network requests.",
      );
      assert.deepEqual(
        afterState.activityLogLabels.slice(-1),
        ["Mock OTS photo proof added"],
        "Expected mock OTS photo proof addition to create an activity log entry.",
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
    assert.deepEqual(validState.fileInputs, [], "Public driver job page must not expose real file/photo inputs.");
    assert.deepEqual(
      validState.dispatcherExceptionText,
      [],
      "Public driver job page must keep dispatcher cancel/replacement workflow absent and future/staff-controlled.",
    );
    assert.ok(validState.visibleText.includes("Mock Driver Reminder"));
    assert.ok(validState.visibleText.includes("Mock Dispatcher Driver Workflow Summary"));
    assert.ok(validState.visibleText.includes("Mock/local only. Dispatcher-facing workflow checklist for this mock driver page."));
    assert.equal(validState.workflowSummaryRows["job-acknowledged"], "Waiting");
    assert.equal(validState.workflowSummaryRows["reminder-status"], "Pending local trigger (Not triggered)");
    assert.equal(validState.workflowSummaryRows.otw, "Pending");
    assert.equal(validState.workflowSummaryRows.ots, "Pending");
    assert.equal(validState.workflowSummaryRows.pob, "Pending");
    assert.equal(validState.workflowSummaryRows.completed, "Pending");
    assert.equal(validState.workflowSummaryRows["live-location"], "Inactive");
    assert.equal(
      validState.workflowSummaryRows["dispatcher-log"],
      "No mock dispatcher notification recorded yet.",
    );
    assert.equal(
      Object.hasOwn(validState.workflowSummaryRows, "latest-eta"),
      false,
      "DEP public mock job should not show latest ETA in workflow summary.",
    );
    assert.equal(
      Object.hasOwn(validState.workflowSummaryRows, "ots-photo-proof"),
      false,
      "DEP public mock job should not show OTS proof in workflow summary.",
    );
    assert.ok(validState.visibleText.includes("Mock dispatcher reminder summary"));
    assert.ok(validState.visibleText.includes("Mock driver reminder status"));
    assert.ok(validState.visibleText.includes("Pending local trigger"));
    assert.ok(validState.visibleText.includes("Reminder triggered / blocked state"));
    assert.ok(validState.visibleText.includes("Not triggered"));
    assert.ok(validState.visibleText.includes("Mock dispatcher notification log"));
    assert.ok(validState.visibleText.includes("No mock dispatcher notification recorded yet."));
    assert.ok(validState.visibleText.includes("Mock only. No real message was sent."));
    assert.ok(validState.visibleText.includes("Mock/local only. No real notification, WhatsApp, or SMS is sent."));
    assert.ok(validState.visibleText.includes("Mock reminder: 1 hour before pickup"));
    assert.ok(validState.visibleText.includes("Trigger Mock 1-Hour Reminder"));
    assert.equal(
      validState.visibleText.includes("Add Mock OTS Photo Proof"),
      false,
      "DEP public mock job should not show OTS photo proof at Assigned.",
    );
    assert.equal(
      validState.visibleText.includes("Acknowledge Latest ETA"),
      false,
      "DEP public mock job should not show latest ETA acknowledgement.",
    );
    assert.ok(validState.visibleText.includes("Driver Activity Log"));
    assert.ok(validState.visibleText.includes("No mock driver activity recorded yet."));
    assert.ok(validState.visibleText.includes("Driver Details"));
    assert.ok(validState.visibleText.includes("Driver name"));
    assert.ok(validState.visibleText.includes("Contact"));
    assert.ok(validState.visibleText.includes("Car plate"));
    assert.ok(validState.visibleText.includes("Vehicle model"));
    assert.ok(validState.visibleText.includes("PayNow number"));
    assert.deepEqual(
      validState.buttonLabels.filter((buttonLabel) =>
        ["Acknowledge Job", "Save", "OTW", "OTS", "POB", "Job Completed"].includes(buttonLabel),
      ),
      ["Acknowledge Job", "Save", "OTW", "OTS", "POB", "Job Completed"],
      "Expected public driver job page to show acknowledgement, details, and status controls in order.",
    );
    assert.deepEqual(
      validState.buttonLabels.filter((buttonLabel) =>
        [
          "Acknowledge Job",
          "Activate Mock Live Location",
          "Trigger Mock 1-Hour Reminder",
          "Save",
          "OTW",
          "OTS",
          "POB",
          "Job Completed",
        ].includes(
          buttonLabel,
        ),
      ),
      [
        "Acknowledge Job",
        "Activate Mock Live Location",
        "Trigger Mock 1-Hour Reminder",
        "Save",
        "OTW",
        "OTS",
        "POB",
        "Job Completed",
      ],
      "Expected public driver job page to show mock live location and reminder controls before details/status controls.",
    );
    assertNoSensitiveText(validState);

    await clickMockDriverReminder(startingStatusText);
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
    const depOtsState = await pageState();
    assert.equal(
      depOtsState.visibleText.includes("Add Mock OTS Photo Proof"),
      false,
      "DEP public mock job should not require OTS photo proof after OTS.",
    );
    assert.equal(
      depOtsState.visibleText.includes("Acknowledge Latest ETA"),
      false,
      "DEP public mock job should not require latest ETA acknowledgement after OTS.",
    );
    await clickBlockedStatus("Job Completed", "Update POB before Job Completed.", "OTS");
    await clickStatus("POB", "POB", "Status updated to POB. Mock live location ended locally.");
    const endedLiveLocationState = await pageState();
    assert.ok(
      endedLiveLocationState.visibleText.includes("Mock live location inactive"),
      "Expected POB to auto-end mock live location.",
    );
    assert.equal(endedLiveLocationState.workflowSummaryRows.pob, "Done");
    assert.equal(endedLiveLocationState.workflowSummaryRows["live-location"], "Inactive");
    await clickBlockedMockDriverReminder("POB");
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
        "Mock 1-hour reminder triggered",
        "Job acknowledged",
        "Mock live location activated",
        "Mock driver details saved",
        "OTW marked",
        "OTS marked",
        "POB marked",
        "Mock live location auto-ended at POB",
        "Mock reminder blocked",
        "Job Completed marked",
      ],
      "Expected public driver activity log to preserve reminder and successful workflow event order.",
    );
    await clickBlockedLiveLocation("Mock live location has ended for this job.");
    await resetMockDriverJobData();

    const arrivalState = await navigateToDriverJob(mockDriverJobTokens.arrivalWorkflow, "Mock Arrival Pickup");
    assert.ok(arrivalState.visibleText.includes("Mock Arrival Dropoff"));
    assert.ok(arrivalState.visibleText.includes("Mock Arrival Pickup > Mock Arrival Waypoint > Mock Arrival Dropoff"));
    assert.ok(arrivalState.visibleText.includes("SQ777"));
    assert.ok(arrivalState.visibleText.includes("Mock Arrival Passenger"));
    assert.ok(arrivalState.visibleText.includes("Mock Arrival Driver"));
    assert.ok(arrivalState.visibleText.includes("Mock Driver Reminder"));
    assert.ok(arrivalState.visibleText.includes("Mock Dispatcher Driver Workflow Summary"));
    assert.equal(arrivalState.workflowSummaryRows["job-acknowledged"], "Waiting");
    assert.equal(arrivalState.workflowSummaryRows["latest-eta"], "Pending acknowledgement");
    assert.equal(arrivalState.workflowSummaryRows["ots-photo-proof"], "Pending proof");
    assert.ok(arrivalState.visibleText.includes("Mock dispatcher reminder summary"));
    assert.ok(arrivalState.visibleText.includes("Mock only. No real message was sent."));
    assert.ok(arrivalState.visibleText.includes("Trigger Mock 1-Hour Reminder"));
    assert.ok(arrivalState.visibleText.includes("Mock Latest Flight ETA"));
    assert.ok(arrivalState.visibleText.includes("Mock/local only. No real flight API is called and no notification is sent."));
    assert.ok(arrivalState.visibleText.includes("Latest mock flight ETA: 15:45"));
    assert.ok(arrivalState.visibleText.includes("Acknowledge Latest ETA"));
    assert.equal(
      arrivalState.visibleText.includes("Add Mock OTS Photo Proof"),
      false,
      "Arrival public mock job should show OTS photo proof only after OTS.",
    );
    assertNoSensitiveText(arrivalState);

    await clickAcknowledge();
    await clickActivateLiveLocation();
    await clickMissingEtaOtw();
    await clickAcknowledgeLatestEta();
    await clickStatus("OTW", "OTW");
    await clickStatus("OTS", "OTS");
    const arrivalOtsState = await waitForCondition(
      async () => {
        const state = await pageState();

        return state.visibleText.includes("Mock OTS Photo Proof") &&
          state.visibleText.includes("Mock/local only. No real file upload, camera, or storage is used.") &&
          state.visibleText.includes("Add Mock OTS Photo Proof") &&
          state.activityLogLabels.includes("OTS photo proof requested")
          ? state
          : false;
      },
      10000,
      "Arrival mock OTS photo proof section",
    );
    assert.deepEqual(arrivalOtsState.fileInputs, [], "Mock OTS proof must not expose real file/photo inputs.");
    assert.deepEqual(
      arrivalOtsState.dispatcherExceptionText,
      [],
      "Arrival public driver page must keep dispatcher exception workflow absent and future/staff-controlled.",
    );
    assertNoSensitiveText(arrivalOtsState);
    await clickMissingProofPob();
    await clickAddMockOtsPhotoProof();
    await clickStatus("POB", "POB", "Status updated to POB. Mock live location ended locally.");
    const arrivalPobState = await pageState();
    assert.ok(
      arrivalPobState.visibleText.includes("Mock live location inactive"),
      "Expected Arrival POB to auto-end mock live location after proof.",
    );
    assert.equal(arrivalPobState.workflowSummaryRows.pob, "Done");
    assert.equal(arrivalPobState.workflowSummaryRows["ots-photo-proof"], "Added");
    assert.equal(arrivalPobState.workflowSummaryRows["live-location"], "Inactive");
    await clickStatus("Job Completed", "Job Completed");
    const arrivalCompletedState = await pageState();
    assert.equal(arrivalCompletedState.workflowSummaryRows.completed, "Done");
    assert.equal(arrivalCompletedState.workflowSummaryRows["latest-eta"], "Acknowledged");
    assert.equal(arrivalCompletedState.workflowSummaryRows["ots-photo-proof"], "Added");
    assert.deepEqual(
      arrivalCompletedState.activityLogLabels,
      [
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
      "Expected Arrival public driver activity log to include proof request, blocked POB, proof, and successful completion.",
    );
    assertNoSensitiveText(arrivalCompletedState);
    await resetMockDriverJobData();

    for (const [token, label] of [
      ["not-a-real-token", "invalid"],
      [mockDriverJobTokens.expired, "expired"],
      [mockDriverJobTokens.revoked, "revoked"],
    ]) {
      const blockedState = await navigateToDriverJob(token, "Driver job link unavailable");

      assert.equal(
        blockedState.buttonLabels.some((buttonLabel) =>
          [
            "Acknowledge Job",
            "Activate Mock Live Location",
            "Trigger Mock 1-Hour Reminder",
            "Save",
            "OTW",
            "OTS",
            "POB",
            "Job Completed",
          ].includes(
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
