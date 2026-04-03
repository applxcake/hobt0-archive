import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Database, ArrowLeft, Loader2, Copy } from "lucide-react";

const Settings = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    username: "",
    display_name: "",
    avatar_url: "",
    bio: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile({
            username: data.username || "",
            display_name: data.display_name || "",
            avatar_url: data.avatar_url || "",
            bio: data.bio || "",
          });
        }
        setLoading(false);
      });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: profile.username || null,
          display_name: profile.display_name || null,
          avatar_url: profile.avatar_url || null,
          bio: profile.bio || null,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyPublicUrl = () => {
    if (profile.username) {
      navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`);
      toast({ title: "Copied!", description: "Public profile URL copied to clipboard" });
    }
  };

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
            </label>
            <div className="flex gap-2">
              <Input
                value={profile.username}
                onChange={(e) => setProfile({ ...profile, username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                placeholder="your-handle"
                className="bg-secondary border-border text-foreground text-sm"
              />
              {profile.username && (
                <Button type="button" variant="ghost" size="sm" onClick={copyPublicUrl}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            {profile.username && (
              <p className="text-[10px] text-muted-foreground">
                hobt0.tech/u/{profile.username}
              </p>
            )}
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
              Profile Picture URL
            </label>
            <Input
              value={profile.avatar_url}
              onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
              placeholder="https://..."
              className="bg-secondary border-border text-foreground text-sm"
            />
            {profile.avatar_url && (
              <img
                src={profile.avatar_url}
                alt="Avatar preview"
                className="w-16 h-16 rounded-sm border border-border object-cover"
              />
            )}
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

          <div className="flex gap-3">
            <Button type="submit" disabled={saving} className="text-xs uppercase tracking-wider">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Profile"}
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
