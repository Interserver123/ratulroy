// Site-wide facts used by the header, footer and structured data.
export const site = {
  name: "Ratul Roy",
  url: "https://ratulroy.com",
  tagline: "Local SEO · BD",
  phone: "+8801866820758",
  phoneHref: "tel:+8801866820758",
  email: "hello@ratulroy.com",
  whatsapp: "https://wa.me/8801866820758",
  mapsUrl: "https://maps.app.goo.gl/4LvFkXXQmujKjxhc6",
  locality: "Khulna",
  country: "Bangladesh",
  countryCode: "BD",
};

export type Link = { label: string; href: string };

export const megaMenu: { title: string; links: Link[] }[] = [
  {
    title: "Services",
    links: [
      { label: "Local SEO Services", href: "/local-seo-service" },
      { label: "Google Maps Ranking", href: "/google-business-profile-optimization" },
      { label: "GBP Optimization", href: "/google-business-profile-optimization" },
      { label: "Technical SEO", href: "/technical-seo" },
      { label: "Website SEO", href: "/services" },
      { label: "GEO / AI Search", href: "/generative-engine-optimization" },
    ],
  },
  {
    title: "Industries",
    links: [
      { label: "SEO for Home Services", href: "/seo-for-home-services" },
      { label: "SEO for Electricians", href: "/industries/electrician-seo" },
      { label: "SEO for Plumbers", href: "/industries/plumbing-seo" },
      { label: "SEO for HVAC", href: "/industries/hvac-seo" },
      { label: "SEO for Roofers", href: "/industries/roofing-seo" },
      { label: "SEO for Wholesale Distributors", href: "/seo-for-wholesale-distributors" },
      { label: "All Industries", href: "/industries" },
    ],
  },
  {
    title: "Proof & Resources",
    links: [
      { label: "Case Studies", href: "/case-studies" },
      { label: "Free SEO Audit", href: "/#free-audit" },
      { label: "Portfolio & Results", href: "/#results" },
      { label: "SEO Blog", href: "/blog" },
      { label: "About Ratul", href: "/about" },
    ],
  },
];

export const navLinks: Link[] = [
  { label: "Industries", href: "/industries" },
  { label: "Case Studies", href: "/case-studies" },
  { label: "Resources", href: "/blog" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const footerColumns: { title: string; links: Link[] }[] = [
  {
    title: "Core Services",
    links: [
      { label: "Local SEO Services", href: "/services" },
      { label: "Local SEO (Full Service)", href: "/local-seo-service" },
      { label: "GBP Optimization", href: "/google-business-profile-optimization" },
      { label: "Google Maps Ranking", href: "/google-business-profile-optimization" },
      { label: "SEO for Home Services", href: "/seo-for-home-services" },
      { label: "SEO for Wholesale Distributors", href: "/seo-for-wholesale-distributors" },
      { label: "Local SEO in Dhaka", href: "/local-seo-dhaka" },
      { label: "Technical SEO", href: "/technical-seo" },
      { label: "GEO / AI Search Optimization", href: "/generative-engine-optimization" },
      { label: "Free SEO Visibility Audit", href: "/#free-audit" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Home", href: "/" },
      { label: "About Ratul", href: "/about" },
      { label: "Case Studies", href: "/case-studies" },
      { label: "Services", href: "/services" },
      { label: "Industries", href: "/industries" },
      { label: "Book Strategy Call", href: "/book-strategy-call" },
      { label: "Contact", href: "/contact" },
      { label: "Careers", href: "/careers/local-seo-specialist" },
    ],
  },
  {
    title: "Industries",
    links: [
      { label: "HVAC SEO", href: "/industries/hvac-seo" },
      { label: "Plumbing SEO", href: "/industries/plumbing-seo" },
      { label: "Roofing SEO", href: "/industries/roofing-seo" },
      { label: "Towing SEO", href: "/industries/towing-seo" },
      { label: "Pest Control SEO", href: "/industries/pest-control-seo" },
      { label: "Electrician SEO", href: "/industries/electrician-seo" },
      { label: "Dental SEO", href: "/industries/dental-seo" },
      { label: "Contractor SEO", href: "/industries/contractor-seo" },
      { label: "All Industries", href: "/industries" },
    ],
  },
];
