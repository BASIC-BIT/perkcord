"use client";

import { useMemo, useState } from "react";
import type { TierDetails } from "@/app/admin/admin-helpers";

type TierMode = "create" | "update";

type TierEditorProps = {
  guildId?: string | null;
  tiers?: TierDetails[] | null;
};

type PurchaseType = "subscription" | "one_time" | "lifetime";

const toCommaList = (values?: string[]) =>
  values && values.length > 0 ? values.join(", ") : "";

const toLineList = (values?: string[]) =>
  values && values.length > 0 ? values.join("\n") : "";

const resolvePurchaseType = (tier?: TierDetails | null): PurchaseType => {
  if (!tier) {
    return "subscription";
  }
  if (tier.entitlementPolicy.kind === "subscription") {
    return "subscription";
  }
  return tier.entitlementPolicy.isLifetime ? "lifetime" : "one_time";
};

const buildDefaultValues = (
  mode: TierMode,
  tier?: TierDetails | null,
): Record<string, string> => {
  if (!tier) {
    return {
      slug: "",
      name: "",
      description: "",
      displayPrice: "",
      perks: "",
      sortOrder: "",
      roleIds: "",
      purchaseType: "subscription",
      policyDurationDays: "",
      policyGracePeriodDays: "",
      policyCancelAtPeriodEnd: "false",
      stripePriceIds: "",
      authorizeNetKey: "",
      authorizeNetAmount: "",
      authorizeNetIntervalLength: "",
      authorizeNetIntervalUnit: "",
      nmiKey: "",
      nmiHostedUrl: "",
    };
  }

  const purchaseType = resolvePurchaseType(tier);
  const isSubscription = purchaseType === "subscription";
  const isOneTime = purchaseType === "one_time";

  const stripePriceIds = isSubscription
    ? tier.providerRefs?.stripeSubscriptionPriceIds
    : tier.providerRefs?.stripeOneTimePriceIds;
  const authorizeNetKeys = isSubscription
    ? tier.providerRefs?.authorizeNetSubscriptionIds
    : tier.providerRefs?.authorizeNetOneTimeKeys;
  const nmiKeys = isSubscription
    ? tier.providerRefs?.nmiPlanIds
    : tier.providerRefs?.nmiOneTimeKeys;

  return {
    slug: mode === "create" ? "" : tier.slug,
    name: mode === "create" ? "" : tier.name,
    description: tier.description ?? "",
    displayPrice: tier.displayPrice ?? "",
    perks: toLineList(tier.perks),
    sortOrder: tier.sortOrder !== undefined ? String(tier.sortOrder) : "",
    roleIds: toCommaList(tier.roleIds),
    purchaseType,
    policyDurationDays:
      isOneTime && tier.entitlementPolicy.durationDays !== undefined
        ? String(tier.entitlementPolicy.durationDays)
        : "",
    policyGracePeriodDays:
      isSubscription && tier.entitlementPolicy.gracePeriodDays !== undefined
        ? String(tier.entitlementPolicy.gracePeriodDays)
        : "",
    policyCancelAtPeriodEnd: String(
      Boolean(tier.entitlementPolicy.cancelAtPeriodEnd),
    ),
    stripePriceIds: toCommaList(stripePriceIds),
    authorizeNetKey: toCommaList(authorizeNetKeys),
    authorizeNetAmount: tier.checkoutConfig?.authorizeNet?.amount ?? "",
    authorizeNetIntervalLength:
      tier.checkoutConfig?.authorizeNet?.intervalLength !== undefined
        ? String(tier.checkoutConfig.authorizeNet.intervalLength)
        : "",
    authorizeNetIntervalUnit:
      tier.checkoutConfig?.authorizeNet?.intervalUnit ?? "",
    nmiKey: toCommaList(nmiKeys),
    nmiHostedUrl: tier.checkoutConfig?.nmi?.hostedUrl ?? "",
  };
};

const formatTimestamp = (value?: number) => {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleString();
};

export const TierEditor = ({ guildId, tiers }: TierEditorProps) => {
  const hasTiers = Boolean(tiers && tiers.length > 0);
  const [mode, setMode] = useState<TierMode>(hasTiers ? "update" : "create");
  const [selectedTierId, setSelectedTierId] = useState<string | null>(
    hasTiers && tiers ? tiers[0]._id : null,
  );
  const [templateTierId, setTemplateTierId] = useState<string | null>(null);

  const selectedTier = useMemo(() => {
    if (!tiers || !selectedTierId) {
      return null;
    }
    return tiers.find((tier) => tier._id === selectedTierId) ?? null;
  }, [selectedTierId, tiers]);

  const templateTier = useMemo(() => {
    if (!tiers || !templateTierId) {
      return null;
    }
    return tiers.find((tier) => tier._id === templateTierId) ?? null;
  }, [templateTierId, tiers]);

  const activeTier = mode === "update" ? selectedTier : templateTier;
  const summaryTier = mode === "update" ? selectedTier : templateTier;
  const summaryLabel = mode === "update" ? "Active tier" : "Template tier";
  const defaults = useMemo(
    () => buildDefaultValues(mode, activeTier),
    [mode, activeTier],
  );
  const formKey = `${mode}-${activeTier?._id ?? "new"}-${
    templateTierId ?? "blank"
  }`;
  const resolvedGuildId =
    guildId ?? activeTier?.guildId ?? selectedTier?.guildId ?? "";

  if (!resolvedGuildId) {
    return (
      <div className="panel-grid mt-4">
        <div className="snapshot-card">
          <h3>Tier selection</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a guild to manage tiers.
          </p>
        </div>
        <div className="snapshot-card">
          <h3>Tier editor</h3>
          <div className="banner mt-4">
            Choose a guild from the sidebar to edit tiers.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-grid mt-4">
      <div className="snapshot-card">
        <h3>Tier selection</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Create new tiers or edit an existing tier. Saving will overwrite the
          current tier configuration.
        </p>
        <div className="tier-actions mt-4">
          <button
            className={`button ${mode === "update" ? "" : "secondary"}`}
            type="button"
            onClick={() => {
              if (!hasTiers) {
                return;
              }
              setMode("update");
              setTemplateTierId(null);
            }}
            disabled={!hasTiers}
          >
            Edit existing
          </button>
          <button
            className={`button ${mode === "create" ? "" : "secondary"}`}
            type="button"
            onClick={() => {
              setMode("create");
              setTemplateTierId(null);
            }}
          >
            Create new
          </button>
        </div>

        {hasTiers ? (
          <>
            {mode === "update" ? (
              <label className="field mt-4">
                <span>Tier to edit</span>
                <select
                  className="input"
                  value={selectedTierId ?? ""}
                  onChange={(event) => {
                    setSelectedTierId(event.target.value);
                    setTemplateTierId(null);
                  }}
                  required
                >
                  {tiers?.map((tier) => (
                    <option key={tier._id} value={tier._id}>
                      {tier.name} ({tier.slug})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field mt-4">
                <span>Template tier (optional)</span>
                <select
                  className="input"
                  value={templateTierId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setTemplateTierId(value);
                  }}
                >
                  <option value="">Blank tier</option>
                  {tiers?.map((tier) => (
                    <option key={tier._id} value={tier._id}>
                      {tier.name} ({tier.slug})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {summaryTier && (
              <div className="snapshot-meta mt-4">
                <span>
                  {summaryLabel}: <strong>{summaryTier.name}</strong>
                </span>
                <span>Tier ID: {summaryTier._id}</span>
                <span>Updated: {formatTimestamp(summaryTier.updatedAt)}</span>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No tiers yet. Create the first one.
          </p>
        )}
      </div>

      <div className="snapshot-card">
        <h3>{mode === "update" ? "Edit tier" : "Create tier"}</h3>
        <form
          key={formKey}
          className="form mt-3"
          action={mode === "update" ? "/api/admin/tiers/update" : "/api/admin/tiers/create"}
          method="post"
        >
          <input type="hidden" name="guildId" value={resolvedGuildId} />
          {mode === "update" && activeTier && (
            <label className="field">
              <span>Tier ID</span>
              <input
                className="input"
                name="tierId"
                defaultValue={activeTier._id}
                readOnly
              />
            </label>
          )}
          <label className="field">
            <span>Slug</span>
            <input
              className="input"
              name="slug"
              placeholder="starter"
              defaultValue={defaults.slug}
              required
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              className="input"
              name="name"
              placeholder="Pro"
              defaultValue={defaults.name}
              required
            />
          </label>
          <label className="field">
            <span>Display price</span>
            <input
              className="input"
              name="displayPrice"
              placeholder="$5 / month"
              defaultValue={defaults.displayPrice}
              required
            />
          </label>
          <label className="field">
            <span>Description (optional)</span>
            <textarea
              className="input"
              name="description"
              rows={2}
              placeholder="Access to premium channels."
              defaultValue={defaults.description}
            />
          </label>
          <label className="field">
            <span>Perks (one per line)</span>
            <textarea
              className="input"
              name="perks"
              rows={3}
              placeholder="Member role
Community chat
Weekly updates"
              defaultValue={defaults.perks}
              required
            />
          </label>
          <label className="field">
            <span>Sort order (optional)</span>
            <input
              className="input"
              type="number"
              name="sortOrder"
              min={0}
              placeholder="10"
              defaultValue={defaults.sortOrder}
            />
          </label>
          <label className="field">
            <span>Role IDs (comma-separated)</span>
            <input
              className="input"
              name="roleIds"
              placeholder="1234, 556788"
              defaultValue={defaults.roleIds}
              required
            />
          </label>
          <label className="field">
            <span>Purchase type</span>
            <select
              className="input"
              name="purchaseType"
              defaultValue={defaults.purchaseType}
              required
            >
              <option value="subscription">subscription</option>
              <option value="one_time">one_time (fixed duration)</option>
              <option value="lifetime">lifetime</option>
            </select>
          </label>
          <label className="field">
            <span>Duration days (one_time)</span>
            <input
              className="input"
              type="number"
              name="policyDurationDays"
              min={1}
              placeholder="30"
              defaultValue={defaults.policyDurationDays}
            />
          </label>
          <label className="field">
            <span>Grace period days (subscription)</span>
            <input
              className="input"
              type="number"
              name="policyGracePeriodDays"
              min={0}
              placeholder="7"
              defaultValue={defaults.policyGracePeriodDays}
            />
          </label>
          <label className="field">
            <span>Cancel at period end (subscription)</span>
            <select
              className="input"
              name="policyCancelAtPeriodEnd"
              defaultValue={defaults.policyCancelAtPeriodEnd}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
          <label className="field">
            <span>Stripe price IDs (comma-separated)</span>
            <input
              className="input"
              name="stripePriceIds"
              placeholder="price_123"
              defaultValue={defaults.stripePriceIds}
            />
          </label>
          <label className="field">
            <span>Authorize.Net key (subscription ID or one-time key)</span>
            <input
              className="input"
              name="authorizeNetKey"
              placeholder="SUBSCRIPTION_ID"
              defaultValue={defaults.authorizeNetKey}
            />
          </label>
          <label className="field">
            <span>Authorize.Net amount</span>
            <input
              className="input"
              name="authorizeNetAmount"
              placeholder="20.00"
              defaultValue={defaults.authorizeNetAmount}
            />
          </label>
          <label className="field">
            <span>Authorize.Net interval length (subscription)</span>
            <input
              className="input"
              name="authorizeNetIntervalLength"
              type="number"
              min={1}
              placeholder="1"
              defaultValue={defaults.authorizeNetIntervalLength}
            />
          </label>
          <label className="field">
            <span>Authorize.Net interval unit (subscription)</span>
            <select
              className="input"
              name="authorizeNetIntervalUnit"
              defaultValue={defaults.authorizeNetIntervalUnit}
            >
              <option value="">Select unit</option>
              <option value="days">days</option>
              <option value="months">months</option>
            </select>
          </label>
          <label className="field">
            <span>NMI key (plan ID or one-time key)</span>
            <input
              className="input"
              name="nmiKey"
              placeholder="plan_abcc"
              defaultValue={defaults.nmiKey}
            />
          </label>
          <label className="field">
            <span>NMI hosted URL (optional)</span>
            <input
              className="input"
              name="nmiHostedUrl"
              placeholder="https://..."
              defaultValue={defaults.nmiHostedUrl}
            />
          </label>
          <div className="tier-actions">
            <button className="button" type="submit">
              {mode === "update" ? "Update tier" : "Create tier"}
            </button>
            {mode === "update" && (
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setMode("create");
                  setTemplateTierId(selectedTierId);
                }}
              >
                Duplicate tier
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

