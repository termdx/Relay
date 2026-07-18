import { useMutation } from "@tanstack/react-query";
import { BellRing, Save, Upload, User, X } from "lucide-react";
import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import { useAuth } from "@/lib/auth";
import {
  nativeNotificationsEnabled,
  nativeNotify,
  setNativeNotificationsEnabled,
} from "@/lib/notify";
import { toast } from "@/lib/toast";

const MAX_AVATAR_BYTES = 1_000_000;

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile and how Relay talks to you." />
      <div className="flex max-w-xl flex-col gap-8 px-8 py-6">
        <ProfileSection />
        <NotificationsSection />
      </div>
    </>
  );
}

function ProfileSection() {
  const { user, updateUser } = useAuth();
  const [name, setName] = React.useState(user?.name ?? "");
  const [avatar, setAvatar] = React.useState<string | null>(user?.avatar ?? null);

  const save = useMutation({
    mutationFn: () =>
      backend.auth.updateMe({ name: name.trim(), avatar: avatar ?? "" }),
    onSuccess: (me) => {
      updateUser(me);
      toast.success("Profile saved");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save profile"),
  });

  function onAvatarFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image too large — keep it under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <User className="size-4" />
        Profile
      </h2>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex items-center gap-4">
          {avatar ? (
            <div className="relative">
              <img
                src={avatar}
                alt="Profile picture"
                className="size-16 rounded-full border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => setAvatar(null)}
                aria-label="Remove picture"
                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <div className="grid size-16 place-items-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
              {(user?.name ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/40">
            <Upload className="size-4" />
            Upload picture
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onAvatarFile(e.target.files?.[0])}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={user?.email ?? ""} disabled />
          </div>
        </div>

        <div>
          <Button type="submit" disabled={save.isPending || !name.trim()}>
            {save.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
            Save profile
          </Button>
        </div>
      </form>
    </section>
  );
}

function NotificationsSection() {
  const [native, setNative] = React.useState(nativeNotificationsEnabled());
  const inTauri = "__TAURI_INTERNALS__" in window;

  function toggle(next: boolean) {
    setNative(next);
    setNativeNotificationsEnabled(next);
    if (next) {
      // Fires the permission prompt on first enable and proves it works.
      void nativeNotify("Relay", "Native notifications are on.");
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <BellRing className="size-4" />
        Notifications
      </h2>
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Native notifications</span>
          <span className="block text-xs text-muted-foreground">
            Mirror toasts to macOS notifications when Relay is in the
            background — agent results reach you in your editor.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={native}
          disabled={!inTauri}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
        />
      </label>
      {!inTauri && (
        <p className="mt-2 text-xs text-muted-foreground">
          Available in the desktop app (you're in the browser).
        </p>
      )}
    </section>
  );
}
