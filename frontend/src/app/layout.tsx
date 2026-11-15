import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradePro — Next-Gen Algorithmic Trading",
  description: "Ultra low-latency trading platform powered by Fyers API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
