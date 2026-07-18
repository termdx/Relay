import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Save, Upload, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { backend } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/http";

const MAX_LOGO_BYTES = 1_000_000;
const DEFAULT_ACCENT = "#7c5cff";

/** What the client portal wears: agency name, logo, accent color. */
export function BrandingPage() {
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: ["branding"], queryFn: backend.branding.get });

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
      <div className="max-w-xl px-8 py-6">
        {current.isLoading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Spinner className="size-5" />
          </div>
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
                />
                <span
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: accent }}
                >
                  Buttons look like this
                </span>
              </div>
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
                      className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="grid size-12 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
                    <Palette className="size-5" />
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/40">
                  <Upload className="size-4" />
                  Upload image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => onLogoFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                SVG, PNG, JPEG, or WebP, under 1 MB. Stored inline — no external hosting.
              </p>
            </div>

            <div>
              <Button type="submit" disabled={save.isPending}>
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
