import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT_NAME } from "../lib/constants";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — The Complete Construction Platform`,
  description: "AI takeoff · Cabinetry estimating · Quoting · Job costing · Claims",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}