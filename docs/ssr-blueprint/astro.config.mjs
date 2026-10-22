// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://example.com", // used for canonical + absolute OG URLs
  // Prerender by default (static HTML from the edge = fastest TTFB).
  // Only routes that export `prerender = false` run on the Worker.
  output: "static",
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "auto" },

  // Astro 6 + @astrojs/cloudflare 13 deploy SSR as a Cloudflare Worker (with static assets).
  // "cloudflare" = on-the-fly resizing via /cdn-cgi/image (enable Image Transformations on the zone).
  adapter: cloudflare({ imageService: "cloudflare" }),

  // Remote images coming from your CMS/DB must be allow-listed.
  image: { domains: ["images.example-cdn.com"] },

  // Self-hosted fonts with size-adjusted fallbacks (no FOIT, minimal CLS).
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Inter",
      cssVariable: "--font-sans",
      weights: ["400 700"],
      subsets: ["latin"],
      display: "swap",
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],

  // No `prefetch` option: enabling it injects a ~2 KB script on every page.
});
