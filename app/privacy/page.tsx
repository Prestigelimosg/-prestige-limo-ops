import type { Metadata } from "next";

import { PublicInformationShell } from "../public-information-shell";

export const metadata: Metadata = {
  description: "Privacy Policy for Prestige Limo Ops and its optional driver Google Calendar connection.",
  title: "Privacy Policy | Prestige Limo Ops",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicInformationShell
      eyebrow="Effective 20 July 2026"
      intro="This policy explains the Google user data handled by the optional Prestige Limo Ops driver Calendar connection and the controls available to drivers."
      title="Privacy Policy"
    >
      <section>
        <h2 className="text-xl font-bold text-slate-950">Scope of this policy</h2>
        <p className="mt-2">
          Prestige Limo Ops provides operational booking and driver-job tools. This policy focuses on the optional
          Google Calendar connection used by a verified, currently assigned driver. The connection is not required
          to view the private Driver Job page or report job status.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Google data we access and how we use it</h2>
        <div className="mt-3 space-y-3">
          <p>
            We request only <code>https://www.googleapis.com/auth/calendar.events</code>. The application uses this
            permission to create or update one deterministic event for a driver&apos;s assigned Prestige booking in
            the driver&apos;s primary Google Calendar.
          </p>
          <p>
            The event may contain the booking reference, service type, pickup date and time, pickup location,
            route, flight number when available, a one-hour reminder, and a private link back to the Driver Job
            page. The application does not read or import unrelated events, does not add attendees, and does not
            use Google Calendar data for advertising, profiling, or artificial-intelligence model training.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Data we store</h2>
        <div className="mt-3 space-y-3">
          <p>
            When a driver grants access, Google provides an OAuth refresh credential. Prestige Limo Ops stores the
            refresh credential encrypted at rest and associates it only with the verified Driver Database identity.
            Browser users cannot read the credential table. Short-lived Google access tokens are used server-side
            and are not retained as the persistent connection record.
          </p>
          <p>
            We also retain the deterministic Google event identifier, a safe event-revision fingerprint, and the
            latest successful Calendar-save time on the existing private Driver Job record. These values let the
            application update the same event and show whether a trip amendment needs another Calendar update.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Sharing and limited use</h2>
        <p className="mt-2">
          Google user data is transmitted to Google to provide the requested Calendar feature and may be processed
          by infrastructure providers that operate Prestige Limo Ops under confidentiality and security controls.
          We do not sell Google user data or share it for advertising. Our use and transfer of information received
          from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use
          requirements.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Retention, revocation, and deletion</h2>
        <div className="mt-3 space-y-3">
          <p>
            We retain the encrypted connection while the driver uses the Calendar feature or while it is reasonably
            required to provide that feature, maintain security, or meet legal obligations. A driver can revoke
            access at any time from Google Account permissions. Revocation prevents future access unless the driver
            grants permission again.
          </p>
          <p>
            To request deletion of the server-stored Google connection or ask a privacy question, email
            willsglimo@gmail.com. Please identify the relevant driver account without sending passwords, private
            Driver Job links, or Google credentials. We will verify the requester before deleting connection data.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Security and policy changes</h2>
        <p className="mt-2">
          We use access controls, server-only credential handling, encryption, and private job links to reduce risk.
          No online service can guarantee absolute security. We may update this policy when the feature or legal
          requirements change; the effective date above will be updated when material changes are published.
        </p>
      </section>
    </PublicInformationShell>
  );
}
