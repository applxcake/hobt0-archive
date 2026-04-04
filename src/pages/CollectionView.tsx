import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/firebase/client";
import { doc, getDoc, collection, query, where, getDocs, orderBy, updateDoc, deleteDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Folder, Lock, Globe, Loader2, Share2, Trash2, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import KnowledgeCard from "@/components/KnowledgeCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CollectionData {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  user_id: string;
}

interface CardData {
  id: string;
  url: string;
  title?: string;
  summary_text?: string;
  tags?: string[];
  thumbnail_url?: string;
  created_at: any;
  collection_id?: string;
}

const CollectionView = () => {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [collectionData, setCollectionData] = useState<CollectionData | null>(null);
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);

  const loadCollection = async () => {
    if (!collectionId) return;
    setLoading(true);
    try {
      const colRef = doc(db, "collections", collectionId);
      const colSnap = await getDoc(colRef);
      
      if (!colSnap.exists()) {
        navigate("/collections");
        return;
      }

      const colData = { id: colSnap.id, ...colSnap.data() } as CollectionData;
      setCollectionData(colData);
      setIsOwner(colData.user_id === user?.uid);
      setEditName(colData.name);
      setEditDescription(colData.description || "");
      setEditIsPublic(colData.is_public);

      // Check privacy - redirect if private and not owner
      if (!colData.is_public && colData.user_id !== user?.uid) {
        toast({ title: "Private collection", description: "This collection is private", variant: "destructive" });
        navigate("/");
        return;
      }

      // Load cards in this collection
      const cardsQuery = query(
        collection(db, "cards"),
        where("collection_id", "==", collectionId),
        where("user_id", "==", colData.user_id),
        orderBy("created_at", "desc")
      );
      const cardsSnap = await getDocs(cardsQuery);
      const cardsList = cardsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CardData));
      setCards(cardsList);
    } catch (err) {
      console.error("[CollectionView] Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollection();
  }, [collectionId, user?.uid]);

  const handleShare = () => {
    if (!collectionData) return;
    const url = `${window.location.origin}/collection/${collectionData.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: "Collection URL copied to clipboard" });
  };

  const handleDelete = async () => {
    if (!collectionData || !isOwner) return;
    if (!confirm("Delete this collection? Cards will remain in your archive.")) return;

    try {
      // Remove collection_id from all cards in this collection
      const batch = cards.map((card) => 
        updateDoc(doc(db, "cards", card.id), { collection_id: null })
      );
      await Promise.all(batch);

      // Delete collection
      await deleteDoc(doc(db, "collections", collectionData.id));
      toast({ title: "Collection deleted" });
      navigate("/collections");
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete collection", variant: "destructive" });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionData || !isOwner) return;

    try {
      await updateDoc(doc(db, "collections", collectionData.id), {
        name: editName.trim(),
        description: editDescription.trim() || null,
        is_public: editIsPublic,
        updated_at: new Date().toISOString(),
      });
      toast({ title: "Collection updated" });
      setEditOpen(false);
      loadCollection();
    } catch (err) {
      toast({ title: "Error", description: "Failed to update collection", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen scanline flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  if (!collectionData) return null;

  return (
    <div className="min-h-screen scanline">
      <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/collections")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Folder className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-lg font-bold">{collectionData.name}</h1>
                {collectionData.description && (
                  <p className="text-xs text-muted-foreground">{collectionData.description}</p>
                )}
              </div>
              {collectionData.is_public ? (
                <Globe className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Lock className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={handleShare}>
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <p className="text-sm text-muted-foreground">No cards in this collection</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {isOwner ? "Add cards from your archive" : "This collection is empty"}
            </p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {cards.map((card, i) => (
              <div key={card.id} className="break-inside-avoid">
                <KnowledgeCard 
                  card={card} 
                  index={i} 
                  isOwner={isOwner}
                  userId={user?.uid}
                />
              </div>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold uppercase tracking-wider">Edit Collection</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-secondary border-border text-foreground text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="bg-secondary border-border text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Visibility</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditIsPublic(true)}
                    className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                      editIsPublic
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border"
                    }`}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsPublic(false)}
                    className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                      !editIsPublic
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border"
                    }`}
                  >
                    Private
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full">Save Changes</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CollectionView;
