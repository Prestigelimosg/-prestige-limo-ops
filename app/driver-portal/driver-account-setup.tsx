"use client";
import { useEffect, useState } from "react";
import { driverAccountPasswordIsReady } from "../../lib/driver-account-password";
type SetupWindow = Window & { __PRESTIGE_DRIVER_ACCOUNT_SETUP__?: {supported:boolean;pending:boolean;attempted:boolean}; ReactNativeWebView?:{postMessage:(value:string)=>void} };
export function nativeAccountSetupState() { return typeof window !== "undefined" ? (window as SetupWindow).__PRESTIGE_DRIVER_ACCOUNT_SETUP__ : undefined; }
export function DriverAccountSetup({pending,onCancel}:{pending:boolean;onCancel:()=>void}) {
  const [email,setEmail]=useState(""); const [pin,setPin]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  useEffect(()=>{ const done=(event:Event)=>{const result=(event as CustomEvent<{ok:boolean;error?:string}>).detail;setBusy(false);setPin("");setError(result?.error||"");};window.addEventListener("prestige-driver-account-setup-result",done);return()=>window.removeEventListener("prestige-driver-account-setup-result",done);},[]);
  function send(type:string) { if(busy)return;setBusy(true);setError("");(window as SetupWindow).ReactNativeWebView?.postMessage(JSON.stringify({type,...(type==="native_account_setup_save"?{email:email.trim().toLowerCase(),password:pin}:{})})); }
  return <section className="space-y-3 rounded-xl border bg-white p-4" data-driver-account-pending-setup="true">
    <h2 className="text-lg font-bold">{pending?"Activation required":"Create your Driver account"}</h2>
    {pending?<><p>Setup is waiting for activation.</p><p className="font-semibold">Return to Admin&apos;s message and tap your Job Link. It will open Prestige Driver to activate your account.</p><p>After activation, review the job and tap Save &amp; Acknowledge Job.</p>{!nativeAccountSetupState()?.attempted?<button className="min-h-11 rounded border px-3" disabled={busy} onClick={()=>send("native_account_setup_cancel")}>Cancel setup</button>:null}<button type="button" className="min-h-11 underline" disabled={busy} onClick={onCancel}>Already have an account? Sign in</button></>:<form className="space-y-3" onSubmit={e=>{e.preventDefault();send("native_account_setup_save");}}>
      <p>Enter your email and choose a six-digit PIN. You need Admin&apos;s private Job Link to activate this account.</p>
      <label className="block">Email<input className="mt-1 min-h-11 w-full rounded border p-2" type="email" required maxLength={254} autoCapitalize="none" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="block">6-digit PIN<input className="mt-1 min-h-11 w-full rounded border p-2" type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}/></label>
      <p className="text-sm">Use six digits. Repeated or sequential PINs are not allowed.</p>
      <button className="min-h-12 w-full rounded bg-slate-950 p-3 font-semibold text-white disabled:opacity-50" disabled={busy||!email.trim()||!driverAccountPasswordIsReady(pin)}>{busy?"Saving setup…":"Save account setup"}</button>
      <button type="button" className="min-h-11 underline" disabled={busy} onClick={onCancel}>Already have an account? Sign in</button>
    </form>}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
