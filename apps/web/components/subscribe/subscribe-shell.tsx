"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModeToggle } from "@/components/mode-toggle";

const steps = [
  { title: "Pick tier", path: "/subscribe" },
  { title: "Connect", path: "/subscribe/connect" },
  { title: "Payment", path: "/subscribe/pay" },
  { title: "Celebrate", path: "/subscribe/celebrate" },
];

const resolveStepIndex = (pathname: string) => {
  if (pathname.includes("/celebrate")) {
    return 3;
  }
  if (pathname.includes("/pay")) {
    return 2;
  }
  if (pathname.includes("/connect")) {
    return 1;
  }
  return 0;
};

export function SubscribeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeIndex = resolveStepIndex(pathname);

  return (
    <main className="page-frame">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link className="flex items-center gap-3" href="/">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-lg font-semibold text-primary">
            P
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Perkcord</p>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Member access
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <ModeToggle />
          <Link className="button secondary" href="/admin">
            Admin console
          </Link>
        </div>
      </header>

      <section className="mt-10 space-y-6">
        <div className="card border border-primary/20 bg-gradient-to-br from-card via-card to-secondary/70 p-5">
          <p className="subtle">Member flow</p>
          <h1 className="text-3xl">Unlock access in four steps.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entitlements drive access. Roles sync after payment clears.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className={`rounded-xl border px-3 py-3 text-sm transition ${
                  index === activeIndex
                    ? "border-primary bg-primary/10 text-foreground"
                    : index < activeIndex
                      ? "border-border bg-secondary/60 text-foreground"
                      : "border-border bg-card text-muted-foreground"
                }`}
              >
                <div className="text-xs uppercase tracking-[0.2em]">Step {index + 1}</div>
                <div className="mt-1 font-semibold">{step.title}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">{children}</div>
          <aside className="space-y-4">
            <div className="card p-5">
              <h2 className="text-lg">Need help?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                If access is late, ask an admin to force sync.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

