import { Client } from "@notionhq/client";

export default async function handler(req, res) {
  if (!process.env.NOTION_TOKEN) {
    return res.status(500).send(page("Error", "NOTION_TOKEN is not set in Vercel environment variables."));
  }

  if (process.env.NOTION_PORTFOLIO_DB_ID) {
    return res.status(200).send(page("Already Done!",
      `Your Portfolio database is already configured.<br><br>
       <b>NOTION_PORTFOLIO_DB_ID</b> is already set in Vercel. No action needed.`
    ));
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  try {
    // Find an accessible page to create the database under
    const search = await notion.search({
      filter: { property: "object", value: "page" },
      page_size: 10,
    });

    const parentPage = search.results.find(r => r.object === "page");
    if (!parentPage) {
      return res.status(400).send(page("No Page Found",
        `Could not find a Notion page to create the database under.<br><br>
         Make sure your Notion integration has access to at least one page in your workspace.`
      ));
    }

    // Create the Portfolio database with all required properties
    const db = await notion.databases.create({
      parent: { type: "page_id", page_id: parentPage.id },
      title: [{ type: "text", text: { content: "TradeVault Portfolio" } }],
      properties: {
        "ID":        { title: {} },
        "Symbol":    { rich_text: {} },
        "Name":      { rich_text: {} },
        "BuyDate":   { date: {} },
        "BuyPrice":  { number: { format: "dollar" } },
        "Shares":    { number: { format: "number" } },
        "LevPct":    { number: { format: "number" } },
        "Status":    { select: { options: [{ name: "open", color: "green" }, { name: "closed", color: "red" }] } },
        "SellPrice": { number: { format: "dollar" } },
        "SellDate":  { date: {} },
      },
    });

    return res.status(200).send(page("Database Created!",
      `The <b>TradeVault Portfolio</b> database was created in your Notion workspace.<br><br>
       Now do this one step in Vercel:<br><br>
       <div style="background:#0e1a2e;border:1px solid #c6a44c;border-radius:8px;padding:16px 20px;margin:12px 0;font-family:monospace;font-size:15px;">
         <div style="color:#7e8aa4;font-size:11px;letter-spacing:2px;margin-bottom:8px;">ADD TO VERCEL → SETTINGS → ENVIRONMENT VARIABLES</div>
         <div style="color:#c6a44c;font-weight:bold;font-size:13px;">Name:&nbsp;&nbsp;NOTION_PORTFOLIO_DB_ID</div>
         <div style="color:#eee0bf;font-weight:bold;font-size:15px;margin-top:8px;word-break:break-all;">Value:&nbsp;&nbsp;${db.id}</div>
       </div>
       After adding the env var, click <b>Redeploy</b> in Vercel. Done!`
    ));
  } catch (e) {
    console.error("setup-portfolio error:", e);
    return res.status(500).send(page("Error", `Something went wrong: ${e.message}`));
  }
}

function page(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Portfolio Setup — TradeVault</title>
  <style>
    body { background: #0b1424; color: #eee0bf; font-family: 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #121e34; border: 1px solid #1c2c45; border-radius: 14px;
            padding: 36px; max-width: 560px; width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
    h1 { font-size: 22px; color: #c6a44c; margin: 0 0 16px; }
    p  { color: #a8a886; line-height: 1.7; margin: 0; font-size: 14px; }
    b  { color: #eee0bf; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}
