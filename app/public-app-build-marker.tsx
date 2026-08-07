type PublicAppBuildMarkerProps = {
  tone?: "dark" | "light";
};

const configuredPublicBuildCommit = process.env.PRESTIGE_PUBLIC_BUILD_COMMIT?.trim().toLowerCase() || "";
const publicBuildCommit = /^[a-f0-9]{8}$/.test(configuredPublicBuildCommit)
  ? configuredPublicBuildCommit
  : "unavailable";

export function PublicAppBuildMarker({ tone = "light" }: PublicAppBuildMarkerProps) {
  return (
    <p
      className={`mt-1 text-[11px] font-medium tracking-wide ${tone === "dark" ? "text-slate-300" : "text-slate-500"}`}
      data-public-app-build-marker="true"
    >
      Build {publicBuildCommit}
    </p>
  );
}
