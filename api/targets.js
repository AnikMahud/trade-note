import { Client } from "@notionhq/client";
import { requireUser, userScopeFilter, userProp, ensureUserProperty } from "./_auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_TARGETS_DB_ID;

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN || !DB) {
    return res.status(500).json({ error: "NOTION_TOKEN or NOTION_TARGETS_DB_ID not set" });
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
          filter: userScopeFilter(tag),
        });
        all.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return res.status(200).json(all.map(pageToTarget));
    }

    if (req.method === "POST") {
      const { step, done, note } = req.body || {};
      if (step == null) return res.status(400).json({ error: "step required" });
      const found = await notion.databases.query({
        database_id: DB,
        filter: { and: [
          { property: "Step", title: { equals: String(step) } },
          userScopeFilter(tag),
        ] },
      });
      const properties = {
        Step: { title: [{ text: { content: String(step) } }] },
        Done: { checkbox: !!done },
        CompletedAt: done ? { date: { start: new Date().toISOString() } } : { date: null },
        User: userProp(tag),
      };
      if (typeof note === "string") {
        properties.Note = { rich_text: note ? [{ text: { content: note.slice(0, 1990) } }] : [] };
      }
      if (found.results[0]) {
        await notion.pages.update({ page_id: found.results[0].id, properties });
      } else {
        await notion.pages.create({ parent: { database_id: DB }, properties });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("targets error:", e);
    return res.status(500).json({ error: e.message || "internal" });
  }
}

function pageToTarget(p) {
  const x = p.properties;
  return {
    step: Number(x.Step?.title?.[0]?.plain_text || 0),
    done: !!x.Done?.checkbox,
    completedAt: x.CompletedAt?.date?.start || null,
    note: x.Note?.rich_text?.[0]?.plain_text || "",
  };
}
