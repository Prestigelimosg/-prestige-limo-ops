"use client";

import { useMemo, useState } from "react";

type BookingStatus = "Cancelled" | "Completed" | "Confirmed" | "Pending Staff Review" | "Requested";
type BookingFilter = "Cancelled" | "Completed" | "Upcoming";

type CustomerPortalBooking = {
  dropoffLocation: string;
  flightNumber?: string;
  id: string;
  passengerName: string;
  pickupDateTime: string;
  pickupLocation: string;
  serviceType: string;
  specialRequest?: string;
  status: BookingStatus;
  vehicleType: string;
};

const visibleBookingLimit = 10;

const bookingFilters: BookingFilter[] = ["Upcoming", "Completed", "Cancelled"];

const bookings: CustomerPortalBooking[] = [
  {
    dropoffLocation: "Raffles Singapore",
    flightNumber: "SQ318",
    id: "booking-001",
    passengerName: "Alicia Tan",
    pickupDateTime: "29 May 2026, 09:30",
    pickupLocation: "Changi Airport T3",
    serviceType: "Airport Arrival",
    specialRequest: "Meet at arrival hall.",
    status: "Confirmed",
    vehicleType: "Mercedes S-Class",
  },
  {
    dropoffLocation: "Marina Bay Sands",
    id: "booking-002",
    passengerName: "Daniel Lim",
    pickupDateTime: "31 May 2026, 14:00",
    pickupLocation: "Orchard Hotel Singapore",
    serviceType: "Point-to-Point Transfer",
    status: "Pending Staff Review",
    vehicleType: "Alphard / Vellfire",
  },
  {
    dropoffLocation: "Fullerton Hotel",
    id: "booking-003",
    passengerName: "Priya Shah",
    pickupDateTime: "2 Jun 2026, 08:15",
    pickupLocation: "Sentosa Cove",
    serviceType: "Hourly / Disposal",
    specialRequest: "Two extra stops to confirm.",
    status: "Requested",
    vehicleType: "Mercedes Viano / V-Class",
  },
  {
    dropoffLocation: "Capella Singapore",
    flightNumber: "JL711",
    id: "booking-004",
    passengerName: "Kenji Mori",
    pickupDateTime: "3 Jun 2026, 20:05",
    pickupLocation: "Changi Airport T1",
    serviceType: "Airport Arrival",
    status: "Confirmed",
    vehicleType: "Mercedes E-Class",
  },
  {
    dropoffLocation: "Singapore Expo",
    id: "booking-005",
    passengerName: "Maya Wong",
    pickupDateTime: "4 Jun 2026, 10:45",
    pickupLocation: "Mandarin Oriental Singapore",
    serviceType: "Event / VIP Movement",
    status: "Pending Staff Review",
    vehicleType: "Hi-roof Minibus",
  },
  {
    dropoffLocation: "Changi Airport T2",
    flightNumber: "EK355",
    id: "booking-006",
    passengerName: "Omar Hassan",
    pickupDateTime: "6 Jun 2026, 06:20",
    pickupLocation: "Four Seasons Hotel Singapore",
    serviceType: "Airport Departure",
    specialRequest: "Early luggage pickup.",
    status: "Confirmed",
    vehicleType: "Mercedes Viano / V-Class",
  },
  {
    dropoffLocation: "The Ritz-Carlton, Millenia Singapore",
    id: "booking-007",
    passengerName: "Sofia Chen",
    pickupDateTime: "7 Jun 2026, 12:10",
    pickupLocation: "National Gallery Singapore",
    serviceType: "Point-to-Point Transfer",
    status: "Requested",
    vehicleType: "Mercedes E-Class",
  },
  {
    dropoffLocation: "Gardens by the Bay",
    id: "booking-008",
    passengerName: "Lucas Meyer",
    pickupDateTime: "8 Jun 2026, 18:35",
    pickupLocation: "Conrad Centennial Singapore",
    serviceType: "Event / VIP Movement",
    status: "Confirmed",
    vehicleType: "Mercedes S-Class",
  },
  {
    dropoffLocation: "Pan Pacific Singapore",
    id: "booking-009",
    passengerName: "Nadia Rahman",
    pickupDateTime: "9 Jun 2026, 16:25",
    pickupLocation: "Seletar Aerospace Park",
    serviceType: "Other / To Confirm",
    status: "Pending Staff Review",
    vehicleType: "Alphard / Vellfire",
  },
  {
    dropoffLocation: "Changi Airport T4",
    flightNumber: "QF82",
    id: "booking-010",
    passengerName: "Ethan Brooks",
    pickupDateTime: "10 Jun 2026, 22:50",
    pickupLocation: "JW Marriott Singapore South Beach",
    serviceType: "Airport Departure",
    status: "Confirmed",
    vehicleType: "Mercedes S-Class",
  },
  {
    dropoffLocation: "Singapore Botanic Gardens",
    id: "booking-011",
    passengerName: "Hannah Lee",
    pickupDateTime: "11 Jun 2026, 11:00",
    pickupLocation: "The St. Regis Singapore",
    serviceType: "Point-to-Point Transfer",
    status: "Requested",
    vehicleType: "Mercedes E-Class",
  },
  {
    dropoffLocation: "Singapore Sports Hub",
    id: "booking-012",
    passengerName: "Victor Ng",
    pickupDateTime: "12 Jun 2026, 19:15",
    pickupLocation: "W Singapore Sentosa Cove",
    serviceType: "Event / VIP Movement",
    status: "Pending Staff Review",
    vehicleType: "Hi-roof Minibus",
  },
  {
    dropoffLocation: "Changi Airport T3",
    flightNumber: "SQ321",
    id: "booking-013",
    passengerName: "Amelia Stone",
    pickupDateTime: "18 May 2026, 13:40",
    pickupLocation: "Raffles Singapore",
    serviceType: "Airport Departure",
    status: "Completed",
    vehicleType: "Mercedes S-Class",
  },
  {
    dropoffLocation: "Mandarin Oriental Singapore",
    id: "booking-014",
    passengerName: "Marcus Ho",
    pickupDateTime: "16 May 2026, 17:10",
    pickupLocation: "Marina Bay Cruise Centre",
    serviceType: "Point-to-Point Transfer",
    status: "Completed",
    vehicleType: "Alphard / Vellfire",
  },
  {
    dropoffLocation: "Sentosa Golf Club",
    id: "booking-015",
    passengerName: "Clara Lim",
    pickupDateTime: "20 May 2026, 07:30",
    pickupLocation: "The Fullerton Bay Hotel",
    serviceType: "Hourly / Disposal",
    status: "Cancelled",
    vehicleType: "Mercedes Viano / V-Class",
  },
];

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

export default function CustomerPortalPage() {
  const [activeFilter, setActiveFilter] = useState<BookingFilter>("Upcoming");
  const [expandedBookingId, setExpandedBookingId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [changeFeedback, setChangeFeedback] = useState<Record<string, string>>({});

  const filteredBookings = useMemo(() => {
    const query = normalize(searchQuery);

    return bookings.filter((booking) => {
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
  }, [activeFilter, searchQuery]);

  const visibleBookings = filteredBookings.slice(0, visibleBookingLimit);
  const expandedBooking = visibleBookings.find((booking) => booking.id === expandedBookingId);

  function handleFilterChange(filter: BookingFilter) {
    setActiveFilter(filter);
    setExpandedBookingId("");
    setChangeFeedback({});
  }

  function handleRequestChange(booking: CustomerPortalBooking) {
    setExpandedBookingId(booking.id);
    setChangeFeedback((current) => ({
      ...current,
      [booking.id]: "Change request noted for review. Prestige Limo staff will review it before confirmation.",
    }));
  }

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      data-customer-portal-page="true"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6">
          <p className="text-sm font-semibold uppercase text-slate-600">Prestige Limo SG</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">My Bookings</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
            Customers can view booking requests and booking history here after staff confirmation.
          </p>
        </header>

        <section
          aria-labelledby="booking-search-title"
          className="rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2" data-customer-portal-search-area="true">
              <label className="text-sm font-semibold text-slate-800" htmlFor="customer-portal-search">
                Search bookings
              </label>
              <input
                className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                data-customer-portal-search="true"
                id="customer-portal-search"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search passenger, pickup, drop-off, flight, service"
                type="search"
                value={searchQuery}
              />
            </div>

            <div
              aria-label="Booking status filters"
              className="flex flex-wrap gap-2"
              data-customer-portal-filters="true"
              role="group"
            >
              {bookingFilters.map((filter) => (
                <button
                  className={[
                    "min-h-10 rounded-md border px-3 py-2 text-sm font-semibold transition",
                    activeFilter === filter
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-500",
                  ].join(" ")}
                  data-active={activeFilter === filter ? "true" : "false"}
                  data-customer-portal-filter={filter}
                  key={filter}
                  onClick={() => handleFilterChange(filter)}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>

            <p className="text-sm font-semibold text-slate-700" data-customer-portal-showing="true">
              Showing {visibleBookings.length} of {filteredBookings.length} bookings
            </p>
          </div>
        </section>

        <section
          aria-labelledby="customer-portal-results-title"
          className="rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
        >
          <h2 className="sr-only" id="customer-portal-results-title">
            Booking results
          </h2>

          {visibleBookings.length === 0 ? (
            <div
              className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-700"
              data-customer-portal-empty="true"
            >
              No bookings match the current search.
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-200" data-customer-portal-list="true">
              {visibleBookings.map((booking) => {
                const canRequestChange = booking.status !== "Completed" && booking.status !== "Cancelled";
                const isExpanded = expandedBooking?.id === booking.id;

                return (
                  <li
                    className="flex flex-col gap-3 py-3"
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
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
                          data-customer-portal-detail-button={booking.id}
                          onClick={() => setExpandedBookingId(isExpanded ? "" : booking.id)}
                          type="button"
                        >
                          {isExpanded ? "Hide details" : "View details"}
                        </button>
                        {canRequestChange ? (
                          <button
                            className="min-h-10 rounded-md border border-sky-700 bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
                            data-customer-portal-request-change={booking.id}
                            onClick={() => handleRequestChange(booking)}
                            type="button"
                          >
                            Request change
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {changeFeedback[booking.id] ? (
                      <p
                        className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950"
                        data-customer-portal-feedback={booking.id}
                      >
                        {changeFeedback[booking.id]}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {expandedBooking ? (
          <section
            aria-labelledby="booking-detail-title"
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
            data-customer-portal-detail={expandedBooking.id}
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-slate-950" id="booking-detail-title">
                Booking Details
              </h2>
              <p className="text-sm text-slate-600">{expandedBooking.status}</p>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
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
          </section>
        ) : null}
      </div>
    </main>
  );
}
