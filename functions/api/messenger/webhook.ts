// Meta Messenger webhook: https://<your-domain>/api/messenger/webhook
// GET  = Meta's one-time verification handshake (hub.verify_token must match).
// POST = message events, accepted only with a valid X-Hub-Signature-256 from your App Secret.
import type { Ctx } from "../../../backend/lib/types";
import { getSecret, verifyToken } from "../../../backend/lib/messenger/settings";
import { validSignature } from "../../../backend/lib/messenger/graph";
import { handleEvent, type WebhookBody } from "../../../backend/lib/messenger/bot";
import { log } from "../../../backend/lib/messenger/log";
import { safeEqual } from "../../../backend/lib/crypto";

const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const onRequestGet = async ({ request, env }: Ctx) => {
  const q = new URL(request.url).searchParams;
  const expected = await verifyToken(env);
  if (q.get("hub.mode") === "subscribe" && q.get("hub.challenge") && safeEqual(q.get("hub.verify_token") ?? "", expected)) {
    await log(env, "info", "webhook", "Webhook verified by Meta");
    return text(q.get("hub.challenge")!.slice(0, 200));
  }
  await log(env, "warn", "webhook", "Webhook verification failed (wrong verify token)");
  return text("Forbidden", 403);
};

export const onRequestPost = async ({ request, env, waitUntil }: Ctx) => {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 1_000_000) return text("Too large", 413);

  const secret = await getSecret(env, "meta_app_secret");
  if (!secret) {
    await log(env, "error", "webhook", "Event rejected: App Secret is not configured, so the signature cannot be checked");
    return text("Not configured", 503);
  }
  if (!(await validSignature(secret, raw, request.headers.get("X-Hub-Signature-256")))) {
    await log(env, "warn", "webhook", "Event rejected: invalid signature");
    return text("Invalid signature", 403);
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return text("Bad JSON", 400);
  }
  if (body.object !== "page") return text("Ignored", 200);

  const site = new URL(request.url).origin;
  const events = (body.entry ?? []).flatMap((e) => e.messaging ?? []);
  // Answer Meta immediately (it retries slow or failed deliveries); work continues in the background.
  waitUntil(
    Promise.all(
      events.map((ev) =>
        handleEvent(env, ev, site).catch((e) => log(env, "error", "bot", "Event processing failed", { error: (e as Error).message, stack: (e as Error).stack })),
      ),
    ),
  );
  return text("EVENT_RECEIVED");
};
