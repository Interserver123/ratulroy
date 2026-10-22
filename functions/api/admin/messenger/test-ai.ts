// POST /api/admin/messenger/test-ai {message} — runs the real retrieval + OpenRouter
// pipeline as a dry run (nothing is sent to Messenger).
import type { Ctx } from "../../../../backend/lib/types";
import { fail, json, readJson, str } from "../../../../backend/lib/http";
import { getSecret, getSettings } from "../../../../backend/lib/messenger/settings";
import { answer } from "../../../../backend/lib/messenger/bot";
import { listModels } from "../../../../backend/lib/messenger/openrouter";
import { log } from "../../../../backend/lib/messenger/log";

export const onRequestPost = async ({ env, request }: Ctx) => {
  const body = await readJson(request, 4096);
  const message = str(body?.message, 1000);
  if (!message) return fail(400, "Type a test message");
  const key = await getSecret(env, "openrouter_key");
  if (!key) return fail(409, "Add the OpenRouter API key first.");
  const started = Date.now();
  try {
    const a = await answer(env, await getSettings(env), key, [], message, new URL(request.url).origin);
    return json({ ok: true, ...a, ms: Date.now() - started });
  } catch (e) {
    await log(env, "error", "ai", "Test AI failed", { error: (e as Error).message });
    return fail(422, `AI test failed: ${(e as Error).message}`);
  }
};

/** GET = list OpenRouter models (public endpoint) to validate the model name. */
export const onRequestGet = async ({ env }: Ctx) => {
  try {
    return json({ ok: true, models: (await listModels(env)).slice(0, 500) });
  } catch (e) {
    return fail(422, `Could not load models: ${(e as Error).message}`);
  }
};
