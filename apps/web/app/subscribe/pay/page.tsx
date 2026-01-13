import Link from "next/link";
import { resolveAuthorizeNetCheckoutConfig } from "@/lib/authorizeNetCheckout";
import { resolveNmiCheckoutConfig } from "@/lib/nmiCheckout";
import { resolveStripeCheckoutConfig } from "@/lib/stripeCheckout";
import { fetchTierForCheckout } from "@/lib/tierCatalog";
import { AuthorizeNetCard } from "./AuthorizeNetCard";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export default async function PaymentPage({ searchParams }: { searchParams: SearchParams }) {
  const tierParam = getParam(searchParams.tier);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild);
  const stripeError = getParam(searchParams.stripeError);

  let tierError: string | null = null;
  let tier: Awaited<ReturnType<typeof fetchTierForCheckout>> = null;
  if (!guildId) {
    tierError = "Missing guildId. Add ?guildId=<serverId> to the URL to continue.";
  } else if (!tierParam) {
    tierError = "Missing tier selection.";
  } else {
    try {
      tier = await fetchTierForCheckout(guildId, tierParam);
      if (!tier) {
        tierError = "Selected tier was not found.";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load tier.";
      tierError = message;
    }
  }

  const stripeConfigResult = tier
    ? resolveStripeCheckoutConfig(tier)
    : { ok: false as const, error: "Stripe checkout is unavailable." };
  const stripeReady = Boolean(guildId && tier && stripeConfigResult.ok);
  const stripeMode = stripeConfigResult.ok ? stripeConfigResult.config.mode : null;
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

  const authorizeNetConfigResult = tier
    ? resolveAuthorizeNetCheckoutConfig(tier)
    : { ok: false as const, error: "Authorize.Net checkout is unavailable." };
  const authorizeNetConfig = authorizeNetConfigResult.ok ? authorizeNetConfigResult.config : null;
  const authorizeNetApiLoginId = process.env.NEXT_PUBLIC_AUTHORIZE_NET_API_LOGIN_ID?.trim() ?? null;
  const authorizeNetClientKey = process.env.NEXT_PUBLIC_AUTHORIZE_NET_CLIENT_KEY?.trim() ?? null;
  const authorizeNetError = authorizeNetConfigResult.ok ? null : authorizeNetConfigResult.error;
  const authorizeNetDescription = authorizeNetConfig
    ? authorizeNetConfig.mode === "subscription"
      ? `Subscription billed every ${authorizeNetConfig.intervalLabel}.`
      : "One-time checkout."
    : "Authorize.Net checkout is not configured yet.";

  const nmiConfigResult = tier
    ? resolveNmiCheckoutConfig(tier)
    : { ok: false as const, error: "NMI checkout is unavailable." };
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

  const backUrl = `/subscribe/connect?tier=${tierParam ?? ""}${
    guildId ? `&guildId=${guildId}` : ""
  }`;

  return (
    <main className="card">
      <p className="subtle">Step 3 of 4</p>
      <h1>Payment</h1>
      {stripeError && <div className="banner error">{stripeError}</div>}
      {tierError && <div className="banner">{tierError}</div>}
      <p>Choose a payment method. Stripe checkout will redirect when configured.</p>
      <div className="tier-summary">
        <div className="tier-header">
          <h3>{tier?.name ?? "Selected tier"}</h3>
          <span className="tier-price">{tier?.displayPrice ?? ""}</span>
        </div>
        <p>{tier?.description ?? "Complete payment to unlock access."}</p>
      </div>
      <div className="payment-grid">
        <div className="payment-card">
          <h3>Stripe checkout</h3>
          <p>Card, Apple Pay, Google Pay. {stripeDescription}</p>
          <form action="/api/subscribe/stripe" method="POST">
            <input type="hidden" name="tier" value={tierParam ?? ""} />
            <input type="hidden" name="guildId" value={guildId ?? ""} />
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
            tierSlug={tierParam ?? ""}
            guildId={guildId ?? null}
            amount={authorizeNetConfig?.amount ?? null}
            mode={authorizeNetConfig?.mode ?? null}
            intervalLabel={
              authorizeNetConfig?.mode === "subscription" ? authorizeNetConfig.intervalLabel : null
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
