import Link from "next/link";
import { getTier } from "../tiers";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;

export default function CelebratePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const tierParam = getParam(searchParams.tier);
  const guildId = getParam(searchParams.guildId);
  const tier = getTier(tierParam);
  const deepLink = `https://discord.com/channels/${guildId ?? "YOUR_GUILD_ID"}`;

  return (
    <main className="card">
      <p className="subtle">Step 4 of 4</p>
      <h1>You are all set</h1>
      <p>
        Your entitlement is active. The bot will sync roles shortly. If you do
        not see access within a minute, contact an admin for a force sync.
      </p>
      {!guildId && (
        <div className="banner">
          Add ?guildId=&lt;serverId&gt; to generate a real deep link.
        </div>
      )}
      <div className="tier-summary">
        <div className="tier-header">
          <h3>{tier.name}</h3>
          <span className="tier-price">{tier.price}</span>
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
