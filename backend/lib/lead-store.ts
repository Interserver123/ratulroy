// Saves a validated lead (shared by /api/leads and /api/booking). Rate limit + spam score
// + insert + "created" event + optional notification ping.
import type { Ctx } from "./types";
import { clientIp, nowIso, str, uuid } from "./http";
import { sha256 } from "./crypto";
import { spamScore, type LeadInput } from "./leads";

const WINDOW_MIN = 10;
const MAX_PER_WINDOW = 5;

export async function ipHashOf(ctx: Pick<Ctx, "request" | "env">) {
  return sha256(`${clientIp(ctx.request)}|${ctx.env.IP_SALT ?? "set-IP_SALT"}`);
}

export async function rateLimited(ctx: Pick<Ctx, "request" | "env">, ipHash: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const recent = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ? AND created_at > ?").bind(ipHash, since).first<{ n: number }>();
  return (recent?.n ?? 0) >= MAX_PER_WINDOW;
}

/** Inserts the lead and returns its id and spam score. */
export async function saveLead(ctx: Pick<Ctx, "request" | "env" | "waitUntil">, lead: LeadInput, body: Record<string, unknown>, ipHash: string, extraEvent?: Record<string, unknown>, id = uuid()) {
  const { request, env } = ctx;
  const score = spamScore(lead, body);
  const now = nowIso();
  const cf = request.cf ?? {};
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO leads (id, created_at, updated_at, form, status, name, email, phone, business, website, service_area,
        goal, preferred_time, message, page_path, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        country, city, ip_hash, user_agent, spam_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, now, now, lead.form, score >= 60 ? "spam" : "new", lead.name, lead.email, lead.phone, lead.business, lead.website,
      lead.service_area, lead.goal, lead.preferred_time, lead.message, lead.page_path, lead.referrer, lead.utm_source,
      lead.utm_medium, lead.utm_campaign, lead.utm_term, lead.utm_content, str(cf.country, 8), str(cf.city, 80), ipHash,
      str(request.headers.get("User-Agent"), 250), score,
    ),
    env.DB.prepare("INSERT INTO lead_events (id, lead_id, created_at, actor, type, data) VALUES (?, ?, ?, ?, 'created', ?)").bind(
      uuid(), id, now, "website", JSON.stringify({ form: lead.form, page: lead.page_path, spam_score: score, ...extraEvent }),
    ),
  ]);
  return { id, score };
}

export function ping(ctx: Pick<Ctx, "env" | "waitUntil">, text: string) {
  if (!ctx.env.NOTIFY_WEBHOOK_URL) return;
  ctx.waitUntil(
    fetch(ctx.env.NOTIFY_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, text }) }).catch(() => undefined),
  );
}
