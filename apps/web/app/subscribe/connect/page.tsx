import Link from "next/link";
import { getTier } from "../tiers";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;

export default function ConnectDiscordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const tierParam = getParam(searchParams.tier);
  const tier = getTier(tierParam);
  const nextUrl = `/subscribe/pay?tier=${tier.id}`;

  return (
    <main className="card">
      <p className="subtle">Step 2 of 4</p>
      <h1>Connect Discord</h1>
      <p>
        We link your Discord account to your purchase so the bot can grant
        access. Member OAuth will request the role_connections.write scope.
      </p>
      <div className="tier-summary">
        <div className="tier-header">
          <h3>{tier.name}</h3>
          <span className="tier-price">{tier.price}</span>
        </div>
        <p>{tier.description}</p>
      </div>
      <div className="tier-actions">
        <Link className="button" href={nextUrl}>
          Connect Discord (stub)
        </Link>
        <Link className="button secondary" href="/subscribe">
          Change tier
        </Link>
      </div>
      <p style={{ marginTop: 24 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
