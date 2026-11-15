/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0e14",
        foreground: "#f1f5f9",
        card: "#121722",
        cardBorder: "rgba(255, 255, 255, 0.08)",
        primary: "#6366f1",
        accent: "#38bdf8",
        success: "#10b981",
        error: "#ef4444",
        warning: "#f59e0b",
      },
    },
  },
  plugins: [],
};
