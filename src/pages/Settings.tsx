import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Database, ArrowLeft, Loader2, User, Check, X, Share2, Lock, Unlock } from "lucide-react";

const PROFILE_CACHE_KEY = "hobt0_profile_v1";

const getCachedProfile = (userId: string): any | null => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.userId !== userId) return null;
    return parsed.profile || null;
  } catch {
    return null;
  }
};

const setCachedProfile = (userId: string, profile: any) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile, ts: Date.now() }));
  } catch {
    // ignore
  }
};

const USERNAME_COOLDOWN_DAYS = 7;

const canChangeUsername = (lastChange: string | null | undefined): { allowed: boolean; daysRemaining: number } => {
  if (!lastChange) return { allowed: true, daysRemaining: 0 };
  const last = new Date(lastChange).getTime();
  const now = Date.now();
  const diffMs = now - last;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, USERNAME_COOLDOWN_DAYS - diffDays);
  return { allowed: diffDays >= USERNAME_COOLDOWN_DAYS, daysRemaining: Math.ceil(daysRemaining) };
};

const Settings = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [originalProfile, setOriginalProfile] = useState<any>(null);
  
  const [profile, setProfile] = useState({
    username: "",
    display_name: "",
    avatar_url: "",
    bio: "",
    embed_preference: "on",
    is_public: true,
  });

  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [cooldownInfo, setCooldownInfo] = useState<{ allowed: boolean; daysRemaining: number }>({ allowed: true, daysRemaining: 0 });

  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    const cached = getCachedProfile(user.uid);
    if (cached) {
      setProfile({
        username: cached.username || "",
        display_name: cached.display_name || "",
        avatar_url: cached.avatar_url || "",
        bio: cached.bio || "",
        embed_preference: cached.embed_preference || "on",
        is_public: cached.is_public !== false,
      });
      setIsLoading(false);
    }

    const loadProfile = async () => {
      try {
        const ref = doc(db, "profiles", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const loaded = {
            username: data.username || "",
            display_name: data.display_name || "",
            avatar_url: data.avatar_url || "",
            bio: data.bio || "",
            embed_preference: data.embed_preference || "on",
            is_public: data.is_public !== false,
          };
          setProfile(loaded);
          setOriginalProfile(data);
          setCachedProfile(user.uid, data);
          const cooldown = canChangeUsername(data.last_username_change);
          setCooldownInfo(cooldown);
        }
      } catch (err) {
        console.error("[Settings] Load failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user?.uid]);

  const checkUsernameAvailability = async (username: string) => {
    if (!username || username === originalProfile?.username) {
      setUsernameStatus("idle");
      return true;
    }
    
    setUsernameStatus("checking");
    
    try {
      const q = query(collection(db, "profiles"), where("username", "==", username));
      const snap = await getDocs(q);
      const isTaken = !snap.empty && snap.docs.some(d => d.id !== user?.uid);
      
      setUsernameStatus(isTaken ? "taken" : "available");
      return !isTaken;
    } catch {
      setUsernameStatus("idle");
      return false;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Error", description: "Not signed in", variant: "destructive" });
      return;
    }

    const isUsernameChanged = profile.username !== originalProfile?.username;
    
    if (isUsernameChanged) {
      if (!cooldownInfo.allowed) {
        toast({ 
          title: "Username cooldown", 
          description: `You can change your username in ${cooldownInfo.daysRemaining} days`, 
          variant: "destructive" 
        });
        return;
      }
      
      const isAvailable = await checkUsernameAvailability(profile.username);
      if (!isAvailable) {
        toast({ title: "Username taken", description: "This username is already in use", variant: "destructive" });
        return;
      }
    }

    const data: any = {
      user_id: user.uid,
      username: profile.username || null,
      display_name: profile.display_name || null,
      avatar_url: profile.avatar_url || null,
      bio: profile.bio || null,
      embed_preference: profile.embed_preference || "on",
      is_public: profile.is_public,
      updated_at: new Date().toISOString(),
    };
    
    if (isUsernameChanged) {
      data.last_username_change = new Date().toISOString();
    }
    
    setCachedProfile(user.uid, data);
    setIsSaving(true);
    setOriginalProfile({ ...originalProfile, ...data });
    
    if (isUsernameChanged) {
      setCooldownInfo({ allowed: false, daysRemaining: 7 });
    }
    
    toast({ title: "Profile saved" });

    const saveWithTimeout = async () => {
      const profileRef = doc(collection(db, "profiles"), user.uid);
      await setDoc(profileRef, data, { merge: true });
    };

    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Timeout")), 3000)
    );

    try {
      await Promise.race([saveWithTimeout(), timeout]);
    } catch (err: any) {
      if (err.message === "Timeout") {
        console.warn("[Settings] Firestore write timed out (data cached locally)");
      } else {
        console.error("[Settings] Save failed:", err);
        toast({ title: "Sync error", description: "Will retry automatically", variant: "destructive" });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const copyPublicUrl = () => {
    if (!profile.is_public) {
      toast({ 
        title: "Profile is private", 
        description: "Make your profile public to share it",
        variant: "destructive"
      });
      return;
    }
    if (profile.username) {
      navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`);
      toast({ title: "Copied!", description: "Public profile URL copied to clipboard" });
    } else {
      toast({ title: "Set username first", description: "You need a username to share your profile", variant: "destructive" });
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
      <div className="relative z-10 max-w-xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Settings
            </h1>
          </div>
        </header>

        <form onSubmit={handleSave} className="space-y-6 border border-border bg-card rounded-md p-6">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Username (public handle)
              {!cooldownInfo.allowed && (
                <span className="ml-2 text-destructive">
                  (Cooldown: {cooldownInfo.daysRemaining} days remaining)
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={profile.username}
                  onChange={(e) => {
                    const newUsername = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
                    setProfile({ ...profile, username: newUsername });
                    if (newUsername && newUsername !== originalProfile?.username) {
                      checkUsernameAvailability(newUsername);
                    } else {
                      setUsernameStatus("idle");
                    }
                  }}
                  placeholder="your-handle"
                  disabled={!cooldownInfo.allowed && profile.username !== originalProfile?.username}
                  className="bg-secondary border-border text-foreground text-sm pr-10"
                />
                {usernameStatus !== "idle" && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    {usernameStatus === "available" && <Check className="w-4 h-4 text-green-500" />}
                    {usernameStatus === "taken" && <X className="w-4 h-4 text-destructive" />}
                  </div>
                )}
              </div>
              {profile.username && (
                <Button type="button" variant="ghost" size="sm" onClick={copyPublicUrl}>
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            {profile.username && (
              <p className="text-[10px] text-muted-foreground">
                hobt0.tech/u/{profile.username}
                {usernameStatus === "available" && <span className="text-green-500 ml-2">Available</span>}
                {usernameStatus === "taken" && <span className="text-destructive ml-2">Taken</span>}
              </p>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Profile Privacy
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProfile({ ...profile, is_public: true })}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                  profile.is_public
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <Unlock className="w-3 h-3 inline mr-1" />
                Public
              </button>
              <button
                type="button"
                onClick={() => setProfile({ ...profile, is_public: false })}
                className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                  !profile.is_public
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <Lock className="w-3 h-3 inline mr-1" />
                Private
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              {profile.is_public 
                ? "Anyone can view your public profile and shared cards" 
                : "Only you can see your profile. Shared cards still work individually."}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Display Name
            </label>
            <Input
              value={profile.display_name}
              onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
              placeholder="Your Name"
              className="bg-secondary border-border text-foreground text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Profile Picture URL <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <Input
              value={profile.avatar_url}
              onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
              placeholder="https://... (leave empty for default)"
              className="bg-secondary border-border text-foreground text-sm"
            />
            <div className="flex items-center gap-3">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar preview"
                  className="w-14 h-14 rounded-sm border border-border object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-14 h-14 rounded-sm bg-secondary border border-border flex items-center justify-center">
                  <User className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <span className="text-[10px] text-muted-foreground">
                {profile.avatar_url ? "Custom avatar" : "Default avatar"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Bio
            </label>
            <Textarea
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              placeholder="Tell us about yourself..."
              rows={3}
              className="bg-secondary border-border text-foreground text-sm resize-none"
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Show Embed
            </label>
            <div className="flex gap-2">
              {["on", "off", "manual"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setProfile({ ...profile, embed_preference: option })}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-colors ${
                    profile.embed_preference === option
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              {profile.embed_preference === "on" && "Embeds will be shown for all cards"}
              {profile.embed_preference === "off" && "Embeds will be hidden for all cards"}
              {profile.embed_preference === "manual" && "You can toggle embeds per card when adding or editing"}
            </p>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isSaving} className="text-xs uppercase tracking-wider">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Profile"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
              className="text-xs uppercase tracking-wider"
            >
              Sign Out
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
