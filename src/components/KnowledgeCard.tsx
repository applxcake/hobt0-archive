import { useState } from "react";
import { ExternalLink, Clock, Calendar, Lock, Unlock, MoreVertical, Pencil, Trash2, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

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
  read_time?: number | null;
};

interface KnowledgeCardProps {
  card: Card;
  index: number;
  isOwner?: boolean;
  onUpdate?: () => void;
}

const getYouTubeId = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
};

const isImageUrl = (url: string): boolean => {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
};

const KnowledgeCard = ({ card, index, isOwner = false, onUpdate }: KnowledgeCardProps) => {
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

  const youtubeId = getYouTubeId(card.url);
  const isImage = isImageUrl(card.url);
  const thumbnailUrl = card.thumbnail_url as string | null;

  const togglePrivacy = async () => {
    try {
      const resp = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: !card.is_public }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to update card (${resp.status})`);
      }
      toast({ title: card.is_public ? "Card set to private" : "Card set to public" });
      onUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deleteCard = async () => {
    setIsDeleting(true);
    try {
      const resp = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to delete card (${resp.status})`);
      }
      toast({ title: "Card deleted" });
      onUpdate?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setIsDeleting(false);
  };

  const shareCard = () => {
    const embedValue =
      card.embed_type === "youtube" && youtubeId
        ? `https://www.youtube.com/embed/${youtubeId}`
        : card.embed_code || "N/A";
    const text = [
      `Title: ${card.title || card.url}`,
      `URL: ${card.url}`,
      summaryParagraph ? `Summary: ${summaryParagraph}` : "",
      `Embed Type: ${card.embed_type || "none"}`,
      `Embed: ${embedValue}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    navigator.clipboard.writeText(text);
    toast({ title: "Card details copied", description: "Copied title, URL, summary and embed details." });
  };

  return (
    <div
      className="group block border border-border bg-card rounded-md overflow-hidden hover:border-primary/50 hover:glow-primary transition-all duration-300 animate-fade-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* YouTube Embed */}
      {youtubeId && (
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

      {/* Image Preview */}
      {!youtubeId && isImage && (
        <img src={card.url} alt={card.title || "Image"} className="w-full object-cover max-h-64" loading="lazy" />
      )}

      {/* Thumbnail fallback */}
      {!youtubeId && !isImage && thumbnailUrl && (
        <img src={thumbnailUrl} alt={card.title || ""} className="w-full object-cover max-h-40" loading="lazy" />
      )}

      {/* Embed code */}
      {!youtubeId && !isImage && !thumbnailUrl && card.embed_code && (
        <div
          className="w-full overflow-hidden max-h-64"
          dangerouslySetInnerHTML={{ __html: card.embed_code as string }}
        />
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-0"
          >
            <h3 className="text-sm font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {card.title || card.url}
            </h3>
          </a>
          <div className="flex items-center gap-1 shrink-0">
            {isOwner && (
              <button onClick={togglePrivacy} className="p-1 hover:text-primary transition-colors">
                {card.is_public ? (
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
                  <DropdownMenuItem onClick={togglePrivacy} className="text-xs gap-2">
                    {card.is_public ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {card.is_public ? "Make Private" : "Make Public"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={shareCard} className="text-xs gap-2">
                    <Share2 className="w-3 h-3" />
                    Share URL
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
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-wider">
          {card.embed_type && (
            <span className="text-primary">{card.embed_type}</span>
          )}
          {card.read_time != null && card.read_time > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {card.read_time}m
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {date}
          </span>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeCard;
