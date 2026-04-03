import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import KnowledgeCard from "@/components/KnowledgeCard";
import { Database, Loader2, User } from "lucide-react";

const PublicProfile = () => {
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading: profileLoading } = useQuery<any>({
    queryKey: ["profile", username],
    queryFn: async () => {
      if (!username) return null;
      const q = query(
        collection(db, "profiles"),
        where("username", "==", username)
      );
      const snap = await getDocs(q);
      const doc = snap.docs[0];
      return doc ? { id: doc.id, ...doc.data() } : null;
    },
    enabled: !!username,
  });

  const { data: cards, isLoading: cardsLoading } = useQuery<any[]>({
    queryKey: ["public-cards", profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return [];
      const q = query(
        collection(db, "cards"),
        where("user_id", "==", profile.user_id),
        where("is_public", "==", true)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    enabled: !!profile?.user_id,
  });

  const isLoading = profileLoading || cardsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen scanline flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen scanline flex items-center justify-center">
        <p className="text-sm text-muted-foreground">User not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen scanline">
      <div className="grid-pattern fixed inset-0 pointer-events-none opacity-40" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <header className="flex items-center gap-4 mb-10 border border-border bg-card rounded-md p-6">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name || username}
              className="w-14 h-14 rounded-sm border border-border object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-sm bg-secondary border border-border flex items-center justify-center">
              <User className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-foreground text-glow">
              {profile.display_name || username}
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              @{username}
            </p>
            {profile.bio && (
              <p className="text-xs text-muted-foreground mt-1">{profile.bio}</p>
            )}
          </div>
          <div className="ml-auto">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {cards?.length ?? 0} public nodes
            </span>
          </div>
        </header>

        {/* Cards */}
        {!cards?.length ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Database className="w-5 h-5 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No public cards yet</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {cards.map((card, i) => (
              <div key={card.id} className="break-inside-avoid">
                <KnowledgeCard card={card} index={i} />
              </div>
            ))}
          </div>
        )}

        <footer className="mt-16 pt-6 border-t border-border">
          <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] text-center">
            hobt0.tech · cyber archive · {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
};

export default PublicProfile;
