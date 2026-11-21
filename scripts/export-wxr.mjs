#!/usr/bin/env node
// Exports src/content/blog/*.md as a WordPress import file (WXR).
// Usage: node scripts/export-wxr.mjs   ->  wordpress-blog-export.xml
// Import in WordPress: Tools > Import > WordPress (install the importer), upload the file.
// FAQs are appended as a "Frequently asked questions" section (H3 question + paragraph answer),
// the format src/lib/wp-loader.ts reads back. A "series-N" tag carries the series part number.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createMarkdownProcessor, parseFrontmatter } from "@astrojs/markdown-remark";

const DIR = new URL("../src/content/blog/", import.meta.url);
const OUT = new URL("../wordpress-blog-export.xml", import.meta.url);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const proc = await createMarkdownProcessor();

const items = [];
const cats = new Set();
const tags = new Set();
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
  const slug = f.replace(/\.md$/, "");
  const { frontmatter: d, content } = parseFrontmatter(readFileSync(new URL(f, DIR), "utf8"));
  const { code } = await proc.render(content);
  const faq = (d.faqs ?? []).length
    ? `\n<h2>Frequently asked questions</h2>\n${d.faqs.map((x) => `<h3>${esc(x.q)}</h3>\n<p>${esc(x.a)}</p>`).join("\n")}\n`
    : "";
  const date = new Date(d.date).toISOString().replace("T", " ").slice(0, 19);
  const postTags = [...(d.tags ?? []), ...(d.series ? [`series-${d.series}`] : [])];
  cats.add(d.category ?? "Local SEO");
  postTags.forEach((t) => tags.add(t));
  items.push(`  <item>
    <title>${esc(d.h1 ?? d.title)}</title>
    <link>https://ratulroy.com/blog/${slug}</link>
    <pubDate>${new Date(d.date).toUTCString()}</pubDate>
    <dc:creator>${cdata("admin")}</dc:creator>
    <guid isPermaLink="false">https://ratulroy.com/blog/${slug}</guid>
    <description></description>
    <content:encoded>${cdata(code + faq)}</content:encoded>
    <excerpt:encoded>${cdata(d.excerpt ?? d.description)}</excerpt:encoded>
    <wp:post_date>${cdata(date)}</wp:post_date>
    <wp:post_date_gmt>${cdata(date)}</wp:post_date_gmt>
    <wp:post_name>${cdata(slug)}</wp:post_name>
    <wp:status>${cdata("publish")}</wp:status>
    <wp:post_type>${cdata("post")}</wp:post_type>
    <category domain="category" nicename="${slugify(d.category ?? "Local SEO")}">${cdata(d.category ?? "Local SEO")}</category>
${postTags.map((t) => `    <category domain="post_tag" nicename="${slugify(t)}">${cdata(t)}</category>`).join("\n")}
    <wp:postmeta><wp:meta_key>${cdata("_yoast_wpseo_title")}</wp:meta_key><wp:meta_value>${cdata(d.title)}</wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key>${cdata("_yoast_wpseo_metadesc")}</wp:meta_key><wp:meta_value>${cdata(d.description)}</wp:meta_value></wp:postmeta>
  </item>`);
}
const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Ratul Roy</title>
  <link>https://ratulroy.com</link>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
${[...cats].map((c) => `  <wp:category><wp:category_nicename>${cdata(slugify(c))}</wp:category_nicename><wp:cat_name>${cdata(c)}</wp:cat_name></wp:category>`).join("\n")}
${[...tags].map((t) => `  <wp:tag><wp:tag_slug>${cdata(slugify(t))}</wp:tag_slug><wp:tag_name>${cdata(t)}</wp:tag_name></wp:tag>`).join("\n")}
${items.join("\n")}
</channel>
</rss>
`;
writeFileSync(OUT, xml);
console.log(`Wrote ${items.length} posts to wordpress-blog-export.xml (${(xml.length / 1024).toFixed(0)} KB)`);
