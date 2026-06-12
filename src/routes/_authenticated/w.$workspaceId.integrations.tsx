import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listBoards } from "@/lib/boards.functions";
import {
  getTessIntegration,
  upsertTessIntegration,
  listIntegrationDispatches,
} from "@/lib/integrations.functions";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { workspaceId } = Route.useParams();
  const qc = useQueryClient();

  const listBoardsFn = useServerFn(listBoards);
  const getIntegFn = useServerFn(getTessIntegration);
  const upsertFn = useServerFn(upsertTessIntegration);
  const listDispatchesFn = useServerFn(listIntegrationDispatches);

  const boardsQ = useQuery({
    queryKey: ["boards", workspaceId],
    queryFn: () => listBoardsFn({ data: { workspaceId } }),
  });
  const integQ = useQuery({
    queryKey: ["tess-integration", workspaceId],
    queryFn: () => getIntegFn({ data: { workspaceId } }),
  });
  const dispatchesQ = useQuery({
    queryKey: ["integration-dispatches", workspaceId],
    queryFn: () => listDispatchesFn({ data: { workspaceId } }),
  });

  const [boardId, setBoardId] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState("");
  const [tessWsId, setTessWsId] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  // Hydrate form when data loads
  if (integQ.data && !boardId && integQ.data.target_board_id) {
    setBoardId(integQ.data.target_board_id);
    setBaseUrl(integQ.data.tess_base_url ?? "");
    setTessWsId(integQ.data.tess_workspace_id ?? "");
  }

  const save = useMutation({
    mutationFn: (rotate: boolean) =>
      upsertFn({
        data: {
          workspaceId,
          targetBoardId: boardId || null,
          tessBaseUrl: baseUrl || null,
          tessWorkspaceId: tessWsId || null,
          enabled: true,
          rotateSecret: rotate,
        },
      }),
    onSuccess: (res) => {
      if (res.revealSecret) setRevealed(res.revealSecret);
      qc.invalidateQueries({ queryKey: ["tess-integration", workspaceId] });
      toast.success("Integration saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/integrations/tess/inbound`
      : "/api/public/integrations/tess/inbound";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            to="/w/$workspaceId"
            params={{ workspaceId }}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-semibold">Integrations</h1>
        </div>

        <section className="rounded-lg border border-border/60 p-5 space-y-4">
          <div>
            <h2 className="text-base font-medium">Total Event System Solutions</h2>
            <p className="text-sm text-muted-foreground">
              Sync TESS events into a board here, and push WorkPlanOS status changes back.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Target board</Label>
            <Select value={boardId} onValueChange={setBoardId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a board" />
              </SelectTrigger>
              <SelectContent>
                {(boardsQ.data ?? []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              TESS events become items in this board. Column mapping is by title:
              Date / Venue / Status / Assignee.
            </p>
          </div>

          <div className="space-y-2">
            <Label>TESS base URL (for outbound sync)</Label>
            <Input
              value={baseUrl}
              placeholder="https://totaleventsystemsolutions.lovable.app"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>TESS workspace / org ID (optional)</Label>
            <Input
              value={tessWsId}
              placeholder="org_…"
              onChange={(e) => setTessWsId(e.target.value)}
            />
          </div>

          <div className="rounded-md bg-muted/40 border border-border/60 p-3 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Webhook URL (paste into TESS)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all">{webhookUrl}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Required headers: <code>x-tess-workspace: {workspaceId}</code> and{" "}
              <code>x-tess-signature: sha256=&lt;hmac of raw body&gt;</code>
            </div>
          </div>

          {integQ.data && (
            <div className="text-xs text-muted-foreground">
              Current shared secret: <code>{integQ.data.shared_secret}</code>
            </div>
          )}

          {revealed && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <div className="text-xs font-medium text-amber-600">
                New shared secret — copy now, it will not be shown again:
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs break-all">{revealed}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(revealed);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              disabled={!boardId || save.isPending}
              onClick={() => save.mutate(false)}
            >
              Save
            </Button>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate(true)}
            >
              {integQ.data ? "Rotate secret" : "Create + generate secret"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border/60 p-5">
          <h3 className="text-sm font-medium mb-3">Recent sync activity</h3>
          {(dispatchesQ.data ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No activity yet.</div>
          ) : (
            <div className="space-y-1 text-xs font-mono">
              {(dispatchesQ.data ?? []).map((d: any) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 py-1 border-b border-border/40 last:border-0"
                >
                  <span className="text-muted-foreground">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                  <span>{d.direction}</span>
                  <span
                    className={
                      d.error
                        ? "text-red-500"
                        : (d.status_code ?? 200) < 400
                        ? "text-green-500"
                        : "text-amber-500"
                    }
                  >
                    {d.status_code ?? "—"}
                  </span>
                  {d.error && <span className="text-red-500 truncate">{d.error}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}