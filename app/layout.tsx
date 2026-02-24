// ========== 全局布局 ==========
// 设置页面元数据、字体和全局样式

import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day1 Global Briefing | 每日投资情报",
  description: "每日全球市场投资情报仪表板 — 美股、加密货币、市场情绪一站掌握",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={GeistSans.className}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
