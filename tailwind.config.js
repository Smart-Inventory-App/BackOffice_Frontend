/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Matches app_frontend src/constants/colors.ts
        primary: "#2CC4B4",
        primaryDark: "#1B3A8F",
        ink: "#1A1A1A",
        muted: "#6E6E6E",
        line: "#E0E0E0",
        danger: "#FF3B30",
        canvas: "#F5F7FA",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
