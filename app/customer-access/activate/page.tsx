"use client";

import { useEffect, useState } from "react";

function installationId() {
  const nativeInstallationId = (
    window as Window & { __prestigeCustomerInstallationId?: string }
  ).__prestigeCustomerInstallationId;
  if (nativeInstallationId) return nativeInstallationId;
  const key = "prestige-customer-installation-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `customer-ios-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

export default function CustomerAccessActivationPage() {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [invitation, setInvitation] = useState("");
  const [invitationLoaded, setInvitationLoaded] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite")?.trim() || "";
    setInvitation(token);
    setInvitationLoaded(true);
    if (!token) setMessage("This Customer access invitation is missing or invalid.");
    // Retire only the old activation-code resume record; never persist PIN or invitation.
    try { window.localStorage.removeItem("prestige-customer-activation-resume-v1"); } catch {}
  }, []);

  async function activate() {
    if (busy || !invitationLoaded || !invitation) return;
    if (!/^\d{6}$/.test(pin) || pin !== confirmPin) {
      setMessage("Enter the same 6-digit PIN twice.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer-principal-access", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_activation",
          faceIdEnrolled: false,
          installationId: installationId(),
          invitation,
          pin,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || "Activation failed safely.");
      setPin("");
      setConfirmPin("");
      setComplete(true);
      setMessage("Account ready. Enable Face ID in Prestige SG.");
      window.setTimeout(() => window.location.assign("/my-bookings"), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Activation failed safely.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl bg-white px-5 py-12 text-slate-950">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Prestige SG</p>
      <h1 className="mt-3 text-3xl font-bold">Set up Customer access</h1>
      <p className="mt-2 text-slate-600">Create your PIN, then enable Face ID.</p>
      <section className="mt-6 rounded-2xl border border-slate-200 p-5">
        {!complete ? (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void activate(); }}>
            <label className="block text-sm font-semibold">Create 6-digit PIN
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" autoComplete="new-password" inputMode="numeric" maxLength={6} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} type="password" value={pin} />
            </label>
            <label className="block text-sm font-semibold">Confirm 6-digit PIN
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" autoComplete="new-password" inputMode="numeric" maxLength={6} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ""))} type="password" value={confirmPin} />
            </label>
            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy || !invitationLoaded || !invitation} type="submit">
              {busy ? "Creating access…" : "Create secure access"}
            </button>
          </form>
        ) : <p className="font-semibold text-emerald-800">Customer access is ready.</p>}
        {message ? <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
