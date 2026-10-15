export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "sonner";
import AppStateProvider from "@/lib/providers/state-providers";
import { UserProvider } from "@/lib/providers/user-provider";
import { SessionProvider } from "next-auth/react";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Neura Query",
  description: "Your ultimate research copilot: simplify effortlessly",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Toaster richColors closeButton />
        <AppStateProvider>
          <SessionProvider>
            <UserProvider>{children}</UserProvider>
          </SessionProvider>
        </AppStateProvider>
      </body>
    </html>
  );
}
