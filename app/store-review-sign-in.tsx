"use client";
import { useState, type FormEvent } from "react";
export function StoreReviewSignIn({ role }: { role: "admin" | "driver" | "customer" }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    const endpoint = { admin: "/api/admin-auth/session", driver: "/api/driver-auth/session", customer: "/api/customer-principal-access" }[role];
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (role === "admin") headers["x-prestige-admin-auth-purpose"] = "admin-account-sign-in";
    if (role === "driver") headers["x-prestige-driver-purpose"] = "driver-account-sign-in";
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers, body: JSON.stringify({ action: "reviewer_sign_in", access_code: code }) });
      if (!response.ok) { setError("Reviewer credentials were not accepted."); return; }
      setCode("");
      window.location.assign({ admin: "/", driver: "/driver-portal", customer: "/my-bookings" }[role]);
    } catch { setError("Reviewer sign-in is temporarily unavailable."); }
    finally { setBusy(false); }
  }
  return <details className="mt-5 rounded-xl border border-slate-200 p-4 text-sm text-slate-800">
    <summary className="cursor-pointer font-semibold">Store review access</summary>
    <p className="mt-3">Use the reviewer credential supplied with the store submission. This preparation currently allows viewing designated test records only. Operational actions are unavailable.</p>
    <form className="mt-3 space-y-3" onSubmit={submit}>
      <label className="block font-semibold">Reviewer credential
        <input className="mt-1 w-full rounded-lg border border-slate-300 p-3" type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} maxLength={43} required value={code} onChange={event => setCode(event.target.value)} />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <button className="w-full rounded-lg bg-slate-950 p-3 font-semibold text-white disabled:opacity-50" type="submit" disabled={busy || code.length !== 43}>{busy ? "Signing in…" : "Sign in for review"}</button>
    </form>
    <StoreReviewSessionNotice role={role} compact />
  </details>;
}


export function StoreReviewSessionNotice({ role, compact = false, qaAcknowledgement = false }: { role: "admin" | "driver" | "customer"; compact?: boolean; qaAcknowledgement?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function endReview() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const endpoint = { admin: "/api/admin-auth/session", driver: "/api/driver-auth/session", customer: "/api/customer-principal-access" }[role];
      const response = await fetch(endpoint, { method: role === "customer" ? "POST" : "DELETE", credentials: "same-origin",
        headers: { "content-type": "application/json", "x-prestige-review-purpose": "sign-out" },
        ...(role === "customer" ? { body: JSON.stringify({ action: "reviewer_sign_out" }) } : {}) });
      if (!response.ok) { setError("Could not end review access. Please try again."); return; }
      window.location.assign({ admin: "/admin-sign-in", driver: "/driver-portal", customer: "/customer-access/sign-in" }[role]);
    } catch { setError("Could not end review access. Please try again."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Store review session" className="my-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-slate-950">
    {!compact ? <p className="mb-2">{role === "admin" ? "QA review: view designated test bookings. Only Number of bags can be saved as 2 on the designated Admin test booking. Other actions are unavailable." : role === "driver" || qaAcknowledgement ? "QA review: view and acknowledge the designated Driver test job. Other actions are unavailable." : "QA review: view designated test bookings only. Operational actions are unavailable."}</p> : null}
    <button type="button" onClick={endReview} disabled={busy} className="min-h-11 rounded-lg border border-slate-400 px-3 font-semibold disabled:opacity-50">{busy ? "Ending review…" : "End reviewer session"}</button>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
