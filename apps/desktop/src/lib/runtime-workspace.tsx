import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { daemonHealth, type DaemonHealth } from "@/lib/api/runtime";

interface RuntimeWorkspaceValue {
  /** null → daemon unreachable. */
  daemon: DaemonHealth | null;
  isLoading: boolean;
  /** Selected workspace root (defaults to the daemon's, overridable by the switcher). */
  root: string | null;
  setRoot: (root: string) => void;
}

const Ctx = React.createContext<RuntimeWorkspaceValue | null>(null);

export function RuntimeWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const health = useQuery({
    queryKey: ["daemon-health"],
    queryFn: daemonHealth,
    refetchInterval: 5000,
  });

  const [selected, setSelected] = React.useState<string | null>(null);

  // Seed the selection from the daemon's default workspace once it's known.
  React.useEffect(() => {
    if (!selected && health.data?.workspace) setSelected(health.data.workspace);
  }, [selected, health.data?.workspace]);

  return (
    <Ctx.Provider
      value={{
        daemon: health.data ?? null,
        isLoading: health.isLoading,
        root: selected,
        setRoot: setSelected,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRuntimeWorkspace(): RuntimeWorkspaceValue {
  const ctx = React.useContext(Ctx);
  if (!ctx)
    throw new Error("useRuntimeWorkspace must be used within its provider");
  return ctx;
}
