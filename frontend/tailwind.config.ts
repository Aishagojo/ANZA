import type { Config } from "tailwindcss";

// Color tokens copied 1:1 from the design spec (section 4 — COLOR SYSTEM).
// If the spec's palette ever changes, this is the only file that needs editing —
// every component below references these names, never raw hex values.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#FFFFFF",
        surface: "#F7F9FC",
        "text-primary": "#0F172A",
        "text-secondary": "#64748B",
        brand: {
          DEFAULT: "#2563EB",
          dark: "#1D4ED8",
        },
        success: {
          DEFAULT: "#16A34A",
          bg: "#F0FDF4",
        },
        bitcoin: "#F7931A",
        border: "#E2E8F0",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      maxWidth: {
        page: "1280px",
      },
    },
  },
  plugins: [],
};
export default config;
