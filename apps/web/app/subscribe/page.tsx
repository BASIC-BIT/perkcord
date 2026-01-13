import Link from "next/link";
import { fetchPublicTiers } from "@/lib/tierCatalog";
import type { PublicTier } from "@/lib/tierCatalog";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export default async function SubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const highlight = getParam(searchParams.highlight);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild);
  let tiers: PublicTier[] = [];
  let tierError: string | null = null;

  if (!guildId) {
    tierError = "Missing guildId. Add ?guildId=<serverId> to the URL to continue.";
  } else {
    try {
      tiers = await fetchPublicTiers(guildId);
      if (tiers.length === 0) {
        tierError = "No tiers are configured for this server yet.";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load tiers.";
      tierError = message;
    }
  }
  return (
    <main className="card">
      <p className="subtle">Step 1 of 4</p>
      <h1>Pick your tier</h1>
      <p>Choose the access level you want. You will connect Discord before checkout.</p>
      {tierError && <div className="banner">{tierError}</div>}
      <div className="tier-grid">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className={`tier-card${highlight === tier.slug ? " highlighted" : ""}`}
          >
            <div className="tier-header">
              <h3>{tier.name}</h3>
              <span className="tier-price">{tier.displayPrice}</span>
            </div>
            <p>{tier.description ?? "Support the server and unlock perks."}</p>
            {tier.perks.length > 0 && (
              <ul>
                {tier.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
            )}
            <div className="tier-actions">
              <Link
                className="button"
                href={`/subscribe/connect?tier=${tier.slug}${guildId ? `&guildId=${guildId}` : ""}`}
              >
                Choose {tier.name}
              </Link>
            </div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
