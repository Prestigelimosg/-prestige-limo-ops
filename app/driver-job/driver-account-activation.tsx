"use client";

import { useEffect, useRef, useState } from "react";

type Setup = { setupId: string; email: string; password?: string; activated: boolean; jobUrl: string };
type NativeWindow = Window & {
  __PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__?: Setup;
  __PRESTIGE_DRIVER_INSTALLATION_ID__?: string;
  ReactNativeWebView?: { postMessage: (value: string) => void };
};
type ActivationReply = { ok: boolean; account_ready?: boolean; error?: string };
type ActivationSession = {
  token: string;
  installationId: string;
  setup: Setup;
  pending?: Promise<ActivationReply>;
};

// Document-local only: React remounts must not discard the native handoff or
// duplicate an in-flight activation. Never persist the PIN/proof in browser storage.
let activationSession: ActivationSession | undefined;

export function DriverAccountActivation({ token, acknowledged, onReady }: {
  token: string;
  acknowledged: boolean;
  onReady: (accountReady: boolean) => void;
}) {
  const [message, setMessage] = useState("Activating your account…");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [activated, setActivated] = useState(false);
  const ready = useRef(onReady);
  const complete = useRef<ActivationSession | undefined>(undefined);

  useEffect(() => { ready.current = onReady; }, [onReady]);
  useEffect(() => {
    const w = window as NativeWindow;
    const installationId = w.__PRESTIGE_DRIVER_INSTALLATION_ID__;
    const injected = w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__;
    delete w.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__;
    if (injected) {
      let matchesJob = false;
      try {
        const job = new URL(injected.jobUrl);
        matchesJob = job.origin === w.location.origin && job.pathname === `/driver-job/${token}`;
      } catch { /* An invalid or different Job Link cannot supply activation proof. */ }
      if (!matchesJob) activationSession = undefined;
      else if (activationSession?.token !== token || activationSession.installationId !== installationId
        || activationSession.setup.setupId !== injected.setupId) {
        activationSession = installationId ? { token, installationId, setup: injected } : undefined;
      }
    }
    const session = activationSession;
    let live = true;
    if (!w.ReactNativeWebView || !installationId || !session
      || session.token !== token || session.installationId !== installationId) {
      void Promise.resolve().then(() => {
        if (!live) return;
        setFailed(true);
        setMessage("Account setup is not available on this page. Reopen Admin's original Job Link in Prestige Driver, then tap Check activation. Do not create another account.");
      });
      return () => { live = false; };
    }
    if (complete.current === session) return;
    const s = session.setup;
    const action = s.activated ? "resume" : "activate";
    if (!session.pending) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      session.pending = fetch(`/api/driver-job/${encodeURIComponent(token)}/account`, {
          method: "POST", credentials: "same-origin", cache: "no-store",
          signal: controller.signal,
          headers: { "content-type": "application/json", "x-prestige-driver-purpose": "driver-account-activate" },
          body: JSON.stringify({ action, setup_id: s.setupId, installation_id: installationId,
            ...(action === "activate" ? { email: s.email, password: s.password } : {}) }),
        }).then(async response => {
          const body = await response.json() as ActivationReply;
          const reply = { ...body, ok: response.ok && body.ok === true };
          if (reply.ok) {
            // Preserve a successful response even if its first component unmounted.
            s.activated = true;
            delete s.password;
            if (activationSession === session) {
              w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "native_account_setup_activated", setup_id: s.setupId, complete: body.account_ready === true }));
            }
          }
          return reply;
        }).finally(() => { clearTimeout(timeout); session.pending = undefined; });
    }
    void session.pending.then(body => {
      if (!live || activationSession !== session) return;
      if (!body.ok) {
        setFailed(true);
        setMessage(body.error || "Account activation could not be confirmed. Contact Admin before starting another setup.");
        return;
      }
      if (body.account_ready === true) complete.current = session;
      setActivated(true);
      setFailed(false);
      setMessage("Account activated. Review your details and tap Save & Acknowledge Job.");
      ready.current(body.account_ready === true);
    }).catch(() => {
      if (live && activationSession === session) {
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
