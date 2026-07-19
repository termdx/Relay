import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        primary:
          "border-transparent bg-primary/15 text-primary [.dark_&]:bg-primary/20",
        success:
          "border-transparent bg-success/15 text-success [.dark_&]:bg-success/20",
        warning:
          "border-transparent bg-warning/15 text-warning [.dark_&]:bg-warning/20",
        destructive:
          "border-transparent bg-destructive/15 text-destructive [.dark_&]:bg-destructive/20",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
