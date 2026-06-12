import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QuantaFlow — Construction Hub",
  description: "AI takeoff · Cabinetry estimating · Quoting · Job costing · Claims",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#07090c" }}>{children}</body>
    </html>
  );
}
