import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddCardDialogProps {
  onCardAdded: () => void;
}

const AddCardDialog = ({ onCardAdded }: AddCardDialogProps) => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchWithTimeout = async (
    input: RequestInfo | URL,
    init: RequestInit = {},
    timeoutMs = 8000
  ) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to add cards.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const requestBody = JSON.stringify({ url: url.trim() });
      let resp: Response | null = null;
      let lastError: string | null = null;

      // Single fast attempt to keep archive action responsive.
      try {
        const candidate = await fetchWithTimeout("/api/process-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });

        if (candidate.ok) {
          resp = candidate;
        } else {
          const err = await candidate.json().catch(() => ({}));
          lastError = err?.error || `Failed to process URL (${candidate.status})`;
        }
      } catch (error: any) {
        lastError = error?.name === "AbortError"
          ? "URL processing timed out"
          : error?.message || "Failed to process URL";
      }

      const data = resp ? await resp.json() : null;
      const fallbackSummary = "Summary unavailable right now. Open the source URL for details.";

      const saveResp = await fetchWithTimeout("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          title: data?.title || url.trim(),
          summary_text:
            typeof data?.summary_text === "string" && data.summary_text.trim()
              ? data.summary_text.trim()
              : fallbackSummary,
          ai_summary:
            Array.isArray(data?.ai_summary) && data.ai_summary.length
              ? data.ai_summary
              : [fallbackSummary],
          tags: Array.isArray(data?.tags) ? data.tags : [],
          read_time: typeof data?.read_time === "number" ? data.read_time : null,
          thumbnail_url: data?.thumbnail_url ?? null,
          embed_code: data?.embed_code ?? null,
          embed_type: data?.embed_type ?? null,
          user_id: user.uid,
          is_public: false,
        }),
      });
      if (!saveResp.ok) {
        const err = await saveResp.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to save card (${saveResp.status})`);
      }

      toast({
        title: "Card archived",
        description: resp ? data?.title || url.trim() : "Saved without AI summary (processing timed out).",
      });
      setUrl("");
      setOpen(false);
      onCardAdded();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to process URL",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs uppercase tracking-wider">
          <Plus className="w-3.5 h-3.5" />
          Archive
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm uppercase tracking-wider text-foreground">
            Archive URL
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground text-sm"
          />
          <Button type="submit" disabled={loading} className="w-full text-xs uppercase tracking-wider">
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              "Process & Save"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddCardDialog;
