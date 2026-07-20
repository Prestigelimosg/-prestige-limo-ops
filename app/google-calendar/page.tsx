import type { Metadata } from "next";
import Link from "next/link";

import { PublicInformationShell } from "../public-information-shell";

export const metadata: Metadata = {
  description: "How Prestige Limo Ops uses Google Calendar for assigned driver jobs.",
  title: "Prestige Limo Ops",
};

const steps = [
  "An authorized driver opens the private Driver Job page for an assigned booking.",
  "The driver chooses Add / Update Calendar and grants the calendar.events permission directly to Google.",
  "Prestige Limo Ops creates or updates one assigned-job event in that driver's primary Google Calendar.",
  "The event provides the pickup schedule and a private shortcut back to the Driver Job page for reporting.",
];

export default function GoogleCalendarInformationPage() {
  return (
    <PublicInformationShell
      eyebrow="Public application home page"
      intro="Prestige Limo Ops is a limousine operations application used to manage bookings, dispatch assigned drivers, share current trip schedules, and collect driver job-status reports."
      title="Prestige Limo Ops"
    >
      <section>
        <h2 className="text-xl font-bold text-slate-950">Application purpose</h2>
        <p className="mt-2">
          Prestige Limo Ops gives limousine operations staff and their authorized drivers one operational source of
          truth for assigned trips. The optional Google Calendar connection keeps an assigned pickup schedule and
          the existing private Driver Job reporting shortcut together in one calendar event.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">What the Google Calendar integration does</h2>
        <ol className="mt-4 grid gap-3">
          {steps.map((step, index) => (
            <li className="flex gap-3 rounded-2xl bg-slate-50 p-4" key={step}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-black text-sky-900">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Permission and data boundary</h2>
        <div className="mt-4 space-y-3">
          <p>
            The application requests only the Google Calendar <code>calendar.events</code> scope. It uses that
            permission to create or update one assigned-job event with the booking reference, service type,
            pickup date and time, pickup location, route or flight details when available, a reminder, and the
            private Driver Job shortcut.
          </p>
          <p>
            Prestige Limo Ops does not import unrelated calendar events, does not add attendees, and does not
            send guest invitations or customer messages through this connection. The same deterministic event is
            updated after an approved trip amendment instead of creating another driver event.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <h2 className="text-xl font-bold text-sky-950">Driver control</h2>
        <p className="mt-2 text-sky-950">
          Connecting is optional. A driver can remove Prestige Limo Ops access from Google Account permissions
          and can request deletion of the stored connection by emailing willsglimo@gmail.com. Removing access
          stops future Calendar updates until the driver chooses to connect again.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">More information</h2>
        <p className="mt-2">
          Read the full <Link className="font-semibold text-sky-800 underline" href="/privacy">Privacy Policy</Link>{" "}
          and <Link className="font-semibold text-sky-800 underline" href="/terms">Terms of Service</Link> before
          connecting a Google Account.
        </p>
      </section>
    </PublicInformationShell>
  );
}
