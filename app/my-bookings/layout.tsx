import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige Customer",
  },
  applicationName: "Prestige Limo Customer",
  description: "Prestige Limo customer bookings and trip updates.",
  manifest: "/prestige-customer.webmanifest",
  title: "Prestige Limo Customer",
};

export default function CustomerPortalLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}
