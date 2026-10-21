// POST /api/admin/logout
import type { Ctx } from "../../../backend/lib/types";
import { json } from "../../../backend/lib/http";
import { clearCookie, destroySession } from "../../../backend/lib/auth";

export const onRequestPost = async ({ request, env }: Ctx) => {
  await destroySession(request, env);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
};
