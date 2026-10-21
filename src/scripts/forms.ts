// Lead forms. If PUBLIC_FORM_ENDPOINT is set, the form posts JSON there
// (e.g. a Supabase edge function, Formspree, or a Cloudflare Worker).
// Without it, the form opens the visitor's email app with the details filled in.
const endpoint = import.meta.env.PUBLIC_FORM_ENDPOINT as string | undefined;
const fallbackEmail = "hello@ratulroy.com";

function setStatus(form: HTMLFormElement, msg: string, ok: boolean) {
  const el = form.querySelector<HTMLElement>(".form-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "var(--accent)" : "#dc2626";
}

document.querySelectorAll<HTMLFormElement>("form[data-lead-form]").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    // Honeypot: bots fill hidden fields, people don't.
    if (data.company_website) return;
    delete data.company_website;

    const type = form.dataset.leadForm ?? "contact";
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");

    if (!endpoint) {
      const subject = type === "audit" ? "Free SEO Audit request" : "New enquiry from ratulroy.com";
      const body = Object.entries(data)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      window.location.href = `mailto:${fallbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }

    button?.setAttribute("disabled", "");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...data, page: location.pathname }),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      setStatus(form, "Thanks! I'll get back to you within 48 hours.", true);
    } catch {
      setStatus(form, `Something went wrong. Please email ${fallbackEmail}.`, false);
    } finally {
      button?.removeAttribute("disabled");
    }
  });
});
