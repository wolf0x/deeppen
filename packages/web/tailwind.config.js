/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0d1117",
          surface: "#161b22",
          elevated: "#1c2128",
        },
        border: {
          DEFAULT: "#30363d",
        },
        text: {
          primary: "#e6edff",
          secondary: "#8b949e",
        },
        accent: {
          blue: "#4fc3f7",
          purple: "#d2a8ff",
          green: "#3fb950",
          red: "#f85149",
          orange: "#ffa657",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
