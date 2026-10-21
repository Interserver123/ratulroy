// Lead forms → POST /api/leads (Cloudflare Pages Function + D1, see docs/BACKEND.md).
// PUBLIC_FORM_ENDPOINT can override the endpoint. If the backend is unavailable
// (network error, 5xx, not configured), the form falls back to the visitor's email app,
// so an enquiry is never lost.
const endpoint = (import.meta.env.PUBLIC_FORM_ENDPOINT as string | undefined) || "/api/leads";
const fallbackEmail = "hello@ratulroy.com";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

function setStatus(form: HTMLFormElement, msg: string, ok: boolean) {
  const el = form.querySelector<HTMLElement>(".form-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "var(--good)" : "var(--accent)";
}

/** First-touch attribution stored by the motion script (sessionStorage), plus current URL params. */
function attribution(): Record<string, string> {
  const out: Record<string, string> = {};
  let stored: Record<string, string> = {};
  try {
    stored = JSON.parse(sessionStorage.getItem("rr_attr") || "{}");
  } catch {
    /* storage blocked */
  }
  const params = new URLSearchParams(location.search);
  for (const k of UTM_KEYS) {
    const v = stored[k] || params.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  out.referrer = (stored.referrer || document.referrer || "").slice(0, 500);
  return out;
}

function mailtoFallback(type: string, data: Record<string, string>) {
  const subject = type === "audit" ? "Free SEO Audit request" : type === "strategy-call" ? "Strategy call request" : "New enquiry from ratulroy.com";
  const body = Object.entries(data)
    .filter(([k, v]) => v && !["company_website"].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  window.location.href = `mailto:${fallbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const started = new WeakMap<HTMLFormElement, number>();

document.querySelectorAll<HTMLFormElement>("form[data-lead-form]").forEach((form) => {
  // Time from first interaction to submit helps the server spot bots.
  form.addEventListener("focusin", () => started.has(form) || started.set(form, Date.now()), { once: false });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const type = form.dataset.leadForm ?? "contact";
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    const payload = {
      type,
      ...data,
      page: location.pathname,
      elapsed_ms: started.has(form) ? Date.now() - started.get(form)! : undefined,
      ...attribution(),
    };

    button?.setAttribute("disabled", "");
    setStatus(form, "Sending…", true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        form.reset();
        started.delete(form);
        setStatus(form, "Thanks! I'll get back to you within 48 hours.", true);
        return;
      }
      const err = await res.json().catch(() => ({}));
      if (res.status === 422 || res.status === 429) {
        const first = err.fields ? Object.values(err.fields)[0] : null;
        setStatus(form, String(first || err.error || "Please check the form."), false);
        return;
      }
      throw new Error(String(res.status));
    } catch {
      // Backend unreachable or not configured: hand over to the email app instead.
      setStatus(form, `Opening your email app… or email ${fallbackEmail}`, false);
      mailtoFallback(type, data);
    } finally {
      button?.removeAttribute("disabled");
    }
  });
});
