import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { collection, addDoc, Timestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface AddCardDialogProps {
  onCardAdded: () => void;
}

const SUMMARY_PATTERNS_KEY = "hobt0_summary_patterns_v1";
const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const getDomain = (url: string): string => {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const savePattern = (url: string, summary: string) => {
  if (!summary.trim()) return;
  try {
    const domain = getDomain(url);
    if (!domain) return;
    const raw = localStorage.getItem(SUMMARY_PATTERNS_KEY);
    const patterns = raw ? JSON.parse(raw) : {};
    if (!patterns[domain]) patterns[domain] = [];
    patterns[domain].unshift({ url, summary, ts: Date.now() });
    patterns[domain] = patterns[domain].slice(0, 10); // Keep last 10
    localStorage.setItem(SUMMARY_PATTERNS_KEY, JSON.stringify(patterns));
  } catch { /* ignore */ }
};

const getPatternsForDomain = (url: string): Array<{url: string; summary: string}> => {
  try {
    const domain = getDomain(url);
    if (!domain) return [];
    const raw = localStorage.getItem(SUMMARY_PATTERNS_KEY);
    const patterns = raw ? JSON.parse(raw) : {};
    return patterns[domain] || [];
  } catch {
    return [];
  }
};

const estimateReadTime = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(30, Math.round(words / 220) || 1));
};

const AddCardDialog = ({ onCardAdded }: AddCardDialogProps) => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [customSummary, setCustomSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [similarPatterns, setSimilarPatterns] = useState<Array<{url: string; summary: string}>>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Detect YouTube URLs
  const isYouTubeUrl = (url: string): boolean => {
    return YOUTUBE_REGEX.test(url);
  };

  const fetchWithTimeout = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
    timeoutMs = 8000
  ) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const summarizeWithGemini = async (targetUrl: string, pageContent: string, embedType: string | null, userSummaryHint?: string, isRetry = false) => {
    const geminiKey = isRetry 
      ? import.meta.env.VITE_GEMINI_API_KEY_BACKUP 
      : import.meta.env.VITE_GEMINI_API_KEY;
    const geminiModel = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";
    
    console.log(`[Gemini] ${isRetry ? 'Retry with backup' : 'Primary'} key for:`, targetUrl);
    
    if (!geminiKey) {
      console.error("[Gemini] No API key found");
      return null;
    }

    // Faster prompt - shorter and more direct
    let systemPrompt = 'Return JSON: {"summary_text":"2-3 sentence summary","tags":["tag1","tag2","tag3"],"read_time":minutes}';
    
    if (embedType === "youtube") {
      systemPrompt = 'Return JSON: {"summary_text":"2-3 sentences about video","tags":["tag1","tag2","tag3"],"read_time":video_minutes}';
    } else if (embedType === "tweet") {
      systemPrompt = 'Return JSON: {"summary_text":"2-3 sentences about tweet","tags":["tag1","tag2","tag3"],"read_time":1}';
    }

    if (userSummaryHint) {
      systemPrompt += ` Style: ${userSummaryHint.slice(0, 100)}`;
    }

    // Shorter content for faster response
    const contentToAnalyze = pageContent 
      ? `URL: ${targetUrl}\nContent: ${pageContent.slice(0, 3000)}`
      : `URL: ${targetUrl}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${contentToAnalyze}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    };

    try {
      const aiResp = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        8000 // 8 second timeout
      );

      if (!aiResp.ok) {
        const errorText = await aiResp.text();
        console.error(`[Gemini] API error (${isRetry ? 'backup' : 'primary'}):`, errorText);
        
        // If primary failed and we have backup, retry
        if (!isRetry && import.meta.env.VITE_GEMINI_API_KEY_BACKUP) {
          console.log("[Gemini] Retrying with backup key...");
          return summarizeWithGemini(targetUrl, pageContent, embedType, userSummaryHint, true);
        }
        return null;
      }
      
      const aiData = await aiResp.json();
      const text = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;
      
      try {
        const parsed = JSON.parse(text);
        return {
          summary_text: typeof parsed?.summary_text === "string" ? parsed.summary_text.trim() : "",
          tags: Array.isArray(parsed?.tags) ? parsed.tags.slice(0, 3) : [],
          read_time: typeof parsed?.read_time === "number" ? parsed.read_time : null,
        };
      } catch {
        return null;
      }
    } catch (err) {
      console.error(`[Gemini] Fetch error (${isRetry ? 'backup' : 'primary'}):`, err);
      
      // If primary failed and we have backup, retry
      if (!isRetry && import.meta.env.VITE_GEMINI_API_KEY_BACKUP) {
        console.log("[Gemini] Retrying with backup key...");
        return summarizeWithGemini(targetUrl, pageContent, embedType, userSummaryHint, true);
      }
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    // Check if YouTube and summary is required
    const isYouTube = isYouTubeUrl(url);
    if (isYouTube && !customSummary.trim()) {
      toast({ 
        title: "Summary required for YouTube", 
        description: "Please describe the video content so AI can generate a summary.", 
        variant: "destructive" 
      });
      return;
    }
    
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to add cards.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const targetUrl = url.trim();
    
    // Extract basic info immediately (no async)
    const ytMatch = targetUrl.match(YOUTUBE_REGEX);
    const isTweet = /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/.test(targetUrl);
    const embedType = ytMatch ? "youtube" : isTweet ? "tweet" : null;
    const thumbnailUrl = ytMatch ? `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg` : null;
    const embedCode = ytMatch ? `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe>` : null;
    
    // Check validation synchronously (already validated at start, just set loading state)
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to add cards.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Create card with URL as initial title
    const placeholderSummary = customSummary.trim() || "Generating summary...";
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const cardData = {
      url: targetUrl,
      title: targetUrl, // Will be updated later
      summary_text: placeholderSummary,
      ai_summary: [placeholderSummary],
      tags: [],
      read_time: estimateReadTime(placeholderSummary),
      thumbnail_url: thumbnailUrl,
      embed_code: embedCode,
      embed_type: embedType,
      user_id: user.uid,
      is_public: false,
      created_at: Timestamp.now(),
    };

    // Capture values before clearing
    const userHint = customSummary.trim();

    // Add to UI immediately (optimistic)
    queryClient.setQueryData(["cards", user.uid], (old: any[] = []) => [
      { ...cardData, id: tempId }, 
      ...old
    ]);

    // Close dialog immediately
    setUrl("");
    setCustomSummary("");
    setSimilarPatterns([]);
    setOpen(false);
    setLoading(false);
    toast({ title: "Card archived", description: "Generating AI summary in background..." });

    // Background: Get title and save to Firestore
    (async () => {
      let pageTitle = targetUrl;
      try {
        const jinaRes = await fetchWithTimeout(`https://r.jina.ai/${targetUrl}`, {
          headers: { Accept: "text/plain" },
        }, 5000);
        if (jinaRes.ok) {
          const text = await jinaRes.text();
          const firstLine = text.split("\n")[0];
          if (firstLine?.startsWith("Title:")) {
            pageTitle = firstLine.replace("Title:", "").trim();
          }
        }
      } catch {
        // Ignore
      }

      // Save to Firestore with the fetched title
      const finalCardData = { ...cardData, title: pageTitle || targetUrl };
      
      try {
        const docRef = await addDoc(collection(db, "cards"), finalCardData);
        const realId = docRef.id;
        
        // Update cache with real ID and title
        queryClient.setQueryData(["cards", user.uid], (old: any[] = []) => 
          old.map(c => c.id === tempId ? { ...finalCardData, id: realId } : c)
        );
        
        // Run AI with real ID
        if (embedType === "youtube") {
          if (userHint) {
            generateAiSummary(realId, targetUrl, embedType, userHint);
          }
        } else {
          generateAiSummary(realId, targetUrl, embedType, userHint);
        }
      } catch (err) {
        console.error("[BG] Failed to save card:", err);
        toast({ title: "Error", description: "Failed to save card", variant: "destructive" });
      }
    })();
  };

  // Background AI generation
  const generateAiSummary = async (
    cardId: string, 
    targetUrl: string, 
    embedType: string | null,
    userCustomSummary: string
  ) => {
    // For YouTube: use user's summary as context for Gemini
    // For others: if user wrote custom summary, skip AI and just save it
    if (userCustomSummary && embedType !== "youtube") {
      savePattern(targetUrl, userCustomSummary);
      return;
    }

    console.log("[BG] Starting AI summary for:", targetUrl);
    
    // Fetch page content
    let pageContent = "";
    try {
      const jinaRes = await fetchWithTimeout(`https://r.jina.ai/${targetUrl}`, {
        headers: { Accept: "text/plain" },
      }, 8000);
      if (jinaRes.ok) {
        pageContent = (await jinaRes.text()).slice(0, 10000);
      }
    } catch {
      // Try fallback
      try {
        const resp = await fetchWithTimeout(targetUrl, { headers: { "User-Agent": "hobt0-bot/1.0" } }, 5000);
        const html = await resp.text();
        pageContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
      } catch {
        // Ignore
      }
    }

    // Call Gemini (with user's summary as content for YouTube, or hint for others)
    const contentForGemini = embedType === "youtube" && userCustomSummary ? userCustomSummary : pageContent;
    const data = await summarizeWithGemini(targetUrl, contentForGemini, embedType, userCustomSummary);
    console.log("[BG] Gemini result:", data);
    
    if (!data?.summary_text) {
      console.log("[BG] No summary generated, keeping placeholder");
      return;
    }

    // Update card in Firestore
    try {
      const cardRef = doc(db, "cards", cardId);
      await updateDoc(cardRef, {
        summary_text: data.summary_text,
        ai_summary: [data.summary_text],
        tags: data.tags || [],
        read_time: data.read_time || estimateReadTime(data.summary_text),
      });
      console.log("[BG] Card updated with AI summary");
      
      // Update local cache
      const STORAGE_KEY = "hobt0_cards_v1";
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.userId === user?.uid) {
          const updated = parsed.cards.map((c: any) => 
            c.id === cardId 
              ? { ...c, summary_text: data.summary_text, ai_summary: [data.summary_text], tags: data.tags || [] }
              : c
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, cards: updated }));
        }
      }
      
      toast({ title: "AI summary ready", description: "Card updated with generated summary" });
    } catch (err) {
      console.error("[BG] Failed to update card:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs uppercase tracking-wider">
          <Plus className="w-3.5 h-3.5" />
          Archive
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm uppercase tracking-wider text-foreground">
            Archive URL
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => {
              const newUrl = e.target.value;
              setUrl(newUrl);
              // Load similar patterns for this domain
              if (newUrl.includes(".")) {
                const patterns = getPatternsForDomain(newUrl);
                setSimilarPatterns(patterns);
              } else {
                setSimilarPatterns([]);
              }
            }}
            required
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-sm"
          />
          {similarPatterns.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Similar links you've summarized before:
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {similarPatterns.slice(0, 3).map((pattern, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCustomSummary(pattern.summary)}
                    className="w-full text-left p-2 rounded bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="block truncate text-[10px] text-muted-foreground/70">{pattern.url}</span>
                    <span className="line-clamp-2">{pattern.summary}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Textarea
            placeholder={isYouTubeUrl(url) ? "Required for YouTube: describe the video content (e.g., title, what it's about)..." : "Optional: write your own summary..."}
            value={customSummary}
            onChange={(e) => setCustomSummary(e.target.value)}
            rows={4}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-sm resize-none"
          />
          <Button type="submit" disabled={loading} className="w-full text-xs uppercase tracking-wider">
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              "Process & Save"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddCardDialog;
