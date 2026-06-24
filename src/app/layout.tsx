import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartStock - 智慧畜牧信息聚合站",
  description: "智慧畜牧的新玩法，一个站看全球。聚焦IoT/AI/自动化在养殖业的应用。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex">{children}</body>
    </html>
  );
}
