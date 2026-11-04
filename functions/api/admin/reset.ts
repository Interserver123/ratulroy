// Forgot password, no email service needed.
// POST /api/admin/reset { key, email, password } -> sets a new password for an existing admin.
// Proof of ownership is the SETUP_KEY secret in Cloudflare (Pages > Settings > Variables and secrets).
// Keep that secret set if you want this recovery path. All existing sessions are signed out.
import type { Ctx } from "../../../backend/lib/types";
import { clientIp, fail, json, nowIso, readJson, str } from "../../../backend/lib/http";
import { hashPassword, safeEqual, sha256 } from "../../../backend/lib/crypto";

const MAX_FAILS = 5;
const WINDOW_MIN = 15;

export const onRequestPost = async ({ request, env }: Ctx) => {
  if (!env.SETUP_KEY) return fail(503, "Password reset is off. Add the SETUP_KEY secret in Cloudflare, redeploy, then try again.");

  const ipHash = await sha256(`${clientIp(request)}|${env.IP_SALT ?? "set-IP_SALT"}`);
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const fails = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND success = 0 AND created_at > ?")
    .bind(ipHash, since)
    .first<{ n: number }>();
  if ((fails?.n ?? 0) >= MAX_FAILS) return fail(429, `Too many attempts. Try again in ${WINDOW_MIN} minutes.`);

  const body = await readJson<Record<string, string>>(request, 2048);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const email = str(body?.email, 254)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !key) return fail(400, "Enter your email and the recovery key");
  if (password.length < 12) return fail(422, "Use a password of at least 12 characters");

  const user = await env.DB.prepare("SELECT id FROM admin_users WHERE email = ?").bind(email).first<{ id: string }>();
  // Same message for a wrong key and an unknown email, so the form doesn't reveal which emails exist.
  if (!safeEqual(key, env.SETUP_KEY.trim()) || !user) {
    await env.DB.prepare("INSERT INTO login_attempts (ip_hash, email, created_at, success) VALUES (?, ?, ?, 0)").bind(ipHash, email, nowIso()).run();
    return fail(401, "The email or recovery key is not correct");
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), user.id),
    env.DB.prepare("DELETE FROM admin_sessions WHERE user_id = ?").bind(user.id),
  ]);
  return json({ ok: true });
};
