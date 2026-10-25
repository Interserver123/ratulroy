# Homepage: what only you can add

The homepage now uses only facts that are already on the site. These additions would strengthen E-E-A-T (experience, expertise, trust) more than any rewrite. Fill in the brackets and send them over, or edit the files listed.

| # | Where | Add | File |
| --- | --- | --- | --- |
| 1 | About ("Ratul Roy, Local SEO specialist") | One short story: `[the first business you ranked, what you changed, what happened]` | `src/components/home/About.astro` |
| 2 | Case studies | For each case: `[business type]`, `[city]`, `[start → end dates]`, `[the one change that moved results most]` | `src/data/home.ts` → `caseStudies` |
| 3 | Below case studies | 2–3 client quotes: `"[quote]" — [name], [business], [city]`. Only with the client's written OK. | new block in `CaseStudies.astro` |
| 4 | Why work with me | A mistake you see often: `[what most SEO agencies in Bangladesh get wrong]` and `[what you do instead]` | `src/components/home/Strategy.astro` |
| 5 | FAQ | `[typical time to first Map Pack movement in your projects]` and `[what a month of work includes]` | `src/data/home.ts` → `faqs` |
| 6 | Results | A photo of you at work, or a short Loom of a real report (`[link]`) | `Results.astro` |

Rules:

- Use real names and numbers only. If a client won't be named, write "a plumbing company in Dhaka", never a made-up name.
- Keep sentences short. One idea each.
- No placeholders go live. Anything still in brackets stays out.
