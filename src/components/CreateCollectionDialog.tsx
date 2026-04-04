import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/integrations/firebase/client";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderPlus, Loader2 } from "lucide-react";

interface CreateCollectionDialogProps {
  onCollectionCreated: () => void;
}

const CreateCollectionDialog = ({ onCollectionCreated }: CreateCollectionDialogProps) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      await addDoc(collection(db, "collections"), {
        user_id: user.uid,
        name: name.trim(),
        description: description.trim() || null,
        is_public: isPublic,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        card_count: 0,
      });

      toast({ title: "Collection created" });
      setName("");
      setDescription("");
      setIsPublic(true);
      setOpen(false);
      onCollectionCreated();
    } catch (err) {
      toast({ title: "Error", description: "Failed to create collection", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FolderPlus className="w-4 h-4" />
          New Collection
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wider">Create Collection</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Design Resources"
              className="bg-secondary border-border text-foreground text-sm"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description (optional)</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="bg-secondary border-border text-foreground text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Visibility</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                  isPublic
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border"
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                  !isPublic
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border"
                }`}
              >
                Private
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading || !name.trim()} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCollectionDialog;
