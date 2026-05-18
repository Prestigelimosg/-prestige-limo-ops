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
const incompleteNeedsReviewSample = `Arrival for NEEDS REVIEW TEST TRAVELER
Pickup: Changi Airport Terminal 3
Pax 1`;
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
const multiBookingPreviewSample = `Hi William.

Tomorrow:
1) Mr Deep arriving SQ318 ETA 0610hrs. Send to Fullerton Hotel.
2) Mr Stanley departure 9pm from Ritz Carlton to T3 taking SQ221.
3) Need standby AVF for Ms Chloe 1pm-5pm MBS meetings then send back to Capella.

Richard handle Deep.
Ah Seng handle Stanley.

Booked by Nicole from BNY.
Thanks.`;
const exactPastedWaypointAirportArrivalSample = `Transfer type	One Way
Pickup date and time	17-05-2026 7:05
Order total amount	S$130.00
Taxes	S$0.00 (0%)
Distance	46.4 km
Duration	52 minutes
Comment	1st Drop off: Ms. Kwok (28 Alexandra View), 2nd Drop off: Ms. Chan (26 Newton Road) Trip Organizer: Mr. Kim, Hyun Soo (Tel. No.: +65 98156017)
ROUTE
Route name	Airport arrival
ROUTE LOCATIONS
28 Alexandra View, 싱가포르 28 Alexandra View, Singapore 158744
DROP OFF LOCATION
26 Newton Rd, 싱가포르 307957
VEHICLE
Vehicle name	Toyota Alphard 2.5
Bag count	3
Passengers count	4
EXTRA
1 x Waypoint 1 - S$25.00
CLIENT DETAILS
First name	Pui Yu
Last name	Chan
E-mail address	hyunsoostar@hotmail.com
Phone number	+6596389322
Passangers	2
Flight No.	SQ883`;
const exactPastedWaypointAirportDepartureSample = `Pickup date and time	06-05-2026 8:00
Order total amount	S$110.00
Taxes	S$0.00 (0%)
Distance	15.1 km
Duration	25 minutes
Comment	For Driver's Info – Pax Name and Number: Edien Joy, +65 83894342 For any updates, please contact me. Thank you.
ROUTE
Route name	Airport Departure
ROUTE LOCATIONS
351C Canberra Road, Singapore 351C Canberra Rd, Singapore 753351
PICK UP LOCATION
756 Woodlands Ave 4, Singapore
VEHICLE
Vehicle name	Mercedes Benz E-class
Bag count	2
Passengers count	3
EXTRA
1 x Waypoint 1 - S$25.00
CLIENT DETAILS
First name	Luther
Last name	Graham
E-mail address	luthergrahambk@gmail.com
Phone number	+6580912613
Passangers	2
Flight No.	TR 288`;
const routeNameAirportDropoffOnlySample = `Status	Completed (finished)
Service type	Airport transfer
Transfer type	One Way
Pickup date and time	30-04-2026 15:30
Order total amount	S$95.00
Taxes	S$0.00 (0%)
Distance	46.8 km
Duration	53 minutes
ROUTE
Route name	Airport 
ROUTE LOCATIONS
DROP OFF LOCATION
333 Orchard Rd, Singapore 238867
VEHICLE
Vehicle name	Mercedes Benz E-class
Bag count	2
Passengers count	3
CLIENT DETAILS
First name	Peter
Last name	Dynan
E-mail address	pj@baonline.com.au
Phone number	+61419501117
Passangers	1
Flight No.	SQ238`;
const routeNameAirportPickupOnlyDepartureWaypointSample = `Transfer type	One Way
Pickup date and time	30-04-2026 4:20
Order total amount	S$160.00
Taxes	S$0.00 (0%)
Distance	13.4 km
Duration	23 minutes
ROUTE
Route name	Airport 
ROUTE LOCATIONS
405 Sin Ming Avenue, Singapore 405 Sin Ming Ave, Singapore 570405
Bedok South Avenue 2, Block 10B HDB Bedok South, Singapore 10B Bedok S Ave 2, Block 10B, Singapore 461010
PICK UP LOCATION
160 Watten Estate Rd, Singapore 287610
VEHICLE
Vehicle name	Toyota Alphard 2.5
Bag count	3
Passengers count	4
EXTRA
1 x Waypoint 2 - S$50.00
1 x Midnight surcharges - S$15.00
CLIENT DETAILS
First name	Luther
Last name	Graham
E-mail address	luthergrahambk@gmail.com
Phone number	+6580912613
Passangers	3
Flight No.	SQ265`;
const freeformTransferMultiLocationSample =
  "organise viano tomorrow 11am pickup andrew shenton way send him to MAS building pickup john follow by Asia sq then to capital tower";
const dspItinerarySample = `Hi William, we need a car for Drew tomorrow, please refer to the below schedule:
From Grand Hyatt to Ritz-Carlton Singapore (by 10am); 12pm BDC office; 1:30pm Temasek Office, 60B Orchard Road, Tower 2, The Atrium@Orchard, Singapore; 3:30pm 8 Marina View, Asia Square Tower 1, #37-01, Singapore 018960; 6pm Ritz-Carlton`;
const numberedEventDspItinerarySample = `@Fikeri A40 7941

Mr. Wong is the events organiser, pls follow his instructions attentively 

1130hrs, pickup Mr. Wong from Carlton City then proceed following locations below:  


[Dresscode] - Businees w. Jacket no tie
[Driver] - Black Alphard - Plate: TBC
1. [SSW Driver]Depart capella residence suite A@11:30AM //Arrive Cherry Garden@11:50AM
2. [12-12:30PM]王炎平 Catch up 
3. [SSW Driver]Depart Cherry Garden@1:30PM//Arrive Suntec Expo@1:45PM
4. [1:45-2PM]MPA Interview Meeting - Prompt question & answer to be shared. 
5. [2:15-3PM]MPA Panelist - Speaker
6. [SSW Driver]Depart Suntec Expo@3PM//Arrive UIC Building@3:15PM
7. [3:30-4:30PM]MOL Bulk Meeting`;
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
  assert.doesNotMatch(state.jobCardPreview, /Guest details hidden for privacy/);
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

    const focusedNeedsReviewTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedNeedsReviewTextarea,
      true,
      "Expected booking message textarea to be focused for Needs Review sample",
    );

    await client.send("Input.insertText", { text: incompleteNeedsReviewSample });

    const filledNeedsReviewTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(incompleteNeedsReviewSample)}`,
    );
    assert.equal(
      filledNeedsReviewTextarea,
      true,
      "Expected Needs Review booking message textarea to be filled",
    );

    const clickedNeedsReviewParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Parse Booking",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedNeedsReviewParse, true, "Expected Parse Booking button to parse Needs Review sample");

    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("Needs review before saving") &&
            bodyText.includes("Missing pickup date") &&
            bodyText.includes("Missing pickup time") &&
            bodyText.includes("Missing drop-off") &&
            bodyText.includes("Missing flight for arrival");
        })()`),
      10000,
      "Needs Review warning",
    );

    const savedCountBeforeBlockedSave = await evaluate(
      `document.body.innerText.match(/Saved\\s+(\\d+)/)?.[1] || ""`,
    );
    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        const target = args[0]?.url || args[0];
        window.__prestigeFetchCalls.push(String(target));
        return originalFetch(...args);
      };
    })()`);

    const clickedBlockedSave = await evaluate(`(() => {
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Booking + CRM",
      );

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedBlockedSave, true, "Expected Save Booking + CRM button to be clickable");

    const blockedSaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;

          return {
            bodyText,
            fetchCalls: window.__prestigeFetchCalls || [],
            savedCount: bodyText.match(/Saved\\s+(\\d+)/)?.[1] || "",
          };
        })()`);

        return candidateState?.bodyText?.includes("Please review warnings before saving.")
          ? candidateState
          : false;
      },
      10000,
      "blocked Needs Review save message",
    );

    assert.deepEqual(
      blockedSaveState.fetchCalls,
      [],
      `Expected blocked Needs Review save to make no network calls, got ${blockedSaveState.fetchCalls.join(", ")}`,
    );
    assert.equal(
      blockedSaveState.savedCount,
      savedCountBeforeBlockedSave,
      "Expected blocked Needs Review save not to change recent booking count",
    );
    assert.doesNotMatch(blockedSaveState.bodyText, /Booking saved successfully/);

    const clickedClearAfterNeedsReview = await evaluate(`(() => {
      const clearButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Clear",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(clickedClearAfterNeedsReview, true, "Expected Clear button after Needs Review test");

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
        vehicle: fieldValue("Vehicle"),
        pickupDate: fieldValue("Pickup date"),
        pickupTime: fieldValue("Pickup time"),
        flight: fieldValue("Flight number"),
        pickup: fieldValue("Pickup"),
        extraStopLocation: fieldValue("Extra stop location"),
        extraStopCount: fieldValue("Extra Stops"),
        dropoff: fieldValue("Drop-off"),
        booker: fieldValue("Booker"),
        bookerContact: fieldValue("Booker WhatsApp / Contact"),
        bookerEmail: fieldValue("Booker email (optional)"),
        name: fieldValue("Passenger name") || fieldValue("Name"),
        pax: fieldValue("Pax"),
        childSeatCount: fieldValue("Child seat count"),
        childSeatType: fieldValue("Child seat type / note"),
        customerPriceOverride: fieldValue("Customer Price Override"),
        driverName: fieldValue("Driver Name"),
      };
      const overrideReasons = fieldValuesByLabel("Override Reason");
      const preTextByHeading = (headingText) => {
        const heading = [...document.querySelectorAll("h2")].find(
          (candidate) => candidate.textContent.trim() === headingText,
        );
        let node = heading;

        while (node && node !== document.body) {
          const pre = node.querySelector?.("pre");

          if (pre) {
            return pre.innerText;
          }

          node = node.parentElement;
        }

        return "";
      };
      const sectionTextByHeading = (headingText) => {
        const heading = [...document.querySelectorAll("h2")].find(
          (candidate) => candidate.textContent.trim() === headingText,
        );

        return heading?.parentElement?.innerText || "";
      };

      return {
        buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
        consoleErrors: window.__prestigeConsoleErrors || [],
        driverDispatch: pres.find((text) => text.includes("DRIVER DISPATCH")) || "",
        errors: window.__prestigeErrors || [],
        fields,
        fieldText: [...Object.values(fields), ...overrideReasons].join("\\n"),
        jobCardPreview: preTextByHeading("Job Card Preview"),
        pricingPanel: sectionTextByHeading("Pricing"),
        visibleText: document.body.innerText,
      };
    })()`;
    const state = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.company === "BROWSER UI TEST COMPANY" &&
          candidateState?.fields?.flight === "SQ333" &&
          candidateState?.jobCardPreview?.includes("Flight: SQ333")
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

    const focusedMultiBookingTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedMultiBookingTextarea,
      true,
      "Expected booking message textarea to be focused for multi-booking preview sample",
    );

    await client.send("Input.insertText", { text: multiBookingPreviewSample });

    const filledMultiBookingTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(multiBookingPreviewSample)}`,
    );
    assert.equal(
      filledMultiBookingTextarea,
      true,
      "Expected multi-booking preview sample to be filled",
    );

    const clickedMultiBookingParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Parse Booking",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedMultiBookingParse, true, "Expected Parse Booking button for multi-booking preview sample");

    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("Multiple bookings detected. Please select one extracted booking.") &&
            bodyText.includes("extractedBookingsPreview.length: 3") &&
            [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Use this booking");
        })()`),
      10000,
      "multi-booking preview choices",
    );

    const clickedFirstPreviewBooking = await evaluate(`(() => {
      const previewButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Use this booking",
      );

      if (!previewButton || previewButton.disabled) {
        return false;
      }

      previewButton.click();
      return true;
    })()`);
    assert.equal(clickedFirstPreviewBooking, true, "Expected first extracted booking preview to be selectable");

    const selectedPreviewState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.company === "BNY" &&
          candidateState?.fields?.booker === "Nicole" &&
          candidateState?.fields?.flight === "SQ318" &&
          candidateState?.fields?.dropoff === "Fullerton Hotel"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "selected multi-booking preview UI state",
    );
    selectedPreviewState.errors = [...browserErrors, ...(selectedPreviewState.errors || [])];
    selectedPreviewState.consoleErrors = [...browserConsoleErrors, ...(selectedPreviewState.consoleErrors || [])];

    assert.deepEqual(
      selectedPreviewState.errors,
      [],
      `Expected no browser runtime errors, got ${selectedPreviewState.errors.join("\n")}`,
    );
    assert.deepEqual(
      selectedPreviewState.consoleErrors,
      [],
      `Expected no browser console errors, got ${selectedPreviewState.consoleErrors.join("\n")}`,
    );
    assert.equal(selectedPreviewState.fields.company, "BNY");
    assert.equal(selectedPreviewState.fields.booker, "Nicole");
    assert.equal(selectedPreviewState.fields.bookingType, "MNG");
    assert.equal(selectedPreviewState.fields.pickupTime, "0610hrs");
    assert.equal(selectedPreviewState.fields.flight, "SQ318");
    assert.equal(selectedPreviewState.fields.pickup, "Changi Airport");
    assert.equal(selectedPreviewState.fields.dropoff, "Fullerton Hotel");
    assert.equal(selectedPreviewState.fields.name, "Mr Deep");
    assert.doesNotMatch(selectedPreviewState.fieldText, /Mr Stanley|Ms Chloe|SQ221|Capella/);
    assert.doesNotMatch(selectedPreviewState.visibleText, /extractedBookingsPreview\.length|Please review warnings before saving\./);

    const clickedClearBeforeExactPaste = await evaluate(`(() => {
      const clearButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Clear",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(clickedClearBeforeExactPaste, true, "Expected Clear button before exact pasted waypoint sample");

    const focusedExactPasteTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedExactPasteTextarea,
      true,
      "Expected booking message textarea to be focused for exact pasted waypoint sample",
    );

    await client.send("Input.insertText", { text: exactPastedWaypointAirportArrivalSample });

    const filledExactPasteTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(exactPastedWaypointAirportArrivalSample)}`,
    );
    assert.equal(
      filledExactPasteTextarea,
      true,
      "Expected exact pasted waypoint booking message textarea to be filled",
    );

    const clickedExactPasteParse = await evaluate(`(() => {
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
      clickedExactPasteParse,
      true,
      "Expected Parse Booking button to parse exact pasted waypoint sample",
    );

    const exactPasteState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.flight === "SQ883" &&
          candidateState?.fields?.pickupTime === "0705hrs" &&
          candidateState?.fields?.dropoff === "26 Newton Rd, 307957"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed exact pasted waypoint UI state",
    );
    exactPasteState.errors = [...browserErrors, ...(exactPasteState.errors || [])];
    exactPasteState.consoleErrors = [...browserConsoleErrors, ...(exactPasteState.consoleErrors || [])];

    assert.deepEqual(
      exactPasteState.errors,
      [],
      `Expected no browser runtime errors, got ${exactPasteState.errors.join("\n")}`,
    );
    assert.deepEqual(
      exactPasteState.consoleErrors,
      [],
      `Expected no browser console errors, got ${exactPasteState.consoleErrors.join("\n")}`,
    );
    assert.equal(exactPasteState.fields.pickupTime, "0705hrs");
    assert.equal(exactPasteState.fields.dropoff, "26 Newton Rd, 307957");
    assert.equal(exactPasteState.fields.name, "Pui Yu Chan");
    assert.equal(exactPasteState.fields.pax, "2");
    assert.equal(exactPasteState.fields.extraStopCount, "1");
    assert.equal(exactPasteState.fields.extraStopLocation, "28 Alexandra View, Singapore 158744");

    const focusedExactDepartureTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedExactDepartureTextarea,
      true,
      "Expected booking message textarea to be focused for exact pasted departure waypoint sample",
    );

    await client.send("Input.insertText", { text: exactPastedWaypointAirportDepartureSample });

    const filledExactDepartureTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(exactPastedWaypointAirportDepartureSample)}`,
    );
    assert.equal(
      filledExactDepartureTextarea,
      true,
      "Expected exact pasted departure waypoint booking message textarea to be filled",
    );

    const clickedExactDepartureParse = await evaluate(`(() => {
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
      clickedExactDepartureParse,
      true,
      "Expected Parse Booking button to parse exact pasted departure waypoint sample",
    );

    const exactDepartureState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.flight === "TR288" &&
          candidateState?.fields?.vehicle === "E class" &&
          candidateState?.fields?.name === "Edien Joy" &&
          candidateState?.fields?.extraStopLocation === "351C Canberra Rd, Singapore 753351"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed exact pasted departure waypoint UI state",
    );
    exactDepartureState.errors = [...browserErrors, ...(exactDepartureState.errors || [])];
    exactDepartureState.consoleErrors = [
      ...browserConsoleErrors,
      ...(exactDepartureState.consoleErrors || []),
    ];

    assert.deepEqual(
      exactDepartureState.errors,
      [],
      `Expected no browser runtime errors, got ${exactDepartureState.errors.join("\n")}`,
    );
    assert.deepEqual(
      exactDepartureState.consoleErrors,
      [],
      `Expected no browser console errors, got ${exactDepartureState.consoleErrors.join("\n")}`,
    );
    assert.equal(exactDepartureState.fields.company, "");
    assert.equal(exactDepartureState.fields.booker, "Luther Graham");
    assert.equal(exactDepartureState.fields.bookerContact, "+6580912613");
    assert.equal(exactDepartureState.fields.bookerEmail, "luthergrahambk@gmail.com");
    assert.equal(exactDepartureState.fields.bookingType, "DEP");
    assert.equal(exactDepartureState.fields.vehicle, "E class");
    assert.equal(exactDepartureState.fields.pickupDate, "2026-05-06");
    assert.equal(exactDepartureState.fields.pickupTime, "0800hrs");
    assert.equal(exactDepartureState.fields.flight, "TR288");
    assert.equal(exactDepartureState.fields.pickup, "756 Woodlands Ave 4, Singapore");
    assert.equal(exactDepartureState.fields.dropoff, "Changi Airport");
    assert.equal(exactDepartureState.fields.name, "Edien Joy");
    assert.equal(exactDepartureState.fields.pax, "2");
    assert.equal(exactDepartureState.fields.extraStopCount, "1");
    assert.equal(exactDepartureState.fields.extraStopLocation, "351C Canberra Rd, Singapore 753351");
    assert.equal(exactDepartureState.fields.customerPriceOverride, "110");

    const focusedRouteNameAirportTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedRouteNameAirportTextarea,
      true,
      "Expected booking message textarea to be focused for route-name Airport drop-off-only sample",
    );

    await client.send("Input.insertText", { text: routeNameAirportDropoffOnlySample });

    const filledRouteNameAirportTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(routeNameAirportDropoffOnlySample)}`,
    );
    assert.equal(
      filledRouteNameAirportTextarea,
      true,
      "Expected route-name Airport drop-off-only booking message textarea to be filled",
    );

    const clickedRouteNameAirportParse = await evaluate(`(() => {
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
      clickedRouteNameAirportParse,
      true,
      "Expected Parse Booking button to parse route-name Airport drop-off-only sample",
    );

    const routeNameAirportState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "MNG" &&
          candidateState?.fields?.flight === "SQ238" &&
          candidateState?.fields?.pickup === "Changi Airport"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed route-name Airport drop-off-only UI state",
    );
    routeNameAirportState.errors = [...browserErrors, ...(routeNameAirportState.errors || [])];
    routeNameAirportState.consoleErrors = [
      ...browserConsoleErrors,
      ...(routeNameAirportState.consoleErrors || []),
    ];

    assert.deepEqual(
      routeNameAirportState.errors,
      [],
      `Expected no browser runtime errors, got ${routeNameAirportState.errors.join("\n")}`,
    );
    assert.deepEqual(
      routeNameAirportState.consoleErrors,
      [],
      `Expected no browser console errors, got ${routeNameAirportState.consoleErrors.join("\n")}`,
    );
    assert.equal(routeNameAirportState.fields.company, "BAONLINE");
    assert.equal(routeNameAirportState.fields.booker, "pj");
    assert.equal(routeNameAirportState.fields.bookerContact, "+61419501117");
    assert.equal(routeNameAirportState.fields.bookerEmail, "pj@baonline.com.au");
    assert.equal(routeNameAirportState.fields.bookingType, "MNG");
    assert.equal(routeNameAirportState.fields.vehicle, "E class");
    assert.equal(routeNameAirportState.fields.pickupDate, "2026-04-30");
    assert.equal(routeNameAirportState.fields.pickupTime, "1530hrs");
    assert.equal(routeNameAirportState.fields.flight, "SQ238");
    assert.equal(routeNameAirportState.fields.pickup, "Changi Airport");
    assert.equal(routeNameAirportState.fields.dropoff, "333 Orchard Rd, Singapore 238867");
    assert.equal(routeNameAirportState.fields.name, "Peter Dynan");
    assert.equal(routeNameAirportState.fields.pax, "1");
    assert.equal(routeNameAirportState.fields.customerPriceOverride, "95");
    assert.doesNotMatch(routeNameAirportState.visibleText, /Missing pickup/);

    const focusedRouteNameAirportDepartureTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedRouteNameAirportDepartureTextarea,
      true,
      "Expected booking message textarea to be focused for route-name Airport pickup-only departure sample",
    );

    await client.send("Input.insertText", { text: routeNameAirportPickupOnlyDepartureWaypointSample });

    const filledRouteNameAirportDepartureTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(routeNameAirportPickupOnlyDepartureWaypointSample)}`,
    );
    assert.equal(
      filledRouteNameAirportDepartureTextarea,
      true,
      "Expected route-name Airport pickup-only departure booking message textarea to be filled",
    );

    const clickedRouteNameAirportDepartureParse = await evaluate(`(() => {
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
      clickedRouteNameAirportDepartureParse,
      true,
      "Expected Parse Booking button to parse route-name Airport pickup-only departure sample",
    );

    const routeNameAirportDepartureState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DEP" &&
          candidateState?.fields?.flight === "SQ265" &&
          candidateState?.fields?.dropoff === "Changi Airport" &&
          candidateState?.fields?.extraStopCount === "2" &&
          candidateState?.jobCardPreview?.includes("Bedok South")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed route-name Airport pickup-only departure UI state",
    );
    routeNameAirportDepartureState.errors = [
      ...browserErrors,
      ...(routeNameAirportDepartureState.errors || []),
    ];
    routeNameAirportDepartureState.consoleErrors = [
      ...browserConsoleErrors,
      ...(routeNameAirportDepartureState.consoleErrors || []),
    ];

    assert.deepEqual(
      routeNameAirportDepartureState.errors,
      [],
      `Expected no browser runtime errors, got ${routeNameAirportDepartureState.errors.join("\n")}`,
    );
    assert.deepEqual(
      routeNameAirportDepartureState.consoleErrors,
      [],
      `Expected no browser console errors, got ${routeNameAirportDepartureState.consoleErrors.join("\n")}`,
    );
    assert.equal(routeNameAirportDepartureState.fields.company, "");
    assert.equal(routeNameAirportDepartureState.fields.bookingType, "DEP");
    assert.equal(routeNameAirportDepartureState.fields.vehicle, "AVF");
    assert.equal(routeNameAirportDepartureState.fields.pickupDate, "2026-04-30");
    assert.equal(routeNameAirportDepartureState.fields.pickupTime, "0420hrs");
    assert.equal(routeNameAirportDepartureState.fields.flight, "SQ265");
    assert.equal(routeNameAirportDepartureState.fields.pickup, "160 Watten Estate Rd, Singapore 287610");
    assert.equal(routeNameAirportDepartureState.fields.dropoff, "Changi Airport");
    assert.equal(routeNameAirportDepartureState.fields.bookerEmail, "luthergrahambk@gmail.com");
    assert.equal(routeNameAirportDepartureState.fields.name, "Luther Graham");
    assert.equal(routeNameAirportDepartureState.fields.pax, "3");
    assert.equal(routeNameAirportDepartureState.fields.extraStopCount, "2");
    assert.match(routeNameAirportDepartureState.fields.extraStopLocation, /Sin Ming/);
    assert.match(routeNameAirportDepartureState.fields.extraStopLocation, /Bedok South/);
    assert.equal(routeNameAirportDepartureState.fields.customerPriceOverride, "160");
    assert.match(
      routeNameAirportDepartureState.jobCardPreview,
      /Watten Estate Rd > Sin Ming Ave > Bedok South Avenue 2 > Changi Airport/,
    );
    assert.doesNotMatch(routeNameAirportDepartureState.jobCardPreview, /Company:\s*gmail\.com/i);
    assert.doesNotMatch(routeNameAirportDepartureState.jobCardPreview, /Company:/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Watten Estate Rd/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Sin Ming Ave/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Bedok South/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Changi Airport/);

    const focusedFreeformTransferTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedFreeformTransferTextarea,
      true,
      "Expected booking message textarea to be focused for freeform transfer sample",
    );

    await client.send("Input.insertText", { text: freeformTransferMultiLocationSample });

    const filledFreeformTransferTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(freeformTransferMultiLocationSample)}`,
    );
    assert.equal(
      filledFreeformTransferTextarea,
      true,
      "Expected freeform transfer booking message textarea to be filled",
    );

    const clickedFreeformTransferParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Parse Booking",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedFreeformTransferParse, true, "Expected Parse Booking button to parse freeform transfer sample");

    const freeformTransferState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "TRF" &&
          candidateState?.fields?.pickup === "Shenton Way" &&
          candidateState?.fields?.dropoff === "Capital Tower" &&
          candidateState?.jobCardPreview?.includes("MAS Building") &&
          candidateState?.jobCardPreview?.includes("Asia Sq")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed freeform multi-location transfer UI state",
    );
    freeformTransferState.errors = [...browserErrors, ...(freeformTransferState.errors || [])];
    freeformTransferState.consoleErrors = [
      ...browserConsoleErrors,
      ...(freeformTransferState.consoleErrors || []),
    ];

    assert.deepEqual(
      freeformTransferState.errors,
      [],
      `Expected no browser runtime errors, got ${freeformTransferState.errors.join("\n")}`,
    );
    assert.deepEqual(
      freeformTransferState.consoleErrors,
      [],
      `Expected no browser console errors, got ${freeformTransferState.consoleErrors.join("\n")}`,
    );
    assert.equal(freeformTransferState.fields.bookingType, "TRF");
    assert.equal(freeformTransferState.fields.vehicle, "VVV");
    assert.equal(freeformTransferState.fields.pickupDate, "2026-05-19");
    assert.equal(freeformTransferState.fields.pickupTime, "1100hrs");
    assert.equal(freeformTransferState.fields.flight, "");
    assert.equal(freeformTransferState.fields.pickup, "Shenton Way");
    assert.equal(freeformTransferState.fields.dropoff, "Capital Tower");
    assert.equal(freeformTransferState.fields.name, "Andrew");
    assert.equal(freeformTransferState.fields.extraStopCount, "2");
    assert.equal(freeformTransferState.fields.extraStopLocation, "MAS Building > Asia Sq");
    assert.doesNotMatch(freeformTransferState.fieldText, /Changi Airport|andrew shenton way send him|pickup john/i);
    assert.match(
      freeformTransferState.jobCardPreview,
      /Shenton Way > MAS Building > Asia Sq > Capital Tower/,
    );
    assert.match(
      freeformTransferState.driverDispatch,
      /Shenton Way > MAS Building > Asia Sq > Capital Tower/,
    );
    assert.match(freeformTransferState.pricingPanel, /Customer\s+\$85\.00/);
    assert.match(freeformTransferState.pricingPanel, /Driver\s+\$65\.00/);
    assert.match(freeformTransferState.pricingPanel, /Profit\s+\$20\.00/);
    assert.doesNotMatch(freeformTransferState.visibleText, /Negative profit/);

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

    const focusedNumberedEventDspTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedNumberedEventDspTextarea,
      true,
      "Expected booking message textarea to be focused for numbered event DSP sample",
    );

    await client.send("Input.insertText", { text: numberedEventDspItinerarySample });

    const filledNumberedEventDspTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(numberedEventDspItinerarySample)}`,
    );
    assert.equal(
      filledNumberedEventDspTextarea,
      true,
      "Expected numbered event DSP booking message textarea to be filled",
    );

    const clickedNumberedEventDspParse = await evaluate(`(() => {
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
      clickedNumberedEventDspParse,
      true,
      "Expected Parse Booking button to parse numbered event DSP sample",
    );

    const numberedEventDspState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DSP" &&
          candidateState?.fields?.pickup === "Carlton City" &&
          candidateState?.fields?.dropoff === "UIC Building" &&
          candidateState?.fields?.extraStopLocation?.includes("Cherry Garden") &&
          candidateState?.jobCardPreview?.includes("Cherry Garden") &&
          candidateState?.jobCardPreview?.includes("Suntec Expo")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed numbered event DSP itinerary UI state",
    );
    numberedEventDspState.errors = [...browserErrors, ...(numberedEventDspState.errors || [])];
    numberedEventDspState.consoleErrors = [
      ...browserConsoleErrors,
      ...(numberedEventDspState.consoleErrors || []),
    ];

    assert.deepEqual(
      numberedEventDspState.errors,
      [],
      `Expected no browser runtime errors, got ${numberedEventDspState.errors.join("\n")}`,
    );
    assert.deepEqual(
      numberedEventDspState.consoleErrors,
      [],
      `Expected no browser console errors, got ${numberedEventDspState.consoleErrors.join("\n")}`,
    );
    assert.match(numberedEventDspState.visibleText, /Passenger name/);
    assert.equal(numberedEventDspState.fields.bookingType, "DSP");
    assert.equal(numberedEventDspState.fields.pickupTime, "1130hrs");
    assert.equal(numberedEventDspState.fields.pickup, "Carlton City");
    assert.equal(numberedEventDspState.fields.dropoff, "UIC Building");
    assert.equal(numberedEventDspState.fields.name, "Mr Wong");
    assert.equal(numberedEventDspState.fields.booker, "");
    assert.equal(numberedEventDspState.fields.vehicle, "AVF");
    assert.equal(numberedEventDspState.fields.flight, "");
    assert.equal(numberedEventDspState.fields.extraStopCount, "3");
    assert.equal(
      numberedEventDspState.fields.extraStopLocation,
      "Capella Residence Suite A > Cherry Garden > Suntec Expo",
    );
    assert.doesNotMatch(numberedEventDspState.fieldText, /Black Alphard|Plate/);
    assert.doesNotMatch(numberedEventDspState.fieldText, /Changi Airport/);
    assert.match(
      numberedEventDspState.jobCardPreview,
      /Carlton City > Capella Residence Suite A > Cherry Garden > Suntec Expo > UIC Building/,
    );
    assert.match(
      numberedEventDspState.driverDispatch,
      /Carlton City > Capella Residence Suite A > Cherry Garden > Suntec Expo > UIC Building/,
    );
    assert.doesNotMatch(numberedEventDspState.visibleText, /Multiple bookings detected/);

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
    assert.doesNotMatch(timedScheduleState.fields.extraStopLocation, /HarbourFront Avenue|BDC office/);
    assert.match(
      timedScheduleState.fields.extraStopLocation,
      /One Raffles Quay, North Tower > Capital Tower/,
    );
    assert.match(
      timedScheduleState.jobCardPreview,
      /HarbourFront Avenue > One Raffles Quay > Capital Tower > BDC office/,
    );
    assert.doesNotMatch(timedScheduleState.jobCardPreview, /#02-01|#39-01|North Tower/);
    assert.match(
      timedScheduleState.driverDispatch,
      /1 HarbourFront Avenue, Keppel Bay Tower > One Raffles Quay, North Tower > Capital Tower > BDC office/,
    );
    assert.doesNotMatch(timedScheduleState.driverDispatch, /Pickup > Drop-off|Marina Bay Sands|#02-01|#39-01/);

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
