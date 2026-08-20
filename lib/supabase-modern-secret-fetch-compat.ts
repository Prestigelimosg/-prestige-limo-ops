import "server-only";

type MarkedFetch = typeof fetch & {
  __prestigeSupabaseModernSecretCompatibility?: true;
};

function requestUrlForFetch(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string" || input instanceof URL) {
    return new URL(String(input));
  }

  return new URL(input.url);
}

export function installSupabaseModernSecretFetchCompatibility(supabaseUrl: string | undefined) {
  let supabaseOrigin: string;

  if (!supabaseUrl) {
    return;
  }

  try {
    supabaseOrigin = new URL(supabaseUrl).origin;
  } catch {
    return;
  }

  const currentFetch = globalThis.fetch as MarkedFetch;

  if (currentFetch.__prestigeSupabaseModernSecretCompatibility) {
    return;
  }

  const originalFetch = currentFetch;
  const compatibleFetch = (async (input, init) => {
    let requestUrl: URL;

    try {
      requestUrl = requestUrlForFetch(input);
    } catch {
      return originalFetch(input, init);
    }

    if (requestUrl.origin !== supabaseOrigin) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const apiKey = headers.get("apikey") ?? "";
    const authorization = headers.get("authorization") ?? "";

    if (
      apiKey.startsWith("sb_secret_") &&
      authorization === `Bearer ${apiKey}`
    ) {
      headers.delete("authorization");
      return originalFetch(input, { ...init, headers });
    }

    return originalFetch(input, init);
  }) as MarkedFetch;

  Object.defineProperty(compatibleFetch, "__prestigeSupabaseModernSecretCompatibility", {
    value: true,
  });
  globalThis.fetch = compatibleFetch;
}
