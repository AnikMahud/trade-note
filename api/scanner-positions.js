// Serves the shared position ledger (.github/scanner-state.json) so every
// browser/device shows the same Scanner tab state — the same source the
// GitHub Action (.github/scripts/notify.js) tracks and Telegram-alerts from.
// Fetched from raw.githubusercontent.com with a cache-busting query param
// since that CDN ignores request Cache-Control and caches by URL.
const STATE_URL = "https://raw.githubusercontent.com/AnikMahud/trade-note/main/.github/scanner-state.json";

export default async function handler(req, res) {
  try {
    const r = await fetch(`${STATE_URL}?t=${Date.now()}`);
    if (!r.ok) throw new Error(`GitHub raw HTTP ${r.status}`);
    const state = await r.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ date: state.date, positions: state.positions || [] });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: e.message || "failed to load position state" });
  }
}
