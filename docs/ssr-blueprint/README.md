# Astro SSR on Cloudflare: SEO blueprint

A reference project, not part of the live site. It shows dynamic, server-rendered pages that stay fast and crawler-safe.

It was built and tested with Astro 6.4.8 and `@astrojs/cloudflare` 13.7.0:

- `astro check`: 0 errors
- `astro build` succeeds
- local Worker run with D1, results below

| Request | Result |
| --- | --- |
| First render | 200, ~59 ms (`X-Edge-Cache: MISS`) |
| Repeat, and repeat with `?utm_source=…` | 200, ~13 ms (`X-Edge-Cache: HIT`) |
| Unknown slug, and invalid slug | 404 page with `noindex`; invalid slugs never query D1 |
| Database unavailable | 503 + `Retry-After: 120` + `noindex` (Google retries instead of dropping the URL) |
| JavaScript shipped | none, except the opt-in share button |

## Files

| File | Purpose |
| --- | --- |
| `astro.config.mjs` | Static by default, Cloudflare adapter, Fonts API, remote image domains |
| `wrangler.jsonc` | Worker name, D1 binding, vars |
| `src/env.d.ts` | Binding types (`npx wrangler types` generates these) |
| `src/lib/edge-data.ts` | D1 and API fetchers with timeouts, parallel reads and `ok / 404 / 503` results |
| `src/lib/seo.ts` | Canonical, title and description clamping, JSON-LD helpers |
| `src/middleware.ts` | Edge HTML cache (Cache API) and Cache-Control policy |
| `src/layouts/BaseLayout.astro` | Meta, Open Graph, JSON-LD, font preload, LCP image preload |
| `src/pages/[slug].astro` | Dynamic SSR page template |
| `src/components/*` | Static components, and one minimal interactive island |

## Run it

```sh
npm install
npx wrangler d1 create site-content        # put the id into wrangler.jsonc
npx astro build
npx wrangler d1 execute site-content --local --config dist/server/wrangler.json --file seed.example.sql
npx wrangler dev --config dist/server/wrangler.json
npx wrangler deploy --config dist/server/wrangler.json
```

## Deploy target

With Astro 6, `@astrojs/cloudflare` deploys SSR as a **Cloudflare Worker**, not as Pages Functions. A project's `functions/` directory is not used by that Worker, so API routes must move to Astro endpoints (`src/pages/api/*.ts`).
