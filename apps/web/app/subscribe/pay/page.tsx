import Link from "next/link";
import { resolveAuthorizeNetCheckoutConfig } from "@/lib/authorizeNetCheckout";
import { resolveNmiCheckoutConfig } from "@/lib/nmiCheckout";
import { resolveStripeCheckoutConfig } from "@/lib/stripeCheckout";
import { AuthorizeNetCard } from "./AuthorizeNetCard";
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
  const authorizeNetConfigResult = resolveAuthorizeNetCheckoutConfig(tier.id);
  const authorizeNetConfig = authorizeNetConfigResult.ok
    ? authorizeNetConfigResult.config
    : null;
  const authorizeNetApiLoginId =
    process.env.NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID?.trim() ?? null;
  const authorizeNetClientKey =
    process.env.NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY?.trim() ?? null;
  const authorizeNetError = authorizeNetConfigResult.ok
    ? null
    : authorizeNetConfigResult.error;
  const authorizeNetDescription = authorizeNetConfig
    ? authorizeNetConfig.mode === "subscription"
      ? `Subscription billed every ${authorizeNetConfig.intervalLabel}.`
      : "One-time checkout."
    : "Authorize.Net checkout is not configured yet.";
  const nmiConfigResult = resolveNmiCheckoutConfig(tier.id);
  const nmiConfig = nmiConfigResult.ok ? nmiConfigResult.config : null;
  const nmiReady = Boolean(nmiConfig && guildId);
  const nmiError = nmiConfigResult.ok ? null : nmiConfigResult.error;
  const nmiDescription = nmiConfig
    ? nmiConfig.mode === "subscription"
      ? "Subscription checkout via NMI hosted payment."
      : "One-time checkout via NMI hosted payment."
    : "NMI checkout is not configured yet.";
  const nmiLabel = nmiConfig
    ? nmiConfig.mode === "subscription"
      ? "Subscribe with NMI"
      : "Pay with NMI"
    : "NMI not configured";
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
        Choose a payment method. Stripe checkout will redirect when configured.
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
          <p>{authorizeNetDescription}</p>
          <AuthorizeNetCard
            tierId={tier.id}
            guildId={guildId ?? null}
            amount={authorizeNetConfig?.amount ?? null}
            mode={authorizeNetConfig?.mode ?? null}
            intervalLabel={
              authorizeNetConfig?.mode === "subscription"
                ? authorizeNetConfig.intervalLabel
                : null
            }
            apiLoginId={authorizeNetApiLoginId}
            clientKey={authorizeNetClientKey}
            configError={authorizeNetError}
          />
        </div>
        <div className="payment-card">
          <h3>NMI hosted checkout</h3>
          <p>{nmiDescription}</p>
          {nmiError && <p className="subtle">{nmiError}</p>}
          <a
            className={`button${nmiReady ? "" : " disabled"}`}
            href={nmiReady ? nmiConfig?.hostedUrl : undefined}
            target={nmiReady ? "_blank" : undefined}
            rel={nmiReady ? "noreferrer" : undefined}
            aria-disabled={!nmiReady}
          >
            {nmiLabel}
          </a>
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
