import { Client } from "@notionhq/client";
import { requireUser, userScopeFilter, userProp, ensureUserProperty } from "../lib/auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_PORTFOLIO_DB_ID;

// Older Portfolio DBs predate the Market field. Add it on first write in this
// lambda instance rather than requiring a manual Notion schema migration.
let marketPropChecked = false;
async function ensureMarketProperty() {
  if (marketPropChecked) return;
  try {
    const db = await notion.databases.retrieve({ database_id: DB });
    if (!db.properties?.Market) {
      await notion.databases.update({ database_id: DB, properties: { Market: { select: {} } } });
    }
  } catch (e) {
    console.warn("ensureMarketProperty failed:", e.message);
  }
  marketPropChecked = true;
}

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN || !DB) {
    return res.status(500).json({ error: "NOTION_TOKEN or NOTION_PORTFOLIO_DB_ID not set" });
  }
  const tag = requireUser(req, res);
  if (!tag) return;
  try {
    await ensureUserProperty(notion, DB);

    if (req.method === "GET") {
      const all = [];
      let cursor;
      do {
        const r = await notion.databases.query({
          database_id: DB,
          start_cursor: cursor,
          page_size: 100,
          sorts: [{ property: "BuyDate", direction: "ascending" }],
          filter: userScopeFilter(tag),
        });
        all.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return res.status(200).json(all.map(pageToHolding));
    }

    if (req.method === "POST") {
      const { id, symbol, name, market, buyDate, buyPrice, shares, levPct, status, sellPrice, sellDate } = req.body || {};
      if (!symbol) return res.status(400).json({ error: "symbol required" });
      await ensureMarketProperty();
      const useId = String(id || `p-${Date.now()}`);
      const found = await notion.databases.query({
        database_id: DB,
        filter: { and: [
          { property: "ID", title: { equals: useId } },
          userScopeFilter(tag),
        ] },
      });
      const properties = {
        ID:        { title: [{ text: { content: useId } }] },
        Symbol:    { rich_text: [{ text: { content: String(symbol) } }] },
        Name:      { rich_text: name ? [{ text: { content: String(name).slice(0, 500) } }] : [] },
        Market:    { select: { name: market || "Stocks" } },
        BuyDate:   { date: buyDate ? { start: buyDate } : null },
        BuyPrice:  { number: buyPrice != null ? Number(buyPrice) : null },
        Shares:    { number: shares != null ? Number(shares) : null },
        LevPct:    { number: levPct != null ? Number(levPct) : 100 },
        Status:    { select: { name: status || "open" } },
        SellPrice: { number: sellPrice != null ? Number(sellPrice) : null },
        SellDate:  { date: sellDate ? { start: sellDate } : null },
        User:      userProp(tag),
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
        filter: { and: [
          { property: "ID", title: { equals: String(id) } },
          userScopeFilter(tag),
        ] },
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
    market:    x.Market?.select?.name || "Stocks",
    buyDate:   x.BuyDate?.date?.start || "",
    buyPrice:  x.BuyPrice?.number ?? 0,
    shares:    x.Shares?.number ?? 0,
    levPct:    x.LevPct?.number ?? 100,
    status:    x.Status?.select?.name || "open",
    sellPrice: x.SellPrice?.number ?? null,
    sellDate:  x.SellDate?.date?.start || null,
  };
}
