import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige My Bookings",
  },
  applicationName: "Prestige Limo My Bookings",
  description: "Your Prestige Limo bookings and trip updates.",
  manifest: "/customer-app.webmanifest",
  title: "Prestige My Bookings",
};

export default function CustomerPortalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
