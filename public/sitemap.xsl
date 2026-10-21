<?xml version="1.0" encoding="UTF-8"?>
<!-- Renders /sitemap.xml as a readable page in browsers. Search engines read the raw XML. -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes" />
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, follow" />
        <title>XML Sitemap · Ratul Roy</title>
        <link rel="icon" href="/favicon-32.png" />
        <style>
          :root { --bg:#f4f7f6; --paper:#fff; --ink:#0f1a1c; --muted:#5f6d6b; --line:#e1e8e5; --accent:#e8402f; --good:#0f9d63; }
          * { box-sizing: border-box; }
          body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
          .wrap { max-width:1100px; margin:0 auto; padding:56px 20px 80px; }
          .eyebrow { display:inline-flex; align-items:center; gap:8px; margin:0 0 10px; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
          .eyebrow::before { content:""; width:9px; height:9px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); background:var(--accent); }
          h1 { margin:0 0 10px; font-size:clamp(28px,4vw,42px); letter-spacing:-.03em; line-height:1.1; }
          p.lead { margin:0 0 28px; max-width:62ch; color:var(--muted); }
          .stats { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:24px; }
          .stat { padding:12px 16px; border-radius:14px; background:var(--paper); border:1px solid var(--line); }
          .stat b { display:block; font-size:22px; letter-spacing:-.02em; }
          .stat span { font-size:12px; color:var(--muted); }
          .card { overflow:hidden; border-radius:20px; background:var(--paper); border:1px solid var(--line); box-shadow:0 12px 32px -14px rgba(16,42,40,.16); }
          table { width:100%; border-collapse:collapse; }
          th, td { padding:12px 18px; text-align:left; border-bottom:1px solid var(--line); }
          th { font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); background:var(--bg); }
          td.n { width:56px; color:var(--muted); font-variant-numeric:tabular-nums; }
          td.d { width:140px; color:var(--muted); white-space:nowrap; font-variant-numeric:tabular-nums; }
          tr:last-child td { border-bottom:0; }
          tr:hover td { background:#fbfcfc; }
          a { color:var(--ink); text-decoration:none; overflow-wrap:anywhere; }
          a:hover { color:var(--accent); text-decoration:underline; }
          .foot { margin-top:18px; font-size:13px; color:var(--muted); }
          .foot a { color:var(--accent); }
          @media (max-width:640px) { td.n { display:none; } th.n { display:none; } td.d, th.d { width:auto; } th, td { padding:11px 14px; } }
        </style>
      </head>
      <body>
        <main class="wrap">
          <p class="eyebrow">XML Sitemap</p>
          <h1>Every page on ratulroy.com</h1>
          <p class="lead">This is the sitemap search engines use to discover and recrawl the site. It lists every public page, with the date it was last updated where one is known.</p>
          <div class="stats">
            <div class="stat"><b><xsl:value-of select="count(s:urlset/s:url)" /></b><span>URLs</span></div>
            <div class="stat"><b><xsl:value-of select="count(s:urlset/s:url[contains(s:loc,'/blog/')])" /></b><span>Blog posts</span></div>
            <div class="stat"><b><xsl:value-of select="count(s:urlset/s:url[contains(s:loc,'/industries/')])" /></b><span>Industry pages</span></div>
            <div class="stat"><b><xsl:value-of select="count(s:urlset/s:url[contains(s:loc,'/case-studies/')])" /></b><span>Case studies</span></div>
          </div>
          <div class="card">
            <table>
              <thead>
                <tr><th class="n">#</th><th>Page</th><th class="d">Last updated</th></tr>
              </thead>
              <tbody>
                <xsl:for-each select="s:urlset/s:url">
                  <tr>
                    <td class="n"><xsl:value-of select="position()" /></td>
                    <td><a href="{s:loc}"><xsl:choose><xsl:when test="substring-after(s:loc, 'ratulroy.com') = '/'">/ (homepage)</xsl:when><xsl:otherwise><xsl:value-of select="substring-after(s:loc, 'ratulroy.com')" /></xsl:otherwise></xsl:choose></a></td>
                    <td class="d"><xsl:choose><xsl:when test="s:lastmod"><xsl:value-of select="s:lastmod" /></xsl:when><xsl:otherwise>—</xsl:otherwise></xsl:choose></td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </div>
          <p class="foot">Submit <a href="/sitemap.xml">https://ratulroy.com/sitemap.xml</a> in Google Search Console and Bing Webmaster Tools. <a href="/">Back to the homepage →</a></p>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
