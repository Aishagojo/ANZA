import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Brand update: ANZA is the active product name and the browser icon should use the logo asset from the public images folder.
export const metadata: Metadata = {
  title: "ANZA — License creator content, prove the agreement",
  description:
    "Create licensing offers for your content, get paid with Bitcoin Lightning, and create a publicly verifiable licensing record on Nostr.",
  icons: {
    icon: "/images/Dynamic%20ANZA%20Media%20Logo.png",
    shortcut: "/images/Dynamic%20ANZA%20Media%20Logo.png",
    apple: "/images/Dynamic%20ANZA%20Media%20Logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
