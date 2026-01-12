import { NextResponse } from "next/server";
import Stripe from "stripe";
import { resolveStripeCheckoutConfig } from "@/lib/stripeCheckout";

export const runtime = "nodejs";

const readFormValue = (form: FormData, key: string) => {
  const value = form.get(key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const clampMessage = (value: string, max = 140) => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
};

const buildPayRedirect = (
  request: Request,
  params: {
    tierId?: string | null;
    guildId?: string | null;
    mode?: string | null;
    error?: string | null;
  }
) => {
  const url = new URL("/subscribe/pay", request.url);
  if (params.tierId) {
    url.searchParams.set("tier", params.tierId);
  }
  if (params.guildId) {
    url.searchParams.set("guildId", params.guildId);
  }
  if (params.mode) {
    url.searchParams.set("mode", params.mode);
  }
  if (params.error) {
    url.searchParams.set("stripeError", params.error);
  }
  return NextResponse.redirect(url);
};

export async function POST(request: Request) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecret) {
    return buildPayRedirect(request, {
      error: "Stripe checkout is not configured yet.",
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return buildPayRedirect(request, {
      error: "Invalid checkout request.",
    });
  }

  const tierId = readFormValue(form, "tier");
  const guildId = readFormValue(form, "guildId");
  const mode = readFormValue(form, "mode");

  if (!tierId || !guildId) {
    return buildPayRedirect(request, {
      tierId,
      guildId,
      error: "Missing tier or guild context for checkout.",
    });
  }

  const configResult = resolveStripeCheckoutConfig(tierId, mode);
  if (!configResult.ok) {
    return buildPayRedirect(request, {
      tierId,
      guildId,
      mode,
      error: configResult.error,
    });
  }

  const baseUrl = new URL(request.url).origin;
  const successUrl = new URL("/subscribe/celebrate", baseUrl);
  successUrl.searchParams.set("tier", tierId);
  successUrl.searchParams.set("guildId", guildId);
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

  const cancelUrl = new URL("/subscribe/pay", baseUrl);
  cancelUrl.searchParams.set("tier", tierId);
  cancelUrl.searchParams.set("guildId", guildId);
  if (mode) {
    cancelUrl.searchParams.set("mode", mode);
  }

  try {
    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.create({
      mode: configResult.config.mode,
      line_items: [
        {
          price: configResult.config.priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      client_reference_id: `${guildId}:${tierId}`,
      metadata: {
        guildId,
        tierId,
      },
    });

    if (!session.url) {
      return buildPayRedirect(request, {
        tierId,
        guildId,
        mode,
        error: "Stripe checkout session is missing a redirect URL.",
      });
    }

    return NextResponse.redirect(session.url, 303);
  } catch {
    return buildPayRedirect(request, {
      tierId,
      guildId,
      mode,
      error: clampMessage("Stripe checkout failed. Please try again."),
    });
  }
}
