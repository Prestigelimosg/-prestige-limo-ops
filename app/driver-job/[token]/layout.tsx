import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige Driver",
  },
  applicationName: "Prestige Driver Portal",
  manifest: "/driver-portal.webmanifest",
  title: "Prestige Driver Job",
};

export default function DriverJobLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
