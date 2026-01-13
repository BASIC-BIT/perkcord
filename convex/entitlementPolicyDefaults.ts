type EntitlementPolicyLike = {
  kind: "subscription" | "one_time";
  gracePeriodDays?: number;
  cancelAtPeriodEnd?: boolean;
};

export const DEFAULT_GRACE_PERIOD_DAYS = 7;
export const DEFAULT_CANCEL_AT_PERIOD_END = true;

export const applyEntitlementPolicyDefaults = <T extends EntitlementPolicyLike>(policy: T): T => {
  if (policy.kind !== "subscription") {
    return policy;
  }
  return {
    ...policy,
    gracePeriodDays: policy.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS,
    cancelAtPeriodEnd: policy.cancelAtPeriodEnd ?? DEFAULT_CANCEL_AT_PERIOD_END,
  };
};

export const getGracePeriodDays = (policy: EntitlementPolicyLike) =>
  policy.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;

export const getCancelAtPeriodEnd = (policy: EntitlementPolicyLike) =>
  policy.cancelAtPeriodEnd ?? DEFAULT_CANCEL_AT_PERIOD_END;
