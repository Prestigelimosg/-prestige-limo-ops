export const productionOrigin = "https://app.prestigelimo.sg";

export type CustomerTab = "book" | "bookings";

const customerPagePaths = new Set([
  "/book",
  "/my-bookings",
  "/customer-access/activate",
  "/customer-access/sign-in",
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

function safeCustomerBookingUrl(requested: URL) {
  if (requested.pathname !== "/my-bookings" || requested.hash) return null;
  const keys = [...requested.searchParams.keys()];
  if (keys.some((key) => key !== "booking" && key !== "tracking")) return null;
  const booking = requested.searchParams.get("booking")?.trim().toUpperCase() || "";
  if (!publicBookingReference.test(booking)) return null;
  if (requested.searchParams.get("tracking") !== "1") return null;
  const safe = new URL("/my-bookings", productionOrigin);
  safe.searchParams.set("booking", booking);
  safe.searchParams.set("tracking", "1");
  return safe.toString();
}

function safeCustomerAccessUrl(requested: URL) {
  if (requested.hash) return null;
  if (requested.pathname === "/customer-access/activate") {
    const invite = requested.searchParams.get("invite") || "";
    return invite.length >= 40 && invite.length <= 4096 && [...requested.searchParams.keys()].every((key) => key === "invite")
      ? requested.toString()
      : null;
  }
  if (requested.pathname === "/customer-access/sign-in") {
    const installation = requested.searchParams.get("installation") || "";
    return /^customer-ios-[A-Za-z0-9-]{16,160}$/.test(installation) && [...requested.searchParams.keys()].every((key) => key === "installation")
      ? requested.toString()
      : null;
  }
  return null;
}

export function shouldAllowCustomerWebViewNavigation(requestedUrl: string) {
  const requested = parseProductionUrl(requestedUrl);
  if (!requested) return false;

  if (customerPagePaths.has(requested.pathname)) {
    if (!requested.search && !requested.hash) return true;
    return safeCustomerBookingUrl(requested) !== null || safeCustomerAccessUrl(requested) !== null;
  }

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

export function shouldAllowCustomerMapEmbedNavigation(
  requestedUrl: string,
  isTopFrame: boolean | undefined,
) {
  if (isTopFrame !== false) return false;

  try {
    const requested = new URL(requestedUrl);
    if (
      requested.origin !== "https://www.google.com" ||
      requested.hash ||
      requested.username ||
      requested.password
    ) {
      return false;
    }

    const queryKeys = [...requested.searchParams.keys()];
    let coordinateValue: string | null = null;
    if (requested.pathname === "/maps") {
      if (
        queryKeys.length !== 3 ||
        queryKeys.some((key) => key !== "q" && key !== "z" && key !== "output") ||
        requested.searchParams.getAll("q").length !== 1 ||
        requested.searchParams.getAll("z").length !== 1 ||
        requested.searchParams.getAll("output").length !== 1 ||
        requested.searchParams.get("z") !== "16" ||
        requested.searchParams.get("output") !== "embed"
      ) {
        return false;
      }
      coordinateValue = requested.searchParams.get("q");
    } else if (requested.pathname === "/maps/embed") {
      if (
        queryKeys.length !== 2 ||
        queryKeys.some((key) => key !== "origin" && key !== "pb") ||
        requested.searchParams.getAll("origin").length !== 1 ||
        requested.searchParams.getAll("pb").length !== 1 ||
        requested.searchParams.get("origin") !== "mfe"
      ) {
        return false;
      }
      coordinateValue = requested.searchParams
        .get("pb")
        ?.match(/^!1m3!2m1!1s(-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)!6i16$/)?.[1] ?? null;
    } else {
      return false;
    }

    const coordinateMatch = coordinateValue?.match(
      /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/,
    );
    if (!coordinateMatch) return false;

    const latitude = Number(coordinateMatch[1]);
    const longitude = Number(coordinateMatch[2]);
    return (
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180
    );
  } catch {
    return false;
  }
}

export function customerUniversalLinkUrl(value: string) {
  const requested = parseProductionUrl(value);
  return requested
    ? safeCustomerPortalUrl(requested) || safeCustomerBookingUrl(requested) || safeCustomerAccessUrl(requested)
    : null;
}

export function customerTabForUrl(value: string): CustomerTab | null {
  const requested = parseProductionUrl(value);
  if (!requested) return null;

  if (requested.pathname === "/book") return "book";
  if (
    requested.pathname === "/my-bookings" ||
    safeCustomerPortalUrl(requested) !== null ||
    safeCustomerBookingUrl(requested) !== null ||
    safeCustomerAccessUrl(requested) !== null
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
