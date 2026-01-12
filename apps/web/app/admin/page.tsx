import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";

export default function AdminPage() {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const authEnabled = Boolean(secret);
  const cookieStore = cookies();
  const session = secret
    ? getSessionFromCookies(cookieStore, secret)
    : null;

  return (
    <main className="card">
      <h1>Admin Portal</h1>
      {!secret && (
        <div className="banner">
          PERKCORD_SESSION_SECRET is not configured. Admin auth is disabled.
        </div>
      )}
      {session ? (
        <>
          <p>Signed in as {session.username}.</p>
          <div className="meta">
            <span>Discord ID: {session.userId}</span>
            <span>Signed in: {new Date(session.issuedAt).toLocaleString()}</span>
          </div>
          <p style={{ marginTop: 24 }}>
            <Link className="button secondary" href="/api/auth/logout">
              Sign out
            </Link>
          </p>
        </>
      ) : (
        <>
          {authEnabled ? (
            <>
              <p>Connect Discord to continue.</p>
              <p style={{ marginTop: 24 }}>
                <Link className="button" href="/api/auth/discord">
                  Sign in with Discord
                </Link>
              </p>
            </>
          ) : (
            <p>Set PERKCORD_SESSION_SECRET to enable admin login.</p>
          )}
        </>
      )}
      <p style={{ marginTop: 32 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
