// POST /api/leads: public form submissions (audit, contact, strategy-call).
import type { Ctx } from "../../backend/lib/types";
import { clientIp, fail, json, nowIso, readJson, str, uuid } from "../../backend/lib/http";
import { sha256 } from "../../backend/lib/crypto";
import { parseLead, spamScore } from "../../backend/lib/leads";

const WINDOW_MIN = 10;
const MAX_PER_WINDOW = 5;

export const onRequestPost = async ({ request, env, waitUntil }: Ctx) => {
  const body = await readJson(request);
  if (!body) return fail(400, "Invalid request");

  const parsed = parseLead(body);
  if ("errors" in parsed) return fail(422, "Please check the form", { fields: parsed.errors });
  const lead = parsed.lead;

  const ipHash = await sha256(`${clientIp(request)}|${env.IP_SALT ?? "set-IP_SALT"}`);
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ? AND created_at > ?")
    .bind(ipHash, since)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_PER_WINDOW) return fail(429, "Too many submissions. Please try again later.");

  const score = spamScore(lead, body);
  const id = uuid();
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
      uuid(), id, now, "website", JSON.stringify({ form: lead.form, page: lead.page_path, spam_score: score }),
    ),
  ]);

  // Optional ping (Discord / Slack / Google Chat). Never blocks or fails the submission.
  if (env.NOTIFY_WEBHOOK_URL && score < 60) {
    const text = `New ${lead.form} lead: ${lead.name ?? "(no name)"} <${lead.email}>${lead.website ? ` · ${lead.website}` : ""} · from ${lead.page_path ?? "?"}`;
    waitUntil(
      fetch(env.NOTIFY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, text }),
      }).catch(() => undefined),
    );
  }

  return json({ ok: true }, 201);
};
