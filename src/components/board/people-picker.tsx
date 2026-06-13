import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, UserPlus, X, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { listMembers } from "@/lib/members.functions";
import { listExternals, createExternal } from "@/lib/customizations.functions";

export function PeoplePicker({
  workspaceId,
  boardId,
  value,
  externalValue,
  onChange,
  onChangeExternal,
}: {
  workspaceId: string;
  boardId?: string;
  value: string[];
  externalValue?: string[];
  onChange: (next: string[]) => void;
  onChangeExternal?: (next: string[]) => void;
}) {
  const listFn = useServerFn(listMembers);
  const listExtFn = useServerFn(listExternals);
  const createExtFn = useServerFn(createExternal);
  const q = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });
  const extQ = useQuery({
    queryKey: ["externals", boardId],
    queryFn: () => listExtFn({ data: { boardId: boardId! } }),
    enabled: !!boardId,
  });
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const members = q.data ?? [];
  const externals = (extQ.data ?? []) as { id: string; name: string; email: string | null }[];
  const ext = externalValue ?? [];
  const filtered = members.filter((m: any) => {
    const s = (m.profile?.full_name ?? m.profile?.email ?? "").toLowerCase();
    return s.includes(search.toLowerCase());
  });
  const filteredExt = externals.filter((e) =>
    (e.name + " " + (e.email ?? "")).toLowerCase().includes(search.toLowerCase()),
  );
  const selected = members.filter((m: any) => value.includes(m.user_id));
  const selectedExt = externals.filter((e) => ext.includes(e.id));

  const toggle = (uid: string) => {
    onChange(value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid]);
  };
  const toggleExt = (id: string) => {
    if (!onChangeExternal) return;
    onChangeExternal(ext.includes(id) ? ext.filter((x) => x !== id) : [...ext, id]);
  };

  const totalSelected = selected.length + selectedExt.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-muted/40 min-h-[24px] w-full">
          {totalSelected === 0 ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <UserPlus className="h-3 w-3" /> assign
            </span>
          ) : (
            <div className="flex -space-x-1.5">
              {selected.slice(0, 4).map((m: any) => (
                <Avatar key={m.user_id} m={m} />
              ))}
              {selectedExt.slice(0, Math.max(0, 4 - selected.length)).map((e) => (
                <ExtAvatar key={e.id} name={e.name} />
              ))}
              {totalSelected > 4 && (
                <div className="h-5 w-5 rounded-full bg-muted text-[10px] grid place-items-center ring-1 ring-background">
                  +{totalSelected - 4}
                </div>
              )}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b border-border/60">
          <Input
            autoFocus
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto">
          {filtered.map((m: any) => {
            const on = value.includes(m.user_id);
            return (
              <li key={m.user_id}>
                <button
                  onClick={() => toggle(m.user_id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted text-xs"
                >
                  <Avatar m={m} />
                  <span className="flex-1 text-left truncate">
                    {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                  </span>
                  {on && <Check className="h-3 w-3" />}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && filteredExt.length === 0 && !adding && (
            <li className="px-2 py-3 text-xs text-muted-foreground text-center">
              No matches
            </li>
          )}
          {boardId && filteredExt.length > 0 && (
            <li className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              External
            </li>
          )}
          {boardId &&
            filteredExt.map((e) => {
              const on = ext.includes(e.id);
              return (
                <li key={e.id}>
                  <button
                    onClick={() => toggleExt(e.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted text-xs"
                  >
                    <ExtAvatar name={e.name} />
                    <span className="flex-1 text-left truncate">
                      {e.name}
                      {e.email && <span className="text-muted-foreground"> · {e.email}</span>}
                    </span>
                    {on && <Check className="h-3 w-3" />}
                  </button>
                </li>
              );
            })}
        </ul>
        {boardId && onChangeExternal && (
          <div className="border-t border-border/60 p-2">
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add external person
              </button>
            ) : (
              <div className="space-y-1.5">
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-7 text-xs"
                />
                <Input
                  placeholder="Email (optional)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-7 text-xs"
                />
                <div className="flex gap-1">
                  <button
                    className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                    onClick={async () => {
                      if (!newName.trim()) return;
                      const r = await createExtFn({
                        data: { boardId, name: newName.trim(), email: newEmail.trim() || undefined },
                      });
                      await extQ.refetch();
                      onChangeExternal?.([...ext, r.id]);
                      setNewName("");
                      setNewEmail("");
                      setAdding(false);
                    }}
                  >
                    Add
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded hover:bg-muted"
                    onClick={() => {
                      setAdding(false);
                      setNewName("");
                      setNewEmail("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {totalSelected > 0 && (
          <div className="p-2 border-t border-border/60">
            <button
              onClick={() => {
                onChange([]);
                onChangeExternal?.([]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Avatar({ m }: { m: any }) {
  const label = (m.profile?.full_name ?? m.profile?.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="h-5 w-5 rounded-full bg-muted text-[10px] grid place-items-center overflow-hidden ring-1 ring-background font-medium">
      {m.profile?.avatar_url ? (
        <img src={m.profile.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        label
      )}
    </div>
  );
}

function ExtAvatar({ name }: { name: string }) {
  const label = (name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="h-5 w-5 rounded-full bg-muted/60 text-[10px] grid place-items-center ring-1 ring-background font-medium border border-dashed border-border">
      {label}
    </div>
  );
}