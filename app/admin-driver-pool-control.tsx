"use client";

import { useCallback, useEffect, useState } from "react";

type PoolDriver = { id: number; driver_name: string | null; plate_number: string | null; vehicle_type: string | null; availability_status: string | null };
type PoolResponse = { driver_id: number; driver_name: string; plate_number: string; vehicle_type: string; status: "pending" | "available" | "declined" | "accepted" | "closed" };

export type DriverPoolAdminOffer = {
  selection_mode?: "admin" | "first_accept";
  audience?: "selected" | "wider";
  responses?: PoolResponse[];
  closes_at: string;
  offer_key: string;
  offer_payout_sgd: number;
  offer_status: "open" | "assigned" | "cancelled" | "closed" | "expired";
  provider_accepted_driver_count?: number;
  provider_attempted_driver_count?: number;
  push_target_count: number;
  recipient_count: number;
  safe_vehicle_label?: string | null;
  updated_at: string;
};

export type AssignedDriverPoolAdminOffer = DriverPoolAdminOffer & {
  booking_reference: string;
};

type AdminDriverPoolAttentionItem = DriverPoolAdminOffer & {
  attention_status: "accepted_link_pending" | "open";
  booking_reference: string;
  pickup_at: string;
  public_booking_reference: string;
};

type Props = {
  drivers: PoolDriver[];
  savedVehicle: string;
  bookingReference: string;
  disabled: boolean;
  eligible: boolean;
  expectedUpdatedAt: string;
  requiresExplicitPayout: boolean;
  showPleaseAssignDriver: boolean;
  suggestedPayout: number;
  onLoadBooking: (bookingReference: string, reviewResponses?: boolean) => Promise<void>;
  onAssignedOfferChange?: (offer: AssignedDriverPoolAdminOffer | null) => void;
};

const headers = { "Content-Type": "application/json", "x-prestige-admin-purpose": "admin-booking-persistence" };

function pickupLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-SG", {
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        month: "short",
        timeZone: "Asia/Singapore",
      }).format(date)
    : "Pickup time unavailable";
}

export function AdminDriverPoolControl({ drivers, savedVehicle, bookingReference, disabled, eligible, expectedUpdatedAt, onAssignedOfferChange, onLoadBooking, requiresExplicitPayout, showPleaseAssignDriver, suggestedPayout }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [serverEligible, setServerEligible] = useState(false);
  const [offer, setOffer] = useState<DriverPoolAdminOffer | null>(null);
  const [payout, setPayout] = useState(!requiresExplicitPayout && suggestedPayout > 0 ? suggestedPayout.toFixed(2) : "");
  const [vehicleRequirement, setVehicleRequirement] = useState(["E / AVF", "AVF", "S", "VVV", "COMBI"].includes(savedVehicle) ? savedVehicle : "");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [driverSearch, setDriverSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [attentionEnabled, setAttentionEnabled] = useState(false);
  const [attentionFeedback, setAttentionFeedback] = useState("");
  const [attentionHasMore, setAttentionHasMore] = useState(false);
  const [attentionItems, setAttentionItems] = useState<AdminDriverPoolAttentionItem[]>([]);
  const [attentionLoadingPage, setAttentionLoadingPage] = useState(0);
  const [attentionPage, setAttentionPage] = useState(1);
  const [attentionWorkingKey, setAttentionWorkingKey] = useState("");

  const load = useCallback(async () => {
    if (!bookingReference) return;
    try {
      const response = await fetch(`/api/admin-driver-job-bid-offers?booking_reference=${encodeURIComponent(bookingReference)}`, { cache: "no-store", headers });
      const result = await response.json() as { eligible?: boolean; enabled?: boolean; offer?: DriverPoolAdminOffer | null };
      if (response.ok) {
        setEnabled(result.enabled === true);
        setServerEligible(result.eligible === true);
        setOffer(result.offer || null);
      }
      else { setFeedback("Driver Pool could not refresh. Reload before acting."); }
    } catch { setFeedback("Driver Pool could not refresh. Reload before acting."); }
  }, [bookingReference]);

  const loadAttention = useCallback(async (page: number, quiet = false) => {
    if (!quiet) setAttentionLoadingPage(page);
    try {
      const response = await fetch(`/api/admin-driver-job-bid-offers?scope=attention&page=${page}&limit=20`, {
        cache: "no-store",
        headers,
      });
      const result = await response.json() as {
        enabled?: boolean;
        error?: string;
        has_more?: boolean;
        items?: AdminDriverPoolAttentionItem[];
        ok?: boolean;
        page?: number;
      };
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "Driver Pool pending jobs could not be loaded.");
      }
      const nextItems = Array.isArray(result.items) ? result.items : [];
      setAttentionEnabled(result.enabled === true);
      setAttentionHasMore(result.has_more === true);
      setAttentionPage(page);
      setAttentionItems((current) => {
        const combined = page === 1 ? nextItems : [...current, ...nextItems];
        return [...new Map(combined.map((item) => [item.offer_key, item])).values()];
      });
      if (!quiet) setAttentionFeedback("");
    } catch (error) {
      if (!quiet) {
        setAttentionFeedback(error instanceof Error ? error.message : "Driver Pool pending jobs could not be loaded.");
      }
    } finally {
      if (!quiet) setAttentionLoadingPage(0);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFeedback("");
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expectedUpdatedAt, load]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadAttention(1), 0);
    return () => window.clearTimeout(timer);
  }, [loadAttention]);
  useEffect(() => {
    if (offer?.offer_status !== "open") return;
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load, offer?.offer_status]);
  useEffect(() => {
    if (!attentionEnabled || attentionItems.length === 0 || attentionPage !== 1) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAttention(1, true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [attentionEnabled, attentionItems.length, attentionPage, loadAttention]);
  useEffect(() => {
    onAssignedOfferChange?.(
      offer?.offer_status === "assigned"
        ? { ...offer, booking_reference: bookingReference }
        : null,
    );
    return () => onAssignedOfferChange?.(null);
  }, [bookingReference, offer, onAssignedOfferChange]);

  const offerNeedsAttention = offer?.offer_status === "open" || offer?.offer_status === "assigned";
  const showExactControl = enabled && ((eligible && serverEligible) || offerNeedsAttention);
  if (!showExactControl && !attentionEnabled && !attentionFeedback) return null;

  async function publish() {
    if (!vehicleRequirement) { setFeedback("Choose the Pool vehicle type."); return; }
    if (selectedIds.length < 1 || selectedIds.length > 5) { setFeedback("Select 1–5 drivers."); return; }
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin-driver-job-bid-offers", {
        body: JSON.stringify({ booking_reference: bookingReference, expected_updated_at: expectedUpdatedAt,
          idempotency_key: crypto.randomUUID(), offer_payout_sgd: Number(payout), vehicle_requirement: vehicleRequirement, selected_driver_ids: selectedIds }), headers, method: "POST",
      });
      const result = await response.json() as { error?: string; offer?: DriverPoolAdminOffer; ok?: boolean };
      if (!response.ok || result.ok !== true || !result.offer) throw new Error(result.error || "Offer was not sent.");
      setOffer(result.offer);
      const attempted = result.offer.provider_attempted_driver_count || 0;
      const accepted = result.offer.provider_accepted_driver_count || 0;
      setFeedback(attempted > 0
        ? `${accepted}/${attempted} Drivers had a push request accepted by provider; delivery not confirmed.`
        : "Offer published. No Driver device push was attempted.");
      await load();
      await loadAttention(1);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Offer was not sent."); }
    finally { setBusy(false); }
  }

  async function selectOrWiden(action: "award" | "widen", driverId?: number) {
    if (!offer || busy || offer.offer_status !== "open") return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin-driver-job-bid-offers", {
        method: "PATCH", headers,
        body: JSON.stringify({ action, offer_key: offer.offer_key, expected_updated_at: offer.updated_at,
          idempotency_key: crypto.randomUUID(), ...(action === "award" ? { driver_id: driverId } : {
            booking_reference: bookingReference, offer_payout_sgd: offer.offer_payout_sgd, vehicle_requirement: offer.safe_vehicle_label,
          }) }),
      });
      const result = await response.json() as { ok?: boolean; accepted?: boolean; error?: string };
      if (!response.ok || result.ok !== true || (action === "award" && result.accepted !== true)) throw new Error(result.error || "Driver Pool action was not confirmed. Refresh to review.");
      await load();
      await loadAttention(1);
      if (action === "award") {
        setFeedback("Driver assigned. Create the Driver Job Link when ready.");
        await onLoadBooking(bookingReference);
      } else setFeedback("Offered to the wider pool. Admin still chooses the winner.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Driver Pool action was not confirmed. Refresh to review.");
      await load();
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!offer) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin-driver-job-bid-offers", {
        body: JSON.stringify({ offer_key: offer.offer_key, expected_updated_at: offer.updated_at }), headers, method: "PATCH",
      });
      const result = await response.json() as { error?: string; offer?: DriverPoolAdminOffer; ok?: boolean };
      if (!response.ok || result.ok !== true || !result.offer) throw new Error(result.error || "Offer was not cancelled.");
      setOffer(result.offer); setFeedback("Offer cancelled. Booking remains active.");
      await loadAttention(1, true);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Offer was not cancelled."); }
    finally { setBusy(false); }
  }

  async function cancelPendingOffer(item: AdminDriverPoolAttentionItem) {
    if (item.attention_status !== "open" || attentionWorkingKey) return;
    setAttentionWorkingKey(item.offer_key);
    setAttentionFeedback("");
    try {
      const response = await fetch("/api/admin-driver-job-bid-offers", {
        body: JSON.stringify({ offer_key: item.offer_key, expected_updated_at: item.updated_at }),
        headers,
        method: "PATCH",
      });
      const result = await response.json() as { error?: string; offer?: DriverPoolAdminOffer; ok?: boolean };
      if (!response.ok || result.ok !== true || !result.offer) {
        throw new Error(result.error || "Offer was not cancelled.");
      }
      if (item.booking_reference === bookingReference) setOffer(result.offer);
      setAttentionFeedback(`Job ${item.public_booking_reference} offer cancelled. Booking remains active.`);
      await loadAttention(1, true);
    } catch (error) {
      setAttentionFeedback(error instanceof Error ? error.message : "Offer was not cancelled.");
    } finally {
      setAttentionWorkingKey("");
    }
  }

  async function openPendingBooking(item: AdminDriverPoolAttentionItem) {
    if (attentionWorkingKey) return;
    setAttentionWorkingKey(item.offer_key);
    setAttentionFeedback("");
    try {
      await onLoadBooking(item.booking_reference, item.selection_mode === "admin" && item.attention_status === "open");
    } catch (error) {
      setAttentionFeedback(error instanceof Error ? error.message : `Job ${item.public_booking_reference} could not be loaded.`);
    } finally {
      setAttentionWorkingKey("");
    }
  }

  return (
    <div className="mt-2 border-t border-sky-200 pt-2">
      {showExactControl ? (
        <div className="flex flex-wrap items-end gap-2" data-driver-pool-control={offer?.offer_status || "ready"}>
          {offer?.offer_status === "open" ? (
            <>
              <span className="text-xs font-semibold text-sky-950">{offer.selection_mode === "admin" ? offer.audience === "selected" ? "Selected group" : "Wider pool" : "Pool open"} · {offer.safe_vehicle_label || "Vehicle TBC"} · SGD {offer.offer_payout_sgd.toFixed(2)} · {offer.recipient_count} eligible Drivers · {Math.min(offer.push_target_count, offer.recipient_count)} push-capable Drivers · {Math.max(0, offer.recipient_count - offer.push_target_count)} app-only Drivers</span>
              {offer.selection_mode === "admin" ? (
                <div className="w-full space-y-1" data-driver-pool-responses="true">
                  <p className="text-xs font-semibold text-sky-950">Responses · choose one Available driver</p>
                  <div className="max-h-48 overflow-y-auto rounded border border-sky-200 bg-white">
                    {(offer.responses || []).map((driver) => (
                      <div className="flex items-center gap-2 border-b border-sky-100 px-2 py-1 text-xs last:border-0" key={driver.driver_id}>
                        <span className="min-w-0 flex-1 break-words">{driver.driver_name} · {driver.vehicle_type} · {driver.plate_number}</span>
                        <span>{driver.status === "available" ? "Available" : driver.status === "pending" ? "Waiting" : driver.status === "declined" ? "Declined" : "Closed"}</span>
                        {driver.status === "available" ? <button className="h-8 rounded bg-sky-950 px-3 font-semibold text-white disabled:bg-slate-400" disabled={busy || disabled} onClick={() => void selectOrWiden("award", driver.driver_id)} type="button">Assign</button> : null}
                      </div>
                    ))}
                    {!offer.responses ? <p className="p-2 text-xs">Refreshing responses…</p> : null}
                  </div>
                  {offer.audience === "selected" && offer.responses && !offer.responses.some((driver) => driver.status === "available") ?
                    <button className="h-8 rounded border border-sky-300 bg-white px-3 text-xs font-semibold" disabled={busy || disabled} onClick={() => void selectOrWiden("widen")} type="button">Offer to wider pool</button> : null}
                </div>
              ) : null}
              <button className="h-8 rounded-md border border-sky-300 bg-white px-2.5 text-xs font-semibold text-sky-900 disabled:text-slate-400" disabled={busy} onClick={() => void cancel()} type="button">{busy ? "Cancelling…" : "Cancel Offer"}</button>
            </>
          ) : offer?.offer_status === "assigned" ? (
            <span className="text-xs font-semibold text-emerald-800">Accepted · Driver assigned. Create the Driver Job Link when ready.</span>
          ) : (
            <>
              <div className="w-full space-y-1" data-driver-pool-selected-drivers="true">
                <label className="text-xs font-semibold text-slate-700">Select drivers · {selectedIds.length}/5
                  <input aria-label="Search Pool drivers" className="ml-2 h-8 rounded border border-sky-300 px-2 text-xs" onChange={(event) => setDriverSearch(event.target.value)} placeholder="Name or plate" value={driverSearch} />
                </label>
                <div className="max-h-40 overflow-y-auto rounded border border-sky-200 bg-white">
                  {drivers.filter((driver) => driver.availability_status?.trim().toLowerCase() === "available" &&
                    `${driver.driver_name || ""} ${driver.plate_number || ""}`.toLowerCase().includes(driverSearch.trim().toLowerCase())).map((driver) => (
                    <label className="flex min-h-8 items-center gap-2 border-b border-sky-100 px-2 py-1 text-xs last:border-0" key={driver.id}>
                      <input type="checkbox" checked={selectedIds.includes(driver.id)} disabled={busy || disabled || (!selectedIds.includes(driver.id) && selectedIds.length >= 5)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, driver.id].slice(0, 5) : current.filter((id) => id !== driver.id))} />
                      <span className="break-words">{driver.driver_name || "Unnamed driver"} · {driver.vehicle_type || "Vehicle unavailable"} · {driver.plate_number || "Plate unavailable"}</span>
                    </label>
                  ))}
                  {!drivers.length ? <p className="p-2 text-xs text-slate-500">Use Load Drivers for Assignment above.</p> : null}
                </div>
              </div>
              <label className="text-xs font-semibold text-slate-700">Pool vehicle
                <select aria-label="Driver Pool vehicle type" className="ml-2 h-8 rounded-md border border-sky-300 bg-white px-2 text-sm" disabled={busy || disabled} onChange={(event) => setVehicleRequirement(event.target.value)} value={vehicleRequirement}>
                  <option value="">Choose vehicle</option>
                  <option value="E / AVF">E / AVF</option>
                  <option value="AVF">AVF</option>
                  <option value="S">S</option>
                  <option value="VVV">VVV</option>
                  <option value="COMBI">Combi</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">Pool offer total SGD
                <input aria-label="Driver Pool offer payout in SGD" className="ml-2 h-8 w-28 rounded-md border border-sky-300 bg-white px-2 text-sm" min="0.01" onChange={(event) => setPayout(event.target.value)} step="0.01" type="number" value={payout} />
              </label>
              <button className="h-8 rounded-md bg-sky-950 px-3 text-xs font-semibold text-white disabled:bg-slate-400" disabled={busy || disabled || selectedIds.length < 1 || selectedIds.length > 5 || !vehicleRequirement || !expectedUpdatedAt || !(Number(payout) > 0)} onClick={() => void publish()} type="button">{busy ? "Sending…" : "Send to selected drivers"}</button>
              {showPleaseAssignDriver ? (
                <span className="text-xs font-semibold text-emerald-800">Please assign driver.</span>
              ) : null}
            </>
          )}
          {feedback ? <span className="text-xs font-semibold text-slate-600" role="status">{feedback}</span> : null}
        </div>
      ) : null}

      {attentionEnabled || attentionFeedback ? (
        <div className="mt-2 border-t border-sky-200 pt-2" data-admin-driver-pool-pending-list="true">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-sky-950">Driver Pool pending</span>
            <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-600 ring-1 ring-sky-200">
              {attentionItems.length}{attentionHasMore ? "+" : ""}
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto rounded-md border border-sky-200 bg-white">
            {attentionItems.map((item) => {
              const working = attentionWorkingKey === item.offer_key;
              return (
                <div className="flex min-h-10 items-center gap-2 border-b border-sky-100 px-2 py-1 last:border-b-0" data-admin-driver-pool-pending-row={item.public_booking_reference} key={item.offer_key}>
                  <button className="min-w-0 flex-1 text-left text-xs disabled:text-slate-400" disabled={Boolean(attentionWorkingKey)} onClick={() => void openPendingBooking(item)} type="button">
                    <span className="font-semibold text-slate-950">Job {item.public_booking_reference}</span>
                    <span className="ml-2 text-slate-500">{pickupLabel(item.pickup_at)}</span>
                    <span className={`ml-2 font-semibold ${item.attention_status === "open" ? "text-sky-800" : "text-emerald-800"}`}>
                      {item.attention_status === "open" ? `${item.selection_mode === "admin" ? item.audience === "selected" ? "Selected group" : "Wider pool" : "Pool open"} · SGD ${item.offer_payout_sgd.toFixed(2)} · View responses` : "Accepted · Job Link pending"}
                    </span>
                  </button>
                  {item.attention_status === "open" ? (
                    <button className="h-7 shrink-0 rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 disabled:text-slate-400" disabled={Boolean(attentionWorkingKey)} onClick={() => void cancelPendingOffer(item)} type="button">
                      {working ? "Cancelling…" : "Cancel Offer"}
                    </button>
                  ) : (
                    <button className="h-7 shrink-0 rounded-md border border-sky-300 bg-white px-2 text-xs font-semibold text-sky-900 disabled:text-slate-400" disabled={Boolean(attentionWorkingKey)} onClick={() => void openPendingBooking(item)} type="button">
                      {working ? "Loading…" : "Load Job"}
                    </button>
                  )}
                </div>
              );
            })}
            {attentionItems.length === 0 && attentionLoadingPage === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-500">No Driver Pool jobs pending.</p>
            ) : null}
            {attentionLoadingPage === 1 ? <p className="px-2 py-2 text-xs text-slate-500">Loading…</p> : null}
          </div>
          {attentionHasMore ? (
            <button className="mt-1 h-7 rounded-md border border-sky-300 bg-white px-2 text-xs font-semibold text-sky-900 disabled:text-slate-400" disabled={attentionLoadingPage > 0 || Boolean(attentionWorkingKey)} onClick={() => void loadAttention(attentionPage + 1)} type="button">
              {attentionLoadingPage > 1 ? "Loading…" : "Load more"}
            </button>
          ) : null}
          {attentionFeedback ? <p className="mt-1 text-xs font-semibold text-slate-600" role="status">{attentionFeedback}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
