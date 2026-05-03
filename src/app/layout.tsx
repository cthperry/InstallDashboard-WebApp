import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "@/app/providers";
import { APP_VERSION } from "@/config/appVersion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Install Operations F66",
  description: "Premtek 裝機營運、設備台帳、產能風險與資料治理中樞",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Install Ops F66",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#2563eb",
  },
};

export const viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased">
        {gaId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        ) : null}

        <Script id="sw-register" strategy="afterInteractive">
          {`
            (async function () {
              if (!('serviceWorker' in navigator)) return;
              const host = window.location.hostname;
              const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

              if (isLocalhost) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((reg) => reg.unregister()));
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.filter((key) => key.startsWith('premtek-')).map((key) => caches.delete(key)));
                return;
              }

              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                  console.warn('[SW] registration failed', err);
                });
              });
            })();
          `}
        </Script>

        <Providers appVersion={APP_VERSION}>{children}</Providers>
      </body>
    </html>
  );
}
