import Image from "next/image";

import { adminAccountAuthIsEnabled } from "../../lib/admin-account-session.ts";
import { AdminSignInForm } from "./admin-sign-in-form";

export const dynamic = "force-dynamic";

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ return_to?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const returnTo = typeof resolvedSearchParams.return_to === "string"
    ? resolvedSearchParams.return_to
    : "/";
  const enabled = adminAccountAuthIsEnabled();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-slate-950">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Image
            alt="Prestige SG Admin"
            className="rounded-lg"
            height={44}
            priority
            src="/icons/prestige-ops-icon-192.png"
            width={44}
          />
          <div>
            <h1 className="text-xl font-bold">Prestige SG Admin</h1>
            <p className="text-sm text-slate-600">Admin sign in · verified owner access</p>
          </div>
        </div>
        {!enabled ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Admin account sign-in is not configured. Operations remain locked on this surface.
          </p>
        ) : null}
        <AdminSignInForm enabled={enabled} returnTo={returnTo} />
      </section>
    </main>
  );
}
