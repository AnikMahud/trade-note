# TradeLog Pro

React + Vite trading journal. Persists via Supabase. Falls back to localStorage if env keys missing.

## Main file to edit

**[src/App.jsx](src/App.jsx)** — UI + logic. Storage layer split into [src/storage.js](src/storage.js).

## Local dev

```bash
npm install
cp .env.example .env       # fill in Supabase URL + anon key
npm run dev                # http://localhost:3000
```

## Supabase setup

1. New project at supabase.com.
2. SQL Editor → paste [supabase/schema.sql](supabase/schema.sql) → Run.
3. Project Settings → API → copy `URL` + `anon public` key into `.env`.

## GitHub

```bash
git init
git add .
git commit -m "init: trade journal"
git branch -M main
git remote add origin git@github.com:USER/REPO.git
git push -u origin main
```

## Replit

1. Create Repl → Import from GitHub → pick repo.
2. Tools → Secrets → add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
3. Run. Webview shows app on port 3000.

## Files

- `src/App.jsx` — full UI (dashboard, journal, add/edit, detail)
- `src/storage.js` — Supabase + localStorage adapter
- `src/main.jsx` — React entry
- `supabase/schema.sql` — `trades` table + permissive RLS
- `.replit`, `replit.nix` — Replit runtime config
- `.env.example` — env var template
