"use client";

import { useSyncExternalStore } from "react";

type AndroidAppRole = "driver" | "admin" | "customer";

// Advance only after the exact signed APK is published and its anonymous download verified.
// These are APK versionCodes, never web commits or iOS/Expo runtime versions.
export const androidAppReleases = {
  driver: { build: 16, name: "Driver", url: "https://drive.usercontent.google.com/uc?id=1eRbvPP_bTLr2tbWM15O5_qutFqi3vx8S&export=download" },
  admin: { build: 7, name: "Admin", url: "https://drive.usercontent.google.com/uc?id=1zofh8u_QY0-xAsqkM8eN6G7IYp9chqw2&export=download" },
  customer: { build: 7, name: "Customer", url: "https://drive.usercontent.google.com/uc?id=1a2uhL39Fn1JyxaPz8zPfNo9RjnQPJnPa&export=download" },
} as const;

type UpdateWindow = Window & {
  ReactNativeWebView?: { postMessage?: unknown };
  __PRESTIGE_ANDROID_APP__?: { role?: unknown; build?: unknown };
  __PRESTIGE_DRIVER_NATIVE_APP__?: boolean;
  __PRESTIGE_DRIVER_INSTALLATION_ID__?: string;
  __PRESTIGE_ADMIN_NATIVE_APP__?: boolean;
  __PRESTIGE_ADMIN_INSTALLATION_ID__?: string;
  __prestigeCustomerInstallationId?: string;
  __prestigeCustomerNativeAlerts?: { available?: boolean };
};

export function readAndroidAppUpdateState(role: AndroidAppRole): "hidden" | "download" | "update" {
  if (typeof window === "undefined") return "hidden";
  const native = window as UpdateWindow;
  if (!/\bAndroid\b/i.test(native.navigator.userAgent) || typeof native.ReactNativeWebView?.postMessage !== "function") return "hidden";
  const installationId = role === "driver" ? native.__PRESTIGE_DRIVER_INSTALLATION_ID__
    : role === "admin" ? native.__PRESTIGE_ADMIN_INSTALLATION_ID__ : native.__prestigeCustomerInstallationId;
  const appPresent = role === "driver" ? native.__PRESTIGE_DRIVER_NATIVE_APP__ === true
    : role === "admin" ? native.__PRESTIGE_ADMIN_NATIVE_APP__ === true : native.__prestigeCustomerNativeAlerts?.available === true;
  if (!appPresent || typeof installationId !== "string" || !installationId) return "hidden";
  const installed = native.__PRESTIGE_ANDROID_APP__;
  if (installed?.role !== undefined && installed.role !== role) return "hidden";
  const build = installed?.build;
  if (installed?.role !== role || typeof build !== "string" || !/^[1-9]\d{0,9}$/.test(build) || Number(build) > 2147483647) return "download";
  return Number(build) < androidAppReleases[role].build ? "update" : "hidden";
}

const subscribe = () => () => {};
const serverSnapshot = () => "hidden" as const;

export function AndroidAppUpdate({ role, dark = false }: { role: AndroidAppRole; dark?: boolean }) {
  const state = useSyncExternalStore(subscribe, () => readAndroidAppUpdateState(role), serverSnapshot);
  if (state === "hidden") return null;
  const release = androidAppReleases[role];
  return (
    <div className={`mt-3 border-t pt-3 ${dark ? "border-slate-700" : "border-slate-200"}`} data-android-app-update={role}>
      <a
        className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm font-semibold ${dark ? "border-slate-500 text-white" : "border-slate-400 text-slate-950"}`}
        data-driver-portal-update-download={role === "driver" ? "true" : undefined}
        data-android-app-update-download={role}
        href={release.url}
        referrerPolicy="no-referrer"
        rel="noopener noreferrer"
        target="_blank"
      >
        {state === "update" ? `Update ${release.name} App` : `Download ${release.name} App`}
      </a>
      <p className={`mt-1 text-xs leading-5 ${dark ? "text-slate-300" : "text-slate-600"}`}>
        {state === "update" ? "A newer Android version is available. Install it over this app. Do not uninstall." : "If you need the latest Android version, install it over this app. Do not uninstall."}
      </p>
    </div>
  );
}
