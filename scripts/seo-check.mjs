#!/usr/bin/env node
// SEO QA for the production build (dist/). No dependencies.
// Usage: npm run build && npm run seo:check   (exit code 1 on errors)
//
// Checks every generated HTML page for: lang, unique title/description, canonical,
// robots, Open Graph + Twitter image, single H1, JSON-LD validity, image dimensions,
// broken internal links; and cross-checks sitemap.xml, robots.txt and llms.txt.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const ORIGIN = "https://ratulroy.com";
const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const toRoute = (f) => {
  const r = "/" + relative(DIST, f).replace(/\.html$/, "").replace(/(^|\/)index$/, "");
  return r === "/" ? "/" : r.replace(/\/$/, "");
};
const routes = new Map(htmlFiles.map((f) => [toRoute(f), readFileSync(f, "utf8")]));
const assets = new Set(files.map((f) => "/" + relative(DIST, f)));

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const metas = (html, key, val) => [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]).filter((t) => attr(t, key) === val);
const decode = (s = "") => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

const titles = new Map();
const descs = new Map();
const indexable = new Set();
const resolves = (href) => {
  const path = href.split("#")[0].split("?")[0].replace(/\/$/, "") || "/";
  return routes.has(path) || assets.has(path) || path === "/sitemap.xml" || path === "/llms.txt";
};

for (const [route, html] of routes) {
  const is404 = route === "/404";
  if (!/<html[^>]*\blang="[a-z-]+"/i.test(html)) err(route, "missing <html lang>");
  if (!/<meta charset="utf-8"/i.test(html)) err(route, "missing charset");

  const t = [...html.matchAll(/<title>([^<]*)<\/title>/g)];
  if (t.length !== 1) err(route, `expected 1 <title>, found ${t.length}`);
  const title = decode(t[0]?.[1] ?? "");
  if (!title) err(route, "empty title");
  else if (title.length > 65) warn(route, `title ${title.length} chars: "${title}"`);

  const d = metas(html, "name", "description");
  if (d.length !== 1) err(route, `expected 1 meta description, found ${d.length}`);
  const desc = decode(attr(d[0] ?? "", "content") ?? "");
  if (desc.length < 70 || desc.length > 170) warn(route, `description ${desc.length} chars`);

  const robots = attr(metas(html, "name", "robots")[0] ?? "", "content") ?? "";
  const noindex = /noindex/.test(robots);
  if (is404 && !noindex) err(route, "404 page must be noindex");
  if (!is404 && noindex) warn(route, "noindex (check this is intended)");
  if (!noindex) indexable.add(route);

  const canon = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
  if (!is404) {
    if (canon.length !== 1) err(route, `expected 1 canonical, found ${canon.length}`);
    const expected = ORIGIN + (route === "/" ? "/" : route);
    if (canon[0] && canon[0][1] !== expected) err(route, `canonical ${canon[0][1]} != ${expected}`);
  }

  if (!noindex) {
    if (title) titles.set(title, [...(titles.get(title) ?? []), route]);
    if (desc) descs.set(desc, [...(descs.get(desc) ?? []), route]);
  }

  // Social
  for (const p of ["og:title", "og:description", "og:url", "og:image", "og:image:width", "og:image:height", "og:image:alt"]) {
    const n = metas(html, "property", p).length;
    if (n !== 1) err(route, `expected 1 ${p}, found ${n}`);
  }
  const og = attr(metas(html, "property", "og:image")[0] ?? "", "content");
  if (og) {
    if (!og.startsWith(ORIGIN + "/")) err(route, `og:image not absolute on ${ORIGIN}: ${og}`);
    else if (!assets.has(og.slice(ORIGIN.length))) err(route, `og:image file missing in build: ${og}`);
    else if (route !== "/" && route !== "/404" && og.endsWith("/og/index.jpg"))
      warn(route, "uses the default share card; run `npm run og:cards` to generate its own");
  }
  if (metas(html, "name", "twitter:card").length !== 1 || metas(html, "name", "twitter:image").length !== 1)
    err(route, "twitter:card / twitter:image missing or duplicated");

  // Headings
  const h1 = (html.match(/<h1\b/g) ?? []).length;
  if (h1 !== 1) err(route, `expected 1 <h1>, found ${h1}`);

  // JSON-LD
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (ld.length > 1) err(route, `multiple JSON-LD blocks (${ld.length}); use one @graph`);
  for (const [, json] of ld) {
    try {
      const data = JSON.parse(json);
      const ids = (data["@graph"] ?? [data]).map((n) => n["@id"]).filter(Boolean);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length) err(route, `duplicate @id in JSON-LD: ${dupes.join(", ")}`);
    } catch (e) {
      err(route, `invalid JSON-LD: ${e.message}`);
    }
  }
  if (!is404 && !ld.length) warn(route, "no JSON-LD");

  // Images need intrinsic dimensions (CLS)
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\bwidth="/.test(tag) || !/\bheight="/.test(tag)) err(route, `img without width/height: ${tag.slice(0, 90)}`);
    if (!/\balt(=|\s|>|\/)/.test(tag)) err(route, `img without alt: ${tag.slice(0, 90)}`);
  }

  // Internal links
  for (const [, href] of html.matchAll(/<a\b[^>]*href="(\/[^"]*)"/g)) {
    if (href.startsWith("//")) continue;
    if (!resolves(href)) err(route, `broken internal link ${href}`);
  }
}

for (const [t, r] of titles) if (r.length > 1) err(r.join(", "), `duplicate title "${t}"`);
for (const [d, r] of descs) if (r.length > 1) err(r.join(", "), `duplicate description "${d.slice(0, 60)}..."`);

// Sitemap: every indexable page listed, nothing else.
const sm = existsSync(join(DIST, "sitemap.xml")) ? readFileSync(join(DIST, "sitemap.xml"), "utf8") : "";
if (!sm) err("sitemap.xml", "missing");
const smUrls = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(ORIGIN, "").replace(/^$/, "/")));
for (const u of smUrls) {
  if (!routes.has(u)) err("sitemap.xml", `lists a URL that is not built: ${u}`);
  else if (!indexable.has(u)) err("sitemap.xml", `lists a noindex URL: ${u}`);
}
for (const r of indexable) if (!smUrls.has(r)) err("sitemap.xml", `indexable page missing: ${r}`);
for (const [, lm] of sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g))
  if (new Date(lm) > new Date(Date.now() + 864e5)) err("sitemap.xml", `lastmod in the future: ${lm}`);

// robots.txt
const robots = existsSync(join(DIST, "robots.txt")) ? readFileSync(join(DIST, "robots.txt"), "utf8") : "";
if (!robots) err("robots.txt", "missing");
if (/^\s*Disallow:\s*\/\s*$/m.test(robots)) err("robots.txt", "disallows the whole site");
if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) err("robots.txt", "does not reference /sitemap.xml");

// llms.txt (Lighthouse: needs an H1 and at least one markdown link)
const llms = existsSync(join(DIST, "llms.txt")) ? readFileSync(join(DIST, "llms.txt"), "utf8") : "";
if (llms) {
  if (!/^\s*#\s+.+/m.test(llms)) err("llms.txt", "missing H1");
  if (!/\[.+\]\(.+\)/.test(llms)) err("llms.txt", "no markdown links");
}

console.log(`SEO check: ${routes.size} pages, ${indexable.size} indexable, ${smUrls.size} in sitemap`);
if (warnings.length) console.log(`\nWarnings (${warnings.length}):\n  ` + warnings.join("\n  "));
if (errors.length) {
  console.log(`\nErrors (${errors.length}):\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log("\nNo errors.");
