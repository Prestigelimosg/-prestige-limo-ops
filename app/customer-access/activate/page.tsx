"use client";

import { useEffect, useMemo, useState } from "react";

type Step = "invite" | "verify" | "complete";

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
  const [step, setStep] = useState<Step>("invite");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const invitation = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("invite") || "";
  }, []);

  useEffect(() => {
    if (invitation) return;
    const timer = window.setTimeout(() => {
      setMessage("This Customer access invitation is missing or invalid.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [invitation]);

  async function requestCode() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer-principal-access", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_activation", invitation }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload?.data?.challenge_id) {
        throw new Error(payload?.error || "Verification code could not be sent.");
      }
      setChallengeId(payload.data.challenge_id);
      setStep("verify");
      setMessage("A one-time verification code was sent to your invited email.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification code could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!/^\d{6}$/.test(code) || !/^\d{6}$/.test(pin) || pin !== confirmPin) {
      setMessage("Enter the email code and the same new 6-digit PIN twice.");
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
          challengeId,
          code,
          faceIdEnrolled: false,
          installationId: installationId(),
          invitation,
          pin,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || "Activation failed safely.");
      setStep("complete");
      setMessage("Account ready. Open Prestige SG and enable Face ID.");
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
      <p className="mt-2 text-slate-600">Verify once, create your 6-digit PIN, then use Face ID for ordinary app opening.</p>

      <section className="mt-8 rounded-2xl border border-slate-200 p-5 shadow-sm">
        {step === "invite" ? (
          <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy || !invitation} onClick={requestCode} type="button">
            {busy ? "Sending code…" : "Verify invited email"}
          </button>
        ) : step === "verify" ? (
          <div className="space-y-4">
            <label className="block text-sm font-semibold">One-time email code
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} value={code} />
            </label>
            <label className="block text-sm font-semibold">Create 6-digit PIN
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" inputMode="numeric" maxLength={6} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} type="password" value={pin} />
            </label>
            <label className="block text-sm font-semibold">Confirm 6-digit PIN
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" inputMode="numeric" maxLength={6} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ""))} type="password" value={confirmPin} />
            </label>
            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={activate} type="button">
              {busy ? "Creating access…" : "Create secure access"}
            </button>
          </div>
        ) : (
          <p className="font-semibold text-emerald-800">Customer access is ready.</p>
        )}
        {message ? <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
