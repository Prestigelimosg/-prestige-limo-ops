"use client";

import { useEffect, useRef, useState } from "react";

type Setup = { setupId: string; email: string; password?: string; activated: boolean; jobUrl: string };
type NativeWindow = Window & {
  __PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__?: Setup;
  __PRESTIGE_DRIVER_INSTALLATION_ID__?: string;
  ReactNativeWebView?: { postMessage: (value: string) => void };
};
type ActivationReply = { ok: boolean; account_ready?: boolean; error?: string };

export function DriverAccountActivation({ token, acknowledged, onReady }: {
  token: string;
  acknowledged: boolean;
  onReady: (accountReady: boolean) => void;
}) {
  const [message, setMessage] = useState("Activating your account…");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [activated, setActivated] = useState(false);
  const setup = useRef<Setup | undefined>(undefined);
  const ready = useRef(onReady);
  const complete = useRef(false);
  const pending = useRef<{ key: string; promise: Promise<ActivationReply> } | null>(null);

  useEffect(() => { ready.current = onReady; }, [onReady]);
  useEffect(() => {
    if (complete.current) return;
    const w = window as NativeWindow;
    if (!w.ReactNativeWebView) return;
    setup.current ??= w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__;
    delete w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__;
    const s = setup.current;
    if (!s) return;
    let live = true;
    const action = s.activated ? "resume" : "activate";
    const key = `${token}:${action}:${retry}`;
    // Effect replay must observe the same request, not reserve another Auth attempt.
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        promise: fetch(`/api/driver-job/${encodeURIComponent(token)}/account`, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "content-type": "application/json", "x-prestige-driver-purpose": "driver-account-activate" },
          body: JSON.stringify({ action, setup_id: s.setupId, installation_id: w.__PRESTIGE_DRIVER_INSTALLATION_ID__,
            ...(action === "activate" ? { email: s.email, password: s.password } : {}) }),
        }).then(async response => {
          const body = await response.json() as ActivationReply;
          return { ...body, ok: response.ok && body.ok === true };
        }),
      };
    }
    void pending.current.promise.then(body => {
      if (!live) return;
      if (!body.ok) {
        setFailed(true);
        setMessage(body.error || "Account activation could not be confirmed. Contact Admin before starting another setup.");
        return;
      }
      s.activated = true;
      delete s.password;
      complete.current = body.account_ready === true;
      w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "native_account_setup_activated", setup_id: s.setupId, complete: body.account_ready === true }));
      setActivated(true);
      setFailed(false);
      setMessage("Account activated. Review your details and tap Save & Acknowledge Job.");
      ready.current(body.account_ready === true);
    }).catch(() => {
      if (live) {
        setFailed(true);
        setMessage("Could not confirm activation. Check your connection, then tap Check activation. Do not start another setup.");
      }
    });
    return () => { live = false; };
  }, [token, acknowledged, retry]);

  return <section className="rounded-xl border border-sky-200 bg-sky-50 p-3" data-driver-account-activation="true">
    <p role="status">{activated && acknowledged && !failed ? "Account activated. Your job is acknowledged." : message}</p>
    {failed ? <button className="mt-2 min-h-11 rounded border px-3" onClick={() => {
      setFailed(false);
      setMessage("Checking activation…");
      setRetry(value => value + 1);
    }}>Check activation</button> : null}
  </section>;
}
