import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige Driver",
  },
  applicationName: "Prestige Driver Portal",
  description: "Assigned Prestige Limo driver jobs.",
  manifest: "/driver-portal.webmanifest",
  title: "Prestige Driver Portal",
};

export default function DriverPortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
