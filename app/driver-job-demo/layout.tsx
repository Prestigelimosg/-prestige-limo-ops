import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function DriverJobDemoLayout({ children }: Readonly<{ children: ReactNode }>) {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return children;
}
