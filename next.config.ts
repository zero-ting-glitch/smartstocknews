import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // 静态导出时不生成 404 页面（Cloudflare Pages 有自己的 404）
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
