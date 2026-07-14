// Dip-buy rule scanner — same 3-step rule set as the local Python tool
// (screener.py): trend filter (EMA200/EMA50) + dip definition (pullback %,
// EMA20 proximity, RSI zone) + confirmation trigger (bullish candle +
// volume/RSI). Returns raw indicator values per ticker; the frontend does
// position sizing locally so balance/risk% can change without a refetch.

const DEFAULT_WATCHLIST = [
  "GOOGL","META","BKNG","SHOP","TSM","AMZN","MSFT","GD","ORCL","JPM",
  "NFLX","AVGO","PLTR","AAPL","BA","AMD","HOOD","BRK-B","NVDA","LMT",
  "TSLA","SOUN","NOK","INTC",
];

const ATR_LEN = 14;
const ATR_STOP_MULT = 1.5;
const SWING_LOOKBACK = 20;
const RSI_LEN = 14;

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com",
  "Cache-Control": "no-cache",
};

async function fetchHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const r = await fetch(url, { headers: YF_HEADERS });
  if (!r.ok) throw new Error(`Yahoo chart HTTP ${r.status}`);
  const data = await r.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("no chart result");
  const ts = result.timestamp;
  const q = result.indicators?.quote?.[0];
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  if (!ts || !q) throw new Error("malformed chart payload");

  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close[i] == null || q.high[i] == null || q.low[i] == null || q.open[i] == null) continue;
    rows.push({
      close: adj?.[i] ?? q.close[i],
      high: q.high[i],
      low: q.low[i],
      open: q.open[i],
      volume: q.volume[i] ?? 0,
    });
  }
  if (rows.length < 210) throw new Error("not enough history");
  return rows;
}

function ema(values, length) {
  const alpha = 2 / (length + 1);
  const out = new Array(values.length).fill(null);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function rsi(closes, length) {
  const out = new Array(closes.length).fill(null);
  let avgGain = null, avgLoss = null;
  const alpha = 1 / length;
  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (avgGain == null) {
      avgGain = gain; avgLoss = loss;
    } else {
      avgGain = alpha * gain + (1 - alpha) * avgGain;
      avgLoss = alpha * loss + (1 - alpha) * avgLoss;
    }
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

function rollingMean(values, window) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

function rollingMax(values, window) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    let max = -Infinity;
    for (let j = start; j <= i; j++) max = Math.max(max, values[j]);
    out[i] = max;
  }
  return out;
}

function trueRange(rows) {
  const out = new Array(rows.length).fill(null);
  out[0] = rows[0].high - rows[0].low;
  for (let i = 1; i < rows.length; i++) {
    const prevClose = rows[i - 1].close;
    out[i] = Math.max(
      rows[i].high - rows[i].low,
      Math.abs(rows[i].high - prevClose),
      Math.abs(rows[i].low - prevClose)
    );
  }
  return out;
}

function evaluate(symbol, rows) {
  const close = rows.map(r => r.close);
  const high = rows.map(r => r.high);
  const open = rows.map(r => r.open);
  const volume = rows.map(r => r.volume);

  const ema200 = ema(close, 200);
  const ema50 = ema(close, 50);
  const ema20 = ema(close, 20);
  const r = rsi(close, RSI_LEN);
  const volSma10 = rollingMean(volume, 10);
  const swingHigh = rollingMax(high, SWING_LOOKBACK);
  const atr = rollingMean(trueRange(rows), ATR_LEN);

  const i = rows.length - 1;

  const trendOk = close[i] > ema200[i] && close[i] > ema50[i];

  const pullbackPct = ((swingHigh[i] - close[i]) / swingHigh[i]) * 100;
  const nearEma20 = Math.abs(close[i] - ema20[i]) / ema20[i] * 100 <= 1.0;
  const rsiDipZone = r[i] >= 30 && r[i] <= 40;
  const dipOk = (pullbackPct >= 5 && pullbackPct <= 10) || nearEma20 || rsiDipZone;

  const bullishCandle = close[i] > open[i] && close[i] > high[i - 1];
  const volumeOk = volume[i] > volSma10[i];
  const rsiTurningUp = r[i - 1] < 40 && r[i] >= 40;
  const confirmOk = bullishCandle && (volumeOk || rsiTurningUp);

  const buySignal = trendOk && dipOk && confirmOk;

  const stopDistance = ATR_STOP_MULT * atr[i];

  return {
    ticker: symbol,
    close: round2(close[i]),
    trendOk, dipOk, confirmOk, buySignal,
    pullbackPct: round2(pullbackPct),
    rsi: round2(r[i]),
    atr: round2(atr[i]),
    stopPrice: round2(close[i] - stopDistance),
    stopDistance: round2(stopDistance),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default async function handler(req, res) {
  const symbolsParam = req.query.symbols;
  const symbols = symbolsParam
    ? String(symbolsParam).split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_WATCHLIST;

  const settled = await Promise.allSettled(
    symbols.map(async (sym) => evaluate(sym, await fetchHistory(sym)))
  );

  const results = [];
  const errors = [];
  settled.forEach((s, idx) => {
    if (s.status === "fulfilled") results.push(s.value);
    else errors.push({ ticker: symbols[idx], error: s.reason?.message || "failed" });
  });

  results.sort((a, b) => {
    const stepsA = (a.trendOk ? 1 : 0) + (a.dipOk ? 1 : 0) + (a.confirmOk ? 1 : 0);
    const stepsB = (b.trendOk ? 1 : 0) + (b.dipOk ? 1 : 0) + (b.confirmOk ? 1 : 0);
    return stepsB - stepsA;
  });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    results,
    errors,
  });
}
