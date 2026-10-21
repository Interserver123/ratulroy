# ratulroy.com (Astro)

Static Astro site. Content lives in `src/data/`, sections in `src/components/home/`.

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs ./dist
```

## Deploy (Cloudflare Pages)
Build command `npm run build`, output directory `dist`, Node 22.12+.
URLs build as `/about.html` and are served at `/about` (no trailing slash), matching the old site.

## Forms
Set `PUBLIC_FORM_ENDPOINT` (see `.env.example`) to receive form submissions as JSON.
Without it, forms open an email to hello@ratulroy.com.

## Still to add
- Remaining FAQ answers (`src/data/home.ts` → `faqs`)
- Result screenshots (`results[].image`), "Trusted By" logos (`About.astro`), social share image (`ogImage`)
- The other pages linked from the nav (services, industries, case studies, blog, about, contact, legal)
