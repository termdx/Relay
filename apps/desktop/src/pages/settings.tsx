import { useMutation } from "@tanstack/react-query";
import { BellRing, MonitorCog, Save, Upload, User, X } from "lucide-react";
import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { ServerSettingsCard } from "@/components/server-settings";
import { TeamSettingsCard } from "@/components/team-settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";
import { useAuth } from "@/lib/auth";
import {
  nativeNotificationsEnabled,
  requestNotifyPermission,
  setNativeNotificationsEnabled,
} from "@/lib/notify";
import { useTheme, type Theme } from "@/lib/theme";
import { toast } from "@/lib/toast";

const MAX_AVATAR_BYTES = 1_000_000;

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile and how Relay talks to you." />
      <div className="flex max-w-2xl flex-col gap-6 px-8 py-6">
        <ProfileSection />
        <TeamSettingsCard />
        <AppearanceSection />
        <NotificationsSection />
        <ServerSettingsCard />
      </div>
    </>
  );
}

function ProfileSection() {
  const { user, updateUser } = useAuth();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState(user?.name ?? "");
  const [avatar, setAvatar] = React.useState<string | null>(user?.avatar ?? null);

  // If auth resolves after mount, pull the real values in once.
  React.useEffect(() => {
    if (user) {
      setName((n) => n || user.name);
      setAvatar((a) => a ?? user.avatar);
    }
  }, [user]);

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
          <div className="relative">
            <Avatar className="size-16">
              {avatar && <AvatarImage src={avatar} alt="Profile picture" />}
              <AvatarFallback className="text-lg">
                {(user?.name ?? "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                aria-label="Remove picture"
                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" />
            Upload picture
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              onAvatarFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
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

/** Dark-first, but switchable — follows the OS when set to System. */
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <MonitorCog className="size-4" />
        Appearance
      </h2>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="theme" className="text-sm font-medium">
            Theme
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Light by default — switch to Dark or follow your OS.
          </p>
        </div>
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger id="theme" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

/** Mirror in-app toasts to native OS notifications when Relay is unfocused. */
function NotificationsSection() {
  const [native, setNative] = React.useState(nativeNotificationsEnabled());
  const inTauri = "__TAURI_INTERNALS__" in window;

  async function toggle(next: boolean) {
    if (next) {
      // Fires the OS permission prompt on first enable; if macOS says no,
      // the switch would lie — so revert and explain.
      const granted = await requestNotifyPermission();
      if (!granted) {
        setNative(false);
        setNativeNotificationsEnabled(false);
        toast.warning(
          "macOS blocked notifications — enable them in System Settings → Notifications → Relay.",
        );
        return;
      }
    }
    setNative(next);
    setNativeNotificationsEnabled(next);
    if (next) toast.success("Native notifications are on");
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <BellRing className="size-4" />
        Notifications
      </h2>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="native-notifications" className="text-sm font-medium">
            Native notifications
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mirror toasts to macOS notifications when Relay is in the
            background — agent results reach you in your editor.
          </p>
        </div>
        <Switch
          id="native-notifications"
          checked={native}
          disabled={!inTauri}
          onCheckedChange={(checked) => void toggle(checked)}
        />
      </div>
      {!inTauri && (
        <p className="mt-2 text-xs text-muted-foreground">
          Available in the desktop app (you're in the browser).
        </p>
      )}
    </section>
  );
}
