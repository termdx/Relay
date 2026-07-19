import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Decorative spinner — pair with a visible label or a role="status" wrapper. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={cn("animate-spin", className)} />;
}
