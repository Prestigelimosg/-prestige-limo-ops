import type { Metadata } from "next";

import { PublicInformationShell } from "../public-information-shell";

export const metadata: Metadata = {
  description: "Privacy Policy for Prestige SG Driver and its optional Google Calendar connection.",
  title: "Privacy Policy | Prestige Limo Ops",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicInformationShell
      eyebrow="Updated 1 October 2026"
      intro="This policy explains how Prestige Limo SG handles information in Prestige SG Driver, including assigned jobs, location sharing, photos, messages and the optional Google Calendar connection."
      title="Privacy Policy"
    >
      <section id="account-deletion" className="scroll-mt-6">
        <h2 className="text-xl font-bold text-slate-950">Request account and data deletion</h2>
        <div className="mt-3 space-y-3">
          <p>
            To request deletion of your Prestige SG Driver account and associated data, email
            info@prestigelimo.sg with the subject “Driver account deletion”. Include the email address registered
            to your Driver account. You can send this request even if you have uninstalled the app or cannot sign in.
            Never send a password, PIN, private Job Link or Google credential.
          </p>
          <p>
            We verify that the request comes from the account holder before acting. We review the account and
            associated data for deletion and explain any records retained for security, disputes or legal obligations.
            Sending a request does not immediately delete records, cancel an assigned trip or revoke app access.
            Contact dispatch separately about an active assignment. For questions about your request, use the same
            email address.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Scope of this policy</h2>
        <p className="mt-2">
          Prestige Limo SG operates Prestige SG Driver and the related private Driver Job pages through Prestige
          Limo Ops. The app lets drivers access assigned jobs, report progress, share trip location, send proof
          photos and messages, and optionally save jobs to their own Google Calendar. The Calendar connection is
          not required to view a private Driver Job page or report job status.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Driver app information and its use</h2>
        <div className="mt-3 space-y-3">
          <p>
            Account and job information includes the email address and sign-in credentials you provide, driver
            name, contact number, vehicle and registration plate, assigned job details and acknowledgement and
            status reports. We use this information to secure access, identify the assigned driver and coordinate
            transport services. The app uses a device installation identifier to support its one-phone account
            protection. Device biometric checks are handled by your phone; the app does not receive your biometric
            template.
          </p>
          <p>
            When you start trip location sharing, Prestige SG Driver collects and sends your precise location to
            Prestige dispatch for your assigned job, including when the app is not in use or the screen is locked.
            The customer for that trip can view eligible location updates during the permitted pickup window.
            Access depends on the current assignment, trip state and location freshness. You can use Stop Sharing
            in the Driver Job page or revoke location permission in phone Settings. Revoking permission can prevent
            live trip tracking from working.
          </p>
          <p>
            OTS photos are uploaded when you choose a photo and send it to Admin. Selecting or previewing a photo
            alone does not upload it. Messages are sent to the Admin or Customer channel you select for the job.
            We store these submissions and report timestamps to support dispatch, communication and service records.
          </p>
          <p>
            With notification permission, the app registers a device push token to deliver job alerts and messages.
            App version, device identifiers and technical error information may be processed to maintain security
            and diagnose delivery or access problems. You can change notification permission in phone Settings.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Access, service providers and retention</h2>
        <div className="mt-3 space-y-3">
          <p>
            Authorized Prestige staff use operational records to provide and support the transport service. Customers
            receive only information and messages made available for their own jobs. Hosting, storage, authentication
            and notification service providers process information needed to operate these features. Google processes
            Calendar data only when you choose to connect that feature, as described below. Driver information is
            not sold or used for advertising.
          </p>
          <p>
            Information is retained as needed to provide the service, maintain security, resolve disputes and meet
            applicable recordkeeping obligations. Temporary live-location markers and proof photos are subject to
            operational cleanup; stopping location sharing does not itself delete the account or job history.
            Account-deletion requests are reviewed separately, including any records that must be retained.
          </p>
        </div>
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
            info@prestigelimo.sg. Please identify the relevant driver account without sending passwords, private
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
