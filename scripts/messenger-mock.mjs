#!/usr/bin/env node
// LOCAL TEST DOUBLE for Meta Graph API + OpenRouter. Used only by scripts/messenger-test.mjs
// so the integration can be exercised without real credentials. It is never deployed and
// its answers are clearly fake; production always talks to graph.facebook.com / openrouter.ai.
//   node scripts/messenger-mock.mjs   (port 8795)
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8795);
let calls = [];
let outId = 0;
const failedOnce = new Set(); // first send to a PSID ending in 777 returns HTTP 500 (tests retry)

const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

function ai(body) {
  const msgs = body.messages ?? [];
  const sys = msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const user = msgs.filter((m) => m.role === "user").at(-1)?.content ?? "";
  if (sys.includes("prepare search queries")) {
    const search = /দাম|খরচ|koto/i.test(user) ? "price pricing cost package" : user.replace(/[^\w\s]/g, " ");
    const lang = /[ঀ-৿]/.test(user) ? "bn" : /koto|ki|ache/i.test(user) ? "banglish" : "en";
    return JSON.stringify({ lang, search, intent: "question" });
  }
  const ctx = sys.split("CONTEXT\n")[1] ?? "";
  if (/MOCK_BAD_JSON/.test(user)) return "not json at all";
  if (/discount/i.test(user)) return JSON.stringify({ reply: "Yes! You get a $37 discount today.", handoff: "none", sources: [1] });
  if (ctx.startsWith("(no matching")) return JSON.stringify({ reply: "I don't have that detail. Would you like Ratul to reply personally?", handoff: "suggest", sources: [] });
  const first = ctx.match(/^\[1\] ([^\n]+)/m)?.[1] ?? "?";
  return JSON.stringify({ reply: `MOCK ANSWER from: ${first}`, handoff: "none", sources: [1] });
}

createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  if (p === "/__calls") return send(res, 200, calls);
  if (p === "/__reset") return (calls = []), send(res, 200, { ok: true });
  calls.push({ method: req.method, path: p, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization ?? null, body });

  // OpenRouter
  if (p === "/api/v1/models") return send(res, 200, { data: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini" }] });
  if (p === "/api/v1/chat/completions") {
    if (req.headers.authorization !== "Bearer or-test-key") return send(res, 401, { error: { message: "Invalid API key" } });
    if (/MOCK_AI_DOWN/.test(JSON.stringify(body.messages))) return send(res, 503, { error: { message: "Upstream overloaded" } });
    return send(res, 200, { model: body.model, choices: [{ message: { content: ai(body) } }] });
  }

  // Graph: token inspection with the app token (App ID|App secret)
  if (p === "/v21.0/debug_token") {
    if (req.headers.authorization !== "Bearer 5550001|app-secret-for-tests") return send(res, 400, { error: { message: "Invalid app token", code: 190 } });
    const ok = url.searchParams.get("input_token") === "page-test-token";
    return send(res, 200, { data: ok ? { is_valid: true, type: "PAGE", app_id: "5550001", profile_id: "1122334455", scopes: ["pages_messaging", "pages_show_list"], expires_at: 0 } : { is_valid: false, error: { message: "Invalid token" } } });
  }
  // A Page token without pages_read_engagement cannot read the Page name.
  if (p === "/v21.0/1122334455" && url.searchParams.get("fields") === "name") return send(res, 400, { error: { message: "(#100) requires pages_read_engagement", code: 100 } });

  // Graph
  if (req.headers.authorization !== "Bearer page-test-token") return send(res, 400, { error: { message: "Invalid OAuth access token.", code: 190 } });
  if (p === "/v21.0/me" && req.method === "GET") return send(res, 200, { id: "1122334455", name: "Ratul Roy Test Page" });
  if (p === "/v21.0/me/messages") {
    const id = body.recipient?.id;
    if (body.sender_action) return send(res, 200, { recipient_id: id });
    if (id?.endsWith("777") && !failedOnce.has(id) && failedOnce.add(id)) return send(res, 500, { error: { message: "Temporary failure", code: 2 } });
    if (id?.endsWith("999")) return send(res, 400, { error: { message: "This person isn't available right now.", code: 551, error_subcode: 1545041 } });
    return send(res, 200, { recipient_id: id, message_id: `m_out_${Date.now()}_${++outId}` });
  }
  if (/^\/v21\.0\/\d+\/subscribed_apps$/.test(p)) return send(res, 200, req.method === "POST" ? { success: true } : { data: [{ id: "555", name: "Test App", subscribed_fields: ["messages"] }] });
  if (/^\/v21\.0\/\d+$/.test(p)) return send(res, 200, { first_name: "Test", last_name: "Customer" });
  send(res, 404, { error: { message: "mock: unknown path " + p } });
}).listen(PORT, "127.0.0.1", () => console.log(`mock Meta/OpenRouter on http://127.0.0.1:${PORT}`));
