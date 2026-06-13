import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Paperclip,
  Send,
  Trash2,
  FileText,
  Download,
  Plus,
  CheckCircle2,
  Circle,
  History,
  MessageSquare,
  ListChecks,
  Files as FilesIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getItemDetail,
  addComment,
  deleteComment,
  createSubItem,
  registerFile,
  deleteFile,
  signFileUrl,
} from "@/lib/collab.functions";
import { setItemCompleted } from "@/lib/boards.functions";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export function ItemDrawer({
  itemId,
  onClose,
}: {
  itemId: string | null;
  onClose: () => void;
}) {
  const open = !!itemId;
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0"
      >
        {itemId ? <DrawerBody itemId={itemId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ itemId }: { itemId: string }) {
  const qc = useQueryClient();
  const getDetailFn = useServerFn(getItemDetail);
  const queryKey = ["item-detail", itemId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getDetailFn({ data: { itemId } }),
  });

  // Realtime: refresh detail when comments/activity/files/subitems change
  useEffect(() => {
    const ch = supabase
      .channel(`item:${itemId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `item_id=eq.${itemId}` }, () =>
        qc.invalidateQueries({ queryKey }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "item_activity", filter: `item_id=eq.${itemId}` }, () =>
        qc.invalidateQueries({ queryKey }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "item_files", filter: `item_id=eq.${itemId}` }, () =>
        qc.invalidateQueries({ queryKey }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `parent_item_id=eq.${itemId}` }, () =>
        qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [itemId, qc]);

  if (isLoading || !data) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    );
  }

  const profileMap = new Map((data.profiles ?? []).map((p: any) => [p.id, p]));

  return (
    <>
      <SheetHeader className="px-6 py-4 border-b border-border/60 shrink-0">
        <SheetTitle className="text-base font-semibold truncate">
          {data.item.title}
        </SheetTitle>
        <SheetDescription className="text-xs">
          Opened{" "}
          {formatDistanceToNow(new Date(data.item.created_at), { addSuffix: true })}
        </SheetDescription>
      </SheetHeader>

      <Tabs defaultValue="updates" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mt-3 grid grid-cols-4 w-auto bg-muted/40">
          <TabsTrigger value="updates" className="gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" /> Updates
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" /> Activity
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-1.5 text-xs">
            <FilesIcon className="h-3.5 w-3.5" /> Files
          </TabsTrigger>
          <TabsTrigger value="subitems" className="gap-1.5 text-xs">
            <ListChecks className="h-3.5 w-3.5" /> Sub-items
          </TabsTrigger>
        </TabsList>

        <TabsContent value="updates" className="flex-1 min-h-0 mt-0">
          <UpdatesTab
            itemId={itemId}
            comments={data.comments}
            profileMap={profileMap}
            members={data.members}
            onChanged={() => qc.invalidateQueries({ queryKey })}
          />
        </TabsContent>

        <TabsContent value="activity" className="flex-1 min-h-0 mt-0">
          <ActivityTab activity={data.activity} profileMap={profileMap} />
        </TabsContent>

        <TabsContent value="files" className="flex-1 min-h-0 mt-0">
          <FilesTab
            itemId={itemId}
            files={data.files}
            profileMap={profileMap}
            onChanged={() => qc.invalidateQueries({ queryKey })}
          />
        </TabsContent>

        <TabsContent value="subitems" className="flex-1 min-h-0 mt-0">
          <SubItemsTab
            itemId={itemId}
            subItems={data.subItems}
            onChanged={() => qc.invalidateQueries({ queryKey })}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------ shared bits ------------ */

function PersonAvatar({
  profile,
  size = 32,
}: {
  profile?: { full_name?: string | null; email?: string | null; avatar_url?: string | null };
  size?: number;
}) {
  const initials = (() => {
    const n = profile?.full_name ?? profile?.email ?? "?";
    return n
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("");
  })();
  return (
    <Avatar style={{ height: size, width: size }}>
      {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
      <AvatarFallback className="text-[10px] bg-primary/15 text-primary font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

/* ------------ Updates ------------ */

function UpdatesTab({
  itemId,
  comments,
  profileMap,
  members,
  onChanged,
}: {
  itemId: string;
  comments: any[];
  profileMap: Map<string, any>;
  members: any[];
  onChanged: () => void;
}) {
  const addCommentFn = useServerFn(addComment);
  const deleteCommentFn = useServerFn(deleteComment);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredMembers = useMemo(() => {
    const q = mentionFilter.toLowerCase();
    return members.filter((m) =>
      ((m.full_name ?? "") + " " + (m.email ?? "")).toLowerCase().includes(q),
    ).slice(0, 6);
  }, [members, mentionFilter]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setBody(v);
    const cursor = e.target.selectionStart;
    const upTo = v.slice(0, cursor);
    const m = upTo.match(/@([\w.-]*)$/);
    if (m) {
      setMentionOpen(true);
      setMentionFilter(m[1]);
    } else {
      setMentionOpen(false);
    }
  }

  function insertMention(member: any) {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = body.slice(0, cursor).replace(/@([\w.-]*)$/, "");
    const after = body.slice(cursor);
    const handle = (member.full_name ?? member.email ?? "").toLowerCase().replace(/\s+/g, "").replace(/@.*/, "");
    const next = `${before}@${handle} ${after}`;
    setBody(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (before + `@${handle} `).length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function send() {
    const v = body.trim();
    if (!v) return;
    setSending(true);
    try {
      await addCommentFn({ data: { itemId, body: v } });
      setBody("");
      onChanged();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No updates yet. Start the conversation.</p>
          )}
          {comments.map((c) => {
            const author = profileMap.get(c.author_id);
            return (
              <div key={c.id} className="flex gap-3 group">
                <PersonAvatar profile={author} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">
                      {author?.full_name ?? author?.email ?? "Someone"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      {c.edited_at && " · edited"}
                    </span>
                    <button
                      onClick={() => deleteCommentFn({ data: { id: c.id } }).then(onChanged)}
                      className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    <FormattedBody text={c.body} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      <div className="border-t border-border/60 p-3 shrink-0 relative">
        {mentionOpen && filteredMembers.length > 0 && (
          <div className="absolute bottom-full mb-1 left-3 right-3 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-10">
            {filteredMembers.map((m) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left text-sm"
              >
                <PersonAvatar profile={m} size={20} />
                <span className="truncate">{m.full_name ?? m.email}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Write an update… use @ to mention"
          rows={3}
          className="w-full bg-muted/30 border border-border/60 rounded-md px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-primary/40"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-muted-foreground">
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">⌘</kbd>{" "}
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> to send
          </span>
          <button
            onClick={send}
            disabled={sending || !body.trim()}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function FormattedBody({ text }: { text: string }) {
  const parts = text.split(/(@[\w.-]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="text-primary font-medium">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/* ------------ Activity ------------ */

function ActivityTab({
  activity,
  profileMap,
}: {
  activity: any[];
  profileMap: Map<string, any>;
}) {
  if (activity.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        No activity recorded yet.
      </div>
    );
  }
  return (
    <ScrollArea className="flex-1 h-full px-6 py-4">
      <ul className="space-y-3">
        {activity.map((a) => {
          const actor = a.actor_id ? profileMap.get(a.actor_id) : null;
          return (
            <li key={a.id} className="flex gap-3 items-start text-sm">
              <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  {actor?.full_name ?? actor?.email ?? "System"}
                </span>{" "}
                <span className="text-muted-foreground">{describeActivity(a)}</span>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

function describeActivity(a: any) {
  switch (a.kind) {
    case "comment_added":
      return "posted an update";
    case "title_changed":
      return `renamed to "${a.payload?.title}"`;
    case "group_changed":
      return "moved to another group";
    case "subitem_added":
      return `added sub-item "${a.payload?.title}"`;
    case "file_added":
      return `attached ${a.payload?.name}`;
    default:
      return a.kind.replace(/_/g, " ");
  }
}

/* ------------ Files ------------ */

function FilesTab({
  itemId,
  files,
  profileMap,
  onChanged,
}: {
  itemId: string;
  files: any[];
  profileMap: Map<string, any>;
  onChanged: () => void;
}) {
  const registerFn = useServerFn(registerFile);
  const deleteFn = useServerFn(deleteFile);
  const signFn = useServerFn(signFileUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const safeName = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${itemId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage
          .from("item-files")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        await registerFn({
          data: { itemId, path, name: file.name, mime: file.type || null, size: file.size },
        });
      }
      onChanged();
    } catch (err: any) {
      alert(`Upload failed: ${err.message ?? err}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function open(f: any) {
    const { url } = await signFn({ data: { path: f.path } });
    window.open(url, "_blank");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border/60 flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={onPick}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border/60 hover:bg-muted disabled:opacity-50"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Attach file"}
        </button>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>
      <ScrollArea className="flex-1 px-6 py-4">
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No files attached yet.</p>
        ) : (
          <ul className="space-y-1">
            {files.map((f) => {
              const uploader = profileMap.get(f.uploaded_by);
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40 group"
                >
                  <div className="h-9 w-9 grid place-items-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{f.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatBytes(f.size_bytes)} ·{" "}
                      {uploader?.full_name ?? uploader?.email ?? "Unknown"} ·{" "}
                      {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <button
                    onClick={() => open(f)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    aria-label="Open file"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${f.name}?`)) deleteFn({ data: { id: f.id } }).then(onChanged);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    aria-label="Delete file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function formatBytes(n: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------ Sub-items ------------ */

function SubItemsTab({
  itemId,
  subItems,
  onChanged,
}: {
  itemId: string;
  subItems: any[];
  onChanged: () => void;
}) {
  const createSubFn = useServerFn(createSubItem);
  const setCompletedFn = useServerFn(setItemCompleted);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const t = draft.trim();
    if (!t) return;
    setBusy(true);
    try {
      await createSubFn({ data: { parentId: itemId, title: t } });
      setDraft("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-6 py-4">
        {subItems.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No sub-items yet.</p>
        ) : (
          <ul className="space-y-1">
            {subItems.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 text-sm"
              >
                <button
                  onClick={async () => {
                    await setCompletedFn({
                      data: { id: s.id, completed: !s.completed_at },
                    });
                    onChanged();
                  }}
                  className="shrink-0"
                  aria-label={s.completed_at ? "Mark incomplete" : "Mark complete"}
                >
                  {s.completed_at ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <span
                  className={cn(
                    "flex-1 truncate",
                    s.completed_at && "line-through text-muted-foreground",
                  )}
                >
                  {s.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      <div className="border-t border-border/60 p-3 flex gap-2 shrink-0">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a sub-item…"
          className="flex-1 bg-muted/30 border border-border/60 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          onClick={add}
          disabled={busy || !draft.trim()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}