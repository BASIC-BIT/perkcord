import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";
import { TierEditor } from "@/components/admin/tier-editor";
import { fetchConvexJson, getParam, type SearchParams, type TierListResponse } from "../admin-helpers";

export default async function AdminTiersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const session = secret ? getSessionFromCookies(cookies(), secret) : null;
  const tierAction = getParam(searchParams?.tierAction);
  const tierStatus = getParam(searchParams?.tierStatus);
  const tierOutcomeId = getParam(searchParams?.tierId);
  const tierMessage = getParam(searchParams?.tierMessage);
  const guildId = getParam(searchParams?.guildId);
  const convexUrl = process.env.PERKCORD_CONVEX_HTTP_URL?.trim();
  const convexApiKey = process.env.PERKCORD_REST_API_KEY?.trim();

  let tierListError: string | null = null;
  let tierList: TierListResponse["tiers"] | null = null;

  if (session && convexUrl && convexApiKey && guildId) {
    const tiersResult = await fetchConvexJson<TierListResponse>(
      convexUrl,
      convexApiKey,
      "/api/tiers",
      { guildId },
    );
    if (tiersResult.error) {
      tierListError = tiersResult.error;
    } else {
      tierList = tiersResult.data?.tiers ?? [];
    }
  } else if (session && guildId && (!convexUrl || !convexApiKey)) {
    tierListError =
      "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
  }

  const tierActionLabel =
    tierAction === "update" ? "update" : tierAction === "create" ? "create" : "action";
  const tierBanner =
    tierStatus === "success"
      ? tierAction === "update"
        ? `Tier updated${tierOutcomeId ? ` (${tierOutcomeId})` : ""}.`
        : `Tier created${tierOutcomeId ? ` (${tierOutcomeId})` : ""}.`
      : tierStatus === "error"
        ? `Tier ${tierActionLabel} failed${tierMessage ? `: ${tierMessage}` : "."}`
        : null;

  return (
    <div className="space-y-6">
      <section className="panel">
        <p className="subtle">Tier management</p>
        <h1 className="text-3xl">Tiers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create or update tiers, mapping roles and checkout settings. Use comma-separated IDs for
          provider lists and one-per-line perks.
        </p>
        {tierBanner && (
          <div className={`banner mt-4 ${tierStatus === "error" ? "error" : "success"}`}>
            {tierBanner}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="text-2xl">Tier editor</h2>
        <p className="text-sm text-muted-foreground">
          Create or edit tiers for this guild.
        </p>
        {tierListError && <div className="banner error mt-4">{tierListError}</div>}
        <TierEditor guildId={guildId} tiers={tierList} />
      </section>
    </div>
  );
}

