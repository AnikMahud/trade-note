# Mahmudur TradeVault — Agent Briefing

Read this first. Saves context-rebuild time on every new session/machine.

## What it is

Personal trading journal + analytics. Live at https://trade-note-mahmudur-s-projects1.vercel.app/ — single user (Mahmudur).

## Stack

- Frontend: Vite + React 18 (no router; views switched via local state)
- Charting: Recharts
- Hosting: Vercel (auto-deploy on push to `main`)
- Backend: Vercel serverless functions in `/api/*.js` (Node 18+, global `fetch`/`FormData`/`Blob`)
- Database: Notion API via `@notionhq/client`
- File storage: Notion file_upload API (screenshots)
- Source: `https://github.com/AnikMahud/trade-note` (public)

No build step on Vercel for `/api` — they run as serverless functions directly.

## Notion databases

All under parent page `35c052c8-3594-8035-900b-cbe285292b6c`. All shared with integration `Trade Note`.

| DB | Env var | Properties |
|---|---|---|
| Trades | `NOTION_DATABASE_ID` | ID (title), Date, Time, Symbol, Direction (select), Setup (select), Entry, Exit, Size, PnL, RMultiple, Grade (select), Emotion (select), Notes, Image (files) |
| Targets | `NOTION_TARGETS_DB_ID` | Step (title), Done (checkbox), CompletedAt (date), Note |
| Strategy | `NOTION_STRATEGY_DB_ID` | ID (title), Type (select: Rule/Lesson), Order, Text |
| Ledger | `NOTION_LEDGER_DB_ID` | ID (title), Date, Type (select: Starting/Deposit/Withdrawal/Adjustment), Amount, Note |

To inspect DB IDs in a session: `curl -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2022-06-28" "https://api.notion.com/v1/search" -d '{"filter":{"property":"object","value":"database"}}'`.

## Env vars (live in Vercel project)

Server-side (no `VITE_` prefix; only visible to functions):
- `NOTION_TOKEN` — integration secret, `ntn_...`
- `NOTION_DATABASE_ID`, `NOTION_TARGETS_DB_ID`, `NOTION_STRATEGY_DB_ID`, `NOTION_LEDGER_DB_ID`, `NOTION_PORTFOLIO_DB_ID` — 32-char hex, no dashes
- `AUTH_USERS` — JSON array of accounts: `[{"username","password","tag","label"}, ...]`. **First entry is the primary/legacy account** — any existing Notion row with no `User` property is treated as theirs (see Multi-user below).
- `AUTH_TOKEN_SECRET` — random secret (`openssl rand -hex 32`) used to HMAC-sign session tokens issued by `api/auth.js`.

No client-side (`VITE_`) secrets — login is the only access gate, checked server-side.

## Multi-user

Two independent accounts, each with their own username + password, each seeing only their own data — like two separate journals sharing one deployment.

- **Login:** `api/auth.js` checks credentials against `AUTH_USERS`, issues an HMAC-signed token (`lib/auth.js`, 90-day expiry). Frontend stores it in `localStorage` (`src/auth.js`, key `tn-auth`) and sends it as the `x-tn-auth` header on every API call via `authFetch()`. `lib/` sits outside `api/` on purpose — Hobby plan caps deployments at 12 Serverless Functions, and anything inside `api/*.js` counts against that regardless of an underscore prefix; shared server code that isn't its own route must live outside `api/`.
- **Data isolation:** Trades, Ledger, Strategy, Targets, and Portfolio Notion DBs each get a `User` select property (added automatically on first request — `ensureUserProperty()`, same pattern as the Portfolio `Market` field). Every query/write is scoped server-side by the token's `tag`; the frontend never chooses which user's data it sees.
- **Legacy data:** rows written before multi-user support have no `User` value. The **primary** account (first entry in `AUTH_USERS`) matches those via an `is_empty` fallback in `userScopeFilter()`, so old data was never rewritten and needs no migration. The second account only ever matches its own tagged rows.
- **Not shared per-account** (same for both users — global tools, not personal data): Scanner (`api/scanner*.js`, watches a fixed market-wide watchlist), quotes (`api/quote.js`), and market-open/close notify (`api/notify.js`).
- **Per-browser caches** (`localStorage`) are namespaced by tag via `scopedKey()` — trades cache and portfolio holdings cache — so two accounts on the same browser/device never bleed into each other.
- **Logout:** header button clears the token and returns to the login screen.
- **No separate write-action PIN anymore.** There used to be a second shared PIN gate (`VITE_APP_PIN`) on top of login; it was redundant with real per-account auth and has been removed. `requireUnlock()` still wraps every write path by name (for future gating if ever needed) but currently just calls the action directly.

## Files

- `index.html` — viewport meta + iOS PWA tags + favicon link
- `src/main.jsx` — React entry
- `src/App.jsx` — entire UI (~1700 lines). Single component tree. Views: dashboard, journal, add, edit, detail, strategy, target.
- `src/storage.js` — frontend ↔ `/api/trades` adapter, screenshot compression
- `api/trades.js` — Trades CRUD; upserts by ID (title) field
- `api/upload.js` — base64 dataURL → Notion file_upload → returns id. Used before `/api/trades` POST when there's a fresh screenshot.
- `api/targets.js` — Targets CRUD (50 compound steps, completion state)
- `api/strategy.js` — Strategy rules + lessons CRUD
- `api/ledger.js` — Account equity ledger CRUD
- `public/logo.webp` — 152KB. Brand mark used in header + login screen.
- `public/favicon.png`, `public/apple-touch-icon.png`
- `vercel.json` — framework=vite, build=npm run build, output=dist
- `samples.html` + `old-money-palettes.pdf` — palette exploration archive (not used at runtime)

## Conventions

- All inline styles in `src/App.jsx`. Style sheet object `styles`/`S`. Some media-query behavior via `isMobile` state (`window.innerWidth < 640`), with mobile/desktop branches.
- Header is 2-row on mobile (logo bar + tab strip, sticky-positioned), single-row on desktop.
- Write actions (New Trade nav, Edit, Delete, Strategy add/edit/delete, Target toggle, Ledger add/delete) route through `requireUnlock()`; login is the only gate now (see Multi-user).
- Toast: `showToast(msg, "ok"|"err")` shows bottom-center for 3.5s.
- Numeric inputs/values use `JetBrains Mono`. Headings use `Cormorant Garamond` italic. Caps labels use `Cinzel`. Body uses `Manrope`.
- Color tokens (Yacht Club Navy palette):
  - `G = "#a5b285"` (sage, wins)
  - `R = "#8a4339"` (oxblood, losses)
  - `GOLD = "#c6a44c"` (brass, brand)
- All time-sensitive Notion file URLs are signed and expire ~1h. Frontend `onImgError` handler in `TradingJournal` refetches trades silently to renew URLs.

## Deploy

`git push origin main` → Vercel auto-builds. Build = `npm run build` (Vite). Functions deploy automatically.

Manual deploy hook (no token needed):
```
curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_jj7cq1NT6EF6WzBlckMNXOFnFGHD/GGSiHmqUyv"
```

Force redeploy needed after changing env vars (env applies only to new deploys).

## Vercel project notes

- Project ID: `prj_jj7cq1NT6EF6WzBlckMNXOFnFGHD`
- Team: `mahmudur's projects` / `team_QbxqzdAEMtIGtPr7ketMeuBh`
- Hobby plan. Repo must be PUBLIC (Hobby blocks deploys on private repos with non-matching commit author).
- Deployment Protection: must be set to "Standard" (or null `ssoProtection`) so production is publicly reachable.

## Local dev

```bash
npm install
cp .env.example .env  # fill in values (copy from Vercel env page)
npm run dev           # http://localhost:3000
```

`/api/*` only runs on Vercel deployments. For local function dev: `npx vercel dev`.

## Things to never do

- **Don't touch existing Notion data** when shipping changes. Run code-only changes by default. Schema migrations require explicit user OK.
- **Don't commit `.env`** (in `.gitignore`). Don't paste tokens into source.
- **Don't switch backend away from Notion** without explicit ask. User has all history there.
- **Don't bypass login** for any API route that touches personal data (trades/ledger/strategy/targets/portfolio) — always go through `requireUser()`/`userScopeFilter()` in `lib/auth.js`.
- **Don't break image preservation on edit.** When user edits a trade without touching screenshots, the API call must NOT include `Image` in properties → Notion preserves existing files. Only set `Image` when `screenshotsTouched: true`.

## Feature inventory (so future agents know what exists)

- Dashboard: KPIs, equity curve, daily P&L, advanced metrics, top symbols, setup perf, **streak warning banner**, **calendar heatmap**, **account equity card**
- Journal: filterable table + **CSV export** button
- Trade detail: gallery + lightbox with arrow nav
- Add/Edit Trade: **pre-trade checklist** (mandatory checkboxes from Strategy rules before Save), multi-image upload, screenshot compression
- Strategy: editable rules + lessons (via Notion `Strategy` DB), SVG setup diagram (HIGH/OTE/DEMAND/TP), key-reminder banner
- Target: 50-step compound table with checkboxes, persisted to Notion `Targets` DB
- Account equity: Ledger entries (Starting/Deposit/Withdrawal/Adjustment) + computed equity, history accordion
- PWA install: viewport + apple-touch-icon set

## Commit style observed in history

`type: short summary` — lowercase, no period. e.g.
- `feat: account equity tracker via Notion Ledger DB`
- `fix: show toast + disable save while writing`
- `ui: scroll inside rules/lessons cards when content overflows`
- `chore: replace logo.png with updated version`

Co-author trailer: omit (single-user project).
