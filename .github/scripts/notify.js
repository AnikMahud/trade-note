// Polls the deployed dip-buy scanner and sends a Telegram alert for any
// ticker whose buySignal just turned true, plus a market-open and
// market-close status message. Runs from GitHub Actions on a schedule;
// self-gates on actual US/Eastern market time so the cron trigger doesn't
// need to account for DST.
import { readFileSync, writeFileSync, existsSync } from "fs";

const SCANNER_URL = "https://trade-note-phi.vercel.app/api/scanner";
const STATE_FILE = new URL("../scanner-state.json", import.meta.url);

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret");
}

const OPEN_MIN = 9 * 60 + 30; // 9:30am ET
const CLOSE_MIN = 16 * 60; // 4:00pm ET
const WINDOW = 15; // minutes — matches the cron interval, catches one run per boundary

function nyTimeInfo() {
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
  const minutesNow = Number(get("hour")) * 60 + Number(get("minute"));
  return {
    isWeekday: !["Sat", "Sun"].includes(weekday),
    minutesNow,
    inMarketHours: minutesNow >= OPEN_MIN && minutesNow < CLOSE_MIN,
    atOpen: minutesNow >= OPEN_MIN && minutesNow < OPEN_MIN + WINDOW,
    atClose: minutesNow >= CLOSE_MIN && minutesNow < CLOSE_MIN + WINDOW,
  };
}

function todayNY() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function loadState() {
  const fresh = { date: todayNY(), notified: [], openNotified: false, closeNotified: false };
  if (!existsSync(STATE_FILE)) return fresh;
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  if (state.date !== fresh.date) return fresh;
  return { ...fresh, ...state };
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
  const time = nyTimeInfo();
  if (!time.isWeekday) {
    console.log("Weekend, skipping.");
    return;
  }

  const state = loadState();

  if (time.atOpen && !state.openNotified) {
    await sendTelegram("Market is open — dip-buy scanner is live for today.");
    state.openNotified = true;
    console.log("Sent market-open message.");
  }

  if (time.atClose && !state.closeNotified) {
    await sendTelegram("Market is closed — scanning paused until tomorrow.");
    state.closeNotified = true;
    console.log("Sent market-close message.");
  }

  if (time.inMarketHours) {
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

    if (fresh.length === 0) console.log("No new signals this run.");
  } else {
    console.log("Outside market hours, skipping ticker scan.");
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
