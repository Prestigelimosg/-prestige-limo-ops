import Link from "next/link";
import {
  findMockCustomer,
  mockCustomers,
  type MockCustomer,
} from "../_data/mock-customers";
import { CustomerInvoiceFolderPanel } from "./customer-invoice-folder-panel";
import { CustomerCompanyProfileEditor } from "./customer-company-profile-editor";
import { CustomerFolderSavedBookingsPanel } from "./saved-bookings-panel";

type CustomerFolderPageProps = {
  params: Promise<{
    customerId: string;
  }>;
  searchParams?: Promise<{
    name?: string;
  }>;
};

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

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="border-b border-slate-200 pb-4">
          <Link className="text-sm font-semibold text-slate-600 underline underline-offset-4" href="/customers">
            Back to customer dashboard
          </Link>
          <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Customer company profile</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-normal text-slate-950">{customer.companyName}</h1>
                <CustomerCompanyProfileEditor customerId={customer.id} customerName={customer.companyName} />
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                Review this customer&apos;s profile, invoices, due balance, and billing status before any guarded
                invoice action.
              </p>
            </div>
          </div>
        </header>

        <CustomerInvoiceFolderPanel customer={customer} />

        <CustomerFolderSavedBookingsPanel customerId={customer.id} customerName={customer.companyName} />

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

      </div>
    </main>
  );
}
