import type { PublicCompanyProfile } from "./company-profile-shared";

export const publicCompanyProfileApiPath = "/api/company-profile";

type PublicCompanyProfileFetch = typeof fetch;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function loadPublicCompanyProfile({
  fetcher = fetch,
  signal,
}: {
  fetcher?: PublicCompanyProfileFetch;
  signal?: AbortSignal;
} = {}): Promise<PublicCompanyProfile | null> {
  try {
    const response = await fetcher(publicCompanyProfileApiPath, {
      cache: "no-store",
      signal,
    });
    const data = asRecord(await response.json().catch(() => null));

    if (response.ok && data?.ok === true && data.profile) {
      return data.profile as PublicCompanyProfile;
    }
  } catch {
    return null;
  }

  return null;
}
