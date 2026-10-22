// Edge data access for SSR routes. Rules that keep TTFB low and crawlers safe:
//  1. Every upstream call has a hard timeout: a slow DB/API never hangs the response.
//  2. Independent reads run in parallel (Promise.all), never one after another.
//  3. Results are typed as ok | 404 | 503, so the page can answer with the right status:
//     404 = gone (Google drops it), 503 + Retry-After = temporary (Google retries, keeps the URL).
import { env } from "cloudflare:workers";

export type PageRecord = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  bodyHtml: string; // sanitised HTML from your CMS
  image: { src: string; alt: string; width: number; height: number } | null;
  author: string;
  publishedAt: string; // ISO
  updatedAt: string; // ISO
  faqs: { q: string; a: string }[];
};

export type Result<T> = { ok: true; data: T } | { ok: false; status: 404 | 503 };

/** Cheap guard so junk URLs from bots never reach the database. */
export const isValidSlug = (slug: string | undefined): slug is string => !!slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 120;

/** Rejects if `p` does not settle in time. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)))]).finally(() =>
    clearTimeout(timer),
  );
}

type Row = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  body_html: string;
  image_src: string | null;
  image_alt: string | null;
  image_w: number | null;
  image_h: number | null;
  author: string;
  published_at: string;
  updated_at: string;
  faqs: string | null; // JSON
};

const toRecord = (r: Row): PageRecord => ({
  slug: r.slug,
  title: r.title,
  description: r.description,
  heading: r.heading,
  bodyHtml: r.body_html,
  image: r.image_src && r.image_w && r.image_h ? { src: r.image_src, alt: r.image_alt ?? "", width: r.image_w, height: r.image_h } : null,
  author: r.author,
  publishedAt: r.published_at,
  updatedAt: r.updated_at,
  faqs: r.faqs ? (JSON.parse(r.faqs) as PageRecord["faqs"]) : [],
});

/**
 * Option A: Cloudflare D1. `withSession("first-unconstrained")` lets D1 answer from the
 * nearest read replica (enable read replication on the database), which is what keeps
 * cold-cache TTFB low for visitors far from the primary.
 */
export async function getPage(slug: string): Promise<Result<PageRecord>> {
  try {
    const db = env.DB.withSession("first-unconstrained");
    const row = await withTimeout(
      db
        .prepare(
          `SELECT slug, title, description, heading, body_html, image_src, image_alt, image_w, image_h,
                  author, published_at, updated_at, faqs
             FROM pages WHERE slug = ? AND status = 'published' LIMIT 1`,
        )
        .bind(slug)
        .first<Row>(),
      150,
    );
    return row ? { ok: true, data: toRecord(row) } : { ok: false, status: 404 };
  } catch (err) {
    console.error("getPage failed", slug, err);
    return { ok: false, status: 503 };
  }
}

export async function getRelated(slug: string, limit = 3): Promise<{ slug: string; title: string }[]> {
  try {
    const db = env.DB.withSession("first-unconstrained");
    const { results } = await withTimeout(
      db.prepare("SELECT slug, title FROM pages WHERE status = 'published' AND slug != ? ORDER BY updated_at DESC LIMIT ?").bind(slug, limit).all<{ slug: string; title: string }>(),
      120,
    );
    return results;
  } catch {
    return []; // non-critical: render the page without the related block
  }
}

/**
 * Option B: a headless CMS / REST API. The `cf` options cache the upstream JSON in
 * Cloudflare's edge cache, so most requests never leave the data centre.
 */
export async function fetchJson<T>(path: string, { timeoutMs = 150, edgeTtl = 300 } = {}): Promise<Result<T>> {
  try {
    const res = await fetch(new URL(path, env.CONTENT_API), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": edgeTtl, "404": 60, "500-599": 0 } },
    });
    if (res.status === 404) return { ok: false, status: 404 };
    if (!res.ok) return { ok: false, status: 503 };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    console.error("fetchJson failed", path, err);
    return { ok: false, status: 503 };
  }
}
