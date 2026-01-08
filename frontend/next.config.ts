import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typescript: {
    // ⚠️ Отключаем проверку типов при сборке
    ignoreBuildErrors: true,
  },
  eslint: {
    // ⚠️ Отключаем проверку ESLint при сборке
    ignoreDuringBuilds: true,
  },
  // Убеждаемся, что CSS правильно обрабатывается в production
  // experimental: {
  //   optimizeCss: true, // может вызывать проблемы с Tailwind v4
  // },
};

export default nextConfig;
