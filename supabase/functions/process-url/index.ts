import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    // Fetch page content
    let pageText = "";
    let pageTitle = url;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "hobt0-bot/1.0" },
      });
      const html = await res.text();
      // Extract title
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
      if (titleMatch) pageTitle = titleMatch[1].trim();
      // Strip HTML for summary
      pageText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);
    } catch {
      pageText = `URL: ${url}`;
    }

    // AI summarization
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a knowledge extraction engine. Given webpage content, return a JSON object with exactly these fields:
- "bullets": array of exactly 3 concise bullet point strings summarizing the key takeaways
- "tags": array of exactly 3 lowercase single-word tags
- "read_time": estimated reading time in minutes (integer)
Return ONLY valid JSON, no markdown.`,
          },
          { role: "user", content: `Title: ${pageTitle}\n\nContent: ${pageText}` },
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
        tool_choice: { type: "function", function: { name: "extract_summary" } },
      }),
    });

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

    // Save to database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase.from("cards").insert({
      url,
      title: pageTitle,
      ai_summary: summary.bullets,
      tags: summary.tags,
      read_time: summary.read_time,
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
