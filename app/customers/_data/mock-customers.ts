export type MockPaymentStatus =
  | "Invoice Sent"
  | "Monthly Account"
  | "Overdue"
  | "Paid"
  | "Partially Paid"
  | "Unpaid";

export type MockCustomerBooking = {
  balanceDue: string;
  date: string;
  invoiceNumber: string;
  jobStatus: "Completed" | "Upcoming";
  paymentStatus: MockPaymentStatus;
  route: string;
  service: string;
};

export type MockCustomerInvoice = {
  amount: string;
  dueDate: string;
  invoiceNumber: string;
  status: MockPaymentStatus;
};

export type MockCustomerPayment = {
  amount: string;
  date: string;
  method: string;
  reference: string;
};

export type MockCustomer = {
  accountType: string;
  bookingHistory: MockCustomerBooking[];
  companyName: string;
  contacts: Array<{
    label: string;
    name: string;
    value: string;
  }>;
  documentsPlaceholder: string;
  followUpNotes: string[];
  id: string;
  invoiceExamples: string[];
  invoicePrefix: string;
  invoices: MockCustomerInvoice[];
  nextFollowUpDate: string;
  outstandingAmount: string;
  overdueAmount: string;
  paidThisMonth: string;
  paymentHistory: MockCustomerPayment[];
  paymentStatusSummary: string;
  paymentTerms: string;
};

export const mockCustomers: MockCustomer[] = [
  {
    accountType: "Monthly Account",
    bookingHistory: [
      {
        balanceDue: "$640",
        date: "21 May 2026",
        invoiceNumber: "UBS-0003",
        jobStatus: "Completed",
        paymentStatus: "Overdue",
        route: "Changi Airport T3 > Marina Bay Financial Centre",
        service: "MNG Arrival",
      },
      {
        balanceDue: "$1,200",
        date: "27 May 2026",
        invoiceNumber: "UBS-0004",
        jobStatus: "Upcoming",
        paymentStatus: "Invoice Sent",
        route: "UBS office > Changi Airport T1",
        service: "DEP Departure",
      },
      {
        balanceDue: "$0",
        date: "08 May 2026",
        invoiceNumber: "UBS-0002",
        jobStatus: "Completed",
        paymentStatus: "Paid",
        route: "Raffles Place > Sentosa Cove",
        service: "TRF Transfer",
      },
    ],
    companyName: "UBS",
    contacts: [
      { label: "Account contact", name: "Mock operations desk", value: "+65 9000 0101" },
      { label: "Billing contact", name: "Mock accounts desk", value: "billing-ubs@example.test" },
    ],
    documentsPlaceholder: "Receipts and statement PDFs can be attached later after storage approval.",
    followUpNotes: [
      "Follow up on overdue UBS-0003 before monthly statement close.",
      "Group May jobs into a monthly account statement later.",
    ],
    id: "ubs",
    invoiceExamples: ["UBS-0001", "UBS-0002", "UBS-0003"],
    invoicePrefix: "UBS",
    invoices: [
      { amount: "$640", dueDate: "22 May 2026", invoiceNumber: "UBS-0003", status: "Overdue" },
      { amount: "$1,200", dueDate: "30 May 2026", invoiceNumber: "UBS-0004", status: "Invoice Sent" },
      { amount: "$780", dueDate: "10 May 2026", invoiceNumber: "UBS-0002", status: "Paid" },
    ],
    nextFollowUpDate: "29 May 2026",
    outstandingAmount: "$1,840",
    overdueAmount: "$640",
    paidThisMonth: "$780",
    paymentHistory: [
      {
        amount: "$780",
        date: "10 May 2026",
        method: "Manual bank transfer confirmation",
        reference: "Mock reference UBS-MAY-02",
      },
    ],
    paymentStatusSummary: "Monthly Account / Partially Paid",
    paymentTerms: "Monthly statement, manual confirmation before marking paid",
  },
  {
    accountType: "Individual",
    bookingHistory: [
      {
        balanceDue: "$0",
        date: "16 May 2026",
        invoiceNumber: "VIP-0002",
        jobStatus: "Completed",
        paymentStatus: "Paid",
        route: "Sentosa Cove > Esplanade",
        service: "DSP Hourly",
      },
      {
        balanceDue: "$1,700",
        date: "25 May 2026",
        invoiceNumber: "VIP-0003",
        jobStatus: "Upcoming",
        paymentStatus: "Invoice Sent",
        route: "Private residence > Changi Airport T3",
        service: "DEP Departure",
      },
    ],
    companyName: "Individual VIP Customer",
    contacts: [
      { label: "Primary contact", name: "Mock VIP assistant", value: "+65 9000 0303" },
    ],
    documentsPlaceholder: "Receipts can be attached later; no upload or storage exists in this mock UI.",
    followUpNotes: [
      "Payment requested for VIP-0003; keep reminder manual.",
      "No automated notification is sent from this mock dashboard.",
    ],
    id: "vip-customer",
    invoiceExamples: ["VIP-0001", "VIP-0002"],
    invoicePrefix: "VIP",
    invoices: [
      { amount: "$1,700", dueDate: "25 May 2026", invoiceNumber: "VIP-0003", status: "Invoice Sent" },
      { amount: "$1,100", dueDate: "17 May 2026", invoiceNumber: "VIP-0002", status: "Paid" },
    ],
    nextFollowUpDate: "25 May 2026",
    outstandingAmount: "$1,700",
    overdueAmount: "$0",
    paidThisMonth: "$1,100",
    paymentHistory: [
      {
        amount: "$1,100",
        date: "17 May 2026",
        method: "Manual cash receipt record",
        reference: "Mock receipt VIP-0002",
      },
    ],
    paymentStatusSummary: "Invoice Sent",
    paymentTerms: "Payment requested before pickup for future implementation review",
  },
  {
    accountType: "Test Account",
    bookingHistory: [],
    companyName: "Hourly Test Customer",
    contacts: [
      { label: "Test contact", name: "William hourly test", value: "+65 9000 0650" },
    ],
    documentsPlaceholder: "Local browser test customer only. No real customer documents.",
    followUpNotes: ["Use only for local browser hourly invoice calculation checks."],
    id: "hourly-test-customer",
    invoiceExamples: ["HTC-0001"],
    invoicePrefix: "HTC",
    invoices: [],
    nextFollowUpDate: "29 Jun 2026",
    outstandingAmount: "$0",
    overdueAmount: "$0",
    paidThisMonth: "$0",
    paymentHistory: [],
    paymentStatusSummary: "Test customer / no live balance",
    paymentTerms: "Mock/local browser invoice testing only",
  },
];

export const mockPaymentSummary = {
  followUpsToday: "3",
  overdue: "$1,020",
  paidThisMonth: "$2,570",
  totalOutstanding: "$4,340",
};

export const collectionRules = [
  "Completed job + balance due = Outstanding",
  "Due date passed + balance due = Overdue",
  "Partial payment keeps the remaining balance visible",
  "Paid booking disappears from outstanding list but remains in customer history",
  "Monthly account jobs can be grouped later into statements",
];

export function findMockCustomer(customerId: string) {
  return mockCustomers.find((customer) => customer.id === customerId);
}
