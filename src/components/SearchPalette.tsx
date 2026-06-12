import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Search, LayoutGrid, FileText, MessageSquare, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { globalSearch } from "@/lib/search.functions";

export function SearchPalette({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const searchFn = useServerFn(globalSearch);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const debounced = useDebounce(q, 200);
  const results = useQuery({
    queryKey: ["search", workspaceId, debounced],
    queryFn: () => searchFn({ data: { workspaceId, q: debounced } }),
    enabled: debounced.length >= 2,
  });

  const go = (path: any, params: any) => {
    setOpen(false);
    navigate({ to: path, params });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search boards, items, comments…"
            className="border-0 shadow-none focus-visible:ring-0 h-8"
          />
          {results.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {debounced.length < 2 && (
            <div className="px-3 py-8 text-xs text-muted-foreground text-center">
              Type at least 2 characters
            </div>
          )}
          {results.data && (
            <>
              <Section label="Boards" icon={<LayoutGrid className="h-3 w-3" />}>
                {results.data.boards.map((b) => (
                  <Row
                    key={b.id}
                    onClick={() => go("/w/$workspaceId/b/$boardId", { workspaceId, boardId: b.id })}
                  >
                    {b.name}
                  </Row>
                ))}
              </Section>
              <Section label="Items" icon={<FileText className="h-3 w-3" />}>
                {results.data.items.map((i) => (
                  <Row
                    key={i.id}
                    onClick={() => go("/w/$workspaceId/b/$boardId", { workspaceId, boardId: i.boardId })}
                    subtitle={i.boardName}
                  >
                    {i.title}
                  </Row>
                ))}
              </Section>
              <Section label="Comments" icon={<MessageSquare className="h-3 w-3" />}>
                {results.data.comments.map((c) => (
                  <Row
                    key={c.id}
                    onClick={() => go("/w/$workspaceId/b/$boardId", { workspaceId, boardId: c.boardId })}
                    subtitle={c.itemTitle}
                  >
                    {c.preview}
                  </Row>
                ))}
              </Section>
              {results.data.boards.length === 0 &&
                results.data.items.length === 0 &&
                results.data.comments.length === 0 && (
                  <div className="px-3 py-8 text-xs text-muted-foreground text-center">
                    No results
                  </div>
                )}
            </>
          )}
        </div>
        <div className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground flex justify-between">
          <span>⌘K to toggle</span>
          <span>Esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const filtered = arr.filter(Boolean);
  if (filtered.length === 0) return null;
  return (
    <div className="py-1.5">
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  children,
  subtitle,
  onClick,
}: {
  children: React.ReactNode;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between gap-2"
    >
      <span className="truncate">{children}</span>
      {subtitle && (
        <span className="text-[10px] text-muted-foreground truncate max-w-[40%]">
          {subtitle}
        </span>
      )}
    </button>
  );
}

function useDebounce<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}