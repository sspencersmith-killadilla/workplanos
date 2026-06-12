import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";

const AVATAR_BUCKET = "avatars";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getProfile = useServerFn(getMyProfile);
  const updateProfile = useServerFn(updateMyProfile);

  const profileQ = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => getProfile(),
  });

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profileQ.data) {
      setFullName(profileQ.data.full_name ?? "");
      setAvatarUrl(profileQ.data.avatar_url ?? null);
    }
  }, [profileQ.data]);

  const save = useMutation({
    mutationFn: () =>
      updateProfile({ data: { full_name: fullName.trim(), avatar_url: avatarUrl ?? undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Profile updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  async function handleAvatar(file: File) {
    setUploading(true);
    try {
      if (!profileQ.data?.id) throw new Error("Profile not loaded yet");
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${profileQ.data.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (!signed) throw new Error("Could not sign URL");
      setAvatarUrl(signed.signedUrl);
      await updateProfile({ data: { avatar_url: signed.signedUrl } });
      await qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Avatar updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function changePassword() {
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast.error("Your session expired. Please sign in again.");
      navigate({ to: "/auth", replace: true });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast.error(error.message);
    setPassword("");
    toast.success("Password changed");
  }

  async function signOutEverywhere() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut({ scope: "global" });
    navigate({ to: "/auth", replace: true });
  }

  if (profileQ.isLoading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="text-sm text-muted-foreground">Manage your profile and password.</p>
        </header>

        <section className="rounded-lg border border-border/60 p-5 space-y-4">
          <h2 className="text-sm font-medium">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted grid place-items-center overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-medium">
                  {(fullName || profileQ.data?.email || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Upload avatar
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleAvatar(e.target.files[0])}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={profileQ.data?.email ?? ""} disabled />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save changes
          </Button>
        </section>

        <section className="rounded-lg border border-border/60 p-5 space-y-4">
          <h2 className="text-sm font-medium">Change password</h2>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <Button onClick={changePassword}>Update password</Button>
        </section>

        <section className="rounded-lg border border-border/60 p-5 space-y-3">
          <h2 className="text-sm font-medium">Sessions</h2>
          <p className="text-xs text-muted-foreground">
            Sign out of all devices where you're currently logged in.
          </p>
          <Button variant="outline" onClick={signOutEverywhere}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign out everywhere
          </Button>
        </section>
      </div>
    </div>
  );
}