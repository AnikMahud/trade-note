import { Client } from "@notionhq/client";
import { requireUser, userScopeFilter, userProp, ensureUserProperty } from "../lib/auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_NOTES_DB_ID;

// Notion caps a single rich_text object at 2000 chars — chunk long note
// bodies across multiple array entries (up to the API's 100-item cap) so
// notes aren't silently truncated, then rejoin them on read.
function rtChunks(s) {
  const str = String(s || "");
  const out = [];
  for (let i = 0; i < str.length && out.length < 100; i += 1990) {
    out.push({ text: { content: str.slice(i, i + 1990) } });
  }
  return out;
}
function pickRTAll(p) { return (p?.rich_text || []).map(r => r.plain_text || "").join(""); }

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN || !DB) {
    return res.status(500).json({ error: "NOTION_TOKEN or NOTION_NOTES_DB_ID not set" });
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
          sorts: [{ property: "UpdatedAt", direction: "descending" }],
          filter: userScopeFilter(tag),
        });
        all.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return res.status(200).json(all.map(pageToNote));
    }

    if (req.method === "POST") {
      const { id, content } = req.body || {};
      if (!id) return res.status(400).json({ error: "id required" });
      const found = await notion.databases.query({
        database_id: DB,
        filter: { and: [
          { property: "ID", title: { equals: String(id) } },
          userScopeFilter(tag),
        ] },
      });
      const properties = {
        ID: { title: [{ text: { content: String(id) } }] },
        Content: { rich_text: rtChunks(content) },
        UpdatedAt: { date: { start: new Date().toISOString() } },
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
    console.error("notes error:", e);
    return res.status(500).json({ error: e.message || "internal" });
  }
}

function pageToNote(p) {
  const x = p.properties;
  return {
    id: x.ID?.title?.[0]?.plain_text || "",
    content: pickRTAll(x.Content),
    updatedAt: x.UpdatedAt?.date?.start || null,
  };
}
