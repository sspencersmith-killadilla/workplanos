import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Mail, Trash2, UserMinus, LogOut, Copy, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWorkspace } from "@/lib/workspaces.functions";
import {
  listMembers,
  listInvites,
  inviteMember,
  revokeInvite,
  updateMemberRole,
  removeMember,
  leaveWorkspace,
  setMemberLock,
} from "@/lib/members.functions";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/members")({
  component: MembersPage,
});

const ROLES = ["owner", "admin", "member", "viewer"] as const;

function MembersPage() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getWs = useServerFn(getWorkspace);
  const listMembersFn = useServerFn(listMembers);
  const listInvitesFn = useServerFn(listInvites);
  const inviteFn = useServerFn(inviteMember);
  const revokeFn = useServerFn(revokeInvite);
  const updateRoleFn = useServerFn(updateMemberRole);
  const removeFn = useServerFn(removeMember);
  const leaveFn = useServerFn(leaveWorkspace);
  const lockFn = useServerFn(setMemberLock);

  const wsQ = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => getWs({ data: { id: workspaceId } }),
  });
  const membersQ = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => listMembersFn({ data: { workspaceId } }),
  });
  const invitesQ = useQuery({
    queryKey: ["invites", workspaceId],
    queryFn: () => listInvitesFn({ data: { workspaceId } }),
    retry: false,
  });

  const isAdmin = !invitesQ.isError; // listInvites throws Forbidden for non-admin

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("member");

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { workspaceId, email, role } }),
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["invites", workspaceId] });
      toast.success("Invite created — copy the link to share");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeFn({ data: { workspaceId, inviteId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", workspaceId] }),
  });

  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: string }) =>
      updateRoleFn({ data: { workspaceId, userId: v.userId, role: v.role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", workspaceId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { workspaceId, userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", workspaceId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const lock = useMutation({
    mutationFn: (v: { userId: string; lock: boolean }) =>
      lockFn({ data: { workspaceId, userId: v.userId, lock: v.lock } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", workspaceId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const leave = useMutation({
    mutationFn: () => leaveFn({ data: { workspaceId } }),
    onSuccess: () => {
      qc.clear();
      navigate({ to: "/app", replace: true });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${origin}/invite/${token}`);
    toast.success("Invite link copied");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Members</h1>
            <p className="text-sm text-muted-foreground">
              Manage who can access {wsQ.data?.name ?? "this workspace"}.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => leave.mutate()}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Leave workspace
          </Button>
        </header>

        {isAdmin && (
          <section className="rounded-lg border border-border/60 p-4 space-y-3">
            <div className="text-sm font-medium">Invite by email</div>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r !== "owner").map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!email.includes("@") || invite.isPending}
                onClick={() => invite.mutate()}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" /> Invite
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Invites are link-based — share the copy link with your teammate. They expire after 14 days.
            </p>
          </section>
        )}

        {isAdmin && (invitesQ.data?.length ?? 0) > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Pending invites
            </h2>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {invitesQ.data!.map((i: any) => (
                <li key={i.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copyLink(i.token)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke.mutate(i.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Members ({membersQ.data?.length ?? 0})
          </h2>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {membersQ.data?.map((m: any) => (
              <li key={m.user_id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-muted grid place-items-center text-xs font-medium overflow-hidden">
                    {m.profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (m.profile?.full_name ?? m.profile?.email ?? "?").slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm truncate">
                      {m.profile?.full_name ?? m.profile?.email ?? m.user_id}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{m.profile?.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        changeRole.mutate({ userId: m.user_id, role: v })
                      }
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                  )}
                  {isAdmin && m.role !== "owner" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={m.is_locked ? "Unlock in this workspace" : "Lock in this workspace"}
                        onClick={() =>
                          lock.mutate({ userId: m.user_id, lock: !m.is_locked })
                        }
                      >
                        {m.is_locked ? (
                          <Unlock className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove.mutate(m.user_id)}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}