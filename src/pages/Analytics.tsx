import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Database, BarChart3, Tag, Calendar, Clock, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Card {
  id: string;
  url: string;
  title?: string;
  tags?: string[];
  created_at: any;
  embed_type?: string;
  reading_status?: "unread" | "reading" | "completed";
}

const Analytics = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    const loadCards = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "cards"), where("user_id", "==", user.uid));
        const snap = await getDocs(q);
        setCards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Card)));
      } catch (err) {
        toast({ title: "Failed to load analytics", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    loadCards();
  }, [user?.uid]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (cards.length === 0) return null;

    const total = cards.length;
    
    // Reading status breakdown
    const readingStatus = {
      unread: cards.filter(c => !c.reading_status || c.reading_status === "unread").length,
      reading: cards.filter(c => c.reading_status === "reading").length,
      completed: cards.filter(c => c.reading_status === "completed").length,
    };

    // Content types
    const contentTypes = cards.reduce((acc, card) => {
      const type = card.embed_type || "link";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Tags frequency
    const tagCounts = cards.reduce((acc, card) => {
      (card.tags || []).forEach(tag => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const sortedTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20);

    // Activity by month
    const monthlyActivity = cards.reduce((acc, card) => {
      let date: Date;
      if (card.created_at?.toDate) {
        date = card.created_at.toDate();
      } else if (card.created_at?.seconds) {
        date = new Date(card.created_at.seconds * 1000);
      } else {
        date = new Date(card.created_at);
      }
      const monthKey = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      acc[monthKey] = (acc[monthKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Top domains
    const domainCounts = cards.reduce((acc, card) => {
      try {
        const domain = new URL(card.url).hostname.replace(/^www\./, "");
        acc[domain] = (acc[domain] || 0) + 1;
      } catch { /* ignore */ }
      return acc;
    }, {} as Record<string, number>);

    const topDomains = Object.entries(domainCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    // Activity timeline (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });

    const dailyActivity = last7Days.map(day => ({
      day,
      count: cards.filter(c => {
        let date: Date;
        if (c.created_at?.toDate) {
          date = c.created_at.toDate();
        } else if (c.created_at?.seconds) {
          date = new Date(c.created_at.seconds * 1000);
        } else {
          date = new Date(c.created_at);
        }
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) === day;
      }).length,
    }));

    return {
      total,
      readingStatus,
      contentTypes,
      sortedTags,
      monthlyActivity,
      topDomains,
      dailyActivity,
    };
  }, [cards]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen scanline flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen scanline flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Sign in to view analytics</p>
          <Button onClick={() => navigate("/login")}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen scanline">
      <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-8 h-8 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground text-glow">
                Analytics
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                archive insights
              </p>
            </div>
          </div>
        </header>

        {!stats ? (
          <div className="text-center py-20">
            <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No data yet. Start archiving!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Total Cards */}
            <div className="bg-card border border-border rounded-md p-5">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Total Cards</h3>
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground mt-1">archived items</p>
            </div>

            {/* Reading Status */}
            <div className="bg-card border border-border rounded-md p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Reading Status</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Unread</span>
                  <span className="font-medium">{stats.readingStatus.unread}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Reading</span>
                  <span className="font-medium">{stats.readingStatus.reading}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-medium">{stats.readingStatus.completed}</span>
                </div>
              </div>
            </div>

            {/* Content Types */}
            <div className="bg-card border border-border rounded-md p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Content Types</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(stats.contentTypes).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
                {Object.keys(stats.contentTypes).length === 0 && (
                  <p className="text-[10px] text-muted-foreground">No types detected</p>
                )}
              </div>
            </div>

            {/* Tag Cloud */}
            <div className="bg-card border border-border rounded-md p-5 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Top Tags</h3>
              </div>
              {stats.sortedTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {stats.sortedTags.map(([tag, count]) => (
                    <button
                      key={tag}
                      onClick={() => navigate(`/?tag=${encodeURIComponent(tag)}`)}
                      className="group px-3 py-1.5 bg-secondary border border-border rounded-sm hover:border-primary transition-colors"
                    >
                      <span className="text-xs text-foreground">{tag}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground group-hover:text-primary">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No tags yet</p>
              )}
            </div>

            {/* Top Domains */}
            <div className="bg-card border border-border rounded-md p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">Top Sources</h3>
              </div>
              <div className="space-y-2">
                {stats.topDomains.map(([domain, count]) => (
                  <div key={domain} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[140px]">{domain}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
                {stats.topDomains.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">No data</p>
                )}
              </div>
            </div>

            {/* 7-Day Activity */}
            <div className="bg-card border border-border rounded-md p-5 md:col-span-3">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider">7-Day Activity</h3>
              </div>
              <div className="flex items-end gap-2 h-24">
                {stats.dailyActivity.map(({ day, count }) => (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary/20 rounded-sm transition-all hover:bg-primary/40"
                      style={{ height: `${Math.max(4, (count / Math.max(...stats.dailyActivity.map(d => d.count))) * 80)}px` }}
                    />
                    <span className="text-[9px] text-muted-foreground rotate-0 whitespace-nowrap">
                      {day}
                    </span>
                    {count > 0 && (
                      <span className="text-[9px] font-medium">{count}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
