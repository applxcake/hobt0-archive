import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, AlertTriangle } from "lucide-react";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export default function GeminiTest() {
  const [url, setUrl] = useState("https://en.wikipedia.org/wiki/Artificial_intelligence");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string>("");

  const testGemini = async () => {
    // Check if YouTube URL
    const isYouTube = YOUTUBE_REGEX.test(url);
    if (isYouTube) {
      setError("YouTube videos can't be auto-summarized - Google blocks scrapers from accessing video content. Use 'Edit Summary' to write your own.");
      setResult({
        summary_text: "YouTube video. Watch the embedded player for content.",
        tags: ["youtube", "video"],
        read_time: 5
      });
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    setRawResponse("");

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
      } catch (e: any) {
        console.log("Jina fetch failed:", e);
      }

      const systemPrompt = 'Return ONLY valid JSON with keys: "summary_text" (2-4 concise sentences), "tags" (array of 3 lowercase tags), "read_time" (integer minutes). Analyze the webpage content provided.';
      
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

      const aiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const responseText = await aiResp.text();
      setRawResponse(responseText);

      if (!aiResp.ok) {
        setError(`API Error ${aiResp.status}: ${responseText}`);
        return;
      }
      
      const aiData = JSON.parse(responseText);
      const text = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        setError("No text in response");
        return;
      }
      
      try {
        const parsed = JSON.parse(text);
        setResult(parsed);
      } catch (parseErr: any) {
        setError(`JSON Parse Error: ${parseErr.message}`);
      }
    } catch (err: any) {
      setError(`Fetch Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen scanline p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-foreground">Gemini API Test</h1>
        
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">API Key: {GEMINI_KEY ? "✓ Loaded" : "✗ Missing"}</p>
          <p className="text-sm text-muted-foreground">Model: {GEMINI_MODEL}</p>
        </div>

        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="URL to summarize"
            className="flex-1"
          />
          <Button onClick={testGemini} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
          </Button>
        </div>

        {error && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500 rounded-md">
            <div className="flex items-center gap-2 text-yellow-500">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Warning</span>
            </div>
            <p className="text-sm text-yellow-500/80 mt-2">{error}</p>
          </div>
        )}

        {result && (
          <div className="p-4 bg-green-500/10 border border-green-500 rounded-md">
            <div className="flex items-center gap-2 text-green-500">
              <Check className="w-4 h-4" />
              <span className="font-medium">Success!</span>
            </div>
            <pre className="text-sm text-foreground mt-2 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        {rawResponse && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Raw Response:</p>
            <pre className="text-xs text-muted-foreground bg-secondary p-4 rounded-md overflow-auto max-h-64">{rawResponse}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
