import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { listMembers } from "@/lib/members.functions";

export function PeoplePicker({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const listFn = useServerFn(listMembers);
  const q = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });
  const [search, setSearch] = useState("");

  const members = q.data ?? [];
  const filtered = members.filter((m: any) => {
    const s = (m.profile?.full_name ?? m.profile?.email ?? "").toLowerCase();
    return s.includes(search.toLowerCase());
  });
  const selected = members.filter((m: any) => value.includes(m.user_id));

  const toggle = (uid: string) => {
    onChange(value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-muted/40 min-h-[24px] w-full">
          {selected.length === 0 ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <UserPlus className="h-3 w-3" /> assign
            </span>
          ) : (
            <div className="flex -space-x-1.5">
              {selected.slice(0, 4).map((m: any) => (
                <Avatar key={m.user_id} m={m} />
              ))}
              {selected.length > 4 && (
                <div className="h-5 w-5 rounded-full bg-muted text-[10px] grid place-items-center ring-1 ring-background">
                  +{selected.length - 4}
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
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground text-center">
              No members
            </li>
          )}
        </ul>
        {selected.length > 0 && (
          <div className="p-2 border-t border-border/60">
            <button
              onClick={() => onChange([])}
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