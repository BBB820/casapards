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
  themeColor: "#12302f",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
