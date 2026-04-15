import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Manrope } from "next/font/google";
import { HashLinkSmoothScroll } from "@/components/hash-link-smooth-scroll";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrafficLift - AI SEO Audits On Demand",
  description:
    "Order AI-assisted SEO audits on demand. Track issues, prioritize fixes, and improve rankings with actionable reports.",
  icons: {
    icon: [
      { url: "/icon.svg?v=1", type: "image/svg+xml" },
      { url: "/favicon.ico?v=1", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=1",
    apple: "/icon.svg?v=1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          signInForceRedirectUrl="/dashboard"
          signUpForceRedirectUrl="/dashboard"
        >
          <HashLinkSmoothScroll />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
