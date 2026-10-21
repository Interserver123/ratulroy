// GET /api/admin/me
import type { Ctx } from "../../../backend/lib/types";
import { json } from "../../../backend/lib/http";

export const onRequestGet = async ({ data }: Ctx) => json({ ok: true, user: data.user });
