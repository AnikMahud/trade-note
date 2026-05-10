// Frontend storage: Notion via /api/trades. Screenshots compressed + chunked into rich_text.

const CACHE_KEY = "tn-trades-cache-v1";

export const useCloud = true;

export async function loadTrades() {
  try {
    const r = await fetch("/api/trades");
    if (!r.ok) throw new Error("api " + r.status);
    const list = await r.json();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch {}
    return list;
  } catch (e) {
    console.warn("Notion load failed, using cache:", e.message);
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
  }
}

export async function saveTrade(t) {
  const payload = { ...t };

  if (payload.screenshot && payload.screenshot.startsWith("data:")) {
    // Fresh upload: compress, push to /api/upload, attach id.
    const compressed = await compressDataUrl(payload.screenshot, 1200, 0.7);
    const up = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: compressed, filename: `trade-${t.id}.jpg` }),
    });
    if (!up.ok) {
      let body = ""; try { body = await up.text(); } catch {}
      throw new Error(`Upload ${up.status}: ${body.slice(0, 200)}`);
    }
    const j = await up.json();
    payload.screenshotUploadId = j.id;
    payload.screenshot = null; // server will not store dataUrl in Notion
  } else if (payload.screenshot === null && t.screenshotWasCleared) {
    payload.screenshotClear = true;
  }

  const r = await fetch("/api/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    let body = "";
    try { body = await r.text(); } catch {}
    throw new Error(`API ${r.status}: ${body.slice(0, 200) || r.statusText}`);
  }
  cacheUpsert(t);
}

function compressDataUrl(dataUrl, maxW, q) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#0b0b13";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let out = c.toDataURL("image/jpeg", q);
        // If still too big for Notion (200KB-ish raw text), compress harder.
        if (out.length > 190000) out = c.toDataURL("image/jpeg", 0.35);
        if (out.length > 190000) {
          const c2 = document.createElement("canvas");
          c2.width = Math.round(w * 0.7); c2.height = Math.round(h * 0.7);
          c2.getContext("2d").drawImage(img, 0, 0, c2.width, c2.height);
          out = c2.toDataURL("image/jpeg", 0.4);
        }
        resolve(out);
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function saveAll(trades) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(trades)); } catch {}
}

export async function removeTrade(id) {
  const r = await fetch(`/api/trades?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) {
    let body = "";
    try { body = await r.text(); } catch {}
    throw new Error(`API ${r.status}: ${body.slice(0, 200) || r.statusText}`);
  }
  cacheRemove(id);
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
