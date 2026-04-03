import { ExternalLink, Clock, Calendar } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Card = Tables<"cards">;

interface KnowledgeCardProps {
  card: Card;
  index: number;
}

const KnowledgeCard = ({ card, index }: KnowledgeCardProps) => {
  const summary = Array.isArray(card.ai_summary) ? card.ai_summary as string[] : [];
  const tags = card.tags ?? [];
  const date = new Date(card.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block border border-border bg-card rounded-md p-4 hover:border-primary/50 hover:glow-primary transition-all duration-300 animate-fade-in"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {card.title || card.url}
        </h3>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
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
    </a>
  );
};

export default KnowledgeCard;
