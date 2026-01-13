import Link from "next/link";
import { fetchPublicTierBySlug } from "@/lib/tierCatalog";
import type { PublicTier } from "@/lib/tierCatalog";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export default async function ConnectDiscordPage({ searchParams }: { searchParams: SearchParams }) {
  const tierParam = getParam(searchParams.tier);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild);

  let tier: PublicTier | null = null;
  let tierError: string | null = null;

  if (!guildId) {
    tierError = "Missing guildId. Add ?guildId=<serverId> to the URL to continue.";
  } else if (!tierParam) {
    tierError = "Missing tier selection.";
  } else {
    try {
      tier = await fetchPublicTierBySlug(guildId, tierParam);
      if (!tier) {
        tierError = "Selected tier was not found.";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load tier.";
      tierError = message;
    }
  }

  const oauthUrl =
    guildId && tierParam ? `/api/subscribe/discord?guildId=${guildId}&tier=${tierParam}` : null;

  return (
    <main className="card">
      <p className="subtle">Step 2 of 4</p>
      <h1>Connect Discord</h1>
      <p>
        We link your Discord account to your purchase so the bot can grant access. Member OAuth will
        request the role_connections.write scope.
      </p>
      {tierError && <div className="banner">{tierError}</div>}
      <div className="tier-summary">
        <div className="tier-header">
          <h3>{tier?.name ?? "Selected tier"}</h3>
          <span className="tier-price">{tier?.displayPrice ?? ""}</span>
        </div>
        <p>{tier?.description ?? "Connect Discord to continue."}</p>
      </div>
      <div className="tier-actions">
        {oauthUrl ? (
          <Link className="button" href={oauthUrl}>
            Connect Discord
          </Link>
        ) : (
          <span className="button disabled">Connect Discord</span>
        )}
        <Link
          className="button secondary"
          href={`/subscribe${guildId ? `?guildId=${guildId}` : ""}`}
        >
          Change tier
        </Link>
      </div>
      <p style={{ marginTop: 24 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
