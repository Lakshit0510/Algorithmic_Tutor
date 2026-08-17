import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: { fontFamily: { display: ["Outfit", "ui-sans-serif", "system-ui"], mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"] } } },
  plugins: []
} satisfies Config;
