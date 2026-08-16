// Vercel serverless: receive base64 data URL, push as Notion file_upload.
// Returns the file_upload id to attach to the Image property.

import { Buffer } from "buffer";
import { requireUser } from "./_auth.js";

export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

const NOTION_VERSION = "2022-06-28";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.NOTION_TOKEN) {
    return res.status(500).json({ error: "NOTION_TOKEN not set" });
  }
  if (!requireUser(req, res)) return;

  try {
    const { dataUrl, filename = "screenshot.jpg" } = req.body || {};
    if (!dataUrl || typeof dataUrl !== "string") {
      return res.status(400).json({ error: "dataUrl required" });
    }
    const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: "invalid data URL" });
    const mime = m[1];
    const buf = Buffer.from(m[2], "base64");

    // 1. Create the upload object.
    const create = await fetch("https://api.notion.com/v1/file_uploads", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const cj = await create.json();
    if (!create.ok || !cj.upload_url) {
      return res.status(500).json({ error: "file_uploads create failed", detail: cj });
    }

    // 2. Send the bytes.
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: mime }), filename);
    const send = await fetch(cj.upload_url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
      },
      body: fd,
    });
    const sj = await send.json();
    if (!send.ok || sj.status !== "uploaded") {
      return res.status(500).json({ error: "upload send failed", detail: sj });
    }

    return res.status(200).json({ id: cj.id, status: sj.status });
  } catch (e) {
    console.error("upload error:", e);
    return res.status(500).json({ error: e.message || "internal" });
  }
}
