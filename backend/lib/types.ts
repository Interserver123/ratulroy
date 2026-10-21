// Minimal Cloudflare types (no extra dependency needed).
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(col?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  DB: D1Database;
  /** Secret used to hash IPs. Set in Pages > Settings > Variables and secrets. */
  IP_SALT?: string;
  /** Optional webhook (Discord/Slack/Google Chat) pinged on each new lead. */
  NOTIFY_WEBHOOK_URL?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "editor";
}

export interface Ctx<P extends string = string> {
  request: Request & { cf?: { country?: string; city?: string } };
  env: Env;
  params: Record<P, string>;
  data: { user?: AdminUser; ipHash?: string };
  next: () => Promise<Response>;
  waitUntil: (p: Promise<unknown>) => void;
}
