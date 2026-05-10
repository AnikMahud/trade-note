# Mahmudur · Trade Note

React + Vite trading journal. **Backend = Notion** via Vercel serverless functions.

## Architecture

- `src/` → frontend (Vite + React)
- `api/trades.js` → Vercel serverless function. Talks to Notion API.
- Notion database = source of truth.
- Screenshots stored in browser localStorage (Notion can't hold base64 cleanly).

## Main file to edit

**[src/App.jsx](src/App.jsx)** — UI + logic.

## Notion setup (one-time)

### 1. Create integration

1. Go to https://www.notion.so/my-integrations
2. **+ New integration**. Name: `Trade Note`. Pick workspace. Type: Internal. Submit.
3. Copy **Internal Integration Secret** (starts `secret_...` or `ntn_...`). This is `NOTION_TOKEN`.

### 2. Create database

1. In Notion, new page → type `/database` → **Database - Inline**.
2. Name it "Trades".
3. Add these properties (exact names, case-sensitive):

| Name      | Type        | Notes |
|-----------|-------------|-------|
| ID        | Title       | (default title column — rename to `ID`) |
| Date      | Date        |
| Time      | Text        |
| Symbol    | Text        |
| Direction | Select      | options: Long, Short |
| Setup     | Select      | options: Breakout, Pullback, Reversal, Momentum, Gap Fill, VWAP Reclaim, Support/Resistance, Earnings, Scalp, Other |
| Entry     | Number      |
| Exit      | Number      |
| Size      | Number      |
| PnL       | Number      |
| RMultiple | Number      |
| Grade     | Select      | options: A+, A, B, C, D |
| Emotion   | Select      | options: Disciplined, Confident, Neutral, Anxious, FOMO, Revenge, Impatient, Overconfident |
| Notes     | Text        |

### 3. Share database with integration

1. Open the database page → top-right `⋯` menu → **Connections** → **Connect to** → pick `Trade Note`.

### 4. Get database ID

1. Open database as full page → copy URL.
2. URL pattern: `https://www.notion.so/<workspace>/<DATABASE_ID>?v=...`
3. The 32-char hex chunk before `?v=` is `NOTION_DATABASE_ID`.

## Vercel env vars

Project → Settings → Environment Variables. Add:

- `NOTION_TOKEN` — secret from step 1
- `NOTION_DATABASE_ID` — id from step 4
- `VITE_APP_PIN` — your access PIN (e.g. `7392`)

Then **Deployments → Redeploy** so functions pick up env.

## Local dev

```bash
npm install
cp .env.example .env  # fill values
npm run dev           # http://localhost:3000
```

Note: `/api/*` only runs on Vercel. Local dev = no Notion calls (use `vercel dev` if needed: `npm i -g vercel && vercel dev`).
