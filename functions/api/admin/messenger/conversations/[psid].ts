// GET   /api/admin/messenger/conversations/:psid  — thread (marks it read)
// PATCH /api/admin/messenger/conversations/:psid  {mode:"ai"|"human"}
// POST  /api/admin/messenger/conversations/:psid  {text} — manual reply via Send API
import type { Ctx } from "../../../../../backend/lib/types";
import { fail, json, readJson, str } from "../../../../../backend/lib/http";
import { manualReply, setMode } from "../../../../../backend/lib/messenger/bot";
import { log } from "../../../../../backend/lib/messenger/log";

const valid = (p: string) => /^\d{5,30}$/.test(p);

export const onRequestGet = async ({ env, params }: Ctx<"psid">) => {
  if (!valid(params.psid)) return fail(404, "Not found");
  const [conv, msgs] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM mc_conversations WHERE psid = ?").bind(params.psid),
    env.DB.prepare("SELECT id, mid, direction, source, text, meta, status, created_at FROM mc_messages WHERE psid = ? ORDER BY created_at ASC, rowid ASC LIMIT 500").bind(params.psid),
  ]);
  if (!conv.results[0]) return fail(404, "Not found");
  await env.DB.prepare("UPDATE mc_conversations SET unread = 0 WHERE psid = ?").bind(params.psid).run();
  const c = conv.results[0] as { last_user_at: string | null };
  const age = c.last_user_at ? Date.now() - Date.parse(c.last_user_at) : Infinity;
  return json({ ok: true, conversation: c, messages: msgs.results, window: age <= 86400_000 ? "open" : age <= 7 * 86400_000 ? "human_agent" : "closed" });
};

export const onRequestPatch = async ({ env, params, request, data }: Ctx<"psid">) => {
  if (!valid(params.psid)) return fail(404, "Not found");
  const body = await readJson<{ mode?: string }>(request, 1024);
  if (body?.mode !== "ai" && body?.mode !== "human") return fail(422, "Invalid mode");
  await setMode(env, params.psid, body.mode, body.mode === "human" ? `Taken over by ${data.user?.name ?? "admin"}` : null);
  await log(env, "info", "handoff", `${data.user?.email} set ${params.psid} to ${body.mode === "ai" ? "AI replies" : "human replies"}`);
  return json({ ok: true });
};

export const onRequestPost = async ({ env, params, request, data }: Ctx<"psid">) => {
  if (!valid(params.psid)) return fail(404, "Not found");
  const body = await readJson(request, 8192);
  const text = str(body?.text, 4000);
  if (!text) return fail(400, "Write a message");
  const r = await manualReply(env, params.psid, text);
  if (!r.ok) return fail(r.status!, r.error!);
  // A person replied: keep the AI out of this conversation until switched back.
  await setMode(env, params.psid, "human", `Replied by ${data.user?.name ?? "admin"}`);
  return json({ ok: true, tag: r.tag });
};
