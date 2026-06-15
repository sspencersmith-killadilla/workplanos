import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getOrgInvitePreview, acceptOrgInvite, getOrganization } from "@/lib/organizations.functions";

export const Route = createFileRoute("/org-invite/$token")({
  ssr: false,
  component: OrgInvitePage,
});

function OrgInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const previewFn = useServerFn(getOrgInvitePreview);
  const acceptFn = useServerFn(acceptOrgInvite);
  const getOrgFn = useServerFn(getOrganization);

  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
  }, []);

  const previewQ = useQuery({
    queryKey: ["org-invite-preview", token],
    queryFn: () => previewFn({ data: { token } }),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { token } }),
    onSuccess: async ({ organizationId }) => {
      toast.success("You're in!");
      try {
        // Look up org slug to navigate to console
        const { data } = await supabase
          .from("organizations")
          .select("slug")
          .eq("id", organizationId)
          .maybeSingle();
        if (data?.slug) {
          navigate({ to: "/org/$orgSlug", params: { orgSlug: data.slug } });
          return;
        }
      } catch {}
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not accept invite"),
  });

  if (checking || previewQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const invite = previewQ.data;

  if (!invite) {
    return (
      <Card title="Invite not found" body="The link may have been revoked or mistyped." action={<Link to="/"><Button variant="ghost">Go home</Button></Link>} />
    );
  }
  if (invite.accepted) {
    return <Card title="Already accepted" body="This invite has already been used." action={<Link to="/app"><Button>Open app</Button></Link>} />;
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return <Card title="Invite expired" body="Ask your org admin to send a new invite." action={<Link to="/"><Button variant="ghost">Go home</Button></Link>} />;
  }

  if (!session) {
    return (
      <Card
        title={`Join ${invite.organizationName}`}
        body={`You've been invited as ${invite.role}. Sign in or create an account with ${invite.email} to accept.`}
        action={
          <Link to="/auth" search={{ redirect: `/org-invite/${token}` } as any}>
            <Button><Mail className="h-3.5 w-3.5 mr-1.5" /> Sign in to accept</Button>
          </Link>
        }
      />
    );
  }

  const userEmail = (session.user?.email ?? "").toLowerCase();
  if (userEmail !== invite.email.toLowerCase()) {
    return (
      <Card
        title="Different account"
        body={`You're signed in as ${userEmail}, but this invite is for ${invite.email}.`}
        action={
          <Button variant="ghost" onClick={async () => { await supabase.auth.signOut(); location.reload(); }}>
            Sign out
          </Button>
        }
      />
    );
  }

  return (
    <Card
      title={`Join ${invite.organizationName}`}
      body={`You'll be added as ${invite.role}.`}
      action={
        <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
          {accept.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Accept invite
        </Button>
      }
    />
  );
}

function Card({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="max-w-md w-full rounded-lg border border-border/60 p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div className="pt-2">{action}</div>
      </div>
    </div>
  );
}