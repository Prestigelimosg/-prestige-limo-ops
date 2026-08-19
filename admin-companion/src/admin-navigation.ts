export const productionOrigin = "https://app.prestigelimo.sg";

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

export function isProtectedAdminPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/") ||
    pathname === "/settings/invoice"
  );
}

export function isAdminSignInUrl(value: string) {
  const requested = parseProductionUrl(value);
  if (!requested || requested.pathname !== "/admin-sign-in") return false;

  for (const key of requested.searchParams.keys()) {
    if (key !== "return_to" && key !== "action") return false;
  }
  const action = requested.searchParams.get("action");
  return !action || action === "signout";
}

export function isProtectedAdminUrl(value: string) {
  const requested = parseProductionUrl(value);
  return requested ? isProtectedAdminPath(requested.pathname) : false;
}

export function shouldAllowAdminWebViewNavigation(value: string) {
  return isAdminSignInUrl(value) || isProtectedAdminUrl(value);
}

export function adminSignInUrl(returnTo = "/") {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/";
  return `${productionOrigin}/admin-sign-in?return_to=${encodeURIComponent(safeReturnTo)}`;
}
