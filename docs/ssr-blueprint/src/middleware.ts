// Edge HTML cache for SSR routes.
// Cloudflare does NOT cache Worker responses automatically, so a Cache-Control header alone
// doesn't make SSR pages "serve from the edge". This middleware stores rendered HTML in the
// data centre's Cache API: repeat requests (and crawlers) get a cache hit with no render and
// no database round trip. Browsers get a short max-age, so content stays fresh.
import { defineMiddleware } from "astro:middleware";

const EDGE_TTL = 300; // seconds a rendered page is reused at the edge
const BROWSER_TTL = 60; // seconds the browser may reuse it
const BYPASS_COOKIE = /(?:^|;\s*)(session|preview)=/; // logged-in / preview traffic is never cached
const TRACKING = /^(utm_|gclid$|fbclid$|msclkid$|ref$)/; // stripped from the cache key
const BROWSER_CACHE = `public, max-age=${BROWSER_TTL}, stale-while-revalidate=${EDGE_TTL}`;

export const onRequest = defineMiddleware(async (ctx, next) => {
  // Prerendered pages are already static assets; API routes manage their own headers.
  if (ctx.isPrerendered || ctx.url.pathname.startsWith("/api/")) return next();

  const { request } = ctx;
  const cacheable = (request.method === "GET" || request.method === "HEAD") && !BYPASS_COOKIE.test(request.headers.get("Cookie") ?? "");
  if (!cacheable) return withPrivate(await next());

  // One cache entry per page, regardless of tracking parameters.
  const keyUrl = new URL(ctx.url);
  for (const k of [...keyUrl.searchParams.keys()]) if (TRACKING.test(k)) keyUrl.searchParams.delete(k);
  keyUrl.searchParams.sort();
  const key = new Request(keyUrl.toString(), { method: "GET" });

  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set("Cache-Control", BROWSER_CACHE); // the stored copy carries the edge TTL; browsers get theirs
    res.headers.set("X-Edge-Cache", "HIT");
    return res;
  }

  const response = await next();

  // Only cache complete, successful HTML. 404/503 must reach Google with their real status.
  const isHtml = (response.headers.get("Content-Type") ?? "").includes("text/html");
  if (response.status !== 200 || !isHtml || response.headers.has("Set-Cookie")) {
    response.headers.set("Cache-Control", response.status === 200 ? `public, max-age=0, must-revalidate` : "no-store");
    return response;
  }

  // Browser: short reuse + background revalidation. Edge copy: EDGE_TTL via s-maxage.
  response.headers.set("Cache-Control", BROWSER_CACHE);
  response.headers.set("X-Edge-Cache", "MISS");

  const toCache = response.clone();
  const stored = new Response(toCache.body, toCache);
  stored.headers.set("Cache-Control", `public, s-maxage=${EDGE_TTL}`); // Cache API expiry
  ctx.locals.cfContext.waitUntil(cache.put(key, stored)); // never delays the response
  return response;
});

function withPrivate(res: Response): Response {
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
