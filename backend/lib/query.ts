import { FORMS, STATUSES } from "./leads";

/** Builds a safe WHERE clause from list filters (all values are bound, never interpolated). */
export function leadFilters(url: URL): { where: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  const status = url.searchParams.get("status");
  if (status === "open") parts.push("status IN ('new','contacted','qualified','proposal')");
  else if (status && STATUSES.includes(status as never)) {
    parts.push("status = ?");
    args.push(status);
  } else if (status !== "all") parts.push("status != 'spam'");
  const form = url.searchParams.get("form");
  if (form && FORMS.includes(form as never)) {
    parts.push("form = ?");
    args.push(form);
  }
  const q = url.searchParams.get("q")?.trim().slice(0, 100);
  if (q) {
    parts.push("(name LIKE ? OR email LIKE ? OR business LIKE ? OR website LIKE ? OR phone LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like, like, like);
  }
  if (url.searchParams.get("due") === "1") {
    parts.push("next_follow_up IS NOT NULL AND next_follow_up <= ? AND status NOT IN ('won','lost','spam')");
    args.push(new Date().toISOString().slice(0, 10));
  }
  return { where: parts.length ? `WHERE ${parts.join(" AND ")}` : "", args };
}

const SORTS: Record<string, string> = {
  newest: "created_at DESC",
  oldest: "created_at ASC",
  followup: "next_follow_up IS NULL, next_follow_up ASC",
  value: "COALESCE(value_estimate,0) DESC, created_at DESC",
  priority: "CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at DESC",
};
export const sortSql = (key: string | null) => SORTS[key ?? ""] ?? SORTS.newest;
