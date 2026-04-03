import express from "express";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist");
const indexHtmlPath = path.join(distDir, "index.html");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const TIDB_HOST = process.env.TIDB_HOST;
const TIDB_PORT = Number(process.env.TIDB_PORT || "4000");
const TIDB_USER = process.env.TIDB_USER;
const TIDB_PASSWORD = process.env.TIDB_PASSWORD;
const TIDB_DATABASE = process.env.TIDB_DATABASE;
const TIDB_CA_PATH = process.env.TIDB_CA_PATH || "/etc/ssl/cert.pem";

if (!TIDB_HOST || !TIDB_USER || !TIDB_PASSWORD || !TIDB_DATABASE) {
  throw new Error("Missing TiDB config: set TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE");
}

const pool = mysql.createPool({
  host: TIDB_HOST,
  port: TIDB_PORT,
  user: TIDB_USER,
  password: TIDB_PASSWORD,
  database: TIDB_DATABASE,
  ssl: { ca: fs.readFileSync(TIDB_CA_PATH, "utf8") },
  waitForConnections: true,
  connectionLimit: 8,
});

const ensureCardsTable = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cards (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id VARCHAR(191) NOT NULL,
      url TEXT NOT NULL,
      title TEXT NULL,
      summary_text TEXT NULL,
      ai_summary JSON NULL,
      tags JSON NULL,
      read_time INT NULL,
      thumbnail_url TEXT NULL,
      embed_code LONGTEXT NULL,
      embed_type VARCHAR(64) NULL,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};

const mapCardRow = (row) => ({
  id: String(row.id),
  user_id: row.user_id,
  url: row.url,
  title: row.title,
  summary_text: row.summary_text,
  ai_summary: row.ai_summary ? JSON.parse(row.ai_summary) : [],
  tags: row.tags ? JSON.parse(row.tags) : [],
  read_time: row.read_time,
  thumbnail_url: row.thumbnail_url,
  embed_code: row.embed_code,
  embed_type: row.embed_type,
  is_public: Boolean(row.is_public),
  created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "hobt0-main-server" });
});

const processUrlMethodNotAllowed = (_req, res) => {
  res.status(405).json({
    error: "Method not allowed. Use POST /process-url with JSON body: { url: \"https://...\" }",
  });
};

app.get("/process-url", processUrlMethodNotAllowed);
app.get("/api/process-url", processUrlMethodNotAllowed);

const handleProcessUrl = async (req, res) => {
  try {
    const { url } = req.body ?? {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Missing GEMINI_API_KEY on the server (set env var and restart).",
      });
    }

    // Fetch page using Jina Reader first for clean extraction.
    let pageText = "";
    let pageTitle = url;
    let rawHtml = "";
    try {
      const jinaRes = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
        headers: { Accept: "text/plain", "X-Return-Format": "text" },
      }, 12000);
      if (jinaRes.ok) {
        pageText = (await jinaRes.text()).slice(0, 6000);
        const firstLine = pageText.split("\n")[0];
        if (firstLine?.startsWith("Title:")) {
          pageTitle = firstLine.replace("Title:", "").trim();
        }
      }
    } catch {
      // fallback below
    }

    if (!pageText) {
      try {
        const resp = await fetchWithTimeout(url, { headers: { "User-Agent": "hobt0-bot/1.0" } }, 12000);
        rawHtml = await resp.text();
        const titleMatch = rawHtml.match(/<title[^>]*>(.*?)<\/title>/is);
        if (titleMatch) pageTitle = titleMatch[1].trim();
        pageText = rawHtml
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 6000);
      } catch {
        pageText = `URL: ${url}`;
      }
    }

    if (!rawHtml) {
      try {
        const resp = await fetchWithTimeout(url, { headers: { "User-Agent": "hobt0-bot/1.0" } }, 12000);
        rawHtml = await resp.text();
      } catch {
        rawHtml = "";
      }
    }

    // Embed extraction
    let embedCode = null;
    let embedType = null;
    let thumbnailUrl = null;

    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (ytMatch) {
      embedType = "youtube";
      thumbnailUrl = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
      embedCode = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe>`;
    }

    if (!embedType && /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)) {
      embedType = "tweet";
    }

    if (!embedType && rawHtml) {
      const iframeMatch = rawHtml.match(
        /<iframe[^>]+src=["']([^"']+(?:youtube|vimeo|spotify)[^"']*)["'][^>]*>/i
      );
      if (iframeMatch) {
        embedCode = iframeMatch[0];
        if (/youtube/i.test(iframeMatch[1])) embedType = "youtube";
        else if (/vimeo/i.test(iframeMatch[1])) embedType = "vimeo";
        else if (/spotify/i.test(iframeMatch[1])) embedType = "spotify";
        else embedType = "embed";
      }
    }

    if (!thumbnailUrl && rawHtml) {
      const ogMatch = rawHtml.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      );
      if (ogMatch) thumbnailUrl = ogMatch[1];
    }

    // Build AI prompt based on content type
    let systemPrompt =
      'You are a knowledge extraction engine. Return ONLY valid JSON with these exact fields: "summary_text" (one concise paragraph, 2-4 sentences), "tags" (3 lowercase tags), "read_time" (integer minutes).';
    if (embedType === "youtube") {
      systemPrompt =
        'You are a video summarization engine. Infer the likely video topic from title/page text and return ONLY valid JSON with: "summary_text" (one concise paragraph, 2-4 sentences), "tags" (3 lowercase tags), "read_time" (estimated duration in minutes).';
    } else if (embedType === "tweet") {
      systemPrompt =
        'You are a social media summarization engine. Return ONLY valid JSON with: "summary_text" (one concise paragraph, 2-4 sentences), "tags" (3 lowercase tags), "read_time" (reading time in minutes, min 1).';
    }

    const aiRes = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\nTitle: ${pageTitle}\n\nContent: ${pageText}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      }),
    },
    15000
    );

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      return res.status(500).json({ error: `Gemini API error: ${aiRes.status}`, details: txt });
    }

    const aiData = await aiRes.json();
    let summary = { summary_text: "", tags: [], read_time: 3 };
    try {
      const text = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        summary = {
          summary_text:
            typeof parsed?.summary_text === "string" ? parsed.summary_text.trim() : "",
          tags: Array.isArray(parsed?.tags) ? parsed.tags : [],
          read_time: typeof parsed?.read_time === "number" ? parsed.read_time : 3,
        };
      }
    } catch {
      // keep defaults
    }

    return res.json({
      title: pageTitle,
      summary_text: summary.summary_text,
      ai_summary: summary.summary_text ? [summary.summary_text] : [],
      tags: summary.tags,
      read_time: summary.read_time,
      thumbnail_url: thumbnailUrl,
      embed_code: embedCode,
      embed_type: embedType,
    });
  } catch (e) {
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Unknown server error",
    });
  }
};

app.post("/process-url", handleProcessUrl);
app.post("/api/process-url", handleProcessUrl);

app.get("/api/cards", async (req, res) => {
  try {
    const userId = typeof req.query.user_id === "string" ? req.query.user_id : "";
    if (!userId) return res.status(400).json({ error: "user_id is required" });
    const [rows] = await pool.execute(
      `SELECT id, user_id, url, title, summary_text, ai_summary, tags, read_time, thumbnail_url, embed_code, embed_type, is_public, created_at
       FROM cards
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.json(rows.map(mapCardRow));
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list cards" });
  }
});

app.get("/api/cards/public", async (req, res) => {
  try {
    const userId = typeof req.query.user_id === "string" ? req.query.user_id : "";
    if (!userId) return res.status(400).json({ error: "user_id is required" });
    const [rows] = await pool.execute(
      `SELECT id, user_id, url, title, summary_text, ai_summary, tags, read_time, thumbnail_url, embed_code, embed_type, is_public, created_at
       FROM cards
       WHERE user_id = ? AND is_public = TRUE
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.json(rows.map(mapCardRow));
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list public cards" });
  }
});

app.post("/api/cards", async (req, res) => {
  try {
    const {
      user_id,
      url,
      title,
      summary_text,
      ai_summary,
      tags,
      read_time,
      thumbnail_url,
      embed_code,
      embed_type,
      is_public,
    } = req.body ?? {};
    if (!user_id || typeof user_id !== "string") return res.status(400).json({ error: "user_id is required" });
    if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required" });

    const [result] = await pool.execute(
      `INSERT INTO cards (
        user_id, url, title, summary_text, ai_summary, tags, read_time, thumbnail_url, embed_code, embed_type, is_public
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        url,
        typeof title === "string" ? title : null,
        typeof summary_text === "string" ? summary_text : null,
        JSON.stringify(Array.isArray(ai_summary) ? ai_summary : []),
        JSON.stringify(Array.isArray(tags) ? tags : []),
        typeof read_time === "number" ? Math.max(0, Math.floor(read_time)) : null,
        typeof thumbnail_url === "string" ? thumbnail_url : null,
        typeof embed_code === "string" ? embed_code : null,
        typeof embed_type === "string" ? embed_type : null,
        Boolean(is_public),
      ]
    );

    return res.status(201).json({ id: String(result.insertId) });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create card" });
  }
});

app.patch("/api/cards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_public } = req.body ?? {};
    if (typeof is_public !== "boolean") {
      return res.status(400).json({ error: "is_public must be a boolean" });
    }
    const [result] = await pool.execute("UPDATE cards SET is_public = ? WHERE id = ?", [is_public, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Card not found" });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to update card" });
  }
});

app.delete("/api/cards/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute("DELETE FROM cards WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Card not found" });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to delete card" });
  }
});

// Serve the frontend from the same server.
app.use(express.static(distDir));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  return res.sendFile(indexHtmlPath);
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
(async () => {
  try {
    await ensureCardsTable();
    app.listen(port, () => {
      console.log(`[hobt0 api] listening on http://127.0.0.1:${port}`);
    });
  } catch (e) {
    console.error("[hobt0 api] failed to initialize TiDB:", e);
    process.exit(1);
  }
})();

