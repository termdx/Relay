/**
 * App-wide toasts, all in one visual language: the same card the agent
 * status uses — Relay tokens (card, border, shadow), a kind icon, a dismiss
 * X — rendered via sonner's custom slot at top-center. Success/error/
 * warning/info also mirror to a native OS notification when the window
 * isn't focused.
 */
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { toast as sonner, type ExternalToast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { appUnfocused, nativeNotify } from "./notify";

type Kind = "success" | "error" | "warning" | "info" | "loading" | "plain";

const ICONS: Record<Kind, React.ReactNode> = {
  success: <CheckCircle2 className="size-4.5 shrink-0 text-success" />,
  error: <XCircle className="size-4.5 shrink-0 text-destructive" />,
  warning: <AlertTriangle className="size-4.5 shrink-0 text-warning" />,
  info: <Info className="size-4.5 shrink-0 text-primary" />,
  loading: <Spinner className="size-4.5 shrink-0 text-muted-foreground" />,
  plain: <Info className="size-4.5 shrink-0 text-muted-foreground" />,
};

/** Exactly the AgentDoneToast shell — same width, padding, and structure —
 * so every toast in the app is visually one component. */
function ToastCard({
  kind,
  message,
  description,
  onDismiss,
}: {
  kind: Kind;
  message: React.ReactNode;
  description?: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div className="w-[420px] max-w-[90vw] rounded-lg border border-border bg-card p-3.5 shadow-lg">
      <div className="flex items-center gap-2.5">
        {ICONS[kind]}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{message}</div>
          {description ? (
            <div className="text-xs text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {kind !== "loading" && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

type Message = React.ReactNode;

function show(kind: Kind, message: Message, opts?: ExternalToast): string | number {
  if (
    typeof message === "string" &&
    kind !== "loading" &&
    kind !== "plain" &&
    appUnfocused()
  ) {
    void nativeNotify("Relay", message);
  }
  return sonner.custom(
    (t) => (
      <ToastCard
        kind={kind}
        message={message}
        description={opts?.description as React.ReactNode}
        onDismiss={() => sonner.dismiss(t)}
      />
    ),
    {
      // Loading toasts persist until replaced/dismissed by their owner.
      duration: kind === "loading" ? Infinity : 4000,
      ...opts,
    },
  );
}

export const toast = Object.assign(
  (message: Message, opts?: ExternalToast) => show("plain", message, opts),
  {
    success: (m: Message, o?: ExternalToast) => show("success", m, o),
    error: (m: Message, o?: ExternalToast) => show("error", m, o),
    warning: (m: Message, o?: ExternalToast) => show("warning", m, o),
    info: (m: Message, o?: ExternalToast) => show("info", m, o),
    loading: (m: Message, o?: ExternalToast) => show("loading", m, o),
    custom: sonner.custom.bind(sonner),
    dismiss: sonner.dismiss.bind(sonner),
  },
);
