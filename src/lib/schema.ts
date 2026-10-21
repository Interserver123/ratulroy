import { site } from "../data/site";

// Stable entity IDs shared by every page's JSON-LD graph.
export const ids = {
  website: `${site.url}/#website`,
  person: `${site.url}/#person`,
  business: `${site.url}/#business`,
};

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
      worksFor: { "@id": ids.business },
    },
    {
      "@type": "ProfessionalService",
      "@id": ids.business,
      name: "Ratul Roy · Local SEO Bangladesh",
      alternateName: site.gbpName,
      url: `${site.url}/`,
      email: site.email,
      telephone: site.phone,
      priceRange: "From $299",
      founder: { "@id": ids.person },
      address: { "@type": "PostalAddress", addressLocality: site.locality, addressCountry: site.countryCode },
      geo: { "@type": "GeoCoordinates", latitude: site.geo.lat, longitude: site.geo.lng },
      hasMap: site.mapsUrl,
      ...(imageUrl ? { image: imageUrl } : {}),
    },
  ];
}

/** Adds core entities that are referenced but missing; drops later duplicates of an @id. */
export function completeGraph(nodes: Record<string, unknown>[], imageUrl?: string) {
  const core = coreEntities(imageUrl);
  const out = [...nodes];
  // Repeat: an added entity can itself reference another one (e.g. WebSite -> business).
  for (let added = true; added; ) {
    added = false;
    const defined = new Set(out.map((n) => n["@id"]).filter(Boolean));
    const json = JSON.stringify(out);
    for (const e of core) {
      if (!defined.has(e["@id"]) && json.includes(`"${e["@id"]}"`)) {
        out.push(e);
        added = true;
      }
    }
  }
  const seen = new Set<unknown>();
  return out.filter((n) => {
    const id = n["@id"];
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
