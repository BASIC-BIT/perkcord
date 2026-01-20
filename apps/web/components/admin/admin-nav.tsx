"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/tiers", label: "Tiers" },
  { href: "/admin/ops", label: "Ops" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={`nav-link${isActive ? " active" : ""}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
