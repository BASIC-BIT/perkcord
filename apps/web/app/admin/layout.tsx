import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";
import { ModeToggle } from "@/components/mode-toggle";
import { AdminNav } from "@/components/admin/admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const authEnabled = Boolean(secret);
  const session = secret ? getSessionFromCookies(cookies(), secret) : null;

  return (
    <div className="page-frame">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-lg font-semibold text-primary">
            P
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Perkcord Admin</p>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Ops console
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ModeToggle />
          {session ? (
            <Link className="button secondary" href="/api/auth/logout">
              Sign out
            </Link>
          ) : (
            <Link className="button secondary" href="/">
              Back to home
            </Link>
          )}
        </div>
      </header>

      {!authEnabled && (
        <div className="banner mt-6">PERKCORD_SESSION_SECRET is not configured. Admin auth is disabled.</div>
      )}

      {!session ? (
        <section className="card mt-8 p-6">
          <h1 className="text-3xl">Admin Portal</h1>
          {authEnabled ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">Sign in to continue.</p>
              <div className="mt-6">
                <Link className="button" href="/api/auth/discord">
                  Sign in with Discord
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Set PERKCORD_SESSION_SECRET to enable admin login.
            </p>
          )}
        </section>
      ) : (
        <div className="panel-grid mt-8">
          <aside className="card space-y-6 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Signed in as
              </p>
              <p className="text-base font-semibold text-foreground">{session.username}</p>
              <p className="text-xs text-muted-foreground">Discord ID: {session.userId}</p>
              <p className="text-xs text-muted-foreground">
                Signed in: {new Date(session.issuedAt).toLocaleString()}
              </p>
            </div>
            <AdminNav />
            <div className="rounded-xl border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
              Use Overview to swap guilds or refresh data.
            </div>
          </aside>
          <section className="space-y-6">{children}</section>
        </div>
      )}
    </div>
  );
}

