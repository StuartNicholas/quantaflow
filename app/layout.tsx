import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verixo — The Complete Construction Platform",
  description: "AI takeoff · Cabinetry estimating · Quoting · Job costing · Claims",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}