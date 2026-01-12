import Link from "next/link";
import { TIERS } from "./tiers";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;

export default function SubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const highlight = getParam(searchParams.highlight);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild);
  return (
    <main className="card">
      <p className="subtle">Step 1 of 4</p>
      <h1>Pick your tier</h1>
      <p>
        Choose the access level you want. You will connect Discord before
        checkout.
      </p>
      <div className="tier-grid">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`tier-card${highlight === tier.id ? " highlighted" : ""}`}
          >
            <div className="tier-header">
              <h3>{tier.name}</h3>
              <span className="tier-price">{tier.price}</span>
            </div>
            <p>{tier.description}</p>
            <ul>
              {tier.perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
            <div className="tier-actions">
              <Link
                className="button"
                href={`/subscribe/connect?tier=${tier.id}${
                  guildId ? `&guildId=${guildId}` : ""
                }`}
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
