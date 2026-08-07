import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

function resolveBuildCommit() {
  const hostedCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();

  if (hostedCommit) {
    return hostedCommit;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

function resolvePublicBuildCommit(buildCommit: string) {
  const normalizedCommit = buildCommit.trim().toLowerCase();

  return /^[a-f0-9]{7,40}$/.test(normalizedCommit)
    ? normalizedCommit.slice(0, 8)
    : "unavailable";
}

const buildCommit = resolveBuildCommit();

const nextConfig: NextConfig = {
  env: {
    PRESTIGE_BUILD_COMMIT: buildCommit,
    PRESTIGE_PUBLIC_BUILD_COMMIT: resolvePublicBuildCommit(buildCommit),
  },
};

export default nextConfig;
