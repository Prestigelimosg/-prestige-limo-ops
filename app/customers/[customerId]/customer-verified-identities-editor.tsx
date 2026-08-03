"use client";

import { useEffect, useMemo, useState } from "react";

const adminBookersApiPath = "/api/admin-bookers";
const adminRateSetupApiPath = "/api/admin-rate-setup";
const adminCompanyTravelerWriteApiPath = "/api/admin-company-traveler-crm-runtime-write-action";
const adminLegacyTravelersApiPath = "/api/admin-legacy-data/rest/v1/travelers";

type CustomerVerifiedIdentitiesEditorProps = {
  companyId: number;
  companyName: string;
};

type SafeIdentityTraveler = {
  booker_id?: number | null;
  booker_name?: string | null;
  company_id?: number | null;
  id?: number | null;
  traveler_name?: string | null;
};

type IdentityStatus = "loading" | "ready" | "saving" | "saved" | "error";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function positiveId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function comparableText(value: unknown) {
  return cleanText(value).toLocaleLowerCase("en-SG");
}

function identityFeedbackClass(status: IdentityStatus) {
  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  if (status === "saved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function safeIdentityError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("Verified ") || message.startsWith("That traveller")) {
    return message;
  }

  if (/admin|dispatcher|forbidden|session|boundary|blocked/i.test(message)) {
    return "Booker and Traveller saving requires the internal admin session. Nothing was changed.";
  }

  return "Booker and Traveller could not be saved safely. Reload this profile before trying again.";
}

export function CustomerVerifiedIdentitiesEditor({
  companyId,
  companyName,
}: CustomerVerifiedIdentitiesEditorProps) {
  const [status, setStatus] = useState<IdentityStatus>("loading");
  const [message, setMessage] = useState("Loading verified Bookers and Travellers...");
  const [travelers, setTravelers] = useState<SafeIdentityTraveler[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [bookerName, setBookerName] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerContact, setBookerContact] = useState("");
  const [travelerName, setTravelerName] = useState("");

  async function loadIdentities(options?: { afterSave?: boolean; silent?: boolean }) {
    const response = await fetch(adminRateSetupApiPath, {
      cache: "no-store",
      headers: {
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "GET",
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || result?.ok !== true || !Array.isArray(result?.travelers)) {
      throw new Error("Verified identity list could not be loaded safely.");
    }

    const exactCompanyTravelers = (result.travelers as SafeIdentityTraveler[]).filter(
      (traveler) => positiveId(traveler.company_id) === companyId,
    );
    setTravelers(exactCompanyTravelers);
    setIsOpen((current) => current || exactCompanyTravelers.length === 0);

    if (options?.afterSave) {
      setMessage("Saved and verified the Booker and Traveller for this company.");
      setStatus("saved");
    } else if (!options?.silent) {
      setMessage(
        exactCompanyTravelers.length > 0
          ? "Verified identities are available to Dispatch. The customer booking link uses them after verified access is created."
          : "No verified Booker or Traveller exists yet for this company.",
      );
      setStatus("ready");
    }

    return exactCompanyTravelers;
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await loadIdentities();
      } catch (error) {
        if (active) {
          setMessage(safeIdentityError(error));
          setStatus("error");
          setIsOpen(true);
        }
      }
    })();

    return () => {
      active = false;
    };
    // The company ID is the exact verified scope for this profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const identityRows = useMemo(() => {
    const grouped = new Map<string, { bookerName: string; travelers: string[] }>();

    for (const traveler of travelers) {
      const verifiedBookerId = positiveId(traveler.booker_id);
      const safeBookerName = cleanText(traveler.booker_name);
      const safeTravelerName = cleanText(traveler.traveler_name);

      if (!verifiedBookerId || !safeBookerName || !safeTravelerName) {
        continue;
      }

      const key = String(verifiedBookerId);
      const current = grouped.get(key) || { bookerName: safeBookerName, travelers: [] };

      if (!current.travelers.some((name) => comparableText(name) === comparableText(safeTravelerName))) {
        current.travelers.push(safeTravelerName);
      }

      grouped.set(key, current);
    }

    return Array.from(grouped.values());
  }, [travelers]);

  async function findOrCreateBooker() {
    const lookupParams = new URLSearchParams({
      booker_name: bookerName.trim(),
      company_id: String(companyId),
    });
    const lookupResponse = await fetch(`${adminBookersApiPath}?${lookupParams.toString()}`, {
      cache: "no-store",
      headers: {
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "GET",
    });
    const lookupResult = await lookupResponse.json().catch(() => null);

    if (!lookupResponse.ok || lookupResult?.ok !== true) {
      throw new Error("Verified Booker lookup failed safely.");
    }

    let booker = lookupResult.booker;

    if (!positiveId(booker?.id)) {
      const createResponse = await fetch(adminBookersApiPath, {
        body: JSON.stringify({
          booker_name: bookerName.trim(),
          company_id: companyId,
          email: bookerEmail.trim().toLowerCase() || null,
          phone: bookerContact.trim() || null,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const createResult = await createResponse.json().catch(() => null);

      if (!createResponse.ok || createResult?.ok !== true || !positiveId(createResult?.booker?.id)) {
        throw new Error("Verified Booker could not be created safely.");
      }

      booker = createResult.booker;
    } else {
      const savedEmail = cleanText(booker.email).toLowerCase();
      const savedPhone = cleanText(booker.phone);
      const requestedEmail = bookerEmail.trim().toLowerCase();
      const requestedPhone = bookerContact.trim();

      if ((savedEmail && requestedEmail && savedEmail !== requestedEmail) ||
          (savedPhone && requestedPhone && savedPhone !== requestedPhone)) {
        throw new Error("Verified Booker already exists with different contact details. Review the existing record first.");
      }

      // Existing Booker records are reused without broadening the protected Booker PATCH boundary.
    }

    if (positiveId(booker.company_id) !== companyId) {
      throw new Error("Verified Booker does not belong to this exact company.");
    }

    return positiveId(booker.id) as number;
  }

  async function saveBookerAndTraveler() {
    const safeBookerName = cleanText(bookerName);
    const safeTravelerName = cleanText(travelerName);

    if (!safeBookerName || !safeTravelerName) {
      setMessage("Booker / PA name and Traveller name are required.");
      setStatus("error");
      setIsOpen(true);
      return;
    }

    if (!window.confirm(
      `Save verified Booker ${safeBookerName} and Traveller ${safeTravelerName} for ${companyName}? They will become selectable in the existing Dispatch identity row. This does not change any saved booking, invoice, price, Calendar event, driver, payment, or message.`,
    )) {
      setMessage("Booker and Traveller save cancelled. Nothing was changed.");
      setStatus("ready");
      return;
    }

    setStatus("saving");
    setMessage("Saving the verified Booker and Traveller...");

    try {
      const freshTravelers = await loadIdentities({ silent: true });
      const matchingTraveler = freshTravelers.find(
        (traveler) =>
          positiveId(traveler.company_id) === companyId &&
          comparableText(traveler.traveler_name) === comparableText(safeTravelerName),
      );
      const existingLinkedBookerId = positiveId(matchingTraveler?.booker_id);
      const existingLinkedBookerName = cleanText(matchingTraveler?.booker_name);

      if (
        existingLinkedBookerId &&
        existingLinkedBookerName &&
        comparableText(existingLinkedBookerName) !== comparableText(safeBookerName)
      ) {
        throw new Error("That traveller is already linked to another verified Booker. Nothing was changed.");
      }

      const bookerId = await findOrCreateBooker();

      if (existingLinkedBookerId && existingLinkedBookerId !== bookerId) {
        throw new Error("That traveller is already linked to another verified Booker. Nothing was changed.");
      }

      let travelerId = positiveId(matchingTraveler?.id);

      if (!travelerId) {
        const createResponse = await fetch(adminCompanyTravelerWriteApiPath, {
          body: JSON.stringify({
            action_type: "traveler_create",
            booker_name: safeBookerName,
            company_id: companyId,
            traveler_name: safeTravelerName,
            ...(bookerContact.trim() ? { booker_contact: bookerContact.trim() } : {}),
            ...(bookerEmail.trim() ? { booker_email: bookerEmail.trim().toLowerCase() } : {}),
          }),
          headers: {
            "Content-Type": "application/json",
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "POST",
        });
        const createResult = await createResponse.json().catch(() => null);
        travelerId = positiveId(createResult?.record?.id);

        if (!createResponse.ok || createResult?.ok !== true || !travelerId ||
            positiveId(createResult?.record?.company_id) !== companyId) {
          throw new Error("Verified Traveller could not be created safely.");
        }
      }

      const linkParams = new URLSearchParams({
        id: `eq.${travelerId}`,
        select: "id,company_id,booker_id,traveler_name,booker_name,booker_contact,booker_email",
        single: "single",
      });
      const linkResponse = await fetch(`${adminLegacyTravelersApiPath}?${linkParams.toString()}`, {
        body: JSON.stringify({
          booker_id: bookerId,
          booker_name: safeBookerName,
          ...(bookerContact.trim() ? { booker_contact: bookerContact.trim() } : {}),
          ...(bookerEmail.trim() ? { booker_email: bookerEmail.trim().toLowerCase() } : {}),
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const linkedTraveler = await linkResponse.json().catch(() => null);

      if (!linkResponse.ok || positiveId(linkedTraveler?.id) !== travelerId ||
          positiveId(linkedTraveler?.company_id) !== companyId ||
          positiveId(linkedTraveler?.booker_id) !== bookerId) {
        throw new Error("Verified Traveller could not be linked to the exact Booker.");
      }

      const verifiedRows = await loadIdentities({ afterSave: true });
      const verified = verifiedRows.some(
        (traveler) =>
          positiveId(traveler.id) === travelerId &&
          positiveId(traveler.booker_id) === bookerId &&
          positiveId(traveler.company_id) === companyId,
      );

      if (!verified) {
        throw new Error("Verified Booker and Traveller were saved but could not be reloaded safely.");
      }

      setBookerName("");
      setBookerEmail("");
      setBookerContact("");
      setTravelerName("");
    } catch (error) {
      setMessage(safeIdentityError(error));
      setStatus("error");
      setIsOpen(true);
    }
  }

  return (
    <details
      className="mt-3 rounded-md border border-sky-200 bg-white"
      data-customer-verified-identities="true"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-900">
        Booker / PA & Travellers · {identityRows.length} verified Booker{identityRows.length === 1 ? "" : "s"}
      </summary>
      <div className="border-t border-sky-100 p-3">
        {identityRows.length > 0 ? (
          <div className="mb-3 grid gap-1.5" data-customer-verified-identity-rows="true">
            {identityRows.map((row) => (
              <div className="rounded-md bg-sky-50 px-2.5 py-2 text-xs text-slate-800" key={`${row.bookerName}-${row.travelers.join("|")}`}>
                <span className="font-bold">Booker / PA: {row.bookerName}</span>
                <span className="ml-2">Traveller: {row.travelers.join(", ")}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Booker / PA name
            <input className="min-h-9 rounded-md border border-slate-300 px-2 text-sm" data-customer-booker-name="true" disabled={status === "saving"} onChange={(event) => setBookerName(event.target.value)} value={bookerName} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Traveller name
            <input className="min-h-9 rounded-md border border-slate-300 px-2 text-sm" data-customer-traveler-name="true" disabled={status === "saving"} onChange={(event) => setTravelerName(event.target.value)} value={travelerName} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Booker email (optional)
            <input className="min-h-9 rounded-md border border-slate-300 px-2 text-sm" data-customer-booker-email="true" disabled={status === "saving"} onChange={(event) => setBookerEmail(event.target.value)} type="email" value={bookerEmail} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Booker contact (optional)
            <input className="min-h-9 rounded-md border border-slate-300 px-2 text-sm" data-customer-booker-contact="true" disabled={status === "saving"} onChange={(event) => setBookerContact(event.target.value)} value={bookerContact} />
          </label>
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={`rounded-md border px-2.5 py-2 text-xs font-semibold ${identityFeedbackClass(status)}`}>
            {message}
          </p>
          <button
            className="min-h-9 shrink-0 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white disabled:border-slate-300 disabled:bg-slate-300"
            data-customer-save-booker-traveler="true"
            disabled={status === "saving" || status === "loading"}
            onClick={saveBookerAndTraveler}
            type="button"
          >
            {status === "saving" ? "Saving" : "Save Booker + Traveller"}
          </button>
        </div>
      </div>
    </details>
  );
}
