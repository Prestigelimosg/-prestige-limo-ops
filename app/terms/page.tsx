import type { Metadata } from "next";

import { PublicInformationShell } from "../public-information-shell";

export const metadata: Metadata = {
  description: "Terms of Service for the Prestige Limo Ops driver Google Calendar connection.",
  title: "Terms of Service | Prestige Limo Ops",
};

export default function TermsOfServicePage() {
  return (
    <PublicInformationShell
      eyebrow="Effective 20 July 2026"
      intro="These terms govern use of the optional Prestige Limo Ops driver Google Calendar connection."
      title="Terms of Service"
    >
      <section>
        <h2 className="text-xl font-bold text-slate-950">Eligibility and authorization</h2>
        <p className="mt-2">
          The Calendar connection is for authorized Prestige Limo Ops drivers with a verified Driver Database
          identity and a current assigned booking. A driver may connect only a Google Account they are authorized
          to use and must keep every private Driver Job link and Calendar event confidential.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Calendar functionality</h2>
        <p className="mt-2">
          With the driver&apos;s permission, Prestige Limo Ops creates or updates one Google Calendar event for the
          assigned booking. The event is a convenience copy of the current safe job schedule and contains a private
          shortcut back to the established Driver Job reporting page. Prestige Limo Ops remains the operational source of truth;
          editing a Google event does not amend the saved booking.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Driver responsibilities</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Check the current Driver Job page for the latest dispatch instructions.</li>
          <li>Do not share the Calendar event or its private Driver Job shortcut.</li>
          <li>Do not connect another person&apos;s Google Account without authorization.</li>
          <li>Report suspected unauthorized access promptly to Prestige Limo Ops.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Revocation and availability</h2>
        <p className="mt-2">
          Connecting Google Calendar is optional. A driver may revoke access through Google Account permissions or
          request deletion of the stored connection. Prestige Limo Ops may suspend the integration to protect
          security, comply with law, or address provider or operational failures. Google services are provided by a
          third party and may experience delays or outages.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Disclaimers and responsibility</h2>
        <p className="mt-2">
          Drivers remain responsible for following current dispatch instructions and applicable road, safety, and
          transport requirements. To the extent permitted by law, Prestige Limo Ops is not responsible for losses
          caused solely by an unavailable third-party Calendar service, an unauthorized disclosure of a private job
          link, or reliance on a stale event after the application indicates that an update is needed.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Changes, governing law, and contact</h2>
        <p className="mt-2">
          We may update these terms when the Calendar feature or applicable requirements change. These terms are
          governed by the laws of Singapore. Questions, revocation support, or deletion requests may be sent to
          willsglimo@gmail.com.
        </p>
      </section>
    </PublicInformationShell>
  );
}
