import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/integrations/firebase/client";
import { collection, addDoc, Timestamp, getDocs, query, where } from "firebase/firestore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileJson, FileText, Loader2, ExternalLink } from "lucide-react";

interface BookmarkNode {
  title?: string;
  url?: string;
  children?: BookmarkNode[];
}

const ImportExportDialog = () => {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"import" | "export">("import");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Parse Chrome/Firefox bookmarks JSON
  const parseBookmarks = (node: BookmarkNode, results: Array<{title: string; url: string}>) => {
    if (node.url && node.title) {
      results.push({ title: node.title, url: node.url });
    }
    if (node.children) {
      node.children.forEach(child => parseBookmarks(child, results));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const bookmarks: Array<{title: string; url: string}> = [];
      parseBookmarks(data.roots?.bookmark_bar || data, bookmarks);

      // Filter valid URLs
      const validBookmarks = bookmarks.filter(b => 
        b.url.startsWith('http') && !b.url.includes('javascript:')
      );

      if (validBookmarks.length === 0) {
        toast({ title: "No valid bookmarks found", variant: "destructive" });
        return;
      }

      // Import in batches
      const batchSize = 10;
      let imported = 0;
      
      for (let i = 0; i < validBookmarks.length; i += batchSize) {
        const batch = validBookmarks.slice(i, i + batchSize);
        await Promise.all(batch.map(async (bookmark) => {
          try {
            await addDoc(collection(db, "cards"), {
              url: bookmark.url,
              title: bookmark.title,
              summary_text: "Imported from bookmarks",
              ai_summary: ["Imported from bookmarks"],
              tags: ["imported"],
              user_id: user.uid,
              is_public: false,
              show_embed: true,
              created_at: Timestamp.now(),
            });
            imported++;
          } catch (err) {
            console.error("Failed to import:", bookmark.url);
          }
        }));
      }

      toast({ 
        title: "Import complete", 
        description: `Imported ${imported} of ${validBookmarks.length} bookmarks` 
      });
      setOpen(false);
    } catch (err) {
      toast({ title: "Import failed", description: "Invalid bookmark file", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportJSON = async () => {
    if (!user) return;
    
    try {
      const q = query(collection(db, "cards"), where("user_id", "==", user.uid));
      const snap = await getDocs(q);
      const cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const dataStr = JSON.stringify({ 
        export_date: new Date().toISOString(), 
        total_cards: cards.length,
        cards 
      }, null, 2);
      
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hobt0-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Export complete", description: `${cards.length} cards exported` });
    } catch (err) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const exportMarkdown = async () => {
    if (!user) return;
    
    try {
      const q = query(collection(db, "cards"), where("user_id", "==", user.uid));
      const snap = await getDocs(q);
      const cards = snap.docs.map(d => d.data());

      let md = `# hobt0 Archive Export\n\n`;
      md += `**Export Date:** ${new Date().toLocaleDateString()}\n\n`;
      md += `**Total Cards:** ${cards.length}\n\n---\n\n`;

      cards.forEach((card: any, i: number) => {
        md += `## ${i + 1}. ${card.title || "Untitled"}\n\n`;
        md += `- **URL:** ${card.url}\n`;
        if (card.summary_text) {
          md += `- **Summary:** ${card.summary_text}\n`;
        }
        if (card.tags?.length) {
          md += `- **Tags:** ${card.tags.join(", ")}\n`;
        }
        md += `- **Added:** ${card.created_at?.toDate?.().toLocaleDateString() || "Unknown"}\n\n`;
        md += `---\n\n`;
      });

      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hobt0-archive-${new Date().toISOString().split("T")[0]}.md`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Export complete", description: `${cards.length} cards exported as Markdown` });
    } catch (err) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="w-4 h-4" />
          Import / Export
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wider">Import / Export</DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("import")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider border rounded-sm transition-colors ${
              activeTab === "import" 
                ? "bg-primary text-primary-foreground border-primary" 
                : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            Import
          </button>
          <button
            onClick={() => setActiveTab("export")}
            className={`flex-1 py-2 text-xs uppercase tracking-wider border rounded-sm transition-colors ${
              activeTab === "export" 
                ? "bg-primary text-primary-foreground border-primary" 
                : "bg-secondary text-muted-foreground border-border"
            }`}
          >
            Export
          </button>
        </div>

        {activeTab === "import" ? (
          <div className="space-y-4">
            <div className="p-4 bg-secondary/50 border border-border rounded-sm">
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Import Bookmarks</h4>
              <p className="text-[11px] text-muted-foreground mb-3">
                Upload Chrome/Edge/Firefox bookmarks JSON export. 
                Cards will be created with "imported" tag.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={importing}
                className="w-full text-xs"
              >
                {importing ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Importing...</>
                ) : (
                  <><Upload className="w-3.5 h-3.5 mr-2" /> Select Bookmarks File</>
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              To export bookmarks from Chrome: Menu → Bookmarks → Bookmark Manager → Export
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-secondary/50 border border-border rounded-sm">
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Export as JSON</h4>
              <p className="text-[11px] text-muted-foreground mb-3">
                Full backup with all card data, summaries, and metadata.
              </p>
              <Button onClick={exportJSON} variant="outline" className="w-full text-xs gap-2">
                <FileJson className="w-3.5 h-3.5" />
                Download JSON Backup
              </Button>
            </div>
            
            <div className="p-4 bg-secondary/50 border border-border rounded-sm">
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Export as Markdown</h4>
              <p className="text-[11px] text-muted-foreground mb-3">
                Human-readable format for notes apps or documentation.
              </p>
              <Button onClick={exportMarkdown} variant="outline" className="w-full text-xs gap-2">
                <FileText className="w-3.5 h-3.5" />
                Download Markdown
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ImportExportDialog;
