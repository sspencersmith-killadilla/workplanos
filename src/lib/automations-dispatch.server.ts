/**
 * Server-only helper to run board automations.
 * Called from server functions where we already have an authenticated
 * Supabase client (RLS as the acting user) plus the actor id.
 */
type SB = any;

export type DispatchTrigger =
  | { kind: "item_created" }
  | { kind: "item_updated" }
  | { kind: "column_changed"; columnId: string }
  | { kind: "comment_added" }
  | { kind: "activity_added" };

export async function dispatchAutomations(
  supabase: SB,
  opts: { boardId: string; itemId: string; actorId: string; trigger: DispatchTrigger },
) {
  try {
    const { data: rules } = await supabase
      .from("automation_rules")
      .select("id, trigger, actions")
      .eq("board_id", opts.boardId)
      .eq("enabled", true);
    for (const rule of rules ?? []) {
      const t = (rule as any).trigger;
      if (!t || typeof t.kind !== "string") continue;
      const match =
        (t.kind === opts.trigger.kind && t.kind !== "column_changed") ||
        (t.kind === "column_changed" &&
          opts.trigger.kind === "column_changed" &&
          t.columnId === opts.trigger.columnId);
      if (!match) continue;
      await runActions(supabase, rule, opts);
    }
  } catch {
    // never block caller on automation failures
  }
}

async function runActions(
  supabase: SB,
  rule: any,
  opts: { itemId: string; actorId: string },
) {
  for (const action of rule.actions ?? []) {
    try {
      if (action.kind === "set_status") {
        await supabase
          .from("item_values")
          .upsert(
            { item_id: opts.itemId, column_id: action.columnId, status_option_id: action.optionId },
            { onConflict: "item_id,column_id" },
          );
      } else if (action.kind === "notify") {
        await supabase.from("notifications").insert({
          user_id: opts.actorId,
          kind: "automation",
          payload: { message: action.message ?? "Automation fired", item_id: opts.itemId },
        });
      } else if (action.kind === "notify_people") {
        // Find people-column assignees on this item and notify each user
        const { data: vals } = await supabase
          .from("item_values")
          .select("people_user_ids")
          .eq("item_id", opts.itemId);
        const userIds = new Set<string>();
        for (const v of vals ?? []) {
          for (const uid of ((v as any).people_user_ids ?? []) as string[]) userIds.add(uid);
        }
        for (const uid of userIds) {
          if (uid === opts.actorId) continue;
          await supabase.from("notifications").insert({
            user_id: uid,
            kind: "automation",
            payload: { message: action.message ?? "You were notified by an automation", item_id: opts.itemId },
          });
        }
      }
    } catch {
      // continue with remaining actions
    }
  }
  try {
    await supabase.from("automation_runs").insert({
      rule_id: rule.id,
      item_id: opts.itemId,
      status: "ok",
    });
  } catch {}
}