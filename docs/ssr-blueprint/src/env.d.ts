/// <reference types="astro/client" />
// Bindings available via `import { env } from "cloudflare:workers"`.
// `npx wrangler types` generates this automatically from wrangler.jsonc.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CONTENT_API: string;
  }
}
interface Env extends Cloudflare.Env {}
