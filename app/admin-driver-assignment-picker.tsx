"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AdminDriverAssignmentDisplayRecord } from "../lib/admin-driver-assignment-display";

type Props = {
  drivers: AdminDriverAssignmentDisplayRecord[];
  value: string;
  savedLabel: string;
  loading: boolean;
  onLoad: () => Promise<boolean>;
  onChange: (driverId: string) => void;
  matchesSearch: (driver: AdminDriverAssignmentDisplayRecord, query: string) => boolean;
};

export function AdminDriverAssignmentPicker({ drivers, value, savedLabel, loading, onLoad, onChange, matchesSearch }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const [ranking, setRanking] = useState<{ counts: Record<number, number>; state: "idle" | "loading" | "ready" | "failed" }>({ counts: {}, state: "idle" });
  const rankingRead = useRef<Promise<void> | null>(null);
  const rankingAt = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = drivers.find((driver) => String(driver.id) === value);
  const label = (driver: AdminDriverAssignmentDisplayRecord) =>
    [driver.driver_name || "Unnamed driver", driver.plate_number, driver.contact_number].filter(Boolean).join(" · ");
  const visible = search.trim()
    ? drivers.filter((driver) => matchesSearch(driver, search))
    : [...drivers].sort((a, b) => (ranking.counts[b.id] || 0) - (ranking.counts[a.id] || 0) ||
        (a.driver_name || "").localeCompare(b.driver_name || "") || a.id - b.id).slice(0, 20);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (active >= 0) list.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function loadRanking() {
    if (rankingRead.current) return rankingRead.current;
    if (Date.now() - rankingAt.current < 60000) return;
    const pending = (async () => {
      setRanking((current) => ({ ...current, state: "loading" }));
      try {
        const response = await fetch("/api/admin-driver-assignment-display?scope=frequent", {
          headers: { "x-prestige-admin-purpose": "admin-booking-persistence" },
          method: "GET", cache: "no-store", signal: AbortSignal.timeout(10000),
        });
        const body = await response.json();
        if (!response.ok || body?.ok !== true || body.window_days !== 90 || !Array.isArray(body.frequent_drivers)) throw Error("Unavailable");
        const counts: Record<number, number> = {};
        for (const row of body.frequent_drivers) {
          if (!Number.isSafeInteger(row.driver_id) || row.driver_id <= 0 || !Number.isSafeInteger(row.job_count) || row.job_count <= 0 || counts[row.driver_id]) throw Error("Invalid ranking");
          counts[row.driver_id] = row.job_count;
        }
        setActive(-1);
        setRanking({ counts, state: "ready" });
      } catch {
        setRanking({ counts: {}, state: "failed" });
      } finally {
        rankingAt.current = Date.now();
      }
    })();
    rankingRead.current = pending;
    try { await pending; } finally { rankingRead.current = null; }
  }

  async function load() {
    setFailed(false);
    try { setFailed(!await onLoad()); } catch { setFailed(true); }
  }
  function close() { setOpen(false); setSearch(""); setActive(-1); }
  function choose(driverId: string) {
    onChange(driverId);
    close();
    trigger.current?.focus();
  }

  return <div className="relative min-w-0" data-driver-assignment-picker="true"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <span className="mb-0.5 block text-xs font-semibold text-slate-700">Driver</span>
    <button ref={trigger} type="button" aria-label="Driver" aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-options` : undefined} data-driver-assignment-trigger="true" value={value}
      className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-stone-300 bg-white px-2 py-1 text-left text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
      onClick={() => { if (open) close(); else { setOpen(true); setSearch(""); setActive(-1); void load(); void loadRanking(); } }}>
      <span className="truncate">{savedLabel || (selected ? label(selected) : "Select driver")}</span><span aria-hidden="true">▾</span>
    </button>
    {open ? <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-slate-300 bg-white p-2 shadow-lg">
      <input ref={input} type="search" role="combobox" aria-label="Search assignment drivers" aria-expanded="true"
        aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={active >= 0 && active < visible.length ? `${id}-option-${active}` : undefined}
        autoComplete="off" placeholder="Name, phone, plate or vehicle" value={search}
        className="h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-sky-700"
        onChange={(event) => { setSearch(event.target.value); setActive(-1); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); trigger.current?.focus(); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => visible.length ? event.key === "ArrowDown" ? Math.min(current + 1, visible.length - 1) : Math.max(current - 1, 0) : -1);
          }
          if (event.key === "Enter") { event.preventDefault(); if (!loading && !failed && visible[active]) choose(String(visible[active].id)); }
        }} />
      <p className="py-1 text-xs text-slate-600" role="status">{loading ? "Loading drivers…" : failed ? "Drivers could not load." : search.trim()
        ? `${visible.length} matching drivers` : ranking.state === "failed" ? "Frequent list unavailable. Search all drivers."
          : ranking.state === "loading" ? "Loading frequent drivers… Search is available."
            : "Frequent drivers first · Last 90 days · Search all drivers"}</p>
      {failed ? <button type="button" className="mb-1 text-sm text-sky-800 underline" onClick={() => void load()}>Retry loading drivers</button> : null}
      <div ref={list} id={`${id}-options`} role="listbox" aria-label="Assignment drivers" className="max-h-64 overflow-y-auto overscroll-contain">
        <button type="button" role="option" aria-selected={!value} tabIndex={0} disabled={loading || failed}
          className="w-full rounded p-2 text-left text-sm text-slate-600 hover:bg-sky-50 disabled:opacity-50"
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose("")}>Select driver</button>
        {visible.map((driver, index) => <button key={driver.id} id={`${id}-option-${index}`} data-option-index={index}
          data-driver-id={driver.id} type="button" role="option" aria-selected={String(driver.id) === value} tabIndex={-1}
          disabled={loading || failed}
          className={`block w-full rounded p-2 text-left text-sm hover:bg-sky-50 disabled:opacity-50 ${active === index ? "bg-sky-100" : ""}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(String(driver.id))}>
          <span className="block break-words font-semibold">{driver.driver_name || "Unnamed driver"}</span>
          <span className="block break-words text-xs text-slate-600">{[driver.plate_number, driver.contact_number, driver.vehicle_type].filter(Boolean).join(" · ")}</span>
        </button>)}
      </div>
      {!loading && !failed && !visible.length ? <p className="p-2 text-sm text-slate-600">{search.trim() ? "No drivers match your search." : "No drivers available."}</p> : null}
    </div> : null}
  </div>;
}
