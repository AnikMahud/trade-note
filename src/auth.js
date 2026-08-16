// Frontend session: username/password checked server-side (api/auth.js),
// signed token kept in localStorage and sent on every API call so each
// account only ever reads/writes its own Notion rows.

const AUTH_KEY = "tn-auth";

export function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}

export function setAuth(a) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch {}
}

export function clearAuth() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

export async function login(username, password) {
  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Invalid username or password");
  // Reused as the write-action PIN too, so each account has one password
  // for everything instead of a separate shared PIN to remember.
  const withPin = { ...data, pin: password };
  setAuth(withPin);
  return withPin;
}

export function authFetch(url, opts = {}) {
  const a = getAuth();
  const headers = { ...(opts.headers || {}) };
  if (a?.token) headers["x-tn-auth"] = a.token;
  return fetch(url, { ...opts, headers });
}

// Namespaces a localStorage key by the logged-in user's tag, so two
// accounts on the same browser never read/write each other's cached data.
export function scopedKey(base) {
  const a = getAuth();
  return a?.tag ? `${base}:${a.tag}` : base;
}
