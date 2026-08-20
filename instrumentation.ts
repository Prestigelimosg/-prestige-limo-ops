export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installSupabaseModernSecretFetchCompatibility } = await import(
      "./lib/supabase-modern-secret-fetch-compat.ts"
    );

    installSupabaseModernSecretFetchCompatibility(process.env.SUPABASE_URL);
  }
}
