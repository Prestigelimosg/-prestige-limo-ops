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

const nextConfig: NextConfig = {
  env: {
    PRESTIGE_BUILD_COMMIT: resolveBuildCommit(),
  },
};

export default nextConfig;
