import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Noto_Sans_TC } from "next/font/google";

import { Providers } from "@/app/providers";

const notoSansTC = Noto_Sans_TC({
  weight: ["400", "500", "700"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "裝機狀態 Dashboard",
  description: "Premtek 裝機進度追蹤（行動裝置/桌機 WebApp）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "20260228-F9";

  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body className={`${notoSansTC.variable} antialiased`}>
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

        <Providers appVersion={appVersion}>{children}</Providers>
      </body>
    </html>
  );
}
