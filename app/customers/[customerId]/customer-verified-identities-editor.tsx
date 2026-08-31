"use client";

import { useEffect, useMemo, useState } from "react";

const adminBookersApiPath = "/api/admin-bookers";
const adminRateSetupApiPath = "/api/admin-rate-setup";
const adminCompanyTravelerWriteApiPath = "/api/admin-company-traveler-crm-runtime-write-action";
const adminLegacyTravelersApiPath = "/api/admin-legacy-data/rest/v1/travelers";

type CustomerVerifiedIdentitiesEditorProps = {
  companyId: number;
  companyName: string;
  customerId: string;
};

type SafeIdentityTraveler = {
  booker_id?: number | null;
  booker_name?: string | null;
  company_id?: number | null;
  id?: number | null;
  traveler_name?: string | null;
};

type SafeIdentityBooker = {
  booker_name?: string | null;
  company_id?: number | null;
  customer_id?: number | null;
  email?: string | null;
  id?: number | null;
  phone?: string | null;
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

  if (
    message.startsWith("Verified ") ||
    message.startsWith("That traveller") ||
    message.startsWith("No approved ") ||
    message.startsWith("More than one ")
  ) {
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
  customerId,
}: CustomerVerifiedIdentitiesEditorProps) {
  const [status, setStatus] = useState<IdentityStatus>("loading");
  const [message, setMessage] = useState("Loading verified Bookers and Travellers...");
  const [exactCustomerBooker, setExactCustomerBooker] = useState<SafeIdentityBooker | null>(null);
  const [travelers, setTravelers] = useState<SafeIdentityTraveler[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [bookerName, setBookerName] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerContact, setBookerContact] = useState("");
  const [travelerName, setTravelerName] = useState("");
  const [editingBookerId, setEditingBookerId] = useState<number | null>(null);
  const [editingTravelerId, setEditingTravelerId] = useState<number | null>(null);

  async function loadIdentities(options?: { afterSave?: boolean; silent?: boolean }) {
    const response = await fetch(adminRateSetupApiPath, {
      cache: "no-store",
      headers: {
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "GET",
    });
    const result = await response.json().catch(() => null);

    if (
      !response.ok ||
      result?.ok !== true ||
      !Array.isArray(result?.bookers) ||
      !Array.isArray(result?.travelers)
    ) {
      throw new Error("Verified identity list could not be loaded safely.");
    }

    const exactCustomerBookers = (result.bookers as SafeIdentityBooker[]).filter(
      (booker) =>
        positiveId(booker.company_id) === companyId &&
        positiveId(booker.customer_id) === positiveId(customerId),
    );

    if (exactCustomerBookers.length === 0) {
      setExactCustomerBooker(null);
      setTravelers([]);
      setIsOpen(true);
      throw new Error(
        "No approved Company + Booker Customer Account is linked to this exact customer profile. Use the existing Dispatch Save + CRM account review; nothing was inferred or changed.",
      );
    }

    if (exactCustomerBookers.length !== 1) {
      setExactCustomerBooker(null);
      setTravelers([]);
      setIsOpen(true);
      throw new Error(
        "More than one Company + Booker Customer Account matched this exact customer profile. Nothing was changed.",
      );
    }

    const exactCustomerBooker = exactCustomerBookers[0];
    const exactCustomerTravelers = (result.travelers as SafeIdentityTraveler[]).filter(
      (traveler) =>
        positiveId(traveler.company_id) === companyId &&
        positiveId(traveler.booker_id) === positiveId(exactCustomerBooker.id),
    );
    setExactCustomerBooker(exactCustomerBooker);
    setTravelers(exactCustomerTravelers);
    setIsOpen((current) => current || exactCustomerTravelers.length === 0);

    if (options?.afterSave) {
      setMessage("Saved and verified the exact Customer Account Booker and Traveller.");
      setStatus("saved");
    } else if (!options?.silent) {
      setMessage(
        exactCustomerTravelers.length > 0
          ? "This exact Company + Booker Customer Account and its booking-only Travellers are available to Dispatch."
          : "This exact Company + Booker Customer Account has no saved Traveller yet.",
      );
      setStatus("ready");
    }

    return { booker: exactCustomerBooker, travelers: exactCustomerTravelers };
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
    // The customer and company IDs together are the exact verified scope for this profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, customerId]);

  const identityRows = useMemo(() => {
    return travelers.flatMap((traveler) => {
      const bookerId = positiveId(traveler.booker_id);
      const travelerId = positiveId(traveler.id);
      const safeBookerName = cleanText(traveler.booker_name);
      const safeTravelerName = cleanText(traveler.traveler_name);

      return bookerId && travelerId && safeBookerName && safeTravelerName
        ? [{ bookerId, bookerName: safeBookerName, travelerId, travelerName: safeTravelerName }]
        : [];
    });
  }, [travelers]);

  const verifiedBookerCount = exactCustomerBooker ? 1 : 0;

  async function loadExactBooker(bookerId: number) {
    const lookupParams = new URLSearchParams({ id: String(bookerId) });
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

    const booker = lookupResult.booker as SafeIdentityBooker | null;

    if (
      !booker ||
      !positiveId(booker.id) ||
      positiveId(booker.company_id) !== companyId ||
      positiveId(booker.customer_id) !== positiveId(customerId)
    ) {
      throw new Error("Verified Booker does not belong to this exact Customer Account.");
    }

    return booker;
  }

  async function startEditingIdentity(row: (typeof identityRows)[number]) {
    setStatus("loading");
    setMessage(`Loading ${row.bookerName} and ${row.travelerName}...`);
    setIsOpen(true);

    try {
      const booker = await loadExactBooker(row.bookerId);
      setEditingBookerId(row.bookerId);
      setEditingTravelerId(row.travelerId);
      setBookerName(cleanText(booker.booker_name));
      setBookerEmail(cleanText(booker.email).toLowerCase());
      setBookerContact(cleanText(booker.phone));
      setTravelerName(row.travelerName);
      setMessage("Edit this exact Booker and Traveller pair, then press Save changes.");
      setStatus("ready");
    } catch (error) {
      setMessage(safeIdentityError(error));
      setStatus("error");
    }
  }

  async function startAddingIdentity() {
    const bookerId = positiveId(exactCustomerBooker?.id);

    if (!bookerId) {
      setMessage(
        "No approved Company + Booker Customer Account is linked to this exact customer profile. Use the existing Dispatch Save + CRM account review; nothing was inferred or changed.",
      );
      setStatus("error");
      setIsOpen(true);
      return;
    }

    setStatus("loading");
    setMessage("Loading the exact Customer Account Booker before adding a Traveller...");
    setIsOpen(true);

    try {
      const booker = await loadExactBooker(bookerId);
      setEditingBookerId(bookerId);
      setEditingTravelerId(null);
      setBookerName(cleanText(booker.booker_name));
      setBookerEmail(cleanText(booker.email).toLowerCase());
      setBookerContact(cleanText(booker.phone));
      setTravelerName("");
      setMessage("Add one booking-only Traveller to this exact Company + Booker Customer Account.");
      setStatus("ready");
    } catch (error) {
      setMessage(safeIdentityError(error));
      setStatus("error");
    }
  }

  async function saveExactBooker(expectedBooker: SafeIdentityBooker) {
    const bookerId = positiveId(expectedBooker.id);

    if (
      !bookerId ||
      bookerId !== editingBookerId ||
      positiveId(expectedBooker.company_id) !== companyId ||
      positiveId(expectedBooker.customer_id) !== positiveId(customerId)
    ) {
      throw new Error("Verified Booker changed while this exact customer profile was open. Nothing was changed.");
    }

    let booker = await loadExactBooker(bookerId);
    const savedEmail = cleanText(booker.email).toLowerCase();
    const savedPhone = cleanText(booker.phone);
    const requestedEmail = bookerEmail.trim().toLowerCase();
    const requestedPhone = bookerContact.trim();
    const nextBookerName = bookerName.trim();

    if (
      comparableText(booker.booker_name) !== comparableText(nextBookerName) ||
      savedEmail !== requestedEmail ||
      savedPhone !== requestedPhone
    ) {
      const updateResponse = await fetch(adminBookersApiPath, {
        body: JSON.stringify({
          booker_name: nextBookerName,
          email: requestedEmail || null,
          id: bookerId,
          phone: requestedPhone || null,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const updateResult = await updateResponse.json().catch(() => null);

      if (
        !updateResponse.ok ||
        updateResult?.ok !== true ||
        positiveId(updateResult?.booker?.id) !== bookerId ||
        positiveId(updateResult?.booker?.company_id) !== companyId ||
        positiveId(updateResult?.booker?.customer_id) !== positiveId(customerId)
      ) {
        throw new Error("Verified Booker changes could not be saved safely.");
      }

      booker = updateResult.booker;
    }

    if (
      positiveId(booker.id) !== bookerId ||
      positiveId(booker.company_id) !== companyId ||
      positiveId(booker.customer_id) !== positiveId(customerId)
    ) {
      throw new Error("Verified Booker does not belong to this exact Customer Account.");
    }

    return bookerId;
  }

  async function saveBookerAndTraveler() {
    const safeBookerName = cleanText(bookerName);
    const safeTravelerName = cleanText(travelerName);
    const expectedBookerId = positiveId(exactCustomerBooker?.id);

    if (!expectedBookerId || editingBookerId !== expectedBookerId) {
      setMessage(
        "No approved Company + Booker Customer Account is ready for this exact customer profile. Nothing was changed.",
      );
      setStatus("error");
      setIsOpen(true);
      return;
    }

    if (!safeBookerName || !safeTravelerName) {
      setMessage("Booker / PA name and Traveller name are required.");
      setStatus("error");
      setIsOpen(true);
      return;
    }

    const actionLabel = editingTravelerId ? "Update" : "Add";

    if (!window.confirm(
      `${actionLabel} verified Booker ${safeBookerName} and Traveller ${safeTravelerName} for ${companyName}? Booker details will stay consistent on all Travellers already linked to this exact Booker; the Traveller name changes only this exact Traveller. They will become selectable in the existing Dispatch identity row. This does not change any saved booking, invoice, price, Calendar event, driver, payment, or message.`,
    )) {
      setMessage("Booker and Traveller save cancelled. Nothing was changed.");
      setStatus("ready");
      return;
    }

    setStatus("saving");
    setMessage("Saving the verified Booker and Traveller...");

    try {
      const freshIdentity = await loadIdentities({ silent: true });
      const freshTravelers = freshIdentity.travelers;
      const matchingTraveler = editingTravelerId
        ? freshTravelers.find(
            (traveler) =>
              positiveId(traveler.id) === editingTravelerId &&
              positiveId(traveler.company_id) === companyId &&
              positiveId(traveler.booker_id) === positiveId(freshIdentity.booker.id),
          )
        : freshTravelers.find(
            (traveler) =>
              positiveId(traveler.company_id) === companyId &&
              positiveId(traveler.booker_id) === positiveId(freshIdentity.booker.id) &&
              comparableText(traveler.traveler_name) === comparableText(safeTravelerName),
          );

      if (editingTravelerId && !matchingTraveler) {
        throw new Error("Verified Traveller could not be reloaded safely.");
      }

      const existingLinkedBookerId = positiveId(matchingTraveler?.booker_id);
      const existingLinkedBookerName = cleanText(matchingTraveler?.booker_name);

      if (
        !editingTravelerId &&
        existingLinkedBookerId &&
        existingLinkedBookerName &&
        comparableText(existingLinkedBookerName) !== comparableText(safeBookerName)
      ) {
        throw new Error("That traveller is already linked to another verified Booker. Nothing was changed.");
      }

      const bookerId = await saveExactBooker(freshIdentity.booker);

      if (bookerId !== editingBookerId) {
        throw new Error("Verified Booker changed while this profile was open. Nothing was changed.");
      }

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
      const bookerSnapshotPayload = editingTravelerId
        ? {
            booker_contact: bookerContact.trim() || null,
            booker_email: bookerEmail.trim().toLowerCase() || null,
          }
        : {
            ...(bookerContact.trim() ? { booker_contact: bookerContact.trim() } : {}),
            ...(bookerEmail.trim() ? { booker_email: bookerEmail.trim().toLowerCase() } : {}),
          };
      const linkResponse = await fetch(`${adminLegacyTravelersApiPath}?${linkParams.toString()}`, {
        body: JSON.stringify({
          booker_id: bookerId,
          booker_name: safeBookerName,
          traveler_name: safeTravelerName,
          ...bookerSnapshotPayload,
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
          positiveId(linkedTraveler?.booker_id) !== bookerId ||
          comparableText(linkedTraveler?.traveler_name) !== comparableText(safeTravelerName) ||
          comparableText(linkedTraveler?.booker_name) !== comparableText(safeBookerName)) {
        throw new Error("Verified Traveller could not be linked to the exact Booker.");
      }

      const linkedBookerParams = new URLSearchParams({
        booker_id: `eq.${bookerId}`,
        company_id: `eq.${companyId}`,
        select: "id,company_id,booker_id,traveler_name,booker_name,booker_contact,booker_email",
      });
      const linkedBookerResponse = await fetch(
        `${adminLegacyTravelersApiPath}?${linkedBookerParams.toString()}`,
        {
          body: JSON.stringify({
            booker_name: safeBookerName,
            ...bookerSnapshotPayload,
          }),
          headers: {
            "Content-Type": "application/json",
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "PATCH",
        },
      );
      const linkedBookerTravelers = await linkedBookerResponse.json().catch(() => null);

      if (!linkedBookerResponse.ok || !Array.isArray(linkedBookerTravelers) ||
          !linkedBookerTravelers.some(
            (traveler) =>
              positiveId(traveler?.id) === travelerId &&
              positiveId(traveler?.company_id) === companyId &&
              positiveId(traveler?.booker_id) === bookerId &&
              comparableText(traveler?.booker_name) === comparableText(safeBookerName),
          )) {
        throw new Error("Verified Booker details could not be synchronized safely.");
      }

      const verifiedIdentity = await loadIdentities({ afterSave: true });
      const verified = verifiedIdentity.travelers.some(
        (traveler) =>
          positiveId(traveler.id) === travelerId &&
          positiveId(traveler.booker_id) === bookerId &&
          positiveId(traveler.company_id) === companyId &&
          comparableText(traveler.traveler_name) === comparableText(safeTravelerName) &&
          comparableText(traveler.booker_name) === comparableText(safeBookerName),
      );

      if (!verified) {
        throw new Error("Verified Booker and Traveller were saved but could not be reloaded safely.");
      }

      const verifiedBooker = await loadExactBooker(bookerId);
      const verifiedEmail = cleanText(verifiedBooker.email).toLowerCase();
      const verifiedPhone = cleanText(verifiedBooker.phone);

      if (
        comparableText(verifiedBooker.booker_name) !== comparableText(safeBookerName) ||
        (bookerEmail.trim() && verifiedEmail !== bookerEmail.trim().toLowerCase()) ||
        (bookerContact.trim() && verifiedPhone !== bookerContact.trim())
      ) {
        throw new Error("Verified Booker and Traveller were saved but could not be reloaded safely.");
      }

      setEditingBookerId(bookerId);
      setEditingTravelerId(travelerId);
      setBookerName(cleanText(verifiedBooker.booker_name));
      setBookerEmail(verifiedEmail);
      setBookerContact(verifiedPhone);
      setTravelerName(safeTravelerName);
      setMessage("Saved, reloaded, and verified this exact Booker and Traveller pair.");
      setStatus("saved");
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
        Booker / PA & Travellers · {verifiedBookerCount} verified Booker{verifiedBookerCount === 1 ? "" : "s"}
      </summary>
      <div className="border-t border-sky-100 p-3">
        {identityRows.length > 0 ? (
          <div className="mb-3 grid gap-1.5" data-customer-verified-identity-rows="true">
            {identityRows.map((row) => (
              <div className="flex flex-col gap-2 rounded-md bg-sky-50 px-2.5 py-2 text-xs text-slate-800 sm:flex-row sm:items-center sm:justify-between" key={`${row.bookerId}-${row.travelerId}`}>
                <div>
                  <span className="font-bold">Booker / PA: {row.bookerName}</span>
                  <span className="ml-2">Traveller: {row.travelerName}</span>
                </div>
                <button
                  className="min-h-8 rounded-md border border-sky-300 bg-white px-2.5 font-bold text-slate-900 disabled:text-slate-400"
                  data-customer-edit-booker-traveler={`${row.bookerId}-${row.travelerId}`}
                  disabled={status === "saving" || status === "loading"}
                  onClick={() => void startEditingIdentity(row)}
                  type="button"
                >
                  Edit this pair
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {exactCustomerBooker ? (
          <>
            <button
              className="mb-3 text-xs font-bold text-sky-900 underline underline-offset-2"
              data-customer-add-booker-traveler="true"
              disabled={status === "saving" || status === "loading"}
              onClick={() => void startAddingIdentity()}
              type="button"
            >
              Add Traveller
            </button>
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
          </>
        ) : null}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className={`rounded-md border px-2.5 py-2 text-xs font-semibold ${identityFeedbackClass(status)}`}>
            {message}
          </p>
          {exactCustomerBooker ? (
            <button
              className="min-h-9 shrink-0 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white disabled:border-slate-300 disabled:bg-slate-300"
              data-customer-save-booker-traveler="true"
              disabled={status === "saving" || status === "loading" || !editingBookerId}
              onClick={saveBookerAndTraveler}
              type="button"
            >
              {status === "saving"
                ? "Saving"
                : editingTravelerId
                  ? "Save changes"
                  : "Add Traveller"}
            </button>
          ) : null}
        </div>
      </div>
    </details>
  );
}
