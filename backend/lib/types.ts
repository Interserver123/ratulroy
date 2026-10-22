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
  /** One-time key that lets you create the first admin account at /admin. */
  SETUP_KEY?: string;
  /** Optional webhook (Discord/Slack/Google Chat) pinged on each new lead. */
  NOTIFY_WEBHOOK_URL?: string;

  // ---- Messenger auto-reply (see docs/MESSENGER.md). All optional: the admin
  // screen can store these encrypted instead. A value set here always wins.
  /** Key that encrypts secrets saved from the admin screen (falls back to IP_SALT). */
  APP_ENCRYPTION_KEY?: string;
  META_APP_SECRET?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
  OPENROUTER_API_KEY?: string;
  /** Shared secret for the scheduled knowledge-base refresh (GitHub Actions). */
  CRON_SECRET?: string;
  /** Test-only overrides so the integration can run against local mock servers. */
  META_GRAPH_BASE?: string;
  OPENROUTER_BASE?: string;
  /** Static asset binding Cloudflare Pages provides to Functions. */
  ASSETS?: { fetch: (input: Request | string) => Promise<Response> };
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
