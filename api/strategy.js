import { Client } from "@notionhq/client";
import { requireUser, userScopeFilter, userProp, ensureUserProperty } from "./_auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_STRATEGY_DB_ID;

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN || !DB) {
    return res.status(500).json({ error: "NOTION_TOKEN or NOTION_STRATEGY_DB_ID not set" });
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
          sorts: [{ property: "Order", direction: "ascending" }],
          filter: userScopeFilter(tag),
        });
        all.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return res.status(200).json(all.map(pageToItem));
    }

    if (req.method === "POST") {
      const { id, type, order, text } = req.body || {};
      if (!id || !type) return res.status(400).json({ error: "id and type required" });
      const found = await notion.databases.query({
        database_id: DB,
        filter: { and: [
          { property: "ID", title: { equals: String(id) } },
          userScopeFilter(tag),
        ] },
      });
      const properties = {
        ID: { title: [{ text: { content: String(id) } }] },
        Type: { select: { name: type } },
        Order: { number: Number.isFinite(Number(order)) ? Number(order) : 0 },
        Text: { rich_text: text ? [{ text: { content: String(text).slice(0, 1990) } }] : [] },
        User: userProp(tag),
      };
      if (found.results[0]) {
        await notion.pages.update({ page_id: found.results[0].id, properties });
      } else {
        await notion.pages.create({ parent: { database_id: DB }, properties });
      }
      return res.status(200).json({ ok: true });
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
    console.error("strategy error:", e);
    return res.status(500).json({ error: e.message || "internal" });
  }
}

function pageToItem(p) {
  const x = p.properties;
  return {
    id: x.ID?.title?.[0]?.plain_text || "",
    type: x.Type?.select?.name || "Rule",
    order: x.Order?.number ?? 0,
    text: x.Text?.rich_text?.[0]?.plain_text || "",
  };
}
