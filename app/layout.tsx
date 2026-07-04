import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Prestige Ops",
  },
  applicationName: "Prestige Limo Ops",
  title: "Prestige Limo Ops",
  description: "Simple limousine booking operations dashboard",
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: "/icons/prestige-ops-apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
