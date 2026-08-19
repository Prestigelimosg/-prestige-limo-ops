"use client";

import { FormEvent, useMemo, useState } from "react";

const productionOrigin = "https://app.prestigelimo.sg";

function protectedAdminPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/") ||
    pathname === "/settings/invoice"
  );
}

export function safeAdminReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, productionOrigin);
    return parsed.origin === productionOrigin && protectedAdminPath(parsed.pathname)
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export function AdminSignInForm({
  enabled,
  returnTo,
}: {
  enabled: boolean;
  returnTo: string;
}) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [token, setToken] = useState("");
  const safeReturnTo = useMemo(() => safeAdminReturnPath(returnTo), [returnTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin-auth/session", {
        body: JSON.stringify(
          stage === "request"
            ? { action: "request_code", email }
            : { action: "verify_code", email, token },
        ),
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-prestige-admin-auth-purpose": "admin-account-sign-in",
        },
        method: "POST",
      });
      if (!response.ok) {
        setError(
          response.status === 503
            ? "Admin account sign-in is not configured yet."
            : stage === "request"
              ? "The sign-in code could not be requested. Please try again."
              : "That code was not accepted. Request a new code and try again.",
        );
        return;
      }

      if (stage === "request") {
        setStage("verify");
        return;
      }
      window.location.assign(safeReturnTo);
    } catch {
      setError("Admin sign-in is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  function changeEmail() {
    if (busy) return;
    setStage("request");
    setToken("");
    setError("");
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <label className="block text-sm font-semibold text-slate-800">
        Email
        <input
          autoCapitalize="none"
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none ring-amber-500 focus:ring-2 disabled:bg-slate-100"
          disabled={!enabled || busy || stage === "verify"}
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      {stage === "verify" ? (
        <>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
            If this is an active Admin address, a six-digit one-time code was sent. Enter it below.
          </p>
          <label className="block text-sm font-semibold text-slate-800">
            6-digit code
            <input
              autoComplete="one-time-code"
              autoFocus
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.35em] text-slate-950 outline-none ring-amber-500 focus:ring-2"
              disabled={!enabled || busy}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
              pattern="[0-9]{6}"
              required
              value={token}
            />
          </label>
        </>
      ) : null}
      {error ? (
        <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={!enabled || busy || (stage === "verify" && token.length !== 6)}
        type="submit"
      >
        {busy
          ? stage === "request" ? "Sending code…" : "Verifying code…"
          : stage === "request" ? "Send 6-digit code" : "Verify code"}
      </button>
      {stage === "verify" ? (
        <button
          className="w-full text-sm font-semibold text-slate-600 underline underline-offset-4"
          disabled={busy}
          onClick={changeEmail}
          type="button"
        >
          Use a different email
        </button>
      ) : null}
    </form>
  );
}
