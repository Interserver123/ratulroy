// Messenger settings. Plain values live in app_settings; secrets are AES-GCM encrypted
// there with a key that only exists in Cloudflare's environment. A secret set as a
// Cloudflare environment variable always overrides the stored one. Secrets never leave
// the server: the admin API only ever sees "set / not set" and the last 4 characters.
import type { Env } from "../types";
import { nowIso } from "../http";
import { randomToken } from "../crypto";

export const SECRET_KEYS = {
  meta_app_secret: "META_APP_SECRET",
  meta_page_token: "META_PAGE_ACCESS_TOKEN",
  openrouter_key: "OPENROUTER_API_KEY",
} as const;
export type SecretKey = keyof typeof SECRET_KEYS;

export const DEFAULTS = {
  bot_enabled: "0",
  meta_page_id: "",
  meta_page_name: "",
  meta_app_id: "",
  meta_verify_token: "",
  ai_model: "openai/gpt-4o-mini",
  ai_temperature: "0.2",
  owner_notes: "",
  handoff_message_en: "Got it. Please wait a little for Ratul sir, he'll reply to you here himself.",
  handoff_message_bn: "জি, রাতুল স্যারের জন্য একটু অপেক্ষা করুন। উনি নিজেই এখানে আপনাকে রিপ্লাই দেবেন।",
  fallback_message_en: "This one's best answered by Ratul sir himself. Please wait a little, he'll reply to you here.",
  fallback_message_bn: "এই বিষয়টা রাতুল স্যার নিজেই ভালো বলতে পারবেন। একটু অপেক্ষা করুন, উনি এখানে আপনাকে রিপ্লাই দেবেন।",
  auto_resume_hours: "24",
  pause_on_inbox_reply: "1",
  handoff_pauses_ai: "0",
  owner_phone: "+8801866820758",
  phone_after_messages: "2",
  max_replies_per_hour: "20",
  kb_active_scan: "",
  kb_last_scan_at: "",
};
export type SettingKey = keyof typeof DEFAULTS;
export type Settings = Record<SettingKey, string>;

/** Keys the admin screen may write directly. */
export const EDITABLE: SettingKey[] = [
  "bot_enabled",
  "meta_page_id",
  "meta_app_id",
  "ai_model",
  "ai_temperature",
  "owner_notes",
  "handoff_message_en",
  "handoff_message_bn",
  "fallback_message_en",
  "fallback_message_bn",
  "auto_resume_hours",
  "pause_on_inbox_reply",
  "handoff_pauses_ai",
  "owner_phone",
  "phone_after_messages",
  "max_replies_per_hour",
];

/** Earlier default texts: if one is still stored unchanged, use the current default instead. */
const OLD_DEFAULTS: Partial<Record<SettingKey, string>> = {
  "handoff_message_en": "Thanks! I've passed this to Ratul and he'll reply here personally as soon as he can.",
  "handoff_message_bn": "ধন্যবাদ! আমি বিষয়টি রাতুলকে জানিয়েছি, উনি যত দ্রুত সম্ভব এখানে নিজেই উত্তর দেবেন।",
  "fallback_message_en": "Sorry, I couldn't answer that automatically. I've let Ratul know and he'll reply here personally.",
  "fallback_message_bn": "দুঃখিত, এই প্রশ্নের উত্তর আমি এই মুহূর্তে দিতে পারছি না। রাতুলকে জানানো হয়েছে, উনি এখানে নিজেই উত্তর দেবেন।"
};

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key NOT LIKE 'secret:%'").all<{ key: string; value: string }>();
  const out = { ...DEFAULTS } as Settings;
  for (const r of results) if (r.key in DEFAULTS && OLD_DEFAULTS[r.key as SettingKey] !== r.value) out[r.key as SettingKey] = r.value;
  return out;
}

export async function setSettings(env: Env, values: Partial<Settings>) {
  const now = nowIso();
  const stmts = Object.entries(values).map(([k, v]) =>
    env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(k, String(v ?? ""), now),
  );
  if (stmts.length) await env.DB.batch(stmts);
}

/** The verify token Meta must echo when you register the webhook. Created on first use. */
export async function verifyToken(env: Env): Promise<string> {
  if (env.META_VERIFY_TOKEN) return env.META_VERIFY_TOKEN;
  const s = await getSettings(env);
  if (s.meta_verify_token) return s.meta_verify_token;
  const t = "rr_" + randomToken(18);
  await setSettings(env, { meta_verify_token: t });
  return t;
}

// ---- encryption -------------------------------------------------------------
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function keyMaterial(env: Env): string | null {
  return env.APP_ENCRYPTION_KEY || env.IP_SALT || null;
}

async function aesKey(env: Env): Promise<CryptoKey | null> {
  const m = keyMaterial(env);
  if (!m) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("rr-settings-v1:" + m));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const canEncrypt = (env: Env) => !!keyMaterial(env);

async function encrypt(env: Env, plain: string): Promise<string> {
  const key = await aesKey(env);
  if (!key) throw new Error("No encryption key (set APP_ENCRYPTION_KEY or IP_SALT)");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  return `enc:v1:${b64(iv)}:${b64(ct)}`;
}

async function decrypt(env: Env, stored: string): Promise<string | null> {
  const key = await aesKey(env);
  const m = stored.match(/^enc:v1:([^:]+):(.+)$/);
  if (!key || !m) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(m[1]) }, key, unb64(m[2]));
    return new TextDecoder().decode(pt);
  } catch {
    return null; // key changed: the admin must re-enter the secret
  }
}

export async function saveSecret(env: Env, key: SecretKey, value: string | null) {
  if (!value) {
    await env.DB.prepare("DELETE FROM app_settings WHERE key = ?").bind("secret:" + key).run();
    return;
  }
  await env.DB.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  )
    .bind("secret:" + key, await encrypt(env, value), nowIso())
    .run();
}

export async function getSecret(env: Env, key: SecretKey): Promise<string | null> {
  const fromEnv = env[SECRET_KEYS[key]];
  if (fromEnv) return fromEnv;
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind("secret:" + key).first<{ value: string }>();
  return row ? decrypt(env, row.value) : null;
}

export type SecretStatus = { set: boolean; source: "env" | "stored" | "none" | "unreadable"; hint: string | null };

export async function secretStatus(env: Env): Promise<Record<SecretKey, SecretStatus>> {
  const out = {} as Record<SecretKey, SecretStatus>;
  for (const k of Object.keys(SECRET_KEYS) as SecretKey[]) {
    const fromEnv = env[SECRET_KEYS[k]];
    if (fromEnv) {
      out[k] = { set: true, source: "env", hint: "…" + fromEnv.slice(-4) };
      continue;
    }
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind("secret:" + k).first<{ value: string }>();
    if (!row) out[k] = { set: false, source: "none", hint: null };
    else {
      const v = await decrypt(env, row.value);
      out[k] = v ? { set: true, source: "stored", hint: "…" + v.slice(-4) } : { set: false, source: "unreadable", hint: null };
    }
  }
  return out;
}

