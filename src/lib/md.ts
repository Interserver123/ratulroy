// Tiny inline markdown for content strings: [text](href), **bold**, *em*. Everything else is escaped.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function md(s = ""): string {
  return esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => {
      const ext = /^https?:/.test(h);
      return `<a href="${h}"${ext ? ' rel="noopener" target="_blank"' : ""}>${t}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/** Plain text (for schema / meta), with markdown links reduced to their label. */
export function plain(s = ""): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1");
}
