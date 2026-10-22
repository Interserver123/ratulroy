#!/usr/bin/env node
// End-to-end test of the Messenger integration against a local server wired to the mock
// Meta/OpenRouter (scripts/messenger-mock.mjs). See docs/MESSENGER.md > "Testing".
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:8788";
const MOCK = process.env.MOCK ?? "http://127.0.0.1:8795";
const EMAIL = process.env.ADMIN_EMAIL ?? "test@ratulroy.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "local-test-password-123";
const SETUP_KEY = process.env.SETUP_KEY ?? "my-secret-setup-key";
const APP_SECRET = "app-secret-for-tests";
let cookie = "";
let passed = 0;
const fails = [];
const RUN = String(Date.now()).slice(-7); // unique test user IDs per run
const id = (n) => RUN + String(n).padStart(3, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, { method = "GET", body } = {}) {
  const headers = { Origin: BASE };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
function check(name, cond, info = "") {
  if (cond) passed++;
  else fails.push(name);
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : ` ${typeof info === "string" ? info : JSON.stringify(info)}`}`);
}
async function webhook(payload, { secret = APP_SECRET, sign = true } = {}) {
  const raw = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };
  if (sign) headers["X-Hub-Signature-256"] = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const res = await fetch(BASE + "/api/messenger/webhook", { method: "POST", headers, body: raw });
  return { status: res.status, text: await res.text() };
}
const msg = (psid, text, extra = {}) => ({
  object: "page",
  entry: [{ id: "1122334455", time: Date.now(), messaging: [{ sender: { id: psid }, recipient: { id: "1122334455" }, timestamp: Date.now(), message: { mid: `m_${psid}_${Math.random().toString(36).slice(2)}`, text, ...extra } }] }],
});
const mockCalls = async () => (await fetch(MOCK + "/__calls")).json();
const sends = async (psid) => (await mockCalls()).filter((c) => c.path.endsWith("/me/messages") && c.body.recipient?.id === psid && c.body.message);
const thread = async (psid) => (await call(`/api/admin/messenger/conversations/${psid}`)).data;
async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(400);
  }
  return null;
}

await fetch(MOCK + "/__reset");

// --- admin login (creates the first account on an empty database) ---
let r = await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
if (r.status !== 200) {
  await call("/api/admin/setup", { method: "POST", body: { key: SETUP_KEY, email: EMAIL, password: PASSWORD, name: "Test Owner" } });
  r = await call("/api/admin/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
}
check("admin login", r.status === 200, r.data);

// --- settings & secrets ---
r = await call("/api/admin/messenger/settings");
check("settings load", r.status === 200 && r.data.webhookUrl?.endsWith("/api/messenger/webhook"), r.data);
const verify = r.data.verifyToken;
check("verify token generated", /^rr_/.test(verify ?? ""), verify);
r = await call("/api/admin/messenger/settings", {
  method: "PUT",
  body: { ai_model: "openai/gpt-4o-mini", meta_app_id: "5550001", bot_enabled: true, secrets: { meta_app_secret: APP_SECRET, meta_page_token: "page-test-token", openrouter_key: "or-test-key" } },
});
check("secrets saved", r.status === 200 && r.data.secrets.meta_page_token.set && r.data.secrets.meta_page_token.source === "stored", r.data);
check("secrets never returned in plain text", !JSON.stringify(r.data).includes("page-test-token") && !JSON.stringify(r.data).includes(APP_SECRET));
r = await call("/api/admin/messenger/settings", { method: "PUT", body: { ai_model: "bad model!" } });
check("invalid model rejected", r.status === 422);

// --- admin API is protected ---
const saved = cookie;
cookie = "";
r = await call("/api/admin/messenger/settings");
check("messenger admin API requires login", r.status === 401);
cookie = saved;

// --- connection test (real Graph call, here answered by the mock) ---
r = await call("/api/admin/messenger/connection", { method: "POST", body: { action: "subscribe" } });
check("connect + subscribe page (token checked via debug_token, name not required)", r.status === 200 && r.data.page?.id === "1122334455" && r.data.scopes?.includes("pages_messaging"), r.data);
const sub = (await mockCalls()).find((c) => c.method === "POST" && c.path.endsWith("/subscribed_apps"));
check("subscribed to messages, postbacks, echoes", sub?.query.subscribed_fields === "messages,messaging_postbacks,message_echoes", sub);

// --- knowledge base scan ---
r = await call("/api/admin/messenger/kb", { method: "POST", body: { action: "start" } });
check("scan started", r.status === 200 && r.data.scan.total > 10, r.data);
for (let i = 0; i < 40 && r.data.scan?.status === "running"; i++) r = await call("/api/admin/messenger/kb", { method: "POST", body: { action: "step" } });
check("scan finished", r.data.scan?.status === "done" && r.data.scan.chunks > 50, r.data);
r = await call("/api/admin/messenger/kb?q=google%20business%20profile");
check("kb search finds GBP content", r.data.hits?.length > 0 && r.data.pages > 10, { pages: r.data.pages, hits: r.data.hits?.length });

// --- webhook verification ---
let res = await fetch(`${BASE}/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=CHALLENGE123`);
check("webhook verify handshake", res.status === 200 && (await res.text()) === "CHALLENGE123");
res = await fetch(`${BASE}/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x`);
check("wrong verify token rejected", res.status === 403);

// --- signature validation ---
let w = await webhook(msg(id(1), "hello"), { sign: false });
check("unsigned event rejected", w.status === 403);
w = await webhook(msg(id(1), "hello"), { secret: "wrong" });
check("bad signature rejected", w.status === 403);
const crossOrigin = await fetch(BASE + "/api/messenger/webhook", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
check("webhook not blocked by CSRF check but still needs signature", crossOrigin.status === 403);

// --- grounded AI reply ---
const p1 = id(1);
w = await webhook(msg(p1, "What does a Google Business Profile optimization include?"));
check("signed event accepted", w.status === 200 && w.text === "EVENT_RECEIVED");
let out = await waitFor(async () => (await sends(p1)).length && (await sends(p1)));
check("AI reply sent through Send API", out?.[0]?.body.message.text.startsWith("MOCK ANSWER from:"), out);
check("reply uses RESPONSE type + bot metadata", out?.[0]?.body.messaging_type === "RESPONSE" && out?.[0]?.body.message.metadata === "rr-bot");
let t = await waitFor(async () => {
  const x = await thread(p1);
  return x.messages?.some((m) => m.source === "ai") && x;
});
check("conversation stored with name", t.conversation?.name === "Test Customer", t.conversation);
check("inbound + outbound messages stored", t.messages?.filter((m) => m.direction === "in").length === 1 && t.messages?.some((m) => m.source === "ai" && m.status === "sent"));
const aiMeta = JSON.parse(t.messages.find((m) => m.source === "ai").meta);
check("reply records model + retrieved sources", aiMeta.model && aiMeta.sources?.length > 0, aiMeta);

// --- duplicate delivery ---
const dup = msg(id(2), "Do you work with dentists?");
await webhook(dup);
await webhook(dup);
await waitFor(async () => (await sends(id(2))).length);
await sleep(3500);
check("duplicate event answered once", (await sends(id(2))).length === 1, (await sends(id(2))).length);

// --- rapid messages are merged into one answer ---
const p3 = id(3);
await webhook(msg(p3, "hi"));
await sleep(300);
await webhook(msg(p3, "what services do you offer for local seo"));
await waitFor(async () => (await sends(p3)).length);
await sleep(3500);
check("two quick messages -> one reply", (await sends(p3)).length === 1, (await sends(p3)).length);

// --- Bengali question goes through the query rewrite ---
const p4 = id(4);
await webhook(msg(p4, "লোকাল এসইও প্যাকেজের দাম কত?"));
out = await waitFor(async () => (await sends(p4)).length && (await sends(p4)));
const planner = (await mockCalls()).find((c) => c.path.endsWith("/chat/completions") && JSON.stringify(c.body.messages).includes("দাম"));
check("Bengali message answered", !!out?.length, out);
check("Bengali query rewritten before search", !!planner);

// --- price guard: an amount not on the website is never sent ---
const p5 = id(5);
await webhook(msg(p5, "do you have any discount?"));
out = await waitFor(async () => (await sends(p5)).length && (await sends(p5)));
check("invented price blocked", out && !out[0].body.message.text.includes("$37"), out?.[0]?.body.message.text);
t = await thread(p5);
check("blocked answer flags 'needs you' but AI stays on", t.conversation?.mode === "ai" && !!t.conversation?.handoff_reason);

// --- human handoff on request ---
const p6 = id(6);
await webhook(msg(p6, "I want to talk to a real person"));
out = await waitFor(async () => (await sends(p6)).length && (await sends(p6)));
check("handoff message sent", out?.[0]?.body.message.text.includes("Ratul"), out);
t = await thread(p6);
check("handover flags the chat for you", t.conversation?.mode === "ai" && t.conversation?.handoff_reason === "Customer asked for a person");
await fetch(MOCK + "/__reset");
await webhook(msg(p6, "what is local seo"));
out = await waitFor(async () => (await sends(p6)).length && (await sends(p6)));
check("AI keeps answering after a handover", out?.[0]?.body.message.text.startsWith("MOCK ANSWER"), out?.[0]?.body.message.text);
// With "Stop AI after a handover" on, the chat pauses instead.
await call("/api/admin/messenger/settings", { method: "PUT", body: { handoff_pauses_ai: true } });
const p6b = id(61);
await webhook(msg(p6b, "I want to talk to a real person"));
await waitFor(async () => (await sends(p6b)).length);
await webhook(msg(p6b, "are you there?"));
await sleep(4000);
check("optional setting: AI silent after handover", (await thread(p6b)).conversation.mode === "human" && (await sends(p6b)).length === 1);
await call("/api/admin/messenger/settings", { method: "PUT", body: { handoff_pauses_ai: false } });
await webhook(msg(p6b, "hello?")); // 2nd message while waiting: phone number is shared
await waitFor(async () => (await sends(p6b)).some((c) => c.body.message.text.includes("+8801866820758")));
await sleep(3000);
await webhook(msg(p6b, "what is local seo"));
out = await waitFor(async () => (await sends(p6b)).some((c) => c.body.message.text.startsWith("MOCK ANSWER")));
check("chat paused by an automatic handover replies again once the setting is off", !!out && (await thread(p6b)).conversation.mode === "ai");

// --- keeps messaging while waiting for Ratul -> phone number shared once ---
const pw = id(62);
await webhook(msg(pw, "আমি রাতুল ভাইয়ের সাথে সরাসরি কথা বলতে চাই"));
out = await waitFor(async () => (await sends(pw)).length && (await sends(pw)));
check("Bengali handover says wait for Ratul sir", out?.[0]?.body.message.text.includes("রাতুল স্যারের জন্য"), out?.[0]?.body.message.text);
await webhook(msg(pw, "কেউ আছেন?"));
await waitFor(async () => (await sends(pw)).length >= 2);
await sleep(3000);
await webhook(msg(pw, "হ্যালো?"));
out = await waitFor(async () => {
  const x = await sends(pw);
  return x.some((c) => c.body.message.text.includes("+8801866820758")) && x;
});
check("phone number shared after repeated messages", !!out && out.find((c) => c.body.message.text.includes("+8801866820758")).body.message.text.includes("wa.me/8801866820758"));
await webhook(msg(pw, "আবার?"));
await sleep(4000);
check("phone number shared only once", (await sends(pw)).filter((c) => c.body.message.text.includes("+8801866820758")).length === 1);

// --- Bengali handoff + quick reply payload ---
const p7 = id(7);
await webhook(msg(p7, "Talk to Ratul", { quick_reply: { payload: "RR_HUMAN" } }));
out = await waitFor(async () => (await sends(p7)).length && (await sends(p7)));
check("quick-reply 'Talk to Ratul' hands over", !!out?.length && !!(await thread(p7)).conversation.handoff_reason);

// --- Page inbox echo pauses AI ---
const p8 = id(8);
await webhook(msg(p8, "hello there"));
await waitFor(async () => (await sends(p8)).length);
await webhook({ object: "page", entry: [{ id: "1122334455", time: Date.now(), messaging: [{ sender: { id: "1122334455" }, recipient: { id: p8 }, timestamp: Date.now(), message: { mid: `m_inbox_${RUN}`, is_echo: true, app_id: 263902037430900, text: "Hi, Ratul here" } }] }] });
t = await waitFor(async () => {
  const x = await thread(p8);
  return x.conversation?.mode === "human" && x;
});
check("reply from Page inbox pauses AI for that person", !!t && t.messages.some((m) => m.source === "page_inbox"));
// our own echo must be ignored
const ownMid = (await thread(p8)).messages.find((m) => m.source === "ai")?.mid;
await webhook({ object: "page", entry: [{ id: "1", time: Date.now(), messaging: [{ sender: { id: "1122334455" }, recipient: { id: p8 }, timestamp: Date.now(), message: { mid: ownMid, is_echo: true, metadata: "rr-bot", text: "x" } }] }] });
await sleep(800);
check("own echo ignored", (await thread(p8)).messages.filter((m) => m.source === "page_inbox").length === 1);

// --- manual reply + mode switch from admin ---
r = await call(`/api/admin/messenger/conversations/${p6}`, { method: "POST", body: { text: "Hi, this is Ratul. How can I help?" } });
check("manual reply sent", r.status === 200, r.data);
const manual = (await sends(p6)).at(-1);
check("manual reply uses RESPONSE within 24h, admin metadata", manual?.body.messaging_type === "RESPONSE" && manual.body.message.metadata === "rr-admin", manual);
r = await call(`/api/admin/messenger/conversations/${p6}`, { method: "PATCH", body: { mode: "ai" } });
check("switch back to AI", r.status === 200 && (await thread(p6)).conversation.mode === "ai");

// --- Send API retry on 5xx ---
const p9 = id(777);
await webhook(msg(p9, "what is local seo"));
out = await waitFor(async () => (await sends(p9)).length >= 2 && (await sends(p9)));
t = await thread(p9);
check("Send API retried after 500 and delivered", out?.length === 2 && t.messages.some((m) => m.source === "ai" && m.status === "sent"), out?.length);

// --- permanent Send failure is recorded, not faked ---
await webhook(msg(id(999), "what is local seo"));
t = await waitFor(async () => {
  const x = await thread(id(999));
  return x.messages?.some((m) => m.status === "failed") && x;
});
check("failed send stored as failed with Meta's error", !!t && JSON.parse(t.messages.find((m) => m.status === "failed").meta).error.includes("551"));

// --- AI outage: fallback message + handoff, error logged ---
const p10 = id(10);
await webhook(msg(p10, "MOCK_AI_DOWN please"));
out = await waitFor(async () => (await sends(p10)).length && (await sends(p10)));
check("AI outage -> fallback message", out?.[0]?.body.message.text.includes("Ratul sir"), out?.[0]?.body.message.text);
check("AI outage -> flagged for you", !!(await thread(p10)).conversation.handoff_reason);

// --- global pause ---
await call("/api/admin/messenger/settings", { method: "PUT", body: { bot_enabled: false } });
const p11 = id(11);
await webhook(msg(p11, "hello?"));
await sleep(3500);
check("paused bot does not reply but stores message", (await sends(p11)).length === 0 && (await thread(p11)).messages.length === 1);
await call("/api/admin/messenger/settings", { method: "PUT", body: { bot_enabled: true } });

// --- dry-run AI test + logs + conversations list ---
r = await call("/api/admin/messenger/test-ai", { method: "POST", body: { message: "How do you improve Google Maps rankings?" } });
check("Test AI dry run", r.status === 200 && r.data.reply?.startsWith("MOCK ANSWER") && r.data.sources.length > 0, r.data);
r = await call("/api/admin/messenger/conversations?filter=human");
check("conversation list filter", r.status === 200 && r.data.conversations.every((c) => c.mode === "human" || c.handoff_reason) && r.data.conversations.length >= 2);
r = await call("/api/admin/messenger/logs?level=error");
check("errors logged", r.data.logs?.some((l) => l.scope === "send") && r.data.logs?.some((l) => l.scope === "ai"), r.data.logs?.map((l) => l.message));

// --- cron endpoint ---
res = await fetch(BASE + "/api/messenger/cron", { method: "POST" });
check("cron requires secret", res.status === 401);
if (process.env.CRON_SECRET) {
  let c;
  for (let i = 0; i < 40; i++) {
    c = await (await fetch(BASE + "/api/messenger/cron", { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })).json();
    if (c.status !== "running") break;
  }
  check("scheduled refresh completes", c?.status === "done", c);
}

console.log(`\n${passed} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("Failed:\n- " + fails.join("\n- "));
  process.exit(1);
}
