import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Tailwind CSS v4 использует CSS-first конфигурацию через @theme
  // Этот файл нужен для совместимости и для IDE автодополнения
};

export default config;

