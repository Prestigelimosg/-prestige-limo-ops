import Link from "next/link";
import {
  collectionRules,
  findMockCustomer,
  mockCustomers,
  type MockCustomer,
  type MockCustomerBooking,
} from "../_data/mock-customers";
import { CustomerInvoiceFolderPanel } from "./customer-invoice-folder-panel";
import { CustomerFolderSavedBookingsPanel } from "./saved-bookings-panel";

type CustomerFolderPageProps = {
  params: Promise<{
    customerId: string;
  }>;
  searchParams?: Promise<{
    name?: string;
  }>;
};

type PaymentCollectionDetailRow = {
  balanceDue: string;
  dueDate: string;
  followUpDate: string;
  invoiceNumber: string;
  key: string;
  paymentStatus: MockCustomerBooking["paymentStatus"];
  reason: string;
};

function getCustomerSafeJobStatus(booking: MockCustomerBooking) {
  return booking.jobStatus === "Upcoming" ? "Upcoming booking" : "Completed trip";
}

function getCustomerSafeRequestStatus(booking: MockCustomerBooking) {
  return booking.jobStatus === "Upcoming"
    ? "No request/change/cancellation update shown in this folder sample."
    : "Read-only completed trip history.";
}

function hasMockBalanceDue(balanceDue: string) {
  return Number(balanceDue.replace(/[^\d.-]/g, "")) > 0;
}

function parseMockCurrency(value: string) {
  return Number(value.replace(/[^\d.-]/g, ""));
}

function formatMockCurrency(value: number) {
  return `$${Math.max(0, Math.round(value)).toLocaleString("en-US")}`;
}

function getPaymentCollectionReason(customer: MockCustomer, booking: MockCustomerBooking) {
  if (booking.paymentStatus === "Overdue") {
    return "Due date passed + balance due = Overdue";
  }

  if (booking.paymentStatus === "Partially Paid") {
    return "Partial payment still has balance due";
  }

  if (booking.paymentStatus === "Invoice Sent") {
    return "Invoice sent but balance remains due";
  }

  if (customer.accountType === "Monthly Account") {
    return "Monthly account can be grouped into statement later";
  }

  return "Completed job + balance due = Outstanding";
}

function getPaymentCollectionDetailRows(customer: MockCustomer): PaymentCollectionDetailRow[] {
  return customer.bookingHistory
    .filter((booking) => booking.paymentStatus !== "Paid" && hasMockBalanceDue(booking.balanceDue))
    .map((booking) => ({
      balanceDue: booking.balanceDue,
      dueDate:
        customer.invoices.find((invoice) => invoice.invoiceNumber === booking.invoiceNumber)?.dueDate ??
        customer.nextFollowUpDate,
      followUpDate: customer.nextFollowUpDate,
      invoiceNumber: booking.invoiceNumber,
      key: `${customer.id}:${booking.invoiceNumber}`,
      paymentStatus: booking.paymentStatus,
      reason: getPaymentCollectionReason(customer, booking),
    }));
}

export function generateStaticParams() {
  return mockCustomers.map((customer) => ({
    customerId: customer.id,
  }));
}

function fallbackCustomerFolder(customerId: string, customerName: string): MockCustomer {
  const safeCustomerId = decodeURIComponent(customerId).trim() || "customer-account";
  const safeCustomerName = customerName.trim() || safeCustomerId;

  return {
    accountType: "Customer account",
    bookingHistory: [],
    companyName: safeCustomerName,
    contacts: [],
    documentsPlaceholder: "No customer documents are shown in this folder.",
    followUpNotes: ["Use Load Saved Bookings to read this customer's saved job references."],
    id: safeCustomerId,
    invoiceExamples: [],
    invoicePrefix: safeCustomerName
      .replace(/[^a-z0-9]+/gi, "")
      .slice(0, 4)
      .toUpperCase() || "CUST",
    invoices: [],
    nextFollowUpDate: "Review when saved jobs are loaded",
    outstandingAmount: "$0",
    overdueAmount: "$0",
    paidThisMonth: "$0",
    paymentHistory: [],
    paymentStatusSummary: "No invoice records loaded in this folder yet",
    paymentTerms: "Use existing guarded invoice workflow before sending customer billing.",
  };
}

export default async function MockCustomerFolderPage({ params, searchParams }: CustomerFolderPageProps) {
  const { customerId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const customer = findMockCustomer(customerId) ?? fallbackCustomerFolder(customerId, resolvedSearchParams.name ?? "");

  const upcomingJobs = customer.bookingHistory.filter((booking) => booking.jobStatus === "Upcoming");
  const completedJobs = customer.bookingHistory.filter((booking) => booking.jobStatus === "Completed");
  const jobHistorySnapshotRows = customer.bookingHistory.slice(0, 4);
  const paymentCollectionRows = getPaymentCollectionDetailRows(customer);
  const statementReadyRows = customer.accountType === "Monthly Account" ? paymentCollectionRows : [];
  const statementReadyTotal = formatMockCurrency(
    statementReadyRows.reduce((total, row) => total + parseMockCurrency(row.balanceDue), 0),
  );
  const latestServiceHistoryBooking = customer.bookingHistory[0];
  const latestServiceHistorySummary = latestServiceHistoryBooking
    ? [
        latestServiceHistoryBooking.date,
        latestServiceHistoryBooking.route,
        getCustomerSafeJobStatus(latestServiceHistoryBooking),
      ].join(" | ")
    : "No visible service history yet.";
  const latestServiceHistoryRequestStatus = latestServiceHistoryBooking
    ? getCustomerSafeRequestStatus(latestServiceHistoryBooking)
    : "No request/change/cancellation update shown in this folder sample.";
  const nextServiceHistoryAction =
    upcomingJobs.length > 0
      ? "Review upcoming trip details and safe request/change status before dispatch handoff."
      : "Review completed trip context before the next booking request.";

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="border-b border-slate-200 pb-4">
          <Link className="text-sm font-semibold text-slate-600 underline underline-offset-4" href="/customers">
            Back to customer dashboard
          </Link>
          <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Customer Folder</p>
              <h1 className="mt-1 text-2xl font-bold tracking-normal text-slate-950">{customer.companyName}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                Mock customer file. Local/mock only. No payment API, bank API, notification, or Supabase write is used.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              Outstanding balance: <strong>{customer.outstandingAmount}</strong>
            </div>
          </div>
        </header>

        <section
          className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
          data-customer-folder-compact-summary="true"
        >
          <div className="grid gap-3 text-sm md:grid-cols-[minmax(13rem,0.9fr)_minmax(14rem,1fr)_minmax(16rem,1fr)]">
            <dl className="grid gap-2" data-customer-folder-details="true">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Account type</dt>
                <dd className="mt-0.5 font-semibold text-slate-950">{customer.accountType}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Payment terms</dt>
                <dd className="mt-0.5 text-slate-800">{customer.paymentTerms}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Next follow-up</dt>
                <dd className="mt-0.5 font-semibold text-slate-950">{customer.nextFollowUpDate}</dd>
              </div>
            </dl>

            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Contacts</p>
              <div className="mt-1 divide-y divide-slate-100">
                {customer.contacts.map((contact) => (
                  <div className="grid gap-1 py-1 first:pt-0 last:pb-0 sm:grid-cols-[8rem_1fr]" key={contact.label}>
                    <p className="font-semibold text-slate-500">{contact.label}</p>
                    <p className="min-w-0 text-slate-800">
                      <span className="font-semibold text-slate-950">{contact.name}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span>{contact.value}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Outstanding</dt>
                <dd className="mt-0.5 text-lg font-bold text-slate-950">{customer.outstandingAmount}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Overdue</dt>
                <dd className="mt-0.5 text-lg font-bold text-rose-700">{customer.overdueAmount}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Paid this month</dt>
                <dd className="mt-0.5 font-bold text-emerald-700">{customer.paidThisMonth}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Status</dt>
                <dd className="mt-0.5 font-bold text-slate-900">{customer.paymentStatusSummary}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
          data-customer-account-service-history-handoff={customer.id}
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950">Customer Service History / Account Handoff</h2>
              <p
                className="mt-0.5 text-sm leading-5 text-slate-600"
                data-customer-account-service-history-helper="true"
              >
                Read-only staff handoff from this customer folder&apos;s visible service history.
              </p>
            </div>
            <p
              className="text-sm font-semibold text-slate-600"
              data-customer-account-service-history-count="true"
            >
              {customer.bookingHistory.length} visible service row
              {customer.bookingHistory.length === 1 ? "" : "s"}
            </p>
          </div>

          <dl
            className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-5"
            data-customer-account-service-history-summary="true"
          >
            <div className="min-w-0 border-t border-slate-200 pt-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer/account</dt>
              <dd className="mt-1 font-bold text-slate-950">{customer.companyName}</dd>
            </div>
            <div className="min-w-0 border-t border-slate-200 pt-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Upcoming / completed
              </dt>
              <dd className="mt-1 font-bold text-slate-950">
                {upcomingJobs.length} upcoming / {completedJobs.length} completed
              </dd>
            </div>
            <div className="min-w-0 border-t border-slate-200 pt-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Latest safe service
              </dt>
              <dd className="mt-1 leading-5 text-slate-700">{latestServiceHistorySummary}</dd>
            </div>
            <div className="min-w-0 border-t border-slate-200 pt-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Request/change status
              </dt>
              <dd className="mt-1 leading-5 text-slate-700">{latestServiceHistoryRequestStatus}</dd>
            </div>
            <div className="min-w-0 border-t border-slate-200 pt-2">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Next staff action</dt>
              <dd className="mt-1 leading-5 text-slate-700">{nextServiceHistoryAction}</dd>
            </div>
          </dl>

          <p
            className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700"
            data-customer-account-service-history-boundary="true"
          >
            Read-only handoff. No invoice/payment, document, customer notification, customer record change, or booking
            change is created here.
          </p>
        </section>

        <CustomerFolderSavedBookingsPanel customerId={customer.id} customerName={customer.companyName} />

        <section
          className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
          data-customer-job-history-clarity={customer.id}
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950">Job history snapshot</h2>
              <p className="mt-0.5 text-sm leading-5 text-slate-600" data-customer-job-history-clarity-helper="true">
                Read-only staff snapshot from this customer folder&apos;s existing booking history.
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {upcomingJobs.length} upcoming / {completedJobs.length} completed
            </p>
          </div>

          <div
            className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
            data-customer-job-history-compact-summary="true"
          >
            <span>{customer.companyName}</span>
            <span>{customer.bookingHistory.length} visible history rows</span>
            <span>{upcomingJobs.length} upcoming</span>
            <span>{completedJobs.length} completed</span>
          </div>

          <div className="mt-3 max-h-80 overflow-auto" data-customer-job-history-compact-table="true">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                  <th className="px-3 py-2 font-bold">Reference</th>
                  <th className="px-3 py-2 font-bold">Date</th>
                  <th className="px-3 py-2 font-bold">Route</th>
                  <th className="px-3 py-2 font-bold">Status</th>
                  <th className="px-3 py-2 font-bold">Request/change</th>
                </tr>
              </thead>
              <tbody>
                {jobHistorySnapshotRows.map((booking) => (
                  <tr
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    data-customer-job-history-clarity-row={booking.invoiceNumber}
                    key={`${booking.invoiceNumber}-snapshot`}
                  >
                    <td className="px-3 py-2 font-bold text-slate-950">{booking.invoiceNumber}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{booking.date}</td>
                    <td className="px-3 py-2">
                      <p className="max-w-[22rem] truncate text-slate-700">{booking.route}</p>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{getCustomerSafeJobStatus(booking)}</td>
                    <td className="px-3 py-2">
                      <p className="max-w-[22rem] truncate text-slate-700">{getCustomerSafeRequestStatus(booking)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p
            className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700"
            data-customer-job-history-readonly-boundary="true"
          >
            Read-only operational snapshot. No booking, request, change, cancellation, notification, or customer record
            is created or updated here.
          </p>
        </section>

        <section
          className="rounded-md border border-slate-200 bg-white shadow-sm"
          data-payment-collection-detail={customer.id}
        >
          <div className="border-b border-slate-200 p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950">Payment Collection Detail</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-600" data-payment-collection-boundary="true">
                  Mock/read-only only. No payment record, invoice record, statement record, notification, bank record,
                  or Supabase row is created.
                </p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600" data-payment-collection-isolation="true">
                  This folder only shows this selected customer&apos;s mock payment collection detail.
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-600">
                {paymentCollectionRows.length} active collection due row
                {paymentCollectionRows.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>

          <div className="grid gap-3 p-3 text-sm lg:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer/company</p>
              <p className="mt-1 font-bold text-slate-950">{customer.companyName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Fixed invoice prefix</p>
              <p className="mt-1 font-bold text-slate-950">{customer.invoicePrefix}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Outstanding balance</p>
              <p className="mt-1 font-bold text-slate-950">{customer.outstandingAmount}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Overdue balance</p>
              <p className="mt-1 font-bold text-rose-700">{customer.overdueAmount}</p>
            </div>
          </div>

          <div className="border-t border-slate-200 p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <h3 className="text-sm font-bold text-slate-950">Outstanding invoice/reference rows</h3>
              <p className="text-sm text-slate-600">Paid items remain in history but are not collection due.</p>
            </div>

            {paymentCollectionRows.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {paymentCollectionRows.map((row) => (
                  <article
                    className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm lg:grid-cols-[0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_1.2fr]"
                    data-payment-collection-row={row.key}
                    key={row.key}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Invoice</p>
                      <p className="mt-1 font-bold text-slate-950">{row.invoiceNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Status</p>
                      <p className="mt-1 font-semibold text-slate-900">{row.paymentStatus}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Balance Due</p>
                      <p className="mt-1 font-bold text-slate-950">{row.balanceDue}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Due Date</p>
                      <p className="mt-1 font-semibold text-slate-900">{row.dueDate}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Follow-up Date</p>
                      <p className="mt-1 font-semibold text-slate-900">{row.followUpDate}</p>
                    </div>
                    <p className="leading-6 text-slate-700">{row.reason}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div
                className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600"
                data-payment-collection-empty="true"
              >
                No active mock collection due rows for this selected customer.
              </div>
            )}
          </div>

          {statementReadyRows.length > 0 ? (
            <div
              className="border-t border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-700"
              data-payment-collection-statement-readiness={customer.id}
            >
              <strong className="block text-slate-950">Statement readiness</strong>
              Monthly account can be grouped into statement later. Mock statement-ready total:{" "}
              <strong>{statementReadyTotal}</strong> across {statementReadyRows.length} active balance-due row
              {statementReadyRows.length === 1 ? "" : "s"}. No statement is generated, saved, sent, or numbered.
            </div>
          ) : null}
        </section>

        <CustomerInvoiceFolderPanel customer={customer} />

        <section className="rounded-md border border-slate-200 bg-white p-3 shadow-sm" data-customer-booking-history="true">
          <h2 className="text-base font-bold text-slate-950">All booking history</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Job</th>
                  <th className="py-2 pr-4">Route</th>
                  <th className="py-2 pr-4">Invoice</th>
                  <th className="py-2 pr-4">Payment status</th>
                  <th className="py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {customer.bookingHistory.map((booking) => (
                  <tr className="border-b border-slate-100 last:border-b-0" key={`${booking.invoiceNumber}-${booking.date}`}>
                    <td className="py-3 pr-4 text-slate-700">{booking.date}</td>
                    <td className="py-3 pr-4 text-slate-700">
                      <strong className="block text-slate-950">{booking.jobStatus}</strong>
                      {booking.service}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{booking.route}</td>
                    <td className="py-3 pr-4 font-bold text-slate-950">{booking.invoiceNumber}</td>
                    <td className="py-3 pr-4 text-slate-700">{booking.paymentStatus}</td>
                    <td className="py-3 text-slate-700">{booking.balanceDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
          data-customer-folder-compact-admin-rows="true"
        >
          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <h2 className="text-base font-bold text-slate-950">Payment history</h2>
              <ul className="mt-2 divide-y divide-slate-100 text-sm text-slate-700">
                {customer.paymentHistory.map((payment) => (
                  <li className="grid gap-2 py-2 first:pt-0 last:pb-0 sm:grid-cols-[6rem_1fr_9rem]" key={payment.reference}>
                    <strong className="text-slate-950">{payment.amount}</strong>
                    <span>{payment.date} - {payment.method}</span>
                    <span className="text-slate-500">{payment.reference}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-950">Follow-up notes</h2>
              <ul className="mt-2 space-y-1 text-sm leading-5 text-slate-700">
                {customer.followUpNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-950">Documents/receipts later</h2>
              <p className="mt-2 text-sm leading-5 text-slate-700">{customer.documentsPlaceholder}</p>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">Payment collection rules</h2>
          <ul className="mt-2 grid gap-1 text-sm leading-5 text-slate-700 md:grid-cols-2">
            {collectionRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
