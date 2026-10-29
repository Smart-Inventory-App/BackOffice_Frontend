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
        // Niveles de alerta, los mismos de la app: crítica en rojo y advertencia en amarillo
        critical: "#E5484D",
        warn: "#FBBC05",
        // Texto oscuro sobre el fondo suave de cada nivel
        criticalInk: "#671A1C",
        warnInk: "#564209",
        tealInk: "#14554B",
      },
      boxShadow: {
        card: "0 3px 12px rgba(27, 58, 143, 0.08)",
        lift: "0 8px 24px rgba(27, 58, 143, 0.14)",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
