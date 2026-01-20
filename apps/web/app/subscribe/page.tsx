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
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="subtle">Step 1 of 4</p>
          <h1 className="text-3xl">Pick your tier</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a tier, then connect Discord.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Back to home
        </Link>
      </div>
      {tierError && <div className="banner mt-4">{tierError}</div>}
      <div className="tier-grid mt-6">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className={`tier-card${highlight === tier.slug ? " highlighted" : ""}`}
          >
            <div className="tier-header">
              <h3>{tier.name}</h3>
              <span className="tier-price">{tier.displayPrice}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {tier.description ?? "Unlock perks."}
            </p>
            {tier.perks.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {tier.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
            )}
            <div className="tier-actions mt-4">
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
    </section>
  );
}

