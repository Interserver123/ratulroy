// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://ratulroy.com",
  // Matches the live URLs (/about, /services) with no trailing slash.
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "auto" },
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  integrations: [sitemap()],
  compressHTML: true,
});
