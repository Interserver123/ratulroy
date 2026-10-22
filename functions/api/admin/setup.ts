// First-run account creation, no command line needed.
// GET  /api/admin/setup -> { needed, configured }
// POST /api/admin/setup { key, name, email, password } -> creates the owner account and signs in.
// Only works while no admin exists, and only with the SETUP_KEY secret set in Cloudflare.
import type { Ctx } from "../../../backend/lib/types";
import { clientIp, fail, json, nowIso, readJson, str, uuid } from "../../../backend/lib/http";
import { hashPassword, safeEqual, sha256 } from "../../../backend/lib/crypto";
import { createSession, sessionCookie } from "../../../backend/lib/auth";

const noAdmins = async (ctx: Ctx) => !(await ctx.env.DB.prepare("SELECT 1 AS x FROM admin_users LIMIT 1").first());

export const onRequestGet = async (ctx: Ctx) => json({ ok: true, needed: await noAdmins(ctx), configured: Boolean(ctx.env.SETUP_KEY) });

export const onRequestPost = async (ctx: Ctx) => {
  const { request, env } = ctx;
  if (!env.SETUP_KEY) return fail(503, "Add the SETUP_KEY secret in Cloudflare first");
  if (!(await noAdmins(ctx))) return fail(409, "An account already exists. Please sign in.");

  const ipHash = await sha256(`${clientIp(request)}|${env.IP_SALT ?? "set-IP_SALT"}`);
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const fails = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND success = 0 AND created_at > ?")
    .bind(ipHash, since)
    .first<{ n: number }>();
  if ((fails?.n ?? 0) >= 5) return fail(429, "Too many attempts. Try again in 15 minutes.");

  const body = await readJson<Record<string, string>>(request, 2048);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!safeEqual(key, env.SETUP_KEY.trim())) {
    await env.DB.prepare("INSERT INTO login_attempts (ip_hash, email, created_at, success) VALUES (?, 'setup', ?, 0)").bind(ipHash, nowIso()).run();
    return fail(401, "The setup key is not correct");
  }
  const email = str(body?.email, 254)?.toLowerCase();
  const name = str(body?.name, 80) ?? "Owner";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail(422, "Enter a valid email address");
  if (password.length < 12) return fail(422, "Use a password of at least 12 characters");

  const id = uuid();
  await env.DB.prepare("INSERT INTO admin_users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'owner', ?)")
    .bind(id, email, name, await hashPassword(password), nowIso())
    .run();
  const token = await createSession(env, id, ipHash, request.headers.get("User-Agent") ?? "");
  return json({ ok: true, user: { email, name, role: "owner" } }, 201, { "Set-Cookie": sessionCookie(token) });
};
