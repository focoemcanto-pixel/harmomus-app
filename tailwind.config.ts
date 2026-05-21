import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#050506",
        surface: "#101114",
        "surface-muted": "#17191e",
        border: "#2a2c33",
        foreground: "#f4f4f5",
        muted: "#a1a1aa",
        gold: {
          300: "#d6c083",
          400: "#c9aa5a",
          500: "#b89140"
        }
      },
      boxShadow: {
        premium: "0 20px 35px -15px rgba(0,0,0,0.65)",
      },
      borderRadius: {
        xl: "1rem",
      }
    },
  },
  plugins: [],
};

export default config;
