export const productionOrigin = "https://app.prestigelimo.sg";

export type CustomerTab = "book" | "bookings";

const customerPagePaths = new Set([
  "/book",
  "/my-bookings",
]);
const policyPaths = new Set([
  "/privacy",
  "/terms",
]);
const portalTokenPath = /^\/api\/customer-portal-access\/[^/]{40,4096}$/;
const publicBookingReference = /^(?:[0-9]{5}|[A-Z0-9]{2,12}-[0-9]{5})$/;

function parseProductionUrl(value: string) {
  try {
    const requested = new URL(value);
    if (
      requested.origin !== productionOrigin ||
      requested.username ||
      requested.password
    ) {
      return null;
    }
    return requested;
  } catch {
    return null;
  }
}

function safeCustomerPortalUrl(requested: URL) {
  if (!portalTokenPath.test(requested.pathname) || requested.hash) {
    return null;
  }

  const queryKeys = [...requested.searchParams.keys()];
  if (queryKeys.some((key) => key !== "booking" && key !== "tracking")) {
    return null;
  }

  const bookingValues = requested.searchParams.getAll("booking");
  const trackingValues = requested.searchParams.getAll("tracking");
  if (bookingValues.length > 1 || trackingValues.length > 1) {
    return null;
  }

  if (bookingValues.length === 0) {
    return trackingValues.length === 0
      ? `${productionOrigin}${requested.pathname}`
      : null;
  }

  const bookingReference = bookingValues[0].trim().toUpperCase();
  if (!publicBookingReference.test(bookingReference)) {
    return null;
  }
  if (trackingValues.length === 1 && trackingValues[0] !== "1") {
    return null;
  }

  const safeUrl = new URL(requested.pathname, productionOrigin);
  safeUrl.searchParams.set("booking", bookingReference);
  if (trackingValues.length === 1) {
    safeUrl.searchParams.set("tracking", "1");
  }
  return safeUrl.toString();
}

export function shouldAllowCustomerWebViewNavigation(requestedUrl: string) {
  const requested = parseProductionUrl(requestedUrl);
  if (!requested) return false;

  if (customerPagePaths.has(requested.pathname)) return true;

  if (
    policyPaths.has(requested.pathname) &&
    !requested.search &&
    !requested.hash
  ) {
    return true;
  }

  return (
    requested.pathname.startsWith("/api/customer-portal-access/") &&
    safeCustomerPortalUrl(requested) !== null
  );
}

export function customerUniversalLinkUrl(value: string) {
  const requested = parseProductionUrl(value);
  return requested ? safeCustomerPortalUrl(requested) : null;
}

export function customerTabForUrl(value: string): CustomerTab | null {
  const requested = parseProductionUrl(value);
  if (!requested) return null;

  if (requested.pathname === "/book") return "book";
  if (
    requested.pathname === "/my-bookings" ||
    safeCustomerPortalUrl(requested) !== null
  ) {
    return "bookings";
  }
  return null;
}

export function customerTabUrl(tab: CustomerTab) {
  return `${productionOrigin}/${tab === "book" ? "book" : "my-bookings"}`;
}

export function isAllowedNativeContactUrl(value: string) {
  try {
    const requested = new URL(value);
    return (
      (requested.protocol === "tel:" || requested.protocol === "mailto:") &&
      !requested.username &&
      !requested.password
    );
  } catch {
    return false;
  }
}
