// @ts-check
import { defineConfig, fontProviders } from "astro/config";

// Latin + Latin Extended unicode ranges (what the site's English and Banglish text uses).
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const fs = (pkg, file) => `./node_modules/@fontsource-variable/${pkg}/files/${file}`;

export default defineConfig({
  site: "https://ratulroy.com",
  // Matches the live URLs (/about, /services) with no trailing slash.
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "auto" },
  // Sitemap: src/pages/sitemap.xml.ts (styled by public/sitemap.xsl)
  compressHTML: true,
  // Self-hosted fonts via Astro's Fonts API. `optimizedFallbacks` (default on) adds a
  // metric-matched fallback face, so text set in the fallback occupies the same space.
  // display "optional": a font that is late never swaps in mid-view (no layout shift).
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Instrument Sans Variable",
      cssVariable: "--ff-body",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          { src: [fs("instrument-sans", "instrument-sans-latin-wght-normal.woff2")], weight: "400 700", style: "normal", display: "optional", unicodeRange: [LATIN] },
          { src: [fs("instrument-sans", "instrument-sans-latin-ext-wght-normal.woff2")], weight: "400 700", style: "normal", display: "optional", unicodeRange: [LATIN_EXT] },
          { src: [fs("instrument-sans", "instrument-sans-latin-wght-italic.woff2")], weight: "400 700", style: "italic", display: "optional", unicodeRange: [LATIN] },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Bricolage Grotesque Variable",
      cssVariable: "--ff-display",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          { src: [fs("bricolage-grotesque", "bricolage-grotesque-latin-wght-normal.woff2")], weight: "200 800", style: "normal", display: "optional", unicodeRange: [LATIN] },
          { src: [fs("bricolage-grotesque", "bricolage-grotesque-latin-ext-wght-normal.woff2")], weight: "200 800", style: "normal", display: "optional", unicodeRange: [LATIN_EXT] },
        ],
      },
    },
  ],
});
