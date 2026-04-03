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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsErr } = await supabaseClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    // Fetch page using Jina Reader
    let pageText = "";
    let pageTitle = url;
    let rawHtml = "";

    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: "text/plain", "X-Return-Format": "text" },
      });
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
        const res = await fetch(url, { headers: { "User-Agent": "hobt0-bot/1.0" } });
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

    if (!rawHtml) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "hobt0-bot/1.0" } });
        rawHtml = await res.text();
      } catch { rawHtml = ""; }
    }

    // Embed extraction
    let embedCode: string | null = null;
    let embedType: string | null = null;
    let thumbnailUrl: string | null = null;

    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      embedType = "youtube";
      thumbnailUrl = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
      embedCode = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe>`;
    }

    if (!embedType && /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)) {
      embedType = "tweet";
    }

    if (!embedType && rawHtml) {
      const iframeMatch = rawHtml.match(/<iframe[^>]+src=["']([^"']+(?:youtube|vimeo|spotify)[^"']*)["'][^>]*>/i);
      if (iframeMatch) {
        embedCode = iframeMatch[0];
        if (/youtube/i.test(iframeMatch[1])) embedType = "youtube";
        else if (/vimeo/i.test(iframeMatch[1])) embedType = "vimeo";
        else if (/spotify/i.test(iframeMatch[1])) embedType = "spotify";
        else embedType = "embed";
      }
    }

    if (!thumbnailUrl && rawHtml) {
      const ogMatch = rawHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogMatch) thumbnailUrl = ogMatch[1];
    }

    // Build AI prompt based on content type
    let systemPrompt = `You are a knowledge extraction engine. Return JSON: "bullets" (3 takeaways), "tags" (3 lowercase tags), "read_time" (integer minutes). ONLY valid JSON.`;
    if (embedType === "youtube") {
      systemPrompt = `Video content extraction. Return JSON: "bullets" (3 points about video), "tags" (3 lowercase tags), "read_time" (video duration minutes). ONLY valid JSON.`;
    } else if (embedType === "tweet") {
      systemPrompt = `Social media extraction. Return JSON: "bullets" (3 points about tweet/thread), "tags" (3 lowercase tags), "read_time" (reading time, min 1). ONLY valid JSON.`;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Title: ${pageTitle}\n\nContent: ${pageText}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_summary",
            description: "Extract summary",
            parameters: {
              type: "object",
              properties: {
                bullets: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
                read_time: { type: "integer" },
              },
              required: ["bullets", "tags", "read_time"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_summary" } },
      }),
    });

    if (!aiRes.ok) throw new Error(`AI gateway error: ${aiRes.status}`);

    const aiData = await aiRes.json();
    let summary = { bullets: [] as string[], tags: [] as string[], read_time: 3 };
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) summary = JSON.parse(toolCall.function.arguments);
    } catch { /* defaults */ }

    // Save with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabaseAdmin.from("cards").insert({
      url,
      title: pageTitle,
      ai_summary: summary.bullets,
      tags: summary.tags,
      read_time: summary.read_time,
      thumbnail_url: thumbnailUrl,
      embed_code: embedCode,
      embed_type: embedType,
      user_id: userId,
    }).select().single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-url error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
