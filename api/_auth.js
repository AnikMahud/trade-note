import crypto from "crypto";

function getUsers() {
  try {
    const list = JSON.parse(process.env.AUTH_USERS || "[]");
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// First entry in AUTH_USERS is the primary/legacy account — any existing
// Notion row with no User property is treated as theirs, so old data
// never needs to be rewritten.
function primaryTag() {
  const users = getUsers();
  return users[0]?.tag || users[0]?.username || "";
}

export function authenticate(username, password) {
  const users = getUsers();
  const u = users.find(u => u.username === username && u.password === password);
  if (!u) return null;
  return { tag: u.tag || u.username, label: u.label || u.username };
}

function sign(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_TOKEN_SECRET || "").update(payload).digest("hex");
}

export function issueToken(tag) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 90; // 90 days
  const payload = `${tag}|${exp}`;
  return Buffer.from(`${payload}|${sign(payload)}`).toString("base64url");
}

export function verifyToken(token) {
  try {
    const parts = Buffer.from(String(token), "base64url").toString("utf8").split("|");
    if (parts.length !== 3) return null;
    const [tag, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!tag || !exp || Date.now() > exp) return null;
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(sign(`${tag}|${exp}`), "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return { tag };
  } catch { return null; }
}

// Verifies the request's auth header and returns the user's tag, or writes
// a 401 and returns null (caller should just `return` when this is null).
export function requireUser(req, res) {
  const token = req.headers["x-tn-auth"];
  const auth = token ? verifyToken(token) : null;
  if (!auth) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return auth.tag;
}

// Notion filter: rows tagged for this user, plus — for the primary/legacy
// account only — rows with no User set at all (everything that existed
// before multi-user support shipped).
export function userScopeFilter(tag) {
  if (tag === primaryTag()) {
    return { or: [
      { property: "User", select: { equals: tag } },
      { property: "User", select: { is_empty: true } },
    ] };
  }
  return { property: "User", select: { equals: tag } };
}

export function userProp(tag) {
  return { select: { name: tag } };
}

// Lazily adds the "User" select property to a database the first time it's
// needed — same pattern already used for Portfolio's Market property, no
// manual Notion schema edit required.
const checked = new Set();
export async function ensureUserProperty(notion, dbId) {
  if (checked.has(dbId)) return;
  try {
    const db = await notion.databases.retrieve({ database_id: dbId });
    if (!db.properties?.User) {
      await notion.databases.update({ database_id: dbId, properties: { User: { select: {} } } });
    }
  } catch (e) {
    console.warn("ensureUserProperty failed:", e.message);
  }
  checked.add(dbId);
}
