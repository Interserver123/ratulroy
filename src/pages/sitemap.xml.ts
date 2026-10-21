import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// One sitemap for the whole site. lastmod is only given where a real date exists
// (blog publish date, or a page's `updated` field) so Google can trust it.
const SITE = "https://ratulroy.com";

// Pages collection ids that are routed somewhere other than /<id>.
const hubIds = new Set(["industries", "case-studies", "blog", "contact", "book-strategy-call"]);

type Entry = { path: string; lastmod?: Date; group: string };

export const GET: APIRoute = async () => {
  const [pages, industries, cases, blog] = await Promise.all([
    getCollection("pages"),
    getCollection("industries"),
    getCollection("cases"),
    getCollection("blog"),
  ]);
  const newestPost = blog.reduce<Date | undefined>((m, p) => (!m || p.data.date > m ? p.data.date : m), undefined);

  const entries: Entry[] = [
    { path: "/", group: "Main" },
    { path: "/about", group: "Main" },
    ...pages
      .filter((p) => hubIds.has(p.id))
      .map((p) => ({ path: `/${p.id}`, lastmod: p.id === "blog" ? newestPost : p.data.updated, group: "Main" })),
    ...pages
      .filter((p) => !hubIds.has(p.id))
      .sort((a, b) => a.data.order - b.data.order)
      .map((p) => ({
        path: p.id.startsWith("careers-") ? `/careers/${p.id.slice("careers-".length)}` : `/${p.id}`,
        lastmod: p.data.updated,
        group: p.id.startsWith("careers-") || ["privacy-policy", "terms"].includes(p.id) ? "Company" : "Services",
      })),
    ...industries.sort((a, b) => a.data.order - b.data.order).map((e) => ({ path: `/industries/${e.id}`, lastmod: e.data.updated, group: "Industries" })),
    ...cases.sort((a, b) => a.data.order - b.data.order).map((e) => ({ path: `/case-studies/${e.id}`, lastmod: e.data.updated, group: "Case studies" })),
    ...blog.sort((a, b) => +b.data.date - +a.data.date).map((e) => ({ path: `/blog/${e.id}`, lastmod: e.data.date, group: "Blog" })),
  ];

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${esc(SITE + (e.path === "/" ? "/" : e.path))}</loc>\n` +
        (e.lastmod ? `    <lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>\n` : "") +
        `  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
