import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/firebase/client";
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Rss, Trash2, Loader2, RefreshCw } from "lucide-react";

interface RSSFeed {
  id: string;
  url: string;
  title?: string;
  last_fetched?: any;
  auto_archive: boolean;
}

const RSSManager = () => {
  const [open, setOpen] = useState(false);
  const [feeds, setFeeds] = useState<RSSFeed[]>([]);
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user?.uid || !open) return;
    loadFeeds();
  }, [user?.uid, open]);

  const loadFeeds = async () => {
    if (!user?.uid) return;
    try {
      const q = query(collection(db, "rss_feeds"), where("user_id", "==", user.uid));
      const snap = await getDocs(q);
      setFeeds(snap.docs.map(d => ({ id: d.id, ...d.data() } as RSSFeed)));
    } catch (err) {
      console.error("Failed to load RSS feeds:", err);
    }
  };

  const addFeed = async () => {
    if (!newFeedUrl.trim() || !user) return;
    
    setLoading(true);
    try {
      // Validate feed by fetching it
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(newFeedUrl)}`);
      const data = await response.json();
      
      if (data.status !== "ok") {
        toast({ title: "Invalid RSS feed", variant: "destructive" });
        return;
      }

      await addDoc(collection(db, "rss_feeds"), {
        url: newFeedUrl.trim(),
        title: data.feed?.title || newFeedUrl,
        user_id: user.uid,
        auto_archive: true,
        created_at: Timestamp.now(),
        last_fetched: null,
      });

      toast({ title: "RSS feed added", description: data.feed?.title || "Feed added successfully" });
      setNewFeedUrl("");
      loadFeeds();
    } catch (err) {
      toast({ title: "Failed to add feed", description: "Please check the URL and try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const removeFeed = async (feedId: string) => {
    try {
      await deleteDoc(doc(db, "rss_feeds", feedId));
      toast({ title: "Feed removed" });
      loadFeeds();
    } catch (err) {
      toast({ title: "Failed to remove feed", variant: "destructive" });
    }
  };

  const fetchFeedItems = async (feed: RSSFeed) => {
    if (!user) return;
    
    setFetching(feed.id);
    try {
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
      const data = await response.json();
      
      if (data.status !== "ok" || !data.items) {
        toast({ title: "Failed to fetch feed", variant: "destructive" });
        return;
      }

      let archivedCount = 0;
      
      // Archive recent items (last 7 days)
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      
      for (const item of data.items.slice(0, 5)) {
        const pubDate = new Date(item.pubDate).getTime();
        if (pubDate < oneWeekAgo) continue;
        
        // Check for duplicates
        const q = query(
          collection(db, "cards"),
          where("user_id", "==", user.uid),
          where("url", "==", item.link)
        );
        const existing = await getDocs(q);
        if (!existing.empty) continue;

        // Create card from RSS item
        await addDoc(collection(db, "cards"), {
          url: item.link,
          title: item.title,
          summary_text: item.description?.replace(/<[^>]+>/g, "").slice(0, 500) || "From RSS feed",
          ai_summary: [item.description?.replace(/<[^>]+>/g, "").slice(0, 500) || "From RSS feed"],
          tags: ["rss", ...(data.feed?.title ? [data.feed.title.toLowerCase().replace(/\s+/g, "-")] : [])],
          user_id: user.uid,
          is_public: false,
          show_embed: true,
          reading_status: "unread",
          created_at: Timestamp.now(),
          source_feed: feed.url,
        });
        
        archivedCount++;
      }

      // Update last fetched
      await updateDoc(doc(db, "rss_feeds", feed.id), {
        last_fetched: Timestamp.now(),
      });

      toast({ 
        title: "Feed processed", 
        description: `${archivedCount} new items archived` 
      });
      loadFeeds();
    } catch (err) {
      toast({ title: "Failed to process feed", variant: "destructive" });
    } finally {
      setFetching(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Rss className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">RSS</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wider">RSS Feeds</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">
            Subscribe to RSS feeds to auto-archive new articles.
          </p>

          {/* Add new feed */}
          <div className="flex gap-2">
            <Input
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="text-sm bg-secondary border-border"
            />
            <Button 
              onClick={addFeed} 
              disabled={loading || !newFeedUrl.trim()}
              size="sm"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
            </Button>
          </div>

          {/* Feeds list */}
          {feeds.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {feeds.map((feed) => (
                <div key={feed.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{feed.title || feed.url}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{feed.url}</p>
                    {feed.last_fetched && (
                      <p className="text-[9px] text-muted-foreground/60">
                        Last fetched: {feed.last_fetched.toDate?.().toLocaleDateString?.() || "Unknown"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => fetchFeedItems(feed)}
                      disabled={fetching === feed.id}
                      className="p-1.5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      title="Fetch now"
                    >
                      {fetching === feed.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => removeFeed(feed.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove feed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No RSS feeds yet. Add one to get started.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RSSManager;
