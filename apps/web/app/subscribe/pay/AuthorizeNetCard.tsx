"use client";

import { type FormEvent, useState } from "react";

let acceptScriptPromise: Promise<void> | null = null;

type AuthorizeNetOpaqueData = {
  dataDescriptor: string;
  dataValue: string;
};

type AcceptDispatchResponse = {
  opaqueData?: AuthorizeNetOpaqueData;
  messages?: {
    resultCode?: string;
    message?: Array<{ code?: string; text?: string }>;
  };
};

type AuthorizeNetCardProps = {
  tierId: string;
  guildId: string | null;
  amount: string | null;
  apiLoginId: string | null;
  clientKey: string | null;
  configError?: string | null;
};

declare global {
  interface Window {
    Accept?: {
      dispatchData: (
        data: {
          authData: { apiLoginID: string; clientKey: string };
          cardData: {
            cardNumber: string;
            month: string;
            year: string;
            cardCode: string;
            zip?: string;
          };
        },
        callback: (response: AcceptDispatchResponse) => void
      ) => void;
    };
  }
}

const loadAcceptJs = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Authorize.Net tokenization is unavailable."));
  }
  if (window.Accept?.dispatchData) {
    return Promise.resolve();
  }
  if (!acceptScriptPromise) {
    acceptScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(
        "script[data-anet=acceptjs]"
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Authorize.Net script."))
        );
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.authorize.net/v1/Accept.js";
      script.async = true;
      script.dataset.anet = "acceptjs";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Authorize.Net script."));
      document.body.appendChild(script);
    });
  }
  return acceptScriptPromise;
};

const getTokenizationError = (response: AcceptDispatchResponse) => {
  const message = response.messages?.message?.[0]?.text;
  if (message && message.trim().length > 0) {
    return message.trim();
  }
  return "Authorize.Net tokenization failed.";
};

const tokenizeCard = (
  apiLoginId: string,
  clientKey: string,
  cardData: {
    cardNumber: string;
    month: string;
    year: string;
    cardCode: string;
    zip?: string;
  }
) => {
  return new Promise<AuthorizeNetOpaqueData>((resolve, reject) => {
    if (!window.Accept?.dispatchData) {
      reject(new Error("Authorize.Net tokenization is unavailable."));
      return;
    }

    window.Accept.dispatchData(
      {
        authData: {
          apiLoginID: apiLoginId,
          clientKey,
        },
        cardData,
      },
      (response) => {
        if (response.messages?.resultCode === "Error") {
          reject(new Error(getTokenizationError(response)));
          return;
        }
        const opaqueData = response.opaqueData;
        if (!opaqueData?.dataDescriptor || !opaqueData?.dataValue) {
          reject(new Error("Authorize.Net returned no payment token."));
          return;
        }
        resolve(opaqueData);
      }
    );
  });
};

const normalizeYear = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length === 2) {
    return `20${trimmed}`;
  }
  return trimmed;
};

export function AuthorizeNetCard({
  tierId,
  guildId,
  amount,
  apiLoginId,
  clientKey,
  configError,
}: AuthorizeNetCardProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const missingKeys = !apiLoginId || !clientKey;
  const ready = Boolean(guildId && amount && !configError && !missingKeys);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || !apiLoginId || !clientKey || !guildId) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await loadAcceptJs();

      const opaqueData = await tokenizeCard(apiLoginId, clientKey, {
        cardNumber: cardNumber.trim(),
        month: expMonth.trim(),
        year: normalizeYear(expYear),
        cardCode: cardCode.trim(),
        zip: zip.trim() || undefined,
      });

      const response = await fetch("/api/subscribe/authorize-net", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tier: tierId,
          guildId,
          opaqueData,
        }),
      });

      const payload = (await response
        .json()
        .catch(() => null)) as { error?: string; redirectUrl?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Authorize.Net checkout failed.");
      }

      if (payload?.redirectUrl) {
        window.location.assign(payload.redirectUrl);
        return;
      }

      throw new Error("Authorize.Net checkout completed without a redirect.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error.";
      setError(message);
      setIsSubmitting(false);
      return;
    }
  };

  return (
    <div className="form">
      <p>Tokenized card capture via Accept.js.</p>
      {configError && <div className="banner error">{configError}</div>}
      {missingKeys && (
        <div className="banner">
          Authorize.Net Accept.js keys are not configured.
        </div>
      )}
      {!guildId && (
        <div className="banner">
          Missing guildId. Add ?guildId=&lt;serverId&gt; to the URL to continue.
        </div>
      )}
      {error && <div className="banner error">{error}</div>}
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Card number
          <input
            className="input"
            autoComplete="cc-number"
            inputMode="numeric"
            placeholder="4242424242424242"
            value={cardNumber}
            onChange={(event) => setCardNumber(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Expiration (MM)
          <input
            className="input"
            autoComplete="cc-exp-month"
            inputMode="numeric"
            placeholder="12"
            value={expMonth}
            onChange={(event) => setExpMonth(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Expiration (YYYY)
          <input
            className="input"
            autoComplete="cc-exp-year"
            inputMode="numeric"
            placeholder="2028"
            value={expYear}
            onChange={(event) => setExpYear(event.target.value)}
            required
          />
        </label>
        <label className="field">
          CVC
          <input
            className="input"
            autoComplete="cc-csc"
            inputMode="numeric"
            placeholder="123"
            value={cardCode}
            onChange={(event) => setCardCode(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Billing ZIP
          <input
            className="input"
            autoComplete="postal-code"
            inputMode="numeric"
            placeholder="10001"
            value={zip}
            onChange={(event) => setZip(event.target.value)}
          />
        </label>
        <button
          className={`button${ready ? "" : " disabled"}`}
          disabled={!ready || isSubmitting}
          type="submit"
        >
          {isSubmitting
            ? "Processing..."
            : amount
            ? `Pay ${amount} with Authorize.Net`
            : "Pay with Authorize.Net"}
        </button>
      </form>
    </div>
  );
}
