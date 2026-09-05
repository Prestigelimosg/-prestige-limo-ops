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

type Props = {
  bookingReference: string;
  disabled: boolean;
  eligible: boolean;
  expectedUpdatedAt: string;
  requiresExplicitPayout: boolean;
  showPleaseAssignDriver: boolean;
  suggestedPayout: number;
  onAssignedOfferChange?: (offer: AssignedDriverPoolAdminOffer | null) => void;
};

const headers = { "Content-Type": "application/json", "x-prestige-admin-purpose": "admin-booking-persistence" };

export function AdminDriverPoolControl({ bookingReference, disabled, eligible, expectedUpdatedAt, onAssignedOfferChange, requiresExplicitPayout, showPleaseAssignDriver, suggestedPayout }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [serverEligible, setServerEligible] = useState(false);
  const [offer, setOffer] = useState<DriverPoolAdminOffer | null>(null);
  const [payout, setPayout] = useState(!requiresExplicitPayout && suggestedPayout > 0 ? suggestedPayout.toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFeedback("");
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [expectedUpdatedAt, load]);
  useEffect(() => {
    if (offer?.offer_status !== "open") return;
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [load, offer?.offer_status]);
  useEffect(() => {
    onAssignedOfferChange?.(
      offer?.offer_status === "assigned"
        ? { ...offer, booking_reference: bookingReference }
        : null,
    );
    return () => onAssignedOfferChange?.(null);
  }, [bookingReference, offer, onAssignedOfferChange]);

  const offerNeedsAttention = offer?.offer_status === "open" ||
    offer?.offer_status === "assigned";
  if (!enabled || ((!eligible || !serverEligible) && !offerNeedsAttention)) return null;

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
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Offer was not cancelled."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-sky-200 pt-2" data-driver-pool-control={offer?.offer_status || "ready"}>
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
  );
}
