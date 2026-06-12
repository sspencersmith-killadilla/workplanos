import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { getPublicForm, submitPublicForm } from "@/lib/forms.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/f/$slug")({
  component: PublicFormPage,
  head: ({ params }) => ({
    meta: [{ title: `Form · ${params.slug}` }],
  }),
});

type FormField = {
  id: string;
  columnId: string;
  label: string;
  required?: boolean;
};

function PublicFormPage() {
  const { slug } = Route.useParams();
  const router = useRouter();
  const getFormFn = useServerFn(getPublicForm);
  const submitFn = useServerFn(submitPublicForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-form", slug],
    queryFn: () => getFormFn({ data: { slug } }),
    retry: false,
  });

  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      submitFn({ data: { slug, title: title || "Untitled submission", values } }),
    onSuccess: () => {
      const redirect = data?.form.redirect_url;
      if (redirect) {
        window.location.href = redirect;
      } else {
        setDone(true);
      }
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Loading form…</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-semibold">Form not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This form doesn't exist or is no longer accepting responses.
          </p>
        </div>
      </div>
    );
  }

  const fields = ((data.form.fields as any)?.items ?? []) as FormField[];
  const colById = new Map(data.columns.map((c: any) => [c.id, c]));

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4">
        <div className="text-center max-w-sm">
          <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 grid place-items-center text-2xl">
            ✓
          </div>
          <h1 className="mt-4 text-2xl font-semibold">Thanks!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your response has been recorded.
          </p>
          <Button
            className="mt-6"
            variant="outline"
            onClick={() => {
              setDone(false);
              setTitle("");
              setValues({});
            }}
          >
            Submit another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-xl mx-auto">
        <div className="rounded-xl border border-border/60 bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{data.form.title}</h1>
          {data.form.description && (
            <p className="mt-2 text-sm text-muted-foreground">{data.form.description}</p>
          )}

          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="__title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="__title"
                value={title}
                required
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this entry a name"
              />
            </div>

            {fields.map((f) => {
              const col: any = colById.get(f.columnId);
              if (!col) return null;
              const val = values[f.columnId];
              const setVal = (v: unknown) =>
                setValues((s) => ({ ...s, [f.columnId]: v }));
              return (
                <div key={f.id} className="space-y-1.5">
                  <Label htmlFor={f.id}>
                    {f.label || col.title}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {col.kind === "text" && (
                    <Textarea
                      id={f.id}
                      required={f.required}
                      value={(val as string) ?? ""}
                      onChange={(e) => setVal(e.target.value)}
                    />
                  )}
                  {col.kind === "number" && (
                    <Input
                      id={f.id}
                      type="number"
                      required={f.required}
                      value={(val as string) ?? ""}
                      onChange={(e) => setVal(e.target.value)}
                    />
                  )}
                  {col.kind === "date" && (
                    <Input
                      id={f.id}
                      type="date"
                      required={f.required}
                      value={(val as string) ?? ""}
                      onChange={(e) => setVal(e.target.value)}
                    />
                  )}
                  {col.kind === "link" && (
                    <Input
                      id={f.id}
                      type="url"
                      required={f.required}
                      value={(val as string) ?? ""}
                      onChange={(e) => setVal(e.target.value)}
                    />
                  )}
                  {col.kind === "status" && (
                    <Select
                      value={(val as string) ?? ""}
                      onValueChange={(v) => setVal(v)}
                    >
                      <SelectTrigger id={f.id}>
                        <SelectValue placeholder="Choose…" />
                      </SelectTrigger>
                      <SelectContent>
                        {((col.settings?.options ?? []) as any[]).map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}

            {submit.error && (
              <p className="text-sm text-destructive">
                {(submit.error as Error).message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submit.isPending}
            >
              {submit.isPending ? "Submitting…" : "Submit"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Powered by your workspace
        </p>
      </div>
    </div>
  );
}

// silence unused router warning if tree-shaken
void useRouter;