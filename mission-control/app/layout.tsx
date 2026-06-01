import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

const dmMono = localFont({
  src: [
    { path: "../public/fonts/dm-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/dm-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-dm-mono",
  display: "swap",
});

const dmSans = localFont({
  src: [
    { path: "../public/fonts/dm-sans-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/dm-sans-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/dm-sans-600.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/dm-sans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Mission Control - AI Task Orchestration & Collaboration",
  icons: {
    icon: "/icon-rounded.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`antialiased bg-dark-bg text-dark-text ${dmSans.variable} ${dmMono.variable}`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
