import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige Driver",
  },
  applicationName: "Prestige Limo Driver",
  description: "Prestige Limo private Driver Job.",
  manifest: "/prestige-driver.webmanifest",
  title: "Prestige Limo Driver",
};

export default function DriverJobLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <>{children}</>;
}
