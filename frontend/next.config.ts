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
};

export default nextConfig;
