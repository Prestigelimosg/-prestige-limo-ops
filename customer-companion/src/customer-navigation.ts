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
    portalTokenPath.test(requested.pathname) &&
    !requested.search &&
    !requested.hash
  );
}

export function customerTabForUrl(value: string): CustomerTab | null {
  const requested = parseProductionUrl(value);
  if (!requested) return null;

  if (requested.pathname === "/book") return "book";
  if (
    requested.pathname === "/my-bookings" ||
    portalTokenPath.test(requested.pathname)
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
