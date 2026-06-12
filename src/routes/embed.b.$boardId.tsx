import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchEmbedBoard } from "@/lib/integrations.functions";

const searchSchema = z.object({ token: z.string().min(16) });

export const Route = createFileRoute("/embed/b/$boardId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: EmbedBoardPage,
});

function EmbedBoardPage() {
  const { boardId } = Route.useParams();
  const { token } = useSearch({ from: "/embed/b/$boardId" });
  const fetchFn = useServerFn(fetchEmbedBoard);

  const q = useQuery({
    queryKey: ["embed-board", boardId, token],
    queryFn: () => fetchFn({ data: { boardId, token } }),
    retry: false,
  });

  if (q.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-6 text-sm text-red-500">
        This board is not available. The embed token may be invalid.
      </div>
    );
  }

  const { board, columns, groups, items, values } = q.data;
  const valuesByItem = new Map<string, any[]>();
  for (const v of values as any[]) {
    const arr = valuesByItem.get(v.item_id) ?? [];
    arr.push(v);
    valuesByItem.set(v.item_id, arr);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 px-4 py-3 flex items-center gap-2">
        <div className="h-3 w-3 rounded" style={{ background: board.color }} />
        <div className="text-sm font-medium">{board.name}</div>
        <div className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
          WorkPlanOS · read-only
        </div>
      </header>
      <div className="p-4 space-y-6">
        {(groups as any[]).map((g) => {
          const rows = (items as any[]).filter((i) => i.group_id === g.id);
          return (
            <section key={g.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded" style={{ background: g.color }} />
                <h2 className="text-sm font-semibold">{g.name}</h2>
                <span className="text-xs text-muted-foreground">({rows.length})</span>
              </div>
              <div className="rounded-md border border-border/60 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Item</th>
                      {(columns as any[]).map((c) => (
                        <th key={c.id} className="text-left px-3 py-2 font-medium">
                          {c.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it: any) => {
                      const vs = valuesByItem.get(it.id) ?? [];
                      const byCol = new Map(vs.map((v: any) => [v.column_id, v]));
                      return (
                        <tr key={it.id} className="border-t border-border/40">
                          <td className="px-3 py-2">{it.title}</td>
                          {(columns as any[]).map((c) => {
                            const v: any = byCol.get(c.id);
                            let display = "";
                            if (v) {
                              if (c.kind === "status" && v.status_option_id) {
                                const opt = ((c.settings as any)?.options ?? []).find(
                                  (o: any) => o.id === v.status_option_id,
                                );
                                display = opt?.label ?? "";
                              } else if (v.text_value != null) display = v.text_value;
                              else if (v.number_value != null) display = String(v.number_value);
                              else if (v.date_value) display = v.date_value;
                            }
                            return (
                              <td key={c.id} className="px-3 py-2 text-muted-foreground">
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}