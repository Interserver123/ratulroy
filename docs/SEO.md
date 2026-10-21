# SEO architecture: ratulroy.com

Astro 6 (`astro@^6.4.8`), fully static output (`output` default, no adapter), deployed to Cloudflare Pages. Every route is prerendered; there are no SSR or on-demand routes. All titles, metadata, links and JSON-LD are in the initial HTML.

## How metadata works

| Concern | Where | Notes |
|---|---|---|
| Production origin | `astro.config.mjs` `site` + `src/data/site.ts` `url` | Both `https://ratulroy.com`. |
| `<title>`, description, canonical, robots, Open Graph, Twitter | `src/layouts/BaseLayout.astro` | One set per page. Canonical = origin + path, no `.html`, no `index`, no trailing slash, no query/fragment. |
| Share images | `public/og/<route>.jpg` via `src/lib/og.ts` | 1200×630 branded cards. Missing card falls back to `/og/index.jpg`, so `og:image` is never absent. |
| JSON-LD | Page builds its nodes; `BaseLayout` emits **one** `@graph` and adds `WebSite`/`Person`/`ProfessionalService` (`src/lib/schema.ts`) when referenced but not defined. | `<` is escaped. Stable IDs: `/#website`, `/#person`, `/#business`. |
| Sitemap | `src/pages/sitemap.xml.ts` (+ `public/sitemap.xsl` for browsers) | Built from content collections. `lastmod` only from real dates (blog date, page `updated`). |
| robots.txt | `public/robots.txt` | Allow all; explicit AI-crawler policy comment. |
| llms.txt | `src/pages/llms.txt.ts` | Generated from collections, canonical URLs only. |
| 404 | `src/pages/404.astro` | `noindex`; Cloudflare Pages returns status 404. Not in sitemap. |
| Headers / redirects | `public/_headers`, `public/_redirects` | Security + cache headers; old sitemap URLs 301 to `/sitemap.xml`. |

## Commands

```bash
npm run build        # production build
npm run seo:check    # QA on dist/: titles, descriptions, canonicals, robots, OG/Twitter, single H1,
                     # JSON-LD validity, img width/height/alt, internal links, sitemap/robots/llms
npm test             # build + seo:check (exit 1 on any error)
npm run og:cards     # regenerate share cards after titles change (needs Playwright + Chromium):
                     # PLAYWRIGHT=/path/playwright/index.mjs CHROMIUM=/path/chromium npm run og:cards
```

Workflow when adding or retitling a page: `npm run build && npm run og:cards && npm test`, then commit `public/og/`.

## Cannibalisation watch-list

- `/blog/seo-cost-bangladesh` (all SEO pricing) vs `/blog/local-seo-cost-bangladesh` (Local SEO only): keep the scopes distinct and cross-linked.
- `/industries/construction-seo` (commercial builds) vs `/industries/contractor-seo` (residential remodel): differentiated in copy and linked to each other.
- `/services` (hub) vs `/local-seo-service` (pillar): hub links down; pillar owns "local SEO services".

## Post-deployment checklist

1. Connect `ratulroy.com` to the Cloudflare Pages project; confirm `https://ratulroy.com/` serves this build over HTTPS.
2. Then add the `X-Robots-Tag: noindex` block for `https://:project.pages.dev/*` (template at the top of `public/_headers`) so the preview domain is never indexed.
3. Google Search Console: verify the domain property, submit `https://ratulroy.com/sitemap.xml`, remove any old `sitemap-index.xml` submission.
4. URL Inspection → "Test live URL" on `/`, `/local-seo-service`, one industry page, one blog post: check rendered HTML, canonical selected by Google, and that structured data is detected.
5. Bing Webmaster Tools: import from Search Console, submit the sitemap, enable IndexNow if wanted.
6. Validate a few live pages in the Schema.org validator and Google Rich Results Test (valid markup does not guarantee rich results).
7. Share `/` and a blog post in the Facebook Sharing Debugger, X post composer and LinkedIn Post Inspector to confirm the cards.
8. After 28 days of traffic, check Core Web Vitals (real-user CrUX) in Search Console and PageSpeed Insights; lab Lighthouse scores are not field data.
9. Keep the business details identical to the Google Business Profile (name, address, phone). Open item: site says Khulna, GBP pin and legal pages say Bagerhat.

## Route inventory

All routes: rendering = SSG (prerendered). Generated from the production build.

| Route | Rendering | Robots | Canonical | Content source |
|---|---|---|---|---|
| `/404` | SSG | noindex | https://ratulroy.com/404 | src/pages + data |
| `/about` | SSG | index | https://ratulroy.com/about | src/pages + data |
| `/blog` | SSG | index | https://ratulroy.com/blog | content/pages |
| `/blog/ai-search-visibility-local-business` | SSG | index | https://ratulroy.com/blog/ai-search-visibility-local-business | content/blog |
| `/blog/google-business-profile-optimization-checklist` | SSG | index | https://ratulroy.com/blog/google-business-profile-optimization-checklist | content/blog |
| `/blog/how-local-seo-works-bangladesh` | SSG | index | https://ratulroy.com/blog/how-local-seo-works-bangladesh | content/blog |
| `/blog/how-long-local-seo-takes-bangladesh` | SSG | index | https://ratulroy.com/blog/how-long-local-seo-takes-bangladesh | content/blog |
| `/blog/how-to-choose-seo-specialist-bangladesh` | SSG | index | https://ratulroy.com/blog/how-to-choose-seo-specialist-bangladesh | content/blog |
| `/blog/local-citations-nap-consistency-guide` | SSG | index | https://ratulroy.com/blog/local-citations-nap-consistency-guide | content/blog |
| `/blog/local-seo-bangladesh-guide` | SSG | index | https://ratulroy.com/blog/local-seo-bangladesh-guide | content/blog |
| `/blog/local-seo-cost-bangladesh` | SSG | index | https://ratulroy.com/blog/local-seo-cost-bangladesh | content/blog |
| `/blog/local-seo-for-home-service-businesses` | SSG | index | https://ratulroy.com/blog/local-seo-for-home-service-businesses | content/blog |
| `/blog/local-seo-helps-businesses-rank-google-maps` | SSG | index | https://ratulroy.com/blog/local-seo-helps-businesses-rank-google-maps | content/blog |
| `/blog/local-seo-vs-google-ads-bangladesh` | SSG | index | https://ratulroy.com/blog/local-seo-vs-google-ads-bangladesh | content/blog |
| `/blog/local-seo-vs-traditional-seo` | SSG | index | https://ratulroy.com/blog/local-seo-vs-traditional-seo | content/blog |
| `/blog/seo-cost-bangladesh` | SSG | index | https://ratulroy.com/blog/seo-cost-bangladesh | content/blog |
| `/blog/seo-specialist-vs-agency-bangladesh` | SSG | index | https://ratulroy.com/blog/seo-specialist-vs-agency-bangladesh | content/blog |
| `/blog/what-does-seo-specialist-do` | SSG | index | https://ratulroy.com/blog/what-does-seo-specialist-do | content/blog |
| `/blog/what-is-local-seo-bangladesh` | SSG | index | https://ratulroy.com/blog/what-is-local-seo-bangladesh | content/blog |
| `/blog/why-local-seo-important-bangladesh` | SSG | index | https://ratulroy.com/blog/why-local-seo-important-bangladesh | content/blog |
| `/blog/why-my-business-not-showing-google-maps` | SSG | index | https://ratulroy.com/blog/why-my-business-not-showing-google-maps | content/blog |
| `/blog/youngest-seo-expert-bangladesh-story` | SSG | index | https://ratulroy.com/blog/youngest-seo-expert-bangladesh-story | content/blog |
| `/book-strategy-call` | SSG | index | https://ratulroy.com/book-strategy-call | content/pages |
| `/careers/local-seo-specialist` | SSG | index | https://ratulroy.com/careers/local-seo-specialist | content/pages |
| `/case-studies` | SSG | index | https://ratulroy.com/case-studies | content/pages |
| `/case-studies/data-driven-organic-growth` | SSG | index | https://ratulroy.com/case-studies/data-driven-organic-growth | content/cases |
| `/case-studies/gbp-calls-growth` | SSG | index | https://ratulroy.com/case-studies/gbp-calls-growth | content/cases |
| `/case-studies/hamper-story` | SSG | index | https://ratulroy.com/case-studies/hamper-story | content/cases |
| `/case-studies/map-pack-service-areas` | SSG | index | https://ratulroy.com/case-studies/map-pack-service-areas | content/cases |
| `/case-studies/techictalk-organic-growth` | SSG | index | https://ratulroy.com/case-studies/techictalk-organic-growth | content/cases |
| `/contact` | SSG | index | https://ratulroy.com/contact | content/pages |
| `/generative-engine-optimization` | SSG | index | https://ratulroy.com/generative-engine-optimization | content/pages |
| `/google-business-profile-optimization` | SSG | index | https://ratulroy.com/google-business-profile-optimization | content/pages |
| `/` | SSG | index | https://ratulroy.com/ | src/pages + data |
| `/industries` | SSG | index | https://ratulroy.com/industries | content/pages |
| `/industries/auto-repair-seo` | SSG | index | https://ratulroy.com/industries/auto-repair-seo | content/industries |
| `/industries/cleaning-seo` | SSG | index | https://ratulroy.com/industries/cleaning-seo | content/industries |
| `/industries/construction-seo` | SSG | index | https://ratulroy.com/industries/construction-seo | content/industries |
| `/industries/contractor-seo` | SSG | index | https://ratulroy.com/industries/contractor-seo | content/industries |
| `/industries/dental-seo` | SSG | index | https://ratulroy.com/industries/dental-seo | content/industries |
| `/industries/electrician-seo` | SSG | index | https://ratulroy.com/industries/electrician-seo | content/industries |
| `/industries/healthcare-seo` | SSG | index | https://ratulroy.com/industries/healthcare-seo | content/industries |
| `/industries/hvac-seo` | SSG | index | https://ratulroy.com/industries/hvac-seo | content/industries |
| `/industries/legal-seo` | SSG | index | https://ratulroy.com/industries/legal-seo | content/industries |
| `/industries/moving-seo` | SSG | index | https://ratulroy.com/industries/moving-seo | content/industries |
| `/industries/pest-control-seo` | SSG | index | https://ratulroy.com/industries/pest-control-seo | content/industries |
| `/industries/plumbing-seo` | SSG | index | https://ratulroy.com/industries/plumbing-seo | content/industries |
| `/industries/real-estate-seo` | SSG | index | https://ratulroy.com/industries/real-estate-seo | content/industries |
| `/industries/roofing-seo` | SSG | index | https://ratulroy.com/industries/roofing-seo | content/industries |
| `/industries/towing-seo` | SSG | index | https://ratulroy.com/industries/towing-seo | content/industries |
| `/local-seo-dhaka` | SSG | index | https://ratulroy.com/local-seo-dhaka | content/pages |
| `/local-seo-service` | SSG | index | https://ratulroy.com/local-seo-service | content/pages |
| `/privacy-policy` | SSG | index | https://ratulroy.com/privacy-policy | content/pages |
| `/seo-for-home-services` | SSG | index | https://ratulroy.com/seo-for-home-services | content/pages |
| `/seo-for-wholesale-distributors` | SSG | index | https://ratulroy.com/seo-for-wholesale-distributors | content/pages |
| `/services` | SSG | index | https://ratulroy.com/services | content/pages |
| `/technical-seo` | SSG | index | https://ratulroy.com/technical-seo | content/pages |
| `/terms` | SSG | index | https://ratulroy.com/terms | content/pages |
