import { ChevronsUpDown, LayoutGrid, LogOut, Palette, Server, Settings, Users } from "lucide-react";
import * as React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { to: "/settings", label: "Settings", icon: Settings, section: "Workspace" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sections = [...new Set(NAV.map((n) => n.section))];

  return (
    <div className="grid h-screen grid-cols-[15rem_1fr] bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <aside className="flex flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <img src="/relay-logo.png" alt="" className="size-8" />
          <span className="font-semibold">Relay</span>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-6 px-2 py-2">
          {sections.map((section) => (
            <div key={section}>
              <h2 className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section}
              </h2>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.section === section).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

        <div className="border-t border-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar>
                    {user?.avatar && (
                      <AvatarImage src={user.avatar} alt={user.name ?? ""} />
                    )}
                    <AvatarFallback>
                      {(user?.name ?? "?").slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {user?.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel>
                Signed in as
                <span className="block truncate font-normal">
                  {user?.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/settings")}>
                <Settings />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main id="main-content" className="min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
