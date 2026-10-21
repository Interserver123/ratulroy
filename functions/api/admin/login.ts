// POST /api/admin/login  { email, password }
import type { Ctx } from "../../../backend/lib/types";
import { clientIp, fail, json, nowIso, readJson, str } from "../../../backend/lib/http";
import { sha256, verifyPassword } from "../../../backend/lib/crypto";
import { createSession, sessionCookie } from "../../../backend/lib/auth";

const MAX_FAILS = 5;
const WINDOW_MIN = 15;
// Verified against when the email is unknown, so timing doesn't reveal which emails exist.
const DUMMY = "pbkdf2-sha256$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export const onRequestPost = async ({ request, env }: Ctx) => {
  const body = await readJson<{ email?: string; password?: string }>(request, 2048);
  const email = str(body?.email, 254)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !password) return fail(400, "Email and password are required");

  const ipHash = await sha256(`${clientIp(request)}|${env.IP_SALT ?? "set-IP_SALT"}`);
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const fails = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND success = 0 AND created_at > ?")
    .bind(ipHash, since)
    .first<{ n: number }>();
  if ((fails?.n ?? 0) >= MAX_FAILS) return fail(429, `Too many attempts. Try again in ${WINDOW_MIN} minutes.`);

  const user = await env.DB.prepare("SELECT id, email, name, role, password_hash FROM admin_users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; name: string; role: string; password_hash: string }>();
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY);

  await env.DB.prepare("INSERT INTO login_attempts (ip_hash, email, created_at, success) VALUES (?, ?, ?, ?)")
    .bind(ipHash, email, nowIso(), ok && user ? 1 : 0)
    .run();
  if (!ok || !user) return fail(401, "Wrong email or password");

  const token = await createSession(env, user.id, ipHash, request.headers.get("User-Agent") ?? "");
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?").bind(nowIso(), user.id),
    // housekeeping
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(nowIso()),
    env.DB.prepare("DELETE FROM login_attempts WHERE created_at < ?").bind(new Date(Date.now() - 30 * 86400_000).toISOString()),
  ]);
  return json({ ok: true, user: { email: user.email, name: user.name, role: user.role } }, 200, { "Set-Cookie": sessionCookie(token) });
};
