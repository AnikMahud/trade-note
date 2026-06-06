export default async function handler(req, res) {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const sym = symbol.toUpperCase().trim();
  const key = process.env.TWELVE_DATA_KEY;

  // Primary: Twelve Data — real-time, matches TradingView prices
  if (key) {
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${key}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Twelve Data HTTP ${r.status}`);
      const d = await r.json();
      if (d.status === "error" || d.code) throw new Error(d.message || "symbol not found");
      return res.status(200).json({
        symbol: d.symbol || sym,
        name: d.name || sym,
        price: parseFloat(d.close) || null,
        high52w: parseFloat(d.fifty_two_week?.high) || null,
        low52w: parseFloat(d.fifty_two_week?.low) || null,
      });
    } catch (e) {
      console.warn("Twelve Data failed:", e.message);
      // fall through to Yahoo Finance fallback
    }
  }

  // Fallback: Yahoo Finance (15-min delayed)
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com",
    "Cache-Control": "no-cache",
  };

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Yahoo v7 ${r.status}`);
    const data = await r.json();
    const q = data?.quoteResponse?.result?.[0];
    if (!q) throw new Error("no result");
    return res.status(200).json({
      symbol: q.symbol || sym,
      name: q.longName || q.shortName || sym,
      price: q.regularMarketPrice ?? null,
      high52w: q.fiftyTwoWeekHigh ?? null,
      low52w: q.fiftyTwoWeekLow ?? null,
    });
  } catch (e) {
    console.warn("Yahoo v7 failed:", e.message);
  }

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Yahoo v8 ${r.status}`);
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error("no meta");
    return res.status(200).json({
      symbol: meta.symbol || sym,
      name: meta.longName || meta.shortName || sym,
      price: meta.regularMarketPrice ?? null,
      high52w: meta.fiftyTwoWeekHigh ?? null,
      low52w: meta.fiftyTwoWeekLow ?? null,
    });
  } catch (e) {
    console.error("all quote sources failed:", e.message);
    return res.status(500).json({ error: `Could not fetch quote for '${sym}'` });
  }
}
