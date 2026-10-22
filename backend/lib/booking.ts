// Strategy-call packages and availability. Shared by the booking page (src/) and the API.
// Change prices, hours or days here; everything else follows.

export type PackageId = "intro" | "strategy" | "coaching" | "done-for-you";

export interface CallPackage {
  id: PackageId;
  name: string;
  price: string; // shown as-is
  priceNote: string;
  minutes: number; // length of the call that gets booked
  tagline: string;
  includes: string[];
  featured?: boolean;
  badge?: string;
  image: "phone" | "laptop" | "confident";
  amount?: number; // USD, for structured data
  recurring?: boolean;
}

export const PACKAGES: CallPackage[] = [
  {
    id: "intro",
    name: "Free Intro Call",
    price: "$0",
    priceNote: "30 minutes",
    minutes: 30,
    tagline: "A quick, honest look at where your local visibility stands.",
    includes: ["Quick look at your Google Business Profile", "Your top 2–3 Map Pack competitors", "Whether Local SEO fits your business right now", "Clear next step, no hard pitch"],
    image: "phone",
    amount: 0,
  },
  {
    id: "strategy",
    name: "Strategy Session",
    price: "$79",
    priceNote: "60 minutes · one-time",
    minutes: 60,
    tagline: "A deep-dive call that ends with a written 30-day plan.",
    includes: [
      "Pre-call audit of your GBP, Maps rankings and website",
      "Competitor gap analysis for your area",
      "60-minute call, recorded for you",
      "Written 30-day action plan within 48 hours",
    ],
    featured: true,
    badge: "Most popular",
    image: "laptop",
    amount: 79,
  },
  {
    id: "coaching",
    name: "Monthly Coaching",
    price: "$199",
    priceNote: "per month · cancel anytime",
    minutes: 45,
    tagline: "For owners and teams doing Local SEO in-house, with me in your corner.",
    includes: ["2 × 45-minute calls every month", "WhatsApp support on working days", "Monthly ranking and visibility review", "Priority answers on GBP issues and suspensions"],
    badge: "Best for in-house teams",
    image: "confident",
    amount: 199,
    recurring: true,
  },
  {
    id: "done-for-you",
    name: "Done-for-you Local SEO",
    price: "From $299",
    priceNote: "scoped on a 30-minute call",
    minutes: 30,
    tagline: "You run the business; I run the Local SEO.",
    includes: ["Google Business Profile optimization", "Citations, reviews and Map Pack work", "Service and area pages, technical fixes", "Monthly report on calls and rankings"],
    image: "laptop",
    amount: 299,
  },
];

export const AVAILABILITY = {
  timezone: "Asia/Dhaka",
  utcOffsetMinutes: 360, // Bangladesh has no daylight saving time
  days: [6, 0, 1, 2, 3, 4], // Saturday–Thursday (0 = Sunday)
  startMinutes: 10 * 60, // 10:00 AM
  endMinutes: 20 * 60, // calls must end by 8:00 PM
  stepMinutes: 30,
  bufferMinutes: 15,
  horizonDays: 30,
  minNoticeHours: 12,
};

export const PLATFORMS = [
  { id: "google-meet", label: "Google Meet" },
  { id: "whatsapp", label: "WhatsApp video" },
  { id: "zoom", label: "Zoom" },
] as const;

export const getPackage = (id: unknown) => PACKAGES.find((p) => p.id === id);

/** Every candidate start time (UTC ISO) in the booking window, before removing booked ones. */
export function candidateSlots(pkg: CallPackage, now = Date.now()): string[] {
  const a = AVAILABILITY;
  const out: string[] = [];
  const offset = a.utcOffsetMinutes * 60_000;
  const earliest = now + a.minNoticeHours * 3600_000;
  // Today's date in Dhaka.
  const local = new Date(now + offset);
  const y = local.getUTCFullYear(),
    m = local.getUTCMonth(),
    d = local.getUTCDate();
  for (let i = 0; i <= a.horizonDays; i++) {
    const dayStartUtc = Date.UTC(y, m, d + i) - offset; // 00:00 Dhaka
    const weekday = new Date(dayStartUtc + offset).getUTCDay();
    if (!a.days.includes(weekday)) continue;
    for (let t = a.startMinutes; t + pkg.minutes <= a.endMinutes; t += a.stepMinutes) {
      const start = dayStartUtc + t * 60_000;
      if (start >= earliest) out.push(new Date(start).toISOString());
    }
  }
  return out;
}

export type Busy = { start_at: string; end_at: string };

/** Removes slots that overlap a booked call (plus the buffer on both sides). */
export function freeSlots(pkg: CallPackage, busy: Busy[], now = Date.now()): string[] {
  const buf = AVAILABILITY.bufferMinutes * 60_000;
  const ranges = busy.map((b) => [Date.parse(b.start_at) - buf, Date.parse(b.end_at) + buf]);
  return candidateSlots(pkg, now).filter((s) => {
    const st = Date.parse(s),
      en = st + pkg.minutes * 60_000;
    return !ranges.some(([bs, be]) => st < be && bs < en);
  });
}

/** Human label in Bangladesh time, e.g. "Sun 26 Oct 2026, 3:00 PM (Bangladesh time)". */
export function dhakaLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + AVAILABILITY.utcOffsetMinutes * 60_000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const h = d.getUTCHours(),
    min = d.getUTCMinutes();
  const hh = ((h + 11) % 12) + 1;
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} (Bangladesh time)`;
}
