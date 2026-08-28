// Fires the market-open / market-close Telegram message on demand. Meant to
// be hit by an external, timezone-aware cron (e.g. cron-job.org set to
// America/New_York) so delivery time is exact and survives DST without any
// manual UTC-offset math — unlike the GitHub Actions schedule trigger, which
// is best-effort and was observed to fire hours late or not at all.
export default async function handler(req, res) {
  const { event, key } = req.query;

  if (!process.env.NOTIFY_SECRET || key !== process.env.NOTIFY_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (event !== "open" && event !== "close") {
    return res.status(400).json({ error: "event must be 'open' or 'close'" });
  }

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(new Date());
  if (["Sat", "Sun"].includes(weekday)) {
    return res.status(200).json({ ok: true, skipped: "weekend" });
  }

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" });
  }

  const text =
    event === "open"
      ? "Market is open."
      : "Market is closed.";

  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
  if (!r.ok) return res.status(502).json({ error: `Telegram HTTP ${r.status}` });

  res.status(200).json({ ok: true, event });
}
