import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  PlusCircle,
  Folder,
  BarChart3,
  Settings,
  LogIn,
  Search,
  Palette,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/use-theme";

interface CommandMenuProps {
  onOpenAddCard?: () => void;
  cards?: any[];
}

export const CommandMenu = ({ onOpenAddCard, cards = [] }: CommandMenuProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setTheme, themes } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-2.5 py-1 text-xs text-muted-foreground bg-secondary/60 hover:bg-secondary border border-border rounded-sm transition-colors"
        title="Command Palette"
      >
        <Search className="w-3 h-3" />
        <span className="font-mono">Quick Jump...</span>
        <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="border-b border-border">
          <CommandInput placeholder="Type a command, search nodes, or switch themes..." />
        </div>
        <CommandList className="font-mono text-xs max-h-80">
          <CommandEmpty>No results found in cyber-archive.</CommandEmpty>
          
          <CommandGroup heading="Actions">
            {user && (
              <CommandItem
                onSelect={() => runCommand(() => onOpenAddCard?.())}
                className="gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-primary" />
                <span>Add new node / link</span>
              </CommandItem>
            )}
            <CommandItem
              onSelect={() => runCommand(() => navigate("/collections"))}
              className="gap-2 cursor-pointer"
            >
              <Folder className="w-4 h-4 text-primary" />
              <span>Browse Collections</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => navigate("/analytics"))}
              className="gap-2 cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-primary" />
              <span>System Analytics</span>
            </CommandItem>
            <CommandItem
              onSelect={() => runCommand(() => navigate(user ? "/settings" : "/login"))}
              className="gap-2 cursor-pointer"
            >
              {user ? <Settings className="w-4 h-4 text-primary" /> : <LogIn className="w-4 h-4 text-primary" />}
              <span>{user ? "Archive Settings" : "Sign In to Terminal"}</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Themes">
            {themes.map((t) => (
              <CommandItem
                key={t.id}
                onSelect={() => runCommand(() => setTheme(t.id))}
                className="gap-2 cursor-pointer"
              >
                <Palette className="w-4 h-4" style={{ color: t.color }} />
                <span>Switch theme: {t.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {cards.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Recent Saved Nodes (${Math.min(cards.length, 6)})`}>
                {cards.slice(0, 6).map((c) => (
                  <CommandItem
                    key={c.id}
                    onSelect={() => runCommand(() => navigate(`/card/${c.id}`))}
                    className="gap-2 cursor-pointer flex justify-between"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{c.title || c.url}</span>
                    </div>
                    {c.tags && c.tags.length > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0 border border-border px-1.5 py-0.5 rounded">
                        #{c.tags[0]}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
