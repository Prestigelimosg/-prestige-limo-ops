import Link from "next/link";
import { notFound } from "next/navigation";
import { collectionRules, findMockCustomer, mockCustomers } from "../_data/mock-customers";

type CustomerFolderPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

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
