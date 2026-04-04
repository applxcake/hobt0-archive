import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/firebase/client";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Folder, Lock, Globe, Loader2 } from "lucide-react";
import CreateCollectionDialog from "@/components/CreateCollectionDialog";

interface Collection {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  card_count: number;
  created_at: any;
}

const Collections = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCollections = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "collections"),
        where("user_id", "==", user.uid),
        orderBy("created_at", "desc")
      );
      const snap = await getDocs(q);
      const cols = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Collection));
      setCollections(cols);
    } catch (err) {
      console.error("[Collections] Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    loadCollections();
  }, [user, authLoading]);

  if (authLoading || loading) {
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
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-bold uppercase tracking-wider">Collections</h1>
          </div>
          <CreateCollectionDialog onCollectionCreated={loadCollections} />
        </header>

        {collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Folder className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2">No collections yet</p>
            <p className="text-xs text-muted-foreground/60">Create collections to organize your cards</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((col) => (
              <div
                key={col.id}
                onClick={() => navigate(`/collection/${col.id}`)}
                className="group block border border-border bg-card rounded-md p-4 hover:border-primary/50 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Folder className="w-5 h-5 text-primary" />
                    <span className="font-medium text-sm">{col.name}</span>
                  </div>
                  {col.is_public ? (
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                {col.description && (
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{col.description}</p>
                )}
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {col.card_count || 0} cards
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Collections;
