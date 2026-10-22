// Every /api/admin/* route needs a valid session, except login.
import type { Ctx } from "../../../backend/lib/types";
import { getUser } from "../../../backend/lib/auth";
import { fail } from "../../../backend/lib/http";

export const onRequest = async (ctx: Ctx) => {
  const path = new URL(ctx.request.url).pathname;
  if (path === "/api/admin/login" || path === "/api/admin/setup") return ctx.next();
  const user = await getUser(ctx.request, ctx.env);
  if (!user) return fail(401, "Sign in required");
  ctx.data.user = user;
  return ctx.next();
};
