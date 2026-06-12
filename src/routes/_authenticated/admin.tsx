import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock, Unlock, Shield, ShieldOff, Search, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  isSuperAdmin,
  listAllUsers,
  setUserLock,
  setSuperAdmin,
  getAppSettings,
  setAppSetting,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const checkFn = useServerFn(isSuperAdmin);
  const meQ = useQuery({ queryKey: ["isSuperAdmin"], queryFn: () => checkFn() });

  if (meQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!meQ.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold">Admin only</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This area is reserved for super-admins. Ask an existing super-admin to
            grant you access, or run the bootstrap SQL noted in the deploy guide.
          </p>
          <Link to="/app" className="inline-block mt-4 text-sm underline">
            Back to app
          </Link>
        </div>
      </div>
    );
  }
  return <AdminPanel />;
}

function AdminPanel() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-6 py-4 flex items-center gap-3">
        <Link to="/app" className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Site administration</h1>
          <p className="text-xs text-muted-foreground">
            Global controls for all users, workspaces, and platform settings.
          </p>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="settings">Platform settings</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-6">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllUsers);
  const lockFn = useServerFn(setUserLock);
  const roleFn = useServerFn(setSuperAdmin);
  const [q, setQ] = useState("");
  const usersQ = useQuery({
    queryKey: ["adminUsers", q],
    queryFn: () => listFn({ data: { q: q || undefined } }),
  });

  const [lockTarget, setLockTarget] = useState<any>(null);
  const [reason, setReason] = useState("");

  const lock = useMutation({
    mutationFn: (v: { userId: string; lock: boolean; reason?: string }) =>
      lockFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
      setLockTarget(null);
      setReason("");
      toast.success("Account updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const role = useMutation({
    mutationFn: (v: { userId: string; grant: boolean }) => roleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Search by email or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2 font-medium">User</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Roles</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {usersQ.data?.map((u: any) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  {u.is_locked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive">
                      <Lock className="h-3 w-3" /> Locked
                      {u.locked_reason && (
                        <span className="text-muted-foreground"> — {u.locked_reason}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.is_super_admin ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <Shield className="h-3 w-3" /> Super-admin
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  {u.is_locked ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => lock.mutate({ userId: u.id, lock: false })}
                    >
                      <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLockTarget(u)}
                    >
                      <Lock className="h-3.5 w-3.5 mr-1" /> Lock
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      role.mutate({ userId: u.id, grant: !u.is_super_admin })
                    }
                  >
                    {u.is_super_admin ? (
                      <>
                        <ShieldOff className="h-3.5 w-3.5 mr-1" /> Revoke admin
                      </>
                    ) : (
                      <>
                        <Shield className="h-3.5 w-3.5 mr-1" /> Make admin
                      </>
                    )}
                  </Button>
                </td>
              </tr>
            ))}
            {usersQ.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!lockTarget} onOpenChange={(o) => !o && setLockTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock {lockTarget?.email}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            They will be signed out immediately and cannot sign back in. Their items,
            comments and files will be hidden from other workspace members until you unlock.
          </p>
          <Textarea
            placeholder="Optional reason (shown in audit list)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLockTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                lock.mutate({ userId: lockTarget.id, lock: true, reason: reason || undefined })
              }
              disabled={lock.isPending}
            >
              Lock account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAppSettings);
  const setFn = useServerFn(setAppSetting);
  const settingsQ = useQuery({ queryKey: ["appSettings"], queryFn: () => getFn() });

  const [aiKey, setAiKey] = useState("");
  const [provider, setProvider] = useState("");
  const current = settingsQ.data?.ai ?? {};

  const save = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          key: "ai",
          value: {
            provider: provider || current.provider || "",
            api_key: aiKey || current.api_key || "",
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appSettings"] });
      setAiKey("");
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="rounded-lg border border-border/60 p-5 space-y-4">
        <div>
          <h3 className="font-semibold">AI integration</h3>
          <p className="text-sm text-muted-foreground">
            Configure a shared AI provider and API key. Features that use AI will
            consume this key when they ship. Leave blank to disable AI features.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">Provider</label>
          <Input
            placeholder="openai / anthropic / google / lovable"
            value={provider || current.provider || ""}
            onChange={(e) => setProvider(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium">API key</label>
          <Input
            type="password"
            placeholder={current.api_key ? "•••••••• (set — type to replace)" : "sk-…"}
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Stored server-side; never exposed to the browser. Only super-admins can read it.
          </p>
        </div>
        <div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </div>
      </section>
    </div>
  );
}