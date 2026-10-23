import type { Config } from "tailwindcss";

/** Shade -> CSS variable, so the whole palette can flip between light and dark (see globals.css) */
const themed = (name: string, shades: number[]) =>
  Object.fromEntries(shades.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]));

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        zinc: themed("zinc", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        indigo: themed("indigo", [100, 200, 300, 400]),
        emerald: themed("emerald", [100, 200, 300, 400]),
        amber: themed("amber", [100, 200, 300, 400]),
        rose: themed("rose", [100, 200, 300, 400]),
        violet: themed("violet", [100, 200, 300, 400]),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "slide-in": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(8px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "slide-in": "slide-in .25s cubic-bezier(.2,.8,.2,1)",
        "fade-in": "fade-in .2s ease-out",
        "pop-in": "pop-in .2s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
