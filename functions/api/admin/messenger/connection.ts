// POST /api/admin/messenger/connection {action: "test" | "subscribe"}
// Real Graph API calls: confirms the token belongs to a Page and subscribes the Page to
// this app's webhook. Nothing is reported as connected unless Meta says so.
import type { Ctx } from "../../../../backend/lib/types";
import { fail, json, readJson } from "../../../../backend/lib/http";
import { getSecret, getSettings, setSettings } from "../../../../backend/lib/messenger/settings";
import { graph, GraphError } from "../../../../backend/lib/messenger/graph";
import { log } from "../../../../backend/lib/messenger/log";

const FIELDS = "messages,messaging_postbacks,message_echoes";

export const onRequestPost = async ({ env, request }: Ctx) => {
  const body = await readJson<{ action?: string }>(request, 1024);
  const action = body?.action;
  if (action !== "test" && action !== "subscribe") return fail(400, "Unknown action");
  const token = await getSecret(env, "meta_page_token");
  if (!token) return fail(409, "Add the Page access token first.");

  try {
    const page = await graph<{ id: string; name: string }>(env, token, "/me", { query: { fields: "id,name" }, retries: 1 });
    const s = await getSettings(env);
    if (s.meta_page_id && s.meta_page_id !== page.id)
      return fail(409, `This token belongs to "${page.name}" (${page.id}), not the configured Page ID ${s.meta_page_id}. Clear the Page ID or use the right token.`);
    await setSettings(env, { meta_page_id: page.id, meta_page_name: page.name });

    if (action === "subscribe") {
      await graph(env, token, `/${page.id}/subscribed_apps`, { method: "POST", query: { subscribed_fields: FIELDS }, retries: 1 });
      await log(env, "info", "connect", `Page "${page.name}" subscribed to webhook fields: ${FIELDS}`);
    }
    const apps = await graph<{ data: { id: string; name: string; subscribed_fields?: string[] }[] }>(env, token, `/${page.id}/subscribed_apps`, { retries: 1 });
    if (action === "test") await log(env, "info", "connect", `Connection test OK for Page "${page.name}"`);
    return json({ ok: true, page, subscribedApps: apps.data ?? [] });
  } catch (e) {
    const g = e as GraphError;
    await log(env, "error", "connect", `Connection ${action} failed`, { error: g.message, code: g.code, status: g.status });
    const hint =
      g.status === 0
        ? " Could not reach Facebook; try again in a minute."
        : g.code === 190
          ? " The Page access token is wrong or expired: generate a new one in Meta (Messenger > Messenger API Settings) and paste it again."
          : g.code === 100 || g.code === 200 || g.code === 210
            ? " This looks like a user or app token, or the Page isn't connected to this app. Use the token from Messenger API Settings next to your Page."
            : "";
    return fail(422, `Meta said: ${g.message}${g.code ? ` (code ${g.code})` : ""}.${hint}`);
  }
};
