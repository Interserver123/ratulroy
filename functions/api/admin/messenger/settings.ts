// GET/PUT /api/admin/messenger/settings — configuration + status. Secrets are write-only.
import type { Ctx } from "../../../../backend/lib/types";
import { fail, json, readJson, str } from "../../../../backend/lib/http";
import { canEncrypt, EDITABLE, getSettings, saveSecret, secretStatus, setSettings, verifyToken, SECRET_KEYS, type SecretKey, type Settings } from "../../../../backend/lib/messenger/settings";
import { kbStats } from "../../../../backend/lib/messenger/kb";
import { log } from "../../../../backend/lib/messenger/log";

export async function status(env: Ctx["env"], origin: string) {
  const [s, secrets, kb, counts] = await Promise.all([
    getSettings(env),
    secretStatus(env),
    kbStats(env),
    env.DB.prepare(
      `SELECT COUNT(*) AS conversations,
              SUM(CASE WHEN mode = 'human' OR handoff_reason IS NOT NULL THEN 1 ELSE 0 END) AS human,
              SUM(unread) AS unread
         FROM mc_conversations`,
    ).first(),
  ]);
  const errors = await env.DB.prepare("SELECT COUNT(*) AS n FROM app_logs WHERE level = 'error' AND created_at > ?").bind(new Date(Date.now() - 86400_000).toISOString()).first<{ n: number }>();
  const { kb_active_scan: _a, meta_verify_token: _v, ...visible } = s;
  return {
    settings: visible,
    secrets,
    canEncrypt: canEncrypt(env),
    webhookUrl: `${origin}/api/messenger/webhook`,
    verifyToken: await verifyToken(env),
    verifyTokenFromEnv: !!env.META_VERIFY_TOKEN,
    cronConfigured: !!env.CRON_SECRET,
    kb,
    counts: { ...(counts ?? {}), errors24h: errors?.n ?? 0 },
  };
}

export const onRequestGet = async ({ env, request }: Ctx) => json({ ok: true, ...(await status(env, new URL(request.url).origin)) });

export const onRequestPut = async ({ env, request, data }: Ctx) => {
  const body = await readJson<Record<string, unknown>>(request, 32_768);
  if (!body) return fail(400, "Invalid request");

  const values: Partial<Settings> = {};
  for (const k of EDITABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    const max = k === "owner_notes" ? 3000 : 400;
    values[k] = typeof v === "boolean" ? (v ? "1" : "0") : (str(String(v ?? ""), max) ?? "");
  }
  if (values.ai_model !== undefined && !/^[\w.\-]+\/[\w.:\-]+$/.test(values.ai_model)) return fail(422, "Model must look like provider/model-name, e.g. openai/gpt-4o-mini");
  if (values.ai_temperature !== undefined && !(Number(values.ai_temperature) >= 0 && Number(values.ai_temperature) <= 1)) return fail(422, "Temperature must be between 0 and 1");
  for (const k of ["auto_resume_hours", "max_replies_per_hour"] as const)
    if (values[k] !== undefined && !(/^\d{1,4}$/.test(values[k]!))) return fail(422, `${k.replace(/_/g, " ")} must be a whole number`);
  if (values.owner_phone && !/^\+?[\d\s-]{7,20}$/.test(values.owner_phone)) return fail(422, "Phone number should look like +8801XXXXXXXXX");
  if (values.phone_after_messages !== undefined && !/^\d{1,2}$/.test(values.phone_after_messages)) return fail(422, "Messages before sharing the phone must be a number (0 = never)");
  if (values.meta_page_id && !/^\d{5,25}$/.test(values.meta_page_id)) return fail(422, "Page ID must be digits");
  if (values.meta_app_id && !/^\d{5,25}$/.test(values.meta_app_id)) return fail(422, "App ID must be digits");

  const secrets = (body.secrets ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(SECRET_KEYS) as SecretKey[]) {
    if (!(k in secrets)) continue;
    const v = secrets[k] === null ? null : str(secrets[k], 1000);
    if (v && !canEncrypt(env)) return fail(409, "Set APP_ENCRYPTION_KEY in Cloudflare first, so secrets can be stored encrypted.");
    if (v && /\s/.test(v)) return fail(422, "Secrets cannot contain spaces");
    await saveSecret(env, k, v);
  }

  await setSettings(env, values);
  const changed = [...Object.keys(values), ...Object.keys(secrets).map((k) => `${k} (secret)`)];
  if (changed.length) await log(env, "info", "settings", `Settings changed by ${data.user?.email}: ${changed.join(", ")}`);
  return json({ ok: true, ...(await status(env, new URL(request.url).origin)) });
};
