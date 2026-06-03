import Link from "next/link";
import { notFound } from "next/navigation";
import {
  collectionRules,
  findMockCustomer,
  mockCustomers,
  type MockCustomer,
  type MockCustomerBooking,
} from "../_data/mock-customers";

type CustomerFolderPageProps = {
  params: Promise<{
    customerId: string;
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

export default async function MockCustomerFolderPage({ params }: CustomerFolderPageProps) {
  const { customerId } = await params;
  const customer = findMockCustomer(customerId);

  if (!customer) {
    notFound();
  }

  const upcomingJobs = customer.bookingHistory.filter((booking) => booking.jobStatus === "Upcoming");
  const completedJobs = customer.bookingHistory.filter((booking) => booking.jobStatus === "Completed");
  const jobHistorySnapshotRows = customer.bookingHistory.slice(0, 4);
  const paymentCollectionRows = getPaymentCollectionDetailRows(customer);
  const statementReadyRows = customer.accountType === "Monthly Account" ? paymentCollectionRows : [];
  const statementReadyTotal = formatMockCurrency(
    statementReadyRows.reduce((total, row) => total + parseMockCurrency(row.balanceDue), 0),
  );

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="border-b border-slate-200 pb-5">
          <Link className="text-sm font-semibold text-slate-600 underline underline-offset-4" href="/customers">
            Back to customer dashboard
          </Link>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Customer Folder</p>
              <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950">{customer.companyName}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Mock customer file. Local/mock only. No payment API, bank API, notification, or Supabase write is used.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              Outstanding balance: <strong>{customer.outstandingAmount}</strong>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" data-customer-folder-details="true">
            <h2 className="text-lg font-bold text-slate-950">Customer/company details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Account type</dt>
                <dd className="mt-1 text-slate-900">{customer.accountType}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Payment terms</dt>
                <dd className="mt-1 text-slate-900">{customer.paymentTerms}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Next follow-up date</dt>
                <dd className="mt-1 text-slate-900">{customer.nextFollowUpDate}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Contacts</h2>
            <div className="mt-4 space-y-3 text-sm">
              {customer.contacts.map((contact) => (
                <div className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0" key={contact.label}>
                  <p className="font-semibold text-slate-500">{contact.label}</p>
                  <p className="mt-1 text-slate-950">{contact.name}</p>
                  <p className="mt-1 text-slate-600">{contact.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Outstanding balance</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Outstanding</dt>
                <dd className="mt-1 text-xl font-bold text-slate-950">{customer.outstandingAmount}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Overdue</dt>
                <dd className="mt-1 text-xl font-bold text-rose-700">{customer.overdueAmount}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Paid this month</dt>
                <dd className="mt-1 font-bold text-emerald-700">{customer.paidThisMonth}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Status</dt>
                <dd className="mt-1 font-bold text-slate-900">{customer.paymentStatusSummary}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          data-customer-job-history-clarity={customer.id}
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Job history snapshot</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600" data-customer-job-history-clarity-helper="true">
                Read-only staff snapshot from this customer folder&apos;s existing booking history.
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {upcomingJobs.length} upcoming / {completedJobs.length} completed
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer/account</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{customer.companyName}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Visible history rows</p>
              <p className="mt-1 text-sm font-bold text-slate-950">{customer.bookingHistory.length}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer context</p>
              <p className="mt-1 text-sm font-bold text-slate-950">Recent trips and active bookings</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {jobHistorySnapshotRows.map((booking) => (
              <article
                className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm lg:grid-cols-[0.8fr_0.8fr_1.4fr_1fr_1.3fr]"
                data-customer-job-history-clarity-row={booking.invoiceNumber}
                key={`${booking.invoiceNumber}-snapshot`}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reference</p>
                  <p className="mt-1 font-bold text-slate-950">{booking.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pickup/trip date</p>
                  <p className="mt-1 font-semibold text-slate-900">{booking.date}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Route</p>
                  <p className="mt-1 leading-6 text-slate-700">{booking.route}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Customer-facing status
                  </p>
                  <p className="mt-1 font-semibold text-slate-900">{getCustomerSafeJobStatus(booking)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Request/change status
                  </p>
                  <p className="mt-1 leading-6 text-slate-700">{getCustomerSafeRequestStatus(booking)}</p>
                </div>
              </article>
            ))}
          </div>

          <p
            className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700"
            data-customer-job-history-readonly-boundary="true"
          >
            Read-only operational snapshot. No booking, request, change, cancellation, notification, or customer record
            is created or updated here.
          </p>
        </section>

        <section
          className="rounded-lg border border-slate-200 bg-white shadow-sm"
          data-payment-collection-detail={customer.id}
        >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Payment Collection Detail</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600" data-payment-collection-boundary="true">
                  Mock/read-only only. No payment record, invoice record, statement record, notification, bank record,
                  or Supabase row is created.
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600" data-payment-collection-isolation="true">
                  This folder only shows this selected customer&apos;s mock payment collection detail.
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-600">
                {paymentCollectionRows.length} active collection due row
                {paymentCollectionRows.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer/company</p>
              <p className="mt-1 text-base font-bold text-slate-950">{customer.companyName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Fixed invoice prefix</p>
              <p className="mt-1 text-base font-bold text-slate-950">{customer.invoicePrefix}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outstanding balance</p>
              <p className="mt-1 text-base font-bold text-slate-950">{customer.outstandingAmount}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Overdue balance</p>
              <p className="mt-1 text-base font-bold text-rose-700">{customer.overdueAmount}</p>
            </div>
          </div>

          <div className="border-t border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <h3 className="text-base font-bold text-slate-950">Outstanding invoice/reference rows</h3>
              <p className="text-sm text-slate-600">Paid items remain in history but are not collection due.</p>
            </div>

            {paymentCollectionRows.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {paymentCollectionRows.map((row) => (
                  <article
                    className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm lg:grid-cols-[0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_1.2fr]"
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
              className="border-t border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 sm:p-5"
              data-payment-collection-statement-readiness={customer.id}
            >
              <strong className="block text-slate-950">Statement readiness</strong>
              Monthly account can be grouped into statement later. Mock statement-ready total:{" "}
              <strong>{statementReadyTotal}</strong> across {statementReadyRows.length} active balance-due row
              {statementReadyRows.length === 1 ? "" : "s"}. No statement is generated, saved, sent, or numbered.
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" data-customer-invoice-rules="true">
          <h2 className="text-lg font-bold text-slate-950">Invoices</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm text-slate-600">
                Fixed invoice prefix: <strong>{customer.invoicePrefix}</strong>
              </p>
              <p className="mt-2 text-sm text-slate-600">Running examples: {customer.invoiceExamples.join(", ")}</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Invoice numbers are unique and must not be reused. Once issued, invoice numbers are immutable. Changing
                a customer invoice prefix later requires warning/protection because it can make invoice history messy.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2">Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.invoices.map((invoice) => (
                    <tr className="border-b border-slate-100 last:border-b-0" key={invoice.invoiceNumber}>
                      <td className="py-3 pr-4 font-bold text-slate-950">{invoice.invoiceNumber}</td>
                      <td className="py-3 pr-4 text-slate-700">{invoice.status}</td>
                      <td className="py-3 pr-4 text-slate-700">{invoice.amount}</td>
                      <td className="py-3 text-slate-700">{invoice.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" data-customer-booking-history="true">
          <h2 className="text-lg font-bold text-slate-950">All booking history</h2>
          <div className="mt-4 overflow-x-auto">
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

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Upcoming jobs</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              {upcomingJobs.map((booking) => (
                <li className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0" key={booking.invoiceNumber}>
                  <strong className="text-slate-950">{booking.invoiceNumber}</strong> - {booking.date}, {booking.service}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Completed jobs</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              {completedJobs.map((booking) => (
                <li className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0" key={booking.invoiceNumber}>
                  <strong className="text-slate-950">{booking.invoiceNumber}</strong> - {booking.date}, {booking.paymentStatus}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Payment history</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              {customer.paymentHistory.map((payment) => (
                <li className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0" key={payment.reference}>
                  <strong className="block text-slate-950">{payment.amount}</strong>
                  {payment.date} - {payment.method}
                  <span className="mt-1 block text-slate-500">{payment.reference}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Follow-up notes</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
              {customer.followUpNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Documents/receipts later</h2>
            <p className="mt-4 text-sm leading-6 text-slate-700">{customer.documentsPlaceholder}</p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Payment collection rules</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
            {collectionRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
