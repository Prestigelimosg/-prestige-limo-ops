"use client";

import { useMemo, useState } from "react";

type Mode = "login" | "new_device" | "recovery";

export default function CustomerAccessSignInPage() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const installationId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const nativeInstallationId = (
      window as Window & { __prestigeCustomerInstallationId?: string }
    ).__prestigeCustomerInstallationId;
    if (nativeInstallationId) return nativeInstallationId;
    const queryValue = new URLSearchParams(window.location.search).get("installation") || "";
    return queryValue || window.localStorage.getItem("prestige-customer-installation-id") || "";
  }, []);

  async function startCode(purpose: "start_new_device" | "start_recovery") {
    const response = await fetch("/api/customer-principal-access", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: purpose, email }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true || !payload?.data?.challenge_id) {
      throw new Error(payload?.error || "Verification email could not be sent.");
    }
    setChallengeId(payload.data.challenge_id);
    setMode(purpose === "start_recovery" ? "recovery" : "new_device");
    setMessage("A one-time code was sent to your verified email.");
  }

  async function submit() {
    if (!email.trim() || !/^\d{6}$/.test(pin) || !installationId) {
      setMessage("Enter your email and 6-digit PIN.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const action = mode === "recovery" ? "complete_recovery" : "pin_login";
      const response = await fetch("/api/customer-principal-access", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, challengeId, code, email, installationId, pin }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 428 && mode === "login") {
        await startCode("start_new_device");
        return;
      }
      if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || "Sign in failed safely.");
      window.location.assign("/my-bookings");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign in failed safely.");
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    if (!email.trim()) {
      setMessage("Enter your verified email first.");
      return;
    }
    setBusy(true);
    try {
      await startCode("start_recovery");
      setPin("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recovery could not start.");
    } finally {
      setBusy(false);
    }
  }

  function continueWithEmail() {
    if (!email.trim()) {
      setMessage("Enter your verified email first.");
      return;
    }
    setEmail(email.trim());
    setMessage("");
    setEmailConfirmed(true);
  }

  function changeEmail() {
    setPin("");
    setCode("");
    setChallengeId("");
    setMode("login");
    setMessage("");
    setEmailConfirmed(false);
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl bg-white px-5 py-12 text-slate-950">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Prestige SG</p>
      <h1 className="mt-3 text-3xl font-bold">Customer sign in</h1>
      <p className="mt-2 text-slate-600">Face ID is the normal app unlock. Use your 6-digit PIN only when needed.</p>
      <section className="mt-8 space-y-4 rounded-2xl border border-slate-200 p-5 shadow-sm">
        {!emailConfirmed ? (
          <div className="space-y-4" data-customer-sign-in-email-step="true">
            <label className="block text-sm font-semibold">Verified email
              <input
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
                onChange={(event) => setEmail(event.target.value)}
                spellCheck={false}
                type="email"
                value={email}
              />
            </label>
            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white" onClick={continueWithEmail} type="button">Continue</button>
          </div>
        ) : (
          <div className="space-y-4" data-customer-sign-in-credentials-step="true">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verified email</p>
                <p className="break-all text-sm font-semibold">{email}</p>
              </div>
              <button className="shrink-0 text-sm font-semibold text-sky-700" disabled={busy} onClick={changeEmail} type="button">Change email</button>
            </div>
            {mode !== "login" ? (
              <label className="block text-sm font-semibold">One-time email code
                <input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} value={code} />
              </label>
            ) : null}
            <label className="block text-sm font-semibold">{mode === "recovery" ? "Create new 6-digit PIN" : "6-digit PIN"}
              <input autoComplete="current-password" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" inputMode="numeric" maxLength={6} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} type="password" value={pin} />
            </label>
            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={submit} type="button">
              {busy ? "Checking…" : mode === "recovery" ? "Reset PIN and sign in" : "Sign in"}
            </button>
            {mode === "login" ? (
              <button className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold" disabled={busy} onClick={recover} type="button">Forgot PIN</button>
            ) : null}
          </div>
        )}
        {message ? <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
