import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Save, Upload, X } from "lucide-react";
import * as React from "react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";

const MAX_LOGO_BYTES = 1_000_000;
const DEFAULT_ACCENT = "#7c5cff";

/** Pick black or white text for a #rrggbb background (relative luminance). */
function readableTextColor(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const [r, g, b] = channels.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? "#1a1a1a" : "#ffffff";
}

/** What the client portal wears: agency name, logo, accent color. */
export function BrandingPage() {
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: ["branding"], queryFn: backend.branding.get });
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState("");
  const [accent, setAccent] = React.useState(DEFAULT_ACCENT);
  const [logo, setLogo] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (current.data && !loaded) {
      setName(current.data.agencyName ?? "");
      setAccent(current.data.accentColor ?? DEFAULT_ACCENT);
      setLogo(current.data.logo);
      setLoaded(true);
    }
  }, [current.data, loaded]);

  const dirty =
    loaded &&
    current.data !== undefined &&
    (name.trim() !== (current.data.agencyName ?? "") ||
      accent !== (current.data.accentColor ?? DEFAULT_ACCENT) ||
      (logo ?? "") !== (current.data.logo ?? ""));

  const save = useMutation({
    mutationFn: () =>
      backend.branding.update({
        agencyName: name.trim(),
        accentColor: accent,
        logo: logo ?? "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branding"] });
      toast.success("Branding saved — the portal picks it up on next load");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save branding"),
  });

  function onLogoFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo too large — keep it under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <>
      <PageHeader
        title="Branding"
        description="What your clients see on the portal. Relay stays out of the way."
      />
      <div className="max-w-2xl px-8 py-6">
        {current.isLoading ? (
          <div className="flex flex-col gap-6" aria-hidden="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : current.isError ? (
          <ErrorState
            title="Couldn't load branding"
            description="Is the backend running?"
            onRetry={() => current.refetch()}
          />
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agency-name">Agency name</Label>
              <Input
                id="agency-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="TermDX Studio"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Shown in the portal header, login page, and browser tab.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accent">Accent color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="accent"
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
                />
                <Input
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                  className="max-w-28 font-mono text-xs"
                  aria-label="Accent color as hex (#rrggbb)"
                />
                <span
                  className="rounded-md px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: accent,
                    color: readableTextColor(accent),
                  }}
                >
                  Buttons look like this
                </span>
              </div>
              <p className="text-xs text-muted-foreground">As hex: #rrggbb.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {logo ? (
                  <div className="relative">
                    <img
                      src={logo}
                      alt="Agency logo"
                      className="size-12 rounded-md border border-border object-contain p-1"
                    />
                    <button
                      type="button"
                      onClick={() => setLogo(null)}
                      aria-label="Remove logo"
                      className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="grid size-12 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
                    <Palette className="size-5" />
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" />
                  Upload image
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    onLogoFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                SVG, PNG, JPEG, or WebP, under 1 MB. Stored inline — no external hosting.
              </p>
            </div>

            <div>
              <Button type="submit" disabled={save.isPending || !dirty}>
                {save.isPending ? <Spinner className="size-4" /> : <Save className="size-4" />}
                Save branding
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
