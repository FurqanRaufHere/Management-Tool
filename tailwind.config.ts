import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F2F4F1",
        surface: "#FFFFFF",
        ink: { DEFAULT: "#1D2733", soft: "#3A4654" },
        muted: "#5D6B7A",
        faint: "#8A96A3",
        line: { DEFAULT: "#E3E7E4", strong: "#CBD2CD" },
        board: { DEFAULT: "#2D6A4F", deep: "#22513C", soft: "#E3EEE7", mist: "#F1F6F2" },
        leave: { DEFAULT: "#9A6A12", soft: "#F6EDD9" },
        absent: { DEFAULT: "#A3384E", soft: "#F6E3E7" },
        late: { DEFAULT: "#4F8A6E", soft: "#E8F1EC" },
        chalk: "#F2D16B",
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk Variable"', "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: { xl: "0.875rem" },
      boxShadow: {
        lift: "0 1px 0 rgba(29,39,51,0.04), 0 8px 24px -12px rgba(29,39,51,0.18)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { rise: "rise 180ms ease-out" },
    },
  },
  plugins: [],
} satisfies Config;
