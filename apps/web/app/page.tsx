import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";

export default function HomePage() {
  return (
    <main className="page-frame">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-lg font-semibold text-primary">
            P
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Perkcord</p>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Access automation
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <a className="hover:text-foreground" href="#member-flow">
              Member flow
            </a>
            <a className="hover:text-foreground" href="#admin">
              Admin console
            </a>
          </nav>
          <ModeToggle />
          <Link className="button" href="/subscribe">
            Start member flow
          </Link>
        </div>
      </header>

      <section className="mt-12">
        <div className="max-w-3xl space-y-6">
          <p className="subtle">Ops-first access automation</p>
          <h1 className="text-3xl leading-tight sm:text-4xl">
            Automated paid access for Discord.
          </h1>
          <div className="flex flex-wrap gap-3">
            <Link className="button" href="/subscribe">
              Preview member flow
            </Link>
            <Link className="button secondary" href="/admin">
              Open admin console
            </Link>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Stripe + Authorize.Net</span>
            <span>Automatic role unlocks</span>
            <span>Admin console included</span>
          </div>
        </div>
      </section>

      <section id="member-flow" className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="subtle">Member flow</p>
            <h2 className="text-3xl">Member flow in four steps.</h2>
          </div>
          <Link className="button secondary" href="/subscribe">
            Walk through it
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: "01",
              title: "Pick a tier",
              body: "Pick",
            },
            {
              step: "02",
              title: "Connect Discord",
              body: "Connect",
            },
            {
              step: "03",
              title: "Pay with confidence",
              body: "Pay",
            },
            {
              step: "04",
              title: "Celebrate",
              body: "Done",
            },
          ].map((item) => (
            <div key={item.step} className="card p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                {item.step}
              </p>
              <h3 className="mt-3 text-xl">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="admin" className="mt-16">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <p className="subtle">Admin console</p>
            <h2 className="text-3xl">Ops for admins.</h2>
            <p className="text-muted-foreground">Review grants, tiers, and sync.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card p-4">
                <h3 className="text-lg">Diagnostics</h3>
                <p className="text-sm text-muted-foreground">Roles + providers.</p>
              </div>
              <div className="card p-4">
                <h3 className="text-lg">Manual actions</h3>
                <p className="text-sm text-muted-foreground">Force syncs + grants.</p>
              </div>
            </div>
          </div>
          <div className="card space-y-4 bg-gradient-to-br from-secondary/70 via-card to-card p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl">Ops pulse</h3>
              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                Last 24h
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Active members</span>
                <span className="font-semibold text-foreground">1,240</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Webhook failures</span>
                <span className="font-semibold text-foreground">0</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Role sync queue</span>
                <span className="font-semibold text-foreground">3 pending</span>
              </div>
            </div>
            <Link className="button secondary w-full" href="/admin">
              Jump to admin
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <div className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl">Ready?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Start the flow or open admin.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="button" href="/subscribe">
              Start member flow
            </Link>
            <Link className="button secondary" href="/admin">
              Open admin console
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}





