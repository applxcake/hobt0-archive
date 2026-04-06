import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { Database, Lock, ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import RelatedCards from "@/components/RelatedCards";

interface Card {
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
  user_id?: string;
}

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const getYouTubeId = (url: string): string | null => {
  const match = url.match(YOUTUBE_REGEX);
  return match?.[1] ?? null;
};

const isImageUrl = (url: string): boolean => {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
};

const CardView = () => {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setLoading(false);
      return;
    }

    const fetchCard = async () => {
      try {
        console.log("[CardView] Fetching card:", cardId);
        const cardRef = doc(db, "cards", cardId);
        const cardSnap = await getDoc(cardRef);

        if (!cardSnap.exists()) {
          console.log("[CardView] Card not found in Firestore");
          setLoading(false);
          return;
        }

        const cardData = { id: cardSnap.id, ...cardSnap.data() } as Card;
        console.log("[CardView] Card found:", cardData.id, "is_public:", cardData.is_public);

        // Check if card is private
        if (!cardData.is_public) {
          console.log("[CardView] Card is private - access denied");
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        setCard(cardData);
        setLoading(false);
      } catch (error) {
        console.error("[CardView] Error fetching card:", error);
        setLoading(false);
      }
    };

    fetchCard();
  }, [cardId]);

  if (loading) {
    return (
      <div className="min-h-screen scanline flex items-center justify-center">
        <div className="text-center">
          <Database className="w-8 h-8 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen scanline">
        <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-sm bg-secondary border border-border flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground mb-2">
              Access Denied
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              This card is private. The owner hasn't made it publicly accessible.
            </p>
            <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen scanline">
        <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-sm bg-secondary border border-border flex items-center justify-center mx-auto mb-6">
              <Database className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground mb-2">
              Card Not Found
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              This card doesn't exist or may have been deleted.
            </p>
            <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const youtubeId = getYouTubeId(card.url);
  const isImage = isImageUrl(card.url);
  const thumbnailUrl = card.thumbnail_url as string | null;
  const summaryParagraph =
    typeof card.summary_text === "string" && card.summary_text.trim()
      ? card.summary_text.trim()
      : Array.isArray(card.ai_summary) && card.ai_summary.length
        ? String(card.ai_summary[0] ?? "").trim()
        : "";
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
    year: "numeric",
  });

  // Determine if embed should be shown (default to true if not set)
  const shouldShowEmbed = card.show_embed !== false;

  return (
    <div className="min-h-screen scanline">
      <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />
      
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        {/* Mini popup card */}
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Database className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-foreground">
                  hobt0
                </h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  shared card
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Home
            </Button>
          </div>

          {/* Card */}
          <div className="border border-border bg-card rounded-md overflow-hidden">
            {/* YouTube Embed - conditionally shown */}
            {shouldShowEmbed && youtubeId && (
              <div className="aspect-video w-full">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            {/* Image Preview - conditionally shown */}
            {shouldShowEmbed && !youtubeId && isImage && (
              <img src={card.url} alt={card.title || "Image"} className="w-full object-cover max-h-64" />
            )}

            {/* Thumbnail fallback - conditionally shown */}
            {shouldShowEmbed && !youtubeId && !isImage && thumbnailUrl && (
              <img src={thumbnailUrl} alt={card.title || ""} className="w-full object-cover max-h-40" />
            )}

            {/* Embed code - conditionally shown */}
            {shouldShowEmbed && !youtubeId && !isImage && !thumbnailUrl && card.embed_code && (
              <div
                className="w-full overflow-hidden max-h-64"
                dangerouslySetInnerHTML={{ __html: card.embed_code as string }}
              />
            )}

            <div className="p-5">
              {/* Title */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <a
                  href={card.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <h2 className="text-base font-semibold text-foreground leading-tight hover:text-primary transition-colors">
                    {card.title || card.url}
                  </h2>
                </a>
                <a 
                  href={card.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                </a>
              </div>

              {/* Summary */}
              {summaryParagraph && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {summaryParagraph}
                </p>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm bg-secondary text-secondary-foreground border border-border"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
                <div className="flex items-center gap-3">
                  {card.embed_type && (
                    <span className="text-primary">{card.embed_type}</span>
                  )}
                  <span>{date}</span>
                </div>
                <span className="text-muted-foreground/60">via hobt0</span>
              </div>

              {/* Related Cards */}
              <RelatedCards 
                currentCardId={card.id}
                tags={tags}
                title={card.title || card.url}
                summary={summaryParagraph}
              />
            </div>
          </div>

          {/* Footer */}
          <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] text-center mt-6">
            hobt0.tech · cyber archive
          </p>
        </div>
      </div>
    </div>
  );
};

export default CardView;
