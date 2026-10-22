// POST /api/booking : request a strategy call. Re-checks the slot on the server, blocks
// double booking, and saves a lead (form "strategy-call") linked to the booking.
import type { Ctx } from "../../../backend/lib/types";
import { fail, json, nowIso, readJson, str, uuid } from "../../../backend/lib/http";
import { parseLead } from "../../../backend/lib/leads";
import { AVAILABILITY, dhakaLabel, freeSlots, getPackage, PLATFORMS } from "../../../backend/lib/booking";
import { ipHashOf, ping, rateLimited, saveLead } from "../../../backend/lib/lead-store";
import { busy } from "./slots";

export const onRequestPost = async (ctx: Ctx) => {
  const { request, env } = ctx;
  const body = await readJson(request, 12_000);
  if (!body) return fail(400, "Invalid request");

  const pkg = getPackage(body.package);
  if (!pkg) return fail(422, "Choose a call type", { fields: { package: "Choose a call type" } });
  const start = typeof body.start === "string" ? body.start : "";
  if (Number.isNaN(Date.parse(start))) return fail(422, "Choose a date and time", { fields: { start: "Choose a date and time" } });
  const startIso = new Date(start).toISOString();
  const platform = PLATFORMS.find((p) => p.id === body.platform) ?? PLATFORMS[0];
  const timezone = str(body.timezone, 60);
  const focus = Array.isArray(body.focus) ? body.focus.map((f) => str(f, 40)).filter(Boolean).slice(0, 8) : [];

  const label = dhakaLabel(startIso);
  const parsed = parseLead({
    ...body,
    type: "strategy-call",
    preferred_time: startIso.slice(0, 16).replace("T", " ") + " UTC",
    goal: pkg.name,
    message: [
      `Booking: ${pkg.name} (${pkg.price}, ${pkg.minutes} min)`,
      `When: ${label}${timezone ? ` · visitor time zone ${timezone}` : ""}`,
      `Call on: ${platform.label}`,
      focus.length ? `Wants help with: ${focus.join(", ")}` : null,
      str(body.message, 3000) ? `\n${str(body.message, 3000)}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if ("errors" in parsed) return fail(422, "Please check the form", { fields: parsed.errors });

  const ipHash = await ipHashOf(ctx);
  if (await rateLimited(ctx, ipHash)) return fail(429, "Too many requests. Please try again later.");

  // The slot must still be free (someone may have taken it since the page loaded).
  if (!freeSlots(pkg, await busy(env)).includes(startIso)) return fail(409, "That time was just taken. Please pick another slot.", { fields: { start: "taken" } });

  const leadId = uuid();
  const endIso = new Date(Date.parse(startIso) + pkg.minutes * 60_000).toISOString();
  const { score } = await saveLead(ctx, parsed.lead, body, ipHash, { booking: { package: pkg.id, start: startIso } }, leadId);
  // Insert only if nothing overlaps (with the buffer), in one statement, so two people
  // submitting the same slot at the same moment cannot both get it.
  const buf = AVAILABILITY.bufferMinutes * 60_000;
  const ins = await env.DB.prepare(
    `INSERT INTO bookings (id, lead_id, package, start_at, end_at, timezone, platform, status, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'requested', ?8
      WHERE NOT EXISTS (
        SELECT 1 FROM bookings b JOIN leads l ON l.id = b.lead_id
         WHERE b.status != 'cancelled' AND l.status NOT IN ('lost', 'spam') AND b.lead_id != ?2
           AND b.start_at < ?9 AND b.end_at > ?10)`,
  )
    .bind(uuid(), leadId, pkg.id, startIso, endIso, timezone, platform.id, nowIso(), new Date(Date.parse(endIso) + buf).toISOString(), new Date(Date.parse(startIso) - buf).toISOString())
    .run();
  if (!ins.meta.changes) {
    await env.DB.prepare("DELETE FROM leads WHERE id = ?").bind(leadId).run();
    return fail(409, "That time was just taken. Please pick another slot.", { fields: { start: "taken" } });
  }

  if (score < 60) ping(ctx, `New call booking: ${pkg.name} · ${label} · ${parsed.lead.name ?? "(no name)"} <${parsed.lead.email}> · ${platform.label}. Open /admin to confirm.`);
  return json({ ok: true, booking: { package: pkg.id, name: pkg.name, start: startIso, end: endIso, label, platform: platform.label } }, 201);
};
