import Link from "next/link";
import { getTier } from "../tiers";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;

export default function PaymentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const tierParam = getParam(searchParams.tier);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild);
  const tier = getTier(tierParam);
  const celebrateUrl = `/subscribe/celebrate?tier=${tier.id}${
    guildId ? `&guildId=${guildId}` : ""
  }`;
  const backUrl = `/subscribe/connect?tier=${tier.id}${
    guildId ? `&guildId=${guildId}` : ""
  }`;
  return (
    <main className="card">
      <p className="subtle">Step 3 of 4</p>
      <h1>Payment</h1>
      <p>
        Choose a payment method. This is a placeholder for Stripe and
        Authorize.Net checkout.
      </p>
      <div className="tier-summary">
        <div className="tier-header">
          <h3>{tier.name}</h3>
          <span className="tier-price">{tier.price}</span>
        </div>
        <p>{tier.description}</p>
      </div>
      <div className="payment-grid">
        <div className="payment-card">
          <h3>Stripe checkout</h3>
          <p>Card, Apple Pay, Google Pay.</p>
          <Link className="button" href={celebrateUrl}>
            Pay with Stripe (stub)
          </Link>
        </div>
        <div className="payment-card">
          <h3>Authorize.Net checkout</h3>
          <p>Tokenized card capture via Accept.js.</p>
          <Link className="button" href={celebrateUrl}>
            Pay with Authorize.Net (stub)
          </Link>
        </div>
      </div>
      <p style={{ marginTop: 24 }}>
        <Link className="button secondary" href={backUrl}>
          Back to connect
        </Link>
      </p>
    </main>
  );
}
