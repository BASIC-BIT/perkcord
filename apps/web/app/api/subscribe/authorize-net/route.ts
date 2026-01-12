import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getMemberSessionFromCookies } from "@/lib/memberSession";
import { resolveAuthorizeNetCheckoutConfig } from "@/lib/authorizeNetCheckout";

export const runtime = "nodejs";

type OpaqueDataPayload = {
  dataDescriptor?: string;
  dataValue?: string;
};

type CheckoutPayload = {
  tier?: string;
  guildId?: string;
  opaqueData?: OpaqueDataPayload;
};

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ ok: false, error: message }, { status });

const readString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getAuthorizeNetApiUrl = () => {
  const override = process.env.AUTHORIZE_NET_API_URL?.trim();
  if (override) {
    return override;
  }
  const env = process.env.AUTHORIZE_NET_ENV?.trim().toLowerCase();
  if (env === "production" || env === "prod") {
    return "https://api.authorize.net/xml/v1/request.api";
  }
  return "https://apitest.authorize.net/xml/v1/request.api";
};

const extractAuthorizeNetError = (payload: any) => {
  const messageText = payload?.messages?.message?.[0]?.text;
  if (typeof messageText === "string" && messageText.trim().length > 0) {
    return messageText.trim();
  }
  const errorText = payload?.transactionResponse?.errors?.[0]?.errorText;
  if (typeof errorText === "string" && errorText.trim().length > 0) {
    return errorText.trim();
  }
  return "Authorize.Net transaction failed.";
};

export async function POST(request: Request) {
  const apiLoginId = process.env.AUTHORIZE_NET_API_LOGIN_ID?.trim();
  const transactionKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY?.trim();
  if (!apiLoginId || !transactionKey) {
    return jsonError("Authorize.Net credentials are not configured.", 500);
  }

  let body: CheckoutPayload | null = null;
  try {
    body = (await request.json()) as CheckoutPayload;
  } catch {
    return jsonError("Invalid checkout request.");
  }

  const tierId = readString(body?.tier);
  const guildId = readString(body?.guildId);
  const opaqueData = body?.opaqueData;
  const dataDescriptor = readString(opaqueData?.dataDescriptor);
  const dataValue = readString(opaqueData?.dataValue);

  if (!tierId || !guildId || !dataDescriptor || !dataValue) {
    return jsonError("Missing checkout details.");
  }

  const configResult = resolveAuthorizeNetCheckoutConfig(tierId);
  if (!configResult.ok) {
    return jsonError(configResult.error);
  }

  const sessionSecret = process.env.PERKCORD_SESSION_SECRET?.trim();
  if (!sessionSecret) {
    return jsonError("PERKCORD_SESSION_SECRET is not configured.", 500);
  }

  const memberSession = getMemberSessionFromCookies(
    request.cookies,
    sessionSecret
  );
  if (!memberSession) {
    return jsonError("Connect Discord before starting checkout.", 401);
  }
  if (memberSession.discordGuildId !== guildId) {
    return jsonError("Discord session does not match this server.", 403);
  }

  const convexUrl = process.env.CONVEX_URL?.trim();
  if (!convexUrl) {
    return jsonError("CONVEX_URL is not configured.", 500);
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const guild = (await convex.query("guilds:getGuildByDiscordId", {
      discordGuildId: guildId,
    })) as { _id: string } | null;
    if (!guild?._id) {
      return jsonError("Guild not found for checkout.", 404);
    }

    const existingLink = (await convex.query(
      "providerCustomers:getProviderCustomerLinkForUser",
      {
        guildId: guild._id,
        provider: "authorize_net",
        discordUserId: memberSession.discordUserId,
      }
    )) as { providerCustomerId?: string } | null;

    const providerCustomerId =
      existingLink?.providerCustomerId ?? `anet_${randomUUID()}`;

    if (!existingLink?.providerCustomerId) {
      await convex.mutation("providerCustomers:upsertProviderCustomerLink", {
        guildId: guild._id,
        provider: "authorize_net",
        providerCustomerId,
        discordUserId: memberSession.discordUserId,
        actorType: "system",
        actorId: "member_checkout",
      });
    }

    const transactionRequest = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: apiLoginId,
          transactionKey,
        },
        refId: `${guildId}:${tierId}`,
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: configResult.config.amount,
          payment: {
            opaqueData: {
              dataDescriptor,
              dataValue,
            },
          },
          order: {
            invoiceNumber: configResult.config.oneTimeKey,
            description: `Perkcord ${tierId} membership`,
          },
          customer: {
            id: providerCustomerId,
          },
        },
      },
    };

    const response = await fetch(getAuthorizeNetApiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(transactionRequest),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.messages?.resultCode !== "Ok") {
      return jsonError(extractAuthorizeNetError(payload));
    }

    const transactionId = readString(payload?.transactionResponse?.transId);
    if (!transactionId) {
      return jsonError("Authorize.Net transaction was missing an id.");
    }

    const baseUrl = new URL(request.url).origin;
    const redirectUrl = new URL("/subscribe/celebrate", baseUrl);
    redirectUrl.searchParams.set("tier", tierId);
    redirectUrl.searchParams.set("guildId", guildId);

    return NextResponse.json({ ok: true, redirectUrl: redirectUrl.toString() });
  } catch (error) {
    return jsonError("Authorize.Net checkout failed. Please try again.");
  }
}
