// Website knowledge base: crawls the site's own pages (from /sitemap.xml), splits each
// page into heading-based chunks and indexes them in SQLite FTS5 (BM25 ranking).
// Crawls run in small batches so each request stays inside Cloudflare's limits.
import type { Env } from "../types";
import { nowIso, uuid } from "../http";
import { getSettings, setSettings } from "./settings";
import { log } from "./log";

const BATCH = 6;
const MAX_CHUNK = 1400;

declare const HTMLRewriter: {
  new (): {
    on(selector: string, handlers: Record<string, unknown>): any;
    transform(res: Response): Response;
  };
};

export type Chunk = { url: string; title: string; heading: string | null; content: string };

/** Fetches a site path. Uses the static-asset binding when available (no network hop). */
async function getPage(env: Env, origin: string, path: string): Promise<Response> {
  const url = new URL(path, origin).toString();
  if (env.ASSETS) return env.ASSETS.fetch(new Request(url, { headers: { Accept: "text/html" } }));
  return fetch(url, { headers: { Accept: "text/html", "User-Agent": "RatulRoy-KB/1.0" } });
}

const clean = (s: string) =>
  s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Extracts title, meta description and heading-based sections from one HTML page. */
export async function extract(res: Response, path: string, withFooter: boolean): Promise<Chunk[]> {
  let title = "";
  let description = "";
  const sections: { heading: string | null; text: string }[] = [{ heading: null, text: "" }];
  let headingBuf: string | null = null;
  let skip = 0;
  let footer = "";
  let inTitle = false;

  const cur = () => sections[sections.length - 1];
  const block = { element: () => (cur().text += "\n") };

  await new HTMLRewriter()
    .on("title", {
      element(el: any) {
        if (el.selfClosing || el.canHaveContent === false) return;
        try {
          el.onEndTag(() => (inTitle = false));
          inTitle = true;
        } catch {
          /* no end tag */
        }
      },
      text(t: any) {
        if (inTitle) title += t.text;
      },
    })
    .on('meta[name="description"]', { element: (el: any) => (description = el.getAttribute("content") ?? "") })
    .on("main script, main style, main svg, main noscript, main template, main [aria-hidden=true], main form, main button, main .sr-only", {
      element(el: any) {
        if (el.selfClosing || el.canHaveContent === false) return; // void tags (img, input) have no end tag
        try {
          el.onEndTag(() => skip--);
          skip++;
        } catch {
          /* element without an end tag */
        }
      },
    })
    .on("main h1, main h2, main h3", {
      element(el: any) {
        if (el.selfClosing || el.canHaveContent === false) return;
        try {
          el.onEndTag(() => {
            sections.push({ heading: clean(headingBuf ?? "").replace(/^\d{1,2}(?=\p{Lu})/u, "") || null, text: "" });
            headingBuf = null;
          });
          headingBuf = "";
        } catch {
          /* no end tag */
        }
      },
    })
    .on("main p, main li, main dt, main dd, main tr, main br, main blockquote, main figcaption, main summary, main h4, main h5, main div", block)
    .on("main td, main th", { element: () => (cur().text += " | ") })
    .on("main a, main nav li", { element: () => (cur().text += " ") })
    .on("main", {
      text(t: any) {
        if (skip > 0) return;
        if (headingBuf !== null) headingBuf += t.text;
        else cur().text += t.text;
      },
    })
    .on("footer", {
      text(t: any) {
        if (withFooter) footer += t.text;
      },
    })
    .on("footer p, footer li, footer h2", { element: () => withFooter && (footer += "\n") })
    .on("footer a[href^='tel:'], footer a[href^='mailto:'], footer a[href*='wa.me'], footer a[href*='whatsapp']", {
      element(el: any) {
        if (withFooter) footer += ` (${el.getAttribute("href")}) `;
      },
    })
    .transform(res)
    .arrayBuffer();

  title = clean(title).replace(/\s*[|·–-]\s*Ratul Roy.*$/i, "") || path;
  const chunks: Chunk[] = [];
  if (description) chunks.push({ url: path, title, heading: "Page summary", content: clean(description) });
  // Pack neighbouring sections into chunks of up to ~1,400 characters, so a search hit
  // carries enough surrounding context (a heading alone says little).
  let pack: { heading: string | null; text: string } | null = null;
  const flush = () => {
    if (pack && pack.text.trim().length >= 40) for (const part of splitText(pack.text.trim())) chunks.push({ url: path, title, heading: pack.heading, content: part });
    pack = null;
  };
  for (const s of sections) {
    const text = clean(s.text);
    if (!text) continue;
    const block = s.heading ? `${s.heading}\n${text}` : text;
    if (pack && pack.text.length + block.length + 2 > MAX_CHUNK) flush();
    if (!pack) pack = { heading: s.heading, text: "" };
    pack.text += block + "\n\n";
  }
  flush();
  if (withFooter && footer) chunks.push({ url: path, title: "Contact details", heading: "Contact and business details", content: clean(footer).slice(0, 2000) });
  return chunks;
}

function splitText(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const out: string[] = [];
  let buf = "";
  for (const para of text.split(/\n+/)) {
    if (buf && buf.length + para.length + 1 > MAX_CHUNK) {
      out.push(buf.trim());
      buf = "";
    }
    if (para.length > MAX_CHUNK) {
      for (const sentence of para.split(/(?<=[.!?।])\s+/)) {
        if (buf.length + sentence.length + 1 > MAX_CHUNK && buf) {
          out.push(buf.trim());
          buf = "";
        }
        buf += sentence.slice(0, MAX_CHUNK) + " ";
      }
    } else buf += para + "\n";
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Reads /sitemap.xml and returns same-site paths (pages only, no files). */
export async function sitemapPaths(env: Env, origin: string): Promise<string[]> {
  const res = await getPage(env, origin, "/sitemap.xml");
  if (!res.ok) throw new Error(`sitemap.xml returned HTTP ${res.status}`);
  const xml = await res.text();
  const paths = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    try {
      const u = new URL(m[1]);
      if (/\.(xml|txt|json|jpg|png|webp|pdf)$/i.test(u.pathname)) continue;
      paths.add(u.pathname || "/");
    } catch {
      /* skip */
    }
  }
  if (!paths.size) throw new Error("sitemap.xml has no URLs");
  return [...paths];
}

export type Scan = {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: string;
  status: "running" | "done" | "failed";
  urls: string;
  cursor: number;
  pages_ok: number;
  pages_failed: number;
  chunks: number;
  error: string | null;
};

export async function runningScan(env: Env): Promise<Scan | null> {
  // A scan untouched for 30 minutes is considered abandoned.
  const s = await env.DB.prepare("SELECT * FROM kb_scans WHERE status = 'running' ORDER BY started_at DESC LIMIT 1").first<Scan>();
  if (s && Date.now() - Date.parse(s.started_at) > 30 * 60_000) {
    await env.DB.prepare("UPDATE kb_scans SET status = 'failed', error = 'Abandoned', finished_at = ? WHERE id = ?").bind(nowIso(), s.id).run();
    await env.DB.prepare("DELETE FROM kb_chunks WHERE scan_id = ?").bind(s.id).run();
    return null;
  }
  return s;
}

export async function startScan(env: Env, origin: string, trigger: "manual" | "schedule"): Promise<Scan> {
  const existing = await runningScan(env);
  if (existing) return existing;
  const paths = await sitemapPaths(env, origin);
  const scan: Scan = {
    id: uuid(),
    started_at: nowIso(),
    finished_at: null,
    trigger,
    status: "running",
    urls: JSON.stringify(paths),
    cursor: 0,
    pages_ok: 0,
    pages_failed: 0,
    chunks: 0,
    error: null,
  };
  await env.DB.prepare("INSERT INTO kb_scans (id, started_at, trigger, status, urls) VALUES (?, ?, ?, 'running', ?)").bind(scan.id, scan.started_at, trigger, scan.urls).run();
  await log(env, "info", "kb", `Website scan started (${trigger}), ${paths.length} pages`);
  return scan;
}

/** Crawls the next batch. When the last batch is done, the new index replaces the old one. */
export async function stepScan(env: Env, origin: string, scan: Scan): Promise<Scan> {
  const urls = JSON.parse(scan.urls) as string[];
  const batch = urls.slice(scan.cursor, scan.cursor + BATCH);
  let ok = 0,
    failed = 0,
    count = 0;
  const failures: string[] = [];
  const now = nowIso();

  const results = await Promise.all(
    batch.map(async (path) => {
      try {
        const res = await getPage(env, origin, path);
        if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("text/html")) throw new Error(`HTTP ${res.status}`);
        return { path, chunks: await extract(res, path, path === "/") };
      } catch (e) {
        return { path, error: (e as Error).message };
      }
    }),
  );

  const stmts = [];
  for (const r of results) {
    if ("error" in r) {
      failed++;
      failures.push(`${r.path}: ${r.error}`);
      continue;
    }
    ok++;
    for (const c of r.chunks) {
      count++;
      stmts.push(
        env.DB.prepare("INSERT INTO kb_chunks (url, title, heading, content, scan_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(c.url, c.title, c.heading, c.content, scan.id, now),
      );
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  if (failures.length) await log(env, "warn", "kb", `${failures.length} page(s) failed to crawl`, failures);

  const next: Scan = { ...scan, cursor: scan.cursor + batch.length, pages_ok: scan.pages_ok + ok, pages_failed: scan.pages_failed + failed, chunks: scan.chunks + count };
  if (next.cursor < urls.length) {
    await env.DB.prepare("UPDATE kb_scans SET cursor = ?, pages_ok = ?, pages_failed = ?, chunks = ? WHERE id = ?").bind(next.cursor, next.pages_ok, next.pages_failed, next.chunks, scan.id).run();
    return next;
  }

  next.finished_at = nowIso();
  if (next.pages_ok === 0 || next.chunks === 0) {
    next.status = "failed";
    next.error = "No page could be read; the previous index was kept.";
    await env.DB.batch([
      env.DB.prepare("UPDATE kb_scans SET cursor = ?, pages_ok = ?, pages_failed = ?, chunks = ?, status = 'failed', error = ?, finished_at = ? WHERE id = ?").bind(
        next.cursor, next.pages_ok, next.pages_failed, next.chunks, next.error, next.finished_at, scan.id,
      ),
      env.DB.prepare("DELETE FROM kb_chunks WHERE scan_id = ?").bind(scan.id),
    ]);
    await log(env, "error", "kb", "Website scan failed: no pages indexed");
    return next;
  }
  next.status = "done";
  await env.DB.batch([
    env.DB.prepare("UPDATE kb_scans SET cursor = ?, pages_ok = ?, pages_failed = ?, chunks = ?, status = 'done', finished_at = ? WHERE id = ?").bind(
      next.cursor, next.pages_ok, next.pages_failed, next.chunks, next.finished_at, scan.id,
    ),
    env.DB.prepare("DELETE FROM kb_chunks WHERE scan_id != ?").bind(scan.id),
    env.DB.prepare("DELETE FROM kb_scans WHERE id NOT IN (SELECT id FROM kb_scans ORDER BY started_at DESC LIMIT 20)"),
  ]);
  await setSettings(env, { kb_active_scan: scan.id, kb_last_scan_at: next.finished_at });
  await log(env, "info", "kb", `Website scan finished: ${next.pages_ok} pages, ${next.chunks} sections indexed`, { failed: next.pages_failed });
  return next;
}

/** Runs a whole scan inside one request (used by the scheduled refresh). */
export async function fullScan(env: Env, origin: string, trigger: "manual" | "schedule", maxSteps = 40): Promise<Scan> {
  let scan = await startScan(env, origin, trigger);
  for (let i = 0; i < maxSteps && scan.status === "running"; i++) scan = await stepScan(env, origin, scan);
  return scan;
}

// ---- retrieval -----------------------------------------------------------------
// Bengali / Banglish words customers use -> English words that appear on the website.
// Works even when the AI query rewrite is unavailable.
const SYNONYMS: [RegExp, string][] = [
  [/প্যাকেজ|প্যাকেজের|package|pakage|pakej|প্ল্যান|plan/i, "package packages pricing price plan Essential"],
  [/দাম|মূল্য|খরচ|চার্জ|ফি|টাকা|কত|dam|daam|koto|khoroch|charge|price|cost|rate|budget|বাজেট/i, "price pricing cost packages from budget"],
  [/সার্ভিস|সেবা|কাজ কি|কী কী|ki ki|service|seba|kaj/i, "services service what is included"],
  [/গ্যারান্টি|নিশ্চয়তা|guarantee|garanti|নিশ্চিত/i, "guarantee guaranteed rankings results"],
  [/র‍্যাংক|র্যাংক|রেংক|র‍্যাঙ্ক|rank|ranking|টপে|প্রথমে|উপরে/i, "ranking rankings Map Pack top 3"],
  [/ম্যাপ|ম্যাপস|map|maps|গুগল ম্যাপ/i, "Google Maps Map Pack"],
  [/প্রোফাইল|জিবিপি|gbp|বিজনেস প্রোফাইল|profile/i, "Google Business Profile GBP optimization"],
  [/অডিট|audit|চেক/i, "audit free audit"],
  [/সময়|কত দিন|কতদিন|মাস|সপ্তাহ|koto din|kotodin|somoy|time|how long|কবে/i, "how long timeline months weeks results"],
  [/রিভিউ|review/i, "reviews review"],
  [/সাইটেশন|citation/i, "citations NAP"],
  [/ওয়েবসাইট|ওয়েব সাইট|সাইট|website|site/i, "website technical SEO pages"],
  [/যোগাযোগ|ফোন|নাম্বার|নম্বর|হোয়াটসঅ্যাপ|ইমেইল|contact|number|phone|whatsapp|email|call/i, "contact phone WhatsApp email book call"],
  [/মিটিং|কল বুক|meeting|book|appointment|অ্যাপয়েন্টমেন্ট/i, "book strategy call free"],
  [/ঢাকা|বাংলাদেশ|dhaka|bangladesh|গুলশান|ধানমন্ডি|উত্তরা|মিরপুর/i, "Dhaka Bangladesh local SEO Dhaka"],
  [/ফলাফল|রেজাল্ট|কেস স্টাডি|result|case|proof|প্রমাণ/i, "results case studies calls growth"],
  [/রাতুল|কে আপনি|about|ke apni|অভিজ্ঞতা|experience/i, "about Ratul Roy experience Fiverr reviews"],
  [/পেমেন্ট|বিকাশ|নগদ|payment|pay|bkash|nagad/i, "payment pay"],
  [/রিফান্ড|ফেরত|refund/i, "refund terms"],
  [/ডেন্টাল|ক্লিনিক|প্লাম্বার|রেস্টুরেন্ট|শোরুম|dental|clinic|plumber|restaurant|showroom|hvac|লইয়ার|lawyer/i, "industries dental clinic plumbing HVAC legal showroom"],
  [/এআই|জিইও|chatgpt|ai search|geo/i, "AI search GEO generative engine optimization"],
];

/** Adds English search words for Bengali / Banglish terms in the message. */
export function expandQuery(text: string): string {
  const extra = SYNONYMS.filter(([re]) => re.test(text)).map(([, en]) => en);
  return [text, ...extra].join(" ");
}

/** Short facts always given to the AI: page summaries of the main pages + contact details. */
export async function coreFacts(env: Env): Promise<Hit[]> {
  const active = (await getSettings(env)).kb_active_scan;
  if (!active) return [];
  const { results } = await env.DB.prepare(
    `SELECT id, url, title, heading, content, 0 AS score FROM kb_chunks
      WHERE scan_id = ?1 AND (
        (heading = 'Page summary' AND url IN ('/', '/services', '/local-seo-service', '/google-business-profile-optimization'))
        OR title = 'Contact details'
        OR (url = '/local-seo-service' AND content LIKE '%packages, starting from%'))
      ORDER BY id LIMIT 8`,
  )
    .bind(active)
    .all<Hit>();
  return results.map((h) => (h.title === "Contact details" ? { ...h, content: h.content.slice(0, 900) } : h));
}
export type Hit = Chunk & { id: number; score: number };

const STOP = new Set(
  "a an and are as at be but by can could do does for from had has have how i if in into is it its me my of on or our please so that the their them then there these they this to us was we what when where which who why will with would you your yes no hi hello hey thanks thank ok okay".split(" "),
);

/** Builds a safe FTS5 query: quoted terms OR'd together, with prefix matching. */
export function ftsQuery(text: string): string | null {
  const terms = [...new Set(text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((t) => t.length > 1 && !STOP.has(t))
    .slice(0, 40);
  if (!terms.length) return null;
  return terms.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
}

export async function search(env: Env, text: string, limit = 6): Promise<Hit[]> {
  const q = ftsQuery(text);
  if (!q) return [];
  const active = (await getSettings(env)).kb_active_scan;
  if (!active) return [];
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.url, c.title, c.heading, c.content, bm25(kb_fts, 6.0, 3.0, 1.0) AS score
       FROM kb_fts JOIN kb_chunks c ON c.id = kb_fts.rowid
      WHERE kb_fts MATCH ? AND c.scan_id = ?
      ORDER BY score LIMIT ?`,
  )
    .bind(q, active, limit)
    .all<Hit>();
  return results;
}

export async function kbStats(env: Env) {
  const s = await getSettings(env);
  const [counts, scans] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS chunks, COUNT(DISTINCT url) AS pages FROM kb_chunks WHERE scan_id = ?").bind(s.kb_active_scan || "-"),
    env.DB.prepare("SELECT id, started_at, finished_at, trigger, status, cursor, pages_ok, pages_failed, chunks, error, json_array_length(urls) AS total FROM kb_scans ORDER BY started_at DESC LIMIT 8"),
  ]);
  return { ...(counts.results[0] as { chunks: number; pages: number }), lastScanAt: s.kb_last_scan_at || null, scans: scans.results };
}
