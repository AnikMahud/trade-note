import { authenticate, issueToken } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.AUTH_USERS || !process.env.AUTH_TOKEN_SECRET) {
    return res.status(500).json({ error: "AUTH_USERS or AUTH_TOKEN_SECRET not set" });
  }
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });

  const user = authenticate(username, password);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  return res.status(200).json({ ok: true, token: issueToken(user.tag), tag: user.tag, label: user.label });
}
