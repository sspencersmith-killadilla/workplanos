import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { getBoard } from "@/lib/boards.functions";
import {
  listForms,
  createForm,
  updateForm,
  deleteForm,
  listSubmissions,
} from "@/lib/forms.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceId/b/$boardId/forms",
)({
  component: FormsManager,
});

const FORM_KINDS = new Set(["text", "number", "date", "status", "link"]);

function FormsManager() {
  const { workspaceId, boardId } = Route.useParams();
  const qc = useQueryClient();

  const getBoardFn = useServerFn(getBoard);
  const listFormsFn = useServerFn(listForms);
  const createFormFn = useServerFn(createForm);
  const updateFormFn = useServerFn(updateForm);
  const deleteFormFn = useServerFn(deleteForm);
  const listSubsFn = useServerFn(listSubmissions);

  const boardQ = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => getBoardFn({ data: { id: boardId } }),
  });
  const formsKey = ["forms", boardId] as const;
  const formsQ = useQuery({
    queryKey: formsKey,
    queryFn: () => listFormsFn({ data: { boardId } }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (formsQ.data ?? []).find((f: any) => f.id === selectedId) ?? null,
    [formsQ.data, selectedId],
  );

  const createMut = useMutation({
    mutationFn: (title: string) => createFormFn({ data: { boardId, title } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: formsKey });
      setSelectedId(res.id);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFormFn({ data: { id } }),
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: formsKey });
    },
  });

  if (boardQ.isLoading || formsQ.isLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading forms…</div>
    );
  }

  const board = boardQ.data?.board;
  const columns = (boardQ.data?.columns ?? []).filter((c: any) =>
    FORM_KINDS.has(c.kind),
  );
  const groups = boardQ.data?.groups ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border/60 px-6 py-3 flex items-center gap-3 shrink-0">
        <Link
          to="/w/$workspaceId/b/$boardId"
          params={{ workspaceId, boardId }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to board
        </Link>
        <div className="h-4 w-px bg-border" />
        <h1 className="font-semibold tracking-tight">
          Forms · <span className="text-muted-foreground">{board?.name}</span>
        </h1>
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={() => createMut.mutate("New form")}
            disabled={createMut.isPending}
          >
            <Plus className="h-4 w-4 mr-1.5" /> New form
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[260px_1fr] min-h-0">
        <aside className="border-r border-border/60 overflow-y-auto p-2 space-y-1 bg-card/30">
          {(formsQ.data ?? []).length === 0 && (
            <p className="px-3 py-6 text-xs text-muted-foreground text-center">
              No forms yet. Create one to collect submissions into this board.
            </p>
          )}
          {(formsQ.data ?? []).map((f: any) => (
            <button
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedId === f.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="truncate flex-1">{f.title}</span>
                {f.is_published ? (
                  <Eye className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                /f/{f.slug}
              </div>
            </button>
          ))}
        </aside>

        <main className="overflow-y-auto p-6">
          {!selected ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Select a form to edit, or create a new one.
            </div>
          ) : (
            <FormEditor
              key={selected.id}
              form={selected}
              columns={columns}
              groups={groups}
              onSave={async (patch) => {
                await updateFormFn({ data: { id: selected.id, ...patch } });
                qc.invalidateQueries({ queryKey: formsKey });
              }}
              onDelete={() => {
                if (confirm(`Delete form "${selected.title}"?`)) {
                  deleteMut.mutate(selected.id);
                }
              }}
              listSubmissions={() =>
                listSubsFn({ data: { formId: selected.id } })
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}

type FieldDef = {
  id: string;
  columnId: string;
  label: string;
  required: boolean;
};

function FormEditor(props: {
  form: any;
  columns: any[];
  groups: any[];
  onSave: (patch: any) => Promise<void>;
  onDelete: () => void;
  listSubmissions: () => Promise<any[]>;
}) {
  const { form, columns, groups } = props;
  const initialFields = (form.fields as any) ?? { groupId: null, items: [] };
  const [title, setTitle] = useState(form.title as string);
  const [description, setDescription] = useState((form.description ?? "") as string);
  const [redirect, setRedirect] = useState((form.redirect_url ?? "") as string);
  const [groupId, setGroupId] = useState<string | null>(initialFields.groupId ?? null);
  const [fields, setFields] = useState<FieldDef[]>(
    Array.isArray(initialFields.items) ? initialFields.items : [],
  );
  const [published, setPublished] = useState<boolean>(!!form.is_published);
  const [saving, setSaving] = useState(false);

  const publicUrl =
    typeof window !== "undefined" ? `${window.location.origin}/f/${form.slug}` : `/f/${form.slug}`;

  const save = async (overrides: Partial<{ published: boolean }> = {}) => {
    setSaving(true);
    try {
      await props.onSave({
        title,
        description: description || null,
        redirect_url: redirect || null,
        is_published: overrides.published ?? published,
        fields: { groupId, items: fields } as any,
      });
      toast.success("Form saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold h-11"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={published}
            onCheckedChange={(v) => {
              setPublished(v);
              save({ published: v });
            }}
          />
          <span className="text-sm text-muted-foreground">
            {published ? "Published" : "Draft"}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={props.onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="rounded-lg border border-border/60 p-4 bg-card/30 flex items-center gap-3">
        <code className="flex-1 text-xs text-muted-foreground truncate">
          {publicUrl}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(publicUrl);
            toast.success("Link copied");
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={publicUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
          </a>
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Help respondents understand what this form is for"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Add submissions to group</Label>
          <Select
            value={groupId ?? ""}
            onValueChange={(v) => setGroupId(v || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Default (no group)" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g: any) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Redirect URL (optional)</Label>
          <Input
            value={redirect}
            onChange={(e) => setRedirect(e.target.value)}
            placeholder="https://example.com/thanks"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Fields</Label>
        </div>
        <div className="rounded-lg border border-border/60 divide-y divide-border/60">
          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              No fields yet. Add one below to start collecting data.
            </p>
          )}
          {fields.map((f, i) => {
            const col = columns.find((c: any) => c.id === f.columnId);
            return (
              <div key={f.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    value={f.label}
                    placeholder={col?.title ?? "Label"}
                    onChange={(e) =>
                      setFields((s) =>
                        s.map((x, idx) =>
                          idx === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <div className="text-xs text-muted-foreground self-center">
                    {col ? `${col.title} · ${col.kind}` : "Missing column"}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={f.required}
                    onCheckedChange={(v) =>
                      setFields((s) =>
                        s.map((x, idx) =>
                          idx === i ? { ...x, required: !!v } : x,
                        ),
                      )
                    }
                  />
                  Required
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setFields((s) => s.filter((_, idx) => idx !== i))
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
          <AddFieldRow
            columns={columns.filter(
              (c: any) => !fields.some((f) => f.columnId === c.id),
            )}
            onAdd={(col) =>
              setFields((s) => [
                ...s,
                {
                  id: crypto.randomUUID(),
                  columnId: col.id,
                  label: col.title,
                  required: false,
                },
              ])
            }
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button onClick={() => save()} disabled={saving}>
          {saving ? "Saving…" : "Save form"}
        </Button>
      </div>

      <SubmissionsPanel listSubmissions={props.listSubmissions} />
    </div>
  );
}

function AddFieldRow({
  columns,
  onAdd,
}: {
  columns: any[];
  onAdd: (c: any) => void;
}) {
  const [val, setVal] = useState<string>("");
  return (
    <div className="p-3 flex items-center gap-2">
      <Select
        value={val}
        onValueChange={(v) => {
          const col = columns.find((c) => c.id === v);
          if (col) {
            onAdd(col);
            setVal("");
          }
        }}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Add a field from a board column…" />
        </SelectTrigger>
        <SelectContent>
          {columns.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">
              All eligible columns are already added.
            </div>
          )}
          {columns.map((c: any) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title} · {c.kind}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SubmissionsPanel({
  listSubmissions,
}: {
  listSubmissions: () => Promise<any[]>;
}) {
  const q = useQuery({
    queryKey: ["form-submissions", listSubmissions],
    queryFn: listSubmissions,
  });
  return (
    <div className="space-y-2">
      <Label>Recent submissions</Label>
      <div className="rounded-lg border border-border/60 divide-y divide-border/60 text-sm">
        {q.isLoading && (
          <p className="p-4 text-xs text-muted-foreground">Loading…</p>
        )}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <p className="p-4 text-xs text-muted-foreground text-center">
            No submissions yet.
          </p>
        )}
        {(q.data ?? []).map((s: any) => (
          <div key={s.id} className="p-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {new Date(s.submitted_at).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {Object.keys(s.payload ?? {}).length} fields
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}