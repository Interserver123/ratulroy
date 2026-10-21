import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { site } from "../data/site";

// llms.txt (https://llmstxt.org): a Markdown map of the site for AI agents and LLMs.
// Built from the same content collections as the pages, so it never drifts.
const hubIds = new Set(["industries", "case-studies", "blog", "contact", "book-strategy-call", "privacy-policy", "terms"]);
const serviceOrder = [
  "local-seo-service",
  "google-business-profile-optimization",
  "technical-seo",
  "generative-engine-optimization",
  "local-seo-dhaka",
  "seo-for-home-services",
  "seo-for-wholesale-distributors",
  "services",
];

export const GET: APIRoute = async () => {
  const [pages, industries, cases, blog] = await Promise.all([
    getCollection("pages"),
    getCollection("industries"),
    getCollection("cases"),
    getCollection("blog"),
  ]);
  const u = (p: string) => `${site.url}${p}`;
  const line = (title: string, path: string, desc: string) => `- [${title}](${u(path)}): ${desc.replace(/\s+/g, " ").trim()}`;

  const services = serviceOrder
    .map((id) => pages.find((p) => p.id === id))
    .filter((p) => p && !hubIds.has(p.id))
    .map((p) => line(p!.data.card?.title ?? p!.data.h1, `/${p!.id}`, p!.data.description));
  const inds = industries
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => line(e.data.h1, `/industries/${e.id}`, e.data.description));
  const cs = cases.sort((a, b) => a.data.order - b.data.order).map((e) => line(e.data.h1, `/case-studies/${e.id}`, e.data.description));
  const series = blog.filter((b) => b.data.series).sort((a, b) => a.data.series! - b.data.series!);
  const others = blog.filter((b) => !b.data.series).sort((a, b) => +b.data.date - +a.data.date);
  const post = (b: (typeof blog)[number]) => line(b.data.h1, `/blog/${b.id}`, b.data.description);

  const md = `# Ratul Roy: Local SEO Specialist in Bangladesh

> Ratul Roy is an independent Local SEO specialist based in ${site.locality}, ${site.country}, working directly with local businesses in Bangladesh and worldwide on Google Maps rankings, Google Business Profile optimization, technical SEO and AI search visibility. Fiverr Level 2 seller, 4.9 stars from 243 reviews. Packages from $299, no lock-in contracts, white-hat only.

- Website: ${site.url}
- Email: ${site.email}
- Phone / WhatsApp: ${site.phone}
- Google Maps: ${site.mapsUrl}

## Services

${services.join("\n")}

## Industries

${inds.join("\n")}

## Case studies

${cs.join("\n")}

## Local SEO in Bangladesh (8-part series)

${series.map(post).join("\n")}

## Guides

${others.map(post).join("\n")}

## About and contact

- [About Ratul Roy](${u("/about")}): Background, experience and how Ratul works with clients.
- [Book a strategy call](${u("/book-strategy-call")}): Free 30-minute call to review Google Maps visibility.
- [Contact](${u("/contact")}): Email, WhatsApp, phone and location.
- [Case studies](${u("/case-studies")}): All case studies with screenshots.
- [Sitemap](${u("/sitemap.xml")}): Every public URL on the site.
`;
  return new Response(md, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
