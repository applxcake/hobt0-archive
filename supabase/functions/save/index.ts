import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, secret_key, user_id } = await req.json();

    // Validate secret key
    const expectedKey = Deno.env.get("HOBT0_SECRET_KEY");
    if (!expectedKey || secret_key !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    // Fetch page using Jina Reader for better content extraction
    let pageText = "";
    let pageTitle = url;
    let rawHtml = "";

    try {
      // Try Jina Reader first for clean content
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          Accept: "text/plain",
          "X-Return-Format": "text",
        },
      });
      if (jinaRes.ok) {
        pageText = (await jinaRes.text()).slice(0, 6000);
        // Extract title from first line (Jina returns title as first line)
        const firstLine = pageText.split("\n")[0];
        if (firstLine && firstLine.startsWith("Title:")) {
          pageTitle = firstLine.replace("Title:", "").trim();
        }
      }
    } catch {
      console.log("Jina Reader failed, falling back to direct fetch");
    }

    // Fallback to direct fetch if Jina failed
    if (!pageText) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "hobt0-bot/1.0" },
        });
        rawHtml = await res.text();
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

    // Also fetch raw HTML if we don't have it (for embed extraction)
    if (!rawHtml) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "hobt0-bot/1.0" },
        });
        rawHtml = await res.text();
      } catch {
        rawHtml = "";
      }
    }

    // Extract embeds from HTML
    let embedCode = null;
    let embedType = null;
    let thumbnailUrl = null;

    // YouTube detection
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (ytMatch) {
      embedType = "youtube";
      thumbnailUrl = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
      embedCode = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe>`;
    }

    // Twitter/X detection
    if (!embedType && /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)) {
      embedType = "tweet";
    }

    // Extract iframe embeds from HTML
    if (!embedType && rawHtml) {
      const iframeMatch = rawHtml.match(
        /<iframe[^>]+src=["']([^"']+(?:youtube|vimeo|twitter|spotify)[^"']*)["'][^>]*>/i
      );
      if (iframeMatch) {
        embedCode = iframeMatch[0];
        if (/youtube/i.test(iframeMatch[1])) embedType = "youtube";
        else if (/vimeo/i.test(iframeMatch[1])) embedType = "vimeo";
        else if (/spotify/i.test(iframeMatch[1])) embedType = "spotify";
        else embedType = "embed";
      }
    }

    // Extract og:image for thumbnail
    if (!thumbnailUrl && rawHtml) {
      const ogMatch = rawHtml.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      );
      if (ogMatch) thumbnailUrl = ogMatch[1];
    }

    // Build AI prompt based on content type
    let systemPrompt = `You are a knowledge extraction engine. Given webpage content, return a JSON object with exactly these fields:
- "bullets": array of exactly 3 concise bullet point strings summarizing the key takeaways
- "tags": array of exactly 3 lowercase single-word tags
- "read_time": estimated reading time in minutes (integer)
Return ONLY valid JSON, no markdown.`;

    if (embedType === "youtube") {
      systemPrompt = `You are a knowledge extraction engine specialized in video content. Given a YouTube video page, return a JSON object with:
- "bullets": array of exactly 3 concise bullet points about the video content
- "tags": array of exactly 3 lowercase single-word tags
- "read_time": estimated video duration in minutes (integer)
Focus on the video content, not the page structure. Return ONLY valid JSON, no markdown.`;
    } else if (embedType === "tweet") {
      systemPrompt = `You are a knowledge extraction engine specialized in social media. Given a tweet/thread, return a JSON object with:
- "bullets": array of exactly 3 concise bullet points capturing the thread/discussion
- "tags": array of exactly 3 lowercase single-word tags
- "read_time": estimated reading time in minutes (integer, minimum 1)
Focus on the actual tweet content and thread context. Return ONLY valid JSON, no markdown.`;
    }

    // AI summarization
    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Title: ${pageTitle}\n\nContent: ${pageText}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_summary",
                description: "Extract summary from webpage content",
                parameters: {
                  type: "object",
                  properties: {
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      description: "3 bullet point summaries",
                    },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "3 lowercase tags",
                    },
                    read_time: {
                      type: "integer",
                      description: "Estimated read time in minutes",
                    },
                  },
                  required: ["bullets", "tags", "read_time"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_summary" },
          },
        }),
      }
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    let summary = { bullets: [], tags: [], read_time: 3 };

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        summary = JSON.parse(toolCall.function.arguments);
      }
    } catch {
      console.error("Failed to parse AI response");
    }

    // Save
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const insertData: Record<string, unknown> = {
      url,
      title: pageTitle,
      ai_summary: summary.bullets,
      tags: summary.tags,
      read_time: summary.read_time,
      thumbnail_url: thumbnailUrl,
      embed_code: embedCode,
      embed_type: embedType,
    };

    // If user_id provided, associate with user
    if (user_id) {
      insertData.user_id = user_id;
    }

    const { data, error } = await supabase
      .from("cards")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, card: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("save error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
