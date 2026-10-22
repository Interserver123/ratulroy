// Runs for every /api/* request: CSRF origin check, error safety net, noindex/no-store headers.
import type { Ctx } from "../../backend/lib/types";
import { baseHeaders, fail, sameOrigin } from "../../backend/lib/http";
import { ensureSchema } from "../../backend/lib/schema";

export const onRequest = async (ctx: Ctx) => {
  // Meta's webhook and the scheduled refresh are server-to-server calls with no Origin
  // header; they authenticate with an HMAC signature / bearer secret instead.
  const path = new URL(ctx.request.url).pathname;
  const machine = path === "/api/messenger/webhook" || path === "/api/messenger/cron";
  if (!machine && !sameOrigin(ctx.request)) return fail(403, "Cross-origin request blocked");
  if (!ctx.env.DB) return fail(503, "Backend not configured (missing D1 binding DB)");
  let res: Response;
  try {
    await ensureSchema(ctx.env);
    res = await ctx.next();
  } catch (e) {
    console.error("API error", e);
    return fail(500, "Something went wrong");
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(baseHeaders)) if (!out.headers.has(k)) out.headers.set(k, v);
  out.headers.set("X-Robots-Tag", baseHeaders["X-Robots-Tag"]);
  return out;
};
