// The Messenger assistant: turns webhook events into stored conversations and grounded
// AI replies. Every outbound message is a real Send API call; failures are logged and
// shown in admin, never reported as sent.
import type { Env } from "../types";
import { nowIso, uuid } from "../http";
import { getSecret, getSettings, type Settings } from "./settings";
import { search, type Hit } from "./kb";
import { chat, parseJson, AiError, type ChatMessage } from "./openrouter";
import { GraphError, OUR_METADATA_PREFIX, sendText, senderAction, splitMessage, userName } from "./graph";
import { log } from "./log";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const HUMAN_PAYLOAD = "RR_HUMAN";
export const DEBOUNCE_MS = 2500;
const WINDOW_MS = 24 * 3600_000;
const HUMAN_TAG_MS = 7 * 24 * 3600_000;

// ---- language & intent -------------------------------------------------------
export const hasBengali = (s: string) => /[ঀ-৿]/.test(s);
const HANDOFF_RE =
  /\b(human|real person|live (agent|person|chat)|human agent|real agent|talk to (ratul|someone|a person)|speak (to|with) (ratul|someone|a person)|call me|manush|manuser sathe|ratul vai|ratul bhai)\b|মানুষ|এজেন্ট|রাতুল ভাই|সরাসরি কথা|কথা বলতে চাই|ফোন দিন|কল দিন/i;
export const wantsHuman = (s: string) => HANDOFF_RE.test(s);

// ---- Meta webhook payload types --------------------------------------------------
type Attachment = { type: string; payload?: { url?: string; sticker_id?: number } };
export type MessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number | string;
    metadata?: string;
    quick_reply?: { payload: string };
    attachments?: Attachment[];
    sticker_id?: number;
  };
  postback?: { mid?: string; title?: string; payload?: string };
  read?: unknown;
  delivery?: unknown;
  reaction?: unknown;
};
export type WebhookBody = { object?: string; entry?: { id: string; time: number; messaging?: MessagingEvent[] }[] };

// ---- storage helpers ------------------------------------------------------------
async function firstSeen(env: Env, key: string): Promise<boolean> {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO mc_events (event_key, received_at) VALUES (?, ?)").bind(key.slice(0, 200), nowIso()).run();
  return (r.meta.changes ?? 0) > 0;
}

async function touchConversation(env: Env, psid: string, preview: string, inbound: boolean, at = nowIso()) {
  await env.DB.prepare(
    `INSERT INTO mc_conversations (psid, last_message_at, last_preview, last_user_at, unread, created_at)
     VALUES (?1, ?2, ?3, CASE WHEN ?4 THEN ?2 END, ?4, ?2)
     ON CONFLICT(psid) DO UPDATE SET last_message_at = ?2, last_preview = ?3,
       last_user_at = CASE WHEN ?4 THEN ?2 ELSE last_user_at END,
       unread = CASE WHEN ?4 THEN unread + 1 ELSE unread END`,
  )
    .bind(psid, at, preview.slice(0, 140), inbound ? 1 : 0)
    .run();
}

export async function storeMessage(
  env: Env,
  m: { psid: string; mid?: string | null; direction: "in" | "out"; source: string; text: string | null; meta?: unknown; status?: string; at?: string },
) {
  await env.DB.prepare("INSERT OR IGNORE INTO mc_messages (id, psid, mid, direction, source, text, meta, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uuid(), m.psid, m.mid ?? null, m.direction, m.source, m.text, JSON.stringify(m.meta ?? {}), m.status ?? "ok", m.at ?? nowIso())
    .run();
}

export async function setMode(env: Env, psid: string, mode: "ai" | "human", reason: string | null) {
  await env.DB.prepare("UPDATE mc_conversations SET mode = ?, handoff_reason = ?, handoff_at = ? WHERE psid = ?")
    .bind(mode, mode === "human" ? reason : null, mode === "human" ? nowIso() : null, psid)
    .run();
}

function notify(env: Env, text: string) {
  if (!env.NOTIFY_WEBHOOK_URL) return Promise.resolve();
  return fetch(env.NOTIFY_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, text }) })
    .then(() => undefined)
    .catch(() => undefined);
}

/** Sends (splitting long text) and records each part. Returns false if Meta refused. */
export async function deliver(
  env: Env,
  token: string,
  psid: string,
  text: string,
  o: { source: "ai" | "human" | "system"; meta?: Record<string, unknown>; quickReplies?: { title: string; payload: string }[]; tag?: "HUMAN_AGENT" },
): Promise<{ ok: boolean; error?: string }> {
  const parts = splitMessage(text);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    try {
      const r = await sendText(env, token, psid, parts[i], {
        tag: o.tag,
        metadata: o.source === "human" ? "rr-admin" : "rr-bot",
        quickReplies: last ? o.quickReplies : undefined,
      });
      await storeMessage(env, { psid, mid: r.message_id, direction: "out", source: o.source, text: parts[i], meta: { ...o.meta, ...(o.tag ? { tag: o.tag } : {}) }, status: "sent" });
    } catch (e) {
      const g = e as GraphError;
      const error = g.code ? `${g.message} (code ${g.code}${g.subcode ? "/" + g.subcode : ""})` : g.message;
      await storeMessage(env, { psid, direction: "out", source: o.source, text: parts[i], meta: { ...o.meta, error }, status: "failed" });
      await log(env, "error", "send", `Send API failed for ${psid}`, { error, status: g.status });
      return { ok: false, error };
    }
  }
  await touchConversation(env, psid, text, false);
  return { ok: true };
}

// ---- AI answer -------------------------------------------------------------------
type Plan = { lang: "en" | "bn" | "banglish"; search: string; intent: string };
export type Answer = {
  reply: string;
  handoff: "none" | "suggest" | "now";
  lang: Plan["lang"];
  sources: { url: string; title: string; heading: string | null }[];
  search: string;
  model: string;
  guarded?: string;
};

const PLANNER = `You prepare search queries for a website knowledge base about Ratul Roy, a Local SEO and Google Business Profile specialist based in Bangladesh.
Read the latest customer message (and earlier turns for context) and return ONLY JSON:
{"lang":"en"|"bn"|"banglish","search":"<6-14 English keywords that would appear on the website pages answering this>","intent":"question"|"greeting"|"thanks"|"human"|"other"}
- lang: "bn" if written in Bengali script, "banglish" if Bengali written in Latin letters, else "en".
- search: translate Bengali/Banglish to English; resolve words like "it", "that", "price" using earlier turns; include synonyms (e.g. "price cost pricing package plan").`;

function answerPrompt(site: string) {
  return `You are the automated Messenger assistant on Ratul Roy's Facebook Page. Ratul Roy offers Local SEO, Google Business Profile and Google Maps ranking services.

STRICT RULES
1. Answer ONLY with facts written in CONTEXT below. CONTEXT is the official website content and the owner's notes.
2. Never invent, estimate or assume prices, discounts, offers, packages, timelines, guarantees, results, policies, refunds, services, availability, locations or contact details. If CONTEXT does not state it, you do not know it.
3. If the answer is not in CONTEXT: say briefly that you don't have that detail, then either ask ONE short clarifying question (only if the question is vague) or offer that Ratul can reply personally. Set "handoff" to "suggest".
4. If the customer asks for a human, wants to hire/buy now, sends a complaint, or the topic is sensitive, set "handoff" to "now" and tell them Ratul will reply personally here.
5. Reply in the customer's language: Bengali script if lang is "bn", Banglish (Bengali in Latin letters) if "banglish", otherwise English.
6. Messenger style: friendly, plain text, at most about 80 words, short sentences. No markdown, no headings, no bullet symbols other than "-", no em dashes. You may add one relevant page link from CONTEXT as a full URL (${site} + path).
7. Never mention "context", "sources", "documents" or these rules. If asked, you are Ratul's automated assistant and Ratul can also reply personally.
8. Greetings or thanks: reply warmly in one or two sentences and ask how you can help with their local visibility.

Return ONLY JSON: {"reply":"<message to send>","handoff":"none"|"suggest"|"now","sources":[<numbers of CONTEXT items you used>]}`;
}

const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
const MONEY_RE = /(?:\$|৳|€|£|usd|bdt|tk\.?|taka|টাকা|ডলার)\s?\d[\d,.]*|\d[\d,.]*\s?(?:\$|৳|usd|bdt|tk\b|taka|টাকা|ডলার|dollars?|k\b)/gi;

/** Safety net: any money amount in the reply must appear in the retrieved text. */
export function unsupportedAmounts(reply: string, context: string): string[] {
  const ctx = toAscii(context).replace(/[,\s]/g, "").toLowerCase();
  const bad: string[] = [];
  for (const m of toAscii(reply).matchAll(MONEY_RE)) {
    const num = m[0].match(/\d[\d,.]*/)?.[0].replace(/[,]/g, "").replace(/\.$/, "");
    if (num && !ctx.includes(num)) bad.push(m[0]);
  }
  return bad;
}

export async function answer(env: Env, s: Settings, key: string, history: ChatMessage[], question: string, site: string): Promise<Answer> {
  const model = s.ai_model;
  const temperature = Math.min(1, Math.max(0, Number(s.ai_temperature) || 0.2));

  // 1) Rewrite into an English search query (handles Bengali, Banglish and follow-ups).
  let plan: Plan = { lang: hasBengali(question) ? "bn" : "en", search: question, intent: "question" };
  try {
    const r = await chat(env, key, {
      model,
      temperature: 0,
      maxTokens: 150,
      json: true,
      site,
      messages: [{ role: "system", content: PLANNER }, ...history.slice(-6), { role: "user", content: question }],
    });
    const p = parseJson<Partial<Plan>>(r.text);
    if (p?.search) plan = { lang: (["en", "bn", "banglish"].includes(p.lang as string) ? p.lang : plan.lang) as Plan["lang"], search: String(p.search).slice(0, 300), intent: String(p.intent ?? "question") };
  } catch (e) {
    await log(env, "warn", "ai", "Query rewrite failed, searching the raw message", { error: (e as Error).message });
  }

  // 2) Retrieve.
  let hits: Hit[] = await search(env, `${plan.search} ${hasBengali(question) ? "" : question}`, 6);
  if (!hits.length && plan.search !== question) hits = await search(env, question, 6);

  const ctxItems = hits.map((h, i) => `[${i + 1}] ${h.title}${h.heading ? " > " + h.heading : ""} (${h.url})\n${h.content}`);
  if (s.owner_notes.trim()) ctxItems.push(`[${hits.length + 1}] Owner's notes (authoritative)\n${s.owner_notes.trim().slice(0, 3000)}`);
  const context = ctxItems.join("\n\n") || "(no matching website content)";

  // 3) Grounded answer.
  const r = await chat(env, key, {
    model,
    temperature,
    maxTokens: 600,
    json: true,
    site,
    messages: [
      { role: "system", content: answerPrompt(site) },
      { role: "system", content: `CONTEXT\n${context}` },
      ...history.slice(-8),
      { role: "user", content: `lang=${plan.lang}\nCustomer: ${question}` },
    ],
  });
  const parsed = parseJson<{ reply?: string; handoff?: string; sources?: number[] }>(r.text);
  if (!parsed?.reply?.trim()) throw new AiError("The model did not return a usable answer");

  let reply = parsed.reply.trim().replace(/\s*—\s*/g, ", ").slice(0, 1800);
  let handoff = (["none", "suggest", "now"].includes(parsed.handoff ?? "") ? parsed.handoff : "none") as Answer["handoff"];
  const used = (parsed.sources ?? []).map((n) => hits[n - 1]).filter(Boolean);

  const bad = unsupportedAmounts(reply, context);
  let guarded: string | undefined;
  if (bad.length) {
    guarded = `Removed an answer with amounts not found on the website: ${bad.join(", ")}`;
    reply = plan.lang === "bn" ? s.fallback_message_bn : s.fallback_message_en;
    handoff = "now";
  }
  return {
    reply,
    handoff,
    lang: plan.lang,
    sources: (used.length ? used : hits.slice(0, 2)).map((h) => ({ url: h.url, title: h.title, heading: h.heading })),
    search: plan.search,
    model: r.model,
    guarded,
  };
}

// ---- event processing -------------------------------------------------------------
type Conv = { psid: string; name: string | null; mode: "ai" | "human"; handoff_at: string | null; last_user_at: string | null };

export async function handleEvent(env: Env, ev: MessagingEvent, site: string, opts: { debounceMs?: number } = {}) {
  if (ev.read || ev.delivery || ev.reaction) return;
  const s = await getSettings(env);

  // Echo: a message the Page sent. Ours carry "rr-" metadata; anything else came from a
  // person replying in the Page inbox (Meta Business Suite), so the AI steps back.
  if (ev.message?.is_echo) {
    const m = ev.message;
    const psid = ev.recipient.id;
    const ours = (m.metadata ?? "").startsWith(OUR_METADATA_PREFIX) || (!!s.meta_app_id && String(m.app_id ?? "") === s.meta_app_id);
    if (ours) return;
    const exists = await env.DB.prepare("SELECT 1 FROM mc_messages WHERE mid = ?").bind(m.mid).first();
    if (exists) return;
    await touchConversation(env, psid, m.text ?? "[attachment]", false);
    await storeMessage(env, { psid, mid: m.mid, direction: "out", source: "page_inbox", text: m.text ?? "[attachment]", meta: { app_id: m.app_id ?? null } });
    if (s.pause_on_inbox_reply === "1") {
      await setMode(env, psid, "human", "Replied from the Page inbox");
      await log(env, "info", "handoff", `AI paused for ${psid}: someone replied from the Page inbox`);
    }
    return;
  }

  const psid = ev.sender.id;
  const key = ev.message?.mid ?? `pb:${psid}:${ev.timestamp}:${ev.postback?.payload ?? ""}`;
  if (!(await firstSeen(env, key))) return; // duplicate delivery

  const at = new Date(ev.timestamp || Date.now()).toISOString();
  const attachments = ev.message?.attachments ?? [];
  const isSticker = !!ev.message?.sticker_id || attachments.some((a) => a.payload?.sticker_id);
  const text =
    ev.message?.text?.trim() ||
    (ev.postback ? (ev.postback.title || ev.postback.payload || "").trim() : "") ||
    (attachments.length ? `[${attachments.map((a) => a.type).join(", ")}]` : "");
  const payload = ev.message?.quick_reply?.payload ?? ev.postback?.payload ?? null;

  await touchConversation(env, psid, text || "[message]", true, at);
  await storeMessage(env, {
    psid,
    mid: ev.message?.mid ?? ev.postback?.mid ?? null,
    direction: "in",
    source: "user",
    text: text || null,
    meta: { attachments: attachments.map((a) => ({ type: a.type, url: a.payload?.url })), payload },
    at,
  });

  const conv = (await env.DB.prepare("SELECT psid, name, mode, handoff_at, last_user_at FROM mc_conversations WHERE psid = ?").bind(psid).first<Conv>())!;
  const token = await getSecret(env, "meta_page_token");
  if (token && !conv.name) {
    const name = await userName(env, token, psid);
    if (name) await env.DB.prepare("UPDATE mc_conversations SET name = ? WHERE psid = ?").bind(name, psid).run();
  }

  // --- should the assistant answer? ---
  if (s.bot_enabled !== "1") return;
  if (!token) return void (await log(env, "error", "bot", "No Page access token: cannot reply"));

  if (conv.mode === "human") {
    const hours = Number(s.auto_resume_hours) || 0;
    const quietSince = conv.handoff_at ? Date.parse(conv.handoff_at) : 0;
    const lastHuman = await env.DB.prepare("SELECT MAX(created_at) AS t FROM mc_messages WHERE psid = ? AND source IN ('human','page_inbox')").bind(psid).first<{ t: string | null }>();
    const lastHumanAt = Math.max(quietSince, lastHuman?.t ? Date.parse(lastHuman.t) : 0);
    if (hours > 0 && Date.now() - lastHumanAt > hours * 3600_000) {
      await setMode(env, psid, "ai", null);
      await log(env, "info", "handoff", `AI resumed for ${psid} after ${hours}h without a human reply`);
    } else return;
  }

  const lang: "en" | "bn" = hasBengali(text) ? "bn" : "en";

  if (payload === HUMAN_PAYLOAD || (text && wantsHuman(text))) {
    await senderAction(env, token, psid, "mark_seen");
    await deliver(env, token, psid, lang === "bn" ? s.handoff_message_bn : s.handoff_message_en, { source: "system", meta: { reason: "customer asked for a person" } });
    await setMode(env, psid, "human", "Customer asked for a person");
    await notify(env, `Messenger: ${conv.name ?? psid} asked to talk to you. Open /admin to reply.`);
    await log(env, "info", "handoff", `Handoff requested by ${psid}`);
    return;
  }

  if (isSticker && !ev.message?.text) return; // a like/sticker needs no reply

  // Rate limit AI replies per person (cost and abuse control).
  const max = Number(s.max_replies_per_hour) || 20;
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM mc_messages WHERE psid = ? AND source = 'ai' AND created_at > ?")
    .bind(psid, new Date(Date.now() - 3600_000).toISOString())
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= max) {
    await setMode(env, psid, "human", "Reply limit reached");
    await log(env, "warn", "bot", `Reply limit (${max}/h) reached for ${psid}; switched to human`);
    await notify(env, `Messenger: ${conv.name ?? psid} hit the AI reply limit. Please take over in /admin.`);
    return;
  }

  // Wait briefly so several quick messages get one answer; only the newest one replies.
  const wait = opts.debounceMs ?? DEBOUNCE_MS;
  if (wait > 0) {
    await senderAction(env, token, psid, "mark_seen");
    await sleep(wait);
    const latest = await env.DB.prepare("SELECT mid FROM mc_messages WHERE psid = ? AND direction = 'in' ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(psid).first<{ mid: string | null }>();
    const mine = ev.message?.mid ?? ev.postback?.mid ?? null;
    if (latest && mine && latest.mid !== mine) return;
  }

  // Ignore if the 24h window is closed (cannot happen for a fresh message, but be safe).
  if (Date.now() - Date.parse(at) > WINDOW_MS) return;

  if (!ev.message?.text && !ev.postback && attachments.length) {
    const msg =
      lang === "bn"
        ? "আমি এখানে শুধু লেখা মেসেজ পড়তে পারি। আপনার প্রশ্নটি লিখে পাঠাবেন? চাইলে রাতুল নিজেই উত্তর দিতে পারেন।"
        : "I can only read text here. Could you type your question? Or Ratul can reply personally.";
    await deliver(env, token, psid, msg, { source: "ai", meta: { reason: "attachment" }, quickReplies: [{ title: lang === "bn" ? "রাতুলের সাথে কথা" : "Talk to Ratul", payload: HUMAN_PAYLOAD }] });
    return;
  }

  const aiKey = await getSecret(env, "openrouter_key");
  if (!aiKey) return void (await log(env, "error", "bot", "No OpenRouter API key: cannot reply"));

  // Conversation memory: recent turns, plus any unanswered messages merged into one question.
  const { results: rows } = await env.DB.prepare("SELECT direction, source, text, created_at FROM mc_messages WHERE psid = ? AND status != 'failed' ORDER BY created_at DESC, rowid DESC LIMIT 16")
    .bind(psid)
    .all<{ direction: string; source: string; text: string | null }>();
  rows.reverse();
  let lastOut = -1;
  rows.forEach((r, i) => r.direction === "out" && (lastOut = i));
  const pending = rows.slice(lastOut + 1).filter((r) => r.direction === "in" && r.text).map((r) => r.text!);
  const history: ChatMessage[] = rows.slice(0, lastOut + 1).filter((r) => r.text).map((r) => ({ role: r.direction === "in" ? "user" : "assistant", content: r.text! }));
  const question = (pending.length ? pending : [text]).join("\n").slice(0, 2000);

  await senderAction(env, token, psid, "typing_on");
  let a: Answer;
  try {
    a = await answer(env, s, aiKey, history, question, site);
  } catch (e) {
    await log(env, "error", "ai", `AI reply failed for ${psid}`, { error: (e as Error).message, status: (e as AiError).status });
    await deliver(env, token, psid, lang === "bn" ? s.fallback_message_bn : s.fallback_message_en, { source: "system", meta: { reason: "ai_error" } });
    await setMode(env, psid, "human", "AI error");
    await notify(env, `Messenger: AI could not answer ${conv.name ?? psid}. Please reply in /admin.`);
    return;
  }
  if (a.guarded) await log(env, "warn", "guard", a.guarded, { psid, question });

  const humanBtn = { title: a.lang === "bn" ? "রাতুলের সাথে কথা" : "Talk to Ratul", payload: HUMAN_PAYLOAD };
  const sent = await deliver(env, token, psid, a.reply, {
    source: "ai",
    meta: { model: a.model, search: a.search, sources: a.sources, handoff: a.handoff, lang: a.lang },
    quickReplies: a.handoff === "suggest" ? [humanBtn] : undefined,
  });
  await env.DB.prepare("UPDATE mc_conversations SET lang = ? WHERE psid = ?").bind(a.lang, psid).run();
  if (sent.ok && a.handoff === "now") {
    await setMode(env, psid, "human", "Assistant handed over");
    await notify(env, `Messenger: ${conv.name ?? psid} needs you personally. Open /admin to reply.`);
  }
}

/** Manual reply from the admin screen, respecting Meta's messaging windows. */
export async function manualReply(env: Env, psid: string, text: string) {
  const conv = await env.DB.prepare("SELECT last_user_at FROM mc_conversations WHERE psid = ?").bind(psid).first<{ last_user_at: string | null }>();
  if (!conv) return { ok: false, status: 404, error: "Conversation not found" };
  const token = await getSecret(env, "meta_page_token");
  if (!token) return { ok: false, status: 409, error: "Add the Page access token first (Messenger > Settings)." };
  const age = conv.last_user_at ? Date.now() - Date.parse(conv.last_user_at) : Infinity;
  if (age > HUMAN_TAG_MS)
    return { ok: false, status: 409, error: "This person last wrote more than 7 days ago. Meta only allows a reply after they message the Page again." };
  const tag = age > WINDOW_MS ? ("HUMAN_AGENT" as const) : undefined;
  const r = await deliver(env, token, psid, text, { source: "human", tag });
  if (!r.ok) return { ok: false, status: 422, error: `Meta refused the message: ${r.error}${tag ? " (replies after 24 hours need the Human Agent permission)" : ""}` };
  await env.DB.prepare("UPDATE mc_conversations SET unread = 0 WHERE psid = ?").bind(psid).run();
  return { ok: true, tag: tag ?? null };
}

