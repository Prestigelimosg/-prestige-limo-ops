import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type PublicInformationShellProps = {
  children: ReactNode;
  eyebrow: string;
  intro: string;
  title: string;
};

const navigation = [
  { href: "/google-calendar", label: "Google Calendar" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function PublicInformationShell({
  children,
  eyebrow,
  intro,
  title,
}: PublicInformationShellProps) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-950 px-6 py-8 text-white sm:px-10">
          <div className="flex items-center gap-4">
            <Image
              alt="Prestige Limo Ops"
              className="rounded-2xl"
              height={64}
              priority
              src="/icons/prestige-ops-icon-192.png"
              width={64}
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">{eyebrow}</p>
              <p className="mt-1 text-lg font-semibold">Prestige Limo Ops</p>
            </div>
          </div>
          <h1 className="mt-7 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">{intro}</p>
        </header>

        <nav aria-label="Public information" className="flex flex-wrap gap-2 border-b border-slate-200 px-6 py-4 sm:px-10">
          {navigation.map((item) => (
            <Link
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-sky-500 hover:text-sky-800"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <article className="space-y-8 px-6 py-8 text-[15px] leading-7 text-slate-700 sm:px-10 sm:py-10">
          {children}
        </article>

        <footer className="border-t border-slate-200 bg-slate-50 px-6 py-6 text-sm text-slate-600 sm:px-10">
          <p>
            Questions about Google Calendar access or these policies? Email{" "}
            <a className="font-semibold text-sky-800 underline" href="mailto:willsglimo@gmail.com">
              willsglimo@gmail.com
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
