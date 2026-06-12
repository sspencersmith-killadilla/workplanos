import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  listNotifications,
  unreadCount,
  markAllRead,
  markNotificationRead,
} from "@/lib/notifications.functions";

export function InboxBell() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotifications);
  const countFn = useServerFn(unreadCount);
  const markAll = useServerFn(markAllRead);
  const markOne = useServerFn(markNotificationRead);

  const countQ = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => countFn(),
    refetchInterval: 60_000,
  });
  const listQ = useQuery({
    queryKey: ["notifications-list"],
    queryFn: () => listFn({ data: { limit: 20 } }),
  });

  // Realtime
  useEffect(() => {
    let userId: string | null = null;
    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
      if (!userId) return;
      const channel = supabase
        .channel(`notifs-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["notifications-count"] });
            qc.invalidateQueries({ queryKey: ["notifications-list"] });
          },
        )
        .subscribe();
      (window as any).__notifChannel = channel;
    });
    return () => {
      const ch = (window as any).__notifChannel;
      if (ch) supabase.removeChannel(ch);
    };
  }, [qc]);

  const count = countQ.data ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative h-7 w-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
          <Bell className="h-3.5 w-3.5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] grid place-items-center font-medium">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <span className="text-sm font-medium">Notifications</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await markAll();
              qc.invalidateQueries({ queryKey: ["notifications-count"] });
              qc.invalidateQueries({ queryKey: ["notifications-list"] });
            }}
          >
            <Check className="h-3 w-3 mr-1" /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(listQ.data?.length ?? 0) === 0 && (
            <div className="px-3 py-8 text-xs text-muted-foreground text-center">
              You're all caught up.
            </div>
          )}
          {listQ.data?.map((n: any) => (
            <button
              key={n.id}
              className={`w-full text-left px-3 py-2 text-xs border-b border-border/40 hover:bg-muted ${
                !n.read_at ? "bg-muted/50" : ""
              }`}
              onClick={async () => {
                if (!n.read_at) {
                  await markOne({ data: { id: n.id } });
                  qc.invalidateQueries({ queryKey: ["notifications-count"] });
                  qc.invalidateQueries({ queryKey: ["notifications-list"] });
                }
              }}
            >
              <div className="font-medium">
                {n.kind === "mention" && "You were mentioned"}
                {n.kind === "assigned" && "You were assigned to an item"}
                {!["mention", "assigned"].includes(n.kind) && n.kind}
              </div>
              {n.payload?.preview && (
                <div className="text-muted-foreground truncate mt-0.5">{n.payload.preview}</div>
              )}
              <div className="text-[10px] text-muted-foreground mt-1">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-border/60 p-2">
          <Link to="/inbox" className="block text-xs text-center hover:underline">
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}