import Link from "next/link";
import { resolveStripeCheckoutConfig } from "@/lib/stripeCheckout";
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
  const stripeError = getParam(searchParams.stripeError);
  const modeOverride = getParam(searchParams.mode);
  const tier = getTier(tierParam);
  const stripeConfigResult = resolveStripeCheckoutConfig(tier.id, modeOverride);
  const stripeReady = Boolean(guildId && stripeConfigResult.ok);
  const stripeMode = stripeConfigResult.ok
    ? stripeConfigResult.config.mode
    : null;
  const stripeDescription = stripeConfigResult.ok
    ? stripeMode === "payment"
      ? "One-time checkout."
      : "Subscription checkout."
    : "Stripe checkout is not configured yet.";
  const stripeLabel = stripeConfigResult.ok
    ? stripeMode === "payment"
      ? "Pay once with Stripe"
      : "Pay with Stripe"
    : "Stripe not configured";
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
      {stripeError && <div className="banner error">{stripeError}</div>}
      {!guildId && (
        <div className="banner">
          Missing guildId. Add ?guildId=&lt;serverId&gt; to the URL to continue.
        </div>
      )}
      <p>
        Choose a payment method. Stripe checkout will redirect when configured;
        Authorize.Net remains a placeholder.
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
          <p>Card, Apple Pay, Google Pay. {stripeDescription}</p>
          <form action="/api/subscribe/stripe" method="POST">
            <input type="hidden" name="tier" value={tier.id} />
            <input type="hidden" name="guildId" value={guildId ?? ""} />
            {stripeMode && <input type="hidden" name="mode" value={stripeMode} />}
            <button
              className={`button${stripeReady ? "" : " disabled"}`}
              disabled={!stripeReady}
              type="submit"
            >
              {stripeLabel}
            </button>
          </form>
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
