import { site } from "../data/site";

// Stable entity IDs shared by every page's JSON-LD graph.
export const ids = {
  website: `${site.url}/#website`,
  person: `${site.url}/#ratul`,
  business: `${site.url}/#business`,
};

/** Profiles that are the same entity: Google Business Profile + official social profiles. */
export const sameAs = () => [
  site.mapsUrl,
  site.whatsapp,
  ...site.social.filter((x) => x.sameAs !== false).map((x) => x.href),
];

export const digipolli = { "@type": "Organization", "@id": `${site.url}/#digipolli`, name: "DigiPolli" };
export const visibly = { "@type": "Organization", "@id": `${site.url}/#visibly`, name: "Visibly" };

export const languages = ["English", "Bengali"];

/** How customers reach the business. */
export const contactPoint = () => [
  {
    "@type": "ContactPoint",
    contactType: "customer service",
    telephone: site.phone,
    email: site.email,
    url: site.whatsapp,
    availableLanguage: languages,
    areaServed: ["BD", "Worldwide"],
  },
];

/**
 * Compact definitions of the site-wide entities. BaseLayout adds any of these that a
 * page references (via @id) but does not define, so each page's graph is self-contained.
 * The homepage defines fuller versions itself, which then take precedence.
 */
export function coreEntities(imageUrl?: string): Record<string, unknown>[] {
  return [
    {
      "@type": "WebSite",
      "@id": ids.website,
      url: `${site.url}/`,
      name: site.name,
      inLanguage: "en",
      publisher: { "@id": ids.business },
    },
    {
      "@type": "Person",
      "@id": ids.person,
      name: "Ratul Roy",
      url: `${site.url}/about`,
      jobTitle: "Local SEO Specialist",
      ...(imageUrl ? { image: imageUrl } : {}),
      worksFor: [{ "@id": ids.business }, { "@id": digipolli["@id"] }, { "@id": visibly["@id"] }],
      knowsLanguage: languages,
      nationality: { "@type": "Country", name: site.country },
      sameAs: sameAs(),
    },
    {
      "@type": "ProfessionalService",
      "@id": ids.business,
      name: "Ratul Roy Local SEO",
      alternateName: site.gbpName,
      url: `${site.url}/`,
      email: site.email,
      telephone: site.phone,
      priceRange: "$$",
      founder: { "@id": ids.person },
      address: { "@type": "PostalAddress", addressLocality: site.locality, addressCountry: site.countryCode },
      geo: { "@type": "GeoCoordinates", latitude: site.geo.lat, longitude: site.geo.lng },
      hasMap: site.mapsUrl,
      areaServed: ["Bangladesh", "United States", "Global"],
      knowsLanguage: languages,
      contactPoint: contactPoint(),
      sameAs: sameAs(),
      ...(imageUrl ? { image: imageUrl, logo: imageUrl } : {}),
    },
    digipolli,
    visibly,
  ];
}

/**
 * Builds the connected @graph. Person, ProfessionalService and WebSite are ALWAYS present
 * (page-defined versions are merged over the compact core ones, so a page can add detail
 * but never drop the shared fields). DigiPolli/Visibly are added when referenced.
 */
export function completeGraph(nodes: Record<string, unknown>[], imageUrl?: string) {
  const core = coreEntities(imageUrl);
  const always = new Set<unknown>([ids.website, ids.person, ids.business]);
  const byId = new Map(core.map((e) => [e["@id"], e]));
  const out: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  for (const n of nodes) {
    const id = n["@id"];
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(id && byId.has(id) ? { ...byId.get(id), ...n } : n);
  }
  for (const e of core) {
    if (!seen.has(e["@id"]) && always.has(e["@id"])) {
      out.push(e);
      seen.add(e["@id"]);
    }
  }
  // Pull in any other core entity (DigiPolli, Visibly) that the graph references.
  const json = JSON.stringify(out);
  for (const e of core) if (!seen.has(e["@id"]) && json.includes(`"${e["@id"]}"`)) out.push(e);
  return out;
}
