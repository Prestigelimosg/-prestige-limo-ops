import { Directory, File, Paths } from "expo-file-system";
import { Share } from "react-native";

type PdfResult = "shared" | "cancelled" | "failed";
type PdfContext = { eventUrl: string; currentUrl: string; loadedUrl: string; unlocked: boolean };
const maximumBase64Length = 4 * Math.ceil((10 * 1024 * 1024) / 3);

function isInvoicePage(value: string) {
  try {
    const url = new URL(value);
    return url.origin === "https://app.prestigelimo.sg" && url.pathname === "/my-bookings" && !url.username && !url.password;
  } catch {
    return false;
  }
}

// One PDF sheet per app. This only receives bytes already returned by the
// existing authenticated invoice endpoint; it never fetches a URL or a cookie.
export function createCustomerInvoicePdfHandler() {
  let busy = false;
  return async (data: string, context: PdfContext, reply: (id: string, result: PdfResult) => void): Promise<boolean> => {
    if (data.length > maximumBase64Length + 512) return true;
    let request: Record<string, unknown>;
    try {
      request = JSON.parse(data);
      if (!request || request.type !== "customer_invoice_pdf") return false;
    } catch {
      return false;
    }
    const { requestId, filename, base64 } = request;
    if (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) return true;
    if (
      !context.unlocked || ![context.eventUrl, context.currentUrl, context.loadedUrl].every(isInvoicePage) || busy ||
      Object.keys(request).sort().join(",") !== "base64,filename,requestId,type" ||
      typeof filename !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_. -]{0,119}\.pdf$/.test(filename) ||
      typeof base64 !== "string" || base64.length > maximumBase64Length ||
      !base64.startsWith("JVBERi0") || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
    ) {
      reply(requestId, "failed");
      return true;
    }
    busy = true;
    let directory: Directory | undefined;
    let result: PdfResult = "failed";
    try {
      // Clear only our temporary invoice cache, including leftovers after a crash.
      directory = new Directory(Paths.cache, "customer-invoice-pdf");
      if (directory.exists) directory.delete();
      directory.create();
      const file = new File(directory, filename);
      file.write(base64, { encoding: "base64" });
      const response = await Share.share({ url: file.uri });
      result = response.action === Share.sharedAction ? "shared" : "cancelled";
    } catch {
      result = "failed";
    } finally {
      try { if (directory?.exists) directory.delete(); } catch { /* Retry cache cleanup on the next PDF request. */ }
      busy = false;
    }
    reply(requestId, result);
    return true;
  };
}

export function customerInvoicePdfResultScript(requestId: string, status: PdfResult) {
  return `window.dispatchEvent(new CustomEvent('prestige-customer-pdf-result',{detail:${JSON.stringify({ requestId, status })}}));true;`;
}
