import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Picking Logistica",
  description: "Sistema di picking con import Excel, barcode e PDF"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
