import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { Link2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface RelatedCardsProps {
  currentCardId: string;
  tags: string[];
  title: string;
  summary: string;
}

interface RelatedCard {
  id: string;
  title: string;
  url: string;
  summary_text?: string;
  tags: string[];
  thumbnail_url?: string;
  matchScore: number;
}

const RelatedCards = ({ currentCardId, tags, title, summary }: RelatedCardsProps) => {
  const [related, setRelated] = useState<RelatedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const findRelated = async () => {
      setLoading(true);
      try {
        // Fetch user's cards (limit to recent 100 for performance)
        const q = query(
          collection(db, "cards"),
          where("user_id", "==", user.uid),
          limit(100)
        );
        const snap = await getDocs(q);
        
        const cards = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(c => c.id !== currentCardId);

        // Calculate similarity scores
        const scored = cards.map(card => {
          let score = 0;
          const cardTags = card.tags || [];
          const cardTitle = (card.title || "").toLowerCase();
          const cardSummary = (card.summary_text || "").toLowerCase();
          const currentTitle = title.toLowerCase();
          const currentSummary = summary.toLowerCase();

          // Tag matching (highest weight)
          const matchingTags = tags.filter(t => 
            cardTags.some((ct: string) => ct.toLowerCase() === t.toLowerCase())
          );
          score += matchingTags.length * 10;

          // Title similarity (word overlap)
          const titleWords = currentTitle.split(/\s+/);
          const matchingTitleWords = titleWords.filter(w => 
            w.length > 3 && cardTitle.includes(w)
          );
          score += matchingTitleWords.length * 3;

          // Summary similarity (word overlap)
          const summaryWords = currentSummary.split(/\s+/).filter(w => w.length > 4);
          const uniqueSummaryWords = [...new Set(summaryWords)].slice(0, 20); // Top 20 keywords
          const matchingSummaryWords = uniqueSummaryWords.filter(w => 
            cardSummary.includes(w)
          );
          score += matchingSummaryWords.length * 2;

          // Same domain bonus
          try {
            const currentDomain = new URL(card.url).hostname;
            const cardDomain = new URL(card.url).hostname;
            if (currentDomain === cardDomain) score += 5;
          } catch { /* ignore */ }

          return {
            id: card.id,
            title: card.title || card.url,
            url: card.url,
            summary_text: card.summary_text,
            tags: cardTags,
            thumbnail_url: card.thumbnail_url,
            matchScore: score,
          };
        });

        // Sort by score and take top 3
        const topRelated = scored
          .filter(c => c.matchScore > 0)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 3);

        setRelated(topRelated);
      } catch (err) {
        console.error("Failed to find related cards:", err);
      } finally {
        setLoading(false);
      }
    };

    findRelated();
  }, [currentCardId, tags, title, summary, user?.uid]);

  if (loading || related.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Related Cards
        </h4>
      </div>
      <div className="space-y-3">
        {related.map((card) => (
          <button
            key={card.id}
            onClick={() => navigate(`/card/${card.id}`)}
            className="w-full text-left p-3 bg-secondary/50 border border-border rounded-sm hover:border-primary/50 transition-colors group"
          >
            <div className="flex items-start gap-3">
              {card.thumbnail_url && (
                <img 
                  src={card.thumbnail_url} 
                  alt="" 
                  className="w-16 h-12 object-cover rounded-sm shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {card.title}
                </p>
                {card.summary_text && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-1">
                    {card.summary_text}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  {card.tags.slice(0, 2).map((tag: string) => (
                    <span 
                      key={tag}
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-background rounded-sm text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="text-[9px] text-muted-foreground/60 ml-auto">
                    {card.matchScore > 15 ? "High match" : "Related"}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RelatedCards;
