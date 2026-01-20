import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAuthorizeNetCheckoutConfig } from "@/lib/authorizeNetCheckout";
import { resolveNmiCheckoutConfig } from "@/lib/nmiCheckout";
import { resolveStripeCheckoutConfig } from "@/lib/stripeCheckout";
import { fetchTierForCheckout } from "@/lib/tierCatalog";
import { getMemberGuildIdFromCookies } from "@/lib/guildSelection";
import { AuthorizeNetCard } from "./AuthorizeNetCard";

type SearchParams = Record<string, string | string[] | undefined>;

const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export default async function PaymentPage({ searchParams }: { searchParams: SearchParams }) {
  const tierParam = getParam(searchParams.tier);
  const cookieStore = cookies();
  const selectedGuildId = getMemberGuildIdFromCookies(cookieStore);
  const guildId = getParam(searchParams.guildId) ?? getParam(searchParams.guild) ?? selectedGuildId;
  const stripeError = getParam(searchParams.stripeError);

  let tierError: string | null = null;
  let tier: Awaited<ReturnType<typeof fetchTierForCheckout>> = null;

  if (!guildId) {
    redirect("/subscribe/select");
  }
  if (!tierParam) {
    redirect("/subscribe");
  }

  try {
    tier = await fetchTierForCheckout(guildId, tierParam);
    if (!tier) {
      tierError = "Selected tier was not found.";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tier.";
    tierError = message;
  }

  const stripeConfigResult = tier
    ? resolveStripeCheckoutConfig(tier)
    : { ok: false as const, error: "Stripe checkout is unavailable." };
  const stripeMode = stripeConfigResult.ok ? stripeConfigResult.config.mode : null;
  const stripeDescription = stripeConfigResult.ok
    ? stripeMode === "payment"
      ? "One-time"
      : "Subscription"
    : "Not configured";
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
      ? `Subscription (${authorizeNetConfig.intervalLabel})`
      : "One-time"
    : "Not configured";

  const nmiConfigResult = tier
    ? resolveNmiCheckoutConfig(tier)
    : { ok: false as const, error: "NMI checkout is unavailable." };
  const nmiConfig = nmiConfigResult.ok ? nmiConfigResult.config : null;
  const nmiDescription = nmiConfig
    ? nmiConfig.mode === "subscription"
      ? "Subscription"
      : "One-time"
    : "Not configured";
  const nmiLabel = nmiConfig
    ? nmiConfig.mode === "subscription"
      ? "Subscribe with NMI"
      : "Pay with NMI"
    : "NMI not configured";

  const backUrl = `/subscribe/connect?tier=${tierParam ?? ""}`;

  const showStripe = Boolean(tier && stripeConfigResult.ok);
  const showAuthorizeNet = Boolean(
    tier && authorizeNetConfig && authorizeNetApiLoginId && authorizeNetClientKey,
  );
  const showNmi = Boolean(tier && nmiConfig && nmiConfig.hostedUrl);
  const paymentMethodsAvailable = showStripe || showAuthorizeNet || showNmi;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="subtle">Step 3 of 4</p>
          <h1 className="text-3xl">Payment</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a payment method.</p>
        </div>
        <Link className="button secondary" href={backUrl}>
          Back to connect
        </Link>
      </div>

      {stripeError && <div className="banner error mt-4">{stripeError}</div>}
      {tierError && <div className="banner mt-4">{tierError}</div>}

      <div className="tier-summary mt-6">
        <div className="tier-header">
          <h3>{tier?.name ?? "Selected tier"}</h3>
          <span className="tier-price">{tier?.displayPrice ?? ""}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {tier?.description ?? "Complete payment to unlock access."}
        </p>
      </div>

      {!paymentMethodsAvailable && !tierError && (
        <div className="banner mt-6">No payment methods are configured yet.</div>
      )}

      {paymentMethodsAvailable && (
        <div className="payment-grid mt-6">
          {showStripe && (
            <div className="payment-card space-y-3">
              <h3>Stripe checkout</h3>
              <p className="text-sm text-muted-foreground">Card checkout. {stripeDescription}.</p>
              <form action="/api/subscribe/stripe" method="POST">
                <input type="hidden" name="tier" value={tierParam ?? ""} />
                <input type="hidden" name="guildId" value={guildId ?? ""} />
                <button className="button" type="submit">
                  {stripeLabel}
                </button>
              </form>
            </div>
          )}
          {showAuthorizeNet && (
            <div className="payment-card space-y-3">
              <h3>Authorize.Net checkout</h3>
              <p className="text-sm text-muted-foreground">{authorizeNetDescription}.</p>
              <AuthorizeNetCard
                tierSlug={tierParam ?? ""}
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
          )}
          {showNmi && (
            <div className="payment-card space-y-3">
              <h3>NMI hosted checkout</h3>
              <p className="text-sm text-muted-foreground">{nmiDescription}.</p>
              <a className="button" href={nmiConfig?.hostedUrl} target="_blank" rel="noreferrer">
                {nmiLabel}
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
