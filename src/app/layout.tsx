import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeAnes — High-Density Clinical Anesthesia Workstation",
  description: "Unified Perioperative Decision Support, Record Review & Physiologic Intelligence System",
};

import { LocalizationProvider } from "@/context/LocalizationContext";
import type { Locale } from "@/i18n/messages";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const localeCookie = (await cookies()).get("safeanes_locale")?.value;
  const initialLocale: Locale = localeCookie === "vi" ? "vi" : "en";

  return (
    <html lang={initialLocale} className="dark">
      <body className="min-w-[1280px] min-h-screen bg-[#02080C] text-[#F4F7F8] antialiased overflow-hidden">
        <LocalizationProvider initialLocale={initialLocale}>
          {children}
        </LocalizationProvider>
      </body>
    </html>
  );
}
