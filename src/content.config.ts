import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// ---------- Shared building blocks ----------
const link = z.object({ label: z.string(), href: z.string(), style: z.enum(["dark", "ghost", "text"]).optional() });
const faq = z.object({ q: z.string(), a: z.string() });

const item = z.object({
  title: z.string(),
  text: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  meta: z.string().optional(), // small highlight, e.g. "3.2x avg. call increase"
  label: z.string().optional(), // small label above the title, e.g. "Usual cause"
  href: z.string().optional(),
  cta: z.string().optional(),
  featured: z.boolean().optional(),
  value: z.string().optional(), // for stats
  image: z.string().optional(), // path inside src/assets/img
});

const tier = z.object({
  name: z.string(),
  price: z.string(),
  unit: z.string().optional(),
  for: z.string().optional(),
  text: z.string().optional(),
  bullets: z.array(z.string()),
  receive: z.string().optional(),
  featured: z.boolean().optional(),
  cta: link.optional(),
});

// A page is a list of sections; each section type has its own designed layout.
const section = z.object({
  type: z.enum(["cards", "steps", "list", "prose", "stats", "problems", "pricing", "quotes", "cta", "images", "links"]),
  id: z.string().optional(),
  eyebrow: z.string().optional(),
  heading: z.string().optional(),
  intro: z.string().optional(),
  body: z.array(z.string()).optional(), // paragraphs (inline markdown allowed)
  items: z.array(item).optional(),
  bullets: z.array(z.string()).optional(),
  blocks: z.array(z.object({ heading: z.string(), body: z.array(z.string()).optional(), bullets: z.array(z.string()).optional() })).optional(),
  tiers: z.array(tier).optional(),
  note: z.string().optional(),
  quotes: z.array(z.object({ quote: z.string(), name: z.string(), meta: z.string().optional() })).optional(),
  buttons: z.array(link).optional(),
  columns: z.number().optional(),
  stat: z.object({ value: z.string(), label: z.string() }).optional(),
  alt: z.boolean().optional(), // tinted background
});

const page = z.object({
  title: z.string(),
  description: z.string(),
  breadcrumb: z.array(link).optional(),
  eyebrow: z.string().optional(),
  h1: z.string(),
  em: z.string().optional(), // part of h1 to emphasize with the route underline
  lead: z.string().optional(),
  sub: z.string().optional(),
  heroBullets: z.array(z.string()).optional(),
  heroChips: z.array(z.string()).optional(),
  heroStats: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  heroImage: z.string().optional(),
  ctas: z.array(link).optional(),
  intro: z.array(z.string()).optional(),
  sections: z.array(section).default([]),
  faqHeading: z.string().optional(),
  faqs: z.array(faq).default([]),
  showResults: z.boolean().default(false),
  showCases: z.boolean().default(false),
  pricing: z.enum(["default", "none"]).default("default"),
  related: z.array(z.string()).default([]),
  finalCta: z.object({ heading: z.string(), text: z.string().optional(), buttons: z.array(link).optional() }).optional(),
  // Listing info (hubs)
  card: z.object({ title: z.string(), text: z.string(), value: z.string().optional(), label: z.string().optional(), category: z.string().optional(), image: z.string().optional() }).optional(),
  order: z.number().default(100),
});

export const collections = {
  pages: defineCollection({ loader: glob({ pattern: "**/*.yaml", base: "./src/content/pages" }), schema: page }),
  industries: defineCollection({ loader: glob({ pattern: "**/*.yaml", base: "./src/content/industries" }), schema: page }),
  cases: defineCollection({ loader: glob({ pattern: "**/*.yaml", base: "./src/content/cases" }), schema: page }),
  blog: defineCollection({
    loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      h1: z.string(),
      date: z.coerce.date(),
      readTime: z.number(),
      category: z.string().default("Local SEO"),
      series: z.number().optional(), // part number in the "Local SEO in Bangladesh" series
      tags: z.array(z.string()).default([]),
      excerpt: z.string(),
      faqs: z.array(faq).default([]),
    }),
  }),
};
