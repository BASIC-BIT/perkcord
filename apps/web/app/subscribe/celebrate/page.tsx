import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchPublicTierBySlug } from "@/lib/tierCatalog";
import type { PublicTier } from "@/lib/tierCatalog";
import { getMemberGuildIdFromCookies } from "@/lib/guildSelection";
import { ConfettiBurst } from "@/components/confetti-burst";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export default async function CelebratePage({ searchParams }: { searchParams: SearchParams }) {
  const tierParam = getParam(searchParams.tier);
  const cookieStore = cookies();
  const selectedGuildId = getMemberGuildIdFromCookies(cookieStore);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild) ?? selectedGuildId;
  if (!guildId) {
    redirect("/subscribe/select");
  }
  const deepLink = `https://discord.com/channels/${guildId}`;

  let tier: PublicTier | null = null;
  let tierError: string | null = null;

  if (tierParam) {
    try {
      tier = await fetchPublicTierBySlug(guildId, tierParam);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load tier.";
      tierError = message;
    }
  }

  return (
    <section className="card p-6">
      <ConfettiBurst />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="subtle">Step 4 of 4</p>
          <h1 className="text-3xl">You are in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Access is on the way. Head back to Discord to get started.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Return home
        </Link>
      </div>

      {tierError && <div className="banner mt-4">{tierError}</div>}
      <div className="tier-summary mt-6">
        <div className="tier-header">
          <h3>{tier?.name ?? "Selected tier"}</h3>
          <span className="tier-price">{tier?.displayPrice ?? ""}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Access activated.</p>
      </div>

      <div className="tier-actions mt-5">
        <a className="button" href={deepLink}>
          Open Discord server
        </a>
      </div>
    </section>
  );
}

