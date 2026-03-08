import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 關閉 dev 模式的 Next.js 指示器（包含左下角「N」pill）
  devIndicators: false
};

export default nextConfig;
