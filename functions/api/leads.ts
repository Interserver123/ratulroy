// POST /api/leads: public form submissions (audit, contact, strategy-call).
import type { Ctx } from "../../backend/lib/types";
import { fail, json, readJson } from "../../backend/lib/http";
import { parseLead } from "../../backend/lib/leads";
import { ipHashOf, ping, rateLimited, saveLead } from "../../backend/lib/lead-store";

export const onRequestPost = async (ctx: Ctx) => {
  const body = await readJson(ctx.request);
  if (!body) return fail(400, "Invalid request");

  const parsed = parseLead(body);
  if ("errors" in parsed) return fail(422, "Please check the form", { fields: parsed.errors });
  const lead = parsed.lead;

  const ipHash = await ipHashOf(ctx);
  if (await rateLimited(ctx, ipHash)) return fail(429, "Too many submissions. Please try again later.");

  const { score } = await saveLead(ctx, lead, body, ipHash);
  // Optional ping (Discord / Slack / Google Chat). Never blocks or fails the submission.
  if (score < 60) ping(ctx, `New ${lead.form} lead: ${lead.name ?? "(no name)"} <${lead.email}>${lead.website ? ` · ${lead.website}` : ""} · from ${lead.page_path ?? "?"}`);

  return json({ ok: true }, 201);
};
