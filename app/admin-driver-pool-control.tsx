"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {AdminDriverCombo, ComboTrip} from "../lib/driver-job-combo";

type PoolDriver = { id: number; driver_name: string | null; plate_number: string | null; vehicle_type: string | null; availability_status: string | null };
type PoolResponse = { driver_id: number; driver_name: string; plate_number: string; vehicle_type: string; status: "pending" | "available" | "declined" | "accepted" | "closed" };

export type DriverPoolAdminOffer = {
  assignment?: {
    driver_name: string;
    plate_number: string;
    can_cancel: boolean;
    blocked_reason: string | null;
    has_job_link: boolean;
  };
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
  onLoadDrivers: () => Promise<boolean>;
  savedVehicle: string;
  bookingReference: string;
  publicBookingReference?: string;
  onCancelAssignment: (offer: AssignedDriverPoolAdminOffer) => Promise<boolean>;
  disabled: boolean;
  eligible: boolean;
  expectedUpdatedAt: string;
  requiresExplicitPayout: boolean;
  showPleaseAssignDriver: boolean;
  suggestedPayout: number;
  onLoadBooking: (bookingReference: string, reviewResponses?: boolean) => Promise<void>;
  suggestedComboPayout?: number|null;
  onComboChange?: (combo: AdminDriverCombo|null) => void;
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

export function AdminDriverPoolControl({ drivers, onLoadDrivers, savedVehicle, bookingReference, publicBookingReference, onCancelAssignment, disabled, eligible, expectedUpdatedAt, suggestedComboPayout, onComboChange, onAssignedOfferChange, onLoadBooking, requiresExplicitPayout, showPleaseAssignDriver, suggestedPayout }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [comboEnabled, setComboEnabled] = useState(false);
  const [combo, setCombo] = useState<AdminDriverCombo|null>(null);
  useEffect(() => { onComboChange?.(combo); }, [combo,onComboChange]);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const tripPickerRef = useRef<HTMLDivElement>(null);
  const addTripButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!tripPickerOpen) return;
    const picker = tripPickerRef.current;
    const opener = addTripButtonRef.current;
    picker?.querySelector<HTMLInputElement>('input[aria-label="Find a saved trip"]')?.focus();
    return () => { opener?.focus(); };
  }, [tripPickerOpen]);
  const [tripCandidates, setTripCandidates] = useState<ComboTrip[]>([]);
  const [selectedTripRefs, setSelectedTripRefs] = useState<string[]>([bookingReference]);
  const [tripSearch, setTripSearch] = useState("");
  const [tripPage, setTripPage] = useState(1);
  const [tripHasMore, setTripHasMore] = useState(false);
  const seenComboId = useRef<string|null>(null);
  const [serverEligible, setServerEligible] = useState(false);
  const [offer, setOffer] = useState<DriverPoolAdminOffer | null>(null);
  const [payoutInput, setPayout] = useState<string|null>(!requiresExplicitPayout && suggestedPayout > 0 ? suggestedPayout.toFixed(2) : "");
  const payout = payoutInput ?? (combo && suggestedComboPayout && suggestedComboPayout>0 ? suggestedComboPayout.toFixed(2) : "");
  const [vehicleRequirement, setVehicleRequirement] = useState(["E / AVF", "AVF", "AVF / VVV", "S", "VVV", "COMBI"].includes(savedVehicle) ? savedVehicle : "");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const loadVersion = useRef(0);
  const [alertReadiness, setAlertReadiness] = useState<Record<number, boolean | null>>({});
  const driverIdsQuery = drivers.map((driver) => driver.id).sort((a, b) => a - b).join(",");
  const [driverSearch, setDriverSearch] = useState("");
  const driverListRequested = useRef(false);
  const driverListLoading = useRef(false);
  const [driverListState, setDriverListState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const requestDrivers = useCallback(async () => {
    if (driverListLoading.current) return;
    driverListLoading.current = true;
    setDriverListState("loading");
    try {
      setDriverListState(await onLoadDrivers() ? "ready" : "failed");
    } catch {
      setDriverListState("failed");
    } finally {
      driverListLoading.current = false;
    }
  }, [onLoadDrivers]);
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
    const version = ++loadVersion.current;
    try {
      // Keep the existing readiness API's 200-ID request bound without limiting the driver list.
      const ids = driverIdsQuery ? driverIdsQuery.split(",") : [];
      const readiness: Record<number, boolean | null> = {};
      for (let offset = 0; offset < Math.max(ids.length, 1); offset += 200) {
        const batch = ids.slice(offset, offset + 200).join(",");
        const response = await fetch(`/api/admin-driver-job-bid-offers?booking_reference=${encodeURIComponent(bookingReference)}${batch ? `&driver_ids=${encodeURIComponent(batch)}` : ""}`, { cache: "no-store", headers });
        const result = await response.json() as { combo_enabled?:boolean; combo?:AdminDriverCombo|null; eligible?: boolean; enabled?: boolean; offer?: DriverPoolAdminOffer | null; driver_alert_readiness?: { driver_id: number; ready: boolean | null }[] };
        if (version !== loadVersion.current) return;
        if (!response.ok) throw new Error("Driver Pool refresh failed.");
        for (const row of result.driver_alert_readiness || []) readiness[row.driver_id] = row.ready;
        setEnabled(result.enabled === true);
        setServerEligible(result.eligible === true);
        setOffer(result.offer || null);
        setComboEnabled(result.combo_enabled === true);
        setCombo(result.combo || null);
        if (result.combo && seenComboId.current !== result.combo.id) {
          seenComboId.current = result.combo.id;
          setPayout(result.combo.total_payout_sgd == null ? null : result.combo.total_payout_sgd.toFixed(2));
        }
      }
      setAlertReadiness(readiness);
      setFeedback((current) => current === "Driver Pool could not refresh. Reload before acting." ? "" : current);
    } catch {
      if (version !== loadVersion.current) return;
      setAlertReadiness({}); setFeedback("Driver Pool could not refresh. Reload before acting.");
    }
  }, [bookingReference, driverIdsQuery]);

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

  useEffect(() => {
    if (!enabled || !eligible || offer?.offer_status === "open" || offer?.offer_status === "assigned") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [enabled, eligible, load, offer?.offer_status]);

  // Display-only parity with driver_pool_vehicle_matches; the publisher remains authoritative.
  const vehicleCategories: Record<string, string> = {
    e: "E", eclass: "E", mercedeseclass: "E", avf: "AVF", alphard: "AVF", vellfire: "AVF", toyotaalphard: "AVF", toyotavellfire: "AVF",
    s: "S", sclass: "S", mercedessclass: "S", vvv: "VVV", vclass: "VVV", viano: "VVV", vito: "VVV", mercedesvclass: "VVV", mercedesviano: "VVV", mercedesvito: "VVV", combi: "COMBI",
  };
  const matchesVehicle = (driver: PoolDriver) => {
    const category = vehicleCategories[(driver.vehicle_type || "").toLowerCase().replace(/[^a-z0-9]/g, "")];
    return Boolean(category && (vehicleRequirement === "E / AVF" ? ["E", "AVF"].includes(category)
      : vehicleRequirement === "AVF / VVV" ? ["AVF", "VVV"].includes(category) : category === vehicleRequirement));
  };
  const selectedReady = selectedIds.length >= 1 && selectedIds.every((id) =>
    alertReadiness[id] === true && drivers.some((driver) => driver.id === id && driver.availability_status?.trim().toLowerCase() === "available" && matchesVehicle(driver)));

  const offerNeedsAttention = offer?.offer_status === "open" || offer?.offer_status === "assigned";
  const showExactControl = enabled && ((eligible && serverEligible) || offerNeedsAttention);
  useEffect(() => {
    if (!showExactControl || offerNeedsAttention || disabled || drivers.length || driverListRequested.current) return;
    const timer = window.setTimeout(() => {
      driverListRequested.current = true;
      void requestDrivers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showExactControl, offerNeedsAttention, disabled, drivers.length, requestDrivers]);
  const visibleDrivers = drivers.filter((driver) => driver.availability_status?.trim().toLowerCase() === "available" &&
    `${driver.driver_name || ""} ${driver.plate_number || ""}`.toLowerCase().includes(driverSearch.trim().toLowerCase()));
  if (!showExactControl && !attentionEnabled && !attentionFeedback && !comboEnabled) return null;

  async function loadTripCandidates(page = 1) {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/admin-driver-job-bid-offers?scope=combo&booking_reference=${encodeURIComponent(bookingReference)}&page=${page}`, {cache:"no-store",headers});
      const result = await response.json() as {ok?:boolean;error?:string;combo?:AdminDriverCombo|null;candidates?:ComboTrip[];has_more?:boolean};
      if (!response.ok || !result.ok) throw new Error(result.error || "Saved trips could not be loaded.");
      const existing = result.combo?.trips || [];
      setTripCandidates(previous => {
        const map = new Map((page===1 ? existing : previous).map(t=>[t.booking_reference,t]));
        for (const candidate of result.candidates || []) map.set(candidate.booking_reference,candidate);
        return [...map.values()].sort((a,b)=>a.pickup_at.localeCompare(b.pickup_at));
      });
      if (page===1) setSelectedTripRefs(existing.length ? existing.map(t=>t.booking_reference) : [bookingReference]);
      setCombo(result.combo || null); setTripHasMore(result.has_more===true); setTripPage(page); setTripPickerOpen(true);
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Saved trips could not be loaded."); }
    finally { setBusy(false); }
  }

  async function addSelectedTrips() {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const selected = tripCandidates.filter(t=>selectedTripRefs.includes(t.booking_reference));
      if (selected.length!==selectedTripRefs.length || selected.length<(combo?1:2)) throw new Error("Select the first job and at least one other saved trip.");
      const response=await fetch("/api/admin-driver-job-bid-offers",{method:"PATCH",headers,body:JSON.stringify({
        action:"combo_members",booking_reference:combo?.primary_booking_reference || bookingReference,
        expected_revision:combo?.revision || null,members:selected.map(t=>({booking_reference:t.booking_reference,updated_at:t.updated_at})),
      })});
      const result=await response.json() as {ok?:boolean;error?:string;combo?:AdminDriverCombo};
      if(!response.ok || !result.ok)throw new Error(result.error || "Trips were not combined.");
      setCombo(result.combo || null); seenComboId.current=result.combo?.id || null;
      setPayout(result.combo ? null : !requiresExplicitPayout && suggestedPayout>0 ? suggestedPayout.toFixed(2) : ""); setTripPickerOpen(false);
      setFeedback(result.combo ? "Trips combined. Review the existing payout field before posting." : "Combo removed. The saved jobs remain unchanged.");
    } catch(error) {setFeedback(error instanceof Error ? error.message : "Trips were not combined.");}
    finally {setBusy(false);}
  }

  async function publish(audience: "selected" | "wider") {
    if (busy || disabled) return;
    if (!vehicleRequirement) { setFeedback("Choose the Pool vehicle type."); return; }
    if (audience === "selected" && !selectedReady) { setFeedback("Select matching drivers with job alerts ready."); return; }
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin-driver-job-bid-offers", {
        body: JSON.stringify({ booking_reference: combo?.primary_booking_reference || bookingReference,
          expected_updated_at: combo?.trips.find(t=>t.booking_reference===combo.primary_booking_reference)?.updated_at || expectedUpdatedAt,
          ...(combo ? {combo_revision:combo.revision} : {}),
          idempotency_key: crypto.randomUUID(), offer_payout_sgd: Number(payout), vehicle_requirement: vehicleRequirement, audience, selected_driver_ids: audience === "selected" ? selectedIds : [] }), headers, method: "POST",
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

  async function selectOrWiden(action: "award" | "widen", driverId?: number, pendingItem?: AdminDriverPoolAttentionItem) {
    const targetOffer = pendingItem || offer;
    const targetReference = pendingItem?.booking_reference || bookingReference;
    if (!targetOffer || busy || attentionWorkingKey || targetOffer.offer_status !== "open") return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/admin-driver-job-bid-offers", {
        method: "PATCH", headers,
        body: JSON.stringify({ action, offer_key: targetOffer.offer_key, expected_updated_at: targetOffer.updated_at,
          idempotency_key: crypto.randomUUID(), ...(action === "award" ? { driver_id: driverId } : {
            booking_reference: targetReference, offer_payout_sgd: targetOffer.offer_payout_sgd, vehicle_requirement: targetOffer.safe_vehicle_label,
          }) }),
      });
      const result = await response.json() as { ok?: boolean; accepted?: boolean; error?: string };
      if (!response.ok || result.ok !== true || (action === "award" && result.accepted !== true)) throw new Error(result.error || "Driver Pool action was not confirmed. Refresh to review.");
      await load();
      await loadAttention(1);
      if (action === "award") {
        setFeedback("Driver assigned. Create the Driver Job Link when ready.");
        await onLoadBooking(bookingReference);
      } else if (pendingItem) setAttentionFeedback(`Job ${pendingItem.public_booking_reference}: offered to the wider pool. First valid acceptance wins.`);
      else setFeedback("Offered to the wider pool. First valid acceptance wins. Create the Driver Job Link after assignment.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Driver Pool action was not confirmed. Refresh to review.";
      if (pendingItem) setAttentionFeedback(message); else setFeedback(message);
      await load();
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!offer || busy || attentionWorkingKey || !window.confirm(`Cancel the offer for job ${publicBookingReference || "shown above"}? Drivers can no longer accept this offer. The booking stays active.`)) return;
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
    if (item.attention_status !== "open" || busy || attentionWorkingKey || !window.confirm(`Cancel the offer for job ${item.public_booking_reference}? Drivers can no longer accept this offer. The booking stays active.`)) return;
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

  async function cancelAssignment(item: AssignedDriverPoolAdminOffer, publicReference: string) {
    if (!item.assignment?.can_cancel || attentionWorkingKey || busy) return;
    if (!window.confirm(`Cancel ${item.assignment.driver_name}'s assignment for job ${publicReference}? The driver will be notified. The booking stays active and needs another driver. No Job Link will be created.`)) return;
    setAttentionWorkingKey(item.offer_key);
    setAttentionFeedback("");
    try {
      if (await onCancelAssignment(item)) {
        setAttentionFeedback(`Job ${publicReference}: driver assignment cancelled. Booking stays active. Select drivers to offer it again.`);
        await load();
        await loadAttention(1, true);
      }
    } catch (error) {
      setAttentionFeedback(error instanceof Error ? error.message : "Assignment was not cancelled. Reload this job to review.");
      await load();
      await loadAttention(1, true);
    } finally { setAttentionWorkingKey(""); }
  }

  async function openPendingBooking(item: AdminDriverPoolAttentionItem) {
    if (attentionWorkingKey || busy) return;
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
      {comboEnabled ? <>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {combo ? <strong>{combo.vehicle_requirement || savedVehicle} Combo · {combo.trips.length} trips</strong> : null}
          {eligible && (!combo || combo.state === "draft") ? <button ref={addTripButtonRef} type="button" className="rounded border border-sky-300 bg-white px-2 py-1 font-semibold text-sky-950" disabled={busy || disabled} onClick={()=>void loadTripCandidates(1)}>Add trip</button> : null}
        </div>
        {combo ? <ol className="mb-2 space-y-1 text-xs text-slate-700">{combo.trips.map(t=><li key={t.booking_reference}>{t.service} · {pickupLabel(t.pickup_at)} · {t.pickup} → {t.dropoff}</li>)}</ol> : null}
        {tripPickerOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onKeyDown={event=>{if(event.key==="Escape"&&!busy)setTripPickerOpen(false);}}>
          <div ref={tripPickerRef} role="dialog" aria-modal="true" aria-labelledby="combo-trip-picker-title" onKeyDown={event=>{
            if(event.key!=="Tab")return;
            const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])'));
            const first=controls[0],last=controls.at(-1);
            if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
            else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
          }} className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 rounded-xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3"><h3 id="combo-trip-picker-title" className="font-bold text-slate-950">Add saved trips · same customer</h3><button type="button" aria-label="Close saved trip picker" disabled={busy} onClick={()=>setTripPickerOpen(false)} className="rounded border px-2 py-1 text-xs">Close</button></div>
            <input aria-label="Find a saved trip" value={tripSearch} onChange={event=>setTripSearch(event.target.value)} placeholder="Booking number, date or route" className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <div className="min-h-0 overflow-y-auto rounded border border-slate-200">
              {tripCandidates.filter(t=>`${t.public_booking_reference} ${pickupLabel(t.pickup_at)} ${t.route} ${t.pickup} ${t.dropoff}`.toLowerCase().includes(tripSearch.trim().toLowerCase())).map(t=>{
                const primary=t.booking_reference===(combo?.primary_booking_reference || bookingReference);
                return <label key={t.booking_reference} className="flex items-start gap-2 border-b border-slate-100 p-2 text-xs last:border-0"><input type="checkbox" checked={selectedTripRefs.includes(t.booking_reference)} disabled={primary || busy} onChange={event=>setSelectedTripRefs(previous=>event.target.checked?[...previous,t.booking_reference]:previous.filter(ref=>ref!==t.booking_reference))}/><span><strong>{t.public_booking_reference} · {t.service} · {pickupLabel(t.pickup_at)}</strong><br/>{t.pickup} → {t.dropoff}{primary ? " · First job" : ""}</span></label>;
              })}
              {!tripCandidates.length ? <p className="p-3 text-sm">No eligible saved trips for this customer.</p> : null}
            </div>
            {tripHasMore ? <button type="button" disabled={busy} onClick={()=>void loadTripCandidates(tripPage+1)} className="text-xs font-semibold text-sky-800">Load more saved trips</button> : null}
            {feedback ? <p role="status" className="text-xs text-slate-700">{feedback}</p> : null}
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-600">{selectedTripRefs.length} selected · existing jobs only{selectedTripRefs.length>100 ? " · Select no more than 100 trips" : ""}</span><button type="button" disabled={busy || selectedTripRefs.length<(combo?1:2) || selectedTripRefs.length>100} onClick={()=>void addSelectedTrips()} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{busy ? "Loading…" : combo && selectedTripRefs.length===1 ? "Remove combo" : "Add selected"}</button></div>
          </div>
        </div> : null}
      </> : null}
      {!showExactControl && attentionEnabled ? <p className="mb-2 text-xs text-slate-700" role="status">{feedback || "Driver Pool needs a saved, future job with no assigned driver. Load that job from Bookings first."}</p> : null}
      {showExactControl ? (
        <div className="flex flex-wrap items-end gap-2" data-driver-pool-control={offer?.offer_status || "ready"}>
          {offer?.offer_status === "open" ? (
            <>
              <span className="text-xs font-semibold text-sky-950">{offer.audience === "selected" ? "Selected group" : "Wider pool"} · First valid acceptance wins · {offer.safe_vehicle_label || "Vehicle TBC"} · SGD {offer.offer_payout_sgd.toFixed(2)} · {offer.recipient_count} eligible Drivers · {Math.min(offer.push_target_count, offer.recipient_count)} push-capable Drivers · {Math.max(0, offer.recipient_count - offer.push_target_count)} app-only Drivers</span>
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
                </div>
              ) : null}
              {offer.audience === "selected" ?
                <button className="h-8 rounded border border-sky-300 bg-white px-3 text-xs font-semibold" disabled={busy || disabled} onClick={() => void selectOrWiden("widen")} type="button">Offer to wider pool</button> : null}
              <button className="h-8 rounded-md border border-sky-300 bg-white px-2.5 text-xs font-semibold text-sky-900 disabled:text-slate-400" disabled={busy || Boolean(attentionWorkingKey)} onClick={() => void cancel()} type="button">{busy ? "Working…" : "Cancel Offer"}</button>
            </>
          ) : offer?.offer_status === "assigned" ? (
            <div className="w-full space-y-2 text-xs">
              <p className="font-semibold text-emerald-800">Accepted · Driver assigned. Create the Driver Job Link when ready.</p>
              {!attentionItems.some((item) => item.offer_key === offer.offer_key) ? <>
                <p>{offer.assignment?.driver_name || "Loading driver details…"} · {offer.assignment?.plate_number || ""}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="min-h-10 rounded border border-sky-300 bg-white px-3 font-semibold text-sky-900" disabled={busy || Boolean(attentionWorkingKey)} onClick={() => void onLoadBooking(bookingReference).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "The Job Link section could not be opened. Try again."))} type="button">{offer.assignment?.has_job_link ? "Go to Job Link / Driver Reports" : "Go to Create Link"}</button>
                  <button className="min-h-10 rounded border border-red-200 bg-white px-3 font-semibold text-red-700 disabled:text-slate-400" disabled={!offer.assignment?.can_cancel || Boolean(attentionWorkingKey)} onClick={() => void cancelAssignment({ ...offer, booking_reference: bookingReference }, publicBookingReference || "shown above")} type="button">Cancel Driver Assignment</button>
                </div>
                <p>{offer.assignment?.blocked_reason || "Cancel removes this driver only. The booking stays active."}</p>
              </> : <p>Use the actions beside this job in Driver Pool pending below.</p>}
            </div>
          ) : (
            <>
              <details className="w-full rounded border border-sky-200 bg-white p-2" open>
                <summary className="cursor-pointer text-sm font-semibold text-sky-950">Driver Pool</summary>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs font-semibold text-slate-700">Pool vehicle
                    <select aria-label="Driver Pool vehicle type" className="ml-2 h-8 rounded-md border border-sky-300 bg-white px-2 text-sm" disabled={busy || disabled} onChange={(event) => { setVehicleRequirement(event.target.value); setSelectedIds([]); }} value={vehicleRequirement}>
                      <option value="">Choose vehicle</option>
                      <option value="E / AVF">E / AVF</option>
                      <option value="AVF">AVF</option>
                      <option value="AVF / VVV">AVF / VVV</option>
                      <option value="S">S</option>
                      <option value="VVV">VVV</option>
                      <option value="COMBI">Combi</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-700">Pool offer total SGD
                    <input aria-label="Driver Pool offer payout in SGD" className="ml-2 h-8 w-28 rounded-md border border-sky-300 bg-white px-2 text-sm" min="0.01" onChange={(event) => setPayout(event.target.value)} step="0.01" type="number" value={payout} />
                  </label>
                  <div className="mt-2 w-full space-y-1" data-driver-pool-selected-drivers="true">
                    <p className="text-sm font-semibold text-sky-950">Choose drivers · {selectedIds.length} selected</p>
                    <p className="text-xs text-slate-600">Online means job alerts are enabled, including when the app is closed. Delivery still depends on the phone connection.</p>
                    <div className="flex flex-wrap items-center gap-2">
                    <button className="min-h-8 text-xs font-semibold text-sky-900 underline" disabled={busy || driverListState === "loading"} onClick={() => void (driverListState === "failed" || !drivers.length ? requestDrivers() : load())} type="button">{driverListState === "loading" ? "Loading drivers…" : driverListState === "failed" ? "Retry loading drivers" : "Refresh alert status"}</button>
                    <label className="text-xs font-semibold text-slate-700">Search drivers
                      <input aria-label="Search Pool drivers" className="ml-2 h-8 rounded border border-sky-300 px-2 text-xs" onChange={(event) => setDriverSearch(event.target.value)} placeholder="Name or plate" value={driverSearch} />
                    </label>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded border border-sky-200 bg-white">
                      {visibleDrivers.map((driver) => (
                        <label className="flex min-h-11 items-center gap-2 border-b border-sky-100 px-2 py-1 text-sm last:border-0" key={driver.id}>
                          <input className="h-4 w-4 shrink-0" type="checkbox" checked={selectedIds.includes(driver.id)} disabled={busy || disabled || (!selectedIds.includes(driver.id) && (alertReadiness[driver.id] !== true || !matchesVehicle(driver)))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, driver.id] : current.filter((id) => id !== driver.id))} />
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-words">
                            <span>{driver.driver_name || "Unnamed driver"} · {driver.vehicle_type || "Vehicle unavailable"} · {driver.plate_number || "Plate unavailable"}</span>
                            <span className={alertReadiness[driver.id] === true ? "font-semibold text-emerald-700" : "text-slate-600"} data-driver-alert-status={driver.id}>
                              {alertReadiness[driver.id] === true ? "Online · alerts ready" : alertReadiness[driver.id] === false ? "Alerts not ready" : "Alert status unavailable"}
                            </span>
                            {!matchesVehicle(driver) ? <span className="text-amber-800">{vehicleRequirement ? "Vehicle does not match" : "Choose pool vehicle"}</span> : null}
                          </span>
                        </label>
                      ))}
                      {!visibleDrivers.length ? <p className="p-2 text-sm text-slate-600" role="status">{driverListState === "loading" || (driverListState === "idle" && !drivers.length) ? "Loading drivers…" : driverListState === "failed" ? "Drivers could not load. Tap Retry loading drivers above." : driverSearch.trim() ? "No drivers match your search." : "No available drivers to select."}</p> : null}
                    </div>
                  </div>
                <p className="w-full text-xs text-slate-700">Tick one or more drivers above, then Send to selected drivers. Scroll the list for more names. Send to all drivers includes all eligible drivers matching the pool vehicle. First valid acceptance wins.</p>
                <button className="min-h-10 rounded-md bg-sky-950 px-3 text-xs font-semibold text-white disabled:bg-slate-400" disabled={busy || disabled || !selectedReady || !vehicleRequirement || !expectedUpdatedAt || !(Number(payout) > 0)} onClick={() => void publish("selected")} type="button">Send to selected drivers</button>
                <button className="min-h-10 rounded-md border border-sky-700 bg-white px-3 text-xs font-semibold text-sky-950 disabled:border-slate-300 disabled:text-slate-400" disabled={busy || disabled || !vehicleRequirement || !expectedUpdatedAt || !(Number(payout) > 0)} onClick={() => void publish("wider")} type="button">Send to all drivers</button>
                {busy ? <span className="text-xs text-slate-600" role="status">Sending…</span> : null}
                </div>
              </details>
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
                <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-sky-100 px-2 py-2 last:border-b-0" data-admin-driver-pool-pending-row={item.public_booking_reference} key={item.offer_key}>
                  <button className="min-w-0 flex-1 text-left text-xs disabled:text-slate-400" disabled={busy || Boolean(attentionWorkingKey)} onClick={() => void openPendingBooking(item)} type="button">
                    <span className="font-semibold text-slate-950">Job {item.public_booking_reference}</span>
                    <span className="ml-2 text-slate-500">{pickupLabel(item.pickup_at)}</span>
                    <span className={`ml-2 font-semibold ${item.attention_status === "open" ? "text-sky-800" : "text-emerald-800"}`}>
                      {item.attention_status === "open" ? `${item.audience === "selected" ? "Selected group" : "Wider pool"} · SGD ${item.offer_payout_sgd.toFixed(2)} · ${item.selection_mode === "admin" ? "View responses" : "First acceptance wins"}` : "Accepted · Job Link pending"}
                    </span>
                  </button>
                  {item.attention_status === "open" && item.audience === "selected" ? (
                    <button className="min-h-10 rounded border border-sky-300 bg-white px-3 text-xs font-semibold text-sky-900 disabled:text-slate-400" disabled={busy || Boolean(attentionWorkingKey)} onClick={() => void selectOrWiden("widen", undefined, item)} type="button">Offer to wider pool</button>
                  ) : null}
                  {item.attention_status === "open" ? (
                    <button className="min-h-10 shrink-0 rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 disabled:text-slate-400" disabled={busy || Boolean(attentionWorkingKey)} onClick={() => void cancelPendingOffer(item)} type="button">
                      {working ? "Cancelling…" : "Cancel Offer"}
                    </button>
                  ) : (
                    <div className="w-full space-y-2 text-xs">
                      <p className="font-semibold">{item.assignment?.driver_name || "Driver details unavailable"} · {item.assignment?.plate_number || "Plate unavailable"} · SGD {item.offer_payout_sgd.toFixed(2)}</p>
                      <div className="flex flex-wrap gap-2">
                        <button className="min-h-10 rounded border border-sky-300 bg-white px-3 font-semibold text-sky-900 disabled:text-slate-400" disabled={busy || Boolean(attentionWorkingKey)} onClick={() => void openPendingBooking(item)} type="button">{working ? "Working…" : "Go to Create Link"}</button>
                        <button className="min-h-10 rounded border border-red-200 bg-white px-3 font-semibold text-red-700 disabled:text-slate-400" disabled={!item.assignment?.can_cancel || Boolean(attentionWorkingKey) || busy} onClick={() => void cancelAssignment(item, item.public_booking_reference)} type="button">Cancel Driver Assignment</button>
                      </div>
                      <p>{item.assignment?.blocked_reason || (item.assignment ? "Create Link opens the existing Job Link section. Cancel removes this driver only; the booking stays active." : "Cancellation availability could not be verified. Open this job to review.")}</p>
                    </div>
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
