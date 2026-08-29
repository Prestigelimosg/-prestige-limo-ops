"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<
    "checking" | "sign_in" | "recover_pin" | "invalid_recovery"
  >("checking");
  const [pin, setPin] = useState("");
  const recoveryInitializedRef = useRef(false);
  const recoveryAccessTokenRef = useRef("");
  const recoveryRefreshTokenRef = useRef("");
  const safeReturnTo = useMemo(() => safeAdminReturnPath(returnTo), [returnTo]);

  function clearRecoverySession() {
    recoveryAccessTokenRef.current = "";
    recoveryRefreshTokenRef.current = "";
  }

  useEffect(() => {
    const initializeRecoveryTimer = window.setTimeout(() => {
      if (recoveryInitializedRef.current) return;
      recoveryInitializedRef.current = true;

      const recoveryFragment = new URLSearchParams(window.location.hash.slice(1));
      if (recoveryFragment.get("type") !== "recovery") {
        setMode("sign_in");
        return;
      }

      const accessToken = recoveryFragment.get("access_token") || "";
      const refreshToken = recoveryFragment.get("refresh_token") || "";
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      if (!accessToken || !refreshToken) {
        setMode("invalid_recovery");
        return;
      }

      recoveryAccessTokenRef.current = accessToken;
      recoveryRefreshTokenRef.current = refreshToken;
      setMode("recover_pin");
    }, 0);

    return () => window.clearTimeout(initializeRecoveryTimer);
  }, []);

  useEffect(() => {
    const clearOnPageHide = () => clearRecoverySession();
    window.addEventListener("pagehide", clearOnPageHide);
    return () => window.removeEventListener("pagehide", clearOnPageHide);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;
    setBusy(true);
    setError("");

    try {
      if (mode === "recover_pin") {
        if (pin !== confirmPin) {
          setError("The two PIN entries do not match.");
          return;
        }
        const accessToken = recoveryAccessTokenRef.current;
        const refreshToken = recoveryRefreshTokenRef.current;
        if (!accessToken || !refreshToken) {
          setMode("invalid_recovery");
          return;
        }
        const recoveryPin = pin;
        clearRecoverySession();
        setPin("");
        setConfirmPin("");

        const response = await fetch("/api/admin-auth/session", {
          body: JSON.stringify({
            accessToken,
            action: "recover_pin",
            pin: recoveryPin,
            refreshToken,
          }),
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-prestige-admin-auth-purpose": "admin-account-pin-recovery",
          },
          method: "POST",
        });
        if (!response.ok) {
          setMode("invalid_recovery");
          return;
        }

        window.location.replace(`/admin-sign-in?return_to=${encodeURIComponent(safeReturnTo)}`);
        return;
      }

      const response = await fetch("/api/admin-auth/session", {
        body: JSON.stringify({ action: "sign_in", pin }),
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
            : "That PIN was not accepted. Please try again.",
        );
        return;
      }

      window.location.assign(safeReturnTo);
    } catch {
      if (mode === "recover_pin") {
        setMode("invalid_recovery");
      } else {
        setError("Admin sign-in is temporarily unavailable.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === "checking") {
    return (
      <p className="mt-8 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
        Checking secure sign-in…
      </p>
    );
  }

  if (mode === "invalid_recovery") {
    return (
      <div className="mt-8 space-y-4">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          This recovery link is invalid or expired.
        </p>
        <a
          className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-bold text-slate-950"
          href={`/admin-sign-in?return_to=${encodeURIComponent(safeReturnTo)}`}
        >
          Return to Admin sign-in
        </a>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
        {mode === "recover_pin"
          ? "Choose the six-digit PIN for the verified Owner Admin account."
          : "Enter the six-digit PIN for the verified Owner Admin account."}
      </p>
      <label className="block text-sm font-semibold text-slate-800">
        {mode === "recover_pin" ? "New 6-digit Admin PIN" : "Enter 6-digit Admin PIN"}
        {mode === "recover_pin" ? (
          <input
            autoComplete="new-password"
            autoFocus
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.35em] text-slate-950 outline-none ring-amber-500 focus:ring-2"
            disabled={!enabled || busy}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            pattern="[0-9]{6}"
            required
            type="password"
            value={pin}
          />
        ) : (
          <input
            autoComplete="current-password"
            autoFocus
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.35em] text-slate-950 outline-none ring-amber-500 focus:ring-2"
            disabled={!enabled || busy}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            pattern="[0-9]{6}"
            required
            type="password"
            value={pin}
          />
        )}
      </label>
      {mode === "recover_pin" ? (
        <label className="block text-sm font-semibold text-slate-800">
          Confirm 6-digit Admin PIN
          <input
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.35em] text-slate-950 outline-none ring-amber-500 focus:ring-2"
            disabled={!enabled || busy}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) =>
              setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            pattern="[0-9]{6}"
            required
            type="password"
            value={confirmPin}
          />
        </label>
      ) : null}
      {error ? (
        <p aria-live="polite" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={
          !enabled ||
          busy ||
          pin.length !== 6 ||
          (mode === "recover_pin" && confirmPin.length !== 6)
        }
        type="submit"
      >
        {mode === "recover_pin"
          ? busy
            ? "Setting PIN…"
            : "Set Admin PIN"
          : busy
            ? "Signing in…"
            : "Sign in"}
      </button>
    </form>
  );
}
