import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Building2, Globe, Users, Inbox, FileText, Plus, Trash2, Check, X, Mail, Copy } from "lucide-react";
import {
  getOrganization,
  listOrgMembers,
  updateOrgMemberRole,
  removeOrgMember,
  listOrgDomains,
  addOrgDomain,
  removeOrgDomain,
  listDepartmentRequests,
  decideDepartmentRequest,
  listAuditLog,
  listOrgInvites,
  createOrgInvite,
  revokeOrgInvite,
} from "@/lib/organizations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/org/$orgSlug")({
  component: OrgConsole,
});

function OrgConsole() {
  const { orgSlug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getOrgFn = useServerFn(getOrganization);

  const { data: org, isLoading } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: () => getOrgFn({ data: { slug: orgSlug } }),
  });

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  }
  if (!org) return null;

  const canAdmin = org.role === "owner" || org.role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button
            onClick={() => navigate({ to: "/app" })}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md grid place-items-center text-white" style={{ background: org.color }}>
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold">{org.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{org.slug}</div>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members"><Users className="h-3.5 w-3.5 mr-1.5" /> Members</TabsTrigger>
            <TabsTrigger value="domains"><Globe className="h-3.5 w-3.5 mr-1.5" /> Domains</TabsTrigger>
            <TabsTrigger value="requests"><Inbox className="h-3.5 w-3.5 mr-1.5" /> Requests</TabsTrigger>
            {canAdmin && <TabsTrigger value="audit"><FileText className="h-3.5 w-3.5 mr-1.5" /> Audit log</TabsTrigger>}
          </TabsList>

          <TabsContent value="members" className="mt-6">
            <MembersTab organizationId={org.id} canAdmin={canAdmin} qc={qc} />
            {canAdmin && (
              <div className="mt-8">
                <InvitesSection organizationId={org.id} qc={qc} />
              </div>
            )}
          </TabsContent>
          <TabsContent value="domains" className="mt-6">
            <DomainsTab organizationId={org.id} canAdmin={canAdmin} qc={qc} />
          </TabsContent>
          <TabsContent value="requests" className="mt-6">
            <RequestsTab organizationId={org.id} canAdmin={canAdmin} qc={qc} />
          </TabsContent>
          {canAdmin && (
            <TabsContent value="audit" className="mt-6">
              <AuditTab organizationId={org.id} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function MembersTab({ organizationId, canAdmin, qc }: { organizationId: string; canAdmin: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const listFn = useServerFn(listOrgMembers);
  const roleFn = useServerFn(updateOrgMemberRole);
  const removeFn = useServerFn(removeOrgMember);
  const { data: members } = useQuery({
    queryKey: ["org-members", organizationId],
    queryFn: () => listFn({ data: { organizationId } }),
  });
  const update = useMutation({
    mutationFn: (v: { userId: string; role: any }) =>
      roleFn({ data: { organizationId, userId: v.userId, role: v.role } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members", organizationId] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { organizationId, userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members", organizationId] });
      toast.success("Member removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {(members ?? []).map((m: any) => (
        <div key={m.user_id} className="flex items-center justify-between p-4">
          <div>
            <div className="font-medium">{m.full_name ?? m.email ?? m.user_id}</div>
            <div className="text-xs text-muted-foreground">{m.email}</div>
          </div>
          <div className="flex items-center gap-2">
            {canAdmin ? (
              <Select value={m.role} onValueChange={(v) => update.mutate({ userId: m.user_id, role: v })}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary">{m.role}</Badge>
            )}
            {canAdmin && (
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(m.user_id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {!members?.length && <div className="p-6 text-sm text-muted-foreground">No members yet.</div>}
    </div>
  );
}

function DomainsTab({ organizationId, canAdmin, qc }: { organizationId: string; canAdmin: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const listFn = useServerFn(listOrgDomains);
  const addFn = useServerFn(addOrgDomain);
  const rmFn = useServerFn(removeOrgDomain);
  const [domain, setDomain] = useState("");
  const { data: domains } = useQuery({
    queryKey: ["org-domains", organizationId],
    queryFn: () => listFn({ data: { organizationId } }),
  });
  const add = useMutation({
    mutationFn: (d: string) => addFn({ data: { organizationId, domain: d } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-domains", organizationId] });
      setDomain("");
      toast.success("Domain added. New signups will auto-join.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const rm = useMutation({
    mutationFn: (id: string) => rmFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-domains", organizationId] }),
  });

  return (
    <div className="space-y-4">
      {canAdmin && (
        <div className="flex gap-2">
          <Input
            placeholder="springfieldcity.gov"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && domain.trim() && add.mutate(domain.trim())}
          />
          <Button onClick={() => add.mutate(domain.trim())} disabled={!domain.trim() || add.isPending}>
            <Plus className="h-4 w-4 mr-2" /> Add domain
          </Button>
        </div>
      )}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {(domains ?? []).map((d: any) => (
          <div key={d.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-mono text-sm">{d.domain}</div>
              <div className="text-xs text-muted-foreground">
                {d.verified_at ? "Verified — auto-join enabled" : "Pending verification"}
              </div>
            </div>
            {canAdmin && (
              <Button variant="ghost" size="icon" onClick={() => rm.mutate(d.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {!domains?.length && <div className="p-6 text-sm text-muted-foreground">No domains claimed yet.</div>}
      </div>
    </div>
  );
}

function RequestsTab({ organizationId, canAdmin, qc }: { organizationId: string; canAdmin: boolean; qc: ReturnType<typeof useQueryClient> }) {
  const listFn = useServerFn(listDepartmentRequests);
  const decideFn = useServerFn(decideDepartmentRequest);
  const { data: requests } = useQuery({
    queryKey: ["dept-requests", organizationId],
    queryFn: () => listFn({ data: { organizationId } }),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decideFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dept-requests", organizationId] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Decision saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {(requests ?? []).map((r: any) => (
        <div key={r.id} className="flex items-start justify-between p-4 gap-4">
          <div className="min-w-0">
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Requested by {r.requester?.full_name ?? r.requester?.email ?? "—"}
            </div>
            {r.reason && <div className="mt-2 text-sm text-muted-foreground">{r.reason}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.status === "pending" ? (
              canAdmin ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: r.id, approve: false })}>
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => decide.mutate({ id: r.id, approve: true })}>
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </>
              ) : (
                <Badge variant="secondary">Pending</Badge>
              )
            ) : (
              <Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge>
            )}
          </div>
        </div>
      ))}
      {!requests?.length && <div className="p-6 text-sm text-muted-foreground">No requests.</div>}
    </div>
  );
}

function AuditTab({ organizationId }: { organizationId: string }) {
  const listFn = useServerFn(listAuditLog);
  const { data: entries } = useQuery({
    queryKey: ["audit", organizationId],
    queryFn: () => listFn({ data: { organizationId } }),
  });
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {(entries ?? []).map((e: any) => (
        <div key={e.id} className="flex items-center justify-between p-3 text-sm">
          <div className="font-mono text-xs text-muted-foreground">
            {new Date(e.created_at).toLocaleString()}
          </div>
          <div className="flex-1 px-4">
            <span className="font-medium">{e.actor?.full_name ?? e.actor?.email ?? "system"}</span>{" "}
            <span className="text-muted-foreground">{e.action}</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono">{e.target_type ?? ""}</div>
        </div>
      ))}
      {!entries?.length && <div className="p-6 text-sm text-muted-foreground">No audit entries yet.</div>}
    </div>
  );
}