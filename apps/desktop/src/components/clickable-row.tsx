import * as React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * A table row that navigates — focusable, keyboard-activatable, and with a
 * visible focus style, so list tables work for keyboard and screen-reader
 * users (plain onClick rows don't).
 */
export function ClickableRow({
  to,
  label,
  children,
  className,
}: {
  to: string;
  /** Accessible name for the row, e.g. the entity's name. */
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <tr
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={() => navigate(to)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(to);
        }
      }}
      className={cn(
        "cursor-pointer border-b border-border last:border-0 transition-colors",
        "hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {children}
    </tr>
  );
}
