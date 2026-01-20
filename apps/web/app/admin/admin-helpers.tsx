export type SearchParams = Record<string, string | string[] | undefined>;

export type MemberIdentity = {
  _id: string;
  discordUserId: string;
  discordUsername?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type TierSummary = {
  _id: string;
  name: string;
};

export type TierDetails = TierSummary & {
  guildId: string;
  slug: string;
  description?: string;
  displayPrice: string;
  perks: string[];
  sortOrder?: number;
  roleIds: string[];
  entitlementPolicy: {
    kind: "subscription" | "one_time";
    durationDays?: number;
    isLifetime?: boolean;
    gracePeriodDays?: number;
    cancelAtPeriodEnd?: boolean;
  };
  checkoutConfig?: {
    authorizeNet?: {
      amount: string;
      intervalLength?: number;
      intervalUnit?: "days" | "months";
    };
    nmi?: {
      hostedUrl: string;
    };
  };
  providerRefs?: {
    stripeSubscriptionPriceIds?: string[];
    stripeOneTimePriceIds?: string[];
    authorizeNetSubscriptionIds?: string[];
    authorizeNetOneTimeKeys?: string[];
    nmiPlanIds?: string[];
    nmiOneTimeKeys?: string[];
  };
  createdAt?: number;
  updatedAt?: number;
};

export type TierListResponse = {
  tiers: TierDetails[];
};

export type GuildSummary = {
  _id: string;
  discordGuildId: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
};

export type GuildListResponse = {
  guilds: GuildSummary[];
};

export type GrantSummary = {
  _id: string;
  tierId: string;
  status: string;
  validFrom: number;
  validThrough?: number;
  source: string;
  tier?: TierSummary | null;
};

export type AuditEventSummary = {
  _id: string;
  timestamp: number;
  eventType: string;
  actorType?: string;
  actorId?: string;
  subjectDiscordUserId?: string;
  subjectTierId?: string;
  subjectGrantId?: string;
  correlationId?: string;
  payloadJson?: string;
};

export type MemberSearchResponse = {
  members: MemberIdentity[];
};

export type MemberSnapshotResponse = {
  memberIdentity: MemberIdentity | null;
  grants: GrantSummary[];
  auditEvents: AuditEventSummary[];
};

export type ActiveMemberCount = {
  tierId: string;
  tierName: string;
  activeMemberCount: number;
};

export type ActiveMemberCountsResponse = {
  tiers: ActiveMemberCount[];
};

export type RevenueIndicatorSummary = {
  provider: string;
  scannedEvents: number;
  matchedEvents: number;
  paymentSucceeded: number;
  paymentFailed: number;
  refunds: number;
  chargebacksOpened: number;
  chargebacksClosed: number;
};

export type RevenueIndicatorTotals = {
  scannedEvents: number;
  matchedEvents: number;
  paymentSucceeded: number;
  paymentFailed: number;
  refunds: number;
  chargebacksOpened: number;
  chargebacksClosed: number;
};

export type RevenueIndicatorsResponse = {
  guildId: string;
  evaluatedAt: number;
  windowDays: number;
  windowStart: number;
  windowEnd: number;
  scanLimit: number;
  providers: RevenueIndicatorSummary[];
  totals: RevenueIndicatorTotals;
};

export type ProviderEventSummary = {
  _id: string;
  provider: string;
  providerEventId: string;
  providerEventType?: string;
  normalizedEventType: string;
  providerObjectId?: string;
  providerCustomerId?: string;
  providerPriceIds?: string[];
  occurredAt?: number;
  receivedAt?: number;
  processedStatus?: string;
  processedAt?: number;
  lastError?: string;
};

export type ProviderDiagnosticsEntry = {
  provider: string;
  event: ProviderEventSummary | null;
  matchType: "customer" | "price" | "none";
};

export type ProviderDiagnosticsResponse = {
  guildId: string;
  scanLimit: number;
  evaluatedAt: number;
  providers: ProviderDiagnosticsEntry[];
};

export type OutboundWebhookDelivery = {
  _id: string;
  endpointId: string;
  endpointUrl: string;
  eventType: string;
  eventId: string;
  status: string;
  attempts: number;
  nextAttemptAt: number;
  lastAttemptedAt?: number;
  lastError?: string;
  deliveredAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type FailedOutboundWebhookResponse = {
  deliveries: OutboundWebhookDelivery[];
};

export type AuditEventsResponse = {
  events: AuditEventSummary[];
};

export type RoleSyncRequest = {
  _id: string;
  scope: string;
  discordUserId?: string;
  status: string;
  requestedAt: number;
  requestedByActorType?: string;
  requestedByActorId?: string;
  reason?: string;
  lastError?: string;
  completedAt?: number;
  updatedAt?: number;
};

export type RoleSyncRequestsResponse = {
  requests: RoleSyncRequest[];
};

export type GuildDiagnostics = {
  checkedAt: number;
  overallStatus: string;
  permissionsOk: boolean;
  missingPermissions: string[];
  roleHierarchyOk: boolean;
  blockedRoleIds: string[];
  rolesExistOk: boolean;
  missingRoleIds: string[];
  checkedRoleIds: string[];
  botUserId?: string;
  botRoleId?: string;
  notes?: string;
};

export type GuildDiagnosticsResponse = {
  diagnostics: GuildDiagnostics | null;
};

type FetchResult<T> = { data?: T; error?: string };

export const getParam = (value: SearchParams[string]) => (Array.isArray(value) ? value[0] : value);

export const getNumberParam = (value: SearchParams[string]) => {
  const raw = getParam(value);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const buildConvexUrl = (
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined>,
) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${normalized}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

export const formatTimestamp = (value?: number) => {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleString();
};

const formatActor = (event: AuditEventSummary) => {
  const actorType = event.actorType ?? "system";
  return event.actorId ? `${actorType} (${event.actorId})` : actorType;
};

const formatAuditPayload = (payloadJson?: string) => {
  if (!payloadJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(payloadJson);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return payloadJson;
  }
};

export const AuditEventContent = ({ event }: { event: AuditEventSummary }) => {
  const payload = formatAuditPayload(event.payloadJson);
  return (
    <>
      <div className="audit-title">
        <span className="audit-type">{event.eventType}</span>
      </div>
      <div className="audit-meta">
        <span>{formatTimestamp(event.timestamp)}</span>
        <span>Actor: {formatActor(event)}</span>
        {event.subjectDiscordUserId && (
          <span>
            Member: <span className="audit-id">{event.subjectDiscordUserId}</span>
          </span>
        )}
        {event.subjectTierId && (
          <span>
            Tier: <span className="audit-id">{event.subjectTierId}</span>
          </span>
        )}
        {event.subjectGrantId && (
          <span>
            Grant: <span className="audit-id">{event.subjectGrantId}</span>
          </span>
        )}
        {event.correlationId && (
          <span>
            Correlation: <span className="audit-id">{event.correlationId}</span>
          </span>
        )}
      </div>
      {payload && (
        <details className="audit-details">
          <summary>Payload</summary>
          <pre>{payload}</pre>
        </details>
      )}
    </>
  );
};

export const formatProviderLabel = (provider: string) => {
  switch (provider) {
    case "stripe":
      return "Stripe";
    case "authorize_net":
      return "Authorize.Net";
    case "nmi":
      return "NMI";
    default:
      return provider;
  }
};

export const formatMatchType = (matchType: ProviderDiagnosticsEntry["matchType"]) => {
  switch (matchType) {
    case "customer":
      return "Customer match";
    case "price":
      return "Price match";
    default:
      return "No match";
  }
};

export const fetchConvexJson = async <T,>(
  baseUrl: string,
  apiKey: string,
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<FetchResult<T>> => {
  const endpoint = buildConvexUrl(baseUrl, path, params);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-perkcord-api-key": apiKey,
      },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok) {
      const message =
        (payload as { error?: string } | null)?.error ??
        `Request failed with status ${response.status}.`;
      return { error: message };
    }
    if (!payload) {
      return { error: "Empty response from Convex REST API." };
    }
    return { data: payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Convex request failed.";
    return { error: message };
  }
};
