// Polls the deployed dip-buy scanner and paper-tracks positions the same
// way the app's Scanner page does client-side (src/App.jsx ScannerPage):
// opens a position on a fresh buySignal, raises the stop to breakeven once
// a trade is up 1R, and closes on stop/target/trend-break. Sends a Telegram
// message for each of those events. Runs from GitHub Actions on a
// schedule; self-gates on actual US/Eastern market time so the cron
// trigger doesn't need to account for DST.
//
// The market-open/close pings themselves are NOT sent from here — GitHub
// Actions' schedule trigger is best-effort and was observed firing hours
// late. Those two time-critical messages are sent by api/notify.js instead,
// hit by an external timezone-aware cron for exact, DST-proof delivery.
import { readFileSync, writeFileSync, existsSync } from "fs";

const SCANNER_URL = "https://trade-note-phi.vercel.app/api/scanner";
const STATE_FILE = new URL("../scanner-state.json", import.meta.url);
const TARGET_R_MULT = 2; // take-profit = entry + 2x the stop distance (2R), matches the app

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret");
}

const OPEN_MIN = 9 * 60 + 30; // 9:30am ET
const CLOSE_MIN = 16 * 60; // 4:00pm ET

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
    inMarketHours: minutesNow >= OPEN_MIN && minutesNow < CLOSE_MIN,
  };
}

function todayNY() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function loadState() {
  const fresh = { date: todayNY(), positions: [] };
  if (!existsSync(STATE_FILE)) return fresh;
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const positions = state.positions || [];
  if (state.date !== fresh.date) return { ...fresh, positions };
  return { ...fresh, ...state, positions };
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

function reconcilePositions(positions, results) {
  const next = positions.map((p) => ({ ...p }));
  const openIdx = new Map();
  next.forEach((p, i) => {
    if (p.status === "OPEN") openIdx.set(p.ticker, i);
  });
  const messages = [];

  results.forEach((row) => {
    const idx = openIdx.get(row.ticker);
    if (idx != null) {
      const pos = next[idx];
      let stopPrice = pos.stopPrice;
      let beActive = pos.beActive;
      if (!beActive && row.close >= pos.oneRLevel) {
        beActive = true;
        stopPrice = pos.entryPrice;
        messages.push({
          text: `Breakeven: ${row.ticker} stop raised to $${pos.entryPrice} — this trade can no longer lose.`,
        });
      }

      let exit = null;
      if (row.close <= stopPrice) {
        exit = { status: "LOSS", reason: beActive ? "Breakeven stop hit" : "Stop hit" };
      } else if (row.close >= pos.targetPrice) {
        exit = { status: "WIN", reason: "Target hit" };
      } else if (!row.trendOk) {
        exit = { status: row.close >= pos.entryPrice ? "WIN" : "LOSS", reason: "Trend broke" };
      }

      if (exit) {
        const returnPct = round2(((row.close - pos.entryPrice) / pos.entryPrice) * 100);
        next[idx] = { ...pos, status: exit.status, exitPrice: row.close, stopPrice, beActive };
        messages.push({
          text:
            `${exit.status === "WIN" ? "WIN" : "LOSS"}: SELL ${row.ticker} @ $${row.close} — ${exit.reason} ` +
            `(${returnPct > 0 ? "+" : ""}${returnPct}%)`,
        });
      } else {
        next[idx] = { ...pos, stopPrice, beActive };
      }
    } else if (row.buySignal) {
      const target = round2(row.close + TARGET_R_MULT * row.stopDistance);
      next.push({
        ticker: row.ticker,
        entryPrice: row.close,
        stopPrice: row.stopPrice,
        oneRLevel: round2(row.close + row.stopDistance),
        beActive: false,
        targetPrice: target,
        status: "OPEN",
      });
      messages.push({
        text:
          `BUY: ${row.ticker} @ $${row.close}\n` +
          `Stop: $${row.stopPrice} | Target: $${target}\n` +
          `Pullback: ${row.pullbackPct}% | RSI: ${row.rsi}`,
      });
    }
  });

  const capped = next.length > 200 ? next.slice(next.length - 200) : next;
  return { positions: capped, messages };
}

async function main() {
  const time = nyTimeInfo();
  if (!time.isWeekday) {
    console.log("Weekend, skipping.");
    return;
  }

  const state = loadState();

  if (time.inMarketHours) {
    const r = await fetch(SCANNER_URL);
    if (!r.ok) throw new Error(`Scanner HTTP ${r.status}`);
    const { results } = await r.json();

    const { positions, messages } = reconcilePositions(state.positions, results || []);
    state.positions = positions;

    for (const m of messages) {
      await sendTelegram(m.text);
      console.log(m.text.split("\n")[0]);
    }
    if (messages.length === 0) console.log("No position events this run.");
  } else {
    console.log("Outside market hours, skipping ticker scan.");
  }

  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
