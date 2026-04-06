import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { doc, setDoc, deleteDoc, updateDoc, Timestamp } from "firebase/firestore";

export { db, doc, setDoc, deleteDoc, updateDoc, Timestamp };

import KnowledgeCard from "@/components/KnowledgeCard";
import AddCardDialog from "@/components/AddCardDialog";
import { Database, Loader2, Settings, LogIn, Share2, Search, Folder, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "hobt0_cards_v1";

const getCachedCards = (userId: string): any[] | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.userId !== userId) return null;
    return parsed.cards || null;
  } catch {
    return null;
  }
};

const setCachedCards = (userId: string, cards: any[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, cards, ts: Date.now() }));
  } catch {
    // ignore
  }
};

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Load instantly from cache first
  const [cards, setCards] = useState<any[]>(() => {
    if (user?.uid) return getCachedCards(user.uid) || [];
    return [];
  });
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [readingFilter, setReadingFilter] = useState<"all" | "unread" | "reading" | "completed">("all");

  // Subscribe to real-time updates (faster than getDocs)
  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // Instant cache load
    const cached = getCachedCards(user.uid);
    if (cached) {
      setCards(cached);
      setIsLoading(false); // Show cache immediately
    }

    // Real-time subscription (faster than polling)
    const q = query(collection(db, "cards"), where("user_id", "==", user.uid));
    
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort client-side instead of Firestore orderBy (avoids composite index)
      (data as any[]).sort((a: any, b: any) => {
        const aTime = a.created_at?.seconds || a.created_at || 0;
        const bTime = b.created_at?.seconds || b.created_at || 0;
        return bTime - aTime; // newest first
      });
      setCards(data);
      setCachedCards(user.uid, data);
      setIsLoading(false);
    }, (err) => {
      console.error("[Firestore] Subscription failed:", err);
      // Fallback to one-time fetch
      getDocs(q).then((snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCards(data);
        setCachedCards(user.uid, data);
        setIsLoading(false);
      });
    });

    return () => unsub();
  }, [user?.uid]);

  // Load profile once
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "profiles"), where("user_id", "==", user.uid));
    getDocs(q).then((snap) => {
      const d = snap.docs[0];
      if (d) setProfile({ id: d.id, ...d.data() });
    });
  }, [user?.uid]);

  const refetch = () => {
    // No-op - onSnapshot keeps it updated automatically
  };

  const shareArchive = () => {
    if (profile?.username) {
      navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`);
      toast({ title: "Copied!", description: "Public archive URL copied to clipboard" });
    } else {
      toast({ title: "Set a username first", description: "Go to Settings to set your public handle", variant: "destructive" });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen scanline flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  // Show content immediately if we have cached data
  const showContent = !isLoading || cards.length > 0;

  // Filter cards based on search query and reading status
  const filteredCards = cards.filter((card) => {
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const urlMatch = card.url?.toLowerCase().includes(query);
      const summaryMatch = card.summary_text?.toLowerCase().includes(query);
      const titleMatch = card.title?.toLowerCase().includes(query);
      const tagsMatch = card.tags?.some((tag: string) => tag.toLowerCase().includes(query));
      if (!(urlMatch || summaryMatch || titleMatch || tagsMatch)) return false;
    }
    
    // Reading status filter
    if (readingFilter !== "all") {
      const status = card.reading_status || "unread";
      if (status !== readingFilter) return false;
    }
    
    return true;
  });

  return (
    <div className="min-h-screen scanline">
      <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground text-glow">
                hobt0
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                knowledge engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 pl-9 bg-secondary border-border text-foreground text-sm"
                />
              </div>
            )}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {filteredCards?.length ?? 0} nodes
            </span>
            {user ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/collections")} className="gap-1.5 text-xs">
                  <Folder className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Collections</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/analytics")} className="gap-1.5 text-xs">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Analytics</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={shareArchive} className="gap-1.5 text-xs">
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
                <AddCardDialog onCardAdded={refetch} />
                <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
                  <Settings className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => navigate("/login")} className="gap-1.5 text-xs uppercase tracking-wider">
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </Button>
            )}
          </div>
        </header>

        {/* Reading Status Filter */}
        {user && (
          <div className="flex gap-2 mb-6">
            {["all", "unread", "reading", "completed"].map((filter) => (
              <button
                key={filter}
                onClick={() => setReadingFilter(filter as any)}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-sm border transition-colors ${
                  readingFilter === filter
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {filter === "all" ? "All" : filter}
              </button>
            ))}
          </div>
        )}

        {/* Content - show immediately from cache */}
        <div className="flex-1">
          {!user ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-12 h-12 rounded-sm bg-secondary border border-border flex items-center justify-center mb-4">
                <Database className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">Sign in to start archiving</p>
              <p className="text-xs text-muted-foreground/60">
                Build your personal knowledge graph
              </p>
            </div>
          ) : !showContent ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : !filteredCards?.length ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-12 h-12 rounded-sm bg-secondary border border-border flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">
                {searchQuery ? "No matches found" : "Archive empty"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {searchQuery ? "Try a different search term" : "Add your first URL to begin building your knowledge graph"}
              </p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
              {filteredCards.map((card, i) => (
                <div key={card.id} className="break-inside-avoid">
                  <KnowledgeCard 
                    card={card} 
                    index={i} 
                    isOwner={true} 
                    userId={user?.uid} 
                    embedPreference={profile?.embed_preference || "on"}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto pt-6 border-t border-border">
          <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] text-center">
            hobt0.tech · cyber archive · {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
