import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_LEDGER_DB_ID;

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN || !DB) {
    return res.status(500).json({ error: "NOTION_TOKEN or NOTION_LEDGER_DB_ID not set" });
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
          sorts: [{ property: "Date", direction: "ascending" }],
        });
        all.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return res.status(200).json(all.map(pageToEntry));
    }

    if (req.method === "POST") {
      const { id, date, type, amount, note } = req.body || {};
      if (!type || amount == null) return res.status(400).json({ error: "type and amount required" });
      const useId = id || `ledger-${Date.now()}`;
      const found = await notion.databases.query({
        database_id: DB,
        filter: { property: "ID", title: { equals: String(useId) } },
      });
      const properties = {
        ID: { title: [{ text: { content: String(useId) } }] },
        Date: { date: { start: date || new Date().toISOString().slice(0, 10) } },
        Type: { select: { name: type } },
        Amount: { number: Number(amount) },
        Note: { rich_text: note ? [{ text: { content: String(note).slice(0, 1990) } }] : [] },
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
    console.error("ledger error:", e);
    return res.status(500).json({ error: e.message || "internal" });
  }
}

function pageToEntry(p) {
  const x = p.properties;
  return {
    id: x.ID?.title?.[0]?.plain_text || "",
    date: x.Date?.date?.start || "",
    type: x.Type?.select?.name || "Deposit",
    amount: x.Amount?.number ?? 0,
    note: x.Note?.rich_text?.[0]?.plain_text || "",
  };
}
