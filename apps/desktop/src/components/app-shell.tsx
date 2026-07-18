import { LayoutGrid, LogOut, Palette, Server, Users } from "lucide-react";
import * as React from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
}

const NAV: NavItem[] = [
  { to: "/clients", label: "Clients", icon: Users, section: "Delivery" },
  { to: "/meetings", label: "Meetings", icon: LayoutGrid, section: "Delivery" },
  { to: "/branding", label: "Branding", icon: Palette, section: "Workspace" },
  { to: "/runtime", label: "Runtime", icon: Server, section: "Workspace" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const sections = [...new Set(NAV.map((n) => n.section))];

  return (
    <div className="grid h-screen grid-cols-[15rem_1fr] bg-background text-foreground">
      <aside className="flex flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img src="/relay-logo.png" alt="" className="size-8" />
          <span className="font-semibold">Relay</span>
        </div>

        <nav className="flex-1 space-y-6 px-3 py-2">
          {sections.map((section) => (
            <div key={section}>
              <div className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section}
              </div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.section === section).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )
                    }
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {user?.email}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="overflow-y-auto">{children}</main>
    </div>
  );
}
