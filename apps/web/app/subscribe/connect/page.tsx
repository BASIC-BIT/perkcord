import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchPublicTierBySlug } from "@/lib/tierCatalog";
import type { PublicTier } from "@/lib/tierCatalog";
import { getMemberGuildIdFromCookies } from "@/lib/guildSelection";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export default async function ConnectDiscordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const cookieStore = cookies();
  const tierParam = getParam(searchParams.tier);
  const selectedGuildId = getMemberGuildIdFromCookies(cookieStore);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild) ?? selectedGuildId;

  let tier: PublicTier | null = null;
  let tierError: string | null = null;

  if (!guildId) {
    redirect("/subscribe/select");
  }
  if (!tierParam) {
    redirect("/subscribe");
  }

  try {
    tier = await fetchPublicTierBySlug(guildId, tierParam);
    if (!tier) {
      tierError = "Selected tier was not found.";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tier.";
    tierError = message;
  }

  const oauthUrl = `/api/subscribe/discord?tier=${tierParam}`;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="subtle">Step 2 of 4</p>
          <h1 className="text-3xl">Connect Discord</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect Discord to attach this purchase. We request the role_connections.write scope.
          </p>
        </div>
        <Link className="button secondary" href="/subscribe">
          Change tier
        </Link>
      </div>

      {tierError && <div className="banner mt-4">{tierError}</div>}
      <div className="tier-summary mt-6">
        <div className="tier-header">
          <h3>{tier?.name ?? "Selected tier"}</h3>
          <span className="tier-price">{tier?.displayPrice ?? ""}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {tier?.description ?? "Connect Discord to continue."}
        </p>
      </div>

      <div className="tier-actions mt-5">
        {oauthUrl ? (
          <Link className="button" href={oauthUrl}>
            Connect Discord
          </Link>
        ) : (
          <span className="button disabled">Connect Discord</span>
        )}
      </div>
    </section>
  );
}

