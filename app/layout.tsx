import type { Metadata } from "next";
import { Schibsted_Grotesk, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://live.cityhallwatcher.com'),
  title: {
    default: 'CHW Live — Toronto City Council',
    template: '%s',
  },
  description: 'Live coverage of Toronto City Council meetings by Matt Elliott.',
  openGraph: {
    type: 'website',
    siteName: 'CHW Live',
    url: 'https://live.cityhallwatcher.com',
    images: [{ url: '/chw-logo.png', width: 1200, height: 1200 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/chw-logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${schibstedGrotesk.variable} ${hankenGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
