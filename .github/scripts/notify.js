// Polls the deployed dip-buy scanner and sends a WhatsApp alert (via CallMeBot)
// for any ticker whose buySignal just turned true. Runs from GitHub Actions
// on a schedule; self-gates on actual US/Eastern market hours so the cron
// trigger doesn't need to account for DST.
import { readFileSync, writeFileSync, existsSync } from "fs";

const SCANNER_URL = "https://trade-note-phi.vercel.app/api/scanner";
const STATE_FILE = new URL("../scanner-state.json", import.meta.url);

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret");
}

function isMarketHoursNY() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const minutesNow = hour * 60 + minute;
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const afterOpen = minutesNow >= 9 * 60 + 30;
  const beforeClose = minutesNow < 16 * 60;
  return isWeekday && afterOpen && beforeClose;
}

function todayNY() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { date: todayNY(), notified: [] };
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  if (state.date !== todayNY()) return { date: todayNY(), notified: [] };
  return state;
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
}

async function main() {
  if (!isMarketHoursNY()) {
    console.log("Outside market hours, skipping.");
    return;
  }

  const state = loadState();
  const r = await fetch(SCANNER_URL);
  if (!r.ok) throw new Error(`Scanner HTTP ${r.status}`);
  const { results } = await r.json();

  const fresh = (results || []).filter(
    (row) => row.buySignal && !state.notified.includes(row.ticker)
  );

  for (const row of fresh) {
    const msg =
      `BUY signal: ${row.ticker} @ $${row.close}\n` +
      `Stop: $${row.stopPrice} (${row.stopDistance} away)\n` +
      `Pullback: ${row.pullbackPct}% | RSI: ${row.rsi}`;
    await sendTelegram(msg);
    state.notified.push(row.ticker);
    console.log(`Notified: ${row.ticker}`);
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

  if (fresh.length === 0) {
    console.log("No new signals this run.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
