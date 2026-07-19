import * as React from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumb";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  tabs,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Detail pages pass their trail here instead of a back button. */
  breadcrumb?: Crumb[];
  /** Optional tab bar rendered flush against the header's bottom border. */
  tabs?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-8 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {breadcrumb && <Breadcrumbs items={breadcrumb} className="mb-1.5" />}
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {tabs ? <div className="mt-4">{tabs}</div> : <div className="h-5" />}
    </div>
  );
}
