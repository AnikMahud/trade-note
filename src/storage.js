// Frontend storage: Notion via /api/trades, screenshots in localStorage.
// Notion can't hold base64 images cleanly, so screenshots stay client-side.

const SHOTS_KEY = "tn-screenshots-v1";
const CACHE_KEY = "tn-trades-cache-v1";

export const useCloud = true;

export async function loadTrades() {
  const shots = readShots();
  try {
    const r = await fetch("/api/trades");
    if (!r.ok) throw new Error("api " + r.status);
    const list = await r.json();
    const merged = list.map(t => ({ ...t, screenshot: shots[t.id] || null }));
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
    return merged;
  } catch (e) {
    console.warn("Notion load failed, using cache:", e.message);
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
  }
}

export async function saveTrade(t) {
  const { screenshot, ...rest } = t;
  saveShot(t.id, screenshot);
  const r = await fetch("/api/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rest),
  });
  if (!r.ok) {
    let body = "";
    try { body = await r.text(); } catch {}
    throw new Error(`API ${r.status}: ${body.slice(0, 200) || r.statusText}`);
  }
  cacheUpsert(t);
}

export async function saveAll(trades) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(trades)); } catch {}
}

export async function removeTrade(id) {
  removeShot(id);
  const r = await fetch(`/api/trades?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) {
    let body = "";
    try { body = await r.text(); } catch {}
    throw new Error(`API ${r.status}: ${body.slice(0, 200) || r.statusText}`);
  }
  cacheRemove(id);
}

function readShots() {
  try { return JSON.parse(localStorage.getItem(SHOTS_KEY) || "{}"); } catch { return {}; }
}
function saveShot(id, dataUrl) {
  if (!dataUrl) return removeShot(id);
  try {
    const m = readShots(); m[id] = dataUrl;
    localStorage.setItem(SHOTS_KEY, JSON.stringify(m));
  } catch (e) { console.warn("screenshot save failed (quota?)", e); }
}
function removeShot(id) {
  try {
    const m = readShots(); delete m[id];
    localStorage.setItem(SHOTS_KEY, JSON.stringify(m));
  } catch {}
}

function cacheUpsert(t) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    const i = c.findIndex(x => x.id === t.id);
    if (i >= 0) c[i] = t; else c.push(t);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {}
}
function cacheRemove(id) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]").filter(x => x.id !== id);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {}
}
