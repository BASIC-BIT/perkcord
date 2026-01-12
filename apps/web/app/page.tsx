import Link from "next/link";

export default function HomePage() {
  return (
    <main className="card">
      <h1>Perkcord Ops Console</h1>
      <p>
        This is a starter shell for the admin portal. Use Discord OAuth to
        authenticate and validate guild access in the next iteration.
      </p>
      <div className="meta">
        <span>Phase: Admin skeleton</span>
        <span>Stack: Next.js + TypeScript</span>
      </div>
      <p style={{ marginTop: 24 }} className="tier-actions">
        <Link className="button" href="/admin">
          Go to admin
        </Link>
        <Link className="button secondary" href="/subscribe">
          Preview member flow
        </Link>
      </p>
    </main>
  );
}
