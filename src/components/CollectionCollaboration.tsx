import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/firebase/client";
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, X, Loader2 } from "lucide-react";

interface CollectionCollaborationProps {
  collectionId: string;
  collaborators: string[];
  ownerId: string;
  onUpdate: () => void;
}

const CollectionCollaboration = ({ collectionId, collaborators = [], ownerId, onUpdate }: CollectionCollaborationProps) => {
  const [open, setOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = user?.uid === ownerId;

  const inviteUser = async () => {
    if (!inviteUsername.trim() || !user) return;
    
    setLoading(true);
    try {
      // Find user by username
      const profileRef = doc(db, "profiles", inviteUsername.toLowerCase());
      const profileSnap = await getDoc(profileRef);
      
      if (!profileSnap.exists()) {
        toast({ title: "User not found", description: `No user with username "${inviteUsername}"`, variant: "destructive" });
        return;
      }
      
      const targetUserId = profileSnap.data().user_id;
      
      if (targetUserId === user.uid) {
        toast({ title: "Cannot invite yourself", variant: "destructive" });
        return;
      }
      
      if (collaborators.includes(targetUserId)) {
        toast({ title: "Already a collaborator", variant: "destructive" });
        return;
      }

      // Add to collection collaborators
      const collectionRef = doc(db, "collections", collectionId);
      await updateDoc(collectionRef, {
        collaborators: arrayUnion(targetUserId),
        collaborator_usernames: arrayUnion(inviteUsername.toLowerCase()),
      });

      toast({ title: "Invite sent", description: `${inviteUsername} can now view and add to this collection` });
      setInviteUsername("");
      onUpdate();
    } catch (err) {
      toast({ title: "Failed to invite", description: "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const removeCollaborator = async (username: string, userId: string) => {
    if (!isOwner) return;
    
    try {
      const collectionRef = doc(db, "collections", collectionId);
      await updateDoc(collectionRef, {
        collaborators: arrayRemove(userId),
        collaborator_usernames: arrayRemove(username),
      });
      toast({ title: "Collaborator removed" });
      onUpdate();
    } catch (err) {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  };

  if (!isOwner && collaborators.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Users className="w-3.5 h-3.5" />
          {collaborators.length > 0 ? `${collaborators.length + 1} members` : "Share"}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wider">Collection Members</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {/* Owner */}
          <div className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
            <span className="text-xs">Owner (you)</span>
            <span className="text-[10px] text-muted-foreground uppercase">Full access</span>
          </div>

          {/* Collaborators list */}
          {collaborators.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Collaborators</p>
              {collaborators.map((username, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-secondary/30 rounded-sm">
                  <span className="text-xs">@{username}</span>
                  {isOwner && (
                    <button
                      onClick={() => removeCollaborator(username, "")}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Invite form */}
          {isOwner && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invite by username</p>
              <div className="flex gap-2">
                <Input
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="username..."
                  className="text-sm bg-secondary border-border"
                />
                <Button 
                  onClick={inviteUser} 
                  disabled={loading || !inviteUsername.trim()}
                  size="sm"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Invite"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                Collaborators can view and add cards to this collection
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionCollaboration;
