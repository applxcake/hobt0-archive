import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import KnowledgeCard from "@/components/KnowledgeCard";
import AddCardDialog from "@/components/AddCardDialog";
import { Database, Loader2, Settings, LogIn, Share2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cards, isLoading } = useQuery({
    queryKey: ["cards", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const resp = await fetch(`/api/cards?user_id=${encodeURIComponent(user.uid)}`);
      if (!resp.ok) throw new Error(`Failed to load cards (${resp.status})`);
      return resp.json();
    },
    enabled: !authLoading,
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.uid],
    queryFn: async () => {
      if (!user) return null;
      const q = query(
        collection(db, "profiles"),
        where("user_id", "==", user.uid)
      );
      const snap = await getDocs(q);
      const doc = snap.docs[0];
      return doc ? { id: doc.id, ...doc.data() } : null;
    },
    enabled: !!user,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["cards", user?.uid] });

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

  return (
    <div className="min-h-screen scanline">
      <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
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
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {cards?.length ?? 0} nodes
            </span>
            {user ? (
              <>
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

        {/* Content */}
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
        ) : isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : !cards?.length ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-12 h-12 rounded-sm bg-secondary border border-border flex items-center justify-center mb-4">
              <Database className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">Archive empty</p>
            <p className="text-xs text-muted-foreground/60">
              Add your first URL to begin building your knowledge graph
            </p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {cards.map((card, i) => (
              <div key={card.id} className="break-inside-avoid">
                <KnowledgeCard card={card} index={i} isOwner={true} onUpdate={refetch} />
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-border">
          <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] text-center">
            hobt0.tech · cyber archive · {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
