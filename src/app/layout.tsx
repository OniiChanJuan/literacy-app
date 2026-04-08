import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import CookieBanner from "@/components/cookie-banner";
import ScrollToTop from "@/components/scroll-to-top";
import EmailVerificationBanner from "@/components/email-verification-banner";
import Providers from "@/components/providers";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SITE_TITLE_DEFAULT,
  SITE_TITLE_TEMPLATE,
} from "@/lib/site";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700", "800", "900"],
  display: "swap",
  variable: "--font-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE_DEFAULT,
    template: SITE_TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  keywords: [
    "movies", "tv", "games", "anime", "books", "manga", "music",
    "podcasts", "comics", "reviews", "ratings", "recommendations",
    "cross-media", "discover",
  ],
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    url: SITE_URL,
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE_TITLE_DEFAULT }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable}`}>
      <head>
        {/* Site-wide structured data — Organization + WebSite (homepage SEO) */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: SITE_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/icon`,
                description: SITE_DESCRIPTION,
              },
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: SITE_NAME,
                url: SITE_URL,
                description: SITE_DESCRIPTION,
                potentialAction: {
                  "@type": "SearchAction",
                  target: `${SITE_URL}/explore?q={search_term_string}`,
                  "query-input": "required name=search_term_string",
                },
              },
            ]),
          }}
        />
      </head>
      <body style={{ minHeight: "100vh", background: "#0b0b10", fontFamily: "var(--font-sans)", color: "#fff", margin: 0, padding: 0 }}>
        <Providers>
          <Nav />
          <EmailVerificationBanner />
          <main style={{ paddingTop: 26, paddingBottom: 80 }}>
            {children}
          </main>
          <Footer />
          <CookieBanner />
          <ScrollToTop />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
