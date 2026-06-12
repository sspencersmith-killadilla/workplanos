import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; q: string }) =>
    z.object({ workspaceId: z.string().uuid(), q: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const q = data.q.trim();
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

    const [boardsR, itemsR, commentsR] = await Promise.all([
      context.supabase
        .from("boards")
        .select("id, name")
        .eq("workspace_id", data.workspaceId)
        .ilike("name", like)
        .limit(10),
      context.supabase
        .from("items")
        .select("id, title, board_id, boards!inner(id, name, workspace_id)")
        .eq("boards.workspace_id", data.workspaceId)
        .ilike("title", like)
        .limit(20),
      context.supabase
        .from("comments")
        .select("id, body, item_id, items!inner(id, title, board_id, boards!inner(workspace_id))")
        .eq("items.boards.workspace_id", data.workspaceId)
        .ilike("body", like)
        .limit(10),
    ]);

    if (boardsR.error) throw new Error(boardsR.error.message);
    if (itemsR.error) throw new Error(itemsR.error.message);
    if (commentsR.error) throw new Error(commentsR.error.message);

    return {
      boards: (boardsR.data ?? []).map((b: any) => ({ id: b.id, name: b.name })),
      items: (itemsR.data ?? []).map((i: any) => ({
        id: i.id,
        title: i.title,
        boardId: i.board_id,
        boardName: i.boards?.name ?? "",
      })),
      comments: (commentsR.data ?? []).map((c: any) => ({
        id: c.id,
        preview: (c.body ?? "").slice(0, 140),
        itemId: c.item_id,
        itemTitle: c.items?.title ?? "",
        boardId: c.items?.board_id,
      })),
    };
  });