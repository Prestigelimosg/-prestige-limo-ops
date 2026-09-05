"use client";

import { useCallback, useEffect, useState } from "react";

export type DriverPoolAdminOffer = {
  closes_at: string;
  offer_key: string;
  offer_payout_sgd: number;
  offer_status: "open" | "assigned" | "cancelled" | "closed" | "expired";
  provider_accepted_driver_count?: number;
  provider_attempted_driver_count?: number;
  push_target_count: number;
  recipient_count: number;
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
  bookingReference: string;
  disabled: boolean;
  eligible: boolean;
  expectedUpdatedAt: string;
  requiresExplicitPayout: boolean;
  showPleaseAssignDriver: boolean;
  suggestedPayout: number;
  onLoadBooking: (bookingReference: string) => Promise<void>;
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

export function AdminDriverPoolControl({ bookingReference, disabled, eligible, expectedUpdatedAt, onAssignedOfferChange, onLoadBooking, requiresExplicitPayout, showPleaseAssignDriver, suggestedPayout }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [serverEligible, setServerEligible] = useState(false);
  const [offer, setOffer] = useState<DriverPoolAdminOffer | null>(null);
  const [payout, setPayout] = useState(!requiresExplicitPayout && suggestedPayout > 0 ? suggestedPayout.toFixed(2) : "");
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
    } catch { /* Feature remains quietly unavailable. */ }
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
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin-driver-job-bid-offers", {
        body: JSON.stringify({ booking_reference: bookingReference, expected_updated_at: expectedUpdatedAt,
          idempotency_key: crypto.randomUUID(), offer_payout_sgd: Number(payout) }), headers, method: "POST",
      });
      const result = await response.json() as { error?: string; offer?: DriverPoolAdminOffer; ok?: boolean };
      if (!response.ok || result.ok !== true || !result.offer) throw new Error(result.error || "Offer was not sent.");
      setOffer(result.offer);
      const attempted = result.offer.provider_attempted_driver_count || 0;
      const accepted = result.offer.provider_accepted_driver_count || 0;
      setFeedback(attempted > 0
        ? `${accepted}/${attempted} Drivers had a push request accepted by provider; delivery not confirmed.`
        : "Offer published. No Driver device push was attempted.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Offer was not sent."); }
    finally { setBusy(false); }
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
      await onLoadBooking(item.booking_reference);
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
              <span className="text-xs font-semibold text-sky-950">Pool open · SGD {offer.offer_payout_sgd.toFixed(2)} · {offer.recipient_count} eligible Drivers · {Math.min(offer.push_target_count, offer.recipient_count)} push-capable Drivers · {Math.max(0, offer.recipient_count - offer.push_target_count)} app-only Drivers</span>
              <button className="h-8 rounded-md border border-sky-300 bg-white px-2.5 text-xs font-semibold text-sky-900 disabled:text-slate-400" disabled={busy} onClick={() => void cancel()} type="button">{busy ? "Cancelling…" : "Cancel Offer"}</button>
            </>
          ) : offer?.offer_status === "assigned" ? (
            <span className="text-xs font-semibold text-emerald-800">Accepted · Driver assigned. Create the Driver Job Link when ready.</span>
          ) : (
            <>
              <label className="text-xs font-semibold text-slate-700">Pool offer total SGD
                <input aria-label="Driver Pool offer payout in SGD" className="ml-2 h-8 w-28 rounded-md border border-sky-300 bg-white px-2 text-sm" min="0.01" onChange={(event) => setPayout(event.target.value)} step="0.01" type="number" value={payout} />
              </label>
              <button className="h-8 rounded-md bg-sky-950 px-3 text-xs font-semibold text-white disabled:bg-slate-400" disabled={busy || disabled || !expectedUpdatedAt || !(Number(payout) > 0)} onClick={() => void publish()} type="button">{busy ? "Sending…" : "Send to Driver Pool"}</button>
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
                      {item.attention_status === "open" ? `Pool open · SGD ${item.offer_payout_sgd.toFixed(2)}` : "Accepted · Job Link pending"}
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
