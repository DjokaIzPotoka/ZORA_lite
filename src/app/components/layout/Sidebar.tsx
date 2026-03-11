"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  TrendingUp,
  CalendarDays,
  BarChart3,
  FileDown,
  Activity,
  Layers,
  Settings,
  ChevronLeft,
  LineChart,
} from "lucide-react";

const NAV_ITEMS: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/trades", label: "Trades", icon: TrendingUp },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analysis", label: "Analytics", icon: BarChart3 },
  { href: "/gex", label: "GEX", icon: LineChart },
  { href: "/strategies", label: "Strategies", icon: Layers },
  { href: "/simulations", label: "Simulations", icon: Activity },
  { href: "/reports", label: "Exports", icon: FileDown },
  { href: "/settings", label: "Settings", icon: Settings },
];

type SidebarProps = {
  collapsed: boolean;
  onCollapseToggle: () => void;
};

export function Sidebar({ collapsed, onCollapseToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/10 transition-[width] duration-200 ease-in-out"
      style={{
        width: collapsed ? 88 : 280,
        background: "linear-gradient(180deg, #0B1220 0%, #0B0F1A 100%)",
      }}
    >
      {/* Header / Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-white/10 px-4">
        {collapsed ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-lg font-bold text-emerald-400">
            G
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-lg font-bold text-emerald-400">
              G
            </span>
            <span className="font-semibold text-white">Gainlytics</span>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border border-white/[0.08] bg-white/[0.06] text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white/90"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Collapse */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onCollapseToggle}
          title={collapsed ? "Expand sidebar" : "Collapse"}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white/90 ${
            collapsed ? "justify-center px-2" : ""
          }`}
        >
          <ChevronLeft
            className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
              collapsed ? "rotate-180" : ""
            }`}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
