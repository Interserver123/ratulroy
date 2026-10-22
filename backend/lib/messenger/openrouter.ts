// OpenRouter chat-completions client. Retries 429/5xx once; never invents a reply.
import type { Env } from "../types";

export class AiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = (env: Env) => (env.OPENROUTER_BASE || "https://openrouter.ai/api/v1").replace(/\/$/, "");

export async function chat(
  env: Env,
  key: string,
  o: { model: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; json?: boolean; site?: string },
): Promise<{ text: string; model: string; usage?: unknown }> {
  let last: AiError | null = null;
  for (let i = 0; i < 2; i++) {
    if (i) await sleep(1200);
    let res: Response;
    try {
      res = await fetch(base(env) + "/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": o.site ?? "https://ratulroy.com",
          "X-Title": "Ratul Roy Messenger assistant",
        },
        body: JSON.stringify({
          model: o.model,
          messages: o.messages,
          temperature: o.temperature ?? 0.2,
          max_tokens: o.maxTokens ?? 700,
          ...(o.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    } catch (e) {
      last = new AiError(`Could not reach OpenRouter: ${(e as Error).message}`);
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
      model?: string;
      usage?: unknown;
    };
    if (!res.ok || data.error) {
      const hint =
        res.status === 401
          ? " (OpenRouter did not accept the API key: create a new key at openrouter.ai > Keys and paste it again)"
          : res.status === 402
            ? " (your OpenRouter account is out of credit: add credit at openrouter.ai > Credits)"
            : res.status === 404 || res.status === 400
              ? " (check the model name in Settings with “Check model name”)"
              : "";
      last = new AiError((data.error?.message || `OpenRouter HTTP ${res.status}`) + hint, res.status);
      if (res.status === 429 || res.status >= 500) continue;
      throw last;
    }
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new AiError("OpenRouter returned an empty answer");
    return { text, model: data.model ?? o.model, usage: data.usage };
  }
  throw last ?? new AiError("OpenRouter failed");
}

/** Extracts the first JSON object from a model answer (tolerates ```json fences). */
export function parseJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Public model list (used to validate the model name in admin). */
export async function listModels(env: Env): Promise<{ id: string; name: string }[]> {
  const res = await fetch(base(env) + "/models");
  if (!res.ok) throw new AiError(`OpenRouter HTTP ${res.status}`, res.status);
  const data = (await res.json()) as { data?: { id: string; name: string }[] };
  return (data.data ?? []).map((m) => ({ id: m.id, name: m.name }));
}
