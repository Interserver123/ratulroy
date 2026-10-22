// POST /api/admin/messenger/connection {action: "test" | "subscribe"}
// Real Graph API calls. The token is checked with Meta's debug_token endpoint (using the
// App ID + App secret), which needs no extra Page permission. Nothing is reported as
// connected unless Meta says so.
import type { Ctx, Env } from "../../../../backend/lib/types";
import { fail, json, readJson } from "../../../../backend/lib/http";
import { getSecret, getSettings, setSettings } from "../../../../backend/lib/messenger/settings";
import { graph, GraphError } from "../../../../backend/lib/messenger/graph";
import { log } from "../../../../backend/lib/messenger/log";

const FIELDS = "messages,messaging_postbacks,message_echoes";

type Debug = { data?: { is_valid?: boolean; type?: string; profile_id?: string; app_id?: string; scopes?: string[]; expires_at?: number; error?: { message?: string } } };

class Problem extends Error {}

/** Returns the Page ID, name (when readable) and granted permissions for the token. */
async function inspect(env: Env, token: string, appId: string, appSecret: string | null) {
  if (appId && appSecret) {
    const d = (await graph<Debug>(env, `${appId}|${appSecret}`, "/debug_token", { query: { input_token: token }, retries: 1 })).data ?? {};
    if (!d.is_valid) throw new Problem(`Meta says this token is not valid${d.error?.message ? `: ${d.error.message}` : ""}. Generate a new one in Messenger API Settings and paste it again.`);
    if (d.type !== "PAGE" || !d.profile_id)
      throw new Problem(`This is a ${d.type?.toLowerCase() ?? "non-Page"} token, not a Page token. In Meta, open Messenger API Settings, press "Generate" next to your Page, and paste that token.`);
    if (d.app_id && d.app_id !== appId) throw new Problem(`This token belongs to another app (${d.app_id}), not ${appId}. Generate it inside the "Ratul messenger" app.`);
    const scopes = d.scopes ?? [];
    if (!scopes.includes("pages_messaging")) throw new Problem("The token is missing the pages_messaging permission. Generate the token again and allow every permission Facebook asks for.");
    const name = await graph<{ name?: string }>(env, token, `/${d.profile_id}`, { query: { fields: "name" }, retries: 0 }).then((r) => r.name ?? null).catch(() => null);
    return { id: d.profile_id, name, scopes, expires: d.expires_at ? (d.expires_at === 0 ? null : new Date(d.expires_at * 1000).toISOString()) : null };
  }
  // Without the App ID + secret, fall back to asking "who am I" (id only needs no extra permission).
  const me = await graph<{ id: string }>(env, token, "/me", { query: { fields: "id" }, retries: 1 });
  const name = await graph<{ name?: string }>(env, token, "/me", { query: { fields: "name" }, retries: 0 }).then((r) => r.name ?? null).catch(() => null);
  return { id: me.id, name, scopes: null as string[] | null, expires: null };
}

export const onRequestPost = async ({ env, request }: Ctx) => {
  const body = await readJson<{ action?: string }>(request, 1024);
  const action = body?.action;
  if (action !== "test" && action !== "subscribe") return fail(400, "Unknown action");
  const token = await getSecret(env, "meta_page_token");
  if (!token) return fail(409, "Add the Page access token first.");
  const s = await getSettings(env);
  const appSecret = await getSecret(env, "meta_app_secret");

  try {
    const page = await inspect(env, token, s.meta_app_id, appSecret);
    if (s.meta_page_id && s.meta_page_id !== page.id)
      return fail(409, `This token is for Page ${page.id}${page.name ? ` ("${page.name}")` : ""}, not the Page ID ${s.meta_page_id} in Settings. Clear the Page ID box, save, and test again.`);
    const name = page.name ?? (s.meta_page_name || `Page ${page.id}`);
    await setSettings(env, { meta_page_id: page.id, meta_page_name: name });

    if (action === "subscribe") {
      await graph(env, token, `/${page.id}/subscribed_apps`, { method: "POST", query: { subscribed_fields: FIELDS }, retries: 1 });
      await log(env, "info", "connect", `Page ${name} subscribed to webhook fields: ${FIELDS}`);
    }
    // Listing subscriptions needs pages_manage_metadata; it is informational only.
    const apps = await graph<{ data: { id: string; name: string; subscribed_fields?: string[] }[] }>(env, token, `/${page.id}/subscribed_apps`, { retries: 0 })
      .then((r) => r.data ?? [])
      .catch(() => null);
    if (action === "test") await log(env, "info", "connect", `Connection test OK for ${name} (${page.id})`, { scopes: page.scopes });
    return json({ ok: true, page: { id: page.id, name }, scopes: page.scopes, expires: page.expires, subscribedApps: apps });
  } catch (e) {
    if (e instanceof Problem) {
      await log(env, "warn", "connect", e.message);
      return fail(422, e.message);
    }
    const g = e as GraphError;
    await log(env, "error", "connect", `Connection ${action} failed`, { error: g.message, code: g.code, status: g.status });
    const hint =
      g.status === 0
        ? " Could not reach Facebook; try again in a minute."
        : g.code === 190
          ? " The token is wrong or expired: generate a new one in Messenger API Settings and paste it again."
          : action === "subscribe" && (g.code === 200 || g.code === 100 || g.code === 10)
            ? " Subscribing needs the pages_manage_metadata permission: generate the Page token again and allow every permission, or turn on the Page under Webhooks in Meta (Messenger API Settings)."
            : g.code === 100 && !(s.meta_app_id && appSecret)
              ? " Fill in the App ID and App secret, save, and test again (that check needs no extra Page permission)."
              : "";
    return fail(422, `Meta said: ${g.message}${g.code ? ` (code ${g.code})` : ""}.${hint}`);
  }
};
