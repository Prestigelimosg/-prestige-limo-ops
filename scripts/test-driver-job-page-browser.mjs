import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mockDriverJobTokens } from "../lib/driver-job-link-mock-store.ts";
import {
  createChromeClient,
  navigateAndWaitForBodyText,
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
const nativeAppOnlyLanguagePattern =
  /\b(?:native\s+(?:mobile\s+)?app|ios\s+app|android\s+app|app\s+store|play\s+store)\b/i;

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
  assert.doesNotMatch(text, /\bpay\s*now\b|paynow/i, "Driver job page should not expose PayNow details.");
  assert.doesNotMatch(text, /\bbilling\b/i, "Driver job page should not expose billing details.");
  assert.doesNotMatch(text, /\binvoice\b/i, "Driver job page should not expose invoice details.");
  assert.doesNotMatch(text, /\bpayment\b/i, "Driver job page should not expose payment details.");
  assert.doesNotMatch(text, /\bpayout\b/i, "Driver job page should not expose payout details.");
  assert.doesNotMatch(text, /\bfinance\b/i, "Driver job page should not expose finance details.");
  assert.doesNotMatch(
    text,
    nativeAppOnlyLanguagePattern,
    "Driver job page should stay mobile-web/PWA-first without native app assumptions.",
  );
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

  assert.match(
    source,
    /const driverLiveLocationUiState = pageState\.kind === "ready" \? "runtime-check" : "disabled";/,
    "Driver live-location Share/Stop UI must stay behind the loaded job/runtime-check state.",
  );
  assert.match(
    source,
    /checkDriverLiveLocationReadiness/,
    "Driver browser GPS must stay behind the server runtime readiness gate.",
  );
  assert.match(
    source,
    /navigator\.geolocation\.getCurrentPosition/,
    "Driver live-location must request the initial browser position only through the explicit gated Share click path.",
  );
  assert.match(
    source,
    /navigator\.geolocation\.watchPosition/,
    "Driver live-location may keep sharing through the explicit gated Share click path.",
  );
  assert.match(
    source,
    /navigator\.geolocation\.clearWatch/,
    "Driver live-location continuous sharing must be cleared by Stop Sharing and page cleanup.",
  );
  assert.doesNotMatch(source, /setInterval|setTimeout|sendBeacon/i, "Driver pages must not add timer/sendBeacon GPS loops.");
  assert.doesNotMatch(
    source,
    /void\s+shareDriverLiveLocation\(|shareDriverLiveLocation\(\);|shareDriverLiveLocation\(\)\.catch/i,
    "Driver pages must not auto-start live location from page load or status changes.",
  );
  assert.doesNotMatch(source, /navigator\.mediaDevices|getUserMedia/i, "Driver pages must not call camera APIs.");
  assert.doesNotMatch(source, /localStorage|sessionStorage/i, "Driver pages must not add browser storage persistence.");
  assert.match(
    source,
    /\/api\/driver-job\/\$\{encodeURIComponent\(token\)\}\/ots-photo/,
    "Driver OTS photo proof must use the existing tokenized driver-job route.",
  );
  assert.doesNotMatch(source, /\/api\/[^"')\s]*(?:upload|storage|file)/i, "Driver pages must not add upload, storage, or file APIs.");
  assert.doesNotMatch(source, /\/api\/(?:driver-)?(?:flight|eta|reminder|notification|notify|sms|whatsapp)/i, "Driver pages must not add flight or notification endpoints.");
  assert.doesNotMatch(source, /\/api\/[^"')\s]*(?:cancel|reassign|replacement|exception|breakdown|missed|late-driver)/i, "Driver pages must not add dispatcher exception APIs.");
  assert.doesNotMatch(source, /aviationstack|flightaware|flightstats|flightradar|opensky|aeroapi/i, "Driver pages must not add real flight API integrations.");
  assert.doesNotMatch(source, /twilio|messagebird|vonage|nexmo|api\.whatsapp\.com|wa\.me|whatsapp\.send|sendWhatsApp|sendWhatsapp|sendSms|sendSMS|sms\.send/i, "Driver pages must not add WhatsApp/SMS integrations.");
  assert.doesNotMatch(source, /\b(?:Notification|PushManager|serviceWorker|showNotification|sendNotification)\b/, "Driver pages must not add notification APIs.");
  assert.doesNotMatch(source, /google\.maps|maps\.google|mapbox|gps api/i, "Driver pages must not add map or GPS APIs.");
  assert.doesNotMatch(source, /customer live location link/i, "Driver pages must not create fake customer live location links.");
  assert.match(
    source,
    /data-driver-job-ots-photo-proof-input="true"/,
    "Driver page must expose the approved OTS photo proof input after OTS.",
  );
  assert.match(
    source,
    /new FormData/,
    "Driver OTS photo proof must post one browser FormData payload through the tokenized route.",
  );
  assert.doesNotMatch(source, /supabase\.storage|storage\.from|\.upload\s*\(/i, "Driver pages must not preview or write storage directly.");
  assert.equal(
    (source.match(/window\.URL\.createObjectURL\(blob\)/g) || []).length,
    1,
    "Driver page may create one object URL only for the acknowledged calendar attachment download.",
  );
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
        window.__driverJobCalendarBlobTexts = [];
        window.__driverJobCalendarBlobTypes = [];
        window.__driverJobCalendarDownloads = [];
        window.__driverJobCalendarRevokedUrls = [];
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
        const originalCreateObjectURL = window.URL.createObjectURL.bind(window.URL);
        const originalRevokeObjectURL = window.URL.revokeObjectURL.bind(window.URL);
        const originalAnchorClick = window.HTMLAnchorElement.prototype.click;

        window.URL.createObjectURL = (blob) => {
          window.__driverJobCalendarBlobTypes.push(blob.type);
          blob.text().then((text) => window.__driverJobCalendarBlobTexts.push(text));
          return originalCreateObjectURL(blob);
        };
        window.URL.revokeObjectURL = (url) => {
          window.__driverJobCalendarRevokedUrls.push(String(url));
          return originalRevokeObjectURL(url);
        };
        window.HTMLAnchorElement.prototype.click = function driverJobCalendarDownloadRecorder() {
          if (this.download) {
            window.__driverJobCalendarDownloads.push({
              download: this.download,
              href: this.href,
            });
          }
          return originalAnchorClick.call(this);
        };
        window.fetch = (...args) => {
          const target = args[0]?.url || args[0];
          const method = args[1]?.method || args[0]?.method || "GET";
          const url = String(target);
          window.__driverJobFetchCalls.push(\`\${method} \${url}\`);

          if (method === "GET" && url.includes("/api/driver-job/") && url.includes("/notifications")) {
            return Promise.resolve(
              new Response(JSON.stringify({
                notifications: [
                  {
                    created_at: "2026-06-08T03:00:00.000Z",
                    id: "driver-app-update-safe-one",
                    notification_status: "queued",
                    priority: "normal",
                    safe_message: "Dispatch has a safe app update for this job.",
                    safe_title: "Dispatch app update",
                    updated_at: "2026-06-08T03:00:00.000Z",
                  },
                ],
                ok: true,
                pagination: {
                  has_next_page: false,
                  has_previous_page: false,
                  page: 1,
                  page_count: 1,
                  page_size: 5,
                  total_notification_count: 1,
                },
                version: "driver-app-update-browser-mock",
              }), {
                status: 200,
                headers: { "content-type": "application/json" },
              }),
            );
          }

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
        calendarDownload: {
          blobTexts: window.__driverJobCalendarBlobTexts || [],
          blobTypes: window.__driverJobCalendarBlobTypes || [],
          downloads: window.__driverJobCalendarDownloads || [],
          feedback: document.querySelector("[data-driver-job-calendar-feedback]")?.textContent.trim() || "",
          revokedUrls: window.__driverJobCalendarRevokedUrls || [],
          visible: Boolean(document.querySelector("[data-driver-job-calendar-action='true']")),
        },
        fileInputs: [...document.querySelectorAll("input[type='file'], input[capture], input[accept*='image'], input[accept*='photo']")]
          .map((input) => input.closest("label")?.innerText.trim() || input.outerHTML),
        resourceCalls: performance.getEntriesByType("resource").map((entry) => entry.name),
        statusText: document.querySelector("[data-driver-job-current-status='true']")?.textContent?.trim() || "",
        confirmDetails: {
          acknowledgedState: document.querySelector("[data-driver-job-acknowledged-state]")?.textContent.trim() || "",
          parseButtonText: document.querySelector("[data-driver-job-parse-details]")?.textContent.trim() || "",
          parseMessage: document.querySelector("[data-driver-job-parse-details-message]")?.textContent.trim() || "",
          saveAcknowledgeText: document.querySelector("[data-driver-job-save-acknowledge]")?.textContent.trim() || "",
          saveAcknowledgeVisible: Boolean(document.querySelector("[data-driver-job-save-acknowledge]")),
          title: document.querySelector("#driver-details-heading")?.textContent.trim() || "",
          rawDetailsVisible: Boolean(document.querySelector("[data-driver-job-details-raw]")),
          visible: Boolean(document.querySelector("[data-driver-primary-step='confirm-details']")),
        },
        driverDetailValues: {
          contact: document.querySelector("[data-driver-job-detail-contact]")?.value || "",
          name: document.querySelector("[data-driver-job-detail-name]")?.value || "",
          plate: document.querySelector("[data-driver-job-detail-plate]")?.value || "",
          vehicleModel: document.querySelector("[data-driver-job-detail-vehicle-model]")?.value || "",
        },
        layoutPositions: {
          liveLocation: Math.round(document.querySelector("[data-driver-primary-step='live-location-consent']")?.getBoundingClientRect().top ?? -1),
          reportIssue: Math.round(document.querySelector("[data-driver-job-report-issue]")?.getBoundingClientRect().top ?? -1),
          saveAcknowledge: Math.round(document.querySelector("[data-driver-job-save-acknowledge]")?.getBoundingClientRect().top ?? -1),
          statusButtons: Math.round(document.querySelector("[data-driver-primary-step='status-buttons']")?.getBoundingClientRect().top ?? -1),
          statusHistory: Math.round(document.querySelector("[data-driver-job-saved-status-history]")?.getBoundingClientRect().top ?? -1),
        },
        statusBoundary: {
          helper: document.querySelector("[data-driver-job-status-boundary-helper]")?.textContent.trim() || "",
          items: [...document.querySelectorAll("[data-driver-job-status-boundary-list] li")].map((item) =>
            item.textContent.trim(),
          ),
          text: document.querySelector("[data-driver-job-status-boundary]")?.innerText || "",
          title: document.querySelector("[data-driver-job-status-boundary-title]")?.textContent.trim() || "",
          visible: Boolean(document.querySelector("[data-driver-job-status-boundary]")),
        },
        statusTiming: {
          boundary: document.querySelector("[data-driver-job-status-timing-boundary]")?.textContent.trim() || "",
          controls: [...document.querySelectorAll("[data-driver-job-status-timing-evidence] input, [data-driver-job-status-timing-evidence] textarea, [data-driver-job-status-timing-evidence] select, [data-driver-job-status-timing-evidence] button")]
            .map((control) => control.textContent.trim() || control.getAttribute("aria-label") || control.tagName),
          rows: [...document.querySelectorAll("[data-driver-job-status-timing-row]")].map((row) => ({
            key: row.getAttribute("data-driver-job-status-timing-row") || "",
            label: row.querySelector("[data-driver-job-status-timing-label]")?.textContent.trim() || "",
            state: row.getAttribute("data-driver-job-status-timing-state") || "",
            time: row.querySelector("[data-driver-job-status-timing-time]")?.textContent.trim() || "",
          })),
          text: document.querySelector("[data-driver-job-status-timing-evidence]")?.innerText || "",
          visible: Boolean(document.querySelector("[data-driver-job-status-timing-evidence]")),
        },
        primaryStepOrder: [...document.querySelectorAll("[data-driver-primary-step]")]
          .map((element) => ({
            key: element.getAttribute("data-driver-primary-step") || "",
            top: Math.round(element.getBoundingClientRect().top),
          }))
          .sort((first, second) => first.top - second.top)
          .map((item) => item.key),
        reportIssue: {
          boundary: document.querySelector("[data-driver-job-report-issue-boundary]")?.textContent.trim() || "",
          choices: [...document.querySelectorAll("[data-driver-job-report-issue-choice]")]
            .map((option) => option.textContent.trim()),
          message: document.querySelector("[data-driver-job-report-issue-message]")?.textContent.trim() || "",
          selectVisible: Boolean(document.querySelector("[data-driver-job-report-issue-select]")),
          submitText: document.querySelector("[data-driver-job-report-issue-submit]")?.textContent.trim() || "",
          text: document.querySelector("[data-driver-job-report-issue]")?.innerText || "",
          visible: Boolean(document.querySelector("[data-driver-job-report-issue]")),
        },
        visibleText: document.body?.innerText || "",
        urgentIssueHandoffVisible: Boolean(document.querySelector("[data-driver-job-urgent-issue-handoff]")),
        visualButtonLabels: [...document.querySelectorAll("button")]
          .map((button) => ({
            left: Math.round(button.getBoundingClientRect().left),
            text: button.textContent.trim(),
            top: Math.round(button.getBoundingClientRect().top),
          }))
          .sort((first, second) => first.top - second.top || first.left - second.left)
          .map((button) => button.text),
        workflowHandoff: {
          boundary: document.querySelector("[data-driver-job-workflow-handoff-boundary]")?.textContent.trim() || "",
          helper: document.querySelector("[data-driver-job-workflow-handoff-helper]")?.textContent.trim() || "",
          items: [...document.querySelectorAll("[data-driver-job-workflow-handoff-list] li")].map((item) =>
            item.textContent.trim(),
          ),
          summary: document.querySelector("[data-driver-job-workflow-handoff-summary]")?.textContent.trim() || "",
          text: document.querySelector("[data-driver-job-workflow-handoff]")?.innerText || "",
          visible: Boolean(document.querySelector("[data-driver-job-workflow-handoff]")),
        },
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
        appUpdates: {
          feedback: document.querySelector("[data-driver-job-app-updates-feedback]")?.textContent.trim() || "",
          rows: [...document.querySelectorAll("[data-driver-job-app-update-row]")].map((row) => ({
            message: row.querySelector("[data-driver-job-app-update-message]")?.textContent.trim() || "",
            priority: row.querySelector("[data-driver-job-app-update-priority]")?.textContent.trim() || "",
            status: row.querySelector("[data-driver-job-app-update-status]")?.textContent.trim() || "",
            time: row.querySelector("[data-driver-job-app-update-time]")?.textContent.trim() || "",
            title: row.querySelector("[data-driver-job-app-update-title]")?.textContent.trim() || "",
          })),
          state: document.querySelector("[data-driver-job-app-updates-feedback]")?.getAttribute("data-driver-job-app-updates-state") || "",
          text: document.querySelector("[data-driver-job-app-updates]")?.innerText || "",
          visible: Boolean(document.querySelector("[data-driver-job-app-updates]")),
        },
        workflowSummaryRows: Object.fromEntries(
          [...document.querySelectorAll("[data-driver-job-workflow-summary-row]")].map((row) => [
            row.getAttribute("data-driver-job-workflow-summary-row"),
            row.querySelector("[data-driver-job-workflow-summary-value]")?.textContent.trim() || "",
          ]),
        ),
      }))()`);

    const navigateToDriverJob = async (token, expectedText) => {
      await navigateAndWaitForBodyText(
        client,
        evaluate,
        driverJobUrl(token),
        expectedText,
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

    const clickReportIssue = async () => {
      const beforeState = await pageState();
      const selected = await evaluate(`(() => {
        const select = document.querySelector("[data-driver-job-report-issue-select]");
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;

        if (!select) {
          return false;
        }

        setter?.call(select, "vehicle_issue");
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);
      assert.equal(selected, true, "Expected driver issue dropdown to be selectable.");

      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-report-issue-submit]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, "Expected Alert Admin button to be clickable.");

      const issueState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-report-issue-submit]");
            const message = document.querySelector("[data-driver-job-report-issue-message]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Admin alerted in-app: Vehicle issue. No external message was sent." &&
              document.querySelector("[data-driver-job-activity-log]") === null
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                }
              : false;
          })()`),
        30000,
        "driver issue alert feedback",
      );

      assert.equal(issueState.distance <= 16, true, "Expected issue alert feedback near Alert Admin button.");
      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.some((call) =>
          call === `POST /api/driver-job/${mockDriverJobTokens.workflowOrder}/issue-alert`,
        ),
        true,
        "Expected driver issue alert to use the tokenized internal issue-alert route.",
      );
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length + 1,
        "Driver issue alert should make one internal app POST only.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const saveAndAcknowledgeJob = async () => {
      const beforeSaveState = await pageState();
      const expectedDriverJobPatchPath = await evaluate(`(() => {
        const token = location.pathname.split("/").filter(Boolean).at(-1) || "";

        return \`/api/driver-job/\${token}\`;
      })()`);
      const parsed = await evaluate(`(() => {
        const textarea = document.querySelector("[data-driver-job-details-raw]");
        const parseButton = document.querySelector("[data-driver-job-parse-details]");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

        if (!textarea || !parseButton) {
          return false;
        }

        setter?.call(
          textarea,
          [
            "Driver name: Mock Local Driver A",
            "Mobile: +65 9123 4567",
            "Car plate: SLM1234A",
            "Vehicle model: Toyota Alphard",
            "PayNow: 81234567",
            "Optional remarks: internal finance note should not appear",
          ].join("\\n"),
        );
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        parseButton.click();

        return true;
      })()`);
      assert.equal(parsed, true, "Expected public driver details paste parser controls.");

      const parsedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const message = document.querySelector("[data-driver-job-parse-details-message]");

            return message?.textContent.trim() === "Driver details parsed. Review and save to acknowledge." &&
              document.querySelector("[data-driver-job-detail-name]")?.value === "Mock Local Driver A" &&
              document.querySelector("[data-driver-job-detail-contact]")?.value === "+65 9123 4567" &&
              document.querySelector("[data-driver-job-detail-plate]")?.value === "SLM1234A" &&
              document.querySelector("[data-driver-job-detail-vehicle-model]")?.value === "Toyota Alphard"
              ? {
                  messageText: message.textContent.trim(),
                  visibleText: document.body?.innerText || "",
                }
              : false;
          })()`),
        10000,
        "public driver details parse",
      );
      assert.equal(
        /paynow|optional remarks|internal finance note/i.test(parsedState.visibleText),
        false,
        "Public driver details parser must not expose pasted payment or internal remark text.",
      );

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
        const button = document.querySelector("[data-driver-job-save-acknowledge]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, "Expected public driver Save & Acknowledge Job button to be clickable.");

      const savedState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector("[data-driver-job-save-acknowledge]");
            const message = document.querySelector("[data-driver-job-details-message]");
            const savedDetails = document.querySelector("[data-driver-job-saved-details]");
            const acknowledgedState = document.querySelector("[data-driver-job-acknowledged-state]");
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === "Driver details saved and job acknowledged." &&
              acknowledgedState?.textContent.trim() === "Acknowledged" &&
              savedDetails?.innerText.includes("Mock Local Driver A") &&
              savedDetails?.innerText.includes("+65 9123 4567") &&
              savedDetails?.innerText.includes("SLM1234A") &&
              savedDetails?.innerText.includes("Toyota Alphard") &&
              !savedDetails?.innerText.toLowerCase().includes("paynow")
              ? {
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  messageText: message.textContent.trim(),
                  savedText: savedDetails.innerText,
                }
              : false;
          })()`),
        10000,
        "public driver details save and acknowledgement",
      );

      const afterSaveState = await pageState();
      assert.equal(savedState.distance <= 16, true, "Expected driver details feedback near Save & Acknowledge button.");
      assert.equal(
        afterSaveState.fetchCalls.length,
        beforeSaveState.fetchCalls.length + 1,
        "Public driver details Save & Acknowledge should make one tokenized safe driver-job PATCH.",
      );
      assert.equal(
        afterSaveState.fetchCalls.at(-1),
        `PATCH ${expectedDriverJobPatchPath}`,
        "Expected public driver details Save & Acknowledge to persist through the tokenized driver job route.",
      );
      assert.deepEqual(
        afterSaveState.activityLogLabels,
        [],
        "Expected Save & Acknowledge to keep driver activity log hidden.",
      );
      assertNoSensitiveText(afterSaveState);
      return afterSaveState;
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

    const downloadDriverJobCalendar = async () => {
      const beforeState = await pageState();
      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-calendar-action='true']");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, "Expected acknowledged Driver Job calendar action to be clickable.");

      const downloadState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const downloads = window.__driverJobCalendarDownloads || [];
            const blobTexts = window.__driverJobCalendarBlobTexts || [];
            const blobTypes = window.__driverJobCalendarBlobTypes || [];
            const revokedUrls = window.__driverJobCalendarRevokedUrls || [];
            const feedback = document.querySelector("[data-driver-job-calendar-feedback]")?.textContent.trim() || "";

            return downloads.length === 1 &&
              blobTexts.length === 1 &&
              blobTypes.length === 1 &&
              revokedUrls.length === 1 &&
              feedback === "Calendar file downloaded with a private Open Driver Job shortcut. Do not share the calendar event."
              ? { blobText: blobTexts[0], blobType: blobTypes[0], download: downloads[0], feedback, revokedUrls }
              : false;
          })()`),
        10000,
        "acknowledged Driver Job calendar attachment download",
      );
      const afterState = await pageState();
      const expectedCalendarPath = `/api/driver-job/${mockDriverJobTokens.workflowOrder}/calendar`;

      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length + 1,
        "Driver calendar action should make one token-scoped calendar GET only.",
      );
      assert.equal(afterState.fetchCalls.at(-1), `GET ${expectedCalendarPath}`);
      assert.equal(downloadState.blobType, "text/calendar");
      assert.equal(downloadState.download.download, "prestige-driver-job-mock-driver-job-workflow.ics");
      assert.match(downloadState.download.href, /^blob:http:\/\/localhost:3000\//);
      assert.deepEqual(downloadState.revokedUrls, [downloadState.download.href]);
      assert.match(downloadState.blobText, /UID:driver-job-MOCK-DRIVER-JOB-WORKFLOW@prestige-limo-ops/);
      assert.match(downloadState.blobText, /DTSTART;TZID=Asia\/Singapore:20260529T164500/);
      assert.match(downloadState.blobText, /DTEND;TZID=Asia\/Singapore:20260529T181500/);
      assert.match(downloadState.blobText, /BEGIN:VALARM[\s\S]*TRIGGER:-PT1H[\s\S]*END:VALARM/);
      const unfoldedCalendar = downloadState.blobText.replace(/\r\n /g, "");
      const expectedDriverJobUrl = `${appUrl}/driver-job/${mockDriverJobTokens.workflowOrder}`;
      assert.equal(unfoldedCalendar.includes(`URL:${expectedDriverJobUrl}`), true);
      assert.equal(unfoldedCalendar.includes(`Open Driver Job: ${expectedDriverJobUrl}`), true);
      assert.match(unfoldedCalendar, /Private driver link - do not share this calendar event\./);
      assertNoSensitiveText({
        fetchCalls: afterState.fetchCalls,
        resourceCalls: [],
        visibleText: downloadState.blobText,
      });
      assertNoSensitiveText(afterState);
      return afterState;
    };

    const uploadOtsPhotoProof = async () => {
      const beforeState = await pageState();
      const selected = await evaluate(`(() => {
        const input = document.querySelector("[data-driver-job-ots-photo-proof-input]");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;

        if (!input || !setter) {
          return false;
        }

        const transfer = new DataTransfer();
        transfer.items.add(new File(["mock-ots-photo"], "ots-photo.jpg", { type: "image/jpeg" }));
        setter.call(input, transfer.files);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);

      assert.equal(selected, true, "Expected OTS photo proof input to accept a mock image file.");

      const clicked = await evaluate(`(() => {
        const button = document.querySelector("[data-driver-job-ots-photo-proof-upload]");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);

      assert.equal(clicked, true, "Expected OTS photo proof upload button to be clickable.");

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const message = document.querySelector("[data-driver-job-ots-photo-proof-message]");
            const state = document.querySelector("[data-driver-job-ots-photo-proof-state]");

            return message?.textContent.trim() === "OTS photo sent to admin." &&
              state?.textContent.trim() === "Sent";
          })()`),
        10000,
        "OTS photo proof upload",
      );

      const afterState = await pageState();
      assert.equal(
        afterState.fetchCalls.some((call) =>
          call === `POST /api/driver-job/${mockDriverJobTokens.workflowOrder}/ots-photo`,
        ),
        true,
        "Expected OTS photo proof to use the tokenized driver OTS photo route.",
      );
      assert.equal(
        afterState.fetchCalls.length,
        beforeState.fetchCalls.length + 1,
        "OTS photo proof should make one internal app POST only.",
      );
      assertNoSensitiveText(afterState);
      return afterState;
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
    assert.ok(
      validState.visibleText.includes("MOCK-DRIVER-JOB-WORKFLOW"),
      "Expected the established Driver Job card to show its safe public booking reference.",
    );
    assert.deepEqual(
      validState.driverDetailValues,
      {
        contact: "+65 8777 0000",
        name: "Mock Workflow Driver",
        plate: "SWA889X",
        vehicleModel: "Toyota Alphard",
      },
      "Expected assigned driver details to load into the confirm driver and vehicle fields.",
    );
    assert.ok(
      validState.visibleText.includes(
        "Mobile web driver card. Keep this link private and use it only for this assigned job.",
      ),
    );
    assert.equal(validState.workflowHandoff.visible, true, "Expected public driver job workflow handoff guidance.");
    assert.equal(
      validState.workflowHandoff.summary,
      "How this page works",
      "Expected driver handoff to be compact/collapsible.",
    );
    assert.equal(
      validState.workflowHandoff.helper,
      "This is the driver page for this assigned job.",
      "Expected driver handoff to identify this assigned job page.",
    );
    assert.deepEqual(
      validState.workflowHandoff.items,
      [
        "Review pickup time, pickup place, drop-off, route, and job notes before starting.",
        "Confirm driver and vehicle details once, then use the status buttons only when ready.",
        "Use Report Issue when admin needs an in-app alert.",
      ],
      "Expected compact driver workflow handoff guidance.",
    );
    assert.equal(
      validState.workflowHandoff.boundary,
      "Private account and internal compensation details are not shown here.",
      "Expected driver handoff to avoid private/internal account detail exposure.",
    );
    assert.equal(validState.urgentIssueHandoffVisible, false, "Expected old bulky urgent issue handoff to be replaced.");
    assert.equal(validState.reportIssue.visible, true, "Expected compact driver Report Issue alert control.");
    assert.equal(validState.reportIssue.selectVisible, true, "Expected driver issue dropdown.");
    assert.equal(validState.reportIssue.submitText, "Alert Admin", "Expected compact Alert Admin action.");
    assert.deepEqual(
      validState.reportIssue.choices,
      [
        "Cannot find passenger",
        "Passenger no-show",
        "Passenger late",
        "Flight or pickup timing changed",
        "Route or itinerary changed",
        "Vehicle issue",
        "Traffic delay",
        "Accident / safety concern",
        "Other issue",
      ],
      "Expected safe driver issue dropdown choices.",
    );
    assert.equal(
      validState.reportIssue.boundary,
      "Internal app alert only. No external messages, live location, or photo upload.",
      "Expected report issue boundary to block external sending and future-only features.",
    );
    assert.deepEqual(
      validState.primaryStepOrder.slice(0, 7),
      [
        "job-summary",
        "confirm-details",
        "save-acknowledge",
        "status-workflow",
        "status-buttons",
        "live-location-consent",
        "report-issue",
      ],
      "Expected job card, confirm-details, save acknowledgement, status controls, live location, and issue controls in order.",
    );
    assert.equal(validState.confirmDetails.visible, true, "Expected confirm driver and vehicle details card.");
    assert.equal(validState.confirmDetails.title, "Driver Details");
    assert.equal(validState.confirmDetails.rawDetailsVisible, true, "Expected compact paste driver details box.");
    assert.equal(validState.confirmDetails.parseButtonText, "Parse Driver Details");
    assert.equal(validState.confirmDetails.saveAcknowledgeText, "Save & Acknowledge Job");
    assert.equal(
      validState.confirmDetails.acknowledgedState,
      "Paste or confirm driver details once before starting the job.",
      "Expected combined details card to own acknowledgement state.",
    );
    assert.equal(
      validState.primaryStepOrder.indexOf("report-issue") > validState.primaryStepOrder.indexOf("status-buttons"),
      true,
      "Expected Report Issue after the status buttons.",
    );
    assert.equal(
      validState.layoutPositions.statusButtons > validState.layoutPositions.saveAcknowledge,
      true,
      "Expected frequent status buttons after Save & Acknowledge Job.",
    );
    assert.equal(
      validState.layoutPositions.reportIssue > validState.layoutPositions.statusButtons,
      true,
      "Expected Report Issue below the frequent status buttons.",
    );
    assert.equal(
      validState.layoutPositions.statusHistory,
      -1,
      "Expected saved status history panel to stay hidden from the driver page.",
    );
    assert.equal(validState.appUpdates.visible, true, "Expected driver app updates feed on tokenized driver page.");
    assert.equal(validState.appUpdates.state, "loaded", "Expected driver app updates to load through the token route.");
    assert.equal(
      validState.appUpdates.feedback,
      "Loaded 1 saved app update.",
      "Expected driver app updates read feedback.",
    );
    assert.deepEqual(
      validState.appUpdates.rows.map((row) => ({
        message: row.message,
        priority: row.priority,
        status: row.status,
        title: row.title,
      })),
      [
        {
          message: "Dispatch has a safe app update for this job.",
          priority: "Priority: Normal",
          status: "Queued",
          title: "Dispatch app update",
        },
      ],
      "Expected driver app updates to show only safe title/message/status fields.",
    );
    assert.equal(
      /driver_job_link_id|event_key|source_surface|actor_label|token|customer price|billing|invoice|payment|payout|paynow|telegram|whatsapp|sms|email/i.test(
        validState.appUpdates.text,
      ),
      false,
      "Driver app updates feed must not expose token internals, finance, or external channel data.",
    );
    assert.equal(
      validState.fetchCalls.some((call) =>
        call === `GET /api/driver-job/${mockDriverJobTokens.workflowOrder}/notifications?limit=5&page=1`,
      ),
      true,
      "Expected driver page to GET saved app updates through the tokenized notifications route.",
    );
    assert.deepEqual(
      validState.fetchCalls.filter((call) => /^PATCH .*\/notifications/.test(call)),
      [],
      "Driver app updates feed should stay read-only in this stage.",
    );
    assert.equal(validState.statusBoundary.visible, false, "Expected bulky driver status boundary help to be removed.");
    assert.equal(validState.visibleText.includes("Status Boundary"), false);
    assert.equal(validState.visibleText.includes("Current flow: OTW, OTS, POB, then Job Completed."), false);
    assert.equal(validState.visibleText.includes("Feedback appears under the status button you tap."), false);
    assert.equal(validState.statusTiming.visible, true, "Expected compact read-only driver status timing evidence.");
    assert.deepEqual(validState.statusTiming.controls, [], "Status timing evidence must not expose edit controls.");
    assert.equal(
      validState.statusTiming.boundary,
      "Times are recorded automatically after accepted status updates.",
      "Expected timing evidence to explain automatic accepted-status recording.",
    );
    assert.deepEqual(
      validState.statusTiming.rows,
      [
        { key: "otw", label: "I'm on the way", state: "pending", time: "Not recorded" },
        { key: "ots", label: "I've arrived", state: "pending", time: "Not recorded" },
        { key: "pob", label: "Passenger on board", state: "pending", time: "Not recorded" },
        { key: "jc", label: "Completed", state: "pending", time: "Not recorded" },
      ],
      "Expected timing evidence to start empty until statuses are accepted.",
    );
    assert.equal(
      validState.visibleText.includes("customer price"),
      false,
      "Driver status boundary must not expose customer price wording.",
    );
    assert.equal(
      validState.visibleText.includes("driver payout"),
      false,
      "Driver status boundary must not expose driver payout wording.",
    );
    assert.equal(
      validState.visibleText.includes("invoice"),
      false,
      "Driver status boundary must avoid invoice wording on the public driver page.",
    );
    const startingStatusText = validState.statusText || "Assigned";
    assert.ok(validState.visibleText.includes("Driver Job Card"));
    assert.ok(validState.visibleText.includes("Driver Details"));
    assert.ok(validState.visibleText.includes("Paste Driver Details"));
    assert.ok(validState.visibleText.includes("Parse Driver Details"));
    assert.ok(validState.visibleText.includes("Save & Acknowledge Job"));
    assert.equal(validState.visibleText.includes("Job Acknowledgement"), false);
    assert.equal(validState.buttonLabels.includes("Acknowledge Job"), false);
    assert.equal(validState.buttonLabels.includes("Save"), false);
    assert.equal(validState.visibleText.includes("Mock Live Location"), false);
    assert.equal(validState.visibleText.includes("Activate Mock Live Location"), false);
    assert.equal(validState.visibleText.includes("Mock Driver Reminder"), false);
    assert.equal(validState.visibleText.includes("Trigger Mock 1-Hour Reminder"), false);
    assert.equal(validState.visibleText.includes("Mock Dispatcher Driver Workflow Summary"), false);
    assert.equal(validState.visibleText.includes("Mock Latest Flight ETA"), false);
    assert.equal(validState.visibleText.includes("Acknowledge Latest ETA"), false);
    assert.equal(validState.visibleText.includes("Mock OTS Photo Proof"), false);
    assert.equal(validState.visibleText.includes("Add Mock OTS Photo Proof"), false);
    assert.deepEqual(validState.fileInputs, [], "Public driver job page must not expose real file/photo inputs.");
    assert.deepEqual(
      validState.dispatcherExceptionText,
      [],
      "Public driver job page must keep dispatcher cancel/replacement workflow absent and future/staff-controlled.",
    );
    assert.equal(validState.visibleText.includes("Driver Activity Log"), false);
    assert.equal(validState.visibleText.includes("No driver activity recorded yet."), false);
    assert.ok(validState.visibleText.includes("Driver name"));
    assert.ok(validState.visibleText.includes("Contact / Mobile number"));
    assert.ok(validState.visibleText.includes("Car plate"));
    assert.ok(validState.visibleText.includes("Vehicle model"));
    assert.equal(validState.visibleText.includes("PayNow number"), false);
    assert.equal(validState.visibleText.includes("Optional remarks"), false);
    assert.equal(validState.visibleText.includes("Completion / Exception Notes"), false);
    assert.equal(validState.visibleText.includes("Completion note"), false);
    assert.equal(validState.visibleText.includes("Exception reason"), false);
    assert.equal(validState.visibleText.includes("Status History"), false);
    assert.equal(validState.layoutPositions.statusHistory, -1);
    assert.ok(
      validState.layoutPositions.reportIssue > validState.layoutPositions.liveLocation,
      "Expected Report Issue to sit below the Live Location section near the bottom of the driver page.",
    );
    assert.deepEqual(
      validState.visualButtonLabels.filter((buttonLabel) =>
        ["Save & Acknowledge Job", "OTW", "OTS", "POB", "Job Completed", "Alert Admin"].includes(buttonLabel),
      ),
      ["Save & Acknowledge Job", "OTW", "OTS", "POB", "Job Completed", "Alert Admin"],
      "Expected public driver job page to show one save/acknowledge action, status, and issue controls in order.",
    );
    assert.deepEqual(
      validState.visualButtonLabels.filter((buttonLabel) =>
        [
          "Save & Acknowledge Job",
          "OTW",
          "OTS",
          "POB",
          "Job Completed",
          "Alert Admin",
        ].includes(
          buttonLabel,
        ),
      ),
      [
        "Save & Acknowledge Job",
        "OTW",
        "OTS",
        "POB",
        "Job Completed",
        "Alert Admin",
      ],
      "Expected public driver job page to show the human primary workflow order.",
    );
    assertNoSensitiveText(validState);

    await clickBlockedStatus("OTW", "Save & Acknowledge Job before updating status.", startingStatusText);
    await saveAndAcknowledgeJob();
    await downloadDriverJobCalendar();
    await clickBlockedStatus("OTS", "Update OTW before OTS.", startingStatusText);
    await clickBlockedStatus("POB", "Update OTW before POB.", startingStatusText);
    await clickBlockedStatus("Job Completed", "Update OTW before Job Completed.", startingStatusText);
    await clickStatus("OTW", "I'm on the way", "Status updated to I'm on the way.");
    await clickBlockedStatus("POB", "Update OTS before POB.", "I'm on the way");
    await clickStatus("OTS", "I've arrived", "Status updated to I've arrived.");
    await clickBlockedStatus("OTW", "OTW is already recorded. Continue with POB.", "I've arrived");
    const depOtsState = await pageState();
    assert.equal(
      depOtsState.visibleText.includes("Add Mock OTS Photo Proof"),
      false,
      "DEP public mock job should not require OTS photo proof after OTS.",
    );
    assert.equal(
      depOtsState.visibleText.includes("OTS Photo to Admin"),
      true,
      "Expected approved OTS photo proof control after OTS.",
    );
    assert.equal(depOtsState.fileInputs.length, 1, "Expected one approved OTS image input after OTS.");
    await uploadOtsPhotoProof();
    assert.equal(
      depOtsState.visibleText.includes("Acknowledge Latest ETA"),
      false,
      "DEP public mock job should not require latest ETA acknowledgement after OTS.",
    );
    await clickBlockedStatus("Job Completed", "Update POB before Job Completed.", "I've arrived");
    await clickStatus("POB", "Passenger on board", "Status updated to Passenger on board.");
    await clickStatus("Job Completed", "Completed", "Status updated to Completed.");
    await clickReportIssue();
    const completedState = await pageState();
    assert.deepEqual(
      completedState.statusTiming.rows.map((row) => ({
        key: row.key,
        label: row.label,
        state: row.state,
      })),
      [
        { key: "otw", label: "I'm on the way", state: "recorded" },
        { key: "ots", label: "I've arrived", state: "recorded" },
        { key: "pob", label: "Passenger on board", state: "recorded" },
        { key: "jc", label: "Completed", state: "recorded" },
      ],
      "Expected each accepted driver status to record timing evidence.",
    );
    assert.equal(
      completedState.statusTiming.rows.every((row) => row.time && row.time !== "Not recorded"),
      true,
      "Expected recorded status timing evidence to show OTW, OTS, POB, and JC times.",
    );
    assert.deepEqual(completedState.statusTiming.controls, [], "Recorded timing evidence must remain read-only.");
    assert.deepEqual(completedState.activityLogLabels, [], "Expected public driver activity log to stay hidden.");
    await resetMockDriverJobData();

    const arrivalState = await navigateToDriverJob(mockDriverJobTokens.arrivalWorkflow, "Mock Arrival Pickup");
    assert.ok(arrivalState.visibleText.includes("Mock Arrival Dropoff"));
    assert.ok(arrivalState.visibleText.includes("Mock Arrival Pickup > Mock Arrival Waypoint > Mock Arrival Dropoff"));
    assert.ok(arrivalState.visibleText.includes("SQ777"));
    assert.ok(arrivalState.visibleText.includes("Mock Arrival Passenger"));
    assert.deepEqual(
      arrivalState.driverDetailValues,
      {
        contact: "+65 8666 0000",
        name: "Mock Arrival Driver",
        plate: "SMA777X",
        vehicleModel: "Toyota Alphard",
      },
      "Expected arrival assigned driver details to load into the confirm driver and vehicle fields.",
    );
    assert.ok(
      arrivalState.visibleText.includes(
        "Mobile web driver card. Keep this link private and use it only for this assigned job.",
      ),
    );
    assert.equal(arrivalState.workflowHandoff.visible, true, "Expected Arrival job to show workflow handoff guidance.");
    assert.equal(arrivalState.statusBoundary.visible, false, "Expected Arrival job to keep status boundary guidance removed.");
    assert.equal(arrivalState.urgentIssueHandoffVisible, false, "Expected Arrival old urgent handoff to stay replaced.");
    assert.equal(arrivalState.reportIssue.visible, true, "Expected Arrival job to show Report Issue alert control.");
    assert.equal(
      arrivalState.reportIssue.choices.includes("Cannot find passenger"),
      true,
      "Expected Arrival Report Issue to cover passenger lookup issues.",
    );
    assert.equal(
      arrivalState.workflowHandoff.items.includes("Use Report Issue when admin needs an in-app alert."),
      true,
      "Expected Arrival driver handoff to point to the internal report issue action.",
    );
    assert.equal(arrivalState.visibleText.includes("Mock Driver Reminder"), false);
    assert.equal(arrivalState.visibleText.includes("Mock Dispatcher Driver Workflow Summary"), false);
    assert.equal(arrivalState.visibleText.includes("Mock Latest Flight ETA"), false);
    assert.equal(arrivalState.visibleText.includes("Acknowledge Latest ETA"), false);
    assert.equal(arrivalState.visibleText.includes("Add Mock OTS Photo Proof"), false);
    assert.equal(arrivalState.confirmDetails.title, "Driver Details");
    assert.equal(arrivalState.confirmDetails.rawDetailsVisible, true);
    assert.equal(arrivalState.confirmDetails.parseButtonText, "Parse Driver Details");
    assert.equal(arrivalState.confirmDetails.saveAcknowledgeText, "Save & Acknowledge Job");
    assertNoSensitiveText(arrivalState);

    await saveAndAcknowledgeJob();
    await clickStatus("OTW", "I'm on the way", "Status updated to I'm on the way.");
    await clickStatus("OTS", "I've arrived", "Status updated to I've arrived.");
    const arrivalOtsState = await pageState();
    assert.equal(arrivalOtsState.visibleText.includes("Mock OTS Photo Proof"), false);
    assert.equal(arrivalOtsState.visibleText.includes("Add Mock OTS Photo Proof"), false);
    assert.equal(arrivalOtsState.fileInputs.length, 1, "Approved OTS proof must expose one OTS image input after OTS.");
    assert.deepEqual(
      arrivalOtsState.dispatcherExceptionText,
      [],
      "Arrival public driver page must keep dispatcher exception workflow absent and future/staff-controlled.",
    );
    assertNoSensitiveText(arrivalOtsState);
    await clickStatus("POB", "Passenger on board", "Status updated to Passenger on board.");
    await clickStatus("Job Completed", "Completed", "Status updated to Completed.");
    const arrivalCompletedState = await pageState();
    assert.deepEqual(arrivalCompletedState.activityLogLabels, [], "Expected Arrival public driver activity log to stay hidden.");
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
            "Save & Acknowledge Job",
            "OTW",
            "OTS",
            "POB",
            "Job Completed",
            "Alert Admin",
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
      assert.equal(
        blockedState.statusBoundary.visible,
        false,
        `${label} token should not show driver status boundary guidance.`,
      );
      assert.equal(
        blockedState.reportIssue.visible,
        false,
        `${label} token should not show driver report issue controls.`,
      );
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
