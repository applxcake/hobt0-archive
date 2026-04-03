// Test file to verify Gemini API is working
// Run this in browser console or as a standalone script

const GEMINI_KEY = import.meta.env?.VITE_GEMINI_API_KEY || prompt("Enter your Gemini API key:");
const GEMINI_MODEL = "gemini-2.0-flash";

const testUrls = [
  "https://example.com",
  "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "https://news.ycombinator.com"
];

async function testGemini() {
  console.log("=== GEMINI API TEST ===");
  console.log("API Key exists:", !!GEMINI_KEY);
  console.log("Model:", GEMINI_MODEL);
  
  if (!GEMINI_KEY) {
    console.error("ERROR: No API key provided");
    return;
  }

  const systemPrompt = 'Return ONLY valid JSON with keys: "summary_text" (2-4 concise sentences), "tags" (array of 3 lowercase tags), "read_time" (integer minutes). Analyze the webpage content provided.';
  
  for (const url of testUrls) {
    console.log("\n--- Testing:", url, "---");
    
    try {
      // Fetch page content
      let pageContent = "";
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
          headers: { Accept: "text/plain" },
        });
        if (jinaRes.ok) {
          pageContent = (await jinaRes.text()).slice(0, 5000);
        }
      } catch (e) {
        console.log("Jina fetch failed:", e);
      }

      if (!pageContent) {
        console.log("No page content fetched, using URL only");
      } else {
        console.log("Page content length:", pageContent.length);
      }

      const contentToAnalyze = pageContent 
        ? `URL: ${url}\n\nPage Content:\n${pageContent}`
        : `URL: ${url}`;

      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${contentToAnalyze}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      };

      console.log("Calling Gemini API...");
      const aiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      console.log("Response status:", aiResp.status);
      
      if (!aiResp.ok) {
        const errorText = await aiResp.text();
        console.error("API ERROR:", errorText);
        continue;
      }
      
      const aiData = await aiResp.json();
      console.log("Raw response:", JSON.stringify(aiData, null, 2));
      
      const text = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error("ERROR: No text in response");
        continue;
      }
      
      console.log("Text content:", text);
      
      try {
        const parsed = JSON.parse(text);
        console.log("SUCCESS! Parsed result:", parsed);
      } catch (parseErr) {
        console.error("JSON PARSE ERROR:", parseErr);
        console.log("Raw text that failed to parse:", text);
      }
    } catch (err) {
      console.error("FETCH ERROR:", err);
    }
  }
}

// Run the test
testGemini().then(() => console.log("\n=== TEST COMPLETE ==="));

export { testGemini };
