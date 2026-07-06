"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadCustomerPortalSavedBookings,
  type CustomerPortalBooking,
} from "../../lib/customer-portal-saved-bookings-adapter";
import {
  loadCustomerPortalDriverTracking,
  type CustomerPortalDriverTrackingResult,
} from "../../lib/customer-portal-driver-tracking-adapter";
import {
  loadCustomerPortalTripUpdates,
  type CustomerPortalTripUpdatesResult,
} from "../../lib/customer-portal-trip-updates-adapter";
import { submitCustomerPortalBookingChangeRequest } from "../../lib/customer-portal-booking-change-request-adapter";
import {
  fetchCustomerPortalInvoicePdf,
  loadCustomerPortalInvoiceRecords,
  type CustomerPortalInvoiceRecord,
} from "../../lib/customer-portal-invoices-adapter";
import {
  companyProfileContactLines,
  defaultCompanyProfile,
  type PublicCompanyProfile,
} from "../../lib/company-profile-shared";
import { loadPublicCompanyProfile } from "../../lib/public-company-profile-adapter";

type BookingFilter = "Cancelled" | "Completed" | "Upcoming";
type InvoiceFolder = "Credit Notes" | "Paid Invoices" | "Quotations" | "Unpaid Invoices";
type InvoiceDownloadState = "downloaded" | "downloading" | "failed";
type PortalSection = "New Booking Request" | "Invoices" | BookingFilter;
type PortalBookingsLoadState = "blocked" | "loading" | "ready";
type PortalInvoicesLoadState = "blocked" | "loading" | "stored";
type DriverTrackingByBookingId = Record<string, CustomerPortalDriverTrackingResult>;
type TripUpdatesByBookingId = Record<string, CustomerPortalTripUpdatesResult>;

type BookingRequestFeedback = {
  tone: "info" | "success" | "error";
  text: string;
};

type BookingChangeRequestMode = "amendment" | "cancellation";

type BookingChangeRequestDraft = {
  bookingId: string;
  requestKind: BookingChangeRequestMode;
  requestNote: string;
  requestedDropoffLocation: string;
  requestedPickupDate: string;
  requestedPickupLocation: string;
  requestedPickupTime: string;
};

const visibleBookingLimit = 10;

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const bookingFilters: BookingFilter[] = ["Upcoming", "Completed", "Cancelled"];
const bookingFilterSet = new Set<PortalSection>(bookingFilters);
const invoiceFolders: InvoiceFolder[] = [
  "Quotations",
  "Unpaid Invoices",
  "Paid Invoices",
  "Credit Notes",
];
const portalSections: PortalSection[] = ["New Booking Request", "Invoices", ...bookingFilters];

const initialBookingPages: Record<BookingFilter, number> = {
  Cancelled: 1,
  Completed: 1,
  Upcoming: 1,
};

const initialSelectedBookingMonths: Record<BookingFilter, string> = {
  Cancelled: "",
  Completed: "",
  Upcoming: "",
};

function rowMatchesFilter(booking: CustomerPortalBooking, filter: BookingFilter) {
  if (filter === "Completed") {
    return booking.status === "Completed";
  }

  if (filter === "Cancelled") {
    return booking.status === "Cancelled";
  }

  return booking.status !== "Completed" && booking.status !== "Cancelled";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getBookingMonthInfo(booking: CustomerPortalBooking) {
  const [dateText = ""] = booking.pickupDateTime.split(",");
  const [dayText = "", monthText = "", yearText = ""] = dateText.trim().split(" ");
  const monthIndex = monthNames.indexOf(monthText);
  const year = Number(yearText);
  const day = Number(dayText);

  if (monthIndex < 0 || !Number.isFinite(year) || !Number.isFinite(day)) {
    return {
      key: "",
      label: "Date to confirm",
      sortValue: 0,
    };
  }

  return {
    key: `${yearText}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: `${monthText} ${yearText}`,
    sortValue: Date.UTC(year, monthIndex, day),
  };
}

function getCurrentPortalMonthInfo(date = new Date()) {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();

  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: `${monthNames[monthIndex]} ${year}`,
  };
}

function fieldClass(hasError = false) {
  return [
    "mt-1 min-h-10 w-full rounded-md border bg-white px-2.5 py-1.5 font-sans text-sm font-normal text-slate-950 shadow-sm outline-none transition",
    "focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
    hasError ? "border-red-400" : "border-slate-300",
  ].join(" ");
}

function feedbackClass(tone: BookingRequestFeedback["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-900";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function canRequestBookingReview(booking: CustomerPortalBooking) {
  return booking.status !== "Completed" && booking.status !== "Cancelled";
}

function bookingReferenceFromPortalId(value: string) {
  return value.startsWith("saved-") ? value.slice("saved-".length) : "";
}

function customerPortalInvoiceFolder(invoice: CustomerPortalInvoiceRecord): InvoiceFolder {
  if (invoice.documentType === "quotation") {
    return "Quotations";
  }

  if (invoice.documentType === "credit_note") {
    return "Credit Notes";
  }

  return invoice.status === "Paid" ? "Paid Invoices" : "Unpaid Invoices";
}

function invoiceFolderSlug(folder: InvoiceFolder) {
  return folder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function invoiceFolderDateHeading(folder: InvoiceFolder) {
  if (folder === "Paid Invoices") {
    return "Paid date";
  }

  if (folder === "Quotations") {
    return "Quote date";
  }

  if (folder === "Credit Notes") {
    return "Credit date";
  }

  return "Due date";
}

function invoiceFolderRowDate(folder: InvoiceFolder, invoice: CustomerPortalInvoiceRecord) {
  return folder === "Unpaid Invoices" ? invoice.dueDateLabel : invoice.issueDateLabel;
}

function downloadBrowserBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export default function CustomerPortalPage() {
  const [activeSection, setActiveSection] = useState<PortalSection>("Upcoming");
  const [companyProfile, setCompanyProfile] =
    useState<PublicCompanyProfile>(defaultCompanyProfile);
  const [expandedBookingId, setExpandedBookingId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [changeFeedback, setChangeFeedback] = useState<Record<string, BookingRequestFeedback>>({});
  const [changeRequestDraft, setChangeRequestDraft] = useState<BookingChangeRequestDraft | null>(null);
  const [changeRequestSubmittingId, setChangeRequestSubmittingId] = useState("");
  const [portalBookings, setPortalBookings] = useState<CustomerPortalBooking[]>([]);
  const [portalBookingsLoadState, setPortalBookingsLoadState] =
    useState<PortalBookingsLoadState>("loading");
  const [driverTrackingByBookingId, setDriverTrackingByBookingId] =
    useState<DriverTrackingByBookingId>({});
  const [checkingDriverTrackingId, setCheckingDriverTrackingId] = useState("");
  const [activeTrackingBookingId, setActiveTrackingBookingId] = useState("");
  const [tripUpdatesByBookingId, setTripUpdatesByBookingId] = useState<TripUpdatesByBookingId>({});
  const [checkingTripUpdatesId, setCheckingTripUpdatesId] = useState("");
  const [bookingPages, setBookingPages] = useState<Record<BookingFilter, number>>(initialBookingPages);
  const [selectedBookingMonths, setSelectedBookingMonths] =
    useState<Record<BookingFilter, string>>(initialSelectedBookingMonths);
  const [customerInvoiceRecords, setCustomerInvoiceRecords] = useState<CustomerPortalInvoiceRecord[]>([]);
  const [customerInvoicesLoadState, setCustomerInvoicesLoadState] =
    useState<PortalInvoicesLoadState>("loading");
  const [invoiceDownloadStates, setInvoiceDownloadStates] =
    useState<Record<string, InvoiceDownloadState>>({});
  const companyName = companyProfile.company_name || defaultCompanyProfile.company_name;
  const companyContactLines = companyProfileContactLines(companyProfile);

  const activeFilter: BookingFilter = bookingFilterSet.has(activeSection)
    ? (activeSection as BookingFilter)
    : "Upcoming";
  const selectedBookingMonth = selectedBookingMonths[activeFilter] || "";
  const currentPortalMonth = useMemo(() => getCurrentPortalMonthInfo(), []);
  const customerInvoiceRecordsByFolder = useMemo(() => {
    const byFolder: Record<InvoiceFolder, CustomerPortalInvoiceRecord[]> = {
      "Credit Notes": [],
      "Paid Invoices": [],
      Quotations: [],
      "Unpaid Invoices": [],
    };

    customerInvoiceRecords.forEach((invoice) => {
      byFolder[customerPortalInvoiceFolder(invoice)].push(invoice);
    });

    invoiceFolders.forEach((folder) => {
      byFolder[folder].sort((firstInvoice, secondInvoice) =>
        secondInvoice.issueDateIso.localeCompare(firstInvoice.issueDateIso),
      );
    });

    return byFolder;
  }, [customerInvoiceRecords]);
  const storedCustomerInvoiceCount = useMemo(
    () => customerInvoiceRecords.filter((invoice) => invoice.storageSource === "server").length,
    [customerInvoiceRecords],
  );
  const customerInvoiceAccessMessage = (() => {
    if (customerInvoicesLoadState === "loading") {
      return "Checking this customer account for stored invoice PDFs.";
    }

    if (customerInvoicesLoadState === "stored") {
      return storedCustomerInvoiceCount > 0
        ? `Stored invoice PDFs appear here when this customer portal session is active. ${storedCustomerInvoiceCount} stored PDF${storedCustomerInvoiceCount === 1 ? "" : "s"} ready.`
        : "Stored invoice PDFs appear here when this customer portal session is active. No invoice PDFs are ready yet.";
    }

    return "Sign in to view stored invoice PDFs for this customer account. This folder is view and download only.";
  })();

  useEffect(() => {
    const controller = new AbortController();

    async function loadCompanyProfile() {
      const profile = await loadPublicCompanyProfile({ signal: controller.signal });

      if (profile) {
        setCompanyProfile(profile);
        return;
      }

      setCompanyProfile(defaultCompanyProfile);
    }

    void loadCompanyProfile();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCustomerInvoices() {
      try {
        const storedInvoices = await loadCustomerPortalInvoiceRecords({ signal: controller.signal });

        if (storedInvoices) {
          setCustomerInvoiceRecords(storedInvoices);
          setCustomerInvoicesLoadState("stored");
          return;
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }
      }

      setCustomerInvoiceRecords([]);
      setCustomerInvoicesLoadState("blocked");
    }

    void loadCustomerInvoices();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    async function loadSavedBookings() {
      const loadedBookings = await loadCustomerPortalSavedBookings({
        signal: controller.signal,
      });

      if (!isCurrent) {
        return;
      }

      setPortalBookings(loadedBookings || []);
      setPortalBookingsLoadState(loadedBookings === null ? "blocked" : "ready");
      setExpandedBookingId("");
      setChangeFeedback({});
      setChangeRequestDraft(null);
      setDriverTrackingByBookingId({});
      setCheckingDriverTrackingId("");
      setActiveTrackingBookingId("");
      setTripUpdatesByBookingId({});
      setCheckingTripUpdatesId("");
      setBookingPages({ ...initialBookingPages });
      setSelectedBookingMonths({ ...initialSelectedBookingMonths });
    }

    loadSavedBookings();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, []);

  const filteredBookings = useMemo(() => {
    const query = normalize(searchQuery);

    return portalBookings.filter((booking) => {
      if (!rowMatchesFilter(booking, activeFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        booking.dropoffLocation,
        booking.flightNumber,
        booking.passengerName,
        booking.pickupDateTime,
        booking.pickupLocation,
        booking.serviceType,
        booking.specialRequest,
        booking.status,
        booking.vehicleType,
      ]
        .filter(Boolean)
        .some((value) => normalize(String(value)).includes(query));
    });
  }, [activeFilter, portalBookings, searchQuery]);

  const pastMonthOptions = useMemo(() => {
    if (activeFilter === "Upcoming") {
      return [];
    }

    const months = new Map<string, { key: string; label: string; sortValue: number }>();

    filteredBookings.forEach((booking) => {
      const monthInfo = getBookingMonthInfo(booking);

      if (monthInfo.key && monthInfo.key !== currentPortalMonth.key) {
        months.set(monthInfo.key, monthInfo);
      }
    });

    return [...months.values()].sort((left, right) => right.key.localeCompare(left.key));
  }, [activeFilter, currentPortalMonth.key, filteredBookings]);

  const scopedBookings = useMemo(() => {
    if (activeFilter === "Upcoming") {
      return filteredBookings;
    }

    const monthKey = selectedBookingMonth || currentPortalMonth.key;

    return filteredBookings.filter((booking) => getBookingMonthInfo(booking).key === monthKey);
  }, [activeFilter, currentPortalMonth.key, filteredBookings, selectedBookingMonth]);

  const totalBookingPages = Math.max(1, Math.ceil(scopedBookings.length / visibleBookingLimit));
  const currentBookingPage = Math.min(bookingPages[activeFilter] || 1, totalBookingPages);
  const firstVisibleBookingIndex = (currentBookingPage - 1) * visibleBookingLimit;
  const visibleBookings = scopedBookings.slice(firstVisibleBookingIndex, firstVisibleBookingIndex + visibleBookingLimit);
  const showingStart = scopedBookings.length === 0 ? 0 : firstVisibleBookingIndex + 1;
  const showingEnd = firstVisibleBookingIndex + visibleBookings.length;
  const selectedMonthOption = pastMonthOptions.find((month) => month.key === selectedBookingMonth);
  const activeMonthLabel = (() => {
    if (activeFilter === "Upcoming") {
      return "";
    }

    if (selectedBookingMonth) {
      return selectedMonthOption?.label || selectedBookingMonth;
    }

    return currentPortalMonth.label;
  })();
  const expandedBooking = visibleBookings.find((booking) => booking.id === expandedBookingId);
  const emptyBookingsMessage =
    portalBookingsLoadState === "loading"
      ? "Loading bookings."
      : portalBookingsLoadState === "blocked"
        ? "Sign in to view bookings."
        : "No bookings match the current search.";

  function handleSectionChange(section: PortalSection) {
    const nextFilter: BookingFilter = bookingFilterSet.has(section) ? (section as BookingFilter) : "Upcoming";

    setActiveSection(section);
    setExpandedBookingId("");
    setChangeFeedback({});
    setChangeRequestDraft(null);
    setCheckingDriverTrackingId("");
    setActiveTrackingBookingId("");
    setCheckingTripUpdatesId("");
    setBookingPages((current) => ({ ...current, [nextFilter]: 1 }));
    setSelectedBookingMonths((current) => ({ ...current, [nextFilter]: "" }));
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setExpandedBookingId("");
    setChangeFeedback({});
    setChangeRequestDraft(null);
    setCheckingDriverTrackingId("");
    setActiveTrackingBookingId("");
    setCheckingTripUpdatesId("");
    setBookingPages((current) => ({ ...current, [activeFilter]: 1 }));
  }

  function handleMonthSelect(monthKey: string) {
    setSelectedBookingMonths((current) => ({ ...current, [activeFilter]: monthKey }));
    setBookingPages((current) => ({ ...current, [activeFilter]: 1 }));
    setExpandedBookingId("");
    setChangeFeedback({});
    setChangeRequestDraft(null);
    setCheckingDriverTrackingId("");
    setActiveTrackingBookingId("");
    setCheckingTripUpdatesId("");
  }

  function handlePageChange(direction: "next" | "previous") {
    setBookingPages((current) => {
      const currentPage = Math.min(current[activeFilter] || 1, totalBookingPages);
      const nextPage = direction === "next" ? currentPage + 1 : currentPage - 1;

      return {
        ...current,
        [activeFilter]: Math.min(Math.max(nextPage, 1), totalBookingPages),
      };
    });
    setExpandedBookingId("");
    setChangeFeedback({});
    setChangeRequestDraft(null);
    setCheckingDriverTrackingId("");
    setActiveTrackingBookingId("");
    setCheckingTripUpdatesId("");
  }

  const loadTripUpdatesForBooking = useCallback(async (booking: CustomerPortalBooking) => {
    const bookingReference = bookingReferenceFromPortalId(booking.id);

    if (!bookingReference) {
      setTripUpdatesByBookingId((current) => ({
        ...current,
        [booking.id]: {
          message: "Trip updates are not available for this booking.",
          status: "blocked",
          updates: [],
        },
      }));
      return;
    }

    setCheckingTripUpdatesId(booking.id);

    try {
      const result = await loadCustomerPortalTripUpdates({ bookingReference });

      setTripUpdatesByBookingId((current) => ({
        ...current,
        [booking.id]: result,
      }));
    } finally {
      setCheckingTripUpdatesId("");
    }
  }, []);

  const refreshCustomerTrackingForBooking = useCallback(
    async (booking: CustomerPortalBooking, options: { silent?: boolean } = {}) => {
      const bookingReference = bookingReferenceFromPortalId(booking.id);

      if (!bookingReference) {
        setDriverTrackingByBookingId((current) => ({
          ...current,
          [booking.id]: {
            message: "Live location is not available for this booking.",
            status: "blocked",
          },
        }));
        setTripUpdatesByBookingId((current) => ({
          ...current,
          [booking.id]: {
            message: "Trip updates are not available for this booking.",
            status: "blocked",
            updates: [],
          },
        }));
        return;
      }

      if (!options.silent) {
        setCheckingDriverTrackingId(booking.id);
        setCheckingTripUpdatesId(booking.id);
      }

      try {
        const [driverTrackingResult, tripUpdatesResult] = await Promise.all([
          loadCustomerPortalDriverTracking({ bookingReference }),
          loadCustomerPortalTripUpdates({ bookingReference }),
        ]);

        setDriverTrackingByBookingId((current) => ({
          ...current,
          [booking.id]: driverTrackingResult,
        }));
        setTripUpdatesByBookingId((current) => ({
          ...current,
          [booking.id]: tripUpdatesResult,
        }));
      } finally {
        if (!options.silent) {
          setCheckingDriverTrackingId("");
          setCheckingTripUpdatesId("");
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeTrackingBookingId) {
      return;
    }

    const trackingBooking = visibleBookings.find((booking) => booking.id === activeTrackingBookingId);

    if (!trackingBooking) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshCustomerTrackingForBooking(trackingBooking, { silent: true });
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTrackingBookingId, refreshCustomerTrackingForBooking, visibleBookings]);

  function handleTrackDriver(booking: CustomerPortalBooking) {
    const nextTrackingBookingId = activeTrackingBookingId === booking.id ? "" : booking.id;

    setExpandedBookingId(booking.id);
    setActiveTrackingBookingId(nextTrackingBookingId);

    if (nextTrackingBookingId) {
      void refreshCustomerTrackingForBooking(booking);
    }
  }

  function handleEditRequest(booking: CustomerPortalBooking) {
    setExpandedBookingId(booking.id);
    setChangeRequestDraft(
      canRequestBookingReview(booking)
        ? {
            bookingId: booking.id,
            requestKind: "amendment",
            requestNote: "",
            requestedDropoffLocation: "",
            requestedPickupDate: "",
            requestedPickupLocation: "",
            requestedPickupTime: "",
          }
        : null,
    );
    setChangeFeedback({
      [booking.id]: canRequestBookingReview(booking)
        ? {
            text: `${companyName} staff must review and confirm before the booking or calendar changes.`,
            tone: "info",
          }
        : {
            text: "Completed or cancelled bookings are read-only here. Please contact our team if you need help.",
            tone: "error",
          },
    });
  }

  function handleCancelRequest(booking: CustomerPortalBooking) {
    setExpandedBookingId(booking.id);
    setChangeRequestDraft(
      canRequestBookingReview(booking)
        ? {
            bookingId: booking.id,
            requestKind: "cancellation",
            requestNote: "",
            requestedDropoffLocation: "",
            requestedPickupDate: "",
            requestedPickupLocation: "",
            requestedPickupTime: "",
          }
        : null,
    );
    setChangeFeedback({
      [booking.id]: canRequestBookingReview(booking)
        ? {
            text: `Your booking is not cancelled until ${companyName} confirms.`,
            tone: "info",
          }
        : {
            text: "Completed or cancelled bookings are read-only here. Please contact our team if you need help.",
            tone: "error",
        },
    });
  }

  function updateChangeRequestDraftField(
    field: keyof Omit<BookingChangeRequestDraft, "bookingId" | "requestKind">,
    value: string,
  ) {
    setChangeRequestDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current,
    );
  }

  async function submitCustomerBookingChangeRequest(
    event: FormEvent<HTMLFormElement>,
    booking: CustomerPortalBooking,
  ) {
    event.preventDefault();

    if (!changeRequestDraft || changeRequestDraft.bookingId !== booking.id) {
      return;
    }

    const bookingReference = bookingReferenceFromPortalId(booking.id);

    if (!bookingReference) {
      setChangeFeedback({
        [booking.id]: {
          text: "Booking change request is not available for this booking.",
          tone: "error",
        },
      });
      return;
    }

    const hasAmendmentValue = Boolean(
      changeRequestDraft.requestedPickupDate.trim() ||
        changeRequestDraft.requestedPickupTime.trim() ||
        changeRequestDraft.requestedPickupLocation.trim() ||
        changeRequestDraft.requestedDropoffLocation.trim(),
    );

    if (changeRequestDraft.requestKind === "amendment" && !hasAmendmentValue) {
      setChangeFeedback({
        [booking.id]: {
          text: "Enter at least one new date, time, pickup, or drop-off value for staff review.",
          tone: "error",
        },
      });
      return;
    }

    setChangeRequestSubmittingId(booking.id);
    setChangeFeedback({
      [booking.id]: {
        text: "Sending request for staff review.",
        tone: "info",
      },
    });

    try {
      await submitCustomerPortalBookingChangeRequest({
        input: {
          bookingReference,
          requestKind: changeRequestDraft.requestKind,
          requestNote: changeRequestDraft.requestNote.trim(),
          requestedDropoffLocation: changeRequestDraft.requestedDropoffLocation.trim(),
          requestedPickupDate: changeRequestDraft.requestedPickupDate,
          requestedPickupLocation: changeRequestDraft.requestedPickupLocation.trim(),
          requestedPickupTime: changeRequestDraft.requestedPickupTime,
        },
      });

      setChangeRequestDraft(null);
      setChangeFeedback({
        [booking.id]: {
          text:
            changeRequestDraft.requestKind === "cancellation"
              ? "Cancel request sent for staff review. The booking is not cancelled until Prestige confirms."
              : "Edit request sent for staff review. The booking and calendar are unchanged until Prestige confirms.",
          tone: "success",
        },
      });
    } catch (error) {
      setChangeFeedback({
        [booking.id]: {
          text:
            error instanceof Error
              ? error.message
              : "Booking change request could not be saved safely.",
          tone: "error",
        },
      });
    } finally {
      setChangeRequestSubmittingId("");
    }
  }

  async function downloadPortalInvoice(invoice: CustomerPortalInvoiceRecord) {
    setInvoiceDownloadStates((current) => ({
      ...current,
      [invoice.invoiceNumber]: "downloading",
    }));

    try {
      const pdf = await fetchCustomerPortalInvoicePdf(invoice.invoiceNumber);

      if (!pdf) {
        throw new Error("Invoice PDF could not be downloaded right now.");
      }

      downloadBrowserBlob(pdf.blob, pdf.filename || invoice.pdfFilename || `${invoice.invoiceNumber}.pdf`);

      setInvoiceDownloadStates((current) => ({
        ...current,
        [invoice.invoiceNumber]: "downloaded",
      }));
    } catch {
      setInvoiceDownloadStates((current) => ({
        ...current,
        [invoice.invoiceNumber]: "failed",
      }));
    } finally {
      window.setTimeout(() => {
        setInvoiceDownloadStates((current) => {
          const next = { ...current };
          delete next[invoice.invoiceNumber];

          return next;
        });
      }, 1500);
    }
  }

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-stone-50 px-3 py-4 text-slate-950 sm:px-4 lg:px-6"
      data-customer-portal-page="true"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <header className="border-b border-slate-200 px-1 pb-3 pt-1">
          <div
            className="flex min-w-0 items-center gap-2"
            data-customer-company-profile-brand="true"
          >
            {companyProfile.logo_image_url ? (
              <span
                aria-label={`${companyName} logo`}
                className="h-8 w-8 shrink-0 rounded-md bg-contain bg-center bg-no-repeat"
                role="img"
                style={{ backgroundImage: `url("${companyProfile.logo_image_url}")` }}
              />
            ) : null}
            <p className="truncate text-sm font-semibold uppercase text-slate-600">{companyName}</p>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">My Bookings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Customers can view booking requests and booking history here after staff confirmation.
          </p>
          {companyContactLines.length > 0 ? (
            <p
              className="mt-1 text-xs leading-5 text-slate-600"
              data-customer-company-profile-contact="true"
            >
              {companyContactLines.join(" | ")}
            </p>
          ) : null}
        </header>

        <nav
          aria-label="Customer portal sections"
          className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
          data-customer-portal-sections="true"
        >
          {portalSections.map((section) => {
            const isBookRequestLink = section === "New Booking Request";
            const isActive = !isBookRequestLink && activeSection === section;
            const isBookingFilter = bookingFilterSet.has(section);
            const sectionClassName = [
              "min-h-9 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition",
              isActive
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-300 bg-white text-slate-800 hover:border-slate-500",
            ].join(" ");

            if (isBookRequestLink) {
              return (
                <Link
                  className={sectionClassName}
                  data-active="false"
                  data-customer-portal-book-request-link="true"
                  data-customer-portal-section={section}
                  href="/book"
                  key={section}
                >
                  {section}
                </Link>
              );
            }

            return (
              <button
                className={sectionClassName}
                data-active={isActive ? "true" : "false"}
                data-customer-portal-filter={isBookingFilter ? section : undefined}
                data-customer-portal-section={section}
                key={section}
                onClick={() => handleSectionChange(section)}
                type="button"
              >
                {section}
              </button>
            );
          })}
        </nav>

        {activeSection === "Invoices" ? (
          <section
            aria-labelledby="customer-portal-invoices-title"
            className="rounded-md border border-slate-200 bg-white p-3"
            data-customer-portal-invoice-folders="true"
          >
            <div className="flex flex-col gap-1 border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-950" id="customer-portal-invoices-title">
                Invoices
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Billing documents are grouped by month into quotations, unpaid invoices, paid invoices, and credit notes.
              </p>
              <p
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-700"
                data-customer-portal-invoice-access-state={customerInvoicesLoadState}
                data-customer-portal-invoice-access-summary="true"
              >
                {customerInvoiceAccessMessage}
              </p>
            </div>

            <div className="mt-3 grid gap-3">
              {invoiceFolders.map((folder) => {
                const folderKey = invoiceFolderSlug(folder);
                const folderRecords = customerInvoiceRecordsByFolder[folder];
                const monthLabels = Array.from(
                  new Set(folderRecords.map((invoice) => invoice.billingMonthLabel)),
                );

                return (
                  <section
                    className="overflow-hidden rounded-md border border-slate-200"
                    data-customer-portal-invoice-folder={folderKey}
                    key={folder}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-950">{folder}</h3>
                        <p className="text-xs text-slate-600">Grouped monthly</p>
                      </div>
                      <span
                        className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600"
                        data-customer-portal-invoice-folder-count={folderKey}
                      >
                        {folderRecords.length}
                      </span>
                    </div>
                    <div
                      className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"
                      data-customer-portal-invoice-month-group={folderKey}
                    >
                      {monthLabels.length > 0 ? monthLabels.join(", ") : "Current month"}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="bg-white text-[11px] uppercase tracking-[0.1em] text-slate-500">
                          <tr className="border-b border-slate-100">
                            <th className="px-3 py-2 font-bold">Invoice</th>
                            <th className="px-3 py-2 font-bold">Amount</th>
                            <th className="px-3 py-2 font-bold">{invoiceFolderDateHeading(folder)}</th>
                            <th className="px-3 py-2 text-right font-bold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {folderRecords.length > 0 ? (
                            folderRecords.map((invoice) => {
                              const downloadState = invoiceDownloadStates[invoice.invoiceNumber];

                              return (
                              <tr
                                className="border-b border-slate-100 last:border-b-0"
                                data-customer-portal-invoice-row={invoice.invoiceNumber}
                                key={invoice.id}
                              >
                                <td className="px-3 py-2">
                                  <p className="font-bold text-slate-950">{invoice.invoiceNumber}</p>
                                  <p className="text-xs text-slate-500">
                                    {invoice.reference} · Stored PDF
                                  </p>
                                </td>
                                <td className="px-3 py-2 font-semibold text-slate-950">{invoice.amountLabel}</td>
                                <td className="px-3 py-2 text-slate-700">
                                  {invoiceFolderRowDate(folder, invoice)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    aria-label={`Download PDF ${invoice.invoiceNumber}`}
                                    className={[
                                      "min-h-8 rounded-md border px-2 text-xs font-bold transition disabled:cursor-wait",
                                      downloadState === "downloaded"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                        : downloadState === "failed"
                                          ? "border-red-200 bg-red-50 text-red-900 hover:border-red-300"
                                          : "border-slate-300 bg-white text-slate-800 hover:border-slate-600",
                                    ].join(" ")}
                                    data-customer-portal-invoice-download={invoice.invoiceNumber}
                                    disabled={downloadState === "downloading"}
                                    onClick={() => downloadPortalInvoice(invoice)}
                                    title="Download PDF"
                                    type="button"
                                  >
                                    {downloadState === "downloading"
                                      ? "Downloading"
                                      : downloadState === "downloaded"
                                        ? "Downloaded"
                                        : downloadState === "failed"
                                          ? "Try again"
                                          : "PDF"}
                                  </button>
                                </td>
                              </tr>
                              );
                            })
                          ) : (
                            <tr data-customer-portal-invoice-empty-row={folderKey}>
                              <td className="px-3 py-3 text-sm text-slate-600" colSpan={4}>
                                No {folder.toLowerCase()} PDFs are available in this customer folder yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {folderRecords.length === 0 ? (
                      <div className="flex justify-end border-t border-slate-100 px-3 py-2">
                        <button
                          aria-disabled="true"
                          aria-label={`Download PDF ${folder.toLowerCase()} invoices`}
                          className="min-h-10 rounded-md border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-500"
                          data-customer-portal-invoice-download={folderKey}
                          disabled
                          title="Download PDF"
                          type="button"
                        >
                          PDF
                        </button>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
            <p
              className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950"
              data-customer-portal-invoice-storage-boundary="true"
            >
              Stored invoice PDFs appear here when this customer portal session is active. This folder is view and
              download only.
            </p>
          </section>
        ) : (
          <>
            <section
              aria-labelledby="booking-search-title"
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5" data-customer-portal-search-area="true">
                  <label className="text-sm font-semibold text-slate-800" htmlFor="customer-portal-search">
                    Search bookings
                  </label>
                  <p
                    className="text-sm leading-6 text-slate-600"
                    data-customer-portal-search-helper="true"
                  >
                    Search by passenger, pickup, drop-off, flight, or service. Use the tabs to
                    switch between upcoming and past trips.
                  </p>
                  <input
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    data-customer-portal-search="true"
                    id="customer-portal-search"
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="Search passenger, pickup, drop-off, flight, service"
                    type="search"
                    value={searchQuery}
                  />
                </div>

                {activeFilter !== "Upcoming" ? (
                  <div
                    className="rounded-md border border-slate-200 bg-slate-50 p-2"
                    data-customer-portal-month-groups="true"
                  >
                    <p className="text-sm font-semibold text-slate-800">Select month</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        className={[
                          "min-h-10 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition",
                          selectedBookingMonth
                            ? "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                            : "border-slate-950 bg-slate-950 text-white",
                        ].join(" ")}
                        data-active={selectedBookingMonth ? "false" : "true"}
                        data-customer-portal-current-month="true"
                        onClick={() => handleMonthSelect("")}
                        type="button"
                      >
                        {currentPortalMonth.label}
                      </button>

                      {pastMonthOptions.map((month) => {
                        const isSelected = selectedBookingMonth === month.key;

                        return (
                          <button
                            className={[
                              "min-h-10 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition",
                              isSelected
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-300 bg-white text-slate-800 hover:border-slate-500",
                            ].join(" ")}
                            data-active={isSelected ? "true" : "false"}
                            data-customer-portal-month-button={month.key}
                            key={month.key}
                            onClick={() => handleMonthSelect(month.key)}
                            type="button"
                          >
                            {month.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-700">
                    {activeMonthLabel ? (
                      <p className="mb-1 text-slate-600" data-customer-portal-active-month="true">
                        {activeMonthLabel}
                      </p>
                    ) : null}
                    <p data-customer-portal-showing="true">
                      {scopedBookings.length === 0
                        ? "Showing 0 of 0 bookings"
                        : `Showing ${showingStart}-${showingEnd} of ${scopedBookings.length} bookings`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" data-customer-portal-pagination="true">
                    <button
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                      data-customer-portal-prev="true"
                      disabled={currentBookingPage <= 1}
                      onClick={() => handlePageChange("previous")}
                      type="button"
                    >
                      Previous
                    </button>
                    <span className="text-sm font-semibold text-slate-700" data-customer-portal-page-summary="true">
                      Page {currentBookingPage} of {totalBookingPages}
                    </span>
                    <button
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                      data-customer-portal-next="true"
                      disabled={currentBookingPage >= totalBookingPages}
                      onClick={() => handlePageChange("next")}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="customer-portal-results-title"
              className="rounded-md border border-slate-200 bg-white p-2 sm:p-3"
            >
              <h2 className="sr-only" id="customer-portal-results-title">
                Booking results
              </h2>

              {visibleBookings.length === 0 ? (
                <div
                  className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-700"
                  data-customer-portal-access-state={portalBookingsLoadState}
                  data-customer-portal-empty="true"
                >
                  {emptyBookingsMessage}
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-200" data-customer-portal-list="true">
                  {visibleBookings.map((booking) => {
                    const canRequestReview = canRequestBookingReview(booking);
                    const isExpanded = expandedBooking?.id === booking.id;
                    const rowChangeDraft =
                      changeRequestDraft?.bookingId === booking.id ? changeRequestDraft : null;
                    const rowFeedback = changeFeedback[booking.id] || null;
                    const rowSubmitting = changeRequestSubmittingId === booking.id;

                    return (
                      <li
                        className="flex flex-col gap-2 py-2"
                        data-customer-portal-row={booking.id}
                        data-customer-portal-status={booking.status}
                        key={booking.id}
                      >
                        <div className="grid gap-3 lg:grid-cols-[1.1fr_1.5fr_1fr_auto] lg:items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-950" data-customer-portal-passenger="true">
                              {booking.passengerName}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">{booking.status}</p>
                          </div>
                          <div className="min-w-0 text-sm text-slate-700">
                            <p className="font-semibold text-slate-900">{booking.pickupDateTime}</p>
                            <p className="mt-1 break-words">
                              {booking.pickupLocation} to {booking.dropoffLocation}
                            </p>
                          </div>
                          <div className="min-w-0 text-sm text-slate-700">
                            <p>{booking.serviceType}</p>
                            <p className="mt-1">{booking.vehicleType}</p>
                          </div>
                          <div
                            className="flex flex-wrap gap-2 lg:justify-end"
                            data-customer-portal-row-actions={booking.id}
                          >
                            <button
                              aria-disabled="true"
                              className="min-h-10 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-sm font-semibold text-slate-500"
                              data-customer-portal-pdf={booking.id}
                              data-customer-portal-row-action="pdf"
                              disabled
                              title="Customer PDF is not ready yet"
                              type="button"
                            >
                              PDF
                            </button>
                            <button
                              className="min-h-10 rounded-md border border-sky-700 bg-sky-700 px-2.5 py-1.5 text-sm font-semibold text-white transition enabled:hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                              data-customer-portal-request-edit={booking.id}
                              data-customer-portal-row-action="edit"
                              disabled={!canRequestReview}
                              onClick={() => handleEditRequest(booking)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="min-h-10 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                              data-customer-portal-request-cancel={booking.id}
                              data-customer-portal-row-action="cancel"
                              disabled={!canRequestReview}
                              onClick={() => handleCancelRequest(booking)}
                              type="button"
                            >
                              Cancel
                            </button>
                            <button
                              className="min-h-10 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
                              data-customer-portal-detail-button={booking.id}
                              onClick={() => {
                                const nextExpandedBookingId = isExpanded ? "" : booking.id;

                                setExpandedBookingId(nextExpandedBookingId);

                                if (!isExpanded) {
                                  void loadTripUpdatesForBooking(booking);
                                } else if (activeTrackingBookingId === booking.id) {
                                  setActiveTrackingBookingId("");
                                }
                              }}
                              type="button"
                            >
                              {isExpanded ? "Hide details" : "View details"}
                            </button>
                          </div>
                        </div>

                        {rowFeedback ? (
                          <p
                            className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClass(
                              rowFeedback.tone,
                            )}`}
                            data-customer-portal-feedback={booking.id}
                          >
                            {rowFeedback.text}
                          </p>
                        ) : null}
                        {rowChangeDraft ? (
                          <form
                            className="grid gap-2 rounded-md border border-sky-200 bg-sky-50/70 p-2"
                            data-customer-portal-change-request-form={booking.id}
                            data-customer-portal-change-request-kind={rowChangeDraft.requestKind}
                            onSubmit={(event) => submitCustomerBookingChangeRequest(event, booking)}
                          >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-sm font-semibold text-slate-950">
                                {rowChangeDraft.requestKind === "cancellation"
                                  ? "Cancel request"
                                  : "Edit request"}
                              </p>
                              <span className="w-fit rounded-full border border-sky-200 bg-white px-2 py-1 text-xs font-semibold text-sky-800">
                                Staff review required
                              </span>
                            </div>
                            {rowChangeDraft.requestKind === "amendment" ? (
                              <div className="grid gap-2 md:grid-cols-2">
                                <label className="text-sm font-semibold text-slate-700">
                                  New pickup date
                                  <input
                                    className={fieldClass()}
                                    data-customer-portal-change-field="requested-pickup-date"
                                    onChange={(event) =>
                                      updateChangeRequestDraftField(
                                        "requestedPickupDate",
                                        event.target.value,
                                      )
                                    }
                                    type="date"
                                    value={rowChangeDraft.requestedPickupDate}
                                  />
                                </label>
                                <label className="text-sm font-semibold text-slate-700">
                                  New pickup time
                                  <input
                                    className={fieldClass()}
                                    data-customer-portal-change-field="requested-pickup-time"
                                    onChange={(event) =>
                                      updateChangeRequestDraftField(
                                        "requestedPickupTime",
                                        event.target.value,
                                      )
                                    }
                                    type="time"
                                    value={rowChangeDraft.requestedPickupTime}
                                  />
                                </label>
                                <label className="text-sm font-semibold text-slate-700">
                                  New pickup location
                                  <input
                                    className={fieldClass()}
                                    data-customer-portal-change-field="requested-pickup-location"
                                    onChange={(event) =>
                                      updateChangeRequestDraftField(
                                        "requestedPickupLocation",
                                        event.target.value,
                                      )
                                    }
                                    placeholder={booking.pickupLocation}
                                    type="text"
                                    value={rowChangeDraft.requestedPickupLocation}
                                  />
                                </label>
                                <label className="text-sm font-semibold text-slate-700">
                                  New drop-off location
                                  <input
                                    className={fieldClass()}
                                    data-customer-portal-change-field="requested-dropoff-location"
                                    onChange={(event) =>
                                      updateChangeRequestDraftField(
                                        "requestedDropoffLocation",
                                        event.target.value,
                                      )
                                    }
                                    placeholder={booking.dropoffLocation}
                                    type="text"
                                    value={rowChangeDraft.requestedDropoffLocation}
                                  />
                                </label>
                              </div>
                            ) : null}
                            <label className="text-sm font-semibold text-slate-700">
                              Note
                              <textarea
                                className={`${fieldClass()} min-h-20 resize-y`}
                                data-customer-portal-change-field="request-note"
                                onChange={(event) =>
                                  updateChangeRequestDraftField("requestNote", event.target.value)
                                }
                                value={rowChangeDraft.requestNote}
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="min-h-10 rounded-md border border-sky-700 bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white transition enabled:hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                                data-customer-portal-submit-change-request={booking.id}
                                disabled={rowSubmitting}
                                type="submit"
                              >
                                {rowSubmitting ? "Sending..." : "Send for review"}
                              </button>
                              <button
                                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
                                data-customer-portal-close-change-request={booking.id}
                                onClick={() => setChangeRequestDraft(null)}
                                type="button"
                              >
                                Close
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {expandedBooking
              ? (() => {
                  const driverDetails = expandedBooking.driverDetails;
                  const driverTracking = driverTrackingByBookingId[expandedBooking.id];
                  const isCheckingDriverTracking = checkingDriverTrackingId === expandedBooking.id;
                  const tripUpdates = tripUpdatesByBookingId[expandedBooking.id];
                  const isCheckingTripUpdates = checkingTripUpdatesId === expandedBooking.id;
                  const isTrackingActive = activeTrackingBookingId === expandedBooking.id;
                  const trackingReady = driverTracking?.status === "available" && Boolean(driverTracking.mapEmbedUrl);
                  const latestTripUpdate = tripUpdates?.updates[0] || null;
                  const trackingStatusLabel = trackingReady
                    ? "Live"
                    : driverTracking?.status === "not_ready"
                      ? "Waiting"
                      : driverTracking?.status === "blocked"
                        ? "Locked"
                        : "Standby";

                  return (
                    <section
                      aria-labelledby="booking-detail-title"
                      className="rounded-md border border-slate-200 bg-white p-3"
                      data-customer-portal-detail={expandedBooking.id}
                    >
                      <div className="flex flex-col gap-1">
                        <h2 className="text-base font-semibold text-slate-950" id="booking-detail-title">
                          Booking Details
                        </h2>
                        <p className="text-sm text-slate-600">{expandedBooking.status}</p>
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="font-semibold text-slate-600">Pickup date/time</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.pickupDateTime}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Passenger name</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.passengerName}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Pickup location</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.pickupLocation}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Drop-off location</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.dropoffLocation}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Type of service</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.serviceType}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Vehicle type</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.vehicleType}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Flight number</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.flightNumber || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-600">Special request / note</dt>
                          <dd className="mt-1 text-slate-950">{expandedBooking.specialRequest || "None provided"}</dd>
                        </div>
                      </dl>
                      {driverDetails ? (
                        <div
                          aria-labelledby="customer-driver-details-title"
                          className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"
                          data-customer-portal-driver-details-card={expandedBooking.id}
                        >
                          <div className="flex flex-col gap-1">
                            <h3
                              className="text-sm font-semibold text-emerald-950"
                              id="customer-driver-details-title"
                            >
                              Driver Details
                            </h3>
                            <p className="text-xs text-emerald-900">
                              These details appear after Prestige confirms the assigned driver.
                            </p>
                          </div>
                          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="font-semibold text-emerald-900">Driver name</dt>
                              <dd className="mt-1 text-slate-950">
                                {driverDetails.driverName || "To confirm"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-emerald-900">Driver contact</dt>
                              <dd className="mt-1 text-slate-950">
                                {driverDetails.driverContact || "To confirm"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-emerald-900">Car plate</dt>
                              <dd className="mt-1 text-slate-950">
                                {driverDetails.carPlate || "To confirm"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-emerald-900">Car type</dt>
                              <dd className="mt-1 text-slate-950">
                                {driverDetails.carType || expandedBooking.vehicleType || "To confirm"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-emerald-900">Pickup date/time</dt>
                              <dd className="mt-1 text-slate-950">{expandedBooking.pickupDateTime}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-emerald-900">Route</dt>
                              <dd className="mt-1 text-slate-950">
                                {expandedBooking.pickupLocation} to {expandedBooking.dropoffLocation}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ) : null}
                      <div
                        aria-labelledby="customer-driver-tracking-title"
                        className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3"
                        data-customer-portal-driver-tracking={expandedBooking.id}
                        data-customer-portal-trip-updates={expandedBooking.id}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-sky-950" id="customer-driver-tracking-title">
                              Driver Tracking
                            </h3>
                            <p className="text-xs text-sky-900" data-customer-portal-trip-updates-title="true">
                              Trip Updates
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {driverDetails ? (
                              <button
                                className={[
                                  "min-h-10 rounded-md border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                                  isTrackingActive
                                    ? "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                    : "border-sky-700 bg-sky-700 text-white hover:bg-sky-800",
                                ].join(" ")}
                                data-customer-portal-driver-tracking-toggle={expandedBooking.id}
                                disabled={isCheckingDriverTracking || isCheckingTripUpdates}
                                onClick={() => handleTrackDriver(expandedBooking)}
                                type="button"
                              >
                                {isTrackingActive ? "Close tracking" : "Track driver"}
                              </button>
                            ) : null}
                            <button
                              className="min-h-10 rounded-md border border-sky-700 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900 transition enabled:hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                              data-customer-portal-trip-updates-refresh={expandedBooking.id}
                              disabled={isCheckingTripUpdates || isCheckingDriverTracking}
                              onClick={() =>
                                driverDetails
                                  ? void refreshCustomerTrackingForBooking(expandedBooking)
                                  : void loadTripUpdatesForBooking(expandedBooking)
                              }
                              type="button"
                            >
                              {isCheckingTripUpdates || isCheckingDriverTracking ? "Checking..." : "Refresh"}
                            </button>
                          </div>
                        </div>

                        {isTrackingActive ? (
                          <div
                            className="mt-3 overflow-hidden rounded-md border border-sky-200 bg-white"
                            data-customer-portal-driver-tracking-panel={expandedBooking.id}
                            data-customer-portal-driver-tracking-state={trackingStatusLabel}
                          >
                            <div className="flex flex-col gap-2 border-b border-sky-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-950">
                                  {latestTripUpdate?.title || driverTracking?.message || "Driver status to confirm"}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">
                                  {driverDetails
                                    ? `${driverDetails.driverName || "Driver"} · ${driverDetails.carPlate || "Plate to confirm"}`
                                    : "Assigned driver to confirm"}
                                </p>
                              </div>
                              <span
                                className={[
                                  "w-fit rounded-full px-2.5 py-1 text-xs font-semibold",
                                  trackingReady
                                    ? "bg-emerald-100 text-emerald-950"
                                    : driverTracking?.status === "blocked"
                                      ? "bg-slate-100 text-slate-700"
                                      : "bg-amber-100 text-amber-950",
                                ].join(" ")}
                              >
                                {trackingStatusLabel}
                              </span>
                            </div>
                            <div className="relative aspect-[4/3] min-h-72 bg-slate-100 sm:aspect-[16/9]">
                              {trackingReady && driverTracking?.mapEmbedUrl ? (
                                <iframe
                                  className="h-full w-full border-0"
                                  data-customer-portal-driver-tracking-map={expandedBooking.id}
                                  loading="lazy"
                                  referrerPolicy="no-referrer-when-downgrade"
                                  src={driverTracking.mapEmbedUrl}
                                  title="Driver live map"
                                />
                              ) : (
                                <div
                                  className="flex h-full min-h-72 items-center justify-center px-5 text-center text-sm font-semibold text-slate-700"
                                  data-customer-portal-driver-tracking-placeholder={expandedBooking.id}
                                >
                                  {driverTracking?.message ||
                                    "Tracking appears after the driver is on the way and customer viewing is open."}
                                </div>
                              )}
                            </div>
                            <div className="grid gap-2 border-t border-sky-100 px-3 py-2 text-xs font-semibold text-slate-700 sm:grid-cols-3">
                              <span data-customer-portal-driver-tracking-route={expandedBooking.id}>
                                {expandedBooking.pickupLocation} to {expandedBooking.dropoffLocation}
                              </span>
                              <span data-customer-portal-driver-tracking-updated={expandedBooking.id}>
                                {driverTracking?.updatedAt ? `Updated ${driverTracking.updatedAt}` : "Update pending"}
                              </span>
                              <span data-customer-portal-driver-tracking-accuracy={expandedBooking.id}>
                                {driverTracking?.accuracyLabel || "Location accuracy pending"}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {driverTracking && !isTrackingActive ? (
                          <p
                            className={`mt-3 rounded-md border px-2.5 py-2 text-sm font-medium ${
                              driverTracking.status === "available"
                                ? "border-emerald-200 bg-white text-emerald-950"
                                : driverTracking.status === "not_ready"
                                  ? "border-amber-200 bg-amber-50 text-amber-950"
                                  : "border-slate-200 bg-white text-slate-700"
                            }`}
                            data-customer-portal-driver-location-message={expandedBooking.id}
                          >
                            {driverTracking.message}
                            {driverTracking.updatedAt ? ` Last updated ${driverTracking.updatedAt}.` : ""}
                            {driverTracking.accuracyLabel ? ` ${driverTracking.accuracyLabel}.` : ""}
                          </p>
                        ) : null}

                        {tripUpdates ? (
                          <div className="mt-3" data-customer-portal-trip-updates-state={tripUpdates.status}>
                            <p
                              className={[
                                "rounded-md border px-2.5 py-2 text-sm font-medium",
                                tripUpdates.status === "ready"
                                  ? "border-emerald-200 bg-white text-emerald-950"
                                  : tripUpdates.status === "empty"
                                    ? "border-sky-200 bg-white text-sky-950"
                                    : "border-amber-200 bg-amber-50 text-amber-950",
                              ].join(" ")}
                              data-customer-portal-trip-updates-message={expandedBooking.id}
                            >
                              {tripUpdates.message}
                            </p>
                            {tripUpdates.updates.length > 0 ? (
                              <ul className="mt-2 grid gap-2" data-customer-portal-trip-update-list={expandedBooking.id}>
                                {tripUpdates.updates.map((update) => (
                                  <li
                                    className="rounded-md border border-sky-100 bg-white px-3 py-2 text-sm"
                                    data-customer-portal-trip-update-row={expandedBooking.id}
                                    key={`${update.id}-${update.title}`}
                                  >
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="font-semibold text-slate-950">{update.title}</p>
                                        <p className="mt-1 text-slate-700">{update.message}</p>
                                      </div>
                                      <span className="w-fit rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-900">
                                        {update.status}
                                      </span>
                                    </div>
                                    {update.createdAt ? (
                                      <p className="mt-2 text-xs text-slate-500">{update.createdAt}</p>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-sky-900">
                            Trip updates appear here after the driver starts reporting.
                          </p>
                        )}
                      </div>
                    </section>
                  );
                })()
              : null}
          </>
        )}
      </div>
    </main>
  );
}
