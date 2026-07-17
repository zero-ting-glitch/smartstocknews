import type { Metadata } from "next";
import { BackToTop } from "@/components/BackToTop";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartStock - 智慧农业信息聚合站",
  description: "智慧农业的新玩法，一个站看全球。聚焦IoT/AI/自动化在种植业与养殖业的应用。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex">{children}<BackToTop /></body>
    </html>
  );
}
