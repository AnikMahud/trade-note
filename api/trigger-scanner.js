// Plain GET endpoint an external cron pinger can hit with no custom headers
// or body — it does the GitHub workflow_dispatch POST (which needs an auth
// header) server-side, so the external cron config stays a single URL.
export default async function handler(req, res) {
  const { key } = req.query;

  if (!process.env.NOTIFY_SECRET || key !== process.env.NOTIFY_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!process.env.GITHUB_DISPATCH_TOKEN) {
    return res.status(500).json({ error: "GITHUB_DISPATCH_TOKEN not set" });
  }

  const r = await fetch(
    "https://api.github.com/repos/AnikMahud/trade-note/actions/workflows/scanner-alert.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  if (!r.ok) return res.status(502).json({ error: `GitHub HTTP ${r.status}` });

  res.status(200).json({ ok: true });
}
