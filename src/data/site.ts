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
  // Google Business Profile name and map embed (from the profile's "Share > Embed a map").
  gbpName: "Ratul Roy - Local SEO Expert in Bangladesh",
  mapEmbed:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3370.486892333328!2d89.78304037481354!3d22.649124530162283!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39fff79580a7db83%3A0xab3acb4acc3478!2sRatul%20Roy%20-%20Local%20SEO%20Expert%20in%20Bangladesh!5e1!3m2!1sen!2sbd!4v1792621176535!5m2!1sen!2sbd",
  geo: { lat: 22.649125, lng: 89.78304 },
  // locality is only used in the hidden schema address (must match the Google Business Profile).
  locality: "Khulna",
  country: "Bangladesh",
  countryCode: "BD",
  // Official profiles (Facebook Page, LinkedIn, Instagram, YouTube, X, Fiverr...). Each one is
  // added to the structured data as sameAs and shown as a link in the footer.
  // sameAs: false = shown on the site but not claimed as the same entity in structured data.
  social: [
    { label: "Facebook", name: "Ratul Roy on Facebook", href: "https://www.facebook.com/freelancerratulroy", icon: "facebook" },
    { label: "LinkedIn", name: "Ratul Roy on LinkedIn", href: "https://www.linkedin.com/in/freelancerratulroy", icon: "linkedin" },
    { label: "YouTube", name: "Ratul Roy on YouTube", href: "https://www.youtube.com/@iamratulroy", icon: "youtube" },
    { label: "Wantrepreneur", name: "Wantrepreneur on Facebook", href: "https://www.facebook.com/wantrepreneur", icon: "facebook", sameAs: false },
  ] as { label: string; name: string; href: string; icon: "facebook" | "linkedin" | "youtube"; sameAs?: boolean }[],
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
      { label: "Construction SEO", href: "/industries/construction-seo" },
      { label: "Cleaning SEO", href: "/industries/cleaning-seo" },
      { label: "Moving SEO", href: "/industries/moving-seo" },
      { label: "Auto Repair SEO", href: "/industries/auto-repair-seo" },
      { label: "Healthcare SEO", href: "/industries/healthcare-seo" },
      { label: "Legal SEO", href: "/industries/legal-seo" },
      { label: "Real Estate SEO", href: "/industries/real-estate-seo" },
      { label: "All Industries", href: "/industries" },
    ],
  },
];
