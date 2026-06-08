import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_PORTFOLIO_DB_ID;

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN || !DB) {
    return res.status(500).json({ error: "NOTION_TOKEN or NOTION_PORTFOLIO_DB_ID not set" });
  }
  try {
    if (req.method === "GET") {
      const all = [];
      let cursor;
      do {
        const r = await notion.databases.query({
          database_id: DB,
          start_cursor: cursor,
          page_size: 100,
          sorts: [{ property: "BuyDate", direction: "ascending" }],
        });
        all.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return res.status(200).json(all.map(pageToHolding));
    }

    if (req.method === "POST") {
      const { id, symbol, name, buyDate, buyPrice, shares, levPct, status, sellPrice, sellDate } = req.body || {};
      if (!symbol) return res.status(400).json({ error: "symbol required" });
      const useId = String(id || `p-${Date.now()}`);
      const found = await notion.databases.query({
        database_id: DB,
        filter: { property: "ID", title: { equals: useId } },
      });
      const properties = {
        ID:        { title: [{ text: { content: useId } }] },
        Symbol:    { rich_text: [{ text: { content: String(symbol) } }] },
        Name:      { rich_text: name ? [{ text: { content: String(name).slice(0, 500) } }] : [] },
        BuyDate:   { date: buyDate ? { start: buyDate } : null },
        BuyPrice:  { number: buyPrice != null ? Number(buyPrice) : null },
        Shares:    { number: shares != null ? Number(shares) : null },
        LevPct:    { number: levPct != null ? Number(levPct) : 100 },
        Status:    { select: { name: status || "open" } },
        SellPrice: { number: sellPrice != null ? Number(sellPrice) : null },
        SellDate:  { date: sellDate ? { start: sellDate } : null },
      };
      if (found.results[0]) {
        await notion.pages.update({ page_id: found.results[0].id, properties });
      } else {
        await notion.pages.create({ parent: { database_id: DB }, properties });
      }
      return res.status(200).json({ ok: true, id: useId });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: "id required" });
      const found = await notion.databases.query({
        database_id: DB,
        filter: { property: "ID", title: { equals: String(id) } },
      });
      if (found.results[0]) {
        await notion.pages.update({ page_id: found.results[0].id, archived: true });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("portfolio error:", e);
    return res.status(500).json({ error: e.message || "internal" });
  }
}

function pageToHolding(p) {
  const x = p.properties;
  return {
    id:        x.ID?.title?.[0]?.plain_text || "",
    symbol:    x.Symbol?.rich_text?.[0]?.plain_text || "",
    name:      x.Name?.rich_text?.[0]?.plain_text || "",
    buyDate:   x.BuyDate?.date?.start || "",
    buyPrice:  x.BuyPrice?.number ?? 0,
    shares:    x.Shares?.number ?? 0,
    levPct:    x.LevPct?.number ?? 100,
    status:    x.Status?.select?.name || "open",
    sellPrice: x.SellPrice?.number ?? null,
    sellDate:  x.SellDate?.date?.start || null,
  };
}
