import { useQuery } from "@tanstack/react-query";
import { Blocks, Boxes, Cpu, Plug } from "lucide-react";
import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { fetchWorkspace, runtime, runtimeReachable } from "@/lib/api/runtime";

export function RuntimePage() {
  const reachable = useQuery({
    queryKey: ["runtime-reachable"],
    queryFn: runtimeReachable,
  });

  // Which workspace does the daemon manage? Resolved once, then passed to
  // every call — so nothing depends on a relative path.
  const workspace = useQuery({
    queryKey: ["runtime-workspace"],
    queryFn: fetchWorkspace,
    enabled: reachable.data === true,
    retry: false,
  });
  const root = workspace.data?.root;

  const health = useQuery({
    queryKey: ["runtime-health", root],
    queryFn: () => runtime.health(root!),
    enabled: Boolean(root),
  });
  const providers = useQuery({
    queryKey: ["runtime-ai", root],
    queryFn: () => runtime.ai.list(root!),
    enabled: Boolean(root),
  });
  const modules = useQuery({
    queryKey: ["runtime-modules", root],
    queryFn: () => runtime.modules.list(root!),
    enabled: Boolean(root),
  });
  const integrations = useQuery({
    queryKey: ["runtime-integrations", root],
    queryFn: () => runtime.integrations.list(root!),
    enabled: Boolean(root),
  });

  const overall = health.data?.overall;

  return (
    <>
      <PageHeader
        title="Runtime"
        description={
          workspace.data
            ? `${workspace.data.organization} · ${workspace.data.root}`
            : "What this workspace has installed — providers, modules, integrations, services."
        }
        actions={
          overall && (
            <Badge
              variant={
                overall === "ok"
                  ? "success"
                  : overall === "degraded"
                    ? "warning"
                    : "destructive"
              }
            >
              {overall}
            </Badge>
          )
        }
      />

      <div className="px-8 py-6">
        {reachable.isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Spinner className="size-5" />
          </div>
        ) : !reachable.data ? (
          <Notice title="Runtime daemon isn’t running">
            Start it with{" "}
            <Code>pnpm --filter @relay/cli relay daemon start</Code> — run it
            from inside your workspace directory.
          </Notice>
        ) : workspace.isLoading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Spinner className="size-5" />
          </div>
        ) : workspace.isError ? (
          <Notice title="Daemon is running, but not in a Relay workspace">
            It serves the workspace it was started in. Restart it from your
            workspace directory, or create one with <Code>relay init</Code>.
          </Notice>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Panel icon={Cpu} title="AI providers" query={providers}>
              {providers.data?.map((p) => (
                <Row key={p.id} name={p.id} meta={p.provider}>
                  {p.defaultModel && (
                    <span className="text-xs text-muted-foreground">
                      {p.defaultModel}
                    </span>
                  )}
                  {p.hasApiKey && <Badge variant="outline">key</Badge>}
                </Row>
              ))}
            </Panel>

            <Panel icon={Blocks} title="Modules" query={modules}>
              {modules.data?.map((m) => (
                <Row key={m.id} name={m.id} meta={`v${m.version}`}>
                  {m.dependencies.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      needs {m.dependencies.join(", ")}
                    </span>
                  )}
                </Row>
              ))}
            </Panel>

            <Panel icon={Plug} title="Integrations" query={integrations}>
              {integrations.data?.map((i) => (
                <Row key={i.id} name={i.id} meta={i.displayName ?? ""} />
              ))}
            </Panel>

            <Panel icon={Boxes} title="Services" query={health}>
              {health.data?.services.length ? (
                health.data.services.map((s) => (
                  <Row key={s.service} name={s.service} meta={s.state}>
                    {s.health && (
                      <Badge
                        variant={s.health === "healthy" ? "success" : "warning"}
                      >
                        {s.health}
                      </Badge>
                    )}
                  </Row>
                ))
              ) : (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  Nothing running. Start with{" "}
                  <code className="font-mono text-xs">relay up</code>.
                </p>
              )}
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border py-16 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  query,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  query: { isLoading: boolean; isError: boolean };
  children: React.ReactNode;
}) {
  const empty = React.Children.count(children) === 0;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {query.isLoading ? (
          <div className="py-4 text-muted-foreground">
            <Spinner className="size-4" />
          </div>
        ) : query.isError ? (
          <p className="py-2 text-sm text-destructive">Failed to load.</p>
        ) : empty ? (
          <p className="py-2 text-sm text-muted-foreground">None installed.</p>
        ) : (
          <div className="divide-y divide-border">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  name,
  meta,
  children,
}: {
  name: string;
  meta: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm">{name}</span>
        <span className="text-xs text-muted-foreground">{meta}</span>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
