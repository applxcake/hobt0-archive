import { useState } from "react";
import { ExternalLink, Calendar, Lock, Unlock, MoreVertical, Trash2, Share2, Loader2, Edit3, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type Card = {
  id: string;
  url: string;
  title?: string | null;
  summary_text?: string | null;
  ai_summary?: unknown;
  tags?: string[] | null;
  created_at: string | { seconds: number; nanoseconds: number };
  thumbnail_url?: string | null;
  embed_code?: string | null;
  embed_type?: string | null;
  is_public?: boolean;
  show_embed?: boolean | null;
  read_time?: number | null;
  reading_status?: "unread" | "reading" | "completed" | null;
};

interface KnowledgeCardProps {
  card: Card;
  index: number;
  isOwner?: boolean;
  userId?: string;
  embedPreference?: "on" | "off" | "manual";
}

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_KEY_BACKUP = import.meta.env.VITE_GEMINI_API_KEY_BACKUP;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash-preview";

const getYouTubeId = (url: string): string | null => {
  const match = url.match(YOUTUBE_REGEX);
  return match?.[1] ?? null;
};

const isImageUrl = (url: string): boolean => {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
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

const summarizeWithGemini = async (
  targetUrl: string, 
  pageContent: string, 
  embedType: string | null,
  extraContext?: string,
  isRetry = false
) => {
  const key = isRetry ? GEMINI_KEY_BACKUP : GEMINI_KEY;
  if (!key) return null;

  let prompt = 'Return JSON:{"summary_text":"2-3 sentences","tags":["t1","t2","t3"],"read_time":minutes}';
  if (embedType === "youtube") prompt = 'Return JSON:{"summary_text":"2-3 sentences about video","tags":["t1","t2","t3"],"read_time":minutes}';
  if (embedType === "tweet") prompt = 'Return JSON:{"summary_text":"2-3 sentences about tweet","tags":["t1","t2","t3"],"read_time":1}';
  if (extraContext) prompt += ` Context:${extraContext.slice(0, 50)}`;

  const content = pageContent ? `URL:${targetUrl}\nContent:${pageContent.slice(0, 3000)}` : `URL:${targetUrl}`;
  
  try {
    const resp = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${content}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.3 } }) },
      8000
    );
    
    if (!resp.ok) {
      if (!isRetry && GEMINI_KEY_BACKUP) return summarizeWithGemini(targetUrl, pageContent, embedType, extraContext, true);
      return null;
    }
    
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    
    const parsed = JSON.parse(text);
    return {
      summary_text: typeof parsed?.summary_text === "string" ? parsed.summary_text.trim() : "",
      tags: Array.isArray(parsed?.tags) ? parsed.tags.slice(0, 3) : [],
      read_time: typeof parsed?.read_time === "number" ? parsed.read_time : null,
    };
  } catch {
    if (!isRetry && GEMINI_KEY_BACKUP) return summarizeWithGemini(targetUrl, pageContent, embedType, extraContext, true);
    return null;
  }
};

const fetchPageContent = async (url: string): Promise<{ content: string; title: string }> => {
  try {
    const jinaRes = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "text" },
    }, 8000);
    if (jinaRes.ok) {
      const text = await jinaRes.text();
      const firstLine = text.split("\n")[0];
      const title = firstLine?.startsWith("Title:") ? firstLine.replace("Title:", "").trim() : url;
      return { content: text.slice(0, 10000), title };
    }
  } catch { /* ignore */ }

  try {
    const resp = await fetchWithTimeout(url, { headers: { "User-Agent": "hobt0-bot/1.0" } }, 8000);
    const html = await resp.text();
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    const title = titleMatch?.[1]?.trim() || url;
    const content = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    return { content, title };
  } catch {
    return { content: "", title: url };
  }
};

const KnowledgeCard = ({ card, index, isOwner = false, userId, embedPreference = "on" }: KnowledgeCardProps) => {
  // Helper to determine if embed should be shown
  const shouldShowEmbed = (): boolean => {
    if (embedPreference === "off") return false;
    if (embedPreference === "on") return true;
    // Manual mode - check per-card setting
    return card.show_embed !== false; // Default to true if not set
  };

  const summaryParagraph =
    typeof card.summary_text === "string" && card.summary_text.trim()
      ? card.summary_text.trim()
      : Array.isArray(card.ai_summary) && card.ai_summary.length
        ? String(card.ai_summary[0] ?? "").trim()
        : "";
  const summary = Array.isArray(card.ai_summary) ? (card.ai_summary as string[]) : [];
  const tags = card.tags ?? [];
  const createdAtDate =
    typeof card.created_at === "object" &&
    card.created_at &&
    "seconds" in card.created_at
      ? new Date((card.created_at.seconds as number) * 1000)
      : new Date(card.created_at as string);
  const date = createdAtDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isPublic, setIsPublic] = useState(card.is_public ?? false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [readingStatus, setReadingStatus] = useState<"unread" | "reading" | "completed">(card.reading_status || "unread");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  // Edit node dialog - now allows editing title, url, summary, tags, and show_embed
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState(card.title || "");
  const [editedUrl, setEditedUrl] = useState(card.url || "");
  const [editedSummary, setEditedSummary] = useState(summaryParagraph);
  const [editedTags, setEditedTags] = useState(tags.join(", "));
  const [editedShowEmbed, setEditedShowEmbed] = useState(card.show_embed !== false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  // Regenerate dialog
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [extraContext, setExtraContext] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  const youtubeId = getYouTubeId(card.url);
  const isImage = isImageUrl(card.url);
  const thumbnailUrl = card.thumbnail_url as string | null;

  if (isDeleted) return null;

  const togglePrivacy = async () => {
    const newValue = !isPublic;
    setIsPublic(newValue); // Optimistic update
    setIsToggling(true);
    
    // Show toast immediately
    toast({ title: newValue ? "Card set to public" : "Card set to private" });
    
    // Update local cache immediately
    if (userId) {
      const STORAGE_KEY = "hobt0_cards_v1";
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.userId === userId) {
          const updated = parsed.cards.map((c: any) => 
            c.id === card.id ? { ...c, is_public: newValue } : c
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, cards: updated }));
        }
      }
    }
    
    // Background Firestore write with timeout
    const updateWithTimeout = async () => {
      const cardRef = doc(db, "cards", card.id);
      await updateDoc(cardRef, { is_public: newValue });
    };

    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout")), 3000)
    );

    try {
      await Promise.race([updateWithTimeout(), timeout]);
    } catch (error: any) {
      if (error.message !== "Timeout") {
        setIsPublic(!newValue); // Rollback on real error
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } finally {
      setIsToggling(false);
    }
  };

  const deleteCard = async () => {
    setIsDeleting(true);
    setIsDeleted(true); // Optimistic - hide immediately
    
    toast({ title: "Card deleted" });
    
    // Update local cache immediately
    if (userId) {
      const STORAGE_KEY = "hobt0_cards_v1";
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.userId === userId) {
          const updated = parsed.cards.filter((c: any) => c.id !== card.id);
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, cards: updated }));
        }
      }
    }
    
    // Background Firestore write with timeout
    const deleteWithTimeout = async () => {
      const cardRef = doc(db, "cards", card.id);
      await deleteDoc(cardRef);
    };

    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout")), 3000)
    );

    try {
      await Promise.race([deleteWithTimeout(), timeout]);
    } catch (error: any) {
      if (error.message !== "Timeout") {
        setIsDeleted(false); // Rollback on real error
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const shareCard = () => {
    // Make card public first if it's private
    if (!isPublic) {
      togglePrivacy();
    }
    
    const shareUrl = `${window.location.origin}/card/${card.id}`;
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied", description: "Anyone can now view this card with this link." });
  };

  const updateReadingStatus = async (status: "unread" | "reading" | "completed") => {
    if (!userId) return;
    setIsUpdatingStatus(true);
    setReadingStatus(status);
    
    // Update local cache immediately
    const STORAGE_KEY = "hobt0_cards_v1";
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.userId === userId) {
        const updated = parsed.cards.map((c: any) => 
          c.id === card.id ? { ...c, reading_status: status } : c
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, cards: updated }));
      }
    }
    
    // Background Firestore write
    try {
      const cardRef = doc(db, "cards", card.id);
      await updateDoc(cardRef, { reading_status: status });
    } catch (err) {
      console.error("Failed to update reading status:", err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const saveEditedNode = async () => {
    if (!userId) return;
    setIsSavingEdit(true);
    
    // Parse tags from comma-separated string
    const parsedTags = editedTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 5); // Max 5 tags
    
    const newData = {
      title: editedTitle.trim() || card.url,
      url: editedUrl.trim() || card.url,
      summary_text: editedSummary.trim(),
      ai_summary: editedSummary.trim() ? [editedSummary.trim()] : [],
      tags: parsedTags,
      show_embed: editedShowEmbed,
    };
    
    const STORAGE_KEY = "hobt0_cards_v1";
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.userId === userId) {
        const updated = parsed.cards.map((c: any) => 
          c.id === card.id ? { ...c, ...newData } : c
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, cards: updated }));
      }
    }
    
    toast({ title: "Node updated" });
    setEditDialogOpen(false);
    
    try {
      const cardRef = doc(db, "cards", card.id);
      await updateDoc(cardRef, newData);
    } catch (err: any) {
      toast({ title: "Sync error", description: err.message, variant: "destructive" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const regenerateSummary = async () => {
    if (!userId) return;
    setIsRegenerating(true);
    
    toast({ title: "Regenerating summary..." });
    
    const embedType = card.embed_type || null;
    
    // For YouTube: only proceed if user provided context
    if (embedType === "youtube" && !extraContext?.trim()) {
      toast({ title: "YouTube videos can't be auto-summarized", description: "Please provide context above to generate a summary", variant: "destructive" });
      setIsRegenerating(false);
      return;
    }
    
    const { content } = await fetchPageContent(card.url);
    const contextForAI = embedType === "youtube" ? extraContext : (extraContext || undefined);
    const data = await summarizeWithGemini(card.url, embedType === "youtube" ? "" : content, embedType, contextForAI);
    
    if (!data?.summary_text) {
      toast({ title: "Failed to regenerate", description: "Please try again", variant: "destructive" });
      setIsRegenerating(false);
      return;
    }
    
    const newData = {
      summary_text: data.summary_text,
      ai_summary: [data.summary_text],
      tags: data.tags,
      read_time: data.read_time,
    };
    
    const STORAGE_KEY = "hobt0_cards_v1";
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.userId === userId) {
        const updated = parsed.cards.map((c: any) => 
          c.id === card.id ? { ...c, ...newData } : c
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, cards: updated }));
      }
    }
    
    toast({ title: "Summary regenerated" });
    setRegenDialogOpen(false);
    setExtraContext("");
    
    try {
      const cardRef = doc(db, "cards", card.id);
      await updateDoc(cardRef, newData);
    } catch (err: any) {
      toast({ title: "Sync error", description: err.message, variant: "destructive" });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <>
      <div
        className="group block border border-border bg-card rounded-md overflow-hidden hover:border-primary transition-[border-color] duration-200 animate-fade-in"
        style={{ 
          backfaceVisibility: 'hidden', 
          WebkitBackfaceVisibility: 'hidden', 
          animationDelay: `${index * 60}ms`,
          transform: 'translateZ(0)'
        }}
      >
        {/* YouTube Embed - conditionally shown based on preference */}
        {shouldShowEmbed() && youtubeId && (
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        )}

        {/* Image Preview - conditionally shown based on preference */}
        {shouldShowEmbed() && !youtubeId && isImage && (
          <img src={card.url} alt={card.title || "Image"} className="w-full object-cover max-h-64" loading="lazy" />
        )}

        {/* Thumbnail fallback - conditionally shown based on preference */}
        {shouldShowEmbed() && !youtubeId && !isImage && thumbnailUrl && (
          <img src={thumbnailUrl} alt={card.title || ""} className="w-full object-cover max-h-40" loading="lazy" />
        )}

        {/* Embed code - conditionally shown based on preference */}
        {shouldShowEmbed() && !youtubeId && !isImage && !thumbnailUrl && card.embed_code && (
          <div
            className="w-full overflow-hidden max-h-64"
            dangerouslySetInnerHTML={{ __html: card.embed_code as string }}
          />
        )}

        <div className="p-4">
          {/* Title - separate from URL now */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-foreground leading-tight line-clamp-2 flex-1">
              {card.title || card.url}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {isOwner && (
                <button 
                  onClick={togglePrivacy} 
                  disabled={isToggling}
                  className="p-1 hover:text-primary transition-colors disabled:opacity-50"
                >
                  {isToggling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isPublic ? (
                    <Unlock className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
              <a href={card.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors" />
              </a>
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border">
                    <DropdownMenuItem onClick={() => setEditDialogOpen(true)} className="text-xs gap-2">
                      <Edit3 className="w-3 h-3" />
                      Edit Node
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRegenDialogOpen(true)} className="text-xs gap-2">
                      <Sparkles className="w-3 h-3" />
                      Regenerate Summary
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={togglePrivacy} className="text-xs gap-2" disabled={isToggling}>
                      {isToggling ? <Loader2 className="w-3 h-3 animate-spin" /> : isPublic ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {isPublic ? "Make Private" : "Make Public"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={shareCard} className="text-xs gap-2">
                      <Share2 className="w-3 h-3" />
                      Share Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={deleteCard} disabled={isDeleting} className="text-xs gap-2 text-destructive">
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* URL - now shown separately below title */}
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[10px] text-muted-foreground/70 mb-3 truncate hover:text-primary transition-colors"
          >
            {card.url}
          </a>

          {/* One-paragraph summary */}
          {summaryParagraph && (
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {summaryParagraph}
            </p>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-secondary text-secondary-foreground border border-border"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-wider">
              {card.embed_type && (
                <span className="text-primary">{card.embed_type}</span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {date}
              </span>
            </div>
            {isOwner && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => updateReadingStatus("unread")}
                  disabled={isUpdatingStatus}
                  className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm border transition-colors ${
                    readingStatus === "unread"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                  title="Mark as unread"
                >
                  Unread
                </button>
                <button
                  onClick={() => updateReadingStatus("reading")}
                  disabled={isUpdatingStatus}
                  className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm border transition-colors ${
                    readingStatus === "reading"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                  title="Mark as reading"
                >
                  Reading
                </button>
                <button
                  onClick={() => updateReadingStatus("completed")}
                  disabled={isUpdatingStatus}
                  className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm border transition-colors ${
                    readingStatus === "completed"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                  title="Mark as completed"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Node Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm uppercase tracking-wider text-foreground">
              Edit Node
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Title</label>
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="Enter title..."
                className="bg-secondary border-border text-foreground text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">URL</label>
              <Input
                type="url"
                value={editedUrl}
                onChange={(e) => setEditedUrl(e.target.value)}
                placeholder="https://..."
                className="bg-secondary border-border text-foreground text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Summary</label>
              <Textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                placeholder="Enter summary..."
                rows={4}
                className="bg-secondary border-border text-foreground text-sm resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Tags (comma separated)</label>
              <Input
                value={editedTags}
                onChange={(e) => setEditedTags(e.target.value)}
                placeholder="tag1, tag2, tag3..."
                className="bg-secondary border-border text-foreground text-sm"
              />
            </div>
            {/* Show embed toggle - only visible in manual mode */}
            {embedPreference === "manual" && (
              <div className="flex items-center justify-between pt-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Show Embed</label>
                <button
                  type="button"
                  onClick={() => setEditedShowEmbed(!editedShowEmbed)}
                  className={`px-3 py-1 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                    editedShowEmbed
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border"
                  }`}
                >
                  {editedShowEmbed ? "On" : "Off"}
                </button>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button 
                onClick={saveEditedNode} 
                disabled={isSavingEdit}
                className="text-xs uppercase tracking-wider"
              >
                {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Changes"}
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setEditDialogOpen(false)}
                className="text-xs uppercase tracking-wider"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Regenerate Summary Dialog */}
      <Dialog open={regenDialogOpen} onOpenChange={setRegenDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm uppercase tracking-wider text-foreground">
              Regenerate Summary
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Add optional context to help AI generate a better summary (e.g., "focus on technical details", "keep it casual")
            </p>
            <Input
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Optional: e.g., 'focus on the main argument' or 'explain for beginners'..."
              className="bg-secondary border-border text-foreground text-sm"
            />
            <div className="flex gap-2">
              <Button 
                onClick={regenerateSummary} 
                disabled={isRegenerating}
                className="text-xs uppercase tracking-wider"
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                    Regenerate
                  </>
                )}
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setRegenDialogOpen(false)}
                className="text-xs uppercase tracking-wider"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default KnowledgeCard;
