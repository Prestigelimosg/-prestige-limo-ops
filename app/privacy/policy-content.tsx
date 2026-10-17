export const privacyPolicyUpdated = "Updated 17 October 2026";
export const privacyPolicyIntro = "This policy explains how Prestige Limo SG handles information in Prestige SG Driver, Prestige Limo Sg (the Customer app, also labelled Prestige SG), and Prestige Limo Ops (the Admin app). It covers account access, transport services, messages, notifications and the optional Driver Google Calendar connection.";

export function PrivacyPolicyContent() {
  return (
    <>
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
            Customer and Admin account holders can contact info@prestigelimo.sg to request account and associated
            data deletion. State which app you use and identify your account without including a password, PIN,
            private access link or payment details. The same identity verification and retention review applies.
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
          Prestige Limo SG operates the Driver, Customer and Admin apps and their related web pages. Customer
          access is limited to the bookings and documents authorised for the signed-in account. Admin access is
          restricted to authorised staff. Prestige SG Driver and the related private Driver Job pages let drivers
          access assigned jobs, report progress, share trip location, send proof
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
        <h2 className="text-xl font-bold text-slate-950">Customer app information and its use</h2>
        <div className="mt-3 space-y-3">
          <p>
            We process account and sign-in information, verified company, booker and traveller relationships,
            contact details, booking requests, journey details, change or cancellation requests, trip replies
            and the invoices made available to your account. We use this information to secure access, arrange
            transport, coordinate your journeys and provide your service documents. Access is based on your
            verified account permissions, including any company, booker and traveller restrictions.
          </p>
          <p>
            Eligible pickup tracking displays the assigned driver&apos;s shared trip location. Viewing that map
            does not start location sharing from your own phone. Device identifiers, session information and
            notification tokens support account protection and booking or trip updates. Biometric checks are
            handled by your phone; the app does not receive your biometric template. If you save or share an
            invoice PDF, the destination you choose receives that document.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-950">Admin app information and its use</h2>
        <div className="mt-3 space-y-3">
          <p>
            The Admin app gives authorised Prestige staff access to the existing operations service. It processes
            staff sign-in and session information, device identifiers and notification tokens to protect access
            and deliver operational alerts. Biometric checks remain on the phone; the app does not receive your
            biometric template.
          </p>
          <p>
            Staff use customer, booker, traveller, booking and driver records, job reports, submitted photos,
            messages and eligible shared trip locations to manage transport and support requests. Staff access
            to customer service and billing records depends on their permissions. This staff access does not
            grant customers or drivers access to internal staff information or other customers&apos; records.
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
        <h2 className="text-xl font-bold text-slate-950">Maps, app updates and optional processing</h2>
        <div className="mt-3 space-y-3">
          <p>
            Admin operational maps and Customer trip maps use Google Maps. When these maps load, Google receives
            technical information such as your IP address and browser or device identifiers, and the map locations
            or coordinates requested. Admin address searches and route estimates send the requested locations to
            Google. Customer trip maps display the assigned driver&apos;s shared location; they do not start GPS
            sharing from the Customer&apos;s phone. Google may use and retain this information to provide and improve
            its services under the Google Privacy Policy at https://policies.google.com/privacy. The use of Google
            Maps is also subject to the Google Maps terms at https://www.google.com/help/terms_maps/.
          </p>
          <p>
            The Admin and Customer apps use Expo for app updates and permitted push notifications. Update requests
            include installation and app-version information and may include a saved fatal error or identifiers of
            updates that failed to launch. We use this information for app delivery, reliability and security.
            Notification permission controls push alerts; it does not turn off the app&apos;s necessary account or
            update processing. Hosting, database and delivery providers process information needed to operate these
            services on our behalf.
          </p>
          <p>
            When authorised Admin staff choose an AI assistance or booking-parsing action, the submitted text and,
            for a conversation, a limited recent conversation history are sent to OpenAI to provide the requested
            result. Email delivery providers process the recipients and message or document content needed for
            service emails. These actions do not give Customers or Drivers access to internal Admin information.
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
    </>
  );
}
