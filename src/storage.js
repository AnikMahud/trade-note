import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = "trades";
const LS_KEY = "tj-trades-v2";

export const supabase = URL && KEY ? createClient(URL, KEY) : null;
export const useCloud = !!supabase;

export async function loadTrades() {
  if (useCloud) {
    const { data, error } = await supabase.from(TABLE).select("*").order("date", { ascending: true });
    if (error) { console.error(error); return []; }
    return (data || []).map(rowToTrade);
  }
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export async function saveTrade(trade) {
  if (useCloud) {
    const { error } = await supabase.from(TABLE).upsert(tradeToRow(trade));
    if (error) console.error(error);
    return;
  }
  const all = await loadTrades();
  const idx = all.findIndex(t => t.id === trade.id);
  if (idx >= 0) all[idx] = trade; else all.push(trade);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export async function saveAll(trades) {
  if (useCloud) {
    const { error } = await supabase.from(TABLE).upsert(trades.map(tradeToRow));
    if (error) console.error(error);
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(trades));
}

export async function removeTrade(id) {
  if (useCloud) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) console.error(error);
    return;
  }
  const all = await loadTrades();
  localStorage.setItem(LS_KEY, JSON.stringify(all.filter(t => t.id !== id)));
}

function tradeToRow(t) {
  return {
    id: t.id,
    date: t.date,
    time: t.time || null,
    symbol: t.symbol,
    direction: t.direction,
    setup: t.setup,
    entry: t.entry === "" ? null : Number(t.entry),
    exit: t.exit === "" ? null : Number(t.exit),
    size: t.size === "" ? null : Number(t.size),
    pnl: t.pnl === "" ? null : Number(t.pnl),
    r_multiple: t.rMultiple === "" ? null : Number(t.rMultiple),
    grade: t.grade,
    emotion: t.emotion,
    notes: t.notes || null,
    screenshot: t.screenshot || null,
  };
}

function rowToTrade(r) {
  return {
    id: Number(r.id),
    date: r.date,
    time: r.time || "",
    symbol: r.symbol || "",
    direction: r.direction || "Long",
    setup: r.setup || "Breakout",
    entry: r.entry == null ? "" : String(r.entry),
    exit: r.exit == null ? "" : String(r.exit),
    size: r.size == null ? "" : String(r.size),
    pnl: r.pnl == null ? "" : String(r.pnl),
    rMultiple: r.r_multiple == null ? "" : String(r.r_multiple),
    grade: r.grade || "A",
    emotion: r.emotion || "Neutral",
    notes: r.notes || "",
    screenshot: r.screenshot || null,
  };
}
