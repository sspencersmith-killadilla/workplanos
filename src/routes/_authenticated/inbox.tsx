import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listNotifications,
  markAllRead,
  markNotificationRead,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotifications);
  const markAll = useServerFn(markAllRead);
  const markOne = useServerFn(markNotificationRead);

  const q = useQuery({
    queryKey: ["notifications-full"],
    queryFn: () => listFn({ data: { limit: 100 } }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await markAll();
              qc.invalidateQueries();
            }}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" /> Mark all read
          </Button>
        </header>
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {(q.data?.length ?? 0) === 0 && (
            <li className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nothing here yet.
            </li>
          )}
          {q.data?.map((n: any) => (
            <li
              key={n.id}
              className={`px-4 py-3 ${!n.read_at ? "bg-muted/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {n.kind === "mention" && "You were mentioned"}
                    {n.kind === "assigned" && "You were assigned to an item"}
                    {!["mention", "assigned"].includes(n.kind) && n.kind}
                  </div>
                  {n.payload?.preview && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {n.payload.preview}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
                {!n.read_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await markOne({ data: { id: n.id } });
                      qc.invalidateQueries();
                    }}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}