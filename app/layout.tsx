import type { Metadata, Viewport } from "next";
import "./globals.css";
import { HOUSE_NAME } from "@/lib/house.ts";

export const metadata: Metadata = {
  title: HOUSE_NAME,
  description: `Check which nights are free at ${HOUSE_NAME} and reserve your stay.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#141a17" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
