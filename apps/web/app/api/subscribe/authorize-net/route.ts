import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getMemberSessionFromCookies } from "@/lib/memberSession";
import { resolveAuthorizeNetCheckoutConfig } from "@/lib/authorizeNetCheckout";
import { requireEnv, resolveEnvError } from "@/lib/serverEnv";
import { api } from "../../../../../../convex/_generated/api";

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

const extractAuthorizeNetError = (payload: unknown) => {
  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const messages = record?.messages;
  if (messages && typeof messages === "object") {
    const messageList = (messages as Record<string, unknown>).message;
    if (Array.isArray(messageList) && messageList.length > 0) {
      const message = messageList[0];
      const text =
        message && typeof message === "object"
          ? (message as Record<string, unknown>).text
          : undefined;
      if (typeof text === "string" && text.trim().length > 0) {
        return text.trim();
      }
    }
  }

  const transactionResponse = record?.transactionResponse;
  if (transactionResponse && typeof transactionResponse === "object") {
    const errorList = (transactionResponse as Record<string, unknown>).errors;
    if (Array.isArray(errorList) && errorList.length > 0) {
      const error = errorList[0];
      const errorText =
        error && typeof error === "object"
          ? (error as Record<string, unknown>).errorText
          : undefined;
      if (typeof errorText === "string" && errorText.trim().length > 0) {
        return errorText.trim();
      }
    }
  }

  return "Authorize.Net transaction failed.";
};

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

const addMonthsUtc = (value: Date, months: number) => {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const targetMonth = month + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(Date.UTC(targetYear, normalizedMonth, safeDay));
};

const addIntervalUtc = (value: Date, length: number, unit: "days" | "months") => {
  if (unit === "months") {
    return addMonthsUtc(value, length);
  }
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + length),
  );
};

export async function POST(request: NextRequest) {
  let apiLoginId: string;
  let transactionKey: string;
  try {
    apiLoginId = requireEnv(
      "AUTHORIZE_NET_API_LOGIN_ID",
      "Authorize.Net credentials are not configured.",
    );
    transactionKey = requireEnv(
      "AUTHORIZE_NET_TRANSACTION_KEY",
      "Authorize.Net credentials are not configured.",
    );
  } catch (error) {
    return jsonError(resolveEnvError(error, "Authorize.Net credentials are not configured."), 500);
  }

  let body: CheckoutPayload | null = null;
  try {
    body = (await request.json()) as CheckoutPayload;
  } catch {
    return jsonError("Invalid checkout request.");
  }

  const tierSlug = readString(body?.tier);
  const guildId = readString(body?.guildId);
  const opaqueData = body?.opaqueData;
  const dataDescriptor = readString(opaqueData?.dataDescriptor);
  const dataValue = readString(opaqueData?.dataValue);

  if (!tierSlug || !guildId || !dataDescriptor || !dataValue) {
    return jsonError("Missing checkout details.");
  }

  let sessionSecret: string;
  try {
    sessionSecret = requireEnv(
      "PERKCORD_SESSION_SECRET",
      "PERKCORD_SESSION_SECRET is not configured.",
    );
  } catch (error) {
    return jsonError(resolveEnvError(error, "PERKCORD_SESSION_SECRET is not configured."), 500);
  }

  const memberSession = getMemberSessionFromCookies(request.cookies, sessionSecret);
  if (!memberSession) {
    return jsonError("Connect Discord before starting checkout.", 401);
  }
  if (memberSession.discordGuildId !== guildId) {
    return jsonError("Discord session does not match this server.", 403);
  }

  let convexUrl: string;
  try {
    convexUrl = requireEnv("CONVEX_URL", "CONVEX_URL is not configured.");
  } catch (error) {
    return jsonError(resolveEnvError(error, "CONVEX_URL is not configured."), 500);
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const guild = await convex.query(api.guilds.getGuildByDiscordId, {
      discordGuildId: guildId,
    });
    if (!guild?._id) {
      return jsonError("Guild not found for checkout.", 404);
    }

    const tier = await convex.query(api.entitlements.getTierBySlug, {
      guildId: guild._id,
      slug: tierSlug,
    });
    if (!tier) {
      return jsonError("Tier not found for checkout.", 404);
    }

    const configResult = resolveAuthorizeNetCheckoutConfig(tier);
    if (!configResult.ok) {
      return jsonError(configResult.error);
    }

    const existingLink = await convex.query(api.providerCustomers.getProviderCustomerLinkForUser, {
      guildId: guild._id,
      provider: "authorize_net",
      discordUserId: memberSession.discordUserId,
    });

    const providerCustomerId = existingLink?.providerCustomerId ?? `anet_${randomUUID()}`;

    if (!existingLink?.providerCustomerId) {
      await convex.mutation(api.providerCustomers.upsertProviderCustomerLink, {
        guildId: guild._id,
        provider: "authorize_net",
        providerCustomerId,
        discordUserId: memberSession.discordUserId,
        actorType: "system",
        actorId: "member_checkout",
      });
    }

    const refId = `${guildId}:${tierSlug}`;
    const invoiceNumber =
      configResult.config.mode === "subscription"
        ? configResult.config.subscriptionKey
        : configResult.config.oneTimeKey;
    const transactionRequest = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: apiLoginId,
          transactionKey,
        },
        refId,
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
            invoiceNumber,
            description: `Perkcord ${tier.name} membership`,
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

    if (configResult.config.mode === "subscription") {
      const startDate = formatDate(
        addIntervalUtc(
          new Date(),
          configResult.config.intervalLength,
          configResult.config.intervalUnit,
        ),
      );
      const subscriptionRequest = {
        createSubscriptionRequest: {
          merchantAuthentication: {
            name: apiLoginId,
            transactionKey,
          },
          refId,
          subscription: {
            name: `Perkcord ${tier.name} subscription`,
            paymentSchedule: {
              interval: {
                length: configResult.config.intervalLength,
                unit: configResult.config.intervalUnit,
              },
              startDate,
              totalOccurrences: 9999,
              trialOccurrences: 0,
            },
            amount: configResult.config.amount,
            payment: {
              opaqueData: {
                dataDescriptor,
                dataValue,
              },
            },
            order: {
              invoiceNumber: configResult.config.subscriptionKey,
              description: `Perkcord ${tier.name} subscription`,
            },
            customer: {
              id: providerCustomerId,
            },
          },
        },
      };

      const subscriptionResponse = await fetch(getAuthorizeNetApiUrl(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(subscriptionRequest),
      });
      const subscriptionPayload = await subscriptionResponse.json().catch(() => ({}));
      if (!subscriptionResponse.ok || subscriptionPayload?.messages?.resultCode !== "Ok") {
        return jsonError(extractAuthorizeNetError(subscriptionPayload));
      }
    }

    const baseUrl = new URL(request.url).origin;
    const redirectUrl = new URL("/subscribe/celebrate", baseUrl);
    redirectUrl.searchParams.set("tier", tierSlug);

    return NextResponse.json({ ok: true, redirectUrl: redirectUrl.toString() });
  } catch (error) {
    return jsonError("Authorize.Net checkout failed. Please try again.");
  }
}
