// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ratulroy.com",
  // Matches the live URLs (/about, /services) with no trailing slash.
  trailingSlash: "never",
  build: { format: "file", inlineStylesheets: "auto" },
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
  // Sitemap: src/pages/sitemap.xml.ts (styled by public/sitemap.xsl)
  compressHTML: true,
});
