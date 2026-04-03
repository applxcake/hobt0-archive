import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-url", {
        body: { url: url.trim() },
      });

      if (error) throw error;

      toast({
        title: "Card archived",
        description: data?.title || "URL processed successfully",
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
