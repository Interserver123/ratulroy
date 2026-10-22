// Maps page data to meta tags and one JSON-LD @graph. Pure functions: no I/O, easy to test.
export type Seo = {
  title: string; // 30–60 characters
  description: string; // 120–160 characters
  canonical: string; // absolute URL, no query string
  image?: { url: string; width: number; height: number; alt: string };
  type?: "website" | "article";
  noindex?: boolean;
  publishedAt?: string;
  updatedAt?: string;
  jsonLd?: Record<string, unknown>[];
};

const clamp = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…");

/** Canonical = site origin + path, never the request's query string or host header. */
export function canonicalFor(site: URL | undefined, pathname: string): string {
  const origin = site?.origin ?? "https://example.com";
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "").replace(/\.html$/, "");
  return origin + path;
}

export function normalizeSeo(seo: Seo): Seo {
  return { ...seo, title: clamp(seo.title.trim(), 60), description: clamp(seo.description.trim().replace(/\s+/g, " "), 160) };
}

/** Serialises JSON-LD safely for inline <script> (no "</script>" breakout). */
export function jsonLdString(nodes: Record<string, unknown>[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
}

export function breadcrumb(id: string, items: { name: string; url: string }[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${id}#breadcrumb`,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

export function faqPage(id: string, faqs: { q: string; a: string }[]) {
  return faqs.length
    ? {
        "@type": "FAQPage",
        "@id": `${id}#faq`,
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }
    : null;
}
