// Shared HTTP helpers for Pages Functions. Every API response is noindex + no-store.
export const baseHeaders: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, ...extra }, status);

/** Reads a JSON body with a size cap. Returns null on bad/oversized input. */
export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 16_384): Promise<T | null> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.includes("application/json")) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

/** Blocks cross-site POST/PATCH/DELETE (CSRF): the Origin must match the request host. */
export function sameOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ?? "0.0.0.0";
}

/** Trims a value to a clean string with a max length, or null. */
export function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return s ? s.slice(0, max) : null;
}
