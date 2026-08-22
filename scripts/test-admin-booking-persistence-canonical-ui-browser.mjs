import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import {
  createChromeClient,
  navigateWithLoadEvent,
  waitForChromeDebugPort,
  waitForChromePageTarget,
  waitForCondition,
  waitForTabLabels,
} from "./browser-test-helpers.mjs";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let chromeDebugPort = process.env.CHROME_DEBUG_PORT ? Number(process.env.CHROME_DEBUG_PORT) : null;

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
  });
}

async function launchChrome(userDataDir) {
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
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${chromeDebugPort}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForChromeDebugPort(chromeDebugPort, 10000);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nChrome stderr:\n${stderr}`);
  }

  return { chrome, stderr: () => stderr };
}

async function terminate(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) {
    return;
  }

  processHandle.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });

  if (processHandle.exitCode === null && processHandle.signalCode === null) {
    processHandle.kill("SIGKILL");
  }
}

async function main() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-crm-canonical-"));
  let chromeProcess = null;
  let client = null;

  try {
    chromeDebugPort = chromeDebugPort || (await findAvailablePort());
    const launched = await launchChrome(userDataDir);
    chromeProcess = launched.chrome;
    const target = await waitForChromePageTarget(chromeDebugPort, 10000);
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
      }

      return result.result?.value;
    };

    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
      const originalFetch = window.fetch.bind(window);
      window.__canonicalLoadBookingCalls = [];
      window.__type2AssignmentCalendarCalls = [];
      window.__type2AssignmentLinkBodies = [];
      window.__type2AssignmentPatchBodies = [];
      const canonicalBooking = {
        id: "canonical-row-37",
        booking_reference: "CANONICAL-REQ-001",
        source_channel: "customer-booking-request",
        source_surface: "customer_booking_request",
        customer_id: "canonical-customer",
        company_id: null,
        booker_id: null,
        traveler_id: null,
        booking_type: null,
        service_type: "DEP",
        route_type: null,
        vehicle: null,
        vehicle_type: null,
        vehicle_type_or_category: "No preference",
        pickup_time: null,
        pickup_at: "2030-06-25T11:15:00+08:00",
        pickup_datetime: null,
        pickup_address: null,
        pickup_location: "Canonical Pickup",
        public_booking_reference: "19001",
        dropoff_address: null,
        dropoff_location: "Canonical Dropoff",
        flight_no: "SQ999",
        route: null,
        route_summary: "Canonical Pickup > Canonical Dropoff",
        pax: null,
        pax_count: 3,
        passenger_name: "Canonical Passenger",
        passenger_phone: "+65 8000 9999",
        customer_display_name: "Canonical Customer",
        contact_display_name: "Canonical Booker",
        contact_phone: "+65 8000 9998",
        contact_email: "canonical@example.com",
        job_card: null,
        status: "requested",
        driver_id: null,
        driver_name: null,
        driver_contact: null,
        driver_plate_number: null,
        created_at: "2026-06-25T01:00:00.000Z",
        updated_at: "2026-06-25T01:00:00.000Z",
        companies: null,
        bookers: null,
        travelers: null
      };
      let type2Booking = {
        id: "type2-row-1",
        booking_reference: "TYPE2-SAVED-001",
        public_booking_reference: "19002",
        source_channel: "admin-dashboard",
        source_surface: "admin_dashboard",
        customer_id: 7201,
        company_id: 7202,
        booker_id: 7203,
        traveler_id: 7204,
        booking_type: "TRF",
        service_type: "TRF",
        route_type: "TRF",
        vehicle: "AVF",
        vehicle_type_or_category: "AVF",
        pickup_time: "1400",
        pickup_at: "2030-06-26T14:00:00+08:00",
        pickup_datetime: "2030-06-26T14:00:00+08:00",
        pickup_address: "Type 2 Pickup",
        pickup_location: "Type 2 Pickup",
        dropoff_address: "Type 2 Dropoff",
        dropoff_location: "Type 2 Dropoff",
        route: "Type 2 Pickup > Type 2 Dropoff",
        route_summary: "Type 2 Pickup > Type 2 Dropoff",
        pax: 2,
        pax_count: 2,
        luggage_count: 1,
        passenger_name: "Type 2 Passenger",
        passenger_phone: "+65 8000 2002",
        customer_display_name: "Type 2 Customer",
        contact_display_name: "Type 2 Booker",
        contact_phone: "+65 8000 2001",
        contact_email: "type2@example.com",
        status: "confirmed",
        admin_internal_status: "Ready for Confirmation",
        customer_facing_status: "confirmed",
        request_review_status: "approved",
        short_notice_review_status: "Not Required",
        driver_id: null,
        driver_name: null,
        driver_contact: null,
        driver_plate_number: null,
        created_at: "2026-06-25T02:00:00.000Z",
        updated_at: "2026-06-25T02:00:00.000Z",
        companies: { company_name: "Type 2 Customer", domain: "type2.example.com" },
        bookers: {
          booker_name: "Type 2 Booker",
          email: "type2@example.com",
          phone: "+65 8000 2001"
        },
        travelers: { traveler_name: "Type 2 Passenger" }
      };
      const type2Driver = {
        id: 7301,
        availability_status: "available",
        contact_number: "+65 8111 7301",
        driver_name: "TYPE 2 VERIFIED DRIVER",
        plate_number: "SLC7301T",
        vehicle_type: "Alphard"
      };
      window.fetch = async (...args) => {
        const [input, init] = args;
        const url = typeof input === "string" ? input : input?.url || "";
        const method = (init?.method || "GET").toUpperCase();

        if (method === "GET" && String(url).includes("/api/admin-load-bookings-typed-read")) {
          window.__canonicalLoadBookingCalls.push({ method, surface: "typed", url: String(url) });
          return new Response(JSON.stringify({
            error: "Typed read intentionally closed for fallback canonical display test.",
            ok: false
          }), { headers: { "Content-Type": "application/json" }, status: 503 });
        }

        if (method === "GET" && String(url).includes("/api/admin-saved-bookings")) {
          window.__canonicalLoadBookingCalls.push({ method, surface: "saved", url: String(url) });
          return new Response(JSON.stringify({
            ok: true,
            bookings: [canonicalBooking, type2Booking]
          }), { headers: { "Content-Type": "application/json" }, status: 200 });
        }

        if (method === "GET" && String(url).includes("/api/admin-driver-assignment-display")) {
          return new Response(JSON.stringify({
            drivers: [type2Driver],
            ok: true,
            readiness: {
              external_send: false,
              fullProfileWritePathParked: true,
              readOnly: true,
              setupSafe: true,
              source: "typed_driver_assignment_display",
              writeEnabled: false
            },
            version: "type2-assignment-browser-mock"
          }), { headers: { "Content-Type": "application/json" }, status: 200 });
        }

        if (String(url).includes("/api/admin-bookings")) {
          const parsedBody = init?.body ? JSON.parse(String(init.body)) : null;
          const requestUrl = new URL(String(url), window.location.href);

          if (method === "GET") {
            const bookingReference = requestUrl.searchParams.get("booking_reference");
            return new Response(JSON.stringify(
              bookingReference === type2Booking.booking_reference
                ? { booking: type2Booking, ok: true }
                : { bookings: [canonicalBooking, type2Booking], ok: true }
            ), { headers: { "Content-Type": "application/json" }, status: 200 });
          }

          if (method === "PATCH") {
            window.__type2AssignmentPatchBodies.push(parsedBody);
            type2Booking = {
              ...type2Booking,
              ...parsedBody.booking,
              booking_reference: type2Booking.booking_reference,
              id: type2Booking.id,
              public_booking_reference: type2Booking.public_booking_reference,
              route_points: parsedBody.route_points || [],
              service_items: parsedBody.service_items || [],
              updated_at: "2026-06-25T02:01:00.000Z"
            };
            return new Response(JSON.stringify({
              booking: type2Booking,
              ok: true,
              version: "type2-assignment-update-browser-mock"
            }), { headers: { "Content-Type": "application/json" }, status: 200 });
          }
        }

        if (String(url).includes("/api/admin-booking-calendar-google-sync")) {
          window.__type2AssignmentCalendarCalls.push({ method, url: String(url) });
          return new Response(JSON.stringify({
            ok: true,
            sync: { live_calendar_write_performed: true }
          }), { headers: { "Content-Type": "application/json" }, status: 200 });
        }

        if (method === "POST" && String(url).includes("/api/admin-driver-job-links")) {
          const parsedBody = init?.body ? JSON.parse(String(init.body)) : null;
          window.__type2AssignmentLinkBodies.push(parsedBody);
          return new Response(JSON.stringify({
            driver_job_url: "https://app.prestigelimo.sg/driver-job/type2-browser-token",
            link: {
              acknowledged_at: null,
              booking_reference: type2Booking.booking_reference,
              expires_at: "2030-06-30T14:00:00+08:00",
              id: "type2-browser-link-1",
              issued_at: "2026-06-25T02:02:00.000Z",
              revoked_at: null,
              safe_summary: parsedBody.driver_job_payload
            },
            live_location: {
              allowed_booking_references: [type2Booking.booking_reference],
              authorized: true,
              customerVisible: false,
              external_send: false
            },
            native_app_alert: {
              provider_accepted: false,
              reason: "no_verified_native_subscription"
            },
            ok: true
          }), { headers: { "Content-Type": "application/json" }, status: 201 });
        }

        return originalFetch(...args);
      };
    })()`,
    });

    await navigateWithLoadEvent(client, appUrl);
    await waitForTabLabels(evaluate, ["Dispatch", "Dashboard", "Bookings"], "admin tabs");

    await evaluate(`(() => {
      const bookingsTab = document.querySelector("button[data-app-tab='bookings']")
        || [...document.querySelectorAll("button[role='tab']")]
          .find((button) => button.querySelector("[data-app-tab-label='true']")?.textContent.trim() === "Bookings");
      bookingsTab?.click();
      return Boolean(bookingsTab);
    })()`);
    const bookingsSurfaceState = await evaluate(`(() => {
      const autoLoadTab = document.querySelector("[data-bookings-tab-autoload='true']");
      const findToolbar = document.querySelector("[data-bookings-find-toolbar='true']");
      const legacyLoadButton = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent.trim() === "Load Bookings");
      return {
        autoLoadTab: Boolean(autoLoadTab),
        findToolbar: Boolean(findToolbar),
        legacyLoadButton: Boolean(legacyLoadButton),
      };
    })()`);
    assert.equal(bookingsSurfaceState.autoLoadTab, true, "Expected Bookings auto-load tab marker");
    assert.equal(bookingsSurfaceState.findToolbar, true, "Expected visible saved-jobs search surface");
    assert.equal(
      bookingsSurfaceState.legacyLoadButton,
      false,
      "Expected the retired manual Load Bookings button to stay absent",
    );

    const cardState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const record = document.querySelector("[data-recent-operational-card='CANONICAL-REQ-001']");
          if (!record) return false;
          const text = record.textContent.replace(/\\s+/g, " ").trim();
          return {
            savedCalls: (window.__canonicalLoadBookingCalls || []).filter((call) => call.surface === "saved").length,
            typedCalls: (window.__canonicalLoadBookingCalls || []).filter((call) => call.surface === "typed").length,
            text,
          };
        })()`),
      10000,
      "canonical visible recent booking card",
    );

    assert.equal(
      cardState.typedCalls >= 1 && cardState.typedCalls <= 2,
      true,
      "Expected one production read or the bounded React development replay for typed display",
    );
    assert.equal(
      cardState.savedCalls >= 1 && cardState.savedCalls <= 2,
      true,
      "Expected one production read or the bounded React development replay for saved bookings",
    );
    assert.equal(cardState.text.includes("19001"), true);
    assert.equal(cardState.text.includes("CANONICAL-REQ-001"), false);
    assert.equal(cardState.text.includes("Canonical Customer"), true);
    assert.equal(cardState.text.includes("Canonical Booker"), true);
    assert.equal(cardState.text.includes("Canonical Passenger"), true);
    assert.equal(cardState.text.includes("Canonical Pickup > Canonical Dropoff"), true);
    assert.equal(cardState.text.includes("Unknown"), false);
    assert.equal(cardState.text.includes("Pickup > Drop-off"), false);
    assert.equal(/price|billing|invoice|payment|payout|finance/i.test(cardState.text), false);

    const applyClicked = await evaluate(`(() => {
      const record = document.querySelector("[data-recent-operational-card='CANONICAL-REQ-001']");
      const button = [...(record?.querySelectorAll("button") || [])]
        .find((candidate) => candidate.textContent.trim() === "Open / Edit");
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(applyClicked, true, "Expected current Open / Edit booking control");

    const appliedState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const statusFeedback = [...document.querySelectorAll("p, div")]
            .map((node) => node.textContent || "")
            .find((text) => text.includes("Booking 19001 loaded.")) || "";
          const getField = (labelText) => {
            const normalizedLabel = (value) =>
              String(value || "").replace(/\\s*\\*\\s*$/, "").trim();
            const label = [...document.querySelectorAll("label")].find(
              (candidate) =>
                normalizedLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            const field = label?.querySelector("input, textarea, select");
            return field && "value" in field ? field.value : "";
          };
          if (!statusFeedback) return false;
          return {
            booker: getField("Booker"),
            bookingType: getField("Booking type"),
            company: getField("Company / Account"),
            dropoff: getField("Drop-off"),
            name: getField("Passenger name"),
            pax: getField("Pax"),
            pickup: getField("Pickup"),
            time: getField("Pickup time"),
            vehicle: getField("Vehicle"),
          };
        })()`),
      10000,
      "canonical visible booking loaded form fields",
    );

    assert.equal(appliedState.company, "Canonical Customer");
    assert.equal(appliedState.booker, "Canonical Booker");
    assert.equal(appliedState.name, "Canonical Passenger");
    assert.equal(appliedState.bookingType, "DEP");
    assert.equal(appliedState.pickup, "Canonical Pickup");
    assert.equal(appliedState.dropoff, "Canonical Dropoff");
    assert.equal(appliedState.pax, "3");
    assert.equal(appliedState.vehicle, "AVF");
    assert.match(appliedState.time, /^1115/);

    await evaluate(`(() => {
      const bookingsTab = document.querySelector("button[data-app-tab='bookings']")
        || [...document.querySelectorAll("button[role='tab']")]
          .find((button) => button.querySelector("[data-app-tab-label='true']")?.textContent.trim() === "Bookings");
      bookingsTab?.click();
      return Boolean(bookingsTab);
    })()`);

    const type2OpenClicked = await waitForCondition(
      () => evaluate(`(() => {
        const record = document.querySelector("[data-recent-operational-card='TYPE2-SAVED-001']");
        const button = [...(record?.querySelectorAll("button") || [])]
          .find((candidate) => candidate.textContent.trim() === "Open / Edit");
        if (!button) return false;
        button.click();
        return true;
      })()`),
      10000,
      "saved Type 2 booking Open / Edit control",
    );
    assert.equal(type2OpenClicked, true);

    const type2LoadedState = await waitForCondition(
      () => evaluate(`(() => {
        const text = document.querySelector("[data-admin-booking-edit-identity='true']")?.textContent || "";
        const assignmentButton = [...document.querySelectorAll("button")]
          .find((button) => button.textContent.trim() === "Apply Driver to Draft");
        return text.includes("19002") && assignmentButton
          ? { assignmentLabel: assignmentButton.textContent.trim(), editIdentity: text }
          : false;
      })()`),
      10000,
      "saved Type 2 booking loaded in Dispatch",
    );
    assert.equal(type2LoadedState.assignmentLabel, "Apply Driver to Draft");

    const loadDriversClicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent.trim() === "Load Drivers for Assignment");
      button?.click();
      return Boolean(button);
    })()`);
    assert.equal(loadDriversClicked, true);

    const selectedType2DriverState = await waitForCondition(
      () => evaluate(`(() => {
        const normalizeLabel = (value) => String(value || "").replace(/\\s*\\*\\s*$/, "").trim();
        const driverLabel = [...document.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Driver",
        );
        const driverSelect = driverLabel?.querySelector("select");
        if (!driverSelect?.querySelector("option[value='7301']")) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(driverSelect, "7301");
        driverSelect.dispatchEvent(new Event("change", { bubbles: true }));
        const assignmentButton = [...document.querySelectorAll("button")]
          .find((button) => button.textContent.trim() === "Save Driver Assignment");
        const primaryButton = document.querySelector("[data-job-card-save-toolbar='primary'] button");
        return assignmentButton && primaryButton?.textContent.trim() === "Save Driver Assignment above"
          ? {
              assignmentLabel: assignmentButton.textContent.trim(),
              primaryDisabled: primaryButton.disabled,
              primaryLabel: primaryButton.textContent.trim(),
            }
          : false;
      })()`),
      10000,
      "verified driver selected for saved Type 2 assignment",
    );
    assert.equal(selectedType2DriverState.assignmentLabel, "Save Driver Assignment");
    assert.equal(selectedType2DriverState.primaryLabel, "Save Driver Assignment above");
    assert.equal(selectedType2DriverState.primaryDisabled, true);

    await evaluate(`(() => {
      window.__type2AssignmentCalendarCalls = [];
      window.__type2AssignmentLinkBodies = [];
      window.__type2AssignmentPatchBodies = [];
      const button = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent.trim() === "Save Driver Assignment");
      button?.click();
      return Boolean(button);
    })()`);

    const type2AssignmentSavedState = await waitForCondition(
      () => evaluate(`(() => {
        const patches = window.__type2AssignmentPatchBodies || [];
        const createLinkButton = document.querySelector("[data-create-driver-job-link-button='true']");
        const linkSection = document.querySelector("[data-dispatch-workflow-step='driver-job-link']");
        const successVisible = document.body.innerText.includes("Driver assignment saved: TYPE2-SAVED-001.");
        return patches.length === 1 && successVisible && createLinkButton && linkSection
          ? {
              calendarCalls: window.__type2AssignmentCalendarCalls || [],
              createLinkDisabled: createLinkButton.disabled,
              linkSectionText: linkSection.textContent.replace(/\\s+/g, " ").trim(),
              patch: patches[0],
            }
          : false;
      })()`),
      10000,
      "saved Type 2 assignment persisted and retained at Driver Job Link",
    );

    assert.equal(type2AssignmentSavedState.patch.target_booking_reference, "TYPE2-SAVED-001");
    assert.equal(
      type2AssignmentSavedState.patch.expected_updated_at,
      "2026-06-25T02:00:00.000Z",
    );
    assert.equal(type2AssignmentSavedState.patch.booking.driver_id, 7301);
    assert.equal(type2AssignmentSavedState.patch.booking.driver_name, "TYPE 2 VERIFIED DRIVER");
    assert.equal(type2AssignmentSavedState.patch.booking.driver_contact, "+65 8111 7301");
    assert.equal(type2AssignmentSavedState.patch.booking.driver_plate_number, "SLC7301T");
    assert.deepEqual(
      type2AssignmentSavedState.calendarCalls,
      [],
      "assignment-only save must perform zero Operations Calendar requests",
    );
    assert.equal(type2AssignmentSavedState.createLinkDisabled, false);
    assert.match(type2AssignmentSavedState.linkSectionText, /Booking 19002/);
    assert.match(type2AssignmentSavedState.linkSectionText, /TYPE 2 VERIFIED DRIVER/);
    const type2CreateLinkFocused = await waitForCondition(
      () => evaluate(`(() => {
        const createLinkButton = document.querySelector("[data-create-driver-job-link-button='true']");
        return Boolean(createLinkButton && document.activeElement === createLinkButton);
      })()`),
      10000,
      "retained Type 2 booking focuses existing Create Link control",
    );
    assert.equal(type2CreateLinkFocused, true);

    await evaluate(`(() => {
      document.querySelector("[data-create-driver-job-link-button='true']")?.click();
    })()`);
    const type2LinkState = await waitForCondition(
      () => evaluate(`(() => {
        const bodies = window.__type2AssignmentLinkBodies || [];
        const copyButton = document.querySelector("[data-copy-driver-job-link-button='true']");
        return bodies.length === 1 && copyButton && !copyButton.disabled
          ? { body: bodies[0], copyEnabled: !copyButton.disabled }
          : false;
      })()`),
      10000,
      "Create Link uses persisted Type 2 driver assignment",
    );
    assert.equal(type2LinkState.body.booking_reference, "TYPE2-SAVED-001");
    assert.equal(type2LinkState.body.driver_job_payload.assigned_driver_name, "TYPE 2 VERIFIED DRIVER");
    assert.equal(type2LinkState.body.driver_job_payload.assigned_driver_contact, "+65 8111 7301");
    assert.equal(type2LinkState.body.driver_job_payload.assigned_driver_plate, "SLC7301T");
    assert.equal(type2LinkState.body.driver_job_payload.assigned_driver_vehicle_model, "Alphard");
    assert.equal(type2LinkState.copyEnabled, true);

    const nonDriverAmendmentState = await evaluate(`(() => {
      const normalizeLabel = (value) => String(value || "").replace(/\\s*\\*\\s*$/, "").trim();
      const paxLabel = [...document.querySelectorAll("label")].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Pax",
      );
      const paxInput = paxLabel?.querySelector("input");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(paxInput, "3");
      paxInput?.dispatchEvent(new Event("input", { bubbles: true }));
      paxInput?.dispatchEvent(new Event("change", { bubbles: true }));
      const primaryButton = document.querySelector("[data-job-card-save-toolbar='primary'] button");
      return {
        primaryDisabled: primaryButton?.disabled,
        primaryLabel: primaryButton?.textContent.trim() || "",
      };
    })()`);
    assert.equal(nonDriverAmendmentState.primaryLabel, "Update + Cal");
    assert.equal(nonDriverAmendmentState.primaryDisabled, false);

    const newBookingAssignmentState = await evaluate(`(() => {
      const newBookingButton = [...document.querySelectorAll("button")]
        .find((candidate) => candidate.textContent.trim() === "New booking");
      newBookingButton?.click();
      const normalizeLabel = (value) => String(value || "").replace(/\\s*\\*\\s*$/, "").trim();
      const driverLabel = [...document.querySelectorAll("label")].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Driver",
      );
      const driverSelect = driverLabel?.querySelector("select");
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(driverSelect, "7301");
      driverSelect?.dispatchEvent(new Event("change", { bubbles: true }));
      const assignmentButton = [...document.querySelectorAll("button")]
        .find((button) => button.textContent.trim() === "Apply Driver to Draft");
      const primaryButton = document.querySelector("[data-job-card-save-toolbar='primary'] button");
      return {
        assignmentLabel: assignmentButton?.textContent.trim() || "",
        primaryLabel: primaryButton?.textContent.trim() || "",
      };
    })()`);
    assert.equal(newBookingAssignmentState.assignmentLabel, "Apply Driver to Draft");
    assert.equal(newBookingAssignmentState.primaryLabel, "Save + CRM");

    console.log("Admin booking persistence canonical UI browser test passed.");
  } finally {
    if (client) {
      await client.close();
    }
    await terminate(chromeProcess);
    await rm(userDataDir, { force: true, recursive: true });
  }
}

await main();
