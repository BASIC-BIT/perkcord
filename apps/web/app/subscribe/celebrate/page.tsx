import Link from "next/link";
import { fetchPublicTierBySlug } from "@/lib/tierCatalog";
import type { PublicTier } from "@/lib/tierCatalog";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export default async function CelebratePage({ searchParams }: { searchParams: SearchParams }) {
  const tierParam = getParam(searchParams.tier);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild);
  const deepLink = `https://discord.com/channels/${guildId ?? "YOUR_GUILD_ID"}`;

  let tier: PublicTier | null = null;
  let tierError: string | null = null;
  if (!guildId) {
    tierError = "Missing guildId. Add ?guildId=<serverId> to generate a real deep link.";
  } else if (tierParam) {
    try {
      tier = await fetchPublicTierBySlug(guildId, tierParam);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load tier.";
      tierError = message;
    }
  }

  return (
    <main className="card">
      <p className="subtle">Step 4 of 4</p>
      <h1>You are all set</h1>
      <p>
        Your entitlement is active. The bot will sync roles shortly. If you do not see access within
        a minute, contact an admin for a force sync.
      </p>
      {tierError && <div className="banner">{tierError}</div>}
      <div className="tier-summary">
        <div className="tier-header">
          <h3>{tier?.name ?? "Selected tier"}</h3>
          <span className="tier-price">{tier?.displayPrice ?? ""}</span>
        </div>
        <p>Entitlement recorded and ready for role sync.</p>
      </div>
      <div className="tier-actions">
        <a className="button" href={deepLink}>
          Open Discord server
        </a>
        <Link className="button secondary" href="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
