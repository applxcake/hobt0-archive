import { useState } from "react";
import { ExternalLink, Clock, Calendar, Lock, Unlock, MoreVertical, Pencil, Trash2, Share2 } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type Card = Tables<"cards">;

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
  const summary = Array.isArray(card.ai_summary) ? card.ai_summary as string[] : [];
  const tags = card.tags ?? [];
  const date = new Date(card.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const youtubeId = getYouTubeId(card.url);
  const isImage = isImageUrl(card.url);
  const thumbnailUrl = card.thumbnail_url as string | null;

  const togglePrivacy = async () => {
    const { error } = await supabase
      .from("cards")
      .update({ is_public: !card.is_public })
      .eq("id", card.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: card.is_public ? "Card set to private" : "Card set to public" });
      onUpdate?.();
    }
  };

  const deleteCard = async () => {
    setIsDeleting(true);
    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Card deleted" });
      onUpdate?.();
    }
    setIsDeleting(false);
  };

  const shareCard = () => {
    navigator.clipboard.writeText(card.url);
    toast({ title: "URL copied to clipboard" });
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

        {/* Summary bullets */}
        {summary.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {summary.map((point, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0">›</span>
                <span className="leading-relaxed">{String(point)}</span>
              </li>
            ))}
          </ul>
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
