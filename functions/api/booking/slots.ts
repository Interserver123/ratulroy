// GET /api/booking/slots?package=strategy : open start times (UTC ISO) for the next 30 days.
import type { Ctx } from "../../../backend/lib/types";
import { fail, json } from "../../../backend/lib/http";
import { AVAILABILITY, freeSlots, getPackage, type Busy } from "../../../backend/lib/booking";

export async function busy(env: Ctx["env"]): Promise<Busy[]> {
  const { results } = await env.DB.prepare(
    `SELECT b.start_at, b.end_at FROM bookings b JOIN leads l ON l.id = b.lead_id
      WHERE b.status != 'cancelled' AND l.status NOT IN ('lost', 'spam') AND b.end_at > ?`,
  )
    .bind(new Date().toISOString())
    .all<Busy>();
  return results;
}

export const onRequestGet = async ({ request, env }: Ctx) => {
  const pkg = getPackage(new URL(request.url).searchParams.get("package"));
  if (!pkg) return fail(400, "Unknown package");
  const slots = freeSlots(pkg, await busy(env));
  return json({ ok: true, package: pkg.id, minutes: pkg.minutes, timezone: AVAILABILITY.timezone, slots }, 200, { "Cache-Control": "no-store" });
};
