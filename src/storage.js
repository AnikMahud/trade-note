// Frontend storage: Notion via /api/trades. Screenshots compressed + chunked into rich_text.

const CACHE_KEY = "tn-trades-cache-v1";

export const useCloud = true;

export async function loadTrades() {
  try {
    const r = await fetch("/api/trades", { cache: "no-store" });
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
  const shots = Array.isArray(t.screenshots) ? t.screenshots : [];

  if (t.screenshotsTouched) {
    // Re-upload every image in the order kept by the user.
    // URL entries (existing Notion files) → refetched, recompressed, re-uploaded.
    // dataURL entries (new uploads) → compressed + uploaded.
    const ids = [];
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      let dataUrl = s;
      if (typeof s === "string" && !s.startsWith("data:")) {
        try {
          const blob = await (await fetch(s)).blob();
          dataUrl = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = e => res(e.target.result);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn("could not refetch existing image at index", i, e);
          continue;
        }
      }
      const compressed = await compressDataUrl(dataUrl, 1200, 0.7);
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: compressed, filename: `trade-${t.id}-${i + 1}.jpg` }),
      });
      if (!up.ok) {
        let body = ""; try { body = await up.text(); } catch {}
        throw new Error(`Upload ${up.status}: ${body.slice(0, 200)}`);
      }
      const j = await up.json();
      ids.push(j.id);
    }
    payload.screenshotUploadIds = ids;
    payload.screenshotsTouched = true;
  } else {
    delete payload.screenshots;
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
