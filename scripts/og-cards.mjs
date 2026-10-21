#!/usr/bin/env node
// Generates one branded 1200x630 Open Graph card per built page into public/og/.
// Run after a build whenever page titles change:
//   npm run build && npm run og:cards && npm run build
// Needs Playwright + a Chromium binary (not a project dependency):
//   PLAYWRIGHT=/path/to/playwright/index.mjs CHROMIUM=/path/to/chromium node scripts/og-cards.mjs
// The cards are committed, so production builds (Cloudflare Pages) never need a browser.
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "public/og");
const pw = await import(process.env.PLAYWRIGHT ?? "playwright").catch(() => null);
if (!pw) {
  console.error("Playwright not found. Set PLAYWRIGHT=/path/to/playwright/index.mjs or `npm i -D playwright`.");
  process.exit(1);
}

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const strip = (s = "") =>
  s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const pages = walk(DIST)
  .filter((f) => f.endsWith(".html") && !f.endsWith("404.html"))
  .map((f) => {
    const html = readFileSync(f, "utf8");
    const rel = relative(DIST, f).replace(/\.html$/, "");
    const eyebrow = strip(html.match(/<p class="eyebrow"[^>]*>([\s\S]*?)<\/p>/)?.[1]);
    const crumbsCat = strip(html.match(/<span class="chip"[^>]*>([^<]+)<\/span>/)?.[1]);
    return {
      out: join(OUT, `${rel}.jpg`),
      title: strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]),
      kicker: rel === "index" ? "Local SEO Specialist · Bangladesh & Worldwide" : rel.startsWith("blog/") ? crumbsCat || "Local SEO Guide" : eyebrow,
      section: rel.startsWith("blog/") ? "Guide" : rel.startsWith("case-studies/") ? "Case study" : rel.startsWith("industries/") ? "Industry" : "",
    };
  });

const b64 = (p) => readFileSync(join(ROOT, p)).toString("base64");
const display = b64("node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2");
const body = b64("node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2");
const portrait = b64("src/assets/img/brand/logo-portrait.jpg");
const topo = readFileSync(join(ROOT, "public/topo.svg"), "utf8");

// Deterministic geo-grid motif: green near the pin, amber around, grey outside.
const grid = Array.from({ length: 49 }, (_, i) => {
  const d = Math.hypot((i % 7) - 3, Math.floor(i / 7) - 3);
  return `<i class="${d < 1.6 ? "g" : d < 2.9 ? "a" : ""}"></i>`;
}).join("");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const card = (p) => `<!doctype html><html><head><style>
@font-face{font-family:D;src:url(data:font/woff2;base64,${display}) format('woff2');font-weight:200 800}
@font-face{font-family:B;src:url(data:font/woff2;base64,${body}) format('woff2');font-weight:400 700}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#f4f7f6;font-family:B,sans-serif;color:#0f1a1c;position:relative}
.topo{position:absolute;inset:0;opacity:.55;background:url("data:image/svg+xml;base64,${Buffer.from(topo).toString("base64")}") 0 0/1100px auto}
.glow{position:absolute;right:-120px;top:-120px;width:640px;height:640px;border-radius:50%;background:radial-gradient(circle,rgba(15,157,99,.16),transparent 65%)}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:14px;font-size:22px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c8301d}
.pin{width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#c8301d;position:relative}
.pin:after{content:"";position:absolute;inset:6px;border-radius:50%;background:#fff}
.sec{margin-left:auto;padding:8px 18px;border-radius:999px;background:#0f1a1c;color:#fff;font-size:18px;letter-spacing:.06em}
h1{margin-top:34px;max-width:760px;font-family:D,sans-serif;font-weight:700;letter-spacing:-.035em;line-height:1.06;font-size:${p.title.length > 70 ? 54 : p.title.length > 48 ? 62 : 72}px;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.route{margin-top:22px;width:220px;height:14px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 12' preserveAspectRatio='none'%3E%3Cpath d='M2 8 C 30 2, 50 11, 80 6 S 130 2, 160 7 S 190 9, 198 4' fill='none' stroke='%23c8301d' stroke-width='3.4' stroke-linecap='round'/%3E%3C/svg%3E") 0 0/100% 100%}
.foot{margin-top:auto;display:flex;align-items:center;gap:18px}
.foot img{width:76px;height:76px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px #c8301d}
.foot b{display:block;font-family:D,sans-serif;font-size:30px;letter-spacing:-.02em}
.foot span{font-size:20px;color:#5f6d6b}
.url{margin-left:auto;font-size:22px;font-weight:700;color:#0f1a1c}
.grid{position:absolute;right:72px;top:150px;width:300px;display:grid;grid-template-columns:repeat(7,1fr);gap:10px;padding:22px;border-radius:28px;background:#fff;box-shadow:0 30px 70px -26px rgba(16,42,40,.35)}
.grid i{aspect-ratio:1;border-radius:50%;background:#e3e9e7}
.grid i.a{background:#f2a516}.grid i.g{background:#087a4c}
.mark{position:absolute;right:${72 + 150 - 18}px;top:${150 + 150 - 40}px;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#c8301d;border:4px solid #fff;box-shadow:0 8px 18px rgba(200,48,29,.45)}
</style></head><body><div class="topo"></div><div class="glow"></div>
<div class="grid">${grid}</div><div class="mark"></div>
<div class="wrap">
<div class="top"><span class="pin"></span>${esc(p.kicker || "Ratul Roy · Local SEO")}${p.section ? `<span class="sec">${p.section}</span>` : ""}</div>
<h1>${esc(p.title)}</h1><div class="route"></div>
<div class="foot"><img src="data:image/jpeg;base64,${portrait}"><div><b>Ratul Roy</b><span>Local SEO Specialist · Fiverr Level 2 · 4.9★ (243 reviews)</span></div><div class="url">ratulroy.com</div></div>
</div></body></html>`;

const browser = await pw.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const p of pages) {
  if (!p.title) continue;
  mkdirSync(dirname(p.out), { recursive: true });
  await page.setContent(card(p), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: p.out, type: "jpeg", quality: 86 });
}
await browser.close();
console.log(`Wrote ${pages.length} cards to public/og/`);
if (!existsSync(join(OUT, "index.jpg"))) console.warn("Warning: public/og/index.jpg (site default card) is missing");
