import { str } from "./http";

export const FORMS = ["audit", "contact", "strategy-call"] as const;
export const STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost", "spam"] as const;
export const PRIORITIES = ["low", "normal", "high"] as const;
export type Status = (typeof STATUSES)[number];

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export interface LeadInput {
  form: (typeof FORMS)[number];
  name: string | null;
  email: string;
  phone: string | null;
  business: string | null;
  website: string | null;
  service_area: string | null;
  goal: string | null;
  preferred_time: string | null;
  message: string | null;
  page_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}

/** Validates a public form submission. Returns field errors, or the clean lead. */
export function parseLead(body: Record<string, unknown>): { errors: Record<string, string> } | { lead: LeadInput } {
  const errors: Record<string, string> = {};
  const form = FORMS.includes(body.type as never) ? (body.type as LeadInput["form"]) : null;
  if (!form) errors.type = "Unknown form";
  const email = str(body.email, 254)?.toLowerCase() ?? null;
  if (!email || !EMAIL.test(email)) errors.email = "Enter a valid email address";
  const website = str(body.website, 300);
  if (form === "audit" && !website) errors.website = "Add your website or Google Maps link";
  const message = str(body.message, 5000);
  const phone = str(body.phone, 40);
  if (phone && !/^[+\d][\d\s()\-.]{5,39}$/.test(phone)) errors.phone = "Enter a valid phone or WhatsApp number";
  if (form === "strategy-call" && !phone) errors.phone = "Add a WhatsApp or phone number";
  if (Object.keys(errors).length) return { errors };

  const path = str(body.page, 300);
  return {
    lead: {
      form: form!,
      name: str(body.name, 120),
      email: email!,
      phone,
      business: str(body.business, 200),
      website,
      service_area: str(body.service_area, 200),
      goal: str(body.goal, 120),
      preferred_time: str(body.preferred_time, 40),
      message,
      page_path: path && path.startsWith("/") ? path : null,
      referrer: str(body.referrer, 500),
      utm_source: str(body.utm_source, 120),
      utm_medium: str(body.utm_medium, 120),
      utm_campaign: str(body.utm_campaign, 200),
      utm_term: str(body.utm_term, 200),
      utm_content: str(body.utm_content, 200),
    },
  };
}

/** Rough 0–100 spam score. High scores are stored with status "spam" so nothing is lost. */
export function spamScore(lead: LeadInput, body: Record<string, unknown>): number {
  let score = 0;
  if (str(body.company_website, 300)) score += 100; // honeypot field humans never see
  const elapsed = Number(body.elapsed_ms);
  if (Number.isFinite(elapsed) && elapsed < 2500) score += 40; // filled faster than a human can
  const text = `${lead.message ?? ""} ${lead.name ?? ""}`;
  const links = (text.match(/https?:\/\//g) ?? []).length;
  if (links >= 3) score += 40;
  if (/\b(viagra|casino|crypto ?invest|loan offer|backlinks? package|seo package for \$)/i.test(text)) score += 50;
  if (/[Ѐ-ӿ]{6,}/.test(text)) score += 20; // long Cyrillic runs (common spam pattern here)
  return Math.min(100, score);
}
