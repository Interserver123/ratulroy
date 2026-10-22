# Messenger AI assistant

Replies to messages on your Facebook Page using only what your website says. When it doesn't know something, it asks a short question or hands the chat to you. You manage everything at **ratulroy.com/admin → Messenger**.

## How it works

1. Someone messages your Page. Meta sends the message to `https://ratulroy.com/api/messenger/webhook`.
2. The server checks Meta's signature (made with your App Secret). Unsigned or forged requests are rejected.
3. The message is saved. Repeat deliveries of the same message are ignored, and several quick messages get one answer.
4. The AI turns the question into English search words (this is how Bengali and Banglish are handled), then searches your website pages.
5. The AI answers only from those pages plus the "Extra facts" you write in Settings. It is told never to invent prices, offers, policies or services. As a second check, any money amount in the answer must appear on your website, otherwise the answer is replaced by your "can't answer" message and the chat is handed to you.
6. The reply is sent through Meta's Send API. If Meta refuses, the message is marked "Not delivered" with Meta's reason. It is never shown as sent.

The AI stops replying in a chat when:

- the person asks for a human, or taps **Talk to Ratul**;
- you reply from the admin inbox, or from the Facebook / Meta Business Suite inbox;
- the AI fails or hits the hourly limit for that person;
- you switch it off for that chat (**Take over**), or for everyone (the **AI replies** switch).

A chat goes back to the AI after the number of hours you set (default 24) with no reply from you. You can also press **Let AI reply again**.

**Meta's reply windows**

- The AI only answers new messages, so it is always inside Meta's 24-hour window.
- Your manual replies within 24 hours are normal replies.
- From 24 hours to 7 days, a reply is sent with the `HUMAN_AGENT` tag. This only works after Meta approves the Human Agent permission for your app.
- After 7 days, sending is blocked until the person writes again.

## One-time setup

You need four things:

- a Meta app;
- an OpenRouter key;
- two Cloudflare secrets;
- two GitHub secrets.

Do the steps in this order.

### 1. Cloudflare secrets

Go to Cloudflare → **Workers & Pages** → your project → **Settings** → **Variables and secrets**. Add these as type **Secret**, for **Production**:

| Name | Value |
| --- | --- |
| `APP_ENCRYPTION_KEY` | Any long random text, e.g. 40 random letters and numbers. It encrypts the keys you paste in admin. Never change it later, or you'll have to paste the keys again. |
| `CRON_SECRET` | Another long random text. It lets the daily refresh run. |

Then go to **Deployments**, open the "…" menu on the latest deployment, and choose **Retry deployment**.

**Optional:** instead of pasting secrets in admin, you can add them here as `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `OPENROUTER_API_KEY` and `META_VERIFY_TOKEN`. A value set in Cloudflare always wins over one pasted in admin.

### 2. OpenRouter key

1. Sign in at openrouter.ai.
2. Go to **Keys** → **Create key**.
3. Set a monthly credit limit (protects you from surprise bills), and add a few dollars of credit.
4. In admin → Messenger → **Settings** → Step 2, paste the key.
5. Keep the model `openai/gpt-4o-mini`, or choose another, then press **Check model name**. Cheaper or faster models work, but bigger models follow the "don't invent" rules more reliably.
6. Press **Save settings**.

### 3. Meta app

1. Go to developers.facebook.com → **My Apps** → **Create app**. Pick the use case for Messenger, e.g. "Engage with customers on Messenger from Meta". Business type also works.
2. In the app dashboard, open **App settings → Basic**.
   - Copy the **App ID** to admin → Settings → "App ID".
   - Press **Show** next to **App secret**, then copy it to "App secret".
   - Set **Privacy Policy URL** to `https://ratulroy.com/privacy-policy`. Meta requires it.
3. Open **Messenger → Messenger API Settings**.
   1. **Generate access tokens.** Connect your Facebook Page, then press **Generate**. Copy the token into admin → Settings → "Page access token", and press **Save settings**.
   2. In admin, press **Test connection**. You should see your Page's name. If Meta returns an error, the exact message is shown.
   3. **Configure webhooks.** Copy the **Callback URL** and **Verify token** from admin (use the Copy buttons) into Meta, then press **Verify and save**. Meta calls your site, and admin → Activity log shows "Webhook verified by Meta".
   4. In admin, press **Subscribe Page to webhook**. This subscribes your Page to `messages`, `messaging_postbacks` and `message_echoes`. Meta's own "Add subscriptions" button for the Page does the same.
4. In admin → **Knowledge & test**:
   1. Press **Rescan website**.
   2. Ask a few test questions in **Test the assistant**, in English and Bengali. Check that the answers only use facts from your site.
5. Turn on **AI replies** (the switch at the top).

**Who gets replies?**

- **Development mode (right after setup):** only people with a role on the app (Admin, Developer or Tester) get replies. Use this to test from your own Facebook account. Your account must not be the Page itself.
- **Live, for everyone:** in **App Review**, request **Advanced access** for `pages_messaging`. You may also need business verification. Meta asks for a short screen recording of the assistant answering. When it's approved, switch the app to **Live**.
- **Optional:** request the **Human Agent** permission if you want to reply from admin up to 7 days after a customer's last message.

### 4. Daily refresh (GitHub)

The website index refreshes every night via `.github/workflows/kb-refresh.yml`.

1. In GitHub → repository → **Settings** → **Secrets and variables** → **Actions**, add:
   - `SITE_URL`: `https://ratulroy.com`
   - `CRON_SECRET`: the same value as in Cloudflare
2. Scheduled runs only happen from the repository's default branch, so the workflow must be on that branch.
3. To run it now: go to **Actions** → "Refresh Messenger knowledge base" → **Run workflow**.

You can always rescan by hand in admin. A failed scan keeps the previous index.

## Things that break the webhook

- **Wrong domain.** Meta does not follow redirects. Use the exact final address that admin shows, e.g. `https://ratulroy.com/...`, not a `www.` version that redirects.
- **Cloudflare security challenges.** Bot Fight Mode, "Under Attack" mode or WAF challenges on `/api/messenger/*` will block Meta. If verification fails, add a WAF skip rule for that path.
- **A different App Secret.** If you change the App Secret in Meta, paste the new one in admin. Until you do, every event is rejected as "invalid signature" (see Activity log).
- **An expired Page token.** If the Page token stops working (you changed your Facebook password, or removed the app), generate a new one and paste it.

## Privacy

Messages are stored in your Cloudflare D1 database:

- conversations are kept in `mc_conversations` and `mc_messages`;
- the log keeps 30 days.

Message text is sent to OpenRouter and the model provider you pick, to write the answer. Add a line about this to your privacy policy, e.g. "Messages sent to our Facebook Page may be processed by an AI service to draft replies."

## Files

| Path | What it does |
| --- | --- |
| `functions/api/messenger/webhook.ts` | Meta verification (GET) and signed events (POST) |
| `functions/api/messenger/cron.ts` | Scheduled crawl, one batch per call, `Authorization: Bearer CRON_SECRET` |
| `functions/api/admin/messenger/*` | Admin API: settings, connection, test-ai, kb, conversations, logs (login required) |
| `backend/lib/messenger/bot.ts` | Event handling, handoff rules, grounded answer, price guard, reply windows |
| `backend/lib/messenger/kb.ts` | Sitemap crawl (HTMLRewriter), chunking, FTS5/BM25 search |
| `backend/lib/messenger/graph.ts` | Send API, sender actions, signature check, retries on 5xx/429 |
| `backend/lib/messenger/openrouter.ts` | OpenRouter client with one retry |
| `backend/lib/messenger/settings.ts` | Settings + AES-GCM encrypted secrets |
| `migrations/0002_messenger.sql` | Tables. Created automatically on first request; `npm run schema:gen` regenerates `backend/lib/schema.ts` after editing migrations |
| `src/scripts/admin-messenger.ts` | Admin Messenger tab |

## Testing

The sandbox tests use a local stand-in for Meta and OpenRouter (`scripts/messenger-mock.mjs`). That stand-in never runs in production.

```sh
npm run build
npm run messenger:mock          # terminal 1
npm run messenger:dev           # terminal 2 (local site wired to the mock)
npm run messenger:test          # terminal 3: 48 end-to-end checks
```

The checks cover:

- webhook verification, plus rejecting unsigned and forged events;
- duplicate deliveries and merging rapid messages;
- grounded replies, Bengali query rewriting and the invented-price guard;
- handoff by keyword and quick reply;
- a Page-inbox reply pausing the AI, and our own echoes being ignored;
- manual replies and the reply-window type;
- a Send API retry after a 500, and a permanent Send failure being recorded;
- the fallback on an AI outage, the global pause, the dry-run test, logs, and the cron endpoint and its secret.

The mock only proves the plumbing. The first real check against Meta and OpenRouter is setup steps 2–4 above:

1. **Check model name** and **Test the assistant** call OpenRouter for real.
2. **Test connection** and **Subscribe** call Meta for real.
3. Meta's **Verify and save** calls your webhook.
4. Finally, send a message to your Page from a tester account.
