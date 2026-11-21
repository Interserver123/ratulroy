import type { Loader } from "astro/loaders";

// Headless WordPress -> Astro "blog" collection (see https://docs.astro.build/en/guides/cms/wordpress/).
// Conventions, so WordPress needs no plugins or custom fields:
//  - slug = post slug (keeps /blog/<slug> URLs identical)
//  - title = H1; excerpt = card text; meta description = Yoast/RankMath description if exposed, else the excerpt
//  - category = first category; tags = tags (a tag named "series-N" sets the series part, and is not shown)
//  - FAQs = the "Frequently asked questions" H2 at the end of the post: each H3 is a question, the
//    paragraph(s) after it are the answer. They are removed from the body and rendered by PageFaq.
const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const decode = (s: string) =>
  s.replace(/&#8217;/g, "’").replace(/&#8216;/g, "‘").replace(/&#8220;/g, "“").replace(/&#8221;/g, "”").replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#8217;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function splitFaqs(html: string) {
  const m = html.match(/<h2[^>]*>\s*(?:<[^>]+>)*\s*Frequently asked questions\s*(?:<[^>]+>)*\s*<\/h2>/i);
  if (!m || m.index === undefined) return { body: html, faqs: [] as { q: string; a: string }[] };
  const faqHtml = html.slice(m.index + m[0].length);
  const faqs = [...faqHtml.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi)].map((x) => ({ q: decode(strip(x[1])), a: decode(strip(x[2])) })).filter((f) => f.q && f.a);
  return { body: html.slice(0, m.index), faqs };
}

function headingsOf(html: string) {
  return [...html.matchAll(/<h([2-4])[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ depth: Number(m[1]), slug: m[2], text: decode(strip(m[3])) }));
}
// WordPress rarely adds ids to headings, so add them (needed for the table of contents).
function addHeadingIds(html: string) {
  const seen = new Set<string>();
  return html.replace(/<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, d, attrs, inner) => {
    if (/\sid="/.test(attrs)) return full;
    let id = decode(strip(inner)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
    while (seen.has(id)) id += "-2";
    seen.add(id);
    return `<h${d}${attrs} id="${id}">${inner}</h${d}>`;
  });
}

export function wpBlogLoader(wpUrl: string): Loader {
  const base = wpUrl.replace(/\/$/, "");
  return {
    name: "wordpress-blog",
    async load({ store, parseData, generateDigest, logger }) {
      const posts: any[] = [];
      for (let page = 1; ; page++) {
        const res = await fetch(`${base}/wp-json/wp/v2/posts?per_page=100&page=${page}&_embed=wp:term&status=publish`);
        // A page beyond the last returns 400; anything else is a real failure.
        if (res.status === 400 && page > 1) break;
        // Never publish an empty blog because the CMS was down: fail the build instead.
        if (!res.ok) throw new Error(`WordPress fetch failed: ${res.status} ${res.url}`);
        const batch = await res.json();
        posts.push(...batch);
        if (batch.length < 100) break;
      }
      if (!posts.length) throw new Error(`WordPress at ${base} returned no posts; refusing to build an empty blog.`);
      store.clear();
      for (const p of posts) {
        const terms: any[][] = p._embedded?.["wp:term"] ?? [];
        const cats = (terms[0] ?? []).map((t) => decode(t.name));
        const tagObjs: any[] = terms[1] ?? [];
        const seriesTag = tagObjs.find((t) => /^series-\d+$/.test(t.slug));
        const tags = tagObjs.filter((t) => t !== seriesTag).map((t) => decode(t.name));
        const { body, faqs } = splitFaqs(p.content.rendered as string);
        const html = addHeadingIds(body);
        const words = strip(html).split(" ").length;
        const excerpt = decode(strip(p.excerpt?.rendered ?? ""));
        const title = decode(p.title.rendered);
        const description = decode(p.yoast_head_json?.description ?? p.rank_math_description ?? excerpt).slice(0, 160);
        const data = await parseData({
          id: p.slug,
          data: {
            title: decode(p.yoast_head_json?.title ?? title),
            description,
            h1: title,
            date: p.date_gmt ? `${p.date_gmt}Z` : p.date,
            readTime: Math.max(1, Math.round(words / 200)),
            category: cats[0] ?? "Local SEO",
            ...(seriesTag ? { series: Number(seriesTag.slug.split("-")[1]) } : {}),
            tags,
            excerpt: excerpt || description,
            faqs,
          },
        });
        store.set({ id: p.slug, data, body: html, rendered: { html, metadata: { headings: headingsOf(html) } }, digest: generateDigest(`${p.modified_gmt}${p.slug}`) });
      }
      logger.info(`Loaded ${posts.length} posts from WordPress (${base})`);
    },
  };
}
