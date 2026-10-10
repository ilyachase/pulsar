# Pulsar

A Chrome extension that shows unread emails from **Gmail** and **Yandex Mail**. The icon badge shows the unread count, the popup lists the emails grouped by account, and clicking an email opens it in a new tab.

It uses the browser session you're already signed in with: no passwords or OAuth. Mail is checked every 30 seconds.

## Install

```bash
npm install
npm run build
```

Then go to `chrome://extensions`, turn on Developer mode, click "Load unpacked", and pick `.output/chrome-mv3`.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Separate Chrome with the extension and hot reload |
| `npm run build` | Production build into `.output/chrome-mv3` |
| `npm run zip` | Archive for the Chrome Web Store |
| `npm test` | Adapter tests (Vitest, fixtures in `tests/fixtures`) |
| `npm run compile` | TypeScript type check |
| `npm run lint` / `npm run format` | Biome |

Stack: [WXT](https://wxt.dev) (Vite), TypeScript, fast-xml-parser, Vitest, Biome.

## How it works

```
entrypoints/background.ts   alarm every 30 s → adapters → storage.local + badge
entrypoints/popup/          list from storage.local, the ⟳ button triggers a check right away
lib/providers/gmail.ts      https://mail.google.com/mail/u/N/feed/atom, N = 0, 1, … until an account repeats
lib/providers/yandex.ts     ckey from the mail.yandex.ru HTML → POST /web-api/models/liza1 (messages, only_new)
lib/badge.ts                badge text, color, and tooltip
```

To add a provider, write `lib/providers/<name>.ts` with an `async () => Account[]` function and add it to `lib/providers/index.ts`.

**Yandex** has no public API, so the adapter uses the same internal API as the mail web interface. The request format is described at the top of `yandex.ts`. If Yandex changes it, the account shows "Ошибка", and the fix stays inside that one file. The extension sets `Origin`/`Referer` to the mail domain itself (a session `declarativeNetRequest` rule) on its own requests to the mail service.

## Limitations

- Gmail: only unread emails in "Inbox", at most 20 per account (a limit of the Atom feed).
- Yandex: one account (whichever is active in the browser session).
