import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;
type MemberIdentity = {
  _id: string;
  discordUserId: string;
  discordUsername?: string;
  createdAt?: number;
  updatedAt?: number;
};
type TierSummary = {
  _id: string;
  name: string;
};
type TierListResponse = {
  tiers: TierSummary[];
};
type GuildSummary = {
  _id: string;
  discordGuildId: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
};
type GuildListResponse = {
  guilds: GuildSummary[];
};
type GrantSummary = {
  _id: string;
  tierId: string;
  status: string;
  validFrom: number;
  validThrough?: number;
  source: string;
  tier?: TierSummary | null;
};
type AuditEventSummary = {
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
type MemberSearchResponse = {
  members: MemberIdentity[];
};
type MemberSnapshotResponse = {
  memberIdentity: MemberIdentity | null;
  grants: GrantSummary[];
  auditEvents: AuditEventSummary[];
};
type ActiveMemberCount = {
  tierId: string;
  tierName: string;
  activeMemberCount: number;
};
type ActiveMemberCountsResponse = {
  tiers: ActiveMemberCount[];
};
type RevenueIndicatorSummary = {
  provider: string;
  scannedEvents: number;
  matchedEvents: number;
  paymentSucceeded: number;
  paymentFailed: number;
  refunds: number;
  chargebacksOpened: number;
  chargebacksClosed: number;
};
type RevenueIndicatorTotals = {
  scannedEvents: number;
  matchedEvents: number;
  paymentSucceeded: number;
  paymentFailed: number;
  refunds: number;
  chargebacksOpened: number;
  chargebacksClosed: number;
};
type RevenueIndicatorsResponse = {
  guildId: string;
  evaluatedAt: number;
  windowDays: number;
  windowStart: number;
  windowEnd: number;
  scanLimit: number;
  providers: RevenueIndicatorSummary[];
  totals: RevenueIndicatorTotals;
};
type ProviderEventSummary = {
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
type ProviderDiagnosticsEntry = {
  provider: string;
  event: ProviderEventSummary | null;
  matchType: "customer" | "price" | "none";
};
type ProviderDiagnosticsResponse = {
  guildId: string;
  scanLimit: number;
  evaluatedAt: number;
  providers: ProviderDiagnosticsEntry[];
};
type OutboundWebhookDelivery = {
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
type FailedOutboundWebhookResponse = {
  deliveries: OutboundWebhookDelivery[];
};
type AuditEventsResponse = {
  events: AuditEventSummary[];
};
type RoleSyncRequest = {
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
type RoleSyncRequestsResponse = {
  requests: RoleSyncRequest[];
};
type GuildDiagnostics = {
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
type GuildDiagnosticsResponse = {
  diagnostics: GuildDiagnostics | null;
};

type FetchResult<T> = { data?: T; error?: string };

const getParam = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;
const getNumberParam = (value: SearchParams[string]) => {
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
  params: Record<string, string | number | undefined>
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

const formatTimestamp = (value?: number) => {
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

const AuditEventContent = ({ event }: { event: AuditEventSummary }) => {
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

const formatProviderLabel = (provider: string) => {
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

const formatMatchType = (matchType: ProviderDiagnosticsEntry["matchType"]) => {
  switch (matchType) {
    case "customer":
      return "Customer match";
    case "price":
      return "Price match";
    default:
      return "No match";
  }
};

const fetchConvexJson = async <T,>(
  baseUrl: string,
  apiKey: string,
  path: string,
  params: Record<string, string | number | undefined>
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
    const message =
      error instanceof Error ? error.message : "Convex request failed.";
    return { error: message };
  }
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const authEnabled = Boolean(secret);
  const cookieStore = cookies();
  const session = secret ? getSessionFromCookies(cookieStore, secret) : null;
  const forceSyncStatus = getParam(searchParams?.forceSync);
  const forceSyncRequestId = getParam(searchParams?.requestId);
  const forceSyncError = getParam(searchParams?.message);
  const roleConnectionsStatus = getParam(
    searchParams?.roleConnectionsStatus
  );
  const roleConnectionsMessage = getParam(
    searchParams?.roleConnectionsMessage
  );
  const roleConnectionsCount = getParam(searchParams?.roleConnectionsCount);
  const grantAction = getParam(searchParams?.grantAction);
  const grantStatus = getParam(searchParams?.grantStatus);
  const grantId = getParam(searchParams?.grantId);
  const grantMessage = getParam(searchParams?.grantMessage);
  const tierAction = getParam(searchParams?.tierAction);
  const tierStatus = getParam(searchParams?.tierStatus);
  const tierOutcomeId = getParam(searchParams?.tierId);
  const tierMessage = getParam(searchParams?.tierMessage);
  const guildId = getParam(searchParams?.guildId);
  const memberSearch = getParam(searchParams?.memberSearch);
  const memberId = getParam(searchParams?.memberId);
  const scanLimit = getNumberParam(searchParams?.scanLimit);
  const revenueWindowDays = getNumberParam(searchParams?.revenueWindowDays);
  const auditLimit = getNumberParam(searchParams?.auditLimit);
  const failedLimit = getNumberParam(searchParams?.failedLimit);
  const convexUrl = process.env.PERKCORD_CONVEX_HTTP_URL?.trim();
  const convexApiKey = process.env.PERKCORD_REST_API_KEY?.trim();

  let memberSearchError: string | null = null;
  let memberSearchResults: MemberIdentity[] | null = null;
  let memberSnapshotError: string | null = null;
  let memberSnapshot: MemberSnapshotResponse | null = null;
  let roleSyncError: string | null = null;
  let roleSyncRequests: RoleSyncRequest[] | null = null;
  let activeMemberCountsError: string | null = null;
  let activeMemberCounts: ActiveMemberCountsResponse | null = null;
  let revenueIndicatorsError: string | null = null;
  let revenueIndicators: RevenueIndicatorsResponse | null = null;
  let guildDiagnosticsError: string | null = null;
  let guildDiagnostics: GuildDiagnostics | null = null;
  let providerDiagnosticsError: string | null = null;
  let providerDiagnostics: ProviderDiagnosticsResponse | null = null;
  let failedWebhookError: string | null = null;
  let failedWebhookDeliveries: OutboundWebhookDelivery[] | null = null;
  let auditEventsError: string | null = null;
  let auditEvents: AuditEventSummary[] | null = null;
  let healthConfigError: string | null = null;
  let guildListError: string | null = null;
  let guildList: GuildSummary[] | null = null;
  let tierListError: string | null = null;
  let tierList: TierSummary[] | null = null;

  if (session && convexUrl && convexApiKey) {
    const guildResult = await fetchConvexJson<GuildListResponse>(
      convexUrl,
      convexApiKey,
      "/api/guilds",
      {
        limit: 50,
      }
    );
    if (guildResult.error) {
      guildListError = guildResult.error;
    } else {
      guildList = guildResult.data?.guilds ?? [];
    }

    if (memberSearch && !guildId) {
      memberSearchError = "Guild ID is required to search members.";
    }
    if (memberSearch && guildId) {
      const result = await fetchConvexJson<MemberSearchResponse>(
        convexUrl,
        convexApiKey,
        "/api/members",
        {
          guildId,
          search: memberSearch,
          limit: 25,
        }
      );
      if (result.error) {
        memberSearchError = result.error;
      } else {
        memberSearchResults = result.data?.members ?? [];
      }
    }

    if (memberId && !guildId) {
      memberSnapshotError = "Guild ID is required to load a member snapshot.";
    }
    if (memberId && guildId) {
      const result = await fetchConvexJson<MemberSnapshotResponse>(
        convexUrl,
        convexApiKey,
        "/api/member",
        {
          guildId,
          discordUserId: memberId,
          auditLimit: 25,
        }
      );
      if (result.error) {
        memberSnapshotError = result.error;
      } else {
        memberSnapshot = result.data ?? null;
      }

      const roleSyncResult = await fetchConvexJson<RoleSyncRequestsResponse>(
        convexUrl,
        convexApiKey,
        "/api/role-sync",
        {
          guildId,
          discordUserId: memberId,
          limit: 10,
        }
      );
      if (roleSyncResult.error) {
        roleSyncError = roleSyncResult.error;
      } else {
        roleSyncRequests = roleSyncResult.data?.requests ?? [];
      }
    }

    if (guildId) {
      const tiersResult = await fetchConvexJson<TierListResponse>(
        convexUrl,
        convexApiKey,
        "/api/tiers",
        {
          guildId,
        }
      );
      if (tiersResult.error) {
        tierListError = tiersResult.error;
      } else {
        tierList = tiersResult.data?.tiers ?? [];
      }

      const countsResult = await fetchConvexJson<ActiveMemberCountsResponse>(
        convexUrl,
        convexApiKey,
        "/api/reporting/active-members",
        {
          guildId,
        }
      );
      if (countsResult.error) {
        activeMemberCountsError = countsResult.error;
      } else {
        activeMemberCounts = countsResult.data ?? null;
      }

      const revenueResult =
        await fetchConvexJson<RevenueIndicatorsResponse>(
          convexUrl,
          convexApiKey,
          "/api/reporting/revenue",
          {
            guildId,
            scanLimit,
            windowDays: revenueWindowDays,
          }
        );
      if (revenueResult.error) {
        revenueIndicatorsError = revenueResult.error;
      } else {
        revenueIndicators = revenueResult.data ?? null;
      }

      const guildDiagnosticsResult =
        await fetchConvexJson<GuildDiagnosticsResponse>(
          convexUrl,
          convexApiKey,
          "/api/diagnostics/guild",
          {
            guildId,
          }
        );
      if (guildDiagnosticsResult.error) {
        guildDiagnosticsError = guildDiagnosticsResult.error;
      } else {
        guildDiagnostics = guildDiagnosticsResult.data?.diagnostics ?? null;
      }

      const diagnosticsResult =
        await fetchConvexJson<ProviderDiagnosticsResponse>(
          convexUrl,
          convexApiKey,
          "/api/diagnostics/provider-events",
          {
            guildId,
            scanLimit,
          }
        );
      if (diagnosticsResult.error) {
        providerDiagnosticsError = diagnosticsResult.error;
      } else {
        providerDiagnostics = diagnosticsResult.data ?? null;
      }

      const failedResult =
        await fetchConvexJson<FailedOutboundWebhookResponse>(
          convexUrl,
          convexApiKey,
          "/api/webhooks/failed",
          {
            guildId,
            limit: failedLimit ?? 25,
          }
        );
      if (failedResult.error) {
        failedWebhookError = failedResult.error;
      } else {
        failedWebhookDeliveries = failedResult.data?.deliveries ?? [];
      }

      const auditResult = await fetchConvexJson<AuditEventsResponse>(
        convexUrl,
        convexApiKey,
        "/api/audit",
        {
          guildId,
          limit: auditLimit ?? 25,
        }
      );
      if (auditResult.error) {
        auditEventsError = auditResult.error;
      } else {
        auditEvents = auditResult.data?.events ?? [];
      }
    }
  } else if (session) {
    guildListError =
      "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    if (memberSearch) {
      memberSearchError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
    if (memberId) {
      memberSnapshotError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      roleSyncError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
    if (guildId) {
      healthConfigError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      guildDiagnosticsError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      tierListError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      revenueIndicatorsError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      failedWebhookError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      auditEventsError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
  }

  const grantActionLabel =
    grantAction === "revoke"
      ? "revoke"
      : grantAction === "create"
        ? "create"
        : "action";
  const grantBanner =
    grantStatus === "success"
      ? grantAction === "revoke"
        ? `Grant revoked${grantId ? ` (${grantId})` : ""}.`
        : `Manual grant created${grantId ? ` (${grantId})` : ""}.`
      : grantStatus === "error"
        ? `Manual grant ${grantActionLabel} failed${
            grantMessage ? `: ${grantMessage}` : "."
          }`
        : null;
  const tierActionLabel =
    tierAction === "update"
      ? "update"
      : tierAction === "create"
        ? "create"
        : "action";
  const tierBanner =
    tierStatus === "success"
      ? tierAction === "update"
        ? `Tier updated${tierOutcomeId ? ` (${tierOutcomeId})` : ""}.`
        : `Tier created${tierOutcomeId ? ` (${tierOutcomeId})` : ""}.`
      : tierStatus === "error"
        ? `Tier ${tierActionLabel} failed${
            tierMessage ? `: ${tierMessage}` : "."
          }`
        : null;
  const roleConnectionsBanner =
    roleConnectionsStatus === "success"
      ? `Linked Roles metadata registered${
          roleConnectionsCount ? ` (${roleConnectionsCount} fields)` : ""
        }.`
      : roleConnectionsStatus === "error"
        ? `Linked Roles metadata registration failed${
            roleConnectionsMessage ? `: ${roleConnectionsMessage}` : "."
          }`
        : null;

  return (
    <main className="card">
      <h1>Admin Portal</h1>
      {!secret && (
        <div className="banner">
          PERKCORD_SESSION_SECRET is not configured. Admin auth is disabled.
        </div>
      )}
      {session ? (
        <>
          <p>Signed in as {session.username}.</p>
          <div className="meta">
            <span>Discord ID: {session.userId}</span>
            <span>Signed in: {new Date(session.issuedAt).toLocaleString()}</span>
          </div>
          {forceSyncStatus === "success" && (
            <div className="banner success">
              Force sync queued.
              {forceSyncRequestId ? ` Request ID: ${forceSyncRequestId}` : ""}
            </div>
          )}
          {forceSyncStatus === "error" && (
            <div className="banner error">
              Force sync failed
              {forceSyncError ? `: ${forceSyncError}` : "."}
            </div>
          )}
          {grantStatus && grantBanner && (
            <div
              className={`banner ${
                grantStatus === "error" ? "error" : "success"
              }`}
            >
              {grantBanner}
            </div>
          )}
          {tierStatus && tierBanner && (
            <div
              className={`banner ${
                tierStatus === "error" ? "error" : "success"
              }`}
            >
              {tierBanner}
            </div>
          )}
          {roleConnectionsStatus && roleConnectionsBanner && (
            <div
              className={`banner ${
                roleConnectionsStatus === "error" ? "error" : "success"
              }`}
            >
              {roleConnectionsBanner}
            </div>
          )}
          <section className="panel">
            <h2>Guild selection</h2>
            <p>Select the guild you want to manage in this session.</p>
            {guildListError && (
              <div className="banner error">{guildListError}</div>
            )}
            {guildList && guildList.length > 0 ? (
              <form className="form" action="/admin" method="get">
                <label className="field">
                  <span>Guild</span>
                  <select
                    className="input"
                    name="guildId"
                    defaultValue={guildId ?? ""}
                  >
                    <option value="">Select a guild</option>
                    {guildList.map((guild) => (
                      <option key={guild._id} value={guild._id}>
                        {guild.name} ({guild.discordGuildId})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="tier-actions">
                  <button className="button secondary" type="submit">
                    Load guild
                  </button>
                </div>
              </form>
            ) : !guildListError ? (
              <p>
                No guilds found yet. Invite the bot to a server to begin
                onboarding.
              </p>
            ) : null}
          </section>
          <section className="panel">
            <h2>Force role sync</h2>
            <p>
              Request a bot resync for a single member or an entire guild. This
              is admin-only and queues a role sync job in Convex.
            </p>
            <form className="form" action="/api/admin/force-sync" method="post">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  defaultValue={guildId ?? ""}
                  required
                />
              </label>
              <label className="field">
                <span>Scope</span>
                <select className="input" name="scope" defaultValue="user">
                  <option value="user">User</option>
                  <option value="guild">Guild</option>
                </select>
              </label>
              <label className="field">
                <span>Discord User ID (required for user scope)</span>
                <input
                  className="input"
                  name="discordUserId"
                  placeholder="112233445566778899"
                />
              </label>
              <label className="field">
                <span>Reason (optional)</span>
                <textarea
                  className="input"
                  name="reason"
                  rows={2}
                  placeholder="Member reported missing access."
                />
              </label>
              <div className="tier-actions">
                <button className="button" type="submit">
                  Request force sync
                </button>
              </div>
            </form>
          </section>
          <section className="panel">
            <h2>Linked Roles setup wizard</h2>
            <p>
              Configure optional Linked Roles metadata. Bot roles remain the
              primary access control.
            </p>
            <ol className="step-list">
              <li className="step-item">
                <div className="step-title">Register metadata schema</div>
                <p className="step-hint">
                  This registers the Role Connections metadata fields for this
                  Discord application (one-time per app).
                </p>
                <form
                  className="form"
                  action="/api/admin/role-connections/register"
                  method="post"
                >
                  <label className="field">
                    <span>Guild ID</span>
                    <input
                      className="input"
                      name="guildId"
                      placeholder="123456789012345678"
                      defaultValue={guildId ?? ""}
                      required
                    />
                  </label>
                  <div className="tier-actions">
                    <button className="button secondary" type="submit">
                      Register metadata schema
                    </button>
                  </div>
                </form>
              </li>
              <li className="step-item">
                <div className="step-title">
                  Create a Linked Role in Discord
                </div>
                <p className="step-hint">
                  In the Discord Developer Portal, open your application and
                  add a Linked Role that uses these fields.
                </p>
                <div className="meta-grid">
                  <div className="meta-card">
                    <span className="meta-key">is_active</span>
                    <span className="meta-desc">
                      Boolean, true when a member has an active entitlement.
                    </span>
                  </div>
                  <div className="meta-card">
                    <span className="meta-key">tier</span>
                    <span className="meta-desc">
                      Integer, higher numbers represent higher tiers.
                    </span>
                  </div>
                  <div className="meta-card">
                    <span className="meta-key">member_since_days</span>
                    <span className="meta-desc">
                      Integer, days since the member first received access.
                    </span>
                  </div>
                </div>
                <p className="step-hint">
                  Suggested conditions: is_active equals true, tier greater than
                  or equal to 1, member_since_days greater than or equal to 1.
                </p>
              </li>
              <li className="step-item">
                <div className="step-title">Verify member updates</div>
                <p className="step-hint">
                  Entitlement changes will sync metadata automatically. If a
                  member connected before we requested{" "}
                  <code>role_connections.write</code>, ask them to reconnect.
                </p>
              </li>
            </ol>
          </section>
          <section className="panel">
            <h2>Tier management</h2>
            <p>
              Create or update tiers, mapping roles and provider product IDs.   
              Use comma-separated IDs for lists.
            </p>
            {tierListError && (
              <div className="banner error">{tierListError}</div>
            )}
            <div className="snapshot-grid">
              <div className="snapshot-card">
                <h3>Create tier</h3>
                <form
                  className="form"
                  action="/api/admin/tiers/create"
                  method="post"
                >
                  <label className="field">
                    <span>Guild ID</span>
                    <input
                      className="input"
                      name="guildId"
                      placeholder="123456789012345678"
                      defaultValue={guildId ?? ""}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Name</span>
                    <input
                      className="input"
                      name="name"
                      placeholder="Pro"
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
                    />
                  </label>
                  <label className="field">
                    <span>Role IDs (comma-separated)</span>
                    <input
                      className="input"
                      name="roleIds"
                      placeholder="1234, 5678"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Entitlement kind</span>
                    <select
                      className="input"
                      name="policyKind"
                      defaultValue="subscription"
                    >
                      <option value="subscription">subscription</option>
                      <option value="one_time">one_time</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Duration days (one-time)</span>
                    <input
                      className="input"
                      type="number"
                      name="policyDurationDays"
                      min={1}
                      placeholder="30"
                    />
                  </label>
                  <label className="field">
                    <span>Lifetime (one-time)</span>
                    <input type="checkbox" name="policyLifetime" />
                  </label>
                  <label className="field">
                    <span>Grace period days (subscription)</span>
                    <input
                      className="input"
                      type="number"
                      name="policyGracePeriodDays"
                      min={0}
                      placeholder="7"
                    />
                  </label>
                  <label className="field">
                    <span>Cancel at period end (subscription)</span>
                    <input type="checkbox" name="policyCancelAtPeriodEnd" />
                  </label>
                  <label className="field">
                    <span>Stripe subscription price IDs</span>
                    <input
                      className="input"
                      name="stripeSubscriptionPriceIds"
                      placeholder="price_123, price_456"
                    />
                  </label>
                  <label className="field">
                    <span>Stripe one-time price IDs</span>
                    <input
                      className="input"
                      name="stripeOneTimePriceIds"
                      placeholder="price_123, price_456"
                    />
                  </label>
                  <label className="field">
                    <span>Authorize.Net subscription IDs</span>
                    <input
                      className="input"
                      name="authorizeNetSubscriptionIds"
                      placeholder="123456"
                    />
                  </label>
                  <label className="field">
                    <span>Authorize.Net one-time keys</span>
                    <input
                      className="input"
                      name="authorizeNetOneTimeKeys"
                      placeholder="ONE_TIME_KEY"
                    />
                  </label>
                  <label className="field">
                    <span>NMI plan IDs (optional)</span>
                    <input
                      className="input"
                      name="nmiPlanIds"
                      placeholder="plan_abc"
                    />
                  </label>
                  <label className="field">
                    <span>NMI one-time keys (optional)</span>
                    <input
                      className="input"
                      name="nmiOneTimeKeys"
                      placeholder="NMI_ONETIME"
                    />
                  </label>
                  <div className="tier-actions">
                    <button className="button" type="submit">
                      Create tier
                    </button>
                  </div>
                </form>
              </div>
              <div className="snapshot-card">
                <h3>Update tier</h3>
                <form
                  className="form"
                  action="/api/admin/tiers/update"
                  method="post"
                >
                  <label className="field">
                    <span>Guild ID</span>
                    <input
                      className="input"
                      name="guildId"
                      placeholder="123456789012345678"
                      defaultValue={guildId ?? ""}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Tier ID</span>
                    <input
                      className="input"
                      name="tierId"
                      list="tier-options-admin"
                      placeholder="tier_id"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Name (optional)</span>
                    <input className="input" name="name" placeholder="Pro" />
                  </label>
                  <label className="field">
                    <span>Description (optional)</span>
                    <textarea
                      className="input"
                      name="description"
                      rows={2}
                      placeholder="Access to premium channels."
                    />
                  </label>
                  <label className="field">
                    <span>Role IDs (comma-separated)</span>
                    <input
                      className="input"
                      name="roleIds"
                      placeholder="1234, 5678"
                    />
                  </label>
                  <label className="field">
                    <span>Entitlement kind (leave blank to keep)</span>
                    <select className="input" name="policyKind" defaultValue="">
                      <option value="">Leave unchanged</option>
                      <option value="subscription">subscription</option>
                      <option value="one_time">one_time</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Duration days (one-time)</span>
                    <input
                      className="input"
                      type="number"
                      name="policyDurationDays"
                      min={1}
                      placeholder="30"
                    />
                  </label>
                  <label className="field">
                    <span>Lifetime (one-time)</span>
                    <input type="checkbox" name="policyLifetime" />
                  </label>
                  <label className="field">
                    <span>Grace period days (subscription)</span>
                    <input
                      className="input"
                      type="number"
                      name="policyGracePeriodDays"
                      min={0}
                      placeholder="7"
                    />
                  </label>
                  <label className="field">
                    <span>Cancel at period end (subscription)</span>
                    <input type="checkbox" name="policyCancelAtPeriodEnd" />
                  </label>
                  <label className="field">
                    <span>Stripe subscription price IDs</span>
                    <input
                      className="input"
                      name="stripeSubscriptionPriceIds"
                      placeholder="price_123, price_456"
                    />
                  </label>
                  <label className="field">
                    <span>Stripe one-time price IDs</span>
                    <input
                      className="input"
                      name="stripeOneTimePriceIds"
                      placeholder="price_123, price_456"
                    />
                  </label>
                  <label className="field">
                    <span>Authorize.Net subscription IDs</span>
                    <input
                      className="input"
                      name="authorizeNetSubscriptionIds"
                      placeholder="123456"
                    />
                  </label>
                  <label className="field">
                    <span>Authorize.Net one-time keys</span>
                    <input
                      className="input"
                      name="authorizeNetOneTimeKeys"
                      placeholder="ONE_TIME_KEY"
                    />
                  </label>
                  <label className="field">
                    <span>NMI plan IDs (optional)</span>
                    <input
                      className="input"
                      name="nmiPlanIds"
                      placeholder="plan_abc"
                    />
                  </label>
                  <label className="field">
                    <span>NMI one-time keys (optional)</span>
                    <input
                      className="input"
                      name="nmiOneTimeKeys"
                      placeholder="NMI_ONETIME"
                    />
                  </label>
                  <div className="tier-actions">
                    <button className="button" type="submit">
                      Update tier
                    </button>
                  </div>
                </form>
                {tierList && tierList.length > 0 && (
                  <datalist id="tier-options-admin">
                    {tierList.map((tier) => (
                      <option
                        key={tier._id}
                        value={tier._id}
                        label={tier.name}
                      />
                    ))}
                  </datalist>
                )}
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Manual grants</h2>
            <p>
              Create or revoke entitlements with audit trails. Leave valid dates
              empty for immediate, ongoing access.
            </p>
            <div className="snapshot-grid">
              <div className="snapshot-card">
                <h3>Create grant</h3>
                <form
                  className="form"
                  action="/api/admin/grants/create"
                  method="post"
                >
                  <label className="field">
                    <span>Guild ID</span>
                    <input
                      className="input"
                      name="guildId"
                      placeholder="123456789012345678"
                      defaultValue={guildId ?? ""}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Discord User ID</span>
                    <input
                      className="input"
                      name="discordUserId"
                      placeholder="112233445566778899"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Tier ID</span>
                    <input
                      className="input"
                      name="tierId"
                      list="tier-options"
                      placeholder="tier_id"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      className="input"
                      name="status"
                      defaultValue="active"
                    >
                      <option value="active">active</option>
                      <option value="pending">pending</option>
                      <option value="past_due">past_due</option>
                      <option value="canceled">canceled</option>
                      <option value="expired">expired</option>
                      <option value="suspended_dispute">
                        suspended_dispute
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Valid from (optional)</span>
                    <input
                      className="input"
                      type="datetime-local"
                      name="validFrom"
                    />
                  </label>
                  <label className="field">
                    <span>Valid through (optional)</span>
                    <input
                      className="input"
                      type="datetime-local"
                      name="validThrough"
                    />
                  </label>
                  <label className="field">
                    <span>Note (optional)</span>
                    <textarea
                      className="input"
                      name="note"
                      rows={2}
                      placeholder="Comped access after support ticket."
                    />
                  </label>
                  <div className="tier-actions">
                    <button className="button" type="submit">
                      Create manual grant
                    </button>
                  </div>
                </form>
                {tierList && tierList.length > 0 && (
                  <datalist id="tier-options">
                    {tierList.map((tier) => (
                      <option
                        key={tier._id}
                        value={tier._id}
                        label={tier.name}
                      />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="snapshot-card">
                <h3>Revoke grant</h3>
                <form
                  className="form"
                  action="/api/admin/grants/revoke"
                  method="post"
                >
                  <label className="field">
                    <span>Guild ID</span>
                    <input
                      className="input"
                      name="guildId"
                      placeholder="123456789012345678"
                      defaultValue={guildId ?? ""}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Grant ID</span>
                    <input
                      className="input"
                      name="grantId"
                      placeholder="entitlement_grant_id"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Note (optional)</span>
                    <textarea
                      className="input"
                      name="note"
                      rows={2}
                      placeholder="Revoked after cancellation."
                    />
                  </label>
                  <div className="tier-actions">
                    <button className="button secondary" type="submit">
                      Revoke grant
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Health overview</h2>
            <p>
              Review recent provider events and active member counts for a
              guild.
            </p>
            <form className="form" action="/admin" method="get">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  defaultValue={guildId ?? ""}
                  required
                />
              </label>
              <label className="field">
                <span>Provider scan limit (optional)</span>
                <input
                  className="input"
                  name="scanLimit"
                  type="number"
                  min={1}
                  max={1000}
                  placeholder="200"
                  defaultValue={scanLimit ? String(scanLimit) : ""}
                />
              </label>
              <label className="field">
                <span>Revenue window days (optional)</span>
                <input
                  className="input"
                  name="revenueWindowDays"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="30"
                  defaultValue={
                    revenueWindowDays ? String(revenueWindowDays) : ""
                  }
                />
              </label>
              <label className="field">
                <span>Failed webhook limit (optional)</span>
                <input
                  className="input"
                  name="failedLimit"
                  type="number"
                  min={1}
                  max={200}
                  placeholder="25"
                  defaultValue={failedLimit ? String(failedLimit) : ""}
                />
              </label>
              <div className="tier-actions">
                <button className="button secondary" type="submit">
                  Load health
                </button>
              </div>
            </form>
            {!guildId && (
              <p>Enter a guild ID to load health metrics.</p>
            )}
            {healthConfigError && (
              <div className="banner error">{healthConfigError}</div>
            )}
            {guildDiagnosticsError && (
              <div className="banner error">{guildDiagnosticsError}</div>
            )}
            {activeMemberCountsError && (
              <div className="banner error">{activeMemberCountsError}</div>
            )}
            {revenueIndicatorsError && (
              <div className="banner error">{revenueIndicatorsError}</div>
            )}
            {providerDiagnosticsError && (
              <div className="banner error">{providerDiagnosticsError}</div>
            )}
            {failedWebhookError && (
              <div className="banner error">{failedWebhookError}</div>
            )}
            {auditEventsError && (
              <div className="banner error">{auditEventsError}</div>
            )}
            {guildId && !healthConfigError && (
              <div className="snapshot-grid">
                <div className="snapshot-card">
                  <h3>Onboarding diagnostics</h3>
                  {guildDiagnostics ? (
                    <>
                      <div className="meta">
                        <span>
                          Checked: {formatTimestamp(guildDiagnostics.checkedAt)}
                        </span>
                        <span>Overall: {guildDiagnostics.overallStatus}</span>
                        {guildDiagnostics.botRoleId && (
                          <span>Bot role: {guildDiagnostics.botRoleId}</span>
                        )}
                      </div>
                      <ul className="audit-list">
                        <li className="audit-item">
                          <div className="audit-title">Permissions</div>
                          <div className="audit-meta">
                            <span>
                              {guildDiagnostics.permissionsOk
                                ? "OK"
                                : "Missing"}
                            </span>
                            {!guildDiagnostics.permissionsOk &&
                              guildDiagnostics.missingPermissions.length >
                                0 && (
                                <span>
                                  Missing:{" "}
                                  {guildDiagnostics.missingPermissions.join(
                                    ", "
                                  )}
                                </span>
                              )}
                          </div>
                        </li>
                        <li className="audit-item">
                          <div className="audit-title">Role hierarchy</div>
                          <div className="audit-meta">
                            <span>
                              {guildDiagnostics.roleHierarchyOk
                                ? "OK"
                                : "Blocked"}
                            </span>
                            {!guildDiagnostics.roleHierarchyOk &&
                              guildDiagnostics.blockedRoleIds.length > 0 && (
                                <span>
                                  Blocked roles:{" "}
                                  {guildDiagnostics.blockedRoleIds.join(", ")}
                                </span>
                              )}
                          </div>
                        </li>
                        <li className="audit-item">
                          <div className="audit-title">Roles present</div>
                          <div className="audit-meta">
                            <span>
                              {guildDiagnostics.rolesExistOk ? "OK" : "Missing"}
                            </span>
                            {!guildDiagnostics.rolesExistOk &&
                              guildDiagnostics.missingRoleIds.length > 0 && (
                                <span>
                                  Missing roles:{" "}
                                  {guildDiagnostics.missingRoleIds.join(", ")}
                                </span>
                              )}
                          </div>
                        </li>
                      </ul>
                      {guildDiagnostics.notes && (
                        <p>Notes: {guildDiagnostics.notes}</p>
                      )}
                    </>
                  ) : (
                    <p>Onboarding diagnostics are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Active members by tier</h3>
                  {activeMemberCounts ? (
                    activeMemberCounts.tiers.length === 0 ? (
                      <p>No tiers found for this guild.</p>
                    ) : (
                      <ul className="audit-list">
                        {activeMemberCounts.tiers.map((tier) => (
                          <li key={tier.tierId} className="audit-item">
                            <div className="audit-title">{tier.tierName}</div>
                            <div className="audit-meta">
                              <span>
                                Active members: {tier.activeMemberCount}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <p>Active member counts are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Revenue indicators</h3>
                  {revenueIndicators ? (
                    <>
                      <div className="meta">
                        <span>
                          Window: last {revenueIndicators.windowDays} days
                        </span>
                        <span>
                          From: {formatTimestamp(revenueIndicators.windowStart)}
                        </span>
                        <span>
                          Evaluated:{" "}
                          {formatTimestamp(revenueIndicators.evaluatedAt)}
                        </span>
                        <span>Scan limit: {revenueIndicators.scanLimit}</span>
                      </div>
                      <div className="meta">
                        <span>
                          Counts derived from provider events; not accounting.
                        </span>
                      </div>
                      <ul className="audit-list">
                        <li className="audit-item">
                          <div className="audit-title">Totals</div>
                          <div className="audit-meta">
                            <span>
                              Payments succeeded:{" "}
                              {revenueIndicators.totals.paymentSucceeded}
                            </span>
                            <span>
                              Payments failed:{" "}
                              {revenueIndicators.totals.paymentFailed}
                            </span>
                            <span>
                              Refunds: {revenueIndicators.totals.refunds}
                            </span>
                            <span>
                              Chargebacks opened:{" "}
                              {revenueIndicators.totals.chargebacksOpened}
                            </span>
                            <span>
                              Chargebacks closed:{" "}
                              {revenueIndicators.totals.chargebacksClosed}
                            </span>
                            <span>
                              Matched events:{" "}
                              {revenueIndicators.totals.matchedEvents}
                            </span>
                          </div>
                        </li>
                      </ul>
                      <ul className="audit-list">
                        {revenueIndicators.providers.map((provider) => (
                          <li key={provider.provider} className="audit-item">
                            <div className="audit-title">
                              {formatProviderLabel(provider.provider)}
                            </div>
                            <div className="audit-meta">
                              <span>
                                Payments succeeded: {provider.paymentSucceeded}
                              </span>
                              <span>
                                Payments failed: {provider.paymentFailed}
                              </span>
                              <span>Refunds: {provider.refunds}</span>
                              <span>
                                Chargebacks opened:{" "}
                                {provider.chargebacksOpened}
                              </span>
                              <span>
                                Chargebacks closed:{" "}
                                {provider.chargebacksClosed}
                              </span>
                              <span>Matched events: {provider.matchedEvents}</span>
                              <span>Scanned events: {provider.scannedEvents}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>Revenue indicators are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Latest provider events</h3>
                  {providerDiagnostics ? (
                    <>
                      <div className="meta">
                        <span>
                          Evaluated:{" "}
                          {formatTimestamp(providerDiagnostics.evaluatedAt)}
                        </span>
                        <span>Scan limit: {providerDiagnostics.scanLimit}</span>
                      </div>
                      <ul className="audit-list">
                        {providerDiagnostics.providers.map((entry) => {
                          const event = entry.event;
                          const eventTime =
                            event?.occurredAt ?? event?.receivedAt;
                          return (
                            <li key={entry.provider} className="audit-item">
                              <div className="audit-title">
                                {formatProviderLabel(entry.provider)}{" "}
                                {event
                                  ? `• ${event.normalizedEventType}`
                                  : "• No events"}
                              </div>
                              <div className="audit-meta">
                                <span>{formatMatchType(entry.matchType)}</span>
                                <span>
                                  Seen: {formatTimestamp(eventTime)}
                                </span>
                                {event?.processedStatus && (
                                  <span>
                                    Processed: {event.processedStatus}
                                  </span>
                                )}
                                {event?.lastError && (
                                  <span>Error: {event.lastError}</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p>Provider diagnostics are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Failed outbound webhooks</h3>
                  {failedWebhookDeliveries ? (
                    failedWebhookDeliveries.length === 0 ? (
                      <p>No failed deliveries for this guild.</p>
                    ) : (
                      <ul className="audit-list">
                        {failedWebhookDeliveries.map((delivery) => (
                          <li key={delivery._id} className="audit-item">
                            <div className="audit-title">
                              {delivery.eventType}
                            </div>
                            <div className="audit-meta">
                              <span>Endpoint: {delivery.endpointUrl}</span>
                              <span>Event: {delivery.eventId}</span>
                              <span>Attempts: {delivery.attempts}</span>
                              <span>
                                Last tried:{" "}
                                {formatTimestamp(delivery.lastAttemptedAt)}
                              </span>
                              <span>
                                Failed: {formatTimestamp(delivery.updatedAt)}
                              </span>
                              {delivery.lastError && (
                                <span>Error: {delivery.lastError}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <p>Failed deliveries are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Recent audit events</h3>
                  {auditEvents ? (
                    auditEvents.length === 0 ? (
                      <p>No recent audit events for this guild.</p>
                    ) : (
                      <ul className="audit-list">
                        {auditEvents.map((event) => (
                          <li key={event._id} className="audit-item">
                            <AuditEventContent event={event} />
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <p>Audit events are unavailable.</p>
                  )}
                </div>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Member lookup</h2>
            <p>
              Search for a member by Discord ID or username and load their
              entitlement timeline.
            </p>
            <form className="form" action="/admin" method="get">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  defaultValue={guildId ?? ""}
                  required
                />
              </label>
              <label className="field">
                <span>Search (Discord ID or username)</span>
                <input
                  className="input"
                  name="memberSearch"
                  placeholder="Search members"
                  defaultValue={memberSearch ?? ""}
                />
              </label>
              <div className="tier-actions">
                <button className="button secondary" type="submit">
                  Search members
                </button>
              </div>
            </form>
            {memberSearchError && (
              <div className="banner error">{memberSearchError}</div>
            )}
            {memberSearchResults && (
              <>
                {memberSearchResults.length === 0 ? (
                  <p>No members found for that search.</p>
                ) : (
                  <ul className="result-list">
                    {memberSearchResults.map((member) => {
                      const detailParams = new URLSearchParams();
                      if (guildId) {
                        detailParams.set("guildId", guildId);
                      }
                      detailParams.set("memberId", member.discordUserId);
                      if (memberSearch) {
                        detailParams.set("memberSearch", memberSearch);
                      }
                      const detailHref = `/admin?${detailParams.toString()}`;
                      return (
                        <li key={member._id} className="result-item">
                          <div className="result-meta">
                            <strong>
                              {member.discordUsername ?? "Unknown user"}
                            </strong>
                            <span>ID: {member.discordUserId}</span>
                            <span>
                              Updated: {formatTimestamp(member.updatedAt)}
                            </span>
                          </div>
                          <Link className="button secondary" href={detailHref}>
                            View snapshot
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
          <section className="panel">
            <h2>Member snapshot</h2>
            <p>
              Load entitlement grants and audit events for a single Discord user
              id.
            </p>
            <form className="form" action="/admin" method="get">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  defaultValue={guildId ?? ""}
                  required
                />
              </label>
              <label className="field">
                <span>Discord User ID</span>
                <input
                  className="input"
                  name="memberId"
                  placeholder="112233445566778899"
                  defaultValue={memberId ?? ""}
                  required
                />
              </label>
              <div className="tier-actions">
                <button className="button secondary" type="submit">
                  Load snapshot
                </button>
              </div>
            </form>
            {memberSnapshotError && (
              <div className="banner error">{memberSnapshotError}</div>
            )}
            {roleSyncError && (
              <div className="banner error">{roleSyncError}</div>
            )}
            {memberSnapshot && (
              <div className="snapshot-grid">
                <div className="snapshot-card">
                  <h3>Identity</h3>
                  <div className="snapshot-meta">
                    <span>
                      Username:{" "}
                      <strong>
                        {memberSnapshot.memberIdentity?.discordUsername ??
                          "Unknown"}
                      </strong>
                    </span>
                    <span>
                      Discord ID:{" "}
                      {memberSnapshot.memberIdentity?.discordUserId ?? memberId}
                    </span>
                    <span>
                      Linked:{" "}
                      {formatTimestamp(
                        memberSnapshot.memberIdentity?.createdAt
                      )}
                    </span>
                    <span>
                      Updated:{" "}
                      {formatTimestamp(
                        memberSnapshot.memberIdentity?.updatedAt
                      )}
                    </span>
                  </div>
                </div>
                <div className="snapshot-card">
                  <h3>Entitlement grants</h3>
                  {memberSnapshot.grants.length === 0 ? (
                    <p>No entitlement grants found.</p>
                  ) : (
                    <ul className="audit-list">
                      {memberSnapshot.grants.map((grant) => (
                        <li key={grant._id} className="audit-item">
                          <div className="audit-title">
                            {grant.tier?.name ?? "Unknown tier"}
                          </div>
                          <div className="audit-meta">
                            <span>Status: {grant.status}</span>
                            <span>Source: {grant.source}</span>
                            <span>Valid from: {formatTimestamp(grant.validFrom)}</span>
                            <span>
                              Valid through: {formatTimestamp(grant.validThrough)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Audit timeline</h3>
                  {memberSnapshot.auditEvents.length === 0 ? (
                    <p>No audit events found.</p>
                  ) : (
                    <ul className="audit-list">
                      {memberSnapshot.auditEvents.map((event) => (
                        <li key={event._id} className="audit-item">
                          <AuditEventContent event={event} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Role sync history</h3>
                  {roleSyncRequests ? (
                    roleSyncRequests.length === 0 ? (
                      <p>No role sync requests found.</p>
                    ) : (
                      <ul className="audit-list">
                        {roleSyncRequests.map((request) => (
                          <li key={request._id} className="audit-item">
                            <div className="audit-title">
                              {request.scope === "guild" ? "Guild sync" : "User sync"} •{" "}
                              {request.status}
                            </div>
                            <div className="audit-meta">
                              <span>
                                Requested: {formatTimestamp(request.requestedAt)}
                              </span>
                              <span>
                                Updated: {formatTimestamp(request.updatedAt)}
                              </span>
                              {request.completedAt && (
                                <span>
                                  Completed: {formatTimestamp(request.completedAt)}
                                </span>
                              )}
                              <span>
                                Requested by: {request.requestedByActorType ?? "system"}
                                {request.requestedByActorId
                                  ? ` (${request.requestedByActorId})`
                                  : ""}
                              </span>
                              {request.reason && (
                                <span>Reason: {request.reason}</span>
                              )}
                              {request.lastError && (
                                <span>Error: {request.lastError}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <p>Role sync history is unavailable.</p>
                  )}
                </div>
              </div>
            )}
          </section>
          <p style={{ marginTop: 24 }}>
            <Link className="button secondary" href="/api/auth/logout">
              Sign out
            </Link>
          </p>
        </>
      ) : (
        <>
          {authEnabled ? (
            <>
              <p>Connect Discord to continue.</p>
              <p style={{ marginTop: 24 }}>
                <Link className="button" href="/api/auth/discord">
                  Sign in with Discord
                </Link>
              </p>
            </>
          ) : (
            <p>Set PERKCORD_SESSION_SECRET to enable admin login.</p>
          )}
        </>
      )}
      <p style={{ marginTop: 32 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
