// Minimal Meta Graph API client for the Messenger Platform (Send API, sender actions,
// profile lookup, page subscription). Retries transient failures; never fakes success.
import type { Env } from "../types";

export const GRAPH_VERSION = "v21.0";
const base = (env: Env) => (env.META_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "") + "/" + GRAPH_VERSION;

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errors worth retrying: network, 5xx, 429, and Graph "temporary" codes (1, 2, 4, 17, 32, 613). */
function transient(e: unknown) {
  if (!(e instanceof GraphError)) return true;
  return e.status >= 500 || e.status === 429 || [1, 2, 4, 17, 32, 613].includes(e.code ?? -1);
}

export async function graph<T = Record<string, unknown>>(
  env: Env,
  token: string,
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string>; body?: unknown; retries?: number } = {},
): Promise<T> {
  const url = new URL(base(env) + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const attempts = (opts.retries ?? 2) + 1;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(400 * 3 ** (i - 1));
    try {
      const res = await fetch(url.toString(), {
        method: opts.method ?? "GET",
        headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 300) };
      }
      if (!res.ok || data.error) {
        const err = (data.error ?? {}) as { message?: string; code?: number; error_subcode?: number };
        throw new GraphError(err.message || `Graph API HTTP ${res.status}`, res.status, err.code, err.error_subcode, data);
      }
      return data as T;
    } catch (e) {
      last = e;
      if (!transient(e)) break;
    }
  }
  if (last instanceof GraphError) throw last;
  throw new GraphError(`Could not reach Meta Graph API: ${(last as Error)?.message ?? "network error"}`, 0);
}

/** Sent with every message this app sends, so its echo can be recognised as ours. */
export const OUR_METADATA_PREFIX = "rr-";

export type SendResult = { recipient_id: string; message_id: string };

/** Sends one text message. `tag` is only for human replies outside the 24h window. */
export function sendText(env: Env, token: string, psid: string, text: string, o: { tag?: "HUMAN_AGENT"; quickReplies?: { title: string; payload: string }[]; metadata?: "rr-bot" | "rr-admin" } = {}) {
  const message: Record<string, unknown> = { text };
  if (o.metadata) message.metadata = o.metadata;
  if (o.quickReplies?.length) message.quick_replies = o.quickReplies.map((q) => ({ content_type: "text", title: q.title.slice(0, 20), payload: q.payload }));
  return graph<SendResult>(env, token, "/me/messages", {
    method: "POST",
    body: o.tag ? { recipient: { id: psid }, messaging_type: "MESSAGE_TAG", tag: o.tag, message } : { recipient: { id: psid }, messaging_type: "RESPONSE", message },
  });
}

/** typing_on / typing_off / mark_seen. Best effort: failures are ignored. */
export async function senderAction(env: Env, token: string, psid: string, action: "typing_on" | "typing_off" | "mark_seen") {
  try {
    await graph(env, token, "/me/messages", { method: "POST", body: { recipient: { id: psid }, sender_action: action }, retries: 0 });
  } catch {
    /* not important */
  }
}

/** Splits long text at paragraph/sentence boundaries (Messenger limit: 2000 chars). */
export function splitMessage(text: string, max = 1900): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    const cut = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("। "), slice.lastIndexOf("\n"));
    const at = cut > max * 0.5 ? cut + 1 : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Name of a Messenger user (needs pages_messaging; may be blocked by privacy settings). */
export async function userName(env: Env, token: string, psid: string): Promise<string | null> {
  try {
    const u = await graph<{ first_name?: string; last_name?: string; name?: string }>(env, token, `/${encodeURIComponent(psid)}`, {
      query: { fields: "first_name,last_name" },
      retries: 0,
    });
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name || null;
  } catch {
    return null;
  }
}

/** HMAC-SHA256 of the raw body with the App Secret, compared in constant time. */
export async function validSignature(appSecret: string, rawBody: ArrayBuffer, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7).toLowerCase();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
