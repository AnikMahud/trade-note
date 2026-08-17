import { Client } from "@notionhq/client";
import { requireUser, userScopeFilter, userProp, ensureUserProperty, listAccounts } from "../lib/auth.js";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_DATABASE_ID;

// Older Trades DBs predate leverage tracking. Add it on first write in this
// lambda instance rather than requiring a manual Notion schema migration.
let levPctPropChecked = false;
async function ensureLevPctProperty() {
  if (levPctPropChecked) return;
  try {
    const db = await notion.databases.retrieve({ database_id: DB });
    if (!db.properties?.LevPct) {
      await notion.databases.update({ database_id: DB, properties: { LevPct: { number: {} } } });
    }
  } catch (e) {
    console.warn("ensureLevPctProperty failed:", e.message);
  }
  levPctPropChecked = true;
}

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN || !DB) {
    return res.status(500).json({ error: "NOTION_TOKEN or NOTION_DATABASE_ID not set" });
  }
  const tag = requireUser(req, res);
  if (!tag) return;

  try {
    await ensureUserProperty(notion, DB);
    await ensureLevPctProperty();

    // Leaderboard: the one cross-account read. Each account normally only ever
    // sees its own rows (userScopeFilter), so this loops every configured
    // account server-side and returns just week/month P&L + trade counts —
    // no symbols, notes, or other per-trade detail leaks across accounts.
    if (req.method === "GET" && req.query.leaderboard) {
      const now = new Date();
      const dow = (now.getDay() + 6) % 7; // 0=Mon..6=Sun
      const weekStart = new Date(now); weekStart.setHours(0,0,0,0); weekStart.setDate(now.getDate() - dow);
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23,59,59,999);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23,59,59,999);

      const board = [];
      for (const acc of listAccounts()) {
        const all = [];
        let cursor;
        do {
          const r = await notion.databases.query({
            database_id: DB,
            start_cursor: cursor,
            page_size: 100,
            filter: userScopeFilter(acc.tag),
          });
          all.push(...r.results);
          cursor = r.has_more ? r.next_cursor : null;
        } while (cursor);

        let weekPnl = 0, weekTrades = 0, monthPnl = 0, monthTrades = 0;
        for (const t of all.map(pageToTrade)) {
          const d = new Date(t.date + "T12:00:00");
          const pnl = parseFloat(t.pnl) || 0;
          if (d >= weekStart && d <= weekEnd) { weekPnl += pnl; weekTrades++; }
          if (d >= monthStart && d <= monthEnd) { monthPnl += pnl; monthTrades++; }
        }
        board.push({ tag: acc.tag, label: acc.label, weekPnl, weekTrades, monthPnl, monthTrades });
      }
      board.sort((a, b) => b.monthPnl - a.monthPnl);
      return res.status(200).json(board);
    }

    if (req.method === "GET") {
      const all = [];
      let cursor;
      do {
        const r = await notion.databases.query({
          database_id: DB,
          start_cursor: cursor,
          page_size: 100,
          sorts: [{ property: "Date", direction: "ascending" }],
          filter: userScopeFilter(tag),
        });
        all.push(...r.results);
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return res.status(200).json(all.map(pageToTrade));
    }

    if (req.method === "POST") {
      const t = req.body;
      const found = await notion.databases.query({
        database_id: DB,
        filter: { and: [
          { property: "ID", title: { equals: String(t.id) } },
          userScopeFilter(tag),
        ] },
      });
      const properties = tradeToProps(t);
      properties.User = userProp(tag);
      // Image handling:
      // - screenshotUploadIds (array) → set Image to those uploads (multi-image)
      // - screenshotsTouched + empty/omitted ids → clear all
      // - screenshotsTouched not set → preserve existing
      const ids = Array.isArray(t.screenshotUploadIds) ? t.screenshotUploadIds.filter(Boolean) : [];
      if (ids.length) {
        properties.Image = {
          files: ids.map((id, i) => ({
            type: "file_upload",
            file_upload: { id },
            name: `screenshot-${i + 1}.jpg`,
          })),
        };
      } else if (t.screenshotsTouched) {
        properties.Image = { files: [] };
      }
      if (found.results[0]) {
        await notion.pages.update({ page_id: found.results[0].id, properties });
      } else {
        await notion.pages.create({ parent: { database_id: DB }, properties });
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = req.query.id || req.body?.id;
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
    console.error("notion error:", e);
    return res.status(500).json({ error: e.message || "internal error" });
  }
}

function rt(s) { return s ? [{ text: { content: String(s).slice(0, 1990) } }] : []; }
function rtChunked(s) {
  if (!s) return [];
  const out = [];
  const str = String(s);
  for (let i = 0; i < str.length && out.length < 100; i += 1990) {
    out.push({ text: { content: str.slice(i, i + 1990) } });
  }
  return out;
}
function pickRT(p) { return p?.rich_text?.[0]?.plain_text || ""; }
function pickRTAll(p) { return (p?.rich_text || []).map(r => r.plain_text || "").join(""); }
function pickTitle(p) { return p?.title?.[0]?.plain_text || ""; }
function pickSelect(p) { return p?.select?.name || ""; }
function pickNum(p) { return p?.number ?? null; }
function pickDate(p) { return p?.date?.start || ""; }

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tradeToProps(t) {
  return {
    "ID":        { title: [{ text: { content: String(t.id) } }] },
    "Date":      { date: { start: t.date } },
    "Time":      { rich_text: rt(t.time) },
    "Symbol":    { rich_text: rt(t.symbol) },
    "Direction": { select: { name: t.direction || "Long" } },
    "Setup":     { select: { name: t.setup || "Other" } },
    "Entry":     { number: num(t.entry) },
    "Exit":      { number: num(t.exit) },
    "Size":      { number: num(t.size) },
    "LevPct":    { number: t.levPct != null && t.levPct !== "" ? Number(t.levPct) : 100 },
    "PnL":       { number: num(t.pnl) },
    "RMultiple": { number: num(t.rMultiple) },
    "Grade":     { select: { name: t.grade || "A" } },
    "Emotion":   { select: { name: t.emotion || "Neutral" } },
    "Notes":      { rich_text: rt(t.notes) },
  };
}

function pageToTrade(p) {
  const x = p.properties;
  const idStr = pickTitle(x.ID);
  return {
    id: Number(idStr) || Date.parse(p.created_time) || Date.now(),
    date: pickDate(x.Date) || new Date().toISOString().slice(0, 10),
    time: pickRT(x.Time),
    symbol: pickRT(x.Symbol),
    direction: pickSelect(x.Direction) || "Long",
    setup: pickSelect(x.Setup) || "Other",
    entry: pickNum(x.Entry) ?? "",
    exit: pickNum(x.Exit) ?? "",
    size: pickNum(x.Size) ?? "",
    levPct: pickNum(x.LevPct) ?? 100,
    pnl: pickNum(x.PnL) ?? "",
    rMultiple: pickNum(x.RMultiple) ?? "",
    grade: pickSelect(x.Grade) || "A",
    emotion: pickSelect(x.Emotion) || "Neutral",
    notes: pickRT(x.Notes),
    screenshots: pickFileUrls(x.Image),
  };
}

function pickFileUrls(p) {
  if (!p?.files?.length) return [];
  return p.files.map(f => {
    if (f.type === "file") return f.file?.url || null;
    if (f.type === "external") return f.external?.url || null;
    return null;
  }).filter(Boolean);
}
